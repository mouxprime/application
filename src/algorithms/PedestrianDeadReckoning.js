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
    this.lastStepTime = 0;
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
    
    // *** NOUVEAU: Contrôle de classification automatique/manuelle ***
    this.autoClassificationEnabled = true;
    this.manualModeOverride = null;
    
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
   * Traitement principal des données de capteurs (SIMPLIFIÉ - plus d'OrientationCalibrator)
   */
  processSensorData(sensorData) {
    const { accelerometer, gyroscope, magnetometer, barometer } = sensorData;
    
    // Ajout aux buffers avec données brutes (transformation via AttitudeTracker dans LocalizationSDK)
    this.updateBuffers(accelerometer, gyroscope, magnetometer, barometer);
    
    // *** MODIFICATION 1: Toujours calculer stepFrequency et peakAmplitude pour classification ***
    this.computeStepMetricsForClassification();
    
    // Classification d'activité
    this.classifyActivity();
    
    // Adaptation du taux d'échantillonnage
    this.adaptSampleRate();
    
    // *** CORRECTION CRITIQUE: Toujours essayer de détecter des pas pour sortir du cercle vicieux ***
    // La détection doit être active même en mode stationary pour permettre la transition
    this.detectSteps(accelerometer);
    
    // Zero-Velocity Updates
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
    
    // *** NOUVEAU: Mise à jour du buffer de confirmation gyroscopique ***
    this.updateGyroConfirmationBuffer(gyro);
    
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
   * *** NOUVEAU: Calcul des métriques de pas pour classification (toujours exécuté) ***
   */
  computeStepMetricsForClassification() {
    if (this.accelerationBuffer.length < this.config.stepDetectionWindow) {
      // Pas assez de données - réinitialiser les métriques
      this.activityFeatures.stepFrequency = 0;
      this.activityFeatures.peakAmplitude = 0;
      return;
    }
    
    // Calcul des magnitudes détrended pour détection de pics
    const recentAcc = this.accelerationBuffer.slice(-this.config.stepDetectionWindow);
    const magnitudes = recentAcc.map(sample => sample.magnitude);
    const detrendedMagnitudes = this.applyDetrendingFilter(magnitudes);
    
    // Détection de pics sur la fenêtre d'analyse
    const peaks = this.detectPeaks(detrendedMagnitudes);
    
    // Durée de la fenêtre en secondes
    const windowDurationSec = this.config.stepDetectionWindow / this.currentSampleRate;
    
    // Mise à jour des métriques pour classification
    this.activityFeatures.stepFrequency = peaks.length / windowDurationSec;
    this.activityFeatures.peakAmplitude = peaks.length > 0 ? Math.max(...peaks) : 0;
    
    // Debug périodique
    // if (this.accelerationBuffer.length % 25 === 0) { // Toutes les secondes à 25Hz
    //   console.log(`[METRICS] Freq: ${this.activityFeatures.stepFrequency.toFixed(2)}Hz, Amp: ${this.activityFeatures.peakAmplitude.toFixed(2)}, Pics: ${peaks.length}, Mode: ${this.currentMode}`);
    // }
  }

  /**
   * Classification d'activité adaptée pour usage en poche (AMÉLIORÉE)
   */
  classifyActivity() {
    if (this.accelerationBuffer.length < this.config.stepDetectionWindow) return;
    
    // *** NOUVEAU: Vérifier si mode manuel activé ***
    if (!this.autoClassificationEnabled && this.manualModeOverride) {
      // Mode manuel - forcer le mode spécifié
      const previousMode = this.currentMode;
      this.currentMode = this.manualModeOverride;
      
      // Notification changement de mode si différent
      if (previousMode !== this.currentMode && this.onModeChanged) {
        console.log(`[MODE MANUEL] ${previousMode} → ${this.currentMode} (forcé)`);
        this.handleModeTransition(previousMode, this.currentMode);
        this.onModeChanged(this.currentMode, this.activityFeatures);
      }
      
      return; // Sortir sans classification automatique
    }
    
    // *** CLASSIFICATION AUTOMATIQUE (code existant) ***
    
    // Calcul des caractéristiques basées sur la magnitude uniquement
    const recentAcc = this.accelerationBuffer.slice(-this.config.stepDetectionWindow);
    
    // Variance de l'accélération (magnitude)
    const accMagnitudes = recentAcc.map(a => a.magnitude);
    const meanAcc = accMagnitudes.reduce((a, b) => a + b) / accMagnitudes.length;
    this.activityFeatures.accelerationVariance = accMagnitudes.reduce((acc, val) => 
      acc + Math.pow(val - meanAcc, 2), 0) / accMagnitudes.length;
    
    // *** MODIFICATION 2: Calcul de l'orientation pour confirmation de posture ***
    const lastAcc = recentAcc[recentAcc.length - 1];
    this.activityFeatures.devicePitch = Math.atan2(-lastAcc.x, 
      Math.sqrt(lastAcc.y * lastAcc.y + lastAcc.z * lastAcc.z)) * 180 / Math.PI;
    this.activityFeatures.deviceRoll = Math.atan2(lastAcc.y, lastAcc.z) * 180 / Math.PI;
    
    // *** MODIFICATION 1: stepFrequency et peakAmplitude sont maintenant calculés dans computeStepMetricsForClassification ***
    // Les métriques sont déjà à jour, pas besoin de les recalculer ici
    
    // *** MODIFICATION 2: CLASSIFICATION AMÉLIORÉE avec seuils plus permissifs et orientation ***
    const previousMode = this.currentMode;
    const variance = this.activityFeatures.accelerationVariance;
    const frequency = this.activityFeatures.stepFrequency;
    const amplitude = this.activityFeatures.peakAmplitude;
    const pitch = Math.abs(this.activityFeatures.devicePitch);
    
    // *** MODIFICATION 2: Seuils plus permissifs pour transition vers walking ***
    const varThresholdWalk = 0.7;    // Augmenté de 0.5 à 0.7
    const freqThreshold = 0.1;       // 0.1 Hz = 1 pic toutes les 10s
    
    if (variance < 0.2) {
      // Stationnaire : variance très faible
      this.currentMode = 'stationary';
    } else if (amplitude > 1.0) {
      // *** MODIFICATION 2: Gros pic = directement walking ***
      this.currentMode = 'walking';
    } else if (pitch > 30 && pitch < 60) {
      // *** MODIFICATION 3: Posture de marche (téléphone en poche) ***
      this.currentMode = 'walking';
    } else if (frequency >= freqThreshold) {
      // *** MODIFICATION 2: Autoriser walking dès qu'on détecte au moins 1 pic sur la fenêtre ***
      if (frequency >= 2.5 || (amplitude > 1.2 && frequency > 2.0)) {
        this.currentMode = 'running';
      } else {
        this.currentMode = 'walking';
      }
    } else if (variance > varThresholdWalk) {
      // *** MODIFICATION 2: Si variance déjà assez haute, considérer comme marche ***
      this.currentMode = 'walking';
    } else {
      // *** CRAWLING SUPPRIMÉ: Mode par défaut = walking ***
      this.currentMode = 'walking';
    }
    
    // Notification changement de mode avec plus d'infos
    if (previousMode !== this.currentMode && this.onModeChanged) {
      const modeLabel = this.autoClassificationEnabled ? 'AUTO' : 'MANUEL';
      console.log(`[MODE ${modeLabel}] ${previousMode} → ${this.currentMode} | Var:${variance.toFixed(3)}, Freq:${frequency.toFixed(2)}Hz, Amp:${amplitude.toFixed(2)}, Pitch:${pitch.toFixed(1)}°`);
      
      // *** NOUVEAU: Gestion des transitions de mode ***
      this.handleModeTransition(previousMode, this.currentMode);
      
      this.onModeChanged(this.currentMode, this.activityFeatures);
    }
  }

  /**
   * Détection robuste de pas avec seuil adaptatif (REFACTORISÉE)
   * *** NOUVEAU: Utilise projection verticale avec AttitudeTracker si disponible ***
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

    // *** NOUVEAU: Choix de la méthode de détection ***
    const shouldUseVerticalDetection = this.shouldUseVerticalDetection();
    
    if (shouldUseVerticalDetection) {
      this.detectStepsVertical(accelerometerData);
    } else {
      this.detectStepsMagnitude(accelerometerData);
    }
  }

  /**
   * *** NOUVEAU: Détection de pas basée sur la composante verticale ***
   */
  detectStepsVertical(accelerometerData) {
    try {
      // 1. Projeter l'accélération dans le repère terrestre (North-East-Up)
      const worldAcceleration = this.projectAccelerationToWorld(accelerometerData);
      if (!worldAcceleration) {
        // Fallback vers détection par magnitude
        this.verticalDetectionState.fallbackActive = true;
        this.verticalDetectionState.fallbackStartTime = Date.now();
        this.detectStepsMagnitude(accelerometerData);
        return;
      }
      
      // 2. Extraire la composante verticale (Up)
      const verticalAcc = worldAcceleration.up;
      
      // 3. Ajouter à l'historique vertical
      this.verticalDetectionState.verticalAccHistory.push({
        vertical: verticalAcc,
        timestamp: Date.now()
      });
      
      // Garder historique de 2 secondes
      const cutoffTime = Date.now() - 2000;
      this.verticalDetectionState.verticalAccHistory = this.verticalDetectionState.verticalAccHistory.filter(
        sample => sample.timestamp > cutoffTime
      );
      
      if (this.verticalDetectionState.verticalAccHistory.length < 15) return;
      
      // 4. Filtrage et détection de pics sur signal vertical
      const recentVertical = this.verticalDetectionState.verticalAccHistory.slice(-40); // 1.6s à 25Hz
      const verticalSignal = recentVertical.map(sample => sample.vertical);
      
      // Suppression de la composante continue (gravité résiduelle)
      const detrendedVertical = this.applyDetrendingFilter(verticalSignal);
      
      // Détection de pics avec seuil adapté pour signal vertical
      const verticalPeaks = this.detectVerticalPeaks(detrendedVertical);
      
      const now = Date.now();
      const minStepInterval = this.currentMode === 'running' ? 250 : 400; // ms
      
      if (verticalPeaks.length > 0 && (now - this.lastStepTime) > minStepInterval) {
        // Validation du pic vertical
        const peakValue = verticalPeaks[verticalPeaks.length - 1];
        if (this.isValidVerticalPeak(peakValue)) {
          this.handleStepDetected(peakValue, Math.abs(verticalAcc));
          this.verticalDetectionState.lastVerticalPeak = peakValue;
          
          // Debug périodique
          if (this.stepCount % 5 === 0) {
            console.log(`[STEP VERTICAL] Pas ${this.stepCount}: pic=${peakValue.toFixed(3)}g, vertical=${verticalAcc.toFixed(3)}g, mode=${this.currentMode}`);
          }
        }
      }
      
      // Réinitialiser fallback si détection verticale fonctionne
      this.verticalDetectionState.fallbackActive = false;
      
    } catch (error) {
      console.warn('[PDR] Erreur détection verticale, fallback vers magnitude:', error);
      this.verticalDetectionState.fallbackActive = true;
      this.verticalDetectionState.fallbackStartTime = Date.now();
      this.detectStepsMagnitude(accelerometerData);
    }
  }

  /**
   * *** NOUVEAU: Détection de pas par magnitude (méthode originale) ***
   */
  detectStepsMagnitude(accelerometerData) {
    // *** PIPELINE ADAPTATIF ORIGINAL ***
    
    // 1. Calcul magnitude brute et suppression gravité
    const recentSamples = this.accelerationHistory.slice(-50); // 2 secondes à 25Hz
    const magnitudes = recentSamples.map(sample => {
      const linearAcc = this.removeGravityComponent(sample);
      return Math.sqrt(linearAcc.x**2 + linearAcc.y**2 + linearAcc.z**2);
    });
    
    // 2. Filtrage passe-haut (supprimer composante quasi-statique)
    const detrendedMagnitudes = this.applyDetrendingFilter(magnitudes);
    
    // 3. Détection de pics avec seuil adaptatif (utilise detectPeaks existant)
    const peaks = this.detectPeaks(detrendedMagnitudes); // Pas de seuil = calcul auto
    
    const now = Date.now();
    
    // 4. *** CORRECTION RENFORCÉE: Validation temporelle anti-rebond beaucoup plus stricte ***
    const minStepInterval = this.currentMode === 'running' ? 400 : 600; // Augmenté: 400ms course, 600ms marche
    const timeSinceLastStep = now - this.lastStepTime;
    
    if (peaks.length > 0 && timeSinceLastStep > minStepInterval) {
      const bestPeak = peaks[peaks.length - 1];
      
      // *** NOUVEAU: Filtrage supplémentaire des pics trop faibles renforcé ***
      const minPeakThreshold = this.currentMode === 'running' ? 0.20 : 0.12; // Augmenté: seuils minimums plus élevés
      
      if (bestPeak >= minPeakThreshold) {
        console.log(`[STEP CANDIDATE] pic=${bestPeak.toFixed(3)}, interval=${timeSinceLastStep}ms`);
        
        // Pas détecté validé
        this.handleStepDetected(bestPeak, magnitudes[magnitudes.length - 1]);
      }
    }
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
   * Détection de pics avec seuil adaptatif amélioré
   */
  detectPeaks(data, threshold = null) {
    if (data.length < 5) return [];
    
    // Si pas de seuil fourni, calcul automatique
    if (!threshold) {
      // *** CORRECTION: Calcul natif JavaScript au lieu de mathjs ***
      const mean = data.reduce((a, b) => a + b) / data.length;
      const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
      const std = Math.sqrt(variance);
      
      // *** SEUIL ADAPTATIF SELON MODE (ENCORE PLUS RENFORCÉ CONTRE SUR-DÉTECTION) ***
      let k = 1.0; // Coefficient multiplicateur par défaut
      switch (this.currentMode) {
        case 'running':
          k = 1.2; // Plus conservateur pour la course (était 1.0)
          break;
        case 'walking':
          k = 1.1; // *** CORRECTION: Plus conservateur pour marche (était 0.9) ***
          break;
        case 'crawling':
          k = 1.5; // Moins sensible pour ramper
          break;
        default:
          k = 1.2; // *** CORRECTION: Beaucoup plus conservateur par défaut (était 1.0) ***
      }
      
      // *** CORRECTION: Seuil encore moins permissif pour les premiers pas ***
      if (this.stepCount < 10) {
        k *= 0.9; // Réduire de 10% au lieu de 20%
      }
      
      threshold = mean + k * std;
      
      // *** CORRECTION: Contraintes encore plus strictes pour éviter extrêmes ***
      threshold = Math.max(0.12, Math.min(1.0, threshold)); // Plus strict: 0.12-1.0 au lieu de 0.08-1.2
      this._lastAdaptiveThreshold = threshold; // Stockage pour debug
    }
    
    // *** CORRECTION: Calcul natif de la moyenne pour isStrongPeak ***
    const mean = data.reduce((a, b) => a + b) / data.length;
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);
    
    // Détection de pics locaux
    const peaks = [];
    for (let i = 2; i < data.length - 2; i++) { // *** CORRECTION: Fenêtre plus large (i=2 au lieu de i=1) ***
      const current = data[i];
      const prev1 = data[i - 1];
      const prev2 = data[i - 2];
      const next1 = data[i + 1];
      const next2 = data[i + 2];
      
      // *** CONDITIONS ENCORE PLUS RENFORCÉES pour un pic valide ***
      const isLocalMaximum = current > prev1 && current > next1 && 
                            current > prev2 && current > next2; // Pic sur 5 points
      const isAboveThreshold = current > threshold;
      const isSignificantPeak = current > (prev1 + next1) / 2 * 1.2; // 20% plus haut que ses voisins (était 10%)
      const isStrongPeak = current > mean + 1.5 * std; // *** CORRECTION: Utilise les variables calculées ci-dessus ***
      
      if (isLocalMaximum && isAboveThreshold && isSignificantPeak && isStrongPeak) {
        peaks.push(current);
      }
    }
    
    return peaks;
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
   * Obtenir l'état actuel
   */
  getState() {
    return {
      position: { ...this.position },
      orientation: { ...this.orientation },
      velocity: { ...this.velocity },
      mode: this.currentMode,
      stepCount: this.stepCount,
      totalDistance: this.calculateTotalDistance(),
      features: { ...this.activityFeatures },
      sampleRate: this.currentSampleRate,
      isZUPT: this.isZUPT,
      
      // *** NOUVEAU: Métriques de détection verticale ***
      verticalDetection: {
        isActive: this.verticalDetectionState.isActive,
        orientationConfidence: this.verticalDetectionState.orientationConfidence,
        fallbackActive: this.verticalDetectionState.fallbackActive,
        lastVerticalPeak: this.verticalDetectionState.lastVerticalPeak,
        method: this.getDetectionMethod()
      },
      
      // *** NOUVEAU: Métriques physiologiques ***
      physiologicalMetrics: {
        currentStepFrequency: this.getCurrentStepFrequency(),
        maxAllowedFrequency: this.getMaxAllowedFrequency(),
        stepHistoryLength: this.stepHistory.length,
        gyroConfirmationEnabled: this.config.physiologicalConstraints.gyroConfirmationEnabled,
        gyroBufferLength: this.gyroConfirmationBuffer.length,
        lastGyroActivity: this.getLastGyroActivity()
      }
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
   * Traitement d'un pas détecté validé
   */
  handleStepDetected(peakAmplitude, originalMagnitude) {
    const now = Date.now();
    
    // *** CORRECTION: Garde-fous physiologiques uniquement après beaucoup plus de pas ***
    if (this.stepCount > 10 && !this.validateStepPhysiologically(now)) {
      console.log(`[STEP REJECTED] Garde-fou physiologique - Fréquence trop élevée ou gyro non confirmé`);
      return; // Pas rejeté par les contraintes physiologiques
    }
    
    // *** CORRECTION: Supprimer la double vérification d'intervalle ***
    // L'intervalle est déjà vérifié dans detectStepsMagnitude
    
    this.stepCount++;
    this.lastStepTime = now;
    
    // *** NOUVEAU: Ajouter à l'historique des pas ***
    this.stepHistory.push(now);
    
    // Garder seulement les pas des 10 dernières secondes pour calcul de fréquence
    const cutoffTime = now - 10000;
    this.stepHistory = this.stepHistory.filter(timestamp => timestamp > cutoffTime);
    
    // Estimation dynamique de la longueur de pas basée sur l'amplitude filtrée
    this.updateDynamicStepLength(peakAmplitude);
    
    // Avancer la position seulement sur pas validé
    this.advancePositionOnStep();
    
    // Callback pas détecté
    if (this.onStepDetected) {
      this.onStepDetected(this.stepCount, this.dynamicStepLength);
    }
    
    // *** NOUVEAU: Log avec informations physiologiques ***
    const currentFrequency = this.getCurrentStepFrequency();
    console.log(`[STEP VALIDATED] #${this.stepCount}: longueur=${this.dynamicStepLength.toFixed(3)}m, fréq=${currentFrequency.toFixed(2)}Hz`);
  }

  /**
   * *** NOUVEAU: Projection de l'accélération dans le repère terrestre ***
   */
  projectAccelerationToWorld(accelerometerData) {
    if (!this.attitudeTracker) {
      return null;
    }
    
    try {
      // Obtenir le statut de l'AttitudeTracker
      const attitudeStatus = this.attitudeTracker.getStatus();
      
      // Vérifier que l'orientation est valide (quaternion non-identité)
      const { quaternion } = attitudeStatus;
      if (quaternion.w === 1 && quaternion.x === 0 && quaternion.y === 0 && quaternion.z === 0) {
        return null; // Orientation pas encore initialisée
      }
      
      // Utiliser la transformation de l'AttitudeTracker
      const worldAcceleration = this.attitudeTracker.transformAcceleration(accelerometerData);
      
      // L'AttitudeTracker transforme vers le repère corps/monde
      // worldAcceleration.z correspond à la composante "Up" (verticale)
      return {
        north: worldAcceleration.x,  // Nord
        east: worldAcceleration.y,   // Est  
        up: worldAcceleration.z      // Haut (composante verticale recherchée)
      };
      
    } catch (error) {
      console.warn('[PDR] Erreur projection AttitudeTracker:', error);
      return null;
    }
  }

  /**
   * *** NOUVEAU: Détection de pics sur signal vertical ***
   */
  detectVerticalPeaks(data) {
    if (data.length < 5) return [];
    
    // Calcul du seuil adaptatif pour signal vertical
    const mean = data.reduce((a, b) => a + b) / data.length;
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);
    
    // Seuil plus conservateur pour signal vertical (pics plus nets)
    let threshold = mean + 1.5 * std;
    threshold = Math.max(this.config.verticalStepDetection.minVerticalPeak, 
                        Math.min(this.config.verticalStepDetection.maxVerticalPeak, threshold));
    
    const peaks = [];
    for (let i = 1; i < data.length - 1; i++) {
      const current = data[i];
      const prev = data[i - 1];
      const next = data[i + 1];
      
      // Conditions pour un pic valide
      const isLocalMaximum = current > prev && current > next;
      const isAboveThreshold = current > threshold;
      
      if (isLocalMaximum && isAboveThreshold) {
        peaks.push(current);
      }
    }
    
    return peaks;
  }

  /**
   * *** NOUVEAU: Validation d'un pic vertical ***
   */
  isValidVerticalPeak(peakValue) {
    const config = this.config.verticalStepDetection;
    return peakValue >= config.minVerticalPeak && peakValue <= config.maxVerticalPeak;
  }

  /**
   * *** NOUVEAU: Évaluation de la confiance d'orientation pour détection verticale ***
   */
  shouldUseVerticalDetection() {
    if (!this.verticalDetectionState.isActive || !this.attitudeTracker) {
      return false;
    }
    
    // Si fallback actif, rester en mode magnitude quelques secondes
    if (this.verticalDetectionState.fallbackActive) {
      const timeSinceFallback = Date.now() - (this.verticalDetectionState.fallbackStartTime || 0);
      if (timeSinceFallback < 5000) { // 5 secondes de fallback minimum
        return false;
      }
      // Réessayer après 5 secondes
      this.verticalDetectionState.fallbackActive = false;
    }
    
    try {
      const attitudeStatus = this.attitudeTracker.getStatus();
      
      // Vérifier que l'orientation est stable et fiable
      const orientationConfidence = this.calculateOrientationConfidence(attitudeStatus);
      this.verticalDetectionState.orientationConfidence = orientationConfidence;
      
      return orientationConfidence >= this.config.verticalStepDetection.orientationConfidenceThreshold;
      
    } catch (error) {
      console.warn('[PDR] Erreur évaluation confiance orientation:', error);
      return false;
    }
  }

  /**
   * *** NOUVEAU: Calcul de la confiance d'orientation ***
   */
  calculateOrientationConfidence(attitudeStatus) {
    const { quaternion, isStable, magneticConfidence, accelerationVariance, gyroMagnitude } = attitudeStatus;
    
    // Vérifier que le quaternion n'est pas l'identité
    if (quaternion.w === 1 && quaternion.x === 0 && quaternion.y === 0 && quaternion.z === 0) {
      return 0;
    }
    
    // Facteurs de confiance
    let confidence = 0.5; // Base
    
    // Bonus pour stabilité
    if (isStable) {
      confidence += 0.3;
    }
    
    // Bonus pour confiance magnétique
    if (magneticConfidence > 0.5) {
      confidence += magneticConfidence * 0.2;
    }
    
    // Pénalité pour variance d'accélération élevée
    if (accelerationVariance > 1.0) {
      confidence -= Math.min(0.3, accelerationVariance * 0.1);
    }
    
    // Pénalité pour mouvement gyroscopique élevé
    if (gyroMagnitude > 0.5) {
      confidence -= Math.min(0.2, gyroMagnitude * 0.2);
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * *** NOUVEAU: Test de la détection verticale (pour debug) ***
   */
  testVerticalDetection() {
    if (!this.verticalDetectionState.isActive) {
      console.log('[TEST] Détection verticale non activée');
      return;
    }
    
    console.log('[TEST] === Test Détection Verticale ===');
    console.log('[TEST] AttitudeTracker présent:', !!this.attitudeTracker);
    
    if (this.attitudeTracker) {
      const status = this.attitudeTracker.getStatus();
      console.log('[TEST] Quaternion:', status.quaternion);
      console.log('[TEST] Stabilité:', status.isStable);
      console.log('[TEST] Confiance magnétique:', status.magneticConfidence);
    }
    
    console.log('[TEST] État détection verticale:');
    console.log('[TEST] - Méthode actuelle:', this.getDetectionMethod());
    console.log('[TEST] - Confiance orientation:', this.verticalDetectionState.orientationConfidence);
    console.log('[TEST] - Fallback actif:', this.verticalDetectionState.fallbackActive);
    console.log('[TEST] - Historique vertical:', this.verticalDetectionState.verticalAccHistory.length, 'échantillons');
    console.log('[TEST] - Dernier pic vertical:', this.verticalDetectionState.lastVerticalPeak);
    
    // Test de projection
    const testAcc = { x: 0, y: 0, z: 9.81 }; // Gravité pure
    const projected = this.projectAccelerationToWorld(testAcc);
    console.log('[TEST] Projection test (gravité pure):', projected);
    
    console.log('[TEST] === Fin Test ===');
  }

  /**
   * *** NOUVEAU: Statistiques de performance détection verticale ***
   */
  getVerticalDetectionStats() {
    if (!this.verticalDetectionState.isActive) {
      return null;
    }
    
    const now = Date.now();
    const recentHistory = this.verticalDetectionState.verticalAccHistory.filter(
      sample => now - sample.timestamp < 10000 // 10 dernières secondes
    );
    
    if (recentHistory.length === 0) {
      return { noData: true };
    }
    
    const verticalValues = recentHistory.map(s => s.vertical);
    const mean = verticalValues.reduce((a, b) => a + b) / verticalValues.length;
    const variance = verticalValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / verticalValues.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...verticalValues);
    const max = Math.max(...verticalValues);
    
    return {
      samplesCount: recentHistory.length,
      mean: mean,
      std: std,
      min: min,
      max: max,
      range: max - min,
      signalQuality: std < 0.5 ? 'good' : std < 1.0 ? 'medium' : 'poor'
    };
  }

  /**
   * *** NOUVEAU: Calcul de la distance totale (crawling supprimé) ***
   */
  calculateTotalDistance() {
    // Distance des pas uniquement
    const stepDistance = this.stepCount * this.dynamicStepLength;
    return stepDistance;
  }

  /**
   * *** NOUVEAU: Activation/désactivation de la classification automatique ***
   */
  setAutoClassification(enabled) {
    this.autoClassificationEnabled = enabled;
    
    if (enabled) {
      this.manualModeOverride = null;
      console.log('[PDR] Classification automatique activée');
    } else {
      console.log('[PDR] Classification automatique désactivée');
    }
  }

  /**
   * *** NOUVEAU: Forcer un mode spécifique (mode manuel) ***
   */
  setManualMode(mode) {
    const validModes = ['stationary', 'walking', 'running']; // crawling supprimé
    
    if (!validModes.includes(mode)) {
      console.warn(`[PDR] Mode manuel invalide: ${mode}. Modes valides: ${validModes.join(', ')}`);
      return;
    }
    
    this.autoClassificationEnabled = false;
    this.manualModeOverride = mode;
    
    // Appliquer immédiatement le mode
    const previousMode = this.currentMode;
    this.currentMode = mode;
    
    // Notification changement si différent
    if (previousMode !== this.currentMode && this.onModeChanged) {
      console.log(`[PDR] Mode manuel forcé: ${previousMode} → ${this.currentMode}`);
      this.handleModeTransition(previousMode, this.currentMode);
      this.onModeChanged(this.currentMode, this.activityFeatures);
    }
  }

  /**
   * *** NOUVEAU: Obtenir l'état du contrôle de classification ***
   */
  getClassificationState() {
    return {
      autoEnabled: this.autoClassificationEnabled,
      manualMode: this.manualModeOverride,
      currentMode: this.currentMode,
      features: { ...this.activityFeatures }
    };
  }

  /**
   * *** NOUVEAU: Vérifier si en mode manuel ***
   */
  isManualModeActive() {
    return !this.autoClassificationEnabled && this.manualModeOverride !== null;
  }

  /**
   * *** NOUVEAU: Validation physiologique d'un pas ***
   */
  validateStepPhysiologically(timestamp) {
    // 1. Vérification de la fréquence de pas
    if (!this.validateStepFrequency(timestamp)) {
      return false;
    }
    
    // 2. Confirmation gyroscopique si activée
    if (this.config.physiologicalConstraints.gyroConfirmationEnabled) {
      if (!this.validateGyroscopicConfirmation()) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * *** NOUVEAU: Validation de la fréquence de pas selon le mode (SEUILS DÉTENDUS) ***
   */
  validateStepFrequency(timestamp) {
    // Calculer la fréquence actuelle
    const currentFrequency = this.getCurrentStepFrequency();
    
         // *** MODIFICATION: Seuils dynamiques plus permissifs (crawling supprimé) ***
     const MAX_FREQ = {
       walking: 4.0,   // Augmenté de 3.0 à 4.0 Hz - permet marche rapide jusqu'à 3.5 Hz
       running: 8.0,   // Augmenté de 5.0 à 8.0 Hz - coureur rapide
       stationary: 3.0 // *** CORRECTION: Augmenté de 0.5 à 3.0 Hz pour permettre marche ***
     }[this.currentMode] || 4.0; // Défaut plus permissif
    
    // Vérifier si la fréquence dépasse la limite
    if (currentFrequency > MAX_FREQ) {
      console.log(`[PHYSIO GUARD] Fréquence trop élevée: ${currentFrequency.toFixed(2)}Hz > ${MAX_FREQ}Hz (mode: ${this.currentMode})`);
      return false;
    }
    
    return true;
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
   * *** NOUVEAU: Obtenir l'intervalle minimum physiologique selon le mode (SEUILS DÉTENDUS) ***
   */
  getPhysiologicalMinInterval() {
         // *** MODIFICATION: Utiliser les mêmes seuils détendus (crawling supprimé) ***
     const MAX_FREQ = {
       walking: 4.0,   // Augmenté de 3.0 à 4.0 Hz
       running: 8.0,   // Augmenté de 5.0 à 8.0 Hz
       stationary: 3.0 // *** CORRECTION: Augmenté de 0.5 à 3.0 Hz pour permettre marche ***
     }[this.currentMode] || 4.0;
    
    // Convertir fréquence max en intervalle min (ms)
    return Math.floor(1000 / MAX_FREQ);
  }

  /**
   * *** NOUVEAU: Validation par confirmation gyroscopique ***
   */
  validateGyroscopicConfirmation() {
    if (this.gyroConfirmationBuffer.length < 5) {
      // Pas assez de données gyro, accepter par défaut
      return true;
    }
    
    // Analyser les 10 derniers échantillons gyro (400ms à 25Hz)
    const recentGyro = this.gyroConfirmationBuffer.slice(-10);
    
    // Calculer la magnitude de rotation moyenne
    const gyroMagnitudes = recentGyro.map(sample => 
      Math.sqrt(sample.x**2 + sample.y**2 + sample.z**2)
    );
    
    const maxGyroMagnitude = Math.max(...gyroMagnitudes);
    const avgGyroMagnitude = gyroMagnitudes.reduce((a, b) => a + b) / gyroMagnitudes.length;
    
    // Un pas devrait s'accompagner d'une rotation détectable
    const threshold = this.config.physiologicalConstraints.gyroConfirmationThreshold;
    
    // Vérifier qu'il y a eu une activité gyroscopique significative
    const hasGyroActivity = maxGyroMagnitude > threshold || avgGyroMagnitude > threshold * 0.5;
    
    if (!hasGyroActivity) {
      console.log(`[GYRO GUARD] Pas sans rotation détectable: max=${maxGyroMagnitude.toFixed(3)}, avg=${avgGyroMagnitude.toFixed(3)}, seuil=${threshold}`);
      return false;
    }
    
    return true;
  }

  /**
   * *** NOUVEAU: Mise à jour du buffer de confirmation gyroscopique ***
   */
  updateGyroConfirmationBuffer(gyroData) {
    if (!this.config.physiologicalConstraints.gyroConfirmationEnabled) {
      return;
    }
    
    this.gyroConfirmationBuffer.push({
      x: gyroData.x,
      y: gyroData.y,
      z: gyroData.z,
      timestamp: Date.now()
    });
    
    // Garder seulement les 50 derniers échantillons (2 secondes à 25Hz)
    if (this.gyroConfirmationBuffer.length > 50) {
      this.gyroConfirmationBuffer.shift();
    }
  }

  /**
   * *** NOUVEAU: Obtenir la fréquence maximale autorisée selon le mode (SEUILS DÉTENDUS) ***
   */
  getMaxAllowedFrequency() {
         // *** MODIFICATION: Utiliser les seuils détendus (crawling supprimé) ***
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