const fs = require('fs');
let text = fs.readFileSync('server/constants.ts', 'utf8');

text = text.replace(/    \{\n        type: "function",\n        type: "function",\n        name: "recognize_face",\n        description: "Captures a frame from the camera and uses the Gemini Flash Lite agent to recognize who the user is based on saved family members\. Use this when the user asks \\"who am I\\" or \\"who is this\\"\.",\n        parameters: \{ type: "object", properties: \{\} \}\n    \},\n        name: "start_face_onboarding",/g, 
`    {
        type: "function",
        name: "recognize_face",
        description: "Captures a frame from the camera and uses the Gemini Flash Lite agent to recognize who the user is based on saved family members. Use this when the user asks \\"who am I\\" or \\"who is this\\".",
        parameters: { type: "object", properties: {} }
    },
    {
        type: "function",
        name: "start_face_onboarding",`);

fs.writeFileSync('server/constants.ts', text);
