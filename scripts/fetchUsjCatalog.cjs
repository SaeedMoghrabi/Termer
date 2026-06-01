const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const { chromium } = require("playwright");
const {
  buildAcademicCatalogTerm,
  chooseCurrentTerm,
  dedupeBy,
  ensureDir,
  htmlDecode,
  logStep,
  normalizeWhitespace,
  professorIdFor,
  slugify,
  stripTags,
} = require("./catalogUtils.cjs");

const SOURCE_URL = "https://www.usj.edu.lb/catalogues/24-25.php";
const DETAILS_ROOT = "https://etudiant.usj.edu.lb";
const ETUDIANT_ENTRY_URL = `${DETAILS_ROOT}/index.php`;
const INCLUDE_LABEL_PATTERN = /\b(licence|bachelor|dipl[o\u00f4]me|master|doctorat|teaching diploma|capes|programme preparatoire|program preparatory|programme regular preparatory)\b/i;
const EXCLUDE_LABEL_PATTERN = /\b(la faculte|l'institut|l'ecole|the school|the institute|the faculty|presentation|concours)\b/i;
const PDF_TIMEOUT_MS = 180000;
const PDF_CONCURRENCY = 4;
const DETAILS_CONCURRENCY = 8;
const DETAILS_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const DETAILS_CACHE_PATH = path.join(__dirname, "..", "data", "catalogs", "usj-schedule-cache.json");
const DETAILS_CACHE_SCHEMA_VERSION = 5;
const DEFAULT_BROWSER_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const REQUEST_RETRY_LIMIT = 3;

const USJ_DAY_MAP = {
  lun: "Monday",
  lundi: "Monday",
  mon: "Monday",
  mar: "Tuesday",
  mardi: "Tuesday",
  tue: "Tuesday",
  mer: "Wednesday",
  mercredi: "Wednesday",
  wed: "Wednesday",
  jeu: "Thursday",
  jeudi: "Thursday",
  thu: "Thursday",
  ven: "Friday",
  vendredi: "Friday",
  fri: "Friday",
  sam: "Saturday",
  samedi: "Saturday",
  sat: "Saturday",
  dim: "Sunday",
  dimanche: "Sunday",
  sun: "Sunday",
};

function getUsjBrowserExecutablePath() {
  const candidates = [
    process.env.USJ_BROWSER_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
    DEFAULT_BROWSER_PATH,
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function createUsjSession() {
  const executablePath = getUsjBrowserExecutablePath();
  if (!executablePath) {
    throw new Error("No Chrome/Chromium executable was found for the USJ timed-section fetcher.");
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
  });

  async function gotoLenient(page, url) {
    await page.goto(url, {
      waitUntil: "commit",
      timeout: 120000,
    });
    await page.waitForLoadState("domcontentloaded", {
      timeout: 45000,
    }).catch(() => undefined);
  }

  const catalogPage = await context.newPage();
  await gotoLenient(catalogPage, SOURCE_URL);
  await catalogPage.waitForTimeout(3000);

  const etudiantPage = await context.newPage();
  await gotoLenient(etudiantPage, ETUDIANT_ENTRY_URL);
  await etudiantPage.waitForTimeout(2000);

  return {
    browser,
    context,
    catalogPage,
    request: context.request,
  };
}

async function closeUsjSession(session) {
  await session?.browser?.close().catch(() => undefined);
}

async function extractUsjProgramLinks(catalogPage) {
  const rawLinks = await catalogPage.locator("a[href$='.pdf']").evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.href,
      label: (node.textContent || "").replace(/\s+/g, " ").trim(),
    })),
  );

  const filtered = rawLinks
    .map((link) => ({
      url: normalizeWhitespace(link.href),
      label: normalizeWhitespace(link.label),
    }))
    .filter((link) => link.url && link.label)
    .filter((link) => /\/catalogues\/2025\//i.test(link.url))
    .filter((link) => INCLUDE_LABEL_PATTERN.test(link.label))
    .filter((link) => !EXCLUDE_LABEL_PATTERN.test(link.label))
    .map((link) => ({
      ...link,
      department: slugify(link.label).slice(0, 12).toUpperCase() || "USJ",
    }));

  return dedupeBy(filtered, (item) => item.url);
}

