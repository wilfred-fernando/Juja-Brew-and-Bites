import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jujabrewandbites.pos',
  appName: 'JUJA Pos',
  webDir: '.next',
  server: {
    url: 'https://pos.jujabrewandbites.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
