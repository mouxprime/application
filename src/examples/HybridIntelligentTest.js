// NativeIntelligentTest.js
// Test du système natif simplifié avec module CMPedometer
// Remplace l'ancien système hybride complexe

import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  Platform, 
  ScrollView,
  Switch
} from 'react-native';
import NativeEnhancedMotionService from '../services/NativeEnhancedMotionService';

const NativeIntelligentTest = () => {
  // États du service
  const [isRunning, setIsRunning] = useState(false);
  const [stepData, setStepData] = useState(null);
  const [headingData, setHeadingData] = useState(null);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  
  // États de contrôle
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Référence au service
  const motionServiceRef = useRef(null);
  const statsIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (motionServiceRef.current) {
        motionServiceRef.current.stop();
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, []);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      timestamp,
      message,
      type
    };
    
    setLogs(prev => [logEntry, ...prev.slice(0, 19)]); // Garder 20 logs max
  };

  const handleStepDetected = (data) => {
    setStepData(data);
    addLog(`Pas détecté: ${data.stepCount} (${data.source})`, 'step');
  };

  const handleHeadingUpdate = (data) => {
    setHeadingData(data);
  };

  const startService = async () => {
    try {
      addLog('Démarrage NativeEnhancedMotionService...', 'info');
      
      // Création du service
      motionServiceRef.current = new NativeEnhancedMotionService(
        handleStepDetected,
        handleHeadingUpdate
      );

      // Démarrage
      await motionServiceRef.current.start();
      setIsRunning(true);
      
      // Mise à jour des stats
      statsIntervalRef.current = setInterval(() => {
        if (motionServiceRef.current) {
          setStats(motionServiceRef.current.getStats());
        }
      }, 1000);
      
      addLog('✅ Service démarré avec succès', 'success');
      
    } catch (error) {
      addLog(`❌ Erreur: ${error.message}`, 'error');
      Alert.alert('Erreur', error.message);
    }
  };

  const stopService = async () => {
    try {
      if (motionServiceRef.current) {
        await motionServiceRef.current.stop();
        motionServiceRef.current = null;
      }
      
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
      
      setIsRunning(false);
      addLog('🛑 Service arrêté', 'info');
      
    } catch (error) {
      addLog(`❌ Erreur arrêt: ${error.message}`, 'error');
    }
  };

  const resetService = async () => {
    try {
      if (motionServiceRef.current) {
        await motionServiceRef.current.reset();
        addLog('🔄 Service réinitialisé', 'info');
      }
    } catch (error) {
      addLog(`❌ Erreur reset: ${error.message}`, 'error');
    }
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'error': return '#FF3B30';
      case 'success': return '#34C759';
      case 'step': return '#007AFF';
      default: return '#666';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Native Enhanced Motion Test</Text>
      <Text style={styles.subtitle}>Plateforme: {Platform.OS.toUpperCase()}</Text>

      {/* Contrôles principaux */}
      <View style={styles.controlSection}>
        <TouchableOpacity
          style={[styles.button, isRunning ? styles.stopButton : styles.startButton]}
          onPress={isRunning ? stopService : startService}
        >
          <Text style={styles.buttonText}>
            {isRunning ? 'Arrêter' : 'Démarrer'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={resetService}>
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Options avancées */}
      <View style={styles.optionSection}>
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Affichage avancé</Text>
          <Switch
            value={showAdvanced}
            onValueChange={setShowAdvanced}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={showAdvanced ? '#f5dd4b' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Données de pas */}
      {stepData && (
        <View style={styles.dataSection}>
          <Text style={styles.sectionTitle}>🚶 Données de Pas</Text>
          <Text style={styles.dataText}>Pas: {stepData.stepCount}</Text>
          <Text style={styles.dataText}>
            Longueur: {stepData.stepLength.toFixed(3)}m
            {stepData.nativeStepLength && ' (NATIVE)'}
          </Text>
          <Text style={styles.dataText}>
            Distance: {stepData.totalDistance?.toFixed(2) || 0}m
          </Text>
          <Text style={[styles.dataText, { 
            color: stepData.source === 'native_cmpedometer' ? '#34C759' : '#FF9500' 
          }]}>
            Source: {stepData.source}
          </Text>
          <Text style={styles.dataText}>
            Confiance: {(stepData.confidence * 100).toFixed(1)}%
          </Text>
        </View>
      )}

      {/* Données d'orientation */}
      {headingData && (
        <View style={styles.dataSection}>
          <Text style={styles.sectionTitle}>🧭 Orientation</Text>
          <Text style={styles.dataText}>
            Direction: {headingData.filteredHeading?.toFixed(1) || (headingData.yaw * 180 / Math.PI).toFixed(1)}°
          </Text>
          <Text style={styles.dataText}>
            Précision: {headingData.accuracy?.toFixed(1) || 'N/A'}°
          </Text>
          {showAdvanced && headingData.rawHeading && (
            <Text style={styles.dataText}>
              Brute: {headingData.rawHeading.toFixed(1)}°
            </Text>
          )}
        </View>
      )}

      {/* Statistiques */}
      {stats && (
        <View style={styles.dataSection}>
          <Text style={styles.sectionTitle}>📊 Statistiques</Text>
          <Text style={styles.dataText}>
            Durée: {stats.sessionDuration.toFixed(1)}s
          </Text>
          <Text style={[styles.dataText, { 
            color: stats.metrics.nativeAvailable ? '#34C759' : '#FF3B30' 
          }]}>
            Module natif: {stats.metrics.nativeAvailable ? 'Disponible' : 'Indisponible'}
          </Text>
          <Text style={[styles.dataText, { 
            color: stats.metrics.usingNativeStepLength ? '#34C759' : '#FF9500' 
          }]}>
            Mode: {stats.metrics.usingNativeStepLength ? 'NATIF' : 'FALLBACK'}
          </Text>
          <Text style={styles.dataText}>
            Longueur moyenne: {stats.metrics.averageStepLength.toFixed(3)}m
          </Text>
          
          {showAdvanced && (
            <>
              <Text style={styles.dataText}>
                Plateforme: {stats.platform}
              </Text>
              <Text style={styles.dataText}>
                Steps totaux: {stats.metrics.totalSteps}
              </Text>
              <Text style={styles.dataText}>
                Distance totale: {stats.metrics.totalDistance.toFixed(2)}m
              </Text>
            </>
          )}
        </View>
      )}

      {/* Logs en temps réel */}
      <View style={styles.logSection}>
        <Text style={styles.sectionTitle}>📝 Logs</Text>
        {logs.slice(0, 10).map((log) => (
          <Text 
            key={log.id} 
            style={[styles.logText, { color: getLogColor(log.type) }]}
          >
            [{log.timestamp}] {log.message}
          </Text>
        ))}
      </View>

      {/* Statut */}
      <View style={styles.statusSection}>
        <Text style={[styles.statusText, isRunning ? styles.running : styles.stopped]}>
          {isRunning ? '🟢 Service actif' : '🔴 Service arrêté'}
        </Text>
        {Platform.OS === 'ios' && isRunning && stats?.metrics.usingNativeStepLength && (
          <Text style={styles.platformInfo}>
            🍎 Utilise CMPedometer natif
          </Text>
        )}
        {isRunning && !stats?.metrics.usingNativeStepLength && (
          <Text style={styles.platformInfo}>
            📱 Mode fallback Expo Pedometer
          </Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
    fontStyle: 'italic',
  },
  controlSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    minWidth: 100,
  },
  startButton: {
    backgroundColor: '#34C759',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  optionSection: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 16,
    color: '#333',
  },
  dataSection: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  dataText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#666',
  },
  logSection: {
    backgroundColor: '#f8f8f8',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    maxHeight: 200,
  },
  logText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  statusSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  running: {
    color: '#34C759',
  },
  stopped: {
    color: '#FF3B30',
  },
  platformInfo: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default NativeIntelligentTest; 