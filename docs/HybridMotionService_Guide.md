# Guide d'utilisation du HybridMotionService

## Vue d'ensemble

Le `HybridMotionService` est un **système hybride intelligent** qui bascule automatiquement entre l'API native du podomètre (CMPedometer d'Apple sur iOS, Android Step Counter) et l'algorithme PDR (Pedestrian Dead Reckoning) maison selon la disponibilité et la fiabilité.

**🆕 Architecture hybride intelligente :** Notre implémentation détecte automatiquement la disponibilité de l'API native, évalue sa fiabilité en temps réel, et bascule vers l'algorithme PDR en cas de problème, tout en optimisant la consommation énergétique.

## Fonctionnalités principales

### 🎯 Basculement automatique intelligent
- ✅ **Détection de disponibilité** : Vérification automatique de l'API native au démarrage
- ✅ **Évaluation de fiabilité** : Score de confiance basé sur la cadence physiologique
- ✅ **Basculement automatique** : Fallback vers PDR en cas de timeout ou faible fiabilité
- ✅ **Surveillance continue** : Monitoring de la santé du système natif
- ✅ **Limite de basculements** : Protection contre les oscillations (3 max par session)

### 🔋 Optimisation énergétique adaptative
- ✅ **Mode natif pur** : Échantillonnage IMU minimal (10Hz), consommation minimale
- ✅ **Mode hybride** : Natif + PDR standby, échantillonnage modéré (25Hz)
- ✅ **Mode PDR pur** : Échantillonnage complet (50Hz) pour détection logicielle
- ✅ **Pas de double comptage** : Un seul système actif à la fois

### 📊 Métriques avancées
- ✅ **Fiabilité native** : Score 0-1 basé sur cadence et données historiques
- ✅ **Confiance PDR** : Évaluation de la qualité de détection logicielle
- ✅ **Profils énergétiques** : Monitoring de la consommation par mode
- ✅ **Statistiques de basculement** : Historique des changements de mode

## Modes opératoires

### 🍎 Mode NATIVE (optimal)
**Conditions :** API disponible + permissions + fiabilité élevée
- Utilise exclusivement CMPedometer (iOS) ou Android Step Counter
- Échantillonnage IMU minimal : 10Hz (orientation seulement)
- Boussole : 5Hz
- **Avantages :** Consommation minimale, précision maximale
- **Inconvénients :** Dépendant de l'API système

### 🔄 Mode HYBRIDE (équilibré)
**Conditions :** API disponible + permissions + fiabilité modérée
- Système natif principal + PDR en standby
- Échantillonnage IMU modéré : 25Hz
- Boussole : 10Hz
- **Avantages :** Fiabilité + économie d'énergie
- **Inconvénients :** Complexité accrue

### 🧠 Mode PDR (fallback)
**Conditions :** API indisponible ou permissions refusées
- Algorithme PDR complet avec détection logicielle
- Échantillonnage IMU complet : 50Hz
- Boussole : 10Hz
- **Avantages :** Indépendant du système, toujours disponible
- **Inconvénients :** Consommation plus élevée

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

## Utilisation du système hybride

### Import et initialisation

```javascript
import HybridMotionService from '../services/HybridMotionService';

// Création du service avec callbacks enrichis
const motionService = new HybridMotionService(
  // Callback pour les pas détectés (données enrichies avec source)
  ({ stepCount, stepLength, dx, dy, timestamp, source, confidence, operatingMode }) => {
    console.log(`Pas détecté: ${stepCount} (source: ${source}, mode: ${operatingMode})`);
    // Mettre à jour la position
    position.x += dx;
    position.y += dy;
  },
  // Callback pour l'orientation (avec mode opératoire)
  ({ yaw, accuracy, timestamp, operatingMode }) => {
    console.log(`Orientation: ${yaw}° (mode: ${operatingMode})`);
    // Mettre à jour l'orientation
    currentHeading = yaw;
  }
);
```

### Démarrage intelligent

```javascript
// Démarrage avec sélection automatique du mode optimal
try {
  await motionService.start();
  
  // Récupération du mode sélectionné
  const stats = motionService.getStats();
  console.log(`Mode opératoire: ${stats.operatingMode}`);
  console.log(`Profil énergétique: ${stats.energyProfile.cpuUsage}`);
  
} catch (error) {
  console.error('Erreur:', error.message);
}
```

### Surveillance et basculement

