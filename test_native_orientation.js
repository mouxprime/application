/**
 * Script de test pour le service d'orientation native simplifié
 * Test de la boussole expo-location avec lissage et détection de dérive
 */

import { ContinuousOrientationService } from './src/services/ContinuousOrientationService.js';

// Configuration de test
const testConfig = {
  smoothingAlpha: 0.1,
  accuracyDriftThreshold: 20, // 20 degrés de seuil de dérive
  
  driftDetection: {
    enabled: true,
    windowSize: 10,
    notificationInterval: 30000 // 30s entre notifications
  }
};

/**
 * Classe de test pour l'orientation native simplifiée
 */
class NativeOrientationTester {
  constructor() {
    this.service = new ContinuousOrientationService(testConfig);
    this.testResults = [];
    this.startTime = Date.now();
    
    // Configuration des callbacks
    this.service.onOrientationUpdate = (data) => {
      console.log(`[ORIENTATION] ${(data.heading * 180 / Math.PI).toFixed(1)}° (accuracy: ${data.accuracy.toFixed(1)}°, confiance: ${(data.confidence * 100).toFixed(0)}%)`);
    };
    
    this.service.onDriftDetected = (data) => {
      console.log(`[DÉRIVE] Detected: accuracy moyenne ${data.averageAccuracy.toFixed(1)}° > seuil ${data.threshold}°`);
      console.log(`[DÉRIVE] Message: ${data.message}`);
    };
  }

  /**
   * Test 1: Démarrage de la boussole native
   */
  async testNativeCompassStart() {
    console.log('\n🧪 Test 1: Démarrage boussole native');
    
    try {
      const success = await this.service.startNativeCompass();
      
      if (success) {
        console.log('✅ Boussole native démarrée avec succès');
        
        // Attendre quelques secondes pour recevoir des données
        await this.wait(3000);
        
        const orientation = this.service.getCurrentOrientation();
        if (orientation.heading !== undefined) {
          console.log(`✅ Données reçues: ${(orientation.heading * 180 / Math.PI).toFixed(1)}°`);
          this.testResults.push({ test: 'compass_start', success: true });
        } else {
          throw new Error('Aucune donnée d\'orientation reçue');
        }
        
      } else {
        throw new Error('Échec démarrage boussole native');
      }
      
    } catch (error) {
      console.log(`❌ Échec: ${error.message}`);
      this.testResults.push({ test: 'compass_start', success: false, error: error.message });
    }
  }

  /**
   * Test 2: Qualité des données de cap
   */
  async testHeadingQuality() {
    console.log('\n🧪 Test 2: Qualité des données de cap');
    
    try {
      const samples = [];
      const testDuration = 5000; // 5 secondes
      const sampleInterval = 200; // 200ms
      
      console.log('Collecte de données pendant 5 secondes...');
      
      const collectSample = () => {
        const orientation = this.service.getCurrentOrientation();
        if (orientation.heading !== undefined) {
          samples.push({
            heading: orientation.heading,
            accuracy: orientation.accuracy,
            confidence: orientation.confidence,
            timestamp: Date.now()
          });
        }
      };
      
      const interval = setInterval(collectSample, sampleInterval);
      await this.wait(testDuration);
      clearInterval(interval);
      
      if (samples.length === 0) {
        throw new Error('Aucun échantillon collecté');
      }
      
      // Analyse de la qualité
      const avgAccuracy = samples.reduce((sum, s) => sum + s.accuracy, 0) / samples.length;
      const avgConfidence = samples.reduce((sum, s) => sum + s.confidence, 0) / samples.length;
      
      console.log(`✅ ${samples.length} échantillons collectés`);
      console.log(`✅ Accuracy moyenne: ${avgAccuracy.toFixed(1)}°`);
      console.log(`✅ Confiance moyenne: ${(avgConfidence * 100).toFixed(0)}%`);
      
      // Critères de succès
      const success = avgAccuracy < 30 && avgConfidence > 0.2; // Critères assouplis
      
      if (success) {
        console.log('✅ Qualité des données acceptable');
        this.testResults.push({ test: 'heading_quality', success: true, avgAccuracy, avgConfidence });
      } else {
        throw new Error(`Qualité insuffisante: accuracy=${avgAccuracy.toFixed(1)}°, confiance=${(avgConfidence * 100).toFixed(0)}%`);
      }
      
    } catch (error) {
      console.log(`❌ Échec: ${error.message}`);
      this.testResults.push({ test: 'heading_quality', success: false, error: error.message });
    }
  }

