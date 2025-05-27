import { AttitudeTracker } from '../algorithms/AttitudeTracker';
import { OrientationCalibrator } from '../algorithms/OrientationCalibrator';

/**
 * Service d'orientation continue unifié
 * Utilise l'AttitudeTracker en continu pour maintenir une orientation stable
 * même lors des changements de posture (main ↔ poche)
 * 
 * Implémente l'approche Apple : fusion de capteurs continue + calibrations statiques immédiates
 */
export class ContinuousOrientationService {
  constructor(config = {}) {
    this.config = {
      // Paramètres de fusion continue
      continuousFusion: {
        enabled: config.continuousFusion?.enabled !== false,
        updateRate: config.continuousFusion?.updateRate || 50, // 50Hz
        smoothingAlpha: config.continuousFusion?.smoothingAlpha || 0.1, // Lissage exponentiel
        magneticConfidenceThreshold: config.continuousFusion?.magneticConfidenceThreshold || 0.3
      },
      
      // Détection de changement de posture
      postureDetection: {
        enabled: config.postureDetection?.enabled !== false,
        orientationChangeThreshold: config.postureDetection?.orientationChangeThreshold || Math.PI / 4, // 45°
        accelerationChangeThreshold: config.postureDetection?.accelerationChangeThreshold || 2.0, // 2 m/s²
        detectionWindow: config.postureDetection?.detectionWindow || 1000, // 1s
        stabilityRequiredAfterChange: config.postureDetection?.stabilityRequiredAfterChange || 500 // 500ms
      },
      
      // Calibration statique immédiate
      immediateCalibration: {
        enabled: config.immediateCalibration?.enabled !== false,
        duration: config.immediateCalibration?.duration || 2000, // 2s au lieu de 5s
        samplesRequired: config.immediateCalibration?.samplesRequired || 20, // Réduit pour rapidité
        gravityThreshold: config.immediateCalibration?.gravityThreshold || 0.5, // Plus tolérant
        gyroThreshold: config.immediateCalibration?.gyroThreshold || 0.3, // Plus tolérant
        autoTriggerOnPostureChange: config.immediateCalibration?.autoTriggerOnPostureChange !== false
      },
      
      ...config
    };

    // AttitudeTracker principal pour fusion continue
    this.attitudeTracker = new AttitudeTracker({
      beta: 0.15, // Gain légèrement plus agressif pour réactivité
      stabilityAccThreshold: 0.3,
      stabilityGyroThreshold: 0.15,
      stabilityDuration: 1500,
      magConfidenceThreshold: this.config.continuousFusion.magneticConfidenceThreshold,
      autoRecalibrationEnabled: true,
      recalibrationInterval: 20000 // 20s entre recalibrations auto
    });

    // Calibrateur statique pour recalibrations immédiates
    this.staticCalibrator = new OrientationCalibrator({
      calibrationDuration: this.config.immediateCalibration.duration,
      samplesRequired: this.config.immediateCalibration.samplesRequired,
      gravityThreshold: this.config.immediateCalibration.gravityThreshold,
      gyroThreshold: this.config.immediateCalibration.gyroThreshold,
      tolerantMode: true,
      maxCalibrationTime: this.config.immediateCalibration.duration + 1000
    });

    // État de l'orientation continue
    this.orientationState = {
      currentHeading: 0, // Orientation actuelle (radians)
      smoothedHeading: 0, // Orientation lissée
      confidence: 0, // Confiance dans l'orientation [0-1]
      isStable: false, // Stabilité actuelle
      lastUpdate: 0,
      
      // Historique pour détection de changements
      headingHistory: [],
      accelerationHistory: [],
      
      // État de calibration
      isCalibrating: false,
      lastCalibrationTime: 0,
      calibrationReason: null
    };

    // Détection de changement de posture
    this.postureState = {
      lastPostureChangeTime: 0,
      isPostureChangeDetected: false,
      stabilityCountdown: 0,
      previousOrientation: null,
      previousAcceleration: null
    };

    // Callbacks
    this.onOrientationUpdate = null;
    this.onPostureChange = null;
    this.onCalibrationStart = null;
    this.onCalibrationComplete = null;

    // Configuration des callbacks internes
    this.setupCallbacks();

    console.log('ContinuousOrientationService initialisé - Mode fusion continue activé');
  }