```javascript
// Surveillance automatique (déjà active)
// Le service surveille la santé du système natif toutes les 5 secondes

// Basculement manuel si nécessaire
await motionService.switchMode('pdr'); // Force le mode PDR
await motionService.switchMode('native'); // Retour au mode natif

// Vérification du mode actuel
const currentMode = motionService.getStats().operatingMode;
```

## Callbacks et données enrichies

### Callback de pas (`onStep`)

Reçoit un objet avec des données enrichies incluant la source :
```javascript
{
  stepCount: 42,           // Nombre total de pas détectés
  stepLength: 0.73,        // Longueur du pas calibrée en mètres
  dx: 0.52,               // Déplacement X en mètres
  dy: 0.51,               // Déplacement Y en mètres
  timestamp: 1640995200000, // Timestamp du pas
  source: 'native',       // 🆕 Source: 'native' ou 'pdr'
  confidence: 0.85,       // Score de confiance (0-1)
  operatingMode: 'native', // 🆕 Mode opératoire actuel
  
  // Données spécifiques selon la source
  cadence: 115.2,         // Cadence (mode natif)
  nativeSteps: 1234,      // Compteur natif total (mode natif)
  mode: 'walking'         // Mode d'activité (mode PDR)
}
```

### Callback d'orientation (`onHeading`)

Reçoit un objet avec informations de mode :
```javascript
{
  yaw: 45.2,              // Orientation filtrée en degrés (0-360)
  accuracy: 15.0,         // Précision en degrés
  timestamp: 1640995200000, // Timestamp de la mesure
  rawHeading: 47.1,       // Orientation brute non filtrée
  adaptiveAlpha: 0.15,    // Facteur de lissage adaptatif utilisé
  operatingMode: 'native' // 🆕 Mode opératoire actuel
}
```

## Gestion intelligente des basculements

### Critères de basculement automatique

1. **Timeout du système natif** : Pas de données depuis 10 secondes
2. **Fiabilité faible** : Score < seuil plateforme (iOS: 0.7, Android: 0.5)
3. **Cadence anormale** : En dehors de 60-200 pas/minute
4. **Erreurs répétées** : Échecs d'API consécutifs

### Protection contre les oscillations

- **Limite de basculements** : Maximum 3 par session
- **Délai de stabilisation** : 10 secondes après basculement
- **Historique des raisons** : Tracking des causes de basculement

### Surveillance continue

```javascript
// Surveillance automatique active
// Vérification toutes les 5 secondes :
// - Santé du système natif
// - Fiabilité des données
// - Cadence physiologique
// - Timeout de mise à jour
```

## Optimisations énergétiques

### Profils énergétiques par mode

```javascript
const energyProfiles = {
  native: {
    imuSampleRate: 10,      // 10Hz - orientation seulement
    compassSampleRate: 5,   // 5Hz - économie maximale
    cpuUsage: 'low'         // Traitement minimal
  },
  hybrid: {
    imuSampleRate: 25,      // 25Hz - compromis
    compassSampleRate: 10,  // 10Hz - standard
    cpuUsage: 'medium'      // Traitement modéré
  },
  pdr: {
    imuSampleRate: 50,      // 50Hz - détection complète
    compassSampleRate: 10,  // 10Hz - standard
    cpuUsage: 'medium'      // Traitement algorithme PDR
  }
};
```

### Économies d'énergie

- **Mode natif** : Jusqu'à 80% d'économie CPU vs PDR pur
- **Échantillonnage adaptatif** : Fréquence ajustée selon le mode
- **Standby intelligent** : PDR en veille en mode hybride
- **Arrêt automatique** : Capteurs inutilisés désactivés

## Méthodes avancées

### Statistiques complètes du système hybride

```javascript
const stats = motionService.getStats();
console.log(stats);
// {
//   // Informations générales
//   operatingMode: 'native',
//   stepCount: 42,
//   confidence: 0.85,
//   
//   // Métriques natives
//   nativeMetrics: {
//     available: true,
//     permissions: true,
//     reliability: 0.9,
//     totalSteps: 1234,
//     currentCadence: 115.2
//   },
//   
//   // Métriques PDR
//   pdrMetrics: {
//     active: false,
//     mode: 'walking',
//     stepsDetected: 0
//   },
//   
//   // Surveillance
//   monitoring: {
//     switchCount: 1,
//     fallbackReason: null,
//     lastNativeUpdate: 1640995200000
//   },
//   
//   // Profil énergétique actuel
//   energyProfile: {
//     imuSampleRate: 10,
//     compassSampleRate: 5,
//     cpuUsage: 'low'
//   }
// }
```

### Basculement manuel

