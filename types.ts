export enum AppState {
  IDLE = 'IDLE', // Listening for wake word
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE', // Connected to Gemini
  ERROR = 'ERROR'
}

export enum EyeState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING', // User is speaking (Rainbow)
  SPEAKING = 'SPEAKING', // AI is speaking (Blue)
  THINKING = 'THINKING', // Processing (maybe Pulse)
}

export interface AudioConfig {
  sampleRate: number;
}

export type VisualType = 'image' | 'widget' | 'predefined' | 'none';

export interface VisualContent {
  type: VisualType;
  content: any; // URL for image, HTML source for widget, or data object for predefined
  component?: 'timer' | 'settings' | 'confirmation';
  title?: string;
}