const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { createWorker } = require("tesseract.js");
const { getImportDirectories } = require("./manualTimedImports.cjs");
const { normalizeWhitespace } = require("./catalogUtils.cjs");

const VISUAL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
const GENERATED_PREFIX = "__visual__";
const GENERATED_SUFFIX = ".json";
const DEFAULT_DAY_SEQUENCE = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DISCOVERY_FILE_PATTERNS_BY_UNIVERSITY = {
  liu: [
    /^WhatsApp Image/i,
    /^Screenshot/i,
    /\bschedule\b/i,
    /\btimetable\b/i,
    /\bsyslb\b/i,
    /\bliu\b/i,
  ],
  lu: [
    /\bschedule\b/i,
    /\bhoraire\b/i,
    /\bemploi\b/i,
    /\btimetable\b/i,
    /\blu\b/i,
  ],
  usj: [
    /\bschedule\b/i,
    /\borthophonie\b/i,
    /\bslt\b/i,
    /\busj\b/i,
    /\btimetable\b/i,
  ],
};

const USJ_PDF_TITLE_CODE_HINTS = {
  "phonetics i": { code: "040PHO1L2" },
  "research methods introduction to research in speech and language therapy": { code: "040MRP1L2" },
  "communication and oral language development": { code: "040COLDL1" },
  "english for slt 2": { code: "040ENSLL2" },
  "clinical approach to slt 2": { code: "040SEP2L2" },
  "orthodontics": { code: "040SMFOL1" },
  "stomatology": { code: "040SMFOL1" },
  "introduction to linguistics": { code: "040LINSL2" },
  "functional neuroanatomy": { code: "040FUNEL2" },
  "pediatrics and genetics": { code: "040PEGEL2" },
  "pediatrics": { code: "040PEGEL2" },
  "practicum 2": { code: "040PRINL6" },
  "volunteering and active citizenship": { code: "015ABC2L3", section: "G4" },
};

function slugify(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildGeneratedPath(universityId, sourceFilePath) {
  const hash = crypto.createHash("md5").update(String(sourceFilePath)).digest("hex");
  const dir = path.join(__dirname, "..", "data", "manual-timetables", universityId);
  ensureDir(dir);
  return path.join(dir, `${GENERATED_PREFIX}${hash}${GENERATED_SUFFIX}`);
}

function readExistingCatalogContext(universityId) {
  const filePaths = [
    path.join(__dirname, "..", "data", "catalogs", `${universityId}.json`),
    path.join(__dirname, "..", "data", "catalogs", `${universityId}.backup.json`),
    path.join(__dirname, "..", "CoursePlannerr", "public", "seed-catalogs", `${universityId}.json`),
  ];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const courses = Array.isArray(parsed?.courses) ? parsed.courses : [];
      const terms = Array.isArray(parsed?.terms) ? parsed.terms : [];
      const termMetrics = terms.map((term) => {
        const termCode = normalizeWhitespace(term?.code || "");
        const termCourses = courses.filter((course) => normalizeWhitespace(course?.term_code || "") === termCode);
        const timedCount = termCourses.filter((course) => {
          if (course?.hasPublishedMeetings) return true;
          const meetings = Array.isArray(course?.meetings) ? course.meetings : [];
          if (meetings.some((meeting) => normalizeWhitespace(meeting?.days) && normalizeWhitespace(meeting?.time) && normalizeWhitespace(meeting?.time).toUpperCase() !== "TBA")) {
            return true;
          }
          const scheduleDays = normalizeWhitespace(course?.schedule?.days || "");
          const scheduleTime = normalizeWhitespace(course?.schedule?.time || "");
          return Boolean(scheduleDays && scheduleTime && scheduleTime.toUpperCase() !== "TBA");
        }).length;
        return {
          term,
          termCode,
          timedCount,
          courseCount: termCourses.length,
          isCatalogTerm: /^catalog-/i.test(termCode),
        };
      });
      termMetrics.sort((left, right) => {
        if (left.isCatalogTerm !== right.isCatalogTerm) return left.isCatalogTerm ? 1 : -1;
        if (left.timedCount !== right.timedCount) return right.timedCount - left.timedCount;
        if (left.courseCount !== right.courseCount) return right.courseCount - left.courseCount;
        if (Boolean(left.term?.is_current) !== Boolean(right.term?.is_current)) return left.term?.is_current ? -1 : 1;
        return 0;
      });
      const currentTerm =
        termMetrics.find((entry) => !entry.isCatalogTerm && entry.timedCount > 0)?.term ||
        terms.find((term) => term?.is_current && !/^catalog-/i.test(normalizeWhitespace(term?.code || ""))) ||
        terms.find((term) => term?.is_current) ||
        termMetrics[0]?.term ||
        terms[0] ||
        null;
      const byCode = new Map();
      courses.forEach((course) => {
        const normalizedCode = normalizeCode(course.code || `${course.department || ""} ${course.course_number || ""}`);
        if (!normalizedCode) return;
        if (!byCode.has(normalizedCode)) {
          byCode.set(normalizedCode, {
            title: normalizeWhitespace(course.title),
            credits: Number(course.credits || 0) || 0,
            attributes: Array.isArray(course.attributes) ? course.attributes : [],
            campus: normalizeWhitespace(course.campus),
            prerequisites: normalizeWhitespace(course.prerequisites),
          });
        }
      });
      return {
        termCode: normalizeWhitespace(currentTerm?.code || "").replace(new RegExp(`^${universityId}:`, "i"), ""),
        termDescription: normalizeWhitespace(currentTerm?.description || ""),
        byCode,
        currentCourses: courses.filter((course) => normalizeWhitespace(course.term_code || "") === normalizeWhitespace(currentTerm?.code || "")),
      };
    } catch {
      continue;
    }
  }

  return { termCode: "", termDescription: "", byCode: new Map(), currentCourses: [] };
}

