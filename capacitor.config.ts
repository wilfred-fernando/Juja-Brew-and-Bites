import type { CapacitorConfig } from '@capacitor/cli';

const target = (process.env.CAPACITOR_APP_TARGET || 'pos').toLowerCase();
const appConfigs = {
  pos: {
    appId: 'com.jujabrewandbites.pos',
    appName: 'JUJA Pos',
    url: 'https://pos.jujabrewandbites.com',
  },
  customer: {
    appId: 'com.jujabrewandbites.customer',
    appName: 'JUJA Customer Portal',
    url: 'https://customer.jujabrewandbites.com',
  },
} as const;
const selectedApp = appConfigs[target as keyof typeof appConfigs] || appConfigs.pos;

const config: CapacitorConfig = {
  appId: selectedApp.appId,
  appName: selectedApp.appName,
  webDir: '.next',
  server: {
    url: selectedApp.url,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert", "banner", "list"],
    },
  },
};

export default config;
