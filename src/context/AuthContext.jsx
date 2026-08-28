import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

const AuthContext = createContext();

const defaultPermissions = {
  modules: {
    dashboard: false,
    purchases: false,
    processing: false,
    inventory: false,
    catalog: false,
    suppliers: false
  },
  financials: false
};

const adminPermissions = {
  modules: {
    dashboard: true,
    purchases: true,
    processing: true,
    inventory: true,
    catalog: true,
    suppliers: true
  },
  financials: true,
  admin: true
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        if (user.email === 'info@indiannaturalhair.com') {
          setPermissions(adminPermissions);
          setIsAllowed(true);
          setLoading(false);
        } else {
          try {
            const userDoc = await getDoc(doc(db, 'allowed_users', user.email));
            if (userDoc.exists()) {
              const data = userDoc.data();
              // Merge existing permissions or give backwards-compatible access
              const userPerms = data.permissions || {
                modules: {
                  dashboard: true,
                  purchases: true,
                  processing: true,
                  inventory: true,
                  catalog: true,
                  suppliers: true
                },
                financials: false, // By default, existing users don't see financials
                admin: false
              };
              setPermissions(userPerms);
              setIsAllowed(true);
            } else {
              setPermissions(defaultPermissions);
              setIsAllowed(false);
              setError("Your account is pending admin approval.");
            }
          } catch (err) {
            console.error("Error fetching permissions:", err);
            setPermissions(defaultPermissions);
            setIsAllowed(false);
            setError("Error verifying permissions.");
          }
          setLoading(false);
        }
      } else {
        setPermissions(defaultPermissions);
        setIsAllowed(false);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const value = {
    currentUser,
    permissions,
    isAllowed,
    loading,
    error,
    isAdminUser: currentUser?.email === 'info@indiannaturalhair.com' || permissions?.admin === true
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
