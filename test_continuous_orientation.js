/**
 * Script de test pour le service d'orientation continue
 * Simule différents scénarios d'utilisation et valide le comportement
 */

import { ContinuousOrientationService } from './src/services/ContinuousOrientationService.js';

// Configuration de test
const testConfig = {
  continuousFusion: {
    enabled: true,
    updateRate: 50,
    smoothingAlpha: 0.1,
    magneticConfidenceThreshold: 0.3
  },
  postureDetection: {
    enabled: true,
    orientationChangeThreshold: Math.PI / 4, // 45°
    accelerationChangeThreshold: 2.0,
    detectionWindow: 1000,
    stabilityRequiredAfterChange: 500
  },
  immediateCalibration: {
    enabled: true,
    duration: 2000,
    samplesRequired: 20,
    gravityThreshold: 0.5,
    gyroThreshold: 0.3,
    autoTriggerOnPostureChange: true
  }
};

// Données de test simulées
const testData = {
  // Téléphone en main (vertical)
  handPosition: {
    accelerometer: { x: 0, y: 0, z: -9.81 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 20, y: 0, z: -40 }
  },
  
  // Téléphone en poche (horizontal)
  pocketPosition: {
    accelerometer: { x: 0, y: -9.81, z: 0 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 20, y: -40, z: 0 }
  },
  
  // Mouvement de transition
  transitionMovement: {
    accelerometer: { x: 2, y: -5, z: -7 },
    gyroscope: { x: 0.5, y: 0.3, z: 0.2 },
    magnetometer: { x: 15, y: -20, z: -30 }
  },
  
  // Rotation sur place
  rotation: {
    accelerometer: { x: 0, y: 0, z: -9.81 },
    gyroscope: { x: 0, y: 0, z: 1.0 }, // 1 rad/s
    magnetometer: { x: 0, y: 20, z: -40 }
  }
};

class OrientationTester {
  constructor() {
    this.service = new ContinuousOrientationService(testConfig);
    this.testResults = [];
    this.setupCallbacks();
  }

  setupCallbacks() {
    this.service.onOrientationUpdate = (data) => {
      console.log(`[ORIENTATION] ${(data.heading * 180 / Math.PI).toFixed(1)}° (confiance: ${(data.confidence * 100).toFixed(0)}%)`);
    };

    this.service.onPostureChange = (data) => {
      console.log(`[POSTURE] Changement détecté: ${data.reason}`);
    };

    this.service.onCalibrationStart = (data) => {
      console.log(`[CALIBRATION] Démarrage: ${data.reason}`);
    };

    this.service.onCalibrationComplete = (data) => {
      console.log(`[CALIBRATION] Terminée: ${data.reason} (${data.duration}ms)`);
    };
  }

