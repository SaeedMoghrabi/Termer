#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");

const {
  STATIC_CURRICULUM_PLANS,
  CURRICULUM_RUNTIME_DIR,
  CURRICULUM_RUNTIME_FILE,
} = require("../curriculumPlans.cjs");

const BUSINESS_DEPARTMENTS = ["MNGT", "MKTG", "FINA", "ACCT", "ENTM", "DCSN", "INFO", "BUSS"];
const AUB_CS_CORE_CODES = ["CMPS 201", "CMPS 202", "CMPS 214", "CMPS 215", "CMPS 221", "CMPS 240", "CMPS 241", "CMPS 271"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeWhitespace(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCode(code = "") {
  const text = String(code ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(/^([A-Z]{3,5})(\d{3}[A-Z]?)$/);
  if (!match) return text;
  return `${match[1]} ${match[2]}`;
}

function hashContent(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

let pdfjsModulePromise = null;

async function getPdfjsModule() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsModulePromise;
}

async function fetchPdfBytes(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      Accept: "application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch curriculum PDF (${response.status} ${response.statusText}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function textContentToLines(textContent = {}) {
  const lines = [];
  let currentLine = [];

  for (const item of Array.isArray(textContent.items) ? textContent.items : []) {
    const value = normalizeWhitespace(item?.str ?? "");
    if (value) currentLine.push(value);
    if (item?.hasEOL && currentLine.length) {
      lines.push(currentLine.join(" "));
      currentLine = [];
    }
  }

  if (currentLine.length) {
    lines.push(currentLine.join(" "));
  }

  return lines;
}

function splitLines(text = "") {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\t/g, " ").trim())
    .filter(Boolean);
}

function getStaticPlan(universityId, planId) {
  return STATIC_CURRICULUM_PLANS.find((plan) =>
    String(plan.universityId).toLowerCase() === String(universityId).toLowerCase()
    && String(plan.id) === String(planId)) ?? null;
}

async function fetchPdfText(url) {
  const pdfjs = await getPdfjsModule();
  const data = await fetchPdfBytes(url);
  const loadingTask = pdfjs.getDocument({
    data,
    verbosity: 0,
    useSystemFonts: true,
  });

  let pdfDocument = null;
  let text = "";
  try {
    pdfDocument = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(...textContentToLines(content));
      if (typeof page.cleanup === "function") page.cleanup();
    }

    text = normalizeWhitespace(pages.join("\n"));
  } finally {
    if (pdfDocument && typeof pdfDocument.cleanup === "function") {
      pdfDocument.cleanup();
    }
    if (typeof loadingTask.destroy === "function") {
      await loadingTask.destroy().catch(() => {});
    }
  }

  return {
    text,
    hash: hashContent(text),
  };
}