```javascript
// Forcer un mode spécifique
await motionService.switchMode('pdr');    // Force PDR
await motionService.switchMode('native'); // Force natif
await motionService.switchMode('hybrid'); // Force hybride

// Le service vérifie la faisabilité et peut refuser si impossible
```

### Test de disponibilité native

```javascript
// Test des données historiques natives
const endDate = new Date();
const startDate = new Date(endDate.getTime() - 60 * 60 * 1000); // 1 heure
const nativeData = await motionService.getNativeStepData(startDate, endDate);

if (nativeData) {
  console.log(`Données natives: ${nativeData.steps} pas`);
  console.log(`Distance: ${nativeData.distance} m`); // iOS uniquement
}
```

## Exemples et tests

### 1. Test du système hybride intelligent
Voir `src/examples/HybridIntelligentTest.js` pour un exemple complet avec :
- Interface de contrôle des modes
- Surveillance en temps réel
- Journal des basculements
- Métriques détaillées

### 2. Test du podomètre natif
Voir `src/examples/NativePedometerTest.js` pour tester spécifiquement l'API native.

### 3. Exemple simple
Voir `src/examples/HybridMotionExample.js` pour un exemple d'utilisation basique.

## Gestion d'erreurs et dépannage

### Erreurs de basculement

```javascript
try {
  await motionService.switchMode('native');
} catch (error) {
  if (error.message.includes('non disponible')) {
    // API native indisponible
    console.log('Fallback vers PDR automatique');
  } else if (error.message.includes('permissions')) {
    // Permissions refusées
    console.log('Demander les permissions utilisateur');
  }
}
```

### Diagnostic du système

```javascript
const stats = motionService.getStats();

// Vérifier la disponibilité native
if (!stats.nativeMetrics.available) {
  console.log('API native non supportée sur cet appareil');
}

// Vérifier les permissions
if (!stats.nativeMetrics.permissions) {
  console.log('Permissions mouvement refusées');
}

// Vérifier la fiabilité
if (stats.nativeMetrics.reliability < 0.5) {
  console.log('Fiabilité native faible, basculement recommandé');
}

// Vérifier les basculements
if (stats.monitoring.switchCount >= 3) {
  console.log('Limite de basculements atteinte');
}
```

### Problèmes courants

1. **Basculements fréquents**
   - Vérifier la stabilité de l'API native
   - Ajuster les seuils de fiabilité
   - Vérifier les interférences magnétiques

2. **Consommation élevée**
   - Vérifier le mode opératoire (préférer natif)
   - Désactiver les fonctionnalités non nécessaires
   - Optimiser la fréquence d'échantillonnage

3. **Précision faible**
   - Calibrer la taille utilisateur
   - Vérifier la qualité des données natives
   - Ajuster les paramètres de lissage

## Bonnes pratiques

### Optimisation des performances

1. **Laisser le système choisir** : Le mode automatique est généralement optimal
2. **Surveiller les basculements** : Trop de changements indiquent un problème
3. **Calibrer la taille** : Essentiel pour la précision des longueurs de pas
4. **Tester sur appareil réel** : Les simulateurs ne supportent pas l'API native

### Gestion de l'énergie

1. **Préférer le mode natif** : Consommation minimale quand disponible
2. **Éviter les basculements manuels** : Laisser l'automatique gérer
3. **Monitorer la consommation** : Utiliser les métriques énergétiques
4. **Arrêter quand inutilisé** : Toujours appeler `stop()` en fin d'utilisation

### Fiabilité

1. **Gérer les erreurs** : Toujours wrapper dans try/catch
2. **Vérifier la disponibilité** : Tester avant utilisation critique
3. **Fallback gracieux** : Prévoir un mode dégradé
4. **Logs détaillés** : Activer pour le débogage

## Support et contribution

Pour des questions ou des améliorations, consultez :
- [Documentation CMPedometer d'Apple](https://developer.apple.com/documentation/coremotion/cmpedometer)
- [Android Step Counter](https://developer.android.com/guide/topics/sensors/sensors_motion#sensors-motion-stepcounter)
- Les exemples de test dans le projet
- Les logs détaillés du service

## Changelog

### v2.0 - Système hybride intelligent
- ✅ Basculement automatique Native ↔ PDR
- ✅ Optimisation énergétique adaptative
- ✅ Surveillance continue de la fiabilité
- ✅ Protection contre les oscillations
- ✅ Métriques avancées de monitoring
- ✅ Interface de test complète

### v1.0 - Version initiale
- ✅ Podomètre natif optimisé
- ✅ Calibration automatique
- ✅ Analyse de cadence
- ✅ Métriques de confiance 