# DuoCast Desktop v1.0.1

Aplicativo desktop Windows baseado na versão web estável do DuoCast.

- Não usa Electron.
- Usa Tauri/Rust e Microsoft WebView2.
- Abre o DuoCast em janela própria, sem interface normal do Chrome/Edge.
- A interface continua vindo do endereço oficial https://duocastapp.netlify.app, portanto melhorias do site aparecem no desktop sem reinstalar o aplicativo.
- v1.0.1: o executável usa subsistema Windows e não abre janela de console/CMD junto do app.

## Compartilhamento de tela

Nesta versão, o compartilhamento ainda usa `getDisplayMedia()` do WebView2. Por isso o seletor de tela/janela e o indicador de compartilhamento exibidos pelo WebView2 continuam sendo interfaces do runtime e não pertencem ao HTML do DuoCast.

Para ter um seletor 100% com visual DuoCast e remover a dependência dessa interface do WebView2, será necessária uma camada de captura nativa do Windows (Windows Graphics Capture/WASAPI) integrada ao fluxo WebRTC do aplicativo. Isso é uma evolução separada do simples empacotamento do site.

Para uma distribuição com Publisher verificado no Windows/SmartScreen, será necessário adicionar assinatura de código com certificado próprio.
