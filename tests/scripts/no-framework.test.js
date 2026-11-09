import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// 과제 제약 "외부 프레임워크(React, Vue 등) 사용 금지"를 검사한다.
// react·react-dom 18.3.1은 Part 2 LIS 실험(demo/bench/lis.html)의 비교 기준선으로만 devDependency에 있다.
// 구현(src/)과 과제 데모 3종(phase1·phase2·integrated)과 공용 도우미(shared)는 React를 불러오면 안 된다.

const ROOT = process.cwd(); // vitest는 프로젝트 루트에서 돈다 (jsdom 환경에서는 import.meta.url이 파일 경로가 아니다)
const SCOPE = ['src', 'demo/phase1', 'demo/phase2', 'demo/integrated', 'demo/shared'];
// 코드로 React를 불러오는 모양만 잡는다 (설명 글의 "React" 단어는 허용)
const LOADS_REACT = [
  /from\s+['"](react|react-dom|vue)(\/[^'"]*)?['"]/,
  /require\(\s*['"](react|react-dom|vue)['"]\s*\)/,
  /import\(\s*['"](react|react-dom|vue)['"]\s*\)/,
  /node_modules\/(react|react-dom|vue)\//,
  /\bwindow\.(React|ReactDOM|Vue)\b/,
  /<script[^>]+src=["'][^"']*(react|vue)[^"']*["']/i,
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(js|mjs|html)$/.test(name) ? [path] : [];
  });
}

describe('외부 프레임워크 사용 금지', () => {
  it('런타임 의존성이 없다 (react는 devDependency 비교 기준선뿐)', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('구현과 과제 데모 3종은 React·Vue를 불러오지 않는다', () => {
    const offenders = [];
    for (const dir of SCOPE) {
      for (const file of files(join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        for (const pattern of LOADS_REACT) {
          if (pattern.test(text)) offenders.push(`${relative(ROOT, file)} (${pattern})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('검사가 실제로 잡는다: LIS 실험 페이지는 React를 불러온다', () => {
    const text = readFileSync(join(ROOT, 'demo/bench/lis.html'), 'utf8');
    expect(LOADS_REACT.some((pattern) => pattern.test(text))).toBe(true);
  });
});
