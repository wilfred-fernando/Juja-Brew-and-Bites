import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jujabrewandbites.customer',
  appName: 'JUJA Customer Portal',
  webDir: '.next',
  server: {
    url: 'https://customer.jujabrewandbites.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
