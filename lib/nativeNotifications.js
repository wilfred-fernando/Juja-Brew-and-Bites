"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

export function isNativeApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
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
    await LocalNotifications.createChannel({
      id: channelId,
      name: channelName,
      description: "JUJA order and store notifications",
      importance: 5,
      visibility: 1,
      vibration: true,
    }).catch(() => {});

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
