import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * 같은 탭 방식:
 * - 하이브가 /redirect?payload=<gid>&res=<base64> 로 오거나
 * - /redirect?payload=<gid>?res=<base64> 처럼 'res'가 payload 안에 섞여 올 수도 있음
 * 두 경우 모두 파싱해서 localStorage에 저장 후 /signin으로 이동.
 */
export default function RedirectCatcher() {
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const u = new URL(window.location.href);
    const qs = new URLSearchParams(u.search);

    let payload = qs.get('payload');   // 보통은 <gid>
    let res = qs.get('res');           // 정상 케이스면 여기에 존재
    let gameId = null;

    // ── 1) 정상: ?payload=3&res=XXX
    if (res) {
      gameId = payload || null;
    } else {
      // ── 2) 변형: ?payload=3?res=XXX  (res가 payload 값 안에 섞여 들어온 경우)
      if (payload && payload.includes('?res=')) {
        const [gid, resPart] = payload.split('?res=');
        gameId = gid;
        res = resPart;
      } else {
        gameId = payload || null;
      }
    }

    console.log('[RedirectCatcher] arrived:', u.href);
    console.log('[RedirectCatcher] parsed → gameId:', gameId, ', res?', !!res);

    try {
      if (gameId && res) {
        localStorage.setItem(
          'hive_redirect_from',
          JSON.stringify({ at: Date.now(), href: u.href, gameId, res })
        );
      }
    } catch (e) {
      console.warn('[RedirectCatcher] localStorage error:', e);
    }

    navigate('/signin', { replace: true });
  }, [navigate, loc.search]);

  return null;
}
