@echo off
cd /d "C:\Users\Carles\Documents\Programacio\oriol_maquetes"
echo === GIT PUSH LOG === > _git_log.txt
echo %DATE% %TIME% >> _git_log.txt
echo. >> _git_log.txt
if exist ".git\index.lock" (
    echo Esborrant lock... >> _git_log.txt
    del /f ".git\index.lock"
    echo Lock esborrat >> _git_log.txt
) else (
    echo No hi ha lock >> _git_log.txt
)
echo. >> _git_log.txt
echo --- GIT STATUS --- >> _git_log.txt
git status >> _git_log.txt 2>&1
echo. >> _git_log.txt
echo --- GIT ADD --- >> _git_log.txt
git add index.html >> _git_log.txt 2>&1
echo. >> _git_log.txt
echo --- GIT COMMIT --- >> _git_log.txt
git commit -m "feat: afegeix versio v2026-08-15 al footer" >> _git_log.txt 2>&1
echo. >> _git_log.txt
echo --- GIT PUSH --- >> _git_log.txt
git push origin main >> _git_log.txt 2>&1
echo. >> _git_log.txt
echo === FI === >> _git_log.txt
