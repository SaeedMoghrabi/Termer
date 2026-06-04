import { API_ROOT as API } from "../config/runtime.ts";

export type PreviousUploadTaskStatus = "preparing" | "uploading" | "reviewing" | "completed" | "failed";
export type PreviousUploadReviewStatus = "approved" | "pending" | "rejected" | "processing";

export type PreviousUploadTask = {
  id: string;
  userId: string;
  userEmail: string;
  universityId: string;
  courseCode: string;
  courseTitle: string;
  documentTitle: string;
  fileName: string;
  status: PreviousUploadTaskStatus;
  reviewStatus?: PreviousUploadReviewStatus;
  message: string;
  documentId?: string;
  createdAt: string;
  updatedAt: string;
};

type PreviousUploadRequest = {
  userId: string;
  userEmail: string;
  universityId: string;
  courseCode: string;
  courseTitle: string;
  documentTitle: string;
  documentKind: string;
  examTermLabel: string;
  note: string;
  file: File;
};

type PreviousUploadResponseDocument = {
  id?: string;
  status?: "approved" | "pending" | "rejected";
  aiReason?: string;
  aiLabels?: string[];
};

type PreviousUploadResponse = {
  success?: boolean;
  document?: PreviousUploadResponseDocument;
  error?: string;
};

const STORAGE_KEY = "termer.previous-upload-tasks.v2";
const REVIEW_POLL_MS = 3200;
const AUTO_DISMISS_MS = 12000;
const UPLOAD_REQUEST_TIMEOUT_MS = 45000;

const listeners = new Set<(tasks: PreviousUploadTask[]) => void>();
const pollTimers = new Map<string, number>();
const dismissTimers = new Map<string, number>();

