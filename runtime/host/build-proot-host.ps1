[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$NdkRoot
)

$ErrorActionPreference = 'Stop'
$cacheRoot = Join-Path $PSScriptRoot '.cache'
$outputRoot = Join-Path $RepositoryRoot 'app\src\main\jniLibs\arm64-v8a'
$lockPath = Join-Path $PSScriptRoot 'source-lock.json'
$lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $cacheRoot, $outputRoot | Out-Null

function Get-VerifiedFile {
    param([string]$Url, [string]$Sha256, [string]$Destination)
    if (-not (Test-Path -LiteralPath $Destination)) {
        Invoke-WebRequest -Uri $Url -OutFile $Destination
    }
    $actual = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Sha256) {
        throw "SHA-256 mismatch for $Destination. Expected $Sha256, got $actual"
    }
}

function Get-XzExecutable {
    $command = Get-Command xz.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $gitXz = 'C:\Program Files\Git\mingw64\bin\xz.exe'
    if (Test-Path -LiteralPath $gitXz) { return $gitXz }
    throw 'xz.exe is required to unpack the pinned Termux .deb files.'
}

function Get-PatchExecutable {
    $command = Get-Command patch.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $gitPatch = 'C:\Program Files\Git\usr\bin\patch.exe'
    if (Test-Path -LiteralPath $gitPatch) { return $gitPatch }
    throw 'patch.exe is required to apply the pinned libandroid-shmem source patch.'
}

function Resolve-AndroidNdkRoot {
    param([string]$RequestedRoot, [string]$Version)

    $candidates = @()
    if ($RequestedRoot) { $candidates += $RequestedRoot }
    if ($env:ANDROID_NDK_HOME) { $candidates += $env:ANDROID_NDK_HOME }
    foreach ($sdkRoot in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT)) {
        if ($sdkRoot) { $candidates += (Join-Path $sdkRoot "ndk\$Version") }
    }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (Test-Path -LiteralPath $candidate -PathType Container) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw "Android NDK $Version was not found. Pass -NdkRoot or set ANDROID_NDK_HOME/ANDROID_HOME."
}

