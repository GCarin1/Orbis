# Creates the Orbis shortcuts (with the Orbis icon) on the Desktop and in the Start menu.
# Run through Orbis-Atalhos.bat. ASCII only: Windows PowerShell 5 reads a file with no BOM as ANSI.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (Resolve-Path (Join-Path $here "..\..")).Path
$icon = Join-Path $root "docs\brand\orbis.ico"
if (-not (Test-Path $icon)) { throw "Icon not found: $icon" }

$shell = New-Object -ComObject WScript.Shell
$places = @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))
$shortcuts = @(
    @{ Name = "Orbis";       Target = "Orbis.bat";       Text = "Starts Orbis, or restarts it when it is already running" },
    @{ Name = "Orbis Token"; Target = "Orbis-Token.bat"; Text = "Shows the Orbis login token" }
)
foreach ($place in $places) {
    foreach ($item in $shortcuts) {
        $path = Join-Path $place ($item.Name + ".lnk")
        $link = $shell.CreateShortcut($path)
        $link.TargetPath = Join-Path $here $item.Target
        $link.WorkingDirectory = $root
        $link.IconLocation = "$icon,0"
        $link.Description = $item.Text
        $link.WindowStyle = 1
        $link.Save()
        Write-Host "Created $path"
    }
}