function normalizeCode(value = "") {
  const normalized = normalizeWhitespace(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
  const match = normalized.match(/^([A-Z]{3,6})(\d{3}[A-Z]{0,2})$/);
  if (!match) return "";
  return `${match[1]} ${match[2]}`;
}

function normalizeComparableText(value = "") {
  return normalizeWhitespace(String(value))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanVisualToken(value = "") {
  return normalizeWhitespace(String(value || "").replace(/^[^A-Z0-9]+/i, "").replace(/[^A-Z0-9)\]-]+$/i, ""));
}

function levenshteinDistance(left = "", right = "") {
  const a = String(left);
  const b = String(right);
  if (!a) return b.length;
  if (!b) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function resolveCatalogCode(code = "", catalogContext = null) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode || !catalogContext?.byCode?.size) return normalizedCode;
  if (catalogContext.byCode.has(normalizedCode)) return normalizedCode;

  const codeParts = normalizedCode.match(/^([A-Z]{3,6})\s(\d{3}[A-Z]{0,2})$/);
  if (!codeParts) return normalizedCode;
  const [, parsedPrefix, parsedNumber] = codeParts;
  const candidates = [];

  for (const candidateCode of catalogContext.byCode.keys()) {
    const candidateParts = candidateCode.match(/^([A-Z]{3,6})\s(\d{3}[A-Z]{0,2})$/);
    if (!candidateParts || candidateParts[2] !== parsedNumber) continue;
    const candidatePrefix = candidateParts[1];
    const distance = levenshteinDistance(parsedPrefix, candidatePrefix);
    const suffixDistance = levenshteinDistance(parsedPrefix.slice(-3), candidatePrefix.slice(-3));
    candidates.push({
      code: candidateCode,
      score: (distance * 10) + suffixDistance + Math.abs(candidatePrefix.length - parsedPrefix.length),
    });
  }

  candidates.sort((left, right) => left.score - right.score);
  if (candidates.length && candidates[0].score <= 14) {
    return candidates[0].code;
  }

  return normalizedCode;
}

function formatTime(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseVisualTimeToken(token = "") {
  const normalized = normalizeWhitespace(token).replace(/[^\d:]/g, "");
  const colon = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) return (Number(colon[1]) * 60) + Number(colon[2]);
  const compact = normalized.match(/^(\d{1,2})(\d{2})$/);
  if (compact) return (Number(compact[1]) * 60) + Number(compact[2]);
  return null;
}

function buildNodeCanvasFactory() {
  return {
    create(width, height) {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d") };
    },
    reset(target, width, height) {
      target.canvas.width = width;
      target.canvas.height = height;
    },
    destroy(target) {
      target.canvas.width = 0;
      target.canvas.height = 0;
      target.canvas = null;
      target.context = null;
    },
  };
}

async function renderPdfToBuffers(filePath) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const canvasFactory = buildNodeCanvasFactory();
  const buffers = [];

  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const viewport = page.getViewport({ scale: 2.2 });
    const target = canvasFactory.create(viewport.width, viewport.height);
    await page.render({
      canvasContext: target.context,
      viewport,
      canvasFactory,
    }).promise;
    buffers.push({
      buffer: target.canvas.toBuffer("image/png"),
      pageIndex: index - 1,
    });
    canvasFactory.destroy(target);
  }

  return buffers;
}

