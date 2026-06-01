const { chromium } = require("playwright");
const {
  dedupeBy,
  logStep,
  normalizeDigitsTime,
  normalizeWhitespace,
  professorIdFor,
} = require("./catalogUtils.cjs");

const SOURCE_URL = "https://mis.bau.edu.lb/web/v15/CourseOffering.aspx";
const PAGE_READY_TIMEOUT_MS = 180000;
const PAGE_SETTLE_DELAY_MS = 1000;
const BAU_DATA_COLUMN_COUNT = 15;
const BAU_DEBBIEH_LOCATION_PREFIX = /^(ENG|ARCH|SCIENC|A4)\b/i;

const HEADER_LINES = new Set([
  "CAMPUS",
  "FACULTY",
  "ATTRIBUTE",
  "#",
  "CAMP",
  "CRN",
  "COURSE",
  "TITLE",
  "SECTION",
  "CREDITS",
  "TYPE",
  "DAY",
  "TIME",
  "BLDG",
  "ROOM",
  "TEACHER",
  "CAPACITY",
  "FAC. REST.",
  "MJR. REST.",
]);

function stripContinuationLabel(value = "") {
  return normalizeWhitespace(String(value).replace(/\s*\(Continued on the next page\)\s*/gi, ""));
}

function parseBauTerm(pageText) {
  const match = pageText.match(/Course Offering for\s+([^\n]+)/i);
  const description = stripContinuationLabel(match?.[1] || "Current Term");
  const lower = description.toLowerCase();
  const years = [...description.matchAll(/20\d{2}/g)].map((entry) => Number(entry[0]));
  const effectiveYear = years.length ? years[years.length - 1] : new Date().getUTCFullYear();

  let suffix = "00";
  if (lower.includes("fall")) suffix = "10";
  else if (lower.includes("spring")) suffix = "20";
  else if (lower.includes("summer")) suffix = "30";
  else if (lower.includes("winter")) suffix = "40";

  return {
    code: `${effectiveYear}${suffix}`,
    description,
    is_current: true,
  };
}

