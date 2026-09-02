/**
 * Pure JavaScript Excel (.xlsx / .csv / .txt) Parser for WeChat Mini Program
 * 零依赖纯前端解析真实 .xlsx 二进制文件及 CSV / TSV 表格
 */

const TinyInflate = (function () {
  const T_MAXBITS = 15;
  const lbase = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
  ];
  const lext = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
  ];
  const dbase = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577
  ];
  const dext = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
  ];
  const clc = [
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
  ];

  function buildTree(lengths, numLengths) {
    const count = new Uint16Array(T_MAXBITS + 1);
    const offset = new Uint16Array(T_MAXBITS + 1);
    const codes = new Uint16Array(numLengths);
    for (let i = 0; i < numLengths; i++) count[lengths[i]]++;
    count[0] = 0;
    for (let i = 1; i <= T_MAXBITS; i++) {
      offset[i] = (offset[i - 1] + count[i - 1]) << 1;
    }
    for (let i = 0; i < numLengths; i++) {
      const len = lengths[i];
      if (len !== 0) codes[i] = offset[len]++;
    }
    return { lengths: lengths, codes: codes, count: count };
  }

  function inflate(src, uncompLen) {
    let outCapacity = uncompLen && uncompLen > 0 ? uncompLen : Math.max(src.length * 5, 65536);
    let out = new Uint8Array(outCapacity);
    let outPos = 0;
    let bitBuf = 0, bitCount = 0, srcPos = 0;

    function ensureCapacity(needed) {
      if (outPos + needed >= out.length) {
        let newCap = Math.max(out.length * 2, outPos + needed + 65536);
        let newOut = new Uint8Array(newCap);
        newOut.set(out);
        out = newOut;
      }
    }

    function getBits(n) {
      while (bitCount < n) {
        if (srcPos >= src.length) break;
        bitBuf |= (src[srcPos++] << bitCount);
        bitCount += 8;
      }
      const res = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n;
      bitCount -= n;
      return res;
    }

    function decodeSymbol(tree) {
      let code = 0, first = 0;
      for (let len = 1; len <= T_MAXBITS; len++) {
        code |= getBits(1);
        const count = tree.count[len];
        if (code - first < count) {
          let tCode = code - first;
          for (let i = 0; i < tree.lengths.length; i++) {
            if (tree.lengths[i] === len) {
              if (tCode === 0) return i;
              tCode--;
            }
          }
        }
        first = (first + count) << 1;
        code <<= 1;
      }
      return -1;
    }

    let bfinal = 0;
    while (!bfinal) {
      bfinal = getBits(1);
      const btype = getBits(2);
      if (btype === 0) { // uncompressed
        bitBuf = 0; bitCount = 0;
        const len = src[srcPos] | (src[srcPos + 1] << 8);
        srcPos += 4;
        ensureCapacity(len);
        for (let i = 0; i < len; i++) out[outPos++] = src[srcPos++];
      } else if (btype === 1 || btype === 2) {
        let ltree, dtree;
        if (btype === 1) { // fixed
          const llengths = new Uint8Array(288);
          for (let i = 0; i < 144; i++) llengths[i] = 8;
          for (let i = 144; i < 256; i++) llengths[i] = 9;
          for (let i = 256; i < 280; i++) llengths[i] = 7;
          for (let i = 280; i < 288; i++) llengths[i] = 8;
          ltree = buildTree(llengths, 288);
          const dlengths = new Uint8Array(32);
          for (let i = 0; i < 32; i++) dlengths[i] = 5;
          dtree = buildTree(dlengths, 32);
        } else { // dynamic
          const hlit = getBits(5) + 257;
          const hdist = getBits(5) + 1;
          const hclen = getBits(4) + 4;
          const clengths = new Uint8Array(19);
          for (let i = 0; i < hclen; i++) clengths[clc[i]] = getBits(3);
          const ctree = buildTree(clengths, 19);
          const lengths = new Uint8Array(hlit + hdist);
          let num = 0;
          while (num < hlit + hdist) {
            const sym = decodeSymbol(ctree);
            if (sym < 16) lengths[num++] = sym;
            else if (sym === 16) {
              let rep = getBits(2) + 3;
              const val = lengths[num - 1];
              while (rep--) lengths[num++] = val;
            } else if (sym === 17) {
              let rep = getBits(3) + 3;
              while (rep--) lengths[num++] = 0;
            } else if (sym === 18) {
              let rep = getBits(7) + 11;
              while (rep--) lengths[num++] = 0;
            }
          }
          ltree = buildTree(lengths.subarray(0, hlit), hlit);
          dtree = buildTree(lengths.subarray(hlit), hdist);
        }

        while (true) {
          const sym = decodeSymbol(ltree);
          if (sym < 256) {
            ensureCapacity(1);
            out[outPos++] = sym;
          } else if (sym === 256) {
            break;
          } else {
            const lsym = sym - 257;
            const matchLen = lbase[lsym] + getBits(lext[lsym]);
            const dsym = decodeSymbol(dtree);
            const dist = dbase[dsym] + getBits(dext[dsym]);
            const matchPos = outPos - dist;
            ensureCapacity(matchLen);
            for (let i = 0; i < matchLen; i++) {
              out[outPos++] = out[matchPos + i];
            }
          }
        }
      }
    }
    return out.subarray(0, outPos);
  }

  return { inflate: inflate };
})();

