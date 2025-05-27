import { create, all } from 'mathjs';
import { OrientationCalibrator } from './OrientationCalibrator.js';

const math = create(all);

/**
 * Traqueur d'attitude continu avec re-calibration automatique
 * Utilise un filtre Madgwick pour maintenir un quaternion téléphone→monde
 * et détecte automatiquement les moments de stabilité pour re-calibrer
 */
export class AttitudeTracker {
  constructor(config = {}) {
    this.config = {
      // Paramètres du filtre Madgwick
      beta: config.beta || 0.1, // Gain du filtre (0.1 = conservateur, 0.5 = agressif)
      
      // Seuils de détection de stabilité
      stabilityAccThreshold: config.stabilityAccThreshold || 0.2, // m/s²
      stabilityGyroThreshold: config.stabilityGyroThreshold || 0.1, // rad/s
      stabilityDuration: config.stabilityDuration || 2000, // ms
      
      // Confiance magnétique
      magConfidenceThreshold: config.magConfidenceThreshold || 0.7,
      magNormThreshold: config.magNormThreshold || 5.0, // µT tolérance
      
      // Re-calibration
      autoRecalibrationEnabled: config.autoRecalibrationEnabled !== false,
      recalibrationInterval: config.recalibrationInterval || 30000, // 30s minimum entre recalibrations
      
      ...config
    };

    // État du quaternion (téléphone → monde)
    this.quaternion = { w: 1, x: 0, y: 0, z: 0 };
    this.previousQuaternion = { ...this.quaternion };
    
    // Suivi de stabilité
    this.stabilityState = {
      isStable: false,
      stableStartTime: 0,
      accelerationVariance: 0,
      gyroMagnitude: 0,
      samples: []
    };
    
    // Confiance magnétique
    this.magneticState = {
      confidence: 0,
      reference: null,
      recentSamples: []
    };
    
    // Re-calibration automatique
    this.recalibrationState = {
      lastRecalibrationTime: 0,
      isRecalibrating: false,
      calibrator: new OrientationCalibrator({
        calibrationDuration: 3000, // 3s pour recalibration rapide
        samplesRequired: 30,
        gravityThreshold: 1.0,
        gyroThreshold: 0.15
      })
    };
    
    // Matrice de rotation corps → téléphone actuelle
    this.bodyToPhoneMatrix = math.identity(3);
    this.phoneToBodyMatrix = math.identity(3);
    
    // Callbacks
    this.onAttitudeUpdate = null;
    this.onRecalibration = null;
    this.onStabilityChange = null;
    
    // Dernière mise à jour
    this.lastUpdateTime = 0;
    
    console.log('AttitudeTracker initialisé');
  }

  /**
   * Mise à jour principale avec données capteurs
   */
  update(accelerometer, gyroscope, magnetometer = null) {
    const currentTime = Date.now();
    const dt = this.lastUpdateTime > 0 ? (currentTime - this.lastUpdateTime) / 1000 : 0.02;
    this.lastUpdateTime = currentTime;

    // 1. Mise à jour du filtre Madgwick
    this.updateMadgwickFilter(accelerometer, gyroscope, magnetometer, dt);
    
    // 2. Suivi de la stabilité
    this.updateStabilityTracking(accelerometer, gyroscope);
    
    // 3. Évaluation confiance magnétique
    if (magnetometer) {
      this.updateMagneticConfidence(magnetometer);
    }
    
    // 4. Vérification re-calibration automatique
    if (this.config.autoRecalibrationEnabled) {
      this.checkAutoRecalibration(accelerometer, gyroscope);
    }
    
    // 5. Mise à jour des matrices de rotation
    this.updateRotationMatrices();
    
    // 6. Notification
    if (this.onAttitudeUpdate) {
      this.onAttitudeUpdate({
        quaternion: { ...this.quaternion },
        bodyToPhoneMatrix: this.bodyToPhoneMatrix,
        phoneToBodyMatrix: this.phoneToBodyMatrix,
        isStable: this.stabilityState.isStable,
        magneticConfidence: this.magneticState.confidence
      });
    }
  }

