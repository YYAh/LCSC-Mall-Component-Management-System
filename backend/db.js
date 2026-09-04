const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'inventory.db');
const db = new DatabaseSync(dbPath);
console.log('Connected to SQLite database at:', dbPath);

// Helper for db promises/wrappers
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(sql);
      // Clean params if needed (convert undefined to null)
      const cleanParams = params.map(p => (p === undefined ? null : p));
      const res = stmt.run(...cleanParams);
      resolve({
        lastID: Number(res.lastInsertRowid),
        changes: res.changes
      });
    } catch (err) {
      reject(err);
    }
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(sql);
      const cleanParams = params.map(p => (p === undefined ? null : p));
      const rows = stmt.all(...cleanParams);
      // Convert prototype null objects to standard objects
      resolve(rows.map(r => ({ ...r })));
    } catch (err) {
      reject(err);
    }
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(sql);
      const cleanParams = params.map(p => (p === undefined ? null : p));
      const row = stmt.get(...cleanParams);
      resolve(row ? { ...row } : null);
    } catch (err) {
      reject(err);
    }
  });
};

// Initialize schema
async function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sample_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'book',
      total_pages INTEGER DEFAULT 20,
      rows_per_page INTEGER DEFAULT 12,
      grid_rows INTEGER DEFAULT 3,
      grid_cols INTEGER DEFAULT 4,
      category TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      c_code TEXT,
      mpn TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      package_name TEXT DEFAULT '',
      stock INTEGER DEFAULT 0,
      safe_stock INTEGER DEFAULT 5,
      unit TEXT DEFAULT '个',
      book_id INTEGER,
      page_no INTEGER,
      row_no INTEGER,
      col_no INTEGER DEFAULT 1,
      location_text TEXT DEFAULT '',
      spec TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      datasheet_url TEXT DEFAULT '',
      extra_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES sample_books(id)
    );

    CREATE TABLE IF NOT EXISTS stock_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      change_qty INTEGER NOT NULL,
      balance_qty INTEGER NOT NULL,
      order_no TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (component_id) REFERENCES components(id)
    );

    CREATE TABLE IF NOT EXISTS print_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      width_mm INTEGER NOT NULL,
      height_mm INTEGER NOT NULL,
      is_default INTEGER DEFAULT 0,
      config_json TEXT DEFAULT '{}'
    );
  `);

  // Safe schema migration for existing sqlite db
  try { db.exec(`ALTER TABLE sample_books ADD COLUMN type TEXT DEFAULT 'book';`); } catch (e) {}
  try { db.exec(`ALTER TABLE sample_books ADD COLUMN grid_rows INTEGER DEFAULT 3;`); } catch (e) {}
  try { db.exec(`ALTER TABLE sample_books ADD COLUMN grid_cols INTEGER DEFAULT 4;`); } catch (e) {}
  try { db.exec(`ALTER TABLE components ADD COLUMN col_no INTEGER DEFAULT 1;`); } catch (e) {}

  // Insert default sample books if empty
  const bookCount = await dbGet(`SELECT COUNT(*) as count FROM sample_books`);
  if (!bookCount || bookCount.count === 0) {
    await dbRun(`
      INSERT INTO sample_books (name, code, type, total_pages, rows_per_page, grid_rows, grid_cols, category, description)
      VALUES 
      ('0603 贴片电阻专用册', 'B01', 'book', 20, 12, 0, 0, '贴片电阻', '标准0603贴片电阻专用册，每页12行'),
      ('0805 贴片电容专用册', 'B02', 'book', 20, 12, 0, 0, '贴片电容(MLCC)', '标准0805/0603贴片电容专用册，每页12行'),
      ('1号 4×6 常用贴片盒', 'BOX01', 'box', 1, 24, 4, 6, '常用元器件', '4行6列，共24个独立抽屉格子'),
      ('2号 3×4 芯片抽屉柜', 'BOX02', 'box', 1, 12, 3, 4, '线性稳压器(LDO)', '3行4列，共12个大号芯片抽屉'),
      ('常用二极管与晶体管册', 'B03', 'book', 15, 12, 0, 0, '三极管/MOS管', 'SOT-23/SOD-123封装晶体管、MOS管与二极管')
    `);
  }

  // Insert default print templates if empty
  const templateCount = await dbGet(`SELECT COUNT(*) as count FROM print_templates`);
  if (!templateCount || templateCount.count === 0) {
    await dbRun(`
      INSERT INTO print_templates (name, width_mm, height_mm, is_default, config_json)
      VALUES 
      ('样品册插槽标签 (30x10mm)', 30, 10, 1, '{"fontSize": 18, "showQr": true, "showLocation": true, "showCcode": true}'),
      ('标准元件盒标签 (40x20mm)', 40, 20, 0, '{"fontSize": 20, "showQr": true, "showLocation": true, "showCcode": true, "showBrand": true}'),
      ('大号抽屉标签 (50x30mm)', 50, 30, 0, '{"fontSize": 24, "showQr": true, "showLocation": true, "showCcode": true, "showBrand": true, "showMpn": true}')
    `);
  }

  console.log('Database initialized successfully.');
}

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet,
  initDb
};
