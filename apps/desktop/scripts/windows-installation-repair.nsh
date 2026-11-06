!macro eleckoiRepairInstallation
  Push $0
  Push $1
  InitPluginsDir
  File /oname=$PLUGINSDIR\eleckoi-installation.exe "${PROJECT_DIR}\resources\installer\eleckoi-installation.exe"
  nsExec::ExecToStack '"$PLUGINSDIR\eleckoi-installation.exe" --repair "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
    DetailPrint "$1"
    MessageBox MB_OK|MB_ICONSTOP "ElecKoi 安装文件的安全属性无法恢复，安装尚未完成。错误：$0。$\r$\n$1" /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  Pop $1
  Pop $0
!macroend
