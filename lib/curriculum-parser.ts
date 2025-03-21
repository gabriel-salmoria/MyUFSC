import type { Curriculum, Course, Phase } from "@/types/curriculum"
import type { CurriculumVisualization, CoursePosition } from "@/types/visualization"


const positions: CoursePosition[] = []


// preciso mover essas constantes pra um arquivo separado
const COURSE_WIDTH = 140
const COURSE_HEIGHT = 50
const PHASE_WIDTH = 200
const VERTICAL_SPACING = 60


// mapa de disciplinas para consulta
export const courseMap = new Map<string, Course>()



interface RawCurriculumData {
  id: string
  name: string
  department: string
  totalPhases: number
  courses: RawCourse[]
}

// interface para o json do bgl do aluno
interface RawCourse {
  id: string
  name: string
  type: string
  credits: number
  workload: number
  prerequisites: string[] | null
  equivalents: string[] | null
  description: string
  phase: number
}



// funcao para pegar as informacoes de uma disciplina pelo codigo
// basicamente uma consulta no hashmap mas melhor e especializada
export function getCourseInfo(courseCode: string): Course | undefined {
  if (!courseCode) return undefined;
  
  // primeiro tenta o match exato
  let course = courseMap.get(courseCode);
  if (course) return course;
  
  // remove o sufixo de classe (e.g., "-05208")
  const baseCode = courseCode.split("-")[0];
  course = courseMap.get(baseCode);
  if (course) return course;

}


function mapCourseType(type: string): "mandatory" | "optional" {
  return type === "Ob" ? "mandatory" : "optional"
}

export function parseCurriculumData(jsonData: RawCurriculumData): {
  curriculum: Curriculum
  visualization: CurriculumVisualization
} {
  
  // Clear the course map before populating it
  courseMap.clear()

  // Transform raw courses to Course type with type mapping
  const courses: Course[] = jsonData.courses.map(rawCourse => ({
    id: rawCourse.id,
    name: rawCourse.name,
    type: mapCourseType(rawCourse.type),
    credits: rawCourse.credits,
    workload: rawCourse.workload,
    description: rawCourse.description,
    prerequisites: rawCourse.prerequisites || [],
    equivalents: rawCourse.equivalents || [],
    phase: rawCourse.phase
  }));

  courses.forEach(course => {
    courseMap.set(course.id, course)
  })

  // por enquanto pegamos apenas as obrigatorias
  const mandatoryCourses = courses.filter(course => course.type === "mandatory");

  // cria os arrays de fases
  const phases: Phase[] = Array.from({ length: jsonData.totalPhases }, (_, i) => ({
    number: i + 1,
    name: `Phase ${i + 1}`,
    courses: mandatoryCourses.filter(course => course.phase === i + 1),
  }))

  // cria o objeto do curriculo (similar ao do curso, mas feito pelo aluno) 
  const curriculum: Curriculum = {
    name: jsonData.name,
    department: jsonData.department,
    totalPhases: jsonData.totalPhases,
    phases: phases,
  }

  positions.length = 0

  // posiciona as disciplinas
  phases.forEach((phase, phaseIndex) => {
    phase.courses.forEach((course, courseIndex) => {
      positions.push({
        courseId: course.id,
        x: phaseIndex * PHASE_WIDTH + 30,
        y: courseIndex * VERTICAL_SPACING + 60,
        width: COURSE_WIDTH,
        height: COURSE_HEIGHT,
      })
    })
  })

  // cria o componente da ui
  const visualization: CurriculumVisualization = {
    id: `${jsonData.id}-vis`,
    curriculumId: jsonData.id,
    positions,
    phaseLabels: Object.fromEntries(
      phases.map((phase) => [
        phase.number,
        {
          x: (phase.number - 1) * PHASE_WIDTH,
          y: 0,
          width: PHASE_WIDTH,
          height: 400,
        },
      ])
    ),
    panOffset: { x: 0, y: 0 },
  }

  return { curriculum, visualization }
}



// fetch pra pegar o json do curriculo (eventualmente vai estar no servidor)
export function loadCurriculumFromJson(jsonPath: string): Promise<{
  curriculum: Curriculum
  visualization: CurriculumVisualization
}> {
  return fetch(jsonPath)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load curriculum: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then((data) => {
      // valida o formato do json
      if (!data.id || !data.name || !data.courses || !Array.isArray(data.courses)) {
        console.error("Invalid curriculum data format:", data);
        throw new Error("Invalid curriculum data format: missing required fields");
      }
      
      console.log(`Successfully loaded curriculum: ${data.name} with ${data.courses.length} courses`);
      return parseCurriculumData(data);
    })
    .catch((error) => {
      console.error("Error loading curriculum data:", error);
      throw error;
    });
}

 