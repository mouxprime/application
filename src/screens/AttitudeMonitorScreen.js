import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useLocalization } from '../context/LocalizationContext';
import { LocalizationService } from '../services/LocalizationService';

export default function AttitudeMonitorScreen() {
  const { state, actions } = useLocalization();
  const [localizationService] = useState(() => new LocalizationService(actions));
  const [systemStatus, setSystemStatus] = useState(null);
  const [autoRecalibration, setAutoRecalibration] = useState(true);
  const [isServiceRunning, setIsServiceRunning] = useState(false);
  
  const updateInterval = useRef(null);

  useEffect(() => {
    // Mise à jour périodique du statut système avec optimisation
    updateInterval.current = setInterval(() => {
      if (isServiceRunning) {
        const status = localizationService.getSystemStatus();
        // Éviter les mises à jour inutiles si le statut n'a pas changé
        setSystemStatus(prevStatus => {
          if (!prevStatus || JSON.stringify(prevStatus) !== JSON.stringify(status)) {
            return status;
          }
          return prevStatus;
        });
      }
    }, 100); // 10Hz pour l'affichage

    return () => {
      if (updateInterval.current) {
        clearInterval(updateInterval.current);
      }
      localizationService.stop();
    };
  }, [isServiceRunning]);

  const startService = async () => {
    try {
      await localizationService.start();
      setIsServiceRunning(true);
      console.log('✅ Service démarré depuis AttitudeMonitorScreen');
    } catch (error) {
      Alert.alert('Erreur', `Impossible de démarrer le service: ${error.message}`);
    }
  };

  const stopService = () => {
    localizationService.stop();
    setIsServiceRunning(false);
    setSystemStatus(null);
  };

  const toggleAutoRecalibration = (value) => {
    setAutoRecalibration(value);
    localizationService.configureAttitude({
      autoRecalibration: value
    });
  };

  const forceRecalibration = () => {
    Alert.alert(
      'Force Re-calibration',
      'Déclencher une re-calibration manuelle maintenant?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: () => {
            localizationService.forceAttitudeRecalibration();
          }
        }
      ]
    );
  };

  const resetSystem = () => {
    Alert.alert(
      'Reset Système',
      'Réinitialiser complètement le système d\'attitude?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            localizationService.reset();
            setSystemStatus(null);
            setIsServiceRunning(false);
          }
        }
      ]
    );
  };

  const renderSystemStatus = () => {
    if (!systemStatus) {
      return (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Système non démarré</Text>
        </View>
      );
    }

    return (
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>État Système</Text>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Service:</Text>
          <View style={[styles.statusBadge, systemStatus.isRunning ? styles.statusGreen : styles.statusRed]}>
            <Text style={styles.statusBadgeText}>
              {systemStatus.isRunning ? 'ACTIF' : 'ARRÊTÉ'}
            </Text>
          </View>
        </View>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Capteurs:</Text>
          <View style={[styles.statusBadge, systemStatus.sensorsReady ? styles.statusGreen : styles.statusRed]}>
            <Text style={styles.statusBadgeText}>
              {systemStatus.sensorsReady ? 'PRÊTS' : 'NON PRÊTS'}
            </Text>
          </View>
        </View>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Calibration:</Text>
          <View style={[styles.statusBadge, systemStatus.sensorsCalibrated ? styles.statusGreen : styles.statusOrange]}>
            <Text style={styles.statusBadgeText}>
              {systemStatus.sensorsCalibrated ? 'CALIBRÉ' : 'EN ATTENTE'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderAttitudeStatus = () => {
    if (!systemStatus?.attitude) return null;

    const attitude = systemStatus.attitude;
    const timeSinceRecal = attitude.lastRecalibration > 0 ? 
      Math.floor((Date.now() - attitude.lastRecalibration) / 1000) : 0;

    return (
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>🧭 Attitude & Orientation</Text>
        
        {/* Quaternion */}
        <View style={styles.quaternionContainer}>
          <Text style={styles.quaternionTitle}>Quaternion (Téléphone → Monde)</Text>
          <View style={styles.quaternionGrid}>
            <Text style={styles.quaternionValue}>W: {attitude.quaternion.w.toFixed(3)}</Text>
            <Text style={styles.quaternionValue}>X: {attitude.quaternion.x.toFixed(3)}</Text>
            <Text style={styles.quaternionValue}>Y: {attitude.quaternion.y.toFixed(3)}</Text>
            <Text style={styles.quaternionValue}>Z: {attitude.quaternion.z.toFixed(3)}</Text>
          </View>
        </View>

        {/* Stabilité */}
        <View style={styles.stabilityContainer}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Stabilité:</Text>
            <View style={[styles.statusBadge, attitude.isStable ? styles.statusGreen : styles.statusRed]}>
              <Text style={styles.statusBadgeText}>
                {attitude.isStable ? 'STABLE' : 'INSTABLE'}
              </Text>
            </View>
          </View>
          
          {attitude.isStable && (
            <Text style={styles.stabilityDuration}>
              Stable depuis: {Math.floor(attitude.stabilityDuration / 1000)}s
            </Text>
          )}
          
          <Text style={styles.metricsText}>
            Variance Acc: {attitude.accelerationVariance?.toFixed(3) || '0.000'} m/s²
          </Text>
          <Text style={styles.metricsText}>
            Magnitude Gyro: {attitude.gyroMagnitude?.toFixed(3) || '0.000'} rad/s
          </Text>
        </View>

        {/* Magnétomètre */}
        <View style={styles.magneticContainer}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Confiance Mag:</Text>
            <Text style={[
              styles.confidenceText,
              { color: attitude.magneticConfidence > 0.7 ? '#00ff88' : 
                        attitude.magneticConfidence > 0.4 ? '#ffaa00' : '#ff4444' }
            ]}>
              {(attitude.magneticConfidence * 100).toFixed(0)}%
            </Text>
          </View>
        </View>

        {/* Re-calibration */}
        <View style={styles.recalibrationContainer}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Re-calibration:</Text>
            <View style={[styles.statusBadge, attitude.isRecalibrating ? styles.statusOrange : styles.statusBlue]}>
              <Text style={styles.statusBadgeText}>
                {attitude.isRecalibrating ? 'EN COURS' : 'PRÊTE'}
              </Text>
            </View>
          </View>
          
          {timeSinceRecal > 0 && (
            <Text style={styles.recalTime}>
              Dernière: il y a {timeSinceRecal}s
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderPerformanceMetrics = () => {
    if (!systemStatus?.performance) return null;

    const perf = systemStatus.performance;
    const attMetrics = perf.attitudeMetrics;

    return (
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>📊 Métriques Performance</Text>
        
        <Text style={styles.metricsText}>
          Mises à jour: {perf.updateCount}
        </Text>
        <Text style={styles.metricsText}>
          Intervalle moyen: {perf.avgUpdateInterval.toFixed(1)}ms
        </Text>
        <Text style={styles.metricsText}>
          Temps traitement: {perf.lastProcessingTime.toFixed(2)}ms
        </Text>
        
        {attMetrics && (
          <>
            <Text style={styles.metricsSubTitle}>Attitude:</Text>
            <Text style={styles.metricsText}>
              Prêt: {attMetrics.isReady ? 'Oui' : 'Non'}
            </Text>
            <Text style={styles.metricsText}>
              Transformation: {attMetrics.isTransforming ? 'Active' : 'Inactive'}
            </Text>
            <Text style={styles.metricsText}>
              Auto-recal: {attMetrics.recalibrationState.autoEnabled ? 'On' : 'Off'}
            </Text>
          </>
        )}
      </View>
    );
  };

  const renderDataVisualization = () => {
    if (!state.sensors) return null;

    const { accelerometer, gyroscope, magnetometer } = state.sensors;

    return (
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>📱 Données Capteurs Temps Réel</Text>
        
        <View style={styles.sensorGroup}>
          <Text style={styles.sensorTitle}>Accéléromètre (m/s²)</Text>
          <Text style={styles.sensorData}>
            X: {accelerometer?.x?.toFixed(2) || '0.00'}  
            Y: {accelerometer?.y?.toFixed(2) || '0.00'}  
            Z: {accelerometer?.z?.toFixed(2) || '0.00'}
          </Text>
        </View>
        
        <View style={styles.sensorGroup}>
          <Text style={styles.sensorTitle}>Gyroscope (rad/s)</Text>
          <Text style={styles.sensorData}>
            X: {gyroscope?.x?.toFixed(3) || '0.000'}  
            Y: {gyroscope?.y?.toFixed(3) || '0.000'}  
            Z: {gyroscope?.z?.toFixed(3) || '0.000'}
          </Text>
        </View>
        
        <View style={styles.sensorGroup}>
          <Text style={styles.sensorTitle}>Magnétomètre (µT)</Text>
          <Text style={styles.sensorData}>
            X: {magnetometer?.x?.toFixed(1) || '0.0'}  
            Y: {magnetometer?.y?.toFixed(1) || '0.0'}  
            Z: {magnetometer?.z?.toFixed(1) || '0.0'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🧭 Moniteur d'Attitude</Text>
          <Text style={styles.headerSubtitle}>Suivi continu avec re-calibration automatique</Text>
        </View>

        {/* Controls */}
        <View style={styles.controlsCard}>
          <View style={styles.controlRow}>
            <TouchableOpacity 
              style={[styles.controlButton, isServiceRunning ? styles.controlButtonStop : styles.controlButtonStart]}
              onPress={isServiceRunning ? stopService : startService}
            >
              <Ionicons 
                name={isServiceRunning ? "stop" : "play"} 
                size={20} 
                color="#ffffff" 
              />
              <Text style={styles.controlButtonText}>
                {isServiceRunning ? 'Arrêter' : 'Démarrer'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={forceRecalibration}
              disabled={!isServiceRunning}
            >
              <Ionicons name="refresh" size={20} color="#ffffff" />
              <Text style={styles.controlButtonText}>Re-calibrer</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Re-calibration automatique</Text>
            <Switch
              value={autoRecalibration}
              onValueChange={toggleAutoRecalibration}
              trackColor={{ false: '#666666', true: '#00ff88' }}
              thumbColor={autoRecalibration ? '#ffffff' : '#cccccc'}
            />
          </View>
          
          <TouchableOpacity 
            style={[styles.controlButton, styles.resetButton]}
            onPress={resetSystem}
          >
            <Ionicons name="refresh-outline" size={20} color="#ff4444" />
            <Text style={[styles.controlButtonText, { color: '#ff4444' }]}>Reset Système</Text>
          </TouchableOpacity>
        </View>

        {/* Status Cards */}
        {renderSystemStatus()}
        {renderAttitudeStatus()}
        {renderDataVisualization()}
        {renderPerformanceMetrics()}

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>💡 Comment ça marche</Text>
          <Text style={styles.instructionsText}>
            • Le système surveille en continu la stabilité de l'appareil{'\n'}
            • Quand stable (variance &lt; 0.2 m/s², gyro &lt; 0.1 rad/s) pendant 2s, il peut re-calibrer{'\n'}
            • Re-calibration automatique maximum toutes les 30s{'\n'}
            • Le filtre Madgwick maintient un quaternion téléphone→monde{'\n'}
            • Les données PDR/EKF sont transformées dans le repère corps stable
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  headerSubtitle: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
  },
  controlsCard: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#666666',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    flex: 0.48,
  },
  controlButtonStart: {
    backgroundColor: '#00ff88',
  },
  controlButtonStop: {
    backgroundColor: '#ff4444',
  },
  resetButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ff4444',
    alignSelf: 'center',
    flex: 0.6,
  },
  controlButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  settingLabel: {
    color: '#ffffff',
    fontSize: 16,
  },
  statusCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  statusTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    color: '#cccccc',
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusGreen: {
    backgroundColor: '#00ff88',
  },
  statusRed: {
    backgroundColor: '#ff4444',
  },
  statusOrange: {
    backgroundColor: '#ffaa00',
  },
  statusBlue: {
    backgroundColor: '#007bff',
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  quaternionContainer: {
    marginVertical: 10,
  },
  quaternionTitle: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 8,
  },
  quaternionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quaternionValue: {
    color: '#00ff88',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  stabilityContainer: {
    marginVertical: 10,
  },
  stabilityDuration: {
    color: '#00ff88',
    fontSize: 12,
    marginLeft: 20,
    marginBottom: 5,
  },
  magneticContainer: {
    marginVertical: 10,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  recalibrationContainer: {
    marginVertical: 10,
  },
  recalTime: {
    color: '#cccccc',
    fontSize: 12,
    marginLeft: 20,
  },
  metricsText: {
    color: '#cccccc',
    fontSize: 13,
    marginBottom: 3,
    fontFamily: 'monospace',
  },
  metricsSubTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
  },
  sensorGroup: {
    marginBottom: 15,
  },
  sensorTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  sensorData: {
    color: '#00ff88',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  instructionsCard: {
    backgroundColor: 'rgba(0, 123, 255, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 123, 255, 0.3)',
  },
  instructionsTitle: {
    color: '#007bff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  instructionsText: {
    color: '#cccccc',
    fontSize: 13,
    lineHeight: 18,
  },
}); 