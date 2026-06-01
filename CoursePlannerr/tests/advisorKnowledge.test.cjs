const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildAdvisorLocalResponse,
  buildAdvisorPromptContext,
  detectMajor,
  getAdvisorIntent,
  isAdvisorIntent,
} = require("../../advisorKnowledge.cjs");

function course({
  universityId = "aub",
  code,
  title,
  description = "",
  department,
  courseNumber,
  credits = 3,
  attributes = [],
  prerequisites = "",
  restrictions = "",
  difficulty = 0,
  scheduleType = "Lecture",
  crn = "10001",
  section = "1",
  instructor = "TBA",
  campus = "Main Campus",
  location = "",
  termCode = "202620",
  days = ["M", "W"],
  start = "09:00",
  end = "10:15",
  enrolled = 2,
  limit = 20,
}) {
  return {
    id: `${universityId}:${crn}`,
    universityId,
    code,
    department,
    courseNumber,
    title,
    description,
    credits,
    attributes,
    term_code: termCode,
    crn,
    section,
    instructor,
    campus,
    scheduleType,
    difficulty,
    capacity: { enrolled, limit },
    prerequisites,
    restrictions,
    meetings: [{ days, start, end, location }],
  };
}

test("advisor intent catches first-semester curriculum requests", () => {
  assert.equal(isAdvisorIntent("create a first semester for a computer science student"), true);
  assert.equal(isAdvisorIntent("hello"), false);
});

test("advisor intent treats attribute count questions as academic advising", () => {
  const intent = getAdvisorIntent("how many attributes should i take from as a cs student");

  assert.equal(intent.any, true);
  assert.equal(intent.attributeRequirement, true);
});

test("advisor intent treats abbreviation meaning questions as academic advising", () => {
  const intent = getAdvisorIntent("what does osb mean");

  assert.equal(intent.any, true);
  assert.equal(intent.abbreviationMeaning, true);
});

test("advisor intent treats compact-code prerequisite questions as academic advising", () => {
  const intent = getAdvisorIntent("explain the pre requisites of MATH202");

  assert.equal(intent.any, true);
  assert.equal(intent.courseInquiry, true);
});

test("advisor intent keeps numbered semesters distinct from first semester", () => {
  const intent = getAdvisorIntent("create a 3rd semester schedule for a compsci student");

  assert.equal(intent.any, true);
  assert.equal(intent.semesterNumber, 3);
  assert.equal(intent.firstSemester, false);
});

test("major detection understands engineer phrasing for civil engineering", () => {
  const major = detectMajor(
    "create a 1st semester civil engineer schedule",
    { id: "bau", name: "Beirut Arab University", shortName: "BAU" },
  );

  assert.ok(major);
  assert.equal(major.id, "civil-engineering");
  assert.equal(major.label, "Civil Engineering");
});

test("major detection recognizes official LAU psychology from the shared registry", () => {
  const major = detectMajor(
    "create a first semester psychology schedule",
    { id: "lau", name: "Lebanese American University", shortName: "LAU" },
  );

  assert.ok(major);
  assert.equal(major.label, "Psychology");
  assert.equal(major.officialMajor, true);
});

test("major detection recognizes official USEK telecommunications engineering from the shared registry", () => {
  const major = detectMajor(
    "build a 3rd semester telecommunications engineering schedule",
    { id: "usek", name: "Holy Spirit University of Kaslik", shortName: "USEK" },
  );

  assert.ok(major);
  assert.equal(major.label, "Telecommunications Engineering");
  assert.equal(major.officialMajor, true);
});

test("advisor intent tolerates common student typos in semester and major requests", () => {
  const intent = getAdvisorIntent("create a fifth semesyer schedule for a compueter science student");

  assert.equal(intent.any, true);
  assert.equal(intent.semesterNumber, 5);
  assert.equal(intent.firstSemester, false);
});

test("local advisor builds an AUB first-semester CS plan from catalog data", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester for a computer science student",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "CMPS 201", department: "CMPS", courseNumber: "201", title: "Introduction to Programming", attributes: ["Quantitative Reasoning"] }),
      course({ code: "MATH 201", department: "MATH", courseNumber: "201", title: "Calculus and Analytic Geometry III" }),
      course({ code: "ENGL 203", department: "ENGL", courseNumber: "203", title: "Academic English", attributes: ["Understanding Communication"] }),
      course({ code: "PHIL 210", department: "PHIL", courseNumber: "210", title: "Human Values", attributes: ["Human Values"] }),
    ],
    catalogStats: { totalSections: 4, uniqueCourses: 4, attributeCount: 2, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BS Computer Science sequence/);
  assert.match(response.summary, /semester 1/);
  assert.match(response.summary, /CMPS 201/);
  assert.match(response.summary, /MATH 201/);
  assert.ok(Array.isArray(response.schedule));
  assert.ok(response.schedule.length >= 1);
  assert.doesNotMatch(response.summary, /I am connected to the current website context/);
});

test("local advisor builds an AUB first-semester civil engineering plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester civil engineering schedule",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Fall 2026-2027",
    advisorCourses: [
      course({ universityId: "aub", code: "FEAA 200", department: "FEAA", courseNumber: "200", title: "Introduction to Engineering and Architecture", crn: "AUBCE001" }),
      course({ universityId: "aub", code: "CIVE 201", department: "CIVE", courseNumber: "201", title: "Engineering Drawings and Tools", crn: "AUBCE002" }),
      course({ universityId: "aub", code: "MATH 201", department: "MATH", courseNumber: "201", title: "Calculus and Analytical Geometry III", crn: "AUBCE003" }),
      course({ universityId: "aub", code: "CHEM 202", department: "CHEM", courseNumber: "202", title: "Introduction to Environmental Chemistry", crn: "AUBCE004" }),
      course({ universityId: "aub", code: "CHEM 203", department: "CHEM", courseNumber: "203", title: "Introductory Chemical Techniques", crn: "AUBCE005" }),
      course({ universityId: "aub", code: "ARAB 210", department: "ARAB", courseNumber: "210", title: "Arabic Elective", crn: "AUBCE006", attributes: ["Understanding Communication"] }),
      course({ universityId: "aub", code: "CIVE 490", department: "CIVE", courseNumber: "490", title: "Advanced Foundation Engineering", crn: "AUBCE007" }),
    ],
    catalogStats: { totalSections: 7, uniqueCourses: 7, attributeCount: 1, attributes: ["Understanding Communication"] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BE Civil Engineering sequence/i);
  assert.match(response.summary, /FEAA 200/i);
  assert.match(response.summary, /CIVE 201/i);
  assert.match(response.summary, /CHEM 202/i);
  assert.doesNotMatch(response.summary, /CIVE 490/i);
});

