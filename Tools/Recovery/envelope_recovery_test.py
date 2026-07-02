#!/usr/bin/env python3
"""Estimate missing envelope CSV values from raw state CSV output.

This is a recovery experiment, not production code. It ports the small part of
the firmware circuit model that predicts how sensor2 should jump when wipers
move, then compares the resulting envelope estimate against a recorded envelope
column when one is available.
"""

from __future__ import annotations

import argparse
import csv
import math
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from statistics import fmean, median, pstdev
from typing import Sequence


DEFAULT_RAW = Path(
    "/mnt/c/Users/Andrew/Desktop/uni CsvSessions/2026-06-23_171654/"
    "Quads_1_4/RED1+2+3+4.csv"
)
DEFAULT_ENVELOPE = Path("/mnt/c/Users/Andrew/Desktop/Quads_1_4; envelopes.csv")
DEFAULT_STATE = "RED1+2+3+4"
DEFAULT_OUT_DIR = Path("Tools/Recovery/out")


@dataclass
class RawRow:
    timestamp_text: str
    timestamp: float
    state: str
    top: int
    bot: int
    mid: int
    offset: int
    gain: int
    sensor1: float
    sensor2: float


@dataclass
class EstimateRow:
    raw: RawRow
    env_actual: float | None
    hidden_offset_actual: float | None
    firmware_offset_est: float
    firmware_change: float
    firmware_compensation_kind: str
    sensor2_shape: float
    firmware_shape: float


@dataclass
class AffineFit:
    intercept: float
    slope: float

    def apply(self, value: float) -> float:
        return self.intercept + self.slope * value


@dataclass
class RecoveryResult:
    rows: list[EstimateRow]
    sensor2_fit: AffineFit
    firmware_fit: AffineFit


class CDiffAmp:
    SENSOR_SCALAR = 1023.0 / 3.3
    VOLTAGE_SCALAR = 3.3 / 1023.0
    INV_255 = 1.0 / 255.0

    SOURCE_RESISTOR = 1000.0
    FIXED_FEEDBACK_RESISTOR = 1200.0
    GAIN_ZERO_RESIDUAL_RESISTOR = 579.58811
    VARIABLE_FEEDBACK_RESISTOR = 102755.50125

    OFFSET_VOLTAGE_SOURCE = 3.3
    OFFSET_VOLTAGE_SOURCE_RESISTOR = 63100.0
    OFFSET_GROUND_SOURCE_RESISTOR = 68200.0
    OFFSET_DIGIPOT_RESISTOR = 5000.0

    OFFSET_TOTAL_RESISTANCE = (
        OFFSET_VOLTAGE_SOURCE_RESISTOR
        + OFFSET_DIGIPOT_RESISTOR
        + OFFSET_GROUND_SOURCE_RESISTOR
    )
    OFFSET_CURRENT = OFFSET_VOLTAGE_SOURCE / OFFSET_TOTAL_RESISTANCE
    OFFSET_BOT_VOLTAGE = OFFSET_CURRENT * OFFSET_GROUND_SOURCE_RESISTOR
    OFFSET_TOP_VOLTAGE = (
        OFFSET_BOT_VOLTAGE + OFFSET_CURRENT * OFFSET_DIGIPOT_RESISTOR
    )
    OFFSET_VOLTAGE_RANGE = OFFSET_TOP_VOLTAGE - OFFSET_BOT_VOLTAGE

    @classmethod
    def multiplier(cls, gain_wiper: int) -> float:
        feedback_resistor = (
            cls.FIXED_FEEDBACK_RESISTOR
            + cls.GAIN_ZERO_RESIDUAL_RESISTOR
            + cls.VARIABLE_FEEDBACK_RESISTOR * clamp_wiper(gain_wiper) * cls.INV_255
        )
        return feedback_resistor / cls.SOURCE_RESISTOR

    @classmethod
    def sensor1_voltage_from_sensor2_voltage(
        cls, sensor2_voltage: float, gain_wiper: int, offset_wiper: int
    ) -> float:
        offset = cls.offset_voltage(offset_wiper)
        gain = cls.multiplier(gain_wiper)
        return offset - (sensor2_voltage - offset) / gain

    @classmethod
    def sensor2_delta_from_offset_delta(cls, offset_delta: int, gain_wiper: int) -> float:
        gain = cls.multiplier(gain_wiper)
        volts = (1.0 + gain) * offset_delta * cls.INV_255 * cls.OFFSET_VOLTAGE_RANGE
        return volts * cls.SENSOR_SCALAR

    @classmethod
    def offset_voltage(cls, offset_wiper: int) -> float:
        return (
            cls.OFFSET_BOT_VOLTAGE
            + clamp_wiper(offset_wiper) * cls.INV_255 * cls.OFFSET_VOLTAGE_RANGE
        )


