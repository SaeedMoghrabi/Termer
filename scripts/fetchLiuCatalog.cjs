const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const { chromium } = require("playwright");
const {
  CURRENT_MONTH,
  CURRENT_YEAR,
  buildAcademicCatalogTerm,
  dedupeBy,
  extractEffectiveYear,
  logStep,
  normalizeHeuristicRange,
  normalizeWhitespace,
  parseCompactDays,
  parseSeason,
  professorIdFor,
  slugify,
  splitCourseCode,
  stripTags,
} = require("./catalogUtils.cjs");
const { mergeCatalogWithManualTimedImports } = require("./manualTimedImports.cjs");

const SOURCE_URL = "https://syslb.liu.edu.lb/syslbdatadir/Documents/09_University_Catalog.pdf";
const LIU_PUBLIC_ENTRYPOINT = "https://liu.edu.lb/LIU/";
const LIU_PORTAL_LOGIN_URL = "https://syslbv4.liu.edu.lb/login/";
const LIU_PORTAL_ROOT = "https://syslbv4.liu.edu.lb/student/myRegistration";
const LIU_PORTAL_CACHE_PATH = path.join(__dirname, "..", "data", "catalogs", "liu-portal-cache.json");
const LIU_PORTAL_CACHE_MINUTES = Number.parseInt(process.env.LIU_PORTAL_CACHE_MINUTES || "60", 10);
const LIU_PORTAL_CHROME_PATH = process.env.LIU_PORTAL_CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const LIU_CACHE_SCHEMA = 1;
const SCHOOL_HEADINGS = [
  { pattern: /^\d+\s+school of business$/i, label: "School of Business" },
  { pattern: /^\d+\s+school of engineering$/i, label: "School of Engineering" },
  { pattern: /^\d+\s+school of arts(?: and)? sciences$/i, label: "School of Arts and Sciences" },
  { pattern: /^\d+\s+school of education$/i, label: "School of Education" },
  { pattern: /^\d+\s+school of pharmacy$/i, label: "School of Pharmacy" },
];
const TERM_MONTH_MAP = {
  spring: [1, 2, 3, 4, 5],
  summer: [6, 7, 8],
  fall: [9, 10, 11, 12],
  winter: [1],
};

function detectSchool(line, currentSchool) {
  const normalizedLine = normalizeWhitespace(line).toLowerCase();
  const heading = SCHOOL_HEADINGS.find((candidate) => candidate.pattern.test(normalizedLine));
  return heading?.label ?? currentSchool;
}

function splitLiuCourseCode(rawCode = "") {
  const match = normalizeWhitespace(rawCode).toUpperCase().match(/^([A-Z]{3,6})([0-9]{3}[A-Z]?)$/);
  if (!match) {
    return {
      department: rawCode.toUpperCase(),
      courseNumber: "",
    };
  }

  return {
    department: match[1],
    courseNumber: match[2],
  };
}

function normalizeTermLabel(rawLabel = "") {
  return normalizeWhitespace(rawLabel).replace(/\s*-\s*/g, "-");
}

function buildPortalTermCode(label = "") {
  const normalizedLabel = normalizeTermLabel(label);
  const season = parseSeason(normalizedLabel) || "term";
  const years = [...normalizedLabel.matchAll(/20\d{2}/g)].map((match) => match[0]);
  if (years.length >= 2) {
    return `portal-${season}-${years[0]}-${years[1]}`;
  }
  return `portal-${slugify(normalizedLabel)}`;
}

function isCurrentPortalTerm(label = "") {
  const normalizedLabel = normalizeTermLabel(label);
  const season = parseSeason(normalizedLabel);
  const effectiveYear = extractEffectiveYear(normalizedLabel);
  if (!season || !Number.isFinite(effectiveYear)) return false;
  return TERM_MONTH_MAP[season]?.includes(CURRENT_MONTH) && effectiveYear === CURRENT_YEAR;
}