test("local advisor builds a BAU first-semester civil engineering plan from the official sequence instead of advanced civil courses", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a 1st semester civil engineer schedule",
    university: { id: "bau", name: "Beirut Arab University", shortName: "BAU" },
    semesterLabel: "Spring 2025/2026",
    advisorCourses: [
      course({ universityId: "bau", code: "CHEM 241", department: "CHEM", courseNumber: "241", title: "Principles of Chemistry", crn: "21301", days: ["M"], start: "08:00", end: "09:15" }),
      course({ universityId: "bau", code: "CVLE 210", department: "CVLE", courseNumber: "210", title: "Statics", crn: "20290", days: ["T", "R"], start: "09:30", end: "10:45" }),
      course({ universityId: "bau", code: "ENGR 002", department: "ENGR", courseNumber: "002", title: "Introduction to Engineering", crn: "20110", days: ["W"], start: "11:00", end: "12:15" }),
      course({ universityId: "bau", code: "MATH 281", department: "MATH", courseNumber: "281", title: "Linear Algebra", crn: "20401", days: ["M", "W"], start: "10:00", end: "11:15" }),
      course({ universityId: "bau", code: "MCHE 201", department: "MCHE", courseNumber: "201", title: "Engineering Drawing And Graphics", crn: "20501", days: ["F"], start: "08:00", end: "10:30" }),
      course({ universityId: "bau", code: "PHYS 282", department: "PHYS", courseNumber: "282", title: "Material Properties and Heat", crn: "20601", days: ["T"], start: "12:00", end: "13:15" }),
      course({ universityId: "bau", code: "BLAW 001", department: "BLAW", courseNumber: "001", title: "Human Rights", crn: "20701", days: ["R"], start: "13:30", end: "14:20" }),
      course({ universityId: "bau", code: "CVLE 211", department: "CVLE", courseNumber: "211", title: "Mechanics of Materials", crn: "20294", days: ["M", "W"], start: "09:31", end: "11:00", prerequisites: "Prerequisite: CVLE 210" }),
      course({ universityId: "bau", code: "CVLE 213", department: "CVLE", courseNumber: "213", title: "Structures I", crn: "20295", days: ["F"], start: "12:01", end: "15:00", prerequisites: "Prerequisite: CVLE 210" }),
      course({ universityId: "bau", code: "CVLE 214", department: "CVLE", courseNumber: "214", title: "Structures II", crn: "20296", days: ["T", "R"], start: "09:31", end: "11:00", prerequisites: "Prerequisite: CVLE 213" }),
    ],
    catalogStats: { totalSections: 10, uniqueCourses: 10, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BE Civil Engineering sequence/i);
  assert.match(response.summary, /CHEM 241/i);
  assert.match(response.summary, /CVLE 210/i);
  assert.match(response.summary, /ENGR 002/i);
  assert.match(response.summary, /MATH 281/i);
  assert.doesNotMatch(response.summary, /CVLE 214 - Structures II/i);
  assert.ok(response.scheduleCourses.some((courseEntry) => courseEntry.code === "CVLE 210"));
  assert.ok(response.scheduleCourses.every((courseEntry) => courseEntry.code !== "CVLE 214"));
});

test("local advisor builds a LAU first-semester computer science plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester computer science schedule",
    university: { id: "lau", name: "Lebanese American University", shortName: "LAU" },
    semesterLabel: "Fall 2026-2027",
    advisorCourses: [
      course({ universityId: "lau", code: "CSC 243", department: "CSC", courseNumber: "243", title: "Introduction to Object Oriented Programming", crn: "11001" }),
      course({ universityId: "lau", code: "CSC 243B", department: "CSC", courseNumber: "243B", title: "Introduction to Object Oriented Programming Lab", crn: "11002" }),
      course({ universityId: "lau", code: "ENG 202", department: "ENG", courseNumber: "202", title: "Advanced Academic English", crn: "11003" }),
      course({ universityId: "lau", code: "MTH 207", department: "MTH", courseNumber: "207", title: "Discrete Structures I", crn: "11004" }),
      course({ universityId: "lau", code: "LAS 205", department: "LAS", courseNumber: "205", title: "Digital Cultures", crn: "11005" }),
      course({ universityId: "lau", code: "MTH 201", department: "MTH", courseNumber: "201", title: "Calculus III", crn: "11006" }),
      course({ universityId: "lau", code: "CSC 430", department: "CSC", courseNumber: "430", title: "Computer Networks", crn: "11007" }),
    ],
    catalogStats: { totalSections: 7, uniqueCourses: 7, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BS Computer Science sequence/i);
  assert.match(response.summary, /CSC 243/i);
  assert.match(response.summary, /MTH 207/i);
  assert.doesNotMatch(response.summary, /CSC 430/i);
});

test("local advisor builds a BAU first-semester mechanical engineering plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester mechanical engineer schedule",
    university: { id: "bau", name: "Beirut Arab University", shortName: "BAU" },
    semesterLabel: "Spring 2025/2026",
    advisorCourses: [
      course({ universityId: "bau", code: "CHEM 241", department: "CHEM", courseNumber: "241", title: "Principles of Chemistry", crn: "12001" }),
      course({ universityId: "bau", code: "MATH 281", department: "MATH", courseNumber: "281", title: "Linear Algebra", crn: "12002" }),
      course({ universityId: "bau", code: "MCHE 201", department: "MCHE", courseNumber: "201", title: "Engineering Drawing And Graphics", crn: "12003" }),
      course({ universityId: "bau", code: "MCHE 213", department: "MCHE", courseNumber: "213", title: "Dynamics", crn: "12004" }),
      course({ universityId: "bau", code: "PHYS 282", department: "PHYS", courseNumber: "282", title: "Material Properties and Heat", crn: "12005" }),
      course({ universityId: "bau", code: "BLAW 001", department: "BLAW", courseNumber: "001", title: "Human Rights", crn: "12006" }),
      course({ universityId: "bau", code: "MCHE 521", department: "MCHE", courseNumber: "521", title: "Thermal Power Stations", crn: "12007" }),
    ],
    catalogStats: { totalSections: 7, uniqueCourses: 7, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BE Mechanical Engineering sequence/i);
  assert.match(response.summary, /MCHE 213/i);
  assert.match(response.summary, /PHYS 282/i);
  assert.doesNotMatch(response.summary, /MCHE 521/i);
});

test("local advisor builds a LIU first-semester electrical engineering plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester electrical engineering schedule",
    university: { id: "liu", name: "Lebanese International University", shortName: "LIU" },
    semesterLabel: "Spring 2025-2026",
    advisorCourses: [
      course({ universityId: "liu", code: "MENG 225", department: "MENG", courseNumber: "225", title: "Engineering Drawing & CAD", crn: "13001" }),
      course({ universityId: "liu", code: "ENGL 201", department: "ENGL", courseNumber: "201", title: "Composition and Research Skills", crn: "13002" }),
      course({ universityId: "liu", code: "ENGG 200", department: "ENGG", courseNumber: "200", title: "Introduction to Engineering", crn: "13003" }),
      course({ universityId: "liu", code: "MATH 210", department: "MATH", courseNumber: "210", title: "Calculus II", crn: "13004" }),
      course({ universityId: "liu", code: "MATH 225", department: "MATH", courseNumber: "225", title: "Linear Algebra with Applications", crn: "13005" }),
      course({ universityId: "liu", code: "PHYS 220", department: "PHYS", courseNumber: "220", title: "Physics for Engineers", crn: "13006" }),
      course({ universityId: "liu", code: "EENG 495", department: "EENG", courseNumber: "495", title: "Senior Project", crn: "13007" }),
    ],
    catalogStats: { totalSections: 7, uniqueCourses: 7, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BS Electrical Engineering sequence/i);
  assert.match(response.summary, /MENG 225/i);
  assert.match(response.summary, /PHYS 220/i);
  assert.doesNotMatch(response.summary, /EENG 495/i);
});

test("local advisor builds a BAU first-semester computer science plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester computer science schedule",
    university: { id: "bau", name: "Beirut Arab University", shortName: "BAU" },
    semesterLabel: "Spring 2025/2026",
    advisorCourses: [
      course({ universityId: "bau", code: "CHEM 241", department: "CHEM", courseNumber: "241", title: "Principles of Chemistry", crn: "31001" }),
      course({ universityId: "bau", code: "CHEM 241L", department: "CHEM", courseNumber: "241L", title: "Principles of Chemistry Laboratory", crn: "31002" }),
      course({ universityId: "bau", code: "CMPS 241", department: "CMPS", courseNumber: "241", title: "Introduction to Programming", crn: "31003" }),
      course({ universityId: "bau", code: "MATH 241", department: "MATH", courseNumber: "241", title: "Calculus and Analytical Geometry", crn: "31004" }),
      course({ universityId: "bau", code: "PHYS 243", department: "PHYS", courseNumber: "243", title: "General Physics", crn: "31005" }),
      course({ universityId: "bau", code: "PHYS 243L", department: "PHYS", courseNumber: "243L", title: "General Physics Laboratory", crn: "31006" }),
      course({ universityId: "bau", code: "CMPS 461", department: "CMPS", courseNumber: "461", title: "Advanced Web Development", crn: "31007" }),
    ],
    catalogStats: { totalSections: 7, uniqueCourses: 7, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BS Computer Science sequence/i);
  assert.match(response.summary, /CMPS 241/i);
  assert.match(response.summary, /MATH 241/i);
  assert.doesNotMatch(response.summary, /CMPS 461/i);
});

