import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import type { Course } from '../types.ts';
import { TopNav } from '../components/TopNav.tsx';
import { API_ROOT } from '../config/runtime.ts';
import {
  buildClassroomAvailability,
  type ClassroomAvailability,
} from '../utils/classroomAvailability.ts';
import { mapApiCoursesToCourses } from '../utils/courseApi.ts';
import { type FreeSlot, timeToMinutes, type WeekdayKey } from '../utils/schedule.ts';
import {
  UNIVERSITY_OPTIONS,
  getUniversityById,
  type UniversityId,
  type UniversityOption,
} from '../config/universities.ts';
import { getUniversityCampuses } from '../config/campuses.ts';
import { fetchCourses, fetchTerms, fetchUniversities } from '../utils/catalogApi.ts';
import { useCatalogStatus } from '../hooks/useCatalogStatus.ts';
import { useSessionAccess } from '../hooks/useSessionAccess.ts';
import {
  getStoredTermId,
  getStoredUniversityId,
  setStoredTermId,
  setStoredUniversityId,
} from '../utils/plannerPreferences.ts';

const CATALOG_POLL_INTERVAL_MS = Number(import.meta.env.VITE_CATALOG_POLL_INTERVAL_MS ?? 300_000);
const START_OF_DAY = '08:00';
const END_OF_DAY = '21:00';
const ROOM_SORTER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

type EmptyClassesTermOption = {
  id: string;
  label: string;
  isCurrent?: boolean;
};

type RoomStatus = {
  tone: 'free' | 'busy';
  headline: string;
  detail: string;
};

function getTodayKey(now: Date): WeekdayKey {
  const day = now.getDay();
  switch (day) {
    case 1: return 'Mon';
    case 2: return 'Tue';
    case 3: return 'Wed';
    case 4: return 'Thu';
    case 5: return 'Fri';
    case 6: return 'Sat';
    default: return 'Mon';
  }
}

function formatClock(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const normalizedHours = Number.isFinite(hours) ? hours : 0;
  const normalizedMinutes = Number.isFinite(minutes) ? minutes : 0;
  const h12 = normalizedHours % 12 || 12;
  const period = normalizedHours >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(normalizedMinutes).padStart(2, '0')} ${period}`;
}

function formatDurationMinutes(durationMinutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(durationMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours && minutes) {
    return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${minutes} mins`;
  }
  if (hours) {
    return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
  }
  return `${minutes} mins`;
}

function getSlotDuration(slot: FreeSlot): number {
  const start = timeToMinutes(slot.start) ?? 0;
  const end = timeToMinutes(slot.end) ?? start;
  return Math.max(0, end - start);
}

function isAllDaySlot(slot: FreeSlot | undefined): boolean {
  return Boolean(slot && slot.start === START_OF_DAY && slot.end === END_OF_DAY);
}

