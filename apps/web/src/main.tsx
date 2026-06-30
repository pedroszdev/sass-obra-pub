import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AlertasProvider } from './context/AlertasProvider';
import { AuthProvider } from './context/AuthProvider';
import { FavoritesProvider } from './context/FavoritesProvider';
import { theme } from './theme';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root não encontrado no index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <BrowserRouter>
        <AuthProvider>
          <FavoritesProvider>
            <AlertasProvider>
              <App />
            </AlertasProvider>
          </FavoritesProvider>
        </AuthProvider>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
