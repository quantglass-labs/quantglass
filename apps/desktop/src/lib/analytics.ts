import type { Candle } from '../types';

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function simpleMovingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    return average(values.slice(start, index + 1));
  });
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