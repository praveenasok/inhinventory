import React, { useState, useEffect } from 'react';
import { getCollection, addDocument, setDocument, updateDocument, deleteDocument, seedMockData } from '../services/db';
import { db, auth } from '../services/firebase';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { Shield, UserPlus, Trash2, Mail, CheckCircle2, LayoutDashboard, PackageOpen, Scissors, List, Users, DollarSign, Database, Tag, Calculator, IndianRupee, Building2 } from 'lucide-react';
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

  // Standard Rate Lists State
  const [standardRateLists, setStandardRateLists] = useState([]);
  const [newRateListName, setNewRateListName] = useState('');
  const [editingRateListId, setEditingRateListId] = useState(null);
  
  const generateDefaultRates = () => {
    const rates = {};
    for (let i = 4; i <= 50; i++) {
      rates[i] = 0;
    }
    return rates;
  };
  const [newRateListRates, setNewRateListRates] = useState(generateDefaultRates());

  // Workrooms State
  const [workrooms, setWorkrooms] = useState([]);
  const [newWorkroom, setNewWorkroom] = useState({ name: '', address: '', incharge: '', phone: '', code: '' });
  const [editingWorkroomId, setEditingWorkroomId] = useState(null);

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

    const unsubscribeStandardRates = onSnapshot(collection(db, 'standard_rates'), (snapshot) => {
      const ratesData = [];
      snapshot.forEach((doc) => {
        ratesData.push({ id: doc.id, ...doc.data() });
      });
      setStandardRateLists(ratesData);
    }, (err) => {
      console.error("Error fetching standard rates:", err);
    });

    const unsubscribeWorkrooms = onSnapshot(collection(db, 'workrooms'), (snapshot) => {
      const workroomsData = [];
      snapshot.forEach((doc) => {
        workroomsData.push({ id: doc.id, ...doc.data() });
      });
      setWorkrooms(workroomsData);
    }, (err) => {
      console.error("Error fetching workrooms:", err);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeMultipliers();
      unsubscribeStandardRates();
      unsubscribeWorkrooms();
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

  const handleAddStandardRateList = async (e) => {
    e.preventDefault();
    if (!newRateListName) return;
    
    try {
      if (editingRateListId) {
        await updateDocument('standard_rates', editingRateListId, {
          name: newRateListName,
          rates: newRateListRates,
          updatedAt: new Date()
        });
        setSuccess(`Standard rate list "${newRateListName}" updated successfully`);
      } else {
        await addDocument('standard_rates', {
          name: newRateListName,
          rates: newRateListRates,
          createdAt: new Date()
        });
        setSuccess(`Standard rate list "${newRateListName}" added successfully`);
      }
      setNewRateListName('');
      setNewRateListRates(generateDefaultRates());
      setEditingRateListId(null);
    } catch (err) {
      console.error("Error saving standard rate list:", err);
      setError("Failed to save standard rate list");
    }
  };

  const handleEditStandardRateList = (rateList) => {
    setEditingRateListId(rateList.id);
    setNewRateListName(rateList.name);
    // Fill missing rates with 0 just in case
    const filledRates = generateDefaultRates();
    Object.keys(rateList.rates || {}).forEach(k => {
      filledRates[k] = rateList.rates[k];
    });
    setNewRateListRates(filledRates);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleDeleteStandardRateList = async (listId, listName) => {
    if (!window.confirm(`Are you sure you want to delete the standard rate list "${listName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'standard_rates', listId));
      setSuccess(`Rate list "${listName}" deleted`);
    } catch (err) {
      console.error("Error deleting rate list:", err);
      setError("Failed to delete rate list");
    }
  };

  const handleRateChange = (length, val) => {
    setNewRateListRates(prev => ({
      ...prev,
      [length]: Number(val) || 0
    }));
  };

  const handleAddWorkroom = async (e) => {
    e.preventDefault();
    if (!newWorkroom.name || !newWorkroom.code) return;
    
    try {
      if (editingWorkroomId) {
        await updateDocument('workrooms', editingWorkroomId, {
          ...newWorkroom,
          updatedAt: new Date()
        });
        setSuccess(`Workroom "${newWorkroom.name}" updated successfully`);
      } else {
        await addDocument('workrooms', {
          ...newWorkroom,
          createdAt: new Date()
        });
        setSuccess(`Workroom "${newWorkroom.name}" added successfully`);
      }
      setNewWorkroom({ name: '', address: '', incharge: '', phone: '', code: '' });
      setEditingWorkroomId(null);
    } catch (err) {
      console.error("Error saving workroom:", err);
      setError("Failed to save workroom");
    }
  };

  const handleEditWorkroom = (workroom) => {
    setEditingWorkroomId(workroom.id);
    setNewWorkroom({
      name: workroom.name || '',
      address: workroom.address || '',
      incharge: workroom.incharge || '',
      phone: workroom.phone || '',
      code: workroom.code || ''
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleDeleteWorkroom = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the workroom "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'workrooms', id));
      setSuccess(`Workroom "${name}" deleted`);
    } catch (err) {
      console.error("Error deleting workroom:", err);
      setError("Failed to delete workroom");
    }
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
        <div className="ml-auto flex gap-3">
          <button 
            onClick={async () => {
              setLoading(true);
              try {
                await seedMockData();
                setSuccess("Mock data seeded successfully!");
              } catch (e) {
                setError("Failed to seed mock data.");
              }
              setLoading(false);
            }}
            className="flex items-center space-x-2 bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-stone-800 shadow-sm transition-all"
          >
            <Database className="w-4 h-4" />
            <span>Seed Mock Data</span>
          </button>
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

      {/* Standard Rate Lists Section */}
      <div className="flex items-center gap-3 mb-8 mt-12">
        <div className="w-12 h-12 bg-stone-900 rounded-xl flex items-center justify-center">
          <IndianRupee className="w-6 h-6 text-amber-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Standard Rate Lists</h2>
          <p className="text-stone-500">Manage standard market rates for yield comparison</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        <div className="lg:col-span-12">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <h3 className="text-lg font-semibold text-stone-900">Available Rate Lists</h3>
              <span className="bg-stone-100 text-stone-600 py-1 px-3 rounded-full text-xs font-semibold">
                {standardRateLists.length} Lists
              </span>
            </div>
            
            {standardRateLists.length === 0 ? (
              <div className="p-12 text-center text-stone-500">
                No standard rate lists created yet. Add one below.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200">
                  <thead className="bg-stone-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">List Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Key Rates (Preview)</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-stone-200">
                    {standardRateLists.map((list) => (
                      <tr key={list.id}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-stone-900">{list.name}</td>
                        <td className="px-6 py-4 text-sm text-stone-500">
                          10": ₹{list.rates[10]}, 20": ₹{list.rates[20]}, 30": ₹{list.rates[30]}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleEditStandardRateList(list)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            Edit / View
                          </button>
                          <button
                            onClick={() => handleDeleteStandardRateList(list.id, list.name)}
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
                <IndianRupee className="w-5 h-5 text-amber-500" />
                {editingRateListId ? 'Edit / View Rate List' : 'Create New Rate List'}
              </h3>
              {editingRateListId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRateListId(null);
                    setNewRateListName('');
                    setNewRateListRates(generateDefaultRates());
                  }}
                  className="text-sm text-stone-500 hover:text-stone-700"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            
            <form onSubmit={handleAddStandardRateList} className="space-y-6">
              <div className="max-w-md">
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Rate List Name
                </label>
                <input
                  type="text"
                  required
                  value={newRateListName}
                  onChange={(e) => setNewRateListName(e.target.value)}
                  className="block w-full px-3 py-2 border border-stone-300 rounded-md shadow-sm focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                  placeholder="e.g. Q3 Market Rates"
                />
              </div>

              <div>
                <h4 className="text-sm font-medium text-stone-700 mb-3">Rates by Length (4" to 50")</h4>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3 max-h-96 overflow-y-auto p-2 border border-stone-100 rounded-lg bg-stone-50/50">
                  {Object.keys(newRateListRates).map(length => (
                    <div key={length} className="flex flex-col">
                      <label className="text-[10px] font-medium text-stone-500 mb-1 text-center">{length}"</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={newRateListRates[length]}
                        onChange={(e) => handleRateChange(length, e.target.value)}
                        className="block w-full px-2 py-1 text-center text-sm border border-stone-300 rounded-md focus:ring-stone-500 focus:border-stone-500"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-500 mt-2">Set the standard price per kg for each length.</p>
              </div>

              <div className="flex justify-end pt-4 border-t border-stone-100">
                <button
                  type="submit"
                  disabled={!newRateListName}
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm flex items-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  {editingRateListId ? 'Update Rate List' : 'Save Rate List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Workrooms Section */}
      <div className="flex items-center gap-3 mb-8 mt-12">
        <div className="w-12 h-12 bg-stone-900 rounded-xl flex items-center justify-center">
          <Building2 className="w-6 h-6 text-amber-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Workrooms</h2>
          <p className="text-stone-500">Manage physical locations for inventory processing</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        <div className="lg:col-span-12">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <h3 className="text-lg font-semibold text-stone-900">Available Workrooms</h3>
              <span className="bg-stone-100 text-stone-600 py-1 px-3 rounded-full text-xs font-semibold">
                {workrooms.length} Workrooms
              </span>
            </div>
            
            {workrooms.length === 0 ? (
              <div className="p-12 text-center text-stone-500">
                No workrooms created yet. Add one below.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 overflow-x-auto">
                <table className="min-w-full divide-y divide-stone-200">
                  <thead className="bg-stone-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Name (Code)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">Address</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">In-charge / Phone</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-stone-200">
                    {workrooms.map((wr) => (
                      <tr key={wr.id}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-stone-900">{wr.name} ({wr.code})</td>
                        <td className="px-6 py-4 text-sm text-stone-500">{wr.address}</td>
                        <td className="px-6 py-4 text-sm text-stone-500">
                          {wr.incharge} <br/> <span className="text-xs text-stone-400">{wr.phone}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleEditWorkroom(wr)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteWorkroom(wr.id, wr.name)}
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
                <Building2 className="w-5 h-5 text-amber-500" />
                {editingWorkroomId ? 'Edit Workroom' : 'Create New Workroom'}
              </h3>
              {editingWorkroomId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingWorkroomId(null);
                    setNewWorkroom({ name: '', address: '', incharge: '', phone: '', code: '' });
                  }}
                  className="text-sm text-stone-500 hover:text-stone-700"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            
            <form onSubmit={handleAddWorkroom} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Workroom Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newWorkroom.name}
                    onChange={(e) => setNewWorkroom({...newWorkroom, name: e.target.value})}
                    className="block w-full px-3 py-2 border border-stone-300 rounded-md shadow-sm focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                    placeholder="e.g. Main Factory"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    2-Digit Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={newWorkroom.code}
                    onChange={(e) => setNewWorkroom({...newWorkroom, code: e.target.value.toUpperCase()})}
                    className="block w-full px-3 py-2 border border-stone-300 rounded-md shadow-sm focus:ring-stone-500 focus:border-stone-500 sm:text-sm uppercase"
                    placeholder="e.g. MF"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Address
                  </label>
                  <textarea
                    rows={2}
                    value={newWorkroom.address}
                    onChange={(e) => setNewWorkroom({...newWorkroom, address: e.target.value})}
                    className="block w-full px-3 py-2 border border-stone-300 rounded-md shadow-sm focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                    placeholder="Full physical address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    In-charge Name
                  </label>
                  <input
                    type="text"
                    value={newWorkroom.incharge}
                    onChange={(e) => setNewWorkroom({...newWorkroom, incharge: e.target.value})}
                    className="block w-full px-3 py-2 border border-stone-300 rounded-md shadow-sm focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                    placeholder="Manager Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={newWorkroom.phone}
                    onChange={(e) => setNewWorkroom({...newWorkroom, phone: e.target.value})}
                    className="block w-full px-3 py-2 border border-stone-300 rounded-md shadow-sm focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                    placeholder="+91..."
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-stone-100">
                <button
                  type="submit"
                  disabled={!newWorkroom.name || !newWorkroom.code}
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm flex items-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  {editingWorkroomId ? 'Update Workroom' : 'Save Workroom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
