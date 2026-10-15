# Giám sát an toàn ESP32S 30P

Dashboard GitHub Pages theo dõi cảm biến lửa, MQ-2, relay quạt, nhiệt độ và độ ẩm DHT11. Lệnh quạt và số đo truyền qua Firebase Realtime Database. Sketch vẫn gửi các giá trị V0–V5 đến ERa.

## Trạng thái hiện tại

Bản làm việc cục bộ đã được gộp vào một file `CodeESP32/BaiTapLon.ino` theo yêu cầu. File này chứa cấu hình riêng và được Git bỏ qua. Bản cũ được lưu trong `CodeESP32/.backup/`; mã nguồn có thể chia sẻ nằm trong `firmware/ESP32Safety/` và đọc cấu hình từ `secrets.h`.

Board **ESP32S 30P / ESP32-D0WD-V3, flash 4 MB** đã được nạp qua COM10. Firebase đã nhận liên tục trạng thái cảm biến lửa, cảnh báo gas DO và relay. DHT11 và MQ-2 AO chưa được nối, nên các số đo tương ứng chưa có dữ liệu.

| Thiết bị | GPIO ESP32S 30P | Ghi chú |
|---|---:|---|
| Flame DO | 16 | Mức LOW là cảnh báo, như code cũ |
| MQ-2 DO | 17 | Mức LOW là cảnh báo, như code cũ |
| Còi | 13 | Giữ logic code mẫu đã chạy: HIGH khi bình thường, đảo mức mỗi vòng khi cảnh báo |
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

Sketch đọc DO khoảng mỗi 100 ms để tự bật quạt khi có cảnh báo gas, kể cả khi web/Firebase mất kết nối. DHT11 được đọc mỗi 2,5 giây. Firebase được cập nhật khoảng 2 giây một lần. Khi dữ liệu quá 15 giây, web báo ngoại tuyến và khóa điều khiển thủ công. ERa V2 giữ hành vi nhấn để đảo trạng thái từ code mẫu; lệnh web là trạng thái bật/tắt và được đọc lại mỗi lần đồng bộ Firebase. Cảnh báo gas luôn buộc quạt bật.

Các hàm cảm biến được giữ theo mẫu đã hoạt động: `task_1` đọc D16/D17 và xử lý còi/LED; `onPan` và `offPan` điều khiển D32/D33; `send_data_period` gửi giá trị thô lửa/gas và trạng thái quạt lên ERa V0–V2. `connectConfiguredWiFi` xử lý Wi-Fi; `pollFanCommand` nhận lệnh web; `publishTelemetry` gửi trạng thái thật lên Firebase. GPIO16/17 ở mức LOW được hiển thị thành cảnh báo trên web. Hàm `timerEvent` gửi uptime vào V1 của mẫu không được đăng ký vì V1 đang dùng cho gas.

Khi khởi động, sketch quét và thử lần lượt tối đa 8 điểm phát có cùng tên Wi-Fi đã cấu hình, mỗi điểm tối đa 12 giây. Cách này đã xử lý trường hợp thực tế hai điểm phát cùng tên: điểm mạnh nhất xác thực thất bại, điểm còn lại kết nối và gửi dữ liệu Firebase thành công. Tác vụ cảm biến vẫn chạy trong lúc kết nối. Serial Monitor 115200 hiển thị mã trạng thái Wi-Fi, lỗi ngắt kết nối và kết quả xác thực Firebase; không in mật khẩu.

Nếu mở `CodeESP32/BaiTapLon.ino` bằng Arduino IDE, IDE có thể yêu cầu chuyển file vào thư mục `BaiTapLon` trùng tên sketch. Chọn đồng ý; toàn bộ mã vẫn nằm trong một file `.ino`.

## Chạy web và đưa lên GitHub Pages

- Kiểm thử logic giao diện: `npm test`.
- Xem tại máy: chạy `python -m http.server 8000 --directory docs` trong thư mục dự án, sau đó mở `http://localhost:8000`.
- Xem trước dashboard khi chưa có tài khoản Firebase/ESP32: mở `http://localhost:8000/?demo=1`. Chế độ này chỉ chạy trên localhost và dùng số liệu mẫu; nút quạt không gửi lệnh đến thiết bị.
- Repository đã được đưa lên GitHub và GitHub Pages đã chọn nhánh `main`, thư mục `/docs`: `https://vietdhcn.github.io/esp32-safety-monitor/`.

Tài khoản GitHub không thay thế Firebase: GitHub chứa mã web, Firebase cung cấp dữ liệu thời gian thực. `CodeESP32/` được Git bỏ qua vì sketch và các bản sao lưu chứa token ERa, mật khẩu Wi-Fi và mật khẩu thiết bị. Repository không chứa cấu hình riêng này.

## Nguồn kỹ thuật

- [GitHub Pages là dịch vụ host trang tĩnh](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Firebase Realtime Database REST và xác thực](https://firebase.google.com/docs/database/rest/auth)
- [Firebase Authentication REST API](https://firebase.google.com/docs/reference/rest/auth/)
- [Firebase Database Security Rules](https://firebase.google.com/docs/database/security)
- [Chân ADC của ESP32 thường](https://documentation.espressif.com/esp32_datasheet_en.html)
- [Chân ESP32-C3 để phân biệt loại board](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-reference/peripherals/gpio.html)
