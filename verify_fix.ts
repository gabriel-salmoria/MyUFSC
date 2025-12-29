
import { parseCourses } from "./parsers/curriculum-parser";

const testCases = [
    { input: ["A", "Mandatory String", 0, 0, "", [], [], "mandatory", 1], expected: "mandatory" },
    { input: ["B", "Mandatory Portuguese", 0, 0, "", [], [], "Obrigatória", 1], expected: "mandatory" },
    { input: ["C", "Mandatory Bool True", 0, 0, "", [], [], true, 1], expected: "mandatory" },
    { input: ["D", "Mandatory One", 0, 0, "", [], [], 1, 1], expected: "mandatory" },
    { input: ["E", "Mandatory Mixed case", 0, 0, "", [], [], "Mandatory", 1], expected: "mandatory" },
    { input: ["F", "Optional String", 0, 0, "", [], [], "optional", 0], expected: "optional" },
    { input: ["G", "Optional Empty", 0, 0, "", [], [], null, 0], expected: "optional" },
    { input: ["H", "Optional Zero", 0, 0, "", [], [], 0, 0], expected: "optional" },
    { input: ["I", "Optional False", 0, 0, "", [], [], false, 0], expected: "optional" },
];

console.log("Running parser verification...");
const parsed = parseCourses(testCases.map(tc => tc.input));

let success = true;
parsed.forEach((course, index) => {
    const expected = testCases[index].expected;
    if (course.type !== expected) {
        console.error(`FAIL: ${course.name} (Result: ${course.type}, Expected: ${expected})`);
        success = false;
    } else {
        console.log(`PASS: ${course.name} -> ${course.type}`);
    }
});

if (success) {
    console.log("\nAll parser tests passed!");
} else {
    console.log("\nSome tests failed.");
    process.exit(1);
}