async function extractPdfPageTextItems(filePath) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];

  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ({
      text: normalizeWhitespace(item.str || ""),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      centerX: Number(item.transform?.[4] || 0) + (Number(item.width || 0) / 2),
    })).filter((item) => item.text));
  }

  return pages;
}

async function loadVisualPages(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") {
    return renderPdfToBuffers(filePath);
  }
  return [{ buffer: fs.readFileSync(filePath), pageIndex: 0 }];
}

function canvasFromBuffer(buffer) {
  return loadImage(buffer).then((image) => {
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return canvas;
  });
}

function cropCanvas(canvas, bounds) {
  const out = createCanvas(bounds.width, bounds.height);
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  return out;
}

function detectDocumentBounds(canvas) {
  const ctx = canvas.getContext("2d");
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  const left = Math.floor(width * 0.12);
  const right = Math.ceil(width * 0.88);
  const top = Math.floor(height * 0.12);
  const bottom = Math.ceil(height * 0.95);

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 225 && g > 225 && b > 225) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, width, height };
  }

  const padding = 20;
  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(width - Math.max(0, minX - padding), (maxX - minX + 1) + (padding * 2)),
    height: Math.min(height - Math.max(0, minY - padding), (maxY - minY + 1) + (padding * 2)),
  };
}

function clusterPositions(values, gap = 2) {
  const sorted = [...values].sort((left, right) => left - right);
  const clusters = [];
  for (const value of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current || value - current[current.length - 1] > gap) {
      clusters.push([value]);
      continue;
    }
    current.push(value);
  }
  return clusters.map((cluster) => Math.round(cluster.reduce((sum, value) => sum + value, 0) / cluster.length));
}

function detectVerticalLines(canvas) {
  const ctx = canvas.getContext("2d");
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hits = [];
  const startY = Math.floor(height * 0.05);
  const endY = Math.ceil(height * 0.92);

  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = startY; y < endY; y += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r < 70 && g < 70 && b < 70) count += 1;
    }
    if (count > (endY - startY) * 0.55) hits.push(x);
  }

  return clusterPositions(hits, 3);
}

function detectHorizontalLines(canvas) {
  const ctx = canvas.getContext("2d");
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hits = [];
  const startX = Math.floor(width * 0.05);
  const endX = Math.ceil(width * 0.95);

  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = startX; x < endX; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r < 90 && g < 90 && b < 90) count += 1;
    }
    if (count > (endX - startX) * 0.35) hits.push(y);
  }

  return clusterPositions(hits, 3);
}

function detectScheduleArea(canvas) {
  const lines = detectHorizontalLines(canvas);
  if (!lines.length) {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }

  const topCandidate = lines.find((value) => value > canvas.height * 0.15 && value < canvas.height * 0.7);
  const bottomCandidate = [...lines].reverse().find((value) => value > (topCandidate || 0) + 300 && value < canvas.height * 0.98);

  if (!topCandidate || !bottomCandidate || bottomCandidate <= topCandidate) {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }

  const top = Math.max(0, topCandidate - 10);
  const bottom = Math.min(canvas.height, bottomCandidate + 5);
  return {
    x: 0,
    y: top,
    width: canvas.width,
    height: bottom - top,
  };
}

function detectColoredBlocks(canvas, leftBoundary) {
  const ctx = canvas.getContext("2d");
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const seen = new Uint8Array(width * height);
  const blocks = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function isCandidate(x, y) {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 200) return false;
    if (x < leftBoundary + 2 || y < 80 || y > height - 90) return false;
    const avg = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    return avg >= 145 && avg <= 250 && spread >= 4 && spread <= 90;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (seen[index] || !isCandidate(x, y)) continue;
      const stack = [[x, y]];
      seen[index] = 1;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let count = 0;

      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nextIndex = (ny * width) + nx;
          if (seen[nextIndex] || !isCandidate(nx, ny)) continue;
          seen[nextIndex] = 1;
          stack.push([nx, ny]);
        }
      }

      const blockWidth = maxX - minX + 1;
      const blockHeight = maxY - minY + 1;
      if (count > 200 && blockWidth > 25 && blockHeight > 20 && blockWidth < width * 0.45 && blockHeight < height * 0.25) {
        blocks.push({ x: minX, y: minY, width: blockWidth, height: blockHeight });
      }
    }
  }

  return blocks.sort((left, right) => left.y - right.y || left.x - right.x);
}

