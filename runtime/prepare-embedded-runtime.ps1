[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runtimeRoot = Split-Path -Parent $PSCommandPath
$catalogPath = Join-Path $runtimeRoot 'catalog\runtime-catalog.json'
$bundleRoot = Join-Path $runtimeRoot 'bundles'
$deepSeekFetcher = Join-Path $runtimeRoot 'fetch-verified-deepseek-runtime.ps1'
$catalog = Get-Content -Raw -LiteralPath $catalogPath | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null
$resolvedBundleRoot = [IO.Path]::GetFullPath($bundleRoot)
$bundleRootPrefix = $resolvedBundleRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Remove-VerifiedRuntimeFile {
    param([Parameter(Mandatory)][string]$Path)

    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer) { throw "Refusing to remove runtime directory: $Path" }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing to remove runtime reparse point: $Path"
    }
    Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop
}

$components = @($catalog.rootfs) + @($catalog.harnesses.PSObject.Properties | ForEach-Object { $_.Value })
foreach ($component in $components) {
    $assetPath = [string]$component.assetPath
    if ([string]::IsNullOrWhiteSpace($assetPath)) {
        throw "Runtime component '$($component.kind)' does not declare assetPath"
    }
    if ($assetPath -notmatch '^[A-Za-z0-9._/-]{1,240}$' -or $assetPath.Contains('\')) {
        throw "Runtime component '$($component.kind)' has an unsafe assetPath: $assetPath"
    }
    $segments = @($assetPath -split '/')
    if ($segments | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_ -in @('.', '..') }) {
        throw "Runtime component '$($component.kind)' has an unsafe assetPath: $assetPath"
    }
    $target = [IO.Path]::GetFullPath((Join-Path $resolvedBundleRoot $assetPath))
    if (-not $target.StartsWith($bundleRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Runtime asset path escaped the bundle directory: $target"
    }
    $expectedHash = ([string]$component.sha256).ToLowerInvariant()
    if (Test-Path -LiteralPath $target) {
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
        if ($actualHash -eq $expectedHash) {
            Write-Host "Verified existing $($component.assetPath)"
            continue
        }
        $canFetchPinnedRelease = $component.kind -eq 'deepseek-harness-single-executable'
        if ($component.embeddedOnly -eq $true -and -not $canFetchPinnedRelease) {
            throw "Embedded-only runtime asset is invalid: $assetPath. Rebuild it with its pinned build script."
        }
        Remove-VerifiedRuntimeFile -Path $target
    }

    if ($component.embeddedOnly -eq $true) {
        if ($component.kind -eq 'deepseek-harness-single-executable') {
            & $deepSeekFetcher -DestinationDirectory $bundleRoot
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            continue
        }
        throw "Embedded-only runtime asset is missing or invalid: $($component.assetPath). Build the pinned ElecKoi Harness runtime."
    }

    $partial = "$target.part"
    if (Test-Path -LiteralPath $partial) { Remove-VerifiedRuntimeFile -Path $partial }
    Write-Host "Downloading $($component.kind) from $($component.url)"
    Invoke-WebRequest -Uri $component.url -OutFile $partial -MaximumRedirection 8
    $length = (Get-Item -LiteralPath $partial).Length
    if ($length -gt [long]$component.archiveBytesLimit) {
        Remove-VerifiedRuntimeFile -Path $partial
        throw "Runtime archive exceeds archiveBytesLimit: $length"
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $partial).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        Remove-VerifiedRuntimeFile -Path $partial
        throw "SHA-256 mismatch for $($component.assetPath): $actualHash"
    }
    Move-Item -LiteralPath $partial -Destination $target
    Write-Host "Prepared $($component.assetPath) ($length bytes)"
}
