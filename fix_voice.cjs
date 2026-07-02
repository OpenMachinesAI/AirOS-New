const fs = require('fs');
let text = fs.readFileSync('components/PredefinedWidgets.tsx', 'utf8');

text = text.replace(/const handleVoiceTrigger = \(e: any\) => \{\s+if \(e\.detail === 'yes'\) handleConfirm\(\);\s+if \(e\.detail === 'no'\) handleCancel\(\);\s+\};/g, 
`const handleVoiceTrigger = (e: any) => {
        const action = (e.detail || '').toLowerCase();
        if (action === 'yes') handleConfirm();
        if (action === 'no') handleCancel();
    };`);
    
text = text.replace(/const handleVoiceTrigger = \(e: any\) => \{\s+if \(!photoData\) return;\s+if \(e\.detail === 'yes' \|\| e\.detail === 'keep'\) handleKeep\(\);\s+if \(e\.detail === 'no' \|\| e\.detail === 'discard'\) handleDiscard\(\);\s+\};/g, 
`const handleVoiceTrigger = (e: any) => {
        if (!photoData) return;
        const action = (e.detail || '').toLowerCase();
        if (action === 'yes' || action === 'keep') handleKeep();
        if (action === 'no' || action === 'discard') handleDiscard();
    };`);

fs.writeFileSync('components/PredefinedWidgets.tsx', text);