class C3Pot:
    DIGIPOT_VOLTAGE_SOURCE = 3.3
    DIGIPOT_VOLTAGE_SOURCE_RESISTOR = 22000.0
    DIGIPOT_RESISTANCE = 5000.0
    DIGIPOT_GROUND_RESISTOR = 0.0
    INV_255 = 1.0 / 255.0

    TOTAL_RESISTANCE = (
        DIGIPOT_VOLTAGE_SOURCE_RESISTOR
        + DIGIPOT_RESISTANCE
        + DIGIPOT_GROUND_RESISTOR
    )
    CURRENT = DIGIPOT_VOLTAGE_SOURCE / TOTAL_RESISTANCE
    DIGIPOT_BOT_VOLTAGE = CURRENT * DIGIPOT_GROUND_RESISTOR
    DIGIPOT_TOP_VOLTAGE = DIGIPOT_BOT_VOLTAGE + CURRENT * DIGIPOT_RESISTANCE
    DIGIPOT_VOLTAGE_RANGE = DIGIPOT_TOP_VOLTAGE - DIGIPOT_BOT_VOLTAGE

    @classmethod
    def get_mid_voltage(cls, mid: int, top: int, bot: int) -> float:
        bot_voltage = cls.DIGIPOT_BOT_VOLTAGE + clamp_wiper(bot) * cls.INV_255 * cls.DIGIPOT_VOLTAGE_RANGE
        top_voltage = cls.DIGIPOT_BOT_VOLTAGE + clamp_wiper(top) * cls.INV_255 * cls.DIGIPOT_VOLTAGE_RANGE
        return bot_voltage + clamp_wiper(mid) * cls.INV_255 * (top_voltage - bot_voltage)


