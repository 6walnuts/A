# 本地开发服务器:模拟 Vercel 环境
# 静态文件 + /api/hq 行情代理(逻辑与 api/hq.js 一致),仅本地调试用,不参与线上部署
# 用法: python3 dev-server.py  然后打开 http://localhost:8787

import re
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8787
SAFE = re.compile(r'^[a-zA-Z0-9.,%_\-一-龥]+$')


def build_url(type_, q, period, n):
    if type_ == 'quote':
        return f'https://qt.gtimg.cn/q={q}'
    if type_ == 'kline':
        return f'https://ifzq.gtimg.cn/appstock/app/fqkline/get?param={q},{period},,,{n},qfq'
    if type_ == 'minute':
        if q.startswith('us'):
            return f'https://web.ifzq.gtimg.cn/appstock/app/UsMinute/query?code={q}'
        return f'https://ifzq.gtimg.cn/appstock/app/minute/query?code={q}'
    if type_ == 'search':
        return f'https://smartbox.gtimg.cn/s3/?v=2&q={urllib.parse.quote(q)}&t=all'
    return None


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != '/api/hq':
            return super().do_GET()

        qs = urllib.parse.parse_qs(parsed.query)
        type_ = qs.get('type', ['quote'])[0]
        q = qs.get('q', [''])[0]
        period = qs.get('period', ['day'])[0]
        n = qs.get('n', ['320'])[0]

        if not q or len(q) > 300 or not SAFE.match(q) \
                or not re.match(r'^\w+$', period) or not re.match(r'^\d+$', n):
            return self._json(400, '{"error":"bad params"}')
        url = build_url(type_, q, period, n)
        if not url:
            return self._json(400, '{"error":"bad type"}')

        try:
            req = urllib.request.Request(url, headers={
                'Referer': 'https://gu.qq.com/',
                'User-Agent': 'Mozilla/5.0',
            })
            with urllib.request.urlopen(req, timeout=10) as r:
                buf = r.read()
                ct = r.headers.get('Content-Type', '')
            m = re.search(r'charset=([\w-]+)', ct, re.I)
            enc = (m.group(1) if m else 'utf-8').lower()
            try:
                text = buf.decode('gbk' if enc in ('gbk', 'gb2312') else 'utf-8')
            except UnicodeDecodeError:
                text = buf.decode('utf-8', errors='replace')
        except Exception:
            return self._json(502, '{"error":"upstream failed"}')

        body = text.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, body):
        data = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    print(f'股票助手本地服务器: http://localhost:{PORT}')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
