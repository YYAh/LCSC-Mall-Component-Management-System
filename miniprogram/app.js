// app.js
App({
  onLaunch() {
    console.log('嘉立创元器件与 12 行样品册管理小程序启动 (100% 永久免费单机/局域网模式)');
  },
  onPageNotFound(res) {
    console.warn('页面不存在，自动重定向到首页:', res);
    wx.switchTab({
      url: '/pages/index/index'
    });
  },
  globalData: {
    userInfo: null,
    currentBookId: 1,
    filterLowStock: false,
    targetBookId: null,
    targetPageNo: null,
    pendingScanRaw: null
  }
});

