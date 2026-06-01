export type UniversityId =
  | "aub"
  | "lau"
  | "usek"
  | "bau"
  | "ndu"
  | "aust"
  | "usj"
  | "lu"
  | "liu";

export type UniversityAvailability = "live" | "partial" | "unavailable";

export interface UniversityOption {
  id: UniversityId;
  shortName: string;
  name: string;
  brand?: {
    primary: string;
    secondary: string;
    tertiary?: string;
  };
  availability: UniversityAvailability;
  note: string;
  sourceUrl?: string;
  updatedAt?: string | null;
  hasTerms?: boolean;
  hasCourses?: boolean;
  currentTermCode?: string | null;
}

export const DEFAULT_UNIVERSITY_ID: UniversityId = "aub";

export const UNIVERSITY_OPTIONS: UniversityOption[] = [
  {
    id: "aub",
    shortName: "AUB",
    name: "American University of Beirut",
    brand: {
      primary: "#8A1538",
      secondary: "#FFFFFF",
    },
    availability: "live",
    note: "Public Banner registration feed verified.",
  },
  {
    id: "lau",
    shortName: "LAU",
    name: "Lebanese American University",
    brand: {
      primary: "#0D8B6F",
      secondary: "#8FD7C0",
    },
    availability: "live",
    note: "Public dynamic schedule page verified.",
  },
  {
    id: "usek",
    shortName: "USEK",
    name: "Holy Spirit University of Kaslik",
    brand: {
      primary: "#1F4E79",
      secondary: "#FFFFFF",
      tertiary: "#4A6FA5",
    },
    availability: "live",
    note: "Public Banner class-search endpoints verified.",
  },
  {
    id: "bau",
    shortName: "BAU",
    name: "Beirut Arab University",
    brand: {
      primary: "#1E6FA8",
      secondary: "#FFFFFF",
      tertiary: "#5B7F95",
    },
    availability: "live",
    note: "Public course offering grid verified.",
  },
  {
    id: "ndu",
    shortName: "NDU",
    name: "Notre Dame University-Louaize",
    brand: {
      primary: "#1C5DAA",
      secondary: "#FFFFFF",
      tertiary: "#0F3C78",
    },
    availability: "live",
    note: "Public course offering search page verified.",
  },
  {
    id: "aust",
    shortName: "AUST",
    name: "American University of Science and Technology",
    brand: {
      primary: "#A7C7E7",
      secondary: "#2E5FA7",
      tertiary: "#FFFFFF",
    },
    availability: "partial",
    note: "Seeded searchable course directory available. Live section times still require broader public schedule access.",
  },
  {
    id: "usj",
    shortName: "USJ",
    name: "Universite Saint-Joseph de Beyrouth",
    brand: {
      primary: "#1C3F94",
      secondary: "#FFFFFF",
      tertiary: "#6A85C1",
    },
    availability: "partial",
    note: "Seeded searchable course directory available from official program documents. Live section times still require a broader timetable feed.",
  },
  {
    id: "lu",
    shortName: "LU",
    name: "Lebanese University",
    brand: {
      primary: "#E2231A",
      secondary: "#166534",
      tertiary: "#FFFFFF",
    },
    availability: "partial",
    note: "Seeded searchable course directory available from public faculty sources. Live section times still require a broader university-wide feed.",
  },
  {
    id: "liu",
    shortName: "LIU",
    name: "Lebanese International University",
    brand: {
      primary: "#1E6B3A",
      secondary: "#1A1A1A",
      tertiary: "#FFFFFF",
    },
    availability: "partial",
    note: "Seeded searchable LIU course directory and official professor directory are available. Live section times still require a public timetable feed.",
  },
];

export function getUniversityById(universityId: string): UniversityOption {
  return (
    UNIVERSITY_OPTIONS.find((university) => university.id === universityId)
    ?? UNIVERSITY_OPTIONS.find((university) => university.id === DEFAULT_UNIVERSITY_ID)!
  );
}
