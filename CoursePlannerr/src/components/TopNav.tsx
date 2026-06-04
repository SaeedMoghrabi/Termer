import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import CalculateRoundedIcon from "@mui/icons-material/CalculateRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import { supabase } from "../supabaseClient.ts";
import { API_ROOT as API_URL } from "../config/runtime.ts";
import { clearLocalAdminSession } from "../utils/localAdminSession.ts";
import {
  calculateGPA,
  getGradePointsMap,
  getGpaScale,
  scoreToQualityPoints,
  scoreToLetterWithNote,
} from "../gpaCalculator";
import {
  getGradeFeedbackTone,
  getGradingSystem,
  getTopGrade,
} from "../config/gradingSystems.ts";
import { TermerMark } from "./TermerBrand.tsx";
import type { Course } from "../types";
import type { UniversityId, UniversityOption } from "../config/universities.ts";
import { useSessionAccess } from "../hooks/useSessionAccess.ts";

type Props = {
  appName: string;
  universityName: string;
  universityId: UniversityId;
  universities: UniversityOption[];
  semesterLabel: string;
  semesterId: string;
  semesters: { id: string; label: string }[];
  lastUpdatedText: string;
  onUniversityChange: (id: UniversityId) => void;
  onSemesterChange: (id: string) => void;
  scheduledCourses: Course[];
  activePage?: "home" | "empty-classes" | "reviews" | "previouses";
  canChangeUniversity?: boolean;
};

type UserAnnouncement = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  ctaLabel?: string;
  ctaUrl?: string;
  unread?: boolean;
  audienceSummary?: string;
};

type CurrentNameProfile = {
  displayName?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  family_name?: string | null;
  updated_at?: string | null;
};

const REQUIRED_NAME_REFRESH_AT = Date.parse("2026-05-31T00:00:00.000Z");
function buildInitialGpaRows(courses: Course[], defaultGrade: string) {
  return courses.length > 0
    ? courses.map((course) => ({
        course: course.code,
        grade: defaultGrade,
        credits: String(course.credits),
      }))
    : [
        { course: "", grade: defaultGrade, credits: "" },
        { course: "", grade: defaultGrade, credits: "" },
      ];
}

function describeGpa(gpaValue: number | null, scaleMax: number) {
  if (gpaValue === null) return "No data";
  const ratio = scaleMax > 0 ? gpaValue / scaleMax : 0;
  if (ratio >= 0.92) return "Excellent standing";
  if (ratio >= 0.8) return "Strong standing";
  if (ratio >= 0.68) return "Good progress";
  if (ratio >= 0.55) return "Passing range";
  return "Needs attention";
}

function getGpaColor(gpaValue: number | null, scaleMax: number) {
  if (gpaValue === null) return "var(--muted)";
  const ratio = scaleMax > 0 ? gpaValue / scaleMax : 0;
  if (ratio >= 0.8) return "#22c55e";
  if (ratio >= 0.62) return "#f59e0b";
  return "#ef4444";
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function splitDisplayName(displayName: string) {
  const normalized = normalizeText(displayName).replace(/\s+/g, " ");
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

function withFetchTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Saving took too long. Please try again."));
    }, timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timeoutId));
  });
}

const defaultGradeRows = () => [
  { id: 1, name: "Midterm", weight: 30, score: "" },
  { id: 2, name: "Final Exam", weight: 40, score: "" },
  { id: 3, name: "Assignments", weight: 20, score: "" },
  { id: 4, name: "Participation", weight: 10, score: "" },
];

