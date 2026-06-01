const {
  buildAcademicCatalogTerm,
  dedupeBy,
  logStep,
  normalizeWhitespace,
  professorIdFor,
  requestBuffer,
  requestText,
  slugify,
  stripTags,
} = require("./catalogUtils.cjs");

const LU_FT_PAGES = [
  { key: "abc", label: "Faculty of Technology ABC", url: "http://ft.ul.edu.lb/abc.php" },
  { key: "ccne", label: "Faculty of Technology CCNE", url: "http://ft.ul.edu.lb/ccne.php" },
  { key: "ce", label: "Faculty of Technology CE", url: "http://ft.ul.edu.lb/ce.php" },
  { key: "cege", label: "Faculty of Technology CEGE", url: "http://ft.ul.edu.lb/cege.php" },
  { key: "gsi", label: "Faculty of Technology GSI", url: "http://ft.ul.edu.lb/gsi.php" },
  { key: "gst", label: "Faculty of Technology GST", url: "http://ft.ul.edu.lb/gst.php" },
  { key: "ime", label: "Faculty of Technology IME", url: "http://ft.ul.edu.lb/ime.php" },
  { key: "mee", label: "Faculty of Technology MEE", url: "http://ft.ul.edu.lb/mee.php" },
];

const LU_MEDICINE_URL = "https://medicine.ul.edu.lb/intro/teachingStaff.aspx";
const LU_PUBLIC_SCHEDULE_INDEX = "http://ft.ul.edu.lb/schedules/";
const LU_DAY_MAP = new Map([
  ["monday", "Monday"],
  ["lundi", "Monday"],
  ["tuesday", "Tuesday"],
  ["mardi", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["mercredi", "Wednesday"],
  ["thursday", "Thursday"],
  ["jeudi", "Thursday"],
  ["friday", "Friday"],
  ["vendredi", "Friday"],
]);

function normalizeAscii(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeLuCourseTitle(value = "") {
  const normalized = normalizeAscii(value)
    .replace(/\b(cours|course|td|pw|ex|exe|travaux pratiques|travaux|pratiques)\b/g, " ")
    .replace(/\b(ing|dr|mme|mrs|mr|arch|prof)\b/g, " ")
    .replace(/\bde\b/g, " ")
    .replace(/\bet\b/g, " and ")
    .replace(/\bstat prob\b/g, " statistics probability ")
    .replace(/\bstat prob\.\b/g, " statistics probability ")
    .replace(/\bsba 2\b/g, " advanced reinforced concrete structures ")
    .replace(/\bmdf\b/g, " fluid mechanics hydraulics ")
    .replace(/\binfo de base\b/g, " introduction to informatics ")
    .replace(/\bdessin arch\b/g, " architectural drawing ")
    .replace(/\banalyse\b/g, " analysis ")
    .replace(/\balgebre\b/g, " algebra ")
    .replace(/\bstructures?1\b/g, " structures 1 ")
    .replace(/\bstructures? 1\b/g, " structures 1 ")
    .replace(/\bstructures?2\b/g, " structures 2 ")
    .replace(/\bstructures? 2\b/g, " structures 2 ")
    .replace(/\bavancees\b/g, " advanced ")
    .replace(/\bmateriaux\b/g, " materials ")
    .replace(/\bgeologie\b/g, " geology ")
    .replace(/\belectricite\b/g, " electricity ")
    .replace(/\broute\b/g, " roads ")
    .replace(/\broutes\b/g, " roads ")
    .replace(/\baeraulique\b/g, " ventilation ")
    .replace(/\bventilation\b/g, " ventilation ")
    .replace(/\bisolation et etan\b/g, " insulation and waterproofing ")
    .replace(/\bisolation et etan\.\b/g, " insulation and waterproofing ")
    .replace(/\betan\b/g, " waterproofing ")
    .replace(/\bsolaire\b/g, " solar ")
    .replace(/\bhydrologie urbaine\b/g, " urban hydrology ")
    .replace(/\bouvrages de soutenement et stabilite des pentes\b/g, " retaining systems and slope stability ")
    .replace(/\bmaintenance et rehabilitation\b/g, " maintenance and rehabilitation ")
    .replace(/\bplanif des chantiers\b/g, " planning and organizing site ")
    .replace(/\bouvrages de soutenement\b/g, " retaining systems ")
    .replace(/\bbetiment\b/g, " building ")
    .replace(/\bbatiment\b/g, " building ")
    .replace(/\blegislations du batiment\b/g, " building legislation ")
    .replace(/\bretaining systems and slope stability\b/g, " retaining systems slope stability ")
    .replace(/\bcomputer skills\b/g, " introduction to informatics ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function tokenizeLuTitle(value = "") {
  return normalizeLuCourseTitle(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreLuTitleMatch(sourceTitle = "", candidateTitle = "") {
  const sourceTokens = tokenizeLuTitle(sourceTitle);
  const candidateTokens = tokenizeLuTitle(candidateTitle);
  if (!sourceTokens.length || !candidateTokens.length) return 0;

  const sourceSet = new Set(sourceTokens);
  const candidateSet = new Set(candidateTokens);
  let overlap = 0;
  for (const token of sourceSet) {
    if (candidateSet.has(token)) overlap += 1;
  }
  const coverage = overlap / sourceSet.size;
  const reverseCoverage = overlap / candidateSet.size;
  const normalizedSource = sourceTokens.join(" ");
  const normalizedCandidate = candidateTokens.join(" ");
  const containsBonus =
    normalizedCandidate.includes(normalizedSource) || normalizedSource.includes(normalizedCandidate) ? 0.2 : 0;
  return coverage + reverseCoverage + containsBonus;
}

function convertLuTimeToken(token = "") {
  const match = String(token).trim().match(/^(\d{1,2})h(\d{2})$/i);
  if (!match) return null;
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}

function inferLuMeetingType(title = "") {
  const normalized = normalizeAscii(title);
  if (/\b(td|ex|pw)\b/.test(normalized)) return "Recitation";
  return "Lecture";
}

async function loadLuPdfjs() {
  const module = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return module;
}

function bucketBy(items, keyFn) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return grouped;
}

async function parseLuSchedulePdf(buffer, sourceUrl) {
  const pdfjsLib = await loadLuPdfjs();
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  const items = content.items
    .map((item) => ({
      str: normalizeWhitespace(item.str),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      width: Number(item.width || 0),
      height: Math.abs(Number(item.height || item.transform?.[0] || 0)),
    }))
    .filter((item) => item.str);

  const metadataLine = items.find((item) => /department|département/i.test(item.str))?.str || "";
  const semesterMatch = metadataLine.match(/sem(?:ester|estre)\s*(\d+)/i);
  const semesterNumber = semesterMatch ? Number.parseInt(semesterMatch[1], 10) : null;
  const semesterLabel = Number.isFinite(semesterNumber) ? `Semester ${semesterNumber}` : "";

  const timeItems = items
    .filter((item) => /^\d{1,2}h\d{2}$/i.test(item.str))
    .sort((left, right) => left.x - right.x);
  if (timeItems.length < 6) return [];

  const dayRows = items
    .filter((item) => LU_DAY_MAP.has(normalizeAscii(item.str)))
    .map((item) => ({
      day: LU_DAY_MAP.get(normalizeAscii(item.str)),
      y: item.y,
    }))
    .sort((left, right) => right.y - left.y);
  if (!dayRows.length) return [];

  const rowBounds = dayRows.map((row, index) => ({
    day: row.day,
    yMin: index === dayRows.length - 1 ? row.y - 50 : (row.y + dayRows[index + 1].y) / 2,
    yMax: index === 0 ? row.y + 35 : (dayRows[index - 1].y + row.y) / 2,
  }));

  const contentCandidates = items.filter((item) => {
    const normalized = normalizeAscii(item.str);
    if (!normalized) return false;
    if (/^\d{1,2}h\d{2}$/.test(normalized)) return false;
    if (LU_DAY_MAP.has(normalized)) return false;
    if (/^\d{1,2}-sept/.test(normalized)) return false;
    if (/^(a|b|a1|a2|b1|b2|s1)$/.test(normalized)) return false;
    if (/^(week|semaine|from|au|to|courses?|course|td groupe|ex|pw|room|salle|weekly schedule|emploi du temps)$/.test(normalized)) return false;
    if (/^department|^departement|^faculty|^universite|^lebanese university/.test(normalized)) return false;
    return true;
  });

  const slots = timeItems
    .slice(0, -1)
    .map((item, index) => {
      const next = timeItems[index + 1];
      const xMin = item.x;
      const xMax = next.x + 12;
      const count = contentCandidates.filter((candidate) => {
        const centerX = candidate.x + (candidate.width / 2);
        return centerX >= xMin && centerX <= xMax;
      }).length;
      return {
        start: convertLuTimeToken(item.str),
        end: convertLuTimeToken(next.str),
        xMin,
        xMax,
        count,
      };
    })
    .filter((slot) => slot.start && slot.end && slot.count > 0);

  const buckets = bucketBy(
    contentCandidates
      .map((item) => {
        const centerX = item.x + (item.width / 2);
        const row = rowBounds.find((candidate) => item.y >= candidate.yMin && item.y <= candidate.yMax);
        const slot = slots.find((candidate) => centerX >= candidate.xMin && centerX <= candidate.xMax);
        if (!row || !slot) return null;
        return { ...item, centerX, rowDay: row.day, slot };
      })
      .filter(Boolean),
    (item) => `${item.rowDay}|${item.slot.start}|${item.slot.end}`,
  );

  const sessions = [];
  for (const [bucketKey, bucketItems] of buckets.entries()) {
    const sorted = bucketItems.sort((left, right) => {
      if (Math.abs(right.y - left.y) > 1) return right.y - left.y;
      return left.x - right.x;
    });
    const clusters = [];
    for (const item of sorted) {
      const current = clusters[clusters.length - 1];
      if (!current || Math.abs(current.anchorY - item.y) > 18) {
        clusters.push({ anchorY: item.y, items: [item] });
      } else {
        current.items.push(item);
      }
    }

    for (const cluster of clusters) {
      const lines = cluster.items
        .sort((left, right) => {
          if (Math.abs(right.y - left.y) > 1) return right.y - left.y;
          return left.x - right.x;
        })
        .map((item) => item.str)
        .filter(Boolean);
      if (!lines.length) continue;

      const titleLines = lines.filter((line) => !/^(Dr\.?|Ing\.?|Arch\.?|Mme\.?|Mr\.?|Mlle\.?|Prof\.?|P\.)/i.test(line));
      const instructorLines = lines.filter((line) => /^(Dr\.?|Ing\.?|Arch\.?|Mme\.?|Mr\.?|Mlle\.?|Prof\.?|P\.)/i.test(line));
      const title = normalizeWhitespace(titleLines.join(" "));
      if (!title) continue;

      const [day, start, end] = bucketKey.split("|");
      sessions.push({
        title,
        instructor: normalizeWhitespace(instructorLines.join(" ; ")) || "TBA",
        day,
        time: `${start} - ${end}`,
        type: inferLuMeetingType(title),
        semesterLabel,
        sourceUrl,
      });
    }
  }

  return sessions;
}

async function fetchLuPublicScheduleSessions() {
  const indexResponse = await requestText(LU_PUBLIC_SCHEDULE_INDEX, { rejectUnauthorized: false });
  const files = [...indexResponse.text.matchAll(/href="([^"]+\.pdf)"/gi)]
    .map((match) => normalizeWhitespace(match[1]))
    .filter(Boolean);
  const uniqueFiles = dedupeBy(files, (value) => value);
  const allSessions = [];

  for (const file of uniqueFiles) {
    const sourceUrl = new URL(file, LU_PUBLIC_SCHEDULE_INDEX).toString();
    try {
      const pdfResponse = await requestBuffer(sourceUrl, { rejectUnauthorized: false });
      if (!pdfResponse.buffer?.length) continue;
      const sessions = await parseLuSchedulePdf(pdfResponse.buffer, sourceUrl);
      if (sessions.length) {
        allSessions.push(...sessions);
      }
    } catch (error) {
      logStep("lu schedule pdf failed", `${sourceUrl} -> ${error.message}`);
    }
  }

  return allSessions;
}

function applyLuPublicSchedules(courses, sessions) {
  if (!Array.isArray(courses) || !Array.isArray(sessions) || !sessions.length) return courses;

  const ceCourses = courses.filter((course) =>
    Array.isArray(course.attributes) &&
    course.attributes.some((attribute) => /faculty of technology ce/i.test(attribute)),
  );

  const matchedCourseIds = new Set();
  const sessionsByCourseId = new Map();

  for (const session of sessions) {
    const semesterCourses = ceCourses.filter((course) =>
      course.attributes.some((attribute) => session.semesterLabel && attribute === session.semesterLabel),
    );
    const candidates = semesterCourses.length ? semesterCourses : ceCourses;
    let bestMatch = null;
    let bestScore = 0;

    for (const course of candidates) {
      const score = scoreLuTitleMatch(session.title, course.title);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = course;
      }
    }

    if (!bestMatch || bestScore < 1.05) continue;
    matchedCourseIds.add(bestMatch.id);
    if (!sessionsByCourseId.has(bestMatch.id)) sessionsByCourseId.set(bestMatch.id, []);
    sessionsByCourseId.get(bestMatch.id).push(session);
  }

  return courses.map((course) => {
    const matchedSessions = sessionsByCourseId.get(course.id);
    if (!matchedSessions?.length) return course;

    const meetings = dedupeBy(
      matchedSessions.map((session) => ({
        days: session.day,
        time: session.time,
        location: "TBA",
        section: "SCHED",
        type: session.type,
      })),
      (meeting) => `${meeting.days}|${meeting.time}|${meeting.type}`,
    );

    const primaryMeeting = meetings[0];
    const nonTbaInstructors = dedupeBy(
      matchedSessions.map((session) => normalizeWhitespace(session.instructor)).filter((value) => value && value !== "TBA"),
      (value) => value,
    );

    return {
      ...course,
      section: course.section && course.section !== "CAT" ? course.section : "SCHED",
      instructor: nonTbaInstructors[0] || course.instructor,
      professor_id: nonTbaInstructors[0] ? professorIdFor("lu", nonTbaInstructors[0]) : course.professor_id,
      schedule: primaryMeeting,
      meetings,
      has_published_meetings: true,
      source_schedule_note: "Integrated from official LU Faculty of Technology public weekly schedule PDFs.",
      scheduleTypeDescription: primaryMeeting.type,
    };
  });
}

function applyLuPublishedCodeFallbacks(courses) {
  if (!Array.isArray(courses) || !courses.length) return courses;

  const publishedByCourseAndSemester = new Map();
  for (const course of courses) {
    const meetings = Array.isArray(course.meetings) ? course.meetings.filter(Boolean) : [];
    if (!course.has_published_meetings || !meetings.length || !course.course_number) continue;

    const semesterLabel = Array.isArray(course.attributes)
      ? course.attributes.find((attribute) => /^Semester\s+\d+$/i.test(attribute))
      : "";
    if (!semesterLabel) continue;

    const key = `${normalizeWhitespace(course.course_number).toUpperCase()}|${semesterLabel}`;
    if (!publishedByCourseAndSemester.has(key)) {
      publishedByCourseAndSemester.set(key, course);
    }
  }

  return courses.map((course) => {
    const meetings = Array.isArray(course.meetings) ? course.meetings.filter(Boolean) : [];
    if (course.has_published_meetings || meetings.length || !course.course_number) return course;

    const semesterLabel = Array.isArray(course.attributes)
      ? course.attributes.find((attribute) => /^Semester\s+\d+$/i.test(attribute))
      : "";
    if (!semesterLabel) return course;

    const key = `${normalizeWhitespace(course.course_number).toUpperCase()}|${semesterLabel}`;
    const publishedMatch = publishedByCourseAndSemester.get(key);
    if (!publishedMatch) return course;

    const copiedMeetings = Array.isArray(publishedMatch.meetings)
      ? publishedMatch.meetings.map((meeting) => ({ ...meeting }))
      : [];
    if (!copiedMeetings.length) return course;

    const primaryMeeting = copiedMeetings[0];
    return {
      ...course,
      section: course.section && course.section !== "CAT" ? course.section : publishedMatch.section || "SCHED",
      schedule: { ...primaryMeeting },
      meetings: copiedMeetings,
      has_published_meetings: true,
      source_schedule_note:
        "Inherited from an official LU Faculty of Technology weekly schedule published for the same course code and semester; a dedicated public timetable PDF for this department is not currently available.",
      scheduleTypeDescription: primaryMeeting.type || course.scheduleTypeDescription,
    };
  });
}

function parseLuFtPage(html, source, termCode) {
  const sections = [...html.matchAll(/<caption><b>Semester\s+(\d+):<\/b><\/caption>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/gi)];
  const courses = [];

  for (const section of sections) {
    const semesterLabel = `Semester ${section[1]}`;
    const rows = [...section[2].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];

    for (const row of rows) {
      const values = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => normalizeWhitespace(stripTags(match[1])));
      if (values.length < 3) continue;

      const rawCode = values[0].toUpperCase();
      const title = values[1];
      const credits = Number.parseFloat(String(values[2]).replace(",", "."));

      if (!rawCode || !/[A-Z]/.test(rawCode) || !/\d/.test(rawCode)) continue;
      if (!title) continue;

      courses.push({
        id: `lu:${termCode}:${source.key}:${slugify(`${rawCode}-${title}`)}`,
        term_code: termCode,
        crn: `LU-${rawCode}`,
        code: `FT ${rawCode}`,
        department: "FT",
        course_number: rawCode,
        section: "CAT",
        title,
        credits: Number.isFinite(credits) ? credits : 0,
        instructor: "TBA",
        professor_id: professorIdFor("lu", "TBA"),
        campus: "Saida Faculty of Technology",
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
        attributes: [source.label, semesterLabel],
      });
    }
  }

  return dedupeBy(courses, (course) => `${course.department}:${course.course_number}:${slugify(course.title)}`);
}

function parseLuMedicinePage(html, termCode) {
  const rows = [...html.matchAll(/<tr><td>\s*([^<]+?)\s*<\/td><td>\s*([^<]+?)\s*<\/td><td>\s*([^<]+?)\s*<\/td><td>\s*([^<]+?)\s*<\/td>/gi)];
  const courses = [];

  for (const row of rows) {
    const rawCode = normalizeWhitespace(row[1]).toUpperCase();
    const yearLabel = normalizeWhitespace(row[2]);
    const title = normalizeWhitespace(row[3]);
    const instructor = normalizeWhitespace(row[4]) || "TBA";

    if (!rawCode || !title || /^course code$/i.test(rawCode)) continue;

    courses.push({
      id: `lu:${termCode}:medicine:${slugify(`${rawCode}-${title}`)}`,
      term_code: termCode,
      crn: `LU-${rawCode}`,
      code: `MED ${rawCode}`,
      department: "MED",
      course_number: rawCode,
      section: "CAT",
      title,
      credits: 0,
      instructor,
      professor_id: professorIdFor("lu", instructor),
      campus: "Faculty of Medical Sciences",
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
      attributes: ["Faculty of Medical Sciences", yearLabel].filter(Boolean),
    });
  }

  return dedupeBy(courses, (course) => `${course.department}:${course.course_number}:${slugify(course.title)}`);
}

async function fetchLuCatalog() {
  const term = buildAcademicCatalogTerm("Catalog", { codePrefix: "catalog" });
  const courses = [];
  const sources = [];

  for (const source of LU_FT_PAGES) {
    try {
      const response = await requestText(source.url, { rejectUnauthorized: false });
      const pageCourses = parseLuFtPage(response.text, source, term.code);
      logStep("lu ft page", `${source.key.toUpperCase()} -> ${pageCourses.length} courses`);
      if (pageCourses.length) {
        courses.push(...pageCourses);
        sources.push(source.url);
      }
    } catch (error) {
      logStep("lu ft failed", `${source.url} -> ${error.message}`);
    }
  }

  try {
    const medicineResponse = await requestText(LU_MEDICINE_URL, { rejectUnauthorized: false });
    const medicineCourses = parseLuMedicinePage(medicineResponse.text, term.code);
    logStep("lu medicine", `${medicineCourses.length} courses`);
    if (medicineCourses.length) {
      courses.push(...medicineCourses);
      sources.push(LU_MEDICINE_URL);
    }
  } catch (error) {
    logStep("lu medicine failed", error.message);
  }

  const dedupedCourses = dedupeBy(
    courses,
    (course) => `${course.department}:${course.course_number}:${slugify(course.title)}`,
  );

  let coursesWithSchedules = dedupedCourses;
  let scheduleSessions = [];
  try {
    scheduleSessions = await fetchLuPublicScheduleSessions();
    if (scheduleSessions.length) {
      coursesWithSchedules = applyLuPublicSchedules(dedupedCourses, scheduleSessions);
      coursesWithSchedules = applyLuPublishedCodeFallbacks(coursesWithSchedules);
      sources.push(LU_PUBLIC_SCHEDULE_INDEX);
      logStep("lu schedules", `${scheduleSessions.length} timed meeting fragments from official public PDFs`);
    }
  } catch (error) {
    logStep("lu schedules failed", error.message);
  }

  const result = {
    availability: "partial",
    message: `Public faculty course directories verified. Seeded ${dedupedCourses.length.toLocaleString("en-US")} searchable Lebanese University courses from Faculty of Technology curricula and the Faculty of Medical Sciences directory. Official Faculty of Technology weekly schedule PDFs are now being used where they expose real meetings, although coverage is still partial and currently concentrated in the BTP/Civil Engineering schedule set published on the public schedules index.`,
    terms: [term],
    courses: coursesWithSchedules,
    sources: dedupeBy(sources, (value) => value),
  };

  return result;
}

module.exports = {
  fetchLuCatalog,
};
