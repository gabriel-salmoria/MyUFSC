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
    // Get the script directory and use it to find project root (two levels up)
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const projectRoot = path.resolve(__dirname, '../..');
    
    // Read the cs-degree data
    const csDataPath = path.join(projectRoot, 'data', 'courses', 'cs-degree.json');
    const csDataRaw = fs.readFileSync(csDataPath, 'utf8');
    const csData: CSCurriculum = JSON.parse(csDataRaw);
    
    // Read the FLO class data
    const floDataPath = path.join(projectRoot, 'data', 'classes', '20251-FLO.json');
    const floDataRaw = fs.readFileSync(floDataPath, 'utf8');
    const floData: ClassData = JSON.parse(floDataRaw);
    
    // Create a set of CS course IDs for quick lookup
    const csCourseIds = new Set(csData.courses.map(course => course.id));
    
    // Filter FLO data to only include classes for CS courses
    const filteredFLO: [string, string, string, any[]][] = [];
    
    for (const courseData of floData.FLO) {
      const courseId = courseData[0];
      
      // Only include courses that exist in our CS curriculum
      if (csCourseIds.has(courseId)) {
        filteredFLO.push(courseData);
      }
    }
    
    // Create output with same format as original
    const filteredData = {
      DATA: floData.DATA,
      FLO: filteredFLO
    };
    
    // Write the filtered data to a new file in the current directory
    const outputPath = path.join(__dirname, 'cs-classes-2025.json');
    fs.writeFileSync(outputPath, JSON.stringify(filteredData));
    
    console.log(`Data processing complete. Output saved to ${outputPath}`);
    console.log(`Extracted information for ${filteredFLO.length} CS courses.`);
  } catch (error) {
    console.error('Error processing data:', error);
  }
}

main(); 