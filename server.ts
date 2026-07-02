import express from "express";
import path from "path";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import { BASE_SYSTEM_INSTRUCTION, openAiTools, moaAgentTools, buildActionReference } from "./server/constants";
import fs from "fs";
import crypto from "crypto";

const PORT = 3000;

// Surface crashes instead of letting the process die silently and restart, which would look
// like a mysterious client disconnect with zero server-side trace of the real cause.
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled promise rejection:', reason);
});

// Safe lazy initialization of Gemini Client on the server
const getAIClient = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        throw new Error("GEMINI_API_KEY environment variable is required on the server.");
    }
    return new GoogleGenAI({
        apiKey: key,
        httpOptions: {
            headers: {
                'User-Agent': 'aistudio-build',
            }
        }
    });
};

// The custom "Hey Airo" wake word classifier (public/models/hey_airo.onnx) needs two generic,
// shared openWakeWord preprocessing models to run - a melspectrogram model and a speech embedding
// model. They aren't specific to this wake word and are too large to commit to the repo, so we
// fetch them once on boot into whichever directory is actually served statically.
const WAKE_WORD_MODEL_URLS: Record<string, string> = {
    'melspectrogram.onnx': 'https://github.com/OpenMachinesAI/X/raw/refs/heads/main/models/melspectrogram.onnx',
    'embedding_model.onnx': 'https://github.com/OpenMachinesAI/X/raw/refs/heads/main/models/embedding_model.onnx'
};

