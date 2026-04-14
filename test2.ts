import { resolveCurriculumId } from "./database/curriculum/db-curriculum";

async function run() {
  const c = await resolveCurriculumId("208");
  console.log(c);
  process.exit(0);
}
run();
