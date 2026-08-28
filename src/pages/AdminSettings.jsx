import React, { useState, useEffect } from 'react';
import { getCollection, addDocument, setDocument, deleteDocument } from '../services/db';
import { db, auth } from '../services/firebase';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { Shield, UserPlus, Trash2, Mail, CheckCircle2, LayoutDashboard, PackageOpen, Scissors, List, Users, DollarSign, Database, Tag, Calculator } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminSettings() {
  const [users, setUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  
  // Granular permissions state
  const [newPerms, setNewPerms] = useState({
    modules: {
      dashboard: true,
      purchases: true,
      processing: true,
      inventory: true,
      catalog: true,
      suppliers: true
    },
    financials: false,
    admin: false
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Multiplier Tables State
  const [multiplierTables, setMultiplierTables] = useState([]);
  const [newTableName, setNewTableName] = useState('');
  const [editingTableId, setEditingTableId] = useState(null);
  
  // Generate default factors (4 to 50) initialized to 1.0
  const generateDefaultFactors = () => {
    const factors = {};
    for (let i = 4; i <= 50; i++) {
      factors[i] = 1.0;
    }
    return factors;
  };
  const [newTableFactors, setNewTableFactors] = useState(generateDefaultFactors());

  const { isAdminUser } = useAuth();

  useEffect(() => {
    if (!isAdminUser) {
      setLoading(false);
      return;
    }

    const unsubscribeUsers = onSnapshot(collection(db, 'allowed_users'), (snapshot) => {
      const usersData = [];
      snapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
    }, (err) => {
      console.error("Error fetching allowed users:", err);
      setError("Failed to load users");
    });

    const unsubscribeMultipliers = onSnapshot(collection(db, 'multiplier_tables'), (snapshot) => {
      const tablesData = [];
      snapshot.forEach((doc) => {
        tablesData.push({ id: doc.id, ...doc.data() });
      });
      setMultiplierTables(tablesData);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching multiplier tables:", err);
      setLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeMultipliers();
    };
  }, [isAdminUser]);

  const handleToggleModule = (moduleKey) => {
    setNewPerms(prev => ({
      ...prev,
      modules: {
        ...prev.modules,
        [moduleKey]: !prev.modules[moduleKey]
      }
    }));
  };

  const handleToggleFinancials = () => {
    setNewPerms(prev => ({
      ...prev,
      financials: !prev.financials
    }));
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!newEmail) return;

    try {
      await setDocument('allowed_users', newEmail.toLowerCase(), {
        email: newEmail.toLowerCase(),
        permissions: newPerms,
        addedAt: new Date()
      });
      setSuccess(`User ${newEmail} added successfully`);
      setNewEmail('');
      // Reset form
      setNewPerms({
        modules: {
          dashboard: true,
          purchases: true,
          processing: true,
          inventory: true,
          catalog: true,
          suppliers: true
        },
        financials: false,
        admin: false
      });
    } catch (err) {
      console.error("Error adding user:", err);
      setError("Failed to add user. Ensure you have admin privileges.");
    }
  };

  const handleRemoveUser = async (emailId) => {
    if (!window.confirm(`Are you sure you want to remove access for ${emailId}?`)) return;
    
    try {
      await deleteDoc(doc(db, 'allowed_users', emailId));
      setSuccess(`Access removed for ${emailId}`);
    } catch (err) {
      console.error("Error removing user:", err);
      setError("Failed to remove user");
    }
  };

  const handleAddMultiplierTable = async (e) => {
    e.preventDefault();
    if (!newTableName) return;
    
    try {
      if (editingTableId) {
        await updateDocument('multiplier_tables', editingTableId, {
          name: newTableName,
          factors: newTableFactors,
          updatedAt: new Date()
        });
        setSuccess(`Multiplier table "${newTableName}" updated successfully`);
      } else {
        await addDocument('multiplier_tables', {
          name: newTableName,
          factors: newTableFactors,
          createdAt: new Date()
        });
        setSuccess(`Multiplier table "${newTableName}" added successfully`);
      }
      setNewTableName('');
      setNewTableFactors(generateDefaultFactors());
      setEditingTableId(null);
    } catch (err) {
      console.error("Error saving multiplier table:", err);
      setError("Failed to save multiplier table");
    }
  };

  const handleEditMultiplierTable = (table) => {
    setEditingTableId(table.id);
    setNewTableName(table.name);
    // Fill missing factors with 1.0 just in case
    const filledFactors = generateDefaultFactors();
    Object.keys(table.factors || {}).forEach(k => {
      filledFactors[k] = table.factors[k];
    });
    setNewTableFactors(filledFactors);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleDeleteMultiplierTable = async (tableId, tableName) => {
    if (!window.confirm(`Are you sure you want to delete the table "${tableName}"? Lots using this table might be affected if they haven't been processed yet.`)) return;
    try {
      await deleteDoc(doc(db, 'multiplier_tables', tableId));
      setSuccess(`Table "${tableName}" deleted`);
    } catch (err) {
      console.error("Error deleting table:", err);
      setError("Failed to delete table");
    }
  };

  const handleFactorChange = (length, val) => {
    setNewTableFactors(prev => ({
      ...prev,
      [length]: Number(val) || 0
    }));
  };

  if (!isAdminUser) {
    return (
      <div className="p-8 text-center max-w-lg mx-auto">
        <Shield className="w-12 h-12 text-stone-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-stone-800">Admin Access Required</h2>
        <p className="text-stone-500 mt-2">Only info@indiannaturalhair.com can access the admin settings panel.</p>
      </div>
    );
  }

  const moduleConfig = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'purchases', label: 'Purchases', icon: PackageOpen },
    { key: 'processing', label: 'Processing', icon: Scissors },
    { key: 'inventory', label: 'Inventory', icon: List },
    { key: 'catalog', label: 'SKU Catalog', icon: List },
    { key: 'suppliers', label: 'Suppliers', icon: Users },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-stone-900 rounded-xl flex items-center justify-center">
          <Shield className="w-6 h-6 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Access Management</h1>
          <p className="text-stone-500">Manage granular permissions for INH Inventory System</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3">
          <Shield className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-xl border border-green-100 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Users Section */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-6 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-500" />
              Add or Update User Access
            </h3>
            <form onSubmit={handleAddUser} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-stone-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-all"
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100">
                <h4 className="text-sm font-semibold text-stone-900 mb-3">Module Access</h4>
                <div className="grid grid-cols-2 gap-3">
                  {moduleConfig.map(({ key, label, icon: Icon }) => (
                    <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${newPerms.modules[key] ? 'border-stone-900 bg-stone-50' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>
                      <input
                        type="checkbox"
                        checked={newPerms.modules[key]}
                        onChange={() => handleToggleModule(key)}
                        className="w-4 h-4 text-stone-900 rounded border-stone-300 focus:ring-stone-900"
                      />
                      <Icon className={`w-4 h-4 ${newPerms.modules[key] ? 'text-stone-900' : 'text-stone-400'}`} />
                      <span className={`text-sm font-medium ${newPerms.modules[key] ? 'text-stone-900' : 'text-stone-500'}`}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100">
                <h4 className="text-sm font-semibold text-stone-900 mb-3">Financial Privacy</h4>
                <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${newPerms.financials ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>
                  <input
                    type="checkbox"
                    checked={newPerms.financials}
                    onChange={handleToggleFinancials}
                    className="mt-1 w-4 h-4 text-amber-600 rounded border-stone-300 focus:ring-amber-500"
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className={`w-4 h-4 ${newPerms.financials ? 'text-amber-600' : 'text-stone-400'}`} />
                      <span className={`text-sm font-semibold ${newPerms.financials ? 'text-amber-900' : 'text-stone-700'}`}>Show Financial Data</span>
                    </div>
                    <p className={`text-xs ${newPerms.financials ? 'text-amber-700' : 'text-stone-500'}`}>If disabled, this user will not see pricing, costs, or return calculations across any module.</p>
                  </div>
                </label>
              </div>

              <div className="pt-4 border-t border-stone-100">
                <h4 className="text-sm font-semibold text-stone-900 mb-3">Admin Privileges</h4>
                <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${newPerms.admin ? 'border-purple-500 bg-purple-50' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>
                  <input
                    type="checkbox"
                    checked={newPerms.admin}
                    onChange={() => setNewPerms(prev => ({ ...prev, admin: !prev.admin }))}
                    className="mt-1 w-4 h-4 text-purple-600 rounded border-stone-300 focus:ring-purple-500"
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className={`w-4 h-4 ${newPerms.admin ? 'text-purple-600' : 'text-stone-400'}`} />
                      <span className={`text-sm font-semibold ${newPerms.admin ? 'text-purple-900' : 'text-stone-700'}`}>System Administrator</span>
                    </div>
                    <p className={`text-xs ${newPerms.admin ? 'text-purple-700' : 'text-stone-500'}`}>If enabled, this user will have full access to this Access Management settings panel.</p>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm"
              >
                Save Permissions
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <h3 className="text-lg font-semibold text-stone-900">Allowed Users</h3>
              <span className="bg-stone-100 text-stone-600 py-1 px-3 rounded-full text-xs font-semibold">
                {users.length} Users
              </span>
            </div>
            
            {loading ? (
              <div className="p-12 text-center text-stone-500">Loading...</div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center text-stone-500">
                No users have been granted access yet.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {users.map((user) => {
                  const perms = user.permissions || { modules: {}, financials: false };
                  const activeModulesCount = Object.values(perms.modules).filter(Boolean).length;
                  
                  return (
                    <div key={user.id} className="p-5 sm:px-6 hover:bg-stone-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center border border-stone-200 shrink-0">
                          <span className="text-stone-600 font-bold text-sm uppercase">
                            {user.email.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-stone-900 mb-1">{user.email}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-600 border border-stone-200">
                              {activeModulesCount} Modules Active
                            </span>
                            {perms.financials ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <DollarSign className="w-3 h-3" /> Financials
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-500 border border-stone-200">
                                No Financials
                              </span>
                            )}
                            {perms.admin && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                <Shield className="w-3 h-3" /> Admin
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleRemoveUser(user.id)}
                        className="self-end sm:self-auto p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 shrink-0"
                        title="Revoke access"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Multiplier Tables Section */}
      <div className="flex items-center gap-3 mb-8 mt-12">
        <div className="w-12 h-12 bg-stone-900 rounded-xl flex items-center justify-center">
          <Calculator className="w-6 h-6 text-amber-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Cost Multiplier Tables</h2>
          <p className="text-stone-500">Manage length-based multiplication factors for joint cost allocation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <h3 className="text-lg font-semibold text-stone-900">Available Tables</h3>
              <span className="bg-stone-100 text-stone-600 py-1 px-3 rounded-full text-xs font-semibold">
                {multiplierTables.length} Tables
              </span>
            </div>
            
            {multiplierTables.length === 0 ? (
              <div className="p-12 text-center text-stone-500">
                No multiplier tables created yet. Add one below.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200">
                  <thead className="bg-stone-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Table Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Key Multipliers (Preview)</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-stone-200">
                    {multiplierTables.map((table) => (
                      <tr key={table.id}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-stone-900">{table.name}</td>
                        <td className="px-6 py-4 text-sm text-stone-500">
                          {/* Preview a few key lengths like 10, 20, 30 */}
                          10": {table.factors[10]}, 20": {table.factors[20]}, 30": {table.factors[30]}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleEditMultiplierTable(table)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            Edit / View
                          </button>
                          <button
                            onClick={() => handleDeleteMultiplierTable(table.id, table.name)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-12 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-amber-500" />
                {editingTableId ? 'Edit / View Multiplier Table' : 'Create New Multiplier Table'}
              </h3>
              {editingTableId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTableId(null);
                    setNewTableName('');
                    setNewTableFactors(generateDefaultFactors());
                  }}
                  className="text-sm text-stone-500 hover:text-stone-700"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            
            <form onSubmit={handleAddMultiplierTable} className="space-y-6">
              <div className="max-w-md">
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Table Name
                </label>
                <input
                  type="text"
                  required
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="block w-full px-3 py-2 border border-stone-300 rounded-md shadow-sm focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                  placeholder="e.g. Standard Remy Single Drawn"
                />
              </div>

              <div>
                <h4 className="text-sm font-medium text-stone-700 mb-3">Multiplication Factors (4" to 50")</h4>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3 max-h-96 overflow-y-auto p-2 border border-stone-100 rounded-lg bg-stone-50/50">
                  {Object.keys(newTableFactors).map(length => (
                    <div key={length} className="flex flex-col">
                      <label className="text-[10px] font-medium text-stone-500 mb-1 text-center">{length}"</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={newTableFactors[length]}
                        onChange={(e) => handleFactorChange(length, e.target.value)}
                        className="block w-full px-2 py-1 text-center text-sm border border-stone-300 rounded-md focus:ring-stone-500 focus:border-stone-500"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-500 mt-2">Set the relative multiplication factor for each length. For example, if 10" is 1.0 and 20" is twice as valuable, set 20" to 2.0.</p>
              </div>

              <div className="flex justify-end pt-4 border-t border-stone-100">
                <button
                  type="submit"
                  disabled={!newTableName}
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm flex items-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  {editingTableId ? 'Update Table' : 'Save Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
