# Adaptation du Système de Localisation pour Usage en Poche

## 🎯 **Objectif**
Adapter le système de localisation intérieure pour fonctionner de manière fiable lorsque le téléphone est dans la poche de l'utilisateur, en neutralisant l'orientation variable du dispositif.

## 🔧 **Modifications Implémentées**

### 1. **Neutralisation de l'Orientation du Téléphone**

#### **OrientationCalibrator.js** (Nouveau module)
- **Calibration automatique** : Phase d'étalonnage de 2 secondes au démarrage
- **Matrice de rotation** : Calcul automatique pour transformer le repère téléphone vers un repère corps stable
- **Algorithme de Rodrigues** : Rotation basée sur la gravité mesurée vs gravité cible
- **Validation de stabilité** : Vérification que l'utilisateur reste immobile pendant la calibration

```javascript
// Transformation automatique des données capteurs
const transformedAcc = orientationCalibrator.transformAcceleration(accelerometer);
const transformedGyro = orientationCalibrator.transformGyroscope(gyroscope);
```

#### **Intégration dans PedestrianDeadReckoning.js**
- **Calibration automatique** au démarrage via `startPocketCalibration()`
- **Transformation continue** de tous les vecteurs d'accélération et gyroscope
- **Callbacks de progression** pour informer l'utilisateur

### 2. **Détection Basée sur la Magnitude**

#### **Modification de la Détection de Pas**
```javascript
// AVANT : Basé sur l'axe Z du téléphone
const verticalAcc = recentData.map(d => d.z);

// APRÈS : Basé sur la magnitude totale (indépendant de l'orientation)
const magnitudeAcc = recentData.map(d => d.magnitude);
```

#### **Avantages**
- **Indépendant de l'orientation** : Fonctionne quelle que soit la position du téléphone
- **Plus robuste** : Moins sensible aux variations d'angle
- **Magnitude = √(ax² + ay² + az²)** : Capture le mouvement total

### 3. **Ajustement des Seuils pour Environnement Poche**

#### **Seuils Augmentés**
```javascript
// Paramètres adaptés pour poche
stepDetectionWindow: 30,     // 20 → 30 échantillons (fenêtre plus large)
stepThreshold: 1.8,          // 1.5 → 1.8 m/s² (seuil plus élevé)
crawlThreshold: 1.0,         // 0.8 → 1.0 m/s² (seuil plus élevé)
zuptDuration: 300,           // 200 → 300ms (ZUPT plus long)
```

#### **Justification**
- **Bruit de frottement** : La poche ajoute du bruit parasite
- **Micro-mouvements** : Éviter les faux positifs dus aux mouvements de tissu
- **Stabilité accrue** : Fenêtre plus large pour lisser le signal

### 4. **Classification d'Activité Indifférente à l'Angle**

#### **Nouveau Modèle de Classification**
```javascript
// AVANT : Dépendant de l'inclinaison du téléphone
if (Math.abs(devicePitch) > 30° && variance < threshold) {
  mode = 'crawling';
}

// APRÈS : Basé uniquement sur variance et fréquence
if (variance >= 0.3 && variance < 0.8 && stepFrequency < 1.0) {
  mode = 'crawling';  // Variance modérée + fréquence faible
}
```

#### **Arbre de Décision Retravaillé**
- **Stationnaire** : `variance < 0.3` (plus strict)
- **Crawling** : `0.3 ≤ variance < 0.8` ET `stepFrequency < 1.0 Hz`
- **Walking** : `1.0 ≤ stepFrequency < 2.5 Hz`
- **Running** : `stepFrequency ≥ 2.5 Hz`

### 5. **EKF Étendu avec Roll/Pitch**

#### **État Étendu (11 → 13 dimensions)**
```javascript
// État EKF étendu : [x, y, z, vx, vy, vz, θ, roll, pitch, ωz, bias_acc_x, bias_acc_y, bias_gyro_z]
this.state = math.matrix([
  [0], [0], [0],           // position (x, y, z)
  [0], [0], [0],           // vitesse (vx, vy, vz)
  [0], [0], [0],           // orientation (yaw, roll, pitch)
  [0],                     // vitesse angulaire (ωz)
  [0], [0], [0]            // biais capteurs
]);
```

#### **Confiance Intégrant Roll/Pitch**
```javascript
// Calcul de confiance avec incertitudes d'orientation
const totalUncertainty = positionUncertainty +         // Position (poids 1.0)
                         yawUncertainty +               // Yaw (poids 1.0)
                         rollUncertainty * 0.5 +        // Roll (poids 0.5)
                         pitchUncertainty * 0.5;        // Pitch (poids 0.5)

confidence = 1 / (1 + totalUncertainty);
```

### 6. **Pipeline de Traitement Adapté**

#### **Séquence d'Exécution**
1. **Calibration automatique** (2s au démarrage)
2. **Transformation des capteurs** (rotation compensation)
3. **Détection basée sur magnitude** (peaks sur magnitude totale)
4. **Classification simplifiée** (sans dépendance à l'angle)
5. **Fusion EKF** (avec roll/pitch dans incertitudes)
6. **Map-matching & ZUPT** (300ms de durée)

## 📊 **Améliorations de Performance**

### **Robustesse**
- ✅ **Indépendant de l'orientation** du téléphone
- ✅ **Moins de faux positifs** grâce aux seuils adaptés
- ✅ **Calibration automatique** sans intervention utilisateur

### **Précision**
- ✅ **Confiance plus réaliste** intégrant l'incertitude d'orientation
- ✅ **ZUPT renforcé** pour éviter la dérive
- ✅ **Classification plus stable** basée sur des métriques temporelles

### **Facilité d'Usage**
- ✅ **Calibration transparente** (2 secondes au démarrage)
- ✅ **Pas de contrainte de position** du téléphone
- ✅ **Callbacks de progression** pour informer l'utilisateur

## 🔄 **Intégration dans l'Application**

### **Démarrage Automatique**
```javascript
// Le SDK démarre automatiquement la calibration
await localizationSDK.startTracking();
// → Calibration automatique pendant 2s
// → Transformation continue des données
// → Détection basée sur magnitude
```

### **Callbacks de Calibration**
```javascript
localizationSDK.setCallbacks({
  onCalibrationRequired: ({ progress, message, isCalibrating }) => {
    if (isCalibrating) {
      showCalibrationProgress(progress, message);
    }
  }
});
```

## 🎯 **Résultats Attendus**

1. **Fonctionnement fiable** en poche sans contrainte d'orientation
2. **Réduction des erreurs** de classification d'activité
3. **Amélioration de la confiance** grâce à l'intégration roll/pitch
4. **Expérience utilisateur simplifiée** avec calibration automatique
5. **Stabilité accrue** du système de localisation

## 🔧 **Configuration Recommandée**

```javascript
const localizationSDK = new LocalizationSDK({
  userHeight: 1.7,
  adaptiveSampling: true,
  energyOptimization: true,
  positionUpdateRate: 1.0,
  
  // Configuration spécifique poche
  pdr: {
    stepDetectionWindow: 30,
    stepThreshold: 1.8,
    crawlThreshold: 1.0,
    zuptDuration: 300
  }
});
```

Cette adaptation permet au système de localisation de fonctionner de manière robuste et précise même lorsque le téléphone est dans la poche, éliminant les contraintes d'orientation et améliorant significativement l'expérience utilisateur. 