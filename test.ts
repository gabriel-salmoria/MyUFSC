import { getCurriculumByProgramId } from "./database/curriculum/db-curriculum";

async function run() {
  const c = await getCurriculumByProgramId("208");
  if (c) {
    console.log(c.version);
  } else {
    console.log("null");
  }
  process.exit(0);
}
run();