test("local advisor builds a LIU first-semester marketing plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester marketing schedule",
    university: { id: "liu", name: "Lebanese International University", shortName: "LIU" },
    semesterLabel: "Spring 2025-2026",
    advisorCourses: [
      course({ universityId: "liu", code: "BACC 200", department: "BACC", courseNumber: "200", title: "Financial Accounting", crn: "32001" }),
      course({ universityId: "liu", code: "BMTH 210", department: "BMTH", courseNumber: "210", title: "Business and Managerial Math", crn: "32002" }),
      course({ universityId: "liu", code: "BSTA 205", department: "BSTA", courseNumber: "205", title: "Introduction to Business Statistics", crn: "32003" }),
      course({ universityId: "liu", code: "CSCI 200", department: "CSCI", courseNumber: "200", title: "Introduction to Computers", crn: "32004" }),
      course({ universityId: "liu", code: "BMGT 200", department: "BMGT", courseNumber: "200", title: "Introduction to Business Management", crn: "32005" }),
      course({ universityId: "liu", code: "ENGL 201", department: "ENGL", courseNumber: "201", title: "Composition and Research Skills", crn: "32006" }),
      course({ universityId: "liu", code: "BMKT 460", department: "BMKT", courseNumber: "460", title: "Advertising and Promotion", crn: "32007" }),
    ],
    catalogStats: { totalSections: 7, uniqueCourses: 7, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BBA Marketing sequence/i);
  assert.match(response.summary, /BACC 200/i);
  assert.match(response.summary, /BMGT 200/i);
  assert.doesNotMatch(response.summary, /BMKT 460/i);
});

test("generic first-semester fallback avoids unrelated support departments when no official plan is mapped", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester civil engineer schedule",
    university: { id: "customu", name: "Custom University", shortName: "CU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ universityId: "customu", code: "CVLE 210", department: "CVLE", courseNumber: "210", title: "Statics", crn: "10010" }),
      course({ universityId: "customu", code: "CVLE 213", department: "CVLE", courseNumber: "213", title: "Structures I", crn: "10011", prerequisites: "Prerequisite: CVLE 210" }),
      course({ universityId: "customu", code: "ARCH 280", department: "ARCH", courseNumber: "280", title: "Academic Writing", crn: "10012" }),
      course({ universityId: "customu", code: "BMTH 202", department: "BMTH", courseNumber: "202", title: "Business Statistics", crn: "10013" }),
      course({ universityId: "customu", code: "CHEM 110", department: "CHEM", courseNumber: "110", title: "Introduction to Chemistry", crn: "10014" }),
      course({ universityId: "customu", code: "MATH 111", department: "MATH", courseNumber: "111", title: "Calculus I", crn: "10015" }),
    ],
    catalogStats: { totalSections: 6, uniqueCourses: 6, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /CVLE 210/i);
  assert.match(response.summary, /CHEM 110/i);
  assert.match(response.summary, /MATH 111/i);
  assert.doesNotMatch(response.summary, /ARCH 280/i);
  assert.doesNotMatch(response.summary, /BMTH 202/i);
});

test("generic fallback tells the student when an official major is recognized but not fully mapped", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester psychology schedule",
    university: { id: "lau", name: "Lebanese American University", shortName: "LAU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ universityId: "lau", code: "PSY 201", department: "PSY", courseNumber: "201", title: "Introduction to Psychology", crn: "10101" }),
      course({ universityId: "lau", code: "ENG 101", department: "ENG", courseNumber: "101", title: "English Composition", crn: "10102" }),
      course({ universityId: "lau", code: "MTH 101", department: "MTH", courseNumber: "101", title: "Finite Mathematics", crn: "10103" }),
    ],
    catalogStats: { totalSections: 3, uniqueCourses: 3, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official published major/i);
  assert.match(response.summary, /not fully mapped/i);
});

test("local advisor answers AUB CS attribute requirements instead of search-help", () => {
  const response = buildAdvisorLocalResponse({
    message: "how many attributes should i take from as a cs student",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "ENGL 203", department: "ENGL", courseNumber: "203", title: "Academic English", attributes: ["Understanding Communication"] }),
      course({ code: "PHIL 210", department: "PHIL", courseNumber: "210", title: "Human Values", attributes: ["Human Values"] }),
      course({ code: "HIST 210", department: "HIST", courseNumber: "210", title: "World History", attributes: ["Cultures and Histories"] }),
      course({ code: "CMPS 201", department: "CMPS", courseNumber: "201", title: "Introduction to Programming", attributes: ["Quantitative Reasoning"] }),
    ],
    catalogStats: {
      totalSections: 4,
      uniqueCourses: 4,
      attributeCount: 4,
      attributes: [
        { label: "Understanding Communication", count: 1 },
        { label: "Human Values", count: 1 },
        { label: "Cultures and Histories", count: 1 },
        { label: "Quantitative Reasoning", count: 1 },
      ],
    },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /General Education/);
  assert.match(response.summary, /39 credits/);
  assert.match(response.summary, /Quantitative Reasoning/);
  assert.doesNotMatch(response.summary, /right-panel search box/i);
  assert.doesNotMatch(response.summary, /attr:writing/i);
});

