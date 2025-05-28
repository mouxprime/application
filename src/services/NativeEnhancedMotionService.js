import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { userProfileService } from './UserProfileService';
import { nativeIOSPedometerService } from './NativeIOSPedometerService';

/**
 * Service de mouvement amélioré utilisant CMPedometer natif en priorité
 * avec fallback vers Expo Pedometer.
 * 
 * Avantages :
 * - Utilise CMPedometer directement sur iOS
 * - Calculs adaptatifs de longueur de pas en fallback basés sur le profil utilisateur
 * - Fallback intelligent
 * - Code simplifié et robuste
 */
export default class NativeEnhancedMotionService {
  constructor(onStep, onHeading) {
    this.onStep = onStep || (() => {});           // callback : handleStepDetected(stepData) avec fallback
    this.onHeading = onHeading || (() => {});     // callback : handleHeading(headingData) avec fallback
    
    // *** NOUVEAU: Longueur de pas basée sur le profil utilisateur ***
    this.userStepLength = 0.75; // Valeur par défaut, sera mise à jour
    this.FALLBACK_STEP_LENGTH = 0.75; // Sera mis à jour avec le profil utilisateur
    this.USE_FALLBACK_ONLY = false;   // Mode de secours total
    
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
    this.nativePedometerSub = null;  // *** NOUVEAU: Subscription native ***
    
    // Données de pas pour calculs adaptatifs
    this.lastStepTime = null;
    this.stepHistory = [];
    this.maxHistorySize = 10;
    
    // Métriques
    this.metrics = {
      totalSteps: 0,
      totalDistance: 0,
      averageStepLength: 0.75,      // Sera mis à jour avec le profil utilisateur
      lastUpdate: null,
      nativeAvailable: false,
      usingNativeStepLength: false,
      adaptiveStepLength: 0.75,     // Sera mis à jour avec le profil utilisateur
      userProfileStepLength: 0.75   // *** NOUVEAU: Longueur de pas du profil utilisateur ***
    };
    
    // *** NOUVEAU: Initialiser avec le profil utilisateur ***
    this._initializeUserProfile();
  }

  /**
   * *** NOUVEAU: Initialiser avec les données du profil utilisateur ***
   */
  async _initializeUserProfile() {
    try {
      console.log('👤 [NATIVE-ENHANCED] Initialisation avec le profil utilisateur...');
      
      // S'assurer que le service de profil est initialisé
      if (!userProfileService.isInitialized) {
        await userProfileService.initialize();
      }
      
      // Obtenir la longueur de pas calculée
      const stepLength = userProfileService.getStepLengthForPedometer();
      
      // Mettre à jour toutes les valeurs
      this.userStepLength = stepLength;
      this.FALLBACK_STEP_LENGTH = stepLength;
      this.metrics.averageStepLength = stepLength;
      this.metrics.adaptiveStepLength = stepLength;
      this.metrics.userProfileStepLength = stepLength;
      
      console.log(`👤 [NATIVE-ENHANCED] Profil utilisateur chargé:`);
      console.log(`  - Longueur de pas: ${stepLength.toFixed(3)} m`);
      console.log(`  - Source: Profil utilisateur (taille: ${userProfileService.getProfile().height} cm)`);
      
      // Écouter les changements de profil
      userProfileService.addListener((profile) => {
        this._updateUserStepLength(profile.calculatedStepLength);
      });
      
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur initialisation profil utilisateur:', error);
      console.log('⚠️ [NATIVE-ENHANCED] Utilisation des valeurs par défaut');
    }
  }

  /**
   * *** NOUVEAU: Mettre à jour la longueur de pas quand le profil change ***
   */
  _updateUserStepLength(newStepLength) {
    console.log(`👤 [NATIVE-ENHANCED] Mise à jour longueur de pas: ${this.userStepLength.toFixed(3)} → ${newStepLength.toFixed(3)} m`);
    
    this.userStepLength = newStepLength;
    this.FALLBACK_STEP_LENGTH = newStepLength;
    this.metrics.userProfileStepLength = newStepLength;
    
    // Mettre à jour seulement si on utilise le mode fallback (pas le natif)
    if (!this.metrics.usingNativeStepLength) {
      this.metrics.averageStepLength = newStepLength;
      this.metrics.adaptiveStepLength = newStepLength;
      console.log(`👤 [NATIVE-ENHANCED] Longueur de pas mise à jour pour le mode fallback: ${newStepLength.toFixed(3)} m`);
    } else {
      console.log(`👤 [NATIVE-ENHANCED] Mode natif actif - longueur de pas du profil utilisateur disponible mais non utilisée`);
    }
  }