  /**
   * Configuration des callbacks internes
   */
  setupCallbacks() {
    // Callback AttitudeTracker
    this.attitudeTracker.onAttitudeUpdate = (attitudeData) => {
      this.processAttitudeUpdate(attitudeData);
    };

    this.attitudeTracker.onRecalibration = (result) => {
      console.log('Recalibration automatique AttitudeTracker terminée');
      this.orientationState.lastCalibrationTime = Date.now();
      this.orientationState.calibrationReason = 'automatic_attitude';
      
      if (this.onCalibrationComplete) {
        this.onCalibrationComplete({
          type: 'automatic',
          source: 'attitude_tracker',
          ...result
        });
      }
    };

    this.attitudeTracker.onStabilityChange = (isStable) => {
      this.orientationState.isStable = isStable;
      
      // Si stabilité retrouvée après changement de posture, vérifier si calibration nécessaire
      if (isStable && this.postureState.isPostureChangeDetected) {
        this.postureState.stabilityCountdown = this.config.postureDetection.stabilityRequiredAfterChange;
      }
    };

    // Callbacks calibrateur statique
    this.staticCalibrator.setCallbacks({
      onProgress: (progress, message) => {
        if (this.onCalibrationStart && progress === 0) {
          this.onCalibrationStart({
            type: 'immediate_static',
            reason: this.orientationState.calibrationReason,
            estimatedDuration: this.config.immediateCalibration.duration
          });
        }
      },
      onComplete: (rotationMatrix, avgAcceleration) => {
        this.handleStaticCalibrationComplete(rotationMatrix, avgAcceleration);
      }
    });
  }

  /**
   * Mise à jour principale avec données capteurs
   */
  update(accelerometer, gyroscope, magnetometer = null) {
    const currentTime = Date.now();
    
    // Éviter les mises à jour trop fréquentes
    if (currentTime - this.orientationState.lastUpdate < (1000 / this.config.continuousFusion.updateRate)) {
      return;
    }

    // 1. Mise à jour AttitudeTracker (fusion continue)
    this.attitudeTracker.update(accelerometer, gyroscope, magnetometer);

    // 2. Détection de changement de posture
    if (this.config.postureDetection.enabled) {
      this.detectPostureChange(accelerometer, gyroscope);
    }

    // 3. Gestion calibration statique en cours
    if (this.orientationState.isCalibrating) {
      const calibrationComplete = this.staticCalibrator.addCalibrationSample(accelerometer, gyroscope);
      if (calibrationComplete) {
        this.orientationState.isCalibrating = false;
      }
    }

    // 4. Vérification déclenchement calibration immédiate
    this.checkImmediateCalibrationTrigger();

    this.orientationState.lastUpdate = currentTime;
  }

  /**
   * Traitement des mises à jour d'attitude du filtre continu
   */
  processAttitudeUpdate(attitudeData) {
    const { quaternion, isStable, magneticConfidence } = attitudeData;
    
    // Conversion quaternion vers cap (yaw)
    const heading = this.quaternionToHeading(quaternion);
    
    // Mise à jour état
    this.orientationState.currentHeading = heading;
    this.orientationState.confidence = magneticConfidence;
    this.orientationState.isStable = isStable;

    // Application du lissage exponentiel pour éviter les à-coups
    const alpha = this.config.continuousFusion.smoothingAlpha;
    const currentSmoothed = this.orientationState.smoothedHeading;
    
    // Gérer le passage par ±π pour le lissage
    let angleDiff = heading - currentSmoothed;
    if (Math.abs(angleDiff) > Math.PI) {
      if (angleDiff > 0) {
        angleDiff -= 2 * Math.PI;
      } else {
        angleDiff += 2 * Math.PI;
      }
    }
    
    this.orientationState.smoothedHeading = this.normalizeAngle(currentSmoothed + alpha * angleDiff);

    // Mise à jour historique pour détection de changements
    this.updateOrientationHistory();

    // Notification
    if (this.onOrientationUpdate) {
      this.onOrientationUpdate({
        heading: this.orientationState.smoothedHeading,
        rawHeading: this.orientationState.currentHeading,
        confidence: this.orientationState.confidence,
        isStable: this.orientationState.isStable,
        isCalibrating: this.orientationState.isCalibrating,
        source: 'continuous_fusion'
      });
    }
  }

