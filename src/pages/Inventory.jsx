import React, { useState, useEffect } from 'react';
import { getCollection, setDocument, deleteDocument, getDocument, updateDocument } from '../services/db';
import { Search, Archive, ArrowRight, Package, Droplets, Trash2, Scissors, Circle, HelpCircle, FlaskConical, RefreshCw, Edit2, X, Maximize2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Inventory() {
  const { permissions } = useAuth();
  const isAdmin = permissions?.financials; // using financials as proxy for high level admin
  const showFinancials = permissions?.financials;

  const [searchParams] = useSearchParams();
  const initialLotId = searchParams.get('lotId');

  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Row Expand State for Length Traceability
  const [expandedRow, setExpandedRow] = useState(null);
  const [rowTraceData, setRowTraceData] = useState(null);
  const [rowTraceLoading, setRowTraceLoading] = useState(false);

  // Edit Inventory State
  const [editingInventoryItem, setEditingInventoryItem] = useState(null);
  const [editInvForm, setEditInvForm] = useState({ quantityAvailable: 0, totalValue: 0 });
  const [viewingMultiplierTable, setViewingMultiplierTable] = useState(null);

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
      const invData = await getCollection('inventory');
      // Sort by length numerically
      invData.sort((a, b) => (a.length || 0) - (b.length || 0));
      setInventory(invData);
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
          const key = `${t.targetProduct}_${out.length}`;
          if (!newStock[key]) {
            newStock[key] = { product: t.targetProduct, length: Number(out.length), weight: 0, totalValue: 0 };
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
        return setDocument('inventory', `${data.product}-${data.length}`, {
          product: data.product,
          length: data.length,
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
      // Find all transformations that output this length
      const transformations = await getCollection('transformations');
      
      const relatedTransformations = transformations.filter(t => 
        t.outputs && t.outputs.some(o => Number(o.length) === Number(targetLength)) && t.targetProduct === targetProduct
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

      const allSteps = detailedSteps.sort((a, b) => 
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
      totalValue: item.totalValue || 0
    });
  };

  const handleEditInvSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const qty = Number(editInvForm.quantityAvailable);
      const val = Number(editInvForm.totalValue);
      
      await updateDocument('inventory', editingInventoryItem.id, {
        quantityAvailable: qty,
        totalValue: val,
        averageRate: qty > 0 ? val / qty : 0
      });
      
      setEditingInventoryItem(null);
      fetchInventory();
    } catch (error) {
      console.error(error);
      alert("Failed to update inventory.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Finished Goods</h1>
      </div>

      <div>
      <div className="w-full">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center space-x-2">
              <Package className="w-5 h-5 text-gray-500" />
              <span>Length-Based Available Stock</span>
            </h2>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Length (Inches)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Available Weight (Kg)</th>
                {showFinancials && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Average Rate (₹)</th>}
                {showFinancials && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Average Value (₹)</th>}
                {isAdmin && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={showFinancials ? (isAdmin ? "6" : "5") : (isAdmin ? "4" : "3")} className="px-6 py-4 text-center text-gray-500">Loading inventory...</td>
                  </tr>
                ) : inventory.length === 0 ? (
                  <tr>
                    <td colSpan={showFinancials ? (isAdmin ? "6" : "5") : (isAdmin ? "4" : "3")} className="px-6 py-4 text-center text-gray-500">No finished goods in stock.</td>
                  </tr>
                ) : (
                  inventory.map((item) => (
                    <React.Fragment key={item.id}>
                      <tr 
                        className={`hover:bg-blue-50 cursor-pointer transition-colors ${expandedRow === item.id ? 'bg-blue-50' : ''}`}
                        onClick={() => handleRowClick(item)}
                        title="Click to trace production history for this length"
                      >
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{item.product}</td>
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
                        {isAdmin && (
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button 
                              onClick={(e) => handleEditInvClick(e, item)}
                              className="text-blue-600 hover:text-blue-900 flex items-center justify-end w-full"
                              title="Edit Inventory"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                      {expandedRow === item.id && (
                        <tr>
                          <td colSpan={showFinancials ? (isAdmin ? "6" : "5") : (isAdmin ? "4" : "3")} className="p-0 border-b border-gray-200">
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
                                            {rowTraceData.steps.map((step, idx) => (
                                              <tr key={idx} className="hover:bg-blue-50 relative">
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-900">
                                                  {step.date ? new Date(step.date.seconds * 1000).toLocaleDateString() : 'Unknown'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-900">
                                                  <div className="flex items-center space-x-2">
                                                    <span>{step.originLot?.id || step.transformation.inputLotId}</span>
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
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">{step.originLot?.materialType || 'Unknown'}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-green-600 font-medium text-right">{step.transformation.yieldPercentage}%</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-blue-600 text-right">{step.contributedWeight} Kg</td>
                                                {showFinancials && (
                                                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 text-right">
                                                    ₹{((typeof step.rate === 'number' ? step.rate : step.transformation.effectiveCostPerKg) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Kg
                                                  </td>
                                                )}
                                                {showFinancials && (
                                                  <td className="px-4 py-3 whitespace-nowrap text-xs text-green-700 font-semibold text-right">
                                                    ₹{(step.contributedWeight * ((typeof step.rate === 'number' ? step.rate : step.transformation.effectiveCostPerKg) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                  </td>
                                                )}
                                              </tr>
                                            ))}
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
