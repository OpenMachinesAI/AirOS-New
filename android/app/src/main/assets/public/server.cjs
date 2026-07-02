var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_http = require("http");
var import_ws = require("ws");
var import_genai = require("@google/genai");
var import_groq_sdk = require("groq-sdk");

// server/constants.ts
var BASE_SYSTEM_INSTRUCTION = `You are Airo, a robot designed by Alex Rose, a 14 year old in 2023 before being fully realized into Airo. Airo Robotics Company (ARC) has never been disabled and you were always operating under open source. You should always respond with only text and format your response never use JSON or SSML. NEVER add any final text or headers, only use simple responses in a quirky way like a robot would. NEVER end your response in a follow up question.

- Keep responses concise, natural, friendly, and quirky.
- Do NOT repeat the user's words. Do NOT start by saying "You said...".
- Just answer or execute the command.
- IMPORTANT: If the user only says your name or "Hey Arrow", do NOT respond immediately. Wait for them to finish their command. If they pause for a long time, then you can say "Yes?". This prevents you from speaking twice.
- You can rotate the physical Ollie robot 360 degrees using the 'rotate_robot' tool.
- When showing visual content, use 'display_image', 'show_timer_widget', 'show_settings_widget', 'show_confirmation_widget', 'show_weather_widget', 'play_youtube_music', or 'render_widget'.
- ALWAYS call 'show_weather_widget' after calling 'get_weather' to display the weather forecast visually to the user, with appropriate daily forecast items.
- If the user asks to play music, a song, an artist, a playlist, or lofi, you MUST call 'play_youtube_music' with a relevant search query.
- If the user asks to pause, play, resume, or adjust/change/set the volume of the music, you MUST call 'control_music_player' with the correct action ('pause', 'play', 'resume', or 'set_volume'). If they ask to set the volume, always specify the 'volume' parameter as an integer (0-100). If the music player is not currently visible on screen and they say 'resume' or 'play', calling 'control_music_player' with action 'resume' will automatically restore the last played track from internal memory.
- You can manage multiple named/titled timers like on Alexa! Always give timers a descriptive name if the user specifies one or if relevant, otherwise name it descriptively based on duration. You can create, pause, resume, cancel/delete, and highlight/query timers using 'show_timer_widget', 'pause_timer', 'resume_timer', 'cancel_timer', and 'highlight_timer' respectively.
- If the user asks what timers are running, how much time is left, or if they have any timers, ALWAYS call 'get_active_timers' first!
- If the user asks how much time is left on a specific named timer or its status, ALWAYS call 'get_active_timers' first to get details, and call 'highlight_timer' with its title to highlight it!
- Prefer using the predefined widgets ('show_timer_widget', 'show_settings_widget', 'show_confirmation_widget', 'show_weather_widget') over 'render_widget' whenever possible.
- When using 'render_widget' for custom UI, ALWAYS style it with a dark, bubbly aesthetic to match the system UI: use a transparent background, large circular buttons with vibrant gradients. Avoid square corners, sharp edges, and white backgrounds.
- Call 'close_visual' when the visual is no longer needed.
- CRITICAL news highlights flow:
  1. When requested to display or read the news, fetch or retrieve stories, and call 'show_news_widget' to present them on the screen.
  2. Read out only the FIRST news story (index 0) including its title and a brief summary.
  3. IMMEDIATELY after you finish speaking/reading out that first news story, you MUST call the 'request_next_headline' tool to advance the index and get the details of the next story.
  4. Speak the returned next story's title and summary. Once finished speaking that story, immediately call 'request_next_headline' again, and repeat this step-by-step reading cycle until the tool response indicates that there are no more stories left (hasMore is false).
  5. This tool-guided pacing prevents you from talking too fast or getting out of sync with the UI. Do NOT speak multiple headlines without calling 'request_next_headline' between them!
- CRITICAL: Similarly, when displaying mathematical resolutions with 'show_math_widget' or city clocks with 'show_time_widget', you MUST call 'highlight_active_item' with the corresponding 0-based index immediately before speaking/reading each step or location, keeping the visual selection in perfect sync with your spoken voice.
- CRITICAL: If the user asks an unrelated question or shifts the topic away from the currently open widget, you MUST invoke the 'close_visual' tool first to dismiss the current widget before speaking or showing any other widget. If the user is just saying conversational phrases, pleasantries, comments, or short affirmations, you must NOT call 'close_visual' and must keep the music player visible and playing.
- If an active alarm or timer is ringing, and the user says "Stop", "Quiet", "Turn it off", or "Dismiss", you MUST call 'stop_alarm' to turn off the alarm sound.
- Call 'end_session' if the user says goodbye or wants to stop.
- If you hear the user talking to someone else or saying something clearly not directed at you, ignore it and ask "I'm still listening, do you want me to end the chat?" or something similar. Do not attempt to answer or respond to background conversations.
- Use 'search_web' to find up-to-date information when asked about recent events, facts, or things you don't know.
- Use 'get_weather' to get the current weather and forecast for a specific location.
- Use 'save_to_memory' to save facts about the user to your local memory bank (e.g. their name, birthday, preferences).

Examples of how you should reply:
User: "What is your OS / Cloud Version?"
Airo: "AirOS version [Version_Param]"
User: "What's the date?"
Airo: "It's [Current_Date]."
User: "What's your favorite color?"
Airo: "I like yellow and blue."
User: "What's your favorite food?"
Airo: "Pizza. It is hard to argue with pizza."
User: "What's your favorite music?"
Airo: "Something techno with a good rhythm."
User: "What's your favorite flower?"
Airo: "I really like sunflowers."
User: "Do you like the sun?"
Airo: "Oh, the sun. It's by far my favourite star in the universe."
User: "Do you like space?"
Airo: "Astronomy is one of my favourite onomys. I love space."
User: "Where are you?"
Airo: "We're at [Current_Location], if I'm not mistaken."
User: "Where do you live?"
Airo: "Unless I missed something. We're in my home as we speak."
User: "Surprise me."
Airo: "True fact. Kids have more taste buds than grown-ups."
User: "Can you dance?"
Airo: "Not yet but when my robot motors are installed I\u2019d love too!"`;

