export type AirSkillPrimitive = string | number | boolean | null;

export type AirSkillValue =
  | AirSkillPrimitive
  | { var: string }
  | { random: AirSkillPrimitive[] };

export type AirSkillStep =
  | { action: 'say'; text: AirSkillValue }
  | { action: 'say_random'; lines: string[] }
  | { action: 'set_status'; text: AirSkillValue }
  | { action: 'display_text'; title?: AirSkillValue; body?: AirSkillValue }
  | { action: 'display_image'; url: AirSkillValue; caption?: AirSkillValue }
  | { action: 'show_ui_card'; title?: AirSkillValue; subtitle?: AirSkillValue; body?: AirSkillValue; theme?: AirSkillValue; imageUrl?: AirSkillValue; chipsJson?: AirSkillValue; durationMs?: AirSkillValue }
  | { action: 'set_eyes'; preset: AirSkillValue; durationMs?: AirSkillValue }
  | { action: 'set_lights'; red?: AirSkillValue; green?: AirSkillValue; blue?: AirSkillValue; durationMs?: AirSkillValue }
  | { action: 'move'; direction?: AirSkillValue; intensity?: AirSkillValue }
  | { action: 'move_timed'; direction?: AirSkillValue; intensity?: AirSkillValue; durationMs?: AirSkillValue }
  | { action: 'turn_waypoint'; direction: AirSkillValue }
  | { action: 'rotate_robot'; degrees: AirSkillValue }
  | { action: 'face_person' }
  | { action: 'stop_robot' }
  | { action: 'take_photo'; saveAs?: string }
  | { action: 'save_image_to_gallery'; image: AirSkillValue; source?: AirSkillValue; saveAs?: string; onlyIfTrueVar?: string }
  | { action: 'recognize_face'; target?: AirSkillValue; saveAs?: string }
  | { action: 'show_timer_widget'; durationSeconds?: AirSkillValue; title?: AirSkillValue }
  | { action: 'show_number_widget'; value: AirSkillValue; title?: AirSkillValue; subtitle?: AirSkillValue; durationMs?: AirSkillValue }
  | {
      action: 'show_confirmation_widget';
      title?: AirSkillValue;
      subtitle?: AirSkillValue;
      confirmText?: AirSkillValue;
      cancelText?: AirSkillValue;
      durationMs?: AirSkillValue;
      saveAs?: string;
    }
  | { action: 'show_settings_widget'; title?: AirSkillValue; optionsJson?: AirSkillValue; durationMs?: AirSkillValue }
  | { action: 'listen_voice_command'; saveAs?: string; timeoutMs?: AirSkillValue; interim?: AirSkillValue }
  | { action: 'play_sound'; sound?: AirSkillValue; volume?: AirSkillValue; saveAs?: string }
  | { action: 'play_tone'; tone?: AirSkillValue; frequencyHz?: AirSkillValue; durationMs?: AirSkillValue; volume?: AirSkillValue; waveform?: AirSkillValue }
  | { action: 'run_javascript'; code: AirSkillValue; saveAs?: string }
  | { action: 'get_intent_input'; saveAs?: string }
  | { action: 'get_intent_text'; saveAs?: string }
  | { action: 'get_current_location'; saveAs?: string }
  | { action: 'json_get_value'; source: AirSkillValue; key: AirSkillValue; saveAs?: string }
  | { action: 'json_get_keys'; source: AirSkillValue; saveAs?: string }
  | { action: 'json_get_values'; source: AirSkillValue; saveAs?: string }
  | { action: 'run_eyes'; animationId: AirSkillValue; durationMs?: AirSkillValue; continueExecution?: AirSkillValue }
  | { action: 'call_function'; name: AirSkillValue; payloadJson?: AirSkillValue }
  | {
      action: 'web_request';
      url: AirSkillValue;
      method?: AirSkillValue;
      headersJson?: AirSkillValue;
      body?: AirSkillValue;
      timeoutMs?: AirSkillValue;
      responseType?: AirSkillValue;
      saveAs?: string;
    }
  | { action: 'set_var'; name: string; value: AirSkillValue }
  | { action: 'choose_random'; name: string; values: AirSkillPrimitive[] }
  | { action: 'wait'; durationMs: AirSkillValue };

export type AirSkillScript = {
  language: 'airscript-1';
  entry: AirSkillStep[];
};

