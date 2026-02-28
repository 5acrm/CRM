const axios = require('axios');

// 缓存汇率（避免频繁请求）
const rateCache = new Map();

async function getCryptoRate(currency) {
  const cacheKey = `${currency}_${new Date().toDateString()}`;
  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey);
  }

  try {
    const coinIds = { BTC: 'bitcoin', ETH: 'ethereum' };
    const coinId = coinIds[currency];
    if (!coinId) return 1;

    const resp = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { timeout: 5000 }
    );

    const rate = resp.data[coinId]?.usd || 0;
    if (rate > 0) {
      rateCache.set(cacheKey, rate);
    }
    return rate;
  } catch (err) {
    console.error(`获取 ${currency} 汇率失败:`, err.message);
    // 返回缓存的上次汇率或0
    return rateCache.get(currency) || 0;
  }
}

module.exports = { getCryptoRate };
