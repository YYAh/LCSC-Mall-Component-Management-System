const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db');

// List all containers (sample books & component boxes) with utilization statistics
router.get('/', async (req, res) => {
  try {
    const books = await dbAll(`
      SELECT b.*, 
             COUNT(c.id) as used_slots
      FROM sample_books b
      LEFT JOIN components c ON c.book_id = b.id
      GROUP BY b.id
      ORDER BY b.id ASC
    `);

    const formatted = books.map(book => {
      const isBox = book.type === 'box';
      const totalSlots = isBox 
        ? ((book.grid_rows || 3) * (book.grid_cols || 4)) 
        : ((book.total_pages || 20) * (book.rows_per_page || 12));
      const usedSlots = book.used_slots || 0;

      return {
        ...book,
        type: book.type || 'book',
        total_slots: totalSlots,
        empty_slots: Math.max(0, totalSlots - usedSlots),
        usage_percent: totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error('Error in GET /books:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Get single container detail
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const book = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [id]);
    if (!book) {
      return res.status(404).json({ success: false, msg: 'Container not found' });
    }

    const components = await dbAll(`
      SELECT id, c_code, mpn, name, package_name, stock, page_no, row_no, col_no, location_text, image_url 
      FROM components 
      WHERE book_id = ? 
      ORDER BY page_no ASC, row_no ASC, col_no ASC
    `, [id]);

    const isBox = book.type === 'box';
    const totalSlots = isBox 
      ? ((book.grid_rows || 3) * (book.grid_cols || 4)) 
      : ((book.total_pages || 20) * (book.rows_per_page || 12));
    const usedSlots = components.length;

    res.json({
      success: true,
      data: {
        ...book,
        type: book.type || 'book',
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

// Get slots map for a container (grid for box, page rows for sample book)
router.get('/:id/page/:pageNo', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const pageNo = parseInt(req.params.pageNo, 10) || 1;

    const book = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [bookId]);
    if (!book) {
      return res.status(404).json({ success: false, msg: 'Container not found' });
    }

    const isBox = book.type === 'box';

    if (isBox) {
      // Return full 2D grid of rows and columns for X*X Component Box
      const gridRows = book.grid_rows || 3;
      const gridCols = book.grid_cols || 4;

      const componentsInBox = await dbAll(`
        SELECT id, c_code, mpn, name, category, brand, package_name, stock, safe_stock, unit, page_no, row_no, col_no, image_url, location_text, spec
        FROM components 
        WHERE book_id = ?
      `, [bookId]);

      const slotGrid = [];
      for (let r = 1; r <= gridRows; r++) {
        for (let c = 1; c <= gridCols; c++) {
          const comp = componentsInBox.find(item => {
            if (item.row_no === r && item.col_no === c) return true;
            if (item.location_text && (item.location_text.includes(`R${String(r).padStart(2, '0')}-C${String(c).padStart(2, '0')}`) || item.location_text.includes(`R${r}-C${c}`))) return true;
            return false;
          });

          slotGrid.push({
            row_no: r,
            col_no: c,
            slot_coord: `R${r}-C${c}`,
            location_text: `${book.code || 'BOX'}-R${String(r).padStart(2, '0')}-C${String(c).padStart(2, '0')}`,
            is_empty: !comp,
            component: comp || null
          });
        }
      }

      return res.json({
        success: true,
        data: {
          book,
          is_box: true,
          grid_rows: gridRows,
          grid_cols: gridCols,
          total_slots: gridRows * gridCols,
          slots: slotGrid
        }
      });
    }

    // Sample Book: Page Rows
    const componentsOnPage = await dbAll(`
      SELECT id, c_code, mpn, name, category, brand, package_name, stock, safe_stock, unit, page_no, row_no, image_url, location_text, spec
      FROM components 
      WHERE book_id = ? AND page_no = ?
    `, [bookId, pageNo]);

    const rowsCount = book.rows_per_page || 12;
    const slotMap = [];

    for (let r = 1; r <= rowsCount; r++) {
      const comp = componentsOnPage.find(c => c.row_no === r);
      slotMap.push({
        row_no: r,
        is_empty: !comp,
        component: comp || null
      });
    }

    res.json({
      success: true,
      data: {
        book,
        is_box: false,
        page_no: pageNo,
        total_pages: book.total_pages || 20,
        rows_per_page: rowsCount,
        slots: slotMap
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Find next available empty slot in the container
router.get('/:id/next-empty', async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const book = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [bookId]);
    if (!book) {
      return res.status(404).json({ success: false, msg: 'Container not found' });
    }

    const isBox = book.type === 'box';

    if (isBox) {
      const gridRows = book.grid_rows || 3;
      const gridCols = book.grid_cols || 4;

      const occupied = await dbAll(`
        SELECT row_no, col_no, location_text 
        FROM components 
        WHERE book_id = ?
      `, [bookId]);

      const occupiedSet = new Set();
      occupied.forEach(o => {
        if (o.row_no && o.col_no) {
          occupiedSet.add(`${o.row_no}_${o.col_no}`);
        }
        if (o.location_text) {
          const m = o.location_text.match(/R(\d+)-C(\d+)/i);
          if (m) occupiedSet.add(`${parseInt(m[1], 10)}_${parseInt(m[2], 10)}`);
        }
      });

      let found = null;
      for (let r = 1; r <= gridRows; r++) {
        for (let c = 1; c <= gridCols; c++) {
          if (!occupiedSet.has(`${r}_${c}`)) {
            found = {
              book_id: book.id,
              book_name: book.name,
              book_code: book.code,
              book_type: 'box',
              row_no: r,
              col_no: c,
              location_text: `${book.code || 'BOX01'}-R${String(r).padStart(2, '0')}-C${String(c).padStart(2, '0')}`
            };
            break;
          }
        }
        if (found) break;
      }

      return res.json({
        success: true,
        data: found || {
          is_full: true,
          msg: `元件盒【${book.name}】已全部存满（共 ${gridRows * gridCols} 格），请选择其他元件盒或新建元件盒`
        }
      });
    }

    // Sample Book
    const occupied = await dbAll(`
      SELECT page_no, row_no, location_text 
      FROM components 
      WHERE book_id = ?
    `, [bookId]);

    const occupiedSet = new Set();
    occupied.forEach(o => {
      if (o.page_no && o.row_no) {
        occupiedSet.add(`${o.page_no}_${o.row_no}`);
      }
      if (o.location_text) {
        const m = o.location_text.match(/P(\d+)-R(\d+)/i);
        if (m) occupiedSet.add(`${parseInt(m[1], 10)}_${parseInt(m[2], 10)}`);
      }
    });

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
            book_type: 'book',
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

// Create new container (Sample book or X*X Component Box)
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      code, 
      type = 'book', 
      total_pages = 20, 
      rows_per_page = 12, 
      grid_rows = 3, 
      grid_cols = 4, 
      category = '', 
      description = '' 
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, msg: '名称和编号均为必填项' });
    }

    const result = await dbRun(`
      INSERT INTO sample_books (name, code, type, total_pages, rows_per_page, grid_rows, grid_cols, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, 
      code.toUpperCase(), 
      type, 
      parseInt(total_pages, 10) || 20, 
      parseInt(rows_per_page, 10) || 12, 
      parseInt(grid_rows, 10) || 3, 
      parseInt(grid_cols, 10) || 4, 
      category, 
      description
    ]);

    const created = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [result.lastID]);
    res.json({ success: true, data: created, msg: '容器创建成功' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Update container
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { name, code, type, total_pages, rows_per_page, grid_rows, grid_cols, category, description } = req.body;

    await dbRun(`
      UPDATE sample_books SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        type = COALESCE(?, type),
        total_pages = COALESCE(?, total_pages),
        rows_per_page = COALESCE(?, rows_per_page),
        grid_rows = COALESCE(?, grid_rows),
        grid_cols = COALESCE(?, grid_cols),
        category = COALESCE(?, category),
        description = COALESCE(?, description)
      WHERE id = ?
    `, [
      name, 
      code ? code.toUpperCase() : null, 
      type, 
      total_pages, 
      rows_per_page, 
      grid_rows, 
      grid_cols, 
      category, 
      description, 
      id
    ]);

    const updated = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [id]);
    res.json({ success: true, data: updated, msg: '容器信息已更新' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Delete container
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Unlink components in this container
    await dbRun(`UPDATE components SET book_id = NULL, page_no = NULL, row_no = NULL, col_no = NULL WHERE book_id = ?`, [id]);
    await dbRun(`DELETE FROM sample_books WHERE id = ?`, [id]);
    res.json({ success: true, msg: '容器已删除，内部元器件已解除绑定' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
