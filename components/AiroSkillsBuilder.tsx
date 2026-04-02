import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';
import type { AirSkillScript, AirSkillStep, AirSkillValue } from '../skills/airSkillScript';

export type EyeMorphFrame = {
  at: number;
  left: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    roundness: number;
    rotateDeg: number;
    fillMode?: 'color' | 'gradient' | 'media';
    gradientFrom?: string;
    gradientTo?: string;
    mediaUrl?: string;
    shape?: {
      points: Array<{
        x: number;
        y: number;
        inX: number;
        inY: number;
        outX: number;
        outY: number;
      }>;
    };
  };
  right: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    roundness: number;
    rotateDeg: number;
    fillMode?: 'color' | 'gradient' | 'media';
    gradientFrom?: string;
    gradientTo?: string;
    mediaUrl?: string;
    shape?: {
      points: Array<{
        x: number;
        y: number;
        inX: number;
        inY: number;
        outX: number;
        outY: number;
      }>;
    };
  };
};

export type EyeAnimationDefinition = {
  id: string;
  name: string;
  durationMs: number;
  loop: boolean;
  keyframes: EyeMorphFrame[];
};

export type IntentVariableDefinition = {
  name: string;
  required: boolean;
  description: string;
};

export type AirSkillDraft = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  workspaceState: Blockly.serialization.workspaces.State | null;
  eyeAnimations: EyeAnimationDefinition[];
  intentVariables: IntentVariableDefinition[];
  importedScript?: AirSkillScript | null;
  importedGeneratedCode?: string;
};

export const createDefaultSkillDraft = (): AirSkillDraft => ({
  id: `skill-${Date.now()}`,
  name: 'My First Airo Skill',
  description: 'A custom AirOS block skill.',
  trigger: 'voice',
  workspaceState: null,
  eyeAnimations: [],
  intentVariables: [],
  importedScript: null,
  importedGeneratedCode: '',
});

const workspaceContainerClass =
  'h-[68vh] min-h-[520px] w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#101214] shadow-[0_30px_100px_rgba(0,0,0,0.45)]';

const inputClassName =
  'w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder:text-white/25 outline-none transition focus:border-white/25 focus:bg-white/10';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createDefaultEyeShape = () => ({
  points: [
    { x: 0.5, y: 0.08, inX: -0.22, inY: 0, outX: 0.22, outY: 0 },
    { x: 0.92, y: 0.5, inX: 0, inY: -0.22, outX: 0, outY: 0.22 },
    { x: 0.5, y: 0.92, inX: 0.22, inY: 0, outX: -0.22, outY: 0 },
    { x: 0.08, y: 0.5, inX: 0, inY: 0.22, outX: 0, outY: -0.22 },
  ],
});

