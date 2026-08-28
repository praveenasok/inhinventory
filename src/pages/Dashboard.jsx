import React from 'react';
import { NavLink } from 'react-router-dom';
import { Package, Users, ShoppingCart, RefreshCw } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex items-center space-x-4">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600">
            <Package className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total SKUs</p>
            <p className="text-2xl font-bold text-gray-900">Manage</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex items-center space-x-4">
          <div className="p-3 rounded-full bg-green-100 text-green-600">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Suppliers</p>
            <p className="text-2xl font-bold text-gray-900">Active</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex items-center space-x-4">
          <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Active Lots</p>
            <p className="text-2xl font-bold text-gray-900">Track</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex items-center space-x-4">
          <div className="p-3 rounded-full bg-purple-100 text-purple-600">
            <RefreshCw className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Processing</p>
            <p className="text-2xl font-bold text-gray-900">Wizard</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center mt-8">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Welcome to INH Inventory & Traceability System</h2>
        <p className="text-gray-500 max-w-2xl mx-auto mb-6">
          This system is designed to track raw hair materials from procurement through processing stages into fully segregated Non Remy 1x1 finished bundles. Every batch maintains strict traceability.
        </p>
        <div className="flex justify-center space-x-4">
          <NavLink to="/purchases" className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700">
            Record New Purchase
          </NavLink>
          <NavLink to="/wizard" className="px-6 py-2 bg-white text-blue-600 border border-blue-600 rounded-md font-medium hover:bg-blue-50">
            Start Processing
          </NavLink>
        </div>
      </div>
    </div>
  );
}
