// src/components/AIScheduler.tsx
import { useState, useRef, useEffect, useMemo } from "react";
import type { Course } from "../types";
import { API_ROOT as API } from "../config/runtime.ts";

type Message = { role: "user" | "assistant"; content: string };
type AiStatus = {
  remoteEnabled: boolean;
  provider: string;
  model: string;
  message: string;
};

type Props = {
  allCourses: Course[];
  scheduledCourses: Course[];
  favoriteCourses: Course[];
  selectedCourse?: Course | null;
  selectedCrns: string[];
  semesterLabel: string;
  termId: string;
  catalogUpdatedAt?: string | null;
  onApplySchedule: (courses: Course[]) => void;
  activeSlot: number;
  universityId: string;
  universityName: string;
};

type UniversityWelcomeProfile = {
  lead: string;
  language: string;
  strengths: string;
  prompts: string[];
};

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function dayLabel(d: string) {
  return (
    ({ M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat" } as any)[
      d
    ] ?? d
  );
}

function extractCourseCodes(text: string): string[] {
  const matches = text.toUpperCase().match(/[A-Z]{2,5}\s*\d{2,4}[A-Z]?/g) ?? [];
  return [...new Set(matches.map((c) => c.replace(/\s+/, " ").trim()))];
}

function extractCrns(text: string): string[] {
  const matches = [...text.matchAll(/\bCRN\s*([A-Z0-9-]{4,})\b/gi)];
  return [...new Set(matches.map((match) => String(match[1] ?? "").trim()).filter(Boolean))];
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
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

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractScheduleLookupKeys(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const tokens = [raw];
  raw.split(":").forEach((part) => {
    const normalizedPart = part.trim();
    if (normalizedPart) {
      tokens.push(normalizedPart);
    }
  });

  const crnMatch = raw.match(/\b(?:crn\s*)?([a-z]{0,6}-?\d{3,}|\d{4,})\b/i);
  if (crnMatch?.[1]) {
    tokens.push(crnMatch[1]);
  }

  const codeMatch = raw.match(/[A-Z]{2,8}\s*\d{2,4}[A-Z]?/i);
  if (codeMatch?.[0]) {
    tokens.push(codeMatch[0]);
  }

  return [...new Set(tokens.map((token) => compact(token)).filter(Boolean))];
}

function resolveScheduledCourses(
  scheduleEntries: unknown[],
  sourceCourses: Course[],
  fallbackCourses: unknown[] = [],
) {
  const fallbackPool = fallbackCourses.filter(Boolean) as Partial<Course>[];
  const coursePool = [...sourceCourses, ...fallbackPool.filter((candidate) => {
    const id = String(candidate.id ?? "");
    return !sourceCourses.some((course) => course.id === id);
  }) as Course[]];
  const matched: Course[] = [];
  const used = new Set<string>();

  scheduleEntries.forEach((entry) => {
    const directId = typeof entry === "object" && entry !== null && "id" in (entry as Record<string, unknown>)
      ? String((entry as Record<string, unknown>).id ?? "").trim()
      : String(entry ?? "").trim();
    const directCode = typeof entry === "object" && entry !== null && "code" in (entry as Record<string, unknown>)
      ? String((entry as Record<string, unknown>).code ?? "").trim()
      : "";
    const directSection = typeof entry === "object" && entry !== null && "section" in (entry as Record<string, unknown>)
      ? String((entry as Record<string, unknown>).section ?? "").trim()
      : "";
    const lookupKeys = [
      ...extractScheduleLookupKeys(entry),
      ...extractScheduleLookupKeys(directCode),
      ...extractScheduleLookupKeys(directSection),
      ...(directCode && directSection ? extractScheduleLookupKeys(`${directCode} ${directSection}`) : []),
    ];

    const found = coursePool.find((course) => {
      const courseId = String(course.id ?? "").trim();
      const courseCrn = String(course.crn ?? "").trim();
      const courseCode = String(course.code ?? "").trim();
      const courseSection = String(course.section ?? "").trim();
      const courseCodeSection = compact(`${courseCode}${courseSection}`);

      return (
        (directId && courseId === directId)
        || lookupKeys.includes(compact(courseId))
        || lookupKeys.includes(compact(courseCrn))
        || lookupKeys.includes(compact(courseCode))
        || (courseCodeSection && lookupKeys.includes(courseCodeSection))
      );
    });

    if (found?.id && !used.has(found.id)) {
      used.add(found.id);
      matched.push(found);
    }
  });

  return matched;
}

function coerceAiScheduleCourse(candidate: unknown): Course | null {
  if (!candidate || typeof candidate !== "object") return null;
  const raw = candidate as Partial<Course> & Record<string, unknown>;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;

  const meetings = Array.isArray(raw.meetings)
    ? raw.meetings
        .map((meeting) => {
          if (!meeting || typeof meeting !== "object") return null;
          const value = meeting as Record<string, unknown>;
          const days = Array.isArray(value.days)
            ? value.days.map((day) => String(day ?? "").trim()).filter(Boolean) as Course["meetings"][number]["days"]
            : [];
          const start = String(value.start ?? "").trim();
          const end = String(value.end ?? "").trim();
          if (!days.length || !start || !end) return null;
          return {
            days,
            start,
            end,
            location: String(value.location ?? "").trim() || undefined,
            type: String(value.type ?? "").trim() || undefined,
          };
        })
        .filter(Boolean) as Course["meetings"]
    : [];

  return {
    id,
    universityId: String(raw.universityId ?? "").trim().toLowerCase(),
    universityName: String(raw.universityName ?? "").trim(),
    termId: String(raw.termId ?? "").trim(),
    crn: String(raw.crn ?? "").trim(),
    code: String(raw.code ?? "").trim(),
    department: String(raw.department ?? "").trim(),
    courseNumber: String(raw.courseNumber ?? "").trim(),
    title: String(raw.title ?? "").trim() || "Untitled course",
    instructor: String(raw.instructor ?? "").trim() || "TBA",
    professorId: String(raw.professorId ?? "").trim() || undefined,
    reviewDepartment: String(raw.reviewDepartment ?? "").trim() || undefined,
    campus: String(raw.campus ?? "").trim() || "Main Campus",
    section: String(raw.section ?? "").trim(),
    credits: Number(raw.credits ?? 0) || 0,
    capacity: {
      enrolled: Number((raw.capacity as Course["capacity"] | undefined)?.enrolled ?? 0) || 0,
      limit: Number((raw.capacity as Course["capacity"] | undefined)?.limit ?? 0) || 0,
    },
    attributes: Array.isArray(raw.attributes) ? raw.attributes.map((attribute) => String(attribute ?? "").trim()).filter(Boolean) : [],
    prerequisites: String(raw.prerequisites ?? "").trim() || undefined,
    restrictions: String(raw.restrictions ?? "").trim() || undefined,
    difficulty: Number(raw.difficulty ?? 0) || 0,
    workload: Number(raw.workload ?? 0) || 0,
    meetings,
    isSectionLinked: Boolean(raw.isSectionLinked),
    linkIdentifier: String(raw.linkIdentifier ?? "").trim() || null,
    linkedCourses: Array.isArray(raw.linkedCourses) ? raw.linkedCourses.map((value) => String(value ?? "").trim()).filter(Boolean) : [],
    scheduleType: String(raw.scheduleType ?? "").trim() || undefined,
    subjectCourse: String(raw.subjectCourse ?? "").trim() || undefined,
  };
}

function rankScheduleFallbackCandidates(candidates: Course[]) {
  return candidates
    .slice()
    .sort((left, right) =>
      getOpenSeats(right) - getOpenSeats(left)
      || right.meetings.length - left.meetings.length
      || left.code.localeCompare(right.code, undefined, { numeric: true })
      || left.section.localeCompare(right.section, undefined, { numeric: true }),
    );
}

function resolveScheduleFromSummary(summary: string, sourceCourses: Course[]) {
  if (!summary.trim()) return [];

  const matched: Course[] = [];
  const used = new Set<string>();
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  lines.forEach((line) => {
    const courseCodes = extractCourseCodes(line);
    const crns = extractCrns(line);
    if (!courseCodes.length && !crns.length) return;

    const candidates = sourceCourses.filter((course) => {
      if (used.has(course.id)) return false;
      const courseCode = compact(course.code);
      const courseCrn = String(course.crn ?? "").trim();
      return (
        (crns.length > 0 && crns.includes(courseCrn))
        || (courseCodes.length > 0 && courseCodes.some((code) => compact(code) === courseCode))
      );
    });

    const exactCrn = candidates.find((course) => crns.includes(String(course.crn ?? "").trim()));
    const picked = exactCrn ?? rankScheduleFallbackCandidates(candidates)[0] ?? null;
    if (!picked?.id) return;
    used.add(picked.id);
    matched.push(picked);
  });

  return matched;
}

const CS_SUBJECTS_BY_UNIVERSITY: Record<string, string[]> = {
  aub: ["CMPS"],
  lau: ["CSC"],
  bau: ["CMPS"],
  usek: ["CSC", "INF"],
  ndu: ["CSC"],
  usj: ["INCI", "INF", "ELFS", "IESAV"],
  lu: ["FT", "INFO", "CSC"],
  aust: ["CSI"],
  liu: ["CSCI"],
};

const ADVISOR_MAJOR_HINTS = [
  { patterns: ["business", "management", "business administration", "business studies", "osb", "bba", "olayan school of business"], subjects: ["BUS", "BUSA", "MGT", "MGMT", "MNGT", "ADM", "BMGT", "ACCT", "FINA", "MKTG"], keywords: ["business", "management", "administration", "olayan school of business"] },
  { patterns: ["accounting"], subjects: ["ACCT", "ACC"], keywords: ["accounting", "audit"] },
  { patterns: ["finance", "banking"], subjects: ["FIN", "FINA", "FNCE"], keywords: ["finance", "financial", "banking"] },
  { patterns: ["marketing"], subjects: ["MKT", "MRKT", "MKTG"], keywords: ["marketing", "brand"] },
  { patterns: ["economics"], subjects: ["ECON", "ECO"], keywords: ["economics", "microeconomics", "macroeconomics"] },
  { patterns: ["biology", "biological sciences"], subjects: ["BIOL", "BIO"], keywords: ["biology", "cell", "genetics"] },
  { patterns: ["chemistry"], subjects: ["CHEM", "CHM"], keywords: ["chemistry", "organic"] },
  { patterns: ["physics"], subjects: ["PHYS", "PHY"], keywords: ["physics", "mechanics"] },
  { patterns: ["mathematics", "math"], subjects: ["MATH", "MAT", "MTH"], keywords: ["mathematics", "calculus", "algebra"] },
  { patterns: ["computer science and engineering", "computer science engineering", "cse"], subjects: ["EECE", "CMPS", "CSC", "CSCI", "CENG", "EENG"], keywords: ["computer science and engineering", "software", "algorithms", "systems"] },
  { patterns: ["computer engineering", "computer engineer", "ceng", "coe"], subjects: ["COE", "EECE", "COMP", "COME", "CENG", "EENG"], keywords: ["computer engineering", "computer architecture", "embedded"] },
  { patterns: ["computer and communications engineering", "computer and communication engineering", "communication engineering", "communications engineering", "cce", "teng"], subjects: ["TENG", "CENG", "EENG", "ENGG"], keywords: ["communication engineering", "telecommunication", "communications systems", "signals", "networks"] },
  { patterns: ["electrical and computer engineering", "electrical computer engineering", "ece", "eece"], subjects: ["EECE", "ELEC", "ELE", "EENG", "POWE"], keywords: ["electrical and computer engineering", "electronics", "power", "circuits"] },
  { patterns: ["engineering", "engineer"], subjects: ["ENGR", "MECH", "MECE", "CIVE", "CVLE", "EECE", "ELEC", "INME", "CHE", "CHEN", "ENGG", "EENG", "CENG"], keywords: ["engineering", "mechanics", "circuits"] },
  { patterns: ["architecture"], subjects: ["ARCH", "ARCT"], keywords: ["architecture", "studio", "urban"] },
  { patterns: ["nursing"], subjects: ["NURS", "NUR"], keywords: ["nursing", "clinical"] },
  { patterns: ["pharmacy", "pharmaceutical"], subjects: ["PHAR", "PHRM", "PHA"], keywords: ["pharmacy", "pharmacology"] },
  { patterns: ["psychology"], subjects: ["PSYC", "PSY"], keywords: ["psychology", "behavior"] },
  { patterns: ["education", "teaching"], subjects: ["EDUC", "EDU"], keywords: ["education", "teaching"] },
  { patterns: ["graphic design", "design"], subjects: ["GRDS", "GDES", "ART", "DES", "DSGN"], keywords: ["graphic", "design", "visual"] },
  { patterns: ["law", "legal studies"], subjects: ["LAW", "LEGL"], keywords: ["law", "legal"] },
];

const UNIVERSITY_SPECIFIC_MAJOR_HINTS: Record<string, { token: string; subjects: string[]; keywords: string[] }[]> = {
  aub: [
    { token: "cce", subjects: ["EECE"], keywords: ["computer and communications engineering", "communications systems", "computer systems"] },
    { token: "ece", subjects: ["EECE"], keywords: ["electrical and computer engineering", "electronics", "circuits"] },
    { token: "eece", subjects: ["EECE"], keywords: ["electrical and computer engineering", "electronics", "circuits"] },
    { token: "osb", subjects: ["BUSS", "ACCT", "FINA", "MKTG", "MNGT", "INFO"], keywords: ["olayan school of business", "business administration"] },
  ],
  aust: [
    { token: "cce", subjects: ["CCE"], keywords: ["computer and communications engineering", "communications", "embedded", "circuits"] },
  ],
  liu: [
    { token: "cce", subjects: ["TENG", "CENG", "EENG", "ENGG"], keywords: ["communication engineering", "telecommunication", "communications systems"] },
    { token: "teng", subjects: ["TENG", "CENG", "EENG", "ENGG"], keywords: ["communication engineering", "telecommunication", "communications systems"] },
    { token: "ceng", subjects: ["CENG", "EENG", "CSCI"], keywords: ["computer engineering", "embedded", "circuits"] },
  ],
};

function findUniversitySpecificAdvisorMajorHint(normalized: string, universityId: string) {
  const hints = UNIVERSITY_SPECIFIC_MAJOR_HINTS[universityId] ?? [];
  return hints.find((hint) => normalized.split(/\s+/).includes(hint.token)) ?? null;
}

const UNIVERSITY_WELCOME_PROFILES: Record<string, UniversityWelcomeProfile> = {
  aub: {
    lead: "I am in AUB mode.",
    language: "I can speak in CMPS, EECE, OSB, FAS, MSFEA, CRN, and General Education bucket language like Human Values, Cultures and Histories, Societies and Individuals, and Quantitative Reasoning.",
    strengths: "That means I can help with live Banner-style sections, linked labs/recitations, GER buckets, and catalog-year planning in the way AUB students usually talk about schedules.",
    prompts: [
      'Find Human Values options at AUB.',
      'Build a semester 3 CMPS schedule.',
      'Show me OSB-friendly no-Friday options.',
      'Explain the prerequisite chain for CMPS 215.',
    ],
  },
  lau: {
    lead: "I am in LAU mode.",
    language: "I can work in CSC, MTH, ENG, COM, and LAS language, including Liberal Arts and Sciences requirements, Change Makers, and the Beirut/Byblos campus rhythm.",
    strengths: "I will think in LAU recommended-study-plan style, keep linked lectures and labs together, and talk about courses the way LAU catalogs and students usually frame them.",
    prompts: [
      'Build a CSC semester with no late Thursdays.',
      'Show me LAS Change Makers options.',
      'Find open CSC sections in LAU style.',
      'Compare two CSC professors for me.',
    ],
  },
  usek: {
    lead: "I am in USEK mode.",
    language: "I can speak in CSC and INF language, Faculty of Arts and Sciences wording, and USEK General Education categories like Artistic Discovery, Intercultural and Religious Fluency, Lebanese History and Legacy, and Effective Thinking and Quantitative Reasoning.",
    strengths: "I will frame advice around USEK's core courses plus General Education balance instead of using a generic planner voice.",
    prompts: [
      'Build a first CSC semester at USEK.',
      'Find courses for Lebanese History and Legacy.',
      'Show me CSC prerequisites at USEK.',
      'Give me a balanced USEK GE + CSC plan.',
    ],
  },
  bau: {
    lead: "I am in BAU mode.",
    language: "I can work in Faculty of Science, Engineering, and Business language, think in University Mandatory Courses and University Electives, and keep Beirut, Debbieh, and Tripoli campus context in mind.",
    strengths: "I will talk more like a BAU degree-requirements page: program requirements first, then current section availability and campus-specific details.",
    prompts: [
      'Build a BAU CMPS schedule in Beirut campus.',
      'Find BAU university elective options.',
      'Show me open BAU science sections.',
      'Compare BAU instructors for this course.',
    ],
  },
  ndu: {
    lead: "I am in NDU mode.",
    language: "I can speak in FNAS, business, and LAC language, and I understand that NDU planning often lives inside catalog-year faculty tables rather than one shared generic sequence.",
    strengths: "I will keep the NDU catalog tone in mind, including Computer Science pathways, Liberal Arts Core thinking, and the more faculty-driven style of planning.",
    prompts: [
      'Build a semester for an NDU CSC student.',
      'Show me LAC-related options at NDU.',
      'Find prerequisite chains in the NDU catalog.',
      'Give me a no-conflict NDU schedule draft.',
    ],
  },
  aust: {
    lead: "I am in AUST mode.",
    language: "I can speak in CCE, CSI, ICT, MTE, and BME language, and I understand the AUST engineering/faculty style around flexible scheduling, internships, and career-oriented sequencing.",
    strengths: "I will phrase advice more like AUST program flow and faculty language instead of a generic US-style registrar voice.",
    prompts: [
      'Build a CSI schedule at AUST.',
      'Show me CCE-friendly options.',
      'Find AUST sections with open seats.',
      'Compare AUST engineering sections for me.',
    ],
  },
  usj: {
    lead: "Bonjour, je suis en mode USJ.",
    language: "I can work in USJ catalogue language like licence, credits, UE, INCI, ESIB, informatique, and the USJ General Education axes such as citizenship education, ethics, scientific culture, and interreligious dialogue.",
    strengths: "So the assistant can sound more natural for USJ planning instead of forcing everything into AUB-style attribute language.",
    prompts: [
      'Build a licence informatique semester.',
      'Explain the UE or prerequisite chain for this course.',
      'Find USJ electives that fit my load.',
      'Compare sections in USJ catalogue language.',
    ],
  },
  lu: {
    lead: "I am in Lebanese University mode.",
    language: "I think in faculty and branch terms first: Faculty of Technology, Faculty of Science, Faculty of Engineering, branch-specific curricula, and Computer and Communication Networks language rather than AUB-style attribute buckets.",
    strengths: "That means I will talk more like an LU faculty guide, especially for branch-based planning and faculty-specific curriculum questions.",
    prompts: [
      'Build an LU Faculty of Technology schedule.',
      'Show me branch-specific LU course options.',
      'Explain this LU prerequisite path.',
      'Find an LU schedule without Friday labs.',
    ],
  },
  liu: {
    lead: "I am in LIU mode.",
    language: "I can speak in School of Arts and Sciences and School of Engineering language, including CSCI, CENG, EENG, TENG, and school-specific core or General Education requirements.",
    strengths: "I will treat LIU requests through the university's school/program wording and use the published plans of study when they exist.",
    prompts: [
      'Build a LIU CSCI semester.',
      'Show me the LIU CENG or TENG plan language.',
      'Explain prerequisites for this LIU course.',
      'Find open LIU sections in catalog order.',
    ],
  },
};

function getUniversityWelcomeProfile(universityId: string): UniversityWelcomeProfile {
  return UNIVERSITY_WELCOME_PROFILES[universityId] ?? {
    lead: "I am in planner mode for this university.",
    language: "I will use the selected university's live sections, prerequisites, attributes, reviews, and schedule context.",
    strengths: "Ask me as if I were a university-specific schedule advisor, not a generic chatbot.",
    prompts: [
      "Build me a schedule.",
      "Explain this prerequisite chain.",
      "Find open sections for a course.",
      "Compare two course options.",
    ],
  };
}

function isAdvisorQuestion(text: string) {
  const normalized = normalizeSearch(text);
  return /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|1st|2nd|3rd|4th|5th|6th|7th|8th|freshman|new student|semester 1|advisor|academic plan|curriculum|study plan|major|degree|graduat|requirement|track|catalog year|cohort|what should i take)\b/.test(normalized)
    || /\b(?:semester|sem|term)\s+\d{1,2}\b/.test(normalized)
    || /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:semester|sem|term)\b/.test(normalized)
    || /\b(attributes?|general education|gen ed|human values|cultures?|histories|societies|quantitative reasoning|community engaged)\b/.test(normalized);
}

