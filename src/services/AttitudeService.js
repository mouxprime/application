import { AttitudeTracker } from '../algorithms/AttitudeTracker';

/**
 * Service de gestion de l'attitude intégré au système de localisation
 * Fait le pont entre AttitudeTracker et le contexte React
 */
export class AttitudeService {
  constructor(localizationActions) {
    this.localizationActions = localizationActions;
    
    // Initialisation de l'AttitudeTracker
    this.attitudeTracker = new AttitudeTracker({
      beta: 0.1,                          // Gain conservateur pour stabilité
      stabilityAccThreshold: 0.2,         // m/s² - assez strict pour stabilité
      stabilityGyroThreshold: 0.1,        // rad/s - assez strict pour stabilité  
      stabilityDuration: 2000,            // 2s de stabilité requise
      magConfidenceThreshold: 0.5,        // Confiance magnétique > 50%
      autoRecalibrationEnabled: true,     // Re-calibration automatique active
      recalibrationInterval: 30000        // 30s minimum entre re-calibrations
    });
    
    // Configuration des callbacks
    this.setupCallbacks();
    
    // État interne
    this.isInitialized = false;
    this.lastUpdateTime = 0;
    
    console.log('AttitudeService initialisé avec re-calibration automatique');
  }

  /**
   * Configuration des callbacks de l'AttitudeTracker
   */
  setupCallbacks() {
    this.attitudeTracker.setCallbacks({
      onAttitudeUpdate: (attitudeData) => {
        // Mise à jour du contexte avec les nouvelles données d'attitude
        this.localizationActions.updateAttitude({
          quaternion: attitudeData.quaternion,
          isStable: attitudeData.isStable,
          magneticConfidence: attitudeData.magneticConfidence,
          bodyToPhoneMatrix: attitudeData.bodyToPhoneMatrix,
          phoneToBodyMatrix: attitudeData.phoneToBodyMatrix
        });
      },
      
      onRecalibration: (recalibrationData) => {
        console.log('🔄 Re-calibration automatique terminée', {
          automatic: recalibrationData.automatic,
          timestamp: new Date(recalibrationData.timestamp).toLocaleTimeString()
        });
        
        // Mise à jour du contexte avec la nouvelle matrice
        this.localizationActions.setAttitudeRecalibration(
          recalibrationData.rotationMatrix,
          this.attitudeTracker.phoneToBodyMatrix,
          recalibrationData.timestamp
        );
        
        // Notification visuelle optionnelle (could be handled by UI)
        this.onRecalibrationComplete?.(recalibrationData);
      },
      
      onStabilityChange: (isStable, variance, gyroMag) => {
        console.log(`📱 Stabilité ${isStable ? 'DÉTECTÉE' : 'PERDUE'}`, {
          variance: variance.toFixed(3),
          gyroMagnitude: gyroMag.toFixed(3)
        });
        
        // Mise à jour de l'état de stabilité
        this.localizationActions.updateAttitude({
          isStable,
          accelerationVariance: variance,
          gyroMagnitude: gyroMag,
          stabilityDuration: isStable ? 0 : this.attitudeTracker.getStatus().stabilityDuration
        });
        
        // Notification pour l'UI
        this.onStabilityChange?.(isStable, variance, gyroMag);
      }
    });
  }

  /**
   * Mise à jour avec les données des capteurs
   */
  updateSensorData(accelerometer, gyroscope, magnetometer = null) {
    const currentTime = Date.now();
    
    // Éviter les mises à jour trop fréquentes (max 50Hz)
    if (currentTime - this.lastUpdateTime < 20) {
      return;
    }
    this.lastUpdateTime = currentTime;
    
    // Mise à jour de l'AttitudeTracker
    this.attitudeTracker.update(accelerometer, gyroscope, magnetometer);
    
    // Marquer comme initialisé après la première mise à jour
    if (!this.isInitialized) {
      this.isInitialized = true;
      console.log('AttitudeService opérationnel - Suivi d\'attitude démarré');
    }
  }

