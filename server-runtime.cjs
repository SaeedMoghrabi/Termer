const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const {
  getAllCoursesForUniversity,
  getAttributeOptionsForTerm,
  getCoursesForTerm,
  getCoursesSearchResults,
  getProfessorCourses,
  getProfessors,
  getTermsForUniversity,
  getUniversitiesResponse,
  reloadCatalogCache,
} = require("./catalogStore.cjs");
const {
  buildAdvisorLocalResponse,
  buildAdvisorPromptContext,
} = require("./advisorKnowledge.cjs");
const {
  archiveAnnouncement,
  createAnnouncement,
  listAnnouncements,
  markAnnouncementsRead,
  readAnnouncementStore,
} = require("./adminAnnouncementsStore.cjs");
const {
  listMarketingProfiles,
  upsertMarketingProfile,
} = require("./userMarketingProfilesStore.cjs");
const {
  createId: createPreviousId,
  createPreviousDocument,
  deletePreviousDocument,
  getPreviousDocument,
  getUserPreviousStats,
  grantPreviousUnlock,
  hasUnlockedPrevious,
  listPreviousDocuments,
  updatePreviousDocument,
} = require("./previousesStore.cjs");
const { ingestPreviousUpload } = require("./previousesModeration.cjs");
const { buildCatalogs } = require("./scripts/buildCatalogs.cjs");
const { IMPORT_ROOTS } = require("./scripts/manualTimedImports.cjs");
const { buildVisualTimedImports } = require("./scripts/visualTimedImports.cjs");
const { getCurriculumStatus, reloadCurriculumPlans } = require("./curriculumPlans.cjs");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const CLIENT_DIST_DIR = path.join(__dirname, "CoursePlannerr", "dist");
const MANUAL_IMPORT_EXTENSIONS = new Set([".json", ".csv", ".xlsx", ".xls"]);
const VISUAL_IMPORT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
const MANUAL_IMPORT_WATCH_DEBOUNCE_MS = 2500;
const MANUAL_IMPORT_UNIVERSITIES = ["lu", "liu", "aust", "usj", "aub", "lau", "bau", "usek", "ndu"];

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

function parseCsvList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function stripTrailingSlash(value = "") {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function normalizeOrigin(value = "") {
  const raw = stripTrailingSlash(value);
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

const publicSiteUrl = stripTrailingSlash(process.env.PUBLIC_SITE_URL || "");
const canonicalOrigin = normalizeOrigin(publicSiteUrl);
const configuredAllowedOrigins = new Set(
  [
    ...parseCsvList(process.env.ALLOWED_ORIGINS),
    publicSiteUrl,
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean),
);
const trustProxyEnabled = envFlag(process.env.TRUST_PROXY, true);
const enforceCanonicalOrigin = envFlag(process.env.ENFORCE_CANONICAL_ORIGIN, false);
const enableHsts = envFlag(process.env.ENABLE_HSTS, false);

if (trustProxyEnabled) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (configuredAllowedOrigins.size === 0) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (configuredAllowedOrigins.has(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin not allowed: ${normalizedOrigin}`));
  },
  credentials: false,
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "15mb" }));
app.use((req, res, next) => {
  if (enforceCanonicalOrigin && canonicalOrigin && req.method === "GET") {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const proto = forwardedProto || req.protocol || "http";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    if (host) {
      const requestOrigin = normalizeOrigin(`${proto}://${host}`);
      if (requestOrigin && requestOrigin !== canonicalOrigin) {
        res.redirect(308, `${canonicalOrigin}${req.originalUrl || "/"}`);
        return;
      }
    }
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (enableHsts) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
});
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function getAiStatusPayload() {
  return {
    remoteEnabled: false,
    provider: "local-deterministic-advisor",
    model: "local deterministic advisor assistant",
    message:
      "The runtime is serving live catalog data and a deterministic academic advisor from the local catalog snapshot.",
  };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUniversityId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTermId(value) {
  return String(value ?? "").trim();
}

function envFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function envNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const catalogAutoRefreshEnabled = envFlag(process.env.CATALOG_AUTO_REFRESH, true);
const catalogRefreshOnStart = envFlag(process.env.CATALOG_AUTO_REFRESH_ON_START, true);
const catalogRefreshIntervalMinutes = envNumber(process.env.CATALOG_REFRESH_INTERVAL_MINUTES, 2);
const catalogRefreshIntervalMs = catalogRefreshIntervalMinutes * 60 * 1000;

let catalogRefreshPromise = null;
let manualImportRefreshTimer = null;
const activeManualImportWatchers = [];
let queuedCatalogRefreshReason = "";
let visualImportBuildPromise = null;
const catalogRuntimeStatus = {
  sequence: 1,
  changedAt: new Date().toISOString(),
  reason: "startup",
  autoRefreshEnabled: catalogAutoRefreshEnabled,
  refreshIntervalMinutes: catalogRefreshIntervalMinutes,
  lastRefreshStartedAt: null,
  lastRefreshFinishedAt: null,
  lastRefreshSucceededAt: null,
  lastRefreshError: null,
  lastVisualImportAt: null,
  lastManualImportReloadAt: null,
  lastCurriculumRefreshStartedAt: null,
  lastCurriculumRefreshFinishedAt: null,
  lastCurriculumRefreshSucceededAt: null,
  lastCurriculumRefreshError: null,
  curriculumPlanCount: 0,
  parsedCurriculumPlanCount: 0,
  curriculumGeneratedAt: null,
  curriculumByUniversity: {},
};

function setCatalogRuntimeStatus(fields = {}) {
  Object.assign(catalogRuntimeStatus, fields);
}

function bumpCatalogRuntimeSequence(reason, fields = {}) {
  catalogRuntimeStatus.sequence += 1;
  catalogRuntimeStatus.changedAt = new Date().toISOString();
  catalogRuntimeStatus.reason = reason;
  Object.assign(catalogRuntimeStatus, fields);
}

function runCurriculumBuildProcess() {
  const builderPath = path.join(__dirname, "scripts", "buildCurriculumPlans.cjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [builderPath], {
      cwd: __dirname,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const message = stderr.trim() || stdout.trim() || `Curriculum build exited with code ${code}.`;
      reject(new Error(message));
    });
  });
}

async function runVisualImportBuild(reason = "visual import") {
  if (visualImportBuildPromise) return visualImportBuildPromise;

  visualImportBuildPromise = (async () => {
    const startedAt = Date.now();
    try {
      const summary = await buildVisualTimedImports();
      reloadCatalogCache();
      bumpCatalogRuntimeSequence(`visual-import:${reason}`, {
        lastVisualImportAt: new Date().toISOString(),
        lastRefreshError: null,
      });
      if (summary.length > 0) {
        console.log(`[visual-imports] processed ${summary.length} visual timetable file(s) (${reason}) in ${Math.round((Date.now() - startedAt) / 1000)}s`);
      }
    } catch (error) {
      setCatalogRuntimeStatus({
        lastRefreshError: error?.message || String(error),
      });
      console.error(`[visual-imports] failed (${reason}): ${error?.message || error}`);
    } finally {
      visualImportBuildPromise = null;
    }
  })();

  return visualImportBuildPromise;
}

