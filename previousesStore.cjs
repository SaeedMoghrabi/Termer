const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data", "previouses");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const FILES_DIR = path.join(DATA_DIR, "files");
const PREVIEWS_DIR = path.join(DATA_DIR, "previews");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureStore() {
  ensureDir(DATA_DIR);
  ensureDir(FILES_DIR);
  ensureDir(PREVIEWS_DIR);
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({
        documents: [],
        unlocks: [],
        reviewEvents: [],
      }, null, 2),
    );
  }
}

function readStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return {
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      unlocks: Array.isArray(parsed.unlocks) ? parsed.unlocks : [],
      reviewEvents: Array.isArray(parsed.reviewEvents) ? parsed.reviewEvents : [],
    };
  } catch {
    return {
      documents: [],
      unlocks: [],
      reviewEvents: [],
    };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCourseCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, " ");
}

function compactCourseCode(value) {
  return normalizeCourseCode(value).replace(/[^A-Z0-9]+/g, "");
}

function normalizeUserId(value) {
  return normalizeText(value);
}

function normalizeUniversityId(value) {
  return normalizeText(value).toLowerCase();
}

function listPreviousDocuments() {
  return readStore().documents;
}

function getPreviousDocument(previousId) {
  const normalizedId = normalizeText(previousId);
  return readStore().documents.find((document) => normalizeText(document.id) === normalizedId) ?? null;
}

function createPreviousDocument(documentInput) {
  const store = readStore();
  const now = new Date().toISOString();
  const document = {
    id: createId("prev"),
    createdAt: now,
    updatedAt: now,
    reviewedAt: documentInput.reviewedAt ?? null,
    reviewedBy: documentInput.reviewedBy ?? null,
    adminComment: documentInput.adminComment ?? null,
    aiConfidence: Number(documentInput.aiConfidence ?? 0) || 0,
    aiReason: normalizeText(documentInput.aiReason),
    aiLabels: Array.isArray(documentInput.aiLabels) ? documentInput.aiLabels : [],
    extractedTextPreview: normalizeText(documentInput.extractedTextPreview),
    extractedText: normalizeText(documentInput.extractedText),
    status: normalizeText(documentInput.status || "pending") || "pending",
    userId: normalizeUserId(documentInput.userId),
    userEmail: normalizeText(documentInput.userEmail).toLowerCase(),
    universityId: normalizeUniversityId(documentInput.universityId),
    courseCode: normalizeCourseCode(documentInput.courseCode),
    courseTitle: normalizeText(documentInput.courseTitle),
    courseId: normalizeText(documentInput.courseId),
    documentTitle: normalizeText(documentInput.documentTitle),
    documentKind: normalizeText(documentInput.documentKind || "Previous"),
    examTermLabel: normalizeText(documentInput.examTermLabel),
    note: normalizeText(documentInput.note),
    fingerprint: normalizeText(documentInput.fingerprint),
    originalFileName: normalizeText(documentInput.originalFileName),
    fileExtension: normalizeText(documentInput.fileExtension).toLowerCase(),
    filePath: normalizeText(documentInput.filePath),
    fileSizeBytes: Number(documentInput.fileSizeBytes ?? 0) || 0,
    mimeType: normalizeText(documentInput.mimeType),
    previewPath: normalizeText(documentInput.previewPath),
    previewMimeType: normalizeText(documentInput.previewMimeType),
    sourcePages: Number(documentInput.sourcePages ?? 0) || 0,
  };

  store.documents.unshift(document);
  store.reviewEvents.unshift({
    id: createId("review"),
    previousId: document.id,
    actor: "ai",
    actorId: "system",
    createdAt: now,
    status: document.status,
    comment: document.aiReason,
    confidence: document.aiConfidence,
  });
  writeStore(store);
  return document;
}

