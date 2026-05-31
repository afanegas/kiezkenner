import { polygonEngine } from './engines/polygonEngine.js';
import { pointEngine } from './engines/pointEngine.js';
import { streetEngine } from './engines/streetEngine.js';
import { GameManager } from './game.js';

// Zoom threshold for transitioning between simple station circles and custom shapes/icons.
// Zoom values below this threshold will render circles; zoom values at or above will render custom shapes.
// Adjust this parameter to control the transition zoom level.
export const STATION_ZOOM_THRESHOLD = 10.5;

// Premium and vibrant colors for the 12 Bezirke
const bezirkColors = {
  "Mitte": "#FF3366",
  "Friedrichshain-Kreuzberg": "#33CC99",
  "Pankow": "#3399FF",
  "Charlottenburg-Wilmersdorf": "#FF9933",
  "Spandau": "#9933FF",
  "Steglitz-Zehlendorf": "#3366FF",
  "Tempelhof-Schöneberg": "#FF33CC",
  "Neukölln": "#33FFCC",
  "Treptow-Köpenick": "#FFCC33",
  "Marzahn-Hellersdorf": "#E024B1",
  "Lichtenberg": "#FF6633",
  "Reinickendorf": "#CC33FF"
};

const regionMap = {
  "alle": "alle",
  "mitte": ["Mitte"],
  "friedrichshain_kreuzberg": ["Friedrichshain-Kreuzberg"],
  "pankow": ["Pankow"],
  "charlottenburg_wilmersdorf": ["Charlottenburg-Wilmersdorf"],
  "spandau": ["Spandau"],
  "steglitz_zehlendorf": ["Steglitz-Zehlendorf"],
  "tempelhof_schoeneberg": ["Tempelhof-Schöneberg"],
  "neukoelln": ["Neukölln"],
  "treptow_koepenick": ["Treptow-Köpenick"],
  "marzahn_hellersdorf": ["Marzahn-Hellersdorf"],
  "lichtenberg": ["Lichtenberg"],
  "reinickendorf": ["Reinickendorf"]
};

const regionDisplayNames = {
  "mitte": "Mitte",
  "friedrichshain_kreuzberg": "Friedrichshain-Kreuzberg",
  "pankow": "Pankow",
  "charlottenburg_wilmersdorf": "Charlottenburg-Wilmersdorf",
  "spandau": "Spandau",
  "steglitz_zehlendorf": "Steglitz-Zehlendorf",
  "tempelhof_schoeneberg": "Tempelhof-Schöneberg",
  "neukoelln": "Neukölln",
  "treptow_koepenick": "Treptow-Köpenick",
  "marzahn_hellersdorf": "Marzahn-Hellersdorf",
  "lichtenberg": "Lichtenberg",
  "reinickendorf": "Reinickendorf"
};

