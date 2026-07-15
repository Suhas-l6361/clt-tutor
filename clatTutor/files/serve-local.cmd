@echo off
REM Serves this folder on LAN so the mobile app WebView can load image/ + videos/.
cd /d "%~dp0"
echo.
echo  CLATutor local preview (LAN)
echo  Phone + PC: use your Wi-Fi IP on port 8080
echo  Close the black window titled "CLATutor http server" when you are done.
echo.
start "CLATutor http server" cmd /k "python -m http.server 8080 --bind 0.0.0.0"
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8080/index.html
