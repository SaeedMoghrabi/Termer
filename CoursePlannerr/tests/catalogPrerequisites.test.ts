import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  getAttributeOptionsForTerm,
  getCoursesForTerm,
  getTermsForUniversity,
  getUniversitiesResponse,
  reloadCatalogCache,
} = require("../../catalogStore.cjs");

test("supplemental prerequisites fill AUB CMPS 214 and CMPS 215 across terms", () => {
  reloadCatalogCache();
  const [term] = getTermsForUniversity("aub");
  assert.ok(term?.code, "AUB should expose at least one term");

  const cmps214 = getCoursesForTerm({
    universityId: "aub",
    termId: term.code,
    search: "CMPS 214",
  })[0];
  const cmps215 = getCoursesForTerm({
    universityId: "aub",
    termId: term.code,
    search: "CMPS 215",
  })[0];

  assert.match(cmps214?.prerequisites ?? "", /CMPS 211/);
  assert.match(cmps214?.prerequisites ?? "", /CMPS 202/);
  assert.match(cmps215?.prerequisites ?? "", /CMPS 214/);
});

test("Banner prerequisite backfill fills AUB and USEK beyond manual CS fallbacks", () => {
  reloadCatalogCache();

  const aubBiol202 = getTermsForUniversity("aub")
    .flatMap((term: any) => getCoursesForTerm({ universityId: "aub", termId: term.code, search: "BIOL 202" }))
    .find((course: any) => course.code === "BIOL 202");
  assert.match(aubBiol202?.prerequisites ?? "", /BIOL 201/i);

  const usekCsc315 = getTermsForUniversity("usek")
    .flatMap((term: any) => getCoursesForTerm({ universityId: "usek", termId: term.code, search: "CSC 315" }))
    .find((course: any) => course.code === "CSC 315");
  assert.match(usekCsc315?.prerequisites ?? "", /CSC 211.*CSC 314/i);
});

test("supplemental prerequisite sources fill non-AUB curriculum gaps", () => {
  reloadCatalogCache();

  const expectations = [
    { universityId: "lau", search: "CSC 245", code: "CSC 245", expected: /CSC 243.*CSC 243B/i },
    { universityId: "lau", search: "CSC 326", code: "CSC 326", expected: /CSC 245.*CSC 245B.*CSC 320/i },
    { universityId: "bau", search: "CMPS 242", code: "CMPS 242", expected: /CMPS 241/i },
    { universityId: "bau", search: "CMPS 455", code: "CMPS 455", expected: /CMPS 447/i },
    { universityId: "liu", search: "CSCI 300", code: "CSCI 300", expected: /CSCI 250L.*CSCI 250/i },
    { universityId: "liu", search: "CSCI 378", code: "CSCI 378", expected: /CSCI 300/i },
    { universityId: "usek", search: "CSC 315", code: "CSC 315", expected: /CSC 211.*CSC 314/i },
    { universityId: "usek", search: "CSC 436", code: "CSC 436", expected: /CSC 360.*INF 360.*CSC 343/i },
  ];

  expectations.forEach(({ universityId, search, code, expected }) => {
    const terms = getTermsForUniversity(universityId);
    assert.ok(terms.length > 0, `${universityId} should expose at least one term`);
    const course = terms
      .flatMap((term: any) => getCoursesForTerm({ universityId, termId: term.code, search }))
      .find((entry: any) => entry.code === code);
    assert.ok(course, `${universityId} ${code} should be visible in the catalog`);
    assert.match(course.prerequisites ?? "", expected, `${universityId} ${code} should have supplemental prerequisites`);
  });

});

test("catalog attributes are exposed per active university term and searchable", () => {
  reloadCatalogCache();
  const [term] = getTermsForUniversity("aub");
  assert.ok(term?.code, "AUB should expose at least one term");

  const attributes = getAttributeOptionsForTerm({
    universityId: "aub",
    termId: term.code,
  });
  const quantitativeThought = attributes.find((attribute: any) =>
    String(attribute.label).toLowerCase() === "quantitative thought",
  );

  assert.ok(quantitativeThought, "AUB should expose Quantitative Thought from the current catalog snapshot");
  assert.ok(quantitativeThought.count > 0);

  const matches = getCoursesForTerm({
    universityId: "aub",
    termId: term.code,
    search: "Quantitative Thought",
  });

  assert.ok(matches.length > 0, "attribute text should be searchable like course code/title/professor");
  assert.ok(matches.every((course: any) =>
    Array.isArray(course.attributes)
    && course.attributes.some((attribute: string) => /quantitative thought/i.test(attribute)),
  ));
});

