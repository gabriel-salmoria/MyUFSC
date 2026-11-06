/**
 * Filters one campus schedule file down to a curriculum's courses.
 *
 * Usage: tsx scrapers/separator/index.ts <curriculum.json> <YYYYS-CAMPUS.json> <out.json>
 *
 * Works for any campus file (FLO, JOI, CBS, ARA, BLN); the output keeps the
 * input's campus key: `{ DATA, <CAMPUS>: [...] }`.
 */
import fs from "fs";
import path from "path";
import {
  campusOf,
  curriculumCourseIds,
  filterSchedule,
  readSchedule,
} from "../../scripts/schedule-files";

function main() {
  const [curriculumArg, scheduleArg, outputArg] = process.argv.slice(2);
  if (!curriculumArg || !scheduleArg || !outputArg) {
    console.error(
      "Usage: tsx scrapers/separator/index.ts <curriculumJsonPath> <scheduleJsonPath> <outputJsonPath>",
    );
    process.exit(1);
  }

  const curriculum = JSON.parse(
    fs.readFileSync(path.resolve(curriculumArg), "utf8"),
  );
  const schedule = readSchedule(path.resolve(scheduleArg));
  const campus = campusOf(schedule);
  if (!campus) {
    console.error(`Error: ${scheduleArg} has no campus array (FLO, BLN, ...).`);
    process.exit(1);
  }

  const filtered = filterSchedule(schedule, curriculumCourseIds(curriculum)) ?? {
    DATA: schedule.DATA,
    [campus]: [],
  };
  fs.writeFileSync(path.resolve(outputArg), JSON.stringify(filtered));
  console.log(
    `${campus}: ${(filtered[campus] as unknown[]).length} of the curriculum's courses have classes → ${outputArg}`,
  );
}

main();
