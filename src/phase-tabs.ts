export function bindPhaseTabs(tabList: HTMLElement): void {
  const tabs = [...tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = tabs.map(tab => tab.ownerDocument.getElementById(tab.getAttribute('aria-controls')!)!);

  function select(index: number): void {
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[position].hidden = !selected;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      let next: number;
      switch (event.key) {
        case 'ArrowDown': next = (index + 1) % tabs.length; break;
        case 'ArrowUp': next = (index - 1 + tabs.length) % tabs.length; break;
        case 'Home': next = 0; break;
        case 'End': next = tabs.length - 1; break;
        default: return;
      }
      event.preventDefault();
      select(next);
      tabs[next].focus();
    });
  });
}
