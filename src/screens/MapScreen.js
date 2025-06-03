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
  Animated,
  Easing,
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
import { appearanceService } from '../services/AppearanceService';

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

  // *** NOUVEAU: Configuration des couleurs ***
  const [appearanceConfig, setAppearanceConfig] = useState(null);
  
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
    // *** CORRIGÉ: Coordonnées cohérentes avec TiledMapView ***
    // La carte fait 14629px × 13764px avec échelle 3.72 px/m
    // Le centre de la carte est à (7314.5, 6882) en pixels
    // Pour convertir des coordonnées pixel en coordonnées monde :
    // worldX = (pixelX - centerX) / SCALE
    // worldY = -(pixelY - centerY) / SCALE (inversion Y)
    
    const pixelX = 12364; // Position en pixels dans la carte
    const pixelY = 2612;  // Position en pixels dans la carte
    const SCALE = 3.72;   // pixels par mètre
    const centerX = MAP_TOTAL_WIDTH / 2;  // 7314.5
    const centerY = MAP_TOTAL_HEIGHT / 2; // 6882
    
    const worldX = (pixelX - centerX) / SCALE;
    const worldY = -(pixelY - centerY) / SCALE; // Inversion Y pour coordonnées monde
    
    console.log(`📍 [POINT-DEFAULT] Calcul "Entrée Fifi":`);
    console.log(`  - Pixels: (${pixelX}, ${pixelY})`);
    console.log(`  - Centre carte: (${centerX}, ${centerY})`);
    console.log(`  - Monde: (${worldX.toFixed(2)}, ${worldY.toFixed(2)})`);
    
    return {
      id: 'entree_fifi',
      name: 'Entrée Fifi',
      x: pixelX,     // Coordonnées en pixels pour TiledMapView
      y: pixelY,     // Coordonnées en pixels pour TiledMapView
      worldX: worldX, // Coordonnées monde pour la logique métier
      worldY: worldY, // Coordonnées monde pour la logique métier
      color: '#ff6b35',
      description: 'Point d\'entrée principal'
    };
  };
  
  // *** FIX: CALLBACKS DÉFINIS AVANT L'INITIALISATION DU SERVICE ***
  const lastTotalStepsRef = useRef(0); // *** NOUVEAU: Pour détecter les doublons ***
  
  // *** NOUVEAU: Configuration du lissage de trajectoire ***
  const trajectorySmoothing = {
    enabled: true,
    minPointDistance: 0.15,       // Distance minimum entre points (15cm)
    outlierThreshold: 1.5,        // Seuil pour détecter les points aberrants (1.5m)
    maxConsecutiveOutliers: 2,    // Maximum de points aberrants consécutifs
    smoothingFactor: 0.3          // Facteur de lissage (0.3 = 30% de lissage)
  };
  const consecutiveOutliersRef = useRef(0);
  
  // *** NOUVEAU: Fonction de filtrage et lissage des points de trajectoire ***
  const filterAndSmoothTrajectoryPoint = useCallback((newPoint, currentTrajectory) => {
    if (!trajectorySmoothing.enabled || !currentTrajectory || currentTrajectory.length === 0) {
      return newPoint;
    }
    
    // *** FILTRE 1: Distance minimum entre points ***
    if (currentTrajectory.length > 0) {
      const lastPoint = currentTrajectory[currentTrajectory.length - 1];
      const distance = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);
      
      if (distance < trajectorySmoothing.minPointDistance) {
        console.log(`🎯 [TRAJECTORY-FILTER] Point trop proche ignoré: ${distance.toFixed(3)}m < ${trajectorySmoothing.minPointDistance}m`);
        return null; // Ignorer ce point
      }
    }
    
    // *** FILTRE 2: Détection et correction d'outliers ***
    if (currentTrajectory.length >= 2) {
      const lastPoint = currentTrajectory[currentTrajectory.length - 1];
      const secondLastPoint = currentTrajectory[currentTrajectory.length - 2];
      
      // Calculer la direction attendue basée sur les derniers points
      const expectedDirection = Math.atan2(lastPoint.y - secondLastPoint.y, lastPoint.x - secondLastPoint.x);
      const lastDistance = Math.hypot(lastPoint.x - secondLastPoint.x, lastPoint.y - secondLastPoint.y);
      
      const actualDistance = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);
      
      // Vérifier si c'est un outlier
      if (actualDistance > trajectorySmoothing.outlierThreshold) {
        consecutiveOutliersRef.current++;
        
        console.log(`⚠️ [TRAJECTORY-FILTER] Point aberrant détecté: distance=${actualDistance.toFixed(3)}m > seuil=${trajectorySmoothing.outlierThreshold}m (outlier #${consecutiveOutliersRef.current})`);
        
        // Si trop d'outliers consécutifs, on les rejette
        if (consecutiveOutliersRef.current > trajectorySmoothing.maxConsecutiveOutliers) {
          console.log(`❌ [TRAJECTORY-FILTER] Trop d'outliers consécutifs (${consecutiveOutliersRef.current}), point rejeté`);
          return null;
        }
        
        // Sinon, corriger le point en limitant la distance
        const correctedDistance = Math.min(actualDistance, trajectorySmoothing.outlierThreshold * 0.8);
        const direction = Math.atan2(newPoint.y - lastPoint.y, newPoint.x - lastPoint.x);
        
        const correctedPoint = {
          ...newPoint,
          x: lastPoint.x + correctedDistance * Math.cos(direction),
          y: lastPoint.y + correctedDistance * Math.sin(direction)
        };
        
        console.log(`🎯 [TRAJECTORY-FILTER] Point corrigé: (${newPoint.x.toFixed(2)}, ${newPoint.y.toFixed(2)}) → (${correctedPoint.x.toFixed(2)}, ${correctedPoint.y.toFixed(2)})`);
        return correctedPoint;
      } else {
        // Point normal, réinitialiser le compteur d'outliers
        consecutiveOutliersRef.current = 0;
      }
    }
    
    // *** FILTRE 3: Lissage basé sur la confiance ***
    if (currentTrajectory.length >= 2) {
      const lastPoint = currentTrajectory[currentTrajectory.length - 1];
      
      // Facteur de lissage adaptatif basé sur la confiance
      const confidenceWeight = Math.max(0.1, Math.min(0.9, newPoint.confidence || 0.5));
      const adaptiveSmoothingFactor = trajectorySmoothing.smoothingFactor * (1 - confidenceWeight);
      
      const smoothedPoint = {
        ...newPoint,
        x: newPoint.x * (1 - adaptiveSmoothingFactor) + lastPoint.x * adaptiveSmoothingFactor,
        y: newPoint.y * (1 - adaptiveSmoothingFactor) + lastPoint.y * adaptiveSmoothingFactor
      };
      
      if (adaptiveSmoothingFactor > 0.1) {
        console.log(`🎯 [TRAJECTORY-SMOOTH] Point lissé: confiance=${(confidenceWeight*100).toFixed(1)}%, lissage=${(adaptiveSmoothingFactor*100).toFixed(1)}%`);
        console.log(`  Original: (${newPoint.x.toFixed(2)}, ${newPoint.y.toFixed(2)}) → Lissé: (${smoothedPoint.x.toFixed(2)}, ${smoothedPoint.y.toFixed(2)})`);
      }
      
      return smoothedPoint;
    }
    
    return newPoint;
  }, []);

  const handleStepDetected = useCallback(({ stepCount, stepLength, dx, dy, timestamp, totalSteps, confidence, source, nativeStepLength, averageStepLength, cadence, timeDelta, isFallback, filtered, validationPass }) => {
    // *** AMÉLIORATION: Vérifier si le pas a été filtré par le service ***
    if (validationPass === false) {
      console.log(`⚠️ [STEP-CALLBACK] Pas marqué comme non-validé par le service - ignoré`);
      return;
    }
    
    // *** NOUVEAU: Détection de doublon de pas ***
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === VÉRIFICATION DOUBLON ===`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] totalSteps actuel: ${totalSteps}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] lastTotalSteps: ${lastTotalStepsRef.current}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] Différence: ${totalSteps - lastTotalStepsRef.current}`);
    
    // *** PROTECTION CONTRE LE DOUBLE COMPTAGE ***
    if (totalSteps <= lastTotalStepsRef.current) {
      console.log(`⚠️ [STEP-CALLBACK-PROTECTION] DOUBLON DÉTECTÉ ! totalSteps=${totalSteps} <= lastTotalSteps=${lastTotalStepsRef.current} - IGNORÉ`);
      return; // Ignorer ce callback
    }
    
    // Calculer le nombre de nouveaux pas réels
    const newStepsCount = totalSteps - lastTotalStepsRef.current;
    console.log(`🔧 [STEP-CALLBACK-DEBUG] Nouveaux pas réels: ${newStepsCount}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === FIN VÉRIFICATION ===`);
    
    // Mettre à jour la référence
    lastTotalStepsRef.current = totalSteps;
    
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === DÉBUT ANALYSE CONFIANCE ===`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] Confiance reçue du service: ${confidence} (${(confidence * 100).toFixed(1)}%)`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] nativeStepLength: ${nativeStepLength}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] source: ${source}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] isFallback: ${isFallback}`);
    
    // *** NOUVEAU: Logs détaillés pour débugger le problème des pas ***
    console.log(`🔧 [STEP-CALLBACK-DEBUG] stepCount reçu: ${stepCount}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] totalSteps reçu: ${totalSteps}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] Quelle valeur utiliser pour les métriques ? totalSteps = ${totalSteps}`);
    
    console.log(`📏 [STEP-CALLBACK] Longueur de pas: ${stepLength.toFixed(3)}m ${nativeStepLength ? '(NATIVE)' : '(FALLBACK)'}`);
    console.log(`📍 [STEP-CALLBACK] Déplacement: dx=${dx.toFixed(3)}, dy=${dy.toFixed(3)}`);
    
    // *** FIX: Utiliser les refs pour accéder aux valeurs actuelles ***
    const currentState = stateRef.current;
    const currentActions = actionsRef.current;
    
    console.log(`📊 [STEP-CALLBACK] État actuel: position=(${currentState.pose.x.toFixed(2)}, ${currentState.pose.y.toFixed(2)}), pas AVANT update=${currentState.stepCount || 0}`);
    
    // *** NOUVEAU: Distinction claire des sources pour la confiance ***
    const isNative = source === 'ios_cmpedometer';
    const stepConfidenceToUse = isNative ? 1.0 : confidence;
    
    console.log(`🔧 [STEP-CALLBACK-DEBUG] isNative: ${isNative}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] stepConfidenceToUse: ${stepConfidenceToUse} (${(stepConfidenceToUse * 100).toFixed(1)}%)`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === FIN ANALYSE CONFIANCE ===`);
    
    // Calculer la nouvelle position
    const newX = currentState.pose.x + dx;
    const newY = currentState.pose.y + dy;
    
    // *** NOUVEAU: Créer le nouveau point avec filtrage et lissage ***
    const rawTrajectoryPoint = {
      x: newX,
      y: newY,
      timestamp,
      confidence: stepConfidenceToUse
    };
    
    // Appliquer le filtrage et lissage
    const filteredPoint = filterAndSmoothTrajectoryPoint(rawTrajectoryPoint, currentState.trajectory);
    
    if (!filteredPoint) {
      console.log(`❌ [TRAJECTORY-FILTER] Point rejeté par le filtre de trajectoire - pas d'ajout à la trajectoire`);
      // Ne pas ajouter ce point à la trajectoire mais continuer avec les autres mises à jour
      
      // Juste mettre à jour les métriques sans ajouter de point
      const totalDistance = (currentState.distance || 0) + Math.hypot(dx, dy);
      const stepsToUse = totalSteps || stepCount || 0;
      
      currentActions.updatePDRMetrics({
        stepCount: stepsToUse,
        distance: totalDistance,
        currentMode: isNative ? 'NATIF' : 'FALLBACK',
        energyLevel: 1.0,
        isZUPT: false
      });
      
      console.log(`📊 [TRAJECTORY-FILTER] Métriques mises à jour sans nouveau point de trajectoire`);
      return;
    }
    
    // *** FIX: ORDRE CORRIGÉ - Ajouter le point filtré à la trajectoire AVANT de mettre à jour la pose ***
    // 1) D'abord ajouter le nouveau point filtré à la trajectoire
    currentActions.addTrajectoryPoint(filteredPoint);
    
    // 2) Ensuite mettre à jour la pose (utiliser la position filtrée)
    currentActions.updatePose({
      x: filteredPoint.x,
      y: filteredPoint.y,
      // *** NE PAS METTRE À JOUR THETA *** - l'orientation est gérée séparément par la boussole
      confidence: stepConfidenceToUse
    });
    
    console.log(`📍 [STEP-CALLBACK] Nouvelle position filtrée: (${filteredPoint.x.toFixed(2)}, ${filteredPoint.y.toFixed(2)}), orientation CONSERVÉE`);
    
    // *** FIX: Calculer la distance totale correctement avec la position filtrée ***
    const actualMovement = Math.hypot(filteredPoint.x - currentState.pose.x, filteredPoint.y - currentState.pose.y);
    const totalDistance = (currentState.distance || 0) + actualMovement;
    
    // *** FIX MAJEUR: Utiliser totalSteps au lieu de stepCount pour les métriques ***
    const stepsToUse = totalSteps || stepCount || 0; // Fallback au cas où
    
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === CORRECTION DES PAS ===`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] stepCount: ${stepCount}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] totalSteps: ${totalSteps}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] stepsToUse: ${stepsToUse}`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] totalDistance: ${totalDistance.toFixed(3)}m`);
    console.log(`🔧 [STEP-CALLBACK-DEBUG] === FIN CORRECTION ===`);
    
    currentActions.updatePDRMetrics({
      stepCount: stepsToUse, // *** CORRIGÉ: Utiliser totalSteps au lieu de stepCount ***
      distance: totalDistance,
      currentMode: isNative ? 'NATIF' : 'FALLBACK',
      energyLevel: 1.0,
      isZUPT: false
    });
    
    console.log(`📊 [STEP-CALLBACK] Métriques mises à jour: ${stepsToUse} pas (était ${stepCount}), distance: ${totalDistance.toFixed(2)}m, confiance: ${(stepConfidenceToUse * 100).toFixed(0)}%`);
    console.log(`🎯 [STEP-CALLBACK] Trajectoire: ${(currentState.trajectory?.length || 0) + 1} points`);
  }, []);

  const handleHeading = useCallback(({ yaw, accuracy, timestamp, source, filteredHeading, rawHeading, filterQuality }) => {
    // *** FIX: Utiliser les refs pour accéder aux valeurs actuelles ***
    const currentState = stateRef.current;
    const currentActions = actionsRef.current;
    
    // *** AMÉLIORATION: Filtrage supplémentaire côté UI ***
    const currentOrientation = continuousOrientationRef.current;
    
    // Si c'est la première orientation, l'accepter directement
    if (currentOrientation === null || currentOrientation === undefined) {
      setContinuousOrientation(yaw);
      continuousOrientationRef.current = yaw;
    } else {
      // Calculer la différence d'angle en gérant le passage 0°/2π
      let angleDiff = yaw - currentOrientation;
      if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      else if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      
      // *** NOUVEAU: Rejet des sauts trop importants côté UI ***
      const maxUIJumpThreshold = Math.PI / 6; // 30° maximum d'un coup côté UI
      
      if (Math.abs(angleDiff) > maxUIJumpThreshold) {
        console.log(`🎯 [UI-FILTER] Saut UI rejeté: ${(angleDiff * 180 / Math.PI).toFixed(1)}° > ${(maxUIJumpThreshold * 180 / Math.PI).toFixed(1)}°`);
        return; // Rejeter cette mise à jour UI
      }
      
      // *** NOUVEAU: Lissage UI adaptatif basé sur la qualité du filtrage ***
      const uiSmoothingAlpha = filterQuality?.accuracyGood ? 0.3 : 0.1; // Plus réactif si bonne qualité
      
      // Appliquer le lissage UI
      const newOrientation = currentOrientation + uiSmoothingAlpha * angleDiff;
      
      setContinuousOrientation(newOrientation);
      continuousOrientationRef.current = newOrientation;
    }
    
    // *** FIX: Mettre à jour les autres états d'orientation ***
    setOrientationConfidence(accuracy ? Math.max(0, Math.min(1, (100 - accuracy) / 100)) : 0.8);
    setOrientationSource('native_compass');
    setIsOrientationActive(true); // S'assurer que l'orientation est active
    
    currentActions.updatePose({
      x: currentState.pose.x,
      y: currentState.pose.y,
      theta: continuousOrientationRef.current, // Utiliser l'orientation lissée UI
      confidence: currentState.pose.confidence
    });
  }, []);

  // *** NOUVEAU: Callback pour les données des capteurs ***
  const handleSensors = useCallback((sensorData) => {
    const currentActions = actionsRef.current;
    
    // Mettre à jour les données des capteurs dans le contexte
    currentActions.updateSensors({
      accelerometer: sensorData.accelerometer,
      gyroscope: sensorData.gyroscope,
      magnetometer: sensorData.magnetometer
    });
  }, []);
  
  const [hybridMotionService] = useState(() => new NativeEnhancedMotionService(
    handleStepDetected,
    handleHeading,
    handleSensors
  ));
  
  // *** NOUVEAU: Utilitaire de test pour le filtrage de la boussole ***
  const [compassFilteringTest] = useState(() => new CompassFilteringTest(hybridMotionService));
  
  // Convertisseur d'échelle avec l'échelle de référence CORRIGÉE
  const [scaleConverter] = useState(() => new ScaleConverter({
    referenceMaters: 100,     // 100 mètres
    referencePixels: 372,     // = 372 pixels (échelle correcte)
    screenWidth: screenWidth,
    screenHeight: screenHeight // Toute la hauteur de l'écran
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

  // *** NOUVEAU: États pour l'ajout d'éléments sur la carte ***
  const [addElementModal, setAddElementModal] = useState({
    visible: false,
    showElementsList: false,
    selectedElementType: null,
    elementName: '',
    isLoading: false
  });

  // *** NOUVEAU: État pour la sauvegarde automatique à la fin du trajet ***
  const [endTrajectoryModal, setEndTrajectoryModal] = useState({
    visible: false,
    trajectoryData: null,
    isLoading: false
  });

  // *** NOUVEAU: Types d'éléments disponibles ***
  const [availableElements] = useState([
    { id: 'room', name: 'Salle', icon: 'home', color: '#00ff88', requiresName: true },
    { id: 'well', name: 'Puit', icon: 'water', color: '#0088ff', requiresName: false },
    { id: 'catflap', name: 'Chattière', icon: 'paw', color: '#ff8800', requiresName: false },
    { id: 'custom', name: 'Élément personnalisé', icon: 'create', color: '#ff00ff', requiresName: true },
    { id: 'entrance', name: 'Entrée', icon: 'enter', color: '#ffaa00', requiresName: false },
    { id: 'exit', name: 'Sortie', icon: 'exit', color: '#ff4444', requiresName: false }
  ]);

  // *** NOUVEAU: Liste des éléments ajoutés par l'utilisateur ***
  const [userElements, setUserElements] = useState([]);
  
  // *** NOUVEAU: Ref pour suivre si c'est la première fois qu'on arrête le tracking ***
  const isFirstStopRef = useRef(true);
  
  // *** NOUVEAU: État pour le menu flottant animé ***
  const [isFloatingMenuOpen, setIsFloatingMenuOpen] = useState(false);
  
  // *** NOUVEAU: État pour gérer PAUSE/STOP du tracking ***
  const [trackingMode, setTrackingMode] = useState('stopped'); // 'stopped', 'running', 'paused'
  const [pausedPosition, setPausedPosition] = useState(null); // Position lors de la pause
  
  // *** NOUVEAU: Valeurs animées pour le menu flottant ***
  const menuAnimation = useRef(new Animated.Value(0)).current;
  const rotationAnimation = useRef(new Animated.Value(0)).current;
  
  // *** CORRECTION: Dimensions SVG adaptées à l'écran avec zoom intelligent ***
  // Dimensions de l'affichage SVG - CARTE PLEINE HAUTEUR
  const svgWidth = screenWidth;
  const svgHeight = screenHeight; // Toute la hauteur de l'écran

  // *** NOUVEAU: Calculer le zoom initial pour afficher 530x1000 pixels ***
  const calculateInitialZoom = () => {
    const targetViewportWidth = 530;  // pixels sur la carte
    const targetViewportHeight = 1000; // pixels sur la carte
    
    // Zoom nécessaire pour afficher cette zone
    const zoomX = screenWidth / targetViewportWidth;
    const zoomY = screenHeight / targetViewportHeight; // Utilise toute la hauteur maintenant
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
    
    // *** NOUVEAU: Initialiser l'apparence ***
    initializeAppearance();
    
    // *** NOUVEAU: Démarrer la boussole native indépendante ***
    startNativeCompass();
    
    // *** NOUVEAU: Exposer l'utilitaire de test globalement ***
    if (typeof window !== 'undefined') {
      window.compassTest = compassFilteringTest;
      console.log(`🧭 [COMPASS-TEST] Utilitaire de test disponible globalement: window.compassTest`);
      console.log(`🧭 [COMPASS-TEST] Tapez "window.compassTest.help()" dans la console pour voir l'aide`);
    }
    
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
      console.log('🚀 [INIT-SYSTEM] === DÉBUT INITIALISATION ===');
      
      // *** MODIFICATION: Pas d'initialisation spéciale pour HybridMotionService ***
      // Il s'initialise automatiquement lors du start()
      
      // *** NOUVEAU: Position initiale par défaut à "Entrée Fifi" ***
      const defaultPoint = getDefaultStartingPoint();
      console.log('🚀 [INIT-SYSTEM] defaultPoint calculé:', defaultPoint);
      
      const initialPose = { 
        x: defaultPoint.worldX, 
        y: defaultPoint.worldY, 
        theta: 0,
        confidence: 0.8
      };
      
      console.log('🚀 [INIT-SYSTEM] initialPose préparé:', initialPose);
      console.log('🚀 [INIT-SYSTEM] state.pose AVANT resetPose:', state.pose);
      
      // *** CORRIGÉ: Forcer la mise à jour de la pose ***
      actions.resetPose(initialPose);
      
      // *** NOUVEAU: Vérifier immédiatement la mise à jour ***
      setTimeout(() => {
        console.log('🚀 [INIT-SYSTEM] state.pose APRÈS resetPose (100ms):', state.pose);
        
        // *** SÉCURITÉ: Forcer la pose si elle n'a pas été mise à jour ***
        if (state.pose.x === 0 && state.pose.y === 0) {
          console.warn('⚠️ [INIT-SYSTEM] Position non mise à jour, forçage...');
          actions.updatePose(initialPose);
          
          setTimeout(() => {
            console.log('🚀 [INIT-SYSTEM] state.pose APRÈS updatePose forcé (200ms):', state.pose);
          }, 100);
        }
      }, 100);
      
      actions.resetTrajectory();
      console.log('🚀 [INIT-SYSTEM] resetTrajectory appelé');
      
      setIsMapLoaded(true);
      console.log('🚀 [INIT-SYSTEM] isMapLoaded défini à true');
      
      console.log(`✅ [INIT-SYSTEM] Système initialisé - Position ciblée: ${defaultPoint.name} (${defaultPoint.worldX.toFixed(2)}, ${defaultPoint.worldY.toFixed(2)})`);
      console.log('🚀 [INIT-SYSTEM] === FIN INITIALISATION ===');
    } catch (error) {
      console.error('❌ [INIT-SYSTEM] Erreur initialisation système:', error);
      Alert.alert('Erreur', 'Impossible d\'initialiser le système de localisation');
    }
  };

  /**
   * Démarrage/arrêt du tracking avec sauvegarde automatique
   */
  const toggleTracking = async () => {
    if (state.isTracking) {
      // *** SUPPRIMÉ: Plus d'arrêt direct, utiliser pauseTracking ou stopTracking ***
      console.warn('⚠️ [TRACKING] Utiliser pauseTracking() ou stopTracking() au lieu de toggleTracking()');
      return;
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
   * *** NOUVEAU: Démarrage du tracking ***
   */
  const startTracking = async () => {
    try {
      console.log('🚀 [START-TRACKING] === DÉMARRAGE DU TRACKING ===');
      
      // *** NOUVEAU: Réinitialiser le compteur de pas au démarrage ***
      lastTotalStepsRef.current = 0;
      console.log('🔄 [START-TRACKING] Compteur de pas réinitialisé à 0');
      
      // Réinitialiser les métriques dans le contexte
      actions.updatePDRMetrics({
        stepCount: 0,
        distance: 0,
        currentMode: 'NATIF',
        energyLevel: 1.0,
        isZUPT: false
      });
      
      setTrackingMode('running');
      actions.setTracking(true);
      await startMotionTracking();
      
      console.log('✅ [START-TRACKING] Tracking démarré avec compteurs réinitialisés');
    } catch (error) {
      console.error('❌ [START-TRACKING] Erreur démarrage:', error);
      setTrackingMode('stopped');
      Alert.alert('Erreur', 'Impossible de démarrer le tracking');
    }
  };

  /**
   * *** NOUVEAU: Pause du tracking (garde la position) ***
   */
  const pauseTracking = async () => {
    try {
      // Sauvegarder la position actuelle
      setPausedPosition({
        x: state.pose.x,
        y: state.pose.y,
        theta: state.pose.theta,
        confidence: state.pose.confidence
      });
      
      setTrackingMode('paused');
      actions.setTracking(false);
      hybridMotionService.stop();
      
      console.log(`⏸️ [TRACKING] Tracking mis en pause à la position (${state.pose.x.toFixed(2)}, ${state.pose.y.toFixed(2)})`);
    } catch (error) {
      console.error('❌ [TRACKING] Erreur mise en pause:', error);
    }
  };

  /**
   * *** NOUVEAU: Reprendre le tracking (depuis la position de pause) ***
   */
  const resumeTracking = async () => {
    try {
      if (pausedPosition) {
        // Restaurer la position de pause
        actions.updatePose(pausedPosition);
        console.log(`▶️ [TRACKING] Reprise du tracking depuis la position (${pausedPosition.x.toFixed(2)}, ${pausedPosition.y.toFixed(2)})`);
      }
      
      setTrackingMode('running');
      actions.setTracking(true);
      await startMotionTracking();
      
      console.log('▶️ [TRACKING] Tracking repris');
    } catch (error) {
      console.error('❌ [TRACKING] Erreur reprise:', error);
      setTrackingMode('paused');
      Alert.alert('Erreur', 'Impossible de reprendre le tracking');
    }
  };

  /**
   * *** NOUVEAU: Arrêt définitif du tracking (termine le trajet) ***
   */
  const stopTracking = async () => {
    try {
      // Arrêter le tracking
      setTrackingMode('stopped');
      actions.setTracking(false);
      hybridMotionService.stop();
      setPausedPosition(null);
      
      // *** NOUVEAU: Sauvegarde automatique à la fin du trajet ***
      const hasTrajectory = state.trajectory && state.trajectory.length > 0;
      
      if (hasTrajectory) {
        if (authState.isAuthenticated) {
          // *** UTILISATEUR CONNECTÉ: Sauvegarde automatique ***
          console.log('🔄 [AUTO-SAVE] Utilisateur connecté - Sauvegarde automatique du trajet');
          try {
            await saveTrajectoryAutomatically();
            Alert.alert('✅ Trajet terminé', 'Votre trajet a été automatiquement sauvegardé dans votre compte.');
          } catch (error) {
            console.error('❌ [AUTO-SAVE] Erreur sauvegarde automatique:', error);
            Alert.alert('⚠️ Erreur de sauvegarde', 'Impossible de sauvegarder automatiquement. Essayez à nouveau.');
          }
        } else {
          // *** UTILISATEUR NON CONNECTÉ: Proposer sauvegarde locale ***
          console.log('💾 [LOCAL-SAVE] Utilisateur non connecté - Proposition de sauvegarde locale');
          setEndTrajectoryModal({
            visible: true,
            trajectoryData: {
              trajectory: state.trajectory,
              stepCount: state.stepCount || 0,
              distance: state.distance || 0,
              startTime: state.trajectory[0]?.timestamp,
              endTime: state.trajectory[state.trajectory.length - 1]?.timestamp
            },
            isLoading: false
          });
        }
      }
      
      console.log('🛑 [TRACKING] Tracking arrêté définitivement');
    } catch (error) {
      console.error('❌ [TRACKING] Erreur arrêt:', error);
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
      
      // *** NOUVEAU: Réinitialiser le service avant de démarrer ***
      console.log('🔄 [MOTION-TRACKING] Réinitialisation du service...');
      await hybridMotionService.reset();
      
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
    
    // *** AMÉLIORATION: Filtrage côté UI similaire à handleHeading ***
    const currentOrientation = continuousOrientationRef.current;
    
    // Filtrage préliminaire basé sur la précision (similaire au service)
    const minAccuracyThreshold = 15;
    if (accuracy > minAccuracyThreshold) {
      console.log(`🧭 [UI-NATIVE] Lecture rejetée - accuracy trop faible: ${accuracy}° > ${minAccuracyThreshold}°`);
      return; // Rejeter cette lecture
    }
    
    if (currentOrientation === null || currentOrientation === undefined) {
      // Première orientation, l'accepter directement
      setContinuousOrientation(headingRadians);
      continuousOrientationRef.current = headingRadians;
    } else {
      // Calculer la différence d'angle en gérant le passage 0°/2π
      let angleDiff = headingRadians - currentOrientation;
      if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      else if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      
      // Rejet des sauts trop importants côté UI
      const maxUIJumpThreshold = Math.PI / 6; // 30° maximum d'un coup
      
      if (Math.abs(angleDiff) > maxUIJumpThreshold) {
        console.log(`🎯 [UI-NATIVE] Saut UI rejeté: ${(angleDiff * 180 / Math.PI).toFixed(1)}° > ${(maxUIJumpThreshold * 180 / Math.PI).toFixed(1)}°`);
        return; // Rejeter cette mise à jour UI
      }
      
      // Lissage UI adaptatif basé sur la précision
      const uiSmoothingAlpha = accuracy < 10 ? 0.3 : 0.1; // Plus réactif si bonne précision
      
      // Appliquer le lissage UI
      const newOrientation = currentOrientation + uiSmoothingAlpha * angleDiff;
      
      setContinuousOrientation(newOrientation);
      continuousOrientationRef.current = newOrientation;
    }
    
    // Mettre à jour les autres états d'orientation
    setOrientationConfidence(accuracy ? Math.max(0, Math.min(1, (100 - accuracy) / 100)) : 0.8);
    setOrientationSource('native_compass');
    setIsOrientationActive(true);
    
    // Mettre à jour la pose dans le contexte
    const currentState = stateRef.current;
    const currentActions = actionsRef.current;
    
    currentActions.updatePose({
      x: currentState.pose.x,
      y: currentState.pose.y,
      theta: continuousOrientationRef.current, // Utiliser l'orientation lissée UI
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

  // *** NOUVEAU: Initialisation de l'apparence ***
  const initializeAppearance = async () => {
    try {
      //console.log('🎨 [MAP-SCREEN] Initialisation de l\'apparence...');
      
      await appearanceService.initialize();
      const config = appearanceService.getConfiguration();
      setAppearanceConfig(config);
      
      // Écouter les changements de configuration
      const unsubscribe = appearanceService.addListener((newConfig) => {
        //console.log('🎨 [MAP-SCREEN] Configuration couleurs mise à jour:', newConfig);
        setAppearanceConfig(newConfig);
      });
      
      console.log('✅ [MAP-SCREEN] Apparence initialisée:', config);
      
      // Retourner la fonction de nettoyage sera gérée par le composant parent
      
    } catch (error) {
      console.error('❌ [MAP-SCREEN] Erreur initialisation apparence:', error);
      // Continuer avec les couleurs par défaut
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
        
        // *** NOUVEAU: Validation des limites de la carte ***
        const SCALE = 3.72;
        const centerX = MAP_TOTAL_WIDTH / 2;
        const centerY = MAP_TOTAL_HEIGHT / 2;
        
        const minWorldX = (0 - centerX) / SCALE;           // ~-1966
        const maxWorldX = (MAP_TOTAL_WIDTH - centerX) / SCALE;  // ~+1966
        const minWorldY = -(MAP_TOTAL_HEIGHT - centerY) / SCALE; // ~-1850
        const maxWorldY = -(0 - centerY) / SCALE;              // ~+1850
        
        if (startX < minWorldX || startX > maxWorldX || startY < minWorldY || startY > maxWorldY) {
          throw new Error(`Coordonnées hors limites de la carte.\nLimites valides:\nX: ${minWorldX.toFixed(0)} à ${maxWorldX.toFixed(0)}\nY: ${minWorldY.toFixed(0)} à ${maxWorldY.toFixed(0)}\nVous avez saisi: (${startX}, ${startY})`);
        }
        
        console.log(`🎯 [STARTING-POINT] Coordonnées personnalisées: (${startX.toFixed(2)}, ${startY.toFixed(2)}) - Validées dans les limites`);
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

      // *** MODIFIÉ: Utiliser la nouvelle fonction startTracking ***
      await startTracking();

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

  /**
   * *** NOUVEAU: Sauvegarde automatique du trajet ***
   */
  const saveTrajectoryAutomatically = async () => {
    try {
      // Sauvegarder dans la carte persistante
      const trajectoryId = await saveTrajectoryToPersistentMap();
      
      // Générer le chemin SVG
      const svgPath = generateSVGPath();
      
      // Préparer les données du trajet avec un nom automatique
      const timestamp = new Date().toLocaleString('fr-FR');
      const trajectoryData = {
        name: `Trajet ${timestamp}`,
        points: state.trajectory,
        svgPath: svgPath,
        stepCount: state.stepCount || 0,
        distance: state.distance || 0,
        duration: 0 // TODO: calculer la durée réelle
      };

      // Sauvegarder via le contexte d'authentification
      const result = await authActions.saveTrajectory(trajectoryData);

      if (!result.success) {
        throw new Error(result.error || 'Erreur de sauvegarde');
      }

      console.log(`✅ [AUTO-SAVE] Trajet sauvegardé automatiquement: ${trajectoryData.name}`);
      
      // Réinitialiser le trajet actuel
      actions.resetTrajectory();
      
      return result;
    } catch (error) {
      console.error('❌ [AUTO-SAVE] Erreur sauvegarde automatique:', error);
      throw error;
    }
  };

  /**
   * *** NOUVEAU: Centrer sur l'utilisateur avec zoom x4.7 ***
   */
  const centerOnUserWithZoom = useCallback(() => {
    if (mapControls.centerOnUser && mapControls.setCustomZoom) {
      // ÉTAPE 1: Définir le zoom à exactement 4.7x
      mapControls.setCustomZoom(4.7);
      
      // ÉTAPE 2: Centrer sur l'utilisateur après le zoom
      setTimeout(() => {
        mapControls.centerOnUser();
      }, 150);
    }
  }, [mapControls.centerOnUser, mapControls.setCustomZoom, state.pose]);

  /**
   * *** NOUVEAU: Ouvrir/fermer la liste d'ajout d'éléments ***
   */
  const toggleAddElementsList = () => {
    setAddElementModal(prev => ({
      ...prev,
      visible: !prev.visible,
      showElementsList: !prev.visible,
      selectedElementType: null,
      elementName: ''
    }));
  };

  /**
   * *** NOUVEAU: Sélectionner un type d'élément à ajouter ***
   */
  const selectElementType = (elementType) => {
    setAddElementModal(prev => ({
      ...prev,
      selectedElementType: elementType,
      showElementsList: false,
      elementName: elementType.requiresName ? '' : elementType.name
    }));
  };

  /**
   * *** NOUVEAU: Confirmer l'ajout d'un élément ***
   */
  const confirmAddElement = async () => {
    const { selectedElementType, elementName } = addElementModal;
    
    if (!selectedElementType) return;
    
    // Vérifier que le nom est fourni si requis
    if (selectedElementType.requiresName && !elementName.trim()) {
      Alert.alert('Nom requis', `Veuillez donner un nom pour ${selectedElementType.name.toLowerCase()}`);
      return;
    }

    setAddElementModal(prev => ({ ...prev, isLoading: true }));

    try {
      // Créer l'élément à la position actuelle de l'utilisateur
      const element = {
        id: `${selectedElementType.id}_${Date.now()}`,
        type: selectedElementType.id,
        name: elementName.trim() || selectedElementType.name,
        icon: selectedElementType.icon,
        color: selectedElementType.color,
        worldX: state.pose.x,
        worldY: state.pose.y,
        pixelX: (state.pose.x * SCALE) + (MAP_TOTAL_WIDTH / 2), // Conversion vers coordonnées pixel
        pixelY: -(state.pose.y * SCALE) + (MAP_TOTAL_HEIGHT / 2), // Conversion vers coordonnées pixel
        timestamp: Date.now(),
        addedBy: authState.user?.id || 'anonymous'
      };

      // Ajouter l'élément à la liste locale
      setUserElements(prev => [...prev, element]);

      // TODO: Sauvegarder dans la carte persistante si nécessaire
      console.log(`✅ [ADD-ELEMENT] Élément ajouté: ${element.name} à (${element.worldX.toFixed(2)}, ${element.worldY.toFixed(2)})`);

      // Fermer le modal
      setAddElementModal({
        visible: false,
        showElementsList: false,
        selectedElementType: null,
        elementName: '',
        isLoading: false
      });

      Alert.alert('✅ Élément ajouté', `${element.name} a été ajouté à votre position actuelle.`);

    } catch (error) {
      console.error('❌ [ADD-ELEMENT] Erreur ajout élément:', error);
      Alert.alert('Erreur', 'Impossible d\'ajouter l\'élément');
      setAddElementModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * *** NOUVEAU: Confirmer la sauvegarde locale à la fin du trajet ***
   */
  const confirmLocalSave = async () => {
    setEndTrajectoryModal(prev => ({ ...prev, isLoading: true }));

    try {
      // Sauvegarder localement dans la carte persistante
      await saveTrajectoryToPersistentMap();
      
      setEndTrajectoryModal({ visible: false, trajectoryData: null, isLoading: false });
      
      Alert.alert('✅ Trajet sauvegardé', 'Votre trajet a été sauvegardé localement sur cet appareil.');
      
      // Réinitialiser le trajet actuel
      actions.resetTrajectory();

    } catch (error) {
      console.error('❌ [LOCAL-SAVE] Erreur sauvegarde locale:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder le trajet localement');
      setEndTrajectoryModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * *** NOUVEAU: Refuser la sauvegarde locale ***
   */
  const declineLocalSave = () => {
    setEndTrajectoryModal({ visible: false, trajectoryData: null, isLoading: false });
    
    // Réinitialiser le trajet actuel sans sauvegarder
    actions.resetTrajectory();
    
    console.log('❌ [LOCAL-SAVE] Trajet non sauvegardé à la demande de l\'utilisateur');
  };

  /**
   * *** NOUVEAU: Basculer le menu flottant animé ***
   */
  const toggleFloatingMenu = () => {
    const toValue = isFloatingMenuOpen ? 0 : 1;
    
    setIsFloatingMenuOpen(!isFloatingMenuOpen);
    
    // Animation du menu
    Animated.parallel([
      Animated.spring(menuAnimation, {
        toValue,
        tension: 80,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(rotationAnimation, {
        toValue,
        duration: 300,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
        useNativeDriver: true,
      }),
    ]).start();
    
    // Fermer le menu d'ajout d'éléments si ouvert
    if (addElementModal.visible) {
      setAddElementModal({
        visible: false,
        showElementsList: false,
        selectedElementType: null,
        elementName: '',
        isLoading: false
      });
    }
  };

  if (!isMapLoaded) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="map" size={64} color="#00ff88" />
          <Text style={styles.loadingText}>Initialisation de la carte...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* *** NOUVEAU: Carte avec système de tuiles pour afficher la carte entière *** */}
      <TiledMapView
        persistentMapService={persistentMapService}
        currentTrajectory={state.trajectory}
        userPosition={state.pose}
        userOrientation={continuousOrientation}
        userElements={userElements}
        onViewportChange={handleViewportChange}
        initialZoom={initialZoom}
        initialCenterPoint={defaultPoint}
        appearanceConfig={appearanceConfig}
      />

      {/* Métriques en temps réel */}
      {renderMetrics()}

      {/* *** NOUVEAU: Système de bouton flottant animé *** */}
      <View style={styles.floatingMenuContainer}>
        {/* Boutons secondaires en arc autour du bouton principal */}
        <>
          {/* *** BOUTON MÉTRIQUES *** */}
          {!isMetricsPanelVisible && (
            <Animated.View style={[
              styles.floatingSecondaryButton, 
              styles.floatingButton1,
              {
                transform: [
                  { 
                    translateX: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -85] // Arc position 1
                    })
                  },
                  { 
                    translateY: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -45] // Arc position 1
                    })
                  },
                  { 
                    scale: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1]
                    })
                  }
                ],
                opacity: menuAnimation
              }
            ]}>
              <TouchableOpacity 
                style={styles.floatingButtonInner}
                onPress={toggleMetricsPanel}
              >
                <Ionicons name="eye" size={20} color="#ffffff" />
              </TouchableOpacity>
            </Animated.View>
          )}
          
          {/* *** BOUTON START/PAUSE TRACKING *** */}
          <Animated.View style={[
            styles.floatingSecondaryButton, 
            styles.floatingButton2,
            trackingMode === 'running' && styles.floatingButtonActive,
            {
              transform: [
                { 
                  translateX: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -35] // Arc position 2
                  })
                },
                { 
                  translateY: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -90] // Arc position 2
                  })
                },
                { 
                  scale: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1]
                  })
                }
              ],
              opacity: menuAnimation
            }
          ]}>
            <TouchableOpacity
              style={styles.floatingButtonInner}
              onPress={() => {
                if (trackingMode === 'stopped') {
                  toggleTracking(); // Ouvre le modal de point de départ
                } else if (trackingMode === 'running') {
                  pauseTracking();
                } else if (trackingMode === 'paused') {
                  resumeTracking();
                }
              }}
            >
              <Ionicons 
                name={
                  trackingMode === 'stopped' ? "play" :
                  trackingMode === 'running' ? "pause" : 
                  "play" // paused
                } 
                size={20} 
                color={trackingMode === 'running' ? "#000000" : "#ffffff"} 
              />
            </TouchableOpacity>
          </Animated.View>
          
          {/* *** BOUTON STOP (visible seulement si tracking actif ou en pause) *** */}
          {(trackingMode === 'running' || trackingMode === 'paused') && (
            <Animated.View style={[
              styles.floatingSecondaryButton, 
              styles.floatingButtonStop,
              {
                transform: [
                  { 
                    translateX: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 35] // Arc position 3 (centre)
                    })
                  },
                  { 
                    translateY: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -90] // Arc position 3 (centre)
                    })
                  },
                  { 
                    scale: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1]
                    })
                  }
                ],
                opacity: menuAnimation
              }
            ]}>
              <TouchableOpacity
                style={styles.floatingButtonInner}
                onPress={stopTracking}
              >
                <Ionicons 
                  name="stop" 
                  size={20} 
                  color="#ffffff" 
                />
              </TouchableOpacity>
            </Animated.View>
          )}
          
          
          {/* *** BOUTON AJOUT D'ÉLÉMENTS *** */}
          <Animated.View style={[
            styles.floatingSecondaryButton, 
            styles.floatingButton4,
            addElementModal.visible && styles.floatingButtonActive,
            {
              transform: [
                { 
                  translateX: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, trackingMode === 'stopped' ? 85 : 95] // Arc position finale
                  })
                },
                { 
                  translateY: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, trackingMode === 'stopped' ? -45 : -15] // Arc position finale
                  })
                },
                { 
                  scale: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1]
                  })
                }
              ],
              opacity: menuAnimation
            }
          ]}>
            <TouchableOpacity 
              style={styles.floatingButtonInner}
              onPress={toggleAddElementsList}
            >
              <Ionicons 
                name={addElementModal.visible ? "close" : "add"} 
                size={20} 
                color={addElementModal.visible ? "#000000" : "#ffffff"} 
              />
            </TouchableOpacity>
          </Animated.View>
        </>
        
        {/* Bouton principal flottant */}
        <Animated.View style={[
          styles.floatingMainButton,
          {
            transform: [
              { 
                rotate: rotationAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '45deg']
                })
              }
            ]
          }
        ]}>
          <TouchableOpacity
            style={styles.floatingButtonInner}
            onPress={toggleFloatingMenu}
          >
            <Ionicons 
              name={isFloatingMenuOpen ? "close" : "menu"} 
              size={28} 
              color="#ffffff"
            />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* *** NOUVEAU: Menu flottant d'ajout d'éléments *** */}
      {addElementModal.visible && (
        <View style={styles.addElementsMenu}>
          {addElementModal.showElementsList ? (
            // Liste des types d'éléments
            <View style={styles.elementsListContainer}>
              <Text style={styles.elementsListTitle}>Ajouter un élément</Text>
              <Text style={styles.elementsListSubtitle}>📍 Position: ({state.pose.x.toFixed(1)}, {state.pose.y.toFixed(1)})</Text>
              
              {availableElements.map(element => (
                <TouchableOpacity
                  key={element.id}
                  style={styles.elementTypeButton}
                  onPress={() => selectElementType(element)}
                >
                  <View style={[styles.elementIcon, { backgroundColor: element.color }]}>
                    <Ionicons name={element.icon} size={20} color="#ffffff" />
                  </View>
                  <Text style={styles.elementTypeName}>{element.name}</Text>
                  {element.requiresName && (
                    <Ionicons name="create" size={16} color="#ffaa00" />
                  )}
                </TouchableOpacity>
              ))}
              
              {/* *** NOUVEAU: Bouton Annuler *** */}
              <TouchableOpacity
                style={styles.elementCancelTypeButton}
                onPress={() => setAddElementModal({ visible: false, showElementsList: false, selectedElementType: null, elementName: '', isLoading: false })}
              >
                <View style={[styles.elementIcon, { backgroundColor: '#ff4444' }]}>
                  <Ionicons name="close" size={20} color="#ffffff" />
                </View>
                <Text style={styles.elementCancelTypeName}>Annuler</Text>
              </TouchableOpacity>
            </View>
          ) : addElementModal.selectedElementType ? (
            // Formulaire de saisie du nom (si requis)
            <View style={styles.elementFormContainer}>
              <View style={styles.elementFormHeader}>
                <View style={[styles.elementIcon, { backgroundColor: addElementModal.selectedElementType.color }]}>
                  <Ionicons name={addElementModal.selectedElementType.icon} size={20} color="#ffffff" />
                </View>
                <Text style={styles.elementFormTitle}>{addElementModal.selectedElementType.name}</Text>
              </View>
              
              <Text style={styles.elementFormPosition}>
                📍 Position: ({state.pose.x.toFixed(1)}, {state.pose.y.toFixed(1)})
              </Text>
              
              {addElementModal.selectedElementType.requiresName && (
                <View style={styles.elementNameInputContainer}>
                  <Text style={styles.elementNameLabel}>Nom :</Text>
                  <TextInput
                    style={styles.elementNameInput}
                    value={addElementModal.elementName}
                    onChangeText={(text) => setAddElementModal(prev => ({ ...prev, elementName: text }))}
                    placeholder={`Nom de ${addElementModal.selectedElementType.name.toLowerCase()}`}
                    placeholderTextColor="#666666"
                    returnKeyType="done"
                    onSubmitEditing={confirmAddElement}
                  />
                </View>
              )}
              
              <View style={styles.elementFormActions}>
                <TouchableOpacity
                  style={styles.elementCancelButton}
                  onPress={() => setAddElementModal(prev => ({ ...prev, showElementsList: true, selectedElementType: null }))}
                >
                  <Text style={styles.elementCancelButtonText}>Retour</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.elementConfirmButton, addElementModal.isLoading && styles.disabledButton]}
                  onPress={confirmAddElement}
                  disabled={addElementModal.isLoading}
                >
                  {addElementModal.isLoading ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <Text style={styles.elementConfirmButtonText}>Ajouter</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      )}

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
                    <Ionicons name="keypad" size={16} color="#00ff88" />
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

      {/* *** NOUVEAU: Modal de sauvegarde locale à la fin du trajet *** */}
      <Modal
        visible={endTrajectoryModal.visible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.endTrajectoryModalOverlay}>
          <View style={styles.endTrajectoryModalContent}>
            <View style={styles.endTrajectoryHeader}>
              <Ionicons name="flag-outline" size={32} color="#ffaa00" />
              <Text style={styles.endTrajectoryTitle}>Trajet terminé</Text>
            </View>
            
            <Text style={styles.endTrajectoryMessage}>
              Votre trajet contient {endTrajectoryModal.trajectoryData?.trajectory?.length || 0} points 
              pour une distance de {(endTrajectoryModal.trajectoryData?.distance || 0).toFixed(1)}m
            </Text>
            
            <Text style={styles.endTrajectorySubtitle}>
              💾 Souhaitez-vous sauvegarder ce trajet localement sur cet appareil ?
            </Text>
            
            <View style={styles.endTrajectoryActions}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={declineLocalSave}
                disabled={endTrajectoryModal.isLoading}
              >
                <Text style={styles.declineButtonText}>Non, supprimer</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.saveButton, endTrajectoryModal.isLoading && styles.disabledButton]}
                onPress={confirmLocalSave}
                disabled={endTrajectoryModal.isLoading}
              >
                {endTrajectoryModal.isLoading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.saveButtonText}>Oui, sauvegarder</Text>
                )}
              </TouchableOpacity>
            </View>
            
            <Text style={styles.endTrajectoryNote}>
              💡 Connectez-vous pour bénéficier de la sauvegarde automatique
            </Text>
          </View>
        </View>
      </Modal>

      {/* *** NOUVEAU: Bouton de position fixe (sorti du menu flottant) *** */}
      <View style={styles.positionButtonContainer}>
        <TouchableOpacity 
          style={styles.positionButton}
          onPress={centerOnUserWithZoom}
        >
          <Ionicons name="locate" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 0, // Supprime tout padding en haut
    paddingBottom: 0, // Supprime tout padding en bas
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
  addElementsMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  elementsListContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 20,
    margin: 20,
    minWidth: 300,
    borderWidth: 2,
    borderColor: '#00ff88',
    alignItems: 'center',
  },
  elementsListTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  elementsListSubtitle: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  elementTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
    borderWidth: 2,
    borderColor: '#ffaa00',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  elementIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  elementTypeName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  elementFormContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 20,
    margin: 20,
    minWidth: 300,
    borderWidth: 2,
    borderColor: '#00ff88',
    alignItems: 'center',
  },
  elementFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  elementFormTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  elementFormPosition: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  elementNameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  elementNameLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 5,
  },
  elementNameInput: {
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    textAlign: 'center',
  },
  elementFormActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  elementCancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 2,
    borderColor: '#ff4444',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  elementCancelButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  elementConfirmButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  elementConfirmButtonText: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: 'bold',
  },
  endTrajectoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endTrajectoryModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 25,
    margin: 20,
    maxWidth: 300,
    width: '90%',
    borderWidth: 2,
    borderColor: '#ffaa00',
    maxHeight: '80%',
  },
  endTrajectoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'center',
  },
  endTrajectoryTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  endTrajectoryMessage: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
    fontFamily: 'monospace',
  },
  endTrajectorySubtitle: {
    color: '#ffaa00',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  endTrajectoryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 15,
  },
  declineButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 2,
    borderColor: '#ff4444',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  declineButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: 'bold',
  },
  endTrajectoryNote: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  elementCancelTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 2,
    borderColor: '#ff4444',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  elementCancelTypeName: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  floatingMenuContainer: {
    position: 'absolute',
    bottom: 10, // Petit espace en bas
    left: '50%',
    transform: [{ translateX: -30 }], // -30 pour centrer un bouton de 60px
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingSecondaryButton: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#00ff88',
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingButtonInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
  },
  floatingButton1: {
    backgroundColor: '#0088ff', // Bleu pour métriques
  },
  floatingButton2: {
    backgroundColor: '#00ff88', // Vert principal pour play/pause
  },
  floatingButton3: {
    backgroundColor: '#ffaa00', // Orange pour position
  },
  floatingButton4: {
    backgroundColor: '#ff6b35', // Orange-rouge pour ajout d'éléments
  },
  floatingButtonActive: {
    backgroundColor: '#ffffff', // Blanc quand actif
  },
  floatingMainButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00ff88', // Vert principal
    borderWidth: 3,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  floatingMainButtonActive: {
    backgroundColor: '#ff4444',
  },
  floatingButtonStop: {
    backgroundColor: '#ff4444', // Rouge pour stop
  },
  positionButtonContainer: {
    position: 'absolute',
    top: 40, // Descendu de 30px (était 10, maintenant 40)
    right: 10, // Petit espace à droite
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  positionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 