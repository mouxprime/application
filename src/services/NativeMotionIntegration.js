// NativeMotionIntegration.js
// Exemple d'intégration du NativeEnhancedMotionService avec votre orchestrateur existant

import NativeEnhancedMotionService from './NativeEnhancedMotionService';
import { LocalizationService } from './LocalizationService';

/**
 * Orchestrateur qui combine le NativeEnhancedMotionService avec le LocalizationService existant
 * pour une navigation intérieure simplifiée (capteurs + podomètre natif + boussole)
 */
export class NativeLocalizationOrchestrator {
  constructor(localizationActions) {
    this.localizationActions = localizationActions;
    
    // Services existants
    this.localizationService = new LocalizationService(localizationActions);
    
    // Nouveau service natif simplifié
    this.nativeMotionService = null;
    
    // État de la trajectoire
    this.nativeState = {
      position: { x: 0, y: 0 },
      orientation: 0,
      stepCount: 0,
      distance: 0,
      confidence: 0,
      trajectory: []
    };
    
    // Configuration simplifiée
    this.config = {
      useNativeMode: true,
      nativeWeight: 0.9, // Poids élevé pour les données natives
    };
  }

  /**
   * Initialisation du service natif
   */
  async initializeNativeMotion() {
    if (this.nativeMotionService) {
      console.warn('NativeEnhancedMotionService déjà initialisé');
      return;
    }

    try {
      // Création du service avec callbacks
      this.nativeMotionService = new NativeEnhancedMotionService(
        // Callback pour les pas détectés
        ({ stepCount, stepLength, dx, dy, timestamp, source, nativeStepLength, confidence }) => {
          this.handleStepDetected({ stepCount, stepLength, dx, dy, timestamp, source, nativeStepLength, confidence });
        },
        // Callback pour l'orientation
        ({ yaw, accuracy, timestamp, source, filteredHeading }) => {
          this.handleHeadingUpdate({ yaw, accuracy, timestamp, source, filteredHeading });
        }
      );

      console.log('✅ NativeEnhancedMotionService initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation NativeEnhancedMotionService:', error);
      throw error;
    }
  }

  /**
   * Gestion des pas détectés
   */
  handleStepDetected({ stepCount, stepLength, dx, dy, timestamp, source, nativeStepLength, confidence }) {
    console.log(`🚶 [ORCHESTRATOR] Pas détecté: ${stepCount}`);
    console.log(`📏 [ORCHESTRATOR] Longueur: ${stepLength.toFixed(3)}m ${nativeStepLength ? '(NATIVE)' : '(FALLBACK)'}`);
    
    // Mise à jour de l'état interne
    this.nativeState.stepCount = stepCount;
    this.nativeState.position.x += dx;
    this.nativeState.position.y += dy;
    this.nativeState.distance += stepLength;
    this.nativeState.confidence = nativeStepLength ? 1.0 : confidence; // Confiance maximale pour les données natives
    
    // Ajouter à la trajectoire
    this.nativeState.trajectory.push({
      x: this.nativeState.position.x,
      y: this.nativeState.position.y,
      timestamp,
      stepLength,
      source,
      confidence: this.nativeState.confidence
    });
    
    // Limiter la trajectoire à 1000 points
    if (this.nativeState.trajectory.length > 1000) {
      this.nativeState.trajectory = this.nativeState.trajectory.slice(-1000);
    }
    
    // Propagation vers le service de localisation
    if (this.localizationActions) {
      this.localizationActions.updatePosition({
        x: this.nativeState.position.x,
        y: this.nativeState.position.y,
        confidence: this.nativeState.confidence,
        source: 'native_motion'
      });
    }
  }

  /**
   * Gestion de l'orientation
   */
  handleHeadingUpdate({ yaw, accuracy, timestamp, source, filteredHeading }) {
    // Mise à jour de l'orientation
    this.nativeState.orientation = yaw;
    
    // Propagation vers le service de localisation
    if (this.localizationActions) {
      this.localizationActions.updateOrientation({
        theta: yaw,
        accuracy,
        source: 'native_compass'
      });
    }
  }

