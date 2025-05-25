import { PedestrianDeadReckoning } from './PedestrianDeadReckoning';
import { AdvancedExtendedKalmanFilter } from './AdvancedEKF';
import { AdvancedSensorManager } from '../sensors/AdvancedSensorManager';
import { create, all } from 'mathjs';

const math = create(all);

/**
 * SDK de localisation intérieure modulaire
 * Interface simple pour la navigation dans les catacombes et environnements confinés
 */
export class LocalizationSDK {
  constructor(config = {}) {
    this.config = {
      // Configuration PDR
      userHeight: config.userHeight || 1.7,
      stepLength: config.stepLength || 0.7,
      
      // Configuration EKF
      processNoise: config.processNoise || 0.1,
      measurementNoise: config.measurementNoise || 0.3,
      mapMatchingEnabled: config.mapMatchingEnabled || true,
      
      // Configuration capteurs
      adaptiveSampling: config.adaptiveSampling || true,
      energyOptimization: config.energyOptimization || true,
      baseUpdateRate: config.baseUpdateRate || 25,
      
      // Configuration callbacks
      positionUpdateRate: config.positionUpdateRate || 1.0, // Hz
      
      ...config
    };

    // Composants principaux
    this.pdr = new PedestrianDeadReckoning({
      defaultStepLength: this.config.stepLength,
      heightRatio: 0.4,
      baseSampleRate: this.config.baseUpdateRate,
      highSampleRate: 100,
      ...config.pdr
    });

    this.ekf = new AdvancedExtendedKalmanFilter({
      processNoiseWalking: this.config.processNoise,
      processNoiseCrawling: this.config.processNoise * 0.5,
      processNoiseStationary: this.config.processNoise * 0.1,
      mapMatchingThreshold: 2.0,
      mapMatchingWeight: 0.5,
      ...config.ekf
    });

    this.sensorManager = new AdvancedSensorManager({
      baseRate: this.config.baseUpdateRate,
      highRate: 100,
      adaptiveSampling: this.config.adaptiveSampling,
      batteryOptimization: this.config.energyOptimization,
      ...config.sensors
    });

    // État du SDK
    this.isInitialized = false;
    this.isTracking = false;
    this.vectorMap = null;
    
    // État de localisation
    this.currentState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { theta: 0 },
      mode: 'stationary',
      confidence: 0,
      stepCount: 0,
      distance: 0
    };

    // Callbacks utilisateur
    this.callbacks = {
      onPositionUpdate: null,
      onModeChanged: null,
      onCalibrationRequired: null,
      onEnergyStatusChanged: null
    };

    // Timer pour les callbacks utilisateur
    this.updateTimer = null;
    this.lastUserUpdate = 0;

    // Métriques de performance
    this.performance = {
      processingTime: 0,
      updateCount: 0,
      lastBenchmark: Date.now()
    };

