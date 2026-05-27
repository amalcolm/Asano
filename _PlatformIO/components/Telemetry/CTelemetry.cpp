#include "CTelemetry.h"
#include "CTimer.h"
#include "Setup.h"
#include "CUSB.h"


std::vector<CTelemetry*> CTelemetry::s_pool;
size_t CTelemetry::s_capacity = 0;

CTelemetry* CTelemetry::Rent() {
  if (s_pool.empty()) {

    if (s_capacity < maxCapacity) {
      size_t newCapacity = std::min(s_capacity * 2, maxCapacity);
      s_pool.reserve(newCapacity);
      for (size_t i = s_capacity; i < newCapacity; ++i)
        s_pool.push_back(new CTelemetry());

      s_capacity = newCapacity;
    } else {
      // At max capacity: allocate new but ensure we don't add too many to the pool
      return new CTelemetry();
    }
  }

  // Reuse an existing one
  CTelemetry* item = s_pool.back();
  s_pool.pop_back();
  return item;
}

void CTelemetry::Return(CTelemetry* item) {
  if (s_pool.size() < maxCapacity) {
    item->reset(); 
    s_pool.push_back(item);
  } else {
    // Pool full → discard this one.  Doesn't matter which one gets deleted.
    delete item;
  }
}

void CTelemetry::init() {
  s_pool.reserve(initialCapacity);
  s_capacity = initialCapacity;

  for (size_t i = 0; i < s_capacity; ++i)
    s_pool.push_back(new CTelemetry());
}

void CTelemetry::log(TeleGroup group, uint16_t ID, float value) {
    log(group, 0, ID, value);
}

void CTelemetry::log(TeleGroup group, uint8_t subGroup, uint16_t ID, float value) {
  double timestamp = CTimer::timeAbsolute() * CTimer::getSecondsPerTick();

  CTelemetry* telemetry = CTelemetry::Rent();
  telemetry->timestamp = timestamp;
  telemetry->group = group;
  telemetry->subGroup = subGroup;
  telemetry->ID = ID;
  telemetry->value = value;

  USB.buffer(telemetry);
}

void CTelemetry::writeSerial(bool includeFrameMarkers) {
  if (includeFrameMarkers) USB.write(FRAME_START);
    
  USB.write(timestamp);
  USB.write(static_cast<uint8_t>(group));
  USB.write(static_cast<uint8_t>(subGroup));
  USB.write(ID);
  USB.write(value);

  if (includeFrameMarkers) USB.write(FRAME_END);
}

void CTelemetry::reset() {
  timestamp = 0.0;
  group     = TeleGroup::PROGRAM;
  ID        = 0;
  value     = 0.0f;
}

std::deque<CTelemetry*>& CTelemetry::getAllTelemetries() {
  static std::deque<CTelemetry*> all;
  return all;
}

void CTelemetry::_register(CTelemetry* tele) {
  getAllTelemetries().push_back(tele);
}


void CTelemetry::logAll() {
  bool output = USB.isHandshakeComplete();

    for (CTelemetry* telemetry : getAllTelemetries()) {
      telemetry->value = telemetry->getValue();
      if (output) telemetry->writeSerial(true);
    }
}