function getBezirkColor(bezirkName) {
  if (bezirkColors[bezirkName]) return bezirkColors[bezirkName];
  let hash = 0;
  for (let i = 0; i < bezirkName.length; i++) hash = bezirkName.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 80%, 60%)`;
}

// App State
const appState = {
  mode: 'lernen', // 'lernen' | 'spielen'
  gameMode: 'ortsteile', // 'ortsteile' | 'quartier' | 'plr' | 'stations' | 'streets'
  customGeojson: null, // Stores uploaded GeoJSON (streets)
  customTargets: [], // Custom selected targets (polygons/points)
  difficulty: 1, // 1: Tourist, 2: Resident, 3: Taxi Driver
  region: 'alle', // 'alle' | 'radius' | 'custom' | bezirkKey
  radiusMode: {
    active: false,
    center: [13.4125, 52.5219], // Alexanderplatz
    radiusKm: 2,
    isSelectingCenter: false,
    hasCenter: true
  }
};

let mapLoaded = false;
let rawFeaturesCache = []; // Stores all raw features of the active dataset for custom checkbox filtering
let activeGeojsonData = { type: 'FeatureCollection', features: [] };
let hoveredFeatureId = null;
let selectedFeatureId = null;

// Map Styles
const mapStyles = {
  light: {
    base: 'https://a.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://a.basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}{r}.png'
  },
  dark: {
    base: 'https://a.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://a.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png'
  },
  voyager: {
    base: 'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png'
  }
};

// DOM elements
const btnLernen = document.getElementById('btn-lernen');
const btnSpielen = document.getElementById('btn-spielen');
const btnSkipTarget = document.getElementById('btn-skip-target');
const btnRestartGame = document.getElementById('btn-restart-game');
const btnSettings = document.getElementById('btn-settings');
const settingsMenu = document.getElementById('settings-menu');
const btnCloseSettings = document.getElementById('btn-close-settings');
const difficultySelect = document.getElementById('difficulty-select');
const difficultySettingGroup = document.getElementById('difficulty-setting-group');
const regionSelect = document.getElementById('region-select');
const btnConfigFilter = document.getElementById('btn-config-filter');
const radiusConfig = document.getElementById('radius-config');
const radiusSlider = document.getElementById('radius-slider');
const radiusDisplay = document.getElementById('radius-display');
const btnSelectCenter = document.getElementById('btn-select-center');
const toggleErrorNames = document.getElementById('toggle-error-names');
const toggleHoverRed = document.getElementById('toggle-hover-red');
const toggleHoverRedGroup = document.getElementById('toggle-hover-red-group');
const toggleMapLabels = document.getElementById('toggle-map-labels');
const mapStyleSelect = document.getElementById('map-style-select');
const mapStyleSettingGroup = document.getElementById('map-style-setting-group');

const lernenContent = document.getElementById('lernen-content');
const spielenContent = document.getElementById('spielen-content');
const bezirkTitleEl = document.getElementById('bezirk-title');
const ortsteilNameEl = document.getElementById('ortsteil-name');
const targetNameEl = document.getElementById('target-name');
const progressTextEl = document.getElementById('progress-text');
const dots = document.querySelectorAll('.dot');

const statsModal = document.getElementById('stats-modal');
const btnRestart = document.getElementById('btn-restart');
const btnCloseStats = document.getElementById('btn-close-stats');

const filterModal = document.getElementById('filter-modal');
const filterModalTitle = document.getElementById('filter-modal-title');
const streetUploadUi = document.getElementById('street-upload-ui');
const polygonFilterUi = document.getElementById('polygon-filter-ui');
const filterFileUpload = document.getElementById('filter-file-upload');
const filterUploadStatus = document.getElementById('filter-upload-status');
const filterCheckboxesContainer = document.getElementById('filter-checkboxes');
const filterExportInput = document.getElementById('filter-export-input');
const btnCopyFilter = document.getElementById('btn-copy-filter');
const filterImportInput = document.getElementById('filter-import-input');
const btnImportFilter = document.getElementById('btn-import-filter');
const btnSaveFilter = document.getElementById('btn-save-filter');

const customTooltip = document.getElementById('custom-tooltip');

// Instantiate MapLibre
const map = new window.maplibregl.Map({
  dragRotate: false,
  touchPitch: false,
  touchZoomRotate: true,
  container: 'map',
  style: {
    version: 8,
    sources: {
      'carto-base': {
        type: 'raster',
        tiles: [mapStyles.voyager.base],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      },
      'carto-labels': {
        type: 'raster',
        tiles: [mapStyles.voyager.labels],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }
    },
    layers: [
      {
        id: 'carto-base-layer',
        type: 'raster',
        source: 'carto-base',
        minzoom: 0,
        maxzoom: 22
      },
      {
        id: 'carto-labels-layer',
        type: 'raster',
        source: 'carto-labels',
        minzoom: 0,
        maxzoom: 22,
        layout: {
          'visibility': 'none'
        }
      }
    ]
  },
  center: [13.4050, 52.5200], // [lng, lat]
  zoom: 11,
  attributionControl: false
});

map.addControl(new window.maplibregl.AttributionControl({ compact: true }), 'bottom-right');
map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
map.touchZoomRotate.disableRotation();

// Setup GameManager
const gameManager = new GameManager(map, {
  onTargetPicked(targetName, currentProgress, totalProgress) {
    targetNameEl.textContent = targetName;
    progressTextEl.textContent = `${currentProgress}/${totalProgress}`;

    // Reset heart dots
    dots.forEach(d => d.classList.remove('lost'));
  },

  onAttemptResult(isCorrect, attempts, clickedName) {
    if (!isCorrect) {
      if (attempts <= 3) {
        dots[3 - attempts].classList.add('lost');
      }
    }
  },

  onGameFinished(stats, formattedTime) {
    document.getElementById('stat-time').textContent = formattedTime;
    document.getElementById('stat-green').textContent = stats.green;
    document.getElementById('stat-orange').textContent = stats.orange;
    document.getElementById('stat-red').textContent = stats.red;
    statsModal.classList.remove('hidden');
  }
});

// Map Load Event
map.on('load', () => {
  mapLoaded = true;

  // Create and add station icons
  const createStationIcon = (type) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';

    if (type === 'S-Bahn') {
      ctx.beginPath();
      ctx.arc(16, 16, 8, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'U-Bahn') {
      // Rounded square
      const x = 8, y = 8, w = 16, h = 16, r = 4;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'S+U-Bahn') {
      // Left side rounded square, right side circle
      ctx.beginPath();
      ctx.moveTo(16, 8);
      ctx.lineTo(12, 8);
      ctx.quadraticCurveTo(8, 8, 8, 12);
      ctx.lineTo(8, 20);
      ctx.quadraticCurveTo(8, 24, 12, 24);
      ctx.lineTo(16, 24);
      ctx.arc(16, 16, 8, Math.PI / 2, Math.PI * 1.5, true);
      ctx.closePath();
      ctx.fill();
    }

    return ctx.getImageData(0, 0, 32, 32);
  };

  map.addImage('station-sbahn-icon', createStationIcon('S-Bahn'), { sdf: true });
  map.addImage('station-ubahn-icon', createStationIcon('U-Bahn'), { sdf: true });
  map.addImage('station-subahn-icon', createStationIcon('S+U-Bahn'), { sdf: true });

  // Add sources
  map.addSource('bezirke', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('radius-circle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('kiezkenner-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    promoteId: 'name' // Use promoted name ID so split features are styled in sync
  });

  // Bezirksgrenzen Layer (black outline)
  map.addLayer({
    id: 'bezirke-layer',
    type: 'line',
    source: 'bezirke',
    paint: {
      'line-color': '#0f172a',
      'line-width': 3,
      'line-opacity': 0.8
    }
  });

  // Radius Circle Layer (dashed blue line)
  map.addLayer({
    id: 'radius-circle-layer',
    type: 'line',
    source: 'radius-circle',
    paint: {
      'line-color': '#3b82f6',
      'line-width': 3,
      'line-dasharray': [2, 1]
    }
  });

  // KiezKenner Fill Layer (for polygons: Ortsteile, PLR)
  map.addLayer({
    id: 'kiezkenner-fill-layer',
    type: 'fill',
    source: 'kiezkenner-source',
    filter: ['==', '$type', 'Polygon'],
    paint: {
      'fill-color': [
        'case',
        ['==', ['feature-state', 'state'], 'green'], '#10b981',
        ['==', ['feature-state', 'state'], 'orange'], '#f59e0b',
        ['==', ['feature-state', 'state'], 'red'], '#ef4444',
        ['boolean', ['feature-state', 'hover'], false], '#3b82f6',
        ['boolean', ['feature-state', 'selected'], false], '#3b82f6',
        '#3b82f6' // Default fill color
      ],
      'fill-opacity': [
        'case',
        ['==', ['feature-state', 'state'], 'green'], 0.45,
        ['==', ['feature-state', 'state'], 'orange'], 0.45,
        ['==', ['feature-state', 'state'], 'red'], 0.45,
        ['boolean', ['feature-state', 'hover'], false], 0.35,
        ['boolean', ['feature-state', 'selected'], false], 0.35,
        0.15 // Default fill opacity
      ]
    }
  });

  // KiezKenner Line Layer (for streets, and boundaries of polygons)
  map.addLayer({
    id: 'kiezkenner-line-layer',
    type: 'line',
    source: 'kiezkenner-source',
    filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    paint: {
      'line-color': [
        'case',
        ['==', ['feature-state', 'state'], 'green'], '#10b981',
        ['==', ['feature-state', 'state'], 'orange'], '#f59e0b',
        ['==', ['feature-state', 'state'], 'red'], '#ef4444',
        ['boolean', ['feature-state', 'hover'], false], '#1e3a8a',
        ['boolean', ['feature-state', 'selected'], false], '#1e3a8a',
        '#1d4ed8' // Default line color
      ],
      'line-width': [
        'case',
        ['==', ['get', '_geomType'], 'LineString'],
        [ // Street width styles
          'case',
          ['boolean', ['feature-state', 'hover'], false], 8,
          ['boolean', ['feature-state', 'selected'], false], 8,
          ['!=', ['feature-state', 'state'], null], 6,
          4 // Default street width
        ],
        [ // Polygon boundary width styles
          'case',
          ['boolean', ['feature-state', 'hover'], false], 3,
          ['boolean', ['feature-state', 'selected'], false], 3,
          1.5 // Default boundary width
        ]
      ],
      'line-opacity': [
        'case',
        ['==', ['get', '_geomType'], 'LineString'],
        [ // Street opacity styles
          'case',
          ['boolean', ['feature-state', 'hover'], false], 1,
          ['boolean', ['feature-state', 'selected'], false], 1,
          ['!=', ['feature-state', 'state'], null], 1,
          0.8
        ],
        0.8 // Polygon boundary opacity style
      ]
    }
  });

  // KiezKenner Point Layer (for circles: Quartiere or others without station_type)
  map.addLayer({
    id: 'kiezkenner-point-layer',
    type: 'circle',
    source: 'kiezkenner-source',
    filter: ['all', ['==', '$type', 'Point'], ['!', ['has', 'station_type']]],
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 12,
        ['boolean', ['feature-state', 'selected'], false], 12,
        ['!=', ['feature-state', 'state'], null], 10,
        8 // Default circle radius
      ],
      'circle-color': [
        'case',
        ['==', ['feature-state', 'state'], 'green'], '#10b981',
        ['==', ['feature-state', 'state'], 'orange'], '#f59e0b',
        ['==', ['feature-state', 'state'], 'red'], '#ef4444',
        ['boolean', ['feature-state', 'hover'], false], '#1e3a8a',
        ['boolean', ['feature-state', 'selected'], false], '#1e3a8a',
        '#3b82f6' // Default point color (for Quartiere or others)
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  // KiezKenner Station Background Layer (soft glow behind hovered/selected/answered stations)
  map.addLayer({
    id: 'kiezkenner-point-bg-layer',
    type: 'circle',
    source: 'kiezkenner-source',
    minzoom: STATION_ZOOM_THRESHOLD,
    filter: ['all', ['==', '$type', 'Point'], ['has', 'station_type']],
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 14,
        ['boolean', ['feature-state', 'selected'], false], 14,
        ['!=', ['feature-state', 'state'], null], 11,
        0
      ],
      'circle-color': [
        'case',
        ['==', ['feature-state', 'state'], 'green'], '#10b981',
        ['==', ['feature-state', 'state'], 'orange'], '#f59e0b',
        ['==', ['feature-state', 'state'], 'red'], '#ef4444',
        '#3b82f6' // Hover/selection color
      ],
      'circle-opacity': [
        'case',
        ['!=', ['feature-state', 'state'], null], 0.25,
        0.4
      ]
    }
  });

  // KiezKenner Station Icon Layer (rendered as custom SDF symbols)
  map.addLayer({
    id: 'kiezkenner-station-layer',
    type: 'symbol',
    source: 'kiezkenner-source',
    minzoom: STATION_ZOOM_THRESHOLD,
    filter: ['all', ['==', '$type', 'Point'], ['has', 'station_type']],
    layout: {
      'icon-image': [
        'case',
        ['==', ['get', 'station_type'], 'S-Bahn'], 'station-sbahn-icon',
        ['==', ['get', 'station_type'], 'U-Bahn'], 'station-ubahn-icon',
        'station-subahn-icon'
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    },
    paint: {
      'icon-color': [
        'case',
        ['==', ['feature-state', 'state'], 'green'], '#10b981',
        ['==', ['feature-state', 'state'], 'orange'], '#f59e0b',
        ['==', ['feature-state', 'state'], 'red'], '#ef4444',
        ['boolean', ['feature-state', 'hover'], false], '#1e3a8a',
        ['boolean', ['feature-state', 'selected'], false], '#1e3a8a',
        ['get', 'line_color']
      ],
      'icon-halo-color': '#ffffff',
      'icon-halo-width': 2
    }
  });

  // KiezKenner Station Circle Layer (rendered as simple circles when zoomed out)
  map.addLayer({
    id: 'kiezkenner-station-circle-layer',
    type: 'circle',
    source: 'kiezkenner-source',
    maxzoom: STATION_ZOOM_THRESHOLD,
    filter: ['all', ['==', '$type', 'Point'], ['has', 'station_type']],
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 8,
        ['boolean', ['feature-state', 'selected'], false], 8,
        ['!=', ['feature-state', 'state'], null], 6,
        4.5 // Default circle radius when zoomed out
      ],
      'circle-color': [
        'case',
        ['==', ['feature-state', 'state'], 'green'], '#10b981',
        ['==', ['feature-state', 'state'], 'orange'], '#f59e0b',
        ['==', ['feature-state', 'state'], 'red'], '#ef4444',
        ['boolean', ['feature-state', 'hover'], false], '#1e3a8a',
        ['boolean', ['feature-state', 'selected'], false], '#1e3a8a',
        ['get', 'line_color']
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff'
    }
  });

  // Fetch Bezirksgrenzen
  fetch('./bezirksgrenzen.geojson')
    .then(resp => resp.json())
    .then(data => { map.getSource('bezirke').setData(data); })
    .catch(err => console.error("Could not load bezirksgrenzen.geojson", err));

  // Load custom map data from localStorage if exists
  const savedCustomMap = localStorage.getItem('berlinmemo_custom_map');
  if (savedCustomMap) {
    try {
      const geojson = JSON.parse(savedCustomMap);
      if (geojson && geojson.type === 'FeatureCollection' && geojson.features.length > 0) {
        appState.customGeojson = geojson;
      }
    } catch (e) {
      console.error("Error loading custom map from localStorage", e);
    }
  }

  // Setup interactions and load initial dataset
  setupMapInteractions();
  loadGameModeDataset();
});

// Setup click and hover interactions
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const CLICK_TOLERANCE = isMobile ? 14 : 4;

function setupMapInteractions() {
  const distToSegment = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  const distToFeature = (pt, feature) => {
    const geom = feature.geometry;
    if (geom.type === 'Point') {
      const proj = map.project(geom.coordinates);
      return Math.hypot(pt.x - proj.x, pt.y - proj.y);
    }
    let rings;
    if (geom.type === 'LineString') rings = [geom.coordinates];
    else if (geom.type === 'MultiLineString' || geom.type === 'Polygon') rings = geom.coordinates;
    else if (geom.type === 'MultiPolygon') rings = geom.coordinates.flat();
    else return Infinity;

    let min = Infinity;
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = map.project(ring[i]);
        const b = map.project(ring[i + 1]);
        const d = distToSegment(pt, a, b);
        if (d < min) min = d;
      }
      if (ring.length === 1) {
        const p = map.project(ring[0]);
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < min) min = d;
      }
    }
    return min;
  };

  const getFeatureAtPoint = (point) => {
    const bbox = [
      [point.x - CLICK_TOLERANCE, point.y - CLICK_TOLERANCE],
      [point.x + CLICK_TOLERANCE, point.y + CLICK_TOLERANCE]
    ];
    const layers = ['kiezkenner-fill-layer', 'kiezkenner-line-layer', 'kiezkenner-point-layer', 'kiezkenner-station-layer', 'kiezkenner-station-circle-layer'].filter(l => map.getLayer(l));
    const features = map.queryRenderedFeatures(bbox, { layers });
    if (features.length === 0) return null;

    // Prioritize direct hits on polygon fills
    const fillHits = features.filter(f => f.layer.id === 'kiezkenner-fill-layer');
    if (fillHits.length > 0) {
      return fillHits[0];
    }

    if (features.length === 1) return features[0];

    let closest = null;
    let minDist = Infinity;
    for (const f of features) {
      const d = distToFeature(point, f);
      if (d < minDist) { minDist = d; closest = f; }
    }
    return closest;
  };

  // Hover Tooltips and Highlight
  map.on('mousemove', (e) => {
    if (appState.radiusMode.isSelectingCenter) {
      map.getCanvas().style.cursor = 'crosshair';
      return;
    }

    const feature = getFeatureAtPoint(e.point);
    if (feature) {
      map.getCanvas().style.cursor = 'pointer';
      const id = feature.properties.name;

      if (hoveredFeatureId !== id) {
        if (hoveredFeatureId !== null) {
          map.setFeatureState({ source: 'kiezkenner-source', id: hoveredFeatureId }, { hover: false });
        }
        hoveredFeatureId = id;
        map.setFeatureState({ source: 'kiezkenner-source', id: hoveredFeatureId }, { hover: true });

        if (appState.mode === 'lernen') {
          updateHeaderInfo(feature.properties.name, feature.properties.BEZIRK || 'Unbekannt');
        }
      }

      // Hide hover tooltip if answered in Spielen to avoid duplication
      let showTooltip = (appState.mode === 'lernen' || !gameManager.inProgress);
      if (isMobile && gameManager.inProgress) {
        const featureState = map.getFeatureState({ source: 'kiezkenner-source', id: feature.properties.name });
        if (featureState && featureState.state) showTooltip = false;
      }

      if (showTooltip) {
        let tooltipHtml = feature.properties.name;
        if (feature.properties.notes) {
          tooltipHtml += `<br><span style="font-size: 0.8em; opacity: 0.8;">${feature.properties.notes}</span>`;
        } else if (feature.properties.station_type) {
          tooltipHtml += ` (${feature.properties.station_type})`;
        }
        customTooltip.innerHTML = tooltipHtml;
        customTooltip.style.left = e.point.x + 'px';
        customTooltip.style.top = e.point.y + 'px';
        customTooltip.classList.add('visible');
      } else {
        customTooltip.classList.remove('visible');
      }
    } else {
      map.getCanvas().style.cursor = '';
      customTooltip.classList.remove('visible');

      if (hoveredFeatureId !== null) {
        map.setFeatureState({ source: 'kiezkenner-source', id: hoveredFeatureId }, { hover: false });
        hoveredFeatureId = null;
      }

      if (appState.mode === 'lernen') {
        if (selectedFeatureId !== null) {
          updateHeaderInfo(selectedFeatureId, getBezirkForFeatureName(selectedFeatureId));
        } else {
          resetHeaderInfo();
        }
      }
    }
  });

  // Map Clicks
  map.on('click', (e) => {
    // 1. Center Selection for Umkreis Mode
    if (appState.radiusMode.isSelectingCenter) {
      appState.radiusMode.center = [e.lngLat.lng, e.lngLat.lat];
      appState.radiusMode.isSelectingCenter = false;
      appState.radiusMode.hasCenter = true;
      map.getCanvas().style.cursor = '';
      btnSelectCenter.textContent = "Zentrum auf Karte wählen";
      btnSelectCenter.style.backgroundColor = "";
      loadGameModeDataset();
      return;
    }

    // 2. Interactive Feature Clicks (Lernen / Spielen)
    const feature = getFeatureAtPoint(e.point);
    if (feature) {
      const clickedName = feature.properties.name;

      if (appState.mode === 'lernen') {
        if (selectedFeatureId !== null) {
          map.setFeatureState({ source: 'kiezkenner-source', id: selectedFeatureId }, { selected: false });
        }
        selectedFeatureId = clickedName;
        map.setFeatureState({ source: 'kiezkenner-source', id: selectedFeatureId }, { selected: true });
        updateHeaderInfo(clickedName, feature.properties.BEZIRK || 'Unbekannt');
      } else {
        customTooltip.classList.remove('visible');

        // Let GameManager process the click guess
        const showNames = toggleErrorNames.checked;
        const showNamesOnAnswered = toggleHoverRed.checked;
        gameManager.handleGuess(clickedName, feature, [e.lngLat.lng, e.lngLat.lat], showNames, showNamesOnAnswered);
      }
    }
  });
}

function getBezirkForFeatureName(name) {
  const f = activeGeojsonData.features.find(feat => feat.properties.name === name);
  return f ? (f.properties.BEZIRK || 'Unbekannt') : 'Unbekannt';
}

function updateHeaderInfo(name, bezirk) {
  bezirkTitleEl.textContent = name;
  ortsteilNameEl.textContent = `Bezirk: ${bezirk}`;
  bezirkTitleEl.style.color = getBezirkColor(bezirk);
  bezirkTitleEl.style.background = 'none';
  bezirkTitleEl.style.webkitTextFillColor = 'initial';
}

function resetHeaderInfo() {
  bezirkTitleEl.textContent = "Berlin";
  ortsteilNameEl.textContent = appState.gameMode === 'streets'
    ? 'Wähle eine Straße'
    : (appState.gameMode === 'stations' ? 'Wähle einen Bahnhof' : 'Wähle einen Ortsteil');
  bezirkTitleEl.style.color = '#A5B4FC';
  bezirkTitleEl.style.background = 'none';
  bezirkTitleEl.style.webkitTextFillColor = 'initial';
}

// Data Loader orchestration
async function loadGameModeDataset() {
  if (!mapLoaded) return;

  // Clear radius circle layer if not in streets radius mode
  if ((appState.gameMode !== 'streets' || appState.region !== 'radius') && map.getSource('radius-circle')) {
    map.getSource('radius-circle').setData({ type: 'FeatureCollection', features: [] });
  }

  ortsteilNameEl.textContent = "Lade Daten...";

  try {
    let geojson;
    if (appState.gameMode === 'ortsteile' || appState.gameMode === 'plr') {
      geojson = await polygonEngine.loadData(
        appState.gameMode,
        appState.region,
        appState.customTargets,
        regionMap
      );
    } else if (appState.gameMode === 'quartier' || appState.gameMode === 'stations') {
      geojson = await pointEngine.loadData(
        appState.gameMode,
        appState.region,
        appState.customTargets,
        regionMap
      );
    } else if (appState.gameMode === 'streets') {
      geojson = await streetEngine.loadData(
        appState.region,
        appState.difficulty,
        appState.radiusMode,
        appState.customGeojson,
        map
      );
    }

    activeGeojsonData = geojson;
    rawFeaturesCache = geojson.rawFeatures || geojson.features;

    // Refresh region-select option labels based on counts
    populateRegionSelect(rawFeaturesCache, appState.gameMode);

    // Update Map source
    map.getSource('kiezkenner-source').setData(geojson);

    fitMapToBounds();

    // If game is in progress, restart or resume
    if (appState.mode === 'spielen') {
      resumeSpielenMode();
    } else {
      resetLernenMode();
    }
  } catch (err) {
    console.error(err);
    ortsteilNameEl.textContent = "Fehler beim Laden der Kartendaten.";
    ortsteilNameEl.style.color = "#ef4444";
  }
}

function fitMapToBounds() {
  if (!mapLoaded || !activeGeojsonData || activeGeojsonData.features.length === 0) return;

  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;

  activeGeojsonData.features.forEach(f => {
    const processCoord = (coord) => {
      if (coord[0] < minLng) minLng = coord[0];
      if (coord[0] > maxLng) maxLng = coord[0];
      if (coord[1] < minLat) minLat = coord[1];
      if (coord[1] > maxLat) maxLat = coord[1];
    };

    if (f.geometry.type === 'Point') {
      processCoord(f.geometry.coordinates);
    } else if (f.geometry.type === 'LineString') {
      f.geometry.coordinates.forEach(processCoord);
    } else if (f.geometry.type === 'MultiLineString' || f.geometry.type === 'Polygon') {
      f.geometry.coordinates.forEach(line => line.forEach(processCoord));
    } else if (f.geometry.type === 'MultiPolygon') {
      f.geometry.coordinates.forEach(poly => poly.forEach(line => line.forEach(processCoord)));
    }
  });

  if (minLng < maxLng && minLat < maxLat) {
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, duration: 800 });
  }
}

// Build dropdown select items based on active gameMode
function populateRegionSelect(rawFeatures, gameMode) {
  regionSelect.innerHTML = '';

  if (gameMode === 'streets') {
    const optRadius = document.createElement('option');
    optRadius.value = 'radius';
    optRadius.textContent = 'Umkreis (Radius)';
    regionSelect.appendChild(optRadius);

    const optCustom = document.createElement('option');
    optCustom.value = 'custom';
    optCustom.textContent = 'Eigene Karte';
    regionSelect.appendChild(optCustom);

    Object.keys(regionDisplayNames).forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = regionDisplayNames[key];
      regionSelect.appendChild(opt);
    });
  } else {
    const typeName = gameMode === 'ortsteile' ? 'Ortsteile' :
      (gameMode === 'plr' ? 'PLR' :
        (gameMode === 'quartier' ? 'Quartiere' : 'Bahnhöfe'));

    const optAlle = document.createElement('option');
    optAlle.value = 'alle';
    optAlle.textContent = `alle ${rawFeatures.length} ${typeName}`;
    regionSelect.appendChild(optAlle);

    if (gameMode !== 'stations') {
      const optCustom = document.createElement('option');
      optCustom.value = 'custom';
      optCustom.textContent = 'Benutzerdefiniert';
      regionSelect.appendChild(optCustom);
    }

    Object.keys(regionDisplayNames).forEach(key => {
      const bezirkeNames = regionMap[key];
      const count = rawFeatures.filter(f => bezirkeNames.includes(f.properties.BEZIRK)).length;

      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${count} ${typeName} - ${regionDisplayNames[key]}`;
      regionSelect.appendChild(opt);
    });
  }

  // Keep active region selection if available in options, otherwise default
  const values = Array.from(regionSelect.options).map(o => o.value);
  if (values.includes(appState.region)) {
    regionSelect.value = appState.region;
  } else {
    appState.region = gameMode === 'streets' ? 'radius' : 'alle';
    regionSelect.value = appState.region;
  }
}

