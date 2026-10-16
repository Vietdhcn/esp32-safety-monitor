#pragma once

// Gui so do moi ngay khi DHT11 thay doi gia tri hoac tinh trang ket noi.
constexpr bool dhtSampleChanged(bool wasValid, float previousTemperature,
                                float previousHumidity, bool valid,
                                float temperature, float humidity) {
  return wasValid != valid ||
         (valid && (previousTemperature != temperature || previousHumidity != humidity));
}
