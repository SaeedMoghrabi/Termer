const {
  extractSemesterNumber,
  getCurriculumStatus,
  resolveCurriculumSemester,
} = require("./curriculumPlans.cjs");
const { getOfficialMajorHints } = require("./majorRegistry.cjs");

const COMPUTER_SCIENCE = "computer-science";
const ATTRIBUTE_ELECTIVE_CATEGORY = "Graduation-safe attribute elective";
const DAY_ORDER = { M: 0, T: 1, W: 2, R: 3, F: 4, S: 5 };

const CS_STARTER_PROFILES = {
  aub: {
    notes: [
      "AUB lists CMPS 201 as the gateway programming course for CS students.",
      "A first CS term should keep math and communication moving too.",
    ],
    bundles: [
      {
        category: "Programming foundation",
        codes: ["CMPS 201"],
        reason: "CMPS 201 is the first major programming anchor for AUB CS.",
      },
      {
        category: "Math foundation",
        codes: ["MATH 201", "MATH 101", "CMPS 211", "MATH 211"],
        reason: "AUB CS students need calculus/discrete readiness early.",
      },
      {
        category: "Communication / writing",
        codes: ["ENGL 203", "ENGL 204", "ENGL 102"],
        reason: "Understanding Communication should not be delayed.",
      },
    ],
  },
  lau: {
    notes: [
      "LAU CS starts around CSC 243 and its lab, then builds into CSC 245.",
    ],
    bundles: [
      {
        category: "Programming lecture plus lab",
        codes: ["CSC 243", "CSC 243B"],
        takeAll: true,
        reason: "LAU's first core programming sequence keeps the lecture and lab together.",
      },
      {
        category: "Math foundation",
        codes: ["MTH 101", "MTH 201", "MTH 207"],
        reason: "Math should start early because later CSC theory depends on it.",
      },
      {
        category: "Communication / writing",
        codes: ["ENG 101", "ENG 102", "COM 203"],
        reason: "Communication keeps university requirements moving without overloading the first term.",
      },
    ],
  },
  bau: {
    bundles: [
      {
        category: "Programming foundation",
        codes: ["CMPS 241", "CMPS 242"],
        reason: "BAU first-year CS work starts with the lower-level CMPS foundation.",
      },
      {
        category: "Math foundation",
        codes: ["MATH 111", "MATH 241", "MATH 282"],
        reason: "Math readiness keeps later computing courses unlocked.",
      },
    ],
  },
  usek: {
    bundles: [
      {
        category: "Programming foundation",
        codes: ["CSC 210", "CSC 211"],
        reason: "USEK's CS foundation starts with programming plus discrete methods.",
      },
      {
        category: "Math foundation",
        codes: ["MAT 202", "MAT 210", "MAT 212"],
        reason: "Math should begin early in USEK CS planning.",
      },
    ],
  },
  ndu: {
    bundles: [
      {
        category: "Programming foundation",
        codes: ["CSC 100", "CSC 201", "CSC 215", "CSC 275"],
        reason: "NDU programming foundations should come before higher-level CSC theory.",
      },
      {
        category: "Math foundation",
        codes: ["MAT 101", "MAT 105", "MAT 211"],
        reason: "Math placement matters in the first CSC year.",
      },
    ],
  },
  aust: {
    bundles: [
      {
        category: "Programming foundation",
        codes: ["CSI 200", "CSI 201", "CSI 205"],
        reason: "AUST CS should begin with the visible CSI foundations in the current catalog.",
      },
    ],
  },
  liu: {
    bundles: [
      {
        category: "Programming lecture plus lab",
        codes: ["CSCI 250", "CSCI 250L"],
        takeAll: true,
        reason: "LIU's visible CS foundation starts with programming plus its lab.",
      },
      {
        category: "Computing foundation",
        codes: ["CSCI 200"],
        reason: "CSCI 200 is a safe LIU starter when the student's school requires it.",
      },
      {
        category: "Math foundation",
        codes: ["MATH 200", "MATH 210", "MATH 220"],
        reason: "Math should start early because later computing courses depend on it.",
      },
    ],
  },
};

const GLOBAL_ABBREVIATIONS = {
  osb: "OSB = Olayan School of Business.",
  bba: "BBA = Bachelor of Business Administration.",
  cce: "CCE = Computer and Communications Engineering.",
  cse: "CSE = Computer Science and Engineering.",
  ece: "ECE = Electrical and Computer Engineering.",
  eece: "EECE = Electrical and Computer Engineering.",
  cmps: "CMPS is the Computer Science subject prefix at AUB.",
  csc: "CSC is a Computer Science subject prefix used by universities such as LAU and USEK.",
  csci: "CSCI is a Computer Science subject prefix used by LIU and some other catalogs.",
  mis: "MIS = Management Information Systems.",
  bmis: "BMIS = Business Management Information Systems / Business MIS, depending on the catalog.",
};

const ATTRIBUTE_SEARCH_ALIASES = [
  { key: "human-values", label: "Human Values", aliases: ["human values", "human value"] },
  { key: "social-inequalities", label: "Social Inequalities", aliases: ["social inequalities", "social inequality"] },
  { key: "cultures-and-histories", label: "Cultures and Histories", aliases: ["cultures and histories", "culture and history", "ch"] },
  { key: "history-of-ideas", label: "History of Ideas", aliases: ["history of ideas"] },
  { key: "humanities-i", label: "Humanities I", aliases: ["humanities i", "humanities 1"] },
  { key: "understanding-communication", label: "Understanding Communication", aliases: ["understanding communication"] },
  { key: "societies-and-individuals", label: "Societies and Individuals", aliases: ["societies and individuals"] },
  { key: "social-sciences-i", label: "Social Sciences I", aliases: ["social sciences i", "social sciences 1"] },
  { key: "understanding-the-world", label: "Understanding the World", aliases: ["understanding the world"] },
  { key: "quantitative-reasoning", label: "Quantitative Reasoning", aliases: ["quantitative reasoning"] },
  { key: "quantitative-thought", label: "Quantitative Thought", aliases: ["quantitative thought"] },
  { key: "community-engaged-learning", label: "Community Engaged Learning", aliases: ["community engaged learning"] },
  { key: "digital-cultures", label: "Digital Cultures", aliases: ["digital cultures"] },
  { key: "change-makers", label: "Change Makers", aliases: ["change makers", "changemakers"] },
];

const UNIVERSITY_ABBREVIATION_OVERRIDES = {
  aub: {
    cce: "CCE = Computer and Communications Engineering at AUB.",
    cse: "CSE = Computer Science and Engineering at AUB.",
    ece: "ECE = Electrical and Computer Engineering at AUB.",
    eece: "EECE = Electrical and Computer Engineering at AUB.",
    cmps: "CMPS is the Computer Science subject prefix at AUB.",
    osb: "OSB = Olayan School of Business at AUB.",
  },
  aust: {
    cce: "CCE = Computer and Communications Engineering at AUST.",
  },
  liu: {
    cce: "CCE at LIU is best interpreted through the Communication Engineering / telecommunications track.",
    teng: "TENG is the LIU Communication Engineering track prefix used in the plan of study context.",
    ceng: "CENG is the LIU Computer Engineering track prefix used in the plan of study context.",
    csci: "CSCI is the Computer Science subject prefix at LIU.",
  },
};

const MAJOR_HINTS = [
  { id: COMPUTER_SCIENCE, label: "Computer Science", patterns: ["computer science", "comp sci", "compsci", "cmps", "csc", "csci", "informatique", "software development"], subjects: ["CMPS", "CSC", "CSCI", "CSI", "INCI", "INF", "INFO", "FT"], keywords: ["computer science", "programming", "algorithms", "software"] },
  { id: "computer-science-and-engineering", label: "Computer Science and Engineering", patterns: ["computer science and engineering", "computer science engineering", "cse"], subjects: ["CMPS", "CSC", "CSCI", "EECE", "EENG", "CENG"], keywords: ["computer science and engineering", "software", "systems"] },
  { id: "computer-and-communications-engineering", label: "Computer and Communications Engineering", patterns: ["computer and communications engineering", "computer and communication engineering", "computer communications engineering", "cce"], subjects: ["CCE", "EECE", "EENG", "CENG", "TENG"], keywords: ["communications", "telecommunication", "signals", "networks"] },
  { id: "communication-engineering", label: "Communication Engineering", patterns: ["communication engineering", "communications engineering", "communication engineer", "communications engineer", "computer communication engineer", "computer communications engineer", "teng"], subjects: ["TENG", "CENG", "EENG", "ENGG"], keywords: ["communication engineering", "telecommunication", "communications systems"] },
  { id: "electrical-and-computer-engineering", label: "Electrical and Computer Engineering", patterns: ["electrical and computer engineering", "electrical computer engineering", "ece", "eece"], subjects: ["EECE", "ELEC", "EENG", "POWE"], keywords: ["circuits", "electronics", "power"] },
  { id: "computer-engineering", label: "Computer Engineering", patterns: ["computer engineering", "computer engineer", "ceng", "coe"], subjects: ["COE", "COMP", "COME", "CENG", "EENG", "EECE"], keywords: ["computer engineering", "embedded", "architecture"] },
  { id: "engineering", label: "Engineering", patterns: ["engineering", "engineer"], subjects: ["ENGR", "ENGG", "EECE", "ELEC", "EENG", "CVLE", "CIVE", "MECH", "MECE", "INME", "CHEN", "CHE", "BME", "BMED", "MTE", "CCE", "CENG"], keywords: ["engineering", "circuits", "mechanics", "structures"] },
  { id: "civil-engineering", label: "Civil Engineering", patterns: ["civil engineering", "civil engineer"], subjects: ["CVLE", "CIVE"], keywords: ["civil", "structures", "construction"] },
  { id: "mechanical-engineering", label: "Mechanical Engineering", patterns: ["mechanical engineering", "mechanical engineer"], subjects: ["MECH", "MECE", "INME"], keywords: ["mechanical", "thermo", "mechanics"] },
  { id: "electrical-engineering", label: "Electrical Engineering", patterns: ["electrical engineering", "electrical engineer"], subjects: ["ELEC", "EENG", "EECE", "POWE"], keywords: ["electrical", "electronics", "power"] },
  { id: "biomedical-engineering", label: "Biomedical Engineering", patterns: ["biomedical engineering", "biomedical engineer"], subjects: ["BME", "BMED", "BIOM"], keywords: ["biomedical", "bioinstrumentation"] },
  { id: "mechatronics-engineering", label: "Mechatronics Engineering", patterns: ["mechatronics engineering", "mechatronics engineer"], subjects: ["MTE", "MECH", "ELEC", "EENG"], keywords: ["mechatronics", "robotics"] },
  { id: "architecture", label: "Architecture", patterns: ["architecture"], subjects: ["ARCH", "ARCT"], keywords: ["architecture", "studio", "urban"] },
  { id: "data-science", label: "Data Science", patterns: ["data science"], subjects: ["DCSN", "STAT", "STA", "MSBA", "CMPS", "CSC"], keywords: ["data science", "analytics", "machine learning"] },
  { id: "business-administration", label: "Business Administration", patterns: ["business administration", "business studies", "business", "management", "osb", "bba"], subjects: ["BUSS", "BUS", "MNGT", "MGMT", "BUSA", "BMGT", "INFO", "DCSN", "MKTG", "FINA", "ACCT"], keywords: ["business", "management", "administration"] },
  { id: "finance", label: "Finance", patterns: ["finance", "banking"], subjects: ["FIN", "FINA", "FNCE"], keywords: ["finance", "banking", "investment"] },
  { id: "accounting", label: "Accounting", patterns: ["accounting"], subjects: ["ACCT", "ACC"], keywords: ["accounting", "audit"] },
  { id: "marketing", label: "Marketing", patterns: ["marketing"], subjects: ["MKTG", "MKT", "MRKT"], keywords: ["marketing", "brand"] },
  { id: "economics", label: "Economics", patterns: ["economics"], subjects: ["ECON", "ECO"], keywords: ["economics", "microeconomics", "macroeconomics"] },
  { id: "medicine", label: "Medicine", patterns: ["medicine", "medical student"], subjects: ["MED", "MEDI", "FMED"], keywords: ["medicine", "clinical"] },
  { id: "dentistry", label: "Dentistry", patterns: ["dentistry", "dental"], subjects: ["DENT", "DDS"], keywords: ["dentistry", "dental"] },
  { id: "pharmacy", label: "Pharmacy", patterns: ["pharmacy", "pharmaceutical"], subjects: ["PHAR", "PHA", "PHRM"], keywords: ["pharmacy", "pharmacology"] },
  { id: "nursing", label: "Nursing", patterns: ["nursing"], subjects: ["NURS", "NUR"], keywords: ["nursing", "clinical"] },
  { id: "public-health", label: "Public Health", patterns: ["public health"], subjects: ["HMPD", "PUBH", "PH"], keywords: ["public health", "epidemiology"] },
  { id: "biology", label: "Biology", patterns: ["biology", "biological sciences"], subjects: ["BIOL", "BIO"], keywords: ["biology", "genetics", "cell"] },
  { id: "biotechnology", label: "Biotechnology", patterns: ["biotechnology"], subjects: ["BIOT", "BT", "BIOL", "BIO"], keywords: ["biotechnology", "molecular", "biology"] },
  { id: "chemistry", label: "Chemistry", patterns: ["chemistry"], subjects: ["CHEM", "CHM"], keywords: ["chemistry", "organic"] },
  { id: "physics", label: "Physics", patterns: ["physics"], subjects: ["PHYS", "PHY", "PHS"], keywords: ["physics", "mechanics", "electricity"] },
  { id: "mathematics", label: "Mathematics", patterns: ["mathematics", "math"], subjects: ["MATH", "MAT", "MTH"], keywords: ["mathematics", "calculus", "algebra"] },
  { id: "political-science", label: "Political Science", patterns: ["political science"], subjects: ["PSPA", "POSC", "POLS", "POL"], keywords: ["political", "policy"] },
  { id: "psychology", label: "Psychology", patterns: ["psychology", "psych"], subjects: ["PSYC", "PSY"], keywords: ["psychology", "behavior"] },
  { id: "sociology", label: "Sociology", patterns: ["sociology"], subjects: ["SOAN", "SOCI", "SOC"], keywords: ["sociology", "society"] },
  { id: "social-sciences", label: "Social Sciences", patterns: ["social sciences"], subjects: ["SOAN", "SOCI", "SOC", "PSPA"], keywords: ["social sciences", "society"] },
  { id: "law", label: "Law", patterns: ["law", "legal studies"], subjects: ["LAW", "LEGL"], keywords: ["law", "legal"] },
  { id: "agriculture", label: "Agriculture", patterns: ["agriculture", "agricultural sciences"], subjects: ["AGBU", "AGSC", "AGR"], keywords: ["agriculture", "agribusiness"] },
  { id: "environmental-sciences", label: "Environmental Sciences", patterns: ["environmental sciences", "environmental science"], subjects: ["ENSC", "ENVS", "EVS"], keywords: ["environmental", "sustainability"] },
  { id: "information-technology", label: "Information Technology", patterns: ["information technology", "it"], subjects: ["ITM", "IT", "INFO", "INF"], keywords: ["information technology", "systems", "network"] },
  { id: "mis", label: "MIS", patterns: ["mis", "management information systems"], subjects: ["MIS", "BMIS", "INFO"], keywords: ["management information systems", "information systems"] },
  { id: "media-studies", label: "Media Studies", patterns: ["media studies", "communication arts"], subjects: ["COMM", "JORN", "RATV", "MEDIA", "MCOM"], keywords: ["media", "journalism", "communication"] },
  { id: "hospitality", label: "Hospitality", patterns: ["hospitality", "hospitality management", "hospitality & tourism", "tourism"], subjects: ["HOSP", "HTM", "TOUR"], keywords: ["hospitality", "tourism"] },
  { id: "graphic-design", label: "Graphic Design", patterns: ["graphic design"], subjects: ["GDES", "GRDS", "ARTS", "DES"], keywords: ["graphic design", "visual design"] },
  { id: "interior-design", label: "Interior Design", patterns: ["interior design"], subjects: ["INDE", "IDES", "INTD", "DES", "ARCH"], keywords: ["interior design", "space"] },
  { id: "optometry", label: "Optometry", patterns: ["optometry"], subjects: ["OPT", "OPTM"], keywords: ["optometry", "vision"] },
  { id: "translation", label: "Translation", patterns: ["translation"], subjects: ["TRAN", "LANG"], keywords: ["translation", "language"] },
  { id: "languages", label: "Languages", patterns: ["languages"], subjects: ["LANG", "FREN", "ENGL", "ARAB"], keywords: ["language", "linguistics"] },
  { id: "education", label: "Education", patterns: ["education", "teaching"], subjects: ["EDUC", "EDU"], keywords: ["education", "teaching"] },
  { id: "arts", label: "Arts", patterns: ["arts"], subjects: ["ART", "ARTS", "HUM"], keywords: ["arts", "humanities"] },
  { id: "humanities", label: "Humanities", patterns: ["humanities"], subjects: ["HUM", "PHIL", "HIST", "ARAB", "ENGL"], keywords: ["humanities", "history", "philosophy"] },
  { id: "music", label: "Music", patterns: ["music"], subjects: ["MUS", "MUSC"], keywords: ["music"] },
  { id: "theology", label: "Theology", patterns: ["theology"], subjects: ["THEO"], keywords: ["theology", "religion"] },
];

