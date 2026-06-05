import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.ts";
import { API_ROOT as API_URL } from "../config/runtime.ts";
import { detectUniversityFromEmail } from "../config/emailDomains.ts";
import { UNIVERSITY_OPTIONS, getUniversityById, type UniversityId } from "../config/universities.ts";
import { clearLocalAdminSession, getLocalAdminSession } from "../utils/localAdminSession.ts";

type Status = "pending" | "approved" | "rejected";
type DashboardView = "syllabi" | "reviews" | "accounts" | "previouses" | "announcements";
type ReviewKindFilter = "all" | "course" | "professor";
type AnnouncementAudienceMode = "all" | "university" | "courses" | "accounts";
type PreviousModerationFilter = "all" | "pending" | "approved" | "rejected";

const REQUIRED_NAME_REFRESH_AT = Date.parse("2026-05-31T00:00:00.000Z");

interface Syllabus {
  id: string;
  course_code: string;
  file_url: string;
  file_name: string;
  uploaded_by: string;
  created_at: string;
  status: Status;
  admin_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface UserAccount {
  id: string;
  aub_id?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  family_name?: string | null;
  email?: string | null;
  major?: string | null;
  created_at?: string | null;
  clerk_user_id?: string | null;
  is_admin?: boolean | null;
}

interface ProfileRecord {
  id: string;
  display_name?: string | null;
  first_name?: string | null;
  family_name?: string | null;
  university_id?: string | null;
  universityId?: string | null;
  email_domain?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface CourseRating {
  id: string;
  user_id: string;
  department: string;
  course_number: string;
  rating: number;
  difficulty?: number | null;
  review?: string | null;
  created_at: string;
}

interface ProfessorRating {
  id: string;
  user_id: string;
  professor_id: string;
  department?: string | null;
  course_number?: string | null;
  rating: number;
  review?: string | null;
  created_at: string;
}

interface SavedSchedule {
  id: string;
  user_id: string;
  slot?: number | null;
  courses?: unknown;
  updated_at?: string | null;
  colors?: Record<string, string> | null;
  term_id?: string | null;
  university_id?: string | null;
}

interface FavoriteCourse {
  id: string;
  user_id: string;
  course_id?: string | null;
  course?: unknown;
  created_at?: string | null;
}

interface AdminReviewEntry {
  id: string;
  kind: "course" | "professor";
  userId: string;
  createdAt: string;
  rating: number;
  difficulty?: number | null;
  review: string;
  title: string;
  subtitle: string;
}

interface AccountSummary {
  userId: string;
  profile: UserAccount | null;
  profileRecord: ProfileRecord | null;
  schedules: SavedSchedule[];
  favorites: FavoriteCourse[];
  courseReviews: CourseRating[];
  professorReviews: ProfessorRating[];
  uniquePlannedCourses: string[];
}

interface PlannedCourseSnapshot {
  code: string;
  title: string;
  section: string;
  instructor: string;
  campus: string;
  credits: string;
}

interface AdminAnnouncement {
  id: string;
  createdAt: string;
  createdByEmail?: string;
  title: string;
  message: string;
  audienceMode: AnnouncementAudienceMode;
  audienceSummary?: string;
  universityIds?: string[];
  targetUserIds?: string[];
  targetCourseCodes?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  archivedAt?: string | null;
  recipientCount?: number;
  readCount?: number;
  unreadCount?: number;
}

interface MarketingContactProfile {
  userId?: string;
  email?: string;
  universityId?: string;
  phoneNumber?: string;
  updatedAt?: string;
}

interface AdminPreviousDocument {
  id: string;
  universityId: string;
  courseCode: string;
  courseTitle?: string;
  courseId?: string;
  userId?: string;
  userEmail?: string;
  documentTitle?: string;
  documentKind?: string;
  examTermLabel?: string;
  note?: string;
  originalFileName?: string;
  status: Status;
  aiConfidence?: number;
  aiReason?: string;
  aiLabels?: string[];
  extractedTextPreview?: string;
  previewUrl?: string;
  fileUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminComment?: string | null;
  sourcePages?: number;
}

interface AdminPreviousStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

const STATUS_COLOR: Record<Status, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
};

const STATUS_BG: Record<Status, string> = {
  pending: "rgba(245,158,11,0.12)",
  approved: "rgba(34,197,94,0.12)",
  rejected: "rgba(239,68,68,0.12)",
};

const KNOWN_UNIVERSITY_IDS = new Set<string>(UNIVERSITY_OPTIONS.map((university) => university.id));

function formatDate(value?: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortId(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Unknown account";
  if (normalized.length <= 10) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSearchBlob(...parts: unknown[]) {
  return parts
    .map((part) => normalizeText(part).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function normalizeCourseCode(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, " ");
}

function splitDisplayName(value: unknown) {
  const normalized = normalizeText(value).replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "", familyName: "" };
  }

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], familyName: "" };
  }

  return {
    firstName: parts[0],
    familyName: parts.slice(1).join(" "),
  };
}

function compactCourseCode(value: unknown) {
  return normalizeCourseCode(value).replace(/[^A-Z0-9]+/g, "");
}

function parseDelimitedList(value: string) {
  return [...new Set(
    value
      .split(/[\n,;]+/)
      .map((entry) => normalizeText(entry))
      .filter(Boolean),
  )];
}

function parseMaybeJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getCoursePillsFromSchedule(schedule: SavedSchedule) {
  const courses = parseMaybeJsonArray(schedule.courses);
  const labels = courses
    .map((course) => {
      const code = normalizeText((course as { code?: string })?.code);
      const section = normalizeText((course as { section?: string })?.section);
      if (!code) return "";
      return section ? `${code} ${section}` : code;
    })
    .filter(Boolean);
  return [...new Set(labels)];
}

function getCourseSnapshotsFromSchedule(schedule: SavedSchedule): PlannedCourseSnapshot[] {
  return parseMaybeJsonArray(schedule.courses)
    .map((course) => {
      const raw = course as {
        code?: string;
        title?: string;
        section?: string;
        instructor?: string;
        campus?: string;
        credits?: string | number;
      };
      const code = normalizeText(raw.code);
      if (!code) return null;
      return {
        code,
        title: normalizeText(raw.title),
        section: normalizeText(raw.section),
        instructor: normalizeText(raw.instructor),
        campus: normalizeText(raw.campus),
        credits: normalizeText(raw.credits),
      } satisfies PlannedCourseSnapshot;
    })
    .filter((course): course is PlannedCourseSnapshot => course !== null);
}

function getFavoriteCourseLabel(favorite: FavoriteCourse) {
  const course = favorite.course as
    | { code?: string; title?: string; section?: string }
    | undefined;
  const code = normalizeText(course?.code || favorite.course_id);
  const section = normalizeText(course?.section);
  if (!code) return "";
  return section ? `${code} ${section}` : code;
}

function getScheduleUniversity(schedule: SavedSchedule) {
  const direct = normalizeText(schedule.university_id);
  if (direct) return direct.toUpperCase();
  const firstCourse = parseMaybeJsonArray(schedule.courses)[0] as
    | { university_id?: string; universityId?: string }
    | undefined;
  const nested = normalizeText(firstCourse?.university_id || firstCourse?.universityId);
  return nested ? nested.toUpperCase() : "Unknown school";
}

function normalizeUniversityId(value: unknown): UniversityId | "" {
  const normalized = normalizeText(value).toLowerCase();
  return KNOWN_UNIVERSITY_IDS.has(normalized) ? (normalized as UniversityId) : "";
}

function getUniversityShortLabel(universityId: string) {
  const normalized = normalizeUniversityId(universityId);
  return normalized ? getUniversityById(normalized).shortName : "Unknown school";
}

function inferUniversityIdFromEmail(email: unknown) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  if (!normalizedEmail) return "";
  const detection = detectUniversityFromEmail(normalizedEmail);
  return detection.allowed && detection.universityId ? detection.universityId : "";
}

function getContactProfileForAccount(account: AccountSummary, contactProfiles: MarketingContactProfile[]) {
  const normalizedEmail = normalizeText(account.profile?.email).toLowerCase();
  const byUserId = contactProfiles.find((profile) => normalizeText(profile.userId) === account.userId);
  if (byUserId) return byUserId;
  return contactProfiles.find((profile) => normalizeText(profile.email).toLowerCase() === normalizedEmail) ?? null;
}

function getAccountPhoneNumber(account: AccountSummary, contactProfiles: MarketingContactProfile[]) {
  const profile = getContactProfileForAccount(account, contactProfiles);
  return normalizeText(profile?.phoneNumber);
}

function getAccountPhoneLabel(account: AccountSummary, contactProfiles: MarketingContactProfile[]) {
  return getAccountPhoneNumber(account, contactProfiles) || "Phone not saved";
}

function getAccountUniversityId(account: AccountSummary, contactProfiles: MarketingContactProfile[]) {
  const contactProfile = getContactProfileForAccount(account, contactProfiles);
  const emailDetectedUniversityId = inferUniversityIdFromEmail(
    account.profile?.email || contactProfile?.email,
  );
  if (emailDetectedUniversityId) return emailDetectedUniversityId;
  const profileUniversityId = normalizeUniversityId(
    (account.profile as { university_id?: string | null; universityId?: string | null } | null)?.university_id
    || (account.profile as { university_id?: string | null; universityId?: string | null } | null)?.universityId,
  );
  if (profileUniversityId) return profileUniversityId;
  const contactProfileUniversityId = normalizeUniversityId(contactProfile?.universityId);
  if (contactProfileUniversityId) return contactProfileUniversityId;
  const direct = normalizeUniversityId(account.schedules[0]?.university_id);
  if (direct) return direct;
  for (const schedule of account.schedules) {
    const firstCourse = parseMaybeJsonArray(schedule.courses)[0] as
      | { university_id?: string; universityId?: string }
      | undefined;
    const nested = normalizeUniversityId(firstCourse?.university_id || firstCourse?.universityId);
    if (nested) return nested;
  }
  return inferUniversityIdFromEmail(account.profile?.email || contactProfile?.email);
}

