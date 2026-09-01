[CmdletBinding()]
param(
    [string]$StageRoot = '',
    [string]$CacheRoot = '',
    [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$packageVersion = '20260601~24.04.1'
$packageName = "ca-certificates_${packageVersion}_all.deb"
$packageUrl = "https://security.ubuntu.com/ubuntu/pool/main/c/ca-certificates/$packageName"
$packageSha256 = '6bac2a01979e210d9eac1d4d56747ec709ea60654744d66705dc3c36e7629e50'

if ([string]::IsNullOrWhiteSpace($CacheRoot)) {
    $CacheRoot = Join-Path $PSScriptRoot '.cache/deepseek-build/offline-ca'
}

function Get-LowerSha256 {
    param([Parameter(Mandatory)][string]$LiteralPath)
    $stream = [System.IO.File]::OpenRead($LiteralPath)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter()][string[]]$ArgumentList = @()
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $FilePath $($ArgumentList -join ' ')"
    }
}

New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
$cachedPackage = Join-Path $CacheRoot $packageName
if (-not (Test-Path -LiteralPath $cachedPackage -PathType Leaf) -or
    (Get-LowerSha256 -LiteralPath $cachedPackage) -ne $packageSha256) {
    $partialPackage = "$cachedPackage.part"
    Remove-Item -LiteralPath $partialPackage -Force -ErrorAction SilentlyContinue
    Write-Host "Downloading pinned Ubuntu CA package $packageVersion"
    Invoke-WebRequest -Uri $packageUrl -OutFile $partialPackage -MaximumRedirection 8
    $downloadHash = Get-LowerSha256 -LiteralPath $partialPackage
    if ($downloadHash -ne $packageSha256) {
        Remove-Item -LiteralPath $partialPackage -Force
        throw "Ubuntu CA package SHA-256 mismatch: $downloadHash"
    }
    Move-Item -LiteralPath $partialPackage -Destination $cachedPackage -Force
}

if (-not $IsLinux) { throw '离线 CA 准备只支持 Linux GitHub Actions runner' }
$nativeDpkg = Get-Command 'dpkg-deb' -ErrorAction Stop

if ($PreflightOnly) {
    [pscustomobject]@{
        Package = $packageName
        SourceUrl = $packageUrl
        Sha256 = $packageSha256
        CachedPath = $cachedPackage
    } | Format-List
    return
}

if ([string]::IsNullOrWhiteSpace($StageRoot) -or
    -not (Test-Path -LiteralPath $StageRoot -PathType Container)) {
    throw 'StageRoot must be an existing runtime package directory.'
}

$resolvedStageRoot = (Resolve-Path -LiteralPath $StageRoot).Path
$temporaryRoot = Join-Path $CacheRoot ("ca-stage-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
try {
    Copy-Item -LiteralPath $cachedPackage -Destination (Join-Path $temporaryRoot $packageName)
    $certificateStage = Join-Path (Join-Path $resolvedStageRoot 'runtime-resources') 'ca-certificates'
    New-Item -ItemType Directory -Force -Path $certificateStage | Out-Null
    $bundlePath = Join-Path $certificateStage 'ca-certificates.crt'

    $extractedRoot = Join-Path $temporaryRoot 'extracted'
    New-Item -ItemType Directory -Force -Path $extractedRoot | Out-Null
    Invoke-Native -FilePath $nativeDpkg.Source -ArgumentList @('-x', $cachedPackage, $extractedRoot)

    $mozillaRoot = Join-Path $extractedRoot 'usr/share/ca-certificates/mozilla'
    $certificatePaths = [string[]]@(Get-ChildItem -LiteralPath $mozillaRoot -File -Filter '*.crt' |
        ForEach-Object FullName)
    [System.Array]::Sort($certificatePaths, [System.StringComparer]::Ordinal)
    if ($certificatePaths.Count -lt 100) {
        throw "Ubuntu CA package contains too few certificates: $($certificatePaths.Count)"
    }
    $bundleStream = [System.IO.File]::Create($bundlePath)
    try {
        foreach ($certificatePath in $certificatePaths) {
            $certificateStream = [System.IO.File]::OpenRead($certificatePath)
            try {
                $certificateStream.CopyTo($bundleStream)
            }
            finally {
                $certificateStream.Dispose()
            }
        }
    }
    finally {
        $bundleStream.Dispose()
    }
    Copy-Item -LiteralPath (Join-Path $extractedRoot 'usr/share/doc/ca-certificates/copyright') `
        -Destination (Join-Path $certificateStage 'copyright')
    $certificateCount = $certificatePaths.Count

    $sourceMetadata = [ordered]@{
        package = 'ca-certificates'
        version = $packageVersion
        sourceUrl = $packageUrl
        sourceSha256 = $packageSha256
        certificateCount = $certificateCount
    } | ConvertTo-Json
    $metadataPath = Join-Path $certificateStage 'source.json'
    [System.IO.File]::WriteAllText(
        $metadataPath,
        "$sourceMetadata`n",
        [System.Text.UTF8Encoding]::new($false)
    )

    [pscustomobject]@{
        PackageVersion = $packageVersion
        CertificateCount = $certificateCount
        BundleBytes = (Get-Item -LiteralPath $bundlePath).Length
        BundleSha256 = Get-LowerSha256 -LiteralPath $bundlePath
    } | Format-List
}
finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        $resolvedTemporaryRoot = (Resolve-Path -LiteralPath $temporaryRoot).Path
        $resolvedCacheRoot = (Resolve-Path -LiteralPath $CacheRoot).Path
        $expectedTemporaryPrefix = Join-Path $resolvedCacheRoot 'ca-stage-'
        if (-not $resolvedTemporaryRoot.StartsWith(
            $expectedTemporaryPrefix,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
            throw "Refusing to remove unexpected CA staging path: $resolvedTemporaryRoot"
        }
        Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
    }
}
