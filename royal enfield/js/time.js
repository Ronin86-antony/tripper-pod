/**
 * time.js - Time Display and BLE Time Sync
 */

const TimeSync = {
  displayInterval: null,

  init() {
    this.startDisplay();
  },

  startDisplay() {
    this.updateDisplay();
    this.displayInterval = setInterval(() => this.updateDisplay(), 1000);
  },

  updateDisplay() {
    const el = document.getElementById('bleTimeDisplay');
    if (!el) return;
    
    const now = new Date();
    const format = document.getElementById('timeFormat') ? document.getElementById('timeFormat').value : '12';
    
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    let suffix = '';

    if (format === '12') {
      suffix = hours >= 12 ? ' PM' : ' AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
    }
    
    el.textContent = `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}${suffix}`;
  },

  // Builds a byte array from current time to send to pod
  buildTimePayload() {
    const now = new Date();
    // Send as: [year_hi, year_lo, month, day, hour, min, sec]
    const year = now.getFullYear();
    return new Uint8Array([
      (year >> 8) & 0xFF,
      year & 0xFF,
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds()
    ]);
  },

  // Also builds an ASCII string payload as a fallback
  buildAsciiPayload() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  },

  // Encode as UTF-8 bytes
  encodeString(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }
};
