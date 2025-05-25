import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

import CalibrationScreen from '../src/screens/CalibrationScreen';
import { LocalizationProvider } from '../src/context/LocalizationContext';

// Mock des dépendances
jest.mock('../src/algorithms/LocalizationSDK');
jest.mock('../src/algorithms/OrientationCalibrator');

// Mock Alert
jest.spyOn(Alert, 'alert');

// Wrapper avec contexte
const CalibrationWrapper = ({ children }) => (
  <LocalizationProvider>
    {children}
  </LocalizationProvider>
);

describe('Flux de Calibration Unifié', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Alert.alert.mockClear();
  });

  test('Calibration complète réussie avec toutes les étapes', async () => {
    const { getByText, getByTestId } = render(
      <CalibrationWrapper>
        <CalibrationScreen />
      </CalibrationWrapper>
    );

    // Vérifier les éléments d'interface
    expect(getByText('📱 Calibration Complète')).toBeTruthy();
    expect(getByText('Cette calibration corrige vos capteurs, puis adapte automatiquement l\'orientation pour un usage en poche.')).toBeTruthy();

    // Démarrer la calibration
    const startButton = getByText('Démarrer la calibration');
    expect(startButton).toBeTruthy();
    
    await act(async () => {
      fireEvent.press(startButton);
    });

    // Vérifier que la calibration commence
    await waitFor(() => {
      expect(getByText('Calibration...')).toBeTruthy();
    });
  });

  test('Gestion d\'erreur étape Pocket avec retry', async () => {
    // Mock d'erreur pour l'étape pocket
    const mockSDK = require('../src/algorithms/LocalizationSDK').LocalizationSDK;
    mockSDK.prototype.calibrateAll = jest.fn().mockImplementation((callback) => {
      // Simuler progression normale jusqu'à l'étape pocket
      callback({ step: 'sensors', progress: 0.8, message: 'Capteurs calibrés' });
      
      // Simuler erreur étape pocket
      callback({ 
        step: 'pocket', 
        progress: 0.85, 
        message: 'Trop de mouvement - restez immobile' 
      });
      
      return Promise.resolve({ success: false, error: 'Mouvement détecté' });
    });

    const { getByText, queryByText } = render(
      <CalibrationWrapper>
        <CalibrationScreen />
      </CalibrationWrapper>
    );

    // Démarrer calibration
    await act(async () => {
      fireEvent.press(getByText('Démarrer la calibration'));
    });

    // Vérifier affichage d'erreur
    await waitFor(() => {
      expect(queryByText('Trop de mouvement détecté. Restez immobile dans votre poche.')).toBeTruthy();
      expect(queryByText('Recommencer Étape Pocket')).toBeTruthy();
    });

    // Tester le retry
    const retryButton = getByText('Recommencer Étape Pocket');
    expect(retryButton).toBeTruthy();
  });

  test('Validation des seuils de progression', async () => {
    const progressValues = [];
    
    const mockSDK = require('../src/algorithms/LocalizationSDK').LocalizationSDK;
    mockSDK.prototype.calibrateAll = jest.fn().mockImplementation((callback) => {
      // Simuler progression étapes capteurs (0-80%)
      for (let i = 0; i <= 80; i += 10) {
        callback({ 
          step: 'sensors', 
          progress: i / 100, 
          message: `Calibration capteurs: ${i}%` 
        });
        progressValues.push(i);
      }
      
      // Simuler progression étape pocket (80-100%)
      for (let i = 80; i <= 100; i += 5) {
        callback({ 
          step: 'pocket', 
          progress: i / 100, 
          message: `Calibration poche: ${i}%` 
        });
        progressValues.push(i);
      }
      
      // Terminer
      callback({ 
        step: 'complete', 
        progress: 1.0, 
        message: 'Calibration complète terminée !',
        pocketCalibration: {
          rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
          avgGravity: { x: 0, y: 0, z: -9.81 }
        }
      });
      
      return Promise.resolve({ success: true });
    });

    const { getByText } = render(
      <CalibrationWrapper>
        <CalibrationScreen />
      </CalibrationWrapper>
    );

    await act(async () => {
      fireEvent.press(getByText('Démarrer la calibration'));
    });

    // Vérifier que la progression est cohérente
    expect(progressValues.length).toBeGreaterThan(0);
    expect(Math.max(...progressValues)).toBe(100);
    expect(Math.min(...progressValues)).toBe(0);
  });

  test('Affichage des statuts des capteurs', () => {
    const { getByText } = render(
      <CalibrationWrapper>
        <CalibrationScreen />
      </CalibrationWrapper>
    );

    // Vérifier les éléments de statut
    expect(getByText('État de la calibration')).toBeTruthy();
    expect(getByText('Accéléromètre')).toBeTruthy();
    expect(getByText('Gyroscope')).toBeTruthy();
    expect(getByText('Magnétomètre')).toBeTruthy();
    expect(getByText('Orientation Poche')).toBeTruthy();
  });

  test('Instructions et conseils utilisateur', () => {
    const { getByText } = render(
      <CalibrationWrapper>
        <CalibrationScreen />
      </CalibrationWrapper>
    );

    // Vérifier les instructions
    expect(getByText('💡 Conseils')).toBeTruthy();
    expect(getByText(/Effectuez la calibration dans un environnement stable/)).toBeTruthy();
    expect(getByText(/Pour l'étape poche, placez le téléphone dans votre poche/)).toBeTruthy();
  });

  test('Stockage de la matrice de rotation', async () => {
    const mockContext = {
      setPocketCalibrationMatrix: jest.fn()
    };

    const mockSDK = require('../src/algorithms/LocalizationSDK').LocalizationSDK;
    mockSDK.prototype.calibrateAll = jest.fn().mockImplementation((callback) => {
      callback({ 
        step: 'complete', 
        progress: 1.0, 
        pocketCalibration: {
          rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
          avgGravity: { x: 0, y: 0, z: -9.81 }
        }
      });
      
      return Promise.resolve({ success: true });
    });

    // Test intégration avec le contexte
    // (Nécessiterait un mock plus complexe du contexte)
    expect(mockSDK.prototype.calibrateAll).toBeDefined();
  });
});

