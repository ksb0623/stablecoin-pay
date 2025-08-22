import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/designSystem.css';
import '../styles/ItemList.css';
import { usePopup } from '../components/PopupProvider';
import { useWallet, useConnectedWallet } from '@xpla/wallet-provider';

const API_ORIGIN = process.env.REACT_APP_API_ORIGIN || 'https://gw-test-gcl.c2xstation.net:9091';
const DEFAULT_GAME_ID = Number(process.env.REACT_APP_DEFAULT_GAME_ID || 3);

/** URL ?gid=2, or navigate state, or env → gameId 결정 */
function resolveGameId(location) {
  const qs = new URLSearchParams(location.search || '');
  const q = Number(qs.get('gid'));
  if (Number.isFinite(q) && q > 0) return q;
  const st = location.state?.gameId;
  if (Number.isFinite(st) && st > 0) return st;
  return DEFAULT_GAME_ID;
}

/** localStorage에서 프로필 읽기(형식 오류 방어) */
function readProfile() {
  try {
    const raw = localStorage.getItem('hive_profile');
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p) return null;
    return p;
  } catch {
    return null;
  }
}

export default function ItemList({
  tokenName = 'axlUSDC',
  gameIcon = '/assets/game_icon_temp.png', // 임시 공통 아이콘
  items: initialItems,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = usePopup();
  const { disconnect } = useWallet();
  const connected = useConnectedWallet();

  // ── 로그인/프로필: 최초엔 무조건 로그인 아님으로 시작 ──
  const [profile, setProfile] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(false);

  // 선택된 게임
  const [gameId, setGameId] = useState(() => resolveGameId(location));

  // 서버에서 받은 게임 메타/타이틀/상품
  const [gameTitle, setGameTitle] = useState('Loading...');
  const [gameMeta, setGameMeta] = useState(null); // { gameId, title, appId, hiveUrl, redirectUrl, gindex }
  const [items, setItems] = useState(() => initialItems || []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // 선택 상태
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const selected = selectedIdx >= 0 ? items[selectedIdx] : null;

  const pid = profile?.pid || null;
  const userGroupId = profile?.groupId || null;
  const userGroupName = profile?.groupName || null;

  // ✅ 세션(탭) 내 두 번째 방문부터는 복원 허용
  useEffect(() => {
    const seen = sessionStorage.getItem('il_seen');
    if (!seen) {
      // 첫 방문: 복원하지 않음 → Sign In 강제 노출
      sessionStorage.setItem('il_seen', '1');
      setProfile(null);
      setIsSignedIn(false);
    } else {
      // 세션 내 재방문: localStorage에서 복원
      const p = readProfile();
      setProfile(p);
      setIsSignedIn(!!p);
    }
  }, []);

  // ✅ TxPreview/TxComplete에서 돌아올 때 선택 복원 (items 로드 이후에만)
  useEffect(() => {
    const s = location.state;
    if (!s?.selectedCode) return;
    if (!items || items.length === 0) return;

    const idx = items.findIndex((it) => it.code === s.selectedCode);
    if (idx >= 0) {
      setSelectedIdx(idx);
      // 성공적으로 반영한 뒤에만 state 비움 (중복 적용 방지)
      navigate('.', { replace: true, state: {} });
    }
  }, [location.state, items, navigate]);

  // ─────────────────────────────
  // 제품 목록 로드 (gameId 변경 시)
  // ─────────────────────────────
  useEffect(() => {
    let abort = false;
    const ac = new AbortController();

    async function run() {
      setLoading(true);
      setLoadError('');
      try {
        const res = await fetch(`${API_ORIGIN}/hive/products/${gameId}`, {
          method: 'GET',
          credentials: 'include',
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (abort) return;

        const g = json?.data?.game;
        const products = Array.isArray(json?.data?.products) ? json.data.products : [];

        setGameTitle(g?.title || `Game #${gameId}`);
        setGameMeta(g ? {
          gameId: g.gameId,
          title: g.title,
          appId: g.appId,
          hiveUrl: g.hiveUrl,
          redirectUrl: g.redirectUrl,
          gindex: g.gindex,
        } : null);

        const mapped = products.map(p => ({
          productId: p.productId,
          code: p.productCode,
          name: p.productName,
          price: Number(p.price || 0),
          image: '/assets/ruby_small.png',
        }));
        setItems(mapped);

        // 게임을 바꾼 경우에만 선택 초기화.
        // 같은 게임으로 돌아온 경우는 위 복원 useEffect가 다시 선택을 세팅함.
        setSelectedIdx(-1);
      } catch (e) {
        if (!abort) {
          setLoadError(e.message || 'Failed to load products');
          setItems([]);
          setSelectedIdx(-1);
          setGameMeta(null);
          setGameTitle(`Game #${gameId}`);
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }

    run();
    return () => {
      abort = true;
      ac.abort();
    };
  }, [gameId]);

  // LoginDefault에서 돌아올 때 signedIn/프로필 반영 (여기서부터 유지)
  useEffect(() => {
    const s = location.state;
    if (s?.signedIn) {
      setIsSignedIn(true);
      if (Number.isFinite(s.gameId) && s.gameId !== gameId) setGameId(s.gameId);
      if (s.gameTitle) setGameTitle(s.gameTitle);

      const prof = {
        gameId: s.gameId ?? gameId,
        gameTitle: s.gameTitle ?? gameTitle,
        pid: s.pid ?? pid,
        groupId: s.groupId ?? userGroupId,
        groupName: s.groupName ?? userGroupName,
        lastLoginAt: Date.now(), // 보조 정보(선택)
      };
      setProfile(prof);
      try { localStorage.setItem('hive_profile', JSON.stringify(prof)); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // ─────────────────────────────
  // 헤더 버튼
  // ─────────────────────────────
  const handleCS = () => console.log('CS: 준비 중');

  const goSignIn = () => {
    navigate('/signin', {
      state: {
        gameId,
        gameMeta, // LoginDefault에서 hiveUrl/redirectUrl/appId/gindex 사용
      },
    });
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: 'Are you sure you want to<br/>sign out?',
      cancelText: 'Cancel',
      continueText: 'Sign Out',
    });
    if (!ok) return;

    try {
      await fetch(`${API_ORIGIN}/hive/logout`, { method: 'GET', credentials: 'include' })
        .catch(() => {});
    } catch (_) {}

    try { await disconnect(); } catch (_) {}

    setIsSignedIn(false);
    setSelectedIdx(-1);
    setProfile(null);
    try { localStorage.removeItem('hive_profile'); } catch {}

    navigate('/', { replace: true, state: {} });
  };

  // ─────────────────────────────
  // Checkout
  // ─────────────────────────────
  const canCheckout = isSignedIn && selectedIdx >= 0;
  const handleCheckout = () => {
    if (!canCheckout) return;

    navigate('/tx-preview', {
      state: {
        item: selected,           // { name, price, image, productId, code }
        tokenName,                // 통화명
        gameTitle,                // 게임 타이틀
        walletAddress: connected?.walletAddress || undefined, // 월렛 주소
        // 게임/유저 프로필
        gameId,
        pid,
        groupId: userGroupId,
        groupName: userGroupName,
      },
    });
  };

  return (
    <div className="il-container">
      <div className="il-frame">
        {/* Header */}
        <div className="il-header">
          <button className="il-back-btn" onClick={handleCS} aria-label="Customer Support">
            <img className="il-back-icon" src="/assets/icon_cs.svg" alt="" />
          </button>

          {/* logo center */}
          <div className="il-header-logo">
            <img src="/assets/logo_service.svg" alt="Logo" className="il-logo-image" />
          </div>

          {!isSignedIn ? (
            <button className="il-signin-btn" onClick={goSignIn}>
              <span className="il-signin-btn-text">Sign In</span>
            </button>
          ) : (
            <button className="il-signin-btn" onClick={handleSignOut}>
              <span className="il-signin-btn-text">Sign Out</span>
            </button>
          )}
        </div>

        {/* Game Banner */}
        <div className="il-game-banner">
          <img className="il-game-icon" src={gameIcon} alt="Game" />
          <div className="il-game-title">
            {loading ? 'Loading…' : gameTitle}
          </div>
        </div>

        {/* Items */}
        <div className="il-grid" style={{ bottom: isSignedIn ? 190 : 16 }}>
          {loadError && (
            <div style={{ color: '#ff6b6b', padding: 16, fontSize: 12 }}>
              Failed to load products: {loadError}
            </div>
          )}

          {!loadError && items.length === 0 && !loading && (
            <div style={{ color: '#d9d9d9', padding: 16, fontSize: 12 }}>
              No products.
            </div>
          )}

          {Array.from({ length: Math.ceil(items.length / 3) }, (_, row) => {
            const slice = items.slice(row * 3, row * 3 + 3);
            return (
              <div className="il-row" key={`row-${row}`}>
                {slice.map((item, i) => {
                  const idx = row * 3 + i;
                  const selectedCls = idx === selectedIdx ? ' il-img-selected' : '';
                  return (
                    <div
                      key={item.productId ?? idx}
                      className="il-card"
                      onClick={() => setSelectedIdx(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? setSelectedIdx(idx) : null)}
                    >
                      <div className={`il-img${selectedCls}`}>
                        <img className="il-photo" src={item.image} alt={item.name} />
                        <img className="il-check" src="/assets/checkCircle_filled.svg" alt="Selected" />
                      </div>
                      <div className="il-info">
                        <div className="il-name">{item.name}</div>
                        <div className="il-price">
                          ${Number(item.price || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Fade (로그인 후에만) */}
        {isSignedIn && <div className="il-gradient" />}

        {/* Bottom sheet (로그인 후에만) */}
        {isSignedIn && (
          <div className="il-sheet">
            <div className="il-selected">
              <div className="il-selected-name">
                {selected ? selected.name : 'No item selected'}
              </div>
              <div className="il-selected-price">
                <span className="il-price-amount">{selected ? selected.price : 0}</span>
                <span className="il-price-currency">{tokenName}</span>
              </div>
            </div>

            <button
              className="il-checkout"
              disabled={!canCheckout}
              onClick={handleCheckout}
            >
              Check Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
