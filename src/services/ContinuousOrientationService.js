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

    // *** FIX: Utiliser directement l'orientation native sans correction ***
    // La boussole native iOS est déjà optimisée et se corrige automatiquement
    // Pas besoin de conversion - utiliser la valeur native directement
    const headingDegrees = nativeHeading;
    
    // Conversion en radians pour les calculs internes
    const headingRadians = (headingDegrees * Math.PI) / 180;

    // Log simplifié
    console.log(`🧭 [ORIENTATION] Native: ${headingDegrees.toFixed(1)}° → Radians: ${headingRadians.toFixed(3)}`);

    // Mise à jour de l'état
    this.orientationState.currentHeading = headingRadians;
    this.orientationState.accuracy = accuracy;
    this.orientationState.lastUpdate = currentTime;

    // Callback vers les abonnés
    if (this.onOrientationUpdate) {
      this.onOrientationUpdate({
        heading: headingRadians,
        headingDegrees: headingDegrees,
        accuracy: accuracy,
        confidence: this.calculateConfidence(accuracy),
        source: 'native_compass',
        timestamp: currentTime
      });
    }

    // Détection de dérive
    this.detectDrift(accuracy);
  }

  /**
   * Calcul de la confiance basée sur accuracy
   */
  calculateConfidence(accuracy) {
    return Math.max(0, Math.min(1, 1 - (accuracy / this.config.accuracyDriftThreshold)));
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
        heading: this.orientationState.currentHeading,
        rawHeading: this.orientationState.currentHeading,
        accuracy: this.orientationState.accuracy,
        confidence: this.calculateConfidence(this.orientationState.accuracy),
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
      heading: this.orientationState.currentHeading,
      rawHeading: this.orientationState.currentHeading,
      accuracy: this.orientationState.accuracy,
      confidence: this.calculateConfidence(this.orientationState.accuracy),
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