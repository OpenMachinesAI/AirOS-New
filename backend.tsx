import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';

type BackendDevice = {
  clientId: string;
  label: string;
  statusText: string;
  connectionState: string;
  hasStarted: boolean;
  ollieConnected: boolean;
  assistantMuted: boolean;
  movementEnabled: boolean;
  cameraState: string;
  cameraMode?: string;
  opencvState?: string;
  recognizedFamilyName?: string;
  recognizedFamilyNotes?: string;
  visionTarget?: {
    kind?: string;
    source?: string;
    x?: number;
    y?: number;
    strength?: number;
  } | null;
  rearTarget?: {
    kind?: string;
    source?: string;
    x?: number;
    y?: number;
    strength?: number;
  } | null;
  frontPreview?: string;
  rearPreview?: string;
  updatedAt: number;
};

type BackendLogEntry = {
  id: string;
  clientId?: string;
  level: string;
  scope: string;
  message: string;
  detail: string;
  timestamp: number;
};

const BackendPage = () => {
  const [devices, setDevices] = useState<BackendDevice[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [status, setStatus] = useState('Waiting for Airo Units');
  const [prompt, setPrompt] = useState('');
  const [logs, setLogs] = useState<BackendLogEntry[]>([]);

  const refreshDevices = async () => {
    try {
      const response = await fetch('/backend/api/devices', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      const nextDevices = Array.isArray(payload?.devices) ? payload.devices : [];
      setDevices(nextDevices);
      if (selectedClientId !== 'all' && nextDevices.every((device: BackendDevice) => device.clientId !== selectedClientId)) {
        setSelectedClientId('all');
      }
      setStatus(nextDevices.length ? 'Backend linked' : 'Waiting for Airo Units');
    } catch {
      setStatus('Backend offline');
    }
  };

  const refreshLogs = async () => {
    try {
      const response = await fetch(`/backend/api/logs?clientId=${encodeURIComponent(selectedClientId)}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      setLogs(Array.isArray(payload?.logs) ? payload.logs : []);
    } catch {
      setLogs([]);
    }
  };

  const sendVoiceMode = async (clientId: string, nextPrompt?: string) => {
    const response = await fetch('/backend/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        type: 'voice_mode',
        prompt: nextPrompt?.trim() || null,
      }),
    });
    if (!response.ok) {
      throw new Error(`Trigger failed: ${response.status}`);
    }
    setStatus(clientId === 'all' ? 'Triggered all Airo Units' : 'Triggered selected Airo Unit');
  };

  const sendDemoMode = async (clientId: string) => {
    const targetClientId = clientId === 'all' ? (devices[0]?.clientId || 'all') : clientId;
    const response = await fetch('/backend/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: targetClientId,
        type: 'demo_mode',
        action: 'demo_mode',
        payload: {},
      }),
    });
    if (!response.ok) {
      throw new Error(`Demo trigger failed: ${response.status}`);
    }
    setStatus(targetClientId === 'all' ? 'Triggered demo mode on all Airo Units' : 'Triggered demo mode on selected Airo Unit');
  };

  useEffect(() => {
    void refreshDevices();
    void refreshLogs();
    const interval = window.setInterval(() => {
      void refreshDevices();
      void refreshLogs();
    }, 1200);
    return () => {
      window.clearInterval(interval);
    };
  }, [selectedClientId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      void sendVoiceMode(selectedClientId, prompt).catch((error) => {
        console.error(error);
        setStatus('Failed to trigger voice mode');
      });
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [prompt, selectedClientId]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.clientId === selectedClientId) || null,
    [devices, selectedClientId]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-cyan-300/70">Airo Backend</div>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Demo Control</h1>
            <p className="mt-3 max-w-3xl text-sm text-white/65">
              Watch every Airo Unit connected to this laptop, fire voice mode remotely with the space bar,
              and aim a prompt at one unit or all of them.
            </p>
          </div>
          <a
            href="/"
            className="inline-flex w-fit rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-sm uppercase tracking-[0.18em] text-white/75 transition hover:bg-white/10"
          >
            Back To Airo
          </a>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-xs uppercase tracking-[0.3em] text-white/45">Connected Units</div>
                <div className="mt-2 text-lg font-semibold">{devices.length} online</div>
              </div>
              <button
                onClick={() => void refreshDevices()}
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/15"
              >
                Refresh
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {devices.map((device) => {
                const selected = device.clientId === selectedClientId;
                return (
                  <button
                    key={device.clientId}
                    onClick={() => setSelectedClientId(device.clientId)}
                    className={`rounded-[28px] border p-5 text-left transition ${
                      selected
                        ? 'border-cyan-300/60 bg-cyan-400/12 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]'
                        : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">{device.label}</div>
                        <div className="mt-1 font-mono text-xs uppercase tracking-[0.22em] text-white/45">{device.connectionState}</div>
                      </div>
                      <div className={`h-3 w-3 rounded-full ${Date.now() - device.updatedAt < 6000 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    </div>
                    <div className="mt-4 text-sm text-white/70">{device.statusText || 'Standing by'}</div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-white/45">
                      <span>{device.ollieConnected ? 'Dock Linked' : 'Dock Offline'}</span>
                      <span>{device.movementEnabled ? 'Movement On' : 'Movement Off'}</span>
                      <span>{device.assistantMuted ? 'Muted' : 'Hot Mic'}</span>
                      <span>Camera {device.cameraState}</span>
                    </div>
                  </button>
                );
              })}

              {!devices.length && (
                <div className="rounded-[28px] border border-dashed border-white/15 bg-slate-900/60 p-8 text-sm text-white/55">
                  No Airo Units are reporting in yet. Open the robot UI first.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-cyan-500/12 via-slate-900 to-slate-950 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-300/65">Quick Trigger</div>
            <div className="mt-3 text-2xl font-black">Space = Voice Mode</div>
            <p className="mt-3 text-sm text-white/70">
              Hit the space bar anywhere on this page to wake the selected Airo Unit instantly. Add a prompt below if you want a scripted demo opener.
            </p>

            <label className="mt-5 block text-sm font-semibold text-white/80">Target</label>
            <select
              value={selectedClientId}
              onChange={(event) => setSelectedClientId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/12 bg-slate-900 px-4 py-3 text-white outline-none"
            >
              <option value="all">All Airo Units</option>
              {devices.map((device) => (
                <option key={device.clientId} value={device.clientId}>
                  {device.label}
                </option>
              ))}
            </select>

            <label className="mt-5 block text-sm font-semibold text-white/80">Optional Prompt</label>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Example: Tell the audience what you can do."
              className="mt-2 min-h-[120px] w-full rounded-[24px] border border-white/12 bg-slate-900 px-4 py-4 text-white outline-none"
            />

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => void sendVoiceMode(selectedClientId, prompt).catch(() => setStatus('Failed to trigger voice mode'))}
                className="flex-1 rounded-full bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-300"
              >
                Trigger Now
              </button>
              <button
                onClick={() => void sendDemoMode(selectedClientId).catch(() => setStatus('Failed to trigger demo mode'))}
                className="rounded-full bg-fuchsia-400 px-5 py-3 font-black text-slate-950 transition hover:bg-fuchsia-300"
              >
                Demo Mode
              </button>
              <button
                onClick={() => setPrompt('')}
                className="rounded-full border border-white/12 bg-white/5 px-5 py-3 font-semibold text-white/80 transition hover:bg-white/10"
              >
                Clear
              </button>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="font-mono text-xs uppercase tracking-[0.24em] text-white/45">Status</div>
              <div className="mt-2 text-lg font-semibold">{status}</div>
              {selectedDevice && (
                <div className="mt-3 text-sm text-white/65">
                  {selectedDevice.label} is {selectedDevice.connectionState.toLowerCase()} and currently says:
                  {' '}
                  {selectedDevice.statusText || 'Standing by'}.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.3em] text-white/45">Live Vision</div>
              <div className="mt-2 text-lg font-semibold">
                {selectedDevice ? `${selectedDevice.label} camera feed` : 'Select a unit'}
              </div>
            </div>
            <div className="text-sm text-white/45">
              {selectedDevice ? `${selectedDevice.cameraState} / ${selectedDevice.cameraMode || 'unknown'} / ${selectedDevice.opencvState || 'unknown'}` : 'No device selected'}
            </div>
          </div>

          {selectedDevice ? (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-4 md:grid-cols-2">
                {([
                  {
                    key: 'front',
                    label: 'Front Camera',
                    image: selectedDevice.frontPreview,
                    target: selectedDevice.visionTarget,
                  },
                  {
                    key: 'rear',
                    label: 'Rear Camera',
                    image: selectedDevice.rearPreview,
                    target: selectedDevice.rearTarget,
                  },
                ] as const).map((camera) => (
                  <div key={camera.key} className="rounded-[28px] border border-white/10 bg-slate-950/75 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs uppercase tracking-[0.22em] text-white/45">{camera.label}</div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/70">
                        {camera.target?.kind ? `${camera.target.kind} tracked` : 'No target'}
                      </div>
                    </div>
                    <div className="mt-3 aspect-video overflow-hidden rounded-[20px] border border-white/10 bg-black">
                      {camera.image ? (
                        <img src={camera.image} alt={camera.label} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs font-mono uppercase tracking-[0.22em] text-white/30">
                          Waiting for preview
                        </div>
                      )}
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-white/60">
                      <div>Target: {camera.target?.kind || 'none'} {camera.target?.source ? `on ${camera.target.source}` : ''}</div>
                      <div>Offset: {typeof camera.target?.x === 'number' ? `${camera.target.x.toFixed(2)}, ${Number(camera.target?.y || 0).toFixed(2)}` : 'n/a'}</div>
                      <div>Strength: {typeof camera.target?.strength === 'number' ? camera.target.strength.toFixed(2) : 'n/a'}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[28px] border border-white/10 bg-slate-950/75 p-5">
                <div className="font-mono text-xs uppercase tracking-[0.22em] text-white/45">Recognition</div>
                <div className="mt-4 text-2xl font-black">
                  {selectedDevice.recognizedFamilyName || 'Unknown person'}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {selectedDevice.recognizedFamilyNotes || 'No saved identity notes'}
                </div>
                <div className="mt-5 grid gap-3 text-sm text-white/70">
                  <div>
                    <span className="text-white/45">Status:</span> {selectedDevice.statusText || 'Standing by'}
                  </div>
                  <div>
                    <span className="text-white/45">Front detection:</span> {selectedDevice.visionTarget?.kind || 'none'}
                  </div>
                  <div>
                    <span className="text-white/45">Rear detection:</span> {selectedDevice.rearTarget?.kind || 'none'}
                  </div>
                  <div>
                    <span className="text-white/45">Last update:</span> {new Date(selectedDevice.updatedAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-white/15 bg-slate-900/60 p-8 text-sm text-white/55">
              Pick an Airo Unit above to inspect live camera previews and recognition status.
            </div>
          )}
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.3em] text-white/45">Skill Logs</div>
              <div className="mt-2 text-lg font-semibold">{logs.length} recent events</div>
            </div>
            <button
              onClick={() => void refreshLogs()}
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/15"
            >
              Refresh Logs
            </button>
          </div>

          <div className="max-h-[42vh] overflow-y-auto rounded-[24px] border border-white/10 bg-slate-950/80">
            {logs.length ? (
              <div className="divide-y divide-white/6">
                {logs.map((entry) => (
                  <div key={entry.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em]">
                      <span className={`${entry.level === 'error' ? 'text-red-300' : entry.level === 'warn' ? 'text-amber-300' : 'text-cyan-300'}`}>
                        {entry.level}
                      </span>
                      <span className="text-white/35">{entry.scope}</span>
                      {entry.clientId && <span className="text-white/35">{entry.clientId}</span>}
                      <span className="text-white/25">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">{entry.message}</div>
                    {entry.detail ? <div className="mt-1 text-sm text-white/55">{entry.detail}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm text-white/45">No skill logs yet. Run a skill to see step-by-step activity and errors here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount backend page');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BackendPage />
  </React.StrictMode>
);
