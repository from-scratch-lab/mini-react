const activePanelKey = 'mini-react:active-panel';
const worldCupUnlockedKey = 'mini-react:world-cup-unlocked';
const unlockWindow = 3000;

export function bindPhaseTabs(
  tabList: HTMLElement,
  worldCupTab: HTMLButtonElement,
  closeWorldCup: HTMLButtonElement,
): void {
  const tabs = [...tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = tabs.map(tab => tab.ownerDocument.getElementById(tab.getAttribute('aria-controls')!)!);
  const view = tabList.ownerDocument.defaultView;
  const worldCupIndex = tabs.indexOf(worldCupTab);
  let activeIndex = 0;
  let switchTimes: number[] = [];

  function showWorldCupTab(visible: boolean): void {
    worldCupTab.hidden = !visible;
    closeWorldCup.hidden = !visible;
  }

  function showPanel(index: number): void {
    activeIndex = index;
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[position].hidden = !selected;
    });
  }

  function select(index: number, moveFocus = false): void {
    if (tabs[index].hidden) return;
    if (worldCupTab.hidden && index !== activeIndex) {
      const now = performance.now();
      switchTimes = switchTimes.filter(time => now - time <= unlockWindow);
      switchTimes.push(now);
      // Four switches ending on Phase 1 form 1 → 2 → 1 → 2 → 1.
      if (index === 0 && switchTimes.length >= 4) {
        showWorldCupTab(true);
        index = worldCupIndex;
        moveFocus = true;
      }
    }
    showPanel(index);
    if (moveFocus) tabs[index].focus();
    try {
      if (index === worldCupIndex) view?.sessionStorage.setItem(worldCupUnlockedKey, 'true');
      view?.sessionStorage.setItem(activePanelKey, panels[index].id);
    } catch {
      // Tab switching still works when storage is unavailable.
    }
  }

  try {
    if (view?.sessionStorage.getItem(worldCupUnlockedKey) === 'true') showWorldCupTab(true);
    const savedPanel = view?.sessionStorage.getItem(activePanelKey);
    const savedIndex = panels.findIndex(panel => panel.id === savedPanel);
    if (savedIndex !== -1 && !tabs[savedIndex].hidden) showPanel(savedIndex);
  } catch {
    // Keep the default panel when storage is unavailable.
  }

  closeWorldCup.addEventListener('click', () => {
    if (worldCupTab.hidden) return;
    showWorldCupTab(false);
    switchTimes = [];
    try {
      view?.sessionStorage.removeItem(worldCupUnlockedKey);
    } catch {
      // The tab still closes when storage is unavailable.
    }
    select(activeIndex === worldCupIndex ? 0 : activeIndex, true);
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      const visibleTabs = tabs.filter(tab => !tab.hidden);
      const position = visibleTabs.indexOf(tab);
      if (position === -1) return;
      let next: number;
      switch (event.key) {
        case 'ArrowDown': next = (position + 1) % visibleTabs.length; break;
        case 'ArrowUp': next = (position - 1 + visibleTabs.length) % visibleTabs.length; break;
        case 'Home': next = 0; break;
        case 'End': next = visibleTabs.length - 1; break;
        default: return;
      }
      event.preventDefault();
      select(tabs.indexOf(visibleTabs[next]), true);
    });
  });
}