function getRoomStatus(
  room: ClassroomAvailability,
  day: WeekdayKey,
  currentTime: string,
): RoomStatus {
  const nowMinutes = timeToMinutes(currentTime) ?? 0;
  const dayEndMinutes = timeToMinutes(END_OF_DAY) ?? (21 * 60);
  const freeSlots = room.freeSlotsByDay[day] ?? [];

  if (freeSlots.length === 1 && isAllDaySlot(freeSlots[0])) {
    return {
      tone: 'free',
      headline: 'Free all day',
      detail: `${formatClock(START_OF_DAY)} - ${formatClock(END_OF_DAY)}`,
    };
  }

  const currentFreeSlot = freeSlots.find((slot) => {
    const start = timeToMinutes(slot.start) ?? 0;
    const end = timeToMinutes(slot.end) ?? 0;
    return nowMinutes >= start && nowMinutes < end;
  });

  if (currentFreeSlot) {
    const slotEnd = timeToMinutes(currentFreeSlot.end) ?? dayEndMinutes;
    if (slotEnd >= dayEndMinutes) {
      return {
        tone: 'free',
        headline: 'Free for the rest of the day',
        detail: `Until ${formatClock(currentFreeSlot.end)}`,
      };
    }

    return {
      tone: 'free',
      headline: `Free until ${formatClock(currentFreeSlot.end)}`,
      detail: `${formatDurationMinutes(slotEnd - nowMinutes)} left`,
    };
  }

  const nextFreeSlot = freeSlots.find((slot) => {
    const end = timeToMinutes(slot.end) ?? 0;
    return end > nowMinutes;
  });

  if (nextFreeSlot) {
    const slotStart = timeToMinutes(nextFreeSlot.start) ?? 0;
    const slotEnd = timeToMinutes(nextFreeSlot.end) ?? dayEndMinutes;

    if (nowMinutes < slotStart) {
      if (slotEnd >= dayEndMinutes) {
        return {
          tone: 'free',
          headline: `Free from ${formatClock(nextFreeSlot.start)}`,
          detail: 'For the rest of the day',
        };
      }

      return {
        tone: 'free',
        headline: `${formatClock(nextFreeSlot.start)} - ${formatClock(nextFreeSlot.end)}`,
        detail: `${formatDurationMinutes(slotEnd - slotStart)} open window`,
      };
    }

    if (slotEnd >= dayEndMinutes) {
      return {
        tone: 'busy',
        headline: `Free at ${formatClock(nextFreeSlot.start)}`,
        detail: 'For the rest of the day',
      };
    }

    return {
      tone: 'busy',
      headline: `Free at ${formatClock(nextFreeSlot.start)}`,
      detail: `For ${formatDurationMinutes(slotEnd - slotStart)}`,
    };
  }

  return {
    tone: 'busy',
    headline: 'Occupied for the rest of the day',
    detail: 'No open window remains today',
  };
}

function formatCatalogStatus(university: UniversityOption, fallbackText: string): string {
  if (!university.updatedAt) {
    return fallbackText;
  }

  const updated = new Date(university.updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return fallbackText;
  }

  return `Updated ${updated.toLocaleString()} | ${fallbackText}`;
}

function isCatalogPlaceholderTerm(term: EmptyClassesTermOption | undefined): boolean {
  return /^catalog\b/i.test(String(term?.label ?? '').trim());
}

function resolveEmptyClassesTermId(
  universityId: string,
  terms: EmptyClassesTermOption[],
  currentSemesterId: string,
): string {
  const explicitSelection = terms.find((term) => term.id === currentSemesterId)?.id;
  if (explicitSelection) {
    return explicitSelection;
  }

  const storedTermId = getStoredTermId(universityId);
  const storedTerm = terms.find((term) => term.id === storedTermId);
  const currentTerm = terms.find((term) => term.isCurrent) ?? terms[0];

  if (storedTerm) {
    if (
      currentTerm
      && currentTerm.id !== storedTerm.id
      && isCatalogPlaceholderTerm(storedTerm)
      && !isCatalogPlaceholderTerm(currentTerm)
    ) {
      return currentTerm.id;
    }

    return storedTerm.id;
  }

  return currentTerm?.id ?? '';
}

