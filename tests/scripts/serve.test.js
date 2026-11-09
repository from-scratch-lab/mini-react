// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 데모 서버를 빈 포트(PORT=0)로 띄워 실제 HTTP 요청으로 확인한다.
const script = fileURLToPath(new URL('../../scripts/serve.js', import.meta.url));
let server;
let base;

beforeAll(async () => {
  server = spawn(process.execPath, [script], { env: { ...process.env, PORT: '0' } });
  base = await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    server.on('error', reject);
    setTimeout(() => reject(new Error('서버가 시작되지 않았습니다')), 5000);
  });
});

afterAll(() => server?.kill());

const get = (path) => fetch(base + path, { redirect: 'manual' });

describe('scripts/serve.js', () => {
  it('끝 슬래시 없는 최상위 폴더는 슬래시를 붙여 넘긴다', async () => {
    for (const dir of ['/demo', '/src']) {
      const res = await get(dir);
      expect(res.status, dir).toBe(302);
      expect(res.headers.get('location')).toBe(`${dir}/`);
    }
  });

  it('demo·src 안의 파일은 내보낸다', async () => {
    expect((await get('/demo/')).status).toBe(200);
    expect((await get('/src/index.js')).status).toBe(200);
  });

  it('브라우저 벤치마크 페이지가 쓰는 scripts/bench 안의 파일은 내보낸다', async () => {
    expect((await get('/scripts/bench/scenarios.js')).status).toBe(200);
  });

  it('LIS 실험 페이지만 교차 출처 격리 헤더를 붙인다 (performance.now() 해상도를 높이려고)', async () => {
    const lis = await get('/demo/bench/lis.html');
    expect(lis.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(lis.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect((await get('/demo/')).headers.get('cross-origin-embedder-policy')).toBeNull();
  });

  it('LIS 실험의 React 기준선용 UMD 파일 두 개만 node_modules에서 내보낸다', async () => {
    expect((await get('/node_modules/react/umd/react.production.min.js')).status).toBe(200);
    expect((await get('/node_modules/react-dom/umd/react-dom.production.min.js')).status).toBe(200);
    expect((await get('/node_modules/react/package.json')).status).toBe(404);
    expect((await get('/node_modules/react/umd/react.development.js')).status).toBe(404);
  });

  it('demo·src·scripts/bench 밖의 파일과 경로 우회는 404', async () => {
    for (const path of ['/package.json', '/.claude/settings.json', '/demo/%2e%2e/package.json', '/demo-x', '/srcx/a.js', '/scripts/serve.js', '/scripts/bench/%2e%2e/serve.js']) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
