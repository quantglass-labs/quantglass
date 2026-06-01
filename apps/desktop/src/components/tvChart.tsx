// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ColorType, CrosshairMode, LineStyle, createChart } from 'lightweight-charts';
import { useEffect, useMemo, useRef } from 'react';
import type { Candle } from '../types';

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
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const candleData = useMemo(
    () => candles.map((candle) => ({ time: candle.time as never, open: candle.open, high: candle.high, low: candle.low, close: candle.close })),
    [candles],
  );

  useEffect(() => {
    if (!ref.current) return undefined;

    const chart = createChart(ref.current, {
      autoSize: true,
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

    const series = chart.addCandlestickSeries({
      upColor: '#18c37f',
      downColor: '#f05b78',
      wickUpColor: '#18c37f',
      wickDownColor: '#f05b78',
      borderVisible: false,
    });

    const entryMarker = candles[Math.max(0, candles.length - 16)];
    const targetMarker = candles[Math.max(0, candles.length - 8)];

    series.setData(candleData);
    series.setMarkers([
      { time: entryMarker?.time as never, position: 'belowBar', color: '#18c37f', shape: 'arrowUp', text: 'Entry' },
      { time: targetMarker?.time as never, position: 'aboveBar', color: '#f0b84b', shape: 'circle', text: 'TP1' },
    ]);
    series.createPriceLine({ price: stopLoss, color: '#f05b78', lineStyle: LineStyle.Dashed, title: 'SL' });
    takeProfit.slice(0, 2).forEach((price, index) => {
      series.createPriceLine({ price, color: '#18c37f', lineStyle: LineStyle.Dotted, title: `TP${index + 1}` });
    });
    entryZone.forEach((price, index) => {
      series.createPriceLine({ price, color: '#8db7ff', lineStyle: LineStyle.SparseDotted, title: index === 0 ? 'Entry' : 'Zone' });
    });
    if (showSupportResistance) {
      series.createPriceLine({ price: supportLevel, color: '#4dd2ff', lineStyle: LineStyle.Dashed, title: 'Support' });
      series.createPriceLine({ price: resistanceLevel, color: '#ffb45c', lineStyle: LineStyle.Dashed, title: 'Resistance' });
    }

    const emaSeries = chart.addLineSeries({ color: '#8db7ff', lineWidth: 2, visible: showEma });
    emaSeries.setData(candles.map((candle, index) => ({ time: candle.time as never, value: ema[index] })));
    const smaSeries = chart.addLineSeries({ color: '#f0b84b', lineWidth: 2, visible: showSma });
    smaSeries.setData(candles.map((candle, index) => ({ time: candle.time as never, value: sma[index] })));
    const upperSeries = chart.addLineSeries({ color: 'rgba(79,139,255,0.65)', lineWidth: 1, visible: showBollinger });
    upperSeries.setData(candles.map((candle, index) => ({ time: candle.time as never, value: bollingerUpper[index] })));
    const lowerSeries = chart.addLineSeries({ color: 'rgba(79,139,255,0.65)', lineWidth: 1, visible: showBollinger });
    lowerSeries.setData(candles.map((candle, index) => ({ time: candle.time as never, value: bollingerLower[index] })));

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => chart.timeScale().fitContent());
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [bollingerLower, bollingerUpper, candleData, candles, ema, entryZone, resistanceLevel, showBollinger, showEma, showSma, showSupportResistance, sma, stopLoss, supportLevel, takeProfit]);

  return <div ref={ref} className="h-[420px] w-full" />;
}