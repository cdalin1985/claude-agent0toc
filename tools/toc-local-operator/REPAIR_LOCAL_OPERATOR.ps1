$ErrorActionPreference = "Stop"

$Desktop = [Environment]::GetFolderPath("Desktop")
$Target = Join-Path $Desktop "toc-local-operator"
$ConfigPath = Join-Path $Target "config\operator.config.json"
$OperatorPath = Join-Path $Target "operator.mjs"

if (!(Test-Path $Target)) {
  throw "Local operator folder not found: $Target"
}
if (!(Test-Path $ConfigPath)) {
  throw "Config not found: $ConfigPath"
}
if (!(Test-Path $OperatorPath)) {
  throw "Operator file not found: $OperatorPath"
}

Write-Host "Repairing TOC Local Operator at: $Target"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-TextNoBom {
  param([Parameter(Mandatory=$true)][string]$Path)
  $Text = [System.IO.File]::ReadAllText($Path)
  if ($Text.Length -gt 0 -and [int][char]$Text[0] -eq 65279) {
    $Text = $Text.Substring(1)
  }
  return $Text
}

function Write-TextNoBom {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$Text
  )
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

# 1. Strip BOM from JSON config and add actual Desktop paths.
$configText = Read-TextNoBom $ConfigPath
$config = $configText | ConvertFrom-Json

$desktopForward = $Desktop.Replace('\\', '/')
$targetForward = $Target.Replace('\\', '/')
$repoPath = "C:/Users/chase/Desktop/claude-agent0toc"
$swarmPath = "C:/Users/chase/Desktop/TOC-Agent-Swarm"

$allowed = @($config.allowedDirectories)
foreach ($path in @($desktopForward, $targetForward, $repoPath, $swarmPath)) {
  if ($allowed -notcontains $path) { $allowed += $path }
}
$config.allowedDirectories = $allowed

$configJson = $config | ConvertTo-Json -Depth 20
Write-TextNoBom $ConfigPath $configJson

# 2. Patch operator.mjs so it strips BOM before JSON.parse forever.
$operatorText = Read-TextNoBom $OperatorPath
$old = 'return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));'
$new = 'return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8").replace(/^\uFEFF/, ""));'
if ($operatorText.Contains($old)) {
  $operatorText = $operatorText.Replace($old, $new)
}
Write-TextNoBom $OperatorPath $operatorText

# 3. Rewrite other text files without BOM to prevent similar issues.
Get-ChildItem $Target -Recurse -File -Include *.json,*.mjs,*.md,*.ps1,*.example,.env | ForEach-Object {
  $text = Read-TextNoBom $_.FullName
  Write-TextNoBom $_.FullName $text
}

Write-Host "Repair complete."
Write-Host "Now run:"
Write-Host "cd `"$Target`""
Write-Host "npm run doctor"
