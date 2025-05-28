// NativeMotionExample.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import NativeEnhancedMotionService from '../services/NativeEnhancedMotionService';

export default function NativeMotionExample() {
  const [motionService, setMotionService] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [stepData, setStepData] = useState({
    stepCount: 0,
    stepLength: 0,
    totalDistance: 0,
    source: 'none',
    cadence: 0,
    averageStepLength: 0
  });
  const [headingData, setHeadingData] = useState({
    heading: 0,
    accuracy: 0
  });
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Initialisation du service
    const service = new NativeEnhancedMotionService(
      handleStepDetected,
      handleHeading
    );
    setMotionService(service);

    return () => {
      if (service) {
        service.stop();
      }
    };
  }, []);

  const handleStepDetected = (data) => {
    console.log('📱 [EXAMPLE] Pas détecté:', data);
    
    setStepData({
      stepCount: data.stepCount,
      stepLength: data.stepLength,
      totalDistance: data.totalDistance || 0,
      source: data.source,
      confidence: data.confidence,
      cadence: data.cadence || 0,
      averageStepLength: data.averageStepLength || data.stepLength,
      timeDelta: data.timeDelta || 0
    });
  };

  const handleHeading = (data) => {
    setHeadingData({
      heading: data.filteredHeading || (data.yaw * 180 / Math.PI),
      accuracy: data.accuracy
    });
  };

  const startTracking = async () => {
    if (!motionService) return;

    try {
      await motionService.start();
      setIsRunning(true);
      
      // Mise à jour des stats toutes les secondes
      const statsInterval = setInterval(() => {
        setStats(motionService.getStats());
      }, 1000);

      // Nettoyer l'intervalle quand on arrête
      setTimeout(() => clearInterval(statsInterval), 300000); // 5 minutes max
      
    } catch (error) {
      Alert.alert('Erreur', `Impossible de démarrer le suivi: ${error.message}`);
    }
  };

  const stopTracking = async () => {
    if (!motionService) return;

    try {
      await motionService.stop();
      setIsRunning(false);
      setStats(motionService.getStats());
    } catch (error) {
      Alert.alert('Erreur', `Impossible d'arrêter le suivi: ${error.message}`);
    }
  };

  const resetTracking = async () => {
    if (!motionService) return;

    try {
      await motionService.reset();
      setStepData({
        stepCount: 0,
        stepLength: 0,
        totalDistance: 0,
        source: 'none',
        cadence: 0,
        averageStepLength: 0
      });
    } catch (error) {
      Alert.alert('Erreur', `Impossible de réinitialiser: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Service de Mouvement Adaptatif</Text>
      
      {/* Contrôles */}
      <View style={styles.controls}>
        <TouchableOpacity 
          style={[styles.button, isRunning ? styles.stopButton : styles.startButton]}
          onPress={isRunning ? stopTracking : startTracking}
        >
          <Text style={styles.buttonText}>
            {isRunning ? 'Arrêter' : 'Démarrer'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.resetButton}
          onPress={resetTracking}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Données de pas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Données de Pas Adaptatives</Text>
        <Text style={styles.data}>Nombre de pas: {stepData.stepCount}</Text>
        <Text style={styles.data}>
          Longueur instantanée: {stepData.stepLength.toFixed(3)}m
        </Text>
        <Text style={styles.data}>
          Longueur moyenne: {stepData.averageStepLength.toFixed(3)}m
        </Text>
        <Text style={styles.data}>
          Distance totale: {stepData.totalDistance.toFixed(3)}m
        </Text>
        <Text style={styles.data}>
          Cadence: {stepData.cadence.toFixed(2)} pas/s
        </Text>
        <Text style={[styles.data, styles.adaptiveSource]}>
          Source: {stepData.source}
        </Text>
        <Text style={styles.data}>
          Confiance: {(stepData.confidence * 100).toFixed(1)}%
        </Text>
        {stepData.timeDelta > 0 && (
          <Text style={styles.data}>
            Intervalle: {stepData.timeDelta.toFixed(2)}s
          </Text>
        )}
      </View>

      {/* Données d'orientation */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Orientation</Text>
        <Text style={styles.data}>
          Direction: {headingData.heading.toFixed(1)}°
        </Text>
        <Text style={styles.data}>
          Précision: {headingData.accuracy.toFixed(1)}°
        </Text>
      </View>

      {/* Statistiques */}
      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistiques</Text>
          <Text style={styles.data}>
            Durée session: {stats.sessionDuration.toFixed(1)}s
          </Text>
          <Text style={styles.data}>
            Podomètre disponible: {stats.metrics.nativeAvailable ? 'Oui' : 'Non'}
          </Text>
          <Text style={[styles.data, styles.adaptiveSource]}>
            Mode: ADAPTATIF Expo Pedometer
          </Text>
          <Text style={styles.data}>
            Longueur adaptative: {stats.metrics.adaptiveStepLength.toFixed(3)}m
          </Text>
          
          {/* Historique des derniers pas */}
          {stats.stepHistory && stats.stepHistory.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>Derniers pas:</Text>
              {stats.stepHistory.map((step, index) => (
                <Text key={index} style={styles.historyItem}>
                  #{index + 1}: {step.stepLength.toFixed(3)}m @ {step.cadence.toFixed(2)}Hz
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

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
    marginBottom: 20,
    color: '#333',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  resetButton: {
    backgroundColor: '#2196F3',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
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
  data: {
    fontSize: 16,
    marginBottom: 5,
    color: '#666',
  },
  adaptiveSource: {
    color: '#9C27B0',
    fontWeight: 'bold',
  },
  historySection: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 5,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#555',
  },
  historyItem: {
    fontSize: 12,
    color: '#777',
    marginBottom: 2,
  },
}); 