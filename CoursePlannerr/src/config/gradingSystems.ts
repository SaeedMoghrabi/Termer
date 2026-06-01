import {
  DEFAULT_UNIVERSITY_ID,
  type UniversityId,
} from "./universities.ts";

export type ScoreBand = {
  min: number;
  max: number;
  letter?: string;
  note?: string;
  points?: number;
};

export type GradingSystem = {
  universityId: UniversityId;
  scaleMax: number;
  gpaCap?: number;
  letterGrades: string[];
  gradePoints: Record<string, number>;
  percentBands?: ScoreBand[];
  percentScaleNote?: string;
  gpaNote?: string;
};

export type GradeToneKey =
  | "neutral"
  | "excellent"
  | "strong"
  | "caution"
  | "risk"
  | "fail"
  | "warning";

export type GradeFeedbackTone = {
  key: GradeToneKey;
  label: string;
  accent: string;
  accentSoft: string;
  surfaceStart: string;
  surfaceEnd: string;
  border: string;
  glow: string;
  letterBg: string;
  letterBorder: string;
  title: string;
  muted: string;
};

const GRADE_FEEDBACK_TONES: Record<GradeToneKey, GradeFeedbackTone> = {
  neutral: {
    key: "neutral",
    label: "Needs context",
    accent: "#2563EB",
    accentSoft: "rgba(37, 99, 235, 0.2)",
    surfaceStart: "rgba(37, 99, 235, 0.22)",
    surfaceEnd: "rgba(15, 23, 42, 0.96)",
    border: "rgba(96, 165, 250, 0.34)",
    glow: "rgba(37, 99, 235, 0.18)",
    letterBg: "rgba(255, 255, 255, 0.1)",
    letterBorder: "rgba(191, 219, 254, 0.2)",
    title: "#F8FAFC",
    muted: "rgba(219, 234, 254, 0.82)",
  },
  excellent: {
    key: "excellent",
    label: "Excellent range",
    accent: "#198038",
    accentSoft: "rgba(25, 128, 56, 0.24)",
    surfaceStart: "rgba(25, 128, 56, 0.28)",
    surfaceEnd: "rgba(10, 25, 16, 0.97)",
    border: "rgba(74, 222, 128, 0.3)",
    glow: "rgba(25, 128, 56, 0.2)",
    letterBg: "rgba(255, 255, 255, 0.11)",
    letterBorder: "rgba(187, 247, 208, 0.2)",
    title: "#F7FEE7",
    muted: "rgba(220, 252, 231, 0.84)",
  },
  strong: {
    key: "strong",
    label: "Strong range",
    accent: "#0F62FE",
    accentSoft: "rgba(15, 98, 254, 0.22)",
    surfaceStart: "rgba(15, 98, 254, 0.26)",
    surfaceEnd: "rgba(13, 26, 54, 0.97)",
    border: "rgba(96, 165, 250, 0.32)",
    glow: "rgba(15, 98, 254, 0.2)",
    letterBg: "rgba(255, 255, 255, 0.11)",
    letterBorder: "rgba(191, 219, 254, 0.2)",
    title: "#EFF6FF",
    muted: "rgba(219, 234, 254, 0.84)",
  },
  caution: {
    key: "caution",
    label: "Caution range",
    accent: "#EB6200",
    accentSoft: "rgba(235, 98, 0, 0.22)",
    surfaceStart: "rgba(235, 98, 0, 0.25)",
    surfaceEnd: "rgba(42, 20, 7, 0.97)",
    border: "rgba(251, 146, 60, 0.3)",
    glow: "rgba(235, 98, 0, 0.18)",
    letterBg: "rgba(255, 255, 255, 0.11)",
    letterBorder: "rgba(254, 215, 170, 0.2)",
    title: "#FFF7ED",
    muted: "rgba(254, 215, 170, 0.86)",
  },
  risk: {
    key: "risk",
    label: "At-risk range",
    accent: "#C2410C",
    accentSoft: "rgba(194, 65, 12, 0.22)",
    surfaceStart: "rgba(194, 65, 12, 0.28)",
    surfaceEnd: "rgba(49, 18, 10, 0.97)",
    border: "rgba(251, 146, 60, 0.3)",
    glow: "rgba(194, 65, 12, 0.18)",
    letterBg: "rgba(255, 255, 255, 0.1)",
    letterBorder: "rgba(253, 186, 116, 0.18)",
    title: "#FFF7ED",
    muted: "rgba(254, 215, 170, 0.84)",
  },
  fail: {
    key: "fail",
    label: "Failing range",
    accent: "#DA1E28",
    accentSoft: "rgba(218, 30, 40, 0.2)",
    surfaceStart: "rgba(218, 30, 40, 0.24)",
    surfaceEnd: "rgba(40, 12, 16, 0.97)",
    border: "rgba(252, 165, 165, 0.28)",
    glow: "rgba(218, 30, 40, 0.18)",
    letterBg: "rgba(255, 255, 255, 0.1)",
    letterBorder: "rgba(254, 202, 202, 0.18)",
    title: "#FEF2F2",
    muted: "rgba(254, 226, 226, 0.84)",
  },
  warning: {
    key: "warning",
    label: "Needs review",
    accent: "#B7791F",
    accentSoft: "rgba(183, 121, 31, 0.2)",
    surfaceStart: "rgba(183, 121, 31, 0.24)",
    surfaceEnd: "rgba(40, 28, 8, 0.97)",
    border: "rgba(245, 158, 11, 0.28)",
    glow: "rgba(183, 121, 31, 0.16)",
    letterBg: "rgba(255, 255, 255, 0.1)",
    letterBorder: "rgba(253, 230, 138, 0.18)",
    title: "#FFFBEB",
    muted: "rgba(254, 243, 199, 0.84)",
  },
};

