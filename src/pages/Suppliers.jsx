import React, { useState, useEffect } from 'react';
import { getCollection, addDocument, deleteDocument, updateDocument, seedRawMaterials } from '../services/db';
import { Plus, Trash2, X, Edit2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LENGTH_OPTIONS = Array.from({ length: 48 }, (_, i) => i + 3); // 3 to 50

export default function Suppliers() {
  const { permissions } = useAuth();
  const showFinancials = permissions?.financials;

  const [suppliers, setSuppliers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  
  // Supplier Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
  // Price List State
  const [priceLists, setPriceLists] = useState([]);
  
  // Current Product being added
  const [prodType, setProdType] = useState('');
  const [prodRemarks, setProdRemarks] = useState('');
  const [prodWeight, setProdWeight] = useState('');
  const [prodRate, setProdRate] = useState(''); // Only used for Goli/Fancy
  const [lengthRates, setLengthRates] = useState({}); // { "3": 1500, "4": 1600 }

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const [supData, matData] = await Promise.all([
        getCollection('suppliers', [], 'name'),
        getCollection('raw_materials')
      ]);
      setSuppliers(supData);
      
      let sortedMats = matData.sort((a,b) => a.name.localeCompare(b.name));
      if (sortedMats.length === 0) {
        const newMats = await seedRawMaterials();
        sortedMats = newMats.sort((a,b) => a.name.localeCompare(b.name));
      }
      setRawMaterials(sortedMats);
      if (sortedMats.length > 0) {
        setProdType(sortedMats[0].name);
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLengthRateChange = (len, value) => {
    setLengthRates(prev => ({
      ...prev,
      [len]: value
    }));
  };

  const handleAddProductToList = () => {
    const selectedMat = rawMaterials.find(r => r.name === prodType);
    const isLengthBased = selectedMat?.format === 'length-based';

    const newProduct = {
      type: prodType,
      remarks: prodRemarks,
    };

    if (isLengthBased) {
      // Filter out empty rates to save space
      const filledRates = Object.entries(lengthRates)
        .filter(([_, rate]) => rate && String(rate).trim() !== '')
        .map(([len, rate]) => ({ length: Number(len), rate: Number(rate) }));
        
      if (filledRates.length === 0) {
        alert("Please enter a rate for at least one length.");
        return;
      }
      newProduct.rates = filledRates; // Store as array of { length, rate }
    } else {
      if (!prodRate) {
        alert("Rate is required.");
        return;
      }
      newProduct.rate = Number(prodRate);
      newProduct.weight = Number(prodWeight);
    }

    setPriceLists([...priceLists, newProduct]);
    
    // Reset product fields
    if (rawMaterials.length > 0) {
      setProdType(rawMaterials[0].name);
    }
    setProdRemarks('');
    setProdWeight('');
    setProdRate('');
    setLengthRates({});
  };

  const removeProductFromList = (index) => {
    const updated = [...priceLists];
    updated.splice(index, 1);
    setPriceLists(updated);
  };

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        code: code.toUpperCase(),
        contactInfo: { phone, email },
        priceLists: priceLists
      };

      if (editingSupplierId) {
        await updateDocument('suppliers', editingSupplierId, payload);
      } else {
        await addDocument('suppliers', payload);
      }
      
      setIsFormOpen(false);
      setEditingSupplierId(null);
      setName('');
      setCode('');
      setPhone('');
      setEmail('');
      setPriceLists([]);
      fetchSuppliers();
    } catch (error) {
      console.error("Error adding supplier:", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this supplier?')) {
      try {
        await deleteDocument('suppliers', id);
        fetchSuppliers();
      } catch (error) {
        console.error("Error deleting supplier:", error);
      }
    }
  };

  const handleEditSupplier = (supplier) => {
    setEditingSupplierId(supplier.id);
    setName(supplier.name || '');
    setCode(supplier.code || '');
    setPhone(supplier.contactInfo?.phone || '');
    setEmail(supplier.contactInfo?.email || '');
    setPriceLists(supplier.priceLists || []);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectedMat = rawMaterials.find(r => r.name === prodType);
  const isLengthBased = selectedMat?.format === 'length-based';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
        <button 
          onClick={() => {
            setEditingSupplierId(null);
            setName('');
            setCode('');
            setPhone('');
            setEmail('');
            setPriceLists([]);
            setIsFormOpen(true);
          }}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          <span>Add Supplier</span>
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">
            {editingSupplierId ? 'Edit Supplier Profile' : 'New Supplier Profile'}
          </h2>
          
          <form id="supplierForm" onSubmit={handleAddSupplier} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">Company Name</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Supplier Code (3 letters)</label>
                <input 
                  type="text" 
                  required
                  maxLength="3"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border uppercase" 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
              </div>
            </div>
          </form>

          {/* Price List Section */}
          {showFinancials && (
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
              <h3 className="text-md font-medium mb-4">Supplier Products (Price List)</h3>
            
            {priceLists.length > 0 && (
              <ul className="mb-6 space-y-3">
                {priceLists.map((item, idx) => (
                  <li key={idx} className="flex justify-between items-start bg-white p-3 rounded border border-gray-200 text-sm">
                    <div className="w-full pr-4">
                      <div className="font-semibold text-blue-700 mb-1">{item.type}</div>
                      
                      {item.rates ? (
                        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 mt-2">
                          {item.rates.map(r => (
                            <div key={r.length} className="bg-gray-50 p-1.5 rounded text-center border text-xs">
                              <div className="font-medium text-gray-500">{r.length}"</div>
                              <div className="font-bold">₹{r.rate}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          Rate: ₹{item.rate}/kg {item.weight && <span className="text-gray-500 ml-2">| Weight: {item.weight}kg</span>}
                        </div>
                      )}
                      
                      {item.remarks && <div className="text-gray-500 italic mt-2">Remarks: {item.remarks}</div>}
                    </div>
                    <button type="button" onClick={() => removeProductFromList(idx)} className="text-red-500 hover:text-red-700 p-1">
                      <X className="w-5 h-5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="bg-white p-4 border border-gray-200 rounded space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Product Type</label>
                  <select 
                    value={prodType}
                    onChange={(e) => {
                      setProdType(e.target.value);
                      setLengthRates({}); // reset rates on type change
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  >
                    {rawMaterials.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700">Remarks</label>
                  <input 
                    type="text"
                    value={prodRemarks}
                    onChange={(e) => setProdRemarks(e.target.value)}
                    placeholder="Any specific quality details..."
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                  />
                </div>
              </div>

              {!isLengthBased ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Rate / kg</label>
                    <input 
                      type="number" step="0.01"
                      value={prodRate}
                      onChange={(e) => setProdRate(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Weight (kg) - Optional</label>
                    <input 
                      type="number" step="0.01"
                      value={prodWeight}
                      onChange={(e) => setProdWeight(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Rates per Length (Inches)</label>
                  <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Length</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate / kg</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {LENGTH_OPTIONS.map(len => (
                          <tr key={len} className="hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 w-1/3">{len}" Inches</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <input 
                                type="number"
                                placeholder="Enter rate..."
                                value={lengthRates[len] || ''}
                                onChange={(e) => handleLengthRateChange(len, e.target.value)}
                                className="w-full max-w-xs rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-1.5 border"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 italic">Fill in the rates only for the lengths supplied by this vendor.</p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button 
                  type="button" 
                  onClick={handleAddProductToList}
                  className="px-4 py-2 bg-gray-800 border border-transparent rounded-md text-sm font-medium text-white hover:bg-gray-700 inline-flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Product to List
                </button>
              </div>
            </div>
          </div>
          )}

            <div className="flex justify-end space-x-3 mt-6 border-t pt-4">
            <button 
              type="button" 
              onClick={() => {
                setIsFormOpen(false);
                setEditingSupplierId(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              form="supplierForm"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              {editingSupplierId ? 'Save Changes' : 'Save Supplier'}
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplied Products</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-gray-500">Loading...</td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-gray-500">No suppliers found.</td>
              </tr>
            ) : (
              suppliers.map((supplier) => (
                <tr key={supplier.id} className="align-top">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    <div>{supplier.name}</div>
                    <div className="text-xs text-gray-500 bg-gray-100 rounded inline-block px-1 mt-1 border border-gray-200">
                      Code: {supplier.code || 'UNK'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-sm">
                    <div>{supplier.contactInfo?.phone}</div>
                    <div>{supplier.contactInfo?.email}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {!showFinancials ? (
                      <span className="italic text-gray-400">Financial data restricted</span>
                    ) : supplier.priceLists && supplier.priceLists.length > 0 ? (
                      <div className="space-y-3">
                        {supplier.priceLists.map((pl, i) => (
                          <div key={i} className="bg-gray-50 rounded p-2 border border-gray-100">
                            <span className="font-semibold text-blue-700">{pl.type}</span>
                            {pl.rates ? (
                              <div className="mt-1 text-xs grid grid-cols-4 sm:grid-cols-6 gap-1">
                                {pl.rates.map(r => (
                                  <div key={r.length} className="bg-white border rounded px-1 py-0.5 text-center">
                                    <span className="text-gray-400">{r.length}"</span>: ₹{r.rate}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="ml-2">@ ₹{pl.rate}/kg {pl.weight ? `(${pl.weight}kg)` : ''}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="italic text-gray-400">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    <button onClick={() => handleEditSupplier(supplier)} className="text-blue-600 hover:text-blue-900">
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDelete(supplier.id)} className="text-red-600 hover:text-red-900">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