export function TopNav({
  appName,
  universityName,
  universityId,
  universities,
  semesterLabel,
  semesterId,
  semesters,
  lastUpdatedText,
  scheduledCourses,
  onUniversityChange,
  onSemesterChange,
  activePage = 'home',
  canChangeUniversity = true,
}: Props) {
  const navigate = useNavigate();
  const gradingSystem = useMemo(() => getGradingSystem(universityId), [universityId]);
  const gradePoints = useMemo(() => getGradePointsMap(universityId), [universityId]);
  const gpaScale = useMemo(() => getGpaScale(universityId), [universityId]);
  const defaultCourseGrade = useMemo(() => getTopGrade(universityId), [universityId]);
  const normalizeTranscriptGrade = (grade: string) =>
    gradePoints[grade] !== undefined ? grade : defaultCourseGrade;

  const [showGpa, setShowGpa] = useState(false);
  const [announcements, setAnnouncements] = useState<UserAnnouncement[]>([]);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileFamilyName, setProfileFamilyName] = useState("");
  const [loadingRequiredProfile, setLoadingRequiredProfile] = useState(false);
  const [requiredProfileHydrated, setRequiredProfileHydrated] = useState(false);
  const [requiredProfilePromptOpen, setRequiredProfilePromptOpen] = useState(false);
  const [savingRequiredProfile, setSavingRequiredProfile] = useState(false);
  const [requiredProfileError, setRequiredProfileError] = useState("");
  const [requiredProfileSaved, setRequiredProfileSaved] = useState(false);
  const [rows, setRows] = useState(() => buildInitialGpaRows(scheduledCourses, defaultCourseGrade));
  const {
    isAdmin,
    userId: currentUserId,
    userEmail: currentUserEmail,
    lockedUniversityId,
  } = useSessionAccess();

  const [showGrade, setShowGrade] = useState(false);
  const [gradeRows, setGradeRows] = useState(defaultGradeRows());
  const [nextId, setNextId] = useState(5);

  useEffect(() => {
    if (!currentUserId) {
      setProfileFirstName("");
      setProfileFamilyName("");
      setRequiredProfileHydrated(false);
      setRequiredProfilePromptOpen(false);
      setRequiredProfileSaved(false);
      return undefined;
    }
    let cancelled = false;

    const loadRequiredProfile = async () => {
      setLoadingRequiredProfile(true);
      setRequiredProfileHydrated(false);
      setRequiredProfileError("");
      setRequiredProfileSaved(false);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUserId)
          .maybeSingle();

        if (error) throw error;

        const profile = (data ?? {}) as CurrentNameProfile;
        const firstName = normalizeText(profile.first_name);
        const familyName = normalizeText(profile.family_name);
        const displayNameParts = splitDisplayName(profile.displayName ?? profile.display_name ?? "");
        const nextFirstName = firstName || displayNameParts.firstName;
        const nextFamilyName = familyName || displayNameParts.familyName;
        const updatedAtMs = Date.parse(normalizeText(profile.updated_at));
        const mustReenterNames =
          !nextFirstName
          || !nextFamilyName
          || Number.isNaN(updatedAtMs)
          || updatedAtMs < REQUIRED_NAME_REFRESH_AT;

        if (!cancelled) {
          setProfileFirstName(mustReenterNames ? "" : nextFirstName);
          setProfileFamilyName(mustReenterNames ? "" : nextFamilyName);
          setRequiredProfilePromptOpen(mustReenterNames);
        }
      } catch {
        if (!cancelled) {
          setProfileFirstName("");
          setProfileFamilyName("");
          setRequiredProfilePromptOpen(true);
          setRequiredProfileError("We couldn't load your saved name yet.");
        }
      } finally {
        if (!cancelled) {
          setLoadingRequiredProfile(false);
          setRequiredProfileHydrated(true);
        }
      }
    };

    void loadRequiredProfile();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return undefined;
    let cancelled = false;

    const loadAnnouncements = async () => {
      setLoadingAnnouncements(true);
      try {
        const response = await fetch(
          `${API_URL}/api/announcements?userId=${encodeURIComponent(currentUserId)}`,
          { cache: "no-store" },
        );
        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
        }
      } catch {
        if (!cancelled) setAnnouncements([]);
      } finally {
        if (!cancelled) setLoadingAnnouncements(false);
      }
    };

    void loadAnnouncements();
    const intervalId = window.setInterval(() => {
      void loadAnnouncements();
    }, 60_000);
    const handleFocus = () => {
      void loadAnnouncements();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [currentUserId]);

  useEffect(() => {
    setRows((currentRows) =>
      currentRows.map((row) => ({
        ...row,
        grade: normalizeTranscriptGrade(row.grade),
      })),
    );
  }, [defaultCourseGrade, gradePoints]);

  const gpa = (() => {
    const mapped = rows
      .filter((r) => !isNaN(parseFloat(r.credits)) && parseFloat(r.credits) > 0)
      .map((r) => ({
        credits: parseFloat(r.credits),
        grade: normalizeTranscriptGrade(r.grade),
        semester: "",
      }));
    if (mapped.length === 0) return null;
    try {
      return calculateGPA(mapped, null, universityId).toFixed(2);
    } catch {
      return null;
    }
  })();

  const gpaValue = gpa !== null ? parseFloat(gpa) : null;
  const gpaColor = getGpaColor(gpaValue, gpaScale);
  const gpaLabel = describeGpa(gpaValue, gpaScale);
  const gpaPercent =
    gpaValue !== null ? Math.min((gpaValue / gpaScale) * 100, 100) : 0;

  const totalCredits = rows.reduce((s, r) => {
    const c = parseFloat(r.credits);
    return s + (isNaN(c) ? 0 : c);
  }, 0);

  const activeCourses = rows.filter((r) => parseFloat(r.credits) > 0).length;

  const addRow = () =>
    setRows((p) => [...p, { course: "", grade: defaultCourseGrade, credits: "" }]);

  const removeRow = (i: number) =>
    setRows((p) => p.filter((_, idx) => idx !== i));

  const updateRow = (i: number, field: string, value: string) =>
    setRows((p) =>
      p.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    );

  const resetRows = () =>
    setRows(buildInitialGpaRows([], defaultCourseGrade));

  const [lightMode, setLightMode] = useState(false);
  const toggleTheme = () => {
    setLightMode((prev) => {
      document.body.classList.toggle("light", !prev);
      return !prev;
    });
  };

  const updateGradeRow = (id: number, field: string, val: string) =>
    setGradeRows((p) =>
      p.map((r) => (r.id === id ? { ...r, [field]: val } : r)),
    );

  const addGradeRow = () => {
    setGradeRows((p) => [...p, { id: nextId, name: "", weight: 0, score: "" }]);
    setNextId((n) => n + 1);
  };

  const removeGradeRow = (id: number) => {
    if (gradeRows.length > 1) {
      setGradeRows((p) => p.filter((r) => r.id !== id));
    }
  };

  const totalWeight = gradeRows.reduce(
    (s, r) => s + (parseFloat(String(r.weight)) || 0),
    0,
  );

  const filledRows = gradeRows.filter(
    (r) => r.score !== "" && r.weight !== 0 && parseFloat(String(r.weight)) > 0,
  );

  const usedWeight = filledRows.reduce(
    (s, r) => s + parseFloat(String(r.weight)),
    0,
  );

  const isPartial = Math.abs(usedWeight - 100) > 0.01;

  let finalPct: number | null = null;
  let finalLetter: string | null = null;
  let finalGp: number | null = null;
  let finalLetterNote: string | null = null;

  if (filledRows.length > 0) {
    const weighted = filledRows.reduce(
      (s, r) =>
        s + parseFloat(r.score as string) * parseFloat(String(r.weight)),
      0,
    );
    finalPct = weighted / usedWeight;
    const scoreResult = scoreToLetterWithNote(finalPct, universityId);
    finalLetter = scoreResult.letter;
    finalLetterNote = scoreResult.note;
    finalGp = scoreToQualityPoints(finalPct, universityId)
      ?? (finalLetter ? (gradePoints[finalLetter] ?? null) : null);
  }

  const finalGradeTone = getGradeFeedbackTone({
    universityId,
    letter: finalLetter,
    note: finalLetterNote,
  });
  const letterColor = finalGradeTone.accent;
  const gradeResultStyle: CSSProperties = {
    background: `radial-gradient(circle at top right, ${finalGradeTone.accentSoft}, transparent 42%), linear-gradient(135deg, ${finalGradeTone.surfaceStart}, ${finalGradeTone.surfaceEnd})`,
    border: `1px solid ${finalGradeTone.border}`,
    boxShadow: `0 18px 36px ${finalGradeTone.glow}`,
  };
  const gradeResultLetterStyle: CSSProperties = {
    background: finalGradeTone.letterBg,
    color: finalGradeTone.title,
    border: `1px solid ${finalGradeTone.letterBorder}`,
  };
  const gradeResultStateStyle: CSSProperties = {
    background: finalGradeTone.accentSoft,
    color: finalGradeTone.title,
    border: `1px solid ${finalGradeTone.letterBorder}`,
  };

  const openGpaCalculator = () => {
    setRows(buildInitialGpaRows(scheduledCourses, defaultCourseGrade));
    setShowGpa(true);
  };

  const openGradeCalculator = () => {
    setGradeRows(defaultGradeRows());
    setShowGrade(true);
  };

  const goHome = () => {
    if (activePage === "home") {
      document
        .querySelector(".middlePanel")
        ?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    navigate("/");
  };

  const refreshApp = () => {
    window.location.reload();
  };

  const requiredProfileIncomplete = requiredProfileHydrated && requiredProfilePromptOpen;
  const unreadAnnouncementIds = announcements.filter((entry) => entry.unread).map((entry) => entry.id);
  const updatesBadgeCount = unreadAnnouncementIds.length + (requiredProfileIncomplete ? 1 : 0);
  const visibleUniversityId = lockedUniversityId ?? universityId;
  const visibleUniversities = universities;
  const catalogStatusText = normalizeText(lastUpdatedText) || "Refreshing every few minutes";

  const saveRequiredProfileNames = async () => {
    if (!currentUserId) return;

    const firstName = normalizeText(profileFirstName);
    const familyName = normalizeText(profileFamilyName);
    if (!firstName || !familyName) {
      setRequiredProfileError("Please enter both your name and family name.");
      setRequiredProfileSaved(false);
      return;
    }

    setSavingRequiredProfile(true);
    setRequiredProfileError("");
    setRequiredProfileSaved(false);
    setRequiredProfilePromptOpen(false);
    setRequiredProfileSaved(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = normalizeText(sessionData?.session?.access_token);
      if (!accessToken) {
        throw new Error("Your session expired. Please sign in again.");
      }

      const response = await withFetchTimeout(
        fetch(`${API_URL}/api/account/profile-name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            firstName,
            familyName,
          }),
        }),
        6000,
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(normalizeText(payload?.error) || "We couldn't save your name yet. Please try again.");
      }

      setProfileFirstName(firstName);
      setProfileFamilyName(familyName);
      setRequiredProfilePromptOpen(false);
      setRequiredProfileSaved(true);
    } catch (error) {
      setRequiredProfilePromptOpen(true);
      setRequiredProfileError(
        error instanceof Error && normalizeText(error.message)
          ? error.message
          : "We couldn't save your name yet. Please try again.",
      );
      setRequiredProfileSaved(false);
    } finally {
      setSavingRequiredProfile(false);
    }
  };

  const openAnnouncements = async () => {
    const nextOpen = !showAnnouncements;
    setShowAnnouncements(nextOpen);
    if (!nextOpen || unreadAnnouncementIds.length === 0 || !currentUserId) return;

    setAnnouncements((current) => current.map((entry) => ({ ...entry, unread: false })));
    try {
      await fetch(`${API_URL}/api/announcements/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          announcementIds: unreadAnnouncementIds,
        }),
      });
    } catch {
      // Keep the UI optimistic; the next poll will reconcile if needed.
    }
  };

  return (
    <>
      <style>{`
        @keyframes gpaIn { from{opacity:0;transform:scale(0.96) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes gpaBg { from{opacity:0} to{opacity:1} }

        .gpa-overlay {
          position:fixed; inset:0; z-index:99999;
          background:rgba(0,0,0,0.78);
          backdrop-filter:blur(7px);
          display:flex; align-items:center; justify-content:center;
          padding:16px;
          animation:gpaBg 0.18s ease;
        }
        .gpa-modal {
          width:720px; max-width:100%;
          background:var(--panel);
          border:1px solid var(--border);
          border-radius:18px;
          overflow:hidden;
          display:flex; flex-direction:column;
          max-height:92vh;
          animation:gpaIn 0.26s cubic-bezier(0.34,1.3,0.64,1);
          box-shadow:0 40px 80px rgba(0,0,0,0.4);
        }
        .gpa-mhead {
          display:flex; align-items:center; justify-content:space-between;
          padding:16px 20px;
          border-bottom:1px solid var(--border);
          background:var(--panel2);
          flex-shrink:0;
        }
        .gpa-mhead-left { display:flex; align-items:center; gap:10px; }
        .gpa-mhead-icon {
          width:32px; height:32px; border-radius:8px;
          background:linear-gradient(
            135deg,
            var(--brand-primary),
            var(--brand-surface) 78%,
            var(--brand-highlight) 140%
          );
          color:var(--brand-contrast);
          display:flex; align-items:center; justify-content:center; font-size:18px; line-height:0;
          box-shadow:0 10px 22px rgba(var(--brand-primary-rgb),0.24);
        }
        .gpa-mhead-title { font-size:14px; font-weight:700; color:var(--text); }
        .gpa-mhead-sub { font-size:11px; color:var(--muted); margin-top:1px; }
        .gpa-mhead-close {
          width:28px; height:28px; border-radius:7px;
          background:transparent; border:1px solid var(--border);
          color:var(--muted); font-size:12px; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          transition:all 0.15s;
        }
        .gpa-mhead-close:hover { background:rgba(163,38,56,0.25); color:var(--text); border-color:rgba(163,38,56,0.4); }

        .gpa-body {
          display:grid; grid-template-columns:1fr 220px;
          flex:1; overflow:hidden; min-height:0;
        }
        .gpa-left {
          padding:16px 18px; overflow-y:auto;
          border-right:1px solid var(--border);
        }
        .gpa-left::-webkit-scrollbar { width:3px; }
        .gpa-left::-webkit-scrollbar-thumb { background:#A32638; border-radius:4px; }
        .gpa-left-title {
          font-size:10px; font-weight:700; color:var(--muted);
          text-transform:uppercase; letter-spacing:0.8px; margin-bottom:10px;
        }
        .gpa-col-heads {
          display:grid; grid-template-columns:1fr 80px 62px 26px;
          gap:6px; margin-bottom:6px; padding:0 2px;
        }
        .gpa-col-head { font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.6px; }
        .gpa-col-head.c { text-align:center; }

        .gpa-rows { display:flex; flex-direction:column; gap:5px; }
        .gpa-row {
          display:grid; grid-template-columns:1fr 80px 62px 26px;
          gap:6px; align-items:center;
          background:var(--bg);
          border:1px solid var(--border);
          border-radius:9px; padding:7px 9px; transition:border-color 0.15s;
        }
        .gpa-row:focus-within { border-color:rgba(163,38,56,0.45); }

        .gc-row {
          display:grid; grid-template-columns:1fr 80px 80px 26px;
          gap:6px; align-items:center;
          background:var(--bg);
          border:1px solid var(--border);
          border-radius:9px; padding:7px 9px;
          transition:border-color 0.15s;
          margin-bottom:5px;
        }
        .gc-row:focus-within { border-color:rgba(163,38,56,0.45); }

        .g-in {
          background:transparent; border:none;
          color:var(--text); font-size:12px; outline:none;
          width:100%; font-family:inherit;
        }
        .g-in::placeholder { color:var(--border); }

        .g-sel {
          background:var(--panel); border:1px solid var(--border);
          color:var(--text); border-radius:6px;
          padding:4px 4px; font-size:12px;
          cursor:pointer; outline:none; width:100%;
          font-family:inherit; transition:border-color 0.15s;
        }
        .g-sel:focus { border-color:rgba(163,38,56,0.5); }

        .g-num {
          background:var(--panel); border:1px solid var(--border);
          color:var(--text); border-radius:6px;
          padding:4px 5px; font-size:12px;
          outline:none; width:100%; font-family:inherit;
          transition:border-color 0.15s; text-align:center;
        }
        .g-num:focus { border-color:rgba(163,38,56,0.5); }

        .g-del {
          background:none; border:none; cursor:pointer; padding:0;
          color:var(--muted); font-size:13px;
          display:flex; align-items:center; justify-content:center;
          width:26px; height:28px; border-radius:5px; transition:all 0.15s; margin:0 auto;
        }
        .g-del:not(:disabled):hover { color:#ef4444; background:rgba(239,68,68,0.1); }
        .g-del:disabled { cursor:default; opacity:0.3; }

        .gpa-add {
          width:100%; margin-top:8px; padding:8px;
          background:transparent; border:1px dashed var(--border);
          color:var(--muted); border-radius:8px; cursor:pointer;
          font-size:12px; font-weight:600; font-family:inherit;
          transition:all 0.18s;
          display:flex; align-items:center; justify-content:center; gap:5px;
        }
        .gpa-add:hover { border-color:#A32638; color:#A32638; background:rgba(163,38,56,0.05); }

        .gpa-right {
          display:flex; flex-direction:column;
          padding:16px; background:var(--panel2); gap:12px;
        }
        .gpa-right-title { font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.8px; }

        .gpa-card {
          border-radius:12px; background:var(--panel);
          border:1px solid var(--border); overflow:hidden; flex-shrink:0;
        }
        .gpa-card-top { padding:14px 14px 10px; }
        .gpa-card-label { font-size:10px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:0.6px; }
        .gpa-card-number { font-size:54px; font-weight:800; line-height:1; letter-spacing:-4px; margin-top:4px; font-variant-numeric:tabular-nums; transition:color 0.3s; }
        .gpa-card-scale { font-size:11px; color:var(--muted); margin-top:2px; }
        .gpa-card-note { font-size:10px; color:var(--muted); line-height:1.4; margin-top:6px; }
        .gpa-card-bar { height:3px; background:var(--border); }
        .gpa-card-bar-fill { height:100%; transition:width 0.4s ease, background 0.3s; }
        .gpa-card-badge { padding:8px 14px; display:flex; align-items:center; gap:6px; }
        .gpa-badge-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
        .gpa-badge-text { font-size:12px; font-weight:700; }

        .gpa-stat-grid { display:flex; flex-direction:column; gap:6px; flex:1; }
        .gpa-stat-row {
          background:var(--panel); border:1px solid var(--border);
          border-radius:9px; padding:9px 12px;
          display:flex; align-items:center; justify-content:space-between;
        }
        .gpa-stat-lbl { font-size:11px; color:var(--muted); font-weight:600; }
        .gpa-stat-val { font-size:16px; font-weight:700; color:var(--text); }

        .gpa-footer {
          display:flex; gap:10px; padding:12px 18px;
          border-top:1px solid var(--border);
          background:var(--panel2); flex-shrink:0;
        }
        .gpa-btn-reset {
          padding:9px 20px; background:var(--panel); color:var(--muted);
          border:1px solid var(--border); border-radius:9px;
          cursor:pointer; font-size:13px; font-weight:600;
          font-family:inherit; transition:all 0.15s;
        }
        .gpa-btn-reset:hover { border-color:#A32638; color:var(--text); }
        .gpa-btn-done {
          flex:1; padding:9px;
          background:linear-gradient(135deg,#A32638,#6e1425);
          color:#fff; border:none; border-radius:9px;
          cursor:pointer; font-size:13px; font-weight:700;
          font-family:inherit; letter-spacing:0.3px;
          box-shadow:0 4px 14px rgba(163,38,56,0.4); transition:all 0.18s;
        }
        .gpa-btn-done:hover { box-shadow:0 6px 22px rgba(163,38,56,0.6); transform:translateY(-1px); }
        .gpa-btn-done:active { transform:translateY(0); }
        .gc-result {
          border-radius:12px;
          padding:14px;
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; flex-shrink:0;
          min-height:128px;
          overflow:hidden;
          transition:background 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
        }
        .gc-result-pct { font-size:28px; font-weight:800; letter-spacing:-1px; transition:color 0.24s ease; }
        .gc-result-lbl { font-size:10px; text-transform:uppercase; letter-spacing:0.6px; transition:color 0.24s ease; }
        .gc-result-state {
          display:inline-flex; align-items:center; gap:6px;
          border-radius:999px; padding:5px 10px; margin-top:9px;
          font-size:10px; font-weight:700; letter-spacing:0.35px;
          text-transform:uppercase; transition:all 0.24s ease;
        }
        .gc-result-gp { font-size:11px; margin-top:8px; transition:color 0.24s ease; }
        .gc-result-note { font-size:10px; line-height:1.35; margin-top:6px; max-width:180px; transition:color 0.24s ease; }
        .gc-result-letter {
          font-size:36px; font-weight:800;
          border-radius:10px; padding:4px 16px;
          transition:all 0.24s ease;
        }
        .gc-warn { font-size:11px; color:#ef4444; margin-top:6px; }
      `}</style>

      <header className="topNav">
        <div className="topNav__brand">
          <button
            type="button"
            className="topNav__brandButton"
            onClick={refreshApp}
            title={`Refresh ${appName}`}
            aria-label={`Refresh ${appName}`}
          >
            <span className="topNav__logoFrame" aria-hidden="true">
              <TermerMark className="topNav__logoImage" decorative />
            </span>
            <span className="topNav__brandText">{appName}</span>
          </button>
        </div>

        <nav className="topNav__links" aria-label="Primary">
          <button
            type="button"
            className={`topNav__link topNav__linkButton${activePage === "home" ? " isActive" : ""}`}
            onClick={goHome}
          >
            Home
          </button>
          <button
            type="button"
            className={`topNav__link topNav__linkButton${activePage === "reviews" ? " isActive" : ""}`}
            onClick={() => navigate("/reviews")}
          >
            Reviews
          </button>
          <button
            type="button"
            className={`topNav__link topNav__linkButton${activePage === "previouses" ? " isActive" : ""}`}
            onClick={() => navigate("/previouses")}
          >
            Previouses
          </button>
          <button
            type="button"
            className={`topNav__link topNav__linkButton${activePage === "empty-classes" ? " isActive" : ""}`}
            onClick={() => navigate("/empty-classes")}
          >
            Empty Classes
          </button>
          <button
            type="button"
            className="topNav__link topNav__linkButton"
            onClick={openGpaCalculator}
          >
            GPA Calculator
          </button>
          <button
            type="button"
            className="topNav__link topNav__linkButton"
            onClick={openGradeCalculator}
          >
            Grade Calculator
          </button>
          {isAdmin && (
            <button
              type="button"
              className="topNav__link topNav__linkButton"
              style={{ cursor: "pointer", color: "#A32638", fontWeight: 700 }}
              onClick={() => navigate("/admin")}
            >
              Admin
            </button>
          )}
        </nav>

        <div className="topNav__status" title={`${semesterLabel} — ${catalogStatusText}`}>
          <div className="topNav__statusIcon" aria-hidden="true">
            <SyncRoundedIcon sx={{ fontSize: 16 }} />
          </div>
          <div className="topNav__statusCopy">
            <span className="topNav__statusLabel">Catalog sync</span>
            <span className="topNav__statusText">
              {catalogStatusText}
            </span>
          </div>
        </div>

        <div className="topNav__controls">
          <span className="topNav__controlLabel">School:</span>
          <select
            className="topNav__select"
            value={universityId}
            onChange={(e) => onUniversityChange(e.target.value as UniversityId)}
            aria-label="Change university"
          >
            {visibleUniversities.map((university) => (
              <option
                key={university.id}
                value={university.id}
                disabled={!canChangeUniversity && university.id !== visibleUniversityId}
              >
                {university.shortName}
              </option>
            ))}
          </select>

          <span className="topNav__controlLabel">Term:</span>
          <select
            className="topNav__select"
            value={semesterId}
            onChange={(e) => onSemesterChange(e.target.value)}
            aria-label="Change term"
            disabled={semesters.length === 0}
          >
            {semesters.length === 0 ? (
              <option value="">No terms available</option>
            ) : null}
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <button
            className="topNav__logout topNav__updatesButton"
            type="button"
            onClick={() => void openAnnouncements()}
            title="View updates"
          >
            Updates
            {updatesBadgeCount > 0 ? (
              <span className="topNav__updatesBadge">
                {updatesBadgeCount}
              </span>
            ) : null}
          </button>

          <button
            className="topNav__logout"
            type="button"
            onClick={toggleTheme}
            title="Toggle light/dark mode"
          >
            {lightMode ? "🌙" : "☀️"}
          </button>
          <button
            className="topNav__logout"
            type="button"
            onClick={async () => {
              clearLocalAdminSession();
              await supabase.auth.signOut();
              navigate("/login");
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {showAnnouncements && (
        <div className="gpa-overlay" onClick={() => setShowAnnouncements(false)}>
          <div
            className="gpa-modal updatesPanel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="gpa-mhead">
              <div className="gpa-mhead-left">
                <div className="gpa-mhead-icon" aria-hidden="true">
                  <NotificationsRoundedIcon sx={{ fontSize: 18 }} />
                </div>
                <div>
                  <div className="gpa-mhead-title">Updates</div>
                  <div className="gpa-mhead-sub">
                    {currentUserEmail || universityName}
                  </div>
                </div>
              </div>
              <button
                className="gpa-mhead-close"
                onClick={() => setShowAnnouncements(false)}
                aria-label="Close updates"
              >
                <CloseRoundedIcon sx={{ fontSize: 18 }} />
              </button>
            </div>

            <div className="updatesPanel__body">
              <section className="updatesPanel__hero">
                <div className="updatesPanel__heroGlow updatesPanel__heroGlow--primary" aria-hidden="true" />
                <div className="updatesPanel__heroGlow updatesPanel__heroGlow--secondary" aria-hidden="true" />
                <div className="updatesPanel__heroContent">
                  <div className="updatesPanel__heroKicker">Student updates</div>
                  <div className="updatesPanel__heroTitleRow">
                    <h3 className="updatesPanel__heroTitle">Stay in sync with your academic workspace.</h3>
                    <span className="updatesPanel__heroPill">
                      {updatesBadgeCount > 0 ? `${updatesBadgeCount} active` : "All clear"}
                    </span>
                  </div>
                  <p className="updatesPanel__heroText">
                    Required account steps and live notices are grouped here in the same visual language as the rest of your current university workspace.
                  </p>
                  <div className="updatesPanel__heroStatusRow">
                    <span className="updatesPanel__heroPill updatesPanel__heroPill--status">
                      Catalog sync
                    </span>
                    <span className="updatesPanel__heroStatusText">{catalogStatusText}</span>
                  </div>
                </div>
              </section>

              <div className="updatesPanel__stack">
              {requiredProfileIncomplete ? (
                <div className="updatesPanel__card updatesPanel__card--required">
                  <div className="updatesPanel__cardHead">
                    <div>
                      <div className="updatesPanel__eyebrow">Required profile step</div>
                      <div className="updatesPanel__cardTitle">
                      Complete your account name
                      </div>
                    </div>
                    <span className="updatesPanel__heroPill updatesPanel__heroPill--required">Required</span>
                  </div>
                  <div className="updatesPanel__cardText">
                      Enter your name and family name here. This required update will stay in your updates panel until both are saved.
                  </div>
                  <div className="updatesPanel__requiredFields">
                    <input
                      type="text"
                      value={profileFirstName}
                      onChange={(event) => {
                        setProfileFirstName(event.target.value);
                        setRequiredProfileError("");
                        setRequiredProfileSaved(false);
                      }}
                      placeholder="Name"
                      autoComplete="given-name"
                      className="updatesPanel__field"
                    />
                    <input
                      type="text"
                      value={profileFamilyName}
                      onChange={(event) => {
                        setProfileFamilyName(event.target.value);
                        setRequiredProfileError("");
                        setRequiredProfileSaved(false);
                      }}
                      placeholder="Family name"
                      autoComplete="family-name"
                      className="updatesPanel__field"
                    />
                  </div>
                  {requiredProfileError ? (
                    <div className="updatesPanel__status updatesPanel__status--error">
                      {requiredProfileError}
                    </div>
                  ) : null}
                  {requiredProfileSaved ? (
                    <div className="updatesPanel__status updatesPanel__status--success">
                      Your name is saved.
                    </div>
                  ) : null}
                  <div className="updatesPanel__actions">
                    <div className="updatesPanel__helper">
                      {loadingRequiredProfile ? "Loading saved name..." : "This notice clears automatically after both fields are saved."}
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveRequiredProfileNames()}
                      disabled={savingRequiredProfile || loadingRequiredProfile}
                      className="updatesPanel__save"
                    >
                      {savingRequiredProfile ? "Saving..." : "Save name"}
                    </button>
                  </div>
                </div>
              ) : null}

              {loadingAnnouncements && announcements.length === 0 ? (
                <div className="updatesPanel__empty">
                  Loading updates...
                </div>
              ) : announcements.length === 0 ? (
                <div className="updatesPanel__empty">
                  No updates for this account right now.
                </div>
              ) : (
                announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className={`updatesPanel__card${announcement.unread ? " updatesPanel__card--unread" : ""}`}
                  >
                    <div className="updatesPanel__cardHead">
                      <div>
                        {announcement.unread ? (
                          <div className="updatesPanel__eyebrow">Unread update</div>
                        ) : null}
                        <div className="updatesPanel__cardTitle">
                        {announcement.title}
                        </div>
                      </div>
                      <div className="updatesPanel__cardMeta">
                        {new Date(announcement.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="updatesPanel__cardText">
                      {announcement.message}
                    </div>
                    {announcement.ctaLabel && announcement.ctaUrl ? (
                      <div className="updatesPanel__ctaWrap">
                        <a
                          href={announcement.ctaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="updatesPanel__cta"
                        >
                          {announcement.ctaLabel}
                        </a>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GPA Calculator Modal ─────────────────────────────────── */}
      {showGpa && (
        <div className="gpa-overlay" onClick={() => setShowGpa(false)}>
          <div className="gpa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gpa-mhead">
              <div className="gpa-mhead-left">
                <div className="gpa-mhead-icon" aria-hidden="true">
                  <SchoolRoundedIcon fontSize="inherit" />
                </div>
                <div>
                  <div className="gpa-mhead-title">GPA Calculator</div>
                  <div className="gpa-mhead-sub">
                    {universityName}
                  </div>
                </div>
              </div>
              <button
                className="gpa-mhead-close"
                onClick={() => setShowGpa(false)}
              >
                ✕
              </button>
            </div>

            <div className="gpa-body">
              <div className="gpa-left">
                <div className="gpa-left-title">Courses</div>
                <div className="gpa-col-heads">
                  <span className="gpa-col-head">Course</span>
                  <span className="gpa-col-head c">Grade</span>
                  <span className="gpa-col-head c">Credits</span>
                  <span></span>
                </div>
                <div className="gpa-rows">
                  {rows.map((row, i) => (
                    <div key={i} className="gpa-row">
                      <input
                        type="text"
                        className="g-in"
                        placeholder={`Course ${i + 1}`}
                        value={row.course}
                        onChange={(e) => updateRow(i, "course", e.target.value)}
                      />
                      <select
                        key={`gpa-grade-${universityId}-${i}`}
                        className="g-sel"
                        value={row.grade}
                        onChange={(e) => updateRow(i, "grade", e.target.value)}
                      >
                        {gradingSystem.letterGrades.map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="g-num"
                        placeholder="Cr"
                        min="0"
                        max="6"
                        value={row.credits}
                        onChange={(e) =>
                          updateRow(i, "credits", e.target.value)
                        }
                      />
                      <button
                        className="g-del"
                        onClick={() => removeRow(i)}
                        disabled={rows.length <= 1}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button className="gpa-add" onClick={addRow}>
                  <span style={{ fontSize: "15px" }}>+</span> Add Course
                </button>
              </div>

              <div className="gpa-right">
                <div className="gpa-right-title">Live Summary</div>
                <div className="gpa-card">
                  <div className="gpa-card-top">
                    <div className="gpa-card-label">Your GPA</div>
                    <div
                      className="gpa-card-number"
                      style={{ color: gpaColor }}
                    >
                      {gpa ?? "—"}
                    </div>
                    <div className="gpa-card-scale">out of {gpaScale.toFixed(2)}</div>
                    {gradingSystem.gpaNote ? (
                      <div className="gpa-card-note">{gradingSystem.gpaNote}</div>
                    ) : null}
                  </div>
                  <div className="gpa-card-bar">
                    <div
                      className="gpa-card-bar-fill"
                      style={{ width: `${gpaPercent}%`, background: gpaColor }}
                    />
                  </div>
                  <div
                    className="gpa-card-badge"
                    style={{ background: `${gpaColor}18` }}
                  >
                    <div
                      className="gpa-badge-dot"
                      style={{ background: gpaColor }}
                    />
                    <span
                      className="gpa-badge-text"
                      style={{ color: gpaColor }}
                    >
                      {gpaLabel}
                    </span>
                  </div>
                </div>
                <div className="gpa-stat-grid">
                  <div className="gpa-stat-row">
                    <span className="gpa-stat-lbl">Courses</span>
                    <span className="gpa-stat-val">{activeCourses || "—"}</span>
                  </div>
                  <div className="gpa-stat-row">
                    <span className="gpa-stat-lbl">Total Credits</span>
                    <span className="gpa-stat-val">{totalCredits || "—"}</span>
                  </div>
                  <div className="gpa-stat-row">
                    <span className="gpa-stat-lbl">Scale</span>
                    <span className="gpa-stat-val">{gpaScale.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="gpa-footer">
              <button className="gpa-btn-reset" onClick={resetRows}>
                Reset
              </button>
              <button
                className="gpa-btn-done"
                onClick={() => setShowGpa(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grade Calculator Modal ───────────────────────────────── */}
      {showGrade && (
        <div className="gpa-overlay" onClick={() => setShowGrade(false)}>
          <div className="gpa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gpa-mhead">
              <div className="gpa-mhead-left">
                <div className="gpa-mhead-icon" aria-hidden="true">
                  <CalculateRoundedIcon fontSize="inherit" />
                </div>
                <div>
                  <div className="gpa-mhead-title">Grade Calculator</div>
                  <div className="gpa-mhead-sub">
                    {universityName}
                  </div>
                </div>
              </div>
              <button
                className="gpa-mhead-close"
                onClick={() => setShowGrade(false)}
              >
                ✕
              </button>
            </div>

            <div className="gpa-body">
              <div className="gpa-left">
                <div className="gpa-left-title">Components</div>
                <div
                  className="gpa-col-heads"
                  style={{ gridTemplateColumns: "1fr 80px 80px 26px" }}
                >
                  <span className="gpa-col-head">Name</span>
                  <span className="gpa-col-head c">Weight %</span>
                  <span className="gpa-col-head c">Score %</span>
                  <span></span>
                </div>
                <div className="gpa-rows">
                  {gradeRows.map((r) => (
                    <div key={r.id} className="gc-row">
                      <input
                        type="text"
                        className="g-in"
                        placeholder="e.g. Midterm"
                        value={r.name}
                        onChange={(e) =>
                          updateGradeRow(r.id, "name", e.target.value)
                        }
                      />
                      <input
                        type="number"
                        className="g-num"
                        placeholder="%"
                        min={0}
                        max={100}
                        step={1}
                        value={r.weight}
                        onChange={(e) =>
                          updateGradeRow(r.id, "weight", e.target.value)
                        }
                      />
                      <input
                        type="number"
                        className="g-num"
                        placeholder="%"
                        min={0}
                        max={100}
                        step={0.1}
                        value={r.score}
                        onChange={(e) =>
                          updateGradeRow(r.id, "score", e.target.value)
                        }
                      />
                      <button
                        className="g-del"
                        onClick={() => removeGradeRow(r.id)}
                        disabled={gradeRows.length <= 1}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {Math.abs(totalWeight - 100) > 0.01 &&
                  gradeRows.some((r) => r.weight !== 0) && (
                    <div className="gc-warn">
                      Weights sum to {totalWeight.toFixed(1)}% — must equal 100%
                    </div>
                  )}

                <button className="gpa-add" onClick={addGradeRow}>
                  <span style={{ fontSize: "15px" }}>+</span> Add Component
                </button>
              </div>

              <div className="gpa-right">
                <div className="gpa-right-title">Live Result</div>

                {finalPct !== null ? (
                  <div className="gc-result" style={gradeResultStyle}>
                    <div>
                      <div
                        className="gc-result-lbl"
                        style={{ color: finalGradeTone.muted }}
                      >
                        Final grade
                      </div>
                      <div
                        className="gc-result-pct"
                        style={{ color: finalGradeTone.title }}
                      >
                        {isPartial ? "~" : ""}
                        {finalPct.toFixed(1)}%
                      </div>
                      <div
                        className="gc-result-state"
                        style={gradeResultStateStyle}
                      >
                        {finalGradeTone.label}
                      </div>
                      {finalGp !== null ? (
                        <div
                          className="gc-result-gp"
                          style={{ color: finalGradeTone.muted }}
                        >
                          GPA pts: {finalGp.toFixed(2)}
                          {isPartial ? " (partial)" : ""}
                        </div>
                      ) : null}
                      {finalLetterNote ? (
                        <div
                          className="gc-result-note"
                          style={{ color: finalGradeTone.muted }}
                        >
                          {finalLetterNote}
                        </div>
                      ) : !finalLetter && gradingSystem.percentScaleNote ? (
                        <div
                          className="gc-result-note"
                          style={{ color: finalGradeTone.muted }}
                        >
                          {gradingSystem.percentScaleNote}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className="gc-result-letter"
                      style={gradeResultLetterStyle}
                    >
                      {finalLetter ?? "N/A"}
                    </div>
                  </div>
                ) : (
                  <div className="gpa-card" style={{ padding: "14px" }}>
                    <div className="gpa-card-label">Final grade</div>
                    <div
                      className="gpa-card-number"
                      style={{ color: "#334155", fontSize: "40px" }}
                    >
                      —
                    </div>
                    <div className="gpa-card-scale">
                      Enter scores to calculate
                    </div>
                  </div>
                )}

                <div className="gpa-stat-grid">
                  <div className="gpa-stat-row">
                    <span className="gpa-stat-lbl">Components</span>
                    <span className="gpa-stat-val">{gradeRows.length}</span>
                  </div>
                  <div className="gpa-stat-row">
                    <span className="gpa-stat-lbl">Weight used</span>
                    <span
                      className="gpa-stat-val"
                      style={{
                        color:
                          Math.abs(totalWeight - 100) > 0.01
                            ? "#ef4444"
                            : "#94a3b8",
                      }}
                    >
                      {totalWeight.toFixed(0)}%
                    </span>
                  </div>
                  <div className="gpa-stat-row">
                    <span className="gpa-stat-lbl">Letter grade</span>
                    <span
                      className="gpa-stat-val"
                      style={{ color: letterColor }}
                    >
                      {finalLetter ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="gpa-footer">
              <button
                className="gpa-btn-reset"
                onClick={() => setGradeRows(defaultGradeRows())}
              >
                Reset
              </button>
              <button
                className="gpa-btn-done"
                onClick={() => setShowGrade(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
