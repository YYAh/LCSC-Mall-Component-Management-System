// pages/print/print.js
const api = require('../../utils/api');
const blePrinter = require('../../utils/blePrinter');
const { drawQrCodeToCanvas } = require('../../utils/qrcode');

Page({
  data: {
    comp: {
      id: 1,
      c_code: 'C127509',
      mpn: 'K2-1102SP-C4SC-04',
      name: '轻触开关 4P 贴片',
      brand: '韩国韩荣(HRO)',
      package_name: 'SMD-4P',
      spec: 'SMD-4P 6x6mm 贴片轻触按键',
      location_text: 'B01-P01-R01'
    },
    templates: [
      { id: 1, name: '样品册插槽标签 (30x10mm)', width_mm: 30, height_mm: 10 },
      { id: 2, name: '标准元件盒标签 (40x20mm)', width_mm: 40, height_mm: 20 },
      { id: 3, name: '大号抽屉标签 (50x30mm)', width_mm: 50, height_mm: 30 }
    ],
    selectedTplIndex: 0,
    copies: 1,
    protocols: ['TSPL (佳博/汉印/得力等)', 'CPCL (芝柯/启锐/精臣等)'],
    selectedProtoIndex: 0,
    canvasWidth: 300,
    canvasHeight: 100,
    isBleConnected: false,
    bleDeviceName: '',
    searchingBle: false,
    deviceList: [],
    printing: false
  },

  async onLoad(options) {
    await this.loadTemplates();
    if (options.id) {
      this.loadComponent(options.id);
    }
    this.checkSavedBleDevice();
  },

  onReady() {
    this.renderCanvasLabel();
  },

  async loadTemplates() {
    try {
      const res = await api.getTemplates();
      if (res && res.success && res.data && res.data.length > 0) {
        this.setData({ templates: res.data });
      }
    } catch (e) {
      console.warn('Load templates failed, using default:', e);
    }
  },

  async loadComponent(id) {
    try {
      const res = await api.getComponentDetail(id);
      if (res && res.success) {
        this.setData({ comp: res.data }, () => {
          this.renderCanvasLabel();
        });
      }
    } catch (e) {
      console.error(e);
    }
  },

  checkSavedBleDevice() {
    const saved = wx.getStorageSync('LAST_BLE_DEVICE');
    if (saved && saved.deviceId) {
      this.setData({
        isBleConnected: blePrinter.isConnected,
        bleDeviceName: saved.name || saved.deviceId
      });
    }
  },

  onTplChange(e) {
    const idx = parseInt(e.detail.value, 10);
    this.setData({ selectedTplIndex: idx }, () => {
      this.renderCanvasLabel();
    });
  },

  onProtoChange(e) {
    const idx = parseInt(e.detail.value, 10);
    this.setData({ selectedProtoIndex: idx });
    blePrinter.setProtocol(idx === 1 ? 'CPCL' : 'TSPL');
  },

  onCopiesChange(e) {
    const val = parseInt(e.detail.value, 10) || 1;
    this.setData({ copies: Math.max(1, Math.min(val, 99)) });
  },

  renderCanvasLabel() {
    const tpl = this.data.templates[this.data.selectedTplIndex] || { width_mm: 30, height_mm: 10 };
    const comp = this.data.comp || {};

    const scale = 10;
    const cWidth = tpl.width_mm * scale;
    const cHeight = tpl.height_mm * scale;

    this.setData({
      canvasWidth: cWidth,
      canvasHeight: cHeight
    });

    const ctx = wx.createCanvasContext('labelCanvas', this);
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, cWidth, cHeight);

    ctx.setStrokeStyle('#e0e0e0');
    ctx.setLineWidth(1);
    ctx.strokeRect(1, 1, cWidth - 2, cHeight - 2);

    const qrSize = Math.min(cHeight - 16, 75);
    const qrData = comp.c_code ? `https://item.szlcsc.com/${comp.c_code.replace('C', '')}.html` : (comp.mpn || 'C');

    drawQrCodeToCanvas(ctx, qrData, 10, (cHeight - qrSize) / 2, qrSize, qrSize);

    const textLeft = 10 + qrSize + 12;
    ctx.setTextBaseline('top');

    if (tpl.width_mm <= 35 && tpl.height_mm <= 15) {
      // 30x10mm strip
      ctx.setFillStyle('#0052cc');
      ctx.setFontSize(18);
      ctx.fillText(`[${comp.location_text || '待分配'}]`, textLeft, 10);

      ctx.setFillStyle('#1a1a1a');
      ctx.setFontSize(14);
      const specLine = `${comp.c_code || ''} ${comp.spec || comp.mpn || ''}`.slice(0, 16);
      ctx.fillText(specLine, textLeft, 38);
    } else {
      // 40x20mm or larger
      ctx.setFillStyle('#0052cc');
      ctx.setFontSize(20);
      ctx.fillText(`仓位: ${comp.location_text || '待分配'}`, textLeft, 12);

      ctx.setFillStyle('#1a1a1a');
      ctx.setFontSize(16);
      ctx.fillText(comp.c_code ? `立创: ${comp.c_code}` : '', textLeft, 40);

      ctx.setFontSize(14);
      ctx.fillText(`型号: ${(comp.mpn || '').slice(0, 18)}`, textLeft, 66);

      ctx.setFillStyle('#595959');
      ctx.setFontSize(13);
      ctx.fillText(`${comp.spec || comp.package_name || ''}`, textLeft, 92);
    }

    ctx.draw();
  },

  async startSearchBle() {
    this.setData({ searchingBle: true, deviceList: [] });
    wx.showLoading({ title: '搜索蓝牙打印机...' });

    try {
      await blePrinter.init();
      await blePrinter.startScan((device) => {
        const list = this.data.deviceList;
        if (!list.find(d => d.deviceId === device.deviceId)) {
          this.setData({ deviceList: [...list, device] });
        }
      });

      setTimeout(() => {
        wx.hideLoading();
        this.setData({ searchingBle: false });
        if (this.data.deviceList.length === 0) {
          wx.showToast({ title: '未找到蓝牙打印机', icon: 'none' });
        }
      }, 5000);
    } catch (err) {
      wx.hideLoading();
      this.setData({ searchingBle: false });
      wx.showModal({
        title: '蓝牙初始化失败',
        content: err.message || '请确保手机蓝牙已开启并允许微信获取定位/蓝牙权限',
        showCancel: false
      });
    }
  },

  async connectDevice(e) {
    const item = e.currentTarget.dataset.item;
    wx.showLoading({ title: '连接中...' });

    try {
      await blePrinter.connect(item.deviceId, item.name);
      wx.hideLoading();
      this.setData({
        isBleConnected: true,
        bleDeviceName: item.name
      });
      wx.showToast({ title: '连接成功！', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '连接失败: ' + err.message, icon: 'none' });
    }
  },

  async onPrint() {
    if (!this.data.isBleConnected) {
      wx.showModal({
        title: '提示',
        content: '请先在下方搜索并连接蓝牙便携热敏标签打印机！',
        showCancel: false
      });
      return;
    }

    this.setData({ printing: true });
    wx.showLoading({ title: '发送打印数据...' });

    try {
      const tpl = this.data.templates[this.data.selectedTplIndex];
      const proto = this.data.selectedProtoIndex === 1 ? 'CPCL' : 'TSPL';

      await blePrinter.printComponent(this.data.comp, {
        width_mm: tpl.width_mm,
        height_mm: tpl.height_mm,
        copies: this.data.copies,
        protocol: proto
      });

      wx.hideLoading();
      this.setData({ printing: false });
      wx.showToast({ title: '打印完成！', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ printing: false });
      wx.showModal({
        title: '打印失败',
        content: err.message || '请检查打印机连接或纸张状态',
        showCancel: false
      });
    }
  }
});
