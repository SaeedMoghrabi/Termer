const UNIVERSITIES = [
  {
    id: "aub",
    shortName: "AUB",
    name: "American University of Beirut",
    availability: "live",
    sourceUrl: "https://sturegss.aub.edu.lb/StudentRegistrationSsb",
    note: "Public Banner registration feed verified.",
  },
  {
    id: "lau",
    shortName: "LAU",
    name: "Lebanese American University",
    availability: "live",
    sourceUrl: "https://banweb.lau.edu.lb/prod/bwckschd.p_disp_dyn_sched",
    note: "Public dynamic schedule page verified.",
  },
  {
    id: "usek",
    shortName: "USEK",
    name: "Holy Spirit University of Kaslik",
    availability: "live",
    sourceUrl: "https://banner-reg.usek.edu.lb/StudentRegistrationSsb",
    note: "Public Banner class-search endpoints verified.",
  },
  {
    id: "bau",
    shortName: "BAU",
    name: "Beirut Arab University",
    availability: "live",
    sourceUrl: "https://mis.bau.edu.lb/web/v15/CourseOffering.aspx",
    note: "Public course offering grid verified.",
  },
  {
    id: "ndu",
    shortName: "NDU",
    name: "Notre Dame University-Louaize",
    availability: "live",
    sourceUrl: "https://sis.ndu.edu.lb/advreg/bin/schedoff.asp",
    note: "Public course offering search page verified.",
  },
  {
    id: "aust",
    shortName: "AUST",
    name: "American University of Science and Technology",
    availability: "partial",
    sourceUrl: "https://foe.aust.edu.lb/administrative/reg.php",
    note: "Official public course-offering checker and program-plan pages verified.",
  },
  {
    id: "usj",
    shortName: "USJ",
    name: "Universite Saint-Joseph de Beyrouth",
    availability: "partial",
    sourceUrl: "https://www.usj.edu.lb/catalogues/24-25.php",
    note: "Official public program catalog PDFs and timetable pages verified.",
  },
  {
    id: "lu",
    shortName: "LU",
    name: "Lebanese University",
    availability: "partial",
    sourceUrl: "https://ft.ul.edu.lb/schedule.php",
    note: "Public faculty course directories verified; official public schedule generators are still returning empty or broken outputs, with local official timetable imports supported as a fallback.",
  },
  {
    id: "liu",
    shortName: "LIU",
    name: "Lebanese International University",
    availability: "partial",
    sourceUrl: "https://syslb.liu.edu.lb/syslbdatadir/Documents/09_University_Catalog.pdf",
    note: "Official university catalog and admissions systems verified; no public timetable feed has been discovered yet, with local official timetable imports supported as a fallback.",
  },
];

function getUniversityConfig(universityId) {
  return UNIVERSITIES.find((university) => university.id === universityId) ?? null;
}

module.exports = {
  UNIVERSITIES,
  getUniversityConfig,
};
