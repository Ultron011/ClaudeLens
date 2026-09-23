import type { IconName } from '../Icon.js';

/** The Insights pages, in nav order. Shared by AppLayout's rail and the pages' own tab strip
 *  (kept out of InsightsChrome so AppLayout doesn't import a module that imports it back). */
export const INSIGHT_PAGES: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/insights/decisions', label: 'Decisions', icon: 'message' },
  { to: '/insights/tools', label: 'Tools', icon: 'bolt' },
  { to: '/insights/agents', label: 'Agents & skills', icon: 'people' },
];
