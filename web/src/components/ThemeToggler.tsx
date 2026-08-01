/* This exists because the requested MagicUI `AnimatedThemeToggler`
 * (`@/registry/magicui/animated-theme-toggler`) needs Tailwind plus a registry install, and `web`
 * is capped at 4 runtime deps (docs/frontend.md). Its behaviour — a circular clip-path wipe out
 * from the button — is reproduced by hand with the View Transitions API directly; its import is
 * not used anywhere. */
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from './Icon.js';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme, setTheme: (t: Theme) => void) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('claudelens.theme', theme);
  } catch {
    // private mode / disabled storage
  }
  setTheme(theme);
}

export function ThemeToggler(): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
  );
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const onClick = async () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduced) {
      applyTheme(next, setTheme);
      return;
    }

    const rect = ref.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : innerHeight / 2;
    const maxRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const transition = document.startViewTransition(() => {
      flushSync(() => applyTheme(next, setTheme));
    });
    try {
      await transition.ready;
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] },
        {
          duration: 520,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    } catch {
      // best-effort animation only — the theme is already applied above
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      className="theme-toggle"
      onClick={onClick}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
