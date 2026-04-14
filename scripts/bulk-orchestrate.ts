import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PDFS_DIR = path.join(PROJECT_ROOT, 'data/pdfs');

async function runCommand(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: PROJECT_ROOT });
    return stdout;
  } catch (error: any) {
    console.error(`Command failed: ${command}`);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function bulkOrchestrate() {
  if (!fs.existsSync(PDFS_DIR)) {
    console.error(`PDFs directory not found: ${PDFS_DIR}`);
    return;
  }

  const files = fs.readdirSync(PDFS_DIR).filter(f => f.endsWith('.pdf') || f.endsWith('.PDF'));
  
  if (files.length === 0) {
    console.log("No PDFs found to process.");
    return;
  }

  console.log(`Found ${files.length} PDFs to process.`);

  // We should maybe sort them or process one by one
  for (const [index, file] of files.entries()) {
    const pdfPath = path.join(PDFS_DIR, file);
    console.log(`\n[${index + 1}/${files.length}] Processing ${file}...`);
    
    try {
      // Pass the pdf path to orchestrate
      await runCommand(`npx tsx scripts/orchestrate.ts --pdf="${pdfPath}"`);
      console.log(`[SUCCESS] Processed ${file}`);
    } catch (error) {
      console.error(`[FAILED] Error processing ${file}:`, error);
      // Optional: Wait or continue
    }
  }

  console.log('\nBulk orchestration complete!');
}

bulkOrchestrate().catch(console.error);
