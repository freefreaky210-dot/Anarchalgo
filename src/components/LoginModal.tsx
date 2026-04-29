import React from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn } from 'lucide-react';

export function LoginModal({ isOpen }: { isOpen: boolean }) {
  if (!isOpen) return null;

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
      alert('Failed to login');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#0D0D0E] border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-sm p-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
          <LogIn className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Welcome to AutoTrade</h2>
        <p className="text-sm text-zinc-500 dark:text-gray-500 text-center mb-8">
          Sign in to access your live execution engine, portfolio, and history.
        </p>

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center py-3 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-black dark:text-white border border-gray-300 dark:border-white/10 font-bold rounded-lg transition-colors"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 mr-3" alt="Google" />
          Continue with Google
        </button>
      </div>
    </div>
  );
}
