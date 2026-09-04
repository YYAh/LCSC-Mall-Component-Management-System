// pages/books/books.js
const api = require('../../utils/api');

Page({
  data: {
    books: [],
    currentBookIndex: 0,
    currentBook: null,
    currentPage: 1,
    pageList: [],
    slots: [],
    loading: false,

    // Modal
    showAddModal: false,
    newContainer: {
      type: 'box',
      name: '',
      code: '',
      category: '',
      grid_rows: 4,
      grid_cols: 6,
      total_pages: 20,
      rows_per_page: 12
    }
  },

  onLoad(options) {
    if (options.book_id) {
      this.targetBookId = options.book_id;
    }
    if (options.page_no) {
      this.setData({ currentPage: parseInt(options.page_no, 10) });
    }
  },

  onShow() {
    const app = getApp();
    if (app && app.globalData && app.globalData.targetBookId) {
      this.targetBookId = app.globalData.targetBookId;
      if (app.globalData.targetPageNo) {
        this.setData({ currentPage: parseInt(app.globalData.targetPageNo, 10) });
      }
      app.globalData.targetBookId = null;
      app.globalData.targetPageNo = null;
    }
    this.loadBooks();
  },

  onPullDownRefresh() {
    this.loadBooks().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadBooks() {
    this.setData({ loading: true });
    try {
      const res = await api.getBooks();
      this.setData({ loading: false });
      if (res && res.success && res.data.length > 0) {
        const formattedBooks = res.data.map(b => ({
          ...b,
          displayName: (b.type === 'box' ? '📦 ' : '📖 ') + b.name
        }));

        let idx = 0;
        if (this.targetBookId) {
          const foundIdx = formattedBooks.findIndex(b => String(b.id) === String(this.targetBookId) || String(b._id) === String(this.targetBookId) || String(b.code) === String(this.targetBookId));
          if (foundIdx !== -1) idx = foundIdx;
          this.targetBookId = null;
        } else if (this.data.currentBookIndex < formattedBooks.length) {
          idx = this.data.currentBookIndex;
        }

        const currentBook = formattedBooks[idx];
        const pages = [];
        const totalP = currentBook.total_pages || 20;
        for (let i = 1; i <= totalP; i++) {
          pages.push(`第 P${i < 10 ? '0' + i : i} 页`);
        }

        this.setData({
          books: formattedBooks,
          currentBookIndex: idx,
          currentBook,
          pageList: pages
        });

        this.loadPageSlots(currentBook.id || currentBook._id, this.data.currentPage);
      }
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败: ' + err.message, icon: 'none' });
    }
  },

  async loadPageSlots(bookId, pageNo) {
    try {
      const res = await api.getBookPage(bookId, pageNo);
      if (res && res.success && res.data) {
        this.setData({
          slots: res.data.slots
        });
      }
    } catch (e) {
      console.error('Failed to load slots:', e);
    }
  },

  onBookChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const book = this.data.books[idx];
    const pages = [];
    const totalP = book.total_pages || 20;
    for (let i = 1; i <= totalP; i++) {
      pages.push(`第 P${i < 10 ? '0' + i : i} 页`);
    }

    this.setData({
      currentBookIndex: idx,
      currentBook: book,
      currentPage: 1,
      pageList: pages
    });

    this.loadPageSlots(book.id || book._id, 1);
  },

  prevPage() {
    if (this.data.currentPage > 1) {
      const p = this.data.currentPage - 1;
      this.setData({ currentPage: p });
      this.loadPageSlots(this.data.currentBook.id || this.data.currentBook._id, p);
    }
  },

  nextPage() {
    const maxP = this.data.currentBook.total_pages || 20;
    if (this.data.currentPage < maxP) {
      const p = this.data.currentPage + 1;
      this.setData({ currentPage: p });
      this.loadPageSlots(this.data.currentBook.id || this.data.currentBook._id, p);
    }
  },

  onPageJump(e) {
    const p = parseInt(e.detail.value, 10) + 1;
    this.setData({ currentPage: p });
    this.loadPageSlots(this.data.currentBook.id || this.data.currentBook._id, p);
  },

  viewComponentDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  fillEmptySlot(e) {
    const rowNo = e.currentTarget.dataset.row;
    const colNo = e.currentTarget.dataset.col;
    const book = this.data.currentBook;
    const pageNo = this.data.currentPage;

    const isBox = book.type === 'box';
    const locText = isBox
      ? `${book.code || 'BOX'}-R${String(rowNo).padStart(2, '0')}-C${String(colNo || 1).padStart(2, '0')}`
      : `${book.code || 'B01'}-P${String(pageNo).padStart(2, '0')}-R${String(rowNo).padStart(2, '0')}`;

    const app = getApp();
    if (app && app.globalData) {
      app.globalData.preselectedContainer = {
        book_id: book.id || book._id,
        book_name: book.name,
        book_code: book.code,
        book_type: book.type,
        page_no: pageNo,
        row_no: rowNo,
        col_no: colNo || 1,
        location_text: locText
      };
    }

    wx.showActionSheet({
      itemList: [`🎯 设为预选目标并前往扫码入库 [${locText}]`, '🔍 取消'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.switchTab({
            url: '/pages/scan/scan'
          });
        }
      }
    });
  },

  openAddModal() {
    const nextNum = this.data.books.length + 1;
    this.setData({
      showAddModal: true,
      newContainer: {
        type: 'box',
        name: `${nextNum}号 4×6 元件盒`,
        code: `BOX0${nextNum}`,
        category: '常用元器件',
        grid_rows: 4,
        grid_cols: 6,
        total_pages: 20,
        rows_per_page: 12
      }
    });
  },

  closeAddModal() {
    this.setData({ showAddModal: false });
  },

  setNewType(e) {
    const type = e.currentTarget.dataset.type;
    const nextNum = this.data.books.length + 1;
    this.setData({
      'newContainer.type': type,
      'newContainer.name': type === 'box' ? `${nextNum}号 4×6 元件盒` : `${nextNum}号 元件样品册`,
      'newContainer.code': type === 'box' ? `BOX0${nextNum}` : `B0${nextNum}`
    });
  },

  onNewInput(e) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    this.setData({
      [`newContainer.${field}`]: val
    });
  },

  async submitCreateContainer() {
    const nc = this.data.newContainer;
    if (!nc.name || !nc.name.trim()) {
      return wx.showToast({ title: '请输入容器名称', icon: 'none' });
    }
    if (!nc.code || !nc.code.trim()) {
      return wx.showToast({ title: '请输入容器编号', icon: 'none' });
    }

    wx.showLoading({ title: '创建中...' });
    try {
      const res = await api.createBook({
        name: nc.name.trim(),
        code: nc.code.trim().toUpperCase(),
        type: nc.type,
        category: nc.category ? nc.category.trim() : '',
        grid_rows: Number(nc.grid_rows) || 3,
        grid_cols: Number(nc.grid_cols) || 4,
        total_pages: Number(nc.total_pages) || 20,
        rows_per_page: Number(nc.rows_per_page) || 12
      });

      wx.hideLoading();
      if (res && res.success) {
        this.closeAddModal();
        wx.showToast({ title: '创建成功', icon: 'success' });
        this.targetBookId = res.data.id || res.data._id || nc.code;
        this.loadBooks();
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
    }
  },

  confirmDeleteBook() {
    const book = this.data.currentBook;
    if (!book) return;

    const typeText = book.type === 'box' ? '元件盒' : '样品册';
    wx.showModal({
      title: `确认删除${typeText}`,
      content: `确定要删除【${book.name}】吗？删除后其内部的元器件将解除仓位绑定。`,
      confirmText: '确定删除',
      confirmColor: '#f5222d',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteBook(book.id || book._id);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.setData({ currentBookIndex: 0 });
            this.loadBooks();
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
