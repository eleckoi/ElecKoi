[CmdletBinding()]
param(
    [string]$DestinationDirectory = (Join-Path $PSScriptRoot 'bundles')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot 'deepseek/DeepSeekRuntimeBuild.psm1') -Force
$definition = Get-DeepSeekRuntimeBuildDefinition -RuntimeRoot $PSScriptRoot
$catalog = Get-DeepSeekCatalogEntry -Definition $definition
$resolvedDestination = [IO.Path]::GetFullPath($DestinationDirectory)
New-Item -ItemType Directory -Force -Path $resolvedDestination | Out-Null
$destinationPrefix = $resolvedDestination.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$target = [IO.Path]::GetFullPath((Join-Path $resolvedDestination $catalog.AssetPath))
if (-not $target.StartsWith($destinationPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'DeepSeek Runtime 下载路径越界'
}

function Test-ExpectedFile {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $item = Get-Item -LiteralPath $Path
    if ($item.Length -le 0 -or $item.Length -gt $catalog.ArchiveBytesLimit) { return $false }
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $catalog.Sha256
}

function Assert-SafeArchive {
    param([Parameter(Mandatory)][string]$Path)
    $entries = @(& tar -tzf $Path)
    if ($LASTEXITCODE -ne 0 -or $entries.Count -eq 0) { throw 'DeepSeek Runtime 不是有效的 tar.gz' }
    foreach ($rawEntry in $entries) {
        $entry = ([string]$rawEntry).Replace('\', '/').TrimEnd('/')
        if ([string]::IsNullOrWhiteSpace($entry) -or $entry -in @('.', './') -or
            $entry.StartsWith('/') -or $entry -match '^[A-Za-z]:' -or
            @($entry -split '/') -contains '..') {
            throw "DeepSeek Runtime 包含不安全路径：$rawEntry"
        }
    }
}

if (Test-ExpectedFile -Path $target) {
    Assert-SafeArchive -Path $target
    Write-Host "复用已验证的 DeepSeek Runtime：$target"
    return
}
if (Test-Path -LiteralPath $target) {
    $existing = Get-Item -LiteralPath $target -Force
    if ($existing.PSIsContainer -or ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "拒绝替换异常的 DeepSeek Runtime 路径：$target"
    }
    Remove-Item -LiteralPath $existing.FullName -Force
}

$partial = "$target.part-$([Guid]::NewGuid().ToString('N'))"
$token = if (-not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)) {
    $env:GH_TOKEN
} elseif (-not [string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
    $env:GITHUB_TOKEN
} else {
    ''
}

try {
    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-Host "下载 DeepSeek Runtime：$($definition.ReleaseUrl)"
        Invoke-WebRequest -Uri $definition.ReleaseUrl -OutFile $partial -MaximumRedirection 8
    } else {
        $headers = @{
            Authorization = "Bearer $token"
            Accept = 'application/vnd.github+json'
            'X-GitHub-Api-Version' = '2022-11-28'
            'User-Agent' = 'ElecKoi-runtime-fetcher'
        }
        $releaseApi = "https://api.github.com/repos/$($definition.ReleaseRepository)/releases/tags/$($definition.ReleaseTag)"
        $release = Invoke-RestMethod -Uri $releaseApi -Headers $headers
        $asset = @($release.assets) | Where-Object { [string]$_.name -eq $definition.BundleName } | Select-Object -First 1
        if ($null -eq $asset) { throw "GitHub Release 缺少资产：$($definition.BundleName)" }
        $headers.Accept = 'application/octet-stream'
        Write-Host "从受认证的 GitHub Release 下载：$($definition.BundleName)"
        Invoke-WebRequest -Uri ([string]$asset.url) -Headers $headers -OutFile $partial -MaximumRedirection 8
    }

    $length = (Get-Item -LiteralPath $partial).Length
    if ($length -le 0 -or $length -gt $catalog.ArchiveBytesLimit) {
        throw "DeepSeek Runtime 大小超过安全限制：$length"
    }
    $actualHash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $catalog.Sha256) {
        throw "DeepSeek Runtime SHA-256 不匹配：$actualHash"
    }
    Assert-SafeArchive -Path $partial
    Move-Item -LiteralPath $partial -Destination $target
    Write-Host "已准备 DeepSeek Runtime：$target ($length bytes)"
} finally {
    if (Test-Path -LiteralPath $partial -PathType Leaf) {
        Remove-Item -LiteralPath $partial -Force
    }
}
