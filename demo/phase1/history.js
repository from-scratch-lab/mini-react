import { cloneVNode } from '../../src/index.js';

/**
 * Patch할 때마다 가상 트리를 쌓아 두는 기록(State History).
 * 넣을 때와 꺼낼 때 모두 복사하므로, 화면에 연결된 가상 트리(dom 참조를 가진 것)와 섞이지 않는다.
 */
export class VNodeHistory {
  #entries;
  #index;

  constructor(initial) {
    this.#entries = [cloneVNode(initial)];
    this.#index = 0;
  }

  get current() {
    return cloneVNode(this.#entries[this.#index]);
  }

  get index() {
    return this.#index;
  }

  get length() {
    return this.#entries.length;
  }

  get canBack() {
    return this.#index > 0;
  }

  get canForward() {
    return this.#index < this.#entries.length - 1;
  }

  /** 현재 위치 뒤에 새 기록을 넣는다. 뒤로 갔다가 push하면 앞쪽 기록은 버린다(브라우저 방문 기록과 같다). */
  push(vnode) {
    this.#entries.splice(this.#index + 1);
    this.#entries.push(cloneVNode(vnode));
    this.#index = this.#entries.length - 1;
  }

  back() {
    return this.go(this.#index - 1);
  }

  forward() {
    return this.go(this.#index + 1);
  }

  /** 지정한 기록으로 이동하고 그 복사본을 돌려준다. 범위 밖이면 움직이지 않고 null. */
  go(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#entries.length) return null;
    this.#index = index;
    return this.current;
  }
}
