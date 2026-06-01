import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { Course, Day, Meeting } from "../types";
import {
  expandCoursesToMeetingSlots,
  findFreeSlots,
  WEEKDAY_ORDER,
  type FreeSlot,
  type WeekdayKey,
} from "../utils/schedule.ts";

const COURSE_COLORS = [
  "#1a5fa8",
  "#1a7a45",
  "#6b2d8b",
  "#b35a0a",
  "#0e6b5e",
  "#8a6d0b",
  "#123d6e",
  "#7a1f1f",
  "#1a6e8a",
  "#2d5a1a",
];

const COLOR_GRID = [
  "#1a5fa8",
  "#1a7a45",
  "#6b2d8b",
  "#b35a0a",
  "#0e6b5e",
  "#8a6d0b",
  "#123d6e",
  "#7a1f1f",
  "#1a6e8a",
  "#2d5a1a",
  "#5a1a6e",
  "#6e1a3a",
  "#1a4a6e",
  "#3a6e1a",
  "#6e4a1a",
  "#2a2a7a",
  "#7a2a2a",
  "#2a7a2a",
  "#7a5a1a",
  "#1a5a5a",
];

const DAYS: { key: Day; label: string }[] = [
  { key: "M", label: "Monday" },
  { key: "T", label: "Tuesday" },
  { key: "W", label: "Wednesday" },
  { key: "R", label: "Thursday" },
  { key: "F", label: "Friday" },
  { key: "S", label: "Saturday" },
];

const GRID_START_OF_DAY = '08:00';
const GRID_END_OF_DAY = '21:00';

