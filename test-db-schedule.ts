import { executeQuery } from "./database/ready.ts";
async function main() {
  const res = await executeQuery('SELECT "scheduleJson" FROM schedules LIMIT 1');
  console.log(JSON.stringify(res.rows[0].scheduleJson).substring(0, 1000));
}
main();
