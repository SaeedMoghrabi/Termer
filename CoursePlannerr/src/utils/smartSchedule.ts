import type { Course, Day } from "../types.ts";
import { timeToMinutes } from "./schedule.ts";

export type BlockedTime = {
  id: string;
  label: string;
  days: Day[];
  start: string;
  end: string;
};

export type ScheduleQualityMetrics = {
  score: number;
  campusDays: number;
  campuses: string[];
  conflicts: number;
  tbaCourses: number;
  fullCourses: number;
  averageOpenSeats: number;
  longestGapMinutes: number;
  registrationReady: boolean;
  warnings: string[];
};

export type GeneratedSchedule = {
  id: string;
  label: string;
  courses: Course[];
  metrics: ScheduleQualityMetrics;
};

type GenerateInput = {
  allCourses: Course[];
  wantedCourses: Course[];
  lockedCourseIds: string[];
  blockedTimes: BlockedTime[];
  openSeatsOnly?: boolean;
  excludeFriday?: boolean;
  maxOptions?: number;
};

type CourseLike = Pick<Course, "id" | "meetings" | "campus" | "capacity" | "department" | "courseNumber">;

function subjectKey(course: CourseLike) {
  return `${course.department}`.trim().toUpperCase() + `${course.courseNumber}`.trim().toUpperCase();
}

function openSeats(course: CourseLike) {
  const limit = Number(course.capacity?.limit ?? 0);
  const enrolled = Number(course.capacity?.enrolled ?? 0);
  if (limit <= 0) return 0;
  return Math.max(0, limit - enrolled);
}

function hasPostedMeeting(course: CourseLike) {
  return course.meetings.some((meeting) =>
    meeting.days.length > 0 && timeToMinutes(meeting.start) !== null && timeToMinutes(meeting.end) !== null,
  );
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function coursesConflict(left: CourseLike, right: CourseLike) {
  return left.meetings.some((leftMeeting) =>
    right.meetings.some((rightMeeting) =>
      leftMeeting.days.some((day) => rightMeeting.days.includes(day))
      && rangesOverlap(leftMeeting.start, leftMeeting.end, rightMeeting.start, rightMeeting.end),
    ),
  );
}

function courseHitsBlockedTime(course: CourseLike, blockedTimes: BlockedTime[]) {
  return course.meetings.some((meeting) =>
    blockedTimes.some((block) =>
      meeting.days.some((day) => block.days.includes(day))
      && rangesOverlap(meeting.start, meeting.end, block.start, block.end),
    ),
  );
}

function getLongestGapMinutes(courses: Course[]) {
  let longest = 0;
  const days: Day[] = ["M", "T", "W", "R", "F", "S"];

  days.forEach((day) => {
    const meetings = courses
      .flatMap((course) => course.meetings)
      .filter((meeting) => meeting.days.includes(day))
      .map((meeting) => ({
        start: timeToMinutes(meeting.start) ?? 0,
        end: timeToMinutes(meeting.end) ?? 0,
      }))
      .filter((meeting) => meeting.end > meeting.start)
      .sort((left, right) => left.start - right.start);

    meetings.forEach((meeting, index) => {
      const next = meetings[index + 1];
      if (next) longest = Math.max(longest, next.start - meeting.end);
    });
  });

  return longest;
}

export function getScheduleQuality(courses: Course[]): ScheduleQualityMetrics {
  const campusDays = new Set<Day>();
  const campuses = new Set<string>();
  let conflicts = 0;

  courses.forEach((course, index) => {
    if (course.campus) campuses.add(course.campus);
    course.meetings.forEach((meeting) => meeting.days.forEach((day) => campusDays.add(day)));
    courses.slice(index + 1).forEach((other) => {
      if (coursesConflict(course, other)) conflicts += 1;
    });
  });

  const tbaCourses = courses.filter((course) => !hasPostedMeeting(course)).length;
  const fullCourses = courses.filter((course) => openSeats(course) <= 0 && Number(course.capacity?.limit ?? 0) > 0).length;
  const seatCounts = courses.map(openSeats).filter((count) => count > 0);
  const averageOpenSeats = seatCounts.length
    ? seatCounts.reduce((sum, count) => sum + count, 0) / seatCounts.length
    : 0;
  const longestGapMinutes = getLongestGapMinutes(courses);

  let score = 100;
  score -= conflicts * 26;
  score -= Math.max(0, campusDays.size - 3) * 5;
  score -= Math.max(0, campuses.size - 1) * 4;
  score -= tbaCourses * 6;
  score -= fullCourses * 10;
  score -= Math.min(18, Math.floor(longestGapMinutes / 45) * 2);
  score += Math.min(8, Math.floor(averageOpenSeats / 5));

  const warnings: string[] = [];
  if (conflicts) warnings.push(`${conflicts} conflict${conflicts === 1 ? "" : "s"}`);
  if (fullCourses) warnings.push(`${fullCourses} full section${fullCourses === 1 ? "" : "s"}`);
  if (tbaCourses) warnings.push(`${tbaCourses} TBA course${tbaCourses === 1 ? "" : "s"}`);
  if (campuses.size > 1) warnings.push(`${campuses.size} campuses`);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    campusDays: campusDays.size,
    campuses: Array.from(campuses),
    conflicts,
    tbaCourses,
    fullCourses,
    averageOpenSeats: Number(averageOpenSeats.toFixed(1)),
    longestGapMinutes,
    registrationReady: conflicts === 0 && fullCourses === 0,
    warnings,
  };
}

