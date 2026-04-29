import { PricePoint } from './data';

export type SignalType = 'buy' | 'sell' | 'hold';

export interface TradeSignal {
  date: string;
  price: number;
  type: SignalType;
  reason: string;
}

export interface MetricData {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturn: number;
  maxDrawdown: number;
}

export interface AlgoResult {
  signals: TradeSignal[];
  metrics: MetricData;
  enrichedData: any[];
}

export function calculateSMA(data: PricePoint[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      result.push(sum / period);
    }
  }
  return result;
}

export function calculateBollingerBands(data: PricePoint[], period: number = 20, multiplier: number = 2) {
  const sma = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      let sumSq = 0;
      for (let j = 0; j < period; j++) {
        const diff = data[i - j].close - sma[i];
        sumSq += diff * diff;
      }
      const variance = sumSq / period;
      const stdev = Math.sqrt(variance);
      upper.push(sma[i] + stdev * multiplier);
      lower.push(sma[i] - stdev * multiplier);
    }
  }
  return { sma, upper, lower };
}

export function analyzeSMACrossover(data: PricePoint[], fastPeriod: number = 10, slowPeriod: number = 30): AlgoResult {
  const fastSma = calculateSMA(data, fastPeriod);
  const slowSma = calculateSMA(data, slowPeriod);
  
  const signals: TradeSignal[] = [];
  const enrichedData = [];
  let position: 'none' | 'long' = 'none';
  
  let entryPrice = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  
  const startingCapital = 10000;
  let capital = startingCapital;
  let peakCapital = startingCapital;
  let maxDrawdown = 0;

  for (let i = 0; i < data.length; i++) {
    const dp = {
      ...data[i],
      fastSma: fastSma[i] || null,
      slowSma: slowSma[i] || null,
      buySignal: null as number | null,
      sellSignal: null as number | null,
    };
    
    if (i > 0 && !isNaN(fastSma[i]) && !isNaN(slowSma[i]) && !isNaN(fastSma[i-1])) {
      const prevFast = fastSma[i-1];
      const prevSlow = slowSma[i-1];
      const currFast = fastSma[i];
      const currSlow = slowSma[i];
      
      if (prevFast <= prevSlow && currFast > currSlow && position === 'none') {
        position = 'long';
        entryPrice = data[i].close;
        signals.push({
          date: data[i].date,
          price: data[i].close,
          type: 'buy',
          reason: `Fast SMA (${fastPeriod}) crossed above Slow SMA (${slowPeriod})`
        });
        dp.buySignal = data[i].close * 0.98;
      }
      else if (prevFast >= prevSlow && currFast < currSlow && position === 'long') {
        position = 'none';
        const exitPrice = data[i].close;
        const profit = exitPrice - entryPrice;
        const tradeReturn = profit / entryPrice;
        
        capital *= (1 + tradeReturn);
        if (capital > peakCapital) peakCapital = capital;
        const drawdown = (peakCapital - capital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        
        if (profit > 0) {
          winningTrades++;
          grossProfit += profit;
        } else {
          losingTrades++;
          grossLoss += Math.abs(profit);
        }
        
        signals.push({
          date: data[i].date,
          price: data[i].close,
          type: 'sell',
          reason: `Fast SMA (${fastPeriod}) crossed below Slow SMA (${slowPeriod})`
        });
        dp.sellSignal = data[i].close * 1.02;
      }
    }
    
    enrichedData.push(dp);
  }
  
  if (position === 'long') {
    const finalPrice = data[data.length - 1].close;
    const profit = finalPrice - entryPrice;
    capital *= (1 + (profit / entryPrice));
    
    if (profit > 0) {
      winningTrades++;
      grossProfit += profit;
    } else {
      losingTrades++;
      grossLoss += Math.abs(profit);
    }
  }
  
  const totalTrades = winningTrades + losingTrades;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) : 0;
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0);
  const totalReturn = (capital - startingCapital) / startingCapital;
  
  return {
    signals,
    metrics: {
      totalTrades,
      winRate,
      profitFactor,
      totalReturn,
      maxDrawdown
    },
    enrichedData
  };
}

export function analyzeBollingerReversion(data: PricePoint[], period: number = 20, multiplier: number = 2): AlgoResult {
  const { sma, upper, lower } = calculateBollingerBands(data, period, multiplier);
  
  const signals: TradeSignal[] = [];
  const enrichedData = [];
  let position: 'none' | 'long' = 'none';
  
  let entryPrice = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  
  const startingCapital = 10000;
  let capital = startingCapital;
  let peakCapital = startingCapital;
  let maxDrawdown = 0;
  
  for (let i = 0; i < data.length; i++) {
    const dp = {
      ...data[i],
      bbUpper: upper[i] || null,
      bbLower: lower[i] || null,
      sma: sma[i] || null,
      buySignal: null as number | null,
      sellSignal: null as number | null,
    };
    
    if (i > 0 && !isNaN(lower[i]) && !isNaN(upper[i])) {
      const price = data[i].close;
      // Mean Reversion Buy: Price drops below lower band
      if (price < lower[i] && position === 'none') {
        position = 'long';
        entryPrice = price;
        signals.push({
          date: data[i].date,
          price,
          type: 'buy',
          reason: 'Price dropped below lower Bollinger Band'
        });
        dp.buySignal = price * 0.98;
      }
      // Mean Reversion Sell (Close long): Price hits or exceeds SMA
      else if (price >= sma[i] && position === 'long') {
        position = 'none';
        const profit = price - entryPrice;
        capital *= (1 + (profit / entryPrice));
        if (capital > peakCapital) peakCapital = capital;
        const drawdown = (peakCapital - capital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        
        if (profit > 0) {
          winningTrades++;
          grossProfit += profit;
        } else {
          losingTrades++;
          grossLoss += Math.abs(profit);
        }
        
        signals.push({
          date: data[i].date,
          price,
          type: 'sell',
          reason: 'Price reverted to Mean (SMA)'
        });
        dp.sellSignal = price * 1.02;
      }
    }
    enrichedData.push(dp);
  }
  
  if (position === 'long') {
    const finalPrice = data[data.length - 1].close;
    const profit = finalPrice - entryPrice;
    capital *= (1 + (profit / entryPrice));
    if (profit > 0) winningTrades++;
    else losingTrades++;
  }
  
  const totalTrades = winningTrades + losingTrades;
  
  return {
    signals,
    metrics: {
      totalTrades,
      winRate: totalTrades > 0 ? (winningTrades / totalTrades) : 0,
      profitFactor: grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0),
      totalReturn: (capital - startingCapital) / startingCapital,
      maxDrawdown
    },
    enrichedData
  };
}
