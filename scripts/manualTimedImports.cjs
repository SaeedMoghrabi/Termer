const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const {
  buildAcademicCatalogTerm,
  dedupeBy,
  ensureDir,
  normalizeHeuristicRange,
  normalizeMeridianRange,
  normalizeWhitespace,
  parseCompactDays,
  professorIdFor,
  slugify,
  splitCourseCode,
} = require("./catalogUtils.cjs");

const IMPORT_ROOTS = [
  path.join(__dirname, "..", "data", "manual-timetables"),
  path.join(__dirname, "..", "manual-timetables"),
  ...(process.env.USERPROFILE
    ? [
        path.join(process.env.USERPROFILE, "Desktop", "Termer Timetables"),
        path.join(process.env.USERPROFILE, "Downloads", "Termer Timetables"),
      ]
    : []),
];

const CSV_SPLIT_REGEX = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;
const TERM_ALIAS_KEYS = [
  "term",
  "termcode",
  "term_code",
  "semester",
  "semestercode",
  "semester_code",
];
const TERM_DESCRIPTION_KEYS = [
  "termdescription",
  "term_description",
  "semesterlabel",
  "semester_label",
  "label",
];
const COURSE_CODE_KEYS = [
  "code",
  "course",
  "coursecode",
  "course_code",
  "subjectcourse",
  "subject_course",
];
const TITLE_KEYS = [
  "title",
  "coursetitle",
  "course_title",
  "name",
];
const SECTION_KEYS = ["section", "sec", "group"];
const CRN_KEYS = ["crn", "id", "reference", "referenceid", "reference_id"];
const INSTRUCTOR_KEYS = ["instructor", "professor", "teacher", "faculty"];
const CAMPUS_KEYS = ["campus", "branch", "site"];
const LOCATION_KEYS = ["location", "room", "building", "place"];
const DAYS_KEYS = ["days", "day", "meetingdays", "meeting_days"];
const TIME_KEYS = ["time", "meetingtime", "meeting_time", "hours"];
const START_KEYS = ["start", "starttime", "start_time"];
const END_KEYS = ["end", "endtime", "end_time"];
const TYPE_KEYS = ["type", "scheduletype", "schedule_type", "component"];
const CREDITS_KEYS = ["credits", "credit"];
const CAPACITY_KEYS = ["capacity", "limit", "cap"];
const ENROLLED_KEYS = ["enrolled", "enrolledcount", "enrolled_count", "registered"];
const ATTRIBUTES_KEYS = ["attributes", "attribute", "tags"];
const PREREQUISITES_KEYS = ["prerequisites", "prerequisite", "prereq"];

function normalizeKey(value = "") {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getFirstValue(record, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== "") {
      return record[key];
    }
  }
  return "";
}

function parseCsv(text = "") {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headers = lines[0]
    .split(CSV_SPLIT_REGEX)
    .map((entry) => normalizeKey(entry.replace(/^"|"$/g, "")));
  return lines.slice(1).map((line) => {
    const values = line
      .split(CSV_SPLIT_REGEX)
      .map((entry) => entry.replace(/^"|"$/g, "").replace(/""/g, '"'));
    const row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = values[index] ?? "";
    });
    return row;
  });
}

function parseJson(text = "") {
  const parsed = JSON.parse(String(text));
  if (Array.isArray(parsed)) {
    return { terms: [], rows: parsed, courses: [] };
  }
  return {
    terms: Array.isArray(parsed?.terms) ? parsed.terms : [],
    courses: Array.isArray(parsed?.courses) ? parsed.courses : [],
    rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
  };
}

function parseWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    rows.push(...xlsx.utils.sheet_to_json(sheet, { defval: "" }));
  }
  return { terms: [], rows };
}

function collectImportFiles(universityId) {
  const files = [];
  for (const dir of getImportDirectories(universityId)) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (![".json", ".csv", ".xlsx", ".xls"].includes(extension)) continue;
      files.push(path.join(dir, entry.name));
    }
  }
  return dedupeBy(files, (filePath) => filePath);
}

