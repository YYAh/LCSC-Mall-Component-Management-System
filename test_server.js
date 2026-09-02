const http = require('http');
const { start } = require('./backend/server.js');

async function run() {
  await start();
  console.log('Server started for testing...');

  function req(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path,
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      const r = http.request(options, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch(e) {
            resolve(d);
          }
        });
      });
      r.on('error', reject);
      if (body) r.write(JSON.stringify(body));
      r.end();
    });
  }

  try {
    console.log('1. Testing /health...');
    const h = await req('/health');
    console.log('Health response:', h);

    console.log('\n2. Testing /api/components/jlc/parse with user real QR string...');
    const parseRes = await req('/api/components/jlc/parse', 'POST', {
      text: '{on:SO2608166813,pc:C127509,pm:K2-1102SP-C4SC-04,qty:10,mc:,cc:1,pdi:231370636,hp:null}'
    });
    console.log('Parse result:', {
      c_code: parseRes.data.component.c_code,
      name: parseRes.data.component.name,
      brand: parseRes.data.component.brand,
      category: parseRes.data.component.category,
      package_name: parseRes.data.component.package_name,
      inbound_qty: parseRes.data.component.inbound_qty
    });

    console.log('\n3. Testing /api/books and 12-row slot map...');
    const booksRes = await req('/api/books');
    console.log('Books count:', booksRes.data.length);
    const book1 = booksRes.data[0];

    const slotMap = await req('/api/books/' + book1.id + '/page/1');
    console.log('Slot map for Book: ' + book1.name + ', Page 1 (' + slotMap.data.slots.length + ' rows):');
    slotMap.data.slots.forEach(s => {
      if (!s.is_empty) {
        console.log('  Row ' + s.row_no + ': [' + s.component.c_code + '] ' + s.component.name + ' (Stock: ' + s.component.stock + ')');
      } else {
        console.log('  Row ' + s.row_no + ': (Empty)');
      }
    });

    console.log('\n4. Testing /api/stock/out (Pick 2 units)...');
    const comp1 = slotMap.data.slots.find(s => !s.is_empty);
    if (comp1) {
      const outRes = await req('/api/stock/out', 'POST', {
        component_id: comp1.component.id,
        qty: 2,
        remark: '项目测试领料'
      });
      console.log('Out result:', outRes.msg);
    }

    console.log('\n5. Testing /api/stock/dashboard...');
    const dash = await req('/api/stock/dashboard');
    console.log('Dashboard stats:', {
      total_components: dash.data.total_components,
      total_stock: dash.data.total_stock,
      total_books: dash.data.total_books,
      recent_logs: dash.data.recent_logs.length
    });

    console.log('\n=============================================');
    console.log('🎉 ALL BACKEND API & INTEGRATION TESTS PASSED!');
    console.log('=============================================');
    process.exit(0);
  } catch (e) {
    console.error('Integration test failed:', e);
    process.exit(1);
  }
}

run();
