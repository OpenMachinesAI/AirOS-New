const fs = require("fs");
const text = fs.readFileSync("App.tsx", "utf8");
let open = 0;
let inString = false;
let stringChar = "";
let inComment = false;
let inMultiComment = false;

for(let i=0; i<text.length; i++) {
  const c = text[i];
  const nextC = text[i+1];
  
  if (inString) {
    if (c === "\\") { i++; continue; }
    if (c === stringChar) { inString = false; }
    continue;
  }
  
  if (inComment) {
    if (c === "\n") inComment = false;
    continue;
  }
  
  if (inMultiComment) {
    if (c === "*" && nextC === "/") { inMultiComment = false; i++; }
    continue;
  }
  
  if (c === '"' || c === "'" || c === "`") {
    inString = true;
    stringChar = c;
    continue;
  }
  
  if (c === "/" && nextC === "/") {
    inComment = true;
    i++;
    continue;
  }
  
  if (c === "/" && nextC === "*") {
    inMultiComment = true;
    i++;
    continue;
  }
  
  if (c === "{") open++;
  if (c === "}") open--;
}
console.log("FINAL open:", open);
