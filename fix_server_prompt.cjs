const fs = require('fs');
let text = fs.readFileSync('server.ts', 'utf8');

const oldText = 'Look at the current image and identify if any of these known people are present. \\nIf yes, reply ONLY with a comma-separated list of their names. \\nIf nobody from the list is in the image, reply with "NONE".';

const newText = 'Look at the current image and compare it to the reference images of known people provided below.\\nIdentify if any of these known people are present in the current image.\\nIf yes, reply ONLY with a comma-separated list of their exact names as listed above.\\nIf nobody from the list is in the image, or you are unsure, reply with "NONE". Do not include any other text.';

text = text.replace(oldText, newText);

fs.writeFileSync('server.ts', text);
