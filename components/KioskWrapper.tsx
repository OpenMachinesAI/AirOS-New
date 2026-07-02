import React, { useState, useEffect } from "react";
import { WifiOff, Lock } from "lucide-react";

export function KioskWrapper() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiSsid, setWifiSsid] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    setIsOnline(navigator.onLine);

    // Listen for messages from the iframe to control native features
    const handleIframeMessage = async (event: MessageEvent) => {
      // In production, you'd want to check event.origin
      if (event.data && event.data.type === "AIRO_KIOSK_COMMAND") {
        const { command, payload } = event.data;
        // @ts-ignore
        if (window.Capacitor && window.Capacitor.Plugins.AiroKiosk) {
          try {
            // @ts-ignore
            const plugin = window.Capacitor.Plugins.AiroKiosk;
            if (command === "setWifi") {
              await plugin.connectWifi({
                ssid: payload.ssid,
                password: payload.password,
              });
            } else if (command === "setVolume") {
              await plugin.setVolume({ level: payload.level });
            } else if (command === "setBluetooth") {
              await plugin.setBluetooth({ enabled: payload.enabled });
            }
          } catch (e) {
            console.error("Kiosk Command Failed", e);
          }
        }
      }
    };
    window.addEventListener("message", handleIframeMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("message", handleIframeMessage);
    };
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    try {
      // @ts-ignore
      if (window.Capacitor && window.Capacitor.Plugins.AiroKiosk) {
        // @ts-ignore
        await window.Capacitor.Plugins.AiroKiosk.connectWifi({
          ssid: wifiSsid,
          password: wifiPassword,
        });
        // After native connects, it will trigger online event
      } else {
        alert("Native plugin not available. Running in browser?");
        setIsOnline(true); // simulate success in browser
      }
    } catch (err: any) {
      alert("Failed to connect: " + err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  if (isOnline) {
    return (
      <iframe
        src="https://airo-voice-assistant-1067129780637.us-west1.run.app/"
        style={{
          width: "100vw",
          height: "100vh",
          border: "none",
          display: "block",
          margin: 0,
          padding: 0,
        }}
        allow="camera *; microphone *; geolocation *; autoplay *; fullscreen *"
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white font-sans p-4">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl max-w-md w-full flex flex-col items-center">
        <div className="bg-red-500/10 p-5 rounded-full mb-6">
          <WifiOff className="w-16 h-16 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Network Disconnected</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">
          AiroKiosk is offline. Enter a Wi-Fi network and password to
          automatically connect and bypass system settings.
        </p>

        <form onSubmit={handleConnect} className="w-full space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">
              Network Name (SSID)
            </label>
            <input
              type="text"
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Enter SSID"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors pl-10"
                placeholder="••••••••"
                required
              />
              <Lock className="w-4 h-4 text-gray-500 absolute left-4 top-4" />
            </div>
          </div>
          <button
            type="submit"
            disabled={isConnecting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors mt-6 disabled:opacity-50"
          >
            {isConnecting ? "Connecting..." : "Connect to Wi-Fi"}
          </button>
        </form>
      </div>
    </div>
  );
}
