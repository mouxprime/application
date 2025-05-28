import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import * as Location from 'expo-location';

import { useLocalization } from '../context/LocalizationContext';
import { useAuth } from '../context/AuthContext';
import { LocalizationSDK } from '../algorithms/LocalizationSDK';
import { ScaleConverter } from '../utils/ScaleConverter';
import ZoomableView from '../components/ZoomableView';
import NativeEnhancedMotionService from '../services/NativeEnhancedMotionService';

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
  
  // *** FIX: Utiliser des refs pour éviter les problèmes de closure ***
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  
  // Mettre à jour les refs quand state/actions changent
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
  }, [state, actions]);
  
  // *** NOUVEAU: États pour l'orientation continue unifiée ***
  const [continuousOrientation, setContinuousOrientation] = useState(0);
  const [orientationConfidence, setOrientationConfidence] = useState(0);
  const [orientationSource, setOrientationSource] = useState('pdr_gyro');
  const [isOrientationActive, setIsOrientationActive] = useState(true); // Activé par défaut
  const continuousOrientationRef = useRef(0);
  
  // *** NOUVEAU: États pour la boussole native indépendante ***
  const [nativeCompassSubscription, setNativeCompassSubscription] = useState(null);
  const [isNativeCompassActive, setIsNativeCompassActive] = useState(false);
  
  // *** FIX: CALLBACKS DÉFINIS AVANT L'INITIALISATION DU SERVICE ***
  const handleStepDetected = useCallback(({ stepCount, stepLength, dx, dy, timestamp, totalSteps, confidence, source, nativeStepLength, averageStepLength, cadence, timeDelta, isFallback }) => {
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === DÉBUT ANALYSE CONFIANCE ===`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] Confiance reçue du service: ${confidence} (${(confidence * 100).toFixed(1)}%)`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] nativeStepLength: ${nativeStepLength}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] source: ${source}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] isFallback: ${isFallback}`);
    
    console.log(`📏 [STEP-CALLBACK] Longueur de pas: ${stepLength.toFixed(3)}m ${nativeStepLength ? '(NATIVE)' : '(FALLBACK)'}`);
    console.log(`📍 [STEP-CALLBACK] Déplacement: dx=${dx.toFixed(3)}, dy=${dy.toFixed(3)}`);
    
    // *** FIX: Utiliser les refs pour accéder aux valeurs actuelles ***
    const currentState = stateRef.current;
    const currentActions = actionsRef.current;
    
    console.log(`📊 [STEP-CALLBACK] État actuel: position=(${currentState.pose.x.toFixed(2)}, ${currentState.pose.y.toFixed(2)}), pas=${currentState.stepCount || 0}`);
    
    // *** CONFIANCE ÉLEVÉE POUR LES DONNÉES NATIVES ***
    const adjustedConfidence = nativeStepLength ? 1.0 : confidence;
    
    console.log(`🔧 [STEP-CALLBACK-DEBUG] adjustedConfidence calculée: ${adjustedConfidence} (${(adjustedConfidence * 100).toFixed(1)}%)`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === FIN ANALYSE CONFIANCE ===`);
    
    // Mettre à jour la position
    const newX = currentState.pose.x + dx;
    const newY = currentState.pose.y + dy;
    
    // *** FIX: Utiliser l'orientation actuelle correcte ***
    const currentTheta = isOrientationActive ? continuousOrientation : currentState.pose.theta;
    
    console.log(`📍 [STEP-CALLBACK] Nouvelle position: (${newX.toFixed(2)}, ${newY.toFixed(2)}), orientation: ${(currentTheta * 180 / Math.PI).toFixed(1)}°`);
    
    currentActions.updatePose({
      x: newX,
      y: newY,
      theta: currentTheta,
      confidence: adjustedConfidence
    });
    
    // Ajouter le point à la trajectoire
    currentActions.addTrajectoryPoint({
      x: newX,
      y: newY,
      timestamp,
      confidence: adjustedConfidence
    });
    
    // *** FIX: Calculer la distance totale correctement ***
    const totalDistance = (currentState.distance || 0) + stepLength;
    
    // *** FIX: Mettre à jour les métriques PDR avec le bon stepCount ***
    currentActions.updatePDRMetrics({
      stepCount,
      distance: totalDistance,
      currentMode: nativeStepLength ? 'NATIF' : 'FALLBACK',
      energyLevel: 1.0,
      isZUPT: false
    });
    
    console.log(`📊 [STEP-CALLBACK] Métriques mises à jour: ${stepCount} pas, distance: ${totalDistance.toFixed(2)}m, confiance: ${(adjustedConfidence * 100).toFixed(0)}%`);
    console.log(`🎯 [STEP-CALLBACK] Trajectoire: ${(currentState.trajectory?.length || 0) + 1} points`);
  }, [isOrientationActive, continuousOrientation]);

  const handleHeading = useCallback(({ yaw, accuracy, timestamp, source, filteredHeading, rawHeading }) => {
    console.log(`🧭 [HEADING-CALLBACK] Orientation reçue: ${(yaw * 180 / Math.PI).toFixed(1)}° (précision: ${accuracy})`);
    
    // *** FIX: Utiliser les refs pour accéder aux valeurs actuelles ***
    const currentState = stateRef.current;
    const currentActions = actionsRef.current;
    
    // *** FIX: Mettre à jour les états locaux d'orientation AVANT de les utiliser ***
    setContinuousOrientation(yaw); // yaw est déjà en radians
    continuousOrientationRef.current = yaw; // Mettre à jour la ref aussi
    setOrientationConfidence(accuracy ? Math.max(0, Math.min(1, (100 - accuracy) / 100)) : 0.8);
    setOrientationSource('native_compass');
    setIsOrientationActive(true); // S'assurer que l'orientation est active
    
    currentActions.updatePose({
      x: currentState.pose.x,
      y: currentState.pose.y,
      theta: yaw, // Garder en radians pour les calculs
      confidence: currentState.pose.confidence
    });
    
    console.log(`🧭 [HEADING-CALLBACK] Orientation mise à jour: ${(yaw * 180 / Math.PI).toFixed(1)}° (précision: ${accuracy})`);
  }, []);
  
  const [hybridMotionService] = useState(() => new NativeEnhancedMotionService(
    handleStepDetected,
    handleHeading
  ));
  
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
    
    // *** NOUVEAU: Démarrer la boussole native indépendante ***
    startNativeCompass();
    
    return () => {
      if (hybridMotionService) {
        hybridMotionService.stop();
      }
      // *** NOUVEAU: Arrêter la boussole native au démontage ***
      stopNativeCompass();
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
    const configureMotionService = async () => {
      try {
        console.log('⚙️ Configuration NativeEnhancedMotionService...');
        
        // ✅ SIMPLIFIÉ: Plus de configuration nécessaire !
        // Le module natif calcule automatiquement la longueur de pas
        
        console.log('✅ NativeEnhancedMotionService configuré (aucune config requise)');
      } catch (error) {
        console.error('❌ Erreur configuration NativeEnhancedMotionService:', error);
      }
    };
    
    configureMotionService();
  }, []);

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
      console.log('Initialisation du système de localisation...');
      
      // *** MODIFICATION: Pas d'initialisation spéciale pour HybridMotionService ***
      // Il s'initialise automatiquement lors du start()
      
      // Position initiale par défaut à (0, 0)
      const initialPose = { x: 0, y: 0, theta: 0 };
      
      actions.resetPose(initialPose);
      actions.resetTrajectory();
      
      setIsMapLoaded(true);
      
      console.log('✅ Système initialisé avec succès');
    } catch (error) {
      console.error('❌ Erreur initialisation système:', error);
      Alert.alert('Erreur', 'Impossible d\'initialiser le système de localisation');
    }
  };

  /**
   * Démarrage/arrêt du tracking
   */
  const toggleTracking = async () => {
    if (state.isTracking) {
      actions.setTracking(false);
      hybridMotionService.stop();
      // *** MODIFICATION: Garder l'orientation active même hors tracking ***
      console.log('🧭 [ORIENTATION] Orientation maintenue active hors tracking');
    } else {
      actions.setTracking(true);
      
      await startMotionTracking();
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
    if (!state.trajectory || state.trajectory.length < 1) {
      console.log('🔍 [TRAJECTORY] Aucune trajectoire à afficher:', state.trajectory?.length || 0, 'points');
      return null;
    }
    
    console.log(`🔍 [TRAJECTORY] Rendu de ${state.trajectory.length} points`);
    
    // *** FIX: Chemin simple et visible ***
    const generateSimplePath = () => {
      const points = state.trajectory.map(point => worldToSVG({ x: point.x, y: point.y }));
      
      if (points.length === 1) {
        // Un seul point - afficher un cercle
        const point = points[0];
        return `M ${point.x} ${point.y} L ${point.x + 1} ${point.y}`;
      }
      
      // Chemin simple ligne par ligne
      return points.map((point, index) => 
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      ).join(' ');
    };

    const simplePath = generateSimplePath();
    
    return (
      <G>
        {/* *** FIX: Définition des gradients simplifiée *** */}
        <Defs>
          <LinearGradient id="trajectoryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#00ff88" stopOpacity="1" />
            <Stop offset="100%" stopColor="#88ff00" stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* *** FIX: Ligne principale visible *** */}
        <Path
          d={simplePath}
          stroke="#00ff00"
          strokeWidth="3"
          fill="none"
          opacity="1.0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* *** FIX: Points de trajectoire visibles *** */}
        {state.trajectory.map((point, index) => {
          const svgPos = worldToSVG({ x: point.x, y: point.y });
          const isStartPoint = index === 0;
          const isEndPoint = index === state.trajectory.length - 1;
          
          return (
            <G key={`trajectory-point-${index}`}>
              {/* Point principal */}
              <Circle
                cx={svgPos.x}
                cy={svgPos.y}
                r={isStartPoint || isEndPoint ? "4" : "3"}
                fill={isStartPoint ? "#00ff88" : isEndPoint ? "#ff4400" : "#00ff00"}
                stroke="#ffffff"
                strokeWidth="1"
                opacity="1.0"
              />
              
              {/* Indicateur spécial pour début */}
              {isStartPoint && (
                <Circle
                  cx={svgPos.x}
                  cy={svgPos.y}
                  r="8"
                  fill="none"
                  stroke="#00ff88"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  opacity="0.8"
                />
              )}
              
              {/* Indicateur spécial pour fin */}
              {isEndPoint && (
                <Circle
                  cx={svgPos.x}
                  cy={svgPos.y}
                  r="8"
                  fill="none"
                  stroke="#ff4400"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  opacity="0.8"
                />
              )}
            </G>
          );
        })}
      </G>
    );
  };

  /**
   * Rendu de la position actuelle avec orientation permanente et taille fixe
   * SIMPLIFIÉ: Taille constante sans calculs de zoom complexes
   * *** FIX: 0° = Nord (haut), angles 0-360° ***
   */
  const renderCurrentPosition = () => {
    const svgPos = worldToSVG({ x: state.pose.x, y: state.pose.y });
    
    // *** FIX: Utiliser l'orientation correcte avec fallback ***
    let currentOrientation = 0;
    if (isOrientationActive && continuousOrientation !== null) {
      currentOrientation = continuousOrientation;
    } else if (state.pose.theta !== undefined) {
      currentOrientation = state.pose.theta;
    }
    
    // *** FIX: Normaliser l'angle entre 0 et 2π (0-360°) ***
    let normalizedOrientation = currentOrientation;
    while (normalizedOrientation < 0) normalizedOrientation += 2 * Math.PI;
    while (normalizedOrientation >= 2 * Math.PI) normalizedOrientation -= 2 * Math.PI;
    
    // *** FIX: 0° = Nord (axe Y positif vers le haut) ***
    // En SVG, Y positif va vers le bas, donc on inverse
    // La boussole donne 0° = Nord, on garde cette convention
    // Mais on ajuste pour l'affichage SVG où Y+ = bas
    
    // *** SIMPLIFIÉ: Taille fixe pour éviter les problèmes de zoom ***
    const radius = 6; // Augmenté pour meilleure visibilité
    const headingLength = 25; // Augmenté pour meilleure visibilité
    const strokeWidth = 2;
    const confidenceRadius = 15;
    
    // *** FIX: Calcul correct pour 0° = Nord (haut) ***
    // En SVG: 0° = droite, 90° = bas, 180° = gauche, 270° = haut
    // On veut: 0° = haut (nord), 90° = droite (est), 180° = bas (sud), 270° = gauche (ouest)
    // Donc on soustrait 90° pour décaler et on inverse Y
    const svgOrientation = normalizedOrientation - Math.PI / 2;
    
    const headingX = svgPos.x + Math.cos(svgOrientation) * headingLength;
    const headingY = svgPos.y + Math.sin(svgOrientation) * headingLength; // Pas d'inversion Y ici car déjà géré
    
    // Couleur selon l'état du tracking
    const positionColor = state.isTracking ? "#00ff00" : "#ffaa00";
    const orientationColor = "#ff0088"; // Couleur vive pour l'orientation
    
    return (
      <G>
        {/* *** FIX: Ligne de direction TOUJOURS visible *** */}
        <Line
          x1={svgPos.x}
          y1={svgPos.y}
          x2={headingX}
          y2={headingY}
          stroke={orientationColor}
          strokeWidth={strokeWidth}
          opacity="1.0"
        />
        
        {/* *** FIX: Flèche directionnelle pour meilleure visibilité *** */}
        <G transform={`translate(${headingX}, ${headingY}) rotate(${svgOrientation * 180 / Math.PI + 90})`}>
          <Path
            d="M -4 -8 L 0 0 L 4 -8 Z"
            fill={orientationColor}
            stroke="#ffffff"
            strokeWidth="1"
            opacity="1.0"
          />
        </G>
        
        {/* Position actuelle */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r={radius}
          fill={positionColor}
          stroke="#ffffff"
          strokeWidth={strokeWidth}
          opacity="1.0"
        />
        
        {/* *** FIX: Point central pour meilleure visibilité *** */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r={2}
          fill="#ffffff"
          opacity="1.0"
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
        
        {/* *** FIX: Indicateur d'orientation active *** */}
        {isOrientationActive && (
          <Circle
            cx={svgPos.x}
            cy={svgPos.y}
            r={radius + 5}
            fill="none"
            stroke="#ff0088"
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
              {(() => {
                let angle = 0;
                if (isOrientationActive) {
                  angle = continuousOrientation * 180 / Math.PI;
                } else {
                  angle = state.pose.theta * 180 / Math.PI;
                }
                
                // Normaliser entre 0 et 360°
                while (angle < 0) angle += 360;
                while (angle >= 360) angle -= 360;
                
                return angle.toFixed(1) + '°';
              })()}
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
            
            {/* *** NOUVEAU: Statut boussole native *** */}
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Boussole Native:</Text>
              <Text style={[styles.metricValue, { 
                color: isNativeCompassActive ? '#00ff88' : '#ff4444' 
              }]}>
                {isNativeCompassActive ? 'Active' : 'Inactive'}
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
   * *** NOUVEAU: Callback pour le changement de zoom ***
   */
  const handleZoomChange = (newZoom) => {
    setZoom(newZoom);
  };

  /**
   * *** NOUVEAU: Démarrer l'orientation continue via la boussole native ***
   */
  const startContinuousOrientation = async () => {
    console.log('🧭 [ORIENTATION] Démarrage orientation via boussole native indépendante');
    setIsOrientationActive(true);
    
    // Démarrer la boussole native si pas déjà active
    if (!isNativeCompassActive) {
      await startNativeCompass();
    }
  };

  /**
   * *** SUPPRIMÉ: Arrêter l'orientation continue - plus nécessaire ***
   */
  const stopContinuousOrientation = () => {
    // *** MODIFICATION: Ne plus arrêter l'orientation ***
    console.log('🧭 [ORIENTATION] Orientation maintenue active en permanence');
  };

  /**
   * *** SUPPRIMÉ: Basculer l'orientation continue - plus nécessaire ***
   */
  const toggleContinuousOrientation = () => {
    // *** MODIFICATION: Orientation toujours active ***
    console.log('🧭 [ORIENTATION] Orientation toujours active - basculement désactivé');
  };

  // *** FIX: Effet pour démarrer l'orientation continue automatiquement ***
  useEffect(() => {
    if (isMapLoaded) {
      console.log('🧭 [ORIENTATION] Démarrage automatique de l\'orientation...');
      setIsOrientationActive(true);
      // *** MODIFICATION: Utiliser la boussole native indépendante ***
      if (!isNativeCompassActive) {
        startNativeCompass();
      }
    }
  }, [isMapLoaded, isNativeCompassActive]);

  const startMotionTracking = async () => {
    try {
      console.log('🚀 [MOTION-TRACKING] ========================================');
      console.log('🚀 [MOTION-TRACKING] Démarrage suivi mouvement...');
      console.log('🚀 [MOTION-TRACKING] ========================================');
      
      // *** FIX: Vérifier que le service existe ***
      if (!hybridMotionService) {
        throw new Error('Service NativeEnhancedMotionService non initialisé');
      }
      
      console.log('✅ [MOTION-TRACKING] Service trouvé, démarrage...');
      
      await hybridMotionService.start();
      
      console.log('✅ [MOTION-TRACKING] Service démarré avec succès');
      console.log('🚀 [MOTION-TRACKING] ========================================');
      
      // *** FIX: Vérifier les stats du service ***
      setTimeout(() => {
        const stats = hybridMotionService.getStats();
        console.log('📊 [MOTION-TRACKING] Stats du service:', stats);
      }, 2000);
      
    } catch (error) {
      console.error('❌ [MOTION-TRACKING] Erreur démarrage suivi mouvement:', error);
      Alert.alert('Erreur', 'Impossible de démarrer le suivi de mouvement: ' + error.message);
    }
  };

  const stopMotionTracking = async () => {
    try {
      hybridMotionService.stop();
      
      // ✅ SIMPLIFIÉ: Plus de configuration à refaire
      
      await hybridMotionService.start();
      
      console.log('🔄 Suivi mouvement redémarré');
    } catch (error) {
      console.error('❌ Erreur redémarrage suivi mouvement:', error);
    }
  };

  /**
   * *** NOUVEAU: Démarrer la boussole native indépendante ***
   */
  const startNativeCompass = async () => {
    try {
      //console.log('🧭 [NATIVE-COMPASS] Démarrage de la boussole native indépendante...');
      
      // Demander les permissions de localisation
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('🧭 [NATIVE-COMPASS] Permission localisation refusée');
        return false;
      }
      
      // Arrêter l'ancienne subscription si elle existe
      if (nativeCompassSubscription) {
        nativeCompassSubscription.remove();
      }
      
      // Démarrer le suivi de l'orientation
      const subscription = await Location.watchHeadingAsync(
        (headingData) => {
          handleNativeCompassUpdate(headingData);
        },
        {
          accuracy: Location.LocationAccuracy.High,
          timeInterval: 100,  // Mise à jour toutes les 100ms
          distanceInterval: 0
        }
      );
      
      setNativeCompassSubscription(subscription);
      setIsNativeCompassActive(true);
      
      //console.log('✅ [NATIVE-COMPASS] Boussole native démarrée avec succès');
      return true;
      
    } catch (error) {
      console.error('❌ [NATIVE-COMPASS] Erreur démarrage boussole native:', error);
      return false;
    }
  };

  /**
   * *** NOUVEAU: Arrêter la boussole native indépendante ***
   */
  const stopNativeCompass = () => {
    try {
      if (nativeCompassSubscription) {
        nativeCompassSubscription.remove();
        setNativeCompassSubscription(null);
      }
      
      setIsNativeCompassActive(false);
      console.log('🛑 [NATIVE-COMPASS] Boussole native arrêtée');
      
    } catch (error) {
      console.error('❌ [NATIVE-COMPASS] Erreur arrêt boussole native:', error);
    }
  };

  /**
   * *** NOUVEAU: Gérer les mises à jour de la boussole native ***
   */
  const handleNativeCompassUpdate = (headingData) => {
    const { trueHeading, accuracy, timestamp } = headingData;
    
    console.log(`🧭 [NATIVE-COMPASS] Orientation reçue: ${trueHeading.toFixed(1)}° (précision: ${accuracy})`);
    
    // Normaliser l'angle
    let normalizedHeading = trueHeading;
    while (normalizedHeading >= 360) normalizedHeading -= 360;
    while (normalizedHeading < 0) normalizedHeading += 360;
    
    // Convertir en radians
    const headingRadians = (normalizedHeading * Math.PI) / 180;
    
    // Mettre à jour les états d'orientation
    setContinuousOrientation(headingRadians);
    continuousOrientationRef.current = headingRadians;
    setOrientationConfidence(accuracy ? Math.max(0, Math.min(1, (100 - accuracy) / 100)) : 0.8);
    setOrientationSource('native_compass');
    setIsOrientationActive(true);
    
    // Mettre à jour la pose dans le contexte
    const currentState = stateRef.current;
    const currentActions = actionsRef.current;
    
    currentActions.updatePose({
      x: currentState.pose.x,
      y: currentState.pose.y,
      theta: headingRadians,
      confidence: currentState.pose.confidence
    });
    
    console.log(`🧭 [NATIVE-COMPASS] Orientation mise à jour: ${normalizedHeading.toFixed(1)}° (${headingRadians.toFixed(3)} rad)`);
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

        {/* *** SUPPRIMÉ: Boutons de boussole inutiles *** */}
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