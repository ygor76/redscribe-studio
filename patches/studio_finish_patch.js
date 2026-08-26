(() => {
  'use strict';

  const BUILD = '5.2.8-media-fix';
  const nativeFetch = window.fetch.bind(window);
  const LOCAL_BASE = window.RedScribeLocalBridge?.base || 'http://127.0.0.1:8765';
  let lastRender = null;
  let finishing = false;

  // Mantém o preview da foto/selo coerente com o MP4 final.
  const style = document.createElement('style');
  style.dataset.redscribeStudioFix = BUILD;
  style.textContent = `
    .studio-design-badge-avatar{overflow:hidden!important;aspect-ratio:1/1;flex:none;border-radius:50%!important}
    .studio-design-badge-avatar img{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important;border-radius:50%!important}
    .studio-design-badge-check{aspect-ratio:1/1;border-radius:50%!important;line-height:1!important;overflow:hidden!important;flex:none;display:inline-grid!important;place-items:center!important}
  `;
  document.head.appendChild(style);

  // O Estúdio roda no Railway, mas as fotos/overlays pertencem ao motor local.
  // <img src="/studio/overlay/..."> não passa pelo interceptador de fetch, então
  // reescrevemos a URL da mídia para localhost explicitamente.
  function localizeStudioMedia(root = document) {
    const images = [];
    if (root?.nodeType === 1 && root.matches?.('img[src^="/studio/overlay/"]')) images.push(root);
    if (root?.querySelectorAll) images.push(...root.querySelectorAll('img[src^="/studio/overlay/"]'));
    for (const img of images) {
      const relative = img.getAttribute('src');
      if (!relative || !relative.startsWith('/studio/overlay/')) continue;
      img.src = `${LOCAL_BASE}${relative}`;
      img.dataset.redscribeLocalMedia = BUILD;
    }
  }

  const mediaObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        localizeStudioMedia(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes || []) localizeStudioMedia(node);
    }
  });

  function startMediaObserver() {
    localizeStudioMedia(document);
    mediaObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  function idFromRenderUrl(url) {
    const match = String(url || '').match(/\/api\/studio\/render\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function showStudioCleanAfterReload() {
    if (sessionStorage.getItem('redscribe:studio-clean') !== '1') return;
    sessionStorage.removeItem('redscribe:studio-clean');
    const open = () => {
      const nav = document.querySelector('[data-view="studio"]');
      if (nav) nav.click();
      setTimeout(() => {
        const picker = document.getElementById('studioPicker');
        const workspace = document.getElementById('studioWorkspace');
        const video = document.getElementById('studioVideo');
        if (workspace) workspace.classList.add('hidden');
        if (picker) picker.classList.remove('hidden');
        if (video) {
          try { video.pause(); } catch {}
          video.removeAttribute('src');
          try { video.load(); } catch {}
        }
      }, 220);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(open, 120), {once:true});
    } else {
      setTimeout(open, 120);
    }
  }

  async function deleteDraft(assetId) {
    if (!assetId) return;
    try {
      await nativeFetch(`${LOCAL_BASE}/api/studio/session/${encodeURIComponent(assetId)}`, {
        method: 'DELETE', mode: 'cors', credentials: 'omit'
      });
    } catch {}
  }

  function reloadIntoCleanStudio() {
    sessionStorage.setItem('redscribe:studio-clean', '1');
    window.location.reload();
  }

  async function keepBoth(button) {
    if (finishing) return;
    finishing = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Finalizando...';
    }
    const modal = document.getElementById('studioReplaceModal');
    if (modal) modal.classList.add('hidden');
    await Promise.allSettled([
      deleteDraft(lastRender?.originalId),
      deleteDraft(lastRender?.renderedId)
    ]);
    reloadIntoCleanStudio();
  }

  async function replaceCurrent(button) {
    if (finishing || !lastRender?.originalId || !lastRender?.renderedId) return;
    finishing = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Substituindo...';
    }
    try {
      const response = await nativeFetch(`${LOCAL_BASE}/api/studio/replace/${encodeURIComponent(lastRender.originalId)}/${encodeURIComponent(lastRender.renderedId)}`, {
        method: 'POST', mode: 'cors', credentials: 'omit'
      });
      if (!response.ok) {
        let message = 'Não foi possível substituir o Short atual.';
        try { message = (await response.json()).error || message; } catch {}
        throw new Error(message);
      }
      await deleteDraft(lastRender.originalId);
      const modal = document.getElementById('studioReplaceModal');
      if (modal) modal.classList.add('hidden');
      reloadIntoCleanStudio();
    } catch (error) {
      finishing = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Substituir Short atual';
      }
      if (typeof window.toast === 'function') window.toast(error.message, 6500);
      else alert(error.message);
    }
  }

  // Guarda os IDs reais gerados pelo render, sem depender do estado privado do studio.js.
  window.fetch = async function(input, init) {
    const response = await nativeFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : input.url;
      const originalId = idFromRenderUrl(url);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (originalId && method === 'POST' && response.ok) {
        const data = await response.clone().json();
        if (data?.asset_id) {
          lastRender = {originalId, renderedId: String(data.asset_id)};
          window.__REDSCRIBE_LAST_STUDIO_RENDER__ = {...lastRender, build: BUILD};
        }
      }
    } catch {}
    return response;
  };

  // Captura antes dos handlers antigos do studio.js para impedir que ele reabra
  // o vídeo renderizado no editor e aplique a edição por cima novamente.
  document.addEventListener('click', (event) => {
    const keep = event.target.closest?.('#studioKeepBothBtn');
    if (keep && lastRender) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      keepBoth(keep);
      return;
    }
    const replace = event.target.closest?.('#studioReplaceCurrentBtn');
    if (replace && lastRender) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      replaceCurrent(replace);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMediaObserver, {once:true});
  } else {
    startMediaObserver();
  }
  showStudioCleanAfterReload();
  console.info('[RedScribe] Studio media/finish patch ativo', BUILD);
})();
