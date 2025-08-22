import './polyfills';  // 반드시 최상단에
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';

import {
  getChainOptions,
  WalletProvider,
} from '@xpla/wallet-provider';

const root = ReactDOM.createRoot(document.getElementById('root'));

// getChainOptions() 는 비동기 함수이므로, 먼저 실행해야 합니다.
getChainOptions().then((chainOptions) => {
  root.render(
    <React.StrictMode>
      <WalletProvider {...chainOptions}>
        <App />
      </WalletProvider>
    </React.StrictMode>
  );
});

reportWebVitals();
