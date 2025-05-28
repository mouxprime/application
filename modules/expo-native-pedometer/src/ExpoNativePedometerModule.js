const { NativeModulesProxy } = require('expo-modules-core');

// Fallback pour les plateformes non supportées
const ExpoNativePedometerModule = NativeModulesProxy.ExpoNativePedometer || {
  async isAvailable() {
    return false;
  },
  async startStepLengthTracking() {
    throw new Error('ExpoNativePedometer is not available on this platform');
  },
  async stopStepLengthTracking() {
    throw new Error('ExpoNativePedometer is not available on this platform');
  },
  async getStatus() {
    return {
      isAvailable: false,
      isRunning: false,
      hasPermissions: false
    };
  },
  async reset() {
    throw new Error('ExpoNativePedometer is not available on this platform');
  }
};

module.exports = ExpoNativePedometerModule; 