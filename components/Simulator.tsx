import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Environment, Grid, PerspectiveCamera } from '@react-three/drei';
import App from '../App';
import * as THREE from 'three';
import { Mic } from 'lucide-react';

// Removed EmulatedScreen to be put inline

const SCREEN_SCALE = 3.4;             // back to the original ~84-unit screen
const APP_W = 1024, APP_H = 600;    // native render res of <App />

// drei transform-mode renders ~this many world units per CSS px at scale=1.
// ~0.024 in your setup — tweak ONCE so the plate frames the UI, then leave it.
const PX_TO_UNITS = 0.024;
const screenW = APP_W * PX_TO_UNITS * SCREEN_SCALE;
const screenH = APP_H * PX_TO_UNITS * SCREEN_SCALE;

const Robot = () => {
    const groupRef = useRef<THREE.Group>(null);

    useEffect(() => {
        // Expose to MBotSimulator
        (window as any).simulatorRobot = {
            leftForward: 0,
            rightForward: 0,
            spinLeftFor: async (dir: string, degrees: number, speed: number) => {
                if (groupRef.current) {
                    const startRotation = groupRef.current.rotation.y;
                    const amount = (degrees * Math.PI) / 180;
                    const finalRotation = dir === 'forward' ? startRotation + amount : startRotation - amount;
                    
                    // Simple animation
                    const steps = Math.floor(degrees / 5);
                    const stepSize = amount / steps;
                    for (let i = 0; i < steps; i++) {
                        groupRef.current.rotation.y += (dir === 'forward' ? stepSize : -stepSize);
                        await new Promise(r => setTimeout(r, 16));
                    }
                    groupRef.current.rotation.y = finalRotation;
                }
            },
            spinRightFor: async (dir: string, degrees: number, speed: number) => {
                if (groupRef.current) {
                    const startRotation = groupRef.current.rotation.y;
                    const amount = (degrees * Math.PI) / 180;
                    const finalRotation = dir === 'forward' ? startRotation - amount : startRotation + amount;
                    
                    const steps = Math.floor(degrees / 5);
                    const stepSize = amount / steps;
                    for (let i = 0; i < steps; i++) {
                        groupRef.current.rotation.y += (dir === 'forward' ? -stepSize : stepSize);
                        await new Promise(r => setTimeout(r, 16));
                    }
                    groupRef.current.rotation.y = finalRotation;
                }
            }
        };
    }, []);

    useFrame(() => {
        // Continuous movement based on motor speeds mapped from MBotSimulator
        if (groupRef.current && (window as any).simulatorRobot) {
            const r = (window as any).simulatorRobot;
            const left = r.leftForward || 0;
            const right = r.rightForward || 0;
            
            // Simple differential drive math
            const speed = (left + right) / 2;
            // if left is positive and right is negative, it turns right (negative rotation Y)
            const turn = (left - right);
            
            groupRef.current.translateZ(speed * 0.003);
            groupRef.current.rotation.y += turn * -0.00015;
        }
    });

    return (
        <group ref={groupRef} position={[0, 0, 0]}>
            {/* Robot Base Body (gray box) */}
            <mesh castShadow position={[0, 17.5, 0]}>
                <boxGeometry args={[50, 35, 45]} />
                <meshStandardMaterial color="#d1d5db" roughness={0.4} />
            </mesh>

            {/* Wheels */}
            <mesh castShadow position={[-27, 8, 10]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[8, 8, 6, 32]} />
                <meshStandardMaterial color="#1f2937" />
            </mesh>
            <mesh castShadow position={[27, 8, 10]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[8, 8, 6, 32]} />
                <meshStandardMaterial color="#1f2937" />
            </mesh>
            {/* Caster Wheel front */}
            <mesh position={[0, 4, -15]}>
                <sphereGeometry args={[4, 16, 16]} />
                <meshStandardMaterial color="#fff" />
            </mesh>

            {/* Neck / Screen Mount */}
            <mesh castShadow position={[0, 42, -5]} rotation={[0.2, 0, 0]}>
                <boxGeometry args={[16, 20, 10]} />
                <meshStandardMaterial color="#374151" />
            </mesh>

            {/* Screen / UI */}
            <group position={[0, 60, 2.5]} rotation={[-0.1, 0, 0]}>
                <Html
                    transform
                    scale={SCREEN_SCALE}
                    position={[0, 0, 1.2]}
                    zIndexRange={[100, 0]}
                    occlude="blending"
                >
                    <div
                        style={{ width: APP_W, height: APP_H }}
                        className="bg-black overflow-hidden rounded-[40px] border-[16px] border-[#111] pointer-events-auto flex flex-col"
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onPointerMove={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                    >
                        <App />
                    </div>
                </Html>

                {/* backing plate AUTO-SIZED to match the UI (+4 for a thin bezel) */}
                <mesh receiveShadow castShadow position={[0, 0, 0]}>
                    <boxGeometry args={[screenW + 4, screenH + 4, 2]} />
                    <meshStandardMaterial color="#111827" roughness={0.8} side={THREE.FrontSide} />
                </mesh>
            </group>
            
            {/* Simulator Camera - Attached to Robot */}
            <PerspectiveCamera 
                makeDefault={false}
                name="robotCamera"
                position={[0, 62, -4]} 
                rotation={[0, Math.PI, 0]} 
                fov={70} 
            />
        </group>
    );
};

export function Simulator() {
    const [placedObjects, setPlacedObjects] = useState<{x: number, y: number, z: number}[]>([]);

    return (
        <div className="w-screen h-screen bg-neutral-900 border-4 border-indigo-500/50 relative overflow-hidden">
            <div className="absolute top-4 left-4 z-50 bg-black/80 text-white p-5 rounded-2xl font-mono text-xs backdrop-blur-md border border-white/10 shadow-2xl pointer-events-none">
                <h2 className="text-xl font-bold text-indigo-400 mb-2 font-sans tracking-tight">AiroSim Studio</h2>
                <p className="text-gray-200">Welcome to the Airo Simulator environment!</p>
                <ul className="mt-3 text-gray-400 space-y-1 ml-2">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-400"></div> Real 3D Physics & Movement</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Virtual Camera Feed Injection</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div> Fully Intercepted UI Layer</li>
                </ul>
                <div className="mt-5 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                    <p>🎯 <strong>Click anywhere on the desk</strong> to spawn a random red object.</p>
                    <p>🖱️ Drag to rotate view, Scroll to zoom.</p>
                </div>
            </div>

            <Canvas shadows gl={{ preserveDrawingBuffer: true }} camera={{ position: [-20, 50, 70], fov: 45 }}>
                <ambientLight intensity={0.6} />
                <directionalLight 
                    position={[30, 50, 30]} 
                    intensity={1.2} 
                    castShadow 
                    shadow-mapSize-width={2048}
                    shadow-mapSize-height={2048}
                />
                
                <Environment preset="city" />
                <OrbitControls makeDefault maxPolarAngle={Math.PI/2 - 0.05} />
                
                {/* Desk Surface */}
                <mesh 
                    receiveShadow 
                    position={[0, 0, 0]} 
                    rotation={[-Math.PI / 2, 0, 0]}
                    onClick={(e) => {
                        e.stopPropagation();
                        setPlacedObjects(prev => [...prev, { x: e.point.x, y: 10, z: e.point.z }]);
                    }}
                >
                    <planeGeometry args={[400, 400]} />
                    <meshStandardMaterial color="#2d3748" roughness={0.9} />
                </mesh>
                <Grid position={[0, 0.1, 0]} args={[400, 400]} cellColor="#4a5568" sectionColor="#4a5568" fadeDistance={200} />

                <Robot />

                {/* Placed Objects */}
                {placedObjects.map((pos, i) => (
                    <mesh key={i} position={[pos.x, pos.y, pos.z]} castShadow receiveShadow>
                         <boxGeometry args={[20, 20, 20]} />
                         <meshStandardMaterial color="#f56565" roughness={0.3} />
                    </mesh>
                ))}

                {/* Pre-existing Test Objects on Desk */}
                <mesh position={[-60, 10, -30]} castShadow receiveShadow>
                     <boxGeometry args={[20, 20, 20]} />
                     <meshStandardMaterial color="#f56565" roughness={0.3} />
                </mesh>
                <mesh position={[50, 15, -60]} castShadow receiveShadow>
                     <cylinderGeometry args={[10, 10, 30, 32]} />
                     <meshStandardMaterial color="#4299e1" />
                </mesh>
                <mesh position={[0, 5, -80]} castShadow receiveShadow>
                     <sphereGeometry args={[10, 32, 32]} />
                     <meshStandardMaterial color="#ecc94b" />
                </mesh>

            </Canvas>

            <div className="absolute right-8 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4 pointer-events-auto items-center">
                <button 
                    className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(37,99,235,0.4)] hover:bg-blue-500 active:bg-blue-700 transition-all active:scale-95 text-white border-4 border-blue-400/30"
                    onPointerDown={() => window.dispatchEvent(new Event('airo-mic-down'))}
                    onPointerUp={() => window.dispatchEvent(new Event('airo-mic-up'))}
                    onPointerLeave={() => window.dispatchEvent(new Event('airo-mic-up'))}
                >
                    <Mic size={40} />
                </button>
                <div className="font-mono text-xs text-blue-300 font-bold bg-black/60 px-3 py-1.5 rounded-lg backdrop-blur border border-blue-500/30 tracking-wider">
                    HOLD TO SPEAK
                </div>
            </div>
        </div>
    );
}
