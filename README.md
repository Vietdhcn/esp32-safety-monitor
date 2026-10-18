# Trạm giám sát an toàn ESP32

Project dùng ESP32 để phát hiện lửa và khí gas, đo nhiệt độ/độ ẩm, rồi điều khiển LED, còi và quạt. ESP32 tự xử lý cảnh báo tại chỗ. Firebase Realtime Database chuyển trạng thái và lệnh giữa thiết bị với dashboard web; mất Wi-Fi không làm dừng phần cảnh báo cục bộ.

## Chạy nhanh

Lấy mã nguồn và mở dashboard trên Windows:

```powershell
git clone https://github.com/Vietdhcn/esp32-safety-monitor.git
cd esp32-safety-monitor
.\chay-web-local.bat
```

**Xem giao diện không cần ESP32:** script mở trang web local (thường là `http://localhost:8000/`); thêm `?demo=1` thành `http://localhost:8000/?demo=1` để xem dữ liệu mô phỏng. Có thể bật/tắt báo lửa, báo gas và thử điều khiển ngay trong bản mô phỏng. Giữ cửa sổ script mở khi dùng web. Chế độ demo không điều khiển thiết bị và có kho lịch sử riêng.

Script dùng PowerShell có sẵn trên Windows, không cần cài Node.js hoặc Python; tự tìm cổng trống trong khoảng **8000–8010**. Dùng đúng địa chỉ được in trong cửa sổ script nếu cổng 8000 đã bận. Dashboard là HTML/CSS/JavaScript tĩnh, không có bước build hay `npm install`. Chế độ demo chỉ bật trên `localhost` hoặc `127.0.0.1`; thêm `?demo=1` trên GitHub Pages không bật mô phỏng.

**Dùng thiết bị thật:** đấu dây theo bảng GPIO bên dưới, cấu hình Firebase và `secrets.h`, nạp firmware, rồi mở web **không có** `?demo=1` và đăng nhập bằng tài khoản được cấp quyền.

## Cấu trúc project

| Đường dẫn | Vai trò |
|---|---|
| `firmware/AnToanESP32/` | Sketch và các module chạy trên ESP32 |
| `docs/` | Dashboard tĩnh; có thể chạy local hoặc dùng GitHub Pages |
| `firebase.rules.json` | Database Rules của Firebase project hiện tại |
| `firebase.rules.template.json` | Mẫu Rules cho Firebase project mới |
| `chay-web-local.bat`, `tools/chay-web-local.ps1` | Mở dashboard trên Windows |
| `nap-esp32.bat`, `tools/nap-esp32.ps1` | Biên dịch, nạp và mở Serial Monitor trên Windows |
| `tools/check-telemetry-heartbeat.py` | Kiểm tra telemetry của ESP32 thật qua Firebase trong khoảng 90 giây |
| `test/` | Kiểm thử logic và hợp đồng của firmware/web |

### Firmware được chia thành những file nào?

| File | Nhiệm vụ |
|---|---|
| [`AnToanESP32.ino`](firmware/AnToanESP32/AnToanESP32.ino) | Khởi động các task, nhận lệnh Firebase, ghép dữ liệu cảm biến với logic an toàn và gửi telemetry. |
| [`Sensors.h`](firmware/AnToanESP32/Sensors.h) | Khởi tạo và đọc cảm biến lửa ở GPIO16, MQ-2 ở GPIO17, DHT11 ở GPIO27; kiểm tra số đo DHT hợp lệ. |
| [`SafetyLogic.h`](firmware/AnToanESP32/SafetyLogic.h) | Bộ lọc tín hiệu DO, các mốc thời gian an toàn và hàm quyết định quạt/LED/còi từ trạng thái cảm biến và lệnh. Không đọc hoặc ghi GPIO. |
| [`Controls.h`](firmware/AnToanESP32/Controls.h) | Khởi tạo và ghi GPIO cho LED đỏ/xanh, còi và quạt L9110S. |
| [`DhtSample.h`](firmware/AnToanESP32/DhtSample.h) | Xác định khi nào số đo DHT thay đổi để cập nhật telemetry. |
| [`TelemetryTiming.h`](firmware/AnToanESP32/TelemetryTiming.h) | Quyết định thời điểm gửi heartbeat, gom thay đổi điều khiển và thử lại khi gửi lỗi. |
| [`WifiCredentials.h`](firmware/AnToanESP32/WifiCredentials.h) | Kiểm tra SSID/mật khẩu, quyết định lưu mạng để dùng sau hay kết nối ngay và kiểm tra điều kiện dọn yêu cầu đã xử lý. |
| [`secrets.example.h`](firmware/AnToanESP32/secrets.example.h) | Mẫu cấu hình Wi-Fi/Firebase; sao chép thành `secrets.h` trước khi biên dịch. |

