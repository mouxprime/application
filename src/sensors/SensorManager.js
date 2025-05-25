import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';

/**
 * Gestionnaire des capteurs pour la localisation intérieure
 * Collecte et traite les données IMU (accéléromètre, gyroscope, magnétomètre)
 */
export class SensorManager {
  constructor(config = {}) {
    this.config = {
      updateInterval: config.updateInterval || 20, // 50Hz par défaut
      smoothingFactor: config.smoothingFactor || 0.8,
      calibrationSamples: config.calibrationSamples || 100,
      ...config
    };

    // État des capteurs
    this.isInitialized = false;
    this.isCalibrated = false;
    this.isActive = false;

    // Abonnements aux capteurs
    this.accelerometerSubscription = null;
    this.gyroscopeSubscription = null;
    this.magnetometerSubscription = null;

    // Données actuelles
    this.currentData = {
      accelerometer: { x: 0, y: 0, z: 0, timestamp: 0 },
      gyroscope: { x: 0, y: 0, z: 0, timestamp: 0 },
      magnetometer: { x: 0, y: 0, z: 0, timestamp: 0 }
    };

    // Données brutes pour calibration
    this.rawData = {
      accelerometer: [],
      gyroscope: [],
      magnetometer: []
    };

    // Offsets de calibration
    this.calibrationOffsets = {
      accelerometer: { x: 0, y: 0, z: 0 },
      gyroscope: { x: 0, y: 0, z: 0 },
      magnetometer: { x: 0, y: 0, z: 0 }
    };

    // Filtres de lissage
    this.smoothedData = {
      accelerometer: { x: 0, y: 0, z: 0 },
      gyroscope: { x: 0, y: 0, z: 0 },
      magnetometer: { x: 0, y: 0, z: 0 }
    };

    // Callbacks
    this.onDataUpdate = null;
    this.onCalibrationProgress = null;
  }

  /**
   * Initialisation du gestionnaire de capteurs
   */
  async initialize() {
    try {
      // Vérification de la disponibilité des capteurs
      const accelerometerAvailable = await Accelerometer.isAvailableAsync();
      const gyroscopeAvailable = await Gyroscope.isAvailableAsync();
      const magnetometerAvailable = await Magnetometer.isAvailableAsync();

      if (!accelerometerAvailable) {
        throw new Error('Accéléromètre non disponible');
      }
      if (!gyroscopeAvailable) {
        throw new Error('Gyroscope non disponible');
      }
      if (!magnetometerAvailable) {
        console.warn('Magnétomètre non disponible - localisation dégradée');
      }

      // Configuration des intervalles de mise à jour
      Accelerometer.setUpdateInterval(this.config.updateInterval);
      Gyroscope.setUpdateInterval(this.config.updateInterval);
      if (magnetometerAvailable) {
        Magnetometer.setUpdateInterval(this.config.updateInterval);
      }

      this.isInitialized = true;
      console.log('Gestionnaire de capteurs initialisé');
      return true;

    } catch (error) {
      console.error('Erreur initialisation capteurs:', error);
      return false;
    }
  }

  /**
   * Démarrage de la collecte de données
   */
  async startAll() {
    if (!this.isInitialized) {
      throw new Error('Gestionnaire non initialisé');
    }

    try {
      // Démarrage de l'accéléromètre
      this.accelerometerSubscription = Accelerometer.addListener(this.handleAccelerometerData.bind(this));

      // Démarrage du gyroscope
      this.gyroscopeSubscription = Gyroscope.addListener(this.handleGyroscopeData.bind(this));

      // Démarrage du magnétomètre (si disponible)
      const magnetometerAvailable = await Magnetometer.isAvailableAsync();
      if (magnetometerAvailable) {
        this.magnetometerSubscription = Magnetometer.addListener(this.handleMagnetometerData.bind(this));
      }

      this.isActive = true;
      console.log('Capteurs démarrés');

    } catch (error) {
      console.error('Erreur démarrage capteurs:', error);
      this.stopAll();
    }
  }

