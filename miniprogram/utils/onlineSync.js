/**
 * Online Spreadsheet & Feishu Bitable Real-time Synchronization Module
 * 在线表格与飞书多维表格 100% 免费实时同步模块
 * 1. 飞书开放平台多维表格 API 模式 (100% 永久免费，直接读写修改多维表格数据行，无需付费自动化)
 * 2. 飞书群机器人 / 通用 Webhook 模式 (接收实时卡片与台账通知)
 */

const STORAGE_KEYS = {
  ENABLED: 'ONLINE_SYNC_ENABLED',
  SYNC_MODE: 'ONLINE_SYNC_MODE', // 'feishu_bitable_api' | 'webhook'
  WEBHOOK_URL: 'ONLINE_SYNC_WEBHOOK_URL',
  FEISHU_APP_ID: 'ONLINE_SYNC_FEISHU_APP_ID',
  FEISHU_APP_SECRET: 'ONLINE_SYNC_FEISHU_APP_SECRET',
  FEISHU_APP_TOKEN: 'ONLINE_SYNC_FEISHU_APP_TOKEN',
  FEISHU_TABLE_ID: 'ONLINE_SYNC_FEISHU_TABLE_ID'
};

function getSyncConfig() {
  return {
    enabled: wx.getStorageSync(STORAGE_KEYS.ENABLED) === true || wx.getStorageSync(STORAGE_KEYS.ENABLED) === 'true',
    syncMode: wx.getStorageSync(STORAGE_KEYS.SYNC_MODE) || 'feishu_bitable_api',
    webhookUrl: wx.getStorageSync(STORAGE_KEYS.WEBHOOK_URL) || 'https://open.feishu.cn/open-apis/bot/v2/hook/f4459919-ec87-4db0-b86f-3f2e9a139f01',
    feishuAppId: wx.getStorageSync(STORAGE_KEYS.FEISHU_APP_ID) || '',
    feishuAppSecret: wx.getStorageSync(STORAGE_KEYS.FEISHU_APP_SECRET) || '',
    feishuAppToken: wx.getStorageSync(STORAGE_KEYS.FEISHU_APP_TOKEN) || 'YXgxbYlJSatOnvsQzDNcW7JQnng',
    feishuTableId: wx.getStorageSync(STORAGE_KEYS.FEISHU_TABLE_ID) || ''
  };
}

function saveSyncConfig(cfg = {}) {
  if (cfg.enabled !== undefined) wx.setStorageSync(STORAGE_KEYS.ENABLED, Boolean(cfg.enabled));
  if (cfg.syncMode !== undefined) wx.setStorageSync(STORAGE_KEYS.SYNC_MODE, cfg.syncMode);
  if (cfg.webhookUrl !== undefined) wx.setStorageSync(STORAGE_KEYS.WEBHOOK_URL, cfg.webhookUrl.trim());
  if (cfg.feishuAppId !== undefined) wx.setStorageSync(STORAGE_KEYS.FEISHU_APP_ID, cfg.feishuAppId.trim());
  if (cfg.feishuAppSecret !== undefined) wx.setStorageSync(STORAGE_KEYS.FEISHU_APP_SECRET, cfg.feishuAppSecret.trim());
  if (cfg.feishuAppToken !== undefined) {
    let token = cfg.feishuAppToken.trim();
    // Auto-extract app_token if user pasted the full URL like https://www.feishu.cn/app/YXgxbYlJSatOnvsQzDNcW7JQnng...
    const match = token.match(/\/app\/([a-zA-Z0-9_-]+)/) || token.match(/\/base\/([a-zA-Z0-9_-]+)/);
    if (match) token = match[1];
    wx.setStorageSync(STORAGE_KEYS.FEISHU_APP_TOKEN, token);
  }
  if (cfg.feishuTableId !== undefined) wx.setStorageSync(STORAGE_KEYS.FEISHU_TABLE_ID, cfg.feishuTableId.trim());
}

/**
 * Universal HTTP Dispatcher with Server Proxy Fallback
 */