let tasks = restoreStoredTasks();

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function compactCourseCode(value: string) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function buildTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `previous-upload-${crypto.randomUUID()}`;
  }

  return `previous-upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createUploadAbortController() {
  if (typeof AbortController === "undefined") return null;
  return new AbortController();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function sortTasks(nextTasks: PreviousUploadTask[]) {
  return [...nextTasks].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt || "") || 0;
    const rightTime = Date.parse(right.updatedAt || right.createdAt || "") || 0;
    return rightTime - leftTime;
  });
}

function persistTasks() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Best effort only.
  }
}

function emitTasks() {
  const snapshot = sortTasks(tasks);
  persistTasks();
  listeners.forEach((listener) => listener(snapshot));
}

function scheduleDismiss(taskId: string) {
  if (typeof window === "undefined") return;

  const existing = dismissTimers.get(taskId);
  if (existing) window.clearTimeout(existing);

  const timerId = window.setTimeout(() => {
    dismissPreviousUploadTask(taskId);
  }, AUTO_DISMISS_MS);

  dismissTimers.set(taskId, timerId);
}

function clearPollTimer(taskId: string) {
  const pollTimer = pollTimers.get(taskId);
  if (pollTimer && typeof window !== "undefined") {
    window.clearTimeout(pollTimer);
  }
  pollTimers.delete(taskId);
}

function clearTaskTimers(taskId: string) {
  clearPollTimer(taskId);
  const dismissTimer = dismissTimers.get(taskId);
  if (dismissTimer && typeof window !== "undefined") {
    window.clearTimeout(dismissTimer);
  }
  dismissTimers.delete(taskId);
}

function upsertTask(task: PreviousUploadTask) {
  const existingIndex = tasks.findIndex((entry) => entry.id === task.id);
  if (existingIndex >= 0) {
    tasks = tasks.map((entry, index) => (index === existingIndex ? task : entry));
  } else {
    tasks = [task, ...tasks];
  }

  if (task.status === "completed" || task.status === "failed") {
    scheduleDismiss(task.id);
  }

  emitTasks();
}

function patchTask(taskId: string, patch: Partial<PreviousUploadTask>) {
  const currentTask = tasks.find((entry) => entry.id === taskId);
  if (!currentTask) return;

  const nextTask: PreviousUploadTask = {
    ...currentTask,
    ...patch,
    updatedAt: patch.updatedAt ?? nowIso(),
  };

  upsertTask(nextTask);
}

function restoreStoredTasks() {
  if (typeof window === "undefined") return [] as PreviousUploadTask[];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [] as PreviousUploadTask[];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as PreviousUploadTask[];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;

        const task: PreviousUploadTask = {
          id: normalizeText(entry.id),
          userId: normalizeText(entry.userId),
          userEmail: normalizeText(entry.userEmail),
          universityId: normalizeText(entry.universityId),
          courseCode: normalizeText(entry.courseCode),
          courseTitle: normalizeText(entry.courseTitle),
          documentTitle: normalizeText(entry.documentTitle),
          fileName: normalizeText(entry.fileName),
          status: ["preparing", "uploading", "reviewing", "completed", "failed"].includes(entry.status)
            ? entry.status
            : "failed",
          reviewStatus: ["approved", "pending", "rejected", "processing"].includes(entry.reviewStatus)
            ? entry.reviewStatus
            : undefined,
          message: normalizeText(entry.message),
          documentId: normalizeText(entry.documentId),
          createdAt: normalizeText(entry.createdAt) || nowIso(),
          updatedAt: normalizeText(entry.updatedAt) || nowIso(),
        };

        if (!task.id || !task.userId || !task.universityId || !task.courseCode) {
          return null;
        }

        if ((task.status === "preparing" || task.status === "uploading") && !task.documentId) {
          return {
            ...task,
            status: "failed" as const,
            message: "This upload was interrupted before Termer finished sending the file. Please upload it again.",
            updatedAt: nowIso(),
          };
        }

        return task;
      })
      .filter((entry): entry is PreviousUploadTask => Boolean(entry));
  } catch {
    return [] as PreviousUploadTask[];
  }
}

function isDocumentStillProcessing(document: PreviousUploadResponseDocument | undefined) {
  const labels = Array.isArray(document?.aiLabels)
    ? document.aiLabels.map((label) => normalizeText(label).toLowerCase())
    : [];
  const reason = normalizeText(document?.aiReason).toLowerCase();
  return labels.includes("processing") || reason === "screening in progress.";
}

function getReviewCompletionMessage(document: PreviousUploadResponseDocument | undefined) {
  if (!document) {
    return {
      reviewStatus: "pending" as const,
      message: "Your file finished uploading. Termer could not confirm the final review state yet, so it is staying in the queue for now.",
    };
  }

  if (document.status === "approved") {
    return {
      reviewStatus: "approved" as const,
      message: "Your file was reviewed and approved. It is now available in the course library.",
    };
  }

  if (document.status === "rejected") {
    return {
      reviewStatus: "rejected" as const,
      message: normalizeText(document.aiReason) || "Your file finished review but was rejected for this course.",
    };
  }

  return {
    reviewStatus: "pending" as const,
    message: normalizeText(document.aiReason) || "Your file finished uploading and is now waiting in the review queue.",
  };
}

async function fetchReviewState(task: PreviousUploadTask) {
  const query = new URLSearchParams({
    universityId: task.universityId,
    courseCode: task.courseCode,
    userId: task.userId,
  });
  const response = await fetch(`${API}/api/previouses?${query.toString()}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeText(data?.error) || "Could not refresh the upload review state.");
  }

  if (!Array.isArray(data?.documents)) {
    return undefined;
  }

  return data.documents.find((document: PreviousUploadResponseDocument) =>
    normalizeText(document?.id) === normalizeText(task.documentId),
  ) as PreviousUploadResponseDocument | undefined;
}

function queueReviewPoll(taskId: string, delayMs = REVIEW_POLL_MS) {
  if (typeof window === "undefined") return;

  const existing = pollTimers.get(taskId);
  if (existing) {
    window.clearTimeout(existing);
  }

  const timerId = window.setTimeout(() => {
    void pollReviewState(taskId);
  }, delayMs);

  pollTimers.set(taskId, timerId);
}

async function pollReviewState(taskId: string) {
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task || task.status !== "reviewing" || !task.documentId) {
    clearTaskTimers(taskId);
    return;
  }

  try {
    const document = await fetchReviewState(task);
    if (!document) {
      queueReviewPoll(taskId);
      return;
    }

    if (isDocumentStillProcessing(document)) {
      patchTask(taskId, {
        reviewStatus: "processing",
        message: "Your file is uploaded. Termer is still generating the preview and reviewing it in the background.",
      });
      queueReviewPoll(taskId);
      return;
    }

    const completion = getReviewCompletionMessage(document);
    patchTask(taskId, {
      status: "completed",
      reviewStatus: completion.reviewStatus,
      message: completion.message,
    });
    clearPollTimer(taskId);
  } catch {
    queueReviewPoll(taskId, REVIEW_POLL_MS * 2);
  }
}