  /**
   * Transformation d'un vecteur accélération dans le repère corps
   */
  transformAcceleration(acceleration) {
    if (!this.isInitialized) {
      return acceleration; // Pas de transformation si pas initialisé
    }
    
    return this.attitudeTracker.transformAcceleration(acceleration);
  }

  /**
   * Transformation d'un vecteur gyroscope dans le repère corps
   */
  transformGyroscope(gyroscope) {
    if (!this.isInitialized) {
      return gyroscope; // Pas de transformation si pas initialisé
    }
    
    return this.attitudeTracker.transformGyroscope(gyroscope);
  }

  /**
   * Force une re-calibration manuelle
   */
  forceRecalibration(accelerometer, gyroscope) {
    console.log('🔧 Re-calibration manuelle forcée');
    this.attitudeTracker.forceRecalibration(accelerometer, gyroscope);
  }

  /**
   * Obtient l'état actuel de l'attitude
   */
  getStatus() {
    return {
      ...this.attitudeTracker.getStatus(),
      isInitialized: this.isInitialized,
      serviceReady: this.isInitialized
    };
  }

  /**
   * Vérifie si les données sont transformées (attitude calibrée)
   */
  isTransforming() {
    return this.isInitialized && 
           this.attitudeTracker.phoneToBodyMatrix !== null;
  }

  /**
   * Obtient le quaternion actuel
   */
  getQuaternion() {
    return this.attitudeTracker.quaternion;
  }

  /**
   * Obtient les matrices de rotation actuelles
   */
  getRotationMatrices() {
    return {
      bodyToPhone: this.attitudeTracker.bodyToPhoneMatrix,
      phoneToBody: this.attitudeTracker.phoneToBodyMatrix
    };
  }

  /**
   * Configuration des callbacks externes (pour l'UI)
   */
  setExternalCallbacks({ onRecalibrationComplete, onStabilityChange }) {
    this.onRecalibrationComplete = onRecalibrationComplete;
    this.onStabilityChange = onStabilityChange;
  }

  /**
   * Activation/désactivation de la re-calibration automatique
   */
  setAutoRecalibration(enabled) {
    this.attitudeTracker.config.autoRecalibrationEnabled = enabled;
    console.log(`Re-calibration automatique ${enabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
  }

  /**
   * Configuration des seuils de stabilité
   */
  setStabilityThresholds(accThreshold, gyroThreshold) {
    this.attitudeTracker.config.stabilityAccThreshold = accThreshold;
    this.attitudeTracker.config.stabilityGyroThreshold = gyroThreshold;
    console.log('Seuils de stabilité mis à jour', { accThreshold, gyroThreshold });
  }

  /**
   * Configuration du gain du filtre Madgwick
   */
  setFilterGain(beta) {
    this.attitudeTracker.config.beta = beta;
    console.log('Gain filtre Madgwick mis à jour:', beta);
  }

  /**
   * Réinitialisation complète
   */
  reset() {
    this.attitudeTracker.reset();
    this.isInitialized = false;
    this.lastUpdateTime = 0;
    console.log('AttitudeService réinitialisé');
  }

  /**
   * Métriques de performance pour debug
   */
  getPerformanceMetrics() {
    const status = this.getStatus();
    
    return {
      // État général
      isReady: this.isInitialized,
      isTransforming: this.isTransforming(),
      
      // Stabilité
      currentStability: {
        isStable: status.isStable,
        duration: status.stabilityDuration,
        accVariance: status.accelerationVariance,
        gyroMagnitude: status.gyroMagnitude
      },
      
      // Confiance magnétique
      magneticHealth: {
        confidence: status.magneticConfidence,
        isUsable: status.magneticConfidence > this.attitudeTracker.config.magConfidenceThreshold
      },
      
      // Re-calibration
      recalibrationState: {
        isRecalibrating: status.isRecalibrating,
        lastRecalibration: status.lastRecalibration,
        timeSinceLastRecal: Date.now() - status.lastRecalibration,
        autoEnabled: this.attitudeTracker.config.autoRecalibrationEnabled
      },
      
      // Quaternion et matrices
      orientation: {
        quaternion: status.quaternion,
        hasMatrices: this.attitudeTracker.phoneToBodyMatrix !== null
      }
    };
  }
} 