<#
.SYNOPSIS
    Counts lines of code (LOC), comments, and blank lines across the repository.

.DESCRIPTION
    Scans the repository and outputs a structured breakdown by language/file type
    and directory, distinguishing between pure code (SLOC), comments, and blank lines.

.PARAMETER TargetPath
    Path to scan (defaults to repository root).

.PARAMETER ByDirectory
    Switch to display breakdown by top-level directory.

.PARAMETER NoDir
    Switch to disable directory breakdown.

.PARAMETER Help
    Show help documentation.

.EXAMPLE
    .\scripts\loc.ps1
    .\scripts\loc.ps1 src
    .\scripts\loc.ps1 -ByDirectory
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$TargetPath = "",

    [switch]$ByDirectory,
    [switch]$NoDir,
    [switch]$Help
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeScript = Join-Path $ScriptDir "loc.mjs"

if ($Help) {
    if (Test-Path $NodeScript) {
        node $NodeScript --help
    } else {
        Get-Help $MyInvocation.MyCommand.Path -Detailed
    }
    exit 0
}

# If node is available and loc.mjs exists, delegate to high-performance runner
if (Test-Path $NodeScript) {
    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeArgs = @($NodeScript)
        if (-not [string]::IsNullOrWhiteSpace($TargetPath)) {
            $nodeArgs += $TargetPath
        }
        if ($ByDirectory) {
            $nodeArgs += "--by-dir"
        }
        if ($NoDir) {
            $nodeArgs += "--no-dir"
        }
        & node $nodeArgs
        exit $LASTEXITCODE
    }
}

# Fallback: Pure PowerShell LOC counter
$RepoRoot = if (Test-Path (Join-Path $ScriptDir "..\package.json")) {
    (Resolve-Path (Join-Path $ScriptDir "..")).Path
} else {
    (Get-Location).Path
}

$ScanPath = if ([string]::IsNullOrWhiteSpace($TargetPath)) {
    $RepoRoot
} elseif ([System.IO.Path]::IsPathRooted($TargetPath)) {
    $TargetPath
} else {
    Join-Path (Get-Location).Path $TargetPath
}

if (-not (Test-Path $ScanPath)) {
    Write-Error "Path not found: $ScanPath"
    exit 1
}

$ScanPath = (Resolve-Path $ScanPath).Path

$ExcludeDirs = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@("node_modules", "dist", ".git", ".shots", ".tmp-screenshots", ".claude", ".gemini", ".vscode", ".idea", "coverage", "build") | ForEach-Object { [void]$ExcludeDirs.Add($_) }

$ExcludeFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@("package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb") | ForEach-Object { [void]$ExcludeFiles.Add($_) }

$BinaryExts = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(".glb", ".gltf", ".bin", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico",
  ".svg", ".mp3", ".wav", ".ogg", ".zip", ".tar", ".gz", ".7z", ".pdf",
  ".log", ".exe", ".dll", ".so", ".dylib", ".woff", ".woff2", ".ttf", ".eot") | ForEach-Object { [void]$BinaryExts.Add($_) }

$LangMap = @{
    ".ts"    = @{ Name = "TypeScript"; Category = "Code" }
    ".tsx"   = @{ Name = "TypeScript React"; Category = "Code" }
    ".d.ts"  = @{ Name = "TypeScript Decl"; Category = "Code" }
    ".js"    = @{ Name = "JavaScript"; Category = "Code" }
    ".jsx"   = @{ Name = "JavaScript React"; Category = "Code" }
    ".mjs"   = @{ Name = "JavaScript ESM"; Category = "Code" }
    ".cjs"   = @{ Name = "JavaScript CJS"; Category = "Code" }
    ".css"   = @{ Name = "CSS"; Category = "Code" }
    ".scss"  = @{ Name = "SCSS"; Category = "Code" }
    ".sass"  = @{ Name = "Sass"; Category = "Code" }
    ".less"  = @{ Name = "Less"; Category = "Code" }
    ".html"  = @{ Name = "HTML"; Category = "Code" }
    ".htm"   = @{ Name = "HTML"; Category = "Code" }
    ".glsl"  = @{ Name = "GLSL Shader"; Category = "Code" }
    ".vert"  = @{ Name = "GLSL Vertex"; Category = "Code" }
    ".frag"  = @{ Name = "GLSL Fragment"; Category = "Code" }
    ".wgsl"  = @{ Name = "WGSL Shader"; Category = "Code" }
    ".ps1"   = @{ Name = "PowerShell"; Category = "Script" }
    ".sh"    = @{ Name = "Shell / Bash"; Category = "Script" }
    ".bat"   = @{ Name = "Batch Script"; Category = "Script" }
    ".cmd"   = @{ Name = "Batch Script"; Category = "Script" }
    ".json"  = @{ Name = "JSON"; Category = "Data/Config" }
    ".yaml"  = @{ Name = "YAML"; Category = "Data/Config" }
    ".yml"   = @{ Name = "YAML"; Category = "Data/Config" }
    ".toml"  = @{ Name = "TOML"; Category = "Data/Config" }
    ".xml"   = @{ Name = "XML"; Category = "Data/Config" }
    ".md"    = @{ Name = "Markdown"; Category = "Docs" }
    ".txt"   = @{ Name = "Plain Text"; Category = "Docs" }
}

