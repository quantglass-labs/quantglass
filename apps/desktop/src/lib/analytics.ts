// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Candle } from '../types';

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function rolling(values: number[], period: number, reducer: (window: number[]) => number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    return reducer(values.slice(start, index + 1));
  });
}

export function simpleMovingAverage(values: number[], period: number) {
  return rolling(values, period, average);
}

export function exponentialMovingAverage(values: number[], period: number) {
  const multiplier = 2 / (period + 1);
  return values.reduce<number[]>((series, value, index) => {
    if (index === 0) {
      return [value];
    }
    const previous = series[index - 1];
    return [...series, previous + (value - previous) * multiplier];
  }, []);
}

export function weightedMovingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    const slice = values.slice(start, index + 1);
    const weightedTotal = slice.reduce(
      (total, value, sliceIndex) => total + value * (sliceIndex + 1),
      0,
    );
    const weight = (slice.length * (slice.length + 1)) / 2;
    return weightedTotal / weight;
  });
}

export function volumeWeightedMovingAverage(candles: Candle[], period: number) {
  return candles.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    const slice = candles.slice(start, index + 1);
    const weighted = slice.reduce((total, candle) => total + candle.close * candle.volume, 0);
    const volume = slice.reduce((total, candle) => total + candle.volume, 0);
    return volume > 0 ? weighted / volume : (slice.at(-1)?.close ?? 0);
  });
}

export function sessionVwap(candles: Candle[]) {
  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;
  return candles.map((candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTypicalVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    return cumulativeVolume > 0 ? cumulativeTypicalVolume / cumulativeVolume : candle.close;
  });
}

export function relativeStrengthIndex(values: number[], period: number) {
  const output: number[] = [];
  let gains = 0;
  let losses = 0;

  values.forEach((value, index) => {
    if (index === 0) {
      output.push(50);
      return;
    }

    const delta = value - values[index - 1];
    gains += Math.max(delta, 0);
    losses += Math.max(-delta, 0);

    if (index >= period) {
      const expiredDelta = values[index - period + 1] - values[index - period];
      gains -= Math.max(expiredDelta, 0);
      losses -= Math.max(-expiredDelta, 0);
    }

    const avgGain = gains / Math.min(index, period);
    const avgLoss = losses / Math.min(index, period) || 1;
    const rs = avgGain / avgLoss;
    output.push(100 - 100 / (1 + rs));
  });

  return output;
}

export function movingAverageConvergenceDivergence(values: number[]) {
  const fast = exponentialMovingAverage(values, 12);
  const slow = exponentialMovingAverage(values, 26);
  const macd = values.map((_, index) => fast[index] - slow[index]);
  const signal = exponentialMovingAverage(macd, 9);
  const histogram = macd.map((value, index) => value - signal[index]);
  return { macd, signal, histogram };
}