const GRADING_SYSTEMS: Record<UniversityId, GradingSystem> = {
  aub: {
    universityId: "aub",
    scaleMax: 4.0,
    gpaCap: 4.0,
    letterGrades: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
    gradePoints: {
      "A+": 4.3,
      A: 4.0,
      "A-": 3.7,
      "B+": 3.3,
      B: 3.0,
      "B-": 2.7,
      "C+": 2.3,
      C: 2.0,
      "C-": 1.7,
      "D+": 1.3,
      D: 1.0,
      F: 0.0,
    },
    percentBands: [
      { min: 93, max: 100, letter: "A+" },
      { min: 87, max: 92.999, letter: "A" },
      { min: 83, max: 86.999, letter: "A-" },
      { min: 79, max: 82.999, letter: "B+" },
      { min: 75, max: 78.999, letter: "B" },
      { min: 72, max: 74.999, letter: "B-" },
      { min: 69, max: 71.999, letter: "C+" },
      { min: 66, max: 68.999, letter: "C" },
      { min: 63, max: 65.999, letter: "C-" },
      { min: 61, max: 62.999, letter: "D+" },
      { min: 60, max: 60.999, letter: "D" },
      { min: 0, max: 59.999, letter: "F" },
    ],
    gpaNote: "AUB assigns A+ = 4.3 quality points, but the cumulative GPA is capped at 4.0.",
  },
  lau: {
    universityId: "lau",
    scaleMax: 4.0,
    letterGrades: ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
    gradePoints: {
      A: 4.0,
      "A-": 3.67,
      "B+": 3.33,
      B: 3.0,
      "B-": 2.67,
      "C+": 2.33,
      C: 2.0,
      "C-": 1.67,
      "D+": 1.33,
      D: 1.0,
      F: 0.0,
    },
    percentBands: [
      { min: 90, max: 100, letter: "A" },
      { min: 87, max: 89.999, letter: "A-" },
      { min: 83, max: 86.999, letter: "B+" },
      { min: 80, max: 82.999, letter: "B" },
      { min: 77, max: 79.999, letter: "B-" },
      { min: 73, max: 76.999, letter: "C+" },
      { min: 70, max: 72.999, letter: "C" },
      { min: 67, max: 69.999, letter: "C-" },
      { min: 63, max: 66.999, letter: "D+" },
      { min: 60, max: 62.999, letter: "D" },
      { min: 0, max: 59.999, letter: "F" },
    ],
    percentScaleNote:
      "LAU publishes the current 2023 GPA points university-wide. The percentage-to-letter equivalence used here matches the official LAU nursing handbook's published university numerical equivalence.",
  },
  usek: {
    universityId: "usek",
    scaleMax: 4.0,
    letterGrades: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
    gradePoints: {
      "A+": 4.0,
      A: 4.0,
      "A-": 3.67,
      "B+": 3.33,
      B: 3.0,
      "B-": 2.67,
      "C+": 2.33,
      C: 2.0,
      "C-": 1.67,
      "D+": 1.33,
      D: 1.0,
      F: 0.0,
    },
    percentBands: [
      { min: 93, max: 100, letter: "A+" },
      { min: 90, max: 92.999, letter: "A" },
      { min: 87, max: 89.999, letter: "A-" },
      { min: 83, max: 86.999, letter: "B+" },
      { min: 80, max: 82.999, letter: "B" },
      { min: 77, max: 79.999, letter: "B-" },
      { min: 73, max: 76.999, letter: "C+" },
      { min: 70, max: 72.999, letter: "C" },
      { min: 67, max: 69.999, letter: "C-" },
      { min: 63, max: 66.999, letter: "D+" },
      { min: 60, max: 62.999, letter: "D" },
      { min: 0, max: 59.999, letter: "F" },
    ],
  },
  bau: {
    universityId: "bau",
    scaleMax: 4.0,
    letterGrades: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"],
    gradePoints: {
      "A+": 4.0,
      A: 4.0,
      "A-": 3.67,
      "B+": 3.33,
      B: 3.0,
      "B-": 2.67,
      "C+": 2.33,
      C: 2.0,
      "C-": 1.67,
      D: 1.33,
      F: 0.0,
    },
    percentBands: [
      { min: 95, max: 100, letter: "A+" },
      { min: 90, max: 94.999, letter: "A" },
      { min: 86, max: 89.999, letter: "A-" },
      { min: 83, max: 85.999, letter: "B+" },
      { min: 80, max: 82.999, letter: "B" },
      { min: 76, max: 79.999, letter: "B-" },
      { min: 73, max: 75.999, letter: "C+" },
      { min: 70, max: 72.999, letter: "C" },
      { min: 65, max: 69.999, letter: "C-" },
      { min: 60, max: 64.999, letter: "D" },
      { min: 0, max: 59.999, letter: "F" },
    ],
  },
  ndu: {
    universityId: "ndu",
    scaleMax: 4.0,
    letterGrades: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
    gradePoints: {
      "A+": 4.0,
      A: 4.0,
      "A-": 3.7,
      "B+": 3.3,
      B: 3.0,
      "B-": 2.7,
      "C+": 2.3,
      C: 2.0,
      "C-": 1.7,
      "D+": 1.3,
      D: 1.0,
      F: 0.0,
    },
    percentBands: [
      { min: 97, max: 100, letter: "A+" },
      { min: 93, max: 96.999, letter: "A" },
      { min: 89, max: 92.999, letter: "A-" },
      { min: 85, max: 88.999, letter: "B+" },
      { min: 80, max: 84.999, letter: "B" },
      { min: 77, max: 79.999, letter: "B-" },
      { min: 73, max: 76.999, letter: "C+" },
      { min: 70, max: 72.999, letter: "C" },
      { min: 66, max: 69.999, letter: "C-" },
      { min: 63, max: 65.999, letter: "D+" },
      { min: 60, max: 62.999, letter: "D" },
      { min: 0, max: 59.999, letter: "F" },
    ],
  },
  aust: {
    universityId: "aust",
    scaleMax: 4.0,
    letterGrades: ["A", "B", "C", "D", "F"],
    gradePoints: {
      A: 4.0,
      B: 3.0,
      C: 2.0,
      D: 1.0,
      F: 0.0,
    },
    percentBands: [
      { min: 90, max: 100, letter: "A" },
      { min: 80, max: 89.999, letter: "B" },
      { min: 70, max: 79.999, letter: "C" },
      { min: 60, max: 69.999, letter: "D" },
      { min: 0, max: 59.999, letter: "F" },
    ],
  },
  usj: {
    universityId: "usj",
    scaleMax: 4.0,
    letterGrades: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"],
    gradePoints: {
      "A+": 4.0,
      A: 4.0,
      "A-": 3.7,
      "B+": 3.3,
      B: 3.1,
      "B-": 3.0,
      "C+": 2.7,
      C: 2.3,
      "C-": 2.1,
      "D+": 2.0,
      D: 1.7,
      "D-": 1.3,
      F: 0.0,
    },
    percentBands: [
      { min: 90, max: 100, letter: "A+" },
      { min: 85, max: 89.999, letter: "A" },
      { min: 80, max: 84.999, letter: "A-" },
      { min: 76.7, max: 79.999, letter: "B+" },
      { min: 73.35, max: 76.699, letter: "B" },
      { min: 70, max: 73.349, letter: "B-" },
      { min: 66.7, max: 69.999, letter: "C+" },
      { min: 63.35, max: 66.699, letter: "C" },
      { min: 60, max: 63.349, letter: "C-" },
      { min: 56.7, max: 59.999, letter: "D+" },
      { min: 53.35, max: 56.699, letter: "D" },
      { min: 50, max: 53.349, letter: "D-" },
      {
        min: 40,
        max: 49.999,
        note: "This score falls in USJ's official jury-adjustment range, so it does not map to a fixed transcript letter automatically.",
      },
      { min: 0, max: 39.999, letter: "F" },
    ],
  },
  lu: {
    universityId: "lu",
    scaleMax: 5.0,
    letterGrades: ["A+", "A", "B+", "B", "C+", "C", "D+", "D", "E", "F"],
    gradePoints: {
      "A+": 5.0,
      A: 4.5,
      "B+": 4.0,
      B: 3.5,
      "C+": 3.0,
      C: 2.5,
      "D+": 2.0,
      D: 1.5,
      E: 1.0,
      F: 0.0,
    },
    percentScaleNote:
      "Lebanese University publishes the official credit-system rank values on a 5-point scale, but not a single university-wide percentage-to-letter conversion table.",
  },
  liu: {
    universityId: "liu",
    scaleMax: 4.0,
    letterGrades: ["A", "B+", "B", "C+", "C", "D+", "D", "F"],
    gradePoints: {
      A: 4.0,
      "B+": 3.9,
      B: 3.4,
      "C+": 2.9,
      C: 2.4,
      "D+": 1.9,
      D: 1.4,
      F: 0.0,
    },
    percentBands: [
      { min: 90, max: 100, letter: "A", points: 4.0 },
      { min: 89, max: 89.999, letter: "B+", points: 3.9 },
      { min: 88, max: 88.999, letter: "B+", points: 3.8 },
      { min: 87, max: 87.999, letter: "B+", points: 3.7 },
      { min: 86, max: 86.999, letter: "B+", points: 3.6 },
      { min: 85, max: 85.999, letter: "B+", points: 3.5 },
      { min: 84, max: 84.999, letter: "B", points: 3.4 },
      { min: 83, max: 83.999, letter: "B", points: 3.3 },
      { min: 82, max: 82.999, letter: "B", points: 3.2 },
      { min: 81, max: 81.999, letter: "B", points: 3.1 },
      { min: 80, max: 80.999, letter: "C+", points: 3.0 },
      { min: 79, max: 79.999, letter: "C+", points: 2.9 },
      { min: 78, max: 78.999, letter: "C+", points: 2.8 },
      { min: 77, max: 77.999, letter: "C+", points: 2.7 },
      { min: 76, max: 76.999, letter: "C+", points: 2.6 },
      { min: 75, max: 75.999, letter: "C", points: 2.5 },
      { min: 74, max: 74.999, letter: "C", points: 2.4 },
      { min: 73, max: 73.999, letter: "C", points: 2.3 },
      { min: 72, max: 72.999, letter: "C", points: 2.2 },
      { min: 71, max: 71.999, letter: "C", points: 2.1 },
      { min: 70, max: 70.999, letter: "D+", points: 2.0 },
      { min: 69, max: 69.999, letter: "D+", points: 1.9 },
      { min: 68, max: 68.999, letter: "D+", points: 1.8 },
      { min: 67, max: 67.999, letter: "D+", points: 1.7 },
      { min: 66, max: 66.999, letter: "D", points: 1.6 },
      { min: 65, max: 65.999, letter: "D", points: 1.5 },
      { min: 64, max: 64.999, letter: "D", points: 1.4 },
      { min: 63, max: 63.999, letter: "D", points: 1.3 },
      { min: 62, max: 62.999, letter: "D", points: 1.2 },
      { min: 61, max: 61.999, letter: "D", points: 1.1 },
      { min: 60, max: 60.999, letter: "D", points: 1.0 },
      { min: 0, max: 59.999, letter: "F", points: 0.0 },
    ],
    percentScaleNote:
      "LIU publishes transcript letters in broad bands, but the quality points still change by exact percentage inside those bands.",
    gpaNote:
      "LIU quality points vary by exact course percentage within each transcript letter band. The grade calculator uses the published percentage table directly.",
  },
};

