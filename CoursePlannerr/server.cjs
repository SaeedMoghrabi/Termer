// This file used to contain an older duplicate backend. Keep it as a wrapper so
// running `node server.cjs` from the frontend folder still starts the real server.
const legacyServerPath = require("path");
process.chdir(legacyServerPath.resolve(__dirname, ".."));
require("../server.cjs");

if (false) {
// console.log("File started");
// const express = require("express");
// const cors = require("cors");
// require("dotenv").config();

// const { createClient } = require("@supabase/supabase-js");

// const app = express();

// app.use(cors({
//   origin: "http://localhost:5173"
// }));

// app.use(express.json());

// const supabase = createClient(
//   process.env.SUPABASE_URL,
//   process.env.SUPABASE_ANON_KEY
// );

// app.get("/api/terms", async (req, res) => {
//   const { data, error } = await supabase
//     .from("terms")
//     .select("*")
//     .order("code", { ascending: false });

//   if (error) return res.status(500).json(error);

//   const cleaned = data.map(t => ({
//     ...t,
//     description: t.description.replace(" (View Only)", "").trim()
//   }));

//   res.json(cleaned);
// });

// app.get("/api/courses", async (req, res) => {
//   const { term, search } = req.query;

//   let query = supabase
//     .from("courses")
//     .select("*, professors(full_name)")
//     .eq("semester", term);

//   if (search) {
//     query = query.or(
//       `title.ilike.%${search}%,department.ilike.%${search}%,crn.eq.${search},course_number.ilike.%${search}%`
//     );
//   }

//   const { data, error } = await query.range(0, 5000);
//   if (error) return res.status(500).json(error);
//   res.json(data);
// });

// // Get course ratings
// app.get("/api/ratings/course/:department/:courseNumber", async (req, res) => {
//   const { department, courseNumber } = req.params;

//   const { data, error } = await supabase
//     .from("course_ratings")
//     .select("*")
//     .eq("department", department)
//     .eq("course_number", courseNumber)
//     .order("created_at", { ascending: false });

//   if (error) return res.status(500).json(error);

//   const avg = data.length ? {
//     rating: (data.reduce((a, r) => a + r.rating, 0) / data.length).toFixed(1),
//     difficulty: (data.reduce((a, r) => a + r.difficulty, 0) / data.length).toFixed(1),
//     count: data.length
//   } : { rating: 0, difficulty: 0, count: 0 };

//   res.json({ ratings: data, averages: avg });
// });

// // Submit course rating
// app.post("/api/ratings/course", async (req, res) => {
//   const { user_id, department, course_number, rating, difficulty, review } = req.body;

//   const { data, error } = await supabase
//     .from("course_ratings")
//     .upsert({ user_id, department, course_number, rating, difficulty, review },
//       { onConflict: 'user_id,department,course_number' });

//   if (error) return res.status(500).json(error);
//   res.json({ success: true });
// });

// // Get professor ratings
// app.get("/api/ratings/professor/:professorId", async (req, res) => {
//   const { professorId } = req.params;

//   const { data, error } = await supabase
//     .from("professor_ratings")
//     .select("*")
//     .eq("professor_id", professorId)
//     .order("created_at", { ascending: false });

//   if (error) return res.status(500).json(error);

//   const avg = data.length ? {
//     rating: (data.reduce((a, r) => a + r.rating, 0) / data.length).toFixed(1),
//     count: data.length
//   } : { rating: 0, count: 0 };

//   res.json({ ratings: data, averages: avg });
// });

// // Submit professor rating
// app.post("/api/ratings/professor", async (req, res) => {
//   const { user_id, professor_id, department, course_number, rating, review } = req.body;

//   const { data, error } = await supabase
//     .from("professor_ratings")
//     .upsert({ user_id, professor_id, department, course_number, rating, review },
//       { onConflict: 'user_id,professor_id,department,course_number' });

//   if (error) return res.status(500).json(error);
//   res.json({ success: true });
// });

// app.get("/api/professors", async (req, res) => {
//   const { search } = req.query;

//   let query = supabase
//     .from("professors")
//     .select("id, full_name");

//   if (search) {
//     query = query.ilike("full_name", `%${search}%`);
//   }

//   const { data, error } = await query.limit(20);
//   if (error) return res.status(500).json(error);
//   res.json(data);
// });

// app.get("/api/courses/search", async (req, res) => {
//   const { search } = req.query;

//   let query = supabase
//     .from("courses")
//     .select("department, course_number, title")
//     .ilike("department", `${search}%`);

//   const { data, error } = await query.range(0, 200);
//   if (error) return res.status(500).json(error);

//   // Deduplicate
//   const seen = new Set();
//   const unique = data.filter(c => {
//     const key = `${c.department}-${c.course_number}`;
//     if (seen.has(key)) return false;
//     seen.add(key);
//     return true;
//   });

//   res.json(unique);
// });

// console.log("About to listen...");
// app.listen(3001, () => {
//   console.log("Server running on http://localhost:3001");
// });

// process.stdin.resume();


console.log("File started");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const { HfInference } = require("@huggingface/inference");

const app = express();

app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const hf = new HfInference(process.env.HF_TOKEN);

const SUMMARY_STOP_WORDS = new Set([
  "a", "an", "and", "about", "all", "any", "are", "as", "at", "be", "best",
  "can", "class", "classes", "could", "do", "doctor", "dr", "for", "from", "feedback",
  "give", "how", "i", "if", "in", "instructor", "is", "it", "me", "my",
  "of", "on", "opinion", "opinions", "or", "please", "prof", "professor",
  "rate", "rating", "ratings", "review", "reviews", "say", "should",
  "student", "students", "summarize", "summary", "take", "teach", "teacher",
  "tell", "that", "the", "this", "to", "what", "who", "would", "written",
  "x", "y", "you"
]);

const REVIEW_INTENT_KEYWORDS = [
  "professor",
  "prof",
  "instructor",
  "review",
  "reviews",
  "feedback",
  "summary",
  "summarize",
  "students say",
  "student feedback"
];

const POSITIVE_THEMES = [
  { label: "clear explanations", keywords: ["clear", "clarity", "explain", "explains", "explained", "understand", "understandable"] },
  { label: "helpful support", keywords: ["helpful", "supportive", "available", "responsive", "kind", "caring", "office hours"] },
  { label: "good organization", keywords: ["organized", "organization", "structured", "prepared", "well planned"] },
  { label: "fair grading", keywords: ["fair", "reasonable", "lenient", "transparent grading"] },
  { label: "engaging classes", keywords: ["engaging", "interesting", "interactive", "fun", "enjoyable"] },
  { label: "manageable workload", keywords: ["manageable", "light workload", "reasonable workload", "not too much work"] }
];

const CONCERN_THEMES = [
  { label: "a heavy workload", keywords: ["heavy workload", "too much work", "a lot of work", "lots of work", "many assignments", "homework", "project load"] },
  { label: "strict or tough grading", keywords: ["hard grader", "strict", "harsh", "unfair", "tough grading", "hard exams", "difficult exams", "tough exams"] },
  { label: "a fast pace", keywords: ["fast", "too fast", "rushed", "pace", "moves quickly"] },
  { label: "unclear explanations", keywords: ["confusing", "unclear", "hard to understand", "not clear", "disorganized"] },
  { label: "limited support", keywords: ["unavailable", "not helpful", "unresponsive", "doesn't care", "does not care"] }
];

const DAY_NAMES = {
  M: "Mondays",
  T: "Tuesdays",
  W: "Wednesdays",
  R: "Thursdays",
  F: "Fridays",
  S: "Saturdays"
};

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function joinList(items) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function extractMeaningfulTokens(text) {
  return normalizeText(text)
    .split(" ")
    .filter(token => token.length > 1 && !SUMMARY_STOP_WORDS.has(token));
}

function extractProfessorQueryTokens(text) {
  return extractMeaningfulTokens(text)
    .filter(token => /[a-z]/.test(token))
    .slice(0, 6);
}

function canonicalizeNameToken(token = "") {
  return String(token)
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f")
    .replace(/ou/g, "u")
    .replace(/([a-z])\1+/g, "$1");
}

function buildConsonantSkeleton(token = "") {
  const canonical = canonicalizeNameToken(token);
  if (!canonical) return "";
  return canonical[0] + canonical.slice(1).replace(/[aeiouy]/g, "");
}

function getProfessorNameTokens(fullName) {
  return normalizeText(fullName)
    .split(" ")
    .filter(token => token.length > 1 && !SUMMARY_STOP_WORDS.has(token));
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      );
    }

    for (let j = 0; j < current.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / Math.max(a.length, b.length));
}

