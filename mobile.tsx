import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';

type DeviceStatus = {
  clientId: string;
  label: string;
  pairCode?: string;
  statusText?: string;
  connectionState?: string;
  ollieConnected?: boolean;
  movementEnabled?: boolean;
  assistantMuted?: boolean;
  updatedAt?: number;
};

type SkillCard = {
  id: string;
  name: string;
  description?: string;
  toolName?: string;
  trigger?: string;
  emoji?: string;
  color?: string;
};

type PageTab = 'commands' | 'move' | 'skills' | 'settings';

const STORAGE = {
  pairedClientId: 'airo.mobile.pairedClientId',
  pairedLabel: 'airo.mobile.pairedLabel',
  pairedCode: 'airo.mobile.pairedCode',
};

const MobileApp = () => {
  const [pairCodeInput, setPairCodeInput] = useState('');
  const [pairError, setPairError] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairedClientId, setPairedClientId] = useState<string>(() => window.localStorage.getItem(STORAGE.pairedClientId) || '');
  const [pairedLabel, setPairedLabel] = useState<string>(() => window.localStorage.getItem(STORAGE.pairedLabel) || 'Airo Unit');
  const [pairedCode, setPairedCode] = useState<string>(() => window.localStorage.getItem(STORAGE.pairedCode) || '');
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [activeTab, setActiveTab] = useState<PageTab>('commands');
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [status, setStatus] = useState('Ready');
  const [commandText, setCommandText] = useState('');
  const [remoteMute, setRemoteMute] = useState(false);
  const [remoteMovement, setRemoteMovement] = useState(true);

  const isPaired = Boolean(pairedClientId);

  const readJsonSafe = async (response: Response) => {
    const text = await response.text();
    try {
      return { ok: true as const, data: JSON.parse(text || '{}'), raw: text };
    } catch {
      return { ok: false as const, data: null, raw: text };
    }
  };

  const postTrigger = async (payload: Record<string, unknown>) => {
    if (!pairedClientId) return false;
    const response = await fetch('/backend/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: pairedClientId,
        pairCode: pairedCode || undefined,
        ...payload,
      }),
    });
    const parsed = await readJsonSafe(response);
    if (!parsed.ok) {
      setStatus('Robot command failed: invalid server response');
      return false;
    }
    const data: any = parsed.data;
    if (!response.ok || data?.ok === false || Number(data?.deliveredTo || 0) <= 0) {
      setStatus(data?.error || `Robot command failed (${response.status})`);
      return false;
    }
    return true;
  };

  const sendRemoteAction = async (action: string, payload: Record<string, unknown> = {}) => {
    const ok = await postTrigger({
      type: 'remote_action',
      action,
      payload,
    });
    setStatus(ok ? `Sent ${action}` : `Failed to send ${action}`);
  };

  const pairRobot = async () => {
    const code = pairCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) {
      setPairError('Enter your robot code first.');
      return;
    }
    setPairing(true);
    setPairError('');
    try {
      const response = await fetch('/backend/api/pair/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const parsed = await readJsonSafe(response);
      let payload: any = parsed.ok ? parsed.data : null;

      if (!response.ok || !payload?.ok || !payload?.device?.clientId) {
        // Fallback for older backend versions without /pair/verify:
        const devicesResponse = await fetch('/backend/api/devices', { cache: 'no-store' });
        const devicesParsed = await readJsonSafe(devicesResponse);
        if (devicesResponse.ok && devicesParsed.ok) {
          const devices = Array.isArray((devicesParsed.data as any)?.devices) ? (devicesParsed.data as any).devices : [];
          const match = devices.find((d: any) => String(d?.pairCode || '').toUpperCase() === code);
          if (match?.clientId) {
            payload = { ok: true, device: match };
          }
        }
      }

      if (!payload?.ok || !payload?.device?.clientId) {
        const backendHint = parsed.ok
          ? (payload?.error || 'Could not pair. Check the code and robot connection.')
          : 'Server returned HTML instead of API JSON. Ensure the HTTPS preview server is running (not static-only).';
        setPairError(backendHint);
        return;
      }
      const nextClientId = String(payload.device.clientId);
      const nextLabel = String(payload.device.label || 'Airo Unit');
      setPairedClientId(nextClientId);
      setPairedLabel(nextLabel);
      setPairedCode(code);
      window.localStorage.setItem(STORAGE.pairedClientId, nextClientId);
      window.localStorage.setItem(STORAGE.pairedLabel, nextLabel);
      window.localStorage.setItem(STORAGE.pairedCode, code);
      setStatus(`Paired with ${nextLabel}`);
      setPairCodeInput('');
      setActiveTab('commands');
    } catch (error) {
      setPairError(error instanceof Error ? error.message : String(error));
    } finally {
      setPairing(false);
    }
  };

  const unpair = () => {
    setPairedClientId('');
    setPairedLabel('Airo Unit');
    setPairedCode('');
    setDevice(null);
    window.localStorage.removeItem(STORAGE.pairedClientId);
    window.localStorage.removeItem(STORAGE.pairedLabel);
    window.localStorage.removeItem(STORAGE.pairedCode);
    setStatus('Unpaired');
  };

  useEffect(() => {
    if (!pairedClientId) return;
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const response = await fetch(`/backend/api/device?clientId=${encodeURIComponent(pairedClientId)}`, { cache: 'no-store' });
        let next: any = null;
        if (response.ok) {
          const parsed = await readJsonSafe(response);
          if (parsed.ok) {
            const payload = parsed.data as any;
            next = payload?.device || null;
          }
        }
        if (!next && pairedCode) {
          const devicesResponse = await fetch('/backend/api/devices', { cache: 'no-store' });
          if (devicesResponse.ok) {
            const devicesParsed = await readJsonSafe(devicesResponse);
            if (devicesParsed.ok) {
              const list = Array.isArray((devicesParsed.data as any)?.devices) ? (devicesParsed.data as any).devices : [];
              next = list.find((item: any) => String(item?.pairCode || '').toUpperCase() === pairedCode) || null;
              if (next?.clientId && next.clientId !== pairedClientId) {
                const reboundClientId = String(next.clientId);
                setPairedClientId(reboundClientId);
                window.localStorage.setItem(STORAGE.pairedClientId, reboundClientId);
              }
            }
          }
        }
        if (cancelled) return;
        setDevice(next);
        if (next) {
          setRemoteMute(Boolean(next.assistantMuted));
          setRemoteMovement(Boolean(next.movementEnabled));
        }
      } catch {}
    };
    void loadStatus();
    const timer = window.setInterval(() => {
      void loadStatus();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pairedClientId, pairedCode]);

  useEffect(() => {
    if (!isPaired) return;
    const loadSkills = async () => {
      try {
        const response = await fetch(`/skill-store.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const parsed = await readJsonSafe(response);
        if (!parsed.ok) return;
        const payload = parsed.data as any;
        setSkills(Array.isArray(payload?.skills) ? payload.skills : []);
      } catch {}
    };
    void loadSkills();
  }, [isPaired]);

  const statusBadge = useMemo(() => {
    const stale = !device?.updatedAt || Date.now() - Number(device.updatedAt) > 10000;
    if (!device) return { text: 'Offline', color: 'text-amber-300 border-amber-300/40 bg-amber-400/15' };
    if (stale) return { text: 'Stale', color: 'text-amber-300 border-amber-300/40 bg-amber-400/15' };
    return { text: 'Live', color: 'text-emerald-300 border-emerald-300/40 bg-emerald-400/15' };
  }, [device]);

  if (!isPaired) {
    return (
      <div className="min-h-screen bg-slate-950 text-white px-5 py-8">
        <div className="mx-auto max-w-md">
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-300/70">Airo Mobile</div>
          <h1 className="mt-3 text-3xl font-black">Pair Your Airo</h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            On your robot, open the menu and go to the <span className="text-cyan-300">Mobile App</span> page.
            Enter that 6-character code below.
          </p>
          <div className="mt-6 rounded-3xl border border-white/12 bg-white/5 p-4">
            <label className="block text-xs font-mono uppercase tracking-[0.24em] text-white/50">Robot Code</label>
            <input
              value={pairCodeInput}
              onChange={(event) => setPairCodeInput(event.target.value.toUpperCase())}
              placeholder="ABC123"
              className="mt-3 w-full rounded-2xl border border-white/12 bg-slate-900 px-4 py-4 text-lg font-mono uppercase tracking-[0.18em] text-white outline-none"
            />
            {pairError ? <div className="mt-3 text-sm text-red-300">{pairError}</div> : null}
            <button
              onClick={() => void pairRobot()}
              disabled={pairing}
              className="mt-4 w-full rounded-full bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 disabled:opacity-60"
            >
              {pairing ? 'Pairing...' : 'Pair Airo'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      <div className="mx-auto max-w-3xl px-4 pt-5">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold">{pairedLabel}</div>
              <div className="mt-1 text-xs text-white/55">{device?.statusText || 'Waiting for robot status...'}</div>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-[0.22em] ${statusBadge.color}`}>
              {statusBadge.text}
            </div>
          </div>
          <div className="mt-3 text-xs text-white/45">Client: {pairedClientId}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void postTrigger({ type: 'voice_mode' }).then((ok) => setStatus(ok ? 'Voice mode triggered' : 'Failed to trigger voice mode'))}
              className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-950"
            >
              Wake Airo
            </button>
            <button
              onClick={unpair}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/85"
            >
              Unpair
            </button>
          </div>
        </div>

        {activeTab === 'commands' && (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.24em] text-white/50">Commands</div>
            <div className="mt-3 flex gap-2">
              <input
                value={commandText}
                onChange={(event) => setCommandText(event.target.value)}
                placeholder="Tell Airo what to do..."
                className="flex-1 rounded-2xl border border-white/12 bg-slate-900 px-4 py-3 text-white outline-none"
              />
              <button
                onClick={() =>
                  void postTrigger({ type: 'voice_mode', prompt: commandText.trim() }).then((ok) =>
                    setStatus(ok ? 'Command sent' : 'Command failed')
                  )
                }
                className="rounded-2xl bg-cyan-400 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-950"
              >
                Send
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => void postTrigger({ type: 'voice_mode', prompt: 'What is the weather right now?' })} className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm">Weather</button>
              <button onClick={() => void postTrigger({ type: 'voice_mode', prompt: 'Read the latest news' })} className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm">News</button>
              <button onClick={() => void postTrigger({ type: 'voice_mode', prompt: 'Take a photo' })} className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm">Take Photo</button>
              <button onClick={() => void postTrigger({ type: 'voice_mode', prompt: 'What time is it right now?' })} className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm">Time</button>
            </div>
          </div>
        )}

        {activeTab === 'move' && (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.24em] text-white/50">Movement</div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button className="rounded-2xl border border-white/15 bg-white/5 p-4" onClick={() => void sendRemoteAction('turn_robot', { degrees: -90 })}>↺ 90</button>
              <button className="rounded-2xl border border-white/15 bg-white/5 p-4" onClick={() => void sendRemoteAction('move_robot', { direction: 'front', durationMs: 800, intensity: 0.8 })}>Front</button>
              <button className="rounded-2xl border border-white/15 bg-white/5 p-4" onClick={() => void sendRemoteAction('turn_robot', { degrees: 90 })}>90 ↻</button>
              <button className="rounded-2xl border border-white/15 bg-white/5 p-4" onClick={() => void sendRemoteAction('move_robot', { direction: 'left', durationMs: 650, intensity: 0.72 })}>Left</button>
              <button className="rounded-2xl border border-white/15 bg-white/5 p-4" onClick={() => void sendRemoteAction('face_user')}>Face User</button>
              <button className="rounded-2xl border border-white/15 bg-white/5 p-4" onClick={() => void sendRemoteAction('move_robot', { direction: 'right', durationMs: 650, intensity: 0.72 })}>Right</button>
              <button className="col-span-3 rounded-2xl border border-white/15 bg-white/5 p-4" onClick={() => void sendRemoteAction('move_robot', { direction: 'behind', durationMs: 800, intensity: 0.8 })}>Behind</button>
            </div>
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.24em] text-white/50">Skills</div>
            <div className="mt-4 grid gap-3">
              {skills.map((skill) => (
                <div key={skill.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{skill.name}</div>
                      <div className="mt-1 text-xs text-white/60">{skill.description || 'No description'}</div>
                    </div>
                    <div className="text-xl">{skill.emoji || '🧩'}</div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => void sendRemoteAction('install_skill', { skillId: skill.id })}
                      className="rounded-full border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-xs font-semibold text-cyan-100"
                    >
                      Install
                    </button>
                    <button
                      onClick={() => void sendRemoteAction('run_skill', { toolName: skill.toolName })}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90"
                    >
                      Run
                    </button>
                  </div>
                </div>
              ))}
              {!skills.length ? <div className="text-sm text-white/55">No skill-store entries found.</div> : null}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.24em] text-white/50">Settings</div>
            <div className="mt-4 grid gap-3">
              <button
                onClick={() => {
                  const next = !remoteMute;
                  setRemoteMute(next);
                  void sendRemoteAction('set_mute', { value: next });
                }}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left"
              >
                <div className="font-semibold">Mute Microphone</div>
                <div className="text-sm text-white/60">{remoteMute ? 'Enabled' : 'Disabled'}</div>
              </button>
              <button
                onClick={() => {
                  const next = !remoteMovement;
                  setRemoteMovement(next);
                  void sendRemoteAction('set_movement', { value: next });
                }}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left"
              >
                <div className="font-semibold">Movement</div>
                <div className="text-sm text-white/60">{remoteMovement ? 'Enabled' : 'Disabled'}</div>
              </button>
              <button
                onClick={() => void sendRemoteAction('open_menu')}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left"
              >
                <div className="font-semibold">Open Robot Menu</div>
                <div className="text-sm text-white/60">Show robot menu remotely.</div>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1 p-2">
          {[
            { id: 'commands', label: 'Commands', emoji: '🎙️' },
            { id: 'move', label: 'Move', emoji: '🕹️' },
            { id: 'skills', label: 'Skills', emoji: '🧩' },
            { id: 'settings', label: 'Settings', emoji: '⚙️' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as PageTab)}
              className={`rounded-2xl px-2 py-3 text-center text-xs font-semibold ${activeTab === tab.id ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-white/85'}`}
            >
              <div>{tab.emoji}</div>
              <div className="mt-1">{tab.label}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="fixed left-0 right-0 bottom-20 px-4">
        <div className="mx-auto max-w-3xl rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs text-white/70">
          {status}
        </div>
      </div>
    </div>
  );
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element for Airo Mobile');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>
);
