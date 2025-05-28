# Guide de Migration : HybridMotionService → NativeEnhancedMotionService

Ce guide explique comment migrer de l'ancien `HybridMotionService` vers le nouveau `NativeEnhancedMotionService` qui utilise le module natif CMPedometer.

## Résumé des changements

### ✅ Avantages du nouveau service

1. **Longueur de pas native** : Calculée directement par le coprocesseur iOS
2. **Code simplifié** : Suppression de toutes les formules maison
3. **Précision améliorée** : Données directes de CMPedometer
4. **Maintenance réduite** : Plus de calibration manuelle à maintenir
5. **Performance optimisée** : Moins de calculs JavaScript

### ❌ Code supprimé

- Toute la logique de calcul dynamique de `dynamicStepLength`
- Les constantes de fallback (0.7, userHeight × 0.4, etc.)
- Les algorithmes de calibration par amplitude et cadence
- Le lissage α pour la longueur de pas
- Les modes hybrides complexes

## Migration étape par étape

### 1. Remplacement de l'import

**Avant :**
```javascript
import HybridMotionService from '../services/HybridMotionService';
```

**Après :**
```javascript
import NativeEnhancedMotionService from '../services/NativeEnhancedMotionService';
```

### 2. Initialisation du service

**Avant :**
```javascript
const motionService = new HybridMotionService(
  handleStepDetected,
  handleHeading
);

// Configuration complexe
motionService.setUserHeight(1.75);
motionService.setStepLengthSmoothing(0.05);
motionService.setHeadingSmoothing(0.1);
```

**Après :**
```javascript
const motionService = new NativeEnhancedMotionService(
  handleStepDetected,
  handleHeading
);

// Plus de configuration nécessaire !
// La longueur de pas est calculée automatiquement par CMPedometer
```

### 3. Gestion des callbacks de pas

**Avant :**
```javascript
const handleStepDetected = (stepData) => {
  console.log('Pas détecté:', stepData.stepCount);
  console.log('Longueur calculée:', stepData.stepLength); // Formule JS
  console.log('Mode:', stepData.operatingMode); // 'native', 'pdr', 'hybrid'
  console.log('Confiance:', stepData.confidence);
  
  // Logique complexe selon le mode
  if (stepData.source === 'native') {
    // Traitement spécial pour les données natives
  } else if (stepData.source === 'pdr') {
    // Traitement pour PDR
  }
};
```

**Après :**
```javascript
const handleStepDetected = (stepData) => {
  console.log('Pas détecté:', stepData.stepCount);
  console.log('Longueur NATIVE:', stepData.stepLength); // ✅ Directe de CMPedometer
  console.log('Source:', stepData.source); // 'native_cmpedometer' ou 'fallback_expo'
  console.log('Confiance:', stepData.confidence);
  
  // Logique simplifiée
  if (stepData.nativeStepLength) {
    console.log('✅ Données natives CMPedometer utilisées');
    // Précision maximale garantie
  } else {
    console.log('📱 Mode fallback Expo Pedometer');
    // Longueur fixe de 0.79m
  }
};
```

### 4. Suppression des méthodes de calibration

**Avant :**
```javascript
// ❌ À SUPPRIMER - Plus nécessaire
motionService.setUserHeight(1.75);
motionService.setStepLengthSmoothing(0.05);

// ❌ À SUPPRIMER - Calibration manuelle
motionService._updateStepLength(peakAmplitude, cadence);
motionService._adjustStepLengthByCadence(cadence);
```

**Après :**
```javascript
// ✅ Plus rien à configurer !
// La longueur de pas est automatiquement calculée par CMPedometer
```

### 5. Gestion des statistiques

**Avant :**
```javascript
const stats = motionService.getStats();
console.log('Mode opératoire:', stats.operatingMode); // 'native', 'pdr', 'hybrid'
console.log('Métriques natives:', stats.nativeMetrics);
console.log('Métriques PDR:', stats.pdrMetrics);
console.log('Basculements:', stats.monitoring.switchCount);
console.log('Profil énergétique:', stats.energyProfile);
```

