@echo off
rem Membuat versi portable (.exe) - jalankan SEKALI di PC yang punya Python.
cd /d "%~dp0"
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller --noconfirm --onedir --name StokGrade --add-data "templates;templates" --add-data "static;static" app.py
echo.
echo Selesai. Salin folder dist\StokGrade ke flashdisk/PC mana pun, lalu jalankan StokGrade.exe
pause