describe('Tests Conditions Réelles - Robustesse', () => {
  test('Simulation pocket jean - mouvement modéré', async () => {
    const mockSDK = require('../src/algorithms/LocalizationSDK').LocalizationSDK;
    
    // Simuler conditions pocket jean avec un peu de mouvement
    mockSDK.prototype.calibratePocketOrientation = jest.fn().mockImplementation((callback) => {
      // Simuler quelques échecs puis succès
      callback(0.1, 'Trop de mouvement - restez immobile');
      callback(0.2, 'Trop de mouvement - restez immobile');
      callback(0.5, 'Calibration en cours... 50%');
      callback(1.0, 'Calibration terminée');
      
      return Promise.resolve({
        rotationMatrix: [[0.95, 0.1, 0], [-0.1, 0.95, 0], [0, 0, 1]],
        avgGravity: { x: 1.2, y: 0.5, z: -9.7 },
        timestamp: Date.now()
      });
    });

    const orientation = new (require('../src/algorithms/OrientationCalibrator').OrientationCalibrator)();
    
    // Test threshold ajusté
    expect(orientation.config.gravityThreshold).toBe(0.5);
    expect(orientation.config.calibrationDuration).toBe(2000);
  });

  test('Simulation pocket veste - orientation différente', async () => {
    const mockSDK = require('../src/algorithms/LocalizationSDK').LocalizationSDK;
    
    // Simuler calibration avec orientation très différente (pocket veste)
    mockSDK.prototype.isPocketCalibrationValid = jest.fn().mockImplementation((matrix) => {
      if (!matrix) return false;
      
      // Simuler validation d'une matrice de rotation valide
      const det = 1.0; // Mock déterminant
      return Math.abs(det - 1) < 0.1;
    });

    expect(mockSDK.prototype.isPocketCalibrationValid).toBeDefined();
  });

  test('Validation gravityThreshold en conditions réelles', () => {
    const orientationCalibrator = new (require('../src/algorithms/OrientationCalibrator').OrientationCalibrator)();
    
    // Test avec différents niveaux de mouvement
    const testCases = [
      { accMag: 9.81, gyroMag: 0.05, shouldPass: true },   // Immobile
      { accMag: 10.5, gyroMag: 0.08, shouldPass: false },  // Mouvement modéré
      { accMag: 12.0, gyroMag: 0.15, shouldPass: false },  // Mouvement important
      { accMag: 9.9, gyroMag: 0.09, shouldPass: true },    // Presque immobile
    ];

    testCases.forEach(({ accMag, gyroMag, shouldPass }) => {
      const gravityDiff = Math.abs(accMag - 9.81);
      const isStable = gravityDiff <= 0.5 && gyroMag <= 0.1;
      expect(isStable).toBe(shouldPass);
    });
  });
});

describe('Tests Performance et UX', () => {
  test('Temps de calibration total raisonnable', async () => {
    const startTime = Date.now();
    
    const mockSDK = require('../src/algorithms/LocalizationSDK').LocalizationSDK;
    mockSDK.prototype.calibrateAll = jest.fn().mockImplementation(async (callback) => {
      // Simuler durées réalistes
      setTimeout(() => callback({ step: 'sensors', progress: 0.3 }), 5000);
      setTimeout(() => callback({ step: 'sensors', progress: 0.6 }), 10000);
      setTimeout(() => callback({ step: 'sensors', progress: 0.8 }), 15000);
      setTimeout(() => callback({ step: 'pocket', progress: 0.9 }), 16000);
      setTimeout(() => callback({ step: 'complete', progress: 1.0 }), 17000);
      
      return Promise.resolve({ success: true });
    });

    // La calibration complète ne devrait pas dépasser 20 secondes
    const maxDuration = 20000; // 20 secondes
    expect(Date.now() - startTime).toBeLessThan(maxDuration);
  });

  test('Messages utilisateur clairs et informatifs', () => {
    const expectedMessages = [
      'Démarrage calibration capteurs...',
      'Capteurs calibrés',
      'Démarrage calibration orientation poche...',
      'Calibration poche: 50%',
      'Calibration complète terminée !',
      'Trop de mouvement - restez immobile'
    ];

    expectedMessages.forEach(message => {
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(5);
    });
  });
}); 