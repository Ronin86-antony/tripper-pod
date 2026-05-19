/**
 * ble.js - Web Bluetooth API logic for RE Tripper Pod
 */

const BLE = {
  device: null,
  server: null,
  servicesCache: new Map(),

  async toggleConnect() {
    if (this.isConnected()) {
      this.disconnect();
    } else {
      await this.scanAndConnect();
    }
  },

  isConnected() {
    return this.device && this.device.gatt.connected;
  },

  async scanAndConnect() {
    if (!navigator.bluetooth) {
      App.showToast('Web Bluetooth not supported on this browser.');
      return;
    }

    try {
      const filterName = document.getElementById('podNameFilter').value || 'Tripper';
      App.showToast('Scanning for ' + filterName + '...');
      
      const options = {
        filters: [
          { namePrefix: filterName }
        ],
        optionalServices: [] // We will dynamically discover services
      };

      // Workaround for accepting all devices if filter is empty or generic
      if (!filterName) {
        delete options.filters;
        options.acceptAllDevices = true;
      }

      this.device = await navigator.bluetooth.requestDevice(options);
      
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected.bind(this));
      
      App.showToast('Connecting to ' + this.device.name + '...');
      this.server = await this.device.gatt.connect();
      
      App.showToast('Connected!');
      this.updateUI(true);

      if (document.getElementById('autoSyncToggle').checked) {
        setTimeout(() => this.syncTime(), 1000);
      }

    } catch (error) {
      console.error('BLE connection failed', error);
      App.showToast('Connection failed: ' + error.message);
      this.updateUI(false);
    }
  },

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
  },

  onDisconnected() {
    App.showToast('Device disconnected');
    this.updateUI(false);
    this.device = null;
    this.server = null;
    this.servicesCache.clear();
  },

  updateUI(connected) {
    const btn = document.getElementById('btnBleConnect');
    const ring = document.getElementById('bleRing');
    const statusTitle = document.getElementById('bleStatusTitle');
    const indicator = document.getElementById('bleIndicator');
    const nameLabel = document.getElementById('bleName');
    const infoPanel = document.getElementById('bleDeviceInfo');

    if (connected) {
      btn.innerHTML = 'Disconnect';
      btn.classList.add('disconnect');
      ring.classList.add('connected');
      statusTitle.textContent = 'Connected';
      indicator.classList.add('connected');
      nameLabel.textContent = this.device.name || 'Unknown Device';
      
      infoPanel.style.display = 'block';
      document.getElementById('bleDeviceName').textContent = this.device.name || 'N/A';
      document.getElementById('bleDeviceId').textContent = this.device.id || 'N/A';
      
    } else {
      btn.innerHTML = '🔍 Scan & Connect';
      btn.classList.remove('disconnect');
      ring.classList.remove('connected');
      statusTitle.textContent = 'Tripper Pod BLE';
      indicator.classList.remove('connected');
      nameLabel.textContent = 'Not Connected';
      
      infoPanel.style.display = 'none';
    }
  },

  async getCharacteristic(serviceUuid, charUuid) {
    if (!this.isConnected()) throw new Error('Not connected');
    
    // Convert to lowercase as UUIDs must be lowercase in Web Bluetooth API
    serviceUuid = serviceUuid.toLowerCase().trim();
    charUuid = charUuid.toLowerCase().trim();

    try {
      // Reconnect if needed (sometimes helps on Android)
      if(!this.server.connected) {
         this.server = await this.device.gatt.connect();
      }

      let service = this.servicesCache.get(serviceUuid);
      if (!service) {
        service = await this.server.getPrimaryService(serviceUuid);
        this.servicesCache.set(serviceUuid, service);
      }
      
      return await service.getCharacteristic(charUuid);
    } catch (e) {
      // Clear cache on error in case service references went stale
      this.servicesCache.delete(serviceUuid);
      throw e;
    }
  },

  async syncTime() {
    if (!this.isConnected()) {
      App.showToast('Please connect to the Pod first.');
      return;
    }

    const svcUuid = document.getElementById('timeSvcUuid').value;
    const charUuid = document.getElementById('timeCharUuid').value;

    if (!svcUuid || !charUuid) {
      App.showToast('Please enter Service and Characteristic UUIDs for Time Sync.');
      return;
    }

    try {
      App.showToast('Syncing time...');
      const characteristic = await this.getCharacteristic(svcUuid, charUuid);
      
      // Try writing byte array format first
      const payload = TimeSync.buildTimePayload();
      await characteristic.writeValue(payload);
      
      App.showToast('Time synced successfully!');
    } catch (error) {
      console.error('Time sync error:', error);
      // Fallback to ASCII write if it failed
      try {
         const characteristic = await this.getCharacteristic(svcUuid, charUuid);
         const asciiPayload = TimeSync.encodeString(TimeSync.buildAsciiPayload());
         await characteristic.writeValue(asciiPayload);
         App.showToast('Time synced (ASCII format)');
      } catch (innerError) {
         console.error('Time sync fallback error:', innerError);
         App.showToast('Sync failed: ' + innerError.message);
      }
    }
  },

  async sendNavStep(step) {
    if (!this.isConnected()) return;

    const charUuid = document.getElementById('navCharUuid').value;
    // Assuming nav data uses the same primary service as time sync for this example.
    // If a different service UUID is needed, a dedicated input for Nav Service UUID should be added.
    const svcUuid = document.getElementById('timeSvcUuid').value; 

    if (!svcUuid || !charUuid) {
      document.getElementById('navSyncStatus').textContent = 'Error: Missing UUIDs';
      return;
    }

    try {
      const characteristic = await this.getCharacteristic(svcUuid, charUuid);
      
      // Construct a generic payload based on maneuver. 
      // NOTE: This is highly speculative and depends heavily on the actual RE protocol.
      const maneuver = step.maneuver.type;
      const distance = Math.round(step.distance);
      
      // Simple custom format: "MANEUVER,DISTANCE"
      const payloadStr = `${maneuver},${distance}`;
      const payload = TimeSync.encodeString(payloadStr);

      await characteristic.writeValue(payload);
      document.getElementById('navSyncStatus').textContent = 'Last sent: ' + payloadStr;
    } catch (error) {
       console.error('Nav sync error:', error);
       document.getElementById('navSyncStatus').textContent = 'Sync failed: ' + error.message;
    }
  },

  async inspectServices() {
    if (!this.isConnected()) {
      App.showToast('Please connect to the Pod first.');
      return;
    }

    const list = document.getElementById('serviceList');
    list.innerHTML = 'Scanning services...<br>';
    App.showToast('Inspecting services...');

    try {
      const services = await this.server.getPrimaryServices();
      list.innerHTML += `Found ${services.length} services.<br><br>`;

      for (const service of services) {
        list.innerHTML += `Service: <b>${service.uuid}</b><br>`;
        
        try {
          const characteristics = await service.getCharacteristics();
          for (const characteristic of characteristics) {
            let props = [];
            if (characteristic.properties.read) props.push('READ');
            if (characteristic.properties.write) props.push('WRITE');
            if (characteristic.properties.notify) props.push('NOTIFY');
            if (characteristic.properties.writeWithoutResponse) props.push('WRITE_NR');
            
            list.innerHTML += `  └─ Char: <b>${characteristic.uuid}</b> [${props.join(', ')}]<br>`;
          }
        } catch (charError) {
           list.innerHTML += `  └─ Error reading characteristics: ${charError.message}<br>`;
        }
        list.innerHTML += '<br>';
      }
      
      App.showToast('Inspection complete.');
    } catch (error) {
      console.error('Inspection failed:', error);
      list.innerHTML += `<span style="color:red">Failed: ${error.message}</span>`;
      App.showToast('Inspection failed.');
    }
  }
};
