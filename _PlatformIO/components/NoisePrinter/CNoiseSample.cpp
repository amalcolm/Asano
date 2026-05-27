#include "CNoiseSample.h"
#include <Arduino.h>
#include "C32bitTimer.h"
#include <deque>

C32bitTimer& getTimer(double period);

int quickNoiseTest(int numSamples, int sensorPin) {
 
  analogReadAveraging(0); // disable averaging for pure noise sample
  int min = analogRead(sensorPin);
  int max = min;

  for (int i = 1; i < numSamples; i++) {
    int sample = analogRead(sensorPin);

    if (sample < min) min = sample;
    if (sample > max) max = sample;
  }
  analogReadAveraging(4); // restore default averaging

  return max - min;
}

void FillBufferWithNoise(TimedSample* buffer, size_t size, int sensorPin, double period) {
  C32bitTimer& noiseTimer = getTimer(period);

  if (period < 0.0) 
    analogReadAveraging(0);
 
  noiseTimer.reset();
  bool wait = period > 0.0;
  for (size_t i = 0; i < size; i++) {
    buffer[i].startTick = noiseTimer.getTicksSinceReset();
    buffer[i].sample = analogRead(sensorPin);
    buffer[i].endTick = noiseTimer.getTicksSinceReset();

    if (wait) noiseTimer.wait();
  }

  analogReadAveraging(4); // restore default averaging
}


C32bitTimer& getTimer(double period) { if (period > 7.2) ERROR("getTimer: duration too long: %.2f seconds (max is ~7.2 seconds)", period);
  static std::deque<std::pair<double, C32bitTimer>> s_timers;
  
  for (auto& [p, timer] : s_timers) if (p == period) return timer;

  C32bitTimer timer = C32bitTimer::From_S(period).setPeriodic(true);
  s_timers.emplace_back(period, timer);
  return s_timers.back().second;
}