// Rebuild custom polygon filter checkbox list
function rebuildCustomFilter() {
  const names = Array.from(new Set(rawFeaturesCache.map(f => f.properties.name))).sort();
  filterCheckboxesContainer.innerHTML = '';

  names.forEach(name => {
    const lbl = document.createElement('label');
    lbl.style.display = 'flex';
    lbl.style.alignItems = 'center';
    lbl.style.cursor = 'pointer';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = name;
    cb.style.marginRight = '6px';
    cb.checked = appState.customTargets.includes(name);

    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!appState.customTargets.includes(name)) appState.customTargets.push(name);
      } else {
        appState.customTargets = appState.customTargets.filter(item => item !== name);
      }
      updateExportString();
    });

    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(name));
    filterCheckboxesContainer.appendChild(lbl);
  });
  updateExportString();
}

function updateExportString() {
  filterExportInput.value = btoa(unescape(encodeURIComponent(JSON.stringify(appState.customTargets))));
}

// Mode Switches
function switchMode(mode) {
  appState.mode = mode;

  if (mode === 'lernen') {
    btnLernen.classList.add('active');
    btnSpielen.classList.remove('active');
    lernenContent.classList.remove('hidden');
    spielenContent.classList.add('hidden');
    statsModal.classList.add('hidden');
    btnRestartGame.style.display = 'none';
    btnSkipTarget.style.display = 'none';
    gameManager.pause();
    resetLernenMode();
  } else {
    btnSpielen.classList.add('active');
    btnLernen.classList.remove('active');
    spielenContent.classList.remove('hidden');
    lernenContent.classList.add('hidden');
    statsModal.classList.add('hidden');
    btnRestartGame.style.display = 'flex';
    btnSkipTarget.style.display = 'flex';
    resumeSpielenMode();
  }
}

