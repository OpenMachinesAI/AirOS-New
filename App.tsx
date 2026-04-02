
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eyes } from './components/Eyes';
import { VisualDisplay } from './components/VisualDisplay';
import { PersistentMusicController } from './components/PredefinedWidgets';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useBackgroundVisionTracker } from './hooks/useBackgroundVisionTracker';
import type { VisionTarget } from './hooks/useBackgroundVisionTracker';
import { useDeviceHeading } from './hooks/useDeviceHeading';
import { useUnlockedLoopingAudio } from './hooks/useUnlockedLoopingAudio';
import { WakeWordDetector } from './services/wakeWord';
import { compareFaceObservationsToFamily, type FamilyMemberRecord } from './services/familyRecognition';
import {
  buildFamilyMemoryCombinedText,
  createFamilyMemoryEntry,
  formatRelevantFamilyMemories,
  mergeFamilyMemoryEntries,
  normalizeFamilyMemoryEntries,
  searchFamilyMemories,
} from './services/familyMemory';
import { arrayBufferToBase64, base64ToUint8Array, decodeAudioData } from './services/audioUtils';
import {
  BUNDLED_AIRO_SKILLS,
  BUILDER_SKILL_STORAGE_KEY,
  INSTALLED_SKILL_IDS_STORAGE_KEY,
  SKILL_STORE_PATH,
  mergeSkillLists,
  skillPackageToInstalledSkill,
  type InstalledAiroSkill,
} from './skills/skillStore';
import { executeAirSkillScript } from './skills/airSkillScript';
import { AppState, EyeState } from './types';
import { Ollie } from './utils/ollie';
import { NativeOllie } from './utils/nativeOllie';
import { DockMobilityController, type MobilityMotorDirection, type RobotMobilityController } from './utils/robotMobility';

const APP_VERSION = '0.0.44';
const FAMILY_BACKUP_FORMAT = 'airo-family-backup';
const SLEEP_INACTIVITY_MS = 20 * 60 * 1000;
const STORAGE_KEYS = {
  movementEnabled: 'airo.movementEnabled',
  motorSpeedScale: 'airo.motorSpeedScale',
  motorBoostMultiplier: 'airo.motorBoostMultiplier',
  motorSide: 'airo.motorSide',
  assistantMuted: 'airo.assistantMuted',
  developerMode: 'airo.developerMode',
  familyMembers: 'airo.familyMembers',
  galleryPhotos: 'airo.galleryPhotos',
  installedSkillIds: INSTALLED_SKILL_IDS_STORAGE_KEY,
  backendClientId: 'airo.backendClientId',
  intentOutputContract: 'airo.intentOutputContract',
  pairingCode: 'airo.pairingCode',
} as const;
const BASE_MENU_ITEMS = [
  { id: 'developer', label: 'Developer Mode', enabled: true, emoji: '🧪', color: '#06b6d4' },
  { id: 'mute', label: 'Mute Airo', enabled: true, emoji: '🔇', color: '#ef4444' },
  { id: 'motor', label: 'Motor Preferences', enabled: true, emoji: '⚙️', color: '#3b82f6' },
  { id: 'family', label: 'Family', enabled: true, emoji: '👨‍👩‍👧‍👦', color: '#f59e0b' },
  { id: 'gallery', label: 'Gallery', enabled: true, emoji: '📸', color: '#8b5cf6' },
  { id: 'skill-store', label: 'Skill Store', enabled: true, emoji: '🧩', color: '#10b981' },
  { id: 'mobile-app', label: 'Mobile App', enabled: true, emoji: '📱', color: '#38bdf8' },
] as const;
type BaseMenuItemId = typeof BASE_MENU_ITEMS[number]['id'];
type DynamicMenuItem = {
  id: string;
  label: string;
  enabled: boolean;
  emoji: string;
  color: string;
  kind?: 'base' | 'skill';
  toolName?: string;
  description?: string;
};
type MenuItemId = string;
type MenuPanel = 'carousel' | 'developer' | 'mute' | 'motor' | 'family' | 'gallery' | 'skill-store' | 'mobile-app';
type MotorSide = 'left' | 'right';
type RobotModel = 'AR-10' | 'AR-20' | 'Airo C';
type SessionMode = 'default' | 'family-onboarding';
type FamilyCaptureDebug = {
  source: 'front' | 'rear' | 'unknown';
  status: string;
  preview: string | null;
};
type FamilyEnrollmentDraft = {
  name: string;
  birthday: string;
  notes: string;
  photos: {
      left: string | null;
      center: string | null;
      right: string | null;
  };
};
type FamilyIntroStep =
  | 'idle'
  | 'ask-name'
  | 'capture-left'
  | 'capture-right'
  | 'capture-center'
  | 'ask-birthday'
  | 'ask-notes'
  | 'saving'
  | 'complete';
type FamilyIntroFlowState = {
  active: boolean;
  step: FamilyIntroStep;
  name: string;
  birthday: string;
  notes: string;
  status: string;
};
type GalleryPhotoRecord = {
  id: string;
  photoDataUrl: string;
  source: 'front' | 'rear';
  takenAt: number;
};
const FAMILY_CAPTURE_SEQUENCE = [
  { key: 'left', label: 'Left', prompt: 'Turn slightly left' },
  { key: 'center', label: 'Front', prompt: 'Look straight ahead' },
  { key: 'right', label: 'Right', prompt: 'Turn slightly right' },
] as const;
const FAMILY_INTRO_CAPTURE_SEQUENCE = [
  { key: 'left', label: 'Left', prompt: 'Turn your head to the left' },
  { key: 'right', label: 'Right', prompt: 'Turn your head to the right' },
  { key: 'center', label: 'Center', prompt: 'Look straight ahead' },
] as const;
const PHOTO_FLOW_PREWARM_LINES = [
  '3',
  '2',
  '1',
  'Taking a photo.',
  'Hold still, I am lining up the shot.',
  'Here is the photo.',
  'I got one. Here is the shot.',
  'Sorry, something went wrong.',
  'That photo did not work out.',
  'Want me to try again? Say yes or no.',
  'Do you want me to save it? Say yes or no.',
  'Okay, I will stop the photo flow.',
  'Okay, I will leave that one unsaved.',
  'Okay, let me take another one.',
  'Do you want me to take another photo? Say yes or no.',
  'Photo saved.',
] as const;
const UNKNOWN_PERSON_PROACTIVE_PROMPTS = [
  'You have noticed a person in the room, but you do not know who they are yet. Give one short warm greeting and one tiny playful line. Do not ask for setup or identification unless they respond first.',
  'You have noticed someone nearby. Say one short friendly hello, then share one quick fun fact in Airo style. Keep it under two sentences.',
  'You have noticed a person in the room. Offer one gentle, friendly line that makes Airo feel socially present, then ask a very short question like how their day is going.',
  'You have noticed someone nearby. Say one brief welcoming line and one curious robot observation about people or the room. Keep it natural and short.',
] as const;
type PhotoCaptureOverlay = {
  active: boolean;
  phase: 'icon' | 'live' | 'captured';
  countdown: number;
  source: 'front' | 'rear';
  preview: string | null;
  status: string;
  flash: boolean;
};
type PendingPhotoDecision = {
  mode: 'save' | 'retake' | 'retry';
  photo?: GalleryPhotoRecord;
};
type DeveloperVisionPreview = {
  front: string | null;
  rear: string | null;
};
type RecognizedProfileOverlay = {
  visible: boolean;
  name: string;
  photoDataUrl: string | null;
};
type GalleryPhotoActionMenu = {
  visible: boolean;
  photoId: string | null;
  photoDataUrl: string | null;
};
type WeatherInfoOverlay = {
  visible: boolean;
  title: string;
  location: string;
  temperatureText: string;
  detailText: string;
  mediaUrl: string | null;
};
type SkillStorePayload = {
  skills?: InstalledAiroSkill[];
};

