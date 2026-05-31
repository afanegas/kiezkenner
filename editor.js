// editor.js
let mapLoaded = false;
let masterData = null; // To hold berlin_streets.geojson
let customFeatureCollection = { type: 'FeatureCollection', features: [] };
let activeMode = 'street'; // 'street', 'point', 'note'
let selectedFeatureForNote = null;
let hoveredMasterId = null;
let toastTimeout = null;

// DOM Elements
const btnDownload = document.getElementById('btn-download');
const uploadGeojson = document.getElementById('upload-geojson');

const modeStreet = document.getElementById('mode-street');
const modePoint = document.getElementById('mode-point');
const modeNote = document.getElementById('mode-note');

const toolStreet = document.getElementById('tool-street');
const toolPoint = document.getElementById('tool-point');
const toolNote = document.getElementById('tool-note');

const searchInput = document.getElementById('search-street-input');
const searchResults = document.getElementById('search-results');

const pointModal = document.getElementById('point-name-modal');
const modalPointNameInput = document.getElementById('modal-point-name-input');
const modalPointNoteInput = document.getElementById('modal-point-note-input');
const btnModalPointSave = document.getElementById('btn-modal-point-save');
const btnModalPointCancel = document.getElementById('btn-modal-point-cancel');

const btnNewMap = document.getElementById('btn-new-map');
const confirmModal = document.getElementById('confirm-modal');
const btnConfirmOk = document.getElementById('btn-confirm-ok');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

let pendingPointData = null;

const noteEditor = document.getElementById('note-editor');
const noteTargetName = document.getElementById('note-target-name');
const noteInput = document.getElementById('note-input');
const btnSaveNote = document.getElementById('btn-save-note');
const btnDeleteNote = document.getElementById('btn-delete-note');

const featureCount = document.getElementById('feature-count');
const featureList = document.getElementById('feature-list');

const editorTooltip = document.getElementById('editor-tooltip');
const editorToast = document.getElementById('editor-toast');
const loadingOverlay = document.getElementById('loading-overlay');

// Sidebar toggle helpers
const btnMinimizeSidebar = document.getElementById('btn-minimize-sidebar');
const btnRestoreSidebar = document.getElementById('btn-restore-sidebar');

function collapseSidebar() {
  document.getElementById('editor-sidebar').classList.add('collapsed');
  btnRestoreSidebar.classList.remove('hidden');
}

function expandSidebar() {
  document.getElementById('editor-sidebar').classList.remove('collapsed');
  btnRestoreSidebar.classList.add('hidden');
}

if (btnMinimizeSidebar) {
  btnMinimizeSidebar.onclick = (e) => {
    e.stopPropagation();
    collapseSidebar();
  };
}

if (btnRestoreSidebar) {
  btnRestoreSidebar.onclick = (e) => {
    e.stopPropagation();
    expandSidebar();
  };
}

// Toast helper
function showToast(message, isError = false) {
  if (toastTimeout) clearTimeout(toastTimeout);
  editorToast.textContent = message;
  editorToast.classList.toggle('toast-error', isError);
  editorToast.classList.add('visible');
  toastTimeout = setTimeout(() => {
    editorToast.classList.remove('visible');
  }, 2000);
}

// Initialize MapLibre Map — use light_all for street name labels
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      'carto-light': {
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }
    },
    layers: [{
      id: 'carto-light-layer',
      type: 'raster',
      source: 'carto-light',
      minzoom: 0,
      maxzoom: 22
    }]
  },
  center: [13.4050, 52.5200],
  zoom: 11,
  attributionControl: false
});
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