function tokenSimilarity(queryToken, nameToken) {
  const query = canonicalizeNameToken(queryToken);
  const candidate = canonicalizeNameToken(nameToken);

  if (!query || !candidate) return 0;
  if (query === candidate) return 1;

  const querySkeleton = buildConsonantSkeleton(query);
  const candidateSkeleton = buildConsonantSkeleton(candidate);

  if (querySkeleton && querySkeleton === candidateSkeleton && querySkeleton.length >= 3) {
    return 0.97;
  }

  if (
    Math.min(query.length, candidate.length) >= 4 &&
    (query.startsWith(candidate) || candidate.startsWith(query))
  ) {
    return 0.93;
  }

  const directSimilarity = stringSimilarity(query, candidate);
  const skeletonSimilarity = (
    querySkeleton.length >= 3 && candidateSkeleton.length >= 3
      ? stringSimilarity(querySkeleton, candidateSkeleton)
      : 0
  );

  return Math.max(directSimilarity, skeletonSimilarity * 0.98);
}

function buildQueryPairs(tokens) {
  if (tokens.length < 2) return [];

  const pairs = [];
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      pairs.push([tokens[i], tokens[j]]);
    }
  }

  return pairs;
}

function pairCombinationSimilarity(queryLeft, queryRight, firstName, lastName) {
  const queryDirect = canonicalizeNameToken(`${queryLeft}${queryRight}`);
  const queryReversed = canonicalizeNameToken(`${queryRight}${queryLeft}`);
  const professorDirect = canonicalizeNameToken(`${firstName}${lastName}`);
  const professorReversed = canonicalizeNameToken(`${lastName}${firstName}`);

  const directScores = [
    stringSimilarity(queryDirect, professorDirect),
    stringSimilarity(queryDirect, professorReversed),
    stringSimilarity(queryReversed, professorDirect),
    stringSimilarity(queryReversed, professorReversed)
  ];

  const queryDirectSkeleton = buildConsonantSkeleton(queryDirect);
  const queryReversedSkeleton = buildConsonantSkeleton(queryReversed);
  const professorDirectSkeleton = buildConsonantSkeleton(professorDirect);
  const professorReversedSkeleton = buildConsonantSkeleton(professorReversed);

  const skeletonScores = [
    stringSimilarity(queryDirectSkeleton, professorDirectSkeleton),
    stringSimilarity(queryDirectSkeleton, professorReversedSkeleton),
    stringSimilarity(queryReversedSkeleton, professorDirectSkeleton),
    stringSimilarity(queryReversedSkeleton, professorReversedSkeleton)
  ];

  return Math.max(
    ...directScores,
    ...skeletonScores.map(score => score * 0.99)
  );
}

