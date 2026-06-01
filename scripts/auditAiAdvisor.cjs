#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { buildStudentQuestionCorpus } = require("./aiQuestionCorpus.cjs");

const API_URL = process.env.AI_AUDIT_API_URL || "http://localhost:3001/api/ai-schedule";
const COUNT = Number.parseInt(process.env.AI_AUDIT_COUNT || process.argv[2] || "1000", 10);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.AI_AUDIT_CONCURRENCY || "8", 10));
const OUT_DIR = path.join(__dirname, "..", "data", "reports");
const OUT_FILE = path.join(OUT_DIR, `ai-advisor-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

function payloadFor(question) {
  return {
    message: question.question,
    universityId: question.universityId,
    termId: "",
    semesterLabel: "Selected term",
    sections: [],
    relevantCourses: [],
    scheduledCourses: [],
    favoriteCourses: [],
    selectedCrns: [],
    activeSlot: 1,
    catalogStats: {
      universityName: question.universityId.toUpperCase(),
      semesterLabel: "Selected term",
      totalSections: 0,
      uniqueCourses: 0,
      professorCount: 0,
      openSections: 0,
      attributeCount: 0,
      attributes: [],
    },
    history: [{ role: "user", content: question.question }],
  };
}

function isWeakAnswer(summary = "") {
  const text = String(summary).toLowerCase();
  if (!text.trim()) return true;
  if (text.includes("something went wrong")) return true;
  if (text.includes("i can help with this website, but i need a little more context")) return true;
  if (text.includes("i do not have enough visible")) return true;
  if (text.includes("not loaded") && text.includes("catalog")) return true;
  return false;
}

async function postQuestion(question) {
  const started = Date.now();
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(question)),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ...question,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      mode: body.mode ?? null,
      provider: body.aiProvider ?? body.aiStatus?.provider ?? null,
      weak: isWeakAnswer(body.summary),
      summary: String(body.summary ?? "").slice(0, 900),
    };
  } catch (error) {
    return {
      ...question,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      mode: null,
      provider: null,
      weak: true,
      error: error.message,
      summary: "",
    };
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
      if ((current + 1) % 50 === 0) {
        process.stdout.write(`\r[audit] ${current + 1}/${items.length}`);
      }
    }
  });
  await Promise.all(workers);
  process.stdout.write(`\r[audit] ${items.length}/${items.length}\n`);
  return results;
}

function summarize(results) {
  const byCategory = new Map();
  results.forEach((result) => {
    const entry = byCategory.get(result.category) ?? { total: 0, weak: 0, failed: 0, avgLatencyMs: 0 };
    entry.total += 1;
    entry.weak += result.weak ? 1 : 0;
    entry.failed += result.ok ? 0 : 1;
    entry.avgLatencyMs += result.latencyMs;
    byCategory.set(result.category, entry);
  });
  return [...byCategory.entries()].map(([category, entry]) => ({
    category,
    total: entry.total,
    weak: entry.weak,
    failed: entry.failed,
    avgLatencyMs: Math.round(entry.avgLatencyMs / Math.max(entry.total, 1)),
  }));
}

async function main() {
  const questions = buildStudentQuestionCorpus(COUNT);
  console.log(`[audit] sending ${questions.length} student questions to ${API_URL}`);
  const results = await runPool(questions, postQuestion);
  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    count: questions.length,
    concurrency: CONCURRENCY,
    totals: {
      ok: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      weak: results.filter((result) => result.weak).length,
      avgLatencyMs: Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / Math.max(results.length, 1)),
    },
    byCategory: summarize(results),
    weakExamples: results.filter((result) => result.weak).slice(0, 50),
    results,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`[audit] wrote ${OUT_FILE}`);
  console.table(report.byCategory);
  if (report.totals.weak || report.totals.failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[audit] crashed:", error);
  process.exit(1);
});
