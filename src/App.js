// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import ItemList from './components/ItemList';
import LoginDefault from './components/LoginDefault';
import TxPreview from './components/TxPreview';
import TxComplete from './components/TxComplete';
import RedirectCatcher from './components/RedirectCatcher';
import { PopupProvider } from './components/PopupProvider';

export default function App() {
  return (
    <BrowserRouter>
      <PopupProvider>
        <Routes>
          {/* 첫 화면: 상품 리스트 */}
          <Route path="/" element={<ItemList />} />

          {/* 로그인 화면 */}
          <Route path="/signin" element={<LoginDefault />} />

          {/* 하이브 리다이렉트 처리 (풀페이지 리다이렉트 전용) */}
          <Route path="/redirect" element={<RedirectCatcher />} />

          {/* 결제 프리뷰 */}
          <Route path="/tx-preview" element={<TxPreview />} />

          <Route path="/tx-complete" element={<TxComplete />} />

          {/* 와일드카드 → 루트로 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PopupProvider>
    </BrowserRouter>
  );
}