map.on('load', async () => {
  mapLoaded = true;

  // Add source and layers for custom features
  map.addSource('custom-data', { type: 'geojson', data: customFeatureCollection, promoteId: 'id' });
  
  // Lines
  map.addLayer({
    id: 'custom-lines',
    type: 'line',
    source: 'custom-data',
    filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    paint: {
      'line-color': '#10b981',
      'line-width': 5,
      'line-opacity': 0.9
    }
  });

  // Points
  map.addLayer({
    id: 'custom-points',
    type: 'circle',
    source: 'custom-data',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-color': '#f59e0b',
      'circle-radius': 7,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  // Interaction for Note tool
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const CLICK_TOLERANCE = isMobile ? 14 : 4;

  // Interactive layers for custom features
  const interactiveLayers = ['custom-lines', 'custom-points'];

  // Helper to find features under/near a point
  const getFeatureAtPoint = (point, layers) => {
    const bbox = [
      [point.x - CLICK_TOLERANCE, point.y - CLICK_TOLERANCE],
      [point.x + CLICK_TOLERANCE, point.y + CLICK_TOLERANCE]
    ];
    const features = map.queryRenderedFeatures(bbox, { layers });
    return features.length > 0 ? features[0] : null;
  };

  map.on('mousemove', (e) => {
    // 1. Hover on custom features (already added) in any mode
    const customFeature = getFeatureAtPoint(e.point, interactiveLayers);
    if (customFeature) {
      map.getCanvas().style.cursor = 'pointer';
      // If we are in street mode, make sure to hide the tooltip of background streets
      editorTooltip.classList.remove('visible');
      if (hoveredMasterId !== null) {
        if (map.getSource('master-streets')) {
          map.setFeatureState({ source: 'master-streets', id: hoveredMasterId }, { hover: false });
        }
        hoveredMasterId = null;
      }
      return;
    }

    // 2. In street mode, handle master streets hover
    if (activeMode === 'street' && map.getLayer('master-streets-layer')) {
      const masterFeature = getFeatureAtPoint(e.point, ['master-streets-layer']);
      
      if (masterFeature) {
        map.getCanvas().style.cursor = 'pointer';
        
        const newId = masterFeature.properties.id || masterFeature.id;
        if (hoveredMasterId !== newId) {
          // Clear previous hover
          if (hoveredMasterId !== null) {
            map.setFeatureState({ source: 'master-streets', id: hoveredMasterId }, { hover: false });
          }
          hoveredMasterId = newId;
          map.setFeatureState({ source: 'master-streets', id: hoveredMasterId }, { hover: true });
        }

        // Show tooltip
        const name = masterFeature.properties.name || 'Unbekannt';
        const bezirk = masterFeature.properties.BEZIRK || '';
        const oteil = masterFeature.properties.OTEIL || '';
        let locationText = bezirk;
        if (oteil && oteil !== bezirk && oteil !== 'Unbekannt') {
          locationText = `${oteil}, ${bezirk}`;
        }

        editorTooltip.innerHTML = `
          <div>${name}</div>
          ${locationText ? `<div class="tooltip-location">${locationText}</div>` : ''}
          <div class="tooltip-hint">Klicken zum Hinzufügen</div>
        `;
        editorTooltip.style.left = (e.point.x + 16) + 'px';
        editorTooltip.style.top = (e.point.y - 10) + 'px';
        editorTooltip.classList.add('visible');
        return;
      } else {
        // No master feature — clear hover
        if (hoveredMasterId !== null) {
          map.setFeatureState({ source: 'master-streets', id: hoveredMasterId }, { hover: false });
          hoveredMasterId = null;
        }
        editorTooltip.classList.remove('visible');
        map.getCanvas().style.cursor = '';
      }
    } else {
      // Not in street mode — clear any lingering hover
      if (hoveredMasterId !== null) {
        if (map.getSource('master-streets')) {
          map.setFeatureState({ source: 'master-streets', id: hoveredMasterId }, { hover: false });
        }
        hoveredMasterId = null;
      }
      editorTooltip.classList.remove('visible');
      map.getCanvas().style.cursor = activeMode === 'point' ? 'crosshair' : '';
    }
  });

  map.on('click', (e) => {
    // 0. Check if clicked on an already-added custom feature to delete/edit it
    const customFeature = getFeatureAtPoint(e.point, interactiveLayers);
    if (customFeature) {
      const id = customFeature.properties.id || customFeature.id;
      const name = customFeature.properties.name || 'Landmarke';

      // Load in the Bearbeiten module in the left sidebar
      selectFeatureForNote(id);

      const popupContent = document.createElement('div');
      popupContent.style.color = '#1f2937';
      popupContent.style.padding = '6px';
      popupContent.style.fontFamily = "'Inter', sans-serif";
      popupContent.style.minWidth = '140px';
      popupContent.innerHTML = `
        <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 8px; color: #111827;">${name}</div>
        <button id="popup-delete-btn" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.8rem; width: 100%; text-align: center; transition: background 0.2s;">
          Element löschen
        </button>
      `;

      const btn = popupContent.querySelector('#popup-delete-btn');
      btn.onmouseover = () => btn.style.background = '#dc2626';
      btn.onmouseout = () => btn.style.background = '#ef4444';

      const popup = new maplibregl.Popup({ closeButton: true })
        .setLngLat(e.lngLat)
        .setDOMContent(popupContent)
        .addTo(map);

      btn.onclick = () => {
        removeFeature(id);
        popup.remove();
        showToast(`✓ ${name} gelöscht`);
      };
      return; // Intercepted, do not add any background streets or trigger other clicks
    }

    // 1. Street mode — click to add from master
    if (activeMode === 'street' && map.getLayer('master-streets-layer')) {
      const masterFeature = getFeatureAtPoint(e.point, ['master-streets-layer']);
      if (masterFeature && masterData) {
        const id = masterFeature.properties.id || masterFeature.id;
        const streetFeature = masterData.features.find(f => f.id === id || f.properties.id === id);
        if (!streetFeature) return;

        const name = streetFeature.properties.name;
        const bezirk = streetFeature.properties.BEZIRK || 'Unbekannt';
        const oteil = streetFeature.properties.OTEIL || 'Unbekannt';

        // Check if already added (same name + location)
        const alreadyExists = customFeatureCollection.features.some(f =>
          f.properties.name === name &&
          (f.properties.BEZIRK || 'Unbekannt') === bezirk &&
          (f.properties.OTEIL || 'Unbekannt') === oteil
        );

        if (alreadyExists) {
          showToast(`⚠ ${name} ist bereits hinzugefügt`, true);
        } else {
          const newFeature = JSON.parse(JSON.stringify(streetFeature));
          newFeature.id = `merged_${Date.now()}`;
          newFeature.properties.id = newFeature.id;
          addFeature(newFeature);
          showToast(`✓ ${name} hinzugefügt`);
        }
        return;
      }
    }

    // 2. Note mode
    if (activeMode === 'note') {
      const feature = getFeatureAtPoint(e.point, interactiveLayers);
      if (feature) {
        selectFeatureForNote(feature.id);
        return;
      }
    }

    // 3. Point tool
    if (activeMode === 'point') {
      pendingPointData = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      modalPointNameInput.value = '';
      modalPointNoteInput.value = '';
      pointModal.classList.remove('hidden');
      setTimeout(() => modalPointNameInput.focus(), 100);
    }
  });

  btnModalPointCancel.onclick = () => {
    pointModal.classList.add('hidden');
    pendingPointData = null;
  };

  btnModalPointSave.onclick = () => {
    if (!pendingPointData) return;
    const name = modalPointNameInput.value.trim();
    const note = modalPointNoteInput.value.trim();
    if (!name) {
      alert("Ein Name ist erforderlich. Der Punkt wurde nicht gespeichert.");
      return;
    }
    
    const pt = {
      type: 'Feature',
      id: 'point_' + Date.now(),
      geometry: {
        type: 'Point',
        coordinates: [pendingPointData.lng, pendingPointData.lat]
      },
      properties: {
        name: name,
        notes: note,
        id: 'point_' + Date.now(),
        difficulty: 1,
        BEZIRK: 'Custom'
      }
    };
    addFeature(pt);
    
    pointModal.classList.add('hidden');
    pendingPointData = null;
  };

  // Allow pressing Enter in the point name input
  modalPointNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnModalPointSave.click();
    } else if (e.key === 'Escape') {
      btnModalPointCancel.click();
    }
  });

  // Load master data for searching and background rendering
  try {
    const res = await fetch('./berlin_streets_optimized.geojson');
    masterData = await res.json();
    // Pre-assign IDs
    masterData.features.forEach((f) => {
      f.id = f.properties.id || f.id;
      f.properties.id = f.id;
    });

    // Add master streets as a background layer
    map.addSource('master-streets', { 
      type: 'geojson', 
      data: masterData, 
      promoteId: 'id' 
    });

    // Insert the master layer BELOW the custom-lines layer
    map.addLayer({
      id: 'master-streets-layer',
      type: 'line',
      source: 'master-streets',
      paint: {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], '#6366F1',
          '#94a3b8'
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 5,
          1.5
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 0.8,
          0.4
        ]
      }
    }, 'custom-lines'); // Place below custom-lines

    // Apply initial filter to hide already-added streets
    updateMasterFilter();

    // Hide loading overlay
    loadingOverlay.classList.add('hidden');
  } catch(e) {
    console.error("Failed to load master data", e);
    loadingOverlay.querySelector('.loading-text').textContent = 'Fehler beim Laden der Straßen';
    setTimeout(() => loadingOverlay.classList.add('hidden'), 2000);
  }
});

