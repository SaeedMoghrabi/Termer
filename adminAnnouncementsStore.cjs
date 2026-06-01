const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_PATH = path.join(__dirname, "data", "admin-announcements.json");

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeStringList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter(Boolean))];
}

function normalizeCourseCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, " ");
}

function normalizeCourseCodeList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeCourseCode(value))
    .filter(Boolean))];
}

function createEmptyStore() {
  return {
    announcements: [],
    reads: [],
  };
}

function ensureStore() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(createEmptyStore(), null, 2));
  }
}

function readAnnouncementStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return {
      announcements: Array.isArray(parsed?.announcements) ? parsed.announcements : [],
      reads: Array.isArray(parsed?.reads) ? parsed.reads : [],
    };
  } catch {
    const fallback = createEmptyStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function writeAnnouncementStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function listAnnouncements() {
  return readAnnouncementStore().announcements
    .slice()
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

function createAnnouncement(input = {}) {
  const store = readAnnouncementStore();
  const now = new Date().toISOString();
  const announcement = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    createdByUserId: normalizeText(input.createdByUserId),
    createdByEmail: normalizeText(input.createdByEmail),
    title: normalizeText(input.title),
    message: normalizeText(input.message),
    audienceMode: normalizeText(input.audienceMode) || "all",
    universityIds: normalizeStringList(input.universityIds).map((value) => value.toLowerCase()),
    targetUserIds: normalizeStringList(input.targetUserIds),
    targetCourseCodes: normalizeCourseCodeList(input.targetCourseCodes),
    ctaLabel: normalizeText(input.ctaLabel),
    ctaUrl: normalizeText(input.ctaUrl),
    archivedAt: null,
  };

  store.announcements.unshift(announcement);
  writeAnnouncementStore(store);
  return announcement;
}

function archiveAnnouncement(id) {
  const store = readAnnouncementStore();
  const announcement = store.announcements.find((entry) => entry.id === id);
  if (!announcement) return null;
  announcement.archivedAt = announcement.archivedAt || new Date().toISOString();
  announcement.updatedAt = new Date().toISOString();
  writeAnnouncementStore(store);
  return announcement;
}

function markAnnouncementsRead({ userId, announcementIds }) {
  const normalizedUserId = normalizeText(userId);
  const normalizedIds = normalizeStringList(announcementIds);
  if (!normalizedUserId || normalizedIds.length === 0) {
    return { reads: [] };
  }

  const store = readAnnouncementStore();
  const now = new Date().toISOString();

  normalizedIds.forEach((announcementId) => {
    const existing = store.reads.find(
      (entry) => entry.userId === normalizedUserId && entry.announcementId === announcementId,
    );
    if (existing) {
      existing.readAt = existing.readAt || now;
      return;
    }
    store.reads.push({
      userId: normalizedUserId,
      announcementId,
      readAt: now,
    });
  });

  writeAnnouncementStore(store);
  return {
    reads: store.reads.filter((entry) => entry.userId === normalizedUserId),
  };
}

module.exports = {
  STORE_PATH,
  createAnnouncement,
  archiveAnnouncement,
  listAnnouncements,
  markAnnouncementsRead,
  readAnnouncementStore,
  writeAnnouncementStore,
};