  /**
   * Test 3: Lissage d'orientation
   */
  async testOrientationSmoothing() {
    console.log('\n🧪 Test 3: Lissage d\'orientation');
    
    try {
      const samples = [];
      const testDuration = 3000; // 3 secondes
      
      console.log('Test du lissage pendant 3 secondes...');
      
      const collectSample = () => {
        const orientation = this.service.getCurrentOrientation();
        if (orientation.heading !== undefined) {
          samples.push({
            raw: orientation.rawHeading,
            smoothed: orientation.heading,
            timestamp: Date.now()
          });
        }
      };
      
      const interval = setInterval(collectSample, 100); // 100ms
      await this.wait(testDuration);
      clearInterval(interval);
      
      if (samples.length < 10) {
        throw new Error('Pas assez d\'échantillons pour tester le lissage');
      }
      
      // Calculer la variance brute vs lissée
      const rawVariance = this.calculateVariance(samples.map(s => s.raw));
      const smoothedVariance = this.calculateVariance(samples.map(s => s.smoothed));
      
      console.log(`✅ Variance brute: ${rawVariance.toFixed(4)}`);
      console.log(`✅ Variance lissée: ${smoothedVariance.toFixed(4)}`);
      console.log(`✅ Réduction de variance: ${((1 - smoothedVariance / rawVariance) * 100).toFixed(1)}%`);
      
      // Le lissage doit réduire la variance ou être équivalent
      if (smoothedVariance <= rawVariance * 1.1) { // Tolérance 10%
        console.log('✅ Lissage efficace ou stable');
        this.testResults.push({ test: 'smoothing', success: true, rawVariance, smoothedVariance });
      } else {
        throw new Error('Le lissage dégrade la stabilité');
      }
      
    } catch (error) {
      console.log(`❌ Échec: ${error.message}`);
      this.testResults.push({ test: 'smoothing', success: false, error: error.message });
    }
  }

  /**
   * Test 4: Détection de dérive
   */
  async testDriftDetection() {
    console.log('\n🧪 Test 4: Détection de dérive');
    
    try {
      const initialStatus = this.service.getDetailedStatus();
      console.log(`Seuil de dérive: ${initialStatus.drift.threshold}°`);
      console.log(`Fenêtre d'échantillons: ${testConfig.driftDetection.windowSize}`);
      
      // Réinitialiser l'historique pour test propre
      this.service.resetDriftHistory();
      
      // Attendre accumulation de données
      await this.wait(2000);
      
      const finalStatus = this.service.getDetailedStatus();
      const hasHistory = finalStatus.drift.accuracyHistory.length > 0;
      
      console.log(`✅ Échantillons collectés: ${finalStatus.drift.accuracyHistory.length}`);
      
      if (hasHistory) {
        console.log('✅ Détection de dérive opérationnelle');
        this.testResults.push({ test: 'drift_detection', success: true });
      } else {
        throw new Error('Aucun historique de dérive collecté');
      }
      
    } catch (error) {
      console.log(`❌ Échec: ${error.message}`);
      this.testResults.push({ test: 'drift_detection', success: false, error: error.message });
    }
  }

  /**
   * Utilitaires
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => {
      const diff = v - mean;
      return diff * diff;
    });
    
    return squaredDiffs.reduce((sum, sq) => sum + sq, 0) / values.length;
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Génération du rapport final
   */
  generateReport() {
    console.log('\n📊 RAPPORT DE TEST - ORIENTATION NATIVE SIMPLIFIÉE');
    console.log('='.repeat(50));
    
    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - successfulTests;
    
    console.log(`Total des tests: ${totalTests}`);
    console.log(`Succès: ${successfulTests}`);
    console.log(`Échecs: ${failedTests}`);
    console.log(`Taux de réussite: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);
    
    console.log('\nDétail des résultats:');
    this.testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.test}`);
      if (result.error) {
        console.log(`   Erreur: ${result.error}`);
      }
    });
    
    const testDuration = Date.now() - this.startTime;
    console.log(`\nDurée totale: ${(testDuration / 1000).toFixed(1)}s`);
    
    // Arrêter le service
    this.service.stop();
    console.log('\nService d\'orientation native arrêté');
  }
}

/**
 * Exécution des tests
 */
async function runNativeOrientationTests() {
  console.log('🧪 Démarrage des tests d\'orientation native simplifiée\n');
  
  const tester = new NativeOrientationTester();
  
  try {
    await tester.testNativeCompassStart();
    await tester.testHeadingQuality();
    await tester.testOrientationSmoothing();
    await tester.testDriftDetection();
    
  } catch (error) {
    console.error('Erreur critique durant les tests:', error);
  } finally {
    tester.generateReport();
  }
}

// Exécution automatique si fichier exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  runNativeOrientationTests().catch(console.error);
}

export { NativeOrientationTester }; 