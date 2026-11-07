import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppShell } from './app/AppShell';
import { StartupGate } from './app/StartupGate';
import { ROUTER_BASENAME } from './basePath';
import { getUpdateService } from './core/update/updateService';
import './ui/styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename={ROUTER_BASENAME}>
      <StartupGate>
        <AppShell />
      </StartupGate>
    </BrowserRouter>
  </StrictMode>,
);

if (import.meta.env.PROD) getUpdateService().start();
