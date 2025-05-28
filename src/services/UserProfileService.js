import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Service de gestion du profil utilisateur
 * Gère la taille, le poids et calcule la longueur de pas optimale
 */

const STORAGE_KEY = '@user_profile';

class UserProfileService {
  constructor() {
    this.profile = {
      height: null,        // Taille en cm
      weight: null,        // Poids en kg
      calculatedStepLength: null  // Longueur de pas calculée en mètres
    };
    this.listeners = [];
    this.isInitialized = false;
  }

  /**
   * Initialiser le service et charger le profil sauvegardé
   */
  async initialize() {
    try {
      console.log('📊 [USER-PROFILE] Initialisation du service...');
      
      const savedProfile = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedProfile) {
        const parsedProfile = JSON.parse(savedProfile);
        this.profile = {
          ...this.profile,
          ...parsedProfile
        };
        
        // Recalculer la longueur de pas si les données sont présentes
        if (this.profile.height && this.profile.weight) {
          this.profile.calculatedStepLength = this.calculateStepLength(
            this.profile.height, 
            this.profile.weight
          );
        }
        
        console.log('✅ [USER-PROFILE] Profil chargé:', this.profile);
      } else {
        console.log('📊 [USER-PROFILE] Aucun profil sauvegardé trouvé');
      }
      
      this.isInitialized = true;
      return true;
      
    } catch (error) {
      console.error('❌ [USER-PROFILE] Erreur initialisation:', error);
      this.isInitialized = true; // Continuer même en cas d'erreur
      return false;
    }
  }

  /**
   * Calculer la longueur de pas basée sur la taille et le poids
   * Formule améliorée prenant en compte la morphologie
   */
  calculateStepLength(height, weight) {
    if (!height || height <= 0) {
      console.warn('⚠️ [USER-PROFILE] Taille invalide pour le calcul');
      return 0.65; // Valeur par défaut
    }

    // Conversion taille en mètres
    const heightInMeters = height / 100;
    
    // Formule de base : 0.43 * taille
    let stepLength = heightInMeters * 0.43;
    
    // Ajustement basé sur le poids si disponible
    if (weight && weight > 0) {
      // Calculer l'IMC pour ajuster la longueur de pas
      const bmi = weight / (heightInMeters * heightInMeters);
      
      // Ajustement basé sur l'IMC
      if (bmi < 18.5) {
        // Sous-poids : pas légèrement plus courts
        stepLength *= 0.95;
      } else if (bmi > 25) {
        // Surpoids : pas légèrement plus courts
        stepLength *= 0.92;
      } else if (bmi > 30) {
        // Obésité : pas plus courts
        stepLength *= 0.88;
      }
      // IMC normal (18.5-25) : pas d'ajustement
    }
    
    // Limites de sécurité
    stepLength = Math.max(0.4, Math.min(0.9, stepLength));
    
    console.log(`📏 [USER-PROFILE] Longueur de pas calculée: ${stepLength.toFixed(3)}m (taille: ${height}cm, poids: ${weight}kg)`);
    
    return stepLength;
  }

  /**
   * Mettre à jour le profil utilisateur
   */
  async updateProfile(updates) {
    try {
      console.log('📊 [USER-PROFILE] Mise à jour profil:', updates);
      
      // Valider les données
      if (updates.height !== undefined) {
        if (updates.height < 100 || updates.height > 250) {
          throw new Error('La taille doit être entre 100 et 250 cm');
        }
      }
      
      if (updates.weight !== undefined) {
        if (updates.weight < 30 || updates.weight > 300) {
          throw new Error('Le poids doit être entre 30 et 300 kg');
        }
      }
      
      // Mettre à jour le profil
      this.profile = {
        ...this.profile,
        ...updates
      };
      
      // Recalculer la longueur de pas si on a les données nécessaires
      if (this.profile.height && this.profile.weight) {
        this.profile.calculatedStepLength = this.calculateStepLength(
          this.profile.height, 
          this.profile.weight
        );
      }
      
      // Sauvegarder
      await this.saveProfile();
      
      // Notifier les listeners
      this.notifyListeners();
      
      console.log('✅ [USER-PROFILE] Profil mis à jour:', this.profile);
      return { success: true };
      
    } catch (error) {
      console.error('❌ [USER-PROFILE] Erreur mise à jour profil:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sauvegarder le profil dans AsyncStorage
   */
  async saveProfile() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      console.log('💾 [USER-PROFILE] Profil sauvegardé');
    } catch (error) {
      console.error('❌ [USER-PROFILE] Erreur sauvegarde:', error);
      throw error;
    }
  }

  /**
   * Obtenir le profil actuel
   */
  getProfile() {
    return { ...this.profile };
  }

  /**
   * Obtenir la longueur de pas calculée
   */
  getStepLength() {
    return this.profile.calculatedStepLength || 0.65; // Valeur par défaut
  }

  /**
   * Vérifier si le profil est complet
   */
  isProfileComplete() {
    return this.profile.height && this.profile.weight;
  }

  /**
   * Ajouter un listener pour les changements de profil
   */
  addListener(callback) {
    this.listeners.push(callback);
    
    // Retourner une fonction pour supprimer le listener
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notifier tous les listeners
   */
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.getProfile());
      } catch (error) {
        console.error('❌ [USER-PROFILE] Erreur notification listener:', error);
      }
    });
  }

  /**
   * Réinitialiser le profil
   */
  async resetProfile() {
    try {
      this.profile = {
        height: null,
        weight: null,
        calculatedStepLength: null
      };
      
      await AsyncStorage.removeItem(STORAGE_KEY);
      this.notifyListeners();
      
      console.log('🔄 [USER-PROFILE] Profil réinitialisé');
      return { success: true };
      
    } catch (error) {
      console.error('❌ [USER-PROFILE] Erreur réinitialisation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtenir des statistiques calculées
   */
  getCalculatedStats() {
    if (!this.isProfileComplete()) {
      return null;
    }

    const heightInMeters = this.profile.height / 100;
    const bmi = this.profile.weight / (heightInMeters * heightInMeters);
    
    // Estimation du nombre de pas par kilomètre
    const stepsPerKm = this.profile.calculatedStepLength > 0 
      ? Math.round(1000 / this.profile.calculatedStepLength)
      : 1538; // Valeur par défaut

    return {
      bmi: bmi,
      bmiCategory: this.getBMICategory(bmi),
      stepsPerKm: stepsPerKm,
      stepLengthCm: Math.round(this.profile.calculatedStepLength * 100)
    };
  }

  /**
   * Obtenir la catégorie IMC
   */
  getBMICategory(bmi) {
    if (bmi < 18.5) return 'Sous-poids';
    if (bmi < 25) return 'Normal';
    if (bmi < 30) return 'Surpoids';
    return 'Obésité';
  }
}

// Instance singleton
export const userProfileService = new UserProfileService(); 