<#
.SYNOPSIS
    Zip every git-ignored, non-package path in the repository into one timestamped archive.

.DESCRIPTION
    Collects everything git ignores (via `git ls-files --others --ignored --exclude-standard`),
    drops packages / virtualenvs / build & cache output, and writes a single .zip into the
    repository root.

    This is a pure copy: source files are never moved, modified or truncated, and an existing
    archive is never replaced (the file name carries a timestamp). Running it again simply
    produces a second archive.

    Included : data, model weights, databases, logs, .env files, session archives, ...
    Excluded : node_modules, .venv/venv, __pycache__, .pytest_cache, .next, out/dist/build,
               coverage, *.tsbuildinfo, next-env.d.ts, *.pyc/*.so, and the output zip itself.

.PARAMETER OutputDirectory
    Where to write the zip. Defaults to the repository root.

.PARAMETER Name
    Base name of the archive; the timestamp is appended. Default 'sentinel-gitignored'.

.PARAMETER CompressionLevel
    Optimal (default), Fastest, or NoCompression.

.PARAMETER DryRun
    List what would be archived (and the total size) without writing anything.

.PARAMETER NoGitIgnoreUpdate
    Do not add the archive pattern to the root .gitignore.

.PARAMETER ExcludeExtra
    Extra wildcard patterns (matched against the repo-relative path) to drop.

.EXAMPLE
    ./zip_gitignored.ps1
    ./zip_gitignored.ps1 -DryRun
    ./zip_gitignored.ps1 -Name sentinel-backup -CompressionLevel Fastest
    ./zip_gitignored.ps1 -OutputDirectory D:\backups

.NOTES
    Requires git on PATH. If script execution is blocked, run:
        powershell -ExecutionPolicy Bypass -File .\zip_gitignored.ps1
#>
[CmdletBinding()]
param(
    [string] $OutputDirectory,
    [string] $Name = 'sentinel-gitignored',
    [ValidateSet('Optimal', 'Fastest', 'NoCompression')]
    [string] $CompressionLevel = 'Optimal',
    [switch] $DryRun,
    [switch] $NoGitIgnoreUpdate,
    [string[]] $ExcludeExtra = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Packages / virtualenvs / build & cache output: never archived -----------
$ExcludeDirNames = @(
    'node_modules', '.venv', 'venv', 'ENV', 'env', 'virtualenv',
    'site-packages', 'pip-wheel-metadata',
    '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox',
    '.next', 'out', 'dist', 'build', 'coverage', '.cache', '.turbo',
    '.vercel', '.parcel-cache', '.pnpm-store', '.ipynb_checkpoints', '.eggs'
)
$ExcludeLeafPatterns = @(
    '*.pyc', '*.pyo', '*.pyd', '*.so',
    '*.tsbuildinfo', 'next-env.d.ts', '.DS_Store', 'Thumbs.db', '.pnp.*', '*.egg-info'
)

function Get-RepoRoot {
    $root = & git rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($root -join ''))) {
        throw 'Not inside a git repository (git rev-parse --show-toplevel failed).'
    }
    return (Resolve-Path -LiteralPath ($root -join '').Trim()).Path
}

function Get-RelativePath {
    param([string] $BaseDir, [string] $FullPath)
    $base = $BaseDir.TrimEnd('\', '/') + '\'
    if ($FullPath.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $FullPath.Substring($base.Length)
    }
    throw "Path '$FullPath' is not under '$BaseDir'."
}

function Test-ExcludedPath {
    param([string] $RelativePath)
    $norm = ($RelativePath -replace '\\', '/').TrimStart('/').TrimEnd('/')
    if ([string]::IsNullOrEmpty($norm)) { return $false }

    foreach ($seg in ($norm -split '/')) {
        if ($ExcludeDirNames -contains $seg) { return $true }
    }
    $leaf = ($norm -split '/')[-1]
    foreach ($pat in $ExcludeLeafPatterns) {
        if ($leaf -like $pat) { return $true }
    }
    # Never re-archive our own output.
    if ($leaf -like "$Name-*.zip") { return $true }
    foreach ($pat in $ExcludeExtra) {
        if ($norm -like $pat) { return $true }
    }
    return $false
}

function Format-Size {
    param([long] $Bytes)
    if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0:N2} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N2} KB' -f ($Bytes / 1KB)) }
    return "$Bytes B"
}

# --- Collect -----------------------------------------------------------------
$repoRoot = Get-RepoRoot
if (-not $OutputDirectory) { $OutputDirectory = $repoRoot }
if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
}
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path

Write-Host "Repository : $repoRoot"
Write-Host "Output dir : $OutputDirectory"

$ignored = & git -C $repoRoot ls-files --others --ignored --exclude-standard --directory
$ignored = @($ignored | Where-Object { $_ -and $_.Trim() })

$seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$files = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
$roots = [System.Collections.Generic.List[string]]::new()

foreach ($rel in $ignored) {
    $rel = $rel.Trim()
    if (Test-ExcludedPath $rel) { continue }
    $abs = Join-Path $repoRoot ($rel -replace '/', '\')

    if (Test-Path -LiteralPath $abs -PathType Container) {
        $roots.Add($rel)
        foreach ($item in Get-ChildItem -LiteralPath $abs -Recurse -File -Force) {
            $relFile = Get-RelativePath -BaseDir $repoRoot -FullPath $item.FullName
            if ((Test-ExcludedPath $relFile) -or -not $seen.Add($relFile)) { continue }
            $files.Add($item)
        }
    }
    elseif (Test-Path -LiteralPath $abs -PathType Leaf) {
        $item = Get-Item -LiteralPath $abs -Force
        $relFile = Get-RelativePath -BaseDir $repoRoot -FullPath $item.FullName
        if ((-not (Test-ExcludedPath $relFile)) -and $seen.Add($relFile)) {
            $roots.Add($rel)
            $files.Add($item)
        }
    }
}

$files = @($files | Sort-Object FullName)
$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
if (-not $totalBytes) { $totalBytes = 0 }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipPath = Join-Path $OutputDirectory "$Name-$stamp.zip"

# --- Report ------------------------------------------------------------------
Write-Host ''
Write-Host ('Matched {0} ignored path(s) -> {1} file(s), {2} total' -f `
        $roots.Count, $files.Count, (Format-Size $totalBytes))
Write-Host ('Archive    : {0}' -f $zipPath)
Write-Host ''

if ($DryRun) {
    Write-Host '-- DryRun: nothing written --'
    foreach ($f in $files) {
        '{0,12}  {1}' -f (Format-Size $f.Length), (Get-RelativePath -BaseDir $repoRoot -FullPath $f.FullName) |
            Write-Host
    }
    return
}

if ($files.Count -eq 0) {
    Write-Warning 'Nothing to archive - no ignored, non-package paths matched.'
    return
}

# --- Write the archive (never replaces an existing file) ---------------------
if (Test-Path -LiteralPath $zipPath) {
    throw "Refusing to replace an existing archive: $zipPath"
}

Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
$level = [System.IO.Compression.CompressionLevel]::$CompressionLevel

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($f in $files) {
        $entryName = (Get-RelativePath -BaseDir $repoRoot -FullPath $f.FullName) -replace '\\', '/'
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entryName, $level)
    }
}
finally {
    $zip.Dispose()
}

# --- Keep the archive out of git ---------------------------------------------
$pattern = "$Name-*.zip"
if (-not $NoGitIgnoreUpdate) {
    $gitignore = Join-Path $repoRoot '.gitignore'
    $already = (Test-Path -LiteralPath $gitignore) -and
        ((Get-Content -LiteralPath $gitignore -ErrorAction SilentlyContinue) -contains $pattern)
    if ($already) {
        Write-Host "gitignore  : '$pattern' already ignored"
    }
    else {
        [System.IO.File]::AppendAllText(
            $gitignore,
            "`r`n# Generated by zip_gitignored.ps1 - never commit these.`r`n$pattern`r`n"
        )
        Write-Host "gitignore  : added '$pattern' to $gitignore"
    }
}

$zipSize = (Get-Item -LiteralPath $zipPath).Length
Write-Host ''
Write-Host ('Done. {0} file(s) -> {1} ({2} on disk)' -f `
        $files.Count, (Split-Path -Leaf $zipPath), (Format-Size $zipSize))
