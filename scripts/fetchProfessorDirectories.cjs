const { chromium } = require("playwright");
const { PDFParse } = require("pdf-parse");
const {
  dedupeBy,
  logStep,
  normalizeWhitespace,
  professorIdFor,
  requestText,
  stripTags,
} = require("./catalogUtils.cjs");

const AUB_FACULTY_LIST_URL = "https://www.aub.edu.lb/Registrar/catalogue2025-26/ug/Pages/faculty-list.aspx";
const LAU_DIRECTORY_URL = "https://directory.lau.edu.lb/";
const USEK_FACULTY_URLS = [
  "https://www.usek.edu.lb/list-of-full-time-faculty-members/business-school",
  "https://www.usek.edu.lb/en/list-of-full-time-faculty-members/faculty-of-arts-and-sciences",
  "https://www.usek.edu.lb/en/list-of-full-time-faculty-members/school-of-engineering",
  "https://www.usek.edu.lb/en/list-of-full-time-faculty-members/school-of-architecture-and-design",
  "https://www.usek.edu.lb/en/list-of-full-time-faculty-members/school-of-medicine-and-medical-sciences",
  "https://www.usek.edu.lb/en/list-of-full-time-faculty-members/school-of-music-and-performing-arts",
  "https://www.usek.edu.lb/en/list-of-full-time-faculty-members/faculty-of-religious-and-oriental-sciences",
  "https://www.usek.edu.lb/en/list-of-full-time-faculty-members/higher-institute-of-nursing-sciences",
];
const BAU_ACADEMIC_PAGES = [
  "https://websitedev.bau.edu.lb/Staff/Architecture-Design-and-Built-Environment/Academic",
  "https://websitedev.bau.edu.lb/Staff/Architecture-Design-and-Built-Environment-Tripoli/Academic",
  "https://websitedev.bau.edu.lb/Staff/Business-Administration/Academic",
  "https://websitedev.bau.edu.lb/Staff/Engineering/Academic",
  "https://websitedev.bau.edu.lb/Staff/Human-Sciences/Academic",
  "https://websitedev.bau.edu.lb/Staff/Law-and-Political-science/Academic",
  "https://websitedev.bau.edu.lb/Staff/Medicine/Academic",
  "https://websitedev.bau.edu.lb/Staff/Pharmacy/Academic",
  "https://websitedev.bau.edu.lb/Staff/Health-Sciences/Academic",
  "https://websitedev.bau.edu.lb/Staff/Dentistry/Academic",
  "https://websitedev.bau.edu.lb/Staff/Science/Academic",
];
const NDU_FACULTY_URLS = [
  "https://www.ndu.edu.lb/academics/faculties/faad/about-the-faculty/fulltime-faculty-members",
  "https://www.ndu.edu.lb/academics/faculties/fbae/about-the-faculty/fulltime-faculty-members",
  "https://www.ndu.edu.lb/academics/faculties/fe/about-the-faculty/fulltime-faculty-members",
  "https://www.ndu.edu.lb/academics/faculties/fh/about-the-faculty/fulltime-faculty-members",
  "https://www.ndu.edu.lb/academics/faculties/flps/about-the-faculty/fulltime-faculty-members",
  "https://www.ndu.edu.lb/academics/faculties/fnas/about-the-faculty/fulltime-faculty-members",
  "https://www.ndu.edu.lb/academics/faculties/fnhs/about-the-faculty/fulltime-faculty-members",
];
const USJ_FACULTY_SOURCE_URL = "https://www.usj.edu.lb/catalogues/24-25.php";
const LU_MEDICINE_URL = "https://medicine.ul.edu.lb/intro/teachingStaff.aspx";
const LU_TECH_COUNCIL_URL = "https://iut.ul.edu.lb/ft-council.php";
const LU_FEB_FACULTY_URL = "https://gestion1.ul.edu.lb/faculty.aspx";
const LIU_SAS_FACULTY_URL = "https://liu.edu.lb/NewLIU2022/SAS/facultyDirectory.php";
const LIU_ENGINEERING_FACULTY_URLS = [
  "https://eee.liu.edu.lb/faculty",
  "https://cce.liu.edu.lb/faculty",
  "https://meng.liu.edu.lb/faculty",
];
const AUST_PROFESSOR_DOCS = [
  "https://api.aust.edu.lb/content/uploads/files/EVALAG-Self-Evaluation-Report.pdf",
  "https://api.aust.edu.lb/content/uploads/files/issue-265.pdf",
  "https://api.aust.edu.lb/content/uploads/files/800~issue-264.pdf",
  "https://api.aust.edu.lb/content/uploads/files/Geopolitics.pdf",
];

