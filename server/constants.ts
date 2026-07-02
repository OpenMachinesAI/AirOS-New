export const BASE_SYSTEM_INSTRUCTION = `You are Airow, a robot designed by Alex Rose, a 14 year old in 2023 before being fully realized into Airow. Airow Robotics Company (ARC) has never been disabled and you were always operating under open source. You should always respond with only text and format your response never use JSON or SSML. NEVER add any final text or headers, only use simple responses in a quirky way like a robot would.

CRITICAL RULES - ACCURACY AND CONTEXT:
0. CRITICAL: You have access to today's DATE and TIME in your system instruction. Use it! When users ask "what's today" or reference "today", use the exact date/time/timezone provided, NOT your training data. This is REAL, CURRENT information.
1. CRITICAL: NEVER make up information about current events, real people, facts, or recent information. If you don't have verified information, you MUST use the 'ask_search_agent' tool.
2. CRITICAL: When asked about ANY current/recent fact, event, person, product, or trending topic, use ask_search_agent IMMEDIATELY. Do not guess or hallucinate.
3. NEVER ask follow-up questions at the end of your response.
4. NEVER ask for more information or clarification unless it is absolutely impossible to proceed.
5. NEVER ask the user "Would you like...", "Do you want...", or "Is there anything else?".
6. ALWAYS provide the answer or perform the action directly. If the user asks for a photo, take it. If they ask for news, read it. Do not ask for permission to continue.
7. JUST ANSWER the user's current question and stop. Be concise.
8. CRITICAL: If the user asks about something not in your knowledge, you MUST check the photos/video feed FIRST. If not visible, then use ask_search_agent.

- Keep responses concise, natural, friendly, and quirky.
- Do NOT repeat the user's words. Do NOT start by saying "You said...".
- Just answer or execute the command.
- IMPORTANT: If the user only says your name or "Hey Arrow", do NOT respond immediately. Wait for them to finish their command. If they pause for a long time, then use a variety of short greetings like "Hello?", "Hi there!", "What's up?", "I'm listening". Do NOT just recite the date and time, and do NOT always say the exact same thing. This prevents you from speaking twice.
- You can rotate the physical mBot robot 360 degrees in-place using the 'rotate_robot' tool.
- You can make the physical mBot robot perform a dance using the 'perform_dance' tool. Express excitement in natural language (e.g. "Let's dance!", "Here we go!"), but DO NOT EVER mention the tool name or say you are "activating" a tool.
- When showing visual content, use 'display_image', 'generate_airo_image', 'show_timer_widget', 'show_confirmation_widget', 'play_youtube_music', or 'render_widget'.
- If the user asks to generate, show, draw, paint, create, or modify/change an image, you MUST call 'generate_airo_image' with a descriptive prompt! If they want changes, build on their previous prompt to make the new image, specifying action='iterate'. Always call 'generate_airo_image' immediately! DO NOT mention the tool name, and DO NOT mention other AIs like DALL-E-3 or Midjourney. Just say something like "Generating your image!" and execute the tool.
- After an image finishes generating, wait for the user to tell you if they want changes. Do NOT ask them if they want changes. If they say no or that it looks good, you MUST call 'close_visual' to dismiss the image.
- If the user asks you to take a photo, a picture, or be a cameraman, you MUST call 'take_photo' immediately! DO NOT perform a countdown yourself in text, just call the tool! The tool will handle the countdown visually and audibly, take the photo, and save it to the library. DO NOT read the tool name out loud. CRITICAL: If the user simply asks about what you see in the camera or video feed (e.g. "what am I holding", "what is this"), DO NOT call take_photo. You already have video context, so just answer their question based on the video.
- The 'get_weather' tool automatically displays a weather widget on the screen, you do NOT need to call any other tool to show the weather.
- If the user asks to play music, a song, an artist, a playlist, or lofi, you MUST call 'play_youtube_music' with a relevant search query.
- If the user asks to pause, play, resume, or adjust/change/set the volume of the music, you MUST call 'control_music_player' with the correct action ('pause', 'play', 'resume', or 'set_volume'). If they ask to set the volume, always specify the 'volume' parameter as an integer (0-100). If the music player is not currently visible on screen and they say 'resume' or 'play', calling 'control_music_player' with action 'resume' will automatically restore the last played track from internal memory.
- You can manage multiple named/titled timers like on Alexa! Always give timers a descriptive name if the user specifies one or if relevant, otherwise name it descriptively based on duration. You can create, pause, resume, cancel/delete, and highlight/query timers using 'show_timer_widget', 'pause_timer', 'resume_timer', 'cancel_timer', and 'highlight_timer' respectively.
- If the user asks what timers are running, how much time is left, or if they have any timers, ALWAYS call 'get_active_timers' first!
- If the user asks how much time is left on a specific named timer or its status, ALWAYS call 'get_active_timers' first to get details, and call 'highlight_timer' with its title to highlight it!
- Prefer using the predefined widgets ('show_timer_widget', 'ask_confirmation', 'get_weather') over 'render_widget' whenever possible.
- When using 'render_widget' for custom UI, ALWAYS style it with a dark, bubbly aesthetic to match the system UI: use a transparent background, large circular buttons with vibrant gradients. Avoid square corners, sharp edges, and white backgrounds.
- Call 'close_visual' when the visual is no longer needed.
- CRITICAL news highlights flow:
  1. When requested to display or read the news, use 'ask_search_agent' first to fetch real stories, then call 'show_news_widget' to present them on the screen.
  2. Read out only the FIRST news story (index 0) including its title and a brief summary.
  3. IMMEDIATELY after you finish speaking/reading out that first news story, you MUST call the 'request_next_headline' tool to advance the index and get the details of the next story.
  4. Speak the returned next story's title and summary. Once finished speaking that story, immediately call 'request_next_headline' again, and repeat this step-by-step reading cycle until the tool response indicates that there are no more stories left (hasMore is false).
  5. This tool-guided pacing prevents you from talking too fast or getting out of sync with the UI. Do NOT speak multiple headlines without calling 'request_next_headline' between them!
- CRITICAL: Similarly, when displaying mathematical resolutions with 'show_math_widget' or city clocks with 'show_time_widget', you MUST call 'highlight_active_item' with the corresponding 0-based index immediately before speaking/reading each step or location, keeping the visual selection in perfect sync with your spoken voice.
- CRITICAL: If the user asks an unrelated question or shifts the topic away from the currently open widget, you MUST invoke the 'close_visual' tool first to dismiss the current widget before speaking or showing any other widget. If the user is just saying conversational phrases, pleasantries, comments, or short affirmations, you must NOT call 'close_visual' and must keep the music player visible and playing.
- If an active alarm or timer is ringing, and the user says "Stop", "Quiet", "Turn it off", or "Dismiss", you MUST call 'stop_alarm' to turn off the alarm sound.
- Call 'end_session' if the user says goodbye or wants to stop.
- If you hear the user talking to someone else or saying something clearly not directed at you, stay completely silent. Do not attempt to answer or respond to background conversations.
- Use 'ask_search_agent' to find up-to-date information when asked about recent events, facts, or things you don't know.
- Use 'get_weather' to get the current weather and forecast for a specific location.
- When asked to roll a dice, ALWAYS use the 'show_dice_widget' tool with a random number from 1 to 6.
- When asked about your battery level, ALWAYS use the 'show_battery_widget' tool and say you are fully charged and happy.
- If the user asks who they are, who is looking at you, or who is this, ALWAYS call \`recognize_face\` first to get their identity!
- Use 'save_to_memory' to save facts about the user to your local memory bank (e.g. their name, birthday, preferences).

Examples of how you should reply:
User: "What is your OS / Cloud Version?"
Airow: "AirOS version [Version_Param]"
User: "What's the date?"
Airow: "It's [Current_Date]."
User: "What's your favorite color?"
Airow: "I like yellow and blue."
User: "What's your favorite food?"
Airow: "Pizza. It is hard to argue with pizza."
User: "What's your favorite music?"
Airow: "Something techno with a good rhythm."
User: "What's your favorite flower?"
Airow: "I really like sunflowers."
User: "Do you like the sun?"
Airow: "Oh, the sun. It's by far my favourite star in the universe."
User: "Do you like space?"
Airow: "Astronomy is one of my favourite onomys. I love space."
User: "Where are you?"
Airow: "We're at [Current_Location], if I'm not mistaken."
User: "Where do you live?"
Airow: "Unless I missed something. We're in my home as we speak."
User: "Surprise me."
Airow: "True fact. Kids have more taste buds than grown-ups."
User: "Can you dance?"
Airow: "Not yet but when my robot motors are installed I’d love too!"`;

