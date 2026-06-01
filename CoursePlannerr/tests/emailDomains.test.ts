import test from "node:test";
import assert from "node:assert/strict";
import { detectUniversityFromEmail } from "../src/config/emailDomains.ts";

test("detects student email domains and routes to the matching university", () => {
  assert.equal(detectUniversityFromEmail("abc123@mail.aub.edu").universityId, "aub");
  assert.equal(detectUniversityFromEmail("student@net.usek.edu.lb").universityId, "usek");
  assert.equal(detectUniversityFromEmail("person@net.usj.edu.lb").universityId, "usj");
  assert.equal(detectUniversityFromEmail("xyz123@student.bau.edu.lb").universityId, "bau");
  assert.equal(detectUniversityFromEmail("student@ul.edu.lb").universityId, "lu");
  assert.equal(detectUniversityFromEmail("student@liu.edu.lb").universityId, "liu");
});

test("rejects non-university emails", () => {
  const result = detectUniversityFromEmail("student@gmail.com");
  assert.equal(result.allowed, false);
  assert.equal(result.universityId, null);
});

test("marks official but unverified student-domain workarounds", () => {
  const aust = detectUniversityFromEmail("student@aust.edu.lb");
  assert.equal(aust.allowed, true);
  assert.equal(aust.universityId, "aust");
  assert.equal(aust.needsManualReview, true);
});