    this.setupInternalCallbacks();
  }

  /**
   * Initialisation du SDK
   */
  async initialize(vectorMap = null) {
    try {
      console.log('Initialisation du SDK de localisation...');

      // Initialisation des composants
      await this.sensorManager.initialize();
      this.pdr.initialize(this.config.userHeight);

      // Chargement de la carte vectorielle
      if (vectorMap) {
        this.loadVectorMap(vectorMap);
      }

      // Configuration des callbacks internes
      this.setupInternalCallbacks();

      this.isInitialized = true;
      console.log('SDK de localisation initialisé avec succès');
      return true;

    } catch (error) {
      console.error('Erreur initialisation SDK:', error);
      return false;
    }
  }

  /**
   * Chargement d'une carte vectorielle
   */
  loadVectorMap(mapData) {
    this.vectorMap = mapData;
    this.ekf.setVectorMap(mapData);
    console.log(`Carte vectorielle chargée: ${mapData.name}`);
  }

  /**
   * Démarrage du tracking avec vérification de calibration
   */
  async startTracking(pocketCalibrationMatrix = null) {
    if (!this.isInitialized) {
      throw new Error('SDK non initialisé');
    }

    try {
      // Vérifier si une calibration d'orientation valide existe
      if (pocketCalibrationMatrix && this.isPocketCalibrationValid(pocketCalibrationMatrix)) {
        console.log('Utilisation de la calibration d\'orientation existante');
        // Appliquer la matrice de rotation au calibrateur d'orientation
        this.pdr.orientationCalibrator.rotationMatrix = pocketCalibrationMatrix;
        this.pdr.orientationCalibrator.isCalibrated = true;
      } else if (this.pdr.needsCalibration()) {
        // Calibration automatique si nécessaire
        console.log('Démarrage calibration d\'orientation pour usage en poche...');
        this.pdr.startPocketCalibration();
        
        // Callbacks pour suivre la progression
        this.pdr.setCalibrationCallbacks({
          onProgress: (progress, message) => {
            console.log(`Calibration: ${(progress * 100).toFixed(0)}% - ${message}`);
            if (this.callbacks.onCalibrationRequired) {
              this.callbacks.onCalibrationRequired({ progress, message, isCalibrating: true });
            }
          },
          onComplete: (rotationMatrix, avgGravity) => {
            console.log('Calibration d\'orientation terminée avec succès');
            console.log('Matrice de rotation calculée:', rotationMatrix);
            if (this.callbacks.onCalibrationRequired) {
              this.callbacks.onCalibrationRequired({ 
                progress: 1.0, 
                message: 'Calibration terminée', 
                isCalibrating: false,
                isComplete: true 
              });
            }
          }
        });
      }

      // Démarrage des capteurs
      await this.sensorManager.startAll();

      // Configuration du timer de mise à jour utilisateur
      this.startUserUpdateTimer();

      this.isTracking = true;
      console.log('Tracking démarré');

      return true;
    } catch (error) {
      console.error('Erreur démarrage tracking:', error);
      return false;
    }
  }

  /**
   * Arrêt du tracking
   */
  stopTracking() {
    this.isTracking = false;
    this.sensorManager.stopAll();
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    console.log('Tracking arrêté');
  }

  /**
   * Configuration des callbacks internes entre composants
   */
  setupInternalCallbacks() {
    // Callbacks PDR
    this.pdr.setCallbacks({
      onStepDetected: (stepCount, stepLength) => {
        this.currentState.stepCount = stepCount;
        this.performance.updateCount++;
      },
      onModeChanged: (mode, features) => {
        this.currentState.mode = mode;
        this.ekf.updateProcessNoise(mode);
        
        if (this.callbacks.onModeChanged) {
          this.callbacks.onModeChanged(mode, features);
        }
      },
      onPositionUpdate: (x, y, theta, mode) => {
        // Mise à jour via PDR - sera fusionnée dans l'EKF
      }
    });

    // Callbacks gestionnaire de capteurs
    this.sensorManager.setCallbacks({
      onDataUpdate: (sensorData) => {
        this.processSensorUpdate(sensorData);
      },
      onModeChanged: (modeInfo) => {
        console.log('Taux échantillonnage adapté:', modeInfo);
      },
      onEnergyStatusChanged: (energyStatus) => {
        if (this.callbacks.onEnergyStatusChanged) {
          this.callbacks.onEnergyStatusChanged(energyStatus);
        }
      }
    });
  }

  /**
   * Traitement principal des mises à jour de capteurs
   */
  processSensorUpdate(sensorData) {
    if (!this.isTracking) return;

    const startTime = performance.now();

    try {
      // 1. Traitement PDR
      this.pdr.processSensorData(sensorData);
      const pdrState = this.pdr.getState();

      // 2. Calcul des incréments de mouvement
      const pdrIncrement = this.calculatePDRIncrement(pdrState);

      // 3. Prédiction EKF avec incréments PDR
      const now = Date.now();
      const dt = (now - this.ekf.lastUpdate) / 1000;
      this.ekf.lastUpdate = now;

      if (dt > 0 && dt < 1) {
        this.ekf.predict(dt, pdrIncrement);

        // 4. Mise à jour avec capteurs
        this.updateEKFWithSensors(sensorData);

        // 5. Application ZUPT si nécessaire avec protection contre la boucle
        if (pdrState.isZUPT && !this.ekf.zuptActive) {
          // Seulement si ZUPT n'est pas déjà actif
          this.ekf.applyZUPT();
        } else if (!pdrState.isZUPT && this.ekf.zuptActive) {
          // Seulement si ZUPT était actif et ne doit plus l'être
          this.ekf.deactivateZUPT();
        }

        // 6. Mise à jour de l'état global
        this.updateCurrentState(pdrState);
      }

    } catch (error) {
      console.warn('Erreur traitement capteurs:', error);
    }

    // Mesure de performance
    const processingTime = performance.now() - startTime;
    this.updatePerformanceMetrics(processingTime);
  }

  /**
   * Calcul des incréments de mouvement PDR
   */
  calculatePDRIncrement(pdrState) {
    const currentPos = this.currentState.position;
    const newPos = pdrState.position;
    const currentTheta = this.currentState.orientation.theta;
    const newTheta = pdrState.orientation.yaw;

    return {
      dx: newPos.x - currentPos.x,
      dy: newPos.y - currentPos.y,
      dz: newPos.z - currentPos.z,
      dtheta: newTheta - currentTheta
    };
  }

  /**
   * Mise à jour EKF avec les données de capteurs
   */
  updateEKFWithSensors(sensorData) {
    const { barometer, magnetometer, metadata } = sensorData;

    // Mise à jour barométrique
    if (barometer && barometer.pressure > 0) {
      this.ekf.updateWithBarometer(barometer.pressure);
    }

    // Mise à jour magnétomètre conditionnelle
    if (magnetometer && metadata.magnetometerConfidence > 0.7) {
      this.ekf.updateWithMagnetometer(magnetometer, metadata.magnetometerConfidence);
    }
  }

  /**
   * Mise à jour de l'état global
   */
  updateCurrentState(pdrState) {
    const ekfPose = this.ekf.getPose();
    const ekfState = this.ekf.getFullState();

    this.currentState = {
      position: {
        x: ekfPose.x,
        y: ekfPose.y,
        z: ekfPose.z
      },
      orientation: {
        theta: ekfPose.theta
      },
      velocity: ekfState.velocity,
      mode: pdrState.mode,
      confidence: ekfPose.confidence,
      stepCount: pdrState.stepCount,
      distance: this.calculateTotalDistance(),
      
      // Informations avancées
      sampleRate: pdrState.sampleRate,
      isZUPT: pdrState.isZUPT,
      energyLevel: this.sensorManager.getStatus().metrics.energyLevel,
      features: pdrState.features
    };
  }

  /**
   * Calcul de la distance totale parcourue
   */
  calculateTotalDistance() {
    // Approximation basée sur le nombre de pas et la longueur moyenne
    return this.currentState.stepCount * this.config.stepLength;
  }

  /**
   * Démarrage du timer de mise à jour utilisateur
   */
  startUserUpdateTimer() {
    const interval = 1000 / this.config.positionUpdateRate; // ms

    this.updateTimer = setInterval(() => {
      if (this.callbacks.onPositionUpdate && this.isTracking) {
        const now = Date.now();
        if (now - this.lastUserUpdate >= interval) {
          this.callbacks.onPositionUpdate(
            this.currentState.position.x,
            this.currentState.position.y,
            this.currentState.orientation.theta,
            this.currentState.mode
          );
          this.lastUserUpdate = now;
        }
      }
    }, interval);
  }

  /**
   * Mise à jour des métriques de performance
   */
  updatePerformanceMetrics(processingTime) {
    this.performance.processingTime = processingTime;
    this.performance.updateCount++;

    // Benchmark périodique
    const now = Date.now();
    if (now - this.performance.lastBenchmark > 5000) {
      const avgTime = this.performance.processingTime;
      const updateRate = this.performance.updateCount / 5;
      
      console.log(`Performance: ${avgTime.toFixed(2)}ms/update, ${updateRate.toFixed(1)} Hz`);
      
      this.performance.lastBenchmark = now;
      this.performance.updateCount = 0;
    }
  }

    /**
   * Calibration complète (capteurs + orientation poche)
   */
  async calibrateAll(progressCallback) {
    try {
      console.log('Démarrage calibration complète...');
      
      if (progressCallback) {
        progressCallback({ 
          step: 'sensors', 
          progress: 0, 
          message: 'Démarrage calibration capteurs...' 
        });
      }
      
      // 1. Calibration des capteurs (via SensorManager)
      await this.sensorManager.startCalibration((progress, isComplete) => {
        if (progressCallback) {
          progressCallback({ 
            step: 'sensors', 
            progress: progress * 0.8, // 80% pour les capteurs
            message: isComplete ? 'Capteurs calibrés' : `Calibration capteurs: ${(progress * 100).toFixed(0)}%`
          });
        }
      });
      
      if (progressCallback) {
        progressCallback({ 
          step: 'pocket', 
          progress: 0.8, 
          message: 'Démarrage calibration orientation poche...' 
        });
      }
      
      // 2. Calibration d'orientation poche
      const pocketCalibration = await this.calibratePocketOrientation((progress, message) => {
        if (progressCallback) {
          progressCallback({ 
            step: 'pocket', 
            progress: 0.8 + (progress * 0.2), // 20% pour l'orientation
            message: message || `Calibration poche: ${(progress * 100).toFixed(0)}%`
          });
        }
      });
      
      if (progressCallback) {
        progressCallback({ 
          step: 'complete', 
          progress: 1.0, 
          message: 'Calibration complète terminée !',
          pocketCalibration
        });
      }
      
      console.log('Calibration complète réussie');
      return { success: true, pocketCalibration };
      
    } catch (error) {
      console.error('Erreur calibration complète:', error);
      if (progressCallback) {
        progressCallback({ 
          step: 'error', 
          progress: 0, 
          message: `Erreur: ${error.message}`,
          error 
        });
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Calibration d'orientation poche standalone
   */
  async calibratePocketOrientation(progressCallback) {
    return new Promise((resolve, reject) => {
      // Configuration des callbacks
      this.pdr.orientationCalibrator.setCallbacks({
        onProgress: (progress, message) => {
          if (progressCallback) {
            progressCallback(progress, message);
          }
        },
        onComplete: (rotationMatrix, avgGravity) => {
          const calibrationResult = {
            rotationMatrix,
            avgGravity,
            timestamp: Date.now()
          };
          
          console.log('Calibration orientation poche terminée');
          resolve(calibrationResult);
        }
      });

      // Démarrer la calibration d'orientation
      this.pdr.orientationCalibrator.startCalibration();
      
      // Timeout de sécurité
      setTimeout(() => {
        if (this.pdr.orientationCalibrator.isCalibrating) {
          reject(new Error('Timeout calibration poche'));
        }
      }, 10000); // 10 secondes max
    });
  }

  /**
   * Vérifier si la calibration d'orientation est valide
   */
  isPocketCalibrationValid(rotationMatrix) {
    if (!rotationMatrix) return false;
    
    try {
      // Vérifier que c'est une matrice 3x3
      const size = rotationMatrix.size();
      if (size[0] !== 3 || size[1] !== 3) return false;
      
      // Vérifier que le déterminant est proche de 1 (matrice de rotation valide)
      const det = math.det(rotationMatrix);
      return Math.abs(det - 1) < 0.1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Réinitialisation de la position
   */
  resetPosition(x = 0, y = 0, z = 0, theta = 0) {
    this.pdr.resetPosition(x, y, z, theta);
    this.ekf.reset({ x, y, z, theta });
    
    this.currentState.position = { x, y, z };
    this.currentState.orientation = { theta };
    this.currentState.stepCount = 0;
    this.currentState.distance = 0;
    
    console.log(`Position réinitialisée: (${x}, ${y}, ${z})`);
  }

  /**
   * Configuration des callbacks utilisateur
   */
  setCallbacks({ onPositionUpdate, onModeChanged, onCalibrationRequired, onEnergyStatusChanged }) {
    this.callbacks = {
      onPositionUpdate: onPositionUpdate || this.callbacks.onPositionUpdate,
      onModeChanged: onModeChanged || this.callbacks.onModeChanged,
      onCalibrationRequired: onCalibrationRequired || this.callbacks.onCalibrationRequired,
      onEnergyStatusChanged: onEnergyStatusChanged || this.callbacks.onEnergyStatusChanged
    };
  }

  /**
   * Obtenir l'état complet du système
   */
  getFullState() {
    return {
      ...this.currentState,
      isInitialized: this.isInitialized,
      isTracking: this.isTracking,
      performance: { ...this.performance },
      sensors: this.sensorManager.getStatus(),
      ekf: this.ekf.getFullState(),
      pdr: this.pdr.getState()
    };
  }

  /**
   * Obtenir les métriques de performance
   */
  getPerformanceMetrics() {
    return {
      processingTime: this.performance.processingTime,
      updateRate: this.config.positionUpdateRate,
      sensorRate: this.sensorManager.currentSampleRate,
      energyLevel: this.sensorManager.getStatus().metrics.energyLevel,
      confidence: this.currentState.confidence,
      mode: this.currentState.mode
    };
  }

  /**
   * Configuration du mode économie d'énergie
   */
  setEnergyMode(enabled) {
    this.sensorManager.config.batteryOptimization = enabled;
    console.log(`Mode économie d'énergie: ${enabled ? 'activé' : 'désactivé'}`);
  }

  /**
   * Test de calibration
   */
  requiresCalibration() {
    const sensorStatus = this.sensorManager.getStatus();
    return !sensorStatus.calibration.isCalibrated;
  }

  /**
   * API de debugging
   */
  debug() {
    return {
      sdk: this.getFullState(),
      sensors: this.sensorManager.getEnhancedData(),
      ekf: this.ekf.getFullState(),
      pdr: this.pdr.getState(),
      performance: this.performance
    };
  }
} 