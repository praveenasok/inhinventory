import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50 text-slate-900 font-sans print:h-auto print:bg-white">
      <div className="print:hidden h-full">
        <Sidebar />
      </div>
      <div className="flex flex-col flex-1 overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Topbar />
        </div>
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6 print:overflow-visible print:p-0 print:bg-white">
          <div className="mx-auto max-w-7xl print:max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
