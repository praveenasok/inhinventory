import React, { useState, useEffect } from 'react';
import { getCollection, addDocument, setDocument, getDocument, updateDocument, seedRawMaterials } from '../services/db';
import { Plus, ShoppingBag, Edit2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

const LENGTH_OPTIONS = Array.from({ length: 48 }, (_, i) => i + 3); // 3 to 50

export default function Purchases() {
  const { permissions, isAdminUser } = useAuth();
  const showFinancials = permissions?.financials;
  
  const [lots, setLots] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editLotId, setEditLotId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'purchaseDate', direction: 'desc' });
  
  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [initialWeight, setInitialWeight] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [lengthWeights, setLengthWeights] = useState({}); // { "12": 10.5 }
  const [lengthRates, setLengthRates] = useState({}); // { "12": 1500 }
  const [multiplierTables, setMultiplierTables] = useState([]);
  const [multiplierTableId, setMultiplierTableId] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lotsData, suppliersData, matData, multiplierTablesData] = await Promise.all([
        getCollection('lots', [], 'purchaseDate'),
        getCollection('suppliers'),
        getCollection('raw_materials'),
        getCollection('multiplier_tables')
      ]);
      setLots(lotsData.reverse());
      setSuppliers(suppliersData);
      setMultiplierTables(multiplierTablesData);
      
      let sortedMats = matData.sort((a,b) => a.name.localeCompare(b.name));
      if (sortedMats.length === 0) {
        const newMats = await seedRawMaterials();
        sortedMats = newMats.sort((a,b) => a.name.localeCompare(b.name));
      }
      setRawMaterials(sortedMats);
      if (sortedMats.length > 0) setMaterialType(sortedMats[0].name);

      if (suppliersData.length > 0) setSupplierId(suppliersData[0].id);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!supplierId || !materialType || suppliers.length === 0) return;
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier || !supplier.priceLists) return;

    const pl = supplier.priceLists.find(p => p.type === materialType);
    if (!pl) return;

    const selectedMat = rawMaterials.find(r => r.name === materialType);
    const isLengthBased = selectedMat?.format === 'length-based';
    
    if (!isLengthBased) {
      if (pl.rate) setPricePerUnit(pl.rate.toString());
    } else {
      if (pl.rates) {
        const initialRates = {};
        pl.rates.forEach(r => {
          initialRates[r.length] = r.rate;
        });
        setLengthRates(initialRates);
      }
    }
  }, [supplierId, materialType, suppliers]);

  const handleLengthWeightChange = (len, value) => {
    setLengthWeights(prev => ({
      ...prev,
      [len]: value
    }));
  };

  const handleLengthRateChange = (len, value) => {
    setLengthRates(prev => ({
      ...prev,
      [len]: value
    }));
  };

  const handleEditClick = (lot) => {
    setEditLotId(lot.id);
    setSupplierId(lot.supplierId);
    setMaterialType(lot.materialType);
    setMultiplierTableId(lot.multiplierTableId || '');
    
    if (lot.lengths) {
      const weights = {};
      const rates = {};
      lot.lengths.forEach(l => {
        weights[l.length] = l.weight;
        rates[l.length] = l.rate;
      });
      setLengthWeights(weights);
      setLengthRates(rates);
      setInitialWeight('');
      setPricePerUnit('');
    } else {
      setInitialWeight(lot.initialWeight.toString());
      setPricePerUnit(lot.pricePerUnit?.toString() || '');
      setLengthWeights({});
      setLengthRates({});
    }
    
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditLotId(null);
    setInitialWeight('');
    setPricePerUnit('');
    setLengthWeights({});
    setLengthRates({});
    setMultiplierTableId('');
    if (rawMaterials.length > 0) setMaterialType(rawMaterials[0].name);
  };

  const handleAddPurchase = async (e) => {
    e.preventDefault();
    
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    
    const supplier = suppliers.find(s => s.id === supplierId);
    const supplierCode = supplier?.code ? supplier.code.toUpperCase() : 'UNK';
    
    const selectedMat = rawMaterials.find(r => r.name === materialType);
    const isLengthBased = selectedMat?.format === 'length-based';

    let totalWeight = 0;
    let totalCost = 0;
    let lengthsArr = null;

    if (isLengthBased) {
      const filledLengths = Object.entries(lengthWeights)
        .filter(([_, weight]) => weight && String(weight).trim() !== '')
        .map(([len, weight]) => {
          const w = Number(weight);
          const r = Number(lengthRates[len] || 0);
          totalCost += w * r;
          return { length: Number(len), weight: w, rate: r };
        });
      
      if (filledLengths.length === 0) {
        alert("Please enter the weight for at least one length.");
        return;
      }
      lengthsArr = filledLengths;
      totalWeight = filledLengths.reduce((acc, curr) => acc + curr.weight, 0);
    } else {
      totalWeight = Number(initialWeight);
      totalCost = totalWeight * Number(pricePerUnit);
    }

    const price = Number(pricePerUnit);
    
    let maxSeq = 0;
    lots.forEach(l => {
      if (l.id.includes(dateStr)) {
        const parts = l.id.split('-');
        const lastPart = parts[parts.length - 1];
        const seq = parseInt(lastPart, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
    const nextSeq = maxSeq + 1;
    
    const generatedLotId = editLotId || `LOT-${supplierCode}-${totalWeight}KG-${dateStr}-${nextSeq}`;

    try {
      const existingLot = editLotId ? lots.find(l => l.id === editLotId) : {};

      const lotData = {
        ...existingLot,
        id: generatedLotId,
        supplierId,
        materialType,
        multiplierTableId: multiplierTableId || null,
        initialWeight: totalWeight,
        pricePerUnit: isLengthBased ? null : Number(pricePerUnit),
        totalCost,
        purchaseDate: existingLot.purchaseDate || new Date(),
        status: existingLot.status || 'Raw',
        currentStage: existingLot.currentStage || 'Initial'
      };

      if (editLotId) {
        const weightDiff = totalWeight - (existingLot.initialWeight || 0);
        lotData.remainingWeight = (existingLot.remainingWeight ?? existingLot.initialWeight) + weightDiff;
      } else {
        lotData.remainingWeight = totalWeight;
      }

      if (lengthsArr) {
        lotData.lengths = lengthsArr;
      } else {
        delete lotData.lengths;
      }

      await setDocument('lots', generatedLotId, lotData);
      
      handleCloseForm();
      fetchData();
    } catch (error) {
      console.error("Error creating lot:", error);
    }
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedLots = () => {
    const sortableLots = [...lots];
    sortableLots.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      
      if (sortConfig.key === 'supplier') {
          aValue = suppliers.find(s => s.id === a.supplierId)?.name || '';
          bValue = suppliers.find(s => s.id === b.supplierId)?.name || '';
      }
      if (sortConfig.key === 'remainingWeight') {
          aValue = a.remainingWeight ?? a.initialWeight;
          bValue = b.remainingWeight ?? b.initialWeight;
      }
      if (sortConfig.key === 'purchaseDate') {
          // If purchaseDate is a firestore timestamp, convert to value
          aValue = a.purchaseDate?.toMillis ? a.purchaseDate.toMillis() : new Date(a.purchaseDate).getTime();
          bValue = b.purchaseDate?.toMillis ? b.purchaseDate.toMillis() : new Date(b.purchaseDate).getTime();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sortableLots;
  };

  const sortedLots = getSortedLots();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Purchases & Lots</h1>
        <button 
          onClick={() => { setEditLotId(null); setIsFormOpen(true); }}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          <span>New Purchase</span>
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h2 className="text-lg font-semibold mb-4">{editLotId ? 'Edit Purchase Lot' : 'Register New Purchase Lot'}</h2>
          <form onSubmit={handleAddPurchase} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Supplier</label>
                <select 
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                >
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {(() => {
                const selectedSupplier = suppliers.find(s => s.id === supplierId);
                const availableMaterials = selectedSupplier?.priceLists || [];
                return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Material Type</label>
                    <select 
                      value={materialType}
                      onChange={(e) => {
                        setMaterialType(e.target.value);
                        setLengthWeights({});
                        setLengthRates({});
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                    >
                      {availableMaterials.length === 0 ? (
                        <option value="">No price lists for this supplier</option>
                      ) : (
                        availableMaterials.map(pl => <option key={pl.type} value={pl.type}>{pl.type}</option>)
                      )}
                    </select>
                  </div>
                );
              })()}
              
              {(() => {
                const selectedMat = rawMaterials.find(r => r.name === materialType);
                const isLengthBased = selectedMat?.format === 'length-based';

                if (isLengthBased) {
                  return (
                    <>
                    <div className="col-span-2 mt-4 border-t pt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-3">Purchased Weights per Length (Kg)</label>
                      <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Length</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight (Kg)</th>
                              {showFinancials && <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate (₹)</th>}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {LENGTH_OPTIONS.map(len => (
                              <tr key={len} className="hover:bg-gray-50">
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 w-1/4">{len}" Inches</td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                  <input 
                                    type="number"
                                    step="0.01"
                                    placeholder="Weight in Kg..."
                                    value={lengthWeights[len] || ''}
                                    onChange={(e) => handleLengthWeightChange(len, e.target.value)}
                                    className="w-full max-w-xs rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-1.5 border"
                                  />
                                </td>
                                {showFinancials && (
                                  <td className="px-4 py-2 whitespace-nowrap">
                                    <input 
                                      type="number"
                                      step="0.01"
                                      placeholder="Rate/Kg"
                                      value={lengthRates[len] || ''}
                                      onChange={(e) => handleLengthRateChange(len, e.target.value)}
                                      className="w-full max-w-xs rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-1.5 border"
                                    />
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>


                    </>
                  );
                } else {
                  return (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Total Weight (Kg)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          required
                          value={initialWeight}
                          onChange={(e) => setInitialWeight(e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                        />
                      </div>
                      {showFinancials && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Avg. Price Per Kg</label>
                          <input 
                            type="number" 
                            step="0.01"
                            required
                            value={pricePerUnit}
                            onChange={(e) => setPricePerUnit(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                          />
                        </div>
                      )}
                    </>
                  );
                }
              })()}
              
              <div className="col-span-1 sm:col-span-2 bg-stone-50/50 p-4 rounded-xl border border-stone-100 mt-4">
                <label className="block text-sm font-semibold text-stone-900 mb-1">
                  Cost Allocation Multiplier Table
                </label>
                <p className="text-xs text-stone-500 mb-3">Select the multiplier table to use when processing this lot into length-based outputs.</p>
                <select
                  required
                  value={multiplierTableId}
                  onChange={(e) => setMultiplierTableId(e.target.value)}
                  className="block w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-stone-500 focus:border-stone-500 bg-white"
                >
                  <option value="">Select a table...</option>
                  {multiplierTables.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-4">
              <button 
                type="button" 
                onClick={handleCloseForm}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
              >
                {editLotId ? 'Update Lot' : 'Generate Lot'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('id')}>
                Lot # {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('supplier')}>
                Supplier {sortConfig.key === 'supplier' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('materialType')}>
                Material / Lengths {sortConfig.key === 'materialType' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('remainingWeight')}>
                Available Weight {sortConfig.key === 'remainingWeight' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              {showFinancials && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('totalCost')}>
                  Total Cost (₹) {sortConfig.key === 'totalCost' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('status')}>
                Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={showFinancials ? "6" : "5"} className="px-6 py-4 text-center text-gray-500">Loading...</td>
              </tr>
            ) : sortedLots.length === 0 ? (
              <tr>
                <td colSpan={showFinancials ? "6" : "5"} className="px-6 py-4 text-center text-gray-500">No lots generated yet.</td>
              </tr>
            ) : (
              sortedLots.map((lot) => {
                const supplierName = suppliers.find(s => s.id === lot.supplierId)?.name || 'Unknown';
                return (
                  <tr key={lot.id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium flex items-center space-x-2">
                      <ShoppingBag className="w-4 h-4 text-gray-400" />
                      <Link 
                        to={`/inventory?lotId=${lot.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        title="Click to Trace"
                      >
                        {lot.id}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{supplierName}</td>
                    <td className="px-6 py-4 text-gray-500">
                      <div className="font-medium text-gray-800">{lot.materialType}</div>
                      {lot.lengths && (
                        <div className="text-xs mt-1 space-y-1">
                          {lot.lengths.map((l, i) => (
                            <span key={i} className="inline-block bg-gray-100 rounded px-1.5 py-0.5 mr-1 mb-1">
                              {l.length}": {l.weight}kg
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-900 font-medium">{(lot.remainingWeight ?? lot.initialWeight).toFixed(2)} Kg</div>
                      <div className="text-xs text-gray-500 line-through mt-0.5">{(lot.initialWeight).toFixed(2)} Kg Initial</div>
                    </td>
                    {showFinancials && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-gray-900 font-medium">₹{(lot.totalCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        {lot.pricePerUnit && (
                          <div className="text-xs text-gray-500 mt-0.5">₹{lot.pricePerUnit.toFixed(2)} / Kg</div>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        lot.status === 'Completed' ? 'bg-green-100 text-green-800' :
                        lot.status === 'Partially Processed' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {lot.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {(isAdminUser || !lot.status || lot.status === 'Raw') && (
                        <button 
                          onClick={() => handleEditClick(lot)}
                          className="text-blue-600 hover:text-blue-900 flex items-center justify-end w-full"
                          title="Edit Purchase"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
