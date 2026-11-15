import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { consumeRestoreFragment } from './state/cloud/local';
import './visual-theme.css';

const restoreAccess = consumeRestoreFragment();
createRoot(document.getElementById('root')!).render(<StrictMode><App restoreAccess={restoreAccess}/></StrictMode>);
