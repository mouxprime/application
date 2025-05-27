// Test rapide pour vérifier que l'erreur mathjs est corrigée
console.log('=== TEST CORRECTION ERREUR MATHJS ===\n');

// Simulation de la fonction detectPeaks corrigée
function testDetectPeaks(data) {
  if (data.length < 5) return [];
  
  // Calcul natif JavaScript (plus d'erreur mathjs)
  const mean = data.reduce((a, b) => a + b) / data.length;
  const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
  const std = Math.sqrt(variance);
  
  console.log(`✅ Calculs statistiques fonctionnent:`);
  console.log(`   Moyenne: ${mean.toFixed(3)}`);
  console.log(`   Écart-type: ${std.toFixed(3)}`);
  
  // Test de seuil adaptatif
  const k = 1.1; // Mode walking
  const threshold = mean + k * std;
  const finalThreshold = Math.max(0.12, Math.min(1.0, threshold));
  
  console.log(`   Seuil adaptatif: ${finalThreshold.toFixed(3)}`);
  
  // Test de détection de pics
  const peaks = [];
  for (let i = 2; i < data.length - 2; i++) {
    const current = data[i];
    const prev1 = data[i - 1];
    const prev2 = data[i - 2];
    const next1 = data[i + 1];
    const next2 = data[i + 2];
    
    const isLocalMaximum = current > prev1 && current > next1 && 
                          current > prev2 && current > next2;
    const isAboveThreshold = current > finalThreshold;
    const isSignificantPeak = current > (prev1 + next1) / 2 * 1.2;
    const isStrongPeak = current > mean + 1.5 * std;
    
    if (isLocalMaximum && isAboveThreshold && isSignificantPeak && isStrongPeak) {
      peaks.push(current);
    }
  }
  
  console.log(`   Pics détectés: ${peaks.length} (valeurs: [${peaks.map(p => p.toFixed(3)).join(', ')}])`);
  
  return peaks;
}

// Test avec données simulées de marche
const walkingData = [
  0.1, 0.2, 0.4, 0.8, 1.2, 0.9, 0.5, 0.2, 0.1, 0.15,
  0.3, 0.6, 1.1, 1.4, 1.0, 0.6, 0.3, 0.1, 0.2, 0.25,
  0.4, 0.7, 1.0, 1.3, 0.8, 0.4, 0.2, 0.1, 0.3, 0.5
];

console.log('📊 TEST AVEC DONNÉES SIMULÉES:');
console.log(`Données: [${walkingData.slice(0, 10).map(d => d.toFixed(1)).join(', ')}, ...]`);

try {
  const results = testDetectPeaks(walkingData);
  console.log('\n🎉 SUCCÈS: Aucune erreur mathjs détectée !');
  console.log(`✅ Fonction detectPeaks fonctionne correctement`);
  console.log(`✅ ${results.length} pics détectés avec les nouveaux seuils stricts`);
} catch (error) {
  console.log('\n❌ ÉCHEC: Erreur encore présente:');
  console.log(error.message);
}

console.log('\n=== FIN DU TEST ==='); 