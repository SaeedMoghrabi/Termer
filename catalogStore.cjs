const fs = require("fs");
const path = require("path");
const { UNIVERSITIES, getUniversityConfig } = require("./catalogConfig.cjs");
const {
  getStaticPrerequisites,
  normalizeCourseCode,
  normalizePrerequisiteText,
} = require("./scripts/prerequisiteSources.cjs");
const {
  collectImportFiles,
  mergeCatalogWithManualTimedImports,
} = require("./scripts/manualTimedImports.cjs");

const DATA_DIR = path.join(__dirname, "data", "catalogs");
const SEED_DIR = path.join(__dirname, "CoursePlannerr", "public", "seed-catalogs");
const SUPPLEMENTAL_PREREQUISITES_PATH = path.join(DATA_DIR, "prerequisites.json");
const catalogCache = new Map();
let holdStaleCatalogCache = false;
const DAY_CODE_TO_LABEL = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
  S: "Saturday",
};
const DAY_TOKEN_MAP = {
  m: "M",
  mon: "M",
  monday: "M",
  t: "T",
  tue: "T",
  tues: "T",
  tuesday: "T",
  w: "W",
  wed: "W",
  wednesday: "W",
  r: "R",
  th: "R",
  thu: "R",
  thur: "R",
  thurs: "R",
  thursday: "R",
  f: "F",
  fri: "F",
  friday: "F",
  s: "S",
  sat: "S",
  saturday: "S",
};
const DAY_SORT_ORDER = { M: 0, T: 1, W: 2, R: 3, F: 4, S: 5 };

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripViewOnly(value = "") {
  return String(value).replace(/\s*\(view only\)\s*/gi, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCompact(value = "") {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "");
}

function buildTermId(universityId, termCode) {
  return `${universityId}:${termCode}`;
}

function parseTermId(termId, explicitUniversityId = "") {
  const raw = String(termId ?? "").trim();
  if (!raw) return { universityId: explicitUniversityId || "", termCode: "" };
  const match = raw.match(/^([a-z0-9_]+):(.*)$/i);
  if (match) return { universityId: match[1].toLowerCase(), termCode: match[2] };
  return { universityId: explicitUniversityId || "", termCode: raw };
}

function buildProfessorId(universityId, fullName = "") {
  const slug = slugify(fullName) || "tba";
  return `${String(universityId || "").toLowerCase()}__${slug}`;
}

function buildReviewDepartment(universityId, department = "") {
  return `${String(universityId || "").toUpperCase()}__${String(department || "").trim().toUpperCase()}`;
}

function fileExists(filePath) {
  try { return fs.existsSync(filePath); } catch { return false; }
}

function readJson(filePath) {
  if (!fileExists(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function fileMtimeMs(filePath) {
  try { return fs.statSync(filePath).mtimeMs; } catch { return 0; }
}

function catalogPath(universityId) {
  return path.join(DATA_DIR, `${universityId}.json`);
}

function backupCatalogPath(universityId) {
  return path.join(DATA_DIR, `${universityId}.backup.json`);
}

function seedCatalogPath(universityId) {
  return path.join(SEED_DIR, `${universityId}.json`);
}

function hasCourses(payload) {
  return Boolean(payload && Array.isArray(payload.courses) && payload.courses.length > 0);
}

function chooseCatalogPayload(universityId) {
  const primary = readJson(catalogPath(universityId));
  const backup = readJson(backupCatalogPath(universityId));
  const seed = readJson(seedCatalogPath(universityId));

  if (hasCourses(primary)) return primary;
  if (hasCourses(backup)) return backup;
  if (hasCourses(seed)) {
    if (primary && Array.isArray(primary.terms) && primary.terms.length > 0) {
      return {
        ...seed,
        ...primary,
        courses: seed.courses,
        professors: Array.isArray(primary.professors) && primary.professors.length > 0
          ? primary.professors
          : Array.isArray(seed.professors) ? seed.professors : [],
        sources: [...new Set([...(Array.isArray(primary.sources) ? primary.sources : []), ...(Array.isArray(seed.sources) ? seed.sources : [])])],
      };
    }
    return seed;
  }

  return primary || backup || seed || null;
}

function readSupplementalPrerequisites() {
  return readJson(SUPPLEMENTAL_PREREQUISITES_PATH) || {};
}

function getSupplementalPrerequisite(universityId, course = {}) {
  const supplemental = readSupplementalPrerequisites();
  const pool = {
    ...getStaticPrerequisites(universityId),
    ...(supplemental?.[universityId] && typeof supplemental[universityId] === "object" ? supplemental[universityId] : {}),
  };
  const code = normalizeCourseCode(course.code || `${course.department || ""} ${course.course_number || ""}`);
  const compactCode = code.replace(/\s+/g, "");
  const direct = pool[code] || pool[compactCode];
  const fallback = direct || Object.entries(pool).find(([key]) => normalizeCourseCode(key).replace(/\s+/g, "") === compactCode)?.[1];
  const value = typeof fallback === "object" && fallback !== null ? fallback.prerequisites : fallback;
  return normalizePrerequisiteText(value) || null;
}

function normalizeMeetingRecord(meeting = {}, course = {}) {
  if (!meeting || typeof meeting !== "object") return null;
  const days = normalizeText(meeting.days ?? meeting.day ?? course.days ?? "");
  const start = normalizeText(meeting.start || "");
  const end = normalizeText(meeting.end || "");
  const fallbackTime = start && end ? `${start} - ${end}` : "";
  const timeSource = meeting.time ?? fallbackTime ?? course.time ?? "";
  const time = normalizeText(timeSource);
  const location = normalizeText(meeting.location ?? meeting.room ?? course.location ?? "");
  const section = normalizeText(meeting.section ?? course.section ?? "");
  const type = normalizeText(meeting.type ?? course.scheduleType ?? course.schedule_type ?? "");
  if (!days && !time && !location && !section && !type) return null;
  return { days, time, location, section, type };
}

function getMeetingRecords(course = {}) {
  const directMeetings = Array.isArray(course.meetings) ? course.meetings.map((meeting) => normalizeMeetingRecord(meeting, course)).filter(Boolean) : [];
  if (directMeetings.length > 0) return mergeCompatibleMeetingRecords(directMeetings);
  if (Array.isArray(course.schedule)) return mergeCompatibleMeetingRecords(course.schedule.map((meeting) => normalizeMeetingRecord(meeting, course)).filter(Boolean));
  if (course.schedule && typeof course.schedule === "object") {
    const meeting = normalizeMeetingRecord(course.schedule, course);
    return meeting ? mergeCompatibleMeetingRecords([meeting]) : [];
  }
  const fallback = normalizeMeetingRecord(course, course);
  return fallback ? mergeCompatibleMeetingRecords([fallback]) : [];
}

function buildMeetingKey(meeting = {}) {
  return [meeting.days, meeting.time, meeting.location, meeting.section, meeting.type].map((value) => normalizeText(value)).join("|");
}

function uniqueBy(items = [], getKey) {
  const seen = new Set();
  const next = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

function courseMergeKey(course = {}) {
  const universityId = String(course.university_id || "").trim().toLowerCase();
  const termCode = String(course.term_code || course.semester || "").trim();
  const code = normalizeCourseCode(course.code || `${course.department || ""} ${course.course_number || ""}`);
  const section = normalizeText(course.section || course.schedule?.section || "");
  const crn = normalizeText(course.crn || "");
  return [universityId, termCode, crn, code, section].join("|");
}

function courseSectionKey(course = {}) {
  const universityId = String(course.university_id || "").trim().toLowerCase();
  const code = normalizeCourseCode(course.code || `${course.department || ""} ${course.course_number || ""}`);
  const section = normalizeText(course.section || course.schedule?.section || "");
  const crn = normalizeText(course.crn || "");
  return [universityId, crn, code, section].join("|");
}

function isPlaceholderTermCode(termCode = "") {
  return /^20\d{2}00$/.test(String(termCode || "").trim());
}

function getEffectiveTermCode(course = {}) {
  const direct = normalizeText(course.term_code || "");
  if (direct) return direct;
  const semester = normalizeText(course.semester || "");
  const parsed = parseTermId(semester);
  return normalizeText(parsed.termCode || semester);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((entry) => normalizeText(entry)).filter(Boolean);
  const text = normalizeText(value);
  return text ? [text] : [];
}

function courseHasPublishedMeetings(course = {}) {
  return getMeetingRecords(course).some((meeting) => {
    const days = normalizeText(meeting?.days || "");
    const time = normalizeText(meeting?.time || "");
    return days && time && time !== "TBA";
  });
}

function isCatalogPlaceholderCourse(course = {}) {
  const section = normalizeText(course.section || course.schedule?.section || "");
  const type = normalizeText(course.schedule?.type || course.scheduleTypeDescription || "");
  return section === "CAT" || /^catalog$/i.test(type);
}

function suppressCatalogPlaceholders(courses = []) {
  const codesWithTimedSections = new Set(
    courses
      .filter((course) => courseHasPublishedMeetings(course))
      .map((course) => normalizeCourseCode(course.code || `${course.department || ""} ${course.course_number || ""}`))
      .filter(Boolean),
  );

  if (!codesWithTimedSections.size) return courses;

  return courses.filter((course) => {
    if (!isCatalogPlaceholderCourse(course)) return true;
    const code = normalizeCourseCode(course.code || `${course.department || ""} ${course.course_number || ""}`);
    return !codesWithTimedSections.has(code);
  });
}

function parseMeetingDayCodes(rawDays = "") {
  const values = Array.isArray(rawDays) ? rawDays : [rawDays];
  const codes = [];

  values.forEach((value) => {
    const normalized = normalizeText(value).toLowerCase().replace(/\./g, "");
    if (!normalized || /^(tba|arr|online|none|n\/a|na)$/.test(normalized)) return;

    const exact = DAY_TOKEN_MAP[normalized];
    if (exact) {
      codes.push(exact);
      return;
    }

    const split = normalized.split(/[\s,/|-]+/).filter(Boolean);
    if (split.length > 1) {
      split.forEach((token) => codes.push(...parseMeetingDayCodes(token)));
      return;
    }

    const compact = normalized.replace(/[^a-z]/g, "");
    for (let index = 0; index < compact.length;) {
      if (compact.startsWith("thursday", index)) {
        codes.push("R");
        index += "thursday".length;
        continue;
      }
      if (compact.startsWith("thurs", index)) {
        codes.push("R");
        index += "thurs".length;
        continue;
      }
      if (compact.startsWith("thur", index)) {
        codes.push("R");
        index += "thur".length;
        continue;
      }
      if (compact.startsWith("thu", index)) {
        codes.push("R");
        index += "thu".length;
        continue;
      }
      if (compact.startsWith("th", index)) {
        codes.push("R");
        index += 2;
        continue;
      }

      const single = DAY_TOKEN_MAP[compact[index]];
      if (single) codes.push(single);
      index += 1;
    }
  });

  return [...new Set(codes)].sort((left, right) => DAY_SORT_ORDER[left] - DAY_SORT_ORDER[right]);
}

function formatMeetingDayCodes(dayCodes = []) {
  return dayCodes
    .map((code) => DAY_CODE_TO_LABEL[code] ?? code)
    .filter(Boolean)
    .join(", ");
}

function mergeCompatibleMeetingRecords(meetings = []) {
  const merged = new Map();

  meetings.forEach((meeting) => {
    const normalizedMeeting = normalizeMeetingRecord(meeting);
    if (!normalizedMeeting) return;

    const dayCodes = parseMeetingDayCodes(normalizedMeeting.days);
    const key = [
      normalizeText(normalizedMeeting.time),
      normalizeText(normalizedMeeting.location),
      normalizeText(normalizedMeeting.section),
      normalizeText(normalizedMeeting.type),
    ].join("|");

    if (!merged.has(key)) {
      merged.set(key, {
        ...normalizedMeeting,
        days: formatMeetingDayCodes(dayCodes),
        _dayCodes: dayCodes,
      });
      return;
    }

    const current = merged.get(key);
    current._dayCodes = [...new Set([...(current._dayCodes || []), ...dayCodes])]
      .sort((left, right) => DAY_SORT_ORDER[left] - DAY_SORT_ORDER[right]);
    current.days = formatMeetingDayCodes(current._dayCodes);
  });

  return [...merged.values()].map(({ _dayCodes, ...meeting }) => meeting);
}

function normalizeCourseRecord(universityId, course = {}, universityName = "") {
  const department = normalizeText(course.department || course.subjectCode || course.subject || "").toUpperCase();
  const courseNumber = normalizeText(course.course_number || course.courseNumber || "").toUpperCase();
  const code = normalizeText(course.code || `${department} ${courseNumber}`.trim()).toUpperCase();
  const termCode = normalizeText(course.term_code || course.semester || "");
  const semester = buildTermId(universityId, termCode);
  const instructor = normalizeText(course.professors?.full_name || course.instructor || course.instructors || "") || "TBA";
  const professorId = normalizeText(course.professor_id || "") || buildProfessorId(universityId, instructor);
  const meetings = uniqueBy(getMeetingRecords(course), buildMeetingKey);
  const primarySchedule = meetings[0] || null;
  const linkedCourses = Array.isArray(course.linked_courses)
    ? course.linked_courses.map((entry) => String(entry).trim()).filter(Boolean)
    : Array.isArray(course.linkedCourses)
      ? course.linkedCourses.map((entry) => String(entry).trim()).filter(Boolean)
      : [];

  return {
    ...course,
    id: normalizeText(course.id || "") || `${semester}:${normalizeText(course.crn || `${department}-${courseNumber}`)}`,
    university_id: universityId,
    university_name: universityName,
    semester,
    term_code: termCode,
    department,
    course_number: courseNumber,
    code,
    title: normalizeText(course.title || "Untitled course"),
    crn: normalizeText(course.crn || ""),
    section: normalizeText(course.section || primarySchedule?.section || ""),
    campus: normalizeText(course.campus || course.section_campus || "Main Campus") || "Main Campus",
    instructor,
    professor_id: professorId,
    review_department: normalizeText(course.review_department || "") || buildReviewDepartment(universityId, department),
    professors: { id: professorId, full_name: instructor },
    credits: Number(course.credits || course.creditHourHigh || course.creditHourLow || 0),
    capacity: Number(course.capacity || course.capacity?.limit || 0),
    enrolled_count: Number(course.enrolled_count || course.capacity?.enrolled || 0),
    attributes: [...new Set(normalizeList(course.attributes))],
    restrictions: [...new Set(normalizeList(course.restrictions))],
    prerequisites: normalizePrerequisiteText(course.prerequisites) || normalizePrerequisiteText(course.prerequisite) || getSupplementalPrerequisite(universityId, { ...course, code, department, course_number: courseNumber }) || null,
    schedule: primarySchedule,
    meetings,
    linked_courses: linkedCourses,
    is_section_linked: Boolean(course.is_section_linked || course.isSectionLinked || course.link_identifier || course.linkIdentifier || linkedCourses.length > 0),
    link_identifier: normalizeText(course.link_identifier || course.linkIdentifier || "") || null,
    scheduleTypeDescription: normalizeText(course.scheduleTypeDescription || primarySchedule?.type || "") || undefined,
  };
}

function mergeCourseRecords(base = {}, incoming = {}) {
  const meetings = uniqueBy([...getMeetingRecords(base), ...getMeetingRecords(incoming)], buildMeetingKey);
  const primarySchedule = meetings[0] || base.schedule || incoming.schedule || null;
  const baseTermCode = getEffectiveTermCode(base);
  const incomingTermCode = getEffectiveTermCode(incoming);
  const preferredTermCode = !isPlaceholderTermCode(baseTermCode)
    ? baseTermCode
    : !isPlaceholderTermCode(incomingTermCode)
      ? incomingTermCode
      : (baseTermCode || incomingTermCode || "");
  const preferredSemester = !isPlaceholderTermCode(baseTermCode) && normalizeText(base.semester)
    ? normalizeText(base.semester)
    : !isPlaceholderTermCode(incomingTermCode) && normalizeText(incoming.semester)
      ? normalizeText(incoming.semester)
      : normalizeText(base.semester || incoming.semester || "");
  const preferredId = !isPlaceholderTermCode(baseTermCode) && normalizeText(base.id)
    ? normalizeText(base.id)
    : !isPlaceholderTermCode(incomingTermCode) && normalizeText(incoming.id)
      ? normalizeText(incoming.id)
      : normalizeText(base.id || incoming.id || "");
  return {
    ...base,
    ...incoming,
    id: preferredId,
    term_code: preferredTermCode,
    semester: preferredSemester,
    title: normalizeText(base.title || "") || normalizeText(incoming.title || "") || "Untitled course",
    instructor: normalizeText(base.instructor || "") && normalizeText(base.instructor || "") !== "TBA"
      ? normalizeText(base.instructor)
      : normalizeText(incoming.instructor || "") || normalizeText(base.instructor || "") || "TBA",
    professor_id: normalizeText(base.professor_id || "") || normalizeText(incoming.professor_id || ""),
    campus: normalizeText(base.campus || "") || normalizeText(incoming.campus || "") || "Main Campus",
    credits: Math.max(Number(base.credits || 0), Number(incoming.credits || 0)),
    capacity: Math.max(Number(base.capacity || 0), Number(incoming.capacity || 0)),
    enrolled_count: Math.max(Number(base.enrolled_count || 0), Number(incoming.enrolled_count || 0)),
    attributes: [...new Set([...(base.attributes || []), ...(incoming.attributes || [])].map((entry) => normalizeText(entry)).filter(Boolean))],
    restrictions: [...new Set([...(base.restrictions || []), ...(incoming.restrictions || [])].map((entry) => normalizeText(entry)).filter(Boolean))],
    prerequisites: normalizePrerequisiteText(base.prerequisites) || normalizePrerequisiteText(incoming.prerequisites) || null,
    linked_courses: [...new Set([...(base.linked_courses || []), ...(incoming.linked_courses || [])].map((entry) => String(entry).trim()).filter(Boolean))],
    is_section_linked: Boolean(base.is_section_linked || incoming.is_section_linked),
    link_identifier: normalizeText(base.link_identifier || incoming.link_identifier || "") || null,
    schedule: primarySchedule,
    meetings,
  };
}

function buildCatalogSignature(universityId) {
  const importFiles = collectImportFiles(universityId);
  const importSignature = importFiles
    .map((filePath) => `${filePath}:${fileMtimeMs(filePath)}`)
    .join("|");
  return [
    fileMtimeMs(catalogPath(universityId)),
    fileMtimeMs(backupCatalogPath(universityId)),
    fileMtimeMs(seedCatalogPath(universityId)),
    fileMtimeMs(SUPPLEMENTAL_PREREQUISITES_PATH),
    importSignature,
  ].join(":");
}

function loadCatalog(universityId) {
  const config = getUniversityConfig(universityId);
  if (!config) return null;
  const signature = buildCatalogSignature(universityId);
  const cached = catalogCache.get(universityId);
  if (cached && (cached.signature === signature || holdStaleCatalogCache)) return cached.catalog;

  const payload = chooseCatalogPayload(universityId);
  if (!payload) {
    const emptyCatalog = { university: config, updatedAt: null, availability: config.availability, message: config.note, terms: [], courses: [], professors: [], coursesByTerm: new Map(), sources: [config.sourceUrl].filter(Boolean) };
    catalogCache.set(universityId, { signature, catalog: emptyCatalog });
    return emptyCatalog;
  }
  const runtimePayload = mergeCatalogWithManualTimedImports(universityId, {
    ...payload,
    message: payload.message || config.note,
    sources: Array.isArray(payload.sources) ? payload.sources : [config.sourceUrl].filter(Boolean),
  });

  const merged = new Map();
  for (const rawCourse of Array.isArray(runtimePayload.courses) ? runtimePayload.courses : []) {
    const course = normalizeCourseRecord(universityId, rawCourse, runtimePayload.university?.name || config.name);
    const key = courseMergeKey(course);
    merged.set(key, merged.has(key) ? mergeCourseRecords(merged.get(key), course) : mergeCourseRecords(course, {}));
  }
  const groupedBySection = new Map();
  for (const course of Array.from(merged.values())) {
    const key = courseSectionKey(course);
    if (!groupedBySection.has(key)) groupedBySection.set(key, []);
    groupedBySection.get(key).push(course);
  }
  const normalizedCourses = [];
  groupedBySection.forEach((group) => {
    const realCourses = group.filter((course) => !isPlaceholderTermCode(getEffectiveTermCode(course)));
    const placeholderCourses = group.filter((course) => isPlaceholderTermCode(getEffectiveTermCode(course)));
    if (realCourses.length > 0 && placeholderCourses.length > 0) {
      placeholderCourses.forEach((placeholder) => {
        const targetIndex = realCourses.findIndex((course) =>
          String(getEffectiveTermCode(course) || "").slice(0, 4) === String(getEffectiveTermCode(placeholder) || "").slice(0, 4),
        );
        const index = targetIndex >= 0 ? targetIndex : 0;
        realCourses[index] = mergeCourseRecords(realCourses[index], placeholder);
      });
      normalizedCourses.push(...realCourses);
      return;
    }
    normalizedCourses.push(...group);
  });

  const courses = normalizedCourses.sort((left, right) => {
    const codeOrder = normalizeCourseCode(left.code).localeCompare(normalizeCourseCode(right.code), undefined, { numeric: true, sensitivity: "base" });
    if (codeOrder !== 0) return codeOrder;
    return String(left.section || "").localeCompare(String(right.section || ""), undefined, { numeric: true, sensitivity: "base" });
  });

  const coursesByTerm = new Map();
  courses.forEach((course) => {
    const termCode = String(course.term_code || "");
    if (!coursesByTerm.has(termCode)) coursesByTerm.set(termCode, []);
    coursesByTerm.get(termCode).push(course);
  });

  const mappedTerms = (Array.isArray(runtimePayload.terms) ? runtimePayload.terms : []).map((term) => {
    const code = String(term.code || "").trim();
    return {
      code: buildTermId(universityId, code),
      source_code: code,
      description: stripViewOnly(term.description || code || "Catalog"),
      is_current: Boolean(term.is_current),
      course_count: coursesByTerm.get(code)?.length ?? Number(term.course_count || 0),
      university_id: universityId,
    };
  });
  const realTermYears = new Set(
    mappedTerms
      .filter((term) => !isPlaceholderTermCode(term.source_code))
      .map((term) => String(term.source_code || "").slice(0, 4)),
  );
  const terms = mappedTerms.filter((term) =>
    !(isPlaceholderTermCode(term.source_code) && realTermYears.has(String(term.source_code || "").slice(0, 4))),
  );

  const professorMap = new Map();
  courses.forEach((course) => {
    if (!course.professor_id) return;
    if (!professorMap.has(course.professor_id)) {
      professorMap.set(course.professor_id, { id: course.professor_id, full_name: course.instructor || course.professors?.full_name || "TBA", university_id: universityId });
    }
  });

  const catalog = {
    university: { ...config, ...(payload.university || {}) },
    updatedAt: runtimePayload.updatedAt || runtimePayload.fetched_at || null,
    availability: runtimePayload.availability || config.availability,
    message: runtimePayload.message || config.note,
    terms,
    courses,
    professors: Array.from(professorMap.values()).sort((left, right) => String(left.full_name || "").localeCompare(String(right.full_name || ""), undefined, { sensitivity: "base" })),
    coursesByTerm,
    sources: Array.isArray(runtimePayload.sources) ? runtimePayload.sources : [config.sourceUrl].filter(Boolean),
  };

  catalogCache.set(universityId, { signature, catalog });
  return catalog;
}

function reloadCatalogCache(universityId = "") {
  const normalizedUniversityId = String(universityId || "").trim().toLowerCase();
  if (normalizedUniversityId) {
    catalogCache.delete(normalizedUniversityId);
    return;
  }
  catalogCache.clear();
}

function setCatalogRefreshInProgress(value) {
  holdStaleCatalogCache = Boolean(value);
}

function matchesCourseSearch(course, search) {
  const query = String(search ?? "").trim().toLowerCase();
  if (!query) return true;
  const crn = String(course.crn || "").trim().toLowerCase();
  const code = String(course.code || "").trim().toLowerCase();
  const title = String(course.title || "").trim().toLowerCase();
  const instructor = String(course.instructor || course.professors?.full_name || "").trim().toLowerCase();
  const campus = String(course.campus || "").trim().toLowerCase();
  const restrictions = Array.isArray(course.restrictions) ? course.restrictions.join(" ").toLowerCase() : String(course.restrictions || "").toLowerCase();
  const attributes = Array.isArray(course.attributes) ? course.attributes.join(" ").toLowerCase() : String(course.attributes || "").toLowerCase();
  const prerequisites = String(course.prerequisites || "").toLowerCase();
  const haystack = [code, title, instructor, campus, restrictions, attributes, prerequisites, course.department, course.course_number].join(" ");
  const compactHaystack = normalizeCompact(haystack);

  return query.split(/\s+/).every((token) => {
    const normalized = token.trim();
    if (!normalized) return true;
    if (normalized.startsWith("crn:")) return crn.startsWith(normalized.replace(/^crn:/, "").replace(/\s+/g, ""));
    const compactToken = normalizeCompact(normalized);
    if (compactToken && /^\d+$/.test(compactToken) && compactToken.length >= 5) return crn.startsWith(compactToken);
    if (normalized.length <= 1) return code.startsWith(normalized) || title.split(/[^a-z0-9]+/).some((word) => word.startsWith(normalized));
    return haystack.includes(normalized) || compactHaystack.includes(compactToken);
  });
}

function normalizeCatalogSearchToken(value = "") {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function getCatalogSearchIntent(search = "") {
  const compact = normalizeCatalogSearchToken(search);
  const match = compact.match(/^([A-Z]{2,8})(\d+[A-Z]*)$/);
  if (!match) return null;
  return {
    department: match[1],
    numberPrefix: match[2],
  };
}

function courseMatchesCatalogIntent(course, intent) {
  if (!intent?.numberPrefix) return false;
  const department = normalizeCatalogSearchToken(
    course.department || String(course.code || "").match(/^[A-Z]+/i)?.[0] || "",
  );
  const courseNumber = normalizeCatalogSearchToken(
    course.course_number || String(course.code || "").match(/\d+[A-Z]*/i)?.[0] || "",
  );

  if (!department || !courseNumber) return false;
  return department === intent.department && courseNumber.startsWith(intent.numberPrefix);
}

function filterCoursesBySearch(courses = [], search = "") {
  const matches = courses.filter((course) => matchesCourseSearch(course, search));
  const catalogIntent = getCatalogSearchIntent(search);

  if (!catalogIntent?.numberPrefix) return matches;

  const exactFamilyMatches = courses.filter((course) =>
    courseMatchesCatalogIntent(course, catalogIntent),
  );

  return exactFamilyMatches.length > 0 ? exactFamilyMatches : matches;
}

function getTermsForUniversity(universityId) {
  return loadCatalog(universityId)?.terms ?? [];
}

function getCoursesForTerm({ universityId = "", termId = "", search = "" } = {}) {
  const parsed = parseTermId(termId, universityId);
  const resolvedUniversityId = parsed.universityId || universityId;
  const resolvedTermCode = parsed.termCode || "";
  const catalog = loadCatalog(resolvedUniversityId);
  if (!catalog) return [];
  const courses = resolvedTermCode ? (catalog.coursesByTerm.get(resolvedTermCode) ?? []) : catalog.courses;
  return suppressCatalogPlaceholders(filterCoursesBySearch(courses, search)).slice(0, 20000);
}

function getCoursesSearchResults({ universityId = "", search = "" } = {}) {
  const catalog = loadCatalog(universityId);
  if (!catalog) return [];
  return suppressCatalogPlaceholders(filterCoursesBySearch(catalog.courses, search)).slice(0, 2000);
}

function getAllCoursesForUniversity(universityId = "") {
  const catalog = loadCatalog(universityId);
  if (!catalog) return [];
  return suppressCatalogPlaceholders(catalog.courses.slice());
}

function getProfessors({ universityId = "", search = "" } = {}) {
  const catalog = loadCatalog(universityId);
  if (!catalog) return [];
  const query = String(search ?? "").trim().toLowerCase();
  if (!query) return (catalog.professors || []).slice(0, 1000);
  return (catalog.professors || []).filter((professor) => String(professor.full_name || "").toLowerCase().includes(query) || String(professor.id || "").toLowerCase().includes(query)).slice(0, 1000);
}

function getProfessorCourses(universityId = "", professorId = "") {
  const catalog = loadCatalog(universityId);
  if (!catalog) return [];
  return catalog.courses.filter((course) => String(course.professor_id || "") === String(professorId || ""));
}

function getAttributeOptionsForTerm({ universityId = "", termId = "" } = {}) {
  const counts = new Map();
  getCoursesForTerm({ universityId, termId, search: "" }).forEach((course) => {
    (course.attributes || []).forEach((attribute) => {
      const label = normalizeText(attribute);
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return Array.from(counts.entries()).map(([label, count]) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, count })).sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
}

function getUniversitiesResponse() {
  return UNIVERSITIES.map((university) => {
    const catalog = loadCatalog(university.id);
    const currentTerm = (catalog?.terms || []).find((term) => term.is_current) || catalog?.terms?.[0] || null;
    return {
      ...university,
      updatedAt: catalog?.updatedAt || null,
      note: catalog?.message || university.note,
      hasTerms: Boolean(catalog?.terms?.length),
      hasCourses: Boolean(catalog?.courses?.length),
      currentTermCode: currentTerm?.code || null,
    };
  });
}

module.exports = {
  buildProfessorId,
  buildReviewDepartment,
  getAllCoursesForUniversity,
  getAttributeOptionsForTerm,
  getCoursesForTerm,
  getCoursesSearchResults,
  getProfessorCourses,
  getProfessors,
  getTermsForUniversity,
  getUniversitiesResponse,
  reloadCatalogCache,
  setCatalogRefreshInProgress,
};