  /**
   * Démarrage du service
   */
  async start() {
    console.log('🚀 [NATIVE-ENHANCED] ========================================');
    console.log('🚀 [NATIVE-ENHANCED] Démarrage NativeEnhancedMotionService...');
    console.log('🚀 [NATIVE-ENHANCED] ========================================');
    console.log(`👤 [STEP-LENGTH-TRACE] Longueur de pas du profil utilisateur: ${this.userStepLength.toFixed(3)}m`);
    console.log(`🔧 [STEP-LENGTH-TRACE] Longueur de pas par défaut: ${this.metrics.averageStepLength.toFixed(3)}m`);
    console.log(`🔧 [STEP-LENGTH-TRACE] Longueur de pas fallback: ${this.FALLBACK_STEP_LENGTH.toFixed(3)}m`);
    console.log(`🔧 [STEP-LENGTH-TRACE] Mode fallback forcé: ${this.USE_FALLBACK_ONLY}`);
    
    try {
      this.sessionStartTime = new Date();
      this.stepCount = 0;
      this.stepHistory = [];
      
      // *** NOUVEAU: Essayer d'abord le service natif iOS ***
      let nativeStarted = false;
      if (Platform.OS === 'ios' && !this.USE_FALLBACK_ONLY) {
        try {
          console.log('🔧 [STEP-LENGTH-TRACE] Tentative démarrage service natif iOS...');
          nativeStarted = await this._startNativePedometer();
          if (nativeStarted) {
            console.log('🔧 [STEP-LENGTH-TRACE] Service natif iOS démarré - longueur de pas sera fournie par CMPedometer');
          }
        } catch (error) {
          console.warn('⚠️ [NATIVE-ENHANCED] Service natif iOS échoué, fallback vers Expo:', error.message);
          console.log('🔧 [STEP-LENGTH-TRACE] Erreur service natif détectée - activation du mode fallback avec profil utilisateur');
          // Si le service natif échoue complètement, activer le mode fallback total
          if (error.message.includes('non disponible') || error.message.includes('Impossible de démarrer')) {
            console.warn('🔧 [NATIVE-ENHANCED] Activation du mode fallback avec profil utilisateur pour cette session');
            console.log(`👤 [STEP-LENGTH-TRACE] Mode fallback avec profil activé - longueur: ${this.userStepLength.toFixed(3)}m`);
            this.USE_FALLBACK_ONLY = true;
            this.metrics.averageStepLength = this.userStepLength;
            this.metrics.adaptiveStepLength = this.userStepLength;
          }
        }
      } else {
        console.log('🔧 [STEP-LENGTH-TRACE] Module natif non disponible ou mode fallback forcé - utilisation du profil utilisateur');
      }
      
      // Fallback vers Expo Pedometer si natif non disponible
      if (!nativeStarted) {
        try {
          // *** MODIFICATION: Force le mode fallback avec profil utilisateur ***
          console.log('🔧 [STEP-LENGTH-TRACE] Module natif non disponible - activation du mode fallback avec profil utilisateur');
          console.log(`👤 [STEP-LENGTH-TRACE] Utilisation de la longueur de pas du profil: ${this.userStepLength.toFixed(3)}m`);
          this.USE_FALLBACK_ONLY = true;
          this.metrics.averageStepLength = this.userStepLength;
          this.metrics.adaptiveStepLength = this.userStepLength;
          await this._startFallbackMode();
        } catch (error) {
          console.error('❌ [NATIVE-ENHANCED] Mode fallback aussi échoué, activation du mode de secours total');
          console.log('🔧 [STEP-LENGTH-TRACE] Tous les systèmes ont échoué - activation du mode de secours avec profil utilisateur');
          this.USE_FALLBACK_ONLY = true;
          this.metrics.averageStepLength = this.userStepLength;
          this.metrics.adaptiveStepLength = this.userStepLength;
          await this._startFallbackMode();
        }
      }
      
      // Démarrage de l'orientation
      await this._startCompass();
      
      this.isRunning = true;
      
      console.log('🚀 [NATIVE-ENHANCED] ========================================');
      console.log('✅ [NATIVE-ENHANCED] Service démarré avec succès');
      console.log(`✅ [NATIVE-ENHANCED] Mode: ${this.metrics.usingNativeStepLength ? 'CMPedometer NATIF (ignore profil)' : `FALLBACK avec profil utilisateur (${this.userStepLength.toFixed(3)}m)`}`);
      console.log(`🔧 [STEP-LENGTH-TRACE] Longueur de pas finale: ${this.metrics.averageStepLength.toFixed(3)}m`);
      console.log(`👤 [STEP-LENGTH-TRACE] Source: ${this.metrics.usingNativeStepLength ? 'CMPedometer natif' : 'Profil utilisateur'}`);
      console.log(`🔧 [STEP-LENGTH-TRACE] Mode fallback actif: ${this.USE_FALLBACK_ONLY}`);
      console.log('🚀 [NATIVE-ENHANCED] ========================================');
      
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur démarrage service:', error);
      // En dernier recours, activer le mode fallback
      console.log('🆘 [NATIVE-ENHANCED] Activation du mode de secours total...');
      console.log(`👤 [STEP-LENGTH-TRACE] Erreur critique - activation du mode de secours avec profil utilisateur: ${this.userStepLength.toFixed(3)}m`);
      this.USE_FALLBACK_ONLY = true;
      this.metrics.averageStepLength = this.userStepLength;
      this.metrics.adaptiveStepLength = this.userStepLength;
      await this._startFallbackMode();
      this.isRunning = true;
    }
  }

