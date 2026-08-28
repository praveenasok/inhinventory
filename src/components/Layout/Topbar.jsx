import React from 'react';
import { Bell, User } from 'lucide-react';

export default function Topbar() {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
      <div className="flex items-center">
        <h2 className="text-xl font-semibold text-gray-800">Hair Extension Unit</h2>
      </div>
      <div className="flex items-center space-x-4">
        <button className="p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full">
          <span className="sr-only">View notifications</span>
          <Bell className="w-6 h-6" />
        </button>
        <div className="relative">
          <button className="flex items-center space-x-2 text-sm focus:outline-none">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <User className="w-5 h-5" />
            </div>
            <span className="hidden md:block font-medium text-gray-700">Admin</span>
          </button>
        </div>
      </div>
    </header>
  );
}
