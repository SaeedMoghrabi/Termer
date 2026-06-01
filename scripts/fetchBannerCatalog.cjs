const {
  chooseCurrentTerm,
  chooseRelevantTerms,
  dedupeBy,
  logStep,
  normalizeDigitsTime,
  normalizeWhitespace,
  requestJson,
  requestText,
  resolveProfessorId,
} = require("./catalogUtils.cjs");

const PAGE_SIZE = 500;
const PREREQUISITE_CONCURRENCY = 16;

function buildCookieHeader(setCookieHeader = []) {
  const values = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader].filter(Boolean);

  return values
    .map((value) => String(value).split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function mergeCookieHeaders(...cookieHeaders) {
  const cookies = new Map();

  for (const header of cookieHeaders) {
    const pairs = String(header || "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean);

    for (const pair of pairs) {
      const [name, ...rest] = pair.split("=");
      if (!name || rest.length === 0) continue;
      cookies.set(name, `${name}=${rest.join("=")}`);
    }
  }

  return [...cookies.values()].join("; ");
}

function extractSynchronizerToken(html = "") {
  const match = String(html).match(/name="synchronizerToken"\s+value="([^"]+)"/i)
    || String(html).match(/meta name="synchronizerToken" content="([^"]+)"/i)
    || String(html).match(/synchronizerToken\s*=\s*['"]([^'"]+)['"]/i);

  return match?.[1] || "";
}

function normalizeSubjectDescription(value = "") {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseHtmlCells(rowHtml = "") {
  return [...String(rowHtml).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) =>
      normalizeWhitespace(
        match[1]
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<[^>]+>/g, " "),
      ),
    );
}

function normalizePrerequisiteExpression(value = "") {
  return normalizeWhitespace(value)
    .replace(/\s+\)/g, ")")
    .replace(/\(\s+/g, "(")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOr\b/g, "or");
}

function resolvePrerequisiteSubjectCode(subject = "", subjectCodeByDescription = new Map()) {
  const normalized = normalizeSubjectDescription(subject);
  if (!normalized) return "";

  const explicitCode = String(subject).match(/\/\s*([A-Z]{2,8})\s*$/)?.[1];
  if (explicitCode) return explicitCode.toUpperCase();

  const exact = subjectCodeByDescription.get(normalized);
  if (exact) return exact;

  for (const [description, code] of subjectCodeByDescription.entries()) {
    if (description.startsWith(normalized) || normalized.startsWith(description)) {
      return code;
    }
  }

  const aliases = {
    informatique: "INF",
    "information technology for bus": "ITB",
    "computer science csc": "CSC",
  };

  return aliases[normalized] || subject;
}