function cropAxisCanvas(canvas, leftBoundary) {
  const sourceY = Math.max(36, Math.floor(canvas.height * 0.045));
  const bottomPadding = Math.max(24, Math.floor(canvas.height * 0.06));
  const height = Math.max(160, canvas.height - sourceY - bottomPadding);
  const width = Math.max(70, Math.min((leftBoundary * 2) + 20, 120));
  return {
    sourceY,
    crop: cropCanvas(canvas, {
      x: 0,
      y: sourceY,
      width,
      height,
    }),
  };
}

async function recognizeAxis(worker, axisCanvas, sourceY) {
  const buffer = axisCanvas.toBuffer("image/png");
  const result = await worker.recognize(buffer, {}, { tsv: true, text: true });
  const rows = String(result.data.tsv || "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"));
  const entries = rows
    .filter((columns) => columns.length >= 12 && columns[0] === "5")
    .map((columns) => ({
      text: columns[11],
      top: Number(columns[7]),
      height: Number(columns[9]),
    }))
    .map((entry) => {
      const minutes = parseVisualTimeToken(entry.text);
      if (minutes === null) return null;
      return {
        minutes,
        anchorY: sourceY + entry.top + (entry.height * 0.85),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.minutes - right.minutes);

  if (entries.length < 6) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  entries.forEach((entry) => {
    sumX += entry.minutes;
    sumY += entry.anchorY;
    sumXX += entry.minutes * entry.minutes;
    sumXY += entry.minutes * entry.anchorY;
  });

  const denominator = (entries.length * sumXX) - (sumX * sumX);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.001) return null;

  const slope = ((entries.length * sumXY) - (sumX * sumY)) / denominator;
  const intercept = (sumY - (slope * sumX)) / entries.length;
  if (!Number.isFinite(slope) || slope <= 0) return null;

  return { intercept, slope };
}

function quantizeYToTime(y, scale, offset = 0) {
  const rawMinutes = (y + offset - scale.intercept) / scale.slope;
  const rounded = Math.round(rawMinutes / 15) * 15;
  return formatTime(rounded);
}

function parseCourseText(rawText = "") {
  const normalized = normalizeWhitespace(rawText.replace(/\s+/g, " "));
  const codeMatch = normalized.match(/([A-Z]{3,6}\s?\d{3}[A-Z]{0,2})/i);
  const sectionMatch = normalized.match(/Sec\s*([A-Z0-9]+)/i);
  const locationMatch = normalized.match(/(\d{3}-[A-Z](?:\([A-Z]+\))?)/i);
  const lines = String(rawText)
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const instructor = lines.length > 1 ? lines[lines.length - 1] : "";

  return {
    rawText: normalized,
    code: codeMatch ? normalizeCode(codeMatch[1]) : "",
    section: sectionMatch ? cleanVisualToken(sectionMatch[1]).toUpperCase() : "",
    location: locationMatch ? cleanVisualToken(locationMatch[1]).toUpperCase() : "",
    instructor: cleanVisualToken(instructor),
  };
}

async function recognizeBlock(worker, canvas, block) {
  const scale = 3;
  const padded = 4;
  const out = createCanvas((block.width + (padded * 2)) * scale, (block.height + (padded * 2)) * scale);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(
    canvas,
    block.x,
    block.y,
    block.width,
    block.height,
    padded * scale,
    padded * scale,
    block.width * scale,
    block.height * scale,
  );

  const result = await worker.recognize(out.toBuffer("image/png"));
  return parseCourseText(result.data.text || "");
}

function enrichBlockRecords(records) {
  const byInstructorSlot = new Map();
  records.forEach((record) => {
    const key = [record.instructor.toLowerCase(), record.startTime, record.endTime].join("|");
    if (!record.instructor) return;
    if (!byInstructorSlot.has(key)) byInstructorSlot.set(key, []);
    byInstructorSlot.get(key).push(record);
  });

  records.forEach((record) => {
    if (record.code) return;
    const key = [record.instructor.toLowerCase(), record.startTime, record.endTime].join("|");
    const candidates = byInstructorSlot.get(key) || [];
    const donor = candidates.find((entry) => entry.code);
    if (!donor) return;
    record.code = donor.code;
    if (!record.section) record.section = donor.section;
    if (!record.location) record.location = donor.location;
  });

  return records.filter((record) => record.code);
}

