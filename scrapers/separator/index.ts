import fs from 'fs';
import path from 'path';

// Define types
interface CSCourse {
  id: string;
  name: string;
  credits: number;
  workload?: number;
  description?: string;
  prerequisites?: string[] | null;
  equivalents?: string[] | null;
  phase: number;
  type?: string;
}

interface CSCurriculum {
  name: string;
  id: number;
  totalPhases: number;
  courses: CSCourse[];
}

interface ClassData {
  DATA: string;
  FLO: [string, string, string, any[]][];
}

async function main() {
  try {
    const args = process.argv.slice(2);

    // Default paths (relative to where the script might be run, but safer to use args)
    // Args:
    // 0: Input Curriculum JSON (e.g., generated/curriculum.json)
    // 1: Input Schedule JSON (e.g., generated/20251-FLO.json)
    // 2: Output Classes JSON (e.g., generated/cs-classes-2025.json)

    if (args.length < 3) {
      console.error("Usage: ts-node index.ts <curriculumJsonPath> <scheduleJsonPath> <outputJsonPath>");
      process.exit(1);
    }

    const curriculumPath = path.resolve(args[0]);
    const schedulePath = path.resolve(args[1]);
    const outputPath = path.resolve(args[2]);

    console.log(`Reading curriculum from: ${curriculumPath}`);
    const curriculumDataRaw = fs.readFileSync(curriculumPath, 'utf8');
    const curriculumData: CSCurriculum = JSON.parse(curriculumDataRaw);

    console.log(`Reading schedule from: ${schedulePath}`);
    const scheduleDataRaw = fs.readFileSync(schedulePath, 'utf8');
    const scheduleData: ClassData = JSON.parse(scheduleDataRaw);

    // Create a set of CS course IDs for quick lookup
    const courseIds = new Set(curriculumData.courses.map(course => course.id));

    // Filter FLO data to only include classes for CS courses
    const filteredFLO: [string, string, string, any[]][] = [];

    // The scraper output has a top-level key for the degree usually, but here we assume we are getting
    // the raw JSON that might be inside a degree key OR just the raw structure we saw in the file.
    // Based on previous code: `const floData: ClassData = JSON.parse(floDataRaw);`
    // and `floData.FLO`.

    if (!scheduleData.FLO) {
      console.error("Error: Input schedule JSON does not contain 'FLO' property.");
      process.exit(1);
    }

    for (const courseData of scheduleData.FLO) {
      const courseId = courseData[0];

      // Only include courses that exist in our curriculum
      if (courseIds.has(courseId)) {
        filteredFLO.push(courseData);
      }
    }

    const filteredData = {
      DATA: scheduleData.DATA,
      FLO: filteredFLO
    };

    fs.writeFileSync(outputPath, JSON.stringify(filteredData));

    console.log(`Data processing complete. Output saved to ${outputPath}`);
    console.log(`Extracted information for ${filteredFLO.length} courses found in curriculum.`);
  } catch (error) {
    console.error('Error processing data:', error);
    process.exit(1);
  }
}

main(); 