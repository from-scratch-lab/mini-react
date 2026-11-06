// 데모 페이지용 정적 파일 서버 (의존성 없음).
// ES 모듈은 file:// 로 열 수 없어서 HTTP로 띄워야 한다.
// 이 컴퓨터(127.0.0.1)에서만 열리고, demo/와 src/ 아래 파일만 내보낸다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIRS = ['demo', 'src'].map((dir) => resolve(ROOT, dir));
const HOST = '127.0.0.1';
// PORT=0이면 운영체제가 빈 포트를 고른다 (테스트용)
const PORT = process.env.PORT === undefined || process.env.PORT === '' ? 5173 : Number(process.env.PORT);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return send(res, 400, 'Bad Request');
  }
  if (pathname === '/') return send(res, 302, '', { Location: '/demo/' });

  const filePath = resolve(ROOT, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  // 폴더 자체(/demo)이거나 그 안(/demo/...)만 허용한다. 구분자까지 비교해야 /demo-x 같은 옆 폴더가 걸리지 않는다.
  const allowed = PUBLIC_DIRS.some((dir) => filePath === dir || filePath.startsWith(dir + sep));
  if (!allowed) return send(res, 404, 'Not Found');

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) return send(res, 302, '', { Location: `${pathname}/` });
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    send(res, 404, 'Not Found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`mini-react 데모: http://${HOST}:${server.address().port}/demo/`);
});
