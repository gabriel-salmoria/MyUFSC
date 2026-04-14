import { execSync } from "child_process";
import fs from "fs";

const pdfPath = process.argv[2] || "data/pdfs/208_20071.pdf";
const text = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: "utf-8" });

const lines = text.split("\n");

let currentPhase = 0;
let currentCourse = null;

const result = {
  name: "",
  id: 0,
  version: 0,
  totalPhases: 0,
  department: "UFSC",
  courses: [] as any[]
};

// Extract metadata
const courseMatch = text.match(/Curso:\s*(\d+)\s*-\s*([^\r\n]+)/);
if (courseMatch) {
  result.id = parseInt(courseMatch[1]);
  result.name = `${courseMatch[1]} - ${courseMatch[2].trim()}`;
}

const currMatch = text.match(/Curr[ií]culo:\s*(\d+)/);
if (currMatch) {
  result.version = parseInt(currMatch[1]);
}

// Regex to detect a course line
// Example: "     EEL5105      Circuitos e Técnicas Digitais                          Ob        90        5"
// Course ID (letters+numbers), Name, Tipo (Ob/Op), H/A, Aulas, ... Equivalentes, Pré-requisito
// Because of -layout, there are large gaps.

let inCoursesSection = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  const phaseMatch = line.match(/Fase\s+(\d+)/i);
  if (phaseMatch) {
    currentPhase = parseInt(phaseMatch[1]);
    if (currentPhase > result.totalPhases) {
      result.totalPhases = currentPhase;
    }
    continue;
  }
  
  // Try to match a course start line
  const courseStartMatch = line.match(/^\s*([A-Z]{3,4}\d{4})\s+(.+?)\s+(Ob|Op)\s+(\d+)\s+(\d+)(.*)/);
  if (courseStartMatch) {
    const id = courseStartMatch[1];
    const nameStr = courseStartMatch[2].trim();
    const type = courseStartMatch[3];
    const ha = parseInt(courseStartMatch[4]);
    const aulas = parseInt(courseStartMatch[5]);
    const rest = courseStartMatch[6];
    
    // We also need to get the description which usually precedes the course line.
    // In pdftotext -layout, the description seems to be in the lines above the course definition, until an empty line or another course.
    
    let description = "";
    let j = i - 1;
    let descLines = [];
    while (j >= 0) {
      const prevLine = lines[j].trim();
      if (prevLine === "" || prevLine.match(/Fase\s+\d+/) || prevLine.startsWith("Disciplina") || prevLine.match(/^[A-Z]{3,4}\d{4}\s/)) {
        break;
      }
      descLines.unshift(prevLine);
      j--;
    }
    description = descLines.join(" ");

    // Also look at the 'rest' for equivalents and prerequisites
    let equivalents: string[] = [];
    let prerequisites: string[] = [];
    
    // This is naive and will need improvement.
    const preReqMatch = rest.match(/([A-Z]{3,4}\d{4})/g);
    if (preReqMatch) {
      // Differentiating between eq and prereq on a single line is hard without column indices.
      // Let's use column indices!
      
      // Typical header:
      // Disciplina                                                         Tipo      H/A      Aulas       Equivalentes          Pré-Requisito        Conjunto        Pré CH
      // Let's find column positions dynamically.
    }
    
    result.courses.push([
      id,
      nameStr,
      aulas,
      ha,
      description,
      [], // prereqs
      [], // equivalents
      type === "Ob",
      currentPhase
    ]);
  }
}

console.log(JSON.stringify(result, null, 2));
