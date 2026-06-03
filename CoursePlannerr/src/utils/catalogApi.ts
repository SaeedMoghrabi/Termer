import {
  getUniversityById,
  UNIVERSITY_OPTIONS,
  type UniversityOption,
} from "../config/universities.ts";
import { API_ROOT } from "../config/runtime.ts";

export interface CatalogTerm {
  code: string;
  source_code: string;
  description: string;
  is_current?: boolean;
  university_id: string;
}

export interface CatalogBootstrapPayload {
  universityId: string;
  terms: CatalogTerm[];
  selectedTermId: string;
  courses: any[];
  hasWarmCatalog: boolean;
}

const TERMS_FETCH_TIMEOUT_MS = 1_000;
const COURSE_FETCH_TIMEOUT_MS = 1_200;
const BOOTSTRAP_FETCH_TIMEOUT_MS = 900;

const SEEDED_FALLBACK_UNIVERSITIES = new Set<string>(
  UNIVERSITY_OPTIONS.map((university) => university.id),
);

type SeedCatalog = {
  terms?: Array<{
    code: string;
    description: string;
    is_current?: boolean;
    course_count?: number;
  }>;
  courses?: any[];
};

async function fetchJson<T>(
  path: string,
  params?: Record<string, string>,
  options?: { timeoutMs?: number },
): Promise<T> {
  const url = new URL(`${API_ROOT}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }

  const controller = options?.timeoutMs ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(new DOMException("Request timed out", "AbortError")), options.timeoutMs)
    : null;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller?.signal,
    });
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchSeedCatalog(universityId: string): Promise<SeedCatalog | null> {
  if (!SEEDED_FALLBACK_UNIVERSITIES.has(universityId)) {
    return null;
  }

  const response = await fetch(`/seed-catalogs/${universityId}.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Seed catalog failed: ${response.status}`);
  }

  return response.json() as Promise<SeedCatalog>;
}

function buildSeedTermCode(universityId: string, termCode: string) {
  return `${universityId}:${termCode}`;
}

function stripUniversityPrefix(universityId: string, termId: string) {
  const prefix = `${universityId}:`;
  return termId.startsWith(prefix) ? termId.slice(prefix.length) : termId;
}

function resolveSeedPreferredTermId(terms: CatalogTerm[], preferredTermId = "") {
  const explicitTerm = terms.find((term) => term.code === preferredTermId)?.code;
  if (explicitTerm) return explicitTerm;

  const currentTerm = terms.find((term) => term.is_current)?.code;
  if (currentTerm) return currentTerm;

  return terms[0]?.code ?? "";
}

export async function fetchSeedTerms(universityId: string): Promise<CatalogTerm[]> {
  const seedCatalog = await fetchSeedCatalog(universityId);
  const terms = Array.isArray(seedCatalog?.terms) ? seedCatalog.terms : [];

  return terms.map((term) => ({
    code: buildSeedTermCode(universityId, String(term.code ?? "")),
    source_code: String(term.code ?? ""),
    description: String(term.description ?? "Catalog"),
    is_current: Boolean(term.is_current),
    university_id: universityId,
  }));
}

export async function fetchSeedCourses(universityId: string, termId: string): Promise<any[]> {
  const seedCatalog = await fetchSeedCatalog(universityId);
  const courses = Array.isArray(seedCatalog?.courses) ? seedCatalog.courses : [];
  const rawTermCode = stripUniversityPrefix(universityId, termId);
  const university = getUniversityById(universityId);

  return courses
    .filter((course) => {
      const courseTermCode = String(course?.term_code ?? "");
      return !rawTermCode || courseTermCode === rawTermCode;
    })
    .map((course) => ({
      ...course,
      university_id: String(course?.university_id ?? universityId).trim().toLowerCase(),
      university_name: String(course?.university_name ?? university.name).trim(),
      semester: String(
        course?.semester
        ?? buildSeedTermCode(
          universityId,
          String(course?.term_code ?? rawTermCode ?? ""),
        ),
      ),
    }));
}

export async function fetchSeedCatalogBootstrap(
  universityId: string,
  preferredTermId = "",
): Promise<CatalogBootstrapPayload> {
  const terms = await fetchSeedTerms(universityId);
  const selectedTermId = resolveSeedPreferredTermId(terms, preferredTermId);
  const courses = selectedTermId
    ? await fetchSeedCourses(universityId, selectedTermId)
    : [];

  return {
    universityId,
    terms,
    selectedTermId,
    courses,
    hasWarmCatalog: terms.length > 0 && (!selectedTermId || courses.length > 0),
  };
}

export async function fetchUniversities(): Promise<UniversityOption[]> {
  try {
    return await fetchJson<UniversityOption[]>("/api/universities");
  } catch {
    return UNIVERSITY_OPTIONS;
  }
}

export async function fetchTerms(universityId: string): Promise<CatalogTerm[]> {
  try {
    const terms = await fetchJson<CatalogTerm[]>(
      "/api/terms",
      { university: universityId },
      { timeoutMs: TERMS_FETCH_TIMEOUT_MS },
    );
    if (Array.isArray(terms) && terms.length > 0) {
      return terms;
    }
  } catch {
    // fall through to seeded snapshots when available
  }

  return fetchSeedTerms(universityId);
}

export async function fetchCourses(universityId: string, termId: string, search = ""): Promise<any[]> {
  try {
    const courses = await fetchJson<any[]>(
      "/api/courses",
      {
        university: universityId,
        term: termId,
        search,
      },
      { timeoutMs: COURSE_FETCH_TIMEOUT_MS },
    );

    if (Array.isArray(courses) && (courses.length > 0 || !SEEDED_FALLBACK_UNIVERSITIES.has(universityId))) {
      return courses;
    }
  } catch {
    // fall through to seeded snapshots when available
  }

  const fallbackCourses = await fetchSeedCourses(universityId, termId);
  if (!search.trim()) {
    return fallbackCourses;
  }

  const normalizedSearch = search.trim().toLowerCase();
  const compactSearch = normalizedSearch.replace(/\s+/g, "");

  return fallbackCourses.filter((course) => {
    const haystack = [
      course?.code,
      course?.title,
      course?.instructor,
      course?.crn,
      course?.department,
      course?.course_number,
      course?.campus,
      course?.schedule?.type,
      course?.scheduleTypeDescription,
      Array.isArray(course?.attributes) ? course.attributes.join(" ") : "",
      course?.prerequisites,
      course?.restrictions,
    ].join(" ").toLowerCase();
    const compactHaystack = haystack.replace(/\s+/g, "");
    return haystack.includes(normalizedSearch) || compactHaystack.includes(compactSearch);
  });
}

export async function fetchCatalogBootstrap(
  universityId: string,
  preferredTermId = "",
): Promise<CatalogBootstrapPayload> {
  try {
    const payload = await fetchJson<CatalogBootstrapPayload>(
      "/api/catalog-bootstrap",
      {
        university: universityId,
        preferredTerm: preferredTermId,
      },
      { timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS },
    );

    if (Array.isArray(payload?.terms)) {
      return payload;
    }
  } catch {
    // fall through to seeded snapshots when available
  }

  return fetchSeedCatalogBootstrap(universityId, preferredTermId);
}
