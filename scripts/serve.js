// 데모 페이지용 정적 파일 서버 (의존성 없음).
// ES 모듈은 file:// 로 열 수 없어서 HTTP로 띄워야 한다.
// 이 컴퓨터(127.0.0.1)에서만 열리고, demo/와 src/, 브라우저 벤치마크 페이지가 쓰는 scripts/bench/ 아래 파일,
// 그리고 LIS 실험의 React 기준선 UMD 파일 두 개만 내보낸다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIRS = ['demo', 'src', 'scripts/bench'].map((dir) => resolve(ROOT, dir));
// LIS 실험(demo/bench/lis.html)의 React 기준선. CDN 없이 설치된 프로덕션 UMD 파일 두 개만 내보낸다.
const PUBLIC_FILES = ['node_modules/react/umd/react.production.min.js', 'node_modules/react-dom/umd/react-dom.production.min.js'].map(
  (file) => resolve(ROOT, file),
);
const HOST = '127.0.0.1';
// LIS 실험 페이지는 교차 출처 격리(COOP·COEP)로 연다. 격리되지 않은 페이지의 performance.now()는 0.1ms 단위라
// 1ms 안팎의 diff·commit 시간을 가를 수 없다. 이 페이지는 다른 출처의 자원을 읽지 않으므로 격리해도 깨지지 않는다.
const ISOLATED_PAGE = resolve(ROOT, 'demo/bench/lis.html');
const ISOLATION_HEADERS = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
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
  const allowed =
    PUBLIC_DIRS.some((dir) => filePath === dir || filePath.startsWith(dir + sep)) || PUBLIC_FILES.includes(filePath);
  if (!allowed) return send(res, 404, 'Not Found');

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) return send(res, 302, '', { Location: `${pathname}/` });
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...(filePath === ISOLATED_PAGE ? ISOLATION_HEADERS : {}),
    });
    res.end(body);
  } catch {
    send(res, 404, 'Not Found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`mini-react 데모: http://${HOST}:${server.address().port}/demo/`);
});
