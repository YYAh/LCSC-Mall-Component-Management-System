/**
 * Electronic Component Smart Classifier, Package Recognizer & Brand Extractor
 * 电子元器件智能分类、阻容严格前缀解码、封装识别与真实品牌识别引擎
 * 包含标准 52+ 大类及动态自定义类别扩展
 */

const CATEGORY_RULES = [
  // 1. 定时器/逻辑/接口
  {
    category: '555定时器/计时器',
    patterns: [/NE555/i, /LM555/i, /SE555/i, /555定时器/i, /计时器/i]
  },
  {
    category: 'DC-DC电源芯片',
    patterns: [/DC-DC/i, /降压芯片/i, /升压芯片/i, /MP1482/i, /MP2307/i, /TPS54/i, /XL4015/i, /XL1509/i, /MT2492/i, /SY8088/i, /SY8089/i, /BUCK/i, /BOOST/i]
  },
  {
    category: 'FET输入运放',
    patterns: [/FET输入/i, /TL072/i, /TL082/i, /TL074/i, /OPA1642/i, /OPA1656/i, /OPA2134/i]
  },
  {
    category: 'FFC连接线(柔性扁平线缆)',
    patterns: [/FFC/i, /FPC连接/i, /扁平线缆/i, /柔性排线/i, /柔性扁平/i]
  },
  {
    category: 'NOR FLASH',
    patterns: [/NOR FLASH/i, /W25Q/i, /GD25Q/i, /XT25F/i, /EN25Q/i, /FLASH/i, /SPI FLASH/i]
  },
  {
    category: 'RGB LED(内置IC)',
    patterns: [/WS2812/i, /SK6812/i, /APA102/i, /内置IC.*LED/i, /内置驱动LED/i]
  },
  {
    category: 'RGB LED',
    patterns: [/RGB LED/i, /三色LED/i, /全彩LED/i, /RGB三色/i]
  },
  {
    category: 'USB连接器',
    patterns: [/TYPE-C/i, /MICRO-USB/i, /MINI-USB/i, /USB-A/i, /USB母座/i, /USB插头/i, /USB连接器/i]
  },
  {
    category: 'USB转换芯片',
    patterns: [/CH340/i, /CH343/i, /CH9102/i, /CP2102/i, /FT232/i, /PL2303/i, /USB转串口/i, /USB转换/i]
  },
  {
    category: 'WiFi模块',
    patterns: [/WiFi模块/i, /ESP-12/i, /ESP-01/i, /RTL8720/i, /无线模组/i, /蓝牙WiFi/i]
  },
  {
    category: '按键开关',
    patterns: [/按键开关/i, /自锁按键/i, /无锁按键/i, /按钮开关/i, /PB开关/i]
  },
  {
    category: '拨码开关',
    patterns: [/TPGT/i, /拨码开关/i, /DIP SWITCH/i, /2\.54-4P/i, /2\.54-\d+P/i, /拨码/i]
  },
  {
    category: '场效应管(MOSFET)',
    patterns: [/AO3400/i, /AO3401/i, /SI2301/i, /SI2302/i, /2N7002/i, /BSS138/i, /MOSFET/i, /场效应管/i, /NMOS/i, /PMOS/i, /AOD4184/i, /NCE/i, /MOS/i]
  },
  {
    category: '触摸芯片',
    patterns: [/TTP223/i, /TTP229/i, /触摸芯片/i, /TOUCH IC/i, /触摸按键芯片/i]
  },
  {
    category: '磁珠',
    patterns: [/磁珠/i, /BEAD/i, /BLM18/i, /CBG/i, /FCM/i, /EMI磁珠/i]
  },
  {
    category: '单片机(MCU/MPU/SOC)',
    patterns: [/STM32/i, /GD32/i, /STC89/i, /STC15/i, /STC8/i, /ATMEGA/i, /ATTINY/i, /RP2040/i, /CH552/i, /ESP32/i, /单片机/i, /MCU/i, /MPU/i, /SOC/i]
  },
  {
    category: '电池管理',
    patterns: [/TP4056/i, /IP2312/i, /CN3791/i, /BQ24/i, /电池管理/i, /充电管理/i, /锂电保护/i, /DW01/i]
  },
  {
    category: '电荷泵',
    patterns: [/ICL7660/i, /MAX232/i, /MAX660/i, /电荷泵/i, /CHARGE PUMP/i]
  },
  {
    category: '电流采样电阻/分流器',
    patterns: [/采样电阻/i, /分流器/i, /WSL/i, /毫欧电阻/i, /0\.01R/i, /0\.05R/i, /0\.1R.*电阻/i, /取样电阻/i]
  },
  {
    category: '电流感应放大器',
    patterns: [/INA199/i, /INA219/i, /INA240/i, /INA282/i, /MAX4080/i, /电流感应/i, /电流检测放大/i]
  },
  {
    category: '电压基准芯片',
    patterns: [/TL431/i, /REF02/i, /REF192/i, /REF3025/i, /电压基准/i, /基准电压/i]
  },
  {
    category: '发光二极管/LED',
    patterns: [/发光二极管/i, /0603LED/i, /0805LED/i, /LED灯珠/i, /LED/i]
  },
  {
    category: '功率电感',
    patterns: [/功率电感/i, /贴片电感/i, /一体成型电感/i, /CD43/i, /CD54/i, /NR4030/i, /SWPA/i, /绕线电感/i, /电感/i]
  },
  {
    category: '共模滤波器',
    patterns: [/共模滤波器/i, /共模电感/i, /COMMON MODE/i, /CMC/i]
  },
  {
    category: '固态电容',
    patterns: [/固态电容/i, /固态铝电解/i, /导电高分子/i]
  },
  {
    category: '固态继电器(MOS输出)',
    patterns: [/固态继电器/i, /AQY210/i, /AQW214/i, /光耦继电器/i, /SSR/i]
  },
  {
    category: '滑动开关',
    patterns: [/滑动开关/i, /拨动开关/i, /SS-12D/i, /SK-12D/i, /侧拨开关/i]
  },
  {
    category: '精密运放',
    patterns: [/OP07/i, /OPA277/i, /OPA333/i, /ADA4077/i, /精密运放/i, /低失调运放/i]
  },
  {
    category: '静电和浪涌保护(TVS/ESD)',
    patterns: [/ESD/i, /TVS/i, /SMAJ/i, /SMBJ/i, /SMCJ/i, /ESD5Z/i, /PESD/i, /USBLC6/i, /静电保护/i, /浪涌保护/i, /瞬态抑制/i]
  },
  {
    category: '可调电阻/电位器',
    patterns: [/3296/i, /3362/i, /电位器/i, /可调电阻/i, /TRIMMER/i, /微调电阻/i]
  },
  {
    category: '快充协议芯片',
    patterns: [/IP2721/i, /SW3516/i, /CH224/i, /QC3\.0/i, /PD协议/i, /快充协议/i, /诱骗芯片/i]
  },
  {
    category: '理想二极管/ORing控制器',
    patterns: [/LM66100/i, /LTC4357/i, /MAX40200/i, /理想二极管/i, /ORing/i, /防反接芯片/i]
  },
  {
    category: '轻触开关',
    patterns: [/K2-/i, /TS-/i, /TC-/i, /轻触开关/i, /微动按键/i, /TACT/i, /轻触按键/i]
  },
  {
    category: '人体感应传感器',
    patterns: [/BISS0001/i, /PIR/i, /人体感应/i, /红外传感器/i, /热释电/i]
  },
  {
    category: '三极管(BJT)',
    patterns: [/SS8050/i, /SS8550/i, /S9013/i, /S9014/i, /S9012/i, /S9015/i, /2N3904/i, /2N3906/i, /2N2222/i, /2N5551/i, /三极管/i, /BJT/i, /NPN/i, /PNP/i]
  },
  {
    category: '贴片电容(MLCC)',
    patterns: [/CL10/i, /CL21/i, /CL05/i, /CL31/i, /GRM/i, /CC0603/i, /CC0805/i, /MLCC/i, /贴片电容/i, /\d+uF/i, /\d+nF/i, /\d+pF/i, /X7R/i, /X5R/i, /C0G/i]
  },
  {
    category: '贴片电阻',
    patterns: [/FRC/i, /0603W/i, /0805W/i, /0402W/i, /1206W/i, /RC0603/i, /RC0805/i, /厚膜电阻/i, /贴片电阻/i, /\d+kΩ/i, /\d+MΩ/i, /\d+Ω/i]
  },
  {
    category: '贴片型铝电解电容',
    patterns: [/贴片型铝电解/i, /贴片电解电容/i, /VT系列/i, /铝电解/i]
  },
  {
    category: '通用二极管',
    patterns: [/1N4007/i, /1N4148/i, /M7/i, /US1M/i, /通用二极管/i, /整流二极管/i, /二极管/i]
  },
  {
    category: '温度传感器',
    patterns: [/DS18B20/i, /LM35/i, /TMP36/i, /NTC温度/i, /SHT30/i, /温度传感器/i]
  },
  {
    category: '稳压二极管',
    patterns: [/BZX/i, /Zener/i, /稳压管/i, /稳压二极管/i, /1N47/i, /齐纳/i]
  },
  {
    category: '无源晶振',
    patterns: [/无源晶振/i, /HC-49S/i, /3225-4P/i, /32\.768K/i, /12MHz/i, /16MHz/i, /8MHz/i, /24MHz/i, /晶振/i]
  },
  {
    category: '线对板针座',
    patterns: [/XH2\.54/i, /PH2\.0/i, /VH3\.96/i, /线对板/i, /针座/i, /WAFER/i, /接插件/i]
  },
  {
    category: '线性稳压器(LDO)',
    patterns: [/LM317/i, /AMS1117/i, /ME6211/i, /LP2985/i, /XC6206/i, /HT7333/i, /7805/i, /7812/i, /78M/i, /线性稳压/i, /LDO/i]
  },
  {
    category: '肖特基二极管',
    patterns: [/SS14/i, /SS24/i, /SS34/i, /SS54/i, /1N5819/i, /BAT54/i, /MBR/i, /肖特基/i]
  },
  {
    category: '信号继电器',
    patterns: [/信号继电器/i, /HK4100/i, /HRS4H/i, /EA2/i, /电磁继电器/i]
  },
  {
    category: '信号开关/编解码器/多路复用器',
    patterns: [/CD4051/i, /CD4052/i, /CD4053/i, /74HC4051/i, /74HC138/i, /74HC595/i, /多路复用/i, /编解码器/i, /模拟开关/i]
  },
  {
    category: '有源晶振',
    patterns: [/有源晶振/i, /OSC/i, /TCXO/i, /VCXO/i, /SPXO/i, /钟振/i]
  },
  {
    category: '运算放大器',
    patterns: [/LM358/i, /LM324/i, /LM393/i, /TLV2374/i, /OPA197/i, /NE5532/i, /RC4558/i, /运算放大器/i, /运放/i]
  },
  {
    category: '栅极驱动芯片',
    patterns: [/TC4420/i, /IR2104/i, /IR2110/i, /EG2104/i, /栅极驱动/i, /MOS驱动/i]
  },
  {
    category: '自恢复保险丝',
    patterns: [/自恢复保险丝/i, /PPTC/i, /JK60/i, /JK30/i, /JK16/i, /FUSE/i, /保险丝/i]
  },
  {
    category: '未分类',
    patterns: [/未分类/i, /未定义/i]
  }
];