class CCircuit:
    MID_STEP_PIVOT_MID_VOLTAGE = 0.230970864519694
    MID_STEP_PIVOT_SENSOR1_EST = 0.502983620865305
    MIN_MID_STEP_DENOMINATOR = 1e-12

    @staticmethod
    def sensor1_voltage_from_sensor2(
        sensor2: float, gain_wiper: int, offset_wiper: int
    ) -> float:
        sensor2_voltage = sensor2 * CDiffAmp.VOLTAGE_SCALAR
        return CDiffAmp.sensor1_voltage_from_sensor2_voltage(
            sensor2_voltage, gain_wiper, offset_wiper
        )

    @classmethod
    def sensor2_delta_from_mid_voltage_delta(
        cls,
        current_mid_voltage: float,
        mid_voltage_delta: float,
        sensor2: float,
        gain_wiper: int,
        offset_wiper: int,
    ) -> float:
        if sensor2 < 0.0 or mid_voltage_delta == 0.0:
            return 0.0

        denominator = cls.MID_STEP_PIVOT_MID_VOLTAGE - current_mid_voltage
        if abs(denominator) < cls.MIN_MID_STEP_DENOMINATOR:
            return 0.0

        diff_amp_multiplier = CDiffAmp.multiplier(gain_wiper)
        sensor1_est_now = cls.sensor1_voltage_from_sensor2(
            sensor2, gain_wiper, offset_wiper
        )
        light_gain = (sensor1_est_now - cls.MID_STEP_PIVOT_SENSOR1_EST) / denominator
        delta_sensor2_voltage = diff_amp_multiplier * light_gain * mid_voltage_delta
        return delta_sensor2_voltage * CDiffAmp.SENSOR_SCALAR

    @classmethod
    def sensor2_delta_from_wiper_delta(cls, previous: RawRow, current: RawRow) -> tuple[float, str]:
        top_delta = current.top - previous.top
        bot_delta = current.bot - previous.bot
        mid_delta = current.mid - previous.mid
        offset_delta = current.offset - previous.offset
        gain_delta = current.gain - previous.gain

        if top_delta == bot_delta == offset_delta == gain_delta == 0 and abs(mid_delta) == 1:
            return (
                cls.sensor2_delta_from_mid_delta(previous, mid_delta),
                "follow_mid",
            )

        if top_delta == bot_delta == mid_delta == gain_delta == 0 and abs(offset_delta) == 1:
            return (
                CDiffAmp.sensor2_delta_from_offset_delta(offset_delta, previous.gain),
                "follow_offset",
            )

        if (
            top_delta != 0
            and top_delta == bot_delta
            and offset_delta == gain_delta == 0
            and abs(mid_delta) <= 67
            and (mid_delta == top_delta * 67 or current.mid in (0, 255))
        ):
            return (
                cls.sensor2_delta_from_top_bot_recentre(previous, current),
                "adjust_top_bot_model",
            )

        return 0.0, "none"

    @classmethod
    def sensor2_delta_from_mid_delta(cls, previous: RawRow, mid_delta: int) -> float:
        current_mid_voltage = C3Pot.get_mid_voltage(
            previous.mid, previous.top, previous.bot
        )
        next_mid_voltage = C3Pot.get_mid_voltage(
            previous.mid + mid_delta, previous.top, previous.bot
        )
        return cls.sensor2_delta_from_mid_voltage_delta(
            current_mid_voltage,
            next_mid_voltage - current_mid_voltage,
            previous.sensor2,
            previous.gain,
            previous.offset,
        )

    @classmethod
    def sensor2_delta_from_top_bot_recentre(cls, previous: RawRow, current: RawRow) -> float:
        current_mid_voltage = C3Pot.get_mid_voltage(
            previous.mid, previous.top, previous.bot
        )
        next_mid_voltage = C3Pot.get_mid_voltage(
            current.mid, current.top, current.bot
        )
        return cls.sensor2_delta_from_mid_voltage_delta(
            current_mid_voltage,
            next_mid_voltage - current_mid_voltage,
            previous.sensor2,
            previous.gain,
            previous.offset,
        )


def clamp_wiper(value: int) -> int:
    return min(255, max(0, int(value)))


def read_raw_rows(path: Path) -> list[RawRow]:
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        return [
            RawRow(
                timestamp_text=row["timestamp"],
                timestamp=float(row["timestamp"]),
                state=row["state"],
                top=int(row["top"]),
                bot=int(row["bot"]),
                mid=int(row["mid"]),
                offset=int(row["offset"]),
                gain=int(row["gain"]),
                sensor1=float(row["sensor1"]),
                sensor2=float(row["sensor2"]),
            )
            for row in reader
        ]


def read_envelope_values(path: Path, state: str) -> dict[str, float]:
    timestamp_header = f"{state}_timestamp"
    value_header = f"{state}_value"

    with path.open(newline="") as handle:
        reader = csv.reader(handle)
        headers = next(reader)

        if timestamp_header not in headers or value_header not in headers:
            return {}

        timestamp_index = headers.index(timestamp_header)
        value_index = headers.index(value_header)
        values: dict[str, float] = {}
        for row in reader:
            if timestamp_index >= len(row) or value_index >= len(row):
                continue

            timestamp = row[timestamp_index].strip()
            value = row[value_index].strip()
            if timestamp and value:
                values[timestamp] = float(value)

        return values