  /**
   * Démarrage de l'orchestrateur natif
   */
  async start() {
    try {
      // 1. Démarrage du service de localisation classique
      await this.localizationService.start();
      
      // 2. Initialisation et démarrage du service natif
      if (!this.nativeMotionService) {
        await this.initializeNativeMotion();
      }
      await this.nativeMotionService.start();
      
      console.log('✅ Orchestrateur natif démarré avec succès');
      console.log(`🎯 Mode natif: ${this.config.useNativeMode ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
      console.log(`⚖️ Poids natif: ${this.config.nativeWeight}`);
      
    } catch (error) {
      console.error('❌ Erreur démarrage orchestrateur natif:', error);
      throw error;
    }
  }

  /**
   * Arrêt de l'orchestrateur natif
   */
  stop() {
    // Arrêt du service natif
    if (this.nativeMotionService) {
      this.nativeMotionService.stop();
    }
    
    // Arrêt du service classique
    this.localizationService.stop();
    
    console.log('🛑 Orchestrateur natif arrêté');
  }

  /**
   * Configuration du mode natif
   */
  configureNative(config) {
    this.config = { ...this.config, ...config };
    
    // Plus de configuration complexe nécessaire avec le service natif
    console.log('⚙️ Configuration native mise à jour:', this.config);
  }

  /**
   * Réinitialisation de l'état natif
   */
  resetNative() {
    this.nativeState = {
      position: { x: 0, y: 0 },
      orientation: 0,
      stepCount: 0,
      distance: 0,
      confidence: 0,
      trajectory: []
    };
    
    if (this.nativeMotionService) {
      this.nativeMotionService.reset();
    }
    
    console.log('🔄 État natif réinitialisé');
  }

  /**
   * Obtention des statistiques natives
   */
  getNativeStats() {
    const motionStats = this.nativeMotionService ? 
      this.nativeMotionService.getStats() : null;
    
    return {
      nativeState: this.nativeState,
      motionStats,
      config: this.config,
      isRunning: this.nativeMotionService !== null,
      
      // Métriques simplifiées
      summary: {
        totalSteps: this.nativeState.stepCount,
        totalDistance: this.nativeState.distance,
        averageStepLength: this.nativeState.stepCount > 0 ? 
          this.nativeState.distance / this.nativeState.stepCount : 0,
        trajectoryPoints: this.nativeState.trajectory.length,
        usingNativeData: motionStats?.metrics.usingNativeStepLength || false,
        nativeAvailable: motionStats?.metrics.nativeAvailable || false
      }
    };
  }

  /**
   * Obtention de la position actuelle
   */
  getCurrentPosition() {
    return {
      x: this.nativeState.position.x,
      y: this.nativeState.position.y,
      theta: this.nativeState.orientation,
      confidence: this.nativeState.confidence,
      timestamp: Date.now()
    };
  }

  /**
   * Obtention de la trajectoire
   */
  getTrajectory() {
    return this.nativeState.trajectory;
  }

  /**
   * Fusion des données natives avec d'autres sources
   */
  fuseWithExternalData(externalPosition, weight = 0.1) {
    if (!externalPosition) return;
    
    // Fusion pondérée avec les données externes
    const nativeWeight = this.config.nativeWeight;
    const externalWeight = weight;
    
    const totalWeight = nativeWeight + externalWeight;
    
    this.nativeState.position.x = (
      this.nativeState.position.x * nativeWeight + 
      externalPosition.x * externalWeight
    ) / totalWeight;
    
    this.nativeState.position.y = (
      this.nativeState.position.y * nativeWeight + 
      externalPosition.y * externalWeight
    ) / totalWeight;
    
    console.log(`🔗 Fusion données: natif(${nativeWeight}) + externe(${externalWeight})`);
  }
} 