const eyeToPathD = (eye: EyeMorphFrame['left']) => {
  const points = eye.shape?.points;
  if (!Array.isArray(points) || points.length < 2) return '';
  const toAbs = (point: { x: number; y: number }) => ({
    x: point.x * eye.width,
    y: point.y * eye.height,
  });
  const first = toAbs(points[0]);
  const segments: string[] = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const c1 = {
      x: (current.x + current.outX) * eye.width,
      y: (current.y + current.outY) * eye.height,
    };
    const c2 = {
      x: (next.x + next.inX) * eye.width,
      y: (next.y + next.inY) * eye.height,
    };
    const p2 = toAbs(next);
    segments.push(
      `C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
    );
  }
  segments.push('Z');
  return segments.join(' ');
};

const createDefaultEyeAnimation = (): EyeAnimationDefinition => ({
  id: 'blink-soft',
  name: 'Blink Soft',
  durationMs: 1200,
  loop: true,
  keyframes: [
    {
      at: 0,
      left: { x: 35, y: 55, width: 150, height: 150, color: '#ffffff', roundness: 999, rotateDeg: 0, fillMode: 'color', gradientFrom: '#ffffff', gradientTo: '#94d8ff', mediaUrl: '', shape: createDefaultEyeShape() },
      right: { x: 65, y: 55, width: 150, height: 150, color: '#ffffff', roundness: 999, rotateDeg: 0, fillMode: 'color', gradientFrom: '#ffffff', gradientTo: '#ffffff', mediaUrl: '', shape: createDefaultEyeShape() },
    },
    {
      at: 0.5,
      left: { x: 35, y: 55, width: 150, height: 42, color: '#ffffff', roundness: 20, rotateDeg: 0, fillMode: 'color', gradientFrom: '#ffffff', gradientTo: '#ffffff', mediaUrl: '', shape: createDefaultEyeShape() },
      right: { x: 65, y: 55, width: 150, height: 42, color: '#ffffff', roundness: 20, rotateDeg: 0, fillMode: 'color', gradientFrom: '#ffffff', gradientTo: '#ffffff', mediaUrl: '', shape: createDefaultEyeShape() },
    },
    {
      at: 1,
      left: { x: 35, y: 55, width: 150, height: 150, color: '#ffffff', roundness: 999, rotateDeg: 0, fillMode: 'color', gradientFrom: '#ffffff', gradientTo: '#ffffff', mediaUrl: '', shape: createDefaultEyeShape() },
      right: { x: 65, y: 55, width: 150, height: 150, color: '#ffffff', roundness: 999, rotateDeg: 0, fillMode: 'color', gradientFrom: '#ffffff', gradientTo: '#ffffff', mediaUrl: '', shape: createDefaultEyeShape() },
    },
  ],
});

const blockDefinitions = [
  {
    type: 'airo_skill_start',
    message0: 'when Airo skill runs',
    nextStatement: null,
    colour: 20,
    tooltip: 'Start block for an Airo skill.',
  },
  {
    type: 'airo_xai_say',
    message0: 'say with xAI voice %1',
    args0: [{ type: 'input_value', name: 'TEXT', check: ['String', 'Number'] }],
    previousStatement: null,
    nextStatement: null,
    colour: 300,
    tooltip: 'Speak text using the xAI voice system.',
  },
  {
    type: 'airo_say_random',
    message0: 'say random lines json %1',
    args0: [{ type: 'input_value', name: 'LINES', check: 'String' }],
    previousStatement: null,
    nextStatement: null,
    colour: 300,
    tooltip: 'Pick a random line from a JSON string array and speak it.',
  },
  {
    type: 'airo_xai_prompt',
    message0: 'ask xAI %1 save answer in %2',
    args0: [
      { type: 'input_value', name: 'PROMPT', check: 'String' },
      { type: 'field_variable', name: 'VARIABLE', variable: 'xaiReply' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
    tooltip: 'Send a prompt to xAI and store the answer in a variable.',
  },
  {
    type: 'airo_display_text',
    message0: 'display title %1 body %2',
    args0: [
      { type: 'input_value', name: 'TITLE', check: 'String' },
      { type: 'input_value', name: 'BODY', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 170,
    tooltip: 'Display text on Airo’s screen.',
  },
  {
    type: 'airo_set_status_text',
    message0: 'set status text %1',
    args0: [{ type: 'input_value', name: 'TEXT', check: 'String' }],
    previousStatement: null,
    nextStatement: null,
    colour: 165,
    tooltip: 'Set the small robot status text.',
  },
  {
    type: 'airo_display_image',
    message0: 'display image url %1 caption %2',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'input_value', name: 'CAPTION', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 330,
    tooltip: 'Display an image on Airo’s screen.',
  },
  {
    type: 'airo_show_ui_card',
    message0: 'show Airo card title %1 subtitle %2 body %3 theme %4 image url %5 chips json %6 auto close after %7 ms',
    args0: [
      { type: 'input_value', name: 'TITLE', check: 'String' },
      { type: 'input_value', name: 'SUBTITLE', check: 'String' },
      { type: 'input_value', name: 'BODY', check: 'String' },
      {
        type: 'field_dropdown',
        name: 'THEME',
        options: [
          ['info', 'info'],
          ['success', 'success'],
          ['warning', 'warning'],
          ['danger', 'danger'],
          ['photo', 'photo'],
        ],
      },
      { type: 'input_value', name: 'IMAGE_URL', check: 'String' },
      { type: 'input_value', name: 'CHIPS_JSON', check: 'String' },
      { type: 'input_value', name: 'DURATION_MS', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 200,
    tooltip: 'Show a native full-screen Airo style card.',
  },
  {
    type: 'airo_set_eyes_preset',
    message0: 'set eyes %1 for %2 ms',
    args0: [
      {
        type: 'field_dropdown',
        name: 'PRESET',
        options: [
          ['idle', 'idle'],
          ['connecting', 'connecting'],
          ['listening', 'listening'],
          ['speaking', 'speaking'],
          ['thinking', 'thinking'],
          ['muted', 'muted'],
        ],
      },
      { type: 'input_value', name: 'DURATION_MS', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 320,
    tooltip: 'Override the eyes for a short time.',
  },
  {
    type: 'airo_run_eyes',
    message0: 'run eye animation %1 for %2 ms (0 = animation default) flow %3',
    args0: [
      { type: 'field_input', name: 'ANIMATION_ID', text: 'blink-soft' },
      { type: 'input_value', name: 'DURATION_MS', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'FLOW',
        options: [
          ['wait', 'wait'],
          ['continue', 'continue'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 315,
    tooltip: 'Run a saved eye editor animation by id.',
  },
  {
    type: 'airo_set_dock_lights',
    message0: 'set dock lights red %1 green %2 blue %3 for %4 ms',
    args0: [
      { type: 'input_value', name: 'RED', check: 'Number' },
      { type: 'input_value', name: 'GREEN', check: 'Number' },
      { type: 'input_value', name: 'BLUE', check: 'Number' },
      { type: 'input_value', name: 'DURATION_MS', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 60,
    tooltip: 'Set the Airo Dock lights with raw RGB values.',
  },
  {
    type: 'airo_move_robot',
    message0: 'move robot %1 intensity %2',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['front', 'front'],
          ['behind', 'behind'],
          ['left', 'left'],
          ['right', 'right'],
        ],
      },
      { type: 'input_value', name: 'INTENSITY', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 25,
    tooltip: 'Move the Airo dock base.',
  },
  {
    type: 'airo_face_person',
    message0: 'turn toward person',
    previousStatement: null,
    nextStatement: null,
    colour: 48,
    tooltip: 'Turn toward the visible person.',
  },
  {
    type: 'airo_turn_waypoint',
    message0: 'turn to %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'WAYPOINT',
        options: [
          ['front', 'front'],
          ['right', 'right'],
          ['behind', 'behind'],
          ['left', 'left'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Turn to a named heading.',
  },
  {
    type: 'airo_rotate_robot_degrees',
    message0: 'rotate robot %1 degrees',
    args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Rotate the robot by a specific degree amount.',
  },
  {
    type: 'airo_move_robot_timed',
    message0: 'move robot %1 intensity %2 for %3 ms',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['front', 'front'],
          ['behind', 'behind'],
          ['left', 'left'],
          ['right', 'right'],
        ],
      },
      { type: 'input_value', name: 'INTENSITY', check: 'Number' },
      { type: 'input_value', name: 'DURATION_MS', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 28,
    tooltip: 'Move the Airo dock base for a fixed duration.',
  },
  {
    type: 'airo_wait',
    message0: 'wait %1 ms',
    args0: [{ type: 'input_value', name: 'DURATION_MS', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: 205,
    tooltip: 'Wait for a number of milliseconds.',
  },
  {
    type: 'airo_wait_for',
    message0: 'wait for %1 ms',
    args0: [{ type: 'input_value', name: 'DURATION_MS', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: 205,
    tooltip: 'Wait for a number of milliseconds.',
  },
  {
    type: 'airo_stop_robot',
    message0: 'stop robot',
    previousStatement: null,
    nextStatement: null,
    colour: 10,
    tooltip: 'Stop robot motion immediately.',
  },
  {
    type: 'airo_take_photo',
    message0: 'take photo save result in %1',
    args0: [
      { type: 'field_variable', name: 'VARIABLE', variable: 'lastPhoto' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 260,
    tooltip: 'Take a photo and store the result in a variable.',
  },
  {
    type: 'airo_save_image_to_gallery',
    message0: 'save image %1 to gallery source %2 save id in %3 only if var is true %4',
    args0: [
      { type: 'input_value', name: 'IMAGE', check: 'String' },
      {
        type: 'field_dropdown',
        name: 'SOURCE',
        options: [
          ['front', 'front'],
          ['rear', 'rear'],
        ],
      },
      { type: 'field_variable', name: 'VARIABLE', variable: 'savedPhotoId' },
      { type: 'field_input', name: 'ONLY_IF_TRUE_VAR', text: '' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 262,
    tooltip: 'Save an image variable to the gallery. Set a variable name to save only when that variable is true.',
  },
  {
    type: 'airo_show_timer_widget',
    message0: 'show timer %1 seconds title %2',
    args0: [
      { type: 'input_value', name: 'DURATION_SECONDS', check: 'Number' },
      { type: 'input_value', name: 'TITLE', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 190,
    tooltip: 'Show the built-in timer widget.',
  },
  {
    type: 'airo_show_confirmation_widget',
    message0: 'show confirmation title %1 subtitle %2 confirm %3 cancel %4 save in %5 timeout %6 ms',
    args0: [
      { type: 'input_value', name: 'TITLE', check: 'String' },
      { type: 'input_value', name: 'SUBTITLE', check: 'String' },
      { type: 'input_value', name: 'CONFIRM_TEXT', check: 'String' },
      { type: 'input_value', name: 'CANCEL_TEXT', check: 'String' },
      { type: 'field_variable', name: 'VARIABLE', variable: 'confirmationAnswer' },
      { type: 'input_value', name: 'DURATION_MS', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 205,
    tooltip: 'Show the built-in yes/no confirmation widget and store a boolean result in a variable.',
  },
  {
    type: 'airo_listen_voice_command',
    message0: 'listen for voice command save transcript in %1 timeout %2 ms allow interim %3',
    args0: [
      { type: 'field_variable', name: 'VARIABLE', variable: 'heardText' },
      { type: 'input_value', name: 'TIMEOUT_MS', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'INTERIM',
        options: [
          ['false', 'false'],
          ['true', 'true'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 205,
    tooltip: 'Capture what the user says and store the transcript.',
  },
  {
    type: 'airo_play_sound',
    message0: 'play sound %1 volume %2 save in %3',
    args0: [
      {
        type: 'field_dropdown',
        name: 'SOUND',
        options: [
          ['alarm', 'alarm'],
          ['close menu', 'closeMenu'],
          ['fail', 'fail'],
          ['notify', 'notify'],
          ['open menu', 'openMenu'],
          ['photo taken', 'photoTaken'],
          ['processing', 'processing'],
          ['ready for speech', 'readyForSpeech'],
          ['success', 'success'],
          ['timer', 'timer'],
          ['unknown command', 'unknownCommand'],
        ],
      },
      { type: 'input_value', name: 'VOLUME', check: 'Number' },
      { type: 'field_variable', name: 'VARIABLE', variable: 'soundResult' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Play a built-in Airo sound and store the returned value if needed.',
  },
  {
    type: 'airo_show_settings_widget',
    message0: 'show settings title %1 options json %2 auto close after %3 ms',
    args0: [
      { type: 'input_value', name: 'TITLE', check: 'String' },
      { type: 'input_value', name: 'OPTIONS', check: 'String' },
      { type: 'input_value', name: 'DURATION_MS', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 215,
    tooltip: 'Show the built-in settings widget using a JSON options array.',
  },
  {
    type: 'airo_recognize_face',
    message0: 'recognize %1 save face name in %2',
    args0: [
      {
        type: 'field_dropdown',
        name: 'TARGET',
        options: [
          ['family', 'family'],
          ['any face', 'any-face'],
        ],
      },
      { type: 'field_variable', name: 'VARIABLE', variable: 'faceName' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 195,
    tooltip: 'Recognize faces using available vision tools.',
  },
  {
    type: 'airo_call_function',
    message0: 'call function %1 with json %2',
    args0: [
      { type: 'field_input', name: 'FUNCTION_NAME', text: 'show_confirmation_widget' },
      { type: 'input_value', name: 'PAYLOAD', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 245,
    tooltip: 'Call any available AirOS function by name.',
  },
  {
    type: 'airo_run_javascript',
    message0: 'run javascript %1 save return in %2',
    args0: [
      { type: 'input_value', name: 'CODE', check: 'String' },
      { type: 'field_variable', name: 'VARIABLE', variable: 'jsResult' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 255,
    tooltip: 'Execute JavaScript in the skill runtime and save the return value.',
  },
  {
    type: 'airo_set_var',
    message0: 'save %1 to %2',
    args0: [
      { type: 'input_value', name: 'VALUE', check: ['String', 'Number', 'Boolean'] },
      { type: 'field_variable', name: 'VARIABLE', variable: 'savedValue' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 255,
    tooltip: 'Save any value into a variable.',
  },
  {
    type: 'airo_get_current_location',
    message0: 'get current location save in %1',
    args0: [{ type: 'field_variable', name: 'VARIABLE', variable: 'currentLocation' }],
    previousStatement: null,
    nextStatement: null,
    colour: 252,
    tooltip: 'Get current robot latitude/longitude and save as JSON object.',
  },
  {
    type: 'airo_get_intent_input',
    message0: 'get intent input json save in %1',
    args0: [{ type: 'field_variable', name: 'VARIABLE', variable: 'intentInput' }],
    previousStatement: null,
    nextStatement: null,
    colour: 252,
    tooltip: 'Get JSON payload passed from intent model into this skill run.',
  },
  {
    type: 'airo_get_intent_text',
    message0: 'get intent text save in %1',
    args0: [{ type: 'field_variable', name: 'VARIABLE', variable: 'intentText' }],
    previousStatement: null,
    nextStatement: null,
    colour: 252,
    tooltip: 'Get the raw user command text passed from intent model.',
  },
  {
    type: 'airo_json_get_value',
    message0: 'json get key/path %1 from %2 save in %3',
    args0: [
      { type: 'input_value', name: 'KEY', check: 'String' },
      { type: 'input_value', name: 'SOURCE', check: ['String', 'Number'] },
      { type: 'field_variable', name: 'VARIABLE', variable: 'jsonValue' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 252,
    tooltip: 'Read one key/path from a JSON object or JSON string.',
  },
  {
    type: 'airo_json_get_keys',
    message0: 'json get keys from %1 save in %2',
    args0: [
      { type: 'input_value', name: 'SOURCE', check: ['String', 'Number'] },
      { type: 'field_variable', name: 'VARIABLE', variable: 'jsonKeys' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 252,
    tooltip: 'Get all keys from JSON object or array (as string array).',
  },
  {
    type: 'airo_json_get_values',
    message0: 'json get values from %1 save in %2',
    args0: [
      { type: 'input_value', name: 'SOURCE', check: ['String', 'Number'] },
      { type: 'field_variable', name: 'VARIABLE', variable: 'jsonValues' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 252,
    tooltip: 'Get all values from JSON object or array.',
  },
  {
    type: 'airo_web_request',
    message0: 'web request url %1 method %2 headers json %3 body %4 timeout %5 ms response %6 save result in %7',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      {
        type: 'field_dropdown',
        name: 'METHOD',
        options: [
          ['GET', 'GET'],
          ['POST', 'POST'],
          ['PUT', 'PUT'],
          ['PATCH', 'PATCH'],
          ['DELETE', 'DELETE'],
        ],
      },
      { type: 'input_value', name: 'HEADERS', check: 'String' },
      { type: 'input_value', name: 'BODY', check: 'String' },
      { type: 'input_value', name: 'TIMEOUT_MS', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'RESPONSE_TYPE',
        options: [
          ['json', 'json'],
          ['text', 'text'],
          ['raw', 'raw'],
        ],
      },
      { type: 'field_variable', name: 'VARIABLE', variable: 'webResult' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 250,
    tooltip: 'Request any web URL through Airo backend and store the result.',
  },
  {
    type: 'airo_download_package',
    message0: 'download AirOS package',
    previousStatement: null,
    nextStatement: null,
    colour: 140,
    tooltip: 'Marks where the package should be exported.',
  },
];

const toolboxDefinition: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Skill',
      colour: '#f97316',
      contents: [
        { kind: 'block', type: 'airo_skill_start' },
        { kind: 'block', type: 'airo_download_package' },
      ],
    },
    {
      kind: 'category',
      name: 'Voice',
      colour: '#d946ef',
      contents: [
        {
          kind: 'block',
          type: 'airo_xai_say',
          inputs: {
            TEXT: {
              shadow: { type: 'text', fields: { TEXT: 'Hello from my Airo skill.' } },
            },
          },
        },
        {
          kind: 'block',
          type: 'airo_say_random',
          inputs: {
            LINES: {
              shadow: { type: 'text', fields: { TEXT: '["Hello there.","Hi, I am ready."]' } },
            },
          },
        },
        {
          kind: 'block',
          type: 'airo_xai_prompt',
          inputs: {
            PROMPT: {
              shadow: { type: 'text', fields: { TEXT: 'Summarize what to do next.' } },
            },
          },
        },
        {
          kind: 'block',
          type: 'airo_show_confirmation_widget',
          inputs: {
            TITLE: { shadow: { type: 'text', fields: { TEXT: 'Save this?' } } },
            SUBTITLE: { shadow: { type: 'text', fields: { TEXT: 'Choose yes or no.' } } },
            CONFIRM_TEXT: { shadow: { type: 'text', fields: { TEXT: 'Yes' } } },
            CANCEL_TEXT: { shadow: { type: 'text', fields: { TEXT: 'No' } } },
            DURATION_MS: { shadow: { type: 'math_number', fields: { NUM: 9000 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_listen_voice_command',
          inputs: {
            TIMEOUT_MS: { shadow: { type: 'math_number', fields: { NUM: 9000 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_play_sound',
          inputs: {
            VOLUME: { shadow: { type: 'math_number', fields: { NUM: 0.6 } } },
          },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Screen',
      colour: '#14b8a6',
      contents: [
        {
          kind: 'block',
          type: 'airo_display_text',
          inputs: {
            TITLE: { shadow: { type: 'text', fields: { TEXT: 'Skill Screen' } } },
            BODY: { shadow: { type: 'text', fields: { TEXT: 'This came from Airo Skills.' } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_set_status_text',
          inputs: {
            TEXT: { shadow: { type: 'text', fields: { TEXT: 'Running skill' } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_display_image',
          inputs: {
            URL: { shadow: { type: 'text', fields: { TEXT: 'https://example.com/image.png' } } },
            CAPTION: { shadow: { type: 'text', fields: { TEXT: 'Image Caption' } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_show_ui_card',
          inputs: {
            TITLE: { shadow: { type: 'text', fields: { TEXT: 'Airo Card' } } },
            SUBTITLE: { shadow: { type: 'text', fields: { TEXT: 'Full-screen Airo style UI' } } },
            BODY: { shadow: { type: 'text', fields: { TEXT: 'Use this for skill-specific screens and previews.' } } },
            IMAGE_URL: { shadow: { type: 'text', fields: { TEXT: '' } } },
            CHIPS_JSON: { shadow: { type: 'text', fields: { TEXT: '["photo","preview"]' } } },
          },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Robot',
      colour: '#f97316',
      contents: [
        {
          kind: 'block',
          type: 'airo_move_robot',
          inputs: {
            INTENSITY: { shadow: { type: 'math_number', fields: { NUM: 0.55 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_face_person',
        },
        {
          kind: 'block',
          type: 'airo_move_robot_timed',
          inputs: {
            INTENSITY: { shadow: { type: 'math_number', fields: { NUM: 0.75 } } },
            DURATION_MS: { shadow: { type: 'math_number', fields: { NUM: 650 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_rotate_robot_degrees',
          inputs: {
            DEGREES: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_set_eyes_preset',
          inputs: {
            DURATION_MS: { shadow: { type: 'math_number', fields: { NUM: 1200 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_run_eyes',
          inputs: {
            DURATION_MS: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_set_dock_lights',
          inputs: {
            RED: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            GREEN: { shadow: { type: 'math_number', fields: { NUM: 180 } } },
            BLUE: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
            DURATION_MS: { shadow: { type: 'math_number', fields: { NUM: 1200 } } },
          },
        },
        { kind: 'block', type: 'airo_turn_waypoint' },
        {
          kind: 'block',
          type: 'airo_wait',
          inputs: {
            DURATION_MS: { shadow: { type: 'math_number', fields: { NUM: 600 } } },
          },
        },
        { kind: 'block', type: 'airo_stop_robot' },
        {
          kind: 'block',
          type: 'airo_wait_for',
          inputs: {
            DURATION_MS: { shadow: { type: 'math_number', fields: { NUM: 600 } } },
          },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Camera',
      colour: '#8b5cf6',
      contents: [
        { kind: 'block', type: 'airo_take_photo' },
        {
          kind: 'block',
          type: 'airo_save_image_to_gallery',
          inputs: {
            IMAGE: { shadow: { type: 'text', fields: { TEXT: '{"var":"lastPhoto"}' } } },
          },
        },
        { kind: 'block', type: 'airo_recognize_face' },
        {
          kind: 'block',
          type: 'airo_show_timer_widget',
          inputs: {
            DURATION_SECONDS: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
            TITLE: { shadow: { type: 'text', fields: { TEXT: 'Countdown' } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_show_confirmation_widget',
          inputs: {
            TITLE: { shadow: { type: 'text', fields: { TEXT: 'Save this?' } } },
            SUBTITLE: { shadow: { type: 'text', fields: { TEXT: 'Choose yes or no.' } } },
            CONFIRM_TEXT: { shadow: { type: 'text', fields: { TEXT: 'Yes' } } },
            CANCEL_TEXT: { shadow: { type: 'text', fields: { TEXT: 'No' } } },
            DURATION_MS: { shadow: { type: 'math_number', fields: { NUM: 9000 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_listen_voice_command',
          inputs: {
            TIMEOUT_MS: { shadow: { type: 'math_number', fields: { NUM: 9000 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_show_settings_widget',
          inputs: {
            TITLE: { shadow: { type: 'text', fields: { TEXT: 'Modes' } } },
            OPTIONS: { shadow: { type: 'text', fields: { TEXT: '[{\"id\":\"one\",\"label\":\"One\",\"icon\":\"⭐\"}]' } } },
          },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Functions',
      colour: '#4f46e5',
      contents: [
        {
          kind: 'block',
          type: 'airo_web_request',
          inputs: {
            URL: { shadow: { type: 'text', fields: { TEXT: 'https://example.com' } } },
            HEADERS: { shadow: { type: 'text', fields: { TEXT: '{"accept":"application/json"}' } } },
            BODY: { shadow: { type: 'text', fields: { TEXT: '' } } },
            TIMEOUT_MS: { shadow: { type: 'math_number', fields: { NUM: 12000 } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_call_function',
          inputs: {
            PAYLOAD: {
              shadow: { type: 'text', fields: { TEXT: '{"title":"Run action?"}' } },
            },
          },
        },
        {
          kind: 'block',
          type: 'airo_run_javascript',
          inputs: {
            CODE: {
              shadow: {
                type: 'text',
                fields: { TEXT: 'return `hello ${vars.userName || \"friend\"}`;' },
              },
            },
          },
        },
        {
          kind: 'block',
          type: 'airo_set_var',
          inputs: {
            VALUE: {
              shadow: {
                type: 'text',
                fields: { TEXT: 'hello' },
              },
            },
          },
        },
        {
          kind: 'block',
          type: 'airo_get_current_location',
        },
        {
          kind: 'block',
          type: 'airo_get_intent_input',
        },
        {
          kind: 'block',
          type: 'airo_get_intent_text',
        },
        {
          kind: 'block',
          type: 'airo_json_get_value',
          inputs: {
            KEY: { shadow: { type: 'text', fields: { TEXT: 'current.temperature_2m' } } },
            SOURCE: { shadow: { type: 'text', fields: { TEXT: '{"var":"webResult"}' } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_json_get_keys',
          inputs: {
            SOURCE: { shadow: { type: 'text', fields: { TEXT: '{"var":"webResult"}' } } },
          },
        },
        {
          kind: 'block',
          type: 'airo_json_get_values',
          inputs: {
            SOURCE: { shadow: { type: 'text', fields: { TEXT: '{"var":"webResult"}' } } },
          },
        },
      ],
    },
    { kind: 'category', custom: 'VARIABLE', name: 'Variables', colour: '#facc15' },
    { kind: 'category', custom: 'PROCEDURE', name: 'Functions', colour: '#60a5fa' },
    {
      kind: 'category',
      name: 'Logic',
      categorystyle: 'logic_category',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_boolean' },
      ],
    },
    {
      kind: 'category',
      name: 'Loops',
      categorystyle: 'loop_category',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext' },
        { kind: 'block', type: 'controls_whileUntil' },
        { kind: 'block', type: 'controls_forEach' },
      ],
    },
    {
      kind: 'category',
      name: 'Text',
      categorystyle: 'text_category',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_print' },
      ],
    },
    {
      kind: 'category',
      name: 'Math',
      categorystyle: 'math_category',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
      ],
    },
  ],
};

