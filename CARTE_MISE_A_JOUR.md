# Mise à jour de la Page Carte

## Nouvelles Fonctionnalités Implémentées

### 🗺️ **Grande Grille Noire**
- Fond de carte entièrement noir avec grille de référence
- Grille dynamique qui s'adapte au niveau de zoom
- Cellules de 100 unités avec lignes semi-transparentes (#333333)

### 📍 **Position de Départ**
- Point de départ par défaut à (0, 0) comme demandé
- Réinitialisation possible vers l'origine via le bouton refresh

### 📏 **Dimensions et Zoom**
- **Dimension totale de la carte** : 14629 x 13764 unités
- **Zoom minimum** : x1
- **Zoom maximum** : x15
- Navigation fluide avec gestes de panoramique (pan)

### 🟢 **Tracé Vert Fluo**
- Trajectoire affichée en **vert fluo (#00ff00)**
- Rendu sous forme de `<Path>` SVG continu
- Épaisseur de trait : 3px avec opacité 0.9

### 🔋 **Batterie du Téléphone**
- Intégration de l'API `expo-battery`
- Affichage en temps réel du niveau de batterie
- Icône dynamique selon le niveau :
  - `battery-full` (>75%)
  - `battery-half` (>50%)
  - `battery-dead` (<25%)
- Couleurs adaptatives :
  - Vert (#00ff88) : >50%
  - Orange (#ffaa00) : 25-50%
  - Rouge (#ff4444) : <25%

### 📊 **Métriques PDR en Temps Réel**
Les métriques s'actualisent automatiquement toutes les secondes :

#### **Position et Orientation**
- Position (X, Y) avec précision 0.1
- Orientation en degrés

#### **Métriques PDR**
- **Mode d'activité** : STATIONNAIRE/MARCHE/COURSE/RAMPER
- **Nombre de pas** : Compteur en temps réel
- **Distance parcourue** : En mètres (précision 0.1m)

#### **Métriques Techniques**
- **Niveau de confiance** : Pourcentage de fiabilité
- **Zoom actuel** : Niveau de zoom (x1 à x15)
- **Batterie** : Pourcentage avec icône

## 🎮 **Contrôles**

### Boutons de Contrôle
1. **Play/Pause** : Démarrage/arrêt du tracking
2. **Refresh** : Réinitialisation à la position (0,0)
3. **Zoom Out (-)** : Diminuer le zoom
4. **Zoom In (+)** : Augmenter le zoom

### Gestes Tactiles
- **Pan (glisser)** : Navigation sur la carte
- **Pinch-to-zoom** : Zoom gestuel (à implémenter si souhaité)

## 🔧 **Améliorations Techniques**

### Architecture
- Séparation claire entre la logique de carte et les métriques
- Gestion d'état optimisée avec le contexte de localisation
- Mise à jour périodique automatique des données

### Performance
- Rendu SVG optimisé avec grille adaptative
- Calculs de conversion monde→écran efficaces
- Gestion mémoire avec limitation de la trajectoire

### Interface Utilisateur
- Design sombre cohérent avec le thème de l'application
- Métriques organisées en grille lisible
- Couleurs contrastées pour une meilleure visibilité

## 📦 **Dépendances Ajoutées**

```json
{
  "expo-battery": "~9.1.4"
}
```

## 🚀 **Utilisation**

1. L'utilisateur démarre à la position (0, 0)
2. Les métriques PDR s'activent automatiquement
3. La trajectoire est tracée en vert fluo en temps réel
4. La batterie du téléphone est surveillée en permanence
5. Le zoom permet d'explorer de x1 à x15
6. Navigation libre avec les gestes de pan

## 📈 **Métriques Disponibles**

### En Permanence Visibles
- Position XY en temps réel
- Orientation (degrés)
- Mode d'activité PDR
- Nombre de pas
- Niveau de confiance
- Distance parcourue
- Niveau de batterie du téléphone
- Zoom actuel

### Mises à Jour
- **Position/Trajectoire** : En temps réel (dépend du taux d'échantillonnage)
- **Métriques PDR** : Toutes les 1 seconde
- **Batterie** : Toutes les 30 secondes 