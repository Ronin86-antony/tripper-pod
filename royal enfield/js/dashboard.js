/**
 * dashboard.js - Ride Dashboard Logic
 */

const Dashboard = {
  watchId: null,
  isTracking: false,
  startTime: null,
  timerInterval: null,
  unit: 'kmh', // or 'mph'
  
  stats: {
    speed: 0,
    maxSpeed: 0,
    avgSpeed: 0,
    dist: 0, // meters
    readings: 0,
    speedSum: 0,
    lastPos: null
  },

  init() {
    this.drawSpeedo(0);
    
    // Check permissions on load, but don't start tracking yet
    if ('geolocation' in navigator) {
      // Just warm it up
      navigator.geolocation.getCurrentPosition(()=>{}, ()=>{}, {maximumAge: 60000});
    }
  },

  setSpeedUnit(val) {
    this.unit = val;
    // convert current max speed
    if (this.stats.maxSpeed > 0) {
      document.getElementById('maxSpeedValue').textContent = this.getConvertedSpeed(this.stats.maxSpeed).toFixed(0);
    }
    // Update labels
    document.querySelector('.speed-unit').textContent = val === 'kmh' ? 'km/h' : 'mph';
    document.querySelector('#cardMaxSpeed .metric-sub').textContent = val === 'kmh' ? 'km/h' : 'mph';
    document.querySelector('#cardAvgSpeed .metric-sub').textContent = val === 'kmh' ? 'km/h' : 'mph';
  },

  getConvertedSpeed(speedMetersPerSec) {
    if (speedMetersPerSec === null || isNaN(speedMetersPerSec)) return 0;
    // m/s to km/h = * 3.6
    // m/s to mph = * 2.23694
    return this.unit === 'kmh' ? speedMetersPerSec * 3.6 : speedMetersPerSec * 2.23694;
  },

  toggleTrip() {
    const btn = document.getElementById('btnTrip');
    const btnText = document.getElementById('btnTripText');
    
    if (this.isTracking) {
      // Stop
      this.isTracking = false;
      btn.classList.remove('active');
      btnText.textContent = '▶ START RIDE';
      this.stopTracking();
    } else {
      // Start
      this.isTracking = true;
      btn.classList.add('active');
      btnText.textContent = '⏸ STOP RIDE';
      this.startTracking();
    }
  },

  startTracking() {
    if (!('geolocation' in navigator)) {
      App.showToast('GPS not available on this device');
      return;
    }

    if (!this.startTime) {
      this.startTime = Date.now();
    } else {
      // Resuming, adjust start time based on paused duration
      // (Simplified logic here - in a real app, track paused duration explicitly)
    }

    this.timerInterval = setInterval(() => this.updateTimer(), 1000);

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => {
        console.warn('GPS Error:', err);
        if (err.code === 1) App.showToast('Please enable Location access');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );
    
    // Hook compass
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientationabsolute', this.handleOrientation.bind(this));
    }
    
    document.getElementById('gpsDot').classList.add('active');
  },

  stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    clearInterval(this.timerInterval);
    
    window.removeEventListener('deviceorientationabsolute', this.handleOrientation);
    document.getElementById('gpsDot').classList.remove('active');
    
    // Reset speed to 0 when stopped
    this.updateSpeedDisplay(0);
  },

  resetTrip() {
    const wasTracking = this.isTracking;
    if (wasTracking) this.toggleTrip(); // Stop first
    
    this.stats = {
      speed: 0,
      maxSpeed: 0,
      avgSpeed: 0,
      dist: 0,
      readings: 0,
      speedSum: 0,
      lastPos: null
    };
    this.startTime = null;
    
    // Update UI
    this.updateSpeedDisplay(0);
    document.getElementById('maxSpeedValue').textContent = '0';
    document.getElementById('avgSpeedValue').textContent = '0';
    document.getElementById('tripTime').textContent = '00:00:00';
    document.getElementById('tripDist').textContent = '0.0 ' + (this.unit === 'kmh' ? 'km' : 'mi');
    
    if (wasTracking) this.toggleTrip(); // Resume
  },

  onPosition(pos) {
    const coords = pos.coords;
    
    // 1. Update Speed
    const speed = coords.speed; // meters per second
    if (speed !== null && speed >= 0) {
      this.stats.speed = speed;
      
      // Update max speed
      if (speed > this.stats.maxSpeed) {
        this.stats.maxSpeed = speed;
        document.getElementById('maxSpeedValue').textContent = this.getConvertedSpeed(speed).toFixed(0);
      }
      
      // Update avg speed
      if (speed > 1) { // Only average when moving to avoid skewing while stopped
        this.stats.readings++;
        this.stats.speedSum += speed;
        this.stats.avgSpeed = this.stats.speedSum / this.stats.readings;
        document.getElementById('avgSpeedValue').textContent = this.getConvertedSpeed(this.stats.avgSpeed).toFixed(1);
      }
      
      this.updateSpeedDisplay(speed);
    }
    
    // 2. Update Altitude
    if (coords.altitude !== null) {
      document.getElementById('altValue').textContent = Math.round(coords.altitude);
    }
    
    // 3. Update Heading (if moving fast enough, GPS heading is more accurate than compass)
    if (coords.heading !== null && speed > 1) {
      this.updateHeadingDisplay(coords.heading);
    }
    
    // 4. Update Distance
    if (this.stats.lastPos) {
      const d = this.calculateDistance(
        this.stats.lastPos.latitude, this.stats.lastPos.longitude,
        coords.latitude, coords.longitude
      );
      this.stats.dist += d;
      
      let distDisplay = 0;
      let distUnit = '';
      if (this.unit === 'kmh') {
        distDisplay = this.stats.dist / 1000;
        distUnit = 'km';
      } else {
        distDisplay = (this.stats.dist / 1000) * 0.621371;
        distUnit = 'mi';
      }
      document.getElementById('tripDist').textContent = `${distDisplay.toFixed(1)} ${distUnit}`;
    }
    
    this.stats.lastPos = coords;
  },

  handleOrientation(event) {
    // Fallback to device orientation if GPS speed is low
    if (this.stats.speed < 1) {
      let heading = event.webkitCompassHeading || Math.abs(event.alpha - 360);
      if (heading) {
        this.updateHeadingDisplay(heading);
      }
    }
  },

  updateHeadingDisplay(heading) {
    document.getElementById('headingValue').textContent = Math.round(heading) + '°';
    
    // Get cardinal direction
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(((heading %= 360) < 0 ? heading + 360 : heading) / 45) % 8;
    document.getElementById('headingDir').textContent = dirs[index];
  },

  updateSpeedDisplay(speedMps) {
    const displaySpeed = this.getConvertedSpeed(speedMps);
    document.getElementById('speedValue').textContent = Math.round(displaySpeed);
    this.drawSpeedo(displaySpeed);
  },

  updateTimer() {
    if (!this.startTime) return;
    const diff = Math.floor((Date.now() - this.startTime) / 1000);
    
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(diff % 60).toString().padStart(2, '0');
    
    document.getElementById('tripTime').textContent = `${h}:${m}:${s}`;
  },

  drawSpeedo(speed) {
    const canvas = document.getElementById('speedoCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cX = canvas.width / 2;
    const cY = canvas.height / 2;
    const radius = 130;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Map speed to angle (0 to 180 = 240 degrees of arc)
    const maxVal = this.unit === 'kmh' ? 180 : 120;
    const clampedSpeed = Math.min(speed, maxVal);
    
    const startAngle = 0.75 * Math.PI;
    const endAngle = 2.25 * Math.PI;
    const totalAngle = endAngle - startAngle;
    const currentAngle = startAngle + (clampedSpeed / maxVal) * totalAngle;
    
    // Background arc
    ctx.beginPath();
    ctx.arc(cX, cY, radius, startAngle, endAngle);
    ctx.lineWidth = 15;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Active arc (gradient)
    if (speed > 0) {
      const gradient = ctx.createLinearGradient(0, canvas.height, canvas.width, 0);
      gradient.addColorStop(0, '#F5A623'); // Amber
      gradient.addColorStop(1, '#E8380D'); // Orange-Red
      
      ctx.beginPath();
      ctx.arc(cX, cY, radius, startAngle, currentAngle);
      ctx.lineWidth = 15;
      ctx.strokeStyle = gradient;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(232, 56, 13, 0.5)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    // Tick marks
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    for(let i=0; i<=maxVal; i+=20) {
      const a = startAngle + (i / maxVal) * totalAngle;
      const x1 = cX + (radius - 20) * Math.cos(a);
      const y1 = cY + (radius - 20) * Math.sin(a);
      const x2 = cX + (radius - 5) * Math.cos(a);
      const y2 = cY + (radius - 5) * Math.sin(a);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  },

  // Haversine formula
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; 
  }
};
