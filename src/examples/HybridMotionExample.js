// HybridMotionExample.js
// Exemple d'utilisation simple du HybridMotionService dans un composant React Native

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import HybridMotionService from '../services/HybridMotionService';

const HybridMotionExample = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [stepData, setStepData] = useState({
    stepCount: 0,
    distance: 0,
    position: { x: 0, y: 0 },
    cadence: 0,
    nativeSteps: 0,
    confidence: 0
  });
  const [headingData, setHeadingData] = useState({
    yaw: 0,
    accuracy: 0,
    rawHeading: 0,
    adaptiveAlpha: 0
  });
  const [stats, setStats] = useState(null);
  const [nativeData, setNativeData] = useState(null);

  const motionServiceRef = useRef(null);

  useEffect(() => {
    // Nettoyage lors du démontage du composant
    return () => {
      if (motionServiceRef.current) {
        motionServiceRef.current.stop();
      }
    };
  }, []);

  const handleStepDetected = ({ stepCount, stepLength, dx, dy, timestamp, cadence, nativeSteps, confidence }) => {
    setStepData(prev => ({
      stepCount,
      distance: prev.distance + stepLength,
      position: {
        x: prev.position.x + dx,
        y: prev.position.y + dy
      },
      cadence: cadence || 0,
      nativeSteps: nativeSteps || 0,
      confidence: confidence || 0
    }));
    
    console.log(`🚶 Nouveau pas: ${stepCount}, longueur: ${stepLength.toFixed(2)}m, cadence: ${cadence?.toFixed(1) || 'N/A'} pas/min`);
  };

  const handleHeadingUpdate = ({ yaw, accuracy, timestamp, rawHeading, adaptiveAlpha }) => {
    setHeadingData({ 
      yaw, 
      accuracy, 
      rawHeading: rawHeading || 0,
      adaptiveAlpha: adaptiveAlpha || 0
    });
    console.log(`🧭 Orientation: ${yaw.toFixed(1)}°, précision: ${accuracy}, alpha adaptatif: ${adaptiveAlpha?.toFixed(3) || 'N/A'}`);
  };

  const startTracking = async () => {
    try {
      // Création du service avec callbacks
      motionServiceRef.current = new HybridMotionService(
        handleStepDetected,
        handleHeadingUpdate
      );

      // Configuration optionnelle
      motionServiceRef.current.setUserHeight(1.75); // 1.75m
      motionServiceRef.current.setStepLengthSmoothing(0.1);
      motionServiceRef.current.setHeadingSmoothing(0.15);

      // Démarrage
      await motionServiceRef.current.start();
      setIsTracking(true);
      
      Alert.alert('Succès', `Suivi hybride démarré sur ${Platform.OS} !`);
    } catch (error) {
      console.error('Erreur démarrage:', error);
      Alert.alert('Erreur', `Impossible de démarrer le suivi: ${error.message}`);
    }
  };

  const stopTracking = () => {
    if (motionServiceRef.current) {
      motionServiceRef.current.stop();
      motionServiceRef.current = null;
      setIsTracking(false);
      Alert.alert('Info', 'Suivi hybride arrêté');
    }
  };

  const resetData = () => {
    if (motionServiceRef.current) {
      motionServiceRef.current.reset();
    }
    setStepData({
      stepCount: 0,
      distance: 0,
      position: { x: 0, y: 0 },
      cadence: 0,
      nativeSteps: 0,
      confidence: 0
    });
    setHeadingData({ yaw: 0, accuracy: 0, rawHeading: 0, adaptiveAlpha: 0 });
    setNativeData(null);
  };

  const getStats = () => {
    if (motionServiceRef.current) {
      const currentStats = motionServiceRef.current.getStats();
      setStats(currentStats);
      console.log('Statistiques complètes:', currentStats);
    }
  };

  const getNativeData = async () => {
    if (motionServiceRef.current) {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 60 * 1000); // 30 minutes
      const data = await motionServiceRef.current.getNativeStepData(startDate, endDate);
      setNativeData(data);
    }
  };

  const getCadenceColor = (cadence) => {
    if (cadence < 90) return '#FF9500'; // Orange - lent
    if (cadence > 130) return '#FF3B30'; // Rouge - rapide
    return '#34C759'; // Vert - normal
  };

  const getConfidenceColor = (confidence) => {
    if (confidence < 0.3) return '#FF3B30'; // Rouge - faible
    if (confidence < 0.7) return '#FF9500'; // Orange - moyen
    return '#34C759'; // Vert - élevé
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Podomètre Natif Optimisé</Text>
      <Text style={styles.subtitle}>Plateforme: {Platform.OS.toUpperCase()}</Text>
      
      {/* Contrôles */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, isTracking ? styles.stopButton : styles.startButton]}
          onPress={isTracking ? stopTracking : startTracking}
        >
          <Text style={styles.buttonText}>
            {isTracking ? 'Arrêter' : 'Démarrer'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={resetData}>
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={getStats}>
          <Text style={styles.buttonText}>Stats</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={getNativeData}>
          <Text style={styles.buttonText}>Natif</Text>
        </TouchableOpacity>
      </View>

      {/* Données des pas enrichies */}
      <View style={styles.dataSection}>
        <Text style={styles.sectionTitle}>🚶 Données des pas (Natif)</Text>
        <Text style={styles.dataText}>Pas détectés: {stepData.stepCount}</Text>
        <Text style={styles.dataText}>Pas natifs: {stepData.nativeSteps}</Text>
        <Text style={styles.dataText}>Distance: {stepData.distance.toFixed(2)} m</Text>
        <Text style={styles.dataText}>
          Position: ({stepData.position.x.toFixed(2)}, {stepData.position.y.toFixed(2)})
        </Text>
        <Text style={[styles.dataText, { color: getCadenceColor(stepData.cadence) }]}>
          Cadence: {stepData.cadence.toFixed(1)} pas/min
        </Text>
        <Text style={[styles.dataText, { color: getConfidenceColor(stepData.confidence) }]}>
          Confiance: {(stepData.confidence * 100).toFixed(1)}%
        </Text>
      </View>

      {/* Données d'orientation améliorées */}
      <View style={styles.dataSection}>
        <Text style={styles.sectionTitle}>🧭 Orientation (Adaptative)</Text>
        <Text style={styles.dataText}>Direction filtrée: {headingData.yaw.toFixed(1)}°</Text>
        <Text style={styles.dataText}>Direction brute: {headingData.rawHeading.toFixed(1)}°</Text>
        <Text style={styles.dataText}>Précision: {headingData.accuracy.toFixed(1)}°</Text>
        <Text style={styles.dataText}>Alpha adaptatif: {headingData.adaptiveAlpha.toFixed(3)}</Text>
      </View>

      {/* Données natives */}
      {nativeData && (
        <View style={styles.dataSection}>
          <Text style={styles.sectionTitle}>📊 Données natives (30 min)</Text>
          <Text style={styles.dataText}>Pas: {nativeData.steps}</Text>
          {nativeData.distance && (
            <Text style={styles.dataText}>Distance: {nativeData.distance.toFixed(2)} m</Text>
          )}
          {nativeData.floorsAscended !== undefined && (
            <Text style={styles.dataText}>Étages montés: {nativeData.floorsAscended}</Text>
          )}
          {nativeData.floorsDescended !== undefined && (
            <Text style={styles.dataText}>Étages descendus: {nativeData.floorsDescended}</Text>
          )}
        </View>
      )}

      {/* Statistiques complètes */}
      {stats && (
        <View style={styles.dataSection}>
          <Text style={styles.sectionTitle}>📈 Statistiques complètes</Text>
          <Text style={styles.dataText}>Plateforme: {stats.platform}</Text>
          <Text style={styles.dataText}>Taille utilisateur: {stats.userHeight} m</Text>
          <Text style={styles.dataText}>
            Longueur de pas: {stats.dynamicStepLength.toFixed(3)} m
          </Text>
          <Text style={styles.dataText}>
            Orientation: {stats.filteredYaw?.toFixed(1) || 'N/A'}°
          </Text>
          <Text style={styles.dataText}>
            Session: {stats.sessionDuration.toFixed(1)}s
          </Text>
          <Text style={[styles.dataText, { color: getConfidenceColor(stats.confidence) }]}>
            Confiance globale: {(stats.confidence * 100).toFixed(1)}%
          </Text>
          
          {/* Métriques natives */}
          {stats.nativeMetrics && (
            <>
              <Text style={styles.subSectionTitle}>Métriques natives:</Text>
              <Text style={styles.dataText}>
                Disponible: {stats.nativeMetrics.isAvailable ? '✅' : '❌'}
              </Text>
              <Text style={styles.dataText}>
                Pas totaux: {stats.nativeMetrics.totalSteps}
              </Text>
              {stats.nativeMetrics.totalDistance > 0 && (
                <Text style={styles.dataText}>
                  Distance totale: {stats.nativeMetrics.totalDistance.toFixed(2)} m
                </Text>
              )}
              <Text style={[styles.dataText, { color: getCadenceColor(stats.nativeMetrics.currentCadence) }]}>
                Cadence actuelle: {stats.nativeMetrics.currentCadence.toFixed(1)} pas/min
              </Text>
            </>
          )}
        </View>
      )}

      {/* Statut */}
      <View style={styles.statusSection}>
        <Text style={[styles.statusText, isTracking ? styles.tracking : styles.stopped]}>
          {isTracking ? '🟢 Suivi natif actif' : '🔴 Suivi arrêté'}
        </Text>
        {Platform.OS === 'ios' && isTracking && (
          <Text style={styles.platformInfo}>
            🍎 Utilise CMPedometer d'Apple
          </Text>
        )}
        {Platform.OS === 'android' && isTracking && (
          <Text style={styles.platformInfo}>
            🤖 Utilise le podomètre Android
          </Text>
        )}
      </View>
    </View>
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  button: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    marginBottom: 5,
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
    fontSize: 12,
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
  subSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    color: '#555',
  },
  dataText: {
    fontSize: 14,
    marginBottom: 3,
    color: '#666',
  },
  statusSection: {
    alignItems: 'center',
    marginTop: 20,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  platformInfo: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  tracking: {
    color: '#34C759',
  },
  stopped: {
    color: '#FF3B30',
  },
});

export default HybridMotionExample; 