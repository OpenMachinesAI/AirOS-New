const fs = require('fs');
let text = fs.readFileSync('App.tsx', 'utf8');

const target = `  useEffect(() => {
     if (connectionState === AppState.ACTIVE && isAsleep) {
         setIsAsleep(false);
         playSound.bubblyStart();
     }
  }, [connectionState, isAsleep]);

`;

text = text.replace(target, '');
text = text.replace('  const awaitingTextTurnReleaseRef = useRef(false);',
`  useEffect(() => {
     if (connectionState === AppState.ACTIVE && isAsleep) {
         setIsAsleep(false);
         playSound.bubblyStart();
     }
  }, [connectionState, isAsleep]);

  const awaitingTextTurnReleaseRef = useRef(false);`);

fs.writeFileSync('App.tsx', text);
