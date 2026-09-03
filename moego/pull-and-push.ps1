# Runs daily via Task Scheduler: pull the latest MoeGo before/afters, then
# commit + push so the poster can use them. If the MoeGo session has expired,
# `pull.mjs` prints a notice and this exits without changes (re-run
# `npm run discover` to refresh the login).
$ErrorActionPreference = "Continue"
$repo = "C:\Users\jdcal\OneDrive\Claude\mpw-autoposter"

Set-Location "$repo\moego"
node pull.mjs --pull

Set-Location $repo
git add images/photos images/reels
$changes = git status --porcelain images/photos images/reels
if ($changes) {
  git commit -m "MoeGo: new before/after photos + reels [skip ci]"
  git pull --rebase --autostash
  git push
  Write-Output "Pushed new before/after photos."
} else {
  Write-Output "No new photos to push."
}
