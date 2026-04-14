import { executeQuery } from "./database/ready.ts";
async function main() {
  const res = await executeQuery('SELECT "curriculumJson" FROM curriculums WHERE "programId" = \'2_20241\'', []);
  if (res.rows.length === 0) {
    console.log("No rows");
    return;
  }
  const courses = res.rows[0].curriculumJson.courses;
  const fsc = courses.filter((c: any) => c[0] === "FSC7152");
  console.log("2_20241:");
  console.log(fsc);
}
main();
