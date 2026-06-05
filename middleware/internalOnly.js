const ipRangeCheck = require('ip-range-check');

function internalOnly(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const queryToken = req.query.token;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (queryToken === adminToken || bearerToken === adminToken) return next();
  }

  if (process.env.SKIP_IP_VALIDATION === 'true') return next();

  const range = process.env.INTERNAL_IP_RANGE || '10.0.0.0/8';
  const ip = req.ip || req.connection.remoteAddress || '';
  const cleanIp = ip.replace(/^::ffff:/, '');

  if (cleanIp === '127.0.0.1' || cleanIp === '::1') return next();

  if (!ipRangeCheck(cleanIp, range)) {
    return res.status(403).json({ error: 'Acceso restringido a la red interna INEI.' });
  }

  next();
}

module.exports = internalOnly;
