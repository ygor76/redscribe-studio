# DuoCast Desktop v1.1.0

Versão desktop Windows com compartilhamento nativo.

- Tauri/Rust + Microsoft WebView2 para a interface.
- Windows Graphics Capture para capturar telas e janelas.
- WASAPI loopback para áudio do computador.
- Seletor visual do próprio DuoCast; não chama `getDisplayMedia()` no modo desktop nativo.
- O site continua em https://duocastapp.netlify.app e mantém o fluxo de compartilhamento normal do navegador.
- Sem janela CMD em builds release.

A interface web precisa estar na versão v1.9.8 ou superior para usar a ponte de captura nativa.
