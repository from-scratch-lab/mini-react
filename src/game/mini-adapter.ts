import { FunctionComponent, useEffect, useFrame, useScene, useState } from '../core/component';
import { h } from '../core/element';
import { spriteAttributes, type SpriteSlot } from '../core/scene';
import type { Adapter } from './benchmark';

function Sprite({ slot }: { slot: SpriteSlot }) { return h('i', spriteAttributes(slot)); }
export function miniAdapter(optimized: boolean): Adapter {
  return {
    name: optimized ? 'mini-scene' : 'mini-baseline',
    mount(container, initial, source, committed, diagnostic) {
      function App() {
        const [snapshot, setSnapshot] = useState(initial);
        if (optimized) useFrame(({ time }) => { const next = source(time); if (next) setSnapshot(next); });
        else useEffect(() => {
          let id: number; let active = true;
          const tick = (time: number) => { const next = source(time); if (next) setSnapshot(next); if (active) id = requestAnimationFrame(tick); };
          id = requestAnimationFrame(tick); return () => { active = false; cancelAnimationFrame(id); };
        }, []);
        const scene = optimized ? useScene(snapshot.slots)
          : h('div', { className: 'scene', 'aria-hidden': 'true' }, snapshot.slots.map(slot => h(Sprite, { slot })));
        useEffect(() => committed(snapshot));
        return h('div', { className: 'arena' }, h('div', { className: 'arena-grid', 'aria-hidden': 'true' }), scene);
      }
      const root = new FunctionComponent(App, container, {}, undefined, diagnostic);
      root.mount(); return () => root.unmount();
    },
  };
}