function toMinutes(hhmm: string) {
  return toSafeMinutes(hhmm) ?? 0;
}
function toSafeMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
function hasDrawableMeeting(course: Course) {
  return (course.meetings ?? []).some((meeting) => {
    const start = toSafeMinutes(meeting.start);
    const end = toSafeMinutes(meeting.end);
    return (
      start !== null
      && end !== null
      && end > start
      && meeting.days.some((day) => DAYS.some((entry) => entry.key === day))
    );
  });
}
function isCatalogOnlyCourse(course: Course) {
  return Boolean(
    course.isCatalogOnly
    || (!(course.meetings ?? []).length && /catalog/i.test(course.scheduleType ?? "")),
  );
}
function formatHour(h: number) {
  const h12 = h % 12 || 12;
  return `${h12}:00`;
}
function formatTime(hhmm: string) {
  const totalMinutes = toSafeMinutes(hhmm);
  if (totalMinutes === null) return "TBA";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const h12 = h % 12 || 12;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getMeetingMeta(course: Course, meeting: Meeting) {
  const campus = String(course.campus ?? "").trim();
  const location = String(meeting.location ?? "").trim();
  if (campus && location) return `${campus} • ${location}`;
  return location || campus;
}
function minutesToHhMm(totalMinutes: number) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function formatDuration(start: string, end: string) {
  const diff = Math.max(0, toMinutes(end) - toMinutes(start));
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}
function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

type Block = {
  course: Course;
  meeting: Meeting;
  day: Day;
  startMin: number;
  endMin: number;
  addedIndex: number;
  isConflict: boolean;
  hidden: boolean;
  zIndex: number;
};

type ContextMenu = { x: number; y: number; courseId: string };
type ReviewModal = { course: Course; mode: "write" | "view" } | null;

type Props = {
  scheduledIds: Set<string>;
  courses: Course[];
  hoveredCourse: Course | null;
  onSelectCourse: (course: Course) => void;
  onHoverCourse: (course: Course | null) => void;
  courseColorMap: Map<string, string>;
  onColorChange: (courseId: string, color: string) => void;
  onRemoveCourse: (course: Course) => void;
  semesterLabel?: string;
};

export function ScheduleGrid({
  courses,
  hoveredCourse,
  scheduledIds,
  onSelectCourse,
  onHoverCourse,
  courseColorMap,
  onColorChange,
  onRemoveCourse,
  semesterLabel = "Schedule",
}: Props) {
  const startOfDayMin = toMinutes(GRID_START_OF_DAY);
  const endOfDayMin = toMinutes(GRID_END_OF_DAY);

  const [tipVisible, setTipVisible] = useState(false);
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [reviewModal, setReviewModal] = useState<ReviewModal>(null);
  const [rgbInput, setRgbInput] = useState({ r: 26, g: 95, b: 168 });
  const [colorTab, setColorTab] = useState<"picker" | "rgb">("picker");
  const [hue, setHue] = useState(220);
  const [pickerPos, setPickerPos] = useState({ x: 0.3, y: 0.3 });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [freePanelVisible, setFreePanelVisible] = useState(true);
  const gradientRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const middlePanelRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  const untimedRailRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const freePanelRef = useRef<HTMLElement>(null);
  const [availableGridHeight, setAvailableGridHeight] = useState<number | null>(null);
  const untimedCourses = useMemo(
    () => courses.filter((course) => !hasDrawableMeeting(course)),
    [courses],
  );
  const catalogOnlyUntimedCourses = useMemo(
    () => untimedCourses.filter((course) => isCatalogOnlyCourse(course)),
    [untimedCourses],
  );
  const mixedUntimedCourses = useMemo(
    () => untimedCourses.filter((course) => !isCatalogOnlyCourse(course)),
    [untimedCourses],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (contextMenu) {
      const currentColor =
        courseColorMap.get(contextMenu.courseId) ?? "#1a5fa8";
      const { r, g, b } = hexToRgb(currentColor);
      setRgbInput({ r, g, b });
      setColorTab("picker");
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      if (max !== 0) {
        const s = (max - min) / max;
        const v = max / 255;
        setPickerPos({ x: s, y: 1 - v });
      }
    }
  }, [contextMenu]);

  useEffect(() => {
    const middlePanel = middlePanelRef.current;
    const header = headerRef.current;
    const days = daysRef.current;
    const untimedRail = untimedRailRef.current;
    const freePanel = freePanelRef.current;

    if (!middlePanel || !header || !days) return;

    const updateAvailableHeight = () => {
      const panelHeight = middlePanel.clientHeight;
      const freePanelHeight = freePanelVisible && freePanel ? freePanel.offsetHeight : 0;
      const untimedRailHeight = untimedCourses.length > 0 && untimedRail ? untimedRail.offsetHeight : 0;
      const chromeHeight = header.offsetHeight + days.offsetHeight + untimedRailHeight + freePanelHeight;
      const nextHeight = Math.max(160, panelHeight - chromeHeight - 12);
      setAvailableGridHeight(nextHeight);
    };

    updateAvailableHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateAvailableHeight();
    });

    resizeObserver.observe(middlePanel);
    resizeObserver.observe(header);
    resizeObserver.observe(days);
    if (untimedRail) resizeObserver.observe(untimedRail);
    if (freePanel) resizeObserver.observe(freePanel);

    window.addEventListener("resize", updateAvailableHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateAvailableHeight);
    };
  }, [freePanelVisible, untimedCourses.length]);

  const blocks = useMemo(() => {
    const raw: Block[] = [];
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      for (const m of c.meetings) {
        const s = toSafeMinutes(m.start);
        const e = toSafeMinutes(m.end);
        if (s === null || e === null || e <= s) continue;
        for (const d of m.days) {
          if (!DAYS.some((entry) => entry.key === d)) continue;
          raw.push({
            course: c,
            meeting: m,
            day: d,
            startMin: s,
            endMin: e,
            addedIndex: i,
            isConflict: false,
            hidden: false,
            zIndex: i + 1,
          });
        }
      }
    }
    for (let i = 0; i < raw.length; i++) {
      for (let j = i + 1; j < raw.length; j++) {
        const a = raw[i];
        const b = raw[j];
        if (
          a.day !== b.day ||
          !(a.startMin < b.endMin && b.startMin < a.endMin)
        )
          continue;
        raw[i].isConflict = true;
        raw[j].isConflict = true;
        const durA = a.endMin - a.startMin,
          durB = b.endMin - b.startMin;
        if (a.addedIndex > b.addedIndex) {
          if (durB > durA) {
            raw[i].zIndex = b.addedIndex + 1;
            raw[j].zIndex = a.addedIndex + 2;
          } else {
            raw[i].zIndex = a.addedIndex + 2;
            raw[j].zIndex = b.addedIndex + 1;
          }
        } else {
          if (durA > durB) {
            raw[j].zIndex = a.addedIndex + 1;
            raw[i].zIndex = b.addedIndex + 2;
          } else {
            raw[j].zIndex = b.addedIndex + 2;
            raw[i].zIndex = a.addedIndex + 1;
          }
        }
      }
    }
    for (let i = 0; i < raw.length; i++) {
      if (!raw[i].isConflict) continue;
      for (let j = i + 1; j < raw.length; j++) {
        if (!raw[j].isConflict || raw[i].day !== raw[j].day) continue;
        if (
          !(raw[i].startMin < raw[j].endMin && raw[j].startMin < raw[i].endMin)
        )
          continue;
        if (raw[i].zIndex < raw[j].zIndex) raw[i].hidden = true;
        else raw[j].hidden = true;
      }
    }
    return raw;
  }, [courses]);

  const occupiedSlots = useMemo(
    () =>
      blocks
        .filter((b) => !b.hidden)
        .map((b) => ({ day: b.day, startMin: b.startMin, endMin: b.endMin })),
    [blocks],
  );

  const freeSlotsByDay = useMemo(
    () => findFreeSlots(expandCoursesToMeetingSlots(courses), GRID_START_OF_DAY, GRID_END_OF_DAY),
    [courses]
  );

  const longestFreeSlotByDay = useMemo(() => (
    WEEKDAY_ORDER.reduce<Record<WeekdayKey, FreeSlot | null>>((acc, day) => {
      acc[day] = freeSlotsByDay[day].reduce<FreeSlot | null>((longest, slot) => {
        if (!longest) return slot;
        const slotDuration = toMinutes(slot.end) - toMinutes(slot.start);
        const longestDuration = toMinutes(longest.end) - toMinutes(longest.start);
        return slotDuration > longestDuration ? slot : longest;
      }, null);
      return acc;
    }, {
      Mon: null,
      Tue: null,
      Wed: null,
      Thu: null,
      Fri: null,
      Sat: null,
    })
  ), [freeSlotsByDay]);

  const scheduleHighlights = useMemo(() => {
    const uniqueDays = new Set(blocks.map((block) => block.day));
    const earliestStart = blocks.reduce((earliest, block) => Math.min(earliest, block.startMin), Infinity);
    const latestEnd = blocks.reduce((latest, block) => Math.max(latest, block.endMin), -Infinity);
    const conflictCourses = new Set(blocks.filter((block) => block.isConflict).map((block) => block.course.id));
    const longestGap = Object.values(longestFreeSlotByDay).reduce<FreeSlot | null>((longest, slot) => {
      if (!slot) return longest;
      const slotDuration = toMinutes(slot.end) - toMinutes(slot.start);
      const longestDuration = longest ? toMinutes(longest.end) - toMinutes(longest.start) : -1;
      if (slot.start === GRID_START_OF_DAY && slot.end === GRID_END_OF_DAY) return longest;
      return slotDuration > longestDuration ? slot : longest;
    }, null);

    return [
      {
        label: "Campus days",
        value: uniqueDays.size === 0 ? "0" : `${uniqueDays.size}`,
      },
      {
        label: "Earliest start",
        value: Number.isFinite(earliestStart) ? formatTime(minutesToHhMm(earliestStart)) : "—",
      },
      {
        label: "Latest end",
        value: Number.isFinite(latestEnd) && latestEnd >= 0 ? formatTime(minutesToHhMm(latestEnd)) : "—",
      },
      {
        label: "Longest gap",
        value: longestGap ? formatDuration(longestGap.start, longestGap.end) : "Minimal",
      },
      {
        label: "Overlaps",
        value: conflictCourses.size === 0 ? "None" : `${conflictCourses.size}`,
      },
    ];
  }, [blocks, longestFreeSlotByDay]);

  const previewBlocks = useMemo(() => {
    if (!hoveredCourse || scheduledIds.has(hoveredCourse.id)) return [];
    const out: {
      meeting: Meeting;
      day: Day;
      startMin: number;
      endMin: number;
      isConflict: boolean;
    }[] = [];
    for (const m of hoveredCourse.meetings) {
      const s = toSafeMinutes(m.start);
      const e = toSafeMinutes(m.end);
      if (s === null || e === null || e <= s) continue;
      for (const d of m.days) {
        if (!DAYS.some((entry) => entry.key === d)) continue;
        const hasConflict = occupiedSlots.some(
          (slot) => slot.day === d && s < slot.endMin && slot.startMin < e,
        );
        out.push({
          meeting: m,
          day: d,
          startMin: s,
          endMin: e,
          isConflict: hasConflict,
        });
      }
    }
    return out;
  }, [hoveredCourse, occupiedSlots, scheduledIds]);

  const timelineWindow = useMemo(
    () => ({
      startMin: startOfDayMin,
      endMin: endOfDayMin,
    }),
    [endOfDayMin, startOfDayMin],
  );

  const timelineDuration = timelineWindow.endMin - timelineWindow.startMin;
  const idealGridHeight = Math.max(320, Math.min(720, timelineDuration * 0.72));
  const gridHeight = availableGridHeight == null
    ? idealGridHeight
    : Math.max(220, availableGridHeight);
  const GRID_TOP_INSET = 14;
  const innerGridHeight = Math.max(120, gridHeight - GRID_TOP_INSET);
  const pxPerMin = innerGridHeight / timelineDuration;
  const offsetForMinute = (minute: number) =>
    GRID_TOP_INSET + (minute - timelineWindow.startMin) * pxPerMin;

  const hourMarks = useMemo(() => {
    const marks: { at: number; label: string }[] = [];
    const firstHour = Math.ceil(timelineWindow.startMin / 60);
    const lastHour = Math.floor(timelineWindow.endMin / 60);

    for (let h = firstHour; h <= lastHour; h++) {
      const at = offsetForMinute(h * 60);
      marks.push({ at, label: formatHour(h) });
    }
    return marks;
  }, [offsetForMinute, pxPerMin, timelineWindow.endMin, timelineWindow.startMin]);

  const handleRightClick = (e: React.MouseEvent, courseId: string) => {
    e.preventDefault();
    setContextMenu({ ...getSafeContextMenuPosition(e.clientX, e.clientY), courseId });
  };

  const getSafeContextMenuPosition = useCallback((x: number, y: number, width = 240, height = 360) => {
    const margin = 12;
    const panelRect = middlePanelRef.current?.getBoundingClientRect();
    const minX = panelRect ? Math.max(margin, panelRect.left + margin) : margin;
    const maxX = Math.max(
      minX,
      Math.min(
        window.innerWidth - width - margin,
        panelRect ? panelRect.right - width - margin : window.innerWidth - width - margin,
      ),
    );
    const maxY = Math.max(margin, window.innerHeight - height - margin);

    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, margin), maxY),
    };
  }, []);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const rect = contextMenuRef.current.getBoundingClientRect();
    const next = getSafeContextMenuPosition(
      contextMenu.x,
      contextMenu.y,
      rect.width,
      rect.height,
    );

    if (next.x === contextMenu.x && next.y === contextMenu.y) return;
    setContextMenu((current) =>
      current ? { ...current, x: next.x, y: next.y } : current,
    );
  }, [contextMenu, getSafeContextMenuPosition]);

  const handlePickColor = (color: string) => {
    if (contextMenu) {
      onColorChange(contextMenu.courseId, color);
      setContextMenu(null);
    }
  };

  const handleRgbApply = () => {
    const hex = rgbToHex(rgbInput.r, rgbInput.g, rgbInput.b);
    handlePickColor(hex);
  };

  // ── PDF Export — respects light/dark mode ──────────────────────────────────
  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);

    try {
      const { default: jsPDF } = await import("jspdf");
    const isLight = document.body.classList.contains("light");

    // Theme colors
    const BG = isLight ? { r: 240, g: 242, b: 245 } : { r: 15, g: 18, b: 23 };
    const PANEL = isLight
      ? { r: 255, g: 255, b: 255 }
      : { r: 11, g: 14, b: 19 };
    const BORDER = isLight
      ? { r: 221, g: 225, b: 231 }
      : { r: 38, g: 44, b: 54 };
    const TEXT = isLight ? { r: 26, g: 31, b: 46 } : { r: 233, g: 238, b: 247 };
    const MUTED = isLight
      ? { r: 107, g: 114, b: 128 }
      : { r: 170, g: 180, b: 196 };

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    const PAGE_W = 841.89;
    const PAGE_H = 595.28;
    const MARGIN = 20;
    const TIME_W = 36;
    const HEADER_H = 28;
    const TITLE_H = 24;
    const GRID_X = MARGIN + TIME_W;
    const GRID_Y = MARGIN + TITLE_H + HEADER_H;
    const GRID_W = PAGE_W - MARGIN - GRID_X;
    const GRID_H = PAGE_H - GRID_Y - MARGIN;
    const DAY_W = GRID_W / 6;

    const visibleBlocks = blocks.filter((b) => !b.hidden);
    const minHour =
      visibleBlocks.length > 0
        ? Math.max(
            7,
            Math.floor(Math.min(...visibleBlocks.map((b) => b.startMin)) / 60) -
              1,
          )
        : 8;
    const maxHour =
      visibleBlocks.length > 0
        ? Math.min(
            22,
            Math.ceil(Math.max(...visibleBlocks.map((b) => b.endMin)) / 60) + 1,
          )
        : 21;

    const START_MIN = minHour * 60;
    const END_MIN = maxHour * 60;
    const PX_PER_MIN = GRID_H / (END_MIN - START_MIN);

    // Background
    pdf.setFillColor(BG.r, BG.g, BG.b);
    pdf.rect(0, 0, PAGE_W, PAGE_H, "F");

    // Title
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    pdf.text(semesterLabel, PAGE_W / 2, MARGIN + 16, { align: "center" });

    // Day header background
    pdf.setFillColor(PANEL.r, PANEL.g, PANEL.b);
    pdf.rect(GRID_X, MARGIN + TITLE_H, GRID_W, HEADER_H, "F");

    // Day headers
    DAYS.forEach((d, i) => {
      const x = GRID_X + i * DAY_W;
      pdf.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      pdf.setLineWidth(0.5);
      pdf.line(
        x + DAY_W,
        MARGIN + TITLE_H,
        x + DAY_W,
        MARGIN + TITLE_H + HEADER_H,
      );
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(TEXT.r, TEXT.g, TEXT.b);
      pdf.text(d.label, x + DAY_W / 2, MARGIN + TITLE_H + HEADER_H / 2 + 3, {
        align: "center",
      });
    });

    // Grid border
    pdf.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
    pdf.setLineWidth(0.5);
    pdf.rect(GRID_X, GRID_Y, GRID_W, GRID_H);

    // Hour lines + time labels
    for (let h = minHour; h <= maxHour; h++) {
      const y = GRID_Y + (h * 60 - START_MIN) * PX_PER_MIN;
      pdf.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      pdf.setLineWidth(0.4);
      pdf.line(GRID_X, y, GRID_X + GRID_W, y);
      if (h !== minHour) {
        const h12 = h % 12 || 12;
        const ampm = h >= 12 ? "PM" : "AM";
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        pdf.text(`${h12}:00`, MARGIN + TIME_W - 4, y + 3, { align: "right" });
      }
    }

    // Vertical column separators
    DAYS.forEach((_, i) => {
      const x = GRID_X + i * DAY_W;
      pdf.setDrawColor(BORDER.r, BORDER.g, BORDER.b);
      pdf.setLineWidth(0.4);
      pdf.line(x, GRID_Y, x, GRID_Y + GRID_H);
    });

    // Course blocks
    visibleBlocks.forEach((b) => {
      const dayIndex = DAYS.findIndex((d) => d.key === b.day);
      if (dayIndex === -1) return;

      const bx = GRID_X + dayIndex * DAY_W + 2;
      const by = GRID_Y + (b.startMin - START_MIN) * PX_PER_MIN + 1;
      const bw = DAY_W - 4;
      const bh = Math.max(16, (b.endMin - b.startMin) * PX_PER_MIN - 2);

      const hex = courseColorMap.get(b.course.id) ?? "#1a5fa8";
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const bv = parseInt(hex.slice(5, 7), 16);

      pdf.setFillColor(r, g, bv);
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(bx, by, bw, bh, 4, 4, "FD");

      const cx = bx + bw / 2;
      let ty = by + bh / 2 - (bh > 32 ? 8 : bh > 22 ? 4 : 0);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(255, 255, 255);
      pdf.text(b.course.code, cx, ty, { align: "center", maxWidth: bw - 4 });
      ty += 10;

      if (bh > 24) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(230, 230, 230);
        pdf.text(b.course.title, cx, ty, { align: "center", maxWidth: bw - 4 });
        ty += 9;
      }

      if (bh > 36) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(210, 215, 225);
        pdf.text(
          `${formatTime(b.meeting.start)}–${formatTime(b.meeting.end)}`,
          cx,
          ty,
          { align: "center", maxWidth: bw - 4 },
        );
        ty += 9;
      }

      if (bh > 50 && b.meeting.location) {
        pdf.setFontSize(6.5);
        pdf.setTextColor(195, 200, 215);
        pdf.text(b.meeting.location, cx, ty, {
          align: "center",
          maxWidth: bw - 4,
        });
      }
    });

    const filename = `${semesterLabel.replace(/[^a-z0-9]/gi, "_")}_schedule.pdf`;
    pdf.save(filename);
    } finally {
      setExportingPdf(false);
    }
  };

  const pulseStyle = `
    @keyframes conflictPulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 2px #ff4444; }
      50% { opacity: 0.75; box-shadow: 0 0 8px 3px #ff4444; }
    }
  `;

  return (
    <section
      className={`middlePanel${freePanelVisible ? "" : " isFreePanelClosed"}`}
      ref={middlePanelRef}
    >
      <style>{pulseStyle}</style>

      <div
        className="schHeader"
        ref={headerRef}
      >
        <div className="schHeader__content">
          <div className="schHeader__eyebrow">Weekly Planner</div>
          <div className="schHeader__titleRow">
            <span className="schHeader__title">{semesterLabel}</span>
            <span className="schHeader__meta">
              {courses.length} selected {courses.length === 1 ? "course" : "courses"}
            </span>
          </div>
          {tipVisible ? (
            <div className="schHeader__tip">
              Search on the right, add the strongest options, then right-click any block to personalize its color.
              <button
                type="button"
                onClick={() => setTipVisible(false)}
                className="schHeader__dismiss"
                aria-label="Dismiss tip"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div className="schHeader__tip">
              Full-day timeline visible. Hover to preview and right-click blocks to recolor.
            </div>
          )}
          <div className="schInsights" aria-label="Schedule quality insights">
            {scheduleHighlights.map((item) => (
              <div key={item.label} className="schInsightChip">
                <span className="schInsightChip__label">{item.label}</span>
                <strong className="schInsightChip__value">{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="schHeader__actions">
          {!freePanelVisible ? (
            <button
              type="button"
              onClick={() => setFreePanelVisible(true)}
              className="schFreeToggle"
            >
              Show free gaps
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            className="schExportButton"
            disabled={exportingPdf}
          >
            {exportingPdf ? "Preparing PDF..." : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="schDays" ref={daysRef}>
        <div className="schDays__corner" />
        {DAYS.map((d) => (
          <div key={d.key} className="schDays__day">
            {d.label}
          </div>
        ))}
      </div>

      {untimedCourses.length > 0 ? (
        <div
          className={`schUnscheduledRail${catalogOnlyUntimedCourses.length === untimedCourses.length ? " isCatalogOnly" : ""}`}
          ref={untimedRailRef}
          aria-label="Selected courses without posted meeting times"
        >
          <div className="schUnscheduledRail__intro">
            <span className="schUnscheduledRail__eyebrow">
              {catalogOnlyUntimedCourses.length === untimedCourses.length ? "Catalog-only entries" : "No posted time yet"}
            </span>
            <strong>
              {catalogOnlyUntimedCourses.length === untimedCourses.length
                ? `${untimedCourses.length} selected ${untimedCourses.length === 1 ? "course is" : "courses are"} missing public timetable data`
                : `${untimedCourses.length} selected ${untimedCourses.length === 1 ? "course" : "courses"} visible here`}
            </strong>
            <span className="schUnscheduledRail__note">
              {catalogOnlyUntimedCourses.length === untimedCourses.length
                ? "This university snapshot is searchable, but its current public source does not publish live meeting days and times for these entries."
                : mixedUntimedCourses.length === untimedCourses.length
                  ? "These sections are in the current term, but their meeting days or times are still missing from the loaded source."
                  : "Some selected courses are catalog entries only, while others are real sections still missing posted meeting times."}
            </span>
          </div>
          <div className="schUnscheduledRail__list">
            {untimedCourses.map((course) => {
              const color = courseColorMap.get(course.id) ?? "#1a5fa8";
              const isCatalogOnly = isCatalogOnlyCourse(course);
              return (
                <button
                  key={course.id}
                  type="button"
                  className={`schUnscheduledCard${isCatalogOnly ? " isCatalogOnly" : ""}`}
                  style={{ borderColor: color, boxShadow: `inset 4px 0 0 ${color}` }}
                  onClick={() => onSelectCourse(course)}
                  onContextMenu={(event) => handleRightClick(event, course.id)}
                  onMouseEnter={() => onHoverCourse(course)}
                  onMouseLeave={() => onHoverCourse(null)}
                  title={`${course.code} has no posted meeting time yet. Right-click to remove or recolor.`}
                >
                  <span className="schUnscheduledCard__code">{course.code}</span>
                  <span className="schUnscheduledCard__title">{course.title}</span>
                  <span className="schUnscheduledCard__meta">
                    {isCatalogOnly ? `${course.campus || "Campus TBA"} · Catalog entry` : `${course.section ? `Sec ${course.section}` : "Section TBA"} · ${course.instructor || "TBA"}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="schGrid" ref={gridRef} style={{ height: gridHeight }}>
        <div className="schTimes">
          {/* FIX: prefixed key with "time-" to avoid collision with "hline-" keys below */}
          {hourMarks.map((m, index) => (
  <div
    key={`time-${m.label}-${index}`}
    className="schTimes__mark"
    style={{ top: m.at }}
  >
    {m.label}
  </div>
))}

        </div>

        <div className="schCanvas" style={{ height: gridHeight }}>
          <div className="schCanvas__columns">
            {DAYS.map((d) => (
              <div key={d.key} className="schCanvas__col" />
            ))}
          </div>
          {hourMarks.map((m) => (
            <div
              key={m.label}
              className="schCanvas__hline"
              style={{ top: m.at }}
            />
          ))}

          {/* Preview blocks */}
          {previewBlocks.map((b, idx) => {
            const dayIndex = DAYS.findIndex((d) => d.key === b.day);
            if (dayIndex === -1) return null;
            const top = offsetForMinute(b.startMin);
            const height = Math.max(18, (b.endMin - b.startMin) * pxPerMin);
            return (
              <div
                key={`preview-${idx}`}
                style={{
                  position: "absolute",
                  left: `calc(${dayIndex} * (100% / 6))`,
                  width: `calc(100% / 6)`,
                  top,
                  height,
                  backgroundColor: b.isConflict
                    ? "rgba(163,38,56,0.15)"
                    : "transparent",
                  border: b.isConflict
                    ? "2px dashed #A32638"
                    : "2px dashed rgba(255,255,255,0.35)",
                  borderRadius: "4px",
                  zIndex: 999,
                  pointerEvents: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    color: b.isConflict ? "#ff6666" : "rgba(255,255,255,0.55)",
                    fontWeight: "bold",
                    textAlign: "center",
                    padding: "2px",
                  }}
                >
                  {hoveredCourse?.code}
                </span>
                <span
                  style={{
                    fontSize: "9px",
                    color: b.isConflict ? "#ff6666" : "rgba(255,255,255,0.45)",
                    textAlign: "center",
                  }}
                >
                  {formatTime(b.meeting.start)}–{formatTime(b.meeting.end)}
                </span>
                {b.isConflict && (
                  <span style={{ fontSize: "9px", color: "#ff6666" }}>
                    ⚠ Conflict
                  </span>
                )}
              </div>
            );
          })}

          {/* Scheduled blocks */}
          {blocks
            .filter((b) => !b.hidden)
            .map((b) => {
              const dayIndex = DAYS.findIndex((d) => d.key === b.day);
              if (dayIndex === -1) return null;
              const top = offsetForMinute(b.startMin);
              const height = Math.max(18, (b.endMin - b.startMin) * pxPerMin);
              const blockKey = `${b.course.id}-${b.day}-${b.startMin}`;
              const color = courseColorMap.get(b.course.id) ?? "#1a5fa8";
              const isHovered = hoveredBlock === blockKey;
              const isTinyBlock = height < 40;
              const isCompactBlock = height >= 40 && height < 62;
              const meetingMeta = getMeetingMeta(b.course, b.meeting);
              return (
                <button
                  key={blockKey}
                  className={[
                    "courseBlock",
                    isTinyBlock ? "courseBlock--tiny" : "",
                    isCompactBlock ? "courseBlock--compact" : "",
                  ].filter(Boolean).join(" ")}
                  style={{
                    left: `calc(${dayIndex} * (100% / 6))`,
                    width: `calc(100% / 6)`,
                    top,
                    height,
                    zIndex: isHovered ? 1000 : b.zIndex,
                    backgroundColor: color,
                    animation: b.isConflict
                      ? "conflictPulse 1.5s ease-in-out infinite"
                      : undefined,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    justifyContent: isTinyBlock ? "center" : "flex-start",
                    textAlign: "center",
                    boxSizing: "border-box",
                    padding: isTinyBlock ? "2px 4px" : "4px 5px",
                    overflow: "hidden",
                    outline: isHovered ? "2px solid white" : undefined,
                  }}
                  type="button"
                  onClick={() => onSelectCourse(b.course)}
                  onContextMenu={(e) => handleRightClick(e, b.course.id)}
                  onMouseEnter={() => {
                    setHoveredBlock(blockKey);
                    onHoverCourse(b.course);
                  }}
                  onMouseLeave={() => {
                    setHoveredBlock(null);
                    onHoverCourse(null);
                  }}
                  title={[b.course.code, b.course.title, meetingMeta].filter(Boolean).join(" • ")}
                >
                  <span className="courseBlock__line1">{b.course.code}</span>
                  <span className="courseBlock__line2">{b.course.title}</span>
                  <span className="courseBlock__line3">
                    {formatTime(b.meeting.start)}–{formatTime(b.meeting.end)}
                  </span>
                  {meetingMeta ? (
                    <span className="courseBlock__line4">{meetingMeta}</span>
                  ) : null}
                  {b.isConflict && (
                    <span className="courseBlock__conflict">Conflict</span>
                  )}
                </button>
              );
          })}
        </div>
      </div>

      {freePanelVisible ? (
        <section
          className="schFreePanel"
          ref={freePanelRef}
          aria-label="Weekly free time gaps"
        >
          <div className="schFreePanel__header">
            <div>
              <span className="schFreePanel__eyebrow">Open windows</span>
              <strong className="schFreePanel__title">Daily free time gaps</strong>
            </div>
            <button
              type="button"
              className="schFreePanel__close"
              onClick={() => setFreePanelVisible(false)}
              aria-label="Hide daily free time gaps"
            >
              Hide
            </button>
          </div>

          <div className="schFreeStrip">
            {WEEKDAY_ORDER.map((day) => {
              const slots = freeSlotsByDay[day];
              const longestSlot = longestFreeSlotByDay[day];
              const isAllDayFree = slots.length === 1
                && slots[0].start === GRID_START_OF_DAY
                && slots[0].end === GRID_END_OF_DAY;

              return (
                <div key={day} className="schFreeCard">
                  <div className="schFreeCard__top">
                    <span className="schFreeCard__day">{day}</span>
                    <span className="schFreeCard__meta">
                      {slots.length === 0
                        ? 'No 30+ min gaps'
                        : isAllDayFree
                          ? 'Free all day'
                          : `${slots.length} ${slots.length === 1 ? 'gap' : 'gaps'}`}
                    </span>
                  </div>

                  {longestSlot && !isAllDayFree ? (
                    <div className="schFreeCard__summary">
                      Longest: {formatDuration(longestSlot.start, longestSlot.end)}
                    </div>
                  ) : null}

                  <div className="schFreeCard__slots">
                    {slots.length === 0 ? (
                      <span className="schFreeEmpty">No open block long enough to matter.</span>
                    ) : slots.map((slot) => (
                      <span
                        key={`${day}-${slot.start}-${slot.end}`}
                        className={`schFreeChip${isAllDayFree ? ' isFullDay' : ''}`}
                      >
                        {formatTime(slot.start)} - {formatTime(slot.end)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Right-click color picker */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "10px",
            zIndex: 100000,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            minWidth: "180px",
          }}
        >
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            {(["picker", "rgb"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setColorTab(tab)}
                style={{
                  flex: 1,
                  padding: "4px",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor:
                    colorTab === tab ? "#A32638" : "var(--panel2)",
                  color: colorTab === tab ? "#fff" : "var(--text)",
                  fontSize: "11px",
                }}
              >
                {tab === "picker" ? "🎨 Picker" : "RGB"}
              </button>
            ))}
          </div>

          {colorTab === "picker" &&
            (() => {
              const hueColor = `hsl(${hue}, 100%, 50%)`;
              const sat = pickerPos.x;
              const val = 1 - pickerPos.y;
              const c2 = val * sat;
              const x2 = c2 * (1 - Math.abs(((hue / 60) % 2) - 1));
              const m2 = val - c2;
              let rr = 0,
                gg = 0,
                bb = 0;
              if (hue < 60) {
                rr = c2;
                gg = x2;
              } else if (hue < 120) {
                rr = x2;
                gg = c2;
              } else if (hue < 180) {
                gg = c2;
                bb = x2;
              } else if (hue < 240) {
                gg = x2;
                bb = c2;
              } else if (hue < 300) {
                rr = x2;
                bb = c2;
              } else {
                rr = c2;
                bb = x2;
              }
              const pr = Math.round((rr + m2) * 255);
              const pg = Math.round((gg + m2) * 255);
              const pb = Math.round((bb + m2) * 255);
              const pickedHex = rgbToHex(pr, pg, pb);

              const handleGradientClick = (
                e: React.MouseEvent<HTMLDivElement>,
              ) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(
                  0,
                  Math.min(1, (e.clientX - rect.left) / rect.width),
                );
                const y = Math.max(
                  0,
                  Math.min(1, (e.clientY - rect.top) / rect.height),
                );
                setPickerPos({ x, y });
              };
              const handleHueClick = (e: React.MouseEvent<HTMLDivElement>) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const y = Math.max(
                  0,
                  Math.min(1, (e.clientY - rect.top) / rect.height),
                );
                setHue(Math.round(y * 360));
              };

              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", gap: "6px" }}>
                    <div
                      onClick={handleGradientClick}
                      style={{
                        width: "160px",
                        height: "120px",
                        position: "relative",
                        background: `linear-gradient(to bottom, transparent, black), linear-gradient(to right, white, ${hueColor})`,
                        borderRadius: "4px",
                        cursor: "crosshair",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: `calc(${pickerPos.x * 100}% - 6px)`,
                          top: `calc(${pickerPos.y * 100}% - 6px)`,
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          border: "2px solid #fff",
                          boxShadow: "0 0 2px rgba(0,0,0,0.8)",
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                    <div
                      onClick={handleHueClick}
                      style={{
                        width: "16px",
                        height: "120px",
                        flexShrink: 0,
                        background:
                          "linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
                        borderRadius: "4px",
                        cursor: "ns-resize",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: `calc(${(hue / 360) * 100}% - 3px)`,
                          left: "-2px",
                          right: "-2px",
                          height: "6px",
                          border: "2px solid #fff",
                          borderRadius: "2px",
                          boxShadow: "0 0 2px rgba(0,0,0,0.8)",
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "4px",
                        backgroundColor: pickedHex,
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--muted)",
                        flex: 1,
                      }}
                    >
                      {pickedHex.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePickColor(pickedHex)}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: "#A32638",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              );
            })()}

          {colorTab === "rgb" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {(["r", "g", "b"] as const).map((ch) => (
                <div
                  key={ch}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span
                    style={{
                      color:
                        ch === "r"
                          ? "#ff6666"
                          : ch === "g"
                            ? "#66ff66"
                            : "#6699ff",
                      width: "12px",
                      fontWeight: "bold",
                      fontSize: "12px",
                    }}
                  >
                    {ch.toUpperCase()}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={rgbInput[ch]}
                    onChange={(e) =>
                      setRgbInput((prev) => ({
                        ...prev,
                        [ch]: Math.max(
                          0,
                          Math.min(255, parseInt(e.target.value) || 0),
                        ),
                      }))
                    }
                    style={{
                      flex: 1,
                      backgroundColor: "var(--panel2)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      borderRadius: "4px",
                      padding: "4px 6px",
                      fontSize: "12px",
                    }}
                  />
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "4px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "4px",
                    backgroundColor: rgbToHex(
                      rgbInput.r,
                      rgbInput.g,
                      rgbInput.b,
                    ),
                    border: "1px solid var(--border)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ fontSize: "11px", color: "var(--muted)", flex: 1 }}
                >
                  {rgbToHex(rgbInput.r, rgbInput.g, rgbInput.b).toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={handleRgbApply}
                  style={{
                    padding: "6px 10px",
                    backgroundColor: "#A32638",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--border)",
              margin: "10px 0",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {(() => {
              const course = courses.find(
                (c) => c.id === contextMenu!.courseId,
              );
              if (!course) return null;
              return (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveCourse(course);
                      setContextMenu(null);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 9px",
                      textAlign: "left",
                      backgroundColor: "rgba(255, 92, 92, 0.12)",
                      border: "1px solid rgba(255, 92, 92, 0.28)",
                      borderRadius: "6px",
                      color: "var(--text)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    Remove from schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewModal({ course, mode: "view" });
                      setContextMenu(null);
                    }}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      textAlign: "left",
                      backgroundColor: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "5px",
                      color: "var(--text)",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    ⭐ View Reviews
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewModal({ course, mode: "write" });
                      setContextMenu(null);
                    }}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      textAlign: "left",
                      backgroundColor: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "5px",
                      color: "var(--text)",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    ✏️ Write a Review
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
          }}
          onClick={() => setReviewModal(null)}
        >
          <div
            style={{
              backgroundColor: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "24px",
              minWidth: "340px",
              maxWidth: "480px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: "15px",
                    color: "var(--text)",
                  }}
                >
                  {reviewModal.mode === "view"
                    ? "⭐ Reviews"
                    : "✏️ Write a Review"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                  {reviewModal.course.code} – {reviewModal.course.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: "18px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            {reviewModal.mode === "view" ? (
              <div
                style={{
                  color: "var(--muted)",
                  fontSize: "13px",
                  textAlign: "center",
                  padding: "20px 0",
                }}
              >
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>🚧</div>
                <div>Reviews coming soon.</div>
                <div
                  style={{
                    fontSize: "11px",
                    marginTop: "4px",
                    color: "var(--muted)",
                  }}
                >
                  This feature is not yet connected to a backend.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Rating
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--panel2)",
                          color: "#f0c040",
                          fontSize: "16px",
                          cursor: "pointer",
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Comment
                  </label>
                  <textarea
                    placeholder="Share your experience..."
                    style={{
                      width: "100%",
                      minHeight: "80px",
                      backgroundColor: "var(--panel2)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      color: "var(--text)",
                      padding: "8px",
                      fontSize: "13px",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  type="button"
                  style={{
                    backgroundColor: "#A32638",
                    color: "#fff",
                    border: "none",
                    padding: "8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "bold",
                  }}
                >
                  Submit Review (Coming Soon)
                </button>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  Review submission is not yet connected to a backend.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
