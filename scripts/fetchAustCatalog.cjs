const { PDFParse } = require("pdf-parse");
const {
  buildAcademicCatalogTerm,
  dedupeBy,
  logStep,
  normalizeHeuristicRange,
  normalizeMeridianRange,
  normalizeWhitespace,
  parseCompactDays,
  professorIdFor,
  requestText,
  requestJson,
} = require("./catalogUtils.cjs");

const AUST_API_ROOT = "https://api.aust.edu.lb/api";
const SECTION_CONCURRENCY = 8;
const AUST_PUBLIC_OFFERING_URL = "https://foe.aust.edu.lb/administrative/reg.php";
const AUST_SUGGEST_URL = "https://foe.aust.edu.lb/administrative/suggest_courses.php";
const AUST_SCHEDULE_CONCURRENCY = 6;

const AUST_SEQUENCE_PDFS = [
  {
    label: "Accounting",
    url: "https://api.aust.edu.lb/content/uploads/files/028~Sequence-of-Courses-ACC.pdf",
  },
  {
    label: "Economics",
    url: "https://api.aust.edu.lb/content/uploads/files/Sequence-of-Courses-ECO.pdf",
  },
  {
    label: "Finance",
    url: "https://api.aust.edu.lb/content/uploads/files/Sequence-of-Courses-FIN.pdf",
  },
  {
    label: "Hospitality Management",
    url: "https://api.aust.edu.lb/content/uploads/files/HPM_SequenceOfCourses.pdf",
  },
  {
    label: "International Business Management",
    url: "https://api.aust.edu.lb/content/uploads/files/IBM_SequenceOfCourses.pdf",
  },
  {
    label: "Human Resource Management",
    url: "https://api.aust.edu.lb/content/uploads/files/HRM_SequenceOfCourses.pdf",
  },
  {
    label: "Management",
    url: "https://api.aust.edu.lb/content/uploads/files/Sequence-of-Courses-MGT.pdf",
  },
  {
    label: "Management Information Systems",
    url: "https://api.aust.edu.lb/content/uploads/files/MIS_SequenceofCourses.pdf",
  },
];

const AUST_PROGRAM_PAGES = [
  {
    label: "Computer Science",
    urlTitle: "bs-in-computer-science-107-crhr",
  },
  {
    label: "Information & Communications Technology",
    urlTitle: "bs-in-information-communications-technology-106-crhr",
  },
  {
    label: "Computer & Communications Engineering",
    urlTitle: "bs-in-computer-communications-engineering-118-crhr",
  },
  {
    label: "Computer & Communications Engineering Track: Biomedical Engineering",
    urlTitle: "bs-in-computer-communications-engineering-track-biomedical-engineering-118-crhr",
  },
  {
    label: "Mechatronics Engineering",
    urlTitle: "bs-in-mechatronics-engineering-116-crhr",
  },
  {
    label: "Optics & Optometry",
    urlTitle: "bs-in-optics-optometry-120-crhr",
  },
  {
    label: "Biotechnology Track DNA Technology",
    urlTitle: "ms-in-biotechnology-track-dna-technology-36-crhr",
  },
  {
    label: "Biotechnology Track Forensic Science",
    urlTitle: "ms-in-biotechnology-track-forensic-science-36-crhr",
  },
  {
    label: "Graphic Design",
    urlTitle: "ba-in-graphic-design-105-crhr",
  },
  {
    label: "Interior Design",
    urlTitle: "ba-in-interior-design-105-crhr",
  },
  {
    label: "Accounting",
    urlTitle: "bs-in-accounting-105-crhr",
  },
  {
    label: "Economics",
    urlTitle: "bs-in-economics-105-crhr",
  },
  {
    label: "Finance",
    urlTitle: "bs-in-finance-105-crhr",
  },
  {
    label: "Business Management",
    urlTitle: "bs-in-business-management-105-crhr",
  },
  {
    label: "Business Management Track International Business",
    urlTitle: "bs-in-business-management-track-international-business-105-crhr",
  },
  {
    label: "Business Management Track Human Resources Management",
    urlTitle: "bs-in-business-management-track-human-resources-management-105-cr-hr",
  },
  {
    label: "Management Information Systems",
    urlTitle: "bs-in-management-information-systems-105-crhr",
  },
  {
    label: "Business Marketing",
    urlTitle: "bs-in-business-marketing-105-crhr",
  },
  {
    label: "Business Marketing Track Digital Marketing",
    urlTitle: "bs-in-business-marketing-track-digital-marketing-105-crhr",
  },
  {
    label: "Hospitality Management",
    urlTitle: "bs-in-hospitality-management-105-crhr",
  },
];

