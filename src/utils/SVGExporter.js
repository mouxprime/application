import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

/**
 * Utilitaire pour l'export de trajets en fichiers SVG
 */
export class SVGExporter {
  
  /**
   * Générer le contenu SVG d'un trajet
   */
  static generateSVGContent(trajectory, options = {}) {
    const {
      width = 800,
      height = 600,
      backgroundColor = '#000000',
      trajectoryColor = '#00ff00',
      pointColor = '#00ff00',
      textColor = '#00ff88',
      strokeWidth = 4,
      pointRadius = 4
    } = options;

    if (!trajectory.svgPath) {
      throw new Error('Aucun chemin SVG disponible pour ce trajet');
    }

    // Calculer les limites de la trajectoire pour un meilleur cadrage
    const bounds = this.calculateTrajectoryBounds(trajectory.points);
    const scaledPoints = this.scalePointsToViewBox(trajectory.points, bounds, width, height);
    const scaledPath = this.generateScaledSVGPath(scaledPoints);

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .background { fill: ${backgroundColor}; }
      .trajectory { 
        stroke: ${trajectoryColor}; 
        stroke-width: ${strokeWidth}; 
        fill: none; 
        opacity: 0.9;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .trajectory-glow { 
        stroke: ${trajectoryColor}; 
        stroke-width: ${strokeWidth * 2}; 
        fill: none; 
        opacity: 0.3;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .point { 
        fill: ${pointColor}; 
        opacity: 0.8; 
        stroke: #ffffff; 
        stroke-width: 1; 
      }
      .text-title { 
        fill: ${textColor}; 
        font-family: 'Courier New', monospace; 
        font-size: 18px; 
        font-weight: bold; 
      }
      .text-info { 
        fill: ${textColor}; 
        font-family: 'Courier New', monospace; 
        font-size: 14px; 
      }
      .text-stats { 
        fill: ${textColor}; 
        font-family: 'Courier New', monospace; 
        font-size: 12px; 
      }
    </style>
  </defs>
  
  <!-- Fond -->
  <rect class="background" width="100%" height="100%" />
  
  <!-- Effet de lueur pour la trajectoire -->
  <path class="trajectory-glow" d="${scaledPath}" />
  
  <!-- Trajectoire principale -->
  <path class="trajectory" d="${scaledPath}" />
  
  <!-- Points de la trajectoire -->
  ${scaledPoints.map((point, index) => 
    `<circle class="point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${pointRadius}" />`
  ).join('\n  ')}
  
  <!-- Point de départ (vert plus gros) -->
  ${scaledPoints.length > 0 ? 
    `<circle cx="${scaledPoints[0].x.toFixed(2)}" cy="${scaledPoints[0].y.toFixed(2)}" r="${pointRadius * 1.5}" fill="#00ff00" stroke="#ffffff" stroke-width="2" opacity="1" />` : ''
  }
  
  <!-- Point d'arrivée (rouge plus gros) -->
  ${scaledPoints.length > 1 ? 
    `<circle cx="${scaledPoints[scaledPoints.length - 1].x.toFixed(2)}" cy="${scaledPoints[scaledPoints.length - 1].y.toFixed(2)}" r="${pointRadius * 1.5}" fill="#ff4444" stroke="#ffffff" stroke-width="2" opacity="1" />` : ''
  }
  
  <!-- Informations du trajet -->
  <g transform="translate(20, 30)">
    <text class="text-title" x="0" y="0">${this.escapeXML(trajectory.name)}</text>
    <text class="text-info" x="0" y="25">Date: ${new Date(trajectory.date).toLocaleDateString('fr-FR')} à ${new Date(trajectory.date).toLocaleTimeString('fr-FR')}</text>
    <text class="text-stats" x="0" y="45">👣 ${trajectory.stats.stepCount} pas</text>
    <text class="text-stats" x="0" y="60">📏 ${trajectory.stats.distance.toFixed(1)} mètres</text>
    <text class="text-stats" x="0" y="75">📍 ${trajectory.points.length} points</text>
    ${trajectory.stats.duration > 0 ? 
      `<text class="text-stats" x="0" y="90">⏱️ ${this.formatDuration(trajectory.stats.duration)}</text>` : ''
    }
  </g>
  
  <!-- Légende -->
  <g transform="translate(20, ${height - 60})">
    <text class="text-stats" x="0" y="0">🟢 Départ</text>
    <text class="text-stats" x="0" y="15">🔴 Arrivée</text>
    <text class="text-stats" x="0" y="30">Généré par l'app de Localisation Intérieure</text>
  </g>
  
  <!-- Grille de référence (optionnelle) -->
  ${options.showGrid ? this.generateGrid(width, height) : ''}
</svg>`;

    return svgContent;
  }

  /**
   * Calculer les limites de la trajectoire
   */
  static calculateTrajectoryBounds(points) {
    if (!points || points.length === 0) {
      return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  }

  /**
   * Adapter les points à la zone de visualisation SVG
   */
  static scalePointsToViewBox(points, bounds, width, height) {
    const margin = 100; // Marge pour les textes et légendes
    const viewWidth = width - margin * 2;
    const viewHeight = height - margin * 2;
    
    const trajectoryWidth = bounds.maxX - bounds.minX;
    const trajectoryHeight = bounds.maxY - bounds.minY;
    
    // Éviter la division par zéro
    const scaleX = trajectoryWidth > 0 ? viewWidth / trajectoryWidth : 1;
    const scaleY = trajectoryHeight > 0 ? viewHeight / trajectoryHeight : 1;
    
    // Utiliser la même échelle pour préserver les proportions
    const scale = Math.min(scaleX, scaleY);
    
    return points.map(point => ({
      x: margin + (point.x - bounds.minX) * scale + (viewWidth - trajectoryWidth * scale) / 2,
      y: margin + (point.y - bounds.minY) * scale + (viewHeight - trajectoryHeight * scale) / 2
    }));
  }

  /**
   * Générer le chemin SVG à partir des points mis à l'échelle
   */
  static generateScaledSVGPath(scaledPoints) {
    if (!scaledPoints || scaledPoints.length < 2) {
      return '';
    }

    return scaledPoints.map((point, index) => {
      return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }).join(' ');
  }

  /**
   * Générer une grille de référence
   */
  static generateGrid(width, height) {
    const gridSize = 50;
    let gridLines = '';
    
    // Lignes verticales
    for (let x = 0; x <= width; x += gridSize) {
      gridLines += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#333333" stroke-width="0.5" opacity="0.3" />\n  `;
    }
    
    // Lignes horizontales
    for (let y = 0; y <= height; y += gridSize) {
      gridLines += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#333333" stroke-width="0.5" opacity="0.3" />\n  `;
    }
    
    return `<g id="grid">\n  ${gridLines}</g>`;
  }

  /**
   * Échapper les caractères XML
   */
  static escapeXML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Formater la durée
   */
  static formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Exporter un trajet en fichier SVG
   */
  static async exportTrajectoryToFile(trajectory, options = {}) {
    try {
      // Générer le contenu SVG
      const svgContent = this.generateSVGContent(trajectory, options);
      
      // Créer un nom de fichier sécurisé
      const safeFileName = this.createSafeFileName(trajectory.name);
      const fileName = `${safeFileName}_${new Date().toISOString().split('T')[0]}.svg`;
      
      // Chemin du fichier temporaire
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      
      // Écrire le fichier
      await FileSystem.writeAsStringAsync(fileUri, svgContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      // Vérifier si le partage est disponible
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        // Partager le fichier (permet de l'enregistrer)
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/svg+xml',
          dialogTitle: `Exporter ${trajectory.name}`,
          UTI: 'public.svg-image'
        });
        
        return {
          success: true,
          filePath: fileUri,
          fileName: fileName,
          message: 'Fichier SVG créé et prêt à être partagé'
        };
      } else {
        return {
          success: false,
          error: 'Le partage de fichiers n\'est pas disponible sur cet appareil',
          filePath: fileUri,
          fileName: fileName
        };
      }
      
    } catch (error) {
      console.error('Erreur export SVG:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de la création du fichier SVG'
      };
    }
  }

  /**
   * Créer un nom de fichier sécurisé
   */
  static createSafeFileName(name) {
    return name
      .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Supprimer caractères spéciaux
      .replace(/\s+/g, '_') // Remplacer espaces par underscores
      .substring(0, 50) // Limiter la longueur
      .toLowerCase();
  }

  /**
   * Obtenir les informations du fichier exporté
   */
  static async getFileInfo(filePath) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      return fileInfo;
    } catch (error) {
      console.error('Erreur lecture info fichier:', error);
      return null;
    }
  }

  /**
   * Supprimer un fichier temporaire
   */
  static async deleteTemporaryFile(filePath) {
    try {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
      return true;
    } catch (error) {
      console.error('Erreur suppression fichier temporaire:', error);
      return false;
    }
  }

  /**
   * Prévisualiser le SVG (retourner juste le contenu)
   */
  static previewSVG(trajectory, options = {}) {
    return this.generateSVGContent(trajectory, {
      width: 400,
      height: 300,
      ...options
    });
  }
} 