function buildDayLabels(columnCount) {
  return DEFAULT_DAY_SEQUENCE.slice(0, Math.max(0, columnCount));
}

function inferColumnIndex(block, lines) {
  const centerX = block.x + (block.width / 2);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (centerX >= lines[index] && centerX <= lines[index + 1]) return index - 1;
  }
  return -1;
}

function mergeRecordsIntoRows(records, universityId, catalogContext, defaultTermCode, defaultTermDescription, filePath) {
  const grouped = new Map();
  records.forEach((record) => {
    const resolvedCode = resolveCatalogCode(record.code, catalogContext);
    const normalizedInstructor = cleanVisualToken(record.instructor).toLowerCase();
    const key = [
      resolvedCode,
      normalizedInstructor || "tba",
      record.startTime,
      record.endTime,
    ].join("|");
    if (!grouped.has(key)) grouped.set(key, { ...record, code: resolvedCode, dayLabels: [] });
    const target = grouped.get(key);
    target.dayLabels.push(record.dayLabel);
    if (!target.section || String(record.section || "").length > String(target.section || "").length) target.section = record.section;
    if ((!target.location || target.location === "TBA") && record.location) target.location = record.location;
    if ((!target.instructor || target.instructor === "TBA") && record.instructor) target.instructor = record.instructor;
  });

  return [...grouped.values()].map((record) => {
    const courseDetails = catalogContext.byCode.get(record.code) || {};
    const orderedDayLabels = [...new Set(record.dayLabels)].sort(
      (left, right) => DEFAULT_DAY_SEQUENCE.indexOf(left) - DEFAULT_DAY_SEQUENCE.indexOf(right),
    );
    const compactDays = orderedDayLabels
      .map((day) => day[0] === "T" && day.startsWith("Thu") ? "R" : day[0])
      .join("");
    const time = `${record.startTime} - ${record.endTime}`;
    return {
      term_code: defaultTermCode,
      term_description: defaultTermDescription,
      code: record.code,
      title: courseDetails.title || record.code,
      section: record.section || "A",
      crn: `${universityId.toUpperCase()}-VISUAL-${slugify(`${record.code}-${record.section || "A"}-${orderedDayLabels.join("-")}-${record.startTime}`)}`.toUpperCase(),
      instructor: cleanVisualToken(record.instructor) || "TBA",
      campus: courseDetails.campus || "TBA",
      location: record.location || "TBA",
      days: compactDays,
      time,
      type: "Lecture",
      credits: Number(courseDetails.credits || 0) || 0,
      attributes: courseDetails.attributes || [],
      prerequisites: courseDetails.prerequisites && String(courseDetails.prerequisites).toLowerCase() !== "null" ? courseDetails.prerequisites : "",
      source_schedule_note: `Imported from official visual timetable ${path.basename(filePath)}`,
      has_published_meetings: true,
    };
  });
}

function buildUsjPdfColumnBands(items) {
  const headers = items
    .filter((item) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(item.text))
    .sort((left, right) => left.x - right.x);
  if (headers.length < 4) return [];

  return headers.map((header, index) => {
    const previousCenter = headers[index - 1]?.centerX ?? (header.centerX - 55);
    const nextCenter = headers[index + 1]?.centerX ?? (header.centerX + 55);
    return {
      day: header.text,
      minX: index === 0 ? 80 : (previousCenter + header.centerX) / 2,
      maxX: index === headers.length - 1 ? nextCenter + 35 : (header.centerX + nextCenter) / 2,
    };
  });
}

function buildUsjPdfRowBands(items) {
  const labels = items
    .filter((item) => item.x < 90 && /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/i.test(item.text))
    .sort((left, right) => right.y - left.y);
  if (!labels.length) return [];

  return labels.map((label, index) => {
    const previousY = labels[index - 1]?.y ?? (label.y + 40);
    const nextY = labels[index + 1]?.y ?? (label.y - 40);
    return {
      time: label.text.replace(/\s+/g, " "),
      y: label.y,
      maxY: index === 0 ? previousY + 20 : (previousY + label.y) / 2,
      minY: index === labels.length - 1 ? nextY - 20 : (label.y + nextY) / 2,
    };
  });
}

function clusterUsjPdfLines(items) {
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
  const lines = [];
  for (const item of sorted) {
    const current = lines[lines.length - 1];
    if (!current || Math.abs(current.y - item.y) > 2.5) {
      lines.push({ y: item.y, items: [item] });
      continue;
    }
    current.items.push(item);
  }

  return lines
    .map((line) =>
      normalizeWhitespace(
        line.items
          .sort((left, right) => left.x - right.x)
          .map((item) => item.text)
          .join(" "),
      ))
    .filter(Boolean);
}

