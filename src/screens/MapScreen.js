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
  Platform,
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
    minPointDistance: 0.10,       // *** RÉDUIT: Distance minimum entre points (10cm au lieu de 15cm) ***
    outlierThreshold: 2.0,        // *** AUGMENTÉ: Seuil pour détecter les points aberrants (2m au lieu de 1.5m) ***
    maxConsecutiveOutliers: 3,    // *** AUGMENTÉ: Maximum de points aberrants consécutifs (3 au lieu de 2) ***
    smoothingFactor: 0.2          // *** RÉDUIT: Facteur de lissage (0.2 = 20% au lieu de 30%) ***
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
    
    // *** NOUVEAU: Initialiser l'apparence ***
    initializeAppearance();
    
    // *** NOUVEAU: Démarrer la boussole native indépendante ***
    startNativeCompass();
    
    // *** NOUVEAU: Exposer l'utilitaire de test globalement ***
    if (typeof window !== 'undefined') {
      // *** SUPPRIMÉ: Référence à compassFilteringTest qui n'existe plus ***
      // window.compassTest = compassFilteringTest;
      // console.log(`🧭 [COMPASS-TEST] Utilitaire de test disponible globalement: window.compassTest`);
      // console.log(`🧭 [COMPASS-TEST] Tapez "window.compassTest.help()" dans la console pour voir l'aide`);
      
      // *** NOUVEAU: Exposer les outils de diagnostic ***
      window.stepDiagnostics = {
        // Obtenir les diagnostics complets
        getDiagnostics: () => hybridMotionService.getDiagnostics(),
        
        // Afficher les diagnostics formatés
        printDiagnostics: () => hybridMotionService.printDiagnostics(),
        
        // Obtenir les statistiques de filtrage des pas
        getStepStats: () => hybridMotionService.getStepFilteringStats(),
        
        // Obtenir les statistiques de la boussole
        getCompassStats: () => hybridMotionService.getCompassFilteringStats(),
        
        // Configurer le filtrage des pas
        configureStepFiltering: (options) => hybridMotionService.configureStepFiltering(options),
        
        // Configurer le filtrage de la boussole
        configureCompassFiltering: (options) => hybridMotionService.configureCompassFiltering(options),
        
        // Réinitialiser les statistiques
        resetStats: () => hybridMotionService.resetStepFilteringStats(),
        
        // Aide
        help: () => {
          console.log(`
🔍 === OUTILS DE DIAGNOSTIC DES PAS ===

Commandes disponibles:
• window.stepDiagnostics.printDiagnostics() - Afficher un diagnostic complet
• window.stepDiagnostics.getStepStats() - Statistiques de filtrage des pas
• window.stepDiagnostics.getCompassStats() - Statistiques de la boussole

Configuration:
• window.stepDiagnostics.configureStepFiltering({
    minStepDistance: 0.2,      // Distance minimum (mètres)
    minConfidenceThreshold: 0.15, // Confiance minimum (0-1)
    minStepInterval: 150       // Intervalle minimum (ms)
  })

• window.stepDiagnostics.configureCompassFiltering({
    accuracyThreshold: 10,     // Seuil de précision (degrés)
    jumpThreshold: 40          // Seuil de saut (degrés)
  })

Exemples pour résoudre les problèmes courants:
• Trop de pas rejetés (>30%): 
  window.stepDiagnostics.configureStepFiltering({ minStepDistance: 0.2, minConfidenceThreshold: 0.15 })
  
• Pas trop courts (<40cm):
  Vérifiez le profil utilisateur ou forcez une longueur:
  window.stepDiagnostics.configureStepFiltering({ minStepDistance: 0.15 })
  
• Boussole instable:
  window.stepDiagnostics.configureCompassFiltering({ accuracyThreshold: 20, jumpThreshold: 60 })
          `);
        }
      };
      
      console.log(`🔍 [STEP-DIAGNOSTICS] Outils de diagnostic disponibles: window.stepDiagnostics`);
      console.log(`🔍 [STEP-DIAGNOSTICS] Tapez "window.stepDiagnostics.help()" pour voir l'aide`);
      console.log(`🔍 [STEP-DIAGNOSTICS] Diagnostic automatique dans 3 secondes...`);
      
      // *** Diagnostic automatique après 3 secondes ***
      setTimeout(() => {
        if (hybridMotionService.isRunning) {
          console.log(`🔍 [AUTO-DIAGNOSTIC] Diagnostic automatique du système:`);
          hybridMotionService.printDiagnostics();
        }
      }, 3000);
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
   * *** NOUVEAU: Initialisation de l'apparence ***
   */
  const initializeAppearance = async () => {
    try {
      await appearanceService.initialize();
      const config = appearanceService.getConfiguration();
      setAppearanceConfig(config);
      console.log('✅ [INIT-APPEARANCE] Configuration d\'apparence initialisée');
    } catch (error) {
      console.error('❌ [INIT-APPEARANCE] Erreur initialisation configuration:', error);
      // Ne pas bloquer l'initialisation si l'apparence échoue
      setAppearanceConfig(null);
    }
  };

  /**
   * *** NOUVEAU: Démarrage du tracking avec sauvegarde automatique
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
   * *** NOUVEAU: Mettre en pause le tracking (conserve la position) ***
   */
  const pauseTracking = async () => {
    try {
      console.log('⏸️ [TRACKING] Mise en pause du tracking...');
      
      // *** CORRIGÉ: Utiliser la nouvelle méthode pause() du service ***
      const pauseSuccess = hybridMotionService.pause();
      
      if (pauseSuccess) {
        // Sauvegarder également la position dans le state local (pour compatibilité)
        setPausedPosition({
          x: state.pose.x,
          y: state.pose.y,
          theta: state.pose.theta,
          confidence: state.pose.confidence
        });
        
        setTrackingMode('paused');
        actions.setTracking(false);
        
        const savedState = hybridMotionService.getSavedState();
        console.log(`⏸️ [TRACKING] Tracking mis en pause avec état sauvegardé:`);
        console.log(`  Position UI: (${state.pose.x.toFixed(2)}, ${state.pose.y.toFixed(2)})`);
        console.log(`  Position Service: (${savedState.position.x.toFixed(2)}, ${savedState.position.y.toFixed(2)})`);
        console.log(`  Distance totale: ${savedState.totalDistance.toFixed(2)}m`);
        console.log(`  Pas totaux: ${savedState.stepCount}`);
      } else {
        throw new Error('Impossible de mettre en pause le service de motion');
      }
      
    } catch (error) {
      console.error('❌ [TRACKING] Erreur mise en pause:', error);
      Alert.alert('Erreur', 'Impossible de mettre en pause le tracking: ' + error.message);
    }
  };

  /**
   * *** NOUVEAU: Reprendre le tracking (depuis la position de pause) ***
   */
  const resumeTracking = async () => {
    try {
      console.log('▶️ [TRACKING] Reprise du tracking...');
      
      // *** CORRIGÉ: Utiliser la nouvelle méthode resume() du service ***
      const resumeSuccess = hybridMotionService.resume();
      
      if (resumeSuccess) {
        const restoredState = hybridMotionService.getSavedState();
        
        // Restaurer la position dans le state local si on a une position de pause
        if (pausedPosition) {
          actions.updatePose(pausedPosition);
          console.log(`▶️ [TRACKING] Position UI restaurée depuis pause: (${pausedPosition.x.toFixed(2)}, ${pausedPosition.y.toFixed(2)})`);
        }
        
        setTrackingMode('running');
        actions.setTracking(true);
        
        console.log(`▶️ [TRACKING] Tracking repris avec état restauré:`);
        console.log(`  Position Service: (${restoredState.position.x.toFixed(2)}, ${restoredState.position.y.toFixed(2)})`);
        console.log(`  Distance totale: ${restoredState.totalDistance.toFixed(2)}m`);
        console.log(`  Pas totaux: ${restoredState.stepCount}`);
        console.log('✅ [TRACKING] Reprise réussie - la position est conservée');
      } else {
        throw new Error('Impossible de reprendre le service de motion');
      }
      
    } catch (error) {
      console.error('❌ [TRACKING] Erreur reprise:', error);
      setTrackingMode('paused');
      Alert.alert('Erreur', 'Impossible de reprendre le tracking: ' + error.message);
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
   * *** MODIFIÉ: Confirmer sauvegarde avec options locale et cloud ***
   */
  const confirmLocalSave = async () => {
    setEndTrajectoryModal(prev => ({ ...prev, isLoading: true }));

    try {
      const trajectoryData = endTrajectoryModal.trajectoryData;
      let saveResults = { local: false, cloud: false };
      
      // 1. Toujours sauvegarder localement
      try {
        await saveTrajectoryToPersistentMap();
        saveResults.local = true;
        console.log('✅ [SAVE] Sauvegarde locale réussie');
      } catch (localError) {
        console.error('❌ [LOCAL-SAVE] Erreur sauvegarde locale:', localError);
      }
      
      // 2. Essayer de sauvegarder dans le cloud si utilisateur connecté
      try {
        // Vérifier si Supabase est disponible et utilisateur connecté
        const { supabaseService } = await import('../services/SupabaseService');
        
        if (supabaseService.isAuthenticated()) {
          console.log('☁️ [SAVE] Sauvegarde cloud en cours...');
          
          const cloudTrajectory = {
            name: `Trajet ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
            description: `Trajet enregistré depuis l'application PDR Navigation`,
            trajectory: trajectoryData.trajectory,
            stepCount: trajectoryData.stepCount,
            distance: trajectoryData.distance,
            duration: trajectoryData.endTime - trajectoryData.startTime,
            startTime: new Date(trajectoryData.startTime).toISOString(),
            endTime: new Date(trajectoryData.endTime).toISOString(),
            algorithmVersion: '2.0',
            deviceInfo: {
              platform: Platform.OS,
              timestamp: Date.now()
            },
            accuracyStats: {
              totalSteps: trajectoryData.stepCount,
              avgStepLength: trajectoryData.distance / Math.max(trajectoryData.stepCount, 1)
            }
          };
          
          await supabaseService.saveTrajectory(cloudTrajectory);
          saveResults.cloud = true;
          console.log('✅ [SAVE] Sauvegarde cloud réussie');
        } else {
          console.log('ℹ️ [SAVE] Utilisateur non connecté - pas de sauvegarde cloud');
        }
      } catch (cloudError) {
        console.warn('⚠️ [CLOUD-SAVE] Erreur sauvegarde cloud:', cloudError.message);
        // Ne pas bloquer si la sauvegarde cloud échoue
      }
      
      setEndTrajectoryModal({ visible: false, trajectoryData: null, isLoading: false });
      
      // Message de confirmation adapté selon les résultats
      let message = '';
      if (saveResults.local && saveResults.cloud) {
        message = 'Trajet sauvegardé localement et synchronisé avec le cloud ☁️';
      } else if (saveResults.local) {
        message = 'Trajet sauvegardé localement. Connectez-vous pour synchroniser avec le cloud.';
      } else {
        message = 'Erreur lors de la sauvegarde. Veuillez réessayer.';
      }
      
      Alert.alert('💾 Trajet sauvegardé', message);
      
      // Réinitialiser le trajet actuel
      actions.resetTrajectory();

    } catch (error) {
      console.error('❌ [SAVE] Erreur sauvegarde générale:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder le trajet');
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

  /**
   * *** NOUVEAU: Démarrage du tracking de movement ***
   */
  const startMotionTracking = async () => {
    try {
      console.log('🚀 [MOTION] Démarrage du tracking de movement...');
      
      if (!hybridMotionService) {
        throw new Error('Service de motion non disponible');
      }
      
      await hybridMotionService.start();
      console.log('✅ [MOTION] Tracking de movement démarré');
    } catch (error) {
      console.error('❌ [MOTION] Erreur démarrage tracking:', error);
      throw error;
    }
  };

  /**
   * *** NOUVEAU: Sauvegarde automatique du trajet ***
   */
  const saveTrajectoryAutomatically = async () => {
    try {
      console.log('💾 [AUTO-SAVE] Sauvegarde automatique du trajet...');
      
      if (!state.trajectory || state.trajectory.length === 0) {
        throw new Error('Aucune trajectoire à sauvegarder');
      }
      
      // Import dynamic pour éviter les dépendances circulaires
      const { supabaseService } = await import('../services/SupabaseService');
      
      const trajectoryData = {
        name: `Trajet ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        description: `Trajet enregistré automatiquement depuis l'application PDR Navigation`,
        trajectory: state.trajectory,
        stepCount: state.stepCount || 0,
        distance: state.distance || 0,
        duration: state.trajectory.length > 0 ? 
          (state.trajectory[state.trajectory.length - 1].timestamp - state.trajectory[0].timestamp) : 0,
        startTime: state.trajectory[0]?.timestamp ? new Date(state.trajectory[0].timestamp).toISOString() : new Date().toISOString(),
        endTime: state.trajectory[state.trajectory.length - 1]?.timestamp ? 
          new Date(state.trajectory[state.trajectory.length - 1].timestamp).toISOString() : new Date().toISOString(),
        algorithmVersion: '2.0',
        deviceInfo: {
          platform: Platform.OS,
          timestamp: Date.now()
        },
        accuracyStats: {
          totalSteps: state.stepCount || 0,
          avgStepLength: (state.distance || 0) / Math.max(state.stepCount || 1, 1)
        }
      };
      
      await supabaseService.saveTrajectory(trajectoryData);
      console.log('✅ [AUTO-SAVE] Trajet sauvegardé automatiquement');
    } catch (error) {
      console.error('❌ [AUTO-SAVE] Erreur sauvegarde automatique:', error);
      throw error;
    }
  };

  /**
   * *** NOUVEAU: Sauvegarde locale dans la carte persistante ***
   */
  const saveTrajectoryToPersistentMap = async () => {
    try {
      console.log('💾 [LOCAL-SAVE] Sauvegarde locale dans la carte persistante...');
      
      if (!state.trajectory || state.trajectory.length === 0) {
        throw new Error('Aucune trajectoire à sauvegarder');
      }
      
      if (!persistentMapService) {
        throw new Error('Service de carte persistante non disponible');
      }
      
      // Sauvegarder la trajectoire dans le service de carte persistante
      const trajectoryName = `Trajet_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await persistentMapService.saveTrajectory(trajectoryName, state.trajectory);
      
      console.log('✅ [LOCAL-SAVE] Trajet sauvegardé localement');
    } catch (error) {
      console.error('❌ [LOCAL-SAVE] Erreur sauvegarde locale:', error);
      throw error;
    }
  };

  /**
   * *** NOUVEAU: Gestion des changements de viewport ***
   */
  const handleViewportChange = useCallback((viewport) => {
    setViewportInfo(viewport);
  }, []);

  /**
   * *** NOUVEAU: Sélectionner un point prédéfini ***
   */
  const selectPredefinedPoint = (point) => {
    setStartingPointModal(prev => ({
      ...prev,
      selectedPoint: point,
      customX: '',
      customY: ''
    }));
  };

  /**
   * *** NOUVEAU: Utiliser des coordonnées personnalisées ***
   */
  const useCustomCoordinates = () => {
    setStartingPointModal(prev => ({
      ...prev,
      selectedPoint: null
    }));
  };

  /**
   * *** NOUVEAU: Confirmer le point de départ ***
   */
  const confirmStartingPoint = async () => {
    setStartingPointModal(prev => ({ ...prev, isLoading: true }));

    try {
      let targetPosition;

      if (startingPointModal.selectedPoint) {
        // Utiliser un point prédéfini
        targetPosition = {
          x: startingPointModal.selectedPoint.worldX,
          y: startingPointModal.selectedPoint.worldY,
          theta: 0,
          confidence: 0.8
        };
      } else {
        // Utiliser des coordonnées personnalisées
        const customX = parseFloat(startingPointModal.customX);
        const customY = parseFloat(startingPointModal.customY);

        if (isNaN(customX) || isNaN(customY)) {
          Alert.alert('Erreur', 'Veuillez entrer des coordonnées valides');
          return;
        }

        targetPosition = {
          x: customX,
          y: customY,
          theta: 0,
          confidence: 0.8
        };
      }

      // Mettre à jour la position dans le contexte
      actions.updatePose(targetPosition);
      actions.resetTrajectory();

      // Fermer le modal
      setStartingPointModal({
        visible: false,
        selectedPoint: null,
        customX: '',
        customY: '',
        isLoading: false
      });

      // Démarrer le tracking
      await startTracking();

    } catch (error) {
      console.error('❌ [STARTING-POINT] Erreur confirmation point de départ:', error);
      Alert.alert('Erreur', 'Impossible de définir le point de départ');
      setStartingPointModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * *** NOUVEAU: Basculer l'affichage du panneau de métriques ***
   */
  const toggleMetricsPanel = () => {
    setIsMetricsPanelVisible(!isMetricsPanelVisible);
  };

  /**
   * *** NOUVEAU: Démarrer la boussole native ***
   */
  const startNativeCompass = async () => {
    try {
      console.log('🧭 [NATIVE-COMPASS] Démarrage de la boussole native...');
      setIsNativeCompassActive(true);
    } catch (error) {
      console.error('❌ [NATIVE-COMPASS] Erreur démarrage boussole native:', error);
    }
  };

  /**
   * *** NOUVEAU: Arrêter la boussole native ***
   */
  const stopNativeCompass = () => {
    try {
      console.log('🧭 [NATIVE-COMPASS] Arrêt de la boussole native...');
      if (nativeCompassSubscription) {
        nativeCompassSubscription.remove();
        setNativeCompassSubscription(null);
      }
      setIsNativeCompassActive(false);
    } catch (error) {
      console.error('❌ [NATIVE-COMPASS] Erreur arrêt boussole native:', error);
    }
  };

  /**
   * *** NOUVEAU: Rendu du panneau de métriques ***
   */
  const renderMetrics = () => {
    if (!isMetricsPanelVisible) return null;

    return (
      <View style={styles.metricsPanel}>
        <View style={styles.metricsPanelHeader}>
          <Text style={styles.metricsPanelTitle}>Métriques en temps réel</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={toggleMetricsPanel}
          >
            <Ionicons name="eye-off" size={16} color="#00ff88" />
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Position</Text>
            <Text style={styles.metricValue}>
              {state.pose.x.toFixed(1)}, {state.pose.y.toFixed(1)}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Orientation</Text>
            <Text style={styles.metricValue}>
              {((continuousOrientation * 180) / Math.PI).toFixed(0)}°
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Pas</Text>
            <Text style={styles.metricValue}>{state.stepCount || 0}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>
              {(state.distance || 0).toFixed(1)}m
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Confiance</Text>
            <Text style={styles.metricValue}>
              {(orientationConfidence * 100).toFixed(0)}%
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Batterie</Text>
            <Text style={styles.metricValue}>
              {(batteryLevel * 100).toFixed(0)}%
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Trajectoire</Text>
            <Text style={styles.metricValue}>
              {state.trajectory?.length || 0} pts
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Source</Text>
            <Text style={styles.metricValue}>{orientationSource}</Text>
          </View>
        </View>
      </View>
    );
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