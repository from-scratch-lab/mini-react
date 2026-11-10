import { miniAdapter } from './mini-adapter';
import { mountExperiment } from './experiment-ui';

const versions: Record<string, string> = { mode: import.meta.env.MODE };
async function loadReact(optimized: boolean) {
  const { reactAdapter, reactVersion } = await import('./react-adapter');
  versions.react = reactVersion;
  return reactAdapter(optimized);
}

mountExperiment([
  miniAdapter(false),
  miniAdapter(true),
  { name: 'react-baseline', load: () => loadReact(false) },
  { name: 'react-memo', load: () => loadReact(true) },
], versions);
