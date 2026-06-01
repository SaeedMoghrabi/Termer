import test from "node:test";
import assert from "node:assert/strict";
import type { Course } from "../src/types.ts";
import { generateScheduleOptions, getScheduleQuality } from "../src/utils/smartSchedule.ts";

function course(overrides: Partial<Course>): Course {
  return {
    id: "cmps-201-1",
    universityId: "aub",
    universityName: "American University of Beirut",
    termId: "202620",
    crn: "10000",
    code: "CMPS 201",
    department: "CMPS",
    courseNumber: "201",
    title: "Introduction to Programming",
    instructor: "Staff",
    campus: "Main",
    section: "1",
    credits: 3,
    capacity: { enrolled: 10, limit: 30 },
    attributes: [],
    difficulty: 3,
    workload: 3,
    meetings: [{ days: ["M", "W"], start: "08:00", end: "08:50" }],
    ...overrides,
  };
}

test("schedule generator swaps to a section that avoids blocked time", () => {
  const blockedSection = course({ id: "cmps-201-1", section: "1" });
  const allowedSection = course({
    id: "cmps-201-2",
    section: "2",
    meetings: [{ days: ["T", "R"], start: "09:30", end: "10:45" }],
  });

  const options = generateScheduleOptions({
    allCourses: [blockedSection, allowedSection],
    wantedCourses: [blockedSection],
    lockedCourseIds: [],
    blockedTimes: [{ id: "work", label: "Work", days: ["M"], start: "07:30", end: "09:00" }],
  });

  assert.equal(options.length, 1);
  assert.equal(options[0].courses[0].id, "cmps-201-2");
});

test("locked courses stay in generated schedules", () => {
  const locked = course({
    id: "math-101-1",
    code: "MATH 101",
    department: "MATH",
    courseNumber: "101",
    meetings: [{ days: ["T"], start: "10:00", end: "11:15" }],
  });
  const wanted = course({ id: "cmps-201-1" });

  const options = generateScheduleOptions({
    allCourses: [locked, wanted],
    wantedCourses: [locked, wanted],
    lockedCourseIds: [locked.id],
    blockedTimes: [],
  });

  assert.equal(options.length, 1);
  assert.ok(options[0].courses.some((item) => item.id === locked.id));
});

test("quality metrics flag conflicts and improve clear schedules", () => {
  const first = course({ id: "cmps-201-1" });
  const conflict = course({ id: "math-101-1", code: "MATH 101", department: "MATH", courseNumber: "101" });
  const clear = course({
    id: "math-101-2",
    code: "MATH 101",
    department: "MATH",
    courseNumber: "101",
    meetings: [{ days: ["T"], start: "10:00", end: "11:15" }],
  });

  const bad = getScheduleQuality([first, conflict]);
  const good = getScheduleQuality([first, clear]);

  assert.equal(bad.conflicts, 1);
  assert.equal(good.conflicts, 0);
  assert.ok(good.score > bad.score);
});