  /**
   * Détection de changement de posture
   */
  detectPostureChange(accelerometer, gyroscope) {
    const currentTime = Date.now();
    
    // Ajouter à l'historique d'accélération
    this.orientationState.accelerationHistory.push({
      magnitude: Math.sqrt(accelerometer.x ** 2 + accelerometer.y ** 2 + accelerometer.z ** 2),
      vector: { ...accelerometer },
      timestamp: currentTime
    });

    // Garder seulement la fenêtre de détection
    const windowStart = currentTime - this.config.postureDetection.detectionWindow;
    this.orientationState.accelerationHistory = this.orientationState.accelerationHistory.filter(
      entry => entry.timestamp >= windowStart
    );

    if (this.orientationState.accelerationHistory.length < 10) return;

    // Analyser les changements d'orientation récents
    const recentHeadings = this.orientationState.headingHistory.filter(
      entry => entry.timestamp >= windowStart
    );

    if (recentHeadings.length < 5) return;

    // Calculer variance d'orientation
    const headings = recentHeadings.map(entry => entry.heading);
    const meanHeading = headings.reduce((sum, h) => sum + h, 0) / headings.length;
    const headingVariance = headings.reduce((sum, h) => {
      const diff = this.angleDifference(h, meanHeading);
      return sum + diff ** 2;
    }, 0) / headings.length;

    // Calculer variance d'accélération
    const accelerations = this.orientationState.accelerationHistory.map(entry => entry.magnitude);
    const meanAcc = accelerations.reduce((sum, a) => sum + a, 0) / accelerations.length;
    const accVariance = accelerations.reduce((sum, a) => sum + (a - meanAcc) ** 2, 0) / accelerations.length;

    // Détecter changement de posture
    const orientationChangeDetected = headingVariance > (this.config.postureDetection.orientationChangeThreshold ** 2);
    const accelerationChangeDetected = accVariance > (this.config.postureDetection.accelerationChangeThreshold ** 2);

    if ((orientationChangeDetected || accelerationChangeDetected) && !this.postureState.isPostureChangeDetected) {
      this.postureState.isPostureChangeDetected = true;
      this.postureState.lastPostureChangeTime = currentTime;
      
      console.log('Changement de posture détecté - Préparation calibration immédiate');
      console.log(`Variance orientation: ${Math.sqrt(headingVariance).toFixed(3)} rad, Variance accélération: ${Math.sqrt(accVariance).toFixed(3)} m/s²`);
      
      if (this.onPostureChange) {
        this.onPostureChange({
          timestamp: currentTime,
          orientationVariance: headingVariance,
          accelerationVariance: accVariance,
          reason: orientationChangeDetected ? 'orientation_change' : 'acceleration_change'
        });
      }
    }

    // Décompte de stabilité après changement
    if (this.postureState.isPostureChangeDetected && this.postureState.stabilityCountdown > 0) {
      this.postureState.stabilityCountdown -= (currentTime - this.orientationState.lastUpdate);
      
      if (this.postureState.stabilityCountdown <= 0) {
        this.postureState.isPostureChangeDetected = false;
        console.log('Période de stabilité post-changement terminée');
      }
    }
  }

  /**
   * Vérification déclenchement calibration immédiate
   */
  checkImmediateCalibrationTrigger() {
    if (!this.config.immediateCalibration.enabled) return;
    if (this.orientationState.isCalibrating) return;

    const currentTime = Date.now();
    const timeSinceLastCalibration = currentTime - this.orientationState.lastCalibrationTime;
    
    // Éviter les calibrations trop fréquentes
    if (timeSinceLastCalibration < 5000) return; // 5s minimum

    // Déclenchement automatique après changement de posture
    if (this.config.immediateCalibration.autoTriggerOnPostureChange && 
        this.postureState.isPostureChangeDetected && 
        this.orientationState.isStable &&
        this.postureState.stabilityCountdown <= 0) {
      
      this.triggerImmediateCalibration('posture_change');
      return;
    }

    // Déclenchement si confiance magnétique très faible
    if (this.orientationState.confidence < 0.2 && this.orientationState.isStable) {
      this.triggerImmediateCalibration('low_magnetic_confidence');
      return;
    }
  }

  /**
   * Déclenchement d'une calibration statique immédiate
   */
  triggerImmediateCalibration(reason) {
    if (this.orientationState.isCalibrating) {
      console.warn('Calibration déjà en cours, ignorée');
      return false;
    }

    console.log(`Déclenchement calibration immédiate - Raison: ${reason}`);
    
    this.orientationState.isCalibrating = true;
    this.orientationState.calibrationReason = reason;
    this.staticCalibrator.startCalibration();
    
    return true;
  }

