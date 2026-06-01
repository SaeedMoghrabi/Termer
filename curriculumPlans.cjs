const fs = require("fs");
const path = require("path");
const { getOfficialMajorCoverageLists, getOfficialMajorRegistry } = require("./majorRegistry.cjs");

const ORDINAL_WORDS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const AUB_CS_SOURCE = "https://www.aub.edu.lb/Registrar/catalogue2024-25/Documents/UG-FAS-2425.pdf";
const AUB_OSB_SOURCE = "https://www.aub.edu/Registrar/catalogue2025-26/ug/Documents/ug-osb.pdf";
const AUB_CIVIL_SOURCE = "https://www.aub.edu.lb/Registrar/catalogue2024-25/Pages/undergraduate-cee.aspx";
const AUB_CONSTRUCTION_SOURCE = "https://www.aub.edu.lb/Registrar/catalogue2024-25/Pages/undergraduate-cee.aspx";
const AUB_CHEM_ENG_SOURCE = "https://www.aub.edu.lb/Registrar/catalogue2024-25/Pages/undergraduate-ceae.aspx";
const AUB_ECE_SOURCE = "https://www.aub.edu.lb/Registrar/catalogue2024-25/Pages/undergraduate-ece.aspx";
const AUB_INDUSTRIAL_SOURCE = "https://www.aub.edu.lb/Registrar/catalogue2024-25/Pages/undergraduate-iem.aspx";
const AUB_MECHANICAL_SOURCE = "https://www.aub.edu.lb/Registrar/catalogue2024-25/Pages/undergraduate-mechanical.aspx";
const LAU_BS_SOURCE = "https://catalog.lau.edu.lb/2024-2025/undergraduate/programs/bs-business-management.php";
const LAU_CE_SOURCE = "https://catalog.lau.edu.lb/2024-2025/undergraduate/programs/be-computer.php";
const LAU_CS_SOURCE = "https://catalog.lau.edu.lb/2024-2025/undergraduate/programs/bs-computer-science.php";
const AUST_ACC_SOURCE = "https://api.aust.edu.lb/content/uploads/files/028~Sequence-of-Courses-ACC.pdf";
const AUST_FIN_SOURCE = "https://api.aust.edu.lb/content/uploads/files/Sequence-of-Courses-FIN.pdf";
const AUST_MGT_SOURCE = "https://api.aust.edu.lb/content/uploads/files/Sequence-of-Courses-MGT.pdf";
const AUST_MKT_SOURCE = "https://api.aust.edu.lb/content/uploads/files/Sequence-of-Courses-MKT.pdf";
const AUST_HPM_SOURCE = "https://api.aust.edu.lb/content/uploads/files/HPM_SequenceOfCourses.pdf";
const AUST_ECO_SOURCE = "https://api.aust.edu.lb/content/uploads/files/Sequence-of-Courses-ECO.pdf";
const AUST_CSI_SOURCE = "https://api.aust.edu.lb/content/uploads/files/CSI-by-semester.pdf";
const AUST_ICT_SOURCE = "https://api.aust.edu.lb/content/uploads/files/ICT-by-semester.pdf";
const AUST_GRAPHIC_DESIGN_SOURCE = "https://api.aust.edu.lb/content/uploads/files/Graphic-Design-by-semester.pdf";
const AUST_INTERIOR_DESIGN_SOURCE = "https://api.aust.edu.lb/content/uploads/files/396~Interior-Design-by-semester.pdf";
const BAU_CIVIL_SOURCE = "https://websitedev.bau.edu.lb/BAUUpload/BAU-Library/files/Engineering/civil-study-plan.pdf";
const BAU_CE_SOURCE = "https://websitedev.bau.edu.lb/Program/Engineering/Bachelor/Computer-Engineering";
const BAU_CS_SOURCE = "https://websitedev.bau.edu.lb/Program/Science/Bachelor/Computer-Science";
const BAU_ME_SOURCE = "https://websitedev.bau.edu.lb/Program/Engineering/Bachelor/Mechanical-Engineering";
const BAU_PHYS_SOURCE = "https://websitedev.bau.edu.lb/Program/Science/Bachelor/Physics-Applied-Computational-Physics-Track";
const NDU_ACCOUNTING_SOURCE = "https://www.ndu.edu.lb/academics/faculties/fbae/departments/department-of-accounting-and-finance/programs/bba-in-accounting/curriculum";
const NDU_FINANCE_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=12996&lang=1";
const NDU_BUSINESS_ADMIN_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13001&lang=1";
const NDU_MARKETING_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13004&lang=1";
const NDU_HOSPITALITY_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13023&lang=1";
const NDU_CIVIL_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13036&lang=1";
const NDU_CCE_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13040&lang=1";
const NDU_POLITICAL_SCIENCE_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13165&lang=1";
const NDU_CS_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13183&lang=1";
const NDU_MIS_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13187&lang=1";
const NDU_GRAPHIC_DESIGN_SOURCE = "https://www.ndu.edu.lb/Faculties/Curriculum?pageid=13401&lang=1";
const LIU_ADVR_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/ADVR-POS.pdf";
const LIU_BAIS_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BAIS-POS.pdf";
const LIU_BECO_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BECO-POS.pdf";
const LIU_BFIN_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BFIN-POS.pdf";
const LIU_BHTM_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BHTM-POS.pdf";
const LIU_BIOC_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BIOC-POS.pdf";
const LIU_BIOL_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BIOL-POS.pdf";
const LIU_BENG_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BENG-POS.pdf";
const LIU_BMED_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BMED-POS.pdf";
const LIU_BMGT_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BMGT-POS.pdf";
const LIU_BMIS_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BMIS-POS.pdf";
const LIU_BMKT_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/BMKT-POS.pdf";
const LIU_CHEM_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/CHEM-POS.pdf";
const LIU_CSCI_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/CSCI-POS.pdf";
const LIU_CENG_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/CENG-POS.pdf";
const LIU_CHED_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/CHED-POS.pdf";
const LIU_CSIT_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/CSIT-POS.pdf";
const LIU_EENG_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/EENG-POS.pdf";
const LIU_FDST_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/FDST-POS.pdf";
const LIU_GDES_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/GDES-POS.pdf";
const LIU_IDES_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/IDES-POS.pdf";
const LIU_IMGT_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/IMGT-POS.pdf";
const LIU_IENG_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/IENG-POS.pdf";
const LIU_JOUR_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/JOUR-POS.pdf";
const LIU_LENG_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/LENG-POS.pdf";
const LIU_MATH_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/MATH-POS.pdf";
const LIU_MENG_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/MENG-POS.pdf";
const LIU_NUTR_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/NUTR-POS.pdf";
const LIU_PHAR_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/PHAR-POS.pdf";
const LIU_PHYS_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/PHYS-POS.pdf";
const LIU_PREL_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/PREL-POS.pdf";
const LIU_RTVF_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/RTVF-POS.pdf";
const LIU_SURV_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/SURV-POS.pdf";
const LIU_TEBC_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/TEBC-POS.pdf";
const LIU_TEPM_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/TEPM-POS.pdf";
const LIU_TESL_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/TESL-POS.pdf";
const LIU_TENG_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/TENG-POS.pdf";
const LIU_TRNS_SOURCE = "https://liu.edu.lb/NewLIU2022/metaData/TRNS-POS.pdf";
const USJ_BUSINESS_ADMIN_SOURCE = "https://usj.edu.lb/fsedu/cursus.php?cursus=63&lang=2";
const USJ_COMPUTER_SCIENCE_SOURCE = "https://www.usj.edu.lb/formations/form.php?diplome=796";
const USJ_DATA_SCIENCE_SOURCE = "https://usj.edu.lb/fs/cursus.php?cursus=2973&lang=2";
const USJ_BANKING_STUDIES_SOURCE = "https://www.usj.edu.lb/formations/form.php?diplome=652";
const USJ_INSURANCE_SCIENCE_SOURCE = "https://www.usj.edu.lb/formations/form.php?diplome=212";
const USJ_SPEECH_THERAPY_SOURCE = "https://www.usj.edu.lb/formations/form.php?diplome=984";
const AUB_CS_CORE_CODES = ["CMPS 201", "CMPS 202", "CMPS 214", "CMPS 215", "CMPS 221", "CMPS 240", "CMPS 241", "CMPS 271"];

function buildAubParsedPlan({ id, labels, title, source, notes = [], parseOccurrence }) {
  return {
    universityId: "aub",
    id,
    labels,
    title,
    defaultStart: "fall",
    source,
    notes,
    sequences: { fall: [] },
    ...(parseOccurrence ? { parseOccurrence } : {}),
  };
}

function buildLiuParsedPlan({ id, labels, title, source, notes = [] }) {
  return {
    universityId: "liu",
    id,
    labels,
    title,
    defaultStart: "fall",
    source,
    notes,
    sequences: { fall: [] },
  };
}

function buildBauParsedPlan({ id, labels, title, source, notes = [] }) {
  return {
    universityId: "bau",
    id,
    labels,
    title,
    defaultStart: "fall",
    source,
    notes,
    sequences: { fall: [] },
  };
}

function buildAustParsedPlan({ id, labels, title, source, notes = [] }) {
  return {
    universityId: "aust",
    id,
    labels,
    title,
    defaultStart: "fall",
    source,
    notes,
    sequences: { fall: [] },
  };
}

function buildNduParsedPlan({ id, labels, title, source, notes = [] }) {
  return {
    universityId: "ndu",
    id,
    labels,
    title,
    defaultStart: "fall",
    source,
    notes,
    sequences: { fall: [] },
  };
}

function buildUsjParsedPlan({ id, labels, title, source, notes = [] }) {
  return {
    universityId: "usj",
    id,
    labels,
    title,
    defaultStart: "fall",
    source,
    notes,
    sequences: { fall: [] },
  };
}