async function fetchHtmlText(url) {
  async function fetchViaNodeRequest(requestUrl) {
    const client = String(requestUrl).startsWith("http://") ? http : https;
    return new Promise((resolve, reject) => {
      const req = client.get(requestUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      }, (res) => {
        let html = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          html += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Could not fetch curriculum page (${res.statusCode}).`));
            return;
          }
          resolve(html);
        });
      });
      req.on("error", reject);
    });
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch curriculum page (${response.status} ${response.statusText}).`);
  }

  let html = await response.text();
  let lowered = html.toLowerCase();
  if (
    lowered.includes("please enable cookies")
    || lowered.includes("you have been blocked")
    || lowered.includes("cette page sert à vérifier que vous n’êtes pas un robot")
  ) {
    try {
      html = await fetchViaNodeRequest(url);
      lowered = html.toLowerCase();
    } catch (fallbackError) {
      throw new Error("The curriculum source is behind an anti-bot or cookie wall.");
    }
  }

  return {
    text: String(html)
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#58;/gi, ":")
      .replace(/&#160;/gi, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    hash: hashContent(html),
  };
}

async function fetchSourceText(url) {
  if (/\.pdf(?:$|[?#])/i.test(String(url ?? ""))) {
    return fetchPdfText(url);
  }
  return fetchHtmlText(url);
}

function annotatePlan(plan, sourceMeta) {
  return {
    ...plan,
    sourceMeta: {
      url: plan.source,
      ...sourceMeta,
    },
  };
}

function parseAubComputerSciencePlan(text, staticPlan) {
  const startMarker = "Sample Study Plan for BS";
  const endMarker = "Sample Study Plan for BS/MS";
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker, startIndex + startMarker.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error("Could not locate the AUB Computer Science sample study plan in the official PDF.");
  }

  const lines = splitLines(text.slice(startIndex, endIndex));
  const sequences = { fall: [], spring: [] };
  let currentStart = "";
  let currentYear = "";

  for (const line of lines) {
    if (/^Students starting in the Fall term/i.test(line)) {
      currentStart = "fall";
      currentYear = "";
      continue;
    }
    if (/^Students starting in the Spring term/i.test(line)) {
      currentStart = "spring";
      currentYear = "";
      continue;
    }
    const yearMatch = line.match(/^(First|Second|Third) Year$/i);
    if (yearMatch) {
      currentYear = `${yearMatch[1][0].toUpperCase()}${yearMatch[1].slice(1).toLowerCase()} Year`;
      continue;
    }
    const termMatch = line.match(/^[•*-]?\s*(Fall|Spring)\s*term:\s*(.+)$/i);
    if (!termMatch || !currentStart || !currentYear) continue;

    const season = termMatch[1][0].toUpperCase() + termMatch[1].slice(1).toLowerCase();
    const rawItems = termMatch[2]
      .split(/\s*,\s*/)
      .map((item) => item.trim())
      .filter(Boolean);

    const items = rawItems.map((rawItem) => {
      if (/^CMPS elective$/i.test(rawItem)) {
        return {
          type: "elective",
          code: "CMPS elective",
          department: "CMPS",
          minNumber: 214,
          excludeCodes: AUB_CS_CORE_CODES,
        };
      }
      return {
        type: "course",
        code: normalizeCode(rawItem),
      };
    });

    sequences[currentStart].push({
      label: `${currentYear} ${season}`,
      items,
    });
  }

  if (!sequences.fall.length || !sequences.spring.length) {
    throw new Error("The AUB Computer Science parser did not recover both fall-start and spring-start sequences.");
  }

  return {
    ...clone(staticPlan),
    sequences,
  };
}

function parseBbaLineToItem(line) {
  const cleaned = String(line)
    .replace(/[–—-]\s*Optional.*$/i, "")
    .replace(/\s+\d+\s*$/g, "")
    .trim();

  if (!cleaned) return null;
  if (/^Technical Skills Workshop/i.test(cleaned)) return null;
  if (/^Internship Practicum:/i.test(cleaned)) return null;
  if (/^BUSS 253\b/i.test(cleaned)) return null;

  if (/^Business Elective$/i.test(cleaned)) {
    return { type: "requirement", code: "Business Elective", departments: BUSINESS_DEPARTMENTS };
  }
  if (/^Free Business Elective$/i.test(cleaned)) {
    return { type: "requirement", code: "Free Business Elective", departments: BUSINESS_DEPARTMENTS };
  }
  if (/^Elective Community Engaged Learning$/i.test(cleaned)) {
    return { type: "requirement", code: "Community Engaged Learning", attribute: "Community Engaged Learning" };
  }
  if (/^Elective Cultures and Histories \(History of Ideas\)$/i.test(cleaned)) {
    return { type: "requirement", code: "Cultures and Histories (History of Ideas)", attribute: "History of Ideas" };
  }
  if (/^Elective Cultures and Histories AND Social Inequalities$/i.test(cleaned)) {
    return { type: "requirement", code: "Cultures and Histories and Social Inequalities", attribute: "Social Inequalities" };
  }
  if (/^Elective Cultures and Histories$/i.test(cleaned)) {
    return { type: "requirement", code: "Cultures and Histories", attribute: "Cultures and Histories" };
  }
  if (/^Elective Understanding the World$/i.test(cleaned)) {
    return { type: "requirement", code: "Understanding the World", attribute: "Understanding the World" };
  }
  if (/^ARAB$/i.test(cleaned)) {
    return { type: "requirement", code: "ARAB", department: "ARAB" };
  }
  if (/^ECON 212 or ECON 211$/i.test(cleaned)) {
    return { type: "course", code: "ECON 212", alternatives: ["ECON 211"] };
  }
  if (/^ECON 211 or ECON 212$/i.test(cleaned)) {
    return { type: "course", code: "ECON 211", alternatives: ["ECON 212"] };
  }

  const codeMatch = cleaned.match(/^([A-Z]{3,5}\s*\d{3}[A-Z]?)\b/i);
  if (codeMatch) {
    return {
      type: "course",
      code: normalizeCode(codeMatch[1]),
      optional: /BUSS 239/i.test(cleaned),
    };
  }

  return null;
}

function parseAubBusinessPlan(text, staticPlan) {
  const sectionStart = text.indexOf("BBA Program with Concentration in General Business");
  const sectionEnd = text.indexOf("BBA Program with Concentration in Entrepreneurship", sectionStart + 20);
  if (sectionStart < 0 || sectionEnd < 0) {
    throw new Error("Could not locate the AUB BBA general-business study plan in the official PDF.");
  }

  const section = text.slice(sectionStart, sectionEnd);
  const termMatches = [...section.matchAll(/Term\s+([1-6])\s+Credits([\s\S]*?)(?=Term\s+[1-6]\s+Credits|Summer\s+Credits|BBA Program with Concentration|$)/gi)];
  const byTerm = new Map();

  for (const match of termMatches) {
    const termNumber = Number.parseInt(match[1], 10);
    const blockLines = splitLines(match[2]);
    const items = blockLines
      .map(parseBbaLineToItem)
      .filter(Boolean);
    if (items.length) byTerm.set(termNumber, items);
  }

  const termLabels = {
    1: "Year II Term 1",
    2: "Year II Term 2",
    3: "Year III Term 3",
    4: "Year III Term 4",
    5: "Year IV Term 5",
    6: "Year IV Term 6",
  };

  const sequences = {
    fall: [1, 2, 3, 4, 5, 6]
      .map((termNumber, index) => {
        const fallbackSemester = staticPlan?.sequences?.fall?.[index] ?? null;
        const items = byTerm.get(termNumber) ?? clone(fallbackSemester?.items ?? []);
        return items.length
          ? {
              label: termLabels[termNumber],
              items,
            }
          : null;
      })
      .filter(Boolean),
  };

  if (!sequences.fall.length) {
    throw new Error("The AUB BBA parser did not recover any term blocks from the official PDF.");
  }

  return {
    ...clone(staticPlan),
    sequences,
  };
}

function romanToNumber(roman = "") {
  const map = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12,
  };
  return map[String(roman || "").toUpperCase()] || 0;
}

function parseAubExactOrAlternativeCode(raw = "") {
  const cleaned = normalizeWhitespace(String(raw || "").replace(/\*+$/g, ""));
  if (!cleaned) return null;

  const dualDepartmentMatch = cleaned.match(/^([A-Z]{3,5})\/([A-Z]{3,5})\s*(\d{3}[A-Z]?)$/i);
  if (dualDepartmentMatch) {
    return {
      code: normalizeCode(`${dualDepartmentMatch[1]} ${dualDepartmentMatch[3]}`),
      alternatives: [normalizeCode(`${dualDepartmentMatch[2]} ${dualDepartmentMatch[3]}`)],
    };
  }

  const sameDepartmentSplitMatch = cleaned.match(/^([A-Z]{3,5})\s*(\d{3}[A-Z]?)\/(\d{3}[A-Z]?)$/i);
  if (sameDepartmentSplitMatch) {
    return {
      code: normalizeCode(`${sameDepartmentSplitMatch[1]} ${sameDepartmentSplitMatch[2]}`),
      alternatives: [normalizeCode(`${sameDepartmentSplitMatch[1]} ${sameDepartmentSplitMatch[3]}`)],
    };
  }

  const exactMatch = cleaned.match(/^([A-Z]{3,5})\s*(\d{3}[A-Z]?)$/i);
  if (exactMatch) {
    return {
      code: normalizeCode(`${exactMatch[1]} ${exactMatch[2]}`),
      alternatives: [],
    };
  }

  return null;
}

function parseAubRequirementLine(line = "") {
  const cleaned = normalizeWhitespace(String(line || "").replace(/\*+$/g, ""));
  if (!cleaned || /^Total\b/i.test(cleaned) || /^Credits$/i.test(cleaned)) return null;

  if (/^[A-Z]{3,5}\s*\dnn$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/elective/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Community Engaged Learning$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Human Values$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Arabic Elective$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Arabic Course$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Academic English$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Technical English$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Science Elective$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Math(?:ematics)? Elective$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Approved Experience$/i.test(cleaned)) return { type: "requirement", code: cleaned };
  if (/^Pre-Approved Elective/i.test(cleaned)) return { type: "requirement", code: cleaned };
  return null;
}

function parseAubTermItems(lines = []) {
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = normalizeWhitespace(lines[index] || "");
    if (!current || /^Credits$/i.test(current) || /^Total\b/i.test(current) || /^\d+$/.test(current)) {
      continue;
    }

    const parsedCode = parseAubExactOrAlternativeCode(current);
    if (parsedCode) {
      const lookahead = lines.slice(index + 1, index + 5).map((line) => normalizeWhitespace(line || ""));
      const joinedLookahead = lookahead.join(" ");
      const inlineAlternatives = [...joinedLookahead.matchAll(/\bor\s+([A-Z]{3,5}\s*\d{3}[A-Z]?)/gi)]
        .map((match) => normalizeCode(match[1]))
        .filter(Boolean);
      const alternatives = [...new Set([...(parsedCode.alternatives || []), ...inlineAlternatives])];
      items.push({
        type: "course",
        code: parsedCode.code,
        ...(alternatives.length ? { alternatives } : {}),
      });
      continue;
    }

    const requirementItem = parseAubRequirementLine(current);
    if (requirementItem) {
      items.push(requirementItem);
    }
  }

  return items;
}

function parseAubCatalogueTermPlan(text, staticPlan) {
  const planText = String(text || "");
  const termNeedle = "Term I (Fall)";
  const parseOccurrence = Number.parseInt(staticPlan?.parseOccurrence ?? 1, 10) || 1;
  let startIndex = -1;
  let searchIndex = -1;

  for (let occurrence = 1; occurrence <= parseOccurrence; occurrence += 1) {
    searchIndex = planText.indexOf(termNeedle, searchIndex + 1);
    if (searchIndex < 0) break;
    startIndex = searchIndex;
  }

  if (startIndex < 0) {
    throw new Error(`The ${staticPlan?.title ?? "AUB"} parser could not locate the requested proposed schedule block in the official catalogue page.`);
  }

  let endIndex = planText.length;
  if (staticPlan?.parseOccurrence && Number.isFinite(parseOccurrence)) {
    const nextIndex = planText.indexOf(termNeedle, startIndex + termNeedle.length);
    if (nextIndex > startIndex) {
      endIndex = nextIndex;
    }
  }

  const sectionText = planText.slice(startIndex, endIndex);
  const lines = splitLines(sectionText);
  const sequences = { fall: [] };
  const yearLabels = {
    1: "First Year",
    2: "First Year",
    3: "First Year",
    4: "Second Year",
    5: "Second Year",
    6: "Second Year",
    7: "Third Year",
    8: "Third Year",
    9: "Third Year",
    10: "Fourth Year",
    11: "Fourth Year",
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeWhitespace(lines[index] || "");
    const termMatch = line.match(/^Term\s+([IVX]+)\s*\((Fall|Spring|Summer)\)$/i);
    if (!termMatch) continue;

    const blockLines = [];
    index += 1;
    while (index < lines.length) {
      const candidate = normalizeWhitespace(lines[index] || "");
      if (!candidate) {
        index += 1;
        continue;
      }
      if (/^Term\s+[IVX]+\s*\((Fall|Spring|Summer)\)$/i.test(candidate)) {
        index -= 1;
        break;
      }
      if (/^Total Credit Hours/i.test(candidate)) {
        index = lines.length;
        break;
      }
      blockLines.push(candidate);
      index += 1;
    }

    const termNumber = romanToNumber(termMatch[1]);
    const season = `${termMatch[2][0].toUpperCase()}${termMatch[2].slice(1).toLowerCase()}`;
    const items = parseAubTermItems(blockLines);
    if (!items.length) continue;

    const yearLabel = yearLabels[termNumber] || `Term ${termMatch[1].toUpperCase()}`;
    sequences.fall.push({
      label: `${yearLabel} ${season}`.trim(),
      items,
    });
  }

  if (!sequences.fall.length) {
    throw new Error(`The ${staticPlan?.title ?? "AUB"} parser did not recover any term blocks from the official catalogue page.`);
  }

  return {
    ...clone(staticPlan),
    sequences,
  };
}

function buildLiuSemesterLabel(yearText, seasonText) {
  return `${yearText} ${seasonText}`;
}

function normalizeLiuLines(lines = []) {
  const merged = [];
  for (let index = 0; index < lines.length; index += 1) {
    const current = String(lines[index] ?? "").trim();
    const next = String(lines[index + 1] ?? "").trim();
    if (/^[A-Z]{4,5}\d{3}$/i.test(current) && /^[A-Z]$/i.test(next)) {
      merged.push(`${current}${next}`);
      index += 1;
      continue;
    }
    merged.push(current);
  }
  return merged;
}

function parseLiuPlan(text, staticPlan) {
  const lines = normalizeLiuLines(splitLines(text));
  const sequences = { fall: [] };
  let currentYear = "";
  let currentSeason = "";
  let currentItems = [];

  function flushTerm() {
    if (!currentYear || !currentSeason || !currentItems.length) return;
    const fallback = sequences.fall.length ? staticPlan?.sequences?.fall?.[sequences.fall.length] : null;
    const normalizedItems = currentItems.map((line) => {
      if (/^Elective$/i.test(line)) {
        const fallbackItem = fallback?.items?.find((item) => item.type === "elective") ?? null;
        return clone(fallbackItem ?? { type: "elective", code: "Major elective" });
      }
      return { type: "course", code: normalizeCode(line) };
    });
    sequences.fall.push({
      label: buildLiuSemesterLabel(currentYear, currentSeason),
      items: normalizedItems,
    });
    currentItems = [];
  }

  for (const line of lines) {
    const yearMatch = line.match(/^(First|Second|Third|Fourth|Fifth) Year$/i);
    if (yearMatch) {
      flushTerm();
      currentYear = `${yearMatch[1][0].toUpperCase()}${yearMatch[1].slice(1).toLowerCase()} Year`;
      currentSeason = "";
      continue;
    }
    const seasonMatch = line.match(/^(Fall|Spring) Semester$/i);
    if (seasonMatch) {
      flushTerm();
      currentSeason = `${seasonMatch[1][0].toUpperCase()}${seasonMatch[1].slice(1).toLowerCase()}`;
      continue;
    }
    if (/^Total\b/i.test(line)) {
      flushTerm();
      continue;
    }
    if (!currentYear || !currentSeason) continue;
    if (/^Code\b/i.test(line)) continue;
    const courseMatch = line.match(/^([A-Z]{4,5}\d{3}[A-Z]?)\b/i);
    if (courseMatch) {
      currentItems.push(courseMatch[1]);
      continue;
    }
    if (/^Elective$/i.test(line)) {
      currentItems.push(line);
    }
  }
  flushTerm();

  if (!sequences.fall.length) {
    throw new Error(`The ${staticPlan?.title ?? "LIU"} parser did not recover any semester blocks from the official PDF.`);
  }

  return {
    ...clone(staticPlan),
    sequences,
  };
}

function parseBauSemesterTable(text, staticPlan) {
  const lines = splitLines(String(text).replace(/&amp;/g, "&"));
  const sequences = { fall: [] };
  const headingRegex = /^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth) Semester$/i;
  const codeRegex = /^[A-Z]{3,6}\s*\d{3}[A-Z]?$/i;
  let index = 0;

  function parseRequirementTitle(startIndex) {
    for (let offset = 1; offset <= 6; offset += 1) {
      const line = String(lines[startIndex + offset] ?? "").trim();
      if (!line || /^close$/i.test(line)) continue;
      if (/^[-–—]+$/.test(line)) continue;
      if (/^\d+(\.\d+)?$/.test(line)) continue;
      if (/^\(.+\)$/.test(line)) continue;
      if (/^(CUR|DE|GSE|FC|MJC)$/i.test(line)) continue;
      if (/Course Code|Course Title|Credits|Hours Distribution|Course Type/i.test(line)) continue;
      return line;
    }
    return "General Requirement";
  }

  while (index < lines.length) {
    const heading = lines[index];
    if (!headingRegex.test(heading)) {
      index += 1;
      continue;
    }

    const items = [];
    index += 1;

    while (index < lines.length && !headingRegex.test(lines[index])) {
      const line = String(lines[index] ?? "").trim();

      if (codeRegex.test(line.replace(/\s+/g, ""))) {
        items.push({ type: "course", code: normalizeCode(line) });
        index += 1;
        continue;
      }

      if (/^[-–—]+$/.test(line)) {
        const title = parseRequirementTitle(index);
        if (/departmental/i.test(title)) {
          items.push({ type: "elective", code: "Departmental Elective" });
        } else if (/general science/i.test(title)) {
          items.push({ type: "elective", code: "General Science Elective" });
        } else if (/general elective/i.test(title)) {
          items.push({ type: "elective", code: "General Elective" });
        } else if (/university requirements?/i.test(title)) {
          items.push({ type: "requirement", code: "University Requirements" });
        }
      }

      index += 1;
    }

    if (items.length) {
      sequences.fall.push({
        label: heading,
        items,
      });
    }
  }

  if (!sequences.fall.length) {
    throw new Error(`The ${staticPlan?.title ?? "BAU"} parser did not recover any semester blocks from the official page.`);
  }

  return {
    ...clone(staticPlan),
    sequences,
  };
}

function parseAustSemesterTokens(blockLines = []) {
  const items = [];
  const tokenRegex = /\b[A-Z]{2,4}\s?\d{3}[A-Z]?L?\b|Free Elect(?:ive(?: Course)?)?|Tech(?:nical)? Elec(?:tive(?: Course)?)?|Concentration Area Course|Major Elective/gi;

  for (const rawLine of Array.isArray(blockLines) ? blockLines : []) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;

    const matches = [...line.matchAll(tokenRegex)];
    if (!matches.length) continue;

    for (const match of matches) {
      const token = String(match[0] ?? "").trim();
      if (!token) continue;
      if (/\b[A-Z]{2,4}\s?\d{3}[A-Z]?L?\b/.test(token)) {
        items.push({ type: "course", code: normalizeCode(token) });
        continue;
      }
      if (/^Concentration Area Course$/i.test(token)) {
        items.push({ type: "requirement", code: "Concentration Area Course" });
        continue;
      }
      if (/^Free Elect/i.test(token)) {
        items.push({ type: "requirement", code: "Free Elective Course" });
        continue;
      }
      if (/^Tech/i.test(token)) {
        items.push({ type: "requirement", code: "Technical Elective Course" });
        continue;
      }
      if (/^Major Elective$/i.test(token)) {
        items.push({ type: "requirement", code: "Major Elective" });
      }
    }
  }

  return items;
}

