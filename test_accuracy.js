// Test des améliorations de précision
console.log('=== TEST DES AMÉLIORATIONS DE PRÉCISION ===\n');

// Simulation des nouveaux paramètres
const OLD_INTERVALS = {
  walking: 400,   // ms
  running: 250    // ms
};

const NEW_INTERVALS = {
  walking: 500,   // ms - augmenté
  running: 350    // ms - augmenté
};

// Test avec vos données réelles
const loggedIntervals = [561, 406, 403, 253, 402, 251, 404, 368, 409, 402, 403, 403, 402, 407, 403];

console.log('📊 ANALYSE DES INTERVALLES OBSERVÉS:');
console.log(`Intervalles dans vos logs: ${loggedIntervals.join(', ')}ms`);

const avgInterval = loggedIntervals.reduce((a, b) => a + b) / loggedIntervals.length;
const minInterval = Math.min(...loggedIntervals);
const maxInterval = Math.max(...loggedIntervals);

console.log(`Moyenne: ${avgInterval.toFixed(0)}ms`);
console.log(`Min: ${minInterval}ms, Max: ${maxInterval}ms`);

// Analyse avec anciens seuils
const oldRejects = loggedIntervals.filter(interval => interval < OLD_INTERVALS.walking).length;
const newRejects = loggedIntervals.filter(interval => interval < NEW_INTERVALS.walking).length;

console.log('\n🔍 IMPACT DES NOUVEAUX SEUILS:');
console.log(`Ancien seuil (400ms): ${oldRejects}/${loggedIntervals.length} pas rejetés`);
console.log(`Nouveau seuil (500ms): ${newRejects}/${loggedIntervals.length} pas rejetés`);

// Calcul de la cadence
const stepsPerSecond = 1000 / avgInterval;
const stepsPerMinute = stepsPerSecond * 60;

console.log('\n👟 ANALYSE DE CADENCE:');
console.log(`Cadence moyenne: ${stepsPerSecond.toFixed(2)} pas/sec = ${stepsPerMinute.toFixed(0)} pas/min`);
console.log(`Cadence normale marche: 100-120 pas/min`);
console.log(`Votre cadence: ${stepsPerMinute > 120 ? '⚠️  RAPIDE' : '✅ NORMALE'}`);

// Estimation amélioration
const estimatedReduction = Math.floor((loggedIntervals.length / 2) * (newRejects / loggedIntervals.length));
console.log('\n🎯 AMÉLIORATION ESTIMÉE:');
console.log(`Détection attendue: ${25} pas réels`);
console.log(`Détection précédente: ${50} pas (doublé)`);
console.log(`Réduction estimée: ~${estimatedReduction} faux positifs`);
console.log(`Nouvelle estimation: ~${50 - estimatedReduction} pas détectés`);

console.log('\n=== FIN DU TEST ==='); 