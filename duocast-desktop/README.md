# DuoCast Desktop v1.0.0

Aplicativo desktop Windows baseado na versão web estável do DuoCast.

- Não usa Electron.
- Usa Tauri/Rust e Microsoft WebView2.
- Abre o DuoCast em janela própria, sem interface do Chrome/Edge.
- A interface continua vindo do endereço oficial https://duocastapp.netlify.app, portanto melhorias do site aparecem no desktop sem reinstalar o aplicativo.
- O compartilhamento usa a captura do WebView2/Windows. A barra fixa do Chrome não existe dentro do app desktop.

Para uma distribuição com Publisher verificado no Windows/SmartScreen, será necessário adicionar assinatura de código com certificado próprio.
