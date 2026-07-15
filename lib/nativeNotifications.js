"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const ANDROID_SOUND_NAME = "notification";
const createdChannels = new Set();

export function isNativeApp() {
  if (typeof window === "undefined") return false;
  if (Capacitor?.isNativePlatform?.()) return true;
  const platform = Capacitor?.getPlatform?.();
  return platform === "android" || platform === "ios" || window.location.protocol === "capacitor:";
}

export async function ensureNativeNotificationPermission() {
  if (!isNativeApp()) return "unsupported";

  try {
    const current = await LocalNotifications.checkPermissions();
    if (current?.display === "granted") return "granted";

    const requested = await LocalNotifications.requestPermissions();
    return requested?.display || "denied";
  } catch (error) {
    console.warn("Native notification permission unavailable:", error);
    return "unsupported";
  }
}

async function ensureNativeNotificationChannel(channelId, channelName) {
  if (!isNativeApp() || !channelId || createdChannels.has(channelId)) return;
  if (Capacitor?.getPlatform?.() !== "android") return;

  try {
    await LocalNotifications.createChannel({
      id: channelId,
      name: channelName,
      description: "JUJA order and store notifications",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: ANDROID_SOUND_NAME,
    });
    createdChannels.add(channelId);
  } catch (error) {
    console.warn("Native notification channel unavailable:", error);
  }
}

export function playNotificationSound(src = "/sound/notification.mp3", repeatCount = 1) {
  if (typeof window === "undefined") return false;
  const totalPlays = Math.max(1, Number(repeatCount) || 1);
  let played = 0;

  const playOnce = () => {
    const audio = new Audio(src);
    audio.volume = 0.95;
    audio.onended = () => {
      played += 1;
      if (played < totalPlays) {
        window.setTimeout(playOnce, 180);
      }
    };
    audio.play().catch(() => {});
  };

  playOnce();
  return true;
}

export async function showNativeNotification({
  title,
  body,
  tag,
  channelId = "juja-alerts",
  channelName = "JUJA Alerts",
}) {
  if (!isNativeApp()) return false;

  const permission = await ensureNativeNotificationPermission();
  if (permission !== "granted") return false;

  try {
    await ensureNativeNotificationChannel(channelId, channelName);

    const numericId = Math.abs(
      Array.from(String(tag || `${title}:${body}:${Date.now()}`)).reduce(
        (sum, char) => (sum * 31 + char.charCodeAt(0)) % 2147483647,
        17
      )
    );

    await LocalNotifications.schedule({
      notifications: [
        {
          id: numericId || Math.floor(Date.now() % 2147483647),
          title,
          body,
          channelId,
          sound: ANDROID_SOUND_NAME,
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    });
    return true;
  } catch (error) {
    console.warn("Native notification failed:", error);
    return false;
  }
}
