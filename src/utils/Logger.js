import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Système de logging structuré pour le débogage PDR
 * Enregistre toutes les données capteurs et états algorithme
 * Version React Native utilisant AsyncStorage
 */
export class Logger {
  constructor(config = {}) {
    this.config = {
      logInterval: config.logInterval || 1000, // 1 seconde
      enableConsole: config.enableConsole || false, // Désactivé par défaut
      maxLogFiles: config.maxLogFiles || 20, // Réduit pour mobile
      maxEntriesPerSession: config.maxEntriesPerSession || 1000, // Limite pour performance
      ...config
    };

    // État du logging
    this.isLogging = false;
    this.currentSession = null;
    this.logBuffer = [];
    this.logTimer = null;
    this.sessionStartTime = null;

    // Données accumulées
    this.sensorData = {
      accelerometer: null,
      gyroscope: null,
      magnetometer: null,
      barometer: null
    };

    this.algorithmState = {
      pdr: null,
      ekf: null,
      attitude: null,
      sdk: null
    };

    // Compteur d'entrées pour la session courante
    this.currentSessionEntries = 0;
  }

  /**
   * Démarrage d'une session de logging
   */
  async startSession(sessionName = null) {
    if (this.isLogging) {
      await this.stopSession();
    }

    this.sessionStartTime = new Date();
    this.currentSession = sessionName || `session_${this.sessionStartTime.toISOString().replace(/[:.]/g, '-')}`;
    this.isLogging = true;
    this.logBuffer = [];
    this.currentSessionEntries = 0;

    // Créer l'en-tête de session
    const sessionHeader = {
      sessionId: this.currentSession,
      startTime: this.sessionStartTime.toISOString(),
      version: '1.0',
      config: this.config,
      logs: []
    };

    await AsyncStorage.setItem(`log_${this.currentSession}`, JSON.stringify(sessionHeader));

    // Démarrer le timer de logging périodique
    this.logTimer = setInterval(() => {
      this.writeLogEntry();
    }, this.config.logInterval);

    if (this.config.enableConsole) {
      console.log(`[LOGGER] Session démarrée: ${this.currentSession}`);
    }
  }

  /**
   * Arrêt de la session de logging
   */
  async stopSession() {
    if (!this.isLogging) return;

    this.isLogging = false;

    // Arrêter le timer
    if (this.logTimer) {
      clearInterval(this.logTimer);
      this.logTimer = null;
    }

    // Écrire les dernières données
    await this.writeLogEntry();
    await this.flushBuffer();

    // Finaliser le fichier de session
    await this.finalizeSession();

    // Nettoyer les anciens logs
    await this.cleanupOldLogs();

    if (this.config.enableConsole) {
      console.log(`[LOGGER] Session terminée: ${this.currentSession}`);
    }

    this.currentSession = null;
    this.sessionStartTime = null;
    this.currentSessionEntries = 0;
  }

  /**
   * Enregistrement des données de capteurs
   */
  logSensorData(sensorData) {
    if (!this.isLogging) return;

    this.sensorData = {
      accelerometer: sensorData.accelerometer ? {
        x: sensorData.accelerometer.x,
        y: sensorData.accelerometer.y,
        z: sensorData.accelerometer.z,
        magnitude: Math.sqrt(
          sensorData.accelerometer.x ** 2 + 
          sensorData.accelerometer.y ** 2 + 
          sensorData.accelerometer.z ** 2
        )
      } : null,
      
      gyroscope: sensorData.gyroscope ? {
        x: sensorData.gyroscope.x,
        y: sensorData.gyroscope.y,
        z: sensorData.gyroscope.z,
        magnitude: Math.sqrt(
          sensorData.gyroscope.x ** 2 + 
          sensorData.gyroscope.y ** 2 + 
          sensorData.gyroscope.z ** 2
        )
      } : null,
      
      magnetometer: sensorData.magnetometer ? {
        x: sensorData.magnetometer.x,
        y: sensorData.magnetometer.y,
        z: sensorData.magnetometer.z,
        magnitude: Math.sqrt(
          sensorData.magnetometer.x ** 2 + 
          sensorData.magnetometer.y ** 2 + 
          sensorData.magnetometer.z ** 2
        ),
        heading: Math.atan2(sensorData.magnetometer.y, sensorData.magnetometer.x) * 180 / Math.PI
      } : null,
      
      barometer: sensorData.barometer ? {
        pressure: sensorData.barometer.pressure,
        altitude: sensorData.barometer.altitude || this.pressureToAltitude(sensorData.barometer.pressure)
      } : null,
      
      timestamp: Date.now()
    };
  }

