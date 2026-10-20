@echo off
setlocal
title Fold local commits into one clean commit and push
cd /d "%~dp0"
where git >nul 2>nul || (echo Git isn't installed, or isn't on PATH. & pause & exit /b 1)

rem Older local commits still contain dist and node_modules, and a push sends every commit.
rem This folds all local commits into one clean "Initial commit". Your files on disk are not touched.
git ls-remote --exit-code --heads origin main >nul 2>nul
if not errorlevel 1 (
  echo GitHub already has a main branch, so this stops here rather than overwrite it.
  pause & exit /b 1
)

for /f %%r in ('git rev-list --max-parents^=0 HEAD') do set ROOT=%%r
if "%ROOT%"=="" (echo Couldn't find the first commit. & pause & exit /b 1)

git rm -r --cached --quiet --ignore-unmatch dist node_modules
git add -A
git rm --cached --quiet --ignore-unmatch "Fix git (remove dist and node_modules).cmd" "%~nx0"

git reset --soft %ROOT%
git commit --amend -m "Initial commit"
if errorlevel 1 (echo. & echo The commit failed. Scroll up for the reason. & pause & exit /b 1)

echo.
echo Pushing to GitHub...
git push -u origin main
if errorlevel 1 (echo. & echo The push failed. Scroll up for the reason. & pause & exit /b 1)
echo.
echo Done. You can delete both "Fix git" .cmd files now.
pause
