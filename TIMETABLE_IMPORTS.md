# Timetable Import Fallback

This project now supports **official timetable-file imports** for universities whose public timetable feeds are broken, hidden behind login, or temporarily unavailable.

The backend automatically checks these folders:

- `C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\data\manual-timetables\<university>`
- `C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\manual-timetables\<university>`
- `C:\Users\Saeed\Desktop\Termer Timetables\<university>`
- `C:\Users\Saeed\Downloads\Termer Timetables\<university>`

Supported `<university>` folder names:

- `lu`
- `liu`
- `aust`
- `usj`
- `aub`
- `lau`
- `bau`
- `usek`
- `ndu`

Supported file formats:

- `.json`
- `.csv`
- `.xlsx`
- `.xls`

## CSV / Excel columns

Use any reasonable subset of these column names:

- `term_code`
- `term_description`
- `code`
- `title`
- `section`
- `crn`
- `instructor`
- `campus`
- `location`
- `days`
- `time`
- `start_time`
- `end_time`
- `type`
- `credits`
- `capacity`
- `enrolled_count`
- `attributes`
- `prerequisites`

Example row:

```csv
term_code,term_description,code,title,section,crn,instructor,campus,location,days,time,type,credits,capacity,enrolled_count,attributes,prerequisites
catalog-2025-2026,Catalog 2025-2026,CSCI 200,Programming I,A,12001,Jane Doe,Beirut Campus,Room B201,MWF,08:00-08:50 AM,Lecture,3,30,18,School of Engineering,CSCI 101
```

## JSON shape

You can also drop JSON like:

```json
{
  "terms": [
    {
      "code": "catalog-2025-2026",
      "description": "Catalog 2025-2026",
      "is_current": true
    }
  ],
  "courses": [
    {
      "term_code": "catalog-2025-2026",
      "code": "CSCI 200",
      "title": "Programming I",
      "section": "A",
      "crn": "12001",
      "instructor": "Jane Doe",
      "campus": "Beirut Campus",
      "location": "Room B201",
      "days": "MWF",
      "time": "08:00-08:50 AM",
      "type": "Lecture",
      "credits": 3
    }
  ]
}
```

## What happens after you drop a file

- The backend now watches these folders while the local app is running.
- Dropping or updating a supported file triggers a background catalog refresh automatically.
- The next startup refresh also picks the file up automatically.
- Imported timed sections are merged into the university catalog instead of replacing everything.
- If the imported row matches an existing course/section/CRN, the imported timed meeting data wins.
- The website then shows those meetings in:
  - course search
  - left details panel
  - middle schedule grid
  - AI schedule answers
