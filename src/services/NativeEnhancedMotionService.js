import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Service de mouvement amélioré utilisant Expo Pedometer
 * avec calculs optimisés pour la longueur de pas.
 * 
 * Avantages :
 * - Utilise les données natives du podomètre quand disponibles
 * - Calculs adaptatifs de longueur de pas
 * - Fallback intelligent
 * - Code simplifié et robuste
 */
export default class NativeEnhancedMotionService {
  constructor(onStep, onHeading) {
    this.onStep = onStep || (() => {});           // callback : handleStepDetected(stepData) avec fallback
    this.onHeading = onHeading || (() => {});     // callback : handleHeading(headingData) avec fallback
    
    // État du service
    this.isRunning = false;
    this.sessionStartTime = null;
    this.stepCount = 0;
    
    // Orientation filtrée
    this.filteredYaw = null;
    this.alphaYaw = 0.1;            // Facteur de lissage orientation
    
    // Subscriptions
    this.headingSub = null;
    this.pedometerSub = null;
    
    // Données de pas pour calculs adaptatifs
    this.lastStepTime = null;
    this.stepHistory = [];
    this.maxHistorySize = 10;
    
    // Métriques
    this.metrics = {
      totalSteps: 0,
      totalDistance: 0,
      averageStepLength: 0.79,      // Valeur par défaut
      lastUpdate: null,
      nativeAvailable: false,
      usingNativeStepLength: false,
      adaptiveStepLength: 0.79
    };
  }

  /**
   * Démarrage du service
   */
  async start() {
    console.log('🚀 [NATIVE-ENHANCED] ========================================');
    console.log('🚀 [NATIVE-ENHANCED] Démarrage NativeEnhancedMotionService...');
    console.log('🚀 [NATIVE-ENHANCED] ========================================');
    
    try {
      this.sessionStartTime = new Date();
      this.stepCount = 0;
      this.stepHistory = [];
      
      // Démarrage du podomètre Expo (toujours disponible)
      await this._startPedometer();
      
      // Démarrage de l'orientation
      await this._startCompass();
      
      this.isRunning = true;
      
      console.log('🚀 [NATIVE-ENHANCED] ========================================');
      console.log('✅ [NATIVE-ENHANCED] Service démarré avec succès');
      console.log('✅ [NATIVE-ENHANCED] Mode: Expo Pedometer avec calculs adaptatifs');
      console.log('🚀 [NATIVE-ENHANCED] ========================================');
      
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur démarrage service:', error);
      throw error;
    }
  }

