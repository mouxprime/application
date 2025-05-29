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
  Keyboard,
  TouchableWithoutFeedback,
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
import { PersistentMapService } from '../services/PersistentMapService';
import TiledMapView from '../components/TiledMapView';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// *** NOUVEAU: Système de carte persistante avec tuiles ***
// Dimensions de la carte totale (pour la carte persistante)
const MAP_TOTAL_WIDTH = 14629;
const MAP_TOTAL_HEIGHT = 13764;

// *** SPÉCIFICATIONS D'ÉCHELLE ***
// Échelle exacte : 3.72 pixels = 1 mètre
// Grille totale : 14629px × 13764px
// Soit environ : 3932m × 3700m en coordonnées monde
// Espacement grille : 10m = 37.2px

// Zoom limites
const MIN_ZOOM = 0.05; // Zoom out pour voir toute la carte
const MAX_ZOOM = 10;   // Zoom in pour les détails

export default function MapScreen() {
  const { state, actions } = useLocalization();
  const { state: authState, actions: authActions } = useAuth();
  
  // *** FIX: Utiliser des refs pour éviter les problèmes de closure ***
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  
  // *** NOUVEAU: Ref pour le champ Y du modal ***
  const yInputRef = useRef(null);
  
  // Mettre à jour les refs quand state/actions changent
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
  }, [state, actions]);
  
  // *** NOUVEAU: Service de carte persistante ***
  const [persistentMapService] = useState(() => new PersistentMapService());
  const [persistentMapSVG, setPersistentMapSVG] = useState('');
  const [mapStats, setMapStats] = useState(null);
  
  // *** NOUVEAU: États pour l'orientation continue unifiée ***
  const [continuousOrientation, setContinuousOrientation] = useState(0);
  const [orientationConfidence, setOrientationConfidence] = useState(0);
  const [orientationSource, setOrientationSource] = useState('pdr_gyro');
  const [isOrientationActive, setIsOrientationActive] = useState(true); // Activé par défaut
  const continuousOrientationRef = useRef(0);
  
  // *** NOUVEAU: États pour la boussole native indépendante ***
  const [nativeCompassSubscription, setNativeCompassSubscription] = useState(null);
  const [isNativeCompassActive, setIsNativeCompassActive] = useState(false);
  
  // *** NOUVEAU: États pour la carte avec tuiles ***
  const [viewportInfo, setViewportInfo] = useState({
    zoom: 0.1,
    panX: 0,
    panY: 0,
    visibleTiles: 0
  });
  const [mapControls, setMapControls] = useState({
    centerOnUser: null,
    viewFullMap: null,
    centerOnPoint: null,
    setCustomZoom: null,
    pointsOfInterest: []
  });

  // *** NOUVEAU: Modal de sélection du point de départ ***
  const [startingPointModal, setStartingPointModal] = useState({
    visible: false, // Plus visible au démarrage
    selectedPoint: null,
    customX: '',
    customY: '',
    isLoading: false
  });
  
  // *** NOUVEAU: Point par défaut "Entrée Fifi" ***
  const getDefaultStartingPoint = () => {
    return {
      id: 'entree_fifi',
      name: 'Entrée Fifi',
      x: 12364,
      y: 2612,
      worldX: (12364 - MAP_TOTAL_WIDTH / 2) / 3.72,
      worldY: -(2612 - MAP_TOTAL_HEIGHT / 2) / 3.72,
      color: '#ff6b35',
      description: 'Point d\'entrée principal'
    };
  };
  
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
    
    // *** NOUVEAU: Distinction claire des sources pour la confiance ***
    const isNative = source === 'ios_cmpedometer';
    const stepConfidenceToUse = isNative ? 1.0 : confidence;
    
    console.log(`🔧 [STEP-CALLBACK-DEBUG] isNative: ${isNative}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] stepConfidenceToUse: ${stepConfidenceToUse} (${(stepConfidenceToUse * 100).toFixed(1)}%)`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === FIN ANALYSE CONFIANCE ===`);
    
    // Calculer la nouvelle position
    const newX = currentState.pose.x + dx;
    const newY = currentState.pose.y + dy;
    
    // *** FIX: ORDRE CORRIGÉ - Ajouter le point à la trajectoire AVANT de mettre à jour la pose ***
    // 1) D'abord ajouter le nouveau point à la trajectoire
    currentActions.addTrajectoryPoint({
      x: newX,
      y: newY,
      timestamp,
      confidence: stepConfidenceToUse
    });
    
    // 2) Ensuite mettre à jour la pose (qui déclenchera le re-rendu avec la trajectoire déjà mise à jour)
    currentActions.updatePose({
      x: newX,
      y: newY,
      // *** NE PAS METTRE À JOUR THETA *** - l'orientation est gérée séparément par la boussole
      confidence: stepConfidenceToUse
    });
    
    console.log(`📍 [STEP-CALLBACK] Nouvelle position: (${newX.toFixed(2)}, ${newY.toFixed(2)}), orientation CONSERVÉE`);
    
    // *** FIX: Calculer la distance totale correctement ***
    const totalDistance = (currentState.distance || 0) + Math.hypot(dx, dy);
    
    // *** FIX: Mettre à jour les métriques PDR avec le bon stepCount ***
    currentActions.updatePDRMetrics({
      stepCount,
      distance: totalDistance,
      currentMode: isNative ? 'NATIF' : 'FALLBACK',
      energyLevel: 1.0,
      isZUPT: false
    });
    
    console.log(`📊 [STEP-CALLBACK] Métriques mises à jour: ${stepCount} pas, distance: ${totalDistance.toFixed(2)}m, confiance: ${(stepConfidenceToUse * 100).toFixed(0)}%`);
    console.log(`🎯 [STEP-CALLBACK] Trajectoire: ${(currentState.trajectory?.length || 0) + 1} points`);
  }, []);

  const handleHeading = useCallback(({ yaw, accuracy, timestamp, source, filteredHeading, rawHeading }) => {
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
  }, []);
  
  const [hybridMotionService] = useState(() => new NativeEnhancedMotionService(
    handleStepDetected,
    handleHeading
  ));
  
  // Convertisseur d'échelle avec l'échelle de référence CORRIGÉE
  const [scaleConverter] = useState(() => new ScaleConverter({
    referenceMaters: 100,     // 100 mètres
    referencePixels: 372,     // = 372 pixels (échelle correcte)
    screenWidth: screenWidth,
    screenHeight: screenHeight - 200
  }));
  
  // État de la carte
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
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
  
  // *** CORRECTION: Dimensions SVG adaptées à l'écran avec zoom intelligent ***
  // Dimensions de l'affichage SVG - RETOUR À LA TAILLE ÉCRAN
  const svgWidth = screenWidth;
  const svgHeight = screenHeight - 200; // Espace pour les contrôles et métriques

  // *** NOUVEAU: Calculer le zoom initial pour afficher 530x1000 pixels ***
  const calculateInitialZoom = () => {
    const targetViewportWidth = 530;  // pixels sur la carte
    const targetViewportHeight = 1000; // pixels sur la carte
    
    // Zoom nécessaire pour afficher cette zone
    const zoomX = screenWidth / targetViewportWidth;
    const zoomY = (screenHeight - 200) / targetViewportHeight;
    const initialZoom = Math.min(zoomX, zoomY);
    
    console.log(`🎯 [MAP-SCREEN] Zoom initial calculé pour ${targetViewportWidth}x${targetViewportHeight}px: ${initialZoom.toFixed(3)}x`);
    return initialZoom;
  };

  const [initialZoom] = useState(() => calculateInitialZoom());
  const [defaultPoint] = useState(() => getDefaultStartingPoint());

  useEffect(() => {
    initializeSystem();
    initializeBattery();
    
    // *** NOUVEAU: Initialiser la carte persistante ***
    initializePersistentMap();
    
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
      
      // *** NOUVEAU: Position initiale par défaut à "Entrée Fifi" ***
      const defaultPoint = getDefaultStartingPoint();
      const initialPose = { 
        x: defaultPoint.worldX, 
        y: defaultPoint.worldY, 
        theta: 0,
        confidence: 0.8
      };
      
      actions.resetPose(initialPose);
      actions.resetTrajectory();
      
      setIsMapLoaded(true);
      
      console.log(`✅ Système initialisé avec succès - Position par défaut: ${defaultPoint.name} (${defaultPoint.worldX.toFixed(2)}, ${defaultPoint.worldY.toFixed(2)})`);
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
      // *** NOUVEAU: Afficher le modal de sélection du point de départ avant de démarrer ***
      // Pré-sélectionner "Entrée Fifi" par défaut
      const defaultPoint = getDefaultStartingPoint();
      setStartingPointModal(prev => ({ 
        ...prev, 
        visible: true,
        selectedPoint: defaultPoint,
        customX: '',
        customY: ''
      }));
    }
  };

  /**
   * *** NOUVEAU: Centrer la vue sur la position de l'utilisateur ***
   * *** MODIFIÉ: Utilise le nouveau système de centrage intelligent ***
   */
  const centerOnUser = useCallback(() => {
    if (mapControls.centerOnUser) {
      mapControls.centerOnUser();
    }
  }, [mapControls.centerOnUser]);

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
   * *** NOUVEAU: Sauvegarder le trajet actuel dans la carte persistante ***
   */
  const saveTrajectoryToPersistentMap = async () => {
    try {
      if (!state.trajectory || state.trajectory.length === 0) {
        console.warn('⚠️ [MAP-SCREEN] Aucun trajet à sauvegarder');
        return;
      }
      
      console.log(`🗺️ [MAP-SCREEN] Sauvegarde du trajet actuel (${state.trajectory.length} points)`);
      
      const metadata = {
        stepCount: state.stepCount || 0,
        distance: state.distance || 0,
        startTime: state.trajectory[0]?.timestamp,
        endTime: state.trajectory[state.trajectory.length - 1]?.timestamp
      };
      
      const trajectoryId = await persistentMapService.addTrajectory(state.trajectory, metadata);
      
      // Recharger la carte persistante
      const svgContent = await persistentMapService.getSVGContent();
      setPersistentMapSVG(svgContent);
      
      // Mettre à jour les statistiques
      const stats = persistentMapService.getMapStats();
      setMapStats(stats);
      
      console.log(`✅ [MAP-SCREEN] Trajet ${trajectoryId} sauvegardé dans la carte persistante`);
      
      return trajectoryId;
      
    } catch (error) {
      console.error('❌ [MAP-SCREEN] Erreur sauvegarde trajet persistant:', error);
      throw error;
    }
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
   * *** NOUVEAU: Sauvegarder le trajet actuel ***
   */
  const handleSaveTrajectory = async () => {
    try {
      // Sauvegarder dans la carte persistante
      const trajectoryId = await saveTrajectoryToPersistentMap();
      
      if (trajectoryId) {
        Alert.alert(
          'Succès', 
          `Trajet sauvegardé dans la carte persistante !\n\nID: ${trajectoryId.substring(0, 12)}...`,
          [
            { text: 'OK' },
            { 
              text: 'Voir stats', 
              onPress: () => showMapStats() 
            }
          ]
        );
        
        // Optionnel : Réinitialiser le trajet actuel
        actions.resetTrajectory();
      }
      
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder le trajet: ' + error.message);
    }
  };

  /**
   * *** NOUVEAU: Afficher les statistiques de la carte ***
   */
  const showMapStats = () => {
    if (!mapStats) {
      Alert.alert('Info', 'Aucune statistique disponible');
      return;
    }
    
    const message = `Carte persistante :
    
📊 Trajets enregistrés : ${mapStats.trajectoryCount}
📏 Distance totale : ${mapStats.totalDistance.toFixed(1)} m
🗺️ Dimensions : ${mapStats.mapDimensions.worldWidth.toFixed(0)}m × ${mapStats.mapDimensions.worldHeight.toFixed(0)}m
📅 Dernière mise à jour : ${mapStats.lastUpdate ? new Date(mapStats.lastUpdate).toLocaleString() : 'Jamais'}`;
    
    Alert.alert('Statistiques de la carte', message);
  };

  /**
   * Conversion des coordonnées monde vers l'écran SVG avec zoom intelligent
   * *** NOUVEAU: Système de zoom et centrage intelligent ***
   */
  const worldToSVG = (worldPos) => {
    // *** CORRECTION: Échelle exacte selon spécification utilisateur ***
    const EXACT_SCALE = 3.72; // pixels par mètre (3.72 px = 1m)
    
    const pixelX = worldPos.x * EXACT_SCALE * currentZoom;
    const pixelY = -worldPos.y * EXACT_SCALE * currentZoom; // Inversion Y pour SVG
    
    // Centre de l'écran comme origine avec offset
    const centerX = svgWidth / 2 + viewOffset.x;
    const centerY = svgHeight / 2 + viewOffset.y;
    
    return {
      x: centerX + pixelX,
      y: centerY + pixelY
    };
  };

  /**
   * Rendu de la grille noire
   * CORRIGÉ: Grille de 14629px × 13764px avec échelle 3.72 px/m
   */
  const renderGrid = () => {
    // *** CORRECTION: Grille selon spécifications utilisateur ***
    const EXACT_SCALE = 3.72; // pixels par mètre (3.72 px = 1m)
    const GRID_WIDTH = 14629; // pixels
    const GRID_HEIGHT = 13764; // pixels
    
    // Espacement de grille en mètres (par exemple tous les 10m)
    const gridSpacingMeters = 10; // mètres
    const gridSpacing = gridSpacingMeters * EXACT_SCALE; // pixels (37.2px)
    
    const lines = [];
    
    // Centre de l'écran comme origine
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    
    // Calculer les limites de la grille en coordonnées écran
    const gridLeft = centerX - GRID_WIDTH / 2;
    const gridRight = centerX + GRID_WIDTH / 2;
    const gridTop = centerY - GRID_HEIGHT / 2;
    const gridBottom = centerY + GRID_HEIGHT / 2;
    
    // Calculer le nombre de lignes nécessaires
    const numVerticalLines = Math.ceil(GRID_WIDTH / gridSpacing);
    const numHorizontalLines = Math.ceil(GRID_HEIGHT / gridSpacing);
    
    // Lignes verticales
    for (let i = -Math.floor(numVerticalLines / 2); i <= Math.ceil(numVerticalLines / 2); i++) {
      const x = centerX + (i * gridSpacing);
      if (x >= gridLeft && x <= gridRight) {
        lines.push(
          <Line
            key={`v-${i}`}
            x1={x}
            y1={Math.max(0, gridTop)}
            x2={x}
            y2={Math.min(svgHeight, gridBottom)}
            stroke="#333333"
            strokeWidth="1"
            opacity="0.3"
          />
        );
      }
    }
    
    // Lignes horizontales
    for (let i = -Math.floor(numHorizontalLines / 2); i <= Math.ceil(numHorizontalLines / 2); i++) {
      const y = centerY + (i * gridSpacing);
      if (y >= gridTop && y <= gridBottom) {
        lines.push(
          <Line
            key={`h-${i}`}
            x1={Math.max(0, gridLeft)}
            y1={y}
            x2={Math.min(svgWidth, gridRight)}
            y2={y}
            stroke="#333333"
            strokeWidth="1"
            opacity="0.3"
          />
        );
      }
    }
    
    // *** NOUVEAU: Bordure de la grille pour visualiser les limites ***
    lines.push(
      <Line
        key="border-top"
        x1={Math.max(0, gridLeft)}
        y1={Math.max(0, gridTop)}
        x2={Math.min(svgWidth, gridRight)}
        y2={Math.max(0, gridTop)}
        stroke="#666666"
        strokeWidth="2"
        opacity="0.8"
      />,
      <Line
        key="border-bottom"
        x1={Math.max(0, gridLeft)}
        y1={Math.min(svgHeight, gridBottom)}
        x2={Math.min(svgWidth, gridRight)}
        y2={Math.min(svgHeight, gridBottom)}
        stroke="#666666"
        strokeWidth="2"
        opacity="0.8"
      />,
      <Line
        key="border-left"
        x1={Math.max(0, gridLeft)}
        y1={Math.max(0, gridTop)}
        x2={Math.max(0, gridLeft)}
        y2={Math.min(svgHeight, gridBottom)}
        stroke="#666666"
        strokeWidth="2"
        opacity="0.8"
      />,
      <Line
        key="border-right"
        x1={Math.min(svgWidth, gridRight)}
        y1={Math.max(0, gridTop)}
        x2={Math.min(svgWidth, gridRight)}
        y2={Math.min(svgHeight, gridBottom)}
        stroke="#666666"
        strokeWidth="2"
        opacity="0.8"
      />
    );
    
    return <G>{lines}</G>;
  };

  /**
   * Rendu de la trajectoire avec trait affiné
   */
  const renderTrajectory = () => {
    if (!state.trajectory || state.trajectory.length < 1) {
      return null;
    }
    
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
              {(isOrientationActive ? (continuousOrientation * 180 / Math.PI).toFixed(1) : (state.pose.theta * 180 / Math.PI).toFixed(1)) + '°'}
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
            <Text style={styles.metricValue}>x{viewportInfo.zoom.toFixed(2)}</Text>
          </View>
        </View>

        {/* *** NOUVEAU: Informations du système de tuiles *** */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Tuiles</Text>
            <Text style={styles.metricValue}>{viewportInfo.visibleTiles}</Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Carte</Text>
            <Text style={styles.metricValue}>{mapStats ? mapStats.trajectoryCount : 0} trajets</Text>
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
    setCurrentZoom(newZoom);
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
  };

  // *** NOUVEAU: Initialisation de la carte persistante ***
  const initializePersistentMap = async () => {
    try {
      console.log('🗺️ [MAP-SCREEN] Initialisation de la carte persistante...');
      
      await persistentMapService.initialize();
      
      // Charger le SVG de la carte persistante
      const svgContent = await persistentMapService.getSVGContent();
      setPersistentMapSVG(svgContent);
      
      // Charger les statistiques
      const stats = persistentMapService.getMapStats();
      setMapStats(stats);
      
      console.log('✅ [MAP-SCREEN] Carte persistante initialisée:', stats);
      
      // *** NOUVEAU: Centrer et zoomer sur "Entrée Fifi" après initialisation ***
      setTimeout(() => {
        centerOnDefaultPointWithCustomZoom();
      }, 1000); // Délai pour s'assurer que la carte est prête
      
    } catch (error) {
      console.error('❌ [MAP-SCREEN] Erreur initialisation carte persistante:', error);
      // Continuer sans la carte persistante
    }
  };

  // *** NOUVEAU: Gestionnaire de changement de viewport ***
  const handleViewportChange = useCallback((info) => {
    setViewportInfo({
      zoom: info.zoom,
      panX: info.panX,
      panY: info.panY,
      visibleTiles: info.visibleTiles || 0
    });
    
    // Sauvegarder les contrôles de la carte
    if (info.centerOnUser && info.viewFullMap && info.centerOnPoint && info.setCustomZoom) {
      setMapControls({
        centerOnUser: info.centerOnUser,
        viewFullMap: info.viewFullMap,
        centerOnPoint: info.centerOnPoint,
        setCustomZoom: info.setCustomZoom,
        pointsOfInterest: info.pointsOfInterest || []
      });
    }
  }, []);

  // *** SIMPLIFIÉ: Centrer sur le point par défaut avec zoom personnalisé ***
  const centerOnDefaultPointWithCustomZoom = useCallback(() => {
    if (mapControls.centerOnPoint && mapControls.setCustomZoom) {
      // Centrer sur "Entrée Fifi"
      mapControls.centerOnPoint(defaultPoint);
      
      // Définir le zoom pour afficher 530x1000 pixels
      mapControls.setCustomZoom(initialZoom);
      
      console.log(`🎯 [MAP-SCREEN] Vue centrée sur ${defaultPoint.name} avec zoom ${initialZoom.toFixed(3)}x`);
    } else {
      console.warn('⚠️ [MAP-SCREEN] Contrôles de carte non disponibles pour le centrage');
    }
  }, [mapControls.centerOnPoint, mapControls.setCustomZoom, defaultPoint, initialZoom]);

  // *** NOUVEAU: Voir la carte entière ***
  const viewFullMap = useCallback(() => {
    if (mapControls.viewFullMap) {
      mapControls.viewFullMap();
    }
  }, [mapControls.viewFullMap]);

  // *** NOUVEAU: Confirmer le point de départ ***
  const confirmStartingPoint = async () => {
    setStartingPointModal(prev => ({ ...prev, isLoading: true }));

    try {
      let startX = 0;
      let startY = 0;

      if (startingPointModal.selectedPoint) {
        // Point prédéfini sélectionné
        startX = startingPointModal.selectedPoint.worldX;
        startY = startingPointModal.selectedPoint.worldY;
        console.log(`🎯 [STARTING-POINT] Point prédéfini: ${startingPointModal.selectedPoint.name} (${startX.toFixed(2)}, ${startY.toFixed(2)})`);
      } else if (startingPointModal.customX && startingPointModal.customY) {
        // Coordonnées personnalisées
        startX = parseFloat(startingPointModal.customX);
        startY = parseFloat(startingPointModal.customY);
        
        if (isNaN(startX) || isNaN(startY)) {
          throw new Error('Coordonnées invalides');
        }
        
        console.log(`🎯 [STARTING-POINT] Coordonnées personnalisées: (${startX.toFixed(2)}, ${startY.toFixed(2)})`);
      } else {
        // Point par défaut "Entrée Fifi"
        const defaultPoint = getDefaultStartingPoint();
        startX = defaultPoint.worldX;
        startY = defaultPoint.worldY;
        console.log(`🎯 [STARTING-POINT] Point par défaut: ${defaultPoint.name} (${startX.toFixed(2)}, ${startY.toFixed(2)})`);
      }

      // Définir la position de départ
      const initialPose = { 
        x: startX, 
        y: startY, 
        theta: 0,
        confidence: 0.8
      };
      
      actions.resetPose(initialPose);
      actions.resetTrajectory();
      
      // Centrer la carte sur le point de départ si possible
      if (mapControls.centerOnPoint && startingPointModal.selectedPoint) {
        setTimeout(() => {
          mapControls.centerOnPoint(startingPointModal.selectedPoint);
        }, 500);
      }

      setStartingPointModal({ 
        visible: false, 
        selectedPoint: null, 
        customX: '', 
        customY: '', 
        isLoading: false 
      });

      console.log(`✅ [STARTING-POINT] Point de départ défini: (${startX.toFixed(2)}, ${startY.toFixed(2)})`);

      // *** NOUVEAU: Démarrer le tracking après confirmation du point de départ ***
      actions.setTracking(true);
      await startMotionTracking();

    } catch (error) {
      console.error('❌ [STARTING-POINT] Erreur définition point de départ:', error);
      Alert.alert('Erreur', error.message || 'Impossible de définir le point de départ');
      setStartingPointModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  // *** NOUVEAU: Sélectionner un point prédéfini ***
  const selectPredefinedPoint = (point) => {
    setStartingPointModal(prev => ({
      ...prev,
      selectedPoint: point,
      customX: '',
      customY: ''
    }));
  };

  // *** NOUVEAU: Utiliser coordonnées personnalisées ***
  const useCustomCoordinates = () => {
    setStartingPointModal(prev => ({
      ...prev,
      selectedPoint: null
    }));
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
      {/* *** NOUVEAU: Carte avec système de tuiles pour afficher la carte entière *** */}
      <TiledMapView
        persistentMapService={persistentMapService}
        currentTrajectory={state.trajectory}
        userPosition={state.pose}
        userOrientation={continuousOrientation}
        onViewportChange={handleViewportChange}
        initialZoom={initialZoom}
        initialCenterPoint={defaultPoint}
      />

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
        
        {/* *** NOUVEAU: Bouton voir carte entière *** */}
        <TouchableOpacity style={styles.controlButton} onPress={viewFullMap}>
          <Ionicons name="scan" size={24} color="#00ff88" />
        </TouchableOpacity>
        
        {/* *** NOUVEAU: Bouton sauvegarder trajet dans carte persistante *** */}
        <TouchableOpacity 
          style={[styles.controlButton, (!state.trajectory || state.trajectory.length === 0) && styles.disabledControlButton]} 
          onPress={handleSaveTrajectory}
          disabled={!state.trajectory || state.trajectory.length === 0}
        >
          <Ionicons name="save" size={24} color={(!state.trajectory || state.trajectory.length === 0) ? "#666666" : "#00ff88"} />
        </TouchableOpacity>

        {/* *** NOUVEAU: Bouton statistiques de la carte *** */}
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={showMapStats}
        >
          <Ionicons name="stats-chart" size={24} color="#00ff88" />
        </TouchableOpacity>
      </View>

      {/* *** NOUVEAU: Modal de sélection du point de départ *** */}
      <Modal
        visible={startingPointModal.visible}
        transparent={true}
        animationType="slide"
      >
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
          <View style={styles.startingPointModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.startingPointModalContent}>
                <View style={styles.startingPointHeader}>
                  <Ionicons name="flag" size={32} color="#ffaa00" />
                  <Text style={styles.startingPointTitle}>Choisissez votre point de départ</Text>
                </View>
                
                {/* Points prédéfinis */}
                <Text style={styles.sectionTitle}>Points prédéfinis :</Text>
                <View style={styles.predefinedPointsContainer}>
                  {mapControls.pointsOfInterest.map(point => (
                    <TouchableOpacity
                      key={point.id}
                      style={[
                        styles.predefinedPointButton,
                        startingPointModal.selectedPoint?.id === point.id && styles.selectedPointButton
                      ]}
                      onPress={() => selectPredefinedPoint(point)}
                    >
                      <View style={[styles.pointColorIndicator, { backgroundColor: point.color }]} />
                      <View style={styles.pointInfo}>
                        <Text style={styles.pointName}>{point.name}</Text>
                        <Text style={styles.pointCoordinates}>
                          ({point.worldX.toFixed(1)}, {point.worldY.toFixed(1)})
                        </Text>
                        <Text style={styles.pointDescription}>{point.description}</Text>
                      </View>
                      {startingPointModal.selectedPoint?.id === point.id && (
                        <Ionicons name="checkmark-circle" size={24} color="#00ff88" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                
                {/* Coordonnées personnalisées */}
                <Text style={styles.sectionTitle}>Ou définissez vos coordonnées :</Text>
                <TouchableOpacity
                  style={[
                    styles.customCoordinatesButton,
                    !startingPointModal.selectedPoint && styles.selectedCustomButton
                  ]}
                  onPress={useCustomCoordinates}
                >
                  <Ionicons name="create" size={20} color="#00ff88" />
                  <Text style={styles.customCoordinatesText}>Coordonnées personnalisées</Text>
                </TouchableOpacity>
                
                {!startingPointModal.selectedPoint && (
                  <View style={styles.customInputsContainer}>
                    <View style={styles.coordinateInputContainer}>
                      <Text style={styles.coordinateLabel}>X :</Text>
                      <TextInput
                        style={styles.coordinateInput}
                        value={startingPointModal.customX}
                        onChangeText={(text) => setStartingPointModal(prev => ({ ...prev, customX: text }))}
                        placeholder="0.0"
                        placeholderTextColor="#666666"
                        keyboardType="numeric"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => {
                          // Focus sur le champ Y
                          if (yInputRef.current) {
                            yInputRef.current.focus();
                          }
                        }}
                      />
                    </View>
                    
                    <View style={styles.coordinateInputContainer}>
                      <Text style={styles.coordinateLabel}>Y :</Text>
                      <TextInput
                        ref={yInputRef}
                        style={styles.coordinateInput}
                        value={startingPointModal.customY}
                        onChangeText={(text) => setStartingPointModal(prev => ({ ...prev, customY: text }))}
                        placeholder="0.0"
                        placeholderTextColor="#666666"
                        keyboardType="numeric"
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          Keyboard.dismiss();
                        }}
                      />
                    </View>
                  </View>
                )}
                
                {/* *** NOUVEAU: Bouton pour fermer le clavier *** */}
                {!startingPointModal.selectedPoint && (
                  <TouchableOpacity
                    style={styles.dismissKeyboardButton}
                    onPress={() => Keyboard.dismiss()}
                  >
                    <Ionicons name="keyboard" size={16} color="#00ff88" />
                    <Text style={styles.dismissKeyboardText}>Fermer le clavier</Text>
                  </TouchableOpacity>
                )}
                
                {/* Boutons d'action */}
                <View style={styles.startingPointActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setStartingPointModal(prev => ({ ...prev, visible: false }))}
                    disabled={startingPointModal.isLoading}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.confirmButton, startingPointModal.isLoading && styles.disabledButton]}
                    onPress={confirmStartingPoint}
                    disabled={startingPointModal.isLoading}
                  >
                    {startingPointModal.isLoading ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <Text style={styles.confirmButtonText}>Confirmer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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
  // *** NOUVEAU: Styles pour le modal de sélection du point de départ ***
  startingPointModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startingPointModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 25,
    margin: 20,
    maxWidth: 350,
    width: '90%',
    borderWidth: 2,
    borderColor: '#ffaa00',
    maxHeight: '80%',
  },
  startingPointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'center',
  },
  startingPointTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
    textAlign: 'center',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 10,
  },
  predefinedPointsContainer: {
    marginBottom: 20,
  },
  predefinedPointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
    borderWidth: 2,
    borderColor: '#ffaa00',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  selectedPointButton: {
    backgroundColor: 'rgba(255, 170, 0, 0.3)',
    borderColor: '#00ff88',
  },
  pointColorIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  pointInfo: {
    flex: 1,
  },
  pointName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  pointCoordinates: {
    color: '#cccccc',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  pointDescription: {
    color: '#888888',
    fontSize: 12,
    fontStyle: 'italic',
  },
  customCoordinatesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    justifyContent: 'center',
  },
  selectedCustomButton: {
    backgroundColor: 'rgba(0, 255, 136, 0.3)',
  },
  customCoordinatesText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  customInputsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 15,
  },
  coordinateInputContainer: {
    flex: 1,
  },
  coordinateLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  coordinateInput: {
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    textAlign: 'center',
  },
  startingPointActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 15,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 2,
    borderColor: '#ff4444',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderColor: '#666666',
  },
  dismissKeyboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderWidth: 1,
    borderColor: '#00ff88',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  dismissKeyboardText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 5,
  },
}); 