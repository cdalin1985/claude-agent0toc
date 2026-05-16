$ErrorActionPreference = "Stop"

$Desktop = [Environment]::GetFolderPath("Desktop")
$Target = Join-Path $Desktop "toc-local-operator"

Write-Host "Creating TOC Local Operator at: $Target"

if (Test-Path $Target) {
  Write-Host "Removing existing local operator folder..."
  Remove-Item $Target -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Target "config") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Target "tasks") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Target "runs") | Out-Null

function Write-TextFile {
  param(
    [Parameter(Mandatory=$true)][string]$RelativePath,
    [Parameter(Mandatory=$true)][string]$Content
  )
  $FullPath = Join-Path $Target $RelativePath
  $Dir = Split-Path $FullPath -Parent
  if (!(Test-Path $Dir)) { New-Item -ItemType Directory -Force -Path $Dir | Out-Null }
  Set-Content -Path $FullPath -Value $Content -Encoding UTF8
}

Write-TextFile "package.json" @'
{
  "name": "toc-local-operator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "doctor": "node operator.mjs doctor",
    "chat": "node operator.mjs chat",
    "task": "node operator.mjs task",
    "start": "node operator.mjs chat"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "dotenv": "latest",
    "openai": "latest"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
'@

Write-TextFile ".env.example" @'
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-5
APPROVAL_MODE=guarded
MAX_AGENT_STEPS=24
'@

Write-TextFile "config/operator.config.json" @'
{
  "workspaceName": "TOC Local Operator",
  "mcp": {
    "command": "npx",
    "args": ["-y", "@wonderwhy-er/desktop-commander@latest"]
  },
  "allowedDirectories": [
    "C:/Users/chase/Desktop/TOC-Agent-Swarm",
    "C:/Users/chase/Desktop/claude-agent0toc",
    "C:/Users/chase/Desktop/Top-Of-The-Capital",
    "C:/Users/chase/Desktop/toc-local-operator",
    "C:/Users/chase/Desktop"
  ],
  "protectedPaths": [
    "C:/Windows",
    "C:/Program Files",
    "C:/Program Files (x86)",
    "C:/Users/chase/AppData",
    "C:/Users/chase/.ssh"
  ],
  "blockedCommandFragments": [
    "format ",
    "shutdown",
    "restart-computer",
    "stop-computer",
    "cipher /w",
    "del /s",
    "rmdir /s",
    "rd /s",
    "remove-item -recurse -force",
    "rm -rf /",
    "reg delete",
    "net user",
    "bcdedit",
    "diskpart",
    "takeown",
    "icacls"
  ],
  "autoApproveCommandPrefixes": [
    "git status",
    "git diff",
    "git branch",
    "git log",
    "git show",
    "npm run lint",
    "npm run build",
    "npm run typecheck",
    "npm test",
    "node --version",
    "npm --version",
    "npx --version",
    "dir",
    "pwd"
  ],
  "tocGuardrails": [
    "TOC uses one unified ranking list across 8-ball, 9-ball, and 10-ball.",
    "Players may challenge within plus/minus 5 ranks on the unified list.",
    "Only the #1 ranked player can challenge anyone on the list.",
    "After a loss, a player cannot issue a new challenge for 24 hours.",
    "Winner takes loser spot; players between shift accordingly; if higher-ranked player wins, no movement.",
    "One active challenge per player maximum.",
    "Treasury is visible to all players; only super_admin may create, edit, or manage treasury entries.",
    "Do not add starting rank placement unless explicitly requested later.",
    "Do not change challenge rules, challenge range, race length rules, cooldown rules, or treasury permissions unless the task explicitly says to."
  ]
}
'@

Write-TextFile "tasks/finish-admin-player-ui.md" @'
# Task: Finish PR #8 Admin Players UI

Repository path:
C:\Users\chase\Desktop\claude-agent0toc

Current branch:
feature/admin-player-management-hardening-slice-1-add-claimed

Goal:
Finish the UI half of Admin player management hardening on the existing PR branch.

Modify only:
- src/pages/AdminPage.tsx

Required:
- Add All / Claimed / Unclaimed filter to the Players tab.
- Claimed means players.profile_id is not null.
- Unclaimed means players.profile_id is null.
- Display Fargo rating beside each player by reading player_reference_metrics.
- Add optional Fargo rating input to the Add New Player form.
- Send fargo_rating to /functions/v1/add-player when provided.
- Keep duplicate-name prevention handled by the Edge Function.
- Invalidate admin-players and rankings after successful add.

Guardrails:
- Do not change challenge rules.
- Do not change ranking challenge range.
- Do not change race length rules.
- Do not change cooldown rules.
- Do not change treasury permissions.
- Do not implement starting rank placement yet.

Validation:
- Run npm run lint.
- Run npm run build.
- Show changed files.
- If validation passes, commit the AdminPage.tsx change to the current feature branch.
- Do not merge the PR.
'@

Write-TextFile "run-task.ps1" @'
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
npm run task -- "tasks/finish-admin-player-ui.md"
'@

Write-TextFile "README.md" @'
# TOC Local Operator

This is one local folder that connects OpenAI API to Desktop Commander MCP so an agent can inspect files, edit code, and run terminal commands without making you manually relay every terminal step.

## Setup

Open PowerShell:

```powershell
cd "C:\Users\chase\Desktop\toc-local-operator"
notepad .env
```

Paste your key:

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-5
APPROVAL_MODE=guarded
MAX_AGENT_STEPS=24
```

Run:

```powershell
npm run doctor
.\run-task.ps1
```

## Approval modes

- ask: asks before every Desktop Commander tool call
- guarded: auto-approves read/status/build commands, asks for mutations
- auto: auto-approves anything not blocked by guardrails

Start with guarded.
'@

Write-TextFile "operator.mjs" @'
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config", "operator.config.json");
const RUNS_DIR = path.join(ROOT, "runs");

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function approvalMode() {
  const mode = (process.env.APPROVAL_MODE || "guarded").toLowerCase();
  return ["ask", "guarded", "auto"].includes(mode) ? mode : "guarded";
}

function modelName() {
  return process.env.OPENAI_MODEL || "gpt-5";
}

function maxSteps() {
  return Number(process.env.MAX_AGENT_STEPS || "24");
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
}

function isInsideAny(value, bases) {
  const normalized = normalizePath(value);
  return bases.some((base) => {
    const b = normalizePath(base);
    return normalized === b || normalized.startsWith(b + "/");
  });
}

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

function extractCommand(args) {
  for (const key of ["command", "cmd", "shell", "script"]) {
    if (typeof args?.[key] === "string") return args[key].trim();
  }
  return "";
}

function truncate(value, max = 12000) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length <= max ? text : text.slice(0, max) + `\n...[truncated ${text.length - max} chars]`;
}

function runLogFile() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  return path.join(RUNS_DIR, new Date().toISOString().replace(/[:.]/g, "-") + ".jsonl");
}

function writeLog(file, event, data) {
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), event, data }) + "\n", "utf8");
}

function safeToolName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function decideToolCall(toolName, args, config, mode) {
  const name = toolName.toLowerCase();
  const command = extractCommand(args);
  const commandLower = command.toLowerCase();

  const blocked = config.blockedCommandFragments.find((fragment) => commandLower.includes(fragment.toLowerCase()));
  if (blocked) return { allowed: false, requiresApproval: false, risk: "blocked", reason: `Blocked command fragment: ${blocked}` };

  const paths = extractPaths(args);
  const protectedPath = paths.find((p) => isInsideAny(p, config.protectedPaths));
  if (protectedPath) return { allowed: false, requiresApproval: false, risk: "blocked", reason: `Protected path blocked: ${protectedPath}` };

  const outside = paths.find((p) => !isInsideAny(p, config.allowedDirectories));
  if (outside) return { allowed: false, requiresApproval: false, risk: "blocked", reason: `Path outside allowed directories: ${outside}` };

  const readLike = name.includes("read") || name.includes("list") || name.includes("search") || name.includes("get");
  const writeLike = name.includes("write") || name.includes("edit") || name.includes("delete") || name.includes("move") || name.includes("create");
  const commandLike = name.includes("execute") || name.includes("command") || name.includes("terminal") || command.length > 0;

  if (commandLike) {
    const lowRisk = config.autoApproveCommandPrefixes.some((prefix) => commandLower.startsWith(prefix.toLowerCase()));
    if (lowRisk) return { allowed: true, requiresApproval: mode === "ask", risk: "low", reason: "Recognized low-risk command." };
    return { allowed: true, requiresApproval: mode !== "auto", risk: "medium", reason: "Terminal command can modify state." };
  }

  if (writeLike) return { allowed: true, requiresApproval: mode !== "auto", risk: "medium", reason: "File mutation." };
  if (readLike) return { allowed: true, requiresApproval: mode === "ask", risk: "low", reason: "Read/list/search tool." };
  return { allowed: true, requiresApproval: mode !== "auto", risk: "medium", reason: "Unknown tool risk." };
}

async function connectMcp(config) {
  const client = new Client({ name: "toc-local-operator", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: config.mcp.command, args: config.mcp.args });
  await client.connect(transport);
  return client;
}

function systemPrompt(config) {
  return [
    `You are ${config.workspaceName}, a local coding/operator agent running on Chase's Windows PC.`,
    "Use Desktop Commander tools to inspect files, edit code, and run commands instead of asking Chase to relay terminal steps.",
    "Keep work organized inside the configured TOC folders.",
    "Before editing, inspect the relevant files.",
    "Prefer small reviewable changes.",
    "After code changes, run validation, usually npm run lint and npm run build.",
    "At the end, summarize changed files, commands run, and remaining blockers.",
    "",
    "TOC non-negotiable guardrails:",
    ...config.tocGuardrails.map((rule) => `- ${rule}`),
    "",
    "Do not reveal secrets from .env files. Do not modify protected paths."
  ].join("\n");
}

