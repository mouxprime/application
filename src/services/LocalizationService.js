import { SensorManager } from '../sensors/SensorManager';
import { AttitudeService } from './AttitudeService';
import { PedestrianDeadReckoning } from '../algorithms/PedestrianDeadReckoning';
import { AdvancedEKF } from '../algorithms/AdvancedEKF';

/**
 * Service principal de localisation avec suivi d'attitude continu
 * Coordonne tous les composants et intègre la re-calibration automatique
 */
export class LocalizationService {
  constructor(localizationActions) {
    this.localizationActions = localizationActions;
    
    // Initialisation des composants
    this.sensorManager = new SensorManager({
      updateInterval: 20, // 50Hz
      smoothingFactor: 0.8,
      calibrationSamples: 100
    });
    
    this.attitudeService = new AttitudeService(localizationActions);
    
    this.pdrAlgorithm = new PedestrianDeadReckoning();
    this.ekfAlgorithm = new AdvancedEKF();
    
    // État du service
    this.isRunning = false;
    this.lastUpdateTime = 0;
    this.updateInterval = null;
    
    // Métriques de performance
    this.performanceMetrics = {
      updateCount: 0,
      avgUpdateInterval: 0,
      lastProcessingTime: 0
    };
    
    this.setupSensorDataFlow();
    
    console.log('LocalizationService initialisé avec suivi d\'attitude continu');
  }

  /**
   * Configuration du flux de données entre composants
   */
  setupSensorDataFlow() {
    // Configuration du callback pour données capteurs
    this.sensorManager.setDataUpdateCallback((sensorData) => {
      this.processSensorUpdate(sensorData);
    });
    
    // Configuration des callbacks d'attitude pour l'UI
    this.attitudeService.setExternalCallbacks({
      onRecalibrationComplete: (data) => {
        console.log('🔄 Re-calibration complète détectée par LocalizationService');
        // Ici on peut ajouter des notifications UI si nécessaire
      },
      onStabilityChange: (isStable, variance, gyroMag) => {
        console.log(`📱 Changement stabilité: ${isStable ? 'STABLE' : 'INSTABLE'}`);
        // Peut être utilisé pour adapter les paramètres d'autres algorithmes
      }
    });
  }

  /**
   * Traitement principal des mises à jour capteurs
   */
  processSensorUpdate(sensorData) {
    const startTime = performance.now();
    
    // 1. Mise à jour du contexte avec les données brutes
    this.localizationActions.updateSensors({
      accelerometer: sensorData.accelerometer,
      gyroscope: sensorData.gyroscope,
      magnetometer: sensorData.magnetometer
    });
    
    // 2. Mise à jour du suivi d'attitude (avec re-calibration automatique)
    this.attitudeService.updateSensorData(
      sensorData.accelerometer,
      sensorData.gyroscope,
      sensorData.magnetometer
    );
    
    // 3. Transformation des données capteurs dans le repère corps
    const transformedAcc = this.attitudeService.transformAcceleration(sensorData.accelerometer);
    const transformedGyro = this.attitudeService.transformGyroscope(sensorData.gyroscope);
    
    // 4. Mise à jour des algorithmes de localisation avec données transformées
    if (this.attitudeService.isTransforming()) {
      // Utiliser les données transformées si l'attitude est calibrée
      this.updateLocalizationAlgorithms(transformedAcc, transformedGyro, sensorData.magnetometer);
    } else {
      // Utiliser les données brutes en attendant la calibration
      this.updateLocalizationAlgorithms(sensorData.accelerometer, sensorData.gyroscope, sensorData.magnetometer);
    }
    
    // 5. Mise à jour des métriques de performance
    this.updatePerformanceMetrics(startTime);
  }

  /**
   * Mise à jour des algorithmes de localisation
   */
  updateLocalizationAlgorithms(acceleration, gyroscope, magnetometer) {
    // Mise à jour PDR avec données compensées d'orientation
    const pdrResult = this.pdrAlgorithm.updateWithSensorData(
      acceleration,
      gyroscope,
      magnetometer
    );
    
    // Mise à jour EKF avec les résultats PDR
    if (pdrResult && pdrResult.hasValidStep) {
      const ekfResult = this.ekfAlgorithm.updateStep(
        pdrResult.position,
        pdrResult.heading,
        pdrResult.stepLength,
        pdrResult.confidence
      );
      
      // Mise à jour de la pose finale
      if (ekfResult) {
        this.localizationActions.updatePose({
          x: ekfResult.position.x,
          y: ekfResult.position.y,
          theta: ekfResult.heading,
          confidence: ekfResult.confidence
        });
        
        // Ajout du point à la trajectoire
        this.localizationActions.addTrajectoryPoint({
          x: ekfResult.position.x,
          y: ekfResult.position.y,
          timestamp: Date.now(),
          confidence: ekfResult.confidence
        });
      }
    }
    
    // Mise à jour des métriques PDR
    const pdrMetrics = this.pdrAlgorithm.getMetrics();
    this.localizationActions.updatePDRMetrics({
      currentMode: pdrMetrics.currentMode,
      stepCount: pdrMetrics.stepCount,
      distance: pdrMetrics.totalDistance,
      energyLevel: pdrMetrics.energyLevel,
      isZUPT: pdrMetrics.isZUPT
    });
  }

