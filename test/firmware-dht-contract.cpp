#include "../firmware/AnToanESP32/DhtSample.h"

static_assert(dhtSampleChanged(false, 0, 0, true, 30, 50));
static_assert(dhtSampleChanged(true, 30, 50, false, 0, 0));
static_assert(dhtSampleChanged(true, 30, 50, true, 31, 50));
static_assert(dhtSampleChanged(true, 30, 50, true, 30, 51));
static_assert(!dhtSampleChanged(true, 30, 50, true, 30, 50));
static_assert(!dhtSampleChanged(false, 0, 0, false, 0, 0));