function uint8ToString(u8) {
  let str = '';
  const len = u8.length;
  for (let i = 0; i < len; i++) {
    let c = u8[i];
    if (c < 128) {
      str += String.fromCharCode(c);
    } else if (c > 191 && c < 224) {
      let c2 = u8[++i];
      str += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
    } else if (c > 223 && c < 240) {
      let c2 = u8[++i];
      let c3 = u8[++i];
      str += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
    } else {
      let c2 = u8[++i];
      let c3 = u8[++i];
      let c4 = u8[++i];
      let code = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
      str += String.fromCharCode((code >> 10) + 0xD800, (code & 0x3FF) + 0xDC00);
    }
  }
  return str;
}

function parseZipEntries(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  const files = {};

  let eocd = -1;
  for (let i = u8.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    throw new Error('未识别到标准的 ZIP/XLSX 文件结构');
  }

  const cdEntries = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  let p = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);

    const nameBytes = u8.subarray(p + 46, p + 46 + nameLen);
    let fileName = '';
    for (let j = 0; j < nameBytes.length; j++) fileName += String.fromCharCode(nameBytes[j]);

    const localNameLen = dv.getUint16(localOffset + 26, true);
    const localExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compData = u8.subarray(dataStart, dataStart + compSize);

    let uncompressed;
    if (method === 0) {
      uncompressed = compData;
    } else if (method === 8) {
      uncompressed = TinyInflate.inflate(compData, uncompSize);
    }

    if (uncompressed) {
      files[fileName] = uint8ToString(uncompressed);
    }

    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function parseXlsxXml(sheetXml, stringsXml) {
  const stringList = [];
  if (stringsXml) {
    const siMatches = stringsXml.match(/<si>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
      const text = tMatches.map(t => {
        return t.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/, '$1')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      }).join('');
      stringList.push(text);
    }
  }

  const rows = [];
  const rowMatches = sheetXml.match(/<row(?:\s[^>]*)?>[\s\S]*?<\/row>/g) || [];
  for (const rowXml of rowMatches) {
    const cells = [];
    const cellMatches = rowXml.match(/<c(?:\s[^>]*)?>[\s\S]*?<\/c>|<c(?:\s[^>]*)\/>/g) || [];
    for (const cXml of cellMatches) {
      const isString = /t="s"/.test(cXml);
      const isInline = /t="inlineStr"/.test(cXml);
      let val = '';
      if (isInline) {
        const tM = cXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
        val = tM ? tM[1] : '';
      } else {
        const vM = cXml.match(/<v>([\s\S]*?)<\/v>/);
        if (vM) {
          if (isString) {
            const strIdx = parseInt(vM[1], 10);
            val = stringList[strIdx] !== undefined ? stringList[strIdx] : '';
          } else {
            val = vM[1];
          }
        }
      }
      cells.push(val.trim());
    }
    if (cells.some(c => c.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  const isTab = line.includes('\t') && !line.includes(',');
  const delimiter = isTab ? '\t' : ',';

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCsvOrTsv(content) {
  const clean = (content || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const rows = [];

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.some(c => c.length > 0)) {
      rows.push(cols);
    }
  }
  return rows;
}

function convertRowsToComponents(rows) {
  if (!rows || rows.length === 0) return [];
  const items = [];

  let headerIdx = -1;
  let colMap = {
    category: -1,
    mpn: -1,
    c_code: -1,
    brand: -1,
    spec: -1,
    package_name: -1,
    stock: -1,
    location_text: -1,
    order_no: -1
  };

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    const rowStr = row.join(' ');
    if (rowStr.includes('型号') || rowStr.includes('编号') || rowStr.includes('大类') || rowStr.includes('数量') || rowStr.includes('MPN') || rowStr.includes('C编号')) {
      headerIdx = i;
      row.forEach((col, cIdx) => {
        const h = col.trim().toLowerCase();
        if (h.includes('大类') || h.includes('分类') || h === 'category') colMap.category = cIdx;
        else if (h.includes('厂家型号') || h.includes('器件型号') || h.includes('型号') || h === 'pm' || h === 'mpn') colMap.mpn = cIdx;
        else if (h.includes('立创编号') || h.includes('编号') || h === 'pc' || h === 'c_code') colMap.c_code = cIdx;
        else if (h.includes('品牌') || h === 'brand') colMap.brand = cIdx;
        else if (h.includes('参数') || h.includes('阻值') || h.includes('容值') || h.includes('规格') || h === 'spec') colMap.spec = cIdx;
        else if (h.includes('封装') || h === 'package' || h === 'pkg') colMap.package_name = cIdx;
        else if (h.includes('库存') || h.includes('数量') || h === 'qty' || h === 'stock') colMap.stock = cIdx;
        else if (h.includes('仓位') || h.includes('位置') || h === 'loc' || h === 'location') colMap.location_text = cIdx;
        else if (h.includes('备注') || h.includes('订单') || h === 'order_no' || h === 'remark') colMap.order_no = cIdx;
      });
      break;
    }
  }

  const startRow = headerIdx !== -1 ? headerIdx + 1 : 0;
  for (let r = startRow; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length < 2) continue;

    let cat = colMap.category !== -1 ? cols[colMap.category] : cols[0];
    let mpn = colMap.mpn !== -1 ? cols[colMap.mpn] : (cols[1] || cols[0]);
    let cCode = colMap.c_code !== -1 ? cols[colMap.c_code] : (cols[2] || '');
    let brand = colMap.brand !== -1 ? cols[colMap.brand] : (cols[3] || '');
    let spec = colMap.spec !== -1 ? cols[colMap.spec] : (cols[4] || '');
    let pkg = colMap.package_name !== -1 ? cols[colMap.package_name] : (cols[5] || '');
    let stock = colMap.stock !== -1 ? parseInt(cols[colMap.stock], 10) : (parseInt(cols[6], 10) || 10);
    let loc = colMap.location_text !== -1 ? cols[colMap.location_text] : (cols[8] || cols[7] || '');
    let remark = colMap.order_no !== -1 ? cols[colMap.order_no] : (cols[9] || '');

    if (!cCode && mpn && mpn.toUpperCase().startsWith('C') && /^C\d{4,9}$/i.test(mpn)) {
      cCode = mpn.toUpperCase();
    }
    if (!mpn && cCode) {
      mpn = cCode;
    }

    if (mpn || cCode) {
      items.push({
        category: cat || '',
        mpn: mpn || cCode,
        c_code: cCode ? (cCode.toUpperCase().startsWith('C') ? cCode.toUpperCase() : 'C' + cCode) : '',
        brand: brand || '',
        spec: spec || '',
        package_name: pkg || '',
        stock: isNaN(stock) ? 10 : stock,
        location_text: loc || '',
        order_no: remark || ''
      });
    }
  }

  return items;
}