Luồng xử lý: **Sensors.h đọc tín hiệu → `.ino` lọc/ghép trạng thái bằng SafetyLogic.h → Controls.h điều khiển đầu ra → `.ino` gửi trạng thái lên Firebase → dashboard hiển thị**. `secrets.h` chứa mật khẩu thật, đã được Git bỏ qua.

### Các module dashboard

| File trong `docs/` | Nhiệm vụ |
|---|---|
| `index.html`, `styles.css`, `theme.js` | Giao diện ba tab **Tổng quan / Lịch sử / Tài khoản**, bố cục và chế độ sáng/tối. |
| `app.js` | Kết nối Firebase, đăng nhập, gửi lệnh, quản lý operator/Wi-Fi và cập nhật giao diện. |
| `config.js` | Cấu hình Firebase công khai, ID thiết bị và UID chủ sở hữu. |
| `dashboard-model.js` | Chuẩn hóa telemetry và tính trạng thái hiển thị, điều khiển, dữ liệu cũ. |
| `history-model.js` | Xử lý sự kiện, lọc khoảng ngày, thống kê và dữ liệu biểu đồ. |
| `history-device-store.js` | Gộp lịch sử từ các tài khoản cũ vào kho chung theo thiết bị. |
| `history-samples-store.js` | Lưu số đo theo phút trong IndexedDB, dự phòng bằng `localStorage`. |

## Phần cứng và kết nối

| Thiết bị | Chân ESP32 | Ghi chú |
|---|---:|---|
| Cảm biến lửa DO/S | GPIO16 | LOW = phát hiện lửa |
| MQ-2 DO | GPIO17 | LOW = vượt ngưỡng trên module |
| LED hai màu, chân đỏ | GPIO22 | Sáng khi có cảnh báo |
| LED hai màu, chân xanh | GPIO23 | Sáng khi an toàn |
| Còi | GPIO13 | Mức LOW làm còi kêu |
| L9110S kênh A | GPIO32 → A-IA; GPIO33 → A-IB | Quạt nối MOTOR A; GPIO32 Bật/Tắt, GPIO33 luôn LOW |
| DHT11 DATA | GPIO27 | Nhiệt độ °C và độ ẩm % |

Nối **GND chung** giữa ESP32 và các module. Cấp DHT11 bằng 3,3 V; cảm biến DHT11 rời có thể cần điện trở kéo lên khoảng 10 kΩ giữa DATA và 3,3 V. Nếu không lắp DHT11, đặt `#define DHT11_CONNECTED false` trong `secrets.h`.

GPIO ESP32 chỉ nhận tín hiệu mức 3,3 V. Nếu DO của MQ-2 hoặc S/DO của cảm biến lửa lên 5 V, đo và chuyển mức trước khi nối GPIO16/17; ngắt nguồn trước khi đổi dây. MQ-2 cần làm nóng và chỉnh ngưỡng DO bằng biến trở. Firmware chỉ dùng DO, không đọc AO hay đo ppm. Cấp nguồn quạt theo điện áp và dòng của motor, không cấp motor trực tiếp từ GPIO.

## Cấu hình Firebase và Wi-Fi