async function runCatalogRefresh(reason = "manual") {
  if (catalogRefreshPromise) {
    queuedCatalogRefreshReason = queuedCatalogRefreshReason || reason;
    return catalogRefreshPromise;
  }

  catalogRefreshPromise = (async () => {
    const startedAt = Date.now();
    setCatalogRuntimeStatus({
      lastRefreshStartedAt: new Date().toISOString(),
      lastRefreshError: null,
    });
    console.log(`[catalogs] refresh start (${reason})`);
    try {
      await buildCatalogs();
      reloadCatalogCache();
      setCatalogRuntimeStatus({
        lastCurriculumRefreshStartedAt: new Date().toISOString(),
        lastCurriculumRefreshError: null,
      });
      try {
        await runCurriculumBuildProcess();
        const curriculumStatus = reloadCurriculumPlans();
        setCatalogRuntimeStatus({
          lastCurriculumRefreshFinishedAt: new Date().toISOString(),
          lastCurriculumRefreshSucceededAt: new Date().toISOString(),
          lastCurriculumRefreshError: null,
          curriculumPlanCount: Number(curriculumStatus?.totalPlans ?? 0) || 0,
          parsedCurriculumPlanCount: Number(curriculumStatus?.parsedPlans ?? 0) || 0,
          curriculumGeneratedAt: curriculumStatus?.generatedAt ?? null,
          curriculumByUniversity: curriculumStatus?.byUniversity ?? {},
        });
      } catch (curriculumError) {
        const curriculumStatus = reloadCurriculumPlans();
        setCatalogRuntimeStatus({
          lastCurriculumRefreshFinishedAt: new Date().toISOString(),
          lastCurriculumRefreshError: curriculumError?.message || String(curriculumError),
          curriculumPlanCount: Number(curriculumStatus?.totalPlans ?? 0) || 0,
          parsedCurriculumPlanCount: Number(curriculumStatus?.parsedPlans ?? 0) || 0,
          curriculumGeneratedAt: curriculumStatus?.generatedAt ?? null,
          curriculumByUniversity: curriculumStatus?.byUniversity ?? {},
        });
        console.error(`[curriculum] refresh failed (${reason}): ${curriculumError?.message || curriculumError}`);
      }
      bumpCatalogRuntimeSequence(`catalog-refresh:${reason}`, {
        lastRefreshFinishedAt: new Date().toISOString(),
        lastRefreshSucceededAt: new Date().toISOString(),
        lastRefreshError: null,
      });
      console.log(`[catalogs] refresh complete (${reason}) in ${Math.round((Date.now() - startedAt) / 1000)}s`);
    } catch (error) {
      reloadCatalogCache();
      setCatalogRuntimeStatus({
        lastRefreshFinishedAt: new Date().toISOString(),
        lastRefreshError: error?.message || String(error),
      });
      console.error(`[catalogs] refresh failed (${reason}): ${error?.message || error}`);
    } finally {
      catalogRefreshPromise = null;
      const nextReason = queuedCatalogRefreshReason;
      queuedCatalogRefreshReason = "";
      if (nextReason) {
        void runCatalogRefresh(nextReason);
      }
    }
  })();

  return catalogRefreshPromise;
}

function scheduleManualImportRefresh(reason = "manual import update") {
  if (manualImportRefreshTimer) clearTimeout(manualImportRefreshTimer);
  manualImportRefreshTimer = setTimeout(() => {
    manualImportRefreshTimer = null;
    reloadCatalogCache();
    bumpCatalogRuntimeSequence(reason, {
      lastManualImportReloadAt: new Date().toISOString(),
      lastRefreshError: null,
    });
    console.log(`[catalogs] cache reloaded (${reason})`);
  }, MANUAL_IMPORT_WATCH_DEBOUNCE_MS);
}

function startManualImportWatchers() {
  IMPORT_ROOTS.forEach((root) => {
    try {
      fs.mkdirSync(root, { recursive: true });
    } catch {}
    try {
      const watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
        const normalizedName = String(filename || "").trim();
        if (!normalizedName) return;
        const extension = path.extname(normalizedName).toLowerCase();
        const isManualImport = MANUAL_IMPORT_EXTENSIONS.has(extension);
        const isVisualImport = VISUAL_IMPORT_EXTENSIONS.has(extension);
        if (!isManualImport && !isVisualImport) return;
        const pathParts = normalizedName.split(/[\\/]+/).map((part) => part.toLowerCase()).filter(Boolean);
        if (!pathParts.some((part) => MANUAL_IMPORT_UNIVERSITIES.includes(part))) return;
        if (isVisualImport) {
          if (manualImportRefreshTimer) clearTimeout(manualImportRefreshTimer);
          manualImportRefreshTimer = setTimeout(() => {
            manualImportRefreshTimer = null;
            void runVisualImportBuild(`visual import ${eventType}`);
          }, MANUAL_IMPORT_WATCH_DEBOUNCE_MS);
          return;
        }
        scheduleManualImportRefresh(`manual import ${eventType}`);
      });
      activeManualImportWatchers.push(watcher);
    } catch (error) {
      console.warn(`[catalogs] could not watch manual import root ${root}: ${error?.message || error}`);
    }
  });
}

function buildUniversityContext(universityId, catalogStats = null) {
  const fallbackUniversity = getUniversitiesResponse().find((entry) => entry.id === universityId);
  return {
    id: universityId,
    name: String(catalogStats?.universityName ?? fallbackUniversity?.name ?? universityId.toUpperCase()).trim(),
  };
}

function mergeAdvisorCourses(...courseLists) {
  const byId = new Map();
  const byFallbackKey = new Map();

  courseLists.flat().filter(Boolean).forEach((course) => {
    const id = String(course?.id ?? "").trim();
    if (id) {
      if (!byId.has(id)) byId.set(id, course);
      return;
    }

    const fallbackKey = [
      String(course?.university_id ?? course?.universityId ?? "").trim().toLowerCase(),
      String(course?.semester ?? course?.termId ?? course?.term_code ?? "").trim(),
      String(course?.crn ?? "").trim(),
      String(course?.code ?? "").trim().toUpperCase(),
      String(course?.section ?? "").trim().toUpperCase(),
    ].join("|");

    if (!byFallbackKey.has(fallbackKey)) {
      byFallbackKey.set(fallbackKey, course);
    }
  });

  return [...byId.values(), ...byFallbackKey.values()];
}