  /**
   * Enregistrement de l'état de l'algorithme
   */
  logAlgorithmState(pdrState, ekfState, attitudeState, sdkState) {
    if (!this.isLogging) return;

    this.algorithmState = {
      pdr: pdrState ? {
        position: pdrState.position,
        orientation: pdrState.orientation,
        velocity: pdrState.velocity,
        mode: pdrState.mode,
        stepCount: pdrState.stepCount,
        features: pdrState.features,
        sampleRate: pdrState.sampleRate,
        isZUPT: pdrState.isZUPT,
        adaptiveWindowInfo: pdrState.adaptiveWindowInfo || null
      } : null,
      
      ekf: ekfState ? {
        state: ekfState.state ? this.arrayToSimpleArray(ekfState.state) : null,
        covariance: ekfState.covariance ? this.matrixToSimpleArray(ekfState.covariance) : null,
        confidence: ekfState.confidence,
        zuptActive: ekfState.zuptActive,
        lastUpdate: ekfState.lastUpdate
      } : null,
      
      attitude: attitudeState ? {
        quaternion: attitudeState.quaternion,
        isStable: attitudeState.isStable,
        stabilityDuration: attitudeState.stabilityDuration,
        magneticConfidence: attitudeState.magneticConfidence,
        isRecalibrating: attitudeState.isRecalibrating
      } : null,
      
      sdk: sdkState ? {
        position: sdkState.position,
        orientation: sdkState.orientation,
        mode: sdkState.mode,
        confidence: sdkState.confidence,
        stepCount: sdkState.stepCount,
        distance: sdkState.distance,
        isTracking: sdkState.isTracking
      } : null,
      
      timestamp: Date.now()
    };
  }

  /**
   * Écriture d'une entrée de log
   */
  async writeLogEntry() {
    if (!this.isLogging || (!this.sensorData.timestamp && !this.algorithmState.timestamp)) {
      return;
    }

    // Vérifier la limite d'entrées
    if (this.currentSessionEntries >= this.config.maxEntriesPerSession) {
      if (this.config.enableConsole) {
        console.log(`[LOGGER] Limite d'entrées atteinte (${this.config.maxEntriesPerSession})`);
      }
      return;
    }

    const logEntry = {
      timestamp: Date.now(),
      relativeTime: Date.now() - this.sessionStartTime.getTime(),
      sensors: { ...this.sensorData },
      algorithm: { ...this.algorithmState }
    };

    this.logBuffer.push(logEntry);
    this.currentSessionEntries++;

    // Flush buffer si trop plein
    if (this.logBuffer.length >= 5) { // Réduit pour mobile
      await this.flushBuffer();
    }
  }

  /**
   * Vidage du buffer vers AsyncStorage
   */
  async flushBuffer() {
    if (!this.currentSession || this.logBuffer.length === 0) return;

    try {
      const sessionKey = `log_${this.currentSession}`;
      
      // Lire les données existantes
      const existingData = await AsyncStorage.getItem(sessionKey);
      const sessionData = existingData ? JSON.parse(existingData) : { logs: [] };
      
      // Ajouter les nouvelles entrées
      sessionData.logs.push(...this.logBuffer);
      
      // Réécrire les données
      await AsyncStorage.setItem(sessionKey, JSON.stringify(sessionData));
      
      this.logBuffer = [];
    } catch (error) {
      console.error('Erreur écriture logs:', error);
    }
  }

  /**
   * Finalisation de la session
   */
  async finalizeSession() {
    if (!this.currentSession) return;

    try {
      const sessionKey = `log_${this.currentSession}`;
      
      // Lire et mettre à jour les métadonnées
      const existingData = await AsyncStorage.getItem(sessionKey);
      const sessionData = existingData ? JSON.parse(existingData) : { logs: [] };
      
      sessionData.endTime = new Date().toISOString();
      sessionData.duration = Date.now() - this.sessionStartTime.getTime();
      sessionData.totalEntries = sessionData.logs.length;
      
      // Statistiques de session
      sessionData.statistics = this.generateSessionStatistics(sessionData.logs);
      
      await AsyncStorage.setItem(sessionKey, JSON.stringify(sessionData));
    } catch (error) {
      console.error('Erreur finalisation session:', error);
    }
  }

  /**
   * Génération de statistiques de session
   */
  generateSessionStatistics(logs) {
    if (logs.length === 0) return {};

    const stats = {
      totalLogs: logs.length,
      duration: logs.length > 0 ? logs[logs.length - 1].relativeTime : 0,
      stepCount: 0,
      modes: {},
      sensorRanges: {
        accelerometer: { min: null, max: null },
        gyroscope: { min: null, max: null },
        magnetometer: { min: null, max: null }
      }
    };

    logs.forEach(log => {
      // Compter les pas
      if (log.algorithm.pdr && log.algorithm.pdr.stepCount > stats.stepCount) {
        stats.stepCount = log.algorithm.pdr.stepCount;
      }

      // Compter les modes
      if (log.algorithm.pdr && log.algorithm.pdr.mode) {
        stats.modes[log.algorithm.pdr.mode] = (stats.modes[log.algorithm.pdr.mode] || 0) + 1;
      }

      // Plages de capteurs
      if (log.sensors.accelerometer) {
        const mag = log.sensors.accelerometer.magnitude;
        if (stats.sensorRanges.accelerometer.min === null || mag < stats.sensorRanges.accelerometer.min) {
          stats.sensorRanges.accelerometer.min = mag;
        }
        if (stats.sensorRanges.accelerometer.max === null || mag > stats.sensorRanges.accelerometer.max) {
          stats.sensorRanges.accelerometer.max = mag;
        }
      }
    });

    return stats;
  }