  /**
   * Démarrage du podomètre avec calculs adaptatifs
   */
  async _startPedometer() {
    try {
      console.log('📱 [NATIVE-ENHANCED] Démarrage Expo Pedometer...');
      
      // Vérification de la disponibilité
      const available = await Pedometer.isAvailableAsync();
      if (!available) {
        throw new Error('Podomètre non disponible sur cet appareil');
      }
      
      // Demande de permissions
      const { status } = await Pedometer.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Permissions podomètre refusées');
      }
      
      // Démarrage du suivi avec calculs adaptatifs
      let lastStepCount = 0;
      this.pedometerSub = Pedometer.watchStepCount(result => {
        const newSteps = result.steps - lastStepCount;
        if (newSteps > 0) {
          const now = Date.now();
          
          // Traitement de chaque nouveau pas
          for (let i = 0; i < newSteps; i++) {
            this._handleAdaptiveStep(now);
          }
          
          lastStepCount = result.steps;
        }
      });
      
      this.metrics.nativeAvailable = true;
      console.log('✅ [NATIVE-ENHANCED] Expo Pedometer démarré avec calculs adaptatifs');
      
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur podomètre:', error);
      throw error;
    }
  }

  /**
   * Gestion adaptative des pas avec calcul intelligent de longueur
   */
  _handleAdaptiveStep(timestamp) {
    // Calcul de la cadence si on a un pas précédent
    let cadence = 0;
    let timeDelta = 0;
    
    if (this.lastStepTime) {
      timeDelta = (timestamp - this.lastStepTime) / 1000; // en secondes
      cadence = timeDelta > 0 ? 1 / timeDelta : 0; // pas par seconde
    }
    
    // Calcul adaptatif de la longueur de pas basé sur la cadence
    let adaptiveStepLength = this._calculateAdaptiveStepLength(cadence, timeDelta);
    
    // Mise à jour de l'historique
    this.stepHistory.push({
      timestamp,
      cadence,
      stepLength: adaptiveStepLength,
      timeDelta
    });
    
    // Limitation de l'historique
    if (this.stepHistory.length > this.maxHistorySize) {
      this.stepHistory.shift();
    }
    
    // Calcul de la longueur moyenne récente
    const recentSteps = this.stepHistory.slice(-5); // 5 derniers pas
    const avgStepLength = recentSteps.reduce((sum, step) => sum + step.stepLength, 0) / recentSteps.length;
    
    this.metrics.adaptiveStepLength = avgStepLength;
    this.metrics.averageStepLength = avgStepLength;
    
    console.log(`📱 [ADAPTIVE-STEP] Pas adaptatif:`);
    console.log(`  - Longueur: ${adaptiveStepLength.toFixed(3)}m`);
    console.log(`  - Cadence: ${cadence.toFixed(2)} pas/s`);
    console.log(`  - Moyenne récente: ${avgStepLength.toFixed(3)}m`);
    
    // Calcul de la position
    const yawRadians = this.filteredYaw ? (this.filteredYaw * Math.PI / 180) : 0;
    const dx = adaptiveStepLength * Math.cos(yawRadians);
    const dy = adaptiveStepLength * Math.sin(yawRadians);
    
    this.stepCount++;
    this.metrics.totalSteps = this.stepCount;
    this.metrics.totalDistance += adaptiveStepLength;
    this.metrics.lastUpdate = timestamp;
    this.lastStepTime = timestamp;
    
    // Callback avec données adaptatives
    if (this.onStep && typeof this.onStep === 'function') {
      this.onStep({
        stepCount: this.stepCount,
        stepLength: adaptiveStepLength,
        dx, 
        dy,
        timestamp,
        totalSteps: this.stepCount,
        totalDistance: this.metrics.totalDistance,
        confidence: this._calculateConfidence(cadence, recentSteps.length),
        source: 'adaptive_expo',
        cadence,
        averageStepLength: avgStepLength,
        timeDelta
      });
    }
  }

  /**
   * Calcul adaptatif de la longueur de pas basé sur la cadence
   */
  _calculateAdaptiveStepLength(cadence, timeDelta) {
    const baseStepLength = 0.79; // Longueur de base (mètres)
    
    // Si pas de cadence (premier pas), utiliser la base
    if (cadence === 0 || timeDelta === 0) {
      return baseStepLength;
    }
    
    // Formule adaptative basée sur la recherche biomécanique
    // Cadence normale : 1.5-2.5 pas/seconde
    // Pas plus rapides = plus courts, pas plus lents = plus longs
    
    let adaptationFactor = 1.0;
    
    if (cadence > 2.5) {
      // Pas très rapides (course) - longueur réduite
      adaptationFactor = 0.85 + (3.0 - cadence) * 0.1;
    } else if (cadence < 1.0) {
      // Pas très lents - longueur augmentée
      adaptationFactor = 1.15 + (1.0 - cadence) * 0.2;
    } else {
      // Cadence normale - ajustement léger
      const normalizedCadence = (cadence - 1.5) / 1.0; // -0.5 à 1.0
      adaptationFactor = 1.0 - normalizedCadence * 0.1;
    }
    
    // Limitation des variations extrêmes
    adaptationFactor = Math.max(0.6, Math.min(1.4, adaptationFactor));
    
    return baseStepLength * adaptationFactor;
  }

  /**
   * Calcul de la confiance basé sur la cohérence des données
   */
  _calculateConfidence(cadence, historySize) {
    let confidence = 0.7; // Base
    
    // Bonus pour cadence normale
    if (cadence >= 1.0 && cadence <= 3.0) {
      confidence += 0.1;
    }
    
    // Bonus pour historique suffisant
    if (historySize >= 5) {
      confidence += 0.1;
    }
    
    // Bonus pour cohérence de l'historique
    if (this.stepHistory.length >= 3) {
      const recentCadences = this.stepHistory.slice(-3).map(s => s.cadence);
      const avgCadence = recentCadences.reduce((sum, c) => sum + c, 0) / recentCadences.length;
      const variance = recentCadences.reduce((sum, c) => sum + Math.pow(c - avgCadence, 2), 0) / recentCadences.length;
      
      if (variance < 0.5) { // Cadence stable
        confidence += 0.1;
      }
    }
    
    return Math.min(0.95, confidence);
  }

  /**
   * Démarrage de la boussole
   */
  async _startCompass() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Permission localisation refusée');
      }
      
      this.headingSub = await Location.watchHeadingAsync(
        h => this._handleHeading(h),
        {
          accuracy: Location.LocationAccuracy.High,
          timeInterval: 100,  // 10Hz
          distanceInterval: 0
        }
      );
      
      console.log('🧭 [NATIVE-ENHANCED] Boussole démarrée');
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur boussole:', error);
      throw error;
    }
  }

  /**
   * Gestion de l'orientation avec filtrage
   */
  _handleHeading({ trueHeading, accuracy, timestamp }) {
    // Normalisation de l'angle
    let normalizedHeading = trueHeading;
    while (normalizedHeading >= 360) normalizedHeading -= 360;
    while (normalizedHeading < 0) normalizedHeading += 360;
    
    // Filtrage adaptatif
    const adaptiveAlpha = accuracy < 10 ? this.alphaYaw * 1.5 : 
                         accuracy > 30 ? this.alphaYaw * 0.5 : this.alphaYaw;
    
    if (this.filteredYaw == null) {
      this.filteredYaw = normalizedHeading;
    } else {
      // Gestion du passage 0°/360°
      let angleDiff = normalizedHeading - this.filteredYaw;
      if (angleDiff > 180) angleDiff -= 360;
      else if (angleDiff < -180) angleDiff += 360;
      
      this.filteredYaw += adaptiveAlpha * angleDiff;
      
      // Normalisation du résultat
      while (this.filteredYaw >= 360) this.filteredYaw -= 360;
      while (this.filteredYaw < 0) this.filteredYaw += 360;
    }

    // Vérification que le callback existe avant de l'appeler
    if (this.onHeading && typeof this.onHeading === 'function') {
      this.onHeading({
        yaw: this.filteredYaw * Math.PI / 180,
        accuracy,
        timestamp,
        rawHeading: normalizedHeading,
        filteredHeading: this.filteredYaw,
        adaptiveAlpha,
        source: 'compass'
      });
    }
  }

  /**
   * Réinitialisation
   */
  async reset() {
    this.stepCount = 0;
    this.filteredYaw = null;
    this.sessionStartTime = new Date();
    this.lastStepTime = null;
    this.stepHistory = [];
    this.metrics.totalSteps = 0;
    this.metrics.totalDistance = 0;
    this.metrics.adaptiveStepLength = 0.79;
    
    console.log('🔄 [NATIVE-ENHANCED] Service réinitialisé');
  }

  /**
   * Obtenir les statistiques
   */
  getStats() {
    return {
      stepCount: this.stepCount,
      filteredYaw: this.filteredYaw,
      sessionDuration: this.sessionStartTime ? 
        (Date.now() - this.sessionStartTime.getTime()) / 1000 : 0,
      metrics: this.metrics,
      isRunning: this.isRunning,
      platform: Platform.OS,
      stepHistory: this.stepHistory.slice(-5) // 5 derniers pas pour debug
    };
  }

  /**
   * Arrêt du service
   */
  async stop() {
    console.log('🛑 [NATIVE-ENHANCED] Arrêt du service...');
    
    // Arrêt du podomètre
    if (this.pedometerSub) {
      this.pedometerSub.remove();
      this.pedometerSub = null;
    }
    
    // Arrêt de la boussole
    if (this.headingSub) {
      this.headingSub.remove();
      this.headingSub = null;
    }
    
    this.isRunning = false;
    
    const sessionDuration = this.sessionStartTime ? 
      (Date.now() - this.sessionStartTime.getTime()) / 1000 : 0;
    
    console.log('🛑 [NATIVE-ENHANCED] Service arrêté');
    console.log(`📊 Session: ${this.stepCount} pas en ${sessionDuration.toFixed(1)}s`);
    console.log(`📏 Longueur de pas adaptative: ${this.metrics.adaptiveStepLength.toFixed(3)}m`);
    console.log(`🎯 Mode utilisé: ADAPTATIF Expo Pedometer`);
  }
} 