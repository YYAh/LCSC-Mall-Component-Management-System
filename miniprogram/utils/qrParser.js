/**
 * JLC & SZLCSC QR Code Parser Engine
 * 嘉立创 / 立创商城 / JLCPCB 包装袋二维码全能精准解析器
 */

function parseJlcQrCode(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();
  const result = {
    raw: text,
    orderNo: '',
    cCode: '',
    mpn: '',
    qty: 0,
    batchNo: '',
    pdi: '',
    extra: {}
  };

  // 1. Standard JSON Format: {on:SO..., pc:C..., pm:..., qty:10, mc:..., pdi:...}
  if (text.startsWith('{') && text.endsWith('}')) {
    const inner = text.slice(1, -1);
    const pairs = inner.split(',');
    for (const pair of pairs) {
      const idx = pair.indexOf(':');
      if (idx !== -1) {
        const key = pair.slice(0, idx).trim().toLowerCase();
        let val = pair.slice(idx + 1).trim();
        if (val === 'null' || val === 'undefined') val = '';

        if (key === 'on') result.orderNo = val;
        else if (key === 'pc') {
          if (val && val !== '0' && val !== 'null') {
            result.cCode = val.toUpperCase().startsWith('C') ? val.toUpperCase() : 'C' + val;
          }
        }
        else if (key === 'pm') result.mpn = val;
        else if (key === 'qty') result.qty = parseInt(val, 10) || 0;
        else if (key === 'mc') result.batchNo = val;
        else if (key === 'pdi') result.pdi = val;
        else result.extra[key] = val;
      }
    }
    return result;
  }

  // 2. URL Formats (e.g. item.szlcsc.com/127509.html or productCode=C127509)
  const urlMatch = text.match(/szlcsc\.com\/(\d+)\.html/i);
  if (urlMatch) {
    result.cCode = 'C' + urlMatch[1];
    return result;
  }
  const urlParamMatch = text.match(/productCode=(C\d+)/i);
  if (urlParamMatch) {
    result.cCode = urlParamMatch[1].toUpperCase();
    return result;
  }

  // 3. Key-Value format without braces (e.g. on:SO123,pc:C123,pm:LM317,qty:10)
  if (text.includes('pc:') || text.includes('pm:') || text.includes('on:')) {
    const items = text.split(/[,;\n&]/);
    for (const item of items) {
      const parts = item.split(/[:=]/);
      if (parts.length === 2) {
        const k = parts[0].trim().toLowerCase();
        const v = parts[1].trim();
        if (k === 'pc' && v && v !== 'null') {
          result.cCode = v.toUpperCase().startsWith('C') ? v.toUpperCase() : 'C' + v;
        } else if (k === 'pm') {
          result.mpn = v;
        } else if (k === 'on') {
          result.orderNo = v;
        } else if (k === 'qty') {
          result.qty = parseInt(v, 10) || 0;
        }
      }
    }
    if (result.cCode || result.mpn) return result;
  }

  // 4. Standalone C-Code with word boundaries (e.g. 1PC127509 or C127509)
  const cMatch = text.match(/(?:^|[^\w])(?:1P)?(C\d{4,8})(?:[^\w]|$)/i);
  if (cMatch) {
    result.cCode = cMatch[1].toUpperCase();
    return result;
  }

  // 5. Fallback: Entire string as MPN / Model keyword
  result.mpn = text;
  return result;
}

module.exports = {
  parseJlcQrCode
};
