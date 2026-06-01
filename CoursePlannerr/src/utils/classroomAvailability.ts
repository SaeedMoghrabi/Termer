import type { Course, Day } from '../types.ts';
import {
  findFreeSlots,
  type FreeSlotsByDay,
  type WeekdayKey,
  type WeeklyMeetingSlot,
} from './schedule.ts';
import { normalizeCampusName } from '../config/campuses.ts';

const DAY_TO_WEEKDAY: Record<Day, WeekdayKey> = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  R: 'Thu',
  F: 'Fri',
  S: 'Sat',
};

const SORTER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface ClassroomLocation {
  building: string;
  room: string;
}

export interface ClassroomAvailability {
  campus: string;
  building: string;
  room: string;
  roomKey: string;
  meetings: WeeklyMeetingSlot[];
  freeSlotsByDay: FreeSlotsByDay;
  courseCodes: string[];
}

export interface ClassroomAvailabilityOptions {
  startOfDay?: string;
  endOfDay?: string;
  minGapMinutes?: number;
}

export function parseClassroomLocation(location: string): ClassroomLocation | null {
  const normalized = String(location ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const upper = normalized.toUpperCase();
  if (
    upper === 'TBA'
    || upper === 'ONLINE'
    || upper === 'ARR'
    || upper.includes('ONLINE')
    || upper.includes('TO BE ANNOUNCED')
  ) {
    return null;
  }

  const directBuildingRoom = normalized.match(/^(.+?)\s+-\s+(.+)$/);
  if (directBuildingRoom) {
    const building = directBuildingRoom[1].trim();
    const room = directBuildingRoom[2].trim();
    if (building && room) {
      return { building, room };
    }
  }

  const strippedNotes = normalized
    .replace(/\s*\(([^)]*)\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const liuNumericBuilding = strippedNotes.match(/^(\d{2,4})-([A-Z])(?:\s+(.+))?$/i);
  if (liuNumericBuilding) {
    const room = liuNumericBuilding[1].trim();
    const building = [liuNumericBuilding[2].trim(), liuNumericBuilding[3]?.trim() || ""]
      .filter(Boolean)
      .join(" ");
    if (building && room) {
      return { building, room };
    }
  }

  const prefixedBuildingCode = strippedNotes.match(/^([A-Z])\s*0*(\d{1,4})$/i);
  if (prefixedBuildingCode) {
    const building = prefixedBuildingCode[1].trim().toUpperCase();
    const room = prefixedBuildingCode[2].trim();
    if (building && room) {
      return { building, room };
    }
  }

  const alphaBuildingDigits = strippedNotes.match(/^([A-Z][A-Z\s.]+?)(\d{1,4})$/i);
  if (alphaBuildingDigits) {
    const building = alphaBuildingDigits[1].trim();
    const room = alphaBuildingDigits[2].trim();
    if (building && room) {
      return { building, room };
    }
  }

  const suffixedRoomCode = strippedNotes.match(/^(.+?)-([A-Z0-9]+)$/i);
  if (suffixedRoomCode && /[A-Za-z]/.test(suffixedRoomCode[1])) {
    const building = suffixedRoomCode[1].trim();
    const room = suffixedRoomCode[2].trim();
    if (building && room) {
      return { building, room };
    }
  }

  const match = normalized.match(/^(.*)\s+([A-Za-z0-9/-]+)$/);
  if (!match) return null;

  const building = match[1].trim();
  const room = match[2].trim();
  if (!building || !room) return null;

  return { building, room };
}

function buildRoomKey(campus: string, building: string, room: string): string {
  return `${campus.toLowerCase()}::${building.toLowerCase()}::${room.toLowerCase()}`;
}

export function buildClassroomAvailability(
  courses: Course[],
  options: ClassroomAvailabilityOptions = {},
): ClassroomAvailability[] {
  const {
    startOfDay = '08:00',
    endOfDay = '21:00',
    minGapMinutes = 15,
  } = options;

  const rooms = new Map<string, {
    campus: string;
    building: string;
    room: string;
    meetings: WeeklyMeetingSlot[];
    courseCodes: Set<string>;
  }>();

  for (const course of courses ?? []) {
    const campus = normalizeCampusName(course.universityId, course.campus);
    if (!campus) continue;

    for (const meeting of course.meetings ?? []) {
      const parsedLocation = parseClassroomLocation(meeting.location ?? '');
      if (!parsedLocation) continue;

      const roomKey = buildRoomKey(campus, parsedLocation.building, parsedLocation.room);
      const roomEntry = rooms.get(roomKey) ?? {
        campus,
        building: parsedLocation.building,
        room: parsedLocation.room,
        meetings: [],
        courseCodes: new Set<string>(),
      };

      for (const day of meeting.days ?? []) {
        const weekday = DAY_TO_WEEKDAY[day];
        if (!weekday) continue;

        roomEntry.meetings.push({
          day: weekday,
          start: meeting.start,
          end: meeting.end,
        });
      }

      if (course.code) {
        roomEntry.courseCodes.add(course.code);
      }

      rooms.set(roomKey, roomEntry);
    }
  }

  return [...rooms.values()]
    .map((roomEntry) => ({
      campus: roomEntry.campus,
      building: roomEntry.building,
      room: roomEntry.room,
      roomKey: buildRoomKey(roomEntry.campus, roomEntry.building, roomEntry.room),
      meetings: roomEntry.meetings,
      freeSlotsByDay: findFreeSlots(roomEntry.meetings, startOfDay, endOfDay, minGapMinutes),
      courseCodes: [...roomEntry.courseCodes].sort((left, right) => SORTER.compare(left, right)),
    }))
    .sort((left, right) => (
      SORTER.compare(left.campus, right.campus)
      || SORTER.compare(left.building, right.building)
      || SORTER.compare(left.room, right.room)
    ));
}
