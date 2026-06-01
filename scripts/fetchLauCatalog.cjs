const { chromium } = require("playwright");
const {
  chooseCurrentTerm,
  chooseRelevantTerms,
  dedupeBy,
  logStep,
  normalizeMeridianRange,
  normalizeWhitespace,
  parseCompactDays,
  professorIdFor,
  requestText,
  stripTags,
} = require("./catalogUtils.cjs");

function buildLauSearchBody(termCode, subjectCode) {
  const pairs = [
    ["term_in", termCode],
    ["sel_subj", "dummy"],
    ["sel_subj", subjectCode],
    ["sel_day", "dummy"],
    ["sel_schd", "dummy"],
    ["sel_schd", "%"],
    ["sel_insm", "dummy"],
    ["sel_camp", "dummy"],
    ["sel_camp", "%"],
    ["sel_levl", "dummy"],
    ["sel_levl", "%"],
    ["sel_sess", "dummy"],
    ["sel_instr", "dummy"],
    ["sel_instr", "%"],
    ["sel_ptrm", "dummy"],
    ["sel_ptrm", "%"],
    ["sel_attr", "dummy"],
    ["sel_attr", "%"],
    ["sel_crse", ""],
    ["sel_title", ""],
    ["sel_from_cred", ""],
    ["sel_to_cred", ""],
    ["begin_hh", "0"],
    ["begin_mi", "0"],
    ["begin_ap", "a"],
    ["end_hh", "0"],
    ["end_mi", "0"],
    ["end_ap", "a"],
  ];

  return pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function parseLauTerms(html) {
  return [...html.matchAll(/<OPTION VALUE="([^"]+)">([\s\S]*?)<\/OPTION>/gi)]
    .map((match) => ({
      code: normalizeWhitespace(match[1]),
      description: normalizeWhitespace(stripTags(match[2])),
    }))
    .filter((term) => term.code && term.description);
}

function parseLauSubjects(html) {
  return [...html.matchAll(/<OPTION VALUE="([^"]+)">([\s\S]*?)<\/OPTION>/gi)]
    .map((match) => ({
      code: normalizeWhitespace(match[1]),
      description: normalizeWhitespace(stripTags(match[2])),
    }))
    .filter((subject) => subject.code && subject.code !== "dummy");
}

function parseLauMeeting(blockHtml) {
  const tableMatch = blockHtml.match(/<caption class="captiontext">Scheduled Meeting Times<\/caption>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return {
      days: "TBA",
      time: "TBA",
      location: "TBA",
      scheduleType: "Lecture",
      instructor: "TBA",
    };
  }

  const rows = [...tableMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) =>
      [...rowMatch[1].matchAll(/<td CLASS="dddefault">([\s\S]*?)<\/td>/gi)]
        .map((cellMatch) => stripTags(cellMatch[1])),
    )
    .filter((row) => row.length >= 7);

  const selectedRow = rows.find((row) => row[0] === "Class") ?? rows[0];
  if (!selectedRow) {
    return {
      days: "TBA",
      time: "TBA",
      location: "TBA",
      scheduleType: "Lecture",
      instructor: "TBA",
    };
  }

  return {
    days: parseCompactDays(selectedRow[2]),
    time: selectedRow[1].includes("am") || selectedRow[1].includes("pm")
      ? normalizeMeridianRange(selectedRow[1])
      : "TBA",
    location: normalizeWhitespace(selectedRow[3]) || "TBA",
    scheduleType: normalizeWhitespace(selectedRow[5]) || "Lecture",
    instructor: normalizeWhitespace(selectedRow[6]) || "TBA",
  };
}

