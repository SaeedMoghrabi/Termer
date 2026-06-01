const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const BASE_URL = 'https://sturegss.aub.edu.lb/StudentRegistrationSsb';
const PAGE_SIZE = 500;
const TERM_CODE = '2026'; // Spring 2025-2026

// ─── Supabase client ───────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ─── Navigate to the search page for the term ────────────────────────────────
async function navigateToTerm(context) {
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.goto(
    `${BASE_URL}/ssb/term/termSelection?mode=search`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await page.waitForTimeout(2000);

  await page.evaluate((termValue) => {
    const select = document.querySelector('#txt_term');
    if (select) {
      select.value = termValue;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const $s = window.$ ? window.$('#txt_term') : null;
      if ($s && $s.select2) $s.select2('val', termValue);
    }
  }, TERM_CODE);

  await page.waitForTimeout(1000);

  const [popup] = await Promise.all([
    new Promise(resolve => {
      context.once('page', resolve);
      setTimeout(() => resolve(null), 2000);
    }),
    page.click('#term-go')
  ]);

  let searchPage = page;
  if (popup) {
    searchPage = popup;
    await searchPage.waitForLoadState('domcontentloaded');
  } else {
    try { await page.waitForNavigation({ timeout: 3000 }); } catch (_) {}
  }

  await searchPage.waitForTimeout(2000);
  return searchPage;
}

// ─── Fetch all subjects ───────────────────────────────────────────────────────
async function getAllSubjects(page) {
  const response = await page.evaluate(async (term) => {
    const res = await fetch(
      `/StudentRegistrationSsb/ssb/classSearch/get_subject?term=${term}&offset=1&max=500`,
      { headers: { 'Accept': 'application/json' } }
    );
    return res.json();
  }, TERM_CODE);

  if (!response || response.length === 0) return [];
  return response;
}

// ─── Fetch all courses for one subject (with pagination) ─────────────────────
async function fetchAllCoursesForSubject(searchPage, subjectCode) {
  try {
    const courseNumberVisible = await searchPage.isVisible('#txt_courseNumber');
    if (!courseNumberVisible) {
      await searchPage.click('#search-again-button, button:has-text("Search Again"), a:has-text("Search Again")', { force: true, timeout: 10000 });
      await searchPage.waitForTimeout(1000);
    }

    await searchPage.waitForSelector('#txt_courseNumber', { state: 'visible', timeout: 10000 });

    await searchPage.evaluate((code) => {
      const input = document.querySelector('#txt_subject, input[name="txt_subject"]');
      if (input) {
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, subjectCode);

    await searchPage.fill('#txt_courseNumber', '');
    await searchPage.waitForTimeout(300);
    await searchPage.keyboard.press('Escape');
    await searchPage.waitForTimeout(200);
    await searchPage.click('body');
    await searchPage.waitForTimeout(200);

    const [firstResponse] = await Promise.all([
      searchPage.waitForResponse(
        resp => resp.url().includes('searchResults') && resp.status() === 200,
        { timeout: 20000 }
      ),
      searchPage.click('#search-go', { force: true })
    ]);

    const firstData = await firstResponse.json();
    const totalCount = firstData.totalCount || 0;
    if (totalCount === 0) return [];

    let allSections = [...(firstData.data || [])];

    if (totalCount > allSections.length) {
      const remainingData = await searchPage.evaluate(async ({ term, subject, pageSize, totalCount, alreadyFetched }) => {
        const results = [];
        let offset = alreadyFetched + 1;
        while (offset <= totalCount) {
          const res = await fetch(
            `/StudentRegistrationSsb/ssb/searchResults/searchResults?term=${term}&subject=${subject}&offset=${offset}&pageMaxSize=${pageSize}`,
            { headers: { 'Accept': 'application/json' } }
          );
          const data = await res.json();
          if (!data.data || data.data.length === 0) break;
          results.push(...data.data);
          offset += data.data.length;
        }
        return results;
      }, { term: TERM_CODE, subject: subjectCode, pageSize: PAGE_SIZE, totalCount, alreadyFetched: allSections.length });

      allSections = [...allSections, ...remainingData];
    }

    const courses = [];
    for (const c of allSections) {
      const instructors = (c.faculty || []).map(f => f.displayName).join(', ') || 'TBA';
      for (const m of c.meetingsFaculty || []) {
        const mt = m.meetingTime;
        if (!mt) continue;
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].filter(d => mt[d]);
        courses.push({
          crn: c.courseReferenceNumber,
          courseNumber: c.courseNumber,           // e.g. "271"
          code: `${c.subject} ${c.courseNumber}`, // e.g. "CMPS 271"
          section: c.sequenceNumber,
          title: c.courseTitle,
          credits: c.creditHours,
          instructors,
          days: days.join(', ') || 'TBA',
          time: mt.beginTime && mt.endTime ? `${mt.beginTime} - ${mt.endTime}` : 'TBA',
          location: `${mt.building || ''} ${mt.room || ''}`.trim() || 'TBA',
          seatsAvailable: c.seatsAvailable,
          maxEnrollment: c.maximumEnrollment,
          status: c.seatsAvailable > 0 ? 'Open' : 'Full',
          scheduleType: c.scheduleTypeDescription || 'N/A',
          subjectCode: c.subject,
        });
      }
    }

    return courses;
  } catch (err) {
    console.error(`  ⚠ Error fetching ${subjectCode}:`, err.message);
    return [];
  }
}

// ─── Professor cache ──────────────────────────────────────────────────────────
const professorCache = {};

async function getOrCreateProfessor(fullName) {
  if (fullName === 'TBA') return null;
  if (professorCache[fullName] !== undefined) return professorCache[fullName];

  const { data: existing } = await supabase
    .from('professors')
    .select('id')
    .eq('full_name', fullName)
    .single();

  if (existing) {
    professorCache[fullName] = existing.id;
    return existing.id;
  }

  const { data: inserted, error } = await supabase
    .from('professors')
    .insert({ full_name: fullName })
    .select('id')
    .single();

  if (error) {
    professorCache[fullName] = null;
    return null;
  }

  professorCache[fullName] = inserted.id;
  return inserted.id;
}

// ─── Save courses to Supabase ─────────────────────────────────────────────────
async function saveCoursesToDB(courses) {
  let saved = 0;

  for (const course of courses) {
    try {
      const professorId = await getOrCreateProfessor(course.instructors);

      const { error } = await supabase
        .from('courses')
        .upsert({
          crn: course.crn,
          course_number: course.courseNumber,
          title: course.title,
          department: course.subjectCode,
          credits: course.credits,
          schedule: {
            days: course.days,
            time: course.time,
            location: course.location,
            section: course.section,
            type: course.scheduleType
          },
          professor_id: professorId,
          semester: TERM_CODE,
          capacity: course.maxEnrollment,
          enrolled_count: course.maxEnrollment - course.seatsAvailable
        }, { onConflict: 'crn' });

      if (error) {
        console.error(`  ⚠ Course error (CRN ${course.crn}):`, error.message);
      } else {
        saved++;
      }
    } catch (err) {
      console.error(`  ⚠ Unexpected error for CRN ${course.crn}:`, err.message);
    }
  }

  return saved;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`   AUB Fetcher — Spring 2025-2026 only`);
  console.log(`${'='.repeat(70)}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.navigator.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  let totalFetched = 0;
  let totalSaved = 0;

  try {
    const searchPage = await navigateToTerm(context);
    const subjects = await getAllSubjects(searchPage);
    console.log(`📋 ${subjects.length} subjects found for Spring 2025-2026\n`);

    for (let i = 0; i < subjects.length; i++) {
      const { code, description } = subjects[i];
      process.stdout.write(`[${i + 1}/${subjects.length}] ${code} (${description})... `);

      const courses = await fetchAllCoursesForSubject(searchPage, code);

      if (courses.length === 0) {
        console.log('no courses.');
        continue;
      }

      const saved = await saveCoursesToDB(courses);
      totalFetched += courses.length;
      totalSaved += saved;
      console.log(`${courses.length} fetched, ${saved} saved.`);

      await searchPage.waitForTimeout(300);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Done! ${totalFetched} fetched, ${totalSaved} saved to Supabase.`);
    console.log(`${'='.repeat(70)}\n`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
  } finally {
    await browser.close();
  }
})();