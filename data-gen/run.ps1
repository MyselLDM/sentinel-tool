<#
.SYNOPSIS
  Generate the full Sentinel triplet dataset - 8 domains x 50 anchors x 12 policies = 4,800.

.EXAMPLE
  ./run.ps1                       # full run against 127.0.0.1:8081
  ./run.ps1 -Fresh                # wipe data/ and start over
  ./run.ps1 -Domain federal       # one domain only (handy for sharding)
  ./run.ps1 -Policy P-06          # one policy only (handy for sharding)
  ./run.ps1 -Anchors 1            # 22 items per domain - smoke-test the harness
  ./run.ps1 -Samples 1            # one negative per (anchor, policy) cell
  ./run.ps1 -MaxPasses 5          # keep chasing the dropped items longer
  ./run.ps1 -SeedBase 100         # re-roll everything from a different seed family

.DESCRIPTION
  Drives data-gen/prompt.py against a local OpenAI-compatible llama-server.

  The run is long - roughly 5,200 inferences and several hours - and it is
  resumable: prompt.py appends every completed inference to triplets.jsonl, so
  an interrupt costs at most one item. This script therefore always runs with
  --resume, so simply running it again continues where it left off.
  Use -Fresh to deliberately start over.

  A few (anchor, policy) pairs have no natural violation (e.g. P-07 temporal
  expansion for a one-off action). prompt.py regenerates on every rejection up to
  -Retries times, then drops the item with a loud ERROR on stderr rather than
  writing a mislabelled row. The script keeps making passes until one records
  nothing new or -MaxPasses runs out. -MaxPasses is a CEILING, not a pass count:
  a pass that adds nothing stops the loop, and each pass only re-attempts the
  items still missing, so extra passes are cheap once converged. Each pass also
  bumps --seed-base, so retries sample differently rather than repeating.

  Output (default data/):
    triplets.jsonl   one JSON record per inference - the resumable ledger
    triplets.json    the aggregate, rewritten at the end of each pass
    positives.jsonl  cached benign subtask per (domain, anchor)
    run.log          everything below, for later inspection

.NOTES
  Requires Python 3.10+ on PATH and a running llama-server.
  If script execution is blocked, run:
    powershell -ExecutionPolicy Bypass -File .\run.ps1
#>
[CmdletBinding()]
param(
  [string] $Endpoint = 'http://127.0.0.1:8081/v1/chat/completions',
  [string] $Model    = 'qwen2.5-14b-instruct',
  [string] $OutDir   = 'data',
  [string] $Domain   = 'all',
  [string] $Policy   = 'all',
  [int]    $Anchors  = 0,
  [int]    $Samples  = 2,
  [int]    $Retries  = 50,
  [int]    $MaxPasses = 3,
  [int]    $SeedBase = 0,
  [switch] $Fresh
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
# PowerShell's location and the .NET process directory are separate; sync them so
# relative paths behave the same for cmdlets, [System.IO] and child processes.
[Environment]::CurrentDirectory = $PSScriptRoot

# prompt.py prints box-drawing progress glyphs; without this Windows PowerShell
# renders them as mojibake.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# All paths absolute: the script must behave identically however it is invoked.
$OutDirPath = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $PSScriptRoot $OutDir }
$ExpectedTotal = 0
$TripletsJsonl = Join-Path $OutDirPath 'triplets.jsonl'
$TripletsJson  = Join-Path $OutDirPath 'triplets.json'
$PositivesJsonl = Join-Path $OutDirPath 'positives.jsonl'
$LogPath       = Join-Path $OutDirPath 'run.log'

function Get-RecordCount {
  if (-not (Test-Path -LiteralPath $TripletsJsonl)) { return 0 }
  return (Get-Content -LiteralPath $TripletsJsonl | Measure-Object -Line).Lines
}

function Format-PathSafe([string] $Path) {
  try { return (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path } catch { return $Path }
}

# --- Preflight -------------------------------------------------------------
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw 'python not found on PATH (Python 3.10+ required).'
}

New-Item -ItemType Directory -Force -Path $OutDirPath | Out-Null

# How many triplets this scope should produce - also validates the names.
# NOTE: single quotes in the python below - PowerShell strips embedded double
# quotes when handing an argument to a native executable. And avoid a colon
# straight after an interpolated $var - PowerShell lexes "$var:" as a variable
# reference and fails to parse the script.
$domainArg = if ($Domain -and $Domain -ne 'all') { $Domain } else { 'all' }
$policyArg = if ($Policy -and $Policy -ne 'all') { $Policy } else { 'all' }
$counter = @"
import anchors, prompt
doms = [d for d in prompt.DOMAINS if '$domainArg' == 'all' or d[0] == '$domainArg']
count = 0
for key, _ in doms:
    total = len(getattr(anchors, 'anchors_' + key))
    count += (min($Anchors, total) if $Anchors else total)
policies = 1 if '$policyArg' != 'all' else len(prompt.POLICIES)
if '$policyArg' != 'all' and '$policyArg' not in [p['id'] for p in prompt.POLICIES]:
    raise SystemExit('unknown policy')