  /**
   * Filtre Madgwick AHRS avec intégration complète du magnétomètre
   */
  updateMadgwickFilter(acc, gyro, mag, dt) {
    // Normaliser l'accélération
    const accNorm = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    if (accNorm === 0) return;
    
    const ax = acc.x / accNorm;
    const ay = acc.y / accNorm;
    const az = acc.z / accNorm;
    
    // Vitesses angulaires
    const gx = gyro.x;
    const gy = gyro.y;
    const gz = gyro.z;
    
    // Quaternion actuel
    let { w: q0, x: q1, y: q2, z: q3 } = this.quaternion;
    
    // Dérivée du quaternion par intégration gyroscopique
    const qDot1 = 0.5 * (-q1 * gx - q2 * gy - q3 * gz);
    const qDot2 = 0.5 * (q0 * gx + q2 * gz - q3 * gy);
    const qDot3 = 0.5 * (q0 * gy - q1 * gz + q3 * gx);
    const qDot4 = 0.5 * (q0 * gz + q1 * gy - q2 * gx);
    
    // *** SOLUTION 2: Intégration complète du magnétomètre ***
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    
    // Correction gravitationnelle (accéléromètre)
    const _2q0 = 2 * q0;
    const _2q1 = 2 * q1;
    const _2q2 = 2 * q2;
    const _2q3 = 2 * q3;
    const _4q0 = 4 * q0;
    const _4q1 = 4 * q1;
    const _4q2 = 4 * q2;
    const q0q0 = q0 * q0;
    const q1q1 = q1 * q1;
    const q2q2 = q2 * q2;
    const q3q3 = q3 * q3;
    
    // Fonction objective pour la gravité
    const f1 = _2q1 * q3 - _2q0 * q2 - ax;
    const f2 = _2q0 * q1 + _2q2 * q3 - ay;
    const f3 = 1 - _2q1 * q1 - _2q2 * q2 - az;
    
    // Jacobien pour la gravité
    const J_11or24 = _2q2;
    const J_12or23 = _2q3;
    const J_13or22 = _2q0;
    const J_14or21 = _2q1;
    const J_32 = _4q1;
    const J_33 = _4q2;
    
    // Gradient pour la gravité
    s0 = -J_13or22 * f2 + J_14or21 * f1;
    s1 = J_11or24 * f2 - J_12or23 * f1 - J_32 * f3;
    s2 = J_12or23 * f2 + J_11or24 * f1 - J_33 * f3;
    s3 = J_14or21 * f2 - J_13or22 * f1;
    
    // *** NOUVEAU: Correction magnétique si disponible et fiable ***
    if (mag && this.magneticState.confidence > 0.3) { // Seuil plus bas pour utiliser le magnétomètre
      // Normaliser le magnétomètre
      const magNorm = Math.sqrt(mag.x * mag.x + mag.y * mag.y + mag.z * mag.z);
      if (magNorm > 0) {
        const mx = mag.x / magNorm;
        const my = mag.y / magNorm;
        const mz = mag.z / magNorm;
        
        // Référence magnétique dans le référentiel terrestre (nord = [1, 0, 0] dans le plan horizontal)
        // Calculer la direction magnétique attendue dans le référentiel du capteur
        const _2q0mx = 2 * q0 * mx;
        const _2q0my = 2 * q0 * my;
        const _2q0mz = 2 * q0 * mz;
        const _2q1mx = 2 * q1 * mx;
        const _2q1my = 2 * q1 * my;
        const _2q1mz = 2 * q1 * mz;
        const _2q2mx = 2 * q2 * mx;
        const _2q2my = 2 * q2 * my;
        const _2q2mz = 2 * q2 * mz;
        const _2q3mx = 2 * q3 * mx;
        const _2q3my = 2 * q3 * my;
        const _2q3mz = 2 * q3 * mz;
        
        // Champ magnétique de référence (horizontal, pointant vers le nord magnétique)
        const hx = mx * q0q0 - _2q0my * q3 + _2q0mz * q2 + mx * q1q1 + _2q1 * my * q2 + _2q1 * mz * q3 - mx * q2q2 - mx * q3q3;
        const hy = _2q0mx * q3 + my * q0q0 - _2q0mz * q1 + _2q1mx * q2 - my * q1q1 + my * q2q2 + _2q2 * mz * q3 - my * q3q3;
        const _2bx = Math.sqrt(hx * hx + hy * hy);
        const _2bz = -_2q0mx * q2 + _2q0my * q1 + mz * q0q0 + _2q1mx * q3 - mz * q1q1 + _2q2 * my * q3 - mz * q2q2 + mz * q3q3;
        const _4bx = 2 * _2bx;
        const _4bz = 2 * _2bz;
        
        // Fonction objective pour le magnétomètre
        const f4 = _2bx * (0.5 - q2q2 - q3q3) + _2bz * (q1 * q3 - q0 * q2) - mx;
        const f5 = _2bx * (q1 * q2 - q0 * q3) + _2bz * (q0 * q1 + q2 * q3) - my;
        const f6 = _2bx * (q0 * q2 + q1 * q3) + _2bz * (0.5 - q1q1 - q2q2) - mz;
        
        // Jacobien pour le magnétomètre
        const J_14or21_mag = _2bz * q2;
        const J_11or24_mag = _2bx * q3 + _2bz * q1;
        const J_12or23_mag = _2bx * q2 + _2bz * q0;
        const J_13or22_mag = _2bx * q1 - _4bz * q2;
        const J_32_mag = -_4bx * q2 - _2bz * q0;
        const J_33_mag = -_4bx * q3 + _2bz * q1;
        const J_41_mag = -_2bz * q3;
        const J_42_mag = _2bx * q3 - _2bz * q1;
        const J_43_mag = _2bx * q2 + _2bz * q0;
        const J_44_mag = _2bx * q1;
        const J_51_mag = _2bz * q2;
        const J_52_mag = _2bx * q2 + _2bz * q0;
        const J_53_mag = _2bx * q3 - _4bz * q1;
        const J_54_mag = _2bx * q0 - _2bz * q3;
        const J_61_mag = _2bx * q1;
        const J_62_mag = _2bx * q0 - _4bz * q2;
        const J_63_mag = _2bx * q3 - _4bz * q1;
        const J_64_mag = _2bx * q2;
        
        // Gradient magnétique
        const magWeight = this.magneticState.confidence; // Pondération par la confiance
        s0 += magWeight * (J_14or21_mag * f4 + J_11or24_mag * f5 + J_61_mag * f6);
        s1 += magWeight * (J_12or23_mag * f4 + J_13or22_mag * f5 + J_62_mag * f6);
        s2 += magWeight * (J_32_mag * f4 + J_33_mag * f5 + J_63_mag * f6);
        s3 += magWeight * (J_41_mag * f4 + J_42_mag * f5 + J_64_mag * f6);
      }
    }
    
    // Normaliser le gradient total
    const norm = Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2 + s3 * s3);
    if (norm > 0) {
      s0 /= norm;
      s1 /= norm;
      s2 /= norm;
      s3 /= norm;
    }
    
