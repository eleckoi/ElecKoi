[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'bundles'),
    [string]$ArtifactRoot = (Join-Path $PSScriptRoot 'artifacts'),
    [string]$CacheDirectory = (Join-Path $PSScriptRoot '.cache/deepseek-build')
)

$ErrorActionPreference = 'Stop'

# Compatibility entrypoint for intentional source upgrades. Daily APK builds should call
# fetch-verified-deepseek-runtime.ps1 and never enter the compiler.
& (Join-Path $PSScriptRoot 'compile-deepseek-harness-arm64.ps1') `
    -ArtifactRoot $ArtifactRoot `
    -CacheDirectory $CacheDirectory

Import-Module (Join-Path $PSScriptRoot 'deepseek/DeepSeekRuntimeBuild.psm1') -Force
$definition = Get-DeepSeekRuntimeBuildDefinition -RuntimeRoot $PSScriptRoot
& (Join-Path $PSScriptRoot 'package-deepseek-runtime.ps1') `
    -ArtifactDirectory (Join-Path ([IO.Path]::GetFullPath($ArtifactRoot)) $definition.ArtifactName) `
    -OutputDirectory $OutputDirectory
