import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEYS = {
  PEDOMETER_MODE: '@config_pedometer_mode',
  COMPASS_MODE: '@config_compass_mode',
  SETTINGS_VERSION: '@config_settings_version',
  // *** NOUVEAU: Clés pour la configuration des capteurs ***
  SENSORS_FREQUENCY: '@config_sensors_frequency',
  SENSORS_ENABLED: '@config_sensors_enabled'
};

const CURRENT_SETTINGS_VERSION = '1.0.0';

// Configuration par défaut
const DEFAULT_CONFIG = {
  pedometerMode: 'application',
  compassMode: 'native',
  // *** NOUVEAU: Configuration de la fréquence des capteurs ***
  sensorsFrequency: 40, // Hz, valeur par défaut changée de 50 à 40
  sensorsEnabled: {
    accelerometer: true,
    gyroscope: true,
    // Magnétomètre supprimé car on utilise la boussole native
  }
};

// *** NOUVEAU: Limites pour la fréquence des capteurs ***
const SENSORS_FREQUENCY_MIN = 20;   // Hz minimum (changé de 5 à 20)
const SENSORS_FREQUENCY_MAX = 100;  // Hz maximum (changé de 75 à 100)

/**
 * Service de gestion de la configuration utilisateur
 * Gère les préférences pour le podomètre et la boussole
 */
export class ConfigurationService {
  constructor() {
    this.config = {
      pedometerMode: 'application', // 'application' ou 'native'
      compassMode: 'native',        // Toujours 'native' maintenant
      // *** NOUVEAU: Configuration des capteurs ***
      sensorsFrequency: 40,         // Hz, entre 5 et 75
      sensorsEnabled: {
        accelerometer: true,
        gyroscope: true
        // Magnétomètre supprimé car on utilise la boussole native
      },
      settingsVersion: CURRENT_SETTINGS_VERSION
    };
    
    this.listeners = [];
    this.isInitialized = false;
  }

  /**
   * Initialisation du service avec chargement des préférences
   */
  async initialize() {
    try {
      await this.loadConfiguration();
      await this.migrateIfNeeded();
      this.isInitialized = true;
      console.log('ConfigurationService initialisé:', this.config);
    } catch (error) {
      console.error('Erreur initialisation ConfigurationService:', error);
      // Utiliser les valeurs par défaut en cas d'erreur
      this.isInitialized = true;
    }
  }

  /**
   * Chargement de la configuration depuis le stockage
   */
  async loadConfiguration() {
    try {
      const [pedometerMode, compassMode, settingsVersion, sensorsFrequency, sensorsEnabled] = await AsyncStorage.multiGet([
        STORAGE_KEYS.PEDOMETER_MODE,
        STORAGE_KEYS.COMPASS_MODE,
        STORAGE_KEYS.SETTINGS_VERSION,
        STORAGE_KEYS.SENSORS_FREQUENCY,
        STORAGE_KEYS.SENSORS_ENABLED
      ]);

      if (pedometerMode[1]) {
        this.config.pedometerMode = pedometerMode[1];
      }
      if (compassMode[1]) {
        this.config.compassMode = compassMode[1];
      }
      if (settingsVersion[1]) {
        this.config.settingsVersion = settingsVersion[1];
      }
      // *** NOUVEAU: Chargement configuration capteurs ***
      if (sensorsFrequency[1]) {
        this.config.sensorsFrequency = parseInt(sensorsFrequency[1], 10);
      }
      if (sensorsEnabled[1]) {
        try {
          this.config.sensorsEnabled = JSON.parse(sensorsEnabled[1]);
        } catch (error) {
          console.warn('Erreur parsing sensorsEnabled, utilisation valeur par défaut');
        }
      }

      console.log('Configuration chargée:', this.config);
    } catch (error) {
      console.error('Erreur chargement configuration:', error);
    }
  }