function resetLernenMode() {
  if (hoveredFeatureId !== null) {
    map.removeFeatureState({ source: 'kiezkenner-source', id: hoveredFeatureId }, 'hover');
    hoveredFeatureId = null;
  }
  if (selectedFeatureId !== null) {
    map.removeFeatureState({ source: 'kiezkenner-source', id: selectedFeatureId }, 'selected');
    selectedFeatureId = null;
  }
  resetHeaderInfo();
}

function resumeSpielenMode() {
  if (!gameManager.inProgress) {
    // Gather all unique target names
    const names = Array.from(new Set(activeGeojsonData.features.map(f => f.properties.name))).filter(Boolean);
    gameManager.start(names);
  } else {
    gameManager.resume();
  }
}

// Adapt Settings Menu for current active game mode
function adaptSettingsMenu() {
  const isStreets = appState.gameMode === 'streets';
  difficultySettingGroup.classList.toggle('hidden', !isStreets);
  mapStyleSettingGroup.classList.toggle('hidden', !isStreets);
  toggleHoverRedGroup.classList.toggle('hidden', false);

  // Update radius config visibility
  radiusConfig.classList.toggle('hidden', !isStreets || appState.region !== 'radius');

  // Show / Hide filter config button based on mode and selection
  const showFilterConfig = appState.region === 'custom' && appState.gameMode !== 'stations';
  btnConfigFilter.classList.toggle('hidden', !showFilterConfig);

  // Enable / Disable difficulty select in Custom mode
  const isCustom = appState.region === 'custom';
  difficultySelect.disabled = isCustom;
  const difficultyLabel = document.querySelector('label[for="difficulty-select"]');
  if (difficultyLabel) {
    difficultyLabel.style.opacity = isCustom ? '0.5' : '1';
  }
  difficultySelect.title = isCustom ? "Bei eigenen Karten werden immer alle Elemente angezeigt." : "";
}