**Après :**
```javascript
const stats = motionService.getStats();
console.log('Module natif disponible:', stats.metrics.nativeAvailable);
console.log('Utilise longueur native:', stats.metrics.usingNativeStepLength);
console.log('Longueur moyenne:', stats.metrics.averageStepLength);
console.log('Distance totale:', stats.metrics.totalDistance);
// Plus de modes complexes, interface simplifiée
```

## Comparaison des fonctionnalités

| Fonctionnalité | HybridMotionService | NativeEnhancedMotionService |
|---|---|---|
| **Longueur de pas** | Formules JS complexes | ✅ CMPedometer natif |
| **Modes opératoires** | 3 modes (native/pdr/hybrid) | 2 modes (native/fallback) |
| **Calibration** | Manuelle (amplitude, cadence) | ✅ Automatique |
| **Basculement automatique** | Oui (complexe) | Non (simple) |
| **Algorithme PDR** | Inclus | Supprimé |
| **Gestion énergétique** | Adaptative | Simplifiée |
| **Code à maintenir** | ~1200 lignes | ~400 lignes |
| **Précision iOS** | Approximative | ✅ Maximale |

## Fichiers à modifier

### 1. Remplacer les imports

Rechercher et remplacer dans tous les fichiers :
```bash
# Rechercher
import.*HybridMotionService

# Remplacer par
import.*NativeEnhancedMotionService
```

### 2. Supprimer les configurations obsolètes

Supprimer toutes les occurrences de :
- `setUserHeight()`
- `setStepLengthSmoothing()`
- `_updateStepLength()`
- `_adjustStepLengthByCadence()`
- Références à `operatingMode`
- Logique de basculement manuel

### 3. Mettre à jour les callbacks

Adapter la logique des callbacks pour utiliser :
- `stepData.nativeStepLength` au lieu de calculs manuels
- `stepData.source` simplifié
- Suppression des conditions sur les modes complexes

## Test de la migration

### 1. Vérification sur iOS

```javascript
// Test de disponibilité du module natif
const isNativeAvailable = await ExpoNativePedometer.isAvailable();
console.log('Module natif disponible:', isNativeAvailable);

// Test de démarrage
await motionService.start();
const stats = motionService.getStats();
console.log('Utilise longueur native:', stats.metrics.usingNativeStepLength);
```

### 2. Vérification des logs

Rechercher ces logs pour confirmer le bon fonctionnement :
```
✅ [NATIVE-ENHANCED] Mode: NATIF CMPedometer
🍎 [NATIVE-STEP] Pas natif reçu:
  - Longueur: 0.789m
📡 [NATIVE-PEDOMETER] Événement émis: stepLength=0.789m
```

### 3. Test de fallback

Sur Android ou simulateur, vérifier le fallback :
```
⚠️ [NATIVE-ENHANCED] Module natif non disponible, fallback vers Expo Pedometer
✅ [NATIVE-ENHANCED] Mode: FALLBACK Expo
```

## Dépannage

### Problème : Module natif non trouvé

**Solution :** Vérifier que `app.json` contient :
```json
{
  "expo": {
    "plugins": [
      "./modules/expo-native-pedometer"
    ]
  }
}
```

### Problème : Pas de données natives sur iOS

**Causes possibles :**
1. Simulateur iOS (utilise le fallback)
2. Permissions refusées
3. Appareil sans coprocesseur de mouvement

**Vérification :**
```javascript
const status = await ExpoNativePedometer.getStatus();
console.log('Statut:', status);
```

### Problème : Longueur de pas aberrante

Le module natif filtre automatiquement les valeurs entre 0.3m et 1.5m. Si des valeurs sont rejetées, vérifier les logs :
```
⚠️ [NATIVE-PEDOMETER] Longueur de pas anormale: 2.345m - ignorée
```

## Avantages de la migration

1. **Précision maximale** : Données directes du coprocesseur iOS
2. **Code simplifié** : -66% de lignes de code
3. **Maintenance réduite** : Plus de formules à maintenir
4. **Performance améliorée** : Moins de calculs JavaScript
5. **Fiabilité accrue** : Validation automatique des données

La migration vers `NativeEnhancedMotionService` simplifie considérablement votre code tout en améliorant la précision sur iOS. Le fallback automatique vers Expo Pedometer garantit la compatibilité sur toutes les plateformes. 