function getImportDirectories(universityId) {
  return IMPORT_ROOTS.map((root) => {
    const dir = path.join(root, universityId);
    ensureDir(dir);
    return dir;
  });
}

function normalizeAttributes(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map((entry) => normalizeWhitespace(entry)).filter(Boolean);
  }
  const text = normalizeWhitespace(rawValue);
  if (!text) return [];
  return text
    .split(/[|;,/]+/)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

function normalizeTimeRange(timeValue = "", startValue = "", endValue = "") {
  function rangeMinutes(value) {
    const [rangeStart = "", rangeEnd = ""] = String(value).split(" - ").map((item) => normalizeWhitespace(item));
    const parseMinutes = (token) => {
      const match = token.match(/^(\d{2}):(\d{2})$/);
      if (!match) return null;
      return (Number.parseInt(match[1], 10) * 60) + Number.parseInt(match[2], 10);
    };
    const startMinutes = parseMinutes(rangeStart);
    const endMinutes = parseMinutes(rangeEnd);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return Number.POSITIVE_INFINITY;
    return endMinutes - startMinutes;
  }

  function buildPracticalMeridianCandidates(rawRange = "") {
    const [leftRaw = "", rightRaw = ""] = String(rawRange).split("-").map((item) => normalizeWhitespace(item));
    const leftHasMeridian = /\b(am|pm)\b/i.test(leftRaw);
    const rightHasMeridian = /\b(am|pm)\b/i.test(rightRaw);
    const leftToken = leftRaw.match(/^(\d{1,2})(?::(\d{2}))?/);
    const rightMeridian = rightRaw.match(/\b(am|pm)\b/i)?.[1]?.toLowerCase();
    if (!leftToken || leftHasMeridian || !rightHasMeridian) return [];

    const leftMinute = Number.parseInt(leftToken[2] || "0", 10);
    const buildCandidateRange = (meridian) =>
      normalizeMeridianRange(
        `${leftToken[1]}:${String(leftMinute).padStart(2, "0")} ${meridian}-${rightRaw}`.replace(/\s*-\s*/g, "-"),
      );

    const candidates = [buildCandidateRange(rightMeridian)];
    if (rightMeridian === "pm") candidates.push(buildCandidateRange("am"));

    return candidates
      .filter((candidate) => candidate && candidate !== "TBA")
      .map((candidate) => ({ value: candidate, minutes: rangeMinutes(candidate) }))
      .filter((candidate) => Number.isFinite(candidate.minutes) && candidate.minutes > 0 && candidate.minutes <= 240)
      .sort((leftCandidate, rightCandidate) => leftCandidate.minutes - rightCandidate.minutes);
  }

  const start = normalizeWhitespace(startValue);
  const end = normalizeWhitespace(endValue);
  if (start && end) {
    const combined = `${start}-${end}`;
    const merged = normalizeMeridianRange(combined);
    if (merged !== "TBA") return merged;
    const practical = buildPracticalMeridianCandidates(combined);
    if (practical.length) return practical[0].value;
    const heuristic = normalizeHeuristicRange(combined);
    if (heuristic !== "TBA") return heuristic;
  }

  const raw = normalizeWhitespace(timeValue);
  if (!raw) return "TBA";
  if (/\b(am|pm)\b/i.test(raw)) {
    const normalizedMeridian = normalizeMeridianRange(raw);
    if (normalizedMeridian !== "TBA") return normalizedMeridian;
    const practical = buildPracticalMeridianCandidates(raw);
    if (practical.length) return practical[0].value;
  }

  return normalizeHeuristicRange(raw);
}

function buildCourseKey(universityId, termCode, code, section, crn) {
  return [
    universityId,
    normalizeWhitespace(termCode),
    normalizeWhitespace(code).toUpperCase(),
    normalizeWhitespace(section).toUpperCase(),
    normalizeWhitespace(crn),
  ].join("|");
}

