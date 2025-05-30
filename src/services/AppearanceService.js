import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Service de gestion de l'apparence de l'application
 * Gère les couleurs du fond de carte, des tracés, etc.
 */
class AppearanceService {
  constructor() {
    this.listeners = [];
    this.currentConfig = {
      backgroundColor: '#000000',     // Noir par défaut
      trajectoryColor: '#00ff00',     // Vert par défaut
      gridColor: '#333333',           // Gris foncé par défaut
      userColor: '#00ff00',           // Vert pour l'utilisateur
      orientationColor: '#ff0088',    // Rose pour l'orientation
      pointsOfInterestColor: '#ff6b35' // Orange pour les POI
    };
    this.isInitialized = false;
    this.storageKey = '@appearance_config';
  }

  /**
   * Initialiser le service
   */
  async initialize() {
    try {
      console.log('🎨 [APPEARANCE] Initialisation du service d\'apparence...');
      
      // Charger la configuration sauvegardée
      const savedConfig = await AsyncStorage.getItem(this.storageKey);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        this.currentConfig = { ...this.currentConfig, ...parsedConfig };
        console.log('🎨 [APPEARANCE] Configuration chargée:', this.currentConfig);
      }
      
      this.isInitialized = true;
      this._notifyListeners();
      
      console.log('✅ [APPEARANCE] Service d\'apparence initialisé');
    } catch (error) {
      console.error('❌ [APPEARANCE] Erreur initialisation:', error);
      throw error;
    }
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfiguration() {
    return { ...this.currentConfig };
  }

  /**
   * Mettre à jour une couleur spécifique
   */
  async setColor(colorKey, colorValue) {
    try {
      if (!this.isInitialized) {
        throw new Error('Service not initialized');
      }

      // Valider la clé de couleur
      if (!this.currentConfig.hasOwnProperty(colorKey)) {
        throw new Error(`Invalid color key: ${colorKey}`);
      }

      // Valider le format de couleur (hexadécimal)
      if (!/^#[0-9A-F]{6}$/i.test(colorValue)) {
        throw new Error(`Invalid color format: ${colorValue}. Use #RRGGBB format.`);
      }

      // Mettre à jour la configuration
      this.currentConfig[colorKey] = colorValue;
      
      // Sauvegarder
      await this._saveConfiguration();
      
      // Notifier les listeners
      this._notifyListeners();
      
      console.log(`🎨 [APPEARANCE] Couleur mise à jour: ${colorKey} = ${colorValue}`);
    } catch (error) {
      console.error('❌ [APPEARANCE] Erreur mise à jour couleur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour plusieurs couleurs d'un coup
   */
  async setColors(colorUpdates) {
    try {
      if (!this.isInitialized) {
        throw new Error('Service not initialized');
      }

      // Valider et appliquer toutes les mises à jour
      for (const [key, value] of Object.entries(colorUpdates)) {
        if (!this.currentConfig.hasOwnProperty(key)) {
          throw new Error(`Invalid color key: ${key}`);
        }
        if (!/^#[0-9A-F]{6}$/i.test(value)) {
          throw new Error(`Invalid color format for ${key}: ${value}`);
        }
        this.currentConfig[key] = value;
      }
      
      // Sauvegarder
      await this._saveConfiguration();
      
      // Notifier les listeners
      this._notifyListeners();
      
      console.log(`🎨 [APPEARANCE] Couleurs mises à jour:`, colorUpdates);
    } catch (error) {
      console.error('❌ [APPEARANCE] Erreur mise à jour couleurs:', error);
      throw error;
    }
  }

  /**
   * Réinitialiser aux couleurs par défaut
   */
  async resetToDefaults() {
    try {
      this.currentConfig = {
        backgroundColor: '#000000',
        trajectoryColor: '#00ff00',
        gridColor: '#333333',
        userColor: '#00ff00',
        orientationColor: '#ff0088',
        pointsOfInterestColor: '#ff6b35'
      };
      
      await this._saveConfiguration();
      this._notifyListeners();
      
      console.log('🎨 [APPEARANCE] Configuration réinitialisée aux valeurs par défaut');
    } catch (error) {
      console.error('❌ [APPEARANCE] Erreur réinitialisation:', error);
      throw error;
    }
  }

  /**
   * Ajouter un listener pour les changements de configuration
   */
  addListener(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }
    
    this.listeners.push(listener);
    
    // Appeler immédiatement le listener avec la configuration actuelle
    if (this.isInitialized) {
      listener(this.currentConfig);
    }
    
    // Retourner une fonction pour supprimer le listener
    return () => {
      this.removeListener(listener);
    };
  }

  /**
   * Supprimer un listener
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Obtenir les couleurs prédéfinies disponibles
   */
  getPresetColors() {
    return {
      backgrounds: [
        { name: 'Noir', value: '#000000' },
        { name: 'Gris foncé', value: '#1a1a1a' },
        { name: 'Bleu nuit', value: '#0a0a2a' },
        { name: 'Vert foncé', value: '#0a2a0a' },
        { name: 'Marron', value: '#2a1a0a' }
      ],
      trajectories: [
        { name: 'Vert', value: '#00ff00' },
        { name: 'Cyan', value: '#00ffff' },
        { name: 'Jaune', value: '#ffff00' },
        { name: 'Orange', value: '#ff8800' },
        { name: 'Rouge', value: '#ff0000' },
        { name: 'Rose', value: '#ff00ff' },
        { name: 'Bleu', value: '#0088ff' },
        { name: 'Blanc', value: '#ffffff' }
      ]
    };
  }

  /**
   * Sauvegarder la configuration
   */
  async _saveConfiguration() {
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(this.currentConfig));
    } catch (error) {
      console.error('❌ [APPEARANCE] Erreur sauvegarde configuration:', error);
      throw error;
    }
  }

  /**
   * Notifier tous les listeners des changements
   */
  _notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentConfig);
      } catch (error) {
        console.error('❌ [APPEARANCE] Erreur notification listener:', error);
      }
    });
  }
}

// Instance singleton
export const appearanceService = new AppearanceService();
export default appearanceService; 