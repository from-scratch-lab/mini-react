const activePanelKey = 'mini-react:active-panel';

export function bindPhaseTabs(tabList: HTMLElement): void {
  const tabs = [...tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = tabs.map(tab => tab.ownerDocument.getElementById(tab.getAttribute('aria-controls')!)!);
  const view = tabList.ownerDocument.defaultView;

  function showPanel(index: number): void {
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[position].hidden = !selected;
    });
  }

  function select(index: number): void {
    showPanel(index);
    try {
      view?.sessionStorage.setItem(activePanelKey, panels[index].id);
    } catch {
      // Tab switching still works when storage is unavailable.
    }
  }

  try {
    const savedPanel = view?.sessionStorage.getItem(activePanelKey);
    const savedIndex = panels.findIndex(panel => panel.id === savedPanel);
    if (savedIndex !== -1) showPanel(savedIndex);
  } catch {
    // Keep the default panel when storage is unavailable.
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
