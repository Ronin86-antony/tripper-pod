/**
 * app.js - Main Application Controller
 */

const App = {
  wakeLock: null,
  
  init() {
    // Splash screen logic
    setTimeout(() => {
      document.getElementById('splashBarFill').style.width = '100%';
      setTimeout(() => {
        document.getElementById('splash').classList.add('hide');
        document.getElementById('app').classList.remove('hidden');
        
        // Initialize modules
        Dashboard.init();
        TimeSync.init();
        if (typeof Nav !== 'undefined') Nav.init();
        
      }, 500);
    }, 1500);

    // Initial clock update
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
    
    // Request wake lock initially if toggle is checked
    const wakeToggle = document.getElementById('wakeToggle');
    if (wakeToggle && wakeToggle.checked) {
      this.toggleWakeLock(true);
    }
  },

  updateClock() {
    const now = new Date();
    const format = document.getElementById('timeFormat') ? document.getElementById('timeFormat').value : '12';
    
    let hours = now.getHours();
    let mins = now.getMinutes();
    
    if (format === '12') {
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 becomes 12
    }
    
    hours = hours.toString().padStart(2, '0');
    mins = mins.toString().padStart(2, '0');
    
    document.getElementById('liveClock').textContent = `${hours}:${mins}`;
  },

  switchTab(tabId) {
    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    // Remove active state from all buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    // Map tabId to Panel ID and Button ID
    const panelMap = {
      'dashboard': 'panelDashboard',
      'navigation': 'panelNavigation',
      'bluetooth': 'panelBluetooth',
      'settings': 'panelSettings'
    };
    
    const btnMap = {
      'dashboard': 'tabDash',
      'navigation': 'tabNav2',
      'bluetooth': 'tabBle',
      'settings': 'tabSettings'
    };

    // Show selected panel
    document.getElementById(panelMap[tabId]).classList.add('active');
    document.getElementById(btnMap[tabId]).classList.add('active');
    
    // Handle map resize if nav tab is selected (Leaflet requires this when unhidden)
    if (tabId === 'navigation' && typeof Nav !== 'undefined' && Nav.map) {
      setTimeout(() => {
        Nav.map.invalidateSize();
      }, 100);
    }
  },

  showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  },

  async toggleWakeLock(enable) {
    if (!('wakeLock' in navigator)) {
      if (enable) this.showToast('Wake Lock not supported on this device');
      return;
    }

    try {
      if (enable) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          console.log('Wake Lock released');
        });
      } else {
        if (this.wakeLock !== null) {
          await this.wakeLock.release();
          this.wakeLock = null;
        }
      }
    } catch (err) {
      console.error(`Wake Lock error: ${err.name}, ${err.message}`);
    }
  }
};

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
