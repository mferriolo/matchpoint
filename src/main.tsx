import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { JobTypesProvider } from './contexts/JobTypesContext'

// Import Zoom SDK utilities to register global error handlers early
// This suppresses non-critical Zoom telemetry errors (status 0 network failures)
import './utils/loadZoomSDK'

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(
  <JobTypesProvider>
    <App />
  </JobTypesProvider>
);
