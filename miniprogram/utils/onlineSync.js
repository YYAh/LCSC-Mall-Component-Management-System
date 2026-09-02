/**
 * Online Spreadsheet & Webhook Real-time Synchronization Module
 * 在线表格（飞书多维表格 / 通用 Webhook / 自动化表格）0 成本实时同步模块
 */

const STORAGE_KEYS = {
  ENABLED: 'ONLINE_SYNC_ENABLED',
  TYPE: 'ONLINE_SYNC_TYPE', // 'webhook' | 'feishu_base'
  WEBHOOK_URL: 'ONLINE_SYNC_WEBHOOK_URL',
  FEISHU_APP_TOKEN: 'ONLINE_SYNC_FEISHU_APP_TOKEN',
  FEISHU_TABLE_ID: 'ONLINE_SYNC_FEISHU_TABLE_ID',
  FEISHU_AUTH_TOKEN: 'ONLINE_SYNC_FEISHU_AUTH_TOKEN'
};

function getSyncConfig() {
  return {
    enabled: wx.getStorageSync(STORAGE_KEYS.ENABLED) === true || wx.getStorageSync(STORAGE_KEYS.ENABLED) === 'true',
    type: wx.getStorageSync(STORAGE_KEYS.TYPE) || 'webhook',
    webhookUrl: wx.getStorageSync(STORAGE_KEYS.WEBHOOK_URL) || 'https://open.feishu.cn/open-apis/bot/v2/hook/f4459919-ec87-4db0-b86f-3f2e9a139f01',
    feishuAppToken: wx.getStorageSync(STORAGE_KEYS.FEISHU_APP_TOKEN) || '',
    feishuTableId: wx.getStorageSync(STORAGE_KEYS.FEISHU_TABLE_ID) || '',
    feishuAuthToken: wx.getStorageSync(STORAGE_KEYS.FEISHU_AUTH_TOKEN) || ''
  };
}

function saveSyncConfig(cfg = {}) {
  if (cfg.enabled !== undefined) wx.setStorageSync(STORAGE_KEYS.ENABLED, Boolean(cfg.enabled));
  if (cfg.type !== undefined) wx.setStorageSync(STORAGE_KEYS.TYPE, cfg.type);
  if (cfg.webhookUrl !== undefined) wx.setStorageSync(STORAGE_KEYS.WEBHOOK_URL, cfg.webhookUrl.trim());
  if (cfg.feishuAppToken !== undefined) wx.setStorageSync(STORAGE_KEYS.FEISHU_APP_TOKEN, cfg.feishuAppToken.trim());
  if (cfg.feishuTableId !== undefined) wx.setStorageSync(STORAGE_KEYS.FEISHU_TABLE_ID, cfg.feishuTableId.trim());
  if (cfg.feishuAuthToken !== undefined) wx.setStorageSync(STORAGE_KEYS.FEISHU_AUTH_TOKEN, cfg.feishuAuthToken.trim());
}

/**
 * Universal HTTP Dispatcher with Server Proxy Fallback
 * 智能 HTTP 请求分发器：微信域名受限时自动通过局域网/自建后端代理转发
 */
function sendHttpRequest({ url, method = 'POST', data = {}, timeout = 8000, header = {} }) {
  const serverUrl = wx.getStorageSync('SERVER_URL') || 'http://127.0.0.1:3000';
  const engineMode = wx.getStorageSync('ENGINE_MODE') || 'local';

  return new Promise((resolve, reject) => {
    // 1. If in REST engine mode, directly use backend proxy to 100% bypass WeChat domain whitelist
    if (engineMode === 'rest') {
      wx.request({
        url: `${serverUrl}/api/sync/webhook`,
        method: 'POST',
        data: { url, data },
        timeout,
        header: { 'Content-Type': 'application/json' },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: res.data });
          } else {
            reject(new Error(`后端代理推送失败: 状态码 ${res.statusCode} (${JSON.stringify(res.data)})`));
          }
        },
        fail: (err) => {
          // If backend proxy fails, try direct
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
            // Suggest enabling proxy or DevTools option
            reject(new Error(`[微信域名限制] request:fail url not in domain list\n\n解决方案：\n1. 在微信开发者工具右上角【详情】->【本地设置】-> 勾选【不校验合法域名】；\n2. 或在小程序【设置】中切换到【💻 局域网自建服务器】，即可 100% 免校验自由同步！`));
          } else {
            reject(new Error(`网络请求失败: ${errMsg}`));
          }
        }
      });
    }
  });
}

