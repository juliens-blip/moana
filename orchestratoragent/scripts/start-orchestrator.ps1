[CmdletBinding()]
param(
  [string]$ProjectDir = (Get-Location).Path,
  [ValidateSet('claude','amp','antigravity','codex')]
  [string]$Orchestrator = 'codex',
  [switch]$NoAttach
)

function Convert-ToWslPath {
  param([string]$Path)
  $full = (Resolve-Path -LiteralPath $Path).Path
  if ($full -match '^[A-Za-z]:') {
    $drive = $full.Substring(0, 1).ToLower()
    $rest = $full.Substring(2) -replace '\\','/'
    return "/mnt/$drive$rest"
  }
  return $full -replace '\\','/'
}

if (-not (Test-Path $ProjectDir)) {
  Write-Error "Project not found: $ProjectDir"
  exit 1
}

$scriptWsl = "/mnt/c/Users/beatr/moana/orchestratoragent/scripts/start-orchestrator.sh"
$projectWsl = Convert-ToWslPath $ProjectDir
$projectName = Split-Path -Leaf $ProjectDir
$sessionName = "orchestration-$projectName"

$cmd = "bash $scriptWsl --orchestrator $Orchestrator '$projectWsl'"
& wsl -e bash -lc $cmd

if (-not $NoAttach) {
  & wsl tmux attach -t $sessionName
}
