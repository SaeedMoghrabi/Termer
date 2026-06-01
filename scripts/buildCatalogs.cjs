const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const { getUniversityConfig, UNIVERSITIES } = require("../catalogConfig.cjs");
const {
  buildCatalogPayload,
  buildNameVariants,
  buildUnavailableCatalog,
  logStep,
  writeCatalog,
} = require("./catalogUtils.cjs");
const { fetchBannerCatalog } = require("./fetchBannerCatalog.cjs");
const { fetchAustCatalog } = require("./fetchAustCatalog.cjs");
const { fetchBauCatalog } = require("./fetchBauCatalog.cjs");
const { fetchLauCatalog } = require("./fetchLauCatalog.cjs");
const { fetchLiuCatalog } = require("./fetchLiuCatalog.cjs");
const { fetchLuCatalog } = require("./fetchLuCatalog.cjs");
const { fetchNduCatalog } = require("./fetchNduCatalog.cjs");
const { fetchProfessorDirectory } = require("./fetchProfessorDirectories.cjs");
const { fetchUsjCatalog } = require("./fetchUsjCatalog.cjs");
const { enrichCoursesWithPrerequisites } = require("./prerequisiteSources.cjs");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

function buildSuccessMessage(config, terms, courses) {
  const sectionCount = courses.length.toLocaleString("en-US");
  const visibleTerms = Array.isArray(terms) ? terms : [terms].filter(Boolean);

  if (visibleTerms.length <= 1) {
    const singleTerm = visibleTerms[0];
    return `${config.note} Synced ${sectionCount} sections for ${singleTerm?.description ?? "the published term"}.`;
  }

  const termSummary = visibleTerms.map((term) => term.description).join(", ");
  return `${config.note} Synced ${sectionCount} sections across ${visibleTerms.length} published terms: ${termSummary}.`;
}

function dedupeSources(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function readExistingCatalogPayload(universityId) {
  const filePaths = [
    path.join(__dirname, "..", "data", "catalogs", `${universityId}.json`),
    path.join(__dirname, "..", "data", "catalogs", `${universityId}.backup.json`),
  ];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(parsed?.courses) || parsed.courses.length === 0) {
        continue;
      }

      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

function termCodeOfCourse(course = {}) {
  return String(course.term_code ?? course.termCode ?? course.semester ?? "").trim();
}

function courseRefreshKey(course = {}) {
  return [
    termCodeOfCourse(course),
    String(course.crn || course.id || `${course.department}-${course.course_number}-${course.section}`)
      .trim()
      .toLowerCase(),
  ].join(":");
}

function groupCoursesByTerm(courses = []) {
  const map = new Map();

  for (const course of courses) {
    const termCode = termCodeOfCourse(course);
    if (!map.has(termCode)) {
      map.set(termCode, []);
    }
    map.get(termCode).push(course);
  }

  return map;
}

function mergeByKey(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    map.set(key, item);
  }

  return [...map.values()];
}

