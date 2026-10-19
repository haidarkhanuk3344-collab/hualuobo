; Runtime paths, version, file list and output are supplied by the build script.
Unicode true
RequestExecutionLevel user
ManifestDPIAware true
SetCompressor /SOLID lzma
SetCompressorDictSize 64
Name "花萝卜"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Hualuobo"
ShowInstDetails show
ShowUninstDetails show
BrandingText "花萝卜 · 桌面猫咪"
VIProductVersion "${VERSION_QUAD}"
VIAddVersionKey /LANG=2052 "ProductName" "花萝卜"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "FileDescription" "花萝卜安装程序"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Copyright © 2026 Hualuobo"

!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "欢迎安装花萝卜"
!define MUI_WELCOMEPAGE_TEXT "毛绒小猫，在桌面走动、休息，也会回应鼠标。$\r$\n$\r$\n花萝卜将安装到当前用户的应用文件夹，无需管理员权限。安装前请先退出正在运行的花萝卜。$\r$\n$\r$\n点击“下一步”开始安装。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "花萝卜已经安装好了"
!define MUI_FINISHPAGE_TEXT "桌面和开始菜单已添加快捷方式。$\r$\n$\r$\n启动后在控制面板点击“放出花萝卜”。连续点两下猫咪，可以打开操作菜单。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\花萝卜.exe"
!define MUI_FINISHPAGE_RUN_TEXT "现在运行花萝卜"
!insertmacro MUI_PAGE_FINISH
!define MUI_WELCOMEPAGE_TEXT "将移除花萝卜应用和快捷方式。猫咪的个人设置会保留。$\r$\n$\r$\n请先退出正在运行的花萝卜，再继续卸载。"
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"

Function .onInit
  SetShellVarContext current
  SetRegView 64
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "需要 64 位 Windows 10 或 Windows 11。"
    Abort
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  IntCmp $0 10240 supported unsupported supported
  unsupported:
    MessageBox MB_OK|MB_ICONSTOP "需要 Windows 10 或 Windows 11。"
    Abort
  supported:
FunctionEnd

Section "花萝卜" SEC_MAIN
  SetShellVarContext current
  SetRegView 64
  SetOverwrite on
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}/*"
  WriteUninstaller "$INSTDIR\卸载花萝卜.exe"
  CreateDirectory "$SMPROGRAMS\花萝卜"
  CreateShortcut "$DESKTOP\花萝卜.lnk" "$INSTDIR\花萝卜.exe" "" "$INSTDIR\花萝卜.exe" 0
  CreateShortcut "$SMPROGRAMS\花萝卜\花萝卜.lnk" "$INSTDIR\花萝卜.exe" "" "$INSTDIR\花萝卜.exe" 0
  CreateShortcut "$SMPROGRAMS\花萝卜\卸载花萝卜.lnk" "$INSTDIR\卸载花萝卜.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "DisplayName" "花萝卜"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "Publisher" "Hualuobo"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "DisplayIcon" '$\"$INSTDIR\花萝卜.exe$\",0'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "UninstallString" '$\"$INSTDIR\卸载花萝卜.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "QuietUninstallString" '$\"$INSTDIR\卸载花萝卜.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "EstimatedSize" ${APP_SIZE_KB}
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo" "NoRepair" 1
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  ; Delete only installed files. User-added files and AppData settings remain.
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\卸载花萝卜.exe"
  Delete "$DESKTOP\花萝卜.lnk"
  Delete "$SMPROGRAMS\花萝卜\花萝卜.lnk"
  Delete "$SMPROGRAMS\花萝卜\卸载花萝卜.lnk"
  RMDir "$SMPROGRAMS\花萝卜"
  RMDir "$INSTDIR"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Hualuobo"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Hualuobo"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hualuobo"
SectionEnd
