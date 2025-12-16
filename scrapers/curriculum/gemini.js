import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Schema } from "./schema.js";

dotenv.config({ path: '../../variables.env' });
const GEMINI_KEY = process.env.GEMINI_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

const model = genAI.getGenerativeModel({
  model: 'gemini-3-pro-preview',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema,
  }
});

const prompt = 'Extract the data from the PDF file and return it in the JSON format provided in the schema';

/**
 * Compresses the curriculum data by removing redundant information and using arrays
 * @param {Object} data - The full curriculum data
 * @returns {Object} The compressed curriculum data
 */
function compressCurriculumData(data) {
  const compressed = {
    name: data.name,
    id: data.id,
    totalPhases: data.totalPhases,
    department: data.department,
    courses: data.courses.map(course => [
      course.id,                    // 0: id
      course.name,                  // 1: name
      course.credits,               // 2: credits
      course.workload,              // 3: workload
      course.description,           // 4: description
      course.prerequisites || [],   // 5: prerequisites
      course.equivalents || [],     // 6: equivalents
      course.type,                  // 7: type
      course.phase                  // 8: phase
    ])
  };
  return compressed;
}

async function generatePdfSummary(compress = true) {
  const args = process.argv.slice(2);
  const inputPdfPath = args[0] || "./comp.PDF";
  const outputJsonPath = args[1] || "output.json";
  // If provided, write the uncompressed (full) JSON here.
  // If not provided, we won't write it (or could default, but let's be explicit).
  const outputFullJsonPath = args[2];

  const result = await model.generateContent([
    {
      inlineData: {
        data: Buffer.from(fs.readFileSync(inputPdfPath)).toString("base64"),
        mimeType: "application/pdf",
      },
    },
    prompt
  ]);

  const jsonText = result.response.text();
  const data = JSON.parse(jsonText);

  if (outputFullJsonPath) {
    fs.writeFileSync(outputFullJsonPath, jsonText);
    console.log(`Full JSON data saved to ${outputFullJsonPath}`);
  }

  if (compress) {
    const compressedData = compressCurriculumData(data);
    fs.writeFileSync(outputJsonPath, JSON.stringify(compressedData));
  } else {
    // If not compressing, the output path gets the full json anyway
    fs.writeFileSync(outputJsonPath, jsonText);
  }
  console.log(`JSON data extracted and saved to ${outputJsonPath}`);
}

generatePdfSummary().catch(err => {
  console.error(err);
  process.exit(1);
});