import { create, all } from 'mathjs';

const math = create(all);

/**
 * Filtre de Kalman Étendu avancé avec map-matching et ZUPT
 * Optimisé pour les environnements catacombes avec contraintes géométriques
 */
export class AdvancedExtendedKalmanFilter {
  constructor(config = {}) {
    this.config = {
      // Bruits de processus adaptatifs
      processNoiseWalking: config.processNoiseWalking || 0.1,
      processNoiseCrawling: config.processNoiseCrawling || 0.05,
      processNoiseStationary: config.processNoiseStationary || 0.01,
      
      // Bruits de mesure
      pdrNoise: config.pdrNoise || 0.3,
      barometerNoise: config.barometerNoise || 0.1,
      magnetometerNoise: config.magnetometerNoise || 0.2,
      zuptNoise: config.zuptNoise || 0.01,
      
      // Map-matching
      mapMatchingThreshold: config.mapMatchingThreshold || 2.0, // mètres
      mapMatchingWeight: config.mapMatchingWeight || 0.5,
      
      // Contraintes de vitesse
      maxWalkingSpeed: config.maxWalkingSpeed || 2.0, // m/s
      maxCrawlingSpeed: config.maxCrawlingSpeed || 0.5, // m/s
      
      ...config
    };

    // État étendu: [x, y, z, vx, vy, vz, θ, roll, pitch, ωz, bias_acc_x, bias_acc_y, bias_gyro_z]
    this.state = math.matrix([
      [0], // x position
      [0], // y position
      [0], // z altitude
      [0], // vx velocity
      [0], // vy velocity
      [0], // vz velocity
      [0], // θ orientation yaw
      [0], // roll orientation
      [0], // pitch orientation
      [0], // ωz angular velocity
      [0], // bias accéléromètre X
      [0], // bias accéléromètre Y
      [0]  // bias gyroscope Z
    ]);

    // Matrice de covariance (13x13 maintenant)
    this.P = math.multiply(math.identity(13), 10.0);

    // Matrices de bruit
    this.Q = math.zeros(13, 13);
    this.updateProcessNoise('stationary');

    // Carte vectorielle pour map-matching
    this.vectorMap = null;
    this.corridors = [];
    this.walls = [];

    // État du mode de mouvement
    this.currentMode = 'stationary';
    this.zuptActive = false;

    // Historique pour analyse
    this.innovationHistory = [];
    this.confidenceHistory = [];

    // Protection contre les appels simultanés
    this._isUpdating = false;

    this.lastUpdate = Date.now();
  }

  /**
   * Configuration de la carte vectorielle
   */
  setVectorMap(mapData) {
    this.vectorMap = mapData;
    if (mapData) {
      this.corridors = mapData.tunnels || [];
      this.walls = mapData.walls || [];
      console.log(`Carte chargée: ${this.corridors.length} corridors, ${this.walls.length} murs`);
    }
  }

  /**
   * Mise à jour du bruit de processus selon le mode
   */
  updateProcessNoise(mode) {
    this.currentMode = mode;
    
    let baseNoise;
    switch (mode) {
      case 'walking':
      case 'running':
        baseNoise = this.config.processNoiseWalking;
        break;
      case 'crawling':
        baseNoise = this.config.processNoiseCrawling;
        break;
      case 'stationary':
      default:
        baseNoise = this.config.processNoiseStationary;
        break;
    }

    // Matrice Q adaptative (13 éléments maintenant)
    const noiseVector = [
      baseNoise * 0.1,      // position x
      baseNoise * 0.1,      // position y  
      baseNoise * 0.05,     // altitude z
      baseNoise,            // vitesse vx
      baseNoise,            // vitesse vy
      baseNoise * 0.5,      // vitesse vz
      baseNoise * 0.1,      // orientation θ (yaw)
      baseNoise * 0.15,     // orientation roll
      baseNoise * 0.15,     // orientation pitch
      baseNoise * 0.2,      // vitesse angulaire ω
      baseNoise * 0.01,     // bias acc x
      baseNoise * 0.01,     // bias acc y
      baseNoise * 0.005     // bias gyro z
    ];

    this.Q = math.diag(noiseVector);
  }

