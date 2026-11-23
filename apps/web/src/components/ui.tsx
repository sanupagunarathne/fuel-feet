import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertCircle, CircleHelp, LoaderCircle, Search } from 'lucide-react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'icon';
};

export function Button({ variant = 'secondary', type = 'button', className = '', ...props }: ButtonProps) {
  return <button type={type} {...props} className={`button button--${variant} ${className}`} />;
}

export function StatusBadge({ children, tone = 'neutral' }: {
  children: ReactNode;
  tone?: 'positive' | 'warning' | 'negative' | 'neutral';
}) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}

export function Feedback({ kind, title, description, action }: {
  kind: 'empty' | 'error' | 'loading';
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const Icon = { empty: CircleHelp, error: AlertCircle, loading: LoaderCircle }[kind];
  return (
    <div className="feedback" role={kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined}>
      <Icon aria-hidden="true" size={22} className={kind === 'loading' ? 'motion-safe:animate-spin' : undefined} />
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SearchField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="search-field">
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input type="search" placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
