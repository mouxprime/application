# 🧭 Système de Suivi d'Attitude Continu

## Vue d'ensemble

Le système de suivi d'attitude continu remplace l'ancienne approche de calibration statique par un système sophistiqué qui maintient automatiquement l'orientation du téléphone par rapport au corps de l'utilisateur, même lors de changements d'orientation en cours de session.

## 🎯 Objectifs

1. **Suivi continu** : Maintenir un quaternion téléphone→monde en permanence
2. **Re-calibration automatique** : Détecter les moments de stabilité et re-calibrer automatiquement
3. **Fusion magnétomètre** : Utiliser le magnétomètre quand la confiance est élevée
4. **Compensation PDR/EKF** : Transformer toutes les données dans un repère corps stable

## 🏗️ Architecture

### Composants principaux

```
LocalizationService (Orchestrateur principal)
├── SensorManager (Capteurs IMU)
├── AttitudeService (Service d'attitude)
│   └── AttitudeTracker (Filtre Madgwick + logique)
├── PedestrianDeadReckoning (PDR avec compensation)
└── AdvancedEKF (EKF avec compensation)
```

### Flux de données

```
Capteurs IMU → AttitudeTracker → Transformation → PDR/EKF → Position finale
     ↓              ↓                ↓
   Contexte    Re-calibration    Données transformées
```

## 🔄 Algorithme Madgwick

### Principe
- **Filtre d'attitude AHRS** (Attitude and Heading Reference System)
- **Fusion gyroscope + accéléromètre** avec correction gravitationnelle
- **Intégration magnétomètre conditionnelle** selon la confiance

### Paramètres clés
```javascript
{
  beta: 0.1,                    // Gain du filtre (conservateur)
  stabilityAccThreshold: 0.2,   // Seuil variance accélération (m/s²)
  stabilityGyroThreshold: 0.1,  // Seuil magnitude gyroscope (rad/s)
  stabilityDuration: 2000,      // Durée stabilité requise (ms)
  magConfidenceThreshold: 0.7,  // Confiance magnétique minimum
  recalibrationInterval: 30000  // Intervalle minimum re-calibration (ms)
}
```

### Équations principales

**Dérivée quaternion (gyroscope):**
```
q̇ = 0.5 * q ⊗ [0, ωx, ωy, ωz]
```

**Correction gravitationnelle:**
```
f = [2(q1q3 - q0q2) - ax]
    [2(q0q1 + q2q3) - ay]
    [1 - 2(q1² + q2²) - az]
```

**Mise à jour quaternion:**
```
q(t+1) = q(t) + (q̇ - β∇f)Δt
```

## 🎯 Détection de Stabilité

### Critères de stabilité
1. **Variance accélération** < 0.2 m/s² sur 2 secondes
2. **Magnitude gyroscope** < 0.1 rad/s sur 2 secondes
3. **Durée minimale** : 2 secondes de stabilité continue

### Algorithme de détection
```javascript
// Calcul variance accélération sur fenêtre glissante
const accMagnitudes = samples.map(s => 
  Math.sqrt(s.acc.x² + s.acc.y² + s.acc.z²)
);
const variance = Σ(accMag - meanAcc)² / N;

// Calcul magnitude gyroscope moyenne  
const gyroMagnitude = mean(samples.map(s => 
  Math.sqrt(s.gyro.x² + s.gyro.y² + s.gyro.z²)
));

// Test de stabilité
const isStable = variance < 0.2 && gyroMagnitude < 0.1;
```

## 🧲 Fusion Magnétomètre

### Calcul de confiance
```javascript
// Stabilité de la norme du champ magnétique
const expectedNorm = 50; // µT (champ terrestre approximatif)
const normError = |meanNorm - expectedNorm|;
const stabilityScore = max(0, 1 - normVariance / 5.0);
const accuracyScore = max(0, 1 - normError / expectedNorm);
const confidence = min(stabilityScore * accuracyScore, 1.0);
```

### Utilisation conditionnelle
- **Confiance > 70%** : Utilisation active pour correction yaw
- **Confiance 40-70%** : Utilisation modérée  
- **Confiance < 40%** : Ignoré (perturbations magnétiques)

## 🔄 Re-calibration Automatique

### Conditions de déclenchement
1. **Stabilité détectée** pendant 2+ secondes
2. **Intervalle minimum** respecté (30s depuis dernière)
3. **Mode automatique** activé

### Processus de re-calibration
1. **Détection stabilité** → Démarrage OrientationCalibrator
2. **Collecte échantillons** (3 secondes, 30 échantillons minimum)
3. **Calcul nouvelle matrice** de rotation corps→téléphone
4. **Mise à jour contexte** et notification

### Sécurités
- **Timeout 10 secondes** maximum
- **Validation matrice** (déterminant ≈ 1.0)
- **Pas de re-calibration** si mouvement détecté

