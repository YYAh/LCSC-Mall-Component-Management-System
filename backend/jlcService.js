const https = require('https');
const http = require('http');

/**
 * Parse raw QR Code text from JLC / LCSC packaging
 * Example inputs:
 * 1. {on:SO2608166813,pc:C127509,pm:K2-1102SP-C4SC-04,qty:10,mc:,cc:1,pdi:231370636,hp:null}
 * 2. C127509
 * 3. https://item.szlcsc.com/127509.html
 */
function parseJlcQrCode(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }
  const text = rawText.trim();

  const result = {
    raw: text,
    orderNo: '',
    cCode: '',
    mpn: '',
    qty: 0,
    batchNo: '',
    extra: {}
  };

  // Case 1: Loose pseudo-JSON format {on:...,pc:...,pm:...,qty:...}
  if (text.startsWith('{') && text.endsWith('}')) {
    const inner = text.slice(1, -1);
    // Regex match key-value pairs like key:value,
    const pairs = inner.split(',');
    for (const pair of pairs) {
      const idx = pair.indexOf(':');
      if (idx !== -1) {
        const key = pair.slice(0, idx).trim();
        let val = pair.slice(idx + 1).trim();
        if (val === 'null') val = null;

        if (key === 'on') result.orderNo = val || '';
        else if (key === 'pc') result.cCode = val ? (val.toUpperCase().startsWith('C') ? val.toUpperCase() : 'C' + val) : '';
        else if (key === 'pm') result.mpn = val || '';
        else if (key === 'qty') result.qty = parseInt(val, 10) || 0;
        else if (key === 'mc') result.batchNo = val || '';
        else {
          result.extra[key] = val;
        }
      }
    }
    return result;
  }

  // Case 2: Pure C-Code (e.g. C127509 or c127509)
  const cCodeMatch = text.match(/(C\d{4,9})/i);
  if (cCodeMatch) {
    result.cCode = cCodeMatch[1].toUpperCase();
    return result;
  }

  // Case 3: szlcsc URL (e.g. szlcsc.com/127509.html)
  const urlMatch = text.match(/szlcsc\.com\/(\d+)\.html/i);
  if (urlMatch) {
    result.cCode = 'C' + urlMatch[1];
    return result;
  }

  // Case 4: General string as MPN keyword
  result.mpn = text;
  return result;
}

/**
 * Fetch HTTP JSON helper
 */
function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'application/json, text/plain, */*',
        ...(options.headers || {})
      },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Query component details from EasyEDA / JLC public API
 */
async function queryComponentByKeyword(keyword) {
  if (!keyword) return null;
  const kw = keyword.trim();

  const urls = [
    `https://pro.lceda.cn/api/eda/product/search?keyword=${encodeURIComponent(kw)}`,
    `https://pro.easyeda.com/api/eda/product/search?keyword=${encodeURIComponent(kw)}`
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const resp = await fetchJson(url);
      if (resp && resp.result && resp.result.productList && resp.result.productList.length > 0) {
        // Find exact c_code match if keyword is a C-code, otherwise pick first
        let matched = resp.result.productList.find(p => p.code && p.code.toUpperCase() === kw.toUpperCase());
        if (!matched) {
          matched = resp.result.productList[0];
        }

        // Parse images
        let imageUrl = '';
        if (matched.image) {
          const imgList = matched.image.split('<$>');
          imageUrl = imgList[0] || '';
          if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl;
          }
        }

        // Extract footprint display title
        let packageTitle = '';
        if (matched.footprint_info) {
          packageTitle = matched.footprint_info.display_title || matched.footprint_info.title || '';
        }

        const componentData = {
          c_code: matched.code || (kw.startsWith('C') ? kw.toUpperCase() : ''),
          mpn: matched.display_title || matched.title || matched.name || kw,
          name: matched.name || matched.title || '电子元器件',
          category: matched.catalogName || (matched.tags && matched.tags.child_tag && matched.tags.child_tag.name_cn) || '未分类',
          brand: matched.brandName || '',
          package_name: packageTitle,
          image_url: imageUrl,
          datasheet_url: matched.code ? `https://item.szlcsc.com/${matched.code.replace(/[^0-9]/g, '')}.html` : '',
          spec: '',
          raw_jlc: {
            id: matched.id,
            catalogId: matched.catalogId,
            brandId: matched.brandId,
            has3D: !!(matched.footprint_info && matched.footprint_info.model_3d)
          }
        };

        return componentData;
      }
    } catch (err) {
      lastError = err;
    }
  }

  // Fallback if not found in LCEDA API
  return {
    c_code: kw.toUpperCase().startsWith('C') ? kw.toUpperCase() : '',
    mpn: kw,
    name: kw,
    category: '通用元器件',
    brand: '',
    package_name: '',
    image_url: '',
    datasheet_url: kw.toUpperCase().startsWith('C') ? `https://item.szlcsc.com/${kw.replace(/[^0-9]/g, '')}.html` : '',
    spec: '',
    raw_jlc: null
  };
}

module.exports = {
  parseJlcQrCode,
  queryComponentByKeyword
};
