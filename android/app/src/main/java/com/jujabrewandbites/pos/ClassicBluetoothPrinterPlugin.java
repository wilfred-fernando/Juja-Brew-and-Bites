package com.jujabrewandbites.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "ClassicBluetoothPrinter",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        )
    }
)
public class ClassicBluetoothPrinterPlugin extends Plugin {
    private static final UUID SERIAL_PORT_UUID =
        UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private BluetoothSocket socket;
    private OutputStream output;
    private String connectedAddress;
    private String connectedName;

    @PluginMethod
    public void connect(PluginCall call) {
        executor.execute(() -> {
            try {
                BluetoothDevice device = findBondedDevice(
                    call.getString("address", ""),
                    call.getString("name", ""),
                    call.getString("namePrefix", "CT221B-")
                );
                ensureConnected(device);

                JSObject result = new JSObject();
                result.put("address", connectedAddress);
                result.put("name", connectedName);
                call.resolve(result);
            } catch (SecurityException error) {
                call.reject("Nearby devices permission is required. Enable it for JUJA Pos in Android Settings.", error);
            } catch (Exception error) {
                call.reject(error.getMessage() != null ? error.getMessage() : "Unable to connect to the Bluetooth printer.", error);
            }
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        executor.execute(() -> {
            try {
                String encoded = call.getString("data");
                if (encoded == null || encoded.isEmpty()) {
                    throw new Exception("No label data was supplied.");
                }
                if (socket == null || !socket.isConnected() || output == null) {
                    throw new Exception("CT221B is not connected. Tap Search or Reconnect first.");
                }

                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                output.write(bytes);
                output.flush();
                call.resolve();
            } catch (Exception error) {
                closeConnection();
                call.reject(error.getMessage() != null ? error.getMessage() : "Bluetooth printing failed.", error);
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        executor.execute(() -> {
            closeConnection();
            call.resolve();
        });
    }

    private BluetoothDevice findBondedDevice(String requestedAddress, String requestedName, String namePrefix) throws Exception {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) throw new Exception("Bluetooth is not supported on this device.");
        if (!adapter.isEnabled()) throw new Exception("Turn on Bluetooth, then try again.");

        Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
        if (bondedDevices == null || bondedDevices.isEmpty()) {
            throw new Exception("No paired Bluetooth printers found. Pair CT221B in Android Bluetooth Settings first.");
        }

        BluetoothDevice prefixMatch = null;
        for (BluetoothDevice device : bondedDevices) {
            String address = safeAddress(device);
            String name = safeName(device);
            if (!requestedAddress.isEmpty() && requestedAddress.equalsIgnoreCase(address)) return device;
            if (!requestedName.isEmpty() && requestedName.equalsIgnoreCase(name)) return device;
            if (prefixMatch == null && name != null && name.toUpperCase().startsWith(namePrefix.toUpperCase())) {
                prefixMatch = device;
            }
        }
        if (prefixMatch != null) return prefixMatch;

        throw new Exception("CT221B was not found in paired devices. Pair CT221B-7500 in Android Bluetooth Settings, then return to POS.");
    }

    private void ensureConnected(BluetoothDevice device) throws Exception {
        String address = safeAddress(device);
        if (socket != null && socket.isConnected() && address.equalsIgnoreCase(connectedAddress)) return;

        closeConnection();
        BluetoothAdapter.getDefaultAdapter().cancelDiscovery();

        Exception primaryError = null;
        try {
            socket = device.createRfcommSocketToServiceRecord(SERIAL_PORT_UUID);
            socket.connect();
        } catch (Exception error) {
            primaryError = error;
            closeConnection();
            try {
                Method method = device.getClass().getMethod("createRfcommSocket", int.class);
                socket = (BluetoothSocket) method.invoke(device, 1);
                socket.connect();
            } catch (Exception fallbackError) {
                closeConnection();
                throw new Exception(
                    "Could not open the CT221B serial print channel. Disconnect it from the Clabel app or another phone, then try again.",
                    primaryError != null ? primaryError : fallbackError
                );
            }
        }

        output = socket.getOutputStream();
        connectedAddress = address;
        connectedName = safeName(device);
    }

    private String safeName(BluetoothDevice device) {
        String name = device.getName();
        return name != null ? name : "CT221B";
    }

    private String safeAddress(BluetoothDevice device) {
        String address = device.getAddress();
        return address != null ? address : "";
    }

    private synchronized void closeConnection() {
        try {
            if (output != null) output.close();
        } catch (Exception ignored) {}
        try {
            if (socket != null) socket.close();
        } catch (Exception ignored) {}
        output = null;
        socket = null;
        connectedAddress = null;
        connectedName = null;
    }

    @Override
    protected void handleOnDestroy() {
        closeConnection();
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
