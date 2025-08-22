import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/designSystem.css';
import '../styles/TxComplete.css';

export default function TxComplete() {
  const navigate = useNavigate();
  const { state } = useLocation() || {};

  // TxPreview에서 넘겨준 실제 값
  const item = state?.item || { name: 'Ruby', image: '/assets/ruby_small.png' };
  const txId = state?.txId || '-';
  const timestamp = state?.timestamp || '-';
  const unit = state?.unit || 'EA';

  const handleBack = () => {
    // ✅ 구매 직전 선택했던 아이템 코드로 복원
    const selectedCode = item?.code;
    navigate('/', { replace: true, state: { selectedCode } });
  };

  // 긴 해시는 줄여서 표시
  const shortHash = txId && txId.length > 20 ? `${txId.slice(0, 16)}…${txId.slice(-6)}` : txId;

  // Explorer 네트워크: state.explorerNetwork > ENV > 기본(mainnet)
  const envNetwork = process.env.REACT_APP_XPLA_NETWORK; // 'mainnet' | 'testnet'
  const explorerNetwork =
    state?.explorerNetwork ||
    envNetwork ||
    'mainnet';

  // XPLA 공식 탐색기
  const defaultBase =
    explorerNetwork === 'testnet'
      ? 'https://explorer.xpla.io/testnet/tx/'
      : 'https://explorer.xpla.io/mainnet/tx/';

  const explorerBase = state?.explorerBase || defaultBase;
  const explorerUrl = txId && txId !== '-' ? `${explorerBase}${txId}` : null;

  return (
    <div className="tc-container">
      {/* Header */}
      <div className="tc-header">
        <div className="tc-header-logo">
          <img src="/assets/logo_service.svg" alt="Logo" className="tc-logo-image" />
        </div>
      </div>

      {/* Success Icon */}
      <div className="tc-success-icon">
        <img src="/assets/successIcon.svg" alt="Success" />
      </div>

      {/* Success Message */}
      <div className="tc-success-message">
        <div className="tc-success-title">Awsome!</div>
        <div className="tc-success-subtitle">
          Purchase complete. Let the fun begin.
        </div>
      </div>

      {/* You received (Item) */}
      <div className="tc-item-section">
        <div className="tc-item-header">
          <div className="tc-item-icon">
            <img src="/assets/checkCircle.svg" alt="Check" />
          </div>
          <div className="tc-item-label">You received</div>
        </div>

        <div className="tc-divider" />

        <div className="tc-item-details">
          <div className="tc-item-info">
            <div className="tc-item-image">
              <img src={item.image || '/assets/ruby_small.png'} alt={item.name || 'Item'} />
            </div>
            <div className="tc-item-name">{item.name || 'Item'}</div>
          </div>

          <div className="tc-item-quantity">
            <div className="tc-quantity-unit">{unit}</div>
          </div>
        </div>
      </div>

      {/* Transaction Details */}
      <div className="tc-detail-section">
        <div className="tc-item-header">
          <div className="tc-item-icon">
            <img src="/assets/checkCircle.svg" alt="Check" />
          </div>
          <div className="tc-item-label">Transaction Details</div>
        </div>

        <div className="tc-divider" />

        <div className="tc-detail-rows">
          <div className="tc-detail-row">
            <div className="tc-detail-key">Transaction Hash</div>
            <div className="tc-detail-value tc-hash" title={txId}>
              {explorerUrl ? (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tc-hash-link"
                >
                  {shortHash}
                </a>
              ) : (
                shortHash
              )}
            </div>
          </div>
          <div className="tc-detail-row">
            <div className="tc-detail-key">Timestamp</div>
            <div className="tc-detail-value">{timestamp}</div>
          </div>
        </div>
      </div>

      {/* Back Button */}
      <button className="tc-back-button" onClick={handleBack}>
        Back to Shop
      </button>
    </div>
  );
}