// Build a filter expression that hides streets already in customFeatureCollection
function updateMasterFilter() {
  if (!mapLoaded || !map.getLayer('master-streets-layer')) return;

  // Collect unique name+bezirk+oteil keys of added features (only line features)
  const addedKeys = new Set();
  customFeatureCollection.features.forEach(f => {
    if (f.geometry.type !== 'Point') {
      const name = f.properties.name || '';
      const bezirk = f.properties.BEZIRK || 'Unbekannt';
      const oteil = f.properties.OTEIL || 'Unbekannt';
      addedKeys.add(`${name}__${oteil}__${bezirk}`);
    }
  });

  if (addedKeys.size === 0) {
    // No filter needed — show all
    map.setFilter('master-streets-layer', null);
    return;
  }

  // Build a filter that excludes features whose name+oteil+bezirk combo matches an added street.
  // MapLibre expressions: we need to construct a concat and check it's not in our set.
  // Use ['!', ['in', concat_expr, ...values]] approach.
  // Since 'in' with a literal list can get large, we use a more efficient approach:
  // create a match expression that returns false for added keys, true otherwise.
  const keysList = Array.from(addedKeys);
  
  // Build: ['match', ['concat', name, '__', oteil, '__', bezirk], [key1, key2, ...], false, true]
  map.setFilter('master-streets-layer', [
    'match',
    ['concat', 
      ['coalesce', ['get', 'name'], ''],
      '__',
      ['coalesce', ['get', 'OTEIL'], 'Unbekannt'],
      '__',
      ['coalesce', ['get', 'BEZIRK'], 'Unbekannt']
    ],
    keysList,
    false,
    true
  ]);
}

