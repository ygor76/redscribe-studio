# RedScribe Studio 5.0.0

O **RedScribe Studio** transforma vídeos em Shorts prontos para revisar, organizar e exportar. A edição 5.0.0 reúne uma landing escura e minimalista, cadastro e login, busca de vídeos no YouTube, montagem de Shorts, progresso de processamento, player integrado, biblioteca, projetos, editor e recursos de transcrição.

## Distribuição para Windows

O caminho de distribuição desta edição é o instalador nativo gerado pelo Inno Setup. O arquivo esperado ao fim da compilação é `installer_output\RedScribe_Studio_Setup_5.0.0_x64.exe`.

| Item | Papel no produto |
|---|---|
| `RedScribe.exe` | Aplicação instalada e exibida no menu Iniciar. |
| `RedScribe_Studio_Setup_5.0.0_x64.exe` | Instalador nativo para computadores Windows 10/11 de 64 bits. |
| `BUILD_INSTALLER.ps1` | Pipeline de compilação que prepara Python, dependências, ferramentas de mídia, PyInstaller e Inno Setup. |
| `GERAR_INSTALADOR_WINDOWS.bat` | Atalho para iniciar o pipeline de compilação em um computador Windows. |

> Para compilar uma distribuição Windows, utilize um computador Windows 10 ou 11 de 64 bits com conexão à internet no primeiro build. Consulte `README_INSTALACAO_WINDOWS_5.0.0.md` para o procedimento completo.

## Recursos principais

O **Shorts Studio** permite pesquisar uma fonte no YouTube, selecionar o vídeo por cartões com miniatura, canal, duração e visualizações, escolher o formato vertical e acompanhar o processamento por etapas. Os Shorts prontos ficam disponíveis para pré-visualização no player, download e organização na Biblioteca.

Além da criação de Shorts, o aplicativo oferece transcrição, exportação em texto e documentos, biblioteca de mídia, projetos, editor e ferramentas de IA configuráveis. A versão atual libera todos esses recursos às novas contas; os campos de plano foram preparados apenas para uma futura ativação comercial e não restringem o uso agora.

## Dados e privacidade

As contas, sessões, preferências, projetos, trabalhos e mídia são mantidos no computador em `%LOCALAPPDATA%\RedScribe\data`. Senhas são armazenadas como hashes, e a sessão pode permanecer ativa por até 180 dias no mesmo perfil do Windows. Veja `LOCAL_ARCHITECTURE.md` para o mapa técnico de arquivos.

## Verificação de desenvolvimento

Execute os testes de regressão a partir da raiz do projeto:

```text
python -m unittest -v tests/test_local_app.py
```

A suíte cobre a landing, cadastro, login, sessão, metadados de acesso e o contrato de resposta da busca do YouTube com uma fonte simulada.

## Documentos relacionados

| Documento | Conteúdo |
|---|---|
| `README_INSTALACAO_WINDOWS_5.0.0.md` | Compilação e verificação do instalador nativo. |
| `README_DESKTOP_EXE.md` | Visão rápida do builder e do artefato distribuível. |
| `CHANGELOG_5.0.0.md` | Alterações desta edição. |
| `VALIDACAO_VISUAL_LOCAL.md` | Registro das validações da interface e busca. |
| `LOCAL_ARCHITECTURE.md` | Referência técnica de armazenamento e camadas. |