function normalizeCrnFragment(value = "") {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseLiuCatalogCourses(text, termCode) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const courses = [];
  let currentSchool = "Lebanese International University";

  for (const line of lines) {
    currentSchool = detectSchool(line, currentSchool);

    const match = line.match(/^([A-Z]{3,6}[0-9]{3}[A-Z]?)\s*-\s*(.+?)\s+(\d+(?:[.,]\d+)?)$/);
    if (!match) {
      continue;
    }

    const rawCode = match[1].toUpperCase();
    const title = normalizeWhitespace(match[2]);
    const credits = Number.parseFloat(String(match[3]).replace(",", "."));
    const { department, courseNumber } = splitLiuCourseCode(rawCode);

    if (!department || !courseNumber || !title) {
      continue;
    }

    if (
      /^(total|general education electives?|major electives?|free electives?|electives?)$/i.test(title)
      || /^major title$/i.test(title)
    ) {
      continue;
    }

    courses.push({
      id: `liu:${termCode}:${department}:${slugify(`${rawCode}-${title}`)}`,
      term_code: termCode,
      crn: `LIU-${rawCode}`,
      code: `${department} ${courseNumber}`,
      department,
      course_number: courseNumber,
      section: "CAT",
      title,
      credits: Number.isFinite(credits) ? credits : 0,
      instructor: "TBA",
      professor_id: professorIdFor("liu", "TBA"),
      campus: "All LIU Campuses",
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
      attributes: [currentSchool].filter(Boolean),
      isCatalogOnly: true,
    });
  }

  return dedupeBy(
    courses,
    (course) => `${course.department}:${course.course_number}:${slugify(course.title)}`,
  );
}

function buildBaseCourseLookup(courses = []) {
  const byCode = new Map();
  for (const course of courses) {
    const codeKey = normalizeWhitespace(course.code).toUpperCase().replace(/\s+/g, "");
    if (!codeKey) continue;
    if (!byCode.has(codeKey)) byCode.set(codeKey, []);
    byCode.get(codeKey).push(course);
  }
  return byCode;
}

function stripHtmlComments(value = "") {
  return String(value).replace(/<!--[\s\S]*?-->/g, " ");
}

function extractCourseChoiceEntries(html = "") {
  const entries = [];
  const seen = new Set();
  const normalizedHtml = stripHtmlComments(html);
  const optionRegex = /<option[^>]*value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi;
  let match;

  while ((match = optionRegex.exec(normalizedHtml))) {
    const crsid = normalizeWhitespace(match[1]);
    const label = normalizeWhitespace(stripTags(match[2]));
    if (!crsid || !label || /^choose\b/i.test(label)) continue;

    const [rawCode = "", ...titleParts] = label.split("-");
    const compactCode = normalizeWhitespace(rawCode).toUpperCase();
    if (!compactCode || !/\d/.test(compactCode) || compactCode.length < 5) continue;

    const title = normalizeWhitespace(titleParts.join("-"));
    if (!title) continue;

    const key = `${crsid}|${compactCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      crsid,
      rawCode: compactCode,
      title,
      attributes: [],
      source: "portal-course-choice",
    });
  }

  return entries;
}

function extractGeneralElectiveEntries(html = "") {
  const entries = [];
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html))) {
    const rowHtml = rowMatch[0];
    const offeringMatch = rowHtml.match(/viewAvailableOfferings\.php\?crsid=([^'"}&\s]+)/i);
    if (!offeringMatch) continue;

    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cellMatch) => normalizeWhitespace(stripTags(cellMatch[1])));

    if (cells.length < 4) continue;

    const rawCode = normalizeWhitespace(cells[1]).toUpperCase();
    const credits = Number.parseFloat(String(cells[2]).replace(",", "."));
    const title = normalizeWhitespace(cells[3]);
    if (!rawCode || !title) continue;

    entries.push({
      crsid: normalizeWhitespace(offeringMatch[1]),
      rawCode,
      title,
      credits: Number.isFinite(credits) ? credits : 0,
      attributes: ["General Elective"],
      source: "portal-general-elective",
    });
  }

  return dedupeBy(entries, (entry) => `${entry.crsid}|${entry.rawCode}`);
}

function parseDetailsTable(html = "", sectionTitle = "") {
  const tableRegex = new RegExp(
    `<span[^>]*class="section-title"[^>]*>${sectionTitle}<\\/span>[\\s\\S]*?<tbody>([\\s\\S]*?)<\\/tbody>`,
    "i",
  );
  const bodyMatch = html.match(tableRegex);
  if (!bodyMatch) return [];

  const rows = [];
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(bodyMatch[1]))) {
    const cells = [...rowMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cellMatch) => normalizeWhitespace(stripTags(cellMatch[1])))
      .filter(Boolean);
    if (cells.length >= 3 && !/^there are no/i.test(cells.join(" "))) {
      rows.push({
        code: cells[1],
        title: cells[2],
      });
    }
  }

  return rows;
}

function extractLabelValue(html = "", label = "") {
  const labelPattern = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<span[^>]*>${labelPattern}:\\s*<\\/span>\\s*([\\s\\S]*?)<\\/div>`, "i");
  const match = html.match(regex);
  return normalizeWhitespace(stripTags(match?.[1] || ""));
}

