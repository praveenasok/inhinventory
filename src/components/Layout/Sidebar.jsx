import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  ShoppingCart, 
  RefreshCw, 
  Archive 
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Suppliers', path: '/suppliers', icon: Users },

  { name: 'Purchases (Lots)', path: '/purchases', icon: ShoppingCart },
  { name: 'Processing Wizard', path: '/wizard', icon: RefreshCw },
  { name: 'Inventory', path: '/inventory', icon: Archive },
];

export default function Sidebar() {
  return (
    <div className="flex flex-col w-64 bg-slate-900 text-slate-300 transition-all duration-300">
      <div className="flex items-center justify-center h-16 bg-slate-950 border-b border-slate-800">
        <span className="text-xl font-bold text-white tracking-wider">INH INVENTORY</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                clsx(
                  isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white',
                  'group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors'
                )
              }
            >
              <item.icon
                className="mr-3 flex-shrink-0 h-5 w-5"
                aria-hidden="true"
              />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
