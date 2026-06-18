const express = require('express');
const router = express.Router();
const { parseIp } = require('../ipParser');
const statsPool = require('../statsPool');

router.post('/track', async (req, res) => {
  try {
    const ip = req.clientIp;
    const { event, page, referrer, userAgent, extra } = req.body || {};

    const location = parseIp(ip);
    const province = location.province;

    statsPool.recordVisit(ip, location);

    res.json({
      success: true,
      data: {
        ip,
        location,
        event: event || 'page_view',
        timestamp: new Date().toLocaleString('zh-CN'),
      },
    });
  } catch (err) {
    console.error('埋点上报失败:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get('/track', (req, res) => {
  try {
    const ip = req.clientIp;
    const { event, page, referrer } = req.query || {};

    const location = parseIp(ip);
    const province = location.province;

    statsPool.recordVisit(ip, location);

    const img = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': img.length,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    });
    res.end(img);
  } catch (err) {
    console.error('埋点上报失败:', err);
    res.status(500).end();
  }
});

module.exports = router;