    // Gain adaptatif basé sur la confiance magnétique
    let beta = this.config.beta;
    if (mag && this.magneticState.confidence > 0.5) {
      beta *= (1 + this.magneticState.confidence * 0.5); // Augmentation modérée du gain
    }
    
    // Appliquer feedback step
    q0 += (qDot1 - beta * s0) * dt;
    q1 += (qDot2 - beta * s1) * dt;
    q2 += (qDot3 - beta * s2) * dt;
    q3 += (qDot4 - beta * s3) * dt;
    
    // Normaliser le quaternion
    const qNorm = Math.sqrt(q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3);
    this.quaternion.w = q0 / qNorm;
    this.quaternion.x = q1 / qNorm;
    this.quaternion.y = q2 / qNorm;
    this.quaternion.z = q3 / qNorm;
  }

  /**
   * Suivi de la stabilité pour détection de re-calibration
   */
  updateStabilityTracking(accelerometer, gyroscope) {
    const currentTime = Date.now();
    
    // Calcul variance accélération
    this.stabilityState.samples.push({
      acc: { ...accelerometer },
      gyro: { ...gyroscope },
      timestamp: currentTime
    });
    
    // Garder seulement les échantillons récents (2 secondes)
    this.stabilityState.samples = this.stabilityState.samples.filter(
      sample => currentTime - sample.timestamp <= 2000
    );
    
    if (this.stabilityState.samples.length < 10) return;
    
    // Calcul variance accélération
    const accMagnitudes = this.stabilityState.samples.map(sample => 
      Math.sqrt(sample.acc.x ** 2 + sample.acc.y ** 2 + sample.acc.z ** 2)
    );
    const meanAcc = accMagnitudes.reduce((sum, val) => sum + val, 0) / accMagnitudes.length;
    const variance = accMagnitudes.reduce((sum, val) => sum + (val - meanAcc) ** 2, 0) / accMagnitudes.length;
    
    // Calcul magnitude gyroscope moyenne
    const gyroMagnitudes = this.stabilityState.samples.map(sample =>
      Math.sqrt(sample.gyro.x ** 2 + sample.gyro.y ** 2 + sample.gyro.z ** 2)
    );
    const meanGyro = gyroMagnitudes.reduce((sum, val) => sum + val, 0) / gyroMagnitudes.length;
    
    this.stabilityState.accelerationVariance = variance;
    this.stabilityState.gyroMagnitude = meanGyro;
    
    // Détection stabilité
    const isCurrentlyStable = variance < this.config.stabilityAccThreshold && 
                              meanGyro < this.config.stabilityGyroThreshold;
    
    if (isCurrentlyStable && !this.stabilityState.isStable) {
      // Début de période stable
      this.stabilityState.stableStartTime = currentTime;
      this.stabilityState.isStable = true;
      
      if (this.onStabilityChange) {
        this.onStabilityChange(true, variance, meanGyro);
      }
      
    } else if (!isCurrentlyStable && this.stabilityState.isStable) {
      // Fin de période stable
      this.stabilityState.isStable = false;
      this.stabilityState.stableStartTime = 0;
      
      if (this.onStabilityChange) {
        this.onStabilityChange(false, variance, meanGyro);
      }
    }
  }

  /**
   * Évaluation de la confiance magnétique
   */
  updateMagneticConfidence(magnetometer) {
    const magNorm = Math.sqrt(
      magnetometer.x ** 2 + magnetometer.y ** 2 + magnetometer.z ** 2
    );
    
    // Ajouter échantillon récent
    this.magneticState.recentSamples.push({
      norm: magNorm,
      vector: { ...magnetometer },
      timestamp: Date.now()
    });
    
    // Garder 50 échantillons récents
    if (this.magneticState.recentSamples.length > 50) {
      this.magneticState.recentSamples.shift();
    }
    
    if (this.magneticState.recentSamples.length < 10) {
      this.magneticState.confidence = 0;
      return;
    }
    
    // Calcul variance de la norme
    const norms = this.magneticState.recentSamples.map(s => s.norm);
    const meanNorm = norms.reduce((sum, val) => sum + val, 0) / norms.length;
    const normVariance = norms.reduce((sum, val) => sum + (val - meanNorm) ** 2, 0) / norms.length;
    
    // Confiance basée sur stabilité de la norme (champ terrestre ~25-65µT)
    const expectedNorm = 50; // µT approximatif
    const normError = Math.abs(meanNorm - expectedNorm);
    const stabilityScore = Math.max(0, 1 - normVariance / this.config.magNormThreshold);
    const accuracyScore = Math.max(0, 1 - normError / expectedNorm);
    
    this.magneticState.confidence = Math.min(stabilityScore * accuracyScore, 1.0);
    
    // Mise à jour référence si confiance élevée
    if (this.magneticState.confidence > 0.8 && !this.magneticState.reference) {
      this.magneticState.reference = { x: magnetometer.x, y: magnetometer.y, z: magnetometer.z };
    }
  }

  /**
   * Vérification et déclenchement re-calibration automatique
   */
  checkAutoRecalibration(accelerometer, gyroscope) {
    const currentTime = Date.now();
    
    // Vérifier si assez de temps écoulé depuis dernière recalibration
    if (currentTime - this.recalibrationState.lastRecalibrationTime < this.config.recalibrationInterval) {
      return;
    }
    
    // Vérifier si stable assez longtemps
    if (!this.stabilityState.isStable) return;
    
    const stableDuration = currentTime - this.stabilityState.stableStartTime;
    if (stableDuration < this.config.stabilityDuration) return;
    
    // Déclencher re-calibration
    this.startAutoRecalibration(accelerometer, gyroscope);
  }

  /**
   * Démarrage re-calibration automatique
   */
  startAutoRecalibration(accelerometer, gyroscope) {
    console.log('Démarrage re-calibration automatique');
    
    this.recalibrationState.isRecalibrating = true;
    this.recalibrationState.lastRecalibrationTime = Date.now();
    
    // Configuration callbacks
    this.recalibrationState.calibrator.setCallbacks({
      onProgress: (progress, message) => {
        // Suivi silencieux
      },
      onComplete: (rotationMatrix, avgGravity) => {
        this.completeAutoRecalibration(rotationMatrix, avgGravity);
      }
    });
    
    // Démarrer calibration
    this.recalibrationState.calibrator.startCalibration();
    
    // Feed données pendant la calibration
    const feedData = () => {
      if (this.recalibrationState.isRecalibrating) {
        this.recalibrationState.calibrator.addCalibrationSample(accelerometer, gyroscope);
        setTimeout(feedData, 40); // 25Hz
      }
    };
    feedData();
  }

  /**
   * Finalisation re-calibration automatique
   */
  completeAutoRecalibration(rotationMatrix, avgGravity) {
    console.log('Re-calibration automatique terminée');
    
    // Mise à jour matrices
    this.bodyToPhoneMatrix = rotationMatrix;
    this.phoneToBodyMatrix = math.inv(rotationMatrix);
    
    this.recalibrationState.isRecalibrating = false;
    
    // Notification
    if (this.onRecalibration) {
      this.onRecalibration({
        rotationMatrix,
        avgGravity,
        automatic: true,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Mise à jour des matrices de rotation à partir du quaternion
   */
  updateRotationMatrices() {
    const { w, x, y, z } = this.quaternion;
    
    // Conversion quaternion → matrice de rotation
    const rotMatrix = math.matrix([
      [
        1 - 2*(y*y + z*z),
        2*(x*y - w*z),
        2*(x*z + w*y)
      ],
      [
        2*(x*y + w*z),
        1 - 2*(x*x + z*z),
        2*(y*z - w*x)
      ],
      [
        2*(x*z - w*y),
        2*(y*z + w*x),
        1 - 2*(x*x + y*y)
      ]
    ]);
    
    // Mise à jour si changement significatif
    const matrixChanged = this.hasMatrixChanged(rotMatrix);
    if (matrixChanged) {
      this.phoneToBodyMatrix = rotMatrix;
      this.bodyToPhoneMatrix = math.inv(rotMatrix);
    }
  }

  /**
   * Vérification changement significatif de matrice
   */
  hasMatrixChanged(newMatrix, threshold = 0.01) {
    if (!this.phoneToBodyMatrix) return true;
    
    const diff = math.subtract(newMatrix, this.phoneToBodyMatrix);
    const maxDiff = math.max(math.abs(diff));
    return maxDiff > threshold;
  }

  /**
   * Application transformation à un vecteur accélération
   */
  transformAcceleration(acceleration) {
    const accVector = math.matrix([[acceleration.x], [acceleration.y], [acceleration.z]]);
    const transformed = math.multiply(this.phoneToBodyMatrix, accVector);
    
    return {
      x: transformed.get([0, 0]),
      y: transformed.get([1, 0]),
      z: transformed.get([2, 0])
    };
  }

  /**
   * Application transformation à un vecteur gyroscope
   */
  transformGyroscope(gyroscope) {
    const gyroVector = math.matrix([[gyroscope.x], [gyroscope.y], [gyroscope.z]]);
    const transformed = math.multiply(this.phoneToBodyMatrix, gyroVector);
    
    return {
      x: transformed.get([0, 0]),
      y: transformed.get([1, 0]),
      z: transformed.get([2, 0])
    };
  }

  /**
   * Calibration manuelle forcée
   */
  forceRecalibration(accelerometer, gyroscope) {
    console.log('Force re-calibration manuelle');
    this.recalibrationState.lastRecalibrationTime = 0; // Reset timer
    this.startAutoRecalibration(accelerometer, gyroscope);
  }

  /**
   * Configuration des callbacks
   */
  setCallbacks({ onAttitudeUpdate, onRecalibration, onStabilityChange }) {
    this.onAttitudeUpdate = onAttitudeUpdate;
    this.onRecalibration = onRecalibration;
    this.onStabilityChange = onStabilityChange;
  }

  /**
   * État actuel
   */
  getStatus() {
    return {
      quaternion: { ...this.quaternion },
      isStable: this.stabilityState.isStable,
      stabilityDuration: this.stabilityState.isStable ? 
        Date.now() - this.stabilityState.stableStartTime : 0,
      accelerationVariance: this.stabilityState.accelerationVariance,
      gyroMagnitude: this.stabilityState.gyroMagnitude,
      magneticConfidence: this.magneticState.confidence,
      isRecalibrating: this.recalibrationState.isRecalibrating,
      lastRecalibration: this.recalibrationState.lastRecalibrationTime
    };
  }

  /**
   * Réinitialisation
   */
  reset() {
    this.quaternion = { w: 1, x: 0, y: 0, z: 0 };
    this.stabilityState.isStable = false;
    this.stabilityState.samples = [];
    this.magneticState.confidence = 0;
    this.magneticState.recentSamples = [];
    this.recalibrationState.isRecalibrating = false;
    this.bodyToPhoneMatrix = math.identity(3);
    this.phoneToBodyMatrix = math.identity(3);
  }
} 