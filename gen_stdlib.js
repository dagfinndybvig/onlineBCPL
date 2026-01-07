const fs = require('fs');

const syni = fs.readFileSync('../bcpl-js-console/syni', 'utf8');
const trni = fs.readFileSync('../bcpl-js-console/trni', 'utf8');
const cgi = fs.readFileSync('../bcpl-js-console/cgi', 'utf8');
const libhdr = fs.readFileSync('../bcpl-js-console/libhdr', 'utf8');
const fact = fs.readFileSync('../bcpl-js-console/fact.b', 'utf8');

// tail -n +4 trni
// 1 2 3 [4 ...]
const trniLines = trni.split('\n');
// Check if trni starts with newlines as expected
// console.log("TRNI lines 0-5:", trniLines.slice(0, 5));
const trniStripped = trniLines.slice(3).join('\n');

// Ensure newline between syni and trni
// syni ends with "Z\n", trni starts with "JL5..."
const synitrni = syni + "\n" + trniStripped;

const files = {
    "synitrni": synitrni,
    "cgi": cgi,
    "libhdr": libhdr,
    "fact.b": fact
};

const content = `const BCPL_FILES = ${JSON.stringify(files, null, 2)};`;

fs.writeFileSync('js/stdlib.js', content);
console.log("stdlib.js created");
