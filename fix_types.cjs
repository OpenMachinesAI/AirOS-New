const fs = require('fs');
let text = fs.readFileSync('types.ts', 'utf8');
text = text.replace(/  REMOTE_VIEW = 'REMOTE_VIEW', \/\/ Remote debugging active \(Green\)/,
  "  REMOTE_VIEW = 'REMOTE_VIEW', // Remote debugging active (Green)\n  SLEEPING = 'SLEEPING', // Sleeping mode");
fs.writeFileSync('types.ts', text);