def replay_firmware_offsets(
    raw_rows: Sequence[RawRow],
    envelope_values: dict[str, float],
    train_fraction: float,
    sensor2_fit_override: AffineFit | None,
    firmware_fit_override: AffineFit | None,
) -> RecoveryResult:
    firmware_offset = 0.0
    rows: list[EstimateRow] = []
    previous: RawRow | None = None

    for raw in raw_rows:
        firmware_change = 0.0
        firmware_compensation_kind = "none"
        if previous is not None:
            firmware_change, firmware_compensation_kind = CCircuit.sensor2_delta_from_wiper_delta(previous, raw)
            firmware_offset -= firmware_change

        actual = envelope_values.get(raw.timestamp_text)
        hidden_offset_actual = None if actual is None else actual - raw.sensor2

        rows.append(
            EstimateRow(
                raw=raw,
                env_actual=actual,
                hidden_offset_actual=hidden_offset_actual,
                firmware_offset_est=firmware_offset,
                firmware_change=firmware_change,
                firmware_compensation_kind=firmware_compensation_kind,
                sensor2_shape=raw.sensor2,
                firmware_shape=raw.sensor2 + firmware_offset,
            )
        )
        previous = raw

    actual_rows = [row for row in rows if row.env_actual is not None]
    train_count = max(1, min(len(actual_rows), int(len(actual_rows) * train_fraction)))
    train_rows = actual_rows[:train_count]

    sensor2_fit = sensor2_fit_override or fit_affine(
        [row.sensor2_shape for row in train_rows],
        [require_actual(row) for row in train_rows],
    )
    firmware_fit = firmware_fit_override or fit_affine(
        [row.firmware_shape for row in train_rows],
        [require_actual(row) for row in train_rows],
    )

    for row in rows:
        row.sensor2_shape = sensor2_fit.apply(row.sensor2_shape)
        row.firmware_shape = firmware_fit.apply(row.firmware_shape)

    return RecoveryResult(rows=rows, sensor2_fit=sensor2_fit, firmware_fit=firmware_fit)


def fit_affine(x_values: Sequence[float], y_values: Sequence[float]) -> AffineFit:
    if not x_values or not y_values:
        return AffineFit(0.0, 1.0)

    x_mean = fmean(x_values)
    y_mean = fmean(y_values)
    variance = sum((x - x_mean) ** 2 for x in x_values)
    if variance == 0.0:
        return AffineFit(y_mean, 0.0)

    covariance = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, y_values))
    slope = covariance / variance
    intercept = y_mean - slope * x_mean
    return AffineFit(intercept, slope)


def require_actual(row: EstimateRow) -> float:
    if row.env_actual is None:
        raise ValueError("expected an actual envelope value")
    return row.env_actual


def correlation(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) < 2 or len(right) < 2:
        return math.nan

    left_mean = fmean(left)
    right_mean = fmean(right)
    left_var = sum((value - left_mean) ** 2 for value in left)
    right_var = sum((value - right_mean) ** 2 for value in right)
    if left_var == 0.0 or right_var == 0.0:
        return math.nan

    covariance = sum(
        (left_value - left_mean) * (right_value - right_mean)
        for left_value, right_value in zip(left, right)
    )
    return covariance / math.sqrt(left_var * right_var)


def first_differences(values: Sequence[float]) -> list[float]:
    return [right - left for left, right in zip(values, values[1:])]


def rmse(errors: Sequence[float]) -> float:
    if not errors:
        return math.nan
    return math.sqrt(fmean(error * error for error in errors))


def mae(errors: Sequence[float]) -> float:
    if not errors:
        return math.nan
    return fmean(abs(error) for error in errors)


def percentile(values: Sequence[float], fraction: float) -> float:
    if not values:
        return math.nan

    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * fraction))))
    return ordered[index]


def matched_series(
    rows: Sequence[EstimateRow], estimate_name: str
) -> list[tuple[float, float, float]]:
    return [
        (row.raw.timestamp, getattr(row, estimate_name), require_actual(row))
        for row in rows
        if row.env_actual is not None
    ]


def running_average_pairs(
    rows: Sequence[EstimateRow], estimate_name: str, window_seconds: float
) -> tuple[list[float], list[float]]:
    series = matched_series(rows, estimate_name)
    if len(series) < 2:
        return [], []

    window: deque[tuple[float, float, float]] = deque()
    estimate_sum = 0.0
    actual_sum = 0.0
    estimate_average: list[float] = []
    actual_average: list[float] = []

    for timestamp, estimate, actual in series:
        window.append((timestamp, estimate, actual))
        estimate_sum += estimate
        actual_sum += actual

        while window and timestamp - window[0][0] > window_seconds:
            _, old_estimate, old_actual = window.popleft()
            estimate_sum -= old_estimate
            actual_sum -= old_actual

        if len(window) >= 2:
            estimate_average.append(estimate_sum / len(window))
            actual_average.append(actual_sum / len(window))

    return estimate_average, actual_average