test("local advisor recommends live courses when the student asks for an attribute combination", () => {
  const response = buildAdvisorLocalResponse({
    message: "give me recomendations for courses that are human values and chla and social inequalities",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({
        code: "CHLA 209C",
        department: "CHLA",
        courseNumber: "209C",
        title: "Critical Theories and Methods",
        crn: "20901",
        attributes: ["Cultures and Histories", "Human Values", "Social Inequalities", "History of Ideas"],
      }),
      course({
        code: "AHIS 282",
        department: "AHIS",
        courseNumber: "282",
        title: "Art and Cultural Criticism",
        crn: "28201",
        attributes: ["Cultures and Histories", "Human Values", "Social Inequalities", "History of Ideas"],
      }),
      course({
        code: "PHIL 202A",
        department: "PHIL",
        courseNumber: "202A",
        title: "Philosophy of Food",
        crn: "20201",
        attributes: ["Human Values", "Social Inequalities"],
      }),
    ],
    catalogStats: { totalSections: 3, uniqueCourses: 3, attributeCount: 4, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /matching .*Human Values.*Social Inequalities.*CHLA subject prefix/i);
  assert.match(response.summary, /CHLA 209C/i);
  assert.doesNotMatch(response.summary, /39 credits across 8 buckets/i);
});

test("local advisor explains compact-code prerequisite questions from the live catalog snapshot", () => {
  const response = buildAdvisorLocalResponse({
    message: "explain the pre requisites of MATH202",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({
        code: "MATH 202",
        department: "MATH",
        courseNumber: "202",
        title: "Differential Equations",
        crn: "21915",
        prerequisites: "Prerequisites: MATH 201.",
        days: ["M", "W"],
        start: "09:00",
        end: "09:50",
      }),
    ],
    catalogStats: { totalSections: 1, uniqueCourses: 1, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /MATH 202 - Differential Equations/);
  assert.match(response.summary, /Prerequisites: MATH 201\./);
  assert.doesNotMatch(response.summary, /I received your request/i);
  assert.doesNotMatch(response.summary, /Visible course examples/i);
});

test("local advisor explains what a selected course is about even when the message says this course", () => {
  const selected = course({
    code: "CMPS 201",
    department: "CMPS",
    courseNumber: "201",
    title: "Introduction to Programming",
    description: "This course introduces problem solving, algorithmic thinking, and structured programming through hands-on coding exercises.",
    difficulty: 3.8,
    crn: "20798",
  });

  const response = buildAdvisorLocalResponse({
    message: "what is this course about and is it beginner friendly",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [selected],
    universityCourses: [selected],
    universityTerms: [{ code: "aub:202620", source_code: "202620", description: "Spring 2026" }],
    selectedCourse: selected,
    catalogStats: { totalSections: 1, uniqueCourses: 1, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /Official catalog description/i);
  assert.match(response.summary, /beginner/i);
  assert.doesNotMatch(response.summary, /I received your request/i);
});

test("local advisor uses selected-course context for broad questions that do not repeat the course code", () => {
  const selected = course({
    code: "MATH 202",
    department: "MATH",
    courseNumber: "202",
    title: "Differential Equations",
    description: "This course introduces ordinary differential equations and applied modeling methods.",
    prerequisites: "Prerequisites: MATH 201.",
    difficulty: 4.1,
    crn: "21915",
  });

  const response = buildAdvisorLocalResponse({
    message: "is it math heavy and useful for graduate studies",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [selected],
    universityCourses: [selected],
    universityTerms: [{ code: "aub:202620", source_code: "202620", description: "Spring 2026" }],
    selectedCourse: selected,
    catalogStats: { totalSections: 1, uniqueCourses: 1, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /MATH 202 - Differential Equations/);
  assert.match(response.summary, /math-heavy/i);
  assert.doesNotMatch(response.summary, /I received your request/i);
});

test("local advisor uses fetched campus, room, instructor, and time data for LIU course questions", () => {
  const selected = course({
    universityId: "liu",
    code: "EENG 300",
    department: "EENG",
    courseNumber: "300",
    title: "Electric Circuits I",
    description: "Introduces DC and AC circuit analysis with practical engineering problem solving.",
    crn: "BEI-EENG300-A803-F",
    campus: "Beirut",
    instructor: "Hussein Kain",
    location: "A803-F",
    termCode: "portal-spring-2025-2026",
    days: ["T", "R"],
    start: "09:30",
    end: "10:45",
  });

  const response = buildAdvisorLocalResponse({
    message: "what campus is EENG300 on and what time is it and who teaches it",
    university: { id: "liu", name: "Lebanese International University", shortName: "LIU" },
    semesterLabel: "Spring 2025-2026",
    advisorCourses: [selected],
    universityCourses: [selected],
    universityTerms: [
      { code: "liu:portal-spring-2025-2026", source_code: "portal-spring-2025-2026", description: "Spring 2025-2026", is_current: true },
    ],
    selectedCourse: selected,
    catalogStats: { totalSections: 1, uniqueCourses: 1, updatedAt: "2026-05-16T10:00:00.000Z" },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /Visible campuses.*Beirut/i);
  assert.match(response.summary, /Published room\/building examples.*A803-F/i);
  assert.match(response.summary, /Teaching roster now visible: Hussein Kain/i);
  assert.match(response.summary, /Time\/day view:.*TR 09:30-10:45 at A803-F/i);
});

test("advisor prompt context carries live-term freshness and selection metadata", () => {
  const selected = course({
    universityId: "liu",
    code: "CENG 335",
    department: "CENG",
    courseNumber: "335",
    title: "Signals",
    crn: "BEI-CENG335-C401-E-LCD",
    campus: "Beirut",
    instructor: "Moustafa Saleh",
    location: "C401-E (LCD)",
    termCode: "portal-spring-2025-2026",
    days: ["T"],
    start: "12:30",
    end: "13:45",
  });

  const context = buildAdvisorPromptContext({
    message: "is this course hard",
    university: { id: "liu", name: "Lebanese International University" },
    semesterLabel: "Spring 2025-2026",
    catalogStats: {
      semesterLabel: "Spring 2025-2026",
      effectiveTermLabel: "Spring 2025-2026",
      updatedAt: "2026-05-16T10:00:00.000Z",
      resolutionNote: "I answered from Spring 2025-2026 because the newer fetched term has real sections.",
      timedSections: 1200,
      campuses: ["Beirut", "Saida"],
    },
    advisorCourses: [selected],
    universityTerms: [
      { code: "liu:portal-spring-2025-2026", source_code: "portal-spring-2025-2026", description: "Spring 2025-2026", is_current: true },
      { code: "liu:portal-fall-2026-2027", source_code: "portal-fall-2026-2027", description: "Fall 2026-2027" },
    ],
    selectedCourse: selected,
  });

  assert.equal(context.effectiveTermLabel, "Spring 2025-2026");
  assert.match(context.catalogFreshness, /Catalog freshness: synced/i);
  assert.match(context.resolutionNote, /newer fetched term/i);
  assert.deepEqual(context.visibleCampuses, ["Beirut", "Saida"]);
  assert.equal(context.selectedCourseContext.code, "CENG 335");
  assert.equal(context.selectedCourseContext.instructor, "Moustafa Saleh");
});

test("local advisor returns grounded help instead of null for broad non-classified prompts", () => {
  const response = buildAdvisorLocalResponse({
    message: "help me",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "CMPS 201", department: "CMPS", courseNumber: "201", title: "Introduction to Programming" }),
      course({ code: "MATH 201", department: "MATH", courseNumber: "201", title: "Calculus and Analytic Geometry III" }),
    ],
    catalogStats: { totalSections: 2, uniqueCourses: 2, attributeCount: 0, attributes: [] },
  });

  assert.ok(response);
  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /Current snapshot coverage/i);
  assert.match(response.summary, /Examples I can handle reliably right now/i);
  assert.doesNotMatch(response.summary, /I received your request/i);
});

test("local advisor uses university-wide term history for summer offering questions", () => {
  const spring = course({
    code: "CSC 243",
    department: "CSC",
    courseNumber: "243",
    title: "Intr. Object Oriented Program.",
    crn: "20663",
  });
  spring.term_code = "202620";
  spring.termId = "lau:202620";
  const summer = { ...spring, id: "lau:202630:30663", crn: "30663", term_code: "202630", termId: "lau:202630" };

  const response = buildAdvisorLocalResponse({
    message: "is csc 243 offered in summer",
    university: { id: "lau", name: "Lebanese American University", shortName: "LAU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [spring],
    universityCourses: [spring, summer],
    universityTerms: [
      { code: "lau:202620", source_code: "202620", description: "Spring 2026" },
      { code: "lau:202630", source_code: "202630", description: "Summer 2026" },
    ],
    catalogStats: { totalSections: 1, uniqueCourses: 1, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /Summer visibility: yes/i);
  assert.match(response.summary, /published university snapshots/i);
});

test("local advisor stays honest for syllabus-level course policy questions", () => {
  const response = buildAdvisorLocalResponse({
    message: "for math 202 is attendance mandatory and what is the grading breakdown",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({
        code: "MATH 202",
        department: "MATH",
        courseNumber: "202",
        title: "Differential Equations",
        prerequisites: "Prerequisites: MATH 201.",
      }),
    ],
    universityCourses: [],
    universityTerms: [],
    catalogStats: { totalSections: 1, uniqueCourses: 1, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /Syllabus-level policies/i);
  assert.match(response.summary, /does not publish those details reliably/i);
});

test("local advisor answers AUB attribute requirements for non-CS majors by entry year", () => {
  const response = buildAdvisorLocalResponse({
    message: "what attributes should i take as an agriculture student entered in 2023",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "AGSC 201", department: "AGSC", courseNumber: "201", title: "Agriculture", attributes: ["Quantitative Reasoning"] }),
      course({ code: "SOAN 201", department: "SOAN", courseNumber: "201", title: "Society", attributes: ["Societies and Individuals"] }),
    ],
    catalogStats: { totalSections: 2, uniqueCourses: 2, attributeCount: 2, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /Agriculture at American University of Beirut for a student who entered in 2023/);
  assert.match(response.summary, /39 credits/);
  assert.match(response.summary, /General Education/);
  assert.doesNotMatch(response.summary, /right-panel search box/i);
});

test("local advisor switches to LAU year-aware LAS requirements for all majors", () => {
  const response = buildAdvisorLocalResponse({
    message: "how many general education credits do i need as a pharmacy student who entered in 2021",
    university: { id: "lau", name: "Lebanese American University", shortName: "LAU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [],
    catalogStats: { totalSections: 0, uniqueCourses: 0, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /LAU Liberal Arts Curriculum A\/B/);
  assert.match(response.summary, /student who entered in 2021/);
  assert.match(response.summary, /Curriculum B/);
  assert.doesNotMatch(response.summary, /AUB/i);
});

test("local advisor keeps finance requirement questions mapped to Finance instead of education keywords", () => {
  const response = buildAdvisorLocalResponse({
    message: "what curriculum or general education requirements should a Finance student who entered in 2023 follow",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [],
    catalogStats: { totalSections: 0, uniqueCourses: 0, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /Finance at American University of Beirut for a student who entered in 2023/);
  assert.doesNotMatch(response.summary, /For Education at American University of Beirut/);
});

test("advisor major detection understands common academic abbreviations", () => {
  assert.equal(detectMajor("create a 3rd semester schedule for an osb student", { id: "aub" })?.label, "Business Administration");
  assert.equal(detectMajor("build a plan for an ece student", { id: "aub" })?.label, "Electrical and Computer Engineering");
  assert.equal(detectMajor("build a plan for a cse student", { id: "aub" })?.label, "Computer Science and Engineering");
  assert.equal(detectMajor("build a plan for a cce student", { id: "aub" })?.label, "Computer and Communications Engineering");
  assert.equal(detectMajor("build a plan for a cce student", { id: "aust" })?.label, "Computer and Communications Engineering");
  assert.equal(detectMajor("build a plan for a cce student", { id: "liu" })?.label, "Communication Engineering");
  assert.equal(detectMajor("build a plan for a cmps student", { id: "aub" })?.label, "Computer Science");
});

test("local advisor explains abbreviation meanings with official academic context", () => {
  const response = buildAdvisorLocalResponse({
    message: "what do osb, cce, cse, ece, and cmps mean",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [],
    catalogStats: { totalSections: 0, uniqueCourses: 0, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /OSB/i);
  assert.match(response.summary, /Olayan School of Business/i);
  assert.match(response.summary, /CCE/i);
  assert.match(response.summary, /Computer and Communications Engineering/i);
  assert.match(response.summary, /CSE/i);
  assert.match(response.summary, /Computer Science and Engineering/i);
  assert.match(response.summary, /ECE/i);
  assert.match(response.summary, /Electrical and Computer Engineering/i);
  assert.match(response.summary, /CMPS/i);
  assert.match(response.summary, /Computer Science subject prefix/i);
});

test("local advisor handles LU agriculture as curriculum-based, not attribute-chip based", () => {
  const response = buildAdvisorLocalResponse({
    message: "find me what attributes i should take as an agriculture student in LU university and I entered in the year 2023",
    university: { id: "lu", name: "Lebanese University", shortName: "LU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [],
    catalogStats: { totalSections: 0, uniqueCourses: 0, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "course-info");
  assert.match(response.summary, /Agriculture at Lebanese University for a student who entered in 2023/);
  assert.match(response.summary, /not by AUB-style course attributes|not use the selected-term attribute chips/i);
  assert.match(response.summary, /Faculty of Agriculture curriculum/i);
});

test("local advisor uses the official AUB CS third-semester plan", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a 3rd semester schedule for a compsci student",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "CMPS 214", department: "CMPS", courseNumber: "214", title: "Algorithms and Data Structures", crn: "21401", days: ["M", "W"], start: "08:00", end: "09:15" }),
      course({ code: "CMPS 221", department: "CMPS", courseNumber: "221", title: "Computer Organization", crn: "22101", days: ["T", "R"], start: "09:30", end: "10:45" }),
      course({ code: "CMPS 241", department: "CMPS", courseNumber: "241", title: "Systems Programming", crn: "24101", days: ["F"], start: "11:00", end: "13:30" }),
      course({ code: "PHIL 210", department: "PHIL", courseNumber: "210", title: "Ethics and Human Values", attributes: ["Human Values"], crn: "21010", days: ["T", "R"], start: "14:00", end: "15:15" }),
      course({ code: "HIST 220", department: "HIST", courseNumber: "220", title: "History of Ideas", attributes: ["History of Ideas"], crn: "22010", days: ["M", "W"], start: "15:30", end: "16:45" }),
      course({ code: "CMPS 201", department: "CMPS", courseNumber: "201", title: "Introduction to Programming", crn: "20101" }),
    ],
    catalogStats: { totalSections: 6, uniqueCourses: 6, attributeCount: 2, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /semester 3/);
  assert.match(response.summary, /CMPS 214/);
  assert.match(response.summary, /CMPS 221/);
  assert.match(response.summary, /CMPS 241/);
  assert.match(response.summary, /Graduation-safe attribute elective/);
  assert.doesNotMatch(response.summary, /first-semester/);
  assert.ok((response.schedule?.length ?? 0) >= 3);
});

test("curriculum matcher does not confuse short CS alias with words like physics", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester schedule for a physics student who entered in 2024",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "PHYS 210", department: "PHYS", courseNumber: "210", title: "Introductory Physics", crn: "21001" }),
      course({ code: "MATH 201", department: "MATH", courseNumber: "201", title: "Calculus and Analytic Geometry III", crn: "20101" }),
      course({ code: "CMPS 201", department: "CMPS", courseNumber: "201", title: "Introduction to Programming", crn: "20102" }),
    ],
    catalogStats: { totalSections: 3, uniqueCourses: 3, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /Physics student/);
  assert.doesNotMatch(response.summary, /official BS Computer Science sequence/);
});

test("local advisor uses the official AUB CS fourth-semester plan even with cmps typo wording", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a 4th semester schedule for a cmps studemt",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "CMPS 214", department: "CMPS", courseNumber: "214", title: "Algorithms and Data Structures", crn: "21401" }),
      course({ code: "CMPS 221", department: "CMPS", courseNumber: "221", title: "Computer Organization", crn: "22101" }),
      course({ code: "CMPS 241", department: "CMPS", courseNumber: "241", title: "Systems Programming", crn: "24101" }),
      course({ code: "CMPS 271", department: "CMPS", courseNumber: "271", title: "Software Construction", crn: "27101" }),
    ],
    catalogStats: { totalSections: 4, uniqueCourses: 4, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /semester 4/);
  assert.match(response.summary, /CMPS 271/);
  assert.doesNotMatch(response.summary, /first-semester/);
  assert.doesNotMatch(response.summary, /CMPS 201/);
});

test("local advisor uses the official AUB CS fifth-semester plan even with typo wording", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a fifth semesyer schedule for a compueter science student",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "CMPS 215", department: "CMPS", courseNumber: "215", title: "Software Engineering", crn: "21501" }),
      course({ code: "CMPS 240", department: "CMPS", courseNumber: "240", title: "Computer Networks", crn: "24001" }),
      course({ code: "CMPS 271", department: "CMPS", courseNumber: "271", title: "Software Construction", crn: "27101" }),
      course({ code: "CMPS 201", department: "CMPS", courseNumber: "201", title: "Introduction to Programming", crn: "20101" }),
    ],
    catalogStats: { totalSections: 4, uniqueCourses: 4, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /semester 5/);
  assert.match(response.summary, /CMPS 215/);
  assert.match(response.summary, /CMPS 240/);
  assert.doesNotMatch(response.summary, /first-semester/);
  assert.doesNotMatch(response.summary, /CMPS 201/);
});

test("local advisor uses the official AUB BBA second-semester plan", () => {
  const response = buildAdvisorLocalResponse({
    message: "build a schedule for a 2nd semester business student",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "FINA 210", department: "FINA", courseNumber: "210", title: "Business Finance", crn: "21001", days: ["M", "W"], start: "08:00", end: "09:15" }),
      course({ code: "ENGL 204", department: "ENGL", courseNumber: "204", title: "Advanced Academic English", crn: "20401", days: ["T", "R"], start: "09:30", end: "10:45" }),
      course({ code: "MATH 204", department: "MATH", courseNumber: "204", title: "Mathematics for Business", crn: "20402", days: ["M", "W"], start: "11:00", end: "12:15" }),
      course({ code: "DCSN 200", department: "DCSN", courseNumber: "200", title: "Operations Management", crn: "20001", days: ["T", "R"], start: "12:30", end: "13:45" }),
      course({ code: "MNGT 215", department: "MNGT", courseNumber: "215", title: "Fundamentals of Management", crn: "21501", days: ["F"], start: "09:00", end: "11:30" }),
      course({ code: "BUSS 239", department: "BUSS", courseNumber: "239", title: "Business Workshop", credits: 0, crn: "23901", days: ["F"], start: "12:00", end: "12:50" }),
      course({ code: "ACCT 210", department: "ACCT", courseNumber: "210", title: "Financial Accounting", crn: "21002" }),
    ],
    catalogStats: { totalSections: 7, uniqueCourses: 7, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /BBA/);
  assert.match(response.summary, /semester 2/);
  assert.match(response.summary, /FINA 210/);
  assert.match(response.summary, /DCSN 200/);
  assert.match(response.summary, /MNGT 215/);
  assert.doesNotMatch(response.summary, /first-semester/);
  assert.ok((response.schedule?.length ?? 0) >= 5);
});

test("local advisor handles give-me wording for AUB third-semester business schedules", () => {
  const response = buildAdvisorLocalResponse({
    message: "give me a schedule for a 3rd semester business student",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "ECON 212", department: "ECON", courseNumber: "212", title: "Macroeconomics", crn: "21201", days: ["M", "W"], start: "08:00", end: "09:15" }),
      course({ code: "BUSS 200", department: "BUSS", courseNumber: "200", title: "Business Communication", crn: "20001", days: ["T", "R"], start: "09:30", end: "10:45" }),
      course({ code: "ARAB 204", department: "ARAB", courseNumber: "204", title: "Arabic Communication", crn: "20401", days: ["M", "W"], start: "11:00", end: "12:15" }),
      course({ code: "MKTG 210", department: "MKTG", courseNumber: "210", title: "Principles of Marketing", crn: "21001", days: ["T", "R"], start: "12:30", end: "13:45" }),
      course({ code: "INFO 200", department: "INFO", courseNumber: "200", title: "Business Information Systems", crn: "20002", days: ["F"], start: "09:00", end: "11:30" }),
      course({ code: "FINA 210", department: "FINA", courseNumber: "210", title: "Business Finance", crn: "21002" }),
    ],
    catalogStats: { totalSections: 6, uniqueCourses: 6, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /BBA/);
  assert.match(response.summary, /semester 3|Year III Term 3/i);
  assert.match(response.summary, /ECON 212/);
  assert.match(response.summary, /MKTG 210/);
  assert.ok((response.schedule?.length ?? 0) >= 4);
});

test("local advisor keeps linked LAU programming lecture and lab together", () => {
  const response = buildAdvisorLocalResponse({
    message: "make a first semester plan for a CS student",
    university: { id: "lau", name: "Lebanese American University", shortName: "LAU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ universityId: "lau", code: "CSC 243", department: "CSC", courseNumber: "243", title: "Intr. Object Oriented Program.", crn: "12916" }),
      course({ universityId: "lau", code: "CSC 243B", department: "CSC", courseNumber: "243B", title: "Intr. Object Oriented Program. Lab", credits: 1, scheduleType: "Lab", crn: "12921" }),
      course({ universityId: "lau", code: "MTH 101", department: "MTH", courseNumber: "101", title: "Calculus I", crn: "12001" }),
    ],
    catalogStats: { totalSections: 3, uniqueCourses: 3, attributeCount: 0, attributes: [] },
  });

  assert.match(response.summary, /CSC 243/);
  assert.match(response.summary, /CSC 243B/);
});

test("local advisor returns applicable LAU CS sections when no official semester plan is mapped", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a fifth semester schedule for a computer science student",
    university: { id: "lau", name: "Lebanese American University", shortName: "LAU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ universityId: "lau", code: "CSC 243", department: "CSC", courseNumber: "243", title: "Intr. Object Oriented Program.", crn: "20664" }),
      course({ universityId: "lau", code: "CSC 245", department: "CSC", courseNumber: "245", title: "Objects & Data Abstraction", crn: "20672" }),
      course({ universityId: "lau", code: "CSC 310", department: "CSC", courseNumber: "310", title: "Algorithms & Data Structures", crn: "20683" }),
      course({ universityId: "lau", code: "CSC 320", department: "CSC", courseNumber: "320", title: "Computer Organization", crn: "20690", days: ["T", "R"], start: "11:00", end: "12:15" }),
      course({ universityId: "lau", code: "CSC 375", department: "CSC", courseNumber: "375", title: "Database Systems", crn: "20695", days: ["M", "W"], start: "12:30", end: "13:45" }),
      course({ universityId: "lau", code: "ART 205", department: "ART", courseNumber: "205", title: "Digital Storytelling", crn: "20411", attributes: ["Digital Cultures"], days: ["T", "R"], start: "14:00", end: "15:15" }),
      course({ universityId: "lau", code: "SOC 210", department: "SOC", courseNumber: "210", title: "Citizenship Lab", crn: "20412", attributes: ["Change Makers"], days: ["M", "W"], start: "14:00", end: "15:15" }),
      course({ universityId: "lau", code: "CHM 301", department: "CHM", courseNumber: "301", title: "Analytical Chemistry for Life Science", crn: "20412", days: ["M"], start: "14:00", end: "15:15" }),
    ],
    catalogStats: { totalSections: 7, uniqueCourses: 7, attributeCount: 2, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /catalog-based schedule/);
  assert.match(response.summary, /semester 5/);
  assert.match(response.summary, /Digital Cultures|Change Makers/);
  assert.ok((response.schedule?.length ?? 0) >= 3);
  assert.doesNotMatch(response.summary, /CHM 301/);
});

test("official requirement slots prefer open-seat attribute electives that count toward graduation", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a 4th semester schedule for a business student",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "ACCT 215", department: "ACCT", courseNumber: "215", title: "Managerial Accounting", crn: "21501", days: ["M", "W"], start: "08:00", end: "09:15" }),
      course({ code: "BUSS 215", department: "BUSS", courseNumber: "215", title: "Business Analytics", crn: "21502", days: ["T", "R"], start: "09:30", end: "10:45" }),
      course({ code: "MNGT 320", department: "MNGT", courseNumber: "320", title: "Leadership Lab", crn: "32001", days: ["T", "R"], start: "11:00", end: "12:15" }),
      course({ code: "CEL 201", department: "SOAN", courseNumber: "201", title: "Community Project", crn: "20190", attributes: ["Community Engaged Learning"], enrolled: 20, limit: 20 }),
      course({ code: "PSPA 220", department: "PSPA", courseNumber: "220", title: "Policy and Civic Action", crn: "22090", attributes: ["Community Engaged Learning"], days: ["M", "W"], start: "12:30", end: "13:45" }),
      course({ code: "HIST 230", department: "HIST", courseNumber: "230", title: "Ideas that Shaped the Modern World", crn: "23090", attributes: ["History of Ideas"], days: ["M", "W"], start: "14:00", end: "15:15" }),
    ],
    catalogStats: { totalSections: 6, uniqueCourses: 6, attributeCount: 2, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /PSPA 220/);
  assert.match(response.summary, /HIST 230/);
  assert.doesNotMatch(response.summary, /CEL 201/);
});

test("local advisor returns applicable LAU sections for non-CS major schedule requests", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a schedule for a finance major",
    university: { id: "lau", name: "Lebanese American University", shortName: "LAU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ universityId: "lau", code: "FIN 301", department: "FIN", courseNumber: "301", title: "Managerial Finance", crn: "21069" }),
      course({ universityId: "lau", code: "FIN 302", department: "FIN", courseNumber: "302", title: "Financial Institutions & Markets", crn: "22584", days: ["T", "R"], start: "11:00", end: "12:15" }),
      course({ universityId: "lau", code: "FIN 405", department: "FIN", courseNumber: "405", title: "Investment Analysis", crn: "21082", days: ["M", "W"], start: "12:30", end: "13:45" }),
      course({ universityId: "lau", code: "FIN 413", department: "FIN", courseNumber: "413", title: "Corporate Finance", crn: "21086", days: ["F"], start: "09:00", end: "11:30" }),
    ],
    catalogStats: { totalSections: 4, uniqueCourses: 4, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /(Finance|Business Studies) student/);
  assert.ok((response.schedule?.length ?? 0) >= 3);
});

test("local advisor can draft a first semester for a non-CS major from catalog data", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester for a biology student",
    university: { id: "aub", name: "American University of Beirut", shortName: "AUB" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ code: "BIOL 101", department: "BIOL", courseNumber: "101", title: "Introductory Biology I" }),
      course({ code: "CHEM 101", department: "CHEM", courseNumber: "101", title: "General Chemistry" }),
      course({ code: "MATH 101", department: "MATH", courseNumber: "101", title: "Calculus I" }),
      course({ code: "ENGL 203", department: "ENGL", courseNumber: "203", title: "Academic English", attributes: ["Understanding Communication"] }),
    ],
    catalogStats: { totalSections: 4, uniqueCourses: 4, attributeCount: 1, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /Biology student/);
  assert.match(response.summary, /BIOL 101/);
  assert.ok(Array.isArray(response.schedule));
  assert.ok(response.schedule.length >= 1);
});