$FilesToProcess = [System.Collections.Generic.List[string]]::new()

function Scan-Dir([string]$dir) {
    $dirInfo = [System.IO.DirectoryInfo]::new($dir)
    foreach ($sub in $dirInfo.EnumerateDirectories()) {
        if (-not $ExcludeDirs.Contains($sub.Name)) {
            Scan-Dir $sub.FullName
        }
    }
    foreach ($f in $dirInfo.EnumerateFiles()) {
        if ($ExcludeFiles.Contains($f.Name)) { continue }
        if ($BinaryExts.Contains($f.Extension)) { continue }
        if ($f.Name.StartsWith(".vite-") -and $f.Name.EndsWith(".log")) { continue }
        $FilesToProcess.Add($f.FullName)
    }
}

Scan-Dir $ScanPath

$LangStats = [System.Collections.Generic.Dictionary[string, hashtable]]::new([System.StringComparer]::OrdinalIgnoreCase)
$DirStats  = [System.Collections.Generic.Dictionary[string, hashtable]]::new([System.StringComparer]::OrdinalIgnoreCase)

$GrandFiles = 0; $GrandLines = 0; $GrandBlank = 0; $GrandComment = 0; $GrandCode = 0
$trimChars = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)

foreach ($filePath in $FilesToProcess) {
    $fileName = [System.IO.Path]::GetFileName($filePath)
    $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
    if ($fileName.EndsWith(".d.ts", [System.StringComparison]::OrdinalIgnoreCase)) {
        $ext = ".d.ts"
    }
    if ([string]::IsNullOrEmpty($ext)) {
        $ext = "(no ext)"
    }

    $langInfo = if ($LangMap.ContainsKey($ext)) { $LangMap[$ext] } else { @{ Name = "Other ($ext)"; Category = "Other" } }

    $rel = if ($filePath.Length -gt $ScanPath.Length) {
        $filePath.Substring($ScanPath.Length).TrimStart($trimChars)
    } else {
        $fileName
    }
    $parts = $rel.Split($trimChars, [System.StringSplitOptions]::RemoveEmptyEntries)
    $topDir = if ($parts.Length -gt 1) { $parts[0] + "/" } else { "(root)" }

    $fTotal = 0; $fBlank = 0; $fComment = 0; $fCode = 0
    $inBlock = $false
    $isHtmlOrXml   = ($ext -in @(".html", ".htm", ".xml", ".svg"))
    $isShellOrYaml = ($ext -in @(".sh", ".ps1", ".yaml", ".yml", ".toml"))
    $isBatch       = ($ext -in @(".bat", ".cmd"))

    try {
        $reader = [System.IO.File]::OpenText($filePath)
        while (($line = $reader.ReadLine()) -ne $null) {
            $fTotal++
            $trimmed = $line.Trim()
            if ($trimmed.Length -eq 0) {
                $fBlank++
                continue
            }
            if ($inBlock) {
                $fComment++
                if ($isHtmlOrXml -and $trimmed.Contains("-->")) { $inBlock = $false }
                elseif (-not $isHtmlOrXml -and $trimmed.Contains("*/")) { $inBlock = $false }
                continue
            }
            if ($isHtmlOrXml -and $trimmed.StartsWith("<!--")) {
                $fComment++
                if (-not $trimmed.Contains("-->") -or $trimmed.IndexOf("-->") -eq $trimmed.IndexOf("<!--")) { $inBlock = $true }
                continue
            }
            if (-not $isShellOrYaml -and -not $isBatch -and $trimmed.StartsWith("/*")) {
                $fComment++
                if (-not $trimmed.Contains("*/") -or $trimmed.IndexOf("*/") -eq $trimmed.IndexOf("/*")) { $inBlock = $true }
                continue
            }
            if ($trimmed.StartsWith("//") -or 
                ($isShellOrYaml -and $trimmed.StartsWith("#")) -or
                ($isBatch -and ($trimmed.ToUpperInvariant().StartsWith("REM") -or $trimmed.StartsWith("::")))) {
                $fComment++
                continue
            }
            $fCode++
        }
        $reader.Dispose()
    } catch {
        continue
    }

    $lName = $langInfo.Name
    if (-not $LangStats.ContainsKey($lName)) {
        $LangStats[$lName] = @{ Name = $langInfo.Name; Category = $langInfo.Category; Extension = $ext; Files = 0; Lines = 0; Blank = 0; Comment = 0; Code = 0 }
    }
    $LangStats[$lName].Files += 1; $LangStats[$lName].Lines += $fTotal; $LangStats[$lName].Blank += $fBlank; $LangStats[$lName].Comment += $fComment; $LangStats[$lName].Code += $fCode

    if (-not $DirStats.ContainsKey($topDir)) {
        $DirStats[$topDir] = @{ Directory = $topDir; Files = 0; Lines = 0; Blank = 0; Comment = 0; Code = 0 }
    }
    $DirStats[$topDir].Files += 1; $DirStats[$topDir].Lines += $fTotal; $DirStats[$topDir].Blank += $fBlank; $DirStats[$topDir].Comment += $fComment; $DirStats[$topDir].Code += $fCode

    $GrandFiles++; $GrandLines += $fTotal; $GrandBlank += $fBlank; $GrandComment += $fComment; $GrandCode += $fCode
}