  /**
   * Démarrage du service de localisation
   */
  async start() {
    if (this.isRunning) {
      console.warn('LocalizationService déjà en fonctionnement');
      return;
    }
    
    try {
      // 1. Initialisation et démarrage des capteurs
      if (!this.sensorManager.isInitialized) {
        await this.sensorManager.initialize();
      }
      await this.sensorManager.startAll();
      
      // 2. Marquer comme en fonctionnement
      this.isRunning = true;
      this.localizationActions.setTracking(true);
      
      console.log('✅ LocalizationService démarré avec succès');
      console.log('🎯 Suivi d\'attitude continu activé');
      console.log('🔄 Re-calibration automatique opérationnelle');
      
    } catch (error) {
      console.error('❌ Erreur démarrage LocalizationService:', error);
      throw error;
    }
  }

  /**
   * Arrêt du service de localisation
   */
  stop() {
    if (!this.isRunning) return;
    
    // Arrêt des capteurs
    this.sensorManager.stopAll();
    
    // Nettoyage
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.isRunning = false;
    this.localizationActions.setTracking(false);
    
    console.log('🛑 LocalizationService arrêté');
  }

  /**
   * Calibration initiale des capteurs (téléphone à plat)
   */
  async calibrateSensors(progressCallback) {
    console.log('📱 Démarrage calibration capteurs (téléphone à plat)');
    
    return new Promise((resolve, reject) => {
      this.sensorManager.startCalibration((progress, completed) => {
        if (progressCallback) {
          progressCallback(progress);
        }
        
        if (completed) {
          console.log('✅ Calibration capteurs terminée');
          resolve();
        }
      });
    });
  }

  /**
   * Force une re-calibration manuelle de l'attitude
   */
  forceAttitudeRecalibration() {
    if (!this.sensorManager.isActive) {
      console.warn('Capteurs non actifs - impossible de re-calibrer');
      return;
    }
    
    const currentData = this.sensorManager.getCurrentData();
    this.attitudeService.forceRecalibration(
      currentData.accelerometer,
      currentData.gyroscope
    );
  }

  /**
   * Configuration des paramètres d'attitude
   */
  configureAttitude(config) {
    const {
      autoRecalibration,
      stabilityThresholds,
      filterGain
    } = config;
    
    if (autoRecalibration !== undefined) {
      this.attitudeService.setAutoRecalibration(autoRecalibration);
    }
    
    if (stabilityThresholds) {
      this.attitudeService.setStabilityThresholds(
        stabilityThresholds.acceleration,
        stabilityThresholds.gyroscope
      );
    }
    
    if (filterGain !== undefined) {
      this.attitudeService.setFilterGain(filterGain);
    }
  }

  /**
   * Obtient l'état complet du système
   */
  getSystemStatus() {
    return {
      // État général
      isRunning: this.isRunning,
      sensorsReady: this.sensorManager.isActive,
      sensorsCalibrated: this.sensorManager.isCalibrated,
      
      // État attitude
      attitude: this.attitudeService.getStatus(),
      
      // Métriques de performance
      performance: {
        ...this.performanceMetrics,
        attitudeMetrics: this.attitudeService.getPerformanceMetrics()
      },
      
      // État algorithmes
      pdr: this.pdrAlgorithm.getMetrics(),
      ekf: this.ekfAlgorithm.getState()
    };
  }

  /**
   * Mise à jour des métriques de performance
   */
  updatePerformanceMetrics(startTime) {
    const processingTime = performance.now() - startTime;
    const currentTime = Date.now();
    
    this.performanceMetrics.updateCount++;
    this.performanceMetrics.lastProcessingTime = processingTime;
    
    if (this.lastUpdateTime > 0) {
      const interval = currentTime - this.lastUpdateTime;
      this.performanceMetrics.avgUpdateInterval = 
        (this.performanceMetrics.avgUpdateInterval * 0.9) + (interval * 0.1);
    }
    
    this.lastUpdateTime = currentTime;
  }

  /**
   * Obtient les données actuelles des capteurs transformées
   */
  getCurrentTransformedData() {
    if (!this.sensorManager.isActive) return null;
    
    const rawData = this.sensorManager.getCurrentData();
    
    return {
      raw: rawData,
      transformed: {
        accelerometer: this.attitudeService.transformAcceleration(rawData.accelerometer),
        gyroscope: this.attitudeService.transformGyroscope(rawData.gyroscope),
        magnetometer: rawData.magnetometer
      },
      isTransformed: this.attitudeService.isTransforming(),
      attitude: this.attitudeService.getStatus()
    };
  }

  /**
   * Réinitialisation complète du système
   */
  reset() {
    this.stop();
    
    // Reset des composants
    this.sensorManager.resetCalibration();
    this.attitudeService.reset();
    this.pdrAlgorithm.reset();
    this.ekfAlgorithm.reset();
    
    // Reset des métriques
    this.performanceMetrics = {
      updateCount: 0,
      avgUpdateInterval: 0,
      lastProcessingTime: 0
    };
    
    this.lastUpdateTime = 0;
    
    console.log('🔄 LocalizationService réinitialisé complètement');
  }

  /**
   * Configuration avancée pour debug/tuning
   */
  setDebugMode(enabled) {
    if (enabled) {
      console.log('🐛 Mode debug activé pour LocalizationService');
      // Activer logs détaillés des algorithmes
      this.pdrAlgorithm.setDebugMode?.(true);
      this.ekfAlgorithm.setDebugMode?.(true);
    } else {
      console.log('🐛 Mode debug désactivé');
      this.pdrAlgorithm.setDebugMode?.(false);
      this.ekfAlgorithm.setDebugMode?.(false);
    }
  }
} 