function parseLiuCourseDetails(html = "") {
  const codeCompact = normalizeWhitespace(extractLabelValue(html, "Course Code")).toUpperCase();
  const title = extractLabelValue(html, "Course title");
  const credits = Number.parseFloat(String(extractLabelValue(html, "Credits")).replace(",", "."));
  const description = extractLabelValue(html, "Description");
  const academicLevel = extractLabelValue(html, "Academic Level");
  const level = extractLabelValue(html, "Level");
  const isLab = extractLabelValue(html, "Is Lab");
  const prerequisites = parseDetailsTable(html, "Pre-requisites");
  const corequisites = parseDetailsTable(html, "Co-requisites");
  const { department, courseNumber } = splitLiuCourseCode(codeCompact);

  return {
    rawCode: codeCompact,
    code: department && courseNumber ? `${department} ${courseNumber}` : codeCompact,
    department,
    course_number: courseNumber,
    title,
    credits: Number.isFinite(credits) ? credits : 0,
    description,
    academicLevel,
    level,
    isLab,
    prerequisites,
    corequisites,
  };
}

function extractCampusLabels(html = "") {
  return [...html.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/gi)]
    .map((match) => ({
      value: normalizeWhitespace(match[1]),
      label: normalizeWhitespace(stripTags(match[2])),
    }))
    .filter((entry) => entry.value && entry.label && entry.value !== "0");
}

function parseScheduleMeetings(rawSchedule = "", location = "", section = "") {
  const cleaned = normalizeWhitespace(rawSchedule)
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  const meetings = [];
  const regex = /([A-Za-z]+)\s+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/g;
  let match;
  while ((match = regex.exec(cleaned))) {
    const days = parseCompactDays(match[1]);
    const time = normalizeHeuristicRange(match[2]);
    if (days === "TBA" || time === "TBA") continue;
    meetings.push({
      days,
      time,
      location: normalizeWhitespace(location) || "TBA",
      section,
      type: "Class",
    });
  }

  if (meetings.length) {
    return meetings;
  }

  const parts = cleaned.split(/\s+/);
  const timeToken = parts.slice(-1)[0];
  const daysToken = parts.slice(0, -1).join("");
  const days = parseCompactDays(daysToken);
  const time = normalizeHeuristicRange(timeToken);
  if (days !== "TBA" && time !== "TBA") {
    return [{
      days,
      time,
      location: normalizeWhitespace(location) || "TBA",
      section,
      type: "Class",
    }];
  }

  return [];
}

function parseLiuOfferingRows(html = "") {
  const result = {
    code: normalizeWhitespace(extractLabelValue(html, "Course Code")).toUpperCase(),
    title: extractLabelValue(html, "Course title"),
    credits: Number.parseFloat(String(extractLabelValue(html, "Credits")).replace(",", ".")),
    campusOptions: extractCampusLabels(html),
    rows: [],
  };

  const availableOfferingsIndex = html.search(/<span[^>]*class="section-title"[^>]*>Available Offerings<\/span>/i);
  if (availableOfferingsIndex === -1) {
    return result;
  }

  const availableHtml = html.slice(availableOfferingsIndex);
  const blockRegex = /<div[^>]*text-bold[^>]*align-center[^>]*>([\s\S]*?)<\/div>\s*<table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>\s*<\/table>/gi;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(availableHtml))) {
    const campusLabel = normalizeWhitespace(stripTags(blockMatch[1]));
    const tbody = blockMatch[2];
    const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tbody))) {
      const cells = [...rowMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map((cellMatch) => normalizeWhitespace(stripTags(cellMatch[1])));
      if (cells.length < 6) continue;
      const section = normalizeWhitespace(cells[2]).toUpperCase();
      const instructor = normalizeWhitespace(cells[3]) || "TBA";
      const location = normalizeWhitespace(cells[4]) || "TBA";
      const rawSchedule = normalizeWhitespace(cells[5]);
      const meetings = parseScheduleMeetings(rawSchedule, location, section);
      if (!section || !meetings.length) continue;

      result.rows.push({
        campus: campusLabel || normalizeWhitespace(cells[1]) || "TBA",
        section,
        instructor,
        location,
        rawSchedule,
        meetings,
      });
    }
  }

  return result;
}

