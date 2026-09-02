// pages/index/index.js
const api = require('../../utils/api');

Page({
  data: {
    isConnected: true,
    stats: {
      total_components: 0,
      total_stock: 0,
      low_stock_count: 0,
      total_books: 0,
      recent_logs: [],
      low_stock_list: []
    }
  },

  onShow() {
    this.loadDashboardData();
  },

  onPullDownRefresh() {
    this.loadDashboardData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadDashboardData() {
    try {
      const res = await api.getDashboard();
      if (res && res.success) {
        this.setData({
          stats: res.data,
          isConnected: true
        });
      }
    } catch (err) {
      console.warn('Load dashboard error:', err.message);
    }
  },

  quickScan() {
    wx.scanCode({
      scanType: ['qrCode', 'barCode'],
      success: (res) => {
        const resultStr = res.result;
        getApp().globalData.pendingScanRaw = resultStr;
        wx.setStorageSync('PENDING_SCAN_RAW', resultStr);
        wx.switchTab({
          url: '/pages/scan/scan'
        });
      },
      fail: (err) => {
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          // If camera permission cancelled or failed, switch to scan page anyway
          wx.switchTab({ url: '/pages/scan/scan' });
        }
      }
    });
  },

  goToComponents() {
    wx.switchTab({ url: '/pages/components/components' });
  },

  goToLowStock() {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.filterLowStock = true;
    }
    wx.switchTab({
      url: '/pages/components/components'
    });
  },

  goToBooks() {
    wx.switchTab({ url: '/pages/books/books' });
  },

  goToPrint() {
    wx.navigateTo({ url: '/pages/print/print' });
  },

  goToSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  }
});