// Event Listeners
btnLernen.addEventListener('click', () => switchMode('lernen'));
btnSpielen.addEventListener('click', () => switchMode('spielen'));

btnRestart.addEventListener('click', () => {
  statsModal.classList.add('hidden');
  gameManager.inProgress = false;
  switchMode('spielen');
});

btnCloseStats.addEventListener('click', () => {
  statsModal.classList.add('hidden');
});

btnRestartGame.addEventListener('click', () => {
  gameManager.inProgress = false;
  resumeSpielenMode();
});

btnSkipTarget.addEventListener('click', () => {
  gameManager.skip();
});

btnSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsMenu.classList.toggle('hidden');
});

btnCloseSettings.addEventListener('click', () => {
  settingsMenu.classList.add('hidden');
});

// Close settings if clicked outside
document.addEventListener('click', (e) => {
  if (!settingsMenu.classList.contains('hidden')) {
    if (!settingsMenu.contains(e.target) && !btnSettings.contains(e.target)) {
      settingsMenu.classList.add('hidden');
    }
  }
});

// Region Select change listener
regionSelect.addEventListener('change', () => {
  appState.region = regionSelect.value;
  appState.radiusMode.active = (appState.region === 'radius');

  adaptSettingsMenu();

  if (appState.region === 'custom' && appState.gameMode !== 'stations') {
    // Open modal directly when custom is selected
    settingsMenu.classList.add('hidden');
    openFilterModal();
  }

  if (appState.region === 'radius' && appState.gameMode === 'streets') {
    appState.radiusMode.isSelectingCenter = true;
    appState.radiusMode.hasCenter = false;
    map.getCanvas().style.cursor = 'crosshair';
    btnSelectCenter.textContent = "Klicke auf die Karte...";
    btnSelectCenter.style.backgroundColor = "#f59e0b"; // Orange alert highlight

    // Clear map layers for radius configuration
    map.getSource('kiezkenner-source').setData({ type: 'FeatureCollection', features: [] });
    map.getSource('radius-circle').setData({ type: 'FeatureCollection', features: [] });

    ortsteilNameEl.textContent = "Wähle ein Zentrum auf der Karte...";
    bezirkTitleEl.textContent = "Umkreis-Modus";
    bezirkTitleEl.style.color = '#A5B4FC';
    bezirkTitleEl.style.background = 'none';
    bezirkTitleEl.style.webkitTextFillColor = 'initial';
  } else {
    appState.radiusMode.isSelectingCenter = false;
    map.getCanvas().style.cursor = '';
    btnSelectCenter.textContent = "Zentrum auf Karte wählen";
    btnSelectCenter.style.backgroundColor = "";

    // Load data for the selected region
    gameManager.inProgress = false;
    loadGameModeDataset();
  }
});

