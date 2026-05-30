export const polygonEngine = {
  getTypeName(gameMode) {
    return gameMode === 'ortsteile' ? 'Ortsteile' : 'PLR';
  },

  getDefaultPrompt(gameMode) {
    return gameMode === 'ortsteile' ? 'Wähle einen Ortsteil' : 'Wähle einen Planungsraum';
  },

  async loadData(gameMode, regionId, customTargets, regionMap) {
    const url = gameMode === 'ortsteile' 
      ? './public/lor_ortsteile.geojson' 
      : './public/lor_2021_a_lor_plr_2021_WGS84.geojson';
    
    const response = await fetch(url);
    const data = await response.json();

    // Normalize
    data.features.forEach((f, i) => {
      // Geometry tagging for line-width logic
      f.properties._geomType = 'Polygon';
      
      if (gameMode === 'ortsteile') {
        f.properties.name = f.properties.OTEIL;
        // BEZIRK is already set
      } else {
        f.properties.name = f.properties.plr_name;
        // PLR bez property normalization (e.g., "01 - Mitte" -> "Mitte")
        if (f.properties.bez && f.properties.bez.includes(' - ')) {
          f.properties.BEZIRK = f.properties.bez.split(' - ')[1];
        } else {
          f.properties.BEZIRK = f.properties.bez;
        }
      }

      f.id = f.properties.name || `poly_${i}`;
    });

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
      rawFeatures: data.features // Keep all for updates/filters
    };
  }
};