## 📊 Métriques et Surveillance

### Métriques de stabilité
```javascript
{
  isStable: boolean,
  stabilityDuration: number,      // ms
  accelerationVariance: number,   // m/s²
  gyroMagnitude: number          // rad/s
}
```

### Métriques magnétiques
```javascript
{
  confidence: number,            // 0-1
  recentSamples: Array,         // 50 derniers échantillons
  reference: Vector3           // Référence si confiance > 80%
}
```

### Métriques de performance
```javascript
{
  updateCount: number,
  avgUpdateInterval: number,     // ms
  lastProcessingTime: number,    // ms
  isTransforming: boolean
}
```

## 🛠️ Configuration et Tuning

### Paramètres ajustables

**Filtre Madgwick:**
```javascript
beta: 0.05-0.5    // Plus bas = plus conservateur
```

**Seuils de stabilité:**
```javascript
stabilityAccThreshold: 0.1-0.5    // m/s²
stabilityGyroThreshold: 0.05-0.2  // rad/s  
stabilityDuration: 1000-5000      // ms
```

**Re-calibration:**
```javascript
recalibrationInterval: 15000-60000  // ms
autoRecalibrationEnabled: boolean
```

### Recommandations d'usage

**Environnement calme:**
```javascript
beta: 0.05
stabilityAccThreshold: 0.1
stabilityGyroThreshold: 0.05
```

**Environnement dynamique:**
```javascript
beta: 0.15
stabilityAccThreshold: 0.3
stabilityGyroThreshold: 0.15
```

## 📱 Interface Utilisateur

### AttitudeMonitorScreen
- **Statut système** en temps réel
- **Quaternion** et matrices de rotation
- **Métriques de stabilité** et confiance magnétique
- **Contrôles** : Start/Stop, Re-calibration forcée, Reset
- **Configuration** : Auto-recalibration On/Off

### Indicateurs visuels
- 🟢 **Vert** : Système opérationnel, stable
- 🟠 **Orange** : En re-calibration, instable
- 🔴 **Rouge** : Erreur, capteurs non prêts
- 🔵 **Bleu** : Prêt pour re-calibration

## 🔍 Debug et Diagnostic

### Logs système
```
✅ LocalizationService démarré avec succès
🎯 Suivi d'attitude continu activé
🔄 Re-calibration automatique opérationnelle
📱 Stabilité DÉTECTÉE (variance: 0.156, gyro: 0.087)
🔄 Re-calibration automatique terminée
```

### Métriques critiques à surveiller
1. **Fréquence de re-calibration** (ne pas dépasser toutes les 15s)
2. **Taux de stabilité** (>60% du temps pour usage normal)
3. **Confiance magnétique** (>50% pour environnement normal)
4. **Temps de traitement** (<5ms par mise à jour)

## 📈 Améliorations vs Ancien Système

### Ancien système (statique)
- ❌ Calibration manuelle 1 fois
- ❌ Pas de compensation changements d'orientation
- ❌ Dégradation progressive de précision
- ❌ Erreurs cumulatives importantes

### Nouveau système (continu)
- ✅ **Re-calibration automatique** intelligente
- ✅ **Compensation temps réel** des changements d'orientation
- ✅ **Maintien de précision** sur longue durée
- ✅ **Fusion multi-capteurs** avec confiance
- ✅ **Métriques détaillées** pour supervision

## 🎛️ API d'utilisation

### Initialisation
```javascript
const localizationService = new LocalizationService(actions);
await localizationService.start();
```

### Configuration attitude
```javascript
localizationService.configureAttitude({
  autoRecalibration: true,
  stabilityThresholds: { acceleration: 0.2, gyroscope: 0.1 },
  filterGain: 0.1
});
```

### Re-calibration manuelle
```javascript
localizationService.forceAttitudeRecalibration();
```

### Statut système
```javascript
const status = localizationService.getSystemStatus();
console.log('Attitude stable:', status.attitude.isStable);
console.log('Confiance mag:', status.attitude.magneticConfidence);
```

## 🔬 Tests et Validation

### Scénarios de test
1. **Marche normale** - Téléphone en poche stable
2. **Changement d'orientation** - Rotation téléphone en poche
3. **Perturbations magnétiques** - Près d'objets métalliques
4. **Mouvement dynamique** - Course, escaliers
5. **Stabilité prolongée** - Assis, debout immobile

### Métriques de succès
- **Détection stabilité** : >95% de précision
- **Re-calibration** : <5s de délai après stabilité
- **Transformation de données** : Erreur < 5° sur orientation
- **Performance** : <50Hz traitement temps réel

Ce système constitue une évolution majeure vers un tracking d'attitude robuste et autonome, essentiel pour une localisation intérieure précise sur longue durée. 