  /**
   * Prédiction avec modèle de mouvement PDR
   */
  predict(dt, pdrIncrement) {
    if (dt <= 0) return;

    // Vérification de l'intégrité de l'état
    try {
      const stateSize = this.state.size();
      const PSize = this.P.size();
      
      if (stateSize[0] !== 13 || stateSize[1] !== 1) {
        console.warn('État EKF corrompu, réinitialisation');
        this.reset();
        return;
      }
      
      if (PSize[0] !== 13 || PSize[1] !== 13) {
        console.warn('Matrice de covariance P corrompue, réinitialisation');
        this.P = math.multiply(math.identity(13), 10.0);
      }
    } catch (error) {
      console.warn('Erreur lors de la vérification de l\'état EKF:', error);
      this.reset();
      return;
    }

    // État actuel
    const x = this.state.get([0, 0]);
    const y = this.state.get([1, 0]);
    const z = this.state.get([2, 0]);
    const vx = this.state.get([3, 0]);
    const vy = this.state.get([4, 0]);
    const vz = this.state.get([5, 0]);
    const theta = this.state.get([6, 0]);
    const roll = this.state.get([7, 0]);
    const pitch = this.state.get([8, 0]);
    const omega = this.state.get([9, 0]);

    // Incréments PDR
    const { dx = 0, dy = 0, dz = 0, dtheta = 0 } = pdrIncrement || {};

    // Modèle de mouvement cinématique + PDR
    let newX, newY, newZ, newTheta;

    if (this.currentMode === 'stationary' || this.zuptActive) {
      // Mode stationnaire - pas de mouvement
      newX = x;
      newY = y;
      newZ = z;
      newTheta = theta + omega * dt;
    } else {
      // Fusion vitesse cinématique + incréments PDR
      const kinematicX = x + vx * dt;
      const kinematicY = y + vy * dt;
      const kinematicZ = z + vz * dt;
      
      const pdrX = x + dx;
      const pdrY = y + dy;
      const pdrZ = z + dz;
      
      // Fusion pondérée (plus de poids sur PDR)
      const pdrWeight = 0.7;
      newX = pdrWeight * pdrX + (1 - pdrWeight) * kinematicX;
      newY = pdrWeight * pdrY + (1 - pdrWeight) * kinematicY;
      newZ = pdrWeight * pdrZ + (1 - pdrWeight) * kinematicZ;
      newTheta = theta + dtheta + omega * dt;
    }

    // Contraintes de vitesse
    const maxSpeed = this.currentMode === 'crawling' ? 
      this.config.maxCrawlingSpeed : this.config.maxWalkingSpeed;
    
    const speedX = (newX - x) / dt;
    const speedY = (newY - y) / dt;
    const speed = Math.sqrt(speedX * speedX + speedY * speedY);
    
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      newX = x + (newX - x) * scale;
      newY = y + (newY - y) * scale;
    }

    // Mise à jour état
    this.state.set([0, 0], newX);
    this.state.set([1, 0], newY);
    this.state.set([2, 0], newZ);
    this.state.set([6, 0], this.normalizeAngle(newTheta));
    // Roll et pitch évoluent lentement en mode poche
    this.state.set([7, 0], this.normalizeAngle(roll + omega * dt * 0.1));
    this.state.set([8, 0], this.normalizeAngle(pitch + omega * dt * 0.1));

    // Mise à jour vitesses
    this.state.set([3, 0], (newX - x) / dt);
    this.state.set([4, 0], (newY - y) / dt);
    this.state.set([5, 0], (newZ - z) / dt);

    // Jacobien pour la prédiction
    const F = this.getStateTransitionJacobian(dt);

    // Mise à jour covariance: P = F * P * F^T + Q
    try {
      const FPFt = math.multiply(math.multiply(F, this.P), math.transpose(F));
      const QScaled = math.multiply(this.Q, dt);
      this.P = math.add(FPFt, QScaled);
      
      // Assurer que P reste symétrique positive définie
      this.P = math.multiply(0.5, math.add(this.P, math.transpose(this.P)));
      
      // Terme de régularisation pour éviter la singularité
      const minEigenvalue = 1e-8;
      for (let i = 0; i < 13; i++) {
        const currentValue = this.P.get([i, i]);
        if (currentValue < minEigenvalue) {
          this.P.set([i, i], minEigenvalue);
        }
      }
          } catch (error) {
        console.warn('Erreur mise à jour covariance prédiction:', error);
        this.P = math.multiply(math.identity(13), 10.0);
      }