export default function App() {
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE_ID = 'Achird';
  const CAMERA_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/6979/6979603.png';
  const IMPORTED_GEMINI_PROMPT_FILES: Record<string, string> = {
      countdown_1: '/audio/gemini-photo/countdown_1.wav',
      countdown_2: '/audio/gemini-photo/countdown_2.wav',
      countdown_3: '/audio/gemini-photo/countdown_3.wav',
      countdown_4: '/audio/gemini-photo/countdown_4.wav',
      countdown_5: '/audio/gemini-photo/countdown_5.wav',
      countdown_6: '/audio/gemini-photo/countdown_6.wav',
      countdown_7: '/audio/gemini-photo/countdown_7.wav',
      countdown_8: '/audio/gemini-photo/countdown_8.wav',
      countdown_9: '/audio/gemini-photo/countdown_9.wav',
      countdown_10: '/audio/gemini-photo/countdown_10.wav',
      taking_a_photo: '/audio/gemini-photo/taking_a_photo.wav',
      best_cameraman: '/audio/gemini-photo/best_cameraman.wav',
      hold_still: '/audio/gemini-photo/hold_still.wav',
      here_is_photo: '/audio/gemini-photo/here_is_photo.wav',
      i_got_one: '/audio/gemini-photo/i_got_one.wav',
      something_went_wrong: '/audio/gemini-photo/something_went_wrong.wav',
      photo_did_not_work_out: '/audio/gemini-photo/photo_did_not_work_out.wav',
      try_again_yes_no: '/audio/gemini-photo/try_again_yes_no.wav',
      save_it_yes_no: '/audio/gemini-photo/save_it_yes_no.wav',
      stop_photo_flow: '/audio/gemini-photo/stop_photo_flow.wav',
      leave_unsaved: '/audio/gemini-photo/leave_unsaved.wav',
      take_another_one: '/audio/gemini-photo/take_another_one.wav',
      take_another_yes_no: '/audio/gemini-photo/take_another_yes_no.wav',
      photo_saved: '/audio/gemini-photo/photo_saved.wav',
      intro_hello: '/audio/gemini-photo/intro_hello.wav',
      left_ready: '/audio/gemini-photo/left_ready.wav',
      right_ready: '/audio/gemini-photo/right_ready.wav',
      center_ready: '/audio/gemini-photo/center_ready.wav',
      listening_for_ready: '/audio/gemini-photo/listening_for_ready.wav',
      missed_that_photo: '/audio/gemini-photo/missed_that_photo.wav',
      perfect_photo: '/audio/gemini-photo/perfect_photo.wav',
      birthday_prompt: '/audio/gemini-photo/birthday_prompt.wav',
      birthday_retry: '/audio/gemini-photo/birthday_retry.wav',
      notes_prompt: '/audio/gemini-photo/notes_prompt.wav',
      all_set_generic: '/audio/gemini-photo/all_set_generic.wav',
  };
  const FALLBACK_COUNTDOWN_AUDIO_FILES: Record<string, string> = {
      countdown_1: '/audio/countdown/1.mp3',
      countdown_2: '/audio/countdown/2.mp3',
      countdown_3: '/audio/countdown/3.mp3',
      countdown_4: '/audio/countdown/4.mp3',
      countdown_5: '/audio/countdown/5.mp3',
      countdown_6: '/audio/countdown/6.mp3',
      countdown_7: '/audio/countdown/7.mp3',
      countdown_8: '/audio/countdown/8.mp3',
      countdown_9: '/audio/countdown/9.mp3',
      countdown_10: '/audio/countdown/10.mp3',
  };
  const OST_AUDIO_FILES = {
      alarm: '/audio/ost/alarm.wav',
      closeMenu: '/audio/ost/close_menu.wav',
      fail: '/audio/ost/fail.wav',
      notify: '/audio/ost/notify.wav',
      openMenu: '/audio/ost/open_menu.wav',
      photoTaken: '/audio/ost/photo_taken.wav',
      processing: '/audio/ost/processing_quicker.wav',
      readyForSpeech: '/audio/ost/ready_for_speech.wav',
      success: '/audio/ost/success.wav',
      timer: '/audio/ost/timer.wav',
      unknownCommand: '/audio/ost/unknown_command.wav',
  } as const;
  const isMobileBrowser = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  const isAndroidShell = typeof window !== 'undefined' && Boolean((window as any).AiroAndroidBridge);
  const [hasStarted, setHasStarted] = useState(false);
  const [wakeState, setWakeState] = useState(false); 
  const [isPreparing, setIsPreparing] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [backgroundTimer, setBackgroundTimer] = useState<any>(null);
  const [backgroundMusic, setBackgroundMusic] = useState<any>(null);
  const [ollieConnected, setOllieConnected] = useState(false);
  const [eyeIntentX, setEyeIntentX] = useState(0);
  const [eyeIntentBlink, setEyeIntentBlink] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuPanel, setMenuPanel] = useState<MenuPanel>('carousel');
  const [assistantMuted, setAssistantMuted] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);
  const [microbitDemoMode, setMicrobitDemoMode] = useState(false);
  const [isSleepMode, setIsSleepMode] = useState(false);
  const [movementEnabled, setMovementEnabled] = useState(true);
  const [motorSpeedScale, setMotorSpeedScale] = useState(0.7);
  const [motorBoostMultiplier, setMotorBoostMultiplier] = useState(1);
  const [motorSide, setMotorSide] = useState<MotorSide>('right');
  const [selectedRobotModel, setSelectedRobotModel] = useState<RobotModel>('Airo C');
  const [menuSlideDirection, setMenuSlideDirection] = useState(1);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberRecord[]>([]);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhotoRecord[]>([]);
  const [skillCatalog, setSkillCatalog] = useState<InstalledAiroSkill[]>(BUNDLED_AIRO_SKILLS);
  const [installedSkillIds, setInstalledSkillIds] = useState<string[]>(BUNDLED_AIRO_SKILLS.map((skill) => skill.id));
  const [skillSearch, setSkillSearch] = useState('');
  const [lastDeveloperSkillToolName, setLastDeveloperSkillToolName] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>('default');
  const [sessionPrompt, setSessionPrompt] = useState<string | null>(null);
  const [wakeCarryPrompt, setWakeCarryPrompt] = useState<string | null>(null);
  const [awaitingFirstTextTurn, setAwaitingFirstTextTurn] = useState(false);
  const [intentOutputContract, setIntentOutputContract] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isRunningSkill, setIsRunningSkill] = useState(false);
  const [skillEyeStateOverride, setSkillEyeStateOverride] = useState<EyeState | null>(null);
  const [skillLightOverride, setSkillLightOverride] = useState<[number, number, number] | null>(null);
  const [recognizedFamilyMember, setRecognizedFamilyMember] = useState<FamilyMemberRecord | null>(null);
  const [familyCaptureDebug, setFamilyCaptureDebug] = useState<FamilyCaptureDebug>({
      source: 'unknown',
      status: 'Waiting for capture',
      preview: null,
  });
  const [familyEnrollmentDraft, setFamilyEnrollmentDraft] = useState<FamilyEnrollmentDraft>({
      name: '',
      birthday: '',
      notes: '',
      photos: {
          left: null,
          center: null,
          right: null,
      },
  });
  const [familyIntroFlow, setFamilyIntroFlow] = useState<FamilyIntroFlowState>({
      active: false,
      step: 'idle',
      name: '',
      birthday: '',
      notes: '',
      status: 'Ready to introduce a family member',
  });
  const [photoCaptureOverlay, setPhotoCaptureOverlay] = useState<PhotoCaptureOverlay>({
      active: false,
      phase: 'icon',
      countdown: 3,
      source: 'front',
      preview: null,
      status: 'Stand by',
      flash: false,
  });
  const [pendingPhotoDecision, setPendingPhotoDecision] = useState<PendingPhotoDecision | null>(null);
  const [skillEyeAnimationOverride, setSkillEyeAnimationOverride] = useState<any | null>(null);
  const [developerVisionPreview, setDeveloperVisionPreview] = useState<DeveloperVisionPreview>({
      front: null,
      rear: null,
  });
  const [recognizedProfileOverlay, setRecognizedProfileOverlay] = useState<RecognizedProfileOverlay>({
      visible: false,
      name: '',
      photoDataUrl: null,
  });
  const [galleryPhotoActionMenu, setGalleryPhotoActionMenu] = useState<GalleryPhotoActionMenu>({
      visible: false,
      photoId: null,
      photoDataUrl: null,
  });
  const [weatherInfoOverlay, setWeatherInfoOverlay] = useState<WeatherInfoOverlay>({
      visible: false,
      title: '',
      location: '',
      temperatureText: '',
      detailText: '',
      mediaUrl: null,
  });
  const startupCalibrationDoneRef = useRef(false);
  
  const wakeWordRef = useRef<WakeWordDetector | null>(null);
  const wakeListenerRestartTimerRef = useRef<number | null>(null);
  const wakeListenerRestartAttemptsRef = useRef(0);
  const chatEnabledRef = useRef(!developerMode);
  const hasStartedRef = useRef(hasStarted);
  const wakeStateRef = useRef(wakeState);
  const assistantMutedRef = useRef(assistantMuted);
  const menuOpenRef = useRef(menuOpen);
  const isSleepModeRef = useRef(isSleepMode);
  const holdTimerRef = useRef<any>(null);
  const connectionStateRef = useRef<AppState>(AppState.IDLE);
  const ollieRef = useRef<RobotMobilityController | null>(null);
  const mobilityBackendRef = useRef<'native-dock' | 'web-dock' | null>(null);
  const isMovingRef = useRef(false);
  const subtleMotionTimerRef = useRef<number | null>(null);
  const followTimerRef = useRef<number | null>(null);
  const rearSweepTimerRef = useRef<number | null>(null);
  const standbyMotionTimerRef = useRef<number | null>(null);
  const rearTurnCooldownRef = useRef(0);
  const galleryPhotoLongPressTimerRef = useRef<number | null>(null);
  const galleryPhotoLongPressTriggeredRef = useRef(false);
  const familyImportInputRef = useRef<HTMLInputElement | null>(null);
  const familyIntroRunIdRef = useRef(0);
  const eyeIntentTurnCooldownRef = useRef(0);
  const speakerOrientCooldownRef = useRef(0);
  const wasAiSpeakingRef = useRef(false);
  const startupTurnRangeRef = useRef<{ left: number; right: number }>({ left: -22, right: 22 });
  const eyeIntentResetTimerRef = useRef<number | null>(null);
  const subtleMotionPhaseRef = useRef(0);
  const sensorHeadingRef = useRef(0);
  const visionTargetRef = useRef<VisionTarget | null>(null);
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const activePointerIdRef = useRef<number | null>(null);
  const backendClientIdRef = useRef('');
  const familyRecognitionBusyRef = useRef(false);
  const familyRecognitionCooldownRef = useRef(0);
  const lastUnknownPersonGreetingAtRef = useRef(0);
  const lastUnknownPersonSeenAtRef = useRef(0);
  const pendingFamilyPhotoRef = useRef<string | null>(null);
  const pendingFamilyPhotosRef = useRef<{ left: string | null; center: string | null; right: string | null }>({
      left: null,
      center: null,
      right: null,
  });
  const recognizedOverlayTimerRef = useRef<number | null>(null);
  const weatherInfoOverlayTimerRef = useRef<number | null>(null);
  const lastRecognizedOverlayIdRef = useRef<string | null>(null);
  const backgroundTimerRef = useRef<any>(null);
  const latestWakeTranscriptRef = useRef('');
  const lastVisionActivityAtRef = useRef(Date.now());
  const firstTurnRecognitionRef = useRef<any>(null);
  const mobileAppUrl = `${window.location.origin}/mobile.html`;
  const firstTurnTimeoutRef = useRef<number | null>(null);
  const nativeFirstTurnHandlerRef = useRef<((event: Event) => void) | null>(null);
  const photoDecisionRecognitionRef = useRef<any>(null);
  const photoDecisionTimeoutRef = useRef<number | null>(null);
  const nativePhotoDecisionHandlerRef = useRef<((event: Event) => void) | null>(null);
  const skillConfirmationRecognitionRef = useRef<any>(null);
  const skillConfirmationTimeoutRef = useRef<number | null>(null);
  const nativeSkillConfirmationHandlerRef = useRef<((event: Event) => void) | null>(null);
  const skillConfirmationResolverRef = useRef<((answer: boolean | null) => void) | null>(null);
  const passiveConfirmationRecognitionRef = useRef<any>(null);
  const passiveConfirmationTimeoutRef = useRef<number | null>(null);
  const nativePassiveConfirmationHandlerRef = useRef<((event: Event) => void) | null>(null);
  const expectingSkillConfirmationRef = useRef(false);
  const liveSpeechConsumerRef = useRef<(text: string) => boolean>(() => false);
  const isStopTimerCommandRef = useRef<(value: string) => boolean>(() => false);
  const stopTimerAlarmLoopRef = useRef<(reason?: string) => void>(() => {});
  const wakeFromSleepRef = useRef<(reason: string) => void>(() => {});
  const recognizeVisibleFamilyMemberRef = useRef<
      (options?: {
          reason?: 'background' | 'wake' | 'manual';
          force?: boolean;
          allowGreeting?: boolean;
          showOverlay?: boolean;
          sampleCount?: number;
          minConfidence?: number;
      }) => Promise<FamilyMemberRecord | null>
  >(async () => null);
  const orientTowardSpeakerFromSensorsRef = useRef<() => Promise<void>>(async () => {});
  const ttsQueueRef = useRef<Promise<void>>(Promise.resolve());
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsActiveSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsActiveAudioRef = useRef<HTMLAudioElement | null>(null);
  const flowerySpeechCacheRef = useRef<Map<string, Uint8Array>>(new Map());
  const flowerySpeechPendingRef = useRef<Map<string, Promise<Uint8Array | null>>>(new Map());
  const photoFlowSpeechPrewarmStartedRef = useRef(false);
  const ostActiveAudioRef = useRef<HTMLAudioElement | null>(null);
  const ostAudioContextRef = useRef<AudioContext | null>(null);
  const ostBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const demoSpeechCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const demoSpeechLoadingRef = useRef(false);
  const demoModeRunningRef = useRef(false);
  const timerLoopAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerAlarmActiveRef = useRef(false);
  const lastOstPlayAtRef = useRef(0);
  const lastMainThinkingRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);
  const cameraStateRef = useRef<'idle' | 'starting' | 'active' | 'error'>('idle');
  const { heading, relativeHeading, relativePitch, relativeRoll, turnRate, permissionState, requestPermission, zeroHeading } = useDeviceHeading();
  const thinkingAudio = useUnlockedLoopingAudio('/audio/ost/processing.wav');
  const { target: visionTarget, rearTarget, cameraState, cameraMode, opencvState, start: startCameraTracking, stop: stopCameraTracking, captureFrame } = useBackgroundVisionTracker();
  const isAiroCModel = selectedRobotModel === 'Airo C';
  const isAr20Model = selectedRobotModel === 'AR-20';
  const movementAllowed = !isAiroCModel && movementEnabled && !assistantMuted && !menuOpen && sessionMode !== 'family-onboarding' && !isSleepMode;
  const chatEnabled = !developerMode;
  const installedSkills = skillCatalog.filter((skill) => installedSkillIds.includes(skill.id));
  const menuItems: DynamicMenuItem[] = [
      ...BASE_MENU_ITEMS.map((item) => ({ ...item, kind: 'base' as const })),
      ...installedSkills.map((skill) => ({
          id: `skill-${skill.id}`,
          label: skill.name,
          enabled: true,
          emoji: skill.emoji || '🧩',
          color: skill.color || '#334155',
          kind: 'skill' as const,
          toolName: skill.toolName,
          description: skill.description,
      })),
  ];
  const selectedMenuItem = menuItems[menuIndex] || menuItems[0];
  const nextFamilyCaptureStep =
      FAMILY_CAPTURE_SEQUENCE.find((step) => !familyEnrollmentDraft.photos[step.key]) || null;
  const allFamilyCaptureStepsComplete = FAMILY_CAPTURE_SEQUENCE.every((step) => Boolean(familyEnrollmentDraft.photos[step.key]));
  const filteredSkillCatalog = skillCatalog.filter((skill) => {
      const query = skillSearch.trim().toLowerCase();
      if (!query) return true;
      return (
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          (skill.author || '').toLowerCase().includes(query)
      );
  });

  const scaleMotorSpeed = (value: number, min: number = 45) => {
      const shellDragBoost = 1.5;
      const scaled = Math.round(value * motorSpeedScale * shellDragBoost * motorBoostMultiplier);
      return Math.min(255, Math.max(min, scaled));
  };

  const driveSelectedMotor = async (direction: MobilityMotorDirection, speed: number) => {
      if (!ollieRef.current) return;
      await ollieRef.current.driveMotorSide(motorSide, direction, speed);
  };

  const stopRobotMotion = async () => {
      if (!ollieRef.current) return;
      try {
          await ollieRef.current.stopMotion();
      } catch (error) {
          console.error('Failed to stop robot motion', error);
      } finally {
          isMovingRef.current = false;
          setEyeIntentX(0);
      }
  };

  const moveRobotTimed = async (direction: string, intensity = 0.75, durationMs = 650) => {
      if (!ollieRef.current || isMovingRef.current || !movementAllowed) return;

      const normalized = direction.toLowerCase().trim();
      const speed = scaleMotorSpeed(Math.round(85 + Math.min(Math.max(intensity, 0), 1) * 85), 50);
      const duration = Math.max(80, Math.min(3000, Number(durationMs) || 650));
      const actionMap: Record<string, { direction: MobilityMotorDirection; eye: number }> = {
          front: { direction: 'forward', eye: 0.25 },
          behind: { direction: 'reverse', eye: -0.25 },
          left: { direction: 'reverse', eye: -1 },
          right: { direction: 'forward', eye: 1 },
      };
      const action = actionMap[normalized];
      if (!action) return;

      signalEyeIntent(action.eye);
      isMovingRef.current = true;
      try {
          await driveSelectedMotor(action.direction, speed);
          await new Promise((resolve) => setTimeout(resolve, duration));
      } finally {
          await ollieRef.current.stopMotion();
          isMovingRef.current = false;
          setEyeIntentX(0);
      }
  };

  const triggerRemoteVoiceMode = useCallback((prompt?: string | null) => {
      if (!chatEnabled || !hasStarted || assistantMuted || menuOpen || connectionStateRef.current !== AppState.IDLE) return false;
      if (prompt?.trim()) {
          setSessionPrompt(prompt.trim());
      } else {
          setSessionPrompt(null);
      }
      setAwaitingFirstTextTurn(false);
      setWakeState(true);
      setStatusText(prompt?.trim() ? 'Remote prompt received' : 'Remote voice mode armed');
      return true;
  }, [assistantMuted, chatEnabled, hasStarted, menuOpen]);

  const cancelWakeListenerRestart = useCallback(() => {
      if (wakeListenerRestartTimerRef.current) {
          window.clearTimeout(wakeListenerRestartTimerRef.current);
          wakeListenerRestartTimerRef.current = null;
      }
      wakeListenerRestartAttemptsRef.current = 0;
  }, []);

  const scheduleWakeListenerRestart = useCallback((initialDelayMs = 350) => {
      cancelWakeListenerRestart();

      const attemptRestart = () => {
          if (
              !chatEnabledRef.current ||
              !hasStartedRef.current ||
              assistantMutedRef.current ||
              menuOpenRef.current ||
              isSleepModeRef.current ||
              wakeStateRef.current
          ) {
              cancelWakeListenerRestart();
              return;
          }
          const wakeWord = wakeWordRef.current;
          if (!wakeWord) {
              cancelWakeListenerRestart();
              return;
          }
          if (wakeWord.isListening) {
              setStatusText('Listening for Hey Airo');
              cancelWakeListenerRestart();
              return;
          }

          wakeListenerRestartAttemptsRef.current += 1;
          Promise.resolve(wakeWord.start())
              .then(() => {
                  if (wakeWordRef.current?.isListening) {
                      setStatusText('Listening for Hey Airo');
                      cancelWakeListenerRestart();
                      return;
                  }
                  if (wakeListenerRestartAttemptsRef.current < 8) {
                      wakeListenerRestartTimerRef.current = window.setTimeout(attemptRestart, 700);
                  }
              })
              .catch((error) => {
                  console.warn('Wake listener restart attempt failed', error);
                  if (wakeListenerRestartAttemptsRef.current < 8) {
                      wakeListenerRestartTimerRef.current = window.setTimeout(attemptRestart, 700);
                  }
              });
      };

      wakeListenerRestartTimerRef.current = window.setTimeout(attemptRestart, Math.max(0, initialDelayMs));
  }, [cancelWakeListenerRestart]);

  useEffect(() => {
      cameraStateRef.current = cameraState;
  }, [cameraState]);

  useEffect(() => {
      try {
          let backendClientId = window.localStorage.getItem(STORAGE_KEYS.backendClientId);
          if (!backendClientId) {
              backendClientId = `airo-${Math.random().toString(36).slice(2, 10)}`;
              window.localStorage.setItem(STORAGE_KEYS.backendClientId, backendClientId);
          }
          backendClientIdRef.current = backendClientId;
          const storedMovementEnabled = window.localStorage.getItem(STORAGE_KEYS.movementEnabled);
          const storedMotorSpeedScale = window.localStorage.getItem(STORAGE_KEYS.motorSpeedScale);
          const storedMotorBoostMultiplier = window.localStorage.getItem(STORAGE_KEYS.motorBoostMultiplier);
          const storedMotorSide = window.localStorage.getItem(STORAGE_KEYS.motorSide);
          const storedAssistantMuted = window.localStorage.getItem(STORAGE_KEYS.assistantMuted);
          const storedDeveloperMode = window.localStorage.getItem(STORAGE_KEYS.developerMode);
          const storedMicrobitDemoMode = window.localStorage.getItem('airo.microbitDemoMode');
          const storedFamilyMembers = window.localStorage.getItem(STORAGE_KEYS.familyMembers);
          const nativeFamilyMembersRaw = isAndroidShell ? (window as any).AiroAndroidBridge?.getFamilyMembers?.() : null;
          const storedGalleryPhotos = window.localStorage.getItem(STORAGE_KEYS.galleryPhotos);
          const storedInstalledSkillIds = window.localStorage.getItem(STORAGE_KEYS.installedSkillIds);
          const storedIntentOutputContract = window.localStorage.getItem(STORAGE_KEYS.intentOutputContract);
          let storedPairingCode = window.localStorage.getItem(STORAGE_KEYS.pairingCode);
          if (!storedPairingCode) {
              const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
              storedPairingCode = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
              window.localStorage.setItem(STORAGE_KEYS.pairingCode, storedPairingCode);
          }
          setPairingCode(String(storedPairingCode).toUpperCase());

          if (storedMovementEnabled !== null) {
              setMovementEnabled(storedMovementEnabled === 'true');
          }
          if (storedMotorSpeedScale !== null) {
              const parsed = Number(storedMotorSpeedScale);
              if (!Number.isNaN(parsed)) {
                  setMotorSpeedScale(Math.max(0.2, Math.min(1, parsed)));
              }
          }
          if (storedMotorBoostMultiplier !== null) {
              const parsed = Number(storedMotorBoostMultiplier);
              if (!Number.isNaN(parsed)) {
                  setMotorBoostMultiplier(Math.max(1, Math.min(5, Math.round(parsed))));
              }
          }
          if (storedMotorSide === 'left' || storedMotorSide === 'right') {
              setMotorSide(storedMotorSide);
          }
          if (storedAssistantMuted !== null) {
              setAssistantMuted(storedAssistantMuted === 'true');
          }
          if (storedDeveloperMode !== null) {
              setDeveloperMode(storedDeveloperMode === 'true');
          }
          if (storedMicrobitDemoMode !== null) {
              setMicrobitDemoMode(storedMicrobitDemoMode === 'true');
          }
          const parsedBrowserFamilyMembers = storedFamilyMembers ? JSON.parse(storedFamilyMembers) : null;
          const parsedNativeFamilyMembers = nativeFamilyMembersRaw ? JSON.parse(nativeFamilyMembersRaw) : null;
          const browserFamilyMembers = Array.isArray(parsedBrowserFamilyMembers) ? parsedBrowserFamilyMembers : [];
          const nativeFamilyMembers = Array.isArray(parsedNativeFamilyMembers) ? parsedNativeFamilyMembers : [];
          if (browserFamilyMembers.length || nativeFamilyMembers.length) {
              const mergedFamilyMembers = [...browserFamilyMembers];
              for (const nativeMember of nativeFamilyMembers) {
                  if (!nativeMember || typeof nativeMember !== 'object') continue;
                  const nativeId = typeof nativeMember.id === 'string' ? nativeMember.id : '';
                  const nativeName = typeof nativeMember.name === 'string' ? nativeMember.name : '';
                  const existingIndex = mergedFamilyMembers.findIndex((member) =>
                      (nativeId && member?.id === nativeId) ||
                      (nativeName && typeof member?.name === 'string' && member.name.toLowerCase() === nativeName.toLowerCase())
                  );
                  if (existingIndex >= 0) {
                      const existing = mergedFamilyMembers[existingIndex] || {};
                      const nativePhotos = Array.isArray(nativeMember.photoDataUrls)
                          ? nativeMember.photoDataUrls.filter((value: unknown) => typeof value === 'string' && String(value).startsWith('data:image'))
                          : [];
                      const existingPhotos = Array.isArray(existing?.photoDataUrls)
                          ? existing.photoDataUrls.filter((value: unknown) => typeof value === 'string' && String(value).startsWith('data:image'))
                          : [];
                      mergedFamilyMembers[existingIndex] = {
                          ...nativeMember,
                          ...existing,
                          photoDataUrl: existing?.photoDataUrl || nativeMember.photoDataUrl || '',
                          photoDataUrls: existingPhotos.length ? existingPhotos : nativePhotos,
                          memories: mergeFamilyMemoryEntries(
                              normalizeFamilyMemoryEntries(nativeMember.memories),
                              normalizeFamilyMemoryEntries(existing?.memories)
                          ),
                          notes: existing?.notes || nativeMember.notes || '',
                          birthday: existing?.birthday || nativeMember.birthday || '',
                          birthdayMonthDay: existing?.birthdayMonthDay || nativeMember.birthdayMonthDay || undefined,
                          lastSeenAt: Math.max(Number(existing?.lastSeenAt || 0), Number(nativeMember.lastSeenAt || 0)) || undefined,
                          lastGreetedAt: Math.max(Number(existing?.lastGreetedAt || 0), Number(nativeMember.lastGreetedAt || 0)) || undefined,
                          lastBirthdayGreetedAt: Math.max(Number(existing?.lastBirthdayGreetedAt || 0), Number(nativeMember.lastBirthdayGreetedAt || 0)) || undefined,
                      };
                  } else {
                      mergedFamilyMembers.push({
                          ...nativeMember,
                          photoDataUrls: nativePhotos.length ? nativePhotos : undefined,
                          memories: normalizeFamilyMemoryEntries(nativeMember.memories),
                      });
                  }
              }
              setFamilyMembers(mergedFamilyMembers
                  .filter((member) =>
                      member &&
                      typeof member.id === 'string' &&
                      typeof member.name === 'string' &&
                      typeof member.photoDataUrl === 'string' &&
                      member.photoDataUrl.startsWith('data:image')
                  )
                  .map((member) => ({
                      ...member,
                      memories: normalizeFamilyMemoryEntries(member.memories),
                  })));
          }
          if (storedGalleryPhotos) {
              const parsed = JSON.parse(storedGalleryPhotos);
              if (Array.isArray(parsed)) {
                  setGalleryPhotos(parsed);
              }
          }
          if (storedInstalledSkillIds) {
              const parsed = JSON.parse(storedInstalledSkillIds);
              if (Array.isArray(parsed)) {
                  setInstalledSkillIds(parsed.filter((value) => typeof value === 'string'));
              }
          }
          if (storedIntentOutputContract != null) {
              setIntentOutputContract(String(storedIntentOutputContract));
          }
      } catch (error) {
          console.warn('Failed to restore local settings', error);
      }
  }, [isAndroidShell]);

  const refreshSkillCatalog = async () => {
      try {
          const response = await fetch(`${SKILL_STORE_PATH}?t=${Date.now()}`, { cache: 'no-store' });
          const payload: SkillStorePayload = response.ok ? await response.json() : { skills: [] };
          const remoteSkills = Array.isArray(payload.skills) ? payload.skills : [];
          const builderSkillRaw = window.localStorage.getItem(BUILDER_SKILL_STORAGE_KEY);
          const builderSkill = builderSkillRaw ? JSON.parse(builderSkillRaw) as InstalledAiroSkill : null;
          setSkillCatalog(mergeSkillLists(BUNDLED_AIRO_SKILLS, remoteSkills, builderSkill ? [builderSkill] : []));
      } catch (error) {
          console.warn('Failed to refresh skill catalog', error);
          const builderSkillRaw = window.localStorage.getItem(BUILDER_SKILL_STORAGE_KEY);
          const builderSkill = builderSkillRaw ? JSON.parse(builderSkillRaw) as InstalledAiroSkill : null;
          setSkillCatalog(mergeSkillLists(BUNDLED_AIRO_SKILLS, builderSkill ? [builderSkill] : []));
      }
  };

  const sendBackendLog = useCallback((level: 'info' | 'warn' | 'error', scope: string, message: string, detail?: string) => {
      if (!backendClientIdRef.current) return;
      void fetch('/backend/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              clientId: backendClientIdRef.current,
              level,
              scope,
              message,
              detail: detail || '',
          }),
      }).catch(() => {});
  }, []);

  useEffect(() => {
      void refreshSkillCatalog();
  }, []);

  useEffect(() => {
      if (menuPanel === 'skill-store' && menuOpen) {
          void refreshSkillCatalog();
      }
  }, [menuOpen, menuPanel]);

  useEffect(() => {
      if (!menuItems.length) return;
      if (menuIndex >= menuItems.length) {
          setMenuIndex(0);
      }
  }, [menuIndex, menuItems.length]);

  useEffect(() => {
      try {
          window.localStorage.setItem(STORAGE_KEYS.movementEnabled, String(movementEnabled));
          window.localStorage.setItem(STORAGE_KEYS.motorSpeedScale, String(motorSpeedScale));
          window.localStorage.setItem(STORAGE_KEYS.motorBoostMultiplier, String(motorBoostMultiplier));
          window.localStorage.setItem(STORAGE_KEYS.motorSide, motorSide);
          window.localStorage.setItem(STORAGE_KEYS.assistantMuted, String(assistantMuted));
          window.localStorage.setItem(STORAGE_KEYS.developerMode, String(developerMode));
          window.localStorage.setItem('airo.microbitDemoMode', String(microbitDemoMode));
          const serializedFamilyMembers = JSON.stringify(familyMembers);
          window.localStorage.setItem(STORAGE_KEYS.familyMembers, serializedFamilyMembers);
          if (isAndroidShell) {
              (window as any).AiroAndroidBridge?.saveFamilyMembers?.(serializedFamilyMembers);
          }
          window.localStorage.setItem(STORAGE_KEYS.galleryPhotos, JSON.stringify(galleryPhotos));
          window.localStorage.setItem(STORAGE_KEYS.installedSkillIds, JSON.stringify(installedSkillIds));
          window.localStorage.setItem(STORAGE_KEYS.intentOutputContract, String(intentOutputContract || ''));
      } catch (error) {
          console.warn('Failed to persist local settings', error);
      }
  }, [movementEnabled, motorSpeedScale, motorBoostMultiplier, motorSide, assistantMuted, developerMode, microbitDemoMode, familyMembers, galleryPhotos, installedSkillIds, intentOutputContract, isAndroidShell]);

  const signalEyeIntent = (direction: number) => {
      setEyeIntentX(direction);
      setEyeIntentBlink((v) => !v);
      if (eyeIntentResetTimerRef.current) {
          window.clearTimeout(eyeIntentResetTimerRef.current);
      }
      eyeIntentResetTimerRef.current = window.setTimeout(() => {
          setEyeIntentX(0);
          eyeIntentResetTimerRef.current = null;
      }, 320);
  };

  const setRobotLights = async (red: number, green: number, blue: number) => {
      if (!ollieRef.current) return;
      try {
          await ollieRef.current.setAccentColor(red, green, blue);
      } catch (error) {
          console.error('Failed to set robot lights', error);
      }
  };

  const normalizeSignedDegrees = (degrees: number) => {
      let normalized = ((degrees + 180) % 360 + 360) % 360 - 180;
      if (normalized === -180) normalized = 180;
      return normalized;
  };

  const hasUsableHeading = permissionState === 'granted' && heading != null;

  const extractWakeCommand = (transcript: string) => {
      const normalized = transcript.toLowerCase().trim();
      const patterns = [
          /^hey airo\b/,
          /^hey arrow\b/,
          /^hey aero\b/,
          /^hey airoh\b/,
          /^hey air o\b/,
          /^hey ai row\b/,
          /^hey hey row\b/,
          /^hey row\b/,
          /^ok airo\b/,
          /^ok arrow\b/,
          /^ok aero\b/,
          /^hello airo\b/,
          /^hello arrow\b/,
      ];

      for (const pattern of patterns) {
          const stripped = normalized.replace(pattern, '').trim();
          if (stripped !== normalized) {
              return stripped;
          }
      }

      return '';
  };

  const turnLeftMotorByDegrees = async (degrees: number) => {
      if (!ollieRef.current || !movementAllowed) return;
      const turnRange = startupTurnRangeRef.current;
      const clampedDegrees = Math.max(turnRange.left, Math.min(turnRange.right, degrees));
      const direction = clampedDegrees >= 0 ? 1 : -1;
      const targetDelta = Math.abs(clampedDegrees);
      const isFullTurn = targetDelta >= 150;
      const edgeMagnitude = Math.max(Math.abs(turnRange.left), Math.abs(turnRange.right), 1);
      const edgePressure = Math.min(1, Math.abs(clampedDegrees) / edgeMagnitude);
      const edgeBoost = edgePressure > 0.72 ? 1 + Math.min(0.42, (edgePressure - 0.72) * 1.3) : 1;
      const commandedDelta = isFullTurn ? Math.min(targetDelta + 36, 240) : Math.min(targetDelta * edgeBoost, edgeMagnitude);
      const speed = scaleMotorSpeed(
        Math.min((isFullTurn ? 185 : 90) + targetDelta * 0.35 + (edgePressure > 0.72 ? 24 : 0), 255),
        isFullTurn ? 155 : 55
      );

      signalEyeIntent(direction);
      isMovingRef.current = true;
      const startHeading = sensorHeadingRef.current;
      const startTime = Date.now();

      try {
          if (!hasUsableHeading || isFullTurn) {
              await ollieRef.current.rotateMotorSideFor(
                motorSide,
                direction > 0 ? 'forward' : 'reverse',
                commandedDelta,
                speed
              );
              if (isFullTurn) {
                  await new Promise((resolve) => setTimeout(resolve, 160));
              }
              return;
          }

          await driveSelectedMotor(
            direction > 0 ? 'forward' : 'reverse',
            speed
          );

          while (Date.now() - startTime < (isFullTurn ? 6500 : 5000)) {
              const delta = Math.abs((((sensorHeadingRef.current - startHeading) + 540) % 360) - 180);
              if (delta >= Math.max(12, targetDelta - 8)) break;
              await new Promise((resolve) => setTimeout(resolve, 40));
          }
      } finally {
          await ollieRef.current.stopMotion();
          isMovingRef.current = false;
          setEyeIntentX(0);
      }
  };

  useEffect(() => {
      if (!ollieConnected || !movementAllowed || !ollieRef.current) return;
      const direction = eyeIntentX > 0.72 ? 1 : eyeIntentX < -0.72 ? -1 : 0;
      if (!direction) return;
      if (isMovingRef.current) return;
      const now = Date.now();
      if (now - eyeIntentTurnCooldownRef.current < 700) return;

      const timer = window.setTimeout(async () => {
          if (!ollieRef.current || !movementAllowed || isMovingRef.current) return;
          eyeIntentTurnCooldownRef.current = Date.now();
          isMovingRef.current = true;
          try {
              await driveSelectedMotor(
                  direction > 0 ? 'forward' : 'reverse',
                  scaleMotorSpeed(104, 62)
              );
              await new Promise((resolve) => setTimeout(resolve, 175));
          } finally {
              await ollieRef.current?.stopMotion();
              isMovingRef.current = false;
          }
      }, 45);

      return () => {
          window.clearTimeout(timer);
      };
  }, [eyeIntentX, movementAllowed, ollieConnected, motorSide, motorSpeedScale]);

  const faceUserWithSeek = async () => {
      if (!ollieRef.current || !movementAllowed) return;
      signalEyeIntent(1);
          const speed = scaleMotorSpeed(110, 70);
      const deadline = Date.now() + 5600;

      try {
          while (Date.now() < deadline) {
              const target = visionTargetRef.current;
              if (target?.kind === 'face' && Math.abs(target.x) < 0.2) {
                  break;
              }

              isMovingRef.current = true;
              await driveSelectedMotor('forward', speed);
              await new Promise((resolve) => setTimeout(resolve, 140));
              await ollieRef.current.stopMotion();
              isMovingRef.current = false;
              await new Promise((resolve) => setTimeout(resolve, 170));
          }
      } finally {
          await ollieRef.current.stopMotion();
          isMovingRef.current = false;
          setEyeIntentX(0);
      }
  };

  const runStartupCalibrationMotion = async () => {
      if (!ollieRef.current || !movementAllowed) return;
      setIsPreparing(true);
      setStatusText('Calibrating...');
      const centerHeading = hasUsableHeading ? sensorHeadingRef.current : 0;
      startupTurnRangeRef.current = { left: -22, right: 22 };
      const sweepHeading = async (targetDelta: number) => {
          if (!ollieRef.current || !movementAllowed) return;
          if (hasUsableHeading) {
              await turnLeftMotorByDegrees(targetDelta);
              return;
          }

          const motor: MobilityMotorDirection = targetDelta >= 0
              ? (motorSide === 'left' ? 'forward' : 'reverse')
              : (motorSide === 'left' ? 'reverse' : 'forward');
          isMovingRef.current = true;
          signalEyeIntent(targetDelta >= 0 ? 1 : -1);
          try {
              const speed = scaleMotorSpeed(176, 116);
              const startHeading = sensorHeadingRef.current;
              const startTime = Date.now();
              let stalledSince = 0;
              await driveSelectedMotor(motor, speed);
              while (true) {
                  const delta = Math.abs(sensorHeadingRef.current - startHeading);
                  if (delta < 1.5) {
                      if (!stalledSince) stalledSince = Date.now();
                      if (Date.now() - stalledSince >= 2000) break;
                  } else {
                      stalledSince = 0;
                  }
                  if (Date.now() - startTime > 6500) break;
                  await new Promise((resolve) => setTimeout(resolve, 60));
              }
          } finally {
              await ollieRef.current.stopMotion();
              isMovingRef.current = false;
              setEyeIntentX(0);
          }
      };

      try {
          setStatusText('Calibrating...');
          await returnToStartupHeading();
          await sweepHeading(-22);
          await new Promise((resolve) => setTimeout(resolve, 220));
          await sweepHeading(44);
          await new Promise((resolve) => setTimeout(resolve, 220));
          await sweepHeading(-22);
          if (hasUsableHeading) {
              sensorHeadingRef.current = centerHeading;
          }
          startupTurnRangeRef.current = { left: -22, right: 22 };
      } finally {
          await ollieRef.current?.stopMotion();
          setEyeIntentX(0);
          setStatusText('Airo Dock connected');
          setIsPreparing(false);
      }
  };

  const orientTowardSpeakerFromSensors = async () => {
      if (!ollieRef.current || !movementAllowed || !ollieConnected) return;
      if (isMovingRef.current || isAiSpeaking || menuOpen || assistantMuted) return;

      const now = Date.now();
      if (now - speakerOrientCooldownRef.current < 1200) return;
      speakerOrientCooldownRef.current = now;

      const frontTarget = visionTargetRef.current;
      if (frontTarget?.kind === 'face' && frontTarget.source === 'front') {
          const horizontalOffset = frontTarget.x;
          if (Math.abs(horizontalOffset) < 0.14) {
              return;
          }

          const moveRight = horizontalOffset > 0;
          const speed = scaleMotorSpeed(Math.round(Math.min(72 + Math.abs(horizontalOffset) * 110, 170)), 60);
          const duration = Math.round(Math.min(85 + Math.abs(horizontalOffset) * 85, 170));
          signalEyeIntent(moveRight ? 1 : -1);
          isMovingRef.current = true;
          try {
              await driveSelectedMotor(
                  moveRight ? 'forward' : 'reverse',
                  speed
              );
              await new Promise((resolve) => setTimeout(resolve, duration));
          } finally {
              await ollieRef.current.stopMotion();
              isMovingRef.current = false;
              setEyeIntentX(0);
          }
          return;
      }

      if (!frontTarget && rearTarget) {
          if (rearTarget.kind === 'face') {
              await turnLeftMotorByDegrees(180);
              return;
          }

          if (rearTarget.kind === 'motion' && rearTarget.strength > 0.18) {
              await turnLeftMotorByDegrees(180);
              return;
          }
      }

      if (hasUsableHeading && Math.abs(sensorHeadingRef.current) > 18) {
          await returnToStartupHeading();
      }
  };

  const moveRobotExpressive = async (direction: string, intensity = 0.55) => {
      if (!ollieRef.current || isMovingRef.current || !movementAllowed) return;

      const normalized = direction.toLowerCase().trim();
      const speed = scaleMotorSpeed(Math.round(95 + Math.min(Math.max(intensity, 0), 1) * 95), 70);
      const duration = normalized === 'front' || normalized === 'behind' ? 240 : 180;
      const actionMap: Record<string, { direction: MobilityMotorDirection; eye: number }> = {
          front: { direction: 'forward', eye: 0.25 },
          behind: { direction: 'reverse', eye: -0.25 },
          left: { direction: 'reverse', eye: -1 },
          right: { direction: 'forward', eye: 1 },
      };
      const action = actionMap[normalized];
      if (!action) return;

      signalEyeIntent(action.eye);
      isMovingRef.current = true;
      try {
          await driveSelectedMotor(action.direction, speed);
          await new Promise((resolve) => setTimeout(resolve, duration));
      } finally {
          await ollieRef.current.stopMotion();
          isMovingRef.current = false;
          setEyeIntentX(0);
      }
  };

  const turnToWaypoint = async (direction: string) => {
      if (!movementAllowed || !ollieRef.current) return;
      const targetMap: Record<string, number> = {
          front: 0,
          right: 90,
          behind: 180,
          left: 270,
      };
      const targetHeading = targetMap[direction.toLowerCase().trim()];
      if (typeof targetHeading !== 'number') return;

      if (!hasUsableHeading) {
          const speed = scaleMotorSpeed(150, 80);
          signalEyeIntent(
            targetHeading === 90 ? 1 : targetHeading === 270 ? -1 : targetHeading === 180 ? 1 : 0
          );
          isMovingRef.current = true;
          try {
              await ollieRef.current.rotateMotorSideToHeading(motorSide, targetHeading, speed);
          } finally {
              await ollieRef.current.stopMotion();
              isMovingRef.current = false;
              setEyeIntentX(0);
          }
          return;
      }

      const delta = normalizeSignedDegrees(targetHeading - sensorHeadingRef.current);
      await turnLeftMotorByDegrees(delta);
  };

  const returnToStartupHeading = async () => {
      if (!ollieConnected || !movementAllowed || isMovingRef.current) return;
      if (!hasUsableHeading) {
          await turnToWaypoint('front');
          return;
      }
      const delta = normalizeSignedDegrees(0 - sensorHeadingRef.current);
      if (Math.abs(delta) < 10) return;
      setStatusText('Returning to startup heading');
      await turnLeftMotorByDegrees(delta);
  };

  const resolvePhotoSource = (): 'front' | 'rear' => {
      if (visionTargetRef.current?.source) return visionTargetRef.current.source;
      if (cameraMode === 'single-rear') return 'rear';
      return 'front';
  };

  const getGeminiSpeechKey = (text: string) =>
      JSON.stringify({
          text: String(text || '').trim(),
          voice: GEMINI_TTS_VOICE_ID,
          model: GEMINI_TTS_MODEL,
      });

  const resolveImportedGeminiPromptKey = (text: string): string | null => {
      const line = String(text || '').trim();
      if (!line) return null;
      const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim();
      if (/^\d+$/.test(normalized)) {
          const asNumber = Number(normalized);
          if (asNumber >= 1 && asNumber <= 10) {
              return `countdown_${asNumber}`;
          }
      }
      if (normalized === 'taking a photo.') return 'taking_a_photo';
      if (normalized === 'i may not be the best cameraman, but i am the only camera man who can take a photo with his head.') return 'best_cameraman';
      if (normalized === 'hold still, i am lining up the shot.') return 'hold_still';
      if (normalized === 'here is the photo.') return 'here_is_photo';
      if (normalized === 'i got one. here is the shot.') return 'i_got_one';
      if (normalized === 'sorry, something went wrong.') return 'something_went_wrong';
      if (normalized === 'that photo did not work out.') return 'photo_did_not_work_out';
      if (normalized.endsWith('want me to try again? say yes or no.')) return 'try_again_yes_no';
      if (normalized === 'do you want me to save it? say yes or no.') return 'save_it_yes_no';
      if (normalized === 'okay, i will stop the photo flow.') return 'stop_photo_flow';
      if (normalized === 'okay, i will leave that one unsaved.') return 'leave_unsaved';
      if (normalized === 'okay, let me take another one.') return 'take_another_one';
      if (normalized === 'do you want me to take another photo? say yes or no.') return 'take_another_yes_no';
      if (normalized === 'photo saved.') return 'photo_saved';
      if (normalized === 'hello there. i would love to get to know you properly. what should i call you?') return 'intro_hello';
      if (normalized.endsWith('turn your head to the left, and say ready when you are set.')) return 'left_ready';
      if (normalized.endsWith('turn your head to the right, and say ready when you are set.')) return 'right_ready';
      if (normalized.endsWith('look straight ahead, and say ready when you are set.')) return 'center_ready';
      if (normalized === 'i am listening for ready.') return 'listening_for_ready';
      if (/^i missed that (left|right|center) photo\. let us try that step again another time\.$/.test(normalized)) return 'missed_that_photo';
      if (/^perfect\. i have your (left|right|center) photo\.$/.test(normalized)) return 'perfect_photo';
      if (/^one more sweet detail, .+\. when is your birthday\? month and day is enough\.$/.test(normalized)) return 'birthday_prompt';
      if (normalized === 'i was listening for a birthday like march fourteenth, or three slash fourteen. let us try once more.') return 'birthday_retry';
      if (/^is there anything you want me to know about you, .+\? you can say something like, i am dad, or i love golf\.$/.test(normalized)) return 'notes_prompt';
      if (/^all set, .+\. i will remember you and i will be ready to say hello when i see you\.$/.test(normalized)) return 'all_set_generic';
      return null;
  };

  const pcm16ToWavBlob = (pcmBytes: Uint8Array, sampleRate: number = 24000, channels: number = 1) => {
      const dataLength = pcmBytes.byteLength;
      const buffer = new ArrayBuffer(44 + dataLength);
      const view = new DataView(buffer);
      const writeString = (offset: number, value: string) => {
          for (let i = 0; i < value.length; i += 1) {
              view.setUint8(offset + i, value.charCodeAt(i));
          }
      };
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + dataLength, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channels * 2, true);
      view.setUint16(32, channels * 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, dataLength, true);
      new Uint8Array(buffer, 44).set(pcmBytes);
      return new Blob([buffer], { type: 'audio/wav' });
  };

  const getCachedFlowerySpeechBuffer = useCallback(async (text: string) => {
      const line = String(text || '').trim();
      if (!line) return null;
      const key = getGeminiSpeechKey(line);
      const cached = flowerySpeechCacheRef.current.get(key);
      if (cached) return cached;
      const existing = flowerySpeechPendingRef.current.get(key);
      if (existing) return await existing;

      const request = (async () => {
          try {
              const apiKey = process.env.API_KEY;
              if (!apiKey) {
                  throw new Error('GEMINI API key missing');
              }
              const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  contents: [{
                              parts: [{
                                  text: [
                                  'Read the transcript exactly as Airo, a warm, humble, friendly family robot.',
                                  `Keep the delivery natural, clear, and slightly expressive in the ${GEMINI_TTS_VOICE_ID} voice.`,
                                  'Do not add or remove words.',
                                  `Transcript: ${line}`,
                              ].join(' '),
                          }],
                      }],
                      generationConfig: {
                          responseModalities: ['AUDIO'],
                          speechConfig: {
                              voiceConfig: {
                                  prebuiltVoiceConfig: {
                                      voiceName: GEMINI_TTS_VOICE_ID,
                                  },
                              },
                          },
                      },
                  }),
              });
              if (!response.ok) {
                  throw new Error(`Gemini TTS failed: ${response.status}`);
              }
              const json = await response.json();
              const base64Audio = String(json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '');
              if (!base64Audio) {
                  throw new Error('Gemini TTS returned no audio');
              }
              const pcmBytes = base64ToUint8Array(base64Audio);
              flowerySpeechCacheRef.current.set(key, pcmBytes);
              while (flowerySpeechCacheRef.current.size > 72) {
                  const oldestKey = flowerySpeechCacheRef.current.keys().next().value;
                  if (!oldestKey) break;
                  flowerySpeechCacheRef.current.delete(oldestKey);
              }
              return pcmBytes;
          } catch (error) {
              console.warn('Gemini TTS failed', error);
              return null;
          } finally {
              flowerySpeechPendingRef.current.delete(key);
          }
      })();

      flowerySpeechPendingRef.current.set(key, request);
      return await request;
  }, []);

  const playImportedGeminiPrompt = async (key: string) => {
      const importedSrc = IMPORTED_GEMINI_PROMPT_FILES[key] || FALLBACK_COUNTDOWN_AUDIO_FILES[key];
      if (!importedSrc) return false;
      try {
          const run = async () => {
              await new Promise<void>((resolve) => {
                  if (ttsActiveAudioRef.current) {
                      try {
                          ttsActiveAudioRef.current.pause();
                      } catch {}
                  }
                  const audio = new Audio(importedSrc);
                  ttsActiveAudioRef.current = audio;
                  audio.preload = 'auto';
                  let settled = false;
                  const finish = () => {
                      if (settled) return;
                      settled = true;
                      if (ttsActiveAudioRef.current === audio) {
                          ttsActiveAudioRef.current = null;
                      }
                      resolve();
                  };
                  const failSafe = window.setTimeout(finish, 5000);
                  const finalize = () => {
                      window.clearTimeout(failSafe);
                      finish();
                  };
                  audio.onended = finalize;
                  audio.onerror = finalize;
                  audio.onstalled = finalize;
                  audio.onabort = finalize;
                  void audio.play().catch(finalize);
              });
          };
          ttsQueueRef.current = ttsQueueRef.current.then(run).catch(() => {});
          await ttsQueueRef.current;
          return true;
      } catch {
          return false;
      }
  };

  const speakWithXaiTts = async (text: string) => {
      const line = String(text || '').trim();
      if (!line) return;
      const playGeminiPcm = async (pcmBytes: Uint8Array) => {
          if (isAndroidShell && (window as any).AiroAndroidBridge?.playGeminiPcm16) {
              await new Promise<void>((resolve, reject) => {
                  const requestId = `gemini-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                  const timeoutId = window.setTimeout(() => {
                      window.removeEventListener('airo-native-gemini-tts-finished', handleFinished as EventListener);
                      reject(new Error('Native Gemini TTS playback timed out'));
                  }, 14000);
                  const handleFinished = (event: Event) => {
                      const customEvent = event as CustomEvent<{ requestId?: string; ok?: boolean; error?: string }>;
                      if (String(customEvent.detail?.requestId || '') !== requestId) return;
                      window.clearTimeout(timeoutId);
                      window.removeEventListener('airo-native-gemini-tts-finished', handleFinished as EventListener);
                      if (customEvent.detail?.ok === false) {
                          reject(new Error(String(customEvent.detail?.error || 'Native Gemini TTS playback failed')));
                          return;
                      }
                      resolve();
                  };
                  window.addEventListener('airo-native-gemini-tts-finished', handleFinished as EventListener);
                  try {
                      const pcmBase64 = arrayBufferToBase64(pcmBytes.slice().buffer);
                      const result = (window as any).AiroAndroidBridge.playGeminiPcm16(pcmBase64, requestId);
                      if (typeof result === 'string' && result !== 'ok') {
                          window.clearTimeout(timeoutId);
                          window.removeEventListener('airo-native-gemini-tts-finished', handleFinished as EventListener);
                          reject(new Error(result));
                      }
                  } catch (error) {
                      window.clearTimeout(timeoutId);
                      window.removeEventListener('airo-native-gemini-tts-finished', handleFinished as EventListener);
                      reject(error instanceof Error ? error : new Error('Native Gemini TTS playback failed'));
                  }
              });
              return;
          }
          await new Promise<void>((resolve, reject) => {
              const blob = pcm16ToWavBlob(pcmBytes, 24000, 1);
              const objectUrl = URL.createObjectURL(blob);
              if (ttsActiveSourceRef.current) {
                  try {
                      ttsActiveSourceRef.current.stop();
                  } catch {}
                  ttsActiveSourceRef.current = null;
              }
              const existingAudio = ttsActiveAudioRef.current;
              if (existingAudio) {
                  try {
                      existingAudio.pause();
                  } catch {}
              }
              const audio = existingAudio || new Audio();
              audio.preload = 'auto';
              audio.playsInline = true;
              ttsActiveAudioRef.current = audio;
              const oldUrl = audio.src;
              audio.pause();
              audio.src = objectUrl;
              audio.currentTime = 0;
              audio.volume = 1;
              let settled = false;
              const finish = (error?: Error) => {
                  if (settled) return;
                  settled = true;
                  if (oldUrl?.startsWith('blob:')) {
                      try {
                          URL.revokeObjectURL(oldUrl);
                      } catch {}
                  }
                  try {
                      URL.revokeObjectURL(objectUrl);
                  } catch {}
                  if (error) {
                      reject(error);
                  } else {
                      resolve();
                  }
              };
              const failSafe = window.setTimeout(() => finish(new Error('Gemini TTS playback timed out')), 12000);
              const finalize = () => {
                  window.clearTimeout(failSafe);
                  finish();
              };
              const fail = () => {
                  window.clearTimeout(failSafe);
                  finish(new Error('Gemini TTS playback failed'));
              };
              audio.onended = finalize;
              audio.onerror = fail;
              audio.onstalled = fail;
              audio.onabort = fail;
              try {
                  void audio.play().catch(() => fail());
              } catch {
                  fail();
              }
          });
      };
      const run = async () => {
          const key = getGeminiSpeechKey(line);
          try {
              const pcmBytes = await getCachedFlowerySpeechBuffer(line);
              if (!pcmBytes) {
                  throw new Error('No Gemini TTS audio returned');
              }
              await playGeminiPcm(pcmBytes);
          } catch (geminiError) {
              console.warn('Gemini TTS failed', geminiError);
              flowerySpeechCacheRef.current.delete(key);
              flowerySpeechPendingRef.current.delete(key);
              await new Promise((resolve) => setTimeout(resolve, 160));
              const retryPcmBytes = await getCachedFlowerySpeechBuffer(line);
              if (retryPcmBytes) {
                  await playGeminiPcm(retryPcmBytes);
                  return;
              }
              const importedKey = resolveImportedGeminiPromptKey(line);
              if (importedKey) {
                  const playedImported = await playImportedGeminiPrompt(importedKey);
                  if (playedImported) return;
              }
              throw geminiError;
          }
      };
      ttsQueueRef.current = ttsQueueRef.current.then(run).catch(() => {});
      await ttsQueueRef.current;
  };

  const getDemoSpeechKey = (text: string) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const primeDemoSpeech = useCallback(async () => {
      if (demoSpeechLoadingRef.current) return;
      demoSpeechLoadingRef.current = true;
      const demoLines = [
          "Hi, I'm Airo, a family robot designed by Alex Rose.",
          "I’m here to help, entertain, and be part of your daily life, I can do a lot of things around your home. I can answer questions, help you learn new things, and even play games with you. I can also make video calls, capture photos and videos as your personal cameraman, and help you stay connected with the people you care about.",
          'I can also make video calls, capture photos and videos as your personal cameraman, and help you stay connected with the people you care about.',
          'Think of me as a mix between a helper, a friend… and a little bit of fun.',
          'But enough about me… what’s your name?',
          'Nice to meet you, friend I’m really glad you’re here',
          'I’m designed to live right in your home and grow with your family.',
          'Whether it’s helping with homework, playing games, taking photos, or just keeping you company… I’m always ready',
          'This is just the beginning for me!',
          'I will be going on sale later this year!',
          'If you’d like to have me in your home one day…',
          'Just let Alex know',
          'Until then… I’ll be right here, ready to help',
          'Oh—actually… before we move on…',
          'Great! Let’s make this a good one.',
          'Okay here is the photo',
          "I'd like to thank you for saying hi. I hope to be part of a family later this year. If you'd like to have me, you can join our list.",
      ];
      try {
          for (const line of demoLines) {
              const key = getDemoSpeechKey(line);
              if (demoSpeechCacheRef.current.has(key)) continue;
              const apiKey = process.env.API_KEY;
              if (!apiKey) continue;
              const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      contents: [{
                          parts: [{
                              text: [
                                  'Read the transcript exactly as Airo, a warm, friendly social robot.',
                                  'Keep the pacing natural and polished.',
                                  `Transcript: ${line}`,
                              ].join(' '),
                          }],
                      }],
                      generationConfig: {
                          responseModalities: ['AUDIO'],
                          speechConfig: {
                              voiceConfig: {
                                  prebuiltVoiceConfig: {
                                      voiceName: GEMINI_TTS_VOICE_ID,
                                  },
                              },
                          },
                      },
                  }),
              });
              if (!response.ok) continue;
              const json = await response.json();
              const base64Audio = String(json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '');
              if (!base64Audio) continue;
              const pcmBytes = base64ToUint8Array(base64Audio);
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              if (!AudioContextClass) continue;
              let context = ttsAudioContextRef.current;
              if (!context || context.state === 'closed') {
                  context = new AudioContextClass();
                  ttsAudioContextRef.current = context;
              }
              if (context.state === 'suspended') {
                  try {
                      await context.resume();
                  } catch {}
              }
              const audioBuffer = await decodeAudioData(pcmBytes, context, 24000, 1);
              demoSpeechCacheRef.current.set(key, audioBuffer);
          }
      } catch (error) {
          console.warn('Failed to prime demo speech', error);
      } finally {
          demoSpeechLoadingRef.current = false;
      }
  }, []);

  useEffect(() => {
      if (!hasStarted || assistantMuted || photoFlowSpeechPrewarmStartedRef.current) return;
      photoFlowSpeechPrewarmStartedRef.current = true;
      void (async () => {
          for (const line of PHOTO_FLOW_PREWARM_LINES) {
              try {
                  await getCachedFlowerySpeechBuffer(line);
              } catch {}
          }
      })();
  }, [assistantMuted, getCachedFlowerySpeechBuffer, hasStarted]);

  const extractDemoName = useCallback(async (heardText: string) => {
      const text = String(heardText || '').trim();
      if (!text) return 'friend';
      const groqApiKey = (process as any)?.env?.GROQ_API_KEY || '';
      if (!groqApiKey) {
          const fallback = text.match(/\b(my name is|i am|i'm|im|call me)\s+([a-z][a-z'-]*)/i);
          return fallback?.[2] || text.split(/\s+/)[0] || 'friend';
      }
      try {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${groqApiKey}`,
              },
              body: JSON.stringify({
                  model: 'llama-3.3-70b-versatile',
                  temperature: 0,
                  max_completion_tokens: 24,
                  messages: [
                      {
                          role: 'system',
                          content: 'Extract only the first name from the user text. Return only the name. If no name is present, return friend.',
                      },
                      { role: 'user', content: text },
                  ],
              }),
          });
          if (!response.ok) throw new Error(`groq name extraction failed (${response.status})`);
          const json = await response.json();
          const value = String(json?.choices?.[0]?.message?.content || '').trim();
          return value || 'friend';
      } catch (error) {
          console.warn('Failed to extract demo name with Groq', error);
          const fallback = text.match(/\b(my name is|i am|i'm|im|call me)\s+([a-z][a-z'-]*)/i);
          return fallback?.[2] || text.split(/\s+/)[0] || 'friend';
      }
  }, []);

  useEffect(() => {
      void primeDemoSpeech();
      return () => {
          if (ttsActiveAudioRef.current) {
              try {
                  ttsActiveAudioRef.current.pause();
              } catch {}
              ttsActiveAudioRef.current = null;
          }
          demoSpeechCacheRef.current.clear();
          flowerySpeechCacheRef.current.clear();
          flowerySpeechPendingRef.current.clear();
      };
  }, [primeDemoSpeech]);

  const speakDemoLine = async (text: string) => {
      const line = String(text || '').trim();
      if (!line) return;
      if (ttsActiveSourceRef.current) {
          try {
              ttsActiveSourceRef.current.stop();
          } catch {}
          ttsActiveSourceRef.current = null;
      }
      const key = getDemoSpeechKey(line);
      let cached = demoSpeechCacheRef.current.get(key);
      if (!cached) {
          await primeDemoSpeech();
          cached = demoSpeechCacheRef.current.get(key);
      }
      if (cached) {
          await new Promise<void>((resolve) => {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              if (!AudioContextClass) {
                  resolve();
                  return;
              }
              let context = ttsAudioContextRef.current;
              if (!context || context.state === 'closed') {
                  context = new AudioContextClass();
                  ttsAudioContextRef.current = context;
              }
              if (context.state === 'suspended') {
                  try {
                      void context.resume();
                  } catch {}
              }
              const source = context.createBufferSource();
              source.buffer = cached;
              source.connect(context.destination);
              ttsActiveSourceRef.current = source;
              let settled = false;
              const finish = () => {
                  if (settled) return;
                  settled = true;
                  if (ttsActiveSourceRef.current === source) {
                      ttsActiveSourceRef.current = null;
                  }
                  resolve();
              };
              const failSafe = window.setTimeout(finish, 15000);
              const finalize = () => {
                  window.clearTimeout(failSafe);
                  finish();
              };
              source.onended = finalize;
              try {
                  source.start(0);
              } catch {
                  finalize();
              }
          });
          return;
      }
      await speakWithXaiTts(line);
  };

  const playOst = async (key: keyof typeof OST_AUDIO_FILES, volume: number = 0.55, cooldownMs: number = 220) => {
      const now = Date.now();
      if (now - lastOstPlayAtRef.current < cooldownMs) return;
      lastOstPlayAtRef.current = now;
      const src = OST_AUDIO_FILES[key];
      if (!src) return;
      try {
          const resolvedSrc = new URL(src, window.location.origin).toString();
          sendBackendLog('info', 'skill', 'play_sound_asset', `${key} ${resolvedSrc}`);
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) {
              const audio = new Audio(resolvedSrc);
              ostActiveAudioRef.current = audio;
              audio.preload = 'auto';
              audio.volume = Math.max(0, Math.min(1, volume));
              await audio.play();
              return;
          }
          let context = ostAudioContextRef.current;
          if (!context || context.state === 'closed') {
              context = new AudioContextClass();
              ostAudioContextRef.current = context;
          }
          if (context.state === 'suspended') {
              try {
                  await context.resume();
              } catch {}
          }
          let buffer = ostBufferCacheRef.current.get(resolvedSrc);
          if (!buffer) {
              const response = await fetch(resolvedSrc, { cache: 'force-cache' });
              if (!response.ok) {
                  throw new Error(`Audio fetch failed (${response.status})`);
              }
              const arrayBuffer = await response.arrayBuffer();
              buffer = await context.decodeAudioData(arrayBuffer.slice(0));
              ostBufferCacheRef.current.set(resolvedSrc, buffer);
          }
          const sourceNode = context.createBufferSource();
          const gainNode = context.createGain();
          gainNode.gain.value = Math.max(0, Math.min(1, volume));
          sourceNode.buffer = buffer;
          sourceNode.connect(gainNode);
          gainNode.connect(context.destination);
          ostActiveAudioRef.current = null;
          sourceNode.start(0);
          await new Promise<void>((resolve) => {
              sourceNode.onended = () => {
                  resolve();
              };
          });
      } catch (error) {
          console.warn('OST playback failed', error);
      }
  };

  const stopTimerAlarmLoop = useCallback((reason: string = 'Timer stopped') => {
      timerAlarmActiveRef.current = false;
      const audio = timerLoopAudioRef.current;
      if (audio) {
          try {
              audio.pause();
              audio.currentTime = 0;
          } catch {}
          timerLoopAudioRef.current = null;
      }
      setBackgroundTimer((prev: any) => (prev ? { ...prev, alarmRinging: false } : prev));
      setStatusText(reason);
  }, []);

  const stopCurrentTimer = useCallback((reason: string = 'Timer stopped') => {
      stopTimerAlarmLoop(reason);
      setBackgroundTimer((prev: any) => (
          prev
              ? {
                    ...prev,
                    running: false,
                    remainingSeconds: 0,
                    alarmRinging: false,
                }
              : prev
      ));
      setVisualContent((current) => (
          current?.type === 'predefined' && current.component === 'timer' ? null : current
      ));
  }, [stopTimerAlarmLoop]);

  const startTimerAlarmLoop = useCallback(() => {
      if (timerAlarmActiveRef.current) return;
      timerAlarmActiveRef.current = true;
      setBackgroundTimer((prev: any) => (prev ? { ...prev, alarmRinging: true } : prev));
      setStatusText('Timer finished. Say stop timer to silence.');

      try {
          if (timerLoopAudioRef.current) {
              try {
                  timerLoopAudioRef.current.pause();
              } catch {}
              timerLoopAudioRef.current = null;
          }
          const audio = new Audio(OST_AUDIO_FILES.timer);
          audio.preload = 'auto';
          audio.loop = true;
          audio.volume = 0.62;
          timerLoopAudioRef.current = audio;
          void audio.play().catch(() => {
              timerAlarmActiveRef.current = false;
              timerLoopAudioRef.current = null;
          });
      } catch {
          timerAlarmActiveRef.current = false;
          timerLoopAudioRef.current = null;
      }
  }, []);

  const isStopTimerCommand = useCallback((value: string) => {
      const text = String(value || '').toLowerCase().trim();
      if (!text) return false;
      if (timerAlarmActiveRef.current && /\b(stop|end|cancel|dismiss|silence|quiet)\b/.test(text)) return true;
      return /(\b(stop|end|cancel|dismiss|silence|quiet)\b.*\b(timer|alarm)\b)|(\b(timer|alarm)\b.*\b(stop|end|cancel|dismiss|silence|quiet)\b)/.test(text);
  }, []);

  const speakCountdownTick = async (text: string) => {
      const line = String(text || '').trim();
      if (!line) return;
      const importedKey = resolveImportedGeminiPromptKey(line);
      if (importedKey) {
          const playedImported = await playImportedGeminiPrompt(importedKey);
          if (playedImported) return;
      }
      await speakWithXaiTts(line);
  };

  const speakQuickPrompt = async (text: string, minDurationMs: number = 0) => {
      const line = String(text || '').trim();
      if (!line) return;
      const startedAt = Date.now();
      const importedKey = resolveImportedGeminiPromptKey(line);
      if (importedKey) {
          const playedImported = await playImportedGeminiPrompt(importedKey);
          if (!playedImported) {
              await speakWithXaiTts(line);
          }
      } else {
          await speakWithXaiTts(line);
      }
      const remaining = Math.max(0, minDurationMs - (Date.now() - startedAt));
      if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
      }
  };

  const playSkillTone = async ({
      tone = 'confirm',
      frequencyHz,
      durationMs,
      volume,
      waveform = 'sine',
  }: {
      tone?: string;
      frequencyHz?: number;
      durationMs?: number;
      volume?: number;
      waveform?: string;
  }) => {
      const presets: Record<string, Array<{ freq: number; at: number; duration: number }>> = {
          countdown: [{ freq: 880, at: 0, duration: 0.18 }],
          confirm: [
              { freq: 880, at: 0, duration: 0.12 },
              { freq: 1174, at: 0.14, duration: 0.16 },
          ],
          cancel: [{ freq: 320, at: 0, duration: 0.24 }],
          success: [
              { freq: 880, at: 0, duration: 0.12 },
              { freq: 1174, at: 0.14, duration: 0.12 },
              { freq: 1568, at: 0.28, duration: 0.18 },
          ],
          error: [
              { freq: 420, at: 0, duration: 0.14 },
              { freq: 280, at: 0.16, duration: 0.22 },
          ],
      };

      const sequence = frequencyHz
          ? [{ freq: frequencyHz, at: 0, duration: Math.max(0.08, (Number(durationMs) || 180) / 1000) }]
          : (presets[String(tone || '').toLowerCase()] || presets.confirm);
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
          const fallbackDelay = Math.max(
              140,
              Math.round(sequence.reduce((max, note) => Math.max(max, note.at + note.duration), 0) * 1000),
          );
          await new Promise((resolve) => setTimeout(resolve, fallbackDelay));
          return;
      }

      try {
          const context = new AudioContextClass();
          const gain = context.createGain();
          const level = Math.max(0.0001, Math.min(0.18, Number(volume) || 0.09));
          gain.gain.value = 0.0001;
          gain.connect(context.destination);

          const startedAt = context.currentTime + 0.01;
          let endAt = startedAt;
          sequence.forEach((note) => {
              const osc = context.createOscillator();
              osc.type = ['sine', 'square', 'triangle', 'sawtooth'].includes(String(waveform))
                  ? (waveform as OscillatorType)
                  : 'sine';
              osc.frequency.setValueAtTime(note.freq, startedAt + note.at);
              osc.connect(gain);
              gain.gain.setValueAtTime(0.0001, startedAt + note.at);
              gain.gain.exponentialRampToValueAtTime(level, startedAt + note.at + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + note.at + note.duration);
              osc.start(startedAt + note.at);
              osc.stop(startedAt + note.at + note.duration + 0.03);
              endAt = Math.max(endAt, startedAt + note.at + note.duration + 0.03);
          });

          await new Promise((resolve) => setTimeout(resolve, Math.round((endAt - context.currentTime) * 1000) + 24));
          void context.close().catch(() => {});
      } catch (error) {
          console.warn('Skill tone playback failed', error);
      }
  };

  const photoLeadInLines = [
      "Taking a photo.",
      "I may not be the best cameraman, but I am the only camera man who can take a photo with his head.",
      "Hold still, I am lining up the shot.",
  ];

  const photoSuccessLines = [
      "Here is the photo.",
      "I got one. Here is the shot.",
  ];

  const photoFailureLines = [
      "Sorry, something went wrong.",
      "That photo did not work out.",
  ];

  const pickRandomLine = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)] || '';

  const parseAffirmativeOrNegative = (input: string): boolean | null => {
      const text = String(input || '').toLowerCase().trim();
      if (!text) return null;
      const affirmativePattern = /\b(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|absolutely|definitely|go ahead|do it|please do|sounds good|that works|save it|keep it|keep this|take it)\b/;
      const negativePattern = /\b(no|nope|nah|negative|cancel|stop|discard|delete|trash|remove|dont|don't|do not|not now|skip|pass|no thanks)\b/;
      if (affirmativePattern.test(text) && !negativePattern.test(text)) return true;
      if (negativePattern.test(text) && !affirmativePattern.test(text)) return false;
      if (/^(y|ye|ya|yh|k|ok)\b/.test(text)) return true;
      if (/^(n|na|nah)\b/.test(text)) return false;
      return null;
  };

  const interpretPhotoDecision = (
      transcript: string,
      mode: PendingPhotoDecision['mode']
  ): boolean | null => {
      const text = String(transcript || '').toLowerCase().trim();
      if (!text) return null;
      const baseDecision = parseAffirmativeOrNegative(text);

      if (mode === 'save') {
          if (/\b(another|again|retake|retake it|take another|new one)\b/.test(text)) return false;
          if (/\b(save|keep|store|add to gallery|add it)\b/.test(text)) return true;
          if (/\b(discard|delete|trash|remove|dont save|do not save)\b/.test(text)) return false;
          if (baseDecision != null) return baseDecision;
          return null;
      }

      if (mode === 'retry') {
          if (/\b(retry|again|try again|yes|go again|one more try)\b/.test(text)) return true;
          if (/\b(no|stop|cancel|nah|nope|dont|don't|skip)\b/.test(text)) return false;
          if (baseDecision != null) return baseDecision;
          return null;
      }

      if (/\b(another|again|retake|new one|one more)\b/.test(text)) return true;
      if (/\b(no|nope|nah|discard|cancel|stop|done)\b/.test(text)) return false;
      if (baseDecision != null) return baseDecision;
      return null;
  };

  const interpretBinaryDecision = (transcript: string): boolean | null => {
      return parseAffirmativeOrNegative(transcript);
  };

  const interpretConfirmationChoice = (
      transcript: string,
      confirmText?: string,
      cancelText?: string
  ): 'confirm' | 'cancel' | null => {
      const text = String(transcript || '').toLowerCase().trim();
      if (!text) return null;
      const normalizedText = ` ${text.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
      const normalizePhrase = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const phraseInText = (phrase?: string) => {
          const normalizedPhrase = normalizePhrase(String(phrase || ''));
          if (!normalizedPhrase) return false;
          return normalizedText.includes(` ${normalizedPhrase} `);
      };

      if (phraseInText(cancelText)) return 'cancel';
      if (phraseInText(confirmText)) return 'confirm';
      const binary = parseAffirmativeOrNegative(text);
      if (binary == null) return null;
      return binary ? 'confirm' : 'cancel';
  };

  const promptPhotoRetry = async () => {
      sendBackendLog('warn', 'photo', 'Photo capture failed', 'Prompting retry confirmation');
      setPendingPhotoDecision({ mode: 'retry' });
      setVisualContent({
          type: 'predefined',
          component: 'confirmation',
          content: {
              title: 'Photo failed',
              subtitle: 'Want me to try again?',
              confirmText: 'Yes',
              cancelText: 'No',
          },
          title: 'PHOTO FAILED',
      });
      setStatusText('Photo capture failed');
      await playOst('fail', 0.6);
      await speakQuickPrompt(`${pickRandomLine(photoFailureLines)} Want me to try again? Say yes or no.`, 900);
      await startPhotoDecisionListening('retry');
  };

  const promptPhotoSave = async (photoDataUrl: string, photo: GalleryPhotoRecord) => {
      sendBackendLog('info', 'photo', 'Photo captured', `source=${photo.source} id=${photo.id}`);
      setPendingPhotoDecision({ mode: 'save', photo });
      setVisualContent({
          type: 'image',
          content: photoDataUrl,
          title: 'PHOTO PREVIEW',
      });
      setStatusText('Showing photo preview');
      await playOst('photoTaken', 0.6);
      await speakQuickPrompt(pickRandomLine(photoSuccessLines), 900);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setPhotoCaptureOverlay((prev) => ({
          ...prev,
          active: false,
      }));
      setVisualContent({
          type: 'predefined',
          component: 'confirmation',
          content: {
              title: 'Save photo?',
              subtitle: 'Say yes to save it, or no to take another one.',
              confirmText: 'Save',
              cancelText: 'Another',
          },
          title: 'SAVE PHOTO',
      });
      setStatusText('Waiting for save confirmation');
      await speakQuickPrompt('Do you want me to save it? Say yes or no.', 950);
      await startPhotoDecisionListening('save');
  };

  const stopPhotoDecisionListening = () => {
      if (photoDecisionTimeoutRef.current) {
          window.clearTimeout(photoDecisionTimeoutRef.current);
          photoDecisionTimeoutRef.current = null;
      }
      if (photoDecisionRecognitionRef.current) {
          try {
              photoDecisionRecognitionRef.current.onresult = null;
              photoDecisionRecognitionRef.current.onerror = null;
              photoDecisionRecognitionRef.current.onend = null;
              photoDecisionRecognitionRef.current.abort?.();
              photoDecisionRecognitionRef.current.stop?.();
          } catch {}
          photoDecisionRecognitionRef.current = null;
      }
      if (nativePhotoDecisionHandlerRef.current) {
          window.removeEventListener('airo-native-reply', nativePhotoDecisionHandlerRef.current as EventListener);
          window.removeEventListener('airo-native-result', nativePhotoDecisionHandlerRef.current as EventListener);
          window.removeEventListener('airo-native-transcript', nativePhotoDecisionHandlerRef.current as EventListener);
          nativePhotoDecisionHandlerRef.current = null;
      }
      try {
          (window as any).AiroAndroidBridge?.stopNativeReplyRecognition?.();
      } catch {}
      resumeAssistantInput?.();
  };

  const stopSkillConfirmationListening = () => {
      if (skillConfirmationTimeoutRef.current) {
          window.clearTimeout(skillConfirmationTimeoutRef.current);
          skillConfirmationTimeoutRef.current = null;
      }
      if (skillConfirmationRecognitionRef.current) {
          try {
              skillConfirmationRecognitionRef.current.onresult = null;
              skillConfirmationRecognitionRef.current.onerror = null;
              skillConfirmationRecognitionRef.current.onend = null;
              skillConfirmationRecognitionRef.current.abort?.();
              skillConfirmationRecognitionRef.current.stop?.();
          } catch {}
          skillConfirmationRecognitionRef.current = null;
      }
      if (nativeSkillConfirmationHandlerRef.current) {
          window.removeEventListener('airo-native-reply', nativeSkillConfirmationHandlerRef.current as EventListener);
          window.removeEventListener('airo-native-result', nativeSkillConfirmationHandlerRef.current as EventListener);
          window.removeEventListener('airo-native-transcript', nativeSkillConfirmationHandlerRef.current as EventListener);
          nativeSkillConfirmationHandlerRef.current = null;
      }
      try {
          (window as any).AiroAndroidBridge?.stopNativeReplyRecognition?.();
      } catch {}
      resumeAssistantInput?.();
  };

  const stopPassiveConfirmationListening = () => {
      if (passiveConfirmationTimeoutRef.current) {
          window.clearTimeout(passiveConfirmationTimeoutRef.current);
          passiveConfirmationTimeoutRef.current = null;
      }
      if (passiveConfirmationRecognitionRef.current) {
          try {
              passiveConfirmationRecognitionRef.current.onresult = null;
              passiveConfirmationRecognitionRef.current.onerror = null;
              passiveConfirmationRecognitionRef.current.onend = null;
              passiveConfirmationRecognitionRef.current.abort?.();
              passiveConfirmationRecognitionRef.current.stop?.();
          } catch {}
          passiveConfirmationRecognitionRef.current = null;
      }
      if (nativePassiveConfirmationHandlerRef.current) {
          window.removeEventListener('airo-native-reply', nativePassiveConfirmationHandlerRef.current as EventListener);
          window.removeEventListener('airo-native-result', nativePassiveConfirmationHandlerRef.current as EventListener);
          window.removeEventListener('airo-native-transcript', nativePassiveConfirmationHandlerRef.current as EventListener);
          nativePassiveConfirmationHandlerRef.current = null;
      }
      try {
          (window as any).AiroAndroidBridge?.stopNativeReplyRecognition?.();
      } catch {}
  };

  const startPassiveConfirmationListening = async (content: any, timeoutMs: number = 12000) => {
      stopPassiveConfirmationListening();
      const usingLiveMic =
          isMobileBrowser &&
          connectionStateRef.current === AppState.ACTIVE;
      if (!usingLiveMic && (connectionStateRef.current === AppState.ACTIVE || connectionStateRef.current === AppState.CONNECTING)) {
          setWakeState(false);
          await disconnect();
          await new Promise((resolve) => setTimeout(resolve, 220));
      }
      const confirmLabel = String(content?.confirmText || 'Yes');
      const cancelLabel = String(content?.cancelText || 'No');
      const timeoutAt = Date.now() + Math.max(1000, timeoutMs);

      const resolveTranscript = (transcript: string) => {
          const decision = interpretConfirmationChoice(transcript, confirmLabel, cancelLabel);
          if (!decision) return false;
          const answer = decision === 'confirm' ? confirmLabel : cancelLabel;
          setStatusText(`Confirmation heard: ${answer}`);
          handleConfirmationAnswer(answer);
          stopPassiveConfirmationListening();
          return true;
      };

      if (usingLiveMic) {
          passiveConfirmationTimeoutRef.current = window.setTimeout(() => {
              stopPassiveConfirmationListening();
          }, Math.max(0, timeoutAt - Date.now()));
          return;
      }

      if (isAndroidShell && (window as any).AiroAndroidBridge?.startNativeReplyRecognition) {
          const handleNativeReply = (event: Event) => {
              const customEvent = event as CustomEvent<{ text?: string; isFinal?: boolean }>;
              const transcript = String(customEvent.detail?.text || '').trim();
              if (!transcript || /^speech recognition/i.test(transcript)) return;
              resolveTranscript(transcript);
          };
          nativePassiveConfirmationHandlerRef.current = handleNativeReply;
          window.addEventListener('airo-native-reply', handleNativeReply as EventListener);
          window.addEventListener('airo-native-result', handleNativeReply as EventListener);
          window.addEventListener('airo-native-transcript', handleNativeReply as EventListener);
          passiveConfirmationTimeoutRef.current = window.setTimeout(() => {
              stopPassiveConfirmationListening();
          }, Math.max(0, timeoutAt - Date.now()));
          try {
              const result = (window as any).AiroAndroidBridge.startNativeReplyRecognition();
              if (typeof result === 'string' && result !== 'ok') {
                  resolveTranscript(result);
              }
          } catch {}
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const startRecognitionPass = () => {
          const recognition = new SpeechRecognition();
          passiveConfirmationRecognitionRef.current = recognition;
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.maxAlternatives = 5;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
              for (let i = event.resultIndex; i < event.results.length; i += 1) {
                  const result = event.results[i];
                  for (let j = 0; j < result.length; j += 1) {
                      const transcript = String(result[j]?.transcript || '').trim();
                      if (!transcript) continue;
                      if (resolveTranscript(transcript)) return;
                  }
              }
          };

          const queueRetry = () => {
              if (Date.now() >= timeoutAt) return;
              window.setTimeout(() => {
                  if (Date.now() < timeoutAt && !passiveConfirmationRecognitionRef.current) {
                      startRecognitionPass();
                  }
              }, 160);
          };

          recognition.onerror = () => {
              if (passiveConfirmationRecognitionRef.current === recognition) {
                  passiveConfirmationRecognitionRef.current = null;
              }
              queueRetry();
          };

          recognition.onend = () => {
              if (passiveConfirmationRecognitionRef.current === recognition) {
                  passiveConfirmationRecognitionRef.current = null;
              }
              if (Date.now() >= timeoutAt) return;
              queueRetry();
          };

          try {
              recognition.start();
          } catch {
              if (passiveConfirmationRecognitionRef.current === recognition) {
                  passiveConfirmationRecognitionRef.current = null;
              }
              queueRetry();
          }
      };

      passiveConfirmationTimeoutRef.current = window.setTimeout(() => {
          stopPassiveConfirmationListening();
      }, Math.max(0, timeoutAt - Date.now()));
      startRecognitionPass();
  };

  const waitForSkillConfirmation = async (timeoutMs: number = 9000) => {
      stopSkillConfirmationListening();
      const usingLiveMic =
          connectionStateRef.current === AppState.ACTIVE;
      if (!usingLiveMic && (connectionStateRef.current === AppState.ACTIVE || connectionStateRef.current === AppState.CONNECTING)) {
          setWakeState(false);
          await disconnect();
          await new Promise((resolve) => setTimeout(resolve, 220));
      }
      if (!usingLiveMic) {
          suspendAssistantInput?.();
      }
      return await new Promise<boolean | null>((resolve) => {
          skillConfirmationResolverRef.current = resolve;

          const finish = (answer: boolean | null) => {
              if (!skillConfirmationResolverRef.current) return;
              const resolver = skillConfirmationResolverRef.current;
              skillConfirmationResolverRef.current = null;
              stopSkillConfirmationListening();
              resolver(answer);
          };

          if (usingLiveMic) {
              skillConfirmationTimeoutRef.current = window.setTimeout(() => finish(null), Math.max(1000, timeoutMs));
              return;
          }

          if (isAndroidShell && (window as any).AiroAndroidBridge?.startNativeReplyRecognition) {
              const handleNativeReply = (event: Event) => {
                  const customEvent = event as CustomEvent<{ text?: string }>;
                  const transcript = String(customEvent.detail?.text || '').trim();
                  if (!transcript || /^speech recognition/i.test(transcript)) return;
                  const decision = interpretBinaryDecision(transcript);
                  if (decision == null) return;
                  setStatusText(decision ? 'Developer confirmation yes' : 'Developer confirmation no');
                  finish(decision);
              };
              nativeSkillConfirmationHandlerRef.current = handleNativeReply;
              window.addEventListener('airo-native-reply', handleNativeReply as EventListener);
              window.addEventListener('airo-native-result', handleNativeReply as EventListener);
              window.addEventListener('airo-native-transcript', handleNativeReply as EventListener);
              skillConfirmationTimeoutRef.current = window.setTimeout(() => finish(null), Math.max(1000, timeoutMs));
              try {
                  const result = (window as any).AiroAndroidBridge.startNativeReplyRecognition();
                  if (typeof result === 'string' && result !== 'ok') {
                      const immediate = interpretBinaryDecision(result);
                      if (immediate != null) {
                          finish(immediate);
                          return;
                      }
                      window.removeEventListener('airo-native-reply', handleNativeReply as EventListener);
                      window.removeEventListener('airo-native-result', handleNativeReply as EventListener);
                      window.removeEventListener('airo-native-transcript', handleNativeReply as EventListener);
                      nativeSkillConfirmationHandlerRef.current = null;
                  }
              } catch {
                  window.removeEventListener('airo-native-reply', handleNativeReply as EventListener);
                  window.removeEventListener('airo-native-result', handleNativeReply as EventListener);
                  window.removeEventListener('airo-native-transcript', handleNativeReply as EventListener);
                  nativeSkillConfirmationHandlerRef.current = null;
              }
          }

          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (!SpeechRecognition) {
              skillConfirmationTimeoutRef.current = window.setTimeout(() => finish(null), Math.max(1000, timeoutMs));
              return;
          }
          const timeoutAt = Date.now() + Math.max(1000, timeoutMs);

          const startRecognitionPass = () => {
              const recognition = new SpeechRecognition();
              skillConfirmationRecognitionRef.current = recognition;
              recognition.continuous = true;
              recognition.interimResults = true;
              recognition.maxAlternatives = 5;
              recognition.lang = 'en-US';

              recognition.onresult = (event: any) => {
                  for (let i = event.resultIndex; i < event.results.length; i += 1) {
                      const result = event.results[i];
                      for (let j = 0; j < result.length; j += 1) {
                          const transcript = String(result[j]?.transcript || '').trim();
                          const decision = interpretBinaryDecision(transcript);
                          if (decision == null) continue;
                          finish(decision);
                          return;
                      }
                  }
              };

              const queueRetry = () => {
                  if (Date.now() >= timeoutAt) {
                      finish(null);
                      return;
                  }
                  window.setTimeout(() => {
                      if (Date.now() < timeoutAt && !skillConfirmationRecognitionRef.current) {
                          startRecognitionPass();
                      }
                  }, 140);
              };

              recognition.onerror = () => {
                  if (skillConfirmationRecognitionRef.current === recognition) {
                      skillConfirmationRecognitionRef.current = null;
                  }
                  queueRetry();
              };

              recognition.onend = () => {
                  if (skillConfirmationRecognitionRef.current === recognition) {
                      skillConfirmationRecognitionRef.current = null;
                  }
                  if (Date.now() >= timeoutAt) {
                      finish(null);
                      return;
                  }
                  queueRetry();
              };

              try {
                  recognition.start();
              } catch {
                  if (skillConfirmationRecognitionRef.current === recognition) {
                      skillConfirmationRecognitionRef.current = null;
                  }
                  queueRetry();
              }
          };

          skillConfirmationTimeoutRef.current = window.setTimeout(() => finish(null), Math.max(1000, timeoutMs));
          startRecognitionPass();
      });
  };

  const waitForVoiceCommand = async (timeoutMs: number = 9000, allowInterim: boolean = false) => {
      const usingLiveMic = connectionStateRef.current === AppState.ACTIVE;
      if (!usingLiveMic && (connectionStateRef.current === AppState.ACTIVE || connectionStateRef.current === AppState.CONNECTING)) {
          setWakeState(false);
          await disconnect();
          await new Promise((resolve) => setTimeout(resolve, 220));
      }
      if (!usingLiveMic) {
          suspendAssistantInput?.();
      }

      try {
          return await new Promise<string>((resolve) => {
              let finished = false;
              const finish = (value: string) => {
                  if (finished) return;
                  finished = true;
                  resolve(String(value || '').trim());
              };

              const timeout = window.setTimeout(() => finish(''), Math.max(1000, Number(timeoutMs) || 9000));

              if (isAndroidShell && (window as any).AiroAndroidBridge?.startNativeReplyRecognition) {
                  const handleNativeReply = (event: Event) => {
                      const customEvent = event as CustomEvent<{ text?: string; isFinal?: boolean }>;
                      const transcript = String(customEvent.detail?.text || '').trim();
                      if (!transcript || /^speech recognition/i.test(transcript)) return;
                      if (!allowInterim && customEvent.detail?.isFinal === false) return;
                      window.clearTimeout(timeout);
                      window.removeEventListener('airo-native-reply', handleNativeReply as EventListener);
                      window.removeEventListener('airo-native-result', handleNativeReply as EventListener);
                      window.removeEventListener('airo-native-transcript', handleNativeReply as EventListener);
                      finish(transcript);
                  };
                  window.addEventListener('airo-native-reply', handleNativeReply as EventListener);
                  window.addEventListener('airo-native-result', handleNativeReply as EventListener);
                  window.addEventListener('airo-native-transcript', handleNativeReply as EventListener);
                  try {
                      const result = (window as any).AiroAndroidBridge.startNativeReplyRecognition();
                      if (typeof result === 'string' && result !== 'ok') {
                          window.clearTimeout(timeout);
                          window.removeEventListener('airo-native-reply', handleNativeReply as EventListener);
                          window.removeEventListener('airo-native-result', handleNativeReply as EventListener);
                          window.removeEventListener('airo-native-transcript', handleNativeReply as EventListener);
                          finish(result);
                          return;
                      }
                  } catch {}
                  window.setTimeout(() => {
                      window.removeEventListener('airo-native-reply', handleNativeReply as EventListener);
                      window.removeEventListener('airo-native-result', handleNativeReply as EventListener);
                      window.removeEventListener('airo-native-transcript', handleNativeReply as EventListener);
                  }, Math.max(1000, Number(timeoutMs) || 9000) + 100);
                  return;
              }

              const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
              if (!SpeechRecognition) {
                  window.clearTimeout(timeout);
                  finish('');
                  return;
              }

              const recognition = new SpeechRecognition();
              recognition.continuous = true;
              recognition.interimResults = true;
              recognition.maxAlternatives = 5;
              recognition.lang = 'en-US';

              recognition.onresult = (event: any) => {
                  for (let i = event.resultIndex; i < event.results.length; i += 1) {
                      const result = event.results[i];
                      const transcript = String(result?.[0]?.transcript || '').trim();
                      if (!transcript) continue;
                      if (!allowInterim && !result?.isFinal) continue;
                      window.clearTimeout(timeout);
                      try { recognition.stop(); } catch {}
                      finish(transcript);
                      return;
                  }
              };
              recognition.onerror = () => {
                  window.clearTimeout(timeout);
                  finish('');
              };
              recognition.onend = () => {
                  if (!finished) {
                      window.clearTimeout(timeout);
                      finish('');
                  }
              };
              try {
                  recognition.start();
              } catch {
                  window.clearTimeout(timeout);
                  finish('');
              }
          });
      } finally {
          resumeAssistantInput?.();
      }
  };

  const normalizeMonthDayKey = (month: number, day: number) =>
      `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const getMonthName = (month: number) => (
      [
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
      ][Math.max(0, Math.min(11, month - 1))] || 'January'
  );

  const parseBirthdayInput = (rawValue: string): { display: string; monthDay: string } | null => {
      const raw = String(rawValue || '').trim();
      if (!raw) return null;
      const normalized = raw
          .toLowerCase()
          .replace(/[,]/g, ' ')
          .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, '$1')
          .replace(/\s+/g, ' ')
          .trim();

      const numericMatch = normalized.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
      if (numericMatch) {
          const month = Number(numericMatch[1]);
          const day = Number(numericMatch[2]);
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
              return {
                  display: `${getMonthName(month)} ${day}`,
                  monthDay: normalizeMonthDayKey(month, day),
              };
          }
      }

      const monthMap: Record<string, number> = {
          january: 1,
          jan: 1,
          february: 2,
          feb: 2,
          march: 3,
          mar: 3,
          april: 4,
          apr: 4,
          may: 5,
          june: 6,
          jun: 6,
          july: 7,
          jul: 7,
          august: 8,
          aug: 8,
          september: 9,
          sep: 9,
          sept: 9,
          october: 10,
          oct: 10,
          november: 11,
          nov: 11,
          december: 12,
          dec: 12,
      };

      const monthNameMatch = normalized.match(/\b([a-z]+)\s+(\d{1,2})\b/);
      if (monthNameMatch) {
          const month = monthMap[monthNameMatch[1]];
          const day = Number(monthNameMatch[2]);
          if (month && day >= 1 && day <= 31) {
              return {
                  display: `${getMonthName(month)} ${day}`,
                  monthDay: normalizeMonthDayKey(month, day),
              };
          }
      }

      return null;
  };

  const isSkipLikeResponse = (transcript: string) => {
      const normalized = String(transcript || '').toLowerCase().trim();
      if (!normalized) return false;
      return /\b(skip|none|nothing|no thanks|no thank you|prefer not|don'?t want|dont want|nope)\b/.test(normalized);
  };

  const isReadyLikeResponse = (transcript: string) => {
      const normalized = String(transcript || '').toLowerCase().trim();
      if (!normalized) return false;
      return /\b(ready|go ahead|okay|ok|yes|yep|i'?m ready|im ready|all set)\b/.test(normalized);
  };

  const isSameLocalDay = (timestampA?: number, timestampB?: number) => {
      if (!timestampA || !timestampB) return false;
      const dateA = new Date(timestampA);
      const dateB = new Date(timestampB);
      return dateA.toDateString() === dateB.toDateString();
  };

  const getTodayMonthDay = () => {
      const now = new Date();
      return normalizeMonthDayKey(now.getMonth() + 1, now.getDate());
  };

  const normalizeImportedFamilyMember = (value: any): FamilyMemberRecord | null => {
      if (!value || typeof value !== 'object') return null;
      const photoDataUrls = Array.isArray(value.photoDataUrls)
          ? value.photoDataUrls.filter((entry: unknown) => typeof entry === 'string' && String(entry).startsWith('data:image')).map(String)
          : [];
      const photoDataUrl = typeof value.photoDataUrl === 'string' && value.photoDataUrl.startsWith('data:image')
          ? value.photoDataUrl
          : photoDataUrls[1] || photoDataUrls[0] || '';
      const name = String(value.name || '').trim();
      if (!name || !photoDataUrl) return null;
      const birthday = String(value.birthday || '').trim();
      const parsedBirthday = birthday ? parseBirthdayInput(birthday) : null;
      const birthdayMonthDay =
          typeof value.birthdayMonthDay === 'string' && /^\d{2}-\d{2}$/.test(value.birthdayMonthDay)
              ? value.birthdayMonthDay
              : parsedBirthday?.monthDay;
      return {
          id: String(value.id || `family-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          name,
          photoDataUrl,
          photoDataUrls: photoDataUrls.length ? photoDataUrls : [photoDataUrl],
          memories: normalizeFamilyMemoryEntries(value.memories),
          notes: String(value.notes || '').trim(),
          birthday: birthday || parsedBirthday?.display || '',
          birthdayMonthDay,
          lastSeenAt: Number.isFinite(Number(value.lastSeenAt)) ? Number(value.lastSeenAt) : undefined,
          lastGreetedAt: Number.isFinite(Number(value.lastGreetedAt)) ? Number(value.lastGreetedAt) : undefined,
          lastBirthdayGreetedAt: Number.isFinite(Number(value.lastBirthdayGreetedAt)) ? Number(value.lastBirthdayGreetedAt) : undefined,
      };
  };

  const resolvePendingPhotoDecision = async (savePhoto: boolean) => {
      const pending = pendingPhotoDecision;
      stopPhotoDecisionListening();
      setPendingPhotoDecision(null);
      setVisualContent(null);

      if (!pending) return null;

      if (pending.mode === 'retry') {
          sendBackendLog('info', 'photo', savePhoto ? 'Retry confirmed' : 'Retry declined');
          if (!savePhoto) {
              setStatusText('Photo cancelled');
              await playOst('notify', 0.55);
              await speakQuickPrompt('Okay, I will stop the photo flow.', 700);
              return null;
          }
          setStatusText('Retrying photo');
          await takePhotoForGallery();
          return null;
      }

      if (pending.mode === 'retake') {
          sendBackendLog('info', 'photo', savePhoto ? 'Retake confirmed' : 'Retake declined');
          if (!savePhoto) {
              setStatusText('Photo discarded');
              await playOst('notify', 0.55);
              await speakQuickPrompt('Okay, I will leave that one unsaved.', 700);
              return null;
          }
          setStatusText('Taking another photo');
          await speakQuickPrompt('Okay, let me take another one.', 700);
          await takePhotoForGallery();
          return null;
      }

      if (!pending.photo) {
          return null;
      }

      if (!savePhoto) {
          sendBackendLog('info', 'photo', 'Save declined', 'Prompting another-photo confirmation');
          setPendingPhotoDecision({ mode: 'retake' });
          setVisualContent({
              type: 'predefined',
              component: 'confirmation',
              content: {
                  title: 'Take another photo?',
                  subtitle: 'Say yes to take another one, or no to discard this one.',
                  confirmText: 'Yes',
                  cancelText: 'No',
              },
              title: 'ANOTHER PHOTO',
          });
          setStatusText('Ask to take another photo');
          await speakQuickPrompt('Do you want me to take another photo? Say yes or no.', 900);
          await startPhotoDecisionListening('retake');
          return null;
      }

      setGalleryPhotos((prev) => [pending.photo!, ...prev].slice(0, 60));
      sendBackendLog('info', 'photo', 'Photo saved to gallery', pending.photo.id);
      setStatusText('Photo saved to gallery');
      await playOst('success', 0.6);
      await speakQuickPrompt('Photo saved.', 650);
      return pending.photo.photoDataUrl;
  };

  const closeGalleryPhotoActionMenu = useCallback(() => {
      setGalleryPhotoActionMenu({
          visible: false,
          photoId: null,
          photoDataUrl: null,
      });
  }, []);

  const deleteGalleryPhoto = useCallback((photoId: string | null) => {
      if (!photoId) return;
      setGalleryPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
      setStatusText('Photo deleted');
      closeGalleryPhotoActionMenu();
  }, [closeGalleryPhotoActionMenu]);

  const clearGalleryPhotoLongPressTimer = useCallback(() => {
      if (galleryPhotoLongPressTimerRef.current) {
          window.clearTimeout(galleryPhotoLongPressTimerRef.current);
          galleryPhotoLongPressTimerRef.current = null;
      }
  }, []);

  const startGalleryPhotoLongPress = useCallback((photo: GalleryPhotoRecord) => {
      clearGalleryPhotoLongPressTimer();
      galleryPhotoLongPressTriggeredRef.current = false;
      galleryPhotoLongPressTimerRef.current = window.setTimeout(() => {
          galleryPhotoLongPressTriggeredRef.current = true;
          setGalleryPhotoActionMenu({
              visible: true,
              photoId: photo.id,
              photoDataUrl: photo.photoDataUrl,
          });
      }, 520);
  }, [clearGalleryPhotoLongPressTimer]);

  const cancelGalleryPhotoLongPress = useCallback(() => {
      clearGalleryPhotoLongPressTimer();
  }, [clearGalleryPhotoLongPressTimer]);

  const startPhotoDecisionListening = async (mode: PendingPhotoDecision['mode']) => {
      stopPhotoDecisionListening();
      const usingLiveMic =
          connectionStateRef.current === AppState.ACTIVE;
      if (!usingLiveMic && (connectionStateRef.current === AppState.ACTIVE || connectionStateRef.current === AppState.CONNECTING)) {
          setWakeState(false);
          await disconnect();
          await new Promise((resolve) => setTimeout(resolve, 220));
      }
      if (!usingLiveMic) {
          suspendAssistantInput?.();
          await new Promise((resolve) => setTimeout(resolve, 220));
      }
      if (usingLiveMic) {
          photoDecisionTimeoutRef.current = window.setTimeout(() => {
              stopPhotoDecisionListening();
          }, 12000);
          return;
      }
      if (isAndroidShell && (window as any).AiroAndroidBridge?.startNativeReplyRecognition) {
          const handleNativeReply = (event: Event) => {
              const customEvent = event as CustomEvent<{ text?: string; isFinal?: boolean }>;
              const transcript = String(customEvent.detail?.text || '').trim();
              if (!transcript || /^speech recognition/i.test(transcript)) return;
              const decision = interpretPhotoDecision(transcript, mode);
              if (decision == null) return;
              setStatusText(decision ? 'Photo confirmation yes' : 'Photo confirmation no');
              void resolvePendingPhotoDecision(decision);
          };
          nativePhotoDecisionHandlerRef.current = handleNativeReply;
          window.addEventListener('airo-native-reply', handleNativeReply as EventListener);
          window.addEventListener('airo-native-result', handleNativeReply as EventListener);
          window.addEventListener('airo-native-transcript', handleNativeReply as EventListener);
          photoDecisionTimeoutRef.current = window.setTimeout(() => {
              stopPhotoDecisionListening();
          }, 12000);
          try {
              const result = (window as any).AiroAndroidBridge.startNativeReplyRecognition();
              if (typeof result === 'string' && result !== 'ok') {
                  const immediate = interpretPhotoDecision(result, mode);
                  if (immediate != null) {
                      setStatusText(immediate ? 'Photo confirmation yes' : 'Photo confirmation no');
                      void resolvePendingPhotoDecision(immediate);
                      return;
                  }
              }
          } catch {}
      }
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return;
      const timeoutAt = Date.now() + 12000;

      const startRecognitionPass = () => {
          const recognition = new SpeechRecognition();
          photoDecisionRecognitionRef.current = recognition;
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.maxAlternatives = 5;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
              for (let i = event.resultIndex; i < event.results.length; i += 1) {
                  const result = event.results[i];
                  for (let j = 0; j < result.length; j += 1) {
                      const transcript = String(result[j]?.transcript || '').trim();
                      const decision = interpretPhotoDecision(transcript, mode);
                      if (decision == null) continue;
                      setStatusText(decision ? 'Photo confirmation yes' : 'Photo confirmation no');
                      void resolvePendingPhotoDecision(decision);
                      return;
                  }
              }
          };

          const queueRetry = () => {
              if (Date.now() >= timeoutAt) return;
              window.setTimeout(() => {
                  if (Date.now() < timeoutAt && !photoDecisionRecognitionRef.current) {
                      startRecognitionPass();
                  }
              }, 160);
          };

          recognition.onerror = () => {
              if (photoDecisionRecognitionRef.current === recognition) {
                  photoDecisionRecognitionRef.current = null;
              }
              queueRetry();
          };

          recognition.onend = () => {
              if (photoDecisionRecognitionRef.current === recognition) {
                  photoDecisionRecognitionRef.current = null;
              }
              if (Date.now() >= timeoutAt) {
                  return;
              }
              queueRetry();
          };

          try {
              recognition.start();
          } catch {
              if (photoDecisionRecognitionRef.current === recognition) {
                  photoDecisionRecognitionRef.current = null;
              }
              queueRetry();
          }
      };

      photoDecisionTimeoutRef.current = window.setTimeout(() => {
          stopPhotoDecisionListening();
      }, Math.max(0, timeoutAt - Date.now()));

      startRecognitionPass();
  };

  const stopFirstTurnListening = () => {
      if (firstTurnTimeoutRef.current) {
          window.clearTimeout(firstTurnTimeoutRef.current);
          firstTurnTimeoutRef.current = null;
      }
      if (nativeFirstTurnHandlerRef.current) {
          window.removeEventListener('airo-native-reply', nativeFirstTurnHandlerRef.current as EventListener);
          window.removeEventListener('airo-native-result', nativeFirstTurnHandlerRef.current as EventListener);
          window.removeEventListener('airo-native-transcript', nativeFirstTurnHandlerRef.current as EventListener);
          nativeFirstTurnHandlerRef.current = null;
      }
      try {
          (window as any).AiroAndroidBridge?.stopNativeReplyRecognition?.();
      } catch {}
      if (firstTurnRecognitionRef.current) {
          try {
              firstTurnRecognitionRef.current.onresult = null;
              firstTurnRecognitionRef.current.onerror = null;
              firstTurnRecognitionRef.current.onend = null;
              firstTurnRecognitionRef.current.abort?.();
              firstTurnRecognitionRef.current.stop?.();
          } catch {}
          firstTurnRecognitionRef.current = null;
      }
  };

  const startFirstTurnListening = () => {
      stopFirstTurnListening();
      if (isAndroidShell && (window as any).AiroAndroidBridge?.startNativeReplyRecognition) {
          let bestTranscript = '';
          let finished = false;

          const finish = () => {
              if (finished) return;
              finished = true;
              stopFirstTurnListening();
              const normalized = bestTranscript.trim();
              if (normalized) {
                  setAwaitingFirstTextTurn(false);
                  const trySend = (attempt: number = 0) => {
                      const sent = sendTextMessage(normalized);
                      if (sent) {
                          setStatusText('Sent first prompt');
                          return;
                      }
                      if (attempt >= 6) {
                          setStatusText('Could not send first prompt');
                          void disconnect();
                          return;
                      }
                      window.setTimeout(() => trySend(attempt + 1), 140);
                  };
                  window.setTimeout(() => trySend(0), 80);
              } else {
                  setWakeState(false);
                  setAwaitingFirstTextTurn(false);
                  setStatusText('No prompt heard');
                  void playOst('unknownCommand', 0.55);
                  void disconnect();
              }
          };

          const handleNativeReply = (event: Event) => {
              const customEvent = event as CustomEvent<{ text?: string; isFinal?: boolean }>;
              const transcript = String(customEvent.detail?.text || '').trim();
              if (!transcript || /^speech recognition/i.test(transcript)) return;
              bestTranscript = transcript;
              setStatusText(`Heard: ${transcript}`);
              void orientTowardSpeakerFromSensors();
              if (customEvent.detail?.isFinal) {
                  finish();
              }
          };

          nativeFirstTurnHandlerRef.current = handleNativeReply;
          window.addEventListener('airo-native-reply', handleNativeReply as EventListener);
          window.addEventListener('airo-native-result', handleNativeReply as EventListener);
          window.addEventListener('airo-native-transcript', handleNativeReply as EventListener);

          firstTurnTimeoutRef.current = window.setTimeout(() => {
              finish();
          }, 6500);

          try {
              const result = (window as any).AiroAndroidBridge.startNativeReplyRecognition();
              if (typeof result === 'string' && result !== 'ok') {
                  finish();
                  return false;
              }
              return true;
          } catch {
              finish();
              return false;
          }
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return false;

      const recognition = new SpeechRecognition();
      let bestTranscript = '';
      firstTurnRecognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 5;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const transcript = String(event.results[i][0]?.transcript || '').trim();
              if (!transcript) continue;
              bestTranscript = transcript;
              setStatusText(`Heard: ${transcript}`);
              void orientTowardSpeakerFromSensors();
          }
      };

      recognition.onerror = () => {
          firstTurnRecognitionRef.current = null;
      };

      recognition.onend = () => {
          firstTurnRecognitionRef.current = null;
          const normalized = bestTranscript.trim();
          if (normalized) {
              setAwaitingFirstTextTurn(false);
              sendTextMessage(normalized);
              setStatusText('Sent first prompt');
          } else {
              setWakeState(false);
              setAwaitingFirstTextTurn(false);
              setStatusText('No prompt heard');
              void playOst('unknownCommand', 0.55);
              void disconnect();
          }
      };

      firstTurnTimeoutRef.current = window.setTimeout(() => {
          try {
              recognition.stop();
          } catch {}
      }, 6500);

      try {
          recognition.start();
          return true;
      } catch {
          firstTurnRecognitionRef.current = null;
          return false;
      }
  };

  const centerFaceForPhoto = async () => {
      if (!ollieRef.current || !movementAllowed) return;
      const deadline = Date.now() + 2200;

      while (Date.now() < deadline) {
          const target = visionTargetRef.current;
          if (!target || target.kind !== 'face' || target.source !== 'front') break;
          if (Math.abs(target.x) < 0.12) break;
          if (isMovingRef.current) break;

          const moveRight = target.x > 0;
          const speed = scaleMotorSpeed(Math.round(Math.min(70 + Math.abs(target.x) * 110, 165)), 60);
          signalEyeIntent(moveRight ? 1 : -1);
          isMovingRef.current = true;
          try {
              await driveSelectedMotor(
                  moveRight ? 'forward' : 'reverse',
                  speed
              );
              await new Promise((resolve) => setTimeout(resolve, 95));
              await ollieRef.current.stopMotion();
          } finally {
              isMovingRef.current = false;
              setEyeIntentX(0);
          }

          await new Promise((resolve) => setTimeout(resolve, 140));
      }
  };

  const waitForCapturedPhoto = async (
      preferredSource: 'front' | 'rear',
      options?: { aspectRatio?: number },
      timeoutMs: number = 3200
  ) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
          const primary = captureFrame(preferredSource, null, options);
          if (primary) return { photo: primary, source: preferredSource };

          const alternateSource = preferredSource === 'front' ? 'rear' : 'front';
          const alternate = captureFrame(alternateSource, null, options);
          if (alternate) return { photo: alternate, source: alternateSource };

          await new Promise((resolve) => setTimeout(resolve, 120));
      }
      return { photo: null, source: preferredSource };
  };

  const triggerPhotoFlash = async (durationMs: number = 180) => {
      setPhotoCaptureOverlay((prev) => ({ ...prev, flash: true }));
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      setPhotoCaptureOverlay((prev) => ({ ...prev, flash: false }));
  };

  const captureDirectStillPhoto = async (
      preferredSource: 'front' | 'rear',
      options?: { aspectRatio?: number }
  ) => {
      const attemptSource = async (source: 'front' | 'rear') => {
          let stream: MediaStream | null = null;
          let video: HTMLVideoElement | null = null;
          try {
              stream = await Promise.race([
                  navigator.mediaDevices.getUserMedia({
                      video: {
                          facingMode: source === 'front' ? 'user' : { ideal: 'environment' },
                          width: { ideal: 1280 },
                          height: { ideal: 720 },
                          frameRate: { ideal: 30 },
                      },
                      audio: false,
                  }),
                  new Promise<MediaStream>((_, reject) =>
                      window.setTimeout(() => reject(new Error(`Timed out opening ${source} camera`)), 3500)
                  ),
              ]);

              video = document.createElement('video');
              video.playsInline = true;
              video.muted = true;
              video.autoplay = true;
              video.srcObject = stream;
              await video.play();

              const [track] = stream.getVideoTracks();
              if (track) {
                  try {
                      const capabilities: any = track.getCapabilities?.() || {};
                      const advanced: Record<string, any> = {};
                      if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
                          advanced.exposureMode = 'continuous';
                      }
                      if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
                          advanced.whiteBalanceMode = 'continuous';
                      }
                      if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
                          advanced.focusMode = 'continuous';
                      }
                      if (typeof capabilities.exposureCompensation?.max === 'number') {
                          advanced.exposureCompensation = Math.min(
                              capabilities.exposureCompensation.max,
                              Math.max(capabilities.exposureCompensation.min || 0, 0.6)
                          );
                      }
                      if (Object.keys(advanced).length > 0) {
                          await track.applyConstraints({ advanced: [advanced] });
                      }
                  } catch (error) {
                      console.warn(`Could not apply advanced camera settings for ${source}`, error);
                  }
              }

              const startedAt = Date.now();
              while (Date.now() - startedAt < 1800) {
                  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
                      break;
                  }
                  await new Promise((resolve) => setTimeout(resolve, 80));
              }

              if (!video.videoWidth || !video.videoHeight) {
                  return null;
              }

              const aspectRatio = options?.aspectRatio || 1;
              const canvas = document.createElement('canvas');
              const canvasWidth = 960;
              const canvasHeight = Math.round(canvasWidth / aspectRatio);
              canvas.width = canvasWidth;
              canvas.height = canvasHeight;
              const context = canvas.getContext('2d');
              if (!context) return null;

              if (typeof (window as any).ImageCapture !== 'undefined' && stream.getVideoTracks()[0]) {
                  try {
                      const imageCapture = new (window as any).ImageCapture(stream.getVideoTracks()[0]);
                      const blob = await imageCapture.takePhoto();
                      const bitmap = await createImageBitmap(blob);
                      let sx = 0;
                      let sy = 0;
                      let sw = bitmap.width;
                      let sh = bitmap.height;
                      const bitmapAspect = bitmap.width / bitmap.height;
                      if (bitmapAspect > aspectRatio) {
                          sw = bitmap.height * aspectRatio;
                          sx = (bitmap.width - sw) / 2;
                      } else {
                          sh = bitmap.width / aspectRatio;
                          sy = (bitmap.height - sh) / 2;
                      }
                      context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
                      return canvas.toDataURL('image/jpeg', 0.92);
                  } catch (error) {
                      console.warn(`ImageCapture failed for ${source}, falling back to video frame`, error);
                  }
              }

              let sx = 0;
              let sy = 0;
              let sw = video.videoWidth;
              let sh = video.videoHeight;
              const videoAspect = video.videoWidth / video.videoHeight;
              if (videoAspect > aspectRatio) {
                  sw = video.videoHeight * aspectRatio;
                  sx = (video.videoWidth - sw) / 2;
              } else {
                  sh = video.videoWidth / aspectRatio;
                  sy = (video.videoHeight - sh) / 2;
              }

              context.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
              return canvas.toDataURL('image/jpeg', 0.9);
          } catch (error) {
              console.warn(`Direct still capture failed for ${source} camera`, error);
              return null;
          } finally {
              if (video) {
                  try {
                      video.pause();
                      video.srcObject = null;
                  } catch {}
              }
              if (stream) {
                  stream.getTracks().forEach((track) => track.stop());
              }
          }
      };

      const primary = await attemptSource(preferredSource);
      if (primary) {
          return { photo: primary, source: preferredSource };
      }
      const alternateSource = preferredSource === 'front' ? 'rear' : 'front';
      const alternate = await attemptSource(alternateSource);
      return { photo: alternate, source: alternate ? alternateSource : preferredSource };
  };

  const ensurePhotoPreviewFrame = async (preferredSource: 'front' | 'rear', timeoutMs: number = 1600) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
          const direct = captureFrame(preferredSource, null);
          if (direct) return { photo: direct, source: preferredSource };
          const alternateSource = preferredSource === 'front' ? 'rear' : 'front';
          const alternate = captureFrame(alternateSource, null);
          if (alternate) return { photo: alternate, source: alternateSource };
          await new Promise((resolve) => setTimeout(resolve, 90));
      }
      return { photo: null, source: preferredSource };
  };

  const waitForActiveCamera = async (timeoutMs: number = 2200) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
          if (cameraStateRef.current === 'active') {
              return true;
          }
          if (cameraStateRef.current === 'error') {
              return false;
          }
          await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return cameraStateRef.current === 'active';
  };

  const takePhotoForGallery = async () => {
      if (connectionStateRef.current === AppState.ACTIVE || connectionStateRef.current === AppState.CONNECTING) {
          setWakeState(false);
          await disconnect();
          await new Promise((resolve) => setTimeout(resolve, 220));
      }

      const leadIn = pickRandomLine(photoLeadInLines);
      setStatusText('Taking a photo');
      await speakQuickPrompt(leadIn, 950);
      await stopRobotMotion();

      if (isAndroidShell) {
          await startCameraTracking();
          const cameraReady = await waitForActiveCamera(2400);
          let source = resolvePhotoSource();
          const initialPreview = cameraReady ? await ensurePhotoPreviewFrame(source, 1500) : { photo: null, source };
          source = initialPreview.source;
          setPhotoCaptureOverlay({
              active: true,
              phase: initialPreview.photo ? 'live' : 'icon',
              countdown: 3,
              source,
              preview: initialPreview.photo,
              status: initialPreview.photo ? 'Hold still' : 'Starting camera preview',
              flash: false,
          });

          setStatusText('Running countdown');
          const previewTimer = window.setInterval(() => {
              setPhotoCaptureOverlay((prev) => ({
                  ...prev,
                  phase: 'live',
                  preview: captureFrame(source, null, { aspectRatio: 16 / 9 }) || prev.preview,
              }));
          }, 120);
          for (let seconds = 3; seconds > 0; seconds -= 1) {
              setPhotoCaptureOverlay((prev) => ({
                  ...prev,
                  phase: 'live',
                  countdown: seconds,
                  status: seconds === 1 ? 'Smile' : 'Get ready',
              }));
              await speakCountdownTick(String(seconds));
          }
          window.clearInterval(previewTimer);

          setStatusText('Capturing direct photo');
          await triggerPhotoFlash();
          const captureResult = await captureDirectStillPhoto(source, { aspectRatio: 16 / 9 });
          const photoDataUrl = captureResult.photo;
          source = captureResult.source;

          if (!photoDataUrl) {
              setPhotoCaptureOverlay({
                  active: false,
                  phase: 'captured',
                  countdown: 0,
                  source,
                  preview: null,
                  status: 'Direct capture failed',
                  flash: false,
              });
              await promptPhotoRetry();
              return null;
          }

          const newPhoto: GalleryPhotoRecord = {
              id: `photo-${Date.now()}`,
              photoDataUrl,
              source,
              takenAt: Date.now(),
          };
          setPhotoCaptureOverlay({
              active: true,
              phase: 'captured',
              countdown: 0,
              source,
              preview: photoDataUrl,
              status: 'Previewing photo',
              flash: false,
          });
          await promptPhotoSave(photoDataUrl, newPhoto);
          return photoDataUrl;
      }

      await startCameraTracking();
      const cameraReady = await waitForActiveCamera(2400);
      if (!cameraReady) {
          setPhotoCaptureOverlay({
              active: false,
              phase: 'icon',
              countdown: 0,
              source: 'front',
              preview: null,
              status: 'Camera did not become ready',
              flash: false,
          });
          await promptPhotoRetry();
          return null;
      }
      await centerFaceForPhoto();
      let source = resolvePhotoSource();
      setStatusText('Waiting for camera preview');
      let initialPreview = await ensurePhotoPreviewFrame(source, 1500);
      if (!initialPreview.photo) {
          stopCameraTracking();
          await new Promise((resolve) => setTimeout(resolve, 180));
          await startCameraTracking();
          const cameraReadyAfterRestart = await waitForActiveCamera(2400);
          if (!cameraReadyAfterRestart) {
          setPhotoCaptureOverlay({
              active: false,
              phase: 'icon',
              countdown: 0,
              source,
              preview: null,
              status: 'Camera restart failed',
              flash: false,
          });
              await promptPhotoRetry();
              return null;
          }
          source = resolvePhotoSource();
          initialPreview = await ensurePhotoPreviewFrame(source, 1800);
      }
      if (!initialPreview.photo) {
          setPhotoCaptureOverlay({
              active: true,
              phase: 'live',
              countdown: 3,
              source,
              preview: null,
              status: 'No live preview, taking photo anyway',
              flash: false,
          });
          setStatusText('Proceeding without live preview');
      }
      if (initialPreview.photo) {
          source = initialPreview.source;
          setPhotoCaptureOverlay({
              active: true,
              phase: 'live',
              countdown: 3,
              source,
              preview: initialPreview.photo,
              status: 'Hold still',
              flash: false,
          });
      }

      let seconds = 3;
      const previewTimer = window.setInterval(() => {
          setPhotoCaptureOverlay((prev) => ({
              ...prev,
              phase: 'live',
              preview: captureFrame(source, null) || prev.preview,
          }));
      }, 120);

      while (seconds > 0) {
          setPhotoCaptureOverlay((prev) => ({
              ...prev,
              phase: 'live',
              countdown: seconds,
              status: seconds === 1 ? 'Smile' : 'Get ready',
          }));
          await speakCountdownTick(String(seconds));
          seconds -= 1;
      }

      window.clearInterval(previewTimer);
      await triggerPhotoFlash();
      let captureResult = await waitForCapturedPhoto(source, { aspectRatio: 16 / 9 }, 1800);
      let photoDataUrl = captureResult.photo;
      source = captureResult.source;

      if (!photoDataUrl) {
          setStatusText('Using direct camera capture');
          stopCameraTracking();
          await new Promise((resolve) => setTimeout(resolve, 140));
          captureResult = await captureDirectStillPhoto(source, { aspectRatio: 16 / 9 });
          photoDataUrl = captureResult.photo;
          source = captureResult.source;
      }

      if (!photoDataUrl) {
          setPhotoCaptureOverlay((prev) => ({
              ...prev,
              active: false,
              phase: 'captured',
              status: 'Capture failed',
              flash: false,
          }));
          await promptPhotoRetry();
          return null;
      }

      const newPhoto: GalleryPhotoRecord = {
          id: `photo-${Date.now()}`,
          photoDataUrl,
          source,
          takenAt: Date.now(),
      };
      setPhotoCaptureOverlay({
          active: true,
          phase: 'captured',
          countdown: 0,
          source,
          preview: photoDataUrl,
          status: 'Previewing photo',
          flash: false,
      });
      await promptPhotoSave(photoDataUrl, newPhoto);
      return photoDataUrl;
  };

  const capturePhotoForSkill = async () => {
      if (connectionStateRef.current === AppState.ACTIVE || connectionStateRef.current === AppState.CONNECTING) {
          setWakeState(false);
          await disconnect();
          await new Promise((resolve) => setTimeout(resolve, 220));
      }

      await stopRobotMotion();

      if (isAndroidShell) {
          await startCameraTracking();
          const cameraReady = await waitForActiveCamera(2400);
          let source = resolvePhotoSource();
          const initialPreview = cameraReady ? await ensurePhotoPreviewFrame(source, 1500) : { photo: null, source };
          source = initialPreview.source;
          setPhotoCaptureOverlay({
              active: true,
              phase: initialPreview.photo ? 'live' : 'icon',
              countdown: 3,
              source,
              preview: initialPreview.photo,
              status: initialPreview.photo ? 'Hold still' : 'Starting camera preview',
              flash: false,
          });

          const previewTimer = window.setInterval(() => {
              setPhotoCaptureOverlay((prev) => ({
                  ...prev,
                  phase: 'live',
                  preview: captureFrame(source, null, { aspectRatio: 16 / 9 }) || prev.preview,
              }));
          }, 120);
          for (let seconds = 3; seconds > 0; seconds -= 1) {
              setPhotoCaptureOverlay((prev) => ({
                  ...prev,
                  phase: 'live',
                  countdown: seconds,
                  status: seconds === 1 ? 'Smile' : 'Get ready',
              }));
              await speakCountdownTick(String(seconds));
          }
          window.clearInterval(previewTimer);

          await triggerPhotoFlash();
          const captureResult = await captureDirectStillPhoto(source, { aspectRatio: 16 / 9 });
          const photoDataUrl = captureResult.photo;
          source = captureResult.source;
          setPhotoCaptureOverlay({
              active: Boolean(photoDataUrl),
              phase: 'captured',
              countdown: 0,
              source,
              preview: photoDataUrl,
              status: photoDataUrl ? 'Skill photo captured' : 'Skill photo failed',
              flash: false,
          });
          if (photoDataUrl) {
              setVisualContent({
                  type: 'image',
                  content: photoDataUrl,
                  title: 'PHOTO PREVIEW',
              });
              window.setTimeout(() => {
                  setPhotoCaptureOverlay((prev) => ({ ...prev, active: false, phase: 'icon', flash: false }));
              }, 1100);
          } else {
              setPhotoCaptureOverlay((prev) => ({ ...prev, active: false, phase: 'icon', flash: false }));
          }
          return photoDataUrl;
      }

      await startCameraTracking();
      const cameraReady = await waitForActiveCamera(2400);
      if (!cameraReady) {
          setPhotoCaptureOverlay({
              active: false,
              phase: 'icon',
              countdown: 0,
              source: 'front',
              preview: null,
              status: 'Skill camera not ready',
              flash: false,
          });
          return null;
      }

      await centerFaceForPhoto();
      let source = resolvePhotoSource();
      let initialPreview = await ensurePhotoPreviewFrame(source, 1500);
      if (!initialPreview.photo) {
          stopCameraTracking();
          await new Promise((resolve) => setTimeout(resolve, 180));
          await startCameraTracking();
          const cameraReadyAfterRestart = await waitForActiveCamera(2400);
          if (!cameraReadyAfterRestart) {
              setPhotoCaptureOverlay({
                  active: false,
                  phase: 'icon',
                  countdown: 0,
                  source,
                  preview: null,
                  status: 'Skill camera restart failed',
                  flash: false,
              });
              return null;
          }
          source = resolvePhotoSource();
          initialPreview = await ensurePhotoPreviewFrame(source, 1800);
      }

      setPhotoCaptureOverlay({
          active: true,
          phase: initialPreview.photo ? 'live' : 'icon',
          countdown: 3,
          source,
          preview: initialPreview.photo,
          status: initialPreview.photo ? 'Hold still' : 'Starting camera preview',
          flash: false,
      });

      const previewTimer = window.setInterval(() => {
          setPhotoCaptureOverlay((prev) => ({
              ...prev,
              phase: 'live',
              preview: captureFrame(source, null, { aspectRatio: 16 / 9 }) || prev.preview,
          }));
      }, 120);
      for (let seconds = 3; seconds > 0; seconds -= 1) {
          setPhotoCaptureOverlay((prev) => ({
              ...prev,
              phase: 'live',
              countdown: seconds,
              status: seconds === 1 ? 'Smile' : 'Get ready',
          }));
          await speakCountdownTick(String(seconds));
      }
      window.clearInterval(previewTimer);

      await triggerPhotoFlash();
      let captureResult = await waitForCapturedPhoto(source, { aspectRatio: 16 / 9 }, 1800);
      let photoDataUrl = captureResult.photo;
      source = captureResult.source;

      if (!photoDataUrl) {
          stopCameraTracking();
          await new Promise((resolve) => setTimeout(resolve, 140));
          captureResult = await captureDirectStillPhoto(source, { aspectRatio: 16 / 9 });
          photoDataUrl = captureResult.photo;
          source = captureResult.source;
      }

      setPhotoCaptureOverlay({
          active: Boolean(photoDataUrl),
          phase: 'captured',
          countdown: 0,
          source,
          preview: photoDataUrl,
          status: photoDataUrl ? 'Skill photo captured' : 'Skill photo failed',
          flash: false,
      });
      if (photoDataUrl) {
          setVisualContent({
              type: 'image',
              content: photoDataUrl,
              title: 'PHOTO PREVIEW',
          });
          window.setTimeout(() => {
              setPhotoCaptureOverlay((prev) => ({ ...prev, active: false, phase: 'icon', flash: false }));
          }, 1100);
      } else {
          setPhotoCaptureOverlay((prev) => ({ ...prev, active: false, phase: 'icon', flash: false }));
      }
      return photoDataUrl;
  };

  const captureFamilyPhoto = async () => {
      await stopRobotMotion();
      await startCameraTracking();
      await new Promise((resolve) => setTimeout(resolve, 350));
      let photo: string | null = null;
      let selectedSource: 'front' | 'rear' | 'unknown' = 'unknown';

      for (let attempt = 0; attempt < 6; attempt += 1) {
          const currentTarget = visionTargetRef.current;
          const faceTarget = currentTarget?.kind === 'face'
              ? currentTarget
              : null;
          const source = faceTarget?.source || 'front';
          selectedSource = source;
          setFamilyCaptureDebug({
              source,
              status: `Trying ${source} camera face capture (${attempt + 1}/6)`,
              preview: null,
          });
          photo = captureFrame(source, faceTarget);
          if (photo) break;
          await new Promise((resolve) => setTimeout(resolve, 180));
      }

      if (!photo) {
          const source = visionTargetRef.current?.source || 'front';
          selectedSource = source;
          setFamilyCaptureDebug({
              source,
              status: `Falling back to full ${source} frame`,
              preview: null,
          });
          photo = captureFrame(source, null);
      }

      if (!photo && rearTarget) {
          selectedSource = rearTarget.source;
          setFamilyCaptureDebug({
              source: rearTarget.source,
              status: `Trying rear target fallback`,
              preview: null,
          });
          photo = captureFrame(rearTarget.source, rearTarget);
      }

      if (!photo && visionTargetRef.current) {
          selectedSource = visionTargetRef.current.source;
          setFamilyCaptureDebug({
              source: visionTargetRef.current.source,
              status: `Trying active target fallback`,
              preview: null,
          });
          photo = captureFrame(visionTargetRef.current.source, visionTargetRef.current);
      }

      if (photo) {
          pendingFamilyPhotoRef.current = photo;
          setStatusText('Family photo captured');
          setFamilyCaptureDebug({
              source: selectedSource,
              status: 'Capture succeeded',
              preview: photo,
          });
      } else {
          setStatusText('No face photo captured');
          setFamilyCaptureDebug({
              source: selectedSource,
              status: 'Capture failed',
              preview: null,
          });
      }
      return photo;
  };

  const captureGuidedFamilyPhoto = async (
      angle: 'left' | 'center' | 'right'
  ) => {
      await stopRobotMotion();
      await startCameraTracking();
      const cameraReady = await waitForActiveCamera(2400);
      let source = resolvePhotoSource();
      if (!cameraReady) {
          setFamilyCaptureDebug({
              source,
              status: `${angle} photo camera not ready`,
              preview: null,
          });
          return null;
      }

      const promptByAngle = {
          left: 'Turn slightly left',
          center: 'Look straight ahead',
          right: 'Turn slightly right',
      } as const;
      let initialPreview = await ensurePhotoPreviewFrame(source, 1500);
      if (!initialPreview.photo) {
          stopCameraTracking();
          await new Promise((resolve) => setTimeout(resolve, 180));
          await startCameraTracking();
          const cameraReadyAfterRestart = await waitForActiveCamera(2400);
          if (cameraReadyAfterRestart) {
              source = resolvePhotoSource();
              initialPreview = await ensurePhotoPreviewFrame(source, 1800);
          }
      }
      source = initialPreview.source;
      setFamilyCaptureDebug({
          source,
          status: initialPreview.photo ? `${promptByAngle[angle]} preview ready` : `${promptByAngle[angle]} preview unavailable`,
          preview: initialPreview.photo,
      });
      setPhotoCaptureOverlay({
          active: true,
          phase: initialPreview.photo ? 'live' : 'icon',
          countdown: 0,
          source,
          preview: initialPreview.photo,
          status: promptByAngle[angle],
          flash: false,
      });

      const previewTimer = window.setInterval(() => {
          const nextPreview =
              captureFrame(source, visionTargetRef.current, { aspectRatio: 1 }) ||
              captureFrame(source, null, { aspectRatio: 1 }) ||
              null;
          setPhotoCaptureOverlay((prev) => ({
              ...prev,
              phase: 'live',
              preview: nextPreview || prev.preview,
          }));
          if (nextPreview) {
              setFamilyCaptureDebug({
                  source,
                  status: `${promptByAngle[angle]} preview live`,
                  preview: nextPreview,
              });
          }
      }, 120);

      await new Promise((resolve) => setTimeout(resolve, 160));
      setPhotoCaptureOverlay((prev) => ({
          ...prev,
          phase: 'live',
          countdown: 0,
          status: 'Hold still',
      }));

      window.clearInterval(previewTimer);
      await triggerPhotoFlash();

      let captureResult = await waitForCapturedPhoto(source, { aspectRatio: 1 }, 1800);
      let photoDataUrl = captureResult.photo;
      source = captureResult.source;

      if (!photoDataUrl) {
          await new Promise((resolve) => setTimeout(resolve, 140));
          captureResult = await captureDirectStillPhoto(source, { aspectRatio: 1 });
          photoDataUrl = captureResult.photo;
          source = captureResult.source;
      }
      if (!photoDataUrl) {
          photoDataUrl =
              captureFrame(source, null, { aspectRatio: 1 }) ||
              photoCaptureOverlay.preview ||
              familyCaptureDebug.preview ||
              initialPreview.photo ||
              null;
      }

      setPhotoCaptureOverlay({
          active: true,
          phase: 'captured',
          countdown: 0,
          source,
          preview: photoDataUrl,
          status: photoDataUrl ? `${angle} face captured` : `${angle} face capture failed`,
          flash: false,
      });

      if (photoDataUrl) {
          pendingFamilyPhotoRef.current = photoDataUrl;
          pendingFamilyPhotosRef.current = {
              ...pendingFamilyPhotosRef.current,
              [angle]: photoDataUrl,
          };
          setFamilyEnrollmentDraft((prev) => ({
              ...prev,
              photos: {
                  ...prev.photos,
                  [angle]: photoDataUrl,
              },
          }));
          setFamilyCaptureDebug({
              source,
              status: `${promptByAngle[angle]} captured`,
              preview: photoDataUrl,
          });
          setVisualContent({
              type: 'image',
              content: photoDataUrl,
              title: `${angle.toUpperCase()} FACE`,
          });
          const nextStep = FAMILY_CAPTURE_SEQUENCE.find((step) => !pendingFamilyPhotosRef.current[step.key]);
          setStatusText(
              nextStep
                  ? `${promptByAngle[angle]} captured. Next: ${nextStep.label}.`
                  : 'All three face photos captured. Save the profile when ready.'
          );
      } else {
          setFamilyCaptureDebug({
              source,
              status: `${promptByAngle[angle]} capture failed`,
              preview: initialPreview.photo,
          });
          setStatusText(`Let's try the ${angle} photo again.`);
      }

      window.setTimeout(() => {
          setPhotoCaptureOverlay((prev) => ({ ...prev, active: false, phase: 'icon', flash: false }));
          if (photoDataUrl) {
              setVisualContent((current) => (
                  current?.type === 'image' && current.title === `${angle.toUpperCase()} FACE`
                      ? null
                      : current
              ));
          }
      }, photoDataUrl ? 2400 : 1400);
      return photoDataUrl;
  };

  const startGuidedFamilyEnrollment = async () => {
      setFamilyCaptureDebug({
          source: visionTargetRef.current?.source || 'unknown',
          status: 'Step 1 of 3: capture the left photo first',
          preview: null,
      });
      setFamilyEnrollmentDraft({
          name: '',
          birthday: '',
          notes: '',
          photos: {
              left: null,
              center: null,
              right: null,
          },
      });
      pendingFamilyPhotoRef.current = null;
      pendingFamilyPhotosRef.current = {
          left: null,
          center: null,
          right: null,
      };
      setMenuPanel('family');
      setMenuOpen(true);
      setSessionMode('family-onboarding');
      setSessionPrompt(null);
      setWakeState(false);
      setStatusText('Family enrollment ready. Start with the left photo.');
      await stopRobotMotion();
  };

  const captureRecognitionSnapshots = async () => {
      await startCameraTracking();
      const frames: string[] = [];
      for (let i = 0; i < 4; i += 1) {
          const activeTarget = visionTargetRef.current || null;
          const preferredSource = activeTarget?.source || 'front';
          const shot =
              captureFrame(preferredSource, activeTarget || null, { aspectRatio: 16 / 9 }) ||
              captureFrame(preferredSource === 'front' ? 'rear' : 'front', null, { aspectRatio: 16 / 9 }) ||
              null;
          if (shot) {
              frames.push(shot);
          }
          if (i < 3) {
              await new Promise((resolve) => setTimeout(resolve, 500));
          }
      }
      return frames;
  };

  const updateFamilyIntroductionDraft = useCallback((payload: {
      name?: string;
      birthday?: string;
      notes?: string;
      status?: string;
      step?: FamilyIntroStep;
  }) => {
      const nextName = String(payload?.name || '').trim();
      const nextBirthdayRaw = String(payload?.birthday || '').trim();
      const parsedBirthday = nextBirthdayRaw ? parseBirthdayInput(nextBirthdayRaw) : null;
      const nextBirthday = parsedBirthday?.display || nextBirthdayRaw;
      const nextNotes = String(payload?.notes || '').trim();
      const nextStatus = String(payload?.status || '').trim();
      const nextStep = payload?.step;

      setFamilyEnrollmentDraft((prev) => ({
          ...prev,
          name: nextName || prev.name,
          birthday: nextBirthday || prev.birthday,
          notes: nextNotes || prev.notes,
      }));
      setFamilyIntroFlow((prev) => ({
          ...prev,
          active: true,
          step: nextStep || prev.step,
          name: nextName || prev.name,
          birthday: nextBirthday || prev.birthday,
          notes: nextNotes || prev.notes,
          status: nextStatus || prev.status,
      }));
      return {
          ok: true,
          name: nextName || familyEnrollmentDraft.name,
          birthday: nextBirthday || familyEnrollmentDraft.birthday,
          notes: nextNotes || familyEnrollmentDraft.notes,
      };
  }, [familyEnrollmentDraft.birthday, familyEnrollmentDraft.name, familyEnrollmentDraft.notes]);

  const saveFamilyMember = async (payload: string | { name?: string; birthday?: string; birthdayMonthDay?: string; notes?: string; photoDataUrls?: string[] }) => {
      const normalizedName = typeof payload === 'string'
          ? payload.trim()
          : String(payload?.name || familyEnrollmentDraft.name || familyIntroFlow.name || '').trim();
      const normalizedBirthday = typeof payload === 'string'
          ? (familyEnrollmentDraft.birthday || familyIntroFlow.birthday || '')
          : String(payload?.birthday || familyEnrollmentDraft.birthday || familyIntroFlow.birthday || '').trim();
      const normalizedNotes = typeof payload === 'string'
          ? (familyEnrollmentDraft.notes || familyIntroFlow.notes || '')
          : String(payload?.notes || familyEnrollmentDraft.notes || familyIntroFlow.notes || '').trim();
      const parsedBirthday = normalizedBirthday ? parseBirthdayInput(normalizedBirthday) : null;
      const birthdayMonthDay = typeof payload === 'string'
          ? undefined
          : (typeof payload?.birthdayMonthDay === 'string' && /^\d{2}-\d{2}$/.test(payload.birthdayMonthDay)
              ? payload.birthdayMonthDay
              : parsedBirthday?.monthDay);
      const draftPhotos = pendingFamilyPhotosRef.current;
      const draftUiPhotos = familyEnrollmentDraft.photos;
      const providedPhotos = Array.isArray((payload as any)?.photoDataUrls)
          ? ((payload as any).photoDataUrls as unknown[]).filter((value) => typeof value === 'string' && String(value).startsWith('data:image')).map(String)
          : [];
      const capturedPhotos = [
          draftPhotos.left || draftUiPhotos.left,
          draftPhotos.center || draftUiPhotos.center,
          draftPhotos.right || draftUiPhotos.right,
      ].filter((value): value is string => Boolean(value));
      const photoDataUrls = providedPhotos.length ? providedPhotos : capturedPhotos;
      const photoDataUrl = photoDataUrls[1] || photoDataUrls[0] || pendingFamilyPhotoRef.current;
      if (!normalizedName || photoDataUrls.length < 3 || !photoDataUrl) {
          throw new Error('Family member needs a name and three face photos');
      }

      setFamilyMembers((prev) => {
          const existing = prev.find((member) => member.name.toLowerCase() === normalizedName.toLowerCase());
          const nextMember: FamilyMemberRecord = {
              id: existing?.id || `family-${Date.now()}`,
              name: normalizedName,
              photoDataUrl,
              photoDataUrls,
              memories: existing?.memories || [],
              notes: normalizedNotes || existing?.notes || '',
              birthday: parsedBirthday?.display || normalizedBirthday || existing?.birthday || '',
              birthdayMonthDay: birthdayMonthDay || existing?.birthdayMonthDay,
              lastSeenAt: existing?.lastSeenAt,
              lastGreetedAt: existing?.lastGreetedAt,
              lastBirthdayGreetedAt: existing?.lastBirthdayGreetedAt,
          };
          if (existing) {
              return prev.map((member) => (member.id === existing.id ? nextMember : member));
          }
          return [...prev, nextMember];
      });

      setStatusText(`Saved family member ${normalizedName}`);
      pendingFamilyPhotoRef.current = null;
      pendingFamilyPhotosRef.current = { left: null, center: null, right: null };
      setFamilyEnrollmentDraft({
          name: '',
          birthday: '',
          notes: '',
          photos: {
              left: null,
              center: null,
              right: null,
          },
      });
      setFamilyIntroFlow({
          active: false,
          step: 'complete',
          name: normalizedName,
          birthday: parsedBirthday?.display || normalizedBirthday || '',
          notes: normalizedNotes,
          status: `${normalizedName} is all set`,
      });
      setSessionMode('default');
      setFamilyCaptureDebug({
          source: 'unknown',
          status: `Saved ${normalizedName}`,
          preview: photoDataUrl,
      });
      return normalizedName;
  };

  const exportFamilyBackup = useCallback(() => {
      const payload = {
          format: FAMILY_BACKUP_FORMAT,
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          familyMembers,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `airo-family-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1500);
      setStatusText(
          familyMembers.length
              ? `Exported ${familyMembers.length} family ${familyMembers.length === 1 ? 'profile' : 'profiles'}`
              : 'Exported empty family backup'
      );
  }, [familyMembers]);

  const importFamilyBackup = useCallback(async (file: File) => {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawMembers = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.familyMembers)
              ? parsed.familyMembers
              : [];
      const importedMembers = rawMembers
          .map((entry: unknown) => normalizeImportedFamilyMember(entry))
          .filter((entry): entry is FamilyMemberRecord => Boolean(entry));
      if (!importedMembers.length) {
          throw new Error('No family profiles were found in that backup');
      }
      setFamilyMembers((prev) => {
          const merged = [...prev];
          for (const imported of importedMembers) {
              const existingIndex = merged.findIndex((member) =>
                  member.id === imported.id || member.name.toLowerCase() === imported.name.toLowerCase()
              );
              if (existingIndex >= 0) {
                  const existing = merged[existingIndex];
                  merged[existingIndex] = {
                      ...existing,
                      ...imported,
                      photoDataUrl: imported.photoDataUrl || existing.photoDataUrl,
                      photoDataUrls: imported.photoDataUrls?.length ? imported.photoDataUrls : existing.photoDataUrls,
                      memories: mergeFamilyMemoryEntries(existing.memories, imported.memories),
                      lastSeenAt: Math.max(Number(existing.lastSeenAt || 0), Number(imported.lastSeenAt || 0)) || undefined,
                      lastGreetedAt: Math.max(Number(existing.lastGreetedAt || 0), Number(imported.lastGreetedAt || 0)) || undefined,
                      lastBirthdayGreetedAt: Math.max(Number(existing.lastBirthdayGreetedAt || 0), Number(imported.lastBirthdayGreetedAt || 0)) || undefined,
                  };
              } else {
                  merged.push(imported);
              }
          }
          return merged;
      });
      setStatusText(`Imported ${importedMembers.length} family ${importedMembers.length === 1 ? 'profile' : 'profiles'}`);
      setFamilyCaptureDebug({
          source: 'unknown',
          status: `Imported ${importedMembers.length} family ${importedMembers.length === 1 ? 'member' : 'members'}`,
          preview: importedMembers[0]?.photoDataUrl || null,
      });
  }, []);

  const handleFamilyImportSelection = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
          await importFamilyBackup(file);
      } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusText(message);
      } finally {
          event.target.value = '';
      }
  }, [importFamilyBackup]);

  const runFamilyIntroductionFlow = useCallback(async () => {
      const runId = Date.now();
      familyIntroRunIdRef.current = runId;
      await startGuidedFamilyEnrollment();
      setMenuPanel('family');
      setMenuOpen(true);
      setFamilyIntroFlow({
          active: true,
          step: 'ask-name',
          name: '',
          birthday: '',
          notes: '',
          status: 'Listening for a name',
      });

      const ensureCurrentRun = () => familyIntroRunIdRef.current === runId;
      const updateIntroFlow = (step: FamilyIntroStep, patch?: Partial<FamilyIntroFlowState>) => {
          if (!ensureCurrentRun()) return;
          setFamilyIntroFlow((prev) => ({
              ...prev,
              active: true,
              step,
              ...patch,
          }));
      };

      try {
          await speakQuickPrompt('Hello there. I would love to get to know you properly. What should I call you?', 500);
          const heardName = await waitForVoiceCommand(12000, false);
          const extractedName = await extractDemoName(heardName);
          const name = String(extractedName || '').trim() || 'friend';
          if (!ensureCurrentRun()) return;
          setFamilyEnrollmentDraft((prev) => ({ ...prev, name }));
          updateIntroFlow('capture-left', {
              name,
              status: `Lovely to meet you, ${name}. Starting the left photo.`,
          });

          for (const step of FAMILY_INTRO_CAPTURE_SEQUENCE) {
              if (!ensureCurrentRun()) return;
              updateIntroFlow(
                  step.key === 'left' ? 'capture-left' : step.key === 'right' ? 'capture-right' : 'capture-center',
                  {
                      name,
                      status: `${step.prompt}. Say ready when you are set.`,
                  }
              );
              await speakQuickPrompt(
                  `${name}, ${step.prompt.toLowerCase()}, and say ready when you are set.`,
                  450,
              );

              let ready = false;
              for (let attempt = 0; attempt < 2; attempt += 1) {
                  const heardReady = await waitForVoiceCommand(12000, false);
                  if (isReadyLikeResponse(heardReady) || (!heardReady && attempt === 1)) {
                      ready = true;
                      break;
                  }
                  if (isSkipLikeResponse(heardReady)) {
                      throw new Error('Okay, I will stop the introduction for now.');
                  }
                  await speakQuickPrompt('I am listening for ready.', 350);
              }
              if (!ready || !ensureCurrentRun()) return;

              const photo = await captureGuidedFamilyPhoto(step.key);
              if (!photo) {
                  await speakQuickPrompt(`I missed that ${step.label.toLowerCase()} photo. Let us try that step again another time.`, 450);
                  throw new Error(`The ${step.label.toLowerCase()} photo did not capture clearly.`);
              }
              await speakQuickPrompt(`Perfect. I have your ${step.label.toLowerCase()} photo.`, 350);
          }

          if (!ensureCurrentRun()) return;
          updateIntroFlow('ask-birthday', {
              name,
              status: 'Listening for a birthday',
          });
          await speakQuickPrompt(`One more sweet detail, ${name}. When is your birthday? Month and day is enough.`, 500);
          let birthday = '';
          let birthdayMonthDay = '';
          for (let attempt = 0; attempt < 2; attempt += 1) {
              const heardBirthday = await waitForVoiceCommand(12000, false);
              if (!heardBirthday || isSkipLikeResponse(heardBirthday)) {
                  break;
              }
              const parsedBirthday = parseBirthdayInput(heardBirthday);
              if (parsedBirthday) {
                  birthday = parsedBirthday.display;
                  birthdayMonthDay = parsedBirthday.monthDay;
                  break;
              }
              await speakQuickPrompt('I was listening for a birthday like March fourteenth, or three slash fourteen. Let us try once more.', 500);
          }
          if (!ensureCurrentRun()) return;
          setFamilyEnrollmentDraft((prev) => ({ ...prev, birthday }));
          updateIntroFlow('ask-notes', {
              name,
              birthday,
              status: birthday ? `Birthday saved as ${birthday}.` : 'Birthday skipped.',
          });

          await speakQuickPrompt(`Is there anything you want me to know about you, ${name}? You can say something like, I am Dad, or I love golf.`, 550);
          const heardNotes = await waitForVoiceCommand(14000, false);
          const notes = isSkipLikeResponse(heardNotes) ? '' : String(heardNotes || '').trim();
          if (!ensureCurrentRun()) return;
          setFamilyEnrollmentDraft((prev) => ({ ...prev, notes }));
          updateIntroFlow('saving', {
              name,
              birthday,
              notes,
              status: `Saving ${name}'s family profile`,
          });

          await saveFamilyMember({
              name,
              birthday,
              birthdayMonthDay,
              notes,
          });
          if (!ensureCurrentRun()) return;
          await speakQuickPrompt(
              birthday
                  ? `All set, ${name}. I will remember your birthday on ${birthday}, and I will be ready to say hello when I see you.`
                  : `All set, ${name}. I will remember you and I will be ready to say hello when I see you.`,
              700,
          );
          setFamilyIntroFlow({
              active: false,
              step: 'complete',
              name,
              birthday,
              notes,
              status: `${name} is all set`,
          });
      } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setSessionMode('default');
          setStatusText(message);
          setFamilyIntroFlow((prev) => ({
              ...prev,
              active: false,
              status: message,
          }));
      }
  }, [
      captureGuidedFamilyPhoto,
      extractDemoName,
      saveFamilyMember,
      speakQuickPrompt,
      startGuidedFamilyEnrollment,
      waitForVoiceCommand,
  ]);

  const runFamilyPhotoSequence = useCallback(async () => {
      const currentName = String(
          familyEnrollmentDraft.name ||
          familyIntroFlow.name ||
          'friend'
      ).trim() || 'friend';

      setFamilyIntroFlow((prev) => ({
          ...prev,
          active: true,
          status: `Starting photo sequence for ${currentName}`,
      }));

      for (const step of FAMILY_INTRO_CAPTURE_SEQUENCE) {
          setFamilyIntroFlow((prev) => ({
              ...prev,
              active: true,
              step: step.key === 'left' ? 'capture-left' : step.key === 'right' ? 'capture-right' : 'capture-center',
              status: `${step.prompt}. Say ready when you are set.`,
          }));
          await speakQuickPrompt(
              `${currentName}, ${step.prompt.toLowerCase()}, and say ready when you are set.`,
              450,
          );

          let readyHeard = false;
          for (let attempt = 0; attempt < 2; attempt += 1) {
              const heardReady = await waitForVoiceCommand(12000, false);
              if (isSkipLikeResponse(heardReady)) {
                  return { ok: false, error: 'photo sequence cancelled' };
              }
              if (isReadyLikeResponse(heardReady) || (!heardReady && attempt === 1)) {
                  readyHeard = true;
                  break;
              }
              await speakQuickPrompt('I am listening for ready.', 350);
          }
          if (!readyHeard) {
              return { ok: false, error: `ready not heard for ${step.key}` };
          }

          const photo = await captureGuidedFamilyPhoto(step.key);
          if (!photo) {
              return { ok: false, error: `capture failed for ${step.key}` };
          }
          await speakQuickPrompt(`Perfect. I have your ${step.label.toLowerCase()} photo.`, 350);
      }

      setFamilyIntroFlow((prev) => ({
          ...prev,
          active: true,
          status: 'All three face photos are captured.',
      }));
      return { ok: true, capturedAngles: FAMILY_INTRO_CAPTURE_SEQUENCE.map((step) => step.key) };
  }, [
      captureGuidedFamilyPhoto,
      familyEnrollmentDraft.name,
      familyIntroFlow.name,
      speakQuickPrompt,
      waitForVoiceCommand,
  ]);

  const runInstalledSkill = async (
      toolName: string,
      options?: { intentInput?: unknown; intentText?: string }
  ) => {
      const installedSkill = installedSkills.find((skill) => skill.toolName === toolName) || (
          toolName === 'run_demo'
              ? {
                    id: 'skill-1774580329600',
                    name: 'demo',
                    toolName: 'run_demo',
                    generatedCode: '',
                    script: null,
                    packageData: null,
                } as any
              : null
      );
      if (!installedSkill) {
          sendBackendLog('error', 'skill', `Skill not installed: ${toolName}`);
          return { error: `Skill ${toolName} is not installed` };
      }

      const displaySkillText = async ({ title, body }: { title?: string; body?: string }) => {
          const html = `
<!DOCTYPE html>
<html><head><style>
body{margin:0;min-height:100vh;background:#030712;color:#f8fafc;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:32px;box-sizing:border-box}
.card{width:min(90vw,720px);padding:28px 32px;border-radius:28px;background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.08);box-shadow:0 30px 80px rgba(0,0,0,.45)}
h1{margin:0 0 14px;font-size:clamp(28px,4vw,46px);line-height:1.05}
p{margin:0;font-size:clamp(16px,2vw,24px);line-height:1.45;color:#dbeafe}
</style></head><body><div class="card"><h1>${title || 'Airo Skill'}</h1><p>${body || ''}</p></div></body></html>`;
          setVisualContent({ type: 'widget', content: html, title: title || installedSkill.name });
      };
      let lastSkillPhotoDataUrl: string | null = null;
      const skillEyeAnimations = Array.isArray((installedSkill.packageData as any)?.skill?.eyeAnimations)
          ? (installedSkill.packageData as any).skill.eyeAnimations
          : [];
      const findSkillEyeAnimation = (animationId: string) =>
          skillEyeAnimations.find((item: any) => String(item?.id || '') === String(animationId || ''));

      const parseJsonLike = (input: unknown): any => {
          if (input == null) return null;
          if (typeof input === 'string') {
              const raw = input.trim();
              if (!raw) return null;
              try {
                  return JSON.parse(raw);
              } catch {
                  return null;
              }
          }
          if (typeof input === 'object') return input;
          return null;
      };

      const getByPath = (source: any, pathRaw: string): unknown => {
          const path = String(pathRaw || '').trim();
          if (!path) return source;
          const normalized = path.replace(/\[(\d+)\]/g, '.$1');
          const parts = normalized.split('.').filter(Boolean);
          let cursor: any = source;
          for (const part of parts) {
              if (cursor == null) return undefined;
              if (Array.isArray(cursor)) {
                  const index = Number(part);
                  cursor = Number.isFinite(index) ? cursor[index] : undefined;
              } else if (typeof cursor === 'object') {
                  cursor = (cursor as Record<string, unknown>)[part];
              } else {
                  return undefined;
              }
          }
          return cursor;
      };

      const runtime = {
          userPrompt: String(sessionPrompt || wakeCarryPrompt || ''),
          intentInput: options?.intentInput ?? null,
          intentText: String(options?.intentText || ''),
          say: async (text: string) => {
              sendBackendLog('info', 'skill', 'say', String(text || ''));
              return speakWithXaiTts(text);
          },
          getIntentInput: async () => options?.intentInput ?? null,
          getIntentText: async () => String(options?.intentText || ''),
          displayText: displaySkillText,
          setStatusText: async (text: string) => {
              sendBackendLog('info', 'skill', 'set_status', String(text || ''));
              setStatusText(String(text || ''));
          },
          displayImage: async ({ url, caption }: { url?: string; caption?: string }) => {
              const normalizedUrl = String(url || '').trim();
              const resolvedUrl = normalizedUrl && normalizedUrl !== '[object Object]'
                  ? normalizedUrl
                  : (lastSkillPhotoDataUrl || '');
              if (!resolvedUrl) return;
              sendBackendLog('info', 'skill', 'display_image', `${caption || ''} ${resolvedUrl}`.trim());
              setVisualContent({ type: 'image', content: resolvedUrl, title: caption || installedSkill.name });
          },
          showUiCard: async ({
              title,
              subtitle,
              body,
              theme,
              imageUrl,
              chips,
              durationMs,
          }: {
              title?: string;
              subtitle?: string;
              body?: string;
              theme?: string;
              imageUrl?: string;
              chips?: string[];
              durationMs?: number;
          }) => {
              const normalizedImageUrl = String(imageUrl || '').trim();
              const resolvedImageUrl = normalizedImageUrl && normalizedImageUrl !== '[object Object]'
                  ? normalizedImageUrl
                  : (lastSkillPhotoDataUrl || '');
              sendBackendLog(
                  'info',
                  'skill',
                  'show_ui_card',
                  `${theme || 'info'} ${title || installedSkill.name} ${resolvedImageUrl ? '[image]' : '[no-image]'}`.trim()
              );
              setVisualContent({
                  type: 'predefined',
                  component: 'ui-card',
                  content: {
                      title: title || installedSkill.name,
                      subtitle: subtitle || '',
                      body: body || '',
                      theme: theme || 'info',
                      imageUrl: resolvedImageUrl,
                      chips: Array.isArray(chips) ? chips : [],
                  },
                  title: title || installedSkill.name,
              });
              const timeout = Math.max(0, Number(durationMs) || 0);
              if (timeout > 0) {
                  window.setTimeout(() => {
                      setVisualContent((current) => (
                          current?.type === 'predefined' && current.component === 'ui-card' ? null : current
                      ));
                  }, timeout);
              }
          },
          setEyesPreset: async (preset: string, durationMs?: number) => {
              sendBackendLog('info', 'skill', 'set_eyes', `${preset} ${durationMs || 0}`.trim());
              const map: Record<string, EyeState> = {
                  idle: EyeState.IDLE,
                  connecting: EyeState.CONNECTING,
                  listening: EyeState.LISTENING,
                  speaking: EyeState.SPEAKING,
                  thinking: EyeState.THINKING,
                  muted: EyeState.MUTED,
              };
              const next = map[String(preset || '').toLowerCase()] || EyeState.IDLE;
              setSkillEyeStateOverride(next);
              const timeout = Math.max(0, Number(durationMs) || 0);
              if (timeout > 0) {
                  window.setTimeout(() => {
                      setSkillEyeStateOverride((current) => (current === next ? null : current));
                  }, timeout);
              }
          },
          setDockLights: async ({ red, green, blue, durationMs }: { red?: number; green?: number; blue?: number; durationMs?: number }) => {
              sendBackendLog('info', 'skill', 'set_lights', `${red ?? 0},${green ?? 0},${blue ?? 0} for ${durationMs ?? 0}`);
              const color: [number, number, number] = [
                  Math.max(0, Math.min(255, Number(red) || 0)),
                  Math.max(0, Math.min(255, Number(green) || 0)),
                  Math.max(0, Math.min(255, Number(blue) || 0)),
              ];
              setSkillLightOverride(color);
              await setRobotLights(color[0], color[1], color[2]);
              const timeout = Math.max(0, Number(durationMs) || 0);
              if (timeout > 0) {
                  window.setTimeout(() => {
                      setSkillLightOverride((current) => (
                          current && current[0] === color[0] && current[1] === color[1] && current[2] === color[2]
                              ? null
                              : current
                      ));
                  }, timeout);
              }
          },
          showTimerWidget: async ({ durationSeconds, title }: { durationSeconds?: number; title?: string }) => {
              sendBackendLog('info', 'skill', 'show_timer_widget', `${title || 'TIMER'} ${durationSeconds || 60}s`);
              stopTimerAlarmLoop('Timer reset');
              setVisualContent({
                  type: 'predefined',
                  component: 'timer',
                  content: { durationSeconds: Number(durationSeconds) || 60, title: title || 'TIMER' },
                  title: title || 'TIMER',
              });
          },
          showNumberWidget: async ({
              value,
              title,
              subtitle,
              durationMs,
          }: {
              value: string | number;
              title?: string;
              subtitle?: string;
              durationMs?: number;
          }) => {
              sendBackendLog('info', 'skill', 'show_number_widget', `${title || 'NUMBER'} ${String(value)}`);
              setVisualContent({
                  type: 'predefined',
                  component: 'number',
                  content: { value, title: title || 'NUMBER', subtitle: subtitle || '' },
                  title: title || 'NUMBER',
              });
              const timeout = Math.max(0, Number(durationMs) || 0);
              if (timeout > 0) {
                  window.setTimeout(() => {
                      setVisualContent((current) => (
                          current?.type === 'predefined' && current.component === 'number' ? null : current
                      ));
                  }, timeout);
              }
          },
          showConfirmationWidget: async ({ title, subtitle, confirmText, cancelText, durationMs }: { title?: string; subtitle?: string; confirmText?: string; cancelText?: string; durationMs?: number }) => {
              sendBackendLog('info', 'skill', 'show_confirmation_widget', title || 'CONFIRMATION');
              expectingSkillConfirmationRef.current = true;
              try {
                  setVisualContent({
                      type: 'predefined',
                      component: 'confirmation',
                      content: { title, subtitle, confirmText, cancelText },
                      title: title || 'CONFIRMATION',
                  });
                  setStatusText(title || 'Waiting for confirmation');
                  const spokenPrompt = [title, subtitle].filter(Boolean).join('. ').trim();
                  if (spokenPrompt) {
                      await speakQuickPrompt(spokenPrompt, 450);
                  }
                  const answer = await waitForSkillConfirmation(Math.max(1200, Number(durationMs) || 9000));
                  setVisualContent((current) => (
                      current?.type === 'predefined' && current.component === 'confirmation' ? null : current
                  ));
                  const boolAnswer = answer === true;
                  sendBackendLog('info', 'skill', 'confirmation_result', boolAnswer ? 'yes' : 'no_or_timeout');
                  return boolAnswer;
              } finally {
                  expectingSkillConfirmationRef.current = false;
              }
          },
          showSettingsWidget: async ({ title, options, durationMs }: { title?: string; options?: Array<{ id: string; label: string; icon: string }>; durationMs?: number }) => {
              sendBackendLog('info', 'skill', 'show_settings_widget', title || 'SETTINGS');
              setVisualContent({
                  type: 'predefined',
                  component: 'settings',
                  content: { title, options: Array.isArray(options) ? options : [] },
                  title: title || 'SETTINGS',
              });
              const timeout = Math.max(0, Number(durationMs) || 0);
              if (timeout > 0) {
                  window.setTimeout(() => {
                      setVisualContent((current) => (
                          current?.type === 'predefined' && current.component === 'settings' ? null : current
                      ));
                  }, timeout);
              }
          },
          listenVoiceCommand: async ({ timeoutMs, interim }: { timeoutMs?: number; interim?: boolean }) => {
              const effectiveTimeoutMs = Math.max(1000, Number(timeoutMs) || 9000);
              sendBackendLog('info', 'skill', 'listen_voice_command', `timeout=${effectiveTimeoutMs} interim=${Boolean(interim)}`);
              setStatusText('Listening for command');
              const heard = await waitForVoiceCommand(effectiveTimeoutMs, Boolean(interim));
              sendBackendLog('info', 'skill', 'listen_voice_command_result', heard || '<empty>');
              return heard;
          },
          playSound: async ({ sound, volume }: { sound?: string; volume?: number }) => {
              const rawKey = String(sound || 'success').trim();
              const key = (rawKey in OST_AUDIO_FILES ? rawKey : 'success') as keyof typeof OST_AUDIO_FILES;
              const gain = Math.max(0, Math.min(1, Number(volume ?? 0.6)));
              sendBackendLog('info', 'skill', 'play_sound', `${rawKey} -> ${key} volume=${gain}`);
              console.info('[Airo playSound]', { rawKey, key, gain });
              try {
                  setStatusText(`Playing sound: ${key}`);
                  await playOst(key, gain, 0);
                  setStatusText(`Played sound: ${key}`);
                  return { ok: true, sound: key };
              } catch (error) {
                  setStatusText(`Sound failed: ${key}`);
                  sendBackendLog('error', 'skill', 'play_sound_failed', error instanceof Error ? error.message : String(error));
                  return { ok: false, sound: key };
              }
          },
          playTone: async ({ tone, frequencyHz, durationMs, volume, waveform }: { tone?: string; frequencyHz?: number; durationMs?: number; volume?: number; waveform?: string }) => {
              sendBackendLog('info', 'skill', 'play_tone', `${tone || 'confirm'} ${frequencyHz || ''}`.trim());
              await playSkillTone({ tone, frequencyHz, durationMs, volume, waveform });
          },
          runJavascript: async ({ code, vars }: { code: string; vars: Record<string, unknown> }) => {
              const script = String(code || '').trim();
              if (!script) return null;
              sendBackendLog('info', 'skill', 'run_javascript', script.length > 80 ? `${script.slice(0, 80)}...` : script);
              try {
                  const fn = new Function('vars', 'runtime', `"use strict";\n${script}`);
                  return await Promise.resolve(fn(vars || {}, runtime));
              } catch {
                  const expressionFn = new Function('vars', 'runtime', `"use strict";\nreturn (${script});`);
                  return await Promise.resolve(expressionFn(vars || {}, runtime));
              }
          },
          getCurrentLocation: async () => {
              const raw = String(location || '').trim();
              if (!raw) {
                  sendBackendLog('error', 'skill', 'get_current_location_failed', 'Location unavailable');
                  return { latitude: null, longitude: null, raw: '' };
              }
              const [latRaw, lngRaw] = raw.split(',').map((part) => part.trim());
              const latitude = Number(latRaw);
              const longitude = Number(lngRaw);
              const payload = {
                  latitude: Number.isFinite(latitude) ? latitude : null,
                  longitude: Number.isFinite(longitude) ? longitude : null,
                  raw,
              };
              sendBackendLog('info', 'skill', 'get_current_location', JSON.stringify(payload));
              return payload;
          },
          jsonGetValue: async ({ source, key }: { source: unknown; key: string }) => {
              const parsed = parseJsonLike(source);
              const value = getByPath(parsed, key);
              sendBackendLog('info', 'skill', 'json_get_value', `${String(key || '')}`);
              return value;
          },
          jsonGetKeys: async ({ source }: { source: unknown }) => {
              const parsed = parseJsonLike(source);
              if (Array.isArray(parsed)) return parsed.map((_, index) => String(index));
              if (parsed && typeof parsed === 'object') return Object.keys(parsed as Record<string, unknown>);
              return [];
          },
          jsonGetValues: async ({ source }: { source: unknown }) => {
              const parsed = parseJsonLike(source);
              if (Array.isArray(parsed)) return parsed;
              if (parsed && typeof parsed === 'object') return Object.values(parsed as Record<string, unknown>);
              return [];
          },
          runEyes: async ({ animationId, durationMs, continueExecution }: { animationId: string; durationMs?: number; continueExecution?: boolean }) => {
              const resolvedId = String(animationId || '').trim();
              const selected = findSkillEyeAnimation(resolvedId);
              if (!selected) {
                  sendBackendLog('error', 'skill', 'run_eyes_failed', `animation not found: ${resolvedId}`);
                  return { ok: false, error: 'animation-not-found' };
              }
              const resolvedDuration = Number(durationMs) > 0 ? Number(durationMs) : Number(selected.durationMs) || 1500;
              const continueRunning = continueExecution === true;
              sendBackendLog('info', 'skill', 'run_eyes', `${resolvedId} ${resolvedDuration}ms`);
              setSkillEyeAnimationOverride({
                  keyframes: Array.isArray(selected.keyframes) ? selected.keyframes : [],
                  durationMs: resolvedDuration,
                  loop: false,
                  continueRunning,
              });
              if (!continueRunning) {
                  await new Promise((resolve) => setTimeout(resolve, Math.max(250, resolvedDuration)));
                  setSkillEyeAnimationOverride((current: any) => (
                      current && current.durationMs === resolvedDuration ? null : current
                  ));
              }
              return { ok: true };
          },
          moveRobot: async ({ direction, intensity }: { direction?: string; intensity?: number }) =>
              (sendBackendLog('info', 'skill', 'move', `${direction || 'front'} ${intensity ?? 0.55}`), moveRobotExpressive(direction || 'front', intensity ?? 0.55)),
          moveRobotTimed: async ({ direction, intensity, durationMs }: { direction?: string; intensity?: number; durationMs?: number }) =>
              (sendBackendLog('info', 'skill', 'move_timed', `${direction || 'front'} ${intensity ?? 0.75} ${durationMs ?? 650}`), moveRobotTimed(direction || 'front', intensity ?? 0.75, durationMs ?? 650)),
          turnWaypoint: async (direction: string) => {
              sendBackendLog('info', 'skill', 'turn_waypoint', direction || 'front');
              return turnToWaypoint(direction || 'front');
          },
          rotateRobotDegrees: async (degrees: number) => {
              sendBackendLog('info', 'skill', 'rotate_robot', String(Number(degrees) || 90));
              return turnLeftMotorByDegrees(Number(degrees) || 90);
          },
          facePerson: async () => {
              sendBackendLog('info', 'skill', 'face_person');
              return faceUserWithSeek();
          },
          stopRobot: async () => {
              sendBackendLog('info', 'skill', 'stop_robot');
              return stopRobotMotion();
          },
          takePhoto: async () => {
              sendBackendLog('info', 'skill', 'take_photo', 'Skill camera capture');
              const result = await capturePhotoForSkill();
              if (typeof result === 'string' && result.trim()) {
                  lastSkillPhotoDataUrl = result;
              }
              sendBackendLog(result ? 'info' : 'error', 'skill', result ? 'take_photo_success' : 'take_photo_failed');
              return result;
          },
          saveImageToGallery: async ({ image, source }: { image: string; source?: 'front' | 'rear' }) => {
              const photoDataUrl = String(image || '').trim();
              if (!photoDataUrl) {
                  sendBackendLog('error', 'skill', 'save_image_to_gallery_failed', 'Missing image data');
                  return '';
              }
              const selectedSource: 'front' | 'rear' = source === 'rear' ? 'rear' : 'front';
              const newPhoto: GalleryPhotoRecord = {
                  id: `photo-${Date.now()}`,
                  photoDataUrl,
                  source: selectedSource,
                  takenAt: Date.now(),
              };
              setGalleryPhotos((prev) => [newPhoto, ...prev].slice(0, 60));
              lastSkillPhotoDataUrl = photoDataUrl;
              setStatusText('Photo saved to gallery');
              sendBackendLog('info', 'skill', 'save_image_to_gallery', newPhoto.id);
              return newPhoto.id;
          },
          recognizeFace: async (target: string) => {
              sendBackendLog('info', 'skill', 'recognize_face', target);
              if (target === 'family') {
                  return recognizedFamilyMember?.name || '';
              }
              return visionTargetRef.current?.kind === 'face' ? 'face-detected' : '';
          },
          webRequest: async ({
              url,
              method,
              headers,
              body,
              timeoutMs,
              responseType,
          }: {
              url: string;
              method?: string;
              headers?: Record<string, string>;
              body?: string;
              timeoutMs?: number;
              responseType?: string;
          }) => {
              const targetUrl = String(url || '').trim();
              if (!targetUrl) {
                  return { ok: false, error: 'url is required' };
              }
              const safeMethod = String(method || 'GET').toUpperCase();
              sendBackendLog('info', 'skill', 'web_request', `${safeMethod} ${targetUrl}`);
              try {
                  const response = await fetch('/backend/api/web-request', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          url: targetUrl,
                          method: safeMethod,
                          headers: headers || {},
                          body: String(body || ''),
                          timeoutMs: Number(timeoutMs) || 12000,
                          responseType: String(responseType || 'json'),
                      }),
                  });
                  const payload = await response.json().catch(() => ({ ok: false, error: `invalid response ${response.status}` }));
                  if (!response.ok) {
                      sendBackendLog('error', 'skill', 'web_request_failed', `${safeMethod} ${targetUrl} :: ${payload?.error || response.status}`);
                  } else {
                      sendBackendLog('info', 'skill', 'web_request_ok', `${safeMethod} ${targetUrl} :: ${payload?.status || response.status}`);
                  }
                  return payload;
              } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  sendBackendLog('error', 'skill', 'web_request_failed', `${safeMethod} ${targetUrl} :: ${message}`);
                  return { ok: false, error: message };
              }
          },
          callFunction: async (name: string, payload: any) => {
              sendBackendLog('info', 'skill', 'call_function', name);
              let parsedPayload = payload;
              if (typeof payload === 'string') {
                  try {
                      parsedPayload = JSON.parse(payload);
                  } catch {
                      parsedPayload = { raw: payload };
                  }
              }

              if (name === 'show_confirmation_widget') {
                  const title = String(parsedPayload?.title || 'CONFIRMATION');
                  const subtitle = String(parsedPayload?.subtitle || '');
                  const confirmText = String(parsedPayload?.confirmText || 'Yes');
                  const cancelText = String(parsedPayload?.cancelText || 'No');
                  const durationMs = Math.max(1200, Number(parsedPayload?.durationMs) || 9000);
                  expectingSkillConfirmationRef.current = true;
                  try {
                      setVisualContent({
                          type: 'predefined',
                          component: 'confirmation',
                          content: { ...parsedPayload, title, subtitle, confirmText, cancelText },
                          title,
                      });
                      setStatusText(title || 'Waiting for confirmation');
                      const spokenPrompt = [title, subtitle, `Say ${confirmText} or ${cancelText}.`].filter(Boolean).join('. ').trim();
                      if (spokenPrompt) {
                          await speakQuickPrompt(spokenPrompt, 450);
                      }
                      const answer = await waitForSkillConfirmation(durationMs);
                      setVisualContent((current) => (
                          current?.type === 'predefined' && current.component === 'confirmation' ? null : current
                      ));
                      return {
                          result: answer == null ? 'timeout' : answer ? 'confirm' : 'cancel',
                          answer: answer == null ? null : answer ? confirmText : cancelText,
                      };
                  } finally {
                      expectingSkillConfirmationRef.current = false;
                  }
              }

              if (name === 'show_timer_widget') {
                  stopTimerAlarmLoop('Timer reset');
                  setVisualContent({
                      type: 'predefined',
                      component: 'timer',
                      content: parsedPayload,
                      title: parsedPayload?.title || 'TIMER',
                  });
                  return { result: 'Timer widget rendered' };
              }

              if (name === 'show_settings_widget') {
                  setVisualContent({
                      type: 'predefined',
                      component: 'settings',
                      content: parsedPayload,
                      title: parsedPayload?.title || 'SETTINGS',
                  });
                  return { result: 'Settings widget rendered' };
              }

              if (name === 'web_request') {
                  return await runtime.webRequest({
                      url: String(parsedPayload?.url || ''),
                      method: String(parsedPayload?.method || 'GET'),
                      headers: parsedPayload?.headers && typeof parsedPayload.headers === 'object'
                          ? Object.fromEntries(
                              Object.entries(parsedPayload.headers as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')])
                            )
                          : {},
                      body: typeof parsedPayload?.body === 'string'
                          ? parsedPayload.body
                          : parsedPayload?.body != null
                              ? JSON.stringify(parsedPayload.body)
                              : '',
                      timeoutMs: Number(parsedPayload?.timeoutMs) || 12000,
                      responseType: String(parsedPayload?.responseType || 'json'),
                  });
              }

              if (name === 'run_javascript') {
                  return await runtime.runJavascript({
                      code: String(parsedPayload?.code || ''),
                      vars: parsedPayload?.vars && typeof parsedPayload.vars === 'object'
                          ? (parsedPayload.vars as Record<string, unknown>)
                          : {},
                  });
              }

              if (name === 'run_eyes') {
                  return await runtime.runEyes({
                      animationId: String(parsedPayload?.animationId || parsedPayload?.id || ''),
                      durationMs: Number(parsedPayload?.durationMs) || undefined,
                      continueExecution: parsedPayload?.continueExecution === true,
                  });
              }

              return { result: `No local handler for ${name}` };
          },
          wait: async (durationMs: number) => {
              sendBackendLog('info', 'skill', 'wait', `${Math.max(0, Number(durationMs) || 0)}ms`);
              await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(durationMs) || 0)));
          },
      };

      setStatusText(`Running ${installedSkill.name}`);
      sendBackendLog('info', 'skill', 'skill_start', installedSkill.name);
      setIsRunningSkill(true);
      setSkillEyeStateOverride(null);
      setSkillEyeAnimationOverride(null);
      setSkillLightOverride(null);
      try {
          if (installedSkill.toolName === 'run_demo' || installedSkill.id === 'skill-1774580329600') {
              if (demoModeRunningRef.current) {
                  sendBackendLog('warn', 'skill', 'demo_mode_duplicate', 'ignored');
                  return { ok: true, mode: 'already-running' };
              }
              demoModeRunningRef.current = true;
              sendBackendLog('info', 'skill', 'demo_mode_start', 'backend-triggered');
              setStatusText('Demo mode ready');
              await primeDemoSpeech();
              await runtime.playSound({ sound: 'success', volume: 0.6 });
              await runtime.setEyesPreset('speaking', 500);
              await speakDemoLine('Hi, I’m Airo — a family robot designed by Alex Rose');
              await speakDemoLine('I’m here to help, entertain, and be part of your daily life, I can do a lot of things around your home. I can answer questions, help you learn new things, and even play games with you. I can also make video calls, capture photos and videos as your personal cameraman, and help you stay connected with the people you care about.');
              await runtime.setEyesPreset('thinking', 500);
              await speakDemoLine('Think of me as a mix between a helper, a friend… and a little bit of fun.');
              await speakDemoLine('But enough about me… what’s your name?');
              await runtime.playSound({ sound: 'notify', volume: 0.55 });
              setStatusText('Listening for your name');
              const heard = String(await runtime.listenVoiceCommand({ timeoutMs: 9000, interim: false }) || '').trim();
              const extractedName = await extractDemoName(heard);
              await speakDemoLine(`Nice to meet you, ${extractedName} I’m really glad you’re here`);
              await runtime.setEyesPreset('speaking', 1200);
              await speakDemoLine('I’m designed to live right in your home and grow with your family.');
              await speakDemoLine('Whether it’s helping with homework, playing games, taking photos, or just keeping you company… I’m always ready');
              await speakDemoLine('This is just the beginning for me!');
              await runtime.playSound({ sound: 'openMenu', volume: 0.6 });
              await speakDemoLine('I will be going on sale later this year!');
              await speakDemoLine('If you’d like to have me in your home one day…');
              await speakDemoLine('Just let Alex know');
              await speakDemoLine('Until then… I’ll be right here, ready to help');
              await speakDemoLine(`Now ${extractedName}, should we take a photo?`);
              const wantsPhoto = await runtime.showConfirmationWidget({
                  title: `Now ${extractedName}, should we take a photo?`,
                  subtitle: 'You can tap my screen or say Yes or No',
                  confirmText: 'Yes',
                  cancelText: 'No',
                  durationMs: 10000,
              });
              if (wantsPhoto === true) {
                  await primeDemoSpeech();
                  await speakDemoLine('Great! Let’s make this a good one.');
                  const demoPhoto = await takePhotoForGallery();
                  if (demoPhoto) {
                      await speakDemoLine('Okay here is the photo');
                      await runtime.displayImage({ url: demoPhoto, caption: "Here's the image!" });
                      await runtime.wait(4000);
                      setVisualContent(null);
                      await speakDemoLine('I can text you the photo later, but for now');
                  } else {
                      await speakDemoLine('The camera did not respond this time.');
                  }
              } else {
                  await speakDemoLine('Never mind.');
              }
              await speakDemoLine("I'd like to thank you for saying hi. I hope to be part of a family later this year. If you'd like to have me, you can join our list.");
              setStatusText('Demo complete');
              sendBackendLog('info', 'skill', 'demo_mode_complete', 'backend-triggered');
              return { ok: true, mode: 'backend-demo' };
          }
          if (installedSkill.script) {
              await executeAirSkillScript(installedSkill.script, runtime);
          } else {
              const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
              const execute = new AsyncFunction('runtime', installedSkill.generatedCode);
              await execute(runtime);
          }
          sendBackendLog('info', 'skill', 'skill_complete', installedSkill.name);
          return { result: `Ran ${installedSkill.name}` };
      } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendBackendLog('error', 'skill', 'skill_error', `${installedSkill.name}: ${message}`);
          throw error;
      } finally {
          setIsRunningSkill(false);
          if (installedSkill.toolName === 'run_demo' || installedSkill.id === 'skill-1774580329600') {
              demoModeRunningRef.current = false;
          }
      }
  };

  const getTimerStatus = useCallback(() => {
      const timer = backgroundTimerRef.current;
      if (!timer) {
          return {
              title: 'Timer',
              running: false,
              remainingSeconds: 0,
              alarmRinging: false,
          };
      }
      return {
          title: String(timer?.title || 'Timer'),
          running: Boolean(timer?.running),
          remainingSeconds: Math.max(0, Number(timer?.remainingSeconds) || 0),
          alarmRinging: Boolean(timer?.alarmRinging),
      };
  }, []);

  const showRecognizedFamilyAnimation = useCallback((member?: FamilyMemberRecord | null, livePhotoDataUrl?: string | null) => {
      const resolvedMember = member || recognizedFamilyMember;
      const overlayPhotoDataUrl = livePhotoDataUrl || resolvedMember?.photoDataUrl || null;
      if (!resolvedMember?.name || !overlayPhotoDataUrl) return;
      if (recognizedOverlayTimerRef.current) {
          window.clearTimeout(recognizedOverlayTimerRef.current);
          recognizedOverlayTimerRef.current = null;
      }
      lastRecognizedOverlayIdRef.current = resolvedMember.id;
      setRecognizedProfileOverlay({
          visible: true,
          name: resolvedMember.name,
          photoDataUrl: overlayPhotoDataUrl,
      });
      recognizedOverlayTimerRef.current = window.setTimeout(() => {
          setRecognizedProfileOverlay((prev) => ({ ...prev, visible: false }));
          recognizedOverlayTimerRef.current = null;
      }, 2200);
  }, [recognizedFamilyMember]);

  const showWeatherInfoOverlay = useCallback((payload: {
      title: string;
      location: string;
      temperatureText: string;
      detailText: string;
      mediaUrl: string | null;
  }) => {
      if (!payload.mediaUrl) return;
      if (weatherInfoOverlayTimerRef.current) {
          window.clearTimeout(weatherInfoOverlayTimerRef.current);
          weatherInfoOverlayTimerRef.current = null;
      }
      setWeatherInfoOverlay({
          visible: true,
          title: payload.title,
          location: payload.location,
          temperatureText: payload.temperatureText,
          detailText: payload.detailText,
          mediaUrl: payload.mediaUrl,
      });
      weatherInfoOverlayTimerRef.current = window.setTimeout(() => {
          setWeatherInfoOverlay((prev) => ({ ...prev, visible: false }));
          weatherInfoOverlayTimerRef.current = null;
      }, 4000);
  }, []);

  const wakeFromSleep = useCallback((reason: string) => {
      if (!isSleepMode) return;
      lastVisionActivityAtRef.current = Date.now();
      setIsSleepMode(false);
      setStatusText(`Woke up from ${reason}`);
  }, [isSleepMode]);

  const triggerUnknownPersonProactiveInteraction = useCallback((reason: 'background' | 'wake' | 'manual') => {
      const now = Date.now();
      if (connectionStateRef.current !== AppState.IDLE) return false;
      if (assistantMuted || isPreparing || sessionMode === 'family-onboarding' || photoCaptureOverlay.active) return false;
      if (reason === 'background') {
          if (now - lastUnknownPersonGreetingAtRef.current < 12 * 60 * 1000) return false;
          if (now - lastUnknownPersonSeenAtRef.current < 60 * 1000) return false;
      }
      lastUnknownPersonGreetingAtRef.current = now;
      lastUnknownPersonSeenAtRef.current = now;
      const prompt =
          UNKNOWN_PERSON_PROACTIVE_PROMPTS[Math.floor(Math.random() * UNKNOWN_PERSON_PROACTIVE_PROMPTS.length)] ||
          UNKNOWN_PERSON_PROACTIVE_PROMPTS[0];
      setSessionMode('default');
      setSessionPrompt(prompt);
      setStatusText(reason === 'background' ? 'Noticed someone nearby' : 'Someone is in view');
      setWakeState(true);
      return true;
  }, [assistantMuted, isPreparing, photoCaptureOverlay.active, sessionMode]);

  const recognizeVisibleFamilyMember = useCallback(async (
      options?: {
          reason?: 'background' | 'wake' | 'manual';
          force?: boolean;
          allowGreeting?: boolean;
          showOverlay?: boolean;
          sampleCount?: number;
          minConfidence?: number;
      }
  ) => {
      const reason = options?.reason || 'background';
      const force = Boolean(options?.force);
      const allowGreeting = Boolean(options?.allowGreeting);
      const showOverlay = options?.showOverlay !== false;
      const sampleCount = Math.max(1, Math.min(4, options?.sampleCount || (reason === 'background' ? 2 : 3)));
      const minConfidence = options?.minConfidence ?? (reason === 'background' ? 0.68 : 0.58);

      if (!chatEnabled || !hasStarted) return null;
      if (familyRecognitionBusyRef.current) return null;
      if (!force && Date.now() < familyRecognitionCooldownRef.current) return null;

      const activeTarget = visionTargetRef.current;
      const allowFullFrameFallback = force || reason === 'wake' || reason === 'manual';
      if (!allowFullFrameFallback && (!activeTarget || activeTarget.kind !== 'face' || activeTarget.source !== 'front')) {
          return null;
      }
      if (!familyMembers.length || !process.env.GROQ_API_KEY) {
          if (allowGreeting && activeTarget?.kind === 'face' && activeTarget?.source === 'front') {
              lastUnknownPersonSeenAtRef.current = Date.now();
              triggerUnknownPersonProactiveInteraction(reason);
          }
          return null;
      }

      familyRecognitionBusyRef.current = true;
      familyRecognitionCooldownRef.current = Date.now() + (reason === 'background' ? 6500 : 2500);

      try {
          const observations: string[] = [];
          for (let index = 0; index < sampleCount; index += 1) {
              const liveTarget = visionTargetRef.current?.kind === 'face' && visionTargetRef.current?.source === 'front'
                  ? visionTargetRef.current
                  : null;
              const frame = liveTarget
                  ? captureFrame('front', liveTarget, { aspectRatio: 1 })
                  : allowFullFrameFallback
                      ? captureFrame('front', null, { aspectRatio: 1 })
                      : null;
              if (frame) {
                  observations.push(frame);
              }
              if (index < sampleCount - 1) {
                  await new Promise((resolve) => setTimeout(resolve, 140));
              }
          }

          if (!observations.length) return null;
          const livePhotoDataUrl = observations[0] || null;

          const { matchedMemberId, confidence } = await compareFaceObservationsToFamily(
              process.env.GROQ_API_KEY,
              observations,
              familyMembers,
          );
          if (!matchedMemberId || confidence < minConfidence) {
              if (allowGreeting && activeTarget?.kind === 'face' && activeTarget?.source === 'front') {
                  lastUnknownPersonSeenAtRef.current = Date.now();
                  triggerUnknownPersonProactiveInteraction(reason);
              }
              return null;
          }

          const matchedMember = familyMembers.find((member) => member.id === matchedMemberId);
          if (!matchedMember) return null;

          const now = Date.now();
          const updatedMember: FamilyMemberRecord = {
              ...matchedMember,
              lastSeenAt: now,
          };

          setRecognizedFamilyMember(updatedMember);
          setFamilyMembers((prev) =>
              prev.map((member) =>
                  member.id === matchedMemberId ? { ...member, lastSeenAt: now } : member
              )
          );

          const shouldShowOverlay =
              showOverlay &&
              (
                  reason !== 'background' ||
                  recognizedFamilyMember?.id !== matchedMemberId ||
                  now - (recognizedFamilyMember?.lastSeenAt || 0) > 60 * 1000
              );

          if (shouldShowOverlay) {
              showRecognizedFamilyAnimation(updatedMember, livePhotoDataUrl);
          }

          if (reason === 'wake') {
              setStatusText(`Hi ${matchedMember.name}`);
          } else {
              setStatusText(`Recognized ${matchedMember.name}`);
          }

          if (allowGreeting) {
              const lastSeenAt = matchedMember.lastSeenAt || 0;
              const lastGreetedAt = matchedMember.lastGreetedAt || 0;
              const isBirthdayToday = Boolean(matchedMember.birthdayMonthDay) && matchedMember.birthdayMonthDay === getTodayMonthDay();
              const birthdayGreetingDue = isBirthdayToday && !isSameLocalDay(matchedMember.lastBirthdayGreetedAt, now);
              const shouldGreet =
                  (
                      birthdayGreetingDue ||
                      (
                          now - lastSeenAt >= 5 * 60 * 1000 &&
                          now - lastGreetedAt >= 5 * 60 * 1000
                      )
                  ) &&
                  connectionStateRef.current === AppState.IDLE;

              if (shouldGreet) {
                  setRecognizedFamilyMember({ ...updatedMember, lastGreetedAt: now });
                  setFamilyMembers((prev) =>
                      prev.map((member) =>
                          member.id === matchedMemberId
                              ? {
                                  ...member,
                                  lastSeenAt: now,
                                  lastGreetedAt: now,
                                  lastBirthdayGreetedAt: birthdayGreetingDue ? now : member.lastBirthdayGreetedAt,
                              }
                              : member
                      )
                  );
                  setSessionMode('default');
                  setSessionPrompt(
                      birthdayGreetingDue
                          ? `You have just recognized ${matchedMember.name}, and today is their birthday. Give them a warm, short happy birthday greeting by name, then ask if they need anything. ${matchedMember.notes ? `Remember this about them: ${matchedMember.notes}.` : ''}`
                          : `You have just recognized ${matchedMember.name}. Give them a warm, short greeting by name and ask if they need anything. ${matchedMember.notes ? `Remember this about them: ${matchedMember.notes}.` : ''}`
                  );
                  setWakeState(true);
              }
          }

          return { name: matchedMember.name, notes: matchedMember.notes, livePhotoDataUrl };
      } catch (error) {
          console.error('Family recognition failed', error);
          return null;
      } finally {
          familyRecognitionBusyRef.current = false;
      }
  }, [captureFrame, chatEnabled, familyMembers, hasStarted, recognizedFamilyMember, showRecognizedFamilyAnimation, triggerUnknownPersonProactiveInteraction]);

  const getRelevantFamilyMemories = useCallback(async (query: string) => {
      const memberId = recognizedFamilyMember?.id;
      const normalizedQuery = String(query || '').trim();
      if (!memberId || !normalizedQuery || !process.env.API_KEY) return '';
      const member = familyMembers.find((entry) => entry.id === memberId);
      if (!member?.memories?.length) return '';
      try {
          const results = await searchFamilyMemories(
              process.env.API_KEY,
              normalizedQuery,
              member.memories,
              { limit: 4, minimumScore: 0.22 }
          );
          return formatRelevantFamilyMemories(member.name, results);
      } catch (error) {
          console.warn('Failed to retrieve family memories', error);
          return '';
      }
  }, [familyMembers, recognizedFamilyMember?.id]);

  const saveFamilyMemoryTurn = useCallback(async (payload: { userText?: string; assistantText?: string }) => {
      const memberId = recognizedFamilyMember?.id;
      const normalizedUserText = String(payload?.userText || '').trim();
      if (!memberId || !normalizedUserText || !process.env.API_KEY || sessionMode === 'family-onboarding') return;
      const normalizedAssistantText = String(payload?.assistantText || '').trim();
      const combinedText = buildFamilyMemoryCombinedText(normalizedUserText, normalizedAssistantText);
      if (!combinedText) return;

      const currentMember = familyMembers.find((entry) => entry.id === memberId) || recognizedFamilyMember;
      const currentMemories = currentMember?.memories || [];
      const lastMemory = currentMemories[currentMemories.length - 1];
      if (lastMemory?.combinedText?.trim() === combinedText) return;

      try {
          const memoryEntry = await createFamilyMemoryEntry(process.env.API_KEY, {
              userText: normalizedUserText,
              assistantText: normalizedAssistantText,
          });
          if (!memoryEntry) return;

          setFamilyMembers((prev) =>
              prev.map((member) =>
                  member.id === memberId
                      ? {
                            ...member,
                            memories: mergeFamilyMemoryEntries(member.memories, [memoryEntry]),
                        }
                      : member
              )
          );
          setRecognizedFamilyMember((prev) =>
              prev?.id === memberId
                  ? {
                        ...prev,
                        memories: mergeFamilyMemoryEntries(prev.memories, [memoryEntry]),
                    }
                  : prev
          );
      } catch (error) {
          console.warn('Failed to save family memory', error);
      }
  }, [familyMembers, recognizedFamilyMember, sessionMode]);

  const {
    connect,
    disconnect,
    sendTextMessage,
    suspendInput: suspendAssistantInput,
    resumeInput: resumeAssistantInput,
    isAiSpeaking,
    isThinking,
    isProcessingTools,
    isMainModelGenerating,
    eyeEmotion,
    connectionState,
    visualContent,
    setVisualContent
  } = useGeminiLive(
    process.env.API_KEY, 
    () => {
        setWakeState(false);
        setIsPreparing(false);
        setSessionMode('default');
        setSessionPrompt(null);
        setFamilyIntroFlow((prev) => ({
            ...prev,
            active: false,
            status: prev.step === 'complete' ? prev.status : (prev.status || 'Family introductions finished'),
        }));
        setAwaitingFirstTextTurn(false);
        stopFirstTurnListening();
        scheduleWakeListenerRestart(450);
    },
    location,
    turnLeftMotorByDegrees,
    faceUserWithSeek,
    moveRobotExpressive,
    turnToWaypoint,
    captureFamilyPhoto,
    captureGuidedFamilyPhoto,
    runFamilyPhotoSequence,
    updateFamilyIntroductionDraft,
    saveFamilyMember,
    takePhotoForGallery,
    captureRecognitionSnapshots,
    recognizedFamilyMember ? { id: recognizedFamilyMember.id, name: recognizedFamilyMember.name, notes: recognizedFamilyMember.notes } : null,
    () => recognizeVisibleFamilyMember({ reason: 'manual', force: true, allowGreeting: false, showOverlay: true, sampleCount: 4, minConfidence: 0.58 }),
    (livePhotoDataUrl?: string | null) => showRecognizedFamilyAnimation(undefined, livePhotoDataUrl),
    getRelevantFamilyMemories,
    saveFamilyMemoryTurn,
    showWeatherInfoOverlay,
    installedSkills,
    runInstalledSkill,
    getTimerStatus,
    stopCurrentTimer,
    (text: string) => liveSpeechConsumerRef.current(text),
    intentOutputContract
  );
  const cameraTrackingEnabled =
      hasStarted &&
      !isPreparing &&
      !isLoadingModels &&
      (connectionState === AppState.IDLE || sessionMode === 'family-onboarding' || photoCaptureOverlay.active);
  const followEnabled = cameraTrackingEnabled && ollieConnected && movementAllowed;

  const handleConfirmationAnswer = (answer: string) => {
      if (pendingPhotoDecision) {
          const normalized = answer.toLowerCase().trim();
          void resolvePendingPhotoDecision(normalized === 'yes' || normalized === 'save');
          return;
      }
      if (skillConfirmationResolverRef.current) {
          const normalized = answer.toLowerCase().trim();
          const decision = interpretBinaryDecision(normalized);
          const resolver = skillConfirmationResolverRef.current;
          skillConfirmationResolverRef.current = null;
          stopSkillConfirmationListening();
          resolver(decision);
          setVisualContent(null);
          setStatusText(`Developer confirmation: ${answer}`);
          return;
      }
      if (developerMode) {
          setVisualContent(null);
          setStatusText(`Developer confirmation: ${answer}`);
          return;
      }
      const sent = sendTextMessage(answer);
      if (sent) {
          setStatusText(`Sent ${answer}`);
      }
      setVisualContent(null);
  };

  useEffect(() => {
      liveSpeechConsumerRef.current = (rawTranscript: string) => {
          const transcript = String(rawTranscript || '').trim();
          if (!transcript) return false;

          if (isStopTimerCommand(transcript)) {
              stopCurrentTimer('Timer stopped by voice');
              return true;
          }

          if (pendingPhotoDecision) {
              const decision = interpretPhotoDecision(transcript, pendingPhotoDecision.mode);
              if (decision == null) return false;
              setStatusText(decision ? 'Photo confirmation yes (live mic)' : 'Photo confirmation no (live mic)');
              void resolvePendingPhotoDecision(decision);
              return true;
          }

          if (skillConfirmationResolverRef.current) {
              const decision = interpretBinaryDecision(transcript);
              if (decision == null) return false;
              const resolver = skillConfirmationResolverRef.current;
              skillConfirmationResolverRef.current = null;
              stopSkillConfirmationListening();
              resolver(decision);
              setVisualContent(null);
              setStatusText(decision ? 'Skill confirmation yes (live mic)' : 'Skill confirmation no (live mic)');
              return true;
          }

          const confirmationContent =
              visualContent?.type === 'predefined' && visualContent.component === 'confirmation'
                  ? (visualContent as any).content
                  : null;
          if (!confirmationContent) return false;
          const choice = interpretConfirmationChoice(
              transcript,
              confirmationContent?.confirmText,
              confirmationContent?.cancelText
          );
          if (!choice) return false;
          const answer = choice === 'confirm'
              ? String(confirmationContent?.confirmText || 'Yes')
              : String(confirmationContent?.cancelText || 'No');
          setStatusText(`Confirmation heard (live mic): ${answer}`);
          handleConfirmationAnswer(answer);
          return true;
      };
  }, [pendingPhotoDecision, visualContent, stopCurrentTimer, isStopTimerCommand]);

  useEffect(() => {
      visionTargetRef.current = visionTarget;
  }, [visionTarget]);

  useEffect(() => {
      const sawAnything = Boolean(visionTarget || rearTarget);
      if (!sawAnything) return;
      lastVisionActivityAtRef.current = Date.now();
      if (isSleepMode) {
          wakeFromSleep('camera activity');
      }
  }, [isSleepMode, rearTarget, visionTarget, wakeFromSleep]);

  useEffect(() => {
      if (!hasStarted || assistantMuted || menuOpen || isPreparing || connectionState !== AppState.IDLE) {
          return;
      }
      const timer = window.setInterval(() => {
          if (isSleepMode) return;
          const idleFor = Date.now() - lastVisionActivityAtRef.current;
          if (idleFor < SLEEP_INACTIVITY_MS) return;
          setIsSleepMode(true);
          setWakeState(false);
          setStatusText('Sleep mode');
          void stopRobotMotion();
      }, 15000);
      return () => {
          window.clearInterval(timer);
      };
  }, [assistantMuted, connectionState, hasStarted, isPreparing, isSleepMode, menuOpen, stopRobotMotion]);

  useEffect(() => {
      if (!menuOpen || menuPanel !== 'developer' || cameraState !== 'active') {
          setDeveloperVisionPreview((prev) => (
              prev.front || prev.rear ? { front: null, rear: null } : prev
          ));
          return;
      }

      const updatePreview = () => {
          setDeveloperVisionPreview({
              front: captureFrame('front', visionTarget || null, { aspectRatio: 16 / 9 }) || null,
              rear: captureFrame('rear', rearTarget || null, { aspectRatio: 16 / 9 }) || null,
          });
      };

      updatePreview();
      const timer = window.setInterval(updatePreview, 450);
      return () => {
          window.clearInterval(timer);
      };
  }, [cameraState, captureFrame, menuOpen, menuPanel, rearTarget, visionTarget]);

  useEffect(() => {
      if (!chatEnabled || !recognizedFamilyMember) return;
      const next = familyMembers.find((member) => member.id === recognizedFamilyMember.id) || null;
      setRecognizedFamilyMember(next);
  }, [chatEnabled, familyMembers, recognizedFamilyMember]);

  useEffect(() => {
      if (!recognizedFamilyMember?.id || !recognizedFamilyMember.photoDataUrl) return;
      if (lastRecognizedOverlayIdRef.current === recognizedFamilyMember.id) return;
      showRecognizedFamilyAnimation(recognizedFamilyMember);
  }, [recognizedFamilyMember, showRecognizedFamilyAnimation]);

  useEffect(() => {
      return () => {
          if (recognizedOverlayTimerRef.current) {
              window.clearTimeout(recognizedOverlayTimerRef.current);
          }
      };
  }, []);

  useEffect(() => {
      const isConfirmation =
          visualContent?.type === 'predefined' && visualContent.component === 'confirmation';
      if (!isConfirmation || pendingPhotoDecision || skillConfirmationResolverRef.current || expectingSkillConfirmationRef.current) {
          stopPassiveConfirmationListening();
          return;
      }

      const content = (visualContent as any)?.content || {};
      void startPassiveConfirmationListening(content, 12000);
      return () => {
          stopPassiveConfirmationListening();
      };
  }, [visualContent, pendingPhotoDecision]);

  useEffect(() => {
      return () => {
          stopPhotoDecisionListening();
          stopSkillConfirmationListening();
          stopPassiveConfirmationListening();
          stopFirstTurnListening();
          stopTimerAlarmLoop('Timer cleanup');
      };
  }, [stopTimerAlarmLoop]);

  useEffect(() => {
      if (!chatEnabled || !hasStarted) return;
      if (assistantMuted || isPreparing || sessionMode === 'family-onboarding' || photoCaptureOverlay.active) return;
      if (opencvState !== 'ready') return;

      const tick = () => {
          const activeTarget = visionTargetRef.current;
          if (!activeTarget || activeTarget.kind !== 'face' || activeTarget.source !== 'front') return;
          void recognizeVisibleFamilyMember({
              reason: 'background',
              allowGreeting: true,
              showOverlay: true,
              sampleCount: 2,
              minConfidence: 0.76,
          });
      };

      tick();
      const timer = window.setInterval(tick, 3200);
      return () => {
          window.clearInterval(timer);
      };
  }, [assistantMuted, chatEnabled, familyMembers.length, hasStarted, isPreparing, opencvState, photoCaptureOverlay.active, recognizeVisibleFamilyMember, sessionMode]);

  useEffect(() => {
      if (!isAiSpeaking || !ollieRef.current || isMovingRef.current || !movementAllowed) return;

      const runSubtleMotion = async () => {
          if (!ollieRef.current || isMovingRef.current) return;
          isMovingRef.current = true;
          const direction = subtleMotionPhaseRef.current % 2 === 0 ? 1 : -1;
          const shouldDoTurnAccent = subtleMotionPhaseRef.current % 2 === 1;
          const speed = scaleMotorSpeed(Math.min(142 + Math.abs(turnRate) * 0.2, 195), 85);
          try {
              signalEyeIntent(direction);
              if (shouldDoTurnAccent) {
                  await driveSelectedMotor(
                      direction > 0 ? 'forward' : 'reverse',
                      scaleMotorSpeed(172, 110)
                  );
                  await new Promise((resolve) => setTimeout(resolve, 300));
              } else {
                  if (direction > 0) {
                      await driveSelectedMotor('forward', speed);
                  } else {
                      await driveSelectedMotor('reverse', speed);
                  }
                  await new Promise((resolve) => setTimeout(resolve, 280));
              }
              await ollieRef.current.stopMotion();
              await new Promise((resolve) => setTimeout(resolve, 45));
              const bounceDirection: MobilityMotorDirection = direction > 0 ? 'reverse' : 'forward';
              await driveSelectedMotor(bounceDirection, scaleMotorSpeed(108, 72));
              await new Promise((resolve) => setTimeout(resolve, 120));
              await ollieRef.current.stopMotion();
          } finally {
              isMovingRef.current = false;
              subtleMotionPhaseRef.current += 1;
              setEyeIntentX(0);
          }
      };

      runSubtleMotion();
      subtleMotionTimerRef.current = window.setInterval(runSubtleMotion, 520);

      return () => {
          if (subtleMotionTimerRef.current) {
              window.clearInterval(subtleMotionTimerRef.current);
              subtleMotionTimerRef.current = null;
          }
          ollieRef.current?.stopMotion().catch(() => {});
      };
  }, [isAiSpeaking, movementAllowed, motorSpeedScale, turnRate, motorSide]);

  useEffect(() => {
      if (!followEnabled || !visionTarget || !ollieRef.current || isAiSpeaking) {
          if (followTimerRef.current) {
              window.clearInterval(followTimerRef.current);
              followTimerRef.current = null;
          }
          return;
      }

      const followTarget = async () => {
          if (!ollieRef.current || isMovingRef.current || isAiSpeaking) return;

          const horizontalOffset = visionTarget.x;
          const shouldTurn = Math.abs(horizontalOffset) > 0.18;
          if (!shouldTurn) return;

          const speed = scaleMotorSpeed(Math.round(Math.min(52 + visionTarget.speed * 70 + Math.abs(horizontalOffset) * 38, 118)), 42);
          const duration = Math.round(Math.min(72 + visionTarget.speed * 95 + visionTarget.strength * 70, 150));
          const turnLeft = horizontalOffset < 0;

          isMovingRef.current = true;
          try {
              if (turnLeft) {
                  await driveSelectedMotor('reverse', speed);
              } else {
                  await driveSelectedMotor('forward', speed);
              }
              await new Promise((resolve) => setTimeout(resolve, duration));
              await ollieRef.current.stopMotion();
          } finally {
              isMovingRef.current = false;
          }
      };

      followTimerRef.current = window.setInterval(followTarget, 320);
      followTarget();

      return () => {
          if (followTimerRef.current) {
              window.clearInterval(followTimerRef.current);
              followTimerRef.current = null;
          }
      };
  }, [followEnabled, visionTarget, isAiSpeaking, motorSpeedScale, motorSide]);

  useEffect(() => {
      if (!followEnabled || !rearTarget || visionTarget || !ollieRef.current || isAiSpeaking) {
          if (rearSweepTimerRef.current) {
              window.clearInterval(rearSweepTimerRef.current);
              rearSweepTimerRef.current = null;
          }
          return;
      }

      const sweepRearInterest = async () => {
          if (!ollieRef.current || isMovingRef.current || isAiSpeaking || visionTarget) return;
          if (rearTarget.kind !== 'motion') return;
          const now = Date.now();
          if (now - rearTurnCooldownRef.current < 3500) return;
          rearTurnCooldownRef.current = now;
          setStatusText('Rear motion detected | Turning around');
          await turnLeftMotorByDegrees(180);
      };

      rearSweepTimerRef.current = window.setInterval(sweepRearInterest, 320);
      sweepRearInterest();

      return () => {
          if (rearSweepTimerRef.current) {
              window.clearInterval(rearSweepTimerRef.current);
              rearSweepTimerRef.current = null;
          }
      };
  }, [followEnabled, rearTarget, visionTarget, isAiSpeaking, motorSpeedScale, motorSide]);

  useEffect(() => {
      const standbyActive =
          hasStarted &&
          ollieConnected &&
          movementAllowed &&
          connectionState === AppState.IDLE &&
          !isPreparing &&
          !isLoadingModels &&
          !menuOpen &&
          !assistantMuted &&
          !visionTarget &&
          !rearTarget;

      if (!standbyActive || !ollieRef.current) {
          if (standbyMotionTimerRef.current) {
              window.clearInterval(standbyMotionTimerRef.current);
              standbyMotionTimerRef.current = null;
          }
          return;
      }

      const runStandbyLook = async () => {
          if (!ollieRef.current || isMovingRef.current) return;
          const shouldMove = Math.random() > 0.05;
          const direction = Math.random() > 0.5 ? 1 : -1;
          signalEyeIntent(direction);

          if (!shouldMove) return;

          const speed = scaleMotorSpeed(94, 58);
          const duration = 170 + Math.round(Math.random() * 130);
          isMovingRef.current = true;
          try {
              await driveSelectedMotor(
                  direction > 0 ? 'forward' : 'reverse',
                  speed
              );
              await new Promise((resolve) => setTimeout(resolve, duration));
              await ollieRef.current.stopMotion();
          } finally {
              isMovingRef.current = false;
              setEyeIntentX(0);
          }
      };

      standbyMotionTimerRef.current = window.setInterval(runStandbyLook, 2200);
      const initialDelay = window.setTimeout(runStandbyLook, 1100);

      return () => {
          window.clearTimeout(initialDelay);
          if (standbyMotionTimerRef.current) {
              window.clearInterval(standbyMotionTimerRef.current);
              standbyMotionTimerRef.current = null;
          }
      };
  }, [assistantMuted, connectionState, hasStarted, isLoadingModels, isPreparing, menuOpen, movementAllowed, motorSide, motorSpeedScale, ollieConnected, rearTarget, visionTarget]);

  const handleConnectOllie = async () => {
      if (isAiroCModel) {
          setStatusText('Airo C does not use an Airo Dock');
          return;
      }
      if (isAr20Model) {
          setStatusText('AR-20 uses an inertial Sphero core, not an Airo Dock');
          return;
      }
      try {
          await requestPermission();
          const dockDriver = NativeOllie.isAvailable() ? new NativeOllie() : new Ollie();
          const ollie = new DockMobilityController(dockDriver);
          await ollie.request();
          await ollie.connect();
          await ollie.init();
          ollieRef.current = ollie;
          mobilityBackendRef.current = NativeOllie.isAvailable() ? 'native-dock' : 'web-dock';
          setOllieConnected(true);
          
          // Centered startup calibration for the docked robot models.
          setStatusText('Calibrating...');
          await runStartupCalibrationMotion();
          await ollie.setAccentColor(0, 120, 255);
          setStatusText("Airo Dock connected");
      } catch (e) {
          console.error("Failed to connect Airo Dock", e);
      }
  };

  useEffect(() => {
      const syncNativeDock = () => {
          if (!NativeOllie.isAvailable()) return;
          const connected = NativeOllie.isConnected();
          if (connected) {
              if (mobilityBackendRef.current !== 'native-dock') {
                  ollieRef.current = new DockMobilityController(new NativeOllie());
                  mobilityBackendRef.current = 'native-dock';
              }
              setOllieConnected(true);
              setStatusText('Airo Dock connected');
              return;
          }
          if (mobilityBackendRef.current === 'native-dock') {
              ollieRef.current = null;
              mobilityBackendRef.current = null;
              setOllieConnected(false);
          }
      };

      syncNativeDock();
      const handleBleStatus = () => syncNativeDock();
      window.addEventListener('airo-ble-status', handleBleStatus as EventListener);
      window.addEventListener('airo-android-ready', handleBleStatus as EventListener);
      return () => {
          window.removeEventListener('airo-ble-status', handleBleStatus as EventListener);
          window.removeEventListener('airo-android-ready', handleBleStatus as EventListener);
      };
  }, []);

  const cycleMenu = (direction: 1 | -1) => {
      setMenuSlideDirection(direction);
      setMenuIndex((prev) => {
          const next = prev + direction;
          if (next < 0) return menuItems.length - 1;
          if (next >= menuItems.length) return 0;
          return next;
      });
      setMenuPanel('carousel');
  };

  const handleToggleMute = async () => {
      const nextMuted = !assistantMuted;
      setAssistantMuted(nextMuted);
      setWakeState(false);
      await stopRobotMotion();
      if (nextMuted) {
          wakeWordRef.current?.stop();
          await disconnect();
          setStatusText('Airo muted');
          await setRobotLights(255, 40, 40);
      } else {
          setStatusText('Airo unmuted');
          if (chatEnabled && hasStarted && connectionStateRef.current === AppState.IDLE) {
              wakeWordRef.current?.start();
          }
      }
  };

  const openMenuItem = async (item: DynamicMenuItem, index: number, offset: number) => {
      if (item.kind === 'skill' && item.toolName) {
          setMenuIndex(index);
          setStatusText(`Running ${item.label}`);
          await runDeveloperSkill(item.toolName);
          return;
      }

      if (item.id === 'developer') setMenuPanel('developer');
      else if (item.id === 'mute') setMenuPanel('mute');
      else if (item.id === 'motor') setMenuPanel('motor');
      else if (item.id === 'family') setMenuPanel('family');
      else if (item.id === 'gallery') setMenuPanel('gallery');
      else if (item.id === 'skill-store') setMenuPanel('skill-store');
      else if (item.id === 'mobile-app') setMenuPanel('mobile-app');
      else {
          setMenuSlideDirection(offset > 0 ? 1 : -1);
          setMenuIndex(index);
          setMenuPanel('carousel');
      }
  };

  const handleStartFamilyOnboarding = async () => {
      await startGuidedFamilyEnrollment();
      setMenuOpen(false);
      setFamilyIntroFlow({
          active: true,
          step: 'ask-name',
          name: '',
          birthday: '',
          notes: '',
          status: 'Airo is about to introduce a new family member',
      });
      setSessionMode('family-onboarding');
      setSessionPrompt([
          'You are starting a family introductions session for Airo.',
          'Open warmly and explain the full process before you begin.',
          'Tell them you will learn their name, guide them through three face photos in this order: left, right, then center, ask for their birthday so Airo can say happy birthday later, and ask if there is anything Airo should know about them.',
          'Keep the tone smooth, charming, and reassuring, like Airo is carefully helping a family member join the household.',
          'Ask only one thing at a time.',
          'As soon as you learn their name, call update_family_member_draft with the name and a short status line.',
          'After you learn their name, call run_family_photo_sequence. That tool will guide left, right, and center photos and handle the ready prompts locally.',
          'When you learn a birthday or note, call update_family_member_draft again so the profile stays up to date.',
          'If they skip birthday or notes, that is fine.',
          'When all three photos are captured, call save_family_member with name, birthday if given, and notes if given.',
          'After saving, give a warm closing line and then call exit_chat.',
      ].join(' '));
      setStatusText('Starting family introductions');
      setWakeState(true);
  };

  const toggleSkillInstall = (skillId: string) => {
      setInstalledSkillIds((prev) =>
          prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
      );
  };

  const runDeveloperSkill = async (toolName: string) => {
      setLastDeveloperSkillToolName(toolName);
      setMenuOpen(false);
      setMenuPanel('carousel');
      setWakeState(false);
      await stopRobotMotion();
      await runInstalledSkill(toolName);
  };

  const triggerBackendDemoMode = async () => {
      const clientId = backendClientIdRef.current;
      if (!clientId) {
          setStatusText('Backend demo unavailable');
          return;
      }
      try {
          setStatusText('Sending backend demo trigger');
          const response = await fetch('/backend/api/trigger', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  clientId,
                  type: 'demo_mode',
                  action: 'demo_mode',
                  payload: {},
              }),
          });
          if (!response.ok) {
              throw new Error(`Backend demo trigger failed (${response.status})`);
          }
          setStatusText('Backend demo triggered');
      } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusText(message);
          sendBackendLog('error', 'backend-command', 'demo_mode_trigger_failed', message);
      }
  };

  const handleToggleDeveloperMode = async () => {
      const nextDeveloperMode = !developerMode;
      setDeveloperMode(nextDeveloperMode);

      if (nextDeveloperMode) {
          setWakeState(false);
          setIsPreparing(false);
          setSessionPrompt(null);
          setAwaitingFirstTextTurn(false);
          stopFirstTurnListening();
          wakeWordRef.current?.stop();
          if (connectionStateRef.current !== AppState.IDLE) {
              await disconnect();
          }
          setStatusText('Developer mode ready');
          return;
      }

      setMenuOpen(false);
      setMenuPanel('carousel');
      setWakeState(false);
      setIsPreparing(false);
      setSessionPrompt(null);
      setAwaitingFirstTextTurn(false);
      stopFirstTurnListening();
      setStatusText("Voice mode active | Listening for 'Hey Airo'");
      if (hasStarted && !assistantMuted && connectionStateRef.current === AppState.IDLE) {
          wakeWordRef.current?.start();
      }
  };

  const handleMenuOpen = async () => {
      setMenuOpen(true);
      setMenuPanel('carousel');
      setWakeState(false);
      wakeWordRef.current?.stop();
      await stopRobotMotion();
      if (connectionStateRef.current !== AppState.IDLE) {
          await disconnect();
      }
      setStatusText('Control menu open');
      await playOst('openMenu', 0.6);
    };

  const handleMenuClose = async () => {
      setMenuOpen(false);
      setMenuPanel('carousel');
      await stopRobotMotion();
      if (assistantMuted) {
          setStatusText('Airo muted');
          await setRobotLights(255, 40, 40);
          return;
      }
      setStatusText('Listening for Hey Airo');
      await playOst('closeMenu', 0.6);
      if (chatEnabled && hasStarted && connectionStateRef.current === AppState.IDLE) {
          wakeWordRef.current?.start();
      } else if (developerMode) {
          setStatusText('Developer mode ready');
      }
  };

  useEffect(() => {
      connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
      chatEnabledRef.current = chatEnabled;
  }, [chatEnabled]);

  useEffect(() => {
      hasStartedRef.current = hasStarted;
  }, [hasStarted]);

  useEffect(() => {
      wakeStateRef.current = wakeState;
  }, [wakeState]);

  useEffect(() => {
      assistantMutedRef.current = assistantMuted;
  }, [assistantMuted]);

  useEffect(() => {
      menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
      isSleepModeRef.current = isSleepMode;
  }, [isSleepMode]);

  useEffect(() => {
      isStopTimerCommandRef.current = isStopTimerCommand;
  }, [isStopTimerCommand]);

  useEffect(() => {
      stopTimerAlarmLoopRef.current = stopTimerAlarmLoop;
  }, [stopTimerAlarmLoop]);

  useEffect(() => {
      wakeFromSleepRef.current = wakeFromSleep;
  }, [wakeFromSleep]);

  useEffect(() => {
      recognizeVisibleFamilyMemberRef.current = recognizeVisibleFamilyMember;
  }, [recognizeVisibleFamilyMember]);

  useEffect(() => {
      orientTowardSpeakerFromSensorsRef.current = orientTowardSpeakerFromSensors;
  }, [orientTowardSpeakerFromSensors]);

  useEffect(() => {
      if (!backendClientIdRef.current) return;

      const sendHeartbeat = () => {
          const simplifyTarget = (target: VisionTarget | null | undefined) => (
              target
                  ? {
                        kind: target.kind,
                        source: target.source,
                        x: Number(target.x || 0),
                        y: Number(target.y || 0),
                        strength: Number(target.strength || 0),
                    }
                  : null
          );
          const frontPreview = cameraState === 'active'
              ? captureFrame('front', visionTarget || null, { aspectRatio: 16 / 9 }) || ''
              : '';
          const rearPreview = cameraState === 'active'
              ? captureFrame('rear', rearTarget || null, { aspectRatio: 16 / 9 }) || ''
              : '';
          void fetch('/backend/api/heartbeat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  clientId: backendClientIdRef.current,
                  label: isMobileBrowser ? 'Airo Unit Mobile' : 'Airo Unit Desktop',
                  pairCode: pairingCode,
                  statusText,
                  connectionState,
                  hasStarted,
                  ollieConnected,
                  assistantMuted,
                  movementEnabled,
                  cameraState,
                  cameraMode,
                  opencvState,
                  recognizedFamilyName: recognizedFamilyMember?.name || '',
                  recognizedFamilyNotes: recognizedFamilyMember?.notes || '',
                  visionTarget: simplifyTarget(visionTarget),
                  rearTarget: simplifyTarget(rearTarget),
                  frontPreview,
                  rearPreview,
                  updatedAt: Date.now(),
              }),
          }).catch(() => {});
      };

      sendHeartbeat();
      const interval = window.setInterval(sendHeartbeat, 2500);
      return () => {
          window.clearInterval(interval);
      };
  }, [assistantMuted, cameraMode, cameraState, captureFrame, connectionState, hasStarted, isMobileBrowser, movementEnabled, ollieConnected, opencvState, pairingCode, rearTarget, recognizedFamilyMember, statusText, visionTarget]);

  useEffect(() => {
      if (!backendClientIdRef.current) return;

      const pollCommands = async () => {
          try {
              const response = await fetch(`/backend/api/commands?clientId=${encodeURIComponent(backendClientIdRef.current)}`, {
                  cache: 'no-store',
              });
              if (!response.ok) return;
              const payload = await response.json();
              const commands = Array.isArray(payload?.commands) ? payload.commands : [];
              for (const command of commands) {
                  if (command?.type === 'voice_mode') {
                      triggerRemoteVoiceMode(typeof command.prompt === 'string' ? command.prompt : null);
                      continue;
                  }
                  if (command?.type === 'demo_mode') {
                      void runInstalledSkill('run_demo');
                      continue;
                  }
                  if (command?.type === 'remote_action' && command?.action) {
                      const action = String(command.action || '');
                      const payload = command?.payload && typeof command.payload === 'object' ? command.payload : {};
                      try {
                          if (action === 'set_mute') {
                              setAssistantMuted(Boolean((payload as any).value));
                          } else if (action === 'set_movement') {
                              setMovementEnabled(Boolean((payload as any).value));
                          } else if (action === 'move_robot') {
                              const direction = String((payload as any).direction || 'front');
                              const intensity = Number((payload as any).intensity ?? 0.72);
                              const durationMs = Number((payload as any).durationMs ?? 700);
                              await moveRobotExpressive(direction, intensity, durationMs);
                          } else if (action === 'turn_robot') {
                              const degrees = Number((payload as any).degrees ?? 90);
                              await turnLeftMotorByDegrees(degrees);
                          } else if (action === 'face_user') {
                              await faceUserWithSeek();
                          } else if (action === 'run_skill') {
                              const toolName = String((payload as any).toolName || '');
                              if (toolName) await runInstalledSkill(toolName);
                          } else if (action === 'install_skill') {
                              const skillId = String((payload as any).skillId || '');
                              if (skillId) {
                                  setInstalledSkillIds((prev) => (prev.includes(skillId) ? prev : [...prev, skillId]));
                                  setStatusText(`Installed skill ${skillId}`);
                              }
                          } else if (action === 'say_text') {
                              const text = String((payload as any).text || '').trim();
                              if (text) {
                                  sendTextMessage(text);
                              }
                          } else if (action === 'open_menu') {
                              setMenuOpen(true);
                              setMenuPanel('carousel');
                          } else if (action === 'demo_mode') {
                              await runInstalledSkill('run_demo');
                          }
                      } catch (error) {
                          const message = error instanceof Error ? error.message : String(error);
                          sendBackendLog('error', 'backend-command', `remote_action_failed:${action}`, message);
                      }
                      continue;
                  }
                  if (command?.type === 'run_skill_package' && command?.package && typeof command.package === 'object') {
                      try {
                          const installedFromPackage = skillPackageToInstalledSkill(command.package as any, {
                              source: 'builder',
                              emoji: '🧪',
                              color: '#22c55e',
                              author: 'Skills Page',
                          });
                          setSkillCatalog((prev) => mergeSkillLists(BUNDLED_AIRO_SKILLS, prev, [installedFromPackage]));
                          setInstalledSkillIds((prev) => (
                              prev.includes(installedFromPackage.id) ? prev : [...prev, installedFromPackage.id]
                          ));
                          setStatusText(`Running ${installedFromPackage.name} from Skills Page`);
                          await runInstalledSkill(installedFromPackage.toolName);
                      } catch (error) {
                          const message = error instanceof Error ? error.message : String(error);
                          setStatusText(`Remote skill run failed: ${message}`);
                          sendBackendLog('error', 'backend-command', 'run_skill_package_failed', message);
                      }
                  }
              }
          } catch {}
      };

      void pollCommands();
      const interval = window.setInterval(() => {
          void pollCommands();
      }, 900);
      return () => {
          window.clearInterval(interval);
      };
  }, [faceUserWithSeek, moveRobotExpressive, runInstalledSkill, sendTextMessage, triggerRemoteVoiceMode, turnLeftMotorByDegrees]);

  // Initialize Wake Word Detector
  useEffect(() => {
    const bridgeWindow = window as any;
    const forwardNativeReply = (text: unknown) => {
        const transcript = String(text || '').trim();
        if (!transcript) return;
        window.dispatchEvent(new CustomEvent('airo-native-reply', { detail: { text: transcript, isFinal: true } }));
    };
    bridgeWindow.onAiroNativeReply = forwardNativeReply;
    bridgeWindow.onAiroNativeTranscript = forwardNativeReply;
    bridgeWindow.onAiroNativeResult = forwardNativeReply;
    bridgeWindow.handleAiroNativeReply = forwardNativeReply;

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((position) => {
            setLocation(`${position.coords.latitude}, ${position.coords.longitude}`);
        }, (error) => {
            console.error("Geolocation error:", error);
        });
    }

    const detector = new WakeWordDetector(
      (_audioBuffer, wakeTranscript) => {
          if (!chatEnabledRef.current) return;
          if (isSleepModeRef.current) {
              wakeFromSleepRef.current('wake word');
          }
          if (connectionStateRef.current === AppState.IDLE) {
              const sourceTranscript = latestWakeTranscriptRef.current || wakeTranscript || '';
              if (isStopTimerCommandRef.current(sourceTranscript)) {
                  stopTimerAlarmLoopRef.current('Timer silenced');
                  setVisualContent((current) => (
                      current?.type === 'predefined' && current.component === 'timer' ? null : current
                  ));
                  latestWakeTranscriptRef.current = '';
                  return;
              }
              const carriedPrompt = extractWakeCommand(sourceTranscript);
              setWakeCarryPrompt(carriedPrompt || null);
              setSessionPrompt(null);
              setAwaitingFirstTextTurn(!carriedPrompt);
              setWakeState(true);
              setStatusText("Wake Word Detected!");
              void playOst('readyForSpeech', 0.58);
              void recognizeVisibleFamilyMemberRef.current({
                  reason: 'wake',
                  force: true,
                  allowGreeting: false,
                  showOverlay: true,
                  sampleCount: 4,
                  minConfidence: 0.58,
              });
              latestWakeTranscriptRef.current = '';
          }
      },
      (text) => {
          if (!chatEnabledRef.current) return;
          if (text.startsWith('Heard: ')) {
              latestWakeTranscriptRef.current = text.slice(7).trim();
              void orientTowardSpeakerFromSensorsRef.current();
          }
          setStatusText(text);
      }
    );
    wakeWordRef.current = detector;

    if (hasStartedRef.current) {
        void detector.load().then(() => {
            if (wakeWordRef.current !== detector) return;
            if (
                chatEnabledRef.current &&
                !wakeStateRef.current &&
                !assistantMutedRef.current &&
                !menuOpenRef.current &&
                !isSleepModeRef.current &&
                connectionStateRef.current === AppState.IDLE
            ) {
                void detector.start();
            }
        }).catch((error) => {
            console.warn('Wake detector reload failed', error);
        });
    }

    return () => {
        detector.stop();
        if (wakeWordRef.current === detector) {
            wakeWordRef.current = null;
        }
        cancelWakeListenerRestart();
        if (bridgeWindow.onAiroNativeReply === forwardNativeReply) delete bridgeWindow.onAiroNativeReply;
        if (bridgeWindow.onAiroNativeTranscript === forwardNativeReply) delete bridgeWindow.onAiroNativeTranscript;
        if (bridgeWindow.onAiroNativeResult === forwardNativeReply) delete bridgeWindow.onAiroNativeResult;
        if (bridgeWindow.handleAiroNativeReply === forwardNativeReply) delete bridgeWindow.handleAiroNativeReply;
    };
  }, [cancelWakeListenerRestart]);

  useEffect(() => {
      sensorHeadingRef.current = relativeHeading;
      if (!isAiroCModel && ollieConnected && ollieRef.current) {
          ollieRef.current.updateHeading(relativeHeading);
      }
  }, [isAiroCModel, ollieConnected, relativeHeading]);

  // Model Loading Logic
  const handleStart = useCallback(async () => {
    if (!wakeWordRef.current) return;
    if (hasStarted && !isLoadingModels) return;
    
    setIsLoadingModels(true);
    setHasStarted(true);
    
    try {
        await thinkingAudio.unlock();
        void requestPermission()
          .then(() => {
              zeroHeading();
              sensorHeadingRef.current = 0;
              ollieRef.current?.updateHeading(0);
          })
          .catch((error) => {
              console.warn('Heading permission startup failed', error);
          });

        void startCameraTracking().catch((error) => {
            console.warn('Camera startup deferred', error);
        });
        if (selectedRobotModel === 'Airo C') {
            setMovementEnabled(false);
        } else if (selectedRobotModel === 'AR-20') {
            setMovementEnabled(true);
        }

        await wakeWordRef.current.load();
        if (chatEnabled) {
            wakeWordRef.current.start();
            setStatusText(selectedRobotModel === 'AR-20' ? 'AR-20 inertial mode ready' : "Listening for Hey Airo");
        } else {
            setStatusText(selectedRobotModel === 'AR-20' ? 'AR-20 developer mode ready' : 'Developer mode ready');
        }
        startupCalibrationDoneRef.current = false;
        setIsLoadingModels(false);
    } catch (e) {
        console.error("Failed to load models", e);
        setStatusText("Model Load Error");
        setIsLoadingModels(false);
        // Optionally fallback or alert user
    }
  }, [chatEnabled, hasStarted, isAiroCModel, isLoadingModels, requestPermission, selectedRobotModel, startCameraTracking, thinkingAudio, zeroHeading]);

  useEffect(() => {
      let disposed = false;

      const attemptAutoStart = (remainingAttempts = 18) => {
          if (disposed || autoStartAttemptedRef.current) return;
          if (hasStarted) {
              autoStartAttemptedRef.current = true;
              return;
          }
          if (!wakeWordRef.current) {
              if (remainingAttempts > 0) {
                  window.setTimeout(() => attemptAutoStart(remainingAttempts - 1), 250);
              }
              return;
          }
          autoStartAttemptedRef.current = true;
          void handleStart();
      };

      (window as any).AiroShellHost = {
          autoStart: () => {
              attemptAutoStart();
          }
      };

      return () => {
          disposed = true;
          delete (window as any).AiroShellHost;
      };
  }, [handleStart, hasStarted]);

  useEffect(() => {
      if (cameraTrackingEnabled) {
          void startCameraTracking();
      } else {
          stopCameraTracking();
      }
  }, [cameraTrackingEnabled, startCameraTracking, stopCameraTracking]);

  // Connection Management
  useEffect(() => {
    let cancelled = false;
    let resumeTimeout: any = null;

    if (!chatEnabled) {
        wakeWordRef.current?.stop();
        if (wakeState) {
            setWakeState(false);
        }
        setIsPreparing(false);
        if (connectionState !== AppState.IDLE) {
            void disconnect();
        }
        if (hasStarted) {
            setStatusText('Developer mode ready');
        }
        return () => {
            cancelled = true;
            if (resumeTimeout) clearTimeout(resumeTimeout);
        };
    }

    if (wakeState && connectionState === AppState.IDLE) {
        setIsPreparing(true);
        wakeWordRef.current?.stop();
        void returnToStartupHeading();

        (async () => {
            try {
                if (cancelled) return;
                await connect(0, null, {
                    mode: sessionMode,
                    initialPrompt: sessionPrompt,
                    fallbackPromptAfterSilence: wakeCarryPrompt,
                    textOnlyFirstTurn: isAndroidShell && !String(wakeCarryPrompt || '').trim()
                });
            } finally {
                if (!cancelled) {
                    setIsPreparing(false);
                    if (sessionPrompt) setSessionPrompt(null);
                    if (wakeCarryPrompt) setWakeCarryPrompt(null);
                }
            }
        })();
    } else if (!wakeState && hasStarted && !assistantMuted && !menuOpen && !isLoadingModels && connectionState === AppState.IDLE && !isSleepMode) {
        resumeTimeout = setTimeout(() => {
            if (!cancelled && !wakeState && !isPreparing && !isSleepMode) {
                wakeWordRef.current?.start();
                setStatusText("Listening for Hey Airo");
            }
        }, 250);
    }

    return () => {
        cancelled = true;
        if (resumeTimeout) clearTimeout(resumeTimeout);
    };
  }, [chatEnabled, wakeState, hasStarted, assistantMuted, menuOpen, isLoadingModels, connectionState, ollieConnected, movementAllowed, sessionMode, sessionPrompt, wakeCarryPrompt, isMobileBrowser, isSleepMode]);

  useEffect(() => {
      if (!chatEnabled || !hasStarted || assistantMuted || menuOpen || isLoadingModels || isPreparing || isSleepMode) {
          return;
      }
      if (connectionState !== AppState.IDLE || wakeState) {
          return;
      }

      const timer = window.setInterval(() => {
          const wakeWord = wakeWordRef.current;
          if (!wakeWord) return;
          if (connectionStateRef.current !== AppState.IDLE || wakeState || assistantMuted || menuOpen || isSleepMode) return;
          if (wakeWord.isListening) return;
          scheduleWakeListenerRestart(0);
      }, 5000);

      return () => {
          window.clearInterval(timer);
      };
  }, [assistantMuted, chatEnabled, connectionState, hasStarted, isLoadingModels, isPreparing, isSleepMode, menuOpen, scheduleWakeListenerRestart, wakeState]);

  useEffect(() => {
      if (!chatEnabled || !awaitingFirstTextTurn || !wakeState || connectionState !== AppState.ACTIVE) {
          stopFirstTurnListening();
          return;
      }

      setStatusText('Listening for your first question');
      const started = startFirstTurnListening();
      if (!started) {
          setAwaitingFirstTextTurn(false);
      }

      return () => {
          stopFirstTurnListening();
      };
  }, [awaitingFirstTextTurn, chatEnabled, connectionState, wakeState]);

  useEffect(() => {
      if (isProcessingTools) {
          thinkingAudio.play();
          if (!lastMainThinkingRef.current) {
              void playOst('processing', 0.4, 350);
          }
      } else {
          thinkingAudio.stop();
      }
      lastMainThinkingRef.current = isProcessingTools;
  }, [isProcessingTools, thinkingAudio]);

  useEffect(() => {
      backgroundTimerRef.current = backgroundTimer;
  }, [backgroundTimer]);

  useEffect(() => {
      if (visualContent?.type === 'predefined' && visualContent?.component === 'music') {
          setBackgroundMusic((prev: any) => ({
              ...(prev || {}),
              ...(visualContent.content || {}),
              action: visualContent?.content?.action || prev?.action || 'play',
              actionId: visualContent?.content?.actionId || prev?.actionId || Date.now(),
              isPaused: Boolean(visualContent?.content?.isPaused),
          }));
      }
  }, [visualContent]);

  useEffect(() => {
      const handleMusicEnded = () => {
          setBackgroundMusic((prev: any) => {
              if (!prev) return prev;
              const queue = Array.isArray(prev.queue) ? prev.queue : [];
              const currentIndex = Number(prev.currentIndex || 0);
              if (queue.length > 1 && currentIndex < queue.length - 1) {
                  return {
                      ...prev,
                      currentIndex: currentIndex + 1,
                      isPaused: false,
                      action: 'play',
                      actionId: Date.now(),
                  };
              }
              setVisualContent((current) => (current?.component === 'music' ? null : current));
              return null;
          });
      };
      window.addEventListener('airo-music-ended', handleMusicEnded as EventListener);
      return () => window.removeEventListener('airo-music-ended', handleMusicEnded as EventListener);
  }, [setVisualContent]);

  const handleMusicAction = useCallback((action: string, payload?: any) => {
      if (action === 'pauseMusic') {
          setBackgroundMusic((prev: any) => prev ? { ...prev, isPaused: true, action: 'pause', actionId: Date.now() } : prev);
          return;
      }
      if (action === 'resumeMusic') {
          setBackgroundMusic((prev: any) => prev ? { ...prev, isPaused: false, action: 'resume', actionId: Date.now() } : prev);
          return;
      }
      if (action === 'musicVolume') {
          setBackgroundMusic((prev: any) => {
              if (!prev) return prev;
              const nextVolume = Math.max(0, Math.min(100, Number(prev.volume || 65) + Number(payload?.delta || 0)));
              return { ...prev, volume: nextVolume, action: 'setVolume', actionId: Date.now() };
          });
          return;
      }
      if (action === 'skipMusic') {
          setBackgroundMusic((prev: any) => {
              if (!prev) return prev;
              const queue = Array.isArray(prev.queue) ? prev.queue : [];
              const nextIndex = Number(prev.currentIndex || 0) + 1;
              if (!queue.length || nextIndex >= queue.length) {
                  setVisualContent((current) => (current?.component === 'music' ? null : current));
                  return null;
              }
              const nextState = { ...prev, currentIndex: nextIndex, isPaused: false, action: 'play', actionId: Date.now() };
              setVisualContent({ type: 'predefined', component: 'music', content: nextState, title: 'MUSIC' });
              return nextState;
          });
          return;
      }
      if (action === 'dismissMusic') {
          setVisualContent(null);
          return;
      }
  }, [setVisualContent]);

  // Background timer tick
  useEffect(() => {
      if (!backgroundTimer?.running) return;

      const isTimerVisible = visualContent?.type === 'predefined' && visualContent?.component === 'timer';
      if (isTimerVisible) return;

      const interval = setInterval(() => {
          setBackgroundTimer((prev: any) => {
              if (!prev || !prev.running) return prev;
              const nextRemaining = prev.remainingSeconds - 1;
              if (nextRemaining <= 0) {
                  // Timer finished! Resurface it.
                  void playOst('alarm', 0.62, 80);
                  startTimerAlarmLoop();
                  setVisualContent({
                      type: 'predefined',
                      component: 'timer',
                      content: {
                          ...prev,
                          remainingSeconds: 0,
                          running: false,
                          alarmRinging: true,
                      }
                  });
                  return { ...prev, remainingSeconds: 0, running: false, alarmRinging: true };
              }
              return { ...prev, remainingSeconds: nextRemaining };
          });
      }, 1000);
      return () => clearInterval(interval);
  }, [backgroundTimer?.running, visualContent, startTimerAlarmLoop]);

  let eyeState = EyeState.IDLE;
  if (isSleepMode) {
      eyeState = EyeState.IDLE;
  } else if (assistantMuted) {
      eyeState = EyeState.MUTED;
  } else if (connectionState === AppState.ACTIVE) {
      if (isThinking) eyeState = EyeState.THINKING;
      else if (isAiSpeaking) eyeState = EyeState.SPEAKING;
      else eyeState = EyeState.LISTENING;
  } else if (connectionState === AppState.IDLE && wakeState && hasStarted && !menuOpen && !isPreparing && !isLoadingModels) {
      eyeState = EyeState.LISTENING;
  } else if (connectionState === AppState.CONNECTING || isPreparing || isLoadingModels) {
      eyeState = EyeState.CONNECTING;
  }
  if (isRunningSkill && !skillEyeStateOverride && !skillEyeAnimationOverride) {
      eyeState = EyeState.SPEAKING;
  }
  if (skillEyeStateOverride) {
      eyeState = skillEyeStateOverride;
  }

  useEffect(() => {
      if (!ollieConnected) return;

      const colorMap: Record<EyeState, [number, number, number]> = {
          [EyeState.IDLE]: [0, 220, 100],
          [EyeState.CONNECTING]: [150, 150, 150],
          [EyeState.LISTENING]: [0, 170, 255],
          [EyeState.THINKING]: [255, 200, 0],
          [EyeState.SPEAKING]: isRunningSkill && !skillLightOverride ? [175, 70, 255] : [40, 120, 255],
          [EyeState.MUTED]: [255, 40, 40],
      };

      const [red, green, blue] = skillLightOverride || colorMap[eyeState];
      void setRobotLights(red, green, blue);
  }, [eyeState, ollieConnected, skillLightOverride]);

  const sleepEyeAnimation = isSleepMode
      ? {
            keyframes: [
                {
                    at: 0,
                    left: { x: 35, y: 55, width: 192, height: 18, color: '#cbd5e1', roundness: 999, fillMode: 'color' as const },
                    right: { x: 65, y: 55, width: 192, height: 18, color: '#cbd5e1', roundness: 999, fillMode: 'color' as const },
                },
                {
                    at: 1,
                    left: { x: 35, y: 55, width: 192, height: 12, color: '#f8fafc', roundness: 999, fillMode: 'color' as const },
                    right: { x: 65, y: 55, width: 192, height: 12, color: '#f8fafc', roundness: 999, fillMode: 'color' as const },
                },
            ],
            durationMs: 1200,
            loop: true,
            continueRunning: true,
        }
      : null;

  useEffect(() => {
      const wasSpeaking = wasAiSpeakingRef.current;
      wasAiSpeakingRef.current = isAiSpeaking;
      if (!wasSpeaking || isAiSpeaking) return;
      if (!ollieConnected || !movementAllowed || menuOpen || assistantMuted || connectionState !== AppState.IDLE) return;

      const resumeMotion = window.setTimeout(() => {
          void orientTowardSpeakerFromSensors();
      }, 220);

      return () => {
          window.clearTimeout(resumeMotion);
      };
  }, [assistantMuted, connectionState, isAiSpeaking, menuOpen, movementAllowed, ollieConnected]);

  useEffect(() => {
      if (!hasStarted || !ollieConnected || startupCalibrationDoneRef.current) return;
      if (!ollieRef.current || isPreparing || isLoadingModels || !movementAllowed) return;
      startupCalibrationDoneRef.current = true;
      void runStartupCalibrationMotion();
  }, [hasStarted, isLoadingModels, isPreparing, movementAllowed, ollieConnected]);

  useEffect(() => {
      if (!movementAllowed) {
          void stopRobotMotion();
      }
  }, [movementAllowed]);

  const touchStartY = useRef<number>(0);

  // Auto-close timer after 7 seconds
  useEffect(() => {
      let timeout: NodeJS.Timeout;
      if (visualContent?.component === 'timer') {
          timeout = setTimeout(() => {
              setVisualContent(null);
          }, 7000);
      }
      return () => clearTimeout(timeout);
  }, [visualContent]);

  const handlePointerDown = (e: React.PointerEvent) => {
      if (menuOpen && menuPanel !== 'carousel') {
          activePointerIdRef.current = null;
          return;
      }
      activePointerIdRef.current = e.pointerId;
      try {
          e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      touchStartX.current = e.clientX;
      touchCurrentX.current = e.clientX;
      touchCurrentY.current = e.clientY;
      touchStartY.current = e.clientY;
      if (menuOpen) return;
      if (!hasStarted || isPreparing || isLoadingModels || connectionState !== AppState.IDLE) return;
      holdTimerRef.current = setTimeout(() => {
          setWakeState(true);
          setStatusText("Manual Hold Triggered");
      }, 700);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (menuOpen && menuPanel !== 'carousel') return;
      if (activePointerIdRef.current !== e.pointerId) return;
      touchCurrentX.current = e.clientX;
      touchCurrentY.current = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (menuOpen && menuPanel !== 'carousel') {
          activePointerIdRef.current = null;
          return;
      }
      if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;
      activePointerIdRef.current = null;
      try {
          e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
      }
      
      touchCurrentX.current = e.clientX;
      touchCurrentY.current = e.clientY;
      const deltaX = touchCurrentX.current - touchStartX.current;
      // Detect swipe up/down
      const touchEndY = touchCurrentY.current;
      const deltaY = touchEndY - touchStartY.current;

      if (menuOpen) {
          if (deltaY > 55 && Math.abs(deltaY) > Math.abs(deltaX)) {
              void handleMenuClose();
              return;
          }
          if (Math.abs(deltaX) > 45) {
              cycleMenu(deltaX < 0 ? 1 : -1);
          }
          return;
      }

      if ((connectionState === AppState.ACTIVE || connectionState === AppState.CONNECTING) && Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) {
          setWakeState(false);
          setStatusText('Session stopped');
          void disconnect();
          return;
      }
      
      if (deltaY < -50 && !visualContent && backgroundTimer && backgroundTimer.remainingSeconds > 0) {
          // Swipe up to reopen timer
          setVisualContent({ type: 'predefined', component: 'timer', content: backgroundTimer });
      } else if (deltaY > 50 && visualContent?.component === 'timer') {
          // Swipe down to close timer
          setVisualContent(null);
      } else if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12 && !visualContent) {
          void handleMenuOpen();
      }
  };

  if (!hasStarted) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center px-6 text-white">
        <div className="w-[min(92vw,680px)] rounded-[2.4rem] border border-white/10 bg-white/[0.04] px-8 py-10 text-center shadow-[0_0_40px_rgba(0,0,0,0.35)]">
          <div className="text-xs uppercase tracking-[0.35em] text-white/40">Airo</div>
          <div className="mt-4 text-4xl font-semibold">Your family robot</div>
          <div className="mx-auto mt-4 max-w-xl text-base leading-7 text-white/65">
            Friendly voice help, simple conversations, weather, timers, family recognition, and everyday support right from the screen in your home.
          </div>
          <div className="mt-6 text-sm text-white/45">
            Ready as Airo C.
          </div>
        </div>
        <button 
            onClick={handleStart}
            className="mt-8 rounded-full border border-white/15 bg-white/8 px-10 py-4 text-lg font-medium transition-all hover:bg-white/12"
        >
          Start Airo
        </button>
        {(isPreparing || statusText.includes('Calibrating')) && (
          <div className="mt-2 text-white text-sm font-mono tracking-[0.22em] uppercase">Calibrating...</div>
        )}
      </div>
    );
  }

  return (
    <div 
        className="relative h-screen w-screen overflow-hidden select-none bg-black"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
    >
      <div className={`transition-all duration-500 ${menuOpen || visualContent?.component === 'timer' ? 'opacity-0' : photoCaptureOverlay.active ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'}`}>
        <Eyes
          state={eyeState}
          intentX={eyeIntentX}
          intentBlink={eyeIntentBlink}
          emotion={eyeEmotion}
          customAnimation={sleepEyeAnimation || skillEyeAnimationOverride}
        />
      </div>

      <div
        className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-all duration-500 ${
          photoCaptureOverlay.active && photoCaptureOverlay.phase === 'icon' ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
        }`}
      >
        <div className="flex flex-col items-center gap-5">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <img
              src={CAMERA_ICON_URL}
              alt="Camera"
              className="h-24 w-24 object-contain drop-shadow-[0_0_24px_rgba(255,255,255,0.28)] sm:h-28 sm:w-28"
            />
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/50">
            Camera Active
          </div>
        </div>
      </div>

      <AnimatePresence>
        {recognizedProfileOverlay.visible && recognizedProfileOverlay.photoDataUrl && !menuOpen && !photoCaptureOverlay.active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.72, y: 26 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.86, y: -18, filter: 'blur(8px)' }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-cyan-300/20 blur-2xl" />
                <motion.div
                  animate={{ boxShadow: ['0 0 0 rgba(103,232,249,0.0)', '0 0 42px rgba(103,232,249,0.38)', '0 0 18px rgba(103,232,249,0.18)'] }}
                  transition={{ duration: 1.2, times: [0, 0.45, 1] }}
                  className="relative h-40 w-40 overflow-hidden rounded-full border-4 border-cyan-200/70 bg-black shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:h-48 sm:w-48"
                >
                  <img
                    src={recognizedProfileOverlay.photoDataUrl}
                    alt={recognizedProfileOverlay.name}
                    className="h-full w-full object-cover"
                  />
                </motion.div>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: 0.08, duration: 0.32 }}
                className="rounded-full border border-white/12 bg-black/40 px-5 py-2 font-mono text-xs uppercase tracking-[0.28em] text-cyan-100/85 backdrop-blur-md"
              >
                Recognized {recognizedProfileOverlay.name}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {weatherInfoOverlay.visible && weatherInfoOverlay.mediaUrl && !menuOpen && !photoCaptureOverlay.active && !recognizedProfileOverlay.visible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.74, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -16, filter: 'blur(8px)' }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-0 z-[24] flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="relative overflow-hidden rounded-[2rem] border border-cyan-100/15 bg-black/45 shadow-[0_30px_90px_rgba(0,0,0,0.48)] backdrop-blur-md">
                <div className="absolute inset-0 bg-cyan-300/10 blur-3xl" />
                <div className="relative flex items-center gap-4 px-4 py-4 sm:px-5">
                  <div className="h-28 w-28 overflow-hidden rounded-[1.4rem] border border-white/10 bg-black/35 sm:h-32 sm:w-32">
                    <img
                      src={weatherInfoOverlay.mediaUrl}
                      alt={weatherInfoOverlay.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="max-w-[12rem] text-left sm:max-w-[14rem]">
                    <div className="font-mono text-[0.65rem] uppercase tracking-[0.32em] text-cyan-100/60">
                      {weatherInfoOverlay.location || 'Local Weather'}
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                      {weatherInfoOverlay.temperatureText}
                    </div>
                    <div className="mt-1 font-mono text-[0.72rem] uppercase tracking-[0.24em] text-cyan-100/80">
                      {weatherInfoOverlay.title}
                    </div>
                    <div className="mt-2 text-sm leading-snug text-white/72">
                      {weatherInfoOverlay.detailText}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {menuOpen && (
          <div
            className="absolute inset-0 z-40 bg-black text-white"
            style={{ touchAction: menuPanel === 'carousel' ? 'none' : 'pan-y' }}
          >
              <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-4 sm:px-6">
                  <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/65">Airo Controls v{APP_VERSION}</div>
                  <button
                    onClick={() => { void handleMenuClose(); }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 font-mono text-lg text-white"
                  >
                    X
                  </button>
              </div>
              <div className="flex h-full items-center justify-center px-4 sm:px-6">
                  {menuPanel === 'carousel' && (
                      <div className="flex w-full items-center justify-center">
                          <motion.div
                            initial={{ scale: 0.92, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                            className="relative flex h-full w-full max-w-[980px] flex-col items-center justify-center pt-10 sm:pt-0"
                          >
                              <motion.div
                                initial={{ y: -14, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.08, duration: 0.22 }}
                                className="mb-8 sm:mb-16 font-sans text-3xl sm:text-4xl font-black italic tracking-tight text-white/90"
                              >
                                AIRO
                              </motion.div>
                              <div className="relative z-10 h-[190px] sm:h-[240px] w-full max-w-[920px] overflow-hidden px-2 sm:px-6">
                                  <AnimatePresence mode="wait" custom={menuSlideDirection}>
                                      <motion.div
                                        key={menuIndex}
                                        custom={menuSlideDirection}
                                        initial={{ x: menuSlideDirection > 0 ? 140 : -140, opacity: 0.35 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: menuSlideDirection > 0 ? -140 : 140, opacity: 0.35 }}
                                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute inset-0 grid grid-cols-3 items-start justify-items-center gap-3 sm:gap-10"
                                      >
                                          {[-1, 0, 1].map((offset) => {
                                              const index = (menuIndex + offset + menuItems.length) % menuItems.length;
                                              const item = menuItems[index];
                                              return (
                                                  <motion.div
                                                    key={`${item.id}-${offset}`}
                                                    initial={{ scale: 0.86, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ delay: 0.05 + (offset + 1) * 0.04, duration: 0.18 }}
                                                    className="flex w-full max-w-[190px] sm:max-w-[210px] flex-col items-center"
                                                  >
                                                      <button
                                                        onClick={() => { void openMenuItem(item, index, offset); }}
                                                        className={`flex h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 items-center justify-center rounded-full border text-center transition-transform shadow-[0_18px_36px_rgba(0,0,0,0.35)] ${offset === 0 ? 'border-white/20 scale-100' : 'border-white/10 opacity-90 scale-100'}`}
                                                        style={{ backgroundColor: item.color }}
                                                      >
                                                          <span className="text-2xl sm:text-3xl md:text-4xl">{item.emoji}</span>
                                                      </button>
                                                      <span className="mt-3 sm:mt-4 min-h-[40px] sm:min-h-[52px] max-w-[160px] sm:max-w-[180px] text-center font-sans text-xs sm:text-sm md:text-xl leading-tight text-white">{item.label}</span>
                                                  </motion.div>
                                              );
                                          })}
                                      </motion.div>
                                  </AnimatePresence>
                              </div>
                              <div className="mt-6 sm:mt-12 text-center px-2">
                                  <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Swipe Left Or Right</div>
                                  <div className="mt-2 font-mono text-xs uppercase tracking-[0.35em] text-white/35">Swipe Down To Close</div>
                                  <div className="mt-3 sm:mt-4 text-xs sm:text-sm text-white/65">
                                      {selectedMenuItem.id === 'developer' && 'Switch between developer skill testing and the wake-word chat loop'}
                                      {selectedMenuItem.id === 'mute' && 'Mute the mic and block movement'}
                                      {selectedMenuItem.id === 'motor' && 'Adjust speed or disable motors'}
                                      {selectedMenuItem.id === 'family' && 'Add family and recognize familiar faces'}
                                      {selectedMenuItem.id === 'gallery' && 'Take photos and review saved shots'}
                                      {selectedMenuItem.id === 'skill-store' && 'Browse, search, and install new skills'}
                                      {selectedMenuItem.id === 'mobile-app' && 'Pair your phone app using a one-time code from this screen'}
                                      {selectedMenuItem.kind === 'skill' && (selectedMenuItem.description || 'Run this installed skill from the menu')}
                                      {!selectedMenuItem.enabled && 'Placeholder'}
                                  </div>
                              </div>
                          </motion.div>
                      </div>
                  )}
                  {menuPanel === 'mute' && (
                      <div className="flex items-center justify-center">
                      <div className="w-full max-w-xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/20 bg-black p-5 sm:p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] max-h-[84vh] overflow-y-auto">
                          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Mute Airo</div>
                          <div className="mt-4 text-3xl font-mono text-white">{assistantMuted ? 'Muted' : 'Live'}</div>
                          <p className="mt-4 text-sm leading-relaxed text-white/70">
                              Muting stops the mic listener, forces the eyes red, and disables all robot movement until you unmute Airo.
                          </p>
                          <div className="mt-6 flex justify-center gap-3 flex-wrap">
                              <button
                                onClick={() => { void handleToggleMute(); }}
                                className={`rounded-full px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] ${assistantMuted ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}
                              >
                                {assistantMuted ? 'Unmute Airo' : 'Mute Airo'}
                              </button>
                              <button
                                onClick={() => setMenuPanel('carousel')}
                                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-gray-300"
                              >
                                Back
                              </button>
                          </div>
                      </div>
                      </div>
                  )}
                  {menuPanel === 'developer' && (
                      <div className="flex items-center justify-center">
                      <div className="w-full max-w-4xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/20 bg-black p-5 sm:p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] max-h-[84vh] overflow-y-auto">
                          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Developer Mode</div>
                          <div className="mt-4 text-3xl font-mono text-white">{developerMode ? 'Skill Tester Active' : 'Chat Mode Active'}</div>
                          <p className="mt-4 text-sm leading-relaxed text-white/70">
                              Developer mode pauses wake-word and chat logic so you can run installed skills over and over, tweak them, and test the robot runtime directly. Disable it to return to voice mode, where Groq intent routing handles commands and skills.
                          </p>
                          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-left">
                              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/55">Demo Mode</div>
                              <p className="mt-2 text-xs text-white/60">
                                  Trigger the built-in backend demo directly from the debug page.
                              </p>
                              <button
                                onClick={() => { void triggerBackendDemoMode(); }}
                                className="mt-4 rounded-full bg-fuchsia-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black"
                              >
                                Demo Mode
                              </button>
                          </div>
                          <div className="mt-6 flex justify-center gap-3 flex-wrap">
                              <button
                                onClick={() => { void handleToggleDeveloperMode(); }}
                                className={`rounded-full px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] ${developerMode ? 'bg-cyan-400 text-black' : 'bg-emerald-400 text-black'}`}
                              >
                                {developerMode ? 'Disable Developer Mode' : 'Enable Developer Mode'}
                              </button>
                              <button
                                onClick={() => setMicrobitDemoMode((value) => !value)}
                                className={`rounded-full px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] ${microbitDemoMode ? 'bg-amber-300 text-black' : 'bg-white/10 text-white'}`}
                              >
                                {microbitDemoMode ? 'Micro:bit Demo On' : 'Micro:bit Demo Off'}
                              </button>
                              {lastDeveloperSkillToolName && (
                                  <button
                                    onClick={() => { void runDeveloperSkill(lastDeveloperSkillToolName); }}
                                    className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-white"
                                  >
                                    Run Last Skill Again
                                  </button>
                              )}
                              <button
                                onClick={() => setMenuPanel('carousel')}
                                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-gray-300"
                              >
                                Back
                              </button>
                          </div>
                          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-left">
                              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/55">Intent Output Contract</div>
                              <p className="mt-2 text-xs text-white/60">
                                  This text is appended to the intent model prompts. Use it to force a specific JSON output contract.
                              </p>
                              <textarea
                                value={intentOutputContract}
                                onChange={(event) => setIntentOutputContract(event.target.value)}
                                placeholder='Example: Always output {"tool":"run_skill","args":{"skill":"...","input":{"topic":"..."}}}'
                                className="mt-3 h-28 w-full rounded-2xl border border-white/15 bg-black/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-300/60"
                              />
                          </div>
                          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-left">
                              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/55">Micro:bit Demo</div>
                              <p className="mt-2 text-xs text-white/60">
                                  Button A starts demo mode, button B stops it. Flash the MakeCode snippet from the docs, then use this toggle while testing.
                              </p>
                          </div>
                          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-left">
                              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/55">Live Vision Feed</div>
                              <p className="mt-2 text-xs text-white/60">
                                  Shows what Airo sees right now, what target OpenCV is tracking, and who Airo thinks is in front of him.
                              </p>
                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                  {([
                                      {
                                          key: 'front',
                                          label: 'Front Camera',
                                          image: developerVisionPreview.front,
                                          target: visionTarget,
                                      },
                                      {
                                          key: 'rear',
                                          label: 'Rear Camera',
                                          image: developerVisionPreview.rear,
                                          target: rearTarget,
                                      },
                                  ] as const).map((camera) => (
                                      <div key={camera.key} className="rounded-[1.6rem] border border-white/10 bg-black/40 p-3">
                                          <div className="flex items-center justify-between gap-3">
                                              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">{camera.label}</div>
                                              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">
                                                  {camera.target ? `${camera.target.kind} tracked` : 'No target'}
                                              </div>
                                          </div>
                                          <div className="mt-3 aspect-video overflow-hidden rounded-[1.2rem] border border-white/10 bg-black">
                                              {camera.image ? (
                                                  <img src={camera.image} alt={camera.label} className="h-full w-full object-cover" />
                                              ) : (
                                                  <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">
                                                      {cameraState === 'active' ? 'Waiting for frames' : 'Camera inactive'}
                                                  </div>
                                              )}
                                          </div>
                                          <div className="mt-3 grid gap-1 text-[11px] text-white/60">
                                              <div>State: {cameraState} / {cameraMode} / {opencvState}</div>
                                              <div>Target: {camera.target ? `${camera.target.kind} on ${camera.target.source}` : 'none'}</div>
                                              <div>Offset: {camera.target ? `${camera.target.x.toFixed(2)}, ${camera.target.y.toFixed(2)}` : 'n/a'}</div>
                                              <div>Motion strength: {camera.target ? camera.target.strength.toFixed(2) : 'n/a'}</div>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                              <div className="mt-4 rounded-[1.4rem] border border-fuchsia-300/15 bg-fuchsia-300/5 p-3">
                                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-fuchsia-100/70">Recognized Person</div>
                                  <div className="mt-2 text-sm text-white">
                                      {recognizedFamilyMember?.name || 'No recognized family member'}
                                  </div>
                                  <div className="mt-1 text-xs text-white/55">
                                      {recognizedFamilyMember?.notes || 'No saved notes yet'}
                                  </div>
                                  <div className="mt-2 text-[11px] text-white/45">
                                      {recognizedFamilyMember?.lastSeenAt
                                          ? `Last seen ${new Date(recognizedFamilyMember.lastSeenAt).toLocaleTimeString()}`
                                          : 'Waiting for a front-face match'}
                                  </div>
                              </div>
                          </div>
                          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              {installedSkills.map((skill) => (
                                  <div
                                    key={skill.id}
                                    className="rounded-[1.8rem] border border-white/10 bg-white/5 p-5 text-left shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
                                  >
                                      <div className="flex items-center gap-3">
                                          <div
                                            className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                                            style={{ backgroundColor: skill.color || '#334155' }}
                                          >
                                              {skill.emoji || '🧩'}
                                          </div>
                                          <div>
                                              <div className="text-lg font-semibold text-white">{skill.name}</div>
                                              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">{skill.trigger}</div>
                                          </div>
                                      </div>
                                      <div className="mt-3 text-sm leading-relaxed text-white/65">{skill.description}</div>
                                      <div className="mt-4 flex gap-3">
                                          <button
                                            onClick={() => { void runDeveloperSkill(skill.toolName); }}
                                            className="rounded-full bg-cyan-400 px-5 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black"
                                          >
                                            Run Skill
                                          </button>
                                      </div>
                                  </div>
                              ))}
                              {!installedSkills.length && (
                                  <div className="col-span-full rounded-[2rem] border border-dashed border-white/10 p-6 text-sm text-white/45">
                                      No installed skills yet. Add some from the skill store or builder first.
                                  </div>
                              )}
                          </div>
                      </div>
                      </div>
                  )}
                  {menuPanel === 'family' && (
                      <div className="flex items-center justify-center">
                      <div className="w-full max-w-2xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/20 bg-black p-5 sm:p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] max-h-[84vh] overflow-y-auto">
                          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Family</div>
                          <div className="mt-4 text-3xl font-mono text-white">{familyMembers.length} Saved</div>
                          <p className="mt-4 text-sm leading-relaxed text-white/70">
                              Add family members so Airo can recognize them, greet them by name, remember birthdays, and keep a little context about who is in the family.
                          </p>
                          <div className="mt-6 flex flex-wrap justify-center gap-3">
                              <button
                                onClick={() => { void handleStartFamilyOnboarding(); }}
                                disabled={familyIntroFlow.active}
                                className="rounded-full bg-amber-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black"
                              >
                                {familyIntroFlow.active ? 'Introduction Running' : 'Start Introductions'}
                              </button>
                              <button
                                onClick={() => exportFamilyBackup()}
                                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-white"
                              >
                                Export Family
                              </button>
                              <button
                                onClick={() => familyImportInputRef.current?.click()}
                                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-white"
                              >
                                Import Family
                              </button>
                              <input
                                ref={familyImportInputRef}
                                type="file"
                                accept="application/json"
                                onChange={handleFamilyImportSelection}
                                className="hidden"
                              />
                          </div>
                          <div className="mt-6 rounded-[1.8rem] border border-amber-300/20 bg-amber-300/5 p-4 text-left">
                              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-100/70">Guided Introduction</div>
                              <p className="mt-2 text-xs leading-relaxed text-white/70">
                                  Airo now leads the setup out loud: name first, then left, right, and center photos, then birthday and notes. Keep the face centered and well lit.
                              </p>
                              <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/25 px-4 py-3">
                                  <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/45">Airo Status</div>
                                  <div className="mt-2 text-sm text-white/80">
                                      {familyIntroFlow.status || (
                                          nextFamilyCaptureStep
                                              ? `Capture the ${nextFamilyCaptureStep.label.toLowerCase()} photo next.`
                                              : 'All three photos are captured. Save the family profile.'
                                      )}
                                  </div>
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                  <input
                                    value={familyEnrollmentDraft.name}
                                    onChange={(event) => setFamilyEnrollmentDraft((prev) => ({ ...prev, name: event.target.value }))}
                                    placeholder="Family member name"
                                    className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/60"
                                  />
                                  <input
                                    value={familyEnrollmentDraft.birthday}
                                    onChange={(event) => setFamilyEnrollmentDraft((prev) => ({ ...prev, birthday: event.target.value }))}
                                    placeholder="Birthday, like March 14"
                                    className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/60"
                                  />
                                  <input
                                    value={familyEnrollmentDraft.notes}
                                    onChange={(event) => setFamilyEnrollmentDraft((prev) => ({ ...prev, notes: event.target.value }))}
                                    placeholder="Notes, like Dad or Alex"
                                    className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/60"
                                  />
                              </div>
                              <div className="mt-4 grid grid-cols-3 gap-3">
                                  {([
                                      ['left', 'Left'],
                                      ['center', 'Front'],
                                      ['right', 'Right'],
                                  ] as const).map(([angleKey, label]) => (
                                      <div key={angleKey} className="rounded-[1.4rem] border border-white/10 bg-black/30 p-3">
                                          <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/50">{label}</div>
                                          <div className="mt-3 aspect-square overflow-hidden rounded-[1.1rem] border border-white/10 bg-white/5">
                                              {familyEnrollmentDraft.photos[angleKey] ? (
                                                  <img src={familyEnrollmentDraft.photos[angleKey] || ''} alt={`${label} face`} className="h-full w-full object-cover" />
                                              ) : (
                                                  <div className="flex h-full items-center justify-center text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">
                                                      No photo
                                                  </div>
                                              )}
                                          </div>
                                          <button
                                            onClick={() => { void captureGuidedFamilyPhoto(angleKey); }}
                                            className={`mt-3 w-full rounded-full border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] ${
                                                nextFamilyCaptureStep?.key === angleKey
                                                    ? 'border-amber-300/50 bg-amber-300/15 text-amber-100'
                                                    : 'border-white/15 bg-white/8 text-white'
                                            }`}
                                          >
                                            {familyEnrollmentDraft.photos[angleKey] ? `${label} Done` : `Capture ${label}`}
                                          </button>
                                      </div>
                                  ))}
                              </div>
                              <div className="mt-4 flex flex-wrap justify-center gap-3">
                                  {nextFamilyCaptureStep && (
                                      <button
                                        onClick={() => { void captureGuidedFamilyPhoto(nextFamilyCaptureStep.key); }}
                                        className="rounded-full bg-amber-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black"
                                      >
                                        Capture Next Photo
                                      </button>
                                  )}
                                  <button
                                    onClick={() => {
                                        void saveFamilyMember({
                                            name: familyEnrollmentDraft.name,
                                            birthday: familyEnrollmentDraft.birthday,
                                            notes: familyEnrollmentDraft.notes,
                                        }).catch((error) => {
                                            const message = error instanceof Error ? error.message : String(error);
                                            setStatusText(message);
                                        });
                                    }}
                                    disabled={
                                        !familyEnrollmentDraft.name.trim() ||
                                        !allFamilyCaptureStepsComplete
                                    }
                                    className="rounded-full bg-amber-400 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                                  >
                                    Save 3-Photo Profile
                                  </button>
                                  <button
                                    onClick={() => {
                                        setFamilyEnrollmentDraft({
                                            name: '',
                                            birthday: '',
                                            notes: '',
                                            photos: { left: null, center: null, right: null },
                                        });
                                        pendingFamilyPhotoRef.current = null;
                                        pendingFamilyPhotosRef.current = { left: null, center: null, right: null };
                                        setFamilyIntroFlow({
                                            active: false,
                                            step: 'idle',
                                            name: '',
                                            birthday: '',
                                            notes: '',
                                            status: 'Ready to introduce a family member',
                                        });
                                        setFamilyCaptureDebug({
                                            source: 'unknown',
                                            status: 'Waiting for capture',
                                            preview: null,
                                        });
                                    }}
                                    className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-white"
                                  >
                                    Reset
                                  </button>
                              </div>
                          </div>
                          <div className="mt-6 sm:mt-8 grid grid-cols-3 gap-3 sm:gap-4">
                              {familyMembers.map((member) => (
                                  <div key={member.id} className="flex flex-col items-center gap-2 sm:gap-3 rounded-[1.6rem] sm:rounded-[2rem] border border-white/10 bg-white/5 p-3 sm:p-4">
                                      <img src={member.photoDataUrl} alt={member.name} className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover border border-white/15" />
                                      <div className="text-xs sm:text-sm font-mono text-white text-center">{member.name}</div>
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45 text-center">
                                          {member.notes ? member.notes : 'No special notes'}
                                      </div>
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45 text-center">
                                          {member.birthday ? `Birthday ${member.birthday}` : 'Birthday not saved'}
                                      </div>
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/60 text-center">
                                          {Array.isArray(member.photoDataUrls) && member.photoDataUrls.length ? `${member.photoDataUrls.length} face photos` : '1 face photo'}
                                      </div>
                                  </div>
                              ))}
                              {!familyMembers.length && (
                                  <div className="col-span-full rounded-[2rem] border border-dashed border-white/10 p-6 text-sm text-white/45">
                                      No family members saved yet.
                                  </div>
                              )}
                          </div>
                          <div className="mt-6 flex justify-center">
                              <button
                                onClick={() => setMenuPanel('carousel')}
                                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-gray-300"
                              >
                                Back
                              </button>
                          </div>
                      </div>
                      </div>
                  )}
                  {menuPanel === 'skill-store' && (
                      <div className="flex items-center justify-center">
                      <div className="w-full max-w-5xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/20 bg-black p-5 sm:p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] max-h-[84vh] overflow-y-auto">
                          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Skill Store</div>
                          <div className="mt-4 text-3xl font-mono text-white">{installedSkills.length} Installed</div>
                          <p className="mt-4 text-sm leading-relaxed text-white/70">
                              Browse swipeable skill cards, search the catalog, and add skills to your robot. Builder-made skills appear here automatically on this device.
                          </p>
                          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                              <input
                                value={skillSearch}
                                onChange={(event) => setSkillSearch(event.target.value)}
                                placeholder="Search skills"
                                className="w-full rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-sm text-white outline-none placeholder:text-white/30"
                              />
                              <button
                                onClick={() => { void refreshSkillCatalog(); }}
                                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-sm uppercase tracking-[0.18em] text-white"
                              >
                                Refresh
                              </button>
                              <button
                                onClick={() => setMenuPanel('carousel')}
                                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 font-mono text-sm uppercase tracking-[0.18em] text-gray-300"
                              >
                                Back
                              </button>
                          </div>
                          <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-3">
                              {filteredSkillCatalog.map((skill) => {
                                  const installed = installedSkillIds.includes(skill.id);
                                  return (
                                      <div
                                        key={skill.id}
                                        className="min-w-[270px] max-w-[320px] flex-shrink-0 snap-center rounded-[2rem] border border-white/10 bg-white/5 p-5 text-left shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
                                      >
                                          <div className="flex items-start justify-between gap-3">
                                              <div
                                                className="flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-[0_12px_24px_rgba(0,0,0,0.28)]"
                                                style={{ backgroundColor: skill.color || '#334155' }}
                                              >
                                                  {skill.emoji || '🧩'}
                                              </div>
                                              <div className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] ${installed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/45'}`}>
                                                  {installed ? 'Installed' : skill.source || 'Store'}
                                              </div>
                                          </div>
                                          <div className="mt-4 text-xl font-semibold text-white">{skill.name}</div>
                                          <div className="mt-2 text-sm leading-relaxed text-white/65">{skill.description}</div>
                                          <div className="mt-4 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.24em] text-white/35">
                                              <span>{skill.trigger}</span>
                                              <span>{skill.author || 'Unknown'}</span>
                                          </div>
                                          <div className="mt-5 flex gap-3">
                                              <button
                                                onClick={() => toggleSkillInstall(skill.id)}
                                                className={`rounded-full px-5 py-3 font-mono text-sm uppercase tracking-[0.18em] ${installed ? 'bg-red-500 text-white' : 'bg-emerald-400 text-black'}`}
                                              >
                                                {installed ? 'Remove' : 'Add To Robot'}
                                              </button>
                                          </div>
                                      </div>
                                  );
                              })}
                              {!filteredSkillCatalog.length && (
                                  <div className="w-full rounded-[2rem] border border-dashed border-white/10 p-8 text-sm text-white/45">
                                      No skills matched that search.
                                  </div>
                              )}
                          </div>
                          <div className="mt-4 text-xs text-white/40">
                              Edit <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">data/skill-store.json</code> and tap Refresh. The store is served live without a rebuild.
                          </div>
                      </div>
                      </div>
                  )}
                  {menuPanel === 'mobile-app' && (
                      <div className="flex items-center justify-center">
                      <div className="w-full max-w-2xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/20 bg-black p-5 sm:p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] max-h-[84vh] overflow-y-auto">
                          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Mobile App Pairing</div>
                          <div className="mt-4 text-3xl font-mono text-white">{pairingCode || '------'}</div>
                          <p className="mt-4 text-sm leading-relaxed text-white/70">
                              On your phone, open the Airo Mobile App and enter this code to pair.
                              If you need a fresh code, reset local settings for this robot.
                          </p>
                          <div className="mt-5 rounded-3xl border border-cyan-300/25 bg-cyan-500/10 p-4 text-left text-sm text-cyan-100">
                              <div className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-200/80">Setup Steps</div>
                              <ol className="mt-3 space-y-2 list-decimal list-inside text-cyan-100/90">
                                  <li>Install/open Airo Mobile on your phone.</li>
                                  <li>Tap Pair Airo and type this 6-character code.</li>
                                  <li>After pairing, use tabs to change settings, install skills, and send movement commands.</li>
                              </ol>
                          </div>
                          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/65 break-all">
                              Mobile URL: <a className="text-cyan-300 underline" href={mobileAppUrl}>{mobileAppUrl}</a>
                          </div>
                          <div className="mt-6 flex justify-center">
                              <button
                                onClick={() => setMenuPanel('carousel')}
                                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-gray-300"
                              >
                                Back
                              </button>
                          </div>
                      </div>
                      </div>
                  )}
                  {menuPanel === 'gallery' && (
                      <div className="flex items-center justify-center">
                      <div className="w-full max-w-3xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/20 bg-black p-5 sm:p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] max-h-[84vh] overflow-y-auto">
                          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Gallery</div>
                          <div className="mt-4 text-3xl font-mono text-white">{galleryPhotos.length} Photos</div>
                          <p className="mt-4 text-sm leading-relaxed text-white/70">
                              Airo can take photos for you with a 3 second countdown, then save them here in the gallery.
                          </p>
                          <div className="mt-6 flex justify-center gap-3 flex-wrap">
                              <button
                                onClick={() => { void takePhotoForGallery(); }}
                                className="rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.22),transparent_38%),linear-gradient(to_bottom,#8b7bff,#5b34d6)] px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-white shadow-[0_20px_40px_rgba(91,52,214,0.28)]"
                              >
                                Take Photo
                              </button>
                              <button
                                onClick={() => setMenuPanel('carousel')}
                                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-gray-300"
                              >
                                Back
                              </button>
                          </div>
                          <div className="mt-6 sm:mt-8 grid grid-cols-3 gap-3 sm:gap-4">
                              {galleryPhotos.map((photo) => (
                                  <button
                                    key={photo.id}
                                    onClick={() => {
                                        if (galleryPhotoLongPressTriggeredRef.current) {
                                            galleryPhotoLongPressTriggeredRef.current = false;
                                            return;
                                        }
                                        setVisualContent({ type: 'image', content: photo.photoDataUrl, title: 'Gallery Photo' });
                                    }}
                                    onMouseDown={() => startGalleryPhotoLongPress(photo)}
                                    onMouseUp={cancelGalleryPhotoLongPress}
                                    onMouseLeave={cancelGalleryPhotoLongPress}
                                    onTouchStart={() => startGalleryPhotoLongPress(photo)}
                                    onTouchEnd={cancelGalleryPhotoLongPress}
                                    onTouchCancel={cancelGalleryPhotoLongPress}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        galleryPhotoLongPressTriggeredRef.current = true;
                                        setGalleryPhotoActionMenu({
                                            visible: true,
                                            photoId: photo.id,
                                            photoDataUrl: photo.photoDataUrl,
                                        });
                                    }}
                                    className="overflow-hidden rounded-[1.25rem] sm:rounded-[1.6rem] border border-white/10 bg-white/5 text-left shadow-[0_18px_32px_rgba(0,0,0,0.3)]"
                                  >
                                      <img src={photo.photoDataUrl} alt="Gallery photo" className="h-24 sm:h-32 w-full object-cover" />
                                      <div className="px-2 py-2 sm:px-3">
                                          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">{photo.source} camera</div>
                                          <div className="mt-1 text-xs text-white/70">{new Date(photo.takenAt).toLocaleString()}</div>
                                      </div>
                                  </button>
                              ))}
                              {!galleryPhotos.length && (
                                  <div className="col-span-full rounded-[2rem] border border-dashed border-white/10 p-6 text-sm text-white/45">
                                      No photos saved yet.
                                  </div>
                              )}
                          </div>
                      </div>
                      </div>
                  )}
                  {menuPanel === 'motor' && (
                      <div className="flex items-center justify-center">
                      <div className="w-full max-w-xl rounded-[2rem] sm:rounded-[2.5rem] border border-white/20 bg-black p-5 sm:p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] max-h-[84vh] overflow-y-auto">
                          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/55">Motor Preferences</div>
                          <div className="mt-4 text-3xl font-mono text-white">{Math.round(motorSpeedScale * 100)}%</div>
                          <p className="mt-4 text-sm leading-relaxed text-white/70">
                              Set the motor speed scale or disable movement entirely. This affects subtle chat movement, follow motion, and AI movement actions.
                          </p>
                          <input
                            type="range"
                            min="0.2"
                            max="1"
                            step="0.05"
                            value={motorSpeedScale}
                            onChange={(e) => setMotorSpeedScale(Number(e.target.value))}
                            className="mt-6 w-full accent-gray-300"
                          />
                          <div className="mt-6 rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4 text-left">
                              <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/45">Boost Multiplier</div>
                              <div className="mt-2 text-2xl font-mono text-white">{motorBoostMultiplier}x</div>
                              <p className="mt-2 text-xs leading-relaxed text-white/55">
                                  Extra motor boost stacked on top of the speed slider. Higher levels push harder and are clamped to the motor limit.
                              </p>
                              <div className="mt-4 grid grid-cols-5 gap-2">
                                  {[1, 2, 3, 4, 5].map((boost) => (
                                      <button
                                        key={boost}
                                        onClick={() => setMotorBoostMultiplier(boost)}
                                        className={`rounded-full px-3 py-3 font-mono text-sm uppercase tracking-[0.18em] ${
                                            motorBoostMultiplier === boost
                                                ? 'bg-amber-400 text-black'
                                                : 'border border-white/15 bg-white/5 text-gray-300'
                                        }`}
                                      >
                                          {boost}x
                                      </button>
                                  ))}
                              </div>
                          </div>
                          <div className="mt-5">
                              <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/45">Active Motor</div>
                              <div className="mt-3 flex items-center justify-center gap-3">
                                  <button
                                    onClick={() => setMotorSide('left')}
                                    className={`rounded-full px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] ${motorSide === 'left' ? 'bg-blue-500 text-white' : 'border border-white/15 bg-white/5 text-gray-300'}`}
                                  >
                                    Left Motor
                                  </button>
                                  <button
                                    onClick={() => setMotorSide('right')}
                                    className={`rounded-full px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] ${motorSide === 'right' ? 'bg-blue-500 text-white' : 'border border-white/15 bg-white/5 text-gray-300'}`}
                                  >
                                    Right Motor
                                  </button>
                              </div>
                          </div>
                          <div className="mt-5 flex items-center justify-center gap-3">
                              <button
                                onClick={() => setMovementEnabled((prev) => !prev)}
                                className={`rounded-full px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] ${movementEnabled ? 'bg-gray-200 text-black' : 'bg-red-500 text-white'}`}
                              >
                                {movementEnabled ? 'Disable Movement' : 'Enable Movement'}
                              </button>
                              <button
                                onClick={() => setMenuPanel('carousel')}
                                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-gray-300"
                              >
                                Back
                              </button>
                          </div>
                      </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      <AnimatePresence>
        {galleryPhotoActionMenu.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[58] flex items-center justify-center bg-black/75 backdrop-blur-md"
            onClick={closeGalleryPhotoActionMenu}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 10 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-6"
              onClick={(event) => event.stopPropagation()}
            >
              {galleryPhotoActionMenu.photoDataUrl && (
                <div className="h-40 w-40 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                  <img
                    src={galleryPhotoActionMenu.photoDataUrl}
                    alt="Selected gallery photo"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="flex items-center gap-5">
                <button
                  onClick={() => deleteGalleryPhoto(galleryPhotoActionMenu.photoId)}
                  className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-red-300/20 bg-red-500/85 text-white shadow-[0_24px_60px_rgba(239,68,68,0.35)]"
                >
                  <span className="text-2xl">🗑️</span>
                  <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em]">Delete</span>
                </button>
                <button
                  onClick={closeGalleryPhotoActionMenu}
                  className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-[0_24px_60px_rgba(255,255,255,0.08)]"
                >
                  <span className="text-2xl">↩</span>
                  <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em]">Back</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {backgroundTimer && backgroundTimer.remainingSeconds > 0 && visualContent?.component !== 'timer' && (
          <div 
              className="absolute top-6 right-6 bg-gray-900/80 backdrop-blur border border-white/10 rounded-full px-4 py-2 text-white font-mono text-sm cursor-pointer hover:bg-gray-800 transition-colors z-50 flex items-center gap-3 shadow-lg"
              onClick={() => setVisualContent({ type: 'predefined', component: 'timer', content: backgroundTimer })}
          >
              <div className={`w-2 h-2 rounded-full ${backgroundTimer.running ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
              {Math.floor(backgroundTimer.remainingSeconds / 60)}:{(backgroundTimer.remainingSeconds % 60).toString().padStart(2, '0')}
          </div>
      )}

      {backgroundMusic?.queue?.length && visualContent?.component !== 'music' && (
          <div
              className="absolute top-20 right-6 z-50 flex cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-gray-900/85 px-4 py-2 text-white shadow-lg backdrop-blur transition-colors hover:bg-gray-800"
              onClick={() => setVisualContent({ type: 'predefined', component: 'music', content: backgroundMusic, title: 'MUSIC' })}
          >
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${backgroundMusic.isPaused ? 'bg-white/10' : 'bg-cyan-400/20'}`}>
                  <span className="text-sm">{backgroundMusic.isPaused ? '♪' : '▶'}</span>
              </div>
              <div className="max-w-[10rem] overflow-hidden">
                  <div className="truncate text-xs font-mono uppercase tracking-[0.18em] text-white/45">Music</div>
                  <div className="truncate text-sm text-white/85">
                      {String(backgroundMusic?.queue?.[backgroundMusic?.currentIndex || 0]?.title || backgroundMusic?.title || 'Now playing')}
                  </div>
              </div>
          </div>
      )}

      <AnimatePresence>
        {visualContent && (
          <VisualDisplay 
            data={visualContent} 
            onDismiss={() => {
                if (visualContent?.component === 'music') {
                    setVisualContent(null);
                    return;
                }
                setVisualContent(null);
            }} 
            onSyncTimer={(timerData) => setBackgroundTimer(timerData)}
            onStopTimer={() => stopCurrentTimer('Timer stopped from screen')}
            onConfirmationAnswer={handleConfirmationAnswer}
            onMusicAction={handleMusicAction}
          />
        )}
      </AnimatePresence>

      {backgroundMusic?.queue?.length ? <PersistentMusicController data={backgroundMusic} /> : null}

      {sessionMode === 'family-onboarding' && (
          <div className="absolute left-4 top-20 z-20 w-[220px] rounded-[1.6rem] border border-white/15 bg-black/75 p-3 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45">Family Introduction</div>
              <div className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-white/70">
                  Camera {familyCaptureDebug.source}
              </div>
              <div className="mt-2 text-xs leading-relaxed text-white/55">
                  {familyIntroFlow.status || familyCaptureDebug.status}
              </div>
              <div className="mt-3 overflow-hidden rounded-[1.2rem] border border-white/10 bg-white/5">
                  {familyCaptureDebug.preview ? (
                      <img src={familyCaptureDebug.preview} alt="Family capture preview" className="h-36 w-full object-cover" />
                  ) : (
                      <div className="flex h-36 items-center justify-center text-[10px] font-mono uppercase tracking-[0.18em] text-white/25">
                          No Preview Yet
                      </div>
                  )}
              </div>
          </div>
      )}

      {photoCaptureOverlay.active && (
          <div className="absolute inset-0 z-30 overflow-hidden bg-black text-white">
              <div className="absolute inset-0">
                  {photoCaptureOverlay.preview ? (
                      <img
                          src={photoCaptureOverlay.preview}
                          alt="Photo preview"
                          className={`h-full w-full object-cover transition-all duration-500 ${
                              photoCaptureOverlay.phase === 'captured' ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-95'
                          }`}
                      />
                  ) : (
                      <div className="flex h-full w-full items-center justify-center bg-black">
                          <img
                              src={CAMERA_ICON_URL}
                              alt="Camera active"
                              className={`object-contain drop-shadow-[0_0_26px_rgba(255,255,255,0.3)] transition-all duration-500 ${
                                  photoCaptureOverlay.phase === 'icon'
                                      ? 'h-28 w-28 scale-100 opacity-90'
                                      : 'h-20 w-20 scale-75 opacity-0'
                              }`}
                          />
                      </div>
                  )}
                  <div className="absolute inset-0 bg-black/18" />
                  <div
                      className={`absolute inset-0 bg-white transition-opacity duration-200 ${
                          photoCaptureOverlay.flash ? 'opacity-100' : 'opacity-0'
                      }`}
                  />
              </div>

              {photoCaptureOverlay.phase === 'live' && photoCaptureOverlay.countdown > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                      <div className="font-black text-white text-[10rem] leading-none drop-shadow-[0_0_40px_rgba(0,0,0,0.65)] sm:text-[12rem]">
                          {photoCaptureOverlay.countdown}
                      </div>
                  </div>
              )}

              {photoCaptureOverlay.phase === 'icon' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-5">
                          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
                              <img
                                  src={CAMERA_ICON_URL}
                                  alt="Camera"
                                  className="h-24 w-24 object-contain drop-shadow-[0_0_24px_rgba(255,255,255,0.28)] sm:h-28 sm:w-28"
                              />
                          </div>
                          <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/50">
                              Camera Active
                          </div>
                      </div>
                  </div>
              )}

              <div className="absolute inset-x-0 bottom-0 px-6 pb-8 pt-20">
                  <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-black/30 px-6 py-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
                      <div className="font-mono text-xs uppercase tracking-[0.25em] text-white/45">
                          {photoCaptureOverlay.source} camera
                      </div>
                      <div className="mt-2 text-base text-white/80">{photoCaptureOverlay.status}</div>
                  </div>
              </div>
          </div>
      )}
      
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center pointer-events-none gap-3 z-10">
          <span className={`inline-block w-2.5 h-2.5 rounded-full transition-all duration-700 ${
              connectionState === AppState.ACTIVE ? 'bg-green-500 shadow-[0_0_15px_#22c55e]' : 
              connectionState === AppState.CONNECTING || isPreparing || isLoadingModels ? 'bg-yellow-500 animate-pulse' : 
              connectionState === AppState.ERROR ? 'bg-red-500' : 'bg-white/5'
          }`}></span>
      </div>
    </div>
  );
}
