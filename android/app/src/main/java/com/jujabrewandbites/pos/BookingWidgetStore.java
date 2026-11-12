package com.jujabrewandbites.pos;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class BookingWidgetStore {
    static final String ENDPOINT = "https://pos.jujabrewandbites.com/api/pos/booking-widget";
    static boolean isPos(Context context) { return "com.jujabrewandbites.pos".equals(context.getPackageName()); }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pos_booking_widget", Context.MODE_PRIVATE); }
    static synchronized String identity(Context c) {
        String id = prefs(c).getString("device", null);
        if (id == null) { id = UUID.randomUUID().toString(); prefs(c).edit().putString("device", id).commit(); }
        return id;
    }
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        String alias = "juja_pos_booking_widget";
        if (!store.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(alias, null);
    }
    static synchronized JSONObject read(Context c) {
        try {
            String raw = prefs(c).getString("encrypted", ""); if (raw.isEmpty()) return new JSONObject();
            String[] parts = raw.split(":");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception ignored) { return new JSONObject(); }
    }
    static synchronized void write(Context c, JSONObject data) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        if (!prefs(c).edit().putString("encrypted", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit()) throw new Exception("Widget storage unavailable");
    }
    static synchronized String clear(Context c) {
        String token = read(c).optString("token"); prefs(c).edit().remove("encrypted").commit(); return token;
    }
    static synchronized void configure(Context c, String token) throws Exception {
        JSONObject data = new JSONObject(); data.put("token", token); write(c, data);
    }
    static void request(Context c, String token, boolean revoke) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
        try {
            connection.setConnectTimeout(10000); connection.setReadTimeout(10000); connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(revoke ? "DELETE" : "GET"); connection.setRequestProperty("Authorization", "Bearer " + token);
            int status = connection.getResponseCode(); if (revoke) return;
            synchronized (BookingWidgetStore.class) {
                if (!token.equals(read(c).optString("token"))) return;
                if (status == 401 || status == 403) { clear(c); return; }
            }
            if (status != 200) throw new Exception("Widget refresh unavailable");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) { output.write(buffer, 0, count); if (output.size() > 1000000) throw new Exception("Widget response too large"); }
            }
            JSONObject payload = new JSONObject(output.toString("UTF-8"));
            synchronized (BookingWidgetStore.class) {
                JSONObject current = read(c); if (!token.equals(current.optString("token"))) return;
                current.put("payload", payload); current.put("updated", System.currentTimeMillis()); write(c, current);
            }
        } finally { connection.disconnect(); }
    }
}