function updatePreviousDocument(previousId, patch = {}) {
  const store = readStore();
  const normalizedId = normalizeText(previousId);
  const index = store.documents.findIndex((document) => normalizeText(document.id) === normalizedId);
  if (index === -1) return null;

  const current = store.documents[index];
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.documents[index] = next;

  if (patch.status || patch.adminComment || patch.reviewedBy) {
    store.reviewEvents.unshift({
      id: createId("review"),
      previousId: current.id,
      actor: patch.reviewedBy ? "admin" : "system",
      actorId: normalizeText(patch.reviewedBy || "system"),
      createdAt: new Date().toISOString(),
      status: normalizeText(patch.status || current.status),
      comment: normalizeText(patch.adminComment || patch.aiReason || ""),
      confidence: Number(patch.aiConfidence ?? current.aiConfidence ?? 0) || 0,
    });
  }

  writeStore(store);
  return next;
}

function deletePreviousDocument(previousId) {
  const store = readStore();
  const normalizedId = normalizeText(previousId);
  const index = store.documents.findIndex((document) => normalizeText(document.id) === normalizedId);
  if (index === -1) return null;
  const [removed] = store.documents.splice(index, 1);
  writeStore(store);
  return removed;
}

function hasUnlockedPrevious(userId, previousId) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPreviousId = normalizeText(previousId);
  if (!normalizedUserId || !normalizedPreviousId) return false;
  return readStore().unlocks.some((entry) =>
    normalizeUserId(entry.userId) === normalizedUserId
    && normalizeText(entry.previousId) === normalizedPreviousId,
  );
}

function grantPreviousUnlock({ userId, previousId, unlockedBy = "student" }) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPreviousId = normalizeText(previousId);
  if (!normalizedUserId || !normalizedPreviousId) {
    throw new Error("Missing userId or previousId.");
  }

  const store = readStore();
  const alreadyUnlocked = store.unlocks.find((entry) =>
    normalizeUserId(entry.userId) === normalizedUserId
    && normalizeText(entry.previousId) === normalizedPreviousId,
  );

  if (alreadyUnlocked) {
    return alreadyUnlocked;
  }

  const unlock = {
    id: createId("unlock"),
    userId: normalizedUserId,
    previousId: normalizedPreviousId,
    unlockedAt: new Date().toISOString(),
    unlockedBy: normalizeText(unlockedBy) || "student",
  };
  store.unlocks.unshift(unlock);
  writeStore(store);
  return unlock;
}

function getUserPreviousStats(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return {
      approvedUploadCount: 0,
      pendingUploadCount: 0,
      rejectedUploadCount: 0,
      unlockCount: 0,
      unlockCredits: 0,
      ownUploads: [],
      unlockedPreviousIds: [],
    };
  }

  const store = readStore();
  const ownUploads = store.documents.filter((document) => normalizeUserId(document.userId) === normalizedUserId);
  const approvedUploadCount = ownUploads.filter((document) => normalizeText(document.status) === "approved").length;
  const pendingUploadCount = ownUploads.filter((document) => normalizeText(document.status) === "pending").length;
  const rejectedUploadCount = ownUploads.filter((document) => normalizeText(document.status) === "rejected").length;
  const unlockedPreviousIds = store.unlocks
    .filter((entry) => normalizeUserId(entry.userId) === normalizedUserId)
    .map((entry) => normalizeText(entry.previousId));
  const unlockCount = unlockedPreviousIds.length;

  return {
    approvedUploadCount,
    pendingUploadCount,
    rejectedUploadCount,
    unlockCount,
    unlockCredits: Math.max(0, approvedUploadCount - unlockCount),
    ownUploads,
    unlockedPreviousIds,
  };
}

module.exports = {
  DATA_DIR,
  STORE_PATH,
  FILES_DIR,
  PREVIEWS_DIR,
  compactCourseCode,
  createId,
  createPreviousDocument,
  deletePreviousDocument,
  getPreviousDocument,
  getUserPreviousStats,
  grantPreviousUnlock,
  hasUnlockedPrevious,
  listPreviousDocuments,
  normalizeCourseCode,
  updatePreviousDocument,
};
