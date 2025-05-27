import React, { createContext, useContext, useReducer, useCallback } from 'react';

// État initial du système de localisation
const initialState = {
  // Position actuelle [x, y, θ]
  pose: {
    x: 0,         // Position X en mètres
    y: 0,         // Position Y en mètres
    theta: 0,     // Orientation en radians
    confidence: 0 // Niveau de confiance (0-1)
  },
  
  // Données des capteurs
  sensors: {
    accelerometer: { x: 0, y: 0, z: 0 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 0, y: 0, z: 0 },
    timestamp: Date.now()
  },
  
  // Carte vectorielle chargée
  vectorMap: null,
  
  // Landmarks détectés
  landmarks: [],
  
  // Historique de trajectoire
  trajectory: [],
  
  // État du système
  isCalibrating: false,
  isTracking: false,
  lastUpdate: Date.now(),
  
  // Calibration d'orientation poche (statique - legacy)
  pocketCalibration: {
    isCalibrated: false,
    rotationMatrix: null,
    avgGravity: null,
    calibrationDate: null
  },
  
  // Suivi d'attitude continu (nouveau système)
  attitude: {
    quaternion: { w: 1, x: 0, y: 0, z: 0 },
    isStable: false,
    stabilityDuration: 0,
    accelerationVariance: 0,
    gyroMagnitude: 0,
    magneticConfidence: 0,
    isRecalibrating: false,
    lastRecalibration: 0,
    bodyToPhoneMatrix: null,
    phoneToBodyMatrix: null
  },
  
  // Métriques PDR
  currentMode: 'stationary',
  stepCount: 0,
  distance: 0,
  sampleRate: 25,
  energyLevel: 1.0,
  isZUPT: false,
  
  // Paramètres de l'algorithme
  settings: {
    updateRate: 50,           // Hz
    kalmanProcessNoise: 0.1,
    kalmanMeasurementNoise: 0.5,
    deadReckoningThreshold: 0.05, // m/s²
    headingSmoothing: 0.9,
    trajectoryMaxLength: 5000
  }
};

// Actions du reducer
const ACTIONS = {
  UPDATE_POSE: 'UPDATE_POSE',
  UPDATE_SENSORS: 'UPDATE_SENSORS',
  LOAD_VECTOR_MAP: 'LOAD_VECTOR_MAP',
  ADD_LANDMARK: 'ADD_LANDMARK',
  ADD_TRAJECTORY_POINT: 'ADD_TRAJECTORY_POINT',
  SET_CALIBRATING: 'SET_CALIBRATING',
  SET_TRACKING: 'SET_TRACKING',
  RESET_TRAJECTORY: 'RESET_TRAJECTORY',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  RESET_POSE: 'RESET_POSE',
  UPDATE_PDR_METRICS: 'UPDATE_PDR_METRICS',
  SET_POCKET_CALIBRATION_MATRIX: 'SET_POCKET_CALIBRATION_MATRIX',
  UPDATE_ATTITUDE: 'UPDATE_ATTITUDE',
  SET_ATTITUDE_RECALIBRATION: 'SET_ATTITUDE_RECALIBRATION'
};

