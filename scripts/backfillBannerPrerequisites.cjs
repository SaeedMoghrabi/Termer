const fs = require("fs");
const path = require("path");
const { getUniversityConfig } = require("../catalogConfig.cjs");
const {
  DATA_DIR,
  dedupeBy,
  logStep,
  normalizeWhitespace,
  requestJson,
  requestText,
} = require("./catalogUtils.cjs");
const { parseBannerPrerequisiteHtml } = require("./fetchBannerCatalog.cjs");

const TARGET_UNIVERSITIES = ["aub", "usek"];
const CONCURRENCY = 18;
const SUPPLEMENTAL_PATH = path.join(DATA_DIR, "prerequisites.json");

function normalizeSubjectDescription(value = "") {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await callback(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchSubjectMap(sourceUrl, termCode, rejectUnauthorized = true) {
  const response = await requestJson(
    `${sourceUrl}/ssb/classSearch/get_subject?term=${encodeURIComponent(termCode)}&offset=1&max=500`,
    { rejectUnauthorized },
  );

  return new Map(
    response.json.map((subject) => [
      normalizeSubjectDescription(subject.description || subject.code),
      String(subject.code).toUpperCase(),
    ]),
  );
}

async function backfillUniversity(universityId) {
  const config = getUniversityConfig(universityId);
  const catalog = readJson(path.join(DATA_DIR, `${universityId}.json`), null);
  if (!config?.sourceUrl || !catalog?.courses?.length) return {};

  const rejectUnauthorized = universityId !== "usek";
  const representatives = dedupeBy(
    catalog.courses.filter((course) => course.term_code && course.crn && course.code),
    (course) => `${course.term_code}:${course.code}`,
  );
  const terms = [...new Set(representatives.map((course) => course.term_code))];
  const subjectMaps = new Map();

  for (const termCode of terms) {
    try {
      subjectMaps.set(termCode, await fetchSubjectMap(config.sourceUrl, termCode, rejectUnauthorized));
    } catch (error) {
      logStep("prerequisite subject map failed", `${universityId} ${termCode} -> ${error.message}`);
      subjectMaps.set(termCode, new Map());
    }
  }

  const prerequisiteMap = {};
  await mapWithConcurrency(representatives, CONCURRENCY, async (course) => {
    try {
      const url = `${config.sourceUrl}/ssb/searchResults/getSectionPrerequisites?term=${encodeURIComponent(course.term_code)}&courseReferenceNumber=${encodeURIComponent(course.crn)}`;
      const response = await requestText(url, {
        rejectUnauthorized,
        timeoutMs: 30000,
      });
      const prerequisites = parseBannerPrerequisiteHtml(
        response.text,
        subjectMaps.get(course.term_code) ?? new Map(),
      );

      if (prerequisites && !prerequisiteMap[course.code]) {
        prerequisiteMap[course.code] = {
          prerequisites,
          source: `${config.shortName} Banner getSectionPrerequisites`,
        };
      }
    } catch (error) {
      logStep("prerequisite backfill failed", `${universityId} ${course.code} -> ${error.message}`);
    }
  });

  logStep("prerequisite backfill", `${config.shortName} ${Object.keys(prerequisiteMap).length} rules`);
  return prerequisiteMap;
}

async function main() {
  const supplemental = readJson(SUPPLEMENTAL_PATH, {});

  for (const universityId of TARGET_UNIVERSITIES) {
    const fetched = await backfillUniversity(universityId);
    supplemental[universityId] = {
      ...(supplemental[universityId] && typeof supplemental[universityId] === "object"
        ? supplemental[universityId]
        : {}),
      ...fetched,
    };
  }

  fs.writeFileSync(SUPPLEMENTAL_PATH, `${JSON.stringify(supplemental, null, 2)}\n`);
  logStep("wrote prerequisites", SUPPLEMENTAL_PATH);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