test("local advisor maps LIU communication-engineering typo prompts to the official LIU engineering plan", () => {
  const response = buildAdvisorLocalResponse({
    message: "build a 3rd semester schedule for a compueter communication enginner",
    university: { id: "liu", name: "Lebanese International University", shortName: "LIU" },
    semesterLabel: "Spring 2026",
    advisorCourses: [
      course({ universityId: "liu", code: "CENG 325", department: "CENG", courseNumber: "325", title: "Software Applications and Design", crn: "32501", days: ["M", "W"], start: "08:00", end: "09:15" }),
      course({ universityId: "liu", code: "CSCI 300", department: "CSCI", courseNumber: "300", title: "Intermediate Programming with Objects", crn: "30001", days: ["M", "W"], start: "09:30", end: "10:45" }),
      course({ universityId: "liu", code: "MATH 310", department: "MATH", courseNumber: "310", title: "Probability and Statistics for Scientists and Engineers", crn: "31001", days: ["T", "R"], start: "08:00", end: "09:15" }),
      course({ universityId: "liu", code: "EENG 300", department: "EENG", courseNumber: "300", title: "Electric Circuits II", crn: "30002", days: ["T", "R"], start: "09:30", end: "10:45" }),
      course({ universityId: "liu", code: "EENG 301L", department: "EENG", courseNumber: "301L", title: "Electric Circuits Lab", crn: "30101", days: ["F"], start: "08:00", end: "09:50" }),
      course({ universityId: "liu", code: "ENGG 300", department: "ENGG", courseNumber: "300", title: "Engineering Economics", crn: "30003", days: ["T", "R"], start: "11:00", end: "12:15" }),
      course({ universityId: "liu", code: "CENG 335", department: "CENG", courseNumber: "335", title: "Digital Logic II", crn: "33501", days: ["M", "W"], start: "11:00", end: "12:15" }),
      course({ universityId: "liu", code: "BIOL 200", department: "BIOL", courseNumber: "200", title: "General Biology I", crn: "20001" }),
      course({ universityId: "liu", code: "JORN 200", department: "JORN", courseNumber: "200", title: "News Writing and Reporting", crn: "20002" }),
      course({ universityId: "liu", code: "RATV 200", department: "RATV", courseNumber: "200", title: "Short Film Making", crn: "20003" }),
    ],
    catalogStats: { totalSections: 10, uniqueCourses: 10, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BS Communication Engineering sequence/i);
  assert.match(response.summary, /semester 3/i);
  assert.match(response.summary, /CENG 325/);
  assert.match(response.summary, /CSCI 300/);
  assert.match(response.summary, /EENG 300/);
  assert.doesNotMatch(response.summary, /BIOL 200/);
  assert.doesNotMatch(response.summary, /JORN 200/);
  assert.doesNotMatch(response.summary, /RATV 200/);
});

test("local advisor does not drift into business or arts courses for AUST CCE", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester schedule for a cce student",
    university: { id: "aust", name: "American University of Science and Technology", shortName: "AUST" },
    semesterLabel: "Catalog 2025-2026",
    advisorCourses: [
      course({ universityId: "aust", code: "CCE 200", department: "CCE", courseNumber: "200", title: "CCE 200", crn: "CCE200" }),
      course({ universityId: "aust", code: "CCE 201", department: "CCE", courseNumber: "201", title: "CCE 201", crn: "CCE201" }),
      course({ universityId: "aust", code: "CCE 201L", department: "CCE", courseNumber: "201L", title: "CCE 201L", crn: "CCE201L" }),
      course({ universityId: "aust", code: "MAT 200", department: "MAT", courseNumber: "200", title: "MAT 200", crn: "MAT200" }),
      course({ universityId: "aust", code: "ENG 000", department: "ENG", courseNumber: "000", title: "ENG 000", crn: "ENG000" }),
      course({ universityId: "aust", code: "BMIS 355", department: "BMIS", courseNumber: "355", title: "Quantitative Methods of Business Decisions", crn: "BMIS355" }),
      course({ universityId: "aust", code: "ARAB 200", department: "ARAB", courseNumber: "200", title: "Arabic Language and Literature", crn: "ARAB200" }),
      course({ universityId: "aust", code: "ARTS 215", department: "ARTS", courseNumber: "215", title: "History of Arts", crn: "ARTS215" }),
    ],
    catalogStats: { totalSections: 8, uniqueCourses: 8, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /Computer and Communications Engineering/i);
  assert.match(response.summary, /CCE 200/);
  assert.match(response.summary, /CCE 201/);
  assert.doesNotMatch(response.summary, /BMIS 355/);
  assert.doesNotMatch(response.summary, /History of Arts/);
});

test("local advisor builds an AUST first-semester computer science plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester computer science schedule",
    university: { id: "aust", name: "American University of Science and Technology", shortName: "AUST" },
    semesterLabel: "Catalog 2025-2026",
    advisorCourses: [
      course({ universityId: "aust", code: "ENG 200", department: "ENG", courseNumber: "200", title: "Writing Skills", crn: "AUST2001" }),
      course({ universityId: "aust", code: "CSI 201", department: "CSI", courseNumber: "201", title: "Introduction to Computing", crn: "AUST2002" }),
      course({ universityId: "aust", code: "CSI 210", department: "CSI", courseNumber: "210", title: "Systems Hardware Fundamentals", crn: "AUST2003" }),
      course({ universityId: "aust", code: "MAT 201", department: "MAT", courseNumber: "201", title: "Calculus I", crn: "AUST2004" }),
      course({ universityId: "aust", code: "ACC 314", department: "ACC", courseNumber: "314", title: "Accounting and Financial Analysis", crn: "AUST2005" }),
      course({ universityId: "aust", code: "CSI 499", department: "CSI", courseNumber: "499", title: "Senior Project", crn: "AUST2006" }),
    ],
    catalogStats: { totalSections: 6, uniqueCourses: 6, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BS Computer Science sequence/i);
  assert.match(response.summary, /ENG 200/i);
  assert.match(response.summary, /CSI 201/i);
  assert.match(response.summary, /MAT 201/i);
  assert.doesNotMatch(response.summary, /CSI 499 - Senior Project/i);
});

