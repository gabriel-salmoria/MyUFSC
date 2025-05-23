import { SchemaType } from "@google/generative-ai";

export const Schema = {
  description: "University Curriculum Structure (3 Letters + 4 Digits (or hyphen) Course Codes)\
  The number of phases is correspondant with the totalPhases part",
  type: SchemaType.OBJECT,
  properties: {
    name: {
      type: SchemaType.STRING,
      description: "Curriculum Number and Name (e.g., 203 - Bachelor of Arts in History)",
      nullable: false,
    },
    department: {
      type: SchemaType.STRING,
      description: "Department Name (e.g., History Department)",
      nullable: false,
    },
    id: {
      type: SchemaType.INTEGER,
      description: "Curriculum ID (e.g., 203)",
      nullable: false,
    },
    totalPhases: {
      type: SchemaType.INTEGER,
      description: "Total number of phases, semesters, or years in the curriculum",
      nullable: false,
    },
    courses: {
      type: SchemaType.ARRAY,
      description: "List of courses in the curriculum",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: {
            type: SchemaType.STRING,
            description: "Course ID (3 Letters followed by 4 Digits - e.g., HIS1001) / might be empty for student-chosen courses",
            pattern: "^[A-Za-z]{3}\\d{4}$|^-+.$", // Regular expression to enforce the format
            nullable: false,
          },
          name: {
            type: SchemaType.STRING,
            description: "Course Name (e.g., Introduction to History)",
            nullable: false,
          },
          type: {
            type: SchemaType.BOOLEAN,
            description: "Course Type (mandatory=1, elective=0)",
            nullable: false,
          },
          credits: {
            type: SchemaType.NUMBER,
            description: "Number of credits for the course",
            nullable: false,
          },
          workload: {
            type: SchemaType.INTEGER,
            description: "Workload in hours",
            nullable: false,
          },
          prerequisites: {
            type: SchemaType.ARRAY,
            description: "List of course IDs that are prerequisites",
            items: {
              type: SchemaType.STRING,
              pattern: "^[A-Za-z]{3}\\d{4}|^-+.*$", // Regular expression for prerequisites
            },
            nullable: true,
          },
          equivalents: {
            type: SchemaType.ARRAY,
            description: "List of equivalent course IDs",
            items: {
              type: SchemaType.STRING,
              pattern: "^[A-Za-z]{3}\\d{4}$", // Regular expression for equivalents
            },
            nullable: true,
          },
          description: {
            type: SchemaType.STRING,
            description: "Course Description",
            nullable: false,
          },
          phase: {
            type: SchemaType.INTEGER,
            description: "Phase in the curriculum (e.g., semester number)",
            nullable: true,
          },
        },
        required: [
          "id",
          "name",
          "description",
          "type",
          "phase",
          "credits",
          "workload",
          "prerequisites",
          "equivalents"
        ], // ID, Name, and Description are always required.
      },
    },
  },
  required: ["name", "id", "department", "totalPhases", "courses"],
};