// Reducer pour gérer l'état
function localizationReducer(state, action) {
  switch (action.type) {
    case ACTIONS.UPDATE_POSE:
      return {
        ...state,
        pose: {
          ...state.pose,
          ...action.payload
        },
        lastUpdate: Date.now()
      };
      
    case ACTIONS.UPDATE_SENSORS:
      return {
        ...state,
        sensors: {
          ...action.payload,
          timestamp: Date.now()
        }
      };
      
    case ACTIONS.LOAD_VECTOR_MAP:
      return {
        ...state,
        vectorMap: action.payload
      };
      
    case ACTIONS.ADD_LANDMARK:
      return {
        ...state,
        landmarks: [...state.landmarks, action.payload]
      };
      
    case ACTIONS.ADD_TRAJECTORY_POINT:
      const newTrajectory = [...state.trajectory, action.payload];
      return {
        ...state,
        trajectory: newTrajectory.slice(-state.settings.trajectoryMaxLength)
      };
      
    case ACTIONS.SET_CALIBRATING:
      return {
        ...state,
        isCalibrating: action.payload
      };
      
    case ACTIONS.SET_TRACKING:
      return {
        ...state,
        isTracking: action.payload
      };
      
    case ACTIONS.RESET_TRAJECTORY:
      return {
        ...state,
        trajectory: []
      };
      
    case ACTIONS.UPDATE_SETTINGS:
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload
        }
      };
      
    case ACTIONS.RESET_POSE:
      return {
        ...state,
        pose: {
          x: action.payload?.x || 0,
          y: action.payload?.y || 0,
          theta: action.payload?.theta || 0,
          confidence: 0
        },
        trajectory: []
      };
      
    case ACTIONS.UPDATE_PDR_METRICS:
      return {
        ...state,
        ...action.payload
      };
      
    case ACTIONS.SET_POCKET_CALIBRATION_MATRIX:
      return {
        ...state,
        pocketCalibration: {
          isCalibrated: true,
          rotationMatrix: action.payload.rotationMatrix,
          avgGravity: action.payload.avgGravity,
          calibrationDate: new Date().toISOString()
        }
      };
      
    case ACTIONS.UPDATE_ATTITUDE:
      return {
        ...state,
        attitude: {
          ...state.attitude,
          ...action.payload
        }
      };
      
    case ACTIONS.SET_ATTITUDE_RECALIBRATION:
      return {
        ...state,
        attitude: {
          ...state.attitude,
          bodyToPhoneMatrix: action.payload.rotationMatrix,
          phoneToBodyMatrix: action.payload.phoneToBodyMatrix,
          lastRecalibration: action.payload.timestamp,
          isRecalibrating: false
        }
      };
      
    default:
      return state;
  }
}

// Contexte de localisation
const LocalizationContext = createContext();

// Provider du contexte
export function LocalizationProvider({ children }) {
  const [state, dispatch] = useReducer(localizationReducer, initialState);
  
  // Actions utilitaires
  const actions = {
    updatePose: useCallback((pose) => {
      dispatch({ type: ACTIONS.UPDATE_POSE, payload: pose });
    }, []),
    
    updateSensors: useCallback((sensorData) => {
      dispatch({ type: ACTIONS.UPDATE_SENSORS, payload: sensorData });
    }, []),
    
    loadVectorMap: useCallback((mapData) => {
      dispatch({ type: ACTIONS.LOAD_VECTOR_MAP, payload: mapData });
    }, []),
    
    addLandmark: useCallback((landmark) => {
      dispatch({ type: ACTIONS.ADD_LANDMARK, payload: landmark });
    }, []),
    
    addTrajectoryPoint: useCallback((point) => {
      dispatch({ type: ACTIONS.ADD_TRAJECTORY_POINT, payload: point });
    }, []),
    
    setCalibrating: useCallback((isCalibrating) => {
      dispatch({ type: ACTIONS.SET_CALIBRATING, payload: isCalibrating });
    }, []),
    
    setTracking: useCallback((isTracking) => {
      dispatch({ type: ACTIONS.SET_TRACKING, payload: isTracking });
    }, []),
    
    resetTrajectory: useCallback(() => {
      dispatch({ type: ACTIONS.RESET_TRAJECTORY });
    }, []),
    
    updateSettings: useCallback((settings) => {
      dispatch({ type: ACTIONS.UPDATE_SETTINGS, payload: settings });
    }, []),
    
    resetPose: useCallback((initialPose) => {
      dispatch({ type: ACTIONS.RESET_POSE, payload: initialPose });
    }, []),
    
    updatePDRMetrics: useCallback((metrics) => {
      dispatch({ type: ACTIONS.UPDATE_PDR_METRICS, payload: metrics });
    }, []),
    
    setPocketCalibrationMatrix: useCallback((rotationMatrix, avgGravity) => {
      dispatch({ 
        type: ACTIONS.SET_POCKET_CALIBRATION_MATRIX, 
        payload: { rotationMatrix, avgGravity } 
      });
    }, []),
    
    updateAttitude: useCallback((attitudeData) => {
      dispatch({ type: ACTIONS.UPDATE_ATTITUDE, payload: attitudeData });
    }, []),
    
    setAttitudeRecalibration: useCallback((rotationMatrix, phoneToBodyMatrix, timestamp) => {
      dispatch({ 
        type: ACTIONS.SET_ATTITUDE_RECALIBRATION, 
        payload: { rotationMatrix, phoneToBodyMatrix, timestamp } 
      });
    }, [])
  };
  
  return (
    <LocalizationContext.Provider value={{ state, actions }}>
      {children}
    </LocalizationContext.Provider>
  );
}

// Hook pour utiliser le contexte
export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
}

export { ACTIONS }; 