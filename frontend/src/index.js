import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Always UNREGISTER the service worker (all environments). A leftover SW from
// an earlier build was serving a stale app bundle, so pushed fixes never
// appeared until caches were manually cleared. Killing it keeps a local
// always-online app permanently fresh with no DevTools steps required.
serviceWorkerRegistration.unregister();

reportWebVitals();
