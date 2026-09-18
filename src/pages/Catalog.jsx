import React, { useState, useEffect } from 'react';
import { getCollection, addDocument, deleteDocument, updateDocument, seedRawMaterials, getRatioMixes } from '../services/db';
import { Database, Tag, Trash2, Shield, CheckCircle2, Package, Layers } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Catalog() {
  const { permissions, isAdminUser } = useAuth();
  
  const [activeTab, setActiveTab] = useState('raw'); // 'raw' or 'finished'

  // Common State
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Raw Materials State
  const [materials, setMaterials] = useState([]);
  const [newMatName, setNewMatName] = useState('');
  const [newMatFormat, setNewMatFormat] = useState('weight-based');
  const [newMatLaborCost, setNewMatLaborCost] = useState('');
  const [matsLoading, setMatsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editMatName, setEditMatName] = useState('');
  const [editMatFormat, setEditMatFormat] = useState('weight-based');
  const [editMatLaborCost, setEditMatLaborCost] = useState('');

  // Finished Products State
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [externalRatios, setExternalRatios] = useState([]);
  const [fpLoading, setFpLoading] = useState(false);
  
  // New Finished Product Form
  const [newFPName, setNewFPName] = useState('');
  const [newFPRatios, setNewFPRatios] = useState([]); // Array of strings (ratio names)
  const [newFPBom, setNewFPBom] = useState([{ name: '', qty: 1, price: '' }]);
  const [newFPWastage, setNewFPWastage] = useState(0);
  const [newFPLaborCost, setNewFPLaborCost] = useState(0);
  const [newFPMiscCost, setNewFPMiscCost] = useState(0);
  const [newFPRawMaterials, setNewFPRawMaterials] = useState([]);
  
  // Edit Finished Product Form
  const [editingFPId, setEditingFPId] = useState(null);
  const [editFPName, setEditFPName] = useState('');
  const [editFPRatios, setEditFPRatios] = useState([]);
  const [editFPBom, setEditFPBom] = useState([]);
  const [editFPWastage, setEditFPWastage] = useState(0);
  const [editFPLaborCost, setEditFPLaborCost] = useState(0);
  const [editFPMiscCost, setEditFPMiscCost] = useState(0);
  const [editFPRawMaterials, setEditFPRawMaterials] = useState([]);

  const [rawMaterialsList, setRawMaterialsList] = useState([]);

  // Check if they have access
  const hasAccess = isAdminUser || permissions?.modules?.catalog;

  useEffect(() => {
    if (!hasAccess) return;
    if (activeTab === 'raw') {
      fetchMaterials();
    } else {
      fetchFinishedProductsData();
    }
  }, [hasAccess, activeTab]);

  // --- RAW MATERIALS LOGIC ---
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

  // --- FINISHED PRODUCTS LOGIC ---
  const fetchFinishedProductsData = async () => {
    setFpLoading(true);
    try {
      const [fpData, ratiosData, rawMatData] = await Promise.all([
        getCollection('finished_products'),
        getRatioMixes(),
        getCollection('raw_materials')
      ]);
      setFinishedProducts(fpData.sort((a,b) => a.name.localeCompare(b.name)));
      setExternalRatios(ratiosData.sort((a,b) => a.name.localeCompare(b.name)));
      setRawMaterialsList(rawMatData.sort((a,b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.error(e);
      setError("Failed to fetch finished products data.");
    } finally {
      setFpLoading(false);
    }
  };

  const handleAddFPBomRow = () => {
    setNewFPBom([...newFPBom, { name: '', qty: 1, price: '' }]);
  };
  const handleRemoveFPBomRow = (idx) => {
    setNewFPBom(newFPBom.filter((_, i) => i !== idx));
  };
  const handleFPBomChange = (idx, field, value) => {
    const newBom = [...newFPBom];
    newBom[idx][field] = value;
    setNewFPBom(newBom);
  };

  const handleEditFPBomRow = () => {
    setEditFPBom([...editFPBom, { name: '', qty: 1, price: '' }]);
  };
  const handleRemoveEditFPBomRow = (idx) => {
    setEditFPBom(editFPBom.filter((_, i) => i !== idx));
  };
  const handleEditFPBomChange = (idx, field, value) => {
    const newBom = [...editFPBom];
    newBom[idx][field] = value;
    setEditFPBom(newBom);
  };

  const toggleRatio = (ratioName, isEditing = false) => {
    if (isEditing) {
      if (editFPRatios.includes(ratioName)) {
        setEditFPRatios(editFPRatios.filter(r => r !== ratioName));
      } else {
        setEditFPRatios([...editFPRatios, ratioName]);
      }
    } else {
      if (newFPRatios.includes(ratioName)) {
        setNewFPRatios(newFPRatios.filter(r => r !== ratioName));
      } else {
        setNewFPRatios([...newFPRatios, ratioName]);
      }
    }
  };

  const toggleRawMaterial = (matName, isEditing = false) => {
    if (isEditing) {
      if (editFPRawMaterials.includes(matName)) {
        setEditFPRawMaterials(editFPRawMaterials.filter(r => r !== matName));
      } else {
        setEditFPRawMaterials([...editFPRawMaterials, matName]);
      }
    } else {
      if (newFPRawMaterials.includes(matName)) {
        setNewFPRawMaterials(newFPRawMaterials.filter(r => r !== matName));
      } else {
        setNewFPRawMaterials([...newFPRawMaterials, matName]);
      }
    }
  };

  const handleAddFinishedProduct = async (e) => {
    e.preventDefault();
    if (!newFPName.trim()) return;
    try {
      const cleanedBom = newFPBom.filter(item => item.name.trim() !== '').map(item => ({
        name: item.name.trim(),
        qty: Number(item.qty || 1),
        price: Number(item.price || 0)
      }));

      await addDocument('finished_products', {
        name: newFPName.trim(),
        ratios: newFPRatios,
        rawMaterials: newFPRawMaterials,
        bom: cleanedBom,
        wastagePercentage: Number(newFPWastage || 0),
        laborCost: Number(newFPLaborCost || 0),
        miscCost: Number(newFPMiscCost || 0)
      });
      setNewFPName('');
      setNewFPRatios([]);
      setNewFPRawMaterials([]);
      setNewFPBom([{ name: '', qty: 1, price: '' }]);
      setNewFPWastage(0);
      setNewFPLaborCost(0);
      setNewFPMiscCost(0);
      setSuccess(`Finished Product ${newFPName} added.`);
      setTimeout(() => setSuccess(''), 3000);
      fetchFinishedProductsData();
    } catch (e) {
      setError("Failed to add finished product.");
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleDeleteFinishedProduct = async (id, name) => {
    if (!window.confirm(`Delete ${name} from catalog?`)) return;
    try {
      await deleteDocument('finished_products', id);
      setSuccess(`Deleted ${name}.`);
      setTimeout(() => setSuccess(''), 3000);
      fetchFinishedProductsData();
    } catch (e) {
      setError("Failed to delete finished product.");
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleEditFPClick = (fp) => {
    setEditingFPId(fp.id);
    setEditFPName(fp.name);
    setEditFPRatios(fp.ratios || []);
    setEditFPRawMaterials(fp.rawMaterials || []);
    setEditFPBom(fp.bom || []);
    setEditFPWastage(fp.wastagePercentage || 0);
    setEditFPLaborCost(fp.laborCost || 0);
    setEditFPMiscCost(fp.miscCost || 0);
  };

  const handleUpdateFinishedProduct = async (e) => {
    e.preventDefault();
    if (!editFPName.trim()) return;
    try {
      const cleanedBom = editFPBom.filter(item => item.name.trim() !== '').map(item => ({
        name: item.name.trim(),
        qty: Number(item.qty || 1),
        price: Number(item.price || 0)
      }));

      await updateDocument('finished_products', editingFPId, {
        name: editFPName.trim(),
        ratios: editFPRatios,
        rawMaterials: editFPRawMaterials,
        bom: cleanedBom,
        wastagePercentage: Number(editFPWastage || 0),
        laborCost: Number(editFPLaborCost || 0),
        miscCost: Number(editFPMiscCost || 0)
      });
      setEditingFPId(null);
      setSuccess(`Finished Product updated.`);
      setTimeout(() => setSuccess(''), 3000);
      fetchFinishedProductsData();
    } catch (e) {
      setError("Failed to update finished product.");
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
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-stone-900 rounded-xl flex items-center justify-center">
          <Database className="w-6 h-6 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Catalog</h1>
          <p className="text-stone-500">Manage raw materials and finished products</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-stone-100 p-1 rounded-xl max-w-fit mb-8">
        <button
          onClick={() => setActiveTab('raw')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'raw' 
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200/50' 
              : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50'
          }`}
        >
          <Tag className="w-4 h-4" />
          Raw Materials
        </button>
        <button
          onClick={() => setActiveTab('finished')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'finished' 
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200/50' 
              : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50'
          }`}
        >
          <Package className="w-4 h-4" />
          Finished Products
        </button>
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

      {activeTab === 'raw' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
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
                    {materials.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-50 transition-colors">
                        {editingId === item.id ? (
                          <td colSpan="4" className="px-6 py-4">
                            <form onSubmit={handleUpdateMaterial} className="flex gap-4 items-center">
                              <input 
                                type="text"
                                required
                                value={editMatName}
                                onChange={(e) => setEditMatName(e.target.value)}
                                className="flex-1 rounded-lg border-stone-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm p-2 border bg-white" 
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
                                className="w-24 rounded-lg border-stone-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm p-2 border bg-white" 
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
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'finished' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-in fade-in duration-300">
          <div className="xl:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
              <h3 className="text-lg font-semibold text-stone-900 mb-6 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-500" />
                Add Finished Product
              </h3>
              <form onSubmit={handleAddFinishedProduct} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newFPName}
                    onChange={(e) => setNewFPName(e.target.value)}
                    className="block w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="e.g. Lace Front Wig 200%"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Labor Cost (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newFPLaborCost}
                      onChange={(e) => setNewFPLaborCost(e.target.value)}
                      className="block w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Wastage (%)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={newFPWastage}
                      onChange={(e) => setNewFPWastage(e.target.value)}
                      className="block w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Misc Cost (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newFPMiscCost}
                      onChange={(e) => setNewFPMiscCost(e.target.value)}
                      className="block w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Raw Materials Selector */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Included Raw Materials (Inventory Types)
                  </label>
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
                    {rawMaterialsList.length === 0 ? (
                      <div className="text-sm text-stone-500 text-center py-2">No raw materials found.</div>
                    ) : (
                      rawMaterialsList.map(mat => (
                        <label key={mat.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-stone-100 rounded">
                          <input 
                            type="checkbox" 
                            checked={newFPRawMaterials.includes(mat.name)}
                            onChange={() => toggleRawMaterial(mat.name)}
                            className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-stone-700">{mat.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* External Ratios Selector */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Included Hair Ratios (from Ratio Mixer)
                  </label>
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
                    {externalRatios.length === 0 ? (
                      <div className="text-sm text-stone-500 text-center py-2">No ratios found in Ratio Mixer.</div>
                    ) : (
                      externalRatios.map(ratio => (
                        <label key={ratio.name} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-stone-100 rounded">
                          <input 
                            type="checkbox" 
                            checked={newFPRatios.includes(ratio.name)}
                            onChange={() => toggleRatio(ratio.name)}
                            className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-stone-700">{ratio.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Bill of Materials (BOM) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-stone-700">
                      Bill of Materials (BOM)
                    </label>
                    <button 
                      type="button" 
                      onClick={handleAddFPBomRow}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      + Add Item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {newFPBom.map((bom, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-stone-50 p-2 rounded-lg border border-stone-200">
                        <input 
                          type="text" 
                          placeholder="Item (e.g. Lace)" 
                          value={bom.name}
                          onChange={e => handleFPBomChange(idx, 'name', e.target.value)}
                          className="flex-1 w-full px-2 py-1.5 border border-stone-200 rounded text-sm bg-white"
                        />
                        <input 
                          type="number" 
                          min="1"
                          placeholder="Qty" 
                          value={bom.qty}
                          onChange={e => handleFPBomChange(idx, 'qty', e.target.value)}
                          className="w-16 px-2 py-1.5 border border-stone-200 rounded text-sm bg-white"
                        />
                        <input 
                          type="number" 
                          min="0"
                          step="0.01"
                          placeholder="Price ₹" 
                          value={bom.price}
                          onChange={e => handleFPBomChange(idx, 'price', e.target.value)}
                          className="w-20 px-2 py-1.5 border border-stone-200 rounded text-sm bg-white"
                        />
                        {newFPBom.length > 1 && (
                          <button type="button" onClick={() => handleRemoveFPBomRow(idx)} className="text-red-500 hover:text-red-700 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 transition-all flex items-center justify-center gap-2"
                >
                  Save Finished Product
                </button>
              </form>
            </div>
          </div>
          
          <div className="xl:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-stone-400" />
                  Finished Products Database
                </h3>
              </div>
              
              {fpLoading ? (
                <div className="p-12 text-center text-stone-500">Loading...</div>
              ) : finishedProducts.length === 0 ? (
                <div className="p-12 text-center text-stone-500">
                  No finished products found.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-stone-200">
                  <thead className="bg-white">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase">Product Name</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase">Costs & Wastage</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase">Ratios</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase">BOM Items</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-stone-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {finishedProducts.map((fp) => (
                      <tr key={fp.id} className="hover:bg-stone-50 transition-colors">
                        {editingFPId === fp.id ? (
                          <td colSpan="5" className="px-6 py-4">
                            <form onSubmit={handleUpdateFinishedProduct} className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-4">
                              <div className="flex items-center gap-4">
                                <label className="text-sm font-semibold text-stone-700 w-24">Name</label>
                                <input 
                                  type="text"
                                  required
                                  value={editFPName}
                                  onChange={(e) => setEditFPName(e.target.value)}
                                  className="flex-1 rounded-lg border-stone-300 shadow-sm p-2 border bg-white" 
                                />
                              </div>
                              <div className="flex items-center gap-4">
                                <label className="text-sm font-semibold text-stone-700 w-24">Costs & Wastage</label>
                                <div className="flex-1 flex gap-2">
                                  <input 
                                    type="number" min="0" step="0.01" placeholder="Labor ₹"
                                    value={editFPLaborCost} onChange={(e) => setEditFPLaborCost(e.target.value)}
                                    className="w-1/3 rounded-lg border-stone-300 shadow-sm p-2 border bg-white text-sm" 
                                  />
                                  <input 
                                    type="number" min="0" step="0.1" placeholder="Wastage %"
                                    value={editFPWastage} onChange={(e) => setEditFPWastage(e.target.value)}
                                    className="w-1/3 rounded-lg border-stone-300 shadow-sm p-2 border bg-white text-sm" 
                                  />
                                  <input 
                                    type="number" min="0" step="0.01" placeholder="Misc ₹"
                                    value={editFPMiscCost} onChange={(e) => setEditFPMiscCost(e.target.value)}
                                    className="w-1/3 rounded-lg border-stone-300 shadow-sm p-2 border bg-white text-sm" 
                                  />
                                </div>
                              </div>
                              <div className="flex items-start gap-4">
                                <label className="text-sm font-semibold text-stone-700 w-24 mt-2">Ratios</label>
                                <div className="flex-1 flex flex-wrap gap-2 bg-white p-2 border border-stone-300 rounded-lg max-h-32 overflow-y-auto">
                                  {externalRatios.map(ratio => (
                                    <label key={ratio.name} className="flex items-center gap-1.5 text-sm p-1">
                                      <input 
                                        type="checkbox" 
                                        checked={editFPRatios.includes(ratio.name)}
                                        onChange={() => toggleRatio(ratio.name, true)}
                                        className="rounded border-stone-300 text-indigo-600"
                                      />
                                      {ratio.name}
                                    </label>
                                  ))}
                                  {externalRatios.length === 0 && <span className="text-stone-400 text-sm">No ratios available</span>}
                                </div>
                              </div>
                              <div className="flex items-start gap-4">
                                <label className="text-sm font-semibold text-stone-700 w-24 mt-2">Materials</label>
                                <div className="flex-1 flex flex-wrap gap-2 bg-white p-2 border border-stone-300 rounded-lg max-h-32 overflow-y-auto">
                                  {rawMaterialsList.map(mat => (
                                    <label key={mat.id} className="flex items-center gap-1.5 text-sm p-1">
                                      <input 
                                        type="checkbox" 
                                        checked={editFPRawMaterials.includes(mat.name)}
                                        onChange={() => toggleRawMaterial(mat.name, true)}
                                        className="rounded border-stone-300 text-indigo-600"
                                      />
                                      {mat.name}
                                    </label>
                                  ))}
                                  {rawMaterialsList.length === 0 && <span className="text-stone-400 text-sm">No materials available</span>}
                                </div>
                              </div>
                              <div className="flex items-start gap-4">
                                <label className="text-sm font-semibold text-stone-700 w-24 mt-2">BOM</label>
                                <div className="flex-1 space-y-2">
                                  {editFPBom.map((bom, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                      <input 
                                        type="text" 
                                        placeholder="Item" 
                                        value={bom.name}
                                        onChange={e => handleEditFPBomChange(idx, 'name', e.target.value)}
                                        className="flex-1 px-2 py-1.5 border border-stone-300 rounded text-sm bg-white"
                                      />
                                      <input 
                                        type="number" 
                                        min="1"
                                        placeholder="Qty" 
                                        value={bom.qty}
                                        onChange={e => handleEditFPBomChange(idx, 'qty', e.target.value)}
                                        className="w-16 px-2 py-1.5 border border-stone-300 rounded text-sm bg-white"
                                      />
                                      <input 
                                        type="number" 
                                        min="0"
                                        step="0.01"
                                        placeholder="Price ₹" 
                                        value={bom.price}
                                        onChange={e => handleEditFPBomChange(idx, 'price', e.target.value)}
                                        className="w-24 px-2 py-1.5 border border-stone-300 rounded text-sm bg-white"
                                      />
                                      <button type="button" onClick={() => handleRemoveEditFPBomRow(idx)} className="text-red-500 hover:text-red-700 p-1">
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ))}
                                  <button 
                                    type="button" 
                                    onClick={handleEditFPBomRow}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1 inline-block"
                                  >
                                    + Add BOM Item
                                  </button>
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setEditingFPId(null)} className="px-4 py-2 bg-stone-200 text-stone-700 rounded-lg font-semibold hover:bg-stone-300">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">Save Changes</button>
                              </div>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td className="px-6 py-4 font-medium text-stone-900">
                              {fp.name}
                            </td>
                            <td className="px-6 py-4 text-stone-500 text-xs">
                              <div>Labor: ₹{fp.laborCost || 0}</div>
                              <div>Wastage: {fp.wastagePercentage || 0}%</div>
                              <div>Misc: ₹{fp.miscCost || 0}</div>
                            </td>
                            <td className="px-6 py-4 text-stone-600 text-sm">
                              <div className="space-y-2">
                                {fp.rawMaterials && fp.rawMaterials.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    <span className="text-xs font-semibold text-stone-500 w-full">Materials:</span>
                                    {fp.rawMaterials.map(rm => (
                                      <span key={rm} className="inline-block bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded text-xs font-medium">
                                        {rm}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {fp.ratios && fp.ratios.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    <span className="text-xs font-semibold text-stone-500 w-full">Ratios:</span>
                                    {fp.ratios.map(r => (
                                      <span key={r} className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-xs font-medium">
                                        {r}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="px-6 py-4 text-stone-600 text-sm">
                              {fp.bom && fp.bom.length > 0 ? (
                                <ul className="list-disc pl-4 space-y-0.5">
                                  {fp.bom.map((b, i) => (
                                    <li key={i} className="text-xs">
                                      {b.name} (x{b.qty}) - ₹{b.price}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-stone-400 italic">No BOM items</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              <button 
                                onClick={() => handleEditFPClick(fp)}
                                className="text-blue-500 hover:text-blue-700 mr-4"
                                title="Edit Finished Product"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDeleteFinishedProduct(fp.id, fp.name)}
                                className="text-red-500 hover:text-red-700"
                                title="Delete Finished Product"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
