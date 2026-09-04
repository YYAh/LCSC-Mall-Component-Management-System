const express = require('express');
const os = require('os');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Standard Native CORS Middleware (Zero external dependency)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSON body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/health')) {
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'jlc-inventory-backend' });
});

// Mount API routes
app.use('/api/components', require('./routes/components'));
app.use('/api/books', require('./routes/books'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/templates', require('./routes/templates'));

// Live Web Online Spreadsheet Page (100% Free, Matching Image 1)
app.get('/table', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>嘉立创元器件实时在线物料表格</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
    .title { font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px; }
    .badge { background: #e0f2fe; color: #0284c7; font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 20px; }
    .toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: #ffffff; padding: 12px 16px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .search-input { padding: 8px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; min-width: 240px; outline: none; }
    .search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .select-cat { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; background: #fff; outline: none; }
    .btn { padding: 8px 16px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-success { background: #16a34a; color: #fff; }
    .btn-success:hover { background: #15803d; }
    .status-pill { font-size: 12px; padding: 4px 8px; border-radius: 4px; display: inline-block; }
    .status-low { background: #fee2e2; color: #dc2626; font-weight: 700; }
    .status-ok { background: #dcfce7; color: #16a34a; font-weight: 700; }
    .table-container { background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
    th { background: #f1f5f9; color: #475569; font-weight: 700; padding: 10px 12px; border-bottom: 2px solid #cbd5e1; border-right: 1px solid #e2e8f0; white-space: nowrap; }
    td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; white-space: nowrap; color: #334155; }
    tr:hover td { background: #f8fafc; }
    .c-code { color: #2563eb; font-weight: 700; font-family: monospace; }
    .mpn { font-weight: 700; color: #0f172a; }
    .loc { background: #f3e8ff; color: #7e22ce; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 12px; }
    .stock-num { font-weight: 700; font-size: 14px; }
    .live-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>📊 嘉立创元器件实时在线物料表格 (100% 永久免费)</span>
      <span class="badge" id="totalCountBadge">共 0 种元器件</span>
    </div>
    <div style="display:flex; align-items:center; gap:12px;">
      <span style="font-size:13px; color:#64748b; display:flex; align-items:center; gap:6px;">
        <span class="live-dot"></span> 实时毫秒级同步中
      </span>
      <button class="btn btn-success" onclick="exportCSV()">⬇️ 导出 Excel / CSV</button>
    </div>
  </div>

  <div class="toolbar">
    <input type="text" id="searchInput" class="search-input" placeholder="🔍 快速搜索型号、C编号、品牌、参数、仓位..." oninput="renderTable()" />
    <select id="catSelect" class="select-cat" onchange="renderTable()">
      <option value="">📂 全部元器件大类</option>
    </select>
    <label style="display:flex; align-items:center; gap:6px; font-size:14px; cursor:pointer;">
      <input type="checkbox" id="lowStockCheck" onchange="renderTable()" />
      <span>仅看库存偏低物料</span>
    </label>
    <button class="btn btn-primary" style="margin-left:auto;" onclick="fetchData()">🔄 立即刷新</button>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>序号</th>
          <th>大类</th>
          <th>厂家型号 (PM)</th>
          <th>立创编号 (PC)</th>
          <th>品牌</th>
          <th>封装</th>
          <th>参数值</th>
          <th>当前库存</th>
          <th>样品册仓位</th>
          <th>安全库存</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        <tr><td colspan="11" style="text-align:center; padding: 40px; color:#94a3b8;">正在加载元器件数据...</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    let rawComponents = [];

    async function fetchData() {
      try {
        const res = await fetch('/api/components');
        const data = await res.json();
        if (data && data.success) {
          rawComponents = data.data.list || [];
          updateCategories();
          renderTable();
        }
      } catch (e) {
        console.error('Fetch components failed', e);
      }
    }

    function updateCategories() {
      const catSelect = document.getElementById('catSelect');
      const cur = catSelect.value;
      const cats = Array.from(new Set(rawComponents.map(c => c.category).filter(Boolean))).sort();
      catSelect.innerHTML = '<option value="">📂 全部元器件大类 (' + rawComponents.length + ')</option>';
      cats.forEach(cat => {
        const count = rawComponents.filter(c => c.category === cat).length;
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat + ' (' + count + ')';
        if (cat === cur) opt.selected = true;
        catSelect.appendChild(opt);
      });
    }

    function renderTable() {
      const kw = document.getElementById('searchInput').value.toLowerCase().trim();
      const cat = document.getElementById('catSelect').value;
      const onlyLow = document.getElementById('lowStockCheck').checked;

      let filtered = rawComponents.filter(c => {
        if (cat && c.category !== cat) return false;
        if (onlyLow && (Number(c.stock) || 0) > (Number(c.safe_stock) || 5)) return false;
        if (kw) {
          const match = (c.mpn && c.mpn.toLowerCase().includes(kw)) ||
                        (c.c_code && c.c_code.toLowerCase().includes(kw)) ||
                        (c.name && c.name.toLowerCase().includes(kw)) ||
                        (c.brand && c.brand.toLowerCase().includes(kw)) ||
                        (c.spec && c.spec.toLowerCase().includes(kw)) ||
                        (c.package_name && c.package_name.toLowerCase().includes(kw)) ||
                        (c.location_text && c.location_text.toLowerCase().includes(kw));
          if (!match) return false;
        }
        return true;
      });

      document.getElementById('totalCountBadge').textContent = '匹配到 ' + filtered.length + ' / ' + rawComponents.length + ' 种物料';

      const tbody = document.getElementById('tableBody');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 40px; color:#94a3b8;">未检索到符合条件的元器件</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map((c, idx) => {
        const isLow = (Number(c.stock) || 0) <= (Number(c.safe_stock) || 5);
        return '<tr>' +
          '<td>' + (idx + 1) + '</td>' +
          '<td><strong>' + (c.category || '未分类') + '</strong></td>' +
          '<td class="mpn">' + (c.mpn || c.name || '-') + '</td>' +
          '<td class="c-code">' + (c.c_code || '-') + '</td>' +
          '<td>' + (c.brand || '-') + '</td>' +
          '<td>' + (c.package_name || '-') + '</td>' +
          '<td style="max-width:320px; overflow:hidden; text-overflow:ellipsis;" title="' + (c.spec || '') + '">' + (c.spec || '-') + '</td>' +
          '<td class="stock-num ' + (isLow ? 'status-low' : '') + '">' + (c.stock || 0) + '</td>' +
          '<td>' + (c.location_text ? '<span class="loc">' + c.location_text + '</span>' : '-') + '</td>' +
          '<td>' + (c.safe_stock || 5) + '</td>' +
          '<td><span class="status-pill ' + (isLow ? 'status-low' : 'status-ok') + '">' + (isLow ? '📉 库存偏低' : '✅ 充足') + '</span></td>' +
        '</tr>';
      }).join('');
    }

    function exportCSV() {
      const headers = ['大类', '厂家型号(PM)', '立创编号(PC)', '品牌', '封装', '参数值', '当前库存', '样品册仓位', '安全库存'];
      const rows = rawComponents.map(c => [
        c.category || '',
        c.mpn || c.name || '',
        c.c_code || '',
        c.brand || '',
        c.package_name || '',
        c.spec || '',
        c.stock || 0,
        c.location_text || '',
        c.safe_stock || 5
      ]);
      let csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '元器件实时在线表格_' + new Date().toLocaleDateString().replace(/\\//g, '-') + '.csv';
      a.click();
    }

    fetchData();
    // Live Auto Refresh every 3 seconds
    setInterval(fetchData, 3000);
  </script>
</body>
</html>`);
});

// Get local network IPs for convenient phone connection
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// Start server
async function start() {
  try {
    await initDb();

    app.listen(PORT, '0.0.0.0', () => {
      const ips = getLocalIpAddresses();
      console.log('=====================================================');
      console.log('🚀 嘉立创元器件与样品册库存管理系统后端服务已启动');
      console.log('=====================================================');
      console.log(`📡 本地访问地址:   http://localhost:${PORT}`);
      ips.forEach(ip => {
        console.log(`📱 手机/局域网同步: http://${ip}:${PORT}`);
      });
      console.log('=====================================================');
      console.log('💡 微信小程序端配置:');
      console.log(`   请在小程序【设置】中将服务器地址填为: http://${ips[0] || '127.0.0.1'}:${PORT}`);
      console.log('=====================================================');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
