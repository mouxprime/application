import { NativeModulesProxy } from 'expo-modules-core';

import { PedometerStatus } from './index';

export default NativeModulesProxy.ExpoNativePedometerModule as {
  isAvailable(): Promise<boolean>;
  startStepLengthTracking(): Promise<void>;
  stopStepLengthTracking(): Promise<void>;
  getStatus(): Promise<PedometerStatus>;
  reset(): Promise<void>;
}; 