// Radius configuration slider and button
radiusSlider.addEventListener('input', (e) => {
  radiusDisplay.textContent = e.target.value;
});

radiusSlider.addEventListener('change', (e) => {
  appState.radiusMode.radiusKm = parseFloat(e.target.value);
  if (appState.radiusMode.active && appState.radiusMode.hasCenter) {
    gameManager.inProgress = false;
    loadGameModeDataset();
  }
});

btnSelectCenter.addEventListener('click', (e) => {
  e.stopPropagation();
  appState.radiusMode.isSelectingCenter = !appState.radiusMode.isSelectingCenter;
  if (appState.radiusMode.isSelectingCenter) {
    map.getCanvas().style.cursor = 'crosshair';
    btnSelectCenter.textContent = "Klicke auf die Karte...";
    btnSelectCenter.style.backgroundColor = "#f59e0b";
  } else {
    map.getCanvas().style.cursor = '';
    btnSelectCenter.textContent = "Zentrum auf Karte wählen";
    btnSelectCenter.style.backgroundColor = "";
  }
});

// Difficulty select change
difficultySelect.addEventListener('change', () => {
  appState.difficulty = parseInt(difficultySelect.value);
  gameManager.inProgress = false;
  loadGameModeDataset();
});

// Map Labels Toggle
toggleMapLabels.addEventListener('change', () => {
  if (map.getLayer('carto-labels-layer')) {
    map.setLayoutProperty('carto-labels-layer', 'visibility', toggleMapLabels.checked ? 'visible' : 'none');
  }
});