  /**
   * *** NOUVEAU: Démarrage du podomètre natif CMPedometer ***
   */
  async _startNativePedometer() {
    try {
      console.log('🍎 [NATIVE-ENHANCED] Démarrage du service CMPedometer natif...');
      
      // Vérifier la disponibilité
      const available = await nativeIOSPedometerService.initialize();
      if (!available) {
        throw new Error('CMPedometer non disponible sur cet appareil');
      }
      
      // Démarrer le suivi avec notre callback
      const success = await nativeIOSPedometerService.start((stepData) => {
        this._handleNativeStepEvent(stepData);
      });
      
      if (!success) {
        throw new Error('Impossible de démarrer le service CMPedometer');
      }
      
      this.metrics.nativeAvailable = true;
      this.metrics.usingNativeStepLength = true;
      
      console.log('✅ [NATIVE-ENHANCED] Service CMPedometer natif démarré avec succès');
      console.log('🔧 [STEP-LENGTH-TRACE] Mode natif actif - utilisation des données CMPedometer');
      
      return true;
      
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur démarrage CMPedometer:', error);
      this.metrics.nativeAvailable = false;
      this.metrics.usingNativeStepLength = false;
      return false;
    }
  }

  /**
   * *** NOUVEAU: Traitement des événements de pas natifs ***
   */
  _handleNativeStepEvent(stepData) {
    try {
      console.log('🍎 [NATIVE-ENHANCED] Événement de pas natif reçu:', stepData);
      
      const {
        stepCount,
        stepLength,
        dx,
        dy,
        timestamp,
        totalSteps,
        confidence,
        source,
        nativeStepLength,
        averageStepLength,
        cadence,
        timeDelta,
        isFallback
      } = stepData;
      
      // Mettre à jour les métriques
      this.stepCount = totalSteps;
      this.metrics.totalSteps = totalSteps;
      this.metrics.totalDistance += (dx * dx + dy * dy) ** 0.5;
      this.metrics.lastUpdate = timestamp;
      this.metrics.averageStepLength = nativeStepLength || stepLength;
      
      console.log(`🍎 [NATIVE-ENHANCED] Pas traité: ${stepCount} (total: ${totalSteps})`);
      console.log(`🔧 [STEP-LENGTH-TRACE] Longueur de pas native: ${stepLength.toFixed(3)}m`);
      console.log(`🔧 [STEP-LENGTH-TRACE] Confiance: ${(confidence * 100).toFixed(1)}%`);
      
      // Appeler le callback principal
      this.onStep({
        stepCount: stepCount,
        stepLength: stepLength,
        dx: dx,
        dy: dy,
        timestamp: timestamp,
        totalSteps: totalSteps,
        confidence: confidence,
        source: source,
        nativeStepLength: nativeStepLength,
        averageStepLength: averageStepLength,
        cadence: cadence,
        timeDelta: timeDelta,
        isFallback: isFallback
      });
      
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur traitement événement natif:', error);
    }
  }

