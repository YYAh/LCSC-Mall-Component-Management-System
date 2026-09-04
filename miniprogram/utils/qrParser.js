/**
 * JLC & SZLCSC QR Code Parser Engine (Industrial-Grade)
 * 嘉立创 / 立创商城 / JLCPCB 包装袋全类型二维码与条形码全能精准解析器
 */

function parseJlcQrCode(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Clean invisible control characters and BOM, preserve printable text
  let text = rawText.replace(/[\uFEFF]/g, '').trim();

  const result = {
    raw: rawText.trim(),
    orderNo: '',
    cCode: '',
    mpn: '',
    qty: 0,
    batchNo: '',
    pdi: '',
    extra: {}
  };

  const cleanStr = (s) => (s ? String(s).replace(/^["'*]+|["'*]+$/g, '').trim() : '');

  // Strip ISO 15434 envelope if present: e.g. [)> 06 or [)>*06*
  let workingText = text;
  if (workingText.startsWith('[)>')) {
    workingText = workingText.replace(/^\[\)>[\x1E\s*]*\d{2}[\x1D\s*]*/, '');
  }

  // 2. Try Standard JSON parse
  if (workingText.startsWith('{') && workingText.endsWith('}')) {
    try {
      const obj = JSON.parse(workingText);
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          const lk = k.toLowerCase().replace(/[-_]/g, '');
          const val = cleanStr(v);
          if (lk === 'pc' || lk === 'productcode' || lk === 'ccode' || lk === 'itemcode' || lk === 'code') {
            if (val && val !== '0' && val !== 'null') {
              result.cCode = val.toUpperCase().startsWith('C') ? val.toUpperCase() : 'C' + val;
            }
          } else if (lk === 'pm' || lk === 'productmodel' || lk === 'mpn' || lk === 'model' || lk === 'name') {
            result.mpn = val;
          } else if (lk === 'qty' || lk === 'quantity' || lk === 'count') {
            result.qty = parseInt(val, 10) || 0;
          } else if (lk === 'on' || lk === 'orderno' || lk === 'ordercode') {
            result.orderNo = val;
          } else if (lk === 'mc' || lk === 'batchno' || lk === 'lotno') {
            result.batchNo = val;
          } else if (lk === 'pdi') {
            result.pdi = val;
          } else {
            result.extra[k] = val;
          }
        }
        if (result.cCode || result.mpn) return result;
      }
    } catch (e) {
      // Lenient parse for unquoted keys/values
    }

    // Lenient key-value parser inside braces: e.g. {pc:C2040, pm: 0603WAF, qty: 100}
    const inner = workingText.slice(1, -1);
    const pairs = inner.split(/[,;\n]/);
    for (const pair of pairs) {
      const idx = pair.indexOf(':');
      if (idx !== -1) {
        const k = cleanStr(pair.slice(0, idx)).toLowerCase().replace(/[-_]/g, '');
        let val = cleanStr(pair.slice(idx + 1));
        if (val === 'null' || val === 'undefined') val = '';

        if (k === 'pc' || k === 'productcode' || k === 'ccode' || k === 'code') {
          if (val && val !== '0' && val !== 'null') {
            result.cCode = val.toUpperCase().startsWith('C') ? val.toUpperCase() : 'C' + val;
          }
        } else if (k === 'pm' || k === 'productmodel' || k === 'mpn' || k === 'model') {
          result.mpn = val;
        } else if (k === 'qty' || k === 'quantity') {
          result.qty = parseInt(val, 10) || 0;
        } else if (k === 'on' || k === 'orderno') {
          result.orderNo = val;
        } else if (k === 'mc' || k === 'batchno') {
          result.batchNo = val;
        } else if (k === 'pdi') {
          result.pdi = val;
        } else {
          result.extra[k] = val;
        }
      }
    }
    if (result.cCode || result.mpn) return result;
  }

  // 3. URL Formats (e.g. szlcsc.com/... or details_2040.html)
  const urlMatch = workingText.match(/szlcsc\.com.*?(?:details_|\/)(\d+)\.html/i);
  if (urlMatch) {
    result.cCode = 'C' + urlMatch[1];
    return result;
  }
  const urlParamMatch = workingText.match(/(?:productCode|c_code|pc|keyword)=(C?\d+)/i);
  if (urlParamMatch) {
    const rawCode = urlParamMatch[1].toUpperCase();
    result.cCode = rawCode.startsWith('C') ? rawCode : 'C' + rawCode;
    return result;
  }

  // 4. Key-Value format without braces (e.g. pc:C2040,pm:0603,qty:10 or pc=C2040&pm=...)
  if (/[\b\s,;](?:pc|pm|on|qty)\s*[:=]/i.test(workingText) || workingText.startsWith('pc:') || workingText.startsWith('pm:')) {
    const items = workingText.split(/[,;\n&]/);
    for (const item of items) {
      const parts = item.split(/[:=]/);
      if (parts.length >= 2) {
        const k = cleanStr(parts[0]).toLowerCase().replace(/[-_]/g, '');
        const v = cleanStr(parts.slice(1).join(':'));
        if ((k === 'pc' || k === 'productcode' || k === 'ccode') && v && v !== 'null') {
          result.cCode = v.toUpperCase().startsWith('C') ? v.toUpperCase() : 'C' + v;
        } else if (k === 'pm' || k === 'productmodel' || k === 'mpn') {
          result.mpn = v;
        } else if (k === 'on' || k === 'orderno') {
          result.orderNo = v;
        } else if (k === 'qty' || k === 'quantity') {
          result.qty = parseInt(v, 10) || 0;
        }
      }
    }
    if (result.cCode || result.mpn) return result;
  }

  // 5. DataMatrix / Industrial EIA Barcode tags (e.g. 1P... or Q...)
  const pTagMatch = workingText.match(/(?:^|[\x1D\x1E,;*])1P([A-Za-z0-9._-]+?)(?:[\x1D\x1E,;*]|$)/i);
  if (pTagMatch) {
    const pVal = pTagMatch[1].toUpperCase();
    if (/^C\d+$/.test(pVal)) {
      result.cCode = pVal;
    } else {
      result.mpn = pTagMatch[1];
    }
    const qMatch = workingText.match(/(?:^|[\x1D\x1E,;*])Q(\d+)/i);
    if (qMatch) result.qty = parseInt(qMatch[1], 10) || 0;
    const tMatch = workingText.match(/(?:^|[\x1D\x1E,;*])1T([A-Za-z0-9._-]+)/i);
    if (tMatch) result.batchNo = tMatch[1];
    if (result.cCode || result.mpn) return result;
  }

  // 6. Standalone or Embedded C-Code (e.g. C2040, *C2040*, C123456, 1PC2040)
  const cMatch = workingText.match(/(?:^|[^A-Za-z0-9])(?:1P)?(C\d{1,10})(?:[^A-Za-z0-9]|$)/i);
  if (cMatch) {
    result.cCode = cMatch[1].toUpperCase();
    const qtyMatch = workingText.match(/(?:qty|数量|数量:)[\s:=]*(\d+)/i);
    if (qtyMatch) result.qty = parseInt(qtyMatch[1], 10) || 0;
    return result;
  }

  // 7. Fallback: Entire string cleaned of asterisks and quotes as MPN
  const cleanMpn = workingText.replace(/[*"']/g, '').trim();
  result.mpn = cleanMpn;
  return result;
}

module.exports = {
  parseJlcQrCode
};
