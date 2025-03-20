import { parseCurriculumData } from "../lib/curriculum-parser"
import * as fs from "fs"
import * as path from "path"

// Load the output.json file
const jsonPath = path.resolve(__dirname, "../lib/output.json")
const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))

// Parse the data
const { curriculum, visualization } = parseCurriculumData(jsonData)

// Print some stats
console.log(`Loaded curriculum: ${curriculum.name}`)
console.log(`Department: ${curriculum.department}`)
console.log(`Total phases: ${curriculum.totalPhases}`)
console.log(`Total courses: ${curriculum.phases.reduce((sum, phase) => sum + phase.courses.length, 0)}`)

// Print courses per phase
curriculum.phases.forEach(phase => {
  console.log(`Phase ${phase.number}: ${phase.courses.length} courses`)
  
  // Print some details about the first course in each phase (if any)
  if (phase.courses.length > 0) {
    const course = phase.courses[0]
    console.log(`  Sample course: ${course.id} - ${course.name}`)
    console.log(`  Type: ${course.type}`)
    console.log(`  Credits: ${course.credits}`)
    console.log(`  Prerequisites: ${course.prerequisites?.length || 0}`)
    console.log(`  Equivalents: ${course.equivalents?.length || 0}`)
  }
})

// Print visualization stats
console.log(`\nVisualization ID: ${visualization.id}`)
console.log(`Total positions: ${visualization.positions.length}`)
console.log(`Phase labels: ${Object.keys(visualization.phaseLabels).length}`) 