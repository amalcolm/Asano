export const DEFAULT_CALIBRATED_SWEEP_POINT_COUNT = 8;
const MAX_ANCHOR_PROBES = 48;

export class WiperRangeCalibrator {
  constructor({
    end,
    pointCount = DEFAULT_CALIBRATED_SWEEP_POINT_COUNT,
    start,
    wiperId,
  }) {
    this.end = normaliseWiper(end);
    this.pointCount = Math.max(1, Math.trunc(Number(pointCount) || 1));
    this.start = normaliseWiper(start);
    this.wiperId = String(wiperId ?? "").trim();
    this.lowerBound = null;
    this.anchorQueue = [];
    this.anchorProbeCount = 0;
    this.anchorValue = null;
    this.endValid = null;
    this.endReading = null;
    this.upperBound = null;
    this.search = null;
    this.startValid = null;
    this.startReading = null;
    this.status = "";
    this.done = false;
    this.failed = false;
  }

  begin() {
    this.done = false;
    this.failed = false;
    this.anchorQueue = [];
    this.anchorProbeCount = 0;
    this.anchorValue = null;
    this.endValid = null;
    this.endReading = null;
    this.lowerBound = null;
    this.startValid = null;
    this.startReading = null;
    this.upperBound = null;
    this.search = {
      phase: "lower-start",
      value: this.start,
    };

    return this.getCurrentProbe();
  }

  getCurrentProbe() {
    return {
      status: this.status,
      value: this.search?.value ?? null,
      wiperId: this.wiperId,
    };
  }

  record(reading) {
    if (!this.search || this.done || this.failed) {
      return this.getResult();
    }

    const result = normaliseReading(reading);
    const isValid = result.status === "valid";

    switch (this.search.phase) {
      case "lower-start":
        this.startReading = result;
        this.startValid = Boolean(isValid);

        if (isValid) {
          this.anchorValue = this.start;
          this.lowerBound = this.start;
          this.startUpperSearch();
        } else {
          this.search = {
            phase: "lower-end",
            value: this.end,
          };
        }
        break;

      case "lower-end":
        this.endReading = result;
        this.endValid = Boolean(isValid);

        if (isValid) {
          this.anchorValue = this.end;
          this.upperBound = this.end;
          this.startLowerSearch(this.end);
        } else {
          this.startAnchorSearch();
        }
        break;

      case "anchor-directed":
        this.updateDirectedAnchorSearch(result);
        break;

      case "anchor-binary":
        this.updateAnchorSearch(isValid);
        break;

      case "lower-binary":
        this.updateFirstValidSearch(isValid);
        break;

      case "upper-end":
        this.endValid = Boolean(isValid);

        if (isValid) {
          this.upperBound = this.end;
          this.finish();
        } else {
          this.search = createBinarySearch({
            high: this.end,
            low: this.lowerBound,
            mode: "last-valid",
          });
        }
        break;

      case "upper-binary":
        this.updateLastValidSearch(isValid);
        break;

      default:
        this.failed = true;
        this.done = true;
        break;
    }

    return this.getResult();
  }

  updateFirstValidSearch(isValid) {
    if (isValid) {
      this.search.high = this.search.value;
    } else {
      this.search.low = this.search.value;
    }

    if (this.search.high - this.search.low <= 1) {
      this.lowerBound = this.search.high;
      this.afterLowerBoundFound();
      return;
    }

    this.search.value = midpoint(this.search.low, this.search.high);
  }

  updateLastValidSearch(isValid) {
    if (isValid) {
      this.search.low = this.search.value;
    } else {
      this.search.high = this.search.value;
    }

    if (this.search.high - this.search.low <= 1) {
      this.upperBound = this.search.low;
      this.finish();
      return;
    }

    this.search.value = midpoint(this.search.low, this.search.high);
  }

  startUpperSearch() {
    if (this.upperBound !== null) {
      this.finish();
      return;
    }

    const validLow = this.anchorValue ?? this.lowerBound;

    if (this.endValid === false && validLow !== null) {
      if (this.end - validLow <= 1) {
        this.upperBound = validLow;
        this.finish();
        return;
      }

      this.search = createBinarySearch({
        high: this.end,
        low: validLow,
        mode: "last-valid",
      });
      return;
    }

    this.search = {
      phase: "upper-end",
      value: this.end,
    };
  }

  startLowerSearch(validHigh) {
    if (validHigh - this.start <= 1) {
      this.lowerBound = validHigh;
      this.afterLowerBoundFound();
      return;
    }

    this.search = createBinarySearch({
      high: validHigh,
      low: this.start,
      mode: "first-valid",
    });
  }

