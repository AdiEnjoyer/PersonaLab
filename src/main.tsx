import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ROUTER_BASENAME } from './basePath';
import { requestPersistOnce } from './core/storage/persist';
import { getUpdateService } from './core/update/updateService';
import './ui/styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename={ROUTER_BASENAME}>
      <h1>PersonalLab</h1>
    </BrowserRouter>
  </StrictMode>,
);

if (import.meta.env.PROD) getUpdateService().start();
void requestPersistOnce();