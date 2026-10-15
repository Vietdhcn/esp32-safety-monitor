# Giám sát an toàn ESP32S 30P

Dashboard GitHub Pages theo dõi cảm biến lửa, MQ-2, relay quạt, nhiệt độ và độ ẩm DHT11. Lệnh quạt và số đo truyền qua Firebase Realtime Database. Sketch vẫn gửi các giá trị V0–V5 đến ERa.

## Trạng thái hiện tại

Code gốc tại `E:\01. PTJT\05. HK5\02. Hệ thống nhúng\01. BTL-Nhúng\CodeESP32\Viet\Viet.ino` dùng chân của **ESP32S 30P**, không phải ESP32-C3 MINI. Sketch mới nằm trong `firmware/ESP32Safety/`. Các chân đang dùng được giữ lại. Chưa có dữ liệu thật trên web cho đến khi bạn cấu hình Firebase, nạp sketch và đấu thêm DHT11/MQ-2 AO.

| Thiết bị | GPIO ESP32S 30P | Ghi chú |
|---|---:|---|
| Flame DO | 16 | Mức LOW là cảnh báo, như code cũ |
| MQ-2 DO | 17 | Mức LOW là cảnh báo, như code cũ |
| Còi | 13 | Giữ cách bật/tắt từ code cũ |
| LED cảnh báo | 22 | Giữ cách bật/tắt từ code cũ |
| LED trạng thái | 23 | Giữ cách bật/tắt từ code cũ |
| Relay/quạt | 32, 33 | Giữ hai ngõ ra từ code cũ; xác nhận lại phần mạch relay trước khi nạp |
| DHT11 DATA | 27 | Dây mới; VCC 3.3 V, GND chung; cảm biến trần cần điện trở kéo lên 10 kΩ |
| MQ-2 AO | 34 | Dây mới; qua mạch chia áp trước khi vào ESP32 |

**Điện áp MQ-2:** Nếu module chạy 5 V, cả AO và DO đều có thể lên mức 5 V. ESP32 chỉ nhận mức 3.3 V; hãy dùng mạch chia áp hoặc bộ chuyển mức cho từng ngõ vào. Ví dụ cho AO: 10 kΩ từ AO đến GPIO34 và 15 kΩ từ GPIO34 xuống GND, để 5 V giảm còn khoảng 3 V. Nên kiểm tra bằng đồng hồ trước khi cắm vào ESP32. Dùng GND chung. MQ-2 cần thời gian làm nóng và hiệu chuẩn; số `0–100%` trên web chỉ là tỷ lệ giá trị ADC `0–4095`, **không phải ppm** hay chỉ số an toàn sức khỏe.

## Cấu hình Firebase

GitHub Pages chỉ phục vụ HTML/CSS/JavaScript, nên cần Firebase làm nơi trung chuyển dữ liệu và lệnh.

1. Project Firebase **esp32-safety-monitor-68725**, Web app và Realtime Database tại Singapore đã được tạo.
2. **Authentication → Email/Password** đã bật. Hai tài khoản đã được tạo: chủ sở hữu và thiết bị ESP32. UID của hai tài khoản đã được điền vào `firebase.rules.json`; `firebase.rules.template.json` là mẫu để cấu hình lại khi đổi tài khoản.
3. Nội dung `firebase.rules.json` đã được xuất bản trong **Realtime Database → Rules**. Quy tắc chỉ cho tài khoản thiết bị ghi telemetry, chủ sở hữu ghi lệnh quạt và mặc định chặn truy cập khác.
4. Thông số Web app đã có trong `docs/config.js`. Firebase Web config là định danh công khai, không phải mật khẩu. Bảo vệ dữ liệu bằng Rules ở bước 3.
5. Sao chép `firmware/ESP32Safety/secrets.example.h` thành `firmware/ESP32Safety/secrets.h`, điền Wi-Fi, **token ERa mới**, Firebase API key, Database URL và email/mật khẩu **tài khoản thiết bị**. File `secrets.h` đã bị Git bỏ qua. Không đặt tài khoản chủ sở hữu, mật khẩu, token ERa hoặc private key trong `docs/`.
6. Sau khi đấu DHT11 vào GPIO27, đổi `DHT11_CONNECTED` thành `true`. Sau khi đấu MQ-2 AO qua chia áp vào GPIO34, đổi `MQ2_AO_CONNECTED` thành `true`. Giữ `false` nếu chưa đấu; web sẽ hiển thị `—` thay cho số đo giả.

## Nạp firmware

Trong Arduino IDE, chọn board **ESP32 Dev Module** cho ESP32S 30P và **Partition Scheme → Minimal SPIFFS (1.9MB APP with OTA)**. Phân vùng mặc định 1,2 MB quá nhỏ cho ERa + HTTPS. Cài các thư viện **ERa 1.6.4**, **ArduinoJson 7.4.3**, **DHT sensor library 1.4.7** và phụ thuộc **Adafruit Unified Sensor**. Mở `firmware/ESP32Safety/ESP32Safety.ino`, biên dịch và nạp. Nếu board thực tế có chân hoặc mức kích relay khác, sửa hằng số chân ở đầu sketch trước khi nạp. Bật Serial Monitor 115200 để xem lỗi HTTP Firebase.

Sketch đọc DO mỗi 100 ms để tự bật quạt khi có cảnh báo gas, kể cả khi web/Firebase mất kết nối. DHT11 được đọc mỗi 2,5 giây. Firebase được cập nhật khoảng 2 giây một lần. Khi dữ liệu quá 15 giây, web báo ngoại tuyến và khóa điều khiển thủ công. Lệnh thủ công từ ERa V2 và web được áp dụng theo trạng thái nhận mới nhất; cảnh báo gas luôn buộc quạt bật.

## Chạy web và đưa lên GitHub Pages

- Kiểm thử logic giao diện: `npm test`.
- Xem tại máy: chạy `python -m http.server 8000 --directory docs` trong thư mục dự án, sau đó mở `http://localhost:8000`.
- Xem trước dashboard khi chưa có tài khoản Firebase/ESP32: mở `http://localhost:8000/?demo=1`. Chế độ này chỉ chạy trên localhost và dùng số liệu mẫu; nút quạt không gửi lệnh đến thiết bị.
- Repository đã được đưa lên GitHub và GitHub Pages đã chọn nhánh `main`, thư mục `/docs`: `https://vietdhcn.github.io/esp32-safety-monitor/`.

Tài khoản GitHub không thay thế Firebase: GitHub chứa mã web, Firebase cung cấp dữ liệu thời gian thực. `CodeESP32/` được Git bỏ qua vì `Viet.ino` chứa token ERa và mật khẩu Wi-Fi cũ. Hãy đổi các giá trị đó trước khi công khai code gốc; repository này không chứa chúng.

## Nguồn kỹ thuật

- [GitHub Pages là dịch vụ host trang tĩnh](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Firebase Realtime Database REST và xác thực](https://firebase.google.com/docs/database/rest/auth)
- [Firebase Authentication REST API](https://firebase.google.com/docs/reference/rest/auth/)
- [Firebase Database Security Rules](https://firebase.google.com/docs/database/security)
- [Chân ADC của ESP32 thường](https://documentation.espressif.com/esp32_datasheet_en.html)
- [Chân ESP32-C3 để phân biệt loại board](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-reference/peripherals/gpio.html)
