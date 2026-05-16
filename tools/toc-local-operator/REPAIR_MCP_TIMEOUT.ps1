$ErrorActionPreference = "Stop"

$Desktop = [Environment]::GetFolderPath("Desktop")
$Target = Join-Path $Desktop "toc-local-operator"
$OperatorPath = Join-Path $Target "operator.mjs"
$PackagePath = Join-Path $Target "package.json"
$ConfigPath = Join-Path $Target "config\operator.config.json"

if (!(Test-Path $Target)) { throw "Local operator folder not found: $Target" }
if (!(Test-Path $OperatorPath)) { throw "operator.mjs not found: $OperatorPath" }
if (!(Test-Path $PackagePath)) { throw "package.json not found: $PackagePath" }
if (!(Test-Path $ConfigPath)) { throw "operator config not found: $ConfigPath" }

Write-Host "Repairing MCP timeout handling at: $Target"

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

Set-Location $Target

Write-Host "Installing Desktop Commander locally..."
npm install @wonderwhy-er/desktop-commander@latest --save

# Keep using npx, but after local install npx resolves faster from this project/cache.
$configText = Read-TextNoBom $ConfigPath
$config = $configText | ConvertFrom-Json
$config.mcp.command = "npx"
$config.mcp.args = @("-y", "@wonderwhy-er/desktop-commander@latest")
Write-TextNoBom $ConfigPath ($config | ConvertTo-Json -Depth 20)

$operator = Read-TextNoBom $OperatorPath

# Add timeout helpers using literal here-strings so PowerShell does not misparse JavaScript quotes.
if ($operator -notmatch "function mcpRequestOptions\(") {
  $oldBlock = @'
function maxSteps() {
  return Number(process.env.MAX_AGENT_STEPS || "24");
}
'@

  $newBlock = @'
function maxSteps() {
  return Number(process.env.MAX_AGENT_STEPS || "24");
}

function mcpTimeoutMs() {
  return Number(process.env.MCP_REQUEST_TIMEOUT_MS || "240000");
}

function mcpRequestOptions() {
  return {
    timeout: mcpTimeoutMs(),
    resetTimeoutOnProgress: true,
    maxTotalTimeout: Math.max(mcpTimeoutMs(), 900000)
  };
}
'@

  if ($operator.Contains($oldBlock)) {
    $operator = $operator.Replace($oldBlock, $newBlock)
  } else {
    throw "Could not find maxSteps block in operator.mjs. Timeout patch not applied."
  }
}

# Increase listTools timeout in both doctor and runAgent.
$operator = $operator.Replace(
  'const mcpTools = (await mcp.listTools()).tools || [];',
  'const mcpTools = (await mcp.listTools({}, mcpRequestOptions())).tools || [];'
)
$operator = $operator.Replace(
  'const tools = (await mcp.listTools()).tools || [];',
  'const tools = (await mcp.listTools({}, mcpRequestOptions())).tools || [];'
)

# Increase tool-call timeout.
$operator = $operator.Replace(
  'const result = await mcp.callTool({ name: toolName, arguments: toolArgs });',
  'const result = await mcp.callTool({ name: toolName, arguments: toolArgs }, mcpRequestOptions());'
)

Write-TextNoBom $OperatorPath $operator

# Add timeout value to .env if missing.
$EnvPath = Join-Path $Target ".env"
if (Test-Path $EnvPath) {
  $envText = Read-TextNoBom $EnvPath
  if ($envText -notmatch "(?m)^MCP_REQUEST_TIMEOUT_MS=") {
    $envText = $envText.TrimEnd() + "`r`nMCP_REQUEST_TIMEOUT_MS=240000`r`n"
    Write-TextNoBom $EnvPath $envText
  }
}

Write-Host "MCP timeout repair complete."
Write-Host "Now run:"
Write-Host "cd `"$Target`""
Write-Host "npm run doctor"
