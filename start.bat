@echo off
cd /d "%~dp0"
if exist python\python.exe ( python\python.exe app.py & goto akhir )
if exist .venv\Scripts\python.exe ( .venv\Scripts\python.exe app.py & goto akhir )
echo Python belum disiapkan. Jalankan setup_portable.bat (atau install.bat) terlebih dahulu.
:akhir
pause
