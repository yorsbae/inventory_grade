#!/bin/sh
# Instalasi untuk Linux / macOS
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
echo
echo "Instalasi selesai. Jalankan dengan: .venv/bin/python app.py"
