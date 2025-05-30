import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, Text, PanResponder, Dimensions } from 'react-native';
import Svg, { G, Rect, Line, Path, Circle, Text as SvgText } from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * Composant de carte avec système de tuiles et navigation tactile
 * =============================================================
 * 
 * Affiche une carte de 14629px × 13764px avec un système de tuiles
 * qui se chargent dynamiquement selon le zoom et la position.
 * 
 * Navigation tactile : déplacement avec les doigts + boutons de zoom.
 * Points d'intérêt : points nommés sur la carte.
 */

export default function TiledMapView({ 
  persistentMapService, 
  currentTrajectory, 
  userPosition, 
  userOrientation,
  onViewportChange,
  initialZoom = 0.1,
  initialCenterPoint = null,
  appearanceConfig = null
}) {
  // Dimensions de la carte complète
  const MAP_TOTAL_WIDTH = 14629;
  const MAP_TOTAL_HEIGHT = 13764;
  const SCALE = 3.72; // pixels par mètre
  
  // Taille des tuiles (en pixels)
  const TILE_SIZE = 512;
  
  // *** NOUVEAU: Extraire les couleurs de la configuration ou utiliser les valeurs par défaut ***
  const colors = {
    background: appearanceConfig?.backgroundColor || '#000000',
    trajectory: appearanceConfig?.trajectoryColor || '#00ff00',
    grid: appearanceConfig?.gridColor || '#333333',
    user: appearanceConfig?.userColor || '#00ff00',
    orientation: appearanceConfig?.orientationColor || '#ff0088',
    pointsOfInterest: appearanceConfig?.pointsOfInterestColor || '#ff6b35'
  };
  
  // États du viewport
  const [zoom, setZoom] = useState(4.03);
  const [panX, setPanX] = useState(-49590);
  const [panY, setPanY] = useState(-10231);
  
  // *** NOUVEAU: Refs pour maintenir les valeurs actuelles du pan ET du zoom ***
  const panXRef = useRef(-49590);
  const panYRef = useRef(-10231);
  const zoomRef = useRef(4.03); // *** NOUVEAU: Ref pour le zoom ***
  
  // *** NOUVEAU: Synchroniser les refs avec les états ***
  useEffect(() => {
    panXRef.current = panX;
    panYRef.current = panY;
    zoomRef.current = zoom; // *** NOUVEAU: Synchroniser le zoom ***
  }, [panX, panY, zoom]);
  
  // Limites de zoom
  const MIN_ZOOM = 0.25; // *** CORRIGÉ: Zoom minimum plus élevé pour empêcher de voir hors carte ***
  const MAX_ZOOM = 15;   // *** CORRIGÉ: Zoom maximum réduit à 15x ***
  
  // Cache des tuiles
  const [loadedTiles, setLoadedTiles] = useState(new Map());
  const [visibleTiles, setVisibleTiles] = useState([]);
  
  // Points d'intérêt prédéfinis
  const [pointsOfInterest] = useState([
    {
      id: 'entree_fifi',
      name: 'Entrée Fifi',
      x: 12364, // Coordonnées en pixels
      y: 2612,
      worldX: (12364 - MAP_TOTAL_WIDTH / 2) / SCALE, // Conversion en coordonnées monde
      worldY: -(2612 - MAP_TOTAL_HEIGHT / 2) / SCALE,
      color: '#ff6b35',
      description: 'Point d\'entrée principal'
    }
  ]);
  
  // Refs pour la navigation tactile - SIMPLIFIÉ
  const panStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  // *** NOUVEAU: Fonction pour définir le zoom depuis l'extérieur ***
  const setCustomZoom = useCallback((newZoom) => {
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    setZoom(clampedZoom);
    console.log(`🔍 [TILED-MAP] Zoom défini: ${clampedZoom.toFixed(3)}x`);
  }, []);

  // *** NOUVEAU: Fonction pour contraindre le pan dans les limites de la carte ***
  const constrainPan = useCallback((newPanX, newPanY, currentZoom) => {
    // *** CORRIGÉ: Contraintes adaptatives selon le zoom pour éviter les blocages ***
    
    // Taille de la carte à l'échelle actuelle
    const scaledMapWidth = MAP_TOTAL_WIDTH * currentZoom;
    const scaledMapHeight = MAP_TOTAL_HEIGHT * currentZoom;
    
    // Taille de l'écran disponible
    const availableWidth = screenWidth;
    const availableHeight = screenHeight - 200;
    
    // *** NOUVEAU: Marge adaptative selon le zoom ***
    // Plus le zoom est élevé, plus on permet de liberté de mouvement
    const dynamicMargin = Math.min(100, Math.max(20, currentZoom * 10));
    
    // Calculer les limites avec marges adaptatives
    let minPanX, maxPanX, minPanY, maxPanY;
    
    if (scaledMapWidth <= availableWidth) {
      // Carte plus petite que l'écran → permettre mouvement autour du centre
      const centerOffset = (availableWidth - scaledMapWidth) / 2;
      const margin = Math.min(100, availableWidth * 0.2); // 20% de l'écran max
      minPanX = centerOffset - margin;
      maxPanX = centerOffset + margin;
    } else {
      // Carte plus grande que l'écran → contraintes avec marge dynamique
      minPanX = availableWidth - scaledMapWidth - dynamicMargin;
      maxPanX = dynamicMargin;
    }
    
    if (scaledMapHeight <= availableHeight) {
      // Carte plus petite que l'écran → permettre mouvement autour du centre
      const centerOffset = (availableHeight - scaledMapHeight) / 2;
      const margin = Math.min(100, availableHeight * 0.2); // 20% de l'écran max
      minPanY = centerOffset - margin;
      maxPanY = centerOffset + margin;
    } else {
      // Carte plus grande que l'écran → contraintes avec marge dynamique
      minPanY = availableHeight - scaledMapHeight - dynamicMargin;
      maxPanY = dynamicMargin;
    }
    
    // Contraindre les valeurs
    const constrainedPanX = Math.max(minPanX, Math.min(maxPanX, newPanX));
    const constrainedPanY = Math.max(minPanY, Math.min(maxPanY, newPanY));
    
    // *** DEBUG: Log les contraintes quand elles sont actives ***
    if (newPanX !== constrainedPanX || newPanY !== constrainedPanY) {
      console.log(`🚧 [TILED-MAP] Contrainte pan: (${newPanX.toFixed(1)}, ${newPanY.toFixed(1)}) → (${constrainedPanX.toFixed(1)}, ${constrainedPanY.toFixed(1)}), zoom=${currentZoom.toFixed(3)}, marges=[${minPanX.toFixed(1)}, ${maxPanX.toFixed(1)}]`);
    }
    
    return { x: constrainedPanX, y: constrainedPanY };
  }, []);

  /**
   * Configuration du PanResponder pour la navigation tactile - CORRIGÉ
   */
  const panResponder = useRef(
    PanResponder.create({
      // Autoriser le démarrage du geste
      onStartShouldSetPanResponder: (evt, gestureState) => {
        return true;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const shouldMove = Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
        return shouldMove;
      },
      
      // Démarrage du geste
      onPanResponderGrant: (evt, gestureState) => {
        // *** CORRIGÉ: Utiliser les refs pour obtenir les valeurs actuelles ***
        panStartRef.current = { x: panXRef.current, y: panYRef.current };
        isDraggingRef.current = true;
        console.log(`🖐️ [TILED-MAP] GRANT - Début navigation: panStart=(${panStartRef.current.x.toFixed(1)}, ${panStartRef.current.y.toFixed(1)}), zoom=${zoomRef.current.toFixed(3)}`);
      },
      
      // Mouvement du geste
      onPanResponderMove: (evt, gestureState) => {
        if (!isDraggingRef.current) {
          return;
        }
        
        // *** CORRIGÉ: Utiliser zoomRef.current pour la sensibilité ***
        const currentZoom = zoomRef.current;
        const sensitivity = Math.max(0.4, Math.min(6.0, 2.4 / currentZoom));
        
        // Calculer la nouvelle position basée sur la position de départ
        const deltaX = gestureState.dx * sensitivity;
        const deltaY = gestureState.dy * sensitivity;
        
        const newPanX = panStartRef.current.x + deltaX;
        const newPanY = panStartRef.current.y + deltaY;
        
        // *** CORRIGÉ: Utiliser zoomRef.current pour les contraintes ***
        const constrained = constrainPan(newPanX, newPanY, currentZoom);
        const clampedPanX = constrained.x;
        const clampedPanY = constrained.y;
        
        // *** CORRIGÉ: Mettre à jour les refs ET les états ***
        panXRef.current = clampedPanX;
        panYRef.current = clampedPanY;
        setPanX(clampedPanX);
        setPanY(clampedPanY);
        
        // Log pour debug (moins fréquent)
        if (Math.abs(gestureState.dx) % 20 < 5) { // Log tous les ~20px
          console.log(`🖐️ [TILED-MAP] MOVE - pan: (${clampedPanX.toFixed(1)}, ${clampedPanY.toFixed(1)}), sensibilité: ${sensitivity.toFixed(2)}, zoom: ${currentZoom.toFixed(3)}, limite: ±${(MAP_TOTAL_WIDTH * currentZoom).toFixed(0)}`);
        }
      },
      
      // Fin du geste
      onPanResponderRelease: (evt, gestureState) => {
        isDraggingRef.current = false;
        console.log(`🖐️ [TILED-MAP] RELEASE - Navigation terminée: pan final=(${panXRef.current.toFixed(1)}, ${panYRef.current.toFixed(1)}), zoom=${zoomRef.current.toFixed(3)}, sensibilité=${(1.0 / zoomRef.current).toFixed(3)}`);
      },
      
      // Gestion des interruptions
      onPanResponderTerminationRequest: () => {
        return true;
      },
      
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        console.log(`🖐️ [TILED-MAP] Gesture terminated`);
      },
    })
  ).current;

  /**
   * Calculer les tuiles visibles dans le viewport actuel
   */
  const calculateVisibleTiles = useCallback(() => {
    // Dimensions du viewport en coordonnées carte
    const viewportWidth = screenWidth / zoom;
    const viewportHeight = (screenHeight - 200) / zoom;
    
    // Position du viewport dans la carte
    const viewportLeft = -panX / zoom;
    const viewportTop = -panY / zoom;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    
    // Calculer les indices de tuiles
    const startTileX = Math.max(0, Math.floor(viewportLeft / TILE_SIZE));
    const endTileX = Math.min(
      Math.ceil(MAP_TOTAL_WIDTH / TILE_SIZE) - 1,
      Math.floor(viewportRight / TILE_SIZE)
    );
    
    const startTileY = Math.max(0, Math.floor(viewportTop / TILE_SIZE));
    const endTileY = Math.min(
      Math.ceil(MAP_TOTAL_HEIGHT / TILE_SIZE) - 1,
      Math.floor(viewportBottom / TILE_SIZE)
    );
    
    const tiles = [];
    for (let x = startTileX; x <= endTileX; x++) {
      for (let y = startTileY; y <= endTileY; y++) {
        tiles.push({ x, y, key: `${x}-${y}` });
      }
    }
    
    setVisibleTiles(tiles);
    
    // Notifier le changement de viewport
    if (onViewportChange) {
      onViewportChange({
        zoom,
        panX,
        panY,
        visibleArea: {
          left: viewportLeft,
          top: viewportTop,
          right: viewportRight,
          bottom: viewportBottom
        }
      });
    }
  }, [zoom, panX, panY, onViewportChange]);

  /**
   * Générer le contenu d'une tuile
   */
  const generateTileContent = useCallback((tileX, tileY) => {
    const tileLeft = tileX * TILE_SIZE;
    const tileTop = tileY * TILE_SIZE;
    const tileRight = Math.min(tileLeft + TILE_SIZE, MAP_TOTAL_WIDTH);
    const tileBottom = Math.min(tileTop + TILE_SIZE, MAP_TOTAL_HEIGHT);
    
    const elements = [];
    
    // Grille de référence (seulement si zoom suffisant)
    if (zoom > 0.2) {
      const gridSpacing = 10 * SCALE; // 10m en pixels
      
      // Lignes verticales dans cette tuile
      const startGridX = Math.ceil(tileLeft / gridSpacing) * gridSpacing;
      for (let x = startGridX; x <= tileRight; x += gridSpacing) {
        if (x >= tileLeft && x <= tileRight) {
          elements.push(
            <Line
              key={`grid-v-${x}`}
              x1={x}
              y1={tileTop}
              x2={x}
              y2={tileBottom}
              stroke={colors.grid}
              strokeWidth="1"
              opacity="0.3"
            />
          );
        }
      }
      
      // Lignes horizontales dans cette tuile
      const startGridY = Math.ceil(tileTop / gridSpacing) * gridSpacing;
      for (let y = startGridY; y <= tileBottom; y += gridSpacing) {
        if (y >= tileTop && y <= tileBottom) {
          elements.push(
            <Line
              key={`grid-h-${y}`}
              x1={tileLeft}
              y1={y}
              x2={tileRight}
              y2={y}
              stroke={colors.grid}
              strokeWidth="1"
              opacity="0.3"
            />
          );
        }
      }
    }
    
    return elements;
  }, [zoom, colors.grid]);

  /**
   * Convertir coordonnées monde vers SVG
   */
  const worldToSVG = useCallback((worldX, worldY) => {
    const pixelX = worldX * SCALE;
    const pixelY = -worldY * SCALE; // Inversion Y pour SVG
    
    // Centre de la carte comme origine
    const centerX = MAP_TOTAL_WIDTH / 2;
    const centerY = MAP_TOTAL_HEIGHT / 2;
    
    return {
      x: centerX + pixelX,
      y: centerY + pixelY
    };
  }, []);

  /**
   * Rendu des points d'intérêt
   */
  const renderPointsOfInterest = useCallback(() => {
    return pointsOfInterest.map(point => {
      // *** MODIFICATION: Réduire la taille de moitié pour Entrée Fifi ***
      const radius = Math.max(3, 6 / zoom); // Réduit de Math.max(6, 12 / zoom)
      
      return (
        <G key={point.id}>
          {/* Cercle extérieur (halo) - taille réduite */}
          <Circle
            cx={point.x}
            cy={point.y}
            r={radius + 1.5} // Réduit de radius + 3
            fill="rgba(255, 255, 255, 0.3)"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth={Math.max(0.5, 1 / zoom)} // Réduit de Math.max(1, 2 / zoom)
          />
          
          {/* Point principal - taille réduite */}
          <Circle
            cx={point.x}
            cy={point.y}
            r={radius}
            fill={colors.pointsOfInterest}
            stroke="#ffffff"
            strokeWidth={Math.max(0.5, 1 / zoom)} // Réduit de Math.max(1, 2 / zoom)
          />
          
          {/* Point central - taille réduite */}
          <Circle
            cx={point.x}
            cy={point.y}
            r={Math.max(1, 2 / zoom)} // Réduit de Math.max(2, 4 / zoom)
            fill="#ffffff"
          />
        </G>
      );
    });
  }, [pointsOfInterest, zoom, colors.pointsOfInterest]);

  /**
   * Rendu de la trajectoire actuelle
   */
  const renderCurrentTrajectory = useCallback(() => {
    if (!currentTrajectory || currentTrajectory.length < 2) return null;
    
    const path = currentTrajectory.map((point, index) => {
      const svgPos = worldToSVG(point.x, point.y);
      return `${index === 0 ? 'M' : 'L'} ${svgPos.x.toFixed(2)} ${svgPos.y.toFixed(2)}`;
    }).join(' ');
    
    return (
      <Path
        d={path}
        stroke={colors.trajectory}
        strokeWidth={Math.max(2, 4 / zoom)}
        fill="none"
        opacity="1.0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }, [currentTrajectory, worldToSVG, zoom, colors.trajectory]);

  /**
   * Rendu de la position utilisateur
   */
  const renderUserPosition = useCallback(() => {
    if (!userPosition) return null;
    
    const svgPos = worldToSVG(userPosition.x, userPosition.y);
    const radius = Math.max(4, 8 / zoom);
    const headingLength = Math.max(15, 30 / zoom);
    
    // Calcul de l'orientation
    const svgOrientation = (userOrientation || 0) - Math.PI / 2;
    const headingX = svgPos.x + Math.cos(svgOrientation) * headingLength;
    const headingY = svgPos.y + Math.sin(svgOrientation) * headingLength;
    
    return (
      <G>
        {/* Ligne de direction */}
        <Line
          x1={svgPos.x}
          y1={svgPos.y}
          x2={headingX}
          y2={headingY}
          stroke={colors.orientation}
          strokeWidth={Math.max(2, 4 / zoom)}
          opacity="1.0"
        />
        
        {/* Position utilisateur */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r={radius}
          fill={colors.user}
          stroke="#ffffff"
          strokeWidth={Math.max(1, 2 / zoom)}
          opacity="1.0"
        />
        
        {/* Point central */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r={Math.max(1, 2 / zoom)}
          fill="#ffffff"
          opacity="1.0"
        />
      </G>
    );
  }, [userPosition, userOrientation, worldToSVG, zoom, colors.user, colors.orientation]);

  /**
   * Contrôles de zoom avec préservation du point central
   */
  const zoomIn = useCallback(() => {
    const zoomFactor = zoom < 1 ? 1.5 : zoom < 5 ? 1.3 : 1.2; // Progression adaptée
    const newZoom = Math.min(MAX_ZOOM, zoom * zoomFactor);
    
    // *** CORRIGÉ: Logique de zoom centrée simplifiée ***
    // Le zoom se fait autour du centre de l'écran
    const centerScreenX = screenWidth / 2;
    const centerScreenY = (screenHeight - 200) / 2;
    
    // Calculer le nouveau pan pour maintenir le centre visuel
    const zoomRatio = newZoom / zoom;
    
    // Ajuster le pan proportionnellement au changement de zoom
    const newPanX = panXRef.current * zoomRatio + centerScreenX * (1 - zoomRatio);
    const newPanY = panYRef.current * zoomRatio + centerScreenY * (1 - zoomRatio);
    
    // *** NOUVEAU: Contraindre le pan dans les limites de la carte ***
    const constrained = constrainPan(newPanX, newPanY, newZoom);
    
    // Appliquer les changements
    setZoom(newZoom);
    panXRef.current = constrained.x;
    panYRef.current = constrained.y;
    setPanX(constrained.x);
    setPanY(constrained.y);
    
    console.log(`🔍 [TILED-MAP] Zoom in: ${zoom.toFixed(3)}x → ${newZoom.toFixed(3)}x, pan: (${panXRef.current.toFixed(1)}, ${panYRef.current.toFixed(1)}) → (${constrained.x.toFixed(1)}, ${constrained.y.toFixed(1)})`);
  }, [zoom, constrainPan]);

  const zoomOut = useCallback(() => {
    const zoomFactor = zoom > 5 ? 1.2 : zoom > 1 ? 1.3 : 1.5; // Progression adaptée
    const newZoom = Math.max(MIN_ZOOM, zoom / zoomFactor);
    
    // *** CORRIGÉ: Logique de zoom centrée simplifiée ***
    // Le zoom se fait autour du centre de l'écran
    const centerScreenX = screenWidth / 2;
    const centerScreenY = (screenHeight - 200) / 2;
    
    // Calculer le nouveau pan pour maintenir le centre visuel
    const zoomRatio = newZoom / zoom;
    
    // Ajuster le pan proportionnellement au changement de zoom
    const newPanX = panXRef.current * zoomRatio + centerScreenX * (1 - zoomRatio);
    const newPanY = panYRef.current * zoomRatio + centerScreenY * (1 - zoomRatio);
    
    // *** NOUVEAU: Contraindre le pan dans les limites de la carte ***
    const constrained = constrainPan(newPanX, newPanY, newZoom);
    
    // Appliquer les changements
    setZoom(newZoom);
    panXRef.current = constrained.x;
    panYRef.current = constrained.y;
    setPanX(constrained.x);
    setPanY(constrained.y);
    
    console.log(`🔍 [TILED-MAP] Zoom out: ${zoom.toFixed(3)}x → ${newZoom.toFixed(3)}x, pan: (${panXRef.current.toFixed(1)}, ${panYRef.current.toFixed(1)}) → (${constrained.x.toFixed(1)}, ${constrained.y.toFixed(1)})`);
  }, [zoom, constrainPan]);

  /**
   * Centrer sur l'utilisateur avec zoom fixe 4.03x
   */
  const centerOnUser = useCallback(() => {
    if (!userPosition) return;
    
    // *** MODIFIÉ: Forcer le zoom à 4.03x ***
    const targetZoom = 4.03;
    const svgPos = worldToSVG(userPosition.x, userPosition.y);
    
    // Calculer le pan nécessaire pour centrer l'utilisateur avec le zoom 4.03x
    const targetPanX = (screenWidth / 2 - svgPos.x) * targetZoom;
    const targetPanY = ((screenHeight - 200) / 2 - svgPos.y) * targetZoom;
    
    // *** NOUVEAU: Mettre à jour le zoom ET le pan ***
    setZoom(targetZoom);
    panXRef.current = targetPanX;
    panYRef.current = targetPanY;
    setPanX(targetPanX);
    setPanY(targetPanY);
    
    console.log(`🎯 [TILED-MAP] Centré sur utilisateur: (${userPosition.x.toFixed(2)}, ${userPosition.y.toFixed(2)}), zoom fixe: ${targetZoom}x`);
  }, [userPosition, worldToSVG]);

  /**
   * Centrer sur un point d'intérêt
   */
  const centerOnPoint = useCallback((point) => {
    // Calculer le pan nécessaire pour centrer le point
    const targetPanX = (screenWidth / 2 - point.x) * zoom;
    const targetPanY = ((screenHeight - 200) / 2 - point.y) * zoom;
    
    // *** CORRIGÉ: Mettre à jour les refs ET les états ***
    panXRef.current = targetPanX;
    panYRef.current = targetPanY;
    setPanX(targetPanX);
    setPanY(targetPanY);
    
    console.log(`🎯 [TILED-MAP] Centré sur point: ${point.name} (${point.worldX.toFixed(2)}, ${point.worldY.toFixed(2)})`);
  }, [zoom]);

  /**
   * Voir la carte entière
   */
  const viewFullMap = useCallback(() => {
    // Calculer le zoom pour voir toute la carte
    const zoomX = screenWidth / MAP_TOTAL_WIDTH;
    const zoomY = (screenHeight - 200) / MAP_TOTAL_HEIGHT;
    const fullMapZoom = Math.min(zoomX, zoomY) * 0.9; // 90% pour avoir des marges
    
    // *** CORRIGÉ: Éviter les appels répétés si déjà au bon zoom ***
    if (Math.abs(zoom - fullMapZoom) < 0.001 && Math.abs(panXRef.current) < 10 && Math.abs(panYRef.current) < 10) {
      console.log(`🗺️ [TILED-MAP] Déjà en vue carte entière`);
      return;
    }
    
    setZoom(fullMapZoom);
    
    // *** CORRIGÉ: Remettre le pan à zéro avec les refs ***
    panXRef.current = 0;
    panYRef.current = 0;
    setPanX(0);
    setPanY(0);
    
    console.log(`🗺️ [TILED-MAP] Vue carte entière: zoom=${fullMapZoom.toFixed(3)}`);
  }, []);

  // Recalculer les tuiles visibles quand le viewport change
  useEffect(() => {
    calculateVisibleTiles();
  }, [calculateVisibleTiles]);

  // Exposer les fonctions de contrôle - OPTIMISÉ pour éviter les boucles
  useEffect(() => {
    if (onViewportChange) {
      onViewportChange({
        zoom,
        panX,
        panY,
        centerOnUser,
        viewFullMap,
        centerOnPoint,
        setCustomZoom,
        pointsOfInterest,
        visibleTiles: visibleTiles.length
      });
    }
  }, [zoom, panX, panY, visibleTiles.length]); // *** CORRIGÉ: Retirer les fonctions des dépendances ***

  return (
    <View style={{ flex: 1 }}>
      {/* Contrôles de zoom */}
      <View style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        flexDirection: 'column',
        gap: 5
      }}>
        <TouchableOpacity
          onPress={zoomIn}
          style={{
            backgroundColor: 'rgba(0, 255, 136, 0.8)',
            padding: 12,
            borderRadius: 8,
            minWidth: 40,
            alignItems: 'center'
          }}
        >
          <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 18 }}>+</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={zoomOut}
          style={{
            backgroundColor: 'rgba(0, 255, 136, 0.8)',
            padding: 12,
            borderRadius: 8,
            minWidth: 40,
            alignItems: 'center'
          }}
        >
          <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 18 }}>−</Text>
        </TouchableOpacity>
        
        {/* Indicateur de zoom */}
        <View style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: 6,
          borderRadius: 4,
          alignItems: 'center'
        }}>
          <Text style={{ color: '#00ff88', fontSize: 10, fontFamily: 'monospace' }}>
            {zoom.toFixed(2)}x
          </Text>
        </View>
      </View>

      {/* Instructions de navigation */}
      <View style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: 8,
        borderRadius: 6,
        maxWidth: 200
      }}>
        <Text style={{ color: '#00ff88', fontSize: 11, fontFamily: 'monospace' }}>
          🖐️ Glissez pour naviguer
        </Text>
        <Text style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>
          Tuiles: {visibleTiles.length}
        </Text>
        <Text style={{ color: '#ff6b35', fontSize: 10, fontFamily: 'monospace' }}>
          📍 Points: {pointsOfInterest.length}
        </Text>
        {/* DEBUG: Afficher les valeurs de pan */}
        <Text style={{ color: '#ffaa00', fontSize: 9, fontFamily: 'monospace' }}>
          Pan: ({panX.toFixed(0)}, {panY.toFixed(0)})
        </Text>
        <Text style={{ color: '#ffaa00', fontSize: 9, fontFamily: 'monospace' }}>
          Zoom: {zoom.toFixed(3)}x
        </Text>
        {/* *** NOUVEAU: Afficher la sensibilité du pan *** */}
        <Text style={{ color: '#ff88aa', fontSize: 9, fontFamily: 'monospace' }}>
          Sensibilité: {Math.max(0.4, Math.min(6.0, 2.4 / zoom)).toFixed(2)}x
        </Text>
      </View>

      {/* Carte SVG avec navigation tactile */}
      <View 
        style={{ flex: 1 }}
        {...panResponder.panHandlers}
      >
        <Svg
          width={screenWidth}
          height={screenHeight - 200}
          viewBox={`${-panX / zoom} ${-panY / zoom} ${screenWidth / zoom} ${(screenHeight - 200) / zoom}`}
        >
          {/* Fond noir */}
          <Rect
            x={-panX / zoom - 1000}
            y={-panY / zoom - 1000}
            width={screenWidth / zoom + 2000}
            height={(screenHeight - 200) / zoom + 2000}
            fill={colors.background}
          />
          
          {/* Bordure de la carte */}
          <Rect
            x={0}
            y={0}
            width={MAP_TOTAL_WIDTH}
            height={MAP_TOTAL_HEIGHT}
            fill="none"
            stroke="#666666"
            strokeWidth={Math.max(1, 2 / zoom)}
            opacity="0.8"
          />
          
          {/* Tuiles visibles */}
          <G>
            {visibleTiles.map(tile => (
              <G key={tile.key}>
                {generateTileContent(tile.x, tile.y)}
              </G>
            ))}
          </G>
          
          {/* Points d'intérêt */}
          {renderPointsOfInterest()}
          
          {/* Trajectoire actuelle */}
          {renderCurrentTrajectory()}
          
          {/* Position utilisateur */}
          {renderUserPosition()}
        </Svg>
      </View>
    </View>
  );
} 