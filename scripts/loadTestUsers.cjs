#!/usr/bin/env node

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const TARGET_USERS = Number.parseInt(process.env.LOAD_TEST_USERS || process.argv[2] || "100", 10);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || "25", 10));
const API_ROOT = process.env.LOAD_TEST_API_ROOT || "http://localhost:3001";
const REAL_SUPABASE_WRITES = process.env.LOAD_TEST_REAL_SUPABASE_WRITES === "true";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT_DIR = path.join(__dirname, "..", "data", "reports");
const OUT_FILE = path.join(OUT_DIR, `load-test-${TARGET_USERS}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

const universityIds = ["aub", "lau", "bau", "ndu", "usek", "usj", "lu", "aust", "liu"];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function makeUser(index) {
  const universityId = universityIds[index % universityIds.length];
  const token = crypto.createHash("sha1").update(`${Date.now()}:${index}:${Math.random()}`).digest("hex").slice(0, 12);
  return {
    id: crypto.randomUUID(),
    index,
    universityId,
    email: `loadtest.${token}.${index}@example.edu`,
    password: `LoadTest-${token}!9`,
    termId: "load-test-term",
  };
}

async function timed(label, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    return { label, ok: true, latencyMs: Date.now() - started, value };
  } catch (error) {
    return { label, ok: false, latencyMs: Date.now() - started, error: error.message };
  }
}

async function dryRunUser(user) {
  const catalog = await timed("catalog", async () => {
    const response = await fetch(`${API_ROOT}/api/universities`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
  const ai = await timed("ai", async () => {
    const response = await fetch(`${API_ROOT}/api/ai-schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Where do I find my CRNs and how do I build a schedule?",
        universityId: user.universityId,
        termId: user.termId,
        semesterLabel: "Load Test Term",
        sections: [],
        relevantCourses: [],
        scheduledCourses: [],
        favoriteCourses: [],
        selectedCrns: [],
        catalogStats: { universityName: user.universityId.toUpperCase(), semesterLabel: "Load Test Term", totalSections: 0, uniqueCourses: 0, attributes: [] },
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
  return { user, steps: [catalog, ai] };
}

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for real Supabase write mode.");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function realSupabaseUser(user, supabase) {
  const created = await timed("auth.createUser", async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        load_test: true,
        university_id: user.universityId,
      },
    });
    if (error) throw error;
    user.id = data.user.id;
    return data.user.id;
  });

  const profile = await timed("profiles.upsert", async () => {
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: `Load Test ${user.index}`,
      university_id: user.universityId,
      email_domain: "example.edu",
      needs_manual_review: true,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return true;
  });

  const schedule = await timed("schedules.upsert", async () => {
    const { error } = await supabase.from("schedules").upsert({
      user_id: user.id,
      university_id: user.universityId,
      term_id: user.termId,
      slot: 1,
      courses: [],
      colors: {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,university_id,slot,term_id" });
    if (error) throw error;
    return true;
  });

  const settings = await timed("planner_settings.upsert", async () => {
    const { error } = await supabase.from("planner_settings").upsert({
      user_id: user.id,
      university_id: user.universityId,
      term_id: user.termId,
      blocked_times: [],
      locked_course_ids: [],
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,university_id,term_id" });
    if (error) throw error;
    return true;
  });

  return { user, steps: [created, profile, schedule, settings] };
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await worker(items[current]);
      if ((current + 1) % 100 === 0 || current + 1 === items.length) {
        process.stdout.write(`\r[load] ${current + 1}/${items.length}`);
      }
    }
  });
  await Promise.all(workers);
  process.stdout.write("\n");
  return results;
}

function summarize(results) {
  const steps = results.flatMap((result) => result.steps);
  const latencies = steps.map((step) => step.latencyMs);
  return {
    users: results.length,
    mode: REAL_SUPABASE_WRITES ? "real-supabase-writes" : "dry-run-api",
    concurrency: CONCURRENCY,
    okSteps: steps.filter((step) => step.ok).length,
    failedSteps: steps.filter((step) => !step.ok).length,
    avgLatencyMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(latencies.length, 1)),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    failures: steps.filter((step) => !step.ok).slice(0, 50),
  };
}

async function main() {
  if (TARGET_USERS > 10_000 && !REAL_SUPABASE_WRITES) {
    console.log("[load] 100k dry-run is allowed, but it can take a while. Set LOAD_TEST_CONCURRENCY to control pressure.");
  }
  if (REAL_SUPABASE_WRITES && TARGET_USERS > 1000 && process.env.LOAD_TEST_ALLOW_LARGE_REAL_WRITES !== "true") {
    throw new Error("Refusing large real writes. Set LOAD_TEST_ALLOW_LARGE_REAL_WRITES=true after confirming you want to create many real auth/database rows.");
  }

  const users = Array.from({ length: TARGET_USERS }, (_, index) => makeUser(index));
  const supabase = REAL_SUPABASE_WRITES ? getSupabaseAdmin() : null;
  console.log(`[load] ${REAL_SUPABASE_WRITES ? "creating real Supabase users/rows" : "dry-running API pressure"} for ${TARGET_USERS} users at concurrency ${CONCURRENCY}`);
  const started = Date.now();
  const results = await runPool(users, (user) => REAL_SUPABASE_WRITES ? realSupabaseUser(user, supabase) : dryRunUser(user));
  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    ...summarize(results),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ report, results }, null, 2));
  console.log(`[load] wrote ${OUT_FILE}`);
  console.table([report]);
  if (report.failedSteps) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[load] crashed:", error);
  process.exit(1);
});
