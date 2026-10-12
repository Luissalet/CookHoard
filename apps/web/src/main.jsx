import React from 'react';
import { createRoot } from 'react-dom/client';
import './hoard-theme.css';
import './styles.css';
import App from './App.jsx';
import { installCopilot } from './copilot-context.js';

installCopilot();   // window.hoardCopilot: what the Faustus panel reads from this app

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => {});