async function fetchAllProfessors() {
  const allProfessors = [];
  const pageSize = 1000;

  for (let start = 0; start < 5000; start += pageSize) {
    const { data, error } = await supabase
      .from("professors")
      .select("id, full_name")
      .range(start, start + pageSize - 1);

    if (error) {
      return { data: null, error };
    }

    if (!data?.length) {
      break;
    }

    allProfessors.push(...data);

    if (data.length < pageSize) {
      break;
    }
  }

  return { data: allProfessors, error: null };
}

function scoreProfessorMatch(fullName, normalizedMessage, tokens) {
  const nameTokens = getProfessorNameTokens(fullName);
  if (!nameTokens.length) return 0;

  const normalizedName = nameTokens.join(" ");
  const firstName = nameTokens[0];
  const lastName = nameTokens[nameTokens.length - 1];
  const reversedName = `${lastName} ${firstName}`;
  let score = 0;

  if (normalizedMessage.includes(normalizedName)) {
    score += 24;
  }

  if (normalizedMessage.includes(reversedName)) {
    score += 18;
  }

  if (tokens.length >= 2) {
    const pairScores = buildQueryPairs(tokens)
      .map(([left, right]) => {
        const direct = (tokenSimilarity(left, firstName) + tokenSimilarity(right, lastName)) / 2;
        const reversed = (tokenSimilarity(left, lastName) + tokenSimilarity(right, firstName)) / 2;
        const combined = pairCombinationSimilarity(left, right, firstName, lastName);
        return Math.max(direct, reversed, combined);
      })
      .sort((a, b) => b - a);

    const bestPairScore = pairScores[0] ?? 0;

    score += bestPairScore * 28;

    if (bestPairScore >= 0.96) score += 8;
    else if (bestPairScore >= 0.88) score += 4;
  }

  const tokenScores = tokens
    .map(token => Math.max(...nameTokens.map(nameToken => tokenSimilarity(token, nameToken)), 0))
    .sort((a, b) => b - a);

  score += tokenScores
    .slice(0, Math.min(3, tokenScores.length))
    .reduce((total, value) => total + (value * 4), 0);

  if (tokens.length === 1 && tokenScores[0] >= 0.92) {
    score += 6;
  }

  return score;
}

