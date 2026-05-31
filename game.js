export class GameManager {
  constructor(map, callbacks) {
    this.map = map;
    this.callbacks = callbacks;
    this.inProgress = false;
    this.allTargets = [];
    this.remainingTargets = [];
    this.currentTargetName = null;
    this.attempts = 0;
    this.stats = { green: 0, orange: 0, red: 0 };
    this.lastStartTime = null;
    this.elapsedBefore = 0;
    this.errorMarkers = [];
  }
  
  start(targetNames) {
    this.inProgress = true;
    this.elapsedBefore = 0;
    this.lastStartTime = new Date();
    this.allTargets = Array.from(new Set(targetNames)).filter(Boolean);
    this.remainingTargets = [...this.allTargets].sort(() => Math.random() - 0.5);
    this.stats = { green: 0, orange: 0, red: 0 };
    this.currentTargetName = null;
    this.attempts = 0;
    this.clearErrorMarkers();
    
    // Clear Maplibre feature states for the source
    if (this.map.getSource('kiezkenner-source')) {
      this.map.removeFeatureState({ source: 'kiezkenner-source' });
    }
    
    this.pickNext();
  }
  
  resume() {
    if (!this.inProgress) return;
    this.lastStartTime = new Date();
    this.clearErrorMarkers();
    if (this.currentTargetName) {
      this.callbacks.onTargetPicked(this.currentTargetName, this.allTargets.length - this.remainingTargets.length, this.allTargets.length);
    }
  }
  
  pause() {
    if (this.inProgress && this.lastStartTime) {
      this.elapsedBefore += (new Date() - this.lastStartTime);
      this.lastStartTime = null;
    }
  }
  
  pickNext() {
    if (this.remainingTargets.length === 0) {
      this.end();
      return;
    }
    this.currentTargetName = this.remainingTargets.pop();
    this.attempts = 0;
    this.callbacks.onTargetPicked(this.currentTargetName, this.allTargets.length - this.remainingTargets.length, this.allTargets.length);
  }
  
  handleGuess(clickedName, feature, lngLat, showNames, showNamesOnAnswered) {
    if (!this.inProgress || !this.currentTargetName) return;
    
    // Check if clicked name has already been answered correctly/incorrectly
    const state = this.map.getFeatureState({ source: 'kiezkenner-source', id: clickedName });
    if (state && (state.state === 'green' || state.state === 'orange' || state.state === 'red')) {
      // If setting is active, show the name popup even if already guessed
      if (showNamesOnAnswered) {
        this.showPopup(clickedName, lngLat, state.state === 'red');
      }
      return;
    }
    
    this.attempts++;
    
    if (clickedName === this.currentTargetName) {
      const newState = this.attempts === 1 ? 'green' : 'orange';
      this.map.setFeatureState({ source: 'kiezkenner-source', id: clickedName }, { state: newState });
      
      if (this.attempts === 1) this.stats.green++;
      else this.stats.orange++;
      
      this.callbacks.onAttemptResult(true, this.attempts, clickedName);
      
      setTimeout(() => this.pickNext(), 400);
    } else {
      // Wrong guess
      this.map.setFeatureState({ source: 'kiezkenner-source', id: clickedName }, { state: 'red' });
      
      this.callbacks.onAttemptResult(false, this.attempts, clickedName);
      
      if (showNames) {
        this.showPopup(clickedName, lngLat, true);
      }
      
      setTimeout(() => {
        // Revert temporary red color for clicked wrong feature
        this.map.setFeatureState({ source: 'kiezkenner-source', id: clickedName }, { state: null });
        this.clearErrorMarkers();
      }, showNames ? 1200 : 400);
      
      if (this.attempts >= 3) {
        this.skip();
      }
    }
  }
  
  skip() {
    if (!this.inProgress || !this.currentTargetName) return;
    
    const targetName = this.currentTargetName;
    this.stats.red++;
    this.map.setFeatureState({ source: 'kiezkenner-source', id: targetName }, { state: 'red' });
    
    // Find coordinates of target to show error popup
    const targetLngLat = this.findTargetCoordinates(targetName);
    if (targetLngLat) {
      this.showPopup(targetName, targetLngLat, true);
    }
    
    this.currentTargetName = null; // Disable interaction
    
    setTimeout(() => {
      this.clearErrorMarkers();
      this.pickNext();
    }, 1200);
  }
  
  end() {
    this.inProgress = false;
    const elapsedMs = this.elapsedBefore + (this.lastStartTime ? (new Date() - this.lastStartTime) : 0);
    const elapsed = Math.floor(elapsedMs / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    
    this.callbacks.onGameFinished(this.stats, `${m}:${s}`);
  }
  
  showPopup(name, lngLat, isError) {
    const el = document.createElement('div');
    el.className = `modern-popup ${isError ? 'error' : ''} visible`;
    el.textContent = name;
    
    // Convert to maplibre LngLatLike
    const marker = new window.maplibregl.Marker({ element: el })
      .setLngLat(lngLat)
      .addTo(this.map);
    this.errorMarkers.push(marker);
    
    setTimeout(() => {
      marker.remove();
      this.errorMarkers = this.errorMarkers.filter(m => m !== marker);
    }, 1200);
  }
  
  clearErrorMarkers() {
    this.errorMarkers.forEach(m => m.remove());
    this.errorMarkers = [];
  }
  
  findTargetCoordinates(targetName) {
    // Get features from map source
    const source = this.map.getSource('kiezkenner-source');
    if (!source) return null;
    const data = source._data || source.serialize().data;
    if (!data || !data.features) return null;
    
    const feature = data.features.find(f => f.properties.name === targetName);
    if (!feature) return null;
    
    const geom = feature.geometry;
    if (geom.type === 'Point') {
      return geom.coordinates;
    } else if (geom.type === 'LineString') {
      return geom.coordinates[Math.floor(geom.coordinates.length / 2)];
    } else if (geom.type === 'MultiLineString') {
      return geom.coordinates[0][Math.floor(geom.coordinates[0].length / 2)];
    } else if (geom.type === 'Polygon') {
      return geom.coordinates[0][0]; // fallback to first coordinate
    } else if (geom.type === 'MultiPolygon') {
      return geom.coordinates[0][0][0];
    }
    return null;
  }
}
