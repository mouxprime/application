import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';

// Note: Barometer n'est pas disponible dans Expo
// Simulation pour la compatibilité future

/**
 * Gestionnaire de capteurs avancé avec échantillonnage adaptatif et optimisation énergétique
 * Optimisé pour les systèmes PDR avec support du baromètre
 */
export class AdvancedSensorManager {
  constructor(config = {}) {
    this.config = {
      // Échantillonnage adaptatif
      baseRate: config.baseRate || 25, // Hz
      highRate: config.highRate || 100, // Hz
      ultraLowRate: config.ultraLowRate || 5, // Hz pour économie d'énergie
      
      // Seuils d'adaptation
      motionThreshold: config.motionThreshold || 2.0, // m/s²
      lowMotionThreshold: config.lowMotionThreshold || 0.5, // m/s²
      
      // Gestion énergétique
      energySavingMode: config.energySavingMode || false,
      batteryOptimization: config.batteryOptimization || true,
      
      // Filtrage et calibration
      smoothingFactor: config.smoothingFactor || 0.8,
      calibrationSamples: config.calibrationSamples || 100,
      adaptiveCalibration: config.adaptiveCalibration || true,
      
      // Confiance magnétomètre
      magneticInterferenceThreshold: config.magneticInterferenceThreshold || 50.0,
      magnetometerConfidenceWindow: config.magnetometerConfidenceWindow || 20,
      
      ...config
    };

    // État des capteurs
    this.isInitialized = false;
    this.isActive = false;
    this.currentSampleRate = this.config.baseRate;
    
    // Abonnements
    this.subscriptions = {
      accelerometer: null,
      gyroscope: null,
      magnetometer: null,
      barometer: null
    };

    // Données actuelles
    this.currentData = {
      accelerometer: { x: 0, y: 0, z: 0, timestamp: 0 },
      gyroscope: { x: 0, y: 0, z: 0, timestamp: 0 },
      magnetometer: { x: 0, y: 0, z: 0, timestamp: 0 },
      barometer: { pressure: 0, relativeAltitude: 0, timestamp: 0 }
    };

    // Buffers pour analyse
    this.sensorBuffers = {
      accelerometer: [],
      gyroscope: [],
      magnetometer: [],
      barometer: []
    };

    // État de calibration
    this.calibration = {
      isCalibrating: false,
      isCalibrated: false,
      offsets: {
        accelerometer: { x: 0, y: 0, z: 0 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 }
      },
      magnetometerConfidence: 1.0,
      barometerBaseline: 1013.25
    };

    // Gestion de l'énergie
    this.energyManagement = {
      lastActivityTime: Date.now(),
      inactivityTimeout: 30000, // 30s
      isInLowPowerMode: false,
      disabledSensors: new Set()
    };

    // Métriques
    this.metrics = {
      samplesProcessed: 0,
      energyLevel: 1.0,
      averageProcessingTime: 0,
      lastPerformanceCheck: Date.now()
    };

    // Callbacks
    this.callbacks = {
      onDataUpdate: null,
      onModeChanged: null,
      onCalibrationProgress: null,
      onEnergyStatusChanged: null
    };
  }

  /**
   * Initialisation avancée du gestionnaire
   */
  async initialize() {
    try {
      console.log('Initialisation du gestionnaire de capteurs avancé...');

      // Vérification disponibilité capteurs
      const availability = await this.checkSensorAvailability();
      
      if (!availability.accelerometer || !availability.gyroscope) {
        throw new Error('Capteurs IMU de base non disponibles');
      }

      // Configuration des intervalles adaptatifs
      await this.configureSensorRates();

      // Initialisation du baromètre si disponible
      if (availability.barometer) {
        await this.initializeBarometer();
      }

      this.isInitialized = true;
      console.log('Gestionnaire de capteurs avancé initialisé', availability);
      return availability;

    } catch (error) {
      console.error('Erreur initialisation capteurs avancés:', error);
      return false;
    }
  }

  /**
   * Vérification de la disponibilité des capteurs
   */
     async checkSensorAvailability() {
     const availability = {
       accelerometer: await Accelerometer.isAvailableAsync(),
       gyroscope: await Gyroscope.isAvailableAsync(),
       magnetometer: await Magnetometer.isAvailableAsync(),
       barometer: false // Non disponible dans Expo
     };

     console.log('Disponibilité capteurs:', availability);
     return availability;
   }

