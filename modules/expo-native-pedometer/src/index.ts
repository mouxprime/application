import { NativeModulesProxy, EventEmitter, Subscription } from 'expo-modules-core';

// Import the native module. On web, it will be resolved to ExpoNativePedometer.web.ts
// and on native platforms to ExpoNativePedometerModule.ts
import ExpoNativePedometerModule from './ExpoNativePedometerModule';

export interface StepLengthUpdateEvent {
  stepLength: number;
  totalSteps: number;
  totalDistance: number;
  timestamp: number;
}

export interface PedometerStatus {
  isAvailable: boolean;
  isRunning: boolean;
  hasPermissions: boolean;
}

class ExpoNativePedometer extends EventEmitter {
  /**
   * Vérifie si CMPedometer est disponible sur l'appareil
   */
  async isAvailable(): Promise<boolean> {
    return await ExpoNativePedometerModule.isAvailable();
  }

  /**
   * Démarre le suivi des pas avec CMPedometer
   */
  async startStepLengthTracking(): Promise<void> {
    return await ExpoNativePedometerModule.startStepLengthTracking();
  }

  /**
   * Arrête le suivi des pas
   */
  async stopStepLengthTracking(): Promise<void> {
    return await ExpoNativePedometerModule.stopStepLengthTracking();
  }

  /**
   * Obtient le statut actuel du podomètre
   */
  async getStatus(): Promise<PedometerStatus> {
    return await ExpoNativePedometerModule.getStatus();
  }

  /**
   * Remet à zéro les compteurs
   */
  async reset(): Promise<void> {
    return await ExpoNativePedometerModule.reset();
  }

  /**
   * S'abonne aux mises à jour de longueur de pas
   */
  addStepLengthListener(listener: (event: StepLengthUpdateEvent) => void): Subscription {
    return this.addListener('onStepLengthUpdate', listener);
  }
}

export default new ExpoNativePedometer(); 