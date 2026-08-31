(() => {
  'use strict';

  const BUILD = '5.3.0-smart-ai-hub';

  const style = document.createElement('style');
  style.textContent = `
    .redscribe-ai-integrations{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .redscribe-caption-translate{display:inline-flex;gap:6px;align-items:center}
    .redscribe-caption-translate select{min-width:112px;height:34px;border-radius:9px}
  `;
  document.head.appendChild(style);

  function toastMessage(message, ms = 4200) {
    if (typeof window.toast === 'function') window.toast(message, ms);
    else console.info('[RedScribe]', message);
  }

  function installSettingsShortcut() {
    if (document.getElementById('redscribeIntegrationsBtn')) return;
    const panel = document.querySelector('.ai-settings-panel');
    if (!panel) return;
    const actions = panel.querySelector('.inline-actions') || panel;
    const wrap = document.createElement('div');
    wrap.className = 'redscribe-ai-integrations';
    const button = document.createElement('button');
    button.id = 'redscribeIntegrationsBtn';
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.textContent = 'Configurar integrações IA';
    button.addEventListener('click', () => window.open('http://127.0.0.1:8765/integrations/setup', '_blank', 'noopener'));
    wrap.appendChild(button);
    actions.appendChild(wrap);
  }

  async function translateCueText(text, target) {
    const response = await fetch('/api/integrations/translate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text, source: 'auto', target})
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || 'Falha ao traduzir a legenda.');
    return String(data.translated_text || '').trim();
  }

  function installCaptionTranslator() {
    if (document.getElementById('redscribeTranslateCaptionsBtn')) return;
    const actions = document.querySelector('.studio-caption-actions');
    if (!actions) return;

    const wrap = document.createElement('span');
    wrap.className = 'redscribe-caption-translate';
    wrap.innerHTML = `
      <select id="redscribeTranslateLanguage" aria-label="Idioma da tradução">
        <option value="en">Inglês</option>
        <option value="es">Espanhol</option>
        <option value="fr">Francês</option>
        <option value="it">Italiano</option>
        <option value="de">Alemão</option>
        <option value="pt">Português</option>
      </select>
      <button class="btn btn-secondary btn-small" id="redscribeTranslateCaptionsBtn" type="button">Traduzir legendas</button>
    `;
    actions.appendChild(wrap);

    const button = wrap.querySelector('#redscribeTranslateCaptionsBtn');
    button.addEventListener('click', async () => {
      const cues = [...document.querySelectorAll('#studioCues [data-cue-text]')];
      if (!cues.length) {
        toastMessage('Gere as legendas antes de traduzir.');
        return;
      }
      const target = wrap.querySelector('#redscribeTranslateLanguage').value;
      const old = button.textContent;
      button.disabled = true;
      let translated = 0;
      try {
        for (let i = 0; i < cues.length; i++) {
          const cue = cues[i];
          const original = String(cue.value || '').trim();
          if (!original) continue;
          button.textContent = `Traduzindo ${i + 1}/${cues.length}...`;
          const value = await translateCueText(original, target);
          if (!value) continue;
          cue.value = value;
          cue.dispatchEvent(new Event('input', {bubbles: true}));
          translated++;
        }
        toastMessage(`${translated} legenda(s) traduzida(s). Revise antes de renderizar.`, 5200);
      } catch (error) {
        toastMessage(error.message || 'Falha ao traduzir as legendas.', 6200);
      } finally {
        button.disabled = false;
        button.textContent = old;
      }
    });
  }

  function install() {
    installSettingsShortcut();
    installCaptionTranslator();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, {childList:true, subtree:true});
  console.info('[RedScribe] Integrações IA prontas', BUILD);
})();
