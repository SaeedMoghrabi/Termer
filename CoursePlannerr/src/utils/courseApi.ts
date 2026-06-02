import type { Course, Day, Meeting } from "../types.ts";
import {
  DEFAULT_UNIVERSITY_ID,
  getUniversityById,
} from "../config/universities.ts";

const DAY_NAME_MAP: Record<string, Day> = {
  m: "M",
  mon: "M",
  monday: "M",
  t: "T",
  tue: "T",
  tues: "T",
  tuesday: "T",
  w: "W",
  wed: "W",
  wednesday: "W",
  r: "R",
  th: "R",
  thu: "R",
  thur: "R",
  thurs: "R",
  thursday: "R",
  f: "F",
  fri: "F",
  friday: "F",
  s: "S",
  sat: "S",
  saturday: "S",
};
const BAU_DEBBIEH_LOCATION_PREFIX = /^(ENG|ARCH|SCIENC|A4)\b/i;

function normalizeMeetingDay(token: string): Day | null {
  return DAY_NAME_MAP[String(token).trim().toLowerCase()] ?? null;
}

function parseMeetingDayToken(token: string): Day[] {
  const normalized = String(token).trim().toLowerCase().replace(/\./g, "");
  if (!normalized || /^(tba|arr|online|none|n\/a|na)$/i.test(normalized)) return [];

  const exact = normalizeMeetingDay(normalized);
  if (exact) return [exact];

  const compact = normalized.replace(/[^a-z]/g, "");
  const days: Day[] = [];

  for (let index = 0; index < compact.length;) {
    if (compact.startsWith("thursday", index)) {
      days.push("R");
      index += "thursday".length;
      continue;
    }
    if (compact.startsWith("thurs", index)) {
      days.push("R");
      index += "thurs".length;
      continue;
    }
    if (compact.startsWith("thur", index)) {
      days.push("R");
      index += "thur".length;
      continue;
    }
    if (compact.startsWith("thu", index)) {
      days.push("R");
      index += "thu".length;
      continue;
    }
    if (compact.startsWith("th", index)) {
      days.push("R");
      index += 2;
      continue;
    }

    const day = normalizeMeetingDay(compact[index]);
    if (day) days.push(day);
    index += 1;
  }

  return days;
}

function uniqueDays(days: Day[]): Day[] {
  return [...new Set(days)];
}

function parseMeetingDays(rawDays: unknown): Day[] {
  if (Array.isArray(rawDays)) {
    return uniqueDays(rawDays.flatMap((value) => parseMeetingDays(value)));
  }

  return uniqueDays(
    String(rawDays ?? "")
      .split(/[\s,/|-]+/)
      .flatMap((value) => parseMeetingDayToken(value)),
  );
}