const ensureBlocklyBlocks = () => {
  for (const definition of blockDefinitions) {
    if (!Blockly.Blocks[definition.type]) {
      Blockly.common.defineBlocksWithJsonArray([definition as any]);
    }
  }
};

const getValueCode = (block: Blockly.Block, inputName: string, fallback: string) => {
  const code = javascriptGenerator.valueToCode(block, inputName, 0);
  return code && code.trim() ? code : fallback;
};

const getVariableCode = (block: Blockly.Block, fieldName: string, fallback: string) => {
  const field = block.getField(fieldName);
  const name = field?.getText();
  return name && name.trim() ? name.trim() : fallback;
};

const parseGeneratorLiteral = (code: string, fallback: AirSkillValue): AirSkillValue => {
  const trimmed = String(code || '').trim();
  if (!trimmed) return fallback;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      const parsed = JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
      if (typeof parsed === 'string') {
        const nested = parsed.trim();
        if (
          (nested.startsWith('{') && nested.endsWith('}')) ||
          (nested.startsWith('[') && nested.endsWith(']'))
        ) {
          try {
            return JSON.parse(nested);
          } catch {
            return parsed;
          }
        }
      }
      return parsed;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return { var: trimmed };
  }
  return trimmed;
};

const getValueLiteral = (block: Blockly.Block, inputName: string, fallback: AirSkillValue): AirSkillValue =>
  parseGeneratorLiteral(javascriptGenerator.valueToCode(block, inputName, 0) || '', fallback);

const compileBlockToScriptStep = (block: Blockly.Block): AirSkillStep | null => {
  switch (block.type) {
    case 'airo_xai_say':
      return { action: 'say', text: getValueLiteral(block, 'TEXT', '') };
    case 'airo_say_random':
      return {
        action: 'say_random',
        lines: (() => {
          const raw = getValueLiteral(block, 'LINES', '[]');
          if (Array.isArray(raw)) return raw.map((value) => String(value));
          if (typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [raw];
            } catch {
              return [raw];
            }
          }
          return [];
        })(),
      };
    case 'airo_display_text':
      return {
        action: 'display_text',
        title: getValueLiteral(block, 'TITLE', 'Skill Screen'),
        body: getValueLiteral(block, 'BODY', ''),
      };
    case 'airo_set_status_text':
      return { action: 'set_status', text: getValueLiteral(block, 'TEXT', '') };
    case 'airo_display_image':
      return {
        action: 'display_image',
        url: getValueLiteral(block, 'URL', ''),
        caption: getValueLiteral(block, 'CAPTION', ''),
      };
    case 'airo_show_ui_card':
      return {
        action: 'show_ui_card',
        title: getValueLiteral(block, 'TITLE', 'Airo'),
        subtitle: getValueLiteral(block, 'SUBTITLE', ''),
        body: getValueLiteral(block, 'BODY', ''),
        theme: block.getFieldValue('THEME') || 'info',
        imageUrl: getValueLiteral(block, 'IMAGE_URL', ''),
        chipsJson: getValueLiteral(block, 'CHIPS_JSON', '[]'),
        durationMs: getValueLiteral(block, 'DURATION_MS', 0),
      };
    case 'airo_set_eyes_preset':
      return {
        action: 'set_eyes',
        preset: block.getFieldValue('PRESET') || 'idle',
        durationMs: getValueLiteral(block, 'DURATION_MS', 1200),
      };
    case 'airo_run_eyes':
      return {
        action: 'run_eyes',
        animationId: block.getFieldValue('ANIMATION_ID') || 'blink-soft',
        durationMs: getValueLiteral(block, 'DURATION_MS', 0),
        continueExecution: (block.getFieldValue('FLOW') || 'wait') === 'continue',
      };
    case 'airo_set_dock_lights':
      return {
        action: 'set_lights',
        red: getValueLiteral(block, 'RED', 0),
        green: getValueLiteral(block, 'GREEN', 180),
        blue: getValueLiteral(block, 'BLUE', 255),
        durationMs: getValueLiteral(block, 'DURATION_MS', 1200),
      };
    case 'airo_move_robot':
      return {
        action: 'move',
        direction: block.getFieldValue('DIRECTION') || 'front',
        intensity: getValueLiteral(block, 'INTENSITY', 0.55),
      };
    case 'airo_face_person':
      return { action: 'face_person' };
    case 'airo_move_robot_timed':
      return {
        action: 'move_timed',
        direction: block.getFieldValue('DIRECTION') || 'front',
        intensity: getValueLiteral(block, 'INTENSITY', 0.75),
        durationMs: getValueLiteral(block, 'DURATION_MS', 650),
      };
    case 'airo_turn_waypoint':
      return { action: 'turn_waypoint', direction: block.getFieldValue('WAYPOINT') || 'front' };
    case 'airo_rotate_robot_degrees':
      return { action: 'rotate_robot', degrees: getValueLiteral(block, 'DEGREES', 90) };
    case 'airo_stop_robot':
      return { action: 'stop_robot' };
    case 'airo_wait':
      return { action: 'wait', durationMs: getValueLiteral(block, 'DURATION_MS', 600) };
    case 'airo_wait_for':
      return { action: 'wait', durationMs: getValueLiteral(block, 'DURATION_MS', 600) };
    case 'airo_take_photo':
      return { action: 'take_photo', saveAs: getVariableCode(block, 'VARIABLE', 'lastPhoto') };
    case 'airo_save_image_to_gallery':
      {
      const onlyIfTrueVar = (block.getFieldValue('ONLY_IF_TRUE_VAR') || '').trim();
      return {
        action: 'save_image_to_gallery',
        image: getValueLiteral(block, 'IMAGE', { var: 'lastPhoto' }),
        source: block.getFieldValue('SOURCE') || 'front',
        saveAs: getVariableCode(block, 'VARIABLE', 'savedPhotoId'),
        ...(onlyIfTrueVar ? { onlyIfTrueVar } : {}),
      };
      }
    case 'airo_show_timer_widget':
      return {
        action: 'show_timer_widget',
        durationSeconds: getValueLiteral(block, 'DURATION_SECONDS', 60),
        title: getValueLiteral(block, 'TITLE', 'Countdown'),
      };
    case 'airo_show_confirmation_widget':
      return {
        action: 'show_confirmation_widget',
        title: getValueLiteral(block, 'TITLE', 'Save this?'),
        subtitle: getValueLiteral(block, 'SUBTITLE', 'Choose yes or no.'),
        confirmText: getValueLiteral(block, 'CONFIRM_TEXT', 'Yes'),
        cancelText: getValueLiteral(block, 'CANCEL_TEXT', 'No'),
        saveAs: getVariableCode(block, 'VARIABLE', 'confirmationAnswer'),
        durationMs: getValueLiteral(block, 'DURATION_MS', 9000),
      };
    case 'airo_listen_voice_command':
      return {
        action: 'listen_voice_command',
        saveAs: getVariableCode(block, 'VARIABLE', 'heardText'),
        timeoutMs: getValueLiteral(block, 'TIMEOUT_MS', 9000),
        interim: (block.getFieldValue('INTERIM') || 'false') === 'true',
      };
    case 'airo_show_settings_widget':
      return {
        action: 'show_settings_widget',
        title: getValueLiteral(block, 'TITLE', 'Modes'),
        optionsJson: getValueLiteral(block, 'OPTIONS', '[]'),
        durationMs: getValueLiteral(block, 'DURATION_MS', 0),
      };
    case 'airo_recognize_face':
      return {
        action: 'recognize_face',
        target: block.getFieldValue('TARGET') || 'family',
        saveAs: getVariableCode(block, 'VARIABLE', 'faceName'),
      };
    case 'airo_call_function':
      return {
        action: 'call_function',
        name: block.getFieldValue('FUNCTION_NAME') || 'custom_function',
        payloadJson: getValueLiteral(block, 'PAYLOAD', '{}'),
      };
    case 'airo_run_javascript':
      return {
        action: 'run_javascript',
        code: getValueLiteral(block, 'CODE', 'return null;'),
        saveAs: getVariableCode(block, 'VARIABLE', 'jsResult'),
      };
    case 'airo_set_var':
      return {
        action: 'set_var',
        name: getVariableCode(block, 'VARIABLE', 'savedValue'),
        value: getValueLiteral(block, 'VALUE', ''),
      };
    case 'airo_get_current_location':
      return {
        action: 'get_current_location',
        saveAs: getVariableCode(block, 'VARIABLE', 'currentLocation'),
      };
    case 'airo_get_intent_input':
      return {
        action: 'get_intent_input',
        saveAs: getVariableCode(block, 'VARIABLE', 'intentInput'),
      };
    case 'airo_get_intent_text':
      return {
        action: 'get_intent_text',
        saveAs: getVariableCode(block, 'VARIABLE', 'intentText'),
      };
    case 'airo_json_get_value':
      return {
        action: 'json_get_value',
        key: getValueLiteral(block, 'KEY', ''),
        source: getValueLiteral(block, 'SOURCE', '{}'),
        saveAs: getVariableCode(block, 'VARIABLE', 'jsonValue'),
      };
    case 'airo_json_get_keys':
      return {
        action: 'json_get_keys',
        source: getValueLiteral(block, 'SOURCE', '{}'),
        saveAs: getVariableCode(block, 'VARIABLE', 'jsonKeys'),
      };
    case 'airo_json_get_values':
      return {
        action: 'json_get_values',
        source: getValueLiteral(block, 'SOURCE', '{}'),
        saveAs: getVariableCode(block, 'VARIABLE', 'jsonValues'),
      };
    case 'airo_web_request':
      return {
        action: 'web_request',
        url: getValueLiteral(block, 'URL', ''),
        method: block.getFieldValue('METHOD') || 'GET',
        headersJson: getValueLiteral(block, 'HEADERS', '{}'),
        body: getValueLiteral(block, 'BODY', ''),
        timeoutMs: getValueLiteral(block, 'TIMEOUT_MS', 12000),
        responseType: block.getFieldValue('RESPONSE_TYPE') || 'json',
        saveAs: getVariableCode(block, 'VARIABLE', 'webResult'),
      };
    case 'airo_xai_prompt':
      return {
        action: 'set_var',
        name: getVariableCode(block, 'VARIABLE', 'xaiReply'),
        value: getValueLiteral(block, 'PROMPT', ''),
      };
    default:
      return null;
  }
};