function toOpenAiTools(mcpTools) {
  const nameMap = new Map();
  const tools = mcpTools.map((tool) => {
    const safe = safeToolName(tool.name);
    nameMap.set(safe, tool.name);
    return {
      type: "function",
      function: {
        name: safe,
        description: tool.description || `Desktop Commander tool: ${tool.name}`,
        parameters: tool.inputSchema || { type: "object", properties: {}, additionalProperties: true }
      }
    };
  });
  return { tools, nameMap };
}

async function approveIfNeeded(rl, mode, toolName, args, decision) {
  if (!decision.requiresApproval) return true;
  console.log("\nTool approval required");
  console.log(`Tool: ${toolName}`);
  console.log(`Risk: ${decision.risk}`);
  console.log(`Reason: ${decision.reason}`);
  console.log(`Args: ${truncate(args, 1600)}`);
  const answer = await rl.question("Approve? Type y or n: ");
  return answer.trim().toLowerCase() === "y";
}

function taskText(mode, args) {
  if (mode === "task") {
    const file = args[0];
    if (!file) throw new Error("Missing task file. Example: npm run task -- tasks/finish-admin-player-ui.md");
    return fs.readFileSync(path.resolve(file), "utf8");
  }
  const text = args.join(" ").trim();
  if (!text) throw new Error("Missing prompt. Example: npm run chat -- \"inspect the repo\"");
  return text;
}