test("local advisor builds an NDU first-semester computer science plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester computer science schedule",
    university: { id: "ndu", name: "Notre Dame University-Louaize", shortName: "NDU" },
    semesterLabel: "Catalog 2025-2026",
    advisorCourses: [
      course({ universityId: "ndu", code: "CSC 212", department: "CSC", courseNumber: "212", title: "Program Design and Data Abstraction", crn: "NDU2001" }),
      course({ universityId: "ndu", code: "ENL 213", department: "ENL", courseNumber: "213", title: "Sophomore English Rhetoric", crn: "NDU2002" }),
      course({ universityId: "ndu", code: "MAT 211", department: "MAT", courseNumber: "211", title: "Discrete Mathematics", crn: "NDU2003" }),
      course({ universityId: "ndu", code: "POS 201", department: "POS", courseNumber: "201", title: "Introduction to Political Science", crn: "NDU2004", attributes: ["Liberal Arts Curriculum"] }),
      course({ universityId: "ndu", code: "CSC 490", department: "CSC", courseNumber: "490", title: "Senior Study", crn: "NDU2005" }),
    ],
    catalogStats: { totalSections: 5, uniqueCourses: 5, attributeCount: 1, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official BS Computer Science sequence/i);
  assert.match(response.summary, /CSC 212/i);
  assert.match(response.summary, /MAT 211/i);
  assert.doesNotMatch(response.summary, /CSC 490 - Senior Study/i);
});