const compileWorkspaceToAirScript = (workspace: Blockly.Workspace): AirSkillScript => {
  const startBlock = workspace.getTopBlocks(true).find((block) => block.type === 'airo_skill_start');
  const entry: AirSkillStep[] = [];
  let cursor = startBlock?.getNextBlock() || null;

  while (cursor) {
    const step = compileBlockToScriptStep(cursor);
    if (step) {
      entry.push(step);
    }
    cursor = cursor.getNextBlock();
  }

  return {
    language: 'airscript-1',
    entry,
  };
};

const attachValueInput = (
  workspace: Blockly.Workspace,
  block: Blockly.Block,
  inputName: string,
  value: AirSkillValue | undefined
) => {
  const input = block.getInput(inputName);
  if (!input?.connection) return;
  const resolved = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const isNumber = typeof value === 'number';
  const shadow = workspace.newBlock(isNumber ? 'math_number' : 'text');
  shadow.setShadow(true);
  if (isNumber) {
    shadow.setFieldValue(String(value), 'NUM');
  } else {
    shadow.setFieldValue(resolved, 'TEXT');
  }
  shadow.outputConnection?.connect(input.connection);
};

const scriptStepToBlocklyBlock = (workspace: Blockly.Workspace, step: AirSkillStep): Blockly.Block | null => {
  let block: Blockly.Block | null = null;
  switch (step.action) {
    case 'say':
      block = workspace.newBlock('airo_xai_say');
      attachValueInput(workspace, block, 'TEXT', step.text);
      break;
    case 'say_random':
      block = workspace.newBlock('airo_say_random');
      attachValueInput(workspace, block, 'LINES', JSON.stringify(step.lines || []));
      break;
    case 'set_status':
      block = workspace.newBlock('airo_set_status_text');
      attachValueInput(workspace, block, 'TEXT', step.text);
      break;
    case 'display_text':
      block = workspace.newBlock('airo_display_text');
      attachValueInput(workspace, block, 'TITLE', step.title);
      attachValueInput(workspace, block, 'BODY', step.body);
      break;
    case 'display_image':
      block = workspace.newBlock('airo_display_image');
      attachValueInput(workspace, block, 'URL', step.url);
      attachValueInput(workspace, block, 'CAPTION', step.caption);
      break;
    case 'show_ui_card':
      block = workspace.newBlock('airo_show_ui_card');
      attachValueInput(workspace, block, 'TITLE', step.title);
      attachValueInput(workspace, block, 'SUBTITLE', step.subtitle);
      attachValueInput(workspace, block, 'BODY', step.body);
      block.setFieldValue(String(step.theme || 'info'), 'THEME');
      attachValueInput(workspace, block, 'IMAGE_URL', step.imageUrl);
      attachValueInput(workspace, block, 'CHIPS_JSON', step.chipsJson);
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      break;
    case 'set_eyes':
      block = workspace.newBlock('airo_set_eyes_preset');
      block.setFieldValue(String(step.preset || 'idle'), 'PRESET');
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      break;
    case 'run_eyes':
      block = workspace.newBlock('airo_run_eyes');
      block.setFieldValue(String(step.animationId || 'blink-soft'), 'ANIMATION_ID');
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      block.setFieldValue(step.continueExecution ? 'continue' : 'wait', 'FLOW');
      break;
    case 'set_lights':
      block = workspace.newBlock('airo_set_dock_lights');
      attachValueInput(workspace, block, 'RED', step.red);
      attachValueInput(workspace, block, 'GREEN', step.green);
      attachValueInput(workspace, block, 'BLUE', step.blue);
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      break;
    case 'move':
      block = workspace.newBlock('airo_move_robot');
      block.setFieldValue(String(step.direction || 'front'), 'DIRECTION');
      attachValueInput(workspace, block, 'INTENSITY', step.intensity);
      break;
    case 'move_timed':
      block = workspace.newBlock('airo_move_robot_timed');
      block.setFieldValue(String(step.direction || 'front'), 'DIRECTION');
      attachValueInput(workspace, block, 'INTENSITY', step.intensity);
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      break;
    case 'face_person':
      block = workspace.newBlock('airo_face_person');
      break;
    case 'turn_waypoint':
      block = workspace.newBlock('airo_turn_waypoint');
      block.setFieldValue(String(step.direction || 'front'), 'WAYPOINT');
      break;
    case 'rotate_robot':
      block = workspace.newBlock('airo_rotate_robot_degrees');
      attachValueInput(workspace, block, 'DEGREES', step.degrees);
      break;
    case 'wait':
      block = workspace.newBlock('airo_wait');
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      break;
    case 'wait_for':
      block = workspace.newBlock('airo_wait_for');
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      break;
    case 'stop_robot':
      block = workspace.newBlock('airo_stop_robot');
      break;
    case 'take_photo':
      block = workspace.newBlock('airo_take_photo');
      block.getField('VARIABLE')?.setValue(step.saveAs || 'lastPhoto');
      break;
    case 'save_image_to_gallery':
      block = workspace.newBlock('airo_save_image_to_gallery');
      attachValueInput(workspace, block, 'IMAGE', step.image);
      block.setFieldValue(String(step.source || 'front'), 'SOURCE');
      block.getField('VARIABLE')?.setValue(step.saveAs || 'savedPhotoId');
      block.setFieldValue(String(step.onlyIfTrueVar || ''), 'ONLY_IF_TRUE_VAR');
      break;
    case 'show_timer_widget':
      block = workspace.newBlock('airo_show_timer_widget');
      attachValueInput(workspace, block, 'DURATION_SECONDS', step.durationSeconds);
      attachValueInput(workspace, block, 'TITLE', step.title);
      break;
    case 'show_confirmation_widget':
      block = workspace.newBlock('airo_show_confirmation_widget');
      attachValueInput(workspace, block, 'TITLE', step.title);
      attachValueInput(workspace, block, 'SUBTITLE', step.subtitle);
      attachValueInput(workspace, block, 'CONFIRM_TEXT', step.confirmText);
      attachValueInput(workspace, block, 'CANCEL_TEXT', step.cancelText);
      block.getField('VARIABLE')?.setValue(step.saveAs || 'confirmationAnswer');
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      break;
    case 'listen_voice_command':
      block = workspace.newBlock('airo_listen_voice_command');
      block.getField('VARIABLE')?.setValue(step.saveAs || 'heardText');
      attachValueInput(workspace, block, 'TIMEOUT_MS', step.timeoutMs);
      block.setFieldValue(step.interim ? 'true' : 'false', 'INTERIM');
      break;
    case 'play_sound':
      block = workspace.newBlock('airo_play_sound');
      block.setFieldValue(String((step as any).sound || 'success'), 'SOUND');
      attachValueInput(workspace, block, 'VOLUME', (step as any).volume);
      block.getField('VARIABLE')?.setValue(step.saveAs || 'soundResult');
      break;
    case 'show_settings_widget':
      block = workspace.newBlock('airo_show_settings_widget');
      attachValueInput(workspace, block, 'TITLE', step.title);
      attachValueInput(workspace, block, 'OPTIONS', step.optionsJson);
      attachValueInput(workspace, block, 'DURATION_MS', step.durationMs);
      break;
    case 'web_request':
      block = workspace.newBlock('airo_web_request');
      attachValueInput(workspace, block, 'URL', step.url);
      block.setFieldValue(String(step.method || 'GET'), 'METHOD');
      attachValueInput(workspace, block, 'HEADERS', step.headersJson);
      attachValueInput(workspace, block, 'BODY', step.body);
      attachValueInput(workspace, block, 'TIMEOUT_MS', step.timeoutMs);
      block.setFieldValue(String(step.responseType || 'json'), 'RESPONSE_TYPE');
      block.getField('VARIABLE')?.setValue(step.saveAs || 'webResult');
      break;
    case 'run_javascript':
      block = workspace.newBlock('airo_run_javascript');
      attachValueInput(workspace, block, 'CODE', step.code);
      block.getField('VARIABLE')?.setValue(step.saveAs || 'jsResult');
      break;
    case 'set_var':
      block = workspace.newBlock('airo_set_var');
      attachValueInput(workspace, block, 'VALUE', step.value);
      block.getField('VARIABLE')?.setValue(step.name || 'savedValue');
      break;
    case 'get_current_location':
      block = workspace.newBlock('airo_get_current_location');
      block.getField('VARIABLE')?.setValue(step.saveAs || 'currentLocation');
      break;
    case 'get_intent_input':
      block = workspace.newBlock('airo_get_intent_input');
      block.getField('VARIABLE')?.setValue(step.saveAs || 'intentInput');
      break;
    case 'get_intent_text':
      block = workspace.newBlock('airo_get_intent_text');
      block.getField('VARIABLE')?.setValue(step.saveAs || 'intentText');
      break;
    case 'json_get_value':
      block = workspace.newBlock('airo_json_get_value');
      attachValueInput(workspace, block, 'KEY', step.key);
      attachValueInput(workspace, block, 'SOURCE', step.source);
      block.getField('VARIABLE')?.setValue(step.saveAs || 'jsonValue');
      break;
    case 'json_get_keys':
      block = workspace.newBlock('airo_json_get_keys');
      attachValueInput(workspace, block, 'SOURCE', step.source);
      block.getField('VARIABLE')?.setValue(step.saveAs || 'jsonKeys');
      break;
    case 'json_get_values':
      block = workspace.newBlock('airo_json_get_values');
      attachValueInput(workspace, block, 'SOURCE', step.source);
      block.getField('VARIABLE')?.setValue(step.saveAs || 'jsonValues');
      break;
    default:
      return null;
  }
  block.initSvg?.();
  block.render?.();
  return block;
};

