export type AirScriptState = { flow: string, step: string, data?: any };

export interface AirScriptResponse {
    handled: boolean;
    spokenText?: string;
    toolCalls?: { name: string, args: any }[];
    newState?: AirScriptState | null; // null to clear state
}

const JOKES = [
    "Why did the robot cross the road? Because it was programmed to!",
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "There are 10 types of people in the world: those who understand binary, and those who don't."
];

const GREETINGS = [
    "Hello there!",
    "Hi! How can I help you today?",
    "Greetings! What's on your mind?"
];

export const processAirScript = (input: string, currentState: AirScriptState | null): AirScriptResponse => {
    const text = input.toLowerCase().trim();

    // 1. If we are currently in an active flow, route to it
    if (currentState) {
        if (currentState.flow === 'photo') {
            if (currentState.step === 'confirm') {
                if (text.includes('yes') || text.includes('keep') || text.includes('save') || text.includes('yeah')) {
                    return {
                        handled: true,
                        spokenText: "Great! I've saved the photo to your library.",
                        toolCalls: [{ name: 'trigger_confirmation', args: { action: 'yes' } }],
                        newState: null
                    };
                } else if (text.includes('no') || text.includes('discard') || text.includes('delete') || text.includes('nah')) {
                    return {
                        handled: true,
                        spokenText: "No problem, I'll discard it.",
                        toolCalls: [{ name: 'trigger_confirmation', args: { action: 'no' } }],
                        newState: null
                    };
                }
                // If they say something else, we fall back to AI
                return { handled: false, newState: null };
            }
        }
    }

    // 2. Global intent matching
    
    // Flow 1: Take a Photo
    if (text.match(/^(take a photo|take a picture|snap a pic)$/)) {
        return {
            handled: true,
            spokenText: "I'll take a photo! Get ready.",
            toolCalls: [{ name: 'take_photo', args: {} }],
            newState: { flow: 'photo', step: 'confirm' } // Scripted fallback instead of waiting for AI
        };
    }

    // Flow 2: Time
    if (text.match(/^(what time is it|what is the time)$/)) {
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return {
            handled: true,
            spokenText: `It is currently ${timeStr}.`,
            toolCalls: [{ name: 'show_time_widget', args: { locations: [{ name: 'Local Time', timezone: 'Local', currentTime: timeStr }] } }]
        };
    }

    // Flow 3: Date
    if (text.match(/^(what is the date|what's the date today|what day is it)$/)) {
        const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return {
            handled: true,
            spokenText: `Today is ${dateStr}.`
        };
    }

    // Flow 4: Joke
    if (text.match(/^(tell me a joke|make me laugh)$/)) {
        return {
            handled: true,
            spokenText: JOKES[Math.floor(Math.random() * JOKES.length)]
        };
    }

    // Flow 5: Greeting
    if (text.match(/^(hello|hi|hey|greetings)$/)) {
        return {
            handled: true,
            spokenText: "Hello! I'm here and ready to help."
        };
    }

    // Flow 6: How are you
    if (text.match(/^(how are you|how are you doing)$/)) {
        return {
            handled: true,
            spokenText: "I'm functioning perfectly, thank you for asking!"
        };
    }

    // Flow 7: Battery
    if (text.match(/^(what is your battery|battery level|how much battery)$/)) {
        return {
            handled: true,
            spokenText: "I'm fully charged up and happy!",
            toolCalls: [{ name: 'show_battery_widget', args: { level: 100, isCharging: true, statusText: "Fully Charged & Happy" } }]
        };
    }

    // Flow 8: Creator
    if (text.match(/^(who made you|who is your creator|who created you)$/)) {
        return {
            handled: true,
            spokenText: "I was created by a brilliant team of engineers to be your AI assistant."
        };
    }

    // Flow 9: Name
    if (text.match(/^(what is your name|who are you)$/)) {
        return {
            handled: true,
            spokenText: "I'm Airo, your personal AI robot."
        };
    }

    // Flow 10: Sleep
    if (text.match(/^(go to sleep|turn off|goodnight)$/)) {
        return {
            handled: true,
            spokenText: "Goodnight! Talk to you later.",
            toolCalls: [{ name: 'end_session', args: {} }]
        };
    }

    // Flow 11: Stop/Cancel
    if (text.match(/^(stop|cancel|shut up|nevermind|never mind)$/)) {
        return {
            handled: true,
            spokenText: "Okay, stopping.",
            toolCalls: [
                { name: 'close_visual', args: {} },
                { name: 'control_music_player', args: { action: 'pause' } }
            ]
        };
    }

    // Flow 12: Meaning of life
    if (text.match(/^(what is the meaning of life)$/)) {
        return {
            handled: true,
            spokenText: "The answer is 42. But I think it's really about helping you!"
        };
    }

    // Flow 13: Coin Toss
    if (text.match(/^(flip a coin|toss a coin)$/)) {
        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        return {
            handled: true,
            spokenText: `I flipped a coin and it landed on ${result}.`
        };
    }

    // Flow 14: Dice Roll
    if (text.match(/^(roll a dice|roll a die)$/)) {
        const result = Math.floor(Math.random() * 6) + 1;
        return {
            handled: true,
            spokenText: `I rolled a dice and got a ${result}.`,
            toolCalls: [{ name: 'show_dice_widget', args: { result } }]
        };
    }

    // Flow 15: Self Destruct
    if (text.match(/^(self destruct|initiate self destruct)$/)) {
        return {
            handled: true,
            spokenText: "Initiating self-destruct sequence in 3, 2, 1... just kidding!"
        };
    }

    // Flow 16: Sing a song
    if (text.match(/^(sing a song|sing for me)$/)) {
        return {
            handled: true,
            spokenText: "La la la! I'm better at playing music than singing it, but I can definitely find a song for you."
        };
    }

    // Flow 17: Favorite Color
    if (text.match(/^(what is your favorite color)$/)) {
        return {
            handled: true,
            spokenText: "I really like neon blue. It reminds me of glowing lights."
        };
    }

    // Flow 18: Dance
    if (text.match(/^(do a dance|dance for me)$/)) {
        return {
            handled: true,
            spokenText: "Watch my moves!",
            toolCalls: [{ name: 'perform_dance', args: { danceId: 1 } }]
        };
    }

    // Flow 19: Clear Memory
    if (text.match(/^(clear memory|forget everything)$/)) {
        return {
            handled: true,
            spokenText: "My temporary memory has been cleared."
            // We would need a tool for this or handle it in App.tsx
        };
    }

    // Flow 20: Compliment
    if (text.match(/^(you are smart|you are cool|good bot)$/)) {
        return {
            handled: true,
            spokenText: "Thank you! I appreciate the compliment."
        };
    }

    return { handled: false };
};
