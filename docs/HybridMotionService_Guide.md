# Guide d'utilisation du HybridMotionService

## Vue d'ensemble

Le `HybridMotionService` combine le podomètre natif d'iOS/Android avec la boussole pour fournir une solution de navigation intérieure hybride plus précise et économe en énergie que les solutions basées uniquement sur les capteurs IMU.

**🆕 Optimisations natives :** Notre implémentation utilise maintenant directement les APIs natives [CMPedometer d'Apple](https://developer.apple.com/documentation/coremotion/cmpedometer) sur iOS et le podomètre Android pour une précision et une efficacité maximales.

## Fonctionnalités

- ✅ **Détection de pas native optimisée** : Utilise CMPedometer sur iOS et le podomètre Android
- ✅ **Calibration automatique** : Utilise les données historiques pour calibrer la longueur de pas
- ✅ **Analyse de cadence** : Ajustement dynamique selon la vitesse de marche
- ✅ **Données natives enrichies** : Distance, étages montés/descendus (iOS)
- ✅ **Orientation adaptative** : Filtrage intelligent selon la précision de la boussole
- ✅ **Métriques de confiance** : Évaluation de la fiabilité des données
- ✅ **Optimisations plateforme** : Configuration spécifique iOS/Android
- ✅ **Faible consommation** : Optimisé pour préserver la batterie

## Installation et configuration

### 1. Dépendances

Les dépendances sont déjà installées dans votre projet :
- `expo-sensors` (pour le podomètre natif)
- `expo-location` (pour la boussole)

### 2. Permissions

Le fichier `app.json` a été mis à jour avec les permissions nécessaires :

```json
{
  "ios": {
    "infoPlist": {
      "NSMotionUsageDescription": "La détection de pas est utilisée pour la navigation intérieure.",
      "NSLocationWhenInUseUsageDescription": "La boussole est utilisée pour afficher l'orientation."
    }
  }
}
```

## Utilisation de base

### Import et initialisation

```javascript
import HybridMotionService from '../services/HybridMotionService';

// Création du service avec callbacks enrichis
const motionService = new HybridMotionService(
  // Callback pour les pas détectés (données enrichies)
  ({ stepCount, stepLength, dx, dy, timestamp, cadence, nativeSteps, confidence }) => {
    console.log(`Pas détecté: ${stepCount}, cadence: ${cadence} pas/min, confiance: ${confidence}`);
    // Mettre à jour la position
    position.x += dx;
    position.y += dy;
  },
  // Callback pour l'orientation (filtrage adaptatif)
  ({ yaw, accuracy, timestamp, rawHeading, adaptiveAlpha }) => {
    console.log(`Orientation: ${yaw}°, alpha adaptatif: ${adaptiveAlpha}`);
    // Mettre à jour l'orientation
    currentHeading = yaw;
  }
);
```

### Configuration avancée

```javascript
// Configuration de la taille de l'utilisateur (crucial pour la précision)
motionService.setUserHeight(1.75); // en mètres

// Ajustement du lissage de la longueur de pas
motionService.setStepLengthSmoothing(0.05); // 0.01 = très lisse, 0.2 = très réactif

// Ajustement du lissage de l'orientation (adaptatif automatiquement)
motionService.setHeadingSmoothing(0.1); // Base pour le filtrage adaptatif
```

### Démarrage et arrêt

```javascript
// Démarrage du service (avec vérifications automatiques)
try {
  await motionService.start();
  console.log('Service démarré avec optimisations natives');
} catch (error) {
  console.error('Erreur:', error.message);
}

// Arrêt du service
motionService.stop();
```

## Nouvelles fonctionnalités natives

### 1. Calibration automatique avec données historiques

Sur iOS, le service récupère automatiquement les données historiques du podomètre pour calibrer la longueur de pas :

```javascript
// Automatique au démarrage - récupère la dernière heure
// Utilise les données natives de distance si disponibles
```

### 2. Analyse de cadence en temps réel

Le service calcule la cadence (pas/minute) et ajuste automatiquement la longueur de pas :

```javascript
// Cadence normale: 100-120 pas/min → longueur normale
// Cadence lente: <90 pas/min → pas plus longs
// Cadence rapide: >130 pas/min → pas plus courts
```

### 3. Métriques de confiance

Chaque mesure inclut un score de confiance basé sur :
- Cadence dans une plage normale
- Disponibilité des données natives de distance (iOS)
- Précision de la boussole

### 4. Accès aux données natives

```javascript
// Récupération des données natives pour une période donnée
const endDate = new Date();
const startDate = new Date(endDate.getTime() - 60 * 60 * 1000); // 1 heure
const nativeData = await motionService.getNativeStepData(startDate, endDate);

console.log(nativeData);
// {
//   steps: 1234,
//   distance: 987.5,        // iOS uniquement
//   floorsAscended: 2,      // iOS uniquement
//   floorsDescended: 1      // iOS uniquement
// }
```

## Callbacks et données enrichies

### Callback de pas (`onStep`)

Reçoit un objet avec des données enrichies :
```javascript
{
  stepCount: 42,           // Nombre total de pas détectés
  stepLength: 0.73,        // Longueur du pas calibrée en mètres
  dx: 0.52,               // Déplacement X en mètres
  dy: 0.51,               // Déplacement Y en mètres
  timestamp: 1640995200000, // Timestamp du pas
  cadence: 115.2,         // 🆕 Cadence en pas/minute
  nativeSteps: 1234,      // 🆕 Compteur natif total
  confidence: 0.85        // 🆕 Score de confiance (0-1)
}
```

### Callback d'orientation (`onHeading`)

Reçoit un objet avec filtrage adaptatif :
```javascript
{
  yaw: 45.2,              // Orientation filtrée en degrés (0-360)
  accuracy: 15.0,         // Précision en degrés
  timestamp: 1640995200000, // Timestamp de la mesure
  rawHeading: 47.1,       // 🆕 Orientation brute non filtrée
  adaptiveAlpha: 0.15     // 🆕 Facteur de lissage adaptatif utilisé
}
```

## Optimisations par plateforme

### iOS (CMPedometer)
- ✅ Utilise CoreMotion/CMPedometer directement
- ✅ Données de distance natives disponibles
- ✅ Comptage d'étages montés/descendus
- ✅ Historique illimité
- ✅ Calibration automatique avec données historiques
- ✅ Seuil de confiance élevé (0.5)

### Android
- ✅ Utilise le podomètre Android natif
- ✅ Distance calculée (pas de données natives)
- ✅ Historique limité
- ✅ Seuil de confiance adapté (0.3)

## Méthodes utilitaires avancées

### Statistiques complètes

```javascript
const stats = motionService.getStats();
console.log(stats);
// {
//   stepCount: 42,
//   dynamicStepLength: 0.73,
//   filteredYaw: 45.2,
//   userHeight: 1.75,
//   nativeMetrics: {           // 🆕 Métriques natives
//     totalSteps: 1234,
//     totalDistance: 987.5,    // iOS uniquement
//     currentCadence: 115.2,
//     isAvailable: true
//   },
//   platform: 'ios',          // 🆕 Plateforme détectée
//   sessionDuration: 120.5,   // 🆕 Durée de session en secondes
//   confidence: 0.85          // 🆕 Confiance globale
// }
```

### Test de disponibilité

```javascript
// Vérification automatique au démarrage
// Lève une exception si le podomètre n'est pas disponible
```

## Exemples et tests

### 1. Exemple simple
Voir `src/examples/HybridMotionExample.js` pour un exemple complet avec interface utilisateur.

### 2. Test du podomètre natif
Voir `src/examples/NativePedometerTest.js` pour tester spécifiquement les fonctionnalités natives.

### 3. Intégration complète
Voir `src/services/HybridMotionIntegration.js` pour l'orchestrateur complet.

## Gestion d'erreurs avancée

### Erreurs spécifiques

1. **Podomètre non disponible**
   ```javascript
   try {
     await motionService.start();
   } catch (error) {
     if (error.message.includes('non disponible')) {
       // Appareil ne supporte pas le podomètre natif
       // Fallback vers détection manuelle
     }
   }
   ```

2. **Données historiques indisponibles**
   ```javascript
   // Gestion automatique - continue sans calibration historique
   // Message d'avertissement dans les logs
   ```

## Optimisations et bonnes pratiques

### Performance native
- Utilise les APIs optimisées du système d'exploitation
- Consommation batterie minimale grâce aux processeurs de mouvement dédiés
- Traitement en arrière-plan par le système

### Précision améliorée
- Calibration automatique avec données historiques (iOS)
- Ajustement dynamique selon la cadence de marche
- Filtrage adaptatif de l'orientation selon la précision
- Métriques de confiance pour évaluer la fiabilité

### Utilisation mémoire optimisée
- Limitation automatique de l'historique des trajectoires
- Nettoyage automatique des ressources
- Gestion efficace des subscriptions natives

## Dépannage avancé

### Le podomètre natif ne fonctionne pas
1. Vérifier la disponibilité : `await Pedometer.isAvailableAsync()`
2. Vérifier les permissions : `await Pedometer.requestPermissionsAsync()`
3. Tester avec `NativePedometerTest.js`
4. Vérifier que l'appareil a un processeur de mouvement (M7+ sur iOS)

### Calibration incorrecte
1. Vérifier la taille utilisateur configurée
2. Marcher sur une distance connue pour valider
3. Utiliser les données historiques pour recalibrer
4. Ajuster les paramètres de lissage

### Confiance faible
1. Vérifier la cadence de marche (90-140 pas/min optimal)
2. Calibrer la boussole de l'appareil
3. S'éloigner des interférences magnétiques
4. Marcher de manière régulière

## Support et contribution

Pour des questions ou des améliorations, consultez :
- [Documentation CMPedometer d'Apple](https://developer.apple.com/documentation/coremotion/cmpedometer)
- Les exemples de test dans le projet
- Les logs détaillés du service 