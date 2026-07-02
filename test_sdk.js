import { GoogleGenAI } from "@google/genai";
async function test() {
    const ai = new GoogleGenAI({});
    const stream = await ai.models.generateContentStream({
        model: "gemini-3.1-flash-lite",
        contents: "What is the time?",
        config: {
            tools: [{ functionDeclarations: [{ name: "get_time", description: "Get time", parameters: { type: "OBJECT" } }] }]
        }
    });
    for await (const chunk of stream) {
        try {
            if (chunk.text) {
                console.log("Text:", chunk.text);
            }
        } catch(e) {
            console.error("Error accessing text:", e);
        }
    }
}
test();
