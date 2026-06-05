const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pdfParse = require("pdf-parse");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { FILES_DIR, PREVIEWS_DIR, compactCourseCode } = require("./previousesStore.cjs");

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function compactText(value) {
  return normalizeText(value).toLowerCase();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("The uploaded file payload is not valid.");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function resolveUploadBuffer({ fileDataUrl, fileBuffer, mimeType }) {
  if (Buffer.isBuffer(fileBuffer)) {
    return {
      mimeType: normalizeText(mimeType),
      buffer: fileBuffer,
    };
  }

  return dataUrlToBuffer(fileDataUrl);
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function renderPdfFirstPageToPng(pdfBuffer, outputPath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    verbosity: 0,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.45 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return { pages: pdf.numPages, mimeType: "image/png" };
}

async function copyImagePreview(filePath, outputPath) {
  const image = await loadImage(filePath);
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / Math.max(1, image.width));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return { pages: 1, mimeType: "image/png" };
}

async function buildPreview(filePath, extension, fileBuffer, previousId) {
  ensureDir(PREVIEWS_DIR);
  const previewPath = path.join(PREVIEWS_DIR, `${previousId}.png`);

  try {
    if (extension === ".pdf") {
      const result = await renderPdfFirstPageToPng(fileBuffer, previewPath);
      return { previewPath, previewMimeType: result.mimeType, sourcePages: result.pages };
    }

    const result = await copyImagePreview(filePath, previewPath);
    return { previewPath, previewMimeType: result.mimeType, sourcePages: result.pages };
  } catch (error) {
    return {
      previewPath: "",
      previewMimeType: "",
      sourcePages: 0,
      previewError: error?.message || String(error),
    };
  }
}

async function extractText(filePath, extension, fileBuffer) {
  if (extension !== ".pdf") {
    return "";
  }

  try {
    const parsed = await pdfParse(fileBuffer);
    return normalizeText(parsed?.text || "");
  } catch {
    try {
      const parsed = await pdfParse(fs.readFileSync(filePath));
      return normalizeText(parsed?.text || "");
    } catch {
      return "";
    }
  }
}

function pickTextPreview(text) {
  const normalized = normalizeText(text).replace(/\s+/g, " ");
  return normalized.slice(0, 420);
}

function analyzePreviousDocument({
  fileName,
  courseCode,
  courseTitle,
  documentTitle,
  extractedText,
  previewError,
}) {
  const normalizedFileName = compactText(fileName);
  const normalizedTitle = compactText(documentTitle);
  const normalizedCourseTitle = compactText(courseTitle);
  const normalizedExtracted = compactText(extractedText);
  const courseCompact = compactCourseCode(courseCode);
  const courseTokens = courseCompact
    ? [
        courseCompact,
        courseCompact.replace(/([a-z]+)(\d+)/i, "$1 $2").toLowerCase(),
      ]
    : [];

  const positiveKeywords = [
    "exam",
    "midterm",
    "final",
    "quiz",
    "test",
    "session",
    "colloque",
    "concours",
    "previous",
    "sample exam",
    "past paper",
  ];

  const negativeKeywords = [
    "syllabus",
    "slides",
    "lecture",
    "assignment",
    "project",
    "registration",
    "transcript",
    "schedule",
    "receipt",
    "invoice",
  ];

  let score = 0.25;
  const reasons = [];
  const labels = [];

  const combinedText = [normalizedFileName, normalizedTitle, normalizedCourseTitle, normalizedExtracted].join(" ");
  const hasCourseMatch = courseTokens.some((token) => token && combinedText.includes(token));
  if (hasCourseMatch) {
    score += 0.3;
    reasons.push(`Matched the selected course code (${courseCode}).`);
    labels.push("course-match");
  } else {
    score -= 0.2;
    reasons.push("Could not confidently match the uploaded file to the selected course code.");
    labels.push("course-mismatch");
  }

  const positiveHitCount = positiveKeywords.filter((keyword) => combinedText.includes(keyword)).length;
  if (positiveHitCount > 0) {
    score += Math.min(0.28, positiveHitCount * 0.08);
    reasons.push("Found exam-style wording in the file name or extracted text.");
    labels.push("exam-keywords");
  } else {
    score -= 0.08;
    reasons.push("Did not find strong exam wording such as midterm, final, or quiz.");
  }

  const negativeHitCount = negativeKeywords.filter((keyword) => combinedText.includes(keyword)).length;
  if (negativeHitCount > 0) {
    score -= Math.min(0.38, negativeHitCount * 0.12);
    reasons.push("Detected wording that often points to unrelated materials such as slides or a syllabus.");
    labels.push("unrelated-keywords");
  }

  if (normalizedExtracted.length > 300) {
    score += 0.15;
    reasons.push("Extracted enough text to screen the document reliably.");
    labels.push("rich-text");
  } else if (normalizedExtracted.length === 0) {
    score -= 0.08;
    reasons.push("There was little or no extractable text, so the screening confidence is lower.");
    labels.push("low-text");
  }

  if (previewError) {
    score -= 0.04;
    reasons.push("Preview generation failed, so the file may need manual review.");
    labels.push("preview-failed");
  }

  if (normalizedCourseTitle && normalizedExtracted.includes(normalizedCourseTitle.slice(0, Math.min(16, normalizedCourseTitle.length)))) {
    score += 0.1;
    reasons.push("Matched part of the selected course title inside the document.");
    labels.push("title-match");
  }

  const confidence = Math.max(0, Math.min(0.99, Number(score.toFixed(2))));
  let status = "pending";
  if (confidence >= 0.72 && hasCourseMatch && positiveHitCount > 0 && negativeHitCount === 0) {
    status = "approved";
  } else if (confidence <= 0.22 || (!hasCourseMatch && negativeHitCount > 0)) {
    status = "rejected";
  }

  return {
    status,
    confidence,
    reason: reasons.join(" "),
    labels,
  };
}

function preparePreviousUpload({
  previousId,
  userId,
  userEmail,
  universityId,
  courseCode,
  courseTitle,
  courseId,
  documentTitle,
  documentKind,
  examTermLabel,
  note,
  fileName,
  fileDataUrl,
  fileBuffer,
  mimeType,
}) {
  ensureDir(FILES_DIR);
  const resolvedUpload = resolveUploadBuffer({ fileDataUrl, fileBuffer, mimeType });
  const resolvedMimeType = normalizeText(resolvedUpload.mimeType).split(";")[0].trim().toLowerCase();
  const { buffer } = resolvedUpload;

  if (!ALLOWED_MIME_TYPES.has(resolvedMimeType)) {
    throw new Error("Only PDF, PNG, JPG, JPEG, and WEBP previouses are supported.");
  }

  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("The file must be between 1 byte and 10MB.");
  }

  const extension = path.extname(fileName || "").toLowerCase() || (
    resolvedMimeType === "application/pdf"
      ? ".pdf"
      : resolvedMimeType === "image/png"
        ? ".png"
        : resolvedMimeType === "image/webp"
          ? ".webp"
          : ".jpg"
  );

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("That file type is not supported.");
  }

  const safeBase = slugify(path.basename(fileName || "previous", extension)) || "previous";
  const storedFilePath = path.join(FILES_DIR, `${previousId}-${safeBase}${extension}`);
  fs.writeFileSync(storedFilePath, buffer);
  const fingerprint = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    previousId,
    userId,
    userEmail,
    universityId,
    courseCode,
    courseTitle,
    courseId,
    documentTitle,
    documentKind,
    examTermLabel,
    note,
    originalFileName: fileName,
    fileExtension: extension,
    filePath: storedFilePath,
    fileSizeBytes: buffer.length,
    mimeType: resolvedMimeType,
    fingerprint,
    buffer,
  };
}

