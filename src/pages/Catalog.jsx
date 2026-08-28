import React, { useState, useEffect } from 'react';
import { getCollection, addDocument, deleteDocument, updateDocument, seedRawMaterials } from '../services/db';
import { Database, Tag, Trash2, Shield, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Catalog() {
  const { permissions, isAdminUser } = useAuth();
  
  const [materials, setMaterials] = useState([]);
  const [newMatName, setNewMatName] = useState('');
  const [newMatFormat, setNewMatFormat] = useState('weight-based');
  const [newMatLaborCost, setNewMatLaborCost] = useState('');
  const [matsLoading, setMatsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editMatName, setEditMatName] = useState('');
  const [editMatFormat, setEditMatFormat] = useState('weight-based');
  const [editMatLaborCost, setEditMatLaborCost] = useState('');

  // Check if they have access
  const hasAccess = isAdminUser || permissions?.modules?.catalog;

  useEffect(() => {
    if (!hasAccess) return;
    fetchMaterials();
  }, [hasAccess]);

  const fetchMaterials = async () => {
    setMatsLoading(true);
    try {
      const data = await getCollection('raw_materials');
      if (data.length === 0) {
        const newData = await seedRawMaterials();
        setMaterials(newData.sort((a,b) => a.name.localeCompare(b.name)));
      } else {
        setMaterials(data.sort((a,b) => a.name.localeCompare(b.name)));
      }
    } catch (e) {
      console.error(e);
      setError("Failed to fetch materials.");
    } finally {
      setMatsLoading(false);
    }
  };

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!newMatName.trim()) return;
    try {
      await addDocument('raw_materials', {
        name: newMatName.trim(),
        format: newMatFormat,
        defaultLaborCost: Number(newMatLaborCost || 0)
      });
      setNewMatName('');
      setNewMatLaborCost('');
      setSuccess(`Material ${newMatName} added.`);
      setTimeout(() => setSuccess(''), 3000);
      fetchMaterials();
    } catch (e) {
      setError("Failed to add material.");
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleDeleteMaterial = async (id, name) => {
    if (!window.confirm(`Delete ${name} from catalog?`)) return;
    try {
      await deleteDocument('raw_materials', id);
      setSuccess(`Deleted ${name}.`);
      setTimeout(() => setSuccess(''), 3000);
      fetchMaterials();
    } catch (e) {
      setError("Failed to delete material.");
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleEditClick = (mat) => {
    setEditingId(mat.id);
    setEditMatName(mat.name);
    setEditMatFormat(mat.format || 'weight-based');
    setEditMatLaborCost(mat.defaultLaborCost || 0);
  };

  const handleUpdateMaterial = async (e) => {
    e.preventDefault();
    if (!editMatName.trim()) return;
    try {
      await updateDocument('raw_materials', editingId, {
        name: editMatName.trim(),
        format: editMatFormat,
        defaultLaborCost: Number(editMatLaborCost || 0)
      });
      setEditingId(null);
      setSuccess(`Material updated.`);
      setTimeout(() => setSuccess(''), 3000);
      fetchMaterials();
    } catch (e) {
      setError("Failed to update material.");
      setTimeout(() => setError(''), 3000);
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-8 text-center max-w-lg mx-auto">
        <Shield className="w-12 h-12 text-stone-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-stone-800">Access Restricted</h2>
        <p className="text-stone-500 mt-2">You do not have permission to view the Catalog.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-stone-900 rounded-xl flex items-center justify-center">
          <Database className="w-6 h-6 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Raw Materials Catalog</h1>
          <p className="text-stone-500">Manage all purchasable raw materials</p>
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
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
            <h3 className="text-lg font-semibold text-stone-900 mb-6 flex items-center gap-2">
              <Tag className="w-5 h-5 text-amber-500" />
              Add Raw Material
            </h3>
            <form onSubmit={handleAddMaterial} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Material Name (e.g. Goli, Curly)
                </label>
                <input
                  type="text"
                  required
                  value={newMatName}
                  onChange={(e) => setNewMatName(e.target.value)}
                  className="block w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-all"
                  placeholder="Material Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Format / Pricing Method
                </label>
                <select
                  value={newMatFormat}
                  onChange={(e) => setNewMatFormat(e.target.value)}
                  className="block w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-all"
                >
                  <option value="weight-based">Weight-Based (Purchased by total Kg)</option>
                  <option value="length-based">Length-Based (Purchased per inch)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Default Labor Cost (₹ / Kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newMatLaborCost}
                  onChange={(e) => setNewMatLaborCost(e.target.value)}
                  className="block w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-all"
                  placeholder="0.00"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-stone-900 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-stone-800 focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 transition-all flex items-center justify-center gap-2"
              >
                Add Material
              </button>
            </form>
          </div>
        </div>
        
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-stone-400" />
                Raw Materials Database
              </h3>
            </div>
            
            {matsLoading ? (
              <div className="p-12 text-center text-stone-500">Loading...</div>
            ) : materials.length === 0 ? (
              <div className="p-12 text-center text-stone-500">
                No materials in database.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-stone-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase">Format</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase">Labor Cost (₹)</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-stone-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {materials.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-6 py-4 text-center text-stone-500">No materials found.</td>
                    </tr>
                  ) : (
                    materials.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-50 transition-colors">
                        {editingId === item.id ? (
                          <td colSpan="4" className="px-6 py-4">
                            <form onSubmit={handleUpdateMaterial} className="flex gap-4 items-center">
                              <input 
                                type="text"
                                required
                                value={editMatName}
                                onChange={(e) => setEditMatName(e.target.value)}
                                className="flex-1 rounded-lg border-stone-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm p-2 border" 
                              />
                              <select 
                                value={editMatFormat}
                                onChange={(e) => setEditMatFormat(e.target.value)}
                                className="rounded-lg border-stone-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm p-2 border bg-white"
                              >
                                <option value="weight-based">Bulk Weight Based (Single Rate)</option>
                                <option value="length-based">Length Based (Size-specific Rates)</option>
                              </select>
                              <input 
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Labor ₹"
                                value={editMatLaborCost}
                                onChange={(e) => setEditMatLaborCost(e.target.value)}
                                className="w-24 rounded-lg border-stone-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm p-2 border" 
                              />
                              <div className="flex gap-2">
                                <button type="submit" className="text-sm px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700">Save</button>
                                <button type="button" onClick={() => setEditingId(null)} className="text-sm px-3 py-1 bg-stone-200 text-stone-700 rounded hover:bg-stone-300">Cancel</button>
                              </div>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-stone-900">
                              {item.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-stone-500 text-sm">
                              {item.format === 'length-based' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 font-medium">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                  </svg>
                                  Length Based
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 text-stone-700 font-medium">
                                  <Database className="w-3.5 h-3.5" />
                                  Bulk Weight Based
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-stone-500 text-sm">
                              ₹{item.defaultLaborCost || 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              <button 
                                onClick={() => handleEditClick(item)}
                                className="text-blue-500 hover:text-blue-700 mr-4"
                                title="Edit Material"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDeleteMaterial(item.id, item.name)}
                                className="text-red-500 hover:text-red-700"
                                title="Delete Material"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
