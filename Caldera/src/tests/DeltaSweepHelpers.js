export const DISCARD_SAMPLE_COUNT = 2;
export const AVERAGE_SAMPLE_COUNT = 8;

export function beginVoltageAverage() {
  return {
    sensor1: beginVoltageAverageChannel(),
    sensor2: beginVoltageAverageChannel(),
  };
}

export function addVoltageAverageSample(average, voltages) {
  const currentAverage = average ?? beginVoltageAverage();

  return {
    sensor1: addVoltageAverageChannelSample(currentAverage.sensor1, voltages?.sensor1),
    sensor2: addVoltageAverageChannelSample(currentAverage.sensor2, voltages?.sensor2),
  };
}

export function getVoltageAverage(average) {
  return {
    sensor1: getKnownVoltage(average?.sensor1?.value),
    sensor2: getKnownVoltage(average?.sensor2?.value),
  };
}

export function getKnownVoltage(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const voltage = Number(value);

  return Number.isFinite(voltage) ? voltage : null;
}

export function getKnownStep(previousValue, currentValue) {
  const previous = Number(previousValue);
  const current = Number(currentValue);

  if (!Number.isFinite(previous) || !Number.isFinite(current)) {
    return null;
  }

  const step = Math.abs(current - previous);

  return step > 0 ? step : null;
}

function beginVoltageAverageChannel() {
  return {
    count: 0,
    total: 0,
    value: null,
  };
}

function addVoltageAverageChannelSample(channel, value) {
  const voltage = getKnownVoltage(value);

  if (!Number.isFinite(voltage)) {
    return channel ?? beginVoltageAverageChannel();
  }

  const currentChannel = channel ?? beginVoltageAverageChannel();
  const count = currentChannel.count + 1;
  const total = currentChannel.total + voltage;

  return {
    count,
    total,
    value: total / count,
  };
}
