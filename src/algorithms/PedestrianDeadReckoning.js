import { create, all } from 'mathjs';
import { OrientationCalibrator } from './OrientationCalibrator';

const math = create(all);

/**
 * Système de Pedestrian Dead Reckoning (PDR) avancé
 * Implémente la détection de pas, crawling, ZUPT, et classification d'activité
 */
export class PedestrianDeadReckoning {
  constructor(config = {}) {
    this.config = {
      // Paramètres de détection de pas adaptés pour poche
      stepDetectionWindow: config.stepDetectionWindow || 30, // 30 échantillons (augmenté)
      stepThreshold: config.stepThreshold || 1.0, // 1.0 m/s² (réduit pour plus de sensibilité)
      crawlThreshold: config.crawlThreshold || 1.0, // 1.0 m/s² (augmenté pour poche)
      crawlPitchThreshold: config.crawlPitchThreshold || 30, // degrés (sera retiré)
      
      // Paramètres de longueur de pas
      defaultStepLength: config.defaultStepLength || 0.7, // mètres
      heightRatio: config.heightRatio || 0.4, // ratio taille/longueur pas
      crawlSpeed: config.crawlSpeed || 0.3, // m/s
      
      // Paramètres ZUPT adaptés pour poche
      zuptThreshold: config.zuptThreshold || 0.1, // m/s²
      zuptDuration: config.zuptDuration || 300, // 300ms (augmenté pour éviter micro-mouvements)
      
      // Échantillonnage adaptatif
      baseSampleRate: config.baseSampleRate || 25, // Hz
      highSampleRate: config.highSampleRate || 100, // Hz
      motionThreshold: config.motionThreshold || 2.0, // m/s²
      
      ...config
    };

    // État du système
    this.currentMode = 'stationary'; // stationary, walking, crawling, running
    this.currentSampleRate = this.config.baseSampleRate;
    this.lastStepTime = 0;
    this.stepCount = 0;
    this.crawlDistance = 0;
    
    // Buffers pour analyse
    this.accelerationBuffer = [];
    this.gyroscopeBuffer = [];
    this.magnetometerBuffer = [];
    this.barometerBuffer = [];
    
    // État ZUPT
    this.isZUPT = false;
    this.zuptStartTime = 0;
    
    // Classification d'activité
    this.activityFeatures = {
      accelerationVariance: 0,
      devicePitch: 0,
      deviceRoll: 0,
      stepFrequency: 0,
      peakAmplitude: 0
    };
    
    // Calibration utilisateur
    this.userHeight = 1.7; // mètres par défaut
    this.dynamicStepLength = this.config.defaultStepLength;
    
    // Calibrateur d'orientation pour poche
    this.orientationCalibrator = new OrientationCalibrator({
      calibrationDuration: 2000, // 2 secondes
      samplesRequired: 50,
      gravityThreshold: 0.5
    });
    
    // Callbacks
    this.onStepDetected = null;
    this.onModeChanged = null;
    this.onPositionUpdate = null;
    
    // Position et orientation
    this.position = { x: 0, y: 0, z: 0 };
    this.orientation = { pitch: 0, roll: 0, yaw: 0 };
    this.velocity = { vx: 0, vy: 0, vz: 0 };
  }

  /**
   * Initialisation avec paramètres utilisateur
   */
  initialize(userHeight = 1.7) {
    this.userHeight = userHeight;
    this.dynamicStepLength = userHeight * this.config.heightRatio;
    console.log(`PDR initialisé - Taille: ${userHeight}m, Longueur pas: ${this.dynamicStepLength.toFixed(2)}m`);
  }

  /**
   * Démarrage de la calibration d'orientation pour poche
   */
  startPocketCalibration() {
    this.orientationCalibrator.startCalibration();
  }

