import {createRoot} from 'react-dom/client';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import App from './App.tsx';
import './index.css';

const originalWarn = console.warn;
const originalError = console.error;
console.warn = (...args: any[]) => {
  const msg = args.join(' ');
  if (msg.includes('TURN URIs') || msg.includes('server versions') || msg.includes('Failed to get TURN')) return;
  originalWarn(...args);
};
console.error = (...args: any[]) => {
  const msg = args.join(' ');
  if (msg.includes('TURN URIs') || msg.includes('server versions') || msg.includes('Failed to get TURN')) return;
  originalError(...args);
};

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
