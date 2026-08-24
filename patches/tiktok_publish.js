(() => {
  'use strict';

  const $id = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const notify = (msg, ms=4200) => {
    if (typeof window.toast === 'function') window.toast(msg, ms);
    else if (typeof toast === 'function') toast(msg, ms);
    else console.log('[RedScribe TikTok]', msg);
  };

  let creatorInfo = null;
  let statusCache = null;
  let panel = null;

  function assetIdFromPreview() {
    const src = $id('publishPreview')?.src || '';
    try {
      const u = new URL(src, location.origin);
      const m = u.pathname.match(/\/shorts\/library\/media\/([^/?#]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  }

  async function json(url, opts={}) {
    const r = await fetch(url, opts);
    let d = {};
    try { d = await r.json(); } catch {}
    if (!r.ok) throw new Error(d.error || `Falha HTTP ${r.status}`);
    return d;
  }

  function ensurePanel() {
    if (panel && panel.isConnected) return panel;
    const grid = document.querySelector('.publish-platform-grid');
    if (!grid) return null;
    panel = document.createElement('div');
    panel.id = 'tiktokDirectPanel';
    panel.className = 'publish-result hidden';
    panel.style.cssText = 'margin-top:14px;display:grid;gap:12px;';
    panel.innerHTML = `
      <div>
        <strong>Publicar no TikTok</strong>
        <span id="tiktokConnectionState">Verificando conexão...</span>
      </div>
      <div id="tiktokCreatorOptions" class="hidden" style="display:grid;gap:10px;">
        <label class="field-block">
          <span>Privacidade</span>
          <select id="tiktokPrivacy"></select>
        </label>
        <div class="inline-actions" style="flex-wrap:wrap">
          <label class="studio-overlay-check"><input id="tiktokDisableComment" type="checkbox"> Desativar comentários</label>
          <label class="studio-overlay-check"><input id="tiktokDisableDuet" type="checkbox"> Desativar Dueto</label>
          <label class="studio-overlay-check"><input id="tiktokDisableStitch" type="checkbox"> Desativar Stitch</label>
          <label class="studio-overlay-check"><input id="tiktokAigc" type="checkbox"> Conteúdo gerado por IA</label>
        </div>
      </div>
      <div class="inline-actions" style="flex-wrap:wrap">
        <button class="btn btn-secondary btn-small" id="tiktokConnectBtn" type="button">Conectar TikTok</button>
        <button class="btn btn-primary btn-small" id="tiktokPublishNowBtn" type="button" disabled>Publicar agora</button>
        <button class="btn btn-secondary btn-small" id="tiktokDraftBtn" type="button" disabled>Enviar como rascunho</button>
        <button class="text-button hidden" id="tiktokDisconnectBtn" type="button">Desconectar</button>
      </div>
      <small id="tiktokPublishState">O vídeo será enviado diretamente do seu computador para o TikTok.</small>
    `;
    grid.insertAdjacentElement('afterend', panel);
    $id('tiktokConnectBtn')?.addEventListener('click', connectTikTok);
    $id('tiktokDisconnectBtn')?.addEventListener('click', disconnectTikTok);
    $id('tiktokPublishNowBtn')?.addEventListener('click', () => publishTikTok(false));
    $id('tiktokDraftBtn')?.addEventListener('click', () => publishTikTok(true));
    return panel;
  }

  function setState(text) {
    const el = $id('tiktokPublishState');
    if (el) el.textContent = text;
  }

  function renderConnection(status) {
    statusCache = status || {};
    const configured = !!status?.configured;
    const connected = !!status?.connected;
    const state = $id('tiktokConnectionState');
    const connect = $id('tiktokConnectBtn');
    const disconnect = $id('tiktokDisconnectBtn');
    const publish = $id('tiktokPublishNowBtn');
    const draft = $id('tiktokDraftBtn');
    const options = $id('tiktokCreatorOptions');

    if (state) {
      state.textContent = !configured
        ? 'Integração aguardando as credenciais do TikTok Developers.'
        : connected ? 'Conta conectada.' : 'Conta ainda não conectada.';
    }
    if (connect) {
      connect.classList.toggle('hidden', connected);
      connect.disabled = !configured;
      connect.textContent = configured ? 'Conectar TikTok' : 'TikTok não configurado';
    }
    disconnect?.classList.toggle('hidden', !connected);
    if (publish) publish.disabled = !connected;
    if (draft) draft.disabled = !connected;
    if (!connected) options?.classList.add('hidden');
  }

  async function loadStatus(loadCreator=false) {
    ensurePanel();
    try {
      const status = await json('/api/tiktok/status', {cache:'no-store'});
      renderConnection(status);
      if (status.connected && loadCreator) await loadCreatorInfo();
      return status;
    } catch (err) {
      renderConnection({configured:false, connected:false});
      setState(err.message);
      return null;
    }
  }

  async function loadCreatorInfo() {
    try {
      setState('Carregando as opções da sua conta TikTok...');
      const data = await json('/api/tiktok/creator-info', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:'{}'
      });
      creatorInfo = data?.data || {};
      const privacy = $id('tiktokPrivacy');
      const options = Array.isArray(creatorInfo.privacy_level_options) ? creatorInfo.privacy_level_options : [];
      if (privacy) {
        privacy.innerHTML = options.length
          ? options.map(v => `<option value="${String(v).replace(/"/g,'&quot;')}">${privacyLabel(v)}</option>`).join('')
          : '<option value="SELF_ONLY">Somente eu</option>';
      }
      if ($id('tiktokDisableComment')) {
        $id('tiktokDisableComment').checked = !!creatorInfo.comment_disabled;
        $id('tiktokDisableComment').disabled = !!creatorInfo.comment_disabled;
      }
      if ($id('tiktokDisableDuet')) {
        $id('tiktokDisableDuet').checked = !!creatorInfo.duet_disabled;
        $id('tiktokDisableDuet').disabled = !!creatorInfo.duet_disabled;
      }
      if ($id('tiktokDisableStitch')) {
        $id('tiktokDisableStitch').checked = !!creatorInfo.stitch_disabled;
        $id('tiktokDisableStitch').disabled = !!creatorInfo.stitch_disabled;
      }
      $id('tiktokCreatorOptions')?.classList.remove('hidden');
      setState('Pronto. Revise a privacidade e publique quando quiser.');
    } catch (err) {
      setState(err.message);
      notify(err.message, 6000);
    }
  }

  function privacyLabel(value) {
    const map = {
      PUBLIC_TO_EVERYONE: 'Público',
      MUTUAL_FOLLOW_FRIENDS: 'Amigos',
      FOLLOWER_OF_CREATOR: 'Seguidores',
      SELF_ONLY: 'Somente eu'
    };
    return map[value] || value;
  }

  function connectTikTok() {
    const popup = window.open('/api/tiktok/connect', 'redscribe-tiktok-oauth', 'width=600,height=760');
    if (!popup) {
      notify('Permita pop-ups para conectar sua conta do TikTok.', 5200);
      return;
    }
    setState('Conecte sua conta na janela do TikTok.');
  }

  async function disconnectTikTok() {
    try {
      await json('/api/tiktok/disconnect', {method:'POST'});
      creatorInfo = null;
      renderConnection({configured:true, connected:false});
      setState('Conta desconectada.');
    } catch (err) {
      notify(err.message, 5000);
    }
  }

  async function pollStatus(publishId, draft=false) {
    for (let i=0; i<80; i++) {
      const data = await json('/api/tiktok/publish/status', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({publish_id:publishId})
      });
      const info = data?.data || {};
      const status = info.status || 'PROCESSING_UPLOAD';
      const labels = {
        PROCESSING_UPLOAD:'TikTok está processando o upload...',
        PROCESSING_DOWNLOAD:'TikTok está processando o vídeo...',
        SEND_TO_USER_INBOX:'Rascunho enviado para sua caixa de entrada do TikTok.',
        PUBLISH_COMPLETE:'Publicado no TikTok com sucesso.',
        FAILED:`Falha no TikTok${info.fail_reason ? ': '+info.fail_reason : '.'}`
      };
      setState(labels[status] || `TikTok: ${status}`);
      if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') return {ok:true,status,data};
      if (status === 'FAILED') throw new Error(labels[status]);
      await sleep(3000);
    }
    throw new Error(draft ? 'O TikTok ainda está processando o rascunho. Verifique novamente em instantes.' : 'O TikTok ainda está processando a publicação. Verifique novamente em instantes.');
  }

  async function publishTikTok(draft=false) {
    const assetId = assetIdFromPreview();
    if (!assetId) {
      notify('Não consegui identificar o Short aberto.', 5000);
      return;
    }
    const button = draft ? $id('tiktokDraftBtn') : $id('tiktokPublishNowBtn');
    const old = button?.textContent || '';
    if (button) { button.disabled = true; button.textContent = draft ? 'Enviando...' : 'Publicando...'; }
    try {
      if (!statusCache?.connected) {
        await loadStatus(true);
        if (!statusCache?.connected) throw new Error('Conecte sua conta do TikTok primeiro.');
      }
      if (!creatorInfo && !draft) await loadCreatorInfo();

      setState('Lendo o Short no seu computador...');
      const local = await json(`/api/tiktok/local/info/${encodeURIComponent(assetId)}`, {cache:'no-store'});
      const title = ($id('publishTitle')?.value || '').trim();
      const captionRaw = ($id('publishCaption')?.value || '').trim();
      const caption = captionRaw || title || 'Short';
      const common = {video_size:local.video_size};

      let init;
      if (draft) {
        setState('Preparando rascunho no TikTok...');
        init = await json('/api/tiktok/draft/init', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(common)
        });
      } else {
        setState('Preparando publicação no TikTok...');
        init = await json('/api/tiktok/publish/init', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            ...common,
            caption,
            privacy_level:$id('tiktokPrivacy')?.value || 'SELF_ONLY',
            disable_comment:!!$id('tiktokDisableComment')?.checked,
            disable_duet:!!$id('tiktokDisableDuet')?.checked,
            disable_stitch:!!$id('tiktokDisableStitch')?.checked,
            is_aigc:!!$id('tiktokAigc')?.checked
          })
        });
      }

      if (!init.upload_url || !init.publish_id) throw new Error('O TikTok não retornou uma URL válida para o upload.');
      setState('Enviando o vídeo direto do seu computador para o TikTok...');
      await json(`/api/tiktok/local/upload/${encodeURIComponent(assetId)}`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({upload_url:init.upload_url, source_info:init.source_info})
      });

      setState('Upload concluído. Aguardando o TikTok finalizar...');
      const result = await pollStatus(init.publish_id, draft);
      notify(result.status === 'PUBLISH_COMPLETE' ? 'Short publicado no TikTok!' : 'Rascunho enviado para o TikTok!', 6000);

      const box = $id('publishResult');
      if (box) {
        box.classList.remove('hidden');
        if ($id('publishResultTitle')) $id('publishResultTitle').textContent = result.status === 'PUBLISH_COMPLETE' ? 'Publicado no TikTok' : 'Rascunho enviado ao TikTok';
        if ($id('publishResultPath')) $id('publishResultPath').textContent = result.status === 'PUBLISH_COMPLETE' ? 'A publicação foi concluída.' : 'Abra o TikTok para finalizar o rascunho.';
        $id('publishOpenFolder')?.classList.add('hidden');
        $id('publishOpenPlatform')?.classList.add('hidden');
      }
    } catch (err) {
      setState(err.message);
      notify(err.message, 7000);
    } finally {
      if (button) {
        button.disabled = !statusCache?.connected;
        button.textContent = old;
      }
    }
  }

  function openTikTokPanel() {
    ensurePanel();
    panel?.classList.remove('hidden');
    loadStatus(true);
  }

  function bind() {
    const btn = document.querySelector('[data-publish-platform="tiktok"]');
    if (!btn || btn.dataset.tiktokDirectBound) return;
    btn.dataset.tiktokDirectBound = '1';
    btn.innerHTML = '<b>TikTok</b><span>Conectar e publicar diretamente</span>';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openTikTokPanel();
    }, true);
    ensurePanel();
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'redscribe-tiktok-connected') {
      notify('TikTok conectado!', 3500);
      loadStatus(true);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