function advisorNormalizeText(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function advisorNormalizeTermCode(value = "") {
  return String(value ?? "").trim().split(":").pop().trim();
}

function isCatalogPlaceholderTermCode(value = "") {
  return /^catalog(?:-|$)/i.test(advisorNormalizeTermCode(value));
}

function hasAdvisorMeetingTime(course = {}) {
  const meetings = Array.isArray(course?.meetings)
    ? course.meetings
    : Array.isArray(course?.schedule)
      ? course.schedule
      : course?.schedule && typeof course.schedule === "object"
        ? [course.schedule]
        : [course];

  return meetings.some((meeting) => {
    const days = Array.isArray(meeting?.days)
      ? meeting.days
      : String(meeting?.days ?? meeting?.day ?? "").trim();
    const start = String(meeting?.start ?? meeting?.start_time ?? "").trim();
    const end = String(meeting?.end ?? meeting?.end_time ?? "").trim();
    const range = String(meeting?.time ?? meeting?.hours ?? course?.schedule?.time ?? "").trim();
    return Boolean(days && ((start && end) || /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(range)));
  });
}

function resolveAdvisorTermSelection(universityId, requestedTermId, requestedSemesterLabel, universityTerms = []) {
  const terms = array(universityTerms);
  const requestedFull = String(requestedTermId ?? "").trim();
  const requestedCode = advisorNormalizeTermCode(requestedFull);
  const requestedLabel = advisorNormalizeText(requestedSemesterLabel);

  const ranked = terms
    .map((term, index) => {
      const fullCode = String(term?.code ?? "").trim();
      const sourceCode = advisorNormalizeTermCode(term?.source_code ?? term?.code ?? "");
      const description = String(term?.description ?? term?.label ?? term?.name ?? "").trim();
      const normalizedDescription = advisorNormalizeText(description);
      const placeholder = isCatalogPlaceholderTermCode(sourceCode || fullCode);
      const current = Boolean(term?.is_current);
      const courseCount = Number(term?.course_count ?? 0) || 0;
      let score = 0;

      if (requestedFull && fullCode === requestedFull) score += placeholder ? 150 : 700;
      if (requestedCode && sourceCode === requestedCode) score += placeholder ? 150 : 650;
      if (requestedLabel && normalizedDescription === requestedLabel) score += placeholder ? 120 : 520;
      if (requestedLabel && normalizedDescription.includes(requestedLabel)) score += placeholder ? 80 : 360;
      if (requestedLabel && requestedLabel.includes(normalizedDescription) && normalizedDescription) score += placeholder ? 60 : 300;
      if (current) score += 340;
      if (!placeholder) score += 220;
      if (courseCount > 0) score += 80;
      score += Math.max(0, 25 - index);

      return {
        term,
        score,
        placeholder,
        current,
        courseCount,
        description,
        sourceCode,
      };
    })
    .sort((left, right) =>
      right.score - left.score
      || Number(right.current) - Number(left.current)
      || Number(!left.placeholder) - Number(!right.placeholder)
      || right.courseCount - left.courseCount,
    );

  const picked = ranked[0]?.term ?? null;
  const pickedDescription = String(picked?.description ?? picked?.label ?? picked?.name ?? requestedSemesterLabel ?? "").trim();
  const pickedCode = String(picked?.code ?? requestedTermId ?? "").trim();
  const pickedSourceCode = advisorNormalizeTermCode(picked?.source_code ?? picked?.code ?? requestedTermId ?? "");
  const swappedAwayFromPlaceholder = Boolean(
    picked
    && requestedCode
    && requestedCode !== pickedSourceCode
    && isCatalogPlaceholderTermCode(requestedCode)
    && !isCatalogPlaceholderTermCode(pickedSourceCode),
  );

  return {
    effectiveTerm: picked,
    effectiveTermId: pickedCode,
    effectiveTermLabel: pickedDescription || requestedSemesterLabel || "",
    resolutionNote: swappedAwayFromPlaceholder
      ? `I answered from ${pickedDescription || pickedSourceCode} because the previously selected catalog-style term was stale and this university now has a richer fetched section feed.`
      : "",
  };
}

function buildCatalogStats(courses, university, semesterLabel, incomingCatalogStats = null, metadata = {}) {
  const uniqueCourses = new Set(
    array(courses)
      .map((course) => String(course?.code ?? "").trim())
      .filter(Boolean),
  );
  const professors = new Set(
    array(courses)
      .map((course) => String(course?.instructor ?? course?.professors?.full_name ?? "").trim())
      .filter(Boolean)
      .filter((name) => !/^tba$/i.test(name)),
  );
  const campuses = [...new Set(
    array(courses)
      .map((course) => String(course?.campus ?? "").trim())
      .filter(Boolean),
  )];
  const locations = [...new Set(
    array(courses)
      .flatMap((course) => {
        const directLocations = Array.isArray(course?.meetings)
          ? course.meetings.map((meeting) => String(meeting?.location ?? "").trim())
          : [];
        const fallback = [
          String(course?.schedule?.location ?? "").trim(),
          String(course?.location ?? "").trim(),
          String(course?.room ?? "").trim(),
        ];
        return [...directLocations, ...fallback].filter(Boolean);
      }),
  )];
  const descriptions = array(courses).filter((course) =>
    String(
      course?.description
      ?? course?.catalogDescription
      ?? course?.courseDescription
      ?? course?.summary
      ?? "",
    ).trim(),
  ).length;
  const sectionsWithPrerequisites = array(courses).filter((course) =>
    String(course?.prerequisites ?? "").trim(),
  ).length;
  const sectionsWithOpenSeats = array(courses).filter((course) => {
    const limit = Number(course?.capacity?.limit ?? course?.capacity ?? 0);
    const enrolled = Number(course?.capacity?.enrolled ?? course?.enrolled_count ?? 0);
    return limit > 0 && enrolled < limit;
  }).length;
  const timedSections = array(courses).filter((course) => hasAdvisorMeetingTime(course)).length;
  const publishedTerms = array(metadata.universityTerms)
    .map((term) => String(term?.description ?? term?.label ?? term?.name ?? "").trim())
    .filter(Boolean);
  const currentTerm = array(metadata.universityTerms).find((term) => term?.is_current)
    || array(metadata.universityTerms)[0]
    || null;

  return {
    universityId: String(university?.id ?? "").trim().toLowerCase(),
    universityName: university.name,
    semesterLabel: semesterLabel || incomingCatalogStats?.semesterLabel || "",
    termId: metadata.effectiveTermId || incomingCatalogStats?.termId || "",
    currentTermCode: String(currentTerm?.code ?? metadata.effectiveTermId ?? "").trim() || null,
    currentTermLabel: String(currentTerm?.description ?? currentTerm?.label ?? currentTerm?.name ?? metadata.effectiveTermLabel ?? "").trim() || null,
    totalSections: array(courses).length,
    uniqueCourses: uniqueCourses.size,
    professors: professors.size,
    professorCount: professors.size,
    campuses,
    locations: locations.slice(0, 20),
    timedSections,
    sectionsWithOpenSeats,
    sectionsWithPrerequisites,
    courseDescriptionCount: descriptions,
    termCount: array(metadata.universityTerms).length,
    publishedTerms,
    sectionsWithPublishedMeetings: timedSections,
    sectionsWithPublishedLocations: locations.length,
    attributeTypes: incomingCatalogStats?.attributeTypes ?? incomingCatalogStats?.attributes ?? [],
    updatedAt: metadata.updatedAt ?? incomingCatalogStats?.updatedAt ?? null,
    resolutionNote: metadata.resolutionNote || "",
    effectiveTermLabel: metadata.effectiveTermLabel || semesterLabel || incomingCatalogStats?.semesterLabel || "",
  };
}

function buildRatingsAverage(ratings = [], includeDifficulty = false) {
  if (!ratings.length) {
    return includeDifficulty
      ? { rating: 0, difficulty: 0, count: 0 }
      : { rating: 0, count: 0 };
  }

  const average = {
    rating: (ratings.reduce((sum, rating) => sum + Number(rating.rating || 0), 0) / ratings.length).toFixed(1),
    count: ratings.length,
  };

  if (includeDifficulty) {
    average.difficulty = (
      ratings.reduce((sum, rating) => sum + Number(rating.difficulty || 0), 0) / ratings.length
    ).toFixed(1);
  }

  return average;
}

async function readRows(table, filters = []) {
  if (!supabase) return [];
  let query = supabase.from(table).select("*");
  filters.forEach(([type, left, right]) => {
    if (type === "eq") query = query.eq(left, right);
  });
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function createScopedSupabaseClient(accessToken) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !accessToken) {
    return null;
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function normalizeCourseCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, " ");
}

