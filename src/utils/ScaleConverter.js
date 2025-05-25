/**
 * Utilitaire de conversion d'échelle pour le système de localisation
 * Gère la conversion entre coordonnées monde (mètres) et écran (pixels)
 */
export class ScaleConverter {
  constructor(config = {}) {
    // Échelle de référence : 100 mètres = 372 pixels
    this.REFERENCE_METERS = config.referenceMaters || 100;
    this.REFERENCE_PIXELS = config.referencePixels || 372;
    
    // Calcul du facteur d'échelle de base
    this.BASE_SCALE = this.REFERENCE_PIXELS / this.REFERENCE_METERS; // 3.72 px/m
    
    // Zoom actuel (modifie l'échelle d'affichage)
    this.currentZoom = 1;
    
    // Dimensions de l'écran
    this.screenWidth = config.screenWidth || 375;
    this.screenHeight = config.screenHeight || 667;
    
    // Offset de vue (pan)
    this.viewOffset = { x: 0, y: 0 };
  }

  /**
   * Mise à jour du zoom
   */
  setZoom(zoom) {
    this.currentZoom = Math.max(0.1, Math.min(15, zoom));
  }

  /**
   * Mise à jour de l'offset de vue
   */
  setViewOffset(offset) {
    this.viewOffset = { ...offset };
  }

  /**
   * Conversion mètres vers pixels avec zoom et offset
   */
  metersToPixels(meters, axis = 'both') {
    const basePixels = meters * this.BASE_SCALE;
    const scaledPixels = basePixels * this.currentZoom;
    
    if (axis === 'x' || axis === 'both') {
      return scaledPixels;
    }
    if (axis === 'y') {
      return scaledPixels;
    }
    return scaledPixels;
  }

  /**
   * Conversion pixels vers mètres
   */
  pixelsToMeters(pixels) {
    return pixels / (this.BASE_SCALE * this.currentZoom);
  }

  /**
   * Conversion coordonnées monde vers coordonnées écran
   */
  worldToScreen(worldX, worldY) {
    const centerX = this.screenWidth / 2;
    const centerY = this.screenHeight / 2;
    
    const pixelX = this.metersToPixels(worldX);
    const pixelY = this.metersToPixels(worldY);
    
    return {
      x: centerX + pixelX + this.viewOffset.x,
      y: centerY - pixelY + this.viewOffset.y // Inversion Y pour SVG
    };
  }

  /**
   * Conversion coordonnées écran vers coordonnées monde
   */
  screenToWorld(screenX, screenY) {
    const centerX = this.screenWidth / 2;
    const centerY = this.screenHeight / 2;
    
    const relativeX = screenX - centerX - this.viewOffset.x;
    const relativeY = -(screenY - centerY - this.viewOffset.y); // Inversion Y
    
    return {
      x: this.pixelsToMeters(relativeX),
      y: this.pixelsToMeters(relativeY)
    };
  }

  /**
   * Calcul de la taille de grille adaptée au zoom
   */
  getGridSize() {
    // Taille de base : 10 mètres par cellule
    let baseGridSize = 10;
    
    if (this.currentZoom < 1) {
      baseGridSize = 50; // Grille plus large pour zoom dézoomer
    } else if (this.currentZoom > 5) {
      baseGridSize = 5; // Grille plus fine pour zoom important
    } else if (this.currentZoom > 10) {
      baseGridSize = 1; // Grille très fine
    }
    
    return baseGridSize;
  }

  /**
   * Calcul des limites visibles de la carte
   */
  getVisibleBounds() {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.screenWidth, this.screenHeight);
    
    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      maxX: Math.max(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxY: Math.max(topLeft.y, bottomRight.y)
    };
  }

  /**
   * Calcul de l'échelle d'affichage pour les éléments UI
   */
  getUIScale() {
    // Échelle pour les éléments UI (icônes, texte) qui ne doivent pas être trop petits/grands
    const minScale = 0.5;
    const maxScale = 2.0;
    const baseUIScale = Math.sqrt(this.currentZoom); // Racine carrée pour un scaling plus doux
    
    return Math.max(minScale, Math.min(maxScale, baseUIScale));
  }

  /**
   * Formatage des distances pour l'affichage
   */
  formatDistance(meters) {
    if (meters < 1) {
      return `${(meters * 100).toFixed(0)} cm`;
    } else if (meters < 1000) {
      return `${meters.toFixed(1)} m`;
    } else {
      return `${(meters / 1000).toFixed(2)} km`;
    }
  }

  /**
   * Informations sur l'échelle actuelle
   */
  getScaleInfo() {
    const pixelsPerMeter = this.BASE_SCALE * this.currentZoom;
    const metersPerPixel = 1 / pixelsPerMeter;
    
    return {
      zoom: this.currentZoom,
      pixelsPerMeter: pixelsPerMeter.toFixed(2),
      metersPerPixel: metersPerPixel.toFixed(4),
      gridSize: this.getGridSize(),
      uiScale: this.getUIScale().toFixed(2),
      visibleArea: this.getVisibleBounds()
    };
  }

  /**
   * Contraintes de navigation (limites de la carte)
   */
  constrainViewOffset(newOffset, mapBounds = null) {
    if (!mapBounds) {
      return newOffset; // Pas de contraintes
    }

    // Calcul des limites en pixels
    const mapPixelWidth = this.metersToPixels(mapBounds.width);
    const mapPixelHeight = this.metersToPixels(mapBounds.height);
    
    // Contraintes pour éviter de sortir de la carte
    const maxOffsetX = Math.max(0, (mapPixelWidth - this.screenWidth) / 2);
    const maxOffsetY = Math.max(0, (mapPixelHeight - this.screenHeight) / 2);
    
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, newOffset.x)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, newOffset.y))
    };
  }
} 