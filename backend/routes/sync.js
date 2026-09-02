const express = require('express');
const https = require('https');
const http = require('http');
const router = express.Router();

router.post('/webhook', (req, res) => {
  const { url, data, method = 'POST', header = {} } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, msg: 'Missing webhook url' });
  }

  try {
    const postData = typeof data === 'string' ? data : JSON.stringify(data || {});
    const targetUrl = new URL(url);
    const client = targetUrl.protocol === 'https:' ? https : http;

    const reqHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LCSC-Inventory-Sync/1.0',
      ...header
    };

    if (method.toUpperCase() !== 'GET') {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: method.toUpperCase(),
      headers: reqHeaders,
      timeout: 12000
    };

    const proxyReq = client.request(options, (proxyRes) => {
      let responseBody = '';
      proxyRes.on('data', chunk => responseBody += chunk);
      proxyRes.on('end', () => {
        let parsed = responseBody;
        try { parsed = JSON.parse(responseBody); } catch (e) {}
        res.status(proxyRes.statusCode || 200).json({
          success: proxyRes.statusCode >= 200 && proxyRes.statusCode < 300,
          statusCode: proxyRes.statusCode,
          data: parsed
        });
      });
    });

    proxyReq.on('error', (err) => {
      res.status(500).json({ success: false, msg: 'Proxy request error: ' + err.message });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(504).json({ success: false, msg: 'Webhook request timeout (10s)' });
    });

    proxyReq.write(postData);
    proxyReq.end();
  } catch (err) {
    res.status(400).json({ success: false, msg: 'Invalid webhook url: ' + err.message });
  }
});

module.exports = router;
