import { jest } from '@jest/globals';

// Mock du module natif
const mockExpoNativePedometer = {
  isAvailable: jest.fn(),
  startStepLengthTracking: jest.fn(),
  stopStepLengthTracking: jest.fn(),
  getStatus: jest.fn(),
  reset: jest.fn(),
  addStepLengthListener: jest.fn(),
};

// Mock d'Expo Pedometer
const mockPedometer = {
  isAvailableAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  watchStepCount: jest.fn(),
};

// Mock d'Expo Location
const mockLocation = {
  requestForegroundPermissionsAsync: jest.fn(),
  watchHeadingAsync: jest.fn(),
  LocationAccuracy: { High: 1 },
};

// Mock de Platform
const mockPlatform = {
  OS: 'ios',
};

jest.mock('../../modules/expo-native-pedometer/src/index', () => mockExpoNativePedometer);
jest.mock('expo-sensors', () => ({ Pedometer: mockPedometer }));
jest.mock('expo-location', () => mockLocation);
jest.mock('react-native', () => ({ Platform: mockPlatform }));

import NativeEnhancedMotionService from '../services/NativeEnhancedMotionService';

describe('NativeEnhancedMotionService', () => {
  let motionService;
  let mockOnStep;
  let mockOnHeading;

  beforeEach(() => {
    // Reset des mocks
    jest.clearAllMocks();
    
    // Callbacks mock
    mockOnStep = jest.fn();
    mockOnHeading = jest.fn();
    
    // Création du service
    motionService = new NativeEnhancedMotionService(mockOnStep, mockOnHeading);
  });

  afterEach(async () => {
    if (motionService && motionService.isRunning) {
      await motionService.stop();
    }
  });

  describe('Initialisation', () => {
    test('devrait créer une instance avec les callbacks', () => {
      expect(motionService).toBeDefined();
      expect(motionService.onStep).toBe(mockOnStep);
      expect(motionService.onHeading).toBe(mockOnHeading);
      expect(motionService.isRunning).toBe(false);
    });

    test('devrait initialiser les métriques par défaut', () => {
      const stats = motionService.getStats();
      expect(stats.metrics.averageStepLength).toBe(0.79);
      expect(stats.metrics.nativeAvailable).toBe(false);
      expect(stats.metrics.usingNativeStepLength).toBe(false);
    });
  });

  describe('Mode natif iOS', () => {
    beforeEach(() => {
      mockPlatform.OS = 'ios';
      mockExpoNativePedometer.isAvailable.mockResolvedValue(true);
      mockExpoNativePedometer.startStepLengthTracking.mockResolvedValue();
      mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockLocation.watchHeadingAsync.mockResolvedValue({ remove: jest.fn() });
    });

    test('devrait démarrer en mode natif sur iOS', async () => {
      await motionService.start();

      expect(mockExpoNativePedometer.isAvailable).toHaveBeenCalled();
      expect(mockExpoNativePedometer.addStepLengthListener).toHaveBeenCalled();
      expect(mockExpoNativePedometer.startStepLengthTracking).toHaveBeenCalled();
      expect(motionService.isRunning).toBe(true);
      
      const stats = motionService.getStats();
      expect(stats.metrics.nativeAvailable).toBe(true);
      expect(stats.metrics.usingNativeStepLength).toBe(true);
    });

    test('devrait traiter les événements de pas natifs', async () => {
      let stepLengthListener;
      mockExpoNativePedometer.addStepLengthListener.mockImplementation((callback) => {
        stepLengthListener = callback;
        return { remove: jest.fn() };
      });

      await motionService.start();

      // Simulation d'un événement de pas natif
      const nativeStepEvent = {
        stepLength: 0.85,
        totalSteps: 100,
        totalDistance: 85.0,
        timestamp: Date.now()
      };

      stepLengthListener(nativeStepEvent);

      expect(mockOnStep).toHaveBeenCalledWith(
        expect.objectContaining({
          stepLength: 0.85,
          totalSteps: 100,
          totalDistance: 85.0,
          source: 'native_cmpedometer',
          nativeStepLength: 0.85,
          confidence: 0.95
        })
      );
    });
  });

  describe('Mode fallback', () => {
    beforeEach(() => {
      mockExpoNativePedometer.isAvailable.mockResolvedValue(false);
      mockPedometer.isAvailableAsync.mockResolvedValue(true);
      mockPedometer.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockLocation.watchHeadingAsync.mockResolvedValue({ remove: jest.fn() });
    });

    test('devrait basculer vers le mode fallback si natif indisponible', async () => {
      await motionService.start();

      expect(mockExpoNativePedometer.isAvailable).toHaveBeenCalled();
      expect(mockPedometer.isAvailableAsync).toHaveBeenCalled();
      expect(mockPedometer.requestPermissionsAsync).toHaveBeenCalled();
      expect(mockPedometer.watchStepCount).toHaveBeenCalled();
      
      const stats = motionService.getStats();
      expect(stats.metrics.nativeAvailable).toBe(false);
      expect(stats.metrics.usingNativeStepLength).toBe(false);
    });

    test('devrait traiter les pas en mode fallback', async () => {
      let pedometerCallback;
      mockPedometer.watchStepCount.mockImplementation((callback) => {
        pedometerCallback = callback;
        return { remove: jest.fn() };
      });

      await motionService.start();

      // Simulation de pas Expo Pedometer
      pedometerCallback({ steps: 5 }); // 5 nouveaux pas

      expect(mockOnStep).toHaveBeenCalledTimes(5);
      expect(mockOnStep).toHaveBeenCalledWith(
        expect.objectContaining({
          stepLength: 0.79, // Longueur par défaut
          source: 'fallback_expo',
          nativeStepLength: null,
          confidence: 0.7
        })
      );
    });
  });

  describe('Gestion de l\'orientation', () => {
    beforeEach(() => {
      mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockLocation.watchHeadingAsync.mockResolvedValue({ remove: jest.fn() });
    });

    test('devrait traiter les données d\'orientation', async () => {
      let headingCallback;
      mockLocation.watchHeadingAsync.mockImplementation((callback, options) => {
        headingCallback = callback;
        return { remove: jest.fn() };
      });

      await motionService.start();

      // Simulation de données d'orientation
      const headingData = {
        trueHeading: 45.5,
        accuracy: 5.0,
        timestamp: Date.now()
      };

      headingCallback(headingData);

      expect(mockOnHeading).toHaveBeenCalledWith(
        expect.objectContaining({
          yaw: expect.any(Number),
          accuracy: 5.0,
          rawHeading: 45.5,
          filteredHeading: 45.5,
          source: 'compass'
        })
      );
    });

    test('devrait filtrer l\'orientation avec gestion du passage 0°/360°', async () => {
      let headingCallback;
      mockLocation.watchHeadingAsync.mockImplementation((callback, options) => {
        headingCallback = callback;
        return { remove: jest.fn() };
      });

      await motionService.start();

      // Premier heading à 350°
      headingCallback({ trueHeading: 350, accuracy: 5, timestamp: Date.now() });
      
      // Deuxième heading à 10° (passage 0°/360°)
      headingCallback({ trueHeading: 10, accuracy: 5, timestamp: Date.now() });

      expect(mockOnHeading).toHaveBeenCalledTimes(2);
      
      // Vérifier que le filtrage gère correctement le passage
      const lastCall = mockOnHeading.mock.calls[1][0];
      expect(lastCall.filteredHeading).toBeCloseTo(350, 0); // Devrait rester proche de 350
    });
  });

  describe('Gestion des erreurs', () => {
    test('devrait gérer l\'erreur si aucun podomètre disponible', async () => {
      mockExpoNativePedometer.isAvailable.mockResolvedValue(false);
      mockPedometer.isAvailableAsync.mockResolvedValue(false);

      await expect(motionService.start()).rejects.toThrow('Aucun podomètre disponible');
    });

    test('devrait gérer l\'erreur de permissions refusées', async () => {
      mockExpoNativePedometer.isAvailable.mockResolvedValue(false);
      mockPedometer.isAvailableAsync.mockResolvedValue(true);
      mockPedometer.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });

      await expect(motionService.start()).rejects.toThrow('Permissions podomètre refusées');
    });

    test('devrait basculer vers fallback si erreur mode natif', async () => {
      mockPlatform.OS = 'ios';
      mockExpoNativePedometer.isAvailable.mockResolvedValue(true);
      mockExpoNativePedometer.startStepLengthTracking.mockRejectedValue(new Error('Erreur native'));
      
      // Configuration fallback
      mockPedometer.isAvailableAsync.mockResolvedValue(true);
      mockPedometer.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockLocation.watchHeadingAsync.mockResolvedValue({ remove: jest.fn() });

      await motionService.start();

      // Devrait avoir basculé vers le fallback
      expect(mockPedometer.watchStepCount).toHaveBeenCalled();
      
      const stats = motionService.getStats();
      expect(stats.metrics.usingNativeStepLength).toBe(false);
    });
  });

  describe('Méthodes utilitaires', () => {
    test('devrait réinitialiser correctement', async () => {
      mockExpoNativePedometer.reset.mockResolvedValue();
      
      await motionService.reset();

      expect(motionService.stepCount).toBe(0);
      expect(motionService.filteredYaw).toBeNull();
      expect(motionService.metrics.totalSteps).toBe(0);
      expect(motionService.metrics.totalDistance).toBe(0);
    });

    test('devrait arrêter tous les services', async () => {
      const mockNativeSub = { remove: jest.fn() };
      const mockPedoSub = { remove: jest.fn() };
      const mockHeadingSub = { remove: jest.fn() };

      mockExpoNativePedometer.addStepLengthListener.mockReturnValue(mockNativeSub);
      mockPedometer.watchStepCount.mockReturnValue(mockPedoSub);
      mockLocation.watchHeadingAsync.mockResolvedValue(mockHeadingSub);
      mockExpoNativePedometer.isAvailable.mockResolvedValue(true);
      mockExpoNativePedometer.startStepLengthTracking.mockResolvedValue();
      mockExpoNativePedometer.stopStepLengthTracking.mockResolvedValue();
      mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });

      await motionService.start();
      await motionService.stop();

      expect(mockNativeSub.remove).toHaveBeenCalled();
      expect(mockHeadingSub.remove).toHaveBeenCalled();
      expect(mockExpoNativePedometer.stopStepLengthTracking).toHaveBeenCalled();
      expect(motionService.isRunning).toBe(false);
    });

    test('devrait retourner les statistiques complètes', () => {
      const stats = motionService.getStats();

      expect(stats).toHaveProperty('stepCount');
      expect(stats).toHaveProperty('filteredYaw');
      expect(stats).toHaveProperty('sessionDuration');
      expect(stats).toHaveProperty('metrics');
      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('platform');
      
      expect(stats.metrics).toHaveProperty('totalSteps');
      expect(stats.metrics).toHaveProperty('totalDistance');
      expect(stats.metrics).toHaveProperty('averageStepLength');
      expect(stats.metrics).toHaveProperty('nativeAvailable');
      expect(stats.metrics).toHaveProperty('usingNativeStepLength');
    });
  });
}); 