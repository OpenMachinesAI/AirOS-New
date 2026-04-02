import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AiroSkillsBuilder, createAirSkillPackageFromDraft, createDefaultSkillDraft, type AirSkillDraft } from './components/AiroSkillsBuilder';
import { BUILDER_SKILL_STORAGE_KEY, skillPackageToInstalledSkill } from './skills/skillStore';

const STORAGE_KEY = 'airo.skillDraft';

type BackendDevice = {
  clientId: string;
  label: string;
};

const SkillsPage = () => {
  const [draft, setDraft] = useState<AirSkillDraft>(createDefaultSkillDraft());
  const [livePackage, setLivePackage] = useState<ReturnType<typeof createAirSkillPackageFromDraft> | null>(null);
  const [devices, setDevices] = useState<BackendDevice[]>([]);
  const [targetClientId, setTargetClientId] = useState<string>('all');
  const [runState, setRunState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const uploadSkillToStore = async (pkg: ReturnType<typeof createAirSkillPackageFromDraft>) => {
    const response = await fetch('/skill-store/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pkg),
    });
    if (!response.ok) {
      throw new Error(`Skill store upload failed: ${response.status}`);
    }
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        setDraft({
          ...createDefaultSkillDraft(),
          ...parsed,
          eyeAnimations: Array.isArray((parsed as any).eyeAnimations) ? (parsed as any).eyeAnimations : [],
        });
      }
    } catch (error) {
      console.warn('Failed to restore skill draft', error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      const pkg = createAirSkillPackageFromDraft(draft);
      const builderSkill = skillPackageToInstalledSkill(pkg, {
        source: 'builder',
        emoji: '🛠️',
        color: '#22c55e',
        author: 'Builder Draft',
      });
      window.localStorage.setItem(BUILDER_SKILL_STORAGE_KEY, JSON.stringify(builderSkill));
    } catch (error) {
      console.warn('Failed to persist skill draft or builder store entry', error);
    }
  }, [draft]);

  useEffect(() => {
    const refreshDevices = async () => {
      try {
        const response = await fetch('/backend/api/devices', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const next = Array.isArray(payload?.devices) ? payload.devices : [];
        setDevices(next.map((device: any) => ({
          clientId: String(device?.clientId || ''),
          label: String(device?.label || 'Airo Unit'),
        })).filter((device: BackendDevice) => Boolean(device.clientId)));
      } catch {
        setDevices([]);
      }
    };
    void refreshDevices();
    const interval = window.setInterval(() => {
      void refreshDevices();
    }, 1800);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const runDraftOnRobot = async () => {
    try {
      setRunState('sending');
      const pkg = livePackage || createAirSkillPackageFromDraft(draft);
      const response = await fetch('/backend/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: targetClientId || 'all',
          type: 'run_skill_package',
          package: pkg,
        }),
      });
      if (!response.ok) {
        throw new Error(`Run trigger failed: ${response.status}`);
      }
      setRunState('sent');
      window.setTimeout(() => setRunState('idle'), 2200);
    } catch (error) {
      console.error('Failed to run draft on robot', error);
      setRunState('error');
      window.setTimeout(() => setRunState('idle'), 2400);
    }
  };

  return (
    <div className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/45">Desktop Builder</div>
            <h1 className="mt-3 font-sans text-4xl font-black tracking-tight text-white sm:text-5xl">Airo Skills</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60 sm:text-base">
              Build AirOS skill packages on desktop with reusable action blocks for xAI, screen output, robot motion,
              photos, face recognition, and custom function calls.
            </p>
          </div>
          <a
            href="/"
            className="inline-flex w-fit rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-sm uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/10"
          >
            Back To Airo
          </a>
        </div>
        <div className="mb-6 rounded-[1.6rem] border border-white/12 bg-white/5 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.3em] text-white/55">Run On Robot</div>
              <div className="mt-2 text-sm text-white/65">
                Sends your current draft package to a connected Airo Unit through the app backend and runs it immediately.
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Target</div>
                <select
                  value={targetClientId}
                  onChange={(event) => setTargetClientId(event.target.value)}
                  className="rounded-2xl border border-white/12 bg-slate-900 px-4 py-3 font-mono text-sm text-white outline-none"
                >
                  <option value="all">All connected Airo Units</option>
                  {devices.map((device) => (
                    <option key={device.clientId} value={device.clientId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => { void runDraftOnRobot(); }}
                className="rounded-full bg-cyan-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black shadow-[0_20px_40px_rgba(34,211,238,0.24)]"
              >
                {runState === 'sending' ? 'Sending...' : runState === 'sent' ? 'Sent' : runState === 'error' ? 'Run Failed' : 'Run On Robot'}
              </button>
            </div>
          </div>
        </div>
        <AiroSkillsBuilder
          draft={draft}
          onChange={setDraft}
          onUploadToStore={uploadSkillToStore}
          onLivePackageChange={setLivePackage}
        />
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount skills page');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SkillsPage />
  </React.StrictMode>
);