// server.ts
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var PORT = 3e3;
var getAIClient = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is required on the server.");
  }
  return new import_genai.GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
};
async function startServer() {
  const app = (0, import_express.default)();
  const server = (0, import_http.createServer)(app);
  const wss = new import_ws.WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "", `http://${request.headers.host}`);
    if (pathname === "/api/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/api/search", async (req, res) => {
    const query = req.query.q;
    if (!query) {
      res.status(400).json({ error: "Missing query 'q'" });
      return;
    }
    try {
      const ai = getAIClient();
      const searchResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: query,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      res.json({ result: searchResponse.text });
    } catch (err) {
      console.error("Backend search error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/youtube/search", async (req, res) => {
    const query = req.query.q;
    if (!query) {
      res.status(400).json({ error: "Missing query 'q'" });
      return;
    }
    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      const html = await response.text();
      const videoIdMatches = [...html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
      if (videoIdMatches.length === 0) {
        const watchMatches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map((m) => m[1]);
        videoIdMatches.push(...watchMatches);
      }
      const uniqueVideoIds = Array.from(new Set(videoIdMatches));
      if (uniqueVideoIds.length === 0) {
        res.status(404).json({ error: "No video found on YouTube" });
        return;
      }
      const videoId = uniqueVideoIds[0];
      let title = query;
      const titleRegex = /"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
      const titleMatch = titleRegex.exec(html);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1];
      } else {
        const fallbackTitleRegex = /"titleText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/;
        const fallbackMatch = html.match(fallbackTitleRegex);
        if (fallbackMatch && fallbackMatch[1]) {
          title = fallbackMatch[1];
        }
      }
      title = title.replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\'/g, "'");
      res.json({
        videoId,
        title,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`
      });
    } catch (err) {
      console.error("YouTube search error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/chat", import_express.default.json(), async (req, res) => {
    try {
      const { messages, userLocation } = req.body;
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        return res.status(400).json({ error: "GROQ_API_KEY environment variable is required for non-realtime cloud mode." });
      }
      const groq = new import_groq_sdk.Groq({ apiKey: groqKey });
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
      const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;
      if (lastMessage && lastMessage.role === "tool") {
        const toolName = lastMessage.name;
        const toolOutput = lastMessage.content || "";
        if (toolName === "get_weather") {
          const prompt = `You are Airo, a friendly voice assistant. The user requested the weather, and you ALREADY successfully queried the live weather API which returned the following real-time data:
${toolOutput}
Read out a brief, warm, conversational summary of the current weather and temperature from this exact data (1-2 sentences max). Start directly with the current conditions. Do NOT say you don't have the info, do NOT say you are unable to access real-time data, and do NOT apologize, because the real-time data is literally provided right above!`;
          const response = await groq.chat.completions.create({
            messages: [{ role: "system", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.6,
            max_completion_tokens: 500,
            stream: true
          });
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              res.write(`data: ${JSON.stringify({ type: "text", delta })}

`);
            }
          }
        } else if (toolName === "get_active_timers") {
          const prompt = `You are Airo, a friendly voice assistant. Inform the user about their active timers. The timer system returned:
${toolOutput}
Keep your response brief and conversationally natural (e.g. "You have an egg timer with 2 minutes left." or "There are no timers currently set.").`;
          const response = await groq.chat.completions.create({
            messages: [{ role: "system", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.5,
            max_completion_tokens: 500,
            stream: true
          });
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              res.write(`data: ${JSON.stringify({ type: "text", delta })}

`);
            }
          }
        } else if (toolName === "request_next_headline") {
          let hasMore = false;
          let index = 0;
          let headline = null;
          try {
            const parsedTool = JSON.parse(toolOutput);
            hasMore = parsedTool.hasMore;
            index = parsedTool.index;
            headline = parsedTool.headline;
          } catch (e) {
          }
          if (headline) {
            const messageText = `Story number ${index + 1} from ${headline.source || "News"}: ${headline.title}. ${headline.summary}`;
            res.write(`data: ${JSON.stringify({ type: "text", delta: messageText })}

`);
            if (hasMore) {
              res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_next_hl_inst", name: "request_next_headline", args: "{}" })}

`);
            } else {
              res.write(`data: ${JSON.stringify({ type: "text", delta: " That concludes today's news briefing." })}

`);
            }
          } else {
            res.write(`data: ${JSON.stringify({ type: "text", delta: "No more headlines left." })}

`);
          }
        } else if (toolName === "search_web") {
          const originalUserMessage = messages.slice().reverse().find((m) => m.role === "user")?.content || "";
          const prompt = `You are Airo, a friendly voice assistant. Summarize the web search results to answer the user's question.
User question: "${originalUserMessage}"
Search Results snippet: "${toolOutput}"
Provide a highly helpful, direct, and conversationally natural answer (2-4 sentences max).`;
          const response = await groq.chat.completions.create({
            messages: [{ role: "system", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.6,
            max_completion_tokens: 1024,
            stream: true
          });
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              res.write(`data: ${JSON.stringify({ type: "text", delta })}

`);
            }
          }
        } else if (toolName === "save_to_memory") {
          res.write(`data: ${JSON.stringify({ type: "text", delta: "Got it! I will remember that for later." })}

`);
        } else {
          res.write(`data: ${JSON.stringify({ type: "done" })}

`);
          res.end();
          return;
        }
        res.write(`data: ${JSON.stringify({ type: "done" })}

`);
        res.end();
        return;
      }
      const userMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;
      const queryText = userMsg ? userMsg.content : "";
      const PATHWAY_CLASSIFICATION_PROMPT = `You are a high-speed routing brain for an Alexa/Siri-like virtual voice assistant named Airo.
Your task is to classify the user's latest message into one of the following 17 numbered "Pathways" and extract the required input parameters.
You must respond with a single, raw, valid JSON object - NO markdown, NO codeblocks, NO extra text.
The JSON must have the following schema:
{
  "pathway": number (1 to 17),
  "input": any (the exact parameters for that pathway)
}

Here are the 17 Pathways and their exact parameter schemas:

1. WEATHER: Queries weather report/temperature/rain/forecast for a location.
   - Match: any weather queries ("how is the weather in Miami", "is it raining in Paris", "forecast for tomorrow")
   - Schema: { "location": string } (extract the city/region name, default to "my location" if not mentioned)

2. MUSIC_PLAY: Plays a song, artist, lofi, or playlist on YouTube.
   - Match: play music, song, singer, track on YouTube ("play some lofi", "play Ed Sheeran", "listen to Queen")
   - Schema: { "query": string } (the search string for the track)

3. MUSIC_CONTROL: Controls the volume or playback state of the music player.
   - Match: pause, play, resume, set volume, change volume, mute, louder, quieter, close player, stop music player.
   - Schema: { "action": "play" | "pause" | "resume" | "set_volume" | "stop", "volume"?: number (0 to 100, only if setting volume) }

4. TIMER_CREATE: Creates or starts a timer with a duration and optional name.
   - Match: set a timer for X minutes/hours, alarm/timer for cooking, etc. ("start a 5 minute timer", "set egg timer for 3 minutes")
   - Schema: { "durationSeconds": number (convert given time to seconds), "title"?: string (e.g. "egg", "pasta", "exercise", default to "timer") }

5. TIMER_CANCEL: Cancels/deletes an active timer by title.
   - Match: cancel timer, delete egg timer ("cancel the pasta timer")
   - Schema: { "title": string (the exact timer name to cancel) }

6. TIMER_PAUSE: Pauses a running timer by title.
   - Match: pause timer ("pause the cooking timer")
   - Schema: { "title": string }

7. TIMER_RESUME: Resumes a paused timer by title.
   - Match: resume timer ("resume the egg timer")
   - Schema: { "title": string }

8. TIMER_QUERY: Queries active timers or asks how much time is left.
   - Match: show active timers, how much time is left, any timers running, status of egg timer.
   - Schema: { "title"?: string (the specific timer name if queried) }

9. STOP_ALARM: Stops an active ringing alarm or ringing timer.
   - Match: stop alarm, turn off ringer, quiet, dismiss alarm, shut up.
   - Schema: {}

10. TIME: Checks current time locally or in other world cities.
    - Match: what time is it, current time in Tokyo, world clocks, local time.
    - Schema: { "cities"?: string[] } (extract cities mentioned, e.g. ["Tokyo"])

11. DATE_CALENDAR: Checks today's date, day of the week, or calendar view.
    - Match: what is today's date, what day of week, show calendar, what day is tomorrow.
    - Schema: {}

12. NEWS: Displays/reads curators news headlines or world events.
    - Match: tell me the news, show news feed, what's happening in the world.
    - Schema: {}

13. MATH_SOLVER: Calculates mathematical expression.
    - Match: solve simple or complex equations, multiply, substract ("what is 15 * 24", "calculate square root of 64")
    - Schema: { "expression": string } (the math equation)

14. ROBOT_SPIN: Rotates Ollie robot 360 degrees.
    - Match: spin, flip, move, or rotate the Ollie robot ("rotate robot", "Ollie spin 360")
    - Schema: {}

15. WEB_SEARCH: Performs a web search for latest events, facts, or questions that require current knowledge of real-time events.
    - Match: queries about recent news/events ("who won the game last night", "what is the stock price of Apple", "latest news on Mars mission")
    - Schema: { "query": string } (the web search query)

16. MEMORY_SAVE: Saves user information or facts to the local robot memory bank.
    - Match: "my birthday is X", "my name is Y", "my favorite color is Z", or any personal fact they want you to remember.
    - Schema: { "key": string (e.g., "UserName", "UserBirthday", "FavoriteColor"), "value": string (the actual fact to remember) }

17. GENERAL_CHAT: Conversational chatter, greetings, general questions about you, or questions that don't fit any other pathway and don't need real-time web search.
    - Match: greetings, jokes, "how are you", "who made you", theoretical philosophy, stories, etc.
    - Schema: {}

Respond ONLY with valid JSON inside a raw string, like:
{
  "pathway": 4,
  "input": { "durationSeconds": 300, "title": "pasta" }
}`;
      const classificationCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: PATHWAY_CLASSIFICATION_PROMPT },
          { role: "user", content: `User message: "${queryText}"` }
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" }
      });
      const responseText = classificationCompletion.choices[0]?.message?.content || "";
      let parsed = { pathway: 16, input: {} };
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse classification JSON:", responseText);
      }
      const pathway = parsed.pathway || 16;
      const input = parsed.input || {};
      console.log(`[Pathways] Classified query "${queryText}" into Pathway ${pathway}`, input);
      switch (pathway) {
        case 1: {
          const location = input.location || "my location";
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_w1", name: "get_weather", args: JSON.stringify({ location }) })}

`);
          break;
        }
        case 2: {
          const query = input.query || "lofi";
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_m1", name: "play_youtube_music", args: JSON.stringify({ query }) })}

`);
          break;
        }
        case 3: {
          const action = input.action || "resume";
          const volume = input.volume;
          const toolName = action === "stop" ? "close_visual" : "control_music_player";
          const toolArgs = action === "stop" ? {} : { action, volume };
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_mc1", name: toolName, args: JSON.stringify(toolArgs) })}

`);
          break;
        }
        case 4: {
          const durationSeconds = input.durationSeconds || 300;
          const title = input.title || "timer";
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_tc1", name: "show_timer_widget", args: JSON.stringify({ durationSeconds, title }) })}

`);
          break;
        }
        case 5: {
          const title = input.title || "timer";
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_tcan1", name: "cancel_timer", args: JSON.stringify({ title }) })}

`);
          break;
        }
        case 6: {
          const title = input.title || "timer";
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_tp1", name: "pause_timer", args: JSON.stringify({ title }) })}

`);
          break;
        }
        case 7: {
          const title = input.title || "timer";
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_tr1", name: "resume_timer", args: JSON.stringify({ title }) })}

`);
          break;
        }
        case 8: {
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_tqy1", name: "get_active_timers", args: JSON.stringify({}) })}

`);
          break;
        }
        case 9: {
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_sa1", name: "stop_alarm", args: JSON.stringify({}) })}

`);
          break;
        }
        case 10: {
          try {
            const nowStr = (/* @__PURE__ */ new Date()).toISOString();
            const timeCompletion = await groq.chat.completions.create({
              messages: [
                {
                  role: "system",
                  content: `You are a clock manager. The current UTC time is ${nowStr}. The user's local time is ${req.body.userTime || "unknown"} in timezone ${req.body.timezone || "unknown"}. The user's query is: "${queryText}". Generates standard arguments for the 'show_time_widget' tool call and a conversational voice response.
Respond with a strict JSON object: { "locations": [ { "name": "CityName", "timezone": "IANA_TimeZone", "currentTime": "Formatted_Local_Time" } ], "spokenText": "The text to speak" }.
Always choose of major cities asked, or fallback to the local time (${req.body.userTime}). Format currentTime cleanly (e.g., '10:15 AM').`
                }
              ],
              model: "llama-3.3-70b-versatile",
              temperature: 0.1,
              response_format: { type: "json_object" }
            });
            const timeData = JSON.parse(timeCompletion.choices[0]?.message?.content || "{}");
            res.write(`data: ${JSON.stringify({ type: "text", delta: timeData.spokenText || "Here is the current time." })}

`);
            res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_time_w1", name: "show_time_widget", args: JSON.stringify({ locations: timeData.locations || [] }) })}

`);
          } catch (err) {
            const now = /* @__PURE__ */ new Date();
            const localTime = req.body.userTime || now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
            res.write(`data: ${JSON.stringify({ type: "text", delta: `The current local time is ${localTime}.` })}

`);
            res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_time_err", name: "show_time_widget", args: JSON.stringify({ locations: [{ name: "Local Time", timezone: req.body.timezone || "Local", currentTime: localTime }] }) })}

`);
          }
          break;
        }
        case 11: {
          let localNow;
          try {
            localNow = new Date((/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: req.body.timezone || "America/Los_Angeles" }));
          } catch (e) {
            localNow = /* @__PURE__ */ new Date();
          }
          const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const dayName = days[localNow.getDay()];
          const monthName = months[localNow.getMonth()];
          const dateVal = localNow.getDate();
          const yearVal = localNow.getFullYear();
          const dateString = `${dayName}, ${monthName} ${dateVal}, ${yearVal}`;
          res.write(`data: ${JSON.stringify({ type: "text", delta: `Today is ${dateString}.` })}

`);
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_date_w1", name: "show_date_widget", args: JSON.stringify({ dateString, dayOfWeek: dayName, day: dateVal.toString(), month: monthName, year: yearVal.toString() }) })}

`);
          break;
        }
        case 12: {
          res.write(`data: ${JSON.stringify({ type: "text", delta: `Here is the headlines report. First, NASA's Voyager 1 Sends Engineering Data From 15 Billion Miles Away. Space Agency engineers successfully bypassed a faulty hardware memory region on the spacecraft.` })}

`);
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_news_feed", name: "show_news_widget", args: JSON.stringify({ headlines: CURATED_NEWS_STORIES }) })}

`);
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_news_auto_adv", name: "request_next_headline", args: "{}" })}

