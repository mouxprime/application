let EventEmitter, ExpoNativePedometerModule;

try {
  const expoModulesCore = require('expo-modules-core');
  EventEmitter = expoModulesCore.EventEmitter;
  console.log('✅ [NATIVE-MODULE] expo-modules-core chargé avec succès');
} catch (error) {
  console.error('❌ [NATIVE-MODULE] Erreur chargement expo-modules-core:', error.message);
  // Fallback EventEmitter simple
  EventEmitter = class {
    addListener(eventName, listener) {
      return { remove: () => {} };
    }
  };
}

try {
  ExpoNativePedometerModule = require('./ExpoNativePedometerModule');
  console.log('✅ [NATIVE-MODULE] ExpoNativePedometerModule chargé avec succès');
} catch (error) {
  console.error('❌ [NATIVE-MODULE] Erreur chargement ExpoNativePedometerModule:', error.message);
  // Fallback module
  ExpoNativePedometerModule = {
    isAvailable: async () => false,
    startStepLengthTracking: async () => { throw new Error('Module natif non disponible'); },
    stopStepLengthTracking: async () => { throw new Error('Module natif non disponible'); },
    getStatus: async () => ({ isAvailable: false, isRunning: false, hasPermissions: false }),
    reset: async () => { throw new Error('Module natif non disponible'); }
  };
}

class ExpoNativePedometer extends EventEmitter {
  constructor() {
    super();
    console.log('🔧 [NATIVE-MODULE] ExpoNativePedometer instance créée');
  }

  /**
   * Vérifie si CMPedometer est disponible sur l'appareil
   */
  async isAvailable() {
    try {
      console.log('🔍 [NATIVE-MODULE] Vérification disponibilité...');
      const result = await ExpoNativePedometerModule.isAvailable();
      console.log(`🔍 [NATIVE-MODULE] Résultat disponibilité: ${result}`);
      return result;
    } catch (error) {
      console.error('❌ [NATIVE-MODULE] Erreur isAvailable:', error.message);
      return false;
    }
  }

  /**
   * Démarre le suivi des pas avec CMPedometer
   */
  async startStepLengthTracking() {
    return await ExpoNativePedometerModule.startStepLengthTracking();
  }

  /**
   * Arrête le suivi des pas
   */
  async stopStepLengthTracking() {
    return await ExpoNativePedometerModule.stopStepLengthTracking();
  }

  /**
   * Obtient le statut actuel du podomètre
   */
  async getStatus() {
    return await ExpoNativePedometerModule.getStatus();
  }

  /**
   * Remet à zéro les compteurs
   */
  async reset() {
    return await ExpoNativePedometerModule.reset();
  }

  /**
   * S'abonne aux mises à jour de longueur de pas
   */
  addStepLengthListener(listener) {
    return this.addListener('onStepLengthUpdate', listener);
  }
}

const instance = new ExpoNativePedometer();
console.log('📦 [NATIVE-MODULE] Instance exportée:', typeof instance, Object.keys(instance));
module.exports = instance; 