// Map style switcher
mapStyleSelect.addEventListener('change', () => {
  const style = mapStyles[mapStyleSelect.value];
  if (style) {
    if (map.getSource('carto-base')) map.getSource('carto-base').setTiles([style.base]);
    if (map.getSource('carto-labels')) map.getSource('carto-labels').setTiles([style.labels]);
  }
});

// Game Mode Button click handler
const gameModeBtns = document.querySelectorAll('.game-mode-btn');
gameModeBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    gameModeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    appState.gameMode = btn.getAttribute('data-gamemode');

    // Clear and adjust state variables
    appState.region = appState.gameMode === 'streets' ? 'radius' : 'alle';
    appState.radiusMode.active = (appState.region === 'radius');
    appState.radiusMode.isSelectingCenter = false;
    appState.radiusMode.hasCenter = true; // default center on Alex active
    appState.customTargets = [];

    adaptSettingsMenu();
    gameManager.inProgress = false;
    loadGameModeDataset();
  });
});

// Filter Modals Toggle
btnConfigFilter.addEventListener('click', () => {
  settingsMenu.classList.add('hidden');
  openFilterModal();
});

function openFilterModal() {
  filterModal.classList.remove('hidden');

  if (appState.gameMode === 'streets') {
    filterModalTitle.textContent = "Eigene Straßenkarte";
    streetUploadUi.classList.remove('hidden');
    polygonFilterUi.classList.add('hidden');
  } else {
    filterModalTitle.textContent = `Eigene ${appState.gameMode === 'ortsteile' ? 'Ortsteile' : (appState.gameMode === 'plr' ? 'PLR' : 'Quartiere')} wählen`;
    streetUploadUi.classList.add('hidden');
    polygonFilterUi.classList.remove('hidden');
    rebuildCustomFilter();
  }
}

