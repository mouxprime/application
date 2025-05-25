# KTApp - Application Mobile React Native

Une application mobile moderne construite avec React Native et Expo, compatible iOS et Android.

## 📱 Aperçu

KTApp est une application mobile élégante avec une interface utilisateur moderne offrant :
- 🏠 **Écran d'accueil** avec actions rapides et contenu récent
- 🔍 **Exploration** avec recherche et catégories
- 👤 **Profil utilisateur** avec statistiques et succès
- ⚙️ **Paramètres** complets de l'application

## 🚀 Technologies utilisées

- **React Native** - Framework de développement mobile
- **Expo** - Plateforme de développement et déploiement
- **React Navigation** - Navigation entre écrans
- **Expo Vector Icons** - Bibliothèque d'icônes
- **Safe Area Context** - Gestion des zones sécurisées

## 📋 Prérequis

- Node.js (version 16 ou supérieure)
- npm ou yarn
- Expo CLI
- Application Expo Go sur votre téléphone (pour les tests)

## 🛠️ Installation

1. **Cloner le projet** (déjà fait)
   ```bash
   cd KTApp
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Démarrer le serveur de développement**
   ```bash
   npm start
   ```

## 📱 Lancement de l'application

### Sur simulateur/émulateur
```bash
# iOS (nécessite macOS et Xcode)
npm run ios

