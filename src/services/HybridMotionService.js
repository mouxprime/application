// HybridMotionService.js
import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export default class HybridMotionService {
  constructor(onStep, onHeading) {
    this.onStep = onStep;           // callback : handleStepDetected(stepCount, stepLength, position)
    this.onHeading = onHeading;     // callback : handleHeading({ yaw, accuracy, timestamp })
    
    // État du podomètre natif
    this.stepCount = 0;
    this.lastStepCount = 0;
    this.sessionStartTime = null;
    this.lastStepTime = null;
    
    // Calibration dynamique de la longueur de pas
    this.dynamicStepLength = 0.7;   // valeur par défaut, sera lissée
    this.userHeight = 1.7;          // mètre, à remplacer par valeur réelle utilisateur
    this.alphaLen = 0.05;           // lissage longueur de pas
    this.alphaYaw = 0.1;            // lissage orientation
    this.filteredYaw = null;
    
    // Subscriptions
    this.pedoSub = null;
    this.headingSub = null;
    
    // Métriques de performance du podomètre natif
    this.nativeMetrics = {
      totalSteps: 0,
      totalDistance: 0,
      averagePace: 0,
      currentCadence: 0,
      isAvailable: false
    };
    
    // Configuration spécifique iOS/Android
    this.platformConfig = {
      ios: {
        useNativePace: true,
        useNativeDistance: true,
        confidenceThreshold: 0.5
      },
      android: {
        useNativePace: false, // Moins fiable sur Android
        useNativeDistance: false,
        confidenceThreshold: 0.3
      }
    };
  }

  async start() {
    try {
      // 1) Vérification de la disponibilité du podomètre natif
      const isAvailable = await Pedometer.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Podomètre natif non disponible sur cet appareil');
      }
      this.nativeMetrics.isAvailable = true;
      
      // 2) Autorisations
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        throw new Error('Permission localisation refusée');
      }
      
      const { status: motionStatus } = await Pedometer.requestPermissionsAsync();
      if (motionStatus !== 'granted') {
        throw new Error('Permission motion refusée');
      }

      // 3) Initialisation de la session
      this.sessionStartTime = new Date();
      this.lastStepCount = 0;
      
      // 4) Démarrage du podomètre natif avec optimisations iOS
      await this._startNativePedometer();

      // 5) Démarrage de la boussole native
      this.headingSub = await Location.watchHeadingAsync(
        h => this._handleHeading(h),
        {
          accuracy: Location.LocationAccuracy.High,
          timeInterval: 100, // 10Hz pour la boussole
          distanceInterval: 0
        }
      );
      
      console.log('✅ HybridMotionService démarré avec podomètre natif optimisé');
      console.log(`📱 Plateforme: ${Platform.OS}`);
      console.log(`🎯 Configuration: ${JSON.stringify(this.platformConfig[Platform.OS])}`);
      
    } catch (error) {
      console.error('❌ Erreur lors du démarrage du HybridMotionService:', error);
      throw error;
    }
  }

  /**
   * Démarrage optimisé du podomètre natif selon la plateforme
   */
  async _startNativePedometer() {
    if (Platform.OS === 'ios') {
      // Sur iOS, utiliser les capacités avancées de CMPedometer
      await this._startIOSOptimizedPedometer();
    } else {
      // Sur Android, utiliser l'implémentation standard
      await this._startStandardPedometer();
    }
  }

  /**
   * Implémentation optimisée pour iOS utilisant les fonctionnalités de CMPedometer
   */
  async _startIOSOptimizedPedometer() {
    // Démarrage du suivi en temps réel
    this.pedoSub = Pedometer.watchStepCount(result => {
      this._handleNativeStepCount(result);
    });

    // Récupération des données historiques pour calibration (dernière heure)
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 60 * 60 * 1000); // 1 heure
      
      const historicalData = await Pedometer.getStepCountAsync(startDate, endDate);
      if (historicalData.steps > 0) {
        console.log(`📊 Données historiques: ${historicalData.steps} pas sur la dernière heure`);
        this._calibrateFromHistoricalData(historicalData);
      }
    } catch (error) {
      console.warn('⚠️ Impossible de récupérer les données historiques:', error.message);
    }
  }

  /**
   * Implémentation standard pour Android et fallback
   */
  async _startStandardPedometer() {
    this.pedoSub = Pedometer.watchStepCount(result => {
      this._handleNativeStepCount(result);
    });
  }

  /**
   * Calibration basée sur les données historiques du podomètre natif
   */
  _calibrateFromHistoricalData(historicalData) {
    if (historicalData.steps > 100) { // Assez de données pour calibrer
      // Estimation de la longueur de pas basée sur l'activité récente
      const estimatedDistance = historicalData.steps * this.dynamicStepLength;
      console.log(`🎯 Calibration: ${historicalData.steps} pas = ${estimatedDistance.toFixed(1)}m estimés`);
      
      // Ajustement léger de la longueur de pas si on a des données de distance natives
      if (Platform.OS === 'ios' && historicalData.distance) {
        const nativeStepLength = historicalData.distance / historicalData.steps;
        if (nativeStepLength > 0.3 && nativeStepLength < 1.5) { // Valeurs réalistes
          this.dynamicStepLength = 
            0.7 * this.dynamicStepLength + 0.3 * nativeStepLength;
          console.log(`📏 Longueur de pas calibrée: ${this.dynamicStepLength.toFixed(3)}m`);
        }
      }
    }
  }

  /**
   * Gestion optimisée des données du podomètre natif
   */
  _handleNativeStepCount(result) {
    const currentTime = Date.now();
    const newSteps = result.steps - this.lastStepCount;
    
    if (newSteps > 0) {
      // Calcul de la cadence (pas/minute) pour ajuster la longueur de pas
      if (this.lastStepTime) {
        const timeDiff = (currentTime - this.lastStepTime) / 1000; // secondes
        const cadence = (newSteps / timeDiff) * 60; // pas/minute
        this.nativeMetrics.currentCadence = cadence;
        
        // Ajustement de la longueur de pas selon la cadence
        this._adjustStepLengthByCadence(cadence);
      }
      
      // Traitement de chaque nouveau pas
      for (let i = 0; i < newSteps; i++) {
        this._handleNativeStep(currentTime);
      }
      
      this.lastStepCount = result.steps;
      this.lastStepTime = currentTime;
      
      // Mise à jour des métriques natives
      this.nativeMetrics.totalSteps = result.steps;
      if (result.distance && Platform.OS === 'ios') {
        this.nativeMetrics.totalDistance = result.distance;
      }
    }
  }

  /**
   * Ajustement de la longueur de pas selon la cadence
   * Basé sur les recherches en biomécanique de la marche
   */
  _adjustStepLengthByCadence(cadence) {
    // Cadence normale: 100-120 pas/min
    // Cadence rapide: 120-140 pas/min
    // Cadence très rapide: >140 pas/min
    
    let cadenceFactor = 1.0;
    
    if (cadence < 90) {
      cadenceFactor = 1.1; // Marche lente = pas plus longs
    } else if (cadence > 130) {
      cadenceFactor = 0.9; // Marche rapide = pas plus courts
    }
    
    const base = this.userHeight * 0.4 * cadenceFactor;
    this.dynamicStepLength =
      (1 - this.alphaLen) * this.dynamicStepLength +
      this.alphaLen * base;
  }

  /**
   * Calibration dynamique améliorée de la longueur de pas
   */
  _updateStepLength(peakAmplitude = 1, cadence = 110) {
    const base = this.userHeight * 0.4;
    const norm = Math.min(3.0, Math.max(0.5, peakAmplitude));
    const amplitudeFactor = 0.7 + ((norm - 0.5) * 0.4 / 2.5);
    
    // Facteur de cadence pour affiner la longueur
    const cadenceFactor = cadence < 100 ? 1.1 : 
                         cadence > 130 ? 0.9 : 1.0;
    
    this.dynamicStepLength =
      (1 - this.alphaLen) * this.dynamicStepLength +
      this.alphaLen * (base * amplitudeFactor * cadenceFactor);
  }

  /**
   * Gestion de chaque pas natif détecté
   */
  _handleNativeStep(timestamp) {
    // Mise à jour avec la cadence actuelle
    this._updateStepLength(1, this.nativeMetrics.currentCadence);
    
    // Calcul de la position avec l'orientation filtrée
    const yawRadians = this.filteredYaw ? (this.filteredYaw * Math.PI / 180) : 0;
    const dx = this.dynamicStepLength * Math.cos(yawRadians);
    const dy = this.dynamicStepLength * Math.sin(yawRadians);
    
    this.stepCount++;
    
    // Callback avec données enrichies
    this.onStep({
      stepCount: this.stepCount,
      stepLength: this.dynamicStepLength,
      dx, 
      dy,
      timestamp,
      cadence: this.nativeMetrics.currentCadence,
      nativeSteps: this.nativeMetrics.totalSteps,
      confidence: this._calculateStepConfidence()
    });
  }

  /**
   * Calcul de la confiance dans la détection de pas
   */
  _calculateStepConfidence() {
    const config = this.platformConfig[Platform.OS];
    let confidence = config.confidenceThreshold;
    
    // Augmenter la confiance si la cadence est dans une plage normale
    if (this.nativeMetrics.currentCadence >= 90 && 
        this.nativeMetrics.currentCadence <= 140) {
      confidence += 0.3;
    }
    
    // Augmenter la confiance si on a des données natives de distance (iOS)
    if (Platform.OS === 'ios' && this.nativeMetrics.totalDistance > 0) {
      confidence += 0.2;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Gestion améliorée de l'orientation avec filtrage adaptatif
   */
  _handleHeading({ trueHeading, accuracy, timestamp }) {
    // Filtrage adaptatif selon la précision
    const adaptiveAlpha = accuracy < 10 ? this.alphaYaw * 1.5 : 
                         accuracy > 30 ? this.alphaYaw * 0.5 : this.alphaYaw;
    
    if (this.filteredYaw == null) {
      this.filteredYaw = trueHeading;
    } else {
      this.filteredYaw =
        adaptiveAlpha * trueHeading + (1 - adaptiveAlpha) * this.filteredYaw;
    }

    this.onHeading({
      yaw: this.filteredYaw,
      accuracy,
      timestamp,
      rawHeading: trueHeading,
      adaptiveAlpha
    });
  }

  // Méthodes utilitaires pour la configuration
  setUserHeight(height) {
    this.userHeight = height;
    console.log(`👤 Taille utilisateur mise à jour: ${height}m`);
  }

  setStepLengthSmoothing(alpha) {
    this.alphaLen = Math.max(0, Math.min(1, alpha));
    console.log(`📏 Lissage longueur de pas: ${this.alphaLen}`);
  }

  setHeadingSmoothing(alpha) {
    this.alphaYaw = Math.max(0, Math.min(1, alpha));
    console.log(`🧭 Lissage orientation: ${this.alphaYaw}`);
  }

  // Réinitialiser les compteurs
  reset() {
    this.stepCount = 0;
    this.lastStepCount = 0;
    this.filteredYaw = null;
    this.sessionStartTime = new Date();
    this.nativeMetrics.totalSteps = 0;
    this.nativeMetrics.totalDistance = 0;
    console.log('🔄 Service hybride réinitialisé');
  }

  // Obtenir les statistiques enrichies
  getStats() {
    return {
      stepCount: this.stepCount,
      dynamicStepLength: this.dynamicStepLength,
      filteredYaw: this.filteredYaw,
      userHeight: this.userHeight,
      nativeMetrics: this.nativeMetrics,
      platform: Platform.OS,
      sessionDuration: this.sessionStartTime ? 
        (Date.now() - this.sessionStartTime.getTime()) / 1000 : 0,
      confidence: this._calculateStepConfidence()
    };
  }

  /**
   * Obtenir les données natives du podomètre pour une période donnée
   */
  async getNativeStepData(startDate, endDate) {
    try {
      const data = await Pedometer.getStepCountAsync(startDate, endDate);
      console.log(`📊 Données natives: ${data.steps} pas, ${data.distance || 'N/A'}m`);
      return data;
    } catch (error) {
      console.warn('⚠️ Impossible de récupérer les données natives:', error.message);
      return null;
    }
  }

  stop() {
    if (this.pedoSub) {
      this.pedoSub.remove();
      this.pedoSub = null;
    }
    if (this.headingSub) {
      this.headingSub.remove();
      this.headingSub = null;
    }
    
    const sessionDuration = this.sessionStartTime ? 
      (Date.now() - this.sessionStartTime.getTime()) / 1000 : 0;
    
    console.log('🛑 HybridMotionService arrêté');
    console.log(`📊 Session: ${this.stepCount} pas en ${sessionDuration.toFixed(1)}s`);
    console.log(`📏 Longueur de pas finale: ${this.dynamicStepLength.toFixed(3)}m`);
  }
} 