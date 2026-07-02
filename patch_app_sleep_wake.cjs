const fs = require('fs');
let text = fs.readFileSync('App.tsx', 'utf8');
text = text.replace(/  useEffect\(\(\) => \{\n     if \(!hasStarted\) return;/, 
`  useEffect(() => {
     if (connectionState === AppState.ACTIVE && isAsleep) {
         setIsAsleep(false);
         playSound.bubblyStart();
     }
  }, [connectionState, isAsleep]);

  useEffect(() => {
     if (!hasStarted) return;`);
fs.writeFileSync('App.tsx', text);