test("catalog sections expose linked CRNs for Banner and inferred lecture-lab pairs", () => {
  reloadCatalogCache();

  const aubSpring = getTermsForUniversity("aub").find((term: any) => term.source_code === "202620");
  assert.ok(aubSpring?.code, "AUB Spring 2025-2026 should be available in the catalog snapshot");
  const aubLecture = getCoursesForTerm({
    universityId: "aub",
    termId: aubSpring.code,
    search: "CMPS 201",
  }).find((course: any) => course.crn === "20802");

  assert.ok(aubLecture?.is_section_linked, "AUB Banner-linked lectures should stay marked as linked");
  assert.deepEqual(
    [...(aubLecture.linked_courses ?? [])].sort(),
    ["20798", "20799"],
    "AUB CMPS 201 L1 should expose its linked lab CRNs",
  );

  const bauSpring = getTermsForUniversity("bau").find((term: any) => term.source_code === "202620");
  assert.ok(bauSpring?.code, "BAU Spring 2025/2026 should be available in the catalog snapshot");
  const bauLecture = getCoursesForTerm({
    universityId: "bau",
    termId: bauSpring.code,
    search: "BCHM 215",
  }).find((course: any) => course.crn === "20887");

  assert.ok(bauLecture?.is_section_linked, "BAU inferred lecture-lab pairs should be marked as linked");
  assert.deepEqual(
    [...(bauLecture.linked_courses ?? [])].sort(),
    ["20895", "21190"],
  );

  const lauSpring = getTermsForUniversity("lau").find((term: any) => term.source_code === "202620");
  assert.ok(lauSpring?.code, "LAU Spring 2025-2026 should be available in the catalog snapshot");
  const lauLecture = getCoursesForTerm({
    universityId: "lau",
    termId: lauSpring.code,
    search: "CSC 243",
  }).find((course: any) => course.crn === "20663");

  assert.ok(lauLecture?.is_section_linked, "LAU suffixed lab courses should link back to their lecture");
  assert.deepEqual(
    [...(lauLecture.linked_courses ?? [])].sort(),
    ["20665", "20666"],
    "LAU CSC 243 Beirut lecture should expose both linked CSC 243B lab options",
  );

  const austTerm = getTermsForUniversity("aust")[0];
  const austLecture = getCoursesForTerm({
    universityId: "aust",
    termId: austTerm.code,
    search: "MIS 305",
  }).find((course: any) => course.crn === "AUST-MIS305");

  assert.deepEqual(
    austLecture?.linked_courses,
    ["AUST-MIS305L"],
    "AUST catalog-only lecture/lab companions should be linked",
  );

  const liuTerm = getTermsForUniversity("liu")[0];
  const liuLecture = getCoursesForTerm({
    universityId: "liu",
    termId: liuTerm.code,
    search: "CSCI 250",
  }).find((course: any) => course.crn === "LIU-CSCI250");

  assert.deepEqual(
    liuLecture?.linked_courses,
    ["LIU-CSCI250L"],
    "LIU catalog-only lecture/lab companions should be linked",
  );
});

test("linked CRNs are term-local and reciprocal across every university catalog", () => {
  reloadCatalogCache();

  const linkedCountsByUniversity = new Map<string, number>();
  const problems: string[] = [];

  getUniversitiesResponse().forEach((university: any) => {
    getTermsForUniversity(university.id).forEach((term: any) => {
      const courses = getCoursesForTerm({ universityId: university.id, termId: term.code });
      const byCrn = new Map(courses.map((course: any) => [String(course.crn), course]));

      courses.forEach((course: any) => {
        const linkedCrns = Array.isArray(course.linked_courses) ? course.linked_courses.map(String) : [];
        if (linkedCrns.length) {
          linkedCountsByUniversity.set(
            university.id,
            (linkedCountsByUniversity.get(university.id) ?? 0) + linkedCrns.length,
          );
        }

        linkedCrns.forEach((linkedCrn: string) => {
          const linkedCourse = byCrn.get(linkedCrn);
          if (!linkedCourse) {
            problems.push(`${university.id} ${term.code}: ${course.crn} links missing CRN ${linkedCrn}`);
            return;
          }

          const reciprocalCrns = Array.isArray(linkedCourse.linked_courses)
            ? linkedCourse.linked_courses.map(String)
            : [];
          if (!reciprocalCrns.includes(String(course.crn))) {
            problems.push(`${university.id} ${term.code}: ${course.crn} -> ${linkedCrn} is not reciprocal`);
          }
        });
      });
    });
  });

  assert.deepEqual(problems, []);
  assert.ok((linkedCountsByUniversity.get("aub") ?? 0) > 0, "AUB should expose linked sections across its terms");
  assert.ok((linkedCountsByUniversity.get("lau") ?? 0) > 0, "LAU should expose inferred linked sections across its terms");
  assert.ok((linkedCountsByUniversity.get("bau") ?? 0) > 0, "BAU should expose inferred linked sections across its terms");
  assert.ok((linkedCountsByUniversity.get("aust") ?? 0) > 0, "AUST should expose inferred catalog lecture/lab links");
  assert.ok((linkedCountsByUniversity.get("liu") ?? 0) > 0, "LIU should expose inferred catalog lecture/lab links");
});
