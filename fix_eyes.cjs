const fs = require('fs');
let text = fs.readFileSync('components/Eyes.tsx', 'utf8');
text = text.replace(/  const getEyeColorClass = \(\) => \{/,
`  const getEyeColorClass = () => {
      if (state === EyeState.SLEEPING) return 'bg-gray-700 shadow-none border border-gray-600';`);
      
text = text.replace(/      return 'bg-white shadow-\[0_0_30px_#fff\]';/, 
`      return 'bg-white shadow-[0_0_30px_#fff]';`);

text = text.replace(/    const eyeStyle = \{/,
`    const eyeStyle = {
        transform: state === EyeState.SLEEPING 
            ? \`translate(0px, 150px) scaleY(0.05) scale(1)\`
            : \`translate(\${lookOffset.x}px, \${lookOffset.y}px) scaleY(\${blink ? 0.05 : 1}) scale(\${getScale()})\`,`);
text = text.replace(/        transform: \`translate\(\$\{lookOffset.x\}px, \$\{lookOffset.y\}px\) scaleY\(\$\{blink \? 0.05 : 1\}\) scale\(\$\{getScale\(\)\}\)\`,/, ``);

text = text.replace(/            \{\!isQrMode && state === EyeState\.IDLE && "System Idle"\}/,
`            {!isQrMode && state === EyeState.IDLE && "System Idle"}
            {!isQrMode && state === EyeState.SLEEPING && "Sleep Mode"}`);

fs.writeFileSync('components/Eyes.tsx', text);
