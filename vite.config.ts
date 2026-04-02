import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const certFile = path.resolve(__dirname, 'certs/dev-cert.pem');
    const keyFile = path.resolve(__dirname, 'certs/dev-key.pem');
    const https =
      fs.existsSync(certFile) && fs.existsSync(keyFile)
        ? {
            cert: fs.readFileSync(certFile),
            key: fs.readFileSync(keyFile),
          }
        : undefined;
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        https,
        strictPort: true,
        hmr: false,
      },
      build: {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            mobile: path.resolve(__dirname, 'mobile.html'),
            skills: path.resolve(__dirname, 'skills.html'),
            backend: path.resolve(__dirname, 'backend.html'),
            sphero: path.resolve(__dirname, 'sphero.html'),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