1. Trong Firebase Console, bật **Realtime Database** và **Authentication → Sign-in method → Email/Password**.
2. Tạo tài khoản **thiết bị** cho ESP32 và tài khoản **chủ sở hữu** để đăng nhập dashboard. Lấy UID của từng tài khoản trong Authentication → Users.
3. Với Firebase project hiện tại, kiểm tra UID trong `firebase.rules.json` rồi áp dụng tại Realtime Database → Rules. Với project mới, thay `OWNER_UID_HERE` và `DEVICE_UID_HERE` trong `firebase.rules.template.json` bằng UID thật rồi Publish.
4. Sao chép `firmware/AnToanESP32/secrets.example.h` thành `firmware/AnToanESP32/secrets.h`. Điền `WIFI_SSID`, `WIFI_PASSWORD`, `FIREBASE_API_KEY`, `FIREBASE_DATABASE_URL`, `DEVICE_EMAIL`, `DEVICE_PASSWORD` của tài khoản thiết bị.
5. Nếu dùng Firebase project mới, cập nhật Web config ở `docs/config.js`. ID thiết bị trong `docs/config.js`, hằng `DEVICE_ID` trong `.ino` và nhánh `devices/<deviceId>` của Rules phải trùng nhau. ID hiện tại là `esp32s-30p-01`.

### Tài khoản và phân quyền

Sau khi đăng nhập, mở tab **Tài khoản**. Chủ sở hữu có thể tạo tài khoản operator bằng email và mật khẩu tạm; web cấp quyền tại `operators/<uid>` theo Database Rules hiện có mà không đổi phiên đăng nhập của chủ sở hữu. Mọi tài khoản đăng nhập bằng Email/Password có thể đổi mật khẩu của chính mình sau khi xác nhận mật khẩu hiện tại. Với Firebase project mới, `ownerUid` trong `docs/config.js` phải trùng UID chủ sở hữu trong Database Rules. Chỉ UID chủ sở hữu được Rules cho phép cấp quyền operator; việc ẩn form trên web không phải là cơ chế phân quyền.

Mục **Tài khoản đã cấp quyền** cho chủ sở hữu xem và thu hồi quyền từng operator; khi thu hồi, tài khoản biến mất khỏi danh sách. Áp dụng `firebase.rules.json` mới trong Firebase Console trước khi dùng danh sách này; quyền đọc toàn bộ danh sách chỉ dành cho chủ sở hữu. Tài khoản được tạo từ phiên bản này lưu email ở `operatorProfiles/<uid>`; tài khoản cũ chỉ hiện UID. Thu hồi quyền không xóa tài khoản Firebase Authentication, nhưng chặn quyền đọc dữ liệu và điều khiển thiết bị theo Database Rules.

Firebase Authentication vẫn cho phép đăng ký tài khoản qua API khi Email/Password signup được bật. Tài khoản tự đăng ký không có quyền xem hoặc điều khiển thiết bị nếu chưa được chủ sở hữu cấp trong `operators/<uid>`. Nếu cần chặn hoàn toàn việc tự đăng ký tài khoản, phải chuyển thao tác tạo tài khoản sang dịch vụ quản trị phía máy chủ.

### Thêm và quản lý Wi-Fi từ web

Chủ sở hữu có thể thêm Wi-Fi cho ESP32 trong tab **Tài khoản** sau khi nạp firmware hỗ trợ tính năng này **một lần** và áp dụng Database Rules tương ứng:

1. Giữ ESP32 trực tuyến trên một mạng đã lưu để nhận yêu cầu.
2. Nhập SSID của mạng 2,4 GHz (1–32 byte) và mật khẩu WPA dài 8–63 ký tự ASCII in được.
3. Gửi yêu cầu và chờ trạng thái phản hồi trước khi đổi cấu hình router.

ESP32 lưu thông tin vào NVS, giữ tối đa **8 mạng** và thay mạng cũ nhất khi đầy. Khi mất kết nối, thiết bị quét và thử các mạng đã lưu theo cường độ tín hiệu. Những lần thêm Wi-Fi sau không cần nạp firmware.

| Tình huống | Cách xử lý |
|---|---|
| Mạng mới chưa xuất hiện hoặc đổi mật khẩu cho SSID đang kết nối | Lưu thông tin để dùng sau, giữ kết nối hiện tại. |
| Mạng khác đã xuất hiện | Lưu rồi thử kết nối và kiểm tra truy cập Firebase. |
| Kết nối mới chưa xác minh được | Giữ thông tin đã lưu và thử kết nối lại mạng đã biết; trạng thái **đã lưu** chưa có nghĩa là mật khẩu mới đã được kiểm chứng. |

