import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, Text, PanResponder, Dimensions } from 'react-native';
import Svg, { G, Rect, Line, Path, Circle } from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * Composant de carte avec système de tuiles et navigation tactile
 * =============================================================
 * 
 * Affiche une carte de 14629px × 13764px avec un système de tuiles
 * qui se chargent dynamiquement selon le zoom et la position.
 * 
 * Navigation tactile : déplacement avec les doigts + boutons de zoom.
 */

export default function TiledMapView({ 
  persistentMapService, 
  currentTrajectory, 
  userPosition, 
  userOrientation,
  onViewportChange 
}) {
  // Dimensions de la carte complète
  const MAP_TOTAL_WIDTH = 14629;
  const MAP_TOTAL_HEIGHT = 13764;
  const SCALE = 3.72; // pixels par mètre
  
  // Taille des tuiles (en pixels)
  const TILE_SIZE = 512;
  
  // États du viewport
  const [zoom, setZoom] = useState(0.1); // Zoom initial pour voir toute la carte
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  
  // Limites de zoom
  const MIN_ZOOM = 0.05; // Très dézoomé pour voir toute la carte
  const MAX_ZOOM = 10;   // Très zoomé pour les détails
  
  // Cache des tuiles
  const [loadedTiles, setLoadedTiles] = useState(new Map());
  const [visibleTiles, setVisibleTiles] = useState([]);
  
  // Refs pour la navigation tactile
  const panStartRef = useRef({ x: 0, y: 0 });
  const currentPanRef = useRef({ x: 0, y: 0 });

  /**
   * Configuration du PanResponder pour la navigation tactile
   */
  const panResponder = useRef(
    PanResponder.create({
      // Autoriser le démarrage du geste
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      // Démarrage du geste
      onPanResponderGrant: (evt) => {
        // Sauvegarder la position de départ
        panStartRef.current = { x: panX, y: panY };
        currentPanRef.current = { x: panX, y: panY };
      },
      
      // Mouvement du geste
      onPanResponderMove: (evt, gestureState) => {
        // Calculer la nouvelle position
        const newPanX = panStartRef.current.x + gestureState.dx;
        const newPanY = panStartRef.current.y + gestureState.dy;
        
        // Appliquer les limites pour éviter de sortir trop loin de la carte
        const maxPanX = MAP_TOTAL_WIDTH * zoom / 2;
        const maxPanY = MAP_TOTAL_HEIGHT * zoom / 2;
        
        const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, newPanX));
        const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, newPanY));
        
        setPanX(clampedPanX);
        setPanY(clampedPanY);
        currentPanRef.current = { x: clampedPanX, y: clampedPanY };
      },
      
      // Fin du geste
      onPanResponderRelease: () => {
        // Rien de spécial à faire à la fin
        console.log(`🖐️ [TILED-MAP] Navigation terminée: pan=(${currentPanRef.current.x.toFixed(1)}, ${currentPanRef.current.y.toFixed(1)})`);
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
              stroke="#333333"
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
              stroke="#333333"
              strokeWidth="1"
              opacity="0.3"
            />
          );
        }
      }
    }
    
    return elements;
  }, [zoom]);

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
        stroke="#00ff00"
        strokeWidth={Math.max(2, 4 / zoom)}
        fill="none"
        opacity="1.0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }, [currentTrajectory, worldToSVG, zoom]);

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
          stroke="#ff0088"
          strokeWidth={Math.max(2, 4 / zoom)}
          opacity="1.0"
        />
        
        {/* Position utilisateur */}
        <Circle
          cx={svgPos.x}
          cy={svgPos.y}
          r={radius}
          fill="#00ff00"
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
  }, [userPosition, userOrientation, worldToSVG, zoom]);

  /**
   * Contrôles de zoom
   */
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(MAX_ZOOM, prev * 1.5));
    console.log(`🔍 [TILED-MAP] Zoom in: ${(zoom * 1.5).toFixed(3)}x`);
  }, [zoom]);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(MIN_ZOOM, prev / 1.5));
    console.log(`🔍 [TILED-MAP] Zoom out: ${(zoom / 1.5).toFixed(3)}x`);
  }, [zoom]);

  /**
   * Centrer sur l'utilisateur
   */
  const centerOnUser = useCallback(() => {
    if (!userPosition) return;
    
    const svgPos = worldToSVG(userPosition.x, userPosition.y);
    
    // Calculer le pan nécessaire pour centrer l'utilisateur
    const targetPanX = (screenWidth / 2 - svgPos.x) * zoom;
    const targetPanY = ((screenHeight - 200) / 2 - svgPos.y) * zoom;
    
    setPanX(targetPanX);
    setPanY(targetPanY);
    currentPanRef.current = { x: targetPanX, y: targetPanY };
    
    console.log(`🎯 [TILED-MAP] Centré sur utilisateur: (${userPosition.x.toFixed(2)}, ${userPosition.y.toFixed(2)}), zoom=${zoom.toFixed(3)}`);
  }, [userPosition, worldToSVG, zoom]);

  /**
   * Voir la carte entière
   */
  const viewFullMap = useCallback(() => {
    // Calculer le zoom pour voir toute la carte
    const zoomX = screenWidth / MAP_TOTAL_WIDTH;
    const zoomY = (screenHeight - 200) / MAP_TOTAL_HEIGHT;
    const fullMapZoom = Math.min(zoomX, zoomY) * 0.9; // 90% pour avoir des marges
    
    setZoom(fullMapZoom);
    setPanX(0);
    setPanY(0);
    currentPanRef.current = { x: 0, y: 0 };
    
    console.log(`🗺️ [TILED-MAP] Vue carte entière: zoom=${fullMapZoom.toFixed(3)}`);
  }, []);

  // Recalculer les tuiles visibles quand le viewport change
  useEffect(() => {
    calculateVisibleTiles();
  }, [calculateVisibleTiles]);

  // Exposer les fonctions de contrôle
  useEffect(() => {
    if (onViewportChange) {
      onViewportChange({
        zoom,
        panX,
        panY,
        centerOnUser,
        viewFullMap,
        visibleTiles: visibleTiles.length
      });
    }
  }, [zoom, panX, panY, centerOnUser, viewFullMap, visibleTiles.length, onViewportChange]);

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
            fill="#000000"
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
          
          {/* Trajectoire actuelle */}
          {renderCurrentTrajectory()}
          
          {/* Position utilisateur */}
          {renderUserPosition()}
        </Svg>
      </View>
    </View>
  );
} 