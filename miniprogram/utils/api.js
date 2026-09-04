/**
 * Universal Dual-Engine API Client (100% 永久免费单机 + 局域网自建服务)
 * 1. 本地单机独立引擎 (Local Storage, 100% 永久免费, 零成本零配置)
 * 2. 局域网/自建服务器引擎 (REST HTTP + SQLite, 局域网/内网穿透多端同步)
 */

const qrParser = require('./qrParser');
const { classifyComponent, decodeResistorSpec, decodeCapacitorSpec } = require('./classifier');

function getEngineMode() {
  return wx.getStorageSync('ENGINE_MODE') || 'local';
}

function setEngineMode(mode) {
  wx.setStorageSync('ENGINE_MODE', mode);
}

function getServerUrl() {
  const custom = wx.getStorageSync('SERVER_URL');
  return custom ? custom.replace(/\/+$/, '') : 'http://127.0.0.1:3000';
}

function setServerUrl(url) {
  let cleanUrl = url ? url.trim().replace(/\/+$/, '') : 'http://127.0.0.1:3000';
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'http://' + cleanUrl;
  }
  wx.setStorageSync('SERVER_URL', cleanUrl);
  return cleanUrl;
}

// Category to Book Mapping Helper (52+ Categories)
const CATEGORY_TO_BOOK_MAP = {
  // B01 贴片电阻册
  '贴片电阻': ['贴片电阻', '电阻', 'B01'],
  '电流采样电阻/分流器': ['贴片电阻', '电阻', 'B01'],
  '可调电阻/电位器': ['贴片电阻', '电阻', 'B01'],
  '自恢复保险丝': ['贴片电阻', '电阻', 'B01'],

  // B02 贴片电容册
  '贴片电容(MLCC)': ['贴片电容(MLCC)', '贴片电容', '电容', 'B02'],
  '固态电容': ['贴片电容(MLCC)', '贴片电容', '电容', 'B02'],
  '贴片型铝电解电容': ['贴片电容(MLCC)', '贴片电容', '电容', 'B02'],
  '磁珠': ['贴片电容(MLCC)', '贴片电容', '电容', 'B02'],
  '功率电感': ['贴片电容(MLCC)', '贴片电容', '电容', 'B02'],
  '共模滤波器': ['贴片电容(MLCC)', '贴片电容', '电容', 'B02'],

  // B03 二极管·三极管·MOS管册
  '通用二极管': ['三极管/MOS管', '分立半导体', 'B03'],
  '肖特基二极管': ['三极管/MOS管', '分立半导体', 'B03'],
  '稳压二极管': ['三极管/MOS管', '分立半导体', 'B03'],
  '静电和浪涌保护(TVS/ESD)': ['三极管/MOS管', '分立半导体', 'B03'],
  '三极管(BJT)': ['三极管/MOS管', '分立半导体', 'B03'],
  '场效应管(MOSFET)': ['三极管/MOS管', '分立半导体', 'B03'],
  '发光二极管/LED': ['三极管/MOS管', '分立半导体', 'B03'],
  'RGB LED': ['三极管/MOS管', '分立半导体', 'B03'],
  'RGB LED(内置IC)': ['三极管/MOS管', '分立半导体', 'B03'],
  '理想二极管/ORing控制器': ['三极管/MOS管', '分立半导体', 'B03'],

  // B04 常用IC与电源芯片册
  '线性稳压器(LDO)': ['线性稳压器(LDO)', '集成电路', 'B04'],
  'DC-DC电源芯片': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '单片机(MCU/MPU/SOC)': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '运算放大器': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '精密运放': ['线性稳压器(LDO)', '集成电路', 'B04'],
  'FET输入运放': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '555定时器/计时器': ['线性稳压器(LDO)', '集成电路', 'B04'],
  'NOR FLASH': ['线性稳压器(LDO)', '集成电路', 'B04'],
  'USB转换芯片': ['线性稳压器(LDO)', '集成电路', 'B04'],
  'WiFi模块': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '电池管理': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '电荷泵': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '电压基准芯片': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '快充协议芯片': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '触摸芯片': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '栅极驱动芯片': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '电流感应放大器': ['线性稳压器(LDO)', '集成电路', 'B04'],
  '信号开关/编解码器/多路复用器': ['线性稳压器(LDO)', '集成电路', 'B04'],

  // B05 开关与连接器插槽册
  '轻触开关': ['轻触开关', '开关连接器', 'B05'],
  '按键开关': ['轻触开关', '开关连接器', 'B05'],
  '拨码开关': ['轻触开关', '开关连接器', 'B05'],
  '滑动开关': ['轻触开关', '开关连接器', 'B05'],
  'USB连接器': ['轻触开关', '开关连接器', 'B05'],
  '线对板针座': ['轻触开关', '开关连接器', 'B05'],
  'FFC连接线(柔性扁平线缆)': ['轻触开关', '开关连接器', 'B05'],
  'SD卡/存储卡连接器': ['轻触开关', '开关连接器', 'B05'],
  '无源晶振': ['轻触开关', '开关连接器', 'B05'],
  '有源晶振': ['轻触开关', '开关连接器', 'B05'],
  '固态继电器(MOS输出)': ['轻触开关', '开关连接器', 'B05'],
  '信号继电器': ['轻触开关', '开关连接器', 'B05'],
  '温度传感器': ['轻触开关', '开关连接器', 'B05'],
  '人体感应传感器': ['轻触开关', '开关连接器', 'B05'],
  '未分类': ['轻触开关', '开关连接器', 'B05']
};

