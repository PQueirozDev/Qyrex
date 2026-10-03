; Personalização do instalador NSIS do Qyrex (incluído pelo electron-builder).
; As imagens (installerSidebar.bmp, uninstallerSidebar.bmp e installerHeader.bmp)
; saem de `npm run icons` (scripts/icons/installer.cjs).
; Os textos ficam em LangString: o NSIS escolhe pt-BR ou inglês pelo idioma do
; Windows (installerLanguages no electron-builder.json).

; Confirma antes de cancelar no meio.
!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING

!ifndef BUILD_UNINSTALLER
  ; Página de conclusão: abrir o app e link para o site.
  !define MUI_FINISHPAGE_TITLE "$(qyFinishTitle)"
  !define MUI_FINISHPAGE_TEXT "$(qyFinishText)"
  !define MUI_FINISHPAGE_RUN_TEXT "$(qyFinishRun)"
  !define MUI_FINISHPAGE_LINK "$(qyFinishLink)"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://qyrexapp.vercel.app"
  !define MUI_FINISHPAGE_LINK_COLOR "C65F15"
!else
  !define MUI_FINISHPAGE_TITLE "$(qyUnFinishTitle)"
  !define MUI_FINISHPAGE_TEXT "$(qyUnFinishText)"
!endif

; Boas-vindas com a arte lateral (o electron-builder não mostra essa página por
; padrão). Pulada nas atualizações automáticas.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(qyWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(qyWelcomeText)"
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(qyUnWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(qyUnWelcomeText)"
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; Inserido depois dos idiomas (MUI_LANGUAGE), por isso as LangStrings ficam aqui.
!macro customHeader
  BrandingText "${PRODUCT_NAME} ${VERSION}  ·  qyrexapp.vercel.app"

  LangString qyWelcomeTitle ${LANG_PORTUGUESEBR} "Boas-vindas ao ${PRODUCT_NAME}"
  LangString qyWelcomeTitle ${LANG_ENGLISH} "Welcome to ${PRODUCT_NAME}"
  LangString qyWelcomeText ${LANG_PORTUGUESEBR} "Sua central de trabalho: projetos, tarefas, arquivos, IA, clientes e integrações num lugar só.$\r$\n$\r$\nEste assistente vai instalar o ${PRODUCT_NAME} ${VERSION} no seu computador. Leva menos de um minuto.$\r$\n$\r$\nClique em Próximo para continuar."
  LangString qyWelcomeText ${LANG_ENGLISH} "Your workspace hub: projects, tasks, files, AI, clients and integrations in one place.$\r$\n$\r$\nThis wizard will install ${PRODUCT_NAME} ${VERSION} on your computer. It takes less than a minute.$\r$\n$\r$\nClick Next to continue."

  LangString qyFinishTitle ${LANG_PORTUGUESEBR} "Tudo pronto!"
  LangString qyFinishTitle ${LANG_ENGLISH} "All set!"
  LangString qyFinishText ${LANG_PORTUGUESEBR} "O ${PRODUCT_NAME} foi instalado e já está no menu Iniciar e na área de trabalho.$\r$\n$\r$\nDaqui pra frente ele se atualiza sozinho."
  LangString qyFinishText ${LANG_ENGLISH} "${PRODUCT_NAME} is installed and ready in your Start menu and on your desktop.$\r$\n$\r$\nFrom now on it keeps itself up to date."
  LangString qyFinishRun ${LANG_PORTUGUESEBR} "Abrir o ${PRODUCT_NAME} agora"
  LangString qyFinishRun ${LANG_ENGLISH} "Launch ${PRODUCT_NAME} now"
  LangString qyFinishLink ${LANG_PORTUGUESEBR} "Conheça o site do ${PRODUCT_NAME}"
  LangString qyFinishLink ${LANG_ENGLISH} "Visit the ${PRODUCT_NAME} website"

  LangString qyUnWelcomeTitle ${LANG_PORTUGUESEBR} "Desinstalar o ${PRODUCT_NAME}"
  LangString qyUnWelcomeTitle ${LANG_ENGLISH} "Uninstall ${PRODUCT_NAME}"
  LangString qyUnWelcomeText ${LANG_PORTUGUESEBR} "Este assistente vai remover o ${PRODUCT_NAME} do seu computador.$\r$\n$\r$\nSeus dados (projetos, tarefas, conversas e configurações) continuam guardados e voltam se você instalar de novo.$\r$\n$\r$\nFeche o ${PRODUCT_NAME} antes de continuar."
  LangString qyUnWelcomeText ${LANG_ENGLISH} "This wizard will remove ${PRODUCT_NAME} from your computer.$\r$\n$\r$\nYour data (projects, tasks, chats and settings) stays saved and comes back if you reinstall.$\r$\n$\r$\nPlease close ${PRODUCT_NAME} before continuing."
  LangString qyUnFinishTitle ${LANG_PORTUGUESEBR} "${PRODUCT_NAME} desinstalado"
  LangString qyUnFinishTitle ${LANG_ENGLISH} "${PRODUCT_NAME} uninstalled"
  LangString qyUnFinishText ${LANG_PORTUGUESEBR} "O ${PRODUCT_NAME} foi removido. Obrigado por usar!"
  LangString qyUnFinishText ${LANG_ENGLISH} "${PRODUCT_NAME} has been removed. Thanks for using it!"
!macroend