function parseBannerPrerequisiteHtml(html = "", subjectCodeByDescription = new Map()) {
  const text = normalizeWhitespace(String(html).replace(/<[^>]+>/g, " "));
  if (!text) return null;

  const rows = [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const pieces = [];

  for (const row of rows) {
    const cells = parseHtmlCells(row[1]);
    if (cells.length < 8 || /^And\/Or$/i.test(cells[0])) continue;

    const joiner = cells[0] ? cells[0].toLowerCase() : "";
    const openGroup = cells[1] || "";
    const test = cells[2] || "";
    const score = cells[3] || "";
    const subject = cells[4] || "";
    const courseNumber = cells[5] || "";
    const closeGroup = cells[8] || "";

    let requirement = "";
    if (subject && courseNumber) {
      const subjectCode = resolvePrerequisiteSubjectCode(subject, subjectCodeByDescription);
      requirement = `${subjectCode} ${courseNumber}`.toUpperCase();
    } else if (test) {
      requirement = `${test}${score ? ` score ${score}` : ""}`;
    }

    if (!requirement) continue;
    pieces.push([joiner, openGroup, requirement, closeGroup].filter(Boolean).join(" "));
  }

  if (!pieces.length) return null;
  return `Prerequisites: ${normalizePrerequisiteExpression(pieces.join(" "))}.`;
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await callback(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function fetchBannerPrerequisiteForCourse({
  baseUrl,
  course,
  subjectCodeByDescription,
  rejectUnauthorized,
}) {
  const url = `${baseUrl}/ssb/searchResults/getSectionPrerequisites?term=${encodeURIComponent(course.term_code)}&courseReferenceNumber=${encodeURIComponent(course.crn)}`;
  const response = await requestText(url, {
    rejectUnauthorized,
    timeoutMs: 30000,
  });

  return parseBannerPrerequisiteHtml(response.text, subjectCodeByDescription);
}

async function enrichBannerPrerequisites({
  baseUrl,
  courses,
  subjectCodeByTerm,
  rejectUnauthorized,
}) {
  const representatives = dedupeBy(
    courses.filter((course) => course.term_code && course.crn && course.code),
    (course) => `${course.term_code}:${course.code}`,
  );
  const prerequisitesByTermCode = new Map();

  await mapWithConcurrency(representatives, PREREQUISITE_CONCURRENCY, async (course) => {
    try {
      const prerequisites = await fetchBannerPrerequisiteForCourse({
        baseUrl,
        course,
        subjectCodeByDescription: subjectCodeByTerm.get(course.term_code) ?? new Map(),
        rejectUnauthorized,
      });
      if (prerequisites) {
        prerequisitesByTermCode.set(`${course.term_code}:${course.code}`, prerequisites);
      }
    } catch (error) {
      logStep("banner prerequisites failed", `${course.term_code} ${course.code} -> ${error.message}`);
    }
  });

  if (!prerequisitesByTermCode.size) return courses;

  logStep("banner prerequisites", `${prerequisitesByTermCode.size} course rules fetched`);
  return courses.map((course) => {
    if (course.prerequisites) return course;
    const prerequisites = prerequisitesByTermCode.get(`${course.term_code}:${course.code}`);
    return prerequisites ? { ...course, prerequisites } : course;
  });
}

function createBannerSessionId() {
  return `${Math.random().toString(36).slice(2, 8)}${Date.now()}`;
}

async function createBannerSession(baseUrl, termCode, rejectUnauthorized) {
  const termSelectionUrl = `${baseUrl}/ssb/term/termSelection?mode=search`;
  const termSelection = await requestText(termSelectionUrl, { rejectUnauthorized });
  const initialCookies = buildCookieHeader(termSelection.headers["set-cookie"]);
  const termToken = extractSynchronizerToken(termSelection.text);
  const uniqueSessionId = createBannerSessionId();

  await requestText(`${baseUrl}/ssb/term/search?mode=search`, {
    method: "POST",
    rejectUnauthorized,
    headers: {
      Cookie: initialCookies,
      Referer: termSelectionUrl,
      "X-Synchronizer-Token": termToken,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "*/*",
    },
    body: [
      ["term", termCode],
      ["studyPath", ""],
      ["studyPathText", ""],
      ["startDatepicker", ""],
      ["endDatepicker", ""],
      ["uniqueSessionId", uniqueSessionId],
    ]
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&"),
  });

  const classSearch = await requestText(`${baseUrl}/ssb/classSearch/classSearch`, {
    rejectUnauthorized,
    headers: {
      Cookie: initialCookies,
      Referer: termSelectionUrl,
    },
  });
  const cookies = mergeCookieHeaders(
    initialCookies,
    buildCookieHeader(classSearch.headers["set-cookie"]),
  );
  const classToken = extractSynchronizerToken(classSearch.text);

  return {
    classSearchUrl: `${baseUrl}/ssb/classSearch/classSearch`,
    cookies,
    uniqueSessionId,
    token: classToken,
  };
}

function normalizeBannerMeeting(rawSection) {
  let days = "TBA";
  let time = "TBA";
  let location = "TBA";
  let scheduleType = rawSection.scheduleTypeDescription || "Lecture";
  let campus = rawSection.campusDescription || "Main Campus";

  const firstMeeting = (rawSection.meetingsFaculty || []).find((entry) => entry.meetingTime);
  if (firstMeeting?.meetingTime) {
    const meeting = firstMeeting.meetingTime;
    const dayTokens = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
      .filter((day) => meeting[day]);

    days = dayTokens.length ? dayTokens.join(", ") : "TBA";
    time = meeting.beginTime && meeting.endTime
      ? `${normalizeDigitsTime(meeting.beginTime)} - ${normalizeDigitsTime(meeting.endTime)}`
      : "TBA";
    location = `${meeting.building || ""} ${meeting.room || ""}`.trim() || "TBA";
    scheduleType = meeting.meetingTypeDescription || scheduleType;
    campus = meeting.campusDescription || campus;
  }

  return { campus, days, time, location, scheduleType };
}

function buildBannerCourse(universityId, termCode, rawSection, legacyProfessorMap) {
  const instructor = (rawSection.faculty || [])
    .map((facultyMember) => normalizeWhitespace(facultyMember.displayName))
    .filter(Boolean)
    .join(", ") || "TBA";
  const credits = rawSection.creditHours ?? rawSection.creditHourLow ?? rawSection.creditHourHigh ?? 0;
  const meeting = normalizeBannerMeeting(rawSection);

  return {
    id: `${universityId}:${termCode}:${rawSection.courseReferenceNumber}`,
    term_code: termCode,
    crn: String(rawSection.courseReferenceNumber),
    code: `${rawSection.subject} ${rawSection.courseNumber}`,
    department: String(rawSection.subject).toUpperCase(),
    course_number: String(rawSection.courseNumber).toUpperCase(),
    section: normalizeWhitespace(rawSection.sequenceNumber),
    title: normalizeWhitespace(rawSection.courseTitle),
    credits: Number(credits || 0),
    instructor,
    professor_id: resolveProfessorId(universityId, instructor, legacyProfessorMap),
    campus: normalizeWhitespace(meeting.campus || "Main Campus"),
    schedule: {
      days: meeting.days,
      time: meeting.time,
      location: meeting.location,
      section: normalizeWhitespace(rawSection.sequenceNumber),
      type: normalizeWhitespace(meeting.scheduleType || "Lecture"),
    },
    capacity: Number(rawSection.maximumEnrollment ?? 0),
    enrolled_count: Number(rawSection.enrollment ?? 0),
    prerequisites: normalizeWhitespace(rawSection.prerequisiteDescription || "") || null,
    attributes: Array.isArray(rawSection.sectionAttributes)
      ? rawSection.sectionAttributes
        .map((attribute) => normalizeWhitespace(attribute.description || attribute.code || String(attribute)))
        .filter(Boolean)
      : [],
    is_section_linked: Boolean(rawSection.isSectionLinked),
    link_identifier: rawSection.linkIdentifier || null,
    linked_courses: rawSection.isSectionLinked && rawSection.linkedSection
      ? [String(rawSection.linkedSection)]
      : [],
  };
}

async function fetchBannerCoursesForSubject({
  baseUrl,
  subjectCode,
  termCode,
  universityId,
  legacyProfessorMap,
  rejectUnauthorized,
}) {
  try {
    const session = await createBannerSession(baseUrl, termCode, rejectUnauthorized);
    const requestBase = `${baseUrl}/ssb/searchResults/searchResults`;
    const buildUrl = (pageOffset) => {
      const params = new URLSearchParams({
        txt_subject: subjectCode,
        txt_term: termCode,
        startDatepicker: "",
        endDatepicker: "",
        uniqueSessionId: session.uniqueSessionId,
        pageOffset: String(pageOffset),
        pageMaxSize: String(PAGE_SIZE),
        sortColumn: "subjectDescription",
        sortDirection: "asc",
      });
      return `${requestBase}?${params.toString()}`;
    };

    const headers = {
      Cookie: session.cookies,
      Referer: session.classSearchUrl,
      "X-Synchronizer-Token": session.token,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
    };

    const firstPayload = await requestJson(buildUrl(0), {
      rejectUnauthorized,
      headers,
    });

    if (!firstPayload.json?.data?.length) {
      return [];
    }

    let sections = [...firstPayload.json.data];

    for (
      let pageOffset = firstPayload.json.pageMaxSize || PAGE_SIZE;
      pageOffset < Number(firstPayload.json.totalCount || 0);
      pageOffset += PAGE_SIZE
    ) {
      const payload = await requestJson(buildUrl(pageOffset), {
        rejectUnauthorized,
        headers,
      });

      if (!payload.json?.data?.length) break;
      sections.push(...payload.json.data);
    }

    return dedupeBy(
      sections.map((section) => buildBannerCourse(universityId, termCode, section, legacyProfessorMap)),
      (course) => `${course.crn}:${course.term_code}`,
    );
  } catch (error) {
    logStep("banner subject failed", `${subjectCode} -> ${error.message}`);
    return [];
  }
}

async function fetchBannerCatalog({
  universityId,
  sourceUrl,
  termFilter,
  termLimit = 4,
  rejectUnauthorized = true,
  legacyProfessorMap = new Map(),
}) {
  const termsResponse = await requestJson(`${sourceUrl}/ssb/classSearch/getTerms?offset=1&max=100`, {
    rejectUnauthorized,
  });
  const currentTerm = chooseCurrentTerm(termsResponse.json, termFilter);
  const selectedTerms = chooseRelevantTerms(termsResponse.json, termFilter, { limit: termLimit });
  const courses = [];
  const subjectCodeByTerm = new Map();

  logStep(`${universityId} current term`, `${currentTerm.description} (${currentTerm.code})`);
  logStep(
    `${universityId} selected terms`,
    selectedTerms.map((term) => `${term.description} (${term.code})`).join(" | "),
  );

  for (const term of selectedTerms) {
    logStep(`${universityId} term`, `${term.description} (${term.code})`);
    const subjectSession = await createBannerSession(sourceUrl, term.code, rejectUnauthorized);
    const subjects = await requestJson(
      `${sourceUrl}/ssb/classSearch/get_subject?term=${encodeURIComponent(term.code)}&offset=1&max=500`,
      {
        rejectUnauthorized,
        headers: {
          Cookie: subjectSession.cookies,
          Referer: subjectSession.classSearchUrl,
        },
      },
    );
    subjectCodeByTerm.set(
      term.code,
      new Map(
        subjects.json.map((subject) => [
          normalizeSubjectDescription(subject.description || subject.code),
          String(subject.code).toUpperCase(),
        ]),
      ),
    );

    for (const subject of subjects.json) {
      const subjectCourses = await fetchBannerCoursesForSubject({
        baseUrl: sourceUrl,
        subjectCode: subject.code,
        termCode: term.code,
        universityId,
        legacyProfessorMap,
        rejectUnauthorized,
      });
      if (subjectCourses.length) {
        logStep(`${universityId} subject`, `${term.code} ${subject.code} -> ${subjectCourses.length} sections`);
        courses.push(...subjectCourses);
      }
    }
  }

  const enrichedCourses = process.env.CATALOG_FETCH_PREREQUISITES === "false"
    ? courses
    : await enrichBannerPrerequisites({
        baseUrl: sourceUrl,
        courses,
        subjectCodeByTerm,
        rejectUnauthorized,
      });

  return {
    terms: selectedTerms.map((term) => ({
      code: term.code,
      description: normalizeWhitespace(term.description).replace(/\(view only\)/i, "").trim(),
      is_current: term.code === currentTerm.code,
    })),
    courses: dedupeBy(enrichedCourses, (course) => `${course.crn}:${course.term_code}`),
  };
}

module.exports = {
  fetchBannerCatalog,
  parseBannerPrerequisiteHtml,
};
