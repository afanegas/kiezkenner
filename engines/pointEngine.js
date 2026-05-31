function pointInPolygon(point, polygon) {
  let isInside = false;
  for (let i = 0; i < polygon.length; i++) {
    let ring = polygon[i];
    let insideRing = false;
    for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
      let xi = ring[j][0], yi = ring[j][1];
      let xj = ring[k][0], yj = ring[k][1];
      let intersect = ((yi > point[1]) != (yj > point[1])) && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
      if (intersect) insideRing = !insideRing;
    }
    if (i === 0) isInside = insideRing;
    else if (insideRing) { isInside = false; break; }
  }
  return isInside;
}

function getBezirkForPoint(lng, lat, bezirkData) {
  for (let feature of bezirkData.features) {
    let polygons = feature.geometry.type === 'MultiPolygon' 
      ? feature.geometry.coordinates 
      : [feature.geometry.coordinates];
    for (let poly of polygons) {
      if (pointInPolygon([lng, lat], poly)) return feature.properties.Gemeinde_name;
    }
  }
  return null;
}

let bezirkDataCache = null;
let trainlinesColorCache = null;

async function loadTrainlineColors() {
  if (trainlinesColorCache) return trainlinesColorCache;
  try {
    const resp = await fetch('./berlin_trainlines.csv');
    const text = await resp.text();
    const map = {};
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (idx === 0) return; // Header
      const parts = line.split(',');
      if (parts.length >= 4) {
        const key = parts[0].trim();
        const hex = parts[3].trim();
        if (key && hex) {
          map[key] = hex;
        }
      }
    });
    trainlinesColorCache = map;
    return map;
  } catch (err) {
    console.error("Failed to load trainline colors:", err);
    return {};
  }
}

export const pointEngine = {
  getTypeName(gameMode) {
    return gameMode === 'quartier' ? 'Quartiere' : 'Bahnhöfe';
  },

  getDefaultPrompt(gameMode) {
    return gameMode === 'quartier' ? 'Wähle ein Quartier' : 'Wähle einen Bahnhof';
  },

  async loadData(gameMode, regionId, customTargets, regionMap) {
    const url = gameMode === 'quartier'
      ? './quartier_berlin.geojson'
      : './berlin_stations.geojson';

    const response = await fetch(url);
    const data = await response.json();

    // If it's stations, we need bezirk data for spatial join
    if (gameMode === 'stations') {
      if (!bezirkDataCache) {
        const bezirkResp = await fetch('./bezirksgrenzen.geojson');
        bezirkDataCache = await bezirkResp.json();
      }

      const lineColors = await loadTrainlineColors();

      data.features.forEach(f => {
        f.properties._geomType = 'Point';
        let displayName = f.properties.name;
        let line_color = '#3b82f6'; // Fallback
        if (f.properties.line) {
          const lines = f.properties.line.trim().split(/\s+/).filter(Boolean);
          if (lines.length > 0) {
            displayName = `${displayName} (${lines.join(', ')})`;
            const firstLine = lines[0];
            if (lineColors[firstLine]) {
              line_color = lineColors[firstLine];
            }
          }
        }
        f.properties.name = displayName;
        f.properties.line_color = line_color;
        
        // Spatial join to find Bezirk
        const coords = f.geometry.coordinates;
        const bezirk = getBezirkForPoint(coords[0], coords[1], bezirkDataCache);
        f.properties.BEZIRK = bezirk || "Mitte"; // Fallback
        f.id = f.properties.name;
      });
    } else {
      // Quartiere normalization
      data.features.forEach(f => {
        f.properties._geomType = 'Point';
        f.properties.name = f.properties.name || f.properties.OTEIL;
        f.id = f.properties.name;
      });
    }

    // Filter by region
    let filteredFeatures = data.features;
    if (regionId !== 'alle') {
      if (regionId === 'custom') {
        filteredFeatures = data.features.filter(f => customTargets.includes(f.properties.name));
      } else if (regionMap[regionId]) {
        const bezirke = regionMap[regionId];
        filteredFeatures = data.features.filter(f => bezirke.includes(f.properties.BEZIRK));
      }
    }

    return {
      type: 'FeatureCollection',
      features: filteredFeatures,
      rawFeatures: data.features
    };
  }
};
