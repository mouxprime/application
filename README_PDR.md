# 🏴‍☠️ Système de Localisation PDR Avancé pour Catacombes

## Vue d'ensemble

Ce système implémente un **Pedestrian Dead Reckoning (PDR)** avancé spécialement conçu pour la navigation dans les **catacombes de Paris** et autres environnements confinés sans GPS. Il combine detection de pas, crawling, fusion de capteurs, et optimisation énergétique.

## 🚀 Fonctionnalités Principales

### 1. **Inertial-only Dead Reckoning**
- **IMU 9-axes** : Accéléromètre, gyroscope, magnétomètre
- **Pipeline PDR complet** avec détection temps réel
- **Détection de pas/crawling** : Analyse des pics d'accélération verticale
- **Zero-Velocity Updates (ZUPT)** : Correction de dérive IMU pendant les arrêts

### 2. **Classification d'Activité Intelligente**
- **Modes détectés** : Marche, Course, Ramper, Immobile
- **Algorithme adaptatif** : Arbre de décision basé sur variance d'accélération, inclinaison, fréquence
- **Modèles de mouvement** : Paramètres EKF adaptatifs selon l'activité

### 3. **Fusion de Capteurs & Map-Matching**
- **EKF étendu** : État 11D avec position, vitesse, orientation, biais
- **Map-matching** : Contraintes géométriques avec corridors vectoriels
- **Correction magnétomètre** : Conditionnelle selon niveau d'interférence
- **Fusion PDR-Kinematic** : Pondération optimale des estimations

### 4. **Optimisation Énergétique**
- **Échantillonnage adaptatif** : 5-100 Hz selon activité détectée
- **Désactivation sélective** : Capteurs non-critiques en mode économie
- **Traitement par batch** : Map-matching à ≤ 1 Hz
- **Gestion automatique** : Mode basse consommation après inactivité

## 🏗️ Architecture Technique

### Composants Principaux

```javascript
// SDK Principal - Interface simple
LocalizationSDK
├── initialize(vectorMap)
├── startTracking() / stopTracking()
└── callback onPositionUpdate(x, y, θ, mode) ≤ 1Hz

// Système PDR
PedestrianDeadReckoning
├── Détection de pas/crawling
├── Classification d'activité
├── ZUPT (Zero-Velocity Updates)
└── Estimation longueur de pas dynamique

// EKF Avancé
AdvancedExtendedKalmanFilter
├── État 11D : [x,y,z,vx,vy,vz,θ,ω,bias...]
├── Map-matching géométrique
├── Bruit adaptatif selon mode
└── Contraintes de vitesse

// Gestionnaire Capteurs
AdvancedSensorManager
├── Échantillonnage adaptatif
├── Gestion énergétique
├── Confiance magnétomètre
└── Métriques de performance
```

### Pipeline de Traitement

1. **Acquisition Capteurs** (5-100 Hz adaptatif)
2. **Classification Activité** (Marche/Course/Ramper/Immobile)
3. **Détection Pas/Crawling** (Analyse pics + seuils adaptatifs)
4. **Calcul Incréments PDR** (Distance + orientation)
5. **Prédiction EKF** (Fusion cinématique + PDR)
6. **Map-Matching** (Projection sur corridors)
7. **ZUPT** (Si immobile > 200ms)
8. **Callback Utilisateur** (≤ 1 Hz)

## 📊 Spécifications de Performance

### Précision
- **Accuracy cible** : < 2m dans corridors catacombes
- **Latence** : < 20ms traitement temps réel
- **Dérive** : Limitée par ZUPT + map-matching

### Énergie
- **Échantillonnage de base** : 25 Hz (batterie normale)
- **Mode haute performance** : 100 Hz (mouvement rapide)
- **Mode économie** : 5 Hz (inactivité > 30s)
- **Désactivation sélective** : Magnétomètre + baromètre si inactif

### Capteurs
- **Accéléromètre** : ±16g, bruit < 0.1 m/s²
- **Gyroscope** : ±2000°/s, dérive < 0.1°/h
- **Magnétomètre** : Confiance adaptative selon interférences

## 🎯 Usage Catacombes de Paris

### Configuration Spécialisée

```javascript
const sdk = new LocalizationSDK({
  userHeight: 1.7,              // Calibration longueur pas
  adaptiveSampling: true,       // Échantillonnage dynamique
  energyOptimization: true,     // Gestion batterie
  mapMatchingEnabled: true,     // Contraintes géométriques
  positionUpdateRate: 1.0       // Callbacks utilisateur 1Hz
});

// Initialisation avec carte catacombes
await sdk.initialize(catacombsVectorMap);
await sdk.startTracking();

// Callbacks temps réel
sdk.setCallbacks({
  onPositionUpdate: (x, y, θ, mode) => {
    updateUserInterface(x, y, θ, mode);
  },
  onModeChanged: (mode, features) => {
    console.log(`Activité: ${mode}`);
  }
});
```

### Cartes Vectorielles

Le système utilise des cartes vectorielles détaillées des catacombes :

```javascript
const catacombsMap = {
  name: "Catacombes de Paris",
  tunnels: [
    {
      name: "Tunnel Principal",
      points: [[0,0], [50,0], [50,30]], // Coordonnées métriques
      width: 2.0
    }
  ],
  landmarks: [
    {
      name: "Entrée Denfert-Rochereau",
      type: "entrance",
      position: [0, 0],
      description: "Point d'entrée principal"
    }
  ]
};
```