  /**
   * Arrêt de la collecte de données
   */
  stopAll() {
    if (this.accelerometerSubscription) {
      this.accelerometerSubscription.remove();
      this.accelerometerSubscription = null;
    }

    if (this.gyroscopeSubscription) {
      this.gyroscopeSubscription.remove();
      this.gyroscopeSubscription = null;
    }

    if (this.magnetometerSubscription) {
      this.magnetometerSubscription.remove();
      this.magnetometerSubscription = null;
    }

    this.isActive = false;
    console.log('Capteurs arrêtés');
  }

  /**
   * Traitement des données d'accéléromètre
   */
  handleAccelerometerData(data) {
    const timestamp = Date.now();
    const corrected = this.applyCalibratedOffsets('accelerometer', data);
    const smoothed = this.applySmoothing('accelerometer', corrected);

    this.currentData.accelerometer = {
      ...smoothed,
      timestamp
    };

    this.smoothedData.accelerometer = smoothed;
    this.notifyDataUpdate();
  }

  /**
   * Traitement des données de gyroscope
   */
  handleGyroscopeData(data) {
    const timestamp = Date.now();
    const corrected = this.applyCalibratedOffsets('gyroscope', data);
    const smoothed = this.applySmoothing('gyroscope', corrected);

    this.currentData.gyroscope = {
      ...smoothed,
      timestamp
    };

    this.smoothedData.gyroscope = smoothed;
    this.notifyDataUpdate();
  }

  /**
   * Traitement des données de magnétomètre
   */
  handleMagnetometerData(data) {
    const timestamp = Date.now();
    const corrected = this.applyCalibratedOffsets('magnetometer', data);
    const smoothed = this.applySmoothing('magnetometer', corrected);

    this.currentData.magnetometer = {
      ...smoothed,
      timestamp
    };

    this.smoothedData.magnetometer = smoothed;
    this.notifyDataUpdate();
  }

  /**
   * Application du lissage exponentiel
   */
  applySmoothing(sensorType, newData) {
    const alpha = 1 - this.config.smoothingFactor;
    const currentSmoothed = this.smoothedData[sensorType];

    return {
      x: currentSmoothed.x * this.config.smoothingFactor + newData.x * alpha,
      y: currentSmoothed.y * this.config.smoothingFactor + newData.y * alpha,
      z: currentSmoothed.z * this.config.smoothingFactor + newData.z * alpha
    };
  }

  /**
   * Application des offsets de calibration
   */
  applyCalibratedOffsets(sensorType, data) {
    const offsets = this.calibrationOffsets[sensorType];
    return {
      x: data.x - offsets.x,
      y: data.y - offsets.y,
      z: data.z - offsets.z
    };
  }

  /**
   * Calibration des capteurs (à faire au repos)
   */
  async startCalibration(progressCallback) {
    this.isCalibrated = false;
    this.onCalibrationProgress = progressCallback;
    
    // Réinitialisation des données de calibration
    this.rawData = {
      accelerometer: [],
      gyroscope: [],
      magnetometer: []
    };

    console.log('Début de calibration - restez immobile...');

    // Collecte des échantillons pendant la calibration
    const calibrationInterval = setInterval(() => {
      if (this.currentData.accelerometer.timestamp > 0) {
        this.rawData.accelerometer.push({ ...this.currentData.accelerometer });
      }
      if (this.currentData.gyroscope.timestamp > 0) {
        this.rawData.gyroscope.push({ ...this.currentData.gyroscope });
      }
      if (this.currentData.magnetometer.timestamp > 0) {
        this.rawData.magnetometer.push({ ...this.currentData.magnetometer });
      }

      const progress = Math.min(
        this.rawData.accelerometer.length / this.config.calibrationSamples,
        1
      );

      if (this.onCalibrationProgress) {
        this.onCalibrationProgress(progress);
      }

      if (this.rawData.accelerometer.length >= this.config.calibrationSamples) {
        clearInterval(calibrationInterval);
        this.computeCalibrationOffsets();
      }
    }, 50);
  }