test("local advisor builds a USJ first-semester data science plan from the official sequence", () => {
  const response = buildAdvisorLocalResponse({
    message: "create a first semester data science schedule",
    university: { id: "usj", name: "Universite Saint-Joseph de Beyrouth", shortName: "USJ" },
    semesterLabel: "Spring 2025-2026",
    advisorCourses: [
      course({ universityId: "usj", code: "MATH 101", department: "MATH", courseNumber: "101", title: "Calculus I", crn: "USJ2001" }),
      course({ universityId: "usj", code: "CMPS 101", department: "CMPS", courseNumber: "101", title: "Computer Programming I", crn: "USJ2002" }),
      course({ universityId: "usj", code: "STAT 101", department: "STAT", courseNumber: "101", title: "Descriptive statistics", crn: "USJ2003" }),
      course({ universityId: "usj", code: "MATH 102", department: "MATH", courseNumber: "102", title: "Discrete mathematics", crn: "USJ2004" }),
      course({ universityId: "usj", code: "DATA 101", department: "DATA", courseNumber: "101", title: "Foundations of Data science", crn: "USJ2005" }),
      course({ universityId: "usj", code: "DATA 499", department: "DATA", courseNumber: "499", title: "Deep Learning Seminar", crn: "USJ2006" }),
    ],
    catalogStats: { totalSections: 6, uniqueCourses: 6, attributeCount: 0, attributes: [] },
  });

  assert.equal(response.mode, "schedule");
  assert.match(response.summary, /official Bachelor in Mathematics, option Data Science sequence/i);
  assert.ok(response.scheduleCourses.some((courseEntry) => courseEntry.title === "Foundations of Data science"));
  assert.ok(response.scheduleCourses.every((courseEntry) => courseEntry.title !== "Deep Learning Seminar"));
});