async function findProfessorFromMessage(message) {
  const quotedMatch = String(message).match(/["“]([^"”]+)["”]/);
  const tokenSource = quotedMatch?.[1] ?? message;
  const tokens = extractProfessorQueryTokens(tokenSource);

  if (!tokens.length) {
    return null;
  }

  const { data, error } = await fetchAllProfessors();

  if (error || !data?.length) {
    return null;
  }

  const normalizedMessage = normalizeText(message);
  const ranked = data
    .map(professor => ({
      ...professor,
      score: scoreProfessorMatch(professor.full_name, normalizedMessage, tokens)
    }))
    .sort((a, b) => b.score - a.score || a.full_name.length - b.full_name.length);

  const best = ranked[0];
  const second = ranked[1];
  const minimumScore = tokens.length >= 2 ? 26 : 12;

  if (!best || best.score < minimumScore) {
    return null;
  }

  if (second && (best.score - second.score) < 2.5 && best.score < 40) {
    return null;
  }

  return { id: best.id, full_name: best.full_name };
}

function getTopThemeLabels(ratings, themes, limit = 2) {
  const normalizedReviews = ratings
    .map(rating => normalizeText(rating.review || ""))
    .filter(Boolean);

  return themes
    .map(theme => ({
      label: theme.label,
      count: normalizedReviews.reduce((total, review) => (
        total + (theme.keywords.some(keyword => review.includes(keyword)) ? 1 : 0)
      ), 0)
    }))
    .filter(theme => theme.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(theme => theme.label);
}

function getTopCourses(ratings, limit = 3) {
  const counts = new Map();

  ratings.forEach(rating => {
    if (!rating.department || !rating.course_number) return;
    const code = `${rating.department} ${rating.course_number}`;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([code, count]) => count === 1 ? code : `${code} (${count} ${pluralize(count, "review")})`);
}

function buildProfessorSummary(professor, ratings) {
  const totalRatings = ratings.length;

  if (!totalRatings) {
    return `I couldn't find any submitted reviews for ${professor.full_name} yet.`;
  }

  const averageRating = (
    ratings.reduce((sum, rating) => sum + Number(rating.rating || 0), 0) / totalRatings
  ).toFixed(1);

  const writtenRatings = ratings.filter(rating =>
    typeof rating.review === "string" && rating.review.trim().length > 0
  );

  if (!writtenRatings.length) {
    return `${professor.full_name} has ${totalRatings} ${pluralize(totalRatings, "rating")} averaging ${averageRating}/5, but none of those submissions include written comments yet, so I can only report the score.`;
  }

  const positiveCount = ratings.filter(rating => Number(rating.rating) >= 4).length;
  const negativeCount = ratings.filter(rating => Number(rating.rating) <= 2).length;

  let overallTone = "mixed";
  if (positiveCount >= negativeCount + 2) overallTone = "mostly positive";
  if (negativeCount >= positiveCount + 2) overallTone = "mostly critical";

  const positiveThemes = getTopThemeLabels(
    writtenRatings.filter(rating => Number(rating.rating) >= 4),
    POSITIVE_THEMES
  );

  const concernThemes = getTopThemeLabels(
    writtenRatings.filter(rating => Number(rating.rating) <= 3),
    CONCERN_THEMES
  );

  const topCourses = getTopCourses(ratings);
  const summary = [
    `Based on ${writtenRatings.length} written ${pluralize(writtenRatings.length, "review")} and ${totalRatings} total ${pluralize(totalRatings, "rating")} for ${professor.full_name}, the overall feedback is ${overallTone} with an average rating of ${averageRating}/5.`
  ];

  if (positiveThemes.length) {
    summary.push(`Students most often praise ${joinList(positiveThemes)}.`);
  } else if (positiveCount > negativeCount) {
    summary.push("The written comments lean positive overall, even though one compliment does not dominate.");
  }

  if (concernThemes.length) {
    summary.push(`The recurring concerns are ${joinList(concernThemes)}.`);
  } else if (negativeCount > 0) {
    summary.push("Some reviews mention downsides, but they do not cluster around one repeated complaint.");
  }

  if (topCourses.length) {
    summary.push(`Most of the submitted feedback references ${joinList(topCourses)}.`);
  }

  summary.push("This summary only reflects reviews that students submitted in the app.");
  return summary.join(" ");
}

function toMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return (hours * 60) + minutes;
}

function meetingsConflict(a, b) {
  const sameDay = (a.days || []).some(day => (b.days || []).includes(day));
  if (!sameDay) return false;
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

function coursesConflict(a, b) {
  const meetingsA = Array.isArray(a.meetings) ? a.meetings : [];
  const meetingsB = Array.isArray(b.meetings) ? b.meetings : [];
  return meetingsA.some(meetingA => meetingsB.some(meetingB => meetingsConflict(meetingA, meetingB)));
}

function bundlesConflict(bundleA, bundleB) {
  return bundleA.some(courseA => bundleB.some(courseB => coursesConflict(courseA, courseB)));
}

function isLectureSection(course) {
  const type = String(course.scheduleType || "").toLowerCase();
  const section = String(course.section || "").toUpperCase();
  return type.includes("lecture") || section.startsWith("L");
}

function getLinkSuffix(linkIdentifier) {
  if (!linkIdentifier) return null;
  return String(linkIdentifier).replace(/^[A-Za-z]+/, "");
}

function buildSectionBundles(sections) {
  const grouped = new Map();

  sections.forEach(section => {
    if (!section?.code || !section?.id) return;
    if (!grouped.has(section.code)) grouped.set(section.code, []);
    grouped.get(section.code).push(section);
  });

  const bundlesByCode = new Map();

  grouped.forEach((codeSections, code) => {
    const bundles = [];
    const bundleKeys = new Set();

    codeSections.forEach(section => {
      if (section.isSectionLinked && !isLectureSection(section)) {
        return;
      }

      let bundle = [section];

      if (section.isSectionLinked && section.linkIdentifier && section.subjectCourse) {
        const suffix = getLinkSuffix(section.linkIdentifier);
        const linkedSections = codeSections.filter(other =>
          other.id !== section.id &&
          other.isSectionLinked &&
          other.subjectCourse === section.subjectCourse &&
          getLinkSuffix(other.linkIdentifier) === suffix &&
          isLectureSection(other) !== isLectureSection(section)
        );

        bundle = [section, ...linkedSections];
      }

      bundle.sort((a, b) => String(a.section).localeCompare(String(b.section)));

      const bundleKey = bundle.map(item => item.id).sort().join("|");
      if (bundleKeys.has(bundleKey)) return;

      bundleKeys.add(bundleKey);
      bundles.push(bundle);
    });

    if (!bundles.length) {
      codeSections.forEach(section => bundles.push([section]));
    }

    bundlesByCode.set(code, bundles);
  });

  return bundlesByCode;
}

function parseSchedulePreferences(message) {
  const normalized = normalizeText(message);
  const avoidDays = [
    { code: "M", name: "monday" },
    { code: "T", name: "tuesday" },
    { code: "W", name: "wednesday" },
    { code: "R", name: "thursday" },
    { code: "F", name: "friday" },
    { code: "S", name: "saturday" }
  ]
    .filter(({ name }) => (
      new RegExp(`\\b(?:no|avoid|without|skip) ${name}s?\\b`).test(normalized) ||
      new RegExp(`\\b${name}s? off\\b`).test(normalized)
    ))
    .map(({ code }) => code);

  return {
    avoidDays,
    preferMorning: /\bmorning\b|\bmornings\b|\bearly\b/.test(normalized) && !/\b(?:no|avoid) mornings?\b/.test(normalized),
    preferAfternoon: /\bafternoon\b|\bafternoons\b/.test(normalized) && !/\b(?:no|avoid) afternoons?\b/.test(normalized),
    preferLateStart: /\blate start\b|\bstart late\b|\bnot too early\b|\bno early\b/.test(normalized),
    preferEasy: /\beasy\b|\blight workload\b|\blow difficulty\b|\bleast difficult\b/.test(normalized)
  };
}

function scoreBundle(bundle, preferences, difficulties) {
  let score = 0;
  const code = bundle[0]?.code;
  const courseDifficulty = code && Number.isFinite(Number(difficulties?.[code]))
    ? Number(difficulties[code])
    : null;

  if (preferences.preferEasy && courseDifficulty !== null) {
    score += (5 - courseDifficulty) * 1.25;
  }

  bundle.forEach(course => {
    if (course.capacity?.limit > 0 && course.capacity.enrolled < course.capacity.limit) {
      score += 0.5;
    }

    (course.meetings || []).forEach(meeting => {
      if (preferences.avoidDays.some(day => meeting.days?.includes(day))) {
        score -= 5;
      }

      if (preferences.preferMorning) {
        score += toMinutes(meeting.start) < 720 ? 1.5 : -0.75;
      }

      if (preferences.preferAfternoon) {
        score += toMinutes(meeting.start) >= 720 ? 1.25 : -0.5;
      }

      if (preferences.preferLateStart) {
        score += toMinutes(meeting.start) >= 600 ? 0.75 : -1.25;
      }
    });
  });

  return score;
}

function isBetterSchedule(candidate, best) {
  if (candidate.codeCount !== best.codeCount) {
    return candidate.codeCount > best.codeCount;
  }

  return candidate.score > best.score;
}

function formatBundleLabel(bundle) {
  const courseCode = bundle[0]?.code ?? "Course";
  const sections = bundle.map(section => (
    section.scheduleType && String(section.scheduleType).toLowerCase() !== "lecture"
      ? `${section.section} (${section.scheduleType})`
      : section.section
  ));

  return `${courseCode}: ${sections.join(" + ")}`;
}

function averageSelectedDifficulty(selectedBundles, difficulties) {
  const codes = [...new Set(selectedBundles.map(bundle => bundle[0]?.code).filter(Boolean))];
  const values = codes
    .map(code => Number(difficulties?.[code]))
    .filter(value => Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildScheduleSummary(selectedBundles, requestedCount, preferences, difficulties) {
  if (!requestedCount) {
    return 'I can help in two ways: build a schedule from course codes, or summarize professor reviews. Try "CMPS 271, MATH 201, no Fridays" or "Summarize the reviews for Professor Jane Doe."';
  }

  const selectedCount = selectedBundles.length;
  const summary = [];

  if (selectedCount === requestedCount) {
    summary.push(`I found a conflict-free option for all ${requestedCount} requested ${pluralize(requestedCount, "course")}.`);
  } else if (selectedCount > 0) {
    summary.push(`I could fit ${selectedCount} of the ${requestedCount} requested courses without time conflicts.`);
  } else {
    summary.push("I couldn't build a conflict-free schedule from those sections with the current preferences.");
  }

  if (selectedCount > 0) {
    summary.push(`Selected sections: ${joinList(selectedBundles.map(formatBundleLabel))}.`);
  }

  const priorities = [];
  if (preferences.preferMorning) priorities.push("morning sections when possible");
  if (preferences.preferAfternoon) priorities.push("afternoon sections when possible");
  if (preferences.preferLateStart) priorities.push("later start times when possible");
  if (preferences.avoidDays.length) priorities.push(`avoiding ${joinList(preferences.avoidDays.map(day => DAY_NAMES[day]))}`);

  if (priorities.length) {
    summary.push(`I prioritized ${joinList(priorities)}.`);
  }

  const difficulty = averageSelectedDifficulty(selectedBundles, difficulties);
  if (difficulty !== null) {
    summary.push(`Estimated difficulty for this set is about ${difficulty.toFixed(1)}/5 based on submitted course ratings.`);
  }

  if (selectedCount < requestedCount) {
    summary.push("If you want, ask me to relax a preference or tell me which course matters most and I'll try again.");
  }

  return summary.join(" ");
}

function buildSchedulePlan(message, sections, difficulties) {
  if (!Array.isArray(sections) || !sections.length) {
    return {
      schedule: [],
      summary: buildScheduleSummary([], 0, { avoidDays: [], preferMorning: false, preferAfternoon: false, preferLateStart: false }, difficulties)
    };
  }

  const preferences = parseSchedulePreferences(message);
  const bundlesByCode = buildSectionBundles(sections);
  const requestedCodes = Array.from(bundlesByCode.keys());
  const orderedCodes = [...requestedCodes].sort((a, b) => (
    (bundlesByCode.get(a)?.length ?? 0) - (bundlesByCode.get(b)?.length ?? 0)
  ));

  let best = { codeCount: 0, score: Number.NEGATIVE_INFINITY, bundles: [] };

  function search(index, chosenBundles, score) {
    const candidate = {
      codeCount: chosenBundles.length,
      score,
      bundles: chosenBundles.slice()
    };

    if (isBetterSchedule(candidate, best)) {
      best = candidate;
    }

    if (index >= orderedCodes.length) {
      return;
    }

    const remaining = orderedCodes.length - index;
    if (chosenBundles.length + remaining < best.codeCount) {
      return;
    }

    const code = orderedCodes[index];
    const options = (bundlesByCode.get(code) || [])
      .map(bundle => ({ bundle, score: scoreBundle(bundle, preferences, difficulties) }))
      .sort((a, b) => b.score - a.score);

    let foundFit = false;

    for (const option of options) {
      if (chosenBundles.some(existing => bundlesConflict(existing, option.bundle))) {
        continue;
      }

      foundFit = true;
      chosenBundles.push(option.bundle);
      search(index + 1, chosenBundles, score + option.score);
      chosenBundles.pop();
    }

    if (!foundFit || chosenBundles.length + (orderedCodes.length - (index + 1)) >= best.codeCount) {
      search(index + 1, chosenBundles, score - 0.25);
    }
  }

  search(0, [], 0);

  return {
    schedule: best.bundles.flat().map(section => section.id),
    summary: buildScheduleSummary(best.bundles, requestedCodes.length, preferences, difficulties)
  };
}

async function moderateText(text) {
  if (!text || text.trim().length === 0) return true;
  try {
    const result = await hf.textClassification({
      model: "unitary/toxic-bert",
      inputs: text,
    });
    const top = result[0];
    if (top.label === "toxic" && top.score > 0.7) return false;
    return true;
  } catch (err) {
    console.error("Moderation error:", err);
    return true;
  }
}

app.get("/api/terms", async (req, res) => {
  const { data, error } = await supabase
    .from("terms")
    .select("*")
    .order("code", { ascending: false });

  if (error) return res.status(500).json(error);

  const cleaned = data.map(t => ({
    ...t,
    description: t.description.replace(" (View Only)", "").trim()
  }));

  res.json(cleaned);
});

app.get("/api/courses", async (req, res) => {
  const { term, search } = req.query;

  let query = supabase
    .from("courses")
    .select("*, professors(full_name)")
    .eq("semester", term);

  if (search) {
    query = query.or(
      `title.ilike.%${search}%,department.ilike.%${search}%,crn.eq.${search},course_number.ilike.%${search}%`
    );
  }

  const { data, error } = await query.range(0, 5000);
  if (error) return res.status(500).json(error);
  res.json(data);
});

// Get course ratings
app.get("/api/ratings/course/:department/:courseNumber", async (req, res) => {
  const { department, courseNumber } = req.params;

  const { data, error } = await supabase
    .from("course_ratings")
    .select("*")
    .eq("department", department)
    .eq("course_number", courseNumber)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json(error);

  const avg = data.length ? {
    rating: (data.reduce((a, r) => a + r.rating, 0) / data.length).toFixed(1),
    difficulty: (data.reduce((a, r) => a + r.difficulty, 0) / data.length).toFixed(1),
    count: data.length
  } : { rating: 0, difficulty: 0, count: 0 };

  res.json({ ratings: data, averages: avg });
});

// Submit course rating
app.post("/api/ratings/course", async (req, res) => {
  const { user_id, department, course_number, rating, difficulty, review } = req.body;

  const allowed = await moderateText(review);
  if (!allowed) {
    return res.status(400).json({ error: "Review contains inappropriate content and was not submitted." });
  }

  const { data, error } = await supabase
    .from("course_ratings")
    .upsert({ user_id, department, course_number, rating, difficulty, review },
      { onConflict: 'user_id,department,course_number' });

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

// Get professor ratings
app.get("/api/ratings/professor/:professorId", async (req, res) => {
  const { professorId } = req.params;

  const { data, error } = await supabase
    .from("professor_ratings")
    .select("*")
    .eq("professor_id", professorId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json(error);

  const avg = data.length ? {
    rating: (data.reduce((a, r) => a + r.rating, 0) / data.length).toFixed(1),
    count: data.length
  } : { rating: 0, count: 0 };

  res.json({ ratings: data, averages: avg });
});

// Submit professor rating
app.post("/api/ratings/professor", async (req, res) => {
  const { user_id, professor_id, department, course_number, rating, review } = req.body;

  const allowed = await moderateText(review);
  if (!allowed) {
    return res.status(400).json({ error: "Review contains inappropriate content and was not submitted." });
  }

  const { data, error } = await supabase
    .from("professor_ratings")
    .upsert({ user_id, professor_id, department, course_number, rating, review },
      { onConflict: 'user_id,professor_id,department,course_number' });

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

app.get("/api/professors", async (req, res) => {
  const { search } = req.query;

  let query = supabase
    .from("professors")
    .select("id, full_name");

  if (search) {
    query = query.ilike("full_name", `%${search}%`);
  }

  const { data, error } = await query.limit(20);
  if (error) return res.status(500).json(error);
  res.json(data);
});

app.get("/api/courses/search", async (req, res) => {
  const { search } = req.query;

  let query = supabase
    .from("courses")
    .select("department, course_number, title")
    .ilike("department", `${search}%`);

  const { data, error } = await query.range(0, 200);
  if (error) return res.status(500).json(error);

  const seen = new Set();
  const unique = data.filter(c => {
    const key = `${c.department}-${c.course_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json(unique);
});

app.post("/api/ai-schedule", async (req, res) => {
  const { message, sections = [], difficulties = {} } = req.body ?? {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "A chat message is required." });
  }

  const normalizedMessage = normalizeText(message);
  const reviewIntent = REVIEW_INTENT_KEYWORDS.some(keyword => normalizedMessage.includes(keyword));
  const professor = await findProfessorFromMessage(message);

  if (professor && (reviewIntent || !Array.isArray(sections) || sections.length === 0)) {
    const { data, error } = await supabase
      .from("professor_ratings")
      .select("*")
      .eq("professor_id", professor.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: "Couldn't load professor reviews right now." });
    }

    return res.json({
      mode: "professor-summary",
      schedule: [],
      summary: buildProfessorSummary(professor, data || [])
    });
  }

  if (reviewIntent && !professor) {
    return res.json({
      mode: "professor-summary",
      schedule: [],
      summary: 'I could not confidently match that professor name. Try the full name exactly as it appears in Reviews, for example: "Summarize the reviews for Professor Jane Doe."'
    });
  }

  const plan = buildSchedulePlan(message, sections, difficulties);
  return res.json({
    mode: "schedule",
    schedule: plan.schedule,
    summary: plan.summary
  });
});

console.log("About to listen...");
app.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});

process.stdin.resume();
}