function resolveImportedCourseParts(universityId, rawCode = "") {
  const { department, courseNumber } = splitCourseCode(rawCode);
  if (department && courseNumber) {
    return { department, courseNumber };
  }

  const normalizedCode = normalizeWhitespace(rawCode).toUpperCase();
  if (!normalizedCode) return { department: "", courseNumber: "" };

  // Some official exports (notably USJ) use numeric-leading full course identifiers
  // instead of a classic "SUBJ 123" split. Preserve those identifiers as the
  // course_number while using the university id as a stable department bucket.
  if (/^[0-9]/.test(normalizedCode)) {
    return {
      department: String(universityId || "").trim().toUpperCase() || "COURSE",
      courseNumber: normalizedCode,
    };
  }

  return { department, courseNumber };
}

function buildImportedCourseCode(rawCode = "", department = "", courseNumber = "") {
  const normalizedCode = normalizeWhitespace(rawCode).toUpperCase();
  if (!normalizedCode) return "";
  if (/^[0-9]/.test(normalizedCode)) return normalizedCode;
  return `${department} ${courseNumber}`.trim();
}

function normalizeImportedDays(rawDays = "") {
  const normalized = normalizeWhitespace(rawDays);
  if (!normalized) return "TBA";

  const lower = normalized.toLowerCase();
  const fullWordTokens = lower.split(/[^a-z]+/).filter(Boolean);
  const tokenMap = {
    monday: "M",
    mon: "M",
    tuesday: "T",
    tue: "T",
    tues: "T",
    wednesday: "W",
    wed: "W",
    thursday: "R",
    thu: "R",
    thur: "R",
    thurs: "R",
    friday: "F",
    fri: "F",
    saturday: "S",
    sat: "S",
  };

  const expanded = fullWordTokens
    .map((token) => tokenMap[token])
    .filter(Boolean);
  if (expanded.length) {
    return dedupeBy(expanded, (value) => value).join(" ");
  }

  return parseCompactDays(normalized);
}

function buildImportedCourse(universityId, record, filePath, fallbackTermCode = "", fallbackTermDescription = "") {
  const termCode = normalizeWhitespace(getFirstValue(record, TERM_ALIAS_KEYS)) || fallbackTermCode;
  const termDescription = normalizeWhitespace(getFirstValue(record, TERM_DESCRIPTION_KEYS)) || fallbackTermDescription;
  const rawCode = normalizeWhitespace(getFirstValue(record, COURSE_CODE_KEYS)).toUpperCase();
  const title = normalizeWhitespace(getFirstValue(record, TITLE_KEYS));
  const section = normalizeWhitespace(getFirstValue(record, SECTION_KEYS)).toUpperCase() || "1";
  const crn = normalizeWhitespace(getFirstValue(record, CRN_KEYS)) || `${rawCode}-${section}`;
  const instructor = normalizeWhitespace(getFirstValue(record, INSTRUCTOR_KEYS)) || "TBA";
  const campus = normalizeWhitespace(getFirstValue(record, CAMPUS_KEYS)) || "TBA";
  const location = normalizeWhitespace(getFirstValue(record, LOCATION_KEYS)) || "TBA";
  const days = normalizeImportedDays(getFirstValue(record, DAYS_KEYS));
  const time = normalizeTimeRange(
    getFirstValue(record, TIME_KEYS),
    getFirstValue(record, START_KEYS),
    getFirstValue(record, END_KEYS),
  );
  const type = normalizeWhitespace(getFirstValue(record, TYPE_KEYS)) || "Lecture";
  const credits = Number.parseFloat(String(getFirstValue(record, CREDITS_KEYS)).replace(",", "."));
  const capacity = Number.parseInt(String(getFirstValue(record, CAPACITY_KEYS)).replace(/[^\d-]/g, ""), 10);
  const enrolled = Number.parseInt(String(getFirstValue(record, ENROLLED_KEYS)).replace(/[^\d-]/g, ""), 10);
  const prerequisites = normalizeWhitespace(getFirstValue(record, PREREQUISITES_KEYS)) || null;
  const attributes = normalizeAttributes(getFirstValue(record, ATTRIBUTES_KEYS));
  if (!termCode || !rawCode || !title || days === "TBA" || time === "TBA") return null;

  const { department, courseNumber } = resolveImportedCourseParts(universityId, rawCode);
  if (!department || !courseNumber) return null;

  return {
      id: `${universityId}:${termCode}:${slugify(`${rawCode}-${section}-${crn}`)}`,
      term_code: termCode,
      term_description: termDescription || buildAcademicCatalogTerm("Imported timetable").description,
      crn,
      code: buildImportedCourseCode(rawCode, department, courseNumber),
      department,
      course_number: courseNumber,
    section,
    title,
    credits: Number.isFinite(credits) ? credits : 0,
    instructor,
    professor_id: professorIdFor(universityId, instructor),
    campus,
    schedule: {
      days,
      time,
      location,
      section,
      type,
    },
    meetings: [{
      days,
      time,
      location,
      section,
      type,
    }],
    capacity: Number.isFinite(capacity) ? capacity : 0,
    enrolled_count: Number.isFinite(enrolled) ? enrolled : 0,
    prerequisites,
    attributes,
    has_published_meetings: true,
    source_schedule_note: `Imported from official timetable file ${path.basename(filePath)}`,
    source_file: filePath,
  };
}