function extractUsjCampus(text) {
  const match = text.match(/Campus o[u\u00f9] le programme est propos[e\u00e9]\s*:\s*([^\n]+)/i);
  return normalizeWhitespace(match?.[1] || "Main Campus");
}

function extractUsjCoursesFromText(text, program, termCode) {
  const campus = extractUsjCampus(text);
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const courses = [];

  for (const line of lines) {
    const match = line.match(/^([0-9A-Z]{6,})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:Cr\.)?$/i);
    if (!match) continue;

    const rawCode = normalizeWhitespace(match[1]).toUpperCase();
    const title = normalizeWhitespace(match[2]);
    const credits = Number.parseFloat(String(match[3]).replace(",", "."));

    if (!/[A-Z]/.test(rawCode) || !/\d/.test(rawCode)) continue;
    if (!title || title === "/" || title.length < 2) continue;
    if (/^(code|intitule|credits|semestre|prerequis|optionnelles ouvertes|plan detudes)/i.test(title)) continue;

    courses.push({
      id: `usj:${termCode}:${slugify(`${rawCode}-${title}`)}`,
      term_code: termCode,
      crn: `USJ-${rawCode}`,
      code: rawCode,
      department: rawCode.replace(/[0-9].*$/, "") || "USJ",
      course_number: rawCode,
      section: "CAT",
      title,
      credits: Number.isFinite(credits) ? credits : 0,
      instructor: "TBA",
      professor_id: professorIdFor("usj", "TBA"),
      campus,
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
      attributes: [program.label].filter(Boolean),
      usj_course_code: rawCode,
      source_url: program.url,
    });
  }

  return dedupeBy(courses, (course) => course.usj_course_code);
}

