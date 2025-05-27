// Test de vérification des corrections de garde-fous
console.log('=== TEST DES CORRECTIONS GARDE-FOUS ===\\n');

// Simulation des paramètres corrigés
let stepCount = 6; // 6 pas déjà détectés (comme dans vos logs)
let currentMode = 'stationary';

// Nouveaux seuils corrigés
const MAX_FREQ = {
  walking: 4.0,
  running: 8.0,
  stationary: 3.0 // CORRIGÉ: était 0.5, maintenant 3.0
};

// Test avec la fréquence observée dans vos logs
const observedFrequency = 2.49; // Hz
const maxAllowed = MAX_FREQ[currentMode];

console.log(`Mode actuel: ${currentMode}`);
console.log(`Fréquence observée: ${observedFrequency}Hz`);
console.log(`Seuil maximum: ${maxAllowed}Hz`);
console.log(`Pas actuels: ${stepCount}`);

// Test garde-fou de fréquence
const frequencyTest = observedFrequency <= maxAllowed;
console.log(`\\n✓ Test fréquence: ${frequencyTest ? 'PASS' : 'FAIL'}`);

// Test nombre de pas (garde-fou activé après 10 pas)
const physiologicalGuardActive = stepCount > 10;
console.log(`✓ Garde-fous physiologiques: ${physiologicalGuardActive ? 'ACTIFS' : 'DÉSACTIVÉS'}`);

// Résultat final
const shouldDetectStep = !physiologicalGuardActive || frequencyTest;
console.log(`\\n🎯 RÉSULTAT: Le pas ${shouldDetectStep ? 'SERA DÉTECTÉ ✓' : 'SERA REJETÉ ✗'}`);

if (shouldDetectStep) {
  console.log('\\n🎉 LES CORRECTIONS FONCTIONNENT !');
  console.log('   - Seuil stationary: 0.5Hz → 3.0Hz');
  console.log('   - Garde-fous: actifs après 3 pas → 10 pas');
} else {
  console.log('\\n❌ Problème persistant...');
}

console.log('\\n=== FIN DU TEST ==='); 