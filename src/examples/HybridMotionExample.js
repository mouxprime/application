// Exemple d'utilisation simple du NativeEnhancedMotionService dans un composant React Native
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import NativeEnhancedMotionService from '../services/NativeEnhancedMotionService';

export default function NativeMotionExample() {
  const [isRunning, setIsRunning] = useState(false);
  const [stepData, setStepData] = useState({
    stepCount: 0,
    stepLength: 0,
    totalDistance: 0,
    source: 'none'
  });
  const [headingData, setHeadingData] = useState({
    heading: 0,
    accuracy: 0
  });
  const [stats, setStats] = useState(null);

  const motionServiceRef = useRef(null);

  useEffect(() => {
    // Initialisation du service
    motionServiceRef.current = new NativeEnhancedMotionService(
      // Callback pour les pas détectés
      (data) => {
        console.log('📱 [EXAMPLE] Pas détecté:', data);
        
        setStepData({
          stepCount: data.stepCount,
          stepLength: data.stepLength,
          totalDistance: data.totalDistance || 0,
          source: data.source,
          confidence: data.confidence,
          nativeStepLength: data.nativeStepLength
        });
      },
      // Callback pour l'orientation
      (data) => {
        setHeadingData({
          heading: data.filteredHeading || (data.yaw * 180 / Math.PI),
          accuracy: data.accuracy
        });
      }
    );

    return () => {
      if (motionServiceRef.current) {
        motionServiceRef.current.stop();
      }
    };
  }, []);

  const startTracking = async () => {
    if (!motionServiceRef.current) return;

    try {
      await motionServiceRef.current.start();
      setIsRunning(true);
      
      // Mise à jour des stats toutes les secondes
      const statsInterval = setInterval(() => {
        setStats(motionServiceRef.current.getStats());
      }, 1000);

      // Nettoyer l'intervalle quand on arrête
      setTimeout(() => clearInterval(statsInterval), 300000); // 5 minutes max
      
    } catch (error) {
      Alert.alert('Erreur', `Impossible de démarrer le suivi: ${error.message}`);
    }
  };

  const stopTracking = async () => {
    if (!motionServiceRef.current) return;

    try {
      await motionServiceRef.current.stop();
      setIsRunning(false);
      setStats(motionServiceRef.current.getStats());
    } catch (error) {
      Alert.alert('Erreur', `Impossible d'arrêter le suivi: ${error.message}`);
    }
  };

  const resetTracking = async () => {
    if (!motionServiceRef.current) return;

    try {
      await motionServiceRef.current.reset();
      setStepData({
        stepCount: 0,
        stepLength: 0,
        totalDistance: 0,
        source: 'none'
      });
    } catch (error) {
      Alert.alert('Erreur', `Impossible de réinitialiser: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Native Enhanced Motion Service</Text>
      
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
        <Text style={styles.sectionTitle}>Données de Pas</Text>
        <Text style={styles.data}>Nombre de pas: {stepData.stepCount}</Text>
        <Text style={styles.data}>
          Longueur de pas: {stepData.stepLength.toFixed(3)}m
        </Text>
        <Text style={styles.data}>
          Distance totale: {stepData.totalDistance.toFixed(3)}m
        </Text>
        <Text style={[styles.data, stepData.source === 'native_cmpedometer' ? styles.nativeSource : styles.fallbackSource]}>
          Source: {stepData.source}
        </Text>
        {stepData.nativeStepLength && (
          <Text style={styles.nativeIndicator}>
            ✅ Longueur de pas NATIVE: {stepData.nativeStepLength.toFixed(3)}m
          </Text>
        )}
        <Text style={styles.data}>
          Confiance: {(stepData.confidence * 100).toFixed(1)}%
        </Text>
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
            Module natif disponible: {stats.metrics.nativeAvailable ? 'Oui' : 'Non'}
          </Text>
          <Text style={[styles.data, stats.metrics.usingNativeStepLength ? styles.nativeSource : styles.fallbackSource]}>
            Mode: {stats.metrics.usingNativeStepLength ? 'NATIF CMPedometer' : 'FALLBACK Expo'}
          </Text>
          <Text style={styles.data}>
            Longueur moyenne: {stats.metrics.averageStepLength.toFixed(3)}m
          </Text>
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
  nativeSource: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  fallbackSource: {
    color: '#FF9800',
    fontWeight: 'bold',
  },
  nativeIndicator: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
    backgroundColor: '#E8F5E8',
    padding: 5,
    borderRadius: 4,
    marginVertical: 5,
  },
}); 