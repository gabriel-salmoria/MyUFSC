import { executeQuery } from "./database/ready.ts";
async function main() {
  try {
      const res = await executeQuery(`
        SELECT
          course->>0 as course_id,
          MIN(split_part("programId", '_', 1)) as base_program,
          (array_agg(course->>1))[1] as name,
          (array_agg(course->>2))[1] as credits,
          (array_agg(course->>3))[1] as workload,
          (array_agg(course->>4))[1] as description,
          (array_agg(course->>8))[1] as phase
        FROM curriculums, jsonb_array_elements("curriculumJson"->'courses') as course
        WHERE course->>0 = ANY($1::text[])
        GROUP BY course_id
      `, [['FSC7152']]);
      console.log(res.rows);
  } catch(e) { console.error(e) }
}
main();
