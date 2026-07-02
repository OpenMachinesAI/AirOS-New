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
  REMOTE_VIEW = 'REMOTE_VIEW', // Remote debugging active (Green)
  SLEEPING = 'SLEEPING', // Sleeping mode
}

export interface AudioConfig {
  sampleRate: number;
}

export type VisualType = 'image' | 'widget' | 'predefined' | 'none';

export interface VisualContent {
  type: VisualType;
  content: any; // URL for image, HTML source for widget, or data object for predefined
  component?: 'timer' | 'settings' | 'confirmation' | 'math' | 'time' | 'date' | 'news' | 'weather' | 'music_player' | 'airo_image' | 'photo_preview' | 'volume' | 'face_onboarding' | 'battery' | 'dice';
  title?: string;
  highlightedIndex?: number;
  isError?: boolean;
}

export enum ErrorLevel {
  RED = 'RED',
  BLUE = 'BLUE',
  GREEN = 'GREEN'
}

export interface AiroError {
  level: ErrorLevel;
  message: string;
  details?: string;
  timestamp: number;
}
