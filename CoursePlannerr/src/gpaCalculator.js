// gpaCalculator.js
import { DEFAULT_UNIVERSITY_ID } from "./config/universities.ts";
import {
  getGradingSystem,
  getGradeScaleMax,
  getScoreQualityPoints,
  getScoreResult,
} from "./config/gradingSystems.ts";

export const gradePointsMap = getGradingSystem(DEFAULT_UNIVERSITY_ID).gradePoints;

export function getGradePointsMap(universityId = DEFAULT_UNIVERSITY_ID) {
  return getGradingSystem(universityId).gradePoints;
}

export function getGpaScale(universityId = DEFAULT_UNIVERSITY_ID) {
  return getGradeScaleMax(universityId);
}

export function scoreToLetter(score, universityId = DEFAULT_UNIVERSITY_ID) {
  return getScoreResult(score, universityId).letter;
}

export function scoreToLetterWithNote(score, universityId = DEFAULT_UNIVERSITY_ID) {
  return getScoreResult(score, universityId);
}

export function scoreToQualityPoints(score, universityId = DEFAULT_UNIVERSITY_ID) {
  return getScoreQualityPoints(score, universityId);
}

/**
 * Calculate GPA for given courses
 * @param {Array} courses - Array of course objects {credits, grade, semester}
 * @param {string | null} semester - Optional filter by semester
 * @param {string} universityId - University grading system id
 * @returns {number} GPA rounded to 2 decimals
 */
export function calculateGPA(
  courses,
  semester = null,
  universityId = DEFAULT_UNIVERSITY_ID,
) {
  let totalPoints = 0;
  let totalCredits = 0;
  const system = getGradingSystem(universityId);

  const filteredCourses = semester
    ? courses.filter((course) => course.semester === semester)
    : courses;

  for (const course of filteredCourses) {
    const points = system.gradePoints[course.grade];
    if (points === undefined) {
      throw new Error(`Unknown grade for ${universityId}: ${course.grade}`);
    }
    totalPoints += points * course.credits;
    totalCredits += course.credits;
  }

  if (totalCredits === 0) return 0;

  const rawGpa = totalPoints / totalCredits;
  const cappedGpa = typeof system.gpaCap === "number"
    ? Math.min(rawGpa, system.gpaCap)
    : rawGpa;

  return parseFloat(cappedGpa.toFixed(2));
}
