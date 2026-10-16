# Biên dịch và nạp firmware AnToanESP32 vào ESP32, sau đó mở Serial Monitor 115200.
$ErrorActionPreference = 'Stop'
try { Start-Transcript -Path (Join-Path $PSScriptRoot 'nap-esp32.log') -Force | Out-Null } catch { }
$sketch = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\firmware\AnToanESP32'))
$fqbn = 'esp32:esp32:esp32:PartitionScheme=min_spiffs'
$buildPath = Join-Path $env:TEMP 'an-toan-esp32-build'

function Stop-WithMessage($message) {
  Write-Host ''
  Write-Host $message -ForegroundColor Red
  Read-Host 'Nhấn Enter để thoát'
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $sketch 'secrets.h'))) {
  Stop-WithMessage 'Thiếu firmware\AnToanESP32\secrets.h. Sao chép secrets.example.h thành secrets.h và điền Wi-Fi/Firebase.'
}

# Tìm arduino-cli: trong PATH, trong Arduino IDE 2, hoặc trong thư mục người dùng.
$cli = (Get-Command arduino-cli -ErrorAction SilentlyContinue).Source
$candidates = @(
  "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe",
  "$env:ProgramFiles\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
)
if (-not $cli) { $cli = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $cli) {
  Write-Host 'Đang tìm arduino-cli trong thư mục người dùng...'
  $cli = Get-ChildItem -Path $env:USERPROFILE -Filter 'arduino-cli.exe' -Recurse -Depth 5 -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $cli) { Stop-WithMessage 'Không tìm thấy arduino-cli. Mở firmware\AnToanESP32\AnToanESP32.ino bằng Arduino IDE và bấm Upload.' }
Write-Host "arduino-cli: $cli"

$common = @()
$ideConfig = Join-Path $env:USERPROFILE '.arduinoIDE\arduino-cli.yaml'
if (Test-Path -LiteralPath $ideConfig) { $common += @('--config-file', $ideConfig) }
$compileArgs = @()
$extraLibs = Join-Path $env:USERPROFILE 'CodexArduinoLibs'
if (Test-Path -LiteralPath $extraLibs) { $compileArgs += @('--libraries', $extraLibs) }

Write-Host ''
Write-Host '1/3 Biên dịch firmware...' -ForegroundColor Cyan
& $cli @common compile --fqbn $fqbn @compileArgs --build-path $buildPath $sketch
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Biên dịch lỗi. Kiểm tra đã cài ESP32 core 3.3.12, ArduinoJson, DHT sensor library, Adafruit Unified Sensor.' }

Write-Host ''
Write-Host '2/3 Tìm cổng COM của ESP32...' -ForegroundColor Cyan
$ports = @()
try {
  $list = (& $cli @common board list --format json) | Out-String | ConvertFrom-Json
  $detected = if ($list.detected_ports) { $list.detected_ports } else { $list }
  $ports = @($detected | Where-Object { $_.port.protocol -eq 'serial' -and $_.port.properties.vid } | ForEach-Object { $_.port.address })
} catch { }
if ($ports.Count -eq 0) { $ports = @([System.IO.Ports.SerialPort]::GetPortNames() | Where-Object { $_ -ne 'COM1' }) }
if ($ports.Count -eq 0) { Stop-WithMessage 'Không thấy ESP32. Kiểm tra cáp USB (cáp có dây dữ liệu) và driver CP210x/CH340.' }
$port = $ports[0]
if ($ports.Count -gt 1) {
  Write-Host "Có nhiều cổng: $($ports -join ', ')"
  $answer = Read-Host "Nhập cổng ESP32 (Enter = $port)"
  if ($answer) { $port = $answer.Trim().ToUpper() }
}

Write-Host ''
Write-Host "3/3 Nạp vào $port... (nếu báo bận cổng: đóng Serial Monitor của Arduino IDE)" -ForegroundColor Cyan
& $cli @common upload -p $port --fqbn $fqbn --input-dir $buildPath $sketch
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Nạp lỗi. Thử giữ nút BOOT trên ESP32 khi thấy 'Connecting...', hoặc đóng chương trình đang dùng $port." }

Write-Host ''
Write-Host 'Nạp xong! Serial Monitor 115200 (Ctrl+C để thoát):' -ForegroundColor Green
& $cli @common monitor -p $port -c baudrate=115200
