import { getUniversityById } from "../config/universities.ts";
import { mapApiCoursesToCourses } from "./courseApi.ts";
import { fetchCatalogBootstrap, fetchCourses, fetchSeedCatalogBootstrap } from "./catalogApi.ts";
import {
  getCachedCourses,
  getCachedTerms,
  getStoredTermId,
  setCachedCourses,
  setCachedTerms,
  setStoredTermId,
  type PlannerTermOption,
} from "./plannerPreferences.ts";

type WarmTermOption = PlannerTermOption & {
  isCurrent?: boolean;
};

type PrimeUniversityCatalogOptions = {
  preferredTermId?: string;
  warmAllTerms?: boolean;
};

type PrimeUniversityCatalogResult = {
  universityId: string;
  terms: WarmTermOption[];
  selectedTermId: string;
  coursesLoaded: number;
  hasWarmCatalog: boolean;
};

const inFlightCatalogPrimes = new Map<string, Promise<PrimeUniversityCatalogResult>>();

function formatCatalogTerms(data: Array<{ code: string; description: string; is_current?: boolean }>): WarmTermOption[] {
  return Array.isArray(data)
    ? data.map((term) => ({
        id: term.code,
        label: term.description,
        isCurrent: Boolean(term.is_current),
      }))
    : [];
}

function isCatalogPlaceholderTerm(term: PlannerTermOption | undefined) {
  return /^catalog\b/i.test(String(term?.label ?? "").trim());
}

function resolvePreferredTermId(
  universityId: string,
  terms: WarmTermOption[],
  preferredTermId = "",
) {
  const explicitSelection = terms.find((term) => term.id === preferredTermId)?.id;
  if (explicitSelection) {
    return explicitSelection;
  }

  const storedTermId = getStoredTermId(universityId);
  const storedTerm = terms.find((term) => term.id === storedTermId);
  const currentTerm = terms.find((term) => term.isCurrent) ?? terms[0];

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

  return currentTerm?.id ?? "";
}

function mapAndFilterUniversityCourses(rawCourses: any[], universityId: string) {
  return mapApiCoursesToCourses(rawCourses).filter(
    (course) => course.universityId === universityId,
  );
}

async function warmTermCourses(universityId: string, termId: string) {
  if (!termId) return [];

  const cachedCourses = getCachedCourses(universityId, termId);
  if (cachedCourses.length > 0) {
    return cachedCourses;
  }

  const rawCourses = await fetchCourses(universityId, termId);
  const mappedCourses = mapAndFilterUniversityCourses(rawCourses, universityId);

  if (mappedCourses.length > 0) {
    setCachedCourses(universityId, termId, mappedCourses);
  }

  return mappedCourses;
}

export async function primeUniversityCatalogCache(
  universityId: string,
  options?: PrimeUniversityCatalogOptions,
): Promise<PrimeUniversityCatalogResult> {
  const normalizedUniversityId = getUniversityById(universityId).id;
  const preferredTermId = options?.preferredTermId ?? "";
  const warmAllTerms = options?.warmAllTerms ?? false;
  const taskKey = `${normalizedUniversityId}:${preferredTermId}:${warmAllTerms ? "all" : "one"}`;
  const existingTask = inFlightCatalogPrimes.get(taskKey);

  if (existingTask) {
    return existingTask;
  }

  const task = (async () => {
    let terms: WarmTermOption[] = getCachedTerms(normalizedUniversityId);
    let selectedTermId = resolvePreferredTermId(
      normalizedUniversityId,
      terms,
      preferredTermId,
    );
    let selectedTermCourses = selectedTermId
      ? getCachedCourses(normalizedUniversityId, selectedTermId)
      : [];

    if (terms.length === 0 && selectedTermCourses.length === 0) {
      try {
        const seedBootstrap = await fetchSeedCatalogBootstrap(normalizedUniversityId, preferredTermId);
        const seedTerms = formatCatalogTerms(seedBootstrap.terms);
        if (seedTerms.length > 0) {
          terms = seedTerms;
          setCachedTerms(normalizedUniversityId, seedTerms);
        }

        selectedTermId = resolvePreferredTermId(
          normalizedUniversityId,
          terms,
          seedBootstrap.selectedTermId || preferredTermId,
        );
        selectedTermCourses = selectedTermId === seedBootstrap.selectedTermId
          ? mapAndFilterUniversityCourses(seedBootstrap.courses, normalizedUniversityId)
          : selectedTermId
            ? getCachedCourses(normalizedUniversityId, selectedTermId)
            : [];

        if (selectedTermId && selectedTermCourses.length > 0) {
          setCachedCourses(normalizedUniversityId, selectedTermId, selectedTermCourses);
        }
      } catch {
        // Keep going; the live bootstrap still gets a chance next.
      }
    }

    try {
      const bootstrap = await fetchCatalogBootstrap(normalizedUniversityId, preferredTermId);
      const remoteTerms = formatCatalogTerms(bootstrap.terms);
      if (remoteTerms.length > 0) {
        terms = remoteTerms;
        setCachedTerms(normalizedUniversityId, remoteTerms);
      }

      selectedTermId = resolvePreferredTermId(
        normalizedUniversityId,
        terms,
        bootstrap.selectedTermId || preferredTermId,
      );
      selectedTermCourses = selectedTermId === bootstrap.selectedTermId
        ? mapAndFilterUniversityCourses(bootstrap.courses, normalizedUniversityId)
        : selectedTermId
          ? getCachedCourses(normalizedUniversityId, selectedTermId)
          : [];

      if (selectedTermId && selectedTermCourses.length > 0) {
        setCachedCourses(normalizedUniversityId, selectedTermId, selectedTermCourses);
      }
    } catch {
      // Keep any cached terms if the bootstrap path fails.
    }

    if (selectedTermId && selectedTermCourses.length === 0) {
      try {
        selectedTermCourses = await warmTermCourses(normalizedUniversityId, selectedTermId);
      } catch {
        selectedTermCourses = [];
      }
    }

    if (selectedTermId) {
      setStoredTermId(normalizedUniversityId, selectedTermId);
    }

    if (warmAllTerms && terms.length > 1) {
      void Promise.allSettled(
        terms
          .filter((term) => term.id && term.id !== selectedTermId)
          .map((term) => warmTermCourses(normalizedUniversityId, term.id)),
      );
    }

    return {
      universityId: normalizedUniversityId,
      terms,
      selectedTermId,
      coursesLoaded: selectedTermCourses.length,
      hasWarmCatalog: terms.length > 0 && (!selectedTermId || selectedTermCourses.length > 0),
    };
  })();

  inFlightCatalogPrimes.set(taskKey, task);

  try {
    return await task;
  } finally {
    inFlightCatalogPrimes.delete(taskKey);
  }
}