function sendHttpRequest({ url, method = 'POST', data = {}, timeout = 10000, header = {} }) {
  const serverUrl = wx.getStorageSync('SERVER_URL') || 'http://127.0.0.1:3000';
  const engineMode = wx.getStorageSync('ENGINE_MODE') || 'local';

  return new Promise((resolve, reject) => {
    // 1. If in REST engine mode, directly use backend proxy to 100% bypass WeChat domain whitelist
    if (engineMode === 'rest') {
      wx.request({
        url: `${serverUrl}/api/sync/webhook`,
        method: 'POST',
        data: { url, data, method, header },
        timeout,
        header: { 'Content-Type': 'application/json' },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: res.data });
          } else {
            reject(new Error(`后端代理推送失败: 状态码 ${res.statusCode} (${JSON.stringify(res.data)})`));
          }
        },
        fail: () => {
          tryDirectRequest();
        }
      });
      return;
    }

    // 2. Direct wx.request
    tryDirectRequest();

    function tryDirectRequest() {
      wx.request({
        url,
        method,
        data,
        timeout,
        header: { 'Content-Type': 'application/json', ...header },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: res.data });
          } else {
            reject(new Error(`HTTP 状态码 ${res.statusCode}: ${JSON.stringify(res.data || '')}`));
          }
        },
        fail: (err) => {
          const errMsg = err.errMsg || '';
          if (errMsg.includes('domain list') || errMsg.includes('url not in domain list')) {
            reject(new Error(`[微信域名限制] 请在微信右上角【···】中点击【开发调试/打开调试】以放行域名！`));
          } else {
            reject(new Error(`网络请求失败: ${errMsg}`));
          }
        }
      });
    }
  });
}

/**
 * Get Feishu tenant_access_token (100% Free Open Platform API)
 */
async function getFeishuTenantToken(appId, appSecret) {
  const cfg = getSyncConfig();
  const id = appId || cfg.feishuAppId;
  const secret = appSecret || cfg.feishuAppSecret;

  if (!id || !secret) {
    throw new Error('请先在【设置】中填写飞书 App ID 和 App Secret！');
  }

  // Check cache
  const cached = wx.getStorageSync('CACHED_FEISHU_TOKEN');
  if (cached && cached.token && cached.expireAt > Date.now() + 60000) {
    return cached.token;
  }

  const res = await sendHttpRequest({
    url: 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST',
    data: { app_id: id, app_secret: secret }
  });

  const body = res.data || {};
  if (body.code === 0 && body.tenant_access_token) {
    wx.setStorageSync('CACHED_FEISHU_TOKEN', {
      token: body.tenant_access_token,
      expireAt: Date.now() + (body.expire || 7200) * 1000
    });
    return body.tenant_access_token;
  }

  throw new Error(`获取飞书凭证失败: ${body.msg || JSON.stringify(body)}`);
}

/**
 * Get Table ID from Bitable App (Auto-select first table if not specified)
 */