async function runAgent(mode, args) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing. Open .env and paste your key.");

  const config = loadConfig();
  const logFile = runLogFile();
  const mcp = await connectMcp(config);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const mcpTools = (await mcp.listTools()).tools || [];
    const { tools, nameMap } = toOpenAiTools(mcpTools);
    const messages = [
      { role: "system", content: systemPrompt(config) },
      { role: "user", content: taskText(mode, args) }
    ];

    writeLog(logFile, "started", { mode, model: modelName(), approvalMode: approvalMode(), tools: mcpTools.map((t) => t.name) });

    for (let step = 1; step <= maxSteps(); step++) {
      console.log(`\n--- Agent step ${step}/${maxSteps()} ---`);
      const response = await openai.chat.completions.create({ model: modelName(), messages, tools, tool_choice: "auto" });
      const msg = response.choices[0]?.message;
      if (!msg) throw new Error("OpenAI returned no message.");
      messages.push(msg);
      writeLog(logFile, "assistant", msg);

      if (msg.content) console.log("\nAssistant:\n" + msg.content);
      const calls = msg.tool_calls || [];
      if (calls.length === 0) {
        console.log(`\nRun log: ${logFile}`);
        return;
      }

      for (const call of calls) {
        const safeName = call.function.name;
        const toolName = nameMap.get(safeName) || safeName;
        let toolArgs = {};
        try { toolArgs = JSON.parse(call.function.arguments || "{}"); }
        catch (error) {
          messages.push({ role: "tool", tool_call_id: call.id, content: `Invalid tool JSON: ${error.message}` });
          continue;
        }

        const decision = decideToolCall(toolName, toolArgs, config, approvalMode());
        writeLog(logFile, "tool_decision", { toolName, toolArgs, decision });

        if (!decision.allowed) {
          const content = `BLOCKED by guardrails: ${decision.reason}`;
          console.log(`\n${content}`);
          messages.push({ role: "tool", tool_call_id: call.id, content });
          continue;
        }

        const approved = await approveIfNeeded(rl, approvalMode(), toolName, toolArgs, decision);
        if (!approved) {
          messages.push({ role: "tool", tool_call_id: call.id, content: "User rejected this tool call." });
          continue;
        }

        console.log(`\nCalling Desktop Commander: ${toolName}`);
        const result = await mcp.callTool({ name: toolName, arguments: toolArgs });
        writeLog(logFile, "tool_result", { toolName, toolArgs, result: truncate(result) });
        messages.push({ role: "tool", tool_call_id: call.id, content: truncate(result) });
      }
    }

    console.log(`\nStopped after MAX_AGENT_STEPS=${maxSteps()}. Run log: ${logFile}`);
  } finally {
    rl.close();
    try { await mcp.close(); } catch {}
  }
}

