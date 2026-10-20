param([Parameter(Mandatory=$true)][string]$MakeNsis)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$project = Split-Path -Parent $PSScriptRoot
$area = Join-Path $project 'test-results\installer'
$root = Join-Path $area ('directory-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$script = Get-Content -LiteralPath (Join-Path $project 'resources\installer.nsh') -Raw
$functions = @('PomelenePrepareDirectory','PomeleneValidateDirectory') | ForEach-Object {
  [regex]::Match($script, "Function $_\b[\s\S]*?FunctionEnd").Value
}
$source = @'
Unicode true
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!define APP_FILENAME "Pomelene Noteblock Editor"
OutFile "directory-test.exe"
RequestExecutionLevel user
SilentInstall silent
__FUNCTIONS__
Section
  Call PomelenePrepareDirectory
  Call PomeleneValidateDirectory
  FileOpen $8 "$EXEDIR\result.txt" w
  FileWriteUTF16LE /BOM $8 "$INSTDIR"
  FileClose $8
SectionEnd
'@
$source.Replace('__FUNCTIONS__', ($functions -join "`n")) | Set-Content -LiteralPath (Join-Path $root 'directory-test.nsi') -Encoding utf8
& $MakeNsis /V1 /INPUTCHARSET UTF8 (Join-Path $root 'directory-test.nsi')
if ($LASTEXITCODE -ne 0) { throw 'NSIS directory harness compilation failed' }
function Check([string]$InputPath, [string]$ExpectedPath, [int]$ExpectedExit = 0) {
  $run = Start-Process -FilePath (Join-Path $root 'directory-test.exe') -ArgumentList @('/S',"/D=$InputPath") -PassThru -WindowStyle Hidden
  if (-not $run.WaitForExit(15000)) { throw 'Directory validation timed out' }
  if ($run.ExitCode -ne $ExpectedExit) { throw "Directory validation exit $($run.ExitCode), expected $ExpectedExit for $InputPath" }
  if ($ExpectedExit -eq 0) {
    $actual = Get-Content -LiteralPath (Join-Path $root 'result.txt') -Raw -Encoding unicode
    if ($actual -ne $ExpectedPath) { throw "Wrong directory: $actual, expected $ExpectedPath" }
  }
  Write-Output "PASS directory validation: $InputPath"
}
$parent = Join-Path $root '安装 位置'
New-Item -ItemType Directory -Path $parent | Out-Null
[IO.File]::WriteAllText((Join-Path $parent 'keep.txt'),'unrelated parent content')
$product = Join-Path $parent 'Pomelene Noteblock Editor'
Check $parent $product
Check ($parent + '\') $product
Check $product $product
$newParent = Join-Path $root 'not-created\nested'
Check $newParent (Join-Path $newParent 'Pomelene Noteblock Editor')
New-Item -ItemType Directory -Path $product | Out-Null
Check $product $product
[IO.File]::WriteAllText((Join-Path $product 'keep.txt'),'unrelated product content')
Check $parent '' 12
[IO.File]::WriteAllText((Join-Path $product '.pomelene-install'),'invalid marker')
Check $product '' 12
[IO.File]::WriteAllText((Join-Path $product '.pomelene-install'),'studio.noteblock.editor-owned-v1')
Check $product $product
$link = Join-Path $root 'linked'
New-Item -ItemType Junction -Path $link -Target $parent | Out-Null
try { Check $link '' 12 } finally { [IO.Directory]::Delete($link,$false) }
if ([IO.File]::ReadAllText((Join-Path $parent 'keep.txt')) -ne 'unrelated parent content') { throw 'Parent content changed' }
# Only this invocation's generated test files are removed.
$resolved = [IO.Path]::GetFullPath($root)
if (-not $resolved.StartsWith([IO.Path]::GetFullPath($area).TrimEnd('\') + '\')) { throw 'Unsafe cleanup path' }
Remove-Item -LiteralPath $resolved -Recurse -Force