function parseCapacityToken(rawValue = "") {
  const normalized = normalizeWhitespace(rawValue);
  if (!normalized || /^closed$/i.test(normalized)) {
    return 0;
  }

  const numeric = Number.parseInt(normalized, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeBauTime(rawValue = "") {
  const [rawStart = "", rawEnd = ""] = String(rawValue).split("-").map((value) => value.trim());
  const start = normalizeDigitsTime(rawStart);
  const end = normalizeDigitsTime(rawEnd);
  if (!start || !end) return "TBA";
  return `${start} - ${end}`;
}

function normalizeBauCampus(rawCampus = "", location = "") {
  const campus = stripContinuationLabel(rawCampus || "Main Campus");
  const normalizedCampus = campus.toLowerCase();
  const normalizedLocation = normalizeWhitespace(location).toUpperCase();
  const looksLikeDebbiehLocation = BAU_DEBBIEH_LOCATION_PREFIX.test(normalizedLocation);
  const looksLikeBeirutLabel = !normalizedCampus
    || normalizedCampus === "main campus"
    || normalizedCampus === "beirut"
    || normalizedCampus === "beirut campus";

  if (looksLikeBeirutLabel && looksLikeDebbiehLocation) {
    return "Debbieh";
  }

  return campus;
}

function parseBauColumns(line = "") {
  const columns = String(line)
    .replace(/\r/g, "")
    .split("\t")
    .map((value) => normalizeWhitespace(value));

  while (columns.length > BAU_DATA_COLUMN_COUNT && !columns[0]) {
    columns.shift();
  }

  while (columns.length < BAU_DATA_COLUMN_COUNT) {
    columns.push("");
  }

  return columns;
}

function parseBauCourseLine(line, context, termCode) {
  const columns = parseBauColumns(line);

  if (columns.length < 13) return null;
  if (!/^\d+$/.test(columns[1])) return null;

  const [
    rowCampus,
    crn,
    rawCourseCode,
    title,
    section,
    credits,
    scheduleType,
    day,
    time,
    building,
    room,
    teacher,
    capacityToken,
    facultyRestriction = "",
    majorRestriction = "",
  ] = columns;

  const courseMatch = rawCourseCode.match(/^([A-Z]+)([A-Z0-9]+)$/i);
  if (!courseMatch) return null;

  const department = courseMatch[1].toUpperCase();
  const courseNumber = courseMatch[2].toUpperCase();
  const instructor = teacher || "TBA";
  const capacity = parseCapacityToken(capacityToken);
  const attributes = [
    context.faculty,
    context.attribute,
    facultyRestriction,
    majorRestriction,
  ]
    .map((value) => stripContinuationLabel(value))
    .filter(Boolean);
  const location = [building, room].filter(Boolean).join(" ").trim() || "TBA";

  return {
    id: `bau:${termCode}:${crn}`,
    term_code: termCode,
    crn,
    code: `${department} ${courseNumber}`,
    department,
    course_number: courseNumber,
    section: section || "0",
    title: title || rawCourseCode,
    credits: Number(credits) || 0,
    instructor,
    professor_id: professorIdFor("bau", instructor),
    campus: normalizeBauCampus(context.campus || rowCampus || "Main Campus", location),
    schedule: {
      days: day || "TBA",
      time: normalizeBauTime(time),
      location,
      section: section || "0",
      type: scheduleType || "Lecture",
    },
    capacity,
    enrolled_count: capacity,
    prerequisites: null,
    attributes,
    restrictions: [facultyRestriction, majorRestriction]
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean),
  };
}

function parseBauContinuationLine(line, previousRow) {
  if (!previousRow) return null;

  const columns = parseBauColumns(line);
  if (columns.length < 13) return null;

  const [
    rowCampus,
    crn,
    rawCourseCode,
    title,
    section,
    credits,
    scheduleType,
    day,
    time,
    building,
    room,
    teacher,
    capacityToken,
    facultyRestriction = "",
    majorRestriction = "",
  ] = columns;

  const carriesPrimaryIdentity = [
    crn,
    rawCourseCode,
    title,
    section,
    credits,
    teacher,
    capacityToken,
  ].some((value) => normalizeWhitespace(value));
  const hasMeetingPayload = [day, time, building, room].some((value) => normalizeWhitespace(value));

  if (carriesPrimaryIdentity || !hasMeetingPayload) {
    return null;
  }

  return {
    ...previousRow,
    campus: normalizeBauCampus(
      previousRow.campus || rowCampus || "Main Campus",
      [building, room].filter(Boolean).join(" ").trim() || previousRow.schedule?.location || "TBA",
    ),
    attributes: [...new Set([
      ...(previousRow.attributes || []),
      ...[facultyRestriction, majorRestriction].map((value) => stripContinuationLabel(value)).filter(Boolean),
    ])],
    restrictions: [...new Set([
      ...(previousRow.restrictions || []),
      ...[facultyRestriction, majorRestriction].map((value) => normalizeWhitespace(value)).filter(Boolean),
    ])],
    schedule: {
      days: day || "TBA",
      time: normalizeBauTime(time),
      location: [building, room].filter(Boolean).join(" ").trim() || previousRow.schedule?.location || "TBA",
      section: previousRow.section || previousRow.schedule?.section || "0",
      type: scheduleType || previousRow.schedule?.type || "Lecture",
    },
  };
}

async function readBauGridText(page) {
  return page.evaluate(
    () => document.querySelector("#GVCourseOffering")?.innerText || "",
  );
}

async function expandBauGrid(page) {
  await page.evaluate(() => {
    if (window.GVCourseOffering?.ExpandAll) {
      window.GVCourseOffering.ExpandAll();
    }
  });
  await page.waitForTimeout(PAGE_SETTLE_DELAY_MS);
}

function parseBauRows(pageText, termCode) {
  const lines = pageText
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " "))
    .filter(Boolean);

  const context = {
    campus: "Main Campus",
    faculty: "",
    attribute: "",
  };
  const rows = [];
  let previousRow = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (HEADER_LINES.has(line)) continue;
    if (/^Page \d+ of \d+/i.test(line)) continue;
    if (/^\d+$/.test(line) || line === "…") continue;

    if (line.startsWith("CAMPUS:")) {
      context.campus = stripContinuationLabel(line.replace(/^CAMPUS:\s*/i, ""));
      continue;
    }

    if (line.startsWith("FACULTY:")) {
      context.faculty = stripContinuationLabel(line.replace(/^FACULTY:\s*/i, ""));
      continue;
    }

    if (line.startsWith("ATTRIBUTE:")) {
      context.attribute = stripContinuationLabel(line.replace(/^ATTRIBUTE:\s*/i, ""));
      continue;
    }

    if (!rawLine.includes("\t")) continue;

    const row = parseBauCourseLine(rawLine, context, termCode);
    if (row) {
      rows.push(row);
      previousRow = row;
      continue;
    }

    const continuationRow = parseBauContinuationLine(rawLine, previousRow);
    if (continuationRow) {
      rows.push(continuationRow);
    }
  }

  return rows;
}

