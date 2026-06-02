import { lazy, Suspense, useMemo, useState, useEffect, useCallback, useRef, startTransition } from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import type { Course } from "./types";
import { TopNav } from "./components/TopNav";
import { LeftInfoPanel } from "./components/LeftInfoPanel";
import { ScheduleGrid } from "./components/ScheduleGrid";
import { RightSearchPanel } from "./components/RightSearchPanel";
import { PlannerErrorBoundary } from "./components/PlannerErrorBoundary.tsx";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import { supabase } from "./supabaseClient.ts";
import AdminRoute from "./components/AdminRoute";
import { API_ROOT as API_URL } from "./config/runtime.ts";
import { mapApiCoursesToCourses, normalizeCourseMeetings, sanitizeCourse, sanitizeCourses } from "./utils/courseApi.ts";
import {
  DEFAULT_UNIVERSITY_ID,
  UNIVERSITY_OPTIONS,
  getUniversityById,
  type UniversityId,
  type UniversityOption,
} from "./config/universities.ts";
import { detectUniversityFromEmail } from "./config/emailDomains.ts";
import { fetchCatalogBootstrap, fetchCourses, fetchTerms, fetchUniversities } from "./utils/catalogApi.ts";
import { useCatalogStatus } from "./hooks/useCatalogStatus.ts";
import { useSessionAccess } from "./hooks/useSessionAccess.ts";
import { primeUniversityCatalogCache } from "./utils/catalogWarmup.ts";
import {
  getCachedCourses,
  getCachedScheduleSnapshot,
  getCachedTerms,
  getStoredTermId,
  getStoredUniversityId,
  setCachedCourses,
  setCachedScheduleSnapshot,
  setCachedTerms,
  setStoredTermId,
  setStoredUniversityId,
} from "./utils/plannerPreferences.ts";
import { timeToMinutes } from "./utils/schedule.ts";
import {
  generateScheduleOptions,
  getScheduleQuality,
  type BlockedTime,
  type GeneratedSchedule,
} from "./utils/smartSchedule.ts";

const CATALOG_POLL_INTERVAL_MS = Number(import.meta.env.VITE_CATALOG_POLL_INTERVAL_MS ?? 300_000);
const PLANNER_SETTINGS_STORAGE_PREFIX = "termer:planner-settings:";
const PHONE_HOME_MEDIA_QUERY = "(max-width: 900px)";

function createEmptySchedules(): Record<number, Course[]> {
  return { 1: [], 2: [], 3: [] };
}

function sanitizeCourseList(courses: unknown): Course[] {
  return sanitizeCourses(courses);
}

function cloneScheduleMap(source?: Record<number, Course[]> | null): Record<number, Course[]> {
  return {
    1: sanitizeCourseList(source?.[1]),
    2: sanitizeCourseList(source?.[2]),
    3: sanitizeCourseList(source?.[3]),
  };
}

function sanitizeScheduleCoursesForContext(
  courses: unknown,
  universityId: string,
  termId: string,
): Course[] {
  return sanitizeCourseList(courses).filter((course) => {
    if (!course?.id || !course.code) return false;
    if (course.universityId && course.universityId !== universityId) return false;
    if (termId && course.termId && course.termId !== termId) return false;
    return true;
  });
}

function sanitizeScheduleSnapshotForContext(
  snapshot: ReturnType<typeof getCachedScheduleSnapshot> | null,
  universityId: string,
  termId: string,
) {
  if (!snapshot) return null;

  const schedules = {
    1: sanitizeScheduleCoursesForContext(snapshot.schedules?.[1], universityId, termId),
    2: sanitizeScheduleCoursesForContext(snapshot.schedules?.[2], universityId, termId),
    3: sanitizeScheduleCoursesForContext(snapshot.schedules?.[3], universityId, termId),
  };
  const validCourseIds = new Set(
    Object.values(schedules)
      .flat()
      .map((course) => course.id)
      .filter(Boolean),
  );
  const colors = Array.isArray(snapshot.colors)
    ? snapshot.colors.filter(
        (entry): entry is [string, string] =>
          Array.isArray(entry)
          && typeof entry[0] === "string"
          && typeof entry[1] === "string"
          && validCourseIds.has(entry[0]),
      )
    : [];

  return {
    schedules,
    colors,
    updatedAt: snapshot.updatedAt,
  };
}

const ReviewsPage = lazy(() => import("./pages/Reviews"));
const PreviousesPage = lazy(() => import("./pages/Previouses.tsx"));
const UpdatePasswordPage = lazy(() => import("./pages/UpdatePassword.tsx"));
const EmptyClassesPage = lazy(() => import("./pages/EmptyClasses.tsx"));
const GPAPage = lazy(() => import("./pages/GPAPage"));
const GradeCalculatorPage = lazy(() => import("./components/GradeCalculator"));
const AdminPortalPage = lazy(() => import("./pages/AdminPortal"));
const AIScheduler = lazy(() =>
  import("./components/AiScheduler.tsx").then((module) => ({
    default: module.AIScheduler,
  })),
);

const COURSE_COLORS = [
  "#1a5fa8",
  "#1a7a45",
  "#6b2d8b",
  "#b35a0a",
  "#0e6b5e",
  "#8a6d0b",
  "#123d6e",
  "#7a1f1f",
  "#1a6e8a",
  "#2d5a1a",
];

type TermOption = { id: string; label: string; isCurrent?: boolean };
type SlotSummary = {
  slot: number;
  courseCount: number;
  credits: number;
  dayCount: number;
  earliestStart: string | null;
  latestEnd: string | null;
  conflictCount: number;
};

function formatCatalogTerms(data: Array<{ code: string; description: string; is_current?: boolean }>) {
  return Array.isArray(data)
    ? data.map((term) => ({
        id: term.code,
        label: term.description,
        isCurrent: Boolean(term.is_current),
      }))
    : [];
}

function isCatalogPlaceholderTerm(term: TermOption | undefined) {
  return /^catalog\b/i.test(String(term?.label ?? "").trim());
}

function mergeVisibleTermSelection(
  terms: TermOption[],
  selectedTermId: string,
  currentTerms: TermOption[],
) {
  if (!selectedTermId || terms.some((term) => term.id === selectedTermId)) {
    return terms;
  }

  const currentSelection = currentTerms.find((term) => term.id === selectedTermId);
  return currentSelection ? [currentSelection, ...terms] : terms;
}

function resolvePreferredTermId(
  universityId: string,
  terms: TermOption[],
  currentSemesterId = "",
  currentCatalogTermId = "",
) {
  const currentSelection = terms.find((term) => term.id === currentSemesterId)?.id;
  if (currentSelection) {
    return currentSelection;
  }

  const storedTermId = getStoredTermId(universityId);
  const storedTerm = terms.find((term) => term.id === storedTermId);
  const currentTerm = terms.find((term) => term.isCurrent)
    ?? terms.find((term) => term.id === currentCatalogTermId);

  if (storedTerm) {
    if (
      currentTerm
      && currentTerm.id !== storedTerm.id
      && isCatalogPlaceholderTerm(storedTerm)
      && !isCatalogPlaceholderTerm(currentTerm)
    ) {
      return currentTerm.id;
    }

    return storedTerm.id;
  }

  return currentTerm?.id
    ?? terms[0]?.id
    ?? "";
}

