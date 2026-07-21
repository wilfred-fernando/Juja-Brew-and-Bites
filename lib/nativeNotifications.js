"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";

const ANDROID_SOUND_NAME = "notification";
const createdChannels = new Set();
let pushListenersRegistered = false;

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
  icon,
  channelId = "juja-alerts",
  channelName = "JUJA Alerts",
  summaryText,
  largeBody,
  group,
  data = {},
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
          smallIcon: "ic_stat_juja_notification",
          largeIcon: "juja_notification_large",
          iconColor: "#087830",
          channelId,
          sound: ANDROID_SOUND_NAME,
          ...(largeBody ? { largeBody } : {}),
          ...(summaryText ? { summaryText } : {}),
          ...(group ? { group } : {}),
          autoCancel: true,
          extra: {
            url: "/customer?tab=history",
            icon: icon || "/favicon.ico",
            ...data,
          },
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

export async function registerNativeCustomerPush({ supabase, userId }) {
  if (!isNativeApp() || !supabase || !userId) return { supported: false };

  try {
    await ensureNativeNotificationChannel("customer-orders-audible", "Customer Order Alerts");

    if (!pushListenersRegistered) {
      await PushNotifications.addListener("registration", async (token) => {
        const tokenValue = token?.value;
        if (!tokenValue) return;

        try {
          const { data } = await supabase.auth.getSession();
          const accessToken = data?.session?.access_token;
          await fetch("/api/customer/push-token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              token: tokenValue,
              platform: Capacitor?.getPlatform?.() || "native",
              app: "customer",
            }),
          });
        } catch (error) {
          console.warn("Customer push token registration failed:", error);
        }
      });

      await PushNotifications.addListener("registrationError", (error) => {
        console.warn("Customer push registration error:", error);
      });

      await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
        const data = notification?.data || {};
        await showNativeNotification({
          title: notification?.title || data.title || "JUJA Brew & Bites",
          body: notification?.body || data.body || "Your order status was updated.",
          tag: data.tag || data.web_order_id || `customer-order:${Date.now()}`,
          icon: data.icon || "/favicon.ico",
          channelId: "customer-orders-audible",
          channelName: "Customer Order Alerts",
          summaryText: data.summaryText,
          largeBody: data.largeBody,
          group: data.group || (data.web_order_id ? `web-order:${data.web_order_id}` : "juja-orders"),
          data: {
            ...data,
            url: data.url || "/customer?tab=history",
          },
        });
      });

      await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        const url = event?.notification?.data?.url || "/customer?tab=history";
        if (typeof window !== "undefined") window.location.href = url;
      });

      pushListenersRegistered = true;
    }

    let permission = await PushNotifications.checkPermissions();
    if (permission?.receive === "prompt" || permission?.receive === "prompt-with-rationale") {
      permission = await PushNotifications.requestPermissions();
    }

    if (permission?.receive !== "granted") {
      return { supported: true, granted: false };
    }

    await PushNotifications.register();
    return { supported: true, granted: true };
  } catch (error) {
    console.warn("Native customer push setup failed:", error);
    return { supported: true, granted: false, error };
  }
}
