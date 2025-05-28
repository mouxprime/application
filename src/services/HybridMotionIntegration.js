// HybridMotionIntegration.js
// Exemple d'intégration du HybridMotionService avec votre orchestrateur existant

import HybridMotionService from './HybridMotionService';
import { LocalizationService } from './LocalizationService';

/**
 * Orchestrateur qui combine le HybridMotionService avec le LocalizationService existant
 * pour une navigation intérieure hybride (capteurs + podomètre natif + boussole)
 */
export class HybridLocalizationOrchestrator {
  constructor(localizationActions) {
    this.localizationActions = localizationActions;
    
    // Services existants
    this.localizationService = new LocalizationService(localizationActions);
    
    // Nouveau service hybride
    this.hybridMotionService = null;
    
    // État de la trajectoire hybride
    this.hybridState = {
      position: { x: 0, y: 0 },
      orientation: 0,
      stepCount: 0,
      distance: 0,
      confidence: 0,
      trajectory: []
    };
    
    // Configuration
    this.config = {
      useHybridMode: true,
      hybridWeight: 0.7, // Poids du système hybride vs capteurs classiques
      userHeight: 1.7,   // À configurer selon l'utilisateur
      stepLengthSmoothing: 0.05,
      headingSmoothing: 0.1
    };
  }

  /**
   * Initialisation du service hybride
   */
  async initializeHybridMotion() {
    if (this.hybridMotionService) {
      console.warn('HybridMotionService déjà initialisé');
      return;
    }

    try {
      // Création du service avec callbacks
      this.hybridMotionService = new HybridMotionService(
        // Callback pour les pas détectés
        ({ stepCount, stepLength, dx, dy, timestamp }) => {
          this.handleStepDetected({ stepCount, stepLength, dx, dy, timestamp });
        },
        // Callback pour l'orientation
        ({ yaw, accuracy, timestamp }) => {
          this.handleHeadingUpdate({ yaw, accuracy, timestamp });
        }
      );

      // Configuration du service
      this.hybridMotionService.setUserHeight(this.config.userHeight);
      this.hybridMotionService.setStepLengthSmoothing(this.config.stepLengthSmoothing);
      this.hybridMotionService.setHeadingSmoothing(this.config.headingSmoothing);

      console.log('✅ HybridMotionService initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation HybridMotionService:', error);
      throw error;
    }
  }

  /**
   * Gestion des pas détectés par le podomètre natif
   */
  handleStepDetected({ stepCount, stepLength, dx, dy, timestamp }) {
    // Mise à jour de l'état hybride
    this.hybridState.position.x += dx;
    this.hybridState.position.y += dy;
    this.hybridState.stepCount = stepCount;
    this.hybridState.distance = (this.hybridState.distance || 0) + stepLength;

    // Ajout du point à la trajectoire hybride
    this.addHybridTrajectoryPoint({
      x: this.hybridState.position.x,
      y: this.hybridState.position.y,
      timestamp,
      source: 'hybrid_pedometer'
    });

    // Fusion avec les données du LocalizationService si disponible
    if (this.config.useHybridMode) {
      this.fuseHybridWithClassical();
    }

    // Mise à jour de l'UI
    this.localizationActions.updatePDRMetrics({
      stepCount: this.hybridState.stepCount,
      distance: this.hybridState.distance,
      currentMode: 'HYBRID_NATIVE',
      energyLevel: 1.0, // Le podomètre natif est très efficace
      isZUPT: false
    });

    console.log(`🚶 Pas hybride détecté: ${stepCount}, longueur: ${stepLength.toFixed(2)}m`);
  }

  /**
   * Gestion des mises à jour d'orientation de la boussole
   */
  handleHeadingUpdate({ yaw, accuracy, timestamp }) {
    this.hybridState.orientation = yaw;
    this.hybridState.confidence = Math.min(1.0, accuracy / 100); // Normalisation

    // Mise à jour de l'orientation dans le contexte
    this.localizationActions.updatePose({
      x: this.hybridState.position.x,
      y: this.hybridState.position.y,
      theta: yaw,
      confidence: this.hybridState.confidence
    });

    console.log(`🧭 Orientation hybride: ${yaw.toFixed(1)}°, précision: ${accuracy}`);
  }