// Update Map & List
function updateData() {
  if (mapLoaded) {
    map.getSource('custom-data').setData(customFeatureCollection);
  }
  
  // Save to localStorage for seamless transfer to main app
  localStorage.setItem('berlinmemo_custom_map', JSON.stringify(customFeatureCollection));
  
  // Update master layer filter to hide newly-added streets
  updateMasterFilter();
  
  featureCount.textContent = customFeatureCollection.features.length;
  featureList.innerHTML = '';
  
  customFeatureCollection.features.forEach((f) => {
    const el = document.createElement('div');
    el.className = 'feature-item';
    
    const label = document.createElement('span');
    const typeIcon = f.geometry.type === 'Point' ? '📍' : '🛣️';
    let text = `${typeIcon} ${f.properties.name}`;
    if (f.properties.notes) text += ` <span style="color:#10b981;font-size:0.7rem;">(Notiz)</span>`;
    label.innerHTML = text;
    
    // Select for note
    label.style.cursor = 'pointer';
    label.onclick = () => {
      if(activeMode !== 'note') switchMode('note');
      selectFeatureForNote(f.id || f.properties.id);
    };

    const rmBtn = document.createElement('button');
    rmBtn.className = 'remove-btn';
    rmBtn.textContent = 'X';
    rmBtn.onclick = (e) => {
      e.stopPropagation();
      removeFeature(f.id || f.properties.id);
    };

    el.appendChild(label);
    el.appendChild(rmBtn);
    featureList.appendChild(el);
  });
}

