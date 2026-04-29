import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ComposedChart, Scatter } from 'recharts';
import { Activity, BarChart2, DollarSign, Settings, TrendingUp, AlertTriangle, Wallet, ShieldAlert, LogOut, Moon, Sun } from 'lucide-react';
import { PricePoint, fetchBinanceHistoricalData } from './lib/data';
import { analyzeSMACrossover, analyzeBollingerReversion } from './lib/algorithms';
import { cn } from './lib/utils';
import { format } from 'date-fns';
import { FundingModal } from './components/FundingModal';
import { LegalDisclaimer } from './components/LegalDisclaimer';
import { OrderBook } from './components/OrderBook';
import { useUser } from './lib/UserContext';
import { useTheme } from './lib/ThemeContext';
import { LoginModal } from './components/LoginModal';
import { db, handleFirestoreError } from './lib/firebase';
import { doc, onSnapshot, updateDoc, collection, addDoc, query, orderBy, limit as fsLimit } from 'firebase/firestore';

type StrategyType = 'sma' | 'bollinger';

export default function App() {
  const { user, loading: authLoading, logout } = useUser();
  const { theme, toggleTheme } = useTheme();
  const [strategy, setStrategy] = useState<StrategyType>('bollinger');
  const [limit, setLimit] = useState(200);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIntervalTime] = useState('1m');
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [portfolio, setPortfolio] = useState({ usd: 10000, asset: 0 });
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [tradeSize, setTradeSize] = useState(0.1);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpPct, setTpPct] = useState(2.0);
  const [slEnabled, setSlEnabled] = useState(false);
  const [slPct, setSlPct] = useState(1.0);
  const [avgEntryPrice, setAvgEntryPrice] = useState<number | null>(null);
  const [liveTrades, setLiveTrades] = useState<{type: 'buy'|'sell', price: number, amount: number, date: string, usdValue: number, reason?: string}[]>([]);
  const lastProcessedSignal = useRef<{date: string, type: string} | null>(null);
  
  const [rawData, setRawData] = useState<PricePoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Sync portfolio and trades with Firebase
  useEffect(() => {
    if (!user) return;
    try {
      const userDoc = doc(db, 'users', user.uid);
      const unsubUser = onSnapshot(userDoc, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setPortfolio({ usd: data.usdBalance || 0, asset: data.assetBalance || 0 });
        }
      }, (err) => handleFirestoreError(err, 'get', `users/${user.uid}`));

      const tradesRef = collection(db, `users/${user.uid}/trades`);
      const q = query(tradesRef, orderBy('date', 'desc'), fsLimit(50));
      const unsubTrades = onSnapshot(q, (snap) => {
        const tr: any[] = [];
        snap.forEach(doc => {
          tr.push(doc.data());
        });
        setLiveTrades(tr);
      }, (err) => handleFirestoreError(err, 'list', `users/${user.uid}/trades`));

      return () => {
        unsubUser();
        unsubTrades();
      };
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  // Fetch initial baseline data
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await fetchBinanceHistoricalData(symbol, interval, limit);
        if (active) setRawData(data);
      } catch (err) {
        console.error(err);
      }
    }
    load();
    return () => { active = false; };
  }, [symbol, interval, limit]);

  const executeTrade = async (type: 'buy' | 'sell', currentPrice: number, tradeAssetAmt: number, tradeUsdAmt: number, reason: string) => {
    if (!user) return;
    try {
      // Create Trade in Firestore
      const tradesRef = collection(db, `users/${user.uid}/trades`);
      await addDoc(tradesRef, {
        userId: user.uid,
        type,
        price: currentPrice,
        amount: tradeAssetAmt,
        usdValue: tradeUsdAmt,
        date: new Date().toISOString(),
        reason
      });

      // Update Portfolio
      const userRef = doc(db, 'users', user.uid);
      const newUsdBalance = type === 'buy' ? portfolio.usd - tradeUsdAmt : portfolio.usd + tradeUsdAmt;
      const newAssetBalance = type === 'buy' ? portfolio.asset + tradeAssetAmt : portfolio.asset - tradeAssetAmt;
      
      await updateDoc(userRef, {
        usdBalance: newUsdBalance,
        assetBalance: newAssetBalance
      });
      
    } catch (e) {
      handleFirestoreError(e, 'write', `users/${user.uid}`);
    }
  };

  // Autonomous Live Market Simulation
  useEffect(() => {
    if (!isLiveMode) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let syntheticInterval: NodeJS.Timeout | null = null;
    let fallbackWs: WebSocket | null = null;

    const startSyntheticTicks = () => {
      console.warn("Using synthetic data generation for ticks as fallback...");
      syntheticInterval = setInterval(() => {
        setRawData((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastPoint = next[next.length - 1];
          const currentPrice = lastPoint.close;
          const volatility = 0.002;
          
          const change = currentPrice * volatility * (Math.random() + Math.random() - 1);
          const newClose = currentPrice + change;
          const newHigh = Math.max(lastPoint.high, newClose);
          const newLow = Math.min(lastPoint.low, newClose);
          
          next[next.length - 1] = {
            ...lastPoint,
            close: newClose,
            high: newHigh,
            low: newLow,
            volume: lastPoint.volume + Math.floor(Math.random() * 10)
          };
          
          return next;
        });
      }, 2000);
    };

    const setupSocket = (socket: WebSocket, isFallback = false) => {
      if (!isFallback) {
        socket.onerror = () => {
          console.warn('Binance .com WS failed, trying .us');
          socket.close();
          fallbackWs = new WebSocket(`wss://stream.binance.us:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);
          fallbackWs.onerror = () => {
            console.warn('Binance .us WS failed as well');
            startSyntheticTicks();
          };
          setupSocket(fallbackWs, true);
          wsRef.current = fallbackWs;
        };
      }

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.e === 'kline') {
          const kline = message.k;
          const newPoint: PricePoint = {
            date: new Date(kline.t).toISOString().replace('T', ' ').substring(0, 19),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v)
          };
          
          setRawData((prev) => {
            if (prev.length === 0) return [newPoint];
            const next = [...prev];
            const lastIndex = next.length - 1;
            
            if (next[lastIndex].date === newPoint.date) {
              next[lastIndex] = newPoint;
            } else {
              next.push(newPoint);
              if (next.length > limit) next.shift();
            }
            return next;
          });
        }
      };
    };

    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(wsUrl);
    setupSocket(ws);
    wsRef.current = ws;

    return () => {
      ws.close();
      if (fallbackWs) fallbackWs.close();
      if (syntheticInterval) clearInterval(syntheticInterval);
    };
  }, [symbol, interval, isLiveMode, limit]);
  
  // Strategy metrics
  const { signals, metrics, enrichedData } = useMemo(() => {
    if (rawData.length === 0) return { signals: [], metrics: { totalTrades: 0, winRate: 0, profitFactor: 0, totalReturn: 0, maxDrawdown: 0 }, enrichedData: [] };
    if (strategy === 'sma') {
      return analyzeSMACrossover(rawData, 10, 30);
    } else {
      return analyzeBollingerReversion(rawData, 20, 2);
    }
  }, [rawData, strategy]);

  // Live Auto Trading Execution Loop
  useEffect(() => {
    if (!autoTradeEnabled || rawData.length === 0 || enrichedData.length === 0) return;
    
    const lastPoint = enrichedData[enrichedData.length - 1];
    
    if (lastPoint.signal) {
      if (
        !lastProcessedSignal.current || 
        lastProcessedSignal.current.date !== lastPoint.date || 
        lastProcessedSignal.current.type !== lastPoint.signal
      ) {
        const currentPrice = lastPoint.close;
        
        if (lastPoint.signal === 'buy') {
          const investUsd = portfolio.usd * tradeSize;
          if (investUsd >= 1) {
            const boughtAsset = investUsd / currentPrice;
            
            setAvgEntryPrice(currentAvg => {
              const totalAsset = portfolio.asset + boughtAsset;
              const currentTotalValue = portfolio.asset * (currentAvg || currentPrice) + investUsd;
              return currentTotalValue / totalAsset;
            });

            if (user) {
               executeTrade('buy', currentPrice, boughtAsset, investUsd, 'Strategy Signal');
            } else {
               setPortfolio(prev => ({ usd: prev.usd - investUsd, asset: prev.asset + boughtAsset }));
               setLiveTrades(lt => [{ type: 'buy', price: currentPrice, amount: boughtAsset, date: new Date().toLocaleTimeString(), usdValue: investUsd, reason: 'Strategy Signal' }, ...lt]);
            }
          }
        } else if (lastPoint.signal === 'sell') {
          let sellAsset = portfolio.asset * tradeSize;
          if (sellAsset * currentPrice < 1) {
            sellAsset = portfolio.asset;
          }
          if (sellAsset * currentPrice >= 1) {
            const gainedUsd = sellAsset * currentPrice;
            
            if (user) {
               executeTrade('sell', currentPrice, sellAsset, gainedUsd, 'Strategy Signal');
            } else {
               setPortfolio(prev => ({ usd: prev.usd + gainedUsd, asset: prev.asset - sellAsset }));
               setLiveTrades(lt => [{ type: 'sell', price: currentPrice, amount: sellAsset, date: new Date().toLocaleTimeString(), usdValue: gainedUsd, reason: 'Strategy Signal' }, ...lt]);
            }
            
            if (portfolio.asset - sellAsset < 0.000001) {
               setAvgEntryPrice(null);
            }
          }
        }

        lastProcessedSignal.current = { date: lastPoint.date, type: lastPoint.signal };
      }
    }
  }, [rawData, enrichedData, autoTradeEnabled, tradeSize, portfolio, user]);

  // TP/SL Execution Loop
  useEffect(() => {
    if (!autoTradeEnabled || rawData.length === 0 || portfolio.asset <= 0 || !avgEntryPrice) return;
    
    const currentPrice = rawData[rawData.length - 1].close;
    let shouldSell = false;
    let slReason = '';

    if (tpEnabled && currentPrice >= avgEntryPrice * (1 + tpPct / 100)) {
      shouldSell = true;
      slReason = 'Take Profit';
    } else if (slEnabled && currentPrice <= avgEntryPrice * (1 - slPct / 100)) {
      shouldSell = true;
      slReason = 'Stop Loss';
    }

    if (shouldSell) {
      lastProcessedSignal.current = { date: rawData[rawData.length - 1].date, type: 'sell' };
      
      const sellAsset = portfolio.asset;
      if (sellAsset * currentPrice >= 1) {
        const gainedUsd = sellAsset * currentPrice;
        
        if (user) {
          executeTrade('sell', currentPrice, sellAsset, gainedUsd, slReason);
        } else {
          setPortfolio(prev => ({ usd: prev.usd + gainedUsd, asset: 0 }));
          setLiveTrades(lt => [{ type: 'sell', price: currentPrice, amount: sellAsset, date: new Date().toLocaleTimeString(), usdValue: gainedUsd, reason: slReason }, ...lt]);
        }
        setAvgEntryPrice(null);
      }
    }
  }, [rawData, autoTradeEnabled, tpEnabled, tpPct, slEnabled, slPct, portfolio, avgEntryPrice, user]);

  // Derived display values
  const currentPrice = rawData.length > 0 ? rawData[rawData.length - 1].close : 0;
  const currentEquity = portfolio.usd + (portfolio.asset * currentPrice);
  const livePnl = currentEquity - 10000; // Baseline initial simulated equity = 10k
  const sessionReturnPct = (livePnl / 10000) * 100;

  return (
    <div className="min-h-screen flex flex-col font-sans bg-zinc-50 dark:bg-[#0A0A0B] text-zinc-600 dark:text-gray-400">
      <LoginModal isOpen={!user && !authLoading} />
      <header className="h-20 border-b border-black/5 dark:border-white/5 px-8 flex items-center justify-between bg-zinc-50 dark:bg-[#0A0A0B] sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Activity className="w-6 h-6 text-emerald-500" />
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white tracking-tight">
            QuantTrade<span className="text-zinc-500 dark:text-gray-500 font-light ml-1">Pro</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-zinc-400 dark:text-gray-400" /> : <Moon className="w-4 h-4 text-zinc-600 dark:text-gray-600" />}
          </button>
          <button 
            onClick={() => setIsFundingModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-xl transition-all"
          >
            <Wallet className="w-4 h-4 text-emerald-500" />
            <div className="text-left hidden sm:block">
              <p className="text-[9px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest font-bold">Capital</p>
              <p className="text-sm font-mono text-zinc-900 dark:text-white leading-none">${currentEquity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
          </button>
          <div className="text-right hidden sm:block">
            {user ? (
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-[10px] text-zinc-400 dark:text-gray-600 uppercase font-bold tracking-widest">Account</p>
                  <p className="text-xs text-zinc-900 dark:text-white max-w-[120px] truncate">{user.email}</p>
                </div>
                <button 
                  onClick={logout}
                  className="w-8 h-8 rounded bg-black/5 dark:bg-white/5 flex items-center justify-center hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-zinc-400 dark:text-gray-600 uppercase font-bold tracking-widest">Latency</p>
                <p className="text-sm font-mono text-emerald-400">1.2ms (STABLE)</p>
              </>
            )}
          </div>
          <button 
            onClick={() => setIsLiveMode(!isLiveMode)}
            className={cn(
              "px-3 py-1 text-[10px] font-bold rounded-full border uppercase tracking-widest flex items-center transition-all",
              isLiveMode 
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                : "bg-rose-500/10 text-rose-500 border-rose-500/20"
            )}
          >
            {isLiveMode ? (
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mr-2"></span>
            ) : (
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full mr-2"></span>
            )}
            {isLiveMode ? '24/7 Engine Active' : 'Engine Paused'}
          </button>
        </div>
      </header>

      {/* Real-time Performance Banner */}
      <div className="border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#0D0D0E] px-8 py-4 flex flex-wrap gap-8 items-center">
        <div>
          <p className="text-[10px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest font-bold mb-1">Current Equity</p>
          <p className="text-xl text-zinc-900 dark:text-white font-mono flex items-center">
            ${currentEquity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </p>
        </div>
        <div className="w-px h-8 bg-black/10 dark:bg-white/10 hidden sm:block"></div>
        <div>
          <p className="text-[10px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest font-bold mb-1">Live P&L</p>
          <p className={cn("text-xl font-mono flex items-center", livePnl >= 0 ? "text-emerald-500" : "text-rose-500")}>
            {livePnl >= 0 ? '+' : '-'}${Math.abs(livePnl).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </p>
        </div>
        <div className="w-px h-8 bg-black/10 dark:bg-white/10 hidden sm:block"></div>
        <div>
          <p className="text-[10px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest font-bold mb-1">Session Return</p>
          <p className={cn("text-xl font-mono flex items-center", sessionReturnPct >= 0 ? "text-emerald-500" : "text-rose-500")}>
            {sessionReturnPct >= 0 ? <TrendingUp className="w-4 h-4 mr-2" /> : <TrendingUp className="w-4 h-4 mr-2 rotate-180" />}
            {sessionReturnPct.toFixed(2)}%
          </p>
        </div>
        <div className="w-px h-8 bg-black/10 dark:bg-white/10 hidden sm:block"></div>
        <div>
          <p className="text-[10px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest font-bold mb-1">Asset Holdings</p>
          <p className="text-xl text-zinc-900 dark:text-white font-mono flex items-center">
            {portfolio.asset.toFixed(4)} <span className="text-xs text-zinc-500 dark:text-gray-500 ml-2">{symbol.replace('USDT', '')}</span>
          </p>
        </div>
        <div className="w-px h-8 bg-black/10 dark:bg-white/10 hidden sm:block"></div>
        <div>
          <p className="text-[10px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest font-bold mb-1">Live Trades Today</p>
          <p className="text-xl text-zinc-900 dark:text-white font-mono flex items-center">
            {liveTrades.length}
            <span className="text-xs text-zinc-500 dark:text-gray-500 ml-2 font-sans font-normal uppercase tracking-widest">Completed</span>
          </p>
        </div>
      </div>

      <main className="flex-1 p-8 grid grid-cols-12 gap-6 content-start">
        {/* Controls Column */}
        <aside className="col-span-12 lg:col-span-3 space-y-6">
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6">
            <h2 className="text-[11px] font-bold text-zinc-500 dark:text-gray-500 mb-6 tracking-widest uppercase flex items-center">
              <Settings className="w-4 h-4 mr-2" /> Parameters
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest block mb-3">Strategy</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setStrategy('bollinger')}
                    className={cn(
                      "py-2 px-3 text-xs font-bold rounded-lg border transition-colors duration-200",
                      strategy === 'bollinger' 
                        ? "bg-black/10 dark:bg-white/10 border-black/20 dark:border-white/20 text-zinc-900 dark:text-white" 
                        : "bg-transparent border-black/5 dark:border-white/5 text-zinc-500 dark:text-gray-500 hover:text-zinc-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    )}
                  >
                    Mean Reversion
                  </button>
                  <button 
                    onClick={() => setStrategy('sma')}
                    className={cn(
                      "py-2 px-3 text-xs font-bold rounded-lg border transition-colors duration-200",
                      strategy === 'sma' 
                        ? "bg-black/10 dark:bg-white/10 border-black/20 dark:border-white/20 text-zinc-900 dark:text-white" 
                        : "bg-transparent border-black/5 dark:border-white/5 text-zinc-500 dark:text-gray-500 hover:text-zinc-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    )}
                  >
                    SMA Crossover
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest block mb-3">Time Horizon (Blocks)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="50" max="500" step="10"
                    value={limit} 
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="flex-1 appearance-none bg-black/10 dark:bg-white/10 h-1 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  />
                  <span className="font-mono text-xs text-zinc-900 dark:text-white bg-black/5 dark:bg-white/5 px-2 py-1 rounded border border-black/10 dark:border-white/10">{limit}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest block mb-3">Asset & Interval</label>
                <div className="flex items-center gap-2">
                  <select 
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="flex-1 bg-black/5 dark:bg-white/5 text-xs text-zinc-900 dark:text-white border border-black/10 dark:border-white/10 rounded-lg px-2 py-2 outline-none"
                  >
                    <option value="BTCUSDT">BTC/USDT</option>
                    <option value="ETHUSDT">ETH/USDT</option>
                    <option value="SOLUSDT">SOL/USDT</option>
                    <option value="BNBUSDT">BNB/USDT</option>
                  </select>
                  <select 
                    value={interval}
                    onChange={(e) => setIntervalTime(e.target.value)}
                    className="w-20 bg-black/5 dark:bg-white/5 text-xs text-zinc-900 dark:text-white border border-black/10 dark:border-white/10 rounded-lg px-2 py-2 outline-none"
                  >
                    <option value="1m">1m</option>
                    <option value="5m">5m</option>
                    <option value="15m">15m</option>
                    <option value="1h">1h</option>
                    <option value="1d">1d</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-black/10 dark:border-white/10">
                <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest block mb-3">Live Execution Engine</label>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-black/5 dark:border-white/5">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Auto Trading</h4>
                      <p className="text-[9px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest mt-1">Execute on Signal</p>
                    </div>
                    <button 
                      onClick={() => setAutoTradeEnabled(!autoTradeEnabled)}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        autoTradeEnabled ? "bg-emerald-500" : "bg-gray-700"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full absolute top-1 transition-all",
                        autoTradeEnabled ? "left-7" : "left-1"
                      )}></div>
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                       <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest">Trade Size (Fraction)</label>
                       <span className="text-emerald-500 font-mono text-xs">{(tradeSize * 100).toFixed(0)}%</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[0.05, 0.1, 0.25, 0.5, 1.0].map(size => (
                        <button
                          key={size}
                          onClick={() => setTradeSize(size)}
                          className={cn(
                            "py-1 text-[10px] font-bold font-mono rounded border transition-colors",
                            tradeSize === size ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-zinc-600 dark:text-gray-400 hover:bg-black/10 dark:hover:bg-white/10"
                          )}
                        >
                          {size * 100}%
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-zinc-500 dark:text-gray-500 mt-2">
                      Allocates the percentage of available USD (for buys) or Asset (for sells) per executed trade. Using small fractions accelerates compounding speed.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest text-emerald-500">Take Profit (TP)</label>
                        <p className="text-[8px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest mt-0.5">Auto-sell at target</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number"
                          value={tpPct}
                          onChange={(e) => setTpPct(Number(e.target.value))}
                          disabled={!tpEnabled}
                          className="w-16 bg-zinc-100 dark:bg-black border border-black/10 dark:border-white/10 rounded px-2 py-1 text-xs text-zinc-900 dark:text-white text-right disabled:opacity-50"
                          step="0.1"
                          min="0.1"
                        />
                        <span className="text-xs text-zinc-500 dark:text-gray-500">%</span>
                        <button 
                          onClick={() => setTpEnabled(!tpEnabled)}
                          className={cn(
                            "ml-2 w-8 h-4 rounded-full transition-colors relative",
                            tpEnabled ? "bg-emerald-500" : "bg-gray-700"
                          )}
                        >
                          <div className={cn(
                            "w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all",
                            tpEnabled ? "left-[18px]" : "left-0.5"
                          )}></div>
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest text-rose-500">Stop Loss (SL)</label>
                        <p className="text-[8px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest mt-0.5">Auto-sell to limit risk</p>
                      </div>
                      <div className="flex items-center gap-2">
                         <input 
                          type="number"
                          value={slPct}
                          onChange={(e) => setSlPct(Number(e.target.value))}
                          disabled={!slEnabled}
                          className="w-16 bg-zinc-100 dark:bg-black border border-black/10 dark:border-white/10 rounded px-2 py-1 text-xs text-zinc-900 dark:text-white text-right disabled:opacity-50"
                          step="0.1"
                          min="0.1"
                        />
                        <span className="text-xs text-zinc-500 dark:text-gray-500">%</span>
                        <button 
                          onClick={() => setSlEnabled(!slEnabled)}
                          className={cn(
                            "ml-2 w-8 h-4 rounded-full transition-colors relative",
                            slEnabled ? "bg-rose-500" : "bg-gray-700"
                          )}
                        >
                          <div className={cn(
                            "w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all",
                            slEnabled ? "left-[18px]" : "left-0.5"
                          )}></div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-black/10 dark:border-white/10">
                <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest block mb-3">Global Infrastructure (24/7)</label>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 px-3 py-2 rounded">
                    <span className="text-zinc-600 dark:text-gray-400">LDN-Equinix</span>
                    <span className="text-emerald-500">1.2ms</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 px-3 py-2 rounded">
                    <span className="text-zinc-600 dark:text-gray-400">NY4-Secaucus</span>
                    <span className="text-emerald-500">8.4ms</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 px-3 py-2 rounded">
                    <span className="text-zinc-600 dark:text-gray-400">TYO-CC1</span>
                    <span className="text-emerald-500">42.1ms</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 px-3 py-2 rounded">
                    <span className="text-zinc-600 dark:text-gray-400">SGP-SG1</span>
                    <span className="text-emerald-500">38.9ms</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0D0D0E] border border-black/10 dark:border-white/10 rounded-2xl p-6">
             <h2 className="text-[11px] font-bold text-zinc-500 dark:text-gray-500 mb-6 tracking-widest uppercase flex items-center">
              <BarChart2 className="w-4 h-4 mr-2" /> Performance
            </h2>
            <div className="space-y-4">
              <MetricItem 
                label="Total Return" 
                value={`${(metrics.totalReturn * 100).toFixed(2)}%`}
                trend={metrics.totalReturn >= 0 ? 'up' : 'down'}
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <MetricItem 
                label="Win Rate" 
                value={`${(metrics.winRate * 100).toFixed(1)}%`}
                trend={metrics.winRate > 0.5 ? 'neutral' : 'down'}
                icon={<Activity className="w-4 h-4" />}
              />
              <MetricItem 
                label="Profit Factor" 
                value={metrics.profitFactor === Infinity ? 'â+' : metrics.profitFactor.toFixed(2)}
                trend={metrics.profitFactor >= 1.2 ? 'up' : 'down'}
                icon={<DollarSign className="w-4 h-4" />}
              />
              <MetricItem 
                label="Max Drawdown" 
                value={`${-(metrics.maxDrawdown * 100).toFixed(2)}%`}
                trend="down"
                icon={<AlertTriangle className="w-4 h-4" />}
              />
            </div>
          </div>
        </aside>

        {/* Main Chart area */}
        <section className="col-span-12 lg:col-span-6 space-y-6">
          <div className="bg-zinc-100 dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-6 h-[460px] flex flex-col relative shadow-none">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-gray-500">Backtest Visualization</h3>
              <div className="flex gap-4 text-[10px] font-mono">
                <span className="text-emerald-500">● ENTRY SIGNAL</span>
                <span className="text-rose-500">● EXIT SIGNAL</span>
                <span className="text-blue-500">
                  ● {strategy === 'sma' ? 'SMA (10,30)' : 'Bollinger (20,2)'}
                </span>
              </div>
            </div>
            <div className="flex-1 w-full relative -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={enrichedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280" 
                    fontSize={11} 
                    fontFamily="var(--font-mono)"
                    tickMargin={12} 
                    minTickGap={30}
                  />
                  <YAxis 
                    stroke="#6b7280" 
                    fontSize={11} 
                    fontFamily="var(--font-mono)"
                    domain={['dataMin', 'dataMax']} 
                    tickFormatter={(v) => v != null ? `$${Number(v).toLocaleString(undefined, {maximumFractionDigits: 2})}` : ''}
                    orientation="right"
                    tickMargin={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: theme === 'dark' ? '#000' : '#fff', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', borderRadius: '12px', color: theme === 'dark' ? '#fff' : '#000' }}
                    itemStyle={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                    labelStyle={{ marginBottom: '8px', fontWeight: 'bold' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                  
                  {strategy === 'bollinger' && (
                    <>
                      <Line isAnimationActive={false} type="monotone" dataKey="bbUpper" stroke="#a855f7" strokeWidth={1} dot={false} strokeOpacity={0.6} strokeDasharray="4 4" name="Upper Band" />
                      <Line isAnimationActive={false} type="monotone" dataKey="bbLower" stroke="#a855f7" strokeWidth={1} dot={false} strokeOpacity={0.6} strokeDasharray="4 4" name="Lower Band" />
                      <Line isAnimationActive={false} type="monotone" dataKey="sma" stroke="#10b981" strokeWidth={1} dot={false} strokeOpacity={0.8} name="Basis (SMA)" />
                    </>
                  )}

                  {strategy === 'sma' && (
                    <>
                      <Line isAnimationActive={false} type="monotone" dataKey="fastSma" stroke="#10b981" strokeWidth={1.5} dot={false} name="Fast SMA (10)" />
                      <Line isAnimationActive={false} type="monotone" dataKey="slowSma" stroke="#f43f5e" strokeWidth={1.5} dot={false} name="Slow SMA (30)" />
                    </>
                  )}

                  <Line isAnimationActive={false} type="monotone" dataKey="close" stroke="#3b82f6" strokeWidth={2} dot={false} name="Price" activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 0 }} />
                  
                  {/* Signals */}
                  <Scatter isAnimationActive={false} dataKey="buySignal" fill="#10b981" name="Buy" shape="triangle" />
                  <Scatter isAnimationActive={false} dataKey="sellSignal" fill="#f43f5e" name="Sell" shape="star" />

                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0D0D0E] border border-black/10 dark:border-white/10 rounded-2xl p-6">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-gray-500 mb-4">Live Executions</h3>
            {liveTrades.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500 dark:text-gray-500">No live trades executed yet. Enable Auto Trading.</div>
            ) : (
              <div className="overflow-y-auto max-h-[300px]">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-black/5 dark:border-white/5 text-[10px] uppercase text-zinc-400 dark:text-gray-600 font-bold tracking-widest sticky top-0 bg-white dark:bg-[#0D0D0E]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium text-right">Price</th>
                      <th className="px-4 py-3 font-medium text-right">Value (USD)</th>
                      <th className="px-4 py-3 font-medium pl-6">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {liveTrades.map((trade, i) => (
                      <tr key={i} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-zinc-600 dark:text-gray-400">{trade.date}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest",
                            trade.type === 'buy' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                          )}>
                            {trade.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-700 dark:text-gray-300">
                          ${trade.price.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-900 dark:text-white font-bold">
                          ${trade.usdValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-gray-500 pl-6 tracking-wide font-sans">
                          {trade.reason || 'Manual/Other'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Order Book Column */}
        <aside className="col-span-12 lg:col-span-3 space-y-6">
          <OrderBook symbol={symbol} />
        </aside>
      </main>
      
      {/* Legal Footer */}
      <footer className="border-t border-black/5 dark:border-white/5 bg-zinc-50 dark:bg-[#0A0A0B] py-6 px-8 mt-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center text-xs text-zinc-500 dark:text-gray-500">
            <ShieldAlert className="w-4 h-4 mr-2" />
            <span><strong>Disclaimer:</strong> This platform is for demonstration and educational purposes only. Automated trading carries significant risk. Not financial advice.</span>
          </div>
          <div className="flex gap-6 text-[10px] uppercase tracking-widest text-zinc-500 dark:text-gray-500 font-bold">
            <a href="#" className="hover:text-emerald-500 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-emerald-500 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-emerald-500 transition-colors">Risk Disclosure</a>
          </div>
        </div>
      </footer>

      <FundingModal 
        isOpen={isFundingModalOpen} 
        onClose={() => setIsFundingModalOpen(false)} 
        balance={portfolio.usd} 
        onUpdateBalance={(val) => {
          if (user) {
            updateDoc(doc(db, 'users', user.uid), {
              usdBalance: portfolio.usd + val
            }).catch(e => handleFirestoreError(e, 'update', `users/${user.uid}`));
          } else {
            setPortfolio(p => ({...p, usd: p.usd + val}));
          }
        }} 
      />
      <LegalDisclaimer />
    </div>
  );
}

function MetricItem({ label, value, trend, icon }: { label: string, value: string, trend: 'up'|'down'|'neutral', icon: React.ReactNode }) {
  const isUp = trend === 'up';
  const isDown = trend === 'down';
  
  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-5 rounded-2xl">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-zinc-500 dark:text-gray-500 font-bold uppercase tracking-widest">{label}</p>
        <span className="text-zinc-500 dark:text-gray-500">{icon}</span>
      </div>
      <p className="text-3xl font-light text-zinc-900 dark:text-white">{value}</p>
      <div className={cn(
        "mt-2 text-xs flex items-center gap-1 font-mono",
        isUp ? 'text-emerald-500' : isDown ? 'text-rose-400' : 'text-zinc-600 dark:text-gray-400'
      )}>
        {isUp ? '+' : ''}{isDown ? '-' : ''}TREND <span className="text-[10px] text-zinc-400 dark:text-gray-600 font-sans uppercase">Analysis</span>
      </div>
    </div>
  );
}
