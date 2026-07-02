import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, RefreshCw, Cpu, Brain, Smartphone, Info, QrCode, CloudLightning, Check, X, Move, ScrollText, PartyPopper, Scan, ArrowUp, ArrowDown, Terminal, ImageIcon, ImagePlus, Volume2, ChevronLeft, Users, Plus, Camera, Mic, MicOff } from 'lucide-react';
import { appLogger } from '../utils/logger';
import { getCurrentVolume, setSoundVolume } from '../utils/soundEffects';
import releaseInfo from '../release_info.json';

type MenuState = 'MAIN' | 'SETTINGS' | 'QR_CONFIRM' | 'AI_USAGE' | 'MEMORY' | 'ABOUT' | 'MOBILE_CONNECT' | 'UPDATES' | 'DEBUGS' | 'FUN_STUFF' | 'LIBRARY' | 'VOLUME' | 'FAMILY';

interface MainMenuProps {
    onClose: () => void;
    robotId: string;
    aiUsageSeconds: number;
    aiUsageLimitSeconds: number;
    localMemory: Record<string, string>;
    qrCommanderEnabled: boolean;
    setQrCommanderEnabled: (val: boolean) => void;
    onTestMovement?: () => void;
    onStartDance?: (danceId: number) => void;
    libraryItems?: Array<{ url: string, prompt?: string, timestamp: number, type: 'generated' | 'photo' }>;
    onIterate?: (prompt: string) => void;
    onDeleteLibraryItem?: (timestamp: number) => void;
    onStartAutoOnboarding?: () => void;
    airoFlags: any;
    setAiroFlags: (flags: any) => void;
    classicModePreference?: boolean;
    setClassicModePreference?: (val: boolean) => void;
    usageLimitReached?: boolean;
}

const LogsView = () => {
    const [localLogs, setLocalLogs] = useState<string[]>(appLogger.logs);
    
    React.useEffect(() => {
        const unsubscribe = appLogger.subscribe(() => {
            setLocalLogs([...appLogger.logs]);
        });
        return unsubscribe;
    }, []);

    return (
        <div className="w-full flex flex-col items-start justify-start text-left touch-pan-y whitespace-pre-wrap pb-16">
            {localLogs.length === 0 ? <div className="text-gray-200 w-full text-center mt-10">No logs yet...</div> : null}
            {localLogs.map((log, i) => (
                <div key={i} className="mb-1 pb-1 break-words opacity-90 w-full">{log}</div>
            ))}
        </div>
    );
};