function hexToRgbTriplet(hex: string) {
  const normalized = hex.replace("#", "");
  const fullHex = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized.padStart(6, "0").slice(0, 6);
  const red = Number.parseInt(fullHex.slice(0, 2), 16);
  const green = Number.parseInt(fullHex.slice(2, 4), 16);
  const blue = Number.parseInt(fullHex.slice(4, 6), 16);
  return `${red}, ${green}, ${blue}`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const fullHex = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized.padStart(6, "0").slice(0, 6);

  return {
    red: Number.parseInt(fullHex.slice(0, 2), 16),
    green: Number.parseInt(fullHex.slice(2, 4), 16),
    blue: Number.parseInt(fullHex.slice(4, 6), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(left: string, right: string, weight = 0.5) {
  const leftRgb = hexToRgb(left);
  const rightRgb = hexToRgb(right);

  return rgbToHex(
    leftRgb.red * (1 - weight) + rightRgb.red * weight,
    leftRgb.green * (1 - weight) + rightRgb.green * weight,
    leftRgb.blue * (1 - weight) + rightRgb.blue * weight,
  );
}

function relativeLuminance(hex: string) {
  const { red, green, blue } = hexToRgb(hex);
  const channelToLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * channelToLinear(red)
    + 0.7152 * channelToLinear(green)
    + 0.0722 * channelToLinear(blue)
  );
}

function buildBrandTokens(brand: NonNullable<UniversityOption["brand"]>) {
  const swatches = [brand.primary, brand.secondary, brand.tertiary].filter(Boolean) as string[];
  const nonLightSwatches = swatches.filter((swatch) => relativeLuminance(swatch) < 0.78);
  const lightSwatches = swatches.filter((swatch) => relativeLuminance(swatch) >= 0.78);

  const action = relativeLuminance(brand.primary) < 0.72
    ? brand.primary
    : nonLightSwatches.find((swatch) => swatch !== brand.primary)
      ?? brand.primary;

  const support = nonLightSwatches.find((swatch) => swatch !== action)
    ?? mixHex(action, "#08131d", 0.2);

  const highlight = lightSwatches[0] ?? mixHex(action, "#ffffff", 0.78);
  const surface = mixHex(action, highlight, highlight.toUpperCase() === "#FFFFFF" ? 0.78 : 0.62);
  const subtle = mixHex(action, highlight, highlight.toUpperCase() === "#FFFFFF" ? 0.9 : 0.78);
  const contrast = relativeLuminance(action) > 0.58 ? "#112032" : "#FFFFFF";

  return {
    action,
    support,
    highlight,
    surface,
    subtle,
    contrast,
  };
}

function coursesConflict(left: Course, right: Course) {
  return left.meetings.some((leftMeeting) =>
    right.meetings.some((rightMeeting) =>
      leftMeeting.days.some((day) => rightMeeting.days.includes(day))
      && (timeToMinutes(leftMeeting.start) ?? 0) < (timeToMinutes(rightMeeting.end) ?? 0)
      && (timeToMinutes(rightMeeting.start) ?? 0) < (timeToMinutes(leftMeeting.end) ?? 0),
    ),
  );
}

function buildSlotSummary(slot: number, courses: Course[]): SlotSummary {
  const daySet = new Set<string>();
  let earliestStart: string | null = null;
  let latestEnd: string | null = null;
  let conflictCount = 0;

  courses.forEach((course, courseIndex) => {
    course.meetings.forEach((meeting) => {
      meeting.days.forEach((day) => daySet.add(day));

      const startMinutes = timeToMinutes(meeting.start);
      const endMinutes = timeToMinutes(meeting.end);

      if (startMinutes !== null) {
        if (!earliestStart || startMinutes < (timeToMinutes(earliestStart) ?? Infinity)) {
          earliestStart = meeting.start;
        }
      }

      if (endMinutes !== null) {
        if (!latestEnd || endMinutes > (timeToMinutes(latestEnd) ?? -Infinity)) {
          latestEnd = meeting.end;
        }
      }
    });

    for (let compareIndex = courseIndex + 1; compareIndex < courses.length; compareIndex += 1) {
      if (coursesConflict(course, courses[compareIndex])) {
        conflictCount += 1;
      }
    }
  });

  return {
    slot,
    courseCount: courses.length,
    credits: courses.reduce((sum, course) => sum + (course.credits ?? 0), 0),
    dayCount: daySet.size,
    earliestStart,
    latestEnd,
    conflictCount,
  };
}

function formatCatalogStatus(university: UniversityOption): string {
  if (!university.updatedAt) {
    return university.note;
  }

  const updated = new Date(university.updatedAt);
  const safeText = Number.isNaN(updated.getTime())
    ? university.note
    : `Updated ${updated.toLocaleString()} | ${university.note}`;

  return safeText;
}

type PlannerSettings = {
  blockedTimes: BlockedTime[];
  lockedCourseIds: string[];
};

function getPlannerSettingsKey(userId: string | null, universityId: string, termId: string) {
  return `${PLANNER_SETTINGS_STORAGE_PREFIX}${userId ?? "guest"}:${universityId}:${termId || "no-term"}`;
}

function readPlannerSettings(key: string): PlannerSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Partial<PlannerSettings>;
    return {
      blockedTimes: Array.isArray(parsed.blockedTimes) ? parsed.blockedTimes : [],
      lockedCourseIds: Array.isArray(parsed.lockedCourseIds) ? parsed.lockedCourseIds : [],
    };
  } catch {
    return { blockedTimes: [], lockedCourseIds: [] };
  }
}

function writePlannerSettings(key: string, settings: PlannerSettings) {
  window.localStorage.setItem(key, JSON.stringify(settings));
}

function uniqueCourses(courses: Course[]) {
  const byId = new Map<string, Course>();
  courses.forEach((course) => byId.set(course.id, course));
  return Array.from(byId.values());
}

function mapAndFilterUniversityCourses(rawCourses: any[], universityId: string) {
  return mapApiCoursesToCourses(rawCourses).filter(
    (course) => course.universityId === universityId,
  );
}

