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
      samplesRequired: config.samplesRequired || 50, // Minimum 50 échantillons
      gravityThreshold: config.gravityThreshold || 2.0, // Seuil de stabilité assoupli
      gyroThreshold: config.gyroThreshold || 0.3, // Seuil gyroscope assoupli
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

    // Vérifier que l'utilisateur est relativement immobile (seuils assouplis)
    const gravityDiff = Math.abs(accMagnitude - 9.81);
    if (gravityDiff > this.config.gravityThreshold || gyroMagnitude > this.config.gyroThreshold) {
      // Trop de mouvement, mais ne redémarre plus la calibration immédiatement
      if (this.onCalibrationProgress) {
        this.onCalibrationProgress(elapsed / this.config.calibrationDuration, 
          'Mouvement détecté - essayez de rester immobile');
      }
      // Ne pas vider les échantillons pour être plus tolérant
      return false;
    }

    // Ajouter l'échantillon
    this.calibrationSamples.push({
      accelerometer: { ...accelerometer },
      gyroscope: { ...gyroscope },
      timestamp: now
    });

    // Progression
    const progress = Math.min(elapsed / this.config.calibrationDuration, 1.0);
    if (this.onCalibrationProgress) {
      this.onCalibrationProgress(progress, 
        `Calibration en cours... ${(progress * 100).toFixed(0)}%`);
    }

    // Vérifier si calibration terminée
    if (elapsed >= this.config.calibrationDuration && 
        this.calibrationSamples.length >= this.config.samplesRequired) {
      this.completeCalibration();
      return true;
    }

    return false;
  }

  /**
   * Finalisation de la calibration
   */
  completeCalibration() {
    if (this.calibrationSamples.length < this.config.samplesRequired) {
      console.warn('Pas assez d\'échantillons pour la calibration');
      this.isCalibrating = false;
      return false;
    }

    // Calcul de la moyenne des accélérations (gravité mesurée)
    const avgAcceleration = this.calculateAverageAcceleration();
    
    // Calcul de la matrice de rotation
    this.rotationMatrix = this.calculateRotationMatrix(avgAcceleration);
    
    this.isCalibrating = false;
    this.isCalibrated = true;
    
    console.log('Calibration terminée - Matrice de rotation calculée');
    console.log('Gravité mesurée:', avgAcceleration);
    
    if (this.onCalibrationComplete) {
      this.onCalibrationComplete(this.rotationMatrix, avgAcceleration);
    }
    
    return true;
  }

  /**
   * Calcul de l'accélération moyenne pendant la calibration
   */
  calculateAverageAcceleration() {
    const totalAcc = this.calibrationSamples.reduce((sum, sample) => ({
      x: sum.x + sample.accelerometer.x,
      y: sum.y + sample.accelerometer.y,
      z: sum.z + sample.accelerometer.z
    }), { x: 0, y: 0, z: 0 });

    return {
      x: totalAcc.x / this.calibrationSamples.length,
      y: totalAcc.y / this.calibrationSamples.length,
      z: totalAcc.z / this.calibrationSamples.length
    };
  }

  /**
   * Calcul de la matrice de rotation du repère téléphone vers repère corps
   */
  calculateRotationMatrix(measuredGravity) {
    // Normaliser la gravité mesurée
    const gMag = Math.sqrt(
      measuredGravity.x * measuredGravity.x + 
      measuredGravity.y * measuredGravity.y + 
      measuredGravity.z * measuredGravity.z
    );
    
    const gNorm = {
      x: measuredGravity.x / gMag,
      y: measuredGravity.y / gMag,
      z: measuredGravity.z / gMag
    };

    // Gravité cible (vers le bas dans le repère corps)
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

    // Si pas de rotation nécessaire
    if (rotAxisMag < 1e-6 || Math.abs(angle) < 1e-6) {
      return math.identity(3);
    }

    // Normaliser l'axe de rotation
    const axis = {
      x: rotAxis.x / rotAxisMag,
      y: rotAxis.y / rotAxisMag,
      z: rotAxis.z / rotAxisMag
    };

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