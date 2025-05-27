/**
 * Système de Dead Reckoning Piéton (PDR) avancé avec détection d'activité et ZUPT
 * Intégration AttitudeTracker pour orientation adaptative (plus d'OrientationCalibrator fixe)
 */
export class PedestrianDeadReckoning {
  constructor(config = {}) {
    this.config = {
      // Paramètres de détection de pas adaptés pour poche
      stepDetectionWindow: config.stepDetectionWindow || 30, // 30 échantillons (augmenté)
      stepThreshold: config.stepThreshold || 0.5, // 0.5 m/s² (réduit pour plus de sensibilité)
      
      // Paramètres de longueur de pas
      defaultStepLength: config.defaultStepLength || 0.7, // mètres
      heightRatio: config.heightRatio || 0.4, // ratio taille/longueur pas
      
      // Paramètres ZUPT adaptés pour poche
      zuptThreshold: config.zuptThreshold || 0.1, // m/s²
      zuptDuration: config.zuptDuration || 300, // 300ms (augmenté pour éviter micro-mouvements)
      
      // *** NOUVEAU: Paramètres détection verticale avec AttitudeTracker ***
      verticalStepDetection: {
        enabled: config.verticalStepDetection?.enabled !== false, // Activé par défaut
        verticalThreshold: config.verticalStepDetection?.verticalThreshold || 0.3, // 0.3g pour pic vertical
        minVerticalPeak: config.verticalStepDetection?.minVerticalPeak || 0.2, // 0.2g minimum
        maxVerticalPeak: config.verticalStepDetection?.maxVerticalPeak || 1.5, // 1.5g maximum
        orientationConfidenceThreshold: config.verticalStepDetection?.orientationConfidenceThreshold || 0.3, // 30% confiance min
        fallbackToMagnitude: config.verticalStepDetection?.fallbackToMagnitude !== false // Fallback activé par défaut
      },
      
      // Échantillonnage adaptatif
      baseSampleRate: config.baseSampleRate || 25, // Hz
      highSampleRate: config.highSampleRate || 100, // Hz
      motionThreshold: config.motionThreshold || 2.0, // m/s²
      
      // *** NOUVEAU: Garde-fous physiologiques (crawling supprimé) ***
      physiologicalConstraints: {
        maxStepFrequencyWalking: config.physiologicalConstraints?.maxStepFrequencyWalking || 3.0, // Hz - 3 pas/sec max en marche
        maxStepFrequencyRunning: config.physiologicalConstraints?.maxStepFrequencyRunning || 5.0, // Hz - 5 pas/sec max en course
        minStepInterval: config.physiologicalConstraints?.minStepInterval || 200, // ms - intervalle minimum absolu
        gyroConfirmationThreshold: config.physiologicalConstraints?.gyroConfirmationThreshold || 0.3, // rad/s - seuil gyro pour confirmation
        gyroConfirmationEnabled: config.physiologicalConstraints?.gyroConfirmationEnabled !== false // Activé par défaut
      },
      
      ...config
    };

    // État du système
    this.currentMode = 'walking'; // *** CORRECTION: Démarrer en walking au lieu de stationary ***
    this.currentSampleRate = this.config.baseSampleRate;
    this.lastStepTime = Date.now(); // *** CORRECTION: Initialiser avec le temps actuel ***
    this.stepCount = 0;
    
    // Buffers pour analyse
    this.accelerationBuffer = [];
    this.gyroscopeBuffer = [];
    this.magnetometerBuffer = [];
    this.barometerBuffer = [];
    
    // État ZUPT
    this.isZUPT = false;
    this.zuptStartTime = 0;
    
    // Classification d'activité
    this.activityFeatures = {
      accelerationVariance: 0,
      devicePitch: 0,
      deviceRoll: 0,
      stepFrequency: 0,
      peakAmplitude: 0
    };
    
    // Calibration utilisateur
    this.userHeight = 1.7; // mètres par défaut
    this.dynamicStepLength = this.config.defaultStepLength;
    
    // *** NOUVEAU: État pour détection verticale ***
    this.verticalDetectionState = {
      isActive: false,
      verticalAccHistory: [],
      lastVerticalPeak: 0,
      orientationConfidence: 0,
      fallbackActive: false
    };
    
    // Callbacks
    this.onStepDetected = null;
    this.onModeChanged = null;
    this.onPositionUpdate = null;
    
    // Position et orientation
    this.position = { x: 0, y: 0, z: 0 };
    this.orientation = { pitch: 0, roll: 0, yaw: 0 };
    this.velocity = { vx: 0, vy: 0, vz: 0 };

    // Ajouté pour la nouvelle méthode detectSteps
    this.accelerationHistory = [];
    
    // *** NOUVEAU: Référence vers AttitudeTracker (sera injectée) ***
    this.attitudeTracker = null;

    // *** NOUVEAU: Historique des pas pour garde-fous physiologiques ***
    this.stepHistory = []; // Timestamps des derniers pas
    this.gyroConfirmationBuffer = []; // Buffer pour confirmation gyroscopique
  }

