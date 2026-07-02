import React from 'react';
import './utils/logger';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { Simulator } from './components/Simulator';
import Ide from './components/Ide';
import { DebugData } from './components/DebugData';
import { KioskWrapper } from './components/KioskWrapper';
import { Capacitor } from '@capacitor/core';

const isSimulator = new URLSearchParams(window.location.search).has('simulator');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

if (Capacitor.isNativePlatform()) {
  root.render(
    <React.StrictMode>
      <KioskWrapper />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      {isSimulator ? (
        <Simulator />
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/ide" element={<Ide />} />
            <Route path="/debugdata" element={<DebugData />} />
          </Routes>
        </BrowserRouter>
      )}
    </React.StrictMode>
  );
}