function buildPrerequisiteSummary(details = {}) {
  const lines = [];
  if (Array.isArray(details.prerequisites) && details.prerequisites.length) {
    lines.push(`Prerequisites: ${details.prerequisites.map((item) => `${item.code} ${item.title}`).join("; ")}`);
  }
  if (Array.isArray(details.corequisites) && details.corequisites.length) {
    lines.push(`Corequisites: ${details.corequisites.map((item) => `${item.code} ${item.title}`).join("; ")}`);
  }
  return lines.join(" ");
}

function mergeUniqueMeetings(meetings = []) {
  return dedupeBy(
    meetings.map((meeting) => ({
      ...meeting,
      location: normalizeWhitespace(meeting.location) || "TBA",
      section: normalizeWhitespace(meeting.section).toUpperCase() || "1",
      type: normalizeWhitespace(meeting.type) || "Class",
    })),
    (meeting) => `${meeting.days}|${meeting.time}|${meeting.location}|${meeting.section}|${meeting.type}`,
  );
}

function buildPortalCourseSections(term, crsid, details, offeringRows, baseCourseLookup, extraAttributes = []) {
  const sections = new Map();
  const normalizedCode = normalizeWhitespace(details.code || offeringRows.code).toUpperCase().replace(/\s+/g, "");
  const baseMatches = baseCourseLookup.get(normalizedCode) || [];
  const baseAttributes = dedupeBy(
    baseMatches.flatMap((course) => course.attributes || []).map((value) => normalizeWhitespace(value)).filter(Boolean),
    (value) => value,
  );
  const baseTitle = baseMatches[0]?.title || details.title || offeringRows.title;
  const baseCredits = Number.isFinite(details.credits) && details.credits > 0
    ? details.credits
    : (Number.isFinite(offeringRows.credits) ? offeringRows.credits : (baseMatches[0]?.credits || 0));
  const prerequisites = buildPrerequisiteSummary(details) || baseMatches[0]?.prerequisites || null;

  for (const row of offeringRows.rows) {
    const sectionKey = `${row.campus}|${row.section}|${row.instructor}`;
    const existing = sections.get(sectionKey);
    if (!existing) {
      sections.set(sectionKey, {
        id: `liu:${term.code}:${slugify(`${normalizedCode}-${row.campus}-${row.section}-${row.instructor}`)}`,
        term_code: term.code,
        crn: normalizeCrnFragment(`LIU-${term.code}-${crsid}-${row.campus}-${row.section}`),
        code: details.code || offeringRows.code,
        department: details.department,
        course_number: details.course_number,
        section: row.section,
        title: baseTitle,
        credits: baseCredits,
        instructor: row.instructor,
        professor_id: professorIdFor("liu", row.instructor),
        campus: row.campus,
        schedule: row.meetings[0],
        meetings: [...row.meetings],
        capacity: 0,
        enrolled_count: 0,
        prerequisites,
        attributes: dedupeBy([...baseAttributes, ...extraAttributes], (value) => value),
        description: details.description || "",
        academic_level: details.academicLevel || "",
        level: details.level || "",
        is_lab: details.isLab || "",
        hasPublishedMeetings: true,
        has_published_meetings: true,
        isCatalogOnly: false,
        portal_course_id: crsid,
        source_schedule_note: `Authenticated LIU portal offering for ${term.description}`,
      });
      continue;
    }

    existing.meetings.push(...row.meetings);
    existing.meetings = mergeUniqueMeetings(existing.meetings);
    existing.schedule = existing.meetings[0];
    existing.attributes = dedupeBy(
      [...(existing.attributes || []), ...baseAttributes, ...extraAttributes],
      (value) => value,
    );
  }

  return [...sections.values()].map((course) => ({
    ...course,
    meetings: mergeUniqueMeetings(course.meetings),
    schedule: mergeUniqueMeetings(course.meetings)[0],
  }));
}