const DEFAULT_AUST_CAMPUSES = [
  "Ashrafieh Eng",
  "Ashrafieh Fr",
  "Ashrafieh FrGr",
  "Ashrafieh Gr",
  "Sidon Eng",
  "Sidon Fr",
  "Sidon Gr",
  "Zahle Eng",
  "Zahle Gr",
];

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

function extractAustProgramTitle(text, fallbackLabel) {
  const match = String(text).match(/AUST,\s*([^\n]+?)\s*Sequence of Courses/i);
  return normalizeWhitespace(match?.[1] || fallbackLabel);
}

function extractAustCourseCode(value = "") {
  const match = normalizeWhitespace(value).match(/^([A-Z]{2,4})\s*([0-9]{3}[A-Z]?)(?:\s*([A-Z]))?$/i);
  if (!match) return null;
  const department = normalizeWhitespace(match[1]).toUpperCase();
  const courseNumber = `${match[2]}${match[3] || ""}`.toUpperCase();
  return {
    department,
    courseNumber,
    rawCode: `${department} ${courseNumber}`,
  };
}

function buildAustOfferingTerm() {
  const term = buildAcademicCatalogTerm("Current public offering", {
    codePrefix: "public",
  });

  return {
    ...term,
    is_current: true,
  };
}

function campusSlug(value = "") {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function detectAustSectionType(code = "", title = "") {
  const normalizedCode = normalizeWhitespace(code).toUpperCase();
  const normalizedTitle = normalizeWhitespace(title).toLowerCase();
  if (/[LP]$/.test(normalizedCode) || /\blab\b/.test(normalizedTitle)) return "Laboratory";
  if (/practic|studio|workshop/.test(normalizedTitle)) return "Practicum";
  return "Lecture";
}

function normalizeAustDays(rawValue = "") {
  const tokens = [...String(rawValue).toUpperCase().matchAll(/TH|M|T|W|F|S/g)].map((match) =>
    match[0] === "TH" ? "R" : match[0]);
  if (!tokens.length) {
    return parseCompactDays(rawValue);
  }
  return dedupeBy(tokens, (value) => value).join(" ");
}

function normalizeAustTimeRange(rawValue = "") {
  const normalized = normalizeWhitespace(rawValue);
  if (!normalized || /^tba$/i.test(normalized)) return "TBA";
  if (/\b(am|pm)\b/i.test(normalized)) {
    const [leftRaw = "", rightRaw = ""] = normalized.split("-").map((item) => normalizeWhitespace(item));
    const leftHasMeridian = /\b(am|pm)\b/i.test(leftRaw);
    const rightHasMeridian = /\b(am|pm)\b/i.test(rightRaw);
    const leftToken = leftRaw.match(/^(\d{1,2})(?::(\d{2}))?/);
    const rightMeridian = rightRaw.match(/\b(am|pm)\b/i)?.[1]?.toLowerCase();

    if (!leftHasMeridian && rightHasMeridian && leftToken) {
      const leftHour = Number.parseInt(leftToken[1], 10);
      const leftMinute = Number.parseInt(leftToken[2] || "0", 10);
      const buildCandidateRange = (meridian) =>
        normalizeMeridianRange(
          `${leftToken[1]}:${String(leftMinute).padStart(2, "0")} ${meridian}-${rightRaw}`.replace(/\s*-\s*/g, "-"),
        );
      const rangeMinutes = (value) => {
        const [start = "", end = ""] = String(value).split(" - ").map((item) => normalizeWhitespace(item));
        const parseMinutes = (token) => {
          const match = token.match(/^(\d{2}):(\d{2})$/);
          if (!match) return null;
          return (Number.parseInt(match[1], 10) * 60) + Number.parseInt(match[2], 10);
        };
        const startMinutes = parseMinutes(start);
        const endMinutes = parseMinutes(end);
        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return Number.POSITIVE_INFINITY;
        return endMinutes - startMinutes;
      };

      const candidateSame = buildCandidateRange(rightMeridian);
      const candidateAlternate = rightMeridian === "pm" ? buildCandidateRange("am") : "TBA";
      const candidates = [candidateSame, candidateAlternate]
        .filter((candidate) => candidate && candidate !== "TBA")
        .map((candidate) => ({
          value: candidate,
          minutes: rangeMinutes(candidate),
        }))
        .filter((candidate) => Number.isFinite(candidate.minutes) && candidate.minutes > 0);

      if (candidates.length) {
        if (leftHour === 12 && rightMeridian === "pm") {
          const noonCandidate = candidates.find((candidate) => candidate.value === candidateSame);
          if (noonCandidate) return noonCandidate.value;
        }

        const practical = candidates
          .filter((candidate) => candidate.minutes <= 240)
          .sort((left, right) => left.minutes - right.minutes);
        if (practical.length) {
          return practical[0].value;
        }

        candidates.sort((left, right) => left.minutes - right.minutes);
        return candidates[0].value;
      }
    }

    if (leftHasMeridian || rightHasMeridian) {
      const repaired = [leftRaw, rightRaw].filter(Boolean).join(" - ");
      return normalizeMeridianRange(repaired.replace(/\s*-\s*/g, "-"));
    }
  }
  return normalizeHeuristicRange(normalized);
}

function parseAustCompositeCodes(rawValue = "") {
  const aliases = String(rawValue)
    .split("/")
    .map((entry) => normalizeWhitespace(entry).replace(/\*+$/g, ""))
    .filter(Boolean)
    .map((entry) => extractAustCourseCode(entry))
    .filter((entry) => entry && entry.department && entry.courseNumber);

  return dedupeBy(
    aliases.map((entry) => ({
      ...entry,
      rawCode: `${entry.department} ${entry.courseNumber}`,
    })),
    (entry) => entry.rawCode,
  );
}

function stripAustHtmlCell(value = "") {
  return normalizeWhitespace(String(value).replace(/<[^>]*>/g, " "));
}

function parseAustCombinationRows(html = "") {
  const tables = [...String(html).matchAll(/<table id="valid-combination-\d+">([\s\S]*?)<\/table>/gi)];
  const rows = [];

  for (const table of tables) {
    const rowMatches = [...table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
    for (const rowMatch of rowMatches.slice(1)) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
        stripAustHtmlCell(match[1]));
      if (cells.length < 11) continue;
      if (/^total$/i.test(cells[0])) continue;
      rows.push({
        rawCode: cells[0],
        title: cells[1],
        credits: Number.parseFloat(cells[2]) || 0,
        section: cells[3],
        days: normalizeAustDays(cells[4]),
        time: normalizeAustTimeRange(cells[5]),
        capacity: Number.parseInt(cells[6], 10) || 0,
        ashrafiehValue: Number.parseInt(cells[7], 10) || 0,
        sidonValue: Number.parseInt(cells[8], 10) || 0,
        zahleValue: Number.parseInt(cells[9], 10) || 0,
        instructor: cells[10] || "TBA",
      });
    }
  }

  return rows;
}