function parseLauCourses(html, termCode) {
  const blocks = html.split(/<th CLASS="ddtitle" scope="colgroup" >/i).slice(1);
  const courses = [];

  for (const block of blocks) {
    const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const header = stripTags(titleMatch[1]);
    const headerMatch = header.match(/^(.*?) - (\d+) - ([A-Z]+)\s+([A-Z0-9]+) - (.+)$/i);
    if (!headerMatch) continue;

    const [, title, crn, department, courseNumber, section] = headerMatch;
    const creditsMatch = block.match(/([\d.]+)\s*Credits/i);
    const levelsMatch = block.match(/Levels:\s*<\/SPAN>([\s\S]*?)<br/i);
    const attributesMatch = block.match(/Attributes:\s*<\/SPAN>([\s\S]*?)<br/i);
    const campusMatch = block.match(/<br \/>\s*([^<]*?Campus)\s*<br \/>/i);
    const scheduleTypeMatch = block.match(/<br \/>\s*([^<]*?Schedule Type)\s*<br \/>/i);
    const meeting = parseLauMeeting(block);
    const scheduleType = normalizeWhitespace(scheduleTypeMatch?.[1] || meeting.scheduleType).replace(/ Schedule Type$/i, "");
    const instructor = meeting.instructor;

    courses.push({
      id: `lau:${termCode}:${crn}`,
      term_code: termCode,
      crn: String(crn),
      code: `${department} ${courseNumber}`,
      department: department.toUpperCase(),
      course_number: courseNumber.toUpperCase(),
      section: normalizeWhitespace(section),
      title: normalizeWhitespace(title),
      credits: Number(creditsMatch?.[1] || 0),
      instructor,
      professor_id: professorIdFor("lau", instructor),
      campus: normalizeWhitespace(campusMatch?.[1] || "Main Campus"),
      schedule: {
        days: meeting.days,
        time: meeting.time,
        location: meeting.location,
        section: normalizeWhitespace(section),
        type: scheduleType || "Lecture",
      },
      capacity: 0,
      enrolled_count: 0,
      prerequisites: null,
      attributes: [
        normalizeWhitespace(stripTags(levelsMatch?.[1] || "")),
        normalizeWhitespace(stripTags(attributesMatch?.[1] || "")),
      ].filter(Boolean),
    });
  }

  return dedupeBy(courses, (course) => `${course.crn}:${course.term_code}`);
}

async function fetchLauTermCatalog(page, sourceUrl, termCode) {
  await page.goto(`${sourceUrl}/bwckschd.p_disp_dyn_sched`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.selectOption("#term_input_id", termCode);

  const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    submitButton.click(),
  ]);
  await page.waitForTimeout(1000);

  const subjects = await page.evaluate(() =>
    Array.from(document.querySelectorAll('select[name="sel_subj"] option'))
      .map((option) => ({
        code: option.getAttribute("value") || "",
        description: option.textContent || "",
      })),
  );
  const filteredSubjects = parseLauSubjects(
    subjects
      .map((subject) => `<option value="${subject.code}">${subject.description}</option>`)
      .join(""),
  );

  const courses = [];
  for (const subject of filteredSubjects) {
    const responseText = await page.evaluate(
      async ({ body }) => {
        const response = await fetch("/prod/bwckschd.p_get_crse_unsec", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        return response.text();
      },
      { body: buildLauSearchBody(termCode, subject.code) },
    );

    const subjectCourses = parseLauCourses(responseText, termCode);
    if (subjectCourses.length) {
      logStep("lau subject", `${termCode} ${subject.code} -> ${subjectCourses.length} sections`);
      courses.push(...subjectCourses);
    }
  }

  return courses;
}

async function fetchLauCatalog() {
  const sourceUrl = "https://banweb.lau.edu.lb/prod";
  const termPredicate = (term) =>
    /^(fall|spring|summer)/i.test(term.description)
    && !/academic year|progreen|ace|cep/i.test(term.description);
  const termPage = await requestText(`${sourceUrl}/bwckschd.p_disp_dyn_sched`);
  const terms = parseLauTerms(termPage.text);
  const currentTerm = chooseCurrentTerm(terms, termPredicate);
  const selectedTerms = chooseRelevantTerms(terms, termPredicate);

  logStep("lau current term", `${currentTerm.description} (${currentTerm.code})`);
  logStep(
    "lau selected terms",
    selectedTerms.map((term) => `${term.description} (${term.code})`).join(" | "),
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const courses = [];

    for (const term of selectedTerms) {
      logStep("lau term", `${term.description} (${term.code})`);
      const termCourses = await fetchLauTermCatalog(page, sourceUrl, term.code);
      courses.push(...termCourses);
    }

    return {
      terms: selectedTerms.map((term) => ({
        code: term.code,
        description: normalizeWhitespace(term.description).replace(/\(view only\)/i, "").trim(),
        is_current: term.code === currentTerm.code,
      })),
      courses: dedupeBy(courses, (course) => `${course.crn}:${course.term_code}`),
    };
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

module.exports = {
  fetchLauCatalog,
};