  /**
   * Configuration des taux d'échantillonnage
   */
  async configureSensorRates() {
    const rate = this.currentSampleRate;
    const interval = 1000 / rate; // ms

         await Promise.all([
       Accelerometer.setUpdateInterval(interval),
       Gyroscope.setUpdateInterval(interval),
       Magnetometer.setUpdateInterval(interval * 2) // Magnétomètre plus lent
       // Barometer.setUpdateInterval non disponible dans Expo
     ]);

    console.log(`Taux configuré: ${rate} Hz (${interval} ms)`);
  }

  /**
   * Initialisation spécifique du baromètre
   */
  async initializeBarometer() {
    try {
      // Échantillonnage initial pour baseline
      const samples = [];
      for (let i = 0; i < 10; i++) {
        // Note: Barometer peut ne pas être disponible dans Expo
        // Cette implémentation est préparatoire
        samples.push({ pressure: 1013.25 }); // Valeur par défaut
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const baseline = samples.reduce((sum, s) => sum + s.pressure, 0) / samples.length;
      this.calibration.barometerBaseline = baseline;
      
      console.log(`Baromètre calibré: baseline = ${baseline.toFixed(2)} hPa`);
    } catch (error) {
      console.warn('Initialisation baromètre échouée:', error);
    }
  }

  /**
   * Démarrage avec gestion énergétique
   */
  async startAll() {
    if (!this.isInitialized) {
      throw new Error('Gestionnaire non initialisé');
    }

    try {
      // Démarrage accéléromètre
      this.subscriptions.accelerometer = Accelerometer.addListener(
        this.createDataHandler('accelerometer')
      );

      // Démarrage gyroscope
      this.subscriptions.gyroscope = Gyroscope.addListener(
        this.createDataHandler('gyroscope')
      );

      // Démarrage magnétomètre (si pas désactivé pour économie)
      if (!this.energyManagement.disabledSensors.has('magnetometer')) {
        this.subscriptions.magnetometer = Magnetometer.addListener(
          this.createDataHandler('magnetometer')
        );
      }

             // Baromètre non disponible dans Expo
       // if (!this.energyManagement.disabledSensors.has('barometer')) {
       //   try {
       //     this.subscriptions.barometer = Barometer.addListener(
       //       this.createDataHandler('barometer')
       //     );
       //   } catch (error) {
       //     console.warn('Baromètre non disponible:', error);
       //   }
       // }

      this.isActive = true;
      this.energyManagement.lastActivityTime = Date.now();
      
      console.log('Capteurs avancés démarrés');

    } catch (error) {
      console.error('Erreur démarrage capteurs:', error);
      this.stopAll();
    }
  }

  /**
   * Création d'un gestionnaire de données pour un capteur
   */
  createDataHandler(sensorType) {
    return (data) => {
      const timestamp = Date.now();
      const processedData = this.processRawData(sensorType, data, timestamp);
      
      // Mise à jour des données actuelles
      this.currentData[sensorType] = processedData;
      
      // Ajout au buffer
      this.addToBuffer(sensorType, processedData);
      
      // Adaptation du taux d'échantillonnage
      this.adaptSampleRate();
      
      // Gestion énergétique
      this.updateEnergyManagement();
      
      // Callback global
      this.notifyDataUpdate();
      
      // Métriques
      this.updateMetrics();
    };
  }

  /**
   * Traitement des données brutes
   */
  processRawData(sensorType, rawData, timestamp) {
    let processedData = { ...rawData, timestamp };

    // Application des offsets de calibration
    if (this.calibration.isCalibrated && this.calibration.offsets[sensorType]) {
      const offsets = this.calibration.offsets[sensorType];
      processedData.x -= offsets.x;
      processedData.y -= offsets.y;
      processedData.z -= offsets.z;
    }

    // Traitement spécifique par capteur
    switch (sensorType) {
      case 'accelerometer':
        processedData.magnitude = Math.sqrt(
          processedData.x ** 2 + processedData.y ** 2 + processedData.z ** 2
        );
        break;

      case 'magnetometer':
        processedData.magnitude = Math.sqrt(
          processedData.x ** 2 + processedData.y ** 2 + processedData.z ** 2
        );
        this.updateMagnetometerConfidence(processedData);
        break;

      case 'barometer':
        processedData.relativeAltitude = this.pressureToAltitude(
          processedData.pressure, 
          this.calibration.barometerBaseline
        );
        break;
    }

    return processedData;
  }

  /**
   * Mise à jour de la confiance du magnétomètre
   */
  updateMagnetometerConfidence(magnetometerData) {
    const buffer = this.sensorBuffers.magnetometer;
    if (buffer.length < this.config.magnetometerConfidenceWindow) return;

    // Analyse de la stabilité du champ magnétique
    const recentSamples = buffer.slice(-this.config.magnetometerConfidenceWindow);
    const magnitudes = recentSamples.map(s => s.magnitude);
    
    const mean = magnitudes.reduce((a, b) => a + b) / magnitudes.length;
    const variance = magnitudes.reduce((acc, val) => 
      acc + Math.pow(val - mean, 2), 0) / magnitudes.length;
    
    // Confiance basée sur stabilité et magnitude
    const stabilityFactor = Math.max(0, 1 - variance / 100);
    const magnitudeFactor = Math.min(1, mean / this.config.magneticInterferenceThreshold);
    
    this.calibration.magnetometerConfidence = stabilityFactor * magnitudeFactor;
  }

  /**
   * Adaptation dynamique du taux d'échantillonnage
   */
  adaptSampleRate() {
    const buffer = this.sensorBuffers.accelerometer;
    if (buffer.length < 10) return;

    // Analyse de l'activité récente
    const recentSamples = buffer.slice(-10);
    const accelerations = recentSamples.map(s => s.magnitude);
    const maxAcceleration = Math.max(...accelerations);
    const variance = this.calculateVariance(accelerations);

    let targetRate;
    
    if (this.energyManagement.isInLowPowerMode) {
      targetRate = this.config.ultraLowRate;
    } else if (maxAcceleration > this.config.motionThreshold || variance > 2.0) {
      targetRate = this.config.highRate;
    } else if (maxAcceleration < this.config.lowMotionThreshold && variance < 0.5) {
      targetRate = this.config.baseRate * 0.5;
    } else {
      targetRate = this.config.baseRate;
    }

    if (targetRate !== this.currentSampleRate) {
      this.currentSampleRate = targetRate;
      this.configureSensorRates();
      
      if (this.callbacks.onModeChanged) {
        this.callbacks.onModeChanged({
          sampleRate: targetRate,
          reason: maxAcceleration > this.config.motionThreshold ? 'motion' : 'stationary'
        });
      }
    }
  }

  /**
   * Gestion énergétique avancée
   */
  updateEnergyManagement() {
    const now = Date.now();
    const inactivityTime = now - this.energyManagement.lastActivityTime;

    // Détection d'activité
    const accData = this.currentData.accelerometer;
    if (accData.magnitude > this.config.lowMotionThreshold) {
      this.energyManagement.lastActivityTime = now;
      
      if (this.energyManagement.isInLowPowerMode) {
        this.exitLowPowerMode();
      }
    }

    // Passage en mode économie d'énergie
    if (inactivityTime > this.energyManagement.inactivityTimeout && 
        !this.energyManagement.isInLowPowerMode) {
      this.enterLowPowerMode();
    }

    // Mise à jour du niveau d'énergie simulé
    this.metrics.energyLevel = Math.max(0.1, 1.0 - (inactivityTime / 300000)); // 5 min
  }

  /**
   * Entrée en mode basse consommation
   */
  enterLowPowerMode() {
    console.log('Passage en mode basse consommation');
    this.energyManagement.isInLowPowerMode = true;

    // Désactivation capteurs moins critiques
    if (this.config.batteryOptimization) {
      this.disableSensor('magnetometer');
      this.disableSensor('barometer');
    }

    // Réduction drastique du taux d'échantillonnage
    this.currentSampleRate = this.config.ultraLowRate;
    this.configureSensorRates();

    if (this.callbacks.onEnergyStatusChanged) {
      this.callbacks.onEnergyStatusChanged({
        lowPowerMode: true,
        energyLevel: this.metrics.energyLevel
      });
    }
  }

  /**
   * Sortie du mode basse consommation
   */
  exitLowPowerMode() {
    console.log('Sortie du mode basse consommation');
    this.energyManagement.isInLowPowerMode = false;

    // Réactivation des capteurs
    this.enableSensor('magnetometer');
    this.enableSensor('barometer');

    // Restauration du taux normal
    this.currentSampleRate = this.config.baseRate;
    this.configureSensorRates();

    if (this.callbacks.onEnergyStatusChanged) {
      this.callbacks.onEnergyStatusChanged({
        lowPowerMode: false,
        energyLevel: this.metrics.energyLevel
      });
    }
  }

  /**
   * Désactivation d'un capteur
   */
  disableSensor(sensorType) {
    if (this.subscriptions[sensorType]) {
      this.subscriptions[sensorType].remove();
      this.subscriptions[sensorType] = null;
    }
    this.energyManagement.disabledSensors.add(sensorType);
    console.log(`Capteur ${sensorType} désactivé pour économie d'énergie`);
  }

  /**
   * Activation d'un capteur
   */
  async enableSensor(sensorType) {
    this.energyManagement.disabledSensors.delete(sensorType);
    
    try {
      switch (sensorType) {
        case 'magnetometer':
          this.subscriptions.magnetometer = Magnetometer.addListener(
            this.createDataHandler('magnetometer')
          );
          break;
                 case 'barometer':
           // Non disponible dans Expo
           console.warn('Baromètre non disponible dans Expo');
           break;
      }
      console.log(`Capteur ${sensorType} réactivé`);
    } catch (error) {
      console.warn(`Impossible de réactiver ${sensorType}:`, error);
    }
  }

  /**
   * Ajout au buffer avec gestion de taille
   */
  addToBuffer(sensorType, data) {
    const buffer = this.sensorBuffers[sensorType];
    buffer.push(data);
    
    // Taille adaptative selon le mode énergétique
    const maxSize = this.energyManagement.isInLowPowerMode ? 25 : 50;
    if (buffer.length > maxSize) {
      buffer.shift();
    }
  }

  /**
   * Conversion pression vers altitude relative
   */
  pressureToAltitude(pressure, baseline) {
    return 44330 * (1 - Math.pow(pressure / baseline, 0.1903));
  }

  /**
   * Calcul de variance
   */
  calculateVariance(data) {
    const mean = data.reduce((a, b) => a + b) / data.length;
    return data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
  }

  /**
   * Mise à jour des métriques de performance
   */
  updateMetrics() {
    this.metrics.samplesProcessed++;
    
    const now = Date.now();
    if (now - this.metrics.lastPerformanceCheck > 1000) {
      // Vérification performance chaque seconde
      this.metrics.lastPerformanceCheck = now;
      
      // Simulation du temps de traitement
      this.metrics.averageProcessingTime = Math.random() * 5; // ms
    }
  }

  /**
   * Obtenir les données actuelles avec méta-informations
   */
  getEnhancedData() {
    return {
      ...this.currentData,
      metadata: {
        sampleRate: this.currentSampleRate,
        isCalibrated: this.calibration.isCalibrated,
        magnetometerConfidence: this.calibration.magnetometerConfidence,
        energyLevel: this.metrics.energyLevel,
        lowPowerMode: this.energyManagement.isInLowPowerMode,
        disabledSensors: Array.from(this.energyManagement.disabledSensors)
      }
    };
  }

  /**
   * Notification de mise à jour des données
   */
  notifyDataUpdate() {
    if (this.callbacks.onDataUpdate) {
      this.callbacks.onDataUpdate(this.getEnhancedData());
    }
  }

  /**
   * Configuration des callbacks
   */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Arrêt de tous les capteurs
   */
  stopAll() {
    Object.values(this.subscriptions).forEach(subscription => {
      if (subscription) {
        subscription.remove();
      }
    });

    this.subscriptions = {
      accelerometer: null,
      gyroscope: null,
      magnetometer: null,
      barometer: null
    };

    this.isActive = false;
    console.log('Tous les capteurs avancés arrêtés');
  }

  /**
   * Obtenir l'état complet du gestionnaire
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isActive: this.isActive,
      currentSampleRate: this.currentSampleRate,
      calibration: { ...this.calibration },
      energyManagement: { ...this.energyManagement },
      metrics: { ...this.metrics },
      bufferSizes: Object.fromEntries(
        Object.entries(this.sensorBuffers).map(([key, buffer]) => [key, buffer.length])
      )
    };
  }
} 