function compactCourseCode(value) {
  return normalizeCourseCode(value).replace(/[^A-Z0-9]+/g, "");
}

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractScheduleCourseCodes(schedule) {
  return parseMaybeJsonArray(schedule?.courses)
    .map((course) => normalizeCourseCode(course?.code))
    .filter(Boolean);
}

function buildAudienceContext(users = [], schedules = []) {
  const contexts = new Map();

  const ensureContext = (userId) => {
    const normalizedUserId = normalizeText(userId);
    if (!normalizedUserId) return null;
    if (!contexts.has(normalizedUserId)) {
      contexts.set(normalizedUserId, {
        userId: normalizedUserId,
        email: "",
        major: "",
        universityId: "",
        courseCodeCompacts: new Set(),
      });
    }
    return contexts.get(normalizedUserId);
  };

  array(users).forEach((user) => {
    const context = ensureContext(user?.id);
    if (!context) return;
    context.email = normalizeText(user?.email);
    context.major = normalizeText(user?.major);
    context.universityId = normalizeText(user?.university_id || context.universityId).toLowerCase();
  });

  array(schedules).forEach((schedule) => {
    const context = ensureContext(schedule?.user_id);
    if (!context) return;
    if (!context.universityId) {
      context.universityId = normalizeText(schedule?.university_id).toLowerCase();
    }
    extractScheduleCourseCodes(schedule).forEach((code) => {
      context.courseCodeCompacts.add(compactCourseCode(code));
    });
  });

  return contexts;
}

function announcementMatchesContext(announcement, context) {
  if (!announcement || announcement.archivedAt) return false;
  if (!context?.userId) return false;

  const targetUserIds = array(announcement.targetUserIds).map((value) => normalizeText(value));
  const targetUniversities = array(announcement.universityIds)
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);
  const targetCourseCodes = array(announcement.targetCourseCodes)
    .map((value) => compactCourseCode(value))
    .filter(Boolean);

  if (targetUserIds.length > 0 && !targetUserIds.includes(context.userId)) {
    return false;
  }

  if (targetUniversities.length > 0 && !targetUniversities.includes(context.universityId)) {
    return false;
  }

  if (targetCourseCodes.length > 0) {
    const hasMatch = targetCourseCodes.some((code) => context.courseCodeCompacts.has(code));
    if (!hasMatch) return false;
  }

  return true;
}

async function isAdminUser(userId) {
  if (!supabase) return false;
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return false;
  const { data: userRecord } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", normalizedUserId)
    .maybeSingle();
  if (userRecord?.is_admin) return true;
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", normalizedUserId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.is_admin);
}

function buildPreviousAccessState(document, userId, isAdmin, stats) {
  const isOwnUpload = Boolean(userId) && normalizeText(document.userId) === normalizeText(userId);
  const isUnlocked = Boolean(userId) && hasUnlockedPrevious(userId, document.id);
  const approved = normalizeText(document.status) === "approved";
  const canViewFull = Boolean(isAdmin || isOwnUpload || isUnlocked);
  const canPreview = approved || isOwnUpload || isAdmin;
  return {
    isOwnUpload,
    isUnlocked,
    canViewFull,
    canPreview,
    requiresContribution: approved && !canViewFull,
    unlockCreditsRemaining: stats?.unlockCredits ?? 0,
  };
}

function buildPreviousClientDocument(document, userId, isAdmin, stats) {
  const access = buildPreviousAccessState(document, userId, isAdmin, stats);
  return {
    id: document.id,
    universityId: document.universityId,
    courseCode: document.courseCode,
    courseTitle: document.courseTitle,
    courseId: document.courseId,
    documentTitle: document.documentTitle,
    documentKind: document.documentKind,
    examTermLabel: document.examTermLabel,
    note: document.note,
    originalFileName: document.originalFileName,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    uploadedByEmail: access.isOwnUpload || isAdmin ? document.userEmail : "",
    status: document.status,
    aiConfidence: document.aiConfidence,
    aiReason: access.isOwnUpload || isAdmin ? document.aiReason : "",
    aiLabels: access.isOwnUpload || isAdmin ? document.aiLabels : [],
    adminComment: access.isOwnUpload || isAdmin ? document.adminComment : "",
    extractedTextPreview: document.extractedTextPreview,
    previewUrl: access.canPreview && document.previewPath
      ? `/api/previouses/${encodeURIComponent(document.id)}/preview`
      : "",
    fileUrl: access.canViewFull
      ? `/api/previouses/${encodeURIComponent(document.id)}/file?userId=${encodeURIComponent(userId || "")}`
      : "",
    sourcePages: document.sourcePages || 0,
    ...access,
  };
}