btnSaveFilter.addEventListener('click', () => {
  filterModal.classList.add('hidden');
  gameManager.inProgress = false;
  loadGameModeDataset();
});

// Street GeoJSON Upload
filterFileUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const geojson = JSON.parse(evt.target.result);
      if (geojson.type === 'FeatureCollection') {
        appState.customGeojson = geojson;
        filterUploadStatus.style.display = 'block';

        setTimeout(() => {
          filterUploadStatus.style.display = 'none';
          filterModal.classList.add('hidden');
          gameManager.inProgress = false;
          loadGameModeDataset();
          filterFileUpload.value = '';
        }, 600);
      } else {
        alert('Ungültiges GeoJSON Format. Muss eine FeatureCollection sein.');
      }
    } catch (err) {
      alert('Fehler beim Lesen der Datei: ' + err.message);
    }
  };
  reader.readAsText(file);
});

// Copy export string
btnCopyFilter.addEventListener('click', () => {
  filterExportInput.select();
  document.execCommand('copy');
});

// Import string
btnImportFilter.addEventListener('click', () => {
  try {
    const val = filterImportInput.value.trim();
    if (!val) return;
    const parsed = JSON.parse(decodeURIComponent(escape(atob(val))));
    if (Array.isArray(parsed)) {
      appState.customTargets = parsed;
      Array.from(filterCheckboxesContainer.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
        cb.checked = parsed.includes(cb.value);
      });
      updateExportString();
      filterImportInput.value = '';
      alert('Import erfolgreich!');
    }
  } catch (e) {
    alert('Ungültiger Import-String!');
  }
});

// Initialize UI
adaptSettingsMenu();
