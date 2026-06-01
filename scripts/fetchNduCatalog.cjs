const {
  chooseCurrentTerm,
  chooseRelevantTerms,
  dedupeBy,
  logStep,
  normalizeHeuristicRange,
  normalizeWhitespace,
  parseCompactDays,
  professorIdFor,
  requestText,
  slugify,
  splitCourseCode,
  stripTags,
} = require("./catalogUtils.cjs");

const NDU_CAMPUSES = [
  { id: "1", label: "Main Campus" },
  { id: "2", label: "NLC Campus" },
  { id: "3", label: "SC Campus" },
];

function parseNduTerms(html) {
  return [...html.matchAll(/<option value="([^"]+)"([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map((match) => ({
      code: normalizeWhitespace(match[1]),
      description: normalizeWhitespace(stripTags(match[3])),
      selected: /selected/i.test(match[2]),
    }))
    .filter((term) => term.code && term.description);
}

function parseNduRows(html, campusLabel, termCode) {
  const rows = [];
  const rowMatches = html.match(/<tr><TD nowrap>[\s\S]*?<\/tr>/gi) || [];

  for (const rowHtml of rowMatches) {
    const values = [...rowHtml.matchAll(/<span class=style35>([\s\S]*?)<\/span>/gi)]
      .map((match) => stripTags(match[1]));

    if (values.length < 9) continue;

    const { department, courseNumber } = splitCourseCode(values[0]);
    if (!department || !courseNumber) continue;

    const requirements = stripTags((rowHtml.match(/Title='([^']*)'/i) || [])[1] || "");
    const students = Number.parseInt(values[7], 10);
    const seats = Number.parseInt(values[8], 10);
    const capacity = Number.isFinite(students) && Number.isFinite(seats) ? students + seats : 0;
    const timeField = normalizeWhitespace(values[4]);
    const [firstSegment = ""] = timeField.split("/");
    const segmentMatch = firstSegment.match(/^([A-Z.]+)\s+(.+)$/i);
    const rawDays = segmentMatch?.[1] || "TBA";
    const rawRange = segmentMatch?.[2] || "TBA";
    const instructor = normalizeWhitespace(values[5]).replace(/T\.B\.A\./i, "TBA") || "TBA";

    rows.push({
      id: `ndu:${termCode}:${campusLabel}:${department}${courseNumber}:${values[1]}`,
      term_code: termCode,
      crn: `NDU-${termCode}-${slugify(`${campusLabel}-${department}-${courseNumber}-${values[1]}`)}`,
      code: `${department} ${courseNumber}`,
      department,
      course_number: courseNumber,
      section: normalizeWhitespace(values[1]),
      title: normalizeWhitespace(values[3]),
      credits: Number(values[2]) || 0,
      instructor,
      professor_id: professorIdFor("ndu", instructor),
      campus: campusLabel,
      schedule: {
        days: parseCompactDays(rawDays),
        time: rawRange === "T.B.A." ? "TBA" : normalizeHeuristicRange(rawRange),
        location: normalizeWhitespace(values[6]).replace(/^-$/, "TBA") || "TBA",
        section: normalizeWhitespace(values[1]),
        type: "Lecture",
      },
      capacity,
      enrolled_count: Number.isFinite(students) ? students : 0,
      prerequisites: /requirements:/i.test(requirements)
        ? normalizeWhitespace(requirements.split(/requirements:/i)[1])
        : null,
      attributes: [],
    });
  }

  return rows;
}

async function fetchNduCatalog() {
  const sourceUrl = "https://sis.ndu.edu.lb/advreg/bin";
  const formPage = await requestText(`${sourceUrl}/schedoff.asp`);
  const terms = parseNduTerms(formPage.text);
  const termPredicate = (term) => /fall|spring|summer/i.test(term.description);
  const currentTerm = terms.find((term) => term.selected)
    ?? chooseCurrentTerm(terms, termPredicate);
  const selectedTerms = chooseRelevantTerms(terms, termPredicate);

  logStep("ndu current term", `${currentTerm.description} (${currentTerm.code})`);
  logStep(
    "ndu selected terms",
    selectedTerms.map((term) => `${term.description} (${term.code})`).join(" | "),
  );

  const courses = [];
  for (const term of selectedTerms) {
    logStep("ndu term", `${term.description} (${term.code})`);

    for (const campus of NDU_CAMPUSES) {
      const body = [
        ["sem", term.code],
        ["campus", campus.id],
        ["fac", "0"],
        ["dep", "0"],
        ["selOpnCls", "1"],
        ["selOrder", "Course"],
        ["Mask", ""],
      ]
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");

      const response = await requestText(`${sourceUrl}/schedOff.asp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      const campusCourses = parseNduRows(response.text, campus.label, term.code);
      logStep("ndu campus", `${term.code} ${campus.label} -> ${campusCourses.length} rows`);
      courses.push(...campusCourses);
    }
  }

  return {
    terms: selectedTerms.map((term) => ({
      code: term.code,
      description: normalizeWhitespace(term.description),
      is_current: term.code === currentTerm.code,
    })),
    courses: dedupeBy(courses, (course) => course.id),
  };
}

module.exports = {
  fetchNduCatalog,
};
