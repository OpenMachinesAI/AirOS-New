import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const startTag = '// WebSocket Server management bridging Client websocket to x.ai realtime Voice Agent';
const endTag = '// Vite Integration for development / Static file serving for production';

const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag);

if (startIndex === -1 || endIndex === -1) {
    console.error("Tags not found!");
    process.exit(1);
}

const replacement = `// WebSocket Server management bridging Client websocket to Gemini Live API
    wss.on("connection", (clientWs) => {
        let geminiWs: WebSocket | null = null;
        let isClosed = false;

        clientWs.on("message", async (data) => {
            try {
                const message = JSON.parse(data.toString());

                if (message.type === 'init') {
                    const { location: userLocation, userTime, userDate, timezone, localMemory } = message;
                    const apiKey = process.env.GEMINI_API_KEY;

                    if (!apiKey) {
                        const errMsg = "GEMINI_API_KEY is not defined in the environment. Please add it to your settings.";
                        console.error(errMsg);
                        clientWs.send(JSON.stringify({ type: 'error', error: errMsg }));
                        return;
                    }

                    try {
                        console.log("Connecting to Gemini Live API...");
                        const geminiUrl = \`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=\${apiKey}\`;
                        geminiWs = new WebSocket(geminiUrl);

                        geminiWs.on("open", () => {
                            if (isClosed) {
                                geminiWs?.close();
                                return;
                            }
                            console.log("Connected to Gemini Realtime API successfully.");
                            clientWs.send(JSON.stringify({ type: 'open' }));

                            // Configure voice and tools using session.update equivalent (setup)
                            const currentDateStr = userDate || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                            const dynamicInstruction = BASE_SYSTEM_INSTRUCTION
                                .replace(/\\[Version_Param\\]/g, "1.6.2")
                                .replace(/\\[Current_Date\\]/g, \`\${currentDateStr} \${userTime || ''} \${timezone || ''}\`)
                                .replace(/\\[Current_Location\\]/g, userLocation || "Unknown");
                                
                            const factsList = localMemory && Object.keys(localMemory).length > 0 
                                ? Object.keys(localMemory).map(k => \`\${k}: \${localMemory[k]}\`).join("\\n") 
                                : "None yet.";

                            const systemInstructionText = \`\${dynamicInstruction}\\n\${userLocation ? \`- The user's current approximate location (latitude, longitude) is: \${userLocation}. Use this to tailor local results (weather, places, etc.).\` : ''}

Here are some facts and user preferences you know about the user from past conversations or memory (including Spatial maps):
\${factsList}

You MUST use these facts to personalize your responses. If they ask about something related to these facts, answer confidently using this information.
\`;

                            // Map OpenAI tool schema to Gemini format
                            function convertSchema(schema: any): any {
                                if (!schema) return schema;
                                const converted: any = {};
                                if (schema.type) {
                                    converted.type = schema.type.toUpperCase();
                                    if (converted.type === "ARRAY" && schema.items) {
                                    converted.items = convertSchema(schema.items);
                                    }
                                }
                                if (schema.description) converted.description = schema.description;
                                if (schema.enum) converted.enum = schema.enum;
                                if (schema.properties) {
                                    converted.properties = {};
                                    for (let k in schema.properties) {
                                        converted.properties[k] = convertSchema(schema.properties[k]);
                                    }
                                }
                                if (schema.required) converted.required = schema.required;
                                return converted;
                            }
                            
                            const mappedTools = [{
                                functionDeclarations: openAiTools.map(t => ({
                                    name: t.name,
                                    description: t.description,
                                    parameters: t.parameters ? convertSchema(t.parameters) : undefined
                                }))
                            }];

                            const setupMsg = {
                                setup: {
                                    model: "models/gemini-2.0-flash-exp",
                                    systemInstruction: { parts: [{text: systemInstructionText}] },
                                    tools: mappedTools,
                                    generationConfig: {
                                         responseModalities: ["AUDIO"],
                                         speechConfig: {
                                              voiceConfig: {
                                                   prebuiltVoiceConfig: {
                                                        voiceName: "Aoede"
                                                   }
                                              }
                                         }
                                    }
                                }
                            };
                            geminiWs?.send(JSON.stringify(setupMsg));
                        });

                        geminiWs.on("message", (msgData) => {
                            if (isClosed) return;
                            try {
                                const data = JSON.parse(msgData.toString());
                                if (data.serverContent) {
                                    clientWs.send(JSON.stringify({ type: 'message', message: data }));
                                }
                            } catch (err: any) {
                                console.error("Error decoding Gemini message:", err);
                            }
                        });

                        geminiWs.on("close", () => {
                            if (isClosed) return;
                            clientWs.send(JSON.stringify({ type: 'close' }));
                            clientWs.close();
                        });

                        geminiWs.on("error", (err: any) => {
                            if (isClosed) return;
                            clientWs.send(JSON.stringify({ type: 'error', error: err.message || String(err) }));
                        });

                    } catch (wsErr: any) {
                        console.error("Failed to establish session to Gemini:", wsErr);
                        clientWs.send(JSON.stringify({ type: 'error', error: wsErr.message || String(wsErr) }));
                    }
                } 
                else if (message.type === 'audio') {
                    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                        geminiWs.send(JSON.stringify({
                            realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=24000", data: message.data }] }
                        }));
                    }
                } 
                else if (message.type === 'video') {
                    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                        geminiWs.send(JSON.stringify({
                            realtimeInput: { mediaChunks: [{ mimeType: "image/jpeg", data: message.data }] }
                        }));
                    }
                } 
                else if (message.type === 'toolResponse') {
                    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                        geminiWs.send(JSON.stringify({
                            toolResponse: {
                                functionResponses: message.functionResponses.map((r: any) => ({
                                    id: r.id,
                                    name: r.name,
                                    response: r.response
                                }))
                            }
                        }));
                    }
                }
                else if (message.type === 'clientContent') {
                    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                        geminiWs.send(JSON.stringify({
                            clientContent: {
                                turns: message.content?.turns,
                                turnComplete: true
                            }
                        }));
                    }
                }
            } catch (err: any) {
                console.error("Error processing msg on server:", err);
            }
        });

        clientWs.on("close", () => {
            isClosed = true;
            if (geminiWs) {
                try {
                    if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
                        geminiWs.close();
                    }
                } catch (e) {}
            }
        });
    });

    `;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync('server.ts', newContent);
console.log("Replaced successfully");
