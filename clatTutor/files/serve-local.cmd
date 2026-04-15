@echo off
REM Serves this folder over http://127.0.0.1:8080 so YouTube embeds and other features work like on a real site.
cd /d "%~dp0"
echo.
echo  CLATutor local preview
echo  Server: http://127.0.0.1:8080/
echo  Close the black window titled "CLATutor http server" when you are done.
echo.
start "CLATutor http server" cmd /k "python -m http.server 8080"
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8080/index.html
