const UNIVERSITIES = [
  { id: "aub", name: "AUB", course: "CMPS 201", attribute: "Human Values", major: "computer science" },
  { id: "lau", name: "LAU", course: "CSC 243", attribute: "communication", major: "business" },
  { id: "bau", name: "BAU", course: "CMPS 241", attribute: "humanities", major: "computer science" },
  { id: "ndu", name: "NDU", course: "CSC 215", attribute: "ethics", major: "computer science" },
  { id: "usek", name: "USEK", course: "CSC 210", attribute: "general education", major: "computer science" },
  { id: "usj", name: "USJ", course: "INF 101", attribute: "communication", major: "informatique" },
  { id: "lu", name: "LU", course: "INFO 101", attribute: "technology", major: "informatics" },
  { id: "aust", name: "AUST", course: "CSI 200", attribute: "science", major: "computer science" },
  { id: "liu", name: "LIU", course: "CSCI 250", attribute: "math", major: "computer science" },
];

const QUESTION_TEMPLATES = [
  { category: "schedule", text: "Build me a conflict-free schedule for {course} and two easy electives." },
  { category: "schedule", text: "Create a no-Friday morning schedule for {course}." },
  { category: "schedule", text: "Can you optimize my current schedule so the gaps are smaller?" },
  { category: "schedule", text: "Make schedule 2 from my saved courses and avoid afternoon classes." },
  { category: "schedule", text: "Which section of {course} should I add if I prefer open seats?" },
  { category: "major", text: "Create a first semester plan for a {major} student at {name}." },
  { category: "major", text: "Create a 2nd semester schedule for a {major} student at {name}." },
  { category: "major", text: "Create a 3rd semester schedule for a {major} student at {name}." },
  { category: "major", text: "What should a {major} student take next semester?" },
  { category: "major", text: "Can you explain what still needs advisor approval for my {major} plan?" },
  { category: "attribute", text: "Find courses with the {attribute} attribute." },
  { category: "attribute", text: "Show open sections that satisfy {attribute}." },
  { category: "attribute", text: "What are the current attribute types for {name}?" },
  { category: "attribute", text: "Can {course} count toward {attribute}?" },
  { category: "attribute", text: "How do I search by attribute in the right panel?" },
  { category: "prerequisite", text: "What are the prerequisites for {course}?" },
  { category: "prerequisite", text: "Can I take {course} before finishing its prerequisite?" },
  { category: "prerequisite", text: "Explain the prerequisite chain for {course}." },
  { category: "prerequisite", text: "Does {course} have a lab or recitation linked to it?" },
  { category: "prerequisite", text: "What should I take before {course} if I am behind?" },
  { category: "website", text: "Where do I find my CRNs?" },
  { category: "website", text: "How do I export my schedule as PDF?" },
  { category: "website", text: "How do I compare schedule 1 and schedule 2?" },
  { category: "website", text: "How do I save a course without adding it yet?" },
  { category: "website", text: "How do I block time for work or commute?" },
  { category: "website", text: "How do I use Empty Classes for a specific campus?" },
  { category: "website", text: "How do I upload a syllabus and what happens after upload?" },
  { category: "website", text: "What happens if I change from {name} to another university?" },
  { category: "website", text: "Why does a course disappear when I switch term?" },
  { category: "website", text: "How do I search by professor, CRN, day, and open seats?" },
  { category: "reviews", text: "How do I write a review for {course}?" },
  { category: "reviews", text: "Can you summarize reviews for the professor of {course}?" },
  { category: "gpa", text: "Does the GPA calculator use the {name} grading system?" },
  { category: "gpa", text: "Can you help me calculate the grade I need on the final?" },
  { category: "account", text: "Why do I need a university email to sign in?" },
  { category: "account", text: "Where is my schedule stored after I sign in?" },
];

function fillTemplate(template, university, index) {
  return {
    id: `q-${String(index + 1).padStart(4, "0")}`,
    category: template.category,
    universityId: university.id,
    question: template.text
      .replaceAll("{name}", university.name)
      .replaceAll("{course}", university.course)
      .replaceAll("{attribute}", university.attribute)
      .replaceAll("{major}", university.major),
  };
}

function buildStudentQuestionCorpus(targetCount = 1000) {
  const questions = [];
  let index = 0;
  while (questions.length < targetCount) {
    const university = UNIVERSITIES[index % UNIVERSITIES.length];
    const template = QUESTION_TEMPLATES[Math.floor(index / UNIVERSITIES.length) % QUESTION_TEMPLATES.length];
    questions.push(fillTemplate(template, university, index));
    index += 1;
  }
  return questions;
}

module.exports = {
  UNIVERSITIES,
  QUESTION_TEMPLATES,
  buildStudentQuestionCorpus,
};
