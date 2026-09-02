// pages/components/components.js
const api = require('../../utils/api');
const excelParser = require('../../utils/excelParser');

Page({
  data: {
    keyword: '',
    currentCategory: '',
    onlyLowStock: false,
    categories: [],
    list: [],
    totalCount: 0,
    grandTotalCount: 0,
    loading: false,
    isManageMode: false,
    selectedIdMap: [],
    showQuickEditModal: false,
    showPasteImportModal: false,
    pastedText: '',
    importing: false,
    currentEditId: null,
    quickEditForm: {
      mpn: '',
      stock: 0,
      c_code: '',
      brand: '',
      spec: '',
      package_name: '',
      category: ''
    }
  },

  onLoad(options) {
    if (options.low_stock === '1') {
      this.setData({ onlyLowStock: true });
    }
    if (options.keyword) {
      this.setData({ keyword: options.keyword });
    }
  },

  onShow() {
    const app = getApp();
    if (app && app.globalData && app.globalData.filterLowStock) {
      this.setData({ onlyLowStock: true });
      app.globalData.filterLowStock = false;
    }
    this.loadCategories();
    this.loadComponents();
  },

  onPullDownRefresh() {
    Promise.all([this.loadCategories(), this.loadComponents()]).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadCategories() {
    try {
      const res = await api.getCategories();
      if (res && res.success) {
        const grandTotal = (res.data || []).reduce((sum, item) => sum + (Number(item.count) || 0), 0);
        this.setData({
          categories: res.data,
          grandTotalCount: grandTotal
        });
      }
    } catch (e) {
      console.error(e);
    }
  },

  async loadComponents() {
    this.setData({ loading: true });
    try {
      const params = {
        keyword: this.data.keyword,
        category: this.data.currentCategory,
        low_stock: this.data.onlyLowStock ? '1' : ''
      };
      const res = await api.getComponents(params);
      this.setData({ loading: false });
      if (res && res.success) {
        const selectedSet = new Set(this.data.selectedIdMap);
        const listWithSelection = (res.data.list || []).map(item => ({
          ...item,
          selected: selectedSet.has(String(item.id || item._id))
        }));

        this.setData({
          list: listWithSelection,
          totalCount: res.data.total
        });
      }
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败: ' + err.message, icon: 'none' });
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.loadComponents();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.loadComponents();
  },

  selectCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === '') {
      // Clicking "全部" resets all category and low stock filters to show full inventory!
      this.setData({ currentCategory: '', onlyLowStock: false, keyword: '' }, () => {
        this.loadComponents();
      });
    } else {
      this.setData({ currentCategory: cat }, () => {
        this.loadComponents();
      });
    }
  },

  toggleLowStock() {
    const next = !this.data.onlyLowStock;
    this.setData({ onlyLowStock: next }, () => {
      this.loadComponents();
      if (next) {
        wx.showToast({ title: '已开启【仅看偏低】', icon: 'none' });
      } else {
        wx.showToast({ title: '已展示全部库存', icon: 'none' });
      }
    });
  },

  resetFilters() {
    this.setData({
      keyword: '',
      currentCategory: '',
      onlyLowStock: false
    }, () => {
      this.loadComponents();
      this.loadCategories();
      wx.showToast({ title: '已展示全部元器件', icon: 'none' });
    });
  },

  toggleManageMode() {
    const nextMode = !this.data.isManageMode;
    const updatedList = this.data.list.map(item => ({ ...item, selected: false }));
    this.setData({
      isManageMode: nextMode,
      selectedIdMap: [],
      list: updatedList
    });
  },

  onCardTap(e) {
    const item = e.currentTarget.dataset.item;
    const itemId = String(item.id || item._id);

    if (this.data.isManageMode) {
      // Toggle select in manage mode
      let selectedIds = [...this.data.selectedIdMap];
      if (selectedIds.includes(itemId)) {
        selectedIds = selectedIds.filter(id => id !== itemId);
      } else {
        selectedIds.push(itemId);
      }

      const selectedSet = new Set(selectedIds);
      const updatedList = this.data.list.map(it => ({
        ...it,
        selected: selectedSet.has(String(it.id || it._id))
      }));

      this.setData({
        selectedIdMap: selectedIds,
        list: updatedList
      });
    } else {
      // Normal click -> go to detail
      wx.navigateTo({
        url: `/pages/detail/detail?id=${itemId}`
      });
    }
  },

  toggleSelectAll() {
    const currentSelectedCount = this.data.selectedIdMap.length;
    const allCount = this.data.list.length;

    if (currentSelectedCount === allCount) {
      // Unselect all
      const updatedList = this.data.list.map(it => ({ ...it, selected: false }));
      this.setData({
        selectedIdMap: [],
        list: updatedList
      });
    } else {
      // Select all
      const allIds = this.data.list.map(it => String(it.id || it._id));
      const updatedList = this.data.list.map(it => ({ ...it, selected: true }));
      this.setData({
        selectedIdMap: allIds,
        list: updatedList
      });
    }
  },

  confirmBatchDelete() {
    const ids = this.data.selectedIdMap;
    if (!ids || ids.length === 0) return;

    wx.showModal({
      title: '批量删除确认',
      content: `确定要删除选中的 ${ids.length} 种元器件吗？删除后仓位插槽将被释放。`,
      confirmColor: '#f5222d',
      confirmText: '确定删除',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在批量删除...' });
          try {
            await api.deleteComponentsBatch(ids);
            wx.hideLoading();
            wx.showToast({ title: `已成功删除 ${ids.length} 种物料`, icon: 'success' });
            this.setData({ selectedIdMap: [] });
            this.loadComponents();
            this.loadCategories();
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  goToScan() {
    wx.switchTab({ url: '/pages/scan/scan' });
  },

  stopBubble() {},

  quickOut(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: `领料出库 (当前库存: ${item.stock} ${item.unit || '个'})`,
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
            const outRes = await api.stockOut({ component_id: item.id || item._id, qty, remark: '快捷领料' });
            if (outRes && outRes.success) {
              wx.showToast({ title: '领料成功', icon: 'success' });
              this.loadComponents();
            }
          } catch (err) {
            wx.showToast({ title: err.message || '出库失败', icon: 'none' });
          }
        }
      }
    });
  },

  quickIn(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: `补充入库 (当前库存: ${item.stock} ${item.unit || '个'})`,
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
            const inRes = await api.stockIn({ component_id: item.id || item._id, qty, remark: '快捷补充' });
            if (inRes && inRes.success) {
              wx.showToast({ title: '入库成功', icon: 'success' });
              this.loadComponents();
            }
          } catch (err) {
            wx.showToast({ title: err.message || '入库失败', icon: 'none' });
          }
        }
      }
    });
  },

  quickPrint(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: `/pages/print/print?id=${item.id || item._id}`
    });
  },

  quickDelete(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '确认删除物料',
      content: `确定要删除【${item.mpn || item.name}】吗？仓位将被释放。`,
      confirmColor: '#f5222d',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteComponent(item.id || item._id);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadComponents();
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  quickEdit(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showQuickEditModal: true,
      currentEditId: item.id || item._id,
      quickEditForm: {
        mpn: item.mpn || '',
        stock: item.stock || 0,
        c_code: item.c_code || '',
        brand: item.brand || '',
        spec: item.spec || item.name || '',
        package_name: item.package_name || '',
        category: item.category || ''
      }
    });
  },

  closeQuickEdit() {
    this.setData({ showQuickEditModal: false });
  },

  onQuickEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`quickEditForm.${field}`]: e.detail.value
    });
  },

  async saveQuickEdit() {
    if (!this.data.currentEditId) return;
    wx.showLoading({ title: '保存中...' });
    try {
      await api.updateComponent(this.data.currentEditId, this.data.quickEditForm);
      wx.hideLoading();
      this.setData({ showQuickEditModal: false });
      wx.showToast({ title: '修改已保存', icon: 'success' });
      this.loadComponents();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  // Export Excel
  onExportExcel() {
    const list = this.data.list;
    if (!list || list.length === 0) {
      wx.showToast({ title: '暂无物料可导出', icon: 'none' });
      return;
    }

    let csvContent = '\uFEFF大类,厂家型号(PM),立创编号(PC),品牌,参数,封装值,库存数量,入库时间,仓位,备注\n';
    list.forEach(c => {
      const cat = (c.category || '').replace(/"/g, '""');
      const mpn = (c.mpn || '').replace(/"/g, '""');
      const code = (c.c_code || '').replace(/"/g, '""');
      const brand = (c.brand || '').replace(/"/g, '""');
      const spec = (c.spec || c.name || '').replace(/"/g, '""');
      const pkg = (c.package_name || '').replace(/"/g, '""');
      const stock = c.stock || 0;
      const date = (c.created_at || '').replace(/"/g, '""');
      const loc = (c.location_text || '').replace(/"/g, '""');
      const remark = (c.order_no ? '订单:' + c.order_no : '').replace(/"/g, '""');

      csvContent += `"${cat}","${mpn}","${code}","${brand}","${spec}","${pkg}",${stock},"${date}","${loc}","${remark}"\n`;
    });

    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/嘉立创元器件库存清单.csv`;

    fs.writeFile({
      filePath,
      data: csvContent,
      encoding: 'utf8',
      success: () => {
        wx.showModal({
          title: 'Excel 表格已生成',
          content: `共导出 ${list.length} 条元器件数据！\n\n点击【打开查看】即可在手机中直接使用 Excel / WPS 查看或转发给微信好友与电脑。`,
          confirmText: '打开查看',
          cancelText: '复制文本',
          success: (mRes) => {
            if (mRes.confirm) {
              wx.openDocument({
                filePath,
                fileType: 'csv',
                showMenu: true,
                fail: (e) => {
                  wx.showToast({ title: '打开失败: ' + e.errMsg, icon: 'none' });
                }
              });
            } else {
              wx.setClipboardData({ data: csvContent });
            }
          }
        });
      },
      fail: () => {
        wx.setClipboardData({
          data: csvContent,
          success: () => {
            wx.showToast({ title: '表格内容已复制到剪贴板', icon: 'success' });
          }
        });
      }
    });
  },

  openImportSheet() {
    wx.showActionSheet({
      itemList: ['📋 粘贴 Excel 表格文本批量导入', '📁 从微信聊天选择表格文件导入', '📷 连续扫码批量录入'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.setData({ showPasteImportModal: true, pastedText: '' });
        } else if (res.tapIndex === 1) {
          this.chooseExcelFile();
        } else if (res.tapIndex === 2) {
          wx.switchTab({ url: '/pages/scan/scan' });
        }
      }
    });
  },

  chooseExcelFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls', 'csv', 'txt'],
      success: (res) => {
        const file = res.tempFiles[0];
        if (!file || !file.path) return;
        wx.showLoading({ title: '正在读取表格...' });

        const fs = wx.getFileSystemManager();
        const isXlsx = file.path.toLowerCase().endsWith('.xlsx');

        if (isXlsx) {
          // Read binary ArrayBuffer for XLSX
          fs.readFile({
            filePath: file.path,
            success: (readRes) => {
              try {
                const items = excelParser.parseExcelData(readRes.data);
                this.importParsedItems(items);
              } catch (err) {
                wx.hideLoading();
                wx.showModal({
                  title: '表格解析提示',
                  content: '无法直接读取此格式，请尝试另存为标准 .xlsx 或 .csv 后重试！(' + err.message + ')',
                  showCancel: false
                });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({ title: '读取失败: ' + err.errMsg, icon: 'none' });
            }
          });
        } else {
          // Read utf8 for CSV/TXT
          fs.readFile({
            filePath: file.path,
            encoding: 'utf8',
            success: (readRes) => {
              try {
                const items = excelParser.parseExcelData(readRes.data);
                this.importParsedItems(items);
              } catch (err) {
                wx.hideLoading();
                wx.showToast({ title: '解析失败: ' + err.message, icon: 'none' });
              }
            },
            fail: () => {
              // Try binary fallback
              fs.readFile({
                filePath: file.path,
                success: (readRes) => {
                  try {
                    const items = excelParser.parseExcelData(readRes.data);
                    this.importParsedItems(items);
                  } catch (e2) {
                    wx.hideLoading();
                    wx.showToast({ title: '文件读取失败', icon: 'none' });
                  }
                },
                fail: () => {
                  wx.hideLoading();
                  wx.showToast({ title: '文件读取失败', icon: 'none' });
                }
              });
            }
          });
        }
      }
    });
  },

  closePasteImport() {
    this.setData({ showPasteImportModal: false });
  },

  onPasteInput(e) {
    this.setData({ pastedText: e.detail.value });
  },

  async submitPasteImport() {
    const text = this.data.pastedText.trim();
    if (!text) {
      wx.showToast({ title: '请粘贴表格内容', icon: 'none' });
      return;
    }
    this.setData({ showPasteImportModal: false });
    wx.showLoading({ title: '正在解析表格...' });
    try {
      const items = excelParser.parseExcelData(text);
      await this.importParsedItems(items);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '解析失败: ' + err.message, icon: 'none' });
    }
  },

  async importParsedItems(items) {
    if (!items || items.length === 0) {
      wx.hideLoading();
      this.setData({ importing: false });
      wx.showModal({
        title: '提示',
        content: '未在表格中检测到有效物料数据，请确保表格包含型号或立创编号列！',
        showCancel: false
      });
      return;
    }

    wx.showLoading({ title: `正在录入 (0/${items.length})...` });
    this.setData({ importing: true });

    let count = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (i % 5 === 0) {
          wx.showLoading({ title: `正在录入 (${i + 1}/${items.length})...` });
        }
        await api.createComponent(item);
        count++;
      }

      wx.hideLoading();
      this.setData({ importing: false });
      wx.showModal({
        title: '🎉 Excel 导入成功！',
        content: `成功批量录入 ${count} 种元器件物料！\n\n系统已全自动根据物料大类（电阻/电容/芯片/开关等）分配对应 12 行样品册插槽！`,
        showCancel: false
      });
      this.loadComponents();
      this.loadCategories();
    } catch (err) {
      wx.hideLoading();
      this.setData({ importing: false });
      wx.showToast({ title: '导入中断: ' + err.message, icon: 'none' });
    }
  }
});
