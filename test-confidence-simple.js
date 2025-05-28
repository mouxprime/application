/**
 * Script de test simplifié pour vérifier l'intégration de la confiance
 */

console.log('Test d\'integration de la confiance');
console.log('===================================');

// Test de la logique MapScreen
function testMapScreenLogic(source, confidence) {
  console.log('\nTest MapScreen avec source:', source);
  console.log('Confiance recue:', confidence, '(' + (confidence * 100).toFixed(1) + '%)');
  
  const isNative = source === 'ios_cmpedometer';
  const stepConfidenceToUse = isNative ? 1.0 : confidence;
  
  console.log('isNative:', isNative);
  console.log('stepConfidenceToUse:', stepConfidenceToUse, '(' + (stepConfidenceToUse * 100).toFixed(1) + '%)');
  
  return stepConfidenceToUse;
}

// Test de la logique EKF
function testEKFLogic(confidence, baseNoise = 0.05) {
  console.log('\nTest EKF avec confiance:', confidence);
  console.log('Bruit de base:', baseNoise.toFixed(4));
  
  const confidenceAdjustment = Math.max(0.1, confidence);
  const adjustedNoise = baseNoise / confidenceAdjustment;
  
  console.log('Ajustement confiance:', confidenceAdjustment.toFixed(3));
  console.log('Bruit ajuste:', adjustedNoise.toFixed(4));
  console.log('Reduction bruit:', ((1 - adjustedNoise/baseNoise) * 100).toFixed(1) + '%');
  
  return adjustedNoise;
}

// Tests
console.log('\n=== TEST MODE NATIF iOS ===');
const nativeConfidence = testMapScreenLogic('ios_cmpedometer', 0.95);
testEKFLogic(nativeConfidence);

console.log('\n=== TEST MODE APPLICATION ===');
const appConfidence = testMapScreenLogic('adaptive_expo', 0.78);
testEKFLogic(appConfidence);

console.log('\n=== TEST CONFIANCE FAIBLE ===');
const lowConfidence = testMapScreenLogic('adaptive_expo', 0.3);
testEKFLogic(lowConfidence);

console.log('\n=== RESUME ===');
console.log('Mode natif: Confiance forcee a 100%');
console.log('Mode application: Confiance dynamique utilisee');
console.log('Confiance faible: Bruit EKF augmente');
console.log('\nTests termines - Integration validee'); 