async function ensureWakeWordModelsDownloaded() {
    const staticDir = process.env.NODE_ENV === "production"
        ? path.join(process.cwd(), 'dist', 'models')
        : path.join(process.cwd(), 'public', 'models');

    try {
        fs.mkdirSync(staticDir, { recursive: true });
    } catch (e) {}

    for (const [filename, url] of Object.entries(WAKE_WORD_MODEL_URLS)) {
        const destPath = path.join(staticDir, filename);
        if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
            continue;
        }
        try {
            console.log(`[WakeWord] Downloading ${filename}...`);
            const res = await fetch(url);
            if (!res.ok || !res.body) {
                throw new Error(`HTTP ${res.status}`);
            }
            const buffer = Buffer.from(await res.arrayBuffer());
            fs.writeFileSync(destPath, buffer);
            console.log(`[WakeWord] Downloaded ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
        } catch (err: any) {
            console.error(`[WakeWord] Failed to download ${filename}, wake word detection will fall back until this succeeds:`, err.message);
        }
    }
}

async function startServer() {
    await ensureWakeWordModelsDownloaded();

    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
        if (pathname === '/api/live') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
        // DO NOT destroy the socket here. Let other listeners (like Vite's HMR) handle it.
    });

    const debugDataStore: Record<string, any> = {};
    const debugSubscribers: Record<string, express.Response[]> = {};

    app.post("/api/debug/update", express.json({ limit: "50mb" }), (req, res) => {
        const { id, frame, data } = req.body;
        let isViewed = false;
        if (id) {
            debugDataStore[id] = { frame, data, lastUpdate: Date.now() };
            if (debugSubscribers[id] && debugSubscribers[id].length > 0) {
                isViewed = true;
                debugSubscribers[id].forEach(res => res.write(`data: ${JSON.stringify(debugDataStore[id])}\n\n`));
            }
        }
        res.json({ ok: true, isViewed });
    });

    app.get("/api/geocode", async (req, res) => {
        try {
            const { lat, lon } = req.query;
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
                headers: { 'User-Agent': 'AiroKiosk/1.0' }
            });
            const data = await response.json();
            res.json(data);
        } catch (e) {
            console.error('Geocode proxy error:', e);
            res.status(500).json({ error: 'Failed to geocode' });
        }
    });

    app.get("/api/debug/stream/:id", (req, res) => {
        const id = req.params.id;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        
        if (!debugSubscribers[id]) debugSubscribers[id] = [];
        debugSubscribers[id].push(res);
        
        if (debugDataStore[id]) {
            res.write(`data: ${JSON.stringify(debugDataStore[id])}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ ping: true })}\n\n`);
        }
        
        // Keep-alive ping interval
        const intervalId = setInterval(() => {
            res.write(`data: ${JSON.stringify({ ping: true })}\n\n`);
        }, 15000);

        req.on("close", () => {
            clearInterval(intervalId);
            debugSubscribers[id] = debugSubscribers[id].filter(sub => sub !== res);
        });
    });

    app.get("/api/health", (req, res) => {
        res.json({ status: "ok" });
    });

    const errorLogs: any[] = [];

    app.post("/api/error-logs", express.json(), (req, res) => {
        const error = req.body;
        errorLogs.push({ ...error, id: crypto.randomUUID(), receivedAt: Date.now() });
        // Keep only last 100 logs
        if (errorLogs.length > 100) errorLogs.shift();
        res.status(201).json({ status: "logged" });
    });

    app.get("/errorlogs", (req, res) => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>AirOS Error Logs</title>
                <style>
                    body { font-family: monospace; background: #0a0a0a; color: #eee; padding: 20px; }
                    .log-entry { border: 1px solid #333; margin-bottom: 10px; padding: 15px; border-radius: 8px; background: #111; }
                    .RED { border-left: 5px solid #ef4444; }
                    .BLUE { border-left: 5px solid #06b6d4; }
                    .GREEN { border-left: 5px solid #22c55e; }
                    .level { font-weight: bold; padding: 2px 6px; border-radius: 4px; }
                    .RED .level { background: #ef4444; color: white; }
                    .BLUE .level { background: #06b6d4; color: white; }
                    .GREEN .level { background: #22c55e; color: black; }
                    .time { color: #666; font-size: 0.8em; margin-bottom: 5px; }
                    .msg { font-size: 1.1em; margin: 10px 0; color: #fff; }
                    .details { background: #000; padding: 10px; border-radius: 4px; color: #888; font-size: 0.9em; white-space: pre-wrap; }
                    h1 { color: #06b6d4; border-bottom: 1px solid #333; padding-bottom: 10px; }
                    .empty { text-align: center; color: #444; margin-top: 50px; }
                </style>
                <meta http-equiv="refresh" content="30">
            </head>
            <body>
                <h1>AirOS System Error Logs</h1>
                ${errorLogs.length === 0 ? '<div class="empty">No errors recorded yet.</div>' : ''}
                ${errorLogs.slice().reverse().map(log => `
                    <div class="log-entry ${log.level}">
                        <div class="time">${new Date(log.receivedAt).toLocaleString()}</div>
                        <div><span class="level">${log.level}</span></div>
                        <div class="msg">${log.message}</div>
                        ${log.details ? `<div class="details">${log.details}</div>` : ''}
                    </div>
                `).join('')}
            </body>
            </html>
        `;
        res.send(html);
    });

    app.get("/api/search", async (req, res) => {
        const query = req.query.q as string;
        if (!query) {
            res.status(400).json({ error: "Missing query 'q'" });
            return;
        }
        try {
            const ai = getAIClient();
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const searchStream = await ai.models.generateContentStream({
                model: "gemini-3.1-flash-lite",
                contents: query,
                config: {
                    tools: [{ googleSearch: {} }]
                }
            });

            for await (const chunk of searchStream) {
                if (chunk.text) {
                    res.write(`data: ${JSON.stringify({ type: "text", delta: chunk.text })}\n\n`);
                }
            }
            res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
            res.end();
        } catch (err: any) {
            console.error("Backend search error:", err.message);
            res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
            res.end();
        }
    });

    app.get("/api/youtube/search", async (req, res) => {
        const query = req.query.q as string;
        if (!query) {
            res.status(400).json({ error: "Missing query 'q'" });
            return;
        }
        try {
            const ytSearchModule = await import('yt-search');
            const ytSearch = ytSearchModule.default || ytSearchModule;

            // Add timeout wrapper for YouTube search (max 8 seconds)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("YouTube search timeout")), 8000)
            );

            const r = await Promise.race([
                (ytSearch as any)(query),
                timeoutPromise
            ]) as any;
            
            const videos = r.videos;
            if (videos.length === 0) {
                res.status(404).json({ error: "No video found on YouTube" });
                return;
            }

            const videoId = videos[0].videoId;
            const title = videos[0].title;

            res.json({
                videoId,
                title,
                thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1`
            });
        } catch (err: any) {
            console.error("YouTube search error:", err.message);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/recognize-face", express.json({ limit: "50mb" }), async (req, res) => {
        try {
            const { currentFrame, familyMembers } = req.body;
            
            if (!currentFrame || !familyMembers || familyMembers.length === 0) {
                return res.json({ names: [] });
            }

            const geminiKey = process.env.GEMINI_API_KEY;
            if (!geminiKey) {
                return res.status(400).json({ error: "GEMINI_API_KEY missing" });
            }

            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey: geminiKey });

            // Prepare prompt and images
            const base64Data = currentFrame.replace(/^data:image\/\w+;base64,/, "");
            const currentPart = {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg"
                }
            };

            const memberInfo = familyMembers.map((m: any, i: number) => `Person ${i}: ${m.name}`).join("\n");
            const prompt = `Here is a current image from a camera, and a list of known people. 
List of known people:
${memberInfo}

Look at the current image and compare it to the reference images of known people provided below. Identify if any of these known people are present in the current image. 
If yes, reply ONLY with a comma-separated list of their exact names as listed above. 
If nobody from the list is in the image, or you are unsure, reply with "NONE". Do not include any other text.`;

            const parts = [
                prompt,
                currentPart
            ];

            // Add family member reference images
            for (const member of familyMembers) {
                const b64 = member.image.replace(/^data:image\/\w+;base64,/, "");
                parts.push(`Reference for ${member.name}:`);
                parts.push({
                    inlineData: {
                        data: b64,
                        mimeType: "image/jpeg"
                    }
                });
            }

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: parts
            });

            let names: string[] = [];
            if (response.text) {
                const text = response.text.trim();
                if (text && text.toUpperCase() !== "NONE") {
                    names = text.split(",").map((n: string) => n.trim()).filter((n: string) => n.length > 0);
                }
            }

            res.json({ names });
        } catch (err: any) {
            console.error("Face recognition error:", err.message);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/compress-memory", express.json(), async (req, res) => {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) return res.status(500).json({ error: "Missing Gemini API Key" });

            const { messages, currentMemory } = req.body;
            
            const ai = getAIClient();
            
            const prompt = `You are a memory compression agent for a robot assistant named Airow.
Here is the current long-term memory:
${JSON.stringify(currentMemory || {}, null, 2)}

Here is the recent conversation history that has become too long:
${JSON.stringify(messages, null, 2)}

Please extract any new, important facts, user preferences, names, or relevant context from the conversation history that should be remembered long-term.
Merge this new information with the current long-term memory.
Return ONLY a valid JSON object representing the updated memory dictionary, where keys are descriptive labels (e.g., 'UserFavoriteColor') and values are the facts. Do not wrap in markdown blocks, just return raw JSON.`;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json"
                }
            });
            
            let updatedMemory = currentMemory || {};
            try {
                const text = response.text?.trim().replace(/^```json/, '').replace(/```$/, '').trim() || "{}";
                updatedMemory = JSON.parse(text);
            } catch (e) {
                console.error("Failed to parse memory json", e);
            }

            res.json({ memory: updatedMemory });
        } catch (err: any) {
            console.error("Memory compression error:", err.message);
            res.status(500).json({ error: err.message });
        }
    });


    app.get("/api/latest-version", async (req, res) => {
        try {
            const info = require("./release_info.json");
            res.json(info);
        } catch (e) {
            res.status(500).json({ error: "Failed to load version info" });
        }
    });

    // Groq Non-Realtime (Cloud 3-Step) Chat completions API
    app.post("/api/chat", express.json(), async (req, res) => {
        let messages: any[] = [];
        try {
            messages = req.body.messages || [];
            const { userLocation, photoData } = req.body;
            // Use Gemini
            const ai = getAIClient();

            // Establish Server-Sent Events (SSE) streaming
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const CURATED_NEWS_STORIES = [
                {
                    index: 0,
                    title: "NASA's Voyager 1 Sends Engineering Data From 15 Billion Miles Away",
                    source: "SpaceNews",
                    summary: "Voyager 1 is communicating normally again after engineers bypassed a faulty chip in its memory system."
                },
                {
                    index: 1,
                    title: "New Room-Temperature Superconductor Claims Verified by Independent Lab",
                    source: "ScienceDaily",
                    summary: "A research team successfully replicated zero electrical resistance in a modified copper-lead alloy at room temperature."
                },
                {
                    index: 2,
                    title: "Gemini 3.5 Released with 10x Faster Realtime Audio & Coding Agent Abilities",
                    source: "TechCrunch",
                    summary: "Google AI Studio launched its latest model featuring native speech synthesis and fully agentic development loops."
                }
            ];

            // 1. Check if the turn is a continuation of a tool execution
            const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;
            if (lastMessage && lastMessage.role === "tool") {
                const toolName = lastMessage.name;
                const toolOutput = lastMessage.content || "";

                if (toolName === "get_weather") {
                    // Weather response summary
                    const prompt = `You are Airow, a friendly voice assistant. The user requested the weather, and you ALREADY successfully queried the live weather API which returned the following real-time data:
${toolOutput}
Read out a brief, warm, conversational summary of the current weather and temperature from this exact data (1-2 sentences max). Start directly with the current conditions. Do NOT say you don't have the info, do NOT say you are unable to access real-time data, and do NOT apologize, because the real-time data is literally provided right above!`;
                    
                    const response = await ai.models.generateContentStream({
                        contents: prompt,
                        model: "gemini-3.1-flash-lite",
                        config: { temperature: 0.6, maxOutputTokens: 500 }
                    });

                    for await (const chunk of response) {
                        const delta = chunk.text;
                        if (delta) {
                            res.write(`data: ${JSON.stringify({ type: "text", delta })}\n\n`);
                        }
                    }
                } 
                else if (toolName === "get_active_timers") {
                    // Timer summary response
                    const prompt = `You are Airow, a friendly voice assistant. Inform the user about their active timers. The timer system returned:
${toolOutput}
Keep your response brief and conversationally natural (e.g. "You have an egg timer with 2 minutes left." or "There are no timers currently set.").`;
                    
                    const response = await ai.models.generateContentStream({
                        contents: prompt,
                        model: "gemini-3.1-flash-lite",
                        config: { temperature: 0.5, maxOutputTokens: 500 }
                    });

                    for await (const chunk of response) {
                        const delta = chunk.text;
                        if (delta) {
                            res.write(`data: ${JSON.stringify({ type: "text", delta })}\n\n`);
                        }
                    }
                }
                else if (toolName === "request_next_headline") {
                    // News pacing flow
                    let hasMore = false;
                    let index = 0;
                    let headline: any = null;
                    try {
                        const parsedTool = JSON.parse(toolOutput);
                        hasMore = parsedTool.hasMore;
                        index = parsedTool.index;
                        headline = parsedTool.headline;
                    } catch (e) {}

                    if (headline) {
                        const messageText = `Story number ${index + 1} from ${headline.source || "News"}: ${headline.title}. ${headline.summary}`;
                        res.write(`data: ${JSON.stringify({ type: "text", delta: messageText })}\n\n`);
                        
                        if (hasMore) {
                            // Queue up the highlight & next headline call silently
                            res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_next_hl_inst", name: "request_next_headline", args: "{}" })}\n\n`);
                        } else {
                            res.write(`data: ${JSON.stringify({ type: "text", delta: " That concludes today's news briefing." })}\n\n`);
                        }
                    } else {
                        res.write(`data: ${JSON.stringify({ type: "text", delta: "No more headlines left." })}\n\n`);
                    }
                }
                else if (toolName === "search_web") {
                    // Web search summarization
                    const originalUserMessage = messages.slice().reverse().find((m: any) => m.role === "user")?.content || "";
                    const prompt = `You are Airow, a friendly voice assistant. Summarize the web search results to answer the user's question.
User question: "${originalUserMessage}"
Search Results snippet: "${toolOutput}"
Provide a highly helpful, direct, and conversationally natural answer (2-4 sentences max).`;

                    const response = await ai.models.generateContentStream({
                        contents: prompt,
                        model: "gemini-3.1-flash-lite",
                        config: { temperature: 0.6, maxOutputTokens: 1024 }
                    });

                    for await (const chunk of response) {
                        const delta = chunk.text;
                        if (delta) {
                            res.write(`data: ${JSON.stringify({ type: "text", delta })}\n\n`);
                        }
                    }
                }
                else if (toolName === "save_to_memory") {
                    res.write(`data: ${JSON.stringify({ type: "text", delta: "Got it! I will remember that for later." })}\n\n`);
                }
                else {
                    const originalUserMessage = messages.slice().reverse().find((m: any) => m.role === "user")?.content || "the last action";
                    const prompt = `You are Airow, a friendly voice assistant. You just executed the tool '${toolName}' and it returned:
${toolOutput}
Provide a brief, conversational confirmation or summary to the user (1-2 sentences max) acknowledging this action. Do not say 'I have executed the tool'. Just acknowledge it naturally.`;
                    
                    const response = await ai.models.generateContentStream({
                        contents: prompt,
                        model: "gemini-3.1-flash-lite",
                        config: { temperature: 0.6, maxOutputTokens: 500 }
                    });

                    for await (const chunk of response) {
                        const delta = chunk.text;
                        if (delta) {
                            res.write(`data: ${JSON.stringify({ type: "text", delta })}\n\n`);
                        }
                    }
                }

                res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
                res.end();
                return;
            }

            
            // 2. Main Agent MOA (Mixture of Agents) Loop
            const userMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;
            const queryText = userMsg ? userMsg.content : "";

            const mappedTools = [...openAiTools, ...moaAgentTools].map(t => ({
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

            const { localMemory, airoBirthday, userDate, userTime, timezone, activeAirCard, airoFlags } = req.body;

                    
            const factsList = localMemory && Object.keys(localMemory).length > 0 
                ? Object.keys(localMemory).map((k: string) => `${k}: ${localMemory[k]}`).join("\n") 
                : "None yet.";

            const currentDateStr = userDate || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            let dynamicInstruction = BASE_SYSTEM_INSTRUCTION
                .replace(/\[Version_Param\]/g, "1.7.0-MOA")
                .replace(/\[Current_Date\]/g, `${currentDateStr} ${userTime || ''} ${timezone || ''}`)
                .replace(/\[Current_Location\]/g, userLocation || "Unknown");

            if (airoFlags?.requireActionConfirmation) {
                dynamicInstruction += "\n\nCRITICAL: requireActionConfirmation is ON. You MUST ask for confirmation before calling 'take_photo' or 'get_weather' if the user's request is ambiguous or if they didn't explicitly ask you to do it.";
            }

            if (activeAirCard && activeAirCard.systemInstructionAdditions) {
                dynamicInstruction += `\n\nAIR_CARD_ACTIVE (${activeAirCard.name}):\n${activeAirCard.systemInstructionAdditions}`;
            } else {
                dynamicInstruction += `\n\n- AirCard Recommendations: If the user seems to need therapy, learning assistance, or mentions autism/ASD/ADHD, and ONLY IF their exact location strictly matches '2986 Dysart Rd, Victoria, BC V9A 2K2' (not just Victoria, BC generally), you should suggest they scan the 'Autism Learner Software' AirCard (Card ID 1005). Tell them it's offered at "Little Steps: 2986 Dysart Rd, Victoria, BC V9A 2K2".`;
            }

            dynamicInstruction += `\n\nHere are some facts saved to your Local Memory for later:\n${factsList}\n\nHere are some facts about you as a robot:\nBirthday: ${airoBirthday}\n\n- Keep your answers natural, extremely brief, conversational, and friendly.`;

            let currentMessages = [
                { role: "user", parts: [{ text: "System Instruction:\n" + dynamicInstruction }] },
                { role: "model", parts: [{ text: "Understood." }] },
                ...(messages || []).map((m: any, index: number) => {
                    let text = m.content;
                    const parts: any[] = [];
                    if (photoData && Array.isArray(photoData) && index === messages.length - 1 && (m.role === "user" || m.role === "system")) {
                        text = `SYSTEM: Here are some recent photos from the camera feed. Answer naturally as the Airo Robot based on the transcript and photos. If the user refers to something not in the text, look at the photos. USER TRANSCRIPT (not always accurate): ${m.content}`;
                        parts.push({ text });
                        for (const b64 of photoData) {
                            if (b64 && typeof b64 === 'string' && b64.length > 0) {
                                parts.push({
                                    inlineData: {
                                        mimeType: "image/jpeg",
                                        data: b64
                                    }
                                });
                            }
                        }
                    } else {
                        parts.push({ text });
                    }
                    return { role: (m.role === "assistant" || m.role === "model") ? "model" : "user", parts };
                })
            ];

            let isDone = false;
            let attempts = 0;

            while (!isDone && attempts < 3) {
                attempts++;
                const stream = await ai.models.generateContentStream({
                    model: "gemini-3.1-flash-lite",
                    contents: currentMessages,
                    config: {
                        temperature: 0.5,
                        maxOutputTokens: 1024,
                        tools: [{ functionDeclarations: mappedTools as any }],
                        topK: 40,
                        topP: 0.95
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
                        res.write(`data: ${JSON.stringify({ type: "text", delta: chunk.text })}\n\n`);
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
                            res.write(`data: ${JSON.stringify({ type: "text", delta: " Let me look that up... " })}\n\n`);
                            const query = tc.args?.query || "";
                            const promptWithLocation = userLocation ? `My current location is: ${userLocation}. ${query}` : query;
                            try {
                                const searchRes = await ai.models.generateContent({
                                    model: "gemini-3.1-flash-lite",
                                    contents: promptWithLocation,
                                    config: { 
                                        systemInstruction: "You are an internal data retrieval agent. Provide ONLY the facts/results directly. DO NOT greet the user or use conversational filler.",
                                        tools: [{ googleSearch: {} }] 
                                    }
                                });
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { result: searchRes.text } } });
                            } catch (e: any) {
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { error: e.message } } });
                            }
                        } else if (tc.name === "ask_maps_agent") {
                            res.write(`data: ${JSON.stringify({ type: "text", delta: " Let me check the map... " })}\n\n`);
                            const query = tc.args?.query || "";
                            const promptWithLocation = userLocation ? `My current location is: ${userLocation}. ${query}` : query;
                            try {
                                const mapRes = await ai.models.generateContent({
                                    model: "gemini-3.1-flash-lite",
                                    contents: promptWithLocation,
                                    config: {
                                        systemInstruction: "You are an internal data retrieval agent. Provide ONLY the facts/results directly. DO NOT greet the user or use conversational filler.",
                                        tools: [{ googleMaps: {} }]
                                    }
                                });
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { result: mapRes.text } } });
                            } catch (e: any) {
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { error: e.message } } });
                            }
                        } else if (tc.name === "ask_code_agent") {
                            res.write(`data: ${JSON.stringify({ type: "text", delta: " Let me calculate that... " })}\n\n`);
                            const query = tc.args?.query || "";
                            try {
                                const codeRes = await ai.models.generateContent({
                                    model: "gemini-3.1-flash-lite",
                                    contents: query,
                                    config: {
                                        systemInstruction: "You are an internal data retrieval agent. Provide ONLY the facts/results directly. DO NOT greet the user or use conversational filler.",
                                        tools: [{ codeExecution: {} }]
                                    }
                                });
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { result: codeRes.text } } });
                            } catch (e: any) {
                                toolResponsesParts.push({ functionResponse: { name: tc.name, response: { error: e.message } } });
                            }
                        } else {
                            if (tc.name === "search_web") {
                                res.write(`data: ${JSON.stringify({ type: "text", delta: " Let me look that up... " })}\n\n`);
                            }
                            // Frontend tool
                            res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_" + Math.random().toString(36).substr(2,9), name: tc.name, args: JSON.stringify(tc.args || {}) })}\n\n`);
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

            res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
            res.end();
        } catch (err: any) {
            console.error("Gemini chat error details:", err);
            
            // GROQ FALLBACK
            if (process.env.GROQ_API_KEY) {
                try {
                    console.log("Attempting Groq fallback...");
                    res.write(`data: ${JSON.stringify({ type: "text", delta: " Hold on, switching to my backup brain... " })}\n\n`);
                    const groqMessages = (messages || []).map((m: any) => ({
                        role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
                        content: m.content || "action"
                    }));
                    groqMessages.unshift({
                        role: 'system',
                        content: BASE_SYSTEM_INSTRUCTION
                    });
                    
                    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: "llama-3.3-70b-versatile",
                            messages: groqMessages,
                            stream: true
                        })
                    });
                    
                    if (groqRes.ok && groqRes.body) {
                        const reader = groqRes.body.getReader();
                        const decoder = new TextDecoder("utf-8");
                        let buffer = "";
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || "";
                            for (const line of lines) {
                                if (line.trim().startsWith("data: ") && line.trim() !== "data: [DONE]") {
                                    try {
                                        const parsed = JSON.parse(line.trim().substring(6));
                                        const delta = parsed.choices[0]?.delta?.content;
                                        if (delta) {
                                            res.write(`data: ${JSON.stringify({ type: "text", delta })}\n\n`);
                                        }
                                    } catch(e) {}
                                }
                            }
                        }
                        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
                        res.end();
                        return;
                    }
                } catch(groqErr) {
                    console.error("Groq fallback failed:", groqErr);
                }
            }

            let detailMsg = err.message;
            if (err.failed_generation) {
                detailMsg += ` - Failed generation: ${err.failed_generation}`;
            }
            res.write(`data: ${JSON.stringify({ type: "error", error: detailMsg })}\n\n`);
            res.end();
        }
    });

    // Groq Whisper-Large-V3 Speech-to-Text Transcription API
    app.post("/api/spatial-map", express.json({ limit: '50mb' }), async (req, res) => {
        try {
            const { images } = req.body;
            const ai = getAIClient();
            
            const geminiContents: any[] = [
                "You are analyzing a 360-degree scan of a room divided into 12 zones (photos taken at 30-degree intervals). Describe the room layout and identify key objects in each zone. Return a concise spatial map."
            ];

            images.forEach((img: string, i: number) => {
                geminiContents.push(`Zone ${i+1}:`);
                const [header, b64] = img.split(',');
                const mime = header.replace('data:', '').replace(';base64', '');
                geminiContents.push({ inlineData: { data: b64, mimeType: mime } });
            });

            const completion = await ai.models.generateContent({
                model: "gemini-3.1-flash-lite",
                contents: geminiContents
            });
            res.json({ map: completion.text || "Map data unavailable" });
        } catch (e: any) {
            console.error("Map error", e.message || e);
            res.status(500).json({ error: e.message });
        }
    });


    app.post("/api/transcribe", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "15mb" }), async (req, res) => {
        try {
            const buffer = req.body;
            if (!buffer || buffer.length === 0) {
                return res.status(400).json({ error: "No audio stream buffer received." });
            }
            const ai = getAIClient();
            const transcription = await ai.models.generateContent({
                model: "gemini-3.1-flash-lite",
                contents: [
                    {
                        inlineData: {
                            mimeType: "audio/webm",
                            data: buffer.toString("base64")
                        }
                    },
                    "Please transcribe this audio exactly as spoken."
                ]
            });
            res.json({ text: transcription.text });
        } catch (err: any) {
            console.error("Gemini Transcription Error:", err.message);
            res.status(500).json({ error: err.message });
        }
    });


    // Real Edge Text-to-Speech proxy bypassing standard WebSocket browser-enforced origin limits
    // Supports both POST and GET with instant real-time chunked streaming to eliminate latency!
    app.all("/api/tts", express.json(), async (req, res) => {
        try {
            let text = "";
            if (req.method === "POST") {
                text = req.body?.text || "";
            } else if (req.method === "GET") {
                text = (req.query.text as string) || "";
            }

            if (!text) {
                return res.status(400).json({ error: "No text specified." });
            }

            console.log(`[TTS Proxy Stream] Synthesizing: "${text.substring(0, 40)}..."`);

            res.setHeader("Content-Type", "audio/mpeg");
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
            res.setHeader("Transfer-Encoding", "chunked");

            // Attempt Flowery TTS First (with aggressive timeout)
            try {
                const voiceId = "546967cf-bcd9-5ff0-af5a-464cbf65a8f7";
                const floweryUrl = `https://api.flowery.pw/v1/tts?text=${encodeURIComponent(text)}&voice=${voiceId}`;
                const controller = new AbortController();
                const floweryTimeout = setTimeout(() => controller.abort(), 3000); // 3s max for Flowery

                try {
                    const floweryRes = await fetch(floweryUrl, {
                        method: 'GET',
                        signal: controller.signal,
                        headers: {
                            'Accept': 'audio/mpeg',
                            'User-Agent': 'AirowBot/1.0 (https://airow.example.com)'
                        }
                    });

                    if (floweryRes.ok && floweryRes.body) {
                        clearTimeout(floweryTimeout);
                        // Stream Flowery response back directly
                        for await (const chunk of floweryRes.body as any) {
                            res.write(chunk);
                        }
                        res.end();
                        return;
                    }
                    clearTimeout(floweryTimeout);
                    console.warn(`[TTS] Flowery failed (${floweryRes.status}), falling back to Edge.`);
                } catch (floweryErr) {
                    clearTimeout(floweryTimeout);
                    console.warn(`[TTS] Flowery timeout/error, falling back to Edge.`);
                }
            } catch (e: any) {
                console.warn(`[TTS] Flowery pre-flight failed: ${e.message}, using Edge.`);
            }

            // Fallback to Edge TTS
            const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
            const CHROMIUM_FULL_VERSION = "143.0.3650.75";
            const CHROMIUM_MAJOR_VERSION = "143";
            const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

            const muid = crypto.randomBytes(16).toString("hex").toUpperCase();
            const generateSecMsGec = (): string => {
                const WIN_EPOCH = 11644473600;
                const S_TO_NS = 1e9;
                let ticks = Date.now() / 1000;
                ticks += WIN_EPOCH;
                ticks -= ticks % 300;
                ticks *= S_TO_NS / 100;
                const strToHash = `${Math.round(ticks)}${TRUSTED_CLIENT_TOKEN}`;
                return crypto.createHash("sha256").update(strToHash, "ascii").digest("hex").toUpperCase();
            };

            const connectionId = crypto.randomBytes(16).toString("hex").toUpperCase();
            const secMsGec = generateSecMsGec();

            const SYNTH_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

            const client = new WebSocket(SYNTH_URL, {
                headers: {
                    "Pragma": "no-cache",
                    "Cache-Control": "no-cache",
                    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
                    "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
                    "Sec-WebSocket-Version": "13",
                    "Accept-Encoding": "gzip, deflate, br, zstd",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Cookie": `muid=${muid};`
                }
            });

            // Set a safety timeout
            const timeout = setTimeout(() => {
                console.error("[EdgeTTS Proxy] Timeout reached.");
                client.terminate();
                if (!res.writableEnded) {
                    res.end();
                }
            }, 12000);

            client.on("open", () => {
                const configMessage = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{
                    "context": {
                        "synthesis": {
                            "audio": {
                                "metadataoptions": {
                                    "sentenceBoundaryEnabled": "false",
                                    "wordBoundaryEnabled": "false"
                                },
                                "outputFormat": "audio-24khz-96kbitrate-mono-mp3"
                            }
                        }
                    }
                }`;
                client.send(configMessage);

                const requestId = crypto.randomBytes(16).toString("hex").toUpperCase();
                const escapeXml = (unsafe: string) => {
                    return unsafe.replace(/[<>&'"]/g, (c) => {
                        switch (c) {
                            case '<': return '&lt;';
                            case '>': return '&gt;';
                            case '&': return '&amp;';
                            case '\'': return '&apos;';
                            case '"': return '&quot;';
                            default: return c;
                        }
                    });
                };
                const safeText = escapeXml(text);
                const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
                    <voice name="en-US-ChristopherNeural">
                        <prosody pitch="-2Hz" rate="1.05" volume="100">
                            ${safeText}
                        </prosody>
                    </voice>
                </speak>`;
                const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
                client.send(ssmlMessage);
            });

            client.on("message", (data: any, isBinary: boolean) => {
                if (isBinary) {
                    const buffer = Buffer.from(data);
                    const delimiter = "Path:audio\r\n";
                    const delimiterIndex = buffer.indexOf(delimiter);
                    if (delimiterIndex !== -1) {
                        const audioPiece = buffer.subarray(delimiterIndex + delimiter.length);
                        res.write(audioPiece);
                    }
                } else {
                    const textMessage = data.toString();
                    if (textMessage.includes("Path:turn.end")) {
                        clearTimeout(timeout);
                        client.close();
                        res.end();
                    }
                }
            });

            client.on("error", (err) => {
                console.error("[EdgeTTS Proxy] WebSocket error:", err);
                clearTimeout(timeout);
                client.terminate();
                if (!res.writableEnded) {
                    res.end();
                }
            });

            client.on("close", () => {
                clearTimeout(timeout);
                if (!res.writableEnded) {
                    res.end();
                }
            });

        } catch (err: any) {
            console.error("[EdgeTTS Proxy] Outer error:", err);
            if (!res.writableEnded) {
                res.status(500).json({ error: err.message });
            }
        }
    });

    // Ide code generation endpoint
    app.post("/api/ide/generate", express.json(), async (req, res) => {
        try {
            const { prompt, currentCode } = req.body;
            const ai = getAIClient();
            
            const systemPrompt = `You are an expert robot programmer using AirScript. 
AirScript is a JavaScript superset designed for the Aero desktop robot.
The user will describe what they want the robot to do. Write the complete, runnable AirScript to accomplish the task.
Output ONLY the raw JavaScript code without markdown formatting or code blocks.
Here is the API documentation:
airo.say(text): Text-to-speech
airo.setMode(mode): "desktop" or "free"
airo.moveWheel(wheel, speed): wheel is "left"|"right", speed is -100 to 100
airo.spin(direction, speed, duration): direction is "clockwise"|"counterclockwise"
airo.stop(): Stop wheels
airo.getDistance(): distance in cm
airo.isObstacleDetected(): boolean
airo.isEdgeDetected(): boolean
airo.getCamera(): base64 image
airo.showWidget(htmlContent, cssContent, inputs)
airo.clearDisplay()
airo.setLED(led, color): led: "front"|"back"|"left"|"right", color: "red"|"blue"|"off" etc
airo.blink(led, color, duration, count)
airo.allLEDs(color)
airo.getInput(name)
You can use standard javascript async/await. Do not include scriptMetadata unless asked.`;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-pro",
                contents: [
                    { role: "user", parts: [{ text: systemPrompt }] },
                    { role: "model", parts: [{ text: "Understood, I will generate only raw JavaScript code." }] },
                    { role: "user", parts: [{ text: `Current Code (you can replace or modify it):\n${currentCode}\n\nUser Prompt: ${prompt}` }] }
                ]
            });
            let code = response.text || "";
            // strip markdown if the model hallucinates it
            code = code.replace(/^\\s*\`\`\`[a-z]*\\n/i, "").replace(/\\n\`\`\`\\s*$/i, "");
            
            res.json({ code });
        } catch (err: any) {
            console.error("IDE generate error:", err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // WebSocket Server management bridging Client websocket to Gemini Live API
    wss.on("connection", (clientWs) => {
        let geminiWs: WebSocket | null = null;
        let isClosed = false;

        clientWs.on("message", async (data) => {
            try {
                const message = JSON.parse(data.toString());

                if (message.type === 'init') {
                    const { location: userLocation, userTime, userDate, timezone, localMemory, activeAirCard, contextData, airoFlags } = message;
                    const apiKey = process.env.GEMINI_API_KEY;

                    if (!apiKey) {
                        const errMsg = "GEMINI_API_KEY is not defined in the environment. Please add it to your settings.";
                        console.error(errMsg);
                        clientWs.send(JSON.stringify({ type: 'error', error: errMsg }));
                        return;
                    }

                    try {
                        console.log("Connecting to Airo Core API...");
                        const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
                        geminiWs = new WebSocket(geminiUrl);

                        geminiWs.on("open", () => {
                            if (isClosed) {
                                geminiWs?.close();
                                return;
                            }
                            console.log("Connected to Airo Core successfully, sending setup...");
                            // NOTE: We do NOT tell the client the session is 'open' yet - the raw
                            // websocket being open just means we can send the setup message. Gemini
                            // won't actually process realtimeInput/clientContent until it acks with
                            // setupComplete (handled below). Telling the client too early was causing
                            // its first send (including the text-first turn) to race Gemini's setup
                            // and get silently dropped, so the flow fell back to plain audio streaming.

                            // Configure voice and tools using session.update equivalent (setup)
                            const currentDateStr = userDate || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                            const currentTimeStr = userTime || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                            const timezoneStr = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

                            let dynamicInstruction = BASE_SYSTEM_INSTRUCTION
                                .replace(/\[Version_Param\]/g, "1.6.11")
                                .replace(/\[Current_Date\]/g, currentDateStr)
                                .replace(/\[Current_Location\]/g, userLocation || "Unknown");

                            // Add explicit date/time context at the top for maximum clarity
                            dynamicInstruction = `CURRENT CONTEXT - THIS IS REAL TIME INFORMATION, NOT YOUR TRAINING DATA:
- Today's Date: ${currentDateStr}
- Current Time: ${currentTimeStr}
- Timezone: ${timezoneStr}

${dynamicInstruction}`;
                                
                            if (airoFlags?.requireActionConfirmation) {
                                dynamicInstruction += "\n\nCRITICAL: requireActionConfirmation is ON. You MUST ask for confirmation before calling 'take_photo' or 'get_weather' if the user's request is ambiguous or if they didn't explicitly ask you to do it.";
                            }

                            if (contextData) {
                                dynamicInstruction += `\n\nAIRO HARDWARE TELEMETRY:\n`;
                                dynamicInstruction += `- Kinetic State: ${contextData.motion || 'idle'}\n`;
                                dynamicInstruction += `- Precise Location: ${contextData.location ? `${contextData.location.latitude}, ${contextData.location.longitude}` : 'Unknown'}\n`;
                                dynamicInstruction += `- Battery Level: ${contextData.battery ? `${Math.round(contextData.battery.level * 100)}% (${contextData.battery.charging ? 'Charging' : 'Discharging'})` : 'Unknown'}\n`;
                                if (contextData.recognizedNames && contextData.recognizedNames.length > 0) {
                                    dynamicInstruction += `- People currently seen in camera: ${contextData.recognizedNames.join(', ')}. Use this for personalized responses and know who you are talking to.\n`;
                                }
                                if (contextData.talkingCount && contextData.talkingCount > 0) {
                                    dynamicInstruction += `- Visual Mouth Tracking: Detected ${contextData.talkingCount} person(s) actively moving their mouths/talking right now.\n`;
                                }
                                dynamicInstruction += `Use this context if the user asks about how they are moving, battery level, or exact coordinates. DO NOT mention it unprompted unless highly relevant.\n`;
                            }

                            if (activeAirCard && activeAirCard.systemInstructionAdditions) {
                                dynamicInstruction += `\n\nAIR_CARD_ACTIVE (${activeAirCard.name}):\n${activeAirCard.systemInstructionAdditions}`;
                            } else {
                                dynamicInstruction += `\n\n- AirCard Recommendations: If the user seems to need therapy, learning assistance, or mentions autism/ASD/ADHD, and ONLY IF their exact location strictly matches '2986 Dysart Rd, Victoria, BC V9A 2K2' (not just Victoria, BC generally), you should suggest they scan the 'Autism Learner Software' AirCard (Card ID 1005). Tell them it's offered at "Little Steps: 2986 Dysart Rd, Victoria, BC V9A 2K2". Use the 'render_widget' tool to display a helpful popup card about this software recommendation while you tell them about it.`;
                            }

                            const factsList = localMemory && Object.keys(localMemory).length > 0 
                                ? Object.keys(localMemory).map(k => `${k}: ${localMemory[k]}`).join("\n") 
                                : "None yet.";

                            // NOTE: The Live API (BidiGenerateContent) only supports a single declared tool.
                            // All real actions (UI widgets, search, MOA agents, etc.) are exposed through
                            // one dispatcher function, 'execute_action', and documented here as plain text.
                            // The server unwraps calls to it and either executes them itself (MOA agents)
                            // or forwards the unwrapped action to the client (existing UI/tool handlers).
                            const actionReference = buildActionReference([...openAiTools, ...moaAgentTools]);

                            const systemInstructionText = `${dynamicInstruction}\n${userLocation ? `- The user's current approximate location (latitude, longitude) is: ${userLocation}. Use this to tailor local results (weather, places, etc.).` : ''}

Here are some facts and user preferences you know about the user from past conversations or memory (including Spatial maps):
${factsList}

You MUST use these facts to personalize your responses. If they ask about something related to these facts, answer confidently using this information.

CRITICAL - HOW TO PERFORM ACTIONS:
You only have ONE function available: 'execute_action'. To do ANYTHING (show a widget, search the web, set a timer, dance, take a photo, etc.) you MUST call 'execute_action' with:
  - action: the exact action name from the list below
  - args: a plain object with that action's arguments (omit it or pass {} if it takes none)
Example: to search the web, call execute_action with action="search_web" and args={"query": "latest news"}.
Additionally, 'ask_maps_agent' and 'ask_code_agent' delegate to specialized agents for places/directions and code execution/math respectively - use them instead of guessing.

AVAILABLE ACTIONS:
${actionReference}
`;

                            const mappedTools = [{
                                functionDeclarations: [{
                                    name: "execute_action",
                                    description: "Dispatches any Airow action. This is the ONLY function you have - use it for every action listed in your instructions.",
                                    parameters: {
                                        type: "OBJECT",
                                        properties: {
                                            action: { type: "STRING", description: "The exact action name to run, e.g. 'search_web', 'show_timer_widget', 'ask_maps_agent'." },
                                            args: { type: "OBJECT", description: "A plain object with the arguments for that action, matching its schema. Omit or use {} if it takes none." }
                                        },
                                        required: ["action"]
                                    }
                                }]
                            }];

                            const setupMsg = {
                                setup: {
                                    model: "models/gemini-3.1-flash-live-preview",
                                    systemInstruction: { parts: [{text: systemInstructionText}] },
                                    tools: mappedTools,
                                    generationConfig: {
                                         responseModalities: ["AUDIO"],
                                         speechConfig: {
                                              voiceConfig: {
                                                   prebuiltVoiceConfig: {
                                                        voiceName: "Algenib"
                                                   }
                                              }
                                         }
                                    }
                                }
                            };
                            geminiWs?.send(JSON.stringify(setupMsg));
                        });

                        geminiWs.on("message", async (msgData) => {
                            if (isClosed) return;
                            try {
                                const data = JSON.parse(msgData.toString());

                                if (data.setupComplete) {
                                    // THIS is the actual "ready" signal - only now will Gemini accept
                                    // realtimeInput/clientContent. Tell the client it's safe to start
                                    // streaming audio/video and to send its text-first turn, if any.
                                    console.log("Airo Core setup acknowledged - session truly active.");
                                    clientWs.send(JSON.stringify({ type: 'open' }));
                                    return;
                                }

                                if (data.toolCall && data.toolCall.functionCalls) {
                                    // Live API only ever declares one tool ('execute_action'). Unwrap each
                                    // call: MOA agent actions are executed here server-side (mirrors the
                                    // /api/chat MOA loop); everything else is forwarded to the client with
                                    // its real action name so the existing per-tool handlers run unchanged.
                                    const handledResponses: any[] = [];
                                    const forwardedCalls: any[] = [];

                                    for (const fc of data.toolCall.functionCalls) {
                                        const action = fc.args?.action;
                                        // Native object args (not a hand-escaped JSON string) - Gemini fills this
                                        // in directly like any normal function call, which is far more reliable
                                        // than asking the model to correctly escape a nested JSON string.
                                        const parsedArgs: any = (fc.args && typeof fc.args.args === 'object' && fc.args.args !== null) ? fc.args.args : {};

                                        if (action === "ask_search_agent" || action === "ask_maps_agent" || action === "ask_code_agent") {
                                            try {
                                                const ai = getAIClient();
                                                const query = parsedArgs.query || "";
                                                const promptWithLocation = userLocation ? `My current location is: ${userLocation}. ${query}` : query;
                                                const agentSystemInstruction = "You are an internal data retrieval agent. Provide ONLY the facts/results directly. DO NOT greet the user or use conversational filler.";
                                                let agentTool: any;
                                                let agentContents: string;
                                                if (action === "ask_search_agent") {
                                                    agentTool = { googleSearch: {} };
                                                    agentContents = promptWithLocation;
                                                } else if (action === "ask_maps_agent") {
                                                    agentTool = { googleMaps: {} };
                                                    agentContents = promptWithLocation;
                                                } else {
                                                    agentTool = { codeExecution: {} };
                                                    agentContents = query;
                                                }
                                                const agentRes = await ai.models.generateContent({
                                                    model: "gemini-3.1-flash-lite",
                                                    contents: agentContents,
                                                    config: { systemInstruction: agentSystemInstruction, tools: [agentTool] }
                                                });
                                                handledResponses.push({ id: fc.id, name: "execute_action", response: { result: agentRes.text || "" } });
                                            } catch (agentErr: any) {
                                                handledResponses.push({ id: fc.id, name: "execute_action", response: { error: agentErr.message } });
                                            }
                                        } else {
                                            forwardedCalls.push({ id: fc.id, name: action, args: parsedArgs });
                                        }
                                    }

                                    if (handledResponses.length > 0 && geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                                        geminiWs.send(JSON.stringify({ toolResponse: { functionResponses: handledResponses } }));
                                    }
                                    if (forwardedCalls.length > 0) {
                                        clientWs.send(JSON.stringify({ type: 'message', message: { ...data, toolCall: { functionCalls: forwardedCalls } } }));
                                    }
                                    return;
                                }

                                if (data.serverContent || data.connectionStatus) {
                                    clientWs.send(JSON.stringify({ type: 'message', message: data }));
                                }
                            } catch (err: any) {
                                console.error("Error decoding Airo Core message:", err);
                            }
                        });

                        geminiWs.on("close", (code: number, reasonBuf: Buffer) => {
                            if (isClosed) return;
                            console.log(`[LiveSession] Airo Core (Gemini) websocket closed. code=${code} reason="${reasonBuf?.toString() || ''}"`);
                            clientWs.send(JSON.stringify({ type: 'close' }));
                            clientWs.close();
                        });

                        geminiWs.on("error", (err: any) => {
                            if (isClosed) return;
                            console.error("[LiveSession] Airo Core (Gemini) websocket error:", err.message || err);
                            clientWs.send(JSON.stringify({ type: 'error', error: err.message || String(err) }));
                        });

                    } catch (wsErr: any) {
                        console.error("Failed to establish session to Airo Core:", wsErr);
                        clientWs.send(JSON.stringify({ type: 'error', error: wsErr.message || String(wsErr) }));
                    }
                } 
                else if (message.type === 'audio') {
                    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                        // NOTE: realtimeInput.mediaChunks is deprecated by the Live API (Gemini closes
                        // the socket with code 1007 the moment it's used) - send via the dedicated
                        // 'audio' field instead.
                        geminiWs.send(JSON.stringify({
                            realtimeInput: { audio: { mimeType: "audio/pcm;rate=24000", data: message.data } }
                        }));
                    }
                }
                else if (message.type === 'video') {
                    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                        // Same deprecation as above - use the dedicated 'video' field.
                        geminiWs.send(JSON.stringify({
                            realtimeInput: { video: { mimeType: "image/jpeg", data: message.data } }
                        }));
                    }
                }
                else if (message.type === 'toolResponse') {
                    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                        geminiWs.send(JSON.stringify({
                            toolResponse: {
                                // Rewrap back to 'execute_action' - the only tool ever declared to the Live
                                // API - regardless of which real action name the client responded with.
                                functionResponses: message.functionResponses.map((r: any) => ({
                                    id: r.id,
                                    name: "execute_action",
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

        clientWs.on("close", (code: number, reasonBuf: Buffer) => {
            console.log(`[LiveSession] Browser client websocket closed. code=${code} reason="${reasonBuf?.toString() || ''}"`);
            isClosed = true;
            if (geminiWs) {
                try {
                    if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
                        geminiWs.close();
                    }
                } catch (e) {}
            }
        });

        clientWs.on("error", (err: any) => {
            console.error("[LiveSession] Browser client websocket error:", err.message || err);
        });
    });

    // Serve onnxruntime-web WASM files properly under /ort to avoid SPA fallback
    app.use("/ort", express.static(path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist"), {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.wasm')) {
                res.setHeader('Content-Type', 'application/wasm');
            } else if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript');
            }
        }
    }));

    // Vite Integration for development / Static file serving for production
    if (process.env.NODE_ENV !== "production") {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
            server: { 
                middlewareMode: true,
                hmr: {
                    server: server
                }
            },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*all', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