  /**
   * Calcul des offsets de calibration
   */
  computeCalibrationOffsets() {
    // Calcul des moyennes pour chaque capteur
    ['accelerometer', 'gyroscope', 'magnetometer'].forEach(sensorType => {
      const data = this.rawData[sensorType];
      if (data.length === 0) return;

      const sum = data.reduce((acc, sample) => ({
        x: acc.x + sample.x,
        y: acc.y + sample.y,
        z: acc.z + sample.z
      }), { x: 0, y: 0, z: 0 });

      const offsets = {
        x: sum.x / data.length,
        y: sum.y / data.length,
        z: sum.z / data.length
      };

      // Pour l'accéléromètre, on s'attend à ~9.81 sur l'axe Z au repos
      if (sensorType === 'accelerometer') {
        offsets.z -= 9.81;
      }

      this.calibrationOffsets[sensorType] = offsets;
    });

    this.isCalibrated = true;
    console.log('Calibration terminée:', this.calibrationOffsets);

    if (this.onCalibrationProgress) {
      this.onCalibrationProgress(1, true); // 100% + terminé
    }
  }

  /**
   * Détection de mouvement basée sur l'accélération
   */
  isMoving(threshold = 0.5) {
    if (!this.currentData.accelerometer.timestamp) return false;

    const acc = this.currentData.accelerometer;
    const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    
    // Magnitude sans la gravité (environ 9.81)
    const netAcceleration = Math.abs(magnitude - 9.81);
    
    return netAcceleration > threshold;
  }

  /**
   * Estimation de l'orientation à partir du magnétomètre
   */
  getCompassHeading() {
    if (!this.currentData.magnetometer.timestamp) return null;

    const mag = this.currentData.magnetometer;
    const heading = Math.atan2(mag.y, mag.x);
    
    // Conversion en degrés et normalisation 0-360
    let degrees = heading * 180 / Math.PI;
    if (degrees < 0) degrees += 360;
    
    return degrees;
  }

  /**
   * Détection de rotation rapide
   */
  isRotating(threshold = 0.2) {
    if (!this.currentData.gyroscope.timestamp) return false;

    const gyro = this.currentData.gyroscope;
    const rotationMagnitude = Math.sqrt(
      gyro.x * gyro.x + gyro.y * gyro.y + gyro.z * gyro.z
    );
    
    return rotationMagnitude > threshold;
  }

  /**
   * Obtenir les dernières données de capteurs
   */
  getLatestData() {
    return {
      accelerometer: { ...this.currentData.accelerometer },
      gyroscope: { ...this.currentData.gyroscope },
      magnetometer: { ...this.currentData.magnetometer },
      isMoving: this.isMoving(),
      isRotating: this.isRotating(),
      compassHeading: this.getCompassHeading(),
      isCalibrated: this.isCalibrated
    };
  }

  /**
   * Obtenir les données actuelles simples (pour AttitudeService)
   */
  getCurrentData() {
    return {
      accelerometer: { ...this.currentData.accelerometer },
      gyroscope: { ...this.currentData.gyroscope },
      magnetometer: { ...this.currentData.magnetometer }
    };
  }

  /**
   * Obtenir les données brutes (non filtrées)
   */
  getRawData() {
    return {
      accelerometer: { ...this.currentData.accelerometer },
      gyroscope: { ...this.currentData.gyroscope },
      magnetometer: { ...this.currentData.magnetometer }
    };
  }

  /**
   * Notification de mise à jour des données
   */
  notifyDataUpdate() {
    if (this.onDataUpdate) {
      this.onDataUpdate(this.getLatestData());
    }
  }

  /**
   * Configuration d'un callback de mise à jour
   */
  setDataUpdateCallback(callback) {
    this.onDataUpdate = callback;
  }

  /**
   * Obtenir les statistiques des capteurs
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      isActive: this.isActive,
      isCalibrated: this.isCalibrated,
      calibrationOffsets: { ...this.calibrationOffsets },
      updateInterval: this.config.updateInterval
    };
  }

  /**
   * Vérification si le gestionnaire est actif
   */
  getIsActive() {
    return this.isActive;
  }

  /**
   * Réinitialisation de la calibration
   */
  resetCalibration() {
    this.isCalibrated = false;
    this.calibrationOffsets = {
      accelerometer: { x: 0, y: 0, z: 0 },
      gyroscope: { x: 0, y: 0, z: 0 },
      magnetometer: { x: 0, y: 0, z: 0 }
    };
    console.log('Calibration réinitialisée');
  }
} 