export function getGradingSystem(universityId?: string): GradingSystem {
  const key = (universityId && universityId in GRADING_SYSTEMS
    ? universityId
    : DEFAULT_UNIVERSITY_ID) as UniversityId;

  return GRADING_SYSTEMS[key];
}

export function getGradeScaleMax(universityId?: string): number {
  const system = getGradingSystem(universityId);
  return system.gpaCap ?? system.scaleMax;
}

export function getTopGrade(universityId?: string): string {
  return getGradingSystem(universityId).letterGrades[0] ?? "A";
}

function getBandForScore(score: number, universityId?: string) {
  const system = getGradingSystem(universityId);

  if (!Number.isFinite(score)) {
    return null;
  }

  return system.percentBands?.find(
    (entry) => score >= entry.min && score <= entry.max,
  ) ?? null;
}

export function getScoreResult(score: number, universityId?: string) {
  const system = getGradingSystem(universityId);

  if (!Number.isFinite(score)) {
    return { letter: null, note: null };
  }

  if (!system.percentBands?.length) {
    return {
      letter: null,
      note: system.percentScaleNote ?? null,
    };
  }

  const band = getBandForScore(score, universityId);

  if (!band) {
    return { letter: null, note: system.percentScaleNote ?? null };
  }

  return {
    letter: band.letter ?? null,
    note: band.note ?? null,
  };
}

