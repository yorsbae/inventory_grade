@echo off
rem Menyiapkan Python portable di folder "python" (tanpa install, tanpa admin). Butuh internet sekali.
cd /d "%~dp0"
set PYVER=3.12.7
if exist python\python.exe goto pip
echo [1/3] Mengunduh Python %PYVER% portable...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/%PYVER%/python-%PYVER%-embed-amd64.zip' -OutFile 'py.zip'" || goto gagal
powershell -NoProfile -Command "Expand-Archive -Force py.zip python" || goto gagal
del py.zip
powershell -NoProfile -Command "Get-ChildItem python\python*._pth | ForEach-Object { (Get-Content $_) -replace '#import site','import site' | Set-Content $_ }"
:pip
echo [2/3] Memasang pip...
if not exist python\Scripts\pip.exe (
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'get-pip.py'" || goto gagal
  python\python.exe get-pip.py || goto gagal
  del get-pip.py
)
echo [3/3] Memasang flask, openpyxl, waitress...
python\python.exe -m pip install -r requirements.txt || goto gagal
echo.
echo Selesai. Jalankan start.bat. Folder ini bisa disalin ke PC / flashdisk lain.
pause
exit /b 0
:gagal
echo.
echo GAGAL. Periksa koneksi internet lalu jalankan lagi.
pause
exit /b 1