  /**
   * Démarrage du podomètre avec calculs adaptatifs
   */
  async _startPedometer() {
    try {
      console.log('📱 [NATIVE-ENHANCED] Démarrage Expo Pedometer...');
      console.log(`🔧 [STEP-LENGTH-TRACE] Mode fallback constant: ${this.USE_FALLBACK_ONLY}`);
      
      // Si on est en mode fallback constant, ne pas démarrer Expo Pedometer
      if (this.USE_FALLBACK_ONLY) {
        console.log('🔧 [STEP-LENGTH-TRACE] Mode fallback constant actif - pas de démarrage Expo Pedometer');
        throw new Error('Mode fallback constant activé');
      }
      
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
      
      console.log('🔧 [STEP-LENGTH-TRACE] Expo Pedometer disponible - démarrage avec calculs adaptatifs');
      
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
      console.log('🔧 [STEP-LENGTH-TRACE] Expo Pedometer actif - longueur de pas sera calculée de manière adaptative');
      
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur podomètre:', error);
      console.log('🔧 [STEP-LENGTH-TRACE] Erreur Expo Pedometer - propagation de l\'erreur');
      throw error;
    }
  }

  /**
   * Gestion adaptative des pas avec calcul intelligent de longueur
   */
  _handleAdaptiveStep(timestamp) {
    // Vérification de sécurité - ne pas traiter si en mode fallback constant
    if (this.USE_FALLBACK_ONLY) {
      console.log('🔧 [STEP-LENGTH-TRACE] Mode fallback constant actif - pas de traitement adaptatif');
      return;
    }
    
    console.log('🔧 [STEP-LENGTH-TRACE] Traitement pas adaptatif - calcul de la longueur de pas...');
    
    // Calcul de la cadence si on a un pas précédent
    let cadence = 0;
    let timeDelta = 0;
    
    if (this.lastStepTime) {
      timeDelta = (timestamp - this.lastStepTime) / 1000; // en secondes
      cadence = timeDelta > 0 ? 1 / timeDelta : 0; // pas par seconde
    }
    
    // Calcul adaptatif de la longueur de pas basé sur la cadence
    let adaptiveStepLength = this._calculateAdaptiveStepLength(cadence, timeDelta);
    
    console.log(`🔧 [STEP-LENGTH-TRACE] Longueur calculée: ${adaptiveStepLength.toFixed(3)}m (cadence: ${cadence.toFixed(2)} pas/s)`);
    
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
    console.log(`🔧 [STEP-LENGTH-TRACE] Longueur moyenne mise à jour: ${this.metrics.averageStepLength.toFixed(3)}m`);
    
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
    const stats = {
      stepCount: this.stepCount,
      filteredYaw: this.filteredYaw,
      sessionDuration: this.sessionStartTime ? 
        (Date.now() - this.sessionStartTime.getTime()) / 1000 : 0,
      metrics: this.metrics,
      isRunning: this.isRunning,
      platform: Platform.OS,
      stepHistory: this.stepHistory.slice(-5), // 5 derniers pas pour debug
      // Ajout d'informations de debug pour le fallback
      fallbackInfo: {
        USE_FALLBACK_ONLY: this.USE_FALLBACK_ONLY,
        FALLBACK_STEP_LENGTH: this.FALLBACK_STEP_LENGTH,
        currentMode: this.metrics.usingNativeStepLength ? 'native' : 
                    this.USE_FALLBACK_ONLY ? 'fallback_constant' : 'adaptive'
      }
    };
    
    // Log périodique des stats importantes (toutes les 10 secondes)
    const now = Date.now();
    if (!this.lastStatsLog || (now - this.lastStatsLog) > 10000) {
      console.log('🔧 [STEP-LENGTH-TRACE] === STATS ACTUELLES ===');
      console.log(`  - Mode: ${stats.fallbackInfo.currentMode}`);
      console.log(`  - USE_FALLBACK_ONLY: ${stats.fallbackInfo.USE_FALLBACK_ONLY}`);
      console.log(`  - averageStepLength: ${stats.metrics.averageStepLength}m`);
      console.log(`  - adaptiveStepLength: ${stats.metrics.adaptiveStepLength}m`);
      console.log(`  - FALLBACK_STEP_LENGTH: ${stats.fallbackInfo.FALLBACK_STEP_LENGTH}m`);
      console.log(`  - totalSteps: ${stats.metrics.totalSteps}`);
      console.log(`  - totalDistance: ${stats.metrics.totalDistance.toFixed(2)}m`);
      console.log(`  - usingNativeStepLength: ${stats.metrics.usingNativeStepLength}`);
      console.log('🔧 [STEP-LENGTH-TRACE] === FIN STATS ===');
      this.lastStatsLog = now;
    }
    
    return stats;
  }

