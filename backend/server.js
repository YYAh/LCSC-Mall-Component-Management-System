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