    // Map-matching après prédiction
    this.applyMapMatching();
  }

  /**
   * Map-matching avec contraintes géométriques
   */
  applyMapMatching() {
    if (!this.vectorMap || this.corridors.length === 0) return;

    const currentPos = {
      x: this.state.get([0, 0]),
      y: this.state.get([1, 0])
    };

    // Trouver le corridor le plus proche
    let closestCorridor = null;
    let minDistance = Infinity;
    let correctedPosition = null;

    for (const corridor of this.corridors) {
      if (!corridor.points || corridor.points.length < 2) continue;

      // Projection sur le corridor
      const projection = this.projectPointOnCorridor(currentPos, corridor);
      
      if (projection && projection.distance < minDistance) {
        minDistance = projection.distance;
        closestCorridor = corridor;
        correctedPosition = projection.point;
      }
    }

    // Application du map-matching si proche d'un corridor
    if (closestCorridor && minDistance < this.config.mapMatchingThreshold) {
      const weight = this.config.mapMatchingWeight * 
        (1 - minDistance / this.config.mapMatchingThreshold);

      // Correction pondérée
      const correctedX = currentPos.x * (1 - weight) + correctedPosition.x * weight;
      const correctedY = currentPos.y * (1 - weight) + correctedPosition.y * weight;

      this.state.set([0, 0], correctedX);
      this.state.set([1, 0], correctedY);

      // Réduction de l'incertitude en position
      this.P.set([0, 0], this.P.get([0, 0]) * (1 - weight * 0.5));
      this.P.set([1, 1], this.P.get([1, 1]) * (1 - weight * 0.5));

      console.log(`Map-matching appliqué: distance=${minDistance.toFixed(2)}m, poids=${weight.toFixed(2)}`);
    }
  }

  /**
   * Projection d'un point sur un corridor
   */
  projectPointOnCorridor(point, corridor) {
    if (!corridor.points || corridor.points.length < 2) return null;

    let minDistance = Infinity;
    let bestProjection = null;

    // Tester chaque segment du corridor
    for (let i = 0; i < corridor.points.length - 1; i++) {
      const p1 = { x: corridor.points[i][0], y: corridor.points[i][1] };
      const p2 = { x: corridor.points[i + 1][0], y: corridor.points[i + 1][1] };

      const projection = this.projectPointOnSegment(point, p1, p2);
      
      if (projection.distance < minDistance) {
        minDistance = projection.distance;
        bestProjection = projection;
      }
    }

    return bestProjection;
  }

  /**
   * Projection d'un point sur un segment
   */
  projectPointOnSegment(point, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length2 = dx * dx + dy * dy;

    if (length2 === 0) {
      // Segment de longueur nulle
      const distance = Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
      return { point: p1, distance };
    }

    // Paramètre t pour la projection
    const t = Math.max(0, Math.min(1, 
      ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / length2
    ));

    // Point projeté
    const projectedPoint = {
      x: p1.x + t * dx,
      y: p1.y + t * dy
    };

    // Distance au point projeté
    const distance = Math.sqrt(
      (point.x - projectedPoint.x) ** 2 + (point.y - projectedPoint.y) ** 2
    );

    return { point: projectedPoint, distance };
  }

  /**
   * Mise à jour avec mesures baromètre
   */
  updateWithBarometer(pressure) {
    const altitude = this.pressureToAltitude(pressure);
    const measurement = math.matrix([[altitude]]);

    // Matrice d'observation pour altitude
    const H = math.zeros(1, 13);
    H.set([0, 2], 1); // z position

    const R = math.matrix([[this.config.barometerNoise ** 2]]);
    this.updateMeasurement(measurement, H, R);
  }

  /**
   * Mise à jour avec correction magnétomètre conditionnelle
   */
  updateWithMagnetometer(magneticField, confidence = 1.0) {
    // Ne corriger que si confiance élevée
    if (confidence < 0.7) return;

    const heading = Math.atan2(magneticField.y, magneticField.x);
    const measurement = math.matrix([[heading]]);

    // Matrice d'observation pour orientation
    const H = math.zeros(1, 13);
    H.set([0, 6], 1); // θ orientation

    const R = math.matrix([[this.config.magnetometerNoise ** 2 / confidence]]);
    this.updateMeasurement(measurement, H, R);
  }

  /**
   * Application Zero-Velocity Update (ZUPT) avec protection contre les appels multiples
   */
  applyZUPT() {
    // Protection contre les appels multiples
    if (this.zuptActive) {
      return; // Déjà en cours, éviter la boucle
    }
    
    this.zuptActive = true;
    
    try {
      // Vérification complète de l'état du système
      if (!this.state || !this.P || !this.Q) {
        console.warn('État EKF non initialisé pour ZUPT');
        this.reset();
        return;
      }

      // Vérification stricte des dimensions
      const stateSize = this.state.size();
      const PSize = this.P.size();
      
      if (!stateSize || stateSize.length !== 2 || stateSize[0] !== 13 || stateSize[1] !== 1) {
        console.warn(`État EKF invalide pour ZUPT: ${JSON.stringify(stateSize)}, réinitialisation`);
        this.reset();
        return;
      }
      
      if (!PSize || PSize.length !== 2 || PSize[0] !== 13 || PSize[1] !== 13) {
        console.warn(`Matrice P invalide pour ZUPT: ${JSON.stringify(PSize)}, réinitialisation`);
        this.P = math.multiply(math.identity(13), 10.0);
      }

      // Application ZUPT simplifiée directement sur l'état
      // Éviter la méthode updateMeasurement() qui cause problème
      const currentVx = this.state.get([3, 0]);
      const currentVy = this.state.get([4, 0]);
      const currentVz = this.state.get([5, 0]);
      
      // Réduction progressive des vitesses au lieu de mise à jour Kalman
      const damping = 0.1; // Facteur d'amortissement
      this.state.set([3, 0], currentVx * damping); // vx
      this.state.set([4, 0], currentVy * damping); // vy
      this.state.set([5, 0], currentVz * damping); // vz
      
      // Réduction de l'incertitude sur les vitesses dans P
      const velocityNoiseReduction = 0.5;
      this.P.set([3, 3], this.P.get([3, 3]) * velocityNoiseReduction);
      this.P.set([4, 4], this.P.get([4, 4]) * velocityNoiseReduction);
      this.P.set([5, 5], this.P.get([5, 5]) * velocityNoiseReduction);
      
      console.log('ZUPT appliqué directement - vitesses amorties');
      
    } catch (error) {
      console.warn('Erreur ZUPT:', error.message || error);
      
      // Fallback ultime : réinitialisation complète mais contrôlée
      try {
        this.reset();
        console.log('EKF réinitialisé suite à erreur ZUPT');
      } catch (resetError) {
        console.error('Impossible de réinitialiser EKF:', resetError);
      }
    }
  }

  /**
   * Désactivation ZUPT avec délai de protection
   */
  deactivateZUPT() {
    // Délai de protection pour éviter les basculements rapides
    setTimeout(() => {
      this.zuptActive = false;
    }, 100); // 100ms de délai
  }

  /**
   * Mise à jour générique avec mesure - Version sécurisée
   */
  updateMeasurement(measurement, H, R) {
    try {
      // Protection contre les appels simultanés
      if (this._isUpdating) {
        console.warn('Mise à jour EKF déjà en cours, appel ignoré');
        return;
      }
      this._isUpdating = true;

      // Vérifications des dimensions
      const stateSize = this.state.size();
      const measurementSize = measurement.size();
      const HSize = H.size();
      const RSize = R.size();

      // Vérifications de compatibilité
      if (stateSize[0] !== 13 || stateSize[1] !== 1) {
        console.warn(`État invalide: taille ${stateSize[0]}x${stateSize[1]}, attendu 13x1`);
        return;
      }

      if (HSize[1] !== 13) {
        console.warn(`Matrice H invalide: taille ${HSize[0]}x${HSize[1]}, attendu Nx13`);
        return;
      }

      if (measurementSize[0] !== HSize[0] || measurementSize[1] !== 1) {
        console.warn(`Mesure invalide: taille ${measurementSize[0]}x${measurementSize[1]}, attendu ${HSize[0]}x1`);
        return;
      }

      if (RSize[0] !== RSize[1] || RSize[0] !== HSize[0]) {
        console.warn(`Matrice R invalide: taille ${RSize[0]}x${RSize[1]}, attendu ${HSize[0]}x${HSize[0]}`);
        return;
      }

      // Vérification de la validité de la matrice de covariance
      const PSize = this.P.size();
      if (PSize[0] !== 13 || PSize[1] !== 13) {
        console.warn(`Matrice P invalide: taille ${PSize[0]}x${PSize[1]}, attendu 13x13`);
        this.P = math.multiply(math.identity(13), 10.0);
      }

      // Innovation: y = z - H * x
      const predicted = math.multiply(H, this.state);
      const innovation = math.subtract(measurement, predicted);

      // Covariance innovation: S = H * P * H^T + R
      const HPHt = math.multiply(math.multiply(H, this.P), math.transpose(H));
      const S = math.add(HPHt, R);

      // Vérification que S est inversible
      let SInv;
      try {
        SInv = math.inv(S);
      } catch (invError) {
        console.warn('Matrice S non inversible, ajout de régularisation');
        const regularization = math.multiply(math.identity(S.size()[0]), 1e-6);
        const SRegularized = math.add(S, regularization);
        try {
          SInv = math.inv(SRegularized);
        } catch (regError) {
          console.warn('Impossible d\'inverser S même avec régularisation');
          return;
        }
      }

      // Gain de Kalman: K = P * H^T * S^(-1)
      const PHt = math.multiply(this.P, math.transpose(H));
      const K = math.multiply(PHt, SInv);

      // Mise à jour de l'état: x = x + K * y
      const correction = math.multiply(K, innovation);
      this.state = math.add(this.state, correction);

      // Mise à jour de la covariance: P = (I - K * H) * P
      const I = math.identity(13);
      const KH = math.multiply(K, H);
      const IminusKH = math.subtract(I, KH);
      this.P = math.multiply(IminusKH, this.P);

      // Assurer que P reste symétrique positive définie
      this.P = math.multiply(0.5, math.add(this.P, math.transpose(this.P)));

      // Ajouter un terme de régularisation pour éviter la singularité
      const minEigenvalue = 1e-8;
      for (let i = 0; i < 13; i++) {
        const currentValue = this.P.get([i, i]);
        if (currentValue < minEigenvalue) {
          this.P.set([i, i], minEigenvalue);
        }
      }

      // Normalisation des angles
      this.state.set([6, 0], this.normalizeAngle(this.state.get([6, 0])));

      // Contraintes physiques sur les vitesses
      const maxVelocity = this.currentMode === 'crawling' ? 0.5 : 2.0;
      for (let i = 3; i <= 5; i++) {
        const velocity = this.state.get([i, 0]);
        if (Math.abs(velocity) > maxVelocity) {
          this.state.set([i, 0], Math.sign(velocity) * maxVelocity);
        }
      }

      // Normalisation des angles d'orientation
      this.state.set([6, 0], this.normalizeAngle(this.state.get([6, 0]))); // yaw
      this.state.set([7, 0], this.normalizeAngle(this.state.get([7, 0]))); // roll
      this.state.set([8, 0], this.normalizeAngle(this.state.get([8, 0]))); // pitch

      // Historique innovation pour diagnostic
      this.innovationHistory.push({
        innovation: math.norm(innovation),
        timestamp: Date.now()
      });
      if (this.innovationHistory.length > 100) {
        this.innovationHistory.shift();
      }

    } catch (error) {
      console.warn('Erreur mise à jour EKF:', error.message || error);
      
      // En cas d'erreur, réinitialiser seulement les matrices problématiques
      if (error.message && error.message.includes('matrix dimensions')) {
        console.warn('Réinitialisation des matrices EKF due à une erreur de dimension');
        this.P = math.multiply(math.identity(13), 10.0);
        this.updateProcessNoise(this.currentMode);
      }
    } finally {
      // Libération du verrou
      this._isUpdating = false;
    }
  }

  /**
   * Jacobien de transition d'état (13x13)
   */
  getStateTransitionJacobian(dt) {
    const F = math.identity(13);
    
    // Position = position + vitesse * dt
    F.set([0, 3], dt); // dx/dvx
    F.set([1, 4], dt); // dy/dvy
    F.set([2, 5], dt); // dz/dvz
    
    // Orientation = orientation + vitesse_angulaire * dt
    F.set([6, 9], dt); // dθ/dω (yaw)
    // Roll et pitch évoluent plus lentement en mode poche
    F.set([7, 9], dt * 0.1); // droll/dω (faible couplage)
    F.set([8, 9], dt * 0.1); // dpitch/dω (faible couplage)

    return F;
  }

  /**
   * Conversion pression vers altitude
   */
  pressureToAltitude(pressure, seaLevel = 1013.25) {
    return 44330 * (1 - Math.pow(pressure / seaLevel, 0.1903));
  }

  /**
   * Normalisation d'angle
   */
  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * Obtenir la pose actuelle
   */
  getPose() {
    return {
      x: this.state.get([0, 0]),
      y: this.state.get([1, 0]),
      z: this.state.get([2, 0]),
      theta: this.state.get([6, 0]),
      confidence: this.getConfidence()
    };
  }

  /**
   * Calcul de confiance intégrant roll/pitch pour usage en poche
   */
  getConfidence() {
    // Incertitude de position (X, Y)
    const positionUncertainty = this.P.get([0, 0]) + this.P.get([1, 1]);
    
    // Incertitudes d'orientation (yaw, roll, pitch)
    const yawUncertainty = this.P.get([6, 6]);      // θ yaw
    const rollUncertainty = this.P.get([7, 7]);     // roll
    const pitchUncertainty = this.P.get([8, 8]);    // pitch
    
    // Total des incertitudes avec pondération
    const totalUncertainty = positionUncertainty +         // Position (poids 1.0)
                            yawUncertainty +               // Yaw (poids 1.0)
                            rollUncertainty * 0.5 +        // Roll (poids 0.5)
                            pitchUncertainty * 0.5;        // Pitch (poids 0.5)
    
    return Math.max(0, Math.min(1, 1 / (1 + totalUncertainty)));
  }

  /**
   * Obtenir l'état complet
   */
  getFullState() {
    return {
      position: {
        x: this.state.get([0, 0]),
        y: this.state.get([1, 0]),
        z: this.state.get([2, 0])
      },
      velocity: {
        vx: this.state.get([3, 0]),
        vy: this.state.get([4, 0]),
        vz: this.state.get([5, 0])
      },
      orientation: {
        theta: this.state.get([6, 0]),
        roll: this.state.get([7, 0]),
        pitch: this.state.get([8, 0]),
        omega: this.state.get([9, 0])
      },
      biases: {
        acc_x: this.state.get([10, 0]),
        acc_y: this.state.get([11, 0]),
        gyro_z: this.state.get([12, 0])
      },
      mode: this.currentMode,
      zuptActive: this.zuptActive,
      confidence: this.getConfidence()
    };
  }

  /**
   * Réinitialisation
   */
  reset(initialState = {}) {
    const { x = 0, y = 0, z = 0, theta = 0 } = initialState;
    
    this.state = math.matrix([
      [x], [y], [z],           // position
      [0], [0], [0],           // vitesse
      [theta], [0], [0],       // orientation (yaw, roll, pitch)
      [0],                     // vitesse angulaire
      [0], [0], [0]            // biais
    ]);

    this.P = math.multiply(math.identity(13), 10.0);
    this.updateProcessNoise('stationary');
    this.lastUpdate = Date.now();
    
    console.log(`EKF avancé réinitialisé: (${x}, ${y}, ${z})`);
  }
} 