import type { CSSProperties } from 'react';
export type IconName = 'grid' | 'jobs' | 'team' | 'box' | 'book' | 'chart' | 'settings' | 'arrow' | 'check' | 'shield' | 'clock' | 'pin' | 'menu' | 'close' | 'logout' | 'sun' | 'chevron' | 'plus';
const paths: Record<IconName, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  jobs: 'M9 4V2h6v2 M4 5h16v17H4z M8 10h8 M8 14h8 M8 18h5',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  box: 'M12 3 3 8v9l9 5 9-5V8z M3 8l9 5 9-5 M12 13v9 M7 5.8l9 5',
  book: 'M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-2-7-2-10 1z M12 5v15',
  chart: 'M3 3v18h18 M7 16v-5 M12 16V7 M17 16v-9',
  settings: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  arrow: 'M4 12h16 M14 6l6 6-6 6', check: 'm5 12 4 4L19 6', shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z M8 12l3 3 5-6',
  clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  menu: 'M4 6h16 M4 12h16 M4 18h16', close: 'm6 6 12 12 M6 18 18 6', logout: 'M9 4H3v16h6 M12 12h10 M18 8l4 4-4 4', sun: 'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  chevron: 'm9 5 7 7-7 7', plus: 'M12 5v14 M5 12h14',
};
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>; }
export function Brand({ dark = false }: { dark?: boolean }) { return <a className={`brand ${dark ? 'brand-dark' : ''}`} href="/" aria-label="ServiceGrid IQ home"><span className="brand-icon"><Icon name="grid" size={21} /></span><span>ServiceGrid<span className="brand-iq">IQ</span></span></a>; }
