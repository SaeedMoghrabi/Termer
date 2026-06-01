const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const DATA_DIR = path.join(__dirname, "..", "data", "catalogs");
const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();
const CURRENT_MONTH = NOW.getUTCMonth() + 1;

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const TERM_MONTH_MAP = {
  spring: [1, 2, 3, 4, 5],
  summer: [6, 7, 8],
  fall: [9, 10, 11, 12],
  winter: [1],
};
const TERM_ORDER = {
  spring: 0,
  summer: 1,
  fall: 2,
  winter: 3,
};

function getAcademicYearStart(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return month >= 8 ? year : year - 1;
}

function buildAcademicCatalogTerm(label = "Public course directory", options = {}) {
  const { codePrefix = "catalog", date = new Date() } = options;
  const startYear = getAcademicYearStart(date);
  const endYear = startYear + 1;

  return {
    code: `${codePrefix}-${startYear}-${endYear}`,
    description: `${label} ${startYear}-${endYear}`,
    is_current: true,
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function logStep(label, detail = "") {
  const suffix = detail ? `: ${detail}` : "";
  console.log(`[catalogs] ${label}${suffix}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function htmlDecode(value = "") {
  const entities = {
    amp: "&",
    apos: "'",
    nbsp: " ",
    quot: '"',
    lt: "<",
    gt: ">",
    eacute: "e",
    Eacute: "E",
    egrave: "e",
    ecirc: "e",
    agrave: "a",
    aacute: "a",
    ugrave: "u",
    ocirc: "o",
  };

  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const raw = isHex ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(raw, isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return entities[entity] ?? match;
  });
}

function normalizeWhitespace(value = "") {
  return htmlDecode(String(value))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return normalizeWhitespace(String(value).replace(/<[^>]*>/g, " "));
}

function slugify(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function professorIdFor(universityId, fullName = "") {
  const slug = slugify(fullName) || "tba";
  return `${universityId}__${slug}`;
}

function requestText(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body = "",
    rejectUnauthorized = true,
    timeoutMs = 120000,
  } = options;

  return new Promise((resolve, reject) => {
    const transport = String(url).trim().toLowerCase().startsWith("http://") ? http : https;
    const request = transport.request(
      url,
      {
        method,
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
        rejectUnauthorized,
        timeout: timeoutMs,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text,
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });
    request.on("error", reject);

    if (body) request.write(body);
    request.end();
  });
}

function requestBuffer(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body = "",
    rejectUnauthorized = true,
    timeoutMs = 120000,
  } = options;

  return new Promise((resolve, reject) => {
    const transport = String(url).trim().toLowerCase().startsWith("http://") ? http : https;
    const request = transport.request(
      url,
      {
        method,
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
        rejectUnauthorized,
        timeout: timeoutMs,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            buffer: Buffer.concat(chunks),
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });
    request.on("error", reject);

    if (body) request.write(body);
    request.end();
  });
}

async function requestJson(url, options = {}) {
  const response = await requestText(url, options);
  return {
    ...response,
    json: JSON.parse(response.text),
  };
}

function parseSeason(description = "") {
  const lower = description.toLowerCase();
  if (lower.includes("spring")) return "spring";
  if (lower.includes("summer")) return "summer";
  if (lower.includes("fall")) return "fall";
  if (lower.includes("winter")) return "winter";
  return null;
}

function extractEffectiveYear(description = "") {
  const matches = [...String(description).matchAll(/20\d{2}/g)].map((match) => Number(match[0]));
  if (!matches.length) return null;

  const season = parseSeason(description);
  if (season === "fall") return matches[0];
  return matches[matches.length - 1];
}

function getCurrentAcademicSeason(month = CURRENT_MONTH) {
  if (TERM_MONTH_MAP.spring.includes(month)) return "spring";
  if (TERM_MONTH_MAP.summer.includes(month)) return "summer";
  if (TERM_MONTH_MAP.fall.includes(month)) return "fall";
  return "spring";
}

function getTermPosition(term = {}) {
  const season = parseSeason(term.description);
  const year = extractEffectiveYear(term.description);
  const seasonOrder = season ? TERM_ORDER[season] : undefined;

  if (!season || !Number.isFinite(year) || seasonOrder === undefined) {
    return Number.NEGATIVE_INFINITY;
  }

  return (year * 10) + seasonOrder;
}

function compareTermsAscending(left, right) {
  const leftPosition = getTermPosition(left);
  const rightPosition = getTermPosition(right);

  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }

  return String(left.code).localeCompare(String(right.code));
}

function chooseCurrentTerm(terms, predicate = () => true) {
  const eligible = terms.filter(predicate);
  if (!eligible.length) {
    throw new Error("No eligible terms were found.");
  }

  const exactMatch = eligible.find((term) => {
    const season = parseSeason(term.description);
    const year = extractEffectiveYear(term.description);
    return season && TERM_MONTH_MAP[season]?.includes(CURRENT_MONTH) && year === CURRENT_YEAR;
  });

  if (exactMatch) return exactMatch;

  const sorted = [...eligible].sort((left, right) =>
    String(right.code).localeCompare(String(left.code)),
  );
  return sorted[0];
}

function chooseRelevantTerms(terms, predicate = () => true, options = {}) {
  const { limit = 4 } = options;
  const eligible = dedupeBy(terms.filter(predicate), (term) => String(term.code));

  if (!eligible.length) {
    throw new Error("No eligible terms were found.");
  }

  const currentSeason = getCurrentAcademicSeason();
  const minimumPosition = (CURRENT_YEAR * 10) + TERM_ORDER[currentSeason];
  const sorted = [...eligible].sort(compareTermsAscending);
  const upcoming = sorted.filter((term) => getTermPosition(term) >= minimumPosition);

  if (upcoming.length) {
    return upcoming.slice(0, limit);
  }

  const currentTerm = chooseCurrentTerm(eligible, () => true);
  const currentPosition = getTermPosition(currentTerm);

  return sorted
    .filter((term) => getTermPosition(term) >= currentPosition)
    .slice(0, limit);
}

function to24HourString(hours, minutes = 0) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeDigitsTime(rawValue = "") {
  const digits = String(rawValue).replace(/\D/g, "");
  if (digits.length === 3) {
    return `0${digits[0]}:${digits.slice(1)}`;
  }
  if (digits.length === 4) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
  return null;
}

function to24HourFromMeridian(rawValue = "") {
  const match = String(rawValue)
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridian = match[3].toLowerCase();

  if (meridian === "pm" && hours !== 12) hours += 12;
  if (meridian === "am" && hours === 12) hours = 0;

  return to24HourString(hours, minutes);
}

function normalizeMeridianRange(rawValue = "") {
  const [left = "", right = ""] = String(rawValue).split("-").map((item) => item.trim());
  const start = to24HourFromMeridian(left);
  const end = to24HourFromMeridian(right);
  if (!start || !end) return "TBA";
  return `${start} - ${end}`;
}

function heuristicTimeTokenTo24Hour(rawValue = "") {
  const match = String(rawValue).trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (hours < 8) hours += 12;

  return { hours, minutes };
}

function normalizeHeuristicRange(rawValue = "") {
  const [left = "", right = ""] = String(rawValue).split("-").map((item) => item.trim());
  const start = heuristicTimeTokenTo24Hour(left);
  const end = heuristicTimeTokenTo24Hour(right);

  if (!start || !end) return "TBA";

  if (
    end.hours < start.hours
    || (end.hours === start.hours && end.minutes <= start.minutes)
  ) {
    if (end.hours < 12) {
      end.hours += 12;
    }
  }

  return `${to24HourString(start.hours, start.minutes)} - ${to24HourString(end.hours, end.minutes)}`;
}

function parseCompactDays(rawValue = "") {
  const compact = normalizeWhitespace(rawValue).toUpperCase().replace(/\./g, "");
  if (!compact || compact === "TBA") return "TBA";

  const days = [];
  let index = 0;

  while (index < compact.length) {
    if (compact.startsWith("TH", index)) {
      days.push("R");
      index += 2;
      continue;
    }

    const token = compact[index];
    if ("MTWRFS".includes(token)) {
      days.push(token);
    }
    index += 1;
  }

  return days.length ? days.join(" ") : "TBA";
}

function splitCourseCode(rawValue = "") {
  const normalized = normalizeWhitespace(rawValue).replace(/\s+/g, " ");
  const match = normalized.match(/^([A-Z]+)\s*([A-Z0-9]+)$/i);
  if (!match) {
    return { department: normalized.toUpperCase(), courseNumber: "" };
  }

  return {
    department: match[1].toUpperCase(),
    courseNumber: match[2].toUpperCase(),
  };
}

function dedupeBy(items, getKey) {
  const seen = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

function buildProfessorList(courses) {
  return dedupeBy(
    courses
      .filter((course) =>
        course.professor_id
        && course.instructor
        && !/^tba$/i.test(String(course.instructor).trim()))
      .map((course) => ({
        id: course.professor_id,
        full_name: course.instructor,
      })),
    (professor) => professor.id,
  );
}

function buildCatalogPayload({ availability, message, terms, courses, professors = [], sources }) {
  const courseCountsByTerm = courses.reduce((counts, course) => {
    const termCode = String(course?.term_code ?? "");
    if (!termCode) return counts;
    counts[termCode] = (counts[termCode] ?? 0) + 1;
    return counts;
  }, {});
  const mergedProfessors = dedupeBy(
    [...buildProfessorList(courses), ...professors]
      .map((professor) => ({
        id: String(professor?.id ?? "").trim(),
        full_name: normalizeWhitespace(professor?.full_name ?? ""),
      }))
      .filter((professor) =>
        professor.id
        && professor.full_name
        && !/^tba$/i.test(professor.full_name)),
    (professor) => professor.id,
  ).sort((a, b) => a.full_name.localeCompare(b.full_name));

  return {
    updatedAt: new Date().toISOString(),
    availability,
    message,
    terms: terms.map((term) => ({
      ...term,
      course_count: courseCountsByTerm[String(term?.code ?? "")] ?? Number(term?.course_count ?? 0),
    })),
    courses,
    professors: mergedProfessors,
    sources,
  };
}

function writeCatalog(universityId, payload) {
  ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, `${universityId}.json`);
  const backupPath = path.join(DATA_DIR, `${universityId}.backup.json`);
  const tempPath = `${filePath}.tmp`;
  const serialized = JSON.stringify(payload, null, 2);

  fs.writeFileSync(tempPath, serialized);
  fs.renameSync(tempPath, filePath);
  fs.writeFileSync(backupPath, serialized);
  logStep("wrote catalog", `${universityId} -> ${filePath}`);
}

function buildUnavailableCatalog(message, sourceUrl, availability = "unavailable") {
  return buildCatalogPayload({
    availability,
    message,
    terms: [],
    courses: [],
    sources: [sourceUrl].filter(Boolean),
  });
}

function normalizeNameKey(rawValue = "") {
  return normalizeWhitespace(rawValue)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameVariants(rawValue = "") {
  const value = normalizeWhitespace(rawValue);
  if (!value) return [];

  const variants = new Set();
  variants.add(normalizeNameKey(value));

  if (value.includes(",")) {
    const parts = value.split(",").map((part) => normalizeWhitespace(part)).filter(Boolean);
    if (parts.length >= 2) {
      variants.add(normalizeNameKey(`${parts.slice(1).join(" ")} ${parts[0]}`));
    }
  } else {
    const tokens = value.split(" ").filter(Boolean);
    if (tokens.length >= 2) {
      variants.add(normalizeNameKey(`${tokens[tokens.length - 1]}, ${tokens.slice(0, -1).join(" ")}`));
    }
  }

  return [...variants];
}

function resolveProfessorId(universityId, instructor, legacyProfessorMap = new Map()) {
  if (universityId === "aub" && legacyProfessorMap.size) {
    for (const variant of buildNameVariants(instructor)) {
      if (legacyProfessorMap.has(variant)) {
        return legacyProfessorMap.get(variant);
      }
    }
  }

  return professorIdFor(universityId, instructor);
}

module.exports = {
  buildAcademicCatalogTerm,
  CURRENT_MONTH,
  CURRENT_YEAR,
  DATA_DIR,
  buildCatalogPayload,
  buildNameVariants,
  buildUnavailableCatalog,
  chooseCurrentTerm,
  chooseRelevantTerms,
  dedupeBy,
  ensureDir,
  extractEffectiveYear,
  htmlDecode,
  logStep,
  normalizeDigitsTime,
  normalizeHeuristicRange,
  normalizeMeridianRange,
  normalizeNameKey,
  normalizeWhitespace,
  parseCompactDays,
  parseSeason,
  professorIdFor,
  requestBuffer,
  requestJson,
  requestText,
  resolveProfessorId,
  sleep,
  slugify,
  splitCourseCode,
  stripTags,
  writeCatalog,
};
