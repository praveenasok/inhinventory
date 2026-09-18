import React, { useState, useEffect } from 'react';
import { getCollection, getCollectionPaginated, getCollectionAggregate, addDocument, setDocument, getDocument, updateDocument, deleteDocument, seedRawMaterials } from '../services/db';
import { Plus, ShoppingBag, Edit2, Trash2, DownloadCloud, Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import LotDetailsModal from '../components/LotDetailsModal';

const LENGTH_OPTIONS = Array.from({ length: 48 }, (_, i) => i + 3); // 3 to 50

export default function Purchases() {
  const { permissions, isAdminUser } = useAuth();
  const showFinancials = permissions?.financials;
  
  const [lots, setLots] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverTotals, setServerTotals] = useState({ weight: 0, value: 0 });

  const [suppliers, setSuppliers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [workrooms, setWorkrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editLotId, setEditLotId] = useState(null);
  const [viewingLot, setViewingLot] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'purchaseDate', direction: 'desc' });
  const [selectedLotIds, setSelectedLotIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterMaterial, setFilterMaterial] = useState('All');
  const [filterWorkroom, setFilterWorkroom] = useState('All');
  
  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [initialWeight, setInitialWeight] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [lengthInputs, setLengthInputs] = useState([{ length: '12', weight: '', rate: '' }]);
  const [supplierRates, setSupplierRates] = useState({});
  const [multiplierTables, setMultiplierTables] = useState([]);
  const [multiplierTableId, setMultiplierTableId] = useState('');
  const [workroomId, setWorkroomId] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [miscCost, setMiscCost] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [comment, setComment] = useState('');

  useEffect(() => {
    fetchData(true);
  }, []);

  const fetchData = async (reset = false) => {
    if (reset) {
      setLoading(true);
      setLots([]);
    } else {
      setLoadingMore(true);
    }

    try {
      // Parallel execution for initial load
      if (reset) {
        const [lotsData, suppliersData, matData, multiplierTablesData, workroomsData] = await Promise.all([
          getCollectionPaginated('lots', [], 'purchaseDate', 100, null),
          getCollection('suppliers'),
          getCollection('raw_materials'),
          getCollection('multiplier_tables'),
          getCollection('workrooms')
        ]);

        let aggData = {};
        try {
          aggData = await getCollectionAggregate('lots', ['remainingWeight', 'totalCost', 'initialWeight']);
        } catch (aggErr) {
          console.warn('Aggregation query failed (likely missing composite index):', aggErr);
          // Fallback to client-side calculation based on fetched lots (which might be partial due to pagination)
          aggData = lotsData.docs.reduce((acc, lot) => {
            const status = lot.status || 'Raw';
            if (status === 'Raw' || status === 'Partially Processed') {
              acc.remainingWeight += (lot.remainingWeight ?? lot.initialWeight) || 0;
              acc.totalCost += lot.totalCost || 0;
              acc.initialWeight += lot.initialWeight || 0;
            }
            return acc;
          }, { remainingWeight: 0, totalCost: 0, initialWeight: 0 });
        }

        setLots(lotsData.docs.reverse());
        setLastDoc(lotsData.lastDoc);
        setSuppliers(suppliersData);
        setMultiplierTables(multiplierTablesData);
        setWorkrooms(workroomsData);
        
        let sortedMats = matData.sort((a,b) => a.name.localeCompare(b.name));
        if (sortedMats.length === 0) {
          const newMats = await seedRawMaterials();
          sortedMats = newMats.sort((a,b) => a.name.localeCompare(b.name));
        }
        setRawMaterials(sortedMats);
        if (sortedMats.length > 0) setMaterialType(sortedMats[0].name);
        if (suppliersData.length > 0) setSupplierId(suppliersData[0].id);

        // Approximate server value: (Total Cost / Total Initial Weight) * Remaining Weight
        const avgGlobalRate = (aggData.totalCost || 0) / (aggData.initialWeight || 1);
        setServerTotals({
          weight: aggData.remainingWeight || 0,
          value: (aggData.remainingWeight || 0) * avgGlobalRate
        });

      } else {
        // Load More
        const lotsData = await getCollectionPaginated('lots', [], 'purchaseDate', 100, lastDoc);
        setLots(prev => [...prev, ...lotsData.docs.reverse()]);
        setLastDoc(lotsData.lastDoc);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
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
        setSupplierRates(initialRates);
        
        // Auto-fill existing inputs
        setLengthInputs(prev => prev.map(input => ({
          ...input,
          rate: initialRates[input.length] || input.rate
        })));
      }
    }
  }, [supplierId, materialType, suppliers]);

  const handleAddLengthInput = () => {
    setLengthInputs([...lengthInputs, { length: '12', weight: '', rate: supplierRates['12'] || '' }]);
  };

  const handleLengthInputChange = (index, field, value) => {
    const newInputs = [...lengthInputs];
    newInputs[index][field] = value;
    
    // Auto-fill rate if length changes
    if (field === 'length') {
       newInputs[index].rate = supplierRates[value] || '';
    }

    // Auto-add next even length if weight is entered on the last row
    if (field === 'weight' && value !== '' && index === newInputs.length - 1) {
      const currentLength = Number(newInputs[index].length);
      if (!isNaN(currentLength)) {
        const nextLength = currentLength + (currentLength % 2 === 0 ? 2 : 1);
        if (nextLength <= 50) {
          newInputs.push({ length: nextLength.toString(), weight: '', rate: supplierRates[nextLength.toString()] || '' });
        }
      }
    }

    setLengthInputs(newInputs);
  };

  const handleRemoveLengthInput = (index) => {
    const newInputs = [...lengthInputs];
    newInputs.splice(index, 1);
    setLengthInputs(newInputs);
  };

  const handleEditClick = (lot) => {
    setEditLotId(lot.id);
    setSupplierId(lot.supplierId);
    setMaterialType(lot.materialType);
    setMultiplierTableId(lot.multiplierTableId || '');
    setWorkroomId(lot.workroomId || '');
    
    let d = new Date();
    if (lot.purchaseDate) {
      d = lot.purchaseDate.seconds ? new Date(lot.purchaseDate.seconds * 1000) : new Date(lot.purchaseDate);
    }
    setPurchaseDate(d.toISOString().split('T')[0]);
    setComment(lot.comment || '');
    
    if (lot.lengths) {
      setLengthInputs(lot.lengths.map(l => ({ 
        length: l.length.toString(), 
        weight: l.weight.toString(), 
        rate: l.rate?.toString() || '' 
      })));
      setInitialWeight('');
      setPricePerUnit('');
    } else {
      setInitialWeight(lot.initialWeight.toString());
      setPricePerUnit(lot.pricePerUnit?.toString() || '');
      setLengthInputs([{ length: '12', weight: '', rate: '' }]);
    }
    
    const w = lot.initialWeight || 1;
    setLaborCost(lot.laborCost ? (lot.laborCost / w).toString() : '');
    setShippingCost(lot.shippingCost ? (lot.shippingCost / w).toString() : '');
    setMiscCost(lot.miscCost ? (lot.miscCost / w).toString() : '');
    
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditLotId(null);
    setInitialWeight('');
    setPricePerUnit('');
    setLengthInputs([{ length: '12', weight: '', rate: '' }]);
    setMultiplierTableId('');
    setWorkroomId('');
    setLaborCost('');
    setShippingCost('');
    setMiscCost('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setComment('');
    if (rawMaterials.length > 0) setMaterialType(rawMaterials[0].name);
  };

  const handleDeleteClick = async (lotId) => {
    if (window.confirm(`Are you sure you want to delete lot ${lotId}? This action cannot be undone.`)) {
      setLoading(true);
      try {
        await deleteDocument('lots', lotId);
        fetchData();
      } catch (error) {
        console.error("Error deleting lot:", error);
        alert("Failed to delete lot.");
        setLoading(false);
      }
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedLotIds(new Set(sortedLots.map(l => l.id)));
    } else {
      setSelectedLotIds(new Set());
    }
  };

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedLotIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLotIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedLotIds.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedLotIds.size} selected lots? This action cannot be undone.`)) {
      setLoading(true);
      try {
        for (const id of selectedLotIds) {
          await deleteDocument('lots', id);
        }
        setSelectedLotIds(new Set());
        fetchData();
      } catch (error) {
        console.error("Bulk delete error:", error);
        alert("Failed to delete some lots.");
        setLoading(false);
      }
    }
  };

  const handleAddPurchase = async (e) => {
    e.preventDefault();
    
    const dateStr = purchaseDate.replace(/-/g, '');
    
    const supplier = suppliers.find(s => s.id === supplierId);
    const supplierCode = supplier?.code ? supplier.code.toUpperCase() : 'UNK';
    
    const selectedMat = rawMaterials.find(r => r.name === materialType);
    const isLengthBased = selectedMat?.format === 'length-based';

    let totalWeight = 0;
    let totalCost = 0;
    let lengthsArr = null;

    if (isLengthBased) {
      const filledLengths = lengthInputs
        .filter(input => input.weight && String(input.weight).trim() !== '')
        .map(input => {
          const w = Number(input.weight);
          const r = Number(input.rate || 0);
          totalCost += w * r;
          return { length: Number(input.length), weight: w, rate: r };
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
    
    const parsedLaborCost = Number(laborCost) || 0;
    const parsedShippingCost = Number(shippingCost) || 0;
    const parsedMiscCost = Number(miscCost) || 0;
    
    const absoluteLaborCost = parsedLaborCost * totalWeight;
    const absoluteShippingCost = parsedShippingCost * totalWeight;
    const absoluteMiscCost = parsedMiscCost * totalWeight;
    
    totalCost += absoluteLaborCost + absoluteShippingCost + absoluteMiscCost;

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
        workroomId: workroomId || null,
        initialWeight: totalWeight,
        pricePerUnit: isLengthBased ? null : Number(pricePerUnit),
        laborCost: absoluteLaborCost,
        shippingCost: absoluteShippingCost,
        miscCost: absoluteMiscCost,
        totalCost,
        purchaseDate: new Date(purchaseDate),
        comment: comment,
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
    let sortableLots = lots.filter(lot => {
      const supplierName = suppliers.find(s => s.id === lot.supplierId)?.name || '';
      const matchesSearch = lot.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            supplierName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const lotStatus = lot.status || 'Raw';
      const matchesStatus = filterStatus === 'All' || lotStatus === filterStatus;
      const matchesMaterial = filterMaterial === 'All' || lot.materialType === filterMaterial;
      const matchesWorkroom = filterWorkroom === 'All' || lot.workroomId === filterWorkroom;

      return matchesSearch && matchesStatus && matchesMaterial && matchesWorkroom;
    });

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

  const totals = lots.reduce((acc, lot) => {
    const status = lot.status || 'Raw';
    if (status === 'Raw' || status === 'Partially Processed') {
      const weight = lot.remainingWeight ?? lot.initialWeight;
      acc.weight += weight;
      if (lot.totalCost && lot.initialWeight > 0) {
        acc.value += (lot.totalCost / lot.initialWeight) * weight;
      }
    }
    return acc;
  }, { weight: 0, value: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases & Lots</h1>
          <p className="text-sm text-gray-500 mt-1">
            Available Raw/Partially Processed: <span className="font-bold text-blue-700">{serverTotals.weight.toFixed(2)} Kg</span>
            {showFinancials && (
              <span className="ml-2 border-l pl-2 border-gray-300">
                Value: <span className="font-bold text-green-700">₹{serverTotals.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
            )}
            <span className="ml-2 text-xs text-gray-400 italic">(Global Server Total)</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdminUser && selectedLotIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedLotIds.size})</span>
            </button>
          )}
          <button 
            onClick={() => { setEditLotId(null); setIsFormOpen(true); }}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase</span>
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center">
        <input 
          type="text" 
          placeholder="Search by Lot # or Supplier..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
        />
        <select 
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
        >
          <option value="All">All Statuses</option>
          <option value="Raw">Raw</option>
          <option value="Partially Processed">Partially Processed</option>
          <option value="Completed">Completed</option>
        </select>
        <select 
          value={filterMaterial}
          onChange={(e) => setFilterMaterial(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
        >
          <option value="All">All Materials</option>
          {rawMaterials.map(m => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
        <select 
          value={filterWorkroom}
          onChange={(e) => setFilterWorkroom(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
        >
          <option value="All">All Workrooms</option>
          {workrooms.map(w => (
            <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
          ))}
        </select>
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
                  <option value="" disabled>
                    {suppliers.length === 0 ? "No suppliers available" : "Select a supplier..."}
                  </option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Purchase Date</label>
                <input 
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Workroom</label>
                <select 
                  required
                  value={workroomId}
                  onChange={(e) => setWorkroomId(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                >
                  <option value="" disabled>Select a workroom...</option>
                  {workrooms.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
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
                        setLengthInputs([{ length: '12', weight: '', rate: '' }]);
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
                      <p className="text-sm text-gray-600 mb-2">Purchased Weights per Length (Kg):</p>
                      {lengthInputs.map((input, idx) => (
                        <div key={idx} className="flex items-center space-x-4 mb-3">
                          <div className="w-48">
                            <label className="block text-xs text-gray-500 mb-1">Length (Inches)</label>
                            <select 
                              required
                              value={input.length}
                              onChange={(e) => handleLengthInputChange(idx, 'length', e.target.value)}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white"
                            >
                              {LENGTH_OPTIONS.map(len => (
                                <option key={len} value={len}>{len}"</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-48">
                            <label className="block text-xs text-gray-500 mb-1">Weight (Kg)</label>
                            <input 
                              type="number" 
                              step="0.001"
                              required
                              value={input.weight}
                              onChange={(e) => handleLengthInputChange(idx, 'weight', e.target.value)}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                            />
                          </div>
                          {showFinancials && (
                            <div className="w-48">
                              <label className="block text-xs text-gray-500 mb-1">Rate (₹)</label>
                              <input 
                                type="number" 
                                step="0.01"
                                value={input.rate}
                                onChange={(e) => handleLengthInputChange(idx, 'rate', e.target.value)}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                              />
                            </div>
                          )}
                          {lengthInputs.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemoveLengthInput(idx)}
                              className="mt-5 text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button 
                        type="button" 
                        onClick={handleAddLengthInput}
                        className="text-sm text-blue-600 font-medium hover:text-blue-800 mt-2"
                      >
                        + Add another length
                      </button>
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
                          step="0.001"
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

              {showFinancials && (
                <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Labor Cost (₹ / Kg)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={laborCost}
                      onChange={(e) => setLaborCost(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Shipping Cost (₹ / Kg)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Misc Cost (₹ / Kg)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={miscCost}
                      onChange={(e) => setMiscCost(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                    />
                  </div>
                </div>
              )}

              <div className="col-span-1 sm:col-span-2 mt-4">
                <label className="block text-sm font-medium text-gray-700">Comment</label>
                <textarea 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows="2"
                  placeholder="Optional comment for this purchase"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border resize-none" 
                />
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
              {isAdminUser && (
                <th className="px-6 py-3 text-left w-10">
                  <input 
                    type="checkbox" 
                    checked={sortedLots.length > 0 && selectedLotIds.size === sortedLots.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('id')}>
                Lot # {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('supplier')}>
                Supplier {sortConfig.key === 'supplier' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('materialType')}>
                Material / Lengths {sortConfig.key === 'materialType' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('workroomId')}>
                Workroom {sortConfig.key === 'workroomId' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
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
                <td colSpan={showFinancials ? (isAdminUser ? "8" : "7") : (isAdminUser ? "7" : "6")} className="px-6 py-4 text-center text-gray-500">Loading...</td>
              </tr>
            ) : sortedLots.length === 0 ? (
              <tr>
                <td colSpan={showFinancials ? (isAdminUser ? "8" : "7") : (isAdminUser ? "7" : "6")} className="px-6 py-4 text-center text-gray-500">No lots found.</td>
              </tr>
            ) : (
              sortedLots.map((lot) => {
                const supplierName = suppliers.find(s => s.id === lot.supplierId)?.name || 'Unknown';
                return (
                  <tr key={lot.id} className={selectedLotIds.has(lot.id) ? 'bg-blue-50' : ''}>
                    {isAdminUser && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          checked={selectedLotIds.has(lot.id)}
                          onChange={() => toggleSelect(lot.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap flex flex-col justify-center">
                      <div className="flex items-center space-x-2">
                        <ShoppingBag className="w-4 h-4 text-gray-400" />
                        <Link 
                          to={`/inventory?lotId=${lot.id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                          title="Click to Trace"
                        >
                          {lot.id}
                        </Link>
                      </div>
                      {lot.comment && (
                        <div className="text-xs text-gray-500 italic mt-1 ml-6">{lot.comment}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{supplierName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700 font-medium">
                      {workrooms.find(w => w.id === lot.workroomId)?.code || '-'}
                    </td>
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
                      {lot.remainingWeight !== undefined && lot.remainingWeight !== lot.initialWeight && (
                        <div className="text-xs text-gray-400 mt-0.5">{(lot.initialWeight).toFixed(2)} Kg Initial</div>
                      )}
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
                      <div className="flex items-center justify-end space-x-3">
                        <button 
                          onClick={() => setViewingLot(lot)}
                          className="text-stone-500 hover:text-stone-700"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {(isAdminUser || !lot.status || lot.status === 'Raw') && (
                          <button 
                            onClick={() => handleEditClick(lot)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit Purchase"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {isAdminUser && (
                          <button
                            onClick={() => handleDeleteClick(lot.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Delete Purchase"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        
        {lastDoc && (
          <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-center">
            <button 
              onClick={() => fetchData(false)}
              disabled={loadingMore}
              className="flex items-center space-x-2 px-6 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
            >
              <DownloadCloud className="w-4 h-4 text-blue-600" />
              <span>{loadingMore ? 'Loading...' : 'Load More Lots'}</span>
            </button>
          </div>
        )}
      </div>

      {viewingLot && (
        <LotDetailsModal 
          lot={viewingLot} 
          supplierName={suppliers.find(s => s.id === viewingLot.supplierId)?.name || viewingLot.supplierId}
          showFinancials={showFinancials}
          onClose={() => setViewingLot(null)} 
        />
      )}
    </div>
  );
}
