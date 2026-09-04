// pages/scan/scan.js
const api = require('../../utils/api');

Page({
  data: {
    inputKeyword: '',
    loading: false,
    saving: false,
    autoSavedItem: null,
    isAppendedStock: false,
    showCandidatesModal: false,
    candidateList: [],

    // Pre-Scan Inbound Target Location Data (扫码前预选仓位)
    containers: [],
    selectedContainerIndex: 0,
    currentContainer: null,
    allocMode: 'auto', // 'auto' (自动顺延空位) | 'manual' (手动选定)
    targetPage: 1,
    targetRow: 1,
    targetCol: 1,
    targetLocationText: '',
    targetOccupiedComp: null,

    // Modal picker
    showPickerModal: false,
    pickerSlots: [],
    bookPageOptions: [],
    bookRowOptions: [],

    formData: {
      c_code: '',
      mpn: '',
      name: '',
      category: '贴片电阻',
      brand: '',
      package_name: '',
      stock: 10,
      safe_stock: 5,
      unit: '个',
      book_id: '',
      page_no: 1,
      row_no: 1,
      col_no: 1,
      location_text: '',
      spec: '',
      image_url: '',
      datasheet_url: '',
      order_no: ''
    }
  },

  async onLoad(options) {
    await this.loadContainers();

    if (options.raw) {
      this.handleParsedRawText(decodeURIComponent(options.raw));
    } else if (options.keyword) {
      this.setData({ inputKeyword: options.keyword });
      this.searchByKeyword();
    }
  },

  onShow() {
    // Check if user came from books page with a preselected location
    const app = getApp();
    if (app && app.globalData && app.globalData.preselectedContainer) {
      const p = app.globalData.preselectedContainer;
      app.globalData.preselectedContainer = null;
      this.applyExternalPreselection(p);
      return;
    }

    const pendingRaw = (app && app.globalData && app.globalData.pendingScanRaw) || wx.getStorageSync('PENDING_SCAN_RAW');
    if (pendingRaw) {
      if (app && app.globalData) app.globalData.pendingScanRaw = null;
      wx.removeStorageSync('PENDING_SCAN_RAW');
      this.handleParsedRawText(pendingRaw);
    }
  },

  async loadContainers() {
    try {
      const res = await api.getBooks();
      if (res && res.success && res.data.length > 0) {
        const formatted = res.data.map(b => ({
          ...b,
          displayName: (b.type === 'box' ? '📦 ' : '📖 ') + b.name
        }));

        let selIdx = this.data.selectedContainerIndex;
        if (selIdx >= formatted.length) selIdx = 0;

        const currentContainer = formatted[selIdx];
        this.setData({
          containers: formatted,
          selectedContainerIndex: selIdx,
          currentContainer
        });

        await this.updateTargetEmptySlot(currentContainer);
      }
    } catch (err) {
      console.error('Failed to load containers:', err);
    }
  },

  async applyExternalPreselection(p) {
    await this.loadContainers();
    const idx = this.data.containers.findIndex(c => String(c.id) === String(p.book_id) || String(c._id) === String(p.book_id) || String(c.code) === String(p.book_code));
    const container = idx !== -1 ? this.data.containers[idx] : this.data.containers[0];

    this.setData({
      selectedContainerIndex: idx !== -1 ? idx : 0,
      currentContainer: container,
      allocMode: 'manual',
      targetPage: Number(p.page_no) || 1,
      targetRow: Number(p.row_no) || 1,
      targetCol: Number(p.col_no) || 1,
      targetLocationText: p.location_text,
      targetOccupiedComp: null
    });

    wx.showToast({
      title: `已预选仓位: ${p.location_text}`,
      icon: 'none'
    });
  },

  async onContainerChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const container = this.data.containers[idx];
    this.setData({
      selectedContainerIndex: idx,
      currentContainer: container
    });

    if (this.data.allocMode === 'auto') {
      await this.updateTargetEmptySlot(container);
    } else {
      this.computeManualLocationText(container, this.data.targetPage, this.data.targetRow, this.data.targetCol);
    }
  },

  setAllocMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ allocMode: mode });
    if (mode === 'auto') {
      this.updateTargetEmptySlot(this.data.currentContainer);
    } else {
      this.openSlotPicker();
    }
  },

  async updateTargetEmptySlot(container) {
    if (!container) return;
    try {
      const slotRes = await api.getBookNextEmpty(container.id || container._id);
      if (slotRes && slotRes.success && slotRes.data && !slotRes.data.is_full) {
        const d = slotRes.data;
        this.setData({
          targetPage: Number(d.page_no) || 1,
          targetRow: Number(d.row_no) || 1,
          targetCol: Number(d.col_no) || 1,
          targetLocationText: d.location_text,
          targetOccupiedComp: null
        });
      } else {
        this.setData({
          targetPage: 1,
          targetRow: 1,
          targetCol: 1,
          targetLocationText: '⚠️ 已存满 (请新建/换容器)',
          targetOccupiedComp: null
        });
      }
    } catch (e) {
      console.warn('Find next empty error:', e);
    }
  },

  computeManualLocationText(container, page, row, col) {
    if (!container) return;
    const isBox = container.type === 'box';
    const loc = isBox
      ? `${container.code || 'BOX'}-R${String(row).padStart(2, '0')}-C${String(col).padStart(2, '0')}`
      : `${container.code || 'B01'}-P${String(page).padStart(2, '0')}-R${String(row).padStart(2, '0')}`;
    this.setData({ targetLocationText: loc });
  },

  async advanceToNextEmptySlot() {
    if (this.data.allocMode !== 'auto') return;
    const container = this.data.currentContainer;
    if (!container) return;

    try {
      const slotRes = await api.getBookNextEmpty(container.id || container._id);
      if (slotRes && slotRes.success && slotRes.data && !slotRes.data.is_full) {
        const d = slotRes.data;
        this.setData({
          targetPage: Number(d.page_no) || 1,
          targetRow: Number(d.row_no) || 1,
          targetCol: Number(d.col_no) || 1,
          targetLocationText: d.location_text,
          targetOccupiedComp: null
        });
      } else {
        this.setData({
          targetLocationText: '⚠️ 已存满 (请新建/换容器)'
        });
      }
    } catch (e) {}
  },

  async openSlotPicker() {
    const container = this.data.currentContainer;
    if (!container) return;

    if (container.type === 'box') {
      wx.showLoading({ title: '加载抽屉矩阵...' });
      try {
        const res = await api.getBookPage(container.id || container._id, 1);
        wx.hideLoading();
        if (res && res.success && res.data) {
          this.setData({
            pickerSlots: res.data.slots || [],
            showPickerModal: true
          });
        }
      } catch (e) {
        wx.hideLoading();
      }
    } else {
      // Book
      const pages = [];
      const totalP = container.total_pages || 20;
      for (let i = 1; i <= totalP; i++) pages.push(`第 P${i < 10 ? '0' + i : i} 页`);

      const rows = [];
      const totalR = container.rows_per_page || 12;
      for (let r = 1; r <= totalR; r++) rows.push(`第 ${r} 行`);

      this.setData({
        bookPageOptions: pages,
        bookRowOptions: rows,
        showPickerModal: true
      });
    }
  },

  closeSlotPicker() {
    this.setData({ showPickerModal: false });
  },

  selectGridCell(e) {
    const row = parseInt(e.currentTarget.dataset.row, 10);
    const col = parseInt(e.currentTarget.dataset.col, 10);
    const occupied = e.currentTarget.dataset.occupied || null;
    const container = this.data.currentContainer;

    const locText = `${container.code || 'BOX'}-R${String(row).padStart(2, '0')}-C${String(col).padStart(2, '0')}`;
    this.setData({
      targetRow: row,
      targetCol: col,
      targetLocationText: locText,
      targetOccupiedComp: occupied,
      allocMode: 'manual',
      showPickerModal: false
    });

    wx.showToast({
      title: `已锁定仓位: ${locText}`,
      icon: 'none'
    });
  },

  onTargetPageChange(e) {
    const p = parseInt(e.detail.value, 10) + 1;
    this.setData({ targetPage: p });
    this.computeManualLocationText(this.data.currentContainer, p, this.data.targetRow, this.data.targetCol);
  },

  onTargetRowChange(e) {
    const r = parseInt(e.detail.value, 10) + 1;
    this.setData({ targetRow: r });
    this.computeManualLocationText(this.data.currentContainer, this.data.targetPage, r, this.data.targetCol);
  },

  startScan() {
    wx.scanCode({
      scanType: ['qrCode', 'barCode'],
      success: (res) => {
        this.handleParsedRawText(res.result);
      },
      fail: (err) => {
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '扫码未完成', icon: 'none' });
        }
      }
    });
  },

  scanNext() {
    this.setData({ autoSavedItem: null, isAppendedStock: false });
    this.startScan();
  },

  async handleParsedRawText(rawText) {
    if (!rawText) return;
    wx.showLoading({ title: '智能解析中...' });

    try {
      const res = await api.parseJlcQr(rawText);
      wx.hideLoading();

      if (!res || !res.success || !res.data.component) {
        wx.showToast({ title: '无法解析二维码', icon: 'none' });
        return;
      }

      const comp = res.data.component;
      const inboundQty = Number(comp.inbound_qty) || 10;
      const targetLoc = this.data.targetLocationText || '待分配';
      const container = this.data.currentContainer;

      // 1. Check if this component already exists in DB
      const existingComp = await api.findExistingComponent(comp.c_code, comp.mpn);

      if (existingComp) {
        try { wx.vibrateShort(); } catch (e) {}

        wx.showModal({
          title: '⚠️ 该元器件已存在',
          content: `检测到【${existingComp.name || existingComp.mpn}】已在库中！\n• 原仓位: [${existingComp.location_text || '未分配'}] (现有库存: ${existingComp.stock})\n• 扫码前预选新仓位: [${targetLoc}]\n\n请选择如何入库：`,
          confirmText: `追加原仓位 (+${inboundQty})`,
          cancelText: `存入预选仓位`,
          confirmColor: '#1890ff',
          success: async (mRes) => {
            if (mRes.confirm) {
              // Append to old location
              wx.showLoading({ title: '追加入库中...' });
              await api.stockIn({
                component_id: existingComp.id || existingComp._id,
                qty: inboundQty,
                order_no: comp.order_no || '',
                remark: '扫码追加入库'
              });
              const updated = await api.getComponentDetail(existingComp.id || existingComp._id);
              wx.hideLoading();
              this.setData({
                autoSavedItem: updated.data,
                isAppendedStock: true
              });
              wx.showToast({ title: `已追加 +${inboundQty} 个！`, icon: 'success' });
            } else {
              // Save into the preselected location!
              this.saveNewInboundComponent(comp, inboundQty, container, targetLoc);
            }
          }
        });
        return;
      }

      // 2. New Component: Save directly into the PRESELECTED LOCATION!
      await this.saveNewInboundComponent(comp, inboundQty, container, targetLoc);

    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '解析失败', icon: 'none' });
    }
  },

  async saveNewInboundComponent(comp, inboundQty, container, targetLoc) {
    if (!container) {
      wx.showToast({ title: '请先选择容器', icon: 'none' });
      return;
    }

    // Capacity check: if current container is full, intercept and prompt user!
    const slotRes = await api.getBookNextEmpty(container.id || container._id);
    if (slotRes && slotRes.data && slotRes.data.is_full) {
      this.promptFullContainerCreate(comp, inboundQty, container, false);
      return;
    }

    let finalLoc = targetLoc;
    let pageNo = this.data.targetPage || 1;
    let rowNo = this.data.targetRow || 1;
    let colNo = this.data.targetCol || 1;

    if (this.data.allocMode === 'auto' && slotRes && slotRes.success && slotRes.data) {
      finalLoc = slotRes.data.location_text || targetLoc;
      pageNo = slotRes.data.page_no || pageNo;
      rowNo = slotRes.data.row_no || rowNo;
      colNo = slotRes.data.col_no || colNo;
    }

    wx.showLoading({ title: `存入预选仓位 [${finalLoc}]...` });

    const newCompData = {
      c_code: comp.c_code || '',
      mpn: comp.mpn || '',
      name: comp.name || comp.mpn || '电子元器件',
      category: comp.category || (container && container.category) || '贴片器件',
      brand: comp.brand || '国产优质/通用',
      package_name: comp.package_name || '',
      stock: inboundQty,
      safe_stock: 5,
      unit: '个',
      book_id: container ? (container.id || container._id) : '',
      page_no: pageNo,
      row_no: rowNo,
      col_no: colNo,
      location_text: finalLoc,
      spec: comp.spec || comp.name || '',
      image_url: comp.image_url || '',
      datasheet_url: comp.datasheet_url || '',
      order_no: comp.order_no || ''
    };

    const saveRes = await api.createComponent(newCompData);
    wx.hideLoading();

    if (saveRes && saveRes.success) {
      try { wx.vibrateShort(); } catch (e) {}
      this.setData({
        autoSavedItem: saveRes.data,
        isAppendedStock: false
      });

      wx.showToast({ title: `🎉 入库成功！[${finalLoc}]`, icon: 'success' });

      // Auto advance to next empty slot!
      if (this.data.allocMode === 'auto') {
        this.advanceToNextEmptySlot();
      }
      this.loadContainers();
    }
  },

  populateFormData(comp) {
    this.setData({
      autoSavedItem: null,
      showCandidatesModal: false,
      'formData.c_code': comp.c_code || '',
      'formData.mpn': comp.mpn || '',
      'formData.name': comp.name || comp.mpn || '',
      'formData.category': comp.category || '贴片器件',
      'formData.brand': comp.brand || '国产优质/通用',
      'formData.package_name': comp.package_name || '',
      'formData.stock': comp.inbound_qty || 10,
      'formData.spec': comp.spec || comp.name || '',
      'formData.order_no': comp.order_no || '',
      'formData.image_url': comp.image_url || '',
      'formData.datasheet_url': comp.datasheet_url || '',
      inputKeyword: comp.c_code || comp.mpn || ''
    });
  },

  onKeywordInput(e) {
    this.setData({ inputKeyword: e.detail.value });
  },

  async searchByKeyword() {
    const kw = this.data.inputKeyword.trim();
    if (!kw) {
      wx.showToast({ title: '请输入 C编号或型号', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    wx.showLoading({ title: '检索立创官方库...' });
    try {
      const candidates = await api.searchJlcCandidates(kw);
      wx.hideLoading();
      this.setData({ loading: false });

      if (candidates && candidates.length === 1) {
        this.populateFormData(candidates[0]);
        wx.showToast({ title: '已匹配立创物料', icon: 'success' });
      } else if (candidates && candidates.length > 1) {
        this.setData({
          candidateList: candidates,
          showCandidatesModal: true
        });
      } else {
        wx.showToast({ title: '未找到匹配物料', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ loading: false });
      wx.showToast({ title: err.message || '查询失败', icon: 'none' });
    }
  },

  selectCandidate(e) {
    const item = e.currentTarget.dataset.item;
    this.populateFormData(item);
  },

  closeCandidatesModal() {
    this.setData({ showCandidatesModal: false });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  async saveComponentForm() {
    const f = this.data.formData;
    if (!f.mpn && !f.name) {
      wx.showToast({ title: '厂家型号或品名必填', icon: 'none' });
      return;
    }

    const container = this.data.currentContainer;
    if (!container) {
      wx.showToast({ title: '请先选择容器', icon: 'none' });
      return;
    }

    // Capacity Check
    const slotRes = await api.getBookNextEmpty(container.id || container._id);
    if (slotRes && slotRes.data && slotRes.data.is_full) {
      this.promptFullContainerCreate(f, f.stock || 10, container, true);
      return;
    }

    let finalLoc = this.data.targetLocationText || '待分配';
    let pageNo = this.data.targetPage || 1;
    let rowNo = this.data.targetRow || 1;
    let colNo = this.data.targetCol || 1;

    if (this.data.allocMode === 'auto' && slotRes && slotRes.success && slotRes.data) {
      finalLoc = slotRes.data.location_text || finalLoc;
      pageNo = slotRes.data.page_no || pageNo;
      rowNo = slotRes.data.row_no || rowNo;
      colNo = slotRes.data.col_no || colNo;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存入库中...' });

    try {
      const saveRes = await api.createComponent({
        ...f,
        book_id: container ? (container.id || container._id) : '',
        page_no: pageNo,
        row_no: rowNo,
        col_no: colNo,
        location_text: finalLoc
      });

      wx.hideLoading();
      this.setData({ saving: false });

      if (saveRes && saveRes.success) {
        this.setData({
          autoSavedItem: saveRes.data,
          formData: { c_code: '', mpn: '', name: '', stock: 10 }
        });
        wx.showToast({ title: `入库成功 [${finalLoc}]`, icon: 'success' });

        if (this.data.allocMode === 'auto') {
          this.advanceToNextEmptySlot();
        }
        this.loadContainers();
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  promptFullContainerCreate(itemData, inboundQty, container, isManualForm) {
    const typeText = container.type === 'box' ? '元件盒' : '样本册';
    wx.showModal({
      title: '⚠️ 当前容器已存满！',
      content: `您当前选中的【${container.name}】(${typeText}) 所有储位已全部用完！\n\n是否立即新建下一个${typeText}继续入库？`,
      confirmText: '立即新建',
      cancelText: '换其他容器',
      confirmColor: '#1890ff',
      success: async (mRes) => {
        if (mRes.confirm) {
          await this.createNextContainerAndInbound(itemData, inboundQty, container, isManualForm);
        } else {
          wx.showToast({ title: '请在上方切换有余量的容器', icon: 'none' });
        }
      }
    });
  },

  async createNextContainerAndInbound(itemData, inboundQty, oldContainer, isManualForm) {
    wx.showLoading({ title: '正在新建容器...' });
    try {
      const nextNum = this.data.containers.length + 1;
      const isBox = oldContainer.type === 'box';
      const newContainerData = {
        name: isBox ? `${nextNum}号 ${oldContainer.grid_rows || 4}×${oldContainer.grid_cols || 6} 元件盒` : `${nextNum}号 元件样品册`,
        code: isBox ? `BOX0${nextNum}` : `B0${nextNum}`,
        type: oldContainer.type || 'box',
        category: oldContainer.category || '常用元器件',
        grid_rows: Number(oldContainer.grid_rows) || 4,
        grid_cols: Number(oldContainer.grid_cols) || 6,
        total_pages: Number(oldContainer.total_pages) || 20,
        rows_per_page: Number(oldContainer.rows_per_page) || 12
      };

      const createRes = await api.createBook(newContainerData);
      if (!createRes || !createRes.success) {
        throw new Error((createRes && createRes.msg) || '新建容器失败');
      }

      await this.loadContainers();

      const newIdx = this.data.containers.findIndex(c => String(c.id) === String(createRes.data.id) || String(c.code) === String(createRes.data.code));
      const targetContainer = newIdx !== -1 ? this.data.containers[newIdx] : this.data.containers[this.data.containers.length - 1];

      this.setData({
        selectedContainerIndex: newIdx !== -1 ? newIdx : (this.data.containers.length - 1),
        currentContainer: targetContainer,
        allocMode: 'auto'
      });

      await this.updateTargetEmptySlot(targetContainer);
      const newLoc = this.data.targetLocationText;

      wx.hideLoading();
      wx.showToast({ title: `已新建【${targetContainer.name}】`, icon: 'success' });

      if (isManualForm) {
        await this.saveComponentForm();
      } else {
        await this.saveNewInboundComponent(itemData, inboundQty, targetContainer, newLoc);
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '新建容器失败', icon: 'none' });
    }
  },

  async quickCreateContainer() {
    const cur = this.data.currentContainer || {};
    const isBox = cur.type === 'box';
    const nextNum = this.data.containers.length + 1;

    wx.showModal({
      title: '新建元件容器',
      content: `即将创建：\n【${nextNum}号 ${isBox ? (cur.grid_rows || 4) + '×' + (cur.grid_cols || 6) + ' 元件盒' : '元件样品册'}】\n编号: ${isBox ? 'BOX0' + nextNum : 'B0' + nextNum}\n\n是否立即创建？`,
      confirmText: '确定创建',
      cancelText: '取消',
      confirmColor: '#1890ff',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '创建中...' });
          try {
            const createRes = await api.createBook({
              name: isBox ? `${nextNum}号 ${cur.grid_rows || 4}×${cur.grid_cols || 6} 元件盒` : `${nextNum}号 元件样品册`,
              code: isBox ? `BOX0${nextNum}` : `B0${nextNum}`,
              type: cur.type || 'box',
              category: cur.category || '常用元器件',
              grid_rows: Number(cur.grid_rows) || 4,
              grid_cols: Number(cur.grid_cols) || 6,
              total_pages: Number(cur.total_pages) || 20,
              rows_per_page: Number(cur.rows_per_page) || 12
            });

            await this.loadContainers();
            const newIdx = this.data.containers.findIndex(c => String(c.id) === String(createRes.data.id) || String(c.code) === String(createRes.data.code));
            const targetContainer = newIdx !== -1 ? this.data.containers[newIdx] : this.data.containers[this.data.containers.length - 1];

            this.setData({
              selectedContainerIndex: newIdx !== -1 ? newIdx : (this.data.containers.length - 1),
              currentContainer: targetContainer,
              allocMode: 'auto'
            });

            await this.updateTargetEmptySlot(targetContainer);
            wx.hideLoading();
            wx.showToast({ title: '容器创建成功', icon: 'success' });
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '创建失败: ' + e.message, icon: 'none' });
          }
        }
      }
    });
  },

  resetForm() {
    this.setData({
      formData: { c_code: '', mpn: '', name: '' }
    });
  },

  goToPrintSaved() {
    const item = this.data.autoSavedItem;
    if (!item) return;
    wx.navigateTo({
      url: `/pages/print/print?id=${item.id || item._id}`
    });
  },

  goToDetailSaved() {
    const item = this.data.autoSavedItem;
    if (!item) return;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${item.id || item._id}`
    });
  }
});
