import { executeQuery } from "../database/ready";

async function main() {
  console.log("Adding updatedAt to reviews table...");
  await executeQuery('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE');
  console.log("Done.");
  process.exit(0);
}

main().catch(console.error);
