import assert from "node:assert/strict";
import test from "node:test";

import {
  mapApiCourseToCourse,
  mapApiCoursesToCourses,
  normalizeCourseMeetings,
} from "../src/utils/courseApi.ts";

test("mapApiCourseToCourse normalizes compact MW and MWF day strings", () => {
  const mwCourse = mapApiCourseToCourse({
    university_id: "aub",
    semester: "aub:202620",
    crn: "12345",
    code: "TEST 201",
    department: "TEST",
    course_number: "201",
    title: "Testing Meetings",
    schedule: {
      days: "MW",
      time: "10:00 - 10:50",
      location: "NICELY 101",
      type: "Class",
    },
  });

  const mwfCourse = mapApiCourseToCourse({
    university_id: "aub",
    semester: "aub:202620",
    crn: "12346",
    code: "TEST 202",
    department: "TEST",
    course_number: "202",
    title: "Testing Meetings",
    schedule: {
      days: "MWF",
      time: "08:00 - 08:50",
      location: "NICELY 102",
      type: "Class",
    },
  });

  assert.deepEqual(mwCourse.meetings[0]?.days, ["M", "W"]);
  assert.deepEqual(mwfCourse.meetings[0]?.days, ["M", "W", "F"]);
});

test("normalizeCourseMeetings parses long-form Tuesday/Thursday strings", () => {
  const normalized = normalizeCourseMeetings({
    meetings: [
      {
        days: "Tuesday, Thursday",
        time: "09:30 - 10:45",
        location: "ENG 201",
        type: "Lecture",
      },
    ],
  });

  assert.equal(normalized.meetings.length, 1);
  assert.deepEqual(normalized.meetings[0]?.days, ["T", "R"]);
});

test("mapApiCoursesToCourses merges duplicate single-day rows into one multi-day meeting", () => {
  const courses = mapApiCoursesToCourses([
    {
      university_id: "bau",
      semester: "bau:202620",
      crn: "20630",
      code: "CVLE 214",
      department: "CVLE",
      course_number: "214",
      section: "T1",
      title: "Structures II",
      meetings: [
        {
          days: "Monday",
          time: "11:01 - 12:00",
          location: "BLOCKD D208",
          type: "Lecture",
        },
      ],
    },
    {
      university_id: "bau",
      semester: "bau:202620",
      crn: "20630",
      code: "CVLE 214",
      department: "CVLE",
      course_number: "214",
      section: "T1",
      title: "Structures II",
      meetings: [
        {
          days: "Wednesday",
          time: "11:01 - 12:00",
          location: "BLOCKD D208",
          type: "Lecture",
        },
      ],
    },
  ]);

  assert.equal(courses.length, 1);
  assert.equal(courses[0]?.meetings.length, 1);
  assert.deepEqual(courses[0]?.meetings[0]?.days, ["M", "W"]);
});