function normalizeImportedMeeting(record = {}, fallbackSection = "") {
  const section = normalizeWhitespace(
    getFirstValue(record, SECTION_KEYS) || fallbackSection || record.section || record.schedule?.section,
  ).toUpperCase() || "1";
  const location = normalizeWhitespace(getFirstValue(record, LOCATION_KEYS) || record.location || record.schedule?.location) || "TBA";
  const days = normalizeImportedDays(getFirstValue(record, DAYS_KEYS) || record.days || record.schedule?.days);
  const time = normalizeTimeRange(
    getFirstValue(record, TIME_KEYS) || record.time || record.schedule?.time,
    getFirstValue(record, START_KEYS) || record.start || record.schedule?.start,
    getFirstValue(record, END_KEYS) || record.end || record.schedule?.end,
  );
  const type = normalizeWhitespace(getFirstValue(record, TYPE_KEYS) || record.type || record.schedule?.type) || "Lecture";
  if (days === "TBA" || time === "TBA") return null;

  const meeting = {
    days,
    time,
    location,
    section,
    type,
  };

  if (Array.isArray(record.dates) && record.dates.length) {
    meeting.dates = record.dates.map((value) => normalizeWhitespace(value)).filter(Boolean);
  }

  return meeting;
}

function buildStructuredImportedCourse(universityId, record, filePath, fallbackTermCode = "", fallbackTermDescription = "") {
  const termCode = normalizeWhitespace(getFirstValue(record, TERM_ALIAS_KEYS) || record.term_code || record.termCode) || fallbackTermCode;
  const termDescription = normalizeWhitespace(
    getFirstValue(record, TERM_DESCRIPTION_KEYS) || record.term_description || record.termDescription,
  ) || fallbackTermDescription;
  const rawCode = normalizeWhitespace(getFirstValue(record, COURSE_CODE_KEYS) || record.code).toUpperCase();
  const title = normalizeWhitespace(getFirstValue(record, TITLE_KEYS) || record.title);
  const section = normalizeWhitespace(getFirstValue(record, SECTION_KEYS) || record.section || record.schedule?.section).toUpperCase() || "1";
  const crn = normalizeWhitespace(getFirstValue(record, CRN_KEYS) || record.crn) || `${rawCode}-${section}`;
  const instructor = normalizeWhitespace(getFirstValue(record, INSTRUCTOR_KEYS) || record.instructor) || "TBA";
  const campus = normalizeWhitespace(getFirstValue(record, CAMPUS_KEYS) || record.campus) || "TBA";
  const credits = Number.parseFloat(String(getFirstValue(record, CREDITS_KEYS) || record.credits).replace(",", "."));
  const capacity = Number.parseInt(String(getFirstValue(record, CAPACITY_KEYS) || record.capacity).replace(/[^\d-]/g, ""), 10);
  const enrolled = Number.parseInt(
    String(getFirstValue(record, ENROLLED_KEYS) || record.enrolled_count || record.enrolledCount).replace(/[^\d-]/g, ""),
    10,
  );
  const prerequisites = normalizeWhitespace(getFirstValue(record, PREREQUISITES_KEYS) || record.prerequisites) || null;
  const attributes = normalizeAttributes(getFirstValue(record, ATTRIBUTES_KEYS) || record.attributes);
  if (!termCode || !rawCode || !title) return null;

  const { department, courseNumber } = resolveImportedCourseParts(universityId, rawCode);
  if (!department || !courseNumber) return null;

  const meetings = Array.isArray(record.meetings)
    ? record.meetings.map((meeting) => normalizeImportedMeeting(meeting, section)).filter(Boolean)
    : [normalizeImportedMeeting(record.schedule || record, section)].filter(Boolean);

  if (!meetings.length) return null;

  return {
      id: `${universityId}:${termCode}:${slugify(`${rawCode}-${section}-${crn}`)}`,
      term_code: termCode,
      term_description: termDescription || buildAcademicCatalogTerm("Imported timetable").description,
      crn,
      code: buildImportedCourseCode(rawCode, department, courseNumber),
      department,
      course_number: courseNumber,
    section,
    title,
    credits: Number.isFinite(credits) ? credits : 0,
    instructor,
    professor_id: professorIdFor(universityId, instructor),
    campus,
    schedule: meetings[0],
    meetings,
    capacity: Number.isFinite(capacity) ? capacity : 0,
    enrolled_count: Number.isFinite(enrolled) ? enrolled : 0,
    prerequisites,
    attributes,
    has_published_meetings: true,
    source_schedule_note: normalizeWhitespace(record.source_schedule_note || record.sourceScheduleNote)
      || `Imported from official timetable file ${path.basename(filePath)}`,
    source_file: filePath,
  };
}

