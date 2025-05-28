import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';

/**
 * Service de diagnostic pour analyser les problèmes de modules natifs
 * et surveiller la consommation de batterie
 */
export class DiagnosticService {
  constructor() {
    this.batteryHistory = [];
    this.startTime = Date.now();
    this.initialBatteryLevel = null;
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  /**
   * Diagnostic complet du podomètre natif
   */
  async diagnosePedometerIssues() {
    const diagnosis = {
      platform: Platform.OS,
      platformVersion: Platform.Version,
      deviceType: null,
      isPhysicalDevice: null,
      nativeModuleStatus: 'unknown',
      permissions: 'unknown',
      recommendations: []
    };

    try {
      // Informations sur l'appareil
      diagnosis.deviceType = Device.deviceType;
      diagnosis.isPhysicalDevice = Device.isDevice;
      
      console.log('🔍 [DIAGNOSTIC] Informations appareil:');
      console.log(`  - Plateforme: ${diagnosis.platform} ${diagnosis.platformVersion}`);
      console.log(`  - Type: ${diagnosis.deviceType}`);
      console.log(`  - Appareil physique: ${diagnosis.isPhysicalDevice}`);

      // Test du module natif
      try {
        const ExpoNativePedometer = require('../../modules/expo-native-pedometer');
        console.log('✅ [DIAGNOSTIC] Module natif trouvé');
        
        // Vérifier si le module a une méthode isAvailable
        if (ExpoNativePedometer && typeof ExpoNativePedometer.isAvailable === 'function') {
          console.log('✅ [DIAGNOSTIC] Méthode isAvailable disponible');
          
          try {
            const isAvailable = await ExpoNativePedometer.isAvailable();
            diagnosis.nativeModuleStatus = isAvailable ? 'available' : 'unavailable';
            console.log(`📊 [DIAGNOSTIC] Disponibilité: ${isAvailable}`);
            
            if (!isAvailable) {
              diagnosis.recommendations.push('Le podomètre natif n\'est pas disponible sur cet appareil');
              
              if (!diagnosis.isPhysicalDevice) {
                diagnosis.recommendations.push('⚠️ Vous utilisez un simulateur - le podomètre natif nécessite un appareil physique');
              }
              
              if (diagnosis.platform !== 'ios') {
                diagnosis.recommendations.push('⚠️ Le podomètre natif est optimisé pour iOS');
              }
            }
          } catch (availabilityError) {
            diagnosis.nativeModuleStatus = 'error';
            diagnosis.recommendations.push(`Erreur lors du test de disponibilité: ${availabilityError.message}`);
            console.error('❌ [DIAGNOSTIC] Erreur test disponibilité:', availabilityError);
          }
        } else {
          diagnosis.nativeModuleStatus = 'incomplete';
          diagnosis.recommendations.push('Le module natif est incomplet - méthode isAvailable manquante');
          console.warn('⚠️ [DIAGNOSTIC] Méthode isAvailable manquante ou module mal configuré');
          console.log('🔍 [DIAGNOSTIC] Type du module:', typeof ExpoNativePedometer);
          console.log('🔍 [DIAGNOSTIC] Propriétés du module:', Object.keys(ExpoNativePedometer || {}));
        }
      } catch (moduleError) {
        diagnosis.nativeModuleStatus = 'missing';
        diagnosis.recommendations.push(`Module natif non trouvé: ${moduleError.message}`);
        console.error('❌ [DIAGNOSTIC] Module natif non trouvé:', moduleError);
      }

      // Recommandations générales
      if (diagnosis.nativeModuleStatus !== 'available') {
        diagnosis.recommendations.push('💡 Solution: Utilisez le podomètre de l\'application (mode par défaut)');
        
        if (!diagnosis.isPhysicalDevice) {
          diagnosis.recommendations.push('📱 Pour tester le podomètre natif, utilisez un iPhone/iPad physique');
        }
        
        if (diagnosis.platform === 'ios' && diagnosis.isPhysicalDevice) {
          diagnosis.recommendations.push('🔧 Vérifiez que l\'app a été compilée avec le module natif (npx expo run:ios)');
          diagnosis.recommendations.push('⚙️ Vérifiez les permissions de mouvement dans Réglages > Confidentialité');
        }
      }

    } catch (error) {
      console.error('❌ [DIAGNOSTIC] Erreur diagnostic:', error);
      diagnosis.recommendations.push(`Erreur diagnostic: ${error.message}`);
    }

    return diagnosis;
  }

  /**
   * Démarrer la surveillance de la batterie
   */
  async startBatteryMonitoring() {
    if (this.isMonitoring) {
      console.log('🔋 [BATTERY] Surveillance déjà active');
      return;
    }

    try {
      console.log('🔋 [BATTERY] Démarrage de la surveillance...');
      
      // Niveau initial
      this.initialBatteryLevel = await Battery.getBatteryLevelAsync();
      this.startTime = Date.now();
      this.isMonitoring = true;

      console.log(`🔋 [BATTERY] Surveillance démarrée - Niveau initial: ${(this.initialBatteryLevel * 100).toFixed(1)}%`);

      // Surveillance périodique
      this.monitoringInterval = setInterval(async () => {
        await this.recordBatteryLevel();
      }, 30000); // Toutes les 30 secondes

      // Premier enregistrement
      await this.recordBatteryLevel();

    } catch (error) {
      console.error('❌ [BATTERY] Erreur démarrage surveillance:', error);
    }
  }

  /**
   * Arrêter la surveillance de la batterie
   */
  stopBatteryMonitoring() {
    if (!this.isMonitoring) return;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    console.log('🔋 [BATTERY] Surveillance arrêtée');
  }

  /**
   * Enregistrer le niveau de batterie actuel
   */
  async recordBatteryLevel() {
    try {
      const currentLevel = await Battery.getBatteryLevelAsync();
      const currentState = await Battery.getBatteryStateAsync();
      const timestamp = Date.now();

      const record = {
        level: currentLevel,
        state: currentState,
        timestamp,
        sessionDuration: timestamp - this.startTime
      };

      this.batteryHistory.push(record);

      // Garder seulement les 100 derniers enregistrements
      if (this.batteryHistory.length > 100) {
        this.batteryHistory.shift();
      }

      console.log(`🔋 [BATTERY] Niveau: ${(currentLevel * 100).toFixed(1)}% (${currentState})`);

    } catch (error) {
      console.error('❌ [BATTERY] Erreur enregistrement:', error);
    }
  }

  /**
   * Calculer la consommation de batterie
   */
  getBatteryConsumption() {
    if (!this.initialBatteryLevel || this.batteryHistory.length === 0) {
      return {
        consumption: 0,
        rate: 0,
        duration: 0,
        status: 'no_data'
      };
    }

    const latestRecord = this.batteryHistory[this.batteryHistory.length - 1];
    const consumption = this.initialBatteryLevel - latestRecord.level;
    const durationHours = latestRecord.sessionDuration / (1000 * 60 * 60);
    const rate = durationHours > 0 ? consumption / durationHours : 0;

    return {
      consumption: consumption * 100, // En pourcentage
      rate: rate * 100, // Pourcentage par heure
      duration: latestRecord.sessionDuration,
      status: consumption > 0 ? 'consuming' : 'stable',
      initialLevel: this.initialBatteryLevel * 100,
      currentLevel: latestRecord.level * 100,
      batteryState: latestRecord.state
    };
  }

  /**
   * Obtenir les statistiques détaillées
   */
  getDetailedStats() {
    console.log('📊 [BATTERY] Génération des stats détaillées...');
    
    const consumption = this.getBatteryConsumption();
    
    const stats = {
      device: {
        platform: Platform.OS,
        version: Platform.Version,
        isPhysical: Device.isDevice,
        deviceType: Device.deviceType
      },
      battery: consumption,
      monitoring: {
        isActive: this.isMonitoring,
        recordCount: this.batteryHistory.length,
        startTime: this.startTime
      }
    };
    
    console.log('📊 [BATTERY] Stats générées:', stats);
    
    return stats;
  }

  /**
   * Générer un rapport de diagnostic complet
   */
  async generateReport() {
    const pedometerDiagnosis = await this.diagnosePedometerIssues();
    const batteryStats = this.getDetailedStats();

    return {
      timestamp: Date.now(),
      pedometer: pedometerDiagnosis,
      battery: batteryStats,
      summary: {
        pedometerAvailable: pedometerDiagnosis.nativeModuleStatus === 'available',
        batteryHealthy: batteryStats.battery.rate < 20, // Moins de 20%/h
        recommendedMode: pedometerDiagnosis.nativeModuleStatus === 'available' ? 'native' : 'application'
      }
    };
  }
}

// Instance singleton
export const diagnosticService = new DiagnosticService(); 