/**
 * Send real-time event to Online Sheet / Webhook
 * @param {Object} payload 
 */
function syncStockEvent(payload = {}) {
  const config = getSyncConfig();
  if (!config.enabled || !config.webhookUrl) return Promise.resolve({ skipped: true });

  const nowStr = new Date().toLocaleString();
  const eventNameMap = {
    'STOCK_IN': '📦 元件入库',
    'STOCK_OUT': '📤 领料出库',
    'STOCK_ADJUST': '⚖️ 盘点校准',
    'CREATE': '✨ 新增元器件',
    'UPDATE': '✏️ 修改物料'
  };

  const eventTitle = eventNameMap[payload.event] || '🔄 库存更新';
  const comp = payload.component || {};

  // Prepare structured table payload (Matching user's exact spreadsheet columns in Image 1)
  const tableRecord = {
    '大类': comp.category || '未分类',
    '厂家型号(PM)': comp.mpn || comp.name || '',
    '立创编号(PC)': comp.c_code || '',
    '品牌': comp.brand || '',
    '封装': comp.package_name || '',
    '参数值': comp.spec || '',
    '库存数量': Number(payload.balanceQty !== undefined ? payload.balanceQty : comp.stock) || 0,
    '样品册仓位': comp.location_text || '',
    '变动数量': payload.changeQty || 0,
    '变动类型': eventTitle,
    '更新时间': nowStr,
    '备注': payload.remark || comp.order_no || '',

    // English aliases
    category: comp.category || '未分类',
    mpn: comp.mpn || comp.name || '',
    c_code: comp.c_code || '',
    brand: comp.brand || '',
    package_name: comp.package_name || '',
    spec: comp.spec || '',
    stock: Number(payload.balanceQty !== undefined ? payload.balanceQty : comp.stock) || 0,
    location_text: comp.location_text || '',
    event: payload.event,
    event_name: eventTitle,
    change_qty: payload.changeQty || 0,
    balance_qty: Number(payload.balanceQty !== undefined ? payload.balanceQty : comp.stock) || 0,
    time: nowStr
  };

  let requestData;
  if (isFeishuBot) {
    const changeText = payload.changeQty > 0 ? `+${payload.changeQty}` : `${payload.changeQty || 0}`;
    requestData = {
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: {
            tag: 'plain_text',
            content: `${eventTitle}: ${comp.mpn || comp.name || '元器件'}`
          },
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
              { is_short: true, text: { tag: 'lark_md', content: `**库存数量:**\n**${payload.balanceQty !== undefined ? payload.balanceQty : comp.stock}** 个` } },
              { is_short: true, text: { tag: 'lark_md', content: `**样品册仓位:**\n${comp.location_text || '-'}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**更新时间:**\n${nowStr}` } }
            ]
          },
          payload.remark ? {
            tag: 'note',
            elements: [{ tag: 'plain_text', content: `备注说明: ${payload.remark}` }]
          } : null
        ].filter(Boolean)
      },
      // Raw data fields for Bitable automation ingestion
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
  }).catch((err) => {
    console.warn('Online Sheet Sync Silently Caught:', err.message);
    return { success: false, err };
  });
}

/**
 * Send Test Ping to Webhook
 */
