import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';
import { auth } from '../services/firebase';

export default function ProtectedRoute({ children, requiredModule }) {
  const { currentUser, isAllowed, loading, error, permissions } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Access Denied</h2>
          <p className="text-stone-500 mb-6">{error || "You do not have access to this system."}</p>
          <button
            onClick={() => auth.signOut()}
            className="w-full py-2 px-4 border border-stone-300 rounded-xl shadow-sm text-sm font-medium text-stone-700 bg-white hover:bg-stone-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }
  
  if (requiredModule && !permissions.modules[requiredModule]) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-bold text-stone-900 mb-2">Module Restricted</h2>
          <p className="text-stone-500 mb-6">You don't have permission to view the {requiredModule} module. Please contact an admin.</p>
          <button
            onClick={() => window.history.back()}
            className="py-2 px-6 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return children;
}