function extractAustCampusOptions(html = "") {
  const selectMatch = String(html).match(/<select[^>]+name="campus"[^>]*>([\s\S]*?)<\/select>/i);
  if (!selectMatch) return DEFAULT_AUST_CAMPUSES;
  const options = [...selectMatch[1].matchAll(/<option[^>]+value="([^"]+)"[^>]*>/gi)]
    .map((match) => normalizeWhitespace(match[1]))
    .filter(Boolean);
  return options.length ? options : DEFAULT_AUST_CAMPUSES;
}

async function fetchAustSuggestions(query) {
  const response = await requestText(`${AUST_SUGGEST_URL}?q=${encodeURIComponent(query)}`, {
    timeoutMs: 45000,
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status < 200 || response.status >= 400) {
    throw new Error(`AUST suggest endpoint returned ${response.status}`);
  }

  let parsed = [];
  try {
    parsed = JSON.parse(response.text);
  } catch (error) {
    throw new Error(`AUST suggest endpoint returned invalid JSON: ${error.message}`);
  }

  return dedupeBy(
    parsed
      .map((value) => normalizeWhitespace(value).replace(/\*+$/g, ""))
      .filter(Boolean),
    (value) => value.toLowerCase(),
  );
}

async function fetchAustOfferingHtml(courseCode, campus) {
  const body = new URLSearchParams({
    time_pref: "any",
    campus,
  });
  body.append("courses[]", courseCode);

  const response = await requestText(AUST_PUBLIC_OFFERING_URL, {
    method: "POST",
    timeoutMs: 60000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: AUST_PUBLIC_OFFERING_URL,
      Origin: "https://foe.aust.edu.lb",
    },
    body: body.toString(),
  });

  if (response.status < 200 || response.status >= 400) {
    throw new Error(`AUST offering page returned ${response.status}`);
  }

  return response.text;
}

