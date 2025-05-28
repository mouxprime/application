const { NativeModulesProxy } = require('expo-modules-core');

console.log('🔍 [NATIVE-MODULE-PROXY] NativeModulesProxy type:', typeof NativeModulesProxy);
console.log('🔍 [NATIVE-MODULE-PROXY] NativeModulesProxy keys:', Object.keys(NativeModulesProxy || {}));
console.log('🔍 [NATIVE-MODULE-PROXY] ExpoNativePedometerModule in proxy:', 'ExpoNativePedometerModule' in (NativeModulesProxy || {}));
console.log('🔍 [NATIVE-MODULE-PROXY] ExpoNativePedometerModule value:', NativeModulesProxy?.ExpoNativePedometerModule);

// Fallback pour les plateformes non supportées
const ExpoNativePedometerModule = NativeModulesProxy.ExpoNativePedometerModule || {
  async isAvailable() {
    console.log('🔧 [FALLBACK-MODULE] isAvailable appelé - retourne false');
    return false;
  },
  async startStepLengthTracking() {
    console.log('🔧 [FALLBACK-MODULE] startStepLengthTracking appelé - erreur');
    throw new Error('ExpoNativePedometer is not available on this platform');
  },
  async stopStepLengthTracking() {
    console.log('🔧 [FALLBACK-MODULE] stopStepLengthTracking appelé - erreur');
    throw new Error('ExpoNativePedometer is not available on this platform');
  },
  async getStatus() {
    console.log('🔧 [FALLBACK-MODULE] getStatus appelé');
    return {
      isAvailable: false,
      isRunning: false,
      hasPermissions: false
    };
  },
  async reset() {
    console.log('🔧 [FALLBACK-MODULE] reset appelé - erreur');
    throw new Error('ExpoNativePedometer is not available on this platform');
  }
};

console.log('🔍 [NATIVE-MODULE-PROXY] Module final type:', typeof ExpoNativePedometerModule);
console.log('🔍 [NATIVE-MODULE-PROXY] Module final keys:', Object.keys(ExpoNativePedometerModule));

module.exports = ExpoNativePedometerModule; 