// High-capacity sliding-window rate limiter designed for 1,000 to 5,000+ concurrent users
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '45', 10); // 45 req/min per IP
const MAX_CLIENT_ENTRIES = 50000; // Capacity for 50k unique concurrent IPs

const clients = new Map();

// Periodic proactive cleanup every 30 seconds for active memory efficiency
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of clients.entries()) {
    if (now - data.startTime > WINDOW_MS * 2) {
      clients.delete(ip);
    }
  }
}, 30 * 1000).unref();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();

  let record = clients.get(ip);
  if (!record || now - record.startTime > WINDOW_MS) {
    // If table capacity reached, evict oldest entries via FIFO deletion rather than clearing all
    if (clients.size >= MAX_CLIENT_ENTRIES) {
      let evicted = 0;
      for (const [oldIp, oldRecord] of clients.entries()) {
        if (now - oldRecord.startTime > WINDOW_MS || evicted < 1000) {
          clients.delete(oldIp);
          evicted++;
        }
      }
    }
    record = { startTime: now, count: 1 };
    clients.set(ip, record);
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  record.count++;
  if (record.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.startTime + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true, remaining: MAX_REQUESTS - record.count };
}

module.exports = { checkRateLimit, getClientIp };

