import React, { useState, useEffect } from 'react';
import { X, Wallet, Building, CreditCard, ArrowDownCircle, ArrowUpCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUser } from '../lib/UserContext';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';

interface FundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  onUpdateBalance: (amount: number) => void;
}

type Tab = 'deposit' | 'withdraw' | 'accounts';

const PLATFORMS = [
  { id: 'paypal', name: 'PayPal', icon: '🅿️', label: 'Email', placeholder: 'user@example.com' },
  { id: 'cashapp', name: 'Cash App', icon: '💲', label: 'Cash App Tag', placeholder: '$Cashtag' },
  { id: 'chime', name: 'Chime', icon: '🏦', label: 'Chime ID / Email', placeholder: 'Email or Phone number' },
  { id: 'bank', name: 'Bank Transfer (ACH)', icon: '🏛️', label: 'Account Number', placeholder: 'Account Number' },
  { id: 'stripe', name: 'Stripe', icon: '💳', label: 'Stripe Email', placeholder: 'admin@stripe.com' },
];

export function FundingModal({ isOpen, onClose, balance, onUpdateBalance }: FundingModalProps) {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState('');
  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
  const [accountDetails, setAccountDetails] = useState<Record<string, string>>({});
  const [selectedAccount, setSelectedAccount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectionInput, setConnectionInput] = useState('');

  useEffect(() => {
    if (!user) return;
    try {
      const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const addresses = data.depositAddresses || {};
          setAccountDetails(addresses);
          const activeAccounts = Object.keys(addresses).filter(k => addresses[k]);
          setConnectedAccounts(activeAccounts);
          if (activeAccounts.length > 0 && !selectedAccount) {
            setSelectedAccount(activeAccounts[0]);
          }
        }
      }, (e) => {
        console.error(e);
      });
      return () => unsub();
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  if (!isOpen) return null;

  const handleTransaction = (type: 'deposit' | 'withdraw') => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setStatus({ type: 'error', msg: 'Please enter a valid amount' });
      return;
    }

    if (type === 'withdraw' && val > balance) {
      setStatus({ type: 'error', msg: 'Insufficient funds for withdrawal' });
      return;
    }

    setIsProcessing(true);
    setStatus(null);

    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false);
      if (type === 'deposit') {
        onUpdateBalance(val);
        setStatus({ type: 'success', msg: `Successfully deposited $${val.toFixed(2)}` });
      } else {
        onUpdateBalance(-val);
        const detailStr = accountDetails[selectedAccount] ? ` (${accountDetails[selectedAccount]})` : '';
        setStatus({ type: 'success', msg: `Successfully withdrew $${val.toFixed(2)} to ${PLATFORMS.find(p => p.id === selectedAccount)?.name}${detailStr}` });
      }
      setAmount('');
    }, 1500);
  };

  const initiateConnect = (id: string) => {
    setConnectingId(id);
    setConnectionInput(accountDetails[id] || '');
    setStatus(null);
  };

  const confirmConnect = async () => {
    if (!connectingId) return;
    if (!connectionInput.trim()) {
      setStatus({ type: 'error', msg: 'Please enter the required information' });
      return;
    }

    setIsProcessing(true);
    setStatus(null);
    
    try {
      const updatedDetails = { ...accountDetails, [connectingId]: connectionInput };
      
      if (user) {
        await updateDoc(doc(db, 'users', user.uid), {
          depositAddresses: updatedDetails
        });
      } else {
        setAccountDetails(updatedDetails);
        setConnectedAccounts([...connectedAccounts, connectingId]);
      }
      
      setIsProcessing(false);
      setStatus({ type: 'success', msg: `Successfully connected ${PLATFORMS.find(p => p.id === connectingId)?.name}` });
      setConnectingId(null);
      setConnectionInput('');
    } catch (e: any) {
      if (user) handleFirestoreError(e, 'update', `users/${user.uid}`);
      setIsProcessing(false);
      setStatus({ type: 'error', msg: 'Failed to update connection details' });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-50 dark:bg-[#0A0A0B] border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#0D0D0E]">
          <h2 className="text-zinc-900 dark:text-white font-semibold flex items-center">
            <Wallet className="w-5 h-5 mr-2 text-emerald-500" />
            Funding & Transfers
          </h2>
          <button onClick={onClose} className="text-zinc-500 dark:text-gray-500 hover:text-zinc-900 dark:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#0D0D0E]/50">
          <button 
            onClick={() => setActiveTab('deposit')}
            className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors", activeTab === 'deposit' ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5" : "text-zinc-500 dark:text-gray-500 hover:text-zinc-700 dark:text-gray-300")}
          >
            Deposit
          </button>
          <button 
            onClick={() => setActiveTab('withdraw')}
            className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors", activeTab === 'withdraw' ? "text-rose-400 border-b-2 border-rose-500 bg-rose-500/5" : "text-zinc-500 dark:text-gray-500 hover:text-zinc-700 dark:text-gray-300")}
          >
            Withdraw
          </button>
          <button 
            onClick={() => setActiveTab('accounts')}
            className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors", activeTab === 'accounts' ? "text-blue-400 border-b-2 border-blue-500 bg-blue-500/5" : "text-zinc-500 dark:text-gray-500 hover:text-zinc-700 dark:text-gray-300")}
          >
            Accounts
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {status && (
            <div className={cn("mb-6 p-3 text-sm rounded-lg flex items-center border", status.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400")}>
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
              {status.msg}
            </div>
          )}

          {(activeTab === 'deposit' || activeTab === 'withdraw') && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-xs text-zinc-500 dark:text-gray-500 uppercase tracking-widest font-bold mb-1">Available Trading Capital</p>
                <p className="text-4xl font-light text-zinc-900 dark:text-white">${balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest block mb-2">Select Account</label>
                {connectedAccounts.length === 0 ? (
                  <p className="text-sm text-rose-400 border border-rose-500/20 bg-rose-500/5 p-3 rounded-lg">Please connect an account first in the Accounts tab.</p>
                ) : (
                  <select 
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white outline-none appearance-none cursor-pointer"
                  >
                    {connectedAccounts.map(id => (
                      <option key={id} value={id} className="bg-zinc-50 dark:bg-[#0A0A0B]">{PLATFORMS.find(p => p.id === id)?.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-widest block mb-2">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 dark:text-gray-400">$</span>
                  <input 
                    type="number" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-8 pr-4 py-3 text-zinc-900 dark:text-white outline-none focus:border-emerald-500/50 transition-colors font-mono"
                  />
                </div>
              </div>

              <button 
                onClick={() => handleTransaction(activeTab)}
                disabled={isProcessing || connectedAccounts.length === 0}
                className={cn(
                  "w-full py-4 rounded-xl font-bold flex items-center justify-center transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
                  activeTab === 'deposit' 
                    ? "bg-emerald-500 hover:bg-emerald-600 text-black shadow-emerald-500/20" 
                    : "bg-rose-500 hover:bg-rose-600 text-zinc-900 dark:text-white shadow-rose-500/20"
                )}
              >
                {isProcessing ? (
                  <span className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></span>
                ) : (
                  <>
                    {activeTab === 'deposit' ? <ArrowDownCircle className="w-5 h-5 mr-2" /> : <ArrowUpCircle className="w-5 h-5 mr-2" />}
                    {activeTab === 'deposit' ? 'Add Funds to Engine' : 'Withdraw Profits'}
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-600 dark:text-gray-400 mb-4">Connect external accounts and wallets to deposit trading capital and receive profits automatically.</p>
              
              <div className="space-y-3">
                {PLATFORMS.map(platform => {
                  const isConnected = connectedAccounts.includes(platform.id);
                  const isConnecting = connectingId === platform.id;
                  
                  return (
                    <div key={platform.id} className="flex flex-col p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-xl mr-3">{platform.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center">
                              {platform.name}
                            </p>
                            <p className="text-[10px] text-zinc-500 dark:text-gray-500">
                              {isConnected ? `${accountDetails[platform.id] || 'Connected'}` : 'Not connected'}
                            </p>
                          </div>
                        </div>
                        {isConnected ? (
                          <div className="flex items-center gap-2">
                            {isConnecting ? (
                              <button 
                                onClick={() => setConnectingId(null)}
                                className="px-3 py-1 text-zinc-600 dark:text-gray-400 font-bold text-[10px] rounded hover:text-zinc-900 dark:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            ) : (
                              <button 
                                onClick={() => initiateConnect(platform.id)}
                                disabled={isProcessing}
                                className="px-3 py-1 text-blue-400 hover:text-blue-300 font-bold text-[10px] rounded transition-colors uppercase tracking-widest"
                              >
                                Edit
                              </button>
                            )}
                            <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded-full border border-emerald-500/20 uppercase">
                              Active
                            </div>
                          </div>
                        ) : isConnecting ? (
                          <button 
                            onClick={() => setConnectingId(null)}
                            className="px-3 py-1 text-zinc-600 dark:text-gray-400 font-bold text-[10px] rounded hover:text-zinc-900 dark:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        ) : (
                          <button 
                            onClick={() => initiateConnect(platform.id)}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-white text-black font-bold text-xs rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                          >
                            Connect
                          </button>
                        )}
                      </div>
                      
                      {isConnecting && (
                        <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10 flex flex-col gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-600 dark:text-gray-400 uppercase tracking-widest block mb-2">{platform.label}</label>
                            <input 
                              type="text" 
                              value={connectionInput}
                              onChange={(e) => setConnectionInput(e.target.value)}
                              placeholder={platform.placeholder}
                              className="w-full bg-black/50 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:border-emerald-500/50 transition-colors"
                            />
                          </div>
                          <button 
                            onClick={confirmConnect}
                            disabled={isProcessing || !connectionInput.trim()}
                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs rounded-lg transition-colors disabled:opacity-50 flex justify-center items-center"
                          >
                            {isProcessing ? 'Connecting...' : `Save ${platform.name}`}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
