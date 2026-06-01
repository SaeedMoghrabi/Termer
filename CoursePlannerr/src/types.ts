export type Day = 'M' | 'T' | 'W' | 'R' | 'F' | 'S';

export type Meeting = {
  days: Day[]; // e.g. ['M','W']
  start: string; // 'HH:MM' 24h
  end: string; // 'HH:MM' 24h
  location?: string;
  type?: string;
};

export type Course = {
  id: string; // stable id, e.g. 'CMPS271-1'
  universityId: string;
  universityName: string;
  termId?: string;
  crn: string;
  code: string; // e.g. 'CMPS 271'
  department: string;
  courseNumber: string;
  title: string;
  instructor: string;
  professorId?: string;
  reviewDepartment?: string;
  campus: string;
  section: string;
  credits: number;
  capacity: { enrolled: number; limit: number };
  attributes: string[];
  prerequisites?: string;
  restrictions?: string;
  difficulty: number; // 1..5 (demo)
  workload: number; // 1..5 (demo)
  meetings: Meeting[];
  // Linking fields (from Banner isSectionLinked / linkIdentifier)
  isSectionLinked?: boolean;
  linkIdentifier?: string | null;
  linkedCourses?: string[];
  scheduleType?: string; // e.g. 'Lecture', 'Lab', 'Recitation'
  subjectCourse?: string; // e.g. 'CMPS201' — used to scope linked-section lookup
  hasPublishedMeetings?: boolean;
  isCatalogOnly?: boolean;
  sourceScheduleNote?: string;
  description?: string;
  academicLevel?: string;
};
