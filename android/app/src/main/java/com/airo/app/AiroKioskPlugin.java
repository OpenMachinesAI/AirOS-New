package com.airo.app;

import android.content.Context;
import android.media.AudioManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.net.wifi.WifiNetworkSuggestion;
import android.net.ConnectivityManager;
import android.net.NetworkRequest;
import android.os.Build;
import android.bluetooth.BluetoothAdapter;
import android.net.NetworkCapabilities;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AiroKiosk")
public class AiroKioskPlugin extends Plugin {

    @PluginMethod
    public void connectWifi(PluginCall call) {
        String ssid = call.getString("ssid");
        String password = call.getString("password");

        if (ssid == null || password == null) {
            call.reject("SSID and password are required");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            WifiNetworkSpecifier specifier = new WifiNetworkSpecifier.Builder()
                .setSsid(ssid)
                .setWpa2Passphrase(password)
                .build();

            NetworkRequest request = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .setNetworkSpecifier(specifier)
                .build();

            ConnectivityManager connectivityManager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            
            ConnectivityManager.NetworkCallback networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(android.net.Network network) {
                    super.onAvailable(network);
                    connectivityManager.bindProcessToNetwork(network);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                }
                
                @Override
                public void onUnavailable() {
                    super.onUnavailable();
                    call.reject("Failed to connect to Wi-Fi");
                }
            };
            
            connectivityManager.requestNetwork(request, networkCallback);
        } else {
            // Deprecated path for older androids, returning success for now
            call.reject("Wi-Fi programmatic connection requires Android 10+");
        }
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Integer level = call.getInt("level");
        if (level == null) {
            call.reject("Volume level is required");
            return;
        }
        
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            int maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int newVol = (int) ((level / 100.0) * maxVolume);
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, newVol, 0);
            
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } else {
            call.reject("Audio manager not available");
        }
    }

    @PluginMethod
    public void setBluetooth(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("enabled boolean is required");
            return;
        }
        
        BluetoothAdapter bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth not supported");
            return;
        }
        
        try {
            if (enabled) {
                // Requires BLUETOOTH_CONNECT permission on Android 12+
                bluetoothAdapter.enable();
            } else {
                bluetoothAdapter.disable();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Missing bluetooth permissions: " + e.getMessage());
        }
    }
}
