import { PedestrianDeadReckoning } from './PedestrianDeadReckoning.js';
import { AdvancedExtendedKalmanFilter } from './AdvancedEKF.js';
import { AdvancedSensorManager } from '../sensors/AdvancedSensorManager.js';
import { AttitudeTracker } from './AttitudeTracker.js';
import { ContinuousOrientationService } from '../services/ContinuousOrientationService.js';
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
      
      // Configuration AttitudeTracker
      attitudeConfig: config.attitudeConfig || {
        beta: 0.1,                          // Gain Madgwick conservateur
        stabilityAccThreshold: 0.2,         // Seuil stabilité
        stabilityGyroThreshold: 0.1,        // Seuil gyro
        autoRecalibrationEnabled: true,     // Re-calibration automatique
        recalibrationInterval: 30000        // 30s minimum entre recalibrations
      },
      
      // *** NOUVEAU: Configuration calibration dynamique d'orientation ***
      dynamicOrientationCalibration: {
        enabled: config.dynamicOrientationCalibration?.enabled !== false, // Activé par défaut
        minStepsRequired: config.dynamicOrientationCalibration?.minStepsRequired || 3,
        maxOffsetAngle: config.dynamicOrientationCalibration?.maxOffsetAngle || 1.2, // ~70°
        straightLineThreshold: config.dynamicOrientationCalibration?.straightLineThreshold || 0.3 // 30cm de déviation max
      },
      
      // *** NOUVEAU: Configuration orientation continue unifiée ***
      continuousOrientation: {
        enabled: config.continuousOrientation?.enabled !== false, // Activé par défaut
        mode: config.continuousOrientation?.mode || 'continuous_fusion', // Mode par défaut
        fallbackToSteps: config.continuousOrientation?.fallbackToSteps !== false, // Fallback activé
        
        // Configuration fusion continue
        fusion: {
          updateRate: config.continuousOrientation?.fusion?.updateRate || 50,
          smoothingAlpha: config.continuousOrientation?.fusion?.smoothingAlpha || 0.1,
          magneticConfidenceThreshold: config.continuousOrientation?.fusion?.magneticConfidenceThreshold || 0.3
        },
        
        // Configuration détection posture
        postureDetection: {
          enabled: config.continuousOrientation?.postureDetection?.enabled !== false,
          orientationChangeThreshold: config.continuousOrientation?.postureDetection?.orientationChangeThreshold || Math.PI / 4,
          accelerationChangeThreshold: config.continuousOrientation?.postureDetection?.accelerationChangeThreshold || 2.0,
          detectionWindow: config.continuousOrientation?.postureDetection?.detectionWindow || 1000,
          stabilityRequiredAfterChange: config.continuousOrientation?.postureDetection?.stabilityRequiredAfterChange || 500
        },
        
        // Configuration calibration immédiate
        immediateCalibration: {
          enabled: config.continuousOrientation?.immediateCalibration?.enabled !== false,
          duration: config.continuousOrientation?.immediateCalibration?.duration || 2000,
          samplesRequired: config.continuousOrientation?.immediateCalibration?.samplesRequired || 20,
          gravityThreshold: config.continuousOrientation?.immediateCalibration?.gravityThreshold || 0.5,
          gyroThreshold: config.continuousOrientation?.immediateCalibration?.gyroThreshold || 0.3,
          autoTriggerOnPostureChange: config.continuousOrientation?.immediateCalibration?.autoTriggerOnPostureChange !== false
        }
      },
      
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

    // *** NOUVEAU: AttitudeTracker pour orientation adaptative ***
    this.attitudeTracker = new AttitudeTracker(this.config.attitudeConfig);
    
    // *** NOUVEAU: Injection de l'AttitudeTracker dans le PDR pour détection verticale ***
    this.pdr.setAttitudeTracker(this.attitudeTracker);
    
    // État du SDK
    this.isInitialized = false;
    this.isTracking = false;
    this.vectorMap = null;
    
    // *** NOUVEAU: État de la calibration dynamique d'orientation ***
    this.dynamicOrientationState = {
      isCalibrated: false,
      isCalibrating: false,
      stepHistory: [],
      magneticHeadingHistory: [],
      calculatedOffset: 0,
      confidence: 0
    };
    
    // État de localisation
    this.currentState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { yaw: 0, pitch: 0, roll: 0 },
      mode: 'stationary',
      confidence: 0,
      stepCount: 0,
      crawlDistance: 0,
      distance: 0
    };

    // Callbacks utilisateur
    this.callbacks = {
      onPositionUpdate: null,
      onModeChanged: null,
      onCalibrationRequired: null,
      onEnergyStatusChanged: null,
      onDataUpdate: null,
      onCalibrationProgress: null,
      onStepDetected: null,        // *** NOUVEAU: Callback pour détection de pas ***
      onCompassDriftDetected: null,  // Nouveau callback pour dérive boussole
      onOrientationUpdate: null    // *** NOUVEAU: Callback pour orientation continue ***
    };

    // Timer pour les callbacks utilisateur
    this.updateTimer = null;
    this.lastUserUpdate = 0;

    // *** BUG FIX: Timer pour les mises à jour PDR espacées ***
    this.lastPDRUpdate = 0;
    this.pdrUpdateInterval = 1000; // 1000ms entre les mises à jour PDR (1Hz)

    // Métriques de performance
    this.performance = {
      processingTime: 0,
      updateCount: 0,
      lastBenchmark: Date.now()
    };

    // État du système
    this.isInitialized = false;
    this.isTracking = false;
    this.currentState = {};
    this.performanceMetrics = {};
    
    // *** NOUVEAU: Gestion mode automatique/manuel ***
    this.detectionMode = 'auto'; // 'auto' ou 'manual'
    this.manualModeOverride = null; // Mode forcé en manuel
    this.autoModeEnabled = true; // Classification automatique activée

    // Service d'orientation continue unifié (nouveau système)
    this.continuousOrientationService = new ContinuousOrientationService({
      smoothingAlpha: this.config.continuousOrientation.fusion?.smoothingAlpha || 0.1,
      accuracyDriftThreshold: 20, // 20 degrés de seuil de dérive
      driftDetection: {
        enabled: true,
        windowSize: 10,
        notificationInterval: 30000 // 30s entre notifications
      }
    });

    // *** MODIFICATION: Plus d'AttitudeTracker direct, uniquement via le service ***
    // this.attitudeTracker = this.continuousOrientationService.attitudeTracker;
    
    // Attitude tracker séparé pour la compatibilité
    this.attitudeTracker = new AttitudeTracker({
      beta: 0.15,
      stabilityAccThreshold: 0.3,
      stabilityGyroThreshold: 0.15,
      stabilityDuration: 1500,
      magConfidenceThreshold: 0.3,
      autoRecalibrationEnabled: true,
      recalibrationInterval: 20000
    });
    
    // Configuration des callbacks orientation continue
    this.setupContinuousOrientationCallbacks();
    
    // Configuration des callbacks internes existants
    this.setupInternalCallbacks();
    
    console.log('LocalizationSDK initialisé avec orientation continue unifiée');
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
   * Démarrage du tracking avec calibration automatique
   */
  async startTracking(pocketCalibrationMatrix = null) {
    if (!this.isInitialized) {
      throw new Error('SDK non initialisé');
    }

    try {
      // Vérifier si une calibration valide existe
      const needsCalibration = !this.isPocketCalibrationValid(pocketCalibrationMatrix) || 
                              this.requiresCalibration();

      if (needsCalibration) {
        // Lancer calibration automatique complète avec callback de progression
        console.log('Lancement calibration automatique...');
        
        const calibrationResult = await this.calibrateAll((progress) => {
          // Transmettre la progression à l'UI via le nouveau callback
          if (this.callbacks.onCalibrationProgress) {
            this.callbacks.onCalibrationProgress({
              ...progress,
              isCalibrating: progress.progress < 1.0,
              isComplete: progress.progress >= 1.0
            });
          }
        });

        if (!calibrationResult.success) {
          throw new Error(`Échec calibration: ${calibrationResult.error}`);
        }

        console.log('Calibration automatique terminée avec succès');
      } else {
        console.log('Utilisation calibration existante valide');
        // Plus besoin d'appliquer une matrice de rotation - la boussole native gère cela
        // this.pdr.orientationCalibrator.rotationMatrix = pocketCalibrationMatrix;
        // this.pdr.orientationCalibrator.isCalibrated = true;
      }

      // Démarrage des capteurs
      await this.sensorManager.startAll();

      // *** CORRECTION: Timer redondant - callbacks immédiats depuis PDR ***
      // Configuration du timer de mise à jour utilisateur
      // this.startUserUpdateTimer();

      this.isTracking = true;
      console.log('Tracking démarré');

      return true;
    } catch (error) {
      console.error('Erreur démarrage tracking:', error);
      
      // Notifier l'UI de l'erreur de calibration
      if (this.callbacks.onCalibrationProgress) {
        this.callbacks.onCalibrationProgress({
          step: 'error',
          progress: 0,
          message: `Erreur: ${error.message}`,
          isCalibrating: false,
          isComplete: false,
          error: error.message
        });
      }
      
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
        
        // *** NOUVEAU: Transmettre la position lors de la détection de pas ***
        if (this.callbacks.onStepDetected && typeof this.callbacks.onStepDetected === 'function') {
          const currentPos = this.currentState.position;
          const currentTheta = this.currentState.orientation.yaw;
          this.callbacks.onStepDetected(
            stepCount, 
            stepLength, 
            currentPos.x, 
            currentPos.y, 
            currentTheta
          );
        } else if (this.callbacks.onStepDetected) {
          console.error('[SDK] onStepDetected callback invalide:', typeof this.callbacks.onStepDetected);
        }
      },
      onModeChanged: (mode, features) => {
        this.currentState.mode = mode;
        this.ekf.updateProcessNoise(mode);
        
        if (this.callbacks.onModeChanged && typeof this.callbacks.onModeChanged === 'function') {
          this.callbacks.onModeChanged(mode, features);
        } else if (this.callbacks.onModeChanged) {
          console.error('[SDK] onModeChanged callback invalide:', typeof this.callbacks.onModeChanged);
        }
      },
      onPositionUpdate: (x, y, theta, mode) => {
        // *** CORRECTION: Transmettre immédiatement la mise à jour de position ***
        // Mettre à jour l'état interne
        this.currentState.position.x = x;
        this.currentState.position.y = y;
        this.currentState.orientation.yaw = theta;
        this.currentState.mode = mode;
        
        // *** NOUVEAU: Callback immédiat vers MapScreen pour traçage temps réel ***
        if (this.callbacks.onPositionUpdate && typeof this.callbacks.onPositionUpdate === 'function') {
          this.callbacks.onPositionUpdate(x, y, theta, mode);
        } else if (this.callbacks.onPositionUpdate) {
          console.error('[SDK] onPositionUpdate callback invalide:', typeof this.callbacks.onPositionUpdate);
        }
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

    // Callback pour mise à jour des données capteurs dans le contexte
    if (this.callbacks.onDataUpdate && typeof this.callbacks.onDataUpdate === 'function') {
      this.callbacks.onDataUpdate(sensorData);
    } else if (this.callbacks.onDataUpdate) {
      console.error('[SDK] onDataUpdate callback invalide:', typeof this.callbacks.onDataUpdate);
    }

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
      console.error('Erreur traitement capteurs:', error?.message || 'Erreur inconnue');
      if (error?.stack) {
        console.error('Stack trace:', error.stack);
      }
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
    const currentTheta = this.currentState.orientation.yaw;
    const newTheta = pdrState.orientation.yaw;

    return {
      dx: newPos.x - currentPos.x,
      dy: newPos.y - currentPos.y,
      dz: newPos.z - currentPos.z,
      dtheta: newTheta - currentTheta
    };
  }

  /**
   * Mise à jour EKF avec les données de capteurs - Version consolidée (CORRIGÉE)
   */
  updateEKFWithSensors(sensorData) {
    // *** FIX: Consolidation des mises à jour en une seule transaction ***
    const updates = [];
    const { barometer, magnetometer, metadata } = sensorData;

    // Préparer mise à jour barométrique
    if (barometer && barometer.pressure > 0) {
      const altitude = this.ekf.pressureToAltitude(barometer.pressure);
      updates.push({
        type: 'barometer',
        measurement: altitude,
        noise: this.ekf.config.barometerNoise
      });
    }

    // *** BUG FIX: Préparer mise à jour magnétomètre TOUJOURS (plus de seuil 50%) ***
    if (magnetometer) {
      // Utiliser le cap corrigé si disponible (calibration dynamique)
      let heading;
      if (magnetometer.correctedHeading !== undefined) {
        heading = magnetometer.correctedHeading;
        console.log(`[MAG-CORRIGÉ] Utilisation cap corrigé: ${(heading * 180 / Math.PI).toFixed(1)}°`);
      } else {
        // Fallback vers calcul standard avec transformation AttitudeTracker
        let transformedMagField = magnetometer;
        try {
          const attitudeStatus = this.attitudeTracker.getStatus();
          if (attitudeStatus.quaternion.w !== 1 || attitudeStatus.quaternion.x !== 0) {
            // AttitudeTracker a une orientation valide, on peut l'utiliser
            // (Pour l'instant, on utilise les données brutes car la transformation magnétomètre 
            // est moins critique que l'accéléromètre/gyroscope)
            transformedMagField = magnetometer;
          }
        } catch (error) {
          console.warn('Erreur transformation magnétomètre AttitudeTracker:', error);
          transformedMagField = magnetometer;
        }
        
        heading = Math.atan2(transformedMagField.y, transformedMagField.x);
      }
      
      // *** NOUVEAU: Modulation du bruit selon confiance, mais mise à jour toujours effectuée ***
      const confidence = metadata.magnetometerConfidence || 0.1; // Minimum 10%
      let adaptiveNoise = this.ekf.config.magnetometerNoise / confidence;
      
      // Plafonner le bruit pour éviter pénalisation excessive
      adaptiveNoise = Math.min(adaptiveNoise, 2.0);
      
      updates.push({
        type: 'magnetometer',
        measurement: heading,
        noise: adaptiveNoise
      });
      
      // Stocker confiance magnéto pour ZUPT
      this.ekf._lastMagnetometerConfidence = confidence;
      
      // *** BONUS: Bonus confiance explicite après correction magnétomètre ***
      // if (confidence > 0.5) {
      //   console.log(`[MAG] Correction appliquée avec confiance ${(confidence * 100).toFixed(0)}%, bruit=${adaptiveNoise.toFixed(2)}`);
      // }
    }
    
    // Préparer mise à jour PDR à intervalle espacé
    const now = Date.now();
    if (now - this.lastPDRUpdate > this.pdrUpdateInterval) {
      const pdrState = this.pdr.getState();
      if (pdrState && pdrState.position) {
        // *** BUG FIX: Configuration du bruit PDR optimisée (~50% de réduction) ***
        let positionNoise, yawNoise;
        switch (pdrState.mode) {
          case 'stationary':
            positionNoise = 0.005; // Très optimiste quand stationnaire
            yawNoise = 0.025;
            break;
          case 'walking':
            positionNoise = 0.05;  // Réduit de 0.1 à 0.05
            yawNoise = 0.05;       // Réduit de 0.1 à 0.05
            break;
          case 'running':
            positionNoise = 0.15;  // Réduit de 0.3 à 0.15
            yawNoise = 0.1;        // Réduit de 0.2 à 0.1
            break;
          case 'crawling':
            positionNoise = 0.03;  // Réduit de 0.05 à 0.03
            yawNoise = 0.05;
            break;
          default:
            positionNoise = 0.1;   // Réduit de 0.2 à 0.1
            yawNoise = 0.075;      // Réduit de 0.15 à 0.075
        }
        
        updates.push({
          type: 'pdr_position',
          measurement: { x: pdrState.position.x, y: pdrState.position.y },
          noise: positionNoise
        });
        
        updates.push({
          type: 'pdr_yaw',
          measurement: pdrState.orientation.yaw,
          noise: yawNoise
        });
        
        // *** BONUS PDR: Réduction de 5% de l'incertitude après chaque correction PDR ***
        console.log(`[PDR] Correction appliquée - Mode: ${pdrState.mode}, Noise pos: ${positionNoise.toFixed(3)}, yaw: ${yawNoise.toFixed(3)}`);
        
        this.lastPDRUpdate = now;
      }
    }

    // Appliquer toutes les mises à jour en une seule fois
    if (updates.length > 0) {
      this.ekf.updateWithBatch(updates);
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
        yaw: ekfPose.theta
      },
      velocity: ekfState.velocity,
      mode: pdrState.mode,
      confidence: ekfPose.confidence,
      stepCount: pdrState.stepCount,
      crawlDistance: pdrState.crawlDistance,
      distance: this.calculateTotalDistance(),
      
      // Informations avancées
      sampleRate: pdrState.sampleRate,
      isZUPT: pdrState.isZUPT,
      energyLevel: this.sensorManager.getStatus().metrics.energyLevel,
      features: pdrState.features,
      
      // *** NOUVEAU: Informations de contrôle de mode ***
      modeControl: {
        detectionMode: this.detectionMode,
        manualModeOverride: this.manualModeOverride,
        autoModeEnabled: this.autoModeEnabled,
        isManualActive: this.isManualModeActive()
      },
      
      // Métriques de détection verticale
      verticalDetection: pdrState.verticalDetection
    };
  }

  /**
   * Calcul de la distance totale parcourue
   */
  calculateTotalDistance() {
    // *** NOUVEAU: Utiliser la distance totale du PDR (pas + crawling) ***
    const pdrState = this.pdr.getState();
    return pdrState.totalDistance || (this.currentState.stepCount * this.config.stepLength);
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
          // *** CORRECTION: Protection contre les états invalides ***
          if (this.currentState && this.currentState.position) {
            this.callbacks.onPositionUpdate(
              this.currentState.position.x,
              this.currentState.position.y,
              this.currentState.orientation.yaw,
              this.currentState.mode
            );
            this.lastUserUpdate = now;
          }
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
   * Calibration simplifiée (capteurs uniquement - plus d'étape poche)
   */
  async calibrateAll(progressCallback) {
    try {
      console.log('Démarrage calibration simplifiée (capteurs uniquement)...');
      
      if (progressCallback) {
        progressCallback({ 
          step: 'sensors', 
          progress: 0, 
          message: 'Démarrage calibration capteurs...' 
        });
      }
      
      // Calibration des capteurs uniquement (durée réduite à 3 secondes)
      await this.sensorManager.startCalibration((progress, message) => {
        if (progressCallback) {
          progressCallback({ 
            step: 'sensors', 
            progress: progress,
            message: message || `Calibration capteurs: ${(progress * 100).toFixed(0)}%`
          });
        }
      });
      
      // Démarrer la boussole native
      const compassStarted = await this.continuousOrientationService.startNativeCompass();
      
      if (progressCallback) {
        progressCallback({ 
          step: 'complete', 
          progress: 1.0, 
          message: compassStarted ? 
            'Calibration terminée ! Boussole native active.' :
            'Calibration terminée ! Fallback vers orientation gyroscopique.',
          compassActive: compassStarted
        });
      }
      
      console.log(`Calibration simplifiée réussie - Boussole native: ${compassStarted ? 'active' : 'fallback PDR'}`);
      return { success: true, compassActive: compassStarted };
      
    } catch (error) {
      console.error('Erreur calibration simplifiée:', error);
      if (progressCallback) {
        progressCallback({ 
          step: 'error', 
          progress: 0, 
          message: `Erreur: ${error.message}` 
        });
      }
      throw error;
    }
  }

  /**
   * Vérifier si la calibration d'orientation est valide (SIMPLIFIÉ)
   */
  isPocketCalibrationValid(rotationMatrix) {
    // Plus de calibration manuelle - toujours utiliser la boussole native
    return true;
  }

  /**
   * Réinitialisation de la position
   */
  resetPosition(x = 0, y = 0, z = 0, theta = 0) {
    this.pdr.resetPosition(x, y, z, theta);
    this.ekf.reset({ x, y, z, theta });
    
    this.currentState.position = { x, y, z };
    this.currentState.orientation = { yaw: theta };
    this.currentState.stepCount = 0;
    this.currentState.distance = 0;
    
    console.log(`Position réinitialisée: (${x}, ${y}, ${z})`);
  }

  /**
   * Configuration des callbacks utilisateur avec protection
   */
  setCallbacks({ 
    onPositionUpdate, 
    onModeChanged, 
    onCalibrationRequired, 
    onEnergyStatusChanged, 
    onDataUpdate, 
    onCalibrationProgress, 
    onStepDetected,
    onCompassDriftDetected  // Nouveau callback pour dérive boussole
  }) {
    // Protection contre les callbacks invalides
    const validateCallback = (callback, name) => {
      if (callback !== null && callback !== undefined && typeof callback !== 'function') {
        console.error(`[SDK] Callback ${name} invalide (type: ${typeof callback}) - doit être une fonction ou null/undefined`);
        return null;
      }
      return callback;
    };

    this.callbacks = {
      onPositionUpdate: validateCallback(onPositionUpdate, 'onPositionUpdate') || this.callbacks.onPositionUpdate,
      onModeChanged: validateCallback(onModeChanged, 'onModeChanged') || this.callbacks.onModeChanged,
      onCalibrationRequired: validateCallback(onCalibrationRequired, 'onCalibrationRequired') || this.callbacks.onCalibrationRequired,
      onEnergyStatusChanged: validateCallback(onEnergyStatusChanged, 'onEnergyStatusChanged') || this.callbacks.onEnergyStatusChanged,
      onDataUpdate: validateCallback(onDataUpdate, 'onDataUpdate') || this.callbacks.onDataUpdate,
      onCalibrationProgress: validateCallback(onCalibrationProgress, 'onCalibrationProgress') || this.callbacks.onCalibrationProgress,
      onStepDetected: validateCallback(onStepDetected, 'onStepDetected') || this.callbacks.onStepDetected,
      onCompassDriftDetected: validateCallback(onCompassDriftDetected, 'onCompassDriftDetected') || this.callbacks.onCompassDriftDetected
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

  /**
   * Configuration des callbacks AttitudeTracker
   */
  setupAttitudeCallbacks() {
    // Mise à jour d'attitude
    this.attitudeTracker.onAttitudeUpdate = (attitudeData) => {
      // Mettre à jour l'orientation dans l'état courant
      const { quaternion, isStable, magneticConfidence } = attitudeData;
      
      // Conversion quaternion vers angles d'Euler
      const euler = this.quaternionToEuler(quaternion);
      this.currentState.orientation = {
        yaw: euler.yaw,
        pitch: euler.pitch,
        roll: euler.roll
      };
      
      // Informer l'EKF de l'état de stabilité pour ZUPT
      if (isStable && !this.ekf.zuptActive) {
        this.ekf.applyZUPT();
      } else if (!isStable && this.ekf.zuptActive) {
        this.ekf.deactivateZUPT();
      }
    };
    
    // Re-calibration automatique détectée
    this.attitudeTracker.onRecalibration = (recalibrationResult) => {
      console.log('Re-calibration automatique d\'orientation effectuée');
      if (this.callbacks.onCalibrationUpdate) {
        this.callbacks.onCalibrationUpdate({
          type: 'orientation_recalibration',
          automatic: true,
          ...recalibrationResult
        });
      }
    };
    
    // Changement de stabilité
    this.attitudeTracker.onStabilityChange = (isStable, accVariance, gyroMagnitude) => {
      if (isStable) {
        console.log('Période de stabilité détectée - ZUPT activé');
        this.pdr.updateActivityMode('stationary');
        this.ekf.updateProcessNoise('stationary');
      } else {
        console.log('Mouvement détecté - ZUPT désactivé');
        if (this.currentState.mode !== 'stationary') {
          this.pdr.updateActivityMode(this.currentState.mode);
          this.ekf.updateProcessNoise(this.currentState.mode);
        }
      }
    };
  }

  /**
   * Conversion quaternion vers angles d'Euler
   */
  quaternionToEuler(q) {
    const { w, x, y, z } = q;
    
    // Roll (rotation autour de l'axe X)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);
    
    // Pitch (rotation autour de l'axe Y)
    const sinp = 2 * (w * y - z * x);
    const pitch = Math.abs(sinp) >= 1 ? 
      Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
    
    // Yaw (rotation autour de l'axe Z)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);
    
    return { yaw, pitch, roll };
  }

  /**
   * *** NOUVEAU: Configuration callbacks orientation continue ***
   */
  setupContinuousOrientationCallbacks() {
    // Callback principal pour mise à jour orientation
    this.continuousOrientationService.onOrientationUpdate = (orientationData) => {
      // Mettre à jour l'état global avec les données natives
      this.currentState.orientation.yaw = orientationData.heading;
      
      // Notifier l'UI avec source native
      if (this.callbacks.onOrientationUpdate) {
        this.callbacks.onOrientationUpdate({
          ...orientationData,
          source: 'native_compass'
        });
      }
    };

    // Callback détection de dérive (remplace calibration)
    this.continuousOrientationService.onDriftDetected = (driftData) => {
      console.log('Dérive de boussole détectée');
      
      // Notifier l'UI pour demander recalibration manuelle
      if (this.callbacks.onCompassDriftDetected) {
        this.callbacks.onCompassDriftDetected({
          type: 'compass_drift',
          averageAccuracy: driftData.averageAccuracy,
          threshold: driftData.threshold,
          message: driftData.message,
          timestamp: driftData.timestamp
        });
      }
    };
  }

  /**
   * *** NOUVEAU: Réinitialiser l'historique de dérive boussole ***
   */
  resetCompassDrift() {
    if (this.continuousOrientationService) {
      this.continuousOrientationService.resetDriftHistory();
      console.log('Historique de dérive boussole réinitialisé');
      return true;
    }
    return false;
  }

  /**
   * *** NOUVEAU: Calibration dynamique d'orientation pendant les premiers pas ***
   */
  processDynamicOrientationCalibration(pdrState, sensorData) {
    if (!this.config.dynamicOrientationCalibration.enabled) return;
    if (this.dynamicOrientationState.isCalibrated) return;
    
    const { magnetometer } = sensorData;
    if (!magnetometer || !pdrState.position) return;
    
    // Commencer la calibration lors des premiers pas
    if (pdrState.stepCount >= 1 && !this.dynamicOrientationState.isCalibrating) {
      this.startDynamicOrientationCalibration();
    }
    
    if (!this.dynamicOrientationState.isCalibrating) return;
    
    // Collecter données à chaque pas
    if (pdrState.stepCount > this.dynamicOrientationState.stepHistory.length) {
      this.collectOrientationCalibrationData(pdrState, magnetometer);
      
      // Tenter calibration après avoir collecté assez de données
      if (this.dynamicOrientationState.stepHistory.length >= this.config.dynamicOrientationCalibration.minStepsRequired) {
        this.attemptDynamicOrientationCalibration();
      }
    }
  }

  /**
   * Démarrage de la calibration dynamique d'orientation
   */
  startDynamicOrientationCalibration() {
    this.dynamicOrientationState.isCalibrating = true;
    this.dynamicOrientationState.stepHistory = [];
    this.dynamicOrientationState.magneticHeadingHistory = [];
    
    console.log('[CALIBRATION DYNAMIQUE] Démarrage calibration d\'orientation automatique...');
    
    if (this.callbacks.onCalibrationProgress) {
      this.callbacks.onCalibrationProgress({
        step: 'dynamic_orientation',
        progress: 0,
        message: 'Calibration automatique de l\'orientation en cours...'
      });
    }
  }

  /**
   * Collecte des données pour la calibration d'orientation
   */
  collectOrientationCalibrationData(pdrState, magnetometer) {
    // Enregistrer position PDR
    this.dynamicOrientationState.stepHistory.push({
      position: { ...pdrState.position },
      stepCount: pdrState.stepCount,
      timestamp: Date.now()
    });
    
    // Enregistrer cap magnétique
    const magneticHeading = Math.atan2(magnetometer.y, magnetometer.x);
    this.dynamicOrientationState.magneticHeadingHistory.push({
      heading: magneticHeading,
      timestamp: Date.now()
    });
    
    console.log(`[CALIBRATION DYNAMIQUE] Étape ${pdrState.stepCount}: pos=(${pdrState.position.x.toFixed(2)}, ${pdrState.position.y.toFixed(2)}), cap=${(magneticHeading * 180 / Math.PI).toFixed(1)}°`);
  }

  /**
   * Tentative de calibration d'orientation dynamique AMÉLIORÉE
   */
  attemptDynamicOrientationCalibration() {
    const steps = this.dynamicOrientationState.stepHistory;
    const headings = this.dynamicOrientationState.magneticHeadingHistory;
    
    if (steps.length < this.config.dynamicOrientationCalibration.minStepsRequired) return;
    
    // Calculer direction de déplacement PDR
    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];
    
    const deltaX = lastStep.position.x - firstStep.position.x;
    const deltaY = lastStep.position.y - firstStep.position.y;
    const pdrDirection = Math.atan2(deltaY, deltaX);
    
    // Distance parcourue
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Vérifier que c'est suffisamment rectiligne
    const straightLineThreshold = this.config.dynamicOrientationCalibration.straightLineThreshold;
    if (!this.isTrajectoryRectiligne(steps, straightLineThreshold)) {
      console.log('[CALIBRATION DYNAMIQUE] Trajectoire non rectiligne, attente de plus de données...');
      return;
    }
    
    // Calculer cap magnétique moyen
    const averageMagneticHeading = this.calculateAverageMagneticHeading(headings);
    
    // Calculer offset d'orientation
    let orientationOffset = pdrDirection - averageMagneticHeading;
    
    // Normaliser l'angle [-π, π]
    while (orientationOffset > Math.PI) orientationOffset -= 2 * Math.PI;
    while (orientationOffset < -Math.PI) orientationOffset += 2 * Math.PI;
    
    // *** SOLUTION 3: Limites assouplies et gestion des grands offsets ***
    const maxOffset = this.config.dynamicOrientationCalibration.maxOffsetAngle;
    const offsetDegrees = orientationOffset * 180 / Math.PI;
    
    // Gestion spéciale pour les offsets ~180° (téléphone à l'envers)
    let finalOffset = orientationOffset;
    if (Math.abs(offsetDegrees) > 150 && Math.abs(offsetDegrees) < 210) {
      // Cas téléphone à l'envers - normaliser vers ±180°
      finalOffset = offsetDegrees > 0 ? Math.PI : -Math.PI;
      console.log(`[CALIBRATION DYNAMIQUE] Détection téléphone à l'envers: ${offsetDegrees.toFixed(1)}° → ${(finalOffset * 180 / Math.PI).toFixed(1)}°`);
    } else if (Math.abs(orientationOffset) > maxOffset) {
      // *** NOUVEAU: Seuil élargi à 120° au lieu de 70° ***
      const enlargedMaxOffset = Math.PI * 2/3; // 120°
      if (Math.abs(orientationOffset) <= enlargedMaxOffset) {
        console.log(`[CALIBRATION DYNAMIQUE] Offset important mais acceptable: ${offsetDegrees.toFixed(1)}°`);
        finalOffset = orientationOffset;
      } else {
        console.log(`[CALIBRATION DYNAMIQUE] Offset trop grand: ${offsetDegrees.toFixed(1)}°, abandon`);
        this.dynamicOrientationState.isCalibrating = false;
        return;
      }
    }
    
    // Appliquer la calibration
    this.applyDynamicOrientationCalibration(finalOffset);
  }

  /**
   * Vérifier si la trajectoire est suffisamment rectiligne
   */
  isTrajectoryRectiligne(steps, threshold) {
    if (steps.length < 3) return true;
    
    const first = steps[0].position;
    const last = steps[steps.length - 1].position;
    
    // Ligne droite théorique
    const totalDistance = Math.sqrt(
      (last.x - first.x) ** 2 + (last.y - first.y) ** 2
    );
    
    if (totalDistance < 0.5) return false; // Trop court pour évaluer
    
    // Calculer déviation maximale par rapport à la ligne droite
    let maxDeviation = 0;
    for (let i = 1; i < steps.length - 1; i++) {
      const point = steps[i].position;
      const deviation = this.distanceToLine(point, first, last);
      maxDeviation = Math.max(maxDeviation, deviation);
    }
    
    console.log(`[CALIBRATION DYNAMIQUE] Déviation max: ${maxDeviation.toFixed(3)}m, seuil: ${threshold}m`);
    return maxDeviation <= threshold;
  }

  /**
   * Distance d'un point à une ligne
   */
  distanceToLine(point, lineStart, lineEnd) {
    const A = lineEnd.x - lineStart.x;
    const B = lineEnd.y - lineStart.y;
    const C = point.x - lineStart.x;
    const D = point.y - lineStart.y;
    
    const dot = C * A + D * B;
    const len_sq = A * A + B * B;
    
    if (len_sq === 0) return Math.sqrt(C * C + D * D);
    
    const param = dot / len_sq;
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * A;
      yy = lineStart.y + param * B;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculer le cap magnétique moyen
   */
  calculateAverageMagneticHeading(headings) {
    // Utiliser les composantes sin/cos pour moyenner correctement les angles
    let sumSin = 0;
    let sumCos = 0;
    
    for (const heading of headings) {
      sumSin += Math.sin(heading.heading);
      sumCos += Math.cos(heading.heading);
    }
    
    return Math.atan2(sumSin / headings.length, sumCos / headings.length);
  }

  /**
   * Appliquer la calibration d'orientation dynamique
   */
  applyDynamicOrientationCalibration(offset) {
    this.dynamicOrientationState.calculatedOffset = offset;
    this.dynamicOrientationState.isCalibrated = true;
    this.dynamicOrientationState.isCalibrating = false;
    this.dynamicOrientationState.confidence = 0.8; // Confiance raisonnable
    
    console.log(`[CALIBRATION DYNAMIQUE] ✓ Offset calculé: ${(offset * 180 / Math.PI).toFixed(1)}° - Calibration terminée`);
    
    // Appliquer l'offset aux futures lectures magnétiques
    this.magneticOffset = offset;
    
    // Notifier l'UI
    if (this.callbacks.onCalibrationProgress) {
      this.callbacks.onCalibrationProgress({
        step: 'dynamic_orientation_complete',
        progress: 1.0,
        message: `Orientation calibrée automatiquement (offset: ${(offset * 180 / Math.PI).toFixed(1)}°)`,
        dynamicOffset: offset * 180 / Math.PI
      });
    }
    
    // Optionnel: Corriger rétroactivement la trajectoire PDR existante
    this.correctPDRTrajectory(offset);
  }

  /**
   * Corriger la trajectoire PDR avec le nouvel offset
   */
  correctPDRTrajectory(offset) {
    // Pivoter la position actuelle autour de l'origine
    const currentX = this.currentState.position.x;
    const currentY = this.currentState.position.y;
    
    const correctedX = currentX * Math.cos(-offset) - currentY * Math.sin(-offset);
    const correctedY = currentX * Math.sin(-offset) + currentY * Math.cos(-offset);
    
    // Mettre à jour l'état
    this.currentState.position.x = correctedX;
    this.currentState.position.y = correctedY;
    this.currentState.orientation.yaw += offset;
    
    // Mettre à jour le PDR et l'EKF
    this.pdr.position.x = correctedX;
    this.pdr.position.y = correctedY;
    this.pdr.orientation.yaw += offset;
    
    this.ekf.state.set([0, 0], correctedX);
    this.ekf.state.set([1, 0], correctedY);
    this.ekf.state.set([6, 0], this.pdr.orientation.yaw);
    
    console.log(`[CALIBRATION DYNAMIQUE] Trajectoire corrigée: (${correctedX.toFixed(2)}, ${correctedY.toFixed(2)})`);
  }

  /**
   * *** NOUVEAU: Test d'intégration du mode crawling ***
   */
  testCrawlingIntegration() {
    if (!this.isInitialized) {
      console.warn('[SDK] SDK non initialisé pour le test crawling');
      return { success: false, error: 'SDK non initialisé' };
    }
    
    console.log('[SDK] Lancement test intégration crawling...');
    
    try {
      // Test PDR
      const pdrResult = this.pdr.testCrawlingIntegration();
      
      // Test EKF avec mode crawling
      const initialEKFState = this.ekf.getFullState();
      this.ekf.updateProcessNoise('crawling');
      
      console.log('[SDK] Test EKF - Mode crawling configuré');
      console.log('[SDK] État EKF initial:', {
        position: { 
          x: initialEKFState.position.x, 
          y: initialEKFState.position.y 
        },
        velocity: initialEKFState.velocity
      });
      
      // Vérifier que l'EKF gère bien le mode crawling
      const crawlingState = this.ekf.getFullState();
      
      const result = {
        success: pdrResult.success,
        pdr: pdrResult,
        ekf: {
          initialState: initialEKFState,
          crawlingState: crawlingState,
          processNoiseUpdated: true
        },
        integration: {
          totalDistance: this.calculateTotalDistance(),
          currentState: this.currentState
        }
      };
      
      console.log('[SDK] Test crawling terminé:', result.success ? '✓ RÉUSSI' : '✗ ÉCHOUÉ');
      return result;
      
    } catch (error) {
      console.error('[SDK] Erreur test crawling:', error);
      return { 
        success: false, 
        error: error.message,
        pdr: null,
        ekf: null 
      };
    }
  }

  /**
   * *** NOUVEAU: Activation du mode automatique ***
   */
  setAutoMode() {
    this.detectionMode = 'auto';
    this.manualModeOverride = null;
    this.autoModeEnabled = true;
    
    // Réactiver la classification automatique dans le PDR
    if (this.pdr) {
      this.pdr.setAutoClassification(true);
    }
    
    console.log('[SDK] Mode automatique activé - Classification d\'activité réactivée');
  }

  /**
   * *** NOUVEAU: Activation du mode manuel avec mode spécifique ***
   */
  setManualMode(mode) {
    const validModes = ['stationary', 'walking', 'crawling', 'running'];
    
    if (!validModes.includes(mode)) {
      console.warn(`[SDK] Mode manuel invalide: ${mode}. Modes valides: ${validModes.join(', ')}`);
      return;
    }
    
    this.detectionMode = 'manual';
    this.manualModeOverride = mode;
    this.autoModeEnabled = false;
    
    // Désactiver la classification automatique et forcer le mode
    if (this.pdr) {
      this.pdr.setAutoClassification(false);
      this.pdr.updateActivityMode(mode);
    }
    
    // Mettre à jour l'EKF avec le nouveau mode
    if (this.ekf) {
      this.ekf.updateProcessNoise(mode);
    }
    
    console.log(`[SDK] Mode manuel activé: ${mode}`);
  }

  /**
   * *** NOUVEAU: Obtenir l'état du contrôle de mode ***
   */
  getModeControlState() {
    return {
      detectionMode: this.detectionMode,
      manualModeOverride: this.manualModeOverride,
      autoModeEnabled: this.autoModeEnabled,
      currentMode: this.currentState.mode || 'stationary'
    };
  }

  /**
   * *** NOUVEAU: Vérifier si un mode est forcé manuellement ***
   */
  isManualModeActive() {
    return this.detectionMode === 'manual' && this.manualModeOverride !== null;
  }

  /**
   * *** NOUVEAU: Test des garde-fous physiologiques ***
   */
  testPhysiologicalGuards() {
    if (!this.isInitialized) {
      console.warn('[SDK] SDK non initialisé pour le test physiologique');
      return { success: false, error: 'SDK non initialisé' };
    }
    
    console.log('[SDK] Lancement test garde-fous physiologiques...');
    
    try {
      // Test PDR
      const pdrResult = this.pdr.testPhysiologicalGuards();
      
      // Informations sur l'état actuel
      const currentState = this.currentState;
      const pdrState = this.pdr.getState();
      
      console.log('[SDK] État actuel du système:');
      console.log('[SDK] - Mode:', currentState.mode);
      console.log('[SDK] - Pas détectés:', currentState.stepCount);
      console.log('[SDK] - Distance:', currentState.distance?.toFixed(2), 'm');
      
      // Métriques physiologiques
      const physioMetrics = pdrState.physiologicalMetrics;
      console.log('[SDK] Métriques physiologiques:');
      console.log('[SDK] - Fréquence actuelle:', physioMetrics.currentStepFrequency.toFixed(2), 'Hz');
      console.log('[SDK] - Fréquence max autorisée:', physioMetrics.maxAllowedFrequency, 'Hz');
      console.log('[SDK] - Historique pas:', physioMetrics.stepHistoryLength, 'pas');
      console.log('[SDK] - Confirmation gyro:', physioMetrics.gyroConfirmationEnabled ? 'activée' : 'désactivée');
      console.log('[SDK] - Activité gyro:', physioMetrics.lastGyroActivity.toFixed(3), 'rad/s');
      
      const result = {
        success: true,
        pdr: pdrResult,
        currentState: {
          mode: currentState.mode,
          stepCount: currentState.stepCount,
          distance: currentState.distance
        },
        physiologicalMetrics: physioMetrics,
        recommendations: this.generatePhysiologicalRecommendations(physioMetrics)
      };
      
      console.log('[SDK] Test garde-fous physiologiques terminé ✓');
      return result;
      
    } catch (error) {
      console.error('[SDK] Erreur test garde-fous physiologiques:', error);
      return { 
        success: false, 
        error: error.message,
        pdr: null 
      };
    }
  }

  /**
   * *** NOUVEAU: Générer des recommandations basées sur les métriques physiologiques ***
   */
  generatePhysiologicalRecommendations(metrics) {
    const recommendations = [];
    
    // Vérification fréquence de pas
    const frequencyRatio = metrics.currentStepFrequency / metrics.maxAllowedFrequency;
    if (frequencyRatio > 0.8) {
      recommendations.push({
        type: 'warning',
        message: `Fréquence de pas élevée (${(frequencyRatio * 100).toFixed(0)}% du maximum)`,
        suggestion: 'Risque de faux positifs - Vérifier les seuils de détection'
      });
    }
    
    // Vérification historique des pas
    if (metrics.stepHistoryLength < 3 && this.currentState.mode === 'walking') {
      recommendations.push({
        type: 'info',
        message: 'Peu de pas détectés en mode marche',
        suggestion: 'Normal en début de session ou si stationnaire'
      });
    }
    
    // Vérification confirmation gyroscopique
    if (metrics.gyroConfirmationEnabled && metrics.lastGyroActivity < 0.1) {
      recommendations.push({
        type: 'warning',
        message: 'Activité gyroscopique très faible',
        suggestion: 'Vérifier que le téléphone bouge naturellement'
      });
    }
    
    // Vérification buffer gyroscopique
    if (metrics.gyroConfirmationEnabled && metrics.gyroBufferLength < 10) {
      recommendations.push({
        type: 'info',
        message: 'Buffer gyroscopique en cours de remplissage',
        suggestion: 'Confirmation gyro sera active sous peu'
      });
    }
    
    return recommendations;
  }

  /**
   * *** NOUVEAU: Détection de changement de posture du téléphone ***
   */
  detectPostureChange(accelerometer, gyroscope) {
    if (!this.lastPostureCheck) {
      this.lastPostureCheck = {
        gravity: { ...accelerometer },
        timestamp: Date.now(),
        orientation: this.calculatePhoneOrientation(accelerometer)
      };
      return false;
    }
    
    const currentTime = Date.now();
    const timeSinceLastCheck = currentTime - this.lastPostureCheck.timestamp;
    
    // Vérifier seulement toutes les 5 secondes
    if (timeSinceLastCheck < 5000) return false;
    
    const currentOrientation = this.calculatePhoneOrientation(accelerometer);
    const lastOrientation = this.lastPostureCheck.orientation;
    
    // Calculer changement d'orientation
    const rollChange = Math.abs(currentOrientation.roll - lastOrientation.roll);
    const pitchChange = Math.abs(currentOrientation.pitch - lastOrientation.pitch);
    
    // Seuil de changement significatif (30°)
    const significantChange = rollChange > Math.PI/6 || pitchChange > Math.PI/6;
    
    if (significantChange) {
      console.log(`[POSTURE] Changement détecté - Roll: ${(rollChange * 180/Math.PI).toFixed(1)}°, Pitch: ${(pitchChange * 180/Math.PI).toFixed(1)}°`);
      
      // Mettre à jour la référence
      this.lastPostureCheck = {
        gravity: { ...accelerometer },
        timestamp: currentTime,
        orientation: currentOrientation
      };
      
      return true;
    }
    
    // Mise à jour périodique de la référence
    this.lastPostureCheck.timestamp = currentTime;
    return false;
  }

  /**
   * *** NOUVEAU: Calculer l'orientation du téléphone à partir de l'accéléromètre ***
   */
  calculatePhoneOrientation(accelerometer) {
    const accNorm = Math.sqrt(
      accelerometer.x * accelerometer.x + 
      accelerometer.y * accelerometer.y + 
      accelerometer.z * accelerometer.z
    );
    
    if (accNorm === 0) return { roll: 0, pitch: 0 };
    
    const ax = accelerometer.x / accNorm;
    const ay = accelerometer.y / accNorm;
    const az = accelerometer.z / accNorm;
    
    const roll = Math.atan2(ay, az);
    const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
    
    return { roll, pitch };
  }

  /**
   * *** NOUVEAU: Permettre la recalibration dynamique ***
   */
  triggerRecalibration(reason = 'manual') {
    console.log(`[RECALIBRATION] Déclenchement: ${reason}`);
    
    // Réinitialiser l'état de calibration dynamique
    this.dynamicOrientationState = {
      isCalibrating: false,
      isCalibrated: false,
      stepHistory: [],
      magneticHeadingHistory: [],
      calculatedOffset: 0,
      confidence: 0
    };
    
    // Réinitialiser l'offset magnétique
    this.magneticOffset = undefined;
    
    // Notifier l'UI
    if (this.callbacks.onCalibrationProgress) {
      this.callbacks.onCalibrationProgress({
        step: 'recalibration_started',
        progress: 0,
        message: `Recalibration démarrée (${reason})`,
        reason: reason
      });
    }
    
    return true;
  }

  /**
   * *** NOUVEAU: Configuration du mode d'orientation ***
   */
  setOrientationMode(mode) {
    try {
      console.log(`Mode orientation changé: ${mode}`);
      
      switch (mode) {
        case 'native_compass':
          // Activer la boussole native
          this.continuousOrientationService.setContinuousMode(true);
          return true;
          
        case 'pdr_gyro':
        case 'pdr_fallback':
          // Désactiver la boussole native, utiliser PDR/gyro
          this.continuousOrientationService.setContinuousMode(false);
          return true;
          
        default:
          console.warn(`Mode d'orientation non supporté: ${mode}`);
          return false;
      }
    } catch (error) {
      console.error('Erreur changement mode orientation:', error);
      return false;
    }
  }
} 