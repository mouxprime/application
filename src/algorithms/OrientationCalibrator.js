import { create, all } from 'mathjs';

const math = create(all);

/**
 * Calibrateur d'orientation pour neutraliser l'orientation du téléphone en poche
 * Calcule une matrice de rotation pour transformer le repère téléphone vers un repère corps stable
 */
export class OrientationCalibrator {
  constructor(config = {}) {
    this.config = {
      calibrationDuration: config.calibrationDuration || 5000, // 5 secondes
      samplesRequired: config.samplesRequired || 30, // Réduit pour plus de tolérance
      gravityThreshold: config.gravityThreshold || 0.3, // En G (gravité terrestre) - plus tolérant
      gyroThreshold: config.gyroThreshold || 0.5, // Plus tolérant (était 0.8, maintenant plus réaliste)
      maxCalibrationTime: config.maxCalibrationTime || 15000, // Timeout de sécurité 15s
      tolerantMode: config.tolerantMode !== false, // Mode tolérant par défaut
      gravityScale: config.gravityScale || 9.81, // Facteur de conversion G vers m/s²
      ...config
    };

    // État de calibration
    this.isCalibrating = false;
    this.calibrationStartTime = 0;
    this.calibrationSamples = [];
    
    // Matrice de rotation calculée
    this.rotationMatrix = math.identity(3);
    this.isCalibrated = false;
    
    // Référentiel corps cible
    this.targetGravity = [0, 0, -9.81]; // Gravité vers le bas (axe Z négatif)
    this.targetForward = [0, 1, 0];     // Direction avant (axe Y positif)
    
    // Callbacks
    this.onCalibrationProgress = null;
    this.onCalibrationComplete = null;
  }

  /**
   * Démarrage de la calibration
   */
  startCalibration() {
    this.isCalibrating = true;
    this.calibrationStartTime = Date.now();
    this.calibrationSamples = [];
    this.isCalibrated = false;
    
    console.log('Calibration orientation démarrée - Restez immobile pendant 5 secondes');
    
    if (this.onCalibrationProgress) {
      this.onCalibrationProgress(0, 'Démarrage calibration...');
    }
  }

