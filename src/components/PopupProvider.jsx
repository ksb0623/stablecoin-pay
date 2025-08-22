import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import '../styles/PopupProvider.css';

const PopupCtx = createContext(null);
let uid = 1;

export function PopupProvider({ children }) {
  const [modals, setModals] = useState([]);

  const closeById = useCallback((id) => {
    setModals((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setModals([]);
  }, []);

  // ✅ Promise 기반 alert: OK 클릭 시에만 resolve + 오버레이 제거
  const alert = useCallback(({ title, detail, singleText = 'OK' }) => {
    const id = uid++;
    let resolveRef = { current: null };
    const p = new Promise((resolve) => { resolveRef.current = resolve; });
    setModals((prev) => [
      ...prev,
      { id, type: 'alert', title, detail, singleText, open: true, onClose: () => {
          resolveRef.current?.(); closeById(id);
        } },
    ]);
    return p;
  }, [closeById]);

  // 기존 confirm: Promise로 true/false 반환
  const confirm = useCallback(({ title, detail, cancelText = 'Cancel', continueText = 'Continue' }) => {
    const id = uid++;
    let resolveRef = { current: null };
    const p = new Promise((resolve) => { resolveRef.current = resolve; });
    setModals((prev) => [
      ...prev,
      {
        id, type: 'confirm', title, detail, cancelText, continueText, open: true,
        onCancel: () => { resolveRef.current?.(false); closeById(id); },
        onContinue: () => { resolveRef.current?.(true); closeById(id); },
      },
    ]);
    p.close = () => closeById(id);
    return p;
  }, [closeById]);

  // progress: close 함수 반환 (취소 버튼 유무는 cancelText 존재 여부로 결정)
  const progress = useCallback(({ title, detail, cancelText, onCancel }) => {
    const id = uid++;
    setModals((prev) => [
      ...prev,
      { id, type: 'progress', title, detail, cancelText, onCancel, open: true }
    ]);
    return () => closeById(id);
  }, [closeById]);

  const value = useMemo(() => ({ alert, confirm, progress, dismissAll }), [alert, confirm, progress, dismissAll]);

  return (
    <PopupCtx.Provider value={value}>
      {children}
      {modals.length > 0 && modals.map((m) => (
        <div className="oxp-popup-overlay" key={m.id}>
          <div className={`oxp-popup-container ${m.open ? 'oxp-open' : ''} ${m.detail ? 'oxp-detail' : ''}`}>
            {m.title && <div className="oxp-popup-title">{m.title}</div>}
            {m.type === 'progress' && <div className="oxp-spinner" aria-hidden="true" />}
            {m.detail && <div className="oxp-popup-detail">{m.detail}</div>}

            <div className="oxp-popup-buttons">
              {m.type === 'alert' && (
                <button
                  className="oxp-popup-button oxp-single-btn"
                  onClick={() => { m.onClose?.(); }}
                >
                  {m.singleText || 'OK'}
                </button>
              )}

              {m.type === 'confirm' && (
                <>
                  <button className="oxp-popup-button oxp-cancel-btn" onClick={m.onCancel}>
                    {m.cancelText || 'Cancel'}
                  </button>
                  <button className="oxp-popup-button oxp-continue-btn" onClick={m.onContinue}>
                    {m.continueText || 'Continue'}
                  </button>
                </>
              )}

              {m.type === 'progress' && (
                m.cancelText ? (
                  <button
                    className="oxp-popup-button oxp-single-btn"
                    onClick={() => { m.onCancel?.(); closeById(m.id); }}
                  >
                    {m.cancelText}
                  </button>
                ) : (
                  <div style={{ width: '100%' }} />
                )
              )}
            </div>
          </div>
        </div>
      ))}
    </PopupCtx.Provider>
  );
}

export function usePopup() {
  const ctx = useContext(PopupCtx);
  if (!ctx) throw new Error('usePopup must be used within <PopupProvider>');
  return ctx;
}

export default PopupProvider;
