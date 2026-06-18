function extractClientIp(req) {
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded',
    'cf-connecting-ip',
    'true-client-ip',
  ];

  for (const header of headers) {
    const value = req.headers[header];
    if (value) {
      const ips = value.split(',').map(ip => ip.trim());
      for (const ip of ips) {
        if (ip && !isPrivateIp(ip) && ip !== 'unknown') {
          return ip;
        }
      }
    }
  }

  let ip = req.connection.remoteAddress || 
           req.socket.remoteAddress || 
           (req.connection.socket ? req.connection.socket.remoteAddress : null);

  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  if (ip === '::1' || ip === '127.0.0.1') {
    ip = '127.0.0.1';
  }

  return ip || 'unknown';
}

function isPrivateIp(ip) {
  if (!ip) return true;
  
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') || 
      ip.startsWith('172.19.') || ip.startsWith('172.2') || ip.startsWith('172.30.') || 
      ip.startsWith('172.31.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('fe80:')) return true;
  
  return false;
}

function ipExtractor(req, res, next) {
  req.clientIp = extractClientIp(req);
  next();
}

module.exports = { ipExtractor, extractClientIp };