function matchBookForCategory(cat, books) {
  if (!books || books.length === 0) return null;
  if (!cat) return books[0];

  const targetKeywords = CATEGORY_TO_BOOK_MAP[cat] || [cat];
  for (const kw of targetKeywords) {
    const found = books.find(b => 
      (b.category && (b.category.includes(kw) || kw.includes(b.category))) ||
      (b.name && b.name.includes(kw)) ||
      (b.code && b.code.toUpperCase() === kw.toUpperCase())
    );
    if (found) return found;
  }
  return books[0];
}

// REST HTTP helper
function restRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = `${getServerUrl()}/api${path}`;
    wx.request({
      url,
      method,
      data,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error((res.data && res.data.msg) || `服务器响应错误 [${res.statusCode}]`));
        }
      },
      fail: (err) => {
        reject(new Error(`无法连接局域网服务器 (${err.errMsg})，请检查服务器是否启动及网络 IP！`));
      }
    });
  });
}

// ----------------------------------------------------
// Local Storage Helper
// ----------------------------------------------------
const LocalStorage = {
  _get(key, def = []) {
    try {
      const v = wx.getStorageSync(key);
      return v !== '' && v !== null && v !== undefined ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  },
  _set(key, val) {
    try {
      wx.setStorageSync(key, JSON.stringify(val));
    } catch (e) {}
  },
  initDefaults() {
    let books = this._get('LOCAL_BOOKS', null);
    if (!books || books.length === 0) {
      books = [
        { id: 'b1', name: '0603 贴片电阻专用册', code: 'B01', total_pages: 20, rows_per_page: 12, category: '贴片电阻', description: '标准0603贴片电阻专用册，每页12行' },
        { id: 'b2', name: '0805 贴片电容专用册', code: 'B02', total_pages: 20, rows_per_page: 12, category: '贴片电容(MLCC)', description: '标准0805/0603贴片电容专用册，每页12行' },
        { id: 'b3', name: '常用二极管与晶体管册', code: 'B03', total_pages: 15, rows_per_page: 12, category: '三极管/MOS管', description: 'SOT-23/SOD-123封装晶体管、MOS管与二极管' },
        { id: 'b4', name: '常用IC与电源芯片册', code: 'B04', total_pages: 15, rows_per_page: 12, category: '线性稳压器(LDO)', description: 'LDO、DC-DC、MCU主控与逻辑芯片' },
        { id: 'b5', name: '开关与连接器插槽册', code: 'B05', total_pages: 15, rows_per_page: 12, category: '轻触开关', description: '轻触按键、拨码开关、TF卡座与排针排母' }
      ];
      this._set('LOCAL_BOOKS', books);
    }
    let templates = this._get('LOCAL_TEMPLATES', null);
    if (!templates || templates.length === 0) {
      templates = [
        { id: 1, name: '样品册插槽标签 (30x10mm)', width_mm: 30, height_mm: 10, is_default: 1 },
        { id: 2, name: '标准元件盒标签 (40x20mm)', width_mm: 40, height_mm: 20, is_default: 0 },
        { id: 3, name: '大号抽屉标签 (50x30mm)', width_mm: 50, height_mm: 30, is_default: 0 }
      ];
      this._set('LOCAL_TEMPLATES', templates);
    }
  }
};
LocalStorage.initDefaults();

function formatProduct(p, kw) {
  if (!p) return null;
  let imageUrl = '';
  if (p.image) {
    const imgList = p.image.split('<$>');
    imageUrl = imgList[0] || '';
    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
  }

  let pkg = p.standard || p.package || (p.footprint_info ? (p.footprint_info.display_title || p.footprint_info.title || '') : '');
  if (pkg.length > 25 && p.standard) pkg = p.standard;

  let datasheet = '';
  if (p.pdfFileUrl) {
    datasheet = p.pdfFileUrl.startsWith('http') ? p.pdfFileUrl : 'https://item.szlcsc.com' + p.pdfFileUrl;
  } else if (p.code) {
    datasheet = `https://item.szlcsc.com/${p.code.replace(/[^0-9]/g, '')}.html`;
  }

  const mpn = p.model || p.display_title || p.name || kw || '';
  let spec = p.name || '';
  const rDec = decodeResistorSpec(mpn);
  const cDec = decodeCapacitorSpec(mpn);

  if (rDec) {
    spec = rDec.spec;
  } else if (cDec) {
    spec = cDec.spec;
  } else if (!spec || spec === mpn) {
    spec = pkg ? `${pkg} ${p.catalogName || ''}` : p.catalogName || '';
  }

  const derivedPkg = (rDec && !pkg) ? rDec.pkg : ((cDec && !pkg) ? cDec.pkg : pkg);

  return {
    c_code: p.code || (kw && kw.toUpperCase().startsWith('C') ? kw.toUpperCase() : ''),
    mpn: mpn,
    name: p.name || mpn,
    category: p.catalogName || '常用电子器件',
    brand: p.brandName || '',
    package_name: derivedPkg,
    spec: spec,
    image_url: imageUrl,
    datasheet_url: datasheet
  };
}

// Direct HTTP query to EasyEDA for fallback
function queryEasyEdaDirect(keyword) {
  return new Promise((resolve) => {
    wx.request({
      url: `https://pro.lceda.cn/api/eda/product/search?keyword=${encodeURIComponent(keyword)}`,
      method: 'GET',
      timeout: 8000,
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.result && res.data.result.productList && res.data.result.productList.length > 0) {
          const list = res.data.result.productList;
          const matched = list.find(p => p.code && p.code.toUpperCase() === keyword.toUpperCase()) || 
                          list.find(p => p.model && p.model.toUpperCase() === keyword.toUpperCase()) || 
                          list[0];

          const formatted = formatProduct(matched, keyword);
          const cl = classifyComponent(formatted);
          resolve({
            ...formatted,
            category: cl.category || formatted.category,
            package_name: cl.package_name || formatted.package_name,
            spec: cl.spec || formatted.spec,
            brand: cl.brand || formatted.brand
          });
          return;
        }
        resolve(null);
      },
      fail: () => resolve(null)
    });
  });
}