def chunk_shape_metrics(
    rows: Sequence[EstimateRow], estimate_name: str, chunk_seconds: float
) -> tuple[int, float, float, float]:
    series = matched_series(rows, estimate_name)
    if len(series) < 2:
        return 0, math.nan, math.nan, math.nan

    start = series[0][0]
    chunks: dict[int, list[tuple[float, float]]] = {}
    for timestamp, estimate, actual in series:
        chunk_index = int((timestamp - start) / chunk_seconds)
        chunks.setdefault(chunk_index, []).append((estimate, actual))

    correlations: list[float] = []
    normalised_errors: list[float] = []

    for pairs in chunks.values():
        if len(pairs) < 8:
            continue

        estimates = [estimate for estimate, _ in pairs]
        actuals = [actual for _, actual in pairs]
        estimate_mean = fmean(estimates)
        actual_mean = fmean(actuals)
        estimate_shape = [value - estimate_mean for value in estimates]
        actual_shape = [value - actual_mean for value in actuals]
        actual_sd = pstdev(actual_shape)
        if actual_sd == 0.0:
            continue

        correlations.append(correlation(estimate_shape, actual_shape))
        errors = [
            estimate - actual
            for estimate, actual in zip(estimate_shape, actual_shape)
        ]
        normalised_errors.append(rmse(errors) / actual_sd)

    if not correlations:
        return 0, math.nan, math.nan, math.nan

    return (
        len(correlations),
        median(correlations),
        percentile(correlations, 0.10),
        median(normalised_errors),
    )


def describe_metric_slice(
    name: str,
    rows: Sequence[EstimateRow],
    estimate_name: str,
    running_window_seconds: float,
    chunk_seconds: float,
) -> list[str]:
    pairs = [
        (getattr(row, estimate_name), require_actual(row))
        for row in rows
        if row.env_actual is not None
    ]
    if len(pairs) < 2:
        return [f"{name}: not enough matched rows"]

    estimates = [estimate for estimate, _ in pairs]
    actuals = [actual for _, actual in pairs]
    errors = [estimate - actual for estimate, actual in pairs]
    actual_sd = pstdev(actuals)
    normalised_rmse = rmse(errors) / actual_sd if actual_sd else math.nan
    running_estimates, running_actuals = running_average_pairs(
        rows, estimate_name, running_window_seconds
    )
    running_errors = [
        estimate - actual
        for estimate, actual in zip(running_estimates, running_actuals)
    ]
    running_actual_sd = pstdev(running_actuals) if running_actuals else math.nan
    running_normalised_rmse = (
        rmse(running_errors) / running_actual_sd if running_actual_sd else math.nan
    )
    chunk_count, chunk_median_corr, chunk_p10_corr, chunk_median_rmse = chunk_shape_metrics(
        rows, estimate_name, chunk_seconds
    )

    return [
        f"{name}:",
        f"  rows: {len(pairs)}",
        f"  shape corr: {format_float(correlation(estimates, actuals))}",
        f"  running-{format_float(running_window_seconds)}s shape corr: {format_float(correlation(running_estimates, running_actuals))}",
        f"  running-{format_float(running_window_seconds)}s RMSE / actual_sd: {format_float(running_normalised_rmse)}",
        f"  {format_float(chunk_seconds)}s chunk count: {chunk_count}",
        f"  {format_float(chunk_seconds)}s chunk corr median: {format_float(chunk_median_corr)}",
        f"  {format_float(chunk_seconds)}s chunk corr p10: {format_float(chunk_p10_corr)}",
        f"  {format_float(chunk_seconds)}s chunk demeaned RMSE / actual_sd median: {format_float(chunk_median_rmse)}",
        f"  first-diff corr: {format_float(correlation(first_differences(estimates), first_differences(actuals)))}",
        f"  RMSE / actual_sd: {format_float(normalised_rmse)}",
        f"  RMSE: {format_float(rmse(errors))}",
        f"  MAE: {format_float(mae(errors))}",
        f"  median abs error: {format_float(median(abs(error) for error in errors))}",
        f"  bias: {format_float(fmean(errors))}",
    ]