async function doctor() {
  const config = loadConfig();
  console.log("TOC Local Operator doctor\n");
  for (const cmd of ["node --version", "npm --version", "npx --version"]) {
    const result = spawnSync(cmd, { shell: true, encoding: "utf8" });
    console.log(`${result.status === 0 ? "OK" : "FAIL"} ${cmd}: ${(result.stdout || result.stderr || "").trim()}`);
  }
  console.log(`${process.env.OPENAI_API_KEY ? "OK" : "FAIL"} OPENAI_API_KEY ${process.env.OPENAI_API_KEY ? "is set" : "is missing"}`);
  console.log(`Model: ${modelName()}`);
  console.log(`Approval mode: ${approvalMode()}`);
  console.log(`Desktop Commander: ${config.mcp.command} ${config.mcp.args.join(" ")}`);

  const mcp = await connectMcp(config);
  try {
    const tools = (await mcp.listTools()).tools || [];
    console.log(`OK Desktop Commander connected. Tools available: ${tools.length}`);
    for (const tool of tools.slice(0, 20)) console.log(`- ${tool.name}`);
    if (tools.length > 20) console.log(`...and ${tools.length - 20} more`);
  } finally {
    try { await mcp.close(); } catch {}
  }
}

const [mode = "chat", ...args] = process.argv.slice(2);

try {
  if (mode === "doctor") await doctor();
  else if (mode === "chat" || mode === "task") await runAgent(mode, args);
  else throw new Error(`Unknown mode: ${mode}`);
} catch (error) {
  console.error("\nFatal error:");
  console.error(error?.message || error);
  process.exitCode = 1;
}
'@

if (!(Test-Path (Join-Path $Target ".env"))) {
  Copy-Item (Join-Path $Target ".env.example") (Join-Path $Target ".env")
}

Set-Location $Target

Write-Host ""
Write-Host "Installing npm dependencies..."
npm install

Write-Host ""
Write-Host "Created files in: $Target"
Get-ChildItem $Target | Select-Object Name

Write-Host ""
Write-Host "Next steps:"
Write-Host "1. notepad `"$Target\.env`""
Write-Host "2. Paste your OPENAI_API_KEY and save."
Write-Host "3. cd `"$Target`""
Write-Host "4. npm run doctor"
Write-Host "5. .\run-task.ps1"
