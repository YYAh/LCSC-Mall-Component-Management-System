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
    loading: false
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
        let idx = 0;
        if (this.targetBookId) {
          const foundIdx = res.data.findIndex(b => String(b.id) === String(this.targetBookId) || String(b._id) === String(this.targetBookId));
          if (foundIdx !== -1) idx = foundIdx;
          this.targetBookId = null;
        } else if (this.data.currentBookIndex < res.data.length) {
          idx = this.data.currentBookIndex;
        }

        const currentBook = res.data[idx];
        const pages = [];
        const totalP = currentBook.total_pages || 20;
        for (let i = 1; i <= totalP; i++) {
          pages.push(`第 P${i < 10 ? '0' + i : i} 页`);
        }

        this.setData({
          books: res.data,
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
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  fillEmptySlot(e) {
    const rowNo = e.currentTarget.dataset.row;
    const book = this.data.currentBook;
    const pageNo = this.data.currentPage;

    wx.showActionSheet({
      itemList: ['📷 扫码录入并放入该插槽', '✏️ 手动输入编号并放入'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.scanCode({
            scanType: ['qrCode', 'barCode'],
            success: (scanRes) => {
              getApp().globalData.pendingScanRaw = scanRes.result;
              wx.switchTab({
                url: '/pages/scan/scan'
              });
            }
          });
        } else if (res.tapIndex === 1) {
          wx.switchTab({
            url: '/pages/scan/scan'
          });
        }
      }
    });
  },

  openAddBookModal() {
    wx.showModal({
      title: '新建样品册',
      content: '',
      editable: true,
      placeholderText: '请输入样品册名称 (如: 0402贴片电阻册)',
      success: async (res) => {
        if (res.confirm && res.content) {
          const name = res.content.trim();
          const nextCode = `B0${this.data.books.length + 1}`;
          try {
            const addRes = await api.createBook({
              name,
              code: nextCode,
              total_pages: 20,
              rows_per_page: 12
            });
            if (addRes && addRes.success) {
              wx.showToast({ title: '样品册创建成功', icon: 'success' });
              this.loadBooks();
            }
          } catch (err) {
            wx.showToast({ title: err.message || '创建失败', icon: 'none' });
          }
        }
      }
    });
  },

  confirmDeleteBook() {
    const book = this.data.currentBook;
    if (!book) return;

    wx.showModal({
      title: '确认删除样品册',
      content: `确定要删除【${book.name}】吗？删除后该册内的元器件将释放仓位。`,
      confirmText: '确定删除',
      confirmColor: '#f5222d',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteBook(book.id || book._id);
            wx.showToast({ title: '已删除样品册', icon: 'success' });
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
