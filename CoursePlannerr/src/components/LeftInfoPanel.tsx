import { memo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Course, Day } from "../types";

type Tab = "welcome" | "info" | "crn";

type Props = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedCourse: Course | null;
  selectedCrns: string[];
  universityName: string;
  onBodyScroll?: (scrollTop: number) => void;
  isSelectedFavorite?: boolean;
  isSelectedLocked?: boolean;
  onToggleFavorite?: (course: Course) => void;
  onToggleLockedCourse?: (courseId: string) => void;
};

function TabButton({
  label,
  title,
  isActive,
  onClick,
}: {
  label: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`sideTabs__tab ${isActive ? "isActive" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Row({
  label,
  value,
  alwaysShow,
}: {
  label: string;
  value: ReactNode;
  alwaysShow?: boolean;
}) {
  if (
    !alwaysShow
    && (!value || (typeof value === "string" && value.trim() === ""))
  ) {
    return null;
  }

  return (
    <div className="infoField">
      <div className="infoField__label">{label}</div>
      <div className="infoField__value">{value}</div>
    </div>
  );
}

function formatDays(days: Day[]) {
  const labels: Record<Day, string> = {
    M: "Mon",
    T: "Tue",
    W: "Wed",
    R: "Thu",
    F: "Fri",
    S: "Sat",
  };
  return days.map((day) => labels[day]).join(", ");
}

function formatClockTime(value: string) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value || "TBA";
  const hours = Number(match[1]);
  const minutes = match[2];
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

function formatTimeRange(start: string, end: string) {
  return `${formatClockTime(start || "TBA")} - ${formatClockTime(end || "TBA")}`;
}

function getCapacityCopy(course: Course) {
  const limit = Number(course.capacity?.limit ?? 0);
  const enrolled = Number(course.capacity?.enrolled ?? 0);
  if (limit <= 0) return "Not published";
  return `${enrolled} / ${limit}`;
}

function getOpenSeatsCopy(course: Course) {
  const limit = Number(course.capacity?.limit ?? 0);
  const enrolled = Number(course.capacity?.enrolled ?? 0);
  if (limit <= 0) return "Not published";
  return String(Math.max(0, limit - enrolled));
}

function getPrimaryLocation(course: Course) {
  return course.meetings.find((meeting) => String(meeting.location ?? "").trim())?.location?.trim() || "";
}

function isCatalogOnlyCourse(course: Course) {
  return Boolean(
    course.isCatalogOnly
    || (!(course.meetings ?? []).length && (/^CAT$/i.test(course.section ?? "") || /catalog/i.test(course.scheduleType ?? ""))),
  );
}

function getSectionLabel(course: Course) {
  if (isCatalogOnlyCourse(course)) return "Catalog entry";
  return course.section || "Not listed";
}

function getScheduleAvailabilityCopy(course: Course) {
  if (isCatalogOnlyCourse(course)) {
    return `${course.universityName} currently exposes this course as a searchable catalog entry without public meeting days or times in the loaded source.`;
  }
  if (course.sourceScheduleNote) return course.sourceScheduleNote;
  return "No meeting times are posted for this section yet.";
}

function LeftInfoPanelComponent({
  activeTab,
  onTabChange,
  selectedCourse,
  selectedCrns,
  universityName,
  onBodyScroll,
  isSelectedFavorite = false,
  isSelectedLocked = false,
  onToggleFavorite,
  onToggleLockedCourse,
}: Props) {
  const navigate = useNavigate();

  return (
    <aside className="leftPanel">
      <div className="sideTabs" role="tablist" aria-label="Info tabs">
        <TabButton
          label="Start"
          title="Quick start"
          isActive={activeTab === "welcome"}
          onClick={() => onTabChange("welcome")}
        />
        <TabButton
          label="Details"
          title="Course Information"
          isActive={activeTab === "info"}
          onClick={() => onTabChange("info")}
        />
        <TabButton
          label="CRNs"
          title="Selected CRNs"
          isActive={activeTab === "crn"}
          onClick={() => onTabChange("crn")}
        />
      </div>

      <div
        className="leftPanel__body"
        onScroll={(event) => onBodyScroll?.(event.currentTarget.scrollTop)}
      >
        {activeTab === "welcome" && (
          <div className="welcomeBox">
            <div className="welcomeBox__eyebrow">Quick Start</div>
            <h2 className="welcomeBox__title">
              Find classes fast, add them, and watch the week update instantly.
            </h2>
            <p className="welcomeBox__text">
              This is your {universityName} schedule builder. The main workflow
              is simple: search on the right, add the section you want, then
              read the schedule on the big weekly grid immediately.
            </p>
            <div className="welcomeBox__steps">
              <div className="welcomeHint">
                <span className="welcomeHint__key">1 Search</span>
                <span>
                  Start with a course code, title, instructor, or smart tokens
                  like <code>dept:cmps</code> or <code>open</code>.
                </span>
              </div>
              <div className="welcomeHint">
                <span className="welcomeHint__key">2 Add</span>
                <span>
                  Use <strong>Add</strong> on any result card and the class
                  appears directly on the weekly planner.
                </span>
              </div>
              <div className="welcomeHint">
                <span className="welcomeHint__key">3 Refine</span>
                <span>
                  Save favorites, compare schedule slots, recolor blocks, then
                  export once the layout feels right.
                </span>
              </div>
            </div>
            <div className="welcomeBox__subtle">Popular searches</div>
            <div className="welcomeBox__examples" aria-label="Popular searches">
              <span className="welcomeExample">CMPS 201</span>
              <span className="welcomeExample">prof:smith</span>
              <span className="welcomeExample">day:mw open</span>
              <span className="welcomeExample">type:lab</span>
            </div>
          </div>
        )}

        {activeTab === "info" && (
          <div className="infoBox">
            {!selectedCourse ? (
              <div className="emptyState">
                <strong>Nothing selected yet.</strong>
                <span>
                  Click a course to inspect its full details here, or keep the
                  Details tab open to preview rows while you hover.
                </span>
              </div>
            ) : (
              <div className="courseDetailCard">
                <div className="courseDetailHero">
                  <div className="courseDetailHero__top">
                    <span className="courseCodePill">{selectedCourse.code}</span>
                    <span className="courseCrnPill">CRN {selectedCourse.crn}</span>
                  </div>
                  <h2 className="courseDetailHero__title">
                    {selectedCourse.title}
                  </h2>
                </div>

                <div className="infoFields">
                  <Row label="Instructor" value={selectedCourse.instructor || "TBA"} />
                  <Row label="Campus" value={selectedCourse.campus || "Not listed"} />
                  <Row label="Primary room" value={getPrimaryLocation(selectedCourse) || "TBA"} />
                  <Row label="Section" value={getSectionLabel(selectedCourse)} />
                  <Row label="Type" value={selectedCourse.scheduleType || "Class"} />
                  <Row
                    label="Credits"
                    value={
                      selectedCourse.credits != null && selectedCourse.credits > 0
                        ? String(selectedCourse.credits)
                        : "N/A"
                    }
                  />
                  <Row label="Capacity" value={getCapacityCopy(selectedCourse)} />
                  <Row label="Open seats" value={getOpenSeatsCopy(selectedCourse)} />
                </div>

                <div className="courseDetailActions">
                  <button
                    type="button"
                    onClick={() => selectedCourse && onToggleFavorite?.(selectedCourse)}
                    disabled={!onToggleFavorite}
                  >
                    {isSelectedFavorite ? "Saved" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/reviews?course=${encodeURIComponent(selectedCourse.code)}`)}
                  >
                    Reviews
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/reviews?course=${encodeURIComponent(selectedCourse.code)}&write=1`)}
                  >
                    Write Review
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedCourse && onToggleLockedCourse?.(selectedCourse.id)}
                    disabled={!onToggleLockedCourse}
                  >
                    {isSelectedLocked ? "Locked" : "Lock"}
                  </button>
                </div>

                {selectedCourse.attributes && selectedCourse.attributes.length > 0 && (
                  <section className="detailSection">
                    <div className="detailSection__title">Attributes</div>
                    <div className="infoChips">
                      {selectedCourse.attributes.map((attribute, index) => (
                        <span key={`${attribute}-${index}`} className="infoChip">
                          {attribute}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {selectedCourse.description ? (
                  <section className="detailSection">
                    <div className="detailSection__title">Description</div>
                    <div className="infoNote isQuiet">{selectedCourse.description}</div>
                  </section>
                ) : null}

                {selectedCourse.academicLevel ? (
                  <section className="detailSection">
                    <div className="detailSection__title">Academic level</div>
                    <div className="infoNote isQuiet">{selectedCourse.academicLevel}</div>
                  </section>
                ) : null}

                <section className="detailSection">
                  <div className="detailSection__title">Prerequisites</div>
                  <div className={`infoNote ${selectedCourse.prerequisites ? "isWarm" : "isQuiet"}`}>
                    {selectedCourse.prerequisites
                      || "Prerequisites are not published in the current catalog snapshot for this course."}
                  </div>
                </section>

                {selectedCourse.restrictions && selectedCourse.restrictions !== "None" && (
                  <section className="detailSection">
                    <div className="detailSection__title">Restrictions</div>
                    <div className="infoNote isAlert">
                      {selectedCourse.restrictions}
                    </div>
                  </section>
                )}

                <section className="detailSection">
                  <div className="detailSection__title">Sessions</div>
                  <div className="sessions">
                    {selectedCourse.meetings.length === 0 ? (
                      <div className={`sessionCard isEmpty${isCatalogOnlyCourse(selectedCourse) ? " isCatalogOnly" : ""}`}>
                        {isCatalogOnlyCourse(selectedCourse) ? (
                          <>
                            <strong className="sessionCard__catalogState">Catalog-only source</strong>
                            <span>{getScheduleAvailabilityCopy(selectedCourse)}</span>
                          </>
                        ) : (
                          getScheduleAvailabilityCopy(selectedCourse)
                        )}
                      </div>
                    ) : (
                      selectedCourse.meetings.map((meeting, index) => (
                        <div key={`${meeting.start}-${meeting.end}-${index}`} className="sessionCard">
                          <div className="sessionCard__main">
                            <span>{formatDays(meeting.days) || "Days TBA"}</span>
                            <strong>{formatTimeRange(meeting.start, meeting.end)}</strong>
                          </div>
                          <div className="sessionMetaGrid">
                            <div>
                              <span>Type</span>
                              <strong>{meeting.type || "Class"}</strong>
                            </div>
                            <div>
                              <span>Location</span>
                              <strong>{meeting.location || "TBA"}</strong>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        {activeTab === "crn" && (
          <div className="crnBox">
            <div className="crnBox__title">Selected CRNs</div>
            {selectedCrns.length === 0 ? (
              <div className="emptyState">
                <strong>No CRNs added yet.</strong>
                <span>
                  Your selected sections will appear here as soon as you add
                  them to a schedule.
                </span>
              </div>
            ) : (
              <ul className="crnList">
                {selectedCrns.map((crn) => (
                  <li key={crn}>{crn}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export const LeftInfoPanel = memo(LeftInfoPanelComponent);