async function getFeishuTableId(token, appToken) {
  const cfg = getSyncConfig();
  if (cfg.feishuTableId) return cfg.feishuTableId;

  const targetAppToken = appToken || cfg.feishuAppToken;
  const res = await sendHttpRequest({
    url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${targetAppToken}/tables`,
    method: 'GET',
    header: { 'Authorization': `Bearer ${token}` }
  });

  const body = res.data || {};
  if (body.code === 0 && body.data && body.data.items && body.data.items.length > 0) {
    const tableId = body.data.items[0].table_id;
    saveSyncConfig({ feishuTableId: tableId });
    return tableId;
  }

  throw new Error(`获取多维表格数据表失败，请检查 App Token 是否正确或应用是否有权限访问该表格`);
}

/**
 * Sync Single Stock Event to Feishu Bitable (Direct Row Add / Update - 100% Free)
 */
async function syncToFeishuBitableDirect(comp, balanceQty, changeQty, eventTitle) {
  const cfg = getSyncConfig();
  const token = await getFeishuTenantToken();
  const tableId = await getFeishuTableId(token, cfg.feishuAppToken);

  const fields = {
    '大类': comp.category || '未分类',
    '厂家型号(PM)': comp.mpn || comp.name || '',
    '立创编号(PC)': comp.c_code || '',
    '品牌': comp.brand || '',
    '封装': comp.package_name || '',
    '参数值': comp.spec || '',
    '库存数量': Number(balanceQty !== undefined ? balanceQty : comp.stock) || 0,
    '样品册仓位': comp.location_text || ''
  };

  // 1. Search if the record already exists in the table
  let existingRecordId = null;
  try {
    const searchRes = await sendHttpRequest({
      url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${cfg.feishuAppToken}/tables/${tableId}/records/search`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${token}` },
      data: {
        filter: {
          conjunction: 'or',
          conditions: [
            comp.c_code ? { field_name: '立创编号(PC)', operator: 'is', value: [comp.c_code] } : null,
            comp.mpn ? { field_name: '厂家型号(PM)', operator: 'is', value: [comp.mpn] } : null
          ].filter(Boolean)
        }
      }
    });

    const searchData = searchRes.data || {};
    if (searchData.code === 0 && searchData.data && searchData.data.items && searchData.data.items.length > 0) {
      existingRecordId = searchData.data.items[0].record_id;
    }
  } catch (e) {
    console.warn('Search existing Bitable record failed:', e);
  }

  // 2. If exists, update existing row!
  if (existingRecordId) {
    const updateRes = await sendHttpRequest({
      url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${cfg.feishuAppToken}/tables/${tableId}/records/${existingRecordId}`,
      method: 'PUT',
      header: { 'Authorization': `Bearer ${token}` },
      data: { fields }
    });
    return updateRes.data;
  }

  // 3. If not exists, insert a brand new row!
  const createRes = await sendHttpRequest({
    url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${cfg.feishuAppToken}/tables/${tableId}/records`,
    method: 'POST',
    header: { 'Authorization': `Bearer ${token}` },
    data: { fields }
  });

  return createRes.data;
}

/**
 * Universal Sync Event Handler (Triggered on Inbound/Outbound/Adjustment)
 */
function syncStockEvent(payload = {}) {
  const config = getSyncConfig();
  if (!config.enabled) return Promise.resolve({ skipped: true });

  const comp = payload.component || {};
  const balanceQty = payload.balanceQty !== undefined ? payload.balanceQty : comp.stock;
  const eventTitle = payload.event === 'STOCK_OUT' ? '📤 领料出库' : (payload.event === 'STOCK_IN' ? '📦 元件入库' : '🔄 库存更新');

  // Mode 1: 100% Free Feishu Bitable Open API (Direct Row Update inside Table)
  if (config.syncMode === 'feishu_bitable_api' && config.feishuAppId && config.feishuAppSecret && config.feishuAppToken) {
    return syncToFeishuBitableDirect(comp, balanceQty, payload.changeQty || 0, eventTitle).catch((err) => {
      console.warn('Feishu Bitable Direct Row Sync Caught:', err.message);
      return { success: false, err };
    });
  }

  // Mode 2: Webhook Mode
  if (config.webhookUrl) {
    const tableRecord = {
      '大类': comp.category || '未分类',
      '厂家型号(PM)': comp.mpn || comp.name || '',
      '立创编号(PC)': comp.c_code || '',
      '品牌': comp.brand || '',
      '封装': comp.package_name || '',
      '参数值': comp.spec || '',
      '库存数量': Number(balanceQty) || 0,
      '样品册仓位': comp.location_text || '',
      '变动数量': payload.changeQty || 0,
      '变动类型': eventTitle,
      '更新时间': new Date().toLocaleString()
    };

    const isFeishuBot = config.webhookUrl.includes('feishu.cn') || config.webhookUrl.includes('larksuite.com');
    let requestData;

    if (isFeishuBot) {
      const changeText = payload.changeQty > 0 ? `+${payload.changeQty}` : `${payload.changeQty || 0}`;
      requestData = {
        msg_type: 'interactive',
        card: {
          config: { wide_screen_mode: true },
          header: {
            title: { tag: 'plain_text', content: `${eventTitle}: ${comp.mpn || comp.name || '元器件'}` },
            template: payload.event === 'STOCK_OUT' ? 'orange' : (payload.event === 'STOCK_IN' ? 'green' : 'blue')
          },
          elements: [
            {
              tag: 'div',
              fields: [
                { is_short: true, text: { tag: 'lark_md', content: `**大类:**\n${comp.category || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**厂家型号(PM):**\n${comp.mpn || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**立创编号(PC):**\n${comp.c_code || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**品牌:**\n${comp.brand || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**参数值:**\n${comp.spec || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**封装:**\n${comp.package_name || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**变动数量:**\n**${changeText}** 个` } },
                { is_short: true, text: { tag: 'lark_md', content: `**库存数量:**\n**${balanceQty}** 个` } },
                { is_short: true, text: { tag: 'lark_md', content: `**样品册仓位:**\n${comp.location_text || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**更新时间:**\n${new Date().toLocaleString()}` } }
              ]
            }
          ]
        },
        ...tableRecord
      };
    } else {
      requestData = tableRecord;
    }

    return sendHttpRequest({
      url: config.webhookUrl,
      method: 'POST',
      data: requestData,
      timeout: 8000
    }).catch(() => {});
  }

  return Promise.resolve({ skipped: true });
}

/**
 * Batch Push All Components to Feishu Bitable
 */
async function syncAllComponents(components = []) {
  const config = getSyncConfig();
  if (!config.enabled) throw new Error('请先开启在线表格同步！');

  // Mode 1: Feishu Bitable API Direct Batch Creation
  if (config.syncMode === 'feishu_bitable_api' && config.feishuAppId && config.feishuAppSecret && config.feishuAppToken) {
    const token = await getFeishuTenantToken();
    const tableId = await getFeishuTableId(token, config.feishuAppToken);

    // Feishu batch_create supports up to 500 records per chunk
    const chunks = [];
    const chunkSize = 400;
    for (let i = 0; i < components.length; i += chunkSize) {
      chunks.push(components.slice(i, i + chunkSize));
    }

    let totalSynced = 0;
    for (const chunk of chunks) {
      const records = chunk.map(c => ({
        fields: {
          '大类': c.category || '未分类',
          '厂家型号(PM)': c.mpn || c.name || '',
          '立创编号(PC)': c.c_code || '',
          '品牌': c.brand || '',
          '封装': c.package_name || '',
          '参数值': c.spec || '',
          '库存数量': Number(c.stock) || 0,
          '样品册仓位': c.location_text || ''
        }
      }));

      const res = await sendHttpRequest({
        url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.feishuAppToken}/tables/${tableId}/records/batch_create`,
        method: 'POST',
        header: { 'Authorization': `Bearer ${token}` },
        data: { records }
      });

      const body = res.data || {};
      if (body.code === 0) {
        totalSynced += (body.data && body.data.records && body.data.records.length) || records.length;
      } else {
        throw new Error(`批量写入多维表格失败: ${body.msg || JSON.stringify(body)}`);
      }
    }

    return { success: true, count: totalSynced };
  }

  // Mode 2: Webhook Mode
  if (config.webhookUrl) {
    const formattedItems = components.map(c => ({
      '大类': c.category || '未分类',
      '厂家型号(PM)': c.mpn || c.name || '',
      '立创编号(PC)': c.c_code || '',
      '品牌': c.brand || '',
      '封装': c.package_name || '',
      '参数值': c.spec || '',
      '库存数量': Number(c.stock) || 0,
      '样品册仓位': c.location_text || ''
    }));

    return sendHttpRequest({
      url: config.webhookUrl,
      method: 'POST',
      data: {
        event: 'BATCH_FULL_SYNC',
        sync_time: new Date().toLocaleString(),
        total_types: components.length,
        items: formattedItems
      },
      timeout: 15000
    });
  }

  throw new Error('请先配置飞书 API 凭证或 Webhook 链接！');
}

/**
 * Test Connection
 */
async function testSyncConnection() {
  const cfg = getSyncConfig();
  if (cfg.syncMode === 'feishu_bitable_api') {
    const token = await getFeishuTenantToken();
    const tableId = await getFeishuTableId(token, cfg.feishuAppToken);
    return { success: true, tableId, token: token ? 'OK' : '' };
  } else {
    if (!cfg.webhookUrl) throw new Error('请先填入 Webhook 链接！');
    return sendHttpRequest({
      url: cfg.webhookUrl,
      method: 'POST',
      data: { event: 'TEST_PING', msg: '测试成功', time: new Date().toLocaleString() },
      timeout: 8000
    });
  }
}

module.exports = {
  getSyncConfig,
  saveSyncConfig,
  syncStockEvent,
  testSyncConnection,
  syncAllComponents
};