function doesComponentBelongToBook(comp, book) {
  if (!comp || !book) return false;
  const bId = String(book.id || book._id || '');
  const bCode = String(book.code || '');
  const cBookId = String(comp.book_id || '');
  const cLoc = String(comp.location_text || '');

  if (cBookId && (cBookId === bId || cBookId === bCode)) return true;
  if (bCode && (cLoc.startsWith(bCode) || cLoc.includes(bCode))) return true;
  return false;
}

// ----------------------------------------------------
// Unified API implementation (100% Free Local + REST)
// ----------------------------------------------------
const api = {
  getEngineMode,
  setEngineMode,
  getServerUrl,
  setServerUrl,
  matchBookForCategory,

  // JLC QR Parse
  async parseJlcQr(text) {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        const res = await restRequest('/components/parse-qr', 'POST', { text });
        if (res && res.success) {
          const comp = res.data.component;
          const cl = classifyComponent(comp);
          return {
            ...res,
            data: {
              ...res.data,
              component: {
                ...comp,
                category: cl.category || comp.category,
                package_name: cl.package_name || comp.package_name,
                spec: cl.spec || comp.spec,
                brand: cl.brand || comp.brand
              }
            }
          };
        }
      } catch (e) {}
    }

    // Local parser with smart classification & offline resistor/capacitor decoding
    const parsed = qrParser.parseJlcQrCode(text);
    if (!parsed) throw new Error('无法解析的条码格式');

    // Prefer cCode, then mpn for official lookup
    const queryKw = parsed.cCode || parsed.mpn;
    let comp = null;

    if (queryKw) {
      try {
        comp = await queryEasyEdaDirect(queryKw);
      } catch (e) {}
    }

    // If cCode didn't return a match, try mpn
    if (!comp && parsed.mpn && parsed.mpn !== queryKw) {
      try {
        comp = await queryEasyEdaDirect(parsed.mpn);
      } catch (e) {}
    }

    if (!comp) {
      // Check if we have this component in local DB already!
      const localExisting = await this.findExistingComponent(parsed.cCode, parsed.mpn);
      if (localExisting) {
        comp = {
          ...localExisting,
          inbound_qty: parsed.qty || localExisting.stock || 10,
          order_no: parsed.orderNo || localExisting.order_no || ''
        };
      } else {
        const fallbackRaw = {
          c_code: parsed.cCode || '',
          mpn: parsed.mpn || parsed.cCode || '电子元器件',
          name: parsed.mpn || parsed.cCode || '电子元器件',
          category: '',
          brand: '',
          package_name: '',
          image_url: '',
          inbound_qty: parsed.qty || 10,
          order_no: parsed.orderNo || ''
        };
        const cl = classifyComponent(fallbackRaw);
        comp = {
          ...fallbackRaw,
          category: cl.category || '常用电子器件',
          package_name: cl.package_name || '',
          spec: cl.spec || fallbackRaw.mpn,
          brand: cl.brand || '国产优质/通用'
        };
      }
    }

    const finalCCode = parsed.cCode || comp.c_code || '';
    const finalMpn = comp.mpn || parsed.mpn || finalCCode || '电子元器件';

    return {
      success: true,
      data: {
        qrInfo: parsed,
        component: {
          ...comp,
          c_code: finalCCode,
          mpn: finalMpn,
          inbound_qty: parsed.qty || comp.inbound_qty || 10,
          order_no: parsed.orderNo || comp.order_no || ''
        }
      }
    };
  },

  // JLC Online Search (Single Best Match)
  async searchJlc(keyword) {
    const candidates = await this.searchJlcCandidates(keyword);
    if (candidates && candidates.length > 0) {
      return { success: true, data: candidates[0] };
    }

    const raw = {
      c_code: keyword.toUpperCase().startsWith('C') ? keyword.toUpperCase() : '',
      mpn: keyword,
      name: keyword,
      category: '',
      brand: '',
      package_name: '',
      image_url: '',
      datasheet_url: '',
      spec: ''
    };
    const cl = classifyComponent(raw);
    return {
      success: true,
      data: {
        ...raw,
        category: cl.category,
        package_name: cl.package_name,
        spec: cl.spec,
        brand: cl.brand
      }
    };
  },

  // JLC Online Search Candidates List
  async searchJlcCandidates(keyword) {
    const kw = (keyword || '').trim();
    if (!kw) return [];

    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        const res = await restRequest(`/components/search-jlc?keyword=${encodeURIComponent(kw)}`);
        if (res && res.success && res.data) {
          return [res.data];
        }
      } catch (e) {}
    }

    return new Promise((resolve) => {
      wx.request({
        url: `https://pro.lceda.cn/api/eda/product/search?keyword=${encodeURIComponent(kw)}`,
        method: 'GET',
        timeout: 8000,
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.result && res.data.result.productList) {
            const list = res.data.result.productList.slice(0, 10).map(p => {
              const formatted = formatProduct(p, kw);
              const cl = classifyComponent(formatted);
              return {
                ...formatted,
                category: cl.category || formatted.category,
                package_name: cl.package_name || formatted.package_name,
                spec: cl.spec || formatted.spec,
                brand: cl.brand || formatted.brand
              };
            });
            resolve(list);
            return;
          }
          resolve([]);
        },
        fail: () => resolve([])
      });
    });
  },

  // Dashboard Summary
  async getDashboard() {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        return await restRequest('/components/dashboard');
      } catch (e) {}
    }

    // Local Storage Dashboard
    const comps = LocalStorage._get('LOCAL_COMPS', []);
    const books = LocalStorage._get('LOCAL_BOOKS', []);
    const logs = LocalStorage._get('LOCAL_LOGS', []);

    let totalStock = 0;
    let lowStockCount = 0;
    const lowStockList = [];

    comps.forEach(c => {
      totalStock += Number(c.stock) || 0;
      if ((Number(c.stock) || 0) <= (Number(c.safe_stock) || 5)) {
        lowStockCount++;
        lowStockList.push(c);
      }
    });

    return {
      success: true,
      data: {
        total_components: comps.length,
        total_stock: totalStock,
        low_stock_count: lowStockCount,
        total_books: books.length,
        recent_logs: logs.slice(0, 8),
        low_stock_list: lowStockList.slice(0, 8)
      }
    };
  },

  // Get Components List
  async getComponents(params = {}) {
    const { keyword, category, low_stock } = params;
    const mode = getEngineMode();

    if (mode === 'rest') {
      try {
        const q = [];
        if (keyword) q.push(`keyword=${encodeURIComponent(keyword)}`);
        if (category) q.push(`category=${encodeURIComponent(category)}`);
        if (low_stock) q.push(`low_stock=${low_stock}`);
        const qs = q.length > 0 ? `?${q.join('&')}` : '';
        const res = await restRequest(`/components${qs}`);
        if (res && res.data && res.data.list) {
          res.data.list = res.data.list.map(c => {
            const cl = classifyComponent(c);
            return {
              ...c,
              category: c.category && c.category !== '常用电子器件' ? c.category : (cl.category || c.category),
              package_name: c.package_name || cl.package_name,
              spec: (!c.spec || c.spec === c.mpn || c.spec === '常用电子器件' || c.spec === '贴片电阻') ? cl.spec : c.spec,
              brand: (c.brand && c.brand !== '国产优质/通用') ? c.brand : (cl.brand || c.brand)
            };
          });
        }
        return res;
      } catch (e) {}
    }

    // Local Storage
    let list = LocalStorage._get('LOCAL_COMPS', []);
    list = list.map(c => {
      const cl = classifyComponent(c);
      return {
        ...c,
        category: c.category && c.category !== '常用电子器件' ? c.category : (cl.category || c.category),
        package_name: c.package_name || cl.package_name,
        spec: (!c.spec || c.spec === c.mpn || c.spec === '常用电子器件' || c.spec === '贴片电阻') ? cl.spec : c.spec,
        brand: (c.brand && c.brand !== '国产优质/通用') ? c.brand : (cl.brand || c.brand)
      };
    });

    if (keyword) {
      const kw = keyword.toLowerCase().trim();
      list = list.filter(c => 
        (c.c_code && c.c_code.toLowerCase().includes(kw)) ||
        (c.mpn && c.mpn.toLowerCase().includes(kw)) ||
        (c.name && c.name.toLowerCase().includes(kw)) ||
        (c.package_name && c.package_name.toLowerCase().includes(kw)) ||
        (c.location_text && c.location_text.toLowerCase().includes(kw)) ||
        (c.spec && c.spec.toLowerCase().includes(kw)) ||
        (c.brand && c.brand.toLowerCase().includes(kw))
      );
    }
    if (category) {
      list = list.filter(c => c.category === category);
    }
    if (low_stock === '1' || low_stock === 'true') {
      list = list.filter(c => (Number(c.stock) || 0) <= (Number(c.safe_stock) || 5));
    }

    return {
      success: true,
      data: { list, total: list.length }
    };
  },

  // Check if component already exists
  async findExistingComponent(cCode, mpn) {
    const res = await this.getComponents();
    const list = (res.data && res.data.list) || [];
    const cleanC = cCode ? String(cCode).trim().toUpperCase() : '';
    const cleanMpn = mpn ? String(mpn).trim().toUpperCase() : '';
    const pureC = cleanC.replace(/^C/i, '');

    return list.find(c => {
      const itemC = (c.c_code || '').trim().toUpperCase();
      const itemMpn = (c.mpn || '').trim().toUpperCase();
      const pureItemC = itemC.replace(/^C/i, '');

      // 1. Direct C-code match (with or without 'C' prefix)
      if (cleanC && itemC && cleanC === itemC) return true;
      if (pureC && pureItemC && pureC === pureItemC) return true;

      // 2. Direct MPN match
      if (cleanMpn && itemMpn && cleanMpn === itemMpn) return true;

      // 3. Cross match (in case user stored c_code in mpn or vice-versa)
      if (cleanC && itemMpn && cleanC === itemMpn) return true;
      if (cleanMpn && itemC && cleanMpn === itemC) return true;

      return false;
    }) || null;
  },

  // Search single component detail from EasyEDA (returns official imageUrl, etc.)
  async searchJlcProductDetail(keyword) {
    const kw = (keyword || '').trim();
    if (!kw) return null;
    return await queryEasyEdaDirect(kw);
  },

  // Get Component Categories Summary
  async getCategories() {
    const compsRes = await this.getComponents();
    const comps = (compsRes.data && compsRes.data.list) || [];
    const catMap = {};
    comps.forEach(c => {
      if (c.category) {
        catMap[c.category] = (catMap[c.category] || 0) + 1;
      }
    });
    const categories = Object.keys(catMap).map(k => ({ category: k, count: catMap[k] }));
    return { success: true, data: categories };
  },

  // Get Single Component Detail
  async getComponentDetail(id) {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        const res = await restRequest(`/components/${id}`);
        if (res && res.data) {
          const comp = res.data;
          const cl = classifyComponent(comp);
          return {
            success: true,
            data: {
              ...comp,
              category: comp.category && comp.category !== '常用电子器件' ? comp.category : (cl.category || comp.category),
              package_name: comp.package_name || cl.package_name,
              spec: (!comp.spec || comp.spec === comp.mpn || comp.spec === '常用电子器件' || comp.spec === '贴片电阻') ? cl.spec : comp.spec,
              brand: (comp.brand && comp.brand !== '国产优质/通用') ? comp.brand : (cl.brand || comp.brand)
            }
          };
        }
      } catch (e) {}
    }

    // Local
    const comps = LocalStorage._get('LOCAL_COMPS', []);
    const comp = comps.find(c => String(c.id) === String(id) || String(c._id) === String(id));
    if (!comp) throw new Error('元器件未找到');
    const logs = LocalStorage._get('LOCAL_LOGS', []).filter(l => String(l.component_id) === String(id));

    const cl = classifyComponent(comp);
    const enrichedComp = {
      ...comp,
      category: comp.category && comp.category !== '常用电子器件' ? comp.category : (cl.category || comp.category),
      package_name: comp.package_name || cl.package_name,
      spec: (!comp.spec || comp.spec === comp.mpn || comp.spec === '常用电子器件' || comp.spec === '贴片电阻') ? cl.spec : comp.spec,
      brand: (comp.brand && comp.brand !== '国产优质/通用') ? comp.brand : (cl.brand || comp.brand)
    };

    return {
      success: true,
      data: {
        ...enrichedComp,
        logs
      }
    };
  },

  // Create Component with Automatic Sample Book Slot Allocation
  async createComponent(data) {
    const mode = getEngineMode();
    const now = new Date().toLocaleDateString();
    const cl = classifyComponent(data);

    // Determine slot and sample book
    let bookId = data.book_id;
    let pageNo = Number(data.page_no) || 0;
    let rowNo = Number(data.row_no) || 0;
    let locText = data.location_text || '';

    if (locText && (!pageNo || !rowNo)) {
      const match = locText.match(/([A-Za-z0-9]+)-P(\d+)-R(\d+)/i);
      if (match) {
        const bookCode = match[1].toUpperCase();
        pageNo = parseInt(match[2], 10);
        rowNo = parseInt(match[3], 10);
        if (!bookId) {
          const booksRes = await this.getBooks();
          const foundBook = (booksRes.data || []).find(b => b.code && b.code.toUpperCase() === bookCode);
          if (foundBook) bookId = foundBook.id || foundBook._id;
        }
      }
    }

    if (!pageNo || !rowNo || !bookId) {
      const booksRes = await this.getBooks();
      const books = booksRes.data || [];
      const cat = cl.category || data.category || '';
      const targetBook = matchBookForCategory(cat, books) || books[0];
      if (targetBook) {
        bookId = targetBook.id || targetBook._id;
        const slotRes = await this.getBookNextEmpty(bookId);
        if (slotRes && slotRes.success && slotRes.data && !slotRes.data.is_full) {
          pageNo = slotRes.data.page_no;
          rowNo = slotRes.data.row_no;
          locText = slotRes.data.location_text;
        } else {
          pageNo = 1;
          rowNo = 1;
          locText = `${targetBook.code || 'B01'}-P01-R01`;
        }
      }
    }

    let imageUrl = data.image_url || '';
    if (!imageUrl && (data.c_code || data.mpn)) {
      const comps = LocalStorage._get('LOCAL_COMPS', []);
      const matchInComps = comps.find(c => c.image_url && (
        (data.c_code && c.c_code && c.c_code.toUpperCase() === data.c_code.toUpperCase()) ||
        (data.mpn && c.mpn && c.mpn.toUpperCase() === data.mpn.toUpperCase())
      ));
      if (matchInComps && matchInComps.image_url) {
        imageUrl = matchInComps.image_url;
      }
    }

    const item = {
      ...data,
      category: cl.category || data.category || '常用电子器件',
      package_name: cl.package_name || data.package_name || '',
      spec: cl.spec || data.spec || data.name || '',
      brand: cl.brand || data.brand || '国产优质/通用',
      image_url: imageUrl,
      book_id: bookId || '',
      page_no: pageNo,
      row_no: rowNo,
      col_no: Number(data.col_no) || 1,
      location_text: locText,
      stock: Number(data.stock) || 0,
      safe_stock: Number(data.safe_stock) || 5,
      created_at: data.created_at || now,
      updated_at: now
    };

    if (mode === 'rest') {
      try {
        const res = await restRequest('/components', 'POST', item);
        return res;
      } catch (e) {}
    }

    // Local
    const comps = LocalStorage._get('LOCAL_COMPS', []);
    const newId = 'c_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    item.id = newId;
    item._id = newId;
    comps.unshift(item);
    LocalStorage._set('LOCAL_COMPS', comps);

    if (item.stock > 0) {
      const logs = LocalStorage._get('LOCAL_LOGS', []);
      logs.unshift({
        id: 'l_' + Date.now(),
        component_id: newId,
        name: item.name,
        mpn: item.mpn,
        c_code: item.c_code,
        location_text: item.location_text,
        type: 'IN',
        change_qty: item.stock,
        balance_qty: item.stock,
        order_no: item.order_no || '',
        remark: '初始入库',
        created_at: now
      });
      LocalStorage._set('LOCAL_LOGS', logs);
    }

    return { success: true, data: item };
  },

  // Update Component
  async updateComponent(id, data) {
    const mode = getEngineMode();
    const now = new Date().toLocaleDateString();

    if (mode === 'rest') {
      try {
        const res = await restRequest(`/components/${id}`, 'PUT', data);
        return res;
      } catch (e) {}
    }

    let comps = LocalStorage._get('LOCAL_COMPS', []);
    let updatedItem = null;
    comps = comps.map(c => {
      if (String(c.id) === String(id) || String(c._id) === String(id)) {
        updatedItem = { ...c, ...data, updated_at: now };
        return updatedItem;
      }
      return c;
    });
    LocalStorage._set('LOCAL_COMPS', comps);

    return { success: true, msg: '修改成功' };
  },

  // Delete Single Component
  async deleteComponent(id) {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        return await restRequest(`/components/${id}`, 'DELETE');
      } catch (e) {}
    }

    let comps = LocalStorage._get('LOCAL_COMPS', []);
    comps = comps.filter(c => String(c.id) !== String(id) && String(c._id) !== String(id));
    LocalStorage._set('LOCAL_COMPS', comps);
    return { success: true, msg: '已删除' };
  },

  // Batch Delete Components
  async deleteComponentsBatch(ids = []) {
    if (!ids || ids.length === 0) return { success: true, count: 0 };
    const mode = getEngineMode();
    const idSet = new Set(ids.map(i => String(i)));

    if (mode === 'rest') {
      try {
        return await restRequest('/components/batch-delete', 'POST', { ids });
      } catch (e) {}
    }

    let comps = LocalStorage._get('LOCAL_COMPS', []);
    const initialLen = comps.length;
    comps = comps.filter(c => !idSet.has(String(c.id)) && !idSet.has(String(c._id)));
    LocalStorage._set('LOCAL_COMPS', comps);
    return { success: true, count: initialLen - comps.length };
  },

  // Containers (Sample Books & X*X Component Boxes)
  async getBooks() {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        return await restRequest('/books');
      } catch (e) {}
    }

    const defaultContainers = [
      { id: 'b_1', name: '0603 贴片电阻专用册', code: 'B01', type: 'book', total_pages: 20, rows_per_page: 12, category: '贴片电阻' },
      { id: 'b_2', name: '0603 贴片电容专用册', code: 'B02', type: 'book', total_pages: 20, rows_per_page: 12, category: '贴片电容' },
      { id: 'box_1', name: '1号 4×6 常用贴片盒', code: 'BOX01', type: 'box', grid_rows: 4, grid_cols: 6, category: '常用元器件' },
      { id: 'box_2', name: '2号 3×4 芯片抽屉柜', code: 'BOX02', type: 'box', grid_rows: 3, grid_cols: 4, category: '芯片/集成电路' },
      { id: 'b_3', name: '0805/1206 贴片阻容样品册', code: 'B03', type: 'book', total_pages: 20, rows_per_page: 12, category: '贴片电阻' },
      { id: 'b_4', name: '常用贴片芯片/二三极管样品册', code: 'B04', type: 'book', total_pages: 20, rows_per_page: 12, category: '二极管' },
      { id: 'b_5', name: '轻触按键与常用连接器插槽册', code: 'B05', type: 'book', total_pages: 20, rows_per_page: 12, category: '轻触开关' }
    ];

    let books = LocalStorage._get('LOCAL_BOOKS', null);
    if (!books || books.length === 0) {
      books = defaultContainers;
      LocalStorage._set('LOCAL_BOOKS', books);
    }

    const comps = LocalStorage._get('LOCAL_COMPS', []);
    const formatted = books.map(b => {
      const isBox = b.type === 'box';
      const used = comps.filter(c => doesComponentBelongToBook(c, b)).length;
      const total = isBox 
        ? ((Number(b.grid_rows) || 3) * (Number(b.grid_cols) || 4)) 
        : ((Number(b.total_pages) || 20) * (Number(b.rows_per_page) || 12));
      return {
        ...b,
        type: b.type || 'book',
        total_slots: total,
        used_slots: used,
        empty_slots: Math.max(0, total - used),
        usage_percent: total > 0 ? Math.round((used / total) * 100) : 0
      };
    });
    return { success: true, data: formatted };
  },

  // Container Page or Grid View
  async getBookPage(bookId, pageNo) {
    const pNo = Number(pageNo) || 1;
    const mode = getEngineMode();

    if (mode === 'rest') {
      try {
        return await restRequest(`/books/${bookId}/page/${pNo}`);
      } catch (e) {}
    }

    const booksRes = await this.getBooks();
    const book = (booksRes.data || []).find(b => String(b.id) === String(bookId) || String(b._id) === String(bookId) || String(b.code) === String(bookId));
    const compsRes = await this.getComponents();
    const comps = (compsRes.data && compsRes.data.list) || [];

    if (!book) return { success: false, msg: '未找到该仓位容器' };

    const isBox = book.type === 'box';
    if (isBox) {
      const gridRows = Number(book.grid_rows) || 3;
      const gridCols = Number(book.grid_cols) || 4;
      const boxComps = comps.filter(c => doesComponentBelongToBook(c, book));

      const slotGrid = [];
      for (let r = 1; r <= gridRows; r++) {
        for (let c = 1; c <= gridCols; c++) {
          const comp = boxComps.find(item => {
            if (Number(item.row_no) === r && Number(item.col_no) === c) return true;
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

      return {
        success: true,
        data: {
          book,
          is_box: true,
          grid_rows: gridRows,
          grid_cols: gridCols,
          total_slots: gridRows * gridCols,
          slots: slotGrid
        }
      };
    }

    // Sample Book: Page Rows
    const pageComps = comps.filter(c => 
      doesComponentBelongToBook(c, book) && Number(c.page_no) === pNo
    );

    const rowsCount = Number(book.rows_per_page) || 12;
    const slotMap = [];
    for (let r = 1; r <= rowsCount; r++) {
      const found = pageComps.find(c => Number(c.row_no) === r);
      slotMap.push({
        row_no: r,
        is_empty: !found,
        component: found || null
      });
    }

    return {
      success: true,
      data: {
        book,
        is_box: false,
        page_no: pNo,
        total_pages: Number(book.total_pages) || 20,
        rows_per_page: rowsCount,
        slots: slotMap
      }
    };
  },

  // Next Empty Slot in Container
  async getBookNextEmpty(bookId) {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        return await restRequest(`/books/${bookId}/next-empty`);
      } catch (e) {}
    }

    const booksRes = await this.getBooks();
    const books = booksRes.data || [];
    const book = books.find(b => String(b.id) === String(bookId) || String(b._id) === String(bookId) || String(b.code) === String(bookId)) || books[0];
    if (!book) return { success: false, msg: '未找到仓位容器' };

    const compsRes = await this.getComponents();
    const comps = (compsRes.data && compsRes.data.list) || [];
    const bookComps = comps.filter(c => doesComponentBelongToBook(c, book));

    const isBox = book.type === 'box';
    if (isBox) {
      const gridRows = Number(book.grid_rows) || 3;
      const gridCols = Number(book.grid_cols) || 4;
      const occupiedSet = new Set();
      bookComps.forEach(c => {
        if (c.row_no && c.col_no) {
          occupiedSet.add(`${Number(c.row_no)}_${Number(c.col_no)}`);
        }
        if (c.location_text) {
          const m = c.location_text.match(/R(\d+)-C(\d+)/i);
          if (m) occupiedSet.add(`${parseInt(m[1], 10)}_${parseInt(m[2], 10)}`);
        }
      });

      for (let r = 1; r <= gridRows; r++) {
        for (let c = 1; c <= gridCols; c++) {
          if (!occupiedSet.has(`${r}_${c}`)) {
            const locText = `${book.code || 'BOX01'}-R${String(r).padStart(2, '0')}-C${String(c).padStart(2, '0')}`;
            return {
              success: true,
              data: {
                book_id: book.id || book._id,
                book_name: book.name,
                book_code: book.code,
                book_type: 'box',
                row_no: r,
                col_no: c,
                location_text: locText
              }
            };
          }
        }
      }

      return { 
        success: true, 
        data: { 
          is_full: true,
          msg: `元件盒【${book.name}】已存满 (${gridRows * gridCols}格)`
        } 
      };
    }

    // Book type
    const occupiedSet = new Set();
    bookComps.forEach(c => {
      if (c.page_no && c.row_no) {
        occupiedSet.add(`${Number(c.page_no)}_${Number(c.row_no)}`);
      }
      if (c.location_text) {
        const m = c.location_text.match(/P(\d+)-R(\d+)/i);
        if (m) {
          occupiedSet.add(`${parseInt(m[1], 10)}_${parseInt(m[2], 10)}`);
        }
      }
    });

    const totalPages = Number(book.total_pages) || 20;
    const rowsPerPage = Number(book.rows_per_page) || 12;

    for (let p = 1; p <= totalPages; p++) {
      for (let r = 1; r <= rowsPerPage; r++) {
        if (!occupiedSet.has(`${p}_${r}`)) {
          const locText = `${book.code || 'B01'}-P${String(p).padStart(2, '0')}-R${String(r).padStart(2, '0')}`;
          return {
            success: true,
            data: {
              book_id: book.id || book._id,
              book_name: book.name,
              book_code: book.code,
              book_type: 'book',
              page_no: p,
              row_no: r,
              location_text: locText
            }
          };
        }
      }
    }

    return { success: true, data: { is_full: true, msg: '该样品册已存满' } };
  },

  // Create Container (Sample book or X*X Component box)
  async createBook(data) {
    const mode = getEngineMode();
    const type = data.type || (data.grid_rows ? 'box' : 'book');
    const container = {
      ...data,
      type,
      total_pages: Number(data.total_pages) || 20,
      rows_per_page: Number(data.rows_per_page) || 12,
      grid_rows: Number(data.grid_rows) || 3,
      grid_cols: Number(data.grid_cols) || 4,
      created_at: new Date().toLocaleDateString()
    };

    if (mode === 'rest') {
      try {
        return await restRequest('/books', 'POST', container);
      } catch (e) {}
    }

    const books = LocalStorage._get('LOCAL_BOOKS', []);
    container.id = (type === 'box' ? 'box_' : 'b_') + Date.now();
    books.push(container);
    LocalStorage._set('LOCAL_BOOKS', books);
    return { success: true, data: container };
  },

  // Delete Container
  async deleteBook(bookId) {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        return await restRequest(`/books/${bookId}`, 'DELETE');
      } catch (e) {}
    }

    let books = LocalStorage._get('LOCAL_BOOKS', []);
    books = books.filter(b => String(b.id) !== String(bookId) && String(b._id) !== String(bookId));
    LocalStorage._set('LOCAL_BOOKS', books);
    return { success: true, msg: '容器已删除' };
  },

  // Stock Operations
  async stockIn(data) {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        return await restRequest('/stock/in', 'POST', data);
      } catch (e) {}
    }

    const { component_id, qty, remark = '补充入库', order_no = '' } = data;
    const addQty = Number(qty);
    const detail = await this.getComponentDetail(component_id);
    const comp = detail.data;
    const newStock = Number(comp.stock) + addQty;
    const now = new Date().toLocaleDateString();

    let comps = LocalStorage._get('LOCAL_COMPS', []);
    comps = comps.map(c => (String(c.id) === String(component_id) || String(c._id) === String(component_id)) ? { ...c, stock: newStock, updated_at: now } : c);
    LocalStorage._set('LOCAL_COMPS', comps);

    const logs = LocalStorage._get('LOCAL_LOGS', []);
    logs.unshift({
      id: 'l_' + Date.now(),
      component_id,
      name: comp.name,
      mpn: comp.mpn,
      type: 'IN',
      change_qty: addQty,
      balance_qty: newStock,
      order_no: order_no || comp.order_no || '',
      remark,
      created_at: now
    });
    LocalStorage._set('LOCAL_LOGS', logs);

    return { success: true, msg: `入库成功，当前库存：${newStock}` };
  },

  async stockOut(data) {
    const mode = getEngineMode();
    const { component_id, qty, remark = '项目领料' } = data;
    const outQty = Number(qty);
    const detail = await this.getComponentDetail(component_id);
    const comp = detail.data;
    if (Number(comp.stock) < outQty) {
      throw new Error(`库存不足！当前库存仅 ${comp.stock}`);
    }
    const newStock = Number(comp.stock) - outQty;
    const now = new Date().toLocaleDateString();

    if (mode === 'rest') {
      try {
        return await restRequest('/stock/out', 'POST', data);
      } catch (e) {}
    }

    let comps = LocalStorage._get('LOCAL_COMPS', []);
    comps = comps.map(c => (String(c.id) === String(component_id) || String(c._id) === String(component_id)) ? { ...c, stock: newStock, updated_at: now } : c);
    LocalStorage._set('LOCAL_COMPS', comps);

    const logs = LocalStorage._get('LOCAL_LOGS', []);
    logs.unshift({
      id: 'l_' + Date.now(),
      component_id,
      name: comp.name,
      mpn: comp.mpn,
      type: 'OUT',
      change_qty: -outQty,
      balance_qty: newStock,
      remark,
      created_at: now
    });
    LocalStorage._set('LOCAL_LOGS', logs);

    return { success: true, msg: `领料成功，剩余库存：${newStock}` };
  },

  async stockSet(data) {
    const mode = getEngineMode();
    const { component_id, stock, remark = '盘点校准' } = data;
    const newStock = Number(stock);
    const detail = await this.getComponentDetail(component_id);
    const comp = detail.data;
    const diff = newStock - Number(comp.stock);
    const now = new Date().toLocaleDateString();

    if (mode === 'rest') {
      try {
        const res = await restRequest('/stock/adjust', 'POST', data);
        return res;
      } catch (e) {}
    }

    let comps = LocalStorage._get('LOCAL_COMPS', []);
    comps = comps.map(c => (String(c.id) === String(component_id) || String(c._id) === String(component_id)) ? { ...c, stock: newStock, updated_at: now } : c);
    LocalStorage._set('LOCAL_COMPS', comps);

    const logs = LocalStorage._get('LOCAL_LOGS', []);
    logs.unshift({
      id: 'l_' + Date.now(),
      component_id,
      name: comp.name,
      mpn: comp.mpn,
      type: 'ADJUST',
      change_qty: diff,
      balance_qty: newStock,
      remark,
      created_at: now
    });
    LocalStorage._set('LOCAL_LOGS', logs);

    return { success: true, msg: `校准成功，当前库存：${newStock}` };
  },

  async getTemplates() {
    const mode = getEngineMode();
    if (mode === 'rest') {
      try {
        return await restRequest('/templates');
      } catch (e) {}
    }
    return {
      success: true,
      data: LocalStorage._get('LOCAL_TEMPLATES', [
        { id: 1, name: '样品册插槽标签 (30x10mm)', width_mm: 30, height_mm: 10, is_default: 1 },
        { id: 2, name: '标准元件盒标签 (40x20mm)', width_mm: 40, height_mm: 20, is_default: 0 },
        { id: 3, name: '大号抽屉标签 (50x30mm)', width_mm: 50, height_mm: 30, is_default: 0 }
      ])
    };
  }
};

module.exports = api;
