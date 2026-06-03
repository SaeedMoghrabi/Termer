import {
  DEFAULT_UNIVERSITY_ID,
  type UniversityId,
  getUniversityById,
} from "../config/universities.ts";
import type { Course } from "../types.ts";
import { sanitizeCourses } from "./courseApi.ts";

const UNIVERSITY_STORAGE_KEY = "termer:selected-university";
const TERM_STORAGE_KEY_PREFIX = "termer:selected-term:";
const TERMS_CACHE_KEY_PREFIX = "termer:catalog-terms:";
const COURSES_CACHE_KEY_PREFIX = "termer:catalog-courses:";
const SCHEDULE_SNAPSHOT_KEY_PREFIX = "termer:schedule-snapshot:";
const CLIENT_BUILD_KEY = "termer:client-build-id";
const GUEST_SNAPSHOT_ID = "guest";
const TERMER_STORAGE_PREFIX = "termer:";
const memoryTermsCache = new Map<string, PlannerTermOption[]>();
const memoryCoursesCache = new Map<string, Course[]>();

export type PlannerTermOption = {
  id: string;
  label: string;
};

export type PlannerScheduleSnapshot = {
  schedules: Record<number, Course[]>;
  colors: Array<[string, string]>;
  updatedAt: string;
};

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function readJsonStorage<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage<T>(key: string, value: T): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage can hit quota limits, especially with large catalog snapshots.
  }
}

function cloneScheduleMap(value: unknown): Record<number, Course[]> {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  return {
    1: sanitizeCourses(raw[1] ?? raw["1"]),
    2: sanitizeCourses(raw[2] ?? raw["2"]),
    3: sanitizeCourses(raw[3] ?? raw["3"]),
  };
}

function normalizeScheduleSnapshot(value: unknown): PlannerScheduleSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const colors = Array.isArray(raw.colors)
    ? raw.colors.filter(
        (entry): entry is [string, string] =>
          Array.isArray(entry)
          && typeof entry[0] === "string"
          && typeof entry[1] === "string",
      )
    : [];

  return {
    schedules: cloneScheduleMap(raw.schedules),
    colors,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

function getScheduleSnapshotKey(userId: string | null, universityId: string, termId: string): string {
  return `${SCHEDULE_SNAPSHOT_KEY_PREFIX}${userId ?? GUEST_SNAPSHOT_ID}:${universityId}:${termId || "no-term"}`;
}

export function getStoredUniversityId(): UniversityId {
  if (!hasWindow()) return DEFAULT_UNIVERSITY_ID;
  const stored = window.localStorage.getItem(UNIVERSITY_STORAGE_KEY) ?? "";
  return getUniversityById(stored).id;
}

export function setStoredUniversityId(universityId: string): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(UNIVERSITY_STORAGE_KEY, getUniversityById(universityId).id);
}

export function getStoredTermId(universityId: string): string {
  if (!hasWindow()) return "";
  return window.localStorage.getItem(`${TERM_STORAGE_KEY_PREFIX}${universityId}`) ?? "";
}

export function setStoredTermId(universityId: string, termId: string): void {
  if (!hasWindow()) return;
  if (!termId) {
    window.localStorage.removeItem(`${TERM_STORAGE_KEY_PREFIX}${universityId}`);
    return;
  }
  window.localStorage.setItem(`${TERM_STORAGE_KEY_PREFIX}${universityId}`, termId);
}

export function getCachedTerms(universityId: string): PlannerTermOption[] {
  const memoryTerms = memoryTermsCache.get(universityId);
  if (memoryTerms && memoryTerms.length > 0) {
    return memoryTerms;
  }

  const terms = readJsonStorage<PlannerTermOption[]>(
    `${TERMS_CACHE_KEY_PREFIX}${universityId}`,
    [],
  );
  const normalizedTerms = Array.isArray(terms)
    ? terms.filter((term) => term && typeof term.id === "string" && typeof term.label === "string")
    : [];

  if (normalizedTerms.length > 0) {
    memoryTermsCache.set(universityId, normalizedTerms);
  }

  return normalizedTerms;
}