function testWebhookConnection(customUrl) {
  const url = (customUrl || getSyncConfig().webhookUrl || '').trim();
  if (!url) {
    return Promise.reject(new Error('请先填入 Webhook 链接！'));
  }

  // Detect if user pasted a web page URL instead of a Webhook POST endpoint
  if (url.includes('/app/') || (url.includes('/base/') && !url.includes('/hook/'))) {
    return Promise.reject(new Error(
      `您输入的是飞书多维表格的【网页浏览链接】，并非用于接收数据的【Webhook 推送地址】。\n\n获取正确地址方法：\n在飞书群聊或多维表格右上角点击【设置/机器人】->【添加自定义机器人】，复制生成的 Webhook 地址 (格式如: https://open.feishu.cn/open-apis/bot/v2/hook/...) 即可！`
    ));
  }

  const isFeishu = url.includes('feishu.cn') || url.includes('larksuite.com');
  const testData = isFeishu ? {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: '🎉 嘉立创元器件系统 · 在线表格同步测试成功' },
        template: 'green'
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**状态:** ✅ 微信小程序与飞书在线表格连接正常\n**测试时间:** ${new Date().toLocaleString()}\n**说明:** 当您在小程序中进行元器件扫码入库、领料出库时，系统将自动把最新数据实时推送到这里！`
          }
        }
      ]
    }
  } : {
    event: 'TEST_PING',
    msg: '嘉立创元器件管理系统在线同步连通性测试成功',
    time: new Date().toLocaleString()
  };

  return sendHttpRequest({
    url,
    method: 'POST',
    data: testData,
    timeout: 8000
  });
}

/**
 * Batch Push All Components Summary to Online Sheet
 */
async function syncAllComponents(components = []) {
  const config = getSyncConfig();
  if (!config.webhookUrl) {
    throw new Error('请先配置在线表格 Webhook 链接！');
  }

  const nowStr = new Date().toLocaleString();
  const isFeishu = config.webhookUrl.includes('feishu.cn') || config.webhookUrl.includes('larksuite.com');

  const formattedItems = components.map(c => ({
    '大类': c.category || '未分类',
    '厂家型号(PM)': c.mpn || c.name || '',
    '立创编号(PC)': c.c_code || '',
    '品牌': c.brand || '',
    '封装': c.package_name || '',
    '参数值': c.spec || '',
    '库存数量': Number(c.stock) || 0,
    '样品册仓位': c.location_text || '',
    '安全库存': Number(c.safe_stock) || 5
  }));

  if (isFeishu) {
    const topComps = components.slice(0, 10).map(c => `• **[${c.c_code || '无编号'}]** ${c.mpn} (${c.category}) - 库存: **${c.stock}** - 仓位: ${c.location_text || '-'}`).join('\n');
    const totalStock = components.reduce((sum, c) => sum + (Number(c.stock) || 0), 0);

    const summaryCard = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: `📊 全库元器件同步报告 (共 ${components.length} 种物料)` },
          template: 'blue'
        },
        elements: [
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**物料总种类:**\n${components.length} 种` } },
              { is_short: true, text: { tag: 'lark_md', content: `**全库总件数:**\n${totalStock} 个` } },
              { is_short: false, text: { tag: 'lark_md', content: `**同步时间:**\n${nowStr}` } }
            ]
          },
          {
            tag: 'div',
            text: { tag: 'lark_md', content: `**物料清单预览 (前 10 项):**\n${topComps}\n*(更多请在小程序物料库中查看)*` }
          }
        ]
      },
      event: 'BATCH_FULL_SYNC',
      sync_time: nowStr,
      total_types: components.length,
      items: formattedItems
    };

    return sendHttpRequest({
      url: config.webhookUrl,
      method: 'POST',
      data: summaryCard,
      timeout: 15000
    });
  }

  return sendHttpRequest({
    url: config.webhookUrl,
    method: 'POST',
    data: {
      event: 'BATCH_FULL_SYNC',
      sync_time: nowStr,
      total_types: components.length,
      items: formattedItems
    },
    timeout: 15000
  });
}

module.exports = {
  getSyncConfig,
  saveSyncConfig,
  syncStockEvent,
  testWebhookConnection,
  syncAllComponents
};
