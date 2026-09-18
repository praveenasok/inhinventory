import React, { useState, useEffect } from 'react';
import { getCollection, setDocument, deleteDocument, getDocument, updateDocument } from '../services/db';
import { Search, Archive, ArrowRight, Package, Droplets, Trash2, Scissors, Circle, HelpCircle, FlaskConical, RefreshCw, Edit2, X, Maximize2, ArrowRightLeft } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Inventory() {
  const { permissions } = useAuth();
  const isAdmin = permissions?.financials; // using financials as proxy for high level admin
  const showFinancials = permissions?.financials;

  const [searchParams] = useSearchParams();
  const initialLotId = searchParams.get('lotId');

  const [inventory, setInventory] = useState([]);
  const [workrooms, setWorkrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Row Expand State for Length Traceability
  const [expandedRow, setExpandedRow] = useState(null);
  const [rowTraceData, setRowTraceData] = useState(null);
  const [rowTraceLoading, setRowTraceLoading] = useState(false);

  // Edit Inventory State
  const [editingInventoryItem, setEditingInventoryItem] = useState(null);
  const [editInvForm, setEditInvForm] = useState({ quantityAvailable: 0, totalValue: 0, workroomId: '', date: '', comment: '' });
  const [viewingMultiplierTable, setViewingMultiplierTable] = useState(null);

  // Filter and Selection State
  const [activeTab, setActiveTab] = useState('overall'); // 'overall' or 'location'
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProduct, setFilterProduct] = useState('All');
  const [filterWorkroom, setFilterWorkroom] = useState('All');

  // Bulk Assign State
  const [bulkAssignWorkroomId, setBulkAssignWorkroomId] = useState('');

  // Transfer Stock State
  const [transferringItem, setTransferringItem] = useState(null);
  const [transferForm, setTransferForm] = useState({ targetWorkroomId: '', quantity: 0, date: '', comment: '' });

  const handleExpandView = (data) => {
    const id = Date.now().toString();
    localStorage.setItem(`trace_${id}`, JSON.stringify(data));
    localStorage.setItem(`trace_${id}_financials`, JSON.stringify(showFinancials));
    window.open(`/trace-viewer?id=${id}`, '_blank', 'width=1200,height=800,scrollbars=yes');
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const [invData, workroomsData] = await Promise.all([
        getCollection('inventory'),
        getCollection('workrooms')
      ]);
      // Sort by length numerically
      invData.sort((a, b) => (a.length || 0) - (b.length || 0));
      setInventory(invData);
      setWorkrooms(workroomsData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!window.confirm("This will completely rebuild your length-based inventory by recalculating all past Processing events. Proceed?")) {
      return;
    }
    
    setLoading(true);
    try {
      // 1. Fetch all inventory and delete them concurrently
      const currentInv = await getCollection('inventory');
      await Promise.all(currentInv.map(item => deleteDocument('inventory', item.id)));
      
      // 2. Fetch all transformations and sum length-based products
      const transformations = await getCollection('transformations');
      const lengthTrans = transformations.filter(t => t.targetProduct === 'INHNR1x1' || t.targetProduct === 'INHMR1x1');
      
      const newStock = {}; // product_length -> { product, length, weight, totalValue }
      
      for (const t of lengthTrans) {
        if (!t.outputs) continue;
        for (const out of t.outputs) {
          const workroomIdStr = out.workroomId || 'unassigned';
          const key = `${t.targetProduct}_${out.length}_${workroomIdStr}`;
          if (!newStock[key]) {
            newStock[key] = { product: t.targetProduct, length: Number(out.length), workroomId: out.workroomId || null, weight: 0, totalValue: 0 };
          }
          
          const weightRatio = out.weight > 0 ? (out.weight / (t.totalOutput || 1)) : 1;
          const rate = out.rate !== undefined ? out.rate : ((t.effectiveCostPerKg / weightRatio) / 100);
          const value = out.weight * rate;
          
          newStock[key].weight += Number(out.weight);
          newStock[key].totalValue += value;
        }
      }
      
      // 3. Write back to inventory concurrently
      const writePromises = Object.entries(newStock).map(([key, data]) => {
        const workroomIdStr = data.workroomId || 'unassigned';
        return setDocument('inventory', `${data.product}-${data.length}-${workroomIdStr}`, {
          product: data.product,
          length: data.length,
          workroomId: data.workroomId,
          quantityAvailable: data.weight,
          totalValue: data.totalValue,
          averageRate: data.weight > 0 ? (data.totalValue / data.weight) : 0
        });
      });
      await Promise.all(writePromises);
      
      alert("Inventory has been successfully synced with pipeline history.");
      fetchInventory();
    } catch (error) {
      console.error(error);
      alert("An error occurred while reconciling.");
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = async (item) => {
    if (expandedRow === item.id) {
      setExpandedRow(null);
      return;
    }

    setExpandedRow(item.id);
    setRowTraceLoading(true);
    setRowTraceData(null);

    const targetLength = item.length;
    const targetProduct = item.product;

    try {
      // Find all transformations that output this product from the server
      const transformations = await getCollection('transformations', [['targetProduct', '==', targetProduct]]);
      
      const relatedTransformations = transformations.filter(t => 
        t.outputs && t.outputs.some(o => Number(o.length) === Number(targetLength))
      ).sort((a, b) => (b.processedAt?.seconds || 0) - (a.processedAt?.seconds || 0));

      // Fetch the parent lots and multiplier tables
      const allLots = await getCollection('lots');
      const allMultiplierTables = await getCollection('multiplier_tables');
      
      const detailedSteps = relatedTransformations.map(t => {
        const originLot = allLots.find(l => l.id === t.inputLotId);
        const multiplierTable = originLot?.multiplierTableId 
          ? allMultiplierTables.find(mt => mt.id === originLot.multiplierTableId) 
          : null;
        
        const matchingOutputs = t.outputs.filter(o => Number(o.length) === Number(targetLength));
        const contributedWeight = matchingOutputs.reduce((sum, o) => sum + o.weight, 0);
        
        let rate = 0;
        if (matchingOutputs.length > 0) {
            const out = matchingOutputs[0];
            const weightRatio = out.weight > 0 ? (out.weight / (t.totalOutput || 1)) : 1;
            rate = out.rate !== undefined ? out.rate : ((t.effectiveCostPerKg / weightRatio) / 100);
        }
        
        return {
          type: 'transformation',
          transformation: t,
          originLot,
          multiplierTable,
          contributedWeight,
          rate,
          date: t.processedAt
        };
      });

      const stockTransfers = await getCollection('stock_transfers', [
        ['productId', '==', targetProduct],
        ['length', '==', targetLength]
      ]);

      const transferSteps = stockTransfers.map(st => {
        return {
          type: 'transfer',
          transfer: st,
          date: st.timestamp
        };
      });

      const allSteps = [...detailedSteps, ...transferSteps]
        .filter(step => {
          if (step.type === 'transfer') return true;
          const lotId = step.originLot?.id || step.transformation?.inputLotId || '';
          const isArchived = lotId.startsWith('LOT-') && !lotId.includes('-FANCY-') && !lotId.includes('-GOLI-');
          return !isArchived;
        })
        .sort((a, b) => 
          (b.date?.seconds || 0) - (a.date?.seconds || 0)
        );

      setRowTraceData({
        type: 'length',
        length: targetLength,
        product: targetProduct,
        steps: allSteps
      });

    } catch (error) {
      console.error(error);
      setRowTraceData({ error: 'An error occurred tracing this length.' });
    } finally {
      setRowTraceLoading(false);
    }
  };

  const handleEditInvClick = (e, item) => {
    e.stopPropagation(); 
    setEditingInventoryItem(item);
    setEditInvForm({
      quantityAvailable: item.quantityAvailable || 0,
      totalValue: item.totalValue || 0,
      workroomId: item.workroomId || '',
      date: new Date().toISOString().substring(0, 10),
      comment: item.comment || ''
    });
  };

  const handleEditInvSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const qty = Number(editInvForm.quantityAvailable);
      const val = Number(editInvForm.totalValue);
      const newWorkroomId = editInvForm.workroomId || null;
      
      const workroomIdStr = newWorkroomId || 'unassigned';
      const newId = `${editingInventoryItem.product}-${editingInventoryItem.length}-${workroomIdStr}`;
      
      if (newId !== editingInventoryItem.id) {
        const existingDoc = await getDocument('inventory', newId);
        if (existingDoc) {
          const newTotalValue = (existingDoc.totalValue || 0) + val;
          const newQuantity = (existingDoc.quantityAvailable || 0) + qty;
          await updateDocument('inventory', newId, {
            quantityAvailable: newQuantity,
            totalValue: newTotalValue,
            averageRate: newQuantity > 0 ? newTotalValue / newQuantity : 0
          });
        } else {
          await setDocument('inventory', newId, {
            product: editingInventoryItem.product,
            length: editingInventoryItem.length,
            workroomId: newWorkroomId,
            quantityAvailable: qty,
            totalValue: val,
            averageRate: qty > 0 ? val / qty : 0,
            comment: editInvForm.comment,
            lastEditedAt: editInvForm.date
          });
        }
        await deleteDocument('inventory', editingInventoryItem.id);
      } else {
        await updateDocument('inventory', editingInventoryItem.id, {
          quantityAvailable: qty,
          totalValue: val,
          averageRate: qty > 0 ? val / qty : 0,
          comment: editInvForm.comment,
          lastEditedAt: editInvForm.date
        });
      }
      
      setEditingInventoryItem(null);
      fetchInventory();
    } catch (error) {
      console.error(error);
      alert("Failed to update inventory.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedItemIds.size === 0 || bulkAssignWorkroomId === '') return;
    if (window.confirm(`Are you sure you want to assign ${selectedItemIds.size} items to this location?`)) {
      setLoading(true);
      try {
        const targetWorkroomStr = bulkAssignWorkroomId === 'unassigned' ? 'unassigned' : bulkAssignWorkroomId;
        
        for (const id of selectedItemIds) {
          const item = inventory.find(i => i.id === id);
          if (!item) continue;
          
          const newId = `${item.product}-${item.length}-${targetWorkroomStr}`;
          
          if (newId !== id) {
            const existingDoc = await getDocument('inventory', newId);
            if (existingDoc) {
              const newTotalValue = (existingDoc.totalValue || 0) + (item.totalValue || 0);
              const newQuantity = (existingDoc.quantityAvailable || 0) + (item.quantityAvailable || 0);
              await updateDocument('inventory', newId, {
                quantityAvailable: newQuantity,
                totalValue: newTotalValue,
                averageRate: newQuantity > 0 ? newTotalValue / newQuantity : 0
              });
            } else {
              await setDocument('inventory', newId, {
                product: item.product,
                length: item.length,
                workroomId: bulkAssignWorkroomId === 'unassigned' ? null : bulkAssignWorkroomId,
                quantityAvailable: item.quantityAvailable || 0,
                totalValue: item.totalValue || 0,
                averageRate: item.averageRate || 0
              });
            }
            await deleteDocument('inventory', id);
          }
        }
        setSelectedItemIds(new Set());
        setBulkAssignWorkroomId('');
        fetchInventory();
      } catch (error) {
        console.error("Bulk assign error:", error);
        alert("Failed to assign some items.");
        setLoading(false);
      }
    }
  };

  const handleTransferClick = (e, item) => {
    e.stopPropagation();
    setTransferringItem(item);
    setTransferForm({
      targetWorkroomId: '',
      quantity: item.quantityAvailable || 0,
      date: new Date().toISOString().substring(0, 10),
      comment: ''
    });
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    
    const qtyToTransfer = Number(transferForm.quantity);
    if (qtyToTransfer <= 0 || qtyToTransfer > (transferringItem.quantityAvailable || 0)) {
      alert("Invalid transfer quantity.");
      return;
    }
    
    const targetWorkroomStr = transferForm.targetWorkroomId || 'unassigned';
    const newId = `${transferringItem.product}-${transferringItem.length}-${targetWorkroomStr}`;
    
    if (newId === transferringItem.id) {
      alert("Cannot transfer to the same location.");
      return;
    }
    
    setLoading(true);
    try {
      const avgRate = transferringItem.averageRate || 0;
      const valToTransfer = qtyToTransfer * avgRate;
      
      // Update destination document
      const existingDoc = await getDocument('inventory', newId);
      if (existingDoc) {
        const newTotalValue = (existingDoc.totalValue || 0) + valToTransfer;
        const newQuantity = (existingDoc.quantityAvailable || 0) + qtyToTransfer;
        await updateDocument('inventory', newId, {
          quantityAvailable: newQuantity,
          totalValue: newTotalValue,
          averageRate: newQuantity > 0 ? newTotalValue / newQuantity : 0
        });
      } else {
        await setDocument('inventory', newId, {
          product: transferringItem.product,
          length: transferringItem.length,
          workroomId: transferForm.targetWorkroomId === 'unassigned' ? null : transferForm.targetWorkroomId,
          quantityAvailable: qtyToTransfer,
          totalValue: valToTransfer,
          averageRate: avgRate,
          comment: transferForm.comment,
          lastTransferredAt: transferForm.date
        });
      }
      
      // Update or delete source document
      const remainingQty = (transferringItem.quantityAvailable || 0) - qtyToTransfer;
      if (remainingQty <= 0.001) { // Floating point safety
        await deleteDocument('inventory', transferringItem.id);
      } else {
        const remainingVal = remainingQty * avgRate;
        await updateDocument('inventory', transferringItem.id, {
          quantityAvailable: remainingQty,
          totalValue: remainingVal
        });
      }
      
      setTransferringItem(null);
      fetchInventory();
    } catch (error) {
      console.error(error);
      alert("Failed to transfer stock.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItemIds.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedItemIds.size} selected items?`)) {
      setLoading(true);
      try {
        for (const id of selectedItemIds) {
          await deleteDocument('inventory', id);
        }
        setSelectedItemIds(new Set());
        fetchInventory();
      } catch (error) {
        console.error("Bulk delete error:", error);
        alert("Failed to delete some items.");
        setLoading(false);
      }
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItemIds(new Set(processedInventory.map(i => i.id)));
    } else {
      setSelectedItemIds(new Set());
    }
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    const newSelected = new Set(selectedItemIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItemIds(newSelected);
  };

  const uniqueProducts = [...new Set(inventory.map(item => item.product))].sort();

  const getProcessedInventory = () => {
    let filtered = inventory.filter(item => {
      const searchStr = `${item.product} ${item.length}`.toLowerCase();
      const matchesSearch = searchStr.includes(searchQuery.toLowerCase());
      const matchesProduct = filterProduct === 'All' || item.product === filterProduct;
      const matchesWorkroom = filterWorkroom === 'All' || (item.workroomId || 'unassigned') === filterWorkroom;
      return matchesSearch && matchesProduct && matchesWorkroom;
    });
    return filtered;
  };

  const processedInventory = getProcessedInventory();

  const consolidatedInventory = React.useMemo(() => {
    const grouped = {};
    processedInventory.forEach(item => {
      const key = `${item.product}-${item.length}`;
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          product: item.product,
          length: item.length,
          quantityAvailable: 0,
          totalValue: 0,
          locationsCount: 0
        };
      }
      grouped[key].quantityAvailable += (item.quantityAvailable || 0);
      grouped[key].totalValue += (item.totalValue || 0);
      grouped[key].locationsCount += 1;
    });

    return Object.values(grouped).map(group => ({
      ...group,
      averageRate: group.quantityAvailable > 0 ? (group.totalValue / group.quantityAvailable) : 0
    }));
  }, [processedInventory]);

  const totals = processedInventory.reduce((acc, item) => {
    acc.weight += (item.quantityAvailable || 0);
    acc.value += (item.totalValue || 0);
    return acc;
  }, { weight: 0, value: 0 });

  const getColSpan = () => {
    let base = 4; // Product, Location(s), Length, Weight
    if (showFinancials) base += 2; // Rate, Value
    if (activeTab === 'location' && isAdmin) base += 2; // Checkbox, Actions
    return base.toString();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finished Goods</h1>
          <p className="text-sm text-gray-500 mt-1">
            Total Finished Goods Weight: <span className="font-bold text-blue-700">{totals.weight.toFixed(2)} Kg</span>
            {showFinancials && (
              <span className="ml-2 border-l pl-2 border-gray-300">
                Value: <span className="font-bold text-green-700">₹{totals.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between gap-4 items-center">
        <div className="flex w-full md:w-auto gap-4 flex-1">
          <input 
            type="text" 
            placeholder="Search product or length..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 max-w-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
          />
          <select 
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
          >
            <option value="All">All Products</option>
            {uniqueProducts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select 
            value={filterWorkroom}
            onChange={(e) => setFilterWorkroom(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
          >
            <option value="All">All Locations</option>
            {workrooms.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
        <div className="flex w-full md:w-auto items-center justify-end gap-3 flex-wrap">
          {isAdmin && selectedItemIds.size > 0 && (
            <>
              <div className="flex items-center space-x-2 mr-2 bg-gray-50 p-1.5 rounded-md border border-gray-200">
                <select
                  value={bulkAssignWorkroomId}
                  onChange={(e) => setBulkAssignWorkroomId(e.target.value)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1.5 border"
                >
                  <option value="" disabled>Select location...</option>
                  {workrooms.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
                <button
                  onClick={handleBulkAssign}
                  disabled={bulkAssignWorkroomId === ''}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Apply Location
                </button>
              </div>
              <button
                onClick={handleBulkDelete}
                className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Selected ({selectedItemIds.size})</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div>
      <div className="w-full">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center space-x-2">
                  <Package className="w-5 h-5 text-gray-500" />
                  <span>Length-Based Available Stock</span>
                </h2>
                <div className="flex bg-white rounded-lg p-1 border border-gray-200 w-fit">
                  <button
                    onClick={() => setActiveTab('overall')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'overall' 
                        ? 'bg-blue-100 text-blue-700 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Overall Stock
                  </button>
                  <button
                    onClick={() => setActiveTab('location')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'location' 
                        ? 'bg-blue-100 text-blue-700 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Location-wise Stock
                  </button>
                </div>
              </div>
            <div className="flex items-center space-x-4">
              {isAdmin && (
                <button 
                  onClick={handleReconcile}
                  className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center space-x-1"
                  title="Recalculate stock from processing history"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Sync DB</span>
                </button>
              )}
              <button 
                onClick={fetchInventory}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
            
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-white">
              <tr>
                {isAdmin && activeTab === 'location' && (
                  <th className="px-6 py-3 text-left w-10">
                    <input 
                      type="checkbox" 
                      checked={processedInventory.length > 0 && selectedItemIds.size === processedInventory.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {activeTab === 'location' ? 'Location' : 'Locations'}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Length (Inches)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Available Weight (Kg)</th>
                {showFinancials && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Average Rate (₹)</th>}
                {showFinancials && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Average Value (₹)</th>}
                {isAdmin && activeTab === 'location' && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={getColSpan()} className="px-6 py-4 text-center text-gray-500">Loading inventory...</td>
                  </tr>
                ) : (activeTab === 'overall' ? consolidatedInventory : processedInventory).length === 0 ? (
                  <tr>
                    <td colSpan={getColSpan()} className="px-6 py-4 text-center text-gray-500">No finished goods in stock.</td>
                  </tr>
                ) : (
                  (activeTab === 'overall' ? consolidatedInventory : processedInventory).map((item) => (
                    <React.Fragment key={item.id}>
                      <tr 
                        className={`hover:bg-blue-50 cursor-pointer transition-colors ${expandedRow === item.id || selectedItemIds.has(item.id) ? 'bg-blue-50' : ''}`}
                        onClick={() => handleRowClick(item)}
                        title="Click to trace production history for this length"
                      >
                        {isAdmin && activeTab === 'location' && (
                          <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={selectedItemIds.has(item.id)}
                              onChange={(e) => toggleSelect(item.id, e)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{item.product}</div>
                          {item.comment && activeTab === 'location' && <div className="text-xs font-normal text-gray-500 mt-1 whitespace-normal break-words max-w-[200px]">{item.comment}</div>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {activeTab === 'location' 
                            ? (workrooms.find(w => w.id === item.workroomId)?.code || 'Unassigned')
                            : `${item.locationsCount} Location${item.locationsCount > 1 ? 's' : ''}`
                          }
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold text-center">
                          {item.length}"
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-blue-600">
                          {item.quantityAvailable?.toFixed(2)} Kg
                        </td>
                        {showFinancials && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                            ₹{(item.averageRate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Kg
                          </td>
                        )}
                        {showFinancials && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold text-right">
                            ₹{(item.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        )}
                        {isAdmin && activeTab === 'location' && (
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-4 w-full">
                              <button 
                                onClick={(e) => handleTransferClick(e, item)}
                                className="text-purple-600 hover:text-purple-900 transition-colors"
                                title="Transfer Stock"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => handleEditInvClick(e, item)}
                                className="text-blue-600 hover:text-blue-900 transition-colors"
                                title="Edit Inventory"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {expandedRow === item.id && (
                        <tr>
                          <td colSpan={getColSpan()} className="p-0 border-b border-gray-200">
                            <div className="bg-gray-50 p-6 overflow-hidden transition-all duration-300 ease-in-out shadow-inner">
                              {rowTraceLoading ? (
                                <p className="text-sm text-gray-500 text-center py-4">Tracing lineage...</p>
                              ) : rowTraceData?.error ? (
                                <p className="text-sm text-red-600 text-center py-4">{rowTraceData.error}</p>
                              ) : rowTraceData ? (
                                <div className="space-y-4">
                                  <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-sm font-semibold text-purple-800">Production History for {rowTraceData.product} {rowTraceData.length}"</h4>
                                    <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                                      {rowTraceData.steps.length} Events Found
                                    </span>
                                  </div>

                                  {rowTraceData.steps.length === 0 ? (
                                    <p className="text-xs text-gray-500 italic text-center py-4">No production history found for this length.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="flex justify-end">
                                        <button
                                          onClick={() => handleExpandView(rowTraceData)}
                                          className="text-xs flex items-center space-x-1 text-blue-600 hover:text-blue-800"
                                        >
                                          <Maximize2 className="w-3 h-3" />
                                          <span>Expand View</span>
                                        </button>
                                      </div>
                                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                                        <table className="min-w-full divide-y divide-gray-200">
                                          <thead className="bg-gray-100">
                                            <tr>
                                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Origin Lot</th>
                                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Input Material</th>
                                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Yield</th>
                                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Produced</th>
                                              {showFinancials && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Cost Rate</th>}
                                              {showFinancials && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Est. Value</th>}
                                            </tr>
                                          </thead>
                                          <tbody className="bg-white divide-y divide-gray-200">
                                            {rowTraceData.steps.map((step, idx) => {
                                              if (step.type === 'transfer') {
                                                return (
                                                  <tr key={idx} className="hover:bg-purple-50 relative bg-purple-50/20">
                                                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-900">
                                                      {step.date ? new Date(step.date.seconds * 1000).toLocaleDateString() : 'Unknown'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-xs text-purple-700" colSpan="2">
                                                      <div className="flex items-center gap-2">
                                                        <span className="font-semibold">Stock Transfer</span>
                                                        <span className="text-gray-500 font-normal">
                                                           ({step.transfer.sourceWorkroomId === 'unassigned' ? 'Unassigned' : step.transfer.sourceWorkroomId} → {step.transfer.targetWorkroomId === 'unassigned' ? 'Unassigned' : step.transfer.targetWorkroomId})
                                                        </span>
                                                      </div>
                                                      {step.transfer.moNumber && <div className="text-[10px] font-medium text-gray-600 mt-0.5">MO: {step.transfer.moNumber}</div>}
                                                      {step.transfer.comment && <div className="text-[10px] font-normal text-gray-500 mt-0.5 whitespace-normal break-words max-w-[250px]">{step.transfer.comment}</div>}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 text-right">-</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-purple-700 text-right">{step.transfer.quantity} Kg</td>
                                                    {showFinancials && <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 text-right">-</td>}
                                                    {showFinancials && <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 text-right">-</td>}
                                                  </tr>
                                                );
                                              }

                                              return (
                                                <tr key={idx} className="hover:bg-blue-50 relative">
                                                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-900">
                                                    {step.date ? new Date(step.date.seconds * 1000).toLocaleDateString() : 'Unknown'}
                                                  </td>
                                                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-900">
                                                    <div className="flex items-center space-x-2">
                                                      <div className="flex flex-col">
                                                        <span>{step.originLot?.id || step.transformation?.inputLotId}</span>
                                                        {step.originLot?.comment && <div className="text-[10px] font-normal text-gray-500 mt-0.5 whitespace-normal break-words max-w-[150px]">{step.originLot.comment}</div>}
                                                        {step.transformation?.comment && <div className="text-[10px] font-normal text-gray-500 mt-0.5 whitespace-normal break-words max-w-[150px]">{step.transformation.comment}</div>}
                                                      </div>
                                                      {step.originLot?.multiplierTableId && (
                                                        <button 
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (step.multiplierTable) setViewingMultiplierTable(step.multiplierTable);
                                                          }}
                                                          className="bg-purple-100 text-purple-800 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-purple-200 hover:bg-purple-200 hover:scale-105 transition-all" 
                                                          title="View Multiplying Factor Table"
                                                        >
                                                          MF
                                                        </button>
                                                      )}
                                                    </div>
                                                  </td>
                                                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                                                    {step.originLot?.materialType || (() => {
                                                      const lotId = step.originLot?.id || step.transformation?.inputLotId || '';
                                                      if (lotId.includes('-FANCY-')) return 'Fancy';
                                                      if (lotId.includes('-GOLI-')) return 'Segregated Goli';
                                                      if (lotId.startsWith('LOT-') && !lotId.includes('-FANCY-') && !lotId.includes('-GOLI-')) return 'Raw Material (Archived)';
                                                      return 'Unknown';
                                                    })()}
                                                  </td>
                                                  <td className="px-4 py-3 whitespace-nowrap text-xs text-green-600 font-medium text-right">{step.transformation?.yieldPercentage}%</td>
                                                  <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-blue-600 text-right">{step.contributedWeight} Kg</td>
                                                  {showFinancials && (
                                                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 text-right">
                                                      ₹{((typeof step.rate === 'number' ? step.rate : step.transformation?.effectiveCostPerKg) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Kg
                                                    </td>
                                                  )}
                                                  {showFinancials && (
                                                    <td className="px-4 py-3 whitespace-nowrap text-xs text-green-700 font-semibold text-right">
                                                      ₹{(step.contributedWeight * ((typeof step.rate === 'number' ? step.rate : step.transformation?.effectiveCostPerKg) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                  )}
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Edit Inventory Modal */}
      {editingInventoryItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Edit {editingInventoryItem.product} {editingInventoryItem.length}"
              </h3>
              <button onClick={() => setEditingInventoryItem(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditInvSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Available (Kg)</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  value={editInvForm.quantityAvailable}
                  onChange={(e) => setEditInvForm({...editInvForm, quantityAvailable: e.target.value})}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={editInvForm.workroomId}
                  onChange={(e) => setEditInvForm({...editInvForm, workroomId: e.target.value})}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                >
                  <option value="">Unassigned</option>
                  {workrooms.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              
              {showFinancials && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Value (₹)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={editInvForm.totalValue}
                    onChange={(e) => setEditInvForm({...editInvForm, totalValue: e.target.value})}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="date" 
                  value={editInvForm.date}
                  onChange={(e) => setEditInvForm({...editInvForm, date: e.target.value})}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
                <textarea 
                  rows="2"
                  value={editInvForm.comment}
                  onChange={(e) => setEditInvForm({...editInvForm, comment: e.target.value})}
                  placeholder="Optional details..."
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                ></textarea>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setEditingInventoryItem(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Transfer Stock Modal */}
      {transferringItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Transfer {transferringItem.product} {transferringItem.length}"
              </h3>
              <button onClick={() => setTransferringItem(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">From Location</label>
                <div className="p-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
                  {workrooms.find(w => w.id === transferringItem.workroomId)?.name || 'Unassigned'}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Location</label>
                <select
                  required
                  value={transferForm.targetWorkroomId}
                  onChange={(e) => setTransferForm({...transferForm, targetWorkroomId: e.target.value})}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                >
                  <option value="" disabled>Select destination...</option>
                  {workrooms.filter(w => w.id !== transferringItem.workroomId).map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  {transferringItem.workroomId && <option value="unassigned">Unassigned</option>}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity to Transfer (Max: {transferringItem.quantityAvailable?.toFixed(2)} Kg)
                </label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  max={transferringItem.quantityAvailable}
                  value={transferForm.quantity}
                  onChange={(e) => setTransferForm({...transferForm, quantity: e.target.value})}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="date" 
                  value={transferForm.date}
                  onChange={(e) => setTransferForm({...transferForm, date: e.target.value})}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
                <textarea 
                  rows="2"
                  value={transferForm.comment}
                  onChange={(e) => setTransferForm({...transferForm, comment: e.target.value})}
                  placeholder="Optional details..."
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                ></textarea>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setTransferringItem(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md disabled:opacity-50"
                >
                  {loading ? 'Transferring...' : 'Transfer Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingMultiplierTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-0.5 rounded border border-purple-200">MF</span>
                {viewingMultiplierTable.name}
              </h3>
              <button
                onClick={() => setViewingMultiplierTable(null)}
                className="text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-stone-500 mb-4">
                This table was applied to the origin lot to determine the cost allocation based on length.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(viewingMultiplierTable.factors || {})
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([length, factor]) => (
                    <div key={length} className="flex justify-between items-center bg-stone-50 px-3 py-2 rounded-lg border border-stone-100">
                      <span className="font-semibold text-stone-700">{length}"</span>
                      <span className="text-purple-600 font-bold">{Number(factor).toFixed(2)}x</span>
                    </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-end">
              <button
                onClick={() => setViewingMultiplierTable(null)}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-medium text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
