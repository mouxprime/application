import { NativeModulesProxy } from 'expo-modules-core';

// Import the native module. On web, it will be resolved to ExpoNativePedometerModule.web.ts
// and on native platforms to ExpoNativePedometerModule.ts
import ExpoNativePedometerModule from './ExpoNativePedometerModule';

import { PedometerStatus } from './index';

export default ExpoNativePedometerModule; 