function buildAustOfferingCourses({
  row,
  aliases,
  campus,
  termCode,
}) {
  const type = detectAustSectionType(aliases[0]?.rawCode || row.rawCode, row.title);
  const selectedCampusSeats = campus.includes("Sidon")
    ? row.sidonValue
    : campus.includes("Zahle")
      ? row.zahleValue
      : row.ashrafiehValue;
  const capacity = Number.isFinite(row.capacity) ? row.capacity : 0;
  const enrolledCount = capacity > 0 && selectedCampusSeats >= 0 && selectedCampusSeats <= capacity
    ? Math.max(0, capacity - selectedCampusSeats)
    : 0;
  const location = campus;

  return aliases.map((alias) => ({
    id: `aust:${termCode}:${campusSlug(campus)}:${alias.department}-${alias.courseNumber}-${row.section}`,
    term_code: termCode,
    crn: `AUST-${campusSlug(campus).toUpperCase()}-${alias.department}${alias.courseNumber}-${row.section}`,
    code: alias.rawCode,
    department: alias.department,
    course_number: alias.courseNumber,
    section: row.section || "A",
    title: row.title || alias.rawCode,
    credits: row.credits || 0,
    instructor: row.instructor || "TBA",
    professor_id: professorIdFor("aust", row.instructor || "TBA"),
    campus,
    schedule: {
      days: row.days || "TBA",
      time: row.time || "TBA",
      location,
      section: row.section || "A",
      type,
    },
    capacity,
    enrolled_count: enrolledCount,
    prerequisites: null,
    attributes: [`Current public offering`, campus].filter(Boolean),
    source_url: AUST_PUBLIC_OFFERING_URL,
  }));
}

