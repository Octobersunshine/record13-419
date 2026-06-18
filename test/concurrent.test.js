const http = require('http');

const HOST = 'localhost';
const PORT = 3000;
const CONCURRENT_REQUESTS = 1000;
const TEST_IP = '120.24.78.68';

function sendRequest(ip) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      event: 'page_view',
      page: '/test',
    });

    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/track',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Forwarded-For': ip,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getStats() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}/api/stats/summary`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function clearStats() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/stats/clear',
      method: 'POST',
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest() {
  console.log('========================================');
  console.log('并发测试 - 竞态条件验证');
  console.log('========================================\n');

  console.log(`1. 清空统计数据...`);
  await clearStats();
  console.log('   ✓ 已清空\n');

  console.log(`2. 发送 ${CONCURRENT_REQUESTS} 个并发请求 (同一 IP)...`);
  const startTime = Date.now();

  const promises = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    promises.push(sendRequest(TEST_IP));
  }

  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.success).length;
  const elapsed = Date.now() - startTime;

  console.log(`   ✓ 完成 - 成功 ${successCount}/${CONCURRENT_REQUESTS}, 耗时 ${elapsed}ms\n`);

  console.log(`3. 等待统计数据落盘...`);
  await new Promise(r => setTimeout(r, 1000));
  console.log('   ✓ 等待完成\n');

  console.log(`4. 获取统计结果...`);
  const stats = await getStats();
  console.log(`   总访问量: ${stats.data.totalVisits}`);
  console.log(`   独立 IP: ${stats.data.uniqueIps}`);
  console.log(`   省份覆盖: ${stats.data.provinceCount}\n`);

  const expected = CONCURRENT_REQUESTS;
  const actual = stats.data.totalVisits;
  const diff = expected - actual;

  console.log('========================================');
  console.log('测试结果');
  console.log('========================================');
  console.log(`期望计数: ${expected}`);
  console.log(`实际计数: ${actual}`);
  console.log(`差值: ${diff}`);
  console.log(`丢失率: ${((diff / expected) * 100).toFixed(2)}%`);

  if (diff === 0) {
    console.log('\n✓ PASS - 没有数据丢失');
  } else {
    console.log('\n✗ FAIL - 存在数据丢失（竞态条件）');
  }
  console.log('========================================');
}

runTest().catch(console.error);
