const { PedestrianDeadReckoning } = require('./src/algorithms/PedestrianDeadReckoning.js');

// Test de la détection de pas après corrections
console.log('=== TEST DE DÉTECTION DE PAS APRÈS CORRECTIONS ===\n');

// Initialisation du PDR
const pdr = new PedestrianDeadReckoning({
  stepThreshold: 1.0,
  stepDetectionWindow: 30,
  physiologicalConstraints: {
    gyroConfirmationEnabled: false // Désactiver pour le test
  }
});

pdr.initialize(1.75); // Utilisateur de 1.75m

// Configurer les callbacks
let stepCount = 0;
pdr.setCallbacks({
  onStepDetected: (count, stepLength) => {
    stepCount = count;
    console.log(`✓ PAS DÉTECTÉ #${count} - Longueur: ${stepLength.toFixed(3)}m`);
  },
  onModeChanged: (mode, features) => {
    console.log(`🔄 CHANGEMENT MODE: ${mode} (variance: ${features.accelerationVariance.toFixed(3)})`);
  }
});

// Simulation de données d'accéléromètre représentatives de pas en poche
function simulateWalkingData() {
  const data = [];
  
  // Similer 5 pas avec des pics d'accélération réalistes
  for (let step = 0; step < 5; step++) {
    // Phase repos (20 échantillons = 0.8s à 25Hz)
    for (let i = 0; i < 20; i++) {
      data.push({
        accelerometer: {
          x: 0.5 + Math.random() * 0.3 - 0.15, // Bruit de base
          y: -9.5 + Math.random() * 0.5 - 0.25, // Gravité + bruit
          z: 1.2 + Math.random() * 0.4 - 0.2
        },
        gyroscope: {
          x: Math.random() * 0.1 - 0.05,
          y: Math.random() * 0.1 - 0.05,
          z: Math.random() * 0.1 - 0.05
        }
      });
    }
    
    // Phase de pas - pic d'accélération (5 échantillons = 0.2s)
    const peakIntensity = 2.0 + Math.random() * 1.5; // 2.0-3.5 m/s² de pic
    for (let i = 0; i < 5; i++) {
      const factor = Math.sin((i / 4) * Math.PI); // Pic en cloche
      data.push({
        accelerometer: {
          x: 0.5 + factor * peakIntensity * 0.6,
          y: -9.5 + factor * peakIntensity * 0.8,
          z: 1.2 + factor * peakIntensity * 1.2
        },
        gyroscope: {
          x: Math.random() * 0.2 - 0.1,
          y: Math.random() * 0.2 - 0.1,
          z: Math.random() * 0.3 - 0.15
        }
      });
    }
  }
  
  return data;
}

// Exécution du test
const testData = simulateWalkingData();
console.log(`Simulation de ${testData.length} échantillons (${(testData.length/25).toFixed(1)}s à 25Hz):\n`);

// Traitement séquentiel des données
for (let i = 0; i < testData.length; i++) {
  pdr.processSensorData(testData[i]);
  
  // Petite pause pour simuler le temps réel
  if (i % 25 === 0) {
    console.log(`--- Seconde ${i/25 + 1} ---`);
  }
}

// Résultats finaux
console.log('\n=== RÉSULTATS FINAUX ===');
console.log(`Pas détectés: ${stepCount}`);
console.log(`Mode final: ${pdr.currentMode}`);

const state = pdr.getState();
console.log(`Position: (${state.position.x.toFixed(2)}, ${state.position.y.toFixed(2)})`);
console.log(`Distance totale: ${state.totalDistance.toFixed(2)}m`);

if (stepCount > 0) {
  console.log('\n✅ SUCCÈS: La détection de pas fonctionne !');
} else {
  console.log('\n❌ ÉCHEC: Aucun pas détecté - Problème persiste');
} 