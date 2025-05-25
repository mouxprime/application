# 📱 Calibration Unifiée - Guide Utilisateur

## Vue d'ensemble

La **Calibration Unifiée** combine la calibration manuelle des capteurs avec la calibration automatique d'orientation pour usage en poche en une seule expérience utilisateur fluide et intuitive.

## 🎯 Objectifs

- **Simplicité** : Une seule session de calibration pour tout configurer
- **Robustesse** : Adaptation automatique aux différents types de poches
- **Fiabilité** : Validation et gestion d'erreurs intégrées
- **Performance** : Optimisation pour un usage en conditions réelles

## 📋 Étapes de Calibration

### 1. **Préparation** (0%)
- Placez votre appareil sur une surface plane et stable
- Assurez-vous d'être dans un environnement calme
- Évitez les interférences magnétiques

### 2. **Accéléromètre** (0-25%)
- Gardez l'appareil immobile pendant 5 secondes
- Correction automatique des biais de l'accéléromètre
- Validation de la stabilité

### 3. **Gyroscope** (25-50%)
- Continuez à rester immobile
- Calibration des dérives du gyroscope
- Mesure de la stabilité angulaire

### 4. **Magnétomètre** (50-91.66%)
- Effectuez une rotation complète lente de l'appareil
- Compensation des interférences magnétiques locales
- Calibration du compas numérique

### 5. **Orientation Poche** (91.66-100%) ⭐ **NOUVEAU**
- Placez l'appareil dans votre poche
- Restez immobile pendant 2 secondes
- Calcul automatique de la matrice de rotation
- Adaptation à l'orientation spécifique de votre poche

### 6. **Terminé** (100%)
- Calibration complète réussie
- Système optimisé pour usage en poche
- Prêt pour la localisation

## 🔧 Fonctionnalités Avancées

### Gestion d'Erreurs Intelligente
- **Détection de mouvement** : Alerte si trop de mouvement pendant l'étape poche
- **Retry automatique** : Bouton "Recommencer Étape Pocket" en cas d'échec
- **Timeout de sécurité** : Protection contre les blocages (10s max)

### Feedback Temps Réel
- **Barre de progression** : Visualisation précise de l'avancement
- **Messages contextuels** : Instructions claires pour chaque étape
- **Indicateurs visuels** : Statut coloré pour chaque capteur

### Validation et Stockage
- **Matrice de rotation** : Sauvegarde automatique dans le contexte global
- **Validation mathématique** : Vérification du déterminant (≈ 1.0)
- **Horodatage** : Traçabilité de la calibration

## 🎮 Interface Utilisateur

### Éléments Visuels
```
┌─────────────────────────────────────┐
│ 📱 Calibration Complète             │
│ Cette calibration corrige vos       │
│ capteurs, puis adapte automatique-  │
│ ment l'orientation pour un usage    │
│ en poche.                           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ État de la calibration              │
│ ⚡ Accéléromètre  🔄 Gyroscope      │
│ 🧭 Magnétomètre  👛 Orientation     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Progression: ████████░░ 80%         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 👛 Orientation Poche                │
│ Placez l'appareil dans votre poche  │
│ et restez immobile 2 secondes       │
│                                     │
│ ⚠️ Trop de mouvement détecté.       │
│    Restez immobile dans votre poche │
│                                     │
│ [Recommencer Étape Pocket]          │
└─────────────────────────────────────┘
```

### Codes Couleur
- 🟢 **Vert (#00ff88)** : Étape terminée avec succès
- 🔵 **Bleu (#007bff)** : Information/Description
- 🟡 **Orange (#ffaa00)** : Conseils/Avertissements
- 🔴 **Rouge (#ff4444)** : Erreurs/Retry

## 🔄 API Unifiée

### LocalizationSDK.calibrateAll()
```javascript
const result = await localizationSDK.calibrateAll((callbackData) => {
  const { step, progress, message, pocketCalibration, error } = callbackData;
  
  if (step === 'sensors') {
    // Étapes capteurs (0-80%)
    updateSensorProgress(progress * 100);
  } else if (step === 'pocket') {
    // Étape orientation (80-100%)
    updatePocketProgress(progress * 100);
  } else if (step === 'complete') {
    // Terminé avec succès
    storePocketCalibration(pocketCalibration);
  }
});
```

### Intégration avec le Contexte
```javascript
// Stockage automatique de la matrice
actions.setPocketCalibrationMatrix(
  pocketCalibration.rotationMatrix, 
  pocketCalibration.avgGravity
);

// Utilisation lors du tracking
await localizationSDK.startTracking(
  state.pocketCalibration.rotationMatrix
);
```

## 🧪 Tests et Validation

### Tests E2E Inclus
- ✅ **Flux complet** : Calibration de bout en bout
- ✅ **Gestion d'erreurs** : Retry et recovery
- ✅ **Progression** : Validation des seuils
- ✅ **Interface** : Éléments visuels
- ✅ **Robustesse** : Conditions réelles

### Scénarios de Test
1. **Pocket Jean** : Mouvement modéré, orientation standard
2. **Pocket Veste** : Orientation différente, stabilité variable
3. **Conditions Difficiles** : Interférences, mouvement excessif

## 📊 Métriques de Performance

### Temps de Calibration
- **Capteurs** : ~15 secondes (3 étapes × 5s)
- **Orientation** : ~2 secondes
- **Total** : ~17 secondes maximum

### Seuils de Robustesse
- **gravityThreshold** : 0.5 m/s² (tolérance mouvement)
- **gyroMagnitude** : 0.1 rad/s (stabilité angulaire)
- **calibrationDuration** : 2000ms (durée échantillonnage)

### Taux de Réussite Attendu
- **Conditions idéales** : >95%
- **Conditions réelles** : >85%
- **Avec retry** : >98%

## 🎯 Avantages Utilisateur

### Avant (2 Calibrations Séparées)
```
1. Calibration manuelle capteurs (18s)
   ↓
2. Utilisation normale
   ↓
3. Problème orientation en poche
   ↓
4. Calibration orientation séparée (2s)
   ↓
5. Configuration manuelle
```

### Après (Calibration Unifiée)
```
1. Calibration complète unifiée (17s)
   ↓
2. Usage en poche immédiatement opérationnel
   ↓
3. Expérience fluide et transparente
```

## 🔮 Évolutions Futures

### Améliorations Prévues
- **Calibration adaptative** : Ajustement automatique selon l'usage
- **Profils multiples** : Différentes poches/orientations
- **Machine Learning** : Prédiction des paramètres optimaux
- **Calibration continue** : Affinement en arrière-plan

### Intégrations Possibles
- **Reconnaissance de contexte** : Détection automatique du type de poche
- **Partage de calibration** : Synchronisation entre appareils
- **Analytics** : Métriques d'usage et optimisation

---

## 📞 Support

Pour toute question ou problème avec la calibration unifiée :

1. **Vérifiez** que vous suivez bien les instructions de chaque étape
2. **Réessayez** la calibration dans un environnement plus stable
3. **Utilisez** le bouton "Recommencer Étape Pocket" en cas d'erreur
4. **Consultez** les logs de debug via `localizationSDK.debug()`

La calibration unifiée représente une évolution majeure vers une expérience utilisateur simplifiée et robuste pour la localisation en poche ! 🚀 