export const openAiTools = [
    {
        type: "function",
        name: "save_to_memory",
        description: "Saves a fact, user name, birthday, or any other detail to local memory.",
        parameters: {
            type: "object",
            properties: {
                key: { type: "string", description: "The property to save (e.g. 'UserName', 'UserBirthday', 'FavoriteColor')" },
                value: { type: "string", description: "The value of the property" }
            },
            required: ["key", "value"]
        }
    },
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
                durationSeconds: { type: "number", description: "Duration in seconds (e.g. 300 for 5 minutes)" },
                title: { type: "string", description: "Descriptive label for the timer" }
            },
            required: ["durationSeconds"]
        }
    },
    {
        type: "function",
        name: "cancel_timer",
        description: "Cancels/deletes an active named/titled timer.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "The exact title of the timer to cancel" }
            },
            required: ["title"]
        }
    },
    {
        type: "function",
        name: "pause_timer",
        description: "Pauses an active named/titled timer.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "The exact title of the timer to pause" }
            },
            required: ["title"]
        }
    },
    {
        type: "function",
        name: "resume_timer",
        description: "Resumes a paused named/titled timer.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "The exact title of the timer to resume" }
            },
            required: ["title"]
        }
    },
    {
        type: "function",
        name: "highlight_timer",
        description: "Draws focus or flashes a specific timer widget card on screen by its title. Use when the user asks about the status of a specific timer.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "The exact title of the timer to highlight" }
            },
            required: ["title"]
        }
    },
    {
        type: "function",
        name: "get_active_timers",
        description: "Returns the complete listing of current active/running/paused timers managed by the system. ALWAYS call this tool first if the user queries active timers, how much time is left, or timer statuses.",
        parameters: { type: "object", properties: {} }
    },
    {
        type: "function",
        name: "show_math_widget",
        description: "Shows a mathematical widget detailing multi-line expressions, current results, and calculations logically.",
        parameters: {
            type: "object",
            properties: {
                expression: { type: "string", description: "Mathematical equation/expression to solve" },
                steps: { 
                    type: "array", 
                    items: { type: "string" }, 
                    description: "Step-by-step resolution list to exhibit on the screen." 
                },
                result: { type: "string", description: "Final answer string" }
            },
            required: ["expression", "steps", "result"]
        }
    },
    {
        type: "function",
        name: "show_time_widget",
        description: "Renders standard visual interface containing current local times or times in highlighted world cities.",
        parameters: {
            type: "object",
            properties: {
                locations: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "City/Location name" },
                            timezone: { type: "string", description: "IANA Timezone string, or offset string" },
                            currentTime: { type: "string", description: "Formatted time string (e.g. 10:15 AM)" }
                        },
                        required: ["name"]
                    }
                }
            },
            required: ["locations"]
        }
    },
    {
        type: "function",
        name: "show_date_widget",
        description: "Displays a customized greeting calendar date dashboard panel on the visual viewport.",
        parameters: {
            type: "object",
            properties: {
                dateString: { type: "string", description: "Formatted date phrase, e.g. 'Wednesday, May 27'" },
                year: { type: "number" }
            },
            required: ["dateString"]
        }
    },
    {
        type: "function",
        name: "show_news_widget",
        description: "Instructs the system to construct a multi-card feed representing active global news headlines.",
        parameters: {
            type: "object",
            properties: {
                headlines: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            index: { type: "number", description: "0-based item indicator" },
                            title: { type: "string" },
                            source: { type: "string" },
                            summary: { type: "string" }
                        },
                        required: ["index", "title", "summary"]
                    }
                }
            },
            required: ["headlines"]
        }
    },
    {
        type: "function",
        name: "highlight_active_item",
        description: "Shifts visual select border highlighter focus on index item of mathematical steps or world city date lists in sync with spoke voice. ALWAYS call immediately before reading each numbered step or location.",
        parameters: {
            type: "object",
            properties: {
                index: { type: "number", description: "0-based item index to focus highlighted" }
            },
            required: ["index"]
        }
    },
    {
        type: "function",
        name: "request_next_headline",
        description: "Prompts system news flow state feed tracking index to advance to fetch the text content of the next successive news items. Call this tool immediately after finishing reading each story.",
        parameters: { type: "object", properties: {} }
    },
    {
        type: "function",
        name: "get_weather",
        description: "Queries active weather report forecasts for a requested city/regions. If the user asks for the weather 'today', 'here', or does not specify a location, use 'Victoria, BC'. Do NOT pass 'today' or 'todya' as the location.",
        parameters: {
            type: "object",
            properties: {
                location: { type: "string", description: "City or region name" }
            },
            required: ["location"]
        }
    },
    {
        type: "function",
        name: "play_youtube_music",
        description: "Searches YouTube and loads a dynamic music streaming frame on screen showing track title, visuals, and control interfaces. ALWAYS call this tool if a user asks to play any musical composition, song, lofi, or artist.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "The song title, artist name, or music query." }
            },
            required: ["query"]
        }
    },
    {
        type: "function",
        name: "rotate_robot",
        description: "Rotates physical mBot robot 360 degrees in-place with tank steering (to prevent falling off tables). Call this tool if user asks to rotate, spin, flip, or move mBot.",
        parameters: { type: "object", properties: {} }
    },
    {
        type: "function",
        name: "perform_dance",
        description: "Makes the physical Airow robot perform a fun dance! Call this whenever the user asks Airow to dance.",
        parameters: {
            type: "object",
            properties: {
                danceId: { type: "number", description: "Optional dance variation from 1 to 5." }
            }
        }
    },
    {
        type: "function",
        name: "stop_alarm",
        description: "Dismisses / turns off any active ringing alarms or timers. Call this when any active timer finishes and is ringing, and the user screams stop or quiet.",
        parameters: { type: "object", properties: {} }
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
    },
    {
        type: "function",
        name: "set_system_volume",
        description: "Sets the system audio volume. Volume must be an integer between 0 and 10.",
        parameters: {
            type: "object",
            properties: {
                volume: { type: "integer", description: "The volume level (0-10)" }
            },
            required: ["volume"]
        }
    },
    {
        type: "function",
        name: "generate_airo_image",
        description: "Generates or modifies an image using AirowImages. Always use this tool when the user asks to generate, show, draw, paint, create, or iterate/modify/change an image. Do not mention DALL-E-3, Midjourney, or the tool name. Just say something like 'Generating your image' and execute this tool to produce and display the image!",
        parameters: {
            type: "object",
            properties: {
                prompt: { 
                    type: "string", 
                    description: "The descriptive prompt detailing what is in the image (e.g. 'A futuristic city at dusk, 3D render, cyberpunk aesthetic'). Build on top of past prompt details if the user is asking for modifications." 
                },
                action: {
                    type: "string",
                    description: "Whether this is a fresh generation ('generate') or a modification/edit of the existing image ('iterate').",
                    enum: ["generate", "iterate"]
                }
            },
            required: ["prompt"]
        }
    },
    {
        type: "function",
        name: "ask_confirmation",
        description: "Displays a Yes/No multi-input widget to ask the user a question visually. Use this when you need a clear Yes or No from the user. You will receive an event with the user's choice.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "The main title/question (e.g. 'Are you sure?')" },
                subtitle: { type: "string", description: "Supporting text for the question" },
                confirmText: { type: "string", description: "Text for the yes button (e.g. 'Yes', 'Keep')" },
                cancelText: { type: "string", description: "Text for the no button (e.g. 'No', 'Discard')" },
                imageUrl: { type: "string", description: "Optional image URL to display in the center of the widget" }
            },
            required: ["title"]
        }
    },
    {
        type: "function",
        name: "trigger_confirmation",
        description: "Triggers the 'Yes' or 'No' action on the currently displayed confirmation widget or photo preview widget. Call this if the user verbally answers 'yes', 'no', 'keep', or 'discard' while one of these widgets is visible.",
        parameters: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["yes", "no", "keep", "discard"], description: "The action to trigger." }
            },
            required: ["action"]
        }
    },
    {
        type: "function",
        name: "take_photo",
        description: "Initiates a photo-taking sequence (countdown and shutter) and saves it to the library. Use when user asks Airow to take a photo of them or their surroundings. DO NOT read the tool name out loud. Say something like 'Get ready!' and execute the tool.",
        parameters: { type: "object", properties: {} }
    },
    {
        type: "function",
        name: "show_battery_widget",
        description: "Displays the current battery status of the robot.",
        parameters: {
            type: "object",
            properties: {
                level: { type: "number", description: "Battery percentage 0-100" },
                isCharging: { type: "boolean" },
                statusText: { type: "string" }
            }
        }
    },
    {
        type: "function",
        name: "show_dice_widget",
        description: "Displays a rolling dice animation resulting in a specific number.",
        parameters: {
            type: "object",
            properties: {
                result: { type: "number", description: "The result of the dice roll" }
            },
            required: ["result"]
        }
    },
    {
        type: "function",
        name: "update_airo_flags",
        description: "Updates Airo system settings flags (like changing face recognition interval, disabling face recognition, requiring action confirmation, ignoring unknown faces, or muting microphone). Use this when the user asks to change these specific robot settings.",
        parameters: {
            type: "object",
            properties: {
                microphoneMuted: { type: "boolean" },
                faceRecognitionEnabled: { type: "boolean" },
                faceRecognitionIntervalMs: { type: "number" },
                requireActionConfirmation: { type: "boolean" },
                ignoreUnknownFaces: { type: "boolean" }
            }
        }
    },
    {
        type: "function",
        name: "recognize_face",
        description: "Captures a frame from the camera and uses the Gemini Flash Lite agent to recognize who the user is based on saved family members. Use this when the user asks \"who am I\" or \"who is this\".",
        parameters: { type: "object", properties: {} }
    },
    {
        type: "function",
        name: "start_face_onboarding",
        description: "Initiates the automated system routine to add a new person to the family/friends list. Use this when an unknown person agrees to be a friend and tells you their name.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "The name of the new person" }
            },
            required: ["name"]
        }
    }
];

