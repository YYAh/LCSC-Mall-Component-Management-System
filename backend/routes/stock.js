const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db');

// Inbound stock (入库 / 补充库存)
router.post('/in', async (req, res) => {
  try {
    const { component_id, qty, order_no = '', remark = '补充入库' } = req.body;
    const addQty = parseInt(qty, 10);
    if (!component_id || !addQty || addQty <= 0) {
      return res.status(400).json({ success: false, msg: 'Invalid component_id or quantity' });
    }

    const comp = await dbGet(`SELECT * FROM components WHERE id = ?`, [component_id]);
    if (!comp) {
      return res.status(404).json({ success: false, msg: 'Component not found' });
    }

    const newBalance = comp.stock + addQty;

    await dbRun(`
      UPDATE components 
      SET stock = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [newBalance, component_id]);

    await dbRun(`
      INSERT INTO stock_logs (component_id, type, change_qty, balance_qty, order_no, remark)
      VALUES (?, 'IN', ?, ?, ?, ?)
    `, [component_id, addQty, newBalance, order_no, remark]);

    res.json({
      success: true,
      data: {
        component_id,
        prev_stock: comp.stock,
        new_stock: newBalance,
        change: addQty
      },
      msg: `入库成功，当前库存：${newBalance} ${comp.unit || '个'}`
    });
  } catch (err) {
    console.error('Error in /stock/in:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Outbound stock (出库 / 领料扣减)
router.post('/out', async (req, res) => {
  try {
    const { component_id, qty, remark = '项目领料' } = req.body;
    const outQty = parseInt(qty, 10);
    if (!component_id || !outQty || outQty <= 0) {
      return res.status(400).json({ success: false, msg: 'Invalid component_id or quantity' });
    }

    const comp = await dbGet(`SELECT * FROM components WHERE id = ?`, [component_id]);
    if (!comp) {
      return res.status(404).json({ success: false, msg: 'Component not found' });
    }

    if (comp.stock < outQty) {
      return res.status(400).json({
        success: false,
        msg: `库存不足！当前仅有 ${comp.stock} ${comp.unit || '个'}，无法出库 ${outQty} ${comp.unit || '个'}`
      });
    }

    const newBalance = comp.stock - outQty;

    await dbRun(`
      UPDATE components 
      SET stock = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [newBalance, component_id]);

    await dbRun(`
      INSERT INTO stock_logs (component_id, type, change_qty, balance_qty, remark)
      VALUES (?, 'OUT', ?, ?, ?)
    `, [component_id, -outQty, newBalance, remark]);

    res.json({
      success: true,
      data: {
        component_id,
        prev_stock: comp.stock,
        new_stock: newBalance,
        change: -outQty
      },
      msg: `出库成功，剩余库存：${newBalance} ${comp.unit || '个'}`
    });
  } catch (err) {
    console.error('Error in /stock/out:', err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Direct adjust / audit stock (盘点校准)
router.post('/set', async (req, res) => {
  try {
    const { component_id, stock, remark = '盘点校准' } = req.body;
    const newStock = parseInt(stock, 10);
    if (!component_id || isNaN(newStock) || newStock < 0) {
      return res.status(400).json({ success: false, msg: 'Invalid stock value' });
    }

    const comp = await dbGet(`SELECT * FROM components WHERE id = ?`, [component_id]);
    if (!comp) {
      return res.status(404).json({ success: false, msg: 'Component not found' });
    }

    const diff = newStock - comp.stock;

    await dbRun(`
      UPDATE components 
      SET stock = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [newStock, component_id]);

    await dbRun(`
      INSERT INTO stock_logs (component_id, type, change_qty, balance_qty, remark)
      VALUES (?, 'ADJUST', ?, ?, ?)
    `, [component_id, diff, newStock, remark]);

    res.json({
      success: true,
      data: {
        component_id,
        prev_stock: comp.stock,
        new_stock: newStock,
        diff
      },
      msg: `库存校准成功，当前库存：${newStock} ${comp.unit || '个'}`
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Recent stock transaction logs
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await dbAll(`
      SELECT l.*, c.name, c.mpn, c.c_code, c.package_name, c.location_text, c.image_url
      FROM stock_logs l
      JOIN components c ON l.component_id = c.id
      ORDER BY l.created_at DESC
      LIMIT ?
    `, [parseInt(limit, 10)]);

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Dashboard summary statistics
router.get('/dashboard', async (req, res) => {
  try {
    const compStats = await dbGet(`
      SELECT 
        COUNT(*) as total_components,
        SUM(stock) as total_stock,
        SUM(CASE WHEN stock <= safe_stock THEN 1 ELSE 0 END) as low_stock_count
      FROM components
    `);

    const bookStats = await dbGet(`
      SELECT 
        COUNT(*) as total_books,
        SUM(total_pages * rows_per_page) as total_capacity
      FROM sample_books
    `);

    const recentLogs = await dbAll(`
      SELECT l.*, c.name, c.mpn, c.c_code, c.location_text
      FROM stock_logs l
      JOIN components c ON l.component_id = c.id
      ORDER BY l.created_at DESC
      LIMIT 8
    `);

    const lowStockList = await dbAll(`
      SELECT c.*, b.name as book_name 
      FROM components c
      LEFT JOIN sample_books b ON c.book_id = b.id
      WHERE c.stock <= c.safe_stock
      ORDER BY c.stock ASC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        total_components: compStats.total_components || 0,
        total_stock: compStats.total_stock || 0,
        low_stock_count: compStats.low_stock_count || 0,
        total_books: bookStats.total_books || 0,
        total_capacity: bookStats.total_capacity || 0,
        recent_logs: recentLogs,
        low_stock_list: lowStockList
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
