import { create, all } from 'mathjs';

const math = create(all);

/**
 * Filtre de Kalman Étendu pour la localisation intérieure
 * État: [x, y, θ, vx, vy, ω] où:
 * - x, y: position en mètres
 * - θ: orientation en radians
 * - vx, vy: vitesse en m/s
 * - ω: vitesse angulaire en rad/s
 */
export class ExtendedKalmanFilter {
  constructor(config = {}) {
    // Configuration par défaut
    this.config = {
      processNoise: config.processNoise || 0.1,
      measurementNoise: config.measurementNoise || 0.5,
      initialUncertainty: config.initialUncertainty || 10.0,
      accelerometerNoise: config.accelerometerNoise || 0.1,
      gyroscopeNoise: config.gyroscopeNoise || 0.05,
      magnetometerNoise: config.magnetometerNoise || 0.2,
      ...config
    };

    // État initial [x, y, θ, vx, vy, ω]
    this.state = math.matrix([
      [0], // x position
      [0], // y position  
      [0], // θ orientation
      [0], // vx velocity
      [0], // vy velocity
      [0]  // ω angular velocity
    ]);

    // Matrice de covariance de l'état
    this.P = math.multiply(
      math.identity(6),
      this.config.initialUncertainty
    );

    // Matrice de bruit de processus Q
    this.Q = math.multiply(
      math.identity(6),
      this.config.processNoise
    );

    // Matrices pour les mesures
    this.R_acc = math.multiply(
      math.identity(2),
      this.config.accelerometerNoise
    );

    this.R_gyro = math.multiply(
      math.identity(1),
      this.config.gyroscopeNoise
    );

    this.R_mag = math.multiply(
      math.identity(1),
      this.config.magnetometerNoise
    );

    this.lastUpdate = Date.now();
  }

  /**
   * Prédiction basée sur le modèle de mouvement
   */
  predict(dt) {
    if (dt <= 0) return;

    const x = this.state.get([0, 0]);
    const y = this.state.get([1, 0]);
    const theta = this.state.get([2, 0]);
    const vx = this.state.get([3, 0]);
    const vy = this.state.get([4, 0]);
    const omega = this.state.get([5, 0]);

    // Modèle de mouvement avec vitesse constante et rotation
    const newX = x + vx * dt * Math.cos(theta) - vy * dt * Math.sin(theta);
    const newY = y + vx * dt * Math.sin(theta) + vy * dt * Math.cos(theta);
    const newTheta = this.normalizeAngle(theta + omega * dt);

    // Mise à jour de l'état prédit
    this.state.set([0, 0], newX);
    this.state.set([1, 0], newY);
    this.state.set([2, 0], newTheta);

    // Calcul de la matrice jacobienne F pour la linéarisation
    const F = this.getStateTransitionJacobian(dt);

    // Mise à jour de la covariance: P = F * P * F^T + Q
    this.P = math.add(
      math.multiply(math.multiply(F, this.P), math.transpose(F)),
      math.multiply(this.Q, dt * dt)
    );
  }

  /**
   * Mise à jour avec mesures d'accéléromètre
   */
  updateWithAccelerometer(acceleration) {
    const { x: ax, y: ay, z: az } = acceleration;
    
    // Compensation de la gravité et transformation en accélération horizontale
    const theta = this.state.get([2, 0]);
    const gravityCompensated = this.compensateGravity(ax, ay, az, theta);
    
    const measurement = math.matrix([[gravityCompensated.ax], [gravityCompensated.ay]]);
    
    // Matrice d'observation H pour l'accéléromètre
    const H = math.zeros(2, 6);
    H.set([0, 3], 1); // vx
    H.set([1, 4], 1); // vy
    
    this.updateMeasurement(measurement, H, this.R_acc);
  }

  /**
   * Mise à jour avec mesures de gyroscope
   */
  updateWithGyroscope(angularVelocity) {
    const measurement = math.matrix([[angularVelocity.z]]);
    
    // Matrice d'observation pour le gyroscope
    const H = math.zeros(1, 6);
    H.set([0, 5], 1); // ω
    
    this.updateMeasurement(measurement, H, this.R_gyro);
  }

  /**
   * Mise à jour avec mesures de magnétomètre (orientation absolue)
   */
  updateWithMagnetometer(magneticField) {
    const { x: mx, y: my } = magneticField;
    
    // Calcul de l'orientation à partir du champ magnétique
    const measuredHeading = Math.atan2(my, mx);
    const measurement = math.matrix([[measuredHeading]]);
    
    // Matrice d'observation pour le magnétomètre
    const H = math.zeros(1, 6);
    H.set([0, 2], 1); // θ
    
    this.updateMeasurement(measurement, H, this.R_mag);
  }

