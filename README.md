# Trạm giám sát an toàn ESP32

ESP32 đọc cảm biến và điều khiển đầu ra tại chỗ; Firebase Realtime Database chuyển dữ liệu và lệnh cho dashboard GitHub Pages. Mất Wi-Fi không làm dừng cảnh báo cục bộ.

## Phần cứng

| Chức năng | GPIO | Hành vi |
|---|---:|---|
| Cảm biến lửa DO | 16 | LOW là phát hiện lửa |
| MQ-2 DO | 17 | LOW là vượt ngưỡng gas trên module |
| LED lửa | 22 | Sáng khi có lửa |
| LED gas | 23 | Sáng khi có gas |
| Còi | 13 | LOW là kêu; nháy khi có lửa hoặc gas |
| Driver quạt L9110S kênh A | 32 (A-IA), 33 (A-IB) | D32 PWM 1 kHz, D33 LOW; quạt ở MOTOR A |
| DHT11 DATA | 27 | Tùy chọn, bật `DHT11_CONNECTED` sau khi đấu dây |
| MQ-2 AO | 34 | Tùy chọn, bật `MQ2_AO_CONNECTED` sau khi qua mạch chia áp |

Ảnh mạch người dùng gửi cho thấy module HW-020/L9110S hai kênh, không phải relay. Bảng trên theo cách code cũ chạy quạt ở D32 HIGH, D33 LOW; kiểm tra lại hai dây điều khiển thực tế trước khi nạp. PWM là **mức điều khiển 0–100%**, không phải tốc độ RPM đo được. Gas luôn ép quạt 100%; điều khiển tay chỉ áp dụng khi không có gas. Nút **Tắt quạt** có hiệu lực ở chế độ tay. Mức 0% tương đương tắt quạt.

MQ-2 dùng nguồn phù hợp module. Nếu DO/AO lên 5 V, phải hạ về tối đa 3,3 V trước khi vào ESP32; nối chung GND. MQ-2 cần thời gian làm nóng và chỉnh ngưỡng DO trên biến trở. Giá trị AO trên web chỉ là tỷ lệ ADC, không phải ppm. Driver L9110S cần nguồn quạt riêng phù hợp điện áp và dòng của quạt; không lấy nguồn motor trực tiếp từ GPIO.

## Logic cảnh báo

- Lửa bật LED D22; gas bật LED D23 và quạt; cả hai nguồn cùng bật cả hai LED. Còi nháy khi có một trong hai cảnh báo. Lệnh quạt, hai LED và còi được tính riêng trong vòng điều khiển 100 ms.
- Mỗi LED và còi có chế độ **Tự động / Bật / Tắt** khi không có cảnh báo tương ứng. Trong cảnh báo, đầu ra an toàn tương ứng được ưu tiên.
- **Tạm tắt 30 giây** tắt các đầu ra nhưng vẫn đọc và hiển thị cảm biến. Hết hạn, nguy cơ còn thì đầu ra tự bật lại. Không có chức năng tắt cảnh báo vĩnh viễn.
- Web khóa lệnh khi telemetry cũ hơn 15 giây; lệnh được xác nhận bằng `appliedCommandId` từ ESP32. Web báo chưa xác nhận sau 20 giây.
- Sau mỗi lần khởi động, ESP32 bỏ qua lệnh điều khiển cũ còn lưu trên Firebase; quạt tay mặc định tắt. Lệnh mới từ web có `commandId` mới sẽ được áp dụng.

## Cấu hình và nạp

1. Sao chép `firmware/AnToanESP32/secrets.example.h` thành `secrets.h` cùng thư mục. Điền Wi-Fi, Firebase API key, URL Database và tài khoản **thiết bị**. File riêng đã bị Git bỏ qua. Không đặt mật khẩu trong `docs/`.
2. Dùng Firebase Authentication Email/Password cho tài khoản thiết bị và người xem. Áp dụng `firebase.rules.json` trong Realtime Database Rules; `firebase.rules.template.json` là mẫu khi thay UID.
3. Mở `firmware/AnToanESP32/AnToanESP32.ino` trong Arduino IDE. Chọn **ESP32 Dev Module**, Arduino ESP32 core 3.3.12, Partition Scheme **Minimal SPIFFS (1.9MB APP with OTA)**. Cài ArduinoJson 7.4.3, DHT sensor library 1.4.7 và Adafruit Unified Sensor. Biên dịch trước khi nạp.
4. Mở Serial Monitor 115200 để xem kết nối Wi-Fi/Firebase và trạng thái cảm biến. Sau khi nạp, thử riêng từng DO, cả hai DO, bật/tắt quạt, mức PWM và tạm tắt 30 giây.

## Web

- Kiểm thử: `npm test`.
- Xem tại máy: `python -m http.server 8000 --directory docs`, mở `http://localhost:8000/?demo=1` để thử giao diện không cần ESP32.
- GitHub Pages phục vụ thư mục `docs/`: [Trạm giám sát](https://vietdhcn.github.io/esp32-safety-monitor/).

`docs/config.js` chỉ chứa Firebase Web config công khai. Quyền đọc/ghi thật nằm trong Database Rules. Firmware chỉ đọc lệnh, ghi telemetry và dùng HTTPS xác thực chứng chỉ.
