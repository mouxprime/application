# 📊 Système d'Exportation des Logs PDR

## Vue d'ensemble

Le système d'exportation des logs permet d'exporter toutes les données capteurs et décisions algorithme au format JSON pour une analyse approfondie du système PDR (Pedestrian Dead Reckoning).

## 🎯 Fonctionnalités

### Données Exportées

**Capteurs (à chaque timestamp):**
- **Accéléromètre**: x, y, z, magnitude
- **Gyroscope**: x, y, z, magnitude  
- **Magnétomètre**: x, y, z, magnitude, heading
- **Baromètre**: pression, altitude

**Algorithme (à chaque timestamp):**
- **PDR**: position, orientation, mode, stepCount, features
- **EKF**: état, covariance, confiance, ZUPT actif
- **AttitudeTracker**: quaternion, stabilité, confiance magnétique
- **SDK Global**: position, orientation, confiance, état tracking

### Types d'Export

1. **Session Courante**: Exporte les données de la session de tracking active
2. **Sessions Archivées**: Exporte une session précédemment enregistrée
3. **Export Contexte**: Exporte les données actuelles du contexte React

## 🚀 Utilisation

### Dans l'Application

1. **Aller dans l'onglet Analytics**
2. **Faire défiler jusqu'à la section "📊 Exportation des Logs"**
3. **Choisir le type d'export:**
   - **"Exporter Session Courante"**: Pour les données en cours
   - **"Exporter Session Archivée"**: Pour choisir une session passée

### Démarrage du Logging

Le logging démarre automatiquement quand vous lancez le tracking dans MapScreen:

```javascript
// Le logging commence automatiquement
await localizationSDK.startTracking();

// Le logging s'arrête automatiquement  
localizationSDK.stopTracking();
```

## 📋 Structure du Fichier JSON Exporté

```json
{
  "sessionId": "session_timestamp",
  "startTime": "ISO_timestamp",
  "endTime": "ISO_timestamp",
  "duration": "milliseconds",
  "totalEntries": "number",
  
  "logs": [
    {
      "timestamp": "absolute_timestamp",
      "relativeTime": "time_since_start_ms",
      
      "sensors": {
        "accelerometer": { "x": 0.12, "y": 9.81, "z": 0.05, "magnitude": 9.82 },
        "gyroscope": { "x": 0.001, "y": -0.002, "z": 0.003, "magnitude": 0.0037 },
        "magnetometer": { "x": 25.4, "y": -12.8, "z": 45.2, "magnitude": 52.1, "heading": 315.2 },
        "barometer": { "pressure": 1013.25, "altitude": 150.5 }
      },
      
      "algorithm": {
        "pdr": {
          "position": { "x": 0.0, "y": 0.0, "z": 0.0 },
          "orientation": { "theta": 0.0, "pitch": 0.0, "roll": 0.0 },
          "mode": "stationary|walking|running",
          "stepCount": 0,
          "features": { "variance": 0.02, "peakCount": 0, "zeroCrossings": 1 }
        },
        "ekf": {
          "state": [x, y, z, vx, vy, vz],
          "covariance": "6x6_matrix",
          "confidence": 0.95,
          "zuptActive": true
        },
        "attitude": {
          "quaternion": [w, x, y, z],
          "isStable": true,
          "magneticConfidence": 0.85
        },
        "sdk": {
          "position": { "x": 0.0, "y": 0.0, "z": 0.0 },
          "confidence": 0.95,
          "isTracking": true
        }
      }
    }
  ],
  
  "statistics": {
    "totalLogs": 330,
    "stepCount": 45,
    "distance": 32.5,
    "modes": { "stationary": 120, "walking": 180, "running": 30 },
    "sensorRanges": { "min/max/avg pour chaque capteur" }
  },
  
  "exportMetadata": {
    "exportDate": "timestamp_export",
    "analyticsData": "métriques_calculées",
    "trajectoryData": "points_trajectoire",
    "systemInfo": "infos_plateforme"
  },
  
  "analysisReady": {
    "sensorDataPoints": 330,
    "timeRange": "330.0s",
    "dataQuality": {
      "score": 92,
      "issues": ["Données de bonne qualité"],
      "sensorCoverage": 98.5,
      "algorithmCoverage": 100.0,
      "sampleRate": 1.0
    }
  }
}
```

## 🔍 Analyse des Données

### Qualité des Données

