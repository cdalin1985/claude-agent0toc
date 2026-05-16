$ErrorActionPreference = "Stop"

$Desktop = [Environment]::GetFolderPath("Desktop")
$Target = Join-Path $Desktop "toc-local-operator"
$OperatorPath = Join-Path $Target "operator.mjs"
$EnvPath = Join-Path $Target ".env"

if (!(Test-Path $Target)) { throw "Local operator folder not found: $Target" }
if (!(Test-Path $OperatorPath)) { throw "operator.mjs not found: $OperatorPath" }

Write-Host "Repairing guardrail path detection at: $Target"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-TextNoBom {
  param([Parameter(Mandatory=$true)][string]$Path)
  $Text = [System.IO.File]::ReadAllText($Path)
  if ($Text.Length -gt 0 -and [int][char]$Text[0] -eq 65279) { $Text = $Text.Substring(1) }
  return $Text
}

function Write-TextNoBom {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][AllowEmptyString()][string]$Text
  )
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

$operator = Read-TextNoBom $OperatorPath

$oldExtract = @'
function extractPaths(value, out = []) {
  if (typeof value === "string") {
    const looksLikePath = /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.includes("\\") || value.includes("/");
    if (looksLikePath) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractPaths(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) extractPaths(nested, out);
  }
  return out;
}
'@

$newExtract = @'
function isPathArgumentKey(key) {
  return /(^|_)(path|paths|file|files|folder|folders|directory|directories|dir|cwd|workspace|repo|root)(_|$)/i.test(key);
}

function extractPaths(value, out = [], key = "") {
  if (typeof value === "string") {
    const looksLikeAbsolutePath = /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/");
    const shouldInspect = isPathArgumentKey(key) || looksLikeAbsolutePath;
    if (shouldInspect && (looksLikeAbsolutePath || value.includes("\\") || value.includes("/"))) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractPaths(item, out, key);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [childKey, nested] of Object.entries(value)) extractPaths(nested, out, childKey);
  }
  return out;
}
'@

if ($operator.Contains($oldExtract)) {
  $operator = $operator.Replace($oldExtract, $newExtract)
} elseif ($operator -notmatch "function isPathArgumentKey\(") {
  throw "Could not find the old extractPaths block in operator.mjs. Guardrail patch not applied."
}

# Increase steps for edit-heavy coding tasks if not already higher.
if (Test-Path $EnvPath) {
  $envText = Read-TextNoBom $EnvPath
  if ($envText -match "(?m)^MAX_AGENT_STEPS=") {
    $envText = [regex]::Replace($envText, "(?m)^MAX_AGENT_STEPS=.*$", "MAX_AGENT_STEPS=48")
  } else {
    $envText = $envText.TrimEnd() + "`r`nMAX_AGENT_STEPS=48`r`n"
  }
  Write-TextNoBom $EnvPath $envText
}

Write-TextNoBom $OperatorPath $operator

Write-Host "Guardrail repair complete."
Write-Host "The operator will now inspect only real path argument fields like file_path, directory, cwd, repo, etc."
Write-Host "Now run:"
Write-Host "cd `"$Target`""
Write-Host ".\run-task.ps1"