  /**
   * Ajout d'un échantillon de calibration
   */
  addCalibrationSample(accelerometer, gyroscope) {
    if (!this.isCalibrating) return false;

    const now = Date.now();
    const elapsed = now - this.calibrationStartTime;
    
    // Timeout de sécurité pour éviter la boucle infinie
    if (elapsed > this.config.maxCalibrationTime) {
      console.warn('Timeout de calibration atteint - Finalisation forcée');
      if (this.calibrationSamples.length >= this.config.samplesRequired / 2) {
        this.completeCalibration();
        return true;
      } else {
        this.isCalibrating = false;
        if (this.onCalibrationProgress) {
          this.onCalibrationProgress(1.0, 'Timeout - Calibration échouée');
        }
        return false;
      }
    }
    
    // Vérifier la stabilité (peu de mouvement)
    const accMagnitude = Math.sqrt(
      accelerometer.x * accelerometer.x + 
      accelerometer.y * accelerometer.y + 
      accelerometer.z * accelerometer.z
    );
    const gyroMagnitude = Math.sqrt(
      gyroscope.x * gyroscope.x + 
      gyroscope.y * gyroscope.y + 
      gyroscope.z * gyroscope.z
    );

    // *** BUG FIX: Travail avec unités G (gravité terrestre = ~9.81 en données brutes) ***
    // Le capteur retourne des valeurs en unités qui correspondent à ~9.81 pour 1G
    const gravityDiff = Math.abs(accMagnitude - 9.81); // Comparaison avec 9.81 (gravité terrestre)
    const isStable = gravityDiff <= this.config.gravityThreshold && 
                     gyroMagnitude <= this.config.gyroThreshold;

    if (!isStable && !this.config.tolerantMode) {
      // Mode strict : rejeter l'échantillon
      if (this.onCalibrationProgress) {
        this.onCalibrationProgress(elapsed / this.config.calibrationDuration, 
          'Mouvement détecté - essayez de rester immobile');
      }
      return false;
    }

    // En mode tolérant ou si stable : ajouter l'échantillon
    this.calibrationSamples.push({
      accelerometer: { ...accelerometer },
      gyroscope: { ...gyroscope },
      timestamp: now,
      stable: isStable
    });

    // *** DEBUG: Traçage des échantillons ***
    if (this.calibrationSamples.length % 50 === 0) {
      console.log(`[DEBUG] Échantillon ${this.calibrationSamples.length}: acc=${accMagnitude.toFixed(3)} m/s², gyro=${gyroMagnitude.toFixed(3)}rad/s, stable=${isStable}`);
      console.log(`[DEBUG] Seuils: gravityDiff=${gravityDiff.toFixed(3)} (max: ${this.config.gravityThreshold}), gyro=${gyroMagnitude.toFixed(3)} (max: ${this.config.gyroThreshold})`);
    }

    // Progression basée sur le temps OU le nombre d'échantillons stables
    const timeProgress = elapsed / this.config.calibrationDuration;
    const sampleProgress = this.calibrationSamples.length / this.config.samplesRequired;
    const progress = Math.min(Math.max(timeProgress, sampleProgress), 1.0);
    
    const stableCount = this.calibrationSamples.filter(s => s.stable).length;
    const stabilityRatio = stableCount / this.calibrationSamples.length;
    
    // Vérifier si calibration terminée AVANT d'envoyer le message de progression
    const isCalibrationComplete = (elapsed >= this.config.calibrationDuration || 
         this.calibrationSamples.length >= this.config.samplesRequired) && 
        stableCount >= this.config.samplesRequired * 0.6;
    
    if (isCalibrationComplete) {
      // Compléter immédiatement sans envoyer plus de messages de progression
      this.completeCalibration();
      return true;
    }
    
    // Envoyer la progression seulement si pas encore terminé
    if (this.onCalibrationProgress) {
      let message;
      if (progress >= 0.95) {
        message = 'Finalisation...';
      } else if (stabilityRatio < 0.7) {
        message = 'Mouvement détecté - essayez de rester immobile';
      } else {
        message = `Calibration en cours... ${(progress * 100).toFixed(0)}%`;
      }
      this.onCalibrationProgress(progress, message);
    }

    return false;
  }

  /**
   * Finalisation de la calibration
   */
  completeCalibration() {
    // Protection contre les appels multiples
    if (!this.isCalibrating) {
      console.warn('completeCalibration appelé mais calibration déjà terminée');
      return false;
    }
    
    const minSamples = Math.min(this.config.samplesRequired, 15); // Au minimum 15 échantillons
    
    if (this.calibrationSamples.length < minSamples) {
      console.warn(`Pas assez d'échantillons pour la calibration (${this.calibrationSamples.length}/${minSamples})`);
      this.isCalibrating = false;
      if (this.onCalibrationProgress) {
        this.onCalibrationProgress(1.0, 'Échec - Pas assez d\'échantillons');
      }
      return false;
    }

    // Utiliser prioritairement les échantillons stables
    const stableSamples = this.calibrationSamples.filter(s => s.stable);
    
    // *** BUG FIX: Meilleure gestion des échantillons stables ***
    let samplesToUse;
    if (stableSamples.length >= Math.min(minSamples, 10)) {
      // Assez d'échantillons stables
      samplesToUse = stableSamples;
    } else if (this.calibrationSamples.length >= minSamples) {
      // Pas assez d'échantillons stables, mais on a assez d'échantillons en général
      // Utiliser tous les échantillons mais avec un message d'avertissement
      samplesToUse = this.calibrationSamples;
      console.warn(`Calibration avec mouvement détecté - précision réduite (${stableSamples.length} stables sur ${this.calibrationSamples.length})`);
    } else {
      // Pas assez d'échantillons au total
      this.isCalibrating = false;
      if (this.onCalibrationProgress) {
        this.onCalibrationProgress(1.0, 'Échec - Mouvement excessif détecté');
      }
      return false;
    }
    
    console.log(`Calibration: utilisation de ${samplesToUse.length} échantillons (${stableSamples.length} stables)`);

    // Calcul de la moyenne des accélérations (gravité mesurée)
    const avgAcceleration = this.calculateAverageAcceleration(samplesToUse);
    
    // *** BUG FIX: Validation de la gravité mesurée (données brutes ~9.81) ***
    const gravityMagnitude = Math.sqrt(
      avgAcceleration.x * avgAcceleration.x + 
      avgAcceleration.y * avgAcceleration.y + 
      avgAcceleration.z * avgAcceleration.z
    );
    
    // Validation avec données brutes (devrait être proche de 9.81)
    if (gravityMagnitude < 8.0 || gravityMagnitude > 12.0) {
      console.error(`Gravité mesurée aberrante: ${gravityMagnitude.toFixed(2)} (devrait être ~9.81)`);
      this.isCalibrating = false;
      if (this.onCalibrationProgress) {
        this.onCalibrationProgress(1.0, 'Échec - Mesures aberrantes');
      }
      return false;
    }
    
    // *** BUG FIX: Les données sont déjà en m/s² selon les observations ***
    // Pas besoin de conversion supplémentaire
    
    // Calcul de la matrice de rotation avec les données telles quelles
    this.rotationMatrix = this.calculateRotationMatrix(avgAcceleration);
    
    this.isCalibrating = false;
    this.isCalibrated = true;
    
    console.log('Calibration terminée - Matrice de rotation calculée');
    console.log('Gravité mesurée:', `${gravityMagnitude.toFixed(2)} m/s² (magnitude brute)`);
    console.log('Données brutes (m/s²):', avgAcceleration);
    
    if (this.onCalibrationProgress) {
      this.onCalibrationProgress(1.0, 'Calibration terminée avec succès');
    }
    
    if (this.onCalibrationComplete) {
      this.onCalibrationComplete(this.rotationMatrix, avgAcceleration);
    }
    
    return true;
  }

