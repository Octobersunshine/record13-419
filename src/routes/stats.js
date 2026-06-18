const express = require('express');
const router = express.Router();
const statsPool = require('../statsPool');

router.get('/summary', async (req, res) => {
  await statsPool.flush();
  res.json({
    success: true,
    data: statsPool.getSummary(),
  });
});

router.get('/provinces', async (req, res) => {
  await statsPool.flush();
  const { limit } = req.query;
  let data;
  if (limit) {
    data = statsPool.getTopProvinces(parseInt(limit, 10));
  } else {
    data = statsPool.getProvinceStats();
  }
  res.json({
    success: true,
    data,
  });
});

router.get('/ips', async (req, res) => {
  await statsPool.flush();
  const { limit } = req.query;
  let data = statsPool.getIpStats();
  if (limit) {
    data = data.slice(0, parseInt(limit, 10));
  }
  res.json({
    success: true,
    data,
  });
});

router.post('/clear', (req, res) => {
  statsPool.clear();
  res.json({
    success: true,
    message: '统计数据已清空',
  });
});

module.exports = router;
