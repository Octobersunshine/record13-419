const express = require('express');
const path = require('path');
const { ipExtractor } = require('./src/middleware/ipExtractor');
const trackRouter = require('./src/routes/track');
const statsRouter = require('./src/routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(ipExtractor);

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleString('zh-CN')}] ${req.method} ${req.url} - IP: ${req.clientIp}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ip: req.clientIp,
    timestamp: new Date().toLocaleString('zh-CN'),
  });
});

app.use('/api', trackRouter);
app.use('/api/stats', statsRouter);

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
  });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`埋点统计服务已启动`);
  console.log(`服务地址: http://localhost:${PORT}`);
  console.log(`========================================`);
  console.log(`\nAPI 接口列表:`);
  console.log(`  GET  /api/health              - 健康检查`);
  console.log(`  POST /api/track               - 埋点上报 (JSON)`);
  console.log(`  GET  /api/track               - 埋点上报 (像素图)`);
  console.log(`  GET  /api/stats/summary       - 获取统计摘要`);
  console.log(`  GET  /api/stats/provinces     - 获取省份统计`);
  console.log(`  GET  /api/stats/ips           - 获取 IP 统计`);
  console.log(`  GET  /api/stats/hourly        - 获取按时段统计`);
  console.log(`  GET  /api/stats/peak-hours    - 获取省份高峰时段`);
  console.log(`  GET  /api/stats/peak-analysis - 获取峰值时段分析(含运营建议)`);
  console.log(`  POST /api/stats/clear         - 清空统计数据`);
  console.log(`\n测试页面:`);
  console.log(`  http://localhost:${PORT}/`);
  console.log(`========================================\n`);
});
