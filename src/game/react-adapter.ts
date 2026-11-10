import { createElement as h, memo, useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sameSprite, spriteAttributes, type SpriteSlot } from '../core/scene';
import type { Adapter } from './benchmark';

export { version as reactVersion } from 'react';

function Sprite({ slot }: { slot: SpriteSlot }) {
  const attributes = spriteAttributes(slot);
  return h('i', {
    className: attributes.class,
    'data-entity': attributes['data-entity'],
    style: {
      transform: `translate(${slot.x.toFixed(2)}px,${slot.y.toFixed(2)}px)`,
      visibility: slot.active ? 'visible' : 'hidden',
    },
  });
}

const MemoSprite = memo(Sprite, (previous, next) => sameSprite(previous.slot, next.slot));

export function reactAdapter(optimized: boolean): Adapter {
  return {
    name: optimized ? 'react-memo' : 'react-baseline',
    mount(container, initial, source, committed) {
      const Child = optimized ? MemoSprite : Sprite;
      function App() {
        const [snapshot, setSnapshot] = useState(initial);
        useEffect(() => {
          let id: number;
          const frame = (time: number) => {
            const next = source(time);
            if (next) setSnapshot(next);
            id = requestAnimationFrame(frame);
          };
          id = requestAnimationFrame(frame);
          return () => cancelAnimationFrame(id);
        }, []);
        useLayoutEffect(() => committed(snapshot));

        return h('div', { className: 'arena' },
          h('div', { className: 'arena-grid', 'aria-hidden': 'true' }),
          h('div', { className: 'scene', 'aria-hidden': 'true' },
            snapshot.slots.map((slot, index) => h(Child, { key: index, slot }))));
      }
      const root = createRoot(container);
      root.render(h(App));
      return () => root.unmount();
    },
  };
}
