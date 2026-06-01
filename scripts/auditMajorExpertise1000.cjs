#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { getUniversitiesResponse } = require("../catalogStore.cjs");
const { getOfficialMajorCoverageLists } = require("../majorRegistry.cjs");

const API_URL = process.env.MAJOR_EXPERTISE_API_URL || "http://localhost:3001/api/ai-schedule";
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.MAJOR_EXPERTISE_CONCURRENCY || "12", 10));
const TARGET_CASES = Math.max(1, Number.parseInt(process.env.MAJOR_EXPERTISE_TARGET_CASES || "1000", 10));
const OUT_DIR = path.join(__dirname, "..", "data", "reports");
const OUT_FILE = path.join(OUT_DIR, `major-expertise-audit-1000-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const SOURCE_RE = /Official source tracked:\s*(https?:\/\/\S+)/i;

const REQUESTED_MAJOR_COVERAGE = getOfficialMajorCoverageLists();

function buildCases() {
  const universities = getUniversitiesResponse();
  const currentTermByUniversity = new Map(universities.map((university) => [university.id, university.currentTermCode || ""]));
  const combinations = [];
  for (const [universityId, majors] of Object.entries(REQUESTED_MAJOR_COVERAGE)) {
    const termId = currentTermByUniversity.get(universityId) || "";
    for (const major of majors) {
      combinations.push({ universityId, major, termId });
    }
  }
  const cases = [];

  for (const combination of combinations) {
    for (const year of YEARS) {
      cases.push({
        kind: "schedule",
        universityId: combination.universityId,
        major: combination.major,
        year,
        termId: combination.termId,
        question: `create a first semester schedule for a ${combination.major} student who entered in ${year}`,
      });
    }
  }

  combinations.slice(0, 118).forEach((combination) => {
    cases.push({
      kind: "requirements",
      universityId: combination.universityId,
      major: combination.major,
      year: 2023,
      termId: combination.termId,
      question: `what curriculum or general education requirements should a ${combination.major} student who entered in 2023 follow`,
    });
  });

  if (cases.length <= TARGET_CASES) return cases;
  const sampled = [];
  for (let index = 0; index < TARGET_CASES; index += 1) {
    const sourceIndex = Math.floor((index * cases.length) / TARGET_CASES);
    sampled.push(cases[sourceIndex]);
  }
  return sampled;
}

function payloadFor(testCase) {
  return {
    message: testCase.question,
    universityId: testCase.universityId,
    termId: testCase.termId,
    semesterLabel: "Audit term",
    sections: [],
    relevantCourses: [],
    scheduledCourses: [],
    favoriteCourses: [],
    selectedCrns: [],
    activeSlot: 1,
    catalogStats: {
      universityName: testCase.universityId.toUpperCase(),
      semesterLabel: "Audit term",
      totalSections: 0,
      uniqueCourses: 0,
      professorCount: 0,
      openSections: 0,
      attributeCount: 0,
      attributes: [],
    },
    history: [{ role: "user", content: testCase.question }],
  };
}

function isWeakSummary(summary = "") {
  const text = String(summary).toLowerCase();
  if (!text.trim()) return true;
  return [
    "something went wrong",
    "i can help with this website, but i need a little more context",
    "i do not have enough visible",
    "not loaded",
    "i am ready for",
  ].some((pattern) => text.includes(pattern));
}

function classifyResponse(testCase, body = {}, status = 200) {
  const summary = String(body.summary ?? "");
  const source = summary.match(SOURCE_RE)?.[1]?.replace(/[).,]+$/, "") || "";
  const scheduleCount = Array.isArray(body.schedule) ? body.schedule.length : 0;
  const exact = /i found the official .* sequence/i.test(summary);
  const practical = /catalog-based schedule|practical schedule draft|first-semester .* drafted/i.test(summary) || (body.mode === "schedule" && !exact);
  const weak = !status || isWeakSummary(summary) || (testCase.kind === "schedule" && body.mode !== "schedule");

  return {
    mode: body.mode ?? null,
    provider: body.aiProvider ?? body.aiStatus?.provider ?? null,
    scheduleCount,
    exact,
    practical,
    weak,
    source,
    summary: summary.slice(0, 900),
  };
}

async function postCase(testCase) {
  const started = Date.now();
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(testCase)),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ...testCase,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      ...classifyResponse(testCase, body, response.status),
    };
  } catch (error) {
    return {
      ...testCase,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      mode: null,
      provider: null,
      scheduleCount: 0,
      exact: false,
      practical: false,
      weak: true,
      source: "",
      error: error.message,
      summary: "",
    };
  }
}

async function verifySource(url) {
  if (!url) return { ok: false, status: 0, error: "missing source" };
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.status === 403 || response.status === 405) {
      response = await fetch(url, { method: "GET", redirect: "follow" });
    }
    return { ok: response.ok, status: response.status, finalUrl: response.url };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await worker(items[current]);
      if ((current + 1) % 50 === 0 || current + 1 === items.length) {
        process.stdout.write(`\r[expertise-audit] ${current + 1}/${items.length}`);
      }
    }
  });
  await Promise.all(workers);
  process.stdout.write(`\r[expertise-audit] ${items.length}/${items.length}\n`);
  return results;
}

function summarize(results) {
  return {
    total: results.length,
    ok: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    weak: results.filter((result) => result.weak).length,
    exact: results.filter((result) => result.exact).length,
    practical: results.filter((result) => result.practical).length,
    sourceBacked: results.filter((result) => result.source).length,
    avgLatencyMs: Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / Math.max(results.length, 1)),
  };
}

function summarizeByUniversity(results) {
  const rows = [];
  for (const universityId of Object.keys(REQUESTED_MAJOR_COVERAGE)) {
    const scoped = results.filter((result) => result.universityId === universityId);
    rows.push({
      universityId,
      total: scoped.length,
      exact: scoped.filter((result) => result.exact).length,
      practical: scoped.filter((result) => result.practical).length,
      weak: scoped.filter((result) => result.weak).length,
      failed: scoped.filter((result) => !result.ok).length,
    });
  }
  return rows;
}

async function main() {
  const cases = buildCases();
  console.log(`[expertise-audit] sending ${cases.length} major/university advisor tests to ${API_URL}`);
  const results = await runPool(cases, postCase);
  const sourceUrls = [...new Set(results.map((result) => result.source).filter(Boolean))];
  const sourceChecks = {};
  for (const url of sourceUrls) {
    sourceChecks[url] = await verifySource(url);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    concurrency: CONCURRENCY,
    totals: summarize(results),
    byUniversity: summarizeByUniversity(results),
    sourceChecks,
    weakExamples: results.filter((result) => result.weak).slice(0, 50),
    exactExamples: results.filter((result) => result.exact).slice(0, 50),
    practicalExamples: results.filter((result) => result.practical && !result.exact).slice(0, 50),
    results,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`[expertise-audit] wrote ${OUT_FILE}`);
  console.table([report.totals]);
  console.table(report.byUniversity);
  if (report.totals.failed || report.totals.weak) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[expertise-audit] crashed:", error);
  process.exit(1);
});