# Android (nécessite Android Studio)
npm run android
```

### Sur appareil physique
1. Installer l'application **Expo Go** depuis l'App Store ou Google Play
2. Scanner le QR code affiché dans le terminal
3. L'application se lancera automatiquement

### Sur navigateur web
```bash
npm run web
```

## 📂 Structure du projet

```
KTApp/
├── App.js                 # Point d'entrée principal
├── app.json              # Configuration Expo
├── package.json          # Dépendances et scripts
├── src/
│   ├── navigation/
│   │   └── MainNavigator.js    # Navigation principale
│   └── screens/
│       ├── HomeScreen.js       # Écran d'accueil
│       ├── ExploreScreen.js    # Écran d'exploration
│       ├── ProfileScreen.js    # Écran de profil
│       └── SettingsScreen.js   # Écran des paramètres
└── assets/               # Images et ressources
```

## 🎨 Fonctionnalités

### 🏠 Écran d'accueil
- Message de bienvenue personnalisé
- Actions rapides (Scanner, Favoris, Historique, Partager)
- Liste des articles récents
- Suggestions et astuces

### 🔍 Écran Explorer
- Barre de recherche interactive
- Catégories colorées avec compteurs
- Articles tendances avec métadonnées
- Recommandations personnalisées

### 👤 Écran Profil
- Avatar utilisateur modifiable
- Statistiques d'usage
- Système de succès/achievements
- Menu d'options du compte

### ⚙️ Écran Paramètres
- Notifications activables/désactivables
- Mode sombre
- Paramètres de contenu
- Options de langue et région
- Confidentialité et support
- Informations sur l'application

## 🎯 Scripts disponibles

- `npm start` - Démarrer le serveur de développement
- `npm run android` - Lancer sur Android
- `npm run ios` - Lancer sur iOS (macOS uniquement)
- `npm run web` - Lancer dans le navigateur

## 📱 Compatibilité

- ✅ **iOS** 11.0+
- ✅ **Android** API 21+ (Android 5.0+)
- ✅ **Web** (navigateurs modernes)

## 🎨 Design System

L'application utilise un design system cohérent avec :
- **Couleurs principales** : Bleu (#007AFF), couleurs d'accent variées
- **Typographie** : San Francisco (iOS) / Roboto (Android)
- **Composants** : Cards avec ombres, icônes Ionicons
- **Navigation** : Tab bar en bas avec 4 onglets

## 🔧 Personnalisation

Pour personnaliser l'application :

1. **Modifier les couleurs** dans les fichiers de style
2. **Ajouter des écrans** dans `src/screens/`
3. **Modifier la navigation** dans `src/navigation/MainNavigator.js`
4. **Changer l'icône** dans `assets/` et mettre à jour `app.json`

## 📖 Développement

### Ajouter un nouvel écran

1. Créer le fichier dans `src/screens/NouveauScreen.js`
2. Importer et ajouter dans `MainNavigator.js`
3. Configurer l'icône et le nom d'onglet

### Structure d'un écran type
```javascript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NouveauScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text>Nouveau contenu</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
});
```

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Fork le projet
2. Créer une branche pour votre fonctionnalité
3. Commit vos changements
4. Push vers la branche
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT - voir le fichier LICENSE pour plus de détails.

## 👥 Équipe

Développé avec ❤️ par l'équipe KT

---

Pour toute question ou support, n'hésitez pas à nous contacter !

# 🗺️ Système de Localisation Intérieure Avancé

Une application React Native sophistiquée utilisant des algorithmes de fusion de capteurs et des cartes vectorielles pour la localisation précise dans des environnements confinés sans GPS, optimisée pour des lieux comme les catacombes de Paris.

## 🎯 Fonctionnalités Principales

### 🧭 Localisation de Précision
- **Filtre de Kalman Étendu (EKF)** avec fusion de capteurs IMU
- **Estimation de pose en temps réel** [x, y, θ] avec niveau de confiance
- **Compensation automatique de la gravité** et correction de dérive
- **Fréquence de mise à jour configurable** jusqu'à 50Hz

### 🗺️ Cartographie Vectorielle
- **Support de cartes vectorielles haute résolution** avec murs, tunnels et landmarks
- **Cartes prédéfinies** pour catacombes, tunnels de métro et grottes
- **Système de coordonnées métrique** avec conversion écran/monde
- **Indexation spatiale** pour recherche rapide de landmarks

### 📱 Interface Utilisateur Moderne
- **Visualisation temps réel** de la position sur carte SVG
- **Historique de trajectoire** avec points de confiance
- **Graphiques de capteurs** avec données IMU en direct
- **Système de calibration guidé** avec assistant interactif

### 📊 Analyse de Performance
- **Métriques de précision** et statistiques de mouvement
- **Distribution de confiance** avec graphiques temporels
- **Exportation de données** pour analyse post-traitement
- **Indicateurs de qualité** du signal en temps réel

## 🏗️ Architecture Technique

### 🧮 Algorithmes de Localisation

#### Filtre de Kalman Étendu
```javascript
// État du système: [x, y, θ, vx, vy, ω]
const state = [
  position_x,     // Position X en mètres
  position_y,     // Position Y en mètres
  orientation,    // Orientation θ en radians
  velocity_x,     // Vitesse X en m/s
  velocity_y,     // Vitesse Y en m/s
  angular_vel     // Vitesse angulaire ω en rad/s
];
```

#### Fusion de Capteurs
- **Accéléromètre**: Estimation de l'accélération avec compensation gravitationnelle
- **Gyroscope**: Mesure de la vitesse angulaire pour l'orientation
- **Magnétomètre**: Référence absolue d'orientation (correction de dérive)

### 🗺️ Système de Cartes

#### Format de Carte Vectorielle
```javascript
const mapData = {
  name: "Catacombes de Paris - Section XIV",
  scale: 100,  // pixels par mètre
  bounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 },
  
  // Structures physiques
  walls: [
    { type: 'wall', points: [[-20, -40], [-20, 40]] },
    { type: 'pillar', center: [0, 0], radius: 2 }
  ],
  
  // Passages navigables
  tunnels: [
    { 
      id: 'main_tunnel',
      points: [[-18, -38], [-18, 38], [18, 38], [18, -38]],
      width: 3.6
    }
  ],
  
  // Points de repère
  landmarks: [
    {
      id: 'entrance',
      type: 'entrance',
      position: [0, -38],
      name: 'Entrée principale'
    }
  ]
};
```

### 📡 Gestionnaire de Capteurs

#### Configuration IMU
```javascript
const sensorConfig = {
  updateInterval: 20,        // 50Hz
  smoothingFactor: 0.8,      // Filtre exponentiel
  calibrationSamples: 100,   // Échantillons pour calibration
  accelerometerNoise: 0.1,   // Bruit accéléromètre
  gyroscopeNoise: 0.05,      // Bruit gyroscope
  magnetometerNoise: 0.2     // Bruit magnétomètre
};
```

## 🚀 Installation et Utilisation

### Prérequis
```bash
# Outils requis
- Node.js (v16+)
- npm ou yarn
- Expo CLI
- Expo Go (pour test sur device)
```

### Installation
```bash
# Cloner le projet
git clone <repository-url>
cd indoor-localization-app

