// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import { useEffect, useMemo, useRef } from 'react';
import type { Candle } from '../types';

const FALLBACK_CHART_WIDTH = 1000;
const FALLBACK_CHART_HEIGHT = 420;
const FALLBACK_PRICE_AXIS_WIDTH = 82;

export interface ChartLineSeries {
  id: string;
  name: string;
  values: number[];
  color: string;
}

function finitePrice(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

import { movingAverageConvergenceDivergence, relativeStrengthIndex } from '../lib/analytics';

function lineData(candles: Candle[], values: number[]) {
  return candles
    .map((candle, index) => ({ time: candle.time as never, value: values[index] }))
    .filter((point) => finitePrice(point.value));
}

function chartSize(element: HTMLDivElement) {
  return {
    width: Math.max(
      320,
      Math.floor(element.clientWidth || element.getBoundingClientRect().width || 0),
    ),
    height: Math.max(
      360,
      Math.floor(element.clientHeight || element.getBoundingClientRect().height || 0),
    ),
  };
}

function FallbackCandlestickLayer({
  candles,
  priceSeries,
}: {
  candles: Candle[];
  priceSeries: ChartLineSeries[];
}) {
  const visibleCandles = useMemo(() => candles.slice(-160), [candles]);

  if (!visibleCandles.length) return null;

  const visibleStart = candles.length - visibleCandles.length;
  const visibleLineValues = priceSeries.flatMap((series) =>
    series.values
      .slice(Math.max(0, visibleStart))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  const highs = [...visibleCandles.map((candle) => candle.high), ...visibleLineValues];
  const lows = [...visibleCandles.map((candle) => candle.low), ...visibleLineValues];
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const priceRange = Math.max(high - low, high * 0.002, 1);
  const paddedHigh = high + priceRange * 0.08;
  const paddedLow = low - priceRange * 0.08;
  const paddedRange = paddedHigh - paddedLow;
  const plotWidth = FALLBACK_CHART_WIDTH - FALLBACK_PRICE_AXIS_WIDTH - 28;
  const plotLeft = 12;
  const plotHeight = FALLBACK_CHART_HEIGHT - 38;
  const plotTop = 14;
  const step = plotWidth / Math.max(visibleCandles.length - 1, 1);
  const bodyWidth = Math.max(2.5, Math.min(9, step * 0.62));
  const priceToY = (price: number) => plotTop + ((paddedHigh - price) / paddedRange) * plotHeight;
  const gridPrices = Array.from(
    { length: 5 },
    (_, index) => paddedLow + (paddedRange / 4) * index,
  ).reverse();

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-2 z-0 h-[calc(100%-1rem)] w-[calc(100%-1rem)]"
      preserveAspectRatio="none"
      viewBox={`0 0 ${FALLBACK_CHART_WIDTH} ${FALLBACK_CHART_HEIGHT}`}
    >
      <rect
        x="0"
        y="0"
        width={FALLBACK_CHART_WIDTH}
        height={FALLBACK_CHART_HEIGHT}
        fill="transparent"
      />
      {gridPrices.map((price) => {
        const y = priceToY(price);
        return (
          <g key={price}>
            <line
              x1={plotLeft}
              x2={plotLeft + plotWidth}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text
              x={FALLBACK_CHART_WIDTH - 76}
              y={y + 4}
              fill="#7890b7"
              fontSize="18"
              fontFamily="JetBrains Mono, ui-monospace, monospace"
            >
              {price >= 1000
                ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : price.toFixed(2)}
            </text>
          </g>
        );
      })}
      {visibleCandles.map((candle, index) => {
        const x = plotLeft + index * step;
        const openY = priceToY(candle.open);
        const closeY = priceToY(candle.close);
        const highY = priceToY(candle.high);
        const lowY = priceToY(candle.low);
        const isUp = candle.close >= candle.open;
        const color = isUp ? '#18c37f' : '#f05b78';
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));

        return (
          <g key={`${candle.time}-${index}`}>
            <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="2" opacity="0.9" />
            <rect
              x={x - bodyWidth / 2}
              y={bodyY}
              width={bodyWidth}
              height={bodyHeight}
              rx="1"
              fill={isUp ? 'rgba(24,195,127,0.72)' : 'rgba(240,91,120,0.78)'}
              stroke={color}
              strokeWidth="1"
            />
          </g>
        );
      })}
      {priceSeries.map((series) => {
        const points = series.values
          .slice(Math.max(0, visibleStart))
          .map((value, index) => ({ value, index }))
          .filter((point) => Number.isFinite(point.value) && point.value > 0)
          .map((point) => `${plotLeft + point.index * step},${priceToY(point.value)}`)
          .join(' ');

        return points ? (
          <polyline
            key={series.id}
            points={points}
            fill="none"
            stroke={series.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
        ) : null;
      })}
    </svg>
  );
}