function extractUsjPdfTitle(lines = []) {
  const titleLines = [];
  for (const line of lines) {
    const normalized = normalizeComparableText(line);
    if (!normalized) continue;
    if (
      /^-?\s*\d+\s*credits?/.test(normalized)
      || /^(mrs|ms|dr|prof)\b/.test(normalized)
      || /^(group|common with|jan|feb|march|april|starting|waiting)\b/.test(normalized)
      || normalized === "break"
      || /^c[\s0-9.a-z-]+$/.test(normalized)
    ) {
      break;
    }
    titleLines.push(line);
  }
  return normalizeWhitespace(titleLines.join(" "));
}

function findUsjPdfLocation(lines = []) {
  for (const line of lines) {
    const match = line.match(/\b(?:CIS|CLS|CSH|CFDSS|CST|CSM)?-?-?-?[A-Z]?\.*[0-9A-Z.()/-]+\b/g);
    if (!match?.length) continue;
    const candidate = normalizeWhitespace(match[0]).replace(/\.$/, "");
    if (/^C\d/i.test(candidate)) return `CIS---${candidate}`;
    if (/[0-9]/.test(candidate)) return candidate;
  }
  return "TBA";
}

function findUsjPdfInstructor(lines = []) {
  return lines.find((line) => /^(Mrs|Ms|Dr|Prof)\b/i.test(line)) || "TBA";
}

function resolveUsjPdfCourse(title, catalogContext) {
  const titleKey = normalizeComparableText(title);
  if (!titleKey) return null;
  const hint = USJ_PDF_TITLE_CODE_HINTS[titleKey] || null;
  if (hint) {
    const matches = (catalogContext.currentCourses || []).filter((course) => normalizeWhitespace(course.code) === hint.code);
    if (!matches.length) return null;
    if (hint.section) {
      const exact = matches.find((course) => normalizeWhitespace(course.section).toUpperCase() === hint.section);
      if (exact) return exact;
    }
    return matches[0];
  }

  return (catalogContext.currentCourses || []).find(
    (course) => normalizeComparableText(course.title) === titleKey,
  ) || null;
}

function buildUsjPdfStructuredCourse(baseCourse, meetings, filePath, termCode, termDescription) {
  const normalizedMeetings = meetings
    .map((meeting) => ({
      days: meeting.day,
      time: meeting.time,
      location: meeting.location || "TBA",
      section: normalizeWhitespace(baseCourse.section || "1"),
      type: "Class",
    }))
    .filter((meeting) => meeting.days && meeting.time);
  if (!normalizedMeetings.length) return null;

  return {
    term_code: termCode,
    term_description: termDescription || "Imported USJ timetable",
    code: normalizeWhitespace(baseCourse.code),
    title: normalizeWhitespace(baseCourse.title),
    section: normalizeWhitespace(baseCourse.section || "1"),
    crn: normalizeWhitespace(baseCourse.crn || `USJ-${baseCourse.code}-${baseCourse.section || "1"}`),
    instructor: normalizeWhitespace(meetings.find((meeting) => meeting.instructor)?.instructor || baseCourse.instructor || "TBA"),
    campus: normalizeWhitespace(baseCourse.campus || "TBA"),
    credits: Number(baseCourse.credits || 0) || 0,
    meetings: normalizedMeetings,
    schedule: normalizedMeetings[0],
    attributes: Array.isArray(baseCourse.attributes) ? baseCourse.attributes : [],
    prerequisites: baseCourse.prerequisites || null,
    source_schedule_note: `Imported from official timetable file ${path.basename(filePath)}`,
  };
}