export function getScoreQualityPoints(score: number, universityId?: string) {
  const system = getGradingSystem(universityId);
  const band = getBandForScore(score, universityId);

  if (!band) {
    return null;
  }

  if (typeof band.points === "number") {
    return band.points;
  }

  if (band.letter) {
    const points = system.gradePoints[band.letter];
    return typeof points === "number" ? points : null;
  }

  return null;
}

export function getGradeFeedbackTone({
  universityId,
  letter,
  note,
}: {
  universityId?: string;
  letter?: string | null;
  note?: string | null;
}): GradeFeedbackTone {
  if (letter) {
    const system = getGradingSystem(universityId);
    const scaleMax = system.gpaCap ?? system.scaleMax;
    const points = system.gradePoints[letter];

    if (typeof points === "number" && scaleMax > 0) {
      const ratio = Math.min(Math.max(points / scaleMax, 0), 1);

      if (ratio >= 0.88) return GRADE_FEEDBACK_TONES.excellent;
      if (ratio >= 0.66) return GRADE_FEEDBACK_TONES.strong;
      if (ratio >= 0.48) return GRADE_FEEDBACK_TONES.caution;
      if (ratio > 0) return GRADE_FEEDBACK_TONES.risk;
      return GRADE_FEEDBACK_TONES.fail;
    }
  }

  if (note) {
    if (/jury-adjustment|needs review|manual/i.test(note)) {
      return GRADE_FEEDBACK_TONES.warning;
    }

    return GRADE_FEEDBACK_TONES.neutral;
  }

  return GRADE_FEEDBACK_TONES.neutral;
}
