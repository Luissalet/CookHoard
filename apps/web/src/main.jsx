import React from 'react';
import { createRoot } from 'react-dom/client';
import './hoard-theme.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => {});