function compactCourseIdentity(course: Course) {
  const department = course.department || course.code.replace(/[0-9].*$/, "");
  const number = course.courseNumber || course.code.replace(/^[A-Za-z\s]+/, "");
  return `${department}${number}`.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function getCourseLookupKeys(course: Course) {
  const universityId = course.universityId || DEFAULT_UNIVERSITY_ID;
  const termId = course.termId || "";
  const compactCode = compactCourseIdentity(course);
  const crn = String(course.crn || "").trim();
  const section = String(course.section || "").trim().toUpperCase();

  return [
    course.id ? `id:${course.id}` : "",
    crn && termId ? `crn:${universityId}:${termId}:${crn}` : "",
    crn ? `crn-any-term:${universityId}:${crn}` : "",
    compactCode && section && termId ? `section:${universityId}:${termId}:${compactCode}:${section}` : "",
    compactCode && section ? `section-any-term:${universityId}:${compactCode}:${section}` : "",
    compactCode && termId ? `code:${universityId}:${termId}:${compactCode}` : "",
    compactCode ? `code-any-term:${universityId}:${compactCode}` : "",
  ].filter(Boolean);
}

function buildCatalogCourseIndex(courses: Course[]) {
  const index = new Map<string, Course>();

  courses.forEach((course) => {
    getCourseLookupKeys(course).forEach((key) => {
      if (!index.has(key)) {
        index.set(key, course);
      }
    });
  });

  return index;
}

function findCatalogCourseMatch(course: Course, catalogIndex: Map<string, Course>) {
  for (const key of getCourseLookupKeys(course)) {
    const catalogCourse = catalogIndex.get(key);
    if (catalogCourse) {
      return { catalogCourse, key };
    }
  }

  return null;
}

function enrichCourseFromCatalog(course: Course, catalogIndex: Map<string, Course>) {
  const normalizedCourse = sanitizeCourse(normalizeCourseMeetings(course));
  const match = findCatalogCourseMatch(normalizedCourse, catalogIndex);

  if (!match) return normalizedCourse;

  const { catalogCourse, key } = match;
  const normalizedCatalogCourse = sanitizeCourse(normalizeCourseMeetings(catalogCourse));

  if (key.startsWith("code:") || key.startsWith("code-any-term:")) {
    return sanitizeCourse({
      ...normalizedCourse,
      universityId: normalizedCourse.universityId || normalizedCatalogCourse.universityId,
      universityName: normalizedCourse.universityName || normalizedCatalogCourse.universityName,
      department: normalizedCourse.department || normalizedCatalogCourse.department,
      courseNumber: normalizedCourse.courseNumber || normalizedCatalogCourse.courseNumber,
      code: normalizedCourse.code || normalizedCatalogCourse.code,
      title: normalizedCatalogCourse.title || normalizedCourse.title,
      credits: normalizedCatalogCourse.credits || normalizedCourse.credits,
      attributes: normalizedCatalogCourse.attributes?.length ? normalizedCatalogCourse.attributes : normalizedCourse.attributes,
      prerequisites: normalizedCatalogCourse.prerequisites || normalizedCourse.prerequisites,
      restrictions: normalizedCatalogCourse.restrictions || normalizedCourse.restrictions,
      meetings: normalizedCatalogCourse.meetings?.length ? normalizedCatalogCourse.meetings : normalizedCourse.meetings,
    });
  }

  return sanitizeCourse({
    ...normalizedCourse,
    ...normalizedCatalogCourse,
    attributes: normalizedCatalogCourse.attributes?.length ? normalizedCatalogCourse.attributes : normalizedCourse.attributes,
    prerequisites: normalizedCatalogCourse.prerequisites || normalizedCourse.prerequisites,
    restrictions: normalizedCatalogCourse.restrictions || normalizedCourse.restrictions,
    meetings: normalizedCatalogCourse.meetings?.length ? normalizedCatalogCourse.meetings : normalizedCourse.meetings,
    capacity: normalizedCatalogCourse.capacity ?? normalizedCourse.capacity,
    difficulty: normalizedCatalogCourse.difficulty || normalizedCourse.difficulty,
    workload: normalizedCatalogCourse.workload || normalizedCourse.workload,
  });
}

function enrichScheduleMapFromCatalog(
  schedules: Record<number, Course[]>,
  catalogIndex: Map<string, Course>,
) {
  return [1, 2, 3].reduce<Record<number, Course[]>>((nextSchedules, slot) => {
    nextSchedules[slot] = (schedules[slot] ?? []).map((course) =>
      enrichCourseFromCatalog(course, catalogIndex),
    );
    return nextSchedules;
  }, createEmptySchedules());
}

function mergeUniversities(
  staticUniversities: UniversityOption[],
  remoteUniversities: UniversityOption[],
) {
  const byId = new Map<string, UniversityOption>();

  staticUniversities.forEach((university) => {
    byId.set(university.id, university);
  });

  remoteUniversities.forEach((university) => {
    const previous = byId.get(university.id);
    byId.set(university.id, {
      ...previous,
      ...university,
      brand: university.brand ?? previous?.brand,
    });
  });

  return staticUniversities.map((university) => byId.get(university.id) ?? university);
}

function RouteFallback() {
  return (
    <div className="routeLoading" role="status" aria-live="polite">
      <div className="routeLoading__badge">Loading view</div>
      <strong>Preparing the next workspace…</strong>
      <span>The planner is keeping this screen light until you open it.</span>
    </div>
  );
}

function buildCourseDataSignature(courses: Course[]) {
  return courses.map((course) => [
    course.id,
    course.crn,
    course.code,
    course.title,
    course.instructor,
    course.campus,
    course.section,
    course.credits,
    `${course.capacity?.enrolled ?? 0}/${course.capacity?.limit ?? 0}`,
    course.prerequisites ?? "",
    course.restrictions ?? "",
    (course.attributes ?? []).join(","),
    course.linkedCourses?.join(",") ?? "",
    (course.meetings ?? [])
      .map((meeting) =>
        `${(meeting.days ?? []).join("")}:${meeting.start ?? ""}-${meeting.end ?? ""}:${meeting.location ?? ""}:${meeting.type ?? ""}`,
      )
      .join(";"),
  ].join("\u001f")).join("\u001e");
}

export default function App() {
  const appName = "Termer";
  const initialUniversityId = getStoredUniversityId();
  const initialSemesters = getCachedTerms(initialUniversityId);
  const initialSemesterId = resolvePreferredTermId(initialUniversityId, initialSemesters);
  const initialCourses = initialSemesterId
    ? getCachedCourses(initialUniversityId, initialSemesterId)
    : [];
  const initialScheduleSnapshot = sanitizeScheduleSnapshotForContext(
    getCachedScheduleSnapshot(
      null,
      initialUniversityId,
      initialSemesterId,
    ),
    initialUniversityId,
    initialSemesterId,
  );

  const [universities, setUniversities] = useState<UniversityOption[]>(UNIVERSITY_OPTIONS);
  const [universityId, setUniversityId] = useState(initialUniversityId);
  const { canChooseAnyUniversity, lockedUniversityId } = useSessionAccess();
  const themeTransitionTimeoutRef = useRef<number | null>(null);
  const previousThemeUniversityRef = useRef(initialUniversityId);
  const [isCompactMobileHome, setIsCompactMobileHome] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(PHONE_HOME_MEDIA_QUERY).matches,
  );
  const currentUniversity = useMemo(
    () => ({
      ...getUniversityById(universityId),
      ...(universities.find((university) => university.id === universityId) ?? {}),
    }),
    [universities, universityId],
  );
  const catalogStatus = useCatalogStatus();
  const catalogStatusSequence = catalogStatus?.sequence ?? 0;
  const catalogStatusHydratedRef = useRef(false);

  const [semesters, setSemesters] = useState<TermOption[]>(initialSemesters);
  const [semesterId, setSemesterId] = useState(initialSemesterId);
  const termRequestIdRef = useRef(0);
  const courseRequestIdRef = useRef(0);
  const courseDataSignatureRef = useRef(buildCourseDataSignature(initialCourses));
  const manualTermSelectionRef = useRef<string | null>(null);
  const semesterIdRef = useRef(initialSemesterId);
  const semestersRef = useRef<TermOption[]>(initialSemesters);
  const [termsLoading, setTermsLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const syncUniversityFromAuthenticatedEmail = useCallback((email: string | null | undefined) => {
    if (canChooseAnyUniversity) return;

    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) return;

    const detection = detectUniversityFromEmail(normalizedEmail);
    if (!detection.allowed || !detection.universityId) return;

    const nextUniversityId = getUniversityById(detection.universityId).id;
    setStoredUniversityId(nextUniversityId);
    const cachedTerms = getCachedTerms(nextUniversityId);
    const cachedTermId = resolvePreferredTermId(nextUniversityId, cachedTerms);
    const cachedCourses = cachedTermId
      ? getCachedCourses(nextUniversityId, cachedTermId)
      : [];
    const hasWarmCatalog = cachedTerms.length > 0 && (!cachedTermId || cachedCourses.length > 0);

    if (hasWarmCatalog) {
      setUniversityId((currentUniversityId) =>
        currentUniversityId === nextUniversityId ? currentUniversityId : nextUniversityId,
      );
      return;
    }

    void primeUniversityCatalogCache(nextUniversityId, { warmAllTerms: false })
      .catch(() => null)
      .finally(() => {
        setUniversityId((currentUniversityId) =>
          currentUniversityId === nextUniversityId ? currentUniversityId : nextUniversityId,
        );
      });
  }, [canChooseAnyUniversity]);

  const handleUniversityChange = useCallback((nextUniversityId: UniversityId) => {
    const resolvedUniversityId = !canChooseAnyUniversity && lockedUniversityId
      ? lockedUniversityId
      : getUniversityById(nextUniversityId).id;

    setStoredUniversityId(resolvedUniversityId);
    setUniversityId((currentUniversityId) =>
      currentUniversityId === resolvedUniversityId ? currentUniversityId : resolvedUniversityId,
    );
  }, [canChooseAnyUniversity, lockedUniversityId]);
  const semesterLabel = useMemo(
    () => semesters.find((semester) => semester.id === semesterId)?.label ?? "Term",
    [semesterId, semesters],
  );
  const lastUpdatedText = useMemo(
    () => formatCatalogStatus(currentUniversity),
    [currentUniversity],
  );

  useEffect(() => {
    semestersRef.current = semesters;
  }, [semesters]);

  useEffect(() => {
    if (!lockedUniversityId || canChooseAnyUniversity) return;
    handleUniversityChange(lockedUniversityId);
  }, [canChooseAnyUniversity, handleUniversityChange, lockedUniversityId]);

  useEffect(() => {
    semesterIdRef.current = semesterId;
  }, [semesterId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(PHONE_HOME_MEDIA_QUERY);
    const syncMobileHomeMode = () => setIsCompactMobileHome(mediaQuery.matches);
    syncMobileHomeMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMobileHomeMode);
      return () => mediaQuery.removeEventListener("change", syncMobileHomeMode);
    }

    mediaQuery.addListener(syncMobileHomeMode);
    return () => mediaQuery.removeListener(syncMobileHomeMode);
  }, []);

  useEffect(() => {
    const brand = currentUniversity.brand ?? getUniversityById(universityId).brand;
    if (!brand) return;
    const tokens = buildBrandTokens(brand);
    const shouldAnimateThemeShift = previousThemeUniversityRef.current !== universityId;

    if (shouldAnimateThemeShift) {
      document.body.classList.add("body--themeTransition");
      if (themeTransitionTimeoutRef.current !== null) {
        window.clearTimeout(themeTransitionTimeoutRef.current);
      }
    }

    document.body.dataset.university = universityId;
    document.body.style.setProperty("--brand-primary", tokens.action);
    document.body.style.setProperty("--brand-secondary", tokens.support);
    document.body.style.setProperty("--brand-highlight", tokens.highlight);
    document.body.style.setProperty("--brand-surface", tokens.surface);
    document.body.style.setProperty("--brand-subtle", tokens.subtle);
    document.body.style.setProperty("--brand-contrast", tokens.contrast);
    document.body.style.setProperty("--brand-primary-rgb", hexToRgbTriplet(tokens.action));
    document.body.style.setProperty("--brand-secondary-rgb", hexToRgbTriplet(tokens.support));
    document.body.style.setProperty("--brand-highlight-rgb", hexToRgbTriplet(tokens.highlight));
    document.body.style.setProperty("--brand-surface-rgb", hexToRgbTriplet(tokens.surface));
    document.body.style.setProperty("--brand-subtle-rgb", hexToRgbTriplet(tokens.subtle));
    document.body.style.setProperty("--accent", tokens.action);
    previousThemeUniversityRef.current = universityId;

    if (shouldAnimateThemeShift) {
      themeTransitionTimeoutRef.current = window.setTimeout(() => {
        document.body.classList.remove("body--themeTransition");
        themeTransitionTimeoutRef.current = null;
      }, 650);
    }
  }, [currentUniversity, universityId]);

  useEffect(() => () => {
    if (themeTransitionTimeoutRef.current !== null) {
      window.clearTimeout(themeTransitionTimeoutRef.current);
    }
    document.body.classList.remove("body--themeTransition");
  }, []);

  const loadUniversities = useCallback(() => {
    fetchUniversities()
      .then((data) =>
        setUniversities(
          Array.isArray(data) && data.length
            ? mergeUniversities(UNIVERSITY_OPTIONS, data)
            : UNIVERSITY_OPTIONS,
        ),
      )
      .catch(() => setUniversities(UNIVERSITY_OPTIONS));
  }, []);

  useEffect(() => {
    loadUniversities();
    const timer = window.setInterval(loadUniversities, CATALOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadUniversities]);

  const loadTerms = useCallback(() => {
    const requestId = termRequestIdRef.current + 1;
    termRequestIdRef.current = requestId;
    const requestUniversityId = universityId;
    const cachedTerms = getCachedTerms(requestUniversityId);
    setTermsLoading(cachedTerms.length === 0);

    fetchCatalogBootstrap(
      requestUniversityId,
      manualTermSelectionRef.current ?? semesterIdRef.current,
    )
      .then(async (bootstrap) => {
        if (requestId !== termRequestIdRef.current) return;
        const formatted = mergeVisibleTermSelection(
          formatCatalogTerms(bootstrap.terms),
          manualTermSelectionRef.current ?? "",
          semestersRef.current,
        );
        const currentSemesterId = semesterIdRef.current;
        const nextSemesterId = manualTermSelectionRef.current
              && (
                manualTermSelectionRef.current === currentSemesterId
                || formatted.some((term) => term.id === manualTermSelectionRef.current)
              )
          ? manualTermSelectionRef.current
          : resolvePreferredTermId(
              requestUniversityId,
              formatted,
              bootstrap.selectedTermId || currentSemesterId,
              bootstrap.terms.find((term) => term.is_current)?.code ?? "",
            );

        let primedCourses = nextSemesterId === bootstrap.selectedTermId
          ? mapAndFilterUniversityCourses(bootstrap.courses, requestUniversityId)
          : nextSemesterId
            ? getCachedCourses(requestUniversityId, nextSemesterId)
            : [];

        if (nextSemesterId && primedCourses.length === 0) {
          try {
            const rawCourses = await fetchCourses(requestUniversityId, nextSemesterId);
            primedCourses = mapAndFilterUniversityCourses(rawCourses, requestUniversityId);
            if (primedCourses.length > 0) {
              setCachedCourses(requestUniversityId, nextSemesterId, primedCourses);
            }
          } catch {
            primedCourses = [];
          }
        }

        if (requestId !== termRequestIdRef.current) return;

        setCachedTerms(requestUniversityId, formatted);
        if (primedCourses.length > 0) {
          courseDataSignatureRef.current = buildCourseDataSignature(primedCourses);
        }
        startTransition(() => {
          setSemesters(formatted);
          setSemesterId((currentSemesterId) =>
            manualTermSelectionRef.current
              && (
                manualTermSelectionRef.current === currentSemesterId
                || formatted.some((term) => term.id === manualTermSelectionRef.current)
              )
              ? manualTermSelectionRef.current
              : resolvePreferredTermId(
                  requestUniversityId,
                  formatted,
                  bootstrap.selectedTermId || currentSemesterId,
                  bootstrap.terms.find((term) => term.is_current)?.code ?? "",
                ),
          );
          if (primedCourses.length > 0) {
            setAllCourses(primedCourses);
          }
        });
      })
      .catch(() => {
        if (requestId !== termRequestIdRef.current) return;
        const cachedTerms = mergeVisibleTermSelection(
          getCachedTerms(requestUniversityId),
          manualTermSelectionRef.current ?? "",
          semestersRef.current,
        );
        if (!cachedTerms.length) return;
        startTransition(() => {
          setSemesters(cachedTerms);
          setSemesterId((currentSemesterId) =>
            manualTermSelectionRef.current
              && (
                manualTermSelectionRef.current === currentSemesterId
                || cachedTerms.some((term) => term.id === manualTermSelectionRef.current)
              )
              ? manualTermSelectionRef.current
              : resolvePreferredTermId(requestUniversityId, cachedTerms, currentSemesterId),
          );
        });
      })
      .finally(() => {
        if (requestId === termRequestIdRef.current) {
          setTermsLoading(false);
        }
      });
  }, [universityId]);

  const findFallbackCatalogForUniversity = useCallback(async (
    targetUniversityId: string,
    currentTermId: string,
    options?: { allowTermSwitch?: boolean },
  ) => {
    const allowTermSwitch = options?.allowTermSwitch ?? true;
    const candidateTerms = [
      currentTermId,
      ...(allowTermSwitch ? getCachedTerms(targetUniversityId).map((term) => term.id) : []),
    ].filter((termId, index, array) => Boolean(termId) && array.indexOf(termId) === index);

    for (const termId of candidateTerms) {
      const cachedCourses = getCachedCourses(targetUniversityId, termId);
      if (cachedCourses.length > 0) {
        return { termId, courses: cachedCourses, fromCache: true };
      }
    }

    const fetchedTerms = formatCatalogTerms(await fetchTerms(targetUniversityId));
    if (fetchedTerms.length > 0) {
      setCachedTerms(targetUniversityId, fetchedTerms);
    }

    const resolvedCandidateTerms = [
      currentTermId,
      ...(allowTermSwitch ? fetchedTerms.map((term) => term.id) : []),
      ...candidateTerms,
    ].filter((termId, index, array) => Boolean(termId) && array.indexOf(termId) === index);

    for (const termId of resolvedCandidateTerms) {
      const rawCourses = await fetchCourses(targetUniversityId, termId);
      const mappedCourses = mapAndFilterUniversityCourses(rawCourses, targetUniversityId);
      if (mappedCourses.length === 0) continue;

      setCachedCourses(targetUniversityId, termId, mappedCourses);
      return { termId, courses: mappedCourses, fromCache: false };
    }

    return null;
  }, []);

  const prewarmCatalogCaches = useCallback(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void primeUniversityCatalogCache(universityId, {
        preferredTermId: semesterId,
        warmAllTerms: false,
      }).catch(() => {
        // Keep background priming silent; the visible loaders still handle active fetches.
      });
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [semesterId, universityId]);

  useEffect(() => {
    termRequestIdRef.current += 1;
    courseRequestIdRef.current += 1;
    manualTermSelectionRef.current = null;
    setStoredUniversityId(universityId);
    const cachedTerms = getCachedTerms(universityId);
    const nextSemesterId = resolvePreferredTermId(universityId, cachedTerms);
    const cachedCourses = nextSemesterId
      ? getCachedCourses(universityId, nextSemesterId)
      : [];
    courseDataSignatureRef.current = buildCourseDataSignature(cachedCourses);
    startTransition(() => {
      setSemesters(cachedTerms);
      setSemesterId(nextSemesterId);
      setAllCourses(cachedCourses);
    });
    loadTerms();
    const timer = window.setInterval(loadTerms, CATALOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadTerms, universityId]);

  useEffect(() => {
    const cleanup = prewarmCatalogCaches();
    return cleanup;
  }, [prewarmCatalogCaches]);

  useEffect(() => {
    if (!semesterId) return;
    setStoredTermId(universityId, semesterId);
  }, [universityId, semesterId]);

  const [allCourses, setAllCourses] = useState<Course[]>(initialCourses);
  const catalogCourseIndex = useMemo(
    () => buildCatalogCourseIndex(allCourses),
    [allCourses],
  );

  const loadCourses = useCallback((options?: { silent?: boolean }) => {
    if (!semesterId) {
      courseRequestIdRef.current += 1;
      courseDataSignatureRef.current = "";
      setAllCourses([]);
      setCoursesLoading(false);
      return;
    }

    if (semesterId.includes(":") && !semesterId.startsWith(`${universityId}:`)) {
      courseRequestIdRef.current += 1;
      courseDataSignatureRef.current = "";
      setAllCourses([]);
      setCoursesLoading(false);
      return;
    }

    const requestId = courseRequestIdRef.current + 1;
    courseRequestIdRef.current = requestId;
    const requestUniversityId = universityId;
    const requestTermId = semesterId;
    const preserveSelectedTerm = manualTermSelectionRef.current === requestTermId;
    const silent = options?.silent ?? false;
    if (!silent) {
      setCoursesLoading(true);
    }
    fetchCourses(universityId, semesterId)
      .then(async (data) => {
        if (requestId !== courseRequestIdRef.current) return;
        let nextCourses = mapAndFilterUniversityCourses(data, requestUniversityId);
        let resolvedTermId = requestTermId;

        if (nextCourses.length === 0) {
          const fallbackCatalog = await findFallbackCatalogForUniversity(
            requestUniversityId,
            requestTermId,
            { allowTermSwitch: !preserveSelectedTerm },
          );
          if (requestId !== courseRequestIdRef.current || !fallbackCatalog) {
            return;
          }

          if (preserveSelectedTerm && fallbackCatalog.termId !== requestTermId) {
            return;
          }

          nextCourses = fallbackCatalog.courses;
          resolvedTermId = fallbackCatalog.termId;
          if (!preserveSelectedTerm && fallbackCatalog.termId && fallbackCatalog.termId !== requestTermId) {
            startTransition(() => {
              setSemesters((currentTerms) => {
                if (currentTerms.some((term) => term.id === fallbackCatalog.termId)) {
                  return currentTerms;
                }
                const label = getCachedTerms(requestUniversityId)
                  .find((term) => term.id === fallbackCatalog.termId)?.label
                  ?? fallbackCatalog.termId;
                return [{ id: fallbackCatalog.termId, label }, ...currentTerms];
              });
              setSemesterId(fallbackCatalog.termId);
            });
          }
        }

        const nextSignature = buildCourseDataSignature(nextCourses);
        if (nextSignature === courseDataSignatureRef.current) return;

        courseDataSignatureRef.current = nextSignature;
        setCachedCourses(requestUniversityId, resolvedTermId, nextCourses);
        startTransition(() => {
          setAllCourses(nextCourses);
        });
      })
      .catch(async () => {
        if (requestId === courseRequestIdRef.current) {
          const cachedCourses = getCachedCourses(requestUniversityId, requestTermId);
          if (cachedCourses.length > 0) {
            const cachedSignature = buildCourseDataSignature(cachedCourses);
            if (cachedSignature === courseDataSignatureRef.current) return;
            courseDataSignatureRef.current = cachedSignature;
            startTransition(() => {
              setAllCourses(cachedCourses);
            });
            return;
          }

          const fallbackCatalog = await findFallbackCatalogForUniversity(
            requestUniversityId,
            requestTermId,
            { allowTermSwitch: !preserveSelectedTerm },
          );
          if (requestId !== courseRequestIdRef.current || !fallbackCatalog) {
            return;
          }

          if (preserveSelectedTerm && fallbackCatalog.termId !== requestTermId) {
            return;
          }

          if (!preserveSelectedTerm && fallbackCatalog.termId && fallbackCatalog.termId !== requestTermId) {
            startTransition(() => {
              setSemesters((currentTerms) => {
                if (currentTerms.some((term) => term.id === fallbackCatalog.termId)) {
                  return currentTerms;
                }
                const label = getCachedTerms(requestUniversityId)
                  .find((term) => term.id === fallbackCatalog.termId)?.label
                  ?? fallbackCatalog.termId;
                return [{ id: fallbackCatalog.termId, label }, ...currentTerms];
              });
              setSemesterId(fallbackCatalog.termId);
            });
          }

          const fallbackSignature = buildCourseDataSignature(fallbackCatalog.courses);
          if (fallbackSignature === courseDataSignatureRef.current) return;
          courseDataSignatureRef.current = fallbackSignature;
          startTransition(() => {
            setAllCourses(fallbackCatalog.courses);
          });
        }
      })
      .finally(() => {
        if (requestId === courseRequestIdRef.current) {
          setCoursesLoading(false);
        }
      });
  }, [findFallbackCatalogForUniversity, semesterId, universityId]);

  useEffect(() => {
    if (!semesterId) {
      courseDataSignatureRef.current = "";
      setAllCourses([]);
      setCoursesLoading(false);
      return;
    }

    const cachedCourses = getCachedCourses(universityId, semesterId);
    if (cachedCourses.length > 0) {
      const cachedSignature = buildCourseDataSignature(cachedCourses);
      if (cachedSignature !== courseDataSignatureRef.current) {
        courseDataSignatureRef.current = cachedSignature;
        startTransition(() => {
          setAllCourses(cachedCourses);
        });
      }
    } else if (allCourses.length > 0) {
      courseDataSignatureRef.current = "";
      startTransition(() => {
        setAllCourses([]);
      });
    }

    if (cachedCourses.length > 0) {
      const refreshTimer = window.setTimeout(() => {
        loadCourses({ silent: true });
      }, 180);
      const intervalTimer = window.setInterval(() => {
        loadCourses({ silent: true });
      }, CATALOG_POLL_INTERVAL_MS);
      return () => {
        window.clearTimeout(refreshTimer);
        window.clearInterval(intervalTimer);
      };
    }

    loadCourses();
    const timer = window.setInterval(loadCourses, CATALOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [allCourses.length, loadCourses, semesterId, universityId]);

  useEffect(() => {
    if (!catalogStatusSequence) return;
    if (!catalogStatusHydratedRef.current) {
      catalogStatusHydratedRef.current = true;
      return;
    }

    loadUniversities();
    loadTerms();
    if (semesterIdRef.current) {
      loadCourses({ silent: true });
    }
  }, [catalogStatusSequence, loadCourses, loadTerms, loadUniversities]);

  const catalogLoading = termsLoading || coursesLoading || (!semesterId && semesters.length === 0);

  const handleRecoverCatalogCourses = useCallback((courses: Course[], recoveredTermId: string) => {
    if (
      !courses.length
      || recoveredTermId !== semesterId
      || courses[0]?.universityId !== universityId
    ) {
      return;
    }

    const recoveredSignature = buildCourseDataSignature(courses);
    if (recoveredSignature === courseDataSignatureRef.current && allCourses.length > 0) {
      return;
    }

    courseDataSignatureRef.current = recoveredSignature;
    setCachedCourses(universityId, recoveredTermId, courses);
    startTransition(() => {
      setAllCourses(courses);
    });
  }, [allCourses.length, semesterId, universityId]);

  const handleSemesterChange = useCallback((nextSemesterId: string) => {
    manualTermSelectionRef.current = nextSemesterId || null;
    setHoveredCourse(null);
    setSchedulePreviewCourse(null);

    const cachedCourses = nextSemesterId
      ? getCachedCourses(universityId, nextSemesterId)
      : [];

    if (cachedCourses.length > 0) {
      courseDataSignatureRef.current = buildCourseDataSignature(cachedCourses);
      startTransition(() => {
        setAllCourses(cachedCourses);
        setSemesterId(nextSemesterId);
      });
      return;
    }

    setSemesterId(nextSemesterId);
  }, [universityId]);

  const [activeLeftTab, setActiveLeftTab] = useState<"welcome" | "info" | "crn">("welcome");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [hoveredCourse, setHoveredCourse] = useState<Course | null>(null);
  const [schedulePreviewCourse, setSchedulePreviewCourse] = useState<Course | null>(null);
  const [leftInfoScrollTop, setLeftInfoScrollTop] = useState(0);
  const [favoriteCourses, setFavoriteCourses] = useState<Course[]>([]);
  const [customColors, setCustomColors] = useState<Map<string, string>>(
    () => new Map(initialScheduleSnapshot?.colors ?? []),
  );

  const [activeSlot, setActiveSlot] = useState(1);
  const [schedules, setSchedules] = useState<Record<number, Course[]>>(
    () => cloneScheduleMap(initialScheduleSnapshot?.schedules),
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [lockedCourseIds, setLockedCourseIds] = useState<string[]>([]);
  const [generatedSchedules, setGeneratedSchedules] = useState<GeneratedSchedule[]>([]);
  const [plannerSettingsLoaded, setPlannerSettingsLoaded] = useState(false);
  const [courseDifficulties, setCourseDifficulties] = useState<Record<string, number>>({});
  const hydratedSchedules = useMemo(
    () => enrichScheduleMapFromCatalog(schedules, catalogCourseIndex),
    [catalogCourseIndex, schedules],
  );

  useEffect(() => {
    setSelectedCourse(null);
    setHoveredCourse(null);
    setSchedulePreviewCourse(null);
    setActiveLeftTab("welcome");
    setLeftInfoScrollTop(0);
    const cachedSnapshot = sanitizeScheduleSnapshotForContext(
      getCachedScheduleSnapshot(userId, universityId, semesterId),
      universityId,
      semesterId,
    );
    setSchedules(cachedSnapshot?.schedules ?? createEmptySchedules());
    setCustomColors(new Map(cachedSnapshot?.colors ?? []));
    setActiveSlot(1);
    setLockedCourseIds([]);
    setGeneratedSchedules([]);
    setCourseDifficulties({});
  }, [semesterId, universityId, userId]);

  const plannerSettingsKey = useMemo(
    () => getPlannerSettingsKey(userId, universityId, semesterId),
    [semesterId, universityId, userId],
  );

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      setUserId(session?.user.id ?? null);
      syncUniversityFromAuthenticatedEmail(session?.user.email);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUserId(session?.user.id ?? null);

      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        syncUniversityFromAuthenticatedEmail(session?.user.email);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [syncUniversityFromAuthenticatedEmail]);

  useEffect(() => {
    setPlannerSettingsLoaded(false);
    setGeneratedSchedules([]);
    let cancelled = false;
    const localSettings = readPlannerSettings(plannerSettingsKey);
    setBlockedTimes(localSettings.blockedTimes);
    setLockedCourseIds(localSettings.lockedCourseIds);
    setPlannerSettingsLoaded(true);

    if (!userId || !semesterId) return;

    supabase
      .from("planner_settings")
      .select("blocked_times, locked_course_ids")
      .eq("user_id", userId)
      .eq("university_id", universityId)
      .eq("term_id", semesterId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) return;
        setBlockedTimes(Array.isArray(data.blocked_times) ? data.blocked_times : []);
        setLockedCourseIds(Array.isArray(data.locked_course_ids) ? data.locked_course_ids : []);
      });
    return () => {
      cancelled = true;
    };
  }, [plannerSettingsKey, semesterId, universityId, userId]);

  useEffect(() => {
    if (!plannerSettingsLoaded || !semesterId) return;
    const settings = { blockedTimes, lockedCourseIds };
    writePlannerSettings(plannerSettingsKey, settings);

    if (!userId) return;
    void supabase.from("planner_settings").upsert(
      {
        user_id: userId,
        university_id: universityId,
        term_id: semesterId,
        blocked_times: blockedTimes,
        locked_course_ids: lockedCourseIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,university_id,term_id" },
    );
  }, [
    blockedTimes,
    lockedCourseIds,
    plannerSettingsKey,
    plannerSettingsLoaded,
    semesterId,
    universityId,
    userId,
  ]);

  useEffect(() => {
    if (!semesterId) return;
    setCachedScheduleSnapshot(userId, universityId, semesterId, {
      schedules: cloneScheduleMap(schedules),
      colors: Array.from(customColors.entries()),
      updatedAt: new Date().toISOString(),
    });
  }, [customColors, schedules, semesterId, universityId, userId]);

  useEffect(() => {
    if (!userId || !semesterId) return;
    let cancelled = false;
    const legacyTermId = universityId === DEFAULT_UNIVERSITY_ID && semesterId.includes(":")
      ? semesterId.split(":").slice(1).join(":")
      : "";
    const loadUserSchedules = async () => {
      let query = supabase
        .from("schedules")
        .select("slot, courses, colors, term_id, updated_at, university_id")
        .eq("user_id", userId)
        .eq("university_id", universityId);

      query = legacyTermId
        ? query.in("term_id", [semesterId, legacyTermId])
        : query.eq("term_id", semesterId);

      const result = await query;
      let data: any[] | null = result.data;
      const { error } = result;

      if (error) {
        let legacyQuery = supabase
          .from("schedules")
          .select("slot, courses, colors, term_id, updated_at")
          .eq("user_id", userId);

        legacyQuery = legacyTermId
          ? legacyQuery.in("term_id", [semesterId, legacyTermId])
          : legacyQuery.eq("term_id", semesterId);

        const legacyResult = await legacyQuery;
        data = legacyResult.data;
      }

        const loaded: Record<number, Course[]> = { 1: [], 2: [], 3: [] };
        const loadedColors = new Map<string, string>();
        const preferredRows = new Map<number, any>();

        (data ?? [])
          .sort((left: any, right: any) => {
            const leftPriority = left.term_id === semesterId ? 0 : 1;
            const rightPriority = right.term_id === semesterId ? 0 : 1;
            if (leftPriority !== rightPriority) return leftPriority - rightPriority;
            return String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? ""));
          })
          .forEach((row: any) => {
            if (!preferredRows.has(row.slot)) {
              preferredRows.set(row.slot, row);
            }
          });

        [...preferredRows.values()].forEach((row: any) => {
          loaded[row.slot] = sanitizeScheduleCoursesForContext(row.courses, universityId, semesterId);
          if (row.colors) {
            Object.entries(row.colors).forEach(([id, color]) => {
              loadedColors.set(id, color as string);
            });
          }
        });
        if (cancelled) return;
        const sanitizedSnapshot = sanitizeScheduleSnapshotForContext(
          {
            schedules: loaded,
            colors: Array.from(loadedColors.entries()),
            updatedAt: new Date().toISOString(),
          },
          universityId,
          semesterId,
        );
        if (!sanitizedSnapshot) return;
        setCachedScheduleSnapshot(userId, universityId, semesterId, sanitizedSnapshot);
        startTransition(() => {
          setSchedules(sanitizedSnapshot.schedules);
          setCustomColors(new Map(sanitizedSnapshot.colors));
        });
    };

    loadUserSchedules();
    return () => {
      cancelled = true;
    };
  }, [userId, semesterId, universityId]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("favorites")
      .select("course")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (!data) return;
        setFavoriteCourses(sanitizeCourseList(data.map((row: any) => row.course)));
      });
  }, [userId]);

  const favoriteCourseIds = useMemo(
    () => new Set(favoriteCourses.map((course) => course.id)),
    [favoriteCourses],
  );
  const favoriteCourseIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    favoriteCourseIdsRef.current = favoriteCourseIds;
  }, [favoriteCourseIds]);

  const saveSlot = useCallback(
    async (slot: number, courses: Course[], colors?: Map<string, string>) => {
      if (!userId || !semesterId) return;
      const normalizedCourses = sanitizeScheduleCoursesForContext(courses, universityId, semesterId);
      const colorsObj = colors
        ? Object.fromEntries(colors)
        : Object.fromEntries(customColors);
      const payload = {
        user_id: userId,
        university_id: universityId,
        term_id: semesterId,
        slot,
        courses: normalizedCourses,
        colors: colorsObj,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("schedules").upsert(
        payload,
        { onConflict: "user_id,university_id,slot,term_id" },
      );

      if (!error) return;

      await supabase.from("schedules").upsert(
        {
          user_id: userId,
          term_id: semesterId,
          slot,
          courses: normalizedCourses,
          colors: colorsObj,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,slot,term_id" },
      );
    },
    [userId, universityId, semesterId, customColors],
  );

  const toggleFavorite = useCallback(
    async (course: Course) => {
      if (!userId) return;
      const normalizedCourse = sanitizeCourse(course);
      const exists = favoriteCourseIdsRef.current.has(course.id);
      if (exists) {
        setFavoriteCourses((prev) => prev.filter((favorite) => favorite.id !== normalizedCourse.id));
        await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("course_id", normalizedCourse.id);
      } else {
        setFavoriteCourses((prev) => sanitizeCourseList([...prev, normalizedCourse]));
        await supabase
          .from("favorites")
          .insert({ user_id: userId, course_id: normalizedCourse.id, course: normalizedCourse });
      }
    },
    [userId],
  );

  const scheduled = hydratedSchedules[activeSlot] ?? [];

  const toggleSchedule = useCallback((course: Course) => {
    const normalizedCourse = sanitizeCourse(course);
    const current = schedules[activeSlot] ?? [];
    const removed = current.some((scheduledCourse) => scheduledCourse.id === normalizedCourse.id);
    const updated = removed
      ? current.filter((scheduledCourse) => scheduledCourse.id !== normalizedCourse.id)
      : sanitizeCourseList([...current, normalizedCourse]);

    setSchedules((currentSchedules) => ({
      ...currentSchedules,
      [activeSlot]: updated,
    }));

    if (removed) {
      setLockedCourseIds((currentLockedIds) =>
        currentLockedIds.filter((courseId) => courseId !== normalizedCourse.id),
      );
    }
    saveSlot(activeSlot, updated);
    if (!removed && !favoriteCourseIdsRef.current.has(normalizedCourse.id)) {
      void toggleFavorite(normalizedCourse);
    }
  }, [activeSlot, saveSlot, schedules, toggleFavorite]);

  const visibleFavorites = useMemo(
    () => favoriteCourses
      .map((course) => enrichCourseFromCatalog(course, catalogCourseIndex))
      .filter((course) => (course.universityId ?? DEFAULT_UNIVERSITY_ID) === universityId),
    [catalogCourseIndex, favoriteCourses, universityId],
  );

  const scheduledIds = useMemo(
    () => new Set(scheduled.map((course) => course.id)),
    [scheduled],
  );
  const scheduleMetrics = useMemo(() => getScheduleQuality(scheduled), [scheduled]);
  const selectedCrns = useMemo(() => scheduled.map((course) => course.crn), [scheduled]);
  const totalCredits = useMemo(
    () => scheduled.reduce((acc, course) => acc + (course.credits ?? 0), 0),
    [scheduled],
  );

  useEffect(() => {
    scheduled.forEach((course) => {
      if (courseDifficulties[course.id] !== undefined) return;
      const reviewDepartment = encodeURIComponent(
        course.reviewDepartment
          ?? `${(course.universityId || universityId).toUpperCase()}__${course.department}`,
      );
      const reviewCourseNumber = encodeURIComponent(course.courseNumber ?? "");
      fetch(`${API_URL}/api/ratings/course/${reviewDepartment}/${reviewCourseNumber}`)
        .then((response) => response.json())
        .then((data) => {
          if (data.averages?.difficulty > 0) {
            setCourseDifficulties((prev) => ({
              ...prev,
              [course.id]: parseFloat(data.averages.difficulty),
            }));
          }
        })
        .catch(() => undefined);
    });
  }, [scheduled, courseDifficulties, universityId]);

  const averageDifficulty = useMemo(() => {
    const ratedCourses = scheduled.filter((course) => courseDifficulties[course.id] !== undefined);
    if (ratedCourses.length === 0) return null;
    return (
      ratedCourses.reduce((acc, course) => acc + courseDifficulties[course.id], 0)
      / ratedCourses.length
    );
  }, [scheduled, courseDifficulties]);

  const courseColorMap = useMemo(() => {
    const map = new Map<string, string>();
    scheduled.forEach((course, index) => {
      map.set(
        course.id,
        customColors.get(course.id) ?? COURSE_COLORS[index % COURSE_COLORS.length],
      );
    });
    return map;
  }, [scheduled, customColors]);

  const handleColorChange = useCallback((courseId: string, color: string) => {
    const updated = new Map(customColors).set(courseId, color);
    setCustomColors(updated);
    saveSlot(activeSlot, scheduled, updated);
  }, [activeSlot, customColors, saveSlot, scheduled]);

  const displayedCourse = useMemo(() => {
    const canPreviewHoveredCourse = activeLeftTab === "info" && !selectedCourse;
    const course = canPreviewHoveredCourse
      ? (hoveredCourse ?? selectedCourse)
      : selectedCourse;
    return course ? enrichCourseFromCatalog(course, catalogCourseIndex) : null;
  }, [activeLeftTab, catalogCourseIndex, hoveredCourse, leftInfoScrollTop, selectedCourse]);

  const selectCourse = useCallback((course: Course) => {
    setSelectedCourse(course);
    setSchedulePreviewCourse(null);
    setActiveLeftTab("info");
    setLeftInfoScrollTop(0);
  }, []);

  const handleHoverCourse = useCallback((course: Course | null) => {
    setHoveredCourse((current) => {
      if ((current?.id ?? null) === (course?.id ?? null)) return current;
      return course;
    });
  }, []);

  const handleApplyAISchedule = useCallback((courses: Course[]) => {
    const normalizedCourses = sanitizeCourseList(courses);
    setSchedules((currentSchedules) => ({
      ...currentSchedules,
      [activeSlot]: normalizedCourses,
    }));
    saveSlot(activeSlot, normalizedCourses);
    normalizedCourses.forEach((course) => {
      if (!favoriteCourseIdsRef.current.has(course.id)) {
        void toggleFavorite(course);
      }
    });
  }, [activeSlot, saveSlot, toggleFavorite]);

  const handleToggleLockedCourse = useCallback((courseId: string) => {
    setLockedCourseIds((currentLockedIds) =>
      currentLockedIds.includes(courseId)
        ? currentLockedIds.filter((lockedCourseId) => lockedCourseId !== courseId)
        : [...currentLockedIds, courseId],
    );
  }, []);

  const handleAddBlockedTime = useCallback((block: Omit<BlockedTime, "id">) => {
    setBlockedTimes((currentBlocks) => [
      ...currentBlocks,
      {
        ...block,
        id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    ]);
  }, []);

  const handleRemoveBlockedTime = useCallback((blockId: string) => {
    setBlockedTimes((currentBlocks) => currentBlocks.filter((block) => block.id !== blockId));
  }, []);

  const handleGenerateSchedules = useCallback(
    (options?: { openSeatsOnly?: boolean; excludeFriday?: boolean }) => {
      const wantedCourses = uniqueCourses([...scheduled, ...visibleFavorites]);
      const generated = generateScheduleOptions({
        allCourses,
        wantedCourses,
        lockedCourseIds,
        blockedTimes,
        openSeatsOnly: options?.openSeatsOnly,
        excludeFriday: options?.excludeFriday,
        maxOptions: 5,
      });
      setGeneratedSchedules(generated);
    },
    [allCourses, blockedTimes, lockedCourseIds, scheduled, visibleFavorites],
  );

  const handleApplyGeneratedSchedule = useCallback(
    (option: GeneratedSchedule) => {
      const courses = sanitizeCourseList(option.courses);
      setSchedules((currentSchedules) => ({
        ...currentSchedules,
        [activeSlot]: courses,
      }));
      setLockedCourseIds((currentLockedIds) =>
        currentLockedIds.filter((courseId) => courses.some((course) => course.id === courseId)),
      );
      saveSlot(activeSlot, courses);
      courses.forEach((course) => {
        if (!favoriteCourseIdsRef.current.has(course.id)) {
          void toggleFavorite(course);
        }
      });
    },
    [activeSlot, saveSlot, toggleFavorite],
  );

  const slotSummaries = useMemo(
    () => [1, 2, 3].map((slot) => buildSlotSummary(slot, hydratedSchedules[slot] ?? [])),
    [hydratedSchedules],
  );

  const handleCloneActiveSchedule = useCallback((targetSlot: number) => {
    if (targetSlot === activeSlot) return;
    const clonedCourses = sanitizeCourseList(scheduled);
    setSchedules((prev) => ({
      ...prev,
      [targetSlot]: clonedCourses,
    }));
    saveSlot(targetSlot, clonedCourses, customColors);
  }, [activeSlot, customColors, saveSlot, scheduled]);

  const handleClearActiveSchedule = useCallback(() => {
    setSchedules((prev) => ({
      ...prev,
      [activeSlot]: [],
    }));
    setLockedCourseIds((currentLockedIds) =>
      currentLockedIds.filter((courseId) => !scheduled.some((course) => course.id === courseId)),
    );
    saveSlot(activeSlot, [], customColors);
  }, [activeSlot, customColors, saveSlot, scheduled]);

  const handleRecoverFromPlannerError = useCallback(() => {
    setSelectedCourse(null);
    setHoveredCourse(null);
    setSchedulePreviewCourse(null);
    setGeneratedSchedules([]);
    setLockedCourseIds((currentLockedIds) =>
      currentLockedIds.filter((courseId) => !scheduled.some((course) => course.id === courseId)),
    );
    setSchedules((prev) => ({
      ...prev,
      [activeSlot]: [],
    }));
    saveSlot(activeSlot, [], customColors);
  }, [activeSlot, customColors, saveSlot, scheduled]);

  const plannerResetKey = useMemo(
    () => `${universityId}:${semesterId}:${activeSlot}:${scheduled.map((course) => course.id).sort().join("|")}`,
    [activeSlot, scheduled, semesterId, universityId],
  );

  const mainApp = (
    <PlannerErrorBoundary
      resetKey={plannerResetKey}
      onReset={handleRecoverFromPlannerError}
      onAutoRecover={handleRecoverFromPlannerError}
    >
      <div className="appShell">
        <a className="skipLink" href="#planner-main">
          Skip to planner
        </a>
        <TopNav
          appName={appName}
          universityId={universityId}
          universities={universities}
          universityName={currentUniversity.name}
          semesterId={semesterId}
          semesters={semesters}
          semesterLabel={semesterLabel}
          lastUpdatedText={lastUpdatedText}
          onUniversityChange={handleUniversityChange}
          onSemesterChange={handleSemesterChange}
          scheduledCourses={scheduled}
          activePage="home"
          canChangeUniversity={canChooseAnyUniversity}
        />
        <main
          className={`mainContainer${isCompactMobileHome ? " mainContainer--compactMobileHome" : ""}`}
          id="planner-main"
        >
          {!isCompactMobileHome ? (
            <LeftInfoPanel
              activeTab={activeLeftTab}
              onTabChange={(tab) => {
                setActiveLeftTab(tab);
                if (tab !== "info") {
                  setLeftInfoScrollTop(0);
                }
              }}
              selectedCourse={displayedCourse}
              selectedCrns={selectedCrns}
              universityName={currentUniversity.name}
              onBodyScroll={setLeftInfoScrollTop}
              isSelectedFavorite={displayedCourse ? visibleFavorites.some((course) => course.id === displayedCourse.id) : false}
              isSelectedLocked={displayedCourse ? lockedCourseIds.includes(displayedCourse.id) : false}
              onToggleFavorite={toggleFavorite}
              onToggleLockedCourse={handleToggleLockedCourse}
            />
          ) : null}
          <ScheduleGrid
            courses={scheduled}
            hoveredCourse={schedulePreviewCourse}
            scheduledIds={scheduledIds}
            courseColorMap={courseColorMap}
            onSelectCourse={selectCourse}
            onHoverCourse={handleHoverCourse}
            onColorChange={handleColorChange}
            onRemoveCourse={toggleSchedule}
            semesterLabel={semesterLabel}
          />
          <RightSearchPanel
            allCourses={allCourses}
            catalogLoading={catalogLoading}
            scheduled={scheduled}
            favorites={visibleFavorites}
            slotSummaries={slotSummaries}
            blockedTimes={blockedTimes}
            lockedCourseIds={lockedCourseIds}
            generatedSchedules={generatedSchedules}
            scheduleMetrics={scheduleMetrics}
            onSelectCourse={selectCourse}
            onToggleSchedule={toggleSchedule}
            onHoverCourse={handleHoverCourse}
            onPreviewCourse={setSchedulePreviewCourse}
            averageDifficulty={averageDifficulty}
            totalCredits={totalCredits}
            activeSlot={activeSlot}
            onSlotChange={setActiveSlot}
            universityId={universityId}
            termId={semesterId}
            onCloneActiveSchedule={handleCloneActiveSchedule}
            onClearActiveSchedule={handleClearActiveSchedule}
            onAddBlockedTime={handleAddBlockedTime}
            onRemoveBlockedTime={handleRemoveBlockedTime}
            onToggleLockedCourse={handleToggleLockedCourse}
            onGenerateSchedules={handleGenerateSchedules}
            onApplyGeneratedSchedule={handleApplyGeneratedSchedule}
            onRecoverCatalogCourses={handleRecoverCatalogCourses}
            compactMobileHome={isCompactMobileHome}
          />
        </main>
        <Suspense fallback={null}>
          <AIScheduler
            allCourses={allCourses}
            scheduledCourses={scheduled}
            favoriteCourses={visibleFavorites}
            selectedCourse={displayedCourse ?? selectedCourse}
            selectedCrns={selectedCrns}
            semesterLabel={semesterLabel}
            termId={semesterId}
            catalogUpdatedAt={currentUniversity.updatedAt ?? null}
            onApplySchedule={handleApplyAISchedule}
            activeSlot={activeSlot}
            universityId={universityId}
            universityName={currentUniversity.name}
          />
        </Suspense>
      </div>
    </PlannerErrorBoundary>
  );

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute>{mainApp}</ProtectedRoute>} />
        <Route
          path="/reviews"
          element={(
            <ProtectedRoute>
              <ReviewsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/previouses"
          element={(
            <ProtectedRoute>
              <PreviousesPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/empty-classes"
          element={(
            <ProtectedRoute>
              <EmptyClassesPage />
            </ProtectedRoute>
          )}
        />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        <Route path="/gpa" element={<GPAPage />} />
        <Route path="/grade-calculator" element={<GradeCalculatorPage />} />
        <Route
          path="/admin"
          element={(
            <AdminRoute>
              <AdminPortalPage />
            </AdminRoute>
          )}
        />
      </Routes>
    </Suspense>
  );
}
