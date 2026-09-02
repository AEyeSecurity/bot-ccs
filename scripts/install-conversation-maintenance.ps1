$ErrorActionPreference = "Stop"

$taskName = "BOT CCS Conversation Maintenance"
$node = "C:\Program Files\nodejs\node.exe"
$script = "C:\BOT CCS\scripts\run-conversation-maintenance.mjs"
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory "C:\BOT CCS"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "Usuario" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Closes BOT CCS conversations released without an operator response after 24 hours." -Force | Out-Null
Write-Output "Installed scheduled task: $taskName"
