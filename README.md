# Trạm giám sát an toàn ESP32

Project dùng ESP32 để phát hiện lửa và khí gas, đo nhiệt độ/độ ẩm, rồi điều khiển LED, còi và quạt. ESP32 tự xử lý cảnh báo tại chỗ. Firebase Realtime Database chuyển trạng thái và lệnh giữa thiết bị với dashboard web; mất Wi-Fi không làm dừng phần cảnh báo cục bộ.

## Chạy nhanh

**Xem giao diện không cần ESP32:** trên Windows, chạy `chay-web-local.bat`. Script mở trang web local (thường là `http://localhost:8000/`); thêm `?demo=1` thành `http://localhost:8000/?demo=1` để xem dữ liệu mô phỏng. Giữ cửa sổ script mở khi dùng web. Chế độ demo chỉ thay đổi trang trên máy, không điều khiển thiết bị.

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
| `test/` | Kiểm thử logic và hợp đồng của firmware/web |

### Firmware được chia thành những file nào?

| File | Nhiệm vụ |
|---|---|
| [`AnToanESP32.ino`](firmware/AnToanESP32/AnToanESP32.ino) | Khởi động các task, nhận lệnh Firebase, ghép dữ liệu cảm biến với logic an toàn và gửi telemetry. |
| [`Sensors.h`](firmware/AnToanESP32/Sensors.h) | Khởi tạo và đọc cảm biến lửa ở GPIO16, MQ-2 ở GPIO17, DHT11 ở GPIO27; kiểm tra số đo DHT hợp lệ. |
| [`SafetyLogic.h`](firmware/AnToanESP32/SafetyLogic.h) | Bộ lọc tín hiệu DO, các mốc thời gian an toàn và hàm quyết định quạt/LED/còi từ trạng thái cảm biến và lệnh. Không đọc hoặc ghi GPIO. |
| [`Controls.h`](firmware/AnToanESP32/Controls.h) | Khởi tạo và ghi GPIO cho LED đỏ/xanh, còi và quạt L9110S. |
| [`DhtSample.h`](firmware/AnToanESP32/DhtSample.h) | Xác định khi nào số đo DHT thay đổi để cập nhật telemetry. |
| [`secrets.example.h`](firmware/AnToanESP32/secrets.example.h) | Mẫu cấu hình Wi-Fi/Firebase; sao chép thành `secrets.h` trước khi biên dịch. |

Luồng xử lý: **Sensors.h đọc tín hiệu → `.ino` lọc/ghép trạng thái bằng SafetyLogic.h → Controls.h điều khiển đầu ra → `.ino` gửi trạng thái lên Firebase → dashboard hiển thị**. `secrets.h` chứa mật khẩu thật, đã được Git bỏ qua.

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

Không đưa mật khẩu vào `docs/` hoặc commit `secrets.h`. `docs/config.js` là cấu hình web công khai; quyền đọc/ghi do Authentication và Database Rules quyết định.

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

- ESP32 đọc DO lửa/gas khoảng mỗi 20 ms và lọc xung ngắn; DHT11 được đọc mỗi 2,5 giây. Khi trạng thái đổi, firmware gửi telemetry ngay; nếu không đổi, nó làm mới dữ liệu mỗi 5 giây.
- An toàn: LED xanh sáng. Có lửa hoặc gas: LED đỏ sáng, còi kêu liên tục. Gas tự bật quạt; khi hết gas đã xác nhận, quạt thông gió thêm 3 giây. Có lửa thì quạt dừng ngay, kể cả khi đồng thời có gas. Tín hiệu DO gas phải ổn định 100 ms để báo và 200 ms để xác nhận an toàn; từ lúc DO hết báo đến khi quạt dừng sẽ khoảng 3,2 giây nếu tín hiệu ổn định.
- Web cho chọn LED **Tự động / Đỏ / Xanh / Tắt**, còi **Tự động / Bật / Tắt**, quạt **Bật / Tắt**. Trong cảnh báo, LED đỏ và còi được ưu tiên. Nút **Tắt tiếng còi 30 giây** chỉ tắt còi; LED, quạt và cảm biến vẫn hoạt động.
- Web khóa lệnh nếu telemetry cũ hơn 15 giây. Sau khi gửi, web chờ ESP32 xác nhận bằng `appliedCommandId`; quá 20 giây chưa xác nhận sẽ báo lỗi. ESP32 bỏ qua lệnh cũ còn trên Firebase sau khi khởi động lại.
- Tab **Lịch sử** lưu tối đa 100 mục trong `localStorage` của từng trình duyệt, tách theo tài khoản và thiết bị. Lịch sử này không được lưu trên Firebase. Tùy chọn **Ghi nhớ đăng nhập** giữ phiên Firebase sau khi đóng trình duyệt; trang không lưu mật khẩu trong `localStorage`.

Dashboard nằm trong `docs/`. Trên Windows dùng `chay-web-local.bat`; nếu có Python, có thể chạy `python -m http.server 8000 --directory docs` tại thư mục gốc. Bản GitHub Pages của project: [Trạm giám sát an toàn](https://vietdhcn.github.io/esp32-safety-monitor/).

## Kiểm thử

Chạy `npm test` tại thư mục gốc (cần Node.js; project không có dependency npm phải cài). Bài kiểm tra C++ chạy khi máy có `g++` hoặc `clang++`; nếu thiếu, bài đó được bỏ qua. Sau khi nạp bo, thử lần lượt cảm biến lửa, MQ-2, cả hai cảm biến, quạt bật/tắt và nút tắt tiếng còi 30 giây; đối chiếu LED, còi, quạt, Serial Monitor và dashboard.

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