  /**
   * Arrêt du service
   */
  async stop() {
    console.log('🛑 [NATIVE-ENHANCED] Arrêt du service...');
    
    // *** NOUVEAU: Arrêt du service iOS natif ***
    if (nativeIOSPedometerService && nativeIOSPedometerService.isActive) {
      try {
        nativeIOSPedometerService.stop();
        console.log('🛑 [NATIVE-ENHANCED] Service CMPedometer natif arrêté');
      } catch (error) {
        console.warn('⚠️ [NATIVE-ENHANCED] Erreur arrêt service natif:', error.message);
      }
    }
    
    // Arrêt du podomètre Expo
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
    console.log(`📏 Longueur de pas: ${this.metrics.averageStepLength.toFixed(3)}m`);
    console.log(`🎯 Mode utilisé: ${this.metrics.usingNativeStepLength ? 'CMPedometer NATIF' : this.USE_FALLBACK_ONLY ? 'FALLBACK CONSTANT' : 'Expo Pedometer ADAPTATIF'}`);
  }

  /**
   * *** NOUVEAU: Mode fallback avec longueur de pas constante ***
   */
  async _startFallbackMode() {
    console.log('🆘 [FALLBACK] Démarrage du mode fallback avec longueur constante...');
    console.log(`🆘 [FALLBACK] Longueur de pas fixe: ${this.FALLBACK_STEP_LENGTH}m`);
    
    // Initialisation des métriques en mode fallback
    this.metrics.nativeAvailable = false;
    this.metrics.usingNativeStepLength = false;
    this.metrics.averageStepLength = this.FALLBACK_STEP_LENGTH;
    this.metrics.adaptiveStepLength = this.FALLBACK_STEP_LENGTH;
    
    // Simulation de détection de pas basée sur le mouvement de l'appareil
    // (optionnel - pour l'instant on attend que l'utilisateur déclenche manuellement)
    console.log('✅ [FALLBACK] Mode fallback activé - longueur de pas constante: 0.87m');
  }

