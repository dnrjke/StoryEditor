Write-Host "Starting Starlight Ensemble dev server..." -ForegroundColor Cyan

# 포트 5175 정리
Write-Host "Cleaning up port 5180..." -ForegroundColor Gray
npx --yes kill-port 5180
Start-Sleep -Seconds 1

Write-Host "Launching npm run dev..." -ForegroundColor Yellow
npm run dev