function Reset-CacheDirectory {
    param([string]$Path)

    $cacheFullPath = [IO.Path]::GetFullPath($cacheRoot)
    $targetFullPath = [IO.Path]::GetFullPath($Path)
    if (-not $targetFullPath.StartsWith($cacheFullPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to reset a directory outside the runtime cache: $targetFullPath"
    }
    if (Test-Path -LiteralPath $targetFullPath) {
        Remove-Item -LiteralPath $targetFullPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $targetFullPath | Out-Null
}

function Expand-Deb {
    param([string]$DebPath, [string]$Destination)
    if (-not (Test-Path -LiteralPath $Destination)) {
        New-Item -ItemType Directory -Path $Destination | Out-Null
    }
    $tar = Join-Path $env:WINDIR 'System32\tar.exe'
    & $tar -xf $DebPath -C $Destination
    if ($LASTEXITCODE -ne 0) { throw "Failed to unpack $DebPath" }
    $dataXz = Join-Path $Destination 'data.tar.xz'
    $dataTar = Join-Path $Destination 'data.tar'
    & (Get-XzExecutable) -dkf $dataXz
    if ($LASTEXITCODE -ne 0) { throw "Failed to decompress $dataXz" }
    & $tar -xf $dataTar -C $Destination
    if ($LASTEXITCODE -ne 0) { throw "Failed to unpack $dataTar" }
}

function Replace-AsciiInPlace {
    param([string]$Path, [string]$OldValue, [string]$NewValue)
    if ($NewValue.Length -gt $OldValue.Length) { throw 'Replacement must not grow the ELF string table.' }
    [byte[]]$bytes = [IO.File]::ReadAllBytes($Path)
    [byte[]]$old = [Text.Encoding]::ASCII.GetBytes($OldValue)
    [byte[]]$new = [Text.Encoding]::ASCII.GetBytes($NewValue)
    $matches = 0
    for ($offset = 0; $offset -le $bytes.Length - $old.Length; $offset++) {
        $equal = $true
        for ($index = 0; $index -lt $old.Length; $index++) {
            if ($bytes[$offset + $index] -ne $old[$index]) { $equal = $false; break }
        }
        if (-not $equal) { continue }
        [Array]::Copy($new, 0, $bytes, $offset, $new.Length)
        for ($index = $new.Length; $index -lt $old.Length; $index++) { $bytes[$offset + $index] = 0 }
        $matches++
        $offset += $old.Length - 1
    }
    if ($matches -lt 1) { throw "ELF string '$OldValue' was not found in $Path" }
    [IO.File]::WriteAllBytes($Path, $bytes)
}

function Assert-AsciiString {
    param([string]$Path, [string]$Value, [bool]$Expected = $true)
    $content = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($Path))
    $found = $content.Contains($Value, [StringComparison]::Ordinal)
    if ($found -ne $Expected) {
        $expectation = if ($Expected) { 'contain' } else { 'not contain' }
        throw "$Path must $expectation the ASCII marker '$Value'."
    }
}

$expanded = @{}
foreach ($package in $lock.packages | Where-Object name -Ne 'libandroid-shmem') {
    $deb = Join-Path $cacheRoot ("{0}-{1}-aarch64.deb" -f $package.name, $package.version)
    Get-VerifiedFile -Url $package.binaryUrl -Sha256 $package.binarySha256 -Destination $deb
    $destination = Join-Path $cacheRoot ("expanded-{0}-{1}" -f $package.name, $package.version)
    Expand-Deb -DebPath $deb -Destination $destination
    $expanded[$package.name] = $destination
}

$shmemPackage = $lock.packages | Where-Object name -Eq 'libandroid-shmem' | Select-Object -First 1
if (-not $shmemPackage) { throw 'libandroid-shmem is missing from source-lock.json' }
$shmemSourceArchive = Join-Path $cacheRoot "libandroid-shmem-$($shmemPackage.version).tar.gz"
Get-VerifiedFile -Url $shmemPackage.sourceUrl -Sha256 $shmemPackage.sourceSha256 -Destination $shmemSourceArchive

$shmemPatch = $lock.nativeBuild.patches | Where-Object path -Eq 'runtime/host/patches/libandroid-shmem-runtime-dir.patch' | Select-Object -First 1
if (-not $shmemPatch) { throw 'The libandroid-shmem runtime-directory patch is missing from source-lock.json' }
$shmemPatchPath = Join-Path $RepositoryRoot ($shmemPatch.path -replace '/', '\')
$actualPatchHash = (Get-FileHash -LiteralPath $shmemPatchPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualPatchHash -ne $shmemPatch.sha256) {
    throw "SHA-256 mismatch for $shmemPatchPath. Expected $($shmemPatch.sha256), got $actualPatchHash"
}

$shmemBuildRoot = Join-Path $cacheRoot "build-libandroid-shmem-$($shmemPackage.version)"
Reset-CacheDirectory -Path $shmemBuildRoot
$tar = Join-Path $env:WINDIR 'System32\tar.exe'
& $tar -xf $shmemSourceArchive -C $shmemBuildRoot --strip-components=1
if ($LASTEXITCODE -ne 0) { throw "Failed to unpack $shmemSourceArchive" }
Push-Location $shmemBuildRoot
try {
    & (Get-PatchExecutable) -p1 --forward --batch -i $shmemPatchPath
    if ($LASTEXITCODE -ne 0) { throw "Failed to apply $shmemPatchPath" }
} finally {
    Pop-Location
}

$resolvedNdkRoot = Resolve-AndroidNdkRoot -RequestedRoot $NdkRoot -Version $lock.nativeBuild.androidNdkVersion
$ndkBin = Join-Path $resolvedNdkRoot 'toolchains\llvm\prebuilt\windows-x86_64\bin'
$clang = Join-Path $ndkBin "aarch64-linux-android$($lock.nativeBuild.androidApi)-clang.cmd"
$strip = Join-Path $ndkBin 'llvm-strip.exe'
$readelf = Join-Path $ndkBin 'llvm-readelf.exe'
foreach ($tool in @($clang, $strip, $readelf)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Required Android NDK tool is missing: $tool" }
}
$shmemBuiltLibrary = Join-Path $shmemBuildRoot 'libandroid-shmem.so'
$clangArguments = @(
    '-fPIC', '-O2', '-Wall', '-Wextra', '-D_GNU_SOURCE', '-shared',
    (Join-Path $shmemBuildRoot 'shmem.c'),
    '-Wl,-soname,libandroid-shmem.so', '-Wl,-z,noexecstack', '-Wl,--build-id=none',
    '-Wl,-z,max-page-size=16384', '-Wl,-z,common-page-size=16384',
    '-llog', '-landroid', '-o', $shmemBuiltLibrary
)
& $clang @clangArguments
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile the patched libandroid-shmem source.' }
& $strip --strip-unneeded $shmemBuiltLibrary
if ($LASTEXITCODE -ne 0) { throw 'Failed to strip libandroid-shmem.' }

$prootSource = Join-Path $expanded.proot 'data\data\com.termux\files\usr\bin\proot'
$loaderSource = Join-Path $expanded.proot 'data\data\com.termux\files\usr\libexec\proot\loader'
$tallocSource = Join-Path $expanded.libtalloc 'data\data\com.termux\files\usr\lib\libtalloc.so.2.4.3'

$outputs = [ordered]@{
    'libeleckoi_proot.so' = $prootSource
    'libeleckoi_proot_loader.so' = $loaderSource
    'libtalloc.so' = $tallocSource
    'libandroid-shmem.so' = $shmemBuiltLibrary
}
foreach ($entry in $outputs.GetEnumerator()) {
    Copy-Item -LiteralPath $entry.Value -Destination (Join-Path $outputRoot $entry.Key) -Force
}

Replace-AsciiInPlace -Path (Join-Path $outputRoot 'libeleckoi_proot.so') -OldValue 'libtalloc.so.2' -NewValue 'libtalloc.so'
Replace-AsciiInPlace -Path (Join-Path $outputRoot 'libtalloc.so') -OldValue 'libtalloc.so.2' -NewValue 'libtalloc.so'
Assert-AsciiString -Path (Join-Path $outputRoot 'libeleckoi_proot.so') -Value 'PROOT_LOADER'
Assert-AsciiString -Path (Join-Path $outputRoot 'libeleckoi_proot.so') -Value 'PROOT_TMP_DIR'
Assert-AsciiString -Path (Join-Path $outputRoot 'libandroid-shmem.so') -Value 'ELECKOI_SHMEM_DIR'
Assert-AsciiString -Path (Join-Path $outputRoot 'libandroid-shmem.so') -Value '/data/data/com.termux' -Expected $false
$shmemDynamicSection = & $readelf -d (Join-Path $outputRoot 'libandroid-shmem.so')
if ($LASTEXITCODE -ne 0 -or ($shmemDynamicSection -join "`n") -notmatch 'Shared library: \[libandroid\.so\]') {
    throw 'libandroid-shmem must declare libandroid.so for ASharedMemory symbols.'
}

foreach ($entry in $outputs.GetEnumerator()) {
    $packagedPath = Join-Path $outputRoot $entry.Key
    $programHeaders = & $readelf -l $packagedPath
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect ELF program headers: $packagedPath" }
    $loadAlignments = @(
        $programHeaders |
            Where-Object { $_ -match '^\s*LOAD\s' } |
            ForEach-Object {
                if ($_ -notmatch '0x([0-9a-fA-F]+)\s*$') { throw "Cannot parse LOAD alignment: $_" }
                [Convert]::ToInt64($Matches[1], 16)
            }
    )
    if ($loadAlignments.Count -eq 0 -or ($loadAlignments | Where-Object { $_ -lt 16384 })) {
        throw "ELF is not compatible with 16 KiB Android pages: $packagedPath"
    }
}

$provenance = [ordered]@{
    schemaVersion = 1
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    sourceLock = 'runtime/host/source-lock.json'
    nativeBuild = [ordered]@{
        androidNdkVersion = $lock.nativeBuild.androidNdkVersion
        androidApi = $lock.nativeBuild.androidApi
        patches = @($lock.nativeBuild.patches)
    }
    modifications = @(
        'ELF libtalloc.so.2 dependency and SONAME shortened to libtalloc.so',
        'libandroid-shmem rebuilt from pinned source so its key files resolve through ELECKOI_SHMEM_DIR, PROOT_TMP_DIR, or TMPDIR at runtime',
        'libandroid-shmem explicitly linked to libandroid.so for ASharedMemory symbols',
        'all packaged ARM64 ELF LOAD segments verified with alignment of at least 16 KiB'
    )
    outputs = @(
        Get-ChildItem -LiteralPath $outputRoot -File |
            Where-Object Name -In $outputs.Keys |
            Sort-Object Name |
            ForEach-Object {
                [ordered]@{
                    path = "app/src/main/jniLibs/arm64-v8a/$($_.Name)"
                    size = $_.Length
                    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                }
            }
    )
}
$provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'generated-provenance.json') -Encoding utf8NoBOM
Write-Host "Staged $($outputs.Count) verified ARM64 host files in $outputRoot"
