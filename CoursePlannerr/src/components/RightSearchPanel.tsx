import { memo, useDeferredValue, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Course, Day } from "../types";
import { API_ROOT as API } from "../config/runtime.ts";
import { supabase } from "../supabaseClient.ts";
import { mapApiCoursesToCourses } from "../utils/courseApi.ts";
import { timeToMinutes } from "../utils/schedule.ts";
import type {
  BlockedTime,
  GeneratedSchedule,
  ScheduleQualityMetrics,
} from "../utils/smartSchedule.ts";

type SlotSummary = {
  slot: number;
  courseCount: number;
  credits: number;
  dayCount: number;
  earliestStart: string | null;
  latestEnd: string | null;
  conflictCount: number;
};

type Props = {
  allCourses: Course[];
  catalogLoading: boolean;
  compactMobileHome?: boolean;
  scheduled: Course[];
  favorites: Course[];
  slotSummaries: SlotSummary[];
  blockedTimes: BlockedTime[];
  lockedCourseIds: string[];
  generatedSchedules: GeneratedSchedule[];
  scheduleMetrics: ScheduleQualityMetrics;
  onSelectCourse: (course: Course) => void;
  onToggleSchedule: (course: Course) => void;
  onHoverCourse: (course: Course | null) => void;
  onPreviewCourse?: (course: Course | null) => void;
  averageDifficulty: number | null;
  totalCredits: number;
  activeSlot: number;
  onSlotChange: (slot: number) => void;
  universityId: string;
  termId: string;
  onCloneActiveSchedule: (slot: number) => void;
  onClearActiveSchedule: () => void;
  onAddBlockedTime: (block: Omit<BlockedTime, "id">) => void;
  onRemoveBlockedTime: (blockId: string) => void;
  onToggleLockedCourse: (courseId: string) => void;
  onGenerateSchedules: (options?: { openSeatsOnly?: boolean; excludeFriday?: boolean }) => void;
  onApplyGeneratedSchedule: (option: GeneratedSchedule) => void;
  onRecoverCatalogCourses?: (courses: Course[], termId: string) => void;
};

type ViewModal = { course: Course } | null;
type ModalTab = "reviews" | "syllabus";
type SortMode = "course" | "match" | "earliest" | "latest" | "openSeats";
type TimePreset = "all" | "morning" | "afternoon" | "evening";
type SearchMode = "course" | "crn";
type AttributeOption = {
  key: string;
  label: string;
  count: number;
};

interface CourseRating {
  id: string;
  rating: number;
  difficulty: number;
  review: string;
  created_at: string;
}

interface Syllabus {
  id: string;
  course_code: string;
  file_url: string;
  file_name: string;
  uploaded_by: string;
  created_at: string;
}

type ParsedQuery = {
  generalTokens: string[];
  department: string | null;
  professor: string | null;
  crn: string | null;
  scheduleType: string | null;
  attribute: string | null;
  dayFilters: Day[];
  openOnly: boolean;
  linkedOnly: boolean;
};

type CatalogSearchIntent = {
  department: string;
  numberPrefix: string;
};

const naturalSort = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const SEARCH_RESULT_LIMIT = 80;

type CourseSearchRecord = {
  haystack: string;
  compactHaystack: string;
};

type SearchHistoryEntry = {
  value: string;
  count: number;
  lastUsedAt: string;
};

type SearchSuggestion = {
  label: string;
  value: string;
  kind: "course" | "professor" | "department" | "crn" | "attribute";
};

const SEARCH_HISTORY_STORAGE_PREFIX = "termer:search-history:";
const SEARCH_HISTORY_LIMIT = 24;

function formatTime(time: string) {
  const totalMinutes = timeToMinutes(time);
  if (totalMinutes === null) return "TBA";
  const safeHours = Math.floor(totalMinutes / 60);
  const safeMinutes = totalMinutes % 60;
  const normalized = safeHours % 12 || 12;
  return `${normalized}:${String(safeMinutes).padStart(2, "0")} ${safeHours >= 12 ? "PM" : "AM"}`;
}

function getOpenSeats(course: Course) {
  const limit = Number(course.capacity?.limit ?? 0);
  const enrolled = Number(course.capacity?.enrolled ?? 0);
  return Math.max(0, limit - enrolled);
}

function formatMeetingDays(days: Day[]) {
  const labels: Record<Day, string> = {
    M: "Mon",
    T: "Tue",
    W: "Wed",
    R: "Thu",
    F: "Fri",
    S: "Sat",
  };
  return days.map((day) => labels[day]).join("/");
}

function getMeetingSummary(course: Course) {
  if (!course.meetings.length) return "Schedule not posted yet";

  return course.meetings
    .slice(0, 2)
    .map((meeting) => `${formatMeetingDays(meeting.days)} ${formatTime(meeting.start)}-${formatTime(meeting.end)}`)
    .join(" • ");
}

function getPrimaryMeetingLocation(course: Course) {
  return course.meetings.find((meeting) => String(meeting.location ?? "").trim())?.location?.trim() || "";
}

function getSeatStatusSummary(course: Course) {
  const limit = Number(course.capacity?.limit ?? 0);
  if (limit <= 0) return "";
  const openSeats = getOpenSeats(course);
  return openSeats > 0 ? `${openSeats} open seats` : "No open seats";
}

function courseConflictsWithSchedule(course: Course, scheduled: Course[]) {
  return scheduled.some((scheduledCourse) => {
    if (scheduledCourse.id === course.id) return false;

    return course.meetings.some((meeting) =>
      scheduledCourse.meetings.some((scheduledMeeting) =>
        meeting.days.some((day) => scheduledMeeting.days.includes(day))
        && (timeToMinutes(meeting.start) ?? 0) < (timeToMinutes(scheduledMeeting.end) ?? 0)
        && (timeToMinutes(scheduledMeeting.start) ?? 0) < (timeToMinutes(meeting.end) ?? 0),
      ),
    );
  });
}

function parseDayFilters(value: string): Day[] {
  const map: Record<string, Day> = {
    m: "M",
    mon: "M",
    monday: "M",
    t: "T",
    tue: "T",
    tuesday: "T",
    w: "W",
    wed: "W",
    wednesday: "W",
    r: "R",
    th: "R",
    thu: "R",
    thursday: "R",
    f: "F",
    fri: "F",
    friday: "F",
    s: "S",
    sat: "S",
    saturday: "S",
  };

  return value
    .split(/[,\-/]/)
    .flatMap((part) => {
      const normalized = part.trim().toLowerCase();
      if (normalized in map) return [map[normalized]];
      return normalized.split("").flatMap((char) => (char in map ? [map[char]] : []));
    })
    .filter((day, index, array) => array.indexOf(day) === index);
}

function createEmptyParsedQuery(): ParsedQuery {
  return {
    generalTokens: [],
    department: null,
    professor: null,
    crn: null,
    scheduleType: null,
    attribute: null,
    dayFilters: [],
    openOnly: false,
    linkedOnly: false,
  };
}

function extractCrnSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/^crn\s*:?\s*/, "").replace(/\s+/g, "");
}

function looksLikeCrnSearch(value: string) {
  const normalized = extractCrnSearchValue(value);
  return normalized.length >= 5 && /^\d+$/.test(normalized);
}

function isDirectCrnQuery(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("crn:") || looksLikeCrnSearch(value);
}

function parseQuery(query: string, searchMode: SearchMode = "course"): ParsedQuery {
  const parsed = createEmptyParsedQuery();
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  tokens.forEach((token) => {
    if (token.startsWith("crn:")) {
      parsed.crn = extractCrnSearchValue(token);
      return;
    }
    if (searchMode === "crn" && !parsed.crn && /^\d+$/.test(token)) {
      parsed.crn = token;
      return;
    }
    if (token.startsWith("dept:")) {
      parsed.department = token.slice(5);
      return;
    }
    if (token.startsWith("prof:")) {
      parsed.professor = token.slice(5);
      return;
    }
    if (token.startsWith("type:")) {
      parsed.scheduleType = token.slice(5);
      return;
    }
    if (token.startsWith("attr:") || token.startsWith("attribute:")) {
      parsed.attribute = token.includes("attribute:")
        ? token.slice(10)
        : token.slice(5);
      return;
    }
    if (token.startsWith("day:") || token.startsWith("days:")) {
      const value = token.includes("days:") ? token.slice(5) : token.slice(4);
      parsed.dayFilters = parseDayFilters(value);
      return;
    }
    if (token === "open" || token === "open-only") {
      parsed.openOnly = true;
      return;
    }
    if (token === "linked") {
      parsed.linkedOnly = true;
      return;
    }
    parsed.generalTokens.push(token);
  });

  if (searchMode === "crn" && !parsed.crn) {
    const normalizedCrn = extractCrnSearchValue(query);
    if (/^\d+$/.test(normalizedCrn)) {
      parsed.crn = normalizedCrn;
    }
  }

  return parsed;
}

