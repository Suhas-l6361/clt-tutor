@echo off
cd /d "%~dp0"
echo Building NLS rank holder list from photos in this folder...
node build-rank-students.mjs
if errorlevel 1 (
  echo.
  echo FAILED. Make sure Node.js is installed.
  pause
  exit /b 1
)
echo.
echo Done. Refresh index.html / redeploy.
pause