def build_summary(
    rows: Sequence[EstimateRow],
    raw_path: Path,
    envelope_path: Path,
    state: str,
    train_fraction: float,
    sensor2_fit: AffineFit,
    firmware_fit: AffineFit,
    running_window_seconds: float,
    chunk_seconds: float,
) -> str:
    actual_rows = [row for row in rows if row.env_actual is not None]
    train_count = int(len(actual_rows) * train_fraction)
    train_rows = actual_rows[:train_count]
    test_rows = actual_rows[train_count:]
    compensation_counts: dict[str, int] = {}
    for row in rows:
        compensation_counts[row.firmware_compensation_kind] = (
            compensation_counts.get(row.firmware_compensation_kind, 0) + 1
        )
    compensation_summary = ", ".join(
        f"{kind}={count}" for kind, count in sorted(compensation_counts.items())
    )

    lines = [
        "Envelope recovery validation",
        "",
        f"state: {state}",
        f"raw_csv: {raw_path}",
        f"envelope_csv: {envelope_path}",
        f"raw_rows: {len(rows)}",
        f"matched_envelope_rows: {len(actual_rows)}",
        f"train_fraction: {train_fraction}",
        f"running_window_seconds: {running_window_seconds}",
        f"chunk_seconds: {chunk_seconds}",
        "",
        "Shape is the primary signal here. The calibrated estimates may have their absolute offset and scale fitted on the training slice.",
        "For the blue line use: env_est_sensor2_shape_cal = sensor2_fit_intercept + sensor2_fit_slope * sensor2.",
        f"sensor2_fit_intercept: {format_float(sensor2_fit.intercept)}",
        f"sensor2_fit_slope: {format_float(sensor2_fit.slope)}",
        f"firmware_fit_intercept: {format_float(firmware_fit.intercept)}",
        f"firmware_fit_slope: {format_float(firmware_fit.slope)}",
        f"compensation_counts: {compensation_summary}",
        "",
        "Sensor2-only calibrated baseline",
        *describe_metric_slice(
            "  train", train_rows, "sensor2_shape", running_window_seconds, chunk_seconds
        ),
        *describe_metric_slice(
            "  test", test_rows, "sensor2_shape", running_window_seconds, chunk_seconds
        ),
        *describe_metric_slice(
            "  full", actual_rows, "sensor2_shape", running_window_seconds, chunk_seconds
        ),
        "",
        "Firmware replay calibrated estimate",
        *describe_metric_slice(
            "  train", train_rows, "firmware_shape", running_window_seconds, chunk_seconds
        ),
        *describe_metric_slice(
            "  test", test_rows, "firmware_shape", running_window_seconds, chunk_seconds
        ),
        *describe_metric_slice(
            "  full", actual_rows, "firmware_shape", running_window_seconds, chunk_seconds
        ),
        "",
        "Notes:",
        "  - FOLLOW pure mid +/-1 and offset +/-1 changes use the firmware formulas ported from CCircuit/CDiffAmp/C3Pot.",
        "  - larger seek/zoom/balance moves are not treated as envelope compensation, because those firmware paths do not call compensateSensor2().",
        "  - top/bot recentering is approximated by the circuit model when it looks like adjustTopBot(), because the device-only before/after sensor reads were not saved.",
        "  - gain changes are not compensated in firmware and are therefore not added to envOffset_est.",
    ]
    return "\r\n".join(lines) + "\r\n"


def format_float(value: float) -> str:
    if math.isnan(value):
        return "nan"
    return f"{value:.6g}"