  /**
   * Traitement principal des données de capteurs
   */
  processSensorData(sensorData) {
    const { accelerometer, gyroscope, magnetometer, barometer } = sensorData;
    
    // Phase de calibration si nécessaire
    if (this.orientationCalibrator.isCalibrating) {
      const calibrated = this.orientationCalibrator.addCalibrationSample(accelerometer, gyroscope);
      if (calibrated) {
        console.log('Calibration d\'orientation terminée');
      }
      return; // Ne pas traiter pendant la calibration
    }
    
    // Transformation des données capteurs selon calibration
    const transformedAcc = this.orientationCalibrator.transformAcceleration(accelerometer);
    const transformedGyro = this.orientationCalibrator.transformGyroscope(gyroscope);
    
    // Ajout aux buffers avec données transformées
    this.updateBuffers(transformedAcc, transformedGyro, magnetometer, barometer);
    
    // Classification d'activité
    this.classifyActivity();
    
    // Adaptation du taux d'échantillonnage
    this.adaptSampleRate();
    
    // Détection de pas/crawling selon le mode
    if (this.currentMode === 'walking' || this.currentMode === 'running') {
      this.detectSteps();
    } else if (this.currentMode === 'crawling') {
      this.processCrawling();
    }
    
    // Zero-Velocity Updates
    this.processZUPT();
    
    // Mise à jour de la position
    this.updatePosition();
    
    // Callback de mise à jour
    if (this.onPositionUpdate) {
      this.onPositionUpdate(
        this.position.x,
        this.position.y,
        this.orientation.yaw,
        this.currentMode
      );
    }
  }

  /**
   * Mise à jour des buffers de données
   */
  updateBuffers(acc, gyro, mag, baro) {
    const maxBufferSize = Math.max(this.config.stepDetectionWindow, 50);
    
    // Buffer accéléromètre
    this.accelerationBuffer.push({
      ...acc,
      magnitude: Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z),
      timestamp: Date.now()
    });
    if (this.accelerationBuffer.length > maxBufferSize) {
      this.accelerationBuffer.shift();
    }
    
    // Buffer gyroscope
    this.gyroscopeBuffer.push({
      ...gyro,
      timestamp: Date.now()
    });
    if (this.gyroscopeBuffer.length > maxBufferSize) {
      this.gyroscopeBuffer.shift();
    }
    
    // Buffer magnétomètre
    if (mag) {
      this.magnetometerBuffer.push({
        ...mag,
        timestamp: Date.now()
      });
      if (this.magnetometerBuffer.length > maxBufferSize) {
        this.magnetometerBuffer.shift();
      }
    }
    