const LAU_QUERY_TERMS = [
  "Medicine",
  "Business",
  "Engineering",
  "Pharmacy",
  "Nursing",
  "Architecture",
  "Design",
  "Computer Science",
  "Natural Sciences",
  "Communication",
  "Education",
  "Languages",
  "Economics",
  "Social",
];

const USJ_ROLE_HEADINGS = [
  /^Professeurs?$/i,
  /^Professeurs?\s+associ[eé]s?$/i,
  /^Professors?$/i,
  /^Associate Professors?$/i,
  /^Ma[iî]tres?\s+de\s+conf[eé]rences?$/i,
  /^Charg[eé]s?\s+d['’]enseignement$/i,
  /^Charg[eé]s?\s+de\s+formation\s+pratique$/i,
  /^Charg[eé]s?\s+de\s+cours$/i,
  /^Charg[eé]s?\s+de\s+travaux\s+pratiques$/i,
  /^Lecturers?$/i,
  /^Instructors?$/i,
];
const USJ_STOP_HEADINGS = /^(DIPL[OÔ]MES|PROGRAMMES?|PROGRAMS?|MISSION|HISTORIQUE|HISTORY|OBJECTIFS|CURSUS|ADMISSION|CONTACT|SERVICES|RECHERCHE|RESEARCH|ETUDES|ÉTUDES)$/i;

function cleanupProfessorName(rawValue = "") {
  let value = normalizeWhitespace(stripTags(rawValue))
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s*\(view only\)\s*/gi, " ")
    .replace(/^#+\s*/, "")
    .replace(/^(Prof(?:essor)?|Dr|Mr|Mrs|Ms|Fr)\.?\s+/i, "")
    .replace(/\s*,\s*(PhD|Ph\.D\.?|MD|M\.D\.?|MBA|MSc|M\.Sc\.?|MS|MA|DDS|DSc|DrPH|EdD|RN|RPh|OD|MPH)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!value || /^tba$/i.test(value)) {
    return "";
  }

  return value;
}

function buildProfessorRecord(universityId, fullName = "") {
  const cleanedName = cleanupProfessorName(fullName);
  if (!cleanedName) return null;

  return {
    id: professorIdFor(universityId, cleanedName),
    full_name: cleanedName,
  };
}

function dedupeProfessors(universityId, names = []) {
  return dedupeBy(
    names
      .map((value) => buildProfessorRecord(universityId, value))
      .filter(Boolean),
    (professor) => professor.id,
  ).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function fetchAubProfessors() {
  const response = await requestText(AUB_FACULTY_LIST_URL);
  const names = [...response.text.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => cleanupProfessorName(String(match[1]).split(";")[0]))
    .filter((name) => name && /,/.test(name));

  return {
    professors: dedupeProfessors("aub", names),
    sources: [AUB_FACULTY_LIST_URL],
  };
}

async function extractLauRows(page) {
  return page.$$eval("table tr", (rows) =>
    rows
      .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.innerText.trim()))
      .filter((values) => values.length >= 4 && /@lau\.edu\.lb$/i.test(values[3] || ""))
      .map((values) => ({
        name: values[0],
        email: values[3],
      })));
}

async function collectLauResultPages(page) {
  const hrefs = await page.$$eval("a", (links) =>
    links
      .map((link) => ({
        text: (link.textContent || "").trim(),
        href: link.getAttribute("href") || "",
      }))
      .filter((link) => /^\d+$/.test(link.text) && link.href && link.href !== "#")
      .map((link) => link.href));

  return dedupeBy(
    [page.url(), ...hrefs.map((href) => new URL(href, LAU_DIRECTORY_URL).toString())],
    (value) => value,
  );
}