function getAccountCourseCodes(account: AccountSummary) {
  return [
    ...new Set(
      account.schedules
        .flatMap((schedule) => getCourseSnapshotsFromSchedule(schedule))
        .map((course) => normalizeCourseCode(course.code))
        .filter(Boolean),
    ),
  ];
}

function getAccountCourseSearchEntries(account: AccountSummary) {
  const seen = new Set<string>();
  return account.schedules
    .flatMap((schedule) => getCourseSnapshotsFromSchedule(schedule))
    .map((course) => {
      const code = normalizeCourseCode(course.code);
      if (!code || seen.has(code)) return null;
      seen.add(code);
      const title = normalizeText(course.title);
      return {
        code,
        title,
        label: title ? `${code} — ${title}` : code,
        searchBlob: normalizeSearchBlob(code, compactCourseCode(code), title),
      };
    })
    .filter((entry): entry is { code: string; title: string; label: string; searchBlob: string } => Boolean(entry));
}

function getMatchedAccountCourses(account: AccountSummary, search: string) {
  const normalizedSearch = normalizeSearchBlob(search);
  const compactSearch = compactCourseCode(search);
  if (!normalizedSearch && !compactSearch) return [];

  return getAccountCourseSearchEntries(account)
    .filter((entry) =>
      entry.searchBlob.includes(normalizedSearch)
      || (compactSearch && compactCourseCode(entry.code).includes(compactSearch)),
    )
    .map((entry) => entry.label);
}

function escapeCsvCell(value: unknown) {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  return normalized;
}

function slugifyFilePart(value: string) {
  const normalized = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "course";
}

function humanizeTermId(termId?: string | null) {
  const raw = normalizeText(termId);
  if (!raw) return "Unknown term";
  const withoutPrefix = raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
  return withoutPrefix
    .replace(/^portal-/, "")
    .replace(/^catalog-/, "")
    .replace(/^public-/, "")
    .replace(/-/g, " ");
}

function hasFreshRequiredNameRecord(profileRecord: ProfileRecord | null) {
  const updatedAtMs = Date.parse(normalizeText(profileRecord?.updated_at));
  return !Number.isNaN(updatedAtMs) && updatedAtMs >= REQUIRED_NAME_REFRESH_AT;
}

function getAccountNameParts(user: UserAccount | null, profileRecord: ProfileRecord | null) {
  if (!hasFreshRequiredNameRecord(profileRecord)) {
    return {
      firstName: "",
      familyName: "",
      fullName: "",
    };
  }

  const directFirstName = normalizeText(profileRecord?.first_name || user?.first_name);
  const directFamilyName = normalizeText(profileRecord?.family_name || user?.family_name);
  const fullName = normalizeText(user?.full_name);
  const displayName = normalizeText(profileRecord?.display_name);
  const fallback = splitDisplayName(fullName || displayName);
  const firstName = directFirstName || fallback.firstName;
  const familyName = directFamilyName || fallback.familyName;
  const mergedFullName = [firstName, familyName].filter(Boolean).join(" ").trim();

  return {
    firstName,
    familyName,
    fullName: mergedFullName || fullName || displayName,
  };
}

function getAccountDisplayName(user: UserAccount | null, profileRecord: ProfileRecord | null, userId: string) {
  const fullName = normalizeText(getAccountNameParts(user, profileRecord).fullName);
  const email = normalizeText(user?.email);
  if (fullName) return fullName;
  if (email) return email;
  return shortId(userId);
}

function StatCard({
  label,
  value,
  emoji,
}: {
  label: string;
  value: number | string;
  emoji: string;
}) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px",
      }}
    >
      <div style={{ fontSize: 22, marginBottom: 8 }}>{emoji}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--panel)" : "var(--panel2)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--text)" : "var(--muted)",
        padding: "8px 12px",
        borderRadius: 10,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function withTimeoutFallback<T>(promise: Promise<T>, fallback: T, timeoutMs: number) {
  return new Promise<T>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function safeSupabaseQuery<T>(
  promiseLike: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  label: string,
  timeoutMs = 10000,
) {
  return withTimeoutFallback(
    Promise.resolve(promiseLike).then((result) => ({
      ...result,
      __loadIssue: result.error ? label : "",
    })),
    {
      data: null,
      error: { message: `${label} timed out.` },
      __loadIssue: label,
    },
    timeoutMs,
  );
}

function safeAdminFetch(
  url: string,
  label: string,
  timeoutMs = 8000,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    cache: "no-store",
    signal: controller.signal,
  })
    .then((response) => response.json().catch(() => ({})))
    .then((payload) => ({
      ...(payload && typeof payload === "object" ? payload : {}),
      __loadIssue: "",
    }))
    .catch(() => ({
      __loadIssue: label,
    }))
    .finally(() => window.clearTimeout(timeoutId));
}

