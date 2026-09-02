// pages/detail/detail.js
const api = require('../../utils/api');

Page({
  data: {
    id: null,
    comp: null,
    loading: true,
    showEditModal: false,
    savingEdit: false,
    editForm: {
      mpn: '',
      stock: 0,
      c_code: '',
      brand: '',
      spec: '',
      package_name: '',
      category: '',
      order_no: ''
    }
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      this.loadComponentDetail(options.id);
    }
  },

  onShow() {
    if (this.data.id) {
      this.loadComponentDetail(this.data.id);
    }
  },

  async loadComponentDetail(id) {
    try {
      const res = await api.getComponentDetail(id);
      this.setData({ loading: false });
      if (res && res.success) {
        this.setData({ comp: res.data });
      }
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败: ' + err.message, icon: 'none' });
    }
  },

  previewImage() {
    if (this.data.comp && this.data.comp.image_url) {
      wx.previewImage({
        urls: [this.data.comp.image_url]
      });
    }
  },

  copyMpn() {
    if (this.data.comp && this.data.comp.mpn) {
      wx.setClipboardData({
        data: this.data.comp.mpn,
        success: () => {
          wx.showToast({ title: '型号已复制', icon: 'success' });
        }
      });
    }
  },

  copyCCode() {
    if (this.data.comp && this.data.comp.c_code) {
      wx.setClipboardData({
        data: this.data.comp.c_code,
        success: () => {
          wx.showToast({ title: '编号已复制', icon: 'success' });
        }
      });
    }
  },

  openDatasheet() {
    if (this.data.comp && this.data.comp.datasheet_url) {
      wx.setClipboardData({
        data: this.data.comp.datasheet_url,
        success: () => {
          wx.showToast({ title: '立创链接已复制到剪贴板', icon: 'success' });
        }
      });
    }
  },

  viewInBook() {
    const comp = this.data.comp;
    if (comp && comp.book_id) {
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.targetBookId = comp.book_id;
        app.globalData.targetPageNo = comp.page_no || 1;
      }
    }
    wx.switchTab({ url: '/pages/books/books' });
  },

  openOutboundModal() {
    const comp = this.data.comp;
    wx.showModal({
      title: `领料出库 (当前库存: ${comp.stock} ${comp.unit || '个'})`,
      content: '',
      editable: true,
      placeholderText: '请输入出库数量 (默认 1)',
      success: async (res) => {
        if (res.confirm) {
          const textVal = (res.content || '').trim();
          const qty = textVal === '' ? 1 : parseInt(textVal, 10);
          if (isNaN(qty) || qty <= 0) {
            wx.showToast({ title: '请输入有效数量', icon: 'none' });
            return;
          }
          try {
            const outRes = await api.stockOut({ component_id: comp.id || comp._id, qty, remark: '项目领料' });
            if (outRes && outRes.success) {
              wx.showToast({ title: '领料成功', icon: 'success' });
              this.loadComponentDetail(comp.id || comp._id);
            }
          } catch (err) {
            wx.showToast({ title: err.message || '出库失败', icon: 'none' });
          }
        }
      }
    });
  },

  openInboundModal() {
    const comp = this.data.comp;
    wx.showModal({
      title: `补充入库 (当前库存: ${comp.stock} ${comp.unit || '个'})`,
      content: '',
      editable: true,
      placeholderText: '请输入补充入库数量 (默认 10)',
      success: async (res) => {
        if (res.confirm) {
          const textVal = (res.content || '').trim();
          const qty = textVal === '' ? 10 : parseInt(textVal, 10);
          if (isNaN(qty) || qty <= 0) {
            wx.showToast({ title: '请输入有效数量', icon: 'none' });
            return;
          }
          try {
            const inRes = await api.stockIn({ component_id: comp.id || comp._id, qty, remark: '补充入库' });
            if (inRes && inRes.success) {
              wx.showToast({ title: '入库成功', icon: 'success' });
              this.loadComponentDetail(comp.id || comp._id);
            }
          } catch (err) {
            wx.showToast({ title: err.message || '入库失败', icon: 'none' });
          }
        }
      }
    });
  },

  openAdjustModal() {
    const comp = this.data.comp;
    wx.showModal({
      title: `盘点校准 (记录库存: ${comp.stock})`,
      content: '',
      editable: true,
      placeholderText: '请输入实际盘点库存数',
      success: async (res) => {
        if (res.confirm) {
          const stock = parseInt((res.content || '').trim(), 10);
          if (isNaN(stock) || stock < 0) {
            wx.showToast({ title: '请输入有效数值', icon: 'none' });
            return;
          }
          try {
            const setRes = await api.stockSet({ component_id: comp.id || comp._id, stock, remark: '实际盘点校准' });
            if (setRes && setRes.success) {
              wx.showToast({ title: '校准成功', icon: 'success' });
              this.loadComponentDetail(comp.id || comp._id);
            }
          } catch (err) {
            wx.showToast({ title: err.message || '校准失败', icon: 'none' });
          }
        }
      }
    });
  },

  openEditModal() {
    const c = this.data.comp;
    this.setData({
      showEditModal: true,
      editForm: {
        mpn: c.mpn || '',
        stock: c.stock || 0,
        c_code: c.c_code || '',
        brand: c.brand || '',
        spec: c.spec || c.name || '',
        package_name: c.package_name || '',
        category: c.category || '',
        order_no: c.order_no || ''
      }
    });
  },

  closeEditModal() {
    this.setData({ showEditModal: false });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`editForm.${field}`]: e.detail.value
    });
  },

  async submitEditForm() {
    this.setData({ savingEdit: true });
    try {
      await api.updateComponent(this.data.comp.id || this.data.comp._id, this.data.editForm);
      this.setData({ savingEdit: false, showEditModal: false });
      wx.showToast({ title: '修改已保存', icon: 'success' });
      this.loadComponentDetail(this.data.comp.id || this.data.comp._id);
    } catch (err) {
      this.setData({ savingEdit: false });
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  goToPrint() {
    wx.navigateTo({
      url: `/pages/print/print?id=${this.data.comp.id || this.data.comp._id}`
    });
  },

  deleteComponent() {
    wx.showModal({
      title: '确认删除物料',
      content: `确定要删除【${this.data.comp.mpn || this.data.comp.name}】吗？仓位插槽将被释放。`,
      confirmColor: '#f5222d',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteComponent(this.data.comp.id || this.data.comp._id);
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => {
              wx.navigateBack();
            }, 800);
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
