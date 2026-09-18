# ============================================
# Theo Frontend - Auto Sync GitHub
# Autor: Gabriel Melo
# ============================================

$branch = "main"
$interval = 30

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "      THEO AUTO GIT SYNC" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

while ($true) {

    git add .

    git diff --cached --quiet

    if ($LASTEXITCODE -ne 0) {

        $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

        Write-Host ""
        Write-Host "[$date] Alterações encontradas..." -ForegroundColor Yellow

        git commit -m "Auto Sync $date"

        if ($LASTEXITCODE -eq 0) {

            git push origin $branch

            if ($LASTEXITCODE -eq 0) {
                Write-Host "[$date] ✓ Enviado para o GitHub" -ForegroundColor Green
            }
            else {
                Write-Host "[$date] ✗ Erro ao enviar." -ForegroundColor Red
            }
        }

    }

    Start-Sleep -Seconds $interval
}