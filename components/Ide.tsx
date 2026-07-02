import React, { useState, useRef, useEffect } from 'react';
import { Play, ChevronDown, Loader2, Bluetooth } from 'lucide-react';
import { arduinoRobot } from '../utils/arduino';

export default function Ide() {
  const [code, setCode] = useState(`const distance = await airo.getDistance();
if (distance < 10) {
  await airo.say("Something is too close!");
}

if (await airo.isObstacleDetected()) {
  await airo.stop();
  await airo.say("Obstacle ahead!");
}`);
  const [logs, setLogs] = useState<{type: 'error'|'info'; message: string}[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectionType, setConnectionType] = useState<"SIM" | "MBOT" | "MOCK">("MOCK");
  
  const [messages, setMessages] = useState<{role: 'user'|'agent'; text: string}[]>([
    {
      role: 'agent',
      text: 'Skill Creator initialized. Describe a new behavior for Airo.'
    }
  ]);

  useEffect(() => {
     if ((window as any).simulatorRobot) {
         setConnectionType("SIM");
     }
  }, []);

  const handleConnectMBot = async () => {
    try {
      await arduinoRobot.request();
      await arduinoRobot.init();
      setConnectionType("MBOT");
      setLogs(prev => [...prev, { type: 'info', message: 'Connected to Arduino successfully' }]);
    } catch (e: any) {
      setLogs(prev => [...prev, { type: 'error', message: `BT Error: ${e.message}` }]);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const userPrompt = prompt;
    setPrompt("");
    setMessages(prev => [...prev, { role: 'user', text: userPrompt }]);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/ide/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, currentCode: code })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setCode(data.code);
      setMessages(prev => [...prev, { role: 'agent', text: 'Your changes have been made in the editor. Run it and let me know if any errors occur!' }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'agent', text: `Failed to generate code: ${err.message}` }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRun = async () => {
    setLogs([]); // Clear logs
    try {
      // Implement 'airo' API integrating MBot and Simulator where possible
      const airo = {
        getDistance: async () => {
          if (connectionType === "MBOT") {
            return arduinoRobot.currentUltrasonic;
          }
          setLogs(prev => [...prev, { type: 'info', message: 'airo.getDistance() called (mocked to 15cm)' }]);
          return 15;
        },
        say: async (text: string) => {
          setLogs(prev => [...prev, { type: 'info', message: `airo.say: "${text}"` }]);
          try {
             if (window.speechSynthesis) {
                 const u = new SpeechSynthesisUtterance(text);
                 window.speechSynthesis.speak(u);
             }
          } catch(e) {}
        },
        isObstacleDetected: async () => {
          const d = await airo.getDistance();
          return d < 10;
        },
        isEdgeDetected: async () => {
           if (connectionType === "MBOT") {
             return arduinoRobot.currentLineFollower === 3;
           }
           return false;
        },
        setMode: async (mode: string) => {
           setLogs(prev => [...prev, { type: 'info', message: `airo.setMode: "${mode}"` }]);
        },
        moveWheel: async (wheel: string, speed: number) => {
           setLogs(prev => [...prev, { type: 'info', message: `airo.moveWheel: ${wheel} at ${speed}` }]);
           if (connectionType === "MBOT") {
             if (wheel === 'left') await arduinoRobot.setMotorSpeeds(-speed * 2.5, arduinoRobot.rightSpeed);
             else await arduinoRobot.setMotorSpeeds(arduinoRobot.leftSpeed, speed * 2.5);
           }
        },
        spin: async (dir: string, speed: number, dur?: number) => {
           setLogs(prev => [...prev, { type: 'info', message: `airo.spin: ${dir} for ${dur}ms` }]);
           
           if (connectionType === "MBOT") {
               const s = speed * 2.5; // Map 100 to 255
               if (dir === 'clockwise') await arduinoRobot.setMotorSpeeds(s, s);
               else await arduinoRobot.setMotorSpeeds(-s, -s);
               if (dur) {
                  await new Promise(r => setTimeout(r, dur));
                  await arduinoRobot.stopMotors();
               }
           } else if (connectionType === "SIM") {
               const sim = (window as any).simulatorRobot;
               if (sim) {
                   if (dir === 'clockwise') await sim.spinRightFor('forward', 360, speed);
                   else await sim.spinLeftFor('forward', 360, speed);
               }
           } else {
               if (dur) await new Promise(r => setTimeout(r, dur));
           }
        },
        stop: async () => {
          setLogs(prev => [...prev, { type: 'info', message: 'airo.stop() called' }]);
          if (connectionType === "MBOT") await arduinoRobot.stopMotors();
        },
        getCamera: async () => {
          setLogs(prev => [...prev, { type: 'info', message: 'airo.getCamera() called' }]);
          return "base64String";
        },
        showWidget: async (html: string, css: string, inputs: any) => {
          setLogs(prev => [...prev, { type: 'info', message: 'airo.showWidget called' }]);
          return {};
        },
        clearDisplay: async () => {
           setLogs(prev => [...prev, { type: 'info', message: 'airo.clearDisplay()' }]);
        },
        setLED: async (led: string, color: string) => {
           setLogs(prev => [...prev, { type: 'info', message: `airo.setLED: ${led} -> ${color}` }]);
        },
        blink: async (led: string, color: string, dur: number, count: number) => {
           setLogs(prev => [...prev, { type: 'info', message: `airo.blink: ${led} -> ${color} ${count}x` }]);
        },
        allLEDs: async (color: string) => {
           setLogs(prev => [...prev, { type: 'info', message: `airo.allLEDs: ${color}` }]);
        },
        getInput: async (name: string) => {
           setLogs(prev => [...prev, { type: 'info', message: `airo.getInput: ${name}` }]);
           return "dummy_val";
        }
      };

      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('airo', code);
      
      await fn(airo);
      setLogs(prev => [...prev, { type: 'info', message: 'Execution completed successfully.' }]);
    } catch (err: any) {
      setLogs(prev => [...prev, { type: 'error', message: err.message || String(err) }]);
    }
  };

  return (
    <div className="flex w-full h-screen bg-black font-sans text-white overflow-hidden">
      
      {/* Left Sidebar - Skill Creator */}
      <div className="w-[300px] h-full bg-[#c5f0fe] flex flex-col pt-8 pb-4 border-r border-black/10">
        <h1 className="text-3xl font-black text-black px-6 text-center leading-tight mb-8">
          Skill Creator
        </h1>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-6">
          {messages.map((m, i) => (
             m.role === 'user' ? (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-10 h-10 rounded shadow-md shrink-0 bg-[#5d5f5e] flex items-center justify-center">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
                <div className="text-black font-bold text-[13px] leading-snug mt-1 pt-0.5">
                  {m.text}
                </div>
              </div>
             ) : (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-10 h-10 rounded shadow-md shrink-0 bg-[#5d5f5e] flex items-center justify-center relative overflow-hidden">
                   <div className="absolute -right-2 top-0 bottom-0 w-8 bg-gradient-to-r from-purple-500 to-orange-500 transform skew-x-12"></div>
                   <div className="absolute right-0 top-0 bottom-0 w-4 bg-orange-500"></div>
                </div>
                <div className="text-black font-bold text-[13px] leading-snug mt-1 pt-0.5">
                  {m.text}
                </div>
              </div>
             )
          ))}
          {isGenerating && (
              <div className="flex gap-3 items-center mt-2">
                 <Loader2 className="animate-spin text-black w-6 h-6 ml-2" />
                 <span className="text-black font-bold text-xs">Generating code...</span>
              </div>
          )}
        </div>

        {/* Prompt Input */}
        <div className="px-4 mt-auto">
          <div className="relative border border-black/40 bg-[#dcdcda] rounded-sm">
            <textarea 
               value={prompt}
               onChange={e => setPrompt(e.target.value)}
               onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
               }}
               disabled={isGenerating}
               className="w-full h-[80px] bg-transparent resize-none p-2 text-black font-bold text-xs placeholder:text-black/50 outline-none focus:outline-none"
               placeholder="Enter a prompt"
            />
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="absolute bottom-2 right-2 px-3 py-1 bg-[#10d49e] border border-black/50 text-black text-[10px] font-black rounded-sm shadow-sm hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full bg-black relative">
        
        {/* Top Header */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#2c2c2c] to-[#555555] rounded-full h-[50px] w-max flex items-center pr-6 pl-2 z-10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] border border-white/5">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleRun}
              className="w-9 h-9 rounded-full bg-[#1ae536] flex items-center justify-center hover:scale-105 active:scale-95 transition-all ml-1 shadow-[0_0_15px_rgba(26,229,54,0.4)]"
            >
              <Play className="text-black ml-1 w-5 h-5" fill="black" />
            </button>
            <div className="text-[#a5a5a5] text-lg font-medium pr-8">
              Testing App
            </div>
          </div>
          
          <div className="flex items-center gap-4 ml-6 border-l border-white/10 pl-6 h-full">
             <div className="bg-[#b3b3b3] rounded-full px-3 py-1 flex items-center gap-2 cursor-pointer hover:bg-[#c0c0c0] transition-colors">
               <ChevronDown strokeWidth={3} className="text-black w-4 h-4" />
               <span className="text-black font-black text-xs">My Robots</span>
             </div>
             
             <div className="flex flex-col">
               <span className="text-[9px] text-white/90 font-bold mb-0.5 ml-1">Connected to</span>
               <div className="flex items-center gap-2">
                 <span className="font-black text-lg tracking-tight">
                    {connectionType === "SIM" ? "Simulator" : connectionType === "MBOT" ? "MBot BT" : "No Robot"}
                 </span>
                 <span className="bg-white text-black font-black text-[9px] px-1.5 py-0.5 rounded-sm">LAN</span>
               </div>
             </div>

             <button onClick={handleConnectMBot} className="ml-4 flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-400 transition-colors" title="Connect physical robot over Bluetooth">
                <Bluetooth className="w-4 h-4 text-white" />
             </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 pt-[140px] px-12 overflow-y-auto">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-full bg-transparent text-white font-sans font-black text-2xl md:text-3xl lg:text-4xl leading-tight resize-none outline-none caret-white"
            spellCheck="false"
          />
        </div>

        {/* Logs Console */}
        <div className="h-[200px] bg-[#767676] border-t-2 border-white/20 px-8 py-4 flex flex-col shrink-0 overflow-y-auto">
          <h2 className="text-white font-black text-3xl mb-4">Logs</h2>

          {logs.map((log, i) => (
            <div key={i} className="flex items-center gap-3 mb-2">
               <span className={`font-black text-xl ${log.type === 'error' ? 'text-[#ff1a1a]' : 'text-white'}`}>
                  {log.type === 'error' ? `Error: ${log.message}` : log.message}
               </span>
               {log.type === 'error' && (
                 <button onClick={() => setPrompt(`Fix the error: ${log.message}`)} className="bg-[#ff0000] text-white font-black text-[10px] px-3 py-1 rounded-full uppercase hover:brightness-110 active:scale-95 transition-all outline outline-1 outline-white/20 shadow-lg">
                   Ask AI
                 </button>
               )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
