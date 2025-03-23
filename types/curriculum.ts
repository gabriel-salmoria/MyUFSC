import { ComponentType } from 'react'

// representa uma disciplina
export interface Course {
  ui?: ComponentType<any>    // referencia para o componente de visualizacao da disciplina
  id: string                        // codigo da disciplina (e.g., "INE5407")
  name: string                      // nome da disciplina (e.g., "Digital Systems")
  credits: number                   // numero de creditos
  workload?: number                 // total de horas
  description?: string              // descricao opcional da disciplina
  prerequisites?: string[]          // array de codigos de disciplinas que sao pre-requisitos
  equivalents?: string[]            // array opcional de codigos de disciplinas que sao equivalentes
  type?: "mandatory" | "optional"   // se a disciplina e obrigatoria ou opcional
  phase: number                     // numero da fase recomendada (1-8+)
}

// ta bem simples, basicamente um container
export interface Phase {
  number: number                      // numero da fase (1, 2, 3, etc.)
  name: string                        // nome da fase (pode ter umas fases estranhas pra alguns cursos)
  courses: Course[]                  // disciplinas da fase
}

export interface Curriculum {
  name: string                        // nome do curso do aluno (e.g., "Ciencia da Computacao")
  department: string                  // departamento que oferece o programa
  totalPhases: number                // numero total de fases/semestres
  phases: Phase[]                    // array de fases
}