function getOpenSeats(course: Course) {
  return Math.max(0, Number(course.capacity?.limit ?? 0) - Number(course.capacity?.enrolled ?? 0));
}

function courseToAiPayload(course: Course) {
  return {
    id: course.id,
    universityId: course.universityId,
    termId: course.termId,
    code: course.code,
    department: course.department,
    courseNumber: course.courseNumber,
    title: course.title,
    crn: course.crn,
    section: course.section,
    instructor: course.instructor,
    professorId: course.professorId,
    reviewDepartment: course.reviewDepartment,
    campus: course.campus,
    credits: course.credits,
    attributes: course.attributes,
    prerequisites: course.prerequisites,
    restrictions: course.restrictions,
    capacity: course.capacity,
    openSeats: getOpenSeats(course),
    meetings: course.meetings,
    scheduleType: course.scheduleType,
    isSectionLinked: course.isSectionLinked,
    linkIdentifier: course.linkIdentifier,
    linkedCourses: course.linkedCourses,
    subjectCourse: course.subjectCourse,
  };
}

function findRelevantCourses(message: string, courses: Course[]) {
  const normalized = normalizeSearch(message);
  const tokens = normalized.split(/\s+/).filter((token) => token.length >= 2);
  const compactMessage = compact(message);
  const exactCodes = extractCourseCodes(message);

  if (!tokens.length && !exactCodes.length) {
    return courses.slice(0, 30);
  }

  return courses
    .map((course) => {
      const codeCompact = compact(course.code);
      const haystack = normalizeSearch(
        `${course.code} ${course.title} ${course.instructor} ${course.crn} ${course.campus} ${course.section} ${course.prerequisites ?? ""} ${course.restrictions ?? ""} ${course.attributes?.join(" ") ?? ""} ${course.scheduleType ?? ""}`,
      );
      let score = 0;
      if (exactCodes.some((code) => compact(code) === codeCompact)) score += 140;
      if (exactCodes.some((code) => codeCompact.startsWith(compact(code)))) score += 45;
      if (compactMessage.includes(codeCompact)) score += 100;
      tokens.forEach((token) => {
        if (haystack.includes(token)) score += token.length > 3 ? 12 : 5;
      });
      if (getOpenSeats(course) > 0) score += 2;
      return { course, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || getOpenSeats(right.course) - getOpenSeats(left.course))
    .slice(0, 80)
    .map((entry) => entry.course);
}

function findAdvisorRelevantCourses(message: string, courses: Course[], universityId: string) {
  const base = findRelevantCourses(message, courses);
  if (!isAdvisorQuestion(message)) return base;

  const normalized = normalizeSearch(message);
  const isComputerScience = /\b(computer science|comp sci|compsci|cs|cmps|csc|csci|informatique|programming|software)\b/.test(normalized);
  const subjects = CS_SUBJECTS_BY_UNIVERSITY[universityId] ?? [];
  const universitySpecificHint = findUniversitySpecificAdvisorMajorHint(normalized, universityId);
  const matchedMajor = ADVISOR_MAJOR_HINTS.find((hint) =>
    hint.patterns.some((pattern) => normalized.includes(pattern)),
  );
  const genericMajorTokens = normalized
    .match(/\b(?:for|as)\s+(?:a|an)?\s*([a-z][a-z0-9\s]{2,42}?)\s+(?:student|major|freshman|first year)\b/)?.[1]
    ?.split(/\s+/)
    .filter((token) => token.length >= 4 && !["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "semester", "student", "major"].includes(token)) ?? [];
  const enriched = courses
    .map((course) => {
      const subject = course.department.toUpperCase();
      const haystack = normalizeSearch(
        `${course.code} ${course.title} ${course.department} ${course.prerequisites ?? ""} ${course.restrictions ?? ""} ${course.attributes?.join(" ") ?? ""} ${course.scheduleType ?? ""}`,
      );
      let score = 0;
      if (isComputerScience && subjects.includes(subject)) score += 90;
      if (isComputerScience && /\b(computer|programming|software|object oriented|data structures|algorithm|informatics|informatique)\b/.test(haystack)) score += 45;
      if (universitySpecificHint?.subjects.includes(subject)) score += 130;
      universitySpecificHint?.keywords.forEach((keyword) => {
        if (haystack.includes(keyword)) score += 44;
      });
      if (matchedMajor?.subjects.includes(subject)) score += 90;
      matchedMajor?.keywords.forEach((keyword) => {
        if (haystack.includes(keyword)) score += 36;
      });
      genericMajorTokens.forEach((token) => {
        if (haystack.includes(token)) score += 30;
      });
      if (/\b(math|calculus|discrete|algebra|statistics|quantitative)\b/.test(haystack)) score += 35;
      if (/\b(english|writing|communication|arabic|language)\b/.test(haystack)) score += 25;
      if (/\b(human|ethic|culture|history|societ|civilization|general education|humanities|social)\b/.test(haystack)) score += 18;
      if (getOpenSeats(course) > 0) score += 3;
      return { course, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || left.course.department.localeCompare(right.course.department)
      || left.course.courseNumber.localeCompare(right.course.courseNumber, undefined, { numeric: true }),
    )
    .map((entry) => entry.course);

  const seen = new Set<string>();
  return [...base, ...enriched].filter((course) => {
    const key = course.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 240);
}

function buildCatalogStats(courses: Course[], universityName: string, semesterLabel: string) {
  const courseCodes = new Set(courses.map((course) => course.code));
  const professors = new Set(
    courses
      .map((course) => course.instructor)
      .filter((name) => name && name.toLowerCase() !== "tba"),
  );
  const campuses = [...new Set(courses.map((course) => course.campus).filter(Boolean))].slice(0, 12);
  const openSections = courses.filter((course) => getOpenSeats(course) > 0).length;
  const attributeCounts = new Map<string, number>();

  courses.forEach((course) => {
    const seenOnCourse = new Set<string>();
    (course.attributes ?? []).forEach((attribute) => {
      const label = String(attribute ?? "").replace(/\s+/g, " ").trim();
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!key || seenOnCourse.has(key)) return;
      seenOnCourse.add(key);
      attributeCounts.set(label, (attributeCounts.get(label) ?? 0) + 1);
    });
  });
  const attributes = [...attributeCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 30)
    .map(([label, count]) => ({ label, count }));

  return {
    universityName,
    semesterLabel,
    totalSections: courses.length,
    uniqueCourses: courseCodes.size,
    professorCount: professors.size,
    openSections,
    campuses,
    attributeCount: attributeCounts.size,
    attributes,
  };
}

function formatSnapshotFreshness(updatedAt?: string | null) {
  if (!updatedAt) {
    return "I am using the latest locally cached published catalog snapshot available on this device.";
  }

  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return `Snapshot freshness: ${updatedAt}.`;
  }

  return `Snapshot freshness: synced ${parsed.toLocaleString()}.`;
}

async function postAiSchedule(payload: unknown) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(`${API}/api/ai-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const raw = await response.text();
      let data: any = null;

      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`The AI server returned an unreadable response (${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(data?.error || data?.message || `The AI server returned HTTP ${response.status}.`);
      }

      return data;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        lastError = new Error("The AI request took too long, so I stopped waiting. Please try again.");
      } else {
        lastError = error instanceof Error ? error : new Error("Something went wrong while contacting the AI.");
      }

      const retryable = attempt < 2 && /unreadable response|HTTP 5\d{2}|server error|temporarily unavailable|took too long/i.test(lastError.message);
      if (!retryable) {
        throw lastError;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 350));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Something went wrong while contacting the AI.");
}

function buildWelcomeMessage(
  universityId: string,
  universityName: string,
  semesterLabel: string,
  catalogUpdatedAt?: string | null,
) {
  const profile = getUniversityWelcomeProfile(universityId);
  const helpfulActions = [
    "Build a semester schedule for a major, cohort year, campus, or time preference.",
    "Explain prerequisites, restrictions, linked labs/recitations, and what a course unlocks next.",
    "Explain what a course is about, whether it looks beginner-friendly, math-heavy, writing-heavy, or how it is usually offered.",
    "Find open-seat sections, attribute buckets, requirement-friendly electives, and CRNs.",
    "Tell you which campus, room/building, time pattern, and instructor are currently published for a course when the fetched sections expose them.",
    "Tell you clearly when a question depends on a syllabus detail that the published catalog does not expose yet.",
    "Compare sections, instructors, workloads, reviews, and conflict tradeoffs.",
    "Create no-Friday, morning-only, low-conflict, or graduation-safer schedule drafts.",
    "Help with reviews, empty classrooms, GPA/grade tools, and planner features on this site.",
  ];
  return `${profile.lead} I am your academic planning assistant for ${universityName}${semesterLabel ? ` (${semesterLabel})` : ""}.

${profile.language}

${profile.strengths}

Live reliability:
- ${formatSnapshotFreshness(catalogUpdatedAt)}
- I treat the current catalog snapshot as the source of truth for seats, sections, prerequisites, linked components, attribute tags, and any fetched campus / room / instructor data.
- For exact major/year graduation rules, I only trust source-backed curriculum mappings; otherwise I will clearly label the answer as a best-effort live-catalog plan instead of pretending it is an audit.

Helpful things you can ask:
${helpfulActions.map((action) => `- ${action}`).join("\n")}

Good prompts for this university:
${profile.prompts.map((prompt) => `- "${prompt}"`).join("\n")}`;
}

export function AIScheduler({
  allCourses,
  scheduledCourses,
  favoriteCourses,
  selectedCourse,
  selectedCrns,
  semesterLabel,
  termId,
  catalogUpdatedAt,
  onApplySchedule,
  activeSlot,
  universityId,
  universityName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: buildWelcomeMessage(universityId, universityName, semesterLabel, catalogUpdatedAt),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposedSchedule, setProposedSchedule] = useState<Course[] | null>(
    null,
  );
  const [proposedScheduleIds, setProposedScheduleIds] = useState<string[]>([]);
  const [proposedScheduleFallbackCourses, setProposedScheduleFallbackCourses] = useState<Course[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const contextKeyRef = useRef(`${universityId}:${termId}`);
  const hydratedProposedSchedule = useMemo(() => {
    if (proposedSchedule?.length) return proposedSchedule;
    if (!proposedScheduleIds.length && !proposedScheduleFallbackCourses.length) return [];
    return resolveScheduledCourses(proposedScheduleIds, allCourses, proposedScheduleFallbackCourses);
  }, [allCourses, proposedSchedule, proposedScheduleFallbackCourses, proposedScheduleIds]);
  const hasProposedSchedule = Boolean(
    hydratedProposedSchedule.length
    || proposedScheduleIds.length
    || proposedScheduleFallbackCourses.length,
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const nextContextKey = `${universityId}:${termId}`;
    if (loading) return;
    const nextWelcomeMessage = buildWelcomeMessage(universityId, universityName, semesterLabel, catalogUpdatedAt);
    const previousContextKey = contextKeyRef.current;
    contextKeyRef.current = nextContextKey;

    if (previousContextKey !== nextContextKey) {
      setMessages([{ role: "assistant", content: nextWelcomeMessage }]);
      setProposedSchedule(null);
      setProposedScheduleIds([]);
      setProposedScheduleFallbackCourses([]);
      return;
    }

    setMessages((currentMessages) => {
      if (
        currentMessages.length === 1
        && currentMessages[0]?.role === "assistant"
        && currentMessages[0]?.content !== nextWelcomeMessage
      ) {
        return [{ role: "assistant", content: nextWelcomeMessage }];
      }

      return currentMessages;
    });
  }, [catalogUpdatedAt, loading, semesterLabel, termId, universityId, universityName]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    fetch(`${API}/api/ai-status`)
      .then((res) => res.json())
      .then((status: AiStatus) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setAiStatus({
            remoteEnabled: false,
            provider: "offline",
            model: "server unavailable",
            message: "The backend server is not reachable yet.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const quickPrompts = getUniversityWelcomeProfile(universityId).prompts;

  const sendMessage = async (draft?: string) => {
    const text = (draft ?? input).trim();
    if (!text || loading) return;
    const shouldRestoreDraftOnFailure = draft === undefined;
    const requestId = requestIdRef.current + 1;
    const requestContextKey = contextKeyRef.current;
    requestIdRef.current = requestId;

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const courseCodes = extractCourseCodes(text);
      const courseCodeKeys = courseCodes.map(compact);
      const advisorQuestion = isAdvisorQuestion(text);
      const relevantCourses = advisorQuestion
        ? findAdvisorRelevantCourses(text, allCourses, universityId)
        : findRelevantCourses(text, allCourses);
      const scopedRelevantCourses = relevantCourses.slice(0, advisorQuestion ? 80 : 30);
      const sections =
        courseCodes.length > 0
          ? allCourses.filter((c) =>
              courseCodeKeys.some((code) => compact(c.code) === code || compact(c.code).startsWith(code)),
            ).slice(0, 80)
          : scopedRelevantCourses;

      const aiPayload = {
        message: text,
        sections: sections.map(courseToAiPayload),
        relevantCourses: scopedRelevantCourses.map(courseToAiPayload),
        scheduledCourses: scheduledCourses.map(courseToAiPayload),
        favoriteCourses: favoriteCourses.slice(0, 40).map(courseToAiPayload),
        selectedCourse: selectedCourse ? courseToAiPayload(selectedCourse) : null,
        selectedCrns,
        catalogStats: {
          ...buildCatalogStats(allCourses, universityName, semesterLabel),
          updatedAt: catalogUpdatedAt ?? null,
        },
        activeSlot,
        semesterLabel,
        termId,
        universityId,
      };

      let data = await postAiSchedule(aiPayload);

      const contextStillCurrent = contextKeyRef.current === requestContextKey;
      const requestStillCurrent = requestIdRef.current === requestId;

      if (!contextStillCurrent || !requestStillCurrent) {
        return;
      }

      if (data.aiStatus) setAiStatus(data.aiStatus);

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `I could not complete that request yet: ${data.error}` },
        ]);
        return;
      }

      const hasSchedulePayload = Array.isArray(data.schedule) && data.schedule.length > 0;
      const hasResolvedScheduleCourses = Array.isArray(data.scheduleCourses) && data.scheduleCourses.length > 0;
      const expectsScheduleProposal = data.mode === "schedule" || hasSchedulePayload || hasResolvedScheduleCourses;

      if (contextStillCurrent && expectsScheduleProposal) {
        const picked = resolveScheduledCourses(
          Array.isArray(data.schedule) ? data.schedule : [],
          allCourses,
          Array.isArray(data.scheduleCourses) ? data.scheduleCourses : [],
        );
        const fallbackPicked = Array.isArray(data.scheduleCourses)
          ? data.scheduleCourses
              .map((candidate) => coerceAiScheduleCourse(candidate))
              .filter(Boolean) as Course[]
          : [];
        const summaryPicked = typeof data.summary === "string"
          ? resolveScheduleFromSummary(data.summary, allCourses)
          : [];
        const nextProposal = picked.length
          ? picked
          : fallbackPicked.length
            ? fallbackPicked
            : summaryPicked;
        const nextScheduleIds = Array.isArray(data.schedule)
          ? data.schedule.map((entry: unknown) => String(entry ?? "").trim()).filter(Boolean)
          : [];
        setProposedSchedule(nextProposal.length ? nextProposal : null);
        setProposedScheduleIds(nextScheduleIds);
        setProposedScheduleFallbackCourses(fallbackPicked);
      } else {
        setProposedSchedule(null);
        setProposedScheduleIds([]);
        setProposedScheduleFallbackCourses([]);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            data.summary ||
            "I did not receive a full answer from the AI service, but the local assistant is still connected to your current planner context. Try asking again with a course code, CRN, professor, prerequisite, or schedule constraint.",
        },
      ]);
    } catch (err) {
      const contextStillCurrent = contextKeyRef.current === requestContextKey;
      const requestStillCurrent = requestIdRef.current === requestId;
      if (!contextStillCurrent || !requestStillCurrent) {
        return;
      }
      const message = err instanceof Error ? err.message : "Something went wrong while contacting the AI.";
      if (shouldRestoreDraftOnFailure) {
        setInput((current) => current || text);
      }
      setAiStatus({
        remoteEnabled: false,
        provider: "offline",
        model: "server unavailable",
        message: "The local AI service is temporarily unavailable. Please try again while I inspect the backend.",
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `${message}\n\nThe local AI service hit a server error. Please try again. If it keeps happening, I need to inspect the backend rather than asking you to restart everything.`,
        },
      ]);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const handleApply = () => {
    const nextCourses = hydratedProposedSchedule.length
      ? hydratedProposedSchedule
      : resolveScheduledCourses(proposedScheduleIds, allCourses, proposedScheduleFallbackCourses);
    if (!nextCourses.length) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I have the schedule idea, but I could not fully remap those sections back into the current planner view yet. Try the same request again after the term finishes syncing.",
        },
      ]);
      return;
    }
    onApplySchedule(nextCourses);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Done! Applied ${nextCourses.length} courses to Schedule ${activeSlot}. You can see them on the grid now.`,
      },
    ]);
    setProposedSchedule(null);
    setProposedScheduleIds([]);
    setProposedScheduleFallbackCourses([]);
  };

  return (
    <>
      <style>{css}</style>

      <button className="ai-fab" onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M8 12h8M12 8v8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        AI Assistant
      </button>

      {open && (
        <div className="ai-panel">
          <div className="ai-panel__header">
            <div className="ai-panel__identity">
              <div className="ai-panel__title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle cx="12" cy="12" r="3" fill="currentColor" />
                </svg>
                AI Course Assistant
              </div>
              {aiStatus && (
                <div
                  className={`ai-panel__status ${
                    aiStatus.remoteEnabled ? "ai-panel__status--live" : "ai-panel__status--local"
                  }`}
                  title={aiStatus.message}
                >
                  {aiStatus.remoteEnabled ? "Groq live" : aiStatus.provider === "offline" ? "Server offline" : "Local mode"}
                </div>
              )}
            </div>
            <button
              className="ai-panel__close"
              onClick={() => setOpen(false)}
              aria-label="Close AI assistant"
            >
              ✕
            </button>
          </div>

          <div className="ai-panel__shortcuts">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="ai-panel__shortcut"
                onClick={() => void sendMessage(prompt)}
                disabled={loading}
              >
                {prompt}
              </button>
            ))}
          </div>

          {hasProposedSchedule && (
            <div className="ai-panel__actionbar">
              <div className="ai-panel__actioncopy">
                <div className="ai-panel__actiontitle">Schedule ready</div>
                <div className="ai-panel__actionmeta">
                  {(hydratedProposedSchedule.length || proposedScheduleIds.length)} course{(hydratedProposedSchedule.length || proposedScheduleIds.length) === 1 ? "" : "s"} ready for Schedule {activeSlot}
                </div>
              </div>
              <button className="ai-panel__actionbutton" onClick={handleApply}>
                Add to Schedule {activeSlot}
              </button>
            </div>
          )}

          <div className="ai-panel__messages">
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg--${m.role}`}>
                <div className="ai-msg__bubble">{m.content}</div>
              </div>
            ))}

            {hasProposedSchedule && (
              <div className="ai-proposal">
                <div className="ai-proposal__title">Proposed Schedule</div>
                {hydratedProposedSchedule.map((c) => (
                  <div key={c.id} className="ai-proposal__course">
                    <div className="ai-proposal__code">
                      {c.code} — {c.section}
                    </div>
                    <div className="ai-proposal__meta">{c.title}</div>
                    <div className="ai-proposal__meta">
                      {c.instructor} ·{" "}
                      {c.meetings
                        .map(
                          (m) =>
                            `${m.days.map(dayLabel).join("/")} ${formatTime(m.start)}–${formatTime(m.end)}`,
                        )
                        .join(" · ")}
                    </div>
                  </div>
                ))}
                {!hydratedProposedSchedule.length && proposedScheduleIds.length > 0 && (
                  <div className="ai-proposal__meta">
                    I mapped {proposedScheduleIds.length} AI-picked section{proposedScheduleIds.length === 1 ? "" : "s"} and will add them as soon as the current planner view finishes matching them.
                  </div>
                )}
                <button className="ai-proposal__apply" onClick={handleApply}>
                  Add to Schedule {activeSlot}
                </button>
              </div>
            )}

            {loading && (
              <div className="ai-msg ai-msg--assistant">
                <div className="ai-msg__bubble ai-msg__bubble--loading">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="ai-panel__input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                void sendMessage();
              }}
              placeholder="Ask for a schedule, prerequisite chain, or first-semester plan"
              disabled={loading}
            />
            <button onClick={() => void sendMessage()} disabled={loading || !input.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const css = `
  .ai-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 22px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
    color: #fff;
    border: none;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 18px 40px rgba(9, 26, 45, 0.35);
    transition: transform .2s, box-shadow .2s;
    z-index: 1000;
  }
  .ai-fab:hover { transform: translateY(-2px); box-shadow: 0 24px 48px rgba(9, 26, 45, 0.42); }

  .ai-panel {
    position: fixed;
    bottom: 94px;
    right: 24px;
    width: min(420px, calc(100vw - 32px));
    height: min(620px, calc(100vh - 128px));
    background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)), var(--panel);
    border: 1px solid var(--border);
    border-radius: 22px;
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(18px);
    box-shadow: 0 28px 80px rgba(5,11,18,0.45);
    z-index: 1000;
    overflow: hidden;
  }

  .ai-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, rgba(var(--brand-primary-rgb),0.12), rgba(255,255,255,0.02));
    flex-shrink: 0;
  }
  .ai-panel__identity {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .ai-panel__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }
  .ai-panel__status {
    width: fit-content;
    max-width: 100%;
    padding: 5px 9px;
    border: 1px solid rgba(var(--brand-primary-rgb),0.22);
    border-radius: 999px;
    color: var(--muted);
    background: rgba(var(--brand-primary-rgb),0.08);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .ai-panel__status--live {
    color: var(--brand-primary);
    border-color: rgba(var(--brand-primary-rgb),0.45);
    background: rgba(var(--brand-primary-rgb),0.14);
  }
  .ai-panel__status--local {
    color: var(--muted);
  }
  .ai-panel__close {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 13px;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    cursor: pointer;
    transition: color .15s, border-color .15s, background .15s;
  }
  .ai-panel__close:hover { color: var(--text); border-color: rgba(88,208,255,0.35); background: rgba(88,208,255,0.08); }

  .ai-panel__shortcuts {
    display: flex;
    gap: 8px;
    padding: 12px 16px 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .ai-panel__shortcut {
    flex: 0 0 auto;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(88,208,255,0.16);
    background: rgba(255,255,255,0.03);
    color: var(--text);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.3;
    cursor: pointer;
    transition: transform .15s, border-color .15s, background .15s;
  }
  .ai-panel__shortcut:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(var(--brand-primary-rgb),0.4);
    background: rgba(var(--brand-primary-rgb),0.08);
  }
  .ai-panel__shortcut:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ai-panel__actionbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px 0;
    flex-shrink: 0;
  }
  .ai-panel__actioncopy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .ai-panel__actiontitle {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--brand-secondary);
  }
  .ai-panel__actionmeta {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.35;
  }
  .ai-panel__actionbutton {
    flex: 0 0 auto;
    padding: 10px 14px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 12px 28px rgba(var(--brand-primary-rgb), 0.22);
  }
  .ai-panel__actionbutton:hover { filter: brightness(1.05); }

  .ai-panel__messages {
    flex: 1;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .ai-msg { display: flex; }
  .ai-msg--user { justify-content: flex-end; }
  .ai-msg--assistant { justify-content: flex-start; }

  .ai-msg__bubble {
    max-width: 86%;
    padding: 12px 14px;
    border-radius: 16px;
    font-size: 13px;
    line-height: 1.65;
    white-space: pre-wrap;
  }
  .ai-msg--user .ai-msg__bubble {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
    color: #fff;
    border-bottom-right-radius: 6px;
  }
  .ai-msg--assistant .ai-msg__bubble {
    background: rgba(255,255,255,0.04);
    color: var(--text);
    border: 1px solid var(--border);
    border-bottom-left-radius: 6px;
  }

  .ai-msg__bubble--loading {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 14px 18px;
  }
  .ai-msg__bubble--loading span {
    width: 6px;
    height: 6px;
    background: var(--muted);
    border-radius: 50%;
    animation: aiDot 1.2s ease-in-out infinite;
  }
  .ai-msg__bubble--loading span:nth-child(2) { animation-delay: 0.2s; }
  .ai-msg__bubble--loading span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes aiDot {
    0%,80%,100% { transform: scale(1); opacity: .4; }
    40% { transform: scale(1.3); opacity: 1; }
  }

  .ai-proposal {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ai-proposal__title {
    font-size: 11px;
    font-weight: 700;
    color: var(--brand-secondary);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
  .ai-proposal__course {
    padding: 10px 12px;
    background: rgba(6,11,18,0.55);
    border-radius: 14px;
    border-left: 3px solid var(--brand-primary);
  }
  .ai-proposal__code { font-size: 12px; font-weight: 600; color: var(--text); }
  .ai-proposal__meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .ai-proposal__apply {
    margin-top: 4px;
    width: 100%;
    padding: 11px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background .15s;
  }
  .ai-proposal__apply:hover { filter: brightness(1.05); }

  .ai-panel__input {
    display: flex;
    gap: 8px;
    padding: 14px 16px 16px;
    border-top: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
    flex-shrink: 0;
  }
  .ai-panel__input input {
    flex: 1;
    padding: 12px 14px;
    background: rgba(6,11,18,0.55);
    border: 1px solid var(--border);
    border-radius: 14px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    transition: border-color .2s;
  }
  .ai-panel__input input:focus { border-color: rgba(88,208,255,0.55); }
  .ai-panel__input input::placeholder { color: var(--muted); }
  .ai-panel__input button {
    width: 44px;
    height: 44px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
    border: none;
    border-radius: 14px;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background .15s;
  }
  .ai-panel__input button:hover:not(:disabled) { filter: brightness(1.05); }
  .ai-panel__input button:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (max-width: 700px) {
    .ai-panel {
      right: 16px;
      bottom: 84px;
      width: calc(100vw - 32px);
      height: min(70vh, 620px);
    }
    .ai-fab {
      right: 12px;
      bottom: 16px;
    }
  }

  @media (max-width: 600px) {
    .ai-fab {
      left: 8px;
      right: 8px;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
      justify-content: center;
      padding: 14px 16px;
      border-radius: 18px;
    }

    .ai-panel {
      left: 8px;
      right: 8px;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 68px);
      width: auto;
      height: min(78vh, 680px);
      border-radius: 20px;
    }

    .ai-panel__header {
      padding: 16px 16px 14px;
    }

    .ai-panel__shortcuts {
      padding: 10px 12px 0;
      gap: 6px;
    }

    .ai-panel__shortcut {
      min-height: 36px;
      padding: 0 12px;
      font-size: 10px;
    }

    .ai-panel__actionbar {
      flex-direction: column;
      align-items: stretch;
      padding: 10px 12px 0;
    }

    .ai-panel__actionbutton {
      width: 100%;
    }

    .ai-panel__messages {
      padding: 12px;
      gap: 10px;
    }

    .ai-msg__bubble {
      max-width: 92%;
      font-size: 12px;
    }

    .ai-panel__input {
      padding: 12px;
    }

    .ai-panel__input input {
      min-width: 0;
    }
  }

  @media (max-height: 760px) {
    .ai-fab {
      bottom: 12px;
      right: 12px;
    }
  }
`;