/**
 * Main parser entry for Excel (.xlsx ArrayBuffer or text CSV)
 */
function parseExcelData(fileBufferOrText) {
  if (!fileBufferOrText) return [];

  // 1. If it's a string, parse as CSV/TSV
  if (typeof fileBufferOrText === 'string') {
    const rows = parseCsvOrTsv(fileBufferOrText);
    return convertRowsToComponents(rows);
  }

  // 2. If it's an ArrayBuffer (binary XLSX)
  if (fileBufferOrText instanceof ArrayBuffer) {
    try {
      const zipFiles = parseZipEntries(fileBufferOrText);
      const sheetKey = Object.keys(zipFiles).find(k => k.includes('sheet1.xml')) || 'xl/worksheets/sheet1.xml';
      const stringsKey = Object.keys(zipFiles).find(k => k.includes('sharedStrings.xml')) || 'xl/sharedStrings.xml';

      const sheetXml = zipFiles[sheetKey];
      const stringsXml = zipFiles[stringsKey];

      if (!sheetXml) {
        throw new Error('未找到 sheet1 工作表数据');
      }

      const rows = parseXlsxXml(sheetXml, stringsXml);
      return convertRowsToComponents(rows);
    } catch (err) {
      // Fallback: try decoding ArrayBuffer as UTF-8 CSV string
      try {
        const textStr = uint8ToString(new Uint8Array(fileBufferOrText));
        if (textStr && (textStr.includes(',') || textStr.includes('\t') || textStr.includes('\n'))) {
          const rows = parseCsvOrTsv(textStr);
          return convertRowsToComponents(rows);
        }
      } catch (e2) {}
      throw err;
    }
  }

  return [];
}

module.exports = {
  parseExcelData,
  parseCsvOrTsv,
  convertRowsToComponents
};
