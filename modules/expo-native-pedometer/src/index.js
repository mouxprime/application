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
  console.log('🔍 [NATIVE-MODULE] Méthodes disponibles:', Object.keys(ExpoNativePedometerModule));
  console.log('🔍 [NATIVE-MODULE] Type du module:', typeof ExpoNativePedometerModule);
  console.log('🔍 [NATIVE-MODULE] isAvailable type:', typeof ExpoNativePedometerModule.isAvailable);
} catch (error) {
  console.error('❌ [NATIVE-MODULE] Erreur chargement ExpoNativePedometerModule:', error.message);
  console.error('❌ [NATIVE-MODULE] Stack:', error.stack);
  // Fallback module
  ExpoNativePedometerModule = {
    async isAvailable() {
      console.log('🔧 [NATIVE-MODULE] Utilisation du fallback isAvailable');
      return false;
    },
    async startStepLengthTracking() { 
      console.log('🔧 [NATIVE-MODULE] Utilisation du fallback startStepLengthTracking');
      throw new Error('Module natif non disponible'); 
    },
    async stopStepLengthTracking() { 
      console.log('🔧 [NATIVE-MODULE] Utilisation du fallback stopStepLengthTracking');
      throw new Error('Module natif non disponible'); 
    },
    async getStatus() {
      console.log('🔧 [NATIVE-MODULE] Utilisation du fallback getStatus');
      return ({ isAvailable: false, isRunning: false, hasPermissions: false });
    },
    async reset() { 
      console.log('🔧 [NATIVE-MODULE] Utilisation du fallback reset');
      throw new Error('Module natif non disponible'); 
    }
  };
}

class ExpoNativePedometer extends EventEmitter {
  constructor() {
    super();
    console.log('🔧 [NATIVE-MODULE] ExpoNativePedometer instance créée');
    console.log('🔍 [NATIVE-MODULE] Module sous-jacent:', typeof ExpoNativePedometerModule);
  }

  /**
   * Vérifie si CMPedometer est disponible sur l'appareil
   */
  async isAvailable() {
    try {
      console.log('🔍 [NATIVE-MODULE] Vérification disponibilité...');
      console.log('🔍 [NATIVE-MODULE] Type de isAvailable:', typeof ExpoNativePedometerModule.isAvailable);
      
      if (typeof ExpoNativePedometerModule.isAvailable !== 'function') {
        console.error('❌ [NATIVE-MODULE] isAvailable n\'est pas une fonction:', ExpoNativePedometerModule.isAvailable);
        return false;
      }
      
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
    try {
      console.log('🔍 [NATIVE-MODULE] Démarrage suivi...');
      return await ExpoNativePedometerModule.startStepLengthTracking();
    } catch (error) {
      console.error('❌ [NATIVE-MODULE] Erreur startStepLengthTracking:', error.message);
      throw error;
    }
  }

  /**
   * Arrête le suivi des pas
   */
  async stopStepLengthTracking() {
    try {
      console.log('🔍 [NATIVE-MODULE] Arrêt suivi...');
      return await ExpoNativePedometerModule.stopStepLengthTracking();
    } catch (error) {
      console.error('❌ [NATIVE-MODULE] Erreur stopStepLengthTracking:', error.message);
      throw error;
    }
  }

  /**
   * Obtient le statut actuel du podomètre
   */
  async getStatus() {
    try {
      console.log('🔍 [NATIVE-MODULE] Récupération statut...');
      return await ExpoNativePedometerModule.getStatus();
    } catch (error) {
      console.error('❌ [NATIVE-MODULE] Erreur getStatus:', error.message);
      return { isAvailable: false, isRunning: false, hasPermissions: false };
    }
  }

  /**
   * Remet à zéro les compteurs
   */
  async reset() {
    try {
      console.log('🔍 [NATIVE-MODULE] Reset...');
      return await ExpoNativePedometerModule.reset();
    } catch (error) {
      console.error('❌ [NATIVE-MODULE] Erreur reset:', error.message);
      throw error;
    }
  }

  /**
   * S'abonne aux mises à jour de longueur de pas
   */
  addStepLengthListener(listener) {
    console.log('🔍 [NATIVE-MODULE] Ajout listener...');
    return this.addListener('onStepLengthUpdate', listener);
  }
}

const instance = new ExpoNativePedometer();
console.log('📦 [NATIVE-MODULE] Instance exportée:', typeof instance);
console.log('📦 [NATIVE-MODULE] Méthodes instance:', Object.getOwnPropertyNames(Object.getPrototypeOf(instance)));

// Export par défaut ET nommé pour compatibilité maximale
module.exports = instance;
module.exports.default = instance;
module.exports.ExpoNativePedometer = ExpoNativePedometer; 