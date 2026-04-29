import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldCheck, FileText, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

export function LegalDisclaimer() {
  const [accepted, setAccepted] = useState(true);

  useEffect(() => {
    const hasAccepted = localStorage.getItem('quant_trade_legal_accepted');
    if (!hasAccepted) {
      setAccepted(false);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('quant_trade_legal_accepted', 'true');
    setAccepted(true);
  };

  if (accepted) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-zinc-50 dark:bg-[#0A0A0B] border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-rose-500/20 bg-rose-500/5 flex items-center">
          <AlertTriangle className="w-5 h-5 text-rose-500 mr-3" />
          <h2 className="text-rose-500 font-bold uppercase tracking-widest text-sm">Important Legal & Risk Disclosure</h2>
        </div>
        
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto text-zinc-600 dark:text-gray-400 text-sm leading-relaxed custom-scrollbar">
          <p>
            <strong>Risk Warning:</strong> Trading cryptocurrencies, synthetic assets, and using automated trading algorithms involves a significant level of risk and is not suitable for all investors. You may lose some or all of your initial investment. You should carefully consider your investment objectives, level of experience, and risk appetite.
          </p>
          <p>
            <strong>Simulation Environment:</strong> The tools, charts, signals, and algorithms provided in this dashboard are for educational and simulation purposes only. They do not constitute financial advice, investment recommendations, or an offer to buy or sell any financial instruments.
          </p>
          <p>
            <strong>Funding & Capital:</strong> The "Add Funds" and "Withdraw" features in this application are strictly experimental user interfaces simulating API interactions with third-party payment providers (e.g., Stripe, PayPal, Cash App). <b>No real money is transacted.</b>
          </p>
          <p>
            <strong>No Financial Advice:</strong> The creators of this application are not registered financial advisors. Any decisions made based on the information provided by this application are entirely your own responsibility. Past performance of any trading system or methodology is not necessarily indicative of future results.
          </p>
          <p>
            By clicking "I Understand & Accept", you acknowledge that you have read, understood, and agreed to our <a href="#" className="text-emerald-500 hover:underline">Terms of Service</a>, <a href="#" className="text-emerald-500 hover:underline">Privacy Policy</a>, and this Risk Disclosure.
          </p>
        </div>

        <div className="p-6 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#0D0D0E] flex items-center justify-between">
          <div className="flex items-center text-xs text-zinc-500 dark:text-gray-500">
            <ShieldCheck className="w-4 h-4 mr-2" />
            V 4.0.0 (Compliance Enforced)
          </div>
          <button 
            onClick={handleAccept}
            className="px-6 py-3 bg-white text-black font-bold text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            I Understand & Accept
          </button>
        </div>
      </div>
    </div>
  );
}
