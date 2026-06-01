const { PDFParse } = require("pdf-parse");
const { normalizeWhitespace, requestText } = require("./catalogUtils.cjs");

const BAU_CS_URL = "https://websitedev.bau.edu.lb/Program/Science/Bachelor/Computer-Science";
const USEK_CS_URL = "https://www.usek.edu.lb/faculty-of-arts-and-sciences/computer-science-and-it/bachelor-of-science-in-computer-science";
const LIU_CS_POS_URL = "https://liu.edu.lb/NewLIU2022/metaData/CSCI.pdf";
const LAU_CS_CATALOG_URL = "https://catalog.lau.edu.lb/2024-2025/courses/csc.php";

const STATIC_PREREQUISITES = {
  lau: {
    "CSC 243B": `Corequisite: CSC 243. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 245": `Prerequisite: CSC 243 and CSC 243B. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 245B": `Prerequisite: CSC 243 and CSC 243B. Corequisite: CSC 245. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 310": `Prerequisites: CSC 245, CSC 245B, and MTH 207. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 310B": `Prerequisites: CSC 245, CSC 245B, and MTH 207. Corequisite: CSC 310. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 310H": `Prerequisites: CSC 245 and MTH 207. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 317": `Prerequisites: CSC 310 and CSC 310B. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 320": `Corequisites: CSC 245 and MTH 207. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 322": `Corequisite: CSC 320. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 326": `Prerequisites: CSC 245, CSC 245B, and CSC 320. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 375": `Prerequisites: CSC 245 and MTH 207. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 380": `Prerequisites: CSC/BIF 310 and MTH 207. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 430": `Prerequisite: CSC 326. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 431": `Corequisite: CSC 375. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 433": `Prerequisite: CSC 326. Corequisite: CSC 430. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 435": `Prerequisite: CSC 326. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 437": `Prerequisite: CSC 326. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 438": `Prerequisite: CSC 326. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 443": `Corequisite: CSC 375. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 446": `Prerequisite: CSC 326. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 447": `Prerequisites: CSC 310, CSC 310B, and CSC 326. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 460": `Prerequisite: CSC 310. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 461": `Prerequisite: CSC 310. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 463": `Prerequisite: MTH 305. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 464": `Prerequisite: CSC 310. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 490": `Corequisite: CSC 375. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 491": `Corequisite: CSC 375 or CSC 490. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 597": `Prerequisite: CSC 375. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 598": `Prerequisite: instructor permission. Source: ${LAU_CS_CATALOG_URL}`,
    "CSC 599": `Prerequisite: CSC 490. Corequisites: ENG 202 and COM 203. Source: ${LAU_CS_CATALOG_URL}`,
  },
  bau: {
    "CHEM 241L": `Corequisite: CHEM 241. Source: ${BAU_CS_URL}`,
    "PHYS 243L": `Corequisite: PHYS 243. Source: ${BAU_CS_URL}`,
    "CMPS 242": `Prerequisite: CMPS 241. Source: ${BAU_CS_URL}`,
    "CMPS 246": `Prerequisite: CMPS 241. Source: ${BAU_CS_URL}`,
    "CMPS 248": `Prerequisite: CMPS 241. Source: ${BAU_CS_URL}`,
    "CMPS 342": `Prerequisite: CMPS 242. Source: ${BAU_CS_URL}`,
    "CMPS 343": `Prerequisite: CMPS 244. Source: ${BAU_CS_URL}`,
    "CMPS 344": `Prerequisite: CMPS 242. Source: ${BAU_CS_URL}`,
    "CMPS 345": `Prerequisite: CMPS 248. Source: ${BAU_CS_URL}`,
    "CMPS 346": `Prerequisite: CMPS 248. Source: ${BAU_CS_URL}`,
    "CMPS 347": `Prerequisite: CMPS 242. Source: ${BAU_CS_URL}`,
    "MATH 348": `Prerequisite: MATH 241. Source: ${BAU_CS_URL}`,
    "CMPS 352": `Prerequisite: CMPS 342. Source: ${BAU_CS_URL}`,
    "CMPS 354": `Prerequisites: MATH 242 and CMPS 347. Source: ${BAU_CS_URL}`,
    "CMPS 356": `Prerequisite: MATH 242. Source: ${BAU_CS_URL}`,
    "CMPS 441": `Prerequisites: CMPS 347 and CMPS 345. Source: ${BAU_CS_URL}`,
    "CMPS 442": `Prerequisite: CMPS 347. Source: ${BAU_CS_URL}`,
    "CMPS 444": `Prerequisite: CMPS 443. Source: ${BAU_CS_URL}`,
    "CMPS 445": `Prerequisite: CMPS 347. Source: ${BAU_CS_URL}`,
    "CMPS 447": `Prerequisite: CMPS 347. Source: ${BAU_CS_URL}`,
    "CMPS 452": `Prerequisites: CMPS 342 and MATH 242. Source: ${BAU_CS_URL}`,
    "CMPS 453": `Prerequisites: CMPS 347 and CMPS 345. Source: ${BAU_CS_URL}`,
    "CMPS 455": `Prerequisite: CMPS 447. Source: ${BAU_CS_URL}`,
    "CMPS 461": `Prerequisites: CMPS 246 and CMPS 342. Source: ${BAU_CS_URL}`,
    "CMPS 462": `Prerequisite: CMPS 447. Source: ${BAU_CS_URL}`,
    "CMPS 463": `Prerequisite: CMPS 347. Source: ${BAU_CS_URL}`,
    "CMPS 464": `Prerequisite: CMPS 441. Source: ${BAU_CS_URL}`,
    "CMPS 465": `Prerequisite: CMPS 447. Source: ${BAU_CS_URL}`,
    "CMPS 466": `Prerequisite: CMPS 455. Source: ${BAU_CS_URL}`,
    "CMPS 467": `Prerequisite: CMPS 447. Source: ${BAU_CS_URL}`,
    "CMPS 468": `Prerequisites: CMPS 343 and CMPS 455. Source: ${BAU_CS_URL}`,
    "CMPS 469": `Prerequisites: MATH 242 and CMPS 342. Source: ${BAU_CS_URL}`,
    "CMPS 470": `Prerequisite: CMPS 347. Source: ${BAU_CS_URL}`,
    "CMPS 472": `Prerequisites: CMPS 347 and CMPS 342. Source: ${BAU_CS_URL}`,
  },
  usek: {
    "CSC 211": `Prerequisite: MAT 202. Source: ${USEK_CS_URL}`,
    "MAT 220": `Prerequisite: MAT 213 or MAT 217. Source: ${USEK_CS_URL}`,
    "MAT 310": `Prerequisites: MAT 213 and MAT 202 or CSC 211. Source: ${USEK_CS_URL}`,
    "STA 320": `Prerequisites: MAT 213 and MAT 202 or CSC 211. Source: ${USEK_CS_URL}`,
    "CSC 265": `Prerequisite: CSC 210. Source: ${USEK_CS_URL}`,
    "CSC 314": `Prerequisite: CSC 214 or CSC 210. Source: ${USEK_CS_URL}`,
    "CSC 315": `Prerequisites: CSC 211 and CSC 314. Source: ${USEK_CS_URL}`,
    "CSC 320": `Prerequisites: CSC 214 or CSC 210, and CSC 211. Source: ${USEK_CS_URL}`,
    "CSC 331": `Prerequisite: CSC 210. Source: ${USEK_CS_URL}`,
    "CSC 400": `Prerequisite: CSC 265 or CSC 266. Source: ${USEK_CS_URL}`,
    "CSC 416": `Prerequisite: MAT 310. Source: ${USEK_CS_URL}`,
    "CSC 420": `Prerequisite: CSC 212. Source: ${USEK_CS_URL}`,
    "CSC 421": `Prerequisites: CSC 212 and CSC 315. Source: ${USEK_CS_URL}`,
    "CSC 438": `Prerequisite: CSC 360 or INF 360 or CSC 343. Source: ${USEK_CS_URL}`,
    "CSC 455": `Prerequisites: CSC 314 and CSC 320. Source: ${USEK_CS_URL}`,
    "CSC 456": `Prerequisite: CSC 331. Source: ${USEK_CS_URL}`,
    "CSC 457": `Prerequisites: CSC 331 and CSC 320. Source: ${USEK_CS_URL}`,
    "CSC 458": `Prerequisites: CSC 331 and CSC 455. Source: ${USEK_CS_URL}`,
    "CSC 460": `Prerequisites: CSC 320, CSC 420, and CSC 421. Source: ${USEK_CS_URL}`,
    "CSC 461": `Prerequisite: CSC 421. Source: ${USEK_CS_URL}`,
    "CSC 470": `Prerequisites: CSC 365, MAT 310, and STA 320. Source: ${USEK_CS_URL}`,
    "CSC 471": `Prerequisite: CSC 365. Source: ${USEK_CS_URL}`,
    "CSC 472": `Prerequisite: CSC 470. Source: ${USEK_CS_URL}`,
    "CSC 473": `Prerequisite: CSC 470. Source: ${USEK_CS_URL}`,
    "CSC 474": `Prerequisites: CSC 365, MAT 310, and STA 320. Source: ${USEK_CS_URL}`,
    "CSC 475": `Prerequisite: CSC 470. Source: ${USEK_CS_URL}`,
    "CSC 476": `Prerequisite: CCS 470. Source: ${USEK_CS_URL}`,
    "CSC 463": `Prerequisites: CSC 315, MAT 310, and STA 320. Source: ${USEK_CS_URL}`,
    "MAT 418": `Prerequisites: MAT 310, MAT 312, and one of INF 214, INF 216, INF 219, CSC 214, or CSC 210. Source: ${USEK_CS_URL}`,
  },
  liu: {
    "CSCI 200": `Prerequisite: ENGL 051. Source: ${LIU_CS_POS_URL}`,
    "CSCI 205": `Prerequisite: ENGL 101. Source: ${LIU_CS_POS_URL}`,
    "CSCI 250": `Prerequisites/corequisites: CSCI 205, CSCI 200, ENGL 101, and CSCI 250L. Source: ${LIU_CS_POS_URL}`,
    "CSCI 250L": `Prerequisites/corequisites: CSCI 205, CSCI 200, ENGL 101, and CSCI 250. Source: ${LIU_CS_POS_URL}`,
    "CSCI 300": `Prerequisites/corequisites: CSCI 250L, CSCI 250, and CSCI 300L. Source: ${LIU_CS_POS_URL}`,
    "CSCI 300L": `Prerequisites/corequisites: CSCI 250 and CSCI 300. Source: ${LIU_CS_POS_URL}`,
    "CSCI 335": `Prerequisite: CSCI 250. Source: ${LIU_CS_POS_URL}`,
    "CSCI 342": `Prerequisite: CSCI 250. Source: ${LIU_CS_POS_URL}`,
    "CSCI 345": `Prerequisite: CSCI 250. Source: ${LIU_CS_POS_URL}`,
    "CSCI 351": `Prerequisite: CSCI 300. Source: ${LIU_CS_POS_URL}`,
    "CSCI 362": `Prerequisites: CSCI 342 and CSCI 300. Source: ${LIU_CS_POS_URL}`,
    "CSCI 370": `Prerequisites: CSCI 335 and CSCI 300. Source: ${LIU_CS_POS_URL}`,
    "CSCI 372": `Prerequisite: CSCI 300. Source: ${LIU_CS_POS_URL}`,
    "CSCI 373": `Prerequisite: CSCI 250. Source: ${LIU_CS_POS_URL}`,
    "CSCI 378": `Prerequisite: CSCI 300. Source: ${LIU_CS_POS_URL}`,
    "CSCI 380": `Prerequisites: ENGL 201 and CSCI 335. Source: ${LIU_CS_POS_URL}`,
    "CSCI 390": `Prerequisites: CSCI 335 and CSCI 300. Source: ${LIU_CS_POS_URL}`,
    "CSCI 392": `Prerequisite: CSCI 342. Source: ${LIU_CS_POS_URL}`,
    "CSCI 405": `Prerequisite: CSCI 300. Source: ${LIU_CS_POS_URL}`,
    "CSCI 410": `Prerequisites: CSCI 300 and CSCI 335. Source: ${LIU_CS_POS_URL}`,
    "CSCI 426": `Prerequisite: CSCI 390. Source: ${LIU_CS_POS_URL}`,
    "CSCI 430": `Prerequisites/corequisites: CSCI 300 and CSCI 430L. Source: ${LIU_CS_POS_URL}`,
    "CSCI 430L": `Prerequisites/corequisites: CSCI 300 and CSCI 430. Source: ${LIU_CS_POS_URL}`,
    "CSCI 435": `Prerequisite: CSCI 345. Source: ${LIU_CS_POS_URL}`,
    "CSCI 441": `Prerequisite: CSCI 378. Source: ${LIU_CS_POS_URL}`,
    "CSCI 443": `Prerequisite: CSCI 378. Source: ${LIU_CS_POS_URL}`,
    "CSCI 452": `Prerequisite: CSCI 390. Source: ${LIU_CS_POS_URL}`,
    "CSCI 454": `Prerequisite: CSCI 373. Source: ${LIU_CS_POS_URL}`,
    "CSCI 475": `Prerequisite: CSCI 378. Source: ${LIU_CS_POS_URL}`,
    "CSCI 490": `Prerequisites: CSCI 390 and CSCI 380. Source: ${LIU_CS_POS_URL}`,
    "CSCI 499": `Prerequisite: CSCI 430. Source: ${LIU_CS_POS_URL}`,
    "MATH 210": `Prerequisites: MATH 161 and MATH 160. Source: ${LIU_CS_POS_URL}`,
    "MATH 225": `Prerequisites: MATH 160, ENGL 051, and MATH 161. Source: ${LIU_CS_POS_URL}`,
    "MATH 260": `Prerequisite: MATH 225. Source: ${LIU_CS_POS_URL}`,
    "MATH 310": `Prerequisites: MATH 210 and ENGL 201. Source: ${LIU_CS_POS_URL}`,
    "MATH 375": `Prerequisite: MATH 225. Source: ${LIU_CS_POS_URL}`,
  },
};

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "and")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"');
}

function normalizeCourseCode(value = "") {
  const match = String(value).trim().toUpperCase().match(/^([A-Z]{2,8})\s*([A-Z0-9.-]+)$/);
  return match ? `${match[1]} ${match[2]}` : String(value).trim().toUpperCase();
}

function compactCode(value = "") {
  return normalizeCourseCode(value).replace(/\s+/g, "");
}

function normalizePrerequisiteText(value = "") {
  const text = normalizeWhitespace(decodeHtml(value).replace(/<[^>]+>/g, " "))
    .replace(/\s*Source:\s*https?:\/\/\S+/gi, "")
    .replace(/\b([A-Z]{2,8})\s*([0-9]{2,4}[A-Z]?)\b/g, "$1 $2")
    .replace(/\bPre-requiiste\b/gi, "Prerequisite")
    .replace(/\bPre-requisites?\b/gi, "Prerequisite")
    .replace(/\bPre-req\b/gi, "Prerequisite")
    .replace(/\bCo-requisites?\b/gi, "Corequisite")
    .replace(/\s*:\s*/g, ": ");

  if (!text || /^(none|n\/a|na|no prerequisites?|not listed|tba|-|--|null)$/i.test(text)) {
    return null;
  }

  return text;
}

function getStaticPrerequisites(universityId = "") {
  return STATIC_PREREQUISITES[String(universityId).trim().toLowerCase()] ?? {};
}

function applyPrerequisiteMap(courses = [], prerequisiteMap = {}) {
  if (!Object.keys(prerequisiteMap).length) return courses;
  return courses.map((course) => {
    if (normalizePrerequisiteText(course.prerequisites)) return course;
    const code = normalizeCourseCode(course.code || `${course.department ?? ""} ${course.course_number ?? ""}`);
    const entry = prerequisiteMap[code]
      ?? prerequisiteMap[compactCode(code)]
      ?? Object.entries(prerequisiteMap)
        .find(([key]) => compactCode(key) === compactCode(code))?.[1];
    const prerequisites = normalizePrerequisiteText(entry);
    return prerequisites ? { ...course, prerequisites } : course;
  });
}

function mergePrerequisiteMaps(...maps) {
  return Object.assign({}, ...maps.filter(Boolean));
}

async function fetchBauPrerequisites() {
  const { text: html } = await requestText(BAU_CS_URL);
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  const map = {};

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((match) => normalizeWhitespace(decodeHtml(match[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))));
    if (cells.length < 5 || !/^[A-Z]{2,8}$/.test(cells[0]) || !/^[A-Z0-9.-]+$/.test(cells[1])) continue;

    const prerequisites = normalizePrerequisiteText(cells[4]);
    if (prerequisites) {
      map[`${cells[0].toUpperCase()} ${cells[1].toUpperCase()}`] = `${prerequisites}. Source: ${BAU_CS_URL}`;
    }
  }

  return { prerequisites: map, sources: [BAU_CS_URL] };
}

async function fetchUsekPrerequisites() {
  const { text: html } = await requestText(USEK_CS_URL);
  const map = {};
  const coursePattern = /<span class="courseCode">([A-Z]{2,8})(\d{3}[A-Z]?)<\/span>\s*([^<]+)<\/a>\s*<div class="innerExpandCollapseContent">\s*<div class="innerExpandCollapseHeading">\s*([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = coursePattern.exec(html)) !== null) {
    const code = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
    const heading = normalizeWhitespace(decodeHtml(match[4].replace(/<[^>]+>/g, " ")));
    const prerequisiteMatch = heading.match(/\|\s*(Pre-requisite:[\s\S]+)$/i);
    const prerequisites = normalizePrerequisiteText(prerequisiteMatch?.[1] ?? "");
    if (prerequisites) {
      map[code] = `${prerequisites}. Source: ${USEK_CS_URL}`;
    }
  }

  return { prerequisites: map, sources: [USEK_CS_URL] };
}

function mergeWrappedPdfRows(text = "") {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^[A-Z]{3,6}\d{3}[A-Z]?\b/.test(line)) continue;
    let row = line;
    while (
      index + 1 < lines.length
      && !/^[A-Z]{3,6}\d{3}[A-Z]?\b/.test(lines[index + 1])
      && !/\s\d+(?:\s+[A-Z]{2,6}\d{3}[A-Z]?)?/.test(row)
    ) {
      index += 1;
      row = `${row} ${lines[index]}`;
    }
    if (index + 1 < lines.length && !/^[A-Z]{3,6}\d{3}[A-Z]?\b/.test(lines[index + 1]) && /\bwith$/i.test(row)) {
      index += 1;
      row = `${row} ${lines[index]}`;
    }
    rows.push(row);
  }

  return rows;
}

async function fetchLiuPrerequisites() {
  const parser = new PDFParse({ url: LIU_CS_POS_URL });
  try {
    const result = await parser.getText();
    const map = {};
    const rows = mergeWrappedPdfRows(result.text);

    for (const row of rows) {
      const match = row.match(/^([A-Z]{3,6})(\d{3}[A-Z]?)\s+(.+?)\s+(\d+)\s*(.*)$/);
      if (!match) continue;
      const [, department, courseNumber,, , rest] = match;
      const prerequisites = normalizePrerequisiteText(rest);
      if (prerequisites) {
        map[`${department} ${courseNumber}`] = `Prerequisites/corequisites: ${prerequisites}. Source: ${LIU_CS_POS_URL}`;
      }
    }

    return { prerequisites: map, sources: [LIU_CS_POS_URL] };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function fetchPrerequisiteSupplement(universityId = "") {
  const normalizedUniversityId = String(universityId).trim().toLowerCase();
  if (normalizedUniversityId === "bau") return fetchBauPrerequisites();
  if (normalizedUniversityId === "usek") return fetchUsekPrerequisites();
  if (normalizedUniversityId === "liu") return fetchLiuPrerequisites();
  if (normalizedUniversityId === "lau") {
    return { prerequisites: getStaticPrerequisites("lau"), sources: [LAU_CS_CATALOG_URL] };
  }
  return { prerequisites: getStaticPrerequisites(normalizedUniversityId), sources: [] };
}

async function enrichCoursesWithPrerequisites(universityId, courses = []) {
  const staticPrerequisites = getStaticPrerequisites(universityId);
  let fetched = { prerequisites: {}, sources: [] };

  try {
    fetched = await fetchPrerequisiteSupplement(universityId);
  } catch {
    fetched = { prerequisites: {}, sources: [] };
  }

  const prerequisiteMap = mergePrerequisiteMaps(staticPrerequisites, fetched.prerequisites);
  return {
    courses: applyPrerequisiteMap(courses, prerequisiteMap),
    sources: fetched.sources ?? [],
    count: Object.keys(prerequisiteMap).length,
  };
}

module.exports = {
  applyPrerequisiteMap,
  enrichCoursesWithPrerequisites,
  fetchPrerequisiteSupplement,
  getStaticPrerequisites,
  normalizeCourseCode,
  normalizePrerequisiteText,
};
