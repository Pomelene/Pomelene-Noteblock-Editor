param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $projectRoot 'test-results\installer\lifecycle'
$testAreaPrefix = [IO.Path]::GetFullPath((Split-Path -Parent $testRoot)).TrimEnd('\') + '\'
$productName = 'Pomelene Noteblock Editor'
$installParent = Join-Path $testRoot '安装 验证'
$installDir = Join-Path $installParent $productName
$payload = Join-Path (Split-Path -Parent $Installer) 'win-unpacked'
$reports = Join-Path $projectRoot 'test-results\installer'
$checks = [Collections.Generic.List[string]]::new()
function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Record([string]$Name) { $checks.Add($Name); Write-Output "PASS $Name" }
function Remove-DirectoryLink([string]$Path) {
  if ([IO.Directory]::Exists($Path)) {
    [IO.Directory]::Delete($Path, $false)
  }
}
function Install-Entries {
  $entries = @(Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $null -ne $_ -and $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -like '*Pomelene*' })
  if ($entries.Count -gt 0) { $entries }
}
function Remove-StaleTestShortcut([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
  $shell = New-Object -ComObject WScript.Shell
  $target = $shell.CreateShortcut($Path).TargetPath
  if ($target -and -not (Test-Path -LiteralPath $target) -and [IO.Path]::GetFullPath($target).StartsWith($testAreaPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $Path -Force
  }
}
function Remove-StaleTestInstallEntries {
  foreach ($entry in @(Install-Entries)) {
    $uninstallProperty = $entry.PSObject.Properties['UninstallString']
    if (-not $uninstallProperty) { continue }
    $uninstallString = [string]$uninstallProperty.Value
    $target = $null
    if ($uninstallString -match '^\s*"([^"]+)"') {
      $target = $matches[1]
    } elseif ($uninstallString -match '^\s*(\S+)') {
      $target = $matches[1]
    }
    if ($target -and -not (Test-Path -LiteralPath $target) -and [IO.Path]::GetFullPath($target).StartsWith($testAreaPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $entry.PSPath -Force
    }
  }
}
function Invoke-Installer([string]$File, [string[]]$Arguments, [int]$Expected = 0) {
  $process = Start-Process -FilePath $File -ArgumentList $Arguments -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(60000)) { throw "Installer timed out; inspect process $($process.Id)" }
  Assert-True ($process.ExitCode -eq $Expected) "Unexpected installer exit $($process.ExitCode); expected $Expected"
}
function Same-Bytes([string]$First, [string]$Second) {
  $a = [IO.File]::ReadAllBytes($First); $b = [IO.File]::ReadAllBytes($Second)
  return [Convert]::ToBase64String($a) -eq [Convert]::ToBase64String($b)
}
Assert-True (Test-Path -LiteralPath $Installer -PathType Leaf) 'Installer missing'
Remove-StaleTestInstallEntries
Assert-True (@(Install-Entries).Count -eq 0) 'A real Pomelene installation exists; refusing to modify it'
Assert-True (-not (Test-Path -LiteralPath $testRoot)) 'Lifecycle test folder already exists; inspect before reusing'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) "$productName.lnk"
$startLink = Join-Path ([Environment]::GetFolderPath('Programs')) "$productName.lnk"
Remove-StaleTestShortcut $desktopLink
Remove-StaleTestShortcut $startLink
Assert-True (-not (Test-Path -LiteralPath $desktopLink)) 'Existing desktop shortcut must not be overwritten'
Assert-True (-not (Test-Path -LiteralPath $startLink)) 'Existing start shortcut must not be overwritten'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$outside = Join-Path $testRoot '我的歌曲.nbs'
[IO.File]::WriteAllText($outside,'external song must survive install and uninstall')
$outsideBytes = [IO.File]::ReadAllBytes($outside)
$invalid = Join-Path $testRoot "unrelated\$productName"
New-Item -ItemType Directory -Path $invalid -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $invalid 'keep.txt'),'unrelated folder')
Invoke-Installer $Installer @('/S','/currentuser',"/D=$invalid") 12
Assert-True (Test-Path -LiteralPath (Join-Path $invalid 'keep.txt')) 'Unsafe target was changed'
Assert-True (@(Install-Entries).Count -eq 0) 'Rejected install registered itself'
Record 'nonempty unrelated product directory is rejected before installation'
$junctionTarget = Join-Path $testRoot 'junction-target'
$junction = Join-Path $testRoot 'linked'
New-Item -ItemType Directory -Path $junctionTarget | Out-Null
New-Item -ItemType Junction -Path $junction -Target $junctionTarget | Out-Null
try { Invoke-Installer $Installer @('/S','/currentuser',"/D=$junction\$productName") 12 }
finally { Remove-DirectoryLink $junction }
Record 'destination directory junction is rejected'
New-Item -ItemType Directory -Path $installParent | Out-Null
$parentUserFile = Join-Path $installParent '相邻资料.txt'
[IO.File]::WriteAllText($parentUserFile,'parent directory content must survive')
Invoke-Installer $Installer @('/S','/currentuser',"/D=$installParent")
$exe = Join-Path $installDir "$productName.exe"
Assert-True (Test-Path -LiteralPath $exe) 'Application was not installed'
Assert-True ([IO.File]::ReadAllText($parentUserFile) -eq 'parent directory content must survive') 'Installer changed the selected parent directory'
$owned = Get-Content -LiteralPath (Join-Path $reports 'owned-files.json') -Raw | ConvertFrom-Json
foreach ($relative in $owned) { Assert-True (Same-Bytes (Join-Path $payload $relative) (Join-Path $installDir $relative)) "Installed bytes differ: $relative" }
Record "offline installation in Unicode/space path deploys $($owned.Count) expected files byte-for-byte"
Assert-True (-not (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'pomelene-noteblock-editor-updater\installer.exe'))) 'Unused installer cache copy remains'
Record 'no redundant automatic-updater setup copy is retained'
$entries = @(Install-Entries)
Assert-True ($entries.Count -eq 1) 'Expected one Apps uninstall registration'
$installRegistration = Get-ItemProperty -LiteralPath ("HKCU:\Software\" + $entries[0].PSChildName)
Assert-True ($installRegistration.InstallLocation.TrimEnd('\') -eq $installDir) 'Wrong install registration'
Assert-True ($entries[0].PSPath -like '*HKEY_CURRENT_USER*') 'Default test installation was not per-user'
$uninstaller = @(Get-ChildItem -LiteralPath $installDir -File -Filter 'Uninstall*.exe')
Assert-True ($uninstaller.Count -eq 1) 'Generated uninstall executable missing'
Assert-True (Test-Path -LiteralPath $desktopLink) 'Desktop shortcut missing'
Assert-True (Test-Path -LiteralPath $startLink) 'Start menu shortcut missing'
$shell = New-Object -ComObject WScript.Shell
Assert-True ($shell.CreateShortcut($desktopLink).TargetPath -eq $exe) 'Desktop shortcut target wrong'
Assert-True ($shell.CreateShortcut($startLink).TargetPath -eq $exe) 'Start shortcut target wrong'
Record 'per-user Apps registration, generated uninstaller and shortcut targets are correct'
$copiedUninstaller = Join-Path $testRoot 'run-uninstaller.exe'
Copy-Item -LiteralPath $uninstaller[0].FullName -Destination $copiedUninstaller
$externalResource = Join-Path $testRoot 'outside-resource'
New-Item -ItemType Directory -Path $externalResource | Out-Null
[IO.File]::WriteAllText((Join-Path $externalResource 'app.asar'),'external data must not be deleted')
$realResources = Join-Path $installDir 'resources'
$savedResources = Join-Path $installDir 'resources-before-test'
Move-Item -LiteralPath $realResources -Destination $savedResources
New-Item -ItemType Junction -Path $realResources -Target $externalResource | Out-Null
try {
  Invoke-Installer $copiedUninstaller @('/S','/currentuser',"_?=$installDir") 12
  Assert-True ([IO.File]::ReadAllText((Join-Path $externalResource 'app.asar')) -eq 'external data must not be deleted') 'Uninstaller followed an internal junction'
  Assert-True (Test-Path -LiteralPath $exe) 'Junction rejection removed installed executable'
} finally {
  Remove-DirectoryLink $realResources
  Move-Item -LiteralPath $savedResources -Destination $realResources
}
Record 'uninstaller rejects internal directory junctions without changing external or installed files'
$lockedResource = [IO.File]::Open((Join-Path $realResources 'app.asar'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try { Invoke-Installer $Installer @('/S','/currentuser',"/D=$installDir") 2 }
finally { $lockedResource.Dispose() }
foreach ($relative in $owned) { Assert-True (Same-Bytes (Join-Path $payload $relative) (Join-Path $installDir $relative)) "Locked-file rollback changed: $relative" }
Record 'locked-resource reinstall refuses and restores the previous program byte-for-byte'
$env:NBE_EXE = $exe; $env:NBE_INSTALLER = $Installer; $env:NBE_UNINSTALLER = $uninstaller[0].FullName
Push-Location $projectRoot
try {
  & node scripts/installer-running-smoke.cjs
  Assert-True ($LASTEXITCODE -eq 0) 'Running-app safety check failed'
  Record 'install and uninstall refuse a running editor and preserve its session'
  & node scripts/start-screen-smoke.cjs --packaged
  Assert-True ($LASTEXITCODE -eq 0) 'Installed EXE entry/file workflow smoke failed'
  Record 'installed EXE passes all 12 start, file, animation and native-window checks'
} finally { Pop-Location; Remove-Item Env:NBE_EXE,Env:NBE_INSTALLER,Env:NBE_UNINSTALLER -ErrorAction SilentlyContinue }
$userFile = Join-Path $installDir '我的工程.nbproject'
$nestedUserFile = Join-Path $installDir 'resources\用户采样.nbs'
[IO.File]::WriteAllText($userFile,'user project in installation directory')
[IO.File]::WriteAllText($nestedUserFile,'user resource must survive')
$runtimeInfo = Get-Content -LiteralPath (Join-Path $reports 'runtime.json') -Raw | ConvertFrom-Json
$appData = $runtimeInfo.userData
New-Item -ItemType Directory -Path $appData -Force | Out-Null
$appDataMarker = Join-Path $appData ('installer-test-' + [Guid]::NewGuid().ToString() + '.txt')
[IO.File]::WriteAllText($appDataMarker,'retained application data')
try {
  Invoke-Installer $Installer @('/S','/currentuser',"/D=$installDir")
  Assert-True ([IO.File]::ReadAllText($userFile) -eq 'user project in installation directory') 'Reinstall deleted project'
  Assert-True ([IO.File]::ReadAllText($nestedUserFile) -eq 'user resource must survive') 'Reinstall deleted user resource'
  Assert-True (Test-Path -LiteralPath $appDataMarker) 'Reinstall deleted user data'
  Assert-True (@(Install-Entries).Count -eq 1) 'Reinstall created duplicate registration'
  Record 'same-version reinstall retains user files and app data without duplicate registration'
  [IO.File]::SetAttributes((Join-Path $installDir 'LICENSE.electron.txt'), [IO.FileAttributes]::ReadOnly)
  Copy-Item -LiteralPath $uninstaller[0].FullName -Destination $copiedUninstaller -Force
  Invoke-Installer $copiedUninstaller @('/S','/currentuser',"_?=$installDir")
  foreach ($relative in $owned) { Assert-True (-not (Test-Path -LiteralPath (Join-Path $installDir $relative))) "Owned file survived uninstall: $relative" }
  Assert-True (-not (Test-Path -LiteralPath $uninstaller[0].FullName)) 'Uninstaller did not remove itself'
  Assert-True (@(Install-Entries).Count -eq 0) 'Uninstall registration remains'
  Assert-True (-not (Test-Path -LiteralPath $desktopLink)) 'Desktop shortcut remains'
  Assert-True (-not (Test-Path -LiteralPath $startLink)) 'Start shortcut remains'
  $remainingFiles = @(Get-ChildItem -LiteralPath $installDir -File -Force -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($installDir, $_.FullName) } | Sort-Object)
  $expectedFiles = @('我的工程.nbproject','resources\用户采样.nbs') | Sort-Object
  Assert-True (($remainingFiles -join '|') -eq ($expectedFiles -join '|')) 'Unexpected program/staging files remain after uninstall'
  $remainingDirectories = @(Get-ChildItem -LiteralPath $installDir -Directory -Force -Recurse)
  Assert-True ($remainingDirectories.Count -eq 1 -and $remainingDirectories[0].Name -eq 'resources') 'Unexpected staging directories remain'
  Record 'generated uninstaller removes program files including a read-only file, itself, registration and shortcuts'
  Assert-True ([IO.File]::ReadAllText($userFile) -eq 'user project in installation directory') 'Uninstall deleted project'
  Assert-True ([IO.File]::ReadAllText($nestedUserFile) -eq 'user resource must survive') 'Uninstall deleted user resource'
  Assert-True (Test-Path -LiteralPath $appDataMarker) 'Uninstall deleted app data'
  Assert-True ([Convert]::ToBase64String($outsideBytes) -eq [Convert]::ToBase64String([IO.File]::ReadAllBytes($outside))) 'External song changed'
  Record 'uninstall retains external song, install-directory project/resource and AppData'
} finally { Remove-Item -LiteralPath $appDataMarker -Force -ErrorAction SilentlyContinue }
$signature = Get-AuthenticodeSignature -LiteralPath $Installer
@{ installer=$Installer; signature=$signature.Status.ToString(); checks=$checks.ToArray(); installPath=$installDir; ownedFiles=$owned.Count; retainedUserFiles=@($outside,$parentUserFile,$userFile,$nestedUserFile); noHashChecks=$true } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reports 'lifecycle-results.json')
