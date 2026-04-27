# =============================================================
# YouTube Content Pipeline - Yeni Makine Kurulum Scripti
# =============================================================
# Kullanim: PowerShell ac, proje koklu klasorunde:
#   .\setup.ps1
#
# Onkoşullar (kendin kur):
#   - Node.js 20+ (https://nodejs.org)
#   - Python 3.10+ (https://python.org)
#   - FFmpeg (https://www.gyan.dev/ffmpeg/builds/, PATH'a ekle)
#   - Git (https://git-scm.com)
# =============================================================

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  YouTube Pipeline kurulum basliyor..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Node.js bagimliliklari
Write-Host "`n[1/5] npm install (ana proje)" -ForegroundColor Yellow
npm install --no-audit --no-fund

# 2. video-toolkit'i klonla (kendi git'i var, bu repoda gitignored)
if (-not (Test-Path "video-toolkit")) {
    Write-Host "`n[2/5] video-toolkit klonlaniyor..." -ForegroundColor Yellow
    git clone --depth=1 https://github.com/digitalsamba/claude-code-video-toolkit.git video-toolkit
} else {
    Write-Host "`n[2/5] video-toolkit zaten mevcut, atlaniyor" -ForegroundColor Gray
}

# 3. Python venv + Whisper + toolkit deps
if (-not (Test-Path ".python-venv")) {
    Write-Host "`n[3/5] Python venv olusturuluyor..." -ForegroundColor Yellow
    python -m venv .python-venv
}
Write-Host "`n[3/5] Python deps yukleniyor..." -ForegroundColor Yellow
& .\.python-venv\Scripts\pip.exe install --quiet -r video-toolkit/tools/requirements.txt
& .\.python-venv\Scripts\pip.exe install --quiet openai-whisper

# 4. .env hazirla
if (-not (Test-Path ".env")) {
    Write-Host "`n[4/5] .env olusturuluyor (.env.example'den kopya)..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "  -> .env dosyasini ac ve API key'lerini doldur:" -ForegroundColor Magenta
    Write-Host "     ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID" -ForegroundColor Magenta
    Write-Host "     YOUTUBE_API_KEY, PEXELS_API_KEY, FAL_KEY" -ForegroundColor Magenta
} else {
    Write-Host "`n[4/5] .env zaten mevcut, atlaniyor" -ForegroundColor Gray
}

# 5. FFmpeg + Node check
Write-Host "`n[5/5] Versiyon kontrol..." -ForegroundColor Yellow
node --version
ffmpeg -version 2>&1 | Select-Object -First 1
& .\.python-venv\Scripts\python.exe --version

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Kurulum tamam." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "`nSiradaki adimlar:"
Write-Host "  1. .env dosyasini doldur (gerekli API key'leri)"
Write-Host "  2. npm run check-env  -> servisler ulasilabilir mi"
Write-Host "  3. npm run monthly    -> trend + topic + script + tts + visuals"
Write-Host "`nNot: data/ icindeki text artifact'lar (script.json vb.) repo ile birlikte geldi."
Write-Host "Binary'ler (audio, voiceover.mp3, assets/) yeniden uretilecek -> ~10 dk + ~`$0.05"