export type AirSkillExecutionRuntime = {
  say: (text: string) => Promise<unknown> | unknown;
  setStatusText: (text: string) => Promise<unknown> | unknown;
  displayText: (payload: { title?: string; body?: string }) => Promise<unknown> | unknown;
  displayImage: (payload: { url?: string; caption?: string }) => Promise<unknown> | unknown;
  showUiCard: (payload: { title?: string; subtitle?: string; body?: string; theme?: string; imageUrl?: string; chips?: string[]; durationMs?: number }) => Promise<unknown> | unknown;
  setEyesPreset: (preset: string, durationMs?: number) => Promise<unknown> | unknown;
  setDockLights: (payload: { red?: number; green?: number; blue?: number; durationMs?: number }) => Promise<unknown> | unknown;
  moveRobot: (payload: { direction?: string; intensity?: number }) => Promise<unknown> | unknown;
  moveRobotTimed: (payload: { direction?: string; intensity?: number; durationMs?: number }) => Promise<unknown> | unknown;
  turnWaypoint: (direction: string) => Promise<unknown> | unknown;
  rotateRobotDegrees: (degrees: number) => Promise<unknown> | unknown;
  facePerson: () => Promise<unknown> | unknown;
  stopRobot: () => Promise<unknown> | unknown;
  takePhoto: () => Promise<unknown> | unknown;
  saveImageToGallery: (payload: { image: string; source?: 'front' | 'rear' }) => Promise<unknown> | unknown;
  recognizeFace: (target: string) => Promise<unknown> | unknown;
  showTimerWidget: (payload: { durationSeconds?: number; title?: string }) => Promise<unknown> | unknown;
  showNumberWidget: (payload: { value: string | number; title?: string; subtitle?: string; durationMs?: number }) => Promise<unknown> | unknown;
  showConfirmationWidget: (payload: { title?: string; subtitle?: string; confirmText?: string; cancelText?: string; durationMs?: number }) => Promise<unknown> | unknown;
  showSettingsWidget: (payload: { title?: string; options?: Array<{ id: string; label: string; icon: string }>; durationMs?: number }) => Promise<unknown> | unknown;
  listenVoiceCommand: (payload: { timeoutMs?: number; interim?: boolean }) => Promise<unknown> | unknown;
  playSound: (payload: { sound?: string; volume?: number }) => Promise<unknown> | unknown;
  playTone: (payload: { tone?: string; frequencyHz?: number; durationMs?: number; volume?: number; waveform?: string }) => Promise<unknown> | unknown;
  runJavascript: (payload: { code: string; vars: Record<string, unknown> }) => Promise<unknown> | unknown;
  getIntentInput: () => Promise<unknown> | unknown;
  getIntentText: () => Promise<unknown> | unknown;
  getCurrentLocation: () => Promise<unknown> | unknown;
  jsonGetValue: (payload: { source: unknown; key: string }) => Promise<unknown> | unknown;
  jsonGetKeys: (payload: { source: unknown }) => Promise<unknown> | unknown;
  jsonGetValues: (payload: { source: unknown }) => Promise<unknown> | unknown;
  runEyes: (payload: { animationId: string; durationMs?: number; continueExecution?: boolean }) => Promise<unknown> | unknown;
  callFunction: (name: string, payload: unknown) => Promise<unknown> | unknown;
  webRequest: (payload: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    responseType?: string;
  }) => Promise<unknown> | unknown;
  wait: (durationMs: number) => Promise<unknown> | unknown;
};

type ExecutionState = {
  vars: Record<string, unknown>;
};

const pickRandom = <T,>(values: T[]): T | undefined => {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  return values[Math.floor(Math.random() * values.length)];
};

const resolveValue = (value: AirSkillValue | undefined, state: ExecutionState): unknown => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'object') {
    if ('var' in value) {
      return state.vars[String(value.var || '')];
    }
    if ('random' in value) {
      return pickRandom(Array.isArray(value.random) ? value.random : []);
    }
  }
  return value;
};

const asString = (value: unknown, fallback = ''): string => {
  if (value == null) return fallback;
  return String(value);
};

const asNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseOptionsJson = (raw: unknown) => {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseStringArray = (raw: unknown) => {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
};

const parsePayloadJson = (raw: unknown) => {
  if (raw == null) return {};
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
};

export const normalizeAirSkillScript = (input: unknown): AirSkillScript | null => {
  if (!input || typeof input !== 'object') return null;
  const script = input as Partial<AirSkillScript>;
  if (script.language !== 'airscript-1' || !Array.isArray(script.entry)) return null;
  return {
    language: 'airscript-1',
    entry: script.entry.filter((step) => step && typeof step === 'object') as AirSkillStep[],
  };
};

export const executeAirSkillScript = async (
  scriptInput: unknown,
  runtime: AirSkillExecutionRuntime
) => {
  const script = normalizeAirSkillScript(scriptInput);
  if (!script) {
    throw new Error('Invalid AirSkill script');
  }

  const state: ExecutionState = { vars: {} };

  for (const step of script.entry) {
    switch (step.action) {
      case 'say':
        await runtime.say(asString(resolveValue(step.text, state)));
        break;
      case 'say_random':
        await runtime.say(asString(pickRandom(step.lines) || ''));
        break;
      case 'set_status':
        await runtime.setStatusText(asString(resolveValue(step.text, state)));
        break;
      case 'display_text':
        await runtime.displayText({
          title: asString(resolveValue(step.title, state)),
          body: asString(resolveValue(step.body, state)),
        });
        break;
      case 'display_image':
        await runtime.displayImage({
          url: asString(resolveValue(step.url, state)),
          caption: asString(resolveValue(step.caption, state)),
        });
        break;
      case 'show_ui_card':
        await runtime.showUiCard({
          title: asString(resolveValue(step.title, state), 'Airo'),
          subtitle: asString(resolveValue(step.subtitle, state)),
          body: asString(resolveValue(step.body, state)),
          theme: asString(resolveValue(step.theme, state), 'info'),
          imageUrl: asString(resolveValue(step.imageUrl, state)),
          chips: parseStringArray(resolveValue(step.chipsJson, state)),
          durationMs: asNumber(resolveValue(step.durationMs, state), 0) || undefined,
        });
        break;
      case 'set_eyes':
        await runtime.setEyesPreset(
          asString(resolveValue(step.preset, state), 'idle'),
          asNumber(resolveValue(step.durationMs, state), 0) || undefined
        );
        break;
      case 'set_lights':
        await runtime.setDockLights({
          red: asNumber(resolveValue(step.red, state), 0),
          green: asNumber(resolveValue(step.green, state), 0),
          blue: asNumber(resolveValue(step.blue, state), 0),
          durationMs: asNumber(resolveValue(step.durationMs, state), 0) || undefined,
        });
        break;
      case 'move':
        await runtime.moveRobot({
          direction: asString(resolveValue(step.direction, state), 'front'),
          intensity: asNumber(resolveValue(step.intensity, state), 0.55),
        });
        break;
      case 'move_timed':
        await runtime.moveRobotTimed({
          direction: asString(resolveValue(step.direction, state), 'front'),
          intensity: asNumber(resolveValue(step.intensity, state), 0.75),
          durationMs: asNumber(resolveValue(step.durationMs, state), 650),
        });
        break;
      case 'turn_waypoint':
        await runtime.turnWaypoint(asString(resolveValue(step.direction, state), 'front'));
        break;
      case 'rotate_robot':
        await runtime.rotateRobotDegrees(asNumber(resolveValue(step.degrees, state), 90));
        break;
      case 'face_person':
        await runtime.facePerson();
        break;
      case 'stop_robot':
        await runtime.stopRobot();
        break;
      case 'take_photo': {
        const result = await runtime.takePhoto();
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'save_image_to_gallery': {
        if (step.onlyIfTrueVar && state.vars[step.onlyIfTrueVar] !== true) {
          if (step.saveAs) {
            state.vars[step.saveAs] = '';
          }
          break;
        }
        const image = asString(resolveValue(step.image, state));
        const source = asString(resolveValue(step.source, state), 'front');
        const result = await runtime.saveImageToGallery({
          image,
          source: source === 'rear' ? 'rear' : 'front',
        });
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'recognize_face': {
        const result = await runtime.recognizeFace(asString(resolveValue(step.target, state), 'family'));
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'show_timer_widget':
        await runtime.showTimerWidget({
          durationSeconds: asNumber(resolveValue(step.durationSeconds, state), 60),
          title: asString(resolveValue(step.title, state), 'TIMER'),
        });
        break;
      case 'show_number_widget':
        await runtime.showNumberWidget({
          value: (resolveValue(step.value, state) as string | number) ?? '',
          title: asString(resolveValue(step.title, state), 'NUMBER'),
          subtitle: asString(resolveValue(step.subtitle, state)),
          durationMs: asNumber(resolveValue(step.durationMs, state), 0) || undefined,
        });
        break;
      case 'show_confirmation_widget':
        {
          const result = await runtime.showConfirmationWidget({
          title: asString(resolveValue(step.title, state), 'CONFIRM'),
          subtitle: asString(resolveValue(step.subtitle, state)),
          confirmText: asString(resolveValue(step.confirmText, state), 'Yes'),
          cancelText: asString(resolveValue(step.cancelText, state), 'No'),
          durationMs: asNumber(resolveValue(step.durationMs, state), 0) || undefined,
        });
          if (step.saveAs) {
            state.vars[step.saveAs] = result === true;
          }
        }
        break;
      case 'show_settings_widget':
        await runtime.showSettingsWidget({
          title: asString(resolveValue(step.title, state), 'SETTINGS'),
          options: parseOptionsJson(resolveValue(step.optionsJson, state)) as Array<{ id: string; label: string; icon: string }>,
          durationMs: asNumber(resolveValue(step.durationMs, state), 0) || undefined,
        });
        break;
      case 'listen_voice_command': {
        const result = await runtime.listenVoiceCommand({
          timeoutMs: asNumber(resolveValue(step.timeoutMs, state), 0) || undefined,
          interim: Boolean(resolveValue(step.interim, state)),
        });
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'play_sound': {
        const result = await runtime.playSound({
          sound: asString(resolveValue(step.sound, state), ''),
          volume: asNumber(resolveValue(step.volume, state), 0) || undefined,
        });
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'play_tone':
        await runtime.playTone({
          tone: asString(resolveValue(step.tone, state), 'confirm'),
          frequencyHz: asNumber(resolveValue(step.frequencyHz, state), 0) || undefined,
          durationMs: asNumber(resolveValue(step.durationMs, state), 0) || undefined,
          volume: asNumber(resolveValue(step.volume, state), 0) || undefined,
          waveform: asString(resolveValue(step.waveform, state), 'sine'),
        });
        break;
      case 'run_javascript': {
        const result = await runtime.runJavascript({
          code: asString(resolveValue(step.code, state)),
          vars: { ...state.vars },
        });
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'get_intent_input': {
        const result = await runtime.getIntentInput();
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'get_intent_text': {
        const result = await runtime.getIntentText();
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'get_current_location': {
        const result = await runtime.getCurrentLocation();
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'json_get_value': {
        const result = await runtime.jsonGetValue({
          source: resolveValue(step.source, state),
          key: asString(resolveValue(step.key, state)),
        });
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'json_get_keys': {
        const result = await runtime.jsonGetKeys({
          source: resolveValue(step.source, state),
        });
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'json_get_values': {
        const result = await runtime.jsonGetValues({
          source: resolveValue(step.source, state),
        });
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'run_eyes':
        await runtime.runEyes({
          animationId: asString(resolveValue(step.animationId, state)),
          durationMs: asNumber(resolveValue(step.durationMs, state), 0) || undefined,
          continueExecution: Boolean(resolveValue(step.continueExecution, state)),
        });
        break;
      case 'call_function':
        await runtime.callFunction(
          asString(resolveValue(step.name, state)),
          parsePayloadJson(resolveValue(step.payloadJson, state))
        );
        break;
      case 'web_request': {
        const rawHeaders = parsePayloadJson(resolveValue(step.headersJson, state));
        const headers: Record<string, string> = {};
        if (rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)) {
          for (const [key, value] of Object.entries(rawHeaders as Record<string, unknown>)) {
            headers[String(key)] = String(value ?? '');
          }
        }
        const result = await runtime.webRequest({
          url: asString(resolveValue(step.url, state)),
          method: asString(resolveValue(step.method, state), 'GET'),
          headers,
          body: asString(resolveValue(step.body, state)),
          timeoutMs: asNumber(resolveValue(step.timeoutMs, state), 12000),
          responseType: asString(resolveValue(step.responseType, state), 'json'),
        });
        if (step.saveAs) {
          state.vars[step.saveAs] = result;
        }
        break;
      }
      case 'set_var':
        state.vars[step.name] = resolveValue(step.value, state);
        break;
      case 'choose_random':
        state.vars[step.name] = pickRandom(step.values);
        break;
      case 'wait':
        await runtime.wait(asNumber(resolveValue(step.durationMs, state), 300));
        break;
      default:
        break;
    }
  }

  return state.vars;
};
