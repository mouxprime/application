import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
  PanResponder,
  Modal,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Text as SvgText, G, Defs, Pattern } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';

import { useLocalization } from '../context/LocalizationContext';
import { useAuth } from '../context/AuthContext';
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
  const { state: authState, actions: authActions } = useAuth();
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
  
  // *** NOUVEAU: État pour masquer/afficher le panneau de métriques ***
  const [isMetricsPanelVisible, setIsMetricsPanelVisible] = useState(true);
  
  // *** NOUVEAU: État pour stabilisation de l'orientation ***
  const [stableOrientation, setStableOrientation] = useState(0);
  const orientationHistoryRef = useRef([]);
  const lastOrientationUpdateRef = useRef(0);
  
  // État de la calibration
  const [calibrationModal, setCalibrationModal] = useState({
    visible: false,
    progress: 0,
    message: '',
    step: ''
  });

  // *** NOUVEAU: État pour la sauvegarde de trajet ***
  const [saveTrajectoryModal, setSaveTrajectoryModal] = useState({
    visible: false,
    trajectoryName: '',
    isLoading: false
  });
  
  // Référence pour les gestes de pan
  const panRef = useRef();

  // Dimensions de l'affichage SVG
  const svgWidth = screenWidth;
  const svgHeight = screenHeight - 200; // Espace pour les contrôles et métriques

  useEffect(() => {
    initializeSystem();
    initializeBattery();
    
    // *** CORRECTION: Suppression de la mise à jour périodique qui cause la boucle infinie ***
    // Les métriques sont maintenant mises à jour via les callbacks du SDK
    
    return () => {
      if (localizationSDK) {
        localizationSDK.stopTracking();
      }
    };
  }, []);

  // *** NOUVEAU: Mise à jour de la batterie séparée pour éviter les boucles infinies ***
  useEffect(() => {
    const batteryInterval = setInterval(async () => {
      try {
        const newLevel = await Battery.getBatteryLevelAsync();
        const newState = await Battery.getBatteryStateAsync();
        setBatteryLevel(newLevel);
        setBatteryState(newState);
      } catch (error) {
        console.warn('Erreur mise à jour batterie:', error);
      }
    }, 30000); // Mise à jour toutes les 30 secondes
    
    return () => clearInterval(batteryInterval);
  }, []);

  // Configuration des callbacks du SDK
  useEffect(() => {
    localizationSDK.setCallbacks({
      onPositionUpdate: (x, y, theta, mode) => {
        // *** NOUVEAU: Stabiliser l'orientation avant mise à jour ***
        stabilizeOrientation(theta);
        
        const pose = { x, y, theta, confidence: localizationSDK.currentState?.confidence || 0 };
        actions.updatePose(pose);
        
        // *** SUPPRIMÉ: Ajout automatique de points de trajectoire ***
        // Les points seront ajoutés seulement lors de la détection de pas
        
        // Mise à jour des métriques PDR avec détection verticale
        const currentState = localizationSDK.currentState;
        if (currentState) {
          const verticalMetrics = localizationSDK.pdr?.getVerticalDetectionMetrics();
          
          actions.updatePDRMetrics({
            currentMode: mode || 'stationary',
            stepCount: currentState.stepCount || 0,
            distance: currentState.distance || 0,
            sampleRate: currentState.sampleRate || 25,
            energyLevel: currentState.energyLevel || 1.0,
            isZUPT: currentState.isZUPT || false,
            verticalDetection: currentState.verticalDetection || null,
            verticalMetrics: verticalMetrics
          });
        }
      },
      onModeChanged: (mode, features) => {
        console.log(`Mode changé: ${mode}`, features);
        actions.updatePDRMetrics({ currentMode: mode });
      },
      onEnergyStatusChanged: (energyStatus) => {
        console.log('État énergétique:', energyStatus);
        actions.updatePDRMetrics({ energyLevel: energyStatus.energyLevel || 1.0 });
      },
      // *** NOUVEAU: Callback spécifique pour les pas détectés ***
      onStepDetected: (stepCount, stepLength, x, y, theta) => {
        console.log(`[STEP DÉTECTÉ] #${stepCount} - Ajout point trajectoire: (${x.toFixed(2)}, ${y.toFixed(2)})`);
        
        // Ajouter un point de trajectoire seulement lors d'un pas
        const now = Date.now();
        actions.addTrajectoryPoint({
          x, y, timestamp: now,
          confidence: localizationSDK.currentState?.confidence || 0,
          stepNumber: stepCount
        });
      },
      onCalibrationProgress: (progress) => {
        console.log('Progression calibration:', progress);
        
        // Afficher le modal de calibration
        setCalibrationModal({
          visible: progress.isCalibrating || !progress.isComplete,
          progress: progress.progress || 0,
          message: progress.message || 'Calibration en cours...',
          step: progress.step || 'unknown'
        });
        
        // Cacher le modal quand calibration terminée
        if (progress.isComplete) {
          setTimeout(() => {
            setCalibrationModal(prev => ({ ...prev, visible: false }));
          }, 1500); // Afficher "Terminé" pendant 1.5s
        }
      },
      onDataUpdate: (sensorData) => {
        // Mise à jour du contexte avec les données capteurs en temps réel
        // Gestion des données enrichies d'AdvancedSensorManager
        const accelerometer = sensorData.accelerometer || { x: 0, y: 0, z: 0 };
        const gyroscope = sensorData.gyroscope || { x: 0, y: 0, z: 0 };
        const magnetometer = sensorData.magnetometer || { x: 0, y: 0, z: 0 };
        
        // Ajout de la magnitude pour l'accéléromètre si pas déjà présente
        if (accelerometer && !accelerometer.magnitude) {
          accelerometer.magnitude = Math.sqrt(
            accelerometer.x ** 2 + accelerometer.y ** 2 + accelerometer.z ** 2
          );
        }
        
        actions.updateSensors({
          accelerometer,
          gyroscope,
          magnetometer,
          metadata: sensorData.metadata || {}
        });
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
      actions.resetTrajectory();
      
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
            actions.resetTrajectory();
            localizationSDK.resetPosition(0, 0, 0, 0);
            setViewOffset({ x: 0, y: 0 });
            console.log('[RESET] Position et trajectoire réinitialisées');
          }
        }
      ]
    );
  };

  /**
   * *** NOUVEAU: Centrer la vue sur la trajectoire ***
   */
  const centerOnTrajectory = () => {
    if (!state.trajectory || state.trajectory.length === 0) return;
    
    // Calculer les limites de la trajectoire
    const xs = state.trajectory.map(p => p.x);
    const ys = state.trajectory.map(p => p.y);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    // Centre de la trajectoire
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Convertir en coordonnées écran
    const centerScreen = scaleConverter.worldToScreen(centerX, centerY);
    
    // Calculer l'offset nécessaire pour centrer
    const targetOffset = {
      x: (svgWidth / 2) - centerScreen.x + viewOffset.x,
      y: (svgHeight / 2) - centerScreen.y + viewOffset.y
    };
    
    setViewOffset(targetOffset);
    scaleConverter.setViewOffset(targetOffset);
    
    console.log(`[VIEW] Centré sur trajectoire: centre=(${centerX.toFixed(2)}, ${centerY.toFixed(2)}), offset=(${targetOffset.x.toFixed(1)}, ${targetOffset.y.toFixed(1)})`);
  };

  /**
   * *** NOUVEAU: Sauvegarder le trajet actuel ***
   */
  const handleSaveTrajectory = () => {
    if (!authState.isAuthenticated) {
      Alert.alert(
        'Connexion requise',
        'Vous devez être connecté pour sauvegarder vos trajets.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Se connecter', onPress: () => {
            // L'utilisateur peut naviguer vers l'onglet Mon Compte
            Alert.alert('Info', 'Rendez-vous dans l\'onglet "Mon Compte" pour vous connecter.');
          }}
        ]
      );
      return;
    }

    if (!state.trajectory || state.trajectory.length === 0) {
      Alert.alert('Erreur', 'Aucun trajet à sauvegarder');
      return;
    }

    // Ouvrir le modal de sauvegarde
    setSaveTrajectoryModal({
      visible: true,
      trajectoryName: `Trajet ${new Date().toLocaleDateString()}`,
      isLoading: false
    });
  };

  /**
   * *** NOUVEAU: Confirmer la sauvegarde du trajet ***
   */
  const confirmSaveTrajectory = async () => {
    if (!saveTrajectoryModal.trajectoryName.trim()) {
      Alert.alert('Erreur', 'Veuillez donner un nom au trajet');
      return;
    }

    setSaveTrajectoryModal(prev => ({ ...prev, isLoading: true }));

    try {
      // Générer le chemin SVG
      const svgPath = generateSVGPath();
      
      // Préparer les données du trajet
      const trajectoryData = {
        name: saveTrajectoryModal.trajectoryName.trim(),
        points: state.trajectory,
        svgPath: svgPath,
        stepCount: state.stepCount || 0,
        distance: state.distance || 0,
        duration: 0 // TODO: calculer la durée réelle
      };

      // Sauvegarder via le contexte d'authentification
      const result = await authActions.saveTrajectory(trajectoryData);

      if (result.success) {
        setSaveTrajectoryModal({ visible: false, trajectoryName: '', isLoading: false });
        Alert.alert('Succès', `Trajet "${trajectoryData.name}" sauvegardé !`);
      } else {
        throw new Error(result.error || 'Erreur de sauvegarde');
      }
    } catch (error) {
      console.error('Erreur sauvegarde trajet:', error);
      Alert.alert('Erreur', error.message || 'Impossible de sauvegarder le trajet');
      setSaveTrajectoryModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * *** NOUVEAU: Générer le chemin SVG de la trajectoire ***
   */
  const generateSVGPath = () => {
    if (!state.trajectory || state.trajectory.length < 2) {
      return '';
    }

    return state.trajectory.map((point, index) => {
      const svgPos = worldToSVG({ x: point.x, y: point.y });
      return `${index === 0 ? 'M' : 'L'} ${svgPos.x.toFixed(2)} ${svgPos.y.toFixed(2)}`;
    }).join(' ');
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
    if (!state.trajectory || state.trajectory.length < 2) {
      return null;
    }
    
    // *** LOGS RÉDUITS: Seulement pour les changements significatifs ***
    if (state.trajectory.length % 5 === 0) { // Log seulement tous les 5 points
      console.log(`[TRAJECTORY] ${state.trajectory.length} points - Dernier: (${state.trajectory[state.trajectory.length - 1].x.toFixed(2)}, ${state.trajectory[state.trajectory.length - 1].y.toFixed(2)})`);
    }
    
    const pathData = state.trajectory.map((point, index) => {
      const svgPos = worldToSVG({ x: point.x, y: point.y });
      return `${index === 0 ? 'M' : 'L'} ${svgPos.x} ${svgPos.y}`;
    }).join(' ');
    
    return (
      <G>
        {/* *** AMÉLIORATION: Cercles plus visibles pour marquer chaque point *** */}
        {state.trajectory.map((point, index) => {
          const svgPos = worldToSVG({ x: point.x, y: point.y });
          
          return (
            <Circle
              key={`trajectory-point-${index}`}
              cx={svgPos.x}
              cy={svgPos.y}
              r="4"              // *** AUGMENTÉ: de 3 à 4 pixels ***
              fill="#00ff00"
              opacity="0.8"      // *** AUGMENTÉ: de 0.7 à 0.8 ***
              stroke="#ffffff"   // *** NOUVEAU: Contour blanc pour visibilité ***
              strokeWidth="1"
            />
          );
        })}
        
        {/* Ligne de trajectoire - plus épaisse */}
        <Path
          d={pathData}
          stroke="#00ff00"      // Vert fluo
          strokeWidth="4"       // *** AUGMENTÉ: de 3 à 4 pixels ***
          fill="none"
          opacity="0.9"
        />
        
        {/* *** NOUVEAU: Ligne de trajectoire avec effet de lueur *** */}
        <Path
          d={pathData}
          stroke="#00ff00"
          strokeWidth="8"       // Ligne plus large pour l'effet de lueur
          fill="none"
          opacity="0.3"         // Transparente pour l'effet
        />
      </G>
    );
  };

  /**
   * Rendu de la position actuelle
   */
  const renderCurrentPosition = () => {
    const svgPos = worldToSVG({ x: state.pose.x, y: state.pose.y });
    
    // *** CORRECTION: Utiliser l'orientation stabilisée ***
    const headingLength = 15; // *** RÉDUIT: de 30 à 15 pixels ***
    const headingX = svgPos.x + Math.cos(stableOrientation) * headingLength;
    const headingY = svgPos.y - Math.sin(stableOrientation) * headingLength;
    
    return (
      <G>
        {/* Ligne de direction */}
        <Line
          x1={svgPos.x}
          y1={svgPos.y}
          x2={headingX}
          y2={headingY}
          stroke="#00ff00"  // Vert fluo
          strokeWidth="2"   // *** RÉDUIT: de 4 à 2 pixels ***
        />
        {/* Position actuelle - 2x plus petite */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r="7.5"           // *** RÉDUIT: de 15 à 7.5 pixels ***
          fill="#00ff00"    // Vert fluo
          stroke="#ffffff"
          strokeWidth="2"   // *** RÉDUIT: de 3 à 2 pixels ***
        />
        {/* Niveau de confiance - ajusté proportionnellement */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r={7.5 + (1 - state.pose.confidence) * 15}  // *** RÉDUIT: de 15+30 à 7.5+15 ***
          fill="none"
          stroke="rgba(0, 255, 0, 0.3)"
          strokeWidth="1"   // *** RÉDUIT: de 2 à 1 pixel ***
        />
      </G>
    );
  };

  /**
   * Rendu des métriques en temps réel
   */
  const renderMetrics = () => {
    if (!isMetricsPanelVisible) return null;

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

    // Détection d'alertes
    const getConfidenceColor = () => {
      if (state.pose.confidence > 0.5) return '#00ff88';
      if (state.pose.confidence > 0.2) return '#ffaa00';
      return '#ff4444';
    };

    const shouldShowStepAlert = () => {
      // Alerte si pas de pas détectés après 10 secondes de marche
      return state.isTracking && state.currentMode === 'walking' && 
             (state.stepCount || 0) === 0 && Date.now() - (state.lastModeChange || 0) > 10000;
    };

    const shouldShowConfidenceAlert = () => {
      // Alerte si confiance très faible trop longtemps
      return state.pose.confidence < 0.05 && state.isTracking;
    };

    return (
      <View style={styles.metricsPanel}>
        {/* *** NOUVEAU: En-tête avec bouton de fermeture *** */}
        <View style={styles.metricsPanelHeader}>
          <Text style={styles.metricsPanelTitle}>Métriques Temps Réel</Text>
          <TouchableOpacity onPress={toggleMetricsPanel} style={styles.closeButton}>
            <Ionicons name="eye-off" size={20} color="#00ff88" />
          </TouchableOpacity>
        </View>
        
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

        {/* Métriques PDR avec indicateur mode */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Mode</Text>
            <Text style={[styles.metricValue, { color: getModeColor() }]}>
              {getModeLabel()}
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Pas</Text>
            <Text style={styles.metricValue}>{state.stepCount || 0}</Text>
            {shouldShowStepAlert() && (
              <Ionicons name="warning" size={12} color="#ff4444" />
            )}
          </View>
        </View>

        {/* Métriques techniques */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Confiance</Text>
            <Text style={[styles.metricValue, { color: getConfidenceColor() }]}>
              {(state.pose.confidence * 100).toFixed(0)}%
            </Text>
            {shouldShowConfidenceAlert() && (
              <Ionicons name="warning" size={12} color="#ff4444" />
            )}
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

  /**
   * *** NOUVEAU: Basculement visibilité panneau de métriques ***
   */
  const toggleMetricsPanel = () => {
    setIsMetricsPanelVisible(!isMetricsPanelVisible);
  };

  /**
   * *** NOUVEAU: Couleur et label du mode (SIMPLIFIÉ) ***
   */
  const getModeColor = () => {
    return '#00ff88'; // Toujours vert pour walking
  };

  const getModeLabel = () => {
    return 'WALKING'; // Mode fixe
  };

  /**
   * *** NOUVEAU: Stabilisation de l'orientation avec filtrage ***
   */
  const stabilizeOrientation = (newTheta) => {
    const now = Date.now();
    
    // Normaliser l'angle entre -π et π
    const normalizeAngle = (angle) => {
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
      return angle;
    };
    
    const normalizedTheta = normalizeAngle(newTheta);
    
    // Ajouter à l'historique
    orientationHistoryRef.current.push({
      angle: normalizedTheta,
      timestamp: now
    });
    
    // Garder seulement les 10 dernières mesures (sur ~1 seconde)
    if (orientationHistoryRef.current.length > 10) {
      orientationHistoryRef.current.shift();
    }
    
    // Filtrage seulement si on a assez de données
    if (orientationHistoryRef.current.length < 3) {
      setStableOrientation(normalizedTheta);
      return;
    }
    
    // Calculer la moyenne pondérée (plus de poids aux mesures récentes)
    let weightedSum = 0;
    let totalWeight = 0;
    
    orientationHistoryRef.current.forEach((entry, index) => {
      const weight = index + 1; // Poids croissant
      const angleDiff = normalizedTheta - entry.angle;
      
      // Gérer le passage par ±π (ex: de -179° à +179°)
      let adjustedAngle = entry.angle;
      if (Math.abs(angleDiff) > Math.PI) {
        if (angleDiff > 0) {
          adjustedAngle += 2 * Math.PI;
        } else {
          adjustedAngle -= 2 * Math.PI;
        }
      }
      
      weightedSum += adjustedAngle * weight;
      totalWeight += weight;
    });
    
    const filteredAngle = normalizeAngle(weightedSum / totalWeight);
    
    // Mise à jour avec lissage exponentiel pour éviter les à-coups
    const alpha = 0.3; // Facteur de lissage (0 = pas de changement, 1 = changement immédiat)
    const currentStable = stableOrientation;
    
    // Gérer le passage par ±π pour le lissage
    let angleDiff = filteredAngle - currentStable;
    if (Math.abs(angleDiff) > Math.PI) {
      if (angleDiff > 0) {
        angleDiff -= 2 * Math.PI;
      } else {
        angleDiff += 2 * Math.PI;
      }
    }
    
    const newStableOrientation = normalizeAngle(currentStable + alpha * angleDiff);
    setStableOrientation(newStableOrientation);
    
    lastOrientationUpdateRef.current = now;
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
        {/* *** NOUVEAU: Bouton d'affichage métriques quand masqué *** */}
        {!isMetricsPanelVisible && (
          <TouchableOpacity 
            style={[styles.controlButton, styles.metricsToggleButton]} 
            onPress={toggleMetricsPanel}
          >
            <Ionicons name="eye" size={24} color="#00ff88" />
          </TouchableOpacity>
        )}
        
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
        
        {/* *** NOUVEAU: Bouton sauvegarder trajet *** */}
        <TouchableOpacity 
          style={[styles.controlButton, (!state.trajectory || state.trajectory.length === 0) && styles.disabledControlButton]} 
          onPress={handleSaveTrajectory}
          disabled={!state.trajectory || state.trajectory.length === 0}
        >
          <Ionicons name="save" size={24} color={(!state.trajectory || state.trajectory.length === 0) ? "#666666" : "#00ff88"} />
        </TouchableOpacity>
        
        {/* *** NOUVEAU: Bouton centrer sur trajectoire *** */}
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={centerOnTrajectory}
          disabled={!state.trajectory || state.trajectory.length === 0}
        >
          <Ionicons name="locate" size={24} color="#00ff88" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut}>
          <Ionicons name="remove" size={24} color="#00ff88" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn}>
          <Ionicons name="add" size={24} color="#00ff88" />
        </TouchableOpacity>
      </View>

      {/* Modal de calibration */}
      <Modal
        visible={calibrationModal.visible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.calibrationModalOverlay}>
          <View style={styles.calibrationModalContent}>
            <View style={styles.calibrationHeader}>
              <Ionicons name="compass" size={32} color="#00ff88" />
              <Text style={styles.calibrationTitle}>Calibration automatique</Text>
            </View>
            
            <Text style={styles.calibrationMessage}>
              {calibrationModal.message}
            </Text>
            
            <Text style={styles.calibrationInstruction}>
              📱 Placez le téléphone en poche et bougez naturellement
            </Text>
            
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${(calibrationModal.progress * 100)}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {(calibrationModal.progress * 100).toFixed(0)}%
              </Text>
            </View>
            
            {calibrationModal.progress < 1 && (
              <ActivityIndicator size="large" color="#00ff88" style={styles.spinner} />
            )}
            
            {calibrationModal.progress >= 1 && (
              <View style={styles.calibrationSuccess}>
                <Ionicons name="checkmark-circle" size={24} color="#00ff88" />
                <Text style={styles.successText}>Calibration terminée !</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* *** NOUVEAU: Modal de sauvegarde de trajet *** */}
      <Modal
        visible={saveTrajectoryModal.visible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.saveModalOverlay}>
          <View style={styles.saveModalContent}>
            <View style={styles.saveModalHeader}>
              <Ionicons name="save" size={32} color="#00ff88" />
              <Text style={styles.saveModalTitle}>Sauvegarder le trajet</Text>
            </View>
            
            <Text style={styles.saveModalSubtitle}>
              Donnez un nom à votre trajet pour le retrouver facilement
            </Text>
            
            <View style={styles.saveInputContainer}>
              <Ionicons name="map" size={20} color="#666666" style={styles.saveInputIcon} />
              <TextInput
                style={styles.saveTextInput}
                placeholder="Nom du trajet"
                placeholderTextColor="#666666"
                value={saveTrajectoryModal.trajectoryName}
                onChangeText={(text) => setSaveTrajectoryModal(prev => ({ ...prev, trajectoryName: text }))}
                autoFocus={true}
                selectTextOnFocus={true}
              />
            </View>

            <View style={styles.trajectoryPreview}>
              <Text style={styles.previewTitle}>Aperçu du trajet :</Text>
              <View style={styles.previewStats}>
                <View style={styles.previewStat}>
                  <Ionicons name="footsteps" size={16} color="#00ff88" />
                  <Text style={styles.previewStatText}>{state.stepCount || 0} pas</Text>
                </View>
                <View style={styles.previewStat}>
                  <Ionicons name="resize" size={16} color="#00ff88" />
                  <Text style={styles.previewStatText}>{(state.distance || 0).toFixed(1)} m</Text>
                </View>
                <View style={styles.previewStat}>
                  <Ionicons name="location" size={16} color="#00ff88" />
                  <Text style={styles.previewStatText}>{state.trajectory?.length || 0} points</Text>
                </View>
              </View>
            </View>
            
            <View style={styles.saveModalActions}>
              <TouchableOpacity
                style={styles.saveModalCancelButton}
                onPress={() => setSaveTrajectoryModal({ visible: false, trajectoryName: '', isLoading: false })}
                disabled={saveTrajectoryModal.isLoading}
              >
                <Text style={styles.saveModalCancelText}>Annuler</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.saveModalSaveButton, saveTrajectoryModal.isLoading && styles.disabledButton]}
                onPress={confirmSaveTrajectory}
                disabled={saveTrajectoryModal.isLoading}
              >
                {saveTrajectoryModal.isLoading ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#000000" />
                    <Text style={styles.saveModalSaveText}>Sauvegarder</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  metricsPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  metricsPanelTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 2,
    borderColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
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
  calibrationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calibrationModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 25,
    margin: 20,
    minWidth: 300,
    borderWidth: 2,
    borderColor: '#00ff88',
    alignItems: 'center',
  },
  calibrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  calibrationTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  calibrationMessage: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
    fontFamily: 'monospace',
  },
  calibrationInstruction: {
    color: '#ffaa00',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00ff88',
    borderRadius: 4,
  },
  progressText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  spinner: {
    marginTop: 10,
  },
  calibrationSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  successText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  metricsToggleButton: {
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 2,
    borderColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledControlButton: {
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 2,
    borderColor: '#666666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 25,
    margin: 20,
    minWidth: 300,
    borderWidth: 2,
    borderColor: '#00ff88',
    alignItems: 'center',
  },
  saveModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  saveModalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  saveModalSubtitle: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
    fontFamily: 'monospace',
  },
  saveInputContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  saveInputIcon: {
    marginRight: 10,
  },
  saveTextInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  trajectoryPreview: {
    width: '100%',
    marginBottom: 20,
  },
  previewTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  previewStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewStatText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  saveModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saveModalCancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
  },
  saveModalCancelText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  saveModalSaveButton: {
    backgroundColor: '#00ff88',
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 12,
    padding: 10,
  },
  disabledButton: {
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 2,
    borderColor: '#666666',
    borderRadius: 12,
    padding: 10,
  },
  saveModalSaveText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
}); 