async function fetchAustTimedOfferings(departmentQueries, termCode) {
  const landing = await requestText(AUST_PUBLIC_OFFERING_URL, { timeoutMs: 45000 });
  const campuses = extractAustCampusOptions(landing.text);

  const suggestionLists = await mapWithConcurrency(
    departmentQueries,
    SECTION_CONCURRENCY,
    async (query) => {
      try {
        const suggestions = await fetchAustSuggestions(query);
        logStep("aust suggest", `${query} -> ${suggestions.length} offered aliases`);
        return suggestions;
      } catch (error) {
        logStep("aust suggest failed", `${query} -> ${error.message}`);
        return [];
      }
    },
  );

  const offeredAliases = dedupeBy(
    suggestionLists.flat(),
    (value) => value.toLowerCase(),
  );

  const timedCourses = [];
  await mapWithConcurrency(
    offeredAliases,
    AUST_SCHEDULE_CONCURRENCY,
    async (offeredAlias, index) => {
      const aliases = parseAustCompositeCodes(offeredAlias);
      if (!aliases.length) return;

      for (const campus of campuses) {
        try {
          const html = await fetchAustOfferingHtml(offeredAlias, campus);
          const rows = parseAustCombinationRows(html);
          if (!rows.length) continue;

          rows.forEach((row) => {
            timedCourses.push(...buildAustOfferingCourses({
              row,
              aliases,
              campus,
              termCode,
            }));
          });
        } catch (error) {
          logStep("aust offering failed", `${offeredAlias} @ ${campus} -> ${error.message}`);
        }
      }

      if ((index + 1) % 25 === 0 || index === offeredAliases.length - 1) {
        logStep("aust offering progress", `${index + 1}/${offeredAliases.length}`);
      }
    },
  );

  return {
    campuses,
    courses: dedupeBy(
      timedCourses,
      (course) => `${course.code}:${course.section}:${course.campus}:${course.schedule.days}:${course.schedule.time}`,
    ),
  };
}

function extractAustCourseCodes(text) {
  const normalizedText = normalizeWhitespace(String(text).replace(/\r/g, "\n"));
  const matches = normalizedText.matchAll(/\b([A-Z]{2,4})\s*([0-9]{3}[A-Z]?)(?:\s*([A-Z]))?\b/g);
  const courseCodes = [];

  for (const match of matches) {
    const department = normalizeWhitespace(match[1]).toUpperCase();
    const rawNumber = `${match[2]}${match[3] || ""}`.toUpperCase();
    if (!department || !rawNumber) continue;
    courseCodes.push({
      department,
      courseNumber: rawNumber,
      rawCode: `${department} ${rawNumber}`,
    });
  }

  return dedupeBy(courseCodes, (course) => course.rawCode);
}

function buildAustCatalogCourse({ course, termCode, programTitle, sourceUrl }) {
  return {
    id: `aust:${termCode}:${course.department}-${course.courseNumber}`,
    term_code: termCode,
    crn: `AUST-${course.department}${course.courseNumber}`,
    code: course.rawCode,
    department: course.department,
    course_number: course.courseNumber,
    section: "CAT",
    title: course.rawCode,
    credits: 0,
    instructor: "TBA",
    professor_id: professorIdFor("aust", "TBA"),
    campus: "Multiple Campuses",
    schedule: {
      days: "TBA",
      time: "TBA",
      location: "TBA",
      section: "CAT",
      type: "Catalog",
    },
    capacity: 0,
    enrolled_count: 0,
    prerequisites: null,
    attributes: [programTitle].filter(Boolean),
    source_url: sourceUrl,
  };
}

