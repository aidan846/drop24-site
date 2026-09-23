param([string]$RemoteUrl = "https://github.com/aidan846/drop24-site.git")
$ErrorActionPreference = "Stop"
$branch = (git branch --show-current).Trim()
if ($branch -ne "portfolio") { throw "Run this script from the portfolio branch." }
if (git status --porcelain) { throw "Commit all portfolio changes before publishing." }
$publishRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("drop24-public-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $publishRoot | Out-Null
try {
  git archive portfolio -o (Join-Path $publishRoot "portfolio.zip")
  Expand-Archive -LiteralPath (Join-Path $publishRoot "portfolio.zip") -DestinationPath (Join-Path $publishRoot "site")
  Remove-Item -LiteralPath (Join-Path $publishRoot "portfolio.zip")
  Push-Location (Join-Path $publishRoot "site")
  try { git init -b main; git add --all; git commit -m "Publish Drop24 portfolio demo"; git remote add origin $RemoteUrl; git fetch origin main; git push --force-with-lease origin main }
  finally { Pop-Location }
} finally { Remove-Item -LiteralPath $publishRoot -Recurse -Force }