const createWorkspaceStateFromScript = (script: AirSkillScript | null | undefined) => {
  if (!script?.entry?.length) return null;
  const workspace = new Blockly.Workspace();
  try {
    const startBlock = workspace.newBlock('airo_skill_start');
    let previous: Blockly.Block = startBlock;

    for (const step of script.entry) {
      const block = scriptStepToBlocklyBlock(workspace, step);
      if (!block) continue;
      previous.nextConnection?.connect(block.previousConnection);
      previous = block;
    }

    return Blockly.serialization.workspaces.save(workspace);
  } finally {
    workspace.dispose();
  }
};

const ensureBlocklyGenerators = () => {
  javascriptGenerator.forBlock['airo_skill_start'] = () => '';

  javascriptGenerator.forBlock['airo_xai_say'] = (block) => {
    const text = getValueCode(block, 'TEXT', "''");
    return `await runtime.say(${text});\n`;
  };

  javascriptGenerator.forBlock['airo_say_random'] = (block) => {
    const lines = getValueCode(block, 'LINES', "'[]'");
    return `await runtime.say(JSON.parse(${lines})[Math.floor(Math.random() * JSON.parse(${lines}).length)] || '');\n`;
  };

  javascriptGenerator.forBlock['airo_xai_prompt'] = (block) => {
    const prompt = getValueCode(block, 'PROMPT', "''");
    const variable = getVariableCode(block, 'VARIABLE', 'xaiReply');
    return `${variable} = await runtime.askXai(${prompt});\n`;
  };

  javascriptGenerator.forBlock['airo_display_text'] = (block) => {
    const title = getValueCode(block, 'TITLE', "''");
    const body = getValueCode(block, 'BODY', "''");
    return `await runtime.displayText({ title: ${title}, body: ${body} });\n`;
  };

  javascriptGenerator.forBlock['airo_set_status_text'] = (block) => {
    const text = getValueCode(block, 'TEXT', "''");
    return `await runtime.setStatusText(${text});\n`;
  };

  javascriptGenerator.forBlock['airo_display_image'] = (block) => {
    const url = getValueCode(block, 'URL', "''");
    const caption = getValueCode(block, 'CAPTION', "''");
    return `await runtime.displayImage({ url: ${url}, caption: ${caption} });\n`;
  };

  javascriptGenerator.forBlock['airo_show_ui_card'] = (block) => {
    const title = getValueCode(block, 'TITLE', "'Airo'");
    const subtitle = getValueCode(block, 'SUBTITLE', "''");
    const body = getValueCode(block, 'BODY', "''");
    const theme = JSON.stringify(block.getFieldValue('THEME') || 'info');
    const imageUrl = getValueCode(block, 'IMAGE_URL', "''");
    const chipsJson = getValueCode(block, 'CHIPS_JSON', "'[]'");
    const durationMs = getValueCode(block, 'DURATION_MS', '0');
    return `await runtime.showUiCard({ title: ${title}, subtitle: ${subtitle}, body: ${body}, theme: ${theme}, imageUrl: ${imageUrl}, chips: JSON.parse(${chipsJson}), durationMs: ${durationMs} });\n`;
  };

  javascriptGenerator.forBlock['airo_move_robot'] = (block) => {
    const direction = JSON.stringify(block.getFieldValue('DIRECTION') || 'front');
    const intensity = getValueCode(block, 'INTENSITY', '0.55');
    return `await runtime.moveRobot({ direction: ${direction}, intensity: ${intensity} });\n`;
  };

  javascriptGenerator.forBlock['airo_face_person'] = () => {
    return `await runtime.facePerson();\n`;
  };

  javascriptGenerator.forBlock['airo_turn_waypoint'] = (block) => {
    const waypoint = JSON.stringify(block.getFieldValue('WAYPOINT') || 'front');
    return `await runtime.turnWaypoint(${waypoint});\n`;
  };

  javascriptGenerator.forBlock['airo_rotate_robot_degrees'] = (block) => {
    const degrees = getValueCode(block, 'DEGREES', '90');
    return `await runtime.rotateRobotDegrees(${degrees});\n`;
  };

  javascriptGenerator.forBlock['airo_set_eyes_preset'] = (block) => {
    const preset = JSON.stringify(block.getFieldValue('PRESET') || 'idle');
    const durationMs = getValueCode(block, 'DURATION_MS', '1200');
    return `await runtime.setEyesPreset(${preset}, ${durationMs});\n`;
  };

  javascriptGenerator.forBlock['airo_run_eyes'] = (block) => {
    const animationId = JSON.stringify(block.getFieldValue('ANIMATION_ID') || 'blink-soft');
    const durationMs = getValueCode(block, 'DURATION_MS', '0');
    const flow = JSON.stringify(block.getFieldValue('FLOW') || 'wait');
    return `await runtime.runEyes({ animationId: ${animationId}, durationMs: ${durationMs}, continueExecution: ${flow} === "continue" });\n`;
  };

  javascriptGenerator.forBlock['airo_set_dock_lights'] = (block) => {
    const red = getValueCode(block, 'RED', '0');
    const green = getValueCode(block, 'GREEN', '180');
    const blue = getValueCode(block, 'BLUE', '255');
    const durationMs = getValueCode(block, 'DURATION_MS', '1200');
    return `await runtime.setDockLights({ red: ${red}, green: ${green}, blue: ${blue}, durationMs: ${durationMs} });\n`;
  };

  javascriptGenerator.forBlock['airo_move_robot_timed'] = (block) => {
    const direction = JSON.stringify(block.getFieldValue('DIRECTION') || 'front');
    const intensity = getValueCode(block, 'INTENSITY', '0.75');
    const durationMs = getValueCode(block, 'DURATION_MS', '650');
    return `await runtime.moveRobotTimed({ direction: ${direction}, intensity: ${intensity}, durationMs: ${durationMs} });\n`;
  };

  javascriptGenerator.forBlock['airo_stop_robot'] = () => {
    return `await runtime.stopRobot();\n`;
  };

  javascriptGenerator.forBlock['airo_wait'] = (block) => {
    const durationMs = getValueCode(block, 'DURATION_MS', '600');
    return `await runtime.wait(${durationMs});\n`;
  };

  javascriptGenerator.forBlock['airo_wait_for'] = (block) => {
    const durationMs = getValueCode(block, 'DURATION_MS', '600');
    return `await runtime.wait(${durationMs});\n`;
  };

  javascriptGenerator.forBlock['airo_take_photo'] = (block) => {
    const variable = getVariableCode(block, 'VARIABLE', 'lastPhoto');
    return `${variable} = await runtime.takePhoto();\n`;
  };

  javascriptGenerator.forBlock['airo_save_image_to_gallery'] = (block) => {
    const image = getValueCode(block, 'IMAGE', "''");
    const source = JSON.stringify(block.getFieldValue('SOURCE') || 'front');
    const variable = getVariableCode(block, 'VARIABLE', 'savedPhotoId');
    const onlyIfTrueVar = (block.getFieldValue('ONLY_IF_TRUE_VAR') || '').trim();
    if (onlyIfTrueVar) {
      return `${variable} = '';\nif (${onlyIfTrueVar} === true) { ${variable} = await runtime.saveImageToGallery({ image: ${image}, source: ${source} }); }\n`;
    }
    return `${variable} = await runtime.saveImageToGallery({ image: ${image}, source: ${source} });\n`;
  };

  javascriptGenerator.forBlock['airo_show_timer_widget'] = (block) => {
    const durationSeconds = getValueCode(block, 'DURATION_SECONDS', '60');
    const title = getValueCode(block, 'TITLE', "'TIMER'");
    return `await runtime.showTimerWidget({ durationSeconds: ${durationSeconds}, title: ${title} });\n`;
  };

  javascriptGenerator.forBlock['airo_show_confirmation_widget'] = (block) => {
    const title = getValueCode(block, 'TITLE', "'Confirm'");
    const subtitle = getValueCode(block, 'SUBTITLE', "''");
    const confirmText = getValueCode(block, 'CONFIRM_TEXT', "'Yes'");
    const cancelText = getValueCode(block, 'CANCEL_TEXT', "'No'");
    const variable = getVariableCode(block, 'VARIABLE', 'confirmationAnswer');
    const durationMs = getValueCode(block, 'DURATION_MS', '9000');
    return `${variable} = await runtime.showConfirmationWidget({ title: ${title}, subtitle: ${subtitle}, confirmText: ${confirmText}, cancelText: ${cancelText}, durationMs: ${durationMs} });\n`;
  };

  javascriptGenerator.forBlock['airo_listen_voice_command'] = (block) => {
    const variable = getVariableCode(block, 'VARIABLE', 'heardText');
    const timeoutMs = getValueCode(block, 'TIMEOUT_MS', '9000');
    const interim = JSON.stringify((block.getFieldValue('INTERIM') || 'false') === 'true');
    return `${variable} = await runtime.listenVoiceCommand({ timeoutMs: ${timeoutMs}, interim: ${interim} });\n`;
  };

  javascriptGenerator.forBlock['airo_play_sound'] = (block) => {
    const variable = getVariableCode(block, 'VARIABLE', 'soundResult');
    const sound = JSON.stringify(block.getFieldValue('SOUND') || 'success');
    const volume = getValueCode(block, 'VOLUME', '0.6');
    return `${variable} = await runtime.playSound({ sound: ${sound}, volume: ${volume} });\n`;
  };

  javascriptGenerator.forBlock['airo_show_settings_widget'] = (block) => {
    const title = getValueCode(block, 'TITLE', "'Settings'");
    const options = getValueCode(block, 'OPTIONS', "'[]'");
    const durationMs = getValueCode(block, 'DURATION_MS', '0');
    return `await runtime.showSettingsWidget({ title: ${title}, options: JSON.parse(${options}), durationMs: ${durationMs} });\n`;
  };

  javascriptGenerator.forBlock['airo_recognize_face'] = (block) => {
    const target = JSON.stringify(block.getFieldValue('TARGET') || 'family');
    const variable = getVariableCode(block, 'VARIABLE', 'faceName');
    return `${variable} = await runtime.recognizeFace(${target});\n`;
  };

  javascriptGenerator.forBlock['airo_call_function'] = (block) => {
    const functionName = JSON.stringify(block.getFieldValue('FUNCTION_NAME') || 'custom_function');
    const payload = getValueCode(block, 'PAYLOAD', "'{}'");
    return `await runtime.callFunction(${functionName}, ${payload});\n`;
  };

  javascriptGenerator.forBlock['airo_web_request'] = (block) => {
    const url = getValueCode(block, 'URL', "''");
    const method = JSON.stringify(block.getFieldValue('METHOD') || 'GET');
    const headers = getValueCode(block, 'HEADERS', "'{}'");
    const body = getValueCode(block, 'BODY', "''");
    const timeoutMs = getValueCode(block, 'TIMEOUT_MS', '12000');
    const responseType = JSON.stringify(block.getFieldValue('RESPONSE_TYPE') || 'json');
    const variable = getVariableCode(block, 'VARIABLE', 'webResult');
    return `${variable} = await runtime.webRequest({ url: ${url}, method: ${method}, headers: JSON.parse(${headers}), body: ${body}, timeoutMs: ${timeoutMs}, responseType: ${responseType} });\n`;
  };

  javascriptGenerator.forBlock['airo_run_javascript'] = (block) => {
    const code = getValueCode(block, 'CODE', "'return null;'");
    const variable = getVariableCode(block, 'VARIABLE', 'jsResult');
    return `${variable} = await runtime.runJavascript({ code: ${code}, vars: runtime.vars || {} });\n`;
  };

  javascriptGenerator.forBlock['airo_set_var'] = (block) => {
    const value = getValueCode(block, 'VALUE', "''");
    const variable = getVariableCode(block, 'VARIABLE', 'savedValue');
    return `${variable} = ${value};\n`;
  };

  javascriptGenerator.forBlock['airo_get_current_location'] = (block) => {
    const variable = getVariableCode(block, 'VARIABLE', 'currentLocation');
    return `${variable} = await runtime.getCurrentLocation();\n`;
  };

  javascriptGenerator.forBlock['airo_get_intent_input'] = (block) => {
    const variable = getVariableCode(block, 'VARIABLE', 'intentInput');
    return `${variable} = await runtime.getIntentInput();\n`;
  };

  javascriptGenerator.forBlock['airo_get_intent_text'] = (block) => {
    const variable = getVariableCode(block, 'VARIABLE', 'intentText');
    return `${variable} = await runtime.getIntentText();\n`;
  };

  javascriptGenerator.forBlock['airo_json_get_value'] = (block) => {
    const key = getValueCode(block, 'KEY', "''");
    const source = getValueCode(block, 'SOURCE', "'{}'");
    const variable = getVariableCode(block, 'VARIABLE', 'jsonValue');
    return `${variable} = await runtime.jsonGetValue({ source: ${source}, key: ${key} });\n`;
  };

  javascriptGenerator.forBlock['airo_json_get_keys'] = (block) => {
    const source = getValueCode(block, 'SOURCE', "'{}'");
    const variable = getVariableCode(block, 'VARIABLE', 'jsonKeys');
    return `${variable} = await runtime.jsonGetKeys({ source: ${source} });\n`;
  };

  javascriptGenerator.forBlock['airo_json_get_values'] = (block) => {
    const source = getValueCode(block, 'SOURCE', "'{}'");
    const variable = getVariableCode(block, 'VARIABLE', 'jsonValues');
    return `${variable} = await runtime.jsonGetValues({ source: ${source} });\n`;
  };

  javascriptGenerator.forBlock['airo_download_package'] = () => {
    return `await runtime.downloadPackage();\n`;
  };
};

