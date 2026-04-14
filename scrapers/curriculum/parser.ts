import { execSync } from "child_process";
import fs from "fs";

export function parsePDF(pdfPath: string) {
  const text = execSync(`pdftotext -layout "${pdfPath}" -`, {
    encoding: "utf-8",
  });
  const lines = text.split("\n");

  const result = {
    name: "",
    id: 0,
    version: 0,
    totalPhases: 0,
    department: "UFSC",
    courses: [] as any[],
  };

  const courseMatch = text.match(/Curso:\s*(\d+)\s*-\s*([^\r\n]+)/);
  if (courseMatch) {
    result.id = parseInt(courseMatch[1]);
    result.name = `${courseMatch[1]} - ${courseMatch[2].trim()}`;
  }

  const currMatch = text.match(/Curr[ií]culo:\s*(\d+)/);
  if (currMatch) {
    result.version = parseInt(currMatch[1]);
  }

  const courseLines = [];
  let currentPhase: number | null = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const phaseMatch = line.match(/Fase\s+(\d+)/i);
    if (phaseMatch) {
      currentPhase = parseInt(phaseMatch[1]);
      if (currentPhase > result.totalPhases) {
        result.totalPhases = currentPhase;
      }
    } else if (line.toLowerCase().includes("disciplinas optativas")) {
      currentPhase = null;
    }
    // Also capture lines like: "INE5461      Programa de Intercâmbio I                              Op"
    const courseStartMatch = line.match(
      /^(\s*)([A-Z]{3,4}\d{4}|-)\s+(.+?)\s+(Ob|Op)(?:\s+|$)\s*(\d*)\s*(\d*)(.*)/,
    );
    if (courseStartMatch) {
      // Avoid matching random things that look like Op
      if (courseStartMatch[3].includes("Total")) continue;

      courseLines.push({
        index: i,
        phase: currentPhase,
        id: courseStartMatch[2],
        nameStr: courseStartMatch[3].trim(),
        type: courseStartMatch[4],
        ha: courseStartMatch[5] ? parseInt(courseStartMatch[5]) : 0,
        aulas: courseStartMatch[6] ? parseInt(courseStartMatch[6]) : 0,
        rest: courseStartMatch[7] || "",
      });
    }
  }

  for (let c = 0; c < courseLines.length; c++) {
    const course = courseLines[c];
    const nextCourseIndex =
      c + 1 < courseLines.length ? courseLines[c + 1].index : lines.length;

    let nameParts = [course.nameStr];
    let equivParts = [lines[course.index].substring(100, 124)?.trim() || ""];
    let preReqParts = [lines[course.index].substring(124, 145)?.trim() || ""];

    let k = course.index + 1;
    while (k < nextCourseIndex) {
      const nextLine = lines[k];
      if (
        nextLine.trim() === "" ||
        nextLine.match(/Fase\s+\d+/) ||
        nextLine.includes("Disciplina")
      ) {
        break; // Stop at empty lines or section headers
      }

      const nPart = nextLine.substring(12, 70)?.trim() || "";
      const descArea = nextLine.substring(18, 95)?.trim() || "";

      // Heuristic to detect description lines bleeding into name column
      if (
        descArea.length > 55 ||
        nPart.endsWith(".") ||
        nPart.includes(",") ||
        nPart.includes(":") ||
        (nameParts.length >= 2 && descArea.length > 25)
      ) {
        break;
      }

      if (nPart) {
        nameParts.push(nPart);
      }

      const eqStr = nextLine.substring(100, 124)?.trim() || "";
      const prStr = nextLine.substring(124, 145)?.trim() || "";
      if (eqStr) equivParts.push(eqStr);
      if (prStr) preReqParts.push(prStr);

      k++;
    }

    course.nameParts = nameParts;
    course.equivParts = equivParts;
    course.preReqParts = preReqParts;
    course.endIndex = k - 1;
  }

  // Second pass: extract descriptions backwards
  let optCounter = 1;
  for (let c = 0; c < courseLines.length; c++) {
    const course = courseLines[c];
    let descStart = c === 0 ? 0 : courseLines[c - 1].endIndex + 1;
    let descEnd = course.index - 1;

    // Skip global headers and table headers
    let lastHeaderIndex = descStart - 1;
    for (let i = descStart; i <= descEnd; i++) {
      if (lines[i].includes("Disciplina") && lines[i].includes("Tipo")) {
        lastHeaderIndex = i;
      }
    }
    if (lastHeaderIndex >= descStart) {
      descStart = lastHeaderIndex + 1;
    }

    let descLines = [];
    for (let i = descStart; i <= descEnd; i++) {
      const line = lines[i].trim();
      const lower = line.toLowerCase();

      // Ignoring all noise from headers, footers, pagination, and tables
      if (
        !line ||
        line.match(/Fase\s+\d+/) ||
        (line.includes("Disciplina") && line.includes("Tipo")) ||
        lower.includes("página:") ||
        lower.includes("currículo do curso") ||
        lower.includes("setic -") ||
        lower.includes("habilitação:") ||
        lower.includes("currículo:") ||
        lower.includes("carga horária") ||
        lower.includes("curso:") ||
        line.match(/^\d{2}\/\d{2}\/\d{4}/) ||
        lower.includes("disciplinas optativas") ||
        line.match(/^--/)
      ) {
        continue;
      }
      descLines.push(line);
    }

    const description = descLines.join(" ").trim();
    const equivalents = [
      ...new Set(course.equivParts.join(" ").match(/[A-Z]{3,4}\d{4}/g) || []),
    ];
    const prerequisites = [
      ...new Set(course.preReqParts.join(" ").match(/[A-Z]{3,4}\d{4}/g) || []),
    ];

    let courseId = course.id;
    if (courseId === "-") {
      courseId = `OPT${String(optCounter).padStart(4, "0")}`;
      optCounter++;
    }

    result.courses.push([
      courseId,
      course.nameParts.join(" ").trim(),
      course.aulas,
      course.ha,
      description,
      prerequisites,
      equivalents,
      course.type === "Ob",
      course.phase,
    ]);
  }

  return result;
}

if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("parser.ts")
) {
  const parsed = parsePDF(process.argv[2] || "data/pdfs/208_20071.pdf");
  fs.writeFileSync(
    "data/curriculum_parsed.json",
    JSON.stringify(parsed, null, 2),
  );
  console.log("Done");
}