const UpdateCheck = () => {
    const [status, setStatus] = useState<'checking' | 'found' | 'no_updates'>('checking');
    const [currentVersion] = useState(releaseInfo.fullVersion.split(' ')[0]);
    const [latestVersion] = useState('1.6.3'); // Simulating an update
    
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            if (currentVersion === latestVersion) {
                setStatus('no_updates');
            } else {
                setStatus('found');
            }
        }, 3000);
        return () => clearTimeout(timeout);
    }, [currentVersion, latestVersion]);

    return (
        <div className="flex flex-col md:flex-row w-full h-full text-white overflow-y-auto">
            <div className="w-full md:w-1/3 flex-shrink-0 flex flex-col items-center justify-center p-6 md:p-8 border-b md:border-b-0 md:border-r border-white/10 bg-white/5 text-center">
                <h2 className="text-4xl md:text-[54px] text-white font-medium tracking-tight mb-2">Updates</h2>
                <p className="text-white text-base md:text-lg mb-8 leading-tight">Install new features and updates to Airo</p>
                <div className="flex gap-4">
                    <ArrowUp className="w-16 h-16 md:w-24 md:h-24 text-cyan-400 stroke-[4] -rotate-45" />
                    <ArrowDown className="w-16 h-16 md:w-24 md:h-24 text-cyan-400 stroke-[4] mt-8 md:mt-12 -rotate-45" />
                </div>
            </div>
            <div className="w-full md:w-2/3 flex-shrink-0 flex flex-col items-start justify-start md:justify-center p-8 md:p-16 text-left relative min-h-max">
                {status === 'checking' ? (
                    <div className="flex flex-col items-start gap-8 w-full">
                        <h2 className="text-3xl md:text-[54px] text-white font-medium tracking-tight">Checking for Updates...</h2>
                        <div className="flex gap-4 w-full justify-center pr-0 md:pr-32">
                            <div className="w-8 h-8 md:w-12 md:h-12 bg-white rounded-full animate-pulse"></div>
                            <div className="w-8 h-8 md:w-12 md:h-12 bg-gray-400 rounded-full animate-pulse delay-75"></div>
                            <div className="w-8 h-8 md:w-12 md:h-12 bg-white rounded-full animate-pulse delay-150"></div>
                        </div>
                    </div>
                ) : status === 'found' ? (
                    <div className="flex flex-col items-start w-full">
                        <h2 className="text-4xl md:text-[54px] text-white font-medium tracking-tight mb-8">Update Found:</h2>
                        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 mb-4">
                            <div className="w-24 h-24 md:w-36 md:h-36 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-white text-4xl md:text-6xl font-black tracking-tighter shrink-0">1.6</div>
                            <h3 className="text-3xl md:text-[54px] text-white font-medium tracking-tight">AirOS {latestVersion}</h3>
                        </div>
                        <div className="md:ml-44 flex flex-col items-start mt-6 md:mt-0">
                            <h4 className="text-2xl md:text-3xl text-white font-medium mb-2">Changes:</h4>
                            <p className="text-xl md:text-2xl text-white font-medium mb-1 ml-4">New Menus</p>
                            <p className="text-xl md:text-2xl text-white font-medium mb-8 md:mb-12 ml-4">Bug Fixes</p>
                            <button className="bg-white text-black px-12 md:px-16 py-2 md:py-3 rounded-full text-2xl md:text-4xl font-medium ml-4">Install</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-start w-full">
                        <h2 className="text-3xl md:text-[54px] text-white font-medium tracking-tight mb-8">Airo is Up To Date</h2>
                        <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 mb-4">
                            <Check className="w-24 h-24 md:w-36 md:h-36 text-[#00c800] shrink-0" />
                            <h3 className="text-2xl md:text-[40px] text-gray-300 font-medium tracking-tight leading-tight text-center sm:text-left">Version {currentVersion}<br/>is the latest available.</h3>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const CircleButton = ({ icon: Icon, colorClass, title, onClick }: any) => (
    <div className="shrink-0 snap-center flex flex-col items-center justify-center gap-6 cursor-pointer" onClick={onClick} style={{ width: '180px' }}>
        <motion.div 
           initial={{ scale: 0.9, opacity: 0 }}
           animate={{ scale: 1, opacity: 1 }}
           whileHover={{ scale: 1.1 }}
           whileTap={{ scale: 0.95 }}
           className={`w-36 h-36 rounded-full flex items-center justify-center shadow-lg border-4 border-white/20 relative z-10 ${colorClass}`}
        >
            <Icon className="w-16 h-16 text-white" />
        </motion.div>
        <span className="text-white font-sans font-bold text-2xl text-center tracking-wide">{title}</span>
    </div>
);

export const MainMenu = ({
    onClose, robotId, aiUsageSeconds, aiUsageLimitSeconds, localMemory, qrCommanderEnabled, setQrCommanderEnabled, onTestMovement, onStartDance, libraryItems, onIterate, onDeleteLibraryItem, onStartAutoOnboarding, airoFlags, setAiroFlags,
    classicModePreference, setClassicModePreference, usageLimitReached
}: MainMenuProps) => {
    const [menuState, setMenuState] = useState<MenuState>('MAIN');
    const [vol, setVol] = useState(() => Math.round(getCurrentVolume() * 10));
    const touchStartY = React.useRef<number>(0);
    const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
    const [contextMenuTarget, setContextMenuTarget] = useState<number | null>(null);
    const pressTimer = React.useRef<NodeJS.Timeout | null>(null);
    const [showOnboardingChoices, setShowOnboardingChoices] = useState(false);

    // Family State
    const [familyMembers, setFamilyMembers] = useState<{name: string, image: string}[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('airo_family_members') || '[]');
        } catch {
            return [];
        }
    });
    const [isAddingFamilyMember, setIsAddingFamilyMember] = useState(false);
    const [newFamilyMemberName, setNewFamilyMemberName] = useState('');
    const familyVideoRef = React.useRef<HTMLVideoElement>(null);
    const familyCanvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        if (menuState === 'FAMILY' && isAddingFamilyMember) {
            import('../hooks/useSharedCamera').then(({ getSharedCamera }) => {
                getSharedCamera().then(res => {
                    if (familyVideoRef.current && res.stream) {
                        familyVideoRef.current.srcObject = res.stream;
                        familyVideoRef.current.play().catch(e => console.warn("Family video play failed:", e));
                    }
                });
            });
        }
    }, [menuState, isAddingFamilyMember]);

    const handleCaptureFamilyMember = () => {
        if (!newFamilyMemberName.trim()) {
            alert('Please enter a name first');
            return;
        }
        if (familyVideoRef.current && familyCanvasRef.current) {
            const video = familyVideoRef.current;
            const canvas = familyCanvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Keep original non-inverted for face recognition accuracy, or invert if needed
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const image = canvas.toDataURL('image/jpeg', 0.8);
                const updated = [...familyMembers, { name: newFamilyMemberName.trim(), image }];
                setFamilyMembers(updated);
                localStorage.setItem('airo_family_members', JSON.stringify(updated));
                setIsAddingFamilyMember(false);
                setNewFamilyMemberName('');
            }
        }
    };
    
    const handleDeleteFamilyMember = (index: number) => {
        const updated = [...familyMembers];
        updated.splice(index, 1);
        setFamilyMembers(updated);
        localStorage.setItem('airo_family_members', JSON.stringify(updated));
    };

    const handleBack = () => {
        if (menuState === 'MAIN') {
            onClose();
        } else if (menuState === 'QR_CONFIRM' || menuState === 'ABOUT' || menuState === 'UPDATES' || menuState === 'DEBUGS' || menuState === 'VOLUME') {
            setMenuState('SETTINGS');
        } else {
            setMenuState('MAIN');
        }
    };


    const mainScrollRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (menuState === 'MAIN' && mainScrollRef.current) {
            // Scroll past the first item to the second one to start
            // Item width is 180px, gap is 48px, so we need to scroll by 228px
            mainScrollRef.current.scrollLeft = 228;
        }
    }, [menuState]);

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (e.currentTarget) {
            e.currentTarget.scrollLeft += e.deltaY;
        }
    };

    const renderMainContent = () => {
        if (menuState === 'MAIN') {
            return (
                <div 
                    ref={mainScrollRef}
                    onWheel={handleWheel}
                    className="flex w-full overflow-x-auto gap-12 snap-x snap-mandatory items-center h-full no-scrollbar touch-pan-x before:shrink-0 before:w-[calc(50%-90px)] after:shrink-0 after:w-[calc(50%-90px)]"
                >
                    {qrCommanderEnabled && (
                        <CircleButton 
                            icon={Scan} colorClass="bg-gradient-to-tr from-blue-500 to-indigo-400" 
                            title="Scan AirCard" onClick={onClose} 
                        />
                    )}
                    <CircleButton 
                        icon={Users} colorClass="bg-gradient-to-tr from-pink-500 to-rose-400" 
                        title="Family" onClick={() => setMenuState('FAMILY')} 
                    />
                    <CircleButton 
                        icon={PartyPopper} colorClass="bg-gradient-to-tr from-fuchsia-500 to-purple-400" 
                        title="Fun Stuff" onClick={() => setMenuState('FUN_STUFF')} 
                    />
                    <CircleButton 
                        icon={ImageIcon} colorClass="bg-gradient-to-tr from-yellow-500 to-orange-400" 
                        title="Library" onClick={() => setMenuState('LIBRARY')} 
                    />
                    <CircleButton 
                        icon={Smartphone} colorClass="bg-gradient-to-tr from-blue-500 to-cyan-400" 
                        title="Mobile" onClick={() => setMenuState('MOBILE_CONNECT')} 
                    />
                    <CircleButton 
                        icon={Brain} colorClass="bg-gradient-to-tr from-emerald-500 to-green-400" 
                        title="AI Usage" onClick={() => setMenuState('AI_USAGE')} 
                    />
                    <CircleButton 
                        icon={Cpu} colorClass="bg-gradient-to-tr from-yellow-500 to-amber-400" 
                        title="Memory" onClick={() => setMenuState('MEMORY')} 
                    />
                    <CircleButton 
                        icon={Settings} colorClass="bg-gradient-to-tr from-gray-600 to-gray-400" 
                        title="Settings" onClick={() => setMenuState('SETTINGS')} 
                    />
                    <CircleButton 
                        icon={RefreshCw} colorClass="bg-gradient-to-tr from-red-600 to-rose-400" 
                        title="Restart" onClick={() => window.location.reload()} 
                    />
                </div>
            );
        }

        if (menuState === 'FAMILY') {
            return (
                <div className="flex flex-col h-full w-full p-8 md:p-12 overflow-y-auto pb-32">
                    <h2 className="text-4xl text-white font-bold mb-8 tracking-tight">Family Members</h2>
                    
                    {isAddingFamilyMember ? (
                        <div className="flex flex-col items-center justify-center max-w-2xl mx-auto w-full gap-6">
                            <div className="relative w-full aspect-video rounded-3xl overflow-hidden border-4 border-white/20 bg-black shadow-2xl">
                                <video 
                                    ref={familyVideoRef} 
                                    autoPlay 
                                    playsInline 
                                    muted 
                                    className="w-full h-full object-cover scale-x-[-1]"
                                ></video>
                                <div className="absolute inset-0 border-4 border-dashed border-white/40 rounded-3xl m-8 pointer-events-none"></div>
                                <div className="absolute bottom-6 w-full text-center text-white/80 font-mono text-sm uppercase tracking-widest font-bold">
                                    Align Face in Frame
                                </div>
                            </div>
                            <canvas ref={familyCanvasRef} className="hidden" />
                            
                            <div className="flex flex-col md:flex-row gap-4 w-full">
                                <input 
                                    type="text" 
                                    placeholder="Enter Name..."
                                    value={newFamilyMemberName}
                                    onChange={e => setNewFamilyMemberName(e.target.value)}
                                    className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-white text-xl placeholder:text-white/40 outline-none focus:border-rose-400 focus:bg-white/20 transition-all text-center md:text-left font-medium"
                                    autoFocus
                                />
                                <button 
                                    onClick={handleCaptureFamilyMember}
                                    className="bg-rose-500 hover:bg-rose-400 text-white font-bold px-8 py-4 rounded-2xl text-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-3"
                                >
                                    <Camera className="w-6 h-6" />
                                    Capture
                                </button>
                                <button 
                                    onClick={() => { setIsAddingFamilyMember(false); setNewFamilyMemberName(''); }}
                                    className="bg-white/10 hover:bg-white/20 text-white font-bold px-8 py-4 rounded-2xl text-xl transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full">
                            {familyMembers.length === 0 ? (
                                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10 mb-8">
                                    <Users className="w-20 h-20 mx-auto text-white/20 mb-4" />
                                    <p className="text-white/60 text-xl font-medium">No family members registered yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 mb-12">
                                    {familyMembers.map((member, i) => (
                                        <div key={i} className="relative group bg-white/10 border border-white/20 rounded-2xl overflow-hidden aspect-square flex flex-col">
                                            <div className="flex-1 overflow-hidden relative">
                                                <img src={member.image} alt={member.name} className="w-full h-full object-cover scale-x-[-1]" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                                            </div>
                                            <div className="absolute bottom-0 w-full p-4 flex items-center justify-between">
                                                <span className="text-white font-bold truncate text-lg">{member.name}</span>
                                                <button 
                                                    onClick={() => handleDeleteFamilyMember(i)}
                                                    className="bg-red-500/80 hover:bg-red-500 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {familyMembers.length < 10 && (
                                <div className="flex flex-col items-center gap-4">
                                    {!showOnboardingChoices ? (
                                        <button 
                                            onClick={() => setShowOnboardingChoices(true)}
                                            className="bg-rose-500 hover:bg-rose-400 text-white font-bold px-8 py-4 rounded-full text-xl shadow-lg transition-transform active:scale-95 flex items-center gap-3"
                                        >
                                            <Plus className="w-6 h-6" />
                                            Register Member
                                        </button>
                                    ) : (
                                        <div className="flex gap-4">
                                            <button 
                                                onClick={() => { 
                                                    setShowOnboardingChoices(false);
                                                    if (onStartAutoOnboarding) {
                                                        onStartAutoOnboarding();
                                                        onClose();
                                                    }
                                                }}
                                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-4 rounded-2xl text-lg shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                                            >
                                                <Smartphone className="w-5 h-5" />
                                                Automatic (VUI)
                                            </button>
                                            <button 
                                                onClick={() => { 
                                                    setShowOnboardingChoices(false);
                                                    setIsAddingFamilyMember(true);
                                                }}
                                                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-4 rounded-2xl text-lg shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                                            >
                                                <Terminal className="w-5 h-5" />
                                                Manual
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        if (menuState === 'SETTINGS') {
            return (
                <div className="flex flex-col h-full w-full items-center justify-center pt-12">
                    <h2 className="text-4xl text-white font-bold mb-12 tracking-tight">Settings</h2>
                    <div 
                        onWheel={handleWheel}
                        className="flex w-full overflow-x-auto gap-12 snap-x snap-mandatory items-center pb-8 no-scrollbar touch-pan-x before:shrink-0 before:w-[calc(50%-90px)] after:shrink-0 after:w-[calc(50%-90px)]"
                    >
                        <CircleButton 
                            icon={airoFlags.microphoneMuted ? MicOff : Mic} 
                            colorClass={airoFlags.microphoneMuted ? "bg-gradient-to-tr from-red-600 to-rose-400" : "bg-gradient-to-tr from-green-600 to-emerald-400"} 
                            title={airoFlags.microphoneMuted ? "Mic Muted" : "Mic On"} 
                            onClick={() => {
                                setAiroFlags((prev: any) => ({ ...prev, microphoneMuted: !prev.microphoneMuted }));
                            }} 
                        />
                        <CircleButton icon={Info} colorClass="bg-gradient-to-tr from-slate-600 to-slate-500" title="About" onClick={() => setMenuState('ABOUT')} />
                        <CircleButton icon={Volume2} colorClass="bg-gradient-to-tr from-slate-600 to-slate-500" title="Volume" onClick={() => setMenuState('VOLUME')} />
                        <CircleButton icon={QrCode} colorClass="bg-gradient-to-tr from-slate-600 to-slate-500" title="AirCard Scanner" onClick={() => setMenuState('QR_CONFIRM')} />
                        <CircleButton icon={CloudLightning} colorClass="bg-gradient-to-tr from-slate-600 to-slate-500" title="Updates" onClick={() => {
                            setMenuState('UPDATES');
                        }} />
                        <CircleButton icon={Terminal} colorClass="bg-gradient-to-tr from-slate-600 to-slate-500" title="Debugs" onClick={() => {
                            setMenuState('DEBUGS');
                        }} />
                    </div>
                </div>
            );
        }

        if (menuState === 'QR_CONFIRM') {
            return (
                <div className="flex flex-col md:flex-row w-full h-full text-white overflow-y-auto">
                    <div className="w-full md:w-1/3 flex-shrink-0 flex flex-col items-center justify-center p-8 border-b md:border-b-0 md:border-r border-white/10 bg-white/5 text-center">
                        <h2 className="text-4xl md:text-[54px] text-white font-medium tracking-tight mb-2">AirCards</h2>
                        <p className="text-white text-base md:text-lg mb-8 leading-tight">AirCards are custom software<br/>that can be presented to modify AirOS</p>
                        <div className="bg-white p-4 flex items-center gap-4 text-black w-64 md:w-72 h-32 md:h-36 justify-center rounded-xl">
                            <div className="text-xl md:text-2xl font-bold leading-none flex flex-col items-start">AirCard<br/><span className="text-xs md:text-sm font-normal mt-1">Example</span></div>
                            <QrCode className="w-16 h-16 md:w-24 md:h-24 stroke-[1.5]" />
                        </div>
                    </div>
                    <div className="w-full md:w-2/3 flex-shrink-0 flex flex-col items-center justify-start md:justify-center p-8 md:p-12 text-center min-h-max">
                        <h1 className="text-4xl md:text-[64px] text-white font-medium tracking-tight mb-8 md:mb-8 mt-4 md:mt-0">AirCard Settings</h1>
                        
                        <h2 className="text-2xl md:text-[40px] text-white font-medium mb-1">AirCard Scanning:</h2>
                        <p className="text-lg md:text-2xl text-white mb-4">Allow scanning of AirCards</p>
                        <button 
                            onClick={() => setQrCommanderEnabled(!qrCommanderEnabled)} 
                            className={`px-8 py-2 rounded-full text-xl md:text-3xl font-medium text-white mb-12 ${qrCommanderEnabled ? 'bg-[#00c800]' : 'bg-[#ff0000]'}`}
                        >
                            {qrCommanderEnabled ? 'Enabled' : 'Disabled'}
                        </button>

                        <h2 className="text-2xl md:text-[40px] text-white font-medium mb-1">AutoScan</h2>
                        <p className="text-lg md:text-2xl text-white mb-4">Auto Scan any presented AirCards</p>
                        <button className="px-8 py-2 rounded-full text-xl md:text-3xl font-medium text-white bg-[#ff0000]">
                            Disabled
                        </button>
                    </div>
                </div>
            );
        }

        if (menuState === 'AI_USAGE') {
            const pct = Math.min(100, Math.round((aiUsageSeconds / aiUsageLimitSeconds) * 100));
            const color = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-orange-400' : 'bg-green-400';
            return (
                <div className="flex flex-col h-full w-full items-center justify-center p-8 max-w-2xl mx-auto">
                    <h2 className="text-3xl text-white font-bold mb-12">AI Usage Tracking</h2>
                    <div className="w-full bg-gray-800 rounded-full h-8 overflow-hidden border border-gray-600 shadow-inner">
                        <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
                    </div>
                    <div className="mt-6 text-xl text-gray-300 font-medium font-mono">
                        {Math.floor(aiUsageSeconds / 60)} / {Math.floor(aiUsageLimitSeconds / 60)} Minutes Consumed
                    </div>
                    <div className="mt-2 text-sm text-gray-500 mb-10">Robot ID: {robotId}</div>

                    <div className="w-full border-t border-white/10 pt-8 flex flex-col items-center">
                        <h2 className="text-2xl md:text-[32px] text-white font-medium mb-1">Classic Mode</h2>
                        <p className="text-base md:text-xl text-gray-400 mb-4 text-center max-w-md">
                            Uses the standard cloud voice pipeline instead of realtime Live API. Doesn't count towards your AI usage minutes above.
                        </p>
                        <button
                            onClick={() => setClassicModePreference && setClassicModePreference(!classicModePreference)}
                            disabled={usageLimitReached}
                            className={`px-8 py-2 rounded-full text-xl md:text-3xl font-medium text-white mb-2 ${(classicModePreference || usageLimitReached) ? 'bg-[#00c800]' : 'bg-[#ff0000]'} ${usageLimitReached ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {(classicModePreference || usageLimitReached) ? 'Enabled' : 'Disabled'}
                        </button>
                        {usageLimitReached && (
                            <p className="text-sm text-orange-400 font-medium mt-2 text-center max-w-md">
                                AI usage limit reached - automatically switched to Classic Mode. Realtime mode will be available again once usage is reset.
                            </p>
                        )}
                    </div>
                </div>
            );
        }

        if (menuState === 'MEMORY') {
            const memoryEntries = Object.entries(localMemory).sort((a, b) => a[1].localeCompare(b[1]));
            return (
                <div className="flex flex-col h-full w-full items-center justify-start p-8 max-w-4xl mx-auto overflow-hidden">
                    <h2 className="text-3xl text-white font-bold mb-8 flex-shrink-0">Local Memory</h2>
                    <div 
                        className="w-full overflow-y-auto no-scrollbar pb-16 touch-pan-y"
                    >
                        {memoryEntries.length === 0 ? (
                            <div className="text-gray-400 text-center py-12 text-lg">No memories stored yet.</div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {memoryEntries.map(([key, value]) => (
                                    <div key={key} className="bg-gray-800/60 p-4 rounded-xl border border-white/5 shadow-sm text-left">
                                        <div className="text-white text-lg font-medium">{value}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        if (menuState === 'VOLUME') {
            return (
                <div className="flex flex-col h-full w-full items-center justify-center pt-12">
                    <h2 className="text-4xl text-white font-bold mb-12 tracking-tight">System Volume</h2>
                    <div className="w-full max-w-sm px-8 flex flex-col items-center gap-8">
                        <div className="flex items-center gap-4 text-blue-400">
                            <Volume2 size={48} />
                            <span className="text-5xl font-black">{vol}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="10"
                            step="1"
                            value={vol}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setVol(val);
                                setSoundVolume(val / 10);
                            }}
                            className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                </div>
            );
        }

        if (menuState === 'ABOUT') {
            return (
                <div className="flex flex-col md:flex-row w-full h-full text-white overflow-y-auto">
                    <div className="w-full md:w-1/3 flex-shrink-0 flex flex-col items-center justify-center p-8 border-b md:border-b-0 md:border-r border-white/10 bg-white/5 text-center">
                        <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-br ${releaseInfo.gradient} flex items-center justify-center text-white text-5xl md:text-[80px] font-black mb-6 tracking-tighter shrink-0`}>{releaseInfo.version}</div>
                        <h3 className="text-white text-2xl md:text-3xl font-bold mb-2">AirOS {releaseInfo.fullVersion}</h3>
                        <p className="text-gray-300 text-base md:text-lg">Build: {releaseInfo.build}</p>
                        <p className="text-gray-300 text-base md:text-lg">Release Date: {releaseInfo.releaseDate}</p>
                    </div>
                    <div className="w-full md:w-2/3 flex-shrink-0 flex flex-col items-start justify-start md:justify-center p-8 md:p-16 text-left min-h-max">
                        <h2 className="text-3xl md:text-5xl text-white font-medium tracking-tight mb-2 mt-4 md:mt-0">My Robot:</h2>
                        <p className="text-xl md:text-3xl text-gray-200 font-medium mb-1">Robot ID: <span className="break-all">{robotId}</span></p>
                        <p className="text-xl md:text-3xl text-gray-200 font-medium mb-10 md:mb-16">Model: AR-10 (Prototype)</p>
                        
                        <h2 className="text-3xl md:text-5xl text-white font-medium tracking-tight mb-4">Changelog:</h2>
                        <ul className="text-lg md:text-2xl text-gray-200 font-medium list-disc ml-6 md:ml-8 flex flex-col gap-2">
                            {releaseInfo.changelog.map((log, i) => (
                                <li key={i}>{log}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            );
        }

        if (menuState === 'UPDATES') {
            return (
                <UpdateCheck />
            );
        }

        if (menuState === 'DEBUGS') {
            return (
                <div className="flex flex-col md:flex-row w-full h-full text-white overflow-y-auto">
                    <div className="w-full md:w-1/3 flex-shrink-0 flex flex-col items-center justify-center p-8 border-b md:border-b-0 md:border-r border-white/10 bg-white/5 text-center">
                        <h2 className="text-4xl md:text-[54px] text-white font-medium tracking-tight mb-2">Debugs</h2>
                        <p className="text-white text-base md:text-lg mb-8 leading-tight">Airo Debug Features</p>
                        <div className="w-48 md:w-64 h-32 md:h-40 bg-[#333333] rounded-3xl flex items-center justify-start p-6">
                            <span className="text-[#00ff00] font-mono text-2xl md:text-3xl font-bold">Debug_</span>
                        </div>
                    </div>
                    <div className="w-full md:w-2/3 flex-shrink-0 flex flex-col items-center justify-start md:justify-center p-4 md:p-8 pb-4 min-h-max">
                        <h2 className="text-3xl md:text-[54px] text-white font-medium tracking-tight mb-4 w-full text-center mt-4 md:mt-0">System Logs:</h2>
                        <div className="bg-[#7a7a7a] rounded-[24px] md:rounded-[40px] w-full max-w-2xl flex-1 min-h-[300px] md:min-h-0 mb-6 p-4 md:p-6 overflow-y-auto font-mono text-xs md:text-sm text-white flex flex-col items-start justify-start text-left">
                            <LogsView />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto px-4 md:px-0">
                            <button onClick={onTestMovement} className="bg-[#7a7a7a] text-white px-6 py-3 rounded-full text-lg md:text-2xl font-medium w-full sm:w-auto whitespace-nowrap">Run Motor Test</button>
                            <button className="bg-[#7a7a7a] text-white px-6 py-3 rounded-full text-lg md:text-2xl font-medium w-full sm:w-auto whitespace-nowrap">Test Permissions</button>
                        </div>
                    </div>
                </div>
            );
        }

        if (menuState === 'MOBILE_CONNECT') {
            return (
                <div className="flex flex-col h-full w-full items-center justify-center p-8 text-center max-w-md mx-auto">
                    <Smartphone className="w-20 h-20 text-cyan-400 mb-8" />
                    <h2 className="text-3xl text-white font-bold mb-4">Mobile Connect</h2>
                    <p className="text-gray-400 text-xl">Integration with Airo Mobile App is coming soon in a future update.</p>
                </div>
            );
        }

        if (menuState === 'FUN_STUFF') {
            return (
               <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-sm w-full flex flex-col items-center text-center shadow-2xl mx-auto mt-20 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                   <div className="w-16 h-16 bg-fuchsia-500/20 rounded-full flex items-center justify-center mb-4">
                       <PartyPopper className="w-8 h-8 text-fuchsia-400" />
                   </div>
                   <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Dance Mode</h2>
                   <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                       Please place Airow on the floor and ensure it has enough freedom to move around safely.
                   </p>
                   
                   <div className="flex flex-col w-full gap-3">
                       <button onClick={() => { if (onStartDance) onStartDance(1); onClose(); }} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Wobble Spin</button>
                       <button onClick={() => { if (onStartDance) onStartDance(2); onClose(); }} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Square Dance</button>
                       <button onClick={() => { if (onStartDance) onStartDance(3); onClose(); }} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Rapid Shake</button>
                       <button onClick={() => { if (onStartDance) onStartDance(4); onClose(); }} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Backup Beep</button>
                       <button onClick={() => { if (onStartDance) onStartDance(5); onClose(); }} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Tornado</button>
                   </div>
                   <p className="text-gray-500 text-xs mt-6">You can also say <strong className="text-gray-400">"Hey Airow, do a dance!"</strong></p>
               </div>
            );
        }
        
        if (viewingPhoto) {
            return (
                <div className="absolute inset-0 z-[60] bg-black/95 flex flex-col" onClick={(e) => { e.stopPropagation(); setViewingPhoto(null); }}>
                    <div className="flex justify-start items-center p-6 shrink-0">
                        <button onClick={() => setViewingPhoto(null)} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                            <ChevronLeft className="text-white" size={24} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-hidden p-4 flex items-center justify-center pb-20">
                        <img src={viewingPhoto} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
                    </div>
                </div>
            );
        }

        if (menuState === 'LIBRARY') {
            const items = Array.isArray(libraryItems) ? libraryItems : [];
            
            const handleItemPressStart = (timestamp: number) => {
                if (pressTimer.current) clearTimeout(pressTimer.current);
                pressTimer.current = setTimeout(() => {
                    setContextMenuTarget(timestamp);
                }, 600);
            };

            const handleItemPressEnd = () => {
                if (pressTimer.current) clearTimeout(pressTimer.current);
            };
            
            return (
               <div className="flex flex-col h-full w-full p-6 pb-20 mt-4 overflow-y-auto no-scrollbar relative" onClick={(e) => e.stopPropagation()}>
                   <div className="flex justify-between items-center mb-8 sticky top-0 bg-gray-900/90 z-10 py-2">
                       <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                          <ImagePlus className="text-yellow-400" size={28} />
                          Creation Library
                       </h2>
                       <button onClick={() => setMenuState('MAIN')} className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                           <X className="text-gray-400" />
                       </button>
                   </div>
                   
                   {items.length === 0 ? (
                       <div className="flex flex-col items-center justify-center flex-1 text-center opacity-50 mt-10 text-white">
                           <ImageIcon size={48} className="mb-4" />
                           <p>Your library is empty.</p>
                           <p className="text-sm mt-2">Ask Airow to generate an image or take a photo!</p>
                       </div>
                   ) : (
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                           {items.slice().reverse().map((item, idx) => (
                               <div 
                                    key={idx} 
                                    className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer border border-white/10"
                                    onMouseDown={() => handleItemPressStart(item.timestamp)}
                                    onMouseUp={handleItemPressEnd}
                                    onMouseLeave={handleItemPressEnd}
                                    onTouchStart={() => handleItemPressStart(item.timestamp)}
                                    onTouchEnd={handleItemPressEnd}
                                    onClick={() => {
                                        if (contextMenuTarget === item.timestamp) return; // Prevent click if context menu is open
                                        if (item.type === 'generated' && item.prompt && onIterate) {
                                            onIterate(item.prompt);
                                            onClose();
                                        } else if (item.type === 'photo') {
                                            setViewingPhoto(item.url);
                                        }
                                    }}
                                >
                                   <img src={item.url} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                   
                                   {/* Context Menu Overlay */}
                                   <AnimatePresence>
                                       {contextMenuTarget === item.timestamp && (
                                           <motion.div 
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center p-4 gap-3"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setContextMenuTarget(null);
                                                }}
                                            >
                                                <button 
                                                    className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-2 rounded-xl text-sm font-bold w-full hover:bg-red-500/40 transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onDeleteLibraryItem) onDeleteLibraryItem(item.timestamp);
                                                        setContextMenuTarget(null);
                                                    }}
                                                >
                                                    Delete
                                                </button>
                                                <button 
                                                    className="bg-white/10 text-white px-4 py-2 rounded-xl text-sm font-medium w-full"
                                                >
                                                    Cancel
                                                </button>
                                           </motion.div>
                                       )}
                                   </AnimatePresence>
                                   
                                   <div className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4 text-center ${contextMenuTarget === item.timestamp ? 'hidden' : ''}`}>
                                       {item.type === 'generated' ? (
                                           <div className="flex flex-col items-center">
                                               <RefreshCw size={24} className="text-white mb-2" />
                                               <span className="text-white font-bold text-sm">Iterate</span>
                                               <span className="text-white/60 text-xs mt-1 line-clamp-2">"{item.prompt}"</span>
                                           </div>
                                       ) : (
                                           <div className="flex flex-col items-center">
                                               <Scan size={24} className="text-white mb-2" />
                                               <span className="text-white font-bold text-sm">View Photo</span>
                                           </div>
                                       )}
                                   </div>
                                   {item.type === 'photo' && (
                                       <div className="absolute top-2 left-2 bg-black/50 p-1.5 rounded-lg">
                                           <Scan size={14} className="text-white" />
                                       </div>
                                   )}
                               </div>
                           ))}
                       </div>
                   )}
               </div>
            );
        }

        return null;
    };

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                className="absolute inset-0 z-50 bg-gray-900/95 flex flex-col"
                onClick={handleBack} // Tapping background acts as back
                onTouchStart={(e) => {
                    touchStartY.current = e.touches[0].clientY;
                }}
                onTouchEnd={(e) => {
                    if (touchStartY.current > 0 && e.changedTouches.length > 0) {
                        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
                        if (deltaY > 150) {
                            // Check if we started on a scrollable element that isn't at the top
                            const target = e.target as HTMLElement;
                            const scrollable = target.closest('.overflow-y-auto, .touch-pan-y') as HTMLElement;
                            
                            if (scrollable && scrollable.scrollTop > 5) {
                                // User is scrolling down the content, don't close
                                touchStartY.current = 0;
                                return;
                            }
                            
                            handleBack();
                        }
                    }
                    touchStartY.current = 0;
                }}
                onTouchCancel={(e) => {
                    if (touchStartY.current > 0 && e.changedTouches.length > 0) {
                        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
                        if (deltaY > 150) {
                            const target = e.target as HTMLElement;
                            const scrollable = target.closest('.overflow-y-auto, .touch-pan-y') as HTMLElement;
                            if (scrollable && scrollable.scrollTop > 5) {
                                touchStartY.current = 0;
                                return;
                            }
                            handleBack();
                        }
                    }
                    touchStartY.current = 0;
                }}
                onPointerDown={(e) => {
                    touchStartY.current = e.clientY;
                }}
                onPointerUp={(e) => {
                    if (touchStartY.current > 0) {
                        const deltaY = e.clientY - touchStartY.current;
                        if (deltaY > 150) {
                            // Check if we started on a scrollable element that isn't at the top
                            const target = e.target as HTMLElement;
                            const scrollable = target.closest('.overflow-y-auto, .touch-pan-y') as HTMLElement;
                            
                            if (scrollable && scrollable.scrollTop > 5) {
                                // User is scrolling down the content, don't close
                                touchStartY.current = 0;
                                return;
                            }
                            
                            handleBack();
                        }
                    }
                    touchStartY.current = 0;
                }}
            >
                <div 
                    className="flex-1 w-full h-full flex flex-col items-center justify-center overflow-hidden"
                    onClick={(e) => e.stopPropagation()} // Prevent bubble up
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={menuState}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -20 }}
                            transition={{ duration: 0.2 }}
                            className="w-full h-full"
                        >
                            {renderMainContent()}
                        </motion.div>
                    </AnimatePresence>
                </div>
                {/* Swipe down indicator */}
                <div className="absolute bottom-6 w-full flex justify-center text-gray-400 opacity-50 animate-pulse pointer-events-none">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-sm">Swipe down to exit</span>
                        <div className="w-10 h-1 bg-gray-400 rounded-full"></div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