function addFeature(feature) {
  // Check if already exists
  const exists = customFeatureCollection.features.find(f => (f.id === feature.id) || (f.properties.id === feature.properties.id));
  if (!exists) {
    customFeatureCollection.features.push(feature);
    updateData();
  }
}

function removeFeature(id) {
  customFeatureCollection.features = customFeatureCollection.features.filter(f => (f.id !== id) && (f.properties.id !== id));
  if (selectedFeatureForNote && (selectedFeatureForNote.id === id || selectedFeatureForNote.properties.id === id)) {
    selectedFeatureForNote = null;
    noteEditor.classList.add('hidden');
  }
  updateData();
}

function selectFeatureForNote(id) {
  const feature = customFeatureCollection.features.find(f => (f.id === id) || (f.properties.id === id));
  if (!feature) return;
  expandSidebar();
  switchMode('note');
  selectedFeatureForNote = feature;
  noteTargetName.value = feature.properties.name || '';
  noteInput.value = feature.properties.notes || '';
  noteEditor.classList.remove('hidden');
}

btnSaveNote.onclick = () => {
  if (selectedFeatureForNote) {
    const newName = noteTargetName.value.trim();
    if (newName === '') {
      alert("Der Name darf nicht leer sein.");
      return;
    }
    selectedFeatureForNote.properties.name = newName;
    selectedFeatureForNote.properties.notes = noteInput.value.trim();
    noteEditor.classList.add('hidden');
    selectedFeatureForNote = null;
    updateData(); // Refresh list to show note indicator and new name
  }
};

btnDeleteNote.onclick = () => {
  if (selectedFeatureForNote) {
    const id = selectedFeatureForNote.id || selectedFeatureForNote.properties.id;
    const name = selectedFeatureForNote.properties.name || 'Element';
    removeFeature(id);
    showToast(`✓ ${name} gelöscht`);
  }
};

// Search Logic
searchInput.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  searchResults.innerHTML = '';
  if (q.length < 2 || !masterData) return;

  // Group by name and location (OTEIL/BEZIRK) to separate same-named streets in different areas
  const uniqueMatches = new Map();
  masterData.features.forEach(f => {
    if (f.properties.name && f.properties.name.toLowerCase().includes(q)) {
      const bezirk = f.properties.BEZIRK || 'Unbekannt';
      const oteil = f.properties.OTEIL || 'Unbekannt';
      const uniqueKey = `${f.properties.name}__${oteil}__${bezirk}`;

      if (!uniqueMatches.has(uniqueKey)) {
        uniqueMatches.set(uniqueKey, f);
      }
    }
  });

  const matches = Array.from(uniqueMatches.values()).slice(0, 50);
  
  matches.forEach(m => {
    const el = document.createElement('div');
    el.className = 'search-result-item';
    
    let locationText = m.properties.BEZIRK || 'Unbekannt';
    const oteil = m.properties.OTEIL || 'Unbekannt';
    if (oteil && oteil !== 'Unbekannt' && oteil !== 'Unknown' && oteil !== locationText) {
      locationText = `${oteil}, ${locationText}`;
    }

    // Check if already added
    const alreadyAdded = customFeatureCollection.features.some(f =>
      f.properties.name === m.properties.name &&
      (f.properties.BEZIRK || 'Unbekannt') === (m.properties.BEZIRK || 'Unbekannt') &&
      (f.properties.OTEIL || 'Unbekannt') === (m.properties.OTEIL || 'Unbekannt')
    );

    if (alreadyAdded) {
      el.innerHTML = `<span>${m.properties.name} <small style="opacity:0.6;">(${locationText})</small></span> <span style="color:#10b981;">✓</span>`;
      el.style.opacity = '0.5';
      el.style.cursor = 'default';
    } else {
      el.innerHTML = `<span>${m.properties.name} <small style="opacity:0.6;">(${locationText})</small></span> <span>+</span>`;
      el.onclick = () => {
        const name = m.properties.name;
        const newFeature = JSON.parse(JSON.stringify(m));
        newFeature.id = `merged_${Date.now()}`;
        newFeature.properties.id = newFeature.id;
        addFeature(newFeature);
        showToast(`✓ ${name} hinzugefügt`);
        
        // Re-render search results to show the checkmark
        searchInput.dispatchEvent(new Event('input'));
      };
    }
    searchResults.appendChild(el);
  });
});