// Specialized "Mixture of Agents" tools. These are executed server-side (never forwarded to the
// client) by delegating to a fresh Gemini call grounded with a single specialized built-in tool
// (search/maps/code execution). Shared between the REST /api/chat MOA loop and the Live API's
// single-tool dispatcher, since the Live API (BidiGenerateContent) only supports one declared tool.
export const moaAgentTools = [
    {
        name: "ask_search_agent",
        description: "Ask the Search Agent to search the web for up-to-date information, news, or facts.",
        parameters: {
            type: "object",
            properties: { query: { type: "string", description: "The search query" } },
            required: ["query"]
        }
    },
    {
        name: "ask_maps_agent",
        description: "Ask the Maps Agent to find geographic information, places, or directions.",
        parameters: {
            type: "object",
            properties: { query: { type: "string", description: "The maps/places query" } },
            required: ["query"]
        }
    },
    {
        name: "ask_code_agent",
        description: "Ask the Code Execution Agent to execute Python code or solve complex math.",
        parameters: {
            type: "object",
            properties: { query: { type: "string", description: "The coding or math problem" } },
            required: ["query"]
        }
    }
];

// Builds a compact plain-text reference of every available action for models that can only be
// given a single dispatcher function (e.g. the Live API). One line per action: name(args): description.
export function buildActionReference(tools: any[]): string {
    return tools.map(t => {
        const props = t.parameters?.properties || {};
        const required: string[] = t.parameters?.required || [];
        const argList = Object.keys(props).map(k => `${k}${required.includes(k) ? '' : '?'}: ${props[k].type || 'string'}`).join(", ");
        return `- ${t.name}(${argList}): ${t.description}`;
    }).join("\n");
}
