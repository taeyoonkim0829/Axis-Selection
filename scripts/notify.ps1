# Shows a Windows toast notification (used by the data-updater agent when a data update finishes or needs input):
#   powershell -NoProfile -File scripts/notify.ps1 -Title "AxisPilot" -Message "..."
param(
  [string]$Title = 'AxisPilot',
  [Parameter(Mandatory = $true)][string]$Message
)

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$escape = { param($s) [System.Security.SecurityElement]::Escape($s) }
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml(@"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$(& $escape $Title)</text>
      <text>$(& $escape $Message)</text>
    </binding>
  </visual>
</toast>
"@)

# PowerShell's AppUserModelID, so the toast shows without registering an app
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show(
  [Windows.UI.Notifications.ToastNotification]::new($xml))
