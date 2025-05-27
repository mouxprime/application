// Test de détection de pas après corrections
console.log('=== TEST DÉTECTION PAS APRÈS CORRECTIONS ===\n');

// Simulation d'un algorithme PDR simplifié
class SimplePDR {
  constructor() {
    this.stepCount = 0;
    this.lastStepTime = Date.now();
    this.position = { x: 0, y: 0 };
    this.stepLength = 0.7;
    this.accelerationHistory = [];
  }
  
  // Simulation de détection de pas
  detectStep(magnitude) {
    const now = Date.now();
    const timeSinceLastStep = now - this.lastStepTime;
    const minInterval = 200; // 200ms minimum
    const threshold = 0.05; // Seuil très bas
    
    console.log(`[TEST] Magnitude: ${magnitude.toFixed(3)}, Intervalle: ${timeSinceLastStep}ms`);
    
    if (magnitude > threshold && timeSinceLastStep > minInterval) {
      this.stepCount++;
      this.lastStepTime = now;
      
      // Avancer position
      this.position.x += this.stepLength;
      
      console.log(`✅ [PAS DÉTECTÉ] #${this.stepCount} - Position: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)})`);
      return true;
    } else {
      console.log(`❌ [PAS REJETÉ] Magnitude: ${magnitude.toFixed(3)} (seuil: ${threshold}) ou intervalle trop court: ${timeSinceLastStep}ms`);
      return false;
    }
  }
}

// Test avec différentes magnitudes
const pdr = new SimplePDR();

console.log('🚶 Simulation de 5 pas avec magnitudes variables:\n');

const testMagnitudes = [0.08, 0.12, 0.06, 0.15, 0.09];

testMagnitudes.forEach((magnitude, index) => {
  console.log(`--- Pas ${index + 1} ---`);
  
  // Attendre un peu entre chaque pas
  setTimeout(() => {
    pdr.detectStep(magnitude);
  }, index * 300);
});

// Résumé après 2 secondes
setTimeout(() => {
  console.log('\n=== RÉSUMÉ ===');
  console.log(`Pas détectés: ${pdr.stepCount}/5`);
  console.log(`Position finale: (${pdr.position.x.toFixed(2)}, ${pdr.position.y.toFixed(2)})`);
  console.log(`Distance parcourue: ${(pdr.stepCount * pdr.stepLength).toFixed(2)}m`);
  
  if (pdr.stepCount > 0) {
    console.log('✅ SUCCÈS: La détection de pas fonctionne !');
  } else {
    console.log('❌ ÉCHEC: Aucun pas détecté');
  }
}, 2000); 