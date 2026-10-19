; Keep the standard, maintained electron-builder NSIS flow; customize safety only.
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "${PROJECT_DIR}\test-results\installer\owned-files.nsh"

!macro customHeader
  CRCCheck force
!macroend

; There is no automatic updater: do not retain an extra setup copy in AppData.
!macro customInstall
  ${If} $installMode == "all"
    SetShellVarContext current
  ${EndIf}
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  ${GetParent} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}" $0
  RMDir "$0"
  ${If} $installMode == "all"
    SetShellVarContext all
  ${EndIf}
!macroend

; Also fail unattended reinstalls cleanly when the old uninstaller refuses.
!macro customUnInstallCheck
  ${If} ${Errors}
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "Unable to run the previous uninstaller. Installation has stopped." /SD IDOK
    Quit
  ${EndIf}
  ${If} $R0 != 0
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONEXCLAMATION "Previous files could not be safely removed. Close other programs and retry setup." /SD IDOK
    Quit
  ${EndIf}
!macroend

; Never terminate an editor with potentially unsaved work.
!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 != 603
    SetErrorLevel 10
    MessageBox MB_OK|MB_ICONEXCLAMATION "请先保存并完全退出 Pomelene Noteblock Editor，再重新运行安装或卸载。$\r$\nPlease save and close the editor before installing or uninstalling." /SD IDOK
    Quit
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
Function PomeleneValidateDirectory
  ; Require a dedicated, absolute local product directory, including /D= installs.
  StrCpy $0 $INSTDIR 1 1
  StrCpy $1 $INSTDIR 1 2
  ${If} $0 != ":"
  ${OrIf} $1 != "\"
    Goto unsafe_directory
  ${EndIf}
  GetFullPathName $INSTDIR "$INSTDIR"
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "${APP_FILENAME}"
    Goto unsafe_directory
  ${EndIf}
  ; Refuse junctions/symlinks anywhere in the destination ancestry.
  StrCpy $2 "$INSTDIR"
  directory_ancestry:
    System::Call 'kernel32::GetFileAttributesW(w r2)i.r3'
    ${If} $3 != -1
      IntOp $3 $3 & 0x400
      ${If} $3 != 0
        Goto unsafe_directory
      ${EndIf}
    ${EndIf}
    ${GetParent} "$2" $3
    ${If} $3 != ""
    ${AndIf} $3 != $2
      StrCpy $2 $3
      Goto directory_ancestry
    ${EndIf}
  ; Only an empty folder or an installation carrying our exact marker is allowed.
  IfFileExists "$INSTDIR\.pomelene-install" existing_installation
  FindFirst $0 $1 "$INSTDIR\*.*"
  empty_directory:
    ${If} $1 == ""
      FindClose $0
      Return
    ${EndIf}
    ${If} $1 != "."
    ${AndIf} $1 != ".."
      FindClose $0
      Goto unsafe_directory
    ${EndIf}
    FindNext $0 $1
    Goto empty_directory
  existing_installation:
    ClearErrors
    FileOpen $0 "$INSTDIR\.pomelene-install" r
    IfErrors unsafe_directory
    FileRead $0 $1
    FileClose $0
    ${If} $1 == "studio.noteblock.editor-owned-v1"
      Return
    ${EndIf}
  unsafe_directory:
    SetErrorLevel 12
    MessageBox MB_OK|MB_ICONSTOP "请选择独立的 Pomelene Noteblock Editor 文件夹；不能使用已有其他文件的目录或目录联接。$\r$\nChoose a dedicated empty product folder, without directory links." /SD IDOK
    Quit
FunctionEnd

!macro customInit
  Call PomeleneValidateDirectory
!macroend

Function PomeleneValidateSelectedDirectory
  Call PomeleneValidateDirectory
  Abort ; A validation-only custom page: continue to the standard install page.
FunctionEnd

!macro customPageAfterChangeDir
  Page custom PomeleneValidateSelectedDirectory
!macroend
!endif

!macro customUnInit
  ; A copied or misdirected uninstaller must not operate on an unrelated folder.
  ClearErrors
  FileOpen $0 "$INSTDIR\.pomelene-install" r
  IfErrors invalid_uninstall
  FileRead $0 $1
  FileClose $0
  ${If} $1 == "studio.noteblock.editor-owned-v1"
    Goto valid_uninstall
  ${EndIf}
  invalid_uninstall:
    SetErrorLevel 12
    MessageBox MB_OK|MB_ICONSTOP "Installation marker is missing or invalid. No program files were removed." /SD IDOK
    Quit
  valid_uninstall:
!macroend