## 🔧 Configuration et Calibration

### Paramètres PDR

```javascript
const pdrConfig = {
  stepDetectionWindow: 20,       // Fenêtre analyse pas (samples)
  stepThreshold: 1.5,           // Seuil détection pas (m/s²)
  crawlThreshold: 0.8,          // Seuil mode ramper (m/s²)
  crawlPitchThreshold: 30,      // Inclinaison ramper (degrés)
  defaultStepLength: 0.7,       // Longueur pas défaut (m)
  heightRatio: 0.4,             // Ratio taille/longueur pas
  crawlSpeed: 0.3,              // Vitesse ramper (m/s)
  zuptThreshold: 0.1,           // Seuil ZUPT (m/s²)
  zuptDuration: 200             // Durée ZUPT (ms)
};
```

### Paramètres EKF

```javascript
const ekfConfig = {
  processNoiseWalking: 0.1,     // Bruit processus marche
  processNoiseCrawling: 0.05,   // Bruit processus ramper
  mapMatchingThreshold: 2.0,    // Distance max map-matching (m)
  mapMatchingWeight: 0.5,       // Poids correction géométrique
  maxWalkingSpeed: 2.0,         // Vitesse max marche (m/s)
  maxCrawlingSpeed: 0.5         // Vitesse max ramper (m/s)
};
```

### Paramètres Capteurs

```javascript
const sensorConfig = {
  baseRate: 25,                 // Taux base (Hz)
  highRate: 100,                // Taux haute performance (Hz)
  ultraLowRate: 5,              // Taux économie (Hz)
  motionThreshold: 2.0,         // Seuil mouvement rapide (m/s²)
  batteryOptimization: true,    // Optimisation batterie
  magneticInterferenceThreshold: 50.0  // Seuil interférence magnétique
};
```

## 📱 Interface Utilisateur

### Écrans Principaux

1. **MapScreen** : Visualisation temps réel position + carte vectorielle
2. **SensorsScreen** : Métriques PDR + données capteurs
3. **CalibrationScreen** : Processus calibration guidé
4. **AnalyticsScreen** : Statistiques performance + trajectoires

### Métriques PDR Affichées

- **Mode d'activité** : Marche/Course/Ramper/Immobile (couleur codée)
- **Nombre de pas** : Compteur temps réel
- **Échantillonnage** : Fréquence adaptative actuelle
- **Niveau énergie** : État batterie/optimisation
- **ZUPT actif** : Indicateur correction dérive
- **Distance parcourue** : Estimation cumulative

## 🧪 Tests et Validation

### Scénarios de Test

1. **Marche normale** : Couloirs droits, vitesse constante
2. **Navigation complexe** : Virages, intersections, chambres
3. **Mode ramper** : Passages bas, progression lente
4. **Arrêts fréquents** : Validation ZUPT
5. **Trajectoires longues** : Test dérive cumulative

### Métriques de Validation

```javascript
const testMetrics = {
  accuracy: "< 2m error in 100m trajectory",
  latency: "< 20ms processing time",
  energy: "8h+ battery life with optimization",
  robustness: "95%+ step detection accuracy",
  stability: "< 0.5m drift per 10min stationary"
};
```

## 🔮 Extensions Futures

### Améliorations Prévues

1. **Machine Learning** : Classification activité par réseaux de neurones
2. **SLAM Visuel** : Fusion caméra + IMU pour landmarks
3. **Réseaux de Capteurs** : Beacons BLE pour correction absolue
4. **Cartes Collaboratives** : Mise à jour temps réel par communauté
5. **Réalité Augmentée** : Overlay navigation sur caméra

### Portabilité

- **iOS/Android** : Code React Native multiplateforme
- **SDK Natif** : Kotlin/Swift pour intégration apps existantes
- **Web** : Version WebAssembly pour navigateurs
- **Embedded** : Port C++ pour hardware dédié

## 📞 Support et Documentation

### APIs Principales

```javascript
// Initialisation
await sdk.initialize(vectorMap);

// Contrôle tracking
await sdk.startTracking();
sdk.stopTracking();

// Configuration callbacks
sdk.setCallbacks({
  onPositionUpdate: (x, y, θ, mode) => {},
  onModeChanged: (mode, features) => {},
  onEnergyStatusChanged: (energyStatus) => {}
});

// Gestion position
sdk.resetPosition(x, y, z, θ);

// Monitoring
const state = sdk.getFullState();
const metrics = sdk.getPerformanceMetrics();
const debug = sdk.debug();
```

### Performance Monitoring

Le système fournit des métriques détaillées pour monitoring :

- **Temps de traitement** : Latence pipeline complet
- **Taux de mise à jour** : Fréquence effective capteurs
- **Niveau d'énergie** : État optimisation batterie
- **Confiance** : Qualité estimation position
- **Mode activité** : Classification temps réel
- **Innovations EKF** : Diagnostic fusion capteurs

---

**Développé pour la navigation sûre dans les catacombes de Paris** 🏴‍☠️
*Système PDR avancé - Sans GPS, maximum de précision* 