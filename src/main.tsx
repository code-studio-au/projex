import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import 'mantine-react-table/styles.css';
import './app.css';
import App from './App';

const theme = createTheme({
  defaultRadius: 'md',
  primaryColor: 'blue',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  headings: { fontFamily: 'inherit' },
  components: {
    ActionIcon: {
      defaultProps: { variant: 'subtle' },
    },
    Paper: {
      defaultProps: { radius: 'md' },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </React.StrictMode>
);
