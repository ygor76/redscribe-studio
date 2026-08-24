(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const PLATFORMS = {
    tiktok: {
      label: 'TikTok', status: 'Disponível', desc: 'Conectar e publicar direto',
      icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tt-c" d="M27 7v20a7.5 7.5 0 1 1-6.2-7.4v4.8a3 3 0 1 0 1.7 2.7V7H27Z"/><path class="tt-p" d="M31 8c.8 3.8 3.1 6.1 7 7v4.8a11.5 11.5 0 0 1-7-2.1v9.5a7.6 7.6 0 1 1-6.4-7.5v4.8a3 3 0 1 0 1.8 2.8V8H31Z"/><path class="tt-m" d="M29.4 6.5c.7 3.7 3 6 6.8 6.8v4.3a11.4 11.4 0 0 1-6.8-2v10.9a7.8 7.8 0 1 1-6.6-7.7v4.5a3.4 3.4 0 1 0 2.1 3.2v-20h4.5Z"/></svg>`
    },
    instagram: {
      label: 'Instagram', status: 'Em breve', desc: 'Integração em preparação',
      icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="rsig" x1="7" y1="42" x2="42" y2="7"><stop stop-color="#ffcc70"/><stop offset=".42" stop-color="#f2357b"/><stop offset="1" stop-color="#7b42f6"/></linearGradient></defs><rect x="8.5" y="8.5" width="31" height="31" rx="9" fill="none" stroke="url(#rsig)" stroke-width="4"/><circle cx="24" cy="24" r="7" fill="none" stroke="url(#rsig)" stroke-width="4"/><circle cx="34" cy="14" r="2.2" fill="url(#rsig)"/></svg>`
    },
    youtube: {
      label: 'YouTube', status: 'Em breve', desc: 'Integração em preparação',
      icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M42 15a5.4 5.4 0 0 0-3.8-3.8c-3.5-.9-14.2-.9-14.2-.9s-10.7 0-14.2.9A5.4 5.4 0 0 0 6 15C5.1 18.5 5.1 24 5.1 24s0 5.5.9 9a5.4 5.4 0 0 0 3.8 3.8c3.5.9 14.2.9 14.2.9s10.7 0 14.2-.9A5.4 5.4 0 0 0 42 33c.9-3.5.9-9 .9-9s0-5.5-.9-9Z" fill="#ff0033"/><path d="m20.2 30.1 10-6.1-10-6.1v12.2Z" fill="#fff"/></svg>`
    }
  };

  let modalObserver = null;
  let tiktokObserver = null;
  let modalWasOpen = false;
  let tiktokPanelWasVisible = false;

  function injectStyles() {
    if ($('rsPublishHubStyles')) return;
    const s = document.createElement('style');
    s.id = 'rsPublishHubStyles';
    s.textContent = `
      #publishModal .publish-modal{width:min(760px,calc(100vw - 28px));padding:20px}
      #publishModal .publish-modal-head h3{font-size:20px;line-height:1.15;margin:5px 0 6px}
      #publishModal .publish-modal-head p{font-size:10px;max-width:560px}
      .rs-publish-back{border:0;background:transparent;color:var(--muted);padding:0 0 8px;font:inherit;font-size:9px;font-weight:800;cursor:pointer}
      .rs-publish-back:hover{color:var(--text)}
      #publishModal .publish-platform-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
      #publishModal .publish-platform{position:relative;min-height:152px;border-radius:18px;padding:16px 12px;background:linear-gradient(180deg,var(--panel),var(--soft));border:1px solid var(--line-strong);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;overflow:hidden}
      #publishModal .publish-platform:hover{transform:translateY(-2px);border-color:var(--text);box-shadow:0 12px 32px rgba(0,0,0,.12)}
      .rs-platform-icon{width:48px;height:48px;display:grid;place-items:center}.rs-platform-icon svg{width:48px;height:48px;display:block}
      .rs-platform-icon .tt-c{fill:#25f4ee;transform:translate(-1px,1px)}.rs-platform-icon .tt-p{fill:#fe2c55;transform:translate(1px,-1px)}.rs-platform-icon .tt-m{fill:var(--text)}
      .rs-platform-name{font-size:13px!important;font-weight:900}.rs-platform-desc{font-size:8px!important;color:var(--muted)!important;line-height:1.35!important}
      .rs-platform-badge{position:absolute;right:10px;top:10px;border:1px solid var(--line);border-radius:99px;background:var(--panel);padding:4px 7px;font-size:7px!important;font-weight:900;color:var(--muted)!important;letter-spacing:.04em}
      .publish-platform.tiktok .rs-platform-badge{color:#16a56d!important;border-color:rgba(22,165,109,.28);background:rgba(22,165,109,.08)}
      #publishModal.rs-publish-picker .publish-source,#publishModal.rs-publish-picker #rsPublishTitleField,#publishModal.rs-publish-picker #rsPublishCaptionField,#publishModal.rs-publish-picker #publishResult,#publishModal.rs-publish-picker #tiktokDirectPanel{display:none!important}
      #publishModal.rs-publish-detail .publish-platform-grid{display:none!important}
      #publishModal.rs-publish-detail #publishResult{display:none!important}
      #publishModal.rs-publish-soon .publish-source,#publishModal.rs-publish-soon #rsPublishTitleField,#publishModal.rs-publish-soon #rsPublishCaptionField,#publishModal.rs-publish-soon #tiktokDirectPanel{display:none!important}
      #tiktokDirectPanel{border:1px solid var(--line)!important;background:var(--soft)!important;border-radius:18px!important;padding:14px!important;box-shadow:none!important;gap:12px!important;align-items:stretch!important}
      #tiktokDirectPanel>.rs-tiktok-hero + div{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;border:1px solid var(--line)!important;border-radius:12px!important;padding:9px 10px!important;background:var(--panel)!important}
      #tiktokDirectPanel>.rs-tiktok-hero + div strong{font-size:10px!important}#tiktokDirectPanel>.rs-tiktok-hero + div span{font-size:8px!important;color:var(--muted)!important}
      .rs-tiktok-hero{display:flex;align-items:center;gap:11px;padding:2px}.rs-tiktok-mark{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;border:1px solid var(--line);background:var(--panel);flex:0 0 auto}.rs-tiktok-mark svg{width:28px;height:28px}.rs-tiktok-mark .tt-c{fill:#25f4ee;transform:translate(-1px,1px)}.rs-tiktok-mark .tt-p{fill:#fe2c55;transform:translate(1px,-1px)}.rs-tiktok-mark .tt-m{fill:var(--text)}
      .rs-tiktok-copy{display:grid;gap:2px}.rs-tiktok-copy strong{font-size:13px}.rs-tiktok-copy span{font-size:8.5px;color:var(--muted);line-height:1.4}
      #tiktokCreatorOptions{border:1px solid var(--line)!important;border-radius:13px!important;padding:11px!important;background:var(--panel)!important}
      #tiktokDirectPanel>.inline-actions{border-top:1px solid var(--line);padding-top:11px;gap:8px!important}#tiktokDirectPanel>.inline-actions .btn{min-height:36px}
      #tiktokPublishState{display:block!important;border:1px solid var(--line);border-radius:10px;padding:8px 9px;background:var(--panel);font-size:8.5px!important;color:var(--muted)!important;line-height:1.4}
      #tiktokDirectPanel.rs-connected #tiktokPublishState{border-color:rgba(22,165,109,.22);background:rgba(22,165,109,.05)}
      .rs-soon-panel{margin-top:15px;border:1px solid var(--line);border-radius:18px;background:var(--soft);padding:26px 18px;text-align:center}.rs-soon-panel.hidden{display:none!important}.rs-soon-panel .rs-platform-icon{width:58px;height:58px;margin:0 auto 9px}.rs-soon-panel .rs-platform-icon svg{width:58px;height:58px}.rs-soon-panel h4{font-size:16px;margin:0 0 7px}.rs-soon-panel p{max-width:430px;margin:0 auto;font-size:9px;line-height:1.55;color:var(--muted)}.rs-soon-tag{display:inline-flex;margin-top:12px;border:1px solid var(--line);border-radius:99px;padding:6px 9px;background:var(--panel);font-size:8px;font-weight:900;color:var(--muted)}
      @media(max-width:720px){#publishModal .publish-modal{padding:15px}#publishModal .publish-platform-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}#publishModal .publish-platform{min-height:126px;padding:12px 6px}.rs-platform-icon,.rs-platform-icon svg{width:38px;height:38px}.rs-platform-name{font-size:11px!important}.rs-platform-desc{display:none}.rs-platform-badge{position:static;font-size:6.5px!important;padding:3px 6px}#tiktokDirectPanel>.inline-actions{flex-wrap:wrap}}
    `;
    document.head.appendChild(s);
  }

  function titleField() {
    const el = $('publishTitle')?.closest('.field-block');
    if (el && !el.id) el.id = 'rsPublishTitleField';
    return el;
  }

  function captionField() {
    const el = $('publishCaption')?.closest('.field-block');
    if (el && !el.id) el.id = 'rsPublishCaptionField';
    return el;
  }

  function setHeading(mode, platform) {
    const box = document.querySelector('#publishModal .publish-modal-head > div');
    if (!box) return;
    const small = box.querySelector('small');
    const h3 = box.querySelector('h3');
    const p = box.querySelector('p');
    if (mode === 'picker') {
      if (small) small.textContent = 'CENTRAL DE PUBLICAÇÃO';
      if (h3) h3.textContent = 'Onde você quer publicar?';
      if (p) p.textContent = 'Escolha uma plataforma para continuar. O TikTok já está integrado ao RedScribe.';
    } else if (platform === 'tiktok') {
      if (small) small.textContent = 'PUBLICAÇÃO DIRETA';
      if (h3) h3.textContent = 'Publicar no TikTok';
      if (p) p.textContent = 'Conecte sua conta uma vez e publique o Short diretamente pelo RedScribe.';
    } else {
      const m = PLATFORMS[platform];
      if (small) small.textContent = 'NOVA INTEGRAÇÃO';
      if (h3) h3.textContent = `${m.label} · em breve`;
      if (p) p.textContent = 'Essa integração ainda não está disponível nesta versão.';
    }
  }

  function ensureBack() {
    const box = document.querySelector('#publishModal .publish-modal-head > div');
    if (!box || $('rsPublishBack')) return;
    const b = document.createElement('button');
    b.id = 'rsPublishBack';
    b.type = 'button';
    b.className = 'rs-publish-back hidden';
    b.textContent = '← Voltar para plataformas';
    b.addEventListener('click', resetPicker);
    box.insertAdjacentElement('afterbegin', b);
  }

  function ensureSoonPanel() {
    let el = $('rsPublishSoonPanel');
    if (el) return el;
    const grid = document.querySelector('.publish-platform-grid');
    if (!grid) return null;
    el = document.createElement('section');
    el.id = 'rsPublishSoonPanel';
    el.className = 'rs-soon-panel hidden';
    const tiktok = $('tiktokDirectPanel');
    (tiktok || grid).insertAdjacentElement('afterend', el);
    return el;
  }

  function decorateCards() {
    document.querySelectorAll('[data-publish-platform]').forEach(btn => {
      const key = String(btn.dataset.publishPlatform || '').toLowerCase();
      const m = PLATFORMS[key];
      if (!m) return;
      btn.innerHTML = `<span class="rs-platform-badge">${m.status}</span><span class="rs-platform-icon">${m.icon}</span><b class="rs-platform-name">${m.label}</b><span class="rs-platform-desc">${m.desc}</span>`;
      if ((key === 'instagram' || key === 'youtube') && !btn.dataset.rsSoonBound) {
        btn.dataset.rsSoonBound = '1';
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopImmediatePropagation();
          showSoon(key);
        }, true);
      }
    });
  }

  function decorateTikTokPanel() {
    const p = $('tiktokDirectPanel');
    if (!p || p.dataset.rsDecorated) return;
    p.dataset.rsDecorated = '1';
    const hero = document.createElement('div');
    hero.className = 'rs-tiktok-hero';
    hero.innerHTML = `<span class="rs-tiktok-mark">${PLATFORMS.tiktok.icon}</span><span class="rs-tiktok-copy"><strong>TikTok</strong><span>Login oficial e publicação direta usando a integração que já está configurada.</span></span>`;
    p.insertAdjacentElement('afterbegin', hero);
    const state = $('tiktokConnectionState');
    if (state) {
      tiktokObserver = new MutationObserver(() => syncTikTokState());
      tiktokObserver.observe(state, {childList:true, subtree:true, characterData:true});
      syncTikTokState();
    }
  }

  function syncTikTokState() {
    const p = $('tiktokDirectPanel');
    const state = ($('tiktokConnectionState')?.textContent || '').toLowerCase();
    p?.classList.toggle('rs-connected', state.includes('conectada'));
  }

  function resetPicker() {
    const modal = $('publishModal');
    if (!modal) return;
    modal.classList.add('rs-publish-picker');
    modal.classList.remove('rs-publish-detail', 'rs-publish-soon');
    $('rsPublishBack')?.classList.add('hidden');
    $('rsPublishSoonPanel')?.classList.add('hidden');
    $('tiktokDirectPanel')?.classList.add('hidden');
    $('publishResult')?.classList.add('hidden');
    setHeading('picker');
    decorateCards();
  }

  function showTikTokDetail() {
    const modal = $('publishModal');
    const panel = $('tiktokDirectPanel');
    if (!modal || !panel || panel.classList.contains('hidden')) return;
    modal.classList.remove('rs-publish-picker', 'rs-publish-soon');
    modal.classList.add('rs-publish-detail');
    $('rsPublishBack')?.classList.remove('hidden');
    $('rsPublishSoonPanel')?.classList.add('hidden');
    setHeading('detail', 'tiktok');
    decorateTikTokPanel();
    setTimeout(() => {
      const connect = $('tiktokConnectBtn');
      if (connect && !connect.classList.contains('hidden') && !connect.disabled) connect.focus({preventScroll:true});
    }, 180);
  }

  function showSoon(key) {
    const modal = $('publishModal');
    const m = PLATFORMS[key];
    const panel = ensureSoonPanel();
    if (!modal || !m || !panel) return;
    $('tiktokDirectPanel')?.classList.add('hidden');
    modal.classList.remove('rs-publish-picker');
    modal.classList.add('rs-publish-detail', 'rs-publish-soon');
    $('rsPublishBack')?.classList.remove('hidden');
    setHeading('detail', key);
    panel.innerHTML = `<span class="rs-platform-icon">${m.icon}</span><h4>${m.label} está chegando</h4><p>A publicação direta no ${m.label} ainda não está disponível. Quando a integração for liberada, ela vai aparecer aqui dentro do mesmo fluxo, sem precisar mudar seu processo.</p><span class="rs-soon-tag">Em breve no RedScribe</span>`;
    panel.classList.remove('hidden');
  }

  function watchTikTokPanel() {
    const p = $('tiktokDirectPanel');
    if (!p || p.dataset.rsWatch) return;
    p.dataset.rsWatch = '1';
    decorateTikTokPanel();
    tiktokPanelWasVisible = !p.classList.contains('hidden');
    new MutationObserver(() => {
      const visible = !p.classList.contains('hidden');
      const modalOpen = !$('publishModal')?.classList.contains('hidden');
      if (modalOpen && visible && !tiktokPanelWasVisible) showTikTokDetail();
      tiktokPanelWasVisible = visible;
    }).observe(p, {attributes:true, attributeFilter:['class']});
  }

  function watchModal() {
    const modal = $('publishModal');
    if (!modal || modalObserver) return;
    modalWasOpen = !modal.classList.contains('hidden');
    modalObserver = new MutationObserver(() => {
      const isOpen = !modal.classList.contains('hidden');
      // Só volta ao seletor quando o modal realmente abre. Mudanças internas de
      // classe (ex.: entrar no TikTok) não podem resetar a integração.
      if (isOpen && !modalWasOpen) setTimeout(resetPicker, 0);
      modalWasOpen = isOpen;
    });
    modalObserver.observe(modal, {attributes:true, attributeFilter:['class']});
  }

  function bind() {
    injectStyles();
    titleField();
    captionField();
    ensureBack();
    decorateCards();
    watchTikTokPanel();
    ensureSoonPanel();
    watchModal();
    const modal = $('publishModal');
    if (modal && !modal.classList.contains('hidden')) resetPicker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
