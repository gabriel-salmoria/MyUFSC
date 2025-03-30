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

async function generatePdfSummary() {
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
  
  // Write to JSON file
  fs.writeFileSync('output.json', jsonText);
  
  console.log("JSON data extracted and saved to cs-degree.json");
}

generatePdfSummary().catch(console.error);