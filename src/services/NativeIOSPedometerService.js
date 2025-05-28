/**
 * Service de podomètre natif iOS utilisant CMPedometer
 * Fonctionne directement avec CoreMotion sans module natif
 */

import { Platform, NativeModules } from 'react-native';
import { Pedometer } from 'expo-sensors';

class NativeIOSPedometerService {
  constructor() {
    this.isAvailable = false;
    this.isActive = false;
    this.subscription = null;
    this.stepCallback = null;
    this.lastStepCount = 0;
    this.sessionStartTime = null;
    this.sessionStartSteps = 0;
  }

  /**
   * Initialiser le service et vérifier la disponibilité
   */
  async initialize() {
    try {
      console.log('🍎 [IOS-PEDOMETER] Initialisation du service CMPedometer...');
      
      if (Platform.OS !== 'ios') {
        console.log('🍎 [IOS-PEDOMETER] Plateforme non iOS, service non disponible');
        this.isAvailable = false;
        return false;
      }

      // Vérifier la disponibilité du podomètre
      const available = await Pedometer.isAvailableAsync();
      this.isAvailable = available;
      
      if (available) {
        console.log('✅ [IOS-PEDOMETER] CMPedometer disponible');
        
        // Demander les permissions
        const { status } = await Pedometer.requestPermissionsAsync();
        if (status === 'granted') {
          console.log('✅ [IOS-PEDOMETER] Permissions accordées');
          return true;
        } else {
          console.warn('⚠️ [IOS-PEDOMETER] Permissions refusées');
          this.isAvailable = false;
          return false;
        }
      } else {
        console.warn('⚠️ [IOS-PEDOMETER] CMPedometer non disponible sur cet appareil');
        return false;
      }
    } catch (error) {
      console.error('❌ [IOS-PEDOMETER] Erreur initialisation:', error);
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Vérifier si le service est disponible
   */
  isServiceAvailable() {
    return this.isAvailable;
  }

  /**
   * Démarrer le suivi des pas
   */
  async start(stepCallback) {
    try {
      if (!this.isAvailable) {
        throw new Error('Service CMPedometer non disponible');
      }

      if (this.isActive) {
        console.log('🍎 [IOS-PEDOMETER] Service déjà actif');
        return true;
      }

      console.log('🍎 [IOS-PEDOMETER] Démarrage du suivi des pas...');
      
      this.stepCallback = stepCallback;
      this.sessionStartTime = new Date();
      this.lastStepCount = 0;
      this.sessionStartSteps = 0;

      // Démarrer le suivi en temps réel
      this.subscription = Pedometer.watchStepCount((result) => {
        this.handleStepUpdate(result);
      });

      // Obtenir les données historiques pour initialiser le compteur
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // 24h en arrière
      
      try {
        const pastStepCountResult = await Pedometer.getStepCountAsync(start, end);
        if (pastStepCountResult.steps) {
          this.sessionStartSteps = pastStepCountResult.steps;
          console.log(`🍎 [IOS-PEDOMETER] Pas historiques (24h): ${pastStepCountResult.steps}`);
        }
      } catch (error) {
        console.warn('⚠️ [IOS-PEDOMETER] Impossible d\'obtenir les données historiques:', error);
      }

      this.isActive = true;
      console.log('✅ [IOS-PEDOMETER] Service démarré avec succès');
      return true;

    } catch (error) {
      console.error('❌ [IOS-PEDOMETER] Erreur démarrage:', error);
      return false;
    }
  }

  /**
   * Arrêter le suivi des pas
   */
  stop() {
    try {
      if (this.subscription) {
        this.subscription.remove();
        this.subscription = null;
      }

      this.isActive = false;
      this.stepCallback = null;
      this.lastStepCount = 0;
      this.sessionStartTime = null;
      this.sessionStartSteps = 0;

      console.log('🛑 [IOS-PEDOMETER] Service arrêté');
    } catch (error) {
      console.error('❌ [IOS-PEDOMETER] Erreur arrêt:', error);
    }
  }

  /**
   * Gérer les mises à jour de pas
   */
  handleStepUpdate(result) {
    try {
      if (!this.stepCallback || !this.isActive) {
        return;
      }

      const currentSteps = result.steps || 0;
      const newSteps = currentSteps - this.lastStepCount;

      if (newSteps > 0) {
        console.log(`🍎 [IOS-PEDOMETER] Nouveaux pas détectés: ${newSteps} (total: ${currentSteps})`);

        // Calculer la longueur de pas (CMPedometer ne fournit pas cette info directement)
        // On utilise une estimation basée sur les données utilisateur ou une valeur par défaut
        const stepLength = this.getEstimatedStepLength();
        
        // Calculer le déplacement (estimation simple)
        const distance = newSteps * stepLength;
        const dx = distance; // Simplification : mouvement vers l'avant
        const dy = 0;

        // Appeler le callback avec les données
        this.stepCallback({
          stepCount: currentSteps,
          stepLength: stepLength,
          dx: dx,
          dy: dy,
          timestamp: Date.now(),
          totalSteps: currentSteps,
          confidence: 0.95, // CMPedometer est très fiable
          source: 'ios_cmpedometer',
          nativeStepLength: stepLength,
          averageStepLength: stepLength,
          cadence: this.calculateCadence(newSteps),
          timeDelta: 1000, // Estimation
          isFallback: false
        });

        this.lastStepCount = currentSteps;
      }

    } catch (error) {
      console.error('❌ [IOS-PEDOMETER] Erreur traitement pas:', error);
    }
  }

  /**
   * Obtenir une estimation de la longueur de pas
   */
  getEstimatedStepLength() {
    // Essayer d'obtenir la longueur de pas du profil utilisateur
    try {
      const { userProfileService } = require('./UserProfileService');
      if (userProfileService && userProfileService.isProfileComplete()) {
        const stepLength = userProfileService.getStepLength();
        if (stepLength > 0) {
          return stepLength;
        }
      }
    } catch (error) {
      console.warn('⚠️ [IOS-PEDOMETER] Impossible d\'obtenir la longueur de pas du profil');
    }

    // Valeur par défaut
    return 0.75; // 75 cm par pas
  }

  /**
   * Calculer la cadence (pas par minute)
   */
  calculateCadence(newSteps) {
    if (!this.sessionStartTime) {
      return 0;
    }

    const elapsedMinutes = (Date.now() - this.sessionStartTime.getTime()) / (1000 * 60);
    if (elapsedMinutes > 0) {
      return Math.round((this.lastStepCount + newSteps) / elapsedMinutes);
    }

    return 0;
  }

  /**
   * Obtenir les statistiques du service
   */
  getStats() {
    return {
      isAvailable: this.isAvailable,
      isActive: this.isActive,
      platform: 'ios',
      service: 'CMPedometer',
      lastStepCount: this.lastStepCount,
      sessionStartTime: this.sessionStartTime,
      sessionStartSteps: this.sessionStartSteps
    };
  }

  /**
   * Obtenir les données de pas pour une période
   */
  async getStepCountForPeriod(startDate, endDate) {
    try {
      if (!this.isAvailable) {
        throw new Error('Service non disponible');
      }

      const result = await Pedometer.getStepCountAsync(startDate, endDate);
      console.log(`🍎 [IOS-PEDOMETER] Pas pour la période: ${result.steps}`);
      
      return {
        steps: result.steps || 0,
        startDate: startDate,
        endDate: endDate
      };

    } catch (error) {
      console.error('❌ [IOS-PEDOMETER] Erreur récupération données période:', error);
      return {
        steps: 0,
        startDate: startDate,
        endDate: endDate,
        error: error.message
      };
    }
  }
}

// Instance singleton
export const nativeIOSPedometerService = new NativeIOSPedometerService(); 