Chủ sở hữu có thể bấm **Hiện mật khẩu đã lưu** để lấy mật khẩu từ ESP32; web tự ẩn sau 60 giây. Phản hồi nằm tại `devices/<deviceId>/wifiReveal`: chỉ chủ sở hữu được đọc, thiết bị được ghi; chủ sở hữu và thiết bị được xóa. Web xóa phản hồi sau khi đọc; thiết bị bắt đầu dọn sau 60 giây nếu phản hồi còn tồn tại và thử lại khi cần. Yêu cầu thêm mạng chứa mật khẩu được gửi qua Firebase cho riêng chủ sở hữu và thiết bị, rồi firmware xóa sau khi xử lý. Hãy đợi web báo **đã lưu** trước khi đổi tên router; nhập sai SSID hoặc mật khẩu có thể khiến thiết bị mất kết nối.

Không đưa mật khẩu vào `docs/` hoặc commit `secrets.h`. `docs/config.js` là cấu hình web công khai; quyền đọc/ghi do Authentication và Database Rules quyết định. Mật khẩu Wi-Fi mới được lưu tạm trong nhánh `commands/wifi` của Realtime Database trong lúc chờ thiết bị xử lý; giới hạn quyền đọc nhánh này ở chủ sở hữu và thiết bị.

## Biên dịch và nạp firmware

### 1. Xác định cổng COM của ESP32

Dùng **cáp USB truyền dữ liệu** nối ESP32 với máy. Trong Windows, mở **Device Manager → Ports (COM & LPT)**; hoặc mở **Arduino IDE → Tools → Port**. Ghi danh sách cổng, rút ESP32 rồi cắm lại: cổng biến mất và xuất hiện lại là cổng cần chọn. Đừng chọn COM của Bluetooth hay COM1 chỉ vì chúng đang hiện trong danh sách.

Trên máy phát triển project, thiết bị USB-SERIAL CH340 từng hiện là **COM10**. Hãy xác nhận bằng thao tác rút/cắm vì số COM có thể thay đổi. Có thể xem tên cổng bằng PowerShell:

```powershell
Get-PnpDevice -PresentOnly -Class Ports | Select-Object FriendlyName, InstanceId
```

Nếu cắm ESP32 mà không có cổng USB Serial/CH340/CP210x mới, thử cáp dữ liệu khác, cổng USB khác và kiểm tra driver USB-Serial phù hợp với bo.

### 2. Chuẩn bị Arduino IDE

Cài **Arduino IDE 2**, board core **ESP32 3.3.12** trong Boards Manager và các thư viện sau trong Library Manager: **ArduinoJson 7.4.3**, **DHT sensor library 1.4.7**, **Adafruit Unified Sensor**. Tạo `secrets.h` trước khi bấm Verify.

### 3. Nạp bằng Arduino IDE

1. Mở `firmware/AnToanESP32/AnToanESP32.ino`. Các file `.h` phải nằm cùng thư mục sketch.
2. Chọn **Tools → Board → ESP32 Dev Module**, **Tools → Partition Scheme → Minimal SPIFFS (1.9MB APP with OTA)** và **Tools → Port → COM của ESP32**.
3. Bấm **Verify**, rồi **Upload**. Đóng Serial Monitor hoặc phần mềm khác đang giữ COM trước khi nạp. Nếu dừng ở `Connecting...`, giữ nút **BOOT** đến khi bắt đầu ghi rồi thả.
4. Khi nạp xong, mở **Tools → Serial Monitor**, đặt **115200 baud**. Nhấn **EN/RESET** nếu cần để xem log khởi động, Wi-Fi, Firebase và cảm biến.

### Hoặc nạp bằng script Windows