// Comprehensive Brand Database
const BRAND_RULES = [
  { brand: 'FOJAN(富捷)', patterns: [/FRC/i, /FOJAN/i, /富捷/i] },
  { brand: '厚声(UniOhm)', patterns: [/0603W/i, /0805W/i, /0402W/i, /1206W/i, /UniOhm/i, /厚声/i] },
  { brand: '国巨(YAGEO)', patterns: [/RC0603/i, /RC0805/i, /RC0402/i, /CC0603/i, /CC0805/i, /YAGEO/i, /国巨/i] },
  { brand: '三星(SAMSUNG)', patterns: [/CL10/i, /CL21/i, /CL05/i, /CL31/i, /SAMSUNG/i, /三星/i] },
  { brand: 'SHOU HAN(首韩)', patterns: [/TPGT/i, /首韩/i, /SHOU HAN/i] },
  { brand: '韩国韩荣(HRO)', patterns: [/TF-01A/i, /TF-/i, /K2-/i, /K2-1102/i, /韩荣/i, /HRO/i] },
  { brand: 'Megastar(兆星)', patterns: [/2\.54-4P/i, /XH2\.54/i, /PH2\.0/i, /兆星/i] },
  { brand: '村田(Murata)', patterns: [/GRM/i, /Murata/i, /村田/i] },
  { brand: '长晶科技(JSCJ)', patterns: [/SS8050/i, /SS8550/i, /S9013/i, /S9014/i, /S9012/i, /S9015/i, /JSCJ/i, /长晶/i, /CJ/i] },
  { brand: 'UMW(友台半导体)', patterns: [/LM317G/i, /AMS1117/i, /UMW/i, /友台/i] },
  { brand: '意法半导体(ST)', patterns: [/STM32/i, /STM8/i, /STMicroelectronics/i, /^ST[A-Z]/i] },
  { brand: '乐鑫科技(Espressif)', patterns: [/ESP32/i, /ESP8266/i, /Espressif/i, /乐鑫/i] },
  { brand: '沁恒微(WCH)', patterns: [/CH340/i, /CH343/i, /CH9102/i, /CH552/i, /WCH/i, /沁恒/i] },
  { brand: '德州仪器(TI)', patterns: [/NE555/i, /LM358/i, /LM393/i, /LM324/i, /TLV/i, /OPA/i, /INA/i, /TPS/i, /德州仪器/i, /TI/i] },
  { brand: '微芯科技(Microchip)', patterns: [/ATMEGA/i, /ATTINY/i, /PIC16/i, /PIC18/i, /Microchip/i, /Atmel/i] },
  { brand: '兆易创新(GigaDevice)', patterns: [/GD32/i, /GD25Q/i, /GigaDevice/i, /兆易/i] },
  { brand: '宏晶科技(STC)', patterns: [/STC89/i, /STC15/i, /STC8/i, /STC/i, /宏晶/i] },
  { brand: '万宝至/万代(AOS)', patterns: [/AO3400/i, /AO3401/i, /AO4407/i, /AOD/i, /AOS/i] },
  { brand: '美台(DIODES)', patterns: [/BSS138/i, /2N7002/i, /Diodes/i, /美台/i] },
  { brand: '台湾亿光(Everlight)', patterns: [/EL357/i, /Everlight/i, /亿光/i] },
  { brand: '光宝科技(LITE-ON)', patterns: [/LTV/i, /Lite-On/i, /光宝/i] },
  { brand: '顺络电子(Sunlord)', patterns: [/Sunlord/i, /顺络/i] },
  { brand: '风华高科(FH)', patterns: [/FH/i, /风华/i] }
];

