$proc = Start-Process -FilePath "node" -ArgumentList "`"$PSScriptRoot\server.js`"" -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Hidden
Write-Output "Started dashboard PID: $($proc.Id)"
