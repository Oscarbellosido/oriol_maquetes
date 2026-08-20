@echo off
cd /d "C:\Users\Carles\Documents\Programacio\oriol_maquetes"
if exist ".git\index.lock" del /f ".git\index.lock"
git status
git add index.html
git commit -m "feat: afegeix versió v2026-08-15 al footer"
git push origin main
echo.
echo === FET ===
pause