# Installer les dépendances
npm install

# Démarrer Expo
npm start
```

### Configuration des Capteurs
```bash
# Dépendances capteurs installées
expo install expo-sensors expo-location
```

## 📱 Utilisation de l'Application

### 1. 🗺️ Écran Carte
- **Visualisation temps réel** de votre position
- **Interaction avec landmarks** (tap pour informations)
- **Contrôles de navigation** (zoom, réinitialisation)
- **Indicateur de confiance** visuel

### 2. 📊 Écran Capteurs
- **Graphiques temps réel** des données IMU
- **Métriques dérivées** (magnitude, orientation)
- **Historique des mesures** avec filtrage
- **Indicateur de qualité** du signal

### 3. 🎯 Écran Calibration
- **Assistant de calibration guidé** étape par étape
- **Validation en temps réel** des capteurs
- **Conseils d'optimisation** pour meilleure précision
- **Réinitialisation sélective** des offsets

### 4. 📈 Écran Analytique
- **Métriques de performance** (distance, vitesse, précision)
- **Graphiques de confiance** temporels
- **Distribution de précision** avec statistiques
- **Exportation de données** pour analyse

## ⚙️ Configuration Avancée

### Paramètres du Filtre de Kalman
```javascript
const kalmanConfig = {
  processNoise: 0.1,           // Bruit de processus
  measurementNoise: 0.5,       // Bruit de mesure
  initialUncertainty: 10.0,    // Incertitude initiale
  accelerometerNoise: 0.1,     // Variance accéléromètre
  gyroscopeNoise: 0.05,        // Variance gyroscope
  magnetometerNoise: 0.2       // Variance magnétomètre
};
```

### Optimisation des Performances
```javascript
const performanceSettings = {
  updateRate: 50,                    // Hz (max recommandé: 50)
  trajectoryMaxLength: 1000,         // Points max en mémoire
  deadReckoningThreshold: 0.05,      // m/s² seuil de mouvement
  headingSmoothing: 0.9,             // Lissage orientation
  landmarkDetectionRadius: 5         // Mètres
};
```

## 🎛️ API et Intégration

### Contexte de Localisation
```javascript
import { useLocalization } from './src/context/LocalizationContext';

function MyComponent() {
  const { state, actions } = useLocalization();
  
  // État actuel
  const currentPose = state.pose;  // {x, y, theta, confidence}
  const trajectory = state.trajectory;
  const isTracking = state.isTracking;
  
  // Actions disponibles
  actions.updatePose(newPose);
  actions.setTracking(true);
  actions.loadVectorMap(mapData);
  actions.resetTrajectory();
}
```

### Gestionnaire de Capteurs
```javascript
import { SensorManager } from './src/sensors/SensorManager';

const sensorManager = new SensorManager();

// Initialisation
await sensorManager.initialize();

// Démarrage
await sensorManager.startAll();

// Calibration
await sensorManager.startCalibration((progress) => {
  console.log(`Calibration: ${progress * 100}%`);
});

// Données en temps réel
const data = sensorManager.getLatestData();
```

### Gestionnaire de Cartes
```javascript
import { VectorMapManager } from './src/maps/VectorMapManager';

const mapManager = new VectorMapManager();

// Chargement de carte
await mapManager.loadMap('catacombes_paris');

// Recherche de landmarks
const nearbyLandmarks = mapManager.findNearbyLandmarks(
  currentPosition, 
  5 // rayon en mètres
);

// Conversion de coordonnées
const screenPos = mapManager.worldToScreen(worldPos, screenDimensions);
```

## 🔬 Algorithmes et Mathématiques

### Modèle de Mouvement (EKF)
```
État: x = [px, py, θ, vx, vy, ω]ᵀ

Prédiction:
px' = px + vx·dt·cos(θ) - vy·dt·sin(θ)
py' = py + vx·dt·sin(θ) + vy·dt·cos(θ)
θ'  = θ + ω·dt

Matrice jacobienne F pour linéarisation
```

### Compensation Gravitationnelle
```javascript
// Estimation d'inclinaison
const roll = Math.atan2(ay, az);
const pitch = Math.atan2(-ax, Math.sqrt(ay² + az²));

