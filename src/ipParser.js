const IP2Region = require('ip2region').default;
const path = require('path');

const ipv4dbPath = path.join(__dirname, '../node_modules/ip2region/data/ip2region.db');
const ipv6dbPath = path.join(__dirname, '../node_modules/ip2region/data/ipv6wry.db');

const query = new IP2Region({
  ipv4db: ipv4dbPath,
  ipv6db: ipv6dbPath,
});

function parseIp(ip) {
  if (!ip) {
    return { country: '未知', province: '未知', city: '未知', isp: '未知' };
  }

  try {
    const result = query.search(ip);
    return {
      country: result.country || '未知',
      province: result.province || '未知',
      city: result.city || '未知',
      isp: result.isp || '未知',
    };
  } catch (err) {
    console.error(`IP 解析失败 [${ip}]:`, err.message);
    return { country: '未知', province: '未知', city: '未知', isp: '未知' };
  }
}

module.exports = { parseIp };
