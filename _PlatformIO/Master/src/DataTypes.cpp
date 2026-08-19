#include "DataTypes.h"
#include "CMasterTimer.h"
#include "Setup.h"
#include "Arduino.h"
#include "CUSB.h"
#include "CHead.h"
#include "Config.h"
#include "HWforState.h"

static constexpr uint32_t CHANNELS_BYTESIZE = NUM_CHANNELS * sizeof(int32_t);


DataType::DataType() 
  : state(UNSET), stateTime(0.0), hardwareState(0), sensorState(0) { 
  timestamp = Timer.getConnectTime();
  stateTime = Timer.getStateTime();

  memset(&channels[0], 0, CHANNELS_BYTESIZE );
}

DataType::DataType(StateType state) 
  : state(state), stateTime(0.0), hardwareState(0), sensorState(0) {

  timestamp = Timer.getConnectTime();
  stateTime = Timer.getStateTime();

  memset(&channels[0], 0, CHANNELS_BYTESIZE ); 
}

void DataType::debugSerial() {
  USB.printf("C0:%d\n", channels[0]);
}

void DataType::writeSerial(bool includeFrameMarkers) {
  if (includeFrameMarkers) USB.write(FRAME_START);
  
  USB.write(state);
  USB.write(timestamp);
  USB.write(stateTime);
  USB.write(hardwareState);
  USB.write(sensorState);
  USB.write(sensor1);
  USB.write(sensor2);
  USB.write((uint8_t*)&channels[0], CHANNELS_BYTESIZE);

  if (includeFrameMarkers) USB.write(FRAME_END);
}

uint32_t clamp16bit(double value) {
  if (value < 0) return 0;
  if (value > 0xffff) return 0xffff;
  return static_cast<uint32_t>(std::round(value));
}

void DataType::fillFromHardware(struct HWforState& HW, bool setTimestamp) {
  static uint8_t seq = 0;
  state = HW.state;

  if (setTimestamp) {
    timestamp = Timer.getConnectTime();
    stateTime = Timer.getStateTime();
  }

  hardwareState =
    (uint64_t(HW.mid   .getLevel() & 0xFFu) << 56) |
    (uint64_t(HW.top   .getLevel() & 0xFFu) << 48) |
    (uint64_t(HW.bot   .getLevel() & 0xFFu) << 40) |
    (uint64_t(++seq)                        << 32) |
    (uint64_t(HW.offset.getLevel() & 0xFFu) << 24) |
    (uint64_t(HW.gain  .getLevel() & 0xFFu) << 16) | 
    (0xFFFFu);

  if (Timer.sampleReady) {
    sensorState = (clamp16bit(HW.sensor1.lastValue()) << 16) |
                  (clamp16bit(HW.sensor2.lastValue())      );
  } else {
    sensorState = (uint32_t(analogRead(HW.sensor1.getPin())) << 16) |
                  (uint32_t(analogRead(HW.sensor2.getPin()))      );
  }

  double sv1 = HW.sensor1.lastV(); if (sv1 < 0) sv1 = static_cast<double>(analogRead(HW.sensor1.getPin()));
  double sv2 = HW.sensor2.lastV(); if (sv2 < 0) sv2 = static_cast<double>(analogRead(HW.sensor2.getPin()));   
  sensor1 = sv1;
  sensor2 = sv2;

  lightEnv = HW.sensor2.env();

  if (Timer.sampleReady == false)
    memset(&channels[0], 0, CHANNELS_BYTESIZE);
  
}



BlockType::BlockType() : timestamp(0.0), state(UNSET), count(0), numEvents(0) {
  data   = new DataType[CFG::MAX_BLOCKSIZE];
  events = new EventType[CFG::MAX_EVENTS_PER_BLOCK];
}

BlockType::~BlockType() {
  delete[] data;
  delete[] events;
}

void BlockType::clear() {
  timestamp = 0.0;
  state = UNSET;
  count = 0;
  numEvents = 0;
}

bool BlockType::tryAddEvent(const EventKind kind, double stateTime) {
  if (stateTime < 0) stateTime = Timer.getStateTime();

  if (numEvents >= CFG::MAX_EVENTS_PER_BLOCK) return false;

  EventType& event = events[numEvents++];
  event.kind = kind;
  event.stateTime = stateTime;

  return true;
}

void BlockType::writeSerial(bool includeFrameMarkers) {
  if (includeFrameMarkers) USB.write(FRAME_START);

  USB.write(state);
  USB.write(timestamp);
  USB.write(count);
  USB.write(numEvents);

  for (uint32_t i = 0; i < count; i++) {
    DataType& item = data[i];

    // omit state as all data in block share same state
    USB.write(item.timestamp);
    USB.write(item.stateTime);
    USB.write(item.hardwareState);
    USB.write(item.sensorState);
    USB.write(item.sensor1);
    USB.write(item.sensor2);
    USB.write(item.lightEnv);
    USB.write((uint8_t*)&item.channels[0], CHANNELS_BYTESIZE);
  }

  for (uint32_t i = 0; i < numEvents; i++) {
    EventType& event = events[i];
    USB.write((uint8_t&)event.kind);
    USB.write(event.stateTime);
  }
  
  if (includeFrameMarkers) USB.write(FRAME_END);
}

void BlockType::debugSerial() {
  USB.printf("N:%d", count);
  uint32_t limit = std::min(count, DEBUG_BLOCKSIZE);
  for(uint32_t i = 0; i < limit; i++) {
    USB.printf("\t S1:%.2lf", data[i].sensor1);
    USB.printf("\t S2:%.2lf", data[i].sensor2);
    USB.printf("\t LE:%.2lf", data[i].lightEnv);
  }
  USB.printf("\n");
}

void RawSignalType::writeSerial(bool includeFrameMarkers) {
  if (includeFrameMarkers) USB.write(FRAME_START);

  USB.write(timestamp);
  USB.write(state);
  USB.write(count);
  for (uint32_t i = 0; i < count && i < MAX_SAMPLES; i++) {
    TimedSample& item = data[i];
    USB.write(item.startTick);
    USB.write(item.sample);
    USB.write(item.endTick);
  }

  if (includeFrameMarkers) USB.write(FRAME_END);
}


void DebugType::writeSerial(bool includeFrameMarkers) {
  if (includeFrameMarkers) USB.write(FRAME_START);

  USB.write(timestamp);
  USB.write(state);
 
  if (includeFrameMarkers) USB.write(FRAME_END);
}
