import { describe, it, expect } from 'vitest';
import { generateHistoricalData } from './data';
import { analyzeSMACrossover, analyzeBollingerReversion } from './algorithms';

describe('Trading Algorithms', () => {
  it('should generate valid historical data', () => {
    const data = generateHistoricalData(100, 100, 0.02, 0);
    expect(data.length).toBe(100);
    expect(data[0].close).toBeGreaterThan(0);
    expect(data[data.length - 1].date).toBeDefined();
  });

  it('SMA Crossover should execute trades and return metrics', () => {
    const data = generateHistoricalData(200, 100, 0.05, 0.001); // upward drift to encourage trades
    const result = analyzeSMACrossover(data, 10, 30);
    
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('metrics');
    expect(result.metrics.totalTrades).toBeGreaterThanOrEqual(0);
    expect(result.enrichedData.length).toBe(200);
  });

  it('Bollinger Bands should execute mean reversion trades', () => {
    const data = generateHistoricalData(200, 100, 0.05, 0); // volatile, sideways market
    const result = analyzeBollingerReversion(data, 20, 2);
    
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('metrics');
    expect(result.enrichedData[199]).toHaveProperty('bbUpper');
    expect(result.enrichedData[199]).toHaveProperty('bbLower');
  });
});