function parseAustSemesterPlan(text, staticPlan) {
  const lines = splitLines(String(text).replace(/&amp;/g, "&"));
  const sequences = { fall: [] };
  const yearRegex = /^Year\s+(One|Two|Three|Four|\d+)(?:\s+[A-Za-z][A-Za-z ]*)?$/i;
  const semesterRegex = /^(Fall|Spring)\s*(?:semester|\(\d+\s*credits?\))?\s*(.*)$/i;
  const summerRegex = /^(Summer(?:\s+[IVX]+)?)\s*(?:\(\d+\s*credits?\))?\s*(.*)$/i;
  let currentYear = "";
  let index = lines.findIndex((line) => yearRegex.test(line));

  if (index < 0) {
    throw new Error(`The ${staticPlan?.title ?? "AUST"} parser could not find the first year heading in the official source.`);
  }

  while (index < lines.length) {
    const line = String(lines[index] ?? "").trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (yearRegex.test(line)) {
      currentYear = line;
      index += 1;
      continue;
    }

    const semesterMatch = line.match(semesterRegex);
    const summerMatch = line.match(summerRegex);
    if (!semesterMatch && !summerMatch) {
      index += 1;
      continue;
    }

    const seasonLabel = semesterMatch
      ? semesterMatch[1][0].toUpperCase() + semesterMatch[1].slice(1).toLowerCase()
      : summerMatch[1];
    const blockLines = [];
    const remainder = normalizeWhitespace((semesterMatch?.[2] ?? summerMatch?.[2] ?? ""));
    if (remainder) blockLines.push(remainder);
    index += 1;

    while (index < lines.length) {
      const candidate = String(lines[index] ?? "").trim();
      if (!candidate) {
        index += 1;
        continue;
      }
      if (yearRegex.test(candidate) || semesterRegex.test(candidate) || summerRegex.test(candidate)) break;
      if (/^Total Credits/i.test(candidate) || /^AUST,/i.test(candidate) || /Sequence of Courses/i.test(candidate)) break;
      blockLines.push(candidate);
      index += 1;
    }

    const items = parseAustSemesterTokens(blockLines);
    if (!items.length) continue;
    sequences.fall.push({
      label: `${currentYear} ${seasonLabel}`.trim(),
      items,
    });
  }

  if (!sequences.fall.length) {
    throw new Error(`The ${staticPlan?.title ?? "AUST"} parser did not recover any semester blocks from the official PDF.`);
  }

  return {
    ...clone(staticPlan),
    sequences,
  };
}

