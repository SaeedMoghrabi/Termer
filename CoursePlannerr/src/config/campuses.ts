import {
  DEFAULT_UNIVERSITY_ID,
  getUniversityById,
  type UniversityId,
} from "./universities.ts";

export interface UniversityCampus {
  id: string;
  label: string;
  aliases: string[];
  sourceUrl?: string;
  physical?: boolean;
}

const OFFICIAL_CAMPUSES: Record<UniversityId, UniversityCampus[]> = {
  aub: [
    {
      id: "aub-main",
      label: "Main Campus",
      aliases: ["main campus", "ras beirut", "beirut campus"],
      sourceUrl: "https://www.aub.edu.lb/AboutUs/Pages/campus.aspx",
    },
    {
      id: "aub-arec",
      label: "AREC",
      aliases: ["arec", "arec - farm", "arec farm", "aoub arec", "beqaa farm"],
      sourceUrl: "https://www.aub.edu.lb/fafs/arec/aboutarec/Pages/LocationandFacilities.aspx",
    },
  ],
  lau: [
    {
      id: "lau-beirut",
      label: "Beirut Campus",
      aliases: ["beirut campus", "beirut"],
      sourceUrl: "https://www.lau.edu.lb/about/locations/",
    },
    {
      id: "lau-byblos",
      label: "Byblos Campus",
      aliases: ["byblos campus", "byblos", "jbeil campus"],
      sourceUrl: "https://www.lau.edu.lb/about/locations/byblos.php",
    },
  ],
  bau: [
    {
      id: "bau-beirut",
      label: "Beirut Campus",
      aliases: ["beirut", "main campus", "beirut campus"],
      sourceUrl: "https://websitedev.bau.edu.lb/Beirut-Campus",
    },
    {
      id: "bau-debbieh",
      label: "Debbieh Campus",
      aliases: ["debbieh", "debbieh campus"],
      sourceUrl: "https://websitedev.bau.edu.lb/Debbieh-Campus",
    },
    {
      id: "bau-tripoli",
      label: "Tripoli Campus",
      aliases: ["tripoli", "tripoli campus"],
      sourceUrl: "https://websitedev.bau.edu.lb/Tripoli-Campus",
    },
    {
      id: "bau-bekaa",
      label: "Bekaa Campus",
      aliases: ["bekaa", "bekaa campus"],
      sourceUrl: "https://websitedev.bau.edu.lb/Bekaa-Campus",
    },
  ],
  ndu: [
    {
      id: "ndu-main",
      label: "Main Campus",
      aliases: ["main campus", "zouk mosbeh", "louaize"],
      sourceUrl: "https://www.ndu.edu.lb/admissions",
    },
    {
      id: "ndu-nlc",
      label: "North Lebanon Campus",
      aliases: ["nlc campus", "north lebanon campus", "barsa", "north campus"],
      sourceUrl: "https://www.ndu.edu.lb/admissions",
    },
    {
      id: "ndu-shouf",
      label: "Shouf Campus",
      aliases: ["sc campus", "shouf campus", "deir el qamar", "deir el kamar"],
      sourceUrl: "https://www.ndu.edu.lb/our-campuses/shouf-campus",
    },
  ],
  usek: [
    {
      id: "usek-kaslik",
      label: "Kaslik Campus",
      aliases: ["kaslik", "main campus", "campus kaslik"],
      sourceUrl: "https://www.usek.edu.lb/en/contact/main-campus",
    },
    {
      id: "usek-zahle",
      label: "Zahle RUC",
      aliases: ["zahle", "ruc zahle", "regional university center of zahle", "zahle ruc"],
      sourceUrl: "https://www.usek.edu.lb/en/zahle-ruc/direction-and-contacts",
    },
    {
      id: "usek-chekka",
      label: "Chekka RUC",
      aliases: ["chekka", "ruc chekka", "chekka ruc"],
      sourceUrl: "https://www.usek.edu.lb/about-usek/regional-university-centers/chekka-ruc",
    },
    {
      id: "usek-rmeich",
      label: "Rmeich RUC",
      aliases: ["rmeich", "ruc rmeich", "rmeich ruc"],
      sourceUrl: "https://www.usek.edu.lb/about-usek/regional-university-centers/rmeich-ruc",
    },
  ],
  aust: [
    {
      id: "aust-beirut",
      label: "Beirut Campus",
      aliases: ["beirut", "beirut campus", "ashrafieh"],
      sourceUrl: "https://s1.aust.edu.lb/Styles/ContactUs.aspx?ReturnUrl=~%2FGraduateApp%2FDefault.aspx",
    },
    {
      id: "aust-zahle",
      label: "Zahle Campus",
      aliases: ["zahle", "zahle campus"],
      sourceUrl: "https://s1.aust.edu.lb/Styles/ContactUs.aspx?ReturnUrl=~%2FGraduateApp%2FDefault.aspx",
    },
    {
      id: "aust-sidon",
      label: "Sidon Campus",
      aliases: ["sidon", "sidon campus", "saida", "saida campus"],
      sourceUrl: "https://s1.aust.edu.lb/Styles/ContactUs.aspx?ReturnUrl=~%2FGraduateApp%2FDefault.aspx",
    },
    {
      id: "aust-bhamdoun",
      label: "Bhamdoun Campus",
      aliases: ["bhamdoun", "bhamdoun campus"],
      sourceUrl: "https://api.aust.edu.lb/content/uploads/files/EVALAG-Self-Evaluation-Report.pdf",
    },
  ],
  usj: [
    {
      id: "usj-csm",
      label: "Medical Sciences Campus",
      aliases: ["medical sciences campus", "csm"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
    {
      id: "usj-cfdss",
      label: "Francois Debbane Social Sciences Campus",
      aliases: ["francois debbane social sciences campus", "cfdss", "social sciences campus"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
    {
      id: "usj-cst",
      label: "Science and Technology Campus",
      aliases: ["science and technology campus", "cst"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
    {
      id: "usj-csh",
      label: "Humanities Campus",
      aliases: ["humanities campus", "csh"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
    {
      id: "usj-cis",
      label: "Innovation and Sports Campus",
      aliases: ["innovation and sports campus", "cis"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
    {
      id: "usj-charles-corm",
      label: "Charles Corm Campus",
      aliases: ["charles corm campus"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
    {
      id: "usj-cln",
      label: "North Lebanon Campus",
      aliases: ["north lebanon campus", "cln", "campus liban nord"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
    {
      id: "usj-cls",
      label: "South Lebanon Campus",
      aliases: ["south lebanon campus", "cls", "campus liban sud"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
    {
      id: "usj-czb",
      label: "Zahle and Beqaa Campus",
      aliases: ["zahle and beqaa campus", "czb", "campus de zahle et de la bekaa"],
      sourceUrl: "https://www.usj.edu.lb/universite/campus.php?lang=2",
    },
  ],
  lu: [
    {
      id: "lu-hadath",
      label: "Rafic Hariri University Campus",
      aliases: ["rafic hariri university campus", "hadath campus", "hadath"],
      sourceUrl: "https://lu.ul.edu.lb/faculte/campus.aspx",
    },
    {
      id: "lu-fanar",
      label: "Pierre Gemayel University Campus",
      aliases: ["pierre gemayel university campus", "fanar campus", "fanar"],
      sourceUrl: "https://lu.ul.edu.lb/faculte/campus.aspx",
    },
    {
      id: "lu-north",
      label: "President Michel Sleiman University Campus",
      aliases: ["president michel sleiman university campus", "north campus", "ras maska", "rasmaska"],
      sourceUrl: "https://lu.ul.edu.lb/faculte/campus.aspx",
    },
  ],
  liu: [
    {
      id: "liu-bekaa",
      label: "Bekaa Campus",
      aliases: ["bekaa", "bekaa campus", "main campus", "west bekaa", "al khyara"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
    {
      id: "liu-beirut",
      label: "Beirut Campus",
      aliases: ["beirut", "beirut campus", "mouseitbeh", "mazraa"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
    {
      id: "liu-saida",
      label: "Saida Campus",
      aliases: ["saida", "saida campus", "sidon", "sidon campus"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
    {
      id: "liu-nabatieh",
      label: "Nabatieh Campus",
      aliases: ["nabatieh", "nabatiyeh", "nabatieh campus", "nabatiyeh campus"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
    {
      id: "liu-tripoli",
      label: "Tripoli Campus",
      aliases: ["tripoli", "tripoli campus", "dahr el ain"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
    {
      id: "liu-mount-lebanon",
      label: "Mount Lebanon Campus",
      aliases: ["mount lebanon", "mount lebanon campus", "saloumi"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
    {
      id: "liu-tyre",
      label: "Tyre Campus",
      aliases: ["tyre", "tyre campus", "sour", "abbasiyeh"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
    {
      id: "liu-rayak",
      label: "Rayak Campus",
      aliases: ["rayak", "rayak campus"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
    {
      id: "liu-akkar",
      label: "Akkar Campus",
      aliases: ["akkar", "akkar campus", "halba", "halba campus"],
      sourceUrl: "https://liu.edu.lb/LIU/",
    },
  ],
};

function normalizeCampusToken(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCampusDirectory(universityId: string): UniversityCampus[] {
  const resolvedUniversityId = getUniversityById(universityId).id;
  return OFFICIAL_CAMPUSES[resolvedUniversityId] ?? OFFICIAL_CAMPUSES[DEFAULT_UNIVERSITY_ID];
}

export function normalizeCampusName(universityId: string, rawCampus: string): string {
  const normalizedRaw = normalizeCampusToken(rawCampus);
  if (!normalizedRaw || normalizedRaw === "online campus" || normalizedRaw === "online university" || normalizedRaw === "online" || normalizedRaw === "outside") {
    return "";
  }

  const campus = getCampusDirectory(universityId).find((entry) =>
    [entry.label, ...entry.aliases].some((alias) => normalizeCampusToken(alias) === normalizedRaw),
  );

  return campus?.label ?? String(rawCampus ?? "").trim();
}

export function getUniversityCampuses(universityId: string, observedCampuses: string[] = []): UniversityCampus[] {
  const directory = getCampusDirectory(universityId);
  const observed = observedCampuses
    .map((campus) => normalizeCampusName(universityId, campus))
    .filter(Boolean);
  const observedSet = new Set(observed);
  const knownLabels = new Set(directory.map((campus) => campus.label));

  const merged = [...directory];

  observedSet.forEach((label) => {
    if (!knownLabels.has(label)) {
      merged.push({
        id: `${getUniversityById(universityId).id}-${normalizeCampusToken(label).replace(/\s+/g, "-") || "campus"}`,
        label,
        aliases: [label],
      });
    }
  });

  return merged;
}