async function fetchAustProgramCourses(source, termCode) {
  const parser = new PDFParse({ url: source.url });
  try {
    const result = await parser.getText();
    const programTitle = extractAustProgramTitle(result.text, source.label);
    const courseCodes = extractAustCourseCodes(result.text);

    const courses = courseCodes.map((course) =>
      buildAustCatalogCourse({
        course,
        termCode,
        programTitle,
        sourceUrl: source.url,
      }));

    logStep("aust program", `${source.label} -> ${courses.length} courses`);
    return courses;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function fetchAustProgramPageCourses(source, termCode) {
  const pageUrl = `${AUST_API_ROOT}/CorporatePages/GetPageDataByTitle?imgsize=&hasDynamicCorporatePageSections=true&title=${encodeURIComponent(source.urlTitle)}`;
  const page = (await requestJson(pageUrl, { timeoutMs: 45000 })).json;
  const programTitle = normalizeWhitespace(page?.title || source.label);
  const sectionIds = (page?.corporatePageSections || [])
    .map((section) => section?.id)
    .filter(Boolean);

  const courses = [];
  await mapWithConcurrency(sectionIds, SECTION_CONCURRENCY, async (sectionId) => {
    try {
      const sectionUrl = `${AUST_API_ROOT}/CorporatePageSections/GetSectionDataById?imgsize=&hasDynamicCorporatePageSections=true&id=${encodeURIComponent(sectionId)}`;
      const section = (await requestJson(sectionUrl, { timeoutMs: 45000 })).json;
      const course = extractAustCourseCode(section?.title);
      if (course) {
        courses.push(buildAustCatalogCourse({
          course,
          termCode,
          programTitle,
          sourceUrl: pageUrl,
        }));
      }
    } catch (error) {
      logStep("aust section skipped", `${sectionId} -> ${error.message}`);
    }
  });

  const deduped = dedupeBy(courses, (course) => `${course.department}:${course.course_number}`);
  logStep("aust program page", `${source.label} -> ${deduped.length} courses`);
  return deduped;
}

function mergeAustCourses(courses) {
  const merged = new Map();

  courses.forEach((course) => {
    const key = `${course.department}:${course.course_number}`;
    if (!merged.has(key)) {
      merged.set(key, {
        ...course,
        attributes: Array.isArray(course.attributes) ? [...course.attributes] : [],
        sources: [course.source_url].filter(Boolean),
      });
      return;
    }

    const existing = merged.get(key);
    const attributes = new Set([
      ...(Array.isArray(existing.attributes) ? existing.attributes : []),
      ...(Array.isArray(course.attributes) ? course.attributes : []),
    ].filter(Boolean));
    const sources = new Set([
      ...(Array.isArray(existing.sources) ? existing.sources : []),
      course.source_url,
    ].filter(Boolean));

    existing.attributes = [...attributes];
    existing.sources = [...sources];
  });

  return [...merged.values()].map((course) => {
    const { source_url: _sourceUrl, ...rest } = course;
    return rest;
  });
}

async function fetchAustCatalog() {
  const catalogTerm = {
    ...buildAcademicCatalogTerm("Catalog", { codePrefix: "catalog" }),
    is_current: false,
  };
  const offeringTerm = buildAustOfferingTerm();
  const courses = [];

  for (const source of AUST_SEQUENCE_PDFS) {
    try {
      const programCourses = await fetchAustProgramCourses(source, catalogTerm.code);
      courses.push(...programCourses);
    } catch (error) {
      logStep("aust program failed", `${source.url} -> ${error.message}`);
    }
  }

  for (const source of AUST_PROGRAM_PAGES) {
    try {
      const programCourses = await fetchAustProgramPageCourses(source, catalogTerm.code);
      courses.push(...programCourses);
    } catch (error) {
      logStep("aust program page failed", `${source.urlTitle} -> ${error.message}`);
    }
  }

  const dedupedCatalogCourses = mergeAustCourses(courses);
  const departmentQueries = dedupeBy(
    dedupedCatalogCourses
      .map((course) => normalizeWhitespace(course.department))
      .filter((value) => value && value.length >= 2),
    (value) => value.toLowerCase(),
  );
  const timedOfferingResult = await fetchAustTimedOfferings(departmentQueries, offeringTerm.code);
  const timedCourses = timedOfferingResult.courses;
  const combinedCourses = [...dedupedCatalogCourses, ...timedCourses];

  return {
    availability: "partial",
    message: `Official sequence-of-courses PDFs, AUST public program pages, and the Faculty of Engineering public course-offering checker verified. Seeded ${combinedCourses.length.toLocaleString("en-US")} searchable AUST entries, including ${timedCourses.length.toLocaleString("en-US")} timed sections from the current public offering across ${timedOfferingResult.campuses.length} campuses.`,
    terms: [offeringTerm, catalogTerm],
    courses: combinedCourses,
    sources: [
      ...AUST_SEQUENCE_PDFS.map((source) => source.url),
      ...AUST_PROGRAM_PAGES.map((source) =>
        `${AUST_API_ROOT}/CorporatePages/GetPageDataByTitle?title=${encodeURIComponent(source.urlTitle)}`),
      AUST_PUBLIC_OFFERING_URL,
      `${AUST_SUGGEST_URL}?q=CSI`,
    ],
  };
}

module.exports = {
  fetchAustCatalog,
};