// Mode Switching
function switchMode(mode) {
  activeMode = mode;
  modeStreet.classList.toggle('active', mode === 'street');
  modePoint.classList.toggle('active', mode === 'point');
  modeNote.classList.toggle('active', mode === 'note');

  toolStreet.classList.toggle('hidden', mode !== 'street');
  toolPoint.classList.toggle('hidden', mode !== 'point');
  toolNote.classList.toggle('hidden', mode !== 'note');
  
  if (mode === 'point') {
    map.getCanvas().style.cursor = 'crosshair';
  } else {
    map.getCanvas().style.cursor = '';
  }
  
  if (mode !== 'note') {
    noteEditor.classList.add('hidden');
    selectedFeatureForNote = null;
  }

  // Show/hide master streets layer based on mode
  if (map.getLayer('master-streets-layer')) {
    map.setLayoutProperty('master-streets-layer', 'visibility', mode === 'street' ? 'visible' : 'none');
  }

  // Clear tooltip when switching modes
  editorTooltip.classList.remove('visible');
  if (hoveredMasterId !== null && map.getSource('master-streets')) {
    map.setFeatureState({ source: 'master-streets', id: hoveredMasterId }, { hover: false });
    hoveredMasterId = null;
  }
}

modeStreet.onclick = () => switchMode('street');
modePoint.onclick = () => switchMode('point');
modeNote.onclick = () => switchMode('note');

// Neue Karte erstellen
btnNewMap.onclick = () => {
  confirmModal.classList.remove('hidden');
};

btnConfirmCancel.onclick = () => {
  confirmModal.classList.add('hidden');
};

btnConfirmOk.onclick = () => {
  customFeatureCollection = { type: 'FeatureCollection', features: [] };
  updateData();
  confirmModal.classList.add('hidden');
};

// IO
uploadGeojson.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.type === 'FeatureCollection') {
        // Ensure IDs
        data.features.forEach((f, i) => {
          f.id = f.id || f.properties.id || `imported_${Date.now()}_${i}`;
          f.properties.id = f.id;
        });
        customFeatureCollection = data;
        updateData();
        
        // Fit bounds
        let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
        customFeatureCollection.features.forEach(f => {
           if (f.geometry.type === 'Point') {
             minLng = Math.min(minLng, f.geometry.coordinates[0]); maxLng = Math.max(maxLng, f.geometry.coordinates[0]);
             minLat = Math.min(minLat, f.geometry.coordinates[1]); maxLat = Math.max(maxLat, f.geometry.coordinates[1]);
           } else if (f.geometry.coordinates && f.geometry.coordinates[0]) {
             const coord = f.geometry.type === 'LineString' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
             if(coord) {
               minLng = Math.min(minLng, coord[0]); maxLng = Math.max(maxLng, coord[0]);
               minLat = Math.min(minLat, coord[1]); maxLat = Math.max(maxLat, coord[1]);
             }
           }
        });
        if (minLng < maxLng && minLat < maxLat) {
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50 });
        }
      } else {
        alert("Invalid GeoJSON FeatureCollection");
      }
    } catch(err) {
      alert("Error parsing JSON: " + err.message);
    }
  };
  reader.readAsText(file);
});

btnDownload.onclick = () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customFeatureCollection, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "custom_map.geojson");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};

// Navigation Search Logic
const navSearchInput = document.getElementById('map-nav-search-input');
const navSearchResults = document.getElementById('map-nav-search-results');

let navHighlightTimeout = null;

// Ensure nav-highlight source & layer exist
function setupNavHighlightLayer() {
  if (!map.getSource('nav-highlight')) {
    map.addSource('nav-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'nav-highlight-layer',
      type: 'line',
      source: 'nav-highlight',
      paint: {
        'line-color': '#818cf8', // Glow violet color
        'line-width': 8,
        'line-opacity': 0.8
      }
    }, 'custom-lines'); // Below custom-lines
  }
}