export function averageTrueRange(candles: Candle[], period: number) {
  const trValues = candles.map((candle, index) => {
    const previousClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  return simpleMovingAverage(trValues, period);
}

export function normalizedAverageTrueRange(candles: Candle[], period: number) {
  const atr = averageTrueRange(candles, period);
  return candles.map((candle, index) => (candle.close > 0 ? (atr[index] / candle.close) * 100 : 0));
}

export function bollingerBands(values: number[], period: number, multiplier = 2) {
  const middle = simpleMovingAverage(values, period);
  const upper: number[] = [];
  const lower: number[] = [];

  values.forEach((_, index) => {
    const start = Math.max(0, index - period + 1);
    const slice = values.slice(start, index + 1);
    const mean = average(slice);
    const variance = average(slice.map((value) => (value - mean) ** 2));
    const deviation = Math.sqrt(variance);
    upper.push(mean + deviation * multiplier);
    lower.push(mean - deviation * multiplier);
  });

  return { middle, upper, lower };
}

export function donchianChannel(candles: Candle[], period: number) {
  return {
    upper: candles.map((_, index) =>
      Math.max(
        ...candles.slice(Math.max(0, index - period + 1), index + 1).map((candle) => candle.high),
      ),
    ),
    lower: candles.map((_, index) =>
      Math.min(
        ...candles.slice(Math.max(0, index - period + 1), index + 1).map((candle) => candle.low),
      ),
    ),
  };
}

export function keltnerChannel(candles: Candle[], period: number, multiplier = 1.5) {
  const ema = exponentialMovingAverage(
    candles.map((candle) => candle.close),
    period,
  );
  const atr = averageTrueRange(candles, 14);
  return {
    middle: ema,
    upper: ema.map((value, index) => value + atr[index] * multiplier),
    lower: ema.map((value, index) => value - atr[index] * multiplier),
  };
}

export function stochasticOscillator(candles: Candle[], period: number, smooth = 3) {
  const k = candles.map((candle, index) => {
    const slice = candles.slice(Math.max(0, index - period + 1), index + 1);
    const high = Math.max(...slice.map((entry) => entry.high));
    const low = Math.min(...slice.map((entry) => entry.low));
    return high > low ? ((candle.close - low) / (high - low)) * 100 : 50;
  });
  return { k, d: simpleMovingAverage(k, smooth) };
}

export function williamsR(candles: Candle[], period: number) {
  return candles.map((candle, index) => {
    const slice = candles.slice(Math.max(0, index - period + 1), index + 1);
    const high = Math.max(...slice.map((entry) => entry.high));
    const low = Math.min(...slice.map((entry) => entry.low));
    return high > low ? ((high - candle.close) / (high - low)) * -100 : -50;
  });
}

export function rateOfChange(values: number[], period: number) {
  return values.map((value, index) => {
    const previous = values[Math.max(0, index - period)];
    return previous ? ((value - previous) / previous) * 100 : 0;
  });
}

export function momentum(values: number[], period: number) {
  return values.map((value, index) => value - values[Math.max(0, index - period)]);
}

export function commodityChannelIndex(candles: Candle[], period: number) {
  const typical = candles.map((candle) => (candle.high + candle.low + candle.close) / 3);
  const sma = simpleMovingAverage(typical, period);
  return typical.map((value, index) => {
    const slice = typical.slice(Math.max(0, index - period + 1), index + 1);
    const deviation = average(slice.map((entry) => Math.abs(entry - sma[index]))) || 1;
    return (value - sma[index]) / (0.015 * deviation);
  });
}

export function onBalanceVolume(candles: Candle[]) {
  return candles.reduce<number[]>((series, candle, index) => {
    if (index === 0) return [0];
    const previous = candles[index - 1];
    const direction = candle.close > previous.close ? 1 : candle.close < previous.close ? -1 : 0;
    return [...series, series[index - 1] + candle.volume * direction];
  }, []);
}

export function moneyFlowIndex(candles: Candle[], period: number) {
  const flows = candles.map((candle, index) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const previousTypical =
      index > 0
        ? (candles[index - 1].high + candles[index - 1].low + candles[index - 1].close) / 3
        : typical;
    return {
      positive: typical > previousTypical ? typical * candle.volume : 0,
      negative: typical < previousTypical ? typical * candle.volume : 0,
    };
  });
  return flows.map((_, index) => {
    const slice = flows.slice(Math.max(0, index - period + 1), index + 1);
    const positive = sum(slice.map((flow) => flow.positive));
    const negative = sum(slice.map((flow) => flow.negative)) || 1;
    return 100 - 100 / (1 + positive / negative);
  });
}

export function chaikinMoneyFlow(candles: Candle[], period: number) {
  return candles.map((_, index) => {
    const slice = candles.slice(Math.max(0, index - period + 1), index + 1);
    const moneyFlowVolume = slice.map((candle) => {
      const range = candle.high - candle.low || 1;
      const multiplier = (candle.close - candle.low - (candle.high - candle.close)) / range;
      return multiplier * candle.volume;
    });
    const volume = sum(slice.map((candle) => candle.volume)) || 1;
    return sum(moneyFlowVolume) / volume;
  });
}

export function rollingStandardDeviation(values: number[], period: number) {
  return rolling(values, period, (slice) => {
    const mean = average(slice);
    return Math.sqrt(average(slice.map((value) => (value - mean) ** 2)));
  });
}

export function zScore(values: number[], period: number) {
  const sma = simpleMovingAverage(values, period);
  const stddev = rollingStandardDeviation(values, period);
  return values.map((value, index) =>
    stddev[index] > 0 ? (value - sma[index]) / stddev[index] : 0,
  );
}

export function realizedVolatility(values: number[], period: number) {
  const returns = values.map((value, index) => {
    const previous = values[index - 1] ?? value;
    return previous > 0 ? Math.log(value / previous) : 0;
  });
  return rollingStandardDeviation(returns, period).map((value) => value * Math.sqrt(365) * 100);
}

export function aroon(candles: Candle[], period: number) {
  const up: number[] = [];
  const down: number[] = [];
  candles.forEach((_, index) => {
    const slice = candles.slice(Math.max(0, index - period + 1), index + 1);
    const high = Math.max(...slice.map((candle) => candle.high));
    const low = Math.min(...slice.map((candle) => candle.low));
    const highIndex = slice.map((candle) => candle.high).lastIndexOf(high);
    const lowIndex = slice.map((candle) => candle.low).lastIndexOf(low);
    const denominator = Math.max(slice.length - 1, 1);
    up.push((highIndex / denominator) * 100);
    down.push((lowIndex / denominator) * 100);
  });
  return { up, down, oscillator: up.map((value, index) => value - down[index]) };
}

export function directionalMovementIndex(candles: Candle[], period: number) {
  const plusDm = candles.map((candle, index) => {
    const previous = candles[index - 1] ?? candle;
    const upMove = candle.high - previous.high;
    const downMove = previous.low - candle.low;
    return upMove > downMove && upMove > 0 ? upMove : 0;
  });
  const minusDm = candles.map((candle, index) => {
    const previous = candles[index - 1] ?? candle;
    const upMove = candle.high - previous.high;
    const downMove = previous.low - candle.low;
    return downMove > upMove && downMove > 0 ? downMove : 0;
  });
  const atr = averageTrueRange(candles, period);
  const plus = simpleMovingAverage(plusDm, period).map((value, index) =>
    atr[index] > 0 ? (value / atr[index]) * 100 : 0,
  );
  const minus = simpleMovingAverage(minusDm, period).map((value, index) =>
    atr[index] > 0 ? (value / atr[index]) * 100 : 0,
  );
  const dx = plus.map((value, index) => {
    const denominator = value + minus[index];
    return denominator > 0 ? (Math.abs(value - minus[index]) / denominator) * 100 : 0;
  });
  return { plus, minus, adx: simpleMovingAverage(dx, period) };
}

export function volumeSma(candles: Candle[], period: number) {
  return simpleMovingAverage(
    candles.map((candle) => candle.volume),
    period,
  );
}

export function relativeVolume(candles: Candle[], period: number) {
  const baseline = volumeSma(candles, period);
  return candles.map((candle, index) =>
    baseline[index] > 0 ? candle.volume / baseline[index] : 0,
  );
}
