import * as Location from 'expo-location';

/**
 * Service d'orientation native simplifié
 * Utilise uniquement la boussole native expo-location
 * - Lissage exponentiel (α = 0.1)
 * - Notification de dérive basée sur accuracy
 * - Pas de calibration manuelle complexe
 */
export class ContinuousOrientationService {
  constructor(config = {}) {
    this.config = {
      // Lissage exponentiel
      smoothingAlpha: config.smoothingAlpha || 0.1,
      
      // Seuil de dérive pour notification recalibration
      accuracyDriftThreshold: config.accuracyDriftThreshold || 20, // degrés
      
      // Détection de dérive persistante
      driftDetection: {
        enabled: config.driftDetection?.enabled !== false,
        windowSize: config.driftDetection?.windowSize || 10, // échantillons
        notificationInterval: config.driftDetection?.notificationInterval || 30000 // 30s entre notifications
      },
      
      ...config
    };

    // État de l'orientation
    this.orientationState = {
      currentHeading: 0,     // Orientation native (radians)
      smoothedHeading: 0,    // Orientation lissée
      accuracy: 0,           // Précision native (degrés)
      confidence: 1,         // Confiance calculée [0-1]
      isActive: false,       // Service actif
      lastUpdate: 0
    };

    // Historique pour détection de dérive
    this.accuracyHistory = [];
    this.lastDriftNotification = 0;

    // Abonnement boussole native
    this.headingSubscription = null;
    this.isPermissionGranted = false;

    // Callbacks
    this.onOrientationUpdate = null;
    this.onDriftDetected = null; // Nouveau callback pour dérive

    console.log('ContinuousOrientationService (Native Simplifié) initialisé');
  }

