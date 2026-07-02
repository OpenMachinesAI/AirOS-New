const fs = require('fs');
let text = fs.readFileSync('App.tsx', 'utf8');

const replacement1 = `  const { lastDetectedPersonXRef, isPersonPresent, isDark, isMotionDetected } = usePersonDetection(hasStarted && !showMainMenu, handlePersonDetected, 180000); // 3 minute cooldown

  const [isAsleep, setIsAsleep] = useState(false);
  const darkTimerRef = useRef<number | null>(null);
  const emptyTimerRef = useRef<number | null>(null);

  useEffect(() => {
     if (!hasStarted) return;
     if (isAsleep) {
         if (isPersonPresent || isMotionDetected || (contextData.motion && contextData.motion !== 'idle')) {
             setIsAsleep(false);
             playSound.bubblyStart();
         }
     } else {
         if (isDark) {
             if (!darkTimerRef.current) darkTimerRef.current = Date.now();
             else if (Date.now() - darkTimerRef.current > 10000) {
                 setIsAsleep(true);
                 playSound.bubblyPop();
                 darkTimerRef.current = null;
                 emptyTimerRef.current = null;
             }
         } else {
             darkTimerRef.current = null;
         }
         
         if (!isPersonPresent) {
             if (!emptyTimerRef.current) emptyTimerRef.current = Date.now();
             else if (Date.now() - emptyTimerRef.current > 60000) {
                 setIsAsleep(true);
                 playSound.bubblyPop();
                 darkTimerRef.current = null;
                 emptyTimerRef.current = null;
             }
         } else {
             emptyTimerRef.current = null;
         }
     }
  }, [isPersonPresent, isDark, isMotionDetected, contextData.motion, isAsleep, hasStarted]);`;

text = text.replace(/  const \{ lastDetectedPersonXRef, isPersonPresent \} = usePersonDetection\(hasStarted && !showMainMenu, handlePersonDetected, 180000\); \/\/ 3 minute cooldown/, replacement1);

const replacement2 = `  let eyeState = EyeState.IDLE;
  if (isAsleep) eyeState = EyeState.SLEEPING;
  else if (isRemoteViewActive) {`;
text = text.replace(/  let eyeState = EyeState\.IDLE;\s+if \(isRemoteViewActive\) \{/, replacement2);

fs.writeFileSync('App.tsx', text);