export default function EmptyClasses() {
  const [universities, setUniversities] = useState<UniversityOption[]>(UNIVERSITY_OPTIONS);
  const [universityId, setUniversityId] = useState(getStoredUniversityId());
  const { canChooseAnyUniversity, lockedUniversityId } = useSessionAccess();
  const [semesters, setSemesters] = useState<{ id: string; label: string }[]>([]);
  const [semesterId, setSemesterId] = useState('');
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [selectedCampus, setSelectedCampus] = useState('');
  const [buildingDraft, setBuildingDraft] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const catalogStatus = useCatalogStatus();
  const catalogStatusSequence = catalogStatus?.sequence ?? 0;
  const catalogStatusHydratedRef = useRef(false);
  const currentUniversity = useMemo(
    () => universities.find((university) => university.id === universityId)
      ?? getUniversityById(universityId),
    [universities, universityId],
  );
  const selectableUniversities = useMemo(
    () => universities,
    [universities],
  );

  const handleUniversityChange = useCallback((nextUniversityId: UniversityId) => {
    const resolvedUniversityId = !canChooseAnyUniversity && lockedUniversityId
      ? lockedUniversityId
      : getUniversityById(nextUniversityId).id;

    setStoredUniversityId(resolvedUniversityId);
    setUniversityId((currentUniversityId) =>
      currentUniversityId === resolvedUniversityId ? currentUniversityId : resolvedUniversityId,
    );
  }, [canChooseAnyUniversity, lockedUniversityId]);

  const semesterLabel = useMemo(
    () => semesters.find((semester) => semester.id === semesterId)?.label ?? 'Semester',
    [semesterId, semesters],
  );
  const lastUpdatedText = useMemo(
    () => formatCatalogStatus(
      currentUniversity,
      selectedBuilding
        ? `Viewing ${selectedCampus ? `${selectedCampus} • ` : ''}${selectedBuilding}`
        : selectedCampus
          ? `Viewing ${selectedCampus}`
          : currentUniversity.note,
    ),
    [currentUniversity, selectedBuilding, selectedCampus],
  );

  const loadUniversities = useCallback(() => {
    fetchUniversities()
      .then((data) => setUniversities(Array.isArray(data) && data.length ? data : UNIVERSITY_OPTIONS))
      .catch(() => setUniversities(UNIVERSITY_OPTIONS));
  }, []);

  useEffect(() => {
    loadUniversities();
    const timer = window.setInterval(loadUniversities, CATALOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadUniversities]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!lockedUniversityId || canChooseAnyUniversity) return;
    handleUniversityChange(lockedUniversityId);
  }, [canChooseAnyUniversity, handleUniversityChange, lockedUniversityId]);

  const loadTerms = useCallback(() => {
    setLoadingTerms(true);
    fetchTerms(universityId)
      .then((data) => {
        const formatted: EmptyClassesTermOption[] = Array.isArray(data)
          ? data.map((term: { code: string; description: string }) => ({
            id: term.code,
            label: term.description,
            isCurrent: Boolean((term as { is_current?: boolean }).is_current),
          }))
          : [];
        setSemesters(formatted);
        setSemesterId((currentSemesterId) => {
          return resolveEmptyClassesTermId(universityId, formatted, currentSemesterId);
        });
      })
      .catch(() => {
        setSemesters([]);
        setSemesterId('');
        setError('Could not load terms for that university.');
      })
      .finally(() => setLoadingTerms(false));
  }, [universityId]);

  useEffect(() => {
    setStoredUniversityId(universityId);
    loadTerms();
    const timer = window.setInterval(loadTerms, CATALOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadTerms, universityId]);

  useEffect(() => {
    if (!semesterId) return;
    setStoredTermId(universityId, semesterId);
  }, [universityId, semesterId]);

  const loadCourses = useCallback((resetSelection = false) => {
    if (!semesterId) {
      setAllCourses([]);
      return;
    }

    setLoadingCourses(true);
    setError(null);
    if (resetSelection) {
      setSelectedCampus('');
      setBuildingDraft('');
      setSelectedBuilding('');
    }

    fetchCourses(universityId, semesterId)
      .then((data) => setAllCourses(
        mapApiCoursesToCourses(data).filter((course) => course.universityId === universityId),
      ))
      .catch(() => {
        setAllCourses([]);
        setError('Could not load classrooms for that term.');
      })
      .finally(() => setLoadingCourses(false));
  }, [semesterId, universityId]);

  useEffect(() => {
    if (!semesterId) {
      setAllCourses([]);
      return;
    }

    loadCourses(true);
    const timer = window.setInterval(() => loadCourses(false), CATALOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadCourses, semesterId]);

  useEffect(() => {
    if (!catalogStatusSequence) return;
    if (!catalogStatusHydratedRef.current) {
      catalogStatusHydratedRef.current = true;
      return;
    }

    loadUniversities();
    loadTerms();
    if (semesterId) {
      loadCourses(false);
    }
  }, [catalogStatusSequence, loadCourses, loadTerms, loadUniversities, semesterId]);

  const roomAvailability = useMemo(
    () => buildClassroomAvailability(allCourses, {
      startOfDay: START_OF_DAY,
      endOfDay: END_OF_DAY,
      minGapMinutes: 15,
    }),
    [allCourses],
  );
  const timedCourseCount = useMemo(
    () => allCourses.filter((course) => (course.meetings ?? []).length > 0).length,
    [allCourses],
  );
  const locationMeetingCount = useMemo(
    () => allCourses.reduce((count, course) => (
      count
      + (course.meetings ?? []).filter((meeting) => {
        const location = String(meeting.location ?? '').trim();
        return Boolean(location) && !/^tba$/i.test(location);
      }).length
    ), 0),
    [allCourses],
  );

  const campusStats = useMemo(() => {
    const stats = new Map<string, { roomCount: number; buildingSet: Set<string> }>();

    roomAvailability.forEach((room) => {
      const current = stats.get(room.campus) ?? { roomCount: 0, buildingSet: new Set<string>() };
      current.roomCount += 1;
      current.buildingSet.add(room.building);
      stats.set(room.campus, current);
    });

    return new Map(
      [...stats.entries()].map(([campus, value]) => [
        campus,
        {
          roomCount: value.roomCount,
          buildingCount: value.buildingSet.size,
        },
      ]),
    );
  }, [roomAvailability]);

  const campusOptions = useMemo(() => (
    getUniversityCampuses(universityId, [...campusStats.keys()])
  ), [campusStats, universityId]);

  const buildingOptions = useMemo(() => (
    [...new Set(
      roomAvailability
        .filter((room) => room.campus === selectedCampus)
        .map((room) => room.building),
    )]
      .sort((left, right) => ROOM_SORTER.compare(left, right))
  ), [roomAvailability, selectedCampus]);

  useEffect(() => {
    if (selectedCampus && !campusOptions.some((campus) => campus.label === selectedCampus)) {
      setSelectedCampus('');
    }
    if (buildingDraft && !buildingOptions.includes(buildingDraft)) {
      setBuildingDraft('');
    }
    if (selectedBuilding && !buildingOptions.includes(selectedBuilding)) {
      setSelectedBuilding('');
    }
  }, [buildingDraft, buildingOptions, campusOptions, selectedBuilding, selectedCampus]);

  useEffect(() => {
    setBuildingDraft('');
    setSelectedBuilding('');
  }, [selectedCampus]);

  const today = useMemo(() => new Date(now), [now]);
  const todayKey = useMemo(() => getTodayKey(today), [today]);
  const currentTime = useMemo(
    () => `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`,
    [today],
  );
  const formattedNow = useMemo(
    () => today.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    [today],
  );

  const visibleRooms = useMemo(() => (
    roomAvailability
      .filter((room) => room.campus === selectedCampus && room.building === selectedBuilding)
      .sort((left, right) => ROOM_SORTER.compare(left.room, right.room))
  ), [roomAvailability, selectedBuilding, selectedCampus]);

  const roomCards = useMemo(() => (
    visibleRooms.map((room) => ({
      room,
      status: getRoomStatus(room, todayKey, currentTime),
    }))
  ), [currentTime, todayKey, visibleRooms]);

  const hasCatalogTerms = semesters.length > 0;
  const emptyClassesUnavailableMessage = useMemo(() => {
    if (currentUniversity.availability === 'unavailable') {
      return `${currentUniversity.name} does not currently have a verified university-wide public section feed, so Empty Classes cannot build campus, building, and room availability for it yet.`;
    }

    if (currentUniversity.availability === 'partial') {
      return `${currentUniversity.name} is only partially connected right now. The public course-offering source still does not expose a live term catalog from this environment, so Empty Classes cannot populate rooms yet.`;
    }

    return `${currentUniversity.name} does not currently expose any published terms in the loaded catalog, so Empty Classes has nothing to reverse into room availability right now.`;
  }, [currentUniversity]);

  const freeNowCount = roomCards.filter((entry) => entry.status.tone === 'free').length;
  const busyCount = roomCards.length - freeNowCount;
  const noRoomDataYet = !error
    && hasCatalogTerms
    && !loadingCourses
    && allCourses.length > 0
    && timedCourseCount > 0
    && roomAvailability.length === 0;

  return (
    <div className="emptyClassesShell">
      <TopNav
        appName="Termer"
        universityId={universityId}
        universities={universities}
        universityName={currentUniversity.name}
        semesterId={semesterId}
        semesters={semesters}
        semesterLabel={semesterLabel}
        lastUpdatedText={lastUpdatedText}
        onUniversityChange={handleUniversityChange}
        onSemesterChange={setSemesterId}
        scheduledCourses={[]}
        activePage="empty-classes"
        canChangeUniversity={canChooseAnyUniversity}
      />

      <main className="emptyClassesContent">
        <section className="emptyClassesHero">
          <div className="emptyClassesHero__copy">
            <div className="emptyClassesHero__eyebrow">
              <MeetingRoomOutlinedIcon fontSize="small" />
              Empty Classes
            </div>
            <h1 className="emptyClassesHero__title">Discover when each classroom opens up.</h1>
            <p className="emptyClassesHero__text">
              Pick your university, term, campus, and building, and we will reverse the course schedule into
              room-by-room open windows for today.
            </p>
          </div>

          <div className="emptyClassesFilters">
            <label className="emptyClassesField">
              <span>University</span>
              <select
                className="emptyClassesSelect"
                value={universityId}
                onChange={(event) => handleUniversityChange(event.target.value as UniversityId)}
              >
                {selectableUniversities.map((university) => (
                  <option
                    key={university.id}
                    value={university.id}
                    disabled={!canChooseAnyUniversity && university.id !== (lockedUniversityId ?? universityId)}
                  >
                    {university.shortName}
                  </option>
                ))}
              </select>
            </label>

            <label className="emptyClassesField">
              <span>Term</span>
              <select
                className="emptyClassesSelect"
                value={semesterId}
                onChange={(event) => setSemesterId(event.target.value)}
                disabled={loadingTerms || semesters.length === 0}
              >
                <option value="">
                  {loadingTerms
                    ? 'Loading terms...'
                    : semesters.length > 0
                      ? 'Select term'
                      : 'No terms available'}
                </option>
                {semesters.map((semester) => (
                  <option key={semester.id} value={semester.id}>
                    {semester.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="emptyClassesField">
              <span>Campus</span>
              <select
                className="emptyClassesSelect"
                value={selectedCampus}
                onChange={(event) => setSelectedCampus(event.target.value)}
                disabled={!semesterId || loadingCourses || campusOptions.length === 0}
              >
                <option value="">
                  {loadingCourses
                    ? 'Loading campuses...'
                    : campusOptions.length
                      ? 'Select campus'
                      : 'No campuses found'}
                </option>
                {campusOptions.map((campus) => {
                  const stats = campusStats.get(campus.label);
                  const suffix = stats?.buildingCount
                    ? ` (${stats.buildingCount} ${stats.buildingCount === 1 ? 'building' : 'buildings'})`
                    : '';

                  return (
                    <option key={campus.id} value={campus.label}>
                      {campus.label}{suffix}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="emptyClassesField">
              <span>Building</span>
              <select
                className="emptyClassesSelect"
                value={buildingDraft}
                onChange={(event) => setBuildingDraft(event.target.value)}
                disabled={!semesterId || !selectedCampus || loadingCourses || buildingOptions.length === 0}
              >
                <option value="">
                  {loadingCourses
                    ? 'Loading buildings...'
                    : !selectedCampus
                      ? 'Select campus first'
                    : buildingOptions.length
                      ? 'Select building'
                      : 'No classrooms found'}
                </option>
                {buildingOptions.map((building) => (
                  <option key={building} value={building}>
                    {building}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="emptyClassesButton"
              disabled={!selectedCampus || !buildingDraft}
              onClick={() => setSelectedBuilding(buildingDraft)}
            >
              Select
            </button>
          </div>
        </section>

        {selectedBuilding ? (
          <section className="emptyClassesSummary">
            <div className="emptyClassesStat">
              <span className="emptyClassesStat__label">Showing</span>
              <strong className="emptyClassesStat__value">{roomCards.length} rooms</strong>
              <span className="emptyClassesStat__hint">{selectedCampus} • {selectedBuilding}</span>
            </div>
            <div className="emptyClassesStat">
              <span className="emptyClassesStat__label">Free right now</span>
              <strong className="emptyClassesStat__value">{freeNowCount}</strong>
              <span className="emptyClassesStat__hint">{todayKey} at {formattedNow}</span>
            </div>
            <div className="emptyClassesStat">
              <span className="emptyClassesStat__label">Currently occupied</span>
              <strong className="emptyClassesStat__value">{busyCount}</strong>
              <span className="emptyClassesStat__hint">Based on today&apos;s section times</span>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className="emptyClassesState">
            <strong>Could not load classroom availability.</strong>
            <span>{error}</span>
          </section>
        ) : null}

        {!error && !hasCatalogTerms ? (
          <section className="emptyClassesState">
            <strong>Empty Classes is not live for {currentUniversity.shortName} yet.</strong>
            <span>{emptyClassesUnavailableMessage}</span>
          </section>
        ) : null}

        {noRoomDataYet ? (
          <section className="emptyClassesState">
            <strong>No room-level location data is published for this term yet.</strong>
            <span>
              {locationMeetingCount > 0
                ? `The latest fetched sections are loaded, but their room strings still cannot be reversed into campus/building availability from this source.`
                : `The latest fetched sections include timings, but not usable room/building strings, so Empty Classes cannot map free rooms for this term yet.`}
            </span>
          </section>
        ) : null}

        {!error && hasCatalogTerms && !selectedBuilding && !noRoomDataYet ? (
          <section className="emptyClassesState">
            <strong>{selectedCampus ? 'Select a building to begin.' : 'Select a campus to begin.'}</strong>
            <span>
              {selectedCampus
                ? `We'll show the tracked rooms for ${selectedCampus} and when they become free today.`
                : 'Choose the campus first so the building list stays focused and easy to scan.'}
            </span>
          </section>
        ) : null}

        {!error && selectedCampus && !selectedBuilding && buildingOptions.length === 0 ? (
          <section className="emptyClassesState">
            <strong>No tracked buildings found for {selectedCampus}.</strong>
            <span>Try a different campus or semester.</span>
          </section>
        ) : null}

        {!error && selectedBuilding && roomCards.length === 0 ? (
          <section className="emptyClassesState">
            <strong>No rooms found for {selectedBuilding} on {selectedCampus}.</strong>
            <span>Try a different semester, campus, or building.</span>
          </section>
        ) : null}

        {!error && roomCards.length > 0 ? (
          <section className="emptyClassesRooms">
            {roomCards.map(({ room, status }) => (
              <article key={room.roomKey} className="roomCard">
                <div className="roomCard__header">
                  <div>
                    <div className="roomCard__eyebrow">{room.campus} • {room.building}</div>
                    <h2 className="roomCard__title">{room.room}</h2>
                  </div>
                  <span className={`roomCard__badge is-${status.tone}`}>
                    {status.tone === 'free' ? 'Open' : 'Busy'}
                  </span>
                </div>

                <p className={`roomCard__status is-${status.tone}`}>{status.headline}</p>
                <p className="roomCard__detail">{status.detail}</p>

                <div className="roomCard__meta">
                  <span>Today&apos;s open windows</span>
                  <span>{room.courseCodes.length} tracked {room.courseCodes.length === 1 ? 'course' : 'courses'}</span>
                </div>

                <div className="roomCard__slots">
                  {room.freeSlotsByDay[todayKey].length === 0 ? (
                    <span className="roomCard__empty">No open window of 15+ minutes today.</span>
                  ) : room.freeSlotsByDay[todayKey].map((slot) => {
                    const slotStart = timeToMinutes(slot.start) ?? 0;
                    const slotEnd = timeToMinutes(slot.end) ?? slotStart;
                    const nowMinutes = timeToMinutes(currentTime) ?? 0;
                    const isCurrent = nowMinutes >= slotStart && nowMinutes < slotEnd;

                    return (
                      <span
                        key={`${room.roomKey}-${slot.start}-${slot.end}`}
                        className={`roomCard__slot${isCurrent ? ' isCurrent' : ''}`}
                      >
                        {formatClock(slot.start)} - {formatClock(slot.end)} ({formatDurationMinutes(getSlotDuration(slot))})
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
