# Chạy web dashboard tại máy: http://localhost:8000 (không cần cài Python/Node).
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'web-local.log'
try { Start-Transcript -Path $log -Force | Out-Null } catch { }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\docs'))
Write-Host "Thư mục web: $root"
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon' }

function Get-WebFile([string]$rawPath) {
  $path = [Uri]::UnescapeDataString(($rawPath -split '\?')[0])
  if ($path.EndsWith('/')) { $path += 'index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
  if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
    $type = $types[[IO.Path]::GetExtension($file).ToLowerInvariant()]
    if (-not $type) { $type = 'application/octet-stream' }
    return @{ Status = 200; Type = $type; Bytes = [IO.File]::ReadAllBytes($file); Path = $path }
  }
  return @{ Status = 404; Type = 'text/plain; charset=utf-8'; Bytes = [Text.Encoding]::UTF8.GetBytes('404 - Không tìm thấy'); Path = $path }
}

function Show-Ready([int]$port) {
  $url = "http://localhost:$port/"
  Write-Host ''
  Write-Host "  Web local đang chạy: $url" -ForegroundColor Green
  Write-Host "  Bản mô phỏng (không cần ESP32): ${url}?demo=1"
  Write-Host '  Giữ cửa sổ này mở. Đóng cửa sổ để dừng web.'
  Write-Host ''
  try { Start-Process $url } catch { }
}

# Cách 1: HttpListener (nhanh, xử lý nhiều kết nối).
$listener = $null
foreach ($port in 8000..8010) {
  try {
    $candidate = [System.Net.HttpListener]::new()
    $candidate.Prefixes.Add("http://localhost:$port/")
    $candidate.Start()
    $listener = $candidate; $usedPort = $port
    break
  } catch { Write-Host "HttpListener cổng ${port}: $($_.Exception.Message)" -ForegroundColor DarkYellow }
}
if ($listener) {
  Show-Ready $usedPort
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response
    try {
      $result = Get-WebFile $context.Request.RawUrl
      $response.StatusCode = $result.Status
      $response.ContentType = $result.Type
      $response.Headers['Cache-Control'] = 'no-store'
      $response.OutputStream.Write($result.Bytes, 0, $result.Bytes.Length)
      Write-Host ("{0:HH:mm:ss} {1} {2}" -f (Get-Date), $result.Status, $result.Path)
    } catch { Write-Host $_ -ForegroundColor Yellow } finally { $response.Close() }
  }
  exit 0
}

# Cách 2: TcpListener (không cần quyền URL của Windows).
$tcp = $null
foreach ($port in 8000..8010) {
  try { $tcp = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port); $tcp.Start(); $usedPort = $port; break }
  catch { Write-Host "TcpListener cổng ${port}: $($_.Exception.Message)" -ForegroundColor DarkYellow; $tcp = $null }
}
if (-not $tcp) { throw 'Không mở được cổng 8000-8010. Đóng cửa sổ web local cũ rồi thử lại.' }
Show-Ready $usedPort
while ($true) {
  $client = $tcp.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $waited = 0
    while (-not $stream.DataAvailable -and $waited -lt 1500) { Start-Sleep -Milliseconds 20; $waited += 20 }
    if (-not $stream.DataAvailable) { continue }
    $client.ReceiveTimeout = 2000
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 8192, $true)
    $requestLine = $reader.ReadLine()
    while ($true) { $line = $reader.ReadLine(); if ($null -eq $line -or $line -eq '') { break } }
    if (-not $requestLine) { continue }
    $result = Get-WebFile ($requestLine.Split(' ')[1])
    $reason = if ($result.Status -eq 200) { 'OK' } else { 'Not Found' }
    $header = "HTTP/1.1 $($result.Status) $reason`r`nContent-Type: $($result.Type)`r`nContent-Length: $($result.Bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($result.Bytes, 0, $result.Bytes.Length)
    $stream.Flush()
    Write-Host ("{0:HH:mm:ss} {1} {2}" -f (Get-Date), $result.Status, $result.Path)
  } catch { Write-Host $_ -ForegroundColor Yellow } finally { $client.Close() }
}
