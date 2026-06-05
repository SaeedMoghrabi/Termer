import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_ROOT as API } from "../config/runtime.ts";
import {
  getUniversityById,
  UNIVERSITY_OPTIONS,
  type UniversityId,
  type UniversityOption,
} from "../config/universities.ts";
import { fetchCatalogBootstrap, fetchTerms, fetchUniversities } from "../utils/catalogApi.ts";
import { getStoredTermId, getStoredUniversityId, setStoredTermId, setStoredUniversityId } from "../utils/plannerPreferences.ts";
import {
  hasMatchingPreviousUploadTask,
  startPreviousUploadTask,
  subscribePreviousUploadTasks,
  type PreviousUploadTask,
} from "../utils/backgroundPreviousUploads.ts";
import { TopNav } from "../components/TopNav.tsx";
import { useSessionAccess } from "../hooks/useSessionAccess.ts";

type PreviousesTerm = {
  id: string;
  label: string;
  isCurrent?: boolean;
};

type CourseSearchResult = {
  department: string;
  course_number: string;
  title: string;
  university_id?: string;
};

type PreviousDocument = {
  id: string;
  universityId: string;
  courseCode: string;
  courseTitle: string;
  documentTitle: string;
  documentKind: string;
  examTermLabel?: string;
  note?: string;
  originalFileName: string;
  createdAt: string;
  status: "approved" | "pending" | "rejected" | "failed";
  aiConfidence: number;
  aiReason?: string;
  adminComment?: string;
  extractedTextPreview?: string;
  previewUrl?: string;
  fileUrl?: string;
  sourcePages?: number;
  isOwnUpload?: boolean;
  isUnlocked?: boolean;
  canViewFull?: boolean;
  requiresContribution?: boolean;
  unlockCreditsRemaining?: number;
  isBackgroundTask?: boolean;
};

type PreviousStats = {
  approvedUploadCount: number;
  pendingUploadCount: number;
  rejectedUploadCount: number;
  unlockCount: number;
  unlockCredits: number;
};

const cardStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  boxShadow: "0 18px 50px rgba(0,0,0,0.16)",
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function formatDateTime(value?: string) {
  const date = new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return value ?? "Unknown";
  return date.toLocaleString();
}

function resolvePreferredTermId(universityId: string, terms: PreviousesTerm[], currentId: string) {
  if (currentId && terms.some((term) => term.id === currentId)) return currentId;
  const stored = getStoredTermId(universityId);
  if (stored && terms.some((term) => term.id === stored)) return stored;
  return terms.find((term) => term.isCurrent)?.id ?? terms[0]?.id ?? "";
}

function tokenizePreviousCourseSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildPreviousCourseIndex(universityId: string, rawCourses: any[]) {
  const courseMap = new Map<string, CourseSearchResult>();

  for (const rawCourse of Array.isArray(rawCourses) ? rawCourses : []) {
    const department = normalizeText(rawCourse?.department ?? rawCourse?.subject).toUpperCase();
    const courseNumber = normalizeText(rawCourse?.course_number ?? rawCourse?.courseNumber).toUpperCase();
    const title = normalizeText(rawCourse?.title ?? rawCourse?.courseTitle);

    if (!department || !courseNumber) continue;

    const courseKey = `${department}::${courseNumber}`;
    if (courseMap.has(courseKey)) continue;

    courseMap.set(courseKey, {
      department,
      course_number: courseNumber,
      title: title || "Untitled course",
      university_id: universityId,
    });
  }

  return Array.from(courseMap.values()).sort((a, b) =>
    `${a.department} ${a.course_number}`.localeCompare(`${b.department} ${b.course_number}`),
  );
}

function StatTile({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "var(--text)", marginTop: 8 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        {hint}
      </div>
    </div>
  );
}