function buildBauScheduleKey(schedule = {}) {
  return [
    normalizeWhitespace(schedule.days),
    normalizeWhitespace(schedule.time),
    normalizeWhitespace(schedule.location),
    normalizeWhitespace(schedule.section),
    normalizeWhitespace(schedule.type),
  ].join("|");
}

function mergeBauRows(rows = []) {
  const merged = new Map();

  for (const row of rows) {
    const key = `${row.term_code}:${row.crn}:${row.code}:${row.section}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...row,
        schedule: row.schedule ? [row.schedule] : [],
      });
      continue;
    }

    const schedules = Array.isArray(existing.schedule) ? existing.schedule.slice() : [];
    if (row.schedule) {
      const incomingKey = buildBauScheduleKey(row.schedule);
      if (!schedules.some((schedule) => buildBauScheduleKey(schedule) === incomingKey)) {
        schedules.push(row.schedule);
      }
    }

    merged.set(key, {
      ...existing,
      title: existing.title || row.title,
      instructor: existing.instructor === "TBA" ? row.instructor : existing.instructor,
      professor_id: existing.professor_id || row.professor_id,
      campus: existing.campus || row.campus,
      credits: Math.max(Number(existing.credits || 0), Number(row.credits || 0)),
      capacity: Math.max(Number(existing.capacity || 0), Number(row.capacity || 0)),
      enrolled_count: Math.max(Number(existing.enrolled_count || 0), Number(row.enrolled_count || 0)),
      attributes: [...new Set([...(existing.attributes || []), ...(row.attributes || [])].filter(Boolean))],
      restrictions: [...new Set([...(existing.restrictions || []), ...(row.restrictions || [])].filter(Boolean))],
      schedule: schedules,
    });
  }

  return [...merged.values()].map((course) => {
    const schedules = dedupeBy(
      Array.isArray(course.schedule) ? course.schedule : [],
      (schedule) => buildBauScheduleKey(schedule),
    );

    return {
      ...course,
      schedule: schedules.length <= 1 ? (schedules[0] ?? null) : schedules,
    };
  });
}

async function waitForGridPage(page, expectedPageNumber) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < PAGE_READY_TIMEOUT_MS) {
    await page.waitForTimeout(PAGE_SETTLE_DELAY_MS);
    const state = await page.evaluate(() => {
      const grid = window.GVCourseOffering;
      return {
        text: document.querySelector("#GVCourseOffering")?.innerText || "",
        pageIndex: typeof grid?.GetPageIndex === "function" ? Number(grid.GetPageIndex()) : null,
        pageCount: typeof grid?.GetPageCount === "function" ? Number(grid.GetPageCount()) : null,
        dataItemCount: typeof grid?.GetDataItemCountOnPage === "function" ? Number(grid.GetDataItemCountOnPage()) : null,
      };
    });

    const expectedPageIndex = expectedPageNumber - 1;
    const pageIndexMatches = Number.isFinite(state.pageIndex) && state.pageIndex === expectedPageIndex;
    const textMatches = new RegExp(`Page\\s+${expectedPageNumber}\\s+of\\s+\\d+`, "i").test(state.text);
    const pagerReady = Number.isFinite(state.pageCount) && state.pageCount >= expectedPageNumber;
    const hasRowData = (Number.isFinite(state.dataItemCount) && state.dataItemCount > 0)
      || /\t\d{5}\t[A-Z]{2,}\d+/i.test(state.text);
    const firstPageReady = expectedPageNumber !== 1 || (Number.isFinite(state.pageCount) && state.pageCount > 1) || hasRowData;

    if ((textMatches || (pageIndexMatches && pagerReady)) && !state.text.includes("Loading") && firstPageReady) {
      return state.text;
    }
  }

  throw new Error(`Timed out while waiting for BAU page ${expectedPageNumber}.`);
}

async function goToGridPage(page, pageIndex) {
  const expectedPageNumber = pageIndex + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url() === SOURCE_URL
          && response.request().method() === "POST",
        { timeout: PAGE_READY_TIMEOUT_MS },
      );

      await page.evaluate((nextPageIndex) => {
        if (window.GVCourseOffering?.GotoPage) {
          window.GVCourseOffering.GotoPage(nextPageIndex);
        }
      }, pageIndex);

      const response = await responsePromise;
      await response.finished().catch(() => undefined);
      return waitForGridPage(page, expectedPageNumber);
    } catch (error) {
      lastError = error;
      logStep("bau retry", `page ${expectedPageNumber}, attempt ${attempt}`);
      await page.waitForTimeout(4000);
    }
  }

  throw lastError ?? new Error(`Could not navigate to BAU page ${expectedPageNumber}.`);
}

function extractTotalPages(pageText) {
  const match = pageText.match(/Page\s+\d+\s+of\s+(\d+)/i);
  const totalPages = Number.parseInt(match?.[1] || "1", 10);
  return Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = String(error?.message || error || "");
    if (!/Executable doesn't exist|browserType\.launch/i.test(message)) {
      throw error;
    }

    logStep("bau browser fallback", "using installed Microsoft Edge");
    return chromium.launch({ headless: true, channel: "msedge" });
  }
}

async function fetchBauCatalog() {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(SOURCE_URL, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(5000);
    await expandBauGrid(page);

    const firstPageText = await waitForGridPage(page, 1);
    const firstPageBodyText = await page.locator("body").innerText();
    const term = parseBauTerm(firstPageBodyText);
    const totalPages = extractTotalPages(firstPageText);
    logStep("bau current term", `${term.description} (${term.code})`);
    logStep("bau pages", String(totalPages));

    const firstPageRows = parseBauRows(firstPageText, term.code);
    logStep("bau page", `1/${totalPages} -> ${firstPageRows.length} sections`);
    const rows = [...firstPageRows];

    for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
      let pageRows = [];
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          let pageText = await goToGridPage(page, pageIndex);
          pageRows = parseBauRows(pageText, term.code);

          if (!pageRows.length) {
            await expandBauGrid(page);
            pageText = await waitForGridPage(page, pageIndex + 1);
            pageRows = parseBauRows(pageText, term.code);
          }

          if (!pageRows.length) {
            throw new Error("Page returned no parseable sections after expansion.");
          }

          break;
        } catch (error) {
          lastError = error;
          logStep("bau page recover", `${pageIndex + 1}/${totalPages}, attempt ${attempt}`);
          await page.goto(SOURCE_URL, { waitUntil: "networkidle", timeout: 120000 });
          await page.waitForTimeout(5000);
          await expandBauGrid(page);
        }
      }

      if (!pageRows.length) {
        logStep("bau page skipped", `${pageIndex + 1}/${totalPages} -> ${lastError?.message || "unknown error"}`);
        continue;
      }

      logStep("bau page", `${pageIndex + 1}/${totalPages} -> ${pageRows.length} sections`);
      rows.push(...pageRows);
    }

    return {
      terms: [term],
      courses: mergeBauRows(rows),
    };
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

module.exports = {
  fetchBauCatalog,
};
