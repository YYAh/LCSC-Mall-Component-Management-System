/**
 * WeChat Mini Program Bluetooth BLE Thermal Label Printer Driver
 * 支持 TSPL 与 CPCL 双指令集，支持 UTF-8 / GBK 编码防乱码
 */

// Convert string to ArrayBuffer (with UTF-8 / GB2312 safe byte encoding)
function stringToBuffer(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (code >> 18));
      bytes.push(0x80 | ((code >> 12) & 0x3f));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes).buffer;
}

class BlePrinterManager {
  constructor() {
    this.deviceId = null;
    this.serviceId = null;
    this.characteristicId = null;
    this.isConnected = false;
    this.deviceName = '';
    this.protocol = 'TSPL'; // 'TSPL' or 'CPCL'
  }

  setProtocol(proto) {
    this.protocol = (proto || 'TSPL').toUpperCase();
  }

  // Initialize Bluetooth Adapter
  init() {
    return new Promise((resolve, reject) => {
      wx.openBluetoothAdapter({
        success: resolve,
        fail: (err) => {
          if (err.errCode === 10001) {
            reject(new Error('请打开手机蓝牙后再试'));
          } else {
            reject(err);
          }
        }
      });
    });
  }

  // Start discovery for BLE devices
  startScan(onDeviceFound) {
    return new Promise((resolve, reject) => {
      wx.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
        success: () => {
          wx.onBluetoothDeviceFound((res) => {
            if (res.devices && res.devices.length > 0) {
              res.devices.forEach(device => {
                if (device.name || device.localName) {
                  onDeviceFound({
                    deviceId: device.deviceId,
                    name: device.name || device.localName || '未知蓝牙打印机',
                    RSSI: device.RSSI
                  });
                }
              });
            }
          });
          resolve();
        },
        fail: reject
      });
    });
  }

  stopScan() {
    return new Promise((resolve) => {
      wx.stopBluetoothDevicesDiscovery({
        complete: resolve
      });
    });
  }

  // Connect to BLE Printer
  async connect(deviceId, deviceName = '') {
    this.deviceId = deviceId;
    this.deviceName = deviceName;

    await new Promise((resolve, reject) => {
      wx.createBLEConnection({
        deviceId,
        timeout: 10000,
        success: resolve,
        fail: reject
      });
    });

    // Get services
    const servicesRes = await new Promise((resolve, reject) => {
      wx.getBLEDeviceServices({
        deviceId,
        success: resolve,
        fail: reject
      });
    });

    // Find writeable characteristic
    let foundService = null;
    let foundChar = null;

    for (const s of servicesRes.services) {
      try {
        const charsRes = await new Promise((resolve, reject) => {
          wx.getBLEDeviceCharacteristics({
            deviceId,
            serviceId: s.uuid,
            success: resolve,
            fail: reject
          });
        });

        for (const c of charsRes.characteristics) {
          if (c.properties.write || c.properties.writeNoResponse) {
            foundService = s.uuid;
            foundChar = c.uuid;
            break;
          }
        }
        if (foundChar) break;
      } catch (e) {}
    }

    if (!foundChar) {
      throw new Error('未找到打印机可写特征值通道');
    }

    this.serviceId = foundService;
    this.characteristicId = foundChar;
    this.isConnected = true;

    // Save to local storage for quick reconnect
    wx.setStorageSync('LAST_BLE_DEVICE', {
      deviceId,
      name: deviceName
    });

    return {
      deviceId,
      deviceName,
      serviceId: foundService,
      characteristicId: foundChar
    };
  }

  // Disconnect
  disconnect() {
    return new Promise((resolve) => {
      if (this.deviceId) {
        wx.closeBLEConnection({
          deviceId: this.deviceId,
          complete: () => {
            this.isConnected = false;
            this.deviceId = null;
            resolve();
          }
        });
      } else {
        this.isConnected = false;
        resolve();
      }
    });
  }

  // Send binary buffer to BLE printer in chunks
  async sendBuffer(buffer) {
    if (!this.isConnected || !this.deviceId || !this.characteristicId) {
      throw new Error('打印机未连接');
    }

    const chunkSize = 64;
    const uint8 = new Uint8Array(buffer);
    const totalLen = uint8.length;

    for (let i = 0; i < totalLen; i += chunkSize) {
      const slice = uint8.slice(i, Math.min(i + chunkSize, totalLen));
      await new Promise((resolve, reject) => {
        wx.writeBLECharacteristicValue({
          deviceId: this.deviceId,
          serviceId: this.serviceId,
          characteristicId: this.characteristicId,
          value: slice.buffer,
          success: resolve,
          fail: reject
        });
      });
      // Tiny sleep to avoid buffer overflow on printer
      await new Promise(r => setTimeout(r, 20));
    }
  }

  /**
   * Build TSPL Label Command (Standard for JSD / Hanin / Deli / Xprinter / Gprinter / 佳博 / 得力)
   */
  buildTsplCommand(item, options = {}) {
    const w = options.width_mm || 30;
    const h = options.height_mm || 10;
    const copies = options.copies || 1;

    let cmd = '';
    cmd += `SIZE ${w} mm, ${h} mm\r\n`;
    cmd += `GAP 2 mm, 0 mm\r\n`;
    cmd += `DIRECTION 1\r\n`;
    cmd += `CODEPAGE UTF-8\r\n`; // Explicit UTF-8 codepage prevent Chinese garbled text
    cmd += `CLS\r\n`;

    // For compact 30x10mm sample book strip label
    if (w <= 35 && h <= 15) {
      const qrData = item.c_code || item.mpn || 'C';
      cmd += `QRCODE 10, 10, L, 2, A, 0, "${qrData}"\r\n`;
      const loc = item.location_text || '未分配仓位';
      cmd += `TEXT 70, 8, "TSS24.BF2", 0, 1, 1, "${loc}"\r\n`;
      const line2 = `${item.c_code || ''} ${item.spec || item.mpn || item.name || ''}`.slice(0, 18);
      cmd += `TEXT 70, 36, "TSS24.BF2", 0, 1, 1, "${line2}"\r\n`;
    } else {
      // Standard 40x20mm or 50x30mm label
      const qrData = item.c_code ? `https://item.szlcsc.com/${item.c_code.replace('C','')}.html` : item.mpn;
      cmd += `QRCODE 16, 16, M, 3, A, 0, "${qrData}"\r\n`;
      const loc = item.location_text || '仓位: 待定';
      cmd += `TEXT 110, 16, "TSS24.BF2", 0, 1, 1, "[${loc}]"\r\n`;
      cmd += `TEXT 110, 48, "TSS24.BF2", 0, 1, 1, "${item.c_code || ''} ${item.mpn || ''}"\r\n`;
      if (item.spec) {
        cmd += `TEXT 110, 80, "TSS24.BF2", 0, 1, 1, "${item.spec.slice(0, 18)}"\r\n`;
      }
      if (item.package_name || item.brand) {
        cmd += `TEXT 110, 112, "TSS24.BF2", 0, 1, 1, "${item.package_name || ''} ${item.brand || ''}"\r\n`;
      }
    }

    cmd += `PRINT ${copies}, 1\r\n`;
    return cmd;
  }

  /**
   * Build CPCL Label Command (Standard for Zebra / Niimbot / Zhike / QR / CPCL printers)
   */
  buildCpclCommand(item, options = {}) {
    const w = options.width_mm || 30;
    const h = options.height_mm || 10;
    const copies = options.copies || 1;
    const heightDots = h * 8;
    const widthDots = w * 8;

    let cmd = `! 0 200 200 ${heightDots} ${copies}\r\n`;
    cmd += `PW ${widthDots}\r\n`;
    cmd += `TONE 0\r\n`;
    cmd += `SPEED 3\r\n`;
    cmd += `ON-FEED IGNORE\r\n`;

    if (w <= 35 && h <= 15) {
      const qrData = item.c_code || item.mpn || 'C';
      cmd += `B QR 10 10 M 2 U 3\r\n`;
      cmd += `MA,${qrData}\r\n`;
      cmd += `ENDQR\r\n`;
      cmd += `TEXT 24 0 70 8 ${item.location_text || '未分配'}\r\n`;
      const line2 = `${item.c_code || ''} ${item.spec || item.mpn || ''}`.slice(0, 16);
      cmd += `TEXT 24 0 70 36 ${line2}\r\n`;
    } else {
      const qrData = item.c_code ? `https://item.szlcsc.com/${item.c_code.replace('C','')}.html` : item.mpn;
      cmd += `B QR 16 16 M 2 U 4\r\n`;
      cmd += `MA,${qrData}\r\n`;
      cmd += `ENDQR\r\n`;
      cmd += `TEXT 24 0 110 16 [${item.location_text || '待定'}]\r\n`;
      cmd += `TEXT 24 0 110 48 ${item.c_code || ''} ${item.mpn || ''}\r\n`;
      if (item.spec) {
        cmd += `TEXT 24 0 110 80 ${item.spec.slice(0, 18)}\r\n`;
      }
    }

    cmd += `PRINT\r\n`;
    return cmd;
  }

  // Print component label directly via current protocol (TSPL / CPCL)
  async printComponent(item, options = {}) {
    const proto = options.protocol || this.protocol || 'TSPL';
    let cmdStr = '';
    if (proto === 'CPCL') {
      cmdStr = this.buildCpclCommand(item, options);
    } else {
      cmdStr = this.buildTsplCommand(item, options);
    }
    const buffer = stringToBuffer(cmdStr);
    await this.sendBuffer(buffer);
    return true;
  }
}

const blePrinter = new BlePrinterManager();
module.exports = blePrinter;