  /**
   * Démarrage du service boussole native
   */
  async startNativeCompass() {
    try {
      // Demande de permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Permission de localisation refusée');
      }
      
      this.isPermissionGranted = true;
      console.log('Permission boussole accordée');

      // Démarrage de la surveillance du cap
      this.headingSubscription = await Location.watchHeadingAsync((headingData) => {
        this.handleNativeHeading(headingData);
      });

      this.orientationState.isActive = true;
      console.log('Boussole native démarrée');
      
      return true;

    } catch (error) {
      console.error('Erreur démarrage boussole native:', error);
      this.orientationState.isActive = false;
      return false;
    }
  }

  /**
   * Traitement des données de cap natif
   */
  handleNativeHeading(headingData) {
    const currentTime = Date.now();
    
    // Extraction des données natives
    const nativeHeading = headingData.trueHeading; // Cap compensé par inclinaison
    const accuracy = headingData.accuracy;         // Précision en degrés

    // Conversion degrés → radians
    const headingRad = (nativeHeading * Math.PI) / 180;

    // Calcul de la confiance (0-1) basée sur accuracy
    const confidence = Math.max(0, Math.min(1, 1 - (accuracy / this.config.accuracyDriftThreshold)));

    // Mise à jour état
    this.orientationState.currentHeading = headingRad;
    this.orientationState.accuracy = accuracy;
    this.orientationState.confidence = confidence;
    this.orientationState.lastUpdate = currentTime;

    // Application du lissage exponentiel
    this.applySmoothing(headingRad);

    // Détection de dérive
    this.detectDrift(accuracy);

    // Notification
    this.notifyOrientationUpdate();
  }

  /**
   * Application du lissage exponentiel
   */
  applySmoothing(newHeading) {
    const alpha = this.config.smoothingAlpha;
    const currentSmoothed = this.orientationState.smoothedHeading;
    
    // Gérer le passage par ±π pour le lissage
    let angleDiff = newHeading - currentSmoothed;
    if (Math.abs(angleDiff) > Math.PI) {
      if (angleDiff > 0) {
        angleDiff -= 2 * Math.PI;
      } else {
        angleDiff += 2 * Math.PI;
      }
    }
    
    this.orientationState.smoothedHeading = this.normalizeAngle(currentSmoothed + alpha * angleDiff);
  }

  /**
   * Détection de dérive persistante
   */
  detectDrift(accuracy) {
    if (!this.config.driftDetection.enabled) return;

    // Ajouter à l'historique
    this.accuracyHistory.push({
      accuracy: accuracy,
      timestamp: Date.now()
    });

    // Garder seulement la fenêtre d'échantillons récents
    if (this.accuracyHistory.length > this.config.driftDetection.windowSize) {
      this.accuracyHistory.shift();
    }

    // Vérifier si on a assez d'échantillons
    if (this.accuracyHistory.length < this.config.driftDetection.windowSize) return;

    // Calculer l'accuracy moyenne récente
    const avgAccuracy = this.accuracyHistory.reduce((sum, sample) => sum + sample.accuracy, 0) / this.accuracyHistory.length;

    // Détecter dérive persistante
    const isDrifting = avgAccuracy > this.config.accuracyDriftThreshold;
    const now = Date.now();
    const canNotify = (now - this.lastDriftNotification) > this.config.driftDetection.notificationInterval;

    if (isDrifting && canNotify) {
      this.lastDriftNotification = now;
      
      console.log(`Dérive détectée: accuracy moyenne ${avgAccuracy.toFixed(1)}° > seuil ${this.config.accuracyDriftThreshold}°`);
      
      // Notifier la dérive
      if (this.onDriftDetected) {
        this.onDriftDetected({
          averageAccuracy: avgAccuracy,
          threshold: this.config.accuracyDriftThreshold,
          timestamp: now,
          message: 'Veuillez effectuer un mouvement en huit pour recalibrer la boussole'
        });
      }
    }
  }

  /**
   * Notification des mises à jour d'orientation
   */
  notifyOrientationUpdate() {
    if (this.onOrientationUpdate) {
      this.onOrientationUpdate({
        heading: this.orientationState.smoothedHeading,
        rawHeading: this.orientationState.currentHeading,
        accuracy: this.orientationState.accuracy,
        confidence: this.orientationState.confidence,
        source: 'native_compass',
        lastUpdate: this.orientationState.lastUpdate
      });
    }
  }

  /**
   * Normalisation d'angle entre -π et π
   */
  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * Arrêt du service
   */
  stop() {
    if (this.headingSubscription) {
      this.headingSubscription.remove();
      this.headingSubscription = null;
    }
    
    this.orientationState.isActive = false;
    console.log('Service boussole native arrêté');
  }

  /**
   * Obtenir l'orientation actuelle
   */
  getCurrentOrientation() {
    return {
      heading: this.orientationState.smoothedHeading,
      rawHeading: this.orientationState.currentHeading,
      accuracy: this.orientationState.accuracy,
      confidence: this.orientationState.confidence,
      isActive: this.orientationState.isActive,
      source: 'native_compass',
      lastUpdate: this.orientationState.lastUpdate
    };
  }

  /**
   * Obtenir le statut détaillé
   */
  getDetailedStatus() {
    return {
      orientation: this.getCurrentOrientation(),
      permissions: {
        granted: this.isPermissionGranted
      },
      drift: {
        detectionEnabled: this.config.driftDetection.enabled,
        accuracyHistory: this.accuracyHistory.slice(-5), // 5 derniers échantillons
        threshold: this.config.accuracyDriftThreshold,
        lastNotification: this.lastDriftNotification
      }
    };
  }

  /**
   * Activer/désactiver le mode continu
   */
  async setContinuousMode(enabled) {
    if (enabled && !this.orientationState.isActive) {
      return await this.startNativeCompass();
    } else if (!enabled && this.orientationState.isActive) {
      this.stop();
      return true;
    }
    return true;
  }

  /**
   * Réinitialiser l'historique de dérive
   */
  resetDriftHistory() {
    this.accuracyHistory = [];
    this.lastDriftNotification = 0;
    console.log('Historique de dérive réinitialisé');
  }
} 