async function buildAnnouncementAudienceSnapshot() {
  const [users, schedules] = await Promise.all([
    readRows("users").catch(() => []),
    readRows("schedules").catch(() => []),
  ]);
  return buildAudienceContext(users, schedules);
}

function buildAnnouncementAudienceSummary(announcement) {
  const userCount = array(announcement.targetUserIds).filter(Boolean).length;
  const universities = array(announcement.universityIds)
    .map((value) => normalizeText(value).toUpperCase())
    .filter(Boolean);
  const courses = array(announcement.targetCourseCodes)
    .map((value) => normalizeCourseCode(value))
    .filter(Boolean);

  if (userCount > 0) return `${userCount} selected account${userCount === 1 ? "" : "s"}`;
  if (courses.length > 0 && universities.length > 0) {
    return `${universities.join(", ")} students taking ${courses.join(", ")}`;
  }
  if (courses.length > 0) return `Students taking ${courses.join(", ")}`;
  if (universities.length > 0) return `${universities.join(", ")} students`;
  return "All student accounts";
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
    clientBuildPresent: fs.existsSync(path.join(CLIENT_DIST_DIR, "index.html")),
    aiStatus: getAiStatusPayload(),
  });
});

app.get("/api/ready", (req, res) => {
  const clientBuildPresent = fs.existsSync(path.join(CLIENT_DIST_DIR, "index.html"));
  const universities = getUniversitiesResponse();
  const hasCatalogMetadata = universities.length > 0;
  const ready = clientBuildPresent && hasCatalogMetadata;

  res.status(ready ? 200 : 503).json({
    ok: ready,
    status: ready ? "ready" : "not-ready",
    timestamp: new Date().toISOString(),
    clientBuildPresent,
    publicSiteUrl: publicSiteUrl || null,
    allowedOrigins: [...configuredAllowedOrigins],
    hasCatalogMetadata,
    aiStatus: getAiStatusPayload(),
  });
});

app.get("/api/catalog-status", (req, res) => {
  const curriculumStatus = getCurriculumStatus();
  res.json({
    ...catalogRuntimeStatus,
    curriculum: curriculumStatus,
    universities: getUniversitiesResponse().map((university) => ({
      id: university.id,
      updatedAt: university.updatedAt ?? null,
      hasTerms: Boolean(university.hasTerms),
      hasCourses: Boolean(university.hasCourses),
      currentTermCode: university.currentTermCode ?? null,
    })),
  });
});

app.get("/api/curriculum-status", (req, res) => {
  res.json({
    ...getCurriculumStatus(),
    refreshIntervalMinutes: catalogRefreshIntervalMinutes,
  });
});

app.get("/api/ai-status", (req, res) => {
  res.json(getAiStatusPayload());
});

app.get("/api/universities", (req, res) => {
  res.json(getUniversitiesResponse());
});

app.get("/api/terms", (req, res) => {
  const universityId = String(req.query.university ?? "aub").trim().toLowerCase();
  res.json(getTermsForUniversity(universityId));
});

app.get("/api/attributes", (req, res) => {
  const universityId = String(req.query.university ?? "aub").trim().toLowerCase();
  const termId = String(req.query.term ?? "").trim();
  res.json(getAttributeOptionsForTerm({ universityId, termId }));
});

app.get("/api/courses", (req, res) => {
  const universityId = String(req.query.university ?? "").trim().toLowerCase();
  const termId = String(req.query.term ?? "").trim();
  const search = String(req.query.search ?? "").trim();
  res.json(getCoursesForTerm({ universityId, termId, search }));
});

app.get("/api/courses/search", (req, res) => {
  const universityId = String(req.query.university ?? "aub").trim().toLowerCase();
  const search = String(req.query.search ?? "").trim();
  res.json(getCoursesSearchResults({ universityId, search }));
});

app.get("/api/professors", (req, res) => {
  const universityId = String(req.query.university ?? "aub").trim().toLowerCase();
  const search = String(req.query.search ?? "").trim();
  res.json(getProfessors({ universityId, search }));
});

app.get("/api/professors/:professorId/courses", (req, res) => {
  const professorId = decodeURIComponent(req.params.professorId);
  const universityId = String(req.query.university ?? "").trim().toLowerCase()
    || professorId.split("__")[0]
    || "aub";
  res.json(getProfessorCourses(universityId, professorId));
});

app.get("/api/ratings/course/:department/:courseNumber", async (req, res) => {
  try {
    const department = decodeURIComponent(req.params.department);
    const courseNumber = decodeURIComponent(req.params.courseNumber);
    const ratings = await readRows("course_ratings", [
      ["eq", "department", department],
      ["eq", "course_number", courseNumber],
    ]);
    res.json({ ratings, averages: buildRatingsAverage(ratings, true) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load course ratings." });
  }
});

app.post("/api/ratings/course", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Ratings database is not configured." });
  }

  const payload = req.body ?? {};
  const { error } = await supabase
    .from("course_ratings")
    .upsert(payload, { onConflict: "user_id,department,course_number" });

  if (error) return res.status(500).json(error);
  return res.json({ success: true });
});

app.get("/api/ratings/professor/:professorId", async (req, res) => {
  try {
    const professorId = decodeURIComponent(req.params.professorId);
    const ratings = await readRows("professor_ratings", [["eq", "professor_id", professorId]]);
    res.json({ ratings, averages: buildRatingsAverage(ratings, false) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load professor ratings." });
  }
});

app.post("/api/ratings/professor", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Ratings database is not configured." });
  }

  const payload = req.body ?? {};
  const { error } = await supabase
    .from("professor_ratings")
    .upsert(payload, { onConflict: "user_id,professor_id,department,course_number" });

  if (error) return res.status(500).json(error);
  return res.json({ success: true });
});

app.post("/api/syllabi/review", async (req, res) => {
  res.status(503).json({
    success: false,
    reason: "AI syllabus review is temporarily unavailable in this runtime.",
  });
});