// Compensation
const ax_compensated = ax + 9.81 * Math.sin(pitch);
const ay_compensated = ay - 9.81 * Math.sin(roll) * Math.cos(pitch);
```

### Fusion Magnétométrique
```javascript
// Orientation absolue
const heading = Math.atan2(magnetometer.y, magnetometer.x);

// Correction de déclinaison magnétique
const correctedHeading = heading + magneticDeclination;
```

## 🧪 Tests et Validation

### Environnements de Test Recommandés
- **Catacombes simulées**: Tunnels étroits avec piliers
- **Couloirs d'immeuble**: Environnements rectangulaires
- **Sous-sols**: Espaces irréguliers avec obstacles
- **Parkings souterrains**: Grandes surfaces avec colonnes

### Métriques de Performance
- **Précision de position**: Erreur moyenne < 2m
- **Latence de mise à jour**: < 20ms
- **Dérive angulaire**: < 5°/minute sans magnétomètre
- **Consommation CPU**: < 15% sur mobile

## 🛠️ Développement et Extension

### Ajout de Nouvelles Cartes
```javascript
// Dans VectorMapManager.js
generateCustomMap() {
  return {
    name: 'Ma Carte Personnalisée',
    description: 'Description de l\'environnement',
    scale: 100,
    walls: [...],
    tunnels: [...],
    landmarks: [...]
  };
}
```

### Algorithmes de Localisation Personnalisés
```javascript
// Extension du filtre de Kalman
class CustomLocalizationFilter extends ExtendedKalmanFilter {
  constructor(config) {
    super(config);
    // Ajout de fonctionnalités spécifiques
  }
  
  customUpdate(measurement) {
    // Logique de mise à jour personnalisée
  }
}
```

## 📋 Limitations et Considérations

### Limitations Techniques
- **Dérive inertielle**: Accumulation d'erreurs sans correction externe
- **Interférences magnétiques**: Affectent l'orientation absolue
- **Calibration requise**: Nécessaire à chaque redémarrage
- **Consommation énergétique**: Capteurs actifs en continu

### Optimisations Futures
- **Correction par landmarks visuels** (computer vision)
- **Triangulation Wi-Fi/Bluetooth** pour correction de position
- **Machine learning** pour améliorer la prédiction de mouvement
- **Fusion multi-capteurs avancée** (barométre, LiDAR)

## 📊 Spécifications Techniques

### Exigences Matérielles
- **IMU 6-DOF minimum** (accéléromètre + gyroscope)
- **Magnétomètre 3-axes** (recommandé)
- **CPU**: ARM ou x86 avec support virgule flottante
- **RAM**: 2GB minimum, 4GB recommandé
- **Stockage**: 100MB pour l'application + cartes

### Formats de Données Supportés
- **Cartes**: JSON vectoriel personnalisé
- **Export**: JSON, CSV pour trajectoires
- **Import**: GeoJSON (avec convertisseur)

## 🤝 Contribution et Support

### Comment Contribuer
1. **Fork** le repository
2. **Créer une branche** pour votre fonctionnalité
3. **Commiter** vos changements
4. **Soumettre une Pull Request**

### Signalement de Bugs
- **Template d'issue** avec logs et environnement
- **Reproduction steps** détaillées
- **Données de test** si nécessaire

### Support Technique
- **Documentation API** complète
- **Exemples d'intégration** fournis
- **Forum communautaire** pour discussions

---

## 🏆 Cas d'Usage Spécialisés

### Catacombes de Paris
- **Navigation souterraine** avec carte détaillée
- **Points d'intérêt historiques** géolocalisés
- **Zones de sécurité** marquées
- **Itinéraires recommandés**

### Urgences et Secours
- **Localisation d'équipes** de secours
- **Évacuation d'urgence** avec guidage
- **Cartographie rapide** d'environnements inconnus
- **Communication de position** précise

### Recherche et Exploration
- **Cartographie collaborative** en temps réel
- **Annotation de découvertes** géolocalisées
- **Analyse de parcours** et patterns de mouvement
- **Documentation scientifique** avec coordonnées

---

**Développé avec ❤️ pour la communauté de la localisation intérieure**

Version: 1.0.0 | React Native + Expo | Compatible iOS/Android 