Le système évalue automatiquement la qualité des données exportées:

- **Score de qualité** (0-100)
- **Couverture capteurs** (% d'entrées avec données capteurs complètes)
- **Couverture algorithme** (% d'entrées avec données algorithme)
- **Fréquence d'échantillonnage** (Hz)
- **Issues détectées** (liste des problèmes trouvés)

### Synchronisation Temporelle

Tous les événements sont synchronisés avec:
- **timestamp**: Temps absolu (Unix timestamp)
- **relativeTime**: Temps relatif depuis le début de session (ms)

### Corrélation Capteurs-Algorithme

Chaque entrée contient à la fois:
- Les **données brutes des capteurs** au temps T
- Les **décisions de l'algorithme** au même temps T
- Permettant une analyse complète des corrélations

## 🛠️ Utilisation pour le Débogage

### Détection d'Anomalies

Le fichier exporté permet d'identifier:

1. **Problèmes de capteurs:**
   - Valeurs aberrantes
   - Interruptions de données
   - Dérive des capteurs

2. **Problèmes d'algorithme:**
   - Mauvaises détections de pas
   - Erreurs de mode (stationnaire/marche)
   - Perte de confiance EKF
   - Instabilité d'attitude

3. **Problèmes de synchronisation:**
   - Décalages temporels
   - Fréquence d'échantillonnage irrégulière

### Analyse Recommandée

1. **Vérifier la qualité globale** (`analysisReady.dataQuality`)
2. **Analyser les modes de déplacement** (`algorithm.pdr.mode`)
3. **Suivre l'évolution de la confiance** (`algorithm.ekf.confidence`)
4. **Corréler les pics d'accélération avec la détection de pas**
5. **Vérifier la stabilité magnétique** (`algorithm.attitude.magneticConfidence`)

## 📱 Partage et Stockage

### Formats Supportés
- **JSON**: Format principal avec toutes les métadonnées
- **Partage direct**: Via l'API de partage native du téléphone
- **Sauvegarde locale**: Dans le répertoire documents de l'app

### Taille des Fichiers
- **~1KB par seconde** de données à 1Hz
- **~60KB par minute** de tracking
- **Compression automatique** des données répétitives

## 🔧 Configuration

### Paramètres de Logging

```javascript
const localizationSDK = new LocalizationSDK({
  logging: {
    enabled: true,              // Activer le logging
    logInterval: 1000,          // Intervalle en ms (1 seconde)
    enableConsole: false,       // Logs console (debug)
    maxLogFiles: 20,           // Nombre max de sessions
    maxEntriesPerSession: 1000  // Limite d'entrées par session
  }
});
```

### Gestion de la Mémoire

- **Buffer circulaire** pour éviter la surcharge mémoire
- **Nettoyage automatique** des anciennes sessions
- **Limite configurable** du nombre d'entrées par session

## 🚨 Résolution de Problèmes

### Pas de Données à Exporter
- Vérifier que le tracking a été démarré
- S'assurer qu'il y a eu des données capteurs
- Vérifier les permissions de l'application

### Fichier Vide ou Incomplet
- Vérifier la durée de la session de tracking
- S'assurer que les capteurs fonctionnent
- Vérifier les logs de l'application

### Erreur de Partage
- Vérifier les permissions de stockage
- S'assurer qu'une app de partage est disponible
- Essayer l'export d'une session plus petite

## 📈 Exemples d'Analyse

### Détection de Problème de Pas

```javascript
// Analyser les détections de pas manquées
const walkingPeriods = logs.filter(log => log.algorithm.pdr.mode === 'walking');
const stepsDetected = walkingPeriods.filter(log => log.algorithm.pdr.stepCount > 0);
const detectionRate = stepsDetected.length / walkingPeriods.length;

if (detectionRate < 0.5) {
  console.log('⚠️ Problème de détection de pas détecté');
}
```

### Analyse de Dérive Magnétique

```javascript
// Vérifier la stabilité du magnétomètre
const magneticConfidence = logs.map(log => log.algorithm.attitude.magneticConfidence);
const avgConfidence = magneticConfidence.reduce((a, b) => a + b) / magneticConfidence.length;

if (avgConfidence < 0.5) {
  console.log('⚠️ Interférences magnétiques détectées');
}
```

Ce système d'exportation fournit tous les outils nécessaires pour un débogage approfondi et une analyse complète du système PDR. 