    // Buffer baromètre
    if (baro) {
      this.barometerBuffer.push({
        pressure: baro.pressure,
        altitude: this.pressureToAltitude(baro.pressure),
        timestamp: Date.now()
      });
      if (this.barometerBuffer.length > maxBufferSize) {
        this.barometerBuffer.shift();
      }
    }
  }

  /**
   * Classification d'activité adaptée pour usage en poche (sans dépendance à l'inclinaison)
   */
  classifyActivity() {
    if (this.accelerationBuffer.length < this.config.stepDetectionWindow) return;
    
    // Calcul des caractéristiques basées sur la magnitude uniquement
    const recentAcc = this.accelerationBuffer.slice(-this.config.stepDetectionWindow);
    
    // Variance de l'accélération (magnitude)
    const accMagnitudes = recentAcc.map(a => a.magnitude);
    const meanAcc = accMagnitudes.reduce((a, b) => a + b) / accMagnitudes.length;
    this.activityFeatures.accelerationVariance = accMagnitudes.reduce((acc, val) => 
      acc + Math.pow(val - meanAcc, 2), 0) / accMagnitudes.length;
    
    // Garde les angles pour information mais ne les utilise plus pour la classification
    const lastAcc = recentAcc[recentAcc.length - 1];
    this.activityFeatures.devicePitch = Math.atan2(-lastAcc.x, 
      Math.sqrt(lastAcc.y * lastAcc.y + lastAcc.z * lastAcc.z)) * 180 / Math.PI;
    this.activityFeatures.deviceRoll = Math.atan2(lastAcc.y, lastAcc.z) * 180 / Math.PI;
    
    // Fréquence des pics basée sur magnitude
    const peaks = this.detectPeaks(accMagnitudes);
    this.activityFeatures.stepFrequency = peaks.length / (this.config.stepDetectionWindow / this.currentSampleRate);
    this.activityFeatures.peakAmplitude = peaks.length > 0 ? Math.max(...peaks) : 0;
    
    // Classification par arbre de décision MODIFIÉ pour poche
    const previousMode = this.currentMode;
    
    // Nouveau modèle indifférent à l'angle du téléphone
    if (this.activityFeatures.accelerationVariance < 0.3) {
      // Stationnaire : variance très stricte
      this.currentMode = 'stationary';
    } else if (this.activityFeatures.accelerationVariance >= 0.3 && 
               this.activityFeatures.accelerationVariance < 0.8 && 
               this.activityFeatures.stepFrequency < 1.0) {
      // Crawling : variance modérée + fréquence faible
      this.currentMode = 'crawling';
    } else if (this.activityFeatures.stepFrequency >= 1.0 && 
               this.activityFeatures.stepFrequency < 2.5) {
      // Walking : fréquence normale
      this.currentMode = 'walking';
    } else if (this.activityFeatures.stepFrequency >= 2.5) {
      // Running : fréquence élevée
      this.currentMode = 'running';
    } else {
      // Mode par défaut si conditions ambiguës
      this.currentMode = 'walking';
    }
    
    // Notification changement de mode
    if (previousMode !== this.currentMode && this.onModeChanged) {
      this.onModeChanged(this.currentMode, this.activityFeatures);
    }
  }

  /**
   * Détection de pics pour les pas
   */
  detectPeaks(data, threshold = null) {
    if (!threshold) {
      const mean = data.reduce((a, b) => a + b) / data.length;
      const std = Math.sqrt(data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length);
      threshold = mean + std;
    }
    
    const peaks = [];
    for (let i = 1; i < data.length - 1; i++) {
      if (data[i] > data[i - 1] && data[i] > data[i + 1] && data[i] > threshold) {
        peaks.push(data[i]);
      }
    }
    return peaks;
  }

  /**
   * Détection de pas basée sur la magnitude (adaptée pour poche)
   */
  detectSteps() {
    if (this.accelerationBuffer.length < this.config.stepDetectionWindow) return;
    
    // Analyse basée sur la magnitude totale (indépendante de l'orientation)
    const recentData = this.accelerationBuffer.slice(-this.config.stepDetectionWindow);
    const magnitudeAcc = recentData.map(d => d.magnitude);
    
    // Détection de pics sur la magnitude
    const threshold = this.currentMode === 'running' ? 
      this.config.stepThreshold * 1.5 : this.config.stepThreshold;
    const peaks = this.detectPeaks(magnitudeAcc, threshold);
    
    const now = Date.now();
    if (peaks.length > 0 && (now - this.lastStepTime) > 300) { // Minimum 300ms entre pas
      this.stepCount++;
      this.lastStepTime = now;
      
      // Estimation dynamique de la longueur de pas
      this.updateDynamicStepLength(peaks[peaks.length - 1]);
      
      // Callback pas détecté
      if (this.onStepDetected) {
        this.onStepDetected(this.stepCount, this.dynamicStepLength);
      }
    }
  }

  /**
   * Traitement du crawling
   */
  processCrawling() {
    if (this.accelerationBuffer.length < 2) return;
    
    const lastAcc = this.accelerationBuffer[this.accelerationBuffer.length - 1];
    const prevAcc = this.accelerationBuffer[this.accelerationBuffer.length - 2];
    
    const dt = (lastAcc.timestamp - prevAcc.timestamp) / 1000;
    const accChange = Math.abs(lastAcc.magnitude - prevAcc.magnitude);
    
    if (accChange > 0.5) { // Mouvement de crawling détecté
      this.crawlDistance += this.config.crawlSpeed * dt;
    }
  }

  /**
   * Mise à jour dynamique de la longueur de pas
   */
  updateDynamicStepLength(peakAmplitude) {
    // Modèle adaptatif basé sur l'amplitude du pic
    const baseLength = this.userHeight * this.config.heightRatio;
    const amplitudeFactor = Math.min(Math.max(peakAmplitude / 12.0, 0.8), 1.2);
    
    // Lissage exponentiel
    const alpha = 0.1;
    this.dynamicStepLength = (1 - alpha) * this.dynamicStepLength + 
                            alpha * (baseLength * amplitudeFactor);
  }

  /**
   * Zero-Velocity Updates (ZUPT)
   */
  processZUPT() {
    if (this.accelerationBuffer.length < 5) return;
    
    // Vérification de la stabilité
    const recentAcc = this.accelerationBuffer.slice(-5);
    const variance = this.calculateVariance(recentAcc.map(a => a.magnitude));
    
    const now = Date.now();
    
    if (variance < this.config.zuptThreshold) {
      if (!this.isZUPT) {
        this.isZUPT = true;
        this.zuptStartTime = now;
      } else if ((now - this.zuptStartTime) > this.config.zuptDuration) {
        // Appliquer ZUPT - réinitialiser la vitesse
        this.velocity.vx *= 0.1;
        this.velocity.vy *= 0.1;
        this.velocity.vz *= 0.1;
      }
    } else {
      this.isZUPT = false;
    }
  }

  /**
   * Adaptation du taux d'échantillonnage
   */
  adaptSampleRate() {
    if (this.accelerationBuffer.length < 5) return;
    
    const recentAcc = this.accelerationBuffer.slice(-5);
    const maxAcceleration = Math.max(...recentAcc.map(a => a.magnitude));
    
    const targetRate = maxAcceleration > this.config.motionThreshold ? 
      this.config.highSampleRate : this.config.baseSampleRate;
    
    if (targetRate !== this.currentSampleRate) {
      this.currentSampleRate = targetRate;
      console.log(`Taux échantillonnage adapté: ${this.currentSampleRate} Hz`);
    }
  }

  /**
   * Mise à jour de la position basée sur PDR
   */
  updatePosition() {
    if (this.accelerationBuffer.length < 2 || this.gyroscopeBuffer.length < 2) return;
    
    const lastAcc = this.accelerationBuffer[this.accelerationBuffer.length - 1];
    const prevAcc = this.accelerationBuffer[this.accelerationBuffer.length - 2];
    const lastGyro = this.gyroscopeBuffer[this.gyroscopeBuffer.length - 1];
    
    const dt = (lastAcc.timestamp - prevAcc.timestamp) / 1000;
    
    // Mise à jour orientation
    this.orientation.yaw += lastGyro.z * dt;
    this.orientation.pitch += lastGyro.x * dt;
    this.orientation.roll += lastGyro.y * dt;
    
    // Mise à jour position selon le mode
    if (this.currentMode === 'walking' || this.currentMode === 'running') {
      // Utiliser les pas détectés
      const stepDistance = this.dynamicStepLength;
      this.position.x += stepDistance * Math.cos(this.orientation.yaw);
      this.position.y += stepDistance * Math.sin(this.orientation.yaw);
    } else if (this.currentMode === 'crawling') {
      // Utiliser le modèle de crawling
      const crawlStep = this.config.crawlSpeed * dt;
      this.position.x += crawlStep * Math.cos(this.orientation.yaw);
      this.position.y += crawlStep * Math.sin(this.orientation.yaw);
    }
    
    // Mise à jour altitude avec baromètre
    if (this.barometerBuffer.length >= 2) {
      const lastBaro = this.barometerBuffer[this.barometerBuffer.length - 1];
      const prevBaro = this.barometerBuffer[this.barometerBuffer.length - 2];
      const altitudeChange = lastBaro.altitude - prevBaro.altitude;
      
      if (Math.abs(altitudeChange) < 2.0) { // Filtre aberrations
        this.position.z += altitudeChange;
      }
    }
  }

  /**
   * Conversion pression vers altitude
   */
  pressureToAltitude(pressure, seaLevelPressure = 1013.25) {
    return 44330 * (1 - Math.pow(pressure / seaLevelPressure, 0.1903));
  }

  /**
   * Calcul de variance
   */
  calculateVariance(data) {
    const mean = data.reduce((a, b) => a + b) / data.length;
    return data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
  }

  /**
   * Réinitialisation de la position
   */
  resetPosition(x = 0, y = 0, z = 0, yaw = 0) {
    this.position = { x, y, z };
    this.orientation.yaw = yaw;
    this.stepCount = 0;
    this.crawlDistance = 0;
    console.log(`Position PDR réinitialisée: (${x}, ${y}, ${z})`);
  }

  /**
   * Obtenir l'état actuel
   */
  getState() {
    return {
      position: { ...this.position },
      orientation: { ...this.orientation },
      velocity: { ...this.velocity },
      mode: this.currentMode,
      stepCount: this.stepCount,
      crawlDistance: this.crawlDistance,
      features: { ...this.activityFeatures },
      sampleRate: this.currentSampleRate,
      isZUPT: this.isZUPT,
      // Ajout état calibration
      calibration: this.orientationCalibrator.getStatus()
    };
  }

  /**
   * Configuration des callbacks de calibration
   */
  setCalibrationCallbacks({ onProgress, onComplete }) {
    this.orientationCalibrator.setCallbacks({ onProgress, onComplete });
  }

  /**
   * Vérifier si la calibration est nécessaire ou en cours
   */
  needsCalibration() {
    return !this.orientationCalibrator.isCalibrated;
  }

  /**
   * Réinitialiser la calibration
   */
  resetCalibration() {
    this.orientationCalibrator.reset();
  }

  /**
   * Configuration des callbacks
   */
  setCallbacks({ onStepDetected, onModeChanged, onPositionUpdate }) {
    this.onStepDetected = onStepDetected;
    this.onModeChanged = onModeChanged;
    this.onPositionUpdate = onPositionUpdate;
  }
} 