function mergeImportedSections(baseCourses = [], importedCourses = []) {
  const merged = new Map();

  for (const course of baseCourses) {
    merged.set(
      buildCourseKey(
        course.university_id || "",
        course.term_code || "",
        course.code || `${course.department || ""} ${course.course_number || ""}`,
        course.section || "",
        course.crn || "",
      ),
      { ...course },
    );
  }

  for (const course of importedCourses) {
    const key = buildCourseKey(
      course.university_id || "",
      course.term_code || "",
      course.code || `${course.department || ""} ${course.course_number || ""}`,
      course.section || "",
      course.crn || "",
    );
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, course);
      continue;
    }

    merged.set(key, {
      ...existing,
      ...course,
      title: course.title || existing.title,
      credits: Number.isFinite(course.credits) ? course.credits : existing.credits,
      instructor: course.instructor || existing.instructor,
      professor_id: course.professor_id || existing.professor_id,
      campus: course.campus || existing.campus,
      prerequisites: course.prerequisites || existing.prerequisites || null,
      attributes: dedupeBy([...(existing.attributes || []), ...(course.attributes || [])], (value) => String(value)),
      meetings: Array.isArray(course.meetings) && course.meetings.length ? course.meetings : existing.meetings,
      schedule: course.schedule || existing.schedule,
      capacity: Number.isFinite(course.capacity) ? course.capacity : existing.capacity,
      enrolled_count: Number.isFinite(course.enrolled_count) ? course.enrolled_count : existing.enrolled_count,
      has_published_meetings: course.has_published_meetings || existing.has_published_meetings,
      source_schedule_note: course.source_schedule_note || existing.source_schedule_note,
      isCatalogOnly: false,
    });
  }

  return [...merged.values()];
}

function stripImportedTimedMessage(message = "") {
  return String(message || "")
    .replace(/\s*Imported [\d,]+ timed sections from \d+ official local timetable files?\.\s*$/i, "")
    .trim();
}

function buildTermsFromImportedCourses(importedCourses = [], importedTerms = []) {
  const termMap = new Map();
  for (const term of importedTerms) {
    if (!term?.code) continue;
    termMap.set(String(term.code), { ...term });
  }
  for (const course of importedCourses) {
    const termCode = String(course.term_code || "").trim();
    if (!termCode) continue;
    if (!termMap.has(termCode)) {
      termMap.set(termCode, {
        code: termCode,
        description: course.term_description || buildAcademicCatalogTerm("Imported timetable").description,
        is_current: false,
      });
    }
  }
  return [...termMap.values()];
}