  /**
   * Calcul de l'accélération moyenne pendant la calibration
   */
  calculateAverageAcceleration(samples = null) {
    const samplesToUse = samples || this.calibrationSamples;
    const totalAcc = samplesToUse.reduce((sum, sample) => ({
      x: sum.x + sample.accelerometer.x,
      y: sum.y + sample.accelerometer.y,
      z: sum.z + sample.accelerometer.z
    }), { x: 0, y: 0, z: 0 });

    return {
      x: totalAcc.x / samplesToUse.length,
      y: totalAcc.y / samplesToUse.length,
      z: totalAcc.z / samplesToUse.length
    };
  }

  /**
   * Calcul de la matrice de rotation du repère téléphone vers repère corps
   */
  calculateRotationMatrix(measuredGravity) {
    // Normaliser la gravité mesurée (doit être en m/s²)
    const gMag = Math.sqrt(
      measuredGravity.x * measuredGravity.x + 
      measuredGravity.y * measuredGravity.y + 
      measuredGravity.z * measuredGravity.z
    );
    
    // Protection contre division par zéro
    if (gMag < 1e-6) {
      console.warn('Magnitude de gravité nulle, retour matrice identité');
      return math.identity(3);
    }
    
    const gNorm = {
      x: measuredGravity.x / gMag,
      y: measuredGravity.y / gMag,
      z: measuredGravity.z / gMag
    };

    // Gravité cible (vers le bas dans le repère corps) - normalisée
    const gTarget = { x: 0, y: 0, z: -1 };

    // Calcul de l'axe de rotation (produit vectoriel)
    const rotAxis = {
      x: gNorm.y * gTarget.z - gNorm.z * gTarget.y,
      y: gNorm.z * gTarget.x - gNorm.x * gTarget.z,
      z: gNorm.x * gTarget.y - gNorm.y * gTarget.x
    };

    // Magnitude de l'axe de rotation
    const rotAxisMag = Math.sqrt(
      rotAxis.x * rotAxis.x + 
      rotAxis.y * rotAxis.y + 
      rotAxis.z * rotAxis.z
    );

    // Angle de rotation
    const cosAngle = gNorm.x * gTarget.x + gNorm.y * gTarget.y + gNorm.z * gTarget.z;
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    // Si pas de rotation nécessaire (déjà aligné)
    if (rotAxisMag < 1e-6 || Math.abs(angle) < 1e-6) {
      console.log('Pas de rotation nécessaire - téléphone déjà aligné');
      return math.identity(3);
    }

    // Normaliser l'axe de rotation
    const axis = {
      x: rotAxis.x / rotAxisMag,
      y: rotAxis.y / rotAxisMag,
      z: rotAxis.z / rotAxisMag
    };

    console.log(`Angle de rotation calculé: ${(angle * 180 / Math.PI).toFixed(1)}°`);
    console.log(`Axe de rotation:`, axis);

    // Matrice de rotation selon l'axe (formule de Rodrigues)
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;

    const R = math.matrix([
      [
        t * axis.x * axis.x + c,
        t * axis.x * axis.y - s * axis.z,
        t * axis.x * axis.z + s * axis.y
      ],
      [
        t * axis.x * axis.y + s * axis.z,
        t * axis.y * axis.y + c,
        t * axis.y * axis.z - s * axis.x
      ],
      [
        t * axis.x * axis.z - s * axis.y,
        t * axis.y * axis.z + s * axis.x,
        t * axis.z * axis.z + c
      ]
    ]);

    return R;
  }

