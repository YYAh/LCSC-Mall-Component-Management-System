/**
 * JLC & SZLCSC QR Code Parser Engine (Industrial-Grade)
 * 嘉立创 / 立创商城 / JLCPCB 包装袋全类型二维码与条形码全能精准解析器
 */

function cleanStr(s) {
  return s ? String(s).replace(/^["'*]+|["'*]+$/g, '').trim() : '';
}

function parseJlcQrCode(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Clean invisible control characters, zero-width spaces and BOM
  let text = rawText.replace(/[\uFEFF\u200B\u00A0\r]/g, '').trim();
  if (!text) return null;

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

  // Strip ISO 15434 envelope if present: e.g. [)> 06 or [)>*06*
  let workingText = text;
  if (workingText.startsWith('[)>')) {
    workingText = workingText.replace(/^\[\)>[\x1E\s*]*\d{2}[\x1D\s*]*/, '');
  }

  // 2. Try JSON or Lenient Object Parse if contains braces '{ ... }'
  const braceMatch = workingText.match(/\{([\s\S]*)\}/);
  if (braceMatch) {
    const jsonCandidate = braceMatch[0];
    try {
      const obj = JSON.parse(jsonCandidate);
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          const lk = k.toLowerCase().replace(/[-_]/g, '');
          const val = cleanStr(v);
          if (['pc', 'productcode', 'ccode', 'itemcode', 'code', 'ccode', 'lcsc', 'jlc'].includes(lk)) {
            if (val && val !== '0' && val !== 'null') {
              result.cCode = val.toUpperCase().startsWith('C') ? val.toUpperCase() : 'C' + val;
            }
          } else if (['pm', 'productmodel', 'mpn', 'model', 'name', 'pn', 'partno', 'partnumber'].includes(lk)) {
            result.mpn = val;
          } else if (['qty', 'quantity', 'count', 'num', 'q'].includes(lk)) {
            result.qty = parseInt(val, 10) || 0;
          } else if (['on', 'orderno', 'ordercode', 'order'].includes(lk)) {
            result.orderNo = val;
          } else if (['mc', 'batchno', 'lotno', 'batch', 'lot'].includes(lk)) {
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
      // JSON parse failed, proceed to lenient parser
    }

    // Lenient key-value parser inside braces: e.g. {on:SO26...,pc:C2906982,pm:FRC0603F1002TS,qty:200}
    const inner = braceMatch[1];
    const pairs = inner.split(/[,;\n]/);
    for (const pair of pairs) {
      let sepIdx = pair.indexOf(':');
      if (sepIdx === -1) sepIdx = pair.indexOf('=');
      if (sepIdx !== -1) {
        const k = cleanStr(pair.slice(0, sepIdx)).toLowerCase().replace(/[-_]/g, '');
        let val = cleanStr(pair.slice(sepIdx + 1));
        if (val === 'null' || val === 'undefined') val = '';

        if (['pc', 'productcode', 'ccode', 'itemcode', 'code', 'lcsc', 'jlc'].includes(k)) {
          if (val && val !== '0' && val !== 'null') {
            result.cCode = val.toUpperCase().startsWith('C') ? val.toUpperCase() : 'C' + val;
          }
        } else if (['pm', 'productmodel', 'mpn', 'model', 'name', 'pn', 'partno', 'partnumber'].includes(k)) {
          result.mpn = val;
        } else if (['qty', 'quantity', 'count', 'num', 'q'].includes(k)) {
          result.qty = parseInt(val, 10) || 0;
        } else if (['on', 'orderno', 'ordercode', 'order'].includes(k)) {
          result.orderNo = val;
        } else if (['mc', 'batchno', 'lotno', 'batch', 'lot'].includes(k)) {
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

  // 3. URL Formats (e.g. szlcsc.com, lcsc.com, jlcpcb.com)
  const lcscUrl = workingText.match(/(?:szlcsc|lcsc)\.com.*?(?:details_|product-detail\/|\/)([C]?\d+)/i);
  if (lcscUrl) {
    const raw = lcscUrl[1].toUpperCase();
    result.cCode = raw.startsWith('C') ? raw : 'C' + raw;
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
      let sepIdx = item.indexOf(':');
      if (sepIdx === -1) sepIdx = item.indexOf('=');
      if (sepIdx !== -1) {
        const k = cleanStr(item.slice(0, sepIdx)).toLowerCase().replace(/[-_]/g, '');
        const v = cleanStr(item.slice(sepIdx + 1));
        if (['pc', 'productcode', 'ccode', 'code'].includes(k) && v && v !== 'null') {
          result.cCode = v.toUpperCase().startsWith('C') ? v.toUpperCase() : 'C' + v;
        } else if (['pm', 'productmodel', 'mpn', 'pn', 'model'].includes(k)) {
          result.mpn = v;
        } else if (['on', 'orderno', 'order'].includes(k)) {
          result.orderNo = v;
        } else if (['qty', 'quantity', 'q'].includes(k)) {
          result.qty = parseInt(v, 10) || 0;
        }
      }
    }
    if (result.cCode || result.mpn) return result;
  }

  // 5. DataMatrix / Industrial EIA Barcode tags (e.g. 1P... or Q...)
  const pTagMatch = workingText.match(/(?:^|[\x1D\x1E,;*])1P\s*([A-Za-z0-9._-]+?)(?:[\x1D\x1E,;*]|$)/i);
  if (pTagMatch) {
    const pVal = pTagMatch[1].toUpperCase();
    if (/^C\d+$/.test(pVal)) {
      result.cCode = pVal;
    } else {
      result.mpn = pTagMatch[1];
    }
    const qMatch = workingText.match(/(?:^|[\x1D\x1E,;*])Q\s*(\d+)/i);
    if (qMatch) result.qty = parseInt(qMatch[1], 10) || 0;
    const tMatch = workingText.match(/(?:^|[\x1D\x1E,;*])1T\s*([A-Za-z0-9._-]+)/i);
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
