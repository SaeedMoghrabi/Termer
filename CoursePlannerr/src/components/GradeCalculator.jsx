// components/GradeCalculator.jsx
import React, { useState } from "react";
import {
  getGradePointsMap,
  scoreToLetterWithNote,
  scoreToQualityPoints,
} from "../gpaCalculator";
import { getStoredUniversityId } from "../utils/plannerPreferences.ts";
import {
  getGradeFeedbackTone,
  getGradingSystem,
} from "../config/gradingSystems.ts";

const defaultRows = [
  { id: 1, name: "Midterm", weight: 30, score: "" },
  { id: 2, name: "Final Exam", weight: 40, score: "" },
  { id: 3, name: "Assignments", weight: 20, score: "" },
  { id: 4, name: "Participation", weight: 10, score: "" },
];

export default function GradeCalculator({
  universityId = getStoredUniversityId(),
}) {
  const [rows, setRows] = useState(defaultRows);
  const [nextId, setNextId] = useState(5);
  const gradingSystem = getGradingSystem(universityId);
  const gradePoints = getGradePointsMap(universityId);

  const update = (id, field, val) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: val } : r)));

  const addRow = () => {
    setRows([...rows, { id: nextId, name: "", weight: "", score: "" }]);
    setNextId(nextId + 1);
  };

  const removeRow = (id) => {
    if (rows.length > 1) setRows(rows.filter((r) => r.id !== id));
  };

  const totalWeight = rows.reduce(
    (sum, row) => sum + (parseFloat(row.weight) || 0),
    0,
  );
  const filled = rows.filter(
    (row) =>
      row.score !== "" &&
      row.weight !== "" &&
      parseFloat(row.weight) > 0,
  );
  const usedWeight = filled.reduce(
    (sum, row) => sum + parseFloat(row.weight),
    0,
  );
  const isPartial = Math.abs(usedWeight - 100) > 0.01;

  let finalPct = null;
  let letter = null;
  let gp = null;
  let letterNote = null;

  if (filled.length > 0) {
    const weighted = filled.reduce(
      (sum, row) =>
        sum + parseFloat(row.score) * parseFloat(row.weight),
      0,
    );
    finalPct = weighted / usedWeight;
    const scoreResult = scoreToLetterWithNote(finalPct, universityId);
    letter = scoreResult.letter;
    letterNote = scoreResult.note;
    gp = scoreToQualityPoints(finalPct, universityId)
      ?? (letter ? gradePoints[letter] : null);
  }

  const gradeTone = getGradeFeedbackTone({
    universityId,
    letter,
    note: letterNote,
  });

  const inputStyle = {
    padding: "7px 10px",
    borderRadius: "5px",
    border: "1px solid #ccc",
    fontSize: "14px",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div>
      <h2 style={{ color: "#A32638" }}>Grade Calculator</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 90px 90px 36px",
          gap: "8px",
          marginBottom: "4px",
        }}
      >
        {["Component", "Weight (%)", "Score (%)", ""].map((heading, i) => (
          <span key={i} style={{ fontSize: "12px", color: "#888" }}>
            {heading}
          </span>
        ))}
      </div>

      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px 90px 36px",
            gap: "8px",
            marginBottom: "8px",
            alignItems: "center",
          }}
        >
          <input
            style={inputStyle}
            placeholder="e.g. Midterm"
            value={row.name}
            onChange={(e) => update(row.id, "name", e.target.value)}
          />
          <input
            style={inputStyle}
            type="number"
            placeholder="%"
            min={0}
            max={100}
            value={row.weight}
            onChange={(e) => update(row.id, "weight", e.target.value)}
          />
          <input
            style={inputStyle}
            type="number"
            placeholder="%"
            min={0}
            max={100}
            step={0.1}
            value={row.score}
            onChange={(e) => update(row.id, "score", e.target.value)}
          />
          <button
            onClick={() => removeRow(row.id)}
            style={{
              background: "none",
              border: "1px solid #ccc",
              borderRadius: "5px",
              cursor: "pointer",
              color: "#dc3545",
              fontSize: "16px",
              height: "36px",
            }}
          >
            x
          </button>
        </div>
      ))}

      <button
        onClick={addRow}
        style={{
          background: "none",
          border: "1px solid #ccc",
          borderRadius: "5px",
          padding: "7px 14px",
          cursor: "pointer",
          fontSize: "13px",
          color: "#555",
          marginTop: "4px",
        }}
      >
        + Add component
      </button>

      {Math.abs(totalWeight - 100) > 0.01 &&
      rows.some((row) => row.weight !== "") ? (
        <p style={{ color: "#dc3545", fontSize: "12px", marginTop: "8px" }}>
          Weights sum to {totalWeight.toFixed(1)}% and must equal 100%
        </p>
      ) : null}

      {finalPct !== null ? (
        <div
          style={{
            marginTop: "24px",
            background: `radial-gradient(circle at top right, ${gradeTone.accentSoft}, transparent 42%), linear-gradient(135deg, ${gradeTone.surfaceStart}, ${gradeTone.surfaceEnd})`,
            border: `1px solid ${gradeTone.border}`,
            borderRadius: "15px",
            padding: "20px 25px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: `0 18px 36px ${gradeTone.glow}`,
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <p
              style={{
                color: gradeTone.muted,
                fontSize: "13px",
                margin: "0 0 4px",
              }}
            >
              Final grade
            </p>
            <p
              style={{
                color: gradeTone.title,
                fontSize: "28px",
                fontWeight: "bold",
                margin: 0,
              }}
            >
              {isPartial ? "~" : ""}
              {finalPct.toFixed(1)}%
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: gradeTone.accentSoft,
                border: `1px solid ${gradeTone.letterBorder}`,
                borderRadius: "999px",
                padding: "5px 10px",
                fontSize: "10px",
                color: gradeTone.title,
                marginTop: "8px",
                fontWeight: 700,
                letterSpacing: "0.35px",
                textTransform: "uppercase",
              }}
            >
              {gradeTone.label}
            </span>
            {gp !== null ? (
              <span
                style={{
                  background: gradeTone.letterBg,
                  border: `1px solid ${gradeTone.letterBorder}`,
                  borderRadius: "8px",
                  padding: "3px 10px",
                  fontSize: "13px",
                  color: gradeTone.title,
                  marginTop: "8px",
                  display: "inline-block",
                }}
              >
                GPA points: {gp.toFixed(2)}
                {isPartial ? " (partial)" : ""}
              </span>
            ) : null}
            {letterNote || (!letter && gradingSystem.percentScaleNote) ? (
              <p
                style={{
                  color: gradeTone.muted,
                  fontSize: "12px",
                  lineHeight: 1.45,
                  margin: "10px 0 0",
                }}
              >
                {letterNote || gradingSystem.percentScaleNote}
              </p>
            ) : null}
          </div>
          <div
            style={{
              fontSize: "42px",
              fontWeight: "bold",
              color: gradeTone.title,
              background: gradeTone.letterBg,
              border: `1px solid ${gradeTone.letterBorder}`,
              borderRadius: "10px",
              padding: "6px 20px",
            }}
          >
            {letter ?? "-"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
