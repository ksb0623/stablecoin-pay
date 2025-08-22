import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/designSystem.css';
import '../styles/LoginDefault.css';
import { useWallet, useConnectedWallet } from '@xpla/wallet-provider';
import { usePopup } from '../components/PopupProvider';

const API_ORIGIN =
  process.env.REACT_APP_API_ORIGIN || 'https://gw-test-gcl.c2xstation.net:9091';

const slog = (...a) => console.log('[LoginDefault]', ...a);

// ------------- HTTP -------------
async function apiGet(path) {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ------------- helpers -------------
/** HIVE res: base64( encodeURIComponent(JSON) ) → object */
function decodeRes(resStr) {
  try {
    const s1 = atob(resStr); // base64 → string
    try {
      return JSON.parse(decodeURIComponent(s1)); // 일반 케이스
    } catch {
      return JSON.parse(s1); // 혹시 URI 인코딩이 안 된 케이스
    }
  } catch (e) {
    console.warn('[decodeRes] failed:', e);
    return null;
  }
}

function toUserAndGroups(respJson) {
  const user = respJson?.user || respJson?.data?.user;
  const groups = user?.gameUserInfo?.groups || [];
  const pid = user?.pid || '';
  return {
    pid,
    groups: groups.map(g => ({ groupId: String(g.groupId), groupName: g.groupName })),
  };
}

// ------------- component -------------
export default function LoginDefault() {
  const location = useLocation();
  const navigate = useNavigate();
  const popup = usePopup();
  const openAlert = useCallback(async (msg) => {
    await popup.alert({ title: msg, singleText: 'OK' });
  }, [popup]);
  const metaFromItemList = location.state?.gameMeta || null; // { gameId, title, appId, hiveUrl, gindex, redirectUrl? }

  // 로그인/캐릭터
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pid, setPid] = useState('');
  const [characterList, setCharacterList] = useState([]);
  const [selectedCharacterTitle, setSelectedCharacterTitle] = useState('Select Character');
  const [selectedCharacterId, setSelectedCharacterId] = useState(null);

  // 선택된 게임(잠금 표시)
  const [selectedGameTitle, setSelectedGameTitle] = useState('Select game');
  const [selectedGameId, setSelectedGameId] = useState(null);

  // 캐릭터 드롭다운
  const [charDropdownOpen, setCharDropdownOpen] = useState(false);
  const charDropdownRef = useRef(null);

  // 월렛
  const { status, connect } = useWallet();
  const connectedWallet = useConnectedWallet();

  // 초기 세팅
  useEffect(() => {
    if (metaFromItemList?.title) {
      setSelectedGameTitle(metaFromItemList.title);
      setSelectedGameId(metaFromItemList.gameId);
      try { localStorage.setItem('lastGameMeta', JSON.stringify(metaFromItemList)); } catch {}
      return;
    }
    try {
      const saved = localStorage.getItem('lastGameMeta');
      if (saved) {
        const m = JSON.parse(saved);
        if (m?.title) setSelectedGameTitle(m.title);
        if (m?.gameId) setSelectedGameId(m.gameId);
      }
    } catch {}
  }, [metaFromItemList]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const onDocClick = (e) => {
      if (charDropdownRef.current && !charDropdownRef.current.contains(e.target)) {
        setCharDropdownOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // 서버 세션(쿠키) 확인
  const tryCookieSession = useCallback(async (gameId) => {
    const j = await apiGet(`/hive/login?gameId=${encodeURIComponent(gameId)}`);
    slog('cookie check json:', j);
    const { pid: _pid, groups } = toUserAndGroups(j);
    if (_pid && groups.length) {
      setIsLoggedIn(true);
      setPid(_pid);
      setCharacterList(groups);
      setSelectedCharacterTitle('Select Character');
      setSelectedCharacterId(null);
      setCharDropdownOpen(false);
      return true;
    }
    return false;
  }, []);

  // pid/token 확정
  const confirmWithPidToken = useCallback(async ({ gameId, pid, token }) => {
    const qs = new URLSearchParams({ gameId: String(gameId), pid, token });
    const j = await apiGet(`/hive/login?${qs.toString()}`);
    slog('confirm pid/token json:', j);
    const { pid: _pid, groups } = toUserAndGroups(j);
    if (_pid && groups.length) {
      setIsLoggedIn(true);
      setPid(_pid);
      setCharacterList(groups);
      setSelectedCharacterTitle('Select Character');
      setSelectedCharacterId(null);
      setCharDropdownOpen(false);
      return true;
    }
    return false;
  }, []);

  // /signin 진입/복귀 시: 쿠키 → redirect 저장값 흡수(pid/token)
  useEffect(() => {
    (async () => {
      // gameId 확보
      let gid =
        metaFromItemList?.gameId ||
        selectedGameId ||
        (() => {
          try { return JSON.parse(localStorage.getItem('lastGameMeta') || '{}')?.gameId; }
          catch { return null; }
        })();

      if (!gid) return;

      // A) 쿠키 세션 먼저
      try {
        const okByCookie = await tryCookieSession(gid);
        if (okByCookie) return;
      } catch {}

      // B) /redirect 저장값 흡수
      try {
        const saved = localStorage.getItem('hive_redirect_from');
        if (saved) {
          const { gameId, res } = JSON.parse(saved); // { at, href, gameId, res }
          localStorage.removeItem('hive_redirect_from'); // 1회성 소비
          if (gameId) gid = gameId;

          const parsed = decodeRes(res); // { code, pid, token, ... }
          if (parsed?.code === '100' && parsed?.pid && parsed?.token) {
            const ok = await confirmWithPidToken({
              gameId: gid,
              pid: parsed.pid,
              token: parsed.token,
            });
            if (ok) return;
          }
        }
      } catch {}

      slog('❌ session not confirmed yet');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaFromItemList, selectedGameId]);

  // 같은 탭 하이브 로그인 시작 (redirectUrl은 항상 우리 앱으로 강제)
  const startLoginSameTab = useCallback((meta) => {
    const ourRedirect = `${window.location.origin}/redirect`;
    const redirectUrl = `${ourRedirect}?payload=${encodeURIComponent(meta.gameId)}`;

    const requestParam = {
      country: 'US',
      language: 'en',
      appid: meta.appId,
      gindex: meta.gindex,
      url: redirectUrl,
    };

    const b64 = btoa(encodeURIComponent(JSON.stringify(requestParam)));
    const hiveBase = meta.hiveUrl || 'https://weblogin.withhive.com/login?param=';
    const loginUrl = hiveBase + b64;

    slog('➡️ same-tab to HIVE:', { loginUrl, redirectUrl });
    window.location.href = loginUrl;
  }, []);

  // Connect Game
  const handleConnectGame = useCallback(async () => {
    let meta =
      metaFromItemList ||
      (() => {
        try { return JSON.parse(localStorage.getItem('lastGameMeta') || 'null'); } catch { return null; }
      })() ||
      (selectedGameId ? { gameId: selectedGameId, title: selectedGameTitle } : null);

    if (!meta?.gameId) {
      await openAlert('Please select a game first.');
      return;
    }

    // 1) 쿠키 세션 확인
    try {
      const ok = await tryCookieSession(meta.gameId);
      if (ok) return;
    } catch {}

    // 2) 하이브로 이동 (pid/token 받아서 우리가 서버 호출)
    if (!meta.appId || !meta.gindex || !meta.hiveUrl) {
      await openAlert('Missing login config. (appId, gindex, hiveUrl)');
      return;
    }
    startLoginSameTab(meta);
  }, [metaFromItemList, selectedGameId, selectedGameTitle, tryCookieSession, startLoginSameTab]);

  // 월렛
  const handleWalletConnect = () => { if (status !== 'CONNECTED') connect(); };

  // === Continue 활성화 조건: "게임 로그인" + "캐릭터 선택" + "월렛 연결" ===
  const isWalletConnected = !!connectedWallet?.walletAddress;
  const canContinue = isLoggedIn && !!selectedCharacterId && isWalletConnected;

  // Continue 클릭 → ItemList로 복귀 + 상태 전달/저장
  const handleContinue = () => {
    if (!canContinue) return;

    const profile = {
      gameId: selectedGameId,
      gameTitle: selectedGameTitle,
      pid,
      groupId: selectedCharacterId,
      groupName: selectedCharacterTitle,
    };

    try { localStorage.setItem('hive_profile', JSON.stringify(profile)); } catch {}

    navigate('/', {
      replace: true,
      state: {
        signedIn: true,
        gameId: selectedGameId,
        gameTitle: selectedGameTitle,
        pid,
        groupId: selectedCharacterId,
        groupName: selectedCharacterTitle,
      },
    });
  };

  // 잔액 조회 (REST API)
  const [balances, setBalances] = useState({ xpla: '0', axlusdc: '0' });
  const connected = useConnectedWallet();
  useEffect(() => {
    const fetchBalances = async () => {
      if (!connected?.walletAddress) return;
      const REST_URL = 'https://cube-lcd.xpla.dev';
      const denomMap = {
        xpla: 'axpla',
        axlusdc: 'ibc/8D450B77BD87010DDBF3B67F29961D7302709DFF83E18A4C96A11FD7F3B96F68',
      };
      try {
        const res = await fetch(`${REST_URL}/cosmos/bank/v1beta1/balances/${connected.walletAddress}`);
        const data = await res.json();
        const getAmt = (den) => {
          const coin = data.balances.find((c) => c.denom === den);
          return coin ? (Number(coin.amount) / 1_000_000).toLocaleString() : '0';
        };
        setBalances({ xpla: getAmt(denomMap.xpla), axlusdc: getAmt(denomMap.axlusdc) });
      } catch {}
    };
    fetchBalances();
  }, [connected?.walletAddress]);

  // 레이아웃
  const hasCharacters = characterList.length > 0;
  const GAME_TOP = 120;
  const GAME_HEIGHT = isLoggedIn ? 200 : hasCharacters ? 248 : 232;

  let hasMetaId = !!metaFromItemList?.gameId || !!selectedGameId;
  if (!hasMetaId) {
    try { hasMetaId = !!JSON.parse(localStorage.getItem('lastGameMeta') || 'null')?.gameId; } catch {}
  }
  const canConnectGame = !isLoggedIn && hasMetaId;

  return (
    <div className="main-container">
      {/* Header */}
      <div className="header-bar">
        <div className="header-logo">
          <img src="/assets/logo_service.svg" alt="Logo" className="logo-image" />
        </div>
      </div>

      {/* Game Section */}
      <div className="game-section" style={{ height: `${GAME_HEIGHT}px`, top: `${GAME_TOP}px` }}>
        {isLoggedIn && (
          <button
            className="disconnect-btn"
            style={{ position: 'absolute', right: 20, top: 12, zIndex: 3 }}
            onClick={() => {
              setIsLoggedIn(false);
              setPid('');
              setCharacterList([]);
              setSelectedCharacterTitle('Select Character');
              setSelectedCharacterId(null);
            }}
          >
            Disconnect
          </button>
        )}

        <div className="game-text">
          {isLoggedIn ? 'Game account connected' : 'Sign in to your game account.'}
        </div>

        <div className="game-icon">
          <img src="/assets/gameicon.svg" alt="Game Icon" />
        </div>

        {/* 선택된 게임(잠금) */}
        <div className="game-option-select" style={isLoggedIn ? { opacity: 0.6 } : undefined}>
          <div className="game-option-select-bg"></div>
          <div className="game-option-select-text">{selectedGameTitle}</div>
        </div>

        {/* 캐릭터 드롭다운 */}
        {hasCharacters && (
          <div className="game-option-select" ref={charDropdownRef} style={{ top: 127 }}>
            <div className="game-option-select-bg" onClick={() => setCharDropdownOpen(v => !v)} />
            <div className="game-option-select-text" onClick={() => setCharDropdownOpen(v => !v)}>
              {selectedCharacterTitle}
            </div>
            <div
              className={`dropdown-arrow ${charDropdownOpen ? 'open' : ''}`}
              onClick={() => setCharDropdownOpen(v => !v)}
            >
              <img src="/assets/dropdown_down.svg" alt="Dropdown Arrow" />
            </div>
            <div
              className={`dropdown-menu ${charDropdownOpen ? 'open' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              {characterList.map((g) => (
                <div
                  key={g.groupId}
                  className="dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCharacterTitle(g.groupName);
                    setSelectedCharacterId(g.groupId);
                    setCharDropdownOpen(false);
                  }}
                >
                  {g.groupName}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connect Game */}
        {!isLoggedIn && (
          <button
            className={`connect-game-btn ${canConnectGame ? '' : 'disabled'}`}
            onClick={handleConnectGame}
            style={{ top: hasCharacters ? 235 : undefined }}
            disabled={!canConnectGame}
          >
            <div className="connect-game-btn-text">Connect Game</div>
          </button>
        )}
      </div>

      {/* Wallet Section */}
      {connectedWallet?.walletAddress ? (
        <div className="wallet-section">
          <button className="disconnect-btn">Disconnect</button>
          <div className="wallet-address">
            <div className="wallet-address-text">{connectedWallet.walletAddress}</div>
          </div>
          <div className="balance-section">
            <div className="balance-item">
              <div className="balance-token">
                <div className="token-icon axlusdc"></div>
                <span className="token-name">axlUSDC</span>
              </div>
              <span className="token-amount">{balances.axlusdc}</span>
            </div>
            <div className="balance-item">
              <div className="balance-token">
                <div className="token-icon xpla">X</div>
                <span className="token-name">XPLA</span>
              </div>
              <span className="token-amount">{balances.xpla}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="wallet-section">
          <div className="wallet-text">Please connect a wallet containing stablecoins.</div>
          <div className="wallet-icon">
            <img src="/assets/walleticon.svg" alt="Wallet Icon" />
          </div>
          <button className="connect-wallet-btn" onClick={handleWalletConnect}>
            <div className="connect-wallet-btn-text">Connect Wallet</div>
          </button>
        </div>
      )}

      {/* Continue (세 가지 조건 모두 충족 시 활성화) */}
      <div
        className={`continue-section ${canContinue ? 'active' : ''}`}
        onClick={handleContinue}
        style={{
          opacity: canContinue ? 1 : 0.4,
          pointerEvents: canContinue ? 'auto' : 'none',
        }}
        aria-disabled={!canContinue}
      >
        <div className="continue-bg"></div>
        <div className="continue-text">Continue</div>
      </div>

    </div>
  );
}
