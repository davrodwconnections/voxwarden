; Removing the application preserves credentials, character data and addons.
; The explicit in-app removal flow remains available for deleting selected data.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.voxwarden.app"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.voxwarden.app"
  ${endIf}
!macroend
