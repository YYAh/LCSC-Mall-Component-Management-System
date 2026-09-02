const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db');

// List all sample books with utilization statistics
router.get('/', async (req, res) => {
  try {
    const books = await dbAll(`
      SELECT b.*, 
             COUNT(c.id) as used_slots,
             (b.total_pages * b.rows_per_page) as total_slots
      FROM sample_books b
      LEFT JOIN components c ON c.book_id = b.id
      GROUP BY b.id
      ORDER BY b.id ASC
    `);

    const formatted = books.map(book => ({
      ...book,
      empty_slots: Math.max(0, book.total_slots - book.used_slots),
      usage_percent: book.total_slots > 0 ? Math.round((book.used_slots / book.total_slots) * 100) : 0
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error('Error in GET /books:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Get single book detail
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const book = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [id]);
    if (!book) {
      return res.status(404).json({ success: false, msg: 'Sample book not found' });
    }

    const components = await dbAll(`
      SELECT id, c_code, mpn, name, package_name, stock, page_no, row_no, image_url 
      FROM components 
      WHERE book_id = ? 
      ORDER BY page_no ASC, row_no ASC
    `, [id]);

    const totalSlots = book.total_pages * book.rows_per_page;
    const usedSlots = components.length;

    res.json({
      success: true,
      data: {
        ...book,
        total_slots: totalSlots,
        used_slots: usedSlots,
        empty_slots: Math.max(0, totalSlots - usedSlots),
        components
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Get 12-row slot map for a specific page in a sample book
router.get('/:id/page/:pageNo', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const pageNo = parseInt(req.params.pageNo, 10);

    const book = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [bookId]);
    if (!book) {
      return res.status(404).json({ success: false, msg: 'Sample book not found' });
    }

    const componentsOnPage = await dbAll(`
      SELECT id, c_code, mpn, name, category, brand, package_name, stock, safe_stock, unit, page_no, row_no, image_url, location_text, spec
      FROM components 
      WHERE book_id = ? AND page_no = ?
    `, [bookId, pageNo]);

    const rowsCount = book.rows_per_page || 12;
    const slotMap = [];

    for (let r = 1; r <= rowsCount; r++) {
      const comp = componentsOnPage.find(c => c.row_no === r);
      if (comp) {
        slotMap.push({
          row_no: r,
          is_empty: false,
          component: comp
        });
      } else {
        slotMap.push({
          row_no: r,
          is_empty: true,
          component: null
        });
      }
    }

    res.json({
      success: true,
      data: {
        book,
        page_no: pageNo,
        total_pages: book.total_pages,
        rows_per_page: rowsCount,
        slots: slotMap
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Find next available empty slot in the sample book
router.get('/:id/next-empty', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const book = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [bookId]);
    if (!book) {
      return res.status(404).json({ success: false, msg: 'Sample book not found' });
    }

    const occupied = await dbAll(`
      SELECT page_no, row_no 
      FROM components 
      WHERE book_id = ? AND page_no IS NOT NULL AND row_no IS NOT NULL
    `, [bookId]);

    const occupiedSet = new Set(occupied.map(o => `${o.page_no}_${o.row_no}`));

    let found = null;
    const totalPages = book.total_pages || 20;
    const rowsPerPage = book.rows_per_page || 12;

    for (let p = 1; p <= totalPages; p++) {
      for (let r = 1; r <= rowsPerPage; r++) {
        if (!occupiedSet.has(`${p}_${r}`)) {
          found = {
            book_id: book.id,
            book_name: book.name,
            book_code: book.code,
            page_no: p,
            row_no: r,
            location_text: `${book.code || book.name}-P${String(p).padStart(2, '0')}-R${String(r).padStart(2, '0')}`
          };
          break;
        }
      }
      if (found) break;
    }

    res.json({
      success: true,
      data: found || {
        is_full: true,
        msg: '该样品册已存满，可考虑新增页数或新建样品册'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Create new sample book
router.post('/', async (req, res) => {
  try {
    const { name, code, total_pages = 20, rows_per_page = 12, category = '', description = '' } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, msg: 'Name and Code are required' });
    }

    const result = await dbRun(`
      INSERT INTO sample_books (name, code, total_pages, rows_per_page, category, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, code.toUpperCase(), parseInt(total_pages, 10) || 20, parseInt(rows_per_page, 10) || 12, category, description]);

    const created = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [result.lastID]);
    res.json({ success: true, data: created, msg: 'Sample book created' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Update sample book
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { name, code, total_pages, rows_per_page, category, description } = req.body;

    await dbRun(`
      UPDATE sample_books SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        total_pages = COALESCE(?, total_pages),
        rows_per_page = COALESCE(?, rows_per_page),
        category = COALESCE(?, category),
        description = COALESCE(?, description)
      WHERE id = ?
    `, [name, code ? code.toUpperCase() : null, total_pages, rows_per_page, category, description, id]);

    const updated = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [id]);
    res.json({ success: true, data: updated, msg: 'Sample book updated' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Delete sample book
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Unlink components in this book
    await dbRun(`UPDATE components SET book_id = NULL, page_no = NULL, row_no = NULL WHERE book_id = ?`, [id]);
    await dbRun(`DELETE FROM sample_books WHERE id = ?`, [id]);
    res.json({ success: true, msg: 'Sample book deleted and components unlinked' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