Write-Output ""
Write-Output "================================================================================"
Write-Output "  LINES OF CODE (LOC) REPORT: $(Split-Path $ScanPath -Leaf)"
Write-Output "  Path: $ScanPath"
Write-Output "================================================================================"
Write-Output ""
Write-Output ("{0,-22} {1,-12} {2,7} {3,10} {4,9} {5,9} {6,11} {7,7}" -f "Language", "Category", "Files", "Lines", "Blank", "Comment", "Code(SLOC)", "% Code")
Write-Output ("-" * 91)

$sortedLangs = $LangStats.Values | Sort-Object -Property { $_.Code } -Descending
foreach ($item in $sortedLangs) {
    $pct = if ($GrandCode -gt 0) { "{0:N1}%" -f (($item.Code / $GrandCode) * 100) } else { "0.0%" }
    Write-Output ("{0,-22} {1,-12} {2,7:N0} {3,10:N0} {4,9:N0} {5,9:N0} {6,11:N0} {7,7}" -f `
        $item.Name, $item.Category, $item.Files, $item.Lines, $item.Blank, $item.Comment, $item.Code, $pct)
}

Write-Output ("-" * 91)
Write-Output ("{0,-22} {1,-12} {2,7:N0} {3,10:N0} {4,9:N0} {5,9:N0} {6,11:N0} {7,7}" -f `
    "TOTAL", "", $GrandFiles, $GrandLines, $GrandBlank, $GrandComment, $GrandCode, "100.0%")

if (-not $NoDir) {
    Write-Output ""
    Write-Output "--------------------------------------------------------------------------------"
    Write-Output "  BREAKDOWN BY DIRECTORY"
    Write-Output "--------------------------------------------------------------------------------"
    Write-Output ("{0,-22} {1,7} {2,10} {3,9} {4,9} {5,11} {6,7}" -f "Directory", "Files", "Lines", "Blank", "Comment", "Code(SLOC)", "% Code")
    Write-Output ("-" * 79)

    $sortedDirs = $DirStats.Values | Sort-Object -Property { $_.Code } -Descending
    foreach ($item in $sortedDirs) {
        $pct = if ($GrandCode -gt 0) { "{0:N1}%" -f (($item.Code / $GrandCode) * 100) } else { "0.0%" }
        Write-Output ("{0,-22} {1,7:N0} {2,10:N0} {3,9:N0} {4,9:N0} {5,11:N0} {6,7}" -f `
            $item.Directory, $item.Files, $item.Lines, $item.Blank, $item.Comment, $item.Code, $pct)
    }
    Write-Output ("-" * 79)
}

$srcCodeOnly  = ($sortedLangs | Where-Object { $_.Category -in @("Code", "Script") } | Measure-Object -Property { $_.Code } -Sum).Sum
$srcLinesOnly = ($sortedLangs | Where-Object { $_.Category -in @("Code", "Script") } | Measure-Object -Property { $_.Lines } -Sum).Sum
$docsLines    = ($sortedLangs | Where-Object { $_.Category -eq "Docs" } | Measure-Object -Property { $_.Lines } -Sum).Sum

Write-Output ""
Write-Output "Summary:"
Write-Output ("  * Pure Source Code (SLOC):  {0,8:N0} lines (TypeScript, JavaScript, CSS, HTML, Scripts)" -f $srcCodeOnly)
Write-Output ("  * Total Source Lines:       {0,8:N0} lines (including comments & blank lines)" -f $srcLinesOnly)
Write-Output ("  * Documentation Lines:      {0,8:N0} lines (Markdown & text docs)" -f $docsLines)
Write-Output ("  * Grand Total Repo Lines:   {0,8:N0} lines across {1:N0} files" -f $GrandLines, $GrandFiles)
Write-Output "================================================================================"
Write-Output ""
