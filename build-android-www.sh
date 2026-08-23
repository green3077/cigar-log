#!/bin/bash
# 루트의 웹 소스 파일들을 www/로 동기화하고, 안드로이드(Capacitor) 빌드에만 필요한
# 구글 네이티브 로그인 스크립트를 www/index.html에 추가로 삽입한다.
# 웹 배포용 루트 index.html은 건드리지 않는다 (GitHub Pages는 이 스크립트들이 필요 없음).
set -e
cd "$(dirname "$0")"

cp index.html style.css app.js ai.js idb.js cigarDB.js drive.js weather.js www/
cp node_modules/@capacitor/core/dist/capacitor.js www/capacitor.js
cp node_modules/@capawesome/capacitor-google-sign-in/dist/plugin.js www/capacitor-google-signin.js
cp node_modules/@capacitor/app/dist/plugin.js www/capacitor-app.js

python3 -c "
import re
path = 'www/index.html'
with open(path, encoding='utf-8') as f:
    html = f.read()
inject = '  <script src=\"capacitor.js\"></script>\n  <script src=\"capacitor-app.js\"></script>\n  <script src=\"capacitor-google-signin.js\"></script>\n  <script src=\"drive.js\"></script>'
html = html.replace('  <script src=\"drive.js\"></script>', inject)
with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
"

npx cap copy android

echo "www/ synced for Android build (capacitor.js + capacitor-google-signin.js included), and copied into android/app/src/main/assets/public via 'cap copy' (Gradle bundles that directory, NOT the top-level www/ - skipping this step ships a stale APK with no error or warning)."
