const fs = require('fs');
const path = require('path');

// Define paths
const sourcePath = path.resolve(__dirname, '../lib/output.json');
const destPath = path.resolve(__dirname, '../data/cs-degree.json');

// Read the source file
try {
  const data = fs.readFileSync(sourcePath, 'utf8');
  
  // Parse the JSON to validate it
  const jsonData = JSON.parse(data);
  console.log(`Successfully read curriculum data with ${jsonData.courses.length} courses`);
  
  // Write to destination
  fs.writeFileSync(destPath, data);
  console.log(`Successfully copied curriculum data to ${destPath}`);
} catch (err) {
  console.error('Error during file operation:', err);
  process.exit(1);
} 