function loadManualTimedImports(universityId) {
  const files = collectImportFiles(universityId);
  const importedTerms = [];
  const importedCourses = [];
  const usedFiles = new Set();

  for (const filePath of files) {
    try {
      const lower = filePath.toLowerCase();
      const text = lower.endsWith(".xlsx") || lower.endsWith(".xls")
        ? ""
        : fs.readFileSync(filePath, "utf8");
      let parsed;
      if (lower.endsWith(".json")) {
        parsed = parseJson(text);
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        parsed = parseWorkbook(filePath);
      } else {
        parsed = { terms: [], rows: parseCsv(text) };
      }

      importedTerms.push(...(parsed.terms || []));
      const fallbackTermCode = normalizeWhitespace(parsed?.term?.code || parsed?.termCode || "");
      const fallbackTermDescription = normalizeWhitespace(parsed?.term?.description || parsed?.termDescription || "");
      for (const rawCourse of parsed.courses || []) {
        const record = {};
        for (const [key, value] of Object.entries(rawCourse || {})) {
          record[normalizeKey(key)] = value;
        }
        record.meetings = Array.isArray(rawCourse?.meetings) ? rawCourse.meetings : [];
        record.schedule = rawCourse?.schedule || null;
        record.sourceScheduleNote = rawCourse?.source_schedule_note || rawCourse?.sourceScheduleNote || "";
        const course = buildStructuredImportedCourse(universityId, record, filePath, fallbackTermCode, fallbackTermDescription);
        if (course) {
          course.university_id = universityId;
          importedCourses.push(course);
          usedFiles.add(filePath);
        }
      }
      for (const rawRecord of parsed.rows || []) {
        const record = {};
        for (const [key, value] of Object.entries(rawRecord || {})) {
          record[normalizeKey(key)] = value;
        }
        const course = buildImportedCourse(universityId, record, filePath, fallbackTermCode, fallbackTermDescription);
        if (course) {
          course.university_id = universityId;
          importedCourses.push(course);
          usedFiles.add(filePath);
        }
      }
    } catch (error) {
      // Ignore broken import files but keep other files usable.
    }
  }

  return {
    files,
    usedFiles: [...usedFiles],
    terms: buildTermsFromImportedCourses(importedCourses, importedTerms),
    courses: dedupeBy(
      importedCourses,
      (course) => buildCourseKey(universityId, course.term_code, course.code, course.section, course.crn),
    ),
  };
}

function mergeCatalogWithManualTimedImports(universityId, result) {
  const manual = loadManualTimedImports(universityId);
  if (!manual.courses.length) {
    return {
      ...result,
      importedTimedSections: 0,
      importedTimedFiles: [],
    };
  }

  const existingTerms = Array.isArray(result.terms) ? result.terms : [result.term].filter(Boolean);
  const mergedTerms = dedupeBy(
    [...existingTerms, ...manual.terms],
    (term) => String(term?.code || ""),
  );
  const baseCourses = Array.isArray(result.courses) ? result.courses.map((course) => ({ university_id: universityId, ...course })) : [];
  const mergedCourses = mergeImportedSections(baseCourses, manual.courses);
  const sources = dedupeBy([...(result.sources || []), ...manual.files], (value) => String(value));
  const effectiveFiles = manual.usedFiles.length ? manual.usedFiles : manual.files;
  const baseMessage = stripImportedTimedMessage(result.message);

  return {
    ...result,
    terms: mergedTerms,
    term: mergedTerms[0] || result.term,
    courses: mergedCourses,
    sources,
    importedTimedSections: manual.courses.length,
    importedTimedFiles: effectiveFiles,
    message: `${baseMessage} Imported ${manual.courses.length.toLocaleString("en-US")} timed sections from ${effectiveFiles.length} official local timetable file${effectiveFiles.length === 1 ? "" : "s"}.`.trim(),
  };
}

module.exports = {
  getImportDirectories,
  IMPORT_ROOTS,
  collectImportFiles,
  loadManualTimedImports,
  mergeImportedSections,
  mergeCatalogWithManualTimedImports,
  stripImportedTimedMessage,
};
