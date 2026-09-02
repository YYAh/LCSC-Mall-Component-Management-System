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
    webhookUrl: wx.getStorageSync(STORAGE_KEYS.WEBHOOK_URL) || '',
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
 * Send real-time event to Online Sheet / Webhook
 * @param {Object} payload 
 */
function syncStockEvent(payload = {}) {
  const config = getSyncConfig();
  if (!config.enabled) return Promise.resolve({ skipped: true });

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

  // 1. Webhook Mode (Simplest & 100% Free: Feishu Bot / Feishu Bitable Automation / Generic Webhook)
  if (config.type === 'webhook' && config.webhookUrl) {
    const isFeishuBot = config.webhookUrl.includes('feishu.cn') || config.webhookUrl.includes('larksuite.com');
    
    let requestData;
    if (isFeishuBot) {
      // Format as Feishu Interactive Card for beautiful display
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
                { is_short: true, text: { tag: 'lark_md', content: `**型号 (MPN):**\n${comp.mpn || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**立创编号:**\n${comp.c_code || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**分类:**\n${comp.category || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**原厂品牌:**\n${comp.brand || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**参数规格:**\n${comp.spec || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**封装形式:**\n${comp.package_name || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**变动数量:**\n**${changeText}** 个` } },
                { is_short: true, text: { tag: 'lark_md', content: `**当前总库存:**\n**${payload.balanceQty !== undefined ? payload.balanceQty : comp.stock}** 个` } },
                { is_short: true, text: { tag: 'lark_md', content: `**样品册仓位:**\n${comp.location_text || '-'}` } },
                { is_short: true, text: { tag: 'lark_md', content: `**操作时间:**\n${nowStr}` } }
              ]
            },
            payload.remark ? {
              tag: 'note',
              elements: [{ tag: 'plain_text', content: `备注说明: ${payload.remark}` }]
            } : null
          ].filter(Boolean)
        }
      };
    } else {
      // Standard JSON Webhook payload
      requestData = {
        event: payload.event,
        event_name: eventTitle,
        time: nowStr,
        timestamp: Date.now(),
        change_qty: payload.changeQty || 0,
        balance_qty: payload.balanceQty !== undefined ? payload.balanceQty : comp.stock,
        remark: payload.remark || '',
        order_no: payload.orderNo || comp.order_no || '',
        component: {
          id: comp.id || comp._id,
          mpn: comp.mpn,
          c_code: comp.c_code,
          name: comp.name,
          category: comp.category,
          brand: comp.brand,
          spec: comp.spec,
          package_name: comp.package_name,
          stock: payload.balanceQty !== undefined ? payload.balanceQty : comp.stock,
          safe_stock: comp.safe_stock,
          location_text: comp.location_text
        }
      };
    }

    return new Promise((resolve) => {
      wx.request({
        url: config.webhookUrl,
        method: 'POST',
        data: requestData,
        timeout: 6000,
        headers: { 'Content-Type': 'application/json' },
        success: (res) => {
          console.log('Online Sheet Webhook Sync Success:', res.statusCode);
          resolve({ success: true, res });
        },
        fail: (err) => {
          console.warn('Online Sheet Webhook Sync Failed (Network/CORS):', err);
          resolve({ success: false, err });
        }
      });
    });
  }

  // 2. Feishu Bitable Open API Mode
  if (config.type === 'feishu_base' && config.feishuAppToken && config.feishuTableId) {
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.feishuAppToken}/tables/${config.feishuTableId}/records`;
    const recordFields = {
      '型号': comp.mpn || comp.name,
      '立创编号': comp.c_code || '',
      '分类': comp.category || '',
      '品牌': comp.brand || '',
      '参数规格': comp.spec || '',
      '封装': comp.package_name || '',
      '库存数量': Number(payload.balanceQty !== undefined ? payload.balanceQty : comp.stock) || 0,
      '仓位': comp.location_text || '',
      '最新变动': payload.changeQty || 0,
      '变动类型': eventTitle,
      '更新时间': nowStr,
      '备注': payload.remark || comp.order_no || ''
    };

    return new Promise((resolve) => {
      wx.request({
        url,
        method: 'POST',
        data: { fields: recordFields },
        timeout: 8000,
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.feishuAuthToken}`
        },
        success: (res) => resolve({ success: true, res }),
        fail: (err) => resolve({ success: false, err })
      });
    });
  }

  return Promise.resolve({ skipped: true });
}

/**
 * Send Test Ping to Webhook
 */
function testWebhookConnection(customUrl) {
  const url = customUrl || getSyncConfig().webhookUrl;
  if (!url) {
    return Promise.reject(new Error('请先填入 Webhook 链接！'));
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
            content: `**状态:** ✅ 微信小程序与在线表格连接正常\n**测试时间:** ${new Date().toLocaleString()}\n**说明:** 当您在小程序中进行元器件扫码入库、领料出库时，系统将自动把最新数据实时推送到这里！`
          }
        }
      ]
    }
  } : {
    event: 'TEST_PING',
    msg: '嘉立创元器件管理系统在线同步连通性测试成功',
    time: new Date().toLocaleString()
  };

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      data: testData,
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true });
        } else {
          reject(new Error(`服务器响应状态码: ${res.statusCode} (${JSON.stringify(res.data || '')})`));
        }
      },
      fail: (err) => {
        reject(new Error(`请求发送失败: ${err.errMsg}，请检查 URL 是否正确及网络连接`));
      }
    });
  });
}

/**
 * Batch Push All Components Summary to Online Sheet
 */
async function syncAllComponents(components = []) {
  const config = getSyncConfig();
  if (!config.webhookUrl && (!config.feishuAppToken || !config.feishuTableId)) {
    throw new Error('请先配置在线表格 Webhook 链接！');
  }

  const nowStr = new Date().toLocaleString();
  const isFeishu = config.webhookUrl && (config.webhookUrl.includes('feishu.cn') || config.webhookUrl.includes('larksuite.com'));

  if (isFeishu) {
    // Send summary card
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
      }
    };

    return new Promise((resolve, reject) => {
      wx.request({
        url: config.webhookUrl,
        method: 'POST',
        data: summaryCard,
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
        success: (res) => resolve({ success: true, count: components.length }),
        fail: (err) => reject(new Error(err.errMsg))
      });
    });
  }

  // Generic Webhook batch push
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.webhookUrl,
      method: 'POST',
      data: {
        event: 'BATCH_FULL_SYNC',
        sync_time: nowStr,
        total_types: components.length,
        items: components
      },
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
      success: (res) => resolve({ success: true, count: components.length }),
      fail: (err) => reject(new Error(err.errMsg))
    });
  });
}

module.exports = {
  getSyncConfig,
  saveSyncConfig,
  syncStockEvent,
  testWebhookConnection,
  syncAllComponents
};