  /**
   * Nettoyage des anciens logs
   */
  async cleanupOldLogs() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const logKeys = allKeys.filter(key => key.startsWith('log_')).sort();

      if (logKeys.length > this.config.maxLogFiles) {
        const keysToDelete = logKeys.slice(0, logKeys.length - this.config.maxLogFiles);
        await AsyncStorage.multiRemove(keysToDelete);
      }
    } catch (error) {
      console.error('Erreur nettoyage logs:', error);
    }
  }

  /**
   * Export des logs d'une session
   */
  async exportSession(sessionId, format = 'json') {
    try {
      const sessionKey = `log_${sessionId}`;
      const sessionData = await AsyncStorage.getItem(sessionKey);
      
      if (!sessionData) {
        return null;
      }

      const parsedData = JSON.parse(sessionData);

      if (format === 'csv') {
        return this.convertToCSV(parsedData);
      }

      return parsedData;
    } catch (error) {
      console.error('Erreur export session:', error);
      return null;
    }
  }

  /**
   * Conversion en CSV
   */
  convertToCSV(sessionData) {
    const headers = [
      'timestamp', 'relativeTime',
      'acc_x', 'acc_y', 'acc_z', 'acc_mag',
      'gyro_x', 'gyro_y', 'gyro_z', 'gyro_mag',
      'mag_x', 'mag_y', 'mag_z', 'mag_mag', 'mag_heading',
      'pdr_pos_x', 'pdr_pos_y', 'pdr_pos_z',
      'pdr_orient_yaw', 'pdr_mode', 'pdr_steps',
      'sdk_confidence', 'attitude_stable'
    ];

    const rows = [headers.join(',')];

    sessionData.logs.forEach(log => {
      const row = [
        log.timestamp,
        log.relativeTime,
        log.sensors.accelerometer?.x || '',
        log.sensors.accelerometer?.y || '',
        log.sensors.accelerometer?.z || '',
        log.sensors.accelerometer?.magnitude || '',
        log.sensors.gyroscope?.x || '',
        log.sensors.gyroscope?.y || '',
        log.sensors.gyroscope?.z || '',
        log.sensors.gyroscope?.magnitude || '',
        log.sensors.magnetometer?.x || '',
        log.sensors.magnetometer?.y || '',
        log.sensors.magnetometer?.z || '',
        log.sensors.magnetometer?.magnitude || '',
        log.sensors.magnetometer?.heading || '',
        log.algorithm.pdr?.position?.x || '',
        log.algorithm.pdr?.position?.y || '',
        log.algorithm.pdr?.position?.z || '',
        log.algorithm.pdr?.orientation?.yaw || '',
        log.algorithm.pdr?.mode || '',
        log.algorithm.pdr?.stepCount || '',
        log.algorithm.sdk?.confidence || '',
        log.algorithm.attitude?.isStable || ''
      ];
      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  /**
   * Liste des sessions disponibles
   */
  async listSessions() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const logKeys = allKeys.filter(key => key.startsWith('log_'));
      const sessions = [];

      for (const key of logKeys) {
        try {
          const sessionData = await AsyncStorage.getItem(key);
          const data = JSON.parse(sessionData);
          
          sessions.push({
            id: data.sessionId,
            startTime: data.startTime,
            endTime: data.endTime,
            duration: data.duration,
            totalEntries: data.totalEntries,
            key: key
          });
        } catch (error) {
          // Ignorer les sessions corrompues
        }
      }

      return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    } catch (error) {
      console.error('Erreur liste sessions:', error);
      return [];
    }
  }

  /**
   * Utilitaires
   */
  pressureToAltitude(pressure, seaLevelPressure = 1013.25) {
    return 44330 * (1 - Math.pow(pressure / seaLevelPressure, 0.1903));
  }

  arrayToSimpleArray(mathArray) {
    try {
      if (mathArray && typeof mathArray.toArray === 'function') {
        return mathArray.toArray();
      }
      return Array.isArray(mathArray) ? mathArray : null;
    } catch (error) {
      return null;
    }
  }

  matrixToSimpleArray(matrix) {
    try {
      if (matrix && typeof matrix.toArray === 'function') {
        return matrix.toArray();
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Configuration du logging console
   */
  setConsoleLogging(enabled) {
    this.config.enableConsole = enabled;
  }

  /**
   * État du logger
   */
  getStatus() {
    return {
      isLogging: this.isLogging,
      currentSession: this.currentSession,
      sessionStartTime: this.sessionStartTime,
      bufferSize: this.logBuffer.length,
      currentSessionEntries: this.currentSessionEntries,
      maxEntries: this.config.maxEntriesPerSession
    };
  }
} 