const STATIC_CURRICULUM_PLANS = [
  {
    universityId: "aub",
    id: "computer-science",
    labels: ["computer science", "cs", "compsci", "comp sci", "cmps"],
    title: "BS Computer Science",
    defaultStart: "fall",
    source: AUB_CS_SOURCE,
    notes: [
      "AUB's 2024-25 FAS catalogue lists the sample BS CS plan by start term.",
      "Fall-start semester 3 is CMPS 214, CMPS 221, and CMPS 241.",
      "Spring-start semester 3 is CMPS 214, CMPS 221, and one CMPS elective.",
      "The plan does not replace advisor approval, placement, transfer credit, or catalog-year exceptions.",
    ],
    sequences: {
      fall: [
        {
          label: "First Year Fall",
          items: [
            { type: "course", code: "CMPS 201" },
            { type: "course", code: "CMPS 211", alternatives: ["MATH 211"] },
            { type: "course", code: "MATH 201" },
          ],
        },
        {
          label: "First Year Spring",
          items: [
            { type: "course", code: "CMPS 202" },
            { type: "course", code: "MATH 218", alternatives: ["MATH 219"] },
            { type: "course", code: "STAT 230", alternatives: ["STAT 233"] },
          ],
        },
        {
          label: "Second Year Fall",
          items: [
            { type: "course", code: "CMPS 214" },
            { type: "course", code: "CMPS 221" },
            { type: "course", code: "CMPS 241" },
          ],
        },
        {
          label: "Second Year Spring",
          items: [
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
            { type: "course", code: "CMPS 271" },
          ],
        },
        {
          label: "Third Year Fall",
          items: [
            { type: "course", code: "CMPS 215" },
            { type: "course", code: "CMPS 240" },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
          ],
        },
        {
          label: "Third Year Spring",
          items: [
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
          ],
        },
      ],
      spring: [
        {
          label: "First Year Spring",
          items: [
            { type: "course", code: "CMPS 201" },
            { type: "course", code: "CMPS 211", alternatives: ["MATH 211"] },
            { type: "course", code: "MATH 201" },
          ],
        },
        {
          label: "First Year Fall",
          items: [
            { type: "course", code: "CMPS 202" },
            { type: "course", code: "MATH 218", alternatives: ["MATH 219"] },
            { type: "course", code: "STAT 230", alternatives: ["STAT 233"] },
          ],
        },
        {
          label: "Second Year Spring",
          items: [
            { type: "course", code: "CMPS 214" },
            { type: "course", code: "CMPS 221" },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
          ],
        },
        {
          label: "Second Year Fall",
          items: [
            { type: "course", code: "CMPS 241" },
            { type: "course", code: "CMPS 271" },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
          ],
        },
        {
          label: "Third Year Spring",
          items: [
            { type: "course", code: "CMPS 215" },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
          ],
        },
        {
          label: "Third Year Fall",
          items: [
            { type: "course", code: "CMPS 240" },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
            { type: "elective", code: "CMPS elective", department: "CMPS", minNumber: 214, excludeCodes: AUB_CS_CORE_CODES },
          ],
        },
      ],
    },
  },
  {
    universityId: "aub",
    id: "business-administration",
    labels: [
      "business",
      "business administration",
      "bba",
      "management",
      "marketing",
      "finance",
      "accounting",
      "entrepreneurship",
      "operations management",
      "information systems",
    ],
    title: "BBA",
    defaultStart: "fall",
    source: AUB_OSB_SOURCE,
    notes: [
      "AUB OSB 2025-26 BBA proposed plans share the same first two terms across the listed concentrations.",
      "Term 2 is FINA 210, ENGL 204, MATH 204, DCSN 200, MNGT 215, and BUSS 239.",
      "Concentration-specific divergence starts later, especially from terms 3-6.",
    ],
    sequences: {
      fall: [
        {
          label: "Year II Term 1",
          items: [
            { type: "course", code: "ACCT 210L", alternatives: ["ACCT 210"] },
            { type: "course", code: "ENGL 203" },
            { type: "course", code: "MATH 203" },
            { type: "course", code: "ECON 211", alternatives: ["ECON 212"] },
            { type: "course", code: "CMPS 208" },
          ],
        },
        {
          label: "Year II Term 2",
          items: [
            { type: "course", code: "FINA 210" },
            { type: "course", code: "ENGL 204" },
            { type: "course", code: "MATH 204" },
            { type: "course", code: "DCSN 200" },
            { type: "course", code: "MNGT 215" },
            { type: "course", code: "BUSS 239", optional: true },
          ],
        },
        {
          label: "Year III Term 3",
          items: [
            { type: "course", code: "ECON 212", alternatives: ["ECON 211"] },
            { type: "course", code: "BUSS 200" },
            { type: "requirement", code: "ARAB", department: "ARAB" },
            { type: "course", code: "MKTG 210" },
            { type: "course", code: "INFO 200" },
          ],
        },
        {
          label: "Year III Term 4",
          items: [
            { type: "course", code: "ACCT 215" },
            { type: "course", code: "BUSS 215" },
            { type: "requirement", code: "Community Engaged Learning", attribute: "Community Engaged Learning" },
            { type: "requirement", code: "Cultures and Histories (History of Ideas)", attribute: "History of Ideas" },
            { type: "requirement", code: "Concentration course", departments: ["MNGT", "MKTG", "FINA", "ACCT", "ENTM", "DCSN", "INFO"] },
          ],
        },
        {
          label: "Year IV Term 5",
          items: [
            { type: "requirement", code: "Concentration course", departments: ["MNGT", "MKTG", "FINA", "ACCT", "ENTM", "DCSN", "INFO"] },
            { type: "requirement", code: "Concentration course", departments: ["MNGT", "MKTG", "FINA", "ACCT", "ENTM", "DCSN", "INFO"] },
            { type: "requirement", code: "Free Business Elective", departments: ["MNGT", "MKTG", "FINA", "ACCT", "ENTM", "DCSN", "INFO", "BUSS"] },
            { type: "requirement", code: "Cultures and Histories and Social Inequalities", attribute: "Social Inequalities" },
            { type: "course", code: "BUSS 211" },
          ],
        },
        {
          label: "Year IV Term 6",
          items: [
            { type: "requirement", code: "Concentration course", departments: ["MNGT", "MKTG", "FINA", "ACCT", "ENTM", "DCSN", "INFO"] },
            { type: "requirement", code: "Concentration course", departments: ["MNGT", "MKTG", "FINA", "ACCT", "ENTM", "DCSN", "INFO"] },
            { type: "course", code: "BUSS 249" },
            { type: "requirement", code: "Understanding the World", attribute: "Understanding the World" },
            { type: "requirement", code: "Cultures and Histories", attribute: "Cultures and Histories" },
          ],
        },
      ],
    },
  },
  {
    universityId: "lau",
    id: "business-studies",
    labels: [
      "business studies",
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
    title: "BS Business Studies",
    defaultStart: "fall",
    source: LAU_BS_SOURCE,
    notes: [
      "LAU's official 2024-25 Management emphasis page publishes a full recommended study plan semester by semester.",
      "This mapped baseline is strongest for generic Business Studies and Management prompts.",
      "Years 1 and 2 are the common business core; Year 3 emphasis courses can vary across Accounting, Finance, Marketing, and related business emphases.",
    ],
    sequences: {
      fall: [
        {
          label: "Year One Fall",
          items: [
            { type: "course", code: "ACC 203", alternatives: ["ACC203"] },
            { type: "course", code: "MGT 201", alternatives: ["MGT201"] },
            { type: "course", code: "ECO 201", alternatives: ["ECO201"] },
            { type: "requirement", code: "LAS Core" },
            { type: "requirement", code: "LAS Elective" },
          ],
        },
        {
          label: "Year One Spring",
          items: [
            { type: "course", code: "ACC 204", alternatives: ["ACC204"] },
            { type: "course", code: "MKT 201", alternatives: ["MKT201"] },
            { type: "course", code: "ECO 202", alternatives: ["ECO202"] },
            { type: "course", code: "BUS 299", alternatives: ["BUS299"], optional: true },
            { type: "requirement", code: "LAS Core" },
            { type: "requirement", code: "LAS Elective" },
            { type: "requirement", code: "Free Elective" },
          ],
        },
        {
          label: "Year Two Fall",
          items: [
            { type: "course", code: "FIN 301", alternatives: ["FIN301"] },
            { type: "course", code: "ITM 211", alternatives: ["ITM211"] },
            { type: "course", code: "MGT 301", alternatives: ["MGT301"] },
            { type: "requirement", code: "LAS Core" },
            { type: "requirement", code: "LAS Elective" },
          ],
        },
        {
          label: "Year Two Spring",
          items: [
            { type: "course", code: "BUS 213", alternatives: ["BUS213"] },
            { type: "course", code: "QBA 201", alternatives: ["QBA201"] },
            { type: "course", code: "MGT 411", alternatives: ["MGT411"] },
            { type: "requirement", code: "LAS Core" },
            { type: "requirement", code: "LAS Elective" },
          ],
        },
        {
          label: "Year Three Fall",
          items: [
            { type: "course", code: "ITM 302", alternatives: ["ITM302"] },
            { type: "course", code: "OPM 301", alternatives: ["OPM301"] },
            { type: "requirement", code: "Emphasis Elective I" },
            { type: "requirement", code: "Emphasis Elective II" },
            { type: "requirement", code: "LAS Elective" },
          ],
        },
        {
          label: "Year Three Spring",
          items: [
            { type: "course", code: "MGT 420", alternatives: ["MGT420"] },
            { type: "course", code: "MGT 441", alternatives: ["MGT441"] },
            { type: "requirement", code: "Emphasis Elective III" },
            { type: "requirement", code: "LAS Core" },
            { type: "requirement", code: "LAS Core" },
            { type: "requirement", code: "LAS Core" },
            { type: "requirement", code: "LAS Elective" },
          ],
        },
      ],
    },
  },
  {
    universityId: "lau",
    id: "computer-engineering",
    labels: ["computer engineering", "computer engineer", "coe"],
    title: "BE Computer Engineering",
    defaultStart: "fall",
    source: LAU_CE_SOURCE,
    notes: [
      "LAU's official 2024-25 Computer Engineering page publishes a four-year recommended study plan with summer terms.",
      "The plan includes three required summers and separates COE technical electives from broader ECE electives in the final year.",
    ],
    sequences: {
      fall: [
        {
          label: "Year One Fall",
          items: [
            { type: "course", code: "ENG 202", alternatives: ["ENG202"] },
            { type: "course", code: "PHY 201", alternatives: ["PHY201"] },
            { type: "course", code: "MTH 201", alternatives: ["MTH201"] },
            { type: "course", code: "MTH 207", alternatives: ["MTH207"] },
            { type: "course", code: "GNE 212", alternatives: ["GNE212"] },
            { type: "course", code: "COE 201", alternatives: ["COE201"] },
          ],
        },
        {
          label: "Year One Spring",
          items: [
            { type: "course", code: "COE 211", alternatives: ["COE211"] },
            { type: "course", code: "MTH 206", alternatives: ["MTH206"] },
            { type: "course", code: "MTH 304", alternatives: ["MTH304"] },
            { type: "requirement", code: "LAS Elective" },
            { type: "requirement", code: "LAS Elective" },
          ],
        },
        {
          label: "Year One Summer",
          items: [
            { type: "course", code: "COM 203", alternatives: ["COM203"] },
            { type: "requirement", code: "LAS Elective" },
            { type: "requirement", code: "Free Elective" },
          ],
        },
        {
          label: "Year Two Fall",
          items: [
            { type: "course", code: "ELE 300", alternatives: ["ELE300"] },
            { type: "course", code: "ELE 303", alternatives: ["ELE303"] },
            { type: "course", code: "COE 312", alternatives: ["COE312"] },
            { type: "course", code: "COE 321", alternatives: ["COE321"] },
            { type: "course", code: "GNE 331", alternatives: ["GNE331"] },
            { type: "requirement", code: "LAS Elective" },
          ],
        },
        {
          label: "Year Two Spring",
          items: [
            { type: "course", code: "ELE 401", alternatives: ["ELE401"] },
            { type: "course", code: "ELE 402", alternatives: ["ELE402"] },
            { type: "course", code: "ELE 430", alternatives: ["ELE430"] },
            { type: "course", code: "COE 313", alternatives: ["COE313"] },
            { type: "course", code: "COE 322", alternatives: ["COE322"] },
            { type: "course", code: "COE 323", alternatives: ["COE323"] },
            { type: "course", code: "COE 415", alternatives: ["COE415"] },
          ],
        },
        {
          label: "Year Two Summer",
          items: [
            { type: "course", code: "GNE 301", alternatives: ["GNE301"] },
            { type: "course", code: "GNE 303", alternatives: ["GNE303"] },
            { type: "course", code: "INE 320", alternatives: ["INE320"] },
          ],
        },
        {
          label: "Year Three Fall",
          items: [
            { type: "course", code: "COE 418", alternatives: ["COE418"] },
            { type: "course", code: "ELE 537", alternatives: ["ELE537"] },
            { type: "course", code: "COE 324", alternatives: ["COE324"] },
            { type: "course", code: "COE 423", alternatives: ["COE423"] },
            { type: "course", code: "COE 493", alternatives: ["COE493"] },
            { type: "requirement", code: "COE Elective I" },
          ],
        },
        {
          label: "Year Three Spring",
          items: [
            { type: "course", code: "COE 424", alternatives: ["COE424"] },
            { type: "course", code: "ELE 540", alternatives: ["ELE540"] },
            { type: "requirement", code: "COE Elective II" },
            { type: "requirement", code: "COE Elective III" },
            { type: "requirement", code: "COE Elective IV" },
            { type: "course", code: "COE 416", alternatives: ["COE416"] },
          ],
        },
        {
          label: "Year Three Summer",
          items: [
            { type: "course", code: "COE 498", alternatives: ["COE498"] },
          ],
        },
        {
          label: "Year Four Fall",
          items: [
            { type: "course", code: "ELE 442", alternatives: ["ELE442"] },
            { type: "course", code: "ELE 443", alternatives: ["ELE443"] },
            { type: "course", code: "COE 414", alternatives: ["COE414"] },
            { type: "course", code: "COE 425", alternatives: ["COE425"] },
            { type: "course", code: "COE 521", alternatives: ["COE521"] },
            { type: "course", code: "COE 593", alternatives: ["COE593"] },
            { type: "course", code: "COE 595", alternatives: ["COE595"] },
          ],
        },
        {
          label: "Year Four Spring",
          items: [
            { type: "course", code: "COE 431", alternatives: ["COE431"] },
            { type: "course", code: "COE 596", alternatives: ["COE596"] },
            { type: "requirement", code: "GNE Signature Course" },
            { type: "requirement", code: "ECE Elective I" },
            { type: "requirement", code: "ECE Elective II" },
          ],
        },
      ],
    },
  },
  {
    universityId: "lau",
    id: "computer-science",
    labels: ["computer science", "cs", "csc"],
    title: "BS Computer Science",
    defaultStart: "fall",
    source: LAU_CS_SOURCE,
    notes: [
      "LAU's official 2024-25 Computer Science page publishes a three-year recommended study plan.",
      "The recommended plan already reflects the newer CSC243/245/310/490 curriculum rather than the older CSC230/231 sequence.",
    ],
    sequences: {
      fall: [
        {
          label: "Year One Fall",
          items: [
            { type: "course", code: "CSC 243", alternatives: ["CSC243"] },
            { type: "course", code: "CSC 243B", alternatives: ["CSC243B"] },
            { type: "course", code: "ENG 202", alternatives: ["ENG202"] },
            { type: "course", code: "MTH 207", alternatives: ["MTH207"] },
            { type: "course", code: "LAS 205", alternatives: ["LAS205"] },
            { type: "course", code: "MTH 201", alternatives: ["MTH201"] },
          ],
        },
        {
          label: "Year One Spring",
          items: [
            { type: "course", code: "CSC 245", alternatives: ["CSC245"] },
            { type: "course", code: "CSC 245B", alternatives: ["CSC245B"] },
            { type: "course", code: "CSC 320", alternatives: ["CSC320"] },
            { type: "course", code: "CSC 322", alternatives: ["CSC322"] },
            { type: "course", code: "COM 203", alternatives: ["COM203"] },
            { type: "requirement", code: "LAS Change Makers I" },
          ],
        },
        {
          label: "Year Two Fall",
          items: [
            { type: "course", code: "CSC 310", alternatives: ["CSC310"] },
            { type: "course", code: "CSC 310B", alternatives: ["CSC310B"] },
            { type: "course", code: "CSC 375", alternatives: ["CSC375"] },
            { type: "course", code: "CSC 326", alternatives: ["CSC326"] },
            { type: "requirement", code: "LAS Change Makers II" },
            { type: "course", code: "LAS 204", alternatives: ["LAS204"] },
          ],
        },
        {
          label: "Year Two Spring",
          items: [
            { type: "course", code: "MTH 305", alternatives: ["MTH305"] },
            { type: "course", code: "CSC 490", alternatives: ["CSC490"] },
            { type: "course", code: "MTH 301", alternatives: ["MTH301"] },
            { type: "requirement", code: "CSC Major Track Elective I" },
            { type: "requirement", code: "Natural Sciences Requirement" },
            { type: "course", code: "CSC 491", alternatives: ["CSC491"] },
          ],
        },
        {
          label: "Year Three Fall",
          items: [
            { type: "course", code: "CSC 599", alternatives: ["CSC599", "CSC598"] },
            { type: "course", code: "CSC 447", alternatives: ["CSC447"] },
            { type: "course", code: "CSC 380", alternatives: ["CSC380"] },
            { type: "requirement", code: "CSC Major Track Elective II" },
            { type: "requirement", code: "CSC Minor Track I" },
          ],
        },
        {
          label: "Year Three Spring",
          items: [
            { type: "course", code: "CSC 430", alternatives: ["CSC430"] },
            { type: "requirement", code: "LAS Elective (Arts/Humanities/Change Makers)" },
            { type: "requirement", code: "CSC Minor Track II" },
            { type: "requirement", code: "MTH 3XX Mathematics Free Elective" },
            { type: "requirement", code: "LAS Change Makers III" },
          ],
        },
      ],
    },
  },
  buildAubParsedPlan({
    id: "civil-engineering",
    labels: ["civil engineering", "civil engineer", "ce"],
    title: "BE Civil Engineering",
    source: AUB_CIVIL_SOURCE,
    parseOccurrence: 1,
    notes: [
      "AUB's 2024-25 Civil and Environmental Engineering catalogue page publishes the proposed term-by-term BE Civil Engineering schedule.",
    ],
  }),
  buildAubParsedPlan({
    id: "construction-engineering",
    labels: ["construction engineering", "construction engineer", "conse"],
    title: "BS Construction Engineering",
    source: AUB_CONSTRUCTION_SOURCE,
    parseOccurrence: 2,
    notes: [
      "AUB's 2024-25 Civil and Environmental Engineering catalogue page publishes the proposed term-by-term BS Construction Engineering schedule.",
    ],
  }),
  buildAubParsedPlan({
    id: "chemical-engineering",
    labels: ["chemical engineering", "chemical engineer", "chem eng", "chen"],
    title: "BE Chemical Engineering",
    source: AUB_CHEM_ENG_SOURCE,
    notes: [
      "AUB's 2024-25 Chemical Engineering catalogue page publishes the proposed BE Chemical Engineering curriculum plan.",
      "The department also publishes a BS Chemical Engineering sequence; this mapping follows the BE plan for the general Chemical Engineering major.",
    ],
  }),
  buildAubParsedPlan({
    id: "computer-and-communications-engineering",
    labels: ["computer and communications engineering", "cce", "computer communication engineering"],
    title: "BE Computer and Communications Engineering",
    source: AUB_ECE_SOURCE,
    parseOccurrence: 1,
    notes: [
      "AUB's 2024-25 ECE catalogue page publishes a dedicated proposed schedule block for the BE Computer and Communications Engineering program.",
    ],
  }),
  buildAubParsedPlan({
    id: "computer-science-and-engineering",
    labels: ["computer science and engineering", "cse"],
    title: "BE Computer Science and Engineering",
    source: AUB_ECE_SOURCE,
    parseOccurrence: 2,
    notes: [
      "AUB's 2024-25 ECE catalogue page publishes a dedicated proposed schedule block for the BE Computer Science and Engineering program.",
    ],
  }),
  buildAubParsedPlan({
    id: "electrical-and-computer-engineering",
    labels: ["electrical and computer engineering", "eece", "ece"],
    title: "BE Electrical and Computer Engineering",
    source: AUB_ECE_SOURCE,
    parseOccurrence: 3,
    notes: [
      "AUB's 2024-25 ECE catalogue page publishes a dedicated proposed schedule block for the BE Electrical and Computer Engineering program.",
    ],
  }),
  buildAubParsedPlan({
    id: "industrial-engineering",
    labels: ["industrial engineering", "industrial engineer", "ie"],
    title: "BE Industrial Engineering",
    source: AUB_INDUSTRIAL_SOURCE,
    notes: [
      "AUB's 2024-25 IEM catalogue page publishes the proposed term-by-term BE Industrial Engineering schedule.",
    ],
  }),
  buildAubParsedPlan({
    id: "mechanical-engineering",
    labels: ["mechanical engineering", "mechanical engineer", "mech", "me"],
    title: "BE Mechanical Engineering",
    source: AUB_MECHANICAL_SOURCE,
    notes: [
      "AUB's 2024-25 Mechanical Engineering catalogue page publishes the proposed term-by-term BE Mechanical Engineering schedule.",
    ],
  }),
  {
    universityId: "bau",
    id: "civil-engineering",
    labels: ["civil engineering", "civil engineer"],
    title: "BE Civil Engineering",
    defaultStart: "fall",
    source: BAU_CIVIL_SOURCE,
    notes: [
      "BAU's Spring 2024 civil engineering program page and study-plan flowchart publish the semester-by-semester CE sequence.",
      "The first semester is CHEM241, CVLE210, ENGR002, MATH281, MCHE201, PHYS282, and BLAW001.",
      "The second semester is COMP208, CVLE208, CVLE211, CVLE260, CVLE270, MATH282, and PHYS281.",
      "Summer university requirements like ARAB001 and ENGL001 are separate from the main eight-semester civil sequence.",
    ],
    sequences: {
      fall: [
        {
          label: "First Semester",
          items: [
            { type: "course", code: "CHEM 241", alternatives: ["CHEM241"] },
            { type: "course", code: "CVLE 210", alternatives: ["CVLE210"] },
            { type: "course", code: "ENGR 002", alternatives: ["ENGR002"] },
            { type: "course", code: "MATH 281", alternatives: ["MATH281"] },
            { type: "course", code: "MCHE 201", alternatives: ["MCHE201"] },
            { type: "course", code: "PHYS 282", alternatives: ["PHYS282"] },
            { type: "course", code: "BLAW 001", alternatives: ["BLAW001"] },
          ],
        },
        {
          label: "Second Semester",
          items: [
            { type: "course", code: "COMP 208", alternatives: ["COMP208"] },
            { type: "course", code: "CVLE 208", alternatives: ["CVLE208", "BIOLxxx/CVLE208"] },
            { type: "course", code: "CVLE 211", alternatives: ["CVLE211"] },
            { type: "course", code: "CVLE 260", alternatives: ["CVLE260"] },
            { type: "course", code: "CVLE 270", alternatives: ["CVLE270"] },
            { type: "course", code: "MATH 282", alternatives: ["MATH282"] },
            { type: "course", code: "PHYS 281", alternatives: ["PHYS281"] },
          ],
        },
        {
          label: "Third Semester",
          items: [
            { type: "course", code: "CVLE 213", alternatives: ["CVLE213"] },
            { type: "course", code: "CVLE 231", alternatives: ["CVLE231"] },
            { type: "course", code: "CVLE 261", alternatives: ["CVLE261"] },
            { type: "course", code: "CVLE 341", alternatives: ["CVLE341"] },
            { type: "course", code: "ENGL 211", alternatives: ["ENGL211"] },
            { type: "course", code: "MATH 283", alternatives: ["MATH283"] },
            { type: "course", code: "MATH 381", alternatives: ["MATH381"] },
          ],
        },
        {
          label: "Fourth Semester",
          items: [
            { type: "course", code: "CVLE 214", alternatives: ["CVLE214"] },
            { type: "course", code: "CVLE 222", alternatives: ["CVLE222"] },
            { type: "course", code: "CVLE 342", alternatives: ["CVLE342"] },
            { type: "course", code: "ENGL 300", alternatives: ["ENGL300"] },
            { type: "course", code: "INME 221", alternatives: ["INME221"] },
            { type: "course", code: "MATH 284", alternatives: ["MATH284"] },
          ],
        },
        {
          label: "Fifth Semester",
          items: [
            { type: "course", code: "CVLE 323", alternatives: ["CVLE323"] },
            { type: "course", code: "CVLE 325", alternatives: ["CVLE325"] },
            { type: "course", code: "CVLE 333", alternatives: ["CVLE333"] },
            { type: "course", code: "CVLE 425", alternatives: ["CVLE425"] },
            { type: "course", code: "CVLE 441", alternatives: ["CVLE441"] },
            { type: "course", code: "CVLE 463", alternatives: ["CVLE463"] },
          ],
        },
        {
          label: "Sixth Semester",
          items: [
            { type: "course", code: "CVLE 324", alternatives: ["CVLE324"] },
            { type: "course", code: "CVLE 354", alternatives: ["CVLE354"] },
            { type: "course", code: "CVLE 371", alternatives: ["CVLE371"] },
            { type: "course", code: "CVLE 426", alternatives: ["CVLE426"] },
            { type: "course", code: "CVLE 464", alternatives: ["CVLE464"] },
            { type: "course", code: "CVLE 466", alternatives: ["CVLE466"] },
            { type: "course", code: "CVLE 500", alternatives: ["CVLE500"] },
          ],
        },
        {
          label: "Seventh Semester",
          items: [
            { type: "course", code: "CVLE 427", alternatives: ["CVLE427"] },
            { type: "course", code: "CVLE 453", alternatives: ["CVLE453"] },
            { type: "course", code: "CVLE 467", alternatives: ["CVLE467"] },
            { type: "course", code: "CVLE 501", alternatives: ["CVLE501"] },
            { type: "elective", code: "Technical elective", department: "CVLE", minNumber: 500, excludeCodes: ["CVLE 501", "CVLE 502"] },
            { type: "course", code: "ENGR 001", alternatives: ["ENGR001"] },
          ],
        },
        {
          label: "Eighth Semester",
          items: [
            { type: "course", code: "CVLE 432", alternatives: ["CVLE432"] },
            { type: "course", code: "CVLE 502", alternatives: ["CVLE502"] },
            { type: "elective", code: "Technical elective", department: "CVLE", minNumber: 500, excludeCodes: ["CVLE 501", "CVLE 502"] },
            { type: "elective", code: "Technical elective", department: "CVLE", minNumber: 500, excludeCodes: ["CVLE 501", "CVLE 502"] },
            { type: "elective", code: "Technical elective", department: "CVLE", minNumber: 500, excludeCodes: ["CVLE 501", "CVLE 502"] },
          ],
        },
      ],
    },
  },
  {
    universityId: "bau",
    id: "mechanical-engineering",
    labels: ["mechanical engineering", "mechanical engineer"],
    title: "BE Mechanical Engineering",
    defaultStart: "fall",
    source: BAU_ME_SOURCE,
    notes: [
      "BAU's official Mechanical Engineering page publishes the full semester-by-semester study plan directly on the program page.",
      "The program has required summer terms: Summer I, Summer II, and Summer III.",
      "Semester 1 is CHEM241, MATH281, MCHE201, MCHE213, PHYS282, and BLAW001.",
    ],
    sequences: {
      fall: [
        {
          label: "First Semester",
          items: [
            { type: "course", code: "CHEM 241", alternatives: ["CHEM241"] },
            { type: "course", code: "MATH 281", alternatives: ["MATH281"] },
            { type: "course", code: "MCHE 201", alternatives: ["MCHE201"] },
            { type: "course", code: "MCHE 213", alternatives: ["MCHE213"] },
            { type: "course", code: "PHYS 282", alternatives: ["PHYS282"] },
            { type: "course", code: "BLAW 001", alternatives: ["BLAW001"] },
          ],
        },
        {
          label: "Second Semester",
          items: [
            { type: "course", code: "COMP 208", alternatives: ["COMP208"] },
            { type: "course", code: "CVLE 210", alternatives: ["CVLE210"] },
            { type: "course", code: "INME 211", alternatives: ["INME211"] },
            { type: "course", code: "MATH 282", alternatives: ["MATH282"] },
            { type: "course", code: "MCHE 216", alternatives: ["MCHE216"] },
            { type: "course", code: "PHYS 281", alternatives: ["PHYS281"] },
          ],
        },
        {
          label: "Summer I",
          items: [
            { type: "course", code: "ARAB 001", alternatives: ["ARAB001"] },
            { type: "course", code: "ENGL 001", alternatives: ["ENGL001"] },
            { type: "requirement", code: "General Electives", credits: 4 },
          ],
        },
        {
          label: "Third Semester",
          items: [
            { type: "course", code: "MATH 283", alternatives: ["MATH283"] },
            { type: "course", code: "MCHE 311", alternatives: ["MCHE311"] },
            { type: "course", code: "MCHE 317", alternatives: ["MCHE317"] },
            { type: "course", code: "MCHE 321", alternatives: ["MCHE321"] },
            { type: "course", code: "MCHE 331", alternatives: ["MCHE331"] },
            { type: "course", code: "POWE 211", alternatives: ["POWE211"] },
          ],
        },
        {
          label: "Fourth Semester",
          items: [
            { type: "course", code: "MATH 284", alternatives: ["MATH284"] },
            { type: "course", code: "MATH 381", alternatives: ["MATH381"] },
            { type: "course", code: "MCHE 214", alternatives: ["MCHE214"] },
            { type: "course", code: "MCHE 214L", alternatives: ["MCHE214L"] },
            { type: "course", code: "MCHE 312", alternatives: ["MCHE312"] },
            { type: "course", code: "MCHE 322", alternatives: ["MCHE322"] },
            { type: "course", code: "MCHE 332", alternatives: ["MCHE332"] },
          ],
        },
        {
          label: "Summer II",
          items: [
            { type: "course", code: "ENGL 211", alternatives: ["ENGL211"] },
            { type: "course", code: "MGMT 002", alternatives: ["MGMT002"] },
            { type: "requirement", code: "General Electives", credits: 4 },
          ],
        },
        {
          label: "Fifth Semester",
          items: [
            { type: "course", code: "CHEM 405", alternatives: ["CHEM405"] },
            { type: "course", code: "ENGL 300", alternatives: ["ENGL300"] },
            { type: "course", code: "INME 221", alternatives: ["INME221"] },
            { type: "course", code: "MCHE 315", alternatives: ["MCHE315"] },
            { type: "course", code: "MCHE 315L", alternatives: ["MCHE315L"] },
            { type: "course", code: "MCHE 411", alternatives: ["MCHE411"] },
            { type: "course", code: "MCHE 421", alternatives: ["MCHE421"] },
            { type: "course", code: "MCHE 429", alternatives: ["MCHE429"] },
          ],
        },
        {
          label: "Sixth Semester",
          items: [
            { type: "course", code: "MCHE 410", alternatives: ["MCHE410"] },
            { type: "course", code: "MCHE 416", alternatives: ["MCHE416"] },
            { type: "course", code: "MCHE 416L", alternatives: ["MCHE416L"] },
            { type: "course", code: "MCHE 418", alternatives: ["MCHE418"] },
            { type: "course", code: "MCHE 422", alternatives: ["MCHE422"] },
            { type: "elective", code: "MCHExxx Technical Elective", department: "MCHE", minNumber: 500, excludeCodes: ["MCHE 499", "MCHE 500", "MCHE 501", "MCHE 502"] },
            { type: "course", code: "POWE 335", alternatives: ["POWE335"] },
          ],
        },
        {
          label: "Summer III",
          items: [
            { type: "course", code: "MCHE 499", alternatives: ["MCHE499"] },
          ],
        },
        {
          label: "Seventh Semester",
          items: [
            { type: "course", code: "MCHE 500", alternatives: ["MCHE500"] },
            { type: "course", code: "MCHE 501", alternatives: ["MCHE501"] },
            { type: "course", code: "MCHE 515", alternatives: ["MCHE515"] },
            { type: "course", code: "MCHE 515L", alternatives: ["MCHE515L"] },
            { type: "course", code: "MCHE 521", alternatives: ["MCHE521"] },
            { type: "course", code: "MCHE 531", alternatives: ["MCHE531"] },
            { type: "elective", code: "MCHExxx Technical Elective", department: "MCHE", minNumber: 500, excludeCodes: ["MCHE 499", "MCHE 500", "MCHE 501", "MCHE 502"] },
          ],
        },
        {
          label: "Eighth Semester",
          items: [
            { type: "course", code: "ENGR 001", alternatives: ["ENGR001"] },
            { type: "course", code: "MCHE 502", alternatives: ["MCHE502"] },
            { type: "course", code: "MCHE 540", alternatives: ["MCHE540"] },
            { type: "elective", code: "MCHExxx Technical Elective", department: "MCHE", minNumber: 500, excludeCodes: ["MCHE 499", "MCHE 500", "MCHE 501", "MCHE 502"] },
            { type: "elective", code: "MCHExxx Technical Elective", department: "MCHE", minNumber: 500, excludeCodes: ["MCHE 499", "MCHE 500", "MCHE 501", "MCHE 502"] },
          ],
        },
      ],
    },
  },
  {
    universityId: "bau",
    id: "computer-engineering",
    labels: ["computer engineering", "computer engineer"],
    title: "BE Computer Engineering",
    defaultStart: "fall",
    source: BAU_CE_SOURCE,
    notes: [
      "BAU's official Computer Engineering page publishes the full semester-by-semester study plan directly on the program page.",
      "The program includes Summer I, Summer II, and Summer III requirements.",
      "Semester 1 is ENGR002, MATH281, MATH282, MCHE213, PHYS281, and ARAB001.",
    ],
    sequences: {
      fall: [
        {
          label: "First Semester",
          items: [
            { type: "course", code: "ENGR 002", alternatives: ["ENGR002"] },
            { type: "course", code: "MATH 281", alternatives: ["MATH281"] },
            { type: "course", code: "MATH 282", alternatives: ["MATH282"] },
            { type: "course", code: "MCHE 213", alternatives: ["MCHE213"] },
            { type: "course", code: "PHYS 281", alternatives: ["PHYS281"] },
            { type: "course", code: "ARAB 001", alternatives: ["ARAB001"] },
          ],
        },
        {
          label: "Second Semester",
          items: [
            { type: "course", code: "COMP 208", alternatives: ["COMP208"] },
            { type: "course", code: "COMP 225", alternatives: ["COMP225"] },
            { type: "course", code: "MATH 283", alternatives: ["MATH283"] },
            { type: "course", code: "PHYS 282", alternatives: ["PHYS282"] },
            { type: "course", code: "POWE 212", alternatives: ["POWE212"] },
            { type: "course", code: "ENGL 001", alternatives: ["ENGL001"] },
          ],
        },
        {
          label: "Summer I",
          items: [
            { type: "course", code: "CHEM 241", alternatives: ["CHEM241"] },
            { type: "course", code: "ENGL 211", alternatives: ["ENGL211"] },
            { type: "course", code: "BLAW 001", alternatives: ["BLAW001"] },
            { type: "requirement", code: "General Electives", credits: 3 },
          ],
        },
        {
          label: "Third Semester",
          items: [
            { type: "course", code: "COME 223", alternatives: ["COME223"] },
            { type: "course", code: "COMP 210", alternatives: ["COMP210"] },
            { type: "course", code: "COMP 215", alternatives: ["COMP215"] },
            { type: "course", code: "COMP 226", alternatives: ["COMP226"] },
            { type: "course", code: "COMP 231", alternatives: ["COMP231"] },
            { type: "course", code: "ENGL 300", alternatives: ["ENGL300"] },
          ],
        },
        {
          label: "Fourth Semester",
          items: [
            { type: "course", code: "COMP 232", alternatives: ["COMP232"] },
            { type: "course", code: "COMP 311", alternatives: ["COMP311"] },
            { type: "course", code: "COMP 325", alternatives: ["COMP325"] },
            { type: "course", code: "INME 221", alternatives: ["INME221"] },
            { type: "course", code: "MATH 284", alternatives: ["MATH284"] },
            { type: "course", code: "MATH 381", alternatives: ["MATH381"] },
          ],
        },
        {
          label: "Summer II",
          items: [
            { type: "course", code: "CHEM 405", alternatives: ["CHEM405"] },
            { type: "course", code: "ENGR 001", alternatives: ["ENGR001"] },
            { type: "course", code: "MGMT 002", alternatives: ["MGMT002"] },
            { type: "requirement", code: "General Electives", credits: 4 },
          ],
        },
        {
          label: "Fifth Semester",
          items: [
            { type: "course", code: "COME 411", alternatives: ["COME411"] },
            { type: "course", code: "COMP 337", alternatives: ["COMP337"] },
            { type: "course", code: "COMP 361", alternatives: ["COMP361"] },
            { type: "course", code: "COMP 423", alternatives: ["COMP423"] },
            { type: "course", code: "COMP 453", alternatives: ["COMP453"] },
            { type: "elective", code: "COMPxxx Technical Elective 1", department: "COMP", minNumber: 400, excludeCodes: ["COMP 499", "COMP 500", "COMP 501", "COMP 502"] },
          ],
        },
        {
          label: "Sixth Semester",
          items: [
            { type: "course", code: "COMP 344", alternatives: ["COMP344"] },
            { type: "course", code: "COMP 364", alternatives: ["COMP364"] },
            { type: "course", code: "COMP 428", alternatives: ["COMP428"] },
            { type: "course", code: "COMP 442", alternatives: ["COMP442"] },
            { type: "course", code: "COMP 454", alternatives: ["COMP454"] },
            { type: "course", code: "COMP 454L", alternatives: ["COMP454L"] },
            { type: "requirement", code: "General Electives", credits: 1 },
          ],
        },
        {
          label: "Summer III",
          items: [
            { type: "course", code: "COMP 499", alternatives: ["COMP499"] },
          ],
        },
        {
          label: "Seventh Semester",
          items: [
            { type: "course", code: "COMP 500", alternatives: ["COMP500"] },
            { type: "course", code: "COMP 501", alternatives: ["COMP501"] },
            { type: "course", code: "COMP 543", alternatives: ["COMP543"] },
            { type: "course", code: "COMP 543L", alternatives: ["COMP543L"] },
            { type: "elective", code: "COMPxxx Technical Elective 2", department: "COMP", minNumber: 400, excludeCodes: ["COMP 499", "COMP 500", "COMP 501", "COMP 502"] },
            { type: "elective", code: "COMPxxx Technical Elective 3", department: "COMP", minNumber: 400, excludeCodes: ["COMP 499", "COMP 500", "COMP 501", "COMP 502"] },
          ],
        },
        {
          label: "Eighth Semester",
          items: [
            { type: "course", code: "COMP 443", alternatives: ["COMP443"] },
            { type: "course", code: "COMP 452", alternatives: ["COMP452"] },
            { type: "course", code: "COMP 502", alternatives: ["COMP502"] },
            { type: "course", code: "COMP 525", alternatives: ["COMP525"] },
            { type: "elective", code: "COMPxxx Technical Elective 4", department: "COMP", minNumber: 400, excludeCodes: ["COMP 499", "COMP 500", "COMP 501", "COMP 502"] },
          ],
        },
      ],
    },
  },
  buildBauParsedPlan({
    id: "computer-science",
    labels: ["computer science", "cs", "cmps"],
    title: "BS Computer Science",
    source: BAU_CS_SOURCE,
    notes: ["BAU's official Computer Science page publishes the semester-by-semester study plan directly in the program page HTML."],
  }),
  buildBauParsedPlan({
    id: "physics",
    labels: ["physics", "applied computational physics"],
    title: "BS Physics (Applied Computational Physics Track)",
    source: BAU_PHYS_SOURCE,
    notes: ["BAU's official Physics Applied Computational Physics track page publishes the semester-by-semester study plan directly in the program page HTML."],
  }),
  buildAustParsedPlan({
    id: "business-administration",
    labels: ["business administration", "business", "bba", "management"],
    title: "BBA Management",
    source: AUST_MGT_SOURCE,
    notes: ["AUST's official MGT sequence PDF publishes the semester-by-semester Management plan."],
  }),
  buildAustParsedPlan({
    id: "accounting",
    labels: ["accounting", "acc"],
    title: "BBA Accounting",
    source: AUST_ACC_SOURCE,
    notes: ["AUST's official ACC sequence PDF publishes the semester-by-semester Accounting plan."],
  }),
  buildAustParsedPlan({
    id: "finance",
    labels: ["finance", "fin"],
    title: "BBA Finance",
    source: AUST_FIN_SOURCE,
    notes: ["AUST's official FIN sequence PDF publishes the semester-by-semester Finance plan."],
  }),
  buildAustParsedPlan({
    id: "marketing",
    labels: ["marketing", "mkt"],
    title: "BBA Marketing",
    source: AUST_MKT_SOURCE,
    notes: ["AUST's official MKT sequence PDF publishes the semester-by-semester Marketing plan."],
  }),
  buildAustParsedPlan({
    id: "hospitality-management",
    labels: ["hospitality management", "hospitality", "hpm"],
    title: "BHM Hospitality Management",
    source: AUST_HPM_SOURCE,
    notes: ["AUST's official HPM sequence PDF publishes the semester-by-semester Hospitality Management plan."],
  }),
  buildAustParsedPlan({
    id: "economics",
    labels: ["economics", "eco"],
    title: "BS Economics",
    source: AUST_ECO_SOURCE,
    notes: ["AUST's official ECO sequence PDF publishes the semester-by-semester Economics plan."],
  }),
  buildAustParsedPlan({
    id: "computer-science",
    labels: ["computer science", "cs", "csi"],
    title: "BS Computer Science",
    source: AUST_CSI_SOURCE,
    notes: ["AUST's official by-semester Computer Science PDF publishes the semester-by-semester CS plan."],
  }),
  buildAustParsedPlan({
    id: "information-technology",
    labels: ["information technology", "it", "ict"],
    title: "BS Information and Communications Technology",
    source: AUST_ICT_SOURCE,
    notes: ["AUST's official by-semester ICT PDF publishes the semester-by-semester Information and Communications Technology plan."],
  }),
  buildAustParsedPlan({
    id: "graphic-design",
    labels: ["graphic design"],
    title: "BA Graphic Design",
    source: AUST_GRAPHIC_DESIGN_SOURCE,
    notes: ["AUST's official by-semester Graphic Design PDF publishes the semester-by-semester Graphic Design plan."],
  }),
  buildAustParsedPlan({
    id: "interior-design",
    labels: ["interior design"],
    title: "BA Interior Design",
    source: AUST_INTERIOR_DESIGN_SOURCE,
    notes: ["AUST's official by-semester Interior Design PDF publishes the semester-by-semester Interior Design plan."],
  }),
  buildNduParsedPlan({
    id: "business-administration",
    labels: ["business administration", "business", "bba", "management"],
    title: "BBA Management",
    source: NDU_BUSINESS_ADMIN_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Management plan."],
  }),
  buildNduParsedPlan({
    id: "accounting",
    labels: ["accounting"],
    title: "BBA Accounting",
    source: NDU_ACCOUNTING_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Accounting plan."],
  }),
  buildNduParsedPlan({
    id: "finance",
    labels: ["finance", "banking and finance"],
    title: "BBA Banking and Finance",
    source: NDU_FINANCE_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Banking and Finance plan."],
  }),
  buildNduParsedPlan({
    id: "marketing",
    labels: ["marketing"],
    title: "BBA Marketing",
    source: NDU_MARKETING_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Marketing plan."],
  }),
  buildNduParsedPlan({
    id: "hospitality",
    labels: ["hospitality", "hospitality management"],
    title: "BHMT Hospitality Management",
    source: NDU_HOSPITALITY_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Hospitality Management plan."],
  }),
  buildNduParsedPlan({
    id: "civil-engineering",
    labels: ["civil engineering", "civil engineer"],
    title: "BE Civil Engineering",
    source: NDU_CIVIL_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Civil Engineering plan."],
  }),
  buildNduParsedPlan({
    id: "computer-engineering",
    labels: ["computer engineering", "computer and communication engineering", "cce"],
    title: "BE Computer and Communication Engineering",
    source: NDU_CCE_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Computer and Communication Engineering plan."],
  }),
  buildNduParsedPlan({
    id: "computer-science",
    labels: ["computer science", "cs"],
    title: "BS Computer Science",
    source: NDU_CS_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Computer Science plan."],
  }),
  buildNduParsedPlan({
    id: "mis",
    labels: ["mis", "management information systems"],
    title: "BS Business Computing - MIS",
    source: NDU_MIS_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester MIS plan."],
  }),
  buildNduParsedPlan({
    id: "political-science",
    labels: ["political science"],
    title: "BA Political Science",
    source: NDU_POLITICAL_SCIENCE_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Political Science plan."],
  }),
  buildNduParsedPlan({
    id: "graphic-design",
    labels: ["graphic design"],
    title: "BA Graphic Design",
    source: NDU_GRAPHIC_DESIGN_SOURCE,
    notes: ["NDU's official curriculum page publishes the suggested semester-by-semester Graphic Design plan."],
  }),
  buildUsjParsedPlan({
    id: "business-administration",
    labels: ["business administration", "business", "bba", "management"],
    title: "Bachelor in Business Administration and Management",
    source: USJ_BUSINESS_ADMIN_SOURCE,
    notes: ["USJ's official cursus page publishes the semester-by-semester Business Administration and Management sequence."],
  }),
  buildUsjParsedPlan({
    id: "computer-science",
    labels: ["computer science", "computer science bs", "informatics"],
    title: "Licence en informatique - BS in computer science",
    source: USJ_COMPUTER_SCIENCE_SOURCE,
    notes: ["USJ's official formation page publishes the semester-by-semester Computer Science sequence."],
  }),
  buildUsjParsedPlan({
    id: "data-science",
    labels: ["data science"],
    title: "Bachelor in Mathematics, option Data Science",
    source: USJ_DATA_SCIENCE_SOURCE,
    notes: ["USJ's official cursus page publishes the semester-by-semester Data Science sequence."],
  }),
  buildUsjParsedPlan({
    id: "banking-studies",
    labels: ["banking studies", "banking"],
    title: "Bachelor in Banking Studies",
    source: USJ_BANKING_STUDIES_SOURCE,
    notes: ["USJ's official formation page publishes the semester-by-semester Banking Studies sequence."],
  }),
  buildUsjParsedPlan({
    id: "insurance-science",
    labels: ["insurance science", "insurance"],
    title: "Bachelor in Insurance Science",
    source: USJ_INSURANCE_SCIENCE_SOURCE,
    notes: ["USJ's official formation page publishes the semester-by-semester Insurance Science sequence."],
  }),
  buildUsjParsedPlan({
    id: "speech-and-language-therapy",
    labels: ["speech and language therapy"],
    title: "Bachelor in Speech and Language Therapy",
    source: USJ_SPEECH_THERAPY_SOURCE,
    notes: ["USJ's official formation page publishes the semester-by-semester Speech and Language Therapy sequence."],
  }),
  buildLiuParsedPlan({
    id: "advertising",
    labels: ["advertising", "communication arts advertising", "advr"],
    title: "BA Communication Arts - Advertising",
    source: LIU_ADVR_SOURCE,
    notes: ["LIU's official ADVR Plan of Study publishes the Advertising sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "accounting-information-systems",
    labels: ["accounting information systems", "accounting", "bais"],
    title: "BBA Accounting Information Systems",
    source: LIU_BAIS_SOURCE,
    notes: ["LIU's official BAIS Plan of Study publishes the Accounting Information Systems sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "banking-and-finance",
    labels: ["banking and finance", "finance", "banking", "bfin"],
    title: "BBA Banking and Finance",
    source: LIU_BFIN_SOURCE,
    notes: ["LIU's official BFIN Plan of Study publishes the Banking and Finance sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "biochemistry",
    labels: ["biochemistry", "bioc"],
    title: "BS Biochemistry",
    source: LIU_BIOC_SOURCE,
    notes: ["LIU's official BIOC Plan of Study publishes the BS Biochemistry sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "biology",
    labels: ["biology", "biol"],
    title: "BS Biology",
    source: LIU_BIOL_SOURCE,
    notes: ["LIU's official BIOL Plan of Study publishes the BS Biology sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "biomedical-science",
    labels: ["biomedical science", "bmed"],
    title: "BS Biomedical Science",
    source: LIU_BMED_SOURCE,
    notes: ["LIU's official BMED Plan of Study publishes the BS Biomedical Science sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "business-management",
    labels: ["business management", "business administration", "business", "bba", "bmgt"],
    title: "BBA Business Management",
    source: LIU_BMGT_SOURCE,
    notes: ["LIU's official BMGT Plan of Study publishes the Business Management sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "economics",
    labels: ["economics", "beco"],
    title: "BBA Economics",
    source: LIU_BECO_SOURCE,
    notes: ["LIU's official BECO Plan of Study publishes the Economics sequence semester by semester."],
  }),
  {
    universityId: "liu",
    id: "computer-science",
    labels: ["computer science", "cs", "csci"],
    title: "BS Computer Science",
    defaultStart: "fall",
    source: LIU_CSCI_SOURCE,
    notes: [
      "LIU's official CSCI Plan of Study publishes the BS Computer Science sequence semester by semester.",
      "Semester 3 is CSCI300, CSCI300L, CSCI342, CSCI335, CSCI345, and CSCI373.",
    ],
    sequences: {
      fall: [
        {
          label: "First Year Fall",
          items: [
            { type: "course", code: "CULT 200" },
            { type: "course", code: "MATH 210" },
            { type: "course", code: "CSCI 205" },
            { type: "course", code: "MATH 225" },
            { type: "course", code: "ENGL 201" },
            { type: "course", code: "CSCI 200" },
          ],
        },
        {
          label: "First Year Spring",
          items: [
            { type: "course", code: "ENGL 251" },
            { type: "course", code: "MATH 260" },
            { type: "course", code: "ARAB 200" },
            { type: "elective", code: "Major elective" },
            { type: "course", code: "CSCI 250" },
            { type: "course", code: "CSCI 250L" },
          ],
        },
        {
          label: "Second Year Fall",
          items: [
            { type: "course", code: "CSCI 300" },
            { type: "course", code: "CSCI 300L" },
            { type: "course", code: "CSCI 342" },
            { type: "course", code: "CSCI 335" },
            { type: "course", code: "CSCI 345" },
            { type: "course", code: "CSCI 373" },
          ],
        },
        {
          label: "Second Year Spring",
          items: [
            { type: "course", code: "CSCI 380" },
            { type: "course", code: "CSCI 378" },
            { type: "course", code: "CSCI 392" },
            { type: "course", code: "CSCI 351" },
            { type: "course", code: "CSCI 390" },
            { type: "elective", code: "Major elective" },
          ],
        },
        {
          label: "Third Year Fall",
          items: [
            { type: "course", code: "CSCI 435" },
            { type: "course", code: "CSCI 441" },
            { type: "course", code: "CSCI 430L" },
            { type: "course", code: "CSCI 430" },
            { type: "course", code: "MATH 310" },
            { type: "elective", code: "Major elective" },
          ],
        },
        {
          label: "Third Year Spring",
          items: [
            { type: "elective", code: "Major elective" },
            { type: "course", code: "CSCI 475" },
            { type: "elective", code: "Major elective" },
            { type: "course", code: "CSCI 490" },
            { type: "course", code: "CSCI 452" },
            { type: "course", code: "MATH 375" },
          ],
        },
      ],
    },
  },
  buildLiuParsedPlan({
    id: "chemistry",
    labels: ["chemistry", "chem"],
    title: "BS Chemistry",
    source: LIU_CHEM_SOURCE,
    notes: ["LIU's official CHEM Plan of Study publishes the BS Chemistry sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "early-childhood-education",
    labels: ["early childhood education", "child education", "ched"],
    title: "BE Early Childhood Education",
    source: LIU_CHED_SOURCE,
    notes: ["LIU's official CHED Plan of Study publishes the Early Childhood Education sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "information-technology",
    labels: ["information technology", "it", "csit"],
    title: "BS Information Technology",
    source: LIU_CSIT_SOURCE,
    notes: ["LIU's official CSIT Plan of Study publishes the BS Information Technology sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "industrial-engineering",
    labels: ["industrial engineering", "ieng"],
    title: "BS Industrial Engineering",
    source: LIU_IENG_SOURCE,
    notes: ["LIU's official IENG Plan of Study publishes the BS Industrial Engineering sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "electronics-engineering",
    labels: ["electronics engineering", "electronic engineering", "leng"],
    title: "BS Electronics Engineering",
    source: LIU_LENG_SOURCE,
    notes: ["LIU's official LENG Plan of Study publishes the BS Electronics Engineering sequence semester by semester."],
  }),
  {
    universityId: "liu",
    id: "electrical-engineering",
    labels: ["electrical engineering", "electrical engineer", "eeng"],
    title: "BS Electrical Engineering",
    defaultStart: "fall",
    source: LIU_EENG_SOURCE,
    notes: [
      "LIU's official EENG Plan of Study publishes the BS Electrical Engineering sequence semester by semester.",
      "Semester 3 is MATH310, CENG335, MATH220, EENG301L, EENG300, an elective, and ENGG300.",
    ],
    sequences: {
      fall: [
        {
          label: "First Year Fall",
          items: [
            { type: "course", code: "MENG 225" },
            { type: "course", code: "ENGL 201" },
            { type: "course", code: "ENGG 200" },
            { type: "course", code: "MATH 210" },
            { type: "course", code: "MATH 225" },
            { type: "course", code: "PHYS 220" },
          ],
        },
        {
          label: "First Year Spring",
          items: [
            { type: "course", code: "ENGL 251" },
            { type: "course", code: "MATH 270" },
            { type: "course", code: "CSCI 250" },
            { type: "course", code: "EENG 250" },
            { type: "course", code: "CULT 200" },
            { type: "course", code: "CSCI 250L" },
            { type: "course", code: "CENG 250" },
          ],
        },
        {
          label: "Second Year Fall",
          items: [
            { type: "course", code: "MATH 310" },
            { type: "course", code: "CENG 335" },
            { type: "course", code: "MATH 220" },
            { type: "course", code: "EENG 301L" },
            { type: "course", code: "EENG 300" },
            { type: "elective", code: "Major elective" },
            { type: "course", code: "ENGG 300" },
          ],
        },
        {
          label: "Second Year Spring",
          items: [
            { type: "course", code: "EENG 365" },
            { type: "course", code: "EENG 388" },
            { type: "course", code: "EENG 350L" },
            { type: "course", code: "EENG 385" },
            { type: "course", code: "CENG 352L" },
            { type: "course", code: "EENG 350" },
            { type: "course", code: "CENG 380" },
          ],
        },
        {
          label: "Third Year Fall",
          items: [
            { type: "course", code: "EENG 440" },
            { type: "course", code: "CENG 400L" },
            { type: "course", code: "EENG 435L" },
            { type: "course", code: "EENG 435" },
            { type: "course", code: "EENG 400L" },
            { type: "course", code: "EENG 400" },
            { type: "course", code: "EENG 410L" },
            { type: "course", code: "EENG 410" },
            { type: "course", code: "ARAB 200" },
          ],
        },
        {
          label: "Third Year Spring",
          items: [
            { type: "course", code: "EENG 491" },
            { type: "course", code: "EENG 495" },
            { type: "course", code: "EENG 460" },
            { type: "elective", code: "Major elective" },
            { type: "course", code: "ENGG 450" },
            { type: "course", code: "EENG 491L" },
          ],
        },
      ],
    },
  },
  buildLiuParsedPlan({
    id: "food-science-technology",
    labels: ["food science technology", "food science", "fdst"],
    title: "BS Food Science Technology",
    source: LIU_FDST_SOURCE,
    notes: ["LIU's official FDST Plan of Study publishes the BS Food Science Technology sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "hospitality-and-tourism-management",
    labels: ["hospitality and tourism management", "hospitality", "tourism", "bhtm"],
    title: "BBA Hospitality and Tourism Management",
    source: LIU_BHTM_SOURCE,
    notes: ["LIU's official BHTM Plan of Study publishes the Hospitality and Tourism Management sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "international-business-management",
    labels: ["international business management", "international business", "imgt"],
    title: "BBA International Business Management",
    source: LIU_IMGT_SOURCE,
    notes: ["LIU's official IMGT Plan of Study publishes the International Business Management sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "graphic-design",
    labels: ["graphic design", "gdes"],
    title: "BS Graphic Design",
    source: LIU_GDES_SOURCE,
    notes: ["LIU's official GDES Plan of Study publishes the BS Graphic Design sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "interior-design",
    labels: ["interior design", "ides"],
    title: "BS Interior Design",
    source: LIU_IDES_SOURCE,
    notes: ["LIU's official IDES Plan of Study publishes the BS Interior Design sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "journalism",
    labels: ["journalism", "communication arts journalism", "jour"],
    title: "BA Communication Arts – Journalism",
    source: LIU_JOUR_SOURCE,
    notes: ["LIU's official JOUR Plan of Study publishes the Journalism sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "management-information-systems",
    labels: ["management information systems", "mis", "bmis"],
    title: "BBA Management Information Systems",
    source: LIU_BMIS_SOURCE,
    notes: ["LIU's official BMIS Plan of Study publishes the Management Information Systems sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "mathematics",
    labels: ["mathematics", "math"],
    title: "BS Mathematics",
    source: LIU_MATH_SOURCE,
    notes: ["LIU's official MATH Plan of Study publishes the BS Mathematics sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "marketing",
    labels: ["marketing", "bmkt"],
    title: "BBA Marketing",
    source: LIU_BMKT_SOURCE,
    notes: ["LIU's official BMKT Plan of Study publishes the Marketing sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "mechanical-engineering",
    labels: ["mechanical engineering", "mechanical engineer", "meng"],
    title: "BS Mechanical Engineering",
    source: LIU_MENG_SOURCE,
    notes: ["LIU's official MENG Plan of Study publishes the BS Mechanical Engineering sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "nutrition-and-dietetics",
    labels: ["nutrition and dietetics", "nutrition", "nutr"],
    title: "BS Nutrition and Dietetics",
    source: LIU_NUTR_SOURCE,
    notes: ["LIU's official NUTR Plan of Study publishes the BS Nutrition and Dietetics sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "pharmacy",
    labels: ["pharmacy", "phar"],
    title: "Bachelor of Pharmacy",
    source: LIU_PHAR_SOURCE,
    notes: ["LIU's official PHAR Plan of Study publishes the Pharmacy sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "physics",
    labels: ["physics", "phys"],
    title: "BS Physics",
    source: LIU_PHYS_SOURCE,
    notes: ["LIU's official PHYS Plan of Study publishes the BS Physics sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "public-relations",
    labels: ["public relations", "communication arts public relations", "prel"],
    title: "BA Communication Arts – Public Relations",
    source: LIU_PREL_SOURCE,
    notes: ["LIU's official PREL Plan of Study publishes the Public Relations sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "radio-and-television",
    labels: ["radio and television", "communication arts radio and television", "rtvf"],
    title: "BA Communication Arts – Radio and Television",
    source: LIU_RTVF_SOURCE,
    notes: ["LIU's official RTVF Plan of Study publishes the Radio and Television sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "surveying-engineering",
    labels: ["surveying engineering", "surv"],
    title: "BS Surveying Engineering",
    source: LIU_SURV_SOURCE,
    notes: ["LIU's official SURV Plan of Study publishes the BS Surveying Engineering sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "teacher-education-biology-chemistry",
    labels: ["teacher education biology chemistry", "teacher education biology-chemistry", "tebc"],
    title: "BE Teacher Education (Biology-Chemistry)",
    source: LIU_TEBC_SOURCE,
    notes: ["LIU's official TEBC Plan of Study publishes the Biology-Chemistry teacher education sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "teacher-education-physics-mathematics",
    labels: ["teacher education physics mathematics", "teacher education physics-mathematics", "tepm"],
    title: "BE Teacher Education (Physics-Mathematics)",
    source: LIU_TEPM_SOURCE,
    notes: ["LIU's official TEPM Plan of Study publishes the Physics-Mathematics teacher education sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "teaching-english-as-a-second-language",
    labels: ["teaching english as a second language", "education", "teaching english", "tesl"],
    title: "BE Teaching English as a Second Language",
    source: LIU_TESL_SOURCE,
    notes: ["LIU's official TESL Plan of Study publishes the Teaching English as a Second Language sequence semester by semester."],
  }),
  buildLiuParsedPlan({
    id: "translation-and-interpretation",
    labels: ["translation and interpretation", "translation", "trns"],
    title: "Bachelor of Translation and Interpretation",
    source: LIU_TRNS_SOURCE,
    notes: ["LIU's official TRNS Plan of Study publishes the Translation and Interpretation sequence semester by semester."],
  }),
  {
    universityId: "liu",
    id: "biomedical-engineering",
    labels: ["biomedical engineering", "electronics engineering biomedical engineering", "beng"],
    title: "BS Electronics Engineering – Biomedical Engineering",
    defaultStart: "fall",
    source: LIU_BENG_SOURCE,
    notes: [
      "LIU's official BENG Plan of Study publishes the Electronics Engineering – Biomedical Engineering sequence semester by semester.",
      "Semester 3 is EENG300, ENGL251, CENG250, an elective, EENG304, MATH310, and EENG301L.",
    ],
    sequences: {
      fall: [
        {
          label: "First Year Fall",
          items: [
            { type: "course", code: "PHYS 220" },
            { type: "course", code: "ARAB 200" },
            { type: "course", code: "ENGL 201" },
            { type: "course", code: "CHEM 200" },
            { type: "course", code: "MATH 210" },
            { type: "course", code: "MATH 225" },
          ],
        },
        {
          label: "First Year Spring",
          items: [
            { type: "course", code: "CSCI 250L" },
            { type: "course", code: "MATH 220" },
            { type: "course", code: "EENG 250" },
            { type: "course", code: "MENG 250" },
            { type: "course", code: "ENGG 200" },
            { type: "course", code: "MATH 270" },
            { type: "course", code: "CSCI 250" },
          ],
        },
        {
          label: "Second Year Fall",
          items: [
            { type: "course", code: "EENG 300" },
            { type: "course", code: "ENGL 251" },
            { type: "course", code: "CENG 250" },
            { type: "elective", code: "Major elective" },
            { type: "course", code: "EENG 304" },
            { type: "course", code: "MATH 310" },
            { type: "course", code: "EENG 301L" },
          ],
        },
        {
          label: "Second Year Spring",
          items: [
            { type: "course", code: "CENG 352L" },
            { type: "course", code: "EENG 354L" },
            { type: "course", code: "ENGG 300" },
            { type: "course", code: "EENG 350L" },
            { type: "course", code: "EENG 350" },
            { type: "course", code: "EENG 354" },
            { type: "course", code: "EENG 385" },
            { type: "course", code: "EENG 388" },
          ],
        },
        {
          label: "Third Year Fall",
          items: [
            { type: "course", code: "EENG 404" },
            { type: "course", code: "EENG 424" },
            { type: "course", code: "EENG 435L" },
            { type: "course", code: "EENG 400L" },
            { type: "course", code: "EENG 484" },
            { type: "course", code: "EENG 400" },
            { type: "course", code: "EENG 424L" },
            { type: "course", code: "EENG 435" },
          ],
        },
        {
          label: "Third Year Spring",
          items: [
            { type: "course", code: "EENG 484L" },
            { type: "course", code: "ENGG 450" },
            { type: "course", code: "EENG 474" },
            { type: "course", code: "EENG 494" },
            { type: "course", code: "CULT 200" },
            { type: "course", code: "EENG 414" },
          ],
        },
      ],
    },
  },
  {
    universityId: "liu",
    id: "computer-engineering",
    labels: ["computer engineering", "computer engineer", "ceng"],
    title: "BS Computer Engineering",
    defaultStart: "fall",
    source: LIU_CENG_SOURCE,
    notes: [
      "LIU's September 4, 2024 Plan of Study publishes the BS Computer Engineering sequence semester by semester.",
      "Semester 3 is CSCI 300, EENG 300, ENGG 300, MATH 310, CENG 335, CENG 325, and EENG 301L.",
    ],
    sequences: {
      fall: [
        {
          label: "First Year Fall",
          items: [
            { type: "course", code: "MATH 225" },
            { type: "course", code: "PHYS 220" },
            { type: "course", code: "CULT 200" },
            { type: "course", code: "MATH 210" },
            { type: "course", code: "ENGG 200" },
            { type: "course", code: "ENGL 201" },
          ],
        },
        {
          label: "First Year Spring",
          items: [
            { type: "course", code: "EENG 250" },
            { type: "course", code: "CENG 250" },
            { type: "course", code: "MATH 270" },
            { type: "course", code: "ENGL 251" },
            { type: "course", code: "CSCI 250L" },
            { type: "course", code: "MATH 220" },
            { type: "course", code: "CSCI 250" },
          ],
        },
        {
          label: "Second Year Fall",
          items: [
            { type: "course", code: "CSCI 300" },
            { type: "course", code: "EENG 300" },
            { type: "course", code: "ENGG 300" },
            { type: "course", code: "MATH 310" },
            { type: "course", code: "CENG 335" },
            { type: "course", code: "CENG 325" },
            { type: "course", code: "EENG 301L" },
          ],
        },
        {
          label: "Second Year Spring",
          items: [
            { type: "course", code: "ARAB 200" },
            { type: "course", code: "EENG 350L" },
            { type: "course", code: "CENG 352L" },
            { type: "course", code: "CENG 380" },
            { type: "course", code: "EENG 385" },
            { type: "course", code: "CENG 375" },
            { type: "course", code: "EENG 350" },
          ],
        },
        {
          label: "Third Year Fall",
          items: [
            { type: "course", code: "CENG 430L" },
            { type: "elective", code: "Major elective", department: "CENG", minNumber: 400, excludeCodes: ["CENG 430L", "CENG 400L", "CENG 420", "CENG 435", "CENG 415", "CENG 400"] },
            { type: "course", code: "EENG 447" },
            { type: "course", code: "CENG 435" },
            { type: "course", code: "CENG 415" },
            { type: "course", code: "CENG 400L" },
            { type: "course", code: "CENG 420" },
            { type: "course", code: "CENG 400" },
          ],
        },
        {
          label: "Third Year Spring",
          items: [
            { type: "course", code: "CENG 450L" },
            { type: "elective", code: "Major elective", department: "CENG", minNumber: 400, excludeCodes: ["CENG 450L", "CENG 455L", "CENG 495"] },
            { type: "elective", code: "Major elective", department: "CENG", minNumber: 400, excludeCodes: ["CENG 450L", "CENG 455L", "CENG 495"] },
            { type: "course", code: "CENG 455L" },
            { type: "course", code: "CENG 495" },
            { type: "course", code: "EENG 467L" },
            { type: "course", code: "ENGG 450" },
          ],
        },
      ],
    },
  },
  {
    universityId: "liu",
    id: "communication-engineering",
    labels: [
      "communication engineering",
      "communications engineering",
      "communication engineer",
      "telecommunication engineering",
      "telecommunications engineering",
      "telecommunication engineer",
      "computer communication engineering",
      "computer communications engineering",
      "computer and communication engineering",
      "computer communication engineer",
      "computer communications engineer",
      "teng",
    ],
    title: "BS Communication Engineering",
    defaultStart: "fall",
    source: LIU_TENG_SOURCE,
    notes: [
      "LIU's September 4, 2024 Plan of Study publishes the BS Communication Engineering sequence semester by semester.",
      "LIU names the undergraduate program Communication Engineering / TENG; the master's title uses Computer and Communication Engineering.",
      "Semester 3 is CENG 325, CSCI 300, MATH 310, EENG 300, EENG 301L, ENGG 300, and CENG 335.",
    ],
    sequences: {
      fall: [
        {
          label: "First Year Fall",
          items: [
            { type: "course", code: "PHYS 220" },
            { type: "course", code: "MATH 210" },
            { type: "course", code: "ENGG 200" },
            { type: "course", code: "ENGL 201" },
            { type: "course", code: "MATH 225" },
            { type: "course", code: "CULT 200" },
          ],
        },
        {
          label: "First Year Spring",
          items: [
            { type: "course", code: "ENGL 251" },
            { type: "course", code: "CSCI 250" },
            { type: "course", code: "CSCI 250L" },
            { type: "course", code: "CENG 250" },
            { type: "course", code: "MATH 220" },
            { type: "course", code: "MATH 270" },
            { type: "course", code: "EENG 250" },
          ],
        },
        {
          label: "Second Year Fall",
          items: [
            { type: "course", code: "CENG 325" },
            { type: "course", code: "CSCI 300" },
            { type: "course", code: "MATH 310" },
            { type: "course", code: "EENG 300" },
            { type: "course", code: "EENG 301L" },
            { type: "course", code: "ENGG 300" },
            { type: "course", code: "CENG 335" },
          ],
        },
        {
          label: "Second Year Spring",
          items: [
            { type: "course", code: "CENG 375" },
            { type: "course", code: "EENG 350L" },
            { type: "course", code: "CENG 380" },
            { type: "course", code: "CENG 352L" },
            { type: "course", code: "EENG 385" },
            { type: "course", code: "EENG 350" },
            { type: "course", code: "ARAB 200" },
          ],
        },
        {
          label: "Third Year Fall",
          items: [
            { type: "course", code: "CENG 430L" },
            { type: "course", code: "CENG 400L" },
            { type: "elective", code: "Major elective", department: "CENG", minNumber: 400, excludeCodes: ["CENG 430L", "CENG 400L", "CENG 420", "CENG 435", "CENG 415", "EENG 447", "CENG 400"] },
            { type: "course", code: "CENG 420" },
            { type: "course", code: "CENG 435" },
            { type: "course", code: "CENG 415" },
            { type: "course", code: "EENG 447" },
            { type: "course", code: "CENG 400" },
          ],
        },
        {
          label: "Third Year Spring",
          items: [
            { type: "course", code: "CENG 455L" },
            { type: "course", code: "CENG 450L" },
            { type: "course", code: "EENG 467L" },
            { type: "elective", code: "Major elective", department: "CENG", minNumber: 400, excludeCodes: ["CENG 455L", "CENG 450L", "CENG 495"] },
            { type: "course", code: "EENG 388" },
            { type: "course", code: "CENG 495" },
            { type: "course", code: "ENGG 450" },
          ],
        },
      ],
    },
  },
];

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bsemes(?:t|y)?er\b/g, "semester")
    .replace(/\bsemster\b/g, "semester")
    .replace(/\bcompu?e?ter\b/g, "computer")
    .replace(/\benginner\b/g, "engineer")
    .replace(/\benginering\b/g, "engineering")
    .replace(/\bengineerring\b/g, "engineering")
    .replace(/\bengeneering\b/g, "engineering")
    .replace(/\bstudemt\b/g, "student")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value = "") {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseMatches(text = "", phrase = "") {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  const escaped = escapeRegex(normalizedPhrase).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function curriculumLabelMatches({ normalizedMessage = "", majorLabels = [], label = "" } = {}) {
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel) return false;
  const shortAlias = normalizedLabel.length <= 3;

  if (shortAlias) {
    return phraseMatches(normalizedMessage, normalizedLabel)
      || majorLabels.some((candidate) => candidate === normalizedLabel);
  }

  return phraseMatches(normalizedMessage, normalizedLabel)
    || majorLabels.some((candidate) => {
      if (candidate === normalizedLabel) return true;
      if (String(candidate).length <= 3) return false;
      return candidate.includes(normalizedLabel) || normalizedLabel.includes(candidate);
    });
}

function extractSemesterNumber(message = "") {
  const text = normalizeText(message);
  const numeric = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:semester|term)\b/)
    || text.match(/\b(?:semester|term)\s+(\d{1,2})\b/);
  if (numeric) return Number(numeric[1]);

  for (const [word, value] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\s+(?:semester|term)\\b`).test(text)) return value;
  }

  if (/\b(first|freshman|starter|new student)\b/.test(text)) return 1;
  return null;
}

function extractStartSeason(message = "") {
  const text = normalizeText(message);
  if (/\bstarted?\s+in\s+spring\b|\bspring\s+start\b|\bstarting\s+spring\b/.test(text)) return "spring";
  if (/\bstarted?\s+in\s+fall\b|\bfall\s+start\b|\bstarting\s+fall\b/.test(text)) return "fall";
  return null;
}

function findCurriculumPlan({ universityId = "", major = null, message = "" } = {}) {
  const normalizedMessage = normalizeText(message);
  const majorLabels = [
    major?.label,
    major?.id,
    ...Array.isArray(major?.patterns) ? major.patterns : [],
  ].filter(Boolean).map(normalizeText);

  return getCurriculumPlans().find((plan) => {
    if (String(plan.universityId).toLowerCase() !== String(universityId).toLowerCase()) return false;
    return plan.labels.some((label) => curriculumLabelMatches({ normalizedMessage, majorLabels, label }));
  }) ?? null;
}

function resolveCurriculumSemester({ universityId = "", major = null, message = "" } = {}) {
  const semesterNumber = extractSemesterNumber(message);
  if (!semesterNumber) return null;

  const plan = findCurriculumPlan({ universityId, major, message });
  if (!plan) return null;

  const start = extractStartSeason(message) ?? plan.defaultStart ?? "fall";
  const sequence = plan.sequences[start] ?? plan.sequences[plan.defaultStart] ?? plan.sequences.fall ?? [];
  const semester = sequence[semesterNumber - 1] ?? null;
  if (!semester) return null;

  return {
    plan,
    semester,
    semesterNumber,
    start,
  };
}

const CURRICULUM_RUNTIME_DIR = path.join(__dirname, "data", "curricula");
const CURRICULUM_RUNTIME_FILE = path.join(CURRICULUM_RUNTIME_DIR, "runtime-curriculum-plans.json");

let runtimeCurriculumPayload = null;
let runtimeCurriculumLoaded = false;

function loadRuntimeCurriculumPayload() {
  runtimeCurriculumLoaded = true;
  runtimeCurriculumPayload = null;

  try {
    if (!fs.existsSync(CURRICULUM_RUNTIME_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CURRICULUM_RUNTIME_FILE, "utf8"));
    runtimeCurriculumPayload = parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    runtimeCurriculumPayload = null;
  }

  return runtimeCurriculumPayload;
}

function getRuntimeCurriculumPayload() {
  if (!runtimeCurriculumLoaded) loadRuntimeCurriculumPayload();
  return runtimeCurriculumPayload;
}

function getCurriculumPlans() {
  const runtimePlans = getRuntimeCurriculumPayload()?.plans;
  if (!Array.isArray(runtimePlans) || !runtimePlans.length) {
    return STATIC_CURRICULUM_PLANS;
  }

  const merged = new Map();
  runtimePlans.forEach((plan) => {
    const key = `${String(plan?.universityId ?? "").toLowerCase()}::${String(plan?.id ?? "")}`;
    if (key !== "::") merged.set(key, plan);
  });
  STATIC_CURRICULUM_PLANS.forEach((plan) => {
    const key = `${String(plan?.universityId ?? "").toLowerCase()}::${String(plan?.id ?? "")}`;
    if (!merged.has(key)) merged.set(key, plan);
  });
  return [...merged.values()];
}

function getCurriculumStatus() {
  const payload = getRuntimeCurriculumPayload();
  const plans = getCurriculumPlans();
  const status = payload?.status && typeof payload.status === "object" ? payload.status : null;
  const registryCoverage = getOfficialMajorCoverageLists();
  const universityIds = [...new Set([
    ...Object.keys(registryCoverage),
    ...Object.keys(status?.byUniversity ?? {}),
    ...plans.map((plan) => String(plan?.universityId ?? "").toLowerCase()).filter(Boolean),
  ])];
  const majorCoverage = Object.fromEntries(
    universityIds.map((universityId) => {
      const registry = getOfficialMajorRegistry(universityId);
      const mappedIds = new Set(
        registry
          .map((entry) => entry.mappedPlanId)
          .filter(Boolean),
      );
      return [universityId, {
        officialMajors: registry.length,
        mappedMajors: mappedIds.size,
        unmappedMajors: Math.max(0, registry.length - mappedIds.size),
      }];
    }),
  );
  return {
    generatedAt: payload?.generatedAt || null,
    usingRuntimePlans: Boolean(payload?.plans?.length),
    totalPlans: Array.isArray(plans) ? plans.length : 0,
    parsedPlans: Number(status?.parsedPlans ?? 0) || 0,
    fallbackPlans: Number(status?.fallbackPlans ?? 0) || 0,
    byUniversity: status?.byUniversity && typeof status.byUniversity === "object" ? status.byUniversity : {},
    majorCoverage,
    sources: Array.isArray(status?.sources) ? status.sources : [],
  };
}

function reloadCurriculumPlans() {
  loadRuntimeCurriculumPayload();
  return getCurriculumStatus();
}

module.exports = {
  CURRICULUM_PLANS: STATIC_CURRICULUM_PLANS,
  STATIC_CURRICULUM_PLANS,
  CURRICULUM_RUNTIME_DIR,
  CURRICULUM_RUNTIME_FILE,
  extractSemesterNumber,
  getCurriculumPlans,
  getCurriculumStatus,
  reloadCurriculumPlans,
  resolveCurriculumSemester,
};