async function parseUsjPdfStructuredCourses(filePath, catalogContext) {
  const pages = await extractPdfPageTextItems(filePath);
  const grouped = new Map();

  for (const items of pages) {
    const columnBands = buildUsjPdfColumnBands(items);
    const rowBands = buildUsjPdfRowBands(items);
    if (!columnBands.length || !rowBands.length) continue;

    const bodyItems = items.filter((item) => {
      if (/^(Saint-Joseph University of Beirut|Faculty of Medicine|Institut supérieur d'orthophonie|Academic Year 2025-2026|S2 Schedule)$/i.test(item.text)) return false;
      if (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(item.text)) return false;
      if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/i.test(item.text)) return false;
      if (normalizeComparableText(item.text) === "break") return false;
      return true;
    });

    const cells = new Map();
    for (const item of bodyItems) {
      const column = columnBands.find((band) => item.centerX >= band.minX && item.centerX < band.maxX);
      const row = rowBands.find((band) => item.y <= band.maxY && item.y > band.minY);
      if (!column || !row) continue;
      const key = `${column.day}|${row.time}`;
      if (!cells.has(key)) {
        cells.set(key, { day: column.day, time: row.time, items: [] });
      }
      cells.get(key).items.push(item);
    }

    for (const cell of cells.values()) {
      const lines = clusterUsjPdfLines(cell.items);
      const title = extractUsjPdfTitle(lines);
      const target = resolveUsjPdfCourse(title, catalogContext);
      if (!target) continue;

      const key = `${normalizeWhitespace(target.code)}|${normalizeWhitespace(target.section)}|${normalizeWhitespace(target.crn || "")}`;
      if (!grouped.has(key)) {
        grouped.set(key, { baseCourse: target, meetings: [] });
      }

      grouped.get(key).meetings.push({
        day: cell.day,
        time: cell.time,
        location: findUsjPdfLocation(lines),
        instructor: findUsjPdfInstructor(lines),
      });
    }
  }

  return [...grouped.values()]
    .map((entry) => buildUsjPdfStructuredCourse(entry.baseCourse, entry.meetings, filePath, catalogContext.termCode, catalogContext.termDescription))
    .filter(Boolean);
}

async function parseWeeklyScheduleCanvas(canvas, worker, universityId, filePath, pageIndex, catalogContext) {
  const documentBounds = detectDocumentBounds(canvas);
  const documentCanvas = cropCanvas(canvas, documentBounds);
  const scheduleCanvas = cropCanvas(documentCanvas, detectScheduleArea(documentCanvas));
  const verticalLines = detectVerticalLines(scheduleCanvas);
  if (verticalLines.length < 4) return [];
  const outerLeft = verticalLines[0];
  const columnCount = verticalLines.length - 2;
  if (columnCount < 1) return [];

  const blocks = detectColoredBlocks(scheduleCanvas, outerLeft);
  if (!blocks.length) return [];

  const axis = cropAxisCanvas(scheduleCanvas, verticalLines[1]);
  const timeScale = await recognizeAxis(worker, axis.crop, axis.sourceY);
  if (!timeScale) return [];

  const dayLabels = buildDayLabels(columnCount);
  const rawRecords = [];
  for (const block of blocks) {
    const columnIndex = inferColumnIndex(block, verticalLines);
    if (columnIndex < 0 || columnIndex >= dayLabels.length) continue;
    const text = await recognizeBlock(worker, scheduleCanvas, block);
    rawRecords.push({
      ...text,
      block,
      dayLabel: dayLabels[columnIndex],
      startTime: quantizeYToTime(block.y, timeScale, 0),
      endTime: quantizeYToTime(block.y + block.height, timeScale, 6),
    });
  }

  const enriched = enrichBlockRecords(rawRecords);
  if (!enriched.length) return [];

  return mergeRecordsIntoRows(
    enriched,
    universityId,
    catalogContext,
    catalogContext.termCode || `catalog-${new Date().getFullYear() - 1}-${new Date().getFullYear()}`,
    catalogContext.termDescription || "Imported visual timetable",
    filePath,
  );
}

async function parseVisualSource(filePath, universityId, catalogContext) {
  if (universityId === "usj" && path.extname(filePath).toLowerCase() === ".pdf") {
    const courses = await parseUsjPdfStructuredCourses(filePath, catalogContext);
    if (courses.length) {
      return {
        terms: catalogContext.termCode
          ? [{
              code: catalogContext.termCode,
              description: catalogContext.termDescription || "Imported USJ timetable",
              is_current: true,
            }]
          : [],
        rows: [],
        courses,
      };
    }
  }

  const pages = await loadVisualPages(filePath);
  const worker = await createWorker("eng");
  const rows = [];

  try {
    for (const page of pages) {
      const canvas = await canvasFromBuffer(page.buffer);
      const pageRows = await parseWeeklyScheduleCanvas(canvas, worker, universityId, filePath, page.pageIndex, catalogContext);
      rows.push(...pageRows);
    }
  } finally {
    await worker.terminate();
  }

  return {
    terms: catalogContext.termCode
      ? [{
          code: catalogContext.termCode,
          description: catalogContext.termDescription || "Imported visual timetable",
          is_current: true,
        }]
      : [],
    rows,
    courses: [],
  };
}

function collectVisualFiles(universityId) {
  const files = [];
  for (const dir of getImportDirectories(universityId)) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!VISUAL_EXTENSIONS.has(extension)) continue;
      if (entry.name.startsWith(GENERATED_PREFIX)) continue;
      files.push(path.join(dir, entry.name));
    }
  }
  files.push(...collectDiscoveryVisualFiles(universityId));
  const uniqueByContent = new Map();
  for (const filePath of [...new Set(files)]) {
    try {
      const hash = crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
      if (!uniqueByContent.has(hash)) uniqueByContent.set(hash, filePath);
    } catch {
      if (!uniqueByContent.has(filePath)) uniqueByContent.set(filePath, filePath);
    }
  }
  return [...uniqueByContent.values()];
}