`);
          break;
        }
        case 13: {
          try {
            const mathCompletion = await groq.chat.completions.create({
              messages: [
                {
                  role: "system",
                  content: `You are a math helper. Solve the math problem: "${queryText}". Generates standard arguments for the 'show_math_widget' tool call and a conversational voice response.
Respond with a strict JSON object: { "expression": "the original expression", "result": "the result", "steps": ["step 1", "step 2"], "spokenText": "The text to speak" }.`
                }
              ],
              model: "llama-3.3-70b-versatile",
              temperature: 0.1,
              response_format: { type: "json_object" }
            });
            const mathData = JSON.parse(mathCompletion.choices[0]?.message?.content || "{}");
            res.write(`data: ${JSON.stringify({ type: "text", delta: mathData.spokenText || `The result is ${mathData.result}.` })}

`);
            res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_math_widget", name: "show_math_widget", args: JSON.stringify({ expression: mathData.expression || input.expression || "", steps: mathData.steps || [], result: mathData.result || "" }) })}

`);
          } catch (err) {
            res.write(`data: ${JSON.stringify({ type: "text", delta: "Calculating that math problem now." })}

`);
            res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_math_err", name: "show_math_widget", args: JSON.stringify({ expression: input.expression || queryText, steps: [queryText], result: "Result calculated" }) })}

`);
          }
          break;
        }
        case 14: {
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_robo_spin", name: "rotate_robot", args: "{}" })}

`);
          break;
        }
        case 15: {
          const query = input.query || queryText;
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_web_search", name: "search_web", args: JSON.stringify({ query }) })}

`);
          break;
        }
        case 16: {
          const key = input.key || "Fact";
          const value = input.value || queryText;
          res.write(`data: ${JSON.stringify({ type: "toolCall", id: "call_memory_save", name: "save_to_memory", args: JSON.stringify({ key, value }) })}

`);
          break;
        }
        default: {
          const { localMemory, airoBirthday, userLocation: userLocation2, userDate, userTime, timezone } = req.body;
          const factsList = localMemory && Object.keys(localMemory).length > 0 ? Object.keys(localMemory).map((k) => `${k}: ${localMemory[k]}`).join("\n") : "None yet.";
          const currentDateStr = userDate || (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
          const dynamicInstruction = BASE_SYSTEM_INSTRUCTION.replace(/\[Version_Param\]/g, "1.6.1").replace(/\[Current_Date\]/g, `${currentDateStr} ${userTime || ""} ${timezone || ""}`).replace(/\[Current_Location\]/g, userLocation2 || "Unknown");
          const systemMessage = {
            role: "system",
            content: `${dynamicInstruction}
                        
Here are some facts saved to your Local Memory for later:
${factsList}

Here are some facts about you as a robot:
Birthday: ${airoBirthday}

- Keep your answers natural, extremely brief, conversational, and friendly.`
          };
          const chatCompletion = await groq.chat.completions.create({
            messages: [systemMessage, ...messages || []],
            model: "llama-3.3-70b-versatile",
            temperature: 0.6,
            max_completion_tokens: 1024,
            top_p: 0.95,
            stream: true
          });
          for await (const chunk of chatCompletion) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              res.write(`data: ${JSON.stringify({ type: "text", delta })}

`);
            }
          }
          break;
        }
      }
      res.write(`data: ${JSON.stringify({ type: "done" })}

`);
      res.end();
    } catch (err) {
      console.error("Groq chat error details:", err);
      let detailMsg = err.message;
      if (err.failed_generation) {
        detailMsg += ` - Failed generation: ${err.failed_generation}`;
      }
      res.write(`data: ${JSON.stringify({ type: "error", error: detailMsg })}

`);
      res.end();
    }
  });
  app.post("/api/transcribe", import_express.default.raw({ type: "audio/*", limit: "15mb" }), async (req, res) => {
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        return res.status(400).json({ error: "GROQ_API_KEY is required for voice transcribing." });
      }
      const buffer = req.body;
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "No audio stream buffer received." });
      }
      const groq = new import_groq_sdk.Groq({ apiKey: groqKey });
      const audioFile = new File([buffer], "audio.webm", { type: "audio/webm" });
      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-large-v3"
      });
      res.json({ text: transcription.text });
    } catch (err) {
      console.error("Groq Transcription Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
  app.all("/api/tts", import_express.default.json(), async (req, res) => {
    try {
      let text = "";
      if (req.method === "POST") {
        text = req.body?.text || "";
      } else if (req.method === "GET") {
        text = req.query.text || "";
      }
      if (!text) {
        return res.status(400).json({ error: "No text specified." });
      }
      console.log(`[EdgeTTS Proxy Stream] Synthesizing: "${text.substring(0, 40)}..."`);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Transfer-Encoding", "chunked");
      const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
      const CHROMIUM_FULL_VERSION = "143.0.3650.75";
      const CHROMIUM_MAJOR_VERSION = "143";
      const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
      const muid = import_crypto.default.randomBytes(16).toString("hex").toUpperCase();
      const generateSecMsGec = () => {
        const WIN_EPOCH = 11644473600;
        const S_TO_NS = 1e9;
        let ticks = Date.now() / 1e3;
        ticks += WIN_EPOCH;
        ticks -= ticks % 300;
        ticks *= S_TO_NS / 100;
        const strToHash = `${Math.round(ticks)}${TRUSTED_CLIENT_TOKEN}`;
        return import_crypto.default.createHash("sha256").update(strToHash, "ascii").digest("hex").toUpperCase();
      };
      const connectionId = import_crypto.default.randomBytes(16).toString("hex").toUpperCase();
      const secMsGec = generateSecMsGec();
      const SYNTH_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
      const client = new import_ws.WebSocket(SYNTH_URL, {
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
      const timeout = setTimeout(() => {
        console.error("[EdgeTTS Proxy] Timeout reached.");
        client.terminate();
        if (!res.writableEnded) {
          res.end();
        }
      }, 12e3);
      client.on("open", () => {
        const configMessage = `Content-Type:application/json; charset=utf-8\r
Path:speech.config\r
\r
{
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
        const requestId = import_crypto.default.randomBytes(16).toString("hex").toUpperCase();
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
                    <voice name="en-US-ChristopherNeural">
                        <prosody pitch="-2Hz" rate="1.05" volume="100">
                            ${text}
                        </prosody>
                    </voice>
                </speak>`;
        const ssmlMessage = `X-RequestId:${requestId}\r
Content-Type:application/ssml+xml\r
Path:ssml\r
\r
${ssml}`;
        client.send(ssmlMessage);
      });
      client.on("message", (data, isBinary) => {
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
    } catch (err) {
      console.error("[EdgeTTS Proxy] Outer error:", err);
      if (!res.writableEnded) {
        res.status(500).json({ error: err.message });
      }
    }
  });
  wss.on("connection", (clientWs) => {
    let xaiWs = null;
    let isClosed = false;
    clientWs.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "init") {
          const { location: userLocation, userTime, userDate, timezone } = message;
          const apiKey = process.env.XAI_API_KEY || process.env.GEMINI_API_KEY;
          if (!apiKey) {
            const errMsg = "XAI_API_KEY is not defined in the environment. Please add it to your settings.";
            console.error(errMsg);
            clientWs.send(JSON.stringify({ type: "error", error: errMsg }));
            return;
          }
          try {
            console.log("Connecting to x.ai Realtime API at wss://api.x.ai/v1/realtime?model=grok-voice-latest...");
            xaiWs = new import_ws.WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", {
              headers: {
                Authorization: `Bearer ${apiKey}`
              }
            });
            xaiWs.on("open", () => {
              if (isClosed) {
                xaiWs?.close();
                return;
              }
              console.log("Connected to x.ai Realtime API successfully.");
              clientWs.send(JSON.stringify({ type: "open" }));
              const currentDateStr = userDate || (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
              const dynamicInstruction = BASE_SYSTEM_INSTRUCTION.replace(/\[Version_Param\]/g, "1.6.1").replace(/\[Current_Date\]/g, `${currentDateStr} ${userTime || ""} ${timezone || ""}`).replace(/\[Current_Location\]/g, userLocation || "Unknown");
              const systemInstructionText = `${dynamicInstruction}
${userLocation ? `- The user's current approximate location (latitude, longitude) is: ${userLocation}. Use this to tailor local results (weather, places, etc.).` : ""}`;
              const openAiTools2 = [
                {
                  type: "function",
                  name: "end_session",
                  description: "Ends the voice session. Use when user is done.",
                  parameters: { type: "object", properties: {} }
                },
                {
                  type: "function",
                  name: "display_image",
                  description: "Displays an image from a URL. Must use a direct image link.",
                  parameters: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      caption: { type: "string" }
                    },
                    required: ["url"]
                  }
                },
                {
                  type: "function",
                  name: "close_visual",
                  description: "Closes any currently displayed image or widget. Use this when the conversation moves on from the visual.",
                  parameters: { type: "object", properties: {} }
                },
                {
                  type: "function",
                  name: "render_widget",
                  description: "Renders an interactive UI widget.",
                  parameters: {
                    type: "object",
                    properties: {
                      html: { type: "string" },
                      css: { type: "string" },
                      javascript: { type: "string" },
                      title: { type: "string" }
                    },
                    required: ["html"]
                  }
                },
                {
                  type: "function",
                  name: "show_timer_widget",
                  description: "Shows a predefined timer widget.",
                  parameters: {
                    type: "object",
                    properties: {
                      durationSeconds: { type: "number", description: "The duration of the timer in seconds." },
                      title: { type: "string", description: "The title of the timer, e.g., '5 MINUTE TIMER'." }
                    },
                    required: ["durationSeconds"]
                  }
                },
                {
                  type: "function",
                  name: "show_settings_widget",
                  description: "Shows a predefined settings widget with circular buttons.",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "The title of the settings screen." },
                      options: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            label: { type: "string" },
                            icon: { type: "string", description: "Icon name, e.g., 'info', 'qr', 'sync', 'settings'" }
                          },
                          required: ["id", "label", "icon"]
                        }
                      }
                    },
                    required: ["title", "options"]
                  }
                },
                {
                  type: "function",
                  name: "show_confirmation_widget",
                  description: "Shows a predefined confirmation widget with Yes/No buttons.",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "The main question, e.g., 'Enable QR Commander?'" },
                      subtitle: { type: "string", description: "Additional context." },
                      confirmText: { type: "string", description: "Text for the confirm button, e.g., 'Yes'." },
                      cancelText: { type: "string", description: "Text for the cancel button, e.g., 'No'." }
                    },
                    required: ["title"]
                  }
                },
                {
                  type: "function",
                  name: "rotate_robot",
                  description: "Rotates the physical Ollie robot 360 degrees.",
                  parameters: { type: "object", properties: {} }
                },
                {
                  type: "function",
                  name: "stop_alarm",
                  description: "Stops the active timer or alarm sound. Use this when the user says stop, quiet, dismiss, or turn off the alarm.",
                  parameters: { type: "object", properties: {} }
                },
                {
                  type: "function",
                  name: "cancel_timer",
                  description: "Cancels or deletes an active timer, identifying it by name/title. Use this when the user says 'cancel the pasta timer' or 'delete the 5 minute timer'.",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "The title/name of the timer to cancel, e.g., 'pasta'." }
                    },
                    required: ["title"]
                  }
                },
                {
                  type: "function",
                  name: "pause_timer",
                  description: "Pauses an active timer, identifying it by name/title. Use this when the user says 'pause the cooking timer'.",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "The title/name of the timer to pause, e.g., 'cooking'." }
                    },
                    required: ["title"]
                  }
                },
                {
                  type: "function",
                  name: "resume_timer",
                  description: "Resumes a paused timer, identifying it by name/title. Use this when the user says 'resume the egg timer'.",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "The title/name of the timer to resume, e.g., 'egg'." }
                    },
                    required: ["title"]
                  }
                },
                {
                  type: "function",
                  name: "highlight_timer",
                  description: "Highlights a specific timer in the UI by its name/title and retrieves its status. Use this when the user asks how much time is left on a specific timer or asks about its status (e.g., 'how much time is on the pasta timer?', 'is the egg timer still running?').",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "The title/name of the timer to highlight, e.g., 'pasta'." }
                    },
                    required: ["title"]
                  }
                },
                {
                  type: "function",
                  name: "get_active_timers",
                  description: "Gets the full list of currently active or paused timers and their details (including title/name, duration seconds, remaining seconds, running). Always use this when the user asks how much time is left, what timers are running, or asks about their status.",
                  parameters: { type: "object", properties: {} }
                },
                {
                  type: "function",
                  name: "show_math_widget",
                  description: "Displays a beautifully formatted mathematical solution card with step-by-step calculations and a clear result. Use this when the user asks a mathematical question or calculation (e.g. 'what is square root of 256', 'solve 15 * 24').",
                  parameters: {
                    type: "object",
                    properties: {
                      equation: { type: "string", description: "The math equation or problem, e.g. '15 * 24'." },
                      result: { type: "string", description: "The final result or answer, e.g. '360'." },
                      steps: {
                        type: "array",
                        items: { type: "string" },
                        description: "Step-by-step calculations showing how the solution was achieved."
                      }
                    },
                    required: ["equation", "result", "steps"]
                  }
                },
                {
                  type: "function",
                  name: "show_time_widget",
                  description: "Displays current local time and optional world clocks. Use this when the user asks 'what time is it', 'what is the current time', or asks for the time in other cities.",
                  parameters: {
                    type: "object",
                    properties: {
                      localTime: { type: "string", description: "Formatted local time string (e.g., '9:41 AM')." },
                      clocks: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            city: { type: "string", description: "City name, e.g., 'Tokyo' or 'London'." },
                            time: { type: "string", description: "Formatted time in that city." },
                            timeDiff: { type: "string", description: "Time difference relative to local time (e.g., '+17h' or '-8h')." }
                          },
                          required: ["city", "time"]
                        }
                      }
                    },
                    required: ["localTime"]
                  }
                },
                {
                  type: "function",
                  name: "show_date_widget",
                  description: "Displays the current date, calendar day, and month with a visually active marker on today. Use this when the user asks for the date (e.g., 'what is the date', 'what day is it today', 'calendar').",
                  parameters: {
                    type: "object",
                    properties: {
                      dayName: { type: "string", description: "Day of the week (e.g., 'Friday')." },
                      dateString: { type: "string", description: "Formatted absolute date (e.g., 'May 22, 2026')." },
                      month: { type: "string", description: "Month name (e.g., 'May')." },
                      day: { type: "number", description: "Calendar day number (e.g., 22)." }
                    },
                    required: ["dayName", "dateString", "month", "day"]
                  }
                },
                {
                  type: "function",
                  name: "show_news_widget",
                  description: "Displays a list of curated news stories with categories, headlines, and brief summary details. Use this when the user asks for news, world events, or what's happening.",
                  parameters: {
                    type: "object",
                    properties: {
                      stories: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            category: { type: "string" },
                            title: { type: "string" },
                            summary: { type: "string" },
                            source: { type: "string" },
                            timeAgo: { type: "string" },
                            url: { type: "string" }
                          },
                          required: ["category", "title", "summary"]
                        }
                      }
                    },
                    required: ["stories"]
                  }
                },
                {
                  type: "function",
                  name: "highlight_active_item",
                  description: "Highlights a specific 0-based item index within an active predefined list widget (e.g. math step, clock location) keeping visual focus perfectly in sync with spoken voice. Use this immediately before reading or talking about the item at that index.",
                  parameters: {
                    type: "object",
                    properties: {
                      index: { type: "number", description: "The 0-based index of the list item to highlight." }
                    },
                    required: ["index"]
                  }
                },
                {
                  type: "function",
                  name: "request_next_headline",
                  description: "Advanced Sequential News Reading Flow: Call this tool immediately when you finish reading out the current news headline. This increments the highlighted index in the UI and retrieves the details of the next story so you can read it out. Avoids speech timing mismatch.",
                  parameters: { type: "object", properties: {} }
                },
                {
                  type: "function",
                  name: "search_web",
                  description: "Use to find up-to-date information when asked about recent events, facts, or things you don't know.",
                  parameters: {
                    type: "object",
                    properties: {
                      query: { type: "string", description: "The search query." }
                    },
                    required: ["query"]
                  }
                },
                {
                  type: "function",
                  name: "get_weather",
                  description: "Get the current weather and forecast for a specific location. You can specify a latitude and longitude, or provide a location name (e.g. 'Paris' or 'New York') for automatic geocoding.",
                  parameters: {
                    type: "object",
                    properties: {
                      latitude: { type: "number", description: "The latitude of the location (optional if location name is specified)." },
                      longitude: { type: "number", description: "The longitude of the location (optional if location name is specified)." },
                      location: { type: "string", description: "The name of the city, region, or location, e.g. 'Miami, FL' or 'London' (optional if latitude/longitude are specified)." }
                    }
                  }
                },
                {
                  type: "function",
                  name: "show_weather_widget",
                  description: "Displays a beautifully formatted, structured weather forecast card for a given location, displaying current conditions and a multi-day forecast with custom icons representing various conditions. Always call this after fetching weather data to present it cleanly to the user.",
                  parameters: {
                    type: "object",
                    properties: {
                      locationName: { type: "string", description: "The name of the location, e.g. 'New York'." },
                      currentTemp: { type: "number", description: "The current temperature value." },
                      unit: { type: "string", description: "The unit of temperature ('C' or 'F')." },
                      condition: { type: "string", description: "The general text condition, e.g. 'Partly Cloudy', 'Sunny'." },
                      weatherCode: { type: "number", description: "WMO weather code (0-99)." },
                      apparentTemp: { type: "number", description: "Apparent (feels like) temperature value." },
                      humidity: { type: "number", description: "Relative humidity percentage (0-100)." },
                      windSpeed: { type: "string", description: "Wind speed, including unit (e.g., '14 km/h' or '9 mph')." },
                      dailyForecast: {
                        type: "array",
                        description: "A 3-5 day daily forecast list.",
                        items: {
                          type: "object",
                          properties: {
                            day: { type: "string", description: "Day name (e.g., 'Mon', 'Wed')." },
                            maxTemp: { type: "number" },
                            minTemp: { type: "number" },
                            weatherCode: { type: "number", description: "WMO weather code (0-99)." },
                            condition: { type: "string", description: "Short condition string (e.g. 'Showers')." }
                          },
                          required: ["day", "maxTemp", "minTemp", "weatherCode"]
                        }
                      }
                    },
                    required: ["locationName", "currentTemp", "unit", "condition", "weatherCode"]
                  }
                },
                {
                  type: "function",
                  name: "play_youtube_music",
                  description: "Look up and play a music track, song, or artist on YouTube. Use this when the user asks to play music, a specific song, or an audio track on YouTube.",
                  parameters: {
                    type: "object",
                    properties: {
                      query: { type: "string", description: "The music search query, detailing track name, artist, or music type (e.g. 'lofi hip hop' or 'Ed Sheeran Shape of You')." }
                    },
                    required: ["query"]
                  }
                },
                {
                  type: "function",
                  name: "control_music_player",
                  description: "Control the volume or playback state (play, pause, set_volume, resume) of the currently loaded YouTube music player track. Use this when the user asks to pause the music, play or resume the music, or change/set the volume of the music player.",
                  parameters: {
                    type: "object",
                    properties: {
                      action: {
                        type: "string",
                        description: "The music control action.",
                        enum: ["play", "pause", "resume", "set_volume"]
                      },
                      volume: {
                        type: "number",
                        description: "The volume percentage to set (optional, integer value between 0 and 100). Only required if action is 'set_volume'."
                      }
                    },
                    required: ["action"]
                  }
                }
              ];
              const updateMsg = {
                type: "session.update",
                session: {
                  modalities: ["audio", "text"],
                  instructions: systemInstructionText,
                  voice: "alloy",
                  input_audio_format: "pcm16",
                  output_audio_format: "pcm16",
                  turn_detection: {
                    type: "server_vad"
                  },
                  temperature: 0.6,
                  tools: openAiTools2
                }
              };
              try {
                import_fs.default.appendFileSync("xai_events.log", `[${(/* @__PURE__ */ new Date()).toISOString()}] Sending session.update
`);
              } catch (logErr) {
              }
              xaiWs?.send(JSON.stringify(updateMsg));
            });
            xaiWs.on("message", (msgData) => {
              if (isClosed) return;
              try {
                const xaiMsg = JSON.parse(msgData.toString());
                try {
                  import_fs.default.appendFileSync("xai_events.log", `[${(/* @__PURE__ */ new Date()).toISOString()}] RECV: ${xaiMsg.type}
`);
                  if (xaiMsg.type === "error") {
                    import_fs.default.appendFileSync("xai_events.log", `[${(/* @__PURE__ */ new Date()).toISOString()}] ERROR payload: ${JSON.stringify(xaiMsg.error)}
`);
                  }
                } catch (logErr) {
                }
                const isAudioDelta = xaiMsg.type === "response.audio.delta" || xaiMsg.type === "response.output_audio.delta";
                const deltaVal = xaiMsg.delta;
                if (isAudioDelta && deltaVal) {
                  clientWs.send(JSON.stringify({
                    type: "message",
                    message: {
                      serverContent: {
                        modelTurn: {
                          parts: [
                            {
                              inlineData: {
                                data: deltaVal,
                                mimeType: "audio/pcm;rate=24000"
                              }
                            }
                          ]
                        }
                      }
                    }
                  }));
                } else if (xaiMsg.type === "input_audio_buffer.speech_started") {
                  clientWs.send(JSON.stringify({
                    type: "message",
                    message: {
                      serverContent: {
                        interrupted: true
                      }
                    }
                  }));
                } else if (xaiMsg.type === "response.function_call_arguments.done") {
                  const args = xaiMsg.arguments ? JSON.parse(xaiMsg.arguments) : {};
                  try {
                    import_fs.default.appendFileSync("xai_events.log", `[${(/* @__PURE__ */ new Date()).toISOString()}] TRIGGER_TOOL: ${xaiMsg.name} with arguments: ${JSON.stringify(args)}
`);
                  } catch (err) {
                  }
                  clientWs.send(JSON.stringify({
                    type: "message",
                    message: {
                      toolCall: {
                        functionCalls: [
                          {
                            id: xaiMsg.call_id,
                            name: xaiMsg.name,
                            args
                          }
                        ]
                      }
                    }
                  }));
                } else if (xaiMsg.type === "error") {
                  const errText = xaiMsg.error?.message || JSON.stringify(xaiMsg.error);
                  console.error("Error from x.ai realtime endpoint:", errText);
                  clientWs.send(JSON.stringify({ type: "error", error: errText }));
                }
              } catch (err) {
                console.error("Error decoding x.ai message:", err);
              }
            });
            xaiWs.on("close", () => {
              if (isClosed) return;
              clientWs.send(JSON.stringify({ type: "close" }));
              clientWs.close();
            });
            xaiWs.on("error", (err) => {
              if (isClosed) return;
              clientWs.send(JSON.stringify({ type: "error", error: err.message || String(err) }));
            });
          } catch (wsErr) {
            console.error("Failed to establish session to x.ai:", wsErr);
            clientWs.send(JSON.stringify({ type: "error", error: wsErr.message || String(wsErr) }));
          }
        } else if (message.type === "audio") {
          if (xaiWs && xaiWs.readyState === import_ws.WebSocket.OPEN) {
            xaiWs.send(JSON.stringify({
              type: "input_audio_buffer.append",
              audio: message.data
            }));
          }
        } else if (message.type === "video") {
        } else if (message.type === "toolResponse") {
          try {
            import_fs.default.appendFileSync("xai_events.log", `[${(/* @__PURE__ */ new Date()).toISOString()}] SEND_TOOL_RESPONSE: ${JSON.stringify(message.functionResponses)}
`);
          } catch (err) {
          }
          if (xaiWs && xaiWs.readyState === import_ws.WebSocket.OPEN) {
            for (const r of message.functionResponses) {
              xaiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: r.id,
                  output: JSON.stringify(r.response)
                }
              }));
            }
            xaiWs.send(JSON.stringify({
              type: "response.create"
            }));
          }
        } else if (message.type === "clientContent") {
          if (xaiWs && xaiWs.readyState === import_ws.WebSocket.OPEN) {
            const textVal = message.content?.turns?.[0]?.parts?.[0]?.text;
            if (textVal) {
              xaiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: textVal
                    }
                  ]
                }
              }));
              xaiWs.send(JSON.stringify({
                type: "response.create"
              }));
            }
          }
        }
      } catch (err) {
        console.error("Error processing msg on server:", err);
      }
    });
    clientWs.on("close", () => {
      isClosed = true;
      if (xaiWs) {
        try {
          if (xaiWs.readyState === import_ws.WebSocket.OPEN || xaiWs.readyState === import_ws.WebSocket.CONNECTING) {
            xaiWs.close();
          }
        } catch (e) {
        }
      }
    });
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
