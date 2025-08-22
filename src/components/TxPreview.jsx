// src/components/TxPreview.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useConnectedWallet } from '@xpla/wallet-provider';
import { usePopup } from '../components/PopupProvider';
import '../styles/designSystem.css';
import '../styles/TxPreview.css';

import { Tx as Tx_pb } from '@xpla/xpla.proto/cosmos/tx/v1beta1/tx';
import { Tx, Fee, Coins, Coin, MsgSend, MsgExecuteContract } from '@xpla/xpla.js';

const API_ORIGIN =
  process.env.REACT_APP_API_ORIGIN || 'https://gw-test-gcl.c2xstation.net:9091';

const log = (...a) => console.log('%c[TxPreview]', 'color:#0ff', ...a);

// ---------------- utils ----------------
const b64ToBytes = (b64) => {
  const bin = atob(String(b64));
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64ToUtf8 = (b64) => {
  try {
    const bytes = b64ToBytes(b64);
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    return decodeURIComponent(escape(atob(b64)));
  } catch { return atob(b64); }
};

// unsignedTx: base64(JSON TxData) → Tx.fromData
function fromServerJsonBase64(unsignedTxB64) {
  try {
    const jsonStr = b64ToUtf8(unsignedTxB64);
    log('decode(base64→utf8) length:', jsonStr.length);
    const txData = JSON.parse(jsonStr);
    const tx = Tx.fromData(txData);
    const messages = tx?.body?.messages || [];
    const memo = tx?.body?.memo || '';
    const feeIn = tx?.auth_info?.fee;
    let fee;
    if (feeIn && (Array.isArray(feeIn.amount) ? feeIn.amount.length > 0 : !!feeIn.amount)) {
      try { fee = new Fee(feeIn.gas_limit || feeIn.gas || 0, feeIn.amount); }
      catch { fee = feeIn; }
    }
    return { msgs: messages, memo, fee };
  } catch (e) { log('fromServerJsonBase64 failed', e); return null; }
}
// unsignedTx: base64(proto Tx) → Tx.fromProto
function fromProtoBase64(unsignedTxB64) {
  try {
    const tx_pb = Tx_pb.decode(b64ToBytes(unsignedTxB64));
    const tx = Tx.fromProto(tx_pb);
    return { msgs: tx.body.messages.map((m) => m), memo: tx.body.memo || '', fee: tx?.auth_info?.fee };
  } catch (e) { log('fromProtoBase64 failed', e); return null; }
}
// unsignedTx: base64(JSON createTxOptions-like)
function fromPlainJsonBase64(unsignedTxB64) {
  try {
    const obj = JSON.parse(atob(String(unsignedTxB64)));
    if (obj?.msgs || obj?.fee) return obj;
    return null;
  } catch (e) { log('fromPlainJsonBase64 failed', e); return null; }
}

// JSON 메시지를 실제 Msg 인스턴스로 정규화
function normalizeMsgs(msgsIn = []) {
  const out = [];
  for (const m of msgsIn) {
    // 이미 인스턴스면 그대로
    if (m && (typeof m.toProto === 'function' || typeof m.packAny === 'function')) {
      out.push(m);
      continue;
    }
    const t = m?.['@type'] || m?.type || m?.typeUrl || '';
    switch (t) {
      case '/cosmos.bank.v1beta1.MsgSend':
      case 'cosmos.bank.v1beta1.MsgSend':
        out.push(MsgSend.fromData(m));
        break;
      case '/cosmwasm.wasm.v1.MsgExecuteContract':
      case 'cosmwasm.wasm.v1.MsgExecuteContract':
        out.push(MsgExecuteContract.fromData(m));
        break;
      default:
        // 모르는 타입은 그대로 전달(지갑이 처리할 수도 있음)
        out.push(m);
        break;
    }
  }
  return out;
}

// fee를 안전하게 정규화
function normalizeFee(feeIn) {
  if (!feeIn) return undefined;
  try {
    if (feeIn instanceof Fee) return feeIn;
    const gas = String(feeIn.gas_limit || feeIn.gas || '0');
    const amount = feeIn.amount;
    if (Array.isArray(amount)) {
      return new Fee(gas, amount.map((c) => new Coin(c.denom, c.amount)));
    }
    if (typeof amount === 'string') {
      return new Fee(gas, Coins.fromString(amount));
    }
    if (amount && typeof amount.toString === 'function') {
      return new Fee(gas, amount);
    }
  } catch (e) {
    log('normalizeFee failed', e);
  }
  return undefined;
}

// LCD로 tx 확정 폴링
async function waitForTxConfirm(txhash, { lcd, timeoutMs = 20000, intervalMs = 1200 } = {}) {
  const endpoint = lcd?.replace(/\/+$/, '');
  if (!endpoint) return { ok: false, reason: 'no_lcd' };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${endpoint}/cosmos/tx/v1beta1/txs/${txhash}`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        const code = j?.tx_response?.code ?? j?.txResponse?.code;
        if (code === 0) return { ok: true, data: j };
        if (typeof code === 'number' && code > 0) return { ok: false, data: j, reason: 'code' };
      }
    } catch {}
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return { ok: false, reason: 'timeout' };
}

// 사용자 취소/닫힘 식별 (팝업 미노출 정책 유지)
function isUserCancelError(err) {
  const msg  = String(err?.message || err?.error || err || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  return (
    name.includes('userdenied') ||
    name.includes('user_denied') ||
    msg.includes('user denied') ||
    msg.includes('user rejected') ||
    msg.includes('user reject') ||
    msg.includes('rejected by user') ||
    msg.includes('denied') ||
    msg.includes('cancelled') ||
    msg.includes('canceled') ||
    msg.includes('window closed') ||
    msg.includes('closed') ||
    msg.includes('aborted')
  );
}

// 서버 메시지에서 로그인 필요 여부 감지
function isLoginRequiredMessage(msg) {
  const s = String(msg || '');
  return /로그인|hive\s*로그인|sign\s*in|login|session|expired|unauthori[sz]ed/i.test(s);
}

export default function TxPreview({
  walletAddress: _walletAddress = '',
  gameTitle: _gameTitle = 'Game',
  gameUserName: _gameUserName = '',
  gamePid: _gamePid = '',

  itemImage: _itemImage = '/assets/ruby_medium.png',
  itemName: _itemName = 'Ruby',
  itemPrice: _itemPrice = 10,
  itemCurrency: _itemCurrency = 'axlUSDC',

  haveAmount: _haveAmount = '0',
  feeLabel = 'Free',
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const s = location.state || {};

  // 브로드캐스트 성공 후 네트워크 확정 기다릴 때만 Processing… 표시
  const [isConfirming, setIsConfirming] = useState(false);

  const popup = usePopup();
  const openAlert = useCallback(async (msg) => {
    await popup.alert({ title: msg, singleText: 'OK' }); // 영문 고정
  }, [popup]);

  const profile = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('hive_profile') || 'null'); }
    catch { return null; }
  }, []);

  const item = s.item || null; // { name, price, image, code }
  const tokenName = s.tokenName || _itemCurrency;

  // 주소/게임 정보
  const walletAddress = s.walletAddress || _walletAddress;
  const gameTitle = s.gameTitle || profile?.gameTitle || _gameTitle;
  const gamePid = s.pid || profile?.pid || _gamePid;
  const userGroupId = s.groupId || profile?.groupId || null;
  const userGroupName = s.groupName || profile?.groupName || _gameUserName;
  const gameId = s.gameId || profile?.gameId;

  const itemName = item?.name || _itemName;
  const itemImage = item?.image || _itemImage;

  // 숫자 유틸
  const toNum = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/,/g, ''));
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  };
  const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString() : n);

  // ===== 잔액 조회 (REST) — XPLA 18, axlUSDC 6
  const connected = useConnectedWallet();
  const [balances, setBalances] = useState({ xpla: '0', axlusdc: '0' });

  useEffect(() => {
    const fetchBalances = async () => {
      const addr = connected?.walletAddress || walletAddress;
      if (!addr) return;
      const REST_URL = process.env.REACT_APP_XPLA_LCD || 'https://cube-lcd.xpla.dev';
      const denomMap = {
        xpla: process.env.REACT_APP_XPLA_DENOM || 'axpla',
        axlusdc: process.env.REACT_APP_AXLUSDC_DENOM ||
          'ibc/8D450B77BD87010DDBF3B67F29961D7302709DFF83E18A4C96A11FD7F3B96F68',
      };
      const denomDecimals = {
        [denomMap.xpla]: Number(process.env.REACT_APP_XPLA_DECIMALS || 18),
        [denomMap.axlusdc]: Number(process.env.REACT_APP_AXLUSDC_DECIMALS || 6),
      };

      try {
        const res = await fetch(`${REST_URL}/cosmos/bank/v1beta1/balances/${addr}`);
        const data = await res.json();
        const getAmt = (den) => {
          const coin = data?.balances?.find?.((c) => c.denom === den);
          const dec = denomDecimals[den] ?? 6;
          return coin ? (Number(coin.amount) / 10 ** dec).toLocaleString() : '0';
        };
        setBalances({ xpla: getAmt(denomMap.xpla), axlusdc: getAmt(denomMap.axlusdc) });
      } catch { setBalances({ xpla: '0', axlusdc: '0' }); }
    };
    fetchBalances();
  }, [connected?.walletAddress, walletAddress]);

  // 표시 잔액
  const [haveNum, setHaveNum] = useState(() => {
    const first = toNum(s.haveAmount ?? _haveAmount);
    if (Number.isFinite(first)) return first;
    try {
      const ls = JSON.parse(localStorage.getItem('wallet_balances') || 'null');
      const n = toNum(ls?.axlUSDC ?? ls?.axlusdc);
      if (Number.isFinite(n)) return n;
    } catch {}
    return toNum(balances.axlusdc);
  });
  useEffect(() => {
    if (!Number.isFinite(toNum(s.haveAmount ?? _haveAmount))) {
      const restNum = toNum(balances.axlusdc);
      setHaveNum(Number.isFinite(restNum) ? restNum : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances.axlusdc]);

  // 결제 금액/잔액 계산
  const numPay = Number.isFinite(toNum(item?.price)) ? toNum(item?.price) : toNum(_itemPrice);
  const haveAmountText = fmt(haveNum);
  const payAmountText = fmt(numPay);
  const insufficient = Number.isFinite(haveNum) && Number.isFinite(numPay) ? numPay > haveNum : false;
  const after = Number.isFinite(haveNum) && Number.isFinite(numPay) ? (haveNum - numPay) : NaN;
  const afterDisplay = insufficient ? `-${fmt(numPay - haveNum)}` : fmt(after);

  const handleBack = useCallback(() => {
    // ✅ 선택 복원을 위해 코드 전달
    navigate('/', { replace: true, state: { selectedCode: (s.item?.code) } });
  }, [navigate, s.item]);

  // ---------------- 구매 처리 ----------------
  async function requestPayment() {
    // 최초 클릭 시 UI 변화 없음 (버튼, 팝업 그대로)
    if (!walletAddress && !connected?.walletAddress) { await openAlert('Wallet is not connected.'); return; }
    if (!gameId || !gamePid || !userGroupId) { await openAlert('Game login info not found.'); return; }
    if (!item?.code) { await openAlert('Product code is missing.'); return; }
    // if (insufficient) { await openAlert('Insufficient balance.'); return; }

    try {
      // 1) 서버에 결제 생성(UnsignedTx 수신)
      const numGameId = Number(gameId);
      const numUser = Number(userGroupId);
      const strPlayer = String(gamePid ?? '').trim();

      if (!Number.isFinite(numGameId) || !Number.isFinite(numUser) || !strPlayer) {
        await openAlert('Game login info is missing or invalid. Please sign in again.');
        let lastGameMeta = null;
        try { lastGameMeta = JSON.parse(localStorage.getItem('lastGameMeta') || 'null'); } catch {}
        navigate('/signin', { replace: true, state: { gameMeta: lastGameMeta, gameId, selectedCode: s.item?.code } });
        return;
      }

      const body = {
        address: connected?.walletAddress || walletAddress,
        gameId: numGameId,   // number로 전송
        playerId: strPlayer,         // string로 전송(이미 문자열)
        userId: String(numUser),     // string로 전송
        productCode: String(item.code),
      };
      log('[payment] request →', `${API_ORIGIN}/hive/payment`, body);

      const res = await fetch(`${API_ORIGIN}/hive/payment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
      });
      log('[payment] status:', res.status);

      if (!res.ok) {
        // 서버 에러 메시지 읽기
        let serverMsg = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          log('[payment] error JSON:', errJson);
          serverMsg = errJson?.message || serverMsg;
        } catch {
          try {
            const errText = await res.text();
            log('[payment] error TEXT:', errText);
            if (errText) serverMsg = errText;
          } catch {}
        }
        if (isLoginRequiredMessage(serverMsg)) {
          await openAlert('You need to sign in to continue.');
          return;
        }
        await openAlert('Payment request failed. Please try again.');
        return;
      }

      const json = await res.json();
      log('[payment] response JSON:', json);
      if (!json?.success) {
        const msg = json?.message;
        if (isLoginRequiredMessage(msg)) {
          await openAlert('You need to sign in to continue.');
          return;
        }
        await openAlert('Payment request failed. Please try again.');
        return;
      }

      // 2) unsignedTx 추출/파싱
      const payload = (json?.data && json?.data?.data) ? json.data.data : (json?.data ?? json);
      const unsignedTxB64 =
        payload?.unsignedTx ?? json?.data?.unsignedTx ?? json?.unsignedTx ??
        json?.data?.unsignTx ?? json?.unsignTx ?? json?.data?.unsignedTX ??
        json?.unsignedTX ?? json?.data?.unsigntx ?? json?.unsigntx;
      const txIdFromServer =
        payload?.transactionId ?? json?.data?.transactionId ?? json?.transactionId;

      log('[payment] unsignedTx?', !!unsignedTxB64, 'txId:', txIdFromServer);
      if (!unsignedTxB64) { await openAlert('Server did not return unsignedTx.'); return; }

      let createTxOptions =
        fromServerJsonBase64(unsignedTxB64) ||
        fromProtoBase64(unsignedTxB64) ||
        fromPlainJsonBase64(unsignedTxB64);
      if (!createTxOptions) { await openAlert('Unable to parse unsignedTx.'); return; }

      // 메시지/수수료 정규화
      const msgs = normalizeMsgs(createTxOptions.msgs || []);
      const fee = normalizeFee(createTxOptions.fee);
      if (!msgs || msgs.length === 0) {
        await openAlert('The transaction has no messages to sign. Please contact support.');
        return;
      }

      log('[broadcast-prep] msgs:', msgs.map(m => m?.constructor?.name || typeof m), 'memo:', createTxOptions.memo, 'hasFee?', !!fee);

      // 3) 지갑 서명/브로드캐스트
      let postResult;
      try {
        const broadcastTx = {
          msgs,
          memo: createTxOptions.memo || '', // memo is required
          ...(fee ? { fee } : {}),
        };
        log('[broadcastTx] ->', broadcastTx);
        postResult = await connected.post(broadcastTx);
      } catch (postErr) {
        log('[post error]', postErr);
        // ❗ 사용자 취소/닫힘은 팝업 없이 조용히 종료(재시도 가능)
        if (isUserCancelError(postErr)) return;

        // 온체인/기타 실패는 짧은 안내
        await openAlert('Transaction failed on-chain. The network rejected your transaction (e.g., insufficient funds, invalid parameters, or fee too low). Please try again.');
        return;
      }

      log('[postResult]', postResult);

      if (postResult && postResult.success === false) {
        const raw = postResult?.result?.raw_log || postResult?.error?.message || '';
        log('[postResult failed]', raw);
        await openAlert('Transaction failed on-chain. Please check your balances and try again.');
        return;
      }

      // 4) 브로드캐스트 성공 → 진행 팝업 + 버튼 라벨 Processing…
      const txhash =
        postResult?.txhash ||
        postResult?.result?.txhash ||
        txIdFromServer || '';
      if (!txhash) { await openAlert('Broadcast succeeded but no txhash found.'); return; }

      const endProgress = popup.progress({
        title: 'Transaction in progress',
        detail: 'Broadcasted. Waiting for the network to confirm (~5–6 seconds).',
      });
      setIsConfirming(true);

      const lcd = process.env.REACT_APP_XPLA_LCD || 'https://cube-lcd.xpla.dev';
      const waited = await waitForTxConfirm(txhash, { lcd, timeoutMs: 20000, intervalMs: 1200 });

      endProgress();
      setIsConfirming(false);

      if (!waited.ok) {
        if (waited.reason === 'code') {
          await openAlert('Transaction failed on-chain. Please check your balances/fees and try again.');
          return;
        }
      }

      // 5) 완료 라우팅
      navigate('/tx-complete', {
        replace: true,
        state: {
          item,
          txId: txhash,
          timestamp: new Date().toLocaleString('ko-KR', { hour12: false }),
          unit: 'EA',
        },
      });
    } catch (e) {
      log('[ERROR]', e);
      setIsConfirming(false);
      await openAlert('Payment request failed. Please try again.');
    }
  }

  return (
    <div className="tp-container">
      <div className="tp-frame">
        {/* Header */}
        <div className="tp-header">
          <button className="tp-back-btn" onClick={handleBack} aria-label="Back to items">
            <img className="tp-back-icon" src="/assets/icon_back.svg" alt="" />
          </button>
          <div className="tp-header-logo">
            <img src="/assets/logo_service.svg" alt="Logo" className="tp-logo-image" />
          </div>
        </div>

        {/* Accounts */}
        <div className="tp-account-section">
          <div className="tp-account-item">
            <div className="tp-account-icon">
              <img src="/assets/checkCircle_filled.svg" alt="" />
            </div>
            <div className="tp-account-info">
              <div className="tp-account-label">Wallet Account</div>
              <div className="tp-account-details">
                {connected?.walletAddress || walletAddress || '-'}
              </div>
            </div>
          </div>

          <div className="tp-account-item">
            <div className="tp-account-icon">
              <img src="/assets/checkCircle_filled.svg" alt="" />
            </div>
            <div className="tp-account-info">
              <div className="tp-account-label">Game Account</div>
              <div className="tp-account-details">
                {gameTitle}
                <br />
                {userGroupName || 'Character'} (PID : {gamePid || '-'})
              </div>
            </div>
          </div>
        </div>

        {/* Item */}
        <div className="tp-item-section">
          <div className="tp-item-info">
            <div className="tp-item-details">
              <div className="tp-item-image">
                <img src={itemImage} alt={itemName} />
              </div>
              <div className="tp-item-name">{itemName}</div>
            </div>
            <div className="tp-item-price">
              <div className="tp-price-amount">{fmt(numPay)}</div>
              <div className="tp-price-currency">{tokenName}</div>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="tp-payment-section">
          <div className="tp-payment-row">
            <div className="tp-payment-label">Amount you have</div>
            <div className="tp-payment-amount">
              <span className="tp-amount-value">{haveAmountText}</span>{' '}
              <span className="tp-amount-currency">{tokenName}</span>
            </div>
          </div>

          <div className="tp-payment-row">
            <div className="tp-payment-label">Amount you pay</div>
            <div className="tp-payment-amount">
              <span className="tp-amount-value">{fmt(numPay)}</span>{' '}
              <span className="tp-amount-currency">{tokenName}</span>
            </div>
          </div>

          <div className="tp-payment-row">
            <div className="tp-payment-label">Transaction fee</div>
            <div className="tp-payment-amount">
              <span className="tp-amount-value">{feeLabel}</span>{' '}
              <span className="tp-amount-currency">XPLA</span>
            </div>
          </div>

          <div className="tp-divider" />

          <div className="tp-payment-row">
            <div className="tp-payment-label">After Transaction</div>
            <div className="tp-payment-amount">
              <span className={`tp-amount-value ${insufficient ? 'tp-amount-negative' : ''}`}>
                {Number.isFinite(after) ? afterDisplay : '-'}
              </span>{' '}
              <span className="tp-amount-currency">{tokenName}</span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="tp-bottom-sheet">
          <button
            className="tp-checkout-button"
            disabled={isConfirming}
            onClick={requestPayment}
          >
            {isConfirming ? 'Processing…' : 'Check Out'}
          </button>
          <div className="tp-terms-text">
            By completing your purchase, you agree to the terms and conditions of the 000000 platform.
            Due to the nature of blockchain-based transactions, refunds are not available.
          </div>
        </div>
      </div>
    </div>
  );
}