  /**
   * Fusion des données hybrides avec le système classique
   */
  fuseHybridWithClassical() {
    const classicalState = this.localizationService.getCurrentTransformedData();
    
    if (classicalState && classicalState.position) {
      // Fusion pondérée des positions
      const w = this.config.hybridWeight;
      const fusedX = w * this.hybridState.position.x + (1 - w) * classicalState.position.x;
      const fusedY = w * this.hybridState.position.y + (1 - w) * classicalState.position.y;
      
      // Fusion des orientations (gestion des angles circulaires)
      const fusedTheta = this.fuseAngles(
        this.hybridState.orientation,
        classicalState.orientation || 0,
        w
      );

      // Mise à jour de la pose fusionnée
      this.localizationActions.updatePose({
        x: fusedX,
        y: fusedY,
        theta: fusedTheta,
        confidence: Math.max(this.hybridState.confidence, classicalState.confidence || 0)
      });

      console.log(`🔄 Fusion hybride: (${fusedX.toFixed(2)}, ${fusedY.toFixed(2)}) @ ${fusedTheta.toFixed(1)}°`);
    }
  }

  /**
   * Fusion d'angles en tenant compte de la circularité
   */
  fuseAngles(angle1, angle2, weight) {
    const rad1 = angle1 * Math.PI / 180;
    const rad2 = angle2 * Math.PI / 180;
    
    const x = weight * Math.cos(rad1) + (1 - weight) * Math.cos(rad2);
    const y = weight * Math.sin(rad1) + (1 - weight) * Math.sin(rad2);
    
    return Math.atan2(y, x) * 180 / Math.PI;
  }

  /**
   * Ajout d'un point à la trajectoire hybride
   */
  addHybridTrajectoryPoint(point) {
    this.hybridState.trajectory.push(point);
    
    // Limitation de la taille de la trajectoire
    if (this.hybridState.trajectory.length > 1000) {
      this.hybridState.trajectory = this.hybridState.trajectory.slice(-800);
    }

    // Mise à jour de l'UI
    this.localizationActions.addTrajectoryPoint(point);
  }

  /**
   * Démarrage de l'orchestrateur hybride
   */
  async start() {
    try {
      // 1. Démarrage du service de localisation classique
      await this.localizationService.start();
      
      // 2. Initialisation et démarrage du service hybride
      if (!this.hybridMotionService) {
        await this.initializeHybridMotion();
      }
      await this.hybridMotionService.start();
      
      console.log('✅ Orchestrateur hybride démarré avec succès');
      console.log(`🎯 Mode hybride: ${this.config.useHybridMode ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
      console.log(`⚖️ Poids hybride: ${this.config.hybridWeight}`);
      
    } catch (error) {
      console.error('❌ Erreur démarrage orchestrateur hybride:', error);
      throw error;
    }
  }

  /**
   * Arrêt de l'orchestrateur hybride
   */
  stop() {
    // Arrêt du service hybride
    if (this.hybridMotionService) {
      this.hybridMotionService.stop();
    }
    
    // Arrêt du service classique
    this.localizationService.stop();
    
    console.log('🛑 Orchestrateur hybride arrêté');
  }

  /**
   * Configuration du mode hybride
   */
  configureHybrid(config) {
    this.config = { ...this.config, ...config };
    
    if (this.hybridMotionService) {
      this.hybridMotionService.setUserHeight(this.config.userHeight);
      this.hybridMotionService.setStepLengthSmoothing(this.config.stepLengthSmoothing);
      this.hybridMotionService.setHeadingSmoothing(this.config.headingSmoothing);
    }
    
    console.log('⚙️ Configuration hybride mise à jour:', this.config);
  }

  /**
   * Réinitialisation de l'état hybride
   */
  resetHybrid() {
    this.hybridState = {
      position: { x: 0, y: 0 },
      orientation: 0,
      stepCount: 0,
      distance: 0,
      confidence: 0,
      trajectory: []
    };
    
    if (this.hybridMotionService) {
      this.hybridMotionService.reset();
    }
    
    console.log('🔄 État hybride réinitialisé');
  }

  /**
   * Obtention des statistiques hybrides
   */
  getHybridStats() {
    const motionStats = this.hybridMotionService ? 
      this.hybridMotionService.getStats() : null;
    
    return {
      hybridState: this.hybridState,
      motionStats,
      config: this.config,
      isRunning: this.hybridMotionService !== null
    };
  }
} 