function mergeCatalogPayload(existingPayload, freshPayload) {
  if (!existingPayload) return freshPayload;

  const existingCourses = Array.isArray(existingPayload.courses) ? existingPayload.courses : [];
  const freshCourses = Array.isArray(freshPayload?.courses) ? freshPayload.courses : [];
  const existingCoursesByTerm = groupCoursesByTerm(existingCourses);
  const freshCoursesByTerm = groupCoursesByTerm(freshCourses);
  const allCourseTermCodes = new Set([
    ...existingCoursesByTerm.keys(),
    ...freshCoursesByTerm.keys(),
  ]);
  const mergedCourses = [];

  for (const termCode of allCourseTermCodes) {
    const existingTermCourses = existingCoursesByTerm.get(termCode) ?? [];
    const freshTermCourses = freshCoursesByTerm.get(termCode) ?? [];

    if (!freshTermCourses.length) {
      mergedCourses.push(...existingTermCourses);
      continue;
    }

    const looksPartial = existingTermCourses.length > 0
      && freshTermCourses.length < Math.ceil(existingTermCourses.length * 0.75);
    mergedCourses.push(
      ...(looksPartial
        ? mergeByKey([...existingTermCourses, ...freshTermCourses], courseRefreshKey)
        : freshTermCourses),
    );
  }
  const mergedTerms = mergeByKey(
    [
      ...(Array.isArray(existingPayload.terms) ? existingPayload.terms : []),
      ...(Array.isArray(freshPayload?.terms) ? freshPayload.terms : []),
    ],
    (term) => String(term?.code ?? "").trim(),
  );
  const freshCurrentTerm = (Array.isArray(freshPayload?.terms) ? freshPayload.terms : [])
    .find((term) => term?.is_current);
  const normalizedTerms = freshCurrentTerm
    ? mergedTerms.map((term) => ({
        ...term,
        is_current: String(term.code) === String(freshCurrentTerm.code),
      }))
    : mergedTerms;
  const mergedProfessors = mergeByKey(
    [
      ...(Array.isArray(existingPayload.professors) ? existingPayload.professors : []),
      ...(Array.isArray(freshPayload?.professors) ? freshPayload.professors : []),
    ],
    (professor) => String(professor?.id || professor?.full_name || "").trim().toLowerCase(),
  ).sort((left, right) =>
    String(left.full_name ?? "").localeCompare(String(right.full_name ?? "")),
  );

  return {
    ...existingPayload,
    ...freshPayload,
    message: freshPayload?.message ?? existingPayload.message,
    availability: freshPayload?.availability ?? existingPayload.availability,
    updatedAt: freshPayload?.updatedAt ?? new Date().toISOString(),
    terms: normalizedTerms,
    courses: mergedCourses,
    professors: mergedProfessors,
    sources: dedupeSources([
      ...(Array.isArray(existingPayload.sources) ? existingPayload.sources : []),
      ...(Array.isArray(freshPayload?.sources) ? freshPayload.sources : []),
    ]),
  };
}

