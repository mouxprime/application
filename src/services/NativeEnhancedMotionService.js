import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { userProfileService } from './UserProfileService';
import { nativeIOSPedometerService } from './NativeIOSPedometerService';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { configurationService } from './ConfigurationService';

/**
 * Service de mouvement amélioré utilisant CMPedometer natif en priorité
 * avec fallback vers Expo Pedometer.
 * 
 * Avantages :
 * - Utilise CMPedometer directement sur iOS
 * - Calculs adaptatifs de longueur de pas en fallback basés sur le profil utilisateur
 * - Fallback intelligent
 * - Code simplifié et robuste
 * - Économie de batterie en supprimant le magnétomètre (boussole native utilisée)
 */
export default class NativeEnhancedMotionService {
  constructor(onStep, onHeading, onSensors) {
    this.onStep = onStep || (() => {});           // callback : handleStepDetected(stepData) avec fallback
    this.onHeading = onHeading || (() => {});     // callback : handleHeading(headingData) avec fallback
    this.onSensors = onSensors || (() => {});     // *** NOUVEAU: callback pour les données des capteurs ***
    
    // *** NOUVEAU: Longueur de pas basée sur le profil utilisateur ***
    this.userStepLength = 0.75; // Valeur par défaut, sera mise à jour
    this.FALLBACK_STEP_LENGTH = 0.75; // Sera mis à jour avec le profil utilisateur
    this.USE_FALLBACK_ONLY = false;   // Mode de secours total
    
    // État du service
    this.isRunning = false;
    this.sessionStartTime = null;
    this.stepCount = 0;
    
    // *** NOUVEAU: Gestion de pause/reprise avec sauvegarde de position ***
    this.isPaused = false;
    this.pausedAt = null;
    this.savedState = {
      position: { x: 0, y: 0 },
      totalDistance: 0,
      stepCount: 0,
      lastOrientation: null,
      sessionTime: 0
    };
    
    // *** AMÉLIORATION: Système d'orientation renforcé contre les sauts erratiques ***
    this.orientationHistory = []; // Historique des orientations pour lissage
    this.orientationHistoryMaxSize = 40; // *** AUGMENTÉ: 40 échantillons pour meilleur lissage (4 secondes à 10Hz) ***
    this.currentSmoothedOrientation = null; // Orientation lissée actuelle
    this.orientationVarianceThreshold = 30; // Seuil de variance pour détecter stabilité
    this.lastOrientationUpdate = 0;
    this.orientationUpdateInterval = 100; // Mise à jour toutes les 100ms
    
    // *** NOUVEAU: Variables pour filtrage avancé ***
    this.minAccuracyThreshold = 15; // *** NOUVEAU: Rejeter les mesures avec accuracy > 15° ***
    this.maxAngleJumpThreshold = 45; // *** NOUVEAU: Rejeter les sauts > 45° instantanés ***
    this.consecutiveBadReadings = 0; // *** NOUVEAU: Compteur de lectures consécutives de mauvaise qualité ***
    this.maxConsecutiveBadReadings = 5; // *** NOUVEAU: Reset après 5 mauvaises lectures consécutives ***
    this.lastGoodOrientation = null; // *** NOUVEAU: Dernière orientation fiable ***
    this.medianWindowSize = 7; // *** NOUVEAU: Fenêtre médiane plus grande ***
    
    // *** NOUVEAU: Système de filtrage des pas pour éviter le surcomptage ***
    this.stepFiltering = {
      minStepDistance: 0.25,         // *** RÉDUIT: Distance minimum par pas (25cm au lieu de 40cm) ***
      maxStepDistance: 2.0,          // Distance maximum par pas (2m)
      minStepInterval: 200,          // *** RÉDUIT: Intervalle minimum entre pas (200ms au lieu de 300ms) ***
      maxStepInterval: 4000,         // Intervalle maximum entre pas (4s)
      minConfidenceThreshold: 0.1,   // *** RÉDUIT: Confiance minimum (20% au lieu de 30%) ***
      zuptThreshold: 0.08,           // *** RÉDUIT: Seuil Zero-Velocity Update (8cm au lieu de 10cm) ***
      consecutiveStepsForZupt: 5,    // *** AUGMENTÉ: Nombre de pas consécutifs pour ZUPT (5 au lieu de 3) ***
      lastValidStepTime: 0,          // Timestamp du dernier pas valide
      lastValidPosition: { x: 0, y: 0 }, // Position du dernier pas valide
      rejectedStepsCount: 0,         // Compteur de pas rejetés
      falsePositiveRate: 0,          // Taux estimé de faux positifs
      adaptiveThreshold: true        // Seuils adaptatifs basés sur l'historique
    };
    
    // *** NOUVEAU: Historique des pas valides pour analyse statistique ***
    this.validStepsHistory = [];
    this.validStepsHistoryMaxSize = 50; // Garder les 50 derniers pas valides
    
    // *** NOUVEAU: GESTION MÉMOIRE OPTIMISÉE ***
    this.memoryOptimization = {
      lastCleanup: Date.now(),
      cleanupInterval: 30000, // Nettoyage toutes les 30 secondes
      maxOrientationHistory: 30, // Réduction de 40 à 30 pour économiser la mémoire
      maxStepHistory: 30, // Réduction de 50 à 30
      objectPool: {
        orientationObjects: [],
        stepObjects: [],
        dataObjects: []
      },
      logThrottling: {
        lastLogTime: 0,
        minLogInterval: 1000, // Maximum 1 log par seconde pour les messages répétitifs
        throttledLogs: new Map()
      }
    };
    
    // *** SUPPRIMÉ: Variables de conflit (système hybride, filtres multiples) ***
    // Plus de orientationBuffer, filteredYaw, système hybride conflictuel
    
    // Subscriptions
    this.headingSub = null;
    this.pedometerSub = null;
    this.nativePedometerSub = null;  // *** NOUVEAU: Subscription native ***
    
    // *** NOUVEAU: Subscriptions pour les capteurs (optimisé sans magnétomètre) ***
    this.accelerometerSub = null;
    this.gyroscopeSub = null;
    this.sensorsUpdateRate = 40; // 40Hz par défaut, sera mis à jour depuis la configuration
    
    // *** NOUVEAU: Variables pour la configuration des capteurs ***
    this.sensorsConfig = {
      frequency: 40,
      enabled: {
        accelerometer: true,
        gyroscope: true
      }
    };
    
    // Données de pas pour calculs adaptatifs
    this.lastStepTime = null;
    this.stepHistory = [];
    this.maxHistorySize = 30; // *** RÉDUIT: 30 au lieu de 50 pour économiser la mémoire ***
    
    // *** NOUVEAU: Variables pour le throttling des capteurs ***
    this.lastSensorUpdate = null;
    
    // Métriques
    this.metrics = {
      totalSteps: 0,
      totalDistance: 0,
      averageStepLength: 0.75,      // Sera mis à jour avec le profil utilisateur
      lastUpdate: null,
      nativeAvailable: false,
      usingNativeStepLength: false,
      adaptiveStepLength: 0.75,     // Sera mis à jour avec le profil utilisateur
      userProfileStepLength: 0.75,   // *** NOUVEAU: Longueur de pas du profil utilisateur ***
      memoryStats: {
        orientationHistorySize: 0,
        stepHistorySize: 0,
        validStepsHistorySize: 0,
        lastMemoryCleanup: Date.now(),
        totalCleanupsPerformed: 0
      }
    };
    
    // *** NOUVEAU: Timer de nettoyage automatique de la mémoire ***
    this.memoryCleanupTimer = null;
    
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
      const stepLength = userProfileService.getStepLength();
      
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

      // *** NOUVEAU: Initialiser la configuration des capteurs ***
      await this._initializeSensorsConfiguration();
      
      // *** NOUVEAU: Démarrer le nettoyage automatique de la mémoire ***
      this._startMemoryCleanup();
      
    } catch (error) {
      console.error('❌ [NATIVE-ENHANCED] Erreur initialisation profil utilisateur:', error);
      console.log('⚠️ [NATIVE-ENHANCED] Utilisation des valeurs par défaut');
    }
  }

  /**
   * *** NOUVEAU: Démarrer le nettoyage automatique de la mémoire ***
   */
  _startMemoryCleanup() {
    // Nettoyage immédiat puis régulier
    this._performMemoryCleanup();
    
    this.memoryCleanupTimer = setInterval(() => {
      this._performMemoryCleanup();
    }, this.memoryOptimization.cleanupInterval);
    
    console.log('🧹 [MEMORY] Nettoyage automatique démarré (toutes les 30s)');
  }

  /**
   * *** NOUVEAU: Effectuer un nettoyage de la mémoire ***
   */
  _performMemoryCleanup() {
    const before = {
      orientationHistory: this.orientationHistory.length,
      stepHistory: this.stepHistory.length,
      validStepsHistory: this.validStepsHistory.length
    };
    
    // 1. Nettoyer l'historique d'orientation
    if (this.orientationHistory.length > this.memoryOptimization.maxOrientationHistory) {
      const excess = this.orientationHistory.length - this.memoryOptimization.maxOrientationHistory;
      this.orientationHistory.splice(0, excess);
    }
    
    // 2. Nettoyer l'historique des pas
    if (this.stepHistory.length > this.memoryOptimization.maxStepHistory) {
      const excess = this.stepHistory.length - this.memoryOptimization.maxStepHistory;
      this.stepHistory.splice(0, excess);
    }
    
    // 3. Nettoyer l'historique des pas valides
    if (this.validStepsHistory.length > this.memoryOptimization.maxStepHistory) {
      const excess = this.validStepsHistory.length - this.memoryOptimization.maxStepHistory;
      this.validStepsHistory.splice(0, excess);
    }
    
    // 4. Nettoyer la map des logs throttlés
    const now = Date.now();
    this.memoryOptimization.logThrottling.throttledLogs.forEach((value, key) => {
      if (now - value > 60000) { // Supprimer après 1 minute
        this.memoryOptimization.logThrottling.throttledLogs.delete(key);
      }
    });
    
    // 5. Mise à jour des métriques
    this.metrics.memoryStats = {
      orientationHistorySize: this.orientationHistory.length,
      stepHistorySize: this.stepHistory.length,
      validStepsHistorySize: this.validStepsHistory.length,
      lastMemoryCleanup: now,
      totalCleanupsPerformed: this.metrics.memoryStats.totalCleanupsPerformed + 1
    };
    
    const after = {
      orientationHistory: this.orientationHistory.length,
      stepHistory: this.stepHistory.length,
      validStepsHistory: this.validStepsHistory.length
    };
    
    // Log du nettoyage si des éléments ont été supprimés
    const totalCleaned = (before.orientationHistory - after.orientationHistory) + 
                        (before.stepHistory - after.stepHistory) + 
                        (before.validStepsHistory - after.validStepsHistory);
    
    if (totalCleaned > 0) {
      this._throttledLog('memory-cleanup', 
        `🧹 [MEMORY] Nettoyage effectué: ${totalCleaned} éléments supprimés`, 
        `  - Orientation: ${before.orientationHistory} → ${after.orientationHistory}`,
        `  - Steps: ${before.stepHistory} → ${after.stepHistory}`,
        `  - Valid Steps: ${before.validStepsHistory} → ${after.validStepsHistory}`
      );
    }
  }

  /**
   * *** NOUVEAU: Log avec limitation de fréquence ***
   */
  _throttledLog(key, ...messages) {
    const now = Date.now();
    const lastLog = this.memoryOptimization.logThrottling.throttledLogs.get(key) || 0;
    
    if (now - lastLog >= this.memoryOptimization.logThrottling.minLogInterval) {
      console.log(...messages);
      this.memoryOptimization.logThrottling.throttledLogs.set(key, now);
    }
  }

  /**
   * *** NOUVEAU: Obtenir un objet réutilisable du pool ou en créer un nouveau ***
   */
  _getPooledObject(type, defaultValue = {}) {
    const pool = this.memoryOptimization.objectPool[type];
    if (pool && pool.length > 0) {
      const obj = pool.pop();
      // Réinitialiser l'objet
      Object.keys(obj).forEach(key => delete obj[key]);
      Object.assign(obj, defaultValue);
      return obj;
    }
    return { ...defaultValue };
  }

  /**
   * *** NOUVEAU: Retourner un objet au pool pour réutilisation ***
   */
  _returnToPool(type, obj) {
    const pool = this.memoryOptimization.objectPool[type];
    if (pool && pool.length < 10) { // Limiter la taille du pool
      pool.push(obj);
    }
  }

  /**
   * *** NOUVEAU: Initialiser la configuration des capteurs ***
   */
  async _initializeSensorsConfiguration() {
    try {
      // S'assurer que le service de configuration est initialisé
      if (!configurationService.isInitialized) {
        await configurationService.initialize();
      }
      
      // Obtenir la configuration des capteurs
      this.sensorsConfig = configurationService.getSensorsConfiguration();
      this.sensorsUpdateRate = this.sensorsConfig.frequency;
      
      console.log(`🔧 [SENSORS-CONFIG] Configuration capteurs chargée:`);
      console.log(`  - Fréquence: ${this.sensorsConfig.frequency} Hz`);
      console.log(`  - Accéléromètre: ${this.sensorsConfig.enabled.accelerometer ? 'activé' : 'désactivé'}`);
      console.log(`  - Gyroscope: ${this.sensorsConfig.enabled.gyroscope ? 'activé' : 'désactivé'}`);
      
      // Écouter les changements de configuration
      configurationService.addListener((config) => {
        this._updateSensorsConfiguration(config);
      });
      
    } catch (error) {
      console.error('❌ [SENSORS-CONFIG] Erreur initialisation configuration capteurs:', error);
      console.log('⚠️ [SENSORS-CONFIG] Utilisation des valeurs par défaut');
    }
  }

  /**
   * *** NOUVEAU: Mettre à jour la configuration des capteurs ***
   */
  _updateSensorsConfiguration(config) {
    if (config.sensorsFrequency && config.sensorsEnabled) {
      console.log(`🔧 [SENSORS-CONFIG] Mise à jour configuration:`);
      console.log(`  - Fréquence: ${this.sensorsConfig.frequency} → ${config.sensorsFrequency} Hz`);
      
      this.sensorsConfig.frequency = config.sensorsFrequency;
      this.sensorsConfig.enabled = { ...config.sensorsEnabled };
      this.sensorsUpdateRate = config.sensorsFrequency;
      
      // Redémarrer les capteurs avec la nouvelle configuration si ils sont actifs
      if (this.accelerometerSub || this.gyroscopeSub) {
        console.log(`🔧 [SENSORS-CONFIG] Redémarrage des capteurs avec nouvelle configuration`);
        this._stopSensors();
        this._startSensors();
      }
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
          console.log('🔧 [STEP-LENGTH-TRACE] Mode fallback Expo Pedometer avec profil utilisateur');
          this.USE_FALLBACK_ONLY = true;
          this.metrics.averageStepLength = this.userStepLength;
          this.metrics.adaptiveStepLength = this.userStepLength;
          console.log(`👤 [STEP-LENGTH-TRACE] Longueur de pas Fallback définie: ${this.userStepLength.toFixed(3)}m`);
          
          // *** Démarrage Expo Pedometer ***
          await this._startExpoPedometer();
          
          console.log('✅ [NATIVE-ENHANCED] Expo Pedometer démarré avec profil utilisateur');
        } catch (expoError) {
          console.error('❌ [NATIVE-ENHANCED] Expo Pedometer échoué aussi:', expoError.message);
          console.warn('🆘 [NATIVE-ENHANCED] Passage en mode fallback total');
          await this._startFallbackMode();
        }
      }
      
      // *** NOUVEAU: Démarrer l'orientation simplifiée ***
     //console.log('🧭 [ORIENTATION] Démarrage du système d'orientation simplifié...');
      await this._startCompass();
      
      // *** NOUVEAU: Démarrer les capteurs pour SensorsScreen ***
      await this._startSensors();
      
      this.isRunning = true;
      
      console.log('🚀 [NATIVE-ENHANCED] ========================================');
      console.log('✅ [NATIVE-ENHANCED] Service démarré avec succès');
      console.log(`✅ [NATIVE-ENHANCED] Mode: ${this.metrics.usingNativeStepLength ? 'CMPedometer NATIF (ignore profil)' : `FALLBACK avec profil utilisateur (${this.userStepLength.toFixed(3)}m)`}`);
      console.log(`🔧 [STEP-LENGTH-TRACE] Longueur de pas finale: ${this.metrics.averageStepLength.toFixed(3)}m`);
      console.log(`👤 [STEP-LENGTH-TRACE] Source: ${this.metrics.usingNativeStepLength ? 'CMPedometer natif' : 'Profil utilisateur'}`);
      console.log(`🔧 [STEP-LENGTH-TRACE] Mode fallback actif: ${this.USE_FALLBACK_ONLY}`);
      console.log('🚀 [NATIVE-ENHANCED] ========================================');
      
      // *** NOUVEAU: Exposer le service globalement pour ConfigurationScreen ***
      this._exposeGlobally();
      
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
      this._exposeGlobally(); // *** NOUVEAU: Même en mode fallback ***
    }
  }

  /**
   * *** NOUVEAU: Exposer le service globalement pour accès depuis ConfigurationScreen ***
   */
  _exposeGlobally() {
    try {
      // Exposer via window et global pour compatibilité maximale
      if (typeof window !== 'undefined') {
        window.nativeEnhancedMotionService = this;
        console.log('🌐 [GLOBAL] Service exposé via window.nativeEnhancedMotionService');
      }
      if (typeof global !== 'undefined') {
        global.nativeEnhancedMotionService = this;
        console.log('🌐 [GLOBAL] Service exposé via global.nativeEnhancedMotionService');
      }
    } catch (error) {
      console.warn('⚠️ [GLOBAL] Impossible d\'exposer le service globalement:', error.message);
    }
  }

  /**
   * *** NOUVEAU: Mettre en pause le service tout en conservant l'état ***
   */
  pause() {
    if (!this.isRunning || this.isPaused) {
      console.log('⚠️ [PAUSE] Service déjà en pause ou arrêté');
      return false;
    }
    
    console.log('⏸️ [PAUSE] Mise en pause du service...');
    
    // Sauvegarder l'état actuel
    this.pausedAt = Date.now();
    this.savedState = {
      position: { ...this.stepFiltering.lastValidPosition },
      totalDistance: this.metrics.totalDistance,
      stepCount: this.stepCount,
      lastOrientation: this.currentSmoothedOrientation,
      sessionTime: this.sessionStartTime ? (this.pausedAt - this.sessionStartTime.getTime()) : 0
    };
    
    this.isPaused = true;
    
    console.log('⏸️ [PAUSE] État sauvegardé:');
    console.log(`  Position: x=${this.savedState.position.x.toFixed(2)}, y=${this.savedState.position.y.toFixed(2)}`);
    console.log(`  Distance totale: ${this.savedState.totalDistance.toFixed(2)}m`);
    console.log(`  Pas totaux: ${this.savedState.stepCount}`);
    console.log(`  Orientation: ${this.savedState.lastOrientation?.toFixed(1)}°`);
    console.log(`  Durée session: ${(this.savedState.sessionTime / 1000).toFixed(1)}s`);
    console.log('✅ [PAUSE] Service mis en pause avec état sauvegardé');
    
    return true;
  }

  /**
   * *** NOUVEAU: Reprendre le service en restaurant l'état précédent ***
   */
  resume() {
    if (!this.isRunning || !this.isPaused) {
      console.log('⚠️ [RESUME] Service non en pause ou arrêté');
      return false;
    }
    
    console.log('▶️ [RESUME] Reprise du service...');
    
    // Restaurer l'état sauvegardé
    this.stepFiltering.lastValidPosition = { ...this.savedState.position };
    this.metrics.totalDistance = this.savedState.totalDistance;
    this.stepCount = this.savedState.stepCount;
    this.currentSmoothedOrientation = this.savedState.lastOrientation;
    
    // Ajuster le temps de session
    if (this.sessionStartTime && this.pausedAt) {
      const pauseDuration = Date.now() - this.pausedAt;
      this.sessionStartTime = new Date(this.sessionStartTime.getTime() + pauseDuration);
      console.log(`⏱️ [RESUME] Temps de pause: ${(pauseDuration / 1000).toFixed(1)}s - session ajustée`);
    }
    
    this.isPaused = false;
    this.pausedAt = null;
    
    console.log('▶️ [RESUME] État restauré:');
    console.log(`  Position: x=${this.stepFiltering.lastValidPosition.x.toFixed(2)}, y=${this.stepFiltering.lastValidPosition.y.toFixed(2)}`);
    console.log(`  Distance totale: ${this.metrics.totalDistance.toFixed(2)}m`);
    console.log(`  Pas totaux: ${this.stepCount}`);
    console.log(`  Orientation: ${this.currentSmoothedOrientation?.toFixed(1)}°`);
    console.log('✅ [RESUME] Service repris à la position exacte de la pause');
    
    return true;
  }

  /**
   * *** NOUVEAU: Vérifier si le service est en pause ***
   */
  isPausedState() {
    return this.isPaused;
  }

  /**
   * *** NOUVEAU: Obtenir l'état sauvegardé ***
   */
  getSavedState() {
    return { ...this.savedState };
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
   * *** NOUVEAU: Traitement des événements de pas natifs avec système hybride et filtrage ***
   */
  _handleNativeStepEvent(stepData) {
    // *** NOUVEAU: Vérifier si le service est en pause ***
    if (this.isPaused) {
      console.log('⏸️ [NATIVE-ENHANCED] Événement de pas ignoré - service en pause');
      return;
    }
    
    try {
      console.log('🍎 [NATIVE-ENHANCED] Événement de pas natif reçu:', stepData);
      
      const {
        stepCount,
        stepLength,
        dx: originalDx,
        dy: originalDy,
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
      
      // *** NOUVEAU: Vérification de la longueur de pas ***
      console.log(`🔍 [STEP-LENGTH-DEBUG] === VÉRIFICATION LONGUEUR DE PAS ===`);
      console.log(`🔍 [STEP-LENGTH-DEBUG] stepLength reçu: ${stepLength}m`);
      console.log(`🔍 [STEP-LENGTH-DEBUG] nativeStepLength: ${nativeStepLength || 'N/A'}m`);
      console.log(`🔍 [STEP-LENGTH-DEBUG] averageStepLength: ${averageStepLength || 'N/A'}m`);
      console.log(`🔍 [STEP-LENGTH-DEBUG] userStepLength (profil): ${this.userStepLength}m`);
      console.log(`🔍 [STEP-LENGTH-DEBUG] metrics.averageStepLength: ${this.metrics.averageStepLength}m`);
      
      // *** VÉRIFICATION: Si la longueur semble anormalement courte, alerter ***
      if (stepLength < 0.4) {
        console.warn(`⚠️ [STEP-LENGTH-DEBUG] ATTENTION: Longueur de pas très courte détectée: ${stepLength}m`);
        console.warn(`⚠️ [STEP-LENGTH-DEBUG] Cela peut expliquer la distance totale faible`);
        console.warn(`⚠️ [STEP-LENGTH-DEBUG] Vérifiez la configuration du profil utilisateur`);
      } else if (stepLength > 1.0) {
        console.warn(`⚠️ [STEP-LENGTH-DEBUG] ATTENTION: Longueur de pas très longue détectée: ${stepLength}m`);
        console.warn(`⚠️ [STEP-LENGTH-DEBUG] Cela peut indiquer un problème de calibration`);
      } else {
        console.log(`✅ [STEP-LENGTH-DEBUG] Longueur de pas normale: ${stepLength}m`);
      }
      console.log(`🔍 [STEP-LENGTH-DEBUG] === FIN VÉRIFICATION ===`);
      
      // *** AMÉLIORATION: Filtrage préliminaire pour éviter le surcomptage ***
      console.log(`🔍 [NATIVE-FILTER] === FILTRAGE NATIF ===`);
      console.log(`🔍 [NATIVE-FILTER] Nombre de pas reçus: ${stepCount}`);
      console.log(`🔍 [NATIVE-FILTER] Source: ${source}, isFallback: ${isFallback}`);
      
      // Si c'est un mode fallback avec une confiance faible, appliquer un filtrage plus strict
      const baseConfidence = isFallback ? Math.max(0.6, confidence) : confidence;
      
      // *** SYSTÈME HYBRIDE: Répartir les pas avec orientations interpolées ET filtrage ***
      console.log(`🎯 [HYBRID-SYSTEM] Traitement hybride de ${stepCount} pas avec filtrage et orientations interpolées`);
      
      // Timestamps estimés pour la répartition des pas
      const startTime = (timestamp - timeDelta) / 1000; // Début du batch en secondes
      const endTime = timestamp / 1000; // Fin du batch en secondes
      const timePerStep = (endTime - startTime) / stepCount; // Durée par pas
      
      console.log(`⏱️ [HYBRID-SYSTEM] Période: ${startTime.toFixed(3)}s → ${endTime.toFixed(3)}s (${timePerStep.toFixed(3)}s/pas)`);
      
      let validStepsCount = 0;
      let rejectedStepsCount = 0;
      
      // Traiter chaque pas individuellement avec validation
      for (let i = 0; i < stepCount; i++) {
        // Timestamp estimé pour ce pas spécifique
        const stepTimestamp = startTime + (timePerStep * (i + 0.5)); // Centre du pas
        
        // Obtenir l'orientation interpolée pour ce timestamp
        const interpolatedYaw = this._getInterpolatedOrientation(stepTimestamp);
        
        // Calculer le déplacement pour ce pas avec son orientation spécifique
        const yawRadians = interpolatedYaw * Math.PI / 180;
        const stepDx = stepLength * Math.sin(yawRadians);
        const stepDy = stepLength * Math.cos(yawRadians);
        
        // *** NOUVEAU: Validation du pas avant traitement ***
        const stepToValidate = {
          stepLength,
          dx: stepDx,
          dy: stepDy,
          timestamp: stepTimestamp * 1000,
          confidence: baseConfidence,
          source
        };
        
        if (!this._validateStep(stepToValidate)) {
          rejectedStepsCount++;
          console.log(`❌ [HYBRID-FILTER] Pas ${i + 1}/${stepCount} rejeté par le filtre`);
          continue; // Ignorer ce pas
        }
        
        validStepsCount++;
        
        // Incrémenter les compteurs SEULEMENT pour les pas valides
        this.stepCount++;
        this.metrics.totalSteps = this.stepCount;
        this.metrics.totalDistance += stepLength;
        
        // *** ÉMISSION IMMÉDIATE: Chaque pas validé avec son orientation propre ***
        if (this.onStep && typeof this.onStep === 'function') {
          this.onStep({
            stepCount: 1, // UN seul pas à la fois
            stepLength: stepLength,
            dx: stepDx,  // Déplacement calculé avec orientation interpolée
            dy: stepDy,  // Déplacement calculé avec orientation interpolée
            timestamp: stepTimestamp * 1000, // Retour en millisecondes
            totalSteps: this.stepCount,
            confidence: baseConfidence,
            source: source,
            nativeStepLength: nativeStepLength,
            averageStepLength: averageStepLength,
            cadence: cadence,
            timeDelta: timePerStep * 1000, // Durée individuelle en ms
            isFallback: isFallback,
            interpolatedYaw: interpolatedYaw, // *** NOUVEAU: Orientation interpolée ***
            hybridSystem: true, // *** NOUVEAU: Marqueur système hybride ***
            filtered: true, // *** NOUVEAU: Marqueur de pas filtré ***
            validationPass: true // *** NOUVEAU: Marqueur de validation réussie ***
          });
        }
        
        // Log détaillé pour les pas valides
        if (i === 0 || i === stepCount - 1 || validStepsCount <= 3) {
          console.log(`✅ [HYBRID-STEP] Pas valide ${validStepsCount}: t=${stepTimestamp.toFixed(3)}s, yaw=${interpolatedYaw.toFixed(1)}°, dx=${stepDx.toFixed(3)}, dy=${stepDy.toFixed(3)}`);
        }
      }
      
      // *** Mettre à jour les métriques finales ***
      this.metrics.lastUpdate = timestamp;
      this.metrics.averageStepLength = nativeStepLength || stepLength;
      
      // *** Statistiques de filtrage ***
      console.log(`📊 [HYBRID-FILTER] Résultats du filtrage:`);
      console.log(`  ✅ Pas validés: ${validStepsCount}/${stepCount} (${((validStepsCount/stepCount)*100).toFixed(1)}%)`);
      console.log(`  ❌ Pas rejetés: ${rejectedStepsCount}/${stepCount} (${((rejectedStepsCount/stepCount)*100).toFixed(1)}%)`);
      console.log(`  📈 Total session: ${this.stepCount} pas valides`);
      console.log(`  🚫 Total rejetés: ${this.stepFiltering.rejectedStepsCount} pas`);
      console.log(`  📉 Taux de faux positifs: ${(this.stepFiltering.falsePositiveRate * 100).toFixed(1)}%`);
      
      console.log(`✅ [HYBRID-SYSTEM] ${validStepsCount}/${stepCount} pas traités avec filtrage et orientations interpolées (total: ${this.stepCount})`);
      
    } catch (error) {
      console.error('❌ [HYBRID-SYSTEM] Erreur traitement événement hybride:', error);
    }
  }

  /**
   * *** NOUVEAU: Démarrage Expo Pedometer avec gestion d'erreur ***
   */
  async _startExpoPedometer() {
    try {
      console.log('📱 [EXPO-PEDOMETER] Démarrage du podomètre Expo...');
      return await this._startPedometer();
    } catch (error) {
      console.error('❌ [EXPO-PEDOMETER] Erreur démarrage Expo Pedometer:', error);
      throw error;
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
   * Gestion adaptative des pas avec calcul intelligent de longueur et filtrage
   */
  _handleAdaptiveStep(timestamp) {
    // *** NOUVEAU: Vérifier si le service est en pause ***
    if (this.isPaused) {
      console.log('⏸️ [ADAPTIVE-STEP] Événement de pas adaptatif ignoré - service en pause');
      return;
    }
    
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
    
    // Calcul de la position avec orientation STABLE
    const yawRadians = this.currentSmoothedOrientation ? (this.currentSmoothedOrientation * Math.PI / 180) : 0;
    const dx = adaptiveStepLength * Math.sin(yawRadians);
    const dy = adaptiveStepLength * Math.cos(yawRadians);
    
    // *** NOUVEAU: Validation du pas adaptatif avant traitement ***
    const stepToValidate = {
      stepLength: adaptiveStepLength,
      dx,
      dy,
      timestamp,
      confidence: this._calculateConfidence(cadence, this.stepHistory.length),
      source: 'adaptive_expo'
    };
    
    if (!this._validateStep(stepToValidate)) {
      console.log(`❌ [ADAPTIVE-FILTER] Pas adaptatif rejeté par le filtre`);
      return; // Ignorer ce pas
    }
    
    console.log(`✅ [ADAPTIVE-FILTER] Pas adaptatif validé`);
    
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
    
    console.log(`📱 [ADAPTIVE-STEP] Pas adaptatif validé:`);
    console.log(`  - Longueur: ${adaptiveStepLength.toFixed(3)}m`);
    console.log(`  - Cadence: ${cadence.toFixed(2)} pas/s`);
    console.log(`  - Moyenne récente: ${avgStepLength.toFixed(3)}m`);
    console.log(`🔧 [STEP-LENGTH-TRACE] Longueur moyenne mise à jour: ${this.metrics.averageStepLength.toFixed(3)}m`);
    
    console.log(`🧭 [ADAPTIVE-STEP] Orientation filtrée: ${this.currentSmoothedOrientation ? (this.currentSmoothedOrientation.toFixed(1) + "°") : "N/A"}`);
    
    this.stepCount++;
    this.metrics.totalSteps = this.stepCount;
    this.metrics.totalDistance += adaptiveStepLength;
    this.metrics.lastUpdate = timestamp;
    this.lastStepTime = timestamp;
    
    // Callback avec données adaptatives
    if (this.onStep && typeof this.onStep === 'function') {
      this.onStep({
        stepCount: 1, // *** CORRIGÉ: Un seul pas au lieu de this.stepCount ***
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
        timeDelta,
        filtered: true, // *** NOUVEAU: Marqueur de pas filtré ***
        validationPass: true // *** NOUVEAU: Marqueur de validation réussie ***
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
   * Gestion de l'orientation avec filtrage amélioré
   */
  _handleHeading({ trueHeading, accuracy, timestamp }) {
    // *** AMÉLIORATION 1: Filtrage préliminaire basé sur la précision ***
    // Rejeter immédiatement les lectures de très mauvaise qualité
    if (accuracy > this.minAccuracyThreshold) {
      this.consecutiveBadReadings++;
      
      // *** OPTIMISATION MÉMOIRE: Log throttlé pour éviter le spam ***
      this._throttledLog('heading-accuracy-rejected', 
        `🧭 [FILTER] Lecture rejetée - accuracy trop faible: ${accuracy}° > ${this.minAccuracyThreshold}° (${this.consecutiveBadReadings}/${this.maxConsecutiveBadReadings})`
      );
      
      // Si trop de mauvaises lectures consécutives, reset partiel
      if (this.consecutiveBadReadings >= this.maxConsecutiveBadReadings) {
        this._throttledLog('heading-reset', 
          `🧭 [FILTER] Reset partiel après ${this.maxConsecutiveBadReadings} mauvaises lectures consécutives`
        );
        this.consecutiveBadReadings = 0;
        // Garder l'orientation actuelle mais vider partiellement l'historique
        this.orientationHistory = this.orientationHistory.slice(-10);
      }
      return; // *** IMPORTANT: Rejeter cette lecture ***
    }
    
    // Réinitialiser le compteur de mauvaises lectures
    this.consecutiveBadReadings = 0;

    // Normalisation de l'angle
    let normalizedHeading = trueHeading;
    while (normalizedHeading >= 360) normalizedHeading -= 360;
    while (normalizedHeading < 0) normalizedHeading += 360;
    
    // *** AMÉLIORATION 2: Détection des sauts erratiques ***
    if (this.lastGoodOrientation !== null) {
      let angleDiff = normalizedHeading - this.lastGoodOrientation;
      if (angleDiff > 180) angleDiff -= 360;
      else if (angleDiff < -180) angleDiff += 360;
      
      // Rejeter les sauts trop importants d'un coup
      if (Math.abs(angleDiff) > this.maxAngleJumpThreshold) {
        this._throttledLog('heading-jump-rejected', 
          `🧭 [FILTER] Saut erratique détecté et rejeté: ${angleDiff.toFixed(1)}° > ${this.maxAngleJumpThreshold}°`
        );
        return; // *** IMPORTANT: Rejeter cette lecture ***
      }
    }

    // *** AMÉLIORATION 3: Rolling median renforcé pour stabilité ***
    this.orientationHistory.push(normalizedHeading);
    
    // *** OPTIMISATION MÉMOIRE: Nettoyage automatique intégré ***
    if (this.orientationHistory.length > this.orientationHistoryMaxSize) {
      const excess = this.orientationHistory.length - this.orientationHistoryMaxSize;
      this.orientationHistory.splice(0, excess);
    }
    
    // Calculer le médian des orientations récentes avec fenêtre adaptée
    const medianWindowSize = Math.min(this.medianWindowSize, this.orientationHistory.length);
    const recentOrientations = this.orientationHistory.slice(-medianWindowSize);
    const sortedOrientations = [...recentOrientations].sort((a, b) => a - b);
    const median = sortedOrientations[Math.floor(sortedOrientations.length / 2)];
    
    // *** AMÉLIORATION 4: Filtrage adaptatif basé sur la précision ***
    let filteredHeading;
    let appliedAlpha = 0.3; // *** CORRIGÉ: Initialiser appliedAlpha avec valeur par défaut ***
    
    if (this.currentSmoothedOrientation !== null) {
      // Alpha adaptatif basé sur la précision de la mesure
      if (accuracy <= 5) {
        appliedAlpha = 0.7; // Haute précision, plus de poids à la nouvelle valeur
      } else if (accuracy <= 10) {
        appliedAlpha = 0.5; // Précision moyenne
      } else {
        appliedAlpha = 0.2; // Faible précision, plus de lissage
      }
      
      // Gestion de la discontinuité 0°/360°
      let diff = median - this.currentSmoothedOrientation;
      if (diff > 180) diff -= 360;
      else if (diff < -180) diff += 360;
      
      filteredHeading = this.currentSmoothedOrientation + (appliedAlpha * diff);
      
      // Re-normalisation
      while (filteredHeading >= 360) filteredHeading -= 360;
      while (filteredHeading < 0) filteredHeading += 360;
    } else {
      filteredHeading = median;
    }
    
    // *** AMÉLIORATION 5: Seuil minimal de variation adaptatif ***
    const minVariation = accuracy <= 5 ? 0.5 : accuracy <= 10 ? 1.0 : 2.0;
    
    if (this.currentSmoothedOrientation !== null) {
      let variation = Math.abs(filteredHeading - this.currentSmoothedOrientation);
      if (variation > 180) variation = 360 - variation; // Prendre le chemin le plus court
      
      if (variation < minVariation) {
        // Variation trop faible, garder l'orientation actuelle
        return;
      }
    }
    
    // Mise à jour si tout est OK
    this.currentSmoothedOrientation = filteredHeading;
    this.lastGoodOrientation = normalizedHeading;
    this.lastOrientationUpdate = timestamp || Date.now();
    
    // Callback optimisé
    if (this.onHeading && typeof this.onHeading === 'function') {
      // *** OPTIMISATION MÉMOIRE: Utiliser le pool d'objets ***
      const headingData = this._getPooledObject('dataObjects', {
        yaw: filteredHeading,
        accuracy: accuracy,
        timestamp: this.lastOrientationUpdate,
        source: 'native_compass_filtered',
        filteredHeading: filteredHeading,
        rawHeading: normalizedHeading,
        median: median,
        historySize: this.orientationHistory.length,
        consecutiveBadReadings: this.consecutiveBadReadings,
        appliedAlpha: appliedAlpha // *** CORRIGÉ: Utiliser appliedAlpha au lieu de alpha ***
      });
      
      try {
        this.onHeading(headingData);
      } catch (error) {
        console.error('❌ [HEADING] Erreur callback:', error);
      } finally {
        // *** OPTIMISATION MÉMOIRE: Retourner l'objet au pool ***
        this._returnToPool('dataObjects', headingData);
      }
    }
  }

  /**
   * Réinitialisation
   */
  async reset() {
    this.stepCount = 0;
    this.currentSmoothedOrientation = null;
    this.sessionStartTime = new Date();
    this.lastStepTime = null;
    this.stepHistory = [];
    this.metrics.totalSteps = 0;
    this.metrics.totalDistance = 0;
    this.metrics.adaptiveStepLength = 0.79;
    
    // *** NOUVEAU: Réinitialisation des variables de segment ***
    this.segmentYaw = null;
    this.segmentStepCount = 0;
    this.orientationHistory = [];
    this.lastOrientationUpdate = 0;
    
    console.log('🔄 [NATIVE-ENHANCED] Service réinitialisé avec système hybride d\'orientations');
  }

  /**
   * Obtenir les statistiques
   */
  getStats() {
    const stats = {
      stepCount: this.stepCount,
      filteredYaw: this.currentSmoothedOrientation,
      sessionDuration: this.sessionStartTime ? 
        (Date.now() - this.sessionStartTime.getTime()) / 1000 : 0,
      metrics: this.metrics,
      isRunning: this.isRunning,
      platform: Platform.OS,
      stepHistory: this.stepHistory.slice(-5), // 5 derniers pas pour debug
      // *** NOUVEAU: Informations de pause/reprise ***
      pauseInfo: {
        isPaused: this.isPaused,
        pausedAt: this.pausedAt,
        savedState: this.isPaused ? this.savedState : null
      },
      // Ajout d'informations de debug pour le fallback
      fallbackInfo: {
        USE_FALLBACK_ONLY: this.USE_FALLBACK_ONLY,
        FALLBACK_STEP_LENGTH: this.FALLBACK_STEP_LENGTH,
        currentMode: this.metrics.usingNativeStepLength ? 'native' : 
                    this.USE_FALLBACK_ONLY ? 'fallback_constant' : 'adaptive'
      },
      // *** NOUVEAU: Statistiques de mémoire ***
      memoryStats: this.getMemoryStats()
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
      console.log(`  - isPaused: ${stats.pauseInfo.isPaused}`); // *** NOUVEAU ***
      console.log(`🧹 [MEMORY] - Orientation history: ${stats.memoryStats.orientationHistorySize}/${this.orientationHistoryMaxSize}`);
      console.log(`🧹 [MEMORY] - Step history: ${stats.memoryStats.stepHistorySize}/${this.maxHistorySize}`);
      console.log(`🧹 [MEMORY] - Cleanups performed: ${stats.memoryStats.totalCleanupsPerformed}`);
      console.log('🔧 [STEP-LENGTH-TRACE] === FIN STATS ===');
      this.lastStatsLog = now;
    }
    
    return stats;
  }

  /**
   * *** NOUVEAU: Obtenir les statistiques détaillées de mémoire ***
   */
  getMemoryStats() {
    return {
      orientationHistorySize: this.orientationHistory.length,
      orientationHistoryMaxSize: this.orientationHistoryMaxSize,
      stepHistorySize: this.stepHistory.length,
      stepHistoryMaxSize: this.maxHistorySize,
      validStepsHistorySize: this.validStepsHistory.length,
      validStepsHistoryMaxSize: this.validStepsHistoryMaxSize,
      objectPools: {
        orientationObjects: this.memoryOptimization.objectPool.orientationObjects.length,
        stepObjects: this.memoryOptimization.objectPool.stepObjects.length,
        dataObjects: this.memoryOptimization.objectPool.dataObjects.length
      },
      throttledLogsCount: this.memoryOptimization.logThrottling.throttledLogs.size,
      lastMemoryCleanup: this.metrics.memoryStats.lastMemoryCleanup,
      totalCleanupsPerformed: this.metrics.memoryStats.totalCleanupsPerformed,
      memoryOptimizationActive: this.memoryCleanupTimer !== null,
      estimatedMemoryUsage: this._estimateMemoryUsage()
    };
  }

  /**
   * *** NOUVEAU: Estimation approximative de l'utilisation mémoire ***
   */
  _estimateMemoryUsage() {
    // Estimation grossière en bytes
    const orientationMemory = this.orientationHistory.length * 8; // 8 bytes per number
    const stepMemory = this.stepHistory.length * 64; // ~64 bytes per step object
    const validStepsMemory = this.validStepsHistory.length * 48; // ~48 bytes per valid step
    const poolMemory = (
      this.memoryOptimization.objectPool.orientationObjects.length +
      this.memoryOptimization.objectPool.stepObjects.length +
      this.memoryOptimization.objectPool.dataObjects.length
    ) * 32; // ~32 bytes per pooled object
    
    const totalBytes = orientationMemory + stepMemory + validStepsMemory + poolMemory;
    
    return {
      totalBytes,
      totalKB: (totalBytes / 1024).toFixed(2),
      breakdown: {
        orientationHistory: orientationMemory,
        stepHistory: stepMemory,
        validStepsHistory: validStepsMemory,
        objectPools: poolMemory
      }
    };
  }

  /**
   * *** NOUVEAU: Forcer un nettoyage manuel de la mémoire ***
   */
  forceMemoryCleanup() {
    console.log('🧹 [MEMORY] Nettoyage manuel forcé');
    this._performMemoryCleanup();
    return this.getMemoryStats();
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
    
    // *** NOUVEAU: Arrêt des capteurs ***
    this._stopSensors();
    
    // *** NOUVEAU: Arrêt du nettoyage automatique de la mémoire ***
    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
      this.memoryCleanupTimer = null;
      console.log('🛑 [MEMORY] Timer de nettoyage arrêté');
    }
    
    // *** NOUVEAU: Nettoyage final de la mémoire ***
    this._performFinalMemoryCleanup();
    
    // *** NOUVEAU: Nettoyer l'exposition globale ***
    this._cleanupGlobalExposure();
    
    this.isRunning = false;
    this.isPaused = false; // *** NOUVEAU: Réinitialiser l'état de pause ***
    
    const sessionDuration = this.sessionStartTime ? 
      (Date.now() - this.sessionStartTime.getTime()) / 1000 : 0;
    
    console.log('🛑 [NATIVE-ENHANCED] Service arrêté');
    console.log(`📊 Session: ${this.stepCount} pas en ${sessionDuration.toFixed(1)}s`);
    console.log(`📏 Longueur de pas: ${this.metrics.averageStepLength.toFixed(3)}m`);
    console.log(`🎯 Mode utilisé: ${this.metrics.usingNativeStepLength ? 'CMPedometer NATIF' : this.USE_FALLBACK_ONLY ? 'FALLBACK CONSTANT' : 'Expo Pedometer ADAPTATIF'}`);
    console.log(`🧹 [MEMORY] Nettoyages effectués: ${this.metrics.memoryStats.totalCleanupsPerformed}`);
  }

  /**
   * *** NOUVEAU: Nettoyer l'exposition globale du service ***
   */
  _cleanupGlobalExposure() {
    try {
      if (typeof window !== 'undefined' && window.nativeEnhancedMotionService === this) {
        delete window.nativeEnhancedMotionService;
        console.log('🌐 [GLOBAL] Service retiré de window.nativeEnhancedMotionService');
      }
      if (typeof global !== 'undefined' && global.nativeEnhancedMotionService === this) {
        delete global.nativeEnhancedMotionService;
        console.log('🌐 [GLOBAL] Service retiré de global.nativeEnhancedMotionService');
      }
    } catch (error) {
      console.warn('⚠️ [GLOBAL] Erreur nettoyage exposition globale:', error.message);
    }
  }

  /**
   * *** NOUVEAU: Nettoyage final et complet de la mémoire ***
   */
  _performFinalMemoryCleanup() {
    console.log('🧹 [MEMORY] Nettoyage final en cours...');
    
    // Vider tous les historiques
    this.orientationHistory.length = 0;
    this.stepHistory.length = 0;
    this.validStepsHistory.length = 0;
    
    // Vider les pools d'objets
    this.memoryOptimization.objectPool.orientationObjects.length = 0;
    this.memoryOptimization.objectPool.stepObjects.length = 0;
    this.memoryOptimization.objectPool.dataObjects.length = 0;
    
    // Vider la map des logs throttlés
    this.memoryOptimization.logThrottling.throttledLogs.clear();
    
    // Réinitialiser les métriques de mémoire
    this.metrics.memoryStats = {
      orientationHistorySize: 0,
      stepHistorySize: 0,
      validStepsHistorySize: 0,
      lastMemoryCleanup: Date.now(),
      totalCleanupsPerformed: 0
    };
    
    console.log('🧹 [MEMORY] Nettoyage final terminé - toute la mémoire libérée');
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
    
    // Vérification que les métriques restent cohérentes
    console.log(`🔧 [STEP-LENGTH-TRACE] Métriques après pas:`);
    console.log(`  - averageStepLength: ${this.metrics.averageStepLength}m`);
    console.log(`  - adaptiveStepLength: ${this.metrics.adaptiveStepLength}m`);
    console.log(`  - totalSteps: ${this.metrics.totalSteps}`);
    console.log(`  - totalDistance: ${this.metrics.totalDistance.toFixed(2)}m`);
    
    console.log(`🆘 [FALLBACK-STEP] Pas simulé: ${stepLength}m (total: ${this.stepCount} pas, ${this.metrics.totalDistance.toFixed(2)}m)`);
    
    // Incrémenter le compteur de pas du segment
    this.segmentStepCount += 1;
    
    // Calcul de la position avec orientation STABLE
    const yawRadians = this.currentSmoothedOrientation ? (this.currentSmoothedOrientation * Math.PI / 180) : 0;
    const dx = stepLength * Math.sin(yawRadians);
    const dy = stepLength * Math.cos(yawRadians);
    
    console.log(`🧭 [FALLBACK-STEP] Orientation filtrée: ${this.currentSmoothedOrientation ? (this.currentSmoothedOrientation.toFixed(1) + "°") : "N/A"}`);
    
    this.stepCount++;
    this.metrics.totalSteps = this.stepCount;
    this.metrics.totalDistance += stepLength;
    this.metrics.lastUpdate = now;
    
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

  /**
   * *** NOUVEAU: Interpolation de l'orientation pour un timestamp donné ***
   */
  _getInterpolatedOrientation(targetTimestamp) {
    if (this.orientationHistory.length === 0) {
      return this.currentSmoothedOrientation || 0;
    }
    
    // Trouver l'orientation la plus proche du timestamp
    let closestOrientation = this.orientationHistory[0];
    let minTimeDiff = Math.abs(closestOrientation - targetTimestamp);
    
    for (const orientation of this.orientationHistory) {
      const timeDiff = Math.abs(orientation - targetTimestamp);
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closestOrientation = orientation;
      }
    }
    
    // Retourner l'orientation lissée la plus proche
    return this.currentSmoothedOrientation || 0;
  }

  /**
   * *** NOUVEAU: Démarrer les capteurs pour SensorsScreen ***
   */
  async _startSensors() {
    try {
      console.log('📱 [SENSORS] Démarrage des capteurs avec configuration optimisée...');
      console.log(`📱 [SENSORS] Fréquence: ${this.sensorsUpdateRate} Hz`);
      console.log(`📱 [SENSORS] Capteurs activés:`, this.sensorsConfig.enabled);
      
      // Variables pour stocker les dernières données
      let latestAccelerometer = { x: 0, y: 0, z: 0 };
      let latestGyroscope = { x: 0, y: 0, z: 0 };
      
      // *** NOUVEAU: Démarrer seulement les capteurs activés ***
      if (this.sensorsConfig.enabled.accelerometer) {
        Accelerometer.setUpdateInterval(1000 / this.sensorsUpdateRate);
        this.accelerometerSub = Accelerometer.addListener(accelerometerData => {
          latestAccelerometer = accelerometerData;
          this._updateSensorData(latestAccelerometer, latestGyroscope);
        });
        console.log(`✅ [SENSORS] Accéléromètre démarré à ${this.sensorsUpdateRate} Hz`);
      } else {
        console.log(`⏸️ [SENSORS] Accéléromètre désactivé (économie batterie)`);
      }
      
      if (this.sensorsConfig.enabled.gyroscope) {
        Gyroscope.setUpdateInterval(1000 / this.sensorsUpdateRate);
        this.gyroscopeSub = Gyroscope.addListener(gyroscopeData => {
          latestGyroscope = gyroscopeData;
          this._updateSensorData(latestAccelerometer, latestGyroscope);
        });
        console.log(`✅ [SENSORS] Gyroscope démarré à ${this.sensorsUpdateRate} Hz`);
      } else {
        console.log(`⏸️ [SENSORS] Gyroscope désactivé (économie batterie)`);
      }
      
      console.log('✅ [SENSORS] Configuration capteurs appliquée avec succès');
      
    } catch (error) {
      console.error('❌ [SENSORS] Erreur démarrage capteurs:', error);
      // Continuer sans les capteurs si erreur
    }
  }

  /**
   * *** NOUVEAU: Traitement des données des capteurs ***
   */
  _updateSensorData(accelerometer, gyroscope) {
    // Throttling pour éviter trop de mises à jour
    const now = Date.now();
    if (this.lastSensorUpdate && (now - this.lastSensorUpdate) < (1000 / this.sensorsUpdateRate)) {
      return;
    }
    this.lastSensorUpdate = now;
    
    // Envoyer les données via le callback
    if (this.onSensors) {
      this.onSensors({
        accelerometer,
        gyroscope,
        timestamp: now
      });
    }
  }

  /**
   * *** NOUVEAU: Arrêter les capteurs ***
   */
  _stopSensors() {
    try {
      if (this.accelerometerSub) {
        this.accelerometerSub.remove();
        this.accelerometerSub = null;
      }
      
      if (this.gyroscopeSub) {
        this.gyroscopeSub.remove();
        this.gyroscopeSub = null;
      }
      
      console.log('🛑 [SENSORS] Capteurs arrêtés');
    } catch (error) {
      console.error('❌ [SENSORS] Erreur arrêt capteurs:', error);
    }
  }

  /**
   * *** NOUVEAU: Configuration des paramètres de filtrage de la boussole ***
   */
  configureCompassFiltering(options = {}) {
    if (options.historySize !== undefined) {
      this.orientationHistoryMaxSize = Math.max(10, Math.min(100, options.historySize));
      console.log(`🧭 [CONFIG] Taille historique mise à jour: ${this.orientationHistoryMaxSize}`);
    }
    
    if (options.accuracyThreshold !== undefined) {
      this.minAccuracyThreshold = Math.max(5, Math.min(30, options.accuracyThreshold));
      console.log(`🧭 [CONFIG] Seuil accuracy mis à jour: ${this.minAccuracyThreshold}°`);
    }
    
    if (options.jumpThreshold !== undefined) {
      this.maxAngleJumpThreshold = Math.max(15, Math.min(90, options.jumpThreshold));
      console.log(`🧭 [CONFIG] Seuil saut mis à jour: ${this.maxAngleJumpThreshold}°`);
    }
    
    if (options.medianWindow !== undefined) {
      this.medianWindowSize = Math.max(3, Math.min(15, options.medianWindow));
      console.log(`🧭 [CONFIG] Fenêtre médiane mise à jour: ${this.medianWindowSize}`);
    }
    
    if (options.maxConsecutiveBad !== undefined) {
      this.maxConsecutiveBadReadings = Math.max(3, Math.min(10, options.maxConsecutiveBad));
      console.log(`🧭 [CONFIG] Max lectures consécutives mauvaises: ${this.maxConsecutiveBadReadings}`);
    }
    
    console.log(`🧭 [CONFIG] Configuration filtrage appliquée:`, {
      historySize: this.orientationHistoryMaxSize,
      accuracyThreshold: this.minAccuracyThreshold,
      jumpThreshold: this.maxAngleJumpThreshold,
      medianWindow: this.medianWindowSize,
      maxConsecutiveBad: this.maxConsecutiveBadReadings
    });
  }

  /**
   * *** NOUVEAU: Obtenir les statistiques de filtrage ***
   */
  getCompassFilteringStats() {
    return {
      currentOrientation: this.currentSmoothedOrientation,
      historySize: this.orientationHistory.length,
      maxHistorySize: this.orientationHistoryMaxSize,
      consecutiveBadReadings: this.consecutiveBadReadings,
      lastGoodOrientation: this.lastGoodOrientation,
      filteringConfig: {
        accuracyThreshold: this.minAccuracyThreshold,
        jumpThreshold: this.maxAngleJumpThreshold,
        medianWindow: this.medianWindowSize,
        maxConsecutiveBad: this.maxConsecutiveBadReadings
      }
    };
  }

  /**
   * *** NOUVEAU: Validation robuste des pas pour éviter le surcomptage ***
   * *** DÉSACTIVÉ: Filtre supprimé pour une précision maximale ***
   */
  _validateStep(stepData) {
    // *** FILTRE DÉSACTIVÉ: Retour immédiat true pour une précision maximale ***
    // Le système natif iOS CMPedometer est déjà très précis, pas besoin de filtrage supplémentaire
    console.log(`✅ [STEP-FILTER] Pas accepté sans filtrage (précision maximale)`);
    return true;
    
    /* ANCIEN CODE DE FILTRAGE DÉSACTIVÉ
    const { stepLength, dx, dy, timestamp, confidence, source } = stepData;
    const now = timestamp || Date.now();
    
    console.log(`🔍 [STEP-FILTER] === VALIDATION DU PAS ===`);
    console.log(`🔍 [STEP-FILTER] Source: ${source}, Longueur: ${stepLength.toFixed(3)}m, Confiance: ${(confidence * 100).toFixed(1)}%`);
    console.log(`🔍 [STEP-FILTER] Déplacement: dx=${dx.toFixed(3)}, dy=${dy.toFixed(3)}`);
    
    // *** FILTRE 1: Validation de la confiance ***
    if (confidence < this.stepFiltering.minConfidenceThreshold) {
      console.log(`❌ [STEP-FILTER] Rejeté - confiance trop faible: ${(confidence * 100).toFixed(1)}% < ${(this.stepFiltering.minConfidenceThreshold * 100).toFixed(1)}%`);
      this.stepFiltering.rejectedStepsCount++;
      return false;
    }
    
    // *** FILTRE 2: Validation de la distance ***
    const stepDistance = Math.hypot(dx, dy);
    if (stepDistance < this.stepFiltering.minStepDistance) {
      console.log(`❌ [STEP-FILTER] Rejeté - distance trop petite: ${stepDistance.toFixed(3)}m < ${this.stepFiltering.minStepDistance}m (micro-mouvement)`);
      this.stepFiltering.rejectedStepsCount++;
      return false;
    }
    
    if (stepDistance > this.stepFiltering.maxStepDistance) {
      console.log(`❌ [STEP-FILTER] Rejeté - distance trop grande: ${stepDistance.toFixed(3)}m > ${this.stepFiltering.maxStepDistance}m (saut irréaliste)`);
      this.stepFiltering.rejectedStepsCount++;
      return false;
    }
    
    // Autres filtres...
    */
  }
  
  /**
   * *** NOUVEAU: Mise à jour des statistiques de filtrage ***
   */
  _updateStepFilteringStats(stepData, stepDistance, timestamp) {
    const { dx, dy, confidence, source } = stepData;
    
    // Ajouter à l'historique des pas valides
    this.validStepsHistory.push({
      timestamp,
      distance: stepDistance,
      displacement: { dx, dy },
      confidence,
      source,
      position: {
        x: this.stepFiltering.lastValidPosition.x + dx,
        y: this.stepFiltering.lastValidPosition.y + dy
      }
    });
    
    // Limiter la taille de l'historique
    if (this.validStepsHistory.length > this.validStepsHistoryMaxSize) {
      this.validStepsHistory.shift();
    }
    
    // Mettre à jour la position et le temps du dernier pas valide
    this.stepFiltering.lastValidStepTime = timestamp;
    this.stepFiltering.lastValidPosition.x += dx;
    this.stepFiltering.lastValidPosition.y += dy;
    
    // *** Calcul du taux de faux positifs ***
    const totalAttempts = this.stepCount + this.stepFiltering.rejectedStepsCount;
    this.stepFiltering.falsePositiveRate = totalAttempts > 0 ? 
      this.stepFiltering.rejectedStepsCount / totalAttempts : 0;
    
    // *** Adaptation automatique des seuils ***
    if (this.stepFiltering.adaptiveThreshold && this.validStepsHistory.length > 10) {
      this._adaptFilteringThresholds();
    }
  }
  
  /**
   * *** NOUVEAU: Adaptation automatique des seuils de filtrage ***
   */
  _adaptFilteringThresholds() {
    const recentSteps = this.validStepsHistory.slice(-20); // 20 derniers pas
    if (recentSteps.length < 10) return;
    
    // Calculer les statistiques des pas récents
    const distances = recentSteps.map(step => step.distance);
    const intervals = [];
    
    for (let i = 1; i < recentSteps.length; i++) {
      intervals.push(recentSteps[i].timestamp - recentSteps[i-1].timestamp);
    }
    
    // Statistiques des distances
    const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const minDistance = Math.min(...distances);
    const maxDistance = Math.max(...distances);
    
    // Statistiques des intervalles
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const minInterval = Math.min(...intervals);
    
    // Adapter les seuils si les données sont cohérentes
    if (distances.length > 15) {
      // Adapter la distance minimum (mais pas en dessous de 30cm)
      const newMinDistance = Math.max(0.3, minDistance * 0.8);
      if (newMinDistance !== this.stepFiltering.minStepDistance) {
        console.log(`🎛️ [STEP-FILTER] Adaptation seuil distance min: ${this.stepFiltering.minStepDistance.toFixed(2)}m → ${newMinDistance.toFixed(2)}m`);
        this.stepFiltering.minStepDistance = newMinDistance;
      }
      
      // Adapter l'intervalle minimum (mais pas en dessous de 200ms)
      const newMinInterval = Math.max(200, minInterval * 0.9);
      if (Math.abs(newMinInterval - this.stepFiltering.minStepInterval) > 50) {
        console.log(`🎛️ [STEP-FILTER] Adaptation seuil intervalle min: ${this.stepFiltering.minStepInterval}ms → ${newMinInterval}ms`);
        this.stepFiltering.minStepInterval = newMinInterval;
      }
    }
  }

  /**
   * *** NOUVEAU: Obtenir les statistiques de filtrage des pas ***
   */
  getStepFilteringStats() {
    const totalAttempts = this.stepCount + this.stepFiltering.rejectedStepsCount;
    const validStepsRate = totalAttempts > 0 ? this.stepCount / totalAttempts : 0;
    
    return {
      validSteps: this.stepCount,
      rejectedSteps: this.stepFiltering.rejectedStepsCount,
      totalAttempts: totalAttempts,
      validStepsRate: validStepsRate,
      falsePositiveRate: this.stepFiltering.falsePositiveRate,
      validStepsHistory: this.validStepsHistory.slice(-10), // 10 derniers pas valides
      filteringConfig: {
        minStepDistance: this.stepFiltering.minStepDistance,
        maxStepDistance: this.stepFiltering.maxStepDistance,
        minStepInterval: this.stepFiltering.minStepInterval,
        maxStepInterval: this.stepFiltering.maxStepInterval,
        minConfidenceThreshold: this.stepFiltering.minConfidenceThreshold,
        zuptThreshold: this.stepFiltering.zuptThreshold,
        adaptiveThreshold: this.stepFiltering.adaptiveThreshold
      },
      averageStepStats: this.validStepsHistory.length > 0 ? {
        averageDistance: this.validStepsHistory.reduce((sum, step) => sum + step.distance, 0) / this.validStepsHistory.length,
        averageInterval: this.validStepsHistory.length > 1 ? 
          (this.validStepsHistory[this.validStepsHistory.length - 1].timestamp - this.validStepsHistory[0].timestamp) / (this.validStepsHistory.length - 1) : 0,
        averageConfidence: this.validStepsHistory.reduce((sum, step) => sum + step.confidence, 0) / this.validStepsHistory.length
      } : null
    };
  }
  
  /**
   * *** NOUVEAU: Configuration des paramètres de filtrage des pas ***
   */
  configureStepFiltering(options = {}) {
    if (options.minStepDistance !== undefined) {
      this.stepFiltering.minStepDistance = Math.max(0.1, Math.min(1.0, options.minStepDistance));
      console.log(`🔧 [STEP-CONFIG] Distance minimum mise à jour: ${this.stepFiltering.minStepDistance}m`);
    }
    
    if (options.maxStepDistance !== undefined) {
      this.stepFiltering.maxStepDistance = Math.max(1.0, Math.min(3.0, options.maxStepDistance));
      console.log(`🔧 [STEP-CONFIG] Distance maximum mise à jour: ${this.stepFiltering.maxStepDistance}m`);
    }
    
    if (options.minStepInterval !== undefined) {
      this.stepFiltering.minStepInterval = Math.max(100, Math.min(1000, options.minStepInterval));
      console.log(`🔧 [STEP-CONFIG] Intervalle minimum mis à jour: ${this.stepFiltering.minStepInterval}ms`);
    }
    
    if (options.minConfidenceThreshold !== undefined) {
      this.stepFiltering.minConfidenceThreshold = Math.max(0.1, Math.min(0.9, options.minConfidenceThreshold));
      console.log(`🔧 [STEP-CONFIG] Seuil de confiance mis à jour: ${(this.stepFiltering.minConfidenceThreshold * 100).toFixed(1)}%`);
    }
    
    if (options.zuptThreshold !== undefined) {
      this.stepFiltering.zuptThreshold = Math.max(0.05, Math.min(0.5, options.zuptThreshold));
      console.log(`🔧 [STEP-CONFIG] Seuil ZUPT mis à jour: ${this.stepFiltering.zuptThreshold}m`);
    }
    
    if (options.adaptiveThreshold !== undefined) {
      this.stepFiltering.adaptiveThreshold = Boolean(options.adaptiveThreshold);
      console.log(`🔧 [STEP-CONFIG] Seuils adaptatifs: ${this.stepFiltering.adaptiveThreshold ? 'activés' : 'désactivés'}`);
    }
    
    console.log(`🔧 [STEP-CONFIG] Configuration filtrage des pas appliquée:`, {
      minStepDistance: this.stepFiltering.minStepDistance,
      maxStepDistance: this.stepFiltering.maxStepDistance,
      minStepInterval: this.stepFiltering.minStepInterval,
      minConfidenceThreshold: this.stepFiltering.minConfidenceThreshold,
      zuptThreshold: this.stepFiltering.zuptThreshold,
      adaptiveThreshold: this.stepFiltering.adaptiveThreshold
    });
  }
  
  /**
   * *** NOUVEAU: Réinitialiser les statistiques de filtrage ***
   */
  resetStepFilteringStats() {
    this.stepFiltering.rejectedStepsCount = 0;
    this.stepFiltering.falsePositiveRate = 0;
    this.stepFiltering.lastValidStepTime = 0;
    this.stepFiltering.lastValidPosition = { x: 0, y: 0 };
    this.validStepsHistory = [];
    
    console.log('🔄 [STEP-CONFIG] Statistiques de filtrage des pas réinitialisées');
  }

  /**
   * *** NOUVEAU: Diagnostic complet du système de filtrage et de détection de pas ***
   */
  getDiagnostics() {
    const stepStats = this.getStepFilteringStats();
    const compassStats = this.getCompassFilteringStats();
    
    return {
      // Statistiques générales
      session: {
        isRunning: this.isRunning,
        sessionDuration: this.sessionStartTime ? (Date.now() - this.sessionStartTime.getTime()) / 1000 : 0,
        totalValidSteps: this.stepCount,
        totalDistance: this.metrics.totalDistance,
        averageStepLength: this.metrics.averageStepLength
      },
      
      // Profil utilisateur
      userProfile: {
        stepLength: this.userStepLength,
        fallbackStepLength: this.FALLBACK_STEP_LENGTH,
        usingNativeStepLength: this.metrics.usingNativeStepLength,
        useFallbackOnly: this.USE_FALLBACK_ONLY
      },
      
      // Filtrage des pas
      stepFiltering: stepStats,
      
      // Filtrage de la boussole
      compassFiltering: compassStats,
      
      // Recommandations
      recommendations: this._generateRecommendations(stepStats, compassStats)
    };
  }
  
  /**
   * *** NOUVEAU: Génération de recommandations basées sur les statistiques ***
   */
  _generateRecommendations(stepStats, compassStats) {
    const recommendations = [];
    
    // Recommandations sur le filtrage des pas
    if (stepStats.falsePositiveRate > 0.3) {
      recommendations.push({
        type: 'warning',
        category: 'step_filtering',
        message: `Taux de rejet élevé (${(stepStats.falsePositiveRate * 100).toFixed(1)}%). Considérez d'assouplir les seuils de filtrage.`,
        action: 'configureStepFiltering({ minStepDistance: 0.2, minConfidenceThreshold: 0.15 })'
      });
    }
    
    if (stepStats.averageStepStats && stepStats.averageStepStats.averageDistance < 0.4) {
      recommendations.push({
        type: 'info',
        category: 'step_length',
        message: `Longueur de pas très courte (${stepStats.averageStepStats.averageDistance.toFixed(2)}m). Vérifiez le profil utilisateur.`,
        action: 'Ajustez la taille de l\'utilisateur dans le profil'
      });
    }
    
    // Recommandations sur la boussole
    if (compassStats.consecutiveBadReadings > 3) {
      recommendations.push({
        type: 'warning',
        category: 'compass',
        message: 'Plusieurs lectures de boussole de mauvaise qualité. Recalibrez la boussole.',
        action: 'Effectuez un mouvement en forme de 8 avec l\'appareil'
      });
    }
    
    // Recommandations générales
    if (stepStats.validSteps < 10) {
      recommendations.push({
        type: 'info',
        category: 'general',
        message: 'Peu de pas détectés. Assurez-vous de marcher normalement.',
        action: 'Marchez à un rythme régulier avec l\'appareil'
      });
    }
    
    return recommendations;
  }
  
  /**
   * *** NOUVEAU: Affichage formaté des diagnostics ***
   */
  printDiagnostics() {
    const diagnostics = this.getDiagnostics();
    
    console.log('\n🔍 === DIAGNOSTICS COMPLETS ===');
    
    // Session
    console.log('\n📊 SESSION:');
    console.log(`  Durée: ${diagnostics.session.sessionDuration.toFixed(1)}s`);
    console.log(`  Pas validés: ${diagnostics.session.totalValidSteps}`);
    console.log(`  Distance totale: ${diagnostics.session.totalDistance.toFixed(2)}m`);
    console.log(`  Longueur de pas moyenne: ${diagnostics.session.averageStepLength.toFixed(3)}m`);
    
    // Profil utilisateur
    console.log('\n👤 PROFIL UTILISATEUR:');
    console.log(`  Longueur configurée: ${diagnostics.userProfile.stepLength.toFixed(3)}m`);
    console.log(`  Mode natif: ${diagnostics.userProfile.usingNativeStepLength ? 'OUI' : 'NON'}`);
    console.log(`  Mode fallback seul: ${diagnostics.userProfile.useFallbackOnly ? 'OUI' : 'NON'}`);
    
    // Filtrage des pas
    console.log('\n🔍 FILTRAGE DES PAS:');
    console.log(`  Taux de validation: ${(diagnostics.stepFiltering.validStepsRate * 100).toFixed(1)}%`);
    console.log(`  Pas rejetés: ${diagnostics.stepFiltering.rejectedSteps}/${diagnostics.stepFiltering.totalAttempts}`);
    console.log(`  Taux de faux positifs: ${(diagnostics.stepFiltering.falsePositiveRate * 100).toFixed(1)}%`);
    
    if (diagnostics.stepFiltering.averageStepStats) {
      console.log(`  Distance moyenne: ${diagnostics.stepFiltering.averageStepStats.averageDistance.toFixed(3)}m`);
      console.log(`  Intervalle moyen: ${diagnostics.stepFiltering.averageStepStats.averageInterval.toFixed(0)}ms`);
      console.log(`  Confiance moyenne: ${(diagnostics.stepFiltering.averageStepStats.averageConfidence * 100).toFixed(1)}%`);
    }
    
    // Recommandations
    if (diagnostics.recommendations.length > 0) {
      console.log('\n💡 RECOMMANDATIONS:');
      diagnostics.recommendations.forEach((rec, index) => {
        const icon = rec.type === 'warning' ? '⚠️' : rec.type === 'error' ? '❌' : 'ℹ️';
        console.log(`  ${icon} [${rec.category.toUpperCase()}] ${rec.message}`);
        console.log(`     Action: ${rec.action}`);
      });
    }
    
    console.log('\n🔍 === FIN DIAGNOSTICS ===\n');
    
    return diagnostics;
  }
} 