#include "CTelemetry.h"
#include "../CTimer.h"

#pragma managed(push, off)

#include <algorithm>
#include <mutex>

namespace {
  std::mutex& telemetryMutex() {
      static std::mutex mutex;
      return mutex;
  }
  
  double currentTimestampSeconds() {
      return static_cast<double>(CTimer::timeAbsolute()) * CTimer::getSecondsPerTick();
  }
}

std::vector<CTelemetry*> CTelemetry::s_pool;
size_t CTelemetry::s_capacity = 0;
CTelemetry::Sink CTelemetry::s_sink = nullptr;
void* CTelemetry::s_sinkUserData = nullptr;

CTelemetry* CTelemetry::Rent() {
  std::lock_guard<std::mutex> lock(telemetryMutex());

  if (s_pool.empty()) {

    if (s_capacity < maxCapacity) {
      size_t newCapacity = s_capacity == 0 ? initialCapacity : min(s_capacity * 2, maxCapacity);
      s_pool.reserve(newCapacity);
      for (size_t i = s_capacity; i < newCapacity; ++i)
        s_pool.push_back(new CTelemetry());

      s_capacity = newCapacity;
    } else {
      return new CTelemetry();
    }
  }

  CTelemetry* item = s_pool.back();
  s_pool.pop_back();
  return item;
}

void CTelemetry::Return(CTelemetry* item) {
  if (item == nullptr) return;

  std::lock_guard<std::mutex> lock(telemetryMutex());

  if (s_pool.size() < maxCapacity) {
    item->reset(); 
    s_pool.push_back(item);
  } else {
    delete item;
  }
}

void CTelemetry::init() {
  std::lock_guard<std::mutex> lock(telemetryMutex());
  if (s_capacity != 0 || s_pool.empty() == false) return;

  s_pool.reserve(initialCapacity);
  s_capacity = initialCapacity;

  for (size_t i = 0; i < s_capacity; ++i)
    s_pool.push_back(new CTelemetry());
}

void CTelemetry::log(TeleGroup group, uint16_t ID, float value) {
    log(group, 0, ID, value);
}

void CTelemetry::log(TeleGroup group, uint8_t subGroup, uint16_t ID, float value) {
  if (HasSink() == false) return;

  CTelemetry* telemetry = CTelemetry::Rent();
  telemetry->timestamp = currentTimestampSeconds();
  telemetry->group = group;
  telemetry->subGroup = subGroup;
  telemetry->ID = ID;
  telemetry->value = value;

  telemetry->writeSerial();
  Return(telemetry);
}

void CTelemetry::writeSerial(bool includeFrameMarkers) {
  Sink sink = nullptr;
  void* userData = nullptr;

  {
    std::lock_guard<std::mutex> lock(telemetryMutex());
    sink = s_sink;
    userData = s_sinkUserData;
  }

  if (sink != nullptr)
    sink(*this, includeFrameMarkers, userData);
}

void CTelemetry::reset() {
  timestamp = 0.0;
  group     = TeleGroup::PROGRAM;
  subGroup  = 0;
  ID        = 0;
  value     = 0.0f;
}

std::deque<CTelemetry*>& CTelemetry::getAllTelemetries() {
  static std::deque<CTelemetry*> all;
  return all;
}

void CTelemetry::_register(CTelemetry* tele) {
  std::lock_guard<std::mutex> lock(telemetryMutex());
  getAllTelemetries().push_back(tele);
}

void CTelemetry::SetSink(Sink sink, void* userData) {
  std::lock_guard<std::mutex> lock(telemetryMutex());
  s_sink = sink;
  s_sinkUserData = userData;
}

void CTelemetry::ClearSink() {
  SetSink(nullptr, nullptr);
}

bool CTelemetry::HasSink() {
  std::lock_guard<std::mutex> lock(telemetryMutex());
  return s_sink != nullptr;
}

void CTelemetry::logAll() {
  std::vector<CTelemetry*> telemetries;

  {
    std::lock_guard<std::mutex> lock(telemetryMutex());
    std::deque<CTelemetry*>& all = getAllTelemetries();
    telemetries.assign(all.begin(), all.end());
  }

  bool output = HasSink();
  double timestamp = currentTimestampSeconds();

  for (CTelemetry* telemetry : telemetries) {
    if (telemetry == nullptr) continue;
    telemetry->timestamp = timestamp;
    telemetry->value = telemetry->getValue();
    if (output)
      telemetry->writeSerial();
  }

}

#pragma managed(pop)