async function runUploadTask(taskId: string, request: PreviousUploadRequest) {
  patchTask(taskId, {
    status: "uploading",
    message: "Uploading your file now. You can leave Previouses and keep using the rest of Termer.",
  });

  const uploadController = createUploadAbortController();
  const uploadTimeoutId = typeof window !== "undefined"
    ? window.setTimeout(() => uploadController?.abort(), UPLOAD_REQUEST_TIMEOUT_MS)
    : 0;

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    const fileDataUrl = await readFileAsDataUrl(request.file);
    const response = await fetch(`${API}/api/previouses/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: uploadController?.signal,
      body: JSON.stringify({
        userId: request.userId,
        userEmail: request.userEmail,
        universityId: request.universityId,
        courseCode: request.courseCode,
        courseTitle: request.courseTitle,
        documentTitle: request.documentTitle,
        documentKind: request.documentKind,
        examTermLabel: request.examTermLabel,
        note: request.note,
        fileName: request.file.name,
        fileDataUrl,
      }),
    });

    const data = await response.json().catch(() => ({} as PreviousUploadResponse));
    if (!response.ok || !data?.success) {
      throw new Error(normalizeText(data?.error) || "Could not upload that previous.");
    }

    patchTask(taskId, {
      status: "reviewing",
      reviewStatus: isDocumentStillProcessing(data.document) ? "processing" : data.document?.status,
      documentId: normalizeText(data.document?.id),
      message: "Your file was received. Termer is reviewing it in the background and you can keep using the website.",
    });

    if (normalizeText(data.document?.id)) {
      queueReviewPoll(taskId, 1200);
    } else {
      patchTask(taskId, {
        status: "completed",
        reviewStatus: "pending",
        message: "Your file was uploaded. Review is continuing in the background and the queue will update shortly.",
      });
    }
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    patchTask(taskId, {
      status: "failed",
      message: timedOut
        ? "Uploading took too long, so Termer stopped waiting. Please try the upload again."
        : error instanceof Error
          ? error.message
          : "Upload failed.",
    });
    clearPollTimer(taskId);
  } finally {
    if (uploadTimeoutId && typeof window !== "undefined") {
      window.clearTimeout(uploadTimeoutId);
    }
  }
}

for (const restoredTask of tasks) {
  if (restoredTask.status === "reviewing" && restoredTask.documentId) {
    queueReviewPoll(restoredTask.id, 1200);
  } else if (restoredTask.status === "completed" || restoredTask.status === "failed") {
    scheduleDismiss(restoredTask.id);
  }
}

export function subscribePreviousUploadTasks(listener: (tasks: PreviousUploadTask[]) => void) {
  listeners.add(listener);
  listener(sortTasks(tasks));
  return () => {
    listeners.delete(listener);
  };
}

export function getPreviousUploadTasks() {
  return sortTasks(tasks);
}

export function dismissPreviousUploadTask(taskId: string) {
  clearTaskTimers(taskId);
  tasks = tasks.filter((task) => task.id !== taskId);
  emitTasks();
}

export function startPreviousUploadTask(request: PreviousUploadRequest) {
  const taskId = buildTaskId();
  const createdAt = nowIso();
  const nextTask: PreviousUploadTask = {
    id: taskId,
    userId: request.userId,
    userEmail: request.userEmail,
    universityId: request.universityId,
    courseCode: request.courseCode,
    courseTitle: request.courseTitle,
    documentTitle: normalizeText(request.documentTitle) || request.file.name.replace(/\.[^.]+$/, ""),
    fileName: request.file.name,
    status: "preparing",
    reviewStatus: "processing",
    message: "Preparing your file. You can leave Previouses and keep using the rest of Termer while this runs.",
    createdAt,
    updatedAt: createdAt,
  };

  upsertTask(nextTask);

  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      void runUploadTask(taskId, request);
    }, 0);
  }

  return nextTask;
}

export function hasActivePreviousUploadTasks(userId?: string | null) {
  return tasks.some((task) =>
    (!userId || task.userId === userId)
    && (task.status === "preparing" || task.status === "uploading" || task.status === "reviewing"),
  );
}

export function hasMatchingPreviousUploadTask(task: PreviousUploadTask, userId: string, universityId: string, courseCode: string) {
  return task.userId === userId
    && task.universityId === universityId
    && compactCourseCode(task.courseCode) === compactCourseCode(courseCode);
}
