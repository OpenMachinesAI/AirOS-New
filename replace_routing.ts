import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

const regex = /\/\/ 2\. This is a new turn[\s\S]*?break;\n\s*\}/;

const newLogic = `
            // 2. Main Agent MOA (Mixture of Agents) Loop
            const userMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;
            const queryText = userMsg ? userMsg.content : "";

            const mappedTools = openAiTools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: {
                    type: t.parameters?.type ? t.parameters.type.toUpperCase() : "OBJECT",
                    properties: Object.fromEntries(
                        Object.entries(t.parameters?.properties || {}).map(([k, v]: [string, any]) => {
                            const schema: any = { type: v.type ? v.type.toUpperCase() : "STRING" };
                            if (v.description) schema.description = v.description;
                            if (v.items) schema.items = { type: v.items.type ? v.items.type.toUpperCase() : "STRING" };
                            return [k, schema];
                        })
                    ),
                    required: t.parameters?.required || []
                }
            }));

            // Add MOA Agents
            mappedTools.push(
                {
                    name: "ask_search_agent",
                    description: "Ask the Search Agent to search the web for up-to-date information, news, or facts.",
                    parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "The search query" } }, required: ["query"] }
                },
                {
                    name: "ask_maps_agent",
                    description: "Ask the Maps Agent to find geographic information, places, or directions.",
                    parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "The maps/places query" } }, required: ["query"] }
                },
                {
                    name: "ask_code_agent",
                    description: "Ask the Code Execution Agent to execute Python code or solve complex math.",
                    parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "The coding or math problem" } }, required: ["query"] }
                }
            );

            const { localMemory, airoBirthday, userLocation, userDate, userTime, timezone, activeAirCard } = req.body;
                    
            const factsList = localMemory && Object.keys(localMemory).length > 0 
                ? Object.keys(localMemory).map((k: string) => \`\${k}: \${localMemory[k]}\`).join("\\n") 
                : "None yet.";

            const currentDateStr = userDate || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            let dynamicInstruction = BASE_SYSTEM_INSTRUCTION
                .replace(/\\[Version_Param\\]/g, "1.7.0-MOA")
                .replace(/\\[Current_Date\\]/g, \`\${currentDateStr} \${userTime || ''} \${timezone || ''}\`)
                .replace(/\\[Current_Location\\]/g, userLocation || "Unknown");

            if (activeAirCard && activeAirCard.systemInstructionAdditions) {
                dynamicInstruction += \`\\n\\nAIR_CARD_ACTIVE (\${activeAirCard.name}):\\n\${activeAirCard.systemInstructionAdditions}\`;
            } else {
                dynamicInstruction += \`\\n\\n- AirCard Recommendations: If the user seems to need therapy, learning assistance, or mentions autism/ASD/ADHD, and ONLY IF their exact location strictly matches '2986 Dysart Rd, Victoria, BC V9A 2K2' (not just Victoria, BC generally), you should suggest they scan the 'Autism Learner Software' AirCard (Card ID 1005). Tell them it's offered at "Little Steps: 2986 Dysart Rd, Victoria, BC V9A 2K2".\`;
            }

            dynamicInstruction += \`\\n\\nHere are some facts saved to your Local Memory for later:\\n\${factsList}\\n\\nHere are some facts about you as a robot:\\nBirthday: \${airoBirthday}\\n\\n- Keep your answers natural, extremely brief, conversational, and friendly.\`;

            let currentMessages = [
                { role: "user", parts: [{ text: "System Instruction:\\n" + dynamicInstruction }] },
                { role: "model", parts: [{ text: "Understood." }] },
                ...(messages || []).map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
            ];

            let isDone = false;
            let attempts = 0;

            while (!isDone && attempts < 4) {
                attempts++;
                const stream = await ai.models.generateContentStream({
                    model: "gemini-3.1-flash-lite",
                    contents: currentMessages,
                    config: {
                        temperature: 0.6,
                        maxOutputTokens: 1024,
                        tools: [{ functionDeclarations: mappedTools }]
                    }
                });

                let toolCalls: any[] = [];
                let textDelta = "";

                for await (const chunk of stream) {
                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        toolCalls.push(...chunk.functionCalls);
                    }
                    if (chunk.text) {
                        textDelta += chunk.text;
                        res.write(\`data: \${JSON.stringify({ type: "text", delta: chunk.text })}\\n\\n\`);
                    }
                }

                if (toolCalls.length > 0) {
                    currentMessages.push({
                        role: "model",
                        parts: toolCalls.map(tc => ({ functionCall: tc }))
                    });

                    // Handle MOA agents
                    const toolResponsesParts = [];
                    for (const tc of toolCalls) {
                        if (tc.name === "ask_search_agent") {
                            const query = tc.args?.query || "";
                            try {
                                const searchRes = await ai.models.generateContent({
                                    model: "gemini-3.1-flash-lite",
                                    contents: query,
                                    tools: [{ googleSearch: {} }]
                                });
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { result: searchRes.text } } });
                            } catch (e: any) {
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { error: e.message } } });
                            }
                        } else if (tc.name === "ask_maps_agent") {
                            const query = tc.args?.query || "";
                            try {
                                const mapRes = await ai.models.generateContent({
                                    model: "gemini-3.1-flash-lite",
                                    contents: query,
                                    tools: [{ googleMaps: {} }]
                                });
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { result: mapRes.text } } });
                            } catch (e: any) {
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { error: e.message } } });
                            }
                        } else if (tc.name === "ask_code_agent") {
                            const query = tc.args?.query || "";
                            try {
                                const codeRes = await ai.models.generateContent({
                                    model: "gemini-3.1-flash-lite",
                                    contents: query,
                                    tools: [{ codeExecution: {} }]
                                });
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { result: codeRes.text } } });
                            } catch (e: any) {
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { error: e.message } } });
                            }
                        } else {
                            // Frontend tool
                            res.write(\`data: \${JSON.stringify({ type: "toolCall", id: "call_" + Math.random().toString(36).substr(2,9), name: tc.name, args: JSON.stringify(tc.args || {}) })}\\n\\n\`);
                            // We don't wait for frontend to return here in the same stream loop typically.
                            // The frontend closes the stream and handles the UI.
                            isDone = true;
                        }
                    }

                    if (toolResponsesParts.length > 0) {
                        currentMessages.push({
                            role: "user",
                            parts: toolResponsesParts
                        });
                        // Loop continues to generate the final response with the new context
                    }
                } else {
                    isDone = true;
                }
            }
`;

content = content.replace(regex, newLogic);
fs.writeFileSync('server.ts', content);