app.get("/api/previouses", async (req, res) => {
  try {
    const universityId = normalizeUniversityId(req.query.universityId || req.query.university || "");
    const courseCode = normalizeCourseCode(req.query.courseCode || "");
    const requestedUserId = normalizeText(req.query.userId);
    const isAdmin = requestedUserId ? await isAdminUser(requestedUserId) : false;
    const userStats = getUserPreviousStats(requestedUserId);
    const targetCourseCompact = compactCourseCode(courseCode);

    const documents = listPreviousDocuments()
      .filter((document) => {
        if (universityId && normalizeUniversityId(document.universityId) !== universityId) return false;
        if (targetCourseCompact && compactCourseCode(document.courseCode) !== targetCourseCompact) return false;
        const access = buildPreviousAccessState(document, requestedUserId, isAdmin, userStats);
        return normalizeText(document.status) === "approved" || access.isOwnUpload || isAdmin;
      })
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      .map((document) => buildPreviousClientDocument(document, requestedUserId, isAdmin, userStats));

    res.json({
      documents,
      stats: userStats,
      access: {
        isAdmin,
        canUpload: Boolean(requestedUserId),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not load previouses." });
  }
});

app.post("/api/previouses/upload", async (req, res) => {
  try {
    const userId = normalizeText(req.body?.userId);
    const userEmail = normalizeText(req.body?.userEmail).toLowerCase();
    const universityId = normalizeUniversityId(req.body?.universityId);
    const courseCode = normalizeCourseCode(req.body?.courseCode);
    const courseTitle = normalizeText(req.body?.courseTitle);
    const fileName = normalizeText(req.body?.fileName);
    const fileDataUrl = normalizeText(req.body?.fileDataUrl);

    if (!userId || !userEmail) {
      return res.status(400).json({ error: "You must be signed in to upload a previous." });
    }
    if (!universityId || !courseCode || !fileName || !fileDataUrl) {
      return res.status(400).json({ error: "Missing course or file information." });
    }

    const previousId = createPreviousId("prev");
    const ingested = await ingestPreviousUpload({
      previousId,
      userId,
      userEmail,
      universityId,
      courseCode,
      courseTitle,
      courseId: req.body?.courseId,
      documentTitle: req.body?.documentTitle,
      documentKind: req.body?.documentKind,
      examTermLabel: req.body?.examTermLabel,
      note: req.body?.note,
      fileName,
      fileDataUrl,
    });

    const duplicate = listPreviousDocuments().find((document) =>
      normalizeUniversityId(document.universityId) === universityId
      && compactCourseCode(document.courseCode) === compactCourseCode(courseCode)
      && normalizeText(document.fingerprint) === normalizeText(ingested.fingerprint),
    );

    if (duplicate) {
      try {
        if (ingested.filePath && fs.existsSync(ingested.filePath)) fs.unlinkSync(ingested.filePath);
        if (ingested.previewPath && fs.existsSync(ingested.previewPath)) fs.unlinkSync(ingested.previewPath);
      } catch {}
      return res.status(409).json({
        error: "This exact previous is already in the library for that course.",
        duplicateId: duplicate.id,
      });
    }

    const created = createPreviousDocument(ingested);
    const userStats = getUserPreviousStats(userId);
    const isAdmin = await isAdminUser(userId);

    res.json({
      success: true,
      document: buildPreviousClientDocument(created, userId, isAdmin, userStats),
      stats: userStats,
    });
  } catch (error) {
    res.status(400).json({ error: error?.message || "Could not upload that previous." });
  }
});

app.post("/api/previouses/:id/unlock", async (req, res) => {
  try {
    const previousId = normalizeText(req.params.id);
    const userId = normalizeText(req.body?.userId);
    if (!previousId || !userId) {
      return res.status(400).json({ error: "Missing previousId or userId." });
    }

    const document = getPreviousDocument(previousId);
    if (!document) {
      return res.status(404).json({ error: "Previous not found." });
    }

    const isAdmin = await isAdminUser(userId);
    const userStats = getUserPreviousStats(userId);
    const access = buildPreviousAccessState(document, userId, isAdmin, userStats);

    if (access.canViewFull) {
      return res.json({
        success: true,
        document: buildPreviousClientDocument(document, userId, isAdmin, userStats),
        stats: userStats,
      });
    }

    if (normalizeText(document.status) !== "approved") {
      return res.status(400).json({ error: "Only approved previouses can be unlocked." });
    }

    if ((userStats.unlockCredits ?? 0) < 1) {
      return res.status(403).json({
        error: "Upload and get one approved previous first to unlock a full document.",
      });
    }

    grantPreviousUnlock({ userId, previousId, unlockedBy: "credit" });
    const nextStats = getUserPreviousStats(userId);
    const updated = getPreviousDocument(previousId);
    res.json({
      success: true,
      document: buildPreviousClientDocument(updated, userId, isAdmin, nextStats),
      stats: nextStats,
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not unlock this previous." });
  }
});

app.get("/api/previouses/:id/preview", async (req, res) => {
  try {
    const previousId = normalizeText(req.params.id);
    const document = getPreviousDocument(previousId);
    if (!document) {
      return res.status(404).json({ error: "Previous not found." });
    }
    if (!document.previewPath || !fs.existsSync(document.previewPath)) {
      return res.status(404).json({ error: "Preview not available." });
    }
    res.sendFile(document.previewPath);
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not load preview." });
  }
});

app.get("/api/previouses/:id/file", async (req, res) => {
  try {
    const previousId = normalizeText(req.params.id);
    const userId = normalizeText(req.query.userId);
    const document = getPreviousDocument(previousId);
    if (!document) {
      return res.status(404).json({ error: "Previous not found." });
    }
    if (!document.filePath || !fs.existsSync(document.filePath)) {
      return res.status(404).json({ error: "File not found." });
    }

    const isAdmin = userId ? await isAdminUser(userId) : false;
    const userStats = getUserPreviousStats(userId);
    const access = buildPreviousAccessState(document, userId, isAdmin, userStats);
    if (!access.canViewFull) {
      return res.status(403).json({ error: "You need an approved upload credit to open the full previous." });
    }

    res.download(document.filePath, document.originalFileName || path.basename(document.filePath));
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not load the full previous." });
  }
});

app.get("/api/admin/previouses", async (req, res) => {
  try {
    const requesterUserId = normalizeText(req.query.requesterUserId);
    if (!requesterUserId) {
      return res.status(400).json({ error: "Missing requesterUserId." });
    }
    const isAdmin = await isAdminUser(requesterUserId);
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const documents = listPreviousDocuments().map((document) => ({
      ...document,
      previewUrl: document.previewPath ? `/api/previouses/${encodeURIComponent(document.id)}/preview` : "",
      fileUrl: document.filePath ? `/api/previouses/${encodeURIComponent(document.id)}/file?userId=${encodeURIComponent(requesterUserId)}` : "",
    }));

    res.json({
      documents,
      stats: {
        total: documents.length,
        pending: documents.filter((document) => normalizeText(document.status) === "pending").length,
        approved: documents.filter((document) => normalizeText(document.status) === "approved").length,
        rejected: documents.filter((document) => normalizeText(document.status) === "rejected").length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not load admin previouses." });
  }
});

app.post("/api/admin/previouses/:id/review", async (req, res) => {
  try {
    const requesterUserId = normalizeText(req.body?.requesterUserId);
    const requesterEmail = normalizeText(req.body?.requesterEmail).toLowerCase();
    const previousId = normalizeText(req.params.id);
    const status = normalizeText(req.body?.status).toLowerCase();
    const adminComment = normalizeText(req.body?.adminComment);
    if (!requesterUserId || !previousId || !["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Missing requester, previous, or review status." });
    }

    const isAdmin = await isAdminUser(requesterUserId);
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const document = getPreviousDocument(previousId);
    if (!document) {
      return res.status(404).json({ error: "Previous not found." });
    }

    const updated = updatePreviousDocument(previousId, {
      status,
      adminComment,
      reviewedBy: requesterEmail || requesterUserId,
      reviewedAt: new Date().toISOString(),
    });

    res.json({ success: true, document: updated });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not review that previous." });
  }
});

app.post("/api/ai-schedule", async (req, res) => {
  try {
    const message = String(req.body?.message ?? "").trim();
    const universityId = normalizeUniversityId(req.body?.universityId || req.body?.catalogStats?.universityId || "aub") || "aub";
    const requestedTermId = normalizeTermId(req.body?.termId || req.body?.catalogStats?.termId || "");
    const requestedSemesterLabel = String(req.body?.semesterLabel ?? req.body?.catalogStats?.semesterLabel ?? "").trim();
    const university = buildUniversityContext(universityId, req.body?.catalogStats ?? null);
    const universityTerms = getTermsForUniversity(universityId);
    const resolvedTerm = resolveAdvisorTermSelection(
      universityId,
      requestedTermId,
      requestedSemesterLabel,
      universityTerms,
    );
    const effectiveTermId = resolvedTerm.effectiveTermId || requestedTermId;
    const semesterLabel = resolvedTerm.effectiveTermLabel || requestedSemesterLabel;
    const liveCatalogCourses = getCoursesForTerm({ universityId, termId: effectiveTermId, search: "" });
    const universityWideCourses = getAllCoursesForUniversity(universityId);
    const mergedCourses = mergeAdvisorCourses(
      liveCatalogCourses,
      array(req.body?.sections),
      array(req.body?.relevantCourses),
      array(req.body?.scheduledCourses),
      array(req.body?.favoriteCourses),
      req.body?.selectedCourse ? [req.body.selectedCourse] : [],
    );
    const catalogStats = buildCatalogStats(
      mergedCourses.length ? mergedCourses : liveCatalogCourses,
      university,
      semesterLabel,
      req.body?.catalogStats ?? null,
      {
        universityTerms,
        effectiveTermId,
        effectiveTermLabel: semesterLabel,
        updatedAt: req.body?.catalogStats?.updatedAt ?? getUniversitiesResponse().find((entry) => entry.id === universityId)?.updatedAt ?? null,
        resolutionNote: resolvedTerm.resolutionNote,
      },
    );

    const advisorResponse = buildAdvisorLocalResponse({
      message,
      university,
      semesterLabel,
      catalogStats,
      advisorCourses: mergedCourses,
      universityCourses: universityWideCourses,
      universityTerms,
      relevantCourses: array(req.body?.relevantCourses),
      sections: array(req.body?.sections),
      favoriteCourses: array(req.body?.favoriteCourses),
      scheduledCourses: array(req.body?.scheduledCourses),
      selectedCourse: req.body?.selectedCourse || null,
    });

    if (advisorResponse) {
      return res.json({
        ...advisorResponse,
        aiStatus: getAiStatusPayload(),
        promptContext: buildAdvisorPromptContext({
          message,
          university,
          semesterLabel,
          catalogStats,
          advisorCourses: mergedCourses,
          universityTerms,
          selectedCourse: req.body?.selectedCourse || null,
        }),
      });
    }

    const fallbackSummary = message
      ? [
          `I could not classify that request precisely enough to trust a narrow answer for ${university.name}${semesterLabel ? ` in ${semesterLabel}` : ""}.`,
          `Current snapshot coverage: ${catalogStats.totalSections} live sections and ${catalogStats.uniqueCourses} visible course codes.`,
          "If you give me a course code, CRN, major + semester number, attribute bucket, or a clear schedule constraint, I can answer from the live catalog without guessing.",
        ].join("\n")
      : `The live planner is ready for ${university.name}${semesterLabel ? ` in ${semesterLabel}` : ""}. Ask me for a schedule, a prerequisite chain, attribute buckets, or open-seat options.`;

    return res.json({
      mode: "course-info",
      schedule: [],
      scheduleCourses: [],
      summary: fallbackSummary,
      avgDifficulty: null,
      aiStatus: getAiStatusPayload(),
      promptContext: buildAdvisorPromptContext({
        message,
        university,
        semesterLabel,
        catalogStats,
        advisorCourses: mergedCourses,
        universityTerms,
        selectedCourse: req.body?.selectedCourse || null,
      }),
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "The AI advisor could not complete that request.",
      aiStatus: getAiStatusPayload(),
    });
  }
});

app.get("/api/announcements", async (req, res) => {
  try {
    const userId = normalizeText(req.query.userId);
    if (!userId) {
      return res.status(400).json({ error: "Missing userId." });
    }

    const store = { announcements: listAnnouncements(), reads: readAnnouncementStore().reads };
    const applicableAnnouncements = store.announcements
      .filter((announcement) => {
        const targetUserIds = array(announcement.targetUserIds).map((value) => normalizeText(value));
        if (targetUserIds.length > 0) return targetUserIds.includes(userId);
        return announcementMatchesContext(announcement, {
          userId,
          universityId: "",
          courseCodeCompacts: new Set(),
        });
      })
      .map((announcement) => {
        const isRead = store.reads.some(
          (entry) => normalizeText(entry.userId) === userId
            && normalizeText(entry.announcementId) === normalizeText(announcement.id),
        );
        return {
          ...announcement,
          unread: !isRead,
          audienceSummary: buildAnnouncementAudienceSummary(announcement),
        };
      });

    res.json({
      announcements: applicableAnnouncements,
      unreadCount: applicableAnnouncements.filter((announcement) => announcement.unread).length,
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not load announcements." });
  }
});

app.post("/api/announcements/read", async (req, res) => {
  try {
    const userId = normalizeText(req.body?.userId);
    const announcementIds = array(req.body?.announcementIds).map((value) => normalizeText(value)).filter(Boolean);
    if (!userId || announcementIds.length === 0) {
      return res.status(400).json({ error: "Missing userId or announcementIds." });
    }
    const result = markAnnouncementsRead({ userId, announcementIds });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not mark announcements as read." });
  }
});

app.post("/api/account/contact-profile", async (req, res) => {
  try {
    const profile = upsertMarketingProfile({
      userId: req.body?.userId,
      email: req.body?.email,
      universityId: req.body?.universityId,
      phoneNumber: req.body?.phoneNumber,
    });
    res.json({ success: true, profile });
  } catch (error) {
    res.status(400).json({ error: error?.message || "Could not save contact profile." });
  }
});

app.post("/api/account/profile-name", async (req, res) => {
  try {
    const accessToken = normalizeText(req.body?.accessToken);
    const firstName = normalizeText(req.body?.firstName);
    const familyName = normalizeText(req.body?.familyName);

    if (!accessToken) {
      return res.status(401).json({ error: "Missing session token." });
    }
    if (!firstName || !familyName) {
      return res.status(400).json({ error: "Both name fields are required." });
    }

    const scopedSupabase = createScopedSupabaseClient(accessToken);
    if (!scopedSupabase) {
      return res.status(503).json({ error: "Profile saving is not configured on this runtime." });
    }

    const {
      data: authData,
      error: authError,
    } = await scopedSupabase.auth.getUser(accessToken);

    if (authError || !authData?.user?.id) {
      return res.status(401).json({ error: "Your session could not be verified." });
    }

    const userId = authData.user.id;
    const userEmail = normalizeText(authData.user.email);
    const displayName = `${firstName} ${familyName}`.replace(/\s+/g, " ").trim();
    const updatedAt = new Date().toISOString();

    const detailedProfileWrite = await scopedSupabase.from("profiles").upsert({
      id: userId,
      display_name: displayName,
      first_name: firstName,
      family_name: familyName,
      updated_at: updatedAt,
    }, { onConflict: "id" });

    if (detailedProfileWrite.error) {
      const fallbackProfileWrite = await scopedSupabase.from("profiles").upsert({
        id: userId,
        display_name: displayName,
        updated_at: updatedAt,
      }, { onConflict: "id" });

      if (fallbackProfileWrite.error) {
        return res.status(500).json({
          error: fallbackProfileWrite.error.message || detailedProfileWrite.error.message || "Could not save your profile name.",
        });
      }
    }

    if (userEmail) {
      const detailedUserWrite = await scopedSupabase.from("users").upsert({
        id: userId,
        email: userEmail,
        full_name: displayName,
        first_name: firstName,
        family_name: familyName,
        updated_at: updatedAt,
      }, { onConflict: "id" });

      if (detailedUserWrite.error) {
        await scopedSupabase.from("users").upsert({
          id: userId,
          email: userEmail,
          updated_at: updatedAt,
        }, { onConflict: "id" });
      }
    }

    return res.json({
      success: true,
      profile: {
        firstName,
        familyName,
        displayName,
        updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Could not save your profile name." });
  }
});

app.get("/api/admin/contact-profiles", async (req, res) => {
  try {
    const requesterUserId = normalizeText(req.query.requesterUserId);
    if (!requesterUserId) {
      return res.status(400).json({ error: "Missing requesterUserId." });
    }
    res.json({ profiles: listMarketingProfiles() });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not load contact profiles." });
  }
});

app.get("/api/admin/announcements", async (req, res) => {
  try {
    const requesterUserId = normalizeText(req.query.requesterUserId);
    if (!requesterUserId) {
      return res.status(400).json({ error: "Missing requesterUserId." });
    }

    const store = readAnnouncementStore();
    const announcements = listAnnouncements().map((announcement) => {
      const recipientIds = array(announcement.targetUserIds).map((value) => normalizeText(value)).filter(Boolean);
      const readCount = store.reads.filter(
        (entry) => normalizeText(entry.announcementId) === normalizeText(announcement.id)
          && recipientIds.includes(normalizeText(entry.userId)),
      ).length;

      return {
        ...announcement,
        audienceSummary: buildAnnouncementAudienceSummary(announcement),
        recipientCount: recipientIds.length,
        readCount,
        unreadCount: Math.max(0, recipientIds.length - readCount),
      };
    });

    res.json({ announcements });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not load admin announcements." });
  }
});

app.post("/api/admin/announcements", async (req, res) => {
  try {
    const requesterUserId = normalizeText(req.body?.requesterUserId);
    if (!requesterUserId) {
      return res.status(400).json({ error: "Missing requesterUserId." });
    }

    const title = normalizeText(req.body?.title);
    const message = normalizeText(req.body?.message);
    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required." });
    }

    const announcement = createAnnouncement({
      createdByUserId: requesterUserId,
      createdByEmail: req.body?.createdByEmail,
      title,
      message,
      audienceMode: req.body?.audienceMode,
      universityIds: array(req.body?.universityIds).map((value) => normalizeText(value).toLowerCase()),
      targetUserIds: array(req.body?.targetUserIds).map((value) => normalizeText(value)),
      targetCourseCodes: array(req.body?.targetCourseCodes).map((value) => normalizeCourseCode(value)),
      ctaLabel: req.body?.ctaLabel,
      ctaUrl: req.body?.ctaUrl,
    });

    res.json({ success: true, announcement });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not create announcement." });
  }
});

app.post("/api/admin/announcements/:id/archive", async (req, res) => {
  try {
    const requesterUserId = normalizeText(req.body?.requesterUserId);
    if (!requesterUserId) {
      return res.status(400).json({ error: "Missing requesterUserId." });
    }

    const announcement = archiveAnnouncement(normalizeText(req.params.id));
    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found." });
    }

    res.json({ success: true, announcement });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Could not archive announcement." });
  }
});

app.get("/, (req, res) => { res.send(Termer is running.); }); if (fs.existsSync(CLIENT_DIST_DIR)) {
  app.use(express.static(CLIENT_DIST_DIR, { index: false }));

  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startManualImportWatchers();
  void runVisualImportBuild("startup");
  const initialCurriculumStatus = reloadCurriculumPlans();
  setCatalogRuntimeStatus({
    curriculumPlanCount: Number(initialCurriculumStatus?.totalPlans ?? 0) || 0,
    parsedCurriculumPlanCount: Number(initialCurriculumStatus?.parsedPlans ?? 0) || 0,
    curriculumGeneratedAt: initialCurriculumStatus?.generatedAt ?? null,
    curriculumByUniversity: initialCurriculumStatus?.byUniversity ?? {},
  });
  if (catalogRefreshOnStart) {
    void runCatalogRefresh("startup");
  } else if (catalogAutoRefreshEnabled) {
    reloadCatalogCache();
  }
  if (catalogAutoRefreshEnabled) {
    console.log(`[catalogs] auto-refresh enabled every ${Math.round(catalogRefreshIntervalMs / 60000)} minute(s).`);
    setInterval(() => {
      void runCatalogRefresh("interval");
    }, catalogRefreshIntervalMs);
  } else {
    console.log("[catalogs] auto-refresh disabled by default. Set CATALOG_AUTO_REFRESH=true to enable background refreshes.");
  }
});
