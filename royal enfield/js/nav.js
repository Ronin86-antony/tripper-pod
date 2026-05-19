/**
 * nav.js - Navigation with Leaflet + OpenStreetMap + OSRM
 */

const Nav = {
  map: null,
  userMarker: null,
  routeLayer: null,
  watchId: null,
  steps: [],
  currentStep: 0,
  userLat: null,
  userLon: null,
  routeActive: false,
  currentTileLayer: null,

  tileLayers: {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    },
    standard: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors'
    },
    topo: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
    }
  },

  init() {
    this.initMap();
    this.initSearch();
    this.startLocationWatch();
  },

  initMap() {
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      center: [20.5937, 78.9629], // India center
      zoom: 5
    });

    const style = this.tileLayers.dark;
    this.currentTileLayer = L.tileLayer(style.url, {
      attribution: style.attribution,
      maxZoom: 19
    }).addTo(this.map);

    // Custom user marker
    const userIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:24px;height:24px;
        background:#E8380D;
        border:3px solid #fff;
        border-radius:50%;
        box-shadow: 0 0 12px rgba(232,56,13,0.7);
      "></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    this.userMarker = L.marker([20.5937, 78.9629], { icon: userIcon }).addTo(this.map);
  },

  initSearch() {
    const input = document.getElementById('destInput');
    const suggestions = document.getElementById('suggestionsList');
    const clearBtn = document.getElementById('searchClear');
    let debounceTimer = null;

    input.addEventListener('input', () => {
      const val = input.value.trim();
      clearBtn.style.display = val ? 'block' : 'none';

      clearTimeout(debounceTimer);
      if (val.length < 3) {
        suggestions.style.display = 'none';
        return;
      }

      debounceTimer = setTimeout(() => this.geocodeSearch(val), 500);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        suggestions.style.display = 'none';
        this.startRoute();
      }
    });
  },

  async geocodeSearch(query) {
    const suggestions = document.getElementById('suggestionsList');
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();

      suggestions.innerHTML = '';
      if (data.length === 0) {
        suggestions.innerHTML = '<div class="suggestion-item" style="color:#888">No results found</div>';
        suggestions.style.display = 'block';
        return;
      }

      data.forEach(place => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = place.display_name;
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
          document.getElementById('destInput').value = place.display_name;
          suggestions.style.display = 'none';
          this._selectedDest = { lat: parseFloat(place.lat), lon: parseFloat(place.lon) };
          this.startRoute();
        });
        suggestions.appendChild(item);
      });

      suggestions.style.display = 'block';
    } catch (err) {
      console.error('Geocode error:', err);
      App.showToast('Search failed — check internet connection');
    }
  },

  clearSearch() {
    document.getElementById('destInput').value = '';
    document.getElementById('searchClear').style.display = 'none';
    document.getElementById('suggestionsList').style.display = 'none';
    this._selectedDest = null;
  },

  startLocationWatch() {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.userLat = pos.coords.latitude;
        this.userLon = pos.coords.longitude;
        this.userMarker.setLatLng([this.userLat, this.userLon]);
        this.map.setView([this.userLat, this.userLon], 15);
        document.getElementById('gpsDot').classList.add('active');
      },
      (err) => console.warn('Initial GPS:', err),
      { enableHighAccuracy: true }
    );

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => console.warn('GPS watch error:', err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  },

  onPosition(pos) {
    this.userLat = pos.coords.latitude;
    this.userLon = pos.coords.longitude;

    this.userMarker.setLatLng([this.userLat, this.userLon]);
    document.getElementById('gpsDot').classList.add('active');

    const autoRotate = document.getElementById('autoRotate');
    if (autoRotate && autoRotate.checked && this.routeActive) {
      this.map.setView([this.userLat, this.userLon], this.map.getZoom());
    }

    if (this.routeActive) {
      this.updateNavProgress();
    }
  },

  async startRoute() {
    const suggestions = document.getElementById('suggestionsList');
    suggestions.style.display = 'none';

    if (!this.userLat || !this.userLon) {
      App.showToast('⏳ Waiting for GPS fix...');
      return;
    }

    let dest = this._selectedDest;

    // If no selection made from suggestions, geocode the text
    if (!dest) {
      const query = document.getElementById('destInput').value.trim();
      if (!query) { App.showToast('Please enter a destination'); return; }

      App.showToast('🗺️ Searching...');
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.length) { App.showToast('Location not found'); return; }
        dest = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      } catch (e) {
        App.showToast('Search failed — check connection');
        return;
      }
    }

    App.showToast('🔄 Calculating route...');
    await this.fetchRoute(this.userLat, this.userLon, dest.lat, dest.lon);
  },

  async fetchRoute(fromLat, fromLon, toLat, toLon) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?steps=true&geometries=geojson&overview=full&annotations=false`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code !== 'Ok' || !data.routes.length) {
        App.showToast('Could not find a route');
        return;
      }

      const route = data.routes[0];
      this.displayRoute(route);
      this.steps = route.legs[0].steps;
      this.currentStep = 0;
      this.routeActive = true;

      // Show turn banner & stop button
      document.getElementById('turnBanner').style.display = 'flex';
      document.getElementById('btnStopNav').style.display = 'flex';

      this.updateTurnBanner();
      App.showToast(`✅ Route found — ${(route.distance / 1000).toFixed(1)} km`);

      // Push first step to Tripper Pod if BLE connected
      if (typeof BLE !== 'undefined' && BLE.isConnected()) {
        BLE.sendNavStep(this.steps[0]);
      }

    } catch (err) {
      console.error('Route error:', err);
      App.showToast('Routing failed — check connection');
    }
  },

  displayRoute(route) {
    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
    }

    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

    this.routeLayer = L.polyline(coords, {
      color: '#E8380D',
      weight: 6,
      opacity: 0.9
    }).addTo(this.map);

    // Destination marker
    const destIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:20px;height:20px;
        background:#F5A623;
        border:3px solid #fff;
        border-radius:4px;
        box-shadow: 0 0 10px rgba(245,166,35,0.7);
        transform: rotate(45deg);
      "></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const lastCoord = coords[coords.length - 1];
    if (this.destMarker) this.map.removeLayer(this.destMarker);
    this.destMarker = L.marker(lastCoord, { icon: destIcon }).addTo(this.map);

    this.map.fitBounds(this.routeLayer.getBounds(), { padding: [60, 60] });
  },

  updateNavProgress() {
    if (!this.steps || this.currentStep >= this.steps.length) return;

    const step = this.steps[this.currentStep];
    const stepLon = step.maneuver.location[0];
    const stepLat = step.maneuver.location[1];

    // Distance to current waypoint
    const dist = Dashboard.calculateDistance(this.userLat, this.userLon, stepLat, stepLon);

    // Auto-advance step if within 30 meters
    if (dist < 30 && this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.updateTurnBanner();

      if (typeof BLE !== 'undefined' && BLE.isConnected()) {
        BLE.sendNavStep(this.steps[this.currentStep]);
      }
    }

    // Update distance on banner
    const distEl = document.getElementById('turnDist');
    if (dist > 1000) {
      distEl.textContent = (dist / 1000).toFixed(1) + ' km';
    } else {
      distEl.textContent = Math.round(dist) + ' m';
    }
  },

  updateTurnBanner() {
    if (!this.steps || !this.steps[this.currentStep]) return;
    const step = this.steps[this.currentStep];

    const arrowMap = {
      'turn-right': '➡️',
      'turn-left': '⬅️',
      'turn-sharp-right': '↪️',
      'turn-sharp-left': '↩️',
      'turn-slight-right': '↗️',
      'turn-slight-left': '↖️',
      'roundabout': '🔄',
      'depart': '⬆️',
      'arrive': '🏁',
      'merge': '⬆️',
      'fork': '↗️',
      'continue': '⬆️'
    };

    const maneuver = step.maneuver.type + (step.maneuver.modifier ? '-' + step.maneuver.modifier : '');
    const arrow = arrowMap[maneuver] || '⬆️';

    document.getElementById('turnArrow').textContent = arrow;
    document.getElementById('turnStreet').textContent = step.name || 'Continue';

    // Estimate ETA for this step
    const etaEl = document.getElementById('turnEta');
    const now = new Date();
    now.setSeconds(now.getSeconds() + step.duration);
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    etaEl.textContent = `${h}:${m}`;

    // Update main ETA
    document.getElementById('etaValue').textContent = `${h}:${m}`;
  },

  stopRoute() {
    this.routeActive = false;
    this.steps = [];
    this.currentStep = 0;

    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }
    if (this.destMarker) {
      this.map.removeLayer(this.destMarker);
      this.destMarker = null;
    }

    document.getElementById('turnBanner').style.display = 'none';
    document.getElementById('btnStopNav').style.display = 'none';
    document.getElementById('etaValue').textContent = '--:--';
    this._selectedDest = null;

    App.showToast('Navigation stopped');
  },

  centerOnUser() {
    if (this.userLat && this.userLon) {
      this.map.setView([this.userLat, this.userLon], 16);
    } else {
      App.showToast('GPS not available yet');
    }
  },

  resetNorth() {
    this.map.setBearing ? this.map.setBearing(0) : null;
    App.showToast('Map reset to North');
  },

  setMapStyle(style) {
    if (!this.tileLayers[style]) return;
    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
    }
    const layer = this.tileLayers[style];
    this.currentTileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 19
    }).addTo(this.map);
  }
};