export function setCachedTerms(universityId: string, terms: PlannerTermOption[]): void {
  const normalizedTerms = Array.isArray(terms)
    ? terms.filter((term) => term && typeof term.id === "string" && typeof term.label === "string")
    : [];
  memoryTermsCache.set(universityId, normalizedTerms);
  writeJsonStorage(`${TERMS_CACHE_KEY_PREFIX}${universityId}`, normalizedTerms);
}

export function getCachedCourses(universityId: string, termId: string): Course[] {
  if (!termId) return [];
  const memoryCourses = memoryCoursesCache.get(`${universityId}:${termId}`);
  if (memoryCourses && memoryCourses.length > 0) {
    return memoryCourses;
  }
  const courses = readJsonStorage<Course[]>(`${COURSES_CACHE_KEY_PREFIX}${universityId}:${termId}`, []);
  const normalizedCourses = sanitizeCourses(courses);
  if (normalizedCourses.length > 0) {
    memoryCoursesCache.set(`${universityId}:${termId}`, normalizedCourses);
  }
  return normalizedCourses;
}

export function setCachedCourses(universityId: string, termId: string, courses: Course[]): void {
  if (!termId) return;
  const normalizedCourses = sanitizeCourses(courses);
  memoryCoursesCache.set(`${universityId}:${termId}`, normalizedCourses);
  writeJsonStorage(`${COURSES_CACHE_KEY_PREFIX}${universityId}:${termId}`, normalizedCourses);
}

export function getCachedScheduleSnapshot(
  userId: string | null,
  universityId: string,
  termId: string,
): PlannerScheduleSnapshot | null {
  if (!termId) return null;

  const exact = normalizeScheduleSnapshot(
    readJsonStorage<PlannerScheduleSnapshot | null>(
      getScheduleSnapshotKey(userId, universityId, termId),
      null,
    ),
  );
  if (exact) return exact;

  if (!userId) return null;
  return normalizeScheduleSnapshot(
    readJsonStorage<PlannerScheduleSnapshot | null>(
      getScheduleSnapshotKey(null, universityId, termId),
      null,
    ),
  );
}

export function setCachedScheduleSnapshot(
  userId: string | null,
  universityId: string,
  termId: string,
  snapshot: PlannerScheduleSnapshot,
): void {
  if (!termId) return;
  const normalized = normalizeScheduleSnapshot(snapshot);
  if (!normalized) return;

  writeJsonStorage(getScheduleSnapshotKey(userId, universityId, termId), normalized);
  writeJsonStorage(getScheduleSnapshotKey(null, universityId, termId), normalized);
}

export function reconcileClientBuild(buildId: string): void {
  if (!hasWindow() || !buildId) return;

  const previousBuildId = window.localStorage.getItem(CLIENT_BUILD_KEY) ?? "";
  if (!previousBuildId) {
    window.localStorage.setItem(CLIENT_BUILD_KEY, buildId);
    return;
  }

  if (previousBuildId === buildId) {
    return;
  }

  const keysToDelete: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (
      key.startsWith(TERMS_CACHE_KEY_PREFIX)
      || key.startsWith(COURSES_CACHE_KEY_PREFIX)
      || key.startsWith(TERM_STORAGE_KEY_PREFIX)
      || key.startsWith(SCHEDULE_SNAPSHOT_KEY_PREFIX)
    ) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem(CLIENT_BUILD_KEY, buildId);
}

export function clearTermerClientState(): void {
  if (!hasWindow()) return;
  memoryTermsCache.clear();
  memoryCoursesCache.clear();

  const keysToDelete: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(TERMER_STORAGE_PREFIX)) continue;
    keysToDelete.push(key);
  }

  keysToDelete.forEach((key) => window.localStorage.removeItem(key));
}
