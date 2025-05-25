# Corrections Détection de Pas - Algorithme PDR

## Problèmes Identifiés et Corrigés

### 1. ❌ **Seuil Fixe Inadapté**
**Problème :** Seuil statique de 1.0 m/s² comparé directement aux magnitudes brutes
- **Cause :** Pas de calcul de moyenne locale, seuil non adaptatif aux conditions
- **Impact :** Fausses détections ou pas manqués selon l'orientation du téléphone

**✅ Correction :** Seuil adaptatif basé sur statistiques locales
```javascript
// Nouveau calcul dynamique
const { threshold, baseline } = this.calculateAdaptiveThreshold(filteredAcc);
// threshold = baseline + K * écart-type (K varie selon le mode d'activité)
```

### 2. ❌ **Absence de Filtrage du Signal**
**Problème :** Pas de filtrage des accélérations, vulnérable au bruit haute fréquence
- **Cause :** Traitement direct des données brutes
- **Impact :** Oscillations rapides causent de fausses détections

**✅ Correction :** Pipeline de filtrage en 3 étapes
1. **Soustraction dynamique de gravité** (`removeGravityComponent`)
2. **Filtre passe-haut** (`applyHighPassFilter`) avec cutoff 0.3 Hz
3. **Validation de forme de pic** avec critères de netteté

### 3. ❌ **Non Soustraction de la Gravité en Temps Réel**
**Problème :** Calibration initiale seulement, pas de compensation dynamique
- **Cause :** Gravité non recalculée si téléphone change d'orientation
- **Impact :** Magnitude reste ~9.8 m/s² même au repos, seuil inefficace

**✅ Correction :** Estimation dynamique de la gravité
```javascript
// Calcul gravité moyenne sur fenêtre glissante
const avgGravity = {
  x: recentAcc.reduce((sum, a) => sum + a.x, 0) / recentAcc.length,
  y: recentAcc.reduce((sum, a) => sum + a.y, 0) / recentAcc.length,
  z: recentAcc.reduce((sum, a) => sum + a.z, 0) / recentAcc.length
};
// Soustraction en temps réel pour obtenir accélération linéaire
```

### 4. ❌ **Position Mise à Jour en Continu**
**Problème :** Position avançait même sans pas détecté
- **Cause :** `updatePosition()` appelait le mouvement en boucle
- **Impact :** Dérive de position constante, pas de corrélation pas/mouvement

**✅ Correction :** Position mise à jour seulement sur pas validé
```javascript
// Ancien : Position mise à jour en continu
if (this.currentMode === 'walking') {
  this.position.x += stepDistance * Math.cos(this.orientation.yaw);
}

// Nouveau : Position mise à jour seulement sur détection pas
if (validStep && (now - this.lastStepTime) > minStepInterval) {
  this.advancePositionOnStep(); // ← Seulement ici !
}
```

## Améliorations Techniques

### **Pipeline de Détection Robuste**
1. **Acquisition** : Données accéléromètre brutes
2. **Suppression gravité** : Calcul moyenne glissante + soustraction
3. **Filtrage** : Passe-haut différentiel (α = 0.3)
4. **Seuil adaptatif** : baseline + K×σ (K selon mode activité)
5. **Validation pics** : Maximum local + netteté + amplitude minimale
6. **Validation temporelle** : Intervalle minimum entre pas (250-400ms)
7. **Mise à jour position** : Seulement sur pas validé

### **Seuils Adaptatifs par Mode**
- **Running** : K = 1.5 (plus sensible), intervalle 250ms
- **Walking** : K = 2.0 (standard), intervalle 400ms  
- **Crawling** : K = 2.5 (moins sensible), modèle continu
- **Contraintes** : seuil ∈ [0.3, 3.0] m/s²

### **Longueur de Pas Dynamique**
```javascript
// Ajustement pour amplitudes filtrées (0.5-3.0)
const amplitudeFactor = 0.7 + (normalizedAmplitude - 0.5) * 0.4 / 2.5;
// Facteurs par mode : running×1.2, walking×1.0, crawling×0.3
// Lissage exponentiel lent (α = 0.05) pour stabilité
```

## Logs de Debug Ajoutés

```javascript
console.log(`[STEP] Détecté #${this.stepCount}: amplitude=${validStep.amplitude.toFixed(2)}, seuil=${threshold.toFixed(2)}`);
console.log(`[PDR] Position mise à jour: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}) - Distance pas: ${stepDistance.toFixed(2)}m`);
```

## Impact Attendu

- ✅ **Détection précise** : Pas plus fiables avec filtrage et seuil adaptatif
- ✅ **Réduction fausses détections** : Validation multi-critères des pics
- ✅ **Position exacte** : Mouvement seulement sur pas réels
- ✅ **Robustesse orientation** : Indépendant de l'inclinaison du téléphone
- ✅ **Adaptabilité** : Seuils s'ajustent automatiquement aux conditions

Ces corrections devraient résoudre le problème de compteur de pas bloqué à 0 et améliorer considérablement la précision de la navigation PDR. 