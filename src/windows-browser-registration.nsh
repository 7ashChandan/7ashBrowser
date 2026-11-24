!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\7ashBrowserURL" "" "7ash Browser URL"
  WriteRegStr SHELL_CONTEXT "Software\Classes\7ashBrowserURL" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\7ashBrowserURL\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\7ashBrowserURL\shell\open\command" "" `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"`

  WriteRegStr SHELL_CONTEXT "Software\Classes\7ashBrowserHTML" "" "7ash Browser HTML Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\7ashBrowserHTML\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\7ashBrowserHTML\shell\open\command" "" `"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"`
  WriteRegNone SHELL_CONTEXT "Software\Classes\.htm\OpenWithProgids" "7ashBrowserHTML"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.html\OpenWithProgids" "7ashBrowserHTML"

  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser" "" "7ash Browser"
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\shell\open\command" "" `"$INSTDIR\${APP_EXECUTABLE_FILENAME}"`
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\Capabilities" "ApplicationName" "7ash Browser"
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\Capabilities" "ApplicationDescription" "Browse the web with 7ash Browser."
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\Capabilities\URLAssociations" "http" "7ashBrowserURL"
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\Capabilities\URLAssociations" "https" "7ashBrowserURL"
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\Capabilities\FileAssociations" ".htm" "7ashBrowserHTML"
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser\Capabilities\FileAssociations" ".html" "7ashBrowserHTML"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "7ash Browser" "Software\Clients\StartMenuInternet\7ash Browser\Capabilities"
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "7ash Browser"
  DeleteRegKey SHELL_CONTEXT "Software\Clients\StartMenuInternet\7ash Browser"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\7ashBrowserURL"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\7ashBrowserHTML"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.htm\OpenWithProgids" "7ashBrowserHTML"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.html\OpenWithProgids" "7ashBrowserHTML"
!macroend