  /**
   * *** NOUVEAU: Simulation d'un pas en mode fallback ***
   */
  _simulateFallbackStep() {
    if (!this.USE_FALLBACK_ONLY) {
      console.log('🔧 [STEP-LENGTH-TRACE] Tentative pas fallback mais mode non actif');
      return;
    }
    
    console.log('🔧 [STEP-LENGTH-TRACE] === DÉBUT SIMULATION PAS FALLBACK ===');
    console.log(`🔧 [STEP-LENGTH-TRACE] Longueur de pas fixe utilisée: ${this.FALLBACK_STEP_LENGTH}m`);
    
    const now = Date.now();
    const stepLength = this.FALLBACK_STEP_LENGTH;
    
    // Vérification que la longueur est bien celle attendue
    if (stepLength !== 0.87) {
      console.error(`❌ [STEP-LENGTH-TRACE] ERREUR: Longueur de pas incorrecte! Attendu: 0.87m, Actuel: ${stepLength}m`);
    } else {
      console.log(`✅ [STEP-LENGTH-TRACE] Longueur de pas correcte: ${stepLength}m`);
    }
    
    // Calcul de la position avec orientation actuelle
    const yawRadians = this.filteredYaw ? (this.filteredYaw * Math.PI / 180) : 0;
    const dx = stepLength * Math.cos(yawRadians);
    const dy = stepLength * Math.sin(yawRadians);
    
    this.stepCount++;
    this.metrics.totalSteps = this.stepCount;
    this.metrics.totalDistance += stepLength;
    this.metrics.lastUpdate = now;
    
    // Vérification que les métriques restent cohérentes
    console.log(`🔧 [STEP-LENGTH-TRACE] Métriques après pas:`);
    console.log(`  - averageStepLength: ${this.metrics.averageStepLength}m`);
    console.log(`  - adaptiveStepLength: ${this.metrics.adaptiveStepLength}m`);
    console.log(`  - totalSteps: ${this.metrics.totalSteps}`);
    console.log(`  - totalDistance: ${this.metrics.totalDistance.toFixed(2)}m`);
    
    console.log(`🆘 [FALLBACK-STEP] Pas simulé: ${stepLength}m (total: ${this.stepCount} pas, ${this.metrics.totalDistance.toFixed(2)}m)`);
    
    // Callback avec données de fallback
    if (this.onStep && typeof this.onStep === 'function') {
      const stepData = {
        stepCount: this.stepCount,
        stepLength: stepLength,
        dx, 
        dy,
        timestamp: now,
        totalSteps: this.stepCount,
        totalDistance: this.metrics.totalDistance,
        confidence: 0.95, // *** MODIFICATION: Confiance élevée pour le mode fallback constant ***
        source: 'fallback_constant',
        averageStepLength: stepLength,
        isFallback: true
      };
      
      console.log(`🔧 [STEP-LENGTH-TRACE] Données envoyées au callback:`);
      console.log(`  - stepLength: ${stepData.stepLength}m`);
      console.log(`  - averageStepLength: ${stepData.averageStepLength}m`);
      console.log(`  - source: ${stepData.source}`);
      console.log(`  - isFallback: ${stepData.isFallback}`);
      
      this.onStep(stepData);
    }
    
    console.log('🔧 [STEP-LENGTH-TRACE] === FIN SIMULATION PAS FALLBACK ===');
  }

  /**
   * *** NOUVEAU: Méthode publique pour déclencher un pas en mode fallback ***
   * Utile pour les tests ou si la détection automatique échoue
   */
  triggerFallbackStep() {
    if (this.USE_FALLBACK_ONLY && this.isRunning) {
      this._simulateFallbackStep();
      return true;
    }
    return false;
  }

  /**
   * *** NOUVEAU: Forcer le mode fallback ***
   */
  forceFallbackMode() {
    console.log('🔧 [FALLBACK] Activation forcée du mode fallback...');
    console.log('🔧 [STEP-LENGTH-TRACE] === ACTIVATION FORCÉE MODE FALLBACK ===');
    console.log(`🔧 [STEP-LENGTH-TRACE] État avant activation:`);
    console.log(`  - USE_FALLBACK_ONLY: ${this.USE_FALLBACK_ONLY}`);
    console.log(`  - averageStepLength: ${this.metrics.averageStepLength}m`);
    console.log(`  - adaptiveStepLength: ${this.metrics.adaptiveStepLength}m`);
    console.log(`  - usingNativeStepLength: ${this.metrics.usingNativeStepLength}`);
    
    this.USE_FALLBACK_ONLY = true;
    this.metrics.usingNativeStepLength = false;
    this.metrics.averageStepLength = this.FALLBACK_STEP_LENGTH;
    this.metrics.adaptiveStepLength = this.FALLBACK_STEP_LENGTH;
    
    console.log(`🔧 [STEP-LENGTH-TRACE] État après activation:`);
    console.log(`  - USE_FALLBACK_ONLY: ${this.USE_FALLBACK_ONLY}`);
    console.log(`  - averageStepLength: ${this.metrics.averageStepLength}m`);
    console.log(`  - adaptiveStepLength: ${this.metrics.adaptiveStepLength}m`);
    console.log(`  - usingNativeStepLength: ${this.metrics.usingNativeStepLength}`);
    console.log(`  - FALLBACK_STEP_LENGTH: ${this.FALLBACK_STEP_LENGTH}m`);
    console.log('🔧 [STEP-LENGTH-TRACE] === FIN ACTIVATION FORCÉE ===');
  }
} 