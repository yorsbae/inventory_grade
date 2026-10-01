@echo off
cd /d "%~dp0"
set PY=
python -c "import sys" >nul 2>&1 && set PY=python
if not defined PY py -3 -c "import sys" >nul 2>&1 && set PY=py -3
if not defined PY goto nopython
%PY% -m venv .venv || goto gagal
.venv\Scripts\python -m pip install -r requirements.txt || goto gagal
echo.
echo Instalasi selesai. Jalankan start.bat
pause
exit /b 0
:nopython
echo.
echo Python belum terpasang di PC ini. Pilih salah satu:
echo   1. Jalankan setup_portable.bat  (otomatis, tanpa install Python, butuh internet sekali)
echo   2. Perintah:  winget install Python.Python.3.12   lalu tutup dan buka lagi terminal ini
echo   3. Unduh dari python.org, centang "Add python.exe to PATH" saat install
pause
exit /b 1
:gagal
echo.
echo GAGAL. Periksa koneksi internet lalu coba lagi.
pause
exit /b 1
