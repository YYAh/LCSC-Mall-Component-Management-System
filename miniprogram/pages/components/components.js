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
    },
    showImportPlanModal: false,
    importPendingItems: [],
    availableContainers: [],
    containersListLength: 0,
    importStats: {
      totalTypes: 0,
      totalEmptySlots: 0,
      slotShortage: 0
    },
    importPlan: {
      mode: 'new_box',
      boxName: '',
      boxCode: '',
      category: '常用元器件',
      gridRows: 4,
      gridCols: 6,
      bookName: '',
      bookCode: '',
      totalPages: 5,
      rowsPerPage: 12
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

    wx.showLoading({ title: '核算仓位容量...' });
    try {
      const booksRes = await api.getBooks();
      const containers = (booksRes && booksRes.data) || [];
      const totalEmptySlots = containers.reduce((sum, b) => sum + (b.empty_slots || 0), 0);
      const totalTypes = items.length;
      const shortage = Math.max(0, totalTypes - totalEmptySlots);

      // Recommend grid size
      let recRows = 4;
      let recCols = 6;
      if (totalTypes <= 12) { recRows = 3; recCols = 4; }
      else if (totalTypes <= 20) { recRows = 4; recCols = 5; }
      else if (totalTypes <= 24) { recRows = 4; recCols = 6; }
      else if (totalTypes <= 36) { recRows = 6; recCols = 6; }
      else if (totalTypes <= 48) { recRows = 6; recCols = 8; }
      else if (totalTypes <= 60) { recRows = 6; recCols = 10; }
      else {
        recRows = Math.ceil(Math.sqrt(totalTypes));
        recCols = Math.ceil(totalTypes / recRows);
      }

      const recPages = Math.max(2, Math.ceil(totalTypes / 12));
      const nextNum = containers.length + 1;

      wx.hideLoading();
      this.setData({
        importPendingItems: items,
        availableContainers: containers.map(b => ({
          ...b,
          displayName: (b.type === 'box' ? '📦 ' : '📖 ') + b.name
        })),
        containersListLength: containers.length,
        importStats: {
          totalTypes,
          totalEmptySlots,
          slotShortage: shortage
        },
        importPlan: {
          mode: 'new_box',
          boxName: `${nextNum}号 ${recRows}×${recCols} 元件盒`,
          boxCode: `BOX0${nextNum}`,
          category: (items[0] && items[0].category) || '常用贴片器件',
          gridRows: recRows,
          gridCols: recCols,
          bookName: `${nextNum}号 批量导入样本册`,
          bookCode: `B0${nextNum}`,
          totalPages: recPages,
          rowsPerPage: 12
        },
        showImportPlanModal: true
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '核算失败: ' + err.message, icon: 'none' });
    }
  },

  setPlanMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      'importPlan.mode': mode
    });
  },

  onPlanInput(e) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    this.setData({
      [`importPlan.${field}`]: val
    });
  },

  closeImportPlan() {
    this.setData({
      showImportPlanModal: false,
      importPendingItems: []
    });
  },

  async executePlannedImport() {
    const { mode, boxName, boxCode, gridRows, gridCols, bookName, bookCode, totalPages, rowsPerPage, category } = this.data.importPlan;
    const items = this.data.importPendingItems;
    if (!items || items.length === 0) return;

    this.setData({ importing: true });
    wx.showLoading({ title: '正在规划入库...' });

    try {
      if (mode === 'new_box') {
        const rows = Math.max(1, Number(gridRows) || 4);
        const cols = Math.max(1, Number(gridCols) || 6);
        const capacityPerBox = rows * cols;
        const boxesNeeded = Math.ceil(items.length / capacityPerBox);
        const createdContainers = [];

        const baseNumMatch = (boxCode || '').match(/\d+/);
        const baseNum = baseNumMatch ? parseInt(baseNumMatch[0], 10) : (this.data.containersListLength + 1);

        for (let bIdx = 0; bIdx < boxesNeeded; bIdx++) {
          const currentBoxNum = baseNum + bIdx;
          const currentBoxCode = `BOX0${currentBoxNum}`;
          const currentBoxName = boxesNeeded > 1 
            ? `${boxName || (currentBoxCode + ' 元件盒')} (${bIdx + 1}/${boxesNeeded})`
            : (boxName || `${currentBoxCode} 元件盒`);

          const createRes = await api.createBook({
            name: currentBoxName,
            code: currentBoxCode,
            type: 'box',
            category: category || '贴片器件',
            grid_rows: rows,
            grid_cols: cols
          });

          if (createRes && createRes.success) {
            createdContainers.push(createRes.data);
          }
        }

        let count = 0;
        for (let i = 0; i < items.length; i++) {
          const bIdx = Math.floor(i / capacityPerBox);
          const currentContainer = createdContainers[Math.min(bIdx, createdContainers.length - 1)];
          const idxInBox = i % capacityPerBox;
          const r = Math.floor(idxInBox / cols) + 1;
          const c = (idxInBox % cols) + 1;
          const locText = `${currentContainer.code}-R${String(r).padStart(2, '0')}-C${String(c).padStart(2, '0')}`;

          const itemData = {
            ...items[i],
            book_id: currentContainer.id || currentContainer._id,
            row_no: r,
            col_no: c,
            page_no: 1,
            location_text: locText
          };

          if (i % 5 === 0) {
            wx.showLoading({ title: `正在入库 (${i + 1}/${items.length})...` });
          }
          await api.createComponent(itemData);
          count++;
        }

        wx.hideLoading();
        this.setData({ importing: false, showImportPlanModal: false, importPendingItems: [] });
        wx.showModal({
          title: '🎉 批量导入并建盒成功！',
          content: `成功新建 ${createdContainers.length} 个元件盒，并精准分配入库 ${count} 种元器件物料！\n\n所有物料已按 R×C 抽屉网格规整存放！`,
          showCancel: false
        });
        this.loadComponents();
        this.loadCategories();
        return;
      }

      if (mode === 'new_book') {
        const pages = Math.max(1, Number(totalPages) || 5);
        const rows = Math.max(1, Number(rowsPerPage) || 12);
        const capacityPerBook = pages * rows;
        const booksNeeded = Math.ceil(items.length / capacityPerBook);
        const createdContainers = [];

        const baseNumMatch = (bookCode || '').match(/\d+/);
        const baseNum = baseNumMatch ? parseInt(baseNumMatch[0], 10) : (this.data.containersListLength + 1);

        for (let bIdx = 0; bIdx < booksNeeded; bIdx++) {
          const currentBookNum = baseNum + bIdx;
          const currentBookCode = `B0${currentBookNum}`;
          const currentBookName = booksNeeded > 1
            ? `${bookName || (currentBookCode + ' 样本册')} (${bIdx + 1}/${booksNeeded})`
            : (bookName || `${currentBookCode} 样本册`);

          const createRes = await api.createBook({
            name: currentBookName,
            code: currentBookCode,
            type: 'book',
            category: category || '贴片器件',
            total_pages: pages,
            rows_per_page: rows
          });

          if (createRes && createRes.success) {
            createdContainers.push(createRes.data);
          }
        }

        let count = 0;
        for (let i = 0; i < items.length; i++) {
          const bIdx = Math.floor(i / capacityPerBook);
          const currentContainer = createdContainers[Math.min(bIdx, createdContainers.length - 1)];
          const idxInBook = i % capacityPerBook;
          const p = Math.floor(idxInBook / rows) + 1;
          const r = (idxInBook % rows) + 1;
          const locText = `${currentContainer.code}-P${String(p).padStart(2, '0')}-R${String(r).padStart(2, '0')}`;

          const itemData = {
            ...items[i],
            book_id: currentContainer.id || currentContainer._id,
            page_no: p,
            row_no: r,
            col_no: 1,
            location_text: locText
          };

          if (i % 5 === 0) {
            wx.showLoading({ title: `正在入库 (${i + 1}/${items.length})...` });
          }
          await api.createComponent(itemData);
          count++;
        }

        wx.hideLoading();
        this.setData({ importing: false, showImportPlanModal: false, importPendingItems: [] });
        wx.showModal({
          title: '🎉 批量导入并建册成功！',
          content: `成功新建 ${createdContainers.length} 个样品册，并精准分配入库 ${count} 种元器件物料！\n\n已按 P×R 活页插槽规整存放！`,
          showCancel: false
        });
        this.loadComponents();
        this.loadCategories();
        return;
      }

      if (mode === 'use_existing') {
        let count = 0;
        for (let i = 0; i < items.length; i++) {
          if (i % 5 === 0) {
            wx.showLoading({ title: `正在入库 (${i + 1}/${items.length})...` });
          }
          await api.createComponent(items[i]);
          count++;
        }

        wx.hideLoading();
        this.setData({ importing: false, showImportPlanModal: false, importPendingItems: [] });
        wx.showModal({
          title: '🎉 导入成功！',
          content: `成功入库 ${count} 种元器件物料到现有容器空位中！`,
          showCancel: false
        });
        this.loadComponents();
        this.loadCategories();
        return;
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ importing: false });
      wx.showToast({ title: '导入中断: ' + err.message, icon: 'none' });
    }
  }
});