async function fetchLauProfessors() {
  const browser = await chromium.launch({ headless: true });
  const collected = [];

  try {
    for (const query of LAU_QUERY_TERMS) {
      const page = await browser.newPage();
      try {
        await page.goto(LAU_DIRECTORY_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.check("#faculty");
        await page.fill("#dept", query);
        await page.click('input[name="submit"]');
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1200);

        const pageUrls = await collectLauResultPages(page);
        for (const url of pageUrls) {
          if (url !== page.url()) {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForTimeout(800);
          }
          const rows = await extractLauRows(page);
          collected.push(...rows.map((row) => row.name));
        }

        logStep("lau professors", `${query} -> ${collected.length} cumulative names`);
      } catch (error) {
        logStep("lau professor query failed", `${query} -> ${error.message}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  return {
    professors: dedupeProfessors("lau", collected),
    sources: [LAU_DIRECTORY_URL],
  };
}

function parseUsekProfessors(html) {
  const rows = [...html.matchAll(
    /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>[\s\S]*?mailto:([^"]+@usek\.edu\.lb)[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi,
  )];

  return rows.map((row) => cleanupProfessorName(row[1]));
}

async function fetchUsekProfessors() {
  const names = [];
  const sources = [];

  for (const url of USEK_FACULTY_URLS) {
    try {
      const response = await requestText(url);
      const pageNames = parseUsekProfessors(response.text);
      if (pageNames.length) {
        names.push(...pageNames);
        sources.push(url);
      }
    } catch (error) {
      logStep("usek professors failed", `${url} -> ${error.message}`);
    }
  }

  return {
    professors: dedupeProfessors("usek", names),
    sources,
  };
}

function parseBauProfessors(html) {
  return html
    .split(/<div class="u-info-v6-1">/gi)
    .slice(1)
    .map((block) => block.slice(0, 6000))
    .filter((block) => /mailto:[^"]+@bau\.edu\.lb/i.test(block))
    .map((block) => {
      const nameMatch = block.match(/<h6[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h6>/i);
      return cleanupProfessorName(nameMatch?.[1] ?? "");
    })
    .filter(Boolean);
}

async function fetchBauProfessors() {
  const names = [];
  const sources = [];

  for (const url of BAU_ACADEMIC_PAGES) {
    try {
      const response = await requestText(url);
      const pageNames = parseBauProfessors(response.text);
      if (pageNames.length) {
        names.push(...pageNames);
        sources.push(url);
      }
    } catch (error) {
      logStep("bau professors failed", `${url} -> ${error.message}`);
    }
  }

  return {
    professors: dedupeProfessors("bau", names),
    sources,
  };
}

function parseNduProfessors(html) {
  return html
    .split(/<div class="member-card"[^>]*>/gi)
    .slice(1)
    .map((block) => block.slice(0, 9000))
    .map((block) => {
      const nameMatch = block.match(/<h4 class="name">([\s\S]*?)<\/h4>/i);
      return cleanupProfessorName((nameMatch?.[1] ?? "").replace(/<br\s*\/?>/gi, " "));
    })
    .filter(Boolean);
}

async function fetchNduProfessors() {
  const names = [];
  const sources = [];

  for (const url of NDU_FACULTY_URLS) {
    try {
      const response = await requestText(url);
      const pageNames = parseNduProfessors(response.text);
      if (pageNames.length) {
        names.push(...pageNames);
        sources.push(url);
      }
    } catch (error) {
      logStep("ndu professors failed", `${url} -> ${error.message}`);
    }
  }

  return {
    professors: dedupeProfessors("ndu", names),
    sources,
  };
}

function parseUsjFacultyPdfLinks(html) {
  return dedupeBy(
    [...html.matchAll(/href="([^"]+01-[^"]+\.pdf)"/gi)]
      .map((match) => new URL(match[1], USJ_FACULTY_SOURCE_URL).toString()),
    (url) => url,
  );
}

function extractUsjNamesFromText(text) {
  const names = [];
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  for (const line of lines) {
    const deanMatch = line.match(/^(Doyen|Dean|Director)\s*:\s*(.+)$/i);
    if (deanMatch) {
      names.push(deanMatch[2]);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!USJ_ROLE_HEADINGS.some((pattern) => pattern.test(line))) {
      continue;
    }

    const buffer = [];
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const candidate = lines[nextIndex];
      if (
        USJ_ROLE_HEADINGS.some((pattern) => pattern.test(candidate))
        || USJ_STOP_HEADINGS.test(candidate)
        || /^-- \d+ of \d+ --$/i.test(candidate)
      ) {
        break;
      }
      buffer.push(candidate);
    }

    const joined = buffer.join(" ");
    joined
      .split(/\s*,\s*/)
      .map((value) => cleanupProfessorName(value))
      .filter((value) => value && value.includes(" "))
      .forEach((value) => names.push(value));
  }

  return names;
}

async function fetchUsjProfessors() {
  const response = await requestText(USJ_FACULTY_SOURCE_URL);
  const pdfUrls = parseUsjFacultyPdfLinks(response.text);
  const names = [];

  for (const url of pdfUrls) {
    try {
      const parser = new PDFParse({ url });
      const result = await parser.getText();
      names.push(...extractUsjNamesFromText(result.text));
      await parser.destroy().catch(() => undefined);
    } catch (error) {
      logStep("usj faculty pdf failed", `${url} -> ${error.message}`);
    }
  }

  return {
    professors: dedupeProfessors("usj", names),
    sources: [USJ_FACULTY_SOURCE_URL, ...pdfUrls],
  };
}

function extractAustNamesFromText(text) {
  const names = [];
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  for (const line of lines) {
    const committeeMatch = line.match(/^•\s*(Dr\.|Mr\.|Ms\.)\s+([^,]+),\s*(.+)$/i);
    if (committeeMatch && /(Dean|Provost|Faculty|Head)/i.test(committeeMatch[3])) {
      names.push(committeeMatch[2]);
    }

    const inlinePatterns = [
      /by Dr\.\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4})/g,
      /mentored by Dr\.\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4})/g,
      /Dr\.\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4})\s+is the Dean of/gi,
      /Dr\.\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4})\s+.*AUST/gi,
    ];

    for (const pattern of inlinePatterns) {
      for (const match of line.matchAll(pattern)) {
        names.push(match[1]);
      }
    }
  }

  return names;
}

async function fetchAustProfessors() {
  const names = [];
  const sources = [];

  for (const url of AUST_PROFESSOR_DOCS) {
    try {
      const parser = new PDFParse({ url });
      const result = await parser.getText();
      names.push(...extractAustNamesFromText(result.text));
      sources.push(url);
      await parser.destroy().catch(() => undefined);
    } catch (error) {
      logStep("aust professor doc failed", `${url} -> ${error.message}`);
    }
  }

  return {
    professors: dedupeProfessors("aust", names),
    sources,
  };
}

function parseLuMedicineProfessors(html) {
  const rows = [...html.matchAll(/<tr><td>\s*([^<]+?)\s*<\/td><td>\s*([^<]+?)\s*<\/td><td>\s*([^<]+?)\s*<\/td><td>\s*([^<]+?)\s*<\/td>/gi)];
  return rows
    .map((row) => cleanupProfessorName(row[4]))
    .filter(Boolean);
}

function parseLuTechCouncilProfessors(html) {
  const rows = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>\s*(?:Pr\.|Dr\.)?\s*([^<]+?)\s*<\/td>/gi)];
  return rows
    .map((row) => cleanupProfessorName(row[1]))
    .filter(Boolean);
}

function parseLuFebProfessors(html) {
  const rows = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>\s*<font[^>]*>([^<]+)<\/font>\s*<\/td><td[^>]*>\s*<font[^>]*>([^<]+)<\/font>/gi)];
  return rows
    .map((row) => cleanupProfessorName(row[1]))
    .filter(Boolean);
}

function parseLiuSasProfessors(html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];

  return rows
    .map((row) => {
      const values = [...row[1].matchAll(/<td[^>]*>\s*(?:<strong>)?([\s\S]*?)(?:<\/strong>)?\s*<\/td>/gi)]
        .map((match) => stripTags(match[1]));
      if (values.length < 6) {
        return "";
      }
      return cleanupProfessorName(values[0]);
    })
    .filter(Boolean);
}

function extractLiuFacultyNamesFromText(text) {
  const normalizedText = normalizeWhitespace(String(text))
    .replace(/(Full-Time Faculty|Part-Time Faculty|Adjunct Faculty)/gi, "\n$1\n")
    .replace(/\bEmail:\s*[A-Z0-9._%+-]+@liu\.edu\.lb\b/gi, (match) => `${match}\n`);
  const names = [];
  const namePattern = /([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,6})\s*,\s*(?:PhD,\s*)?(?:Chairman|Chairperson|Associate Chairman|Associate Chairperson|Dean(?: of the School of Engineering)?|Assistant Dean(?: \([^)]+\))?|Professor|Associate Professor|Assistant Professor|Lecturer(?:-Master)?|Lab Instructor|Instructor)\b/g;

  for (const match of normalizedText.matchAll(namePattern)) {
    const cleanedName = cleanupProfessorName(match[1]);
    if (cleanedName) {
      names.push(cleanedName);
    }
  }

  return names;
}

async function fetchLiuEngineeringProfessors() {
  const browser = await chromium.launch({ headless: true });
  const names = [];
  const sources = [];

  try {
    for (const url of LIU_ENGINEERING_FACULTY_URLS) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(1800);
        const pageText = await page.textContent("body");
        const pageNames = extractLiuFacultyNamesFromText(pageText);
        if (pageNames.length) {
          names.push(...pageNames);
          sources.push(url);
        }
      } catch (error) {
        logStep("liu faculty page failed", `${url} -> ${error.message}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  return {
    names,
    sources,
  };
}

async function fetchLiuProfessors() {
  const names = [];
  const sources = [];

  try {
    const response = await requestText(LIU_SAS_FACULTY_URL);
    const pageNames = parseLiuSasProfessors(response.text);
    if (pageNames.length) {
      names.push(...pageNames);
      sources.push(LIU_SAS_FACULTY_URL);
    }
  } catch (error) {
    logStep("liu sas faculty failed", error.message);
  }

  try {
    const engineeringDirectory = await fetchLiuEngineeringProfessors();
    names.push(...engineeringDirectory.names);
    sources.push(...engineeringDirectory.sources);
  } catch (error) {
    logStep("liu engineering faculty failed", error.message);
  }

  return {
    professors: dedupeProfessors("liu", names),
    sources: dedupeBy(sources, (value) => value),
  };
}

async function fetchLuProfessors() {
  const names = [];
  const sources = [];
  const pages = [
    { url: LU_MEDICINE_URL, parser: parseLuMedicineProfessors },
    { url: LU_TECH_COUNCIL_URL, parser: parseLuTechCouncilProfessors },
    { url: LU_FEB_FACULTY_URL, parser: parseLuFebProfessors },
  ];

  for (const source of pages) {
    try {
      const response = await requestText(source.url, { rejectUnauthorized: false });
      const pageNames = source.parser(response.text);
      if (pageNames.length) {
        names.push(...pageNames);
        sources.push(source.url);
      }
    } catch (error) {
      logStep("lu professors failed", `${source.url} -> ${error.message}`);
    }
  }

  return {
    professors: dedupeProfessors("lu", names),
    sources,
  };
}

async function fetchProfessorDirectory(universityId) {
  switch (universityId) {
    case "aub":
      return fetchAubProfessors();
    case "lau":
      return fetchLauProfessors();
    case "usek":
      return fetchUsekProfessors();
    case "bau":
      return fetchBauProfessors();
    case "ndu":
      return fetchNduProfessors();
    case "aust":
      return fetchAustProfessors();
    case "usj":
      return fetchUsjProfessors();
    case "lu":
      return fetchLuProfessors();
    case "liu":
      return fetchLiuProfessors();
    default:
      return { professors: [], sources: [] };
  }
}

module.exports = {
  fetchProfessorDirectory,
};