  /**
   * Application de la rotation calibrée à un vecteur d'accélération
   */
  transformAcceleration(acceleration) {
    if (!this.isCalibrated) {
      return acceleration; // Pas de transformation si pas calibré
    }

    const accVector = math.matrix([[acceleration.x], [acceleration.y], [acceleration.z]]);
    const rotatedVector = math.multiply(this.rotationMatrix, accVector);

    return {
      x: rotatedVector.get([0, 0]),
      y: rotatedVector.get([1, 0]),
      z: rotatedVector.get([2, 0])
    };
  }

  /**
   * Application de la rotation calibrée à un vecteur de gyroscope
   */
  transformGyroscope(gyroscope) {
    if (!this.isCalibrated) {
      return gyroscope; // Pas de transformation si pas calibré
    }

    const gyroVector = math.matrix([[gyroscope.x], [gyroscope.y], [gyroscope.z]]);
    const rotatedVector = math.multiply(this.rotationMatrix, gyroVector);

    return {
      x: rotatedVector.get([0, 0]),
      y: rotatedVector.get([1, 0]),
      z: rotatedVector.get([2, 0])
    };
  }

  /**
   * Application de la rotation calibrée à un vecteur de magnétomètre
   */
  transformMagnetometer(magnetometer) {
    if (!this.isCalibrated) {
      return magnetometer; // Pas de transformation si pas calibré
    }

    const magVector = math.matrix([[magnetometer.x], [magnetometer.y], [magnetometer.z]]);
    const rotatedVector = math.multiply(this.rotationMatrix, magVector);

    return {
      x: rotatedVector.get([0, 0]),
      y: rotatedVector.get([1, 0]),
      z: rotatedVector.get([2, 0])
    };
  }

  /**
   * Calcul de la magnitude d'accélération
   */
  calculateMagnitude(acceleration) {
    return Math.sqrt(
      acceleration.x * acceleration.x + 
      acceleration.y * acceleration.y + 
      acceleration.z * acceleration.z
    );
  }

  /**
   * Réinitialisation de la calibration
   */
  reset() {
    this.isCalibrating = false;
    this.isCalibrated = false;
    this.calibrationSamples = [];
    this.rotationMatrix = math.identity(3);
  }

  /**
   * Configuration des callbacks
   */
  setCallbacks({ onProgress, onComplete }) {
    this.onCalibrationProgress = onProgress;
    this.onCalibrationComplete = onComplete;
  }

  /**
   * État de la calibration
   */
  getStatus() {
    return {
      isCalibrating: this.isCalibrating,
      isCalibrated: this.isCalibrated,
      samplesCollected: this.calibrationSamples.length,
      samplesRequired: this.config.samplesRequired,
      progress: this.isCalibrating ? 
        Math.min((Date.now() - this.calibrationStartTime) / this.config.calibrationDuration, 1.0) : 
        (this.isCalibrated ? 1.0 : 0.0)
    };
  }
} 