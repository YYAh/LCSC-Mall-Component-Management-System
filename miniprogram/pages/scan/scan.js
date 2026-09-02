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
    sampleBooks: [],
    selectedBookIndex: 0,
    pageOptions: [],
    selectedPageIndex: 0,
    rowOptions: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    selectedRowIndex: 0,
    locationPreviewText: '未分配',
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
      spec: '',
      image_url: '',
      datasheet_url: '',
      order_no: ''
    }
  },

  async onLoad(options) {
    this.initOptions();
    await this.loadSampleBooks();

    if (options.raw) {
      this.handleParsedRawText(decodeURIComponent(options.raw));
    } else if (options.keyword) {
      this.setData({ inputKeyword: options.keyword });
      this.searchByKeyword();
    }
  },

  onShow() {
    const pendingRaw = getApp().globalData.pendingScanRaw || wx.getStorageSync('PENDING_SCAN_RAW');
    if (pendingRaw) {
      getApp().globalData.pendingScanRaw = null;
      wx.removeStorageSync('PENDING_SCAN_RAW');
      this.handleParsedRawText(pendingRaw);
    }
  },

  initOptions() {
    const pages = [];
    for (let i = 1; i <= 30; i++) {
      pages.push(`${i}`);
    }
    this.setData({ pageOptions: pages });
  },

  async loadSampleBooks() {
    try {
      const res = await api.getBooks();
      if (res && res.success && res.data.length > 0) {
        this.setData({
          sampleBooks: res.data,
          selectedBookIndex: 0,
          'formData.book_id': res.data[0].id || res.data[0]._id
        });
        this.updateLocationPreview();
      }
    } catch (err) {
      console.error('Failed to load sample books:', err);
    }
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

      // 1. Check if this component already exists in DB
      const existingComp = await api.findExistingComponent(comp.c_code, comp.mpn);

      if (existingComp) {
        try { wx.vibrateShort(); } catch (e) {}

        wx.showModal({
          title: '⚠️ 该元器件已存在',
          content: `检测到【${existingComp.name || existingComp.mpn}】已在库中！\n• 立创编号: ${existingComp.c_code || '-'}\n• 当前库存: ${existingComp.stock} ${existingComp.unit || '个'}\n• 存放仓位: [${existingComp.location_text || '未分配'}]\n\n是否直接追加本次入库数量 +${inboundQty} 个？`,
          confirmText: `追加 +${inboundQty}`,
          cancelText: '重新编辑',
          confirmColor: '#1890ff',
          success: async (mRes) => {
            if (mRes.confirm) {
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
              wx.showToast({ title: `已成功追加 +${inboundQty} 个！`, icon: 'success' });
            } else {
              this.populateFormData(comp);
            }
          }
        });
        return;
      }

      // 2. New Component: Automatically match book, find empty slot and save
      let targetBook = this.data.sampleBooks.find(b => b.category && comp.category && (comp.category.includes(b.category) || b.category.includes(comp.category))) || this.data.sampleBooks[0];
      let targetBookId = targetBook ? (targetBook.id || targetBook._id) : (this.data.sampleBooks[0] && (this.data.sampleBooks[0].id || this.data.sampleBooks[0]._id));

      const slotRes = await api.getBookNextEmpty(targetBookId);
      let pageNo = 1;
      let rowNo = 1;
      let locText = `${targetBook ? targetBook.code : 'B01'}-P01-R01`;

      if (slotRes && slotRes.success && slotRes.data && !slotRes.data.is_full) {
        pageNo = slotRes.data.page_no;
        rowNo = slotRes.data.row_no;
        locText = slotRes.data.location_text;
      }

      const newCompData = {
        c_code: comp.c_code || '',
        mpn: comp.mpn || '',
        name: comp.name || comp.mpn || '电子元器件',
        category: comp.category || '贴片电阻',
        brand: comp.brand || '国产优质/通用',
        package_name: comp.package_name || '',
        stock: inboundQty,
        safe_stock: 5,
        unit: '个',
        book_id: targetBookId,
        page_no: pageNo,
        row_no: rowNo,
        location_text: locText,
        spec: comp.spec || comp.name || '',
        image_url: comp.image_url || '',
        datasheet_url: comp.datasheet_url || '',
        order_no: comp.order_no || ''
      };

      const saveRes = await api.createComponent(newCompData);

      if (saveRes && saveRes.success) {
        try { wx.vibrateShort(); } catch (e) {}
        this.setData({
          autoSavedItem: saveRes.data,
          isAppendedStock: false
        });
        wx.showToast({ title: `🎉 入库成功！[${locText}]`, icon: 'success' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '解析失败', icon: 'none' });
    }
  },

  populateFormData(comp) {
    this.setData({
      autoSavedItem: null,
      showCandidatesModal: false,
      'formData.c_code': comp.c_code || '',
      'formData.mpn': comp.mpn || '',
      'formData.name': comp.name || comp.mpn || '',
      'formData.category': comp.category || '贴片电阻',
      'formData.brand': comp.brand || '国产优质/通用',
      'formData.package_name': comp.package_name || '',
      'formData.stock': comp.inbound_qty || 10,
      'formData.spec': comp.spec || comp.name || '',
      'formData.order_no': comp.order_no || '',
      'formData.image_url': comp.image_url || '',
      'formData.datasheet_url': comp.datasheet_url || '',
      inputKeyword: comp.c_code || comp.mpn || ''
    });
    this.findNextEmptySlot();
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
    wx.showLoading({ title: '联网检索立创商城库...' });
    try {
      const candidates = await api.searchJlcCandidates(kw);
      wx.hideLoading();
      this.setData({ loading: false });

      if (candidates && candidates.length === 1) {
        this.populateFormData(candidates[0]);
        wx.showToast({ title: '已匹配立创官方物料', icon: 'success' });
      } else if (candidates && candidates.length > 1) {
        this.setData({
          candidateList: candidates,
          showCandidatesModal: true
        });
      } else {
        // Single fallback
        const single = await api.searchJlc(kw);
        if (single && single.data) {
          this.populateFormData(single.data);
        }
        wx.showToast({ title: '未找到对应商品，已填入', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ loading: false });
      wx.showToast({ title: '查询失败: ' + err.message, icon: 'none' });
    }
  },

  selectCandidate(e) {
    const item = e.currentTarget.dataset.item;
    this.populateFormData(item);
    wx.showToast({ title: '已选取: ' + (item.mpn || item.c_code), icon: 'success' });
  },

  closeCandidateModal() {
    this.setData({ showCandidatesModal: false });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`formData.${field}`]: e.detail.value
    });
  },

  onBookChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const book = this.data.sampleBooks[idx];
    this.setData({
      selectedBookIndex: idx,
      'formData.book_id': book ? (book.id || book._id) : ''
    });
    this.updateLocationPreview();
  },

  onPageChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const p = parseInt(this.data.pageOptions[idx], 10);
    this.setData({
      selectedPageIndex: idx,
      'formData.page_no': p
    });
    this.updateLocationPreview();
  },

  onRowChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const r = parseInt(this.data.rowOptions[idx], 10);
    this.setData({
      selectedRowIndex: idx,
      'formData.row_no': r
    });
    this.updateLocationPreview();
  },

  async findNextEmptySlot() {
    let bookId = this.data.formData.book_id;
    const cat = this.data.formData.category;
    const books = this.data.sampleBooks;

    if (books && books.length > 0) {
      const targetBook = api.matchBookForCategory(cat, books) || books[0];
      const targetIdx = books.findIndex(b => (b.id && (b.id === targetBook.id || b._id === targetBook.id)) || b.code === targetBook.code);
      if (targetIdx !== -1) {
        bookId = targetBook.id || targetBook._id;
        this.setData({
          selectedBookIndex: targetIdx,
          'formData.book_id': bookId
        });
      }
    }

    if (!bookId) return;

    try {
      const res = await api.getBookNextEmpty(bookId);
      if (res && res.success && res.data && !res.data.is_full) {
        const slot = res.data;
        const pageIdx = Math.max(0, slot.page_no - 1);
        const rowIdx = Math.max(0, slot.row_no - 1);

        this.setData({
          'formData.page_no': slot.page_no,
          'formData.row_no': slot.row_no,
          selectedPageIndex: pageIdx,
          selectedRowIndex: rowIdx
        });
        this.updateLocationPreview();
      }
    } catch (e) {}
  },

  updateLocationPreview() {
    const book = this.data.sampleBooks[this.data.selectedBookIndex];
    const code = book ? (book.code || book.name) : 'B01';
    const p = String(this.data.formData.page_no || 1).padStart(2, '0');
    const r = String(this.data.formData.row_no || 1).padStart(2, '0');
    const text = `${code}-P${p}-R${r}`;
    this.setData({ locationPreviewText: text });
  },

  async manualSaveComponent() {
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      const payload = {
        ...this.data.formData,
        location_text: this.data.locationPreviewText
      };
      const res = await api.createComponent(payload);
      wx.hideLoading();
      this.setData({ saving: false, autoSavedItem: res.data, isAppendedStock: false });
      wx.showToast({ title: '入库成功！', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  goToPrintSaved() {
    if (this.data.autoSavedItem) {
      wx.navigateTo({
        url: `/pages/print/print?id=${this.data.autoSavedItem.id || this.data.autoSavedItem._id}`
      });
    }
  },

  goToDetailSaved() {
    if (this.data.autoSavedItem) {
      wx.navigateTo({
        url: `/pages/detail/detail?id=${this.data.autoSavedItem.id || this.data.autoSavedItem._id}`
      });
    }
  }
});