async function fetchUsjProgramCourses(program, termCode, request) {
  const response = await requestWithRetries(request, program.url, { timeout: PDF_TIMEOUT_MS }, `program ${program.url}`);
  if (!response.ok()) {
    throw new Error(`Program PDF failed with status ${response.status()}`);
  }

  const parser = new PDFParse({ data: await response.body() });

  try {
    const result = await parser.getText();
    const courses = extractUsjCoursesFromText(result.text, program, termCode);
    logStep("usj program", `${program.label} -> ${courses.length} courses`);
    return courses;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  let currentIndex = 0;

  async function runWorker() {
    while (currentIndex < items.length) {
      const itemIndex = currentIndex;
      currentIndex += 1;
      results[itemIndex] = await worker(items[itemIndex], itemIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetries(request, url, options = {}, label = url) {
  let lastError = null;
  for (let attempt = 1; attempt <= REQUEST_RETRY_LIMIT; attempt += 1) {
    try {
      return await request.get(url, options);
    } catch (error) {
      lastError = error;
      if (attempt >= REQUEST_RETRY_LIMIT) break;
      logStep("usj retry", `${label} attempt ${attempt + 1}/${REQUEST_RETRY_LIMIT}`);
      await wait(750 * attempt);
    }
  }
  throw lastError;
}

function readDetailsCache() {
  try {
    if (!fs.existsSync(DETAILS_CACHE_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(DETAILS_CACHE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDetailsCache(cache) {
  ensureDir(path.dirname(DETAILS_CACHE_PATH));
  fs.writeFileSync(DETAILS_CACHE_PATH, JSON.stringify(cache, null, 2));
}

function isFreshCacheEntry(entry) {
  if (!entry?.updatedAt) return false;
  if (Number(entry?.schemaVersion || 0) !== DETAILS_CACHE_SCHEMA_VERSION) return false;
  const timestamp = Date.parse(entry.updatedAt);
  if (!Number.isFinite(timestamp)) return false;
  return (Date.now() - timestamp) <= DETAILS_CACHE_MAX_AGE_MS;
}

function cleanHtmlText(value = "") {
  return normalizeWhitespace(htmlDecode(String(value).replace(/<[^>]+>/g, " ")));
}

function cleanHtmlList(value = "") {
  return normalizeWhitespace(
    htmlDecode(String(value).replace(/<br\s*\/?>/gi, ", ").replace(/<[^>]+>/g, " ")),
  );
}

function extractUsjDetailMeta(html, fallbackCode = "") {
  const titleMatch = html.match(/<title>\s*([^<]+?)\s*<\/title>/i);
  const title = normalizeWhitespace(htmlDecode((titleMatch?.[1] || "").split(" - ")[1] || titleMatch?.[1] || ""));

  const creditsMatch = html.match(/Nombre de cr(?:é|e)dits?\s*:\s*<\/?[^>]*>\s*([0-9]+(?:[.,][0-9]+)?)/i)
    || html.match(/Nombre de cr(?:é|e)dits?\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const credits = Number.parseFloat(String(creditsMatch?.[1] || "").replace(",", "."));

  const scheduleMatch = html.match(/horaire_cours\.php\?[^"']+/i);
  const detailsText = cleanHtmlText(html);
  const inlineIndex = detailsText.toLowerCase().indexOf("horaires:");
  const inlineScheduleText = inlineIndex >= 0 ? detailsText.slice(inlineIndex) : "";
  const institutionMatch = html.match(/<td[^>]*class="textenormal"[^>]*>\s*([^<]+(?:<br>\s*[^<]+)*)\s*<\/td>\s*<\/tr>\s*<tr>\s*<td[^>]*class="textenormal"[^>]*><div/i);
  const institution = normalizeWhitespace(
    cleanHtmlText((institutionMatch?.[1] || "").replace(/<br\s*\/?>/gi, "\n").split(/\n+/).slice(0, 3).join(" ")),
  );
  const instructorMatch = html.match(/Nom de l'enseignant[\s\S]*?<td[^>]*>\s*<nobr>([\s\S]*?)<\/nobr>\s*<\/td>/i);
  const instructor = cleanHtmlList(instructorMatch?.[1] || "");

  return {
    title,
    credits: Number.isFinite(credits) ? credits : null,
    institution,
    instructor,
    scheduleUrl: scheduleMatch ? new URL(scheduleMatch[0], `${DETAILS_ROOT}/details_cours.php`).toString() : "",
    inlineScheduleText,
  };
}

function parseUsjDay(rawValue = "") {
  const token = normalizeWhitespace(String(rawValue).split(" ")[0]).toLowerCase();
  return USJ_DAY_MAP[token] || "";
}

function normalizeUsjTime(rawValue = "") {
  const match = normalizeWhitespace(rawValue).match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return "TBA";
  return `${match[1].padStart(2, "0")}:${match[2]} - ${match[3].padStart(2, "0")}:${match[4]}`;
}

function getUsjMeetingDurationMinutes(timeRange = "") {
  const match = String(timeRange).match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const startMinutes = (Number.parseInt(match[1], 10) * 60) + Number.parseInt(match[2], 10);
  const endMinutes = (Number.parseInt(match[3], 10) * 60) + Number.parseInt(match[4], 10);
  return endMinutes - startMinutes;
}

function parseUsjTimeRange(timeRange = "") {
  const match = String(timeRange).match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (!match) return null;
  const startMinutes = (Number.parseInt(match[1], 10) * 60) + Number.parseInt(match[2], 10);
  const endMinutes = (Number.parseInt(match[3], 10) * 60) + Number.parseInt(match[4], 10);
  return { startMinutes, endMinutes };
}

function isUsjPracticalMeetingTime(timeRange = "") {
  const duration = getUsjMeetingDurationMinutes(timeRange);
  return duration >= 45 && duration <= 360;
}

function parseUsjScheduleDate(value = "") {
  const match = normalizeWhitespace(value).match(/(\d{2}\/\d{2}\/\d{4})$/);
  return match?.[1] || "";
}

function buildUsjMeetingSortKey(meeting = {}) {
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dayIndex = Math.max(0, dayOrder.indexOf(normalizeWhitespace(meeting.days)));
  return `${String(dayIndex).padStart(2, "0")}|${normalizeWhitespace(meeting.time)}|${normalizeWhitespace(meeting.location)}`;
}

function selectUsjRegularMeetings(rawMeetings = []) {
  const patterns = new Map();

  rawMeetings.forEach((meeting, index) => {
    const day = normalizeWhitespace(meeting.days);
    const time = normalizeWhitespace(meeting.time);
    const location = normalizeWhitespace(meeting.location);
    if (!day || !time || !isUsjPracticalMeetingTime(time)) return;

    const patternKey = `${day}|${time}|${location}`;
    const occurrenceKey = `${patternKey}|${normalizeWhitespace(meeting.date) || `row-${index}`}`;
    let pattern = patterns.get(patternKey);
    if (!pattern) {
      pattern = {
        meeting: {
          days: day,
          time,
          location,
          section: normalizeWhitespace(meeting.section),
          type: normalizeWhitespace(meeting.type || "Class"),
        },
        occurrences: new Set(),
        dates: new Set(),
      };
      patterns.set(patternKey, pattern);
    }
    pattern.occurrences.add(occurrenceKey);
    if (normalizeWhitespace(meeting.date)) {
      pattern.dates.add(normalizeWhitespace(meeting.date));
    }
  });

  const candidates = [...patterns.values()].map((pattern) => ({
    ...pattern.meeting,
    occurrenceCount: pattern.occurrences.size,
    dates: [...pattern.dates],
  }));

  if (!candidates.length) return [];
  const hasRecurringPattern = candidates.some((meeting) => meeting.occurrenceCount >= 2);

  const byDay = new Map();
  for (const candidate of candidates) {
    const day = normalizeWhitespace(candidate.days);
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day).push(candidate);
  }

  const selected = [];

  for (const [day, dayCandidates] of byDay.entries()) {
    const clusters = [];

    for (const candidate of dayCandidates) {
      const range = parseUsjTimeRange(candidate.time);
      if (!range) continue;

      let cluster = clusters.find((entry) =>
        Math.abs(entry.startMinutes - range.startMinutes) <= 15
        && Math.abs(entry.endMinutes - range.endMinutes) <= 30,
      );

      if (!cluster) {
        cluster = {
          day,
          startMinutes: range.startMinutes,
          endMinutes: range.endMinutes,
          occurrenceCount: 0,
          candidates: [],
          dates: new Set(),
        };
        clusters.push(cluster);
      }

      cluster.occurrenceCount += candidate.occurrenceCount;
      cluster.startMinutes = Math.min(cluster.startMinutes, range.startMinutes);
      cluster.endMinutes = Math.max(cluster.endMinutes, range.endMinutes);
      cluster.candidates.push(candidate);
      for (const date of candidate.dates || []) {
        cluster.dates.add(date);
      }
    }

    const recurringClusters = clusters
      .filter((cluster) => cluster.occurrenceCount >= 2)
      .sort((left, right) =>
        right.occurrenceCount - left.occurrenceCount
        || left.startMinutes - right.startMinutes,
      );

    let chosenClusters = recurringClusters;
    if (!chosenClusters.length) {
      chosenClusters = hasRecurringPattern
        ? []
        : clusters.length <= 2
        ? [...clusters].sort((left, right) => left.startMinutes - right.startMinutes)
        : [];
    } else {
      chosenClusters = chosenClusters.filter((cluster) => {
        const strongerClusters = recurringClusters.filter((candidate) => candidate.occurrenceCount > cluster.occurrenceCount);
        if (!strongerClusters.length) return true;

        const sharesDateWithStrongerCluster = strongerClusters.some((candidate) =>
          [...cluster.dates].some((date) => candidate.dates.has(date)),
        );
        if (sharesDateWithStrongerCluster) return true;

        const strongest = strongerClusters[0];
        return !(
          strongest.occurrenceCount >= cluster.occurrenceCount * 2
          && cluster.occurrenceCount <= 2
        );
      });
    }

    for (const cluster of chosenClusters) {
      const representative = [...cluster.candidates].sort((left, right) =>
        right.occurrenceCount - left.occurrenceCount
        || buildUsjMeetingSortKey(left).localeCompare(buildUsjMeetingSortKey(right)),
      )[0];
      if (!representative) continue;
      selected.push({
        ...representative,
        time: `${formatUsjMinutes(cluster.startMinutes)} - ${formatUsjMinutes(cluster.endMinutes)}`,
      });
    }
  }

  return selected
    .sort((left, right) => buildUsjMeetingSortKey(left).localeCompare(buildUsjMeetingSortKey(right)))
    .map(({ occurrenceCount, ...meeting }) => meeting);
}

function formatUsjMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseUsjScheduleTables(html) {
  const sections = [];
  const matches = [...String(html).matchAll(/<p[^>]*class=["']textegrand["'][^>]*>\s*<b>([\s\S]*?)<\/b>\s*<\/p>\s*<table[^>]*name=["']thetable["'][^>]*>([\s\S]*?)<\/table>/gi)];

  for (const match of matches) {
    const heading = cleanHtmlText(match[1]);
    if (!/semestre/i.test(heading) && !/groupe/i.test(heading)) {
      continue;
    }

    const groupMatch = heading.match(/groupe\s*:?\s*([0-9]+)/i);
    const semesterMatch = heading.match(/semestre\s*:?\s*([0-9]+)/i);
    const groupLabel = groupMatch ? `G${groupMatch[1]}` : "1";
    const semesterNumber = Number.parseInt(semesterMatch?.[1] || "0", 10) || null;
    const meetings = [];

    const rows = [...match[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const row of rows) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanHtmlText(cell[1]));
      if (cells.length < 3) continue;
      if (/jour/i.test(cells[0]) && /horaire/i.test(cells[1])) continue;

      const dayLabel = parseUsjDay(cells[0]);
      const time = normalizeUsjTime(cells[1]);
      const location = normalizeWhitespace(cells[2]);
      if (!dayLabel || time === "TBA") continue;

      meetings.push({
        days: dayLabel,
        time,
        location,
        date: parseUsjScheduleDate(cells[0]),
        section: groupLabel,
        type: "Class",
      });
    }

    const selectedMeetings = selectUsjRegularMeetings(meetings);
    if (!selectedMeetings.length) continue;
    sections.push({
      groupLabel,
      semesterNumber,
      meetings: selectedMeetings,
    });
  }

  return sections;
}

function normalizeUsjInlineTime(rawValue = "") {
  const match = normalizeWhitespace(rawValue).match(/^(\d{1,2})h(\d{2})$/i);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseUsjInlineSchedule(text = "") {
  const sections = [];
  const matches = [...String(text).matchAll(/Gr\.?\s*([0-9]+)\s+([A-Za-z\u00c0-\u017f]+)\s+de\s+([0-9]{1,2}h[0-9]{2})\s+[a\u00e0]\s+([0-9]{1,2}h[0-9]{2})/gi)];
  for (const match of matches) {
    const dayLabel = parseUsjDay(match[2]);
    const start = normalizeUsjInlineTime(match[3]);
    const end = normalizeUsjInlineTime(match[4]);
    if (!dayLabel || !start || !end) continue;
    sections.push({
      groupLabel: `G${match[1]}`,
      semesterNumber: null,
      meetings: [{
        days: dayLabel,
        time: `${start} - ${end}`,
        location: "TBA",
        section: `G${match[1]}`,
        type: "Class",
      }],
    });
  }
  return sections;
}

function buildUsjTerm(endYearValue, semesterNumber) {
  const endYear = Number.parseInt(String(endYearValue || ""), 10);
  if (!Number.isFinite(endYear) || !semesterNumber) return null;
  const startYear = endYear - 1;
  const season = semesterNumber === 1 ? "Fall" : semesterNumber === 2 ? "Spring" : "Summer";
  return {
    code: `usj-${endYear}-${semesterNumber}`,
    description: `${season} ${startYear}-${endYear}`,
  };
}

function buildUsjSectionCourses(baseCourse, detailMeta, scheduleSections, academicYearEnd) {
  const expandedCourses = [];

  scheduleSections.forEach((section, index) => {
    const term = buildUsjTerm(academicYearEnd, section.semesterNumber || 2);
    if (!term || !section.meetings.length) return;
    const sectionLabel = normalizeWhitespace(section.groupLabel || `${index + 1}`);
    const firstMeeting = section.meetings[0];

    expandedCourses.push({
      ...baseCourse,
      id: `usj:${term.code}:${slugify(`${baseCourse.usj_course_code || baseCourse.course_number}-${sectionLabel}`)}`,
      term_code: term.code,
      crn: `USJ-${baseCourse.usj_course_code || baseCourse.course_number}-${sectionLabel}`,
      section: sectionLabel,
      title: detailMeta.title || baseCourse.title,
      credits: Number.isFinite(detailMeta.credits) ? detailMeta.credits : baseCourse.credits,
      instructor: detailMeta.instructor || baseCourse.instructor,
      professor_id: professorIdFor("usj", detailMeta.instructor || baseCourse.instructor),
      campus: detailMeta.institution || baseCourse.campus,
      schedule: {
        days: firstMeeting.days,
        time: firstMeeting.time,
        location: firstMeeting.location,
        section: sectionLabel,
        type: firstMeeting.type || "Class",
      },
      meetings: section.meetings,
      hasPublishedMeetings: true,
      isCatalogOnly: false,
      sourceScheduleNote: "",
    });
  });

  return expandedCourses;
}

async function fetchUsjCourseDetails(course, cache, request) {
  const courseCode = String(course.usj_course_code || course.course_number || "").trim().toUpperCase();
  if (!courseCode) return null;

  const cached = cache[courseCode];
  if (isFreshCacheEntry(cached)) {
    return cached.result || null;
  }

  const detailsUrl = `${DETAILS_ROOT}/details_cours.php?code=${encodeURIComponent(courseCode)}`;
  try {
    const response = await requestWithRetries(request, detailsUrl, { timeout: 45000 }, `details ${courseCode}`);
    if (!response.ok()) {
      throw new Error(`details_cours status ${response.status()}`);
    }
    const detailsHtml = await response.text();
    const detailMeta = extractUsjDetailMeta(detailsHtml, courseCode);
    let sections = [];
    let academicYearEnd = null;
    let semesterNumber = null;

    if (detailMeta.scheduleUrl) {
      const popupResponse = await requestWithRetries(request, detailMeta.scheduleUrl, { timeout: 45000 }, `schedule ${courseCode}`);
      if (!popupResponse.ok()) {
        throw new Error(`horaire_cours status ${popupResponse.status()}`);
      }
      const popupHtml = await popupResponse.text();
      sections = parseUsjScheduleTables(popupHtml);
      const params = new URL(detailMeta.scheduleUrl).searchParams;
      academicYearEnd = params.get("annee_univ");
      semesterNumber = Number.parseInt(params.get("semestre") || "0", 10) || null;
      sections = sections.map((section) => ({
        ...section,
        semesterNumber: section.semesterNumber || semesterNumber,
      }));
    }

    if (!sections.length && detailMeta.inlineScheduleText) {
      sections = parseUsjInlineSchedule(detailMeta.inlineScheduleText).map((section) => ({
        ...section,
        semesterNumber,
      }));
    }

    const result = {
      title: detailMeta.title || course.title,
      credits: detailMeta.credits,
      institution: detailMeta.institution,
      scheduleUrl: detailMeta.scheduleUrl,
      academicYearEnd,
      semesterNumber,
      sections,
      detailsUrl,
    };

    cache[courseCode] = {
      updatedAt: new Date().toISOString(),
      schemaVersion: DETAILS_CACHE_SCHEMA_VERSION,
      result,
    };
    return result;
  } catch (error) {
    logStep("usj detail failed", `${courseCode} -> ${error.message}`);
    if (cached?.result) {
      return cached.result;
    }
    return null;
  }
}

async function fetchUsjCatalog() {
  const catalogTerm = buildAcademicCatalogTerm("Catalog", { codePrefix: "catalog" });
  const cache = readDetailsCache();
  const session = await createUsjSession();

  try {
    const programLinks = await extractUsjProgramLinks(session.catalogPage);
    logStep("usj catalog docs", `${programLinks.length} candidate PDFs`);

    const baseCourses = [];
    const programCourseGroups = await mapWithConcurrency(programLinks, PDF_CONCURRENCY, async (program) => {
      try {
        return await fetchUsjProgramCourses(program, catalogTerm.code, session.request);
      } catch (error) {
        logStep("usj program failed", `${program.url} -> ${error.message}`);
        return [];
      }
    });

    programCourseGroups.forEach((group) => baseCourses.push(...group));

    const dedupedBaseCourses = dedupeBy(
      baseCourses,
      (course) => `${course.usj_course_code}`,
    );

    const timedCourses = [];
    const catalogFallbackCourses = [];
    const discoveredTerms = new Map();

    await mapWithConcurrency(dedupedBaseCourses, DETAILS_CONCURRENCY, async (course) => {
      const detail = await fetchUsjCourseDetails(course, cache, session.request);
      const sections = Array.isArray(detail?.sections) ? detail.sections : [];
      const expanded = sections.length
        ? buildUsjSectionCourses(course, detail, sections, detail.academicYearEnd)
        : [];

      if (expanded.length) {
        expanded.forEach((expandedCourse) => {
          timedCourses.push(expandedCourse);
          const term = buildUsjTerm(
            detail.academicYearEnd,
            expandedCourse.term_code.endsWith("-1") ? 1 : expandedCourse.term_code.endsWith("-2") ? 2 : 3,
          );
          if (term) discoveredTerms.set(term.code, term);
        });
        return;
      }

    catalogFallbackCourses.push({
      ...course,
      title: detail?.title || course.title,
      credits: Number.isFinite(detail?.credits) ? detail.credits : course.credits,
      instructor: detail?.instructor || course.instructor,
      professor_id: professorIdFor("usj", detail?.instructor || course.instructor),
      campus: detail?.institution || course.campus,
      sourceScheduleNote: "No public timed section feed was available for this course in the current USJ source.",
    });
    });

    writeDetailsCache(cache);

    const terms = [...discoveredTerms.values()];
    if (catalogFallbackCourses.length) {
      terms.push(catalogTerm);
    }

    if (!terms.length) {
      terms.push(catalogTerm);
    }

    const currentTerm = chooseCurrentTerm(
      terms,
      timedCourses.length
        ? (term) => term.code !== catalogTerm.code
        : () => true,
    );
    const normalizedTerms = terms.map((term) => ({
      ...term,
      is_current: term.code === currentTerm.code,
    }));

    const allCourses = [...timedCourses, ...catalogFallbackCourses];
    const uniqueSources = dedupeBy(
      [SOURCE_URL, DETAILS_ROOT, ...programLinks.map((program) => program.url)],
      (value) => value,
    );

    const timedCount = timedCourses.length.toLocaleString("en-US");
    const fallbackCount = catalogFallbackCourses.length.toLocaleString("en-US");
    const termCount = normalizedTerms.length.toLocaleString("en-US");

    return {
      availability: "partial",
      message: timedCourses.length
        ? `Official USJ course detail pages verified. Synced ${timedCount} section rows across ${termCount} published USJ terms, with ${fallbackCount} catalog-only courses kept when no public timetable page was available.`
        : `Official USJ program documents verified. Seeded ${fallbackCount} searchable courses from public program documents; live section times still require a public timetable page for each course.`,
      terms: normalizedTerms,
      courses: allCourses,
      sources: uniqueSources,
    };
  } finally {
    await closeUsjSession(session);
  }
}

module.exports = {
  fetchUsjCatalog,
};