function getDiscoveryRoots() {
  const roots = [];
  if (process.env.USERPROFILE) {
    roots.push(
      path.join(process.env.USERPROFILE, "Desktop"),
      path.join(process.env.USERPROFILE, "Downloads"),
      path.join(process.env.USERPROFILE, "Pictures", "Screenshots"),
    );
  }
  roots.push("D:\\", "D:\\SRC");
  return roots.filter((root) => fs.existsSync(root));
}

function looksLikeDiscoveryCandidate(universityId, entry) {
  if (!entry?.isFile?.()) return false;
  const extension = path.extname(entry.name).toLowerCase();
  if (!VISUAL_EXTENSIONS.has(extension)) return false;
  if (entry.name.startsWith(GENERATED_PREFIX)) return false;
  if (entry.size < 50 * 1024) return false;
  const patterns = DISCOVERY_FILE_PATTERNS_BY_UNIVERSITY[universityId] || [];
  return patterns.some((pattern) => pattern.test(entry.name));
}

function collectDiscoveryVisualFiles(universityId) {
  if (!DISCOVERY_FILE_PATTERNS_BY_UNIVERSITY[universityId]?.length) return [];

  const matches = [];
  for (const root of getDiscoveryRoots()) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!looksLikeDiscoveryCandidate(universityId, entry)) continue;
      matches.push(path.join(root, entry.name));
    }
  }

  return matches
    .map((filePath) => ({
      filePath,
      mtimeMs: fs.statSync(filePath).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 24)
    .map((entry) => entry.filePath);
}

async function buildVisualTimedImports(targetUniversityId = "") {
  const universityIds = targetUniversityId ? [targetUniversityId] : ["lu", "liu", "aust", "usj", "aub", "lau", "bau", "usek", "ndu"];
  const summary = [];

  for (const universityId of universityIds) {
    const visualFiles = collectVisualFiles(universityId);
    const catalogContext = readExistingCatalogContext(universityId);
    const generatedDir = path.join(__dirname, "..", "data", "manual-timetables", universityId);
    ensureDir(generatedDir);
    const activeGeneratedFiles = new Set();

    for (const filePath of visualFiles) {
      try {
        const parsed = await parseVisualSource(filePath, universityId, catalogContext);
        const generatedPath = buildGeneratedPath(universityId, filePath);
        activeGeneratedFiles.add(generatedPath);
        if (!(parsed.rows?.length || parsed.courses?.length)) {
          if (fs.existsSync(generatedPath)) fs.rmSync(generatedPath, { force: true });
          continue;
        }
        fs.writeFileSync(generatedPath, JSON.stringify({
          terms: parsed.terms,
          rows: parsed.rows || [],
          courses: parsed.courses || [],
          meta: {
            source_file: filePath,
            generated_at: new Date().toISOString(),
          },
        }, null, 2));
        summary.push({
          universityId,
          filePath,
          generatedPath,
          rows: parsed.rows?.length || 0,
          courses: parsed.courses?.length || 0,
        });
      } catch {
        continue;
      }
    }

    for (const entry of fs.readdirSync(generatedDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith(GENERATED_PREFIX) || !entry.name.endsWith(GENERATED_SUFFIX)) continue;
      const fullPath = path.join(generatedDir, entry.name);
      if (!activeGeneratedFiles.has(fullPath)) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }

  return summary;
}

module.exports = {
  buildVisualTimedImports,
  collectVisualFiles,
  parseUsjPdfStructuredCourses,
  readExistingCatalogContext,
  extractPdfPageTextItems,
  buildUsjPdfColumnBands,
  buildUsjPdfRowBands,
  clusterUsjPdfLines,
  extractUsjPdfTitle,
  resolveUsjPdfCourse,
};