  async runTest(testName, testFunction) {
    console.log(`\n=== Test: ${testName} ===`);
    const startTime = Date.now();
    
    try {
      await testFunction();
      const duration = Date.now() - startTime;
      console.log(`✅ Test réussi (${duration}ms)`);
      this.testResults.push({ name: testName, success: true, duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Test échoué: ${error.message} (${duration}ms)`);
      this.testResults.push({ name: testName, success: false, duration, error: error.message });
    }
  }

  // Test 1: Stabilité en position main
  async testHandStability() {
    const data = testData.handPosition;
    
    // Simuler 2 secondes de données stables
    for (let i = 0; i < 100; i++) {
      this.service.update(data.accelerometer, data.gyroscope, data.magnetometer);
      await this.sleep(20); // 50Hz
    }
    
    const orientation = this.service.getCurrentOrientation();
    if (orientation.confidence < 0.5) {
      throw new Error(`Confiance trop faible: ${orientation.confidence}`);
    }
  }

  // Test 2: Détection changement main → poche
  async testPostureChangeDetection() {
    const handData = testData.handPosition;
    const pocketData = testData.pocketPosition;
    const transitionData = testData.transitionMovement;
    
    let postureChangeDetected = false;
    
    // Override callback pour ce test
    const originalCallback = this.service.onPostureChange;
    this.service.onPostureChange = (data) => {
      postureChangeDetected = true;
      originalCallback(data);
    };
    
    // Position main stable
    for (let i = 0; i < 50; i++) {
      this.service.update(handData.accelerometer, handData.gyroscope, handData.magnetometer);
      await this.sleep(20);
    }
    
    // Transition avec mouvement
    for (let i = 0; i < 25; i++) {
      this.service.update(transitionData.accelerometer, transitionData.gyroscope, transitionData.magnetometer);
      await this.sleep(20);
    }
    
    // Position poche
    for (let i = 0; i < 50; i++) {
      this.service.update(pocketData.accelerometer, pocketData.gyroscope, pocketData.magnetometer);
      await this.sleep(20);
    }
    
    // Restaurer callback
    this.service.onPostureChange = originalCallback;
    
    if (!postureChangeDetected) {
      throw new Error('Changement de posture non détecté');
    }
  }

  // Test 3: Calibration immédiate
  async testImmediateCalibration() {
    let calibrationCompleted = false;
    
    // Override callback pour ce test
    const originalCallback = this.service.onCalibrationComplete;
    this.service.onCalibrationComplete = (data) => {
      calibrationCompleted = true;
      originalCallback(data);
    };
    
    // Déclencher calibration manuelle
    const success = this.service.forceCalibration();
    if (!success) {
      throw new Error('Impossible de déclencher la calibration');
    }
    
    // Simuler données stables pendant calibration
    const stableData = testData.handPosition;
    for (let i = 0; i < 100; i++) { // 2 secondes
      this.service.update(stableData.accelerometer, stableData.gyroscope, stableData.magnetometer);
      await this.sleep(20);
    }
    
    // Restaurer callback
    this.service.onCalibrationComplete = originalCallback;
    
    if (!calibrationCompleted) {
      throw new Error('Calibration non terminée dans les temps');
    }
  }

  // Test 4: Rotation en temps réel
  async testRealTimeRotation() {
    const baseData = testData.handPosition;
    const rotationData = testData.rotation;
    
    const initialOrientation = this.service.getCurrentOrientation().heading;
    
    // Simuler rotation pendant 1 seconde
    for (let i = 0; i < 50; i++) {
      this.service.update(rotationData.accelerometer, rotationData.gyroscope, rotationData.magnetometer);
      await this.sleep(20);
    }
    
    const finalOrientation = this.service.getCurrentOrientation().heading;
    const orientationChange = Math.abs(finalOrientation - initialOrientation);
    
    // Vérifier que l'orientation a changé significativement
    if (orientationChange < Math.PI / 6) { // 30°
      throw new Error(`Changement d'orientation insuffisant: ${(orientationChange * 180 / Math.PI).toFixed(1)}°`);
    }
  }

  // Test 5: Performance et latence
  async testPerformance() {
    const data = testData.handPosition;
    const updateTimes = [];
    
    for (let i = 0; i < 100; i++) {
      const startTime = performance.now();
      this.service.update(data.accelerometer, data.gyroscope, data.magnetometer);
      const endTime = performance.now();
      
      updateTimes.push(endTime - startTime);
      await this.sleep(20);
    }
    
    const avgUpdateTime = updateTimes.reduce((sum, time) => sum + time, 0) / updateTimes.length;
    const maxUpdateTime = Math.max(...updateTimes);
    
    console.log(`Temps moyen de mise à jour: ${avgUpdateTime.toFixed(2)}ms`);
    console.log(`Temps maximum de mise à jour: ${maxUpdateTime.toFixed(2)}ms`);
    
    if (avgUpdateTime > 5) { // 5ms max en moyenne
      throw new Error(`Performance insuffisante: ${avgUpdateTime.toFixed(2)}ms en moyenne`);
    }
  }

  // Utilitaire pour attendre
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Exécution de tous les tests
  async runAllTests() {
    console.log('🧪 Démarrage des tests d\'orientation continue\n');
    
    await this.runTest('Stabilité en position main', () => this.testHandStability());
    await this.runTest('Détection changement de posture', () => this.testPostureChangeDetection());
    await this.runTest('Calibration immédiate', () => this.testImmediateCalibration());
    await this.runTest('Rotation en temps réel', () => this.testRealTimeRotation());
    await this.runTest('Performance et latence', () => this.testPerformance());
    
    this.printResults();
  }

  printResults() {
    console.log('\n📊 Résultats des tests:');
    console.log('========================');
    
    const successCount = this.testResults.filter(r => r.success).length;
    const totalCount = this.testResults.length;
    
    this.testResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const duration = `${result.duration}ms`;
      const error = result.error ? ` (${result.error})` : '';
      console.log(`${status} ${result.name} - ${duration}${error}`);
    });
    
    console.log(`\nRésultat global: ${successCount}/${totalCount} tests réussis`);
    
    if (successCount === totalCount) {
      console.log('🎉 Tous les tests sont passés avec succès !');
    } else {
      console.log('⚠️  Certains tests ont échoué, vérifiez l\'implémentation.');
    }
  }
}

// Exécution des tests si le script est lancé directement
if (typeof require !== 'undefined' && require.main === module) {
  const tester = new OrientationTester();
  tester.runAllTests().catch(console.error);
}

export { OrientationTester }; 