  /**
   * Initialisation avec paramètres utilisateur
   */
  initialize(userHeight = 1.7) {
    this.userHeight = userHeight;
    this.dynamicStepLength = userHeight * this.config.heightRatio;
    console.log(`PDR initialisé - Taille: ${userHeight}m, Longueur pas: ${this.dynamicStepLength.toFixed(2)}m`);
  }

  /**
   * *** NOUVEAU: Injection de l'AttitudeTracker pour détection verticale ***
   */
  setAttitudeTracker(attitudeTracker) {
    this.attitudeTracker = attitudeTracker;
    this.verticalDetectionState.isActive = this.config.verticalStepDetection.enabled && !!attitudeTracker;
    
    if (this.verticalDetectionState.isActive) {
      console.log('[PDR] Détection verticale activée avec AttitudeTracker');
    } else {
      console.log('[PDR] Détection par magnitude (méthode classique)');
    }
  }

  /**
   * Traitement principal des données de capteurs (SIMPLIFIÉ - DÉTECTION PAS UNIQUEMENT)
   */
  processSensorData(sensorData) {
    const { accelerometer, gyroscope, magnetometer, barometer } = sensorData;
    
    // Ajout aux buffers avec données brutes
    this.updateBuffers(accelerometer, gyroscope, magnetometer, barometer);
    
    // *** SIMPLIFICATION: Mode fixe à 'walking', pas de classification ***
    this.currentMode = 'walking';
    
    // *** FOCUS: Détection de pas uniquement ***
      this.detectSteps(accelerometer);
    
    // Zero-Velocity Updates (gardé pour la stabilité)
    this.processZUPT();
    
    // Mise à jour de la position
    this.updatePosition();
    
    // Callback de mise à jour
    if (this.onPositionUpdate) {
      this.onPositionUpdate(
        this.position.x,
        this.position.y,
        this.orientation.yaw,
        this.currentMode
      );
    }
  }

  /**
   * Mise à jour des buffers de données
   */
  updateBuffers(acc, gyro, mag, baro) {
    const maxBufferSize = Math.max(this.config.stepDetectionWindow, 50);
    
    // Buffer accéléromètre
    this.accelerationBuffer.push({
      ...acc,
      magnitude: Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z),
      timestamp: Date.now()
    });
    if (this.accelerationBuffer.length > maxBufferSize) {
      this.accelerationBuffer.shift();
    }
    
    // Buffer gyroscope
    this.gyroscopeBuffer.push({
      ...gyro,
      timestamp: Date.now()
    });
    if (this.gyroscopeBuffer.length > maxBufferSize) {
      this.gyroscopeBuffer.shift();
    }
    
    // Buffer magnétomètre
    if (mag) {
      this.magnetometerBuffer.push({
        ...mag,
        timestamp: Date.now()
      });
      if (this.magnetometerBuffer.length > maxBufferSize) {
        this.magnetometerBuffer.shift();
      }
    }
    