const PACKAGE_RULES = [
  /0201/, /0402/, /0603/, /0805/, /1206/, /1210/, /2010/, /2512/,
  /SOT-23(-\d+)?/i, /SOT-223/i, /SOT-89/i, /SOD-123/i, /SOD-323/i, /SOD-523/i, /SMA/i, /SMB/i, /SMC/i,
  /SOP-8/i, /SOP-14/i, /SOP-16/i, /SOIC-8/i, /SOIC-16/i, /TSSOP-\d+/i, /MSOP-\d+/i,
  /QFN-\d+/i, /LQFP-\d+/i, /QFP-\d+/i, /BGA-\d+/i,
  /TO-92/i, /TO-220/i, /TO-252/i, /TO-263/i,
  /KEY-SMD/i, /SMD-4P/i, /DIP-\d+/i
];

function decodeResistorSpec(mpn) {
  if (!mpn) return null;
  const m = mpn.trim().toUpperCase();
  const isRes = /^FRC\d{4}/i.test(m) || /^\d{4}W[A-Z0-9]+/i.test(m) || /^RC\d{4}/i.test(m) || /^AC\d{4}/i.test(m) || /^CR\d{4}/i.test(m) || /^CRG\d{4}/i.test(m) || /^WR\d{2}/i.test(m) || /^RES[-_]/i.test(m);
  if (!isRes) return null;

  const pkgMatch = m.match(/(0201|0402|0603|0805|1206|1210|1812|2010|2512)/i);
  const pkg = pkgMatch ? pkgMatch[1] : '';

  let afterPkg = m;
  if (pkgMatch) {
    afterPkg = m.slice(pkgMatch.index + pkgMatch[0].length);
  }

  let tol = '';
  const tolMatch = afterPkg.match(/([FJDKB])/i);
  if (tolMatch) {
    const t = tolMatch[1].toUpperCase();
    if (t === 'F') tol = '±1%';
    else if (t === 'J') tol = '±5%';
    else if (t === 'D') tol = '±0.5%';
    else if (t === 'B') tol = '±0.1%';
  }

  let valStr = '';
  const rMatch = afterPkg.match(/([0-9]{3,4}|[0-9]*R[0-9]*)/i);
  if (rMatch && rMatch[1]) {
    const code = rMatch[1].toUpperCase();
    if (code.includes('R')) {
      valStr = code.replace('R', '.') + 'Ω';
    } else if (code.length === 4) {
      const sig = parseInt(code.slice(0, 3), 10);
      const mult = parseInt(code.slice(3), 10);
      const val = sig * Math.pow(10, mult);
      if (val >= 1000000) valStr = (val / 1000000) + 'MΩ';
      else if (val >= 1000) valStr = (val / 1000) + 'kΩ';
      else valStr = val + 'Ω';
    } else if (code.length === 3) {
      const sig = parseInt(code.slice(0, 2), 10);
      const mult = parseInt(code.slice(2), 10);
      const val = sig * Math.pow(10, mult);
      if (val >= 1000000) valStr = (val / 1000000) + 'MΩ';
      else if (val >= 1000) valStr = (val / 1000) + 'kΩ';
      else valStr = val + 'Ω';
    }
  }

  if (valStr) {
    return {
      pkg,
      spec: `厚膜电阻 ${valStr}${tol ? ' ' + tol : ''}`,
      valStr
    };
  }
  return null;
}

