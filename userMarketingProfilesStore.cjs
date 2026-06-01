const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "data", "user-marketing-profiles.json");

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhoneNumber(value) {
  return normalizeText(value).replace(/[^\d+]/g, "");
}

function createEmptyStore() {
  return { profiles: [] };
}

function ensureStore() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(createEmptyStore(), null, 2));
  }
}

function readMarketingProfilesStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return {
      profiles: Array.isArray(parsed?.profiles) ? parsed.profiles : [],
    };
  } catch {
    const fallback = createEmptyStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function writeMarketingProfilesStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function upsertMarketingProfile(input = {}) {
  const store = readMarketingProfilesStore();
  const normalizedUserId = normalizeText(input.userId);
  const normalizedEmail = normalizeEmail(input.email);
  const now = new Date().toISOString();

  if (!normalizedUserId && !normalizedEmail) {
    throw new Error("Missing user identifier.");
  }

  const existing = store.profiles.find((profile) =>
    (normalizedUserId && normalizeText(profile.userId) === normalizedUserId)
    || (normalizedEmail && normalizeEmail(profile.email) === normalizedEmail),
  );

  const nextProfile = {
    userId: normalizedUserId || normalizeText(existing?.userId),
    email: normalizedEmail || normalizeEmail(existing?.email),
    universityId: normalizeText(input.universityId || existing?.universityId).toLowerCase(),
    phoneNumber: normalizePhoneNumber(input.phoneNumber || existing?.phoneNumber),
    updatedAt: now,
    createdAt: normalizeText(existing?.createdAt) || now,
  };

  if (existing) {
    Object.assign(existing, nextProfile);
  } else {
    store.profiles.push(nextProfile);
  }

  writeMarketingProfilesStore(store);
  return nextProfile;
}

function listMarketingProfiles() {
  return readMarketingProfilesStore().profiles
    .slice()
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

module.exports = {
  STORE_PATH,
  listMarketingProfiles,
  readMarketingProfilesStore,
  upsertMarketingProfile,
  writeMarketingProfilesStore,
};