  /**
   * Mise à jour générique avec une mesure
   */
  updateMeasurement(measurement, H, R) {
    try {
      // Innovation: y = z - H * x
      const predicted = math.multiply(H, this.state);
      const innovation = math.subtract(measurement, predicted);

      // Matrice de covariance d'innovation: S = H * P * H^T + R
      const S = math.add(
        math.multiply(math.multiply(H, this.P), math.transpose(H)),
        R
      );

      // Gain de Kalman: K = P * H^T * S^(-1)
      const K = math.multiply(
        math.multiply(this.P, math.transpose(H)),
        math.inv(S)
      );

      // Mise à jour de l'état: x = x + K * y
      this.state = math.add(this.state, math.multiply(K, innovation));

      // Mise à jour de la covariance: P = (I - K * H) * P
      const I = math.identity(6);
      this.P = math.multiply(
        math.subtract(I, math.multiply(K, H)),
        this.P
      );

      // Normalisation de l'angle
      this.state.set([2, 0], this.normalizeAngle(this.state.get([2, 0])));

    } catch (error) {
      console.warn('Erreur lors de la mise à jour Kalman:', error);
    }
  }

  /**
   * Calcul de la matrice jacobienne de transition d'état
   */
  getStateTransitionJacobian(dt) {
    const theta = this.state.get([2, 0]);
    const vx = this.state.get([3, 0]);
    const vy = this.state.get([4, 0]);

    const F = math.identity(6);
    
    // Dérivées partielles pour la position
    F.set([0, 2], -vx * dt * Math.sin(theta) - vy * dt * Math.cos(theta)); // ∂x/∂θ
    F.set([0, 3], dt * Math.cos(theta)); // ∂x/∂vx
    F.set([0, 4], -dt * Math.sin(theta)); // ∂x/∂vy
    
    F.set([1, 2], vx * dt * Math.cos(theta) - vy * dt * Math.sin(theta)); // ∂y/∂θ
    F.set([1, 3], dt * Math.sin(theta)); // ∂y/∂vx
    F.set([1, 4], dt * Math.cos(theta)); // ∂y/∂vy
    
    F.set([2, 5], dt); // ∂θ/∂ω

    return F;
  }

  /**
   * Compensation de la gravité dans les mesures d'accélération
   */
  compensateGravity(ax, ay, az, theta) {
    const gravity = 9.81;
    
    // Estimation de l'inclinaison du dispositif
    const roll = Math.atan2(ay, az);
    const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
    
    // Compensation de la gravité
    const ax_comp = ax + gravity * Math.sin(pitch);
    const ay_comp = ay - gravity * Math.sin(roll) * Math.cos(pitch);
    
    // Rotation dans le référentiel monde
    const ax_world = ax_comp * Math.cos(theta) - ay_comp * Math.sin(theta);
    const ay_world = ax_comp * Math.sin(theta) + ay_comp * Math.cos(theta);
    
    return { ax: ax_world, ay: ay_world };
  }

  /**
   * Normalisation des angles entre -π et π
   */
  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * Obtenir la pose actuelle [x, y, θ]
   */
  getPose() {
    return {
      x: this.state.get([0, 0]),
      y: this.state.get([1, 0]),
      theta: this.state.get([2, 0]),
      confidence: this.getConfidence()
    };
  }

  /**
   * Calcul du niveau de confiance basé sur la trace de P
   */
  getConfidence() {
    const trace = this.P.get([0, 0]) + this.P.get([1, 1]) + this.P.get([2, 2]);
    return Math.max(0, Math.min(1, 1 / (1 + trace)));
  }

  /**
   * Obtenir la vitesse actuelle
   */
  getVelocity() {
    return {
      vx: this.state.get([3, 0]),
      vy: this.state.get([4, 0]),
      omega: this.state.get([5, 0])
    };
  }

  /**
   * Réinitialisation du filtre
   */
  reset(initialPose = { x: 0, y: 0, theta: 0 }) {
    this.state.set([0, 0], initialPose.x);
    this.state.set([1, 0], initialPose.y);
    this.state.set([2, 0], initialPose.theta);
    this.state.set([3, 0], 0);
    this.state.set([4, 0], 0);
    this.state.set([5, 0], 0);

    this.P = math.multiply(
      math.identity(6),
      this.config.initialUncertainty
    );

    this.lastUpdate = Date.now();
  }
} 