function isCandidateAllowed(course: Course, input: GenerateInput) {
  if (input.openSeatsOnly && openSeats(course) <= 0) return false;
  if (input.excludeFriday && course.meetings.some((meeting) => meeting.days.includes("F"))) return false;
  return !courseHitsBlockedTime(course, input.blockedTimes);
}

export function generateScheduleOptions(input: GenerateInput): GeneratedSchedule[] {
  const maxOptions = input.maxOptions ?? 5;
  const lockedSet = new Set(input.lockedCourseIds);
  const lockedCourses = input.wantedCourses.filter((course) => lockedSet.has(course.id));
  const wantedBySubject = new Map<string, Course[]>();

  input.wantedCourses.forEach((course) => {
    const key = subjectKey(course);
    const existing = wantedBySubject.get(key) ?? [];
    existing.push(course);
    wantedBySubject.set(key, existing);
  });

  lockedCourses.forEach((course) => wantedBySubject.delete(subjectKey(course)));

  const groups = Array.from(wantedBySubject.keys()).map((key) => {
    const catalogMatches = input.allCourses.filter((course) => subjectKey(course) === key);
    const fallbackMatches = wantedBySubject.get(key) ?? [];
    return (catalogMatches.length ? catalogMatches : fallbackMatches).filter((course) =>
      isCandidateAllowed(course, input),
    );
  });

  if (!lockedCourses.every((course) => isCandidateAllowed(course, input))) {
    return [];
  }

  if (groups.some((group) => group.length === 0)) {
    return [];
  }

  const options: GeneratedSchedule[] = [];
  const seen = new Set<string>();
  let inspected = 0;

  const visit = (index: number, current: Course[]) => {
    if (inspected > 6000) return;
    if (index === groups.length) {
      inspected += 1;
      const courses = [...lockedCourses, ...current];
      const key = courses.map((course) => course.id).sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);

      const metrics = getScheduleQuality(courses);
      options.push({
        id: `generated-${options.length + 1}`,
        label: `Option ${options.length + 1}`,
        courses,
        metrics,
      });
      return;
    }

    for (const candidate of groups[index]) {
      if (current.some((course) => course.id === candidate.id)) continue;
      if ([...lockedCourses, ...current].some((course) => coursesConflict(course, candidate))) continue;
      visit(index + 1, [...current, candidate]);
    }
  };

  visit(0, []);

  return options
    .sort((left, right) => right.metrics.score - left.metrics.score)
    .slice(0, maxOptions)
    .map((option, index) => ({
      ...option,
      id: `generated-${index + 1}`,
      label: `Option ${index + 1}`,
    }));
}
