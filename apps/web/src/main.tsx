import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './theme/tokens.css';
import './theme/base.css';

createRoot(document.querySelector('#app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
