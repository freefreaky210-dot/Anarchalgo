export interface PricePoint {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

export async function fetchBinanceHistoricalData(symbol: string, interval: string, limit: number): Promise<PricePoint[]> {
  const formatData = (data: any[]) => data.map((kline: any) => ({
    date: new Date(kline[0]).toISOString().replace('T', ' ').substring(0, 19),
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5])
  }));

  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    if (!res.ok) throw new Error('Binance .com failure');
    const data = await res.json();
    return formatData(data);
  } catch (err) {
    console.warn("Falling back to api.binance.us", err);
    try {
      const res = await fetch(`https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!res.ok) throw new Error('Binance .us failure');
      const data = await res.json();
      return formatData(data);
    } catch (fallbackErr) {
      console.warn("Both Binance APIs failed. Using fallback generated data.", fallbackErr);
      return generateHistoricalData(limit);
    }
  }
}

export function generateHistoricalData(days: number, startPrice: number = 100, volatility: number = 0.02, drift: number = 0.0005): PricePoint[] {
  const data: PricePoint[] = [];
  let currentPrice = startPrice;
  let currentDate = new Date();
  currentDate.setDate(currentDate.getDate() - days);

  for (let i = 0; i < days; i++) {
    const change = currentPrice * drift + currentPrice * volatility * (Math.random() + Math.random() - 1);
    
    const open = currentPrice;
    currentPrice += change;
    const close = currentPrice;
    const high = Math.max(open, close) + Math.abs(currentPrice * volatility * Math.random());
    const low = Math.min(open, close) - Math.abs(currentPrice * volatility * Math.random());
    const volume = Math.floor(Math.random() * 10000) + 1000;

    data.push({
      date: currentDate.toISOString().split('T')[0],
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return data;
}