export default function AdminPortal() {
  const navigate = useNavigate();
  const [view, setView] = useState<DashboardView>("syllabi");
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [courseRatings, setCourseRatings] = useState<CourseRating[]>([]);
  const [professorRatings, setProfessorRatings] = useState<ProfessorRating[]>([]);
  const [schedules, setSchedules] = useState<SavedSchedule[]>([]);
  const [favorites, setFavorites] = useState<FavoriteCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | "all">("pending");
  const [reviewFilter, setReviewFilter] = useState<ReviewKindFilter>("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [courseLeadSearch, setCourseLeadSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminUserId, setAdminUserId] = useState("");
  const [usingLocalAdminSession, setUsingLocalAdminSession] = useState(false);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [contactProfiles, setContactProfiles] = useState<MarketingContactProfile[]>([]);
  const [previousDocuments, setPreviousDocuments] = useState<AdminPreviousDocument[]>([]);
  const [previousStats, setPreviousStats] = useState<AdminPreviousStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [previousFilter, setPreviousFilter] = useState<PreviousModerationFilter>("pending");
  const [previousSearch, setPreviousSearch] = useState("");
  const [previousReviewComments, setPreviousReviewComments] = useState<Record<string, string>>({});
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementAudienceMode, setAnnouncementAudienceMode] = useState<AnnouncementAudienceMode>("accounts");
  const [announcementUniversityId, setAnnouncementUniversityId] = useState("");
  const [announcementCourseCodes, setAnnouncementCourseCodes] = useState("");
  const [announcementTargetUserIds, setAnnouncementTargetUserIds] = useState<string[]>([]);
  const [announcementCtaLabel, setAnnouncementCtaLabel] = useState("");
  const [announcementCtaUrl, setAnnouncementCtaUrl] = useState("");

  const [reviewing, setReviewing] = useState<Syllabus | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [exportingCourseLeads, setExportingCourseLeads] = useState(false);
  const [reviewingPreviousId, setReviewingPreviousId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadDashboard = async (requesterUserId = adminUserId) => {
    setLoading(true);
    try {
      const [
        syllabiResponse,
        usersResponse,
        profilesResponse,
        courseRatingsResponse,
        professorRatingsResponse,
        schedulesResponse,
        favoritesResponse,
        announcementsResponse,
        contactProfilesResponse,
        previousesResponse,
      ] = await Promise.all([
        safeSupabaseQuery(
          supabase.from("syllabi").select("*").order("created_at", { ascending: false }),
          "Syllabi",
        ),
        safeSupabaseQuery(
          supabase.from("users").select("*").order("created_at", { ascending: false }),
          "Accounts",
        ),
        safeSupabaseQuery(
          supabase.from("profiles").select("*").order("updated_at", { ascending: false }),
          "Profiles",
        ),
        safeSupabaseQuery(
          supabase.from("course_ratings").select("*").order("created_at", { ascending: false }),
          "Course reviews",
        ),
        safeSupabaseQuery(
          supabase.from("professor_ratings").select("*").order("created_at", { ascending: false }),
          "Professor reviews",
        ),
        safeSupabaseQuery(
          supabase.from("schedules").select("*").order("updated_at", { ascending: false }),
          "Schedules",
        ),
        safeSupabaseQuery(
          supabase.from("favorites").select("*").order("created_at", { ascending: false }),
          "Favorites",
        ),
        requesterUserId
          ? safeAdminFetch(
              `${API_URL}/api/admin/announcements?requesterUserId=${encodeURIComponent(requesterUserId)}`,
              "Updates feed",
            )
          : Promise.resolve({ __loadIssue: "" }),
        requesterUserId
          ? safeAdminFetch(
              `${API_URL}/api/admin/contact-profiles?requesterUserId=${encodeURIComponent(requesterUserId)}`,
              "Contact profiles",
            )
          : Promise.resolve({ __loadIssue: "" }),
        requesterUserId
          ? safeAdminFetch(
              `${API_URL}/api/admin/previouses?requesterUserId=${encodeURIComponent(requesterUserId)}`,
              "Previouses queue",
            )
          : Promise.resolve({ __loadIssue: "" }),
      ]);

      const loadIssues = [
        syllabiResponse.__loadIssue,
        usersResponse.__loadIssue,
        profilesResponse.__loadIssue,
        courseRatingsResponse.__loadIssue,
        professorRatingsResponse.__loadIssue,
        schedulesResponse.__loadIssue,
        favoritesResponse.__loadIssue,
        announcementsResponse.__loadIssue,
        contactProfilesResponse.__loadIssue,
        previousesResponse.__loadIssue,
      ].filter(Boolean);

      if (loadIssues.length > 0) {
        showToast(
          `Some admin data took too long to load: ${loadIssues.slice(0, 3).join(", ")}${loadIssues.length > 3 ? "..." : ""}`,
          false,
        );
      }

      setSyllabi((syllabiResponse.data ?? []) as Syllabus[]);
      setUsers((usersResponse.data ?? []) as UserAccount[]);
      setProfiles((profilesResponse.data ?? []) as ProfileRecord[]);
      setCourseRatings((courseRatingsResponse.data ?? []) as CourseRating[]);
      setProfessorRatings((professorRatingsResponse.data ?? []) as ProfessorRating[]);
      setSchedules((schedulesResponse.data ?? []) as SavedSchedule[]);
      setFavorites((favoritesResponse.data ?? []) as FavoriteCourse[]);
      setAnnouncements(Array.isArray(announcementsResponse?.announcements) ? announcementsResponse.announcements : []);
      setContactProfiles(Array.isArray(contactProfilesResponse?.profiles) ? contactProfilesResponse.profiles : []);
      setPreviousDocuments(Array.isArray(previousesResponse?.documents) ? previousesResponse.documents : []);
      setPreviousStats({
        total: Number(previousesResponse?.stats?.total ?? 0) || 0,
        pending: Number(previousesResponse?.stats?.pending ?? 0) || 0,
        approved: Number(previousesResponse?.stats?.approved ?? 0) || 0,
        rejected: Number(previousesResponse?.stats?.rejected ?? 0) || 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const localAdminSession = getLocalAdminSession();
    if (localAdminSession) {
      if (!active) return;
      setUsingLocalAdminSession(true);
      setAdminEmail(localAdminSession.username);
      setAdminUserId("local-admin");
      void loadDashboard("local-admin");
      return () => {
        active = false;
      };
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUsingLocalAdminSession(false);
      setAdminEmail(data.user?.email ?? "");
      setAdminUserId(data.user?.id ?? "");
      void loadDashboard(data.user?.id ?? "");
    });
    return () => {
      active = false;
    };
  }, []);

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (!reviewing) return;
    if (decision === "rejected" && !comment.trim()) {
      showToast("Please add a reason for rejection.", false);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("syllabi")
      .update({
        status: decision,
        admin_comment: comment.trim() || null,
        reviewed_by: adminEmail,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reviewing.id);

    if (error) {
      showToast("Something went wrong. Try again.", false);
    } else {
      showToast(
        decision === "approved" ? "Syllabus approved." : "Syllabus rejected.",
        decision === "approved",
      );
      setReviewing(null);
      setComment("");
      await loadDashboard();
    }
    setSubmitting(false);
  };

  const userMap = useMemo(() => {
    const map = new Map<string, UserAccount>();
    users.forEach((user) => {
      if (user.id) map.set(String(user.id), user);
    });
    return map;
  }, [users]);

  const profileMap = useMemo(() => {
    const map = new Map<string, ProfileRecord>();
    profiles.forEach((profile) => {
      if (profile.id) map.set(String(profile.id), profile);
    });
    return map;
  }, [profiles]);

  const filteredSyllabi = useMemo(
    () => (filter === "all" ? syllabi : syllabi.filter((item) => item.status === filter)),
    [filter, syllabi],
  );

  const syllabusCounts = useMemo(
    () => ({
      all: syllabi.length,
      pending: syllabi.filter((item) => item.status === "pending").length,
      approved: syllabi.filter((item) => item.status === "approved").length,
      rejected: syllabi.filter((item) => item.status === "rejected").length,
    }),
    [syllabi],
  );

  const reviewEntries = useMemo<AdminReviewEntry[]>(() => {
    const courseEntries = courseRatings.map((review) => ({
      id: `course-${review.id}`,
      kind: "course" as const,
      userId: review.user_id,
      createdAt: review.created_at,
      rating: Number(review.rating || 0),
      difficulty: review.difficulty ?? null,
      review: normalizeText(review.review) || "No written review.",
      title: `${normalizeText(review.department)} ${normalizeText(review.course_number)}`.trim(),
      subtitle: "Course review",
    }));

    const professorEntries = professorRatings.map((review) => ({
      id: `professor-${review.id}`,
      kind: "professor" as const,
      userId: review.user_id,
      createdAt: review.created_at,
      rating: Number(review.rating || 0),
      difficulty: null,
      review: normalizeText(review.review) || "No written review.",
      title: normalizeText(review.professor_id) || "Unknown professor",
      subtitle: [
        "Professor review",
        normalizeText(review.department),
        normalizeText(review.course_number),
      ]
        .filter(Boolean)
        .join(" · "),
    }));

    return [...courseEntries, ...professorEntries].sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
  }, [courseRatings, professorRatings]);

  const filteredReviews = useMemo(() => {
    const normalizedSearch = reviewSearch.trim().toLowerCase();
    return reviewEntries.filter((entry) => {
      if (reviewFilter !== "all" && entry.kind !== reviewFilter) return false;
      if (!normalizedSearch) return true;
      const user = userMap.get(entry.userId);
      const blob = normalizeSearchBlob(
        entry.title,
        entry.subtitle,
        entry.review,
        user?.email,
        getAccountNameParts(user ?? null, profileMap.get(entry.userId) ?? null).fullName,
        user?.major,
        entry.userId,
      );
      return blob.includes(normalizedSearch);
    });
  }, [profileMap, reviewEntries, reviewFilter, reviewSearch, userMap]);

  const accountSummaries = useMemo<AccountSummary[]>(() => {
    const ids = new Set<string>();
    users.forEach((user) => ids.add(String(user.id)));
    schedules.forEach((schedule) => ids.add(String(schedule.user_id)));
    favorites.forEach((favorite) => ids.add(String(favorite.user_id)));
    courseRatings.forEach((review) => ids.add(String(review.user_id)));
    professorRatings.forEach((review) => ids.add(String(review.user_id)));

    const summaries = [...ids]
      .filter(Boolean)
      .map((userId) => {
        const userSchedules = schedules
          .filter((schedule) => String(schedule.user_id) === userId)
          .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
        const userFavorites = favorites.filter((favorite) => String(favorite.user_id) === userId);
        const userCourseReviews = courseRatings.filter((review) => String(review.user_id) === userId);
        const userProfessorReviews = professorRatings.filter(
          (review) => String(review.user_id) === userId,
        );
        const uniquePlannedCourses = [
          ...new Set(userSchedules.flatMap((schedule) => getCoursePillsFromSchedule(schedule))),
        ];

        return {
          userId,
          profile: userMap.get(userId) ?? null,
          profileRecord: profileMap.get(userId) ?? null,
          schedules: userSchedules,
          favorites: userFavorites,
          courseReviews: userCourseReviews,
          professorReviews: userProfessorReviews,
          uniquePlannedCourses,
        };
      })
      .sort((a, b) => {
        const aAdmin = a.profile?.is_admin ? 1 : 0;
        const bAdmin = b.profile?.is_admin ? 1 : 0;
        if (aAdmin !== bAdmin) return bAdmin - aAdmin;
        return String(b.profile?.created_at || "").localeCompare(String(a.profile?.created_at || ""));
      });

    return summaries;
  }, [courseRatings, favorites, professorRatings, profileMap, schedules, userMap, users]);

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = accountSearch.trim().toLowerCase();
    if (!normalizedSearch) return accountSummaries;
    return accountSummaries.filter((account) => {
      const universityLabel = getUniversityShortLabel(getAccountUniversityId(account, contactProfiles));
      const blob = normalizeSearchBlob(
        account.userId,
        getAccountNameParts(account.profile, account.profileRecord).fullName,
        account.profile?.email,
        account.profile?.major,
        universityLabel,
        ...account.uniquePlannedCourses,
        ...account.favorites.map(getFavoriteCourseLabel),
      );
      return blob.includes(normalizedSearch);
    });
  }, [accountSearch, accountSummaries, contactProfiles]);

  const selectedAccount = useMemo(
    () => filteredAccounts.find((account) => account.userId === selectedAccountId)
      ?? accountSummaries.find((account) => account.userId === selectedAccountId)
      ?? null,
    [accountSummaries, filteredAccounts, selectedAccountId],
  );

  const courseLeadMatches = useMemo(() => {
    const normalizedSearch = normalizeText(courseLeadSearch);
    if (!normalizedSearch) return [];

    return accountSummaries
      .map((account) => {
        const matchedCourses = getMatchedAccountCourses(account, normalizedSearch);
        if (matchedCourses.length === 0) return null;

        const nameParts = getAccountNameParts(account.profile, account.profileRecord);
        const phoneNumber = getAccountPhoneNumber(account, contactProfiles);
        return {
          account,
          matchedCourses,
          nameParts,
          phoneNumber,
          schoolLabel: getUniversityShortLabel(getAccountUniversityId(account, contactProfiles)),
        };
      })
      .filter((entry): entry is {
        account: AccountSummary;
        matchedCourses: string[];
        nameParts: ReturnType<typeof getAccountNameParts>;
        phoneNumber: string;
        schoolLabel: string;
      } => Boolean(entry))
      .sort((left, right) => {
        const phoneDelta = Number(Boolean(right.phoneNumber)) - Number(Boolean(left.phoneNumber));
        if (phoneDelta !== 0) return phoneDelta;
        return left.account.userId.localeCompare(right.account.userId);
      });
  }, [accountSummaries, contactProfiles, courseLeadSearch]);

  const exportableCourseLeads = useMemo(
    () => courseLeadMatches.filter((entry) => normalizeText(entry.phoneNumber)),
    [courseLeadMatches],
  );

  const selectedAccountUniversityLabel = useMemo(
    () => selectedAccount
      ? getUniversityShortLabel(getAccountUniversityId(selectedAccount, contactProfiles))
      : "Unknown school",
    [contactProfiles, selectedAccount],
  );

  const discoveredUniversityIds = useMemo(
    () => [
      ...new Set(
        accountSummaries
          .map((account) => getAccountUniversityId(account, contactProfiles))
          .filter(Boolean),
      ),
    ].sort((left, right) => getUniversityShortLabel(left).localeCompare(getUniversityShortLabel(right))),
    [accountSummaries, contactProfiles],
  );

  const announcementTargetCourseList = useMemo(
    () => parseDelimitedList(announcementCourseCodes).map((code) => normalizeCourseCode(code)),
    [announcementCourseCodes],
  );

  const announcementPreviewAccounts = useMemo(() => {
    return accountSummaries.filter((account) => {
      const accountUniversityId = getAccountUniversityId(account, contactProfiles);
      const accountCourseCompacts = new Set(getAccountCourseCodes(account).map((code) => compactCourseCode(code)));

      if (announcementAudienceMode === "accounts") {
        return announcementTargetUserIds.includes(account.userId);
      }

      if (announcementAudienceMode === "university") {
        return announcementUniversityId
          ? accountUniversityId === announcementUniversityId.toLowerCase()
          : true;
      }

      if (announcementAudienceMode === "courses") {
        if (announcementUniversityId && accountUniversityId !== announcementUniversityId.toLowerCase()) {
          return false;
        }
        if (announcementTargetCourseList.length === 0) return false;
        return announcementTargetCourseList.some((code) => accountCourseCompacts.has(compactCourseCode(code)));
      }

      return true;
    });
  }, [
    accountSummaries,
    announcementAudienceMode,
    announcementTargetCourseList,
    announcementTargetUserIds,
    announcementUniversityId,
    contactProfiles,
  ]);

  const filteredPreviousDocuments = useMemo(() => {
    const normalizedSearch = previousSearch.trim().toLowerCase();
    return previousDocuments.filter((document) => {
      if (previousFilter !== "all" && document.status !== previousFilter) return false;
      if (!normalizedSearch) return true;
      const uploaderAccount = accountSummaries.find((entry) => entry.userId === normalizeText(document.userId));
      const blob = normalizeSearchBlob(
        document.courseCode,
        document.courseTitle,
        document.documentTitle,
        document.documentKind,
        document.examTermLabel,
        document.userEmail,
        uploaderAccount?.profile?.full_name,
        uploaderAccount?.profile?.email,
        getUniversityShortLabel(document.universityId),
        ...(Array.isArray(document.aiLabels) ? document.aiLabels : []),
        document.aiReason,
        document.extractedTextPreview,
      );
      return blob.includes(normalizedSearch);
    });
  }, [accountSummaries, previousDocuments, previousFilter, previousSearch]);

  const resetAnnouncementDraft = () => {
    setAnnouncementTitle("");
    setAnnouncementMessage("");
    setAnnouncementAudienceMode("accounts");
    setAnnouncementUniversityId("");
    setAnnouncementCourseCodes("");
    setAnnouncementTargetUserIds([]);
    setAnnouncementCtaLabel("");
    setAnnouncementCtaUrl("");
  };

  const prepareAnnouncementForAccount = (account: AccountSummary) => {
    setView("announcements");
    setAnnouncementAudienceMode("accounts");
    setAnnouncementTargetUserIds([account.userId]);
    setAnnouncementUniversityId(getAccountUniversityId(account, contactProfiles));
    setAnnouncementCourseCodes("");
  };

  const useFilteredAccountsAsTargets = () => {
    setAnnouncementAudienceMode("accounts");
    setAnnouncementTargetUserIds(filteredAccounts.map((account) => account.userId));
  };

  const exportCourseLeadsCsv = () => {
    const normalizedSearch = normalizeText(courseLeadSearch);
    if (!normalizedSearch) {
      showToast("Search for a course first.", false);
      return;
    }
    if (exportableCourseLeads.length === 0) {
      showToast("No matching leads with saved phone numbers were found for that course.", false);
      return;
    }

    setExportingCourseLeads(true);
    try {
      const headers = [
        "Name",
        "Given Name",
        "Family Name",
        "Course",
        "Phone Number",
        "Phone 1 - Type",
        "Phone 1 - Value",
        "Notes",
        "Group Membership",
      ];

      const rows = exportableCourseLeads.map((entry) => {
        const firstName = normalizeText(entry.nameParts.firstName);
        const familyName = normalizeText(entry.nameParts.familyName);
        const fullName = normalizeText(entry.nameParts.fullName)
          || [firstName, familyName].filter(Boolean).join(" ")
          || getAccountDisplayName(entry.account.profile, entry.account.profileRecord, entry.account.userId);
        const matchedCourses = entry.matchedCourses.join(" | ");
        return [
          fullName,
          firstName,
          familyName,
          matchedCourses,
          entry.phoneNumber,
          "Mobile",
          entry.phoneNumber,
          `Course: ${matchedCourses} | School: ${entry.schoolLabel} | Exported from Termer admin.`,
          "* My Contacts",
        ];
      });

      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((row) => row.map(escapeCsvCell).join(",")),
      ].join("\n");

      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `termer-course-leads-${slugifyFilePart(normalizedSearch)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showToast(`Exported ${exportableCourseLeads.length} lead${exportableCourseLeads.length === 1 ? "" : "s"} for Google Contacts.`, true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not export the leads CSV.", false);
    } finally {
      setExportingCourseLeads(false);
    }
  };

  const handlePreviousReviewCommentChange = (previousId: string, value: string) => {
    setPreviousReviewComments((current) => ({
      ...current,
      [previousId]: value,
    }));
  };

  const handlePreviousReview = async (previousId: string, status: Status) => {
    if (!adminUserId) {
      showToast("Admin session is missing. Refresh and try again.", false);
      return;
    }

    setReviewingPreviousId(previousId);
    try {
      const response = await fetch(`${API_URL}/api/admin/previouses/${encodeURIComponent(previousId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterUserId: adminUserId,
          requesterEmail: adminEmail,
          status,
          adminComment: normalizeText(previousReviewComments[previousId]),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Could not update that previous.");
      }

      setPreviousReviewComments((current) => ({
        ...current,
        [previousId]: normalizeText(previousReviewComments[previousId]),
      }));
      showToast(
        status === "approved"
          ? "Previous approved."
          : status === "rejected"
            ? "Previous rejected."
            : "Previous moved back to pending review.",
        status !== "rejected",
      );
      await loadDashboard(adminUserId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not review that previous.", false);
    } finally {
      setReviewingPreviousId(null);
    }
  };

  const handleSendAnnouncement = async () => {
    const title = normalizeText(announcementTitle);
    const message = normalizeText(announcementMessage);
    if (!adminUserId) {
      showToast("Admin session is missing. Refresh and try again.", false);
      return;
    }
    if (!title || !message) {
      showToast("Add a title and message first.", false);
      return;
    }
    if (announcementAudienceMode === "accounts" && announcementTargetUserIds.length === 0) {
      showToast("Choose at least one account to target.", false);
      return;
    }
    if (announcementAudienceMode === "courses" && announcementTargetCourseList.length === 0) {
      showToast("Add at least one course code to target.", false);
      return;
    }

    setSendingAnnouncement(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterUserId: adminUserId,
          createdByEmail: adminEmail,
          title,
          message,
          audienceMode: announcementAudienceMode,
          universityIds:
            announcementAudienceMode === "all" || !announcementUniversityId
              ? []
              : [announcementUniversityId],
          targetUserIds: announcementPreviewAccounts.map((account) => account.userId),
          targetCourseCodes: announcementAudienceMode === "courses" ? announcementTargetCourseList : [],
          ctaLabel: normalizeText(announcementCtaLabel),
          ctaUrl: normalizeText(announcementCtaUrl),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Could not send the announcement.");
      }
      showToast("Announcement sent.", true);
      resetAnnouncementDraft();
      await loadDashboard(adminUserId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not send the announcement.", false);
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const handleArchiveAnnouncement = async (announcementId: string) => {
    if (!adminUserId) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/announcements/${encodeURIComponent(announcementId)}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterUserId: adminUserId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Could not archive the announcement.");
      }
      showToast("Announcement archived.", true);
      await loadDashboard(adminUserId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not archive the announcement.", false);
    }
  };

  const totalSavedSchedules = schedules.length;
  const totalWrittenReviews = courseRatings.length + professorRatings.length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 99999,
            background: toast.ok ? "#22c55e" : "#ef4444",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            animation: "fadeIn 0.2s ease",
          }}
        >
          {toast.msg}
        </div>
      )}

      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 32px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            flexShrink: 0,
            background: "linear-gradient(135deg, #A32638, #6e1425)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          🛡️
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)" }}>
            Admin Portal
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Tutoring dashboard for student leads, schedules, reviews, previouses, and syllabus moderation · {adminEmail}{usingLocalAdminSession ? " (local admin session)" : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {usingLocalAdminSession ? (
            <button
              onClick={() => {
                clearLocalAdminSession();
                navigate("/login");
              }}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                color: "var(--muted)",
                padding: "7px 16px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Exit Admin
            </button>
          ) : (
            <button
              onClick={() => navigate("/")}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                color: "var(--muted)",
                padding: "7px 16px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ← Back to Planner
            </button>
          )}
          <button
            onClick={() => void loadDashboard()}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "7px 16px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "32px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <StatCard label="Accounts" value={users.length} emoji="👤" />
          <StatCard label="Written reviews" value={totalWrittenReviews} emoji="✍️" />
          <StatCard label="Saved schedules" value={totalSavedSchedules} emoji="🗓️" />
          <StatCard label="Pending syllabi" value={syllabusCounts.pending} emoji="📄" />
          <StatCard label="Previouses queue" value={previousStats.pending} emoji="🗂️" />
          <StatCard
            label="Updates"
            value={announcements.filter((entry) => !entry.archivedAt).length}
            emoji="🔔"
          />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <FilterButton active={view === "syllabi"} onClick={() => setView("syllabi")}>
            Syllabi queue
          </FilterButton>
          <FilterButton active={view === "reviews"} onClick={() => setView("reviews")}>
            Review authors
          </FilterButton>
          <FilterButton active={view === "accounts"} onClick={() => setView("accounts")}>
            Student leads
          </FilterButton>
          <FilterButton active={view === "previouses"} onClick={() => setView("previouses")}>
            Previouses queue
          </FilterButton>
          <FilterButton active={view === "announcements"} onClick={() => setView("announcements")}>
            Updates
          </FilterButton>
        </div>

        {view === "syllabi" && (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 18,
              }}
            >
              {(["pending", "approved", "rejected", "all"] as const).map((key) => (
                <FilterButton key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {key === "all"
                    ? `All (${syllabusCounts.all})`
                    : `${key.charAt(0).toUpperCase() + key.slice(1)} (${syllabusCounts[key]})`}
                </FilterButton>
              ))}
            </div>

            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                  {filter === "all"
                    ? "All syllabus submissions"
                    : `${filter.charAt(0).toUpperCase() + filter.slice(1)} submissions`}
                  <span
                    style={{
                      marginLeft: 8,
                      color: "var(--muted)",
                      fontWeight: 400,
                      fontSize: 13,
                    }}
                  >
                    ({filteredSyllabi.length})
                  </span>
                </div>
                {syllabusCounts.pending > 0 && filter !== "pending" && (
                  <div
                    style={{
                      background: "rgba(245,158,11,0.15)",
                      color: "#f59e0b",
                      border: "1px solid rgba(245,158,11,0.3)",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {syllabusCounts.pending} awaiting review
                  </div>
                )}
              </div>

              {loading ? (
                <div
                  style={{
                    padding: 48,
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: 14,
                  }}
                >
                  Loading submissions...
                </div>
              ) : filteredSyllabi.length === 0 ? (
                <div
                  style={{
                    padding: 48,
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: 14,
                  }}
                >
                  {filter === "pending"
                    ? "No pending submissions — all caught up."
                    : "Nothing here yet."}
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1fr 180px 100px 120px",
                      gap: 12,
                      padding: "10px 20px",
                      background: "var(--panel2)",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                    }}
                  >
                    <span>Course</span>
                    <span>File</span>
                    <span>Submitted by</span>
                    <span>Status</span>
                    <span>Action</span>
                  </div>

                  {filteredSyllabi.map((syllabus, index) => (
                    <div
                      key={syllabus.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "110px 1fr 180px 100px 120px",
                        gap: 12,
                        padding: "14px 20px",
                        borderBottom:
                          index < filteredSyllabi.length - 1 ? "1px solid var(--border)" : "none",
                        alignItems: "center",
                        background:
                          syllabus.status === "pending"
                            ? "rgba(245,158,11,0.03)"
                            : "transparent",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                        {syllabus.course_code}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--text)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📄 {syllabus.file_name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            marginTop: 2,
                          }}
                        >
                          {formatDate(syllabus.created_at)}
                        </div>
                        {syllabus.admin_comment && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--muted)",
                              marginTop: 3,
                              fontStyle: "italic",
                            }}
                          >
                            💬 {syllabus.admin_comment}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {syllabus.uploaded_by}
                      </div>
                      <div>
                        <span
                          style={{
                            display: "inline-block",
                            background: STATUS_BG[syllabus.status],
                            color: STATUS_COLOR[syllabus.status],
                            border: `1px solid ${STATUS_COLOR[syllabus.status]}40`,
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "capitalize",
                          }}
                        >
                          {syllabus.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <a
                          href={syllabus.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "var(--panel2)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          👁 View
                        </a>
                        <button
                          onClick={() => {
                            setReviewing(syllabus);
                            setComment(syllabus.status === "pending" ? "" : syllabus.admin_comment ?? "");
                          }}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: syllabus.status === "pending" ? "#A32638" : "transparent",
                            border:
                              syllabus.status === "pending"
                                ? "none"
                                : "1px solid var(--border)",
                            color: syllabus.status === "pending" ? "#fff" : "var(--muted)",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {syllabus.status === "pending" ? "Review" : "Redo"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {view === "reviews" && (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 18,
                alignItems: "center",
              }}
            >
              <FilterButton active={reviewFilter === "all"} onClick={() => setReviewFilter("all")}>
                All reviews ({reviewEntries.length})
              </FilterButton>
              <FilterButton
                active={reviewFilter === "course"}
                onClick={() => setReviewFilter("course")}
              >
                Course reviews ({courseRatings.length})
              </FilterButton>
              <FilterButton
                active={reviewFilter === "professor"}
                onClick={() => setReviewFilter("professor")}
              >
                Professor reviews ({professorRatings.length})
              </FilterButton>
              <input
                value={reviewSearch}
                onChange={(event) => setReviewSearch(event.target.value)}
                placeholder="Search by reviewer, course, professor, or review text"
                style={{
                  flex: "1 1 320px",
                  minWidth: 240,
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  color: "var(--text)",
                  padding: "10px 12px",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              {loading ? (
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 32,
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  Loading reviews...
                </div>
              ) : filteredReviews.length === 0 ? (
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 32,
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  No reviews match this filter yet.
                </div>
              ) : (
                filteredReviews.map((entry) => {
                  const user = userMap.get(entry.userId);
                  return (
                    <div
                      key={entry.id}
                      style={{
                        background: "var(--panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: "18px 20px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                              marginBottom: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: entry.kind === "course" ? "#7dd3fc" : "#fca5a5",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {entry.kind === "course" ? "Course review" : "Professor review"}
                            </span>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "var(--panel2)",
                                border: "1px solid var(--border)",
                                color: "var(--muted)",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {formatDateTime(entry.createdAt)}
                            </span>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)" }}>
                            {entry.title}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                            {entry.subtitle}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>Reviewer</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                            {getAccountDisplayName(user ?? null, profileMap.get(entry.userId) ?? null, entry.userId)}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                            {normalizeText(user?.email) || shortId(entry.userId)}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          marginTop: 14,
                          marginBottom: 14,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: "rgba(34,197,94,0.12)",
                            border: "1px solid rgba(34,197,94,0.28)",
                            color: "#86efac",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Rating {entry.rating}/5
                        </span>
                        {typeof entry.difficulty === "number" && (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: 999,
                              background: "rgba(245,158,11,0.12)",
                              border: "1px solid rgba(245,158,11,0.28)",
                              color: "#fcd34d",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Difficulty {entry.difficulty}/5
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          background: "var(--panel2)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: "14px 16px",
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: "var(--text)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {entry.review}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {view === "accounts" && (
          <>
            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 20,
                marginBottom: 18,
                display: "grid",
                gap: 16,
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                  Tutoring lead finder
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>
                  Search students by course and export lead lists.
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 900 }}>
                  Type a course code or course title, then export a CSV that is ready for Google Contacts import and already includes the student&apos;s first name, family name, matched course, and phone number.
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) auto auto", gap: 12, alignItems: "end" }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                    Search by course
                  </label>
                  <input
                    value={courseLeadSearch}
                    onChange={(event) => setCourseLeadSearch(event.target.value)}
                    placeholder="Try CMPS 244, Database Systems, or ENGL 205"
                    style={{
                      width: "100%",
                      background: "var(--panel2)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      color: "var(--text)",
                      padding: "12px 14px",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                <button
                  onClick={exportCourseLeadsCsv}
                  disabled={!normalizeText(courseLeadSearch) || exportableCourseLeads.length === 0 || exportingCourseLeads}
                  style={{
                    background: exportableCourseLeads.length > 0 ? "linear-gradient(135deg, var(--brand-primary), var(--brand-surface))" : "var(--panel2)",
                    border: "1px solid var(--border)",
                    color: exportableCourseLeads.length > 0 ? "var(--brand-contrast)" : "var(--muted)",
                    padding: "12px 16px",
                    borderRadius: 12,
                    cursor: exportableCourseLeads.length > 0 && !exportingCourseLeads ? "pointer" : "not-allowed",
                    fontSize: 13,
                    fontWeight: 800,
                    minWidth: 190,
                    opacity: exportingCourseLeads ? 0.9 : 1,
                  }}
                >
                  {exportingCourseLeads ? "Exporting..." : "Export Google Contacts CSV"}
                </button>

                <button
                  onClick={() => setCourseLeadSearch("")}
                  style={{
                    background: "var(--panel2)",
                    border: "1px solid var(--border)",
                    color: "var(--muted)",
                    padding: "12px 16px",
                    borderRadius: 12,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Clear
                </button>
              </div>

              {normalizeText(courseLeadSearch) ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div style={{ background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Matched students</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", marginTop: 6 }}>{courseLeadMatches.length}</div>
                  </div>
                  <div style={{ background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Ready to export</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", marginTop: 6 }}>{exportableCourseLeads.length}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Students with saved phone numbers</div>
                  </div>
                  <div style={{ background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Missing phone</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", marginTop: 6 }}>{Math.max(0, courseLeadMatches.length - exportableCourseLeads.length)}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>These students stay off the CSV export</div>
                  </div>
                </div>
              ) : null}

              {normalizeText(courseLeadSearch) ? (
                courseLeadMatches.length === 0 ? (
                  <div style={{ background: "var(--panel2)", border: "1px dashed var(--border)", borderRadius: 12, padding: 18, color: "var(--muted)", fontSize: 13 }}>
                    No student schedules matched that course search yet.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {courseLeadMatches.slice(0, 8).map((entry) => (
                      <button
                        key={`lead-${entry.account.userId}`}
                        type="button"
                        onClick={() => setSelectedAccountId(entry.account.userId)}
                        style={{
                          width: "100%",
                          background: "var(--panel2)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: "14px 16px",
                          textAlign: "left",
                          color: "var(--text)",
                          cursor: "pointer",
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: 15 }}>{getAccountDisplayName(entry.account.profile, entry.account.profileRecord, entry.account.userId)}</strong>
                          <span style={{ fontSize: 12, color: normalizeText(entry.phoneNumber) ? "#86efac" : "#fca5a5", fontWeight: 700 }}>
                            {normalizeText(entry.phoneNumber) || "Phone not saved"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {entry.schoolLabel} · {entry.matchedCourses.join(" | ")}
                        </div>
                      </button>
                    ))}
                    {courseLeadMatches.length > 8 ? (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Showing the first 8 matches here. Export includes all {courseLeadMatches.length} matched students with saved phone numbers.
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>

            <div style={{ marginBottom: 18, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Full account browser
              </div>
              <input
                value={accountSearch}
                onChange={(event) => setAccountSearch(event.target.value)}
                placeholder="Search by email, name, major, or planned course"
                style={{
                  width: "100%",
                  maxWidth: 520,
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  color: "var(--text)",
                  padding: "10px 12px",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {loading ? (
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 32,
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  Loading accounts...
                </div>
              ) : filteredAccounts.length === 0 ? (
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 32,
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  No accounts match this search.
                </div>
              ) : (
                filteredAccounts.map((account) => {
                  const accountUniversityLabel = getUniversityShortLabel(
                    getAccountUniversityId(account, contactProfiles),
                  );
                  return (
                    <div
                      key={account.userId}
                      style={{
                        background: "var(--panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: "20px 22px",
                      }}
                    >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 20,
                        flexWrap: "wrap",
                        marginBottom: 16,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                            marginBottom: 6,
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 17, color: "var(--text)" }}>
                            {getAccountDisplayName(account.profile, account.profileRecord, account.userId)}
                          </div>
                          {account.profile?.is_admin && (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "rgba(124,58,237,0.16)",
                                border: "1px solid rgba(124,58,237,0.28)",
                                color: "#c4b5fd",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              Admin
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>
                          {normalizeText(account.profile?.email) || shortId(account.userId)}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          Name: {getAccountNameParts(account.profile, account.profileRecord).firstName || "Not saved"} · Family name: {getAccountNameParts(account.profile, account.profileRecord).familyName || "Not saved"}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          {normalizeText(account.profile?.major) || "No major stored"} · Joined{" "}
                          {formatDate(account.profile?.created_at)}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          Phone: {getAccountPhoneLabel(account, contactProfiles)}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          School: {accountUniversityLabel}
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              onClick={() => setSelectedAccountId(account.userId)}
                              style={{
                                background: "var(--panel)",
                                border: "1px solid var(--border)",
                                color: "var(--text)",
                                padding: "8px 14px",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Open account
                            </button>
                            <button
                              onClick={() => prepareAnnouncementForAccount(account)}
                              style={{
                                background: "rgba(163,38,56,0.12)",
                                border: "1px solid rgba(163,38,56,0.28)",
                                color: "#f8c7cf",
                                padding: "8px 14px",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Send update
                            </button>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                          gap: 10,
                          minWidth: 320,
                          flex: "1 1 420px",
                        }}
                      >
                        <StatCard
                          label="Planned courses"
                          value={account.uniquePlannedCourses.length}
                          emoji="📚"
                        />
                        <StatCard label="Saved schedules" value={account.schedules.length} emoji="🗂️" />
                        <StatCard
                          label="Course reviews"
                          value={account.courseReviews.length}
                          emoji="📝"
                        />
                        <StatCard
                          label="Professor reviews"
                          value={account.professorReviews.length}
                          emoji="🎓"
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          background: "var(--panel2)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: "14px 16px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "var(--muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            marginBottom: 10,
                          }}
                        >
                          Saved planner schedules
                        </div>
                        {account.schedules.length === 0 ? (
                          <div style={{ fontSize: 13, color: "var(--muted)" }}>
                            No saved planner schedules for this account yet.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            {account.schedules.map((schedule) => {
                              const scheduleCourses = getCoursePillsFromSchedule(schedule);
                              return (
                                <div
                                  key={schedule.id}
                                  style={{
                                    border: "1px solid var(--border)",
                                    borderRadius: 10,
                                    padding: "12px 12px 10px",
                                    background: "rgba(255,255,255,0.02)",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 12,
                                      flexWrap: "wrap",
                                      marginBottom: 8,
                                    }}
                                  >
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                                      {getScheduleUniversity(schedule)} · {humanizeTermId(schedule.term_id)}
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                      Slot {schedule.slot ?? "?"} · Updated {formatDateTime(schedule.updated_at)}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: 8,
                                    }}
                                  >
                                    {scheduleCourses.length > 0 ? (
                                      scheduleCourses.map((label) => (
                                        <span
                                          key={`${schedule.id}-${label}`}
                                          style={{
                                            display: "inline-block",
                                            padding: "4px 8px",
                                            borderRadius: 999,
                                            background: "var(--panel)",
                                            border: "1px solid var(--border)",
                                            color: "var(--text)",
                                            fontSize: 12,
                                            fontWeight: 600,
                                          }}
                                        >
                                          {label}
                                        </span>
                                      ))
                                    ) : (
                                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                        No courses stored in this saved slot.
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 16,
                        }}
                      >
                        <div
                          style={{
                            background: "var(--panel2)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: "14px 16px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              marginBottom: 10,
                            }}
                          >
                            Favorite courses
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {account.favorites.length > 0 ? (
                              account.favorites.map((favorite) => {
                                const label = getFavoriteCourseLabel(favorite);
                                if (!label) return null;
                                return (
                                  <span
                                    key={favorite.id}
                                    style={{
                                      display: "inline-block",
                                      padding: "4px 8px",
                                      borderRadius: 999,
                                      background: "var(--panel)",
                                      border: "1px solid var(--border)",
                                      color: "var(--text)",
                                      fontSize: 12,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {label}
                                  </span>
                                );
                              })
                            ) : (
                              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                                No favorites saved.
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            background: "var(--panel2)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: "14px 16px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              marginBottom: 10,
                            }}
                          >
                            Review activity
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>
                            <div>{account.courseReviews.length} course reviews written</div>
                            <div>{account.professorReviews.length} professor reviews written</div>
                            <div>{account.uniquePlannedCourses.length} unique planned courses saved</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {view === "previouses" && (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 18,
                alignItems: "center",
              }}
            >
              <FilterButton active={previousFilter === "pending"} onClick={() => setPreviousFilter("pending")}>
                Pending ({previousStats.pending})
              </FilterButton>
              <FilterButton active={previousFilter === "approved"} onClick={() => setPreviousFilter("approved")}>
                Approved ({previousStats.approved})
              </FilterButton>
              <FilterButton active={previousFilter === "rejected"} onClick={() => setPreviousFilter("rejected")}>
                Rejected ({previousStats.rejected})
              </FilterButton>
              <FilterButton active={previousFilter === "all"} onClick={() => setPreviousFilter("all")}>
                All ({previousStats.total})
              </FilterButton>
              <input
                value={previousSearch}
                onChange={(event) => setPreviousSearch(event.target.value)}
                placeholder="Search by course, uploader, document title, university, or AI reason"
                style={{
                  flex: "1 1 360px",
                  minWidth: 260,
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  color: "var(--text)",
                  padding: "10px 12px",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {loading ? (
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 32,
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  Loading previouses queue...
                </div>
              ) : filteredPreviousDocuments.length === 0 ? (
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 32,
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  No previouses match this moderation filter.
                </div>
              ) : (
                filteredPreviousDocuments.map((document) => {
                  const uploaderAccount = accountSummaries.find(
                    (entry) => entry.userId === normalizeText(document.userId),
                  );
                  const uploaderLabel = uploaderAccount
                    ? getAccountDisplayName(uploaderAccount.profile, uploaderAccount.profileRecord, uploaderAccount.userId)
                    : normalizeText(document.userEmail) || shortId(document.userId);
                  const schoolLabel = getUniversityShortLabel(document.universityId);
                  const currentComment = previousReviewComments[document.id] ?? normalizeText(document.adminComment);
                  const aiConfidencePercent = Math.round((Number(document.aiConfidence ?? 0) || 0) * 100);
                  const isReviewingThisDocument = reviewingPreviousId === document.id;

                  return (
                    <article
                      key={document.id}
                      style={{
                        background: "var(--panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 16,
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)", gap: 0 }}>
                        <div
                          style={{
                            minHeight: 260,
                            background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          {document.previewUrl ? (
                            <img
                              src={`${API_URL}${document.previewUrl}`}
                              alt={document.documentTitle || document.originalFileName || document.courseCode}
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "block",
                                objectFit: "cover",
                                objectPosition: "top center",
                              }}
                            />
                          ) : (
                            <div style={{ padding: 18, fontSize: 13, color: "var(--muted)" }}>
                              No preview image was generated for this file.
                            </div>
                          )}
                        </div>

                        <div style={{ padding: 18, display: "grid", gap: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                                {document.documentKind || "Previous"} · {schoolLabel}
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginTop: 6 }}>
                                {document.courseCode}{document.courseTitle ? ` — ${document.courseTitle}` : ""}
                              </div>
                              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
                                {document.documentTitle || document.originalFileName || "Untitled upload"}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                                Uploaded by <strong style={{ color: "var(--text)" }}>{uploaderLabel}</strong>
                                {document.userEmail ? ` · ${document.userEmail}` : ""}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                                {document.examTermLabel || "No exam term label"} · {formatDateTime(document.createdAt)}
                              </div>
                            </div>

                            <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: STATUS_BG[document.status],
                                  color: STATUS_COLOR[document.status],
                                  border: `1px solid ${STATUS_COLOR[document.status]}40`,
                                  fontSize: 12,
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                }}
                              >
                                {document.status}
                              </span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: "var(--panel2)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text)",
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                AI confidence {aiConfidencePercent}%
                              </span>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {Array.isArray(document.aiLabels) && document.aiLabels.length > 0 ? (
                              document.aiLabels.map((label) => (
                                <span
                                  key={`${document.id}-${label}`}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    background: "var(--panel2)",
                                    border: "1px solid var(--border)",
                                    color: "var(--muted)",
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  {label}
                                </span>
                              ))
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                No AI labels attached.
                              </span>
                            )}
                          </div>

                          {document.aiReason ? (
                            <div
                              style={{
                                background: "var(--panel2)",
                                border: "1px solid var(--border)",
                                borderRadius: 12,
                                padding: "12px 14px",
                                fontSize: 13,
                                color: "var(--text)",
                                lineHeight: 1.65,
                              }}
                            >
                              <strong style={{ display: "block", marginBottom: 6 }}>AI review</strong>
                              {document.aiReason}
                            </div>
                          ) : null}

                          <div
                            style={{
                              background: "var(--panel2)",
                              border: "1px solid var(--border)",
                              borderRadius: 12,
                              padding: "12px 14px",
                              fontSize: 13,
                              color: "var(--text)",
                              lineHeight: 1.65,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {document.extractedTextPreview || "No extracted text preview is available for this upload."}
                          </div>

                          {document.note ? (
                            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                              Student note: {document.note}
                            </div>
                          ) : null}

                          <div style={{ display: "grid", gap: 8 }}>
                            <label style={{ display: "grid", gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
                                Admin comment
                              </span>
                              <textarea
                                value={currentComment}
                                onChange={(event) => handlePreviousReviewCommentChange(document.id, event.target.value)}
                                placeholder="Why was this approved, rejected, or sent back to pending?"
                                rows={3}
                                style={{
                                  width: "100%",
                                  boxSizing: "border-box",
                                  background: "var(--panel2)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text)",
                                  borderRadius: 12,
                                  padding: "11px 12px",
                                  fontSize: 13,
                                  resize: "vertical",
                                  fontFamily: "inherit",
                                  outline: "none",
                                }}
                              />
                            </label>

                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <a
                                href={document.previewUrl ? `${API_URL}${document.previewUrl}` : undefined}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "10px 14px",
                                  borderRadius: 12,
                                  background: "var(--panel2)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text)",
                                  textDecoration: "none",
                                  fontSize: 13,
                                  fontWeight: 700,
                                  pointerEvents: document.previewUrl ? "auto" : "none",
                                  opacity: document.previewUrl ? 1 : 0.55,
                                }}
                              >
                                Open preview
                              </a>
                              <a
                                href={document.fileUrl ? `${API_URL}${document.fileUrl}` : undefined}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "10px 14px",
                                  borderRadius: 12,
                                  background: "var(--panel2)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text)",
                                  textDecoration: "none",
                                  fontSize: 13,
                                  fontWeight: 700,
                                  pointerEvents: document.fileUrl ? "auto" : "none",
                                  opacity: document.fileUrl ? 1 : 0.55,
                                }}
                              >
                                Open file
                              </a>
                              <button
                                type="button"
                                onClick={() => void handlePreviousReview(document.id, "approved")}
                                disabled={isReviewingThisDocument}
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: 12,
                                  background: "rgba(34,197,94,0.12)",
                                  border: "1px solid rgba(34,197,94,0.28)",
                                  color: "#86efac",
                                  cursor: isReviewingThisDocument ? "not-allowed" : "pointer",
                                  fontSize: 13,
                                  fontWeight: 800,
                                  opacity: isReviewingThisDocument ? 0.7 : 1,
                                }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => void handlePreviousReview(document.id, "pending")}
                                disabled={isReviewingThisDocument}
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: 12,
                                  background: "rgba(245,158,11,0.12)",
                                  border: "1px solid rgba(245,158,11,0.28)",
                                  color: "#fcd34d",
                                  cursor: isReviewingThisDocument ? "not-allowed" : "pointer",
                                  fontSize: 13,
                                  fontWeight: 800,
                                  opacity: isReviewingThisDocument ? 0.7 : 1,
                                }}
                              >
                                Send to pending
                              </button>
                              <button
                                type="button"
                                onClick={() => void handlePreviousReview(document.id, "rejected")}
                                disabled={isReviewingThisDocument}
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: 12,
                                  background: "rgba(239,68,68,0.12)",
                                  border: "1px solid rgba(239,68,68,0.28)",
                                  color: "#fca5a5",
                                  cursor: isReviewingThisDocument ? "not-allowed" : "pointer",
                                  fontSize: 13,
                                  fontWeight: 800,
                                  opacity: isReviewingThisDocument ? 0.7 : 1,
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </>
        )}

        {view === "announcements" && (
          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(360px, 1.15fr) minmax(280px, 0.85fr)",
                gap: 18,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "18px 18px 16px",
                  display: "grid",
                  gap: 14,
                }}
              >
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>
                    Send update
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                    Send account or academic updates to students based on their saved courses and university.
                  </div>
                </div>

                <input
                  value={announcementTitle}
                  onChange={(event) => setAnnouncementTitle(event.target.value)}
                  placeholder="Update title"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--panel2)",
                    color: "var(--text)",
                    padding: "12px 14px",
                    fontSize: 14,
                    outline: "none",
                  }}
                />

                <textarea
                  value={announcementMessage}
                  onChange={(event) => setAnnouncementMessage(event.target.value)}
                  placeholder="Write the update the student should see."
                  rows={6}
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--panel2)",
                    color: "var(--text)",
                    padding: "12px 14px",
                    fontSize: 14,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Audience</span>
                    <select
                      value={announcementAudienceMode}
                      onChange={(event) => setAnnouncementAudienceMode(event.target.value as AnnouncementAudienceMode)}
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--panel2)",
                        color: "var(--text)",
                        padding: "10px 12px",
                        fontSize: 13,
                      }}
                    >
                      <option value="accounts">Specific accounts</option>
                      <option value="courses">Students taking selected courses</option>
                      <option value="university">Entire university</option>
                      <option value="all">All accounts</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>University</span>
                    <select
                      value={announcementUniversityId}
                      onChange={(event) => setAnnouncementUniversityId(event.target.value)}
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--panel2)",
                        color: "var(--text)",
                        padding: "10px 12px",
                        fontSize: 13,
                      }}
                    >
                      <option value="">Any university</option>
                      {discoveredUniversityIds.map((value) => (
                        <option key={value} value={value}>
                          {getUniversityShortLabel(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {(announcementAudienceMode === "courses" || announcementAudienceMode === "accounts") && (
                  <div style={{ display: "grid", gap: 10 }}>
                    {announcementAudienceMode === "courses" && (
                      <textarea
                        value={announcementCourseCodes}
                        onChange={(event) => setAnnouncementCourseCodes(event.target.value)}
                        placeholder="Target course codes, separated by commas or new lines. Example: CMPS 201, MATH 202"
                        rows={3}
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--panel2)",
                          color: "var(--text)",
                          padding: "12px 14px",
                          fontSize: 13,
                          outline: "none",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />
                    )}

                    {announcementAudienceMode === "accounts" && (
                      <div
                        style={{
                          background: "var(--panel2)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: "12px 14px",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            {announcementTargetUserIds.length} account{announcementTargetUserIds.length === 1 ? "" : "s"} selected
                          </div>
                          <button
                            type="button"
                            onClick={useFilteredAccountsAsTargets}
                            style={{
                              background: "rgba(163,38,56,0.12)",
                              border: "1px solid rgba(163,38,56,0.28)",
                              color: "#f8c7cf",
                              borderRadius: 10,
                              padding: "7px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Use filtered accounts ({filteredAccounts.length})
                          </button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {announcementTargetUserIds.length > 0 ? (
                            announcementTargetUserIds.slice(0, 16).map((userId) => {
                              const account = accountSummaries.find((entry) => entry.userId === userId);
                              return (
                                <span
                                  key={userId}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "5px 9px",
                                    borderRadius: 999,
                                    background: "var(--panel)",
                                    border: "1px solid var(--border)",
                                    color: "var(--text)",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {account ? getAccountDisplayName(account.profile, account.profileRecord, account.userId) : shortId(userId)}
                                </span>
                              );
                            })
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>
                              Pick accounts from Account schedules or use the filtered-account shortcut here.
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <input
                    value={announcementCtaLabel}
                    onChange={(event) => setAnnouncementCtaLabel(event.target.value)}
                    placeholder="CTA label (optional)"
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--panel2)",
                      color: "var(--text)",
                      padding: "12px 14px",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <input
                    value={announcementCtaUrl}
                    onChange={(event) => setAnnouncementCtaUrl(event.target.value)}
                    placeholder="CTA URL (optional)"
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--panel2)",
                      color: "var(--text)",
                      padding: "12px 14px",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void handleSendAnnouncement()}
                    disabled={sendingAnnouncement}
                    style={{
                      background: "#A32638",
                      border: "none",
                      color: "#fff",
                      padding: "11px 16px",
                      borderRadius: 12,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    {sendingAnnouncement ? "Sending..." : "Send update"}
                  </button>
                  <button
                    type="button"
                    onClick={resetAnnouncementDraft}
                    style={{
                      background: "var(--panel2)",
                      border: "1px solid var(--border)",
                      color: "var(--muted)",
                      padding: "11px 16px",
                      borderRadius: 12,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    Reset draft
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "18px 18px 16px",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>
                    Audience preview
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                    {announcementPreviewAccounts.length} account{announcementPreviewAccounts.length === 1 ? "" : "s"} will receive this update right now.
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {announcementPreviewAccounts.slice(0, 12).map((account) => (
                    <div
                      key={`preview-${account.userId}`}
                      style={{
                        background: "var(--panel2)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        {getAccountDisplayName(account.profile, account.profileRecord, account.userId)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                        {normalizeText(account.profile?.email) || shortId(account.userId)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                        Phone: {getAccountPhoneLabel(account, contactProfiles)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                        {getUniversityShortLabel(getAccountUniversityId(account, contactProfiles))} · {getAccountCourseCodes(account).slice(0, 3).join(", ") || "No saved courses"}
                      </div>
                    </div>
                  ))}
                  {announcementPreviewAccounts.length === 0 && (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      No accounts match this target yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>
                  Sent updates
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {announcements.length} total
                </div>
              </div>

              <div style={{ display: "grid", gap: 0 }}>
                {announcements.length === 0 ? (
                  <div style={{ padding: 28, color: "var(--muted)", textAlign: "center", fontSize: 14 }}>
                    No updates sent yet.
                  </div>
                ) : (
                  announcements.map((announcement, index) => (
                    <div
                      key={announcement.id}
                      style={{
                        padding: "16px 18px",
                        borderTop: index === 0 ? "none" : "1px solid var(--border)",
                        opacity: announcement.archivedAt ? 0.68 : 1,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>
                            {announcement.title}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                            {announcement.audienceSummary || "Audience unavailable"} · Sent {formatDateTime(announcement.createdAt)}
                          </div>
                        </div>
                        {!announcement.archivedAt ? (
                          <button
                            type="button"
                            onClick={() => void handleArchiveAnnouncement(announcement.id)}
                            style={{
                              background: "var(--panel2)",
                              border: "1px solid var(--border)",
                              color: "var(--muted)",
                              padding: "8px 12px",
                              borderRadius: 10,
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Archive
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>Archived</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text)", marginTop: 10, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                        {announcement.message}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                        <span style={{ padding: "4px 8px", borderRadius: 999, background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 12, fontWeight: 700 }}>
                          Recipients: {announcement.recipientCount ?? 0}
                        </span>
                        <span style={{ padding: "4px 8px", borderRadius: 999, background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 12, fontWeight: 700 }}>
                          Read: {announcement.readCount ?? 0}
                        </span>
                        <span style={{ padding: "4px 8px", borderRadius: 999, background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 12, fontWeight: 700 }}>
                          Unread: {announcement.unreadCount ?? 0}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedAccount && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.68)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99997,
            padding: 16,
          }}
          onClick={() => setSelectedAccountId(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 1080,
              maxHeight: "88vh",
              overflow: "auto",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              boxShadow: "0 28px 80px rgba(0,0,0,0.42)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: "var(--panel)",
                borderBottom: "1px solid var(--border)",
                padding: "18px 22px",
                display: "flex",
                justifyContent: "space-between",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Account details
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>
                  {getAccountDisplayName(selectedAccount.profile, selectedAccount.profileRecord, selectedAccount.userId)}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
                  {normalizeText(selectedAccount.profile?.email) || shortId(selectedAccount.userId)}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  Name: {getAccountNameParts(selectedAccount.profile, selectedAccount.profileRecord).firstName || "Not saved"} · Family name: {getAccountNameParts(selectedAccount.profile, selectedAccount.profileRecord).familyName || "Not saved"}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {normalizeText(selectedAccount.profile?.major) || "No major stored"} Â· Joined {formatDate(selectedAccount.profile?.created_at)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Phone: {getAccountPhoneLabel(selectedAccount, contactProfiles)}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                School: {selectedAccountUniversityLabel}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <StatCard label="Saved schedules" value={selectedAccount.schedules.length} emoji="🗂️" />
                <StatCard label="Chosen courses" value={selectedAccount.uniquePlannedCourses.length} emoji="📚" />
                <button
                  onClick={() => prepareAnnouncementForAccount(selectedAccount)}
                  style={{
                    background: "rgba(163,38,56,0.12)",
                    border: "1px solid rgba(163,38,56,0.28)",
                    color: "#f8c7cf",
                    padding: "9px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Send update
                </button>
                <button
                  onClick={() => setSelectedAccountId(null)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    color: "var(--muted)",
                    padding: "9px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: "20px 22px 24px", display: "grid", gap: 18 }}>
              <div
                style={{
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  All chosen courses
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedAccount.uniquePlannedCourses.length > 0 ? (
                    selectedAccount.uniquePlannedCourses.map((courseLabel) => (
                      <span
                        key={`summary-${selectedAccount.userId}-${courseLabel}`}
                        style={{
                          display: "inline-block",
                          padding: "5px 9px",
                          borderRadius: 999,
                          background: "var(--panel)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {courseLabel}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      No planned courses stored for this account yet.
                    </span>
                  )}
                </div>
              </div>

              <div
                style={{
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  Saved planner schedules
                </div>
                {selectedAccount.schedules.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    No saved planner schedules for this account yet.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {selectedAccount.schedules.map((schedule) => {
                      const courseSnapshots = getCourseSnapshotsFromSchedule(schedule);
                      return (
                        <div
                          key={`detail-${schedule.id}`}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            background: "rgba(255,255,255,0.02)",
                            padding: "14px 14px 12px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              flexWrap: "wrap",
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>
                              {getScheduleUniversity(schedule)} Â· {humanizeTermId(schedule.term_id)}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                              Slot {schedule.slot ?? "?"} Â· Updated {formatDateTime(schedule.updated_at)}
                            </div>
                          </div>

                          {courseSnapshots.length === 0 ? (
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                              No course rows stored in this saved schedule.
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: 8 }}>
                              {courseSnapshots.map((course, index) => (
                                <div
                                  key={`${schedule.id}-${course.code}-${course.section}-${index}`}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
                                    gap: 12,
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    border: "1px solid var(--border)",
                                    background: "var(--panel)",
                                  }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
                                      {course.code}{course.section ? ` ${course.section}` : ""}
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                                      {course.title || "Untitled stored course"}
                                    </div>
                                  </div>
                                  <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                      {course.instructor || "No instructor stored"}
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                      {course.campus || "No campus stored"}{course.credits ? ` Â· ${course.credits} cr` : ""}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {reviewing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99998,
            padding: 16,
          }}
          onClick={() => !submitting && setReviewing(null)}
        >
          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
              overflow: "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid var(--border)",
                background: "var(--panel2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
                  Review submission
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {reviewing.course_code} · {reviewing.file_name}
                </div>
              </div>
              <button
                onClick={() => !submitting && setReviewing(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "22px" }}>
              <div
                style={{
                  background: "var(--bg)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 20,
                  border: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    📄 {reviewing.file_name}
                  </span>
                  <a
                    href={reviewing.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      color: "var(--accent)",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Open PDF ↗
                  </a>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Submitted by{" "}
                  <strong style={{ color: "var(--text)" }}>{reviewing.uploaded_by}</strong> on{" "}
                  {formatDate(reviewing.created_at)}
                </div>
                {reviewing.reviewed_by && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    Previously {reviewing.status} by {reviewing.reviewed_by}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--muted)",
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Comment / Reason{" "}
                  <span
                    style={{
                      color: "var(--muted)",
                      fontWeight: 400,
                      textTransform: "none",
                    }}
                  >
                    (required for rejection)
                  </span>
                </label>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="e.g. Wrong course, outdated syllabus, or 'Looks good!'"
                  rows={3}
                  disabled={submitting}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text)",
                    fontSize: 13,
                    padding: "10px 12px",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => handleDecision("rejected")}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: "11px",
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.4)",
                    color: "#ef4444",
                    borderRadius: 10,
                    cursor: submitting ? "not-allowed" : "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  ✕ Reject
                </button>
                <button
                  onClick={() => handleDecision("approved")}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: "11px",
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.4)",
                    color: "#22c55e",
                    borderRadius: 10,
                    cursor: submitting ? "not-allowed" : "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  ✓ Approve
                </button>
              </div>
              {submitting && (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: 12,
                    marginTop: 10,
                  }}
                >
                  Saving...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
