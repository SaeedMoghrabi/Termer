#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { buildAdvisorLocalResponse } = require("../advisorKnowledge.cjs");
const { getUniversityConfig } = require("../catalogConfig.cjs");
const { getOfficialMajorCoverageLists } = require("../majorRegistry.cjs");

const OUT_DIR = path.join(__dirname, "..", "data", "reports");
const OUT_FILE = path.join(OUT_DIR, `curriculum-coverage-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

const YEARS = Array.from({ length: Number.parseInt(process.env.CURRICULUM_AUDIT_YEAR_COUNT || "7", 10) }, (_, index) => 2020 + index);
const SEMESTERS = (process.env.CURRICULUM_AUDIT_SEMESTERS || "1,3,5")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);

const REQUESTED_MAJOR_COVERAGE = getOfficialMajorCoverageLists();

const SOURCE_RE = /Official source tracked:\s*(https?:\/\/\S+)/i;

function readCatalog(universityId) {
  const filePath = path.join(__dirname, "..", "data", "catalogs", `${universityId}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function termCourses(catalog) {
  const term = (catalog.terms || []).find((candidate) => candidate.is_current) || (catalog.terms || [])[0] || {};
  const courses = (catalog.courses || []).filter((candidate) =>
    !term.code || String(candidate.term_code || candidate.termCode || "") === String(term.code));
  return {
    term,
    courses,
    stats: {
      totalSections: courses.length,
      uniqueCourses: new Set(courses.map((candidate) => String(candidate.code || "").toUpperCase())).size,
      semesterLabel: term.description || term.label || "",
    },
  };
}

function classifyScheduleAnswer(summary = "", schedule = null) {
  const text = String(summary);
  const lower = text.toLowerCase();
  const source = text.match(SOURCE_RE)?.[1]?.replace(/[).,]+$/, "") || "";
  const hasSchedule = Array.isArray(schedule) && schedule.length > 0;
  const officialSequence = /i found the official .* sequence/i.test(text);
  const curriculumBacked = officialSequence && source;
  const practicalOnly = /catalog-based schedule|not a final graduation audit|not a true major sequence|program-specific course list/i.test(text);
  const weak = !hasSchedule || /do not have enough|not loaded|need a little more context|something went wrong/i.test(lower);

  return {
    hasSchedule,
    source,
    officialSequence,
    curriculumBacked: Boolean(curriculumBacked),
    practicalOnly: Boolean(practicalOnly),
    weak: Boolean(weak),
  };
}

function classifyRequirementAnswer(summary = "") {
  const text = String(summary);
  const source = text.match(SOURCE_RE)?.[1]?.replace(/[).,]+$/, "") || "";
  const sourceBacked = Boolean(source);
  const programSpecific = /program-specific|faculty\/program-specific|curriculum-plan based|faculty curriculum/i.test(text);
  const preciseCredits = /\b\d+\s+credits?\b/i.test(text);
  return {
    source,
    sourceBacked,
    programSpecific,
    preciseCredits,
  };
}

async function verifySource(url) {
  if (!url) return { ok: false, status: 0, error: "missing source" };
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { method: "GET", redirect: "follow" });
    }
    return { ok: response.ok, status: response.status, finalUrl: response.url };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

async function main() {
  const results = [];
  const sourceUrls = new Set();

  for (const [universityId, majors] of Object.entries(REQUESTED_MAJOR_COVERAGE)) {
    const catalog = readCatalog(universityId);
    const { term, courses, stats } = termCourses(catalog);
    const university = getUniversityConfig(universityId) ?? { id: universityId, name: universityId.toUpperCase() };

    for (const major of majors) {
      for (const year of YEARS) {
        for (const semester of SEMESTERS) {
          const scheduleResponse = buildAdvisorLocalResponse({
            message: `create a ${semester} semester schedule for a ${major} student who entered in ${year}`,
            university,
            semesterLabel: term.description || term.label || "",
            advisorCourses: courses,
            catalogStats: stats,
          });
          const scheduleClassification = classifyScheduleAnswer(scheduleResponse?.summary, scheduleResponse?.schedule);
          if (scheduleClassification.source) sourceUrls.add(scheduleClassification.source);

          const requirementResponse = buildAdvisorLocalResponse({
            message: `what curriculum attributes or general education requirements should a ${major} student who entered in ${year} take`,
            university,
            semesterLabel: term.description || term.label || "",
            advisorCourses: courses,
            catalogStats: stats,
          });
          const requirementClassification = classifyRequirementAnswer(requirementResponse?.summary);
          if (requirementClassification.source) sourceUrls.add(requirementClassification.source);

          results.push({
            universityId,
            major,
            year,
            semester,
            schedule: {
              mode: scheduleResponse?.mode ?? null,
              ids: Array.isArray(scheduleResponse?.schedule) ? scheduleResponse.schedule.length : 0,
              ...scheduleClassification,
              summary: String(scheduleResponse?.summary ?? "").slice(0, 700),
            },
            requirements: {
              ...requirementClassification,
              summary: String(requirementResponse?.summary ?? "").slice(0, 700),
            },
          });
        }
      }
    }
  }

  const sourceChecks = {};
  for (const url of sourceUrls) {
    sourceChecks[url] = await verifySource(url);
  }

  const totals = {
    combinations: results.length,
    scheduleAnswers: results.filter((item) => item.schedule.hasSchedule).length,
    exactCurriculumSchedules: results.filter((item) => item.schedule.curriculumBacked).length,
    practicalCatalogSchedules: results.filter((item) => item.schedule.hasSchedule && !item.schedule.curriculumBacked).length,
    weakScheduleAnswers: results.filter((item) => item.schedule.weak).length,
    sourceBackedRequirementAnswers: results.filter((item) => item.requirements.sourceBacked).length,
    preciseCreditRequirementAnswers: results.filter((item) => item.requirements.preciseCredits).length,
    programSpecificRequirementAnswers: results.filter((item) => item.requirements.programSpecific).length,
    sourceUrls: sourceUrls.size,
    reachableSources: Object.values(sourceChecks).filter((check) => check.ok).length,
  };

  const missingExactByUniversity = {};
  for (const universityId of Object.keys(REQUESTED_MAJOR_COVERAGE)) {
    const scoped = results.filter((item) => item.universityId === universityId);
    missingExactByUniversity[universityId] = {
      total: scoped.length,
      exactCurriculumSchedules: scoped.filter((item) => item.schedule.curriculumBacked).length,
      practicalCatalogSchedules: scoped.filter((item) => item.schedule.hasSchedule && !item.schedule.curriculumBacked).length,
      weakScheduleAnswers: scoped.filter((item) => item.schedule.weak).length,
      sourceBackedRequirementAnswers: scoped.filter((item) => item.requirements.sourceBacked).length,
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    years: YEARS,
    semesters: SEMESTERS,
    totals,
    byUniversity: missingExactByUniversity,
    sourceChecks,
    unsupportedExactExamples: results
      .filter((item) => item.schedule.hasSchedule && !item.schedule.curriculumBacked)
      .slice(0, 80),
    weakExamples: results.filter((item) => item.schedule.weak).slice(0, 80),
    results,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`[curriculum-audit] wrote ${OUT_FILE}`);
  console.table([totals]);
  console.table(Object.entries(missingExactByUniversity).map(([universityId, entry]) => ({ universityId, ...entry })));
  if (totals.weakScheduleAnswers || totals.exactCurriculumSchedules !== totals.combinations) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[curriculum-audit] crashed:", error);
  process.exit(1);
});