function parseNduSuggestedProgram(text, staticPlan) {
  const lines = splitLines(String(text).replace(/&amp;/g, "&"));
  const sequences = { fall: [] };
  const semesterRegex = /^(Fall|Spring|Summer) Semester$/i;
  const yearRegex = /^Year\s+\d+/i;
  let currentYear = "";
  let index = lines.findIndex((line) => semesterRegex.test(line));

  if (index < 0) {
    throw new Error(`The ${staticPlan?.title ?? "NDU"} parser could not find the suggested program semester headings in the official page.`);
  }

  while (index < lines.length) {
    const line = String(lines[index] ?? "").trim();
    if (/^Courses$/i.test(line) && sequences.fall.length) break;
    const semesterMatch = line.match(semesterRegex);
    if (!semesterMatch) {
      index += 1;
      continue;
    }

    const season = semesterMatch[1][0].toUpperCase() + semesterMatch[1].slice(1).toLowerCase();
    index += 1;
    if (yearRegex.test(lines[index] || "")) {
      currentYear = String(lines[index] ?? "").replace(/\s+\(.+$/, "").trim();
      index += 1;
    }

    const items = [];
    while (index < lines.length) {
      const candidate = String(lines[index] ?? "").trim();
      if (!candidate) {
        index += 1;
        continue;
      }
      if (semesterRegex.test(candidate) || /^Courses$/i.test(candidate)) break;
      if (/^[A-Z]{2,4}\s+\d{3}[A-Z]?\s*-\s+/.test(candidate)) {
        const code = candidate.split(/\s*-\s*/, 1)[0];
        items.push({ type: "course", code: normalizeCode(code) });
      } else if (/^LAC\s*-/.test(candidate)) {
        items.push({ type: "requirement", code: "Liberal Arts Curriculum" });
      } else if (/(Free|Technical|Major)\s+Elective/i.test(candidate)) {
        items.push({ type: "requirement", code: candidate });
      } else if (/^(English|Arabic) Communication\b/i.test(candidate)) {
        items.push({ type: "requirement", code: candidate });
      }
      index += 1;
    }

    if (items.length) {
      sequences.fall.push({
        label: `${currentYear} ${season}`.trim(),
        items,
      });
    }
  }

  if (!sequences.fall.length) {
    throw new Error(`The ${staticPlan?.title ?? "NDU"} parser did not recover any semester blocks from the official curriculum page.`);
  }

  return {
    ...clone(staticPlan),
    sequences,
  };
}

function parseUsjCursusPlan(text, staticPlan) {
  const lines = splitLines(String(text).replace(/&amp;/g, "&").replace(/&#x27;/g, "'"));
  const sequences = { fall: [] };
  const yearMap = {
    first: "First Year",
    second: "Second Year",
    third: "Third Year",
    fourth: "Fourth Year",
    fifth: "Fifth Year",
    premiere: "First Year",
    "première": "First Year",
    deuxieme: "Second Year",
    "deuxième": "Second Year",
    troisieme: "Third Year",
    "troisième": "Third Year",
    quatrieme: "Fourth Year",
    "quatrième": "Fourth Year",
    cinquieme: "Fifth Year",
    "cinquième": "Fifth Year",
  };
  const yearRegex = /^(First|Second|Third|Fourth|Fifth|Premiere|Première|Deuxieme|Deuxième|Troisieme|Troisième|Quatrieme|Quatrième|Cinquieme|Cinquième)\s+(?:year|ann[ée]e)$/i;
  const semesterRegex = /^(Semester|Semestre)\s+(\d+)$/i;
  let currentYear = "";
  let seenStart = false;
  let index = lines.findIndex((line) => yearRegex.test(line));

  if (index < 0) {
    throw new Error(`The ${staticPlan?.title ?? "USJ"} parser could not find the semester-by-semester year blocks in the official cursus page.`);
  }

  while (index < lines.length) {
    const line = String(lines[index] ?? "").trim();
    const yearMatch = line.match(yearRegex);
    if (yearMatch) {
      const normalizedYearKey = String(yearMatch[1] ?? "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "");
      if (seenStart && normalizedYearKey === "first") break;
      currentYear = yearMap[normalizedYearKey] || `${yearMatch[1][0].toUpperCase()}${yearMatch[1].slice(1).toLowerCase()} Year`;
      seenStart = true;
      index += 1;
      continue;
    }

    const semesterMatch = line.match(semesterRegex);
    if (!semesterMatch) {
      index += 1;
      continue;
    }

    const items = [];
    let mode = "";
    index += 1;

    while (index < lines.length) {
      const candidate = String(lines[index] ?? "").trim();
      if (yearRegex.test(candidate) || semesterRegex.test(candidate)) break;
      if (/^(Compulsory UE|UE obligatoires)$/i.test(candidate)) {
        mode = "compulsory";
        index += 1;
        continue;
      }
      if (/^(Optional UE|UE optionnelles)$/i.test(candidate)) {
        mode = "optional";
        index += 1;
        continue;
      }

      if (mode === "compulsory") {
        let title = "";
        if (candidate === "-" && lines[index + 1]) {
          title = String(lines[index + 1] ?? "").trim();
          index += 1;
        } else if (candidate !== "-" && !/^Parcours\b/i.test(candidate)) {
          title = candidate;
        }

        title = normalizeWhitespace(title);
        if (
          title
          && !/^(Bachelor|Licence|Parcours|Cr[ée]dits|Langue|Lieu|Admission|Pr[ée]requis|Ensemble|Together|Responsable pédagogique|Nombre de semestres|Institut|Brochure|Catalogue|R[èe]glement|Dipl[oô]me)/i.test(title)
        ) {
          items.push({ type: "requirement", code: title });
        }
      }
      index += 1;
    }

    if (items.length) {
      sequences.fall.push({
        label: `${currentYear} Semester ${semesterMatch[2]}`.trim(),
        items,
      });
    }
  }

  if (!sequences.fall.length) {
    throw new Error(`The ${staticPlan?.title ?? "USJ"} parser did not recover any semester blocks from the official cursus page.`);
  }

  return {
    ...clone(staticPlan),
    sequences,
  };
}

async function rebuildPlan(staticPlan) {
  const checkedAt = new Date().toISOString();
  const baseMeta = {
    checkedAt,
    parserMode: "parsed",
    sourceOk: false,
    sourceHash: null,
    parseError: null,
  };

  try {
    const { text, hash } = await fetchSourceText(staticPlan.source);
    let rebuiltPlan = null;

      if (staticPlan.universityId === "aub" && staticPlan.id === "computer-science") {
        rebuiltPlan = parseAubComputerSciencePlan(text, staticPlan);
      } else if (staticPlan.universityId === "aub" && staticPlan.id === "business-administration") {
        rebuiltPlan = parseAubBusinessPlan(text, staticPlan);
      } else if (
        staticPlan.universityId === "aub"
        && /aub\.edu\.lb\/Registrar\/catalogue2024-25\/Pages\/undergraduate-(?:cee|ceae|ece|iem|mechanical)\.aspx/i.test(String(staticPlan.source ?? ""))
      ) {
        rebuiltPlan = parseAubCatalogueTermPlan(text, staticPlan);
      } else if (
        staticPlan.universityId === "liu"
        && /liu\.edu\.lb\/NewLIU2022\/metaData\/.+-POS\.pdf/i.test(String(staticPlan.source ?? ""))
    ) {
      rebuiltPlan = parseLiuPlan(text, staticPlan);
    } else if (
      staticPlan.universityId === "bau"
      && /websitedev\.bau\.edu\.lb\/Program\/Science\/Bachelor\//i.test(String(staticPlan.source ?? ""))
    ) {
      rebuiltPlan = parseBauSemesterTable(text, staticPlan);
    } else if (
      staticPlan.universityId === "aust"
      && /api\.aust\.edu\.lb\/content\/uploads\/files\/.+\.pdf/i.test(String(staticPlan.source ?? ""))
    ) {
      rebuiltPlan = parseAustSemesterPlan(text, staticPlan);
    } else if (
      staticPlan.universityId === "ndu"
      && /ndu\.edu\.lb\/Faculties\/Curriculum|ndu\.edu\.lb\/academics\/faculties\/.+\/curriculum/i.test(String(staticPlan.source ?? ""))
    ) {
      rebuiltPlan = parseNduSuggestedProgram(text, staticPlan);
    } else if (
      staticPlan.universityId === "usj"
      && /usj\.edu\.lb\/.+(?:cursus\.php|form\.php\?diplome=)/i.test(String(staticPlan.source ?? ""))
    ) {
      rebuiltPlan = parseUsjCursusPlan(text, staticPlan);
    }

    if (!rebuiltPlan) {
      return annotatePlan(clone(staticPlan), {
        ...baseMeta,
        parserMode: "static-fallback",
        sourceOk: true,
        sourceHash: hash,
      });
    }

    return annotatePlan(rebuiltPlan, {
      ...baseMeta,
      sourceOk: true,
      sourceHash: hash,
    });
  } catch (error) {
    return annotatePlan(clone(staticPlan), {
      ...baseMeta,
      parserMode: "static-fallback",
      parseError: error?.message || String(error),
    });
  }
}

function buildStatus(plans = []) {
  const sources = plans.map((plan) => ({
    universityId: plan.universityId,
    planId: plan.id,
    title: plan.title,
    url: plan.source,
    checkedAt: plan.sourceMeta?.checkedAt || null,
    sourceOk: Boolean(plan.sourceMeta?.sourceOk),
    parserMode: plan.sourceMeta?.parserMode || "static-fallback",
    sourceHash: plan.sourceMeta?.sourceHash || null,
    parseError: plan.sourceMeta?.parseError || null,
  }));

  const byUniversity = {};
  for (const plan of plans) {
    const universityId = String(plan.universityId ?? "").toLowerCase();
    if (!byUniversity[universityId]) {
      byUniversity[universityId] = {
        planCount: 0,
        parsedPlanCount: 0,
        lastCheckedAt: null,
      };
    }
    byUniversity[universityId].planCount += 1;
    if (plan.sourceMeta?.parserMode === "parsed") byUniversity[universityId].parsedPlanCount += 1;
    const checkedAt = plan.sourceMeta?.checkedAt || null;
    if (checkedAt && (!byUniversity[universityId].lastCheckedAt || checkedAt > byUniversity[universityId].lastCheckedAt)) {
      byUniversity[universityId].lastCheckedAt = checkedAt;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalPlans: plans.length,
    parsedPlans: plans.filter((plan) => plan.sourceMeta?.parserMode === "parsed").length,
    fallbackPlans: plans.filter((plan) => plan.sourceMeta?.parserMode !== "parsed").length,
    sources,
    byUniversity,
  };
}

async function buildCurriculumPlans() {
  const plans = [];
  for (const staticPlan of STATIC_CURRICULUM_PLANS) {
    plans.push(await rebuildPlan(staticPlan));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    plans,
    status: buildStatus(plans),
  };

  fs.mkdirSync(CURRICULUM_RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(CURRICULUM_RUNTIME_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

if (require.main === module) {
  buildCurriculumPlans()
    .then((payload) => {
      console.log(`[curriculum] wrote ${CURRICULUM_RUNTIME_FILE}`);
      console.table([{
        generatedAt: payload.generatedAt,
        totalPlans: payload.status.totalPlans,
        parsedPlans: payload.status.parsedPlans,
        fallbackPlans: payload.status.fallbackPlans,
      }]);
    })
    .catch((error) => {
      console.error("[curriculum] build failed:", error);
      process.exit(1);
    });
}

module.exports = {
  buildCurriculumPlans,
};
