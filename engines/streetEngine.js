import * as turf from '@turf/turf';

let cachedMasterData = null;

export const streetEngine = {
  getTypeName() {
    return 'Straßen';
  },

  getDefaultPrompt() {
    return 'Wähle eine Straße';
  },

  async loadData(regionId, difficulty, radiusMode, customGeojson, map) {
    let data;
    let filteredFeatures = [];

    if (regionId === 'custom') {
      if (customGeojson) {
        filteredFeatures = customGeojson.features || [];
      }
    } else {
      if (regionId === 'radius') {
        if (!cachedMasterData) {
          const resp = await fetch('./berlin_streets.geojson');
          cachedMasterData = await resp.json();
        }
        data = cachedMasterData;
      } else {
        const url = `./streets_${regionId}.geojson`;
        const resp = await fetch(url);
        data = await resp.json();
      }

      // Filter by difficulty (Tourist <= 1, Resident <= 2, Taxi <= 3)
      filteredFeatures = data.features.filter(f => f.properties.difficulty <= difficulty);

      // Filter by radius using turf if active
      if (regionId === 'radius' && radiusMode.active && radiusMode.hasCenter) {
        const centerPt = turf.point(radiusMode.center);
        const circle = turf.circle(centerPt, radiusMode.radiusKm, { units: 'kilometers' });

        // Update radius circle layer in main.js via map
        if (map.getSource('radius-circle')) {
          map.getSource('radius-circle').setData({
            type: 'FeatureCollection',
            features: [circle]
          });
        }

        filteredFeatures = filteredFeatures.filter(f => {
          const firstCoord = f.geometry.type === 'LineString' 
            ? f.geometry.coordinates[0] 
            : (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates[0][0] : null);
          if (!firstCoord) return false;

          const dist = turf.distance(centerPt, turf.point(firstCoord), { units: 'kilometers' });
          // Quick bounding box check
          if (dist > radiusMode.radiusKm + 2) return false;

          return turf.booleanIntersects(f, circle);
        });
      }
    }

    // Normalization
    filteredFeatures.forEach((f, i) => {
      f.properties._geomType = 'LineString';
      f.id = f.properties.id || f.properties.name || `street_${i}`;
      if (!f.properties.name) f.properties.name = `Straße ${i + 1}`;
    });

    // Clear radius circle if not in radius mode
    if (regionId !== 'radius' && map.getSource('radius-circle')) {
      map.getSource('radius-circle').setData({ type: 'FeatureCollection', features: [] });
    }

    return {
      type: 'FeatureCollection',
      features: filteredFeatures,
      rawFeatures: filteredFeatures
    };
  }
};
