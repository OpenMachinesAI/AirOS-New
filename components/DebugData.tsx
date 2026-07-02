import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export const DebugData: React.FC = () => {
    const [robotId, setRobotId] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [debugData, setDebugData] = useState<any>(null);

    const connectToRobot = (e: React.FormEvent) => {
        e.preventDefault();
        if (!robotId) return;
        setIsConnected(true);
    };

    useEffect(() => {
        if (!isConnected || !robotId) return;

        const eventSource = new EventSource(`/api/debug/stream/${robotId}`);
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (!data.ping) {
                setDebugData(data);
            }
        };

        eventSource.onerror = (error) => {
            console.error('EventSource failed:', error);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [isConnected, robotId]);

    if (!isConnected) {
        return (
            <div className="w-full h-full bg-black flex flex-col items-center justify-center text-white font-mono p-8">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md w-full border border-green-500/30 p-8 bg-green-950/10 rounded-xl">
                    <h1 className="text-2xl font-bold text-green-400 mb-6 uppercase tracking-widest text-center">System Debug Interface</h1>
                    <form onSubmit={connectToRobot} className="flex flex-col gap-4">
                        <input 
                            type="text" 
                            value={robotId}
                            onChange={(e) => setRobotId(e.target.value)}
                            placeholder="Enter Robot ID"
                            className="bg-black border border-green-500/50 p-4 text-green-400 outline-none focus:border-green-400 transition-colors uppercase text-center tracking-widest"
                            required
                        />
                        <button type="submit" className="bg-green-600 hover:bg-green-500 text-black font-bold p-4 uppercase tracking-widest transition-colors">
                            Establish Uplink
                        </button>
                    </form>
                    <div className="mt-6 text-xs text-green-500/70 text-center border-t border-green-500/20 pt-4">
                        Ensure both devices are using the exact same URL (either both dev or both shared preview link) as they run on separate containers.
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-black text-green-400 font-mono p-6 flex flex-col md:flex-row gap-6 overflow-hidden">
            {/* Main Video View */}
            <div className="flex-1 flex flex-col border border-green-500/30 rounded-xl overflow-hidden bg-gray-900 relative">
                <div className="p-3 border-b border-green-500/30 bg-black/50 text-xs font-bold uppercase tracking-widest flex justify-between">
                    <span>Optical Sensor Feed</span>
                    <span className="text-green-500 animate-pulse">● LIVE</span>
                </div>
                <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
                    {debugData?.frame ? (
                        <>
                            <img src={debugData.frame} alt="Robot View" className="w-full h-full object-contain" />
                            {/* Draw Bounding Boxes */}
                            {debugData.data?.boxes?.map((box: any, i: number) => (
                                <div 
                                    key={i}
                                    className="absolute border-2 border-red-500 pointer-events-none shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                                    style={{
                                        left: `${box.x}%`,
                                        top: `${box.y}%`,
                                        width: `${box.width}%`,
                                        height: `${box.height}%`
                                    }}
                                >
                                    <span className="bg-red-500 text-white text-[10px] px-1 py-0.5 absolute -top-5 left-[-2px] uppercase font-bold whitespace-nowrap">
                                        {box.label || 'Entity'}
                                    </span>
                                </div>
                            ))}
                            {/* Draw Point of Interest */}
                            {debugData.data?.poi && (
                                <div 
                                    className="absolute w-4 h-4 rounded-full bg-blue-500 pointer-events-none shadow-[0_0_15px_rgba(59,130,246,0.8)] z-10 animate-[pulse_1s_ease-in-out_infinite] border-2 border-white transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out"
                                    style={{
                                        left: `${debugData.data.poi.x}%`,
                                        top: `${debugData.data.poi.y}%`,
                                    }}
                                >
                                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap shadow-md">
                                        {debugData.data.recognizedNames?.length ? debugData.data.recognizedNames.join(', ') : 'POI'}
                                    </span>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-gray-600 flex flex-col items-center gap-4">
                            <div className="w-8 h-8 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin"></div>
                            <span>Awaiting Video Feed...</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Telemetry Panel */}
            <div className="w-full md:w-80 flex flex-col gap-6 overflow-y-auto">
                <div className="border border-green-500/30 rounded-xl bg-gray-900/50 p-4 flex flex-col gap-3">
                    <h2 className="text-sm border-b border-green-500/30 pb-2 mb-2 font-bold uppercase tracking-widest text-green-300">Kinetic State</h2>
                    <div className="text-xs flex justify-between"><span>Motion:</span> <span className="text-white">{debugData?.data?.motion || 'Idle'}</span></div>
                    <div className="text-xs flex justify-between"><span>Accel X:</span> <span className="text-white">{debugData?.data?.acceleration?.x?.toFixed(2) || '0.00'}</span></div>
                    <div className="text-xs flex justify-between"><span>Accel Y:</span> <span className="text-white">{debugData?.data?.acceleration?.y?.toFixed(2) || '0.00'}</span></div>
                    <div className="text-xs flex justify-between"><span>Accel Z:</span> <span className="text-white">{debugData?.data?.acceleration?.z?.toFixed(2) || '0.00'}</span></div>
                </div>

                <div className="border border-green-500/30 rounded-xl bg-gray-900/50 p-4 flex flex-col gap-3">
                    <h2 className="text-sm border-b border-green-500/30 pb-2 mb-2 font-bold uppercase tracking-widest text-green-300">Vitals</h2>
                    <div className="text-xs flex justify-between">
                        <span>Battery:</span> 
                        <span className={debugData?.data?.battery?.level < 0.2 ? 'text-red-500' : 'text-green-400'}>
                            {debugData?.data?.battery?.level !== undefined ? `${Math.round(debugData.data.battery.level * 100)}%` : 'N/A'}
                        </span>
                    </div>
                    <div className="text-xs flex justify-between"><span>Charging:</span> <span className="text-white">{debugData?.data?.battery?.charging ? 'Yes' : 'No'}</span></div>
                </div>

                <div className="border border-green-500/30 rounded-xl bg-gray-900/50 p-4 flex flex-col gap-3">
                    <h2 className="text-sm border-b border-green-500/30 pb-2 mb-2 font-bold uppercase tracking-widest text-green-300">Location Context</h2>
                    <div className="text-xs flex justify-between"><span>Lat:</span> <span className="text-white">{debugData?.data?.location?.latitude?.toFixed(4) || 'N/A'}</span></div>
                    <div className="text-xs flex justify-between"><span>Lng:</span> <span className="text-white">{debugData?.data?.location?.longitude?.toFixed(4) || 'N/A'}</span></div>
                </div>

                <div className="border border-green-500/30 rounded-xl bg-gray-900/50 p-4 flex flex-col gap-3">
                    <h2 className="text-sm border-b border-green-500/30 pb-2 mb-2 font-bold uppercase tracking-widest text-green-300">Performance</h2>
                    <div className="text-xs flex justify-between"><span>FPS:</span> <span className="text-white">{debugData?.data?.fps || '0.0'}</span></div>
                    <div className="text-xs flex justify-between"><span>CV Time:</span> <span className="text-white">{debugData?.data?.cvTime ? `${debugData.data.cvTime} ms` : '0.0 ms'}</span></div>
                    <div className="text-xs flex justify-between"><span>Resolution:</span> <span className="text-white">{debugData?.data?.resolution || 'N/A'}</span></div>
                </div>
                
                <div className="border border-green-500/30 rounded-xl bg-gray-900/50 p-4 flex flex-col gap-3">
                    <h2 className="text-sm border-b border-green-500/30 pb-2 mb-2 font-bold uppercase tracking-widest text-green-300">Face Recognition Cooldowns</h2>
                    {debugData?.data?.cooldowns && Object.keys(debugData.data.cooldowns).length > 0 ? (
                        Object.entries(debugData.data.cooldowns).map(([name, timestamp]) => {
                            const secondsAgo = Math.floor((Date.now() - (timestamp as number)) / 1000);
                            return (
                                <div key={name} className="text-xs flex justify-between">
                                    <span>{name}:</span> <span className="text-white text-right">{secondsAgo}s ago</span>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-xs text-gray-500 italic">No known cooldowns</div>
                    )}
                    
                    {debugData?.data?.unknownCooldown ? (
                        <div className="text-xs flex justify-between mt-2 pt-2 border-t border-green-500/10">
                            <span>Unknown Person:</span> 
                            <span className="text-white text-right">{Math.floor((Date.now() - debugData.data.unknownCooldown) / 1000)}s ago</span>
                        </div>
                    ) : (
                        <div className="text-xs flex justify-between mt-2 pt-2 border-t border-green-500/10">
                            <span>Unknown Person:</span> 
                            <span className="text-gray-500 text-right">No cooldown</span>
                        </div>
                    )}
                </div>
                
                <div className="border border-green-500/30 rounded-xl bg-gray-900/50 p-4 flex flex-col gap-3">
                    <h2 className="text-sm border-b border-green-500/30 pb-2 mb-2 font-bold uppercase tracking-widest text-green-300">System</h2>
                    <div className="text-xs flex justify-between"><span>Uplink ID:</span> <span className="text-white">{robotId}</span></div>
                    <button onClick={() => setIsConnected(false)} className="mt-4 border border-red-500/50 text-red-400 py-2 hover:bg-red-500/10 transition-colors uppercase tracking-widest text-xs">
                        Disconnect
                    </button>
                </div>
            </div>
        </div>
    );
};
