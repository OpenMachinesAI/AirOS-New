import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.airo.kiosk',
  appName: 'AiroKiosk',
  webDir: 'dist',
  server: {
    url: 'https://airo-voice-assistant-1067129780637.us-west1.run.app/',
    cleartext: true,
    errorPath: 'offline.html'
  }
};

export default config;
