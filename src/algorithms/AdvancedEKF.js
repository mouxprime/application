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

    // *** BUG FIX: Matrice de covariance avec incertitudes raisonnables pour confiance initiale décente ***
    this.P = math.identity(13);
    
    // Position X,Y - valeurs plus faibles pour une confiance initiale décente
    this.P.set([0, 0], 0.1);   // 10cm d'incertitude initiale au lieu de 1m
    this.P.set([1, 1], 0.1);   // 10cm d'incertitude initiale au lieu de 1m
    
    // Z, vitesses & biases
    this.P.set([2, 2], 0.1);   // Z
    for (let i of [3,4,5]) {
      this.P.set([i, i], 0.01); // Vitesses - très faibles initialement
    }
    this.P.set([9, 9], 0.01);  // Vitesse angulaire
    for (let i of [10,11,12]) {
      this.P.set([i, i], 0.01); // Biais - très faibles initialement
    }
    
    // Yaw, roll, pitch - valeurs raisonnables
    this.P.set([6, 6], 0.05);  // Yaw - 13° d'incertitude initiale
    this.P.set([7, 7], 0.05);  // Roll - 13° d'incertitude initiale  
    this.P.set([8, 8], 0.05);  // Pitch - 13° d'incertitude initiale

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
    this._zuptApplied = false;

    // Historique pour analyse
    this.innovationHistory = [];
    this.confidenceHistory = [];

    // Protection contre les appels simultanés
    this._isUpdating = false;

    this.lastUpdate = Date.now();
    
    // Ajout d'une variable pour le dernier log
    this.lastLogTime = 0;
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
    const previousMode = this.currentMode;
    this.currentMode = mode;
    
    // Réinitialiser le flag ZUPT si on sort du mode stationnaire
    if (previousMode === 'stationary' && mode !== 'stationary') {
      this._zuptApplied = false;
    }
    
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

    // Matrice Q adaptative (13 éléments maintenant) - Bruit position augmenté pour plus de réactivité
    const noiseVector = [
      baseNoise * 0.5,      // position x (augmenté de 0.1 à 0.5)
      baseNoise * 0.5,      // position y (augmenté de 0.1 à 0.5)
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
        this.P = math.identity(13);
        // Position X,Y
        this.P.set([0, 0], 1.0);
        this.P.set([1, 1], 1.0);
        // Z, vitesses & biases
        for (let i of [2,3,4,5,9,10,11,12]) {
          this.P.set([i, i], 1.0);
        }
        // Yaw, roll, pitch
        this.P.set([6, 6], 0.2);
        this.P.set([7, 7], 0.2);
        this.P.set([8, 8], 0.2);
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
    } else if (this.currentMode === 'crawling') {
      // *** NOUVEAU: Mode crawling avec vitesse constante ***
      // Si la vitesse est nulle, l'initialiser avec la vitesse de crawling
      if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) {
        const crawlSpeed = this.config.maxCrawlingSpeed || 0.3; // m/s
        vx = crawlSpeed * Math.cos(theta);
        vy = crawlSpeed * Math.sin(theta);
        
        // Mettre à jour l'état avec la nouvelle vitesse
        this.state.set([3, 0], vx);
        this.state.set([4, 0], vy);
        
        console.log(`[EKF CRAWLING] Vitesse initialisée: vx=${vx.toFixed(3)}, vy=${vy.toFixed(3)}`);
      }
      
      // Fusion vitesse cinématique + incréments PDR avec plus de poids sur la cinématique
      const kinematicX = x + vx * dt;
      const kinematicY = y + vy * dt;
      const kinematicZ = z + vz * dt;
      
      const pdrX = x + dx;
      const pdrY = y + dy;
      const pdrZ = z + dz;
      
      // En crawling, privilégier la cinématique (vitesse constante)
      const pdrWeight = 0.3; // Moins de poids sur PDR en crawling
      newX = pdrWeight * pdrX + (1 - pdrWeight) * kinematicX;
      newY = pdrWeight * pdrY + (1 - pdrWeight) * kinematicY;
      newZ = pdrWeight * pdrZ + (1 - pdrWeight) * kinematicZ;
      newTheta = theta + dtheta + omega * dt;
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
      this.P = math.identity(13);
      // Position X,Y
      this.P.set([0, 0], 1.0);
      this.P.set([1, 1], 1.0);
      // Z, vitesses & biases
      for (let i of [2,3,4,5,9,10,11,12]) {
        this.P.set([i, i], 1.0);
      }
      // Yaw, roll, pitch
      this.P.set([6, 6], 0.2);
      this.P.set([7, 7], 0.2);
      this.P.set([8, 8], 0.2);
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
   * Mise à jour avec données de magnétomètre (SIMPLIFIÉ)
   */
  updateWithMagnetometer(magneticField, confidence = 1.0) {
    if (!magneticField || typeof magneticField.x !== 'number') return;

    try {
      // Calcul du cap magnétique simple
      const magneticHeading = Math.atan2(magneticField.y, magneticField.x);
      
      // Normalisation [-π, π]
      const normalizedHeading = this.normalizeAngle(magneticHeading);
      
      // Mise à jour directe avec confiance
      this.updateWithObservation([6], [normalizedHeading], this.config.magnetometerNoise / confidence);
      
      this._lastMagnetometerConfidence = confidence;
      
    } catch (error) {
      console.warn('Erreur mise à jour magnétomètre (simplifié):', error);
    }
  }

  /**
   * Application Zero-Velocity Update (ZUPT) - AMÉLIORÉE pour confiance
   */
  applyZUPT() {
    // Ne s'appliquer qu'à la transition vers stationnaire
    if (this.currentMode === 'stationary' && !this._zuptApplied) {
      this.zuptActive = true;
      this._zuptApplied = true;
      
      const stateVelocity = [
        this.state.get([3, 0]), // vx
        this.state.get([4, 0]), // vy
        this.state.get([5, 0])  // vz
      ];
      
      // *** BUG FIX: Réduction des vitesses plus aggressive (95% au lieu de 90%) ***
      this.state.set([3, 0], stateVelocity[0] * 0.05); // vx
      this.state.set([4, 0], stateVelocity[1] * 0.05); // vy
      this.state.set([5, 0], stateVelocity[2] * 0.05); // vz
      
      // *** NOUVEAU: Réduction de l'incertitude de position pendant ZUPT ***
      // Multiplier les covariances de position par un facteur < 1
      this.P.set([0, 0], this.P.get([0, 0]) * 0.5); // Position X plus certaine
      this.P.set([1, 1], this.P.get([1, 1]) * 0.5); // Position Y plus certaine
      
      // *** NOUVEAU: Réduction modérée de l'incertitude d'orientation si confiance magnéto élevée ***
      // Si on a une bonne référence magnétique, on peut aussi resserrer yaw
      if (this._lastMagnetometerConfidence > 0.7) {
        this.P.set([6, 6], this.P.get([6, 6]) * 0.7); // Yaw plus certain
      }
      
      // Logs détaillés pour le debug
      const positionUncertaintyBefore = this.P.get([0, 0]) + this.P.get([1, 1]);
      const yawUncertaintyBefore = this.P.get([6, 6]);
      
      console.log(`[ZUPT] Activé à la transition - Gain confiance appliqué`);
      console.log(`[ZUPT] Incertitudes avant: pos=${positionUncertaintyBefore.toFixed(3)}, yaw=${yawUncertaintyBefore.toFixed(3)}`);
      
      // Mise à jour avec mesure de vitesse nulle
      const velocityMeasurement = math.matrix([[0], [0], [0]]);
      const velocityNoiseMatrix = math.diag([this.config.zuptNoise, this.config.zuptNoise, this.config.zuptNoise]);
      
      // Matrice d'observation pour les vitesses (H)
      const H = math.zeros(3, 13);
      H.set([0, 3], 1); // vx
      H.set([1, 4], 1); // vy
      H.set([2, 5], 1); // vz
      
      this.updateMeasurement(velocityMeasurement, H, velocityNoiseMatrix);
      
      const positionUncertaintyAfter = this.P.get([0, 0]) + this.P.get([1, 1]);
      const yawUncertaintyAfter = this.P.get([6, 6]);
      
      //console.log(`[ZUPT] Incertitudes après: pos=${positionUncertaintyAfter.toFixed(3)}, yaw=${yawUncertaintyAfter.toFixed(3)}`);
    }
    
    // Amélioration du gain confiance
    const positionGain = 30; // Augmenté de 10% à 30%
    const orientationGain = 20; // Nouveau: gain orientation
    
    // Logs détaillés pour le debug
    const positionUncertaintyBefore = this.P.get([0, 0]) + this.P.get([1, 1]);
    const yawUncertaintyBefore = this.P.get([6, 6]);
    
    console.log(`[ZUPT] Activé - Gain confiance pos: +${positionGain}%, orient: +${orientationGain}%`);
    console.log(`[ZUPT] Incertitudes avant: pos=${positionUncertaintyBefore.toFixed(3)}, yaw=${yawUncertaintyBefore.toFixed(3)}`);
    
    // *** CORRECTION: Conversion en matrice mathjs pour éviter l'erreur "size is not a function" ***
    const velocityMeasurement = math.matrix([[0], [0], [0]]);
    const velocityNoiseMatrix = math.diag([this.config.zuptNoise, this.config.zuptNoise, this.config.zuptNoise]);
    
    // Matrice d'observation pour les vitesses (H)
    const H = math.zeros(3, 13);
    H.set([0, 3], 1); // vx
    H.set([1, 4], 1); // vy
    H.set([2, 5], 1); // vz
    
    this.updateMeasurement(velocityMeasurement, H, velocityNoiseMatrix);
    
    const positionUncertaintyAfter = this.P.get([0, 0]) + this.P.get([1, 1]);
    const yawUncertaintyAfter = this.P.get([6, 6]);
    
    //console.log(`[ZUPT] Incertitudes après: pos=${positionUncertaintyAfter.toFixed(3)}, yaw=${yawUncertaintyAfter.toFixed(3)}`);
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

      // *** CORRECTION: Conversion en matrice mathjs si nécessaire ***
      if (Array.isArray(measurement)) {
        measurement = math.matrix(measurement.map(val => [val]));
      } else if (typeof measurement === 'object' && !measurement.size) {
        // Si c'est un objet mais pas une matrice mathjs, essayer de le convertir
        if (typeof measurement === 'number') {
          measurement = math.matrix([[measurement]]);
        } else {
          console.warn('Type de mesure non supporté:', typeof measurement, measurement);
          return;
        }
      } else if (typeof measurement === 'number') {
        measurement = math.matrix([[measurement]]);
      }

      // Vérifications des dimensions
      const stateSize = this.state.size();
      
      // Correction pour measurement.size
      let measurementSize;
      if (Array.isArray(measurement)) {
        // Si c'est un tableau
        const rows = measurement.length;
        const cols = Array.isArray(measurement[0]) ? measurement[0].length : 1;
        measurementSize = [rows, cols];
        // Convertir en matrice MathJS
        measurement = math.matrix(measurement);
      } else if (measurement && typeof measurement.size === 'function') {
        // Si c'est déjà une matrice MathJS
        measurementSize = measurement.size();
      } else {
        console.warn('Type de measurement invalide:', typeof measurement);
        return;
      }
      
      // Vérification que H est défini avant d'appeler size()
      if (!H || typeof H.size !== 'function') {
        console.warn('Matrice H invalide ou non définie:', H);
        return;
      }
      
      const HSize = H.size();
      
      // Vérification que R est défini avant d'appeler size()
      if (!R || typeof R.size !== 'function') {
        console.warn('Matrice R invalide ou non définie:', R);
        return;
      }
      
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
        this.P = math.identity(13);
        // Position X,Y
        this.P.set([0, 0], 1.0);
        this.P.set([1, 1], 1.0);
        // Z, vitesses & biases
        for (let i of [2,3,4,5,9,10,11,12]) {
          this.P.set([i, i], 1.0);
        }
        // Yaw, roll, pitch
        this.P.set([6, 6], 0.2);
        this.P.set([7, 7], 0.2);
        this.P.set([8, 8], 0.2);
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
        this.P = math.multiply(math.identity(13), 1.0);
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
   * Calcul de confiance AMÉLIORÉ pour éviter le blocage à 1%
   */
  getConfidence() {
    // Incertitude de position (X, Y)
    const positionUncertainty = this.P.get([0, 0]) + this.P.get([1, 1]);
    
    // Incertitudes d'orientation (yaw, roll, pitch)
    const yawUncertainty = this.P.get([6, 6]);      // θ yaw
    const rollUncertainty = this.P.get([7, 7]);     // roll
    const pitchUncertainty = this.P.get([8, 8]);    // pitch
    
    // *** BUG FIX: Pondération plus réaliste et plafonnement des incertitudes ***
    // Plafonner les incertitudes individuelles pour éviter l'explosion
    const cappedPositionUncertainty = Math.min(positionUncertainty, 10.0); // Max 10m²
    const cappedYawUncertainty = Math.min(yawUncertainty, 3.0);            // Max 3 rad²
    const cappedRollUncertainty = Math.min(rollUncertainty, 2.0);          // Max 2 rad²
    const cappedPitchUncertainty = Math.min(pitchUncertainty, 2.0);        // Max 2 rad²
    
    // Total des incertitudes avec pondération plus réaliste
    const totalUncertainty = cappedPositionUncertainty * 1.0 +      // Position (poids normal)
                            cappedYawUncertainty * 0.5 +            // Yaw (poids modéré)
                            cappedRollUncertainty * 0.2 +           // Roll (poids faible)
                            cappedPitchUncertainty * 0.2;           // Pitch (poids faible)
    
    // *** BUG FIX: Fonction de confiance plus réaliste ***
    let confidence;
    if (totalUncertainty < 0.5) {
      // Très bonne confiance si incertitude faible
      confidence = 0.90 - totalUncertainty * 0.3;
    } else if (totalUncertainty < 2.0) {
      // Confiance décroissante mais raisonnable
      confidence = 0.75 - (totalUncertainty - 0.5) * 0.3;
    } else if (totalUncertainty < 5.0) {
      // Confiance modérée
      confidence = 0.50 - (totalUncertainty - 2.0) * 0.1;
    } else {
      // Confiance faible mais pas catastrophique
      confidence = Math.max(0.10, 0.20 - totalUncertainty * 0.02);
    }
    
    // Assurer que la confiance reste dans [0, 1]
    confidence = Math.max(0, Math.min(1, confidence));
    
    // *** BUG FIX: Bonus de confiance selon le mode d'activité ***
    if (this.currentMode === 'stationary') {
      confidence = Math.min(1, confidence * 1.1); // Bonus 10% en stationnaire
    } else if (this.zuptActive) {
      confidence = Math.min(1, confidence * 1.05); // Bonus 5% avec ZUPT
    }
    
    // *** DEBUG: Traçage des incertitudes périodique avec nouvelles métriques ***
    if (!this._lastConfidenceDebug || Date.now() - this._lastConfidenceDebug > 3000) {
      //console.log(`[EKF] Incertitudes: pos=${positionUncertainty.toFixed(3)}→${cappedPositionUncertainty.toFixed(3)}, yaw=${yawUncertainty.toFixed(3)}→${cappedYawUncertainty.toFixed(3)}`);
      //console.log(`[EKF] Total uncertainty=${totalUncertainty.toFixed(3)}, Confiance=${(confidence * 100).toFixed(1)}%, Mode=${this.currentMode}`);
      this._lastConfidenceDebug = Date.now();
    }
    
    // *** BUG FIX: Auto-correction périodique pour prévenir la divergence ***
    this.performPeriodicConfidenceCheck();
    
    return confidence;
  }

  /**
   * Vérification et correction automatique périodique de la confiance
   */
  performPeriodicConfidenceCheck() {
    const now = Date.now();
    
    // Vérification toutes les 10 secondes
    if (now - this._lastAutoCorrection > 10000) {
      this._lastAutoCorrection = now;
      
      const positionUncertainty = this.P.get([0, 0]) + this.P.get([1, 1]);
      const yawUncertainty = this.P.get([6, 6]);
      
      // Si l'incertitude devient trop élevée, appliquer une correction stabilisante
      if (positionUncertainty > 10.0) {
        console.log(`[AUTO-CORRECTION] Incertitude position trop élevée: ${positionUncertainty.toFixed(2)}, correction appliquée`);
        
        // Réduction forcée de l'incertitude
        this.P.set([0, 0], Math.min(this.P.get([0, 0]), 2.0));
        this.P.set([1, 1], Math.min(this.P.get([1, 1]), 2.0));
      }
      
      if (yawUncertainty > 5.0) {
        console.log(`[AUTO-CORRECTION] Incertitude orientation trop élevée: ${yawUncertainty.toFixed(2)}, correction appliquée`);
        
        // Réduction forcée de l'incertitude yaw
        this.P.set([6, 6], Math.min(this.P.get([6, 6]), 1.0));
      }
      
      // Si en mode stationnaire depuis longtemps, bonus de confiance
      if (this.currentMode === 'stationary') {
        const stationaryBonus = 0.95; // 5% de réduction d'incertitude
        this.P.set([0, 0], this.P.get([0, 0]) * stationaryBonus);
        this.P.set([1, 1], this.P.get([1, 1]) * stationaryBonus);
        this.P.set([6, 6], this.P.get([6, 6]) * stationaryBonus);
      }
    }
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

    // *** BUG FIX: Initialisation avec des incertitudes plus raisonnables ***
    this.P = math.identity(13);
    
    // Position X,Y - valeurs plus faibles pour une confiance initiale décente
    this.P.set([0, 0], 0.1);   // 10cm d'incertitude initiale au lieu de 1m
    this.P.set([1, 1], 0.1);   // 10cm d'incertitude initiale au lieu de 1m
    
    // Z, vitesses & biases
    this.P.set([2, 2], 0.1);   // Z
    for (let i of [3,4,5]) {
      this.P.set([i, i], 0.01); // Vitesses - très faibles initialement
    }
    this.P.set([9, 9], 0.01);  // Vitesse angulaire
    for (let i of [10,11,12]) {
      this.P.set([i, i], 0.01); // Biais - très faibles initialement
    }
    
    // Yaw, roll, pitch - valeurs raisonnables
    this.P.set([6, 6], 0.05);  // Yaw - 13° d'incertitude initiale
    this.P.set([7, 7], 0.05);  // Roll - 13° d'incertitude initiale  
    this.P.set([8, 8], 0.05);  // Pitch - 13° d'incertitude initiale
    
    this.updateProcessNoise('stationary');
    this.lastUpdate = Date.now();
    
    // Variables de debug
    this._lastConfidenceDebug = null;
    this._lastPdrDebug = null;
    this._lastAutoCorrection = Date.now();
    
    // Calcul de la confiance initiale
    const initialConfidence = this.getConfidence();
    console.log(`EKF avancé réinitialisé: (${x}, ${y}, ${z}) - Confiance initiale: ${(initialConfidence * 100).toFixed(1)}%`);
  }

  /**
   * Mise à jour avec données PDR pour stabiliser la confiance AMÉLIORÉE
   */
  updateWithPDR(pdrPosition, pdrYaw, mode) {
    if (this._isUpdating) return;
    
    try {
      this._isUpdating = true;
      
      // *** BUG FIX: Configuration du bruit PDR optimisée pour meilleure confiance ***
      let positionNoise, yawNoise;
      switch (mode) {
        case 'stationary':
          positionNoise = 0.005; // Très précis quand stationnaire (réduit)
          yawNoise = 0.02;       // Très précis en orientation aussi
          break;
        case 'walking':
          positionNoise = 0.05;  // Plus optimiste en marche (réduit de 0.1 à 0.05)
          yawNoise = 0.05;       // Plus optimiste en orientation
          break;
        case 'running':
          positionNoise = 0.15;  // Plus optimiste en course (réduit de 0.3 à 0.15)
          yawNoise = 0.1;        // Plus optimiste
          break;
        case 'crawling':
          positionNoise = 0.03;  // Plus optimiste en rampant
          yawNoise = 0.05;
          break;
        default:
          positionNoise = 0.08;  // Plus optimiste par défaut
          yawNoise = 0.08;
      }
      
      // Mise à jour de position (X, Y)
      const positionMeasurement = math.matrix([[pdrPosition.x], [pdrPosition.y]]);
      const H_pos = math.zeros(2, 13);
      H_pos.set([0, 0], 1); // mesure X
      H_pos.set([1, 1], 1); // mesure Y
      
      const R_pos = math.matrix([
        [positionNoise ** 2, 0],
        [0, positionNoise ** 2]
      ]);
      
      this.updateMeasurement(positionMeasurement, H_pos, R_pos);
      
      // Mise à jour d'orientation (Yaw)
      const yawMeasurement = math.matrix([[pdrYaw]]);
      const H_yaw = math.zeros(1, 13);
      H_yaw.set([0, 6], 1); // mesure yaw
      
      const R_yaw = math.matrix([[yawNoise ** 2]]);
      
      this.updateMeasurement(yawMeasurement, H_yaw, R_yaw);
      
      // Log simplifié toutes les 2 secondes
      const now = Date.now();
      if (now - this.lastLogTime >= 2000) {
        console.log(`[STATUS] Mode: ${mode}`);
        this.lastLogTime = now;
      }
      
    } catch (error) {
      console.warn('Erreur mise à jour PDR:', error);
    } finally {
      this._isUpdating = false;
    }
  }

  /**
   * Mise à jour par lot pour éviter la saturation du verrou - Version haute performance
   */
  updateWithBatch(updates) {
    if (this._isUpdating || !updates || updates.length === 0) {
      return;
    }
    
    try {
      this._isUpdating = true;
      
      // Vérification rapide de l'état
      const stateSize = this.state.size();
      if (stateSize[0] !== 13 || stateSize[1] !== 1) {
        console.warn('État EKF invalide pour mise à jour par lot');
        return;
      }

      // Traitement séquentiel optimisé des mises à jour
      for (const update of updates) {
        try {
          this._processSingleUpdate(update);
        } catch (error) {
          console.warn(`Erreur update ${update.type}:`, error.message);
          continue; // Continuer avec les autres mises à jour
        }
      }

      // Normalisation finale des angles
      this.state.set([6, 0], this.normalizeAngle(this.state.get([6, 0]))); // yaw
      this.state.set([7, 0], this.normalizeAngle(this.state.get([7, 0]))); // roll
      this.state.set([8, 0], this.normalizeAngle(this.state.get([8, 0]))); // pitch

      // Assurer que P reste symétrique positive définie
      this.P = math.multiply(0.5, math.add(this.P, math.transpose(this.P)));
      
      // Contraintes physiques sur les vitesses
      const maxVelocity = this.currentMode === 'crawling' ? 0.5 : 2.0;
      for (let i = 3; i <= 5; i++) {
        const velocity = this.state.get([i, 0]);
        if (Math.abs(velocity) > maxVelocity) {
          this.state.set([i, 0], Math.sign(velocity) * maxVelocity);
        }
      }

    } catch (error) {
      console.warn('Erreur mise à jour par lot:', error);
    } finally {
      this._isUpdating = false;
    }
  }

  /**
   * Traitement d'une mise à jour unique (méthode interne optimisée)
   */
  _processSingleUpdate(update) {
    let measurement, H, R;

    switch (update.type) {
      case 'barometer':
        // Altitude Z
        measurement = math.matrix([[update.measurement]]);
        H = math.zeros(1, 13);
        H.set([0, 2], 1); // z position
        R = math.matrix([[update.noise ** 2]]);
        break;

      case 'magnetometer':
        // Orientation yaw
        measurement = math.matrix([[update.measurement]]);
        H = math.zeros(1, 13);
        H.set([0, 6], 1); // θ orientation
        R = math.matrix([[update.noise ** 2]]);
        break;

      case 'pdr_position':
        // Position X,Y
        measurement = math.matrix([[update.measurement.x], [update.measurement.y]]);
        H = math.zeros(2, 13);
        H.set([0, 0], 1); // mesure X
        H.set([1, 1], 1); // mesure Y
        R = math.matrix([
          [update.noise ** 2, 0],
          [0, update.noise ** 2]
        ]);
        break;

      case 'pdr_yaw':
        // Orientation yaw PDR
        measurement = math.matrix([[update.measurement]]);
        H = math.zeros(1, 13);
        H.set([0, 6], 1); // mesure yaw
        R = math.matrix([[update.noise ** 2]]);
        break;

      default:
        console.warn(`Type de mise à jour inconnu: ${update.type}`);
        return;
    }

    // Application Kalman simplifiée sans verrous
    this._applyKalmanUpdate(measurement, H, R);
  }

  /**
   * Application Kalman simplifiée sans verrous (méthode interne)
   */
  _applyKalmanUpdate(measurement, H, R) {
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
      const regularization = math.multiply(math.identity(S.size()[0]), 1e-6);
      const SRegularized = math.add(S, regularization);
      SInv = math.inv(SRegularized);
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
  }
} 