    // Buffer baromètre
    if (baro) {
      this.barometerBuffer.push({
        pressure: baro.pressure,
        altitude: this.pressureToAltitude(baro.pressure),
        timestamp: Date.now()
      });
      if (this.barometerBuffer.length > maxBufferSize) {
        this.barometerBuffer.shift();
      }
    }
  }

  /**
   * Détection robuste de pas avec seuil adaptatif (SIMPLIFIÉE)
   */
  detectSteps(accelerometerData) {
    // Ajouter les nouvelles données
    this.accelerationHistory.push({
      ...accelerometerData,
      timestamp: Date.now()
    });

    // Garder historique de 3 secondes
    const cutoffTime = Date.now() - 3000;
    this.accelerationHistory = this.accelerationHistory.filter(
      sample => sample.timestamp > cutoffTime
    );

    if (this.accelerationHistory.length < 20) {
      return; // Pas assez de données
    }

    // *** SIMPLIFICATION: Détection par magnitude uniquement ***
      this.detectStepsMagnitude(accelerometerData);
  }

  /**
   * Détection de pas par magnitude (SIMPLIFIÉE)
   */
  detectStepsMagnitude(accelerometerData) {
    // 1. Calcul magnitude brute et suppression gravité
    const recentSamples = this.accelerationHistory.slice(-50); // 2 secondes à 25Hz
    const magnitudes = recentSamples.map(sample => {
      const linearAcc = this.removeGravityComponent(sample);
      return Math.sqrt(linearAcc.x**2 + linearAcc.y**2 + linearAcc.z**2);
    });
    
    // *** DEBUG: Log des magnitudes ***
    if (magnitudes.length > 0) {
      const lastMagnitude = magnitudes[magnitudes.length - 1];
      const maxMagnitude = Math.max(...magnitudes);
      //console.log(`[STEP DEBUG] Magnitude actuelle: ${lastMagnitude.toFixed(3)}, Max: ${maxMagnitude.toFixed(3)}, Échantillons: ${magnitudes.length}`);
    }
    
    // 2. Filtrage passe-haut (supprimer composante quasi-statique)
    const detrendedMagnitudes = this.applyDetrendingFilter(magnitudes);
    
    // 3. Détection de pics avec seuil fixe simple
    const peaks = this.detectPeaksSimple(detrendedMagnitudes);
    
    const now = Date.now();
    
    // *** DEBUG: Log des pics détectés ***
    if (peaks.length > 0) {
      console.log(`[STEP DEBUG] ${peaks.length} pics détectés:`, peaks.map(p => p.toFixed(3)));
    }
    
    // 4. *** SIMPLIFICATION: Validation temporelle basique ***
    const minStepInterval = 200; // *** RÉDUIT: 200ms minimum entre pas ***
    const timeSinceLastStep = now - this.lastStepTime;
    
    if (peaks.length > 0 && timeSinceLastStep > minStepInterval) {
      const bestPeak = peaks[peaks.length - 1];
      
      // *** SEUIL TRÈS BAS pour test ***
      const minPeakThreshold = 0.05; // *** RÉDUIT: 0.05g minimum ***
      
      console.log(`[STEP DEBUG] Meilleur pic: ${bestPeak.toFixed(3)}, Seuil: ${minPeakThreshold}, Temps: ${timeSinceLastStep}ms`);
      
      if (bestPeak >= minPeakThreshold) {
        console.log(`[STEP DÉTECTÉ] pic=${bestPeak.toFixed(3)}, interval=${timeSinceLastStep}ms`);
        
        // Pas détecté validé
        this.handleStepDetected(bestPeak, magnitudes[magnitudes.length - 1]);
      } else {
        console.log(`[STEP REJETÉ] Pic trop faible: ${bestPeak.toFixed(3)} < ${minPeakThreshold}`);
      }
    } else if (peaks.length > 0) {
      console.log(`[STEP REJETÉ] Intervalle trop court: ${timeSinceLastStep}ms < ${minStepInterval}ms`);
    }
  }

  /**
   * *** NOUVEAU: Détection de pics simplifiée ***
   */
  detectPeaksSimple(data) {
    if (data.length < 5) return [];
    
    // Seuil fixe simple basé sur la moyenne + écart-type
    const mean = data.reduce((a, b) => a + b) / data.length;
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);
    
    // Seuil simple: moyenne + 1.5 * écart-type
    const threshold = mean + 1.5 * std;
    
    // Contraintes raisonnables
    const finalThreshold = Math.max(0.1, Math.min(0.8, threshold));
    
    // Détection de pics locaux simples
    const peaks = [];
    for (let i = 2; i < data.length - 2; i++) {
      const current = data[i];
      const prev1 = data[i - 1];
      const prev2 = data[i - 2];
      const next1 = data[i + 1];
      const next2 = data[i + 2];
      
      // Conditions simples pour un pic
      const isLocalMaximum = current > prev1 && current > next1 && 
                            current > prev2 && current > next2;
      const isAboveThreshold = current > finalThreshold;
      
      if (isLocalMaximum && isAboveThreshold) {
        peaks.push(current);
      }
    }
    
    return peaks;
  }

  /**
   * Filtrage passe-haut par détrending (supprime moyenne glissante)
   */
  applyDetrendingFilter(magnitudes) {
    if (magnitudes.length < 10) return magnitudes;
    
    // Calculer moyenne glissante sur ~1 seconde (25 échantillons)
    const windowSize = Math.min(25, magnitudes.length);
    const detrended = [];
    
    for (let i = 0; i < magnitudes.length; i++) {
      // Fenêtre centrée autour de l'échantillon i
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(magnitudes.length, start + windowSize);
      
      const window = magnitudes.slice(start, end);
      const movingAverage = window.reduce((sum, val) => sum + val, 0) / window.length;
      
      // Soustraire la moyenne glissante (supprime composante lente)
      detrended.push(Math.abs(magnitudes[i] - movingAverage));
    }
    
    return detrended;
  }

  /**
   * Obtenir le dernier seuil adaptatif calculé (pour debug)
   */
  getLastAdaptiveThreshold() {
    return this._lastAdaptiveThreshold || 0.5;
  }

  /**
   * Suppression de la composante gravité en temps réel (NOUVEAU - sans calibration poche)
   */
  removeGravityComponent(acceleration) {
    // *** NOUVELLE APPROCHE: Estimation dynamique de la gravité sans calibration fixe ***
    
    // Historique de fenêtre glissante pour estimer la gravité locale
    this.gravityWindow = this.gravityWindow || [];
    this.gravityWindow.push({ ...acceleration });
    
    // Garder seulement les 15 derniers échantillons (0.6s à 25Hz)
    if (this.gravityWindow.length > 15) {
      this.gravityWindow.shift();
    }
    
    // Estimation de la gravité par moyenne mobile si fenêtre suffisante
    if (this.gravityWindow.length >= 10) {
      const gravityEstimate = {
        x: this.gravityWindow.reduce((sum, acc) => sum + acc.x, 0) / this.gravityWindow.length,
        y: this.gravityWindow.reduce((sum, acc) => sum + acc.y, 0) / this.gravityWindow.length,
        z: this.gravityWindow.reduce((sum, acc) => sum + acc.z, 0) / this.gravityWindow.length
      };
      
      // Soustraction adaptative de la gravité
      return {
        x: acceleration.x - gravityEstimate.x,
        y: acceleration.y - gravityEstimate.y, 
        z: acceleration.z - gravityEstimate.z
      };
    } else {
      // Fallback : estimation simple de gravité
      const magnitude = Math.sqrt(acceleration.x**2 + acceleration.y**2 + acceleration.z**2);
      if (magnitude > 8 && magnitude < 12) {
        // L'accélération semble contenir principalement la gravité
        const scale = 9.81 / magnitude;
        return {
          x: acceleration.x - acceleration.x * scale,
          y: acceleration.y - acceleration.y * scale,
          z: acceleration.z - acceleration.z * scale
        };
      } else {
        // Pas de compensation si magnitude anormale
        return acceleration;
      }
    }
  }

  /**
   * *** NOUVEAU: Gestion des transitions de mode (crawling supprimé) ***
   */
  handleModeTransition(previousMode, newMode) {
    // Réinitialiser la vitesse lors des transitions
    if (previousMode !== newMode) {
      console.log(`[TRANSITION] ${previousMode} → ${newMode}`);
      
      // Réinitialiser la vitesse pour le nouveau mode
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.velocity.vz = 0;
    }
  }

  /**
   * Mise à jour dynamique de la longueur de pas (corrigée pour amplitudes filtrées)
   */
  updateDynamicStepLength(peakAmplitude) {
    // Modèle adaptatif basé sur l'amplitude du pic filtré
    const baseLength = this.userHeight * this.config.heightRatio;
    
    // *** BUG FIX: Ajustement pour amplitudes filtrées (plus petites) ***
    // Les amplitudes filtrées sont généralement entre 0.5 et 3.0
    const normalizedAmplitude = Math.max(0.5, Math.min(3.0, peakAmplitude));
    const amplitudeFactor = 0.7 + (normalizedAmplitude - 0.5) * 0.4 / 2.5; // [0.7, 1.1]
    
    // Adaptation selon le mode
    let modeFactor = 1.0;
    switch (this.currentMode) {
      case 'running':
        modeFactor = 1.2; // Pas plus longs en course
        break;
      case 'walking':
        modeFactor = 1.0; // Standard
        break;
      default:
        modeFactor = 1.0; // Par défaut
    }
    
    const adjustedLength = baseLength * amplitudeFactor * modeFactor;
    
    // Lissage exponentiel plus lent pour éviter les fluctuations
    const alpha = 0.05;
    this.dynamicStepLength = (1 - alpha) * this.dynamicStepLength + 
                            alpha * adjustedLength;
    
    // Contraintes raisonnables
    this.dynamicStepLength = Math.max(0.3, Math.min(1.2, this.dynamicStepLength));
  }

  /**
   * Zero-Velocity Updates (ZUPT)
   */
  processZUPT() {
    if (this.accelerationBuffer.length < 5) return;
    
    // Vérification de la stabilité
    const recentAcc = this.accelerationBuffer.slice(-5);
    const variance = this.calculateVariance(recentAcc.map(a => a.magnitude));
    
    const now = Date.now();
    
    if (variance < this.config.zuptThreshold) {
      if (!this.isZUPT) {
        this.isZUPT = true;
        this.zuptStartTime = now;
      } else if ((now - this.zuptStartTime) > this.config.zuptDuration) {
        // Appliquer ZUPT - réinitialiser la vitesse
        this.velocity.vx *= 0.1;
        this.velocity.vy *= 0.1;
        this.velocity.vz *= 0.1;
      }
    } else {
      this.isZUPT = false;
    }
  }

  /**
   * Adaptation du taux d'échantillonnage
   */
  adaptSampleRate() {
    if (this.accelerationBuffer.length < 5) return;
    
    const recentAcc = this.accelerationBuffer.slice(-5);
    const maxAcceleration = Math.max(...recentAcc.map(a => a.magnitude));
    
    const targetRate = maxAcceleration > this.config.motionThreshold ? 
      this.config.highSampleRate : this.config.baseSampleRate;
    
    if (targetRate !== this.currentSampleRate) {
      this.currentSampleRate = targetRate;
      console.log(`Taux échantillonnage adapté: ${this.currentSampleRate} Hz`);
    }
  }

  /**
   * Mise à jour de la position basée sur PDR améliorée
   */
  updatePosition() {
    if (this.accelerationBuffer.length < 2 || this.gyroscopeBuffer.length < 2) return;
    
    const lastAcc = this.accelerationBuffer[this.accelerationBuffer.length - 1];
    const prevAcc = this.accelerationBuffer[this.accelerationBuffer.length - 2];
    const lastGyro = this.gyroscopeBuffer[this.gyroscopeBuffer.length - 1];
    
    const dt = (lastAcc.timestamp - prevAcc.timestamp) / 1000;
    
    // Mise à jour orientation avec correction
    this.updateOrientation(lastGyro, dt);
    
    // *** BUG FIX: Mise à jour position uniquement sur détection de pas validé ***
    // Ne plus mettre à jour la position de façon continue, seulement sur pas détecté
    // La position sera mise à jour via le callback onStepDetected
    
    // Traitement de l'altitude avec baromètre (indépendant des pas)
    this.updateAltitude();
  }

  /**
   * Mise à jour de l'orientation avec filtrage
   */
  updateOrientation(gyroData, dt) {
    // Filtrage des données gyroscope pour éviter la dérive
    const maxAngularVelocity = 10; // rad/s - limite raisonnable
    
    const filteredGyro = {
      x: Math.max(-maxAngularVelocity, Math.min(maxAngularVelocity, gyroData.x)),
      y: Math.max(-maxAngularVelocity, Math.min(maxAngularVelocity, gyroData.y)),
      z: Math.max(-maxAngularVelocity, Math.min(maxAngularVelocity, gyroData.z))
    };
    
    // Mise à jour avec correction de dérive
    this.orientation.yaw += filteredGyro.z * dt;
    this.orientation.pitch += filteredGyro.x * dt * 0.1; // Réduction du facteur pour pitch/roll
    this.orientation.roll += filteredGyro.y * dt * 0.1;
    
    // Normalisation des angles
    this.orientation.yaw = this.normalizeAngle(this.orientation.yaw);
    this.orientation.pitch = this.normalizeAngle(this.orientation.pitch);
    this.orientation.roll = this.normalizeAngle(this.orientation.roll);
  }

  /**
   * Mise à jour de l'altitude via baromètre
   */
  updateAltitude() {
    if (this.barometerBuffer.length >= 2) {
      const lastBaro = this.barometerBuffer[this.barometerBuffer.length - 1];
      const prevBaro = this.barometerBuffer[this.barometerBuffer.length - 2];
      const altitudeChange = lastBaro.altitude - prevBaro.altitude;
      
      // Filtrage des changements d'altitude aberrants
      if (Math.abs(altitudeChange) < 1.0) { // Plus strict : 1m max
        this.position.z += altitudeChange;
      }
    }
  }

  /**
   * Mise à jour de position sur pas détecté (appelée depuis detectSteps)
   */
  advancePositionOnStep() {
    // Avancer la position seulement quand un pas est validé
    const stepDistance = this.dynamicStepLength;
    
    // Utiliser l'orientation actuelle
    this.position.x += stepDistance * Math.cos(this.orientation.yaw);
    this.position.y += stepDistance * Math.sin(this.orientation.yaw);
    
    console.log(`[PDR] Position mise à jour: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}) - Distance pas: ${stepDistance.toFixed(2)}m`);
  }

  /**
   * Normalisation d'angle [-π, π]
   */
  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * Conversion pression vers altitude
   */
  pressureToAltitude(pressure, seaLevelPressure = 1013.25) {
    return 44330 * (1 - Math.pow(pressure / seaLevelPressure, 0.1903));
  }

  /**
   * Calcul de variance
   */
  calculateVariance(data) {
    const mean = data.reduce((a, b) => a + b) / data.length;
    return data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
  }

  /**
   * Réinitialisation de la position
   */
  resetPosition(x = 0, y = 0, z = 0, yaw = 0) {
    this.position = { x, y, z };
    this.orientation.yaw = yaw;
    this.stepCount = 0;
    console.log(`Position PDR réinitialisée: (${x}, ${y}, ${z})`);
  }

  /**
   * Obtenir l'état actuel (SIMPLIFIÉ)
   */
  getState() {
    return {
      position: { ...this.position },
      orientation: { ...this.orientation },
      velocity: { ...this.velocity },
      mode: this.currentMode, // Toujours 'walking'
      stepCount: this.stepCount,
      totalDistance: this.stepCount * this.dynamicStepLength, // Distance simple
      sampleRate: this.currentSampleRate,
      isZUPT: this.isZUPT
    };
  }

  /**
   * *** NOUVEAU: Obtenir la méthode de détection actuelle ***
   */
  getDetectionMethod() {
    if (!this.verticalDetectionState.isActive) {
      return 'magnitude_only';
    }
    
    if (this.verticalDetectionState.fallbackActive) {
      return 'magnitude_fallback';
    }
    
    if (this.shouldUseVerticalDetection()) {
      return 'vertical_projection';
    }
    
    return 'magnitude_default';
  }

  /**
   * *** NOUVEAU: Obtenir les métriques détaillées de détection verticale ***
   */
  getVerticalDetectionMetrics() {
    if (!this.verticalDetectionState.isActive) {
      return null;
    }
    
    const attitudeStatus = this.attitudeTracker ? this.attitudeTracker.getStatus() : null;
    
    return {
      // État général
      isActive: this.verticalDetectionState.isActive,
      currentMethod: this.getDetectionMethod(),
      
      // Confiance d'orientation
      orientationConfidence: this.verticalDetectionState.orientationConfidence,
      orientationValid: attitudeStatus ? 
        !(attitudeStatus.quaternion.w === 1 && attitudeStatus.quaternion.x === 0) : false,
      
      // État du fallback
      fallbackActive: this.verticalDetectionState.fallbackActive,
      fallbackStartTime: this.verticalDetectionState.fallbackStartTime,
      
      // Historique vertical
      verticalHistoryLength: this.verticalDetectionState.verticalAccHistory.length,
      lastVerticalPeak: this.verticalDetectionState.lastVerticalPeak,
      
      // Configuration
      config: this.config.verticalStepDetection,
      
      // AttitudeTracker status
      attitudeStatus: attitudeStatus
    };
  }

  /**
   * Configuration des callbacks
   */
  setCallbacks({ onStepDetected, onModeChanged, onPositionUpdate }) {
    this.onStepDetected = onStepDetected;
    this.onModeChanged = onModeChanged;
    this.onPositionUpdate = onPositionUpdate;
  }

  /**
   * Mise à jour du mode d'activité (nouvelle méthode pour AttitudeTracker)
   */
  updateActivityMode(mode) {
    if (mode !== this.currentMode) {
      const previousMode = this.currentMode;
      this.currentMode = mode;
      
      if (this.onModeChanged) {
        this.onModeChanged(mode, this.activityFeatures);
      }
      
      console.log(`[PDR] Mode changé: ${previousMode} → ${mode}`);
    }
  }

  /**
   * Traitement d'un pas détecté validé (SIMPLIFIÉ)
   */
  handleStepDetected(peakAmplitude, originalMagnitude) {
    const now = Date.now();
    
    this.stepCount++;
    this.lastStepTime = now;
    
    // Estimation dynamique de la longueur de pas
    this.updateDynamicStepLength(peakAmplitude);
    
    // Avancer la position seulement sur pas validé
    this.advancePositionOnStep();
    
    // *** SIMPLIFICATION: Callbacks immédiats sans validation complexe ***
    if (this.onStepDetected) {
      this.onStepDetected(this.stepCount, this.dynamicStepLength);
    }
    
    // *** NOUVEAU: Callback position update immédiat ***
    if (this.onPositionUpdate) {
      this.onPositionUpdate(
        this.position.x,
        this.position.y,
        this.orientation.yaw,
        this.currentMode
      );
    }
    
    // Log simple
    console.log(`[STEP SIMPLE] #${this.stepCount}: pos=(${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}), longueur=${this.dynamicStepLength.toFixed(3)}m`);
  }

  /**
   * *** NOUVEAU: Calcul de la fréquence actuelle de pas ***
   */
  getCurrentStepFrequency() {
    if (this.stepHistory.length < 2) {
      return 0;
    }
    
    // Calculer la fréquence sur les 5 derniers pas (plus stable)
    const recentSteps = this.stepHistory.slice(-5);
    if (recentSteps.length < 2) {
      return 0;
    }
    
    const timeSpan = (recentSteps[recentSteps.length - 1] - recentSteps[0]) / 1000; // en secondes
    const stepCount = recentSteps.length - 1; // nombre d'intervalles
    
    if (timeSpan <= 0) {
      return 0;
    }
    
    return stepCount / timeSpan; // Hz
  }

  /**
   * *** NOUVEAU: Obtenir la fréquence maximale autorisée selon le mode (SEUILS DÉTENDUS) ***
   */
  getMaxAllowedFrequency() {
     const MAX_FREQ = {
       walking: 4.0,   // Augmenté de 3.0 à 4.0 Hz
       running: 8.0,   // Augmenté de 5.0 à 8.0 Hz
      stationary: 3.0 // *** CORRECTION: Augmenté de 0.5 à 3.0 Hz pour permettre marche ***
     }[this.currentMode] || 4.0;
    
    return MAX_FREQ;
  }

  /**
   * *** NOUVEAU: Obtenir la dernière activité gyroscopique ***
   */
  getLastGyroActivity() {
    if (this.gyroConfirmationBuffer.length === 0) {
      return 0;
    }
    
    const recentGyro = this.gyroConfirmationBuffer.slice(-5);
    const gyroMagnitudes = recentGyro.map(sample => 
      Math.sqrt(sample.x**2 + sample.y**2 + sample.z**2)
    );
    
    return Math.max(...gyroMagnitudes);
  }

  /**
   * *** NOUVEAU: Test des garde-fous physiologiques ***
   */
  testPhysiologicalGuards() {
    console.log('[TEST PHYSIO] === Test des garde-fous physiologiques ===');
    
    const config = this.config.physiologicalConstraints;
    console.log('[TEST PHYSIO] Configuration:');
    console.log(`[TEST PHYSIO] - Max fréq marche: ${config.maxStepFrequencyWalking}Hz`);
    console.log(`[TEST PHYSIO] - Max fréq course: ${config.maxStepFrequencyRunning}Hz`);
    console.log(`[TEST PHYSIO] - Max fréq ramper: ${config.maxStepFrequencyCrawling}Hz`);
    console.log(`[TEST PHYSIO] - Intervalle min: ${config.minStepInterval}ms`);
    console.log(`[TEST PHYSIO] - Confirmation gyro: ${config.gyroConfirmationEnabled}`);
    console.log(`[TEST PHYSIO] - Seuil gyro: ${config.gyroConfirmationThreshold}rad/s`);
    
    // Test fréquence actuelle
    const currentFreq = this.getCurrentStepFrequency();
    const maxFreq = this.getMaxAllowedFrequency();
    console.log(`[TEST PHYSIO] Fréquence actuelle: ${currentFreq.toFixed(2)}Hz (max: ${maxFreq}Hz)`);
    
    // Test historique des pas
    console.log(`[TEST PHYSIO] Historique pas: ${this.stepHistory.length} pas enregistrés`);
    if (this.stepHistory.length > 1) {
      const lastInterval = this.stepHistory[this.stepHistory.length - 1] - this.stepHistory[this.stepHistory.length - 2];
      console.log(`[TEST PHYSIO] Dernier intervalle: ${lastInterval}ms`);
    }
    
    // Test buffer gyroscopique
    console.log(`[TEST PHYSIO] Buffer gyro: ${this.gyroConfirmationBuffer.length} échantillons`);
    const lastGyroActivity = this.getLastGyroActivity();
    console.log(`[TEST PHYSIO] Dernière activité gyro: ${lastGyroActivity.toFixed(3)}rad/s`);
    
    // Simulation de validation
    const now = Date.now();
    const wouldValidate = this.validateStepPhysiologically(now);
    console.log(`[TEST PHYSIO] Validation actuelle: ${wouldValidate ? '✓ PASS' : '✗ FAIL'}`);
    
    console.log('[TEST PHYSIO] === Fin du test ===');
    
    return {
      currentFrequency: currentFreq,
      maxAllowedFrequency: maxFreq,
      stepHistoryLength: this.stepHistory.length,
      gyroBufferLength: this.gyroConfirmationBuffer.length,
      lastGyroActivity: lastGyroActivity,
      wouldValidate: wouldValidate,
      config: config
    };
  }
} 