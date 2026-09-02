const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db');
const { parseJlcQrCode, queryComponentByKeyword } = require('../jlcService');

// Parse JLC QR code and optionally auto-query LCEDA API
router.all(['/jlc/parse', '/parse-qr'], async (req, res) => {
  try {
    const text = req.body.text || req.query.text;
    if (!text) {
      return res.status(400).json({ success: false, msg: 'Missing text parameter' });
    }

    const parsed = parseJlcQrCode(text);
    if (!parsed) {
      return res.status(400).json({ success: false, msg: 'Unable to parse QR code format' });
    }

    // Determine query keyword (prefer C-Code, fallback to MPN)
    const keyword = parsed.cCode || parsed.mpn;
    let componentData = null;
    if (keyword) {
      componentData = await queryComponentByKeyword(keyword);
    }

    // Combine parsed QR info with API data
    const responseData = {
      qrInfo: parsed,
      component: componentData ? {
        ...componentData,
        c_code: parsed.cCode || componentData.c_code,
        mpn: parsed.mpn || componentData.mpn,
        inbound_qty: parsed.qty || 10,
        order_no: parsed.orderNo || ''
      } : {
        c_code: parsed.cCode,
        mpn: parsed.mpn,
        name: parsed.mpn,
        category: '未分类',
        brand: '',
        package_name: '',
        inbound_qty: parsed.qty || 10,
        order_no: parsed.orderNo || ''
      }
    };

    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('Error in /jlc/parse:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Search JLC/EasyEDA API by keyword (C-Code or model)
router.all(['/jlc/search', '/search-jlc'], async (req, res) => {
  try {
    const keyword = req.body.keyword || req.query.keyword;
    if (!keyword) {
      return res.status(400).json({ success: false, msg: 'Missing keyword parameter' });
    }

    const data = await queryComponentByKeyword(keyword);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error in /jlc/search:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// List components with search and filters
router.get('/', async (req, res) => {
  try {
    const { keyword, category, book_id, low_stock, page = 1, page_size = 50 } = req.query;
    let sql = `
      SELECT c.*, b.name as book_name, b.code as book_code 
      FROM components c
      LEFT JOIN sample_books b ON c.book_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (keyword) {
      sql += ` AND (c.c_code LIKE ? OR c.mpn LIKE ? OR c.name LIKE ? OR c.package_name LIKE ? OR c.brand LIKE ? OR c.location_text LIKE ?)`;
      const kwParam = `%${keyword.trim()}%`;
      params.push(kwParam, kwParam, kwParam, kwParam, kwParam, kwParam);
    }

    if (category) {
      sql += ` AND c.category = ?`;
      params.push(category);
    }

    if (book_id) {
      sql += ` AND c.book_id = ?`;
      params.push(parseInt(book_id, 10));
    }

    if (low_stock === '1' || low_stock === 'true') {
      sql += ` AND c.stock <= c.safe_stock`;
    }

    // Count total
    const countSql = `SELECT COUNT(*) as count FROM (${sql})`;
    const countRow = await dbGet(countSql, params);
    const total = countRow ? countRow.count : 0;

    sql += ` ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`;
    const offset = (parseInt(page, 10) - 1) * parseInt(page_size, 10);
    params.push(parseInt(page_size, 10), offset);

    const list = await dbAll(sql, params);

    res.json({
      success: true,
      data: {
        list,
        total,
        page: parseInt(page, 10),
        page_size: parseInt(page_size, 10)
      }
    });
  } catch (err) {
    console.error('Error in GET /components:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Get component categories summary
router.get('/categories', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT category, COUNT(*) as count 
      FROM components 
      WHERE category != '' AND category IS NOT NULL 
      GROUP BY category 
      ORDER BY count DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Get single component details with logs
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const component = await dbGet(`
      SELECT c.*, b.name as book_name, b.code as book_code 
      FROM components c
      LEFT JOIN sample_books b ON c.book_id = b.id
      WHERE c.id = ?
    `, [id]);

    if (!component) {
      return res.status(404).json({ success: false, msg: 'Component not found' });
    }

    const logs = await dbAll(`
      SELECT * FROM stock_logs 
      WHERE component_id = ? 
      ORDER BY created_at DESC LIMIT 30
    `, [id]);

    res.json({
      success: true,
      data: {
        ...component,
        logs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Create new component or inbound
router.post('/', async (req, res) => {
  try {
    const {
      c_code,
      mpn,
      name,
      category = '通用元器件',
      brand = '',
      package_name = '',
      stock = 0,
      safe_stock = 5,
      unit = '个',
      book_id = null,
      page_no = null,
      row_no = null,
      spec = '',
      image_url = '',
      datasheet_url = '',
      extra_json = '{}',
      order_no = '',
      remark = '初始入库'
    } = req.body;

    if (!mpn && !name && !c_code) {
      return res.status(400).json({ success: false, msg: 'At least one of MPN, Name or C-Code must be provided' });
    }

    // Build location_text automatically if book_id, page_no, row_no are provided
    let location_text = req.body.location_text || '';
    if (book_id && page_no && row_no) {
      const book = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [book_id]);
      if (book) {
        const pStr = String(page_no).padStart(2, '0');
        const rStr = String(row_no).padStart(2, '0');
        location_text = `${book.code || book.name}-P${pStr}-R${rStr}`;
      }
    }

    // Insert into components
    const insertResult = await dbRun(`
      INSERT INTO components (
        c_code, mpn, name, category, brand, package_name, 
        stock, safe_stock, unit, book_id, page_no, row_no, 
        location_text, spec, image_url, datasheet_url, extra_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      c_code || '',
      mpn || name || c_code,
      name || mpn || c_code,
      category,
      brand,
      package_name,
      parseInt(stock, 10) || 0,
      parseInt(safe_stock, 10) || 5,
      unit || '个',
      book_id ? parseInt(book_id, 10) : null,
      page_no ? parseInt(page_no, 10) : null,
      row_no ? parseInt(row_no, 10) : null,
      location_text,
      spec,
      image_url,
      datasheet_url,
      typeof extra_json === 'object' ? JSON.stringify(extra_json) : extra_json
    ]);

    const newId = insertResult.lastID;

    // Record stock log if initial stock > 0
    if (parseInt(stock, 10) > 0) {
      await dbRun(`
        INSERT INTO stock_logs (component_id, type, change_qty, balance_qty, order_no, remark)
        VALUES (?, 'IN', ?, ?, ?, ?)
      `, [newId, parseInt(stock, 10), parseInt(stock, 10), order_no || '', remark || '扫码入库']);
    }

    const created = await dbGet(`SELECT * FROM components WHERE id = ?`, [newId]);
    res.json({ success: true, data: created, msg: 'Component saved successfully' });
  } catch (err) {
    console.error('Error in POST /components:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Update component
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const {
      c_code,
      mpn,
      name,
      category,
      brand,
      package_name,
      safe_stock,
      unit,
      book_id,
      page_no,
      row_no,
      spec,
      image_url,
      datasheet_url,
      extra_json
    } = req.body;

    let location_text = req.body.location_text;
    if (book_id && page_no && row_no) {
      const book = await dbGet(`SELECT * FROM sample_books WHERE id = ?`, [book_id]);
      if (book) {
        const pStr = String(page_no).padStart(2, '0');
        const rStr = String(row_no).padStart(2, '0');
        location_text = `${book.code || book.name}-P${pStr}-R${rStr}`;
      }
    }

    await dbRun(`
      UPDATE components SET
        c_code = COALESCE(?, c_code),
        mpn = COALESCE(?, mpn),
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        brand = COALESCE(?, brand),
        package_name = COALESCE(?, package_name),
        safe_stock = COALESCE(?, safe_stock),
        unit = COALESCE(?, unit),
        book_id = ?,
        page_no = ?,
        row_no = ?,
        location_text = COALESCE(?, location_text),
        spec = COALESCE(?, spec),
        image_url = COALESCE(?, image_url),
        datasheet_url = COALESCE(?, datasheet_url),
        extra_json = COALESCE(?, extra_json),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      c_code,
      mpn,
      name,
      category,
      brand,
      package_name,
      safe_stock,
      unit,
      book_id ? parseInt(book_id, 10) : null,
      page_no ? parseInt(page_no, 10) : null,
      row_no ? parseInt(row_no, 10) : null,
      location_text,
      spec,
      image_url,
      datasheet_url,
      typeof extra_json === 'object' ? JSON.stringify(extra_json) : extra_json,
      id
    ]);

    const updated = await dbGet(`SELECT * FROM components WHERE id = ?`, [id]);
    res.json({ success: true, data: updated, msg: 'Component updated' });
  } catch (err) {
    console.error('Error in PUT /components:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Delete component
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await dbRun(`DELETE FROM stock_logs WHERE component_id = ?`, [id]);
    await dbRun(`DELETE FROM components WHERE id = ?`, [id]);
    res.json({ success: true, msg: 'Component deleted' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