const UNIVERSITY_SPECIFIC_MAJOR_HINTS = {
  aub: [
    { id: "business-administration", label: "Business Administration", patterns: ["osb"], subjects: ["BUSS", "ACCT", "FINA", "MNGT", "MKTG", "DCSN", "INFO"], keywords: ["business"] },
  ],
  aust: [
    { id: "computer-and-communications-engineering", label: "Computer and Communications Engineering", patterns: ["cce"], subjects: ["CCE"], keywords: ["communications"] },
  ],
  liu: [
    { id: "communication-engineering", label: "Communication Engineering", patterns: ["cce", "teng"], subjects: ["TENG", "CENG", "EENG", "ENGG"], keywords: ["communications"] },
  ],
};

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniq(values) {
  return [...new Set(values)];
}

function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bpre[\s-]?requisites?\b/g, "prerequisites")
    .replace(/\bpre[\s-]?reqs?\b/g, "prereq")
    .replace(/\bco[\s-]?requisites?\b/g, "corequisites")
    .replace(/\bco[\s-]?reqs?\b/g, "coreq")
    .replace(/\bsemes(?:t|y)?er\b/g, "semester")
    .replace(/\bsemster\b/g, "semester")
    .replace(/\bcompu?e?ter\b/g, "computer")
    .replace(/\benginner\b/g, "engineer")
    .replace(/\benginering\b/g, "engineering")
    .replace(/\bengineerring\b/g, "engineering")
    .replace(/\bstudemt\b/g, "student")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value = "") {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function titleCaseMajor(value = "") {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word && !["a", "an", "the", "student", "major", "for"].includes(word))
    .map((word) => word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function getUniversityId(university = {}) {
  return String(university.id ?? university.universityId ?? "").trim().toLowerCase();
}

function getUniversityName(university = {}) {
  return String(university.name ?? university.universityName ?? "this university").trim();
}

function normalizeCourseCode(value = "") {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  const letters = raw.match(/[A-Z]+/)?.[0] ?? "";
  const rest = raw.slice(letters.length).trim();
  return rest ? `${letters} ${rest}`.trim() : raw;
}

function getCourseCode(course = {}) {
  return normalizeCourseCode(course.code || `${course.department || ""} ${course.courseNumber || course.course_number || ""}`);
}

function getDepartment(course = {}) {
  return String(course.department || course.subject || course.subjectCode || "").trim().toUpperCase();
}

function getCourseNumber(course = {}) {
  return String(course.courseNumber || course.course_number || "").trim().toUpperCase();
}

function getCourseTitle(course = {}) {
  return String(course.title || "Untitled course").trim();
}

function getCredits(course = {}) {
  return Number(course.credits ?? course.creditHourHigh ?? course.creditHourLow ?? 0) || 0;
}

function getOpenSeats(course = {}) {
  const capacity = Number(course.capacity?.limit ?? course.capacity ?? 0) || 0;
  const enrolled = Number(course.capacity?.enrolled ?? course.enrolled_count ?? course.enrolled ?? 0) || 0;
  return Math.max(0, capacity - enrolled);
}

function getAttributes(course = {}) {
  return array(course.attributes).map((attribute) => String(attribute ?? "").trim()).filter(Boolean);
}

function parseMeetingDays(rawDays = "") {
  const direct = array(rawDays);
  if (direct.length) {
    return uniq(direct.flatMap((value) => parseMeetingDays(value))).sort((left, right) => DAY_ORDER[left] - DAY_ORDER[right]);
  }

  const normalized = normalizeText(rawDays).replace(/\./g, "");
  if (!normalized || /^(tba|arr|online|none|na|n\/a)$/.test(normalized)) return [];

  const tokens = normalized.split(/[\s,/|-]+/).filter(Boolean);
  if (tokens.length > 1) {
    return uniq(tokens.flatMap((token) => parseMeetingDays(token))).sort((left, right) => DAY_ORDER[left] - DAY_ORDER[right]);
  }

  const exactMap = {
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
  if (exactMap[normalized]) return [exactMap[normalized]];

  const compactToken = normalized.replace(/[^a-z]/g, "");
  const days = [];
  for (let index = 0; index < compactToken.length;) {
    if (compactToken.startsWith("thursday", index)) {
      days.push("R");
      index += "thursday".length;
      continue;
    }
    if (compactToken.startsWith("thurs", index)) {
      days.push("R");
      index += "thurs".length;
      continue;
    }
    if (compactToken.startsWith("thur", index)) {
      days.push("R");
      index += "thur".length;
      continue;
    }
    if (compactToken.startsWith("thu", index)) {
      days.push("R");
      index += "thu".length;
      continue;
    }
    if (compactToken.startsWith("th", index)) {
      days.push("R");
      index += 2;
      continue;
    }

    const one = exactMap[compactToken[index]];
    if (one) days.push(one);
    index += 1;
  }

  return uniq(days).sort((left, right) => DAY_ORDER[left] - DAY_ORDER[right]);
}

function normalizeTimeValue(value = "") {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const hhmm = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (hhmm) return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`;

  const ampm = text.match(/^(\d{1,2})(?::?([0-5]\d))?\s*([ap])\.?m?\.?$/i);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2] ?? 0);
    const meridian = String(ampm[3]).toLowerCase();
    if (meridian === "p" && hours !== 12) hours += 12;
    if (meridian === "a" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  return text;
}

function splitTimeRange(value = "") {
  const [start = "", end = ""] = String(value ?? "")
    .split(/\s*(?:-|\u2013|\u2014)\s*/)
    .map((part) => part.trim());
  return [normalizeTimeValue(start), normalizeTimeValue(end)];
}

function normalizeMeeting(meeting = {}, fallback = {}) {
  const days = parseMeetingDays(
    meeting.days
    ?? meeting.day
    ?? meeting.meeting_days
    ?? meeting.weekdays
    ?? fallback.days
    ?? fallback.day
    ?? fallback.meeting_days,
  );
  const [rangeStart, rangeEnd] = splitTimeRange(
    meeting.time
    ?? meeting.hours
    ?? meeting.meeting_time
    ?? fallback.time
    ?? fallback.hours,
  );
  const start = normalizeTimeValue(meeting.start ?? meeting.start_time ?? fallback.start ?? rangeStart);
  const end = normalizeTimeValue(meeting.end ?? meeting.end_time ?? fallback.end ?? rangeEnd);
  const location = String(meeting.location ?? meeting.room ?? fallback.location ?? fallback.room ?? "").trim() || undefined;
  const type = String(meeting.type ?? meeting.scheduleType ?? fallback.type ?? fallback.scheduleType ?? "").trim() || undefined;

  if (!days.length || !start || !end) return null;
  return { days, start, end, location, type };
}

function mergeMeetingObjects(meetings = []) {
  const merged = new Map();
  for (const meeting of meetings) {
    const normalized = normalizeMeeting(meeting);
    if (!normalized) continue;
    const key = `${normalized.start}|${normalized.end}|${normalized.location ?? ""}|${normalized.type ?? ""}`;
    if (!merged.has(key)) {
      merged.set(key, { ...normalized, days: [...normalized.days] });
      continue;
    }
    const current = merged.get(key);
    current.days = uniq([...current.days, ...normalized.days]).sort((left, right) => DAY_ORDER[left] - DAY_ORDER[right]);
  }
  return [...merged.values()];
}

function getMeetings(course = {}) {
  const direct = array(course.meetings).map((meeting) => normalizeMeeting(meeting, course)).filter(Boolean);
  if (direct.length) return mergeMeetingObjects(direct);

  if (array(course.schedule).length) {
    return mergeMeetingObjects(course.schedule.map((meeting) => normalizeMeeting(meeting, course)).filter(Boolean));
  }

  if (course.schedule && typeof course.schedule === "object") {
    const normalized = normalizeMeeting(course.schedule, course);
    return normalized ? [normalized] : [];
  }

  const fallback = normalizeMeeting(course, course);
  return fallback ? [fallback] : [];
}

function toMinutes(value = "") {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function hasMeetingTime(course = {}) {
  return getMeetings(course).some((meeting) => {
    const start = toMinutes(meeting.start);
    const end = toMinutes(meeting.end);
    return start !== null && end !== null && end > start;
  });
}

function courseText(course = {}) {
  return normalizeText([
    getCourseCode(course),
    getCourseTitle(course),
    getDepartment(course),
    getCourseNumber(course),
    String(course.instructor ?? ""),
    String(course.prerequisites ?? ""),
    String(course.restrictions ?? ""),
    getAttributes(course).join(" "),
    String(course.scheduleType ?? course.scheduleTypeDescription ?? ""),
  ].join(" "));
}

function chooseRepresentative(current, candidate) {
  if (!current) return candidate;
  const score = (course) =>
    (hasMeetingTime(course) ? 40 : 0)
    + (getOpenSeats(course) > 0 ? 30 : 0)
    + (getCredits(course) > 0 ? 10 : 0)
    + (String(course.instructor ?? "").trim() && normalizeText(course.instructor) !== "tba" ? 5 : 0);
  return score(candidate) > score(current) ? candidate : current;
}

function groupCourses(courses = []) {
  const groups = new Map();
  array(courses).forEach((course) => {
    const code = getCourseCode(course);
    const key = compact(code);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, { key, code, courses: [], representative: null });
    }
    const group = groups.get(key);
    group.courses.push(course);
    group.representative = chooseRepresentative(group.representative, course);
  });

  return [...groups.values()].sort((left, right) =>
    getDepartment(left.representative).localeCompare(getDepartment(right.representative))
    || courseNumberValue(left.representative) - courseNumberValue(right.representative)
    || left.code.localeCompare(right.code, undefined, { numeric: true }),
  );
}

function courseNumberValue(course = {}) {
  const match = getCourseCode(course).match(/(\d{2,4})/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function hasPublishedPrerequisites(course = {}) {
  const text = normalizeText(String(course.prerequisites ?? ""));
  return Boolean(text && text !== "none" && text !== "no prerequisites");
}

function hasFirstSemesterPenalty(course = {}) {
  const title = normalizeText(getCourseTitle(course));
  return /\b(ii|iii|iv|advanced|internship|project|seminar|capstone|thesis|research|elective|planning|scheduling)\b/.test(title);
}

function hasFirstSemesterBoost(course = {}) {
  const title = normalizeText(getCourseTitle(course));
  return /\b(i|intro|introduction|fundamentals?|basic|general|statics|drawing|graphics|calculus|chemistry|physics|programming|linear algebra)\b/.test(title);
}

function summarizeAvailability(group) {
  if (!group) return "not visible in the selected term snapshot";
  const sections = group.courses.length;
  const openSections = group.courses.filter((course) => getOpenSeats(course) > 0).length;
  const timedSections = group.courses.filter((course) => hasMeetingTime(course)).length;
  const openText = openSections ? `${openSections} open` : "seat data unavailable or full";
  const timeText = timedSections ? `${timedSections} timed` : "no timed sections";
  return `${sections} section${sections === 1 ? "" : "s"} (${openText}, ${timeText})`;
}

function sectionPreview(group) {
  if (!group) return "";
  const best = group.courses
    .slice()
    .sort((left, right) =>
      getOpenSeats(right) - getOpenSeats(left)
      || (hasMeetingTime(right) ? 1 : 0) - (hasMeetingTime(left) ? 1 : 0)
      || String(left.section ?? "").localeCompare(String(right.section ?? ""), undefined, { numeric: true }),
    )[0];
  if (!best) return "";
  const details = [];
  if (best.crn) details.push(`CRN ${best.crn}`);
  if (best.instructor && normalizeText(best.instructor) !== "tba") details.push(best.instructor);
  const meetings = getMeetings(best);
  if (meetings[0]) {
    const days = meetings[0].days.join("");
    details.push(`${days} ${meetings[0].start}-${meetings[0].end}`);
  }
  return details.length ? ` Example: ${details.join("; ")}.` : "";
}

function collectGroupCampuses(group) {
  return uniq(
    array(group?.courses)
      .map((course) => String(course?.campus ?? "").trim())
      .filter(Boolean),
  );
}

function collectGroupLocations(group) {
  return uniq(
    array(group?.courses)
      .flatMap((course) => {
        const meetingLocations = getMeetings(course)
          .map((meeting) => String(meeting?.location ?? "").trim())
          .filter(Boolean);
        const directLocations = [
          String(course?.location ?? "").trim(),
          String(course?.room ?? "").trim(),
          String(course?.schedule?.location ?? "").trim(),
        ].filter(Boolean);
        return [...meetingLocations, ...directLocations];
      })
      .filter(Boolean),
  );
}

function formatRefreshMoment(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildCurriculumStatusLines(universityId = "", planId = "") {
  const status = getCurriculumStatus();
  const sources = array(status?.sources).filter((source) =>
    (!universityId || String(source?.universityId ?? "").toLowerCase() === String(universityId).toLowerCase())
    && (!planId || String(source?.planId ?? "") === String(planId)));
  if (!sources.length) return [];

  const parsedCount = sources.filter((source) => source?.parserMode === "parsed").length;
  const latestCheck = sources
    .map((source) => String(source?.checkedAt ?? "").trim())
    .filter(Boolean)
    .sort()
    .at(-1);
  const latestLabel = formatRefreshMoment(latestCheck);

  const lines = [
    `Curriculum refresh coverage: ${parsedCount}/${sources.length} tracked official plan source${sources.length === 1 ? "" : "s"} parsed successfully${latestLabel ? ` (last checked ${latestLabel})` : ""}.`,
  ];

  const fallbackSource = sources.find((source) => source?.parserMode !== "parsed");
  if (fallbackSource?.parseError) {
    lines.push(`One curriculum source is currently using the last maintained mapped plan because the latest parse failed: ${fallbackSource.parseError}.`);
  }

  return lines;
}

function collectGroupInstructors(group) {
  return uniq(
    array(group?.courses)
      .map((course) => String(course?.instructor ?? "").trim())
      .filter((name) => name && normalizeText(name) !== "tba"),
  );
}

function summarizeMeetingPatterns(group) {
  const patterns = uniq(
    array(group?.courses)
      .flatMap((course) => getMeetings(course))
      .map((meeting) => {
        const days = array(meeting?.days).join("");
        const time = String(meeting?.start ?? "").trim() && String(meeting?.end ?? "").trim()
          ? `${meeting.start}-${meeting.end}`
          : "";
        const location = String(meeting?.location ?? "").trim();
        const base = [days, time].filter(Boolean).join(" ");
        return [base, location ? `at ${location}` : ""].filter(Boolean).join(" ").trim();
      })
      .filter(Boolean),
  );
  return patterns.slice(0, 5);
}

function formatCatalogFreshness(updatedAt = "") {
  const raw = String(updatedAt ?? "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return `Catalog freshness: ${raw}.`;
  }
  return `Catalog freshness: synced ${parsed.toLocaleString()}.`;
}

function coursesOverlap(left = {}, right = {}) {
  const leftMeetings = getMeetings(left);
  const rightMeetings = getMeetings(right);
  return leftMeetings.some((leftMeeting) => {
    const leftStart = toMinutes(leftMeeting.start);
    const leftEnd = toMinutes(leftMeeting.end);
    if (leftStart === null || leftEnd === null) return false;

    return rightMeetings.some((rightMeeting) => {
      const rightStart = toMinutes(rightMeeting.start);
      const rightEnd = toMinutes(rightMeeting.end);
      if (rightStart === null || rightEnd === null) return false;
      return leftMeeting.days.some((day) => rightMeeting.days.includes(day))
        && leftStart < rightEnd
        && rightStart < leftEnd;
    });
  });
}

function chooseSection(group, pickedCourses = []) {
  return array(group?.courses)
    .slice()
    .sort((left, right) =>
      Number(pickedCourses.every((picked) => !coursesOverlap(right, picked))) - Number(pickedCourses.every((picked) => !coursesOverlap(left, picked)))
      || (hasMeetingTime(right) ? 1 : 0) - (hasMeetingTime(left) ? 1 : 0)
      || getOpenSeats(right) - getOpenSeats(left)
      || String(left.section ?? "").localeCompare(String(right.section ?? ""), undefined, { numeric: true }),
    )[0] ?? null;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildOrderedMajorHints(universityId = "") {
  const merged = new Map();
  const appendHint = (hint = {}) => {
    const key = String(hint.id || hint.label || "").trim();
    if (!key) return;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...hint,
        patterns: uniq(array(hint.patterns)),
        subjects: uniq(array(hint.subjects)),
        keywords: uniq(array(hint.keywords)),
      });
      return;
    }

    merged.set(key, {
      ...existing,
      ...hint,
      patterns: uniq([...array(existing.patterns), ...array(hint.patterns)]),
      subjects: uniq([...array(existing.subjects), ...array(hint.subjects)]),
      keywords: uniq([...array(existing.keywords), ...array(hint.keywords)]),
      officialMajor: existing.officialMajor || hint.officialMajor || false,
      mappedPlanId: hint.mappedPlanId || existing.mappedPlanId || null,
      source: hint.source || existing.source || "",
    });
  };

  [
    ...(UNIVERSITY_SPECIFIC_MAJOR_HINTS[universityId] ?? []),
    ...MAJOR_HINTS,
    ...getOfficialMajorHints(universityId),
  ].forEach(appendHint);

  return [...merged.values()];
}

function findUniversitySpecificMajorHint(value = "", university = {}) {
  const normalized = normalizeText(value);
  const universityId = getUniversityId(university);
  const hints = UNIVERSITY_SPECIFIC_MAJOR_HINTS[universityId] ?? [];
  return hints.find((hint) =>
    hint.patterns.some((pattern) => patternMatches(normalized, pattern)),
  ) ?? null;
}

function buildGenericMajorFromLabel(label = "") {
  const known = findKnownMajorHint(label);
  if (known) return known;
  const normalized = normalizeText(label);
  const tokens = normalized.split(" ").filter((token) => token.length >= 4);
  return {
    id: compact(label) || "custom-major",
    label: titleCaseMajor(label) || "Student major",
    patterns: [normalized],
    subjects: [],
    keywords: tokens,
  };
}

function buildUnmappedOfficialMajorNote(major = null) {
  if (!major?.officialMajor || major?.mappedPlanId) return "";
  return `Curriculum note: ${major.label} is recognized as an official published major for this university, but its semester-by-semester curriculum is not fully mapped in the advisor yet, so I am staying with a live-catalog best-effort plan instead of pretending this is an exact audit.`;
}

function patternMatches(normalizedMessage, pattern) {
  const normalizedPattern = normalizeText(pattern);
  if (!normalizedPattern) return false;
  return new RegExp(`\\b${escapeRegExp(normalizedPattern).replace(/\\ /g, "\\s+")}\\b`).test(normalizedMessage);
}

function findKnownMajorHint(value = "", university = {}) {
  const normalized = normalizeText(value);
  const universityId = getUniversityId(university);
  const hints = buildOrderedMajorHints(universityId)
    .map((hint) => ({
      hint,
      matched: hint.patterns
        .filter((pattern) => patternMatches(normalized, pattern))
        .sort((left, right) => normalizeText(right).length - normalizeText(left).length)[0] ?? "",
    }))
    .filter((entry) => entry.matched)
    .sort((left, right) =>
      normalizeText(right.matched).length - normalizeText(left.matched).length
      || right.hint.label.length - left.hint.label.length,
    );
  return hints[0]?.hint ?? null;
}

function extractRequestedMajorLabel(message = "") {
  const normalized = normalizeText(message);
  const matchers = [
    /\b(?:should|can|could)\s+(?:i|we|a|an)?\s*([a-z][a-z0-9&/\-\s]{2,60}?)\s+(?:student|major)\b/,
    /\b(?:for|as)\s+(?:a|an)?\s*([a-z][a-z0-9&/\-\s]{2,60}?)\s+(?:student|major)\b/,
    /\b(?:for|as)\s+(?:a|an)?\s*([a-z][a-z0-9&/\-\s]{2,60}?)(?:\s+(?:student|major)\b|$)/,
  ];
  for (const matcher of matchers) {
    const match = normalized.match(matcher);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function isLikelyComputerScienceMajor(message = "") {
  const text = normalizeText(message);
  return /\b(computer science|comp sci|compsci|cs student|cs major|cmps|csc|csci|informatique|software engineering|programming)\b/.test(text);
}

function detectMajor(message = "", university = {}) {
  const normalized = normalizeText(message);
  const requestedLabel = extractRequestedMajorLabel(message);
  if (requestedLabel) {
    const requestedUniversitySpecific = findUniversitySpecificMajorHint(requestedLabel, university);
    if (requestedUniversitySpecific) return requestedUniversitySpecific;
    const requestedMatch = findKnownMajorHint(requestedLabel, university);
    if (requestedMatch) return requestedMatch;
    const requestedGeneric = buildGenericMajorFromLabel(requestedLabel);
    if (requestedGeneric?.label) return requestedGeneric;
  }

  const directUniversitySpecific = findUniversitySpecificMajorHint(normalized, university);
  if (directUniversitySpecific) return directUniversitySpecific;

  const specific = findKnownMajorHint(normalized, university);
  if (specific) return specific;

  if (isLikelyComputerScienceMajor(normalized)) {
    return MAJOR_HINTS.find((hint) => hint.id === COMPUTER_SCIENCE) ?? null;
  }

  return null;
}

function extractSemesterNumberSafe(message = "") {
  return extractSemesterNumber(normalizeText(message));
}

function extractEntryYear(message = "") {
  const match = normalizeText(message).match(/\b(?:entered in(?: the year)?|entry year|catalog year|cohort|since)\s+(20\d{2})\b/);
  return match?.[1] ?? null;
}

function looksLikeQuestion(message = "") {
  const text = normalizeText(message);
  if (!text) return false;
  return /[?]/.test(String(message ?? ""))
    || /\b(what|why|how|when|where|who|which|can|should|is|are|do|does|did|will|would|could|help|recommend|suggest|find|show|tell|explain|build|create|make|give|compare)\b/.test(text);
}

function isGreetingMessage(message = "") {
  const text = normalizeText(message);
  return /^(hi|hello|hey|yo|hola|bonjour|salam|marhaba|good morning|good afternoon|good evening)\b/.test(text);
}

function getAdvisorIntent(message = "") {
  const text = normalizeText(message);
  const semesterNumber = extractSemesterNumberSafe(message);
  const firstSemester = semesterNumber === 1
    || /\b(first|1st|freshman|new student|starter|semester 1|sem 1)\b/.test(text);
  const scheduleRequest =
    /\b(create|build|make|draft|generate|suggest|plan|show|give|pick)\b.*\b(schedule|semester|term|plan)\b/.test(text)
    || /\b(what should i take|courses should i take)\b/.test(text);
  const attributeRequirement =
    /\b(attributes?|general education|gen ed|human values|cultures?|histories|societies|quantitative reasoning|quantitative thought|community engaged|requirement buckets?)\b/.test(text);
  const abbreviationMeaning =
    /\bwhat do(?:es)?\b.*\b(?:mean|stand for)\b/.test(text);
  const courseCodeMention =
    /\b[a-z]{2,6}\s*[- ]?\s*\d{2,4}[a-z]?\b/i.test(String(message ?? ""));
  const thisCourseReference =
    /\b(this course|that course|the course)\b/.test(text);
  const broadCourseQuestion =
    /\b(what is(?: this)? course about|why is this course important|required or elective|how many credits|what department|who usually takes|beginners?|year level|prerequisites?|prereq|corequisites?|coreq|unlocks?|offered every semester|offered in summer|topics covered|learning outcomes|skills will i gain|theoretical|practical|writing(?:-| )based|problem(?:-| )solving|math(?:-| )heavy|reading(?:-| )heavy|memorization(?:-| )heavy|project(?:-| )based|exam(?:-| )based|assignment(?:-| )heavy|attendance mandatory|participation marks|weekly quizzes|pop quizzes|assignments?|late submissions|labs?|tutorials?|recitations?|presentations?|group project|midterm|final exam|grading breakdown|grading strict|grading curved|multiple choice|written questions|cheat sheets|calculators|textbook|lecture slides|lecture recordings|sample exams|office hours|how much time should i study|how hard|prepare before taking|background knowledge|software|strong laptop|programming experience|programming language|online resources|take notes|study for the exams|start assignments|high grade|useful for internships|future jobs|graduate studies|heavy semester|avoid taking with|good to take with|recommend this course|advice would you give|what campus|which campus|where is it offered|where is it taught|what room|which room|what building|which building|who teaches|which professor|who is the professor|what days|which days|what time|meeting time)\b/.test(text);
  const courseInquiry =
    (courseCodeMention || thisCourseReference)
    && (
      /\b(prerequisites?|prereq|corequisites?|coreq|restrictions?|restriction|linked|lab|labs|recitation|recitations|tutorial|tutorials|section|sections|unlocks?|requires?|need(?:ed)? for|count for)\b/.test(text)
      || broadCourseQuestion
      || /\b(explain|tell me about|what is|what are|show me|give me|is|are|can|should)\b/.test(text)
    );
  const semesterPlan =
    scheduleRequest
    && (Boolean(semesterNumber) || /\b(major|student|freshman|first year|second year|third year|fourth year|fifth year)\b/.test(text));
  const curriculum =
    attributeRequirement
    || semesterPlan
    || /\b(advisor|academic plan|curriculum|study plan|degree|graduate|graduation|catalog year|cohort)\b/.test(text);

  return {
    firstSemester,
    semesterNumber,
    semesterPlan,
    scheduleRequest,
    curriculum,
    attributeRequirement,
    abbreviationMeaning,
    courseInquiry,
    broadCourseQuestion,
    any: Boolean(firstSemester || semesterPlan || curriculum || attributeRequirement || abbreviationMeaning || courseInquiry),
  };
}

function isAdvisorIntent(message = "") {
  return getAdvisorIntent(message).any;
}

function extractRequestedAttributeLabels(message = "", courses = []) {
  const normalized = normalizeText(message);
  const matched = new Map();

  ATTRIBUTE_SEARCH_ALIASES.forEach((entry) => {
    if (entry.aliases.some((alias) => normalized.includes(normalizeText(alias)))) {
      matched.set(entry.key, entry.label);
    }
  });

  const visibleAttributes = uniq(
    array(courses)
      .flatMap((course) => getAttributes(course))
      .filter(Boolean),
  );

  visibleAttributes.forEach((attribute) => {
    const normalizedAttribute = normalizeText(attribute);
    if (!normalizedAttribute) return;
    if (normalized.includes(normalizedAttribute)) {
      matched.set(normalizedAttribute, attribute);
    }
  });

  return [...matched.values()];
}

function extractRequestedDepartments(message = "", courses = []) {
  const availableDepartments = new Map(
    uniq(array(courses).map((course) => getDepartment(course)).filter(Boolean))
      .map((department) => [department.toLowerCase(), department]),
  );
  const rawTokens = uniq(
    String(message ?? "")
      .match(/\b[A-Za-z]{2,6}\b/g) ?? [],
  ).map((token) => token.trim().toLowerCase());

  return rawTokens
    .map((token) => availableDepartments.get(token))
    .filter(Boolean);
}

function extractRequestedCourseCode(message = "", groups = []) {
  const raw = String(message ?? "");
  const candidates = new Set();
  const visibleCodes = new Map(array(groups).map((group) => [compact(group.code), group.code]));
  const regex = /\b([A-Za-z]{2,6})\s*[- ]?\s*(\d{2,4}[A-Za-z]?)\b/g;
  let match;

  while ((match = regex.exec(raw)) !== null) {
    const normalized = normalizeCourseCode(`${match[1]} ${match[2]}`);
    if (normalized) candidates.add(normalized);
  }

  for (const candidate of candidates) {
    const direct = visibleCodes.get(compact(candidate));
    if (direct) return direct;
  }

  const normalizedMessage = compact(raw);
  for (const [key, code] of visibleCodes.entries()) {
    if (normalizedMessage.includes(key)) return code;
  }

  return [...candidates][0] ?? "";
}

function isAttributeCourseSearch(message = "", courses = []) {
  const normalized = normalizeText(message);
  const asksForCourses = /\b(course|courses|class|classes|option|options|recommend|recommendation|recommendations|suggest|show|find|give)\b/.test(normalized);
  if (!asksForCourses) return false;
  return extractRequestedAttributeLabels(message, courses).length > 0 || extractRequestedDepartments(message, courses).length > 0;
}

function collectLinkedCodes(group) {
  const linked = new Set();
  array(group?.courses).forEach((course) => {
    const values = [
      ...array(course.linked_courses),
      ...array(course.linkedSections),
      ...array(course.linked_sections),
      ...array(course.linkedCrns),
      ...array(course.linked_crns),
    ];
    values.forEach((value) => {
      const text = String(value ?? "").trim();
      if (text) linked.add(text);
    });
  });
  return [...linked];
}

function getCourseDescription(course = {}) {
  return String(
    course.description
    ?? course.catalogDescription
    ?? course.courseDescription
    ?? course.summary
    ?? "",
  ).trim();
}

function getCourseTermCode(course = {}) {
  return String(course.term_code ?? course.termCode ?? course.semester ?? course.termId ?? "")
    .trim()
    .split(":")
    .pop()
    .trim();
}

function getTermSourceCode(term = {}) {
  return String(term.source_code ?? term.term_code ?? term.code ?? "")
    .trim()
    .split(":")
    .pop()
    .trim();
}

function buildTermDescriptionLookup(terms = []) {
  const lookup = new Map();
  array(terms).forEach((term) => {
    const key = getTermSourceCode(term);
    const description = String(term.description ?? term.label ?? term.name ?? "").trim();
    if (key && description) lookup.set(key, description);
  });
  return lookup;
}

function inferCourseLevel(course = {}) {
  const value = courseNumberValue(course);
  if (!Number.isFinite(value) || value === Number.MAX_SAFE_INTEGER) return "level not clearly published";
  if (value < 200) return "100-level foundation";
  if (value < 300) return "200-level intermediate";
  if (value < 400) return "300-level upper-intermediate";
  return "400+ advanced";
}

function collectCourseKeywords(course = {}) {
  return normalizeText([
    getCourseCode(course),
    getCourseTitle(course),
    getDepartment(course),
    getCourseNumber(course),
    getAttributes(course).join(" "),
    String(course.prerequisites ?? ""),
    String(course.restrictions ?? ""),
    String(course.scheduleType ?? course.scheduleTypeDescription ?? ""),
    getCourseDescription(course),
  ]);
}

function inferCourseSignals(course = {}, group = null) {
  const text = collectCourseKeywords(course);
  const scheduleType = normalizeText(course.scheduleType ?? course.scheduleTypeDescription ?? "");
  const linkedCodes = collectLinkedCodes(group);
  const hasPrerequisites = Boolean(String(course.prerequisites ?? "").trim());
  const hasLinkedComponents = linkedCodes.length > 0 || /\b(lab|recitation|tutorial|discussion)\b/.test(scheduleType);
  const projectForward = /\b(project|design|studio|seminar|capstone|research|workshop|clinical|field)\b/.test(text);
  const examForward = /\b(calculus|algebra|physics|statistics|economics|accounting|finance|mechanics|circuits|algorithms|programming|computer)\b/.test(text);
  const mathHeavy = /^(MATH|MAT|MTH|STAT|PHYS|PHY|CMPS|CSC|CSCI|CSI|EECE|EENG|CENG|CVLE|CIVE|MECH|MECE|ACCT|FINA|ECON)$/.test(getDepartment(course))
    || /\b(calculus|algebra|differential|equations|statistics|quantitative|physics|mechanics|circuit|algorithm|data structures|programming)\b/.test(text);
  const writingHeavy = /^(ENGL|ENG|ARAB|COMM|COM|HIST|CHLA|PHIL|SOAN|SOCI|PSYC|EDUC|POLS|POSC|PSPA|LAW)$/.test(getDepartment(course))
    || /\b(writing|literature|essay|communication|history|philosophy|humanities|seminar)\b/.test(text);
  const readingHeavy = writingHeavy || /\b(theory|political|social|history|philosophy|ethics|psychology|research)\b/.test(text);
  const programmingForward = /^(CMPS|CSC|CSCI|CSI|EECE|CENG|EENG|INFO|BMIS|MIS)$/.test(getDepartment(course))
    || /\b(programming|software|algorithm|data structures|database|operating systems|computer)\b/.test(text);
  const labForward = hasLinkedComponents || /\b(lab|laboratory|studio|clinical)\b/.test(text);

  return {
    hasPrerequisites,
    hasLinkedComponents,
    projectForward,
    examForward,
    mathHeavy,
    writingHeavy,
    readingHeavy,
    programmingForward,
    labForward,
  };
}

function classifyCourseQuestion(message = "") {
  const text = normalizeText(message);
  const about = /\b(what is(?: this)? course about|what topics|topics covered|learning outcomes|skills will i gain|why is this course important|tell me about)\b/.test(text);
  const role = /\b(required or elective|required|elective|who usually takes|beginners?|year level)\b/.test(text);
  const structure = /\b(how many credits|what department|how many sections|fill up quickly|offered every semester|offered in summer|summer)\b/.test(text);
  const delivery = /\b(what campus|which campus|where is it offered|where is it taught|what room|which room|what building|which building|who teaches|which professor|who is the professor|what days|which days|what time|meeting time|when is it offered)\b/.test(text);
  const prerequisites = /\b(prerequisites?|prereq|corequisites?|coreq|without the prerequisite|prerequisite for other courses|unlocks?|background knowledge|review before)\b/.test(text);
  const style = /\b(theoretical|practical|writing(?:-| )based|problem(?:-| )solving|math(?:-| )heavy|reading(?:-| )heavy|memorization(?:-| )heavy|project(?:-| )based|exam(?:-| )based|assignment(?:-| )heavy|labs?|tutorials?|recitations?|presentations?|group project|software|tools|strong laptop|programming experience|programming language)\b/.test(text);
  const policy = /\b(attendance mandatory|participation marks|weekly quizzes|pop quizzes|late submissions|penalty for late|midterm|midterms|final exam|cumulative|what percentage|grading breakdown|grading strict|grading curved|multiple choice|written questions|problem-solving questions|cheat sheets|calculators|laptops allowed|textbook|required textbook|lecture slides|recordings|sample exams|solutions|office hours)\b/.test(text);
  const prep = /\b(how much time should i study|how hard|what makes this course difficult|what makes this course easy|mistakes do students|prepare before taking|review before the semester|online resources|videos can help|take notes|study for the exams|start assignments|pass this course by studying only before exams|get a high grade|what grade do students usually get)\b/.test(text);
  const value = /\b(useful for internships|future jobs|graduate studies|heavy semester|avoid taking with|good to take with|recommend this course|advice would you give)\b/.test(text);

  return {
    about,
    role,
    structure,
    delivery,
    prerequisites,
    style,
    policy,
    prep,
    value,
    any: Boolean(about || role || structure || delivery || prerequisites || style || policy || prep || value),
  };
}

function buildCourseFactLines({
  representative,
  currentGroup,
  historyGroup,
  university,
  termLabel,
  universityTerms,
}) {
  const prerequisites = String(representative?.prerequisites ?? "").trim();
  const restrictions = String(representative?.restrictions ?? "").trim();
  const linkedCodes = collectLinkedCodes(currentGroup ?? historyGroup);
  const attributes = getAttributes(representative);
  const currentAvailabilityGroup = currentGroup ?? historyGroup;
  const currentSectionCount = currentGroup?.courses?.length ?? 0;
  const allOfferedCourses = array(historyGroup?.courses);
  const termLookup = buildTermDescriptionLookup(universityTerms);
  const offeredTerms = uniq(
    allOfferedCourses
      .map((course) => {
        const code = getCourseTermCode(course);
        return termLookup.get(code) || code;
      })
      .filter(Boolean),
  );
  const openNow = array(currentGroup?.courses).filter((course) => getOpenSeats(course) > 0).length;
  const visibleCampuses = collectGroupCampuses(currentAvailabilityGroup).slice(0, 8);
  const visibleLocations = collectGroupLocations(currentAvailabilityGroup).slice(0, 8);
  const meetingPatterns = summarizeMeetingPatterns(currentAvailabilityGroup);
  const visibleInstructors = collectGroupInstructors(currentAvailabilityGroup).slice(0, 6);

  const lines = [
    `For ${getCourseCode(representative)} - ${getCourseTitle(representative)} at ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}:`,
    `- Credits: ${getCredits(representative)}.`,
    `- Department: ${getDepartment(representative)}.`,
    `- Level signal: ${inferCourseLevel(representative)} course.`,
  ];

  if (prerequisites) {
    lines.push(`- ${prerequisites}`);
  } else {
    lines.push("- I do not currently see a published prerequisite line for this course in the visible catalog snapshot.");
  }

  if (restrictions) {
    lines.push(`- Restrictions: ${restrictions}`);
  }

  if (linkedCodes.length) {
    lines.push(`- Linked components: ${linkedCodes.join(", ")}.`);
  }

  if (attributes.length) {
    lines.push(`- Attributes / tags: ${attributes.join(", ")}.`);
  }

  if (currentAvailabilityGroup) {
    lines.push(`- Availability right now: ${summarizeAvailability(currentAvailabilityGroup)}.${sectionPreview(currentAvailabilityGroup)}`);
  }

  if (meetingPatterns.length) {
    lines.push(`- Published meeting patterns in the currently fetched sections: ${meetingPatterns.join("; ")}.`);
  }

  if (visibleCampuses.length) {
    lines.push(`- Visible campuses in the current fetched sections: ${visibleCampuses.join(", ")}.`);
  }

  if (visibleLocations.length) {
    lines.push(`- Published room/building examples: ${visibleLocations.join("; ")}.`);
  }

  if (visibleInstructors.length) {
    lines.push(`- Visible instructors in the fetched sections: ${visibleInstructors.join(", ")}.`);
  }

  if (currentSectionCount) {
    lines.push(`- Current visible section count for this term: ${currentSectionCount}${openNow ? `, with ${openNow} section${openNow === 1 ? "" : "s"} still showing open seats` : ""}.`);
  }

  if (offeredTerms.length) {
    lines.push(`- Published offered terms I can currently see for this university: ${offeredTerms.join(", ")}.`);
  }

  return lines;
}

function buildCourseQuestionLines({
  representative,
  currentGroup,
  historyGroup,
  university,
  message,
  universityTerms = [],
}) {
  const description = getCourseDescription(representative);
  const question = classifyCourseQuestion(message);
  const signals = inferCourseSignals(representative, currentGroup ?? historyGroup);
  const prerequisites = String(representative?.prerequisites ?? "").trim();
  const linkedCodes = collectLinkedCodes(currentGroup ?? historyGroup);
  const availabilityGroup = currentGroup ?? historyGroup;
  const visibleCampuses = collectGroupCampuses(availabilityGroup).slice(0, 8);
  const visibleLocations = collectGroupLocations(availabilityGroup).slice(0, 8);
  const visibleInstructors = collectGroupInstructors(availabilityGroup).slice(0, 6);
  const meetingPatterns = summarizeMeetingPatterns(availabilityGroup);
  const lines = [];

  if (!question.any || question.about) {
    if (description) {
      lines.push(`- Official catalog description: ${description}`);
    } else {
      lines.push(`- The current published snapshot does not include a long official catalog description for this course, so the safest summary comes from the title, prerequisites, and section structure.`);
      lines.push(`- Best grounded summary: ${getCourseCode(representative)} looks like a ${inferCourseLevel(representative)} ${getDepartment(representative)} course centered on "${getCourseTitle(representative)}".`);
    }

    if (signals.programmingForward) {
      lines.push("- Content/skill signal: expect computing or technical problem-solving rather than a purely discussion-style class.");
    } else if (signals.writingHeavy) {
      lines.push("- Content/skill signal: expect reading, writing, interpretation, or discussion work more than purely numerical drills.");
    } else if (signals.mathHeavy) {
      lines.push("- Content/skill signal: expect quantitative work and analytical problem-solving.");
    }
  }

  if (question.role) {
    lines.push("- Required vs elective: that depends on your major and catalog year. I cannot mark it as universally required for every student without your program and cohort.");
    lines.push(prerequisites
      ? `- Beginner fit: because this course already lists prerequisites, it is not a true from-zero beginner course.`
      : "- Beginner fit: with no published prerequisite line visible, it may be more beginner-accessible, but your major still matters.");
  }

  if (question.structure) {
    const termLookup = buildTermDescriptionLookup(universityTerms);
    const offeredSummer = array(historyGroup?.courses).some((course) => {
      const termCode = getCourseTermCode(course);
      const label = termLookup.get(termCode) || String(course.semester ?? course.termId ?? termCode);
      return /summer/i.test(label);
    });
    lines.push(`- Offering pattern: I can only confirm what appears in the currently published university snapshots, not promise every future semester.`);
    lines.push(`- Summer visibility: ${offeredSummer ? "yes, I can see at least one published summer offering in the loaded history." : "I do not currently see a published summer offering in the loaded history."}`);
  }

  if (question.delivery) {
    lines.push(meetingPatterns.length
      ? `- Time/day view: the currently fetched sections show ${meetingPatterns.join("; ")}.`
      : "- Time/day view: I do not currently have published meeting times for this course in the fetched sections.");
    lines.push(visibleCampuses.length
      ? `- Campus view: the fetched sections currently point to ${visibleCampuses.join(", ")}.`
      : "- Campus view: I do not currently have a published campus label for the visible sections.");
    lines.push(visibleLocations.length
      ? `- Room/building view: published examples include ${visibleLocations.join("; ")}.`
      : "- Room/building view: I do not currently have a published room/building string for the visible sections.");
    lines.push(visibleInstructors.length
      ? `- Teaching roster now visible: ${visibleInstructors.join(", ")}.`
      : "- Teaching roster view: the visible sections do not currently publish a named instructor beyond TBA.");
  }

  if (question.prerequisites) {
    lines.push(prerequisites
      ? `- Prerequisite guidance: ${prerequisites}`
      : "- Prerequisite guidance: no published prerequisite line is visible right now, so I cannot require one safely.");
    lines.push(linkedCodes.length
      ? `- Component guidance: this course has linked components in the current snapshot, so register carefully with the linked lab/recitation/tutorial if the section requires it.`
      : "- Component guidance: I do not currently see a linked lab/recitation requirement on the visible section data.");
  }

  if (question.style) {
    lines.push(`- Theory vs practical signal: ${signals.projectForward || signals.labForward ? "more hands-on / applied" : signals.examForward ? "more lecture-and-problem-solving oriented" : "not clearly published in the current snapshot"}.`);
    lines.push(`- Math-heavy signal: ${signals.mathHeavy ? "likely yes" : "not obviously math-heavy from the current catalog signals"}.`);
    lines.push(`- Reading-heavy signal: ${signals.readingHeavy ? "likely yes" : "not strongly signaled by the current catalog data"}.`);
    lines.push(`- Writing-heavy signal: ${signals.writingHeavy ? "likely yes" : "not strongly signaled by the current catalog data"}.`);
    lines.push(`- Lab/tutorial signal: ${signals.labForward ? "there is a lab/linked-component style signal visible." : "no strong lab/tutorial signal is published on the visible section data."}`);
    if (signals.programmingForward) {
      lines.push("- Programming/tools signal: this course sits in a computing/technical lane, but the exact software stack or language is not reliably published in the current catalog snapshot.");
    } else {
      lines.push("- Programming/tools signal: I do not see a reliable published programming-language or software requirement in the current snapshot.");
    }
  }

  if (question.policy) {
    lines.push("- Syllabus-level policies such as attendance, quizzes, grading percentages, curve policy, textbook choice, slide uploads, recordings, calculators, cheat sheets, and exact exam format are usually instructor-specific.");
    lines.push("- The current catalog snapshot does not publish those details reliably enough for me to claim an exact answer without a syllabus or instructor handout.");
  }

  if (question.prep) {
    lines.push(prerequisites
      ? `- Best preparation move: review the material behind the published prerequisite chain before the term starts.`
      : "- Best preparation move: review the foundation subjects that normally feed this department and course level.");
    lines.push(`- Effort signal: ${Number(representative?.difficulty ?? 0) > 0 ? `students in the app are currently scoring its difficulty around ${Number(representative.difficulty).toFixed(1)}/5.` : "I do not have enough structured difficulty data yet to give a precise workload number."}`);
    lines.push("- Safer study advice: start assignments early, do not leave the whole course to the final week, and use the first two weeks to check whether the lecture style matches your background.");
  }

  if (question.value) {
    lines.push(`- Career/next-course value: ${signals.programmingForward || signals.mathHeavy || signals.projectForward ? "this looks like a skills-building course that can support later technical work." : "its usefulness depends strongly on your program path and how it satisfies your curriculum buckets or electives."}`);
    lines.push("- Semester-load advice: pair it with lighter requirements if its prerequisite chain, meeting load, or app difficulty signal already looks demanding.");
  }

  if (!lines.length) {
    lines.push("- I can answer this best if you ask about the course's content, prerequisites, offering pattern, workload style, or how it fits your major and cohort.");
  }

  lines.push("I am grounding this answer in the currently published catalog snapshot, linked-section data, and any course metadata already loaded in this app. If the university changes the course line later, the answer will change after the next sync.");
  return lines;
}

function buildCourseInquiryResponse({
  university,
  termLabel,
  courses,
  universityCourses = [],
  universityTerms = [],
  message,
  selectedCourse = null,
}) {
  const currentGroups = groupCourses(courses);
  const historyGroups = groupCourses(universityCourses.length ? universityCourses : courses);
  const requestedCode = extractRequestedCourseCode(message, currentGroups)
    || extractRequestedCourseCode(message, historyGroups)
    || getCourseCode(selectedCourse);

  if (!requestedCode) {
    return {
      mode: "course-info",
      schedule: [],
      scheduleCourses: [],
      summary: `Ask me with a course code like "CMPS 201" or keep one course selected in the planner, and I can answer course-specific questions much more reliably for ${getUniversityName(university)}${termLabel ? ` ${termLabel}` : ""}.`,
      avgDifficulty: null,
    };
  }

  const currentGroup = findGroupByCode(currentGroups, requestedCode);
  const historyGroup = findGroupByCode(historyGroups, requestedCode);
  const representative = currentGroup?.representative || historyGroup?.representative || selectedCourse;
  if (!representative) {
    return {
      mode: "course-info",
      schedule: [],
      scheduleCourses: [],
      summary: `I do not currently see ${normalizeCourseCode(requestedCode)} in the visible ${getUniversityName(university)}${termLabel ? ` ${termLabel}` : ""} catalog snapshot, so I cannot answer course-specific questions about it reliably yet.`,
      avgDifficulty: null,
    };
  }

  const lines = [
    ...buildCourseFactLines({
      representative,
      currentGroup,
      historyGroup,
      university,
      termLabel,
      universityTerms,
    }),
    ...buildCourseQuestionLines({
      representative,
      currentGroup,
      historyGroup,
      university,
      message,
      universityTerms,
    }),
  ];

  return {
    mode: "course-info",
    schedule: [],
    scheduleCourses: [],
    summary: lines.join("\n"),
    avgDifficulty: Number(representative?.difficulty ?? 0) > 0 ? Number(representative.difficulty) : null,
  };
}

function getProfile(universityId = "", majorId = COMPUTER_SCIENCE) {
  if (majorId !== COMPUTER_SCIENCE) return null;
  return CS_STARTER_PROFILES[String(universityId).trim().toLowerCase()] ?? null;
}

function buildSubjectMatcher(subjects = []) {
  const normalizedSubjects = uniq(subjects.map((subject) => String(subject ?? "").trim().toUpperCase()).filter(Boolean));
  return (course) => {
    const department = getDepartment(course);
    const code = getCourseCode(course).replace(/\s+/g, "");
    return normalizedSubjects.some((subject) =>
      department === subject
      || department.startsWith(subject)
      || code.startsWith(subject),
    );
  };
}

function findGroupsForMajor(groups = [], major = {}, intent = null) {
  const subjectMatcher = buildSubjectMatcher(major.subjects ?? []);
  const labelTokens = uniq(
    normalizeText(major.label ?? "")
      .split(" ")
      .filter((token) => token.length >= 4 && !["major", "student"].includes(token)),
  );
  const keywordTokens = uniq(array(major.keywords).map(normalizeText).filter(Boolean));
  const semesterNumber = Number(intent?.semesterNumber ?? 0) || null;

  return groups
    .map((group) => {
      const representative = group.representative;
      const text = courseText(representative);
      const codeValue = courseNumberValue(representative);
      let score = 0;

      if ((major.subjects ?? []).length && subjectMatcher(representative)) score += 420;
      keywordTokens.forEach((keyword) => {
        if (text.includes(keyword)) score += 90;
      });
      labelTokens.forEach((token) => {
        if (text.includes(token)) score += 35;
      });
      if (getOpenSeats(representative) > 0) score += 15;
      if (hasMeetingTime(representative)) score += 10;

      if (semesterNumber) {
        const targetMin = semesterNumber <= 2 ? 100 : semesterNumber <= 4 ? 200 : 300;
        const targetMax = semesterNumber <= 2 ? 299 : semesterNumber <= 4 ? 399 : 599;
        if (codeValue >= targetMin && codeValue <= targetMax) score += 35;
        else if (codeValue >= Math.max(100, targetMin - 100)) score += 10;

        if (semesterNumber <= 2) {
          if (codeValue >= 300) score -= 220;
          else if (codeValue >= 230) score -= 45;
          else score += Math.max(0, 240 - codeValue) / 3;
        }
      }

      if (semesterNumber === 1) {
        if (hasPublishedPrerequisites(representative)) score -= 170;
        if (hasFirstSemesterPenalty(representative)) score -= 130;
        if (hasFirstSemesterBoost(representative)) score += 55;
      }

      return { group, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || (semesterNumber && semesterNumber <= 2
        ? courseNumberValue(left.group.representative) - courseNumberValue(right.group.representative)
        : courseNumberValue(right.group.representative) - courseNumberValue(left.group.representative))
      || left.group.code.localeCompare(right.group.code, undefined, { numeric: true }),
    )
    .map((entry) => entry.group);
}

function findGroupByCode(groups = [], code = "", alternatives = []) {
  const wanted = uniq([code, ...array(alternatives)].map(normalizeCourseCode).filter(Boolean));
  if (!wanted.length) return null;
  const byKey = new Map(groups.map((group) => [compact(group.code), group]));
  for (const candidate of wanted) {
    const match = byKey.get(compact(candidate));
    if (match) return match;
  }
  return null;
}

function findRequirementGroup(groups = [], options = {}, usedCodes = new Set()) {
  const {
    attribute = "",
    department = "",
    departments = [],
    minNumber = 0,
    excludeCodes = [],
    keywords = [],
  } = options;
  const normalizedDepartments = uniq([department, ...array(departments)].map((value) => String(value ?? "").trim().toUpperCase()).filter(Boolean));
  const excluded = new Set(array(excludeCodes).map((value) => compact(normalizeCourseCode(value))));
  const keywordList = array(keywords).map(normalizeText).filter(Boolean);

  return groups
    .filter((group) => {
      const representative = group.representative;
      const codeKey = compact(group.code);
      if (usedCodes.has(codeKey) || excluded.has(codeKey)) return false;
      if (normalizedDepartments.length && !normalizedDepartments.includes(getDepartment(representative))) return false;
      if (attribute) {
        const attributes = getAttributes(representative).map(normalizeText);
        if (!attributes.some((label) => label.includes(normalizeText(attribute)))) return false;
      }
      if (minNumber && courseNumberValue(representative) < minNumber) return false;
      if (keywordList.length) {
        const text = courseText(representative);
        if (!keywordList.some((keyword) => text.includes(keyword))) return false;
      }
      return true;
    })
    .sort((left, right) =>
      getOpenSeats(right.representative) - getOpenSeats(left.representative)
      || (hasMeetingTime(right.representative) ? 1 : 0) - (hasMeetingTime(left.representative) ? 1 : 0)
      || courseNumberValue(left.representative) - courseNumberValue(right.representative)
      || left.code.localeCompare(right.code, undefined, { numeric: true }),
    )[0] ?? null;
}

function limitationResponse(university, major, message, termLabel) {
  return {
    mode: "course-info",
    schedule: [],
    scheduleCourses: [],
    summary: `I do not see enough matching courses in the current visible ${getUniversityName(university)} catalog snapshot to build a reliable ${major?.label ?? "major"} schedule${termLabel ? ` for ${termLabel}` : ""} yet. If the term is still syncing, try again once more after the catalog refresh finishes.`,
    avgDifficulty: null,
  };
}

function createScheduleResponse({ summary, pickedCourses }) {
  return {
    mode: "schedule",
    schedule: pickedCourses.map((course) => course.id).filter(Boolean),
    scheduleCourses: pickedCourses,
    summary,
    avgDifficulty: null,
  };
}

function buildAttributeCourseSearchResponse({ university, termLabel, courses, message }) {
  const groups = groupCourses(courses);
  const requestedAttributes = extractRequestedAttributeLabels(message, courses);
  const requestedDepartments = extractRequestedDepartments(message, courses);
  if (!requestedAttributes.length && !requestedDepartments.length) return null;

  const filteredGroups = groups
    .filter((group) => {
      const representative = group.representative;
      const attributeLabels = getAttributes(representative).map(normalizeText);
      const department = getDepartment(representative);

      if (requestedDepartments.length && !requestedDepartments.includes(department)) return false;
      if (requestedAttributes.length && !requestedAttributes.every((label) => {
        const normalizedLabel = normalizeText(label);
        return attributeLabels.some((attribute) => attribute.includes(normalizedLabel));
      })) {
        return false;
      }

      return true;
    })
    .sort((left, right) =>
      getOpenSeats(right.representative) - getOpenSeats(left.representative)
      || (hasMeetingTime(right.representative) ? 1 : 0) - (hasMeetingTime(left.representative) ? 1 : 0)
      || courseNumberValue(left.representative) - courseNumberValue(right.representative)
      || left.code.localeCompare(right.code, undefined, { numeric: true }),
    );

  const matches = filteredGroups
    .slice(0, 6)
    .map((group) => ({ group, chosen: chooseSection(group, []) }))
    .filter((entry) => entry.chosen);

  const requestedLabels = uniq([
    ...requestedAttributes,
    ...requestedDepartments.map((department) => `${department} subject prefix`),
  ]);
  const intro = `For ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}, I searched the current visible catalog for courses matching ${requestedLabels.join(" + ")} together.`;

  if (!matches.length) {
    const clarification = requestedDepartments.includes("CHLA")
      ? "I interpreted CHLA as the CHLA subject prefix, because CHLA is not itself an AUB attribute label."
      : null;
    return {
      mode: "course-info",
      schedule: [],
      scheduleCourses: [],
      summary: [
        intro,
        clarification,
        "I do not currently see a visible course that matches all of those filters at the same time in this snapshot. Try relaxing one filter or asking me for the closest matches.",
      ].filter(Boolean).join("\n"),
      avgDifficulty: null,
    };
  }

  const lines = matches.map(({ group }) => {
    const representative = group.representative;
    return `- ${group.code} - ${getCourseTitle(representative)} (${getCredits(representative)} cr). Attributes: ${getAttributes(representative).join(", ")}. Availability: ${summarizeAvailability(group)}.${sectionPreview(group)}`;
  });

  if (requestedDepartments.includes("CHLA")) {
    lines.unshift("I interpreted CHLA as the CHLA subject prefix, because CHLA is not itself an AUB attribute label.");
  }

  return {
    mode: "course-info",
    schedule: [],
    scheduleCourses: [],
    summary: [intro, ...lines].join("\n"),
    avgDifficulty: null,
  };
}

function addElectiveIfUseful({ groups, pickedCourses, usedCodes, attributeHints = [], label }) {
  const electiveGroup = groups
    .filter((group) => {
      const codeKey = compact(group.code);
      if (usedCodes.has(codeKey)) return false;
      const attributes = getAttributes(group.representative).map(normalizeText);
      return attributeHints.some((hint) => attributes.some((attribute) => attribute.includes(normalizeText(hint))));
    })
    .sort((left, right) =>
      getOpenSeats(right.representative) - getOpenSeats(left.representative)
      || courseNumberValue(left.representative) - courseNumberValue(right.representative)
      || left.code.localeCompare(right.code, undefined, { numeric: true }),
    )[0];

  if (!electiveGroup) return null;
  const electiveCourse = chooseSection(electiveGroup, pickedCourses);
  if (!electiveCourse) return null;
  usedCodes.add(compact(electiveGroup.code));
  pickedCourses.push(electiveCourse);
  return `- ${ATTRIBUTE_ELECTIVE_CATEGORY}: ${electiveGroup.code} - ${getCourseTitle(electiveGroup.representative)} (${getCredits(electiveGroup.representative)} cr). This section currently has open seats and lines up with ${label}. Availability: ${summarizeAvailability(electiveGroup)}.${sectionPreview(electiveGroup)}`;
}

function buildCurriculumSemesterPlan({ university, termLabel, courses, major, message }) {
  const universityId = getUniversityId(university);
  const resolved = resolveCurriculumSemester({
    universityId,
    major,
    message,
  });
  if (!resolved) return null;

  const groups = groupCourses(courses);
  const usedCodes = new Set();
  const pickedCourses = [];
  const summaryLines = [
    `For semester ${resolved.semesterNumber} as a ${major.label} student at ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}, I built a schedule from the official ${resolved.plan.title} sequence and then matched it to the live visible sections:`,
  ];

  for (const item of array(resolved.semester.items)) {
    let group = null;
    if (item.type === "course") {
      group = findGroupByCode(groups, item.code, item.alternatives);
    } else if (item.type === "elective") {
      group = findRequirementGroup(groups, {
        department: item.department,
        departments: item.departments,
        minNumber: item.minNumber,
        excludeCodes: item.excludeCodes,
      }, usedCodes);
    } else if (item.type === "requirement") {
      group = findRequirementGroup(groups, {
        attribute: item.attribute,
        department: item.department,
        departments: item.departments,
        keywords: item.attribute ? [] : [item.code],
      }, usedCodes);
    }

    if (!group) continue;
    const chosen = chooseSection(group, pickedCourses);
    if (!chosen) continue;
    usedCodes.add(compact(group.code));
    pickedCourses.push(chosen);

    const category = item.type === "requirement" || item.type === "elective"
      ? ATTRIBUTE_ELECTIVE_CATEGORY
      : "Official sequence course";
    summaryLines.push(`- ${category}: ${group.code} - ${getCourseTitle(group.representative)} (${getCredits(group.representative)} cr). Availability: ${summarizeAvailability(group)}.${sectionPreview(group)}`);
  }

  if (universityId === "aub" && major.id === COMPUTER_SCIENCE && resolved.semesterNumber === 3) {
    const electiveLine = addElectiveIfUseful({
      groups,
      pickedCourses,
      usedCodes,
      attributeHints: ["Human Values", "History of Ideas", "Cultures and Histories", "Societies and Individuals"],
      label: "AUB General Education buckets the CS student still needs",
    });
    if (electiveLine) summaryLines.push(electiveLine);
  }

  if (!pickedCourses.length) return null;

  const sourceCheckedAt = formatRefreshMoment(resolved.plan?.sourceMeta?.checkedAt);
  const parserMode = String(resolved.plan?.sourceMeta?.parserMode ?? "");
  summaryLines.push(`Advisor check: this follows the official ${resolved.plan.title} plan more closely than a free-form guess, but seat availability and linked components still depend on the live catalog snapshot. Source tracked: ${resolved.plan.source}${sourceCheckedAt ? ` (last refreshed ${sourceCheckedAt})` : ""}.`);
  if (parserMode && parserMode !== "parsed") {
    summaryLines.push("Curriculum refresh note: the latest automated source check fell back to the maintained mapped sequence for this plan, so I am being conservative about claiming a fully fresh audit.");
  }
  return createScheduleResponse({
    summary: summaryLines.join("\n"),
    pickedCourses,
  });
}

function buildFirstSemesterComputerSciencePlan({ university, termLabel, courses, catalogStats }) {
  const universityId = getUniversityId(university);
  const profile = getProfile(universityId, COMPUTER_SCIENCE);
  if (!profile) {
    return buildFirstSemesterGenericPlan({
      university,
      termLabel,
      courses,
      catalogStats,
      major: MAJOR_HINTS.find((hint) => hint.id === COMPUTER_SCIENCE),
    });
  }

  const groups = groupCourses(courses);
  const usedCodes = new Set();
  const pickedCourses = [];
  const summaryLines = [
    `For a first-semester Computer Science student at ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}, I built a schedule from the visible catalog foundations for this university:`,
  ];

  for (const bundle of profile.bundles) {
    const groupsForBundle = array(bundle.codes)
      .map((code) => findGroupByCode(groups, code))
      .filter(Boolean);

    const chosenGroups = bundle.takeAll ? groupsForBundle : groupsForBundle.slice(0, 1);
    if (!chosenGroups.length) continue;

    chosenGroups.forEach((group) => {
      const codeKey = compact(group.code);
      if (usedCodes.has(codeKey)) return;
      const course = chooseSection(group, pickedCourses);
      if (!course) return;
      usedCodes.add(codeKey);
      pickedCourses.push(course);
      summaryLines.push(`- ${bundle.category}: ${group.code} - ${getCourseTitle(group.representative)} (${getCredits(group.representative)} cr). ${bundle.reason} Availability: ${summarizeAvailability(group)}.${sectionPreview(group)}`);
    });
  }

  if (!pickedCourses.length) {
    return limitationResponse(university, { label: "Computer Science" }, "", termLabel);
  }

  summaryLines.push(`Advisor check: this is a catalog-grounded first-term CS plan, not a graduation audit. Snapshot coverage right now: ${catalogStats?.totalSections ?? pickedCourses.length} sections across ${catalogStats?.uniqueCourses ?? groups.length} visible courses.`);

  return createScheduleResponse({
    summary: summaryLines.join("\n"),
    pickedCourses,
  });
}

function collectSupportGroups(groups, usedCodes, semesterNumber, major = null) {
  const majorLabel = normalizeText(major?.label ?? "");
  const technicalMajor = /\b(engineering|computer|physics|chemistry|biology|mathematics|biotechnology|optometry)\b/.test(majorLabel);
  const technicalDepartments = new Set(["MATH", "MAT", "MTH", "STAT", "ENGL", "ENG", "COMM", "COM", "PHYS", "PHY", "CHEM", "CHM"]);
  const generalDepartments = new Set(["MATH", "MAT", "MTH", "STAT", "ENGL", "ENG", "COMM", "COM", "CHEM", "CHM", "PHYS", "PHY"]);
  return groups.filter((group) => {
    const codeKey = compact(group.code);
    if (usedCodes.has(codeKey)) return false;
    const text = courseText(group.representative);
    const department = getDepartment(group.representative);
    if (semesterNumber && semesterNumber >= 3) {
      return /\b(human values|cultures and histories|history of ideas|societies and individuals|digital cultures|change makers)\b/.test(text);
    }
    if (technicalMajor) {
      return technicalDepartments.has(department)
        || (!department && /\b(english|writing|communication|calculus|algebra|statistics|physics|chemistry)\b/.test(text));
    }
    return generalDepartments.has(department)
      || (!department && /\b(english|writing|communication|calculus|algebra|statistics|chemistry|physics)\b/.test(text));
  });
}

function buildFirstSemesterGenericPlan({ university, termLabel, courses, major }) {
  const groups = groupCourses(courses);
  const usedCodes = new Set();
  const pickedCourses = [];
  const majorGroups = findGroupsForMajor(groups, major, { semesterNumber: 1 });
  const summaryLines = [
    `For a first-semester ${major.label} student at ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}, I drafted a practical starter plan from the live visible catalog:`,
  ];

  majorGroups.slice(0, 3).forEach((group) => {
    const chosen = chooseSection(group, pickedCourses);
    if (!chosen) return;
    usedCodes.add(compact(group.code));
    pickedCourses.push(chosen);
    summaryLines.push(`- Major foundation: ${group.code} - ${getCourseTitle(group.representative)} (${getCredits(group.representative)} cr). Availability: ${summarizeAvailability(group)}.${sectionPreview(group)}`);
  });

  collectSupportGroups(groups, usedCodes, 1, major).slice(0, 3).forEach((group) => {
    const chosen = chooseSection(group, pickedCourses);
    if (!chosen) return;
    usedCodes.add(compact(group.code));
    pickedCourses.push(chosen);
    summaryLines.push(`- Support course: ${group.code} - ${getCourseTitle(group.representative)} (${getCredits(group.representative)} cr). Availability: ${summarizeAvailability(group)}.${sectionPreview(group)}`);
  });

  if (!pickedCourses.length) {
    return limitationResponse(university, major, "", termLabel);
  }

  const unmappedOfficialMajorNote = buildUnmappedOfficialMajorNote(major);
  summaryLines.push("Advisor check: this is a best-effort first-term plan from the visible catalog, not a faculty-approved graduation audit.");
  if (unmappedOfficialMajorNote) summaryLines.push(unmappedOfficialMajorNote);
  return createScheduleResponse({ summary: summaryLines.join("\n"), pickedCourses });
}

function buildGenericSemesterMajorPlan({ university, termLabel, courses, major, intent }) {
  const groups = groupCourses(courses);
  const majorGroups = findGroupsForMajor(groups, major, intent);
  if (!majorGroups.length) {
    return limitationResponse(university, major, intent?.rawMessage ?? "", termLabel);
  }

  const pickedCourses = [];
  const usedCodes = new Set();
  const semesterNumber = Number(intent?.semesterNumber ?? 0) || null;
  const targetCount = semesterNumber && semesterNumber >= 5 ? 5 : 4;
  const summaryLines = [
    `For semester ${semesterNumber ?? "this term"} as a ${major.label} student at ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}, I drafted a catalog-based schedule from the live sections:`,
  ];

  majorGroups.slice(0, targetCount + 3).forEach((group) => {
    if (pickedCourses.length >= Math.max(3, targetCount)) return;
    const codeKey = compact(group.code);
    if (usedCodes.has(codeKey)) return;
    const chosen = chooseSection(group, pickedCourses);
    if (!chosen) return;
    usedCodes.add(codeKey);
    pickedCourses.push(chosen);
    summaryLines.push(`- ${major.label} option: ${group.code} - ${getCourseTitle(group.representative)} (${getCredits(group.representative)} cr). Availability: ${summarizeAvailability(group)}.${sectionPreview(group)}`);
  });

  if (getUniversityId(university) === "lau" && major.id === COMPUTER_SCIENCE && (semesterNumber ?? 0) >= 5) {
    const elective1 = addElectiveIfUseful({
      groups,
      pickedCourses,
      usedCodes,
      attributeHints: ["Digital Cultures", "Change Makers"],
      label: "LAU curriculum buckets like Digital Cultures or Change Makers",
    });
    if (elective1) summaryLines.push(elective1);
  }

  if (!pickedCourses.length) {
    return limitationResponse(university, major, intent?.rawMessage ?? "", termLabel);
  }

  summaryLines.push("Advisor check: this is a practical catalog-based schedule, not a final graduation audit unless the official curriculum year is fully mapped for this university and major.");
  const unmappedOfficialMajorNote = buildUnmappedOfficialMajorNote(major);
  if (unmappedOfficialMajorNote) summaryLines.push(unmappedOfficialMajorNote);
  return createScheduleResponse({ summary: summaryLines.join("\n"), pickedCourses });
}

function buildAttributeRequirementResponse({ university, termLabel, catalogStats, major, message }) {
  const universityId = getUniversityId(university);
  const majorLabel = major?.label ?? "this major";
  const entryYear = extractEntryYear(message);
  const prefix = `For ${majorLabel} at ${getUniversityName(university)}${entryYear ? ` for a student who entered in ${entryYear}` : ""},`;
  const curriculumStatusLines = buildCurriculumStatusLines(universityId);

  if (universityId === "aub") {
    return {
      mode: "course-info",
      schedule: [],
      scheduleCourses: [],
      summary: [
        `${prefix} the General Education / attribute side is still 39 credits across 8 buckets, not just a random set of elective chips.`,
        "- Understanding Communication",
        "- Arabic",
        "- Cultures and Histories",
        "- Human Values",
        "- Societies and Individuals",
        "- Understanding the World",
        "- Quantitative Reasoning",
        "- Community Engaged Learning",
        "So when you ask which attributes you should take, the answer is tied to the AUB General Education structure rather than only the current term search filters.",
        "Source tracked: https://www.aub.edu.lb/Registrar/catalogue2024-25/Pages/undergraduate-fas-general-education-program.aspx",
        ...curriculumStatusLines,
      ].join("\n"),
      avgDifficulty: null,
    };
  }

  if (universityId === "lau") {
    const entry = Number(entryYear ?? 0) || null;
    const curriculumTrack = entry && entry <= 2021 ? "Curriculum B" : "Curriculum Z";
    return {
      mode: "course-info",
      schedule: [],
      scheduleCourses: [],
      summary: [
        `${prefix} LAU uses the LAU Liberal Arts Curriculum A/B framework for older cohorts and the 2022+ Curriculum Z refresh for newer cohorts, rather than a generic one-size-fits-all attribute bucket model.`,
        entry
          ? `For a student who entered in ${entry}, I would track this under ${curriculumTrack}.`
          : "If you give me the entry year, I can map you to the correct LAU LAC cohort.",
        "The graduation logic should therefore be checked against the LAU Liberal Arts Curriculum A/B or Curriculum Z structure, not just the selected-term labels.",
        "Source tracked: https://catalog.lau.edu.lb/2024-2025/undergraduate/lac.php",
        ...curriculumStatusLines,
      ].join("\n"),
      avgDifficulty: null,
    };
  }

  if (universityId === "lu") {
    return {
      mode: "course-info",
      schedule: [],
      scheduleCourses: [],
      summary: [
        `${prefix} the right source of truth is the faculty curriculum, so do not use the selected-term attribute chips as if they were the graduation audit.`,
        `For ${majorLabel}, I would check the relevant ${/agriculture/i.test(majorLabel) ? "Faculty of Agriculture curriculum" : "faculty curriculum"} for the exact cohort-year requirements.`,
        "Lebanese University planning is usually faculty/branch specific, so the academic audit should be tied to that faculty's study plan first and the live visible sections second.",
        ...curriculumStatusLines,
      ].join("\n"),
      avgDifficulty: null,
    };
  }

  const visibleAttributes = array(catalogStats?.attributes)
    .slice(0, 10)
    .map((attribute) => attribute.label || attribute)
    .filter(Boolean);

  return {
    mode: "course-info",
    schedule: [],
    scheduleCourses: [],
    summary: [
      `${prefix} I can see the current selected-term requirement tags${termLabel ? ` in ${termLabel}` : ""}, but the exact graduation rules still depend on the university's catalog year and faculty/program structure.`,
      visibleAttributes.length
        ? `Visible current-term tags include: ${visibleAttributes.join(", ")}.`
        : "The selected term does not expose enough attribute-style labels to replace the official curriculum guide.",
      "So I will use the live tags to help you search, but I will not pretend they replace the official curriculum audit for your cohort.",
      ...curriculumStatusLines,
    ].join("\n"),
    avgDifficulty: null,
  };
}