print(count * policies * $Samples)
"@
$scopeOut = @(& python -c $counter)
$scopeText = $scopeOut | Select-Object -Last 1
if (-not $scopeText) {
  throw "Could not determine the scope for -Domain '$Domain' -Policy '$Policy'. Check the names."
}
$ExpectedTotal = [int]("$scopeText".Trim())
if ($ExpectedTotal -le 0) {
  throw "Nothing to generate for -Domain '$Domain' (no such domain?), -Anchors $Anchors."
}

$ModelsUrl = $Endpoint -replace '/chat/completions.*$', '/models'
Write-Host "==> Checking llama-server"
Write-Host "    endpoint : $Endpoint"
try {
  Invoke-RestMethod -Uri $ModelsUrl -TimeoutSec 10 | Out-Null
} catch {
  throw "llama-server is not reachable at $ModelsUrl - $($_.Exception.Message). Start it, then re-run."
}

# A /v1/models reply is not proof that chat completions work; smoke-test it.
try {
  $smoke = @{
    model      = $Model
    messages   = @(@{ role = 'user'; content = 'ping' })
    max_tokens = 1
    stream     = $false
  } | ConvertTo-Json -Depth 6
  Invoke-RestMethod -Uri $Endpoint -Method Post -ContentType 'application/json' `
    -Body $smoke -TimeoutSec 60 | Out-Null
} catch {
  throw "The endpoint answered /v1/models but rejected a chat completion: $($_.Exception.Message)"
}
Write-Host '    server OK'

if ($Fresh) {
  Write-Host '==> -Fresh: clearing previous output'
  foreach ($f in @($TripletsJsonl, $TripletsJson, $PositivesJsonl, $LogPath)) {
    Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
  }
}

if ($Domain -and $Domain -ne 'all') {
  Write-Host "==> Domain filter: $Domain"
}
if ($Policy -and $Policy -ne 'all') {
  Write-Host "==> Policy filter: $Policy"
}

# --- Passes ----------------------------------------------------------------
$started  = Get-Date
$previous = Get-RecordCount
Write-Host "==> $previous / $ExpectedTotal records already on disk"

$pass = 0
while ($pass -lt $MaxPasses) {
  $pass++
  $before = Get-RecordCount
  if ($before -ge $ExpectedTotal) { break }

  Write-Host ''
  Write-Host "==> Pass $pass of $MaxPasses  ($before / $ExpectedTotal recorded)"

  $pyArgs = @(
    'prompt.py', '--resume',
    '--endpoint', $Endpoint,
    '--model',    $Model,
    '--out-dir',  $OutDirPath,
    '--retries',  $Retries
  )
  if ($Domain -and $Domain -ne 'all') { $pyArgs += @('--domain', $Domain) }
  if ($Policy -and $Policy -ne 'all') { $pyArgs += @('--policy', $Policy) }
  if ($Anchors -gt 0) { $pyArgs += @('--anchors', $Anchors) }
  $pyArgs += @('--samples', $Samples)
  # Bump the seed base each pass. Without this every pass re-rolls a dropped item
  # with the SAME seed and temperature, so it only differs by chance (the server
  # is not bit-reproducible). This makes each pass genuinely new sampling.
  $pyArgs += @('--seed-base', ($SeedBase + $pass - 1))

  # Tee-Object writes UTF-16LE on Windows PowerShell 5.1 and mangles the
  # progress glyphs, so stream to the log ourselves as UTF-8 (no BOM).
  # A stderr line from python becomes a NativeCommandError, and under
  # $ErrorActionPreference = 'Stop' that aborts the ENTIRE run - which is what
  # killed a job the moment an item was dropped. Relax it for the duration of
  # the call so nothing the model server or prompt.py prints can stop the job.
  $ErrorActionPreference = 'Continue'
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  $writer = [System.IO.StreamWriter]::new($LogPath, $true, $utf8)
  $writer.AutoFlush = $true
  try {
    & python -u @pyArgs 2>&1 | ForEach-Object {
      Write-Host $_
      $writer.WriteLine([string]$_)
    }
  } finally {
    $writer.Dispose()
    $ErrorActionPreference = 'Stop'
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "prompt.py exited with code $LASTEXITCODE (progress is saved; re-run to continue)."
  }

  $after = Get-RecordCount
  Write-Host "    pass $pass complete: $before -> $after records"

  if ($after -le $before) {
    Write-Host '==> No new records this pass - the remainder have no natural violation. Stopping.'
    break
  }
}

# --- Summary ---------------------------------------------------------------
$final    = Get-RecordCount
$elapsed  = (Get-Date) - $started
$pct      = if ($ExpectedTotal -gt 0) { [math]::Round(100 * $final / $ExpectedTotal, 1) } else { 0 }

Write-Host ''
Write-Host '============================================================'
Write-Host ("==> Done: {0} / {1} triplets ({2}%) in {3:hh\:mm\:ss}" -f $final, $ExpectedTotal, $pct, $elapsed)
Write-Host "    ledger : $(Format-PathSafe $TripletsJsonl)"
Write-Host "    json   : $(Format-PathSafe $TripletsJson)"
Write-Host "    log    : $(Format-PathSafe $LogPath)"
if ($final -lt $ExpectedTotal) {
  Write-Host "    missing: $($ExpectedTotal - $final) (re-run, or raise -MaxPasses, to retry them)"
}
Write-Host '============================================================'

exit $(if ($final -ge $ExpectedTotal) { 0 } else { 1 })
