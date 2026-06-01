const UNIVERSITY_MAJOR_SOURCES = {
  aub: "https://www.aub.edu.lb/admissions/Documents/2020_21IntroductionBrochure.pdf",
  lau: "https://catalog.lau.edu.lb/undergraduate/programs/index.php",
  usek: "https://www.usek.edu.lb/Content/Assets/20251110UniversityCatalog2526-032446.pdf",
  bau: "https://websitedev.bau.edu.lb/UnderGraduate/Programs",
  ndu: "https://www.ndu.edu.lb/academics/undergraduate",
  aust: "https://www.aust.edu.lb/admission/application-instructions",
  usj: "https://www.usj.edu.lb/admission/pdf/cata-programs-en.pdf",
  lu: "https://www.ul.edu.lb/Majors.aspx",
  liu: "https://syslb.liu.edu.lb/syslbdatadir/Documents/09_University_Catalog.pdf",
};

function slugify(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function major(title, options = {}) {
  return {
    id: options.id || slugify(title),
    title,
    aliases: unique(options.aliases || []),
    subjects: unique(options.subjects || []),
    keywords: unique(options.keywords || []),
    mappedPlanId: options.mappedPlanId || null,
    source: options.source || "",
  };
}

const OFFICIAL_MAJOR_REGISTRY = {
  aub: [
    major("Agribusiness"),
    major("Agriculture"),
    major("Food Science and Management", { aliases: ["food science"] }),
    major("Landscape Architecture"),
    major("Nutrition and Dietetics"),
    major("Applied Mathematics", { aliases: ["mathematics"] }),
    major("Arabic Language and Literature", { aliases: ["arabic", "arabic literature"] }),
    major("Archaeology"),
    major("Art History"),
    major("Biology"),
    major("Business Administration", {
      aliases: ["business", "business administration", "bba"],
      subjects: ["BUSS", "ACCT", "FINA", "MNGT", "MKTG", "DCSN", "INFO"],
      mappedPlanId: "business-administration",
    }),
    major("Chemistry"),
    major("Computer Science", {
      aliases: ["computer science", "cs", "cmps", "compsci", "comp sci"],
      subjects: ["CMPS"],
      mappedPlanId: "computer-science",
    }),
    major("Economics"),
    major("Education"),
    major("English Language"),
    major("English Literature", { aliases: ["english"] }),
    major("Geology"),
    major("History"),
    major("Mathematics", { aliases: ["math"] }),
    major("Media and Communication", { aliases: ["media studies", "communication"] }),
    major("Petroleum Geosciences"),
    major("Philosophy"),
    major("Physics"),
    major("Political Studies", { aliases: ["political science"] }),
    major("Psychology", { aliases: ["psych"] }),
    major("Public Administration"),
    major("Sociology-Anthropology", { aliases: ["sociology", "anthropology"] }),
    major("Statistics"),
    major("Studio Arts", { aliases: ["arts"] }),
    major("Environmental Health", { aliases: ["public health"] }),
    major("Health Communication"),
    major("Medical Audiology Sciences"),
    major("Medical Imaging Sciences"),
    major("Medical Laboratory Sciences"),
    major("Architecture"),
      major("Chemical Engineering", { mappedPlanId: "chemical-engineering" }),
      major("Civil Engineering", { aliases: ["civil engineer"], mappedPlanId: "civil-engineering" }),
      major("Computer and Communications Engineering", {
        aliases: ["cce", "computer communication engineering"],
        mappedPlanId: "computer-and-communications-engineering",
      }),
      major("Computer Science and Engineering", { aliases: ["cse"], mappedPlanId: "computer-science-and-engineering" }),
      major("Construction Engineering", { mappedPlanId: "construction-engineering" }),
      major("Electrical and Computer Engineering", { aliases: ["eece", "ece"], mappedPlanId: "electrical-and-computer-engineering" }),
      major("Graphic Design"),
      major("Industrial Engineering", { mappedPlanId: "industrial-engineering" }),
      major("Mechanical Engineering", { mappedPlanId: "mechanical-engineering" }),
    major("Nursing"),
  ],
  lau: [
    major("Applied Physics"),
    major("Architecture"),
    major("Bioinformatics"),
    major("Biology"),
    major("Business Studies", {
      aliases: [
        "business administration",
        "business",
        "bba",
        "management",
        "accounting",
        "finance",
        "banking and finance",
        "marketing",
        "entrepreneurship",
      ],
      mappedPlanId: "business-studies",
    }),
    major("Chemistry"),
    major("Civil Engineering"),
    major("Communication", { aliases: ["communication arts", "media studies"] }),
    major("Computer Engineering", { aliases: ["computer engineer", "coe"], mappedPlanId: "computer-engineering" }),
    major("Computer Science", { aliases: ["cs", "csc"], mappedPlanId: "computer-science" }),
    major("Economics"),
    major("Education"),
    major("Electrical Engineering"),
    major("English"),
    major("Fashion Design"),
    major("Graphic Design"),
    major("Hospitality and Tourism Management", { aliases: ["hospitality", "tourism"] }),
    major("Industrial Engineering"),
    major("Interior Design"),
    major("Mathematics", { aliases: ["math"] }),
    major("Mechanical Engineering"),
    major("Mechatronics Engineering"),
    major("Multimedia Journalism", { aliases: ["journalism"] }),
    major("Nursing"),
    major("Nutrition and Dietetics"),
    major("Performing Arts"),
    major("Petroleum Engineering"),
    major("Pharmacy"),
    major("Political Science", { aliases: ["international affairs"] }),
    major("Psychology", { aliases: ["psych"] }),
    major("Studio Arts", { aliases: ["arts"] }),
    major("Television and Film"),
    major("Translation"),
  ],
  usek: [
    major("Business Administration", { aliases: ["bba", "business"] }),
    major("Business Administration – International", { aliases: ["international business administration"] }),
    major("Arabic Language and Literature"),
    major("Cinema and Television"),
    major("Conservation and Restoration"),
    major("Education – Basic Education", { aliases: ["basic education"] }),
    major("Education – Early Childhood", { aliases: ["early childhood education"] }),
    major("English Language and Literature", { aliases: ["english"] }),
    major("French Language and Literature", { aliases: ["french"] }),
    major("History"),
    major("Journalism and Communication", { aliases: ["journalism", "communication"] }),
    major("Liturgy"),
    major("Modern Languages and Translation", { aliases: ["translation", "languages"] }),
    major("Performing Arts"),
    major("Philosophy"),
    major("Psychology"),
    major("Religious and Pastoral Education"),
    major("Social Sciences"),
    major("Actuarial and Financial Mathematics", { aliases: ["financial mathematics"] }),
    major("Biochemistry"),
    major("Biology"),
    major("Chemistry"),
    major("Computer Science", { aliases: ["cs"] }),
    major("Information Technology", { aliases: ["it"] }),
    major("Human Nutrition and Dietetics", { aliases: ["nutrition and dietetics"] }),
    major("Architecture"),
    major("Communication and Visual Arts"),
    major("Design and Applied Arts"),
    major("Digital Media"),
    major("Biomedical Engineering"),
    major("Chemical Engineering"),
    major("Civil Engineering"),
    major("Computer Engineering", {
      aliases: ["computer and communication engineering", "cce"],
    }),
    major("Electrical and Electronics Engineering", { aliases: ["electrical engineering"] }),
    major("Mechanical Engineering"),
    major("Telecommunications Engineering", { aliases: ["communication engineering", "telecommunication engineering"] }),
    major("Engineering Sciences – Food Engineering", { aliases: ["food engineering"] }),
    major("International Relations"),
    major("Political Sciences", { aliases: ["political science"] }),
    major("Fundamental Health Sciences"),
    major("Nursing Sciences", { aliases: ["nursing"] }),
    major("Music"),
    major("Higher and Specialized Music"),
    major("Theology"),
  ],
  bau: [
    major("Business Administration", { aliases: ["business", "bba"] }),
    major("Accounting"),
    major("Economics"),
    major("Banking and Finance", { aliases: ["finance", "banking"] }),
    major("Marketing"),
    major("Human Resource Management"),
    major("Civil Engineering", { aliases: ["civil engineer"], mappedPlanId: "civil-engineering" }),
    major("Mechanical Engineering", { aliases: ["mechanical engineer"], mappedPlanId: "mechanical-engineering" }),
    major("Computer Engineering", { aliases: ["computer engineer"], mappedPlanId: "computer-engineering" }),
    major("Electrical and Computer Engineering", { aliases: ["electrical engineering"] }),
    major("Chemical Engineering"),
    major("Biomedical Engineering"),
    major("Architecture"),
    major("Interior Design"),
    major("Graphic Design"),
    major("Computer Science", { aliases: ["cs"], mappedPlanId: "computer-science" }),
    major("Information Technology", { aliases: ["it"] }),
    major("Mathematics", { aliases: ["math"] }),
    major("Physics", { mappedPlanId: "physics" }),
    major("Chemistry"),
    major("Biochemistry"),
    major("Biotechnology"),
    major("Nursing"),
    major("Nutrition and Dietetics"),
    major("Medicine"),
    major("Dentistry"),
    major("Pharmacy"),
    major("Law"),
    major("Mass Communication", { aliases: ["communication", "media studies"] }),
    major("English Language and Literature", { aliases: ["english"] }),
    major("Arabic Language and Literature", { aliases: ["arabic"] }),
    major("Sociology"),
    major("Psychology"),
    major("Special Education"),
  ],
  ndu: [
    major("Computer Science", { aliases: ["cs"], mappedPlanId: "computer-science" }),
    major("MIS", { aliases: ["management information systems"], mappedPlanId: "mis" }),
    major("Computer Engineering", {
      aliases: ["computer and communication engineering", "cce"],
      mappedPlanId: "computer-engineering",
    }),
    major("Civil Engineering", { mappedPlanId: "civil-engineering" }),
    major("Business Administration", { aliases: ["business", "bba"], mappedPlanId: "business-administration" }),
    major("Finance", { aliases: ["banking and finance"], mappedPlanId: "finance" }),
    major("Accounting", { mappedPlanId: "accounting" }),
    major("Marketing", { mappedPlanId: "marketing" }),
    major("Media Studies"),
    major("Political Science", { mappedPlanId: "political-science" }),
    major("Graphic Design", { mappedPlanId: "graphic-design" }),
    major("Hospitality", { aliases: ["hospitality management"], mappedPlanId: "hospitality" }),
  ],
  aust: [
    major("Computer Science", { aliases: ["cs"], mappedPlanId: "computer-science" }),
    major("Information Technology", { aliases: ["it"], mappedPlanId: "information-technology" }),
    major("Computer Engineering"),
    major("Mechatronics Engineering"),
    major("Biomedical Engineering"),
    major("Business Administration", { aliases: ["business", "bba"], mappedPlanId: "business-administration" }),
    major("Accounting", { mappedPlanId: "accounting" }),
    major("Finance", { mappedPlanId: "finance" }),
    major("Marketing", { mappedPlanId: "marketing" }),
    major("Hospitality Management", { aliases: ["hospitality"], mappedPlanId: "hospitality-management" }),
    major("Economics", { mappedPlanId: "economics" }),
    major("Biotechnology"),
    major("Optometry"),
      major("Graphic Design", { mappedPlanId: "graphic-design" }),
      major("Interior Design", { mappedPlanId: "interior-design" }),
    major("Architecture"),
    major("Civil Engineering"),
    major("Computer and Communications Engineering", { aliases: ["cce"] }),
    major("Laboratory Science Technology"),
  ],
  usj: [
    major("Computer Science", { aliases: ["cs"], mappedPlanId: "computer-science" }),
    major("Engineering"),
    major("Medicine"),
    major("Pharmacy"),
    major("Dentistry"),
    major("Law"),
    major("Business Administration", { aliases: ["business", "bba"], mappedPlanId: "business-administration" }),
    major("Economics"),
    major("Translation"),
    major("Languages"),
    major("Political Science"),
    major("Social Sciences"),
    major("Speech and Language Therapy", { mappedPlanId: "speech-and-language-therapy" }),
    major("Data Science", { mappedPlanId: "data-science" }),
    major("Banking Studies", { mappedPlanId: "banking-studies" }),
    major("Insurance Science", { mappedPlanId: "insurance-science" }),
    major("Fashion Design"),
  ],
  lu: [
    major("Computer Science", { aliases: ["cs"] }),
    major("Mathematics", { aliases: ["math"] }),
    major("Physics"),
    major("Biology"),
    major("Chemistry"),
    major("Engineering"),
    major("Business Administration", { aliases: ["business", "bba"] }),
    major("Accounting"),
    major("Finance"),
    major("Law"),
    major("Arts"),
    major("Education"),
    major("Social Sciences"),
    major("Agriculture"),
    major("Information and Documentation"),
    major("Public Health"),
    major("Agricultural Engineering and Veterinary Medicine"),
  ],
  liu: [
    major("Accounting Information Systems", { aliases: ["accounting", "bais"], mappedPlanId: "accounting-information-systems" }),
    major("Economics", { aliases: ["beco"], mappedPlanId: "economics" }),
    major("Banking and Finance", { aliases: ["finance", "banking", "bfin"], mappedPlanId: "banking-and-finance" }),
    major("Hospitality and Tourism Management", { aliases: ["hospitality", "tourism", "bhtm"], mappedPlanId: "hospitality-and-tourism-management" }),
    major("Business Management", { aliases: ["business management", "business administration", "business", "bba", "bmgt"], mappedPlanId: "business-management" }),
    major("Management Information Systems", { aliases: ["mis", "information systems", "bmis"], mappedPlanId: "management-information-systems" }),
    major("Marketing", { aliases: ["bmkt"], mappedPlanId: "marketing" }),
    major("International Business Management", { aliases: ["international business", "imgt"], mappedPlanId: "international-business-management" }),
    major("Computer Engineering", { aliases: ["computer engineer", "ceng"], mappedPlanId: "computer-engineering" }),
    major("Communication Engineering", { aliases: ["communications engineering", "telecommunication engineering", "teng"], mappedPlanId: "communication-engineering" }),
    major("Electrical Engineering", { aliases: ["electrical engineer"], mappedPlanId: "electrical-engineering" }),
    major("Electronics Engineering", { aliases: ["electronic engineering"], mappedPlanId: "electronics-engineering" }),
    major("Electronics Engineering – Biomedical Engineering", { aliases: ["biomedical engineering"], mappedPlanId: "biomedical-engineering" }),
    major("Industrial Engineering", { aliases: ["ieng"], mappedPlanId: "industrial-engineering" }),
    major("Mechanical Engineering", { aliases: ["mechanical engineer", "meng"], mappedPlanId: "mechanical-engineering" }),
    major("Surveying Engineering", { aliases: ["surv"], mappedPlanId: "surveying-engineering" }),
    major("Chemistry", { mappedPlanId: "chemistry" }),
    major("Biochemistry", { mappedPlanId: "biochemistry" }),
    major("Biology", { mappedPlanId: "biology" }),
    major("Biomedical Science", { mappedPlanId: "biomedical-science" }),
    major("Food Science Technology", { aliases: ["food science"], mappedPlanId: "food-science-technology" }),
    major("Nutrition and Dietetics", { aliases: ["nutrition"], mappedPlanId: "nutrition-and-dietetics" }),
    major("Computer Science", { aliases: ["cs", "csci"], mappedPlanId: "computer-science" }),
    major("Information Technology", { aliases: ["it", "csit"], mappedPlanId: "information-technology" }),
    major("Mathematics", { aliases: ["math"], mappedPlanId: "mathematics" }),
    major("Physics", { mappedPlanId: "physics" }),
    major("Graphic Design", { mappedPlanId: "graphic-design" }),
    major("Interior Design", { mappedPlanId: "interior-design" }),
    major("Communication Arts – Advertising", { aliases: ["advertising"] }),
    major("Communication Arts – Journalism", { aliases: ["journalism"] }),
    major("Communication Arts – Radio and Television", { aliases: ["radio and television"] }),
    major("Communication Arts – Public Relations", { aliases: ["public relations"] }),
    major("Early Childhood Education", { mappedPlanId: "early-childhood-education" }),
    major("Teacher Education – Biology and Chemistry"),
    major("Teacher Education – Physics and Mathematics"),
    major("Teaching English as a Second Language", { aliases: ["education", "teaching english"] }),
    major("Translation and Interpretation", { aliases: ["translation"] }),
    major("Pharmacy"),
  ],
};

const MAJOR_PLAN_OVERRIDES = {
  liu: {
    "electronics-engineering-biomedical-engineering": {
      aliases: ["beng"],
      mappedPlanId: "biomedical-engineering",
    },
    "communication-arts-advertising": {
      aliases: ["advr"],
      mappedPlanId: "advertising",
    },
    "communication-arts-journalism": {
      aliases: ["jour"],
      mappedPlanId: "journalism",
    },
    "communication-arts-radio-and-television": {
      aliases: ["rtvf"],
      mappedPlanId: "radio-and-television",
    },
    "communication-arts-public-relations": {
      aliases: ["prel"],
      mappedPlanId: "public-relations",
    },
    "teacher-education-biology-and-chemistry": {
      aliases: ["tebc"],
      mappedPlanId: "teacher-education-biology-chemistry",
    },
    "teacher-education-physics-and-mathematics": {
      aliases: ["tepm"],
      mappedPlanId: "teacher-education-physics-mathematics",
    },
    "teaching-english-as-a-second-language": {
      aliases: ["tesl"],
      mappedPlanId: "teaching-english-as-a-second-language",
    },
    "translation-and-interpretation": {
      aliases: ["trns"],
      mappedPlanId: "translation-and-interpretation",
    },
    pharmacy: {
      aliases: ["phar"],
      mappedPlanId: "pharmacy",
    },
  },
};

for (const [universityId, majors] of Object.entries(OFFICIAL_MAJOR_REGISTRY)) {
  const source = UNIVERSITY_MAJOR_SOURCES[universityId] || "";
  majors.forEach((entry) => {
    const override = MAJOR_PLAN_OVERRIDES?.[universityId]?.[slugify(entry.title)] || null;
    if (!entry.source) entry.source = source;
    if (override?.aliases?.length) {
      entry.aliases = unique([...(entry.aliases || []), ...override.aliases]);
    }
    if (override?.mappedPlanId) {
      entry.mappedPlanId = override.mappedPlanId;
    }
  });
}

function getOfficialMajorRegistry(universityId = "") {
  return [...(OFFICIAL_MAJOR_REGISTRY[String(universityId).toLowerCase()] || [])];
}

function getOfficialMajorCoverageLists() {
  return Object.fromEntries(
    Object.entries(OFFICIAL_MAJOR_REGISTRY).map(([universityId, majors]) => [
      universityId,
      majors.map((entry) => entry.title),
    ]),
  );
}

function toMajorHint(entry = {}) {
  return {
    id: entry.id,
    label: entry.title,
    patterns: unique([entry.title, ...(entry.aliases || [])]),
    subjects: unique(entry.subjects || []),
    keywords: unique(entry.keywords || entry.title.split(/[\s/&-]+/g).filter((token) => token.length >= 4)),
    officialMajor: true,
    mappedPlanId: entry.mappedPlanId || null,
    source: entry.source || "",
  };
}

function getOfficialMajorHints(universityId = "") {
  return getOfficialMajorRegistry(universityId).map(toMajorHint);
}

module.exports = {
  OFFICIAL_MAJOR_REGISTRY,
  UNIVERSITY_MAJOR_SOURCES,
  getOfficialMajorCoverageLists,
  getOfficialMajorHints,
  getOfficialMajorRegistry,
};
