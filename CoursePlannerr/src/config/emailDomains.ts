import { getUniversityById, type UniversityId } from "./universities.ts";

export type EmailDomainRule = {
  universityId: UniversityId;
  domains: string[];
  studentDomains: string[];
  needsManualReview?: boolean;
  source: string;
};

export type EmailDetectionResult = {
  allowed: boolean;
  universityId: UniversityId | null;
  domain: string;
  studentDomain: boolean;
  needsManualReview: boolean;
  message: string;
};

export const EMAIL_DOMAIN_RULES: EmailDomainRule[] = [
  {
    universityId: "aub",
    domains: ["mail.aub.edu", "aub.edu.lb"],
    studentDomains: ["mail.aub.edu"],
    source: "AUB IT mail access guide",
  },
  {
    universityId: "lau",
    domains: ["lau.edu", "lau.edu.lb"],
    studentDomains: ["lau.edu", "lau.edu.lb"],
    source: "LAU IT services for students",
  },
  {
    universityId: "ndu",
    domains: ["ndu.edu.lb"],
    studentDomains: ["ndu.edu.lb"],
    source: "NDU Office 365 and official contact pages",
  },
  {
    universityId: "bau",
    domains: ["student.bau.edu.lb", "bau.edu.lb"],
    studentDomains: ["student.bau.edu.lb"],
    source: "BAU IT service page",
  },
  {
    universityId: "usek",
    domains: ["net.usek.edu.lb", "usek.edu.lb"],
    studentDomains: ["net.usek.edu.lb"],
    source: "USEK IT user policy",
  },
  {
    universityId: "usj",
    domains: ["net.usj.edu.lb", "usj.edu.lb"],
    studentDomains: ["net.usj.edu.lb", "usj.edu.lb"],
    source: "USJ student IT and Eduroam page",
  },
  {
    universityId: "lu",
    domains: ["ul.edu.lb"],
    studentDomains: ["ul.edu.lb"],
    source: "Lebanese University email page and student guides",
  },
  {
    universityId: "aust",
    domains: ["aust.edu.lb"],
    studentDomains: [],
    needsManualReview: true,
    source: "AUST official website/self-evaluation report",
  },
  {
    universityId: "liu",
    domains: ["students.liu.edu.lb", "liu.edu.lb"],
    studentDomains: ["students.liu.edu.lb"],
    needsManualReview: true,
    source: "LIU official admissions and registration pages",
  },
];

function getEmailDomain(email: string): string {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return domain.replace(/\.+$/, "");
}

function findRuleByDomain(domain: string) {
  return EMAIL_DOMAIN_RULES.find((rule) =>
    rule.domains.some((allowedDomain) =>
      domain === allowedDomain || domain.endsWith(`.${allowedDomain}`),
    ),
  );
}

export function detectUniversityFromEmail(email: string): EmailDetectionResult {
  const domain = getEmailDomain(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
    return {
      allowed: false,
      universityId: null,
      domain,
      studentDomain: false,
      needsManualReview: false,
      message: "Enter a valid university email address.",
    };
  }

  const rule = findRuleByDomain(domain);
  if (!rule) {
    return {
      allowed: false,
      universityId: null,
      domain,
      studentDomain: false,
      needsManualReview: false,
      message: "Use an official university email for one of the supported Lebanese universities.",
    };
  }

  const studentDomain = rule.studentDomains.some((allowedDomain) =>
    domain === allowedDomain || domain.endsWith(`.${allowedDomain}`),
  );
  const university = getUniversityById(rule.universityId);

  return {
    allowed: true,
    universityId: rule.universityId,
    domain,
    studentDomain,
    needsManualReview: Boolean(rule.needsManualReview && !studentDomain),
    message: studentDomain
      ? `Detected ${university.shortName} from @${domain}.`
      : `Detected ${university.shortName}. This domain is official, but may need manual student verification.`,
  };
}

export function getUniversityEmailRule(universityId: string) {
  const normalizedId = getUniversityById(universityId).id;
  return EMAIL_DOMAIN_RULES.find((rule) => rule.universityId === normalizedId);
}
