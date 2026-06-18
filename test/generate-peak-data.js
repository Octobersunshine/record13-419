const http = require('http');

const HOST = 'localhost';
const PORT = 3000;

const PROVINCE_IPS = [
  { province: '广东省', ip: '120.24.78.68', peakHours: [10, 14, 20, 21, 22] },
  { province: '浙江省', ip: '223.5.5.5', peakHours: [9, 10, 11, 20, 21] },
  { province: '江苏省', ip: '114.114.114.114', peakHours: [10, 14, 15, 21, 22] },
  { province: '北京', ip: '119.29.29.29', peakHours: [8, 9, 12, 19, 20] },
  { province: '上海', ip: '180.101.50.188', peakHours: [9, 12, 18, 21, 22] },
  { province: '四川省', ip: '117.25.128.110', peakHours: [11, 14, 15, 22, 23] },
  { province: '福建省', ip: '117.25.128.110', peakHours: [10, 14, 15, 20, 21] },
  { province: '湖北省', ip: '113.207.27.227', peakHours: [9, 10, 14, 21, 22] },
  { province: '山东省', ip: '116.248.152.131', peakHours: [8, 9, 12, 20, 21] },
  { province: '云南省', ip: '116.248.152.131', peakHours: [11, 14, 15, 23, 0] },
  { province: '湖南省', ip: '183.230.198.251', peakHours: [10, 14, 15, 20, 21] },
  { province: '重庆', ip: '61.187.87.2', peakHours: [11, 14, 15, 22, 23] },
];

function getTodayDateString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sendRequest(ip, timestamp) {
  return new Promise((resolve, reject) => {
    const dateStr = getTodayDateString();
    const hour = new Date(timestamp).getHours();
    const postData = JSON.stringify({
      event: 'page_view',
      page: `/test?hour=${hour}`,
      _timestamp: timestamp,
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
        'X-Test-Timestamp': timestamp.toString(),
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

function getTimestampForHour(hour, offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return date.getTime();
}

function weightedRandomHour(peakHours) {
  const allHours = [];
  for (let h = 0; h < 24; h++) {
    const weight = peakHours.includes(h) ? 5 : 1;
    for (let w = 0; w < weight; w++) {
      allHours.push(h);
    }
  }
  return allHours[Math.floor(Math.random() * allHours.length)];
}

async function generateTestData() {
  console.log('========================================');
  console.log('生成地域时段测试数据');
  console.log('========================================\n');

  console.log('1. 清空统计数据...');
  await clearStats();
  console.log('   ✓ 已清空\n');

  console.log('2. 生成模拟数据...');
  const totalPerProvince = 50;
  const startTime = Date.now();

  let totalGenerated = 0;
  let successCount = 0;

  for (const p of PROVINCE_IPS) {
    console.log(`   生成 ${p.province} 数据...`);
    const promises = [];

    for (let i = 0; i < totalPerProvince; i++) {
      const hour = weightedRandomHour(p.peakHours);
      const timestamp = getTimestampForHour(hour, 0);
      promises.push(
        sendRequest(p.ip, timestamp)
          .then(() => { successCount++; })
          .catch(() => {})
      );
      totalGenerated++;
    }

    await Promise.all(promises);
    await new Promise(r => setTimeout(r, 100));
  }

  const elapsed = Date.now() - startTime;
  console.log(`\n   ✓ 完成`);
  console.log(`     生成: ${totalGenerated} 条`);
  console.log(`     成功: ${successCount} 条`);
  console.log(`     耗时: ${elapsed}ms\n`);

  console.log('3. 等待批量刷新...');
  await new Promise(r => setTimeout(r, 1000));
  console.log('   ✓ 等待完成\n');

  console.log('4. 验证数据...');
  const verifyUrl = `http://${HOST}:${PORT}/api/stats/peak-analysis`;
  return new Promise((resolve, reject) => {
    http.get(verifyUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            console.log(`   ✓ 数据已生成`);
            console.log(`     覆盖省份: ${result.data.byProvince.length} 个`);
            console.log(`     总访问量: ${result.data.global.totalVisits}\n`);

            console.log('各省份高峰时段:');
            for (const p of result.data.byProvince) {
              const topHour = p.peakHours[0];
              const topPeriod = p.peakPeriods[0];
              console.log(`   ${p.province.padEnd(8)} | 高峰: ${topPeriod.period}(${topPeriod.percentage}) | 最佳时段: ${topHour.hourLabel}`);
            }

            console.log(`\n========================================`);
            console.log('测试数据生成完成！');
            console.log('========================================');
            console.log(`\n访问以下地址查看分析结果:`);
            console.log(`  http://${HOST}:${PORT}/`);
            console.log(`  http://${HOST}:${PORT}/api/stats/peak-analysis`);
            console.log(`  http://${HOST}:${PORT}/api/stats/peak-hours`);
            console.log(`  http://${HOST}:${PORT}/api/stats/hourly`);
            console.log('========================================\n');
            resolve();
          } else {
            reject(new Error('API 返回失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

generateTestData().catch(console.error);
