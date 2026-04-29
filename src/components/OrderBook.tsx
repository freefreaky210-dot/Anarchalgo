import React, { useEffect, useState, useRef } from 'react';
import { Layers } from 'lucide-react';
import { cn } from '../lib/utils';

interface OrderBookProps {
  symbol: string;
}

type OrderLevel = [string, string]; // [price, quantity]

interface DepthData {
  lastUpdateId: number;
  bids: OrderLevel[];
  asks: OrderLevel[];
}

export function OrderBook({ symbol }: OrderBookProps) {
  const [depth, setDepth] = useState<DepthData>({ lastUpdateId: 0, bids: [], asks: [] });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let ws: WebSocket;
    
    const connect = () => {
      const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth20@100ms`;
      ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.bids && message.asks) {
          setDepth({
            lastUpdateId: message.lastUpdateId,
            bids: message.bids,
            asks: message.asks
          });
        }
      };

      ws.onerror = () => {
        console.warn('Order book WS fallback');
        ws.close();
        ws = new WebSocket(`wss://stream.binance.us:9443/ws/${symbol.toLowerCase()}@depth20@100ms`);
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.bids && message.asks) {
            setDepth({
              lastUpdateId: message.lastUpdateId,
              bids: message.bids,
              asks: message.asks
            });
          }
        };
        wsRef.current = ws;
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [symbol]);

  const bids = depth.bids.slice(0, 10);
  const asks = depth.asks.slice().reverse().slice(-10); // Display 10 asks, best asks at bottom

  const maxTotal = Math.max(
    ...bids.map(b => parseFloat(b[1])),
    ...asks.map(a => parseFloat(a[1]))
  );

  return (
    <div className="bg-white dark:bg-[#0D0D0E] border border-black/10 dark:border-white/10 rounded-2xl p-6 h-full flex flex-col">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-gray-500 mb-4 flex items-center">
        <Layers className="w-4 h-4 mr-2" /> Live Order Book <span className="ml-2 text-emerald-500 font-mono text-[9px]">@depth20</span>
      </h3>

      <div className="flex-1 flex flex-col pt-2 font-mono text-[10px] sm:text-xs">
        <div className="grid grid-cols-3 text-zinc-500 dark:text-gray-500 mb-2 uppercase tracking-widest font-sans font-bold text-[9px]">
          <div className="text-left">Price</div>
          <div className="text-right">Size</div>
          <div className="text-right">Total</div>
        </div>

        {/* Asks (Sell Orders) */}
        <div className="flex flex-col gap-[2px] mb-4 flex-1 justify-end">
          {asks.length === 0 && <div className="text-zinc-400 dark:text-gray-600 text-center py-4">Connecting...</div>}
          {asks.map((ask, i) => {
            const price = parseFloat(ask[0]);
            const size = parseFloat(ask[1]);
            const bgWidth = maxTotal > 0 ? (size / maxTotal) * 100 : 0;
            return (
              <div key={`ask-${i}`} className="grid grid-cols-3 relative px-1 h-5 items-center group cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-rose-500/10 z-0 transition-all duration-300"
                  style={{ width: `${bgWidth}%` }}
                />
                <div className="text-rose-400 z-10 text-left">{price.toFixed(2)}</div>
                <div className="text-zinc-700 dark:text-gray-300 z-10 text-right">{size.toFixed(4)}</div>
                <div className="text-zinc-500 dark:text-gray-500 z-10 text-right">{(price * size).toFixed(0)}</div>
              </div>
            );
          })}
        </div>

        {/* Spread / Current Price Indicator */}
        <div className="flex items-center justify-center py-2 border-y border-black/5 dark:border-white/5 mb-4 my-2 text-zinc-900 dark:text-white font-bold bg-black/5 dark:bg-white/5 mx-1 rounded">
          <span className="text-xs">
            {bids.length > 0 && asks.length > 0 ? (
              <span className={parseFloat(bids[0][0]) >= parseFloat(asks[asks.length-1][0]) ? 'text-emerald-400' : 'text-zinc-700 dark:text-gray-300'}>
                ≈ {((parseFloat(bids[0][0]) + parseFloat(asks[asks.length-1][0])) / 2).toFixed(2)}
              </span>
            ) : '---'}
          </span>
        </div>

        {/* Bids (Buy Orders) */}
        <div className="flex flex-col gap-[2px] flex-1">
          {bids.map((bid, i) => {
            const price = parseFloat(bid[0]);
            const size = parseFloat(bid[1]);
            const bgWidth = maxTotal > 0 ? (size / maxTotal) * 100 : 0;
            return (
              <div key={`bid-${i}`} className="grid grid-cols-3 relative px-1 h-5 items-center group cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 z-0 transition-all duration-300"
                  style={{ width: `${bgWidth}%` }}
                />
                <div className="text-emerald-400 z-10 text-left">{price.toFixed(2)}</div>
                <div className="text-zinc-700 dark:text-gray-300 z-10 text-right">{size.toFixed(4)}</div>
                <div className="text-zinc-500 dark:text-gray-500 z-10 text-right">{(price * size).toFixed(0)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