  /**
   * Sauvegarde de la configuration
   */
  async saveConfiguration() {
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.PEDOMETER_MODE, this.config.pedometerMode],
        [STORAGE_KEYS.COMPASS_MODE, this.config.compassMode],
        [STORAGE_KEYS.SETTINGS_VERSION, this.config.settingsVersion],
        // *** NOUVEAU: Sauvegarde configuration capteurs ***
        [STORAGE_KEYS.SENSORS_FREQUENCY, this.config.sensorsFrequency.toString()],
        [STORAGE_KEYS.SENSORS_ENABLED, JSON.stringify(this.config.sensorsEnabled)]
      ]);
      
      console.log('Configuration sauvegardée:', this.config);
      this.notifyListeners();
    } catch (error) {
      console.error('Erreur sauvegarde configuration:', error);
      throw error;
    }
  }

  /**
   * Migration des anciennes versions de configuration
   */
  async migrateIfNeeded() {
    if (this.config.settingsVersion !== CURRENT_SETTINGS_VERSION) {
      console.log(`Migration configuration ${this.config.settingsVersion} → ${CURRENT_SETTINGS_VERSION}`);
      
      // Migrations futures ici
      switch (this.config.settingsVersion) {
        case undefined:
        case '':
          // Première installation - forcer boussole native
          this.config.compassMode = 'native';
          break;
      }
      
      this.config.settingsVersion = CURRENT_SETTINGS_VERSION;
      await this.saveConfiguration();
    }
  }

  /**
   * Définir le mode podomètre
   */
  async setPedometerMode(mode) {
    if (!['application', 'native'].includes(mode)) {
      throw new Error(`Mode podomètre invalide: ${mode}`);
    }
    
    this.config.pedometerMode = mode;
    await this.saveConfiguration();
  }

  /**
   * Définir le mode boussole (toujours native maintenant)
   */
  async setCompassMode(mode) {
    if (mode !== 'native') {
      console.warn('Seule la boussole native est supportée');
      mode = 'native';
    }
    
    this.config.compassMode = mode;
    await this.saveConfiguration();
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfiguration() {
    return { ...this.config };
  }

  /**
   * Obtenir le mode podomètre
   */
  getPedometerMode() {
    return this.config.pedometerMode;
  }

  /**
   * Obtenir le mode boussole
   */
  getCompassMode() {
    return this.config.compassMode;
  }

  /**
   * Vérifier si le podomètre natif est disponible
   */
  async isNativePedometerAvailable() {
    if (Platform.OS !== 'ios') {
      console.log('🔍 [CONFIG] Plateforme non iOS, podomètre natif non disponible');
      return false;
    }

    try {
      // Utiliser le nouveau service iOS CMPedometer
      const { nativeIOSPedometerService } = require('./NativeIOSPedometerService');
      
      console.log('🔍 [CONFIG] Test de disponibilité CMPedometer...');
      const available = await nativeIOSPedometerService.initialize();
      
      if (available) {
        console.log('✅ [CONFIG] CMPedometer disponible et initialisé');
        return true;
      } else {
        console.log('❌ [CONFIG] CMPedometer non disponible');
        return false;
      }
    } catch (error) {
      console.error('❌ [CONFIG] Erreur vérification CMPedometer:', error);
      return false;
    }
  }

  /**
   * Obtenir la configuration optimisée pour LocalizationSDK
   */
  async getSDKConfiguration() {
    const nativePedometerAvailable = await this.isNativePedometerAvailable();
    
    // Forcer le mode application si le natif n'est pas disponible
    const effectivePedometerMode = (this.config.pedometerMode === 'native' && !nativePedometerAvailable) 
      ? 'application' 
      : this.config.pedometerMode;

    return {
      // Configuration podomètre
      useNativePedometer: effectivePedometerMode === 'native',
      pedometerMode: effectivePedometerMode,
      
      // Configuration boussole (toujours native)
      compassMode: 'native',
      
      // Configuration orientation continue
      continuousOrientation: {
        enabled: true,
        mode: 'native_compass', // Toujours boussole native
        fallbackToSteps: true
      },
      
      // Configuration PDR adaptée
      pdr: {
        useNativeStepLength: effectivePedometerMode === 'native',
        fallbackMode: effectivePedometerMode === 'application'
      },
      
      // Informations système
      platform: Platform.OS,
      nativePedometerAvailable,
      effectivePedometerMode
    };
  }

  /**
   * *** NOUVEAU: Définir la fréquence des capteurs ***
   */
  async setSensorsFrequency(frequency) {
    if (typeof frequency !== 'number' || frequency < SENSORS_FREQUENCY_MIN || frequency > SENSORS_FREQUENCY_MAX) {
      throw new Error(`Fréquence capteurs invalide: ${frequency}. Doit être entre ${SENSORS_FREQUENCY_MIN} et ${SENSORS_FREQUENCY_MAX} Hz`);
    }
    
    this.config.sensorsFrequency = frequency;
    await this.saveConfiguration();
    console.log(`🔧 [CONFIG] Fréquence capteurs mise à jour: ${frequency} Hz`);
  }

  /**
   * *** NOUVEAU: Obtenir la fréquence des capteurs ***
   */
  getSensorsFrequency() {
    return this.config.sensorsFrequency;
  }

  /**
   * *** NOUVEAU: Activer/désactiver un capteur ***
   */
  async setSensorEnabled(sensorName, enabled) {
    if (!['accelerometer', 'gyroscope'].includes(sensorName)) {
      throw new Error(`Capteur invalide: ${sensorName}. Capteurs supportés: accelerometer, gyroscope`);
    }
    
    this.config.sensorsEnabled[sensorName] = enabled;
    await this.saveConfiguration();
    console.log(`🔧 [CONFIG] Capteur ${sensorName} ${enabled ? 'activé' : 'désactivé'}`);
  }

  /**
   * *** NOUVEAU: Obtenir l'état des capteurs ***
   */
  getSensorsEnabled() {
    return { ...this.config.sensorsEnabled };
  }

  /**
   * *** NOUVEAU: Obtenir la configuration complète des capteurs ***
   */
  getSensorsConfiguration() {
    return {
      frequency: this.config.sensorsFrequency,
      enabled: { ...this.config.sensorsEnabled },
      limits: {
        minFrequency: SENSORS_FREQUENCY_MIN,
        maxFrequency: SENSORS_FREQUENCY_MAX
      }
    };
  }

  /**
   * Réinitialiser la configuration aux valeurs par défaut
   */
  async resetToDefaults() {
    this.config = {
      pedometerMode: 'application',
      compassMode: 'native',
      // *** NOUVEAU: Réinitialisation configuration capteurs ***
      sensorsFrequency: 40,
      sensorsEnabled: {
        accelerometer: true,
        gyroscope: true
      },
      settingsVersion: CURRENT_SETTINGS_VERSION
    };
    
    await this.saveConfiguration();
    console.log('Configuration réinitialisée aux valeurs par défaut');
  }

  /**
   * Ajouter un listener pour les changements de configuration
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notifier tous les listeners des changements
   */
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.getConfiguration());
      } catch (error) {
        console.error('Erreur dans listener configuration:', error);
      }
    });
  }

  /**
   * Obtenir les informations de diagnostic
   */
  async getDiagnosticInfo() {
    const nativePedometerAvailable = await this.isNativePedometerAvailable();
    
    return {
      platform: Platform.OS,
      platformVersion: Platform.Version,
      configuration: this.getConfiguration(),
      nativePedometerAvailable,
      compassAvailable: true, // Toujours disponible
      settingsVersion: this.config.settingsVersion,
      isInitialized: this.isInitialized
    };
  }
}

// Instance singleton
export const configurationService = new ConfigurationService(); 