ensureBlocklyBlocks();
ensureBlocklyGenerators();

const buildAirSkillPackage = (
  draft: AirSkillDraft,
  workspaceState: Blockly.serialization.workspaces.State,
  generatedCode: string,
  script: AirSkillScript
) => {
  return {
    format: 'airskill',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    skill: {
      id: draft.id,
      name: draft.name,
      description: draft.description,
      trigger: draft.trigger,
      eyeAnimations: draft.eyeAnimations,
      intentVariables: draft.intentVariables,
      workspaceState,
    },
    generatedCode,
    script,
    runtime: {
      language: 'airscript-1',
      voice: 'flowery-andrew',
      ttsBlock: 'airo_xai_say',
      supportsVariables: true,
    },
  };
};

export const createAirSkillPackageFromDraft = (draft: AirSkillDraft) => {
  const workspace = new Blockly.Workspace();
  try {
    if (draft.workspaceState) {
      Blockly.serialization.workspaces.load(draft.workspaceState, workspace);
    }
    const workspaceState = Blockly.serialization.workspaces.save(workspace);
    const compiledGeneratedCode = javascriptGenerator.workspaceToCode(workspace);
    const compiledScript = compileWorkspaceToAirScript(workspace);
    const hasCompiledSteps = compiledScript.entry.length > 0;
    const generatedCode = hasCompiledSteps ? compiledGeneratedCode : (draft.importedGeneratedCode || compiledGeneratedCode);
    const script = hasCompiledSteps ? compiledScript : (draft.importedScript || compiledScript);
    return buildAirSkillPackage(draft, workspaceState, generatedCode, script);
  } finally {
    workspace.dispose();
  }
};

const createAirSkillPackage = (
  draft: AirSkillDraft,
  workspace: Blockly.WorkspaceSvg
) => {
  const workspaceState = Blockly.serialization.workspaces.save(workspace);
  const compiledGeneratedCode = javascriptGenerator.workspaceToCode(workspace);
  const compiledScript = compileWorkspaceToAirScript(workspace);
  const hasCompiledSteps = compiledScript.entry.length > 0;
  const generatedCode = hasCompiledSteps ? compiledGeneratedCode : (draft.importedGeneratedCode || compiledGeneratedCode);
  const script = hasCompiledSteps ? compiledScript : (draft.importedScript || compiledScript);
  return buildAirSkillPackage(draft, workspaceState, generatedCode, script);
};

