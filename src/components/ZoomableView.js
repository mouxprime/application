import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withDecay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

export default function ZoomableView({ children, onZoomChange, minZoom = 0.5, maxZoom = 20 }) {
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Fonction pour notifier le changement de zoom
  const notifyZoomChange = (newScale) => {
    if (onZoomChange) {
      onZoomChange(newScale);
    }
  };

  // Gestion du pinch (zoom)
  const pinchHandler = useAnimatedGestureHandler({
    onStart: (_, ctx) => {
      ctx.startScale = scale.value;
    },
    onActive: (e, ctx) => {
      const newScale = Math.max(minZoom, Math.min(maxZoom, ctx.startScale * e.scale));
      scale.value = newScale;
      focalX.value = e.focalX;
      focalY.value = e.focalY;
      
      // Notifier le changement de zoom
      runOnJS(notifyZoomChange)(newScale);
    },
    onEnd: () => {
      // Limites min/max avec animation
      if (scale.value < minZoom) {
        scale.value = withTiming(minZoom);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        runOnJS(notifyZoomChange)(minZoom);
      } else if (scale.value > maxZoom) {
        scale.value = withTiming(maxZoom);
        runOnJS(notifyZoomChange)(maxZoom);
      }
      
      // Retour au centre si zoom = 1
      if (scale.value === 1) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      }
    },
  });

  // Gestion du pan (déplacement)
  const panHandler = useAnimatedGestureHandler({
    onStart: (_, ctx) => {
      ctx.startX = translateX.value;
      ctx.startY = translateY.value;
    },
    onActive: (e, ctx) => {
      // Sensibilité réduite pour le pan
      const sensitivity = 0.8;
      translateX.value = ctx.startX + (e.translationX * sensitivity);
      translateY.value = ctx.startY + (e.translationY * sensitivity);
    },
    onEnd: (e) => {
      // Inertie douce
      const damping = 0.7;
      translateX.value = withDecay({ 
        velocity: e.velocityX * damping,
        deceleration: 0.998
      });
      translateY.value = withDecay({ 
        velocity: e.velocityY * damping,
        deceleration: 0.998
      });
    },
  });

  // Style animé combiné
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      // Translate au centre du pinch
      { translateX: focalX.value },
      { translateY: focalY.value },
      // Zoom
      { scale: scale.value },
      // Remettre l'origine au coin supérieur gauche
      { translateX: -focalX.value },
      { translateY: -focalY.value },
      // Déplacement libre
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={styles.container}>
      <PinchGestureHandler onGestureEvent={pinchHandler}>
        <Animated.View style={styles.flex}>
          <PanGestureHandler onGestureEvent={panHandler}>
            <Animated.View style={[styles.flex, animatedStyle]}>
              {children}
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000000' 
  },
  flex: { 
    flex: 1 
  },
}); 