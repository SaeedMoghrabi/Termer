import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateGPA,
  getGradePointsMap,
  getGpaScale,
  scoreToQualityPoints,
  scoreToLetterWithNote,
} from "../src/gpaCalculator.js";
import {
  getGradeFeedbackTone as getGradeFeedbackToneFromConfig,
  getGradingSystem,
  getTopGrade,
} from "../src/config/gradingSystems.ts";

test("LAU uses a 4.0 scale with no A+ grade option", () => {
  const lauPoints = getGradePointsMap("lau");
  const lauSystem = getGradingSystem("lau");

  assert.equal(getGpaScale("lau"), 4.0);
  assert.equal(lauPoints.A, 4.0);
  assert.equal(lauPoints["A-"], 3.67);
  assert.equal(lauPoints["A+"], undefined);
  assert.deepEqual(
    lauSystem.letterGrades,
    ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
  );
});

test("AUB exposes its full official letter-grade ladder including A+, C-, and D+", () => {
  assert.deepEqual(
    getGradingSystem("aub").letterGrades,
    ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
  );
});

test("BAU follows the official undergraduate ladder with A+ and without D+", () => {
  const bauSystem = getGradingSystem("bau");

  assert.deepEqual(
    bauSystem.letterGrades,
    ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"],
  );
  assert.equal(getTopGrade("bau"), "A+");
  assert.equal(bauSystem.gradePoints["A+"], 4.0);
  assert.equal(bauSystem.gradePoints.D, 1.33);
  assert.equal(bauSystem.gradePoints["D+"], undefined);
  assert.deepEqual(scoreToLetterWithNote(100, "bau"), { letter: "A+", note: null });
  assert.deepEqual(scoreToLetterWithNote(79, "bau"), { letter: "B-", note: null });
  assert.deepEqual(scoreToLetterWithNote(64, "bau"), { letter: "D", note: null });
});

test("NDU uses the official A+ through D scale with D+ present", () => {
  assert.deepEqual(
    getGradingSystem("ndu").letterGrades,
    ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
  );
  assert.deepEqual(scoreToLetterWithNote(97, "ndu"), { letter: "A+", note: null });
  assert.deepEqual(scoreToLetterWithNote(63, "ndu"), { letter: "D+", note: null });
});

test("USEK uses the official A+ through D scale with A+ capped at 4.0 quality points", () => {
  const usekSystem = getGradingSystem("usek");

  assert.deepEqual(
    usekSystem.letterGrades,
    ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
  );
  assert.equal(usekSystem.gradePoints["A+"], 4.0);
  assert.deepEqual(scoreToLetterWithNote(93, "usek"), { letter: "A+", note: null });
  assert.deepEqual(scoreToLetterWithNote(63, "usek"), { letter: "D+", note: null });
});

test("USJ exposes D- while AUST keeps the simpler A-D-F scale", () => {
  assert.deepEqual(
    getGradingSystem("usj").letterGrades,
    ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"],
  );
  assert.deepEqual(getGradingSystem("aust").letterGrades, ["A", "B", "C", "D", "F"]);
});

test("LU uses the official 5-point rank scale without inventing minus grades", () => {
  const luSystem = getGradingSystem("lu");

  assert.deepEqual(
    luSystem.letterGrades,
    ["A+", "A", "B+", "B", "C+", "C", "D+", "D", "E", "F"],
  );
  assert.equal(luSystem.scaleMax, 5.0);
  assert.equal(luSystem.gradePoints.E, 1.0);
  assert.equal(luSystem.gradePoints["A-"], undefined);
});

test("AUB GPA is capped at 4.0 even though A+ carries 4.3 quality points", () => {
  const gpa = calculateGPA(
    [{ credits: 3, grade: "A+", semester: "Spring2026" }],
    null,
    "aub",
  );

  assert.equal(gpa, 4.0);
});

test("AUST percentage results use the official simple letter scale", () => {
  assert.deepEqual(scoreToLetterWithNote(85, "aust"), {
    letter: "B",
    note: null,
  });
});

test("USJ jury band does not force a fixed letter grade", () => {
  const result = scoreToLetterWithNote(45, "usj");

  assert.equal(result.letter, null);
  assert.match(result.note ?? "", /jury-adjustment range/i);
});

test("LU does not invent a universal percentage-to-letter mapping", () => {
  const result = scoreToLetterWithNote(88, "lu");

  assert.equal(result.letter, null);
  assert.match(result.note ?? "", /percentage-to-letter conversion table/i);
});

test("LIU uses the official transcript ladder and exact percentage-to-points table", () => {
  const liuSystem = getGradingSystem("liu");

  assert.equal(getGpaScale("liu"), 4.0);
  assert.deepEqual(
    liuSystem.letterGrades,
    ["A", "B+", "B", "C+", "C", "D+", "D", "F"],
  );
  assert.equal(getGradePointsMap("liu")["B+"], 3.9);
  assert.deepEqual(scoreToLetterWithNote(90, "liu"), { letter: "A", note: null });
  assert.deepEqual(scoreToLetterWithNote(89, "liu"), { letter: "B+", note: null });
  assert.deepEqual(scoreToLetterWithNote(84, "liu"), { letter: "B", note: null });
  assert.deepEqual(scoreToLetterWithNote(79, "liu"), { letter: "C+", note: null });
  assert.deepEqual(scoreToLetterWithNote(69, "liu"), { letter: "D+", note: null });
  assert.deepEqual(scoreToLetterWithNote(64, "liu"), { letter: "D", note: null });
  assert.deepEqual(scoreToLetterWithNote(59, "liu"), { letter: "F", note: null });
  assert.equal(scoreToQualityPoints(85, "liu"), 3.5);
  assert.equal(scoreToQualityPoints(82, "liu"), 3.2);
  assert.equal(scoreToQualityPoints(69, "liu"), 1.9);
});

test("grade result colors map to semantic performance bands", () => {
  assert.equal(getGradeFeedbackToneFromConfig({ universityId: "lau", letter: "A" }).key, "excellent");
  assert.equal(getGradeFeedbackToneFromConfig({ universityId: "lau", letter: "B" }).key, "strong");
  assert.equal(getGradeFeedbackToneFromConfig({ universityId: "lau", letter: "C" }).key, "caution");
  assert.equal(getGradeFeedbackToneFromConfig({ universityId: "lau", letter: "D" }).key, "risk");
  assert.equal(getGradeFeedbackToneFromConfig({ universityId: "lau", letter: "F" }).key, "fail");
});

test("manual-review bands use a warning tone instead of pretending to be a fixed grade", () => {
  const result = scoreToLetterWithNote(45, "usj");

  assert.equal(
    getGradeFeedbackToneFromConfig({
      universityId: "usj",
      letter: result.letter,
      note: result.note,
    }).key,
    "warning",
  );
});