  /**
   * Gestion de la fin de calibration statique
   */
  handleStaticCalibrationComplete(rotationMatrix, avgAcceleration) {
    console.log('Calibration statique immédiate terminée');
    
    // Appliquer la matrice de rotation à l'AttitudeTracker
    // Cela permet de corriger immédiatement l'orientation sans attendre
    try {
      // Réinitialiser l'AttitudeTracker avec la nouvelle orientation de référence
      this.attitudeTracker.recalibrationState.calibrator.rotationMatrix = rotationMatrix;
      this.attitudeTracker.recalibrationState.calibrator.isCalibrated = true;
      
      // Forcer une mise à jour de l'orientation
      this.attitudeTracker.bodyToPhoneMatrix = rotationMatrix;
      this.attitudeTracker.phoneToBodyMatrix = math.inv(rotationMatrix);
      
      console.log('Matrice de rotation appliquée à l\'AttitudeTracker');
      
    } catch (error) {
      console.error('Erreur application matrice de rotation:', error);
    }

    this.orientationState.lastCalibrationTime = Date.now();
    this.orientationState.isCalibrating = false;
    
    // Réinitialiser l'état de changement de posture
    this.postureState.isPostureChangeDetected = false;
    this.postureState.stabilityCountdown = 0;

    if (this.onCalibrationComplete) {
      this.onCalibrationComplete({
        type: 'immediate_static',
        reason: this.orientationState.calibrationReason,
        rotationMatrix: rotationMatrix,
        avgAcceleration: avgAcceleration,
        duration: this.config.immediateCalibration.duration
      });
    }
  }

  /**
   * Mise à jour de l'historique d'orientation
   */
  updateOrientationHistory() {
    const currentTime = Date.now();
    
    this.orientationState.headingHistory.push({
      heading: this.orientationState.currentHeading,
      timestamp: currentTime
    });

    // Garder seulement les 100 dernières entrées
    if (this.orientationState.headingHistory.length > 100) {
      this.orientationState.headingHistory.shift();
    }
  }

  /**
   * Conversion quaternion vers cap (yaw)
   */
  quaternionToHeading(quaternion) {
    const { w, x, y, z } = quaternion;
    
    // Conversion quaternion vers angles d'Euler (yaw seulement)
    const yaw = Math.atan2(
      2 * (w * z + x * y),
      1 - 2 * (y * y + z * z)
    );
    
    return this.normalizeAngle(yaw);
  }

  /**
   * Normalisation d'angle [-π, π]
   */
  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * Différence angulaire normalisée
   */
  angleDifference(angle1, angle2) {
    let diff = angle1 - angle2;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }

  /**
   * Obtenir l'orientation actuelle
   */
  getCurrentOrientation() {
    return {
      heading: this.orientationState.smoothedHeading,
      rawHeading: this.orientationState.currentHeading,
      confidence: this.orientationState.confidence,
      isStable: this.orientationState.isStable,
      isCalibrating: this.orientationState.isCalibrating,
      lastCalibration: this.orientationState.lastCalibrationTime,
      source: 'continuous_fusion'
    };
  }

  /**
   * Forcer une calibration manuelle
   */
  forceCalibration() {
    return this.triggerImmediateCalibration('manual');
  }

  /**
   * Activer/désactiver le mode continu
   */
  setContinuousMode(enabled) {
    this.config.continuousFusion.enabled = enabled;
    
    if (!enabled) {
      // Arrêter les calibrations en cours
      if (this.orientationState.isCalibrating) {
        this.staticCalibrator.reset();
        this.orientationState.isCalibrating = false;
      }
    }
    
    console.log(`Mode orientation continue: ${enabled ? 'activé' : 'désactivé'}`);
  }

  /**
   * État détaillé pour debug
   */
  getDetailedStatus() {
    return {
      orientation: { ...this.orientationState },
      posture: { ...this.postureState },
      attitudeTracker: this.attitudeTracker.getStatus(),
      staticCalibrator: this.staticCalibrator.getStatus(),
      config: this.config
    };
  }

  /**
   * Réinitialisation complète
   */
  reset() {
    this.attitudeTracker.reset();
    this.staticCalibrator.reset();
    
    this.orientationState = {
      currentHeading: 0,
      smoothedHeading: 0,
      confidence: 0,
      isStable: false,
      lastUpdate: 0,
      headingHistory: [],
      accelerationHistory: [],
      isCalibrating: false,
      lastCalibrationTime: 0,
      calibrationReason: null
    };

    this.postureState = {
      lastPostureChangeTime: 0,
      isPostureChangeDetected: false,
      stabilityCountdown: 0,
      previousOrientation: null,
      previousAcceleration: null
    };

    console.log('ContinuousOrientationService réinitialisé');
  }
} 