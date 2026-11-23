import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';

const App = lazy(() => import('./App').then(({ App }) => ({ default: App })));
const AuthGate = lazy(() => import('./auth/AuthGate').then(({ AuthGate }) => ({ default: AuthGate })));

const root = document.getElementById('root');
if (!root) {
  throw new Error('Application root is missing');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <BrowserRouter>
        <Suspense fallback={<main className="auth-screen"><p role="status">Loading Fuel Feet…</p></main>}>
          <AuthGate>{(account, token) => <App account={account} token={token} />}</AuthGate>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