  afterLowerBoundFound() {
    if (this.upperBound !== null) {
      this.finish();
      return;
    }

    this.startUpperSearch();
  }

  startAnchorSearch() {
    const startSide = this.startReading?.side;
    const endSide = this.endReading?.side;

    if (startSide && endSide) {
      if (startSide === endSide) {
        this.failed = true;
        this.done = true;
        this.search = null;
        return;
      }

      this.search = {
        high: this.end,
        highSide: endSide,
        low: this.start,
        lowSide: startSide,
        phase: "anchor-directed",
        value: midpoint(this.start, this.end),
      };
      return;
    }

    this.startBlindAnchorSearch();
  }

  updateDirectedAnchorSearch(reading) {
    if (reading.status === "valid") {
      this.anchorValue = this.search.value;
      this.startLowerSearch(this.search.value);
      return;
    }

    if (reading.side === this.search.lowSide) {
      this.search.low = this.search.value;
    } else if (reading.side === this.search.highSide) {
      this.search.high = this.search.value;
    } else {
      this.failed = true;
      this.done = true;
      this.search = null;
      return;
    }

    if (this.search.high - this.search.low <= 1) {
      this.failed = true;
      this.done = true;
      this.search = null;
      return;
    }

    this.search.value = midpoint(this.search.low, this.search.high);
  }

  startBlindAnchorSearch() {
    this.anchorQueue = [{ high: this.end, low: this.start }];
    this.advanceAnchorSearch();
  }

  updateAnchorSearch(isValid) {
    if (isValid) {
      this.anchorValue = this.search.value;
      this.startLowerSearch(this.search.value);
      return;
    }

    this.anchorQueue.push(
      { high: this.search.value, low: this.search.low },
      { high: this.search.high, low: this.search.value },
    );
    this.advanceAnchorSearch();
  }

  advanceAnchorSearch() {
    this.anchorQueue.sort((a, b) => (b.high - b.low) - (a.high - a.low));

    while (this.anchorQueue.length) {
      const interval = this.anchorQueue.shift();

      if (interval.high - interval.low <= 1) {
        continue;
      }

      this.search = {
        high: interval.high,
        low: interval.low,
        phase: "anchor-binary",
        value: midpoint(interval.low, interval.high),
      };
      this.anchorProbeCount += 1;

      if (this.anchorProbeCount > MAX_ANCHOR_PROBES) {
        this.failed = true;
        this.done = true;
        this.search = null;
      }

      return;
    }

    this.failed = true;
    this.done = true;
    this.search = null;
  }

  finish() {
    this.done = true;
    this.search = null;
  }

  getResult() {
    if (this.failed) {
      return {
        done: true,
        failed: true,
        next: null,
        points: [],
      };
    }

    if (!this.done) {
      return {
        done: false,
        failed: false,
        next: this.getCurrentProbe(),
        points: [],
      };
    }

    return {
      done: true,
      failed: false,
      lowerBound: this.lowerBound,
      next: null,
      points: createSweepPoints(this.lowerBound, this.upperBound, this.pointCount),
      upperBound: this.upperBound,
    };
  }
}

function createBinarySearch({ high, low, mode }) {
  return {
    high,
    low,
    phase: mode === "first-valid" ? "lower-binary" : "upper-binary",
    value: midpoint(low, high),
  };
}

function createSweepPoints(start, end, count) {
  const lower = normaliseWiper(start);
  const upper = normaliseWiper(end);

  if (lower === upper || count <= 1) {
    return [lower];
  }

  const step = Math.max(1, Math.floor((upper - lower) / (count - 1)));
  const points = [];

  for (let value = lower; value <= upper; value += step) {
    points.push(value);
  }

  return points;
}

function midpoint(low, high) {
  return Math.floor((normaliseWiper(low) + normaliseWiper(high)) / 2);
}

function normaliseReading(reading) {
  if (reading === true) {
    return { side: null, status: "valid" };
  }

  if (reading === false) {
    return { side: null, status: "invalid" };
  }

  const rawStatus = typeof reading === "string"
    ? reading
    : reading?.status;
  const status = String(rawStatus ?? "").toLowerCase();

  if (status === "valid") {
    return { side: null, status: "valid" };
  }

  if (status === "low" || status === "high") {
    return { side: status, status: "invalid" };
  }

  const side = String(reading?.side ?? "").toLowerCase();

  return {
    side: side === "low" || side === "high" ? side : null,
    status: "invalid",
  };
}

function normaliseWiper(value) {
  return Math.min(255, Math.max(0, Math.trunc(Number(value) || 0)));
}
