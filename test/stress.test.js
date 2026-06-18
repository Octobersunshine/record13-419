const http = require('http');

const HOST = 'localhost';
const PORT = 3000;

const TEST_IPS = [
  '120.24.78.68',
  '114.114.114.114',
  '223.5.5.5',
  '119.29.29.29',
  '180.101.50.188',
  '123.125.81.6',
  '61.135.169.121',
  '211.161.46.81',
  '117.25.128.110',
  '113.207.27.227',
  '116.248.152.131',
  '111.175.221.83',
  '183.230.198.251',
  '61.187.87.2',
  '59.52.25.233',
  '1.1.1.1',
  '8.8.8.8',
  '112.65.36.234',
  '124.232.148.200',
  '58.211.87.205',
];

function sendRequest(ip) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ event: 'page_view', page: '/test' });
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
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getProvinceStats() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}/api/stats/provinces`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getSummary() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}/api/stats/summary`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
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

async function runStressTest() {
  console.log('========================================');
  console.log('压力测试 - 批处理模式验证');
  console.log('========================================\n');

  const TOTAL_REQUESTS = 10000;
  const BATCH_SIZE = 100;

  console.log(`测试配置:`);
  console.log(`  总请求数: ${TOTAL_REQUESTS}`);
  console.log(`  并发批次: ${TOTAL_REQUESTS / BATCH_SIZE}`);
  console.log(`  每批大小: ${BATCH_SIZE}`);
  console.log(`  不同 IP 数: ${TEST_IPS.length}\n`);

  console.log('1. 清空统计数据...');
  await clearStats();
  console.log('   ✓ 已清空\n');

  console.log('2. 开始压力测试...');
  const startTime = Date.now();

  let sent = 0;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < TOTAL_REQUESTS; i += BATCH_SIZE) {
    const batch = [];
    for (let j = 0; j < BATCH_SIZE && i + j < TOTAL_REQUESTS; j++) {
      const ip = TEST_IPS[(i + j) % TEST_IPS.length];
      batch.push(sendRequest(ip).then(() => { success++; }).catch(() => { failed++; }));
      sent++;
    }
    await Promise.all(batch);
  }

  const elapsed = Date.now() - startTime;
  const qps = Math.round(TOTAL_REQUESTS / (elapsed / 1000));

  console.log(`   ✓ 完成`);
  console.log(`     发送: ${sent}`);
  console.log(`     成功: ${success}`);
  console.log(`     失败: ${failed}`);
  console.log(`     耗时: ${elapsed}ms`);
  console.log(`     QPS:  ${qps}\n`);

  console.log('3. 等待批量刷新完成...');
  await new Promise(r => setTimeout(r, 500));
  console.log('   ✓ 等待完成\n');

  console.log('4. 验证统计结果...');
  const summary = await getSummary();
  const provinceStats = await getProvinceStats();

  const totalFromProvinces = provinceStats.data.reduce((sum, p) => sum + p.count, 0);

  console.log(`   总访问量 (summary): ${summary.data.totalVisits}`);
  console.log(`   总访问量 (省份求和): ${totalFromProvinces}`);
  console.log(`   独立 IP: ${summary.data.uniqueIps}`);
  console.log(`   省份覆盖: ${summary.data.provinceCount}\n`);

  console.log('5. 数据一致性校验...');
  let allPassed = true;

  if (summary.data.totalVisits !== TOTAL_REQUESTS) {
    console.log(`   ✗ 总访问量不匹配: 期望 ${TOTAL_REQUESTS}, 实际 ${summary.data.totalVisits}`);
    allPassed = false;
  } else {
    console.log(`   ✓ 总访问量匹配: ${summary.data.totalVisits}`);
  }

  if (summary.data.totalVisits !== totalFromProvinces) {
    console.log(`   ✗ 省份求和与总访问量不一致: ${totalFromProvinces} vs ${summary.data.totalVisits}`);
    allPassed = false;
  } else {
    console.log(`   ✓ 省份求和与总访问量一致`);
  }

  if (summary.data.uniqueIps !== TEST_IPS.length) {
    console.log(`   ✗ 独立 IP 数不匹配: 期望 ${TEST_IPS.length}, 实际 ${summary.data.uniqueIps}`);
    allPassed = false;
  } else {
    console.log(`   ✓ 独立 IP 数匹配: ${summary.data.uniqueIps}`);
  }

  console.log(`\n========================================`);
  if (allPassed) {
    console.log('✓ PASS - 所有校验通过，批处理模式工作正常');
  } else {
    console.log('✗ FAIL - 存在数据不一致问题');
  }
  console.log('========================================');
  console.log(`\n性能指标:`);
  console.log(`  吞吐量: ${qps} 请求/秒`);
  console.log(`  平均延迟: ${(elapsed / TOTAL_REQUESTS).toFixed(2)} ms/请求`);
  console.log('========================================');
}

runStressTest().catch(console.error);
