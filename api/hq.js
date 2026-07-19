// 行情中转:代理腾讯行情接口,解决跨域 + GBK 编码问题
// 部署到 Vercel 后路径为 /api/hq

const SAFE = /^[a-zA-Z0-9.,%_\-一-龥]+$/;

function buildUrl(type, q, period, n) {
  switch (type) {
    case 'quote':
      return `https://qt.gtimg.cn/q=${q}`;
    case 'kline':
      return `https://ifzq.gtimg.cn/appstock/app/fqkline/get?param=${q},${period},,,${n},qfq`;
    case 'minute':
      return q.startsWith('us')
        ? `https://web.ifzq.gtimg.cn/appstock/app/UsMinute/query?code=${q}`
        : `https://ifzq.gtimg.cn/appstock/app/minute/query?code=${q}`;
    case 'search':
      return `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(q)}&t=all`;
    case 'news':
      // 新浪财经 7x24 快讯,n = 条数
      return `https://zhibo.sina.com.cn/api/zhibo/feed?page=1&page_size=${n}&zhibo_id=152`;
    default:
      return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const {
    type = 'quote', q = '', period = 'day', n = '320',
    fid = 'f3', fs = '', po = '1', pn = '1', pz = '100', fields = '',
  } = req.query;

  let url;
  if (type === 'emlist') {
    // 东方财富行情列表(个股/板块),只读查询
    if (!/^f\d{1,4}$/.test(fid) || !/^[01]$/.test(po) || !/^\d{1,3}$/.test(pn)
        || !/^\d{1,4}$/.test(pz) || !/^[a-zA-Z0-9:+,!._]{1,100}$/.test(fs)
        || !/^[f\d,]{1,200}$/.test(fields)) {
      return res.status(400).json({ error: 'bad params' });
    }
    const size = Math.min(parseInt(pz, 10), 1500);
    url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${pn}&pz=${size}&po=${po}&np=1&fltt=2&invt=2&fid=${fid}&fs=${fs}&fields=${fields}`;
  } else {
    if (!/^\w+$/.test(period) || !/^\d+$/.test(n)) {
      return res.status(400).json({ error: 'bad params' });
    }
    // news 不需要 q,其余类型必须带合法的 q
    if (type !== 'news' && (!q || q.length > 300 || !SAFE.test(q))) {
      return res.status(400).json({ error: 'bad params' });
    }
    url = buildUrl(type, q, period, n);
  }
  if (!url) return res.status(400).json({ error: 'bad type' });

  try {
    const r = await fetch(url, {
      headers: { Referer: 'https://gu.qq.com/', 'User-Agent': 'Mozilla/5.0' },
    });
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || '';
    const charset = /charset=([\w-]+)/i.exec(ct);
    const enc = charset ? charset[1].toLowerCase() : 'utf-8';
    let text;
    try {
      text = new TextDecoder(enc === 'gbk' || enc === 'gb2312' ? 'gbk' : 'utf-8').decode(buf);
    } catch {
      text = new TextDecoder('utf-8').decode(buf);
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=10');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ error: 'upstream failed' });
  }
};