function normalizeMilitaryTime(rawTime: unknown): string | null {
  const time = String(rawTime ?? "").trim();
  if (!time) return null;

  const meridianMatch = time.match(/^(\d{1,2})(?::?([0-5]\d))?\s*([ap])\.?m?\.?$/i);
  if (meridianMatch) {
    let hours = Number(meridianMatch[1]);
    const minutes = Number(meridianMatch[2] ?? 0);
    const meridian = meridianMatch[3].toLowerCase();
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    if (meridian === "p" && hours !== 12) hours += 12;
    if (meridian === "a" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const hhmmMatch = time.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (hhmmMatch) {
    return `${hhmmMatch[1].padStart(2, "0")}:${hhmmMatch[2]}`;
  }

  const digits = time.replace(/\D/g, "");
  if (digits.length === 3) {
    return `0${digits[0]}:${digits.slice(1)}`;
  }
  if (digits.length === 4) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  return null;
}

function splitTimeRange(rawTime: unknown): [string, string] {
  const [rawStart = "", rawEnd = ""] = String(rawTime ?? "")
    .split(/\s*(?:-|\u2013|\u2014)\s*/)
    .map((value) => value.trim());
  return [rawStart, rawEnd];
}

function parseScheduleMeeting(schedule: any): Meeting[] {
  const days = parseMeetingDays(schedule?.days);
  const [rawStart = "", rawEnd = ""] = splitTimeRange(schedule?.time);
  const start = normalizeMilitaryTime(rawStart);
  const end = normalizeMilitaryTime(rawEnd);

  if (!days.length || !start || !end) {
    return [];
  }

  return [{
    days,
    start,
    end,
    location: String(schedule?.location ?? "").trim(),
    type: String(schedule?.type ?? "Lecture").trim() || "Lecture",
  }];
}

function parseMeetingObject(meeting: any): Meeting | null {
  const days = parseMeetingDays(
    meeting?.days
      ?? meeting?.day
      ?? meeting?.meeting_days
      ?? meeting?.meetingDays
      ?? meeting?.weekdays
      ?? meeting?.weekday,
  );
  const [rangeStart, rangeEnd] = splitTimeRange(
    meeting?.time
      ?? meeting?.hours
      ?? meeting?.meeting_time
      ?? meeting?.meetingTime
      ?? meeting?.period,
  );
  const start = normalizeMilitaryTime(
    meeting?.start
      ?? meeting?.start_time
      ?? meeting?.startTime
      ?? meeting?.begin_time
      ?? meeting?.beginTime
      ?? rangeStart,
  );
  const end = normalizeMilitaryTime(
    meeting?.end
      ?? meeting?.end_time
      ?? meeting?.endTime
      ?? meeting?.finish_time
      ?? meeting?.finishTime
      ?? rangeEnd,
  );

  if (!days.length || !start || !end) {
    return null;
  }

  return {
    days,
    start,
    end,
    location: String(meeting?.location ?? meeting?.room ?? meeting?.buildingRoom ?? "").trim(),
    type: String(meeting?.type ?? meeting?.scheduleType ?? meeting?.schedule_type ?? "Lecture").trim() || "Lecture",
  };
}

function dedupeMeetings(meetings: Meeting[]): Meeting[] {
  const mergedByShape = new Map<string, Meeting>();

  meetings.forEach((meeting) => {
    const normalizedDays = uniqueDays(
      Array.isArray(meeting.days)
        ? meeting.days.filter(Boolean)
        : [],
    );
    if (!normalizedDays.length || !meeting.start || !meeting.end) return;

    const key = `${meeting.start}:${meeting.end}:${meeting.location ?? ""}:${meeting.type ?? ""}`;
    const existing = mergedByShape.get(key);
    if (!existing) {
      mergedByShape.set(key, {
        ...meeting,
        days: normalizedDays,
      });
      return;
    }

    mergedByShape.set(key, {
      ...existing,
      days: uniqueDays([...(existing.days ?? []), ...normalizedDays]),
    });
  });

  const seen = new Set<string>();
  return Array.from(mergedByShape.values()).filter((meeting) => {
    const key = `${meeting.days.join("")}:${meeting.start}:${meeting.end}:${meeting.location ?? ""}:${meeting.type ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseCourseMeetings(rawCourse: any): Meeting[] {
  const meetingArrays = [
    rawCourse?.meetings,
    rawCourse?.meeting_times,
    rawCourse?.meetingTimes,
    rawCourse?.schedules,
    rawCourse?.schedule?.meetings,
  ];

  const parsedArrays = meetingArrays
    .filter(Array.isArray)
    .flatMap((meetings) => meetings.map((meeting: any) => parseMeetingObject(meeting)))
    .filter((meeting): meeting is Meeting => meeting !== null);

  if (parsedArrays.length) {
    return dedupeMeetings(parsedArrays);
  }

  if (Array.isArray(rawCourse?.schedule)) {
    return dedupeMeetings(rawCourse.schedule.flatMap((schedule: any) => parseScheduleMeeting(schedule)));
  }

  return parseScheduleMeeting(rawCourse?.schedule);
}

export function normalizeCourseMeetings<T extends { meetings?: unknown; schedule?: unknown }>(course: T): T & { meetings: Meeting[] } {
  return {
    ...course,
    meetings: parseCourseMeetings(course),
  };
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(
    values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  )];
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function choosePreferredString(primary: string | undefined, secondary: string | undefined, placeholder = "") {
  const left = String(primary ?? "").trim();
  const right = String(secondary ?? "").trim();
  if (!left) return right;
  if (!right) return left;
  if (placeholder && left.toLowerCase() === placeholder.toLowerCase()) return right;
  if (placeholder && right.toLowerCase() === placeholder.toLowerCase()) return left;
  return right.length > left.length ? right : left;
}

function chooseLongerString(primary: string | undefined, secondary: string | undefined) {
  const left = String(primary ?? "").trim();
  const right = String(secondary ?? "").trim();
  if (!left) return right;
  if (!right) return left;
  return right.length > left.length ? right : left;
}

function normalizeBauCampusFromLocation(rawCampus: unknown, rawLocation: unknown): string {
  const campus = String(rawCampus ?? "").trim() || "Main Campus";
  const normalizedCampus = campus.toLowerCase();
  const normalizedLocation = String(rawLocation ?? "").trim().toUpperCase();
  const looksLikeBeirutLabel = !normalizedCampus
    || normalizedCampus === "main campus"
    || normalizedCampus === "beirut"
    || normalizedCampus === "beirut campus";

  if (looksLikeBeirutLabel && BAU_DEBBIEH_LOCATION_PREFIX.test(normalizedLocation)) {
    return "Debbieh";
  }

  return campus;
}

function deriveNormalizedCampus(rawCourse: any, universityId: string, meetings: Meeting[]): string {
  const rawCampus = firstNonEmptyString(rawCourse?.campus, "Main Campus") || "Main Campus";

  if (universityId !== "bau") {
    return rawCampus;
  }

  const scheduleLocation = firstNonEmptyString(rawCourse?.schedule?.location);
  const meetingLocation = firstNonEmptyString(...meetings.map((meeting) => meeting.location));
  return normalizeBauCampusFromLocation(rawCampus, scheduleLocation || meetingLocation);
}

function getInstructorName(rawCourse: any): string {
  if (typeof rawCourse?.professors?.full_name === "string" && rawCourse.professors.full_name.trim()) {
    return rawCourse.professors.full_name.trim();
  }

  if (Array.isArray(rawCourse?.professors)) {
    const instructor = rawCourse.professors.find(
      (entry: any) => typeof entry?.full_name === "string" && entry.full_name.trim(),
    );
    if (instructor) return instructor.full_name.trim();
  }

  if (typeof rawCourse?.instructor === "string" && rawCourse.instructor.trim()) {
    return rawCourse.instructor.trim();
  }

  return "TBA";
}

function buildSourceScheduleState(rawCourse: any, meetings: Meeting[], universityName: string, section: string, scheduleType?: string) {
  const rawDays = String(rawCourse?.schedule?.days ?? "").trim();
  const rawTime = String(rawCourse?.schedule?.time ?? "").trim();
  const hasPublishedMeetings = meetings.length > 0;
  const looksCatalogOnly = !hasPublishedMeetings && (
    /^cat$/i.test(section)
    || /catalog/i.test(scheduleType ?? "")
    || (/^tba$/i.test(rawDays) && /^tba$/i.test(rawTime))
  );

  let sourceScheduleNote: string | undefined;
  if (looksCatalogOnly) {
    sourceScheduleNote = `${universityName} currently exposes this course as a catalog entry without public meeting days or times in the loaded source.`;
  } else if (!hasPublishedMeetings) {
    sourceScheduleNote = "Meeting days and times are not posted for this section in the current source.";
  }

  return {
    hasPublishedMeetings,
    isCatalogOnly: looksCatalogOnly,
    sourceScheduleNote,
  };
}

export function sanitizeCourse(rawCourse: any): Course {
  const universityId = firstNonEmptyString(
    rawCourse?.universityId,
    rawCourse?.university_id,
    DEFAULT_UNIVERSITY_ID,
  ).toLowerCase() || DEFAULT_UNIVERSITY_ID;
  const university = getUniversityById(universityId);
  const universityName = firstNonEmptyString(
    rawCourse?.universityName,
    rawCourse?.university_name,
    university.name,
  );
  const department = firstNonEmptyString(
    rawCourse?.department,
    rawCourse?.code?.match?.(/^[A-Za-z]+/)?.[0],
  ).toUpperCase();
  const courseNumber = firstNonEmptyString(
    rawCourse?.courseNumber,
    rawCourse?.course_number,
    rawCourse?.code?.match?.(/\d+[A-Za-z]*/)?.[0],
  ).toUpperCase();
  const code = firstNonEmptyString(rawCourse?.code, `${department} ${courseNumber}`.trim());
  const section = firstNonEmptyString(rawCourse?.section, rawCourse?.schedule?.section);
  const scheduleType = firstNonEmptyString(
    rawCourse?.scheduleType,
    rawCourse?.scheduleTypeDescription,
    rawCourse?.schedule?.type,
  ) || undefined;
  const termId = firstNonEmptyString(rawCourse?.termId, rawCourse?.semester, rawCourse?.term_code);
  const meetings = dedupeMeetings(parseCourseMeetings(rawCourse));
  const capacityLimit = typeof rawCourse?.capacity === "number"
    ? safeNumber(rawCourse.capacity)
    : safeNumber(
        rawCourse?.capacity?.limit
        ?? rawCourse?.capacity_limit
        ?? rawCourse?.limit,
      );
  const capacityEnrolled = typeof rawCourse?.capacity === "number"
    ? safeNumber(rawCourse?.enrolled_count ?? rawCourse?.enrolled)
    : safeNumber(
        rawCourse?.capacity?.enrolled
        ?? rawCourse?.enrolled_count
        ?? rawCourse?.enrolled,
      );
  const attributes = Array.isArray(rawCourse?.attributes)
    ? uniqueStrings(rawCourse.attributes.map((value: unknown) => String(value)))
    : [];
  const linkedCourses = Array.isArray(rawCourse?.linked_courses)
    ? uniqueStrings(rawCourse.linked_courses.map((value: unknown) => String(value)))
    : Array.isArray(rawCourse?.linkedCourses)
      ? uniqueStrings(rawCourse.linkedCourses.map((value: unknown) => String(value)))
      : [];
  const restrictions = Array.isArray(rawCourse?.restrictions)
    ? uniqueStrings(rawCourse.restrictions.map((value: unknown) => String(value))).join(" | ")
    : firstNonEmptyString(rawCourse?.restrictions) || undefined;
  const prerequisites = firstNonEmptyString(rawCourse?.prerequisites) || undefined;
  const derivedScheduleState = buildSourceScheduleState(
    rawCourse,
    meetings,
    universityName,
    section,
    scheduleType,
  );
  const hasPublishedMeetings = typeof rawCourse?.hasPublishedMeetings === "boolean"
    ? rawCourse.hasPublishedMeetings || meetings.length > 0
    : derivedScheduleState.hasPublishedMeetings;
  const isCatalogOnly = typeof rawCourse?.isCatalogOnly === "boolean"
    ? rawCourse.isCatalogOnly && meetings.length === 0
    : derivedScheduleState.isCatalogOnly;
  const campus = deriveNormalizedCampus(rawCourse, universityId, meetings);

  return {
    id: firstNonEmptyString(
      rawCourse?.id,
      `${universityId}:${termId}:${rawCourse?.crn ?? `${department}-${courseNumber}`}`,
    ),
    universityId,
    universityName,
    termId,
    crn: firstNonEmptyString(rawCourse?.crn),
    code,
    department,
    courseNumber,
    title: firstNonEmptyString(rawCourse?.title, "Untitled course"),
    instructor: getInstructorName(rawCourse),
    professorId: firstNonEmptyString(rawCourse?.professorId, rawCourse?.professor_id) || undefined,
    reviewDepartment: firstNonEmptyString(rawCourse?.reviewDepartment, rawCourse?.review_department) || undefined,
    campus,
    section,
    credits: safeNumber(rawCourse?.credits ?? rawCourse?.creditHourHigh ?? rawCourse?.creditHourLow),
    capacity: {
      enrolled: capacityEnrolled,
      limit: capacityLimit,
    },
    attributes,
    prerequisites,
    restrictions,
    difficulty: safeNumber(rawCourse?.difficulty),
    workload: safeNumber(rawCourse?.workload),
    meetings,
    isSectionLinked: Boolean(rawCourse?.isSectionLinked ?? rawCourse?.is_section_linked),
    linkIdentifier: rawCourse?.linkIdentifier ?? rawCourse?.link_identifier ?? null,
    linkedCourses,
    scheduleType,
    subjectCourse: firstNonEmptyString(
      rawCourse?.subjectCourse,
      department && courseNumber ? `${department}${courseNumber}` : "",
    ) || undefined,
    hasPublishedMeetings,
    isCatalogOnly,
    sourceScheduleNote: firstNonEmptyString(
      rawCourse?.sourceScheduleNote,
      derivedScheduleState.sourceScheduleNote,
    ) || undefined,
    description: firstNonEmptyString(
      rawCourse?.description,
      rawCourse?.course_description,
      rawCourse?.courseDescription,
    ) || undefined,
    academicLevel: firstNonEmptyString(
      rawCourse?.academicLevel,
      rawCourse?.academic_level,
      rawCourse?.level_description,
      rawCourse?.levelDescription,
    ) || undefined,
  };
}

export function sanitizeCourses(rawCourses: unknown): Course[] {
  if (!Array.isArray(rawCourses)) return [];
  return rawCourses.flatMap((course) => {
    try {
      return [sanitizeCourse(course)];
    } catch (error) {
      console.warn("Skipping unreadable course record.", error, course);
      return [];
    }
  });
}

export function mapApiCourseToCourse(rawCourse: any): Course {
  return sanitizeCourse(rawCourse);
}

function buildCourseMergeKey(course: Course) {
  return [
    course.universityId || DEFAULT_UNIVERSITY_ID,
    course.termId || "",
    course.crn || "",
    course.code || `${course.department} ${course.courseNumber}`.trim(),
    course.section || "",
  ].join("|");
}

function mergeMappedCourses(base: Course, incoming: Course): Course {
  return sanitizeCourse({
    ...base,
    universityName: choosePreferredString(base.universityName, incoming.universityName),
    termId: choosePreferredString(base.termId, incoming.termId),
    title: choosePreferredString(base.title, incoming.title, "Untitled course"),
    instructor: choosePreferredString(base.instructor, incoming.instructor, "TBA"),
    professorId: choosePreferredString(base.professorId, incoming.professorId) || undefined,
    reviewDepartment: choosePreferredString(base.reviewDepartment, incoming.reviewDepartment) || undefined,
    campus: choosePreferredString(base.campus, incoming.campus, "Main Campus") || "Main Campus",
    credits: Math.max(Number(base.credits ?? 0), Number(incoming.credits ?? 0)),
    capacity: {
      enrolled: Math.max(Number(base.capacity?.enrolled ?? 0), Number(incoming.capacity?.enrolled ?? 0)),
      limit: Math.max(Number(base.capacity?.limit ?? 0), Number(incoming.capacity?.limit ?? 0)),
    },
    attributes: uniqueStrings([...(base.attributes ?? []), ...(incoming.attributes ?? [])]),
    prerequisites: choosePreferredString(base.prerequisites, incoming.prerequisites) || undefined,
    restrictions: choosePreferredString(base.restrictions, incoming.restrictions) || undefined,
    difficulty: Math.max(Number(base.difficulty ?? 0), Number(incoming.difficulty ?? 0)),
    workload: Math.max(Number(base.workload ?? 0), Number(incoming.workload ?? 0)),
    meetings: dedupeMeetings([...(base.meetings ?? []), ...(incoming.meetings ?? [])]),
    isSectionLinked: Boolean(base.isSectionLinked || incoming.isSectionLinked),
    linkIdentifier: base.linkIdentifier ?? incoming.linkIdentifier ?? null,
    linkedCourses: uniqueStrings([...(base.linkedCourses ?? []), ...(incoming.linkedCourses ?? [])]),
    scheduleType: choosePreferredString(base.scheduleType, incoming.scheduleType) || undefined,
    subjectCourse: choosePreferredString(base.subjectCourse, incoming.subjectCourse) || undefined,
    hasPublishedMeetings: Boolean(base.hasPublishedMeetings || incoming.hasPublishedMeetings),
    isCatalogOnly: Boolean(base.isCatalogOnly || incoming.isCatalogOnly),
    sourceScheduleNote: choosePreferredString(base.sourceScheduleNote, incoming.sourceScheduleNote) || undefined,
    description: chooseLongerString(base.description, incoming.description) || undefined,
    academicLevel: choosePreferredString(base.academicLevel, incoming.academicLevel) || undefined,
  });
}

export function mapApiCoursesToCourses(rawCourses: any[]): Course[] {
  if (!Array.isArray(rawCourses)) return [];

  const mergedCourses = new Map<string, Course>();

  sanitizeCourses(rawCourses).forEach((course) => {
    const mergeKey = buildCourseMergeKey(course);
    const existing = mergedCourses.get(mergeKey);
    mergedCourses.set(
      mergeKey,
      existing ? mergeMappedCourses(existing, course) : course,
    );
  });

  return Array.from(mergedCourses.values());
}