export function TradingViewCandlestickChart({
  candles,
  ema,
  sma,
  bollingerUpper,
  bollingerLower,
  showEma,
  showSma,
  showBollinger,
  showSupportResistance,
  supportLevel,
  resistanceLevel,
  entryZone,
  stopLoss,
  takeProfit,
  priceSeries = [],
}: {
  candles: Candle[];
  ema: number[];
  sma: number[];
  bollingerUpper: number[];
  bollingerLower: number[];
  showEma: boolean;
  showSma: boolean;
  showBollinger: boolean;
  showSupportResistance: boolean;
  supportLevel: number;
  resistanceLevel: number;
  entryZone: [number, number];
  stopLoss: number;
  takeProfit: number[];
  priceSeries?: ChartLineSeries[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const candleData = useMemo(
    () =>
      candles
        .filter(
          (candle) =>
            Number.isFinite(candle.time) &&
            Number.isFinite(candle.open) &&
            Number.isFinite(candle.high) &&
            Number.isFinite(candle.low) &&
            Number.isFinite(candle.close) &&
            candle.time > 0 &&
            candle.high >= candle.low,
        )
        .map((candle) => ({
          time: candle.time as never,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })),
    [candles],
  );

  useEffect(() => {
    if (!ref.current) return undefined;
    if (!candleData.length) return undefined;

    const container = ref.current;
    const size = chartSize(container);
    const chart = createChart(ref.current, {
      width: size.width,
      height: size.height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#91a6c9',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#18c37f',
      downColor: '#f05b78',
      wickUpColor: '#18c37f',
      wickDownColor: '#f05b78',
      borderVisible: false,
    });

    const entryMarker = candles.length ? candles[Math.max(0, candles.length - 16)] : undefined;
    const targetMarker = candles.length ? candles[Math.max(0, candles.length - 8)] : undefined;

    series.setData(candleData);
    createSeriesMarkers(series, [
      ...(entryMarker
        ? [
            {
              time: entryMarker.time as never,
              position: 'belowBar' as const,
              color: '#18c37f',
              shape: 'arrowUp' as const,
              text: 'Entry',
            },
          ]
        : []),
      ...(targetMarker
        ? [
            {
              time: targetMarker.time as never,
              position: 'aboveBar' as const,
              color: '#f0b84b',
              shape: 'circle' as const,
              text: 'TP1',
            },
          ]
        : []),
    ]);
    if (finitePrice(stopLoss)) {
      series.createPriceLine({
        price: stopLoss,
        color: '#f05b78',
        lineStyle: LineStyle.Dashed,
        title: 'SL',
      });
    }
    takeProfit
      .slice(0, 2)
      .filter(finitePrice)
      .forEach((price, index) => {
        series.createPriceLine({
          price,
          color: '#18c37f',
          lineStyle: LineStyle.Dotted,
          title: `TP${index + 1}`,
        });
      });
    entryZone.filter(finitePrice).forEach((price, index) => {
      series.createPriceLine({
        price,
        color: '#8db7ff',
        lineStyle: LineStyle.SparseDotted,
        title: index === 0 ? 'Entry' : 'Zone',
      });
    });
    if (showSupportResistance) {
      if (finitePrice(supportLevel)) {
        series.createPriceLine({
          price: supportLevel,
          color: '#4dd2ff',
          lineStyle: LineStyle.Dashed,
          title: 'Support',
        });
      }
      if (finitePrice(resistanceLevel)) {
        series.createPriceLine({
          price: resistanceLevel,
          color: '#ffb45c',
          lineStyle: LineStyle.Dashed,
          title: 'Resistance',
        });
      }
    }

    const emaSeries = chart.addSeries(LineSeries, {
      color: '#8db7ff',
      lineWidth: 2,
      visible: showEma,
    });
    emaSeries.setData(lineData(candles, ema));
    const smaSeries = chart.addSeries(LineSeries, {
      color: '#f0b84b',
      lineWidth: 2,
      visible: showSma,
    });
    smaSeries.setData(lineData(candles, sma));
    const upperSeries = chart.addSeries(LineSeries, {
      color: 'rgba(79,139,255,0.65)',
      lineWidth: 1,
      visible: showBollinger,
    });
    upperSeries.setData(lineData(candles, bollingerUpper));
    const lowerSeries = chart.addSeries(LineSeries, {
      color: 'rgba(79,139,255,0.65)',
      lineWidth: 1,
      visible: showBollinger,
    });
    lowerSeries.setData(lineData(candles, bollingerLower));
    priceSeries.forEach((line) => {
      const customSeries = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: 2,
        visible: true,
      });
      customSeries.setData(lineData(candles, line.values));
    });

    // Indicator panes (E8): volume, RSI, and MACD in dedicated panes so
    // oscillators never distort the price scale.
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, color: 'rgba(141,183,255,0.45)' },
      1,
    );
    volumeSeries.setData(
      candleData.map((bar, index) => ({
        time: bar.time,
        value: candles[index]?.volume ?? 0,
        color: bar.close >= bar.open ? 'rgba(24,195,127,0.45)' : 'rgba(240,91,120,0.45)',
      })),
    );

    const closes = candles.map((candle) => candle.close);
    const rsiValues = relativeStrengthIndex(closes, 14);
    const rsiSeries = chart.addSeries(
      LineSeries,
      { color: '#c084fc', lineWidth: 2, priceFormat: { type: 'price', precision: 1 } },
      2,
    );
    rsiSeries.setData(lineData(candles, rsiValues));
    rsiSeries.createPriceLine({
      price: 70,
      color: 'rgba(240,91,120,0.5)',
      lineStyle: LineStyle.Dashed,
      title: '70',
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: 'rgba(24,195,127,0.5)',
      lineStyle: LineStyle.Dashed,
      title: '30',
    });

    const macd = movingAverageConvergenceDivergence(closes);
    const macdHistogram = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'price', precision: 3 } },
      3,
    );
    macdHistogram.setData(
      candleData.map((bar, index) => {
        const value = macd.histogram[index] ?? 0;
        return {
          time: bar.time,
          value,
          color: value >= 0 ? 'rgba(24,195,127,0.6)' : 'rgba(240,91,120,0.6)',
        };
      }),
    );

    // Price keeps most of the height; indicator panes stay compact.
    const panes = chart.panes();
    if (panes.length >= 4) {
      panes[1].setHeight(70);
      panes[2].setHeight(80);
      panes[3].setHeight(70);
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      const nextSize = chartSize(container);
      chart.applyOptions(nextSize);
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [
    bollingerLower,
    bollingerUpper,
    candleData,
    candles,
    ema,
    entryZone,
    priceSeries,
    resistanceLevel,
    showBollinger,
    showEma,
    showSma,
    showSupportResistance,
    sma,
    stopLoss,
    supportLevel,
    takeProfit,
  ]);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-[22px]">
      <FallbackCandlestickLayer candles={candles} priceSeries={priceSeries} />
      <div ref={ref} className="absolute inset-0 z-10 h-full w-full" />
    </div>
  );
}
