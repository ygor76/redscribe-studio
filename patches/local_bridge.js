(() => {
  'use strict';

  const LOCAL_BASE = 'http://127.0.0.1:8765';
  const REQUIRED_ENGINE_VERSION = '5.1.3-hybrid';
  const nativeFetch = window.fetch.bind(window);

  const LOCAL_API_PREFIXES = [
    '/api/transcribe',
    '/api/upload',
    '/api/jobs/',
    '/api/history',
    '/api/search',
    '/api/downloads',
    '/api/storage/',
    '/api/projects',
    '/api/trash',
    '/api/backup/',
    '/api/shorts/',
    '/api/studio/',
    '/api/publish/'
  ];

  const LOCAL_MEDIA_PREFIXES = [
    '/audio/',
    '/video/',
    '/download/',
    '/shorts/',
    '/studio/'
  ];

  const CLOUD_ONLY_PREFIXES = [
    '/api/auth/',
    '/api/me',
    '/api/plan/',
    '/api/recommendations',
    '/api/youtube/search',
    '/api/settings',
    '/api/ai/',
    '/api/tiktok/'
  ];

  function isLocalRoute(pathname) {
    if (pathname.startsWith('/api/tiktok/local/')) return true;
    if (pathname.startsWith('/api/settings/storage')) return true;
    if (CLOUD_ONLY_PREFIXES.some(prefix => pathname.startsWith(prefix))) return false;
    return LOCAL_API_PREFIXES.some(prefix => pathname.startsWith(prefix)) ||
           LOCAL_MEDIA_PREFIXES.some(prefix => pathname.startsWith(prefix));
  }

  function isLocalMediaPath(value) {
    return typeof value === 'string' && LOCAL_MEDIA_PREFIXES.some(prefix => value.startsWith(prefix));
  }

  function rewriteLocalUrls(value) {
    if (Array.isArray(value)) return value.map(rewriteLocalUrls);
    if (!value || typeof value !== 'object') return isLocalMediaPath(value) ? `${LOCAL_BASE}${value}` : value;
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = rewriteLocalUrls(item);
    return output;
  }

  async function rewriteJsonResponse(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) return response;
    try {
      const data = await response.clone().json();
      const rewritten = rewriteLocalUrls(data);
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(rewritten), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch {
      return response;
    }
  }

  function offlineResponse() {
    return new Response(JSON.stringify({
      error: 'O motor local do RedScribe não está aberto ou está desatualizado. Abra o RedScribe Local Engine 5.1.3 e tente novamente.'
    }), {
      status: 503,
      headers: {'Content-Type': 'application/json; charset=utf-8'}
    });
  }

  window.fetch = async function(input, init) {
    let sourceUrl;
    try {
      sourceUrl = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
    } catch {
      return nativeFetch(input, init);
    }

    if (sourceUrl.origin !== window.location.origin || !isLocalRoute(sourceUrl.pathname)) {
      return nativeFetch(input, init);
    }

    const targetUrl = `${LOCAL_BASE}${sourceUrl.pathname}${sourceUrl.search}`;
    try {
      let response;
      if (input instanceof Request) {
        const localRequest = new Request(targetUrl, input);
        response = await nativeFetch(localRequest, init);
      } else {
        response = await nativeFetch(targetUrl, {
          ...init,
          mode: 'cors',
          credentials: 'omit'
        });
      }
      return await rewriteJsonResponse(response);
    } catch (error) {
      console.warn('[RedScribe Local Engine] indisponível:', error);
      return offlineResponse();
    }
  };

  async function health() {
    try {
      const response = await nativeFetch(`${LOCAL_BASE}/bridge/health`, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store'
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  window.RedScribeLocalBridge = {
    base: LOCAL_BASE,
    requiredVersion: REQUIRED_ENGINE_VERSION,
    health,
    isLocalRoute
  };

  health().then(info => {
    if (info?.ok && info.version === REQUIRED_ENGINE_VERSION) {
      console.info('[RedScribe] Local Engine conectado', info);
    } else if (info?.ok) {
      console.warn(`[RedScribe] Local Engine desatualizado: ${info.version}. Necessário: ${REQUIRED_ENGINE_VERSION}`);
    } else {
      console.info('[RedScribe] Local Engine ainda não está aberto');
    }
  });
})();