function decodeCapacitorSpec(mpn) {
  if (!mpn) return null;
  const m = mpn.trim().toUpperCase();
  const isCap = /^CL\d{2}/i.test(m) || /^GRM\d{2}/i.test(m) || /^CC\d{4}/i.test(m) || /^\d{4}[A-Z]\d{3}[A-Z]/i.test(m) || /^CAP[-_]/i.test(m);
  if (!isCap) return null;

  let pkg = '';
  if (/CL05|0402/i.test(m)) pkg = '0402';
  else if (/CL10|GRM18|0603|CC0603/i.test(m)) pkg = '0603';
  else if (/CL21|GRM21|0805|CC0805/i.test(m)) pkg = '0805';
  else if (/CL31|GRM31|1206|CC1206/i.test(m)) pkg = '1206';

  let capVal = '';
  const capMatch = m.match(/(100|101|102|103|104|105|106|220|221|222|223|224|225|226|470|471|472|473|474|475|476|330|331|332|333|334|335|150|151|152|153|154|155)/);
  if (capMatch) {
    const code = capMatch[1];
    const sig = parseInt(code.slice(0, 2), 10);
    const mult = parseInt(code.slice(2), 10);
    const pF = sig * Math.pow(10, mult);
    if (pF >= 1000000) {
      capVal = (pF / 1000000) + 'uF';
    } else if (pF >= 1000) {
      capVal = (pF / 1000) + 'nF';
    } else {
      capVal = pF + 'pF';
    }
  }

  let volt = '';
  if (/500|50V|8NNN|9BB|H10/i.test(m)) volt = '50V';
  else if (/250|25V|A10|E10/i.test(m)) volt = '25V';
  else if (/160|16V|O10/i.test(m)) volt = '16V';
  else if (/100|10V|P10/i.test(m)) volt = '10V';
  else if (/6R3|6.3V|Q10/i.test(m)) volt = '6.3V';
  else if (/100V|101/i.test(m)) volt = '100V';

  let die = '';
  if (/X7R/i.test(m)) die = 'X7R';
  else if (/X5R/i.test(m)) die = 'X5R';
  else if (/C0G|NPO/i.test(m)) die = 'C0G';

  if (capVal) {
    const parts = ['贴片电容', capVal];
    if (volt) parts.push(volt);
    if (die) parts.push(die);
    return {
      pkg,
      capVal,
      spec: parts.join(' ')
    };
  }
  return null;
}

