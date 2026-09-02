const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db');

// List print templates
router.get('/', async (req, res) => {
  try {
    const list = await dbAll(`SELECT * FROM print_templates ORDER BY is_default DESC, id ASC`);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// Create or update template
router.post('/', async (req, res) => {
  try {
    const { id, name, width_mm, height_mm, is_default = 0, config_json = '{}' } = req.body;
    if (!name || !width_mm || !height_mm) {
      return res.status(400).json({ success: false, msg: 'Name, width and height are required' });
    }

    if (is_default) {
      await dbRun(`UPDATE print_templates SET is_default = 0`);
    }

    if (id) {
      await dbRun(`
        UPDATE print_templates SET
          name = ?, width_mm = ?, height_mm = ?, is_default = ?, config_json = ?
        WHERE id = ?
      `, [name, width_mm, height_mm, is_default ? 1 : 0, typeof config_json === 'object' ? JSON.stringify(config_json) : config_json, id]);
    } else {
      await dbRun(`
        INSERT INTO print_templates (name, width_mm, height_mm, is_default, config_json)
        VALUES (?, ?, ?, ?, ?)
      `, [name, width_mm, height_mm, is_default ? 1 : 0, typeof config_json === 'object' ? JSON.stringify(config_json) : config_json]);
    }

    const all = await dbAll(`SELECT * FROM print_templates ORDER BY is_default DESC, id ASC`);
    res.json({ success: true, data: all, msg: 'Template saved' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