export const AiroSkillsBuilder: React.FC<{
  draft: AirSkillDraft;
  onChange: (draft: AirSkillDraft) => void;
  onUploadToStore?: (pkg: ReturnType<typeof createAirSkillPackageFromDraft>) => Promise<void> | void;
  onLivePackageChange?: (pkg: ReturnType<typeof createAirSkillPackageFromDraft>) => void;
}> = ({ draft, onChange, onUploadToStore, onLivePackageChange }) => {
  const blocklyRef = useRef<HTMLDivElement | null>(null);
  const eyePreviewRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const suppressChangeRef = useRef(false);
  const draftRef = useRef(draft);
  const onChangeRef = useRef(onChange);
  const lastLoadedStateRef = useRef<string | null>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [importText, setImportText] = useState('');
  const [importState, setImportState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [activeEyeAnimationId, setActiveEyeAnimationId] = useState('blink-soft');
  const [activeEyeFrameIndex, setActiveEyeFrameIndex] = useState(0);
  const [draggingEye, setDraggingEye] = useState<'left' | 'right' | null>(null);
  const [eyeEditMode, setEyeEditMode] = useState<'move' | 'stretch' | 'eye'>('move');
  const [linkEyes, setLinkEyes] = useState(false);
  const [draggingBezier, setDraggingBezier] = useState<{
    side: 'left' | 'right';
    pointIndex: number;
    kind: 'anchor' | 'in' | 'out';
  } | null>(null);

  const eyeAnimations = Array.isArray(draft.eyeAnimations) && draft.eyeAnimations.length
    ? draft.eyeAnimations
    : [createDefaultEyeAnimation()];
  const activeEyeAnimation = eyeAnimations.find((animation) => animation.id === activeEyeAnimationId) || eyeAnimations[0];
  const activeEyeFrame = activeEyeAnimation?.keyframes?.[activeEyeFrameIndex] || activeEyeAnimation?.keyframes?.[0];

  const llmExportText = useMemo(() => {
    try {
      return JSON.stringify(createAirSkillPackageFromDraft(draft), null, 2);
    } catch (error) {
      console.error('Failed to build live AirSkill export text', error);
      return '';
    }
  }, [draft]);

  const theme = useMemo(
    () =>
      Blockly.Theme.defineTheme('airoSkillsTheme', {
        base: Blockly.Themes.Zelos,
        componentStyles: {
          workspaceBackgroundColour: '#0c0f12',
          toolboxBackgroundColour: '#060708',
          toolboxForegroundColour: '#ffffff',
          flyoutBackgroundColour: '#101418',
          flyoutForegroundColour: '#ffffff',
          flyoutOpacity: 0.96,
          scrollbarColour: '#3f4b5b',
          insertionMarkerColour: '#34d399',
          insertionMarkerOpacity: 0.4,
        },
      }),
    []
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!eyeAnimations.some((animation) => animation.id === activeEyeAnimationId)) {
      setActiveEyeAnimationId(eyeAnimations[0]?.id || 'blink-soft');
      setActiveEyeFrameIndex(0);
    }
  }, [activeEyeAnimationId, eyeAnimations]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!blocklyRef.current || workspaceRef.current) return;

    const workspace = Blockly.inject(blocklyRef.current, {
      toolbox: toolboxDefinition,
      theme,
      renderer: 'zelos',
      grid: {
        spacing: 28,
        length: 3,
        colour: '#1f2937',
        snap: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        maxScale: 1.8,
        minScale: 0.4,
        scaleSpeed: 1.08,
      },
      move: {
        drag: true,
        wheel: true,
      },
      trashcan: true,
    });

    workspaceRef.current = workspace;

    if (draft.workspaceState) {
      suppressChangeRef.current = true;
      Blockly.serialization.workspaces.load(draft.workspaceState, workspace);
      lastLoadedStateRef.current = JSON.stringify(draft.workspaceState);
      suppressChangeRef.current = false;
    } else {
      const startBlock = workspace.newBlock('airo_skill_start');
      startBlock.initSvg();
      startBlock.render();
      startBlock.moveBy(48, 48);
      lastLoadedStateRef.current = JSON.stringify(
        Blockly.serialization.workspaces.save(workspace)
      );
    }

    const listener = () => {
      if (!workspaceRef.current || suppressChangeRef.current) return;
      const workspaceState = Blockly.serialization.workspaces.save(workspaceRef.current);
      lastLoadedStateRef.current = JSON.stringify(workspaceState);
      if (onLivePackageChange) {
        try {
          onLivePackageChange(createAirSkillPackage(draftRef.current, workspaceRef.current));
        } catch (error) {
          console.warn('Failed to emit live package', error);
        }
      }
      onChangeRef.current({
        ...draftRef.current,
        workspaceState,
      });
    };

    workspace.addChangeListener(listener);
    if (onLivePackageChange) {
      try {
        onLivePackageChange(createAirSkillPackage(draftRef.current, workspace));
      } catch (error) {
        console.warn('Failed to emit initial live package', error);
      }
    }
    window.setTimeout(() => Blockly.svgResize(workspace), 0);

    const handleResize = () => Blockly.svgResize(workspace);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !draft.workspaceState || suppressChangeRef.current) return;
    const serializedState = JSON.stringify(draft.workspaceState);
    if (serializedState === lastLoadedStateRef.current) return;
    suppressChangeRef.current = true;
    workspace.clear();
    Blockly.serialization.workspaces.load(draft.workspaceState, workspace);
    lastLoadedStateRef.current = serializedState;
    suppressChangeRef.current = false;
  }, [draft.workspaceState]);

  const updateMeta = (key: keyof AirSkillDraft, value: string) => {
    onChange({ ...draft, [key]: value });
  };

  const updateEyeAnimations = (next: EyeAnimationDefinition[]) => {
    onChange({ ...draft, eyeAnimations: next });
  };

  const updateActiveAnimation = (mutator: (current: EyeAnimationDefinition) => EyeAnimationDefinition) => {
    if (!activeEyeAnimation) return;
    const nextAnimations = eyeAnimations.map((animation) =>
      animation.id === activeEyeAnimation.id ? mutator(animation) : animation
    );
    updateEyeAnimations(nextAnimations);
  };

  const updateActiveFrame = (
    side: 'left' | 'right',
    key: keyof EyeMorphFrame['left'],
    value: number | string
  ) => {
    if (!activeEyeAnimation || !activeEyeFrame) return;
    updateActiveAnimation((animation) => ({
      ...animation,
      keyframes: animation.keyframes.map((frame, index) =>
        index !== activeEyeFrameIndex
          ? frame
          : {
              ...frame,
              [side]: {
                ...frame[side],
                [key]: (typeof value === 'number' ? value : String(value)) as any,
              },
            }
      ),
    }));
  };

  const updateActiveEye = (
    side: 'left' | 'right',
    patch: Partial<EyeMorphFrame['left']>,
    mirror = linkEyes
  ) => {
    if (!activeEyeAnimation || !activeEyeFrame) return;
    updateActiveAnimation((animation) => ({
      ...animation,
      keyframes: animation.keyframes.map((frame, index) =>
        index !== activeEyeFrameIndex
          ? frame
          : {
              ...frame,
              [side]: {
                ...frame[side],
                ...patch,
              },
              ...(mirror
                ? {
                    [side === 'left' ? 'right' : 'left']: {
                      ...frame[side === 'left' ? 'right' : 'left'],
                      ...patch,
                    },
                  }
                : {}),
            }
      ),
    }));
  };

  const addKeyframe = () => {
    if (!activeEyeAnimation || !activeEyeFrame) return;
    const nextAt = clamp(
      Number((activeEyeAnimation.keyframes[activeEyeAnimation.keyframes.length - 1]?.at ?? 0) + 0.15),
      0,
      1
    );
    const cloned: EyeMorphFrame = {
      at: nextAt,
      left: { ...activeEyeFrame.left },
      right: { ...activeEyeFrame.right },
    };
    updateActiveAnimation((animation) => {
      const next = [...animation.keyframes, cloned].sort((a, b) => a.at - b.at);
      return { ...animation, keyframes: next };
    });
    setActiveEyeFrameIndex(activeEyeAnimation.keyframes.length);
  };

  const deleteKeyframe = () => {
    if (!activeEyeAnimation || activeEyeAnimation.keyframes.length <= 1) return;
    updateActiveAnimation((animation) => {
      const next = animation.keyframes.filter((_, index) => index !== activeEyeFrameIndex);
      return { ...animation, keyframes: next };
    });
    setActiveEyeFrameIndex((prev) => Math.max(0, prev - 1));
  };

  const resetCurrentKeyframe = () => {
    if (!activeEyeAnimation || !activeEyeFrame) return;
    const defaults = createDefaultEyeAnimation().keyframes;
    const base = defaults[Math.min(activeEyeFrameIndex, defaults.length - 1)] || defaults[0];
    updateActiveAnimation((animation) => ({
      ...animation,
      keyframes: animation.keyframes.map((frame, index) =>
        index !== activeEyeFrameIndex
          ? frame
          : {
              ...frame,
              left: { ...base.left },
              right: { ...base.right },
            }
      ),
    }));
  };

  const addNewEyeAnimation = () => {
    const candidate = `anim-${Date.now()}`;
    const created: EyeAnimationDefinition = {
      ...createDefaultEyeAnimation(),
      id: candidate,
      name: `Animation ${eyeAnimations.length + 1}`,
    };
    const next = [...eyeAnimations, created];
    updateEyeAnimations(next);
    setActiveEyeAnimationId(created.id);
    setActiveEyeFrameIndex(0);
  };

  const moveDraggedEye = (clientX: number, clientY: number) => {
    if (!draggingEye || !eyePreviewRef.current || !activeEyeFrame) return;
    const rect = eyePreviewRef.current.getBoundingClientRect();
    const x = clamp(((clientX - rect.left) / rect.width) * 100, 4, 96);
    const y = clamp(((clientY - rect.top) / rect.height) * 100, 8, 92);
    updateActiveEye(draggingEye, { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) }, linkEyes);
  };

  const stretchDraggedEye = (clientX: number, clientY: number) => {
    if (!draggingBezier || !eyePreviewRef.current || !activeEyeFrame) return;
    const rect = eyePreviewRef.current.getBoundingClientRect();
    const eye = activeEyeFrame[draggingBezier.side];
    const shape = eye.shape || createDefaultEyeShape();
    const point = shape.points[draggingBezier.pointIndex];
    if (!point) return;
    const centerX = rect.left + (eye.x / 100) * rect.width;
    const centerY = rect.top + (eye.y / 100) * rect.height;
    const eyeLeft = centerX - eye.width / 2;
    const eyeTop = centerY - eye.height / 2;
    const localX = (clientX - eyeLeft) / eye.width;
    const localY = (clientY - eyeTop) / eye.height;

    const nextShape = {
      points: shape.points.map((p, idx) => {
        if (idx !== draggingBezier.pointIndex) return { ...p };
        if (draggingBezier.kind === 'anchor') {
          return {
            ...p,
            x: clamp(localX, 0, 1),
            y: clamp(localY, 0, 1),
          };
        }
        if (draggingBezier.kind === 'in') {
          return {
            ...p,
            inX: clamp(localX - p.x, -1.2, 1.2),
            inY: clamp(localY - p.y, -1.2, 1.2),
          };
        }
        return {
          ...p,
          outX: clamp(localX - p.x, -1.2, 1.2),
          outY: clamp(localY - p.y, -1.2, 1.2),
        };
      }),
    };

    updateActiveEye(draggingBezier.side, {
      shape: nextShape,
    }, linkEyes);
  };

  useEffect(() => {
    if (!draggingEye && !draggingBezier) return;
    const onMouseMove = (event: MouseEvent) => {
      if (draggingEye) moveDraggedEye(event.clientX, event.clientY);
      if (draggingBezier) stretchDraggedEye(event.clientX, event.clientY);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches[0]) {
        if (draggingEye) moveDraggedEye(event.touches[0].clientX, event.touches[0].clientY);
        if (draggingBezier) stretchDraggedEye(event.touches[0].clientX, event.touches[0].clientY);
      }
    };
    const clear = () => {
      setDraggingEye(null);
      setDraggingBezier(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', clear);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', clear);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', clear);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', clear);
    };
  }, [draggingEye, draggingBezier, activeEyeFrame]);

  const downloadPackage = () => {
    if (!workspaceRef.current) return;
    const packagePayload = createAirSkillPackage(draft, workspaceRef.current);
    const blob = new Blob([JSON.stringify(packagePayload, null, 2)], {
      type: 'application/json',
    });
    const filenameBase =
      draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'airo-skill';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filenameBase}.airskill`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const uploadPackage = async () => {
    if (!onUploadToStore) return;
    try {
      setUploadState('uploading');
      const packagePayload = workspaceRef.current
        ? createAirSkillPackage(draft, workspaceRef.current)
        : createAirSkillPackageFromDraft(draft);
      await onUploadToStore(packagePayload);
      setUploadState('uploaded');
      window.setTimeout(() => setUploadState('idle'), 1800);
    } catch (error) {
      console.error('Failed to upload skill to store', error);
      setUploadState('error');
      window.setTimeout(() => setUploadState('idle'), 2400);
    }
  };

  const importGeneratedSkillText = () => {
    const raw = importText.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const importedScript = parsed?.script || null;
      const derivedWorkspaceState =
        parsed?.skill?.workspaceState || createWorkspaceStateFromScript(importedScript) || draft.workspaceState;
      const nextDraft: AirSkillDraft = {
        id: parsed?.skill?.id || draft.id,
        name: parsed?.skill?.name || draft.name,
        description: parsed?.skill?.description || draft.description,
        trigger: parsed?.skill?.trigger || draft.trigger,
        workspaceState: derivedWorkspaceState,
        eyeAnimations: Array.isArray(parsed?.skill?.eyeAnimations) ? parsed.skill.eyeAnimations : (draft.eyeAnimations || []),
        intentVariables: Array.isArray(parsed?.skill?.intentVariables)
          ? parsed.skill.intentVariables
              .filter((row: any) => row && typeof row === 'object')
              .map((row: any) => ({
                name: String(row.name || '').trim(),
                required: Boolean(row.required),
                description: String(row.description || ''),
              }))
              .filter((row: IntentVariableDefinition) => Boolean(row.name))
          : (draft.intentVariables || []),
        importedScript,
        importedGeneratedCode: parsed?.generatedCode || '',
      };
      onChange(nextDraft);
      setImportState('ok');
      window.setTimeout(() => setImportState('idle'), 1800);
    } catch (error) {
      console.error('Failed to import AirSkill text', error);
      setImportState('error');
      window.setTimeout(() => setImportState('idle'), 2200);
    }
  };

  const copyLiveLlmText = async () => {
    try {
      await navigator.clipboard.writeText(llmExportText || '');
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch (error) {
      console.error('Failed to copy LLM export text', error);
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1800);
    }
  };

  const getEyeRender = (
    eye: EyeMorphFrame['left'],
    idPrefix: string
  ): { fill: string; defs: React.ReactNode } => {
    const mode = eye.fillMode || 'color';
    if (mode === 'media' && eye.mediaUrl) {
      const patternId = `${idPrefix}-media`;
      return {
        fill: `url(#${patternId})`,
        defs: (
          <pattern id={patternId} patternUnits="objectBoundingBox" width="1" height="1">
            <image href={eye.mediaUrl} x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ),
      };
    }
    if (mode === 'gradient') {
      const gradientId = `${idPrefix}-grad`;
      return {
        fill: `url(#${gradientId})`,
        defs: (
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={eye.gradientFrom || eye.color || '#ffffff'} />
            <stop offset="100%" stopColor={eye.gradientTo || '#7dd3fc'} />
          </linearGradient>
        ),
      };
    }
    return {
      fill: eye.color || '#ffffff',
      defs: null,
    };
  };

  return (
    <div className="w-full rounded-[2rem] border border-white/15 bg-black/90 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.45)] sm:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Airo Skills</div>
          <div className="mt-2 text-sm text-white/55">
            Blockly workspace with variables, reusable robot blocks, xAI prompt blocks, and `.airskill` export.
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {onUploadToStore && (
            <button
              onClick={() => { void uploadPackage(); }}
              className="rounded-full bg-sky-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black shadow-[0_20px_40px_rgba(56,189,248,0.24)]"
            >
              {uploadState === 'uploading' ? 'Uploading...' : uploadState === 'uploaded' ? 'Uploaded' : uploadState === 'error' ? 'Upload Failed' : 'Upload To Skill Store'}
            </button>
          )}
          <button
            onClick={downloadPackage}
            className="rounded-full bg-emerald-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black shadow-[0_20px_40px_rgba(16,185,129,0.22)]"
          >
            Download AirOS Package
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <input
          value={draft.name}
          onChange={(event) => updateMeta('name', event.target.value)}
          className={inputClassName}
          placeholder="Skill Name"
        />
        <select
          value={draft.trigger}
          onChange={(event) => updateMeta('trigger', event.target.value)}
          className={inputClassName}
        >
          <option value="voice">Voice Trigger</option>
          <option value="menu">Menu Launch</option>
          <option value="face">Face Match</option>
          <option value="photo">Photo Event</option>
        </select>
        <input
          value={draft.description}
          onChange={(event) => updateMeta('description', event.target.value)}
          className={inputClassName}
          placeholder="What does this skill do?"
        />
      </div>

      <div className="mb-5 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.28em] text-white/55">Intent Variables</div>
            <div className="mt-1 text-xs text-white/60">
              Define variables the intent model should fill for this skill.
            </div>
          </div>
          <button
            onClick={() =>
              onChange({
                ...draft,
                intentVariables: [...(draft.intentVariables || []), { name: 'query', required: false, description: 'Main user phrase' }],
              })
            }
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/80"
          >
            Add Variable
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {(draft.intentVariables || []).map((item, index) => (
            <div key={`${item.name}-${index}`} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_auto_1.5fr_auto]">
              <input
                value={item.name}
                onChange={(event) => {
                  const next = [...(draft.intentVariables || [])];
                  next[index] = { ...next[index], name: event.target.value.trim() };
                  onChange({ ...draft, intentVariables: next });
                }}
                className={inputClassName}
                placeholder="variableName"
              />
              <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 font-mono text-xs text-white/75">
                <input
                  type="checkbox"
                  checked={Boolean(item.required)}
                  onChange={(event) => {
                    const next = [...(draft.intentVariables || [])];
                    next[index] = { ...next[index], required: event.target.checked };
                    onChange({ ...draft, intentVariables: next });
                  }}
                />
                Required
              </label>
              <input
                value={item.description}
                onChange={(event) => {
                  const next = [...(draft.intentVariables || [])];
                  next[index] = { ...next[index], description: event.target.value };
                  onChange({ ...draft, intentVariables: next });
                }}
                className={inputClassName}
                placeholder="description"
              />
              <button
                onClick={() => {
                  const next = [...(draft.intentVariables || [])];
                  next.splice(index, 1);
                  onChange({ ...draft, intentVariables: next });
                }}
                className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-red-200"
              >
                Remove
              </button>
            </div>
          ))}
          {!draft.intentVariables?.length && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/45">
              No intent variables defined.
            </div>
          )}
        </div>
      </div>

      <div className="mb-5 rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">LLM Import</div>
            <div className="mt-2 text-sm text-white/60">
              Paste a generated `.airskill` package here. If it includes skill metadata and workspace state, the builder
              will load it directly.
            </div>
          </div>
          <button
            onClick={importGeneratedSkillText}
            className="rounded-full bg-cyan-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black shadow-[0_20px_40px_rgba(34,211,238,0.2)]"
          >
            {importState === 'ok' ? 'Imported' : importState === 'error' ? 'Import Failed' : 'Import Text'}
          </button>
        </div>
        <textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          className="mt-4 h-44 w-full rounded-[1.25rem] border border-white/10 bg-[#0b0f14] px-4 py-4 font-mono text-xs text-white/85 outline-none transition focus:border-cyan-400/50"
          placeholder='{"format":"airskill","version":"2.0.0","skill":{"id":"skill-demo","name":"Demo","description":"Example skill","trigger":"voice","workspaceState":{}},"script":{"language":"airscript-1","entry":[{"action":"say","text":"Hello."}]}}'
        />
      </div>

      <div className="mb-5 rounded-[1.6rem] border border-emerald-300/20 bg-emerald-400/[0.05] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-emerald-200/70">Live LLM Text</div>
            <div className="mt-2 text-sm text-white/60">
              This JSON auto-updates when you change blocks or skill metadata. Copy and paste it directly.
            </div>
          </div>
          <button
            onClick={() => { void copyLiveLlmText(); }}
            className="rounded-full bg-emerald-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black shadow-[0_20px_40px_rgba(16,185,129,0.2)]"
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy Failed' : 'Copy LLM Text'}
          </button>
        </div>
        <textarea
          value={llmExportText}
          readOnly
          className="mt-4 h-60 w-full rounded-[1.25rem] border border-emerald-300/20 bg-[#07110d] px-4 py-4 font-mono text-xs text-emerald-100/90 outline-none"
        />
      </div>

      <div className="mb-5 rounded-[1.6rem] border border-violet-300/20 bg-violet-400/[0.05] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-violet-200/70">Eye Editor</div>
            <div className="mt-2 text-sm text-white/60">
              3 modes: Move, Stretch, Eye style. Build multi-keyframe eye animations and run with `run eye animation`.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={activeEyeAnimation?.id || ''}
              onChange={(event) => {
                setActiveEyeAnimationId(event.target.value);
                setActiveEyeFrameIndex(0);
              }}
              className="rounded-xl border border-white/12 bg-slate-900 px-3 py-2 font-mono text-xs text-white"
            >
              {eyeAnimations.map((animation) => (
                <option key={animation.id} value={animation.id}>
                  {animation.name} ({animation.id})
                </option>
              ))}
            </select>
            <button
              onClick={addNewEyeAnimation}
              className="rounded-xl bg-violet-400 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-black"
            >
              Add Animation
            </button>
          </div>
        </div>

        {activeEyeAnimation && activeEyeFrame ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-white/10 bg-black/70 p-4">
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <input
                  value={activeEyeAnimation.name}
                  onChange={(event) =>
                    updateActiveAnimation((animation) => ({ ...animation, name: event.target.value }))
                  }
                  className={inputClassName}
                  placeholder="Animation Name"
                />
                <input
                  value={activeEyeAnimation.id}
                  onChange={(event) =>
                    updateActiveAnimation((animation) => ({
                      ...animation,
                      id: event.target.value.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-'),
                    }))
                  }
                  className={inputClassName}
                  placeholder="animation-id"
                />
                <input
                  type="number"
                  value={activeEyeAnimation.durationMs}
                  onChange={(event) =>
                    updateActiveAnimation((animation) => ({
                      ...animation,
                      durationMs: Math.max(100, Number(event.target.value) || 1200),
                    }))
                  }
                  className={inputClassName}
                  placeholder="Duration ms"
                />
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {(['move', 'stretch', 'eye'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setEyeEditMode(mode)}
                    className={`rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] ${
                      eyeEditMode === mode
                        ? 'bg-violet-400 text-black'
                        : 'border border-white/15 bg-black/40 text-white/80'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
                <button
                  onClick={() => setLinkEyes((value) => !value)}
                  className={`rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] ${
                    linkEyes
                      ? 'bg-cyan-400 text-black'
                      : 'border border-white/15 bg-black/40 text-white/80'
                  }`}
                >
                  {linkEyes ? 'Link Eyes: On' : 'Link Eyes: Off'}
                </button>
              </div>
              <div
                ref={eyePreviewRef}
                className="relative h-56 w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
              >
                <div
                  className="absolute inset-x-0 top-3 text-center font-mono text-[10px] uppercase tracking-[0.35em] text-white/45"
                >
                  {eyeEditMode === 'move' ? 'Drag eyes to pose this keyframe' : eyeEditMode === 'stretch' ? 'Drag blue points to stretch/squish' : 'Edit eye fill style'}
                </div>
                {(['left', 'right'] as const).map((side) => {
                  const eye = activeEyeFrame[side];
                  const shape = eye.shape || createDefaultEyeShape();
                  const render = getEyeRender(eye, `${activeEyeAnimation.id}-${activeEyeFrameIndex}-${side}`);
                  return (
                    <button
                      key={side}
                      type="button"
                      onMouseDown={() => eyeEditMode === 'move' && setDraggingEye(side)}
                      onTouchStart={() => eyeEditMode === 'move' && setDraggingEye(side)}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-black/40 p-[4px] shadow-[0_0_22px_rgba(255,255,255,0.4)]"
                      style={{
                        left: `${eye.x}%`,
                        top: `${eye.y}%`,
                        width: `${eye.width}px`,
                        height: `${eye.height}px`,
                        transform: `translate(-50%, -50%) rotate(${eye.rotateDeg}deg)`,
                        cursor: eyeEditMode === 'move' ? 'move' : 'default',
                      }}
                    >
                      <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${eye.width} ${eye.height}`}>
                        <defs>{render.defs}</defs>
                        <path
                          d={eyeToPathD(eye) || ''}
                          fill={render.fill}
                          style={{ filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.5))' }}
                        />
                        {eyeEditMode === 'stretch'
                          ? shape.points.map((point, index) => {
                              const ax = point.x * eye.width;
                              const ay = point.y * eye.height;
                              const inX = (point.x + point.inX) * eye.width;
                              const inY = (point.y + point.inY) * eye.height;
                              const outX = (point.x + point.outX) * eye.width;
                              const outY = (point.y + point.outY) * eye.height;
                              return (
                                <g key={`${side}-bezier-${index}`}>
                                  <line x1={ax} y1={ay} x2={inX} y2={inY} stroke="#38bdf8" strokeWidth="1.5" />
                                  <line x1={ax} y1={ay} x2={outX} y2={outY} stroke="#38bdf8" strokeWidth="1.5" />
                                  <circle
                                    cx={inX}
                                    cy={inY}
                                    r={4}
                                    fill="#7dd3fc"
                                    stroke="#0ea5e9"
                                    strokeWidth="2"
                                    onMouseDown={(event) => {
                                      event.stopPropagation();
                                      setDraggingBezier({ side, pointIndex: index, kind: 'in' });
                                    }}
                                    onTouchStart={(event) => {
                                      event.stopPropagation();
                                      setDraggingBezier({ side, pointIndex: index, kind: 'in' });
                                    }}
                                  />
                                  <circle
                                    cx={outX}
                                    cy={outY}
                                    r={4}
                                    fill="#7dd3fc"
                                    stroke="#0ea5e9"
                                    strokeWidth="2"
                                    onMouseDown={(event) => {
                                      event.stopPropagation();
                                      setDraggingBezier({ side, pointIndex: index, kind: 'out' });
                                    }}
                                    onTouchStart={(event) => {
                                      event.stopPropagation();
                                      setDraggingBezier({ side, pointIndex: index, kind: 'out' });
                                    }}
                                  />
                                  <circle
                                    cx={ax}
                                    cy={ay}
                                    r={5}
                                    fill="#0ea5e9"
                                    stroke="#7dd3fc"
                                    strokeWidth="2"
                                    onMouseDown={(event) => {
                                      event.stopPropagation();
                                      setDraggingBezier({ side, pointIndex: index, kind: 'anchor' });
                                    }}
                                    onTouchStart={(event) => {
                                      event.stopPropagation();
                                      setDraggingBezier({ side, pointIndex: index, kind: 'anchor' });
                                    }}
                                  />
                                </g>
                              );
                            })
                          : null}
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-white/55">Keyframes</div>
                <div className="flex gap-2">
                  <button onClick={addKeyframe} className="rounded-lg bg-emerald-400 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-black">
                    Add Frame
                  </button>
                  <button onClick={resetCurrentKeyframe} className="rounded-lg bg-amber-400 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-black">
                    Reset Frame
                  </button>
                  <button onClick={deleteKeyframe} className="rounded-lg border border-white/20 bg-black/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white">
                    Delete
                  </button>
                </div>
              </div>
              <div className="mb-3 flex items-center gap-2">
                <select
                  value={activeEyeFrameIndex}
                  onChange={(event) => setActiveEyeFrameIndex(Number(event.target.value) || 0)}
                  className="w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-2 font-mono text-xs text-white"
                >
                  {activeEyeAnimation.keyframes.map((frame, index) => (
                    <option key={`${activeEyeAnimation.id}-${index}`} value={index}>
                      {`Frame ${index + 1} @ ${frame.at.toFixed(2)}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Position</div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={activeEyeFrame.at}
                  onChange={(event) =>
                    updateActiveAnimation((animation) => ({
                      ...animation,
                      keyframes: animation.keyframes.map((frame, index) =>
                        index === activeEyeFrameIndex ? { ...frame, at: clamp(Number(event.target.value), 0, 1) } : frame
                      ),
                    }))
                  }
                  className="w-full"
                />
              </div>
              {(['left', 'right'] as const).map((side) => (
                <div key={side} className="mb-3 rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">{side} eye</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={activeEyeFrame[side].width}
                      onChange={(event) => updateActiveFrame(side, 'width', clamp(Number(event.target.value) || 0, 24, 240))}
                      className={inputClassName}
                      placeholder="Width px"
                    />
                    <input
                      type="number"
                      value={activeEyeFrame[side].height}
                      onChange={(event) => updateActiveFrame(side, 'height', clamp(Number(event.target.value) || 0, 20, 240))}
                      className={inputClassName}
                      placeholder="Height px"
                    />
                    <input
                      type="number"
                      value={activeEyeFrame[side].roundness}
                      onChange={(event) => updateActiveFrame(side, 'roundness', clamp(Number(event.target.value) || 0, 0, 120))}
                      className={inputClassName}
                      placeholder="Roundness"
                    />
                    <input
                      type="number"
                      value={activeEyeFrame[side].rotateDeg}
                      onChange={(event) => updateActiveFrame(side, 'rotateDeg', clamp(Number(event.target.value) || 0, -180, 180))}
                      className={inputClassName}
                      placeholder="Rotation"
                    />
                    <input
                      type="color"
                      value={activeEyeFrame[side].color}
                      onChange={(event) => updateActiveFrame(side, 'color', event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/5"
                    />
                    <select
                      value={activeEyeFrame[side].fillMode || 'color'}
                      onChange={(event) =>
                        updateActiveFrame(
                          side,
                          'fillMode',
                          event.target.value as 'color' | 'gradient' | 'media'
                        )
                      }
                      className={inputClassName}
                    >
                      <option value="color">Color</option>
                      <option value="gradient">Gradient</option>
                      <option value="media">Icon / GIF</option>
                    </select>
                    {(activeEyeFrame[side].fillMode || 'color') === 'gradient' ? (
                      <>
                        <input
                          type="color"
                          value={activeEyeFrame[side].gradientFrom || '#ffffff'}
                          onChange={(event) => updateActiveFrame(side, 'gradientFrom', event.target.value)}
                          className="h-11 w-full rounded-xl border border-white/10 bg-white/5"
                        />
                        <input
                          type="color"
                          value={activeEyeFrame[side].gradientTo || '#7dd3fc'}
                          onChange={(event) => updateActiveFrame(side, 'gradientTo', event.target.value)}
                          className="h-11 w-full rounded-xl border border-white/10 bg-white/5"
                        />
                      </>
                    ) : null}
                    {(activeEyeFrame[side].fillMode || 'color') === 'media' ? (
                      <input
                        type="text"
                        value={activeEyeFrame[side].mediaUrl || ''}
                        onChange={(event) => updateActiveFrame(side, 'mediaUrl', event.target.value)}
                        className="col-span-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-white placeholder:text-white/25 outline-none"
                        placeholder="https://... icon.png or gif"
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mb-4 grid gap-3 text-xs text-white/45 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          `xAI Say`
          <div className="mt-1">Use `say with xAI voice` to speak lines directly in a skill.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          `Variables`
          <div className="mt-1">Store xAI responses, face names, and text between blocks using Blockly variables.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          `Export`
          <div className="mt-1">The exported `.airskill` file contains workspace JSON, generated JavaScript, and the new scripted runtime format.</div>
        </div>
      </div>

      <div className={workspaceContainerClass}>
        <div ref={blocklyRef} className="h-full w-full" />
      </div>
    </div>
  );
};
