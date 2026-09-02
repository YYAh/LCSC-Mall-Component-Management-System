// pages/settings/settings.js
const api = require('../../utils/api');
const onlineSync = require('../../utils/onlineSync');

Page({
  data: {
    engineMode: 'local',
    serverUrl: 'http://127.0.0.1:3000',
    testingServer: false,
    seeding: false,
    savedBle: null,

    // Online Sync
    syncEnabled: false,
    webhookUrl: '',
    testingSync: false,
    pushingAll: false
  },

  onShow() {
    const syncCfg = onlineSync.getSyncConfig();
    this.setData({
      engineMode: api.getEngineMode(),
      serverUrl: api.getServerUrl(),
      syncEnabled: syncCfg.enabled,
      webhookUrl: syncCfg.webhookUrl
    });
    this.loadSavedBle();
  },

  changeEngineMode(e) {
    const mode = e.currentTarget.dataset.mode;
    api.setEngineMode(mode);
    this.setData({ engineMode: mode });
    let tip = '已切换至本地单机模式 (100% 免费)';
    if (mode === 'rest') tip = '已切换至局域网自建服务器模式';
    wx.showToast({ title: tip, icon: 'none' });
  },

  onServerUrlInput(e) {
    this.setData({ serverUrl: e.detail.value });
  },

  async saveAndTestServer() {
    const cleanUrl = api.setServerUrl(this.data.serverUrl);
    this.setData({ serverUrl: cleanUrl, testingServer: true });
    wx.showLoading({ title: '测试局域网连接...' });

    try {
      const res = await api.getDashboard();
      wx.hideLoading();
      this.setData({ testingServer: false });
      if (res && res.success) {
        wx.showModal({
          title: '✅ 局域网服务器连接成功！',
          content: `已成功连接到后端服务 (${cleanUrl})！\n• 库中元器件数: ${res.data.total_components} 种\n• 总库存: ${res.data.total_stock} 个\n• 样品册: ${res.data.total_books} 本`,
          showCancel: false
        });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ testingServer: false });
      wx.showModal({
        title: '连接失败',
        content: `无法连接到 ${cleanUrl}\n\n请检查：\n1. 电脑是否双击运行了【启动后端服务.bat】？\n2. 手机和电脑是否连接在同一个 WiFi 局域网下？\n3. 填写的 IP 是否是电脑的局域网 IP（如 192.168.x.x）？`,
        showCancel: false
      });
    }
  },

  // Online Sync Handlers
  onSyncSwitchChange(e) {
    const enabled = e.detail.value;
    onlineSync.saveSyncConfig({ enabled });
    this.setData({ syncEnabled: enabled });
    wx.showToast({
      title: enabled ? '已开启在线表格同步' : '已关闭在线表格同步',
      icon: 'none'
    });
  },

  onWebhookUrlInput(e) {
    const url = e.detail.value;
    onlineSync.saveSyncConfig({ webhookUrl: url });
    this.setData({ webhookUrl: url });
  },

  async testSyncConnection() {
    const url = this.data.webhookUrl.trim();
    if (!url) {
      wx.showToast({ title: '请先输入 Webhook 链接', icon: 'none' });
      return;
    }
    onlineSync.saveSyncConfig({ webhookUrl: url });

    this.setData({ testingSync: true });
    wx.showLoading({ title: '发送测试请求...' });

    try {
      await onlineSync.testWebhookConnection(url);
      wx.hideLoading();
      this.setData({ testingSync: false });
      wx.showModal({
        title: '🎉 连通测试成功！',
        content: '在线表格 / 飞书机器人已成功接收到测试数据！\n\n后续每次元器件录入、领料出库都会自动实时同步到该表格。',
        showCancel: false
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ testingSync: false });
      wx.showModal({
        title: '测试推送失败',
        content: err.message || '请检查 Webhook 链接是否正确，或网络是否通畅',
        showCancel: false
      });
    }
  },

  async pushAllToOnlineSheet() {
    const url = this.data.webhookUrl.trim();
    if (!url) {
      wx.showToast({ title: '请先输入 Webhook 链接', icon: 'none' });
      return;
    }
    onlineSync.saveSyncConfig({ webhookUrl: url, enabled: true });
    this.setData({ syncEnabled: true, pushingAll: true });

    wx.showLoading({ title: '读取库中全部物料...' });
    try {
      const res = await api.getComponents();
      const list = (res.data && res.data.list) || [];
      if (list.length === 0) {
        wx.hideLoading();
        this.setData({ pushingAll: false });
        wx.showToast({ title: '库中暂无元器件物料', icon: 'none' });
        return;
      }

      wx.showLoading({ title: `正在推送 ${list.length} 种物料...` });
      await onlineSync.syncAllComponents(list);

      wx.hideLoading();
      this.setData({ pushingAll: false });
      wx.showModal({
        title: '✅ 全量同步成功！',
        content: `已成功将库中现有的 ${list.length} 种元器件完整推送到在线表格！`,
        showCancel: false
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ pushingAll: false });
      wx.showModal({
        title: '同步失败',
        content: err.message || '网络连接超时',
        showCancel: false
      });
    }
  },

  loadSavedBle() {
    const saved = wx.getStorageSync('LAST_BLE_DEVICE');
    this.setData({ savedBle: saved && saved.deviceId ? saved : null });
  },

  clearSavedBle() {
    wx.removeStorageSync('LAST_BLE_DEVICE');
    this.setData({ savedBle: null });
    wx.showToast({ title: '已清除打印机绑定', icon: 'none' });
  },

  async seedDemoData() {
    this.setData({ seeding: true });
    wx.showLoading({ title: '写入示例物料...' });

    try {
      const demoList = [
        {
          c_code: 'C127509',
          mpn: 'K2-1102SP-C4SC-04',
          name: '贴片轻触开关',
          category: '轻触开关',
          brand: '韩国韩荣(HRO)',
          package_name: 'SMD-4P,6x6mm',
          spec: 'SMD-4P 6x6mm 贴片轻触按键',
          stock: 10,
          safe_stock: 5,
          location_text: 'B05-P01-R01',
          page_no: 1,
          row_no: 1
        },
        {
          c_code: 'C2906980',
          mpn: 'FRC0603F1003TS',
          name: '0603 贴片厚膜电阻',
          category: '贴片电阻',
          brand: 'FOJAN(富捷)',
          package_name: '0603',
          spec: '厚膜电阻 100kΩ ±1%',
          stock: 100,
          safe_stock: 10,
          location_text: 'B01-P01-R01',
          page_no: 1,
          row_no: 1
        },
        {
          c_code: 'C2907002',
          mpn: 'FRC0603F1001TS',
          name: '0603 贴片厚膜电阻',
          category: '贴片电阻',
          brand: 'FOJAN(富捷)',
          package_name: '0603',
          spec: '厚膜电阻 1kΩ ±1%',
          stock: 100,
          safe_stock: 10,
          location_text: 'B01-P01-R02',
          page_no: 1,
          row_no: 2
        },
        {
          c_code: 'C347367',
          mpn: 'LM317G',
          name: '可调线性稳压器(LDO)',
          category: '线性稳压器(LDO)',
          brand: 'UMW(友台半导体)',
          package_name: 'SOT-223',
          spec: '1.2V~37V 2.2A 40V',
          stock: 20,
          safe_stock: 5,
          location_text: 'B04-P01-R01',
          page_no: 1,
          row_no: 1
        },
        {
          c_code: 'C6331176',
          mpn: '2.54-4P TPGT',
          name: '2.54-4P 拨码开关',
          category: '拨码开关',
          brand: 'SHOU HAN(首韩)',
          package_name: 'SMD,P=2.54mm',
          spec: 'SMD,P=2.54mm 拨码开关',
          stock: 20,
          safe_stock: 5,
          location_text: 'B05-P01-R02',
          page_no: 1,
          row_no: 2
        }
      ];

      for (const item of demoList) {
        await api.createComponent(item);
      }

      wx.hideLoading();
      this.setData({ seeding: false });
      wx.showModal({
        title: '示例数据写入成功',
        content: `成功写入 ${demoList.length} 个标准物料（含阻值、品牌与插槽绑定）！\n可前往【物料库】与【样品册】查看体验。`,
        showCancel: false
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ seeding: false });
      wx.showToast({ title: '写入失败: ' + e.message, icon: 'none' });
    }
  },

  clearAllData() {
    wx.showModal({
      title: '危险操作确认',
      content: '确定要清空本地全部元器件物料和库存日志吗？该操作不可撤销。',
      confirmColor: '#f5222d',
      confirmText: '确定清空',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('LOCAL_COMPS');
          wx.removeStorageSync('LOCAL_LOGS');
          wx.showToast({ title: '本地物料已清空', icon: 'success' });
        }
      }
    });
  }
});