Chạy `nap-esp32.bat` tại thư mục gốc sau khi đã cài board core, thư viện và tạo `secrets.h`. Script tìm `arduino-cli`, biên dịch, tìm cổng COM, nạp và mở Serial Monitor 115200. Nếu script liệt kê nhiều cổng, nhập đúng COM đã xác nhận bằng rút/cắm (ví dụ `COM10`); không nhận cổng mặc định nếu đó là Bluetooth. Nhấn `Ctrl+C` để thoát Serial Monitor của script.

## Hành vi cảnh báo và dashboard

- ESP32 đọc DO lửa/gas khoảng mỗi 20 ms và lọc xung ngắn; DHT11 được đọc mỗi 2,5 giây. Cảnh báo cảm biến được ưu tiên gửi ngay; thay đổi điều khiển liên tiếp được gom để các lần gửi cách nhau ít nhất 1 giây, tránh quá tải Firebase. Nếu trạng thái không đổi, telemetry được làm mới mỗi 5 giây khi mạng hoạt động.
- An toàn: LED xanh sáng. Có lửa hoặc gas: LED đỏ sáng, còi kêu liên tục. Gas tự bật quạt; khi hết gas đã xác nhận, quạt thông gió thêm 3 giây. Có lửa thì quạt dừng ngay, kể cả khi đồng thời có gas. Tín hiệu DO gas phải ổn định 100 ms để báo và 200 ms để xác nhận an toàn; từ lúc DO hết báo đến khi quạt dừng sẽ khoảng 3,2 giây nếu tín hiệu ổn định.
- Web cho chọn LED **Tự động / Đỏ / Xanh / Tắt**, còi **Tự động / Bật / Tắt**, quạt **Bật / Tắt**. Trong cảnh báo, LED đỏ và còi được ưu tiên. Nút **Tắt tiếng còi 30 giây** chỉ tắt còi; LED, quạt và cảm biến vẫn hoạt động.
- Web khóa lệnh nếu telemetry cũ hơn 15 giây. Sau khi gửi, web chờ ESP32 xác nhận bằng `appliedCommandId`; quá 20 giây chưa xác nhận sẽ báo lỗi. ESP32 bỏ qua lệnh cũ còn trên Firebase sau khi khởi động lại.

### Lịch sử và biểu đồ

Tab **Lịch sử** có bộ chọn khoảng báo cáo:

| Khoảng | Cách hiển thị nhiệt độ/độ ẩm |
|---|---|
| **Hôm nay**, **Hôm qua** | Số đo theo từng phút trong ngày. |
| **1 tuần**, **1 tháng** | Trung bình từng ngày có dữ liệu; lần lượt là 7 và 30 ngày lịch tính cả hôm nay. |
| **Tùy chọn** | Chọn ngày bắt đầu/kết thúc, tối đa 92 ngày và không sau hôm nay. Một ngày hiển thị theo phút; nhiều ngày hiển thị trung bình ngày. |

Các thống kê và biểu đồ cảnh báo dùng cùng khoảng đã chọn. Biểu đồ cảnh báo chỉ hiện ngày có phát hiện lửa hoặc khí gas; thao tác người dùng có thống kê riêng. Danh sách hoạt động hỗ trợ lọc theo nguồn, theo ngày và phân trang **50 mục/trang**. Có thể xóa riêng sự kiện hệ thống, thao tác người dùng hoặc toàn bộ lịch sử; xóa toàn bộ cũng xóa số đo đã lưu.

Lịch sử được tách theo thiết bị và dùng chung khi đổi tài khoản trên cùng trình duyệt, cùng địa chỉ web. Dữ liệu từ các khóa tài khoản cũ được gộp sang kho chung. Số đo được lưu tối đa một mẫu mỗi phút trong IndexedDB; sự kiện và thao tác nằm trong `localStorage`. Nếu IndexedDB không khả dụng, số đo dùng `localStorage`.

**Số đo và sự kiện cảm biến chỉ được ghi khi dashboard đang nhận dữ liệu còn mới.** Firebase lưu trạng thái hiện tại, không lưu kho lịch sử này; mở lại web không lấy bù được số đo hoặc sự kiện đã bỏ lỡ. Lịch sử không đồng bộ giữa các trình duyệt, máy tính hoặc giữa bản local và GitHub Pages. Xóa dữ liệu trang web trong trình duyệt cũng làm mất lịch sử cục bộ.

