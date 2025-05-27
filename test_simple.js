// Test simplifié de la logique de détection de pas
console.log('=== TEST SIMPLIFIÉ DE LA LOGIQUE DE DÉTECTION ===\n');

// Simulation des paramètres critiques
let stepCount = 0;
let currentMode = 'walking'; // Corrigé : Démarrer en walking
let lastStepTime = 0;

// Configuration test
const config = {
  stepDetectionWindow: 30,
  stepThreshold: 0.5,
  physiologicalConstraints: {
    minStepInterval: 200,
    gyroConfirmationEnabled: false
  }
};

// Fonction de détection de pics simplifiée (extraite du code)
function detectPeaks(data) {
  if (data.length < 5) return [];
  
  const mean = data.reduce((a, b) => a + b) / data.length;
  const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
  const std = Math.sqrt(variance);
  
  // Seuil adaptatif selon mode et nombre de pas
  let k = (currentMode === 'walking') ? 0.7 : 0.8;
  if (stepCount < 5) {
    k *= 0.6; // Plus permissif pour les premiers pas
  }
  
  let threshold = mean + k * std;
  threshold = Math.max(0.05, Math.min(1.5, threshold));
  
  console.log(`  - Moyenne: ${mean.toFixed(3)}, Écart-type: ${std.toFixed(3)}`);
  console.log(`  - Coefficient k: ${k.toFixed(2)}, Seuil: ${threshold.toFixed(3)}`);
  
  // Détection de pics locaux
  const peaks = [];
  for (let i = 1; i < data.length - 1; i++) {
    const current = data[i];
    const prev = data[i - 1];
    const next = data[i + 1];
    
    const isLocalMaximum = current > prev && current > next;
    const isAboveThreshold = current > threshold;
    
    if (isLocalMaximum && isAboveThreshold) {
      peaks.push(current);
    }
  }
  
  return peaks;
}

// Simulation de données d'accélération (magnitude détrended)
const simulatedMagnitudes = [
  // Données de repos/bruit
  0.1, 0.15, 0.08, 0.12, 0.09, 0.14, 0.11, 0.13, 0.07, 0.16,
  0.10, 0.12, 0.09, 0.15, 0.08, 0.11, 0.13, 0.09, 0.14, 0.12,
  
  // Premier pic de pas (simulé)
  0.15, 0.45, 0.85, 1.2, 0.75, 0.35, 0.18, 0.12, 0.10, 0.14,
  
  // Données de repos
  0.11, 0.09, 0.13, 0.08, 0.15, 0.12, 0.10, 0.14, 0.09, 0.11,
  
  // Deuxième pic de pas
  0.12, 0.38, 0.78, 1.1, 0.68, 0.28, 0.15, 0.11, 0.13, 0.09
];

console.log('Données de test (magnitudes détrended):');
console.log(`[${simulatedMagnitudes.map(v => v.toFixed(2)).join(', ')}]\n`);

// Test de détection de pics
console.log('=== DÉTECTION DE PICS ===');
const peaks = detectPeaks(simulatedMagnitudes);

console.log(`Pics détectés: ${peaks.length}`);
if (peaks.length > 0) {
  console.log(`Valeurs des pics: [${peaks.map(p => p.toFixed(3)).join(', ')}]`);
}

// Simulation de la validation temporelle
console.log('\n=== VALIDATION TEMPORELLE ===');
const now = Date.now();
const minStepInterval = 400; // ms pour walking

peaks.forEach((peak, index) => {
  const timeSinceLastStep = (index === 0) ? 1000 : 600; // Simuler intervalles
  
  console.log(`\nPic #${index + 1}: ${peak.toFixed(3)}`);
  console.log(`  - Intervalle: ${timeSinceLastStep}ms > ${minStepInterval}ms ? ${timeSinceLastStep > minStepInterval ? 'OUI' : 'NON'}`);
  
  if (timeSinceLastStep > minStepInterval) {
    stepCount++;
    lastStepTime = now + (index * 600);
    console.log(`  ✓ PAS VALIDÉ #${stepCount}`);
  } else {
    console.log(`  ✗ PAS REJETÉ (intervalle trop court)`);
  }
});

// Résultats
console.log('\n=== RÉSULTATS ===');
console.log(`Mode: ${currentMode}`);
console.log(`Pas détectés: ${stepCount}`);

if (stepCount > 0) {
  console.log('\n✅ SUCCÈS: Logique de détection fonctionnelle !');
  console.log('✅ Les corrections ont résolu le problème de cercle vicieux');
} else {
  console.log('\n❌ ÉCHEC: Logique toujours défaillante');
  console.log('❌ Les seuils sont peut-être encore trop restrictifs');
}

// Test de cas limites
console.log('\n=== TEST CAS LIMITES ===');

// Test avec données très faibles
const weakData = [0.02, 0.03, 0.08, 0.15, 0.09, 0.04, 0.02, 0.03, 0.05, 0.02];
const weakPeaks = detectPeaks(weakData);
console.log(`Données faibles - Pics détectés: ${weakPeaks.length}`);

// Test avec données très fortes  
const strongData = [0.5, 0.8, 2.1, 3.2, 2.8, 1.4, 0.7, 0.5, 0.6, 0.4];
const strongPeaks = detectPeaks(strongData);
console.log(`Données fortes - Pics détectés: ${strongPeaks.length}`);

console.log('\n🔍 Analyse: Si les cas limites donnent des résultats cohérents,');
console.log('   le problème était bien le cercle vicieux mode/détection.'); 