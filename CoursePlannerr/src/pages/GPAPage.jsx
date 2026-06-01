import React, { useEffect, useMemo, useState } from "react";
import CourseForm from "../components/CourseForm";
import GPA from "./GPA";
import GPACourses from "./GPACourses";
import GradeCalculator from "../components/GradeCalculator";
import { getStoredUniversityId } from "../utils/plannerPreferences.ts";
import { getGradingSystem, getTopGrade } from "../config/gradingSystems.ts";


export default function GPAPage() {
  const universityId = getStoredUniversityId();
  const gradingSystem = useMemo(
    () => getGradingSystem(universityId),
    [universityId],
  );
  const defaultGrade = useMemo(() => getTopGrade(universityId), [universityId]);
  const [courses, setCourses] = useState(() => [
    {
      id: 1,
      name: "CS101",
      credits: 3,
      grade: getTopGrade(universityId),
      semester: "Fall2026",
    },
  ]);

  useEffect(() => {
    setCourses((currentCourses) =>
      currentCourses.map((course) => ({
        ...course,
        grade: gradingSystem.letterGrades.includes(course.grade)
          ? course.grade
          : defaultGrade,
      })),
    );
  }, [defaultGrade, gradingSystem]);

  return (
    <div
      style={{
        padding: "30px",
        backgroundColor: "#1a1a2e",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <GPA courses={courses} universityId={universityId} />
      <br />
      <GPACourses courses={courses} setCourses={setCourses} universityId={universityId} />
      <GradeCalculator universityId={universityId} />
    </div>
  );
}