function normalizeCompactSearchValue(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function normalizeCatalogToken(value: string) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeAttributeLabel(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeAttributeKey(value: string) {
  return normalizeAttributeLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function courseHasAttribute(course: Course, attributeKey: string) {
  if (!attributeKey || attributeKey === "all") return true;
  return (course.attributes ?? []).some(
    (attribute) => normalizeAttributeKey(attribute) === attributeKey,
  );
}

function courseMatchesAttributeQuery(course: Course, attributeQuery: string) {
  const queryKey = normalizeAttributeKey(attributeQuery);
  if (!queryKey) return true;
  return (course.attributes ?? []).some((attribute) => {
    const label = normalizeAttributeLabel(attribute).toLowerCase();
    const key = normalizeAttributeKey(attribute);
    return key.includes(queryKey) || label.includes(attributeQuery.toLowerCase());
  });
}

function normalizeSubjectKey(course: Course) {
  return (
    course.subjectCourse
    ?? `${course.department}${course.courseNumber}`
  ).replace(/\s+/g, "").toUpperCase();
}

function getLinkCourseNumber(course: Course) {
  const courseNumber = String(course.courseNumber || course.code.match(/\d+[A-Z]*/i)?.[0] || "")
    .trim()
    .toUpperCase();
  if (!courseNumber) return "";

  const role = getSectionRole(course);
  if (role === "lecture") return courseNumber;

  const stripped = courseNumber.replace(/(?:LAB|[BLPRT])$/i, "");
  return stripped !== courseNumber && /\d$/.test(stripped)
    ? stripped
    : courseNumber;
}

function getCourseFamilyKey(course: Course) {
  return [
    course.universityId,
    course.termId ?? "",
    `${getCourseDepartmentCode(course)}${getLinkCourseNumber(course)}` || normalizeSubjectKey(course),
  ].map((value) => String(value).trim().toUpperCase()).join(":");
}

function normalizeLinkScope(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function campusesCanPair(left: Course, right: Course) {
  const leftCampus = normalizeLinkScope(left.campus);
  const rightCampus = normalizeLinkScope(right.campus);
  if (!leftCampus || !rightCampus || leftCampus === rightCampus) return true;
  return [leftCampus, rightCampus].some((campus) =>
    campus.includes("ALL") || campus.includes("MULTIPLE") || campus.includes("TBA"),
  );
}

function getCourseNumberParts(course: Course) {
  const match = String(course.courseNumber || course.code).match(/(\d+)([A-Z]*)/i);
  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match?.[2]?.toUpperCase() ?? "",
  };
}

function getCourseDepartmentCode(course: Course) {
  const department = normalizeCatalogToken(course.department);
  if (department) return department;
  return normalizeCatalogToken(course.code.match(/^[A-Z]+/i)?.[0] ?? "");
}

function getCourseNumberText(course: Course) {
  return normalizeCatalogToken(course.courseNumber || (course.code.match(/\d+[A-Z]*/i)?.[0] ?? ""));
}

function getCatalogSearchIntent(query: string): CatalogSearchIntent | null {
  const compactQuery = normalizeCatalogToken(query);
  const match = compactQuery.match(/^([A-Z]{1,6})(\d+[A-Z]*)?$/);
  if (!match) return null;

  return {
    department: match[1],
    numberPrefix: match[2] ?? "",
  };
}

function getExactCourseFamilyIntent(query: string) {
  const intent = getCatalogSearchIntent(query);
  if (!intent?.numberPrefix) return null;
  return intent;
}

function courseMatchesExactCourseFamily(course: Course, intent: CatalogSearchIntent | null) {
  if (!intent?.numberPrefix) return false;
  return getCatalogIntentRank(course, intent) === 0;
}

function getCatalogIntentRank(course: Course, intent: CatalogSearchIntent | null) {
  if (!intent) return 0;

  const department = getCourseDepartmentCode(course);
  const number = getCourseNumberText(course);
  const compactCode = normalizeCatalogToken(course.code);
  const compactNeedle = `${intent.department}${intent.numberPrefix}`;

  if (
    department === intent.department
    && (!intent.numberPrefix || number.startsWith(intent.numberPrefix))
  ) {
    return 0;
  }

  if (compactCode.startsWith(compactNeedle)) return 1;
  if (department === intent.department) return 2;
  return 3;
}

function getSectionNumber(section: string | null | undefined) {
  const match = String(section ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function getLinkedGroupToken(course: Course) {
  const raw = String(course.linkIdentifier || course.section || "").trim().toUpperCase();
  if (!raw) return "";
  const numeric = raw.match(/(\d+)/)?.[1];
  return numeric ? `G${numeric.padStart(3, "0")}` : raw;
}

function getSectionRole(course: Course): "lecture" | "recitation" | "lab" | "other" {
  const scheduleType = String(course.scheduleType ?? "").toLowerCase();
  const section = String(course.section ?? "").trim().toUpperCase();
  const universityId = String(course.universityId ?? "").trim().toLowerCase();
  const courseNumber = normalizeLinkScope(course.courseNumber);
  const title = String(course.title ?? "").toLowerCase();
  const supportsCatalogLabInference = universityId === "liu" || universityId === "aust";

  if (scheduleType.includes("lecture")) return "lecture";
  if (scheduleType.includes("recitation") || scheduleType.includes("tutorial")) return "recitation";
  if (scheduleType.includes("lab") || scheduleType.includes("laboratory")) return "lab";
  if (/\blab(oratory)?\b/i.test(title) || (supportsCatalogLabInference && /(?:LAB|L)$/.test(courseNumber))) {
    return "lab";
  }
  if (supportsCatalogLabInference && scheduleType.includes("catalog")) return "lecture";
  if (/^L\d*/.test(section)) return "lecture";
  if (/^(R|T|E)\d*/.test(section)) return "recitation";
  if (/^(B|P|LAB)\d*/.test(section)) return "lab";
  return "other";
}

function getSectionRoleLabel(course: Course) {
  const role = getSectionRole(course);
  if (role === "lecture") return "Lecture";
  if (role === "recitation") return "Recitation";
  if (role === "lab") return "Lab";
  return course.scheduleType || "Section";
}

function getSectionRoleRank(course: Course) {
  const role = getSectionRole(course);
  if (role === "lecture") return 0;
  if (role === "recitation") return 1;
  if (role === "lab") return 2;
  return 3;
}

function getLinkGroupKey(course: Course) {
  const hasLinkSignal = Boolean(
    course.isSectionLinked
    || course.linkIdentifier
    || getExplicitLinkedCrns(course).length > 0,
  );
  if (!hasLinkSignal) return "";
  const group = getLinkedGroupToken(course);
  return group ? `${getCourseFamilyKey(course)}:${group}` : "";
}

function getExplicitLinkedCrns(course: Course) {
  return (course.linkedCourses ?? [])
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function getFallbackLinkToken(course: Course) {
  const raw = normalizeLinkScope(course.linkIdentifier || course.section);
  if (!raw) return "";

  const withoutRolePrefix = raw.replace(
    /^(LECTURE|LEC|LABORATORY|LAB|RECITATION|REC|TUTORIAL|TUT|SECTION|SEC|CLASS|CLS|B|E|P|R|T|L)/,
    "",
  );
  const numeric = withoutRolePrefix.match(/(\d+)/)?.[1] ?? raw.match(/(\d+)/)?.[1];
  if (numeric) return `N${numeric.padStart(3, "0")}`;

  return withoutRolePrefix || raw;
}

function isPairableSection(course: Course) {
  const role = getSectionRole(course);
  return role === "lecture" || role === "recitation" || role === "lab" || Boolean(course.linkIdentifier);
}

function pushMapValue<TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey, value: TValue) {
  const values = map.get(key);
  if (values) {
    values.push(value);
    return;
  }
  map.set(key, [value]);
}

function buildLinkedSectionIndex(courses: Course[]) {
  const byCrn = new Map<string, Course[]>();
  const byExplicitTargetCrn = new Map<string, Course[]>();
  const byGroup = new Map<string, Course[]>();
  const byFamily = new Map<string, Course[]>();
  const byFamilyFallbackToken = new Map<string, Course[]>();

  courses.forEach((course) => {
    const crn = String(course.crn).trim();
    if (crn) pushMapValue(byCrn, crn, course);

    getExplicitLinkedCrns(course).forEach((linkedCrn) => {
      pushMapValue(byExplicitTargetCrn, linkedCrn, course);
    });

    const groupKey = getLinkGroupKey(course);
    if (groupKey) pushMapValue(byGroup, groupKey, course);

    if (isPairableSection(course)) {
      const familyKey = getCourseFamilyKey(course);
      pushMapValue(byFamily, familyKey, course);

      const fallbackToken = getFallbackLinkToken(course);
      if (fallbackToken) {
        pushMapValue(byFamilyFallbackToken, `${familyKey}:${fallbackToken}`, course);
      }
    }
  });

  const index = new Map<string, Course[]>();

  courses.forEach((course) => {
    const directLinked = new Map<string, Course>();
    const familyKey = getCourseFamilyKey(course);
    const courseCrn = String(course.crn).trim();

    const addIfPairable = (candidate: Course) => {
      if (candidate.id === course.id) return;
      if (getCourseFamilyKey(candidate) !== familyKey) return;
      if (!campusesCanPair(course, candidate)) return;
      directLinked.set(candidate.id, candidate);
    };

    getExplicitLinkedCrns(course).forEach((linkedCrn) => {
      byCrn.get(linkedCrn)?.forEach(addIfPairable);
    });
    if (courseCrn) {
      byExplicitTargetCrn.get(courseCrn)?.forEach(addIfPairable);
    }

    const groupKey = getLinkGroupKey(course);
    if (groupKey) {
      byGroup.get(groupKey)?.forEach(addIfPairable);
    }

    if (directLinked.size > 0) {
      index.set(course.id, [...directLinked.values()].sort(compareCourseCatalogOrder));
      return;
    }

    if (!isPairableSection(course)) {
      index.set(course.id, []);
      return;
    }

    const currentRole = getSectionRole(course);
    const currentToken = getFallbackLinkToken(course);
    const inferredLinked = new Map<string, Course>();
    const tokenLinked = currentToken
      ? (byFamilyFallbackToken.get(`${familyKey}:${currentToken}`) ?? [])
          .filter((candidate) =>
            candidate.id !== course.id
            && campusesCanPair(course, candidate)
            && getSectionRole(candidate) !== currentRole,
          )
      : [];

    tokenLinked.forEach((candidate) => inferredLinked.set(candidate.id, candidate));

    const sameCourseSections = (byFamily.get(familyKey) ?? [])
      .filter((candidate) =>
        candidate.id !== course.id
        && campusesCanPair(course, candidate),
      );
    const lectures = sameCourseSections.filter((candidate) => getSectionRole(candidate) === "lecture");
    const supportSections = sameCourseSections.filter((candidate) => getSectionRole(candidate) !== "lecture");

    if (currentRole === "lecture" && supportSections.length > 0 && lectures.length === 0) {
      supportSections.forEach((candidate) => inferredLinked.set(candidate.id, candidate));
    }

    if (currentRole !== "lecture" && lectures.length === 1) {
      lectures.forEach((candidate) => inferredLinked.set(candidate.id, candidate));
    }

    if (inferredLinked.size > 0) {
      index.set(course.id, [...inferredLinked.values()].sort(compareCourseCatalogOrder));
      return;
    }

    index.set(course.id, []);
  });

  return index;
}

function buildCourseSearchIndex(courses: Course[]) {
  const index = new Map<string, CourseSearchRecord>();

  courses.forEach((course) => {
    const attributeText = course.attributes?.join(" ") ?? "";
    const linkedText = getExplicitLinkedCrns(course).join(" ");
    const haystack = `${course.code} ${course.title} ${course.instructor} ${course.crn} ${course.section} ${course.scheduleType ?? ""} ${course.linkIdentifier ?? ""} ${linkedText} ${attributeText}`.toLowerCase();

    index.set(course.id, {
      haystack,
      compactHaystack: normalizeCompactSearchValue(haystack),
    });
  });

  return index;
}

function compareCourseCatalogOrder(left: Course, right: Course) {
  const deptCompare = naturalSort.compare(left.department, right.department);
  if (deptCompare) return deptCompare;

  const leftNumber = getCourseNumberParts(left);
  const rightNumber = getCourseNumberParts(right);
  if (leftNumber.number !== rightNumber.number) return leftNumber.number - rightNumber.number;

  const suffixCompare = naturalSort.compare(leftNumber.suffix, rightNumber.suffix);
  if (suffixCompare) return suffixCompare;

  const roleCompare = getSectionRoleRank(left) - getSectionRoleRank(right);
  if (roleCompare) return roleCompare;

  const linkCompare = naturalSort.compare(getLinkedGroupToken(left), getLinkedGroupToken(right));
  if (linkCompare) return linkCompare;

  const sectionNumberCompare = getSectionNumber(left.section) - getSectionNumber(right.section);
  if (Number.isFinite(sectionNumberCompare) && sectionNumberCompare !== 0) return sectionNumberCompare;

  const sectionCompare = naturalSort.compare(left.section || "", right.section || "");
  if (sectionCompare) return sectionCompare;

  const startCompare = getCourseFirstStart(left) - getCourseFirstStart(right);
  if (Number.isFinite(startCompare) && startCompare !== 0) return startCompare;

  return naturalSort.compare(String(left.crn), String(right.crn));
}

function compareCourseCatalogOrderForQuery(left: Course, right: Course, query: string) {
  const intent = getCatalogSearchIntent(query);
  const rankCompare = getCatalogIntentRank(left, intent) - getCatalogIntentRank(right, intent);
  if (rankCompare) return rankCompare;
  return compareCourseCatalogOrder(left, right);
}

function getSearchWords(value: string) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasWordPrefix(value: string, token: string) {
  if (!token) return false;
  return getSearchWords(value).some((word) => word.startsWith(token));
}

function courseMatchesGeneralToken(
  course: Course,
  token: string,
  searchRecord?: CourseSearchRecord,
) {
  const normalizedToken = token.trim().toLowerCase();
  if (!normalizedToken) return true;

  const compactToken = normalizeCompactSearchValue(normalizedToken);
  const code = course.code.toLowerCase();
  const compactCode = normalizeCompactSearchValue(course.code);
  const departmentCode = getCourseDepartmentCode(course).toLowerCase();
  const courseNumber = getCourseNumberText(course).toLowerCase();
  const title = course.title.toLowerCase();
  const instructor = course.instructor.toLowerCase();
  const crn = String(course.crn).toLowerCase();
  const scheduleType = String(course.scheduleType ?? "").toLowerCase();
  const attributeText = (course.attributes ?? []).join(" ").toLowerCase();
  const haystack = searchRecord?.haystack ?? "";
  const compactHaystack = searchRecord?.compactHaystack ?? "";

  if (normalizedToken.length <= 1) {
    return (
      compactCode.startsWith(compactToken)
      || departmentCode.startsWith(normalizedToken)
      || courseNumber.startsWith(normalizedToken)
      || hasWordPrefix(title, normalizedToken)
      || crn.startsWith(normalizedToken)
    );
  }

  if (normalizedToken.length === 2) {
    return (
      compactCode.startsWith(compactToken)
      || compactCode.includes(compactToken)
      || departmentCode.startsWith(normalizedToken)
      || courseNumber.startsWith(normalizedToken)
      || hasWordPrefix(title, normalizedToken)
      || hasWordPrefix(instructor, normalizedToken)
      || hasWordPrefix(scheduleType, normalizedToken)
      || hasWordPrefix(attributeText, normalizedToken)
      || crn.startsWith(normalizedToken)
    );
  }

  if (/^[a-z]+$/.test(normalizedToken)) {
    return (
      compactCode.startsWith(compactToken)
      || compactCode.includes(compactToken)
      || departmentCode.startsWith(normalizedToken)
      || hasWordPrefix(title, normalizedToken)
      || hasWordPrefix(instructor, normalizedToken)
      || hasWordPrefix(scheduleType, normalizedToken)
      || hasWordPrefix(attributeText, normalizedToken)
    );
  }

  return haystack.includes(normalizedToken) || compactHaystack.includes(compactToken);
}

function matchesTimePreset(course: Course, preset: TimePreset) {
  if (preset === "all") return true;

  return course.meetings.every((meeting) => {
    const start = timeToMinutes(meeting.start) ?? 0;
    if (preset === "morning") return start < 12 * 60;
    if (preset === "afternoon") return start >= 12 * 60 && start < 17 * 60;
    return start >= 17 * 60;
  });
}

function getCourseFirstStart(course: Course) {
  return course.meetings.reduce((earliest, meeting) => {
    const minutes = timeToMinutes(meeting.start) ?? Infinity;
    return Math.min(earliest, minutes);
  }, Infinity);
}

function getCourseLastStart(course: Course) {
  return course.meetings.reduce((latest, meeting) => {
    const minutes = timeToMinutes(meeting.start) ?? -Infinity;
    return Math.max(latest, minutes);
  }, -Infinity);
}

function getMatchScore(course: Course, query: string, isScheduled: boolean, isFavorite: boolean) {
  const normalizedQuery = query.trim().toLowerCase();
  const compactQuery = normalizeCompactSearchValue(normalizedQuery);
  const tinyQuery = normalizedQuery.length === 1;
  const shortQuery = normalizedQuery.length <= 2;
  const crnQuery = looksLikeCrnSearch(query) ? extractCrnSearchValue(query) : "";
  const catalogIntent = getCatalogSearchIntent(query);
  const code = course.code.toLowerCase();
  const compactCode = normalizeCompactSearchValue(course.code);
  const departmentCode = getCourseDepartmentCode(course).toLowerCase();
  const courseNumber = getCourseNumberText(course).toLowerCase();
  const title = course.title.toLowerCase();
  const instructor = course.instructor.toLowerCase();
  const crn = String(course.crn).toLowerCase();
  const attributeText = (course.attributes ?? []).join(" ").toLowerCase();
  const compactAttributes = normalizeCompactSearchValue(attributeText);
  let score = 0;

  if (!normalizedQuery) score += 1;
  if (crnQuery && crn === crnQuery) score += 260;
  if (crnQuery && crn.startsWith(crnQuery)) score += 180;
  if (crnQuery && crn.includes(crnQuery)) score += 120;
  if (code === normalizedQuery) score += 120;
  if (compactQuery && compactCode === compactQuery) score += 120;
  if (catalogIntent && getCatalogIntentRank(course, catalogIntent) === 0) score += 110;
  if (departmentCode && departmentCode === normalizedQuery) score += 95;
  if (
    catalogIntent?.numberPrefix
    && departmentCode === catalogIntent.department.toLowerCase()
    && courseNumber.startsWith(catalogIntent.numberPrefix.toLowerCase())
  ) {
    score += 45;
  }
  if (code.startsWith(normalizedQuery)) score += 80;
  if (compactQuery && compactCode.startsWith(compactQuery)) score += 80;
  if (title.startsWith(normalizedQuery)) score += 50;
  if (!tinyQuery && hasWordPrefix(title, normalizedQuery)) score += shortQuery ? 42 : 18;
  if (!shortQuery && instructor.includes(normalizedQuery)) score += 32;
  if (!shortQuery && attributeText.includes(normalizedQuery)) score += 34;
  if (!shortQuery && compactQuery && compactAttributes.includes(compactQuery)) score += 34;
  if (crn.startsWith(normalizedQuery)) score += 24;
  if (normalizedQuery.length >= 2 && hasWordPrefix(instructor, normalizedQuery)) score += 16;
  if (isFavorite) score += 8;
  if (isScheduled) score += 4;

  return score;
}

function encodeScheduleShare(courses: Course[]) {
  const payload = courses.map((course) => ({
    id: course.id,
    code: course.code,
    title: course.title,
    section: course.section,
    crn: course.crn,
    meetings: course.meetings,
  }));

  return window.btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function decodeScheduleShare(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [] as Array<Pick<Course, "id" | "code" | "title">>;

  const decoded = decodeURIComponent(escape(window.atob(trimmed)));
  const parsed = JSON.parse(decoded);
  return Array.isArray(parsed) ? parsed : [];
}

function getShareComparison(currentCourses: Course[], shareCode: string) {
  try {
    const sharedCourses = decodeScheduleShare(shareCode);
    if (!sharedCourses.length) return "";
    const currentIds = new Set(currentCourses.map((course) => course.id));
    const sharedIds = new Set(sharedCourses.map((course) => course.id));
    const common = sharedCourses.filter((course) => currentIds.has(course.id)).length;
    const added = sharedCourses.filter((course) => !currentIds.has(course.id)).length;
    const removed = currentCourses.filter((course) => !sharedIds.has(course.id)).length;
    return `${common} same, ${added} only in pasted schedule, ${removed} only in current schedule.`;
  } catch {
    return "That share code could not be read.";
  }
}

const DEFAULT_UNIVERSITY_SEARCH_SUGGESTIONS: Record<string, string> = {
  aub: "ENGL 203",
  lau: "ENG 202",
  usek: "ENG 240",
  bau: "ENGL 001",
  ndu: "CSC 201",
  aust: "CSI 200",
  usj: "INFO 203",
  lu: "LS1ALGE",
  liu: "CSCI 200",
};

function getMostCommonCourseSuggestion(courses: Course[], universityId: string) {
  const counts = new Map<string, { code: string; count: number; openSeats: number }>();

  courses.forEach((course) => {
    const code = course.code.trim().toUpperCase();
    if (!code) return;

    const current = counts.get(code) ?? { code, count: 0, openSeats: 0 };
    current.count += 1;
    current.openSeats += getOpenSeats(course);
    counts.set(code, current);
  });

  return [...counts.values()]
    .sort((left, right) =>
      right.count - left.count
      || right.openSeats - left.openSeats
      || left.code.localeCompare(right.code),
    )[0]?.code
    ?? DEFAULT_UNIVERSITY_SEARCH_SUGGESTIONS[String(universityId).trim().toLowerCase()]
    ?? "CLASS123";
}

function getCrnSuggestion(courses: Course[]) {
  const crns = [...courses]
    .sort(compareCourseCatalogOrder)
    .map((course) => String(course.crn).trim())
    .filter(Boolean);

  const numericCrn = crns.find((crn) => /^\d{5,12}$/.test(crn));
  if (numericCrn) return numericCrn;

  return [...new Set(crns)].sort((left, right) =>
    left.length - right.length || naturalSort.compare(left, right),
  )[0] ?? null;
}

function normalizeSearchHistoryValue(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getSearchHistoryStorageKey(userId: string | null, universityId: string) {
  return `${SEARCH_HISTORY_STORAGE_PREFIX}${userId ?? "guest"}:${String(universityId ?? "").trim().toLowerCase()}`;
}

function readSearchHistoryEntries(storageKey: string): SearchHistoryEntry[] {
  if (typeof window === "undefined" || !storageKey) return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is SearchHistoryEntry =>
        Boolean(entry)
        && typeof entry === "object"
        && typeof (entry as SearchHistoryEntry).value === "string"
        && typeof (entry as SearchHistoryEntry).count === "number"
        && typeof (entry as SearchHistoryEntry).lastUsedAt === "string",
      )
      .slice(0, SEARCH_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeSearchHistoryEntries(storageKey: string, entries: SearchHistoryEntry[]) {
  if (typeof window === "undefined" || !storageKey) return;
  window.localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, SEARCH_HISTORY_LIMIT)));
}

function updateSearchHistoryEntries(storageKey: string, rawValue: string) {
  const normalizedValue = normalizeSearchHistoryValue(rawValue);
  if (!storageKey || !normalizedValue) {
    return readSearchHistoryEntries(storageKey);
  }

  const currentEntries = readSearchHistoryEntries(storageKey);
  const normalizedKey = normalizedValue.toLowerCase();
  const nextEntries = [...currentEntries];
  const existingIndex = nextEntries.findIndex(
    (entry) => normalizeSearchHistoryValue(entry.value).toLowerCase() === normalizedKey,
  );

  if (existingIndex >= 0) {
    const existingEntry = nextEntries[existingIndex];
    nextEntries[existingIndex] = {
      value: existingEntry.value,
      count: existingEntry.count + 1,
      lastUsedAt: new Date().toISOString(),
    };
  } else {
    nextEntries.unshift({
      value: normalizedValue,
      count: 1,
      lastUsedAt: new Date().toISOString(),
    });
  }

  nextEntries.sort((left, right) =>
    right.count - left.count
    || right.lastUsedAt.localeCompare(left.lastUsedAt),
  );

  const limitedEntries = nextEntries.slice(0, SEARCH_HISTORY_LIMIT);
  writeSearchHistoryEntries(storageKey, limitedEntries);
  return limitedEntries;
}

function getProfessorToken(instructor: string) {
  const normalized = String(instructor ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  const parts = normalized.split(" ");
  return (parts[parts.length - 1] || parts[0] || "").toLowerCase();
}

function findCourseSuggestionFromValue(value: string, courses: Course[]) {
  const normalized = normalizeSearchHistoryValue(value).toLowerCase();
  const compact = normalizeCompactSearchValue(normalized);
  if (!normalized || !compact) return null;

  let bestCourse: Course | null = null;
  let bestScore = -1;
  let bestOpenSeats = -1;

  courses.forEach((course) => {
    const codeCompact = normalizeCompactSearchValue(course.code);
    const subjectCompact = normalizeCompactSearchValue(normalizeSubjectKey(course));
    const titleLower = String(course.title ?? "").toLowerCase();
    const departmentLower = String(course.department ?? "").toLowerCase();

    let score = -1;
    if (compact === codeCompact || compact === subjectCompact) score = 120;
    else if (codeCompact.startsWith(compact) || subjectCompact.startsWith(compact)) score = 110;
    else if (titleLower === normalized) score = 100;
    else if (titleLower.startsWith(normalized)) score = 92;
    else if (titleLower.includes(normalized)) score = 82;
    else if (departmentLower === normalized || departmentLower.startsWith(normalized)) score = 66;

    if (score < 0) return;

    const openSeats = getOpenSeats(course);
    if (score > bestScore || (score === bestScore && openSeats > bestOpenSeats)) {
      bestCourse = course;
      bestScore = score;
      bestOpenSeats = openSeats;
    }
  });

  return bestCourse;
}

function findProfessorSuggestionFromValue(value: string, courses: Course[]) {
  const normalized = normalizeSearchHistoryValue(value).toLowerCase();
  if (!normalized || normalized.length < 3) return null;

  let bestMatch: { label: string; token: string; score: number } | null = null;

  courses.forEach((course) => {
    const instructor = String(course.instructor ?? "").trim();
    if (!instructor || /^tba$/i.test(instructor)) return;

    const instructorLower = instructor.toLowerCase();
    const token = getProfessorToken(instructor);
    let score = -1;

    if (instructorLower === normalized) score = 110;
    else if (token === normalized) score = 104;
    else if (instructorLower.startsWith(normalized)) score = 94;
    else if (token.startsWith(normalized)) score = 88;
    else if (instructorLower.includes(normalized)) score = 74;

    if (score < 0 || !token) return;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { label: instructor, token, score };
    }
  });

  return bestMatch;
}

function findDepartmentSuggestionFromValue(value: string, courses: Course[]) {
  const normalized = normalizeSearchHistoryValue(value).toLowerCase();
  if (!normalized || normalized.length < 2) return null;

  const departments = new Map<string, { count: number; code: string; score: number }>();

  courses.forEach((course) => {
    const code = getCourseDepartmentCode(course);
    const lowerCode = code.toLowerCase();
    let score = -1;
    if (lowerCode === normalized) score = 100;
    else if (lowerCode.startsWith(normalized)) score = 90;
    else return;

    const current = departments.get(code) ?? { count: 0, code, score };
    current.count += 1;
    current.score = Math.max(current.score, score);
    departments.set(code, current);
  });

  return [...departments.values()]
    .sort((left, right) => right.score - left.score || right.count - left.count || left.code.localeCompare(right.code))[0]
    ?? null;
}

function resolvePersonalizedSearchSuggestion(
  historyValue: string,
  courses: Course[],
  availableAttributes: AttributeOption[],
): SearchSuggestion | null {
  const normalizedValue = normalizeSearchHistoryValue(historyValue);
  if (!normalizedValue) return null;

  if (normalizedValue.toLowerCase().startsWith("crn:") || looksLikeCrnSearch(normalizedValue)) {
    const crnValue = extractCrnSearchValue(normalizedValue);
    return courses.some((course) => String(course.crn).trim().toLowerCase() === crnValue)
      ? { label: `CRN ${crnValue}`, value: crnValue, kind: "crn" }
      : null;
  }

  if (normalizedValue.toLowerCase().startsWith("attr:")) {
    const attrQuery = normalizedValue.slice(5);
    const attribute = availableAttributes.find((option) =>
      normalizeAttributeLabel(option.label).toLowerCase().includes(attrQuery.toLowerCase()),
    );
    return attribute
      ? { label: `attr:${attribute.label}`, value: `attr:${attribute.label}`, kind: "attribute" }
      : null;
  }

  if (normalizedValue.toLowerCase().startsWith("prof:")) {
    const professorMatch = findProfessorSuggestionFromValue(normalizedValue.slice(5), courses);
    return professorMatch
      ? { label: professorMatch.label, value: `prof:${professorMatch.token}`, kind: "professor" }
      : null;
  }

  if (normalizedValue.toLowerCase().startsWith("dept:")) {
    const departmentMatch = findDepartmentSuggestionFromValue(normalizedValue.slice(5), courses);
    return departmentMatch
      ? { label: `dept:${departmentMatch.code}`, value: `dept:${departmentMatch.code.toLowerCase()}`, kind: "department" }
      : null;
  }

  const courseMatch = findCourseSuggestionFromValue(normalizedValue, courses);
  if (courseMatch) {
    return { label: courseMatch.code, value: courseMatch.code, kind: "course" };
  }

  const professorMatch = findProfessorSuggestionFromValue(normalizedValue, courses);
  if (professorMatch) {
    return { label: professorMatch.label, value: `prof:${professorMatch.token}`, kind: "professor" };
  }

  const departmentMatch = findDepartmentSuggestionFromValue(normalizedValue, courses);
  if (departmentMatch) {
    return { label: `dept:${departmentMatch.code}`, value: `dept:${departmentMatch.code.toLowerCase()}`, kind: "department" };
  }

  return null;
}

function RightSearchPanelComponent({
  allCourses,
  catalogLoading,
  compactMobileHome = false,
  scheduled,
  favorites,
  slotSummaries,
  blockedTimes,
  lockedCourseIds,
  generatedSchedules,
  scheduleMetrics,
  onSelectCourse,
  onToggleSchedule,
  onHoverCourse,
  onPreviewCourse,
  averageDifficulty,
  totalCredits,
  activeSlot,
  onSlotChange,
  universityId,
  termId,
  onCloneActiveSchedule,
  onClearActiveSchedule,
  onAddBlockedTime,
  onRemoveBlockedTime,
  onToggleLockedCourse,
  onGenerateSchedules,
  onApplyGeneratedSchedule,
  onRecoverCatalogCourses,
}: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [recoveredCourses, setRecoveredCourses] = useState<Course[]>([]);
  const [catalogRecoveryLoading, setCatalogRecoveryLoading] = useState(false);
  const [remoteSearchCourses, setRemoteSearchCourses] = useState<Course[]>([]);
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("course");
  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [selectedAttributeKey, setSelectedAttributeKey] = useState("all");
  const [hideConflicts, setHideConflicts] = useState(false);
  const [openSeatsOnly, setOpenSeatsOnly] = useState(false);
  const [excludeFriday, setExcludeFriday] = useState(false);
  const [blockLabel, setBlockLabel] = useState("Work");
  const [blockDays, setBlockDays] = useState("MWF");
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("10:00");
  const [shareStatus, setShareStatus] = useState("");
  const [compareCode, setCompareCode] = useState("");
  const [viewModal, setViewModal] = useState<ViewModal>(null);
  const [modalTab, setModalTab] = useState<ModalTab>("reviews");
  const [activeLinkedCourseId, setActiveLinkedCourseId] = useState<string | null>(null);
  const [modalRatings, setModalRatings] = useState<CourseRating[]>([]);
  const [modalAvg, setModalAvg] = useState<{
    rating: string;
    difficulty: string;
    count: number;
  } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [hintCrnSuggestion, setHintCrnSuggestion] = useState<string | null>(null);
  const [searchHistoryUserId, setSearchHistoryUserId] = useState<string | null>(null);
  const [searchHistoryEntries, setSearchHistoryEntries] = useState<SearchHistoryEntry[]>([]);
  const lastRecordedSearchRef = useRef("");
  const effectiveCourses = allCourses.length > 0 ? allCourses : recoveredCourses;
  const searchHistoryKey = useMemo(
    () => getSearchHistoryStorageKey(searchHistoryUserId, universityId),
    [searchHistoryUserId, universityId],
  );

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSearchHistoryUserId(data.session?.user.id ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      if (!active) return;
      setSearchHistoryUserId(session?.user.id ?? null);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setSearchHistoryEntries(readSearchHistoryEntries(searchHistoryKey));
  }, [searchHistoryKey]);

  const rememberSearch = useCallback((rawValue: string) => {
    const nextEntries = updateSearchHistoryEntries(searchHistoryKey, rawValue);
    setSearchHistoryEntries(nextEntries);
  }, [searchHistoryKey]);

  useEffect(() => {
    if (allCourses.length > 0) {
      setRecoveredCourses([]);
      setCatalogRecoveryLoading(false);
    }
  }, [allCourses]);

  useEffect(() => {
    const localSuggestion = getCrnSuggestion(effectiveCourses);
    if (localSuggestion) {
      setHintCrnSuggestion(localSuggestion);
      return;
    }

    if (!universityId || !termId) {
      setHintCrnSuggestion(null);
      return;
    }

    let cancelled = false;

    const loadHintCrn = async () => {
      try {
        const params = new URLSearchParams({
          university: universityId,
          term: termId,
        });
        const response = await fetch(`${API}/api/courses?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Hint CRN failed: ${response.status}`);
        }

        const rawCourses = await response.json();
        const mappedCourses = mapApiCoursesToCourses(rawCourses).filter(
          (course) => course.universityId === universityId,
        );
        const remoteSuggestion = getCrnSuggestion(mappedCourses);

        if (!cancelled) {
          setHintCrnSuggestion(remoteSuggestion);
        }
      } catch {
        if (!cancelled) {
          setHintCrnSuggestion(null);
        }
      }
    };

    void loadHintCrn();

    return () => {
      cancelled = true;
    };
  }, [effectiveCourses, termId, universityId]);

  useEffect(() => {
    if (allCourses.length > 0 || !universityId || !termId) {
      setCatalogRecoveryLoading(false);
      return;
    }

    let cancelled = false;
    setCatalogRecoveryLoading(true);

    const loadCatalog = async () => {
      try {
        const params = new URLSearchParams({
          university: universityId,
          term: termId,
        });
        const response = await fetch(`${API}/api/courses?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Recovery failed: ${response.status}`);
        }

        const rawCourses = await response.json();
        const mappedCourses = mapApiCoursesToCourses(rawCourses).filter(
          (course) => course.universityId === universityId,
        );

        if (cancelled || mappedCourses.length === 0) {
          return;
        }

        setRecoveredCourses(mappedCourses);
        onRecoverCatalogCourses?.(mappedCourses, termId);
      } catch {
        if (!cancelled) {
          setRecoveredCourses([]);
        }
      } finally {
        if (!cancelled) {
          setCatalogRecoveryLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [allCourses.length, onRecoverCatalogCourses, termId, universityId]);

  useEffect(() => {
    const trimmedQuery = deferredQuery.trim();
    if (!trimmedQuery || !universityId || !termId) {
      setRemoteSearchCourses([]);
      setRemoteSearchLoading(false);
      return;
    }

    let cancelled = false;
    setRemoteSearchLoading(true);

    const loadRemoteMatches = async () => {
      try {
        const params = new URLSearchParams({
          university: universityId,
          term: termId,
          search: trimmedQuery,
        });
        const response = await fetch(`${API}/api/courses?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Remote search failed: ${response.status}`);
        }

        const rawCourses = await response.json();
        const mappedCourses = mapApiCoursesToCourses(rawCourses).filter(
          (course) => course.universityId === universityId,
        );

        if (!cancelled) {
          setRemoteSearchCourses(mappedCourses);
        }
      } catch {
        if (!cancelled) {
          setRemoteSearchCourses([]);
        }
      } finally {
        if (!cancelled) {
          setRemoteSearchLoading(false);
        }
      }
    };

    void loadRemoteMatches();

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, termId, universityId]);

  const searchableCourses = useMemo(() => {
    if (!remoteSearchCourses.length) return effectiveCourses;

    const merged = new Map<string, Course>();
    effectiveCourses.forEach((course) => merged.set(course.id, course));
    remoteSearchCourses.forEach((course) => {
      if (!merged.has(course.id)) {
        merged.set(course.id, course);
      }
    });
    return Array.from(merged.values());
  }, [effectiveCourses, remoteSearchCourses]);

  const linkedSectionIndex = useMemo(() => {
    try {
      return buildLinkedSectionIndex(searchableCourses);
    } catch (error) {
      console.error("Failed to build linked-section index.", error, searchableCourses);
      return new Map<string, Course[]>();
    }
  }, [searchableCourses]);
  const courseSearchIndex = useMemo(() => {
    try {
      return buildCourseSearchIndex(searchableCourses);
    } catch (error) {
      console.error("Failed to build course search index.", error, searchableCourses);
      return new Map<string, CourseSearchRecord>();
    }
  }, [searchableCourses]);
  const scheduledIds = useMemo(
    () => new Set(scheduled.map((course) => course.id)),
    [scheduled],
  );
  const favoriteIds = useMemo(
    () => new Set(favorites.map((course) => course.id)),
    [favorites],
  );
  const activeLinkedIds = useMemo(() => {
    if (!activeLinkedCourseId) return new Set<string>();
    return new Set([
      activeLinkedCourseId,
      ...(linkedSectionIndex.get(activeLinkedCourseId) ?? []).map((linkedCourse) => linkedCourse.id),
    ]);
  }, [activeLinkedCourseId, linkedSectionIndex]);
  const scheduledLinkedIds = useMemo(() => {
    const ids = new Set<string>();

    scheduled.forEach((course) => {
      const linkedSections = linkedSectionIndex.get(course.id) ?? [];
      if (!linkedSections.length) return;

      ids.add(course.id);
      linkedSections.forEach((linkedCourse) => ids.add(linkedCourse.id));
    });

    return ids;
  }, [scheduled, linkedSectionIndex]);
  const effectiveSearchMode = useMemo<SearchMode>(
    () => (isDirectCrnQuery(query) ? "crn" : "course"),
    [query],
  );
  const effectiveDeferredSearchMode = useMemo<SearchMode>(
    () => (isDirectCrnQuery(deferredQuery) ? "crn" : "course"),
    [deferredQuery],
  );
  const parsedQuery = useMemo(
    () => parseQuery(deferredQuery, effectiveDeferredSearchMode),
    [deferredQuery, effectiveDeferredSearchMode],
  );
  const exactCourseIntent = useMemo(
    () => getExactCourseFamilyIntent(deferredQuery),
    [deferredQuery],
  );
  const availableAttributes = useMemo(() => {
    try {
      const attributes = new Map<string, AttributeOption>();

      searchableCourses.forEach((course) => {
        const seenOnCourse = new Set<string>();
        course.attributes?.forEach((attribute) => {
          const label = normalizeAttributeLabel(attribute);
          const key = normalizeAttributeKey(label);
          if (!key || seenOnCourse.has(key)) return;
          seenOnCourse.add(key);

          const current = attributes.get(key) ?? { key, label, count: 0 };
          current.count += 1;
          attributes.set(key, current);
        });
      });

      return [...attributes.values()]
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
    } catch (error) {
      console.error("Failed to build attribute filters.", error, searchableCourses);
      return [] as AttributeOption[];
    }
  }, [searchableCourses]);
  const selectedAttribute = useMemo(
    () => availableAttributes.find((attribute) => attribute.key === selectedAttributeKey) ?? null,
    [availableAttributes, selectedAttributeKey],
  );
  const topAttributeFilters = useMemo(
    () => availableAttributes.slice(0, 6),
    [availableAttributes],
  );

  useEffect(() => {
    if (
      selectedAttributeKey !== "all"
      && !availableAttributes.some((attribute) => attribute.key === selectedAttributeKey)
    ) {
      setSelectedAttributeKey("all");
    }
  }, [availableAttributes, selectedAttributeKey]);

  useEffect(() => {
    if (!viewModal) return;
    setModalLoading(true);
    setModalTab("reviews");
    setSyllabi([]);
    setUploadError(null);
    setUploadSuccess(false);
    const dept = encodeURIComponent(
      viewModal.course.reviewDepartment
        ?? `${viewModal.course.universityId.toUpperCase()}__${viewModal.course.department}`,
    );
    const num = encodeURIComponent(viewModal.course.courseNumber);
    fetch(`${API}/api/ratings/course/${dept}/${num}`)
      .then((response) => response.json())
      .then((data) => {
        setModalRatings(data.ratings || []);
        setModalAvg(data.averages || null);
      })
      .finally(() => setModalLoading(false));
  }, [viewModal]);

  useEffect(() => {
    if (modalTab !== "syllabus" || !viewModal) return;
    setSyllabusLoading(true);
    supabase
      .from("syllabi")
      .select("*")
      .eq("course_code", viewModal.course.code)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setSyllabi(data || []);
        setSyllabusLoading(false);
      });
  }, [modalTab, viewModal]);

  const handleSyllabusUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !viewModal) return;
    if (file.type !== "application/pdf") {
      setUploadError("Only PDF files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File must be under 10MB.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const [
      {
        data: { user },
      },
      {
        data: { session },
      },
    ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
    if (!user || !session?.access_token) {
      setUploadError("Please sign in with your university email before uploading a syllabus.");
      setUploading(false);
      return;
    }
    const fileName = `${viewModal.course.code.replace(" ", "_")}_${Date.now()}.pdf`;

    const { error: storageError } = await supabase.storage
      .from("syllabi")
      .upload(fileName, file, { contentType: "application/pdf" });
    if (storageError) {
      setUploadError("Upload failed. Make sure you are logged in.");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("syllabi")
      .getPublicUrl(fileName);
    try {
      const response = await fetch(`${API}/api/syllabi/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          course_code: viewModal.course.code,
          course_title: viewModal.course.title,
          department: viewModal.course.department,
          course_number: viewModal.course.courseNumber,
          file_url: urlData.publicUrl,
          file_name: file.name,
          uploaded_by: user.email ?? "anonymous",
        }),
      });
      const reviewResult = await response.json().catch(() => ({}));

      if (!response.ok || !reviewResult.success) {
        await supabase.storage.from("syllabi").remove([fileName]);
        setUploadError(
          reviewResult.reason
          || reviewResult.error
          || "AI rejected this PDF because it does not look like the selected course syllabus.",
        );
        return;
      }

      setSyllabi((current) => [
        {
          id: `${Date.now()}`,
          course_code: viewModal.course.code,
          file_url: urlData.publicUrl,
          file_name: file.name,
          uploaded_by: user.email ?? "anonymous",
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setUploadSuccess(true);
    } catch (error) {
      await supabase.storage.from("syllabi").remove([fileName]);
      setUploadError(
        error instanceof Error
          ? error.message
          : "Could not run AI syllabus review. Please try again.",
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const hasSearchIntent = Boolean(
    query.trim()
    || openSeatsOnly
    || hideConflicts
    || excludeFriday
    || selectedAttributeKey !== "all"
    || timePreset !== "all",
  );
  const hasDeferredSearchIntent = Boolean(
    deferredQuery.trim()
    || openSeatsOnly
    || hideConflicts
    || excludeFriday
    || selectedAttributeKey !== "all"
    || timePreset !== "all",
  );
  const searchIsUpdating = query.trim() !== deferredQuery.trim();
  const showLiveSearchLoading = hasSearchIntent
    && (
      searchIsUpdating
      || remoteSearchLoading
      || (searchableCourses.length === 0 && (catalogLoading || catalogRecoveryLoading))
    );

  const results = useMemo(() => {
    if (!hasDeferredSearchIntent) return [] as Course[];

    try {
      const filtered = searchableCourses.filter((course) => {
        const searchRecord = courseSearchIndex.get(course.id);
        const isScheduled = scheduledIds.has(course.id);
        const matchesExactCourseFamily = courseMatchesExactCourseFamily(course, exactCourseIntent);

        if (
          parsedQuery.generalTokens.length > 0
          && !matchesExactCourseFamily
          && !parsedQuery.generalTokens.every((token) => {
            return courseMatchesGeneralToken(course, token, searchRecord);
          })
        ) {
          return false;
        }
        if (parsedQuery.department && !course.department.toLowerCase().includes(parsedQuery.department)) {
          return false;
        }
        if (parsedQuery.professor && !course.instructor.toLowerCase().includes(parsedQuery.professor)) {
          return false;
        }
        if (parsedQuery.crn && !String(course.crn).toLowerCase().includes(parsedQuery.crn)) {
          return false;
        }
        if (parsedQuery.scheduleType && !String(course.scheduleType ?? "").toLowerCase().includes(parsedQuery.scheduleType)) {
          return false;
        }
        if (
          parsedQuery.attribute
          && !courseMatchesAttributeQuery(course, parsedQuery.attribute)
        ) {
          return false;
        }
        if (
          selectedAttributeKey !== "all"
          && !courseHasAttribute(course, selectedAttributeKey)
        ) {
          return false;
        }
        if (parsedQuery.dayFilters.length > 0 && !course.meetings.some((meeting) => meeting.days.some((day) => parsedQuery.dayFilters.includes(day)))) {
          return false;
        }
        if ((openSeatsOnly || parsedQuery.openOnly) && getOpenSeats(course) <= 0) {
          return false;
        }
        if (parsedQuery.linkedOnly && !course.isSectionLinked) {
          return false;
        }
        if (excludeFriday && course.meetings.some((meeting) => meeting.days.includes("F"))) {
          return false;
        }
        if (!matchesTimePreset(course, timePreset)) {
          return false;
        }
        if (hideConflicts && !isScheduled && courseConflictsWithSchedule(course, scheduled)) {
          return false;
        }

        return true;
      });

      const exactCourseFamilyMatches = exactCourseIntent
        ? filtered.filter((course) => courseMatchesExactCourseFamily(course, exactCourseIntent))
        : [];
      const scopedResults = exactCourseFamilyMatches.length > 0
        ? exactCourseFamilyMatches
        : filtered;

      scopedResults.sort((left, right) => {
        const shouldPreferMatchSort = effectiveDeferredSearchMode === "crn";

        if (sortMode === "course" && !shouldPreferMatchSort) {
          return compareCourseCatalogOrderForQuery(left, right, deferredQuery);
        }
        if (sortMode === "earliest") {
          return getCourseFirstStart(left) - getCourseFirstStart(right);
        }
        if (sortMode === "latest") {
          return getCourseLastStart(right) - getCourseLastStart(left);
        }
        if (sortMode === "openSeats") {
          return getOpenSeats(right) - getOpenSeats(left);
        }

        const leftScore = getMatchScore(left, deferredQuery, scheduledIds.has(left.id), favoriteIds.has(left.id));
        const rightScore = getMatchScore(right, deferredQuery, scheduledIds.has(right.id), favoriteIds.has(right.id));
        return rightScore - leftScore
          || compareCourseCatalogOrderForQuery(left, right, deferredQuery)
          || getOpenSeats(right) - getOpenSeats(left);
      });

      return scopedResults.slice(0, SEARCH_RESULT_LIMIT);
    } catch (error) {
      console.error("Failed to build visible course results.", error, searchableCourses);
      return [] as Course[];
    }
  }, [
    courseSearchIndex,
    deferredQuery,
    searchableCourses,
    effectiveDeferredSearchMode,
    excludeFriday,
    exactCourseIntent,
    favoriteIds,
    hasDeferredSearchIntent,
    hideConflicts,
    openSeatsOnly,
    parsedQuery,
    scheduled,
    scheduledIds,
    selectedAttributeKey,
    sortMode,
    timePreset,
  ]);

  useEffect(() => {
    const normalizedQuery = normalizeSearchHistoryValue(query);
    const normalizedDeferredQuery = normalizeSearchHistoryValue(deferredQuery);

    if (!normalizedQuery || normalizedQuery !== normalizedDeferredQuery) return;
    if (normalizedDeferredQuery.length < 3 && !isDirectCrnQuery(normalizedDeferredQuery)) return;
    if (showLiveSearchLoading || results.length === 0) return;
    if (lastRecordedSearchRef.current === normalizedDeferredQuery) return;

    const timer = window.setTimeout(() => {
      rememberSearch(normalizedDeferredQuery);
      lastRecordedSearchRef.current = normalizedDeferredQuery;
    }, 450);

    return () => window.clearTimeout(timer);
  }, [deferredQuery, query, rememberSearch, results.length, showLiveSearchLoading]);

  const filterCount = [
    openSeatsOnly || parsedQuery.openOnly,
    hideConflicts,
    excludeFriday,
    timePreset !== "all",
    selectedAttributeKey !== "all",
    parsedQuery.linkedOnly,
    parsedQuery.dayFilters.length > 0,
    Boolean(parsedQuery.scheduleType),
    Boolean(parsedQuery.attribute),
  ].filter(Boolean).length;

  const resultContextText = useMemo(() => {
    const fragments = [];
    if (effectiveDeferredSearchMode === "crn") fragments.push("CRN lookup");
    if (hideConflicts) fragments.push("conflict-free");
    if (openSeatsOnly || parsedQuery.openOnly) fragments.push("open seats only");
    if (excludeFriday) fragments.push("no Friday");
    if (timePreset !== "all") fragments.push(timePreset);
    if (selectedAttribute) fragments.push(selectedAttribute.label);
    if (parsedQuery.attribute) fragments.push(`attribute ${parsedQuery.attribute}`);
    if (parsedQuery.linkedOnly) fragments.push("linked sections");
    if (parsedQuery.dayFilters.length > 0) fragments.push(`days ${parsedQuery.dayFilters.join("/")}`);
    return fragments.length > 0 ? fragments.join(" • ") : "best matches";
  }, [effectiveDeferredSearchMode, excludeFriday, hideConflicts, openSeatsOnly, parsedQuery, selectedAttribute, timePreset]);

  const comparisonText = useMemo(
    () => getShareComparison(scheduled, compareCode),
    [compareCode, scheduled],
  );
  const mostCommonCourseSuggestion = useMemo(
    () => getMostCommonCourseSuggestion(effectiveCourses, universityId),
    [effectiveCourses, universityId],
  );
  const mostCommonCrnSuggestion = hintCrnSuggestion;
  const hasLinkedResults = useMemo(
    () => results.some((course) =>
      course.isSectionLinked || (linkedSectionIndex.get(course.id)?.length ?? 0) > 0,
    ),
    [linkedSectionIndex, results],
  );
  const personalizedSearchExamples = useMemo(() => {
    const sortedHistory = [...searchHistoryEntries].sort((left, right) =>
      right.count - left.count
      || right.lastUsedAt.localeCompare(left.lastUsedAt),
    );
    const suggestions: SearchSuggestion[] = [];
    const seen = new Set<string>();

    sortedHistory.forEach((entry) => {
      if (suggestions.length >= 3) return;
      const suggestion = resolvePersonalizedSearchSuggestion(
        entry.value,
        effectiveCourses,
        availableAttributes,
      );
      if (!suggestion) return;

      const key = `${suggestion.kind}:${suggestion.value.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      suggestions.push(suggestion);
    });

    const fallbackSuggestions: SearchSuggestion[] = [
      { label: mostCommonCourseSuggestion, value: mostCommonCourseSuggestion, kind: "course" },
      ...(mostCommonCrnSuggestion
        ? [{ label: `CRN ${mostCommonCrnSuggestion}`, value: String(mostCommonCrnSuggestion), kind: "crn" as const }]
        : []),
      availableAttributes[0]
        ? { label: `attr:${availableAttributes[0].label}`, value: `attr:${availableAttributes[0].label}`, kind: "attribute" as const }
        : { label: "prof:smith", value: "prof:smith", kind: "professor" as const },
    ];

    fallbackSuggestions.forEach((suggestion) => {
      if (suggestions.length >= 3) return;
      const key = `${suggestion.kind}:${suggestion.value.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      suggestions.push(suggestion);
    });

    return suggestions.slice(0, 3);
  }, [
    availableAttributes,
    effectiveCourses,
    mostCommonCourseSuggestion,
    mostCommonCrnSuggestion,
    searchHistoryEntries,
  ]);
  const personalizedPrimaryCourseSuggestion = useMemo(
    () => personalizedSearchExamples.find((example) => example.kind === "course")?.label ?? mostCommonCourseSuggestion,
    [mostCommonCourseSuggestion, personalizedSearchExamples],
  );
  const searchExamples = useMemo(
    () => personalizedSearchExamples.map((example) => ({
      label: example.label,
      value: example.value,
    })),
    [personalizedSearchExamples],
  );
  const searchPlaceholder = mostCommonCrnSuggestion
    ? `Search ${personalizedPrimaryCourseSuggestion} or CRN ${mostCommonCrnSuggestion}`
    : `Search ${personalizedPrimaryCourseSuggestion}`;
  const showBootstrapSkeleton = !hasSearchIntent
    && searchableCourses.length === 0
    && (catalogLoading || catalogRecoveryLoading);

  const handleAddBlock = () => {
    const days = parseDayFilters(blockDays);
    if (!days.length || !blockStart || !blockEnd) return;
    onAddBlockedTime({
      label: blockLabel.trim() || "Blocked",
      days,
      start: blockStart,
      end: blockEnd,
    });
  };

  const handleCopyShareCode = async () => {
    const code = encodeScheduleShare(scheduled);
    try {
      await navigator.clipboard.writeText(code);
      setShareStatus("Copied schedule code.");
    } catch {
      setCompareCode(code);
      setShareStatus("Copy blocked by browser, code placed below.");
    }
  };

  const modalStyle = {
    overlay: {
      position: "fixed" as const,
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 99999,
    },
    box: {
      backgroundColor: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      minWidth: "340px",
      maxWidth: "500px",
      width: "90%",
      maxHeight: "82vh",
      display: "flex",
      flexDirection: "column" as const,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    },
  };

  const CourseItem = ({ course }: { course: Course }) => {
    const inSchedule = scheduledIds.has(course.id);
    const hasConflict = !inSchedule && courseConflictsWithSchedule(course, scheduled);
    const linkedSections = linkedSectionIndex.get(course.id) ?? [];
    const hasLinkedPeers = linkedSections.length > 0;
    const isLinkedFocus = activeLinkedIds.has(course.id);
    const isLinkedSource = activeLinkedCourseId === course.id;
    const isLinkedPeer = isLinkedFocus && !isLinkedSource;
    const isLinkedFromSchedule = !isLinkedFocus && !inSchedule && scheduledLinkedIds.has(course.id) && hasLinkedPeers;
    const linkedCrns = linkedSections.map((linkedCourse) => linkedCourse.crn).filter(Boolean);
    const role = getSectionRole(course);
    const linkedLectures = linkedSections.filter((linkedCourse) => getSectionRole(linkedCourse) === "lecture");
    const linkedNonLectures = linkedSections.filter((linkedCourse) => getSectionRole(linkedCourse) !== "lecture");
    const canAddLinkedLecture = role !== "lecture"
      && linkedLectures.length === 1
      && !scheduledIds.has(linkedLectures[0].id);
    const linkedGuidance = role === "lecture" && linkedNonLectures.length > 0
      ? `Pick one ${linkedNonLectures.some((item) => getSectionRole(item) === "recitation") ? "recitation" : "lab"} too`
      : linkedLectures.length > 0
        ? `With lecture ${linkedLectures.map((item) => item.crn).join(", ")}`
        : "";
    const meetingSummary = getMeetingSummary(course);
    const primaryLocation = getPrimaryMeetingLocation(course);
    const seatStatus = getSeatStatusSummary(course);

    const handleAddLinkedLecture = () => {
      if (!canAddLinkedLecture) return;
      onToggleSchedule(linkedLectures[0]);
    };

    return (
      <li
        className={`resultItem${inSchedule ? " isScheduled" : ""}${hasConflict ? " isWarning" : ""}${hasLinkedPeers ? " isLinked" : ""}${isLinkedFocus ? " isLinkedFocus" : ""}${isLinkedSource ? " isLinkedSource" : ""}${isLinkedPeer ? " isLinkedPeer" : ""}${isLinkedFromSchedule ? " isLinkedFromSchedule" : ""}`}
        onMouseEnter={() => {
          onPreviewCourse?.(course);
          setActiveLinkedCourseId(hasLinkedPeers ? course.id : null);
        }}
        onMouseLeave={() => {
          onPreviewCourse?.(null);
          setActiveLinkedCourseId(null);
        }}
      >
        <div className="resultItem__header">
          <button
            className="resultMain"
            type="button"
            onClick={() => onSelectCourse(course)}
            title="Open course details"
          >
            <div className="resultMain__line1">
              <span className="resultMain__code">{course.code}</span>
              <span className="resultMain__title">{course.title}</span>
            </div>
            <div className="resultMain__meta">
              <span>{course.instructor || "TBA"}</span>
              <span>{course.campus || "Campus TBA"}</span>
              <span>Sec {course.section || "-"}</span>
            </div>
            <div className="resultMain__line2">{meetingSummary}</div>
            <div className="resultMain__insights">
              {primaryLocation ? <span className="resultPill">{primaryLocation}</span> : null}
              <span className="resultPill">{getSectionRoleLabel(course)}</span>
              {seatStatus ? <span className="resultPill">{seatStatus}</span> : null}
            </div>
          </button>
          <div className="resultItem__actions">
            <button
              className={`resultAction ${inSchedule ? "isOn" : ""}`}
              type="button"
              onClick={() => onToggleSchedule(course)}
              title={inSchedule ? "Remove from schedule" : "Add to schedule"}
            >
              {inSchedule ? "Added" : "Add"}
            </button>
          </div>
        </div>
        {hasLinkedPeers ? (
          <div className="resultLinked">
            <span className="resultLinked__badge">Linked</span>
            <span className="resultLinked__text">
              {linkedCrns.length > 0
                ? `CRNs ${linkedCrns.join(", ")}`
                : `Group ${course.linkIdentifier ?? course.section}`}
            </span>
            {linkedGuidance ? <span className="resultLinked__hint">{linkedGuidance}</span> : null}
            {canAddLinkedLecture ? (
              <button
                type="button"
                className="resultLinked__action"
                onClick={handleAddLinkedLecture}
              >
                Add linked lecture
              </button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  const scheduleStudioSection = (
    <div className="scheduleStudio">
      <div className="scheduleStudio__header">
        <div>
          <div className="rightPanel__eyebrow">Schedule studio</div>
          <div className="scheduleStudio__title">Compare schedules</div>
        </div>
        <button
          className="studioGhostButton"
          type="button"
          onClick={onClearActiveSchedule}
          disabled={scheduled.length === 0}
        >
          Clear current
        </button>
      </div>
      <div className="slotRail">
        {slotSummaries.map((summary) => (
          <div
            key={summary.slot}
            className={`slotCard${activeSlot === summary.slot ? " isActive" : ""}`}
          >
            <button
              type="button"
              className="slotCard__main"
              onClick={() => onSlotChange(summary.slot)}
            >
              <div className="slotCard__top">
                <span>Schedule {summary.slot}</span>
                <span className="slotCard__badge">
                  {summary.courseCount === 0 ? "Blank" : `${summary.courseCount} classes`}
                </span>
              </div>
              <div className="slotCard__value">{summary.credits} cr</div>
              <div className="slotCard__meta">
                {summary.dayCount} d â€¢ {summary.conflictCount === 0 ? "Clear" : `${summary.conflictCount} overlaps`}
              </div>
              {summary.earliestStart && summary.latestEnd ? (
                <div className="slotCard__sub">
                  {formatTime(summary.earliestStart)} - {formatTime(summary.latestEnd)}
                </div>
              ) : null}
            </button>
            {activeSlot === summary.slot ? (
              <span className="slotCard__current">Current</span>
            ) : (
              <button
                className="slotCard__clone"
                type="button"
                onClick={() => onCloneActiveSchedule(summary.slot)}
                disabled={scheduled.length === 0}
              >
                Clone current
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const searchStudioSection = (
    <div className="searchStudio">
      <div className="searchStudio__header">
        <div className="searchStudio__title">Search sections</div>
        <select
          className="searchSort"
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as SortMode)}
          aria-label="Sort results"
        >
          <option value="course">Course order</option>
          <option value="match">Best match</option>
          <option value="earliest">Earliest start</option>
          <option value="latest">Latest start</option>
          <option value="openSeats">Open seats first</option>
        </select>
      </div>

      <input
        className="searchBox"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
      />
      <div className="searchHint">
        Tokens: <code>dept:cmps</code>, <code>prof:smith</code>, <code>day:mw</code>, <code>open</code>, <code>linked</code>, <code>type:lab</code>
      </div>

      <div className="smartFilters">
        <button
          type="button"
          className={`smartFilter${openSeatsOnly ? " isActive" : ""}`}
          onClick={() => setOpenSeatsOnly((current) => !current)}
        >
          Open seats
        </button>
        <button
          type="button"
          className={`smartFilter${hideConflicts ? " isActive" : ""}`}
          onClick={() => setHideConflicts((current) => !current)}
        >
          Hide conflicts
        </button>
        <button
          type="button"
          className={`smartFilter${excludeFriday ? " isActive" : ""}`}
          onClick={() => setExcludeFriday((current) => !current)}
        >
          No Friday
        </button>
        <select
          className="smartFilterSelect"
          value={timePreset}
          onChange={(event) => setTimePreset(event.target.value as TimePreset)}
          aria-label="Time preference"
        >
          <option value="all">Any time</option>
          <option value="morning">Morning only</option>
          <option value="afternoon">Afternoon only</option>
          <option value="evening">Evening only</option>
        </select>
      </div>

      <div className="searchSummary">
        <span>{filterCount} active filters</span>
        <span>{resultContextText}</span>
      </div>

      <div className="miniStats">
        <div className="miniStats__item">
          <div className="miniStats__label">Selected</div>
          <div className="miniStats__value">{scheduled.length}</div>
        </div>
        <div className="miniStats__item">
          <div className="miniStats__label">Avg difficulty</div>
          <div className="miniStats__value">
            {averageDifficulty == null ? "â€”" : averageDifficulty.toFixed(2)}
          </div>
        </div>
        <div className="miniStats__item">
          <div className="miniStats__label">Credits</div>
          <div className="miniStats__value">{totalCredits}</div>
        </div>
      </div>
    </div>
  );

  const primaryResultsSection = (
    <div className="resultsSection resultsSection--primary">
      <div className="sectionTitle">
        Results
        {hasSearchIntent ? <span className="sectionCount">{results.length}</span> : null}
      </div>
      {hasLinkedResults ? (
        <div className="linkedNotice">
          Linked sections need the lecture plus one matching recitation or lab. Use the linked CRNs shown on each row before registering.
        </div>
      ) : null}
      {showLiveSearchLoading ? (
        <div className="emptyState">
          <strong>Searching live sections…</strong>
          <span>The planner is checking the current university and term directly so you do not get stuck waiting for the full snapshot.</span>
        </div>
      ) : showBootstrapSkeleton ? (
        <ul className="resultList resultList--compact resultList--skeleton" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={`skeleton-${index}`} className="resultItem resultItem--skeleton">
              <div className="resultItem__header">
                <div className="resultMain">
                  <div className="resultMain__line1">
                    <span className="resultSkeleton resultSkeleton--code" />
                    <span className="resultSkeleton resultSkeleton--title" />
                  </div>
                  <div className="resultMain__meta">
                    <span className="resultSkeleton resultSkeleton--meta" />
                    <span className="resultSkeleton resultSkeleton--metaShort" />
                  </div>
                </div>
                <div className="resultItem__actions">
                  <span className="resultSkeleton resultSkeleton--action" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : searchableCourses.length === 0 && !query.trim() ? (
        <div className="emptyState">
          <strong>Start with a search.</strong>
          <span>Type a course code, title, instructor, or CRN and the planner will search the selected semester directly.</span>
        </div>
      ) : !hasSearchIntent ? (
        <div className="emptyState">
          <strong>Start with a search or a constraint.</strong>
          <span>
            {compactMobileHome
              ? "Type a course code, title, instructor, or CRN to start adding sections."
              : "Type a course, or use the smart filters above to shape the schedule you actually want."}
          </span>
        </div>
      ) : results.length === 0 ? (
        <div className="emptyState">
          <strong>No matches fit this direction.</strong>
          <span>Try removing one constraint, broadening the query, or cloning into another schedule slot to explore a new path.</span>
        </div>
      ) : (
        <ul className="resultList resultList--compact">
          {results.map((course) => (
            <CourseItem key={course.id} course={course} />
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <aside className="rightPanel">
      {!compactMobileHome ? (
      <div className="rightPanel__top">
        <div className="scheduleStudio">
          <div className="scheduleStudio__header">
            <div>
              <div className="rightPanel__eyebrow">Schedule studio</div>
              <div className="scheduleStudio__title">Compare schedules</div>
            </div>
            <button
              className="studioGhostButton"
              type="button"
              onClick={onClearActiveSchedule}
              disabled={scheduled.length === 0}
            >
              Clear current
            </button>
          </div>
          <div className="slotRail">
            {slotSummaries.map((summary) => (
              <div
                key={summary.slot}
                className={`slotCard${activeSlot === summary.slot ? " isActive" : ""}`}
              >
                <button
                  type="button"
                  className="slotCard__main"
                  onClick={() => onSlotChange(summary.slot)}
                >
                  <div className="slotCard__top">
                    <span>Schedule {summary.slot}</span>
                    <span className="slotCard__badge">
                      {summary.courseCount === 0 ? "Blank" : `${summary.courseCount} classes`}
                    </span>
                  </div>
                  <div className="slotCard__value">{summary.credits} cr</div>
                  <div className="slotCard__meta">
                    {summary.dayCount} d • {summary.conflictCount === 0 ? "Clear" : `${summary.conflictCount} overlaps`}
                  </div>
                  {summary.earliestStart && summary.latestEnd ? (
                    <div className="slotCard__sub">
                      {formatTime(summary.earliestStart)} - {formatTime(summary.latestEnd)}
                    </div>
                  ) : null}
                </button>
                {activeSlot === summary.slot ? (
                  <span className="slotCard__current">Current</span>
                ) : (
                  <button
                    className="slotCard__clone"
                    type="button"
                    onClick={() => onCloneActiveSchedule(summary.slot)}
                    disabled={scheduled.length === 0}
                  >
                    Clone current
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      ) : null}

      <div className="rightPanel__scroll">
        <section className="searchHeroCard">
          <div className="rightPanel__eyebrow">Find sections</div>
          <div className="searchHeroCard__title">{compactMobileHome ? "Add courses" : "Search courses"}</div>
          {!compactMobileHome ? (
            <div className="searchHeroCard__subtitle">
              Search by course code, title, instructor, or CRN in the same bar, then add the section straight to the weekly planner.
            </div>
          ) : null}
          <div className="searchHeroCard__inputWrap">
            {!query ? (
              <div className="searchHeroCard__ghostHint" aria-hidden="true">
                <span className="searchHeroCard__ghostHintMain">Try {personalizedPrimaryCourseSuggestion}</span>
                {mostCommonCrnSuggestion ? (
                  <span className="searchHeroCard__ghostHintMain searchHeroCard__ghostHintMain--secondary">
                    OR CRN {mostCommonCrnSuggestion}
                  </span>
                ) : null}
              </div>
            ) : null}
            <input
              id="course-search-box"
              className={`searchHeroCard__input${query ? "" : " hasNoClear"}`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              inputMode={effectiveSearchMode === "crn" ? "numeric" : "search"}
              placeholder={query ? searchPlaceholder : ""}
            />
            {query ? (
              <button
                type="button"
                className="searchHeroCard__clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                Clear
              </button>
            ) : null}
          </div>
          {!compactMobileHome && !hasSearchIntent ? (
            <div className="searchHeroCard__examples" aria-label="Popular search examples">
              {searchExamples.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className="searchHeroCard__example"
                  onClick={() => setQuery(example.value)}
                >
                  {example.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {primaryResultsSection}

        {!compactMobileHome ? (
        <section
          className="searchControlsCard"
          onMouseEnter={() => {
            onHoverCourse(null);
            onPreviewCourse?.(null);
            setActiveLinkedCourseId(null);
          }}
          onFocusCapture={() => {
            onHoverCourse(null);
            onPreviewCourse?.(null);
            setActiveLinkedCourseId(null);
          }}
        >
          <div className="searchControlsCard__row">
            <div className="searchControlsCard__label">Sort results</div>
            <select
              className="searchSort"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              aria-label="Sort results"
            >
              <option value="course">Course order</option>
              <option value="match">Best match</option>
              <option value="earliest">Earliest start</option>
              <option value="latest">Latest start</option>
              <option value="openSeats">Open seats first</option>
            </select>
          </div>
          <div className="searchHint">
            Tokens: <code>dept:cmps</code>, <code>prof:smith</code>, <code>crn:20798</code>, <code>day:mw</code>, <code>open</code>, <code>linked</code>, <code>type:lab</code>, <code>attr:writing</code>
          </div>

          <div className="smartFilters">
            <button
              type="button"
              className={`smartFilter${openSeatsOnly ? " isActive" : ""}`}
              onClick={() => setOpenSeatsOnly((current) => !current)}
            >
              Open seats
            </button>
            <button
              type="button"
              className={`smartFilter${hideConflicts ? " isActive" : ""}`}
              onClick={() => setHideConflicts((current) => !current)}
            >
              Hide conflicts
            </button>
            <button
              type="button"
              className={`smartFilter${excludeFriday ? " isActive" : ""}`}
              onClick={() => setExcludeFriday((current) => !current)}
            >
              No Friday
            </button>
            <select
              className="smartFilterSelect"
              value={timePreset}
              onChange={(event) => setTimePreset(event.target.value as TimePreset)}
              aria-label="Time preference"
            >
              <option value="all">Any time</option>
              <option value="morning">Morning only</option>
              <option value="afternoon">Afternoon only</option>
              <option value="evening">Evening only</option>
            </select>
            <select
              className="smartFilterSelect smartFilterSelect--attribute"
              value={selectedAttributeKey}
              onChange={(event) => setSelectedAttributeKey(event.target.value)}
              aria-label="Attribute requirement"
              disabled={availableAttributes.length === 0}
            >
              <option value="all">
                {availableAttributes.length ? "Any attribute" : "No attributes listed"}
              </option>
              {availableAttributes.map((attribute) => (
                <option key={attribute.key} value={attribute.key}>
                  {attribute.label} ({attribute.count})
                </option>
              ))}
            </select>
          </div>
          {topAttributeFilters.length > 0 ? (
            <div className="attributeQuickFilters" aria-label="Common attributes in this term">
              <span className="attributeQuickFilters__label">Attributes</span>
              {topAttributeFilters.map((attribute) => (
                <button
                  key={attribute.key}
                  type="button"
                  className={`attributeQuickFilters__chip${selectedAttributeKey === attribute.key ? " isActive" : ""}`}
                  onClick={() =>
                    setSelectedAttributeKey((current) =>
                      current === attribute.key ? "all" : attribute.key,
                    )
                  }
                  title={`${attribute.label}: ${attribute.count} sections in this term`}
                >
                  <span>{attribute.label}</span>
                  <em>{attribute.count}</em>
                </button>
              ))}
            </div>
          ) : null}

          <div className="searchSummary">
            <span>{filterCount} active filters</span>
            <span>{resultContextText}</span>
          </div>

          <div className="miniStats">
            <div className="miniStats__item">
              <div className="miniStats__label">Selected</div>
              <div className="miniStats__value">{scheduled.length}</div>
            </div>
            <div className="miniStats__item">
              <div className="miniStats__label">Avg difficulty</div>
              <div className="miniStats__value">
                {averageDifficulty == null ? "—" : averageDifficulty.toFixed(2)}
              </div>
            </div>
            <div className="miniStats__item">
              <div className="miniStats__label">Credits</div>
              <div className="miniStats__value">{totalCredits}</div>
            </div>
          </div>

          <div className="plannerAutomation">
            <div className="qualityCard">
              <div>
                <span className="qualityCard__label">Schedule health</span>
                <strong>{scheduleMetrics.score}/100</strong>
              </div>
              <div className="qualityCard__bar" aria-hidden="true">
                <span style={{ width: `${scheduleMetrics.score}%` }} />
              </div>
              <p>
                {scheduleMetrics.registrationReady
                  ? "Looks registration-ready."
                  : scheduleMetrics.warnings.join(", ") || "Add courses to calculate quality."}
              </p>
            </div>

            <div className="blockBuilder">
              <div className="blockBuilder__title">Block busy times</div>
              <div className="blockBuilder__grid">
                <input
                  value={blockLabel}
                  onChange={(event) => setBlockLabel(event.target.value)}
                  placeholder="Work"
                  aria-label="Blocked time label"
                />
                <input
                  value={blockDays}
                  onChange={(event) => setBlockDays(event.target.value)}
                  placeholder="MWF"
                  aria-label="Blocked days"
                />
                <input
                  type="time"
                  value={blockStart}
                  onChange={(event) => setBlockStart(event.target.value)}
                  aria-label="Blocked start time"
                />
                <input
                  type="time"
                  value={blockEnd}
                  onChange={(event) => setBlockEnd(event.target.value)}
                  aria-label="Blocked end time"
                />
                <button type="button" onClick={handleAddBlock}>Add block</button>
              </div>
              {blockedTimes.length ? (
                <div className="blockChips">
                  {blockedTimes.map((block) => (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() => onRemoveBlockedTime(block.id)}
                      title="Remove blocked time"
                    >
                      {block.label}: {block.days.join("")} {formatTime(block.start)}-{formatTime(block.end)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="scheduleGenerator">
              <button
                className="generatorButton"
                type="button"
                onClick={() => onGenerateSchedules({ openSeatsOnly, excludeFriday })}
                disabled={scheduled.length + favorites.length === 0}
              >
                Generate best schedules
              </button>
              {generatedSchedules.length ? (
                <div className="generatedList">
                  {generatedSchedules.map((option) => (
                    <button
                      key={option.id}
                      className="generatedCard"
                      type="button"
                      onClick={() => onApplyGeneratedSchedule(option)}
                    >
                      <span>{option.label}</span>
                      <strong>{option.metrics.score}/100</strong>
                      <small>{option.courses.length} classes, {option.metrics.campusDays} campus days</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="shareCompare">
              <button
                type="button"
                onClick={handleCopyShareCode}
                disabled={scheduled.length === 0}
              >
                Copy schedule code
              </button>
              <textarea
                value={compareCode}
                onChange={(event) => setCompareCode(event.target.value)}
                placeholder="Paste another schedule code to compare"
                aria-label="Compare schedule share code"
              />
              {shareStatus || comparisonText ? (
                <span>{comparisonText || shareStatus}</span>
              ) : null}
            </div>
          </div>
        </section>
        ) : null}

        {!compactMobileHome ? <hr className="divider" /> : null}
        {!compactMobileHome ? (
        <div className="resultsSection resultsSection--saved">
          <div className="sectionTitle">
            Saved Courses
            {favorites.length > 0 ? <span className="sectionCount">{favorites.length}</span> : null}
          </div>
          {favorites.length === 0 ? (
            <div className="emptyState">
              <strong>No saved courses yet.</strong>
              <span>Use Save on any result card to build a shortlist before you commit to a schedule.</span>
            </div>
          ) : (
            <ul className="resultList">
              {favorites.map((course) => (
                <CourseItem key={course.id} course={course} />
              ))}
            </ul>
          )}
        </div>
        ) : null}
      </div>

      {viewModal && (
        <div style={modalStyle.overlay} onClick={() => setViewModal(null)}>
          <div style={modalStyle.box} onClick={(event) => event.stopPropagation()}>
            <div style={{ padding: "18px 20px 0", flexShrink: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "15px",
                      color: "var(--text)",
                    }}
                  >
                    {viewModal.course.code}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      marginTop: "2px",
                    }}
                  >
                    {viewModal.course.title}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewModal(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    fontSize: "18px",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {(["reviews", "syllabus"] as ModalTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setModalTab(tab)}
                    style={{
                      padding: "7px 16px",
                      fontSize: "13px",
                      fontWeight: 600,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: modalTab === tab ? "var(--text)" : "var(--muted)",
                      borderBottom:
                        modalTab === tab
                          ? "2px solid var(--brand-primary)"
                          : "2px solid transparent",
                      marginBottom: "-1px",
                      transition: "all 0.15s",
                      textTransform: "capitalize",
                    }}
                  >
                    {tab === "reviews" ? "⭐ Reviews" : "📄 Syllabus"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}>
              {modalTab === "reviews" && (
                <>
                  {modalAvg && modalAvg.count > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: "16px",
                        marginBottom: "16px",
                        padding: "12px",
                        backgroundColor: "var(--bg)",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {[
                        { val: modalAvg.rating, label: "Rating" },
                        { val: modalAvg.difficulty, label: "Difficulty" },
                        { val: modalAvg.count, label: "Reviews" },
                      ].map(({ val, label }) => (
                        <div key={label} style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: "28px",
                              fontWeight: "bold",
                              color: "var(--text)",
                            }}
                          >
                            {val}
                          </div>
                          <div
                            style={{ fontSize: "11px", color: "var(--muted)" }}
                          >
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {modalLoading ? (
                    <div
                      style={{
                        textAlign: "center",
                        color: "var(--muted)",
                        padding: "20px",
                      }}
                    >
                      Loading...
                    </div>
                  ) : modalRatings.length === 0 ? (
                    <div
                      style={{
                        textAlign: "center",
                        color: "var(--muted)",
                        padding: "20px",
                      }}
                    >
                      No reviews yet.
                      <div style={{ marginTop: "8px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setViewModal(null);
                            navigate(`/reviews?course=${encodeURIComponent(viewModal.course.code)}`);
                          }}
                          style={{
                            fontSize: "12px",
                            color: "var(--brand-primary)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          Be the first to review!
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      {modalRatings.map((rating) => (
                        <div
                          key={rating.id}
                          style={{
                            backgroundColor: "var(--bg)",
                            borderRadius: "8px",
                            padding: "12px",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "12px",
                              marginBottom: rating.review ? "8px" : 0,
                            }}
                          >
                            <span
                              style={{
                                backgroundColor:
                                  rating.rating >= 4
                                    ? "#22c55e"
                                    : rating.rating >= 3
                                      ? "#f59e0b"
                                      : "#ef4444",
                                color: "#fff",
                                fontWeight: "bold",
                                fontSize: "13px",
                                padding: "2px 8px",
                                borderRadius: "4px",
                              }}
                            >
                              {rating.rating}/5
                            </span>
                            {rating.difficulty > 0 && (
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "var(--muted)",
                                }}
                              >
                                Difficulty: {rating.difficulty}/5
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: "11px",
                                color: "var(--muted)",
                                marginLeft: "auto",
                              }}
                            >
                              {new Date(rating.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {rating.review && (
                            <p
                              style={{
                                margin: 0,
                                fontSize: "13px",
                                color: "var(--text)",
                                lineHeight: 1.6,
                              }}
                            >
                              {rating.review}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setViewModal(null);
                      navigate(`/reviews?course=${encodeURIComponent(viewModal.course.code)}`);
                    }}
                    style={{
                      marginTop: "16px",
                      width: "100%",
                      padding: "9px",
                      backgroundColor: "var(--brand-primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: "bold",
                    }}
                  >
                    ✏️ Write a Review
                  </button>
                </>
              )}

              {modalTab === "syllabus" && (
                <div>
                  <div
                    style={{
                      backgroundColor: "var(--bg)",
                      borderRadius: "10px",
                      padding: "16px",
                      marginBottom: "16px",
                      border: "1px dashed var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--text)",
                        marginBottom: "6px",
                      }}
                    >
                      📤 Upload Syllabus
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--muted)",
                        marginBottom: "12px",
                      }}
                    >
                      PDF only, max 10MB. Anyone logged in can upload.
                    </div>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "10px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        backgroundColor: uploading
                          ? "var(--border)"
                          : "var(--brand-primary)",
                        color: "#fff",
                        fontSize: "13px",
                        fontWeight: 600,
                        opacity: uploading ? 0.7 : 1,
                        transition: "all 0.2s",
                      }}
                    >
                      {uploading ? "Uploading..." : "+ Choose PDF"}
                      <input
                        type="file"
                        accept="application/pdf"
                        style={{ display: "none" }}
                        disabled={uploading}
                        onChange={handleSyllabusUpload}
                      />
                    </label>
                    {uploadError && (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "12px",
                          color: "#ef4444",
                        }}
                      >
                        ⚠ {uploadError}
                      </div>
                    )}

                    {uploadSuccess && (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "12px",
                          color: "#22c55e",
                        }}
                      >
                        Approved by AI and added to available syllabi.
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      marginBottom: "10px",
                    }}
                  >
                    Available Syllabi
                  </div>

                  {syllabusLoading ? (
                    <div
                      style={{
                        textAlign: "center",
                        color: "var(--muted)",
                        padding: "20px",
                      }}
                    >
                      Loading...
                    </div>
                  ) : syllabi.length === 0 ? (
                    <div
                      style={{
                        textAlign: "center",
                        color: "var(--muted)",
                        padding: "24px 0",
                        fontSize: "13px",
                      }}
                    >
                      No syllabus uploaded yet.
                      <br />
                      <span style={{ fontSize: "11px" }}>
                        Be the first to share one!
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {syllabi.map((syllabus) => (
                        <div
                          key={syllabus.id}
                          style={{
                            backgroundColor: "var(--bg)",
                            borderRadius: "8px",
                            padding: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "13px",
                                color: "var(--text)",
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              📄 {syllabus.file_name}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--muted)",
                                marginTop: "3px",
                              }}
                            >
                              By {syllabus.uploaded_by} • {new Date(syllabus.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <a
                            href={syllabus.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "5px 12px",
                              backgroundColor: "var(--accent)",
                              color: "#fff",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              textDecoration: "none",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            View PDF
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export const RightSearchPanel = memo(RightSearchPanelComponent);