def write_comparison_csv(path: Path, rows: Sequence[EstimateRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\r\n")
        writer.writerow(
            [
                "timestamp",
                "state",
                "top",
                "bot",
                "mid",
                "offset",
                "gain",
                "sensor1",
                "sensor2",
                "env_actual",
                "hidden_offset_actual",
                "firmware_offset_est",
                "firmware_change",
                "firmware_compensation_kind",
                "sensor2_shape_cal",
                "firmware_shape_cal",
                "sensor2_shape_error",
                "firmware_shape_error",
            ]
        )
        for row in rows:
            actual = row.env_actual
            writer.writerow(
                [
                    row.raw.timestamp_text,
                    row.raw.state,
                    row.raw.top,
                    row.raw.bot,
                    row.raw.mid,
                    row.raw.offset,
                    row.raw.gain,
                    format_float(row.raw.sensor1),
                    format_float(row.raw.sensor2),
                    "" if actual is None else format_float(actual),
                    "" if row.hidden_offset_actual is None else format_float(row.hidden_offset_actual),
                    format_float(row.firmware_offset_est),
                    format_float(row.firmware_change),
                    row.firmware_compensation_kind,
                    format_float(row.sensor2_shape),
                    format_float(row.firmware_shape),
                    "" if actual is None else format_float(row.sensor2_shape - actual),
                    "" if actual is None else format_float(row.firmware_shape - actual),
                ]
            )


def write_shape_estimate_csv(path: Path, rows: Sequence[EstimateRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\r\n")
        writer.writerow(
            [
                "timestamp",
                "state",
                "sensor2",
                "env_est_sensor2_shape_cal",
                "env_est_firmware_compensated_cal",
                "firmware_offset_est",
                "firmware_compensation_kind",
                "env_actual",
                "shape_error",
                "firmware_error",
            ]
        )
        for row in rows:
            actual = row.env_actual
            writer.writerow(
                [
                    row.raw.timestamp_text,
                    row.raw.state,
                    format_float(row.raw.sensor2),
                    format_float(row.sensor2_shape),
                    format_float(row.firmware_shape),
                    format_float(row.firmware_offset_est),
                    row.firmware_compensation_kind,
                    "" if actual is None else format_float(actual),
                    "" if actual is None else format_float(row.sensor2_shape - actual),
                    "" if actual is None else format_float(row.firmware_shape - actual),
                ]
            )


def write_svg(path: Path, rows: Sequence[EstimateRow]) -> None:
    matched = [row for row in rows if row.env_actual is not None]
    has_actual = len(matched) >= 2
    source_rows = matched if has_actual else list(rows)
    if len(source_rows) < 2:
        return

    max_points = 1400
    step = max(1, len(source_rows) // max_points)
    sampled = source_rows[::step]

    x_values = [row.raw.timestamp for row in sampled]
    firmware_values = [row.firmware_shape for row in sampled]
    sensor2_values = [row.sensor2_shape for row in sampled]
    actual_values = [require_actual(row) for row in sampled] if has_actual else []

    y_values = firmware_values + sensor2_values + actual_values
    x_min, x_max = min(x_values), max(x_values)
    y_min, y_max = min(y_values), max(y_values)
    if x_min == x_max or y_min == y_max:
        return

    width = 1200
    height = 640
    pad_left = 70
    pad_right = 30
    pad_top = 35
    pad_bottom = 55
    plot_width = width - pad_left - pad_right
    plot_height = height - pad_top - pad_bottom

    def point(x_value: float, y_value: float) -> str:
        x = pad_left + (x_value - x_min) / (x_max - x_min) * plot_width
        y = pad_top + (y_max - y_value) / (y_max - y_min) * plot_height
        return f"{x:.2f},{y:.2f}"

    def polyline(values: Sequence[float]) -> str:
        return " ".join(point(x, y) for x, y in zip(x_values, values))

    actual_polyline = (
        f'<polyline points="{polyline(actual_values)}" fill="none" stroke="#111111" stroke-width="1.6"/>'
        if has_actual
        else ""
    )
    title = (
        "Envelope recovery shape comparison"
        if has_actual
        else "Envelope recovery estimate comparison"
    )

    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 1200 640">',
        '<rect width="1200" height="640" fill="#ffffff"/>',
        f'<text x="{pad_left}" y="24" font-family="Segoe UI, Arial" font-size="18" fill="#111111">{title}</text>',
        f'<line x1="{pad_left}" y1="{pad_top}" x2="{pad_left}" y2="{height - pad_bottom}" stroke="#999999"/>',
        f'<line x1="{pad_left}" y1="{height - pad_bottom}" x2="{width - pad_right}" y2="{height - pad_bottom}" stroke="#999999"/>',
        actual_polyline,
        f'<polyline points="{polyline(firmware_values)}" fill="none" stroke="#d62728" stroke-width="1.3"/>',
        f'<polyline points="{polyline(sensor2_values)}" fill="none" stroke="#1f77b4" stroke-width="1.0" opacity="0.65"/>',
        '<rect x="820" y="28" width="335" height="76" fill="#ffffff" stroke="#cccccc"/>',
        '<line x1="840" y1="50" x2="900" y2="50" stroke="#111111" stroke-width="1.6"/>',
        f'<text x="910" y="55" font-family="Segoe UI, Arial" font-size="14">{"actual envelope" if has_actual else "actual envelope unavailable"}</text>',
        '<line x1="840" y1="73" x2="900" y2="73" stroke="#d62728" stroke-width="1.3"/>',
        '<text x="910" y="78" font-family="Segoe UI, Arial" font-size="14">compensation-adjusted estimate</text>',
        '<line x1="840" y1="96" x2="900" y2="96" stroke="#1f77b4" stroke-width="1.0" opacity="0.65"/>',
        '<text x="910" y="101" font-family="Segoe UI, Arial" font-size="14">sensor2 baseline, shape calibrated</text>',
        f'<text x="{pad_left}" y="{height - 18}" font-family="Segoe UI, Arial" font-size="12" fill="#555555">timestamp {x_min:.3f} to {x_max:.3f}; y {y_min:.3f} to {y_max:.3f}</text>',
        "</svg>",
        "",
    ]
    path.write_text("\r\n".join(lines), encoding="utf-8")


def make_fit_override(
    intercept: float | None, slope: float | None, name: str
) -> AffineFit | None:
    if intercept is None and slope is None:
        return None

    if intercept is None or slope is None:
        raise ValueError(
            f"{name} calibration override requires both intercept and slope"
        )

    return AffineFit(intercept=intercept, slope=slope)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    parser.add_argument("--envelope", type=Path, default=DEFAULT_ENVELOPE)
    parser.add_argument("--state", default=DEFAULT_STATE)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--train-fraction", type=float, default=0.7)
    parser.add_argument("--running-window-seconds", type=float, default=1.0)
    parser.add_argument("--chunk-seconds", type=float, default=1.0)
    parser.add_argument("--sensor2-fit-intercept", type=float)
    parser.add_argument("--sensor2-fit-slope", type=float)
    parser.add_argument("--firmware-fit-intercept", type=float)
    parser.add_argument("--firmware-fit-slope", type=float)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    raw_rows = read_raw_rows(args.raw)
    envelope_values = read_envelope_values(args.envelope, args.state)
    sensor2_fit_override = make_fit_override(
        args.sensor2_fit_intercept, args.sensor2_fit_slope, "sensor2"
    )
    firmware_fit_override = make_fit_override(
        args.firmware_fit_intercept, args.firmware_fit_slope, "firmware"
    )
    result = replay_firmware_offsets(
        raw_rows,
        envelope_values,
        args.train_fraction,
        sensor2_fit_override,
        firmware_fit_override,
    )
    rows = result.rows

    safe_state = args.state.replace("+", "_").replace(":", "_").replace(" ", "_")
    comparison_path = args.out_dir / f"{safe_state}_envelope_recovery_comparison.csv"
    shape_estimate_path = args.out_dir / f"{safe_state}_sensor2_shape_estimate.csv"
    summary_path = args.out_dir / f"{safe_state}_envelope_recovery_summary.txt"
    svg_path = args.out_dir / f"{safe_state}_envelope_recovery_shape.svg"

    write_comparison_csv(comparison_path, rows)
    write_shape_estimate_csv(shape_estimate_path, rows)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary = build_summary(
        rows,
        args.raw,
        args.envelope,
        args.state,
        args.train_fraction,
        result.sensor2_fit,
        result.firmware_fit,
        args.running_window_seconds,
        args.chunk_seconds,
    )
    summary_path.write_text(summary, encoding="utf-8")
    write_svg(svg_path, rows)

    print(summary, end="")
    print(f"comparison_csv: {comparison_path}")
    print(f"shape_estimate_csv: {shape_estimate_path}")
    print(f"summary_txt: {summary_path}")
    if svg_path.exists():
        print(f"shape_svg: {svg_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
