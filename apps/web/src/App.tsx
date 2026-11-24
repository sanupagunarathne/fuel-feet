import { lazy, Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router';
import {
  ChartColumnIncreasing, ChevronRight, ClipboardList, FlaskConical, Fuel, LayoutDashboard,
  Menu, ReceiptText, Settings, Truck, UsersRound, Wallet, X,
} from 'lucide-react';
import { ConnectionStatus } from './components/ConnectionStatus';
import { Modal } from './components/Modal';
import { PeriodPicker } from './components/PeriodPicker';
import { ThemeSelect } from './components/ThemeSelect';
import { Button, Feedback } from './components/ui';
import { currentPeriod, isPeriod } from './lib/period';
import { useTheme } from './lib/theme';
import { Dashboard } from './pages/Dashboard';
import { Records } from './pages/Records';
import type { RecordPage } from './pages/Records';

import { FleetToken } from './live/client';

const LiveRecords = lazy(() => import('./live/LiveRecords').then(({ LiveRecords }) => ({ default: LiveRecords })));
const LiveDashboard = lazy(() => import('./live/LiveDashboard').then(({ LiveDashboard }) => ({ default: LiveDashboard })));
const LiveSalaries = lazy(() => import('./live/LiveSalaries').then(({ LiveSalaries }) => ({ default: LiveSalaries })));
const LiveReports = lazy(() => import('./live/LiveReports').then(({ LiveReports }) => ({ default: LiveReports })));
const LiveSettings = lazy(() => import('./live/LiveSettings').then(({ LiveSettings }) => ({ default: LiveSettings })));

const sections = [
  { path: '/', label: 'Dashboard', Icon: LayoutDashboard, period: true },
  { path: '/vehicles', label: 'Vehicles', Icon: Truck },
  { path: '/trips', label: 'Trip sheets', Icon: ClipboardList, period: true },
  { path: '/employees', label: 'Employees', Icon: UsersRound },
  { path: '/salaries', label: 'Salaries', Icon: Wallet, period: true },
  { path: '/expenses', label: 'Expenses', Icon: ReceiptText, period: true },
  { path: '/reports', label: 'Reports', Icon: ChartColumnIncreasing, period: true },
  { path: '/settings', label: 'Settings', Icon: Settings },
] as const;

const recordPages: RecordPage[] = ['vehicles', 'trips', 'employees', 'salaries', 'expenses', 'reports'];

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark"><Fuel size={19} aria-hidden="true" /></span>
      <span>Fuel Feet</span>
    </span>
  );
}

function Navigation({ search, onNavigate }: { search: string; onNavigate?: () => void }) {
  return (
    <nav className="sidebar-nav" aria-label="Primary">
      {sections.map(({ path, label, Icon }) => (
        <NavLink key={path} to={{ pathname: path, search }} end={path === '/'} onClick={onNavigate}>
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function App({ account, token }: { account?: ReactNode; token?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const { pathname, search } = useLocation();
  const { theme, setTheme } = useTheme();
  const section = sections.find((item) => item.path === (pathname.replace(/\/$/, '').toLowerCase() || '/'));
  const label = section?.label ?? 'Page not found';
  const periodParam = params.get('period');
  const period = isPeriod(periodParam) ? periodParam : currentPeriod();
  const navigationParams = new URLSearchParams(search);
  navigationParams.delete('entry');
  const navigationSearch = navigationParams.toString();
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setMenuOpen(false);
    }
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    document.title = `${label} | Fuel Feet`;
  }, [label]);

  return (
    <FleetToken.Provider value={token ?? ''}>
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="desktop-sidebar">
        <div className="sidebar-top"><Brand /></div>
        <Navigation search={navigationSearch} />
      </aside>
      <Modal open={menuOpen} onClose={closeMenu} label="Navigation" drawer>
        <div className="sidebar-top">
          <Brand />
          <Button variant="icon" aria-label="Close navigation" onClick={closeMenu}><X size={20} aria-hidden="true" /></Button>
        </div>
        <Navigation search={navigationSearch} onNavigate={closeMenu} />
      </Modal>
      <div className="workspace">
        <header className="top-bar">
          <div className="mobile-brand">
            <Button variant="icon" aria-label="Open navigation" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
              <Menu size={22} aria-hidden="true" />
            </Button>
            <Brand />
          </div>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={15} aria-hidden="true" /><strong>{label}</strong></div>
          <div className="top-actions">
            <ConnectionStatus />
            <ThemeSelect theme={theme} onChange={setTheme} compact />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="main-content">
          <div className="page-header">
            <div>
              <h1>{label}</h1>
              {section?.path === '/' && <p>Fleet finances and trip activity</p>}
            </div>
            <div className="flex flex-wrap gap-2">
            {token && section?.path !== '/trips' && <Link className="button button--primary" to={`/trips?period=${period}&entry=new`}>Quick add trip</Link>}
            {token && section?.path === '/' && <Link className="button button--secondary" to={`/expenses?period=${period}&entry=new`}>Add expense</Link>}
            {section && 'period' in section && (
              <PeriodPicker period={period} onChange={(value) => {
                const next = new URLSearchParams(params);
                next.set('period', value);
                setParams(next);
              }} />
            )}
            </div>
          </div>
          {!token && section && section.path !== '/settings' && (
            <div className="demo-notice">
              <FlaskConical size={16} aria-hidden="true" />
              <p><strong>Demonstration data</strong><span> · </span> Sample figures and records</p>
            </div>
          )}
          <Suspense fallback={<Feedback kind="loading" title="Loading workspace" />}>
          <Routes>
            <Route path="/" element={token ? <LiveDashboard period={period} /> : <Dashboard period={period} search={search} />} />
            {recordPages.map((page) => <Route key={page} path={`/${page}`} element={!token
              ? <Records key={page} page={page} period={period} />
              : page === 'reports' ? <LiveReports key={search} period={period} />
              : page === 'salaries' ? <LiveSalaries key={search} period={period} />
              : <LiveRecords key={`${page}:${period}:${params.get('vehicleId') ?? ''}`} page={page} period={period} />} />)}
            <Route path="/settings" element={
              <div className="grid gap-4">
                <section className="panel settings-panel">
                  <div>
                    <h2>Appearance</h2>
                    <p className="panel-subtitle">Choose a theme for this browser.</p>
                  </div>
                  <ThemeSelect theme={theme} onChange={setTheme} />
                </section>
                {token && <LiveSettings period={period} />}
                {account && <section className="panel settings-panel"><h2>Account</h2>{account}</section>}
              </div>
            } />
            <Route path="*" element={<Link className="text-link min-h-11" to="/">Return to dashboard</Link>} />
          </Routes>
          </Suspense>
        </main>
      </div>
    </div>
    </FleetToken.Provider>
  );
}