function classifyComponent(rawInfo = {}) {
  const cCode = rawInfo.c_code || '';
  const mpn = rawInfo.mpn || '';
  const name = rawInfo.name || '';
  const initialBrand = rawInfo.brand;
  const initialCategory = rawInfo.category;

  const combinedText = `${cCode} ${mpn} ${name} ${initialCategory || ''} ${initialBrand || ''}`.trim();

  // 1. Determine Category
  let category = initialCategory && initialCategory !== '通用元器件' && initialCategory !== '常用电子器件' ? initialCategory : '';
  if (!category) {
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some(p => p.test(combinedText))) {
        category = rule.category;
        break;
      }
    }
  }
  if (!category) {
    category = '常用电子器件';
  }

  // 2. Extract Package / Footprint
  let pkg = rawInfo.package_name || '';
  if (!pkg || pkg === 'KEY-SMD_4P-L6.0-W6.0-P4.50-LS9.5-BL' || pkg.length > 25) {
    if (combinedText.includes('0603') || /CL10/i.test(combinedText)) pkg = '0603';
    else if (combinedText.includes('0805') || /CL21/i.test(combinedText)) pkg = '0805';
    else if (combinedText.includes('0402') || /CL05/i.test(combinedText)) pkg = '0402';
    else if (combinedText.includes('1206') || /CL31/i.test(combinedText)) pkg = '1206';
    else if (/SS8050|SS8550|S9013|S9014|2N3904|2N7002|BSS138|AO3400/i.test(combinedText)) pkg = 'SOT-23';
    else if (/LM317G|AMS1117/i.test(combinedText)) pkg = 'SOT-223';
    else if (combinedText.includes('SOP-8') || /LM358|NE555|CH340N/i.test(combinedText)) pkg = 'SOP-8';
    else if (combinedText.includes('SOP-14') || /TLV2374/i.test(combinedText)) pkg = 'SOP-14';
    else if (combinedText.includes('SOP-16') || /CH340G/i.test(combinedText)) pkg = 'SOP-16';
    else if (/SOT-23-5|OPA197/i.test(combinedText)) pkg = 'SOT-23-5';
    else if (/SOD-123|1N4007W/i.test(combinedText)) pkg = 'SOD-123';
    else if (/SOD-523|ESD5Z/i.test(combinedText)) pkg = 'SOD-523';
    else if (/SMA|SMAJ/i.test(combinedText)) pkg = 'SMA(DO-214AC)';
    else if (/KEY|开关|微动|K2-1102|ZX-QC4545/i.test(combinedText)) pkg = 'SMD-4P,4.5x4.5mm';
    else if (/TPGT|拨码/i.test(combinedText)) pkg = 'SMD,P=2.54mm';
    else {
      for (const pRule of PACKAGE_RULES) {
        const m = combinedText.match(pRule);
        if (m) {
          pkg = m[0].toUpperCase();
          break;
        }
      }
    }
  }

  // 3. Extract Spec / Parameter Value
  let spec = '';
  const rDecoded = decodeResistorSpec(mpn);
  const cDecoded = decodeCapacitorSpec(mpn);

  if (rDecoded) {
    spec = rDecoded.spec;
    if (!pkg && rDecoded.pkg) pkg = rDecoded.pkg;
  } else if (cDecoded) {
    spec = cDecoded.spec;
    if (!pkg && cDecoded.pkg) pkg = cDecoded.pkg;
  } else if (name && (name.includes('Ω') || /[0-9.]+\s*(kΩ|MΩ|mΩ|Ω|uF|nF|pF|V|mA|A)\b/i.test(name) || /X7R|X5R|C0G/i.test(name))) {
    spec = name;
  } else if (rawInfo.spec && rawInfo.spec !== mpn && rawInfo.spec !== '常用电子器件' && rawInfo.spec !== '贴片电阻') {
    spec = rawInfo.spec;
  } else {
    spec = `${pkg ? pkg + ' ' : ''}${category}`;
  }

  // 4. Extract Real Brand
  let cleanBrand = initialBrand && initialBrand !== '标准/通用' && initialBrand !== '标准' && initialBrand !== '国产优质/通用' ? initialBrand : '';
  if (!cleanBrand) {
    for (const bRule of BRAND_RULES) {
      if (bRule.patterns.some(p => p.test(combinedText))) {
        cleanBrand = bRule.brand;
        break;
      }
    }
  }
  if (!cleanBrand) {
    cleanBrand = '国产优质/通用';
  }

  return {
    category,
    package_name: pkg,
    spec,
    brand: cleanBrand
  };
}

module.exports = {
  classifyComponent,
  decodeResistorSpec,
  decodeCapacitorSpec,
  CATEGORY_RULES,
  BRAND_RULES
};
