import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';
import { Magnetometer, Accelerometer, Gyroscope } from 'expo-sensors';

import { useLocalization } from '../context/LocalizationContext';
import { useAuth } from '../context/AuthContext';
import { LocalizationSDK } from '../algorithms/LocalizationSDK';
import { ScaleConverter } from '../utils/ScaleConverter';
import ZoomableView from '../components/ZoomableView';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Dimensions de la carte totale
const MAP_TOTAL_WIDTH = 14629;
const MAP_TOTAL_HEIGHT = 13764;

// Zoom limites
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 20;

export default function MapScreen() {
  const { state, actions } = useLocalization();
  const { state: authState, actions: authActions } = useAuth();
  const [localizationSDK] = useState(() => new LocalizationSDK({
    userHeight: 1.7,
    adaptiveSampling: true,
    energyOptimization: true,
    positionUpdateRate: 1.0,
    continuousOrientation: {
      enabled: true,
      mode: 'native_compass', // Mode natif par défaut
      fallbackToSteps: true
    }
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
  const [zoom, setZoom] = useState(1);
  const [batteryLevel, setBatteryLevel] = useState(1);
  const [batteryState, setBatteryState] = useState('unknown');
  
  // *** NOUVEAU: État pour masquer/afficher le panneau de métriques ***
  const [isMetricsPanelVisible, setIsMetricsPanelVisible] = useState(true);
  
  // *** NOUVEAU: États pour l'orientation continue unifiée ***
  const [continuousOrientation, setContinuousOrientation] = useState(0);
  const [orientationConfidence, setOrientationConfidence] = useState(0);
  const [orientationSource, setOrientationSource] = useState('pdr_gyro');
  const [isOrientationActive, setIsOrientationActive] = useState(true); // Activé par défaut
  const continuousOrientationRef = useRef(0);
  
  // État de la calibration
  const [calibrationModal, setCalibrationModal] = useState({
    visible: false,
    progress: 0,
    message: '',
    step: ''
  });

  // *** NOUVEAU: États pour la sauvegarde de trajet ***
  const [saveTrajectoryModal, setSaveTrajectoryModal] = useState({
    visible: false,
    trajectoryName: '',
    isLoading: false
  });
  
  // Dimensions de l'affichage SVG
  const svgWidth = screenWidth;
  const svgHeight = screenHeight - 200; // Espace pour les contrôles et métriques

  useEffect(() => {
    initializeSystem();
    initializeBattery();
    
    // *** CORRECTION: Utiliser les bonnes fonctions d'orientation continue ***
    // startPermanentOrientation(); // SUPPRIMÉ - fonction inexistante
    
    // *** CORRECTION: Suppression de la mise à jour périodique qui cause la boucle infinie ***
    // Les métriques sont maintenant mises à jour via les callbacks du SDK
    
    return () => {
      if (localizationSDK) {
        localizationSDK.stopTracking();
      }
      // *** CORRECTION: Utiliser la bonne fonction d'arrêt ***
      // stopPermanentOrientation(); // SUPPRIMÉ - fonction inexistante
      if (isOrientationActive) {
        stopContinuousOrientation();
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
      // *** SIMPLIFIÉ: Callback calibration pour capteurs uniquement ***
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
      // *** NOUVEAU: Callback pour dérive de boussole ***
      onCompassDriftDetected: (driftData) => {
        console.log('Dérive boussole détectée:', driftData);
        
        // Afficher notification de recalibration manuelle
        Alert.alert(
          'Recalibration de la boussole',
          driftData.message + '\n\nEffectuez un mouvement en huit avec votre téléphone pour améliorer la précision.',
          [
            { text: 'Plus tard', style: 'cancel' },
            { 
              text: 'Compris', 
              onPress: () => {
                // Réinitialiser l'historique de dérive
                localizationSDK.resetCompassDrift();
              }
            }
          ]
        );
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
   * *** NOUVEAU: Centrer la vue sur la position de l'utilisateur ***
   * SIMPLIFIÉ: Utilise seulement les coordonnées de base sans ScaleConverter
   */
  const centerOnUser = () => {
    console.log(`[VIEW] Centrage sur utilisateur: position=(${state.pose.x.toFixed(2)}, ${state.pose.y.toFixed(2)})`);
    // Note: Le centrage est maintenant géré par ZoomableView
    // Cette fonction sert principalement de feedback visuel
  };

  /**
   * *** ANCIEN: Centrer la vue sur la trajectoire (gardé pour référence) ***
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
      x: (svgWidth / 2) - centerScreen.x,
      y: (svgHeight / 2) - centerScreen.y
    };
    
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
   * SIMPLIFIÉ: Pas de zoom/offset car géré par ZoomableView
   */
  const worldToSVG = (worldPos) => {
    // Conversion simple mètres -> pixels avec échelle de base uniquement
    const pixelX = worldPos.x * scaleConverter.BASE_SCALE;
    const pixelY = -worldPos.y * scaleConverter.BASE_SCALE; // Inversion Y pour SVG
    
    // Centre de l'écran comme origine
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    
    return {
      x: centerX + pixelX,
      y: centerY + pixelY
    };
  };

  /**
   * Rendu de la grille noire
   * SIMPLIFIÉ: Grille fixe sans dépendance au ScaleConverter
   */
  const renderGrid = () => {
    const gridSpacing = 50; // Espacement fixe en pixels
    const lines = [];
    
    // Grille centrée sur l'écran
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    
    // Lignes verticales
    for (let i = -10; i <= 10; i++) {
      const x = centerX + (i * gridSpacing);
      lines.push(
        <Line
          key={`v-${i}`}
          x1={x}
          y1={0}
          x2={x}
          y2={svgHeight}
          stroke="#333333"
          strokeWidth="1"
          opacity="0.3"
        />
      );
    }
    
    // Lignes horizontales
    for (let i = -10; i <= 10; i++) {
      const y = centerY + (i * gridSpacing);
      lines.push(
        <Line
          key={`h-${i}`}
          x1={0}
          y1={y}
          x2={svgWidth}
          y2={y}
          stroke="#333333"
          strokeWidth="1"
          opacity="0.3"
        />
      );
    }
    
    return <G>{lines}</G>;
  };

  /**
   * Rendu de la trajectoire avec trait affiné
   */
  const renderTrajectory = () => {
    if (!state.trajectory || state.trajectory.length < 2) {
      return null;
    }
    
    // *** NOUVEAU: Génération d'un chemin lissé avec courbes de Bézier ***
    const generateSmoothPath = () => {
      const points = state.trajectory.map(point => worldToSVG({ x: point.x, y: point.y }));
      
      if (points.length < 3) {
        // Pas assez de points pour lisser, utiliser une ligne droite
        return points.map((point, index) => 
          `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
        ).join(' ');
      }
      
      let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
      
      // Utiliser des courbes quadratiques pour lisser le chemin
      for (let i = 1; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        
        // Point de contrôle pour la courbe (milieu entre points actuels)
        const controlX = (current.x + next.x) / 2;
        const controlY = (current.y + next.y) / 2;
        
        // Courbe quadratique vers le point de contrôle
        path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${controlX.toFixed(2)} ${controlY.toFixed(2)}`;
      }
      
      // Ligne finale vers le dernier point
      const lastPoint = points[points.length - 1];
      path += ` L ${lastPoint.x.toFixed(2)} ${lastPoint.y.toFixed(2)}`;
      
      return path;
    };

    const smoothPath = generateSmoothPath();
    
    return (
      <G>
        {/* *** NOUVEAU: Définition des filtres SVG pour effets avancés *** */}
        <Defs>
          {/* Gradient pour la trajectoire */}
          <LinearGradient id="trajectoryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#00ff88" stopOpacity="1" />
            <Stop offset="50%" stopColor="#00ff00" stopOpacity="1" />
            <Stop offset="100%" stopColor="#88ff00" stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* *** NOUVEAU: Ombre portée de la trajectoire *** */}
        <Path
          d={smoothPath}
          stroke="#000000"
          strokeWidth="2.5"
          fill="none"
          opacity="0.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(1,1)"
        />
        
        {/* *** NOUVEAU: Ligne de base épaisse pour la profondeur *** */}
        <Path
          d={smoothPath}
          stroke="#004400"
          strokeWidth="3"
          fill="none"
          opacity="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* *** NOUVEAU: Ligne principale affinée avec gradient *** */}
        <Path
          d={smoothPath}
          stroke="url(#trajectoryGradient)"
          strokeWidth="1.5"
          fill="none"
          opacity="1.0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* *** NOUVEAU: Effet de lueur avec ligne plus large *** */}
        <Path
          d={smoothPath}
          stroke="#00ff00"
          strokeWidth="4"
          fill="none"
          opacity="0.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* *** NOUVEAU: Points de trajectoire affinés *** */}
        {state.trajectory.map((point, index) => {
          const svgPos = worldToSVG({ x: point.x, y: point.y });
          const isStartPoint = index === 0;
          const isEndPoint = index === state.trajectory.length - 1;
          
          return (
            <G key={`trajectory-point-${index}`}>
              {/* Ombre du point */}
              <Circle
                cx={svgPos.x + 0.5}
                cy={svgPos.y + 0.5}
                r={isStartPoint || isEndPoint ? "3" : "2"}
                fill="#000000"
                opacity="0.3"
              />
              
              {/* Point principal */}
              <Circle
                cx={svgPos.x}
                cy={svgPos.y}
                r={isStartPoint || isEndPoint ? "3" : "2"}
                fill={isStartPoint ? "#00ff88" : isEndPoint ? "#ff4400" : "#00ff00"}
                stroke="#ffffff"
                strokeWidth="0.5"
                opacity="0.9"
              />
              
              {/* Indicateur spécial pour début et fin */}
              {isStartPoint && (
                <Circle
                  cx={svgPos.x}
                  cy={svgPos.y}
                  r="5"
                  fill="none"
                  stroke="#00ff88"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  opacity="0.7"
                />
              )}
              
              {isEndPoint && (
                <Circle
                  cx={svgPos.x}
                  cy={svgPos.y}
                  r="5"
                  fill="none"
                  stroke="#ff4400"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  opacity="0.7"
                />
              )}
            </G>
          );
        })}
        
        {/* *** NOUVEAU: Flèche directionnelle sur le dernier segment *** */}
        {state.trajectory.length >= 2 && (() => {
          const lastPoint = worldToSVG({ 
            x: state.trajectory[state.trajectory.length - 1].x, 
            y: state.trajectory[state.trajectory.length - 1].y 
          });
          const secondLastPoint = worldToSVG({ 
            x: state.trajectory[state.trajectory.length - 2].x, 
            y: state.trajectory[state.trajectory.length - 2].y 
          });
          
          // Calculer l'angle de direction
          const dx = lastPoint.x - secondLastPoint.x;
          const dy = lastPoint.y - secondLastPoint.y;
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          
          return (
            <G transform={`translate(${lastPoint.x}, ${lastPoint.y}) rotate(${angle})`}>
              <Path
                d="M -8 -3 L 0 0 L -8 3 Z"
                fill="#00ff00"
                stroke="#ffffff"
                strokeWidth="0.5"
                opacity="0.8"
              />
            </G>
          );
        })()}
      </G>
    );
  };

  /**
   * Rendu de la position actuelle avec orientation permanente et taille fixe
   * SIMPLIFIÉ: Taille constante sans calculs de zoom complexes
   */
  const renderCurrentPosition = () => {
    const svgPos = worldToSVG({ x: state.pose.x, y: state.pose.y });
    
    // *** NOUVEAU: Utiliser l'orientation permanente ***
    const currentOrientation = isOrientationActive ? continuousOrientation : 0;
    
    // *** SIMPLIFIÉ: Taille fixe pour éviter les problèmes de zoom ***
    const radius = 8;
    const headingLength = 20;
    const strokeWidth = 2;
    const confidenceRadius = 20;
    
    const headingX = svgPos.x + Math.cos(currentOrientation) * headingLength;
    const headingY = svgPos.y - Math.sin(currentOrientation) * headingLength;
    
    // Couleur selon l'état du tracking
    const positionColor = state.isTracking ? "#00ff00" : "#ffaa00";
    const orientationColor = isOrientationActive ? "#00ff88" : "#666666";
    
    return (
      <G>
        {/* Ligne de direction */}
        <Line
          x1={svgPos.x}
          y1={svgPos.y}
          x2={headingX}
          y2={headingY}
          stroke={orientationColor}
          strokeWidth={strokeWidth}
          opacity={isOrientationActive ? "1.0" : "0.5"}
        />
        
        {/* Position actuelle */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r={radius}
          fill={positionColor}
          stroke="#ffffff"
          strokeWidth={strokeWidth}
          opacity={state.isTracking ? "1.0" : "0.7"}
        />
        
        {/* Niveau de confiance - seulement en tracking */}
        {state.isTracking && (
          <Circle
            cx={svgPos.x}
            cy={svgPos.y}
            r={radius + (1 - state.pose.confidence) * confidenceRadius}
            fill="none"
            stroke="rgba(0, 255, 0, 0.3)"
            strokeWidth={1}
          />
        )}
        
        {/* *** NOUVEAU: Indicateur d'orientation permanente *** */}
        {isOrientationActive && !state.isTracking && (
          <Circle
            cx={svgPos.x}
            cy={svgPos.y}
            r={radius * 2}
            fill="none"
            stroke="#00ff88"
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity="0.8"
          />
        )}
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
            <Text style={styles.metricLabel}>Orientation:</Text>
            <Text style={[styles.metricValue, { color: isOrientationActive ? '#00ff88' : '#666666' }]}>
              {isOrientationActive 
                ? (continuousOrientation * 180 / Math.PI).toFixed(1) + '°'
                : (state.pose.theta * 180 / Math.PI).toFixed(1) + '°'
              }
            </Text>
          </View>
        </View>

        {/* *** NOUVEAU: Affichage confiance et source orientation *** */}
        {isOrientationActive && (
          <>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Confiance:</Text>
              <Text style={[styles.metricValue, { 
                color: orientationConfidence > 0.7 ? '#00ff88' : 
                       orientationConfidence > 0.4 ? '#ffaa00' : '#ff4444' 
              }]}>
                {(orientationConfidence * 100).toFixed(0)}%
              </Text>
            </View>
            
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Source:</Text>
              <Text style={[styles.metricValue, { 
                color: orientationSource === 'native_compass' ? '#00ff88' : '#ffaa00' 
              }]}>
                {orientationSource === 'native_compass' ? 'Boussole' : 
                 orientationSource === 'pdr_fallback' ? 'PDR' : 'Gyro'}
              </Text>
            </View>
          </>
        )}

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
    
    // Filtrage simple pour stabiliser l'orientation
    const alpha = 0.1; // Facteur de lissage
    const currentOrientation = continuousOrientation;
    
    // Gérer le passage par ±π
    let angleDiff = normalizedTheta - currentOrientation;
    if (Math.abs(angleDiff) > Math.PI) {
      if (angleDiff > 0) {
        angleDiff -= 2 * Math.PI;
      } else {
        angleDiff += 2 * Math.PI;
      }
    }
    
    const newOrientation = currentOrientation + alpha * angleDiff;
    
    // Normaliser entre 0 et 2π
    const normalizedOrientation = ((newOrientation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    
    setContinuousOrientation(normalizedOrientation);
  };

  /**
   * *** SIMPLIFIÉ: Recalibration manuelle de la boussole ***
   */
  const handleCompassRecalibration = () => {
    Alert.alert(
      'Recalibrer la boussole',
      'Pour améliorer la précision de l\'orientation :\n\n📱 Effectuez un mouvement en huit avec votre téléphone\n⏱️ Maintenez le mouvement pendant quelques secondes\n\nCeci permet au système de recalibrer automatiquement la boussole.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Compris',
          onPress: () => {
            // Réinitialiser l'historique de dérive pour permettre une nouvelle détection
            const success = localizationSDK.resetCompassDrift();
            if (success) {
              console.log('Historique de dérive réinitialisé - Prêt pour nouvelle calibration');
            }
          }
        }
      ]
    );
  };

  /**
   * *** NOUVEAU: Callback pour le changement de zoom ***
   */
  const handleZoomChange = (newZoom) => {
    setZoom(newZoom);
  };

  /**
   * *** NOUVEAU: Démarrer l'orientation continue via le SDK ***
   */
  const startContinuousOrientation = async () => {
    try {
      // Activer le mode orientation native dans le SDK
      const success = localizationSDK.setOrientationMode('native_compass');
      
      if (success) {
        setIsOrientationActive(true);
        console.log('Orientation native activée via SDK');
        
        // Configurer le callback pour recevoir les mises à jour d'orientation
        localizationSDK.callbacks.onOrientationUpdate = (orientationData) => {
          setContinuousOrientation(orientationData.heading);
          setOrientationConfidence(orientationData.confidence);
          setOrientationSource('native_compass');
        };
        
      } else {
        console.warn('Impossible d\'activer l\'orientation native');
        // Fallback vers mode gyro
        setOrientationSource('pdr_gyro');
      }
      
    } catch (error) {
      console.error('Erreur démarrage orientation native:', error);
      setOrientationSource('pdr_gyro');
    }
  };

  /**
   * *** NOUVEAU: Arrêter l'orientation continue ***
   */
  const stopContinuousOrientation = () => {
    try {
      // Désactiver le mode orientation native dans le SDK
      const success = localizationSDK.setOrientationMode('pdr_gyro');
      
      setIsOrientationActive(false);
      setOrientationConfidence(0);
      setOrientationSource('pdr_gyro');
      
      // Supprimer le callback d'orientation
      if (localizationSDK.callbacks.onOrientationUpdate) {
        delete localizationSDK.callbacks.onOrientationUpdate;
      }
      
      console.log('Orientation native arrêtée');
      
    } catch (error) {
      console.error('Erreur arrêt orientation native:', error);
    }
  };

  /**
   * *** NOUVEAU: Basculer l'orientation continue ***
   */
  const toggleContinuousOrientation = () => {
    if (isOrientationActive) {
      stopContinuousOrientation();
    } else {
      startContinuousOrientation();
    }
  };

  // Effet pour démarrer l'orientation continue automatiquement
  useEffect(() => {
    if (isMapLoaded && state.isTracking) {
      // Démarrer l'orientation continue automatiquement
      startContinuousOrientation();
    }
    
    // Nettoyage à la fermeture
    return () => {
      if (isOrientationActive) {
        stopContinuousOrientation();
      }
    };
  }, [isMapLoaded, state.isTracking, isOrientationActive]);

  // Effet pour gérer les callbacks de calibration du SDK
  useEffect(() => {
    // Configurer les callbacks de calibration
    localizationSDK.callbacks.onCalibrationProgress = (calibrationData) => {
      if (calibrationData.step === 'immediate_calibration_start') {
        setCalibrationModal({
          visible: true,
          progress: calibrationData.progress,
          message: calibrationData.message,
          step: calibrationData.step
        });
      } else if (calibrationData.step === 'immediate_calibration_complete') {
        setCalibrationModal({
          visible: false,
          progress: 1.0,
          message: calibrationData.message,
          step: calibrationData.step
        });
        
        // Afficher un message de succès temporaire
        setTimeout(() => {
          console.log('Calibration immédiate terminée avec succès');
        }, 500);
      }
    };

    // Configurer le callback de changement de posture
    localizationSDK.callbacks.onPostureChange = (postureData) => {
      console.log('Changement de posture détecté:', postureData.reason);
      
      // Optionnel : afficher une notification à l'utilisateur
      if (postureData.action === 'immediate_calibration_triggered') {
        console.log('Calibration automatique déclenchée suite au changement de posture');
      }
    };

    return () => {
      // Nettoyage des callbacks
      delete localizationSDK.callbacks.onCalibrationProgress;
      delete localizationSDK.callbacks.onPostureChange;
    };
  }, []);

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
      {/* Carte SVG avec gestes avancés */}
      <ZoomableView 
        onZoomChange={handleZoomChange}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
      >
        <View style={styles.mapContainer}>
          <Svg width={svgWidth} height={svgHeight} style={styles.svg}>
            <G>
              {/* Fond noir */}
              <Path
                d={`M ${-svgWidth} ${-svgHeight} L ${svgWidth * 2} ${-svgHeight} L ${svgWidth * 2} ${svgHeight * 2} L ${-svgWidth} ${svgHeight * 2} Z`}
                fill="#000000"
              />
              
              {/* Grille */}
              {renderGrid()}
              
              {/* Trajectoire */}
              {renderTrajectory()}
              
              {/* Position actuelle */}
              {renderCurrentPosition()}
            </G>
          </Svg>
        </View>
      </ZoomableView>

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
        
        <TouchableOpacity style={styles.controlButton} onPress={centerOnUser}>
          <Ionicons name="locate" size={24} color="#00ff88" />
        </TouchableOpacity>
        
        {/* *** NOUVEAU: Bouton sauvegarder trajet *** */}
        <TouchableOpacity 
          style={[styles.controlButton, (!state.trajectory || state.trajectory.length === 0) && styles.disabledControlButton]} 
          onPress={handleSaveTrajectory}
          disabled={!state.trajectory || state.trajectory.length === 0}
        >
          <Ionicons name="save" size={24} color={(!state.trajectory || state.trajectory.length === 0) ? "#666666" : "#00ff88"} />
        </TouchableOpacity>
        
        {/* *** NOUVEAU: Bouton recalibrer la boussole *** */}
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={handleCompassRecalibration}
        >
          <Ionicons name="compass" size={24} color="#00ff88" />
        </TouchableOpacity>

        {/* *** NOUVEAU: Bouton orientation native *** */}
        <TouchableOpacity 
          style={[styles.controlButton, isOrientationActive && styles.activeButton]} 
          onPress={toggleContinuousOrientation}
        >
          <Ionicons 
            name={isOrientationActive ? "compass" : "compass-outline"} 
            size={24} 
            color={isOrientationActive ? "#ffffff" : "#00ff88"} 
          />
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