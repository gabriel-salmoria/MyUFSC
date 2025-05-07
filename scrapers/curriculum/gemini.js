import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Schema } from "./schema.js";

dotenv.config({ path: '../../variables.env' });
const GEMINI_KEY = process.env.GEMINI_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

const model = genAI.getGenerativeModel({
     model: 'gemini-2.5-pro-exp-03-25',
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
  const result = await model.generateContent([
    {
      inlineData: {
        data: Buffer.from(fs.readFileSync("./comp.PDF")).toString("base64"),
        mimeType: "application/pdf",
      },
    },
    prompt
  ]);
  
  const jsonText = result.response.text();
  const data = JSON.parse(jsonText);
  
  // Write both full and compressed versions
  fs.writeFileSync('output-full.json', jsonText);
  
  if (compress) {
    const compressedData = compressCurriculumData(data);
    fs.writeFileSync('output.json', JSON.stringify(compressedData));
  }  
  console.log("JSON data extracted and saved to output.json");
}

generatePdfSummary().catch(console.error); 