export default function Previouses() {
  const navigate = useNavigate();
  const { canChooseAnyUniversity, lockedUniversityId, userId, userEmail } = useSessionAccess();

  const [universities, setUniversities] = useState<UniversityOption[]>(UNIVERSITY_OPTIONS);
  const [universityId, setUniversityId] = useState(getStoredUniversityId());
  const [semesters, setSemesters] = useState<PreviousesTerm[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [courseResults, setCourseResults] = useState<CourseSearchResult[]>([]);
  const [searchableCourses, setSearchableCourses] = useState<CourseSearchResult[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseSearchResult | null>(null);
  const [documents, setDocuments] = useState<PreviousDocument[]>([]);
  const [backgroundUploadTasks, setBackgroundUploadTasks] = useState<PreviousUploadTask[]>([]);
  const [stats, setStats] = useState<PreviousStats>({
    approvedUploadCount: 0,
    pendingUploadCount: 0,
    rejectedUploadCount: 0,
    unlockCount: 0,
    unlockCredits: 0,
  });
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentKind, setDocumentKind] = useState("Midterm");
  const [examTermLabel, setExamTermLabel] = useState("");
  const [note, setNote] = useState("");

  const currentUniversity = useMemo(
    () => universities.find((entry) => entry.id === universityId) ?? getUniversityById(universityId),
    [universities, universityId],
  );
  const semesterLabel = useMemo(
    () => semesters.find((term) => term.id === semesterId)?.label ?? "Previouses",
    [semesterId, semesters],
  );
  const lastUpdatedText = useMemo(
    () => selectedCourse
      ? `Viewing ${selectedCourse.department} ${selectedCourse.course_number} previouses`
      : currentUniversity.note,
    [currentUniversity.note, selectedCourse],
  );
  const uploadButtonDisabled = !selectedCourse || !selectedFile || uploading || !userId;

  const handleUniversityChange = useCallback((nextUniversityId: UniversityId) => {
    const resolvedUniversityId = !canChooseAnyUniversity && lockedUniversityId
      ? lockedUniversityId
      : getUniversityById(nextUniversityId).id;
    setStoredUniversityId(resolvedUniversityId);
    setUniversityId((current) => current === resolvedUniversityId ? current : resolvedUniversityId);
    setSelectedCourse(null);
    setCourseResults([]);
    setDocuments([]);
    setCourseSearch("");
  }, [canChooseAnyUniversity, lockedUniversityId]);

  useEffect(() => {
    if (!lockedUniversityId || canChooseAnyUniversity) return;
    handleUniversityChange(lockedUniversityId);
  }, [canChooseAnyUniversity, handleUniversityChange, lockedUniversityId]);

  useEffect(() => {
    fetchUniversities()
      .then((data) => setUniversities(Array.isArray(data) && data.length ? data : UNIVERSITY_OPTIONS))
      .catch(() => setUniversities(UNIVERSITY_OPTIONS));
  }, []);

  useEffect(() => {
    fetchTerms(universityId)
      .then((data) => {
        const nextTerms: PreviousesTerm[] = Array.isArray(data)
          ? data.map((term: { code: string; description: string; is_current?: boolean }) => ({
              id: term.code,
              label: term.description,
              isCurrent: Boolean(term.is_current),
            }))
          : [];
        setSemesters(nextTerms);
        setSemesterId((current) => resolvePreferredTermId(universityId, nextTerms, current));
      })
      .catch(() => {
        setSemesters([]);
        setSemesterId("");
      });
  }, [universityId]);

  useEffect(() => {
    if (!semesterId) return;
    setStoredTermId(universityId, semesterId);
  }, [semesterId, universityId]);

  useEffect(() => {
    if (!semesterId) {
      setSearchableCourses([]);
      setLoadingSearch(false);
      return;
    }

    let cancelled = false;
    setLoadingSearch(true);

    fetchCatalogBootstrap(universityId, semesterId)
      .then((payload) => {
        if (cancelled) return;
        setSearchableCourses(buildPreviousCourseIndex(universityId, payload?.courses ?? []));
      })
      .catch(() => {
        if (cancelled) return;
        setSearchableCourses([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSearch(false);
      });

    return () => {
      cancelled = true;
    };
  }, [semesterId, universityId]);

  useEffect(() => {
    const query = courseSearch.trim();
    if (query.length < 2) {
      setCourseResults([]);
      return;
    }

    const normalizedSearch = tokenizePreviousCourseSearch(query);
    const compactSearch = normalizedSearch.replace(/\s+/g, "");
    const nextResults = searchableCourses.filter((course) => {
      const code = `${course.department} ${course.course_number}`.toLowerCase();
      const haystack = [code, `${course.department}${course.course_number}`, course.title]
        .join(" ")
        .toLowerCase();
      const compactHaystack = haystack.replace(/\s+/g, "");
      return haystack.includes(normalizedSearch) || compactHaystack.includes(compactSearch);
    }).slice(0, 10);

    setCourseResults(nextResults);
  }, [courseSearch, searchableCourses]);

  const loadPreviouses = useCallback((course: CourseSearchResult | null) => {
    if (!course) {
      setDocuments([]);
      return;
    }

    setLoadingDocuments(true);
    const courseCode = `${course.department} ${course.course_number}`;
    const query = new URLSearchParams({
      universityId,
      courseCode,
      userId: userId ?? "",
    });

    fetch(`${API}/api/previouses?${query.toString()}`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data) => {
        setDocuments(Array.isArray(data?.documents) ? data.documents : []);
        if (data?.stats) {
          setStats({
            approvedUploadCount: Number(data.stats.approvedUploadCount ?? 0) || 0,
            pendingUploadCount: Number(data.stats.pendingUploadCount ?? 0) || 0,
            rejectedUploadCount: Number(data.stats.rejectedUploadCount ?? 0) || 0,
            unlockCount: Number(data.stats.unlockCount ?? 0) || 0,
            unlockCredits: Number(data.stats.unlockCredits ?? 0) || 0,
          });
        }
      })
      .catch(() => {
        setDocuments([]);
        setMessage({ ok: false, text: "Could not load previouses for that course." });
      })
      .finally(() => setLoadingDocuments(false));
  }, [universityId, userId]);

  useEffect(() => {
    void loadPreviouses(selectedCourse);
  }, [loadPreviouses, selectedCourse]);

  useEffect(() => subscribePreviousUploadTasks(setBackgroundUploadTasks), []);

  useEffect(() => {
    if (!selectedCourse || !userId) return undefined;

    const courseCode = `${selectedCourse.department} ${selectedCourse.course_number}`;
    let lastSignature = "";
    let refreshTimer = 0;

    const unsubscribe = subscribePreviousUploadTasks((tasks) => {
      const matchingTasks = tasks.filter((task) =>
        hasMatchingPreviousUploadTask(task, userId, universityId, courseCode),
      );

      const nextSignature = matchingTasks
        .map((task) => `${task.id}:${task.status}:${task.reviewStatus ?? ""}:${task.documentId ?? ""}`)
        .join("|");

      if (!nextSignature || nextSignature === lastSignature) return;
      lastSignature = nextSignature;

      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        void loadPreviouses(selectedCourse);
      }, 500);
    });

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      unsubscribe();
    };
  }, [loadPreviouses, selectedCourse, universityId, userId]);

  const visibleDocuments = useMemo(() => {
    const existingIds = new Set(documents.map((document) => normalizeText(document.id)));
    const selectedCourseCode = selectedCourse
      ? `${selectedCourse.department} ${selectedCourse.course_number}`
      : "";

    const taskDocuments = backgroundUploadTasks
      .filter((task) =>
        selectedCourse
        && userId
        && hasMatchingPreviousUploadTask(task, userId, universityId, selectedCourseCode),
      )
      .filter((task) => !task.documentId || !existingIds.has(normalizeText(task.documentId)))
      .map((task) => {
        const mappedStatus: PreviousDocument["status"] =
          task.status === "failed"
            ? "failed"
            : task.status === "completed"
              ? task.reviewStatus === "approved"
                ? "approved"
                : task.reviewStatus === "rejected"
                  ? "rejected"
                  : "pending"
              : "pending";

        return {
          id: normalizeText(task.documentId) || task.id,
          universityId: task.universityId,
          courseCode: task.courseCode,
          courseTitle: task.courseTitle,
          documentTitle: task.documentTitle,
          documentKind: "Previous",
          originalFileName: task.fileName,
          createdAt: task.createdAt,
          status: mappedStatus,
          aiConfidence: 0,
          aiReason: task.message,
          extractedTextPreview:
            task.status === "failed"
              ? "This upload did not finish successfully. You can try uploading the file again."
              : "This upload is still being processed in the background. You can keep using Termer and come back here while the review finishes.",
          previewUrl: "",
          fileUrl: "",
          isOwnUpload: true,
          isUnlocked: false,
          canViewFull: false,
          requiresContribution: false,
          unlockCreditsRemaining: stats.unlockCredits,
          isBackgroundTask: true,
        } as PreviousDocument;
      });

    return [...taskDocuments, ...documents].sort((left, right) =>
      String(right.createdAt || "").localeCompare(String(left.createdAt || "")),
    );
  }, [backgroundUploadTasks, documents, selectedCourse, stats.unlockCredits, universityId, userId]);

  const handleSelectCourse = (course: CourseSearchResult) => {
    setSelectedCourse(course);
    setCourseSearch(`${course.department} ${course.course_number}`);
    setCourseResults([]);
    setDocumentTitle("");
    setExamTermLabel("");
    setNote("");
  };

  const handleUpload = async () => {
    if (!selectedCourse || !selectedFile || !userId || !userEmail) {
      setMessage({ ok: false, text: "Choose a course, sign in, and attach a file first." });
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      startPreviousUploadTask({
        userId,
        userEmail,
        universityId,
        courseCode: `${selectedCourse.department} ${selectedCourse.course_number}`,
        courseTitle: selectedCourse.title,
        documentTitle: documentTitle || selectedFile.name.replace(/\.[^.]+$/, ""),
        documentKind,
        examTermLabel,
        note,
        file: selectedFile,
      });

      setSelectedFile(null);
      setDocumentTitle("");
      setExamTermLabel("");
      setNote("");
      setMessage({
        ok: true,
        text: "Background upload started. You can leave Previouses and keep using the rest of Termer while the file uploads and review finishes.",
      });
      window.setTimeout(() => {
        void loadPreviouses(selectedCourse);
      }, 500);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not start that upload." });
    } finally {
      setUploading(false);
    }
  };

  const handleUnlock = async (documentId: string) => {
    if (!userId) return;
    const response = await fetch(`${API}/api/previouses/${encodeURIComponent(documentId)}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      setMessage({ ok: false, text: data?.error || "Could not unlock that previous." });
      return;
    }
    setMessage({ ok: true, text: "Full previous unlocked successfully." });
    void loadPreviouses(selectedCourse);
  };

  return (
    <div className="reviewsShell previousesPage" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <TopNav
        appName="Termer"
        universityName={currentUniversity.name}
        universityId={universityId}
        universities={universities}
        semesterLabel={semesterLabel}
        semesterId={semesterId}
        semesters={semesters}
        lastUpdatedText={lastUpdatedText}
        onUniversityChange={handleUniversityChange}
        onSemesterChange={setSemesterId}
        scheduledCourses={[]}
        activePage="previouses"
        canChangeUniversity={canChooseAnyUniversity}
      />

      <main className="previousesPage__main" style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 48px" }}>
        <section className="previousesPage__hero" style={{ ...cardStyle, padding: 24, display: "grid", gap: 22 }}>
          <div className="previousesPage__heroTop" style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Controlled document exchange
              </div>
              <h1 style={{ margin: "8px 0 0", fontSize: 32, lineHeight: 1.05 }}>Previouses</h1>
              <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--muted)", maxWidth: 760, lineHeight: 1.7 }}>
                Browse approved previous exams for your courses. Students can preview part of each file for free,
                while full access unlocks after an AI-approved contribution so the library stays useful and verified.
              </p>
            </div>
            <button
              className="previousesPage__backButton"
              type="button"
              onClick={() => navigate("/")}
              style={{
                alignSelf: "flex-start",
                background: "var(--panel2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Back to Planner
            </button>
          </div>

          <div className="previousesPage__stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <StatTile label="Unlock credits" value={stats.unlockCredits} hint="Earn one per approved upload." />
            <StatTile label="Approved uploads" value={stats.approvedUploadCount} hint="These contributions count toward access." />
            <StatTile label="Pending review" value={stats.pendingUploadCount} hint="The AI is still screening or waiting for admin review." />
            <StatTile label="Unlocked files" value={stats.unlockCount} hint="Full previouses already opened by this account." />
          </div>

          <div className="previousesPage__search" style={{ display: "grid", gap: 8 }}>
            <input
              className="previousesPage__searchInput"
              value={courseSearch}
              onChange={(event) => {
                setCourseSearch(event.target.value);
                if (!event.target.value.trim()) {
                  setSelectedCourse(null);
                  setDocuments([]);
                }
              }}
              placeholder="Search your course code or title"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "var(--panel2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                borderRadius: 14,
                padding: "14px 16px",
                fontSize: 15,
                outline: "none",
              }}
            />
            {loadingSearch ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Searching courses...</div>
            ) : null}
            {courseResults.length > 0 ? (
              <div className="previousesPage__searchResults" style={{ ...cardStyle, overflow: "hidden" }}>
                {courseResults.slice(0, 10).map((course) => (
                  <button
                    key={`${course.department}-${course.course_number}`}
                    type="button"
                    onClick={() => handleSelectCourse(course)}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      textAlign: "left",
                      color: "var(--text)",
                      padding: "12px 16px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{course.department} {course.course_number}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{course.title}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="previousesPage__contentGrid" style={{ marginTop: 22, display: "grid", gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)", gap: 20 }}>
            <div className="previousesPage__uploadCard" style={{ ...cardStyle, padding: 20, alignSelf: "start" }}>
              {!selectedCourse ? (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(var(--brand-primary-rgb), 0.18)",
                    background: "linear-gradient(180deg, rgba(var(--brand-primary-rgb), 0.10), rgba(255,255,255,0.02))",
                    fontSize: 13,
                    color: "var(--muted)",
                    lineHeight: 1.65,
                  }}
                >
                  Search and select a course above first. The upload form stays here so you can always see where to contribute a previous.
                </div>
              ) : null}
              <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Upload a previous
              </div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>
                {selectedCourse
                  ? `${selectedCourse.department} ${selectedCourse.course_number}`
                  : "Choose a course first"}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                {selectedCourse
                  ? selectedCourse.title
                  : "Once you pick a course from the search box above, you can upload a PDF or image previous here."}
              </div>

              <div className="previousesPage__uploadForm" style={{ display: "grid", gap: 10, marginTop: 18 }}>
                <input
                  className="previousesPage__field"
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                  placeholder="Document title (e.g. Final 2025 - Group A)"
                  disabled={!selectedCourse}
                  style={{ width: "100%", boxSizing: "border-box", background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 12, padding: "11px 12px", fontSize: 13 }}
                />
                <select
                  className="previousesPage__field"
                  value={documentKind}
                  onChange={(event) => setDocumentKind(event.target.value)}
                  disabled={!selectedCourse}
                  style={{ width: "100%", boxSizing: "border-box", background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 12, padding: "11px 12px", fontSize: 13 }}
                >
                  <option>Midterm</option>
                  <option>Final</option>
                  <option>Quiz</option>
                  <option>Practical</option>
                  <option>Previous</option>
                </select>
                <input
                  className="previousesPage__field"
                  value={examTermLabel}
                  onChange={(event) => setExamTermLabel(event.target.value)}
                  placeholder="Exam term / year (e.g. Spring 2025-2026)"
                  disabled={!selectedCourse}
                  style={{ width: "100%", boxSizing: "border-box", background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 12, padding: "11px 12px", fontSize: 13 }}
                />
                <textarea
                  className="previousesPage__field previousesPage__textarea"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional note about the version, language, or professor"
                  rows={3}
                  disabled={!selectedCourse}
                  style={{ width: "100%", boxSizing: "border-box", background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 12, padding: "11px 12px", fontSize: 13, resize: "vertical" }}
                />
                <label className="previousesPage__fileField" style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>PDF or image</span>
                  <input
                    className="previousesPage__fileInput"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    disabled={!selectedCourse}
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {selectedFile ? (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Ready to upload: <strong style={{ color: "var(--text)" }}>{selectedFile.name}</strong>
                  </div>
                ) : null}
                <button
                  className="previousesPage__uploadButton"
                  type="button"
                  disabled={uploadButtonDisabled}
                  onClick={handleUpload}
                  style={{
                    background: "linear-gradient(135deg, var(--brand-primary), var(--brand-surface))",
                    color: "var(--brand-contrast)",
                    border: "1px solid rgba(var(--brand-primary-rgb),0.18)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    fontWeight: 800,
                    cursor: uploadButtonDisabled ? "not-allowed" : "pointer",
                    opacity: uploadButtonDisabled ? 0.7 : 1,
                  }}
                >
                  {uploading
                    ? "Starting..."
                    : !selectedCourse
                      ? "Select a course to upload"
                      : "Upload previous"}
                </button>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.65 }}>
                  Uploads now continue in the background. You can leave this section, keep using Termer, and the status popup will stay with you until review finishes.
                </div>
                {message ? (
                  <div style={{ fontSize: 13, color: message.ok ? "#34d399" : "#fca5a5", lineHeight: 1.6 }}>
                    {message.text}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="previousesPage__libraryColumn" style={{ display: "grid", gap: 16 }}>
              <div className="previousesPage__libraryHeader" style={{ ...cardStyle, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                      Approved library
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>
                      {selectedCourse
                        ? `${selectedCourse.department} ${selectedCourse.course_number} previouses`
                        : "Search above to open a course library"}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                      {selectedCourse
                        ? "Students can preview the top section free. Full files unlock after contribution."
                        : "Pick a course to browse its approved previouses, preview pages, and unlock full files."}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {selectedCourse
                      ? loadingDocuments
                        ? "Refreshing..."
                        : `${visibleDocuments.length} document${visibleDocuments.length === 1 ? "" : "s"}`
                      : "No course selected yet"}
                  </div>
                </div>
              </div>

              {!selectedCourse ? (
                <div className="previousesPage__emptyLibrary" style={{ ...cardStyle, padding: 22, fontSize: 14, color: "var(--muted)" }}>
                  Search for a course above, choose it from the dropdown, and this library will load all approved previouses for that course.
                </div>
              ) : visibleDocuments.length === 0 && !loadingDocuments ? (
                <div className="previousesPage__emptyLibrary" style={{ ...cardStyle, padding: 22, fontSize: 14, color: "var(--muted)" }}>
                  No previouses are approved for this course yet. Upload the first one and the AI will screen it.
                </div>
              ) : null}

              {selectedCourse ? visibleDocuments.map((document) => (
                <article key={document.id} className="previousesPage__document" style={{ ...cardStyle, overflow: "hidden" }}>
                  <div className="previousesPage__documentGrid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 320px) minmax(0, 1fr)", gap: 0 }}>
                    <div className="previousesPage__previewPane" style={{ position: "relative", minHeight: 260, background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", borderRight: "1px solid var(--border)" }}>
                      {document.previewUrl ? (
                        <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
                          <img
                            src={`${API}${document.previewUrl}`}
                            alt={document.documentTitle || document.originalFileName}
                            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
                          />
                          {!document.canViewFull ? (
                            <>
                              <div
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  height: "58%",
                                  background: "linear-gradient(180deg, rgba(6,12,18,0) 0%, rgba(6,12,18,0.84) 44%, rgba(6,12,18,0.95) 100%)",
                                  backdropFilter: "blur(10px)",
                                }}
                              />
                              <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, zIndex: 2 }}>
                                <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 800, lineHeight: 1.5 }}>
                                  Preview only
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(248,250,252,0.8)", marginTop: 6, lineHeight: 1.55 }}>
                                  Upload and get an approved previous to unlock the full file.
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ padding: 18, fontSize: 13, color: "var(--muted)" }}>
                          {document.isBackgroundTask
                            ? "Termer is still uploading or reviewing this file in the background."
                            : "Preview image is not available for this file yet."}
                        </div>
                      )}
                    </div>

                    <div className="previousesPage__documentBody" style={{ padding: 18, display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                            {document.documentKind || "Previous"}
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>
                            {document.documentTitle || document.originalFileName}
                          </div>
                          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
                            {document.examTermLabel || "Term not specified"} · {formatDateTime(document.createdAt)}
                          </div>
                        </div>
                        <span
                          style={{
                            alignSelf: "flex-start",
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: document.status === "approved" ? "rgba(34,197,94,0.14)" : document.status === "pending" ? "rgba(245,158,11,0.14)" : "rgba(239,68,68,0.14)",
                            color: document.status === "approved" ? "#86efac" : document.status === "pending" ? "#fcd34d" : "#fca5a5",
                            border: `1px solid ${document.status === "approved" ? "rgba(34,197,94,0.28)" : document.status === "pending" ? "rgba(245,158,11,0.28)" : "rgba(239,68,68,0.28)"}`,
                            fontSize: 12,
                            fontWeight: 800,
                            textTransform: "uppercase",
                          }}
                        >
                          {document.status}
                        </span>
                      </div>

                      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>
                        {document.extractedTextPreview || "No text preview is available yet for this upload."}
                      </div>

                      {document.note ? (
                        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                          Note: {document.note}
                        </div>
                      ) : null}

                      {document.aiReason && (document.isOwnUpload || canChooseAnyUniversity) ? (
                        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                          AI review: {document.aiReason}
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                        {document.canViewFull && document.fileUrl ? (
                          <a
                            href={`${API}${document.fileUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "10px 14px",
                              borderRadius: 12,
                              background: "linear-gradient(135deg, var(--brand-primary), var(--brand-surface))",
                              color: "var(--brand-contrast)",
                              textDecoration: "none",
                              fontSize: 13,
                              fontWeight: 800,
                            }}
                          >
                            Open full previous
                          </a>
                        ) : document.isBackgroundTask ? (
                          <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
                            {document.status === "failed"
                              ? "This upload failed before it reached the library."
                              : "This file will appear fully here once the upload and review finish."}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUnlock(document.id)}
                            disabled={Number(document.unlockCreditsRemaining ?? stats.unlockCredits) < 1}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 12,
                              background: "var(--panel2)",
                              color: "var(--text)",
                              border: "1px solid var(--border)",
                              cursor: Number(document.unlockCreditsRemaining ?? stats.unlockCredits) < 1 ? "not-allowed" : "pointer",
                              opacity: Number(document.unlockCreditsRemaining ?? stats.unlockCredits) < 1 ? 0.7 : 1,
                              fontSize: 13,
                              fontWeight: 800,
                            }}
                          >
                            Unlock with 1 credit
                          </button>
                        )}
                        {document.requiresContribution ? (
                          <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
                            {Number(document.unlockCreditsRemaining ?? stats.unlockCredits) > 0
                              ? `You have ${document.unlockCreditsRemaining ?? stats.unlockCredits} credit(s) ready.`
                              : "No unlock credits yet. Upload and get one approved previous first."}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              )) : null}
            </div>
          </section>
      </main>
    </div>
  );
}