async function loadLegacyProfessorMap() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    logStep("aub professor map", "Supabase credentials missing, using generated professor ids.");
    return new Map();
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const map = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("professors")
      .select("id, full_name")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Could not load AUB professor ids: ${error.message}`);
    }

    for (const professor of data ?? []) {
      for (const variant of buildNameVariants(professor.full_name)) {
        if (!map.has(variant)) {
          map.set(variant, professor.id);
        }
      }
    }

    if (!data || data.length < pageSize) {
      break;
    }

    from += data.length;
  }

  logStep("aub professor map", `${map.size} legacy name variants loaded`);
  return map;
}

async function buildLiveCatalog(universityId, fetcher) {
  const config = getUniversityConfig(universityId);
  if (!config) {
    throw new Error(`Unknown university: ${universityId}`);
  }

  const result = await fetcher();
  let professorDirectory = { professors: [], sources: [] };

  try {
    professorDirectory = await fetchProfessorDirectory(universityId);
    logStep(
      `${config.shortName} professor directory`,
      `${professorDirectory.professors?.length ?? 0} names`,
    );
  } catch (error) {
    logStep(
      `${config.shortName} professor directory failed`,
      error.message,
    );
  }

  const terms = Array.isArray(result.terms) && result.terms.length
    ? result.terms
    : [result.term].filter(Boolean);
  const prerequisiteSupplement = await enrichCoursesWithPrerequisites(universityId, result.courses ?? []);
  if (prerequisiteSupplement.count) {
    logStep(
      `${config.shortName} prerequisites`,
      `${prerequisiteSupplement.count} supplemental rules available`,
    );
  }
  return buildCatalogPayload({
    availability: result.availability ?? config.availability,
    message: result.message ?? buildSuccessMessage(config, terms, prerequisiteSupplement.courses),
    terms,
    courses: prerequisiteSupplement.courses,
    professors: [
      ...(result.professors ?? []),
      ...(professorDirectory.professors ?? []),
    ],
    sources: dedupeSources([
      ...(result.sources ?? []),
      ...(professorDirectory.sources ?? []),
      ...(prerequisiteSupplement.sources ?? []),
      config.sourceUrl,
    ]),
  });
}

async function buildCatalog(universityId, fetcher) {
  const config = getUniversityConfig(universityId);
  if (!config) {
    throw new Error(`Unknown university: ${universityId}`);
  }

  const existingPayload = readExistingCatalogPayload(universityId);

  try {
    logStep("start", config.name);
    const payload = await fetcher();

    const mergedPayload = mergeCatalogPayload(existingPayload, payload);
    if (existingPayload && (!Array.isArray(payload?.courses) || payload.courses.length === 0)) {
      logStep("kept previous courses", `${config.shortName} -> refresh returned no course rows`);
    }

    writeCatalog(universityId, mergedPayload);
    return { universityId, ok: true, payload: mergedPayload };
  } catch (error) {
    if (existingPayload) {
      logStep("kept previous catalog", `${config.shortName} -> ${error.message}`);
      return {
        universityId,
        ok: true,
        stale: true,
        warning: error,
        payload: existingPayload,
      };
    }

    logStep("failed", `${config.shortName} -> ${error.message}`);
    const payload = buildUnavailableCatalog(
      `${config.note} Sync failed on this run: ${error.message}`,
      config.sourceUrl,
      config.availability === "live" ? "partial" : config.availability,
    );
    writeCatalog(universityId, payload);
    return { universityId, ok: false, error };
  }
}

async function buildCatalogs() {
  const legacyProfessorMap = await loadLegacyProfessorMap();

  const results = [];
  results.push(await buildCatalog("aub", () =>
    buildLiveCatalog("aub", () =>
      fetchBannerCatalog({
        universityId: "aub",
        sourceUrl: "https://sturegss.aub.edu.lb/StudentRegistrationSsb",
        termFilter: (term) =>
          /spring|summer|fall/i.test(term.description)
          && !/law|medicine|med i|med ii|clubs|executive|online|winter session/i.test(term.description),
        legacyProfessorMap,
      }),
    )));
  results.push(await buildCatalog("lau", () => buildLiveCatalog("lau", fetchLauCatalog)));
  results.push(await buildCatalog("usek", () =>
    buildLiveCatalog("usek", () =>
      fetchBannerCatalog({
        universityId: "usek",
        sourceUrl: "https://banner-reg.usek.edu.lb/StudentRegistrationSsb",
        termFilter: (term) =>
          /spring|summer|fall/i.test(term.description)
          && !/online|winter/i.test(term.description),
        rejectUnauthorized: false,
      }),
    )));
  results.push(await buildCatalog("bau", () => buildLiveCatalog("bau", fetchBauCatalog)));
  results.push(await buildCatalog("ndu", () => buildLiveCatalog("ndu", fetchNduCatalog)));
  results.push(await buildCatalog("aust", () => buildLiveCatalog("aust", fetchAustCatalog)));
  results.push(await buildCatalog("usj", () => buildLiveCatalog("usj", fetchUsjCatalog)));
  results.push(await buildCatalog("lu", () => buildLiveCatalog("lu", fetchLuCatalog)));
  results.push(await buildCatalog("liu", () => buildLiveCatalog("liu", fetchLiuCatalog)));

  const failedLiveSources = results.filter((result) => {
    const config = getUniversityConfig(result.universityId);
    return config?.availability === "live" && !result.ok;
  });

  logStep(
    "summary",
    results
      .map((result) => {
        const config = getUniversityConfig(result.universityId);
        const status = result.stale ? "stale" : result.ok ? "ok" : "failed";
        return `${config.shortName}:${status}`;
      })
      .join(" | "),
  );

  if (failedLiveSources.length) {
    throw new Error(
      `Some live catalogs failed to build: ${failedLiveSources
        .map((result) => result.universityId.toUpperCase())
        .join(", ")}`,
    );
  }
}

module.exports = {
  buildCatalogs,
};

if (require.main === module) {
  buildCatalogs().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