function readPortalCache(options = {}) {
  const { allowStale = false } = options;
  if (!fs.existsSync(LIU_PORTAL_CACHE_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(LIU_PORTAL_CACHE_PATH, "utf8"));
    if (parsed?.schemaVersion !== LIU_CACHE_SCHEMA) return null;
    const updatedAt = new Date(parsed.updatedAt || 0);
    const ageMinutes = (Date.now() - updatedAt.getTime()) / (1000 * 60);
    if (!allowStale && ageMinutes > LIU_PORTAL_CACHE_MINUTES) {
      return null;
    }
    if (!Array.isArray(parsed.terms) || !Array.isArray(parsed.courses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePortalCache(payload) {
  fs.mkdirSync(path.dirname(LIU_PORTAL_CACHE_PATH), { recursive: true });
  fs.writeFileSync(
    LIU_PORTAL_CACHE_PATH,
    JSON.stringify({
      schemaVersion: LIU_CACHE_SCHEMA,
      updatedAt: new Date().toISOString(),
      ...payload,
    }, null, 2),
  );
}

async function launchPortalBrowser() {
  if (fs.existsSync(LIU_PORTAL_CHROME_PATH)) {
    return chromium.launch({
      headless: true,
      executablePath: LIU_PORTAL_CHROME_PATH,
    });
  }

  try {
    return await chromium.launch({
      headless: true,
      channel: "chrome",
    });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function loginToLiuPortal() {
  const username = normalizeWhitespace(process.env.LIU_PORTAL_USER || "");
  const password = String(process.env.LIU_PORTAL_PASSWORD || "");
  if (!username || !password) {
    throw new Error("LIU portal credentials are not configured.");
  }

  const browser = await launchPortalBrowser();
  const context = await browser.newContext();
  const opener = await context.newPage();

  await opener.goto(LIU_PUBLIC_ENTRYPOINT, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const popupPromise = opener.waitForEvent("popup");
  await opener.evaluate((targetUrl) => {
    window.open(targetUrl, "_blank");
  }, LIU_PORTAL_LOGIN_URL);
  const page = await popupPromise;
  await page.waitForLoadState("domcontentloaded");
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await Promise.all([
    page.waitForURL(/student\/myRegistration/, { timeout: 60000 }),
    page.locator('button:has-text("LOGIN"), input[type="submit"]').first().click(),
  ]);
  await page.waitForSelector("#semId", { timeout: 60000 });

  return { browser, context, page };
}

async function extractPortalTerms(page) {
  const terms = await page.$$eval("#semId option", (options) =>
    options.map((option) => ({
      value: option.value,
      label: option.textContent || "",
    })),
  );

  return terms
    .map((term) => ({
      portalValue: normalizeWhitespace(term.value),
      label: normalizeTermLabel(term.label),
    }))
    .filter((term) => term.portalValue && !/^choose semester$/i.test(term.label))
    .map((term) => ({
      ...term,
      code: buildPortalTermCode(term.label),
      description: term.label,
      is_current: isCurrentPortalTerm(term.label),
    }));
}

async function activatePortalSemester(page, portalValue) {
  await page.goto(`${LIU_PORTAL_ROOT}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("#semId", { timeout: 60000 });
  await page.selectOption("#semId", portalValue);
  try {
    await page.waitForURL(/choicesPage\.php/, { timeout: 15000 });
  } catch {
    // Some semesters keep the same URL while still switching the session-side context.
  }
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
}

async function fetchPortalHtml(context, relativeUrl) {
  const response = await context.request.get(`${LIU_PORTAL_ROOT}/${relativeUrl}`, {
    timeout: 60000,
  });
  if (!response.ok()) {
    throw new Error(`LIU portal request failed for ${relativeUrl}: ${response.status()}`);
  }
  return response.text();
}

async function fetchPortalCourseData(context, crsid, detailCache, offeringCache) {
  if (!detailCache.has(crsid)) {
    const detailsHtml = await fetchPortalHtml(context, `courseDetails.php?crsid=${encodeURIComponent(crsid)}`);
    detailCache.set(crsid, parseLiuCourseDetails(detailsHtml));
  }
  if (!offeringCache.has(crsid)) {
    const offeringsHtml = await fetchPortalHtml(context, `viewAvailableOfferings.php?crsid=${encodeURIComponent(crsid)}&campusId=0`);
    offeringCache.set(crsid, parseLiuOfferingRows(offeringsHtml));
  }
  return {
    details: detailCache.get(crsid),
    offerings: offeringCache.get(crsid),
  };
}

async function mapWithConcurrency(items, mapper, concurrency = 8) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchAuthenticatedLiuPortalTerms(baseCatalogCourses = []) {
  const cached = readPortalCache();
  if (cached) {
    logStep("liu portal cache", `${cached.courses.length} sections from ${cached.terms.length} terms`);
    return cached;
  }

  const baseCourseLookup = buildBaseCourseLookup(baseCatalogCourses);
  const detailCache = new Map();
  const portalCourses = [];
  const sources = [
    SOURCE_URL,
    LIU_PORTAL_LOGIN_URL,
    `${LIU_PORTAL_ROOT}/courseChoice.php`,
    `${LIU_PORTAL_ROOT}/allowedElectiveOfferings.php?type=GERElective`,
  ];

  const seedSession = await loginToLiuPortal();
  let effectiveTerms;
  try {
    const portalTerms = await extractPortalTerms(seedSession.page);
    effectiveTerms = portalTerms.length
      ? portalTerms
      : [{
          portalValue: "=EzN",
          label: "Spring 2025-2026",
          code: "portal-spring-2025-2026",
          description: "Spring 2025-2026",
          is_current: true,
        }];
  } finally {
    await seedSession.browser.close().catch(() => undefined);
  }

  for (const term of effectiveTerms) {
    let termSession = null;
    try {
      termSession = await loginToLiuPortal();
      await activatePortalSemester(termSession.page, term.portalValue);
      const [courseChoiceHtml, geHtml] = await Promise.all([
        fetchPortalHtml(termSession.context, "courseChoice.php"),
        fetchPortalHtml(termSession.context, "allowedElectiveOfferings.php?type=GERElective").catch(() => ""),
      ]);

      const entryMap = new Map();
      for (const entry of [
        ...extractCourseChoiceEntries(courseChoiceHtml),
        ...extractGeneralElectiveEntries(geHtml),
      ]) {
        const existing = entryMap.get(entry.crsid);
        if (!existing) {
          entryMap.set(entry.crsid, entry);
          continue;
        }
        existing.attributes = dedupeBy(
          [...(existing.attributes || []), ...(entry.attributes || [])],
          (value) => value,
        );
        if (!existing.title && entry.title) existing.title = entry.title;
        if (!existing.rawCode && entry.rawCode) existing.rawCode = entry.rawCode;
      }

      const termEntries = [...entryMap.values()];
      logStep("liu portal term", `${term.description} -> ${termEntries.length} course ids`);

      const offeringCache = new Map();
      const termCourses = (await mapWithConcurrency(termEntries, async (entry) => {
        try {
          const { details, offerings } = await fetchPortalCourseData(termSession.context, entry.crsid, detailCache, offeringCache);
          if (!offerings.rows.length) return [];
          return buildPortalCourseSections(
            term,
            entry.crsid,
            details,
            offerings,
            baseCourseLookup,
            entry.attributes || [],
          );
        } catch (error) {
          logStep("liu portal course failed", `${entry.rawCode || entry.crsid} -> ${error.message}`);
          return [];
        }
      }, 6)).flat();

      portalCourses.push(...termCourses);
      sources.push(
        `${LIU_PORTAL_ROOT}/courseChoice.php#${term.code}`,
        `${LIU_PORTAL_ROOT}/allowedElectiveOfferings.php?type=GERElective#${term.code}`,
      );
    } catch (error) {
      logStep("liu portal term failed", `${term.description} -> ${error.message}`);
    } finally {
      if (termSession) {
        await termSession.browser.close().catch(() => undefined);
      }
    }
  }

  const successfulTermCodes = new Set(portalCourses.map((course) => course.term_code));
  const terms = effectiveTerms
    .filter((term) => successfulTermCodes.has(term.code))
    .map((term) => ({ code: term.code, description: term.description, is_current: term.is_current }));
  const currentTermCode = terms.find((term) => term.is_current)?.code || terms[0]?.code;
  const normalizedTerms = terms.map((term) => ({
    ...term,
    is_current: term.code === currentTermCode,
  }));
  if (!normalizedTerms.length || !portalCourses.length) {
    throw new Error("Authenticated LIU portal returned no timed sections.");
  }
  const payload = {
    terms: normalizedTerms,
    courses: dedupeBy(
      portalCourses.map((course) => ({
        ...course,
        term_code: course.term_code,
      })),
      (course) => `${course.term_code}|${course.code}|${course.campus}|${course.section}|${course.instructor}`,
    ),
    sources: dedupeBy(sources, (value) => value),
    message: `Authenticated LIU portal verified. Synced ${portalCourses.length.toLocaleString("en-US")} timed sections across ${normalizedTerms.length} portal terms.`,
  };

  writePortalCache(payload);
  return payload;
}

async function fetchLiuCatalog() {
  const term = buildAcademicCatalogTerm("Catalog", { codePrefix: "catalog" });
  const parser = new PDFParse({ url: SOURCE_URL });

  try {
    const pdfText = await parser.getText();
    const baseCatalogCourses = parseLiuCatalogCourses(pdfText.text, term.code);
    logStep("liu catalog pdf", `${baseCatalogCourses.length} courses`);

    const result = {
      availability: "partial",
      message: `Official LIU university catalog verified. Seeded ${baseCatalogCourses.length.toLocaleString("en-US")} searchable courses from the public university catalog; no official public timetable feed has been discovered from this environment yet.`,
      terms: [term],
      courses: baseCatalogCourses,
      sources: [SOURCE_URL],
    };

    const shouldUsePortal = normalizeWhitespace(process.env.LIU_PORTAL_USER || "")
      && String(process.env.LIU_PORTAL_PASSWORD || "");

    if (!shouldUsePortal) {
      return mergeCatalogWithManualTimedImports("liu", result);
    }

    try {
      const portal = await fetchAuthenticatedLiuPortalTerms(baseCatalogCourses);
      result.terms = dedupeBy([...result.terms, ...portal.terms], (entry) => entry.code);
      result.terms = result.terms.map((entry) => ({
        ...entry,
        is_current: portal.terms.some((termEntry) => termEntry.code === entry.code && termEntry.is_current)
          || (!portal.terms.some((termEntry) => termEntry.is_current) && entry.code === term.code),
      }));
      result.courses = [...result.courses, ...portal.courses];
      result.sources = dedupeBy([...result.sources, ...(portal.sources || [])], (value) => value);
      result.message = `Official LIU university catalog verified. Seeded ${baseCatalogCourses.length.toLocaleString("en-US")} searchable catalog courses and ${portal.courses.length.toLocaleString("en-US")} authenticated timed sections across ${portal.terms.length} LIU portal terms.`;
    } catch (error) {
      const stalePortal = readPortalCache({ allowStale: true });
      if (stalePortal) {
        result.terms = dedupeBy([...result.terms, ...stalePortal.terms], (entry) => entry.code);
        result.terms = result.terms.map((entry) => ({
          ...entry,
          is_current: stalePortal.terms.some((termEntry) => termEntry.code === entry.code && termEntry.is_current)
            || entry.code === term.code,
        }));
        result.courses = [...result.courses, ...stalePortal.courses];
        result.sources = dedupeBy([...result.sources, ...(stalePortal.sources || [])], (value) => value);
        result.message = `Official LIU university catalog verified. Using cached authenticated LIU portal data after a refresh failure: ${error.message}`;
        logStep("liu portal stale cache", error.message);
      } else {
        logStep("liu portal unavailable", error.message);
      }
    }

    return mergeCatalogWithManualTimedImports("liu", result);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

module.exports = {
  fetchLiuCatalog,
};