function flashStreetHighlight(feature) {
  setupNavHighlightLayer();
  if (navHighlightTimeout) clearTimeout(navHighlightTimeout);

  map.getSource('nav-highlight').setData({
    type: 'FeatureCollection',
    features: [feature]
  });

  map.setPaintProperty('nav-highlight-layer', 'line-opacity', 0.8);

  let opacity = 0.8;
  navHighlightTimeout = setTimeout(() => {
    const fadeInterval = setInterval(() => {
      opacity -= 0.1;
      if (opacity <= 0) {
        clearInterval(fadeInterval);
        if (map.getSource('nav-highlight')) {
          map.getSource('nav-highlight').setData({ type: 'FeatureCollection', features: [] });
        }
      } else {
        if (map.getLayer('nav-highlight-layer')) {
          map.setPaintProperty('nav-highlight-layer', 'line-opacity', opacity);
        }
      }
    }, 50);
  }, 2500);
}

function flyToStreet(feature) {
  // Calculate bounds
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  const geom = feature.geometry;

  const processCoords = (coords) => {
    coords.forEach(coord => {
      if (coord[0] < minLng) minLng = coord[0];
      if (coord[0] > maxLng) maxLng = coord[0];
      if (coord[1] < minLat) minLat = coord[1];
      if (coord[1] > maxLat) maxLat = coord[1];
    });
  };

  if (geom.type === 'LineString') {
    processCoords(geom.coordinates);
  } else if (geom.type === 'MultiLineString' || geom.type === 'Polygon') {
    geom.coordinates.forEach(processCoords);
  } else if (geom.type === 'Point') {
    minLng = geom.coordinates[0] - 0.005;
    maxLng = geom.coordinates[0] + 0.005;
    minLat = geom.coordinates[1] - 0.003;
    maxLat = geom.coordinates[1] + 0.003;
  }

  if (minLng < maxLng && minLat < maxLat) {
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, duration: 1500 });
    flashStreetHighlight(feature);
  }
}

navSearchInput.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  navSearchResults.innerHTML = '';
  
  if (q.length < 2 || !masterData) {
    navSearchResults.classList.add('hidden');
    return;
  }

  // Filter unique name + locations
  const uniqueMatches = new Map();
  masterData.features.forEach(f => {
    if (f.properties.name && f.properties.name.toLowerCase().includes(q)) {
      const bezirk = f.properties.BEZIRK || 'Unbekannt';
      const oteil = f.properties.OTEIL || 'Unbekannt';
      const uniqueKey = `${f.properties.name}__${oteil}__${bezirk}`;

      if (!uniqueMatches.has(uniqueKey)) {
        uniqueMatches.set(uniqueKey, f);
      }
    }
  });

  const matches = Array.from(uniqueMatches.values()).slice(0, 8); // Top 8 results
  
  if (matches.length === 0) {
    navSearchResults.classList.add('hidden');
    return;
  }

  matches.forEach(m => {
    const el = document.createElement('div');
    el.className = 'nav-result-item';
    
    let locationText = m.properties.BEZIRK || 'Unbekannt';
    const oteil = m.properties.OTEIL || 'Unbekannt';
    if (oteil && oteil !== 'Unbekannt' && oteil !== 'Unknown' && oteil !== locationText) {
      locationText = `${oteil}, ${locationText}`;
    }

    el.innerHTML = `
      <span class="nav-result-name">${m.properties.name}</span>
      <span class="nav-result-location">${locationText}</span>
    `;

    el.onclick = () => {
      flyToStreet(m);
      navSearchInput.value = m.properties.name;
      navSearchResults.classList.add('hidden');
    };

    navSearchResults.appendChild(el);
  });

  navSearchResults.classList.remove('hidden');
});

// Close nav results when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!navSearchInput.contains(e.target) && !navSearchResults.contains(e.target)) {
    navSearchResults.classList.add('hidden');
  }
});
