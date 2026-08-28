import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Scissors, List, Users, PackageOpen, Settings, LogOut, CheckCircle2, GitBranch } from 'lucide-react';
import { auth } from './services/firebase';

import Dashboard from './pages/Dashboard';
import Purchases from './pages/Purchases';
import Inventory from './pages/Inventory';
import Suppliers from './pages/Suppliers';
import ProcessingWizard from './pages/ProcessingWizard';
import Login from './pages/Login';
import AdminSettings from './pages/AdminSettings';
import Approvals from './pages/Approvals';
import Catalog from './pages/Catalog';
import TraceViewer from './pages/TraceViewer';
import Traceability from './pages/Traceability';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';

function Sidebar() {
  const location = useLocation();
  const { permissions, isAdminUser } = useAuth();
  
  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard', module: 'dashboard' },
    { path: '/purchases', icon: PackageOpen, label: 'Purchases', module: 'purchases' },
    { path: '/processing', icon: Scissors, label: 'Processing', module: 'processing' },
    { path: '/inventory', icon: List, label: 'Inventory', module: 'inventory' },
    { path: '/catalog', icon: List, label: 'Catalog', module: 'catalog' },
    { path: '/suppliers', icon: Users, label: 'Suppliers', module: 'suppliers' },
    { path: '/traceability', icon: GitBranch, label: 'Traceability', module: 'inventory' },
  ];

  if (isAdminUser) {
    // Insert Approvals after Processing (index 3)
    const processingIndex = navItems.findIndex(item => item.module === 'processing');
    if (processingIndex !== -1) {
      navItems.splice(processingIndex + 1, 0, { path: '/approvals', icon: CheckCircle2, label: 'Approvals', module: null });
    } else {
      navItems.push({ path: '/approvals', icon: CheckCircle2, label: 'Approvals', module: null });
    }
    
    navItems.push({ path: '/settings', icon: Settings, label: 'Settings', module: null });
  }

  // Filter items by permission
  const allowedNavItems = navItems.filter(item => item.module === null || permissions?.modules?.[item.module]);

  return (
    <div className="w-64 h-screen bg-stone-900 text-stone-300 flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-stone-800">
        <h1 className="text-xl font-bold text-white tracking-wider">INH Inventory</h1>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        {allowedNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-amber-500/10 text-amber-500' 
                  : 'hover:bg-stone-800 hover:text-white'
              }`}
            >
              <Icon size={20} className={isActive ? 'text-amber-500' : ''} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-stone-800">
        <button 
          onClick={() => auth.signOut()}
          className="flex items-center space-x-3 px-4 py-3 w-full rounded-xl hover:bg-stone-800 hover:text-red-400 transition-all duration-200"
        >
          <LogOut size={20} />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}

function Layout({ children }) {
  return (
    <div className="flex bg-stone-50 min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute requiredModule="dashboard">
              <Layout><Dashboard /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/purchases" element={
            <ProtectedRoute requiredModule="purchases">
              <Layout><Purchases /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/processing" element={
            <ProtectedRoute requiredModule="processing">
              <Layout><ProcessingWizard /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/inventory" element={
            <ProtectedRoute requiredModule="inventory">
              <Layout><Inventory /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/suppliers" element={
            <ProtectedRoute requiredModule="suppliers">
              <Layout><Suppliers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/catalog" element={
            <ProtectedRoute requiredModule="catalog">
              <Layout><Catalog /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/approvals" element={
            <ProtectedRoute>
              <Layout><Approvals /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/settings" element={
            <ProtectedRoute>
              <Layout><AdminSettings /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/traceability" element={
            <ProtectedRoute requiredModule="inventory">
              <Layout><Traceability /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/trace-viewer" element={
            <ProtectedRoute requiredModule="inventory">
              <TraceViewer />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
