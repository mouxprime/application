import { create, all } from 'mathjs';

const math = create(all);

/**
 * Système de Dead Reckoning Piéton (PDR) avancé avec détection d'activité et ZUPT
 * Intégration AttitudeTracker pour orientation adaptative (plus d'OrientationCalibrator fixe)
 */
export class PedestrianDeadReckoning {
  constructor(config = {}) {
    this.config = {
      // Paramètres de détection de pas adaptés pour poche
      stepDetectionWindow: config.stepDetectionWindow || 30, // 30 échantillons (augmenté)
      stepThreshold: config.stepThreshold || 1.0, // 1.0 m/s² (réduit pour plus de sensibilité)
      crawlThreshold: config.crawlThreshold || 1.0, // 1.0 m/s² (augmenté pour poche)
      crawlPitchThreshold: config.crawlPitchThreshold || 30, // degrés (sera retiré)
      
      // Paramètres de longueur de pas
      defaultStepLength: config.defaultStepLength || 0.7, // mètres
      heightRatio: config.heightRatio || 0.4, // ratio taille/longueur pas
      crawlSpeed: config.crawlSpeed || 0.3, // m/s
      
      // Paramètres ZUPT adaptés pour poche
      zuptThreshold: config.zuptThreshold || 0.1, // m/s²
      zuptDuration: config.zuptDuration || 300, // 300ms (augmenté pour éviter micro-mouvements)
      
      // Échantillonnage adaptatif
      baseSampleRate: config.baseSampleRate || 25, // Hz
      highSampleRate: config.highSampleRate || 100, // Hz
      motionThreshold: config.motionThreshold || 2.0, // m/s²
      
      ...config
    };

    // État du système
    this.currentMode = 'stationary'; // stationary, walking, crawling, running
    this.currentSampleRate = this.config.baseSampleRate;
    this.lastStepTime = 0;
    this.stepCount = 0;
    this.crawlDistance = 0;
    
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

    // Ajout d'une variable pour le dernier log
    this.lastLogTime = 0;
    
    // *** NOUVEAU: Système de classification stable ***
    this.lastModeUpdate = 0;
    this.modeUpdateInterval = 1000; // *** CORRIGÉ: Réduit à 1 seconde pour transitions plus rapides ***
    this.modeVotes = []; // Historique des votes pour stabilité
    this.maxVotes = 20; // *** CORRIGÉ: Réduit de 50 à 20 votes ***
    
    // *** NOUVEAU: Système de calibration adaptative pour coefficient k ***
    this.calibrationState = {
      isWarmingUp: true,
      warmupSamples: 0,
      warmupTarget: 100, // Nombre d'échantillons pour calibration initiale
      amplitudeHistory: [], // Historique des amplitudes pour calibration
      baselineStd: null, // Écart-type de référence après warm-up
      adaptiveK: {
        walking: 0.3,
        running: 0.2,
        crawling: 0.5,
        default: 0.4
      },
      // *** NOUVEAU: Calibration utilisateur avancée ***
      userCalibration: {
        isActive: false,
        phase: 'idle', // 'idle', 'normal_walk', 'slow_walk', 'completed'
        normalWalkData: [],
        slowWalkData: [],
        personalizedThresholds: {
          varianceMin: 0.025,
          amplitudeMin: 0.2,
          frequencyMin: 0.2,
          normalWalkVariance: null,
          slowWalkVariance: null,
          normalWalkAmplitude: null,
          slowWalkAmplitude: null
        }
      }
    };
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
   * Traitement principal des données de capteurs (SIMPLIFIÉ - plus d'OrientationCalibrator)
   */
  processSensorData(sensorData) {
    const { accelerometer, gyroscope, magnetometer, barometer } = sensorData;
    
    // Ajout aux buffers avec données brutes (transformation via AttitudeTracker dans LocalizationSDK)
    this.updateBuffers(accelerometer, gyroscope, magnetometer, barometer);
    
    // Classification d'activité
    this.classifyActivity();
    
    // Adaptation du taux d'échantillonnage
    this.adaptSampleRate();
    
    // Détection de pas/crawling selon le mode
    if (this.currentMode === 'walking' || this.currentMode === 'running') {
      this.detectSteps(accelerometer);
    } else if (this.currentMode === 'crawling') {
      this.processCrawling();
    }
    
    // Zero-Velocity Updates
    this.processZUPT();
    
    // Mise à jour de la position
    this.updatePosition();
    
    // *** NOUVEAU: Log périodique du statut même sans pas détectés ***
    const now = Date.now();
    if (now - this.lastLogTime >= 2000) {
      const timeUntilNextUpdate = Math.max(0, this.modeUpdateInterval - (now - this.lastModeUpdate));
      const secondsUntilUpdate = Math.ceil(timeUntilNextUpdate / 1000);
      console.log(`[STATUS] Mode: ${this.currentMode}, Pas: ${this.stepCount}, Prochaine éval: ${secondsUntilUpdate}s`);
      
      // *** NOUVEAU: Log des métriques de classification pour debug ***
      if (this.activityFeatures.accelerationVariance > 0) {
        console.log(`[METRICS] Variance: ${this.activityFeatures.accelerationVariance.toFixed(3)}, Freq: ${this.activityFeatures.stepFrequency.toFixed(2)}, Amp: ${this.activityFeatures.peakAmplitude.toFixed(3)}`);
      }
      
      // *** NOUVEAU: Log des valeurs brutes des capteurs pour debug ***
      if (this.accelerationBuffer.length > 0) {
        const lastAcc = this.accelerationBuffer[this.accelerationBuffer.length - 1];
        console.log(`[SENSORS] Acc: x=${lastAcc.x.toFixed(3)}, y=${lastAcc.y.toFixed(3)}, z=${lastAcc.z.toFixed(3)}, mag=${lastAcc.magnitude.toFixed(3)}`);
      }
      
      this.lastLogTime = now;
    }
    
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
   * Classification d'activité adaptée pour usage en poche (AMÉLIORÉE AVEC STABILITÉ)
   */
  classifyActivity() {
    if (this.accelerationBuffer.length < this.config.stepDetectionWindow) return;
    
    // Calcul des caractéristiques basées sur la magnitude uniquement
    const recentAcc = this.accelerationBuffer.slice(-this.config.stepDetectionWindow);
    
    // Variance de l'accélération (magnitude)
    const accMagnitudes = recentAcc.map(a => a.magnitude);
    const meanAcc = accMagnitudes.reduce((a, b) => a + b) / accMagnitudes.length;
    this.activityFeatures.accelerationVariance = accMagnitudes.reduce((acc, val) => 
      acc + Math.pow(val - meanAcc, 2), 0) / accMagnitudes.length;
    
    // Garde les angles pour information mais ne les utilise plus pour la classification
    const lastAcc = recentAcc[recentAcc.length - 1];
    this.activityFeatures.devicePitch = Math.atan2(-lastAcc.x, 
      Math.sqrt(lastAcc.y * lastAcc.y + lastAcc.z * lastAcc.z)) * 180 / Math.PI;
    this.activityFeatures.deviceRoll = Math.atan2(lastAcc.y, lastAcc.z) * 180 / Math.PI;
    
    // Fréquence des pics basée sur magnitude avec seuil adaptatif
    const peaks = this.detectPeaks(accMagnitudes);
    this.activityFeatures.stepFrequency = peaks.length / (this.config.stepDetectionWindow / this.currentSampleRate);
    this.activityFeatures.peakAmplitude = peaks.length > 0 ? Math.max(...peaks) : 0;
    
    // *** NOUVEAU: Collecter les données de calibration utilisateur ***
    this.collectCalibrationData();
    
    // *** NOUVEAU: Utiliser les seuils personnalisés ***
    const thresholds = this.getPersonalizedThresholds();
    
    // *** NOUVEAU: Classification avec système de vote et seuils personnalisés ***
    const variance = this.activityFeatures.accelerationVariance;
    const frequency = this.activityFeatures.stepFrequency;
    const amplitude = this.activityFeatures.peakAmplitude;
    
    // Déterminer le mode candidat avec seuils adaptatifs
    let candidateMode;
    if (variance < thresholds.varianceMin) { // *** Seuil personnalisé ***
      candidateMode = 'stationary';
    } else if (amplitude < 0.5 && variance < 0.1 && frequency < 1.0) { // *** CORRIGÉ: Seuils très bas ***
      candidateMode = 'crawling';
    } else if (frequency >= thresholds.frequencyMin && frequency < 2.5) { // *** Seuil personnalisé ***
      if (amplitude > 1.0 && frequency > 1.6) { // *** CORRIGÉ: Seuils très bas pour running ***
        candidateMode = 'running';
      } else if (amplitude >= thresholds.amplitudeMin && frequency >= thresholds.frequencyMin) { // *** Seuils personnalisés ***
        candidateMode = 'walking';
      } else {
        candidateMode = 'stationary'; // *** CORRIGÉ: Amplitudes trop faibles → stationary ***
      }
    } else if (frequency >= 2.5 || (amplitude > 0.8 && frequency > 1.6)) { // *** CORRIGÉ: Seuils très bas ***
      candidateMode = 'running';
    } else {
      candidateMode = 'walking'; // *** CORRIGÉ: Par défaut walking au lieu de stationary ***
    }
    
    // Ajouter le vote
    this.modeVotes.push({
      mode: candidateMode,
      timestamp: Date.now(),
      variance: variance,
      frequency: frequency,
      amplitude: amplitude
    });
    
    // Limiter la taille de l'historique des votes
    if (this.modeVotes.length > this.maxVotes) {
      this.modeVotes.shift();
    }
    
    // *** NOUVEAU: Mise à jour du mode seulement toutes les 2 secondes ***
    const now = Date.now();
    if (now - this.lastModeUpdate >= this.modeUpdateInterval) {
      const newMode = this.determineFinalMode();
      const previousMode = this.currentMode;
      
      if (newMode !== previousMode) {
        this.currentMode = newMode;
        this.lastModeUpdate = now;
        
        if (this.onModeChanged) {
          this.onModeChanged(this.currentMode, this.activityFeatures);
        }
        
        console.log(`[MODE STABLE] ${previousMode} → ${this.currentMode} (décision toutes les 2s)`);
      } else {
        this.lastModeUpdate = now;
        console.log(`[MODE STABLE] ${this.currentMode} confirmé (décision toutes les 2s)`);
      }
    }
  }

  /**
   * Détermine le mode final basé sur les votes pondérés de la dernière seconde
   */
  determineFinalMode() {
    if (this.modeVotes.length === 0) return this.currentMode;
    
    // Compter les votes de la dernière seconde
    const now = Date.now();
    const recentVotes = this.modeVotes.filter(vote => 
      now - vote.timestamp <= this.modeUpdateInterval
    );
    
    if (recentVotes.length === 0) return this.currentMode;
    
    // *** NOUVEAU: Système de vote pondéré ***
    const weightedCounts = {};
    
    recentVotes.forEach(vote => {
      let weight = 1.0; // Poids de base
      
      // *** Pondération spéciale pour favoriser la détection de marche douce ***
      if (vote.mode === 'walking') {
        // Si amplitude et fréquence sont proches des seuils minimums, augmenter le poids
        if (vote.amplitude >= 0.15 && vote.amplitude <= 0.3 && 
            vote.frequency >= 0.15 && vote.frequency <= 0.4) {
          weight = 1.5; // Favoriser la marche douce
        }
        // Si variance proche du seuil stationary, légèrement favoriser
        if (vote.variance > 0.02 && vote.variance < 0.05) {
          weight *= 1.3;
        }
      }
      
      // Favoriser les transitions depuis stationary vers walking
      if (vote.mode === 'walking' && this.currentMode === 'stationary') {
        weight *= 1.4;
      }
      
      // Pénaliser légèrement les votes stationary si il y a un minimum d'activité
      if (vote.mode === 'stationary' && vote.variance > 0.015) {
        weight *= 0.8;
      }
      
      weightedCounts[vote.mode] = (weightedCounts[vote.mode] || 0) + weight;
    });
    
    // Trouver le mode avec le score pondéré le plus élevé
    let winningMode = this.currentMode;
    let maxScore = 0;
    
    for (const [mode, score] of Object.entries(weightedCounts)) {
      if (score > maxScore) {
        maxScore = score;
        winningMode = mode;
      }
    }
    
    // *** Seuil adaptatif pour changement de mode ***
    const totalWeight = Object.values(weightedCounts).reduce((sum, w) => sum + w, 0);
    const winningPercentage = maxScore / totalWeight;
    
    // Seuil plus bas pour transitions vers walking (40% au lieu de 50%)
    const requiredThreshold = (winningMode === 'walking' && this.currentMode === 'stationary') ? 0.4 : 0.5;
    
    if (winningPercentage >= requiredThreshold) {
      return winningMode;
    } else {
      // Pas de majorité claire, garder le mode actuel
      return this.currentMode;
    }
  }

  /**
   * Détection robuste de pas avec seuil adaptatif (REFACTORISÉE)
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

    if (this.accelerationHistory.length < 20) return; // Pas assez de données

    // *** NOUVEAU PIPELINE ADAPTATIF AMÉLIORÉ ***
    
    // 1. Calcul magnitude brute
    const recentSamples = this.accelerationHistory.slice(-50); // 2 secondes à 25Hz
    const mags = recentSamples.map(sample => Math.hypot(sample.x, sample.y, sample.z));
    
    // 2. Detrending amélioré - soustraire la moyenne glissante
    const avg = mags.reduce((a, b) => a + b) / mags.length;
    const detrended = mags.map(v => Math.abs(v - avg)); // Valeur absolue pour garder les variations
    
    // 3. Détection de pics sans seuil fixe (calcul automatique)
    const peaks = this.detectPeaks(detrended);
    
    // *** NOUVEAU: Log de debug pour voir les pics détectés ***
    if (peaks.length > 0) {
      const maxPeak = Math.max(...peaks);
      const threshold = this.getLastAdaptiveThreshold();
      console.log(`[PEAKS] Détectés: ${peaks.length}, Max: ${maxPeak.toFixed(2)}, Seuil: ${threshold.toFixed(2)}, Mode: ${this.currentMode}`);
    }
    
    const now = Date.now();
    
    // 4. Validation temporelle anti-rebond (adaptatif selon fréquence)
    let minStepInterval;
    if (this.currentMode === 'running') {
      minStepInterval = 200; // Course rapide
    } else {
      // *** NOUVEAU: Intervalle adaptatif selon la fréquence détectée ***
      const detectedFreq = this.activityFeatures.stepFrequency;
      if (detectedFreq > 0 && detectedFreq < 1.0) {
        // Marche très lente : permettre jusqu'à 1.5s entre pas
        minStepInterval = Math.max(400, Math.min(1500, 1000 / detectedFreq * 0.8));
      } else if (detectedFreq >= 1.0 && detectedFreq < 1.5) {
        // Marche lente : 400-600ms
        minStepInterval = 400;
      } else {
        // Marche normale : 250ms
        minStepInterval = 250;
      }
    }
    
    if (peaks.length > 0 && (now - this.lastStepTime) > minStepInterval) {
      // Vérifier que l'amplitude du pic est significative
      const peakAmplitude = Math.max(...peaks);
      if (peakAmplitude > 0.005) { // *** CORRIGÉ: Seuil très bas abaissé de 0.02 à 0.005 pour pas légers ***
        // Pas détecté validé
        this.handleStepDetected(peakAmplitude, mags[mags.length - 1]);
        
        // *** DEBUG: Log périodique avec nouvelles métriques ***
        if (this.stepCount % 5 === 0 || this.stepCount < 10) { // *** CORRIGÉ: Log plus fréquent au début ***
          const adaptiveThreshold = this.getLastAdaptiveThreshold();
          console.log(`[STEP] Pas ${this.stepCount}: peak=${peakAmplitude.toFixed(3)}, seuil=${adaptiveThreshold.toFixed(3)}, mode=${this.currentMode}`);
        }
      } else {
        // *** NOUVEAU: Log des pics rejetés pour debug ***
        console.log(`[STEP-REJETÉ] Peak trop faible: ${peakAmplitude.toFixed(3)} < 0.005`);
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
   * *** NOUVEAU: Calibration adaptative du coefficient k ***
   */
  updateAdaptiveCalibration(data) {
    if (!this.calibrationState.isWarmingUp) return;
    
    // Collecter les amplitudes pendant le warm-up
    const magnitudes = data.map(val => Math.abs(val));
    this.calibrationState.amplitudeHistory.push(...magnitudes);
    this.calibrationState.warmupSamples += magnitudes.length;
    
    // Vérifier si le warm-up est terminé
    if (this.calibrationState.warmupSamples >= this.calibrationState.warmupTarget) {
      this.finalizeCalibration();
    }
  }

  /**
   * *** NOUVEAU: Finaliser la calibration après warm-up ***
   */
  finalizeCalibration() {
    const amplitudes = this.calibrationState.amplitudeHistory;
    
    if (amplitudes.length > 0) {
      // Calculer l'écart-type de référence
      const mean = amplitudes.reduce((sum, val) => sum + val, 0) / amplitudes.length;
      const variance = amplitudes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amplitudes.length;
      this.calibrationState.baselineStd = Math.sqrt(variance);
      
      // Adapter les coefficients k selon l'écart-type observé
      const stdFactor = Math.max(0.5, Math.min(2.0, this.calibrationState.baselineStd / 0.5)); // Normalisation autour de 0.5
      
      this.calibrationState.adaptiveK = {
        walking: Math.max(0.1, Math.min(0.8, 0.3 * stdFactor)),
        running: Math.max(0.1, Math.min(0.6, 0.2 * stdFactor)),
        crawling: Math.max(0.2, Math.min(1.0, 0.5 * stdFactor)),
        default: Math.max(0.2, Math.min(0.8, 0.4 * stdFactor))
      };
      
      this.calibrationState.isWarmingUp = false;
      
      console.log(`[CALIBRATION] Terminée - Std baseline: ${this.calibrationState.baselineStd.toFixed(3)}, K adaptatifs: walking=${this.calibrationState.adaptiveK.walking.toFixed(2)}, running=${this.calibrationState.adaptiveK.running.toFixed(2)}`);
    }
  }

  /**
   * *** NOUVEAU: Démarrer la calibration utilisateur personnalisée ***
   */
  startUserCalibration() {
    this.calibrationState.userCalibration.isActive = true;
    this.calibrationState.userCalibration.phase = 'normal_walk';
    this.calibrationState.userCalibration.normalWalkData = [];
    this.calibrationState.userCalibration.slowWalkData = [];
    
    console.log('[USER_CALIBRATION] Démarrage - Phase 1: Marchez normalement pendant 10 secondes');
    return {
      phase: 'normal_walk',
      instruction: 'Marchez normalement pendant 10 secondes',
      duration: 10000
    };
  }

  /**
   * *** NOUVEAU: Passer à la phase suivante de calibration ***
   */
  nextCalibrationPhase() {
    const cal = this.calibrationState.userCalibration;
    
    if (cal.phase === 'normal_walk') {
      cal.phase = 'slow_walk';
      console.log('[USER_CALIBRATION] Phase 2: Marchez lentement pendant 10 secondes');
      return {
        phase: 'slow_walk',
        instruction: 'Marchez lentement pendant 10 secondes',
        duration: 10000
      };
    } else if (cal.phase === 'slow_walk') {
      this.finalizeUserCalibration();
      return {
        phase: 'completed',
        instruction: 'Calibration terminée',
        duration: 0
      };
    }
  }

  /**
   * *** NOUVEAU: Collecter les données pendant la calibration utilisateur ***
   */
  collectCalibrationData() {
    if (!this.calibrationState.userCalibration.isActive) return;
    
    const cal = this.calibrationState.userCalibration;
    const features = this.activityFeatures;
    
    const dataPoint = {
      variance: features.accelerationVariance,
      amplitude: features.peakAmplitude,
      frequency: features.stepFrequency,
      timestamp: Date.now()
    };
    
    if (cal.phase === 'normal_walk') {
      cal.normalWalkData.push(dataPoint);
    } else if (cal.phase === 'slow_walk') {
      cal.slowWalkData.push(dataPoint);
    }
  }

  /**
   * *** NOUVEAU: Finaliser la calibration utilisateur ***
   */
  finalizeUserCalibration() {
    const cal = this.calibrationState.userCalibration;
    
    // Analyser les données de marche normale
    if (cal.normalWalkData.length > 0) {
      const normalVariances = cal.normalWalkData.map(d => d.variance).filter(v => v > 0);
      const normalAmplitudes = cal.normalWalkData.map(d => d.amplitude).filter(a => a > 0);
      
      if (normalVariances.length > 0) {
        cal.personalizedThresholds.normalWalkVariance = 
          normalVariances.reduce((sum, v) => sum + v, 0) / normalVariances.length;
      }
      if (normalAmplitudes.length > 0) {
        cal.personalizedThresholds.normalWalkAmplitude = 
          normalAmplitudes.reduce((sum, a) => sum + a, 0) / normalAmplitudes.length;
      }
    }
    
    // Analyser les données de marche lente
    if (cal.slowWalkData.length > 0) {
      const slowVariances = cal.slowWalkData.map(d => d.variance).filter(v => v > 0);
      const slowAmplitudes = cal.slowWalkData.map(d => d.amplitude).filter(a => a > 0);
      
      if (slowVariances.length > 0) {
        cal.personalizedThresholds.slowWalkVariance = 
          slowVariances.reduce((sum, v) => sum + v, 0) / slowVariances.length;
      }
      if (slowAmplitudes.length > 0) {
        cal.personalizedThresholds.slowWalkAmplitude = 
          slowAmplitudes.reduce((sum, a) => sum + a, 0) / slowAmplitudes.length;
      }
    }
    
    // Ajuster les seuils personnalisés
    if (cal.personalizedThresholds.slowWalkVariance) {
      // Utiliser 80% de la variance de marche lente comme seuil minimum
      cal.personalizedThresholds.varianceMin = cal.personalizedThresholds.slowWalkVariance * 0.8;
    }
    
    if (cal.personalizedThresholds.slowWalkAmplitude) {
      // Utiliser 70% de l'amplitude de marche lente comme seuil minimum
      cal.personalizedThresholds.amplitudeMin = cal.personalizedThresholds.slowWalkAmplitude * 0.7;
    }
    
    cal.phase = 'completed';
    cal.isActive = false;
    
    console.log(`[USER_CALIBRATION] Terminée - Seuils personnalisés: variance=${cal.personalizedThresholds.varianceMin.toFixed(3)}, amplitude=${cal.personalizedThresholds.amplitudeMin.toFixed(3)}`);
  }

  /**
   * *** NOUVEAU: Obtenir les seuils personnalisés ou par défaut ***
   */
  getPersonalizedThresholds() {
    const cal = this.calibrationState.userCalibration;
    
    if (cal.phase === 'completed') {
      return cal.personalizedThresholds;
    } else {
      // Retourner les seuils par défaut
      return {
        varianceMin: 0.025,
        amplitudeMin: 0.2,
        frequencyMin: 0.2
      };
    }
  }

  /**
   * Détection de pics avec seuil adaptatif amélioré
   */
  detectPeaks(data, threshold = null) {
    if (data.length < 5) return [];
    
    // *** NOUVEAU: Mise à jour de la calibration pendant le warm-up ***
    this.updateAdaptiveCalibration(data);
    
    // Si pas de seuil fourni, calcul automatique
    if (!threshold) {
      const mean = data.reduce((a, b) => a + b) / data.length;
      const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
      const std = Math.sqrt(variance);
      
      // *** NOUVEAU: SEUIL ADAPTATIF AVEC CALIBRATION ***
      let k;
      if (this.calibrationState.isWarmingUp) {
        // Pendant le warm-up, utiliser les valeurs par défaut
        switch (this.currentMode) {
          case 'running':
            k = 0.2;
            break;
          case 'walking':
            k = 0.3;
            break;
          case 'crawling':
            k = 0.5;
            break;
          default:
            k = 0.4;
        }
      } else {
        // Après calibration, utiliser les coefficients adaptatifs
        k = this.calibrationState.adaptiveK[this.currentMode] || this.calibrationState.adaptiveK.default;
      }
      
      threshold = mean + k * std;
      
      // *** AMÉLIORÉ: Contraintes adaptatives selon la calibration ***
      let minThreshold = 0.01;
      let maxThreshold = 2.0;
      
      if (!this.calibrationState.isWarmingUp && this.calibrationState.baselineStd) {
        // Ajuster les bornes selon l'écart-type de référence
        minThreshold = Math.max(0.01, this.calibrationState.baselineStd * 0.1);
        maxThreshold = Math.min(2.0, this.calibrationState.baselineStd * 4.0);
      }
      
      threshold = Math.max(minThreshold, Math.min(maxThreshold, threshold));
      this._lastAdaptiveThreshold = threshold; // Stockage pour debug
    }
    
    // Détection de pics locaux
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
   * Traitement du crawling
   */
  processCrawling() {
    if (this.accelerationBuffer.length < 2) return;
    
    const lastAcc = this.accelerationBuffer[this.accelerationBuffer.length - 1];
    const prevAcc = this.accelerationBuffer[this.accelerationBuffer.length - 2];
    
    const dt = (lastAcc.timestamp - prevAcc.timestamp) / 1000;
    const accChange = Math.abs(lastAcc.magnitude - prevAcc.magnitude);
    
    if (accChange > 0.5) { // Mouvement de crawling détecté
      this.crawlDistance += this.config.crawlSpeed * dt;
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
      case 'crawling':
        modeFactor = 0.3; // Pas très courts pour ramper
        break;
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
    this.crawlDistance = 0;
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
      crawlDistance: this.crawlDistance,
      features: { ...this.activityFeatures },
      sampleRate: this.currentSampleRate,
      isZUPT: this.isZUPT
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
    
    // *** NOUVEAU: Utiliser le même calcul d'intervalle adaptatif ***
    let minStepInterval;
    if (this.currentMode === 'running') {
      minStepInterval = 200; // Course rapide
    } else {
      // Intervalle adaptatif selon la fréquence détectée
      const detectedFreq = this.activityFeatures.stepFrequency;
      if (detectedFreq > 0 && detectedFreq < 1.0) {
        // Marche très lente : permettre jusqu'à 1.5s entre pas
        minStepInterval = Math.max(400, Math.min(1500, 1000 / detectedFreq * 0.8));
      } else if (detectedFreq >= 1.0 && detectedFreq < 1.5) {
        // Marche lente : 400-600ms
        minStepInterval = 400;
      } else {
        // Marche normale : 250ms
        minStepInterval = 250;
      }
    }
    
    // Vérification intervalle temporel
    if ((now - this.lastStepTime) <= minStepInterval) {
      return; // Trop tôt pour un nouveau pas
    }
    
    this.stepCount++;
    this.lastStepTime = now;
    
    // Estimation dynamique de la longueur de pas basée sur l'amplitude filtrée
    this.updateDynamicStepLength(peakAmplitude);
    
    // Avancer la position seulement sur pas validé
    this.advancePositionOnStep();
    
    // Callback pas détecté
    if (this.onStepDetected) {
      this.onStepDetected(this.stepCount, this.dynamicStepLength);
    }
    
    // Log simplifié toutes les 2 secondes avec informations de stabilité
    if (now - this.lastLogTime >= 2000) {
      const timeUntilNextUpdate = Math.max(0, this.modeUpdateInterval - (now - this.lastModeUpdate));
      const secondsUntilUpdate = Math.ceil(timeUntilNextUpdate / 1000);
      console.log(`[STATUS] Mode: ${this.currentMode}, Pas: ${this.stepCount}, Prochaine éval: ${secondsUntilUpdate}s`);
      this.lastLogTime = now;
    }
  }
} 