Tùy chọn **Ghi nhớ đăng nhập** giữ phiên Firebase sau khi đóng trình duyệt; trang không lưu mật khẩu đăng nhập trong `localStorage`.

Dashboard nằm trong `docs/`. Trên Windows dùng `chay-web-local.bat`; nếu có Python, có thể chạy `python -m http.server 8000 --directory docs` tại thư mục gốc. Bản GitHub Pages của project: [Trạm giám sát an toàn](https://vietdhcn.github.io/esp32-safety-monitor/).

## Kiểm thử

### Kiểm tra tự động trên máy tính

Chạy tại thư mục gốc với Node.js hỗ trợ `node --test`; project không có dependency npm phải cài:

```powershell
npm test
```

Các bài kiểm tra bao phủ logic an toàn, đầu ra firmware, điều khiển dashboard, đăng nhập, lịch sử, cấu hình Wi-Fi và cấu trúc Database Rules. Bài kiểm tra C++ chạy khi máy có `g++` hoặc `clang++` trong `PATH`; nếu thiếu, bài đó được bỏ qua. Các bài kiểm tra Rules trong bộ này kiểm tra nội dung file, không thay thế việc kiểm tra quyền trên Firebase thực tế.

Để chạy kiểm tra giao diện lịch sử bằng Chromium ở các chiều rộng 1280, 390 và 320 px, cài Python và Playwright rồi chạy:

```powershell
python -m pip install playwright
python -m playwright install chromium
python test/history_ui_check.py
```

Script tự mở HTTP server tạm và chạy ở chế độ demo, không cần ESP32 hoặc tài khoản Firebase.

### Kiểm tra với ESP32 thật

Sau khi nạp bo, thử lần lượt cảm biến lửa, MQ-2, cả hai cảm biến, quạt bật/tắt và nút tắt tiếng còi 30 giây; đối chiếu LED, còi, quạt, Serial Monitor và dashboard.

Có thể theo dõi telemetry trong khoảng 90 giây bằng Python:

```powershell
python tools/check-telemetry-heartbeat.py
```

Script đọc cấu hình trong `secrets.h`, đăng nhập bằng tài khoản thiết bị và đọc telemetry mỗi 5 giây. Script báo lỗi nếu dữ liệu cũ quá 30 giây, `uptimeS` giảm hoặc `hardwareId` thay đổi; đồng thời đếm mẫu cũ quá 15 giây theo ngưỡng khóa điều khiển trên web. Cần ESP32 đang chạy và kết nối Internet. Nếu đổi ID thiết bị, sửa đường dẫn `devices/esp32s-30p-01/telemetry` trong script cho khớp.

## Sự cố thường gặp

| Hiện tượng | Kiểm tra |
|---|---|
| Không thấy cổng COM mới | Cáp USB phải truyền dữ liệu; thử cổng USB khác và driver CH340/CP210x đúng với bo. |
| Upload báo cổng bận hoặc kẹt `Connecting...` | Chọn đúng COM; đóng Serial Monitor/chương trình đang mở cổng; giữ BOOT khi bắt đầu nạp. |
| ESP32 chạy nhưng web báo dữ liệu cũ | Kiểm tra Wi-Fi, tài khoản thiết bị, Database URL, Rules và log Serial 115200. |
| Đăng nhập web được nhưng không điều khiển | Kiểm tra UID có quyền gửi lệnh, ID thiết bị giống nhau ở web/firmware/Rules và firmware đã nạp bản mới. |
| DHT11 hiện “—” | Kiểm tra DATA GPIO27, 3,3 V, GND, điện trở kéo lên nếu cần và `DHT11_CONNECTED`. |
| Báo lửa khi quạt chạy | Xem đèn DO trên module lửa và log `Alarm changed` / `Monitor ... rawFlame=...` ở Serial Monitor; kiểm tra nguồn, GND, dây DO và ngưỡng cảm biến. |
| Web báo cần firmware Bật/Tắt | Nạp lại firmware trong thư mục này; web khóa nút quạt khi còn nhận telemetry từ bản PWM cũ. |