const REQUESTED_MAJOR_COVERAGE = {
  aub: ["Engineering", "Computer Science", "Data Science", "Business Administration", "Finance", "Accounting", "Marketing", "Economics", "Medicine", "Nursing", "Public Health", "Biology", "Chemistry", "Physics", "Mathematics", "Political Science", "Psychology", "Sociology", "Architecture", "Agriculture", "Environmental Sciences"],
  lau: ["Computer Science", "Computer Engineering", "Business Studies", "Economics", "Pharmacy", "Medicine", "Nursing", "Architecture", "Biology", "Chemistry", "Communication Arts", "Political Science", "Psychology", "Hospitality & Tourism"],
  usek: ["Computer Engineering", "Civil Engineering", "Mechanical Engineering", "Biomedical Engineering", "Business Administration", "Law", "Medicine", "Architecture", "Arts", "Music", "Theology"],
  bau: ["Computer Science", "Information Technology", "Civil Engineering", "Mechanical Engineering", "Electrical Engineering", "Architecture", "Business Administration", "Accounting", "Finance", "Marketing", "Medicine", "Dentistry", "Pharmacy", "Law", "Arts", "Humanities"],
  ndu: ["Computer Science", "MIS", "Computer Engineering", "Civil Engineering", "Business Administration", "Finance", "Accounting", "Marketing", "Media Studies", "Political Science", "Graphic Design", "Hospitality"],
  aust: ["Computer Science", "Information Technology", "Computer Engineering", "Mechatronics Engineering", "Biomedical Engineering", "Business Administration", "Accounting", "Finance", "Marketing", "Hospitality Management", "Economics", "Biotechnology", "Optometry", "Graphic Design", "Interior Design"],
  usj: ["Computer Science", "Engineering", "Medicine", "Pharmacy", "Dentistry", "Law", "Business Administration", "Economics", "Translation", "Languages", "Political Science", "Social Sciences"],
  lu: ["Computer Science", "Mathematics", "Physics", "Biology", "Chemistry", "Engineering", "Business Administration", "Accounting", "Finance", "Law", "Arts", "Education", "Social Sciences"],
  liu: ["Computer Science", "Information Technology", "Computer Engineering", "Business Administration", "Accounting", "Finance", "Marketing", "Pharmacy", "Education", "Arts", "Social Sciences"],
};

const UNIVERSITY_NAMES = {
  aub: "American University of Beirut",
  lau: "Lebanese American University",
  usek: "Holy Spirit University of Kaslik",
  bau: "Beirut Arab University",
  ndu: "Notre Dame University-Louaize",
  aust: "American University of Science and Technology",
  usj: "Universite Saint-Joseph de Beyrouth",
  lu: "Lebanese University",
  liu: "Lebanese International University",
};

function readCatalog(universityId) {
  const catalogPath = path.join(__dirname, "..", "..", "data", "catalogs", `${universityId}.json`);
  return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

test("advisor returns an apply-able schedule proposal for every requested university-major pair", () => {
  const failures = [];

  for (const [universityId, majors] of Object.entries(REQUESTED_MAJOR_COVERAGE)) {
    const catalog = readCatalog(universityId);
    const term = (catalog.terms || []).find((candidate) => candidate.is_current) || (catalog.terms || [])[0] || {};
    const termCourses = (catalog.courses || []).filter((candidate) =>
      !term.code || String(candidate.term_code || candidate.termCode || "") === String(term.code));
    const uniqueCourses = new Set(termCourses.map((candidate) => String(candidate.code || "").toUpperCase()));

    for (const major of majors) {
      const response = buildAdvisorLocalResponse({
        message: `create a schedule for a ${major} student`,
        university: { id: universityId, name: UNIVERSITY_NAMES[universityId] },
        semesterLabel: term.description || "",
        advisorCourses: termCourses,
        catalogStats: {
          totalSections: termCourses.length,
          uniqueCourses: uniqueCourses.size,
          semesterLabel: term.description || "",
        },
      });

      const hasSchedule = response?.mode === "schedule" && Array.isArray(response.schedule) && response.schedule.length >= 1;
      const honestCatalogLimitation = response?.mode === "course-info"
        && /do not see enough matching courses|do not have enough visible/i.test(response.summary || "");

      if (!hasSchedule && !honestCatalogLimitation) {
        failures.push(`${universityId.toUpperCase()} ${major}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("AUST official program pages provide major-specific catalog matches for previously weak programs", () => {
  const catalog = readCatalog("aust");
  const term = (catalog.terms || []).find((candidate) => candidate.is_current) || (catalog.terms || [])[0] || {};
  const termCourses = (catalog.courses || []).filter((candidate) =>
    !term.code || String(candidate.term_code || candidate.termCode || "") === String(term.code));

  for (const major of ["Computer Engineering", "Biomedical Engineering", "Biotechnology", "Optometry", "Graphic Design", "Interior Design"]) {
    const response = buildAdvisorLocalResponse({
      message: `create a schedule for a ${major} student`,
      university: { id: "aust", name: UNIVERSITY_NAMES.aust },
      semesterLabel: term.description || "",
      advisorCourses: termCourses,
      catalogStats: {
        totalSections: termCourses.length,
        uniqueCourses: new Set(termCourses.map((candidate) => String(candidate.code || "").toUpperCase())).size,
        semesterLabel: term.description || "",
      },
    });

    assert.equal(response?.mode, "schedule", major);
    assert.ok((response?.schedule?.length ?? 0) >= 1, major);
    assert.doesNotMatch(response?.summary || "", /missing the program-specific course list/i, major);
  }
});