function buildAcademicAbbreviationResponse({ message, university }) {
  const universityId = getUniversityId(university);
  const normalized = normalizeText(message);
  const overrides = UNIVERSITY_ABBREVIATION_OVERRIDES[universityId] ?? {};
  const requested = uniq(
    Object.keys({ ...GLOBAL_ABBREVIATIONS, ...overrides })
      .filter((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`).test(normalized)),
  );

  const tokens = requested.length ? requested : ["osb", "cce", "cse", "ece", "cmps"].filter((token) => token in GLOBAL_ABBREVIATIONS || token in overrides);
  const lines = tokens.map((token) => overrides[token] ?? GLOBAL_ABBREVIATIONS[token]).filter(Boolean);

  return {
    mode: "course-info",
    schedule: [],
    scheduleCourses: [],
    summary: lines.join("\n"),
    avgDifficulty: null,
  };
}

function buildCatalogReliabilityLines(catalogStats = {}) {
  const lines = [];
  const freshness = formatCatalogFreshness(catalogStats?.updatedAt);
  if (freshness) lines.push(freshness);
  if (catalogStats?.resolutionNote) lines.push(String(catalogStats.resolutionNote).trim());
  if (catalogStats?.effectiveTermLabel && catalogStats?.effectiveTermLabel !== catalogStats?.semesterLabel) {
    lines.push(`Effective live term in use: ${catalogStats.effectiveTermLabel}.`);
  }
  if (Array.isArray(catalogStats?.campuses) && catalogStats.campuses.length) {
    lines.push(`Visible campuses in the fetched sections: ${catalogStats.campuses.slice(0, 10).join(", ")}.`);
  }
  if (Number(catalogStats?.timedSections ?? 0) > 0) {
    lines.push(`Timed-section coverage in this live term: ${catalogStats.timedSections} section${Number(catalogStats.timedSections) === 1 ? "" : "s"} with published meetings.`);
  }
  if (Number(catalogStats?.courseDescriptionCount ?? 0) > 0 || Number(catalogStats?.sectionsWithPrerequisites ?? 0) > 0) {
    lines.push(`Fetched metadata coverage: ${Number(catalogStats?.courseDescriptionCount ?? 0)} course descriptions and ${Number(catalogStats?.sectionsWithPrerequisites ?? 0)} published prerequisite lines currently visible.`);
  }
  return lines;
}

function buildCurriculumOverview({ university, termLabel, courses, catalogStats, message }) {
  const universityId = getUniversityId(university);
  const groups = groupCourses(courses).slice(0, 10);
  const sample = groups.map((group) => `${group.code} ${getCourseTitle(group.representative)}`).join("; ");

  return {
    mode: "course-info",
    schedule: [],
    scheduleCourses: [],
    summary: [
      `I am ready for ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}.`,
      `I can inspect ${catalogStats?.totalSections ?? courses.length} sections and ${catalogStats?.uniqueCourses ?? groups.length} visible course codes in the current snapshot.`,
      ...buildCatalogReliabilityLines(catalogStats),
      ...buildCurriculumStatusLines(universityId),
      sample ? `Visible course examples: ${sample}.` : "Ask me about a major, a prerequisite chain, an attribute bucket, or a schedule constraint and I will work from the visible catalog snapshot.",
      `Your last message was: "${String(message ?? "").trim()}".`,
    ].join("\n"),
    avgDifficulty: null,
  };
}

function buildGeneralAdvisorResponse({
  university,
  termLabel,
  courses,
  catalogStats,
  message,
  major = null,
  selectedCourse = null,
} = {}) {
  const trimmedMessage = String(message ?? "").trim();
  const groups = groupCourses(courses);
  const scopedGroups = major ? findGroupsForMajor(groups, major, getAdvisorIntent(trimmedMessage)) : groups;
  const visibleGroups = (scopedGroups.length ? scopedGroups : groups).slice(0, 8);
  const sample = visibleGroups.map((group) => `${group.code} ${getCourseTitle(group.representative)}`).join("; ");
  const selectedCode = selectedCourse ? getCourseCode(selectedCourse) : "";
  const selectedTitle = selectedCourse ? getCourseTitle(selectedCourse) : "";
  const lines = [];

  if (isGreetingMessage(trimmedMessage)) {
    lines.push(`I am ready for ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}.`);
  } else if (major && /\b(schedule|semester|plan|take|load)\b/.test(normalizeText(trimmedMessage))) {
    lines.push(`I detected ${major.label} in your request for ${getUniversityName(university)}${termLabel ? ` ${termLabel}` : ""}, but I still need one more anchor like the semester number, cohort year, or a stronger time constraint to build the most reliable plan.`);
  } else if (selectedCode && looksLikeQuestion(trimmedMessage)) {
    lines.push(`I have ${selectedCode}${selectedTitle ? ` - ${selectedTitle}` : ""} in focus, but your last message was too broad for me to classify with full confidence.`);
    lines.push(`If you want a grounded answer right now, ask me something direct like "explain the prerequisites of ${selectedCode}", "is ${selectedCode} math-heavy", "is ${selectedCode} offered in summer", or "what does ${selectedCode} unlock next".`);
  } else if (looksLikeQuestion(trimmedMessage)) {
    lines.push(`I did not classify your last question precisely enough to trust a narrow answer, so I am staying grounded in the visible ${getUniversityName(university)} catalog instead of guessing.`);
  } else {
    lines.push(`I am ready for ${getUniversityName(university)}${termLabel ? ` in ${termLabel}` : ""}.`);
  }

  lines.push(`Current snapshot coverage: ${catalogStats?.totalSections ?? courses.length} live sections and ${catalogStats?.uniqueCourses ?? visibleGroups.length} visible course codes.`);
  lines.push(...buildCatalogReliabilityLines(catalogStats));

  if (major) {
    lines.push(`Detected academic context: ${major.label}.`);
  }

  if (sample) {
    lines.push(`Visible examples in this context: ${sample}.`);
  }

  if (!selectedCode) {
    lines.push("I answer best when you give me a course code, CRN, major + semester number, attribute bucket, or a clear schedule constraint.");
  }

  lines.push("Examples I can handle reliably right now: schedule building by major/semester, prerequisite chains, open-seat course recommendations, requirement buckets, linked labs/recitations, and current-term section comparisons.");

  return {
    mode: "course-info",
    schedule: [],
    scheduleCourses: [],
    summary: lines.join("\n"),
    avgDifficulty: null,
  };
}

function buildAdvisorLocalResponse({
  message = "",
  university = {},
  semesterLabel = "",
  catalogStats = null,
  advisorCourses = [],
  universityCourses = [],
  universityTerms = [],
  relevantCourses = [],
  sections = [],
  favoriteCourses = [],
  scheduledCourses = [],
  selectedCourse = null,
} = {}) {
  const intent = getAdvisorIntent(message);
  const mergedCourses = uniq(
    [
      ...array(advisorCourses),
      ...array(sections),
      ...array(relevantCourses),
      ...array(favoriteCourses),
      ...array(scheduledCourses),
    ].filter(Boolean),
  );

  const major = detectMajor(message, university);
  const termLabel = semesterLabel || catalogStats?.semesterLabel || "";
  const normalizedMessage = normalizeText(message);

  if (!intent.any) {
    if (selectedCourse && looksLikeQuestion(message)) {
      return buildCourseInquiryResponse({
        university,
        termLabel,
        courses: mergedCourses,
        universityCourses,
        universityTerms,
        message,
        selectedCourse,
      });
    }

    return buildGeneralAdvisorResponse({
      university,
      termLabel,
      courses: mergedCourses,
      catalogStats,
      message,
      major,
      selectedCourse,
    });
  }

  if (intent.attributeRequirement && isAttributeCourseSearch(message, mergedCourses)) {
    return buildAttributeCourseSearchResponse({
      university,
      termLabel,
      courses: mergedCourses,
      message,
    });
  }

  if (intent.attributeRequirement) {
    return buildAttributeRequirementResponse({
      university,
      termLabel,
      catalogStats,
      major,
      message,
    });
  }

  if (intent.abbreviationMeaning) {
    return buildAcademicAbbreviationResponse({
      message,
      university,
    });
  }

  if (intent.courseInquiry || (selectedCourse && intent.broadCourseQuestion) || (selectedCourse && /\b(it|its|this|that)\b/.test(normalizedMessage) && looksLikeQuestion(message))) {
    return buildCourseInquiryResponse({
      university,
      termLabel,
      courses: mergedCourses,
      universityCourses,
      universityTerms,
      message,
      selectedCourse,
    });
  }

  if (intent.semesterNumber && major) {
    const curriculumPlan = buildCurriculumSemesterPlan({
      university,
      termLabel,
      courses: mergedCourses,
      major,
      message,
    });
    if (curriculumPlan) return curriculumPlan;
  }

  if (intent.firstSemester && major) {
    const curriculumPlan = buildCurriculumSemesterPlan({
      university,
      termLabel,
      courses: mergedCourses,
      major,
      message,
    });
    if (curriculumPlan) return curriculumPlan;
  }

  if (intent.firstSemester && major?.id === COMPUTER_SCIENCE) {
    return buildFirstSemesterComputerSciencePlan({
      university,
      termLabel,
      courses: mergedCourses,
      catalogStats,
    });
  }

  if (intent.firstSemester && major) {
    return buildFirstSemesterGenericPlan({
      university,
      termLabel,
      courses: mergedCourses,
      catalogStats,
      major,
    });
  }

  if (intent.semesterPlan && major) {
    return buildGenericSemesterMajorPlan({
      university,
      termLabel,
      courses: mergedCourses,
      catalogStats,
      major,
      intent: { ...intent, rawMessage: message },
    });
  }

  return buildGeneralAdvisorResponse({
    university,
    termLabel,
    courses: mergedCourses,
    catalogStats,
    message,
    major,
    selectedCourse,
  });
}

function buildAdvisorPromptContext({
  message = "",
  university = {},
  semesterLabel = "",
  catalogStats = null,
  advisorCourses = [],
  universityTerms = [],
  selectedCourse = null,
} = {}) {
  const major = detectMajor(message, university);
  const groups = groupCourses(advisorCourses);
  const relevantGroups = major ? findGroupsForMajor(groups, major, getAdvisorIntent(message)) : groups;
  const selectedCode = selectedCourse ? getCourseCode(selectedCourse) : "";

  return {
    advisorIntent: getAdvisorIntent(message),
    detectedMajor: major,
    semesterLabel: semesterLabel || catalogStats?.semesterLabel || "",
    effectiveTermLabel: catalogStats?.effectiveTermLabel || semesterLabel || catalogStats?.semesterLabel || "",
    catalogFreshness: formatCatalogFreshness(catalogStats?.updatedAt),
    resolutionNote: catalogStats?.resolutionNote || "",
    timedSections: Number(catalogStats?.timedSections ?? 0) || 0,
    visibleCampuses: array(catalogStats?.campuses).slice(0, 10),
    publishedTerms: array(universityTerms)
      .map((term) => String(term?.description ?? term?.label ?? term?.name ?? "").trim())
      .filter(Boolean)
      .slice(0, 12),
    curriculumStatus: getCurriculumStatus(),
    selectedCourseContext: selectedCode
      ? {
          code: selectedCode,
          title: getCourseTitle(selectedCourse),
          campus: String(selectedCourse?.campus ?? "").trim() || null,
          instructor: String(selectedCourse?.instructor ?? "").trim() || null,
          meetings: getMeetings(selectedCourse).slice(0, 4),
        }
      : null,
    visibleCatalogSample: relevantGroups.slice(0, 12).map((group) => ({
      code: group.code,
      title: getCourseTitle(group.representative),
      credits: getCredits(group.representative),
      attributes: getAttributes(group.representative).slice(0, 4),
      prerequisites: group.representative.prerequisites ?? null,
      sections: group.courses.length,
      availability: summarizeAvailability(group),
    })),
  };
}

module.exports = {
  buildAdvisorLocalResponse,
  buildAdvisorPromptContext,
  detectMajor,
  getAdvisorIntent,
  isAdvisorIntent,
};
