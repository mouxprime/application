# Expo Native Pedometer

Module natif Expo pour iOS qui utilise CMPedometer pour calculer la longueur de pas en temps réel.

## Fonctionnalités

- ✅ Accès direct à CMPedometer d'iOS
- ✅ Calcul de longueur de pas en temps réel par le coprocesseur
- ✅ Émission d'événements JavaScript à chaque nouveau pas
- ✅ Validation automatique des données (longueur entre 0.3m et 1.5m)
- ✅ Gestion des permissions automatique
- ✅ Interface TypeScript complète

## Installation

Le module est inclus dans le projet. Assurez-vous que `app.json` contient :

```json
{
  "expo": {
    "plugins": [
      "./modules/expo-native-pedometer"
    ]
  }
}
```

## Utilisation

### Import

```javascript
import ExpoNativePedometer from './modules/expo-native-pedometer/src/index';
```

### Vérification de disponibilité

```javascript
const isAvailable = await ExpoNativePedometer.isAvailable();
console.log('CMPedometer disponible:', isAvailable);
```

### Démarrage du suivi

```javascript
// Abonnement aux événements
const subscription = ExpoNativePedometer.addStepLengthListener((event) => {
  console.log('Nouveau pas détecté:');
  console.log('- Longueur:', event.stepLength, 'm');
  console.log('- Steps totaux:', event.totalSteps);
  console.log('- Distance totale:', event.totalDistance, 'm');
  console.log('- Timestamp:', event.timestamp);
});

// Démarrage du suivi
await ExpoNativePedometer.startStepLengthTracking();
```

### Arrêt du suivi

```javascript
// Arrêt du suivi
await ExpoNativePedometer.stopStepLengthTracking();

// Désabonnement
subscription.remove();
```

### Obtenir le statut

```javascript
const status = await ExpoNativePedometer.getStatus();
console.log('Statut:', status);
// {
//   isAvailable: true,
//   isRunning: false,
//   hasPermissions: true
// }
```

### Réinitialisation

```javascript
await ExpoNativePedometer.reset();
```

## Interface TypeScript

### StepLengthUpdateEvent

```typescript
interface StepLengthUpdateEvent {
  stepLength: number;      // Longueur de pas en mètres
  totalSteps: number;      // Nombre total de pas depuis le début
  totalDistance: number;   // Distance totale en mètres
  timestamp: number;       // Timestamp en millisecondes
}
```

### PedometerStatus

```typescript
interface PedometerStatus {
  isAvailable: boolean;    // CMPedometer disponible
  isRunning: boolean;      // Suivi en cours
  hasPermissions: boolean; // Permissions accordées
}
```

## Avantages par rapport aux formules JavaScript

### Avant (formules maison)
```javascript
// Calculs complexes et approximatifs
const base = this.userHeight * 0.4;
const amplitudeFactor = 0.7 + ((norm - 0.5) * 0.4 / 2.5);
const cadenceFactor = cadence < 100 ? 1.1 : cadence > 130 ? 0.9 : 1.0;
this.dynamicStepLength = (1 - this.alphaLen) * this.dynamicStepLength + 
                        this.alphaLen * (base * amplitudeFactor * cadenceFactor);
```

### Après (module natif)
```javascript
// Données directes du coprocesseur iOS
ExpoNativePedometer.addStepLengthListener((event) => {
  const stepLength = event.stepLength; // ✅ Calculé par CMPedometer
  // Utilisation directe, pas de formule à maintenir
});
```

## Validation des données

Le module natif valide automatiquement les données :

- Longueur de pas entre 0.3m et 1.5m
- Filtrage des valeurs aberrantes
- Logs détaillés pour le debugging

## Logs de debugging

Le module émet des logs détaillés :

```
🍎 [NATIVE-PEDOMETER] Démarrage CMPedometer.startUpdates...
🍎 [NATIVE-PEDOMETER] Données reçues:
  - Steps totaux: 1234
  - Distance totale: 987.654m
  - Delta steps: 1
  - Delta distance: 0.789m
  - Longueur de pas calculée: 0.789m
📡 [NATIVE-PEDOMETER] Événement émis: stepLength=0.789m
```

## Permissions requises

Le module utilise les permissions déjà configurées dans `app.json` :

```json
{
  "ios": {
    "infoPlist": {
      "NSMotionUsageDescription": "La détection de pas est utilisée pour la navigation intérieure."
    }
  }
}
```

## Compatibilité

- ✅ iOS 8.0+
- ✅ Appareils avec coprocesseur de mouvement (M7+)
- ❌ Android (utilise le fallback Expo Pedometer)
- ❌ Simulateur iOS (utilise le fallback)

## Exemple complet

Voir `src/examples/NativeMotionExample.js` pour un exemple d'utilisation complète avec interface utilisateur. 