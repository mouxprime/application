// Test du flux de données capteurs
import { LocalizationSDK } from './src/algorithms/LocalizationSDK.js';

console.log('🧪 Test du flux de données capteurs');

// Simulation du contexte d'actions
const mockActions = {
  updateSensors: (sensorData) => {
    console.log('✅ Données capteurs reçues dans le contexte:', {
      acc: sensorData.accelerometer,
      gyro: sensorData.gyroscope,
      mag: sensorData.magnetometer
    });
  },
  updatePose: (pose) => {
    console.log('📍 Position mise à jour:', pose);
  },
  updatePDRMetrics: (metrics) => {
    console.log('📊 Métriques PDR:', metrics);
  },
  addTrajectoryPoint: (point) => {
    console.log('🛤️ Point trajectoire ajouté:', point);
  }
};

// Initialisation du SDK
const sdk = new LocalizationSDK({
  adaptiveSampling: true,
  energyOptimization: false,
  positionUpdateRate: 1.0
});

// Configuration des callbacks avec onDataUpdate
sdk.setCallbacks({
  onPositionUpdate: (x, y, theta, mode) => {
    console.log(`📱 Position: (${x.toFixed(2)}, ${y.toFixed(2)}) θ=${theta.toFixed(2)} mode=${mode}`);
  },
  onModeChanged: (mode, features) => {
    console.log(`🔄 Mode changé: ${mode}`, features);
  },
  onDataUpdate: (sensorData) => {
    // Simulation du callback ajouté dans MapScreen
    mockActions.updateSensors({
      accelerometer: sensorData.accelerometer || { x: 0, y: 0, z: 0 },
      gyroscope: sensorData.gyroscope || { x: 0, y: 0, z: 0 },
      magnetometer: sensorData.magnetometer || { x: 0, y: 0, z: 0 }
    });
  }
});

async function testSensorFlow() {
  try {
    console.log('🚀 Initialisation du SDK...');
    await sdk.initialize();
    
    console.log('📱 Démarrage du tracking...');
    await sdk.startTracking();
    
    console.log('⏰ Test en cours pendant 10 secondes...');
    
    setTimeout(() => {
      console.log('🛑 Arrêt du test');
      sdk.stopTracking();
      console.log('✅ Test terminé - Le flux de données devrait maintenant fonctionner dans SensorsScreen !');
    }, 10000);
    
  } catch (error) {
    console.error('❌ Erreur pendant le test:', error);
  }
}

// Exécution du test si ce fichier est exécuté directement
if (typeof require !== 'undefined' && require.main === module) {
  testSensorFlow();
}

export { testSensorFlow }; 