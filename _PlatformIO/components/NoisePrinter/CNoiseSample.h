#pragma once
#include "DataTypes.h"
#include <stddef.h>

void FillBufferWithNoise(TimedSample* buffer, size_t size, int sensorPin, double period = 0.0);

int quickNoiseTest(int numSamples, int sensorPin);