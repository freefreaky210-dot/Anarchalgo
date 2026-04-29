import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db, handleFirestoreError } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

interface UserContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({ user: null, loading: true, logout: () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Ensure user document exists
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDocRef);
          if (!docSnap.exists()) {
            await setDoc(userDocRef, {
              email: currentUser.email || '',
              usdBalance: 10000,
              assetBalance: 0
            });
          }
        } catch (e: any) {
          if (e.message?.includes('offline')) {
            console.error('Offline, cannot sync user profile');
          } else {
            handleFirestoreError(e, 'get/set', `users/${currentUser.uid}`);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = () => {
    signOut(auth);
  };

  return (
    <UserContext.Provider value={{ user, loading, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