async function finalizePreparedUpload(preparedUpload) {
  const extractedTextPromise = extractText(
    preparedUpload.filePath,
    preparedUpload.fileExtension,
    preparedUpload.buffer,
  );
  const previewPromise = buildPreview(
    preparedUpload.filePath,
    preparedUpload.fileExtension,
    preparedUpload.buffer,
    preparedUpload.previousId,
  );
  const [extractedText, preview] = await Promise.all([extractedTextPromise, previewPromise]);
  const moderation = analyzePreviousDocument({
    fileName: preparedUpload.originalFileName,
    courseCode: preparedUpload.courseCode,
    courseTitle: preparedUpload.courseTitle,
    documentTitle: preparedUpload.documentTitle,
    extractedText,
    previewError: preview.previewError,
  });

  return {
    previewPath: preview.previewPath || "",
    previewMimeType: preview.previewMimeType || "",
    sourcePages: preview.sourcePages || 0,
    status: moderation.status,
    aiConfidence: moderation.confidence,
    aiReason: moderation.reason,
    aiLabels: moderation.labels,
    extractedTextPreview: pickTextPreview(extractedText),
    extractedText,
  };
}

async function ingestPreviousUpload(uploadRequest) {
  const preparedUpload = preparePreviousUpload(uploadRequest);
  const finalizedUpload = await finalizePreparedUpload(preparedUpload);

  return {
    userId: preparedUpload.userId,
    userEmail: preparedUpload.userEmail,
    universityId: preparedUpload.universityId,
    courseCode: preparedUpload.courseCode,
    courseTitle: preparedUpload.courseTitle,
    courseId: preparedUpload.courseId,
    documentTitle: preparedUpload.documentTitle,
    documentKind: preparedUpload.documentKind,
    examTermLabel: preparedUpload.examTermLabel,
    note: preparedUpload.note,
    originalFileName: preparedUpload.originalFileName,
    fileExtension: preparedUpload.fileExtension,
    filePath: preparedUpload.filePath,
    fileSizeBytes: preparedUpload.fileSizeBytes,
    mimeType: preparedUpload.mimeType,
    previewPath: finalizedUpload.previewPath,
    previewMimeType: finalizedUpload.previewMimeType,
    sourcePages: finalizedUpload.sourcePages,
    fingerprint: preparedUpload.fingerprint,
    status: finalizedUpload.status,
    aiConfidence: finalizedUpload.aiConfidence,
    aiReason: finalizedUpload.aiReason,
    aiLabels: finalizedUpload.aiLabels,
    extractedTextPreview: finalizedUpload.extractedTextPreview,
    extractedText: finalizedUpload.extractedText,
  };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  analyzePreviousDocument,
  finalizePreparedUpload,
  ingestPreviousUpload,
  preparePreviousUpload,
};
