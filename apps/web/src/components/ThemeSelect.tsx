import { Monitor, Moon, Sun } from 'lucide-react';
import type { Theme } from '../lib/theme';

export function ThemeSelect({ theme, onChange, compact = false }: {
  theme: Theme;
  onChange: (theme: Theme) => void;
  compact?: boolean;
}) {
  const Icon = { light: Sun, dark: Moon, system: Monitor }[theme];

  return (
    <label className={compact ? 'theme-select theme-select--compact' : 'theme-select'}>
      <Icon size={17} aria-hidden="true" />
      <span className="sr-only">{compact ? 'Quick appearance' : 'Appearance'}</span>
      <select className="select-field" value={theme} onChange={(event) => onChange(event.target.value as Theme)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
