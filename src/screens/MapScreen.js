import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Text as SvgText, G, Defs, Pattern } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';

import { useLocalization } from '../context/LocalizationContext';
import { VectorMapManager } from '../maps/VectorMapManager';
import { LocalizationSDK } from '../algorithms/LocalizationSDK';
import { ScaleConverter } from '../utils/ScaleConverter';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Dimensions de la carte totale
const MAP_TOTAL_WIDTH = 14629;
const MAP_TOTAL_HEIGHT = 13764;

// Zoom limites
const MIN_ZOOM = 1;
const MAX_ZOOM = 15;

export default function MapScreen() {
  const { state, actions } = useLocalization();
  const [mapManager] = useState(() => new VectorMapManager());
  const [localizationSDK] = useState(() => new LocalizationSDK({
    userHeight: 1.7,
    adaptiveSampling: true,
    energyOptimization: true,
    positionUpdateRate: 1.0
  }));
  
  // Convertisseur d'échelle avec l'échelle de référence
  const [scaleConverter] = useState(() => new ScaleConverter({
    referenceMaters: 100,     // 100 mètres
    referencePixels: 372,     // = 372 pixels
    screenWidth: screenWidth,
    screenHeight: screenHeight - 200
  }));
  
  // État de la carte
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [batteryLevel, setBatteryLevel] = useState(1);
  const [batteryState, setBatteryState] = useState('unknown');
  
  // Référence pour les gestes de pan
  const panRef = useRef();

  // Dimensions de l'affichage SVG
  const svgWidth = screenWidth;
  const svgHeight = screenHeight - 200; // Espace pour les contrôles et métriques

  useEffect(() => {
    initializeSystem();
    initializeBattery();
    
    // Mise à jour périodique des métriques et de la batterie
    const metricsInterval = setInterval(async () => {
      // Mise à jour des métriques PDR
      if (localizationSDK && localizationSDK.currentState) {
        const currentState = localizationSDK.currentState;
        actions.updatePDRMetrics({
          stepCount: currentState.stepCount || 0,
          distance: currentState.distance || 0,
          sampleRate: currentState.sampleRate || 25,
          energyLevel: currentState.energyLevel || 1.0,
          isZUPT: currentState.isZUPT || false
        });
      }
      
      // Mise à jour de la batterie toutes les 30 secondes
      if (Date.now() % 30000 < 1000) {
        try {
          const newLevel = await Battery.getBatteryLevelAsync();
          const newState = await Battery.getBatteryStateAsync();
          setBatteryLevel(newLevel);
          setBatteryState(newState);
        } catch (error) {
          console.warn('Erreur mise à jour batterie:', error);
        }
      }
    }, 1000); // Mise à jour toutes les secondes
    
    return () => {
      if (localizationSDK) {
        localizationSDK.stopTracking();
      }
      clearInterval(metricsInterval);
    };
  }, []);

  // Configuration des callbacks du SDK
  useEffect(() => {
    localizationSDK.setCallbacks({
      onPositionUpdate: (x, y, theta, mode) => {
        const pose = { x, y, theta, confidence: localizationSDK.currentState.confidence };
        actions.updatePose(pose);
        actions.addTrajectoryPoint({
          x, y, timestamp: Date.now(),
          confidence: pose.confidence
        });
        
        // Mise à jour des métriques PDR
        const currentState = localizationSDK.currentState;
        actions.updatePDRMetrics({
          currentMode: mode || 'stationary',
          stepCount: currentState.stepCount || 0,
          distance: currentState.distance || 0,
          sampleRate: currentState.sampleRate || 25,
          energyLevel: currentState.energyLevel || 1.0,
          isZUPT: currentState.isZUPT || false
        });
      },
      onModeChanged: (mode, features) => {
        console.log(`Mode changé: ${mode}`, features);
        actions.updatePDRMetrics({ currentMode: mode });
      },
      onEnergyStatusChanged: (energyStatus) => {
        console.log('État énergétique:', energyStatus);
        actions.updatePDRMetrics({ energyLevel: energyStatus.energyLevel || 1.0 });
      }
    });
  }, [actions]);

  /**
   * Initialisation de la batterie
   */
  const initializeBattery = async () => {
    try {
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(level);
      
      const state = await Battery.getBatteryStateAsync();
      setBatteryState(state);
      
    } catch (error) {
      console.warn('Impossible d\'obtenir les informations de batterie:', error);
    }
  };

  /**
   * Initialisation du système
   */
  const initializeSystem = async () => {
    try {
      // Position initiale par défaut à (0, 0)
      const initialPose = { x: 0, y: 0, theta: 0 };

      // Initialisation du SDK sans carte préchargée
      await localizationSDK.initialize(null);
      localizationSDK.resetPosition(0, 0, 0, 0);
      actions.resetPose(initialPose);
      
      setIsMapLoaded(true);
      
    } catch (error) {
      console.error('Erreur initialisation:', error);
      Alert.alert('Erreur', 'Impossible d\'initialiser le système de localisation');
    }
  };

  /**
   * Démarrage/arrêt du tracking
   */
  const toggleTracking = async () => {
    if (state.isTracking) {
      actions.setTracking(false);
      localizationSDK.stopTracking();
    } else {
      actions.setTracking(true);
      await localizationSDK.startTracking();
    }
  };

  /**
   * Réinitialisation de la position à (0,0)
   */
  const resetPosition = () => {
    Alert.alert(
      'Réinitialiser la position',
      'Êtes-vous sûr de vouloir réinitialiser votre position à (0,0) ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          onPress: () => {
            const initialPose = { x: 0, y: 0, theta: 0 };
            actions.resetPose(initialPose);
            localizationSDK.resetPosition(0, 0, 0, 0);
            setViewOffset({ x: 0, y: 0 });
          }
        }
      ]
    );
  };

  /**
   * Conversion des coordonnées monde vers l'écran SVG
   */
  const worldToSVG = (worldPos) => {
    return scaleConverter.worldToScreen(worldPos.x, worldPos.y);
  };

  /**
   * Gestionnaire de zoom
   */
  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 1, MAX_ZOOM);
    setZoom(newZoom);
    scaleConverter.setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 1, MIN_ZOOM);
    setZoom(newZoom);
    scaleConverter.setZoom(newZoom);
  };

  /**
   * Gestionnaire de panoramique
   */
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (evt, gestureState) => {
      const newOffset = {
        x: viewOffset.x + gestureState.dx,
        y: viewOffset.y + gestureState.dy
      };
      setViewOffset(newOffset);
      scaleConverter.setViewOffset(newOffset);
    },
    onPanResponderRelease: () => {
      // Optionnel: ajouter une logique de snap ou de limites
    },
  });

  /**
   * Rendu de la grille noire
   */
  const renderGrid = () => {
    const gridSize = scaleConverter.getGridSize(); // Taille adaptative selon le zoom
    const lines = [];
    
    // Calculer les limites visibles en utilisant le convertisseur
    const visibleBounds = scaleConverter.getVisibleBounds();
    const minX = Math.floor(visibleBounds.minX / gridSize) * gridSize;
    const maxX = Math.ceil(visibleBounds.maxX / gridSize) * gridSize;
    const minY = Math.floor(visibleBounds.minY / gridSize) * gridSize;
    const maxY = Math.ceil(visibleBounds.maxY / gridSize) * gridSize;
    
    // Lignes verticales
    for (let x = minX; x <= maxX; x += gridSize) {
      const svgStart = worldToSVG({ x, y: minY });
      const svgEnd = worldToSVG({ x, y: maxY });
      lines.push(
        <Line
          key={`v-${x}`}
          x1={svgStart.x}
          y1={svgStart.y}
          x2={svgEnd.x}
          y2={svgEnd.y}
          stroke="#333333"
          strokeWidth="1"
          opacity="0.3"
        />
      );
    }
    
    // Lignes horizontales
    for (let y = minY; y <= maxY; y += gridSize) {
      const svgStart = worldToSVG({ x: minX, y });
      const svgEnd = worldToSVG({ x: maxX, y });
      lines.push(
        <Line
          key={`h-${y}`}
          x1={svgStart.x}
          y1={svgStart.y}
          x2={svgEnd.x}
          y2={svgEnd.y}
          stroke="#333333"
          strokeWidth="1"
          opacity="0.3"
        />
      );
    }
    
    return <G>{lines}</G>;
  };

  /**
   * Rendu de la trajectoire en vert fluo
   */
  const renderTrajectory = () => {
    if (!state.trajectory || state.trajectory.length < 2) return null;
    
    const pathData = state.trajectory.map((point, index) => {
      const svgPos = worldToSVG({ x: point.x, y: point.y });
      return `${index === 0 ? 'M' : 'L'} ${svgPos.x} ${svgPos.y}`;
    }).join(' ');
    
    return (
      <Path
        d={pathData}
        stroke="#00ff00"  // Vert fluo
        strokeWidth="3"
        fill="none"
        opacity="0.9"
      />
    );
  };

  /**
   * Rendu de la position actuelle
   */
  const renderCurrentPosition = () => {
    const svgPos = worldToSVG({ x: state.pose.x, y: state.pose.y });
    
    // Indicateur de direction
    const headingLength = 30;
    const headingX = svgPos.x + Math.cos(state.pose.theta) * headingLength;
    const headingY = svgPos.y - Math.sin(state.pose.theta) * headingLength;
    
    return (
      <G>
        {/* Ligne de direction */}
        <Line
          x1={svgPos.x}
          y1={svgPos.y}
          x2={headingX}
          y2={headingY}
          stroke="#00ff00"  // Vert fluo
          strokeWidth="4"
        />
        {/* Position actuelle */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r="15"
          fill="#00ff00"  // Vert fluo
          stroke="#ffffff"
          strokeWidth="3"
        />
        {/* Niveau de confiance */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r={15 + (1 - state.pose.confidence) * 30}
          fill="none"
          stroke="rgba(0, 255, 0, 0.3)"
          strokeWidth="2"
        />
      </G>
    );
  };

  /**
   * Rendu des métriques en temps réel
   */
  const renderMetrics = () => {
    const getBatteryIcon = () => {
      if (batteryLevel > 0.75) return 'battery-full';
      if (batteryLevel > 0.5) return 'battery-half';
      if (batteryLevel > 0.25) return 'battery-dead';
      return 'battery-dead';
    };

    const getBatteryColor = () => {
      if (batteryLevel > 0.5) return '#00ff88';
      if (batteryLevel > 0.25) return '#ffaa00';
      return '#ff4444';
    };

    return (
      <View style={styles.metricsPanel}>
        {/* Métriques principales */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Position</Text>
            <Text style={styles.metricValue}>
              ({state.pose.x.toFixed(1)}, {state.pose.y.toFixed(1)})
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Orientation</Text>
            <Text style={styles.metricValue}>
              {(state.pose.theta * 180 / Math.PI).toFixed(1)}°
            </Text>
          </View>
        </View>

        {/* Métriques PDR */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Mode</Text>
            <Text style={[styles.metricValue, { color: '#00ff88' }]}>
              {state.currentMode || 'STATIONNAIRE'}
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Pas</Text>
            <Text style={styles.metricValue}>{state.stepCount || 0}</Text>
          </View>
        </View>

        {/* Métriques techniques */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Confiance</Text>
            <Text style={styles.metricValue}>
              {(state.pose.confidence * 100).toFixed(0)}%
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>
              {(state.distance || 0).toFixed(1)} m
            </Text>
          </View>
        </View>

        {/* Batterie */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Ionicons 
              name={getBatteryIcon()} 
              size={20} 
              color={getBatteryColor()} 
            />
            <Text style={[styles.metricValue, { color: getBatteryColor() }]}>
              {(batteryLevel * 100).toFixed(0)}%
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Zoom</Text>
            <Text style={styles.metricValue}>x{zoom}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (!isMapLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="map" size={64} color="#00ff88" />
          <Text style={styles.loadingText}>Initialisation de la carte...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Carte SVG avec gestes */}
      <View style={styles.mapContainer} {...panResponder.panHandlers}>
        <Svg width={svgWidth} height={svgHeight} style={styles.svg}>
          {/* Fond noir */}
          <Path
            d={`M 0 0 L ${svgWidth} 0 L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`}
            fill="#000000"
          />
          
          {/* Grille */}
          {renderGrid()}
          
          {/* Trajectoire */}
          {renderTrajectory()}
          
          {/* Position actuelle */}
          {renderCurrentPosition()}
        </Svg>
      </View>

      {/* Métriques en temps réel */}
      {renderMetrics()}

      {/* Contrôles */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.controlButton, state.isTracking && styles.activeButton]}
          onPress={toggleTracking}
        >
          <Ionicons 
            name={state.isTracking ? "pause" : "play"} 
            size={24} 
            color={state.isTracking ? "#000000" : "#00ff88"} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={resetPosition}>
          <Ionicons name="refresh" size={24} color="#00ff88" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut}>
          <Ionicons name="remove" size={24} color="#00ff88" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn}>
          <Ionicons name="add" size={24} color="#00ff88" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    marginTop: 20,
  },
  mapContainer: {
    flex: 1,
  },
  svg: {
    backgroundColor: '#000000',
  },
  metricsPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#00ff88',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    color: '#888888',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  metricValue: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingVertical: 15,
    paddingHorizontal: 20,
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: '#00ff88',
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 2,
    borderColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: '#00ff88',
  },
}); 