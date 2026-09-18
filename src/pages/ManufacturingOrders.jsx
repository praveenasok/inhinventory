import React, { useState, useEffect } from 'react';
import { getCollection, addDocument, getRatioMixes, updateDocument, deleteDocument } from '../services/db';
import { ClipboardList, Shield, CheckCircle2, AlertTriangle, Package, Scissors, DollarSign, Plus, Trash2, ArrowRight, Play, Check, ArrowLeft, Loader2, Save, Calculator, Printer, Pen, X, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/firebase';

const WastageInput = ({ label, value, onChange, readonly, unit = 'g', usdValue }) => (
  <div className="flex items-center justify-between text-sm py-1 gap-2">
    <div className="flex items-center">
      <span className="text-stone-600 font-medium truncate">{label}</span>
      {usdValue !== undefined && <span className="text-stone-400 text-xs ml-1 font-normal">(${usdValue.toFixed(2)})</span>}
    </div>
    <div className="flex items-center gap-1.5">
      <input 
        type="number" min="0" step="any" 
        value={value ?? ''} 
        onChange={(e) => onChange(e.target.value)} 
        disabled={readonly}
        className={`w-20 px-2 py-1 text-right bg-white border border-stone-200 rounded focus:ring-1 focus:ring-amber-500 ${readonly ? 'bg-stone-50 text-stone-500 cursor-not-allowed' : ''}`} 
      />
      {unit && <span className="text-stone-400 text-xs w-4">{unit}</span>}
    </div>
  </div>
);

export default function ManufacturingOrders() {
  const { permissions, isAdminUser } = useAuth();
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Data
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [externalRatios, setExternalRatios] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [workrooms, setWorkrooms] = useState([]);

  // Views: 'list', 'plan', 'execute'
  const [view, setView] = useState('list');
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Planning Form State
  const [draftLines, setDraftLines] = useState([
    { id: Math.random().toString(36).substr(2, 9), productId: '', targetLength: '', orderQuantity: 1, totalHairWeight: '' }
  ]);
  const [calculatedLines, setCalculatedLines] = useState(null); // Will hold the result of calculation
  const [moWorkroomId, setMoWorkroomId] = useState('');

  // Execution Form State
  const [actuals, setActuals] = useState({});
  const [exchangeRate, setExchangeRate] = useState(84.00);
  const [moDate, setMoDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [moComments, setMoComments] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editOrderData, setEditOrderData] = useState({ id: '', moNumber: '', date: '', comments: '', exchangeRate: 84 });
  const [editingMoNumber, setEditingMoNumber] = useState(null);
  const [editingMoData, setEditingMoData] = useState(null);

  const hasAccess = isAdminUser || permissions?.modules?.processing;

  useEffect(() => {
    fetch('https://api.exchangerate-api.com/v4/latest/USD')
      .then(res => res.json())
      .then(data => {
        if (data && data.rates && data.rates.INR) {
          setExchangeRate(data.rates.INR);
        }
      })
      .catch(e => console.error('Failed to fetch exchange rate', e));
  }, []);

  useEffect(() => {
    if (!hasAccess) return;
    fetchData();
  }, [hasAccess]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fpData, ratiosData, invData, transData, ordersData, workroomsData] = await Promise.all([
        getCollection('finished_products'),
        getRatioMixes(),
        getCollection('inventory'),
        getCollection('transformations'),
        getCollection('manufacturing_orders'),
        getCollection('workrooms')
      ]);
      setFinishedProducts(fpData.sort((a,b) => a.name.localeCompare(b.name)));
      setExternalRatios(ratiosData);
      setInventory(invData);
      setTransformations(transData);
      setOrders(ordersData.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setWorkrooms(workroomsData);
    } catch (e) {
      console.error(e);
      setError("Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  };

  // --- CALCULATION LOGIC ---
  const calculateLineRequirements = (product, targetLength, totalHairWeight, orderQuantity) => {
    if (!product || !targetLength || !totalHairWeight) return null;

    const lengthStr = targetLength.toString();
    const weightBase = Number(totalHairWeight);
    const wastage = Number(product.wastagePercentage || 0) / 100;

    let rawMaterialReqs = [];
    let bomReqs = [];
    let canExecute = true;

    if (product.ratios && product.ratios.length > 0) {
      product.ratios.forEach(ratioName => {
        const ratioDef = externalRatios.find(r => r.name === ratioName);
        if (ratioDef && ratioDef.matrix && ratioDef.matrix[lengthStr]) {
          const mixes = ratioDef.matrix[lengthStr];
          
          const materialsToUse = (product.rawMaterials && product.rawMaterials.length > 0) 
            ? product.rawMaterials 
            : ["Unknown Material"];
          const materialSplitFactor = 1 / materialsToUse.length;

          Object.entries(mixes).forEach(([reqLengthStr, percentage]) => {
            if (percentage > 0) {
              materialsToUse.forEach(materialName => {
                const baseReq = weightBase * (percentage / 100) * materialSplitFactor;
                const grossReq = baseReq * (1 + wastage);
                
                const invItem = inventory.find(i => i.product === materialName && Number(i.length) === Number(reqLengthStr));
                const available = invItem ? ((invItem.quantityAvailable || 0) - (invItem.quantityBlocked || 0)) : 0;
                const rate = invItem ? (invItem.averageRate || 0) : 0;
                
                if (available < grossReq) canExecute = false;

                rawMaterialReqs.push({
                  materialName,
                  length: reqLengthStr,
                  percentage: percentage * materialSplitFactor,
                  netRequired: baseReq,
                  grossRequired: grossReq,
                  available,
                  isSufficient: available >= grossReq,
                  rate,
                  inventoryId: invItem ? invItem.id : null
                });
              });
            }
          });
        }
      });
    } else if (product.rawMaterials && product.rawMaterials.length > 0) {
      const splitPercentage = 100 / product.rawMaterials.length;
      product.rawMaterials.forEach(materialName => {
        const percentage = splitPercentage;
        const baseReq = weightBase * (percentage / 100);
        const grossReq = baseReq * (1 + wastage);
        
        const invItem = inventory.find(i => i.product === materialName && Number(i.length) === Number(lengthStr));
        const available = invItem ? ((invItem.quantityAvailable || 0) - (invItem.quantityBlocked || 0)) : 0;
        const rate = invItem ? (invItem.averageRate || 0) : 0;
        
        if (available < grossReq) canExecute = false;

        rawMaterialReqs.push({
          materialName,
          length: lengthStr,
          percentage,
          netRequired: baseReq,
          grossRequired: grossReq,
          available,
          isSufficient: available >= grossReq,
          rate,
          inventoryId: invItem ? invItem.id : null
        });
      });
    }

    if (product.bom && product.bom.length > 0) {
      product.bom.forEach(b => {
        bomReqs.push({
          name: b.name,
          qty: b.qty * Number(orderQuantity),
          totalPrice: b.price * b.qty * Number(orderQuantity)
        });
      });
    }

    const totalRawMaterialCost = rawMaterialReqs.reduce((sum, r) => sum + (r.grossRequired * r.rate), 0);
    const totalBomCost = bomReqs.reduce((sum, b) => sum + b.totalPrice, 0);
    const labor = Number(product.laborCost || 0) * Number(totalHairWeight || 0);
    const misc = Number(product.miscCost || 0) * Number(totalHairWeight || 0);
    const estimatedTotalCost = totalRawMaterialCost + totalBomCost + labor + misc;

    return {
      rawMaterialReqs,
      bomReqs,
      canExecute: canExecute && rawMaterialReqs.length > 0,
      totalRawMaterialCost,
      totalBomCost,
      labor,
      misc,
      estimatedTotalCost
    };
  };

  // --- ACTIONS ---
  const handleAddDraftLine = () => {
    setDraftLines([...draftLines, { id: Math.random().toString(36).substr(2, 9), productId: '', targetLength: '', orderQuantity: 1, totalHairWeight: '' }]);
    setCalculatedLines(null); // invalidate calculation
  };

  const handleRemoveDraftLine = (id) => {
    setDraftLines(draftLines.filter(l => l.id !== id));
    setCalculatedLines(null); // invalidate calculation
  };

  const updateDraftLine = (id, field, value) => {
    setDraftLines(draftLines.map(l => l.id === id ? { ...l, [field]: value } : l));
    setCalculatedLines(null); // invalidate calculation
  };

  const handleCalculatePlan = () => {
    // Validate
    const validLines = draftLines.filter(l => l.productId && l.targetLength && l.totalHairWeight);
    if (validLines.length === 0) {
      setError('Please fill in product details for at least one row.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    let hasErrors = false;
    const computed = validLines.map(line => {
      const product = finishedProducts.find(p => p.id === line.productId);
      const reqs = calculateLineRequirements(product, line.targetLength, line.totalHairWeight, line.orderQuantity);
      if (!reqs || reqs.rawMaterialReqs.length === 0) {
        hasErrors = true;
      }
      return {
        ...line,
        productName: product.name,
        wastagePercentage: Number(product.wastagePercentage || 0),
        reqs
      };
    });

    if (hasErrors) {
      setError('Some lines could not be calculated. Ensure a valid ratio matrix exists for those lengths.');
      setTimeout(() => setError(''), 4000);
      return;
    }

    setCalculatedLines(computed);
  };

  const handleApprovePlan = async () => {
    if (!calculatedLines || calculatedLines.length === 0) return;
    const allExecutable = calculatedLines.every(l => l.reqs.canExecute);
    if (!allExecutable) {
      if (!window.confirm('Some lines have insufficient materials. Continue and block available stock anyway?')) return;
    } else {
      if (!window.confirm('Approve this plan? This will block the required raw materials in inventory.')) return;
    }

    setActionLoading(true);
    try {
      // 1. Block Inventory
      if (editingMoData) {
        if (editingMoData.status === 'completed') {
          // Restore actual deducted amounts
          for (const line of editingMoData.lines) {
            const lineActuals = editingMoData.actuals?.[line.id] || { materials: {} };
            for (let i = 0; i < line.reqs.rawMaterialReqs.length; i++) {
              const mat = line.reqs.rawMaterialReqs[i];
              const actualUsedKg = lineActuals.materials?.[i] || 0;
              if (mat.inventoryId) {
                const invItem = inventory.find(inv => inv.id === mat.inventoryId);
                if (invItem) {
                  const newAvailable = (invItem.quantityAvailable || 0) + actualUsedKg;
                  const valueToAdd = actualUsedKg * (mat.rate || 0);
                  const newValue = (invItem.totalValue || 0) + valueToAdd;
                  await updateDocument('inventory', mat.inventoryId, {
                    quantityAvailable: newAvailable,
                    totalValue: newValue
                  });
                }
              }
            }
          }
        } else {
          // Revert blocked inventory
          for (const line of editingMoData.lines) {
            for (const mat of line.reqs.rawMaterialReqs) {
              if (mat.inventoryId) {
                const invItem = inventory.find(i => i.id === mat.inventoryId);
                if (invItem) {
                  const currentBlocked = invItem.quantityBlocked || 0;
                  await updateDocument('inventory', mat.inventoryId, {
                    quantityBlocked: Math.max(0, currentBlocked - mat.grossRequired)
                  });
                }
              }
            }
          }
        }
      }

      for (const line of calculatedLines) {
        for (const mat of line.reqs.rawMaterialReqs) {
          if (mat.inventoryId) {
            const invItem = inventory.find(i => i.id === mat.inventoryId);
            if (invItem) {
              const currentBlocked = invItem.quantityBlocked || 0;
              await updateDocument('inventory', mat.inventoryId, {
                quantityBlocked: currentBlocked + mat.grossRequired
              });
            }
          }
        }
      }

      const totalEstimatedCost = calculatedLines.reduce((sum, line) => sum + (line.reqs?.estimatedTotalCost || 0), 0);

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const moNumber = editingMoData ? editingMoData.moNumber : (editingMoNumber || `MO-${yyyy}${mm}${dd}-${random}`);

      const order = {
        moNumber,
        lines: calculatedLines,
        status: editingMoData ? (editingMoData.status === 'completed' ? 'executing' : editingMoData.status) : 'approved',
        createdAt: new Date(moDate + 'T12:00:00'),
        comments: moComments,
        workroomId: moWorkroomId,
        exchangeRate: exchangeRate,
        totalEstimatedCost
      };
      
      if (editingMoData && editingMoData.actuals) {
        order.actuals = editingMoData.actuals;
      }

      if (editingMoData) {
        await updateDocument('manufacturing_orders', editingMoData.id, order);
      } else {
        await addDocument('manufacturing_orders', order);
      }
      
      setSuccess(`Manufacturing order ${moNumber} saved successfully!`);
      setTimeout(() => setSuccess(''), 3000);
      setEditingMoNumber(null);
      setEditingMoData(null);
      
      setView('list');
      setDraftLines([{ id: Math.random().toString(36).substr(2, 9), productId: '', targetLength: '', orderQuantity: 1, totalHairWeight: '' }]);
      setCalculatedLines(null);
      setMoWorkroomId('');
      await fetchData();
    } catch (e) {
      console.error(e);
      setError('Error approving plan.');
    } finally {
      setActionLoading(false);
    }
  };

  const initExecution = (order) => {
    setSelectedOrder(order);
    if (order.exchangeRate) setExchangeRate(order.exchangeRate);
    
    // Initialize actuals if empty
    const newActuals = {};
    order.lines.forEach(line => {
      if (order.actuals && order.actuals[line.id]) {
        const dbLine = order.actuals[line.id];
        const uiLine = { ...dbLine, materials: {}, wastage: {} };
        if (dbLine.materials) {
          Object.keys(dbLine.materials).forEach(k => uiLine.materials[k] = parseFloat(((Number(dbLine.materials[k]) || 0) * 1000).toFixed(1)));
        }
        if (dbLine.wastage) {
          Object.keys(dbLine.wastage).forEach(k => uiLine.wastage[k] = parseFloat(((Number(dbLine.wastage[k]) || 0) * 1000).toFixed(1)));
        }
        newActuals[line.id] = uiLine;
      } else {
        const materials = {};
        line.reqs.rawMaterialReqs.forEach((mat, i) => {
          materials[i] = parseFloat((mat.grossRequired * 1000).toFixed(1)); // default to planned in grams
        });
        
        newActuals[line.id] = {
          materials,
          wastage: {
            moistureLoss: 0, handlingWastage: 0, shortHair: 0,
            rubberBands: 0, foreignMaterial: 0, adulterationSynthetics: 0, adulterationOil: 0
          },
          laborCost: line.reqs.labor,
          shippingCost: 0,
          miscCost: line.reqs.misc
        };
      }
    });
    setActuals(newActuals);
    setView('execute');
  };

  const handleUpdateActual = (lineId, field, subfield, value) => {
    const val = value; // Preserve string format for accurate typing of decimals
    setActuals(prev => {
      const lineData = { ...prev[lineId] };
      if (subfield !== null) {
        lineData[field] = { ...lineData[field], [subfield]: val };
      } else {
        lineData[field] = val;
      }
      return { ...prev, [lineId]: lineData };
    });
  };

  const handleSaveProgress = async () => {
    setActionLoading(true);
    
    try {
      const dbActuals = {};
      for (const line of selectedOrder.lines) {
        const lineActuals = actuals[line.id];
        
        // Convert UI state (grams) to DB state (Kg)
        const dbLineActuals = { ...lineActuals, materials: {}, wastage: {} };
        if (lineActuals.materials) {
          Object.keys(lineActuals.materials).forEach(k => dbLineActuals.materials[k] = (Number(lineActuals.materials[k]) || 0) / 1000);
        }
        if (lineActuals.wastage) {
          Object.keys(lineActuals.wastage).forEach(k => dbLineActuals.wastage[k] = (Number(lineActuals.wastage[k]) || 0) / 1000);
        }
        dbActuals[line.id] = dbLineActuals;
      }

      await updateDocument('manufacturing_orders', selectedOrder.id, {
        actuals: dbActuals,
        exchangeRate
      });

      setSuccess('Execution progress saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      console.error(e);
      setError('Error saving progress.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteExecution = async () => {
    if (!window.confirm('Are you sure you want to complete this order? This will finalize inventory deductions.')) return;
    setActionLoading(true);
    
    try {
      const dbActuals = {};
      // For each line, update inventory based on Actuals
      for (const line of selectedOrder.lines) {
        const lineActuals = actuals[line.id];
        
        // Convert UI state (grams) to DB state (Kg)
        const dbLineActuals = { ...lineActuals, materials: {}, wastage: {} };
        if (lineActuals.materials) {
          Object.keys(lineActuals.materials).forEach(k => dbLineActuals.materials[k] = (Number(lineActuals.materials[k]) || 0) / 1000);
        }
        if (lineActuals.wastage) {
          Object.keys(lineActuals.wastage).forEach(k => dbLineActuals.wastage[k] = (Number(lineActuals.wastage[k]) || 0) / 1000);
        }
        dbActuals[line.id] = dbLineActuals;

        for (let i = 0; i < line.reqs.rawMaterialReqs.length; i++) {
          const mat = line.reqs.rawMaterialReqs[i];
          const actualUsedKg = dbLineActuals.materials[i] || 0;
          
          if (mat.inventoryId) {
            const invItem = inventory.find(inv => inv.id === mat.inventoryId);
            if (invItem) {
              // 1. Remove the blocked amount that we placed during planning
              const newBlocked = Math.max(0, (invItem.quantityBlocked || 0) - mat.grossRequired);
              
              // 2. Adjust quantityAvailable by subtracting the ACTUAL amount
              const newAvailable = Math.max(0, (invItem.quantityAvailable || 0) - actualUsedKg);
              
              // 3. Update Value (proportional to new available)
              const newValue = invItem.totalValue ? (invItem.totalValue * (newAvailable / (invItem.quantityAvailable || 1))) : 0;

              await updateDocument('inventory', mat.inventoryId, {
                quantityBlocked: newBlocked,
                quantityAvailable: newAvailable,
                totalValue: newValue
              });
            }
          }
        }
      }

      await updateDocument('manufacturing_orders', selectedOrder.id, {
        status: 'completed',
        actuals: dbActuals,
        completedAt: new Date(),
        completedBy: auth.currentUser?.email || 'unknown',
        exchangeRate
      });

      setSuccess(`Manufacturing order ${selectedOrder.moNumber} completed successfully!`);
      setTimeout(() => setSuccess(''), 3000);
      setView('list');
      await fetchData();
    } catch (e) {
      console.error(e);
      setError('Error completing order.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevertToPlan = async (order) => {
    if (!window.confirm('This will revert the MO to planning phase, unblock/restore reserved stock, and clear any execution progress. Continue?')) return;

    setActionLoading(true);
    setIsEditModalOpen(false);
    try {
      // Populate Draft Lines
      const newDraftLines = order.lines.map(line => ({
        id: Math.random().toString(36).substr(2, 9),
        productId: line.productId,
        targetLength: line.targetLength,
        orderQuantity: line.orderQuantity,
        totalHairWeight: line.totalHairWeight
      }));
      setDraftLines(newDraftLines);
      
      // Preserve the calculated view
      setCalculatedLines(order.lines);

      // Populate metadata
      if (order.createdAt?.seconds) {
        const d = new Date(order.createdAt.seconds * 1000);
        setMoDate(d.toISOString().substring(0, 10));
      }
      setMoComments(order.comments || '');
      setExchangeRate(order.exchangeRate || 84);
      setMoWorkroomId(order.workroomId || '');

      setEditingMoData(order);
      setView('plan');
    } catch (e) {
      console.error(e);
      setError('Error reverting MO.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOrder = async (e, order) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete manufacturing order ${order.moNumber}?`)) return;

    setActionLoading(true);
    try {
      if (order.status === 'approved' || order.status === 'executing') {
        // Revert blocked inventory
        for (const line of order.lines) {
          for (const mat of line.reqs.rawMaterialReqs) {
            if (mat.inventoryId) {
              const invItem = inventory.find(i => i.id === mat.inventoryId);
              if (invItem) {
                const currentBlocked = invItem.quantityBlocked || 0;
                await updateDocument('inventory', mat.inventoryId, {
                  quantityBlocked: Math.max(0, currentBlocked - mat.grossRequired)
                });
              }
            }
          }
        }
      }

      await deleteDocument('manufacturing_orders', order.id);
      setSuccess(`Manufacturing order ${order.moNumber} deleted successfully.`);
      setTimeout(() => setSuccess(''), 3000);
      await fetchData();
    } catch (err) {
      console.error(err);
      setError('Error deleting manufacturing order.');
    } finally {
      setActionLoading(false);
    }
  };

  // --- RENDERERS ---

  if (!hasAccess) {
    return (
      <div className="p-8 text-center max-w-lg mx-auto">
        <Shield className="w-12 h-12 text-stone-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-stone-800">Access Restricted</h2>
        <p className="text-stone-500 mt-2">You do not have permission to view Manufacturing Orders.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-stone-900 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Manufacturing Orders</h1>
            <p className="text-stone-500">Plan and execute production runs</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-sm shadow-sm" title="Live USD Exchange Rate">
            <span className="text-stone-500 mr-2 font-medium">1 USD = ₹</span>
            <input 
              type="number" 
              value={exchangeRate} 
              onChange={(e) => setExchangeRate(Number(e.target.value) || 0)} 
              className="w-16 text-right outline-none font-bold text-stone-700 bg-transparent"
              step="0.01"
            />
          </div>
          {view === 'list' && (
            <button 
            onClick={() => setView('plan')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 flex items-center shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Order Plan
          </button>
        )}
        {view !== 'list' && (
          <button 
            onClick={() => { setView('list'); setDraftLines([{ id: Math.random().toString(36).substr(2, 9), productId: '', targetLength: '', orderQuantity: 1, totalHairWeight: '' }]); setCalculatedLines(null); setSelectedOrder(null); setEditingMoData(null); setMoWorkroomId(''); }}
            className="px-4 py-2 bg-white border border-stone-200 text-stone-600 rounded-xl font-semibold hover:bg-stone-50 flex items-center print:hidden"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to List
          </button>
        )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-xl border border-green-100 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5" />
          {success}
        </div>
      )}

      {loading && view === 'list' && orders.length === 0 ? (
        <div className="p-12 text-center text-stone-500 flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400 mb-2" />
          Loading orders...
        </div>
      ) : (
        <>
          {view === 'list' && (
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              <table className="min-w-full divide-y divide-stone-200">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Order No</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Products</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-stone-500 uppercase tracking-wider">Est. Cost</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-stone-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-stone-50">
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-indigo-700">
                        {order.moNumber}
                        {order.comments && <div className="text-xs font-normal text-stone-500 mt-1 whitespace-normal break-words max-w-[200px]">{order.comments}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-600">
                        {new Date(order.createdAt?.seconds * 1000).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-600">
                        {order.lines.length} items
                        <div className="text-xs text-stone-400 mt-1">
                          {order.lines.slice(0,2).map(l => l.productName).join(', ')}
                          {order.lines.length > 2 && ' ...'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {order.status === 'approved' && <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">Approved / Blocked</span>}
                        {order.status === 'executing' && <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">Executing</span>}
                        {order.status === 'completed' && <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">Completed</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-stone-900">
                        ₹{order.totalEstimatedCost?.toLocaleString(undefined, {minimumFractionDigits:2})}
                        <div className="text-xs text-stone-400 font-normal">
                          ${((order.totalEstimatedCost || 0) / exchangeRate).toLocaleString(undefined, {minimumFractionDigits:2})}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => initExecution(order)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center justify-center transition-colors ${
                              order.status === 'completed' ? 'bg-stone-100 text-stone-600 hover:bg-stone-200' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }`}
                          >
                            {order.status === 'completed' ? 'View Details' : 'Execute'} <ArrowRight className="w-4 h-4 ml-1" />
                          </button>
                          <button
                            onClick={(e) => {
                               e.stopPropagation();
                               let dStr = new Date().toISOString().substring(0, 10);
                               if (order.createdAt?.seconds) {
                                  const d = new Date(order.createdAt.seconds * 1000);
                                  dStr = d.toISOString().substring(0, 10);
                               }
                               setEditOrderData({
                                 id: order.id,
                                 moNumber: order.moNumber,
                                 date: dStr,
                                 comments: order.comments || '',
                                 exchangeRate: order.exchangeRate || exchangeRate
                               });
                               setIsEditModalOpen(true);
                            }}
                            className="p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Order"
                          >
                            <Pen className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteOrder(e, order)}
                            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan="6" className="px-6 py-12 text-center text-stone-500">No manufacturing orders found. Create a plan to get started.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {view === 'plan' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-stone-200 flex justify-between items-center bg-stone-50">
                  <div className="flex items-center gap-6">
                    <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                      <Package className="w-5 h-5 text-indigo-500" />
                      Order Plan Items
                    </h3>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-semibold text-stone-600">Work Room:</label>
                      <select
                        value={moWorkroomId}
                        onChange={(e) => setMoWorkroomId(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Optional --</option>
                        {workrooms.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={handleAddDraftLine} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center">
                    <Plus className="w-4 h-4 mr-1" /> Add Row
                  </button>
                </div>
                
                <div className="overflow-x-auto p-4">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left text-xs font-bold text-stone-500 uppercase tracking-wider">
                        <th className="pb-3 px-2">Finished Product</th>
                        <th className="pb-3 px-2 w-32">Length (")</th>
                        <th className="pb-3 px-2 w-36">Packaging Units</th>
                        <th className="pb-3 px-2 w-40">Total Hair (Kg)</th>
                        <th className="pb-3 px-2 w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="space-y-2">
                      {draftLines.map((line) => (
                        <tr key={line.id}>
                          <td className="px-2 py-1">
                            <select
                              value={line.productId}
                              onChange={(e) => updateDraftLine(line.id, 'productId', e.target.value)}
                              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select a Product...</option>
                              {finishedProducts.map(fp => <option key={fp.id} value={fp.id}>{fp.name}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number" min="1"
                              value={line.targetLength}
                              onChange={(e) => updateDraftLine(line.id, 'targetLength', e.target.value)}
                              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                              placeholder="Inches"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number" min="1"
                              value={line.orderQuantity}
                              onChange={(e) => updateDraftLine(line.id, 'orderQuantity', e.target.value)}
                              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number" min="0" step="0.01"
                              value={line.totalHairWeight}
                              onChange={(e) => updateDraftLine(line.id, 'totalHairWeight', e.target.value)}
                              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                              placeholder="Kg"
                            />
                          </td>
                          <td className="px-2 py-1 text-center">
                            <button 
                              onClick={() => handleRemoveDraftLine(line.id)} 
                              disabled={draftLines.length === 1}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <div className="mt-6 flex justify-end gap-3">
                    {editingMoData && (
                      <button
                        onClick={() => {
                          setDraftLines(editingMoData.lines.map(line => ({
                            id: line.id,
                            productId: line.productId,
                            targetLength: line.targetLength,
                            orderQuantity: line.orderQuantity,
                            totalHairWeight: line.totalHairWeight
                          })));
                          setCalculatedLines(editingMoData.lines);
                        }}
                        className="px-6 py-2.5 bg-stone-100 text-stone-600 rounded-xl font-semibold hover:bg-stone-200 transition-colors"
                      >
                        Reset to Original
                      </button>
                    )}
                    <button
                      onClick={handleCalculatePlan}
                      className="px-6 py-2.5 bg-stone-900 text-white rounded-xl font-semibold hover:bg-stone-800 transition-colors flex items-center"
                    >
                      <Calculator className="w-4 h-4 mr-2" /> Calculate Requirements
                    </button>
                  </div>
                </div>
              </div>

              {/* Calculated Requirements View */}
              {calculatedLines && (
                <div className="space-y-6">
                  {calculatedLines.map((line, idx) => (
                    <div key={line.id} className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex justify-between items-center">
                        <div>
                          <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Line {idx + 1}</div>
                          <h3 className="text-lg font-bold text-stone-900">{line.productName}</h3>
                          <div className="text-sm text-stone-600 mt-1">
                            {line.targetLength}" | {line.orderQuantity} Units | {line.totalHairWeight} Kg
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-6 space-y-6">
                        {/* Raw Materials */}
                        <div>
                          <h4 className="text-sm font-bold text-stone-700 mb-3 uppercase tracking-wider">Raw Hair Required</h4>
                          <div className="border border-stone-200 rounded-xl overflow-hidden">
                            <table className="min-w-full divide-y divide-stone-200 text-sm">
                              <thead className="bg-stone-50">
                                <tr>
                                  <th className="px-4 py-2 text-left font-semibold text-stone-600">Material</th>
                                  <th className="px-4 py-2 text-right font-semibold text-stone-600">Req (Kg)</th>
                                  <th className="px-4 py-2 text-right font-semibold text-stone-600">Available</th>
                                  <th className="px-4 py-2 text-center font-semibold text-stone-600">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-100">
                                {line.reqs.rawMaterialReqs.map((mat, i) => (
                                  <tr key={i}>
                                    <td className="px-4 py-2 font-medium text-stone-900">{mat.materialName} {mat.length}"</td>
                                    <td className="px-4 py-2 text-right text-stone-900 font-bold">{mat.grossRequired.toFixed(3)}</td>
                                    <td className="px-4 py-2 text-right text-stone-600">{mat.available.toFixed(3)}</td>
                                    <td className="px-4 py-2 text-center">
                                      {mat.isSufficient ? (
                                        <span className="text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded">OK</span>
                                      ) : (
                                        <span className="text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded">Short</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* BOM */}
                        {line.reqs.bomReqs.length > 0 && (
                          <div>
                            <h4 className="text-sm font-bold text-stone-700 mb-3 uppercase tracking-wider">BOM Required</h4>
                            <div className="border border-stone-200 rounded-xl overflow-hidden">
                              <table className="min-w-full divide-y divide-stone-200 text-sm">
                                <thead className="bg-stone-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-stone-600">Item</th>
                                    <th className="px-4 py-2 text-right font-semibold text-stone-600">Qty</th>
                                    <th className="px-4 py-2 text-right font-semibold text-stone-600">Est. Price</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100">
                                  {line.reqs.bomReqs.map((bom, i) => (
                                    <tr key={i}>
                                      <td className="px-4 py-2 font-medium text-stone-900">{bom.name}</td>
                                      <td className="px-4 py-2 text-right text-stone-600">{bom.qty}</td>
                                      <td className="px-4 py-2 text-right text-stone-600">
                                        <div>₹{bom.totalPrice.toFixed(2)}</div>
                                        <div className="text-[10px] text-stone-400">${(bom.totalPrice / exchangeRate).toFixed(2)}</div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Costs */}
                        <div className="flex flex-wrap gap-4 text-xs font-medium text-stone-500 bg-stone-50 p-3 rounded-xl border border-stone-100">
                          <div>Est Material Cost: <span className="text-stone-900">₹{line.reqs.totalRawMaterialCost.toFixed(2)}</span> <span className="text-xs text-stone-500">(${(line.reqs.totalRawMaterialCost / exchangeRate).toFixed(2)})</span></div>
                          <div>Est BOM Cost: <span className="text-stone-900">₹{line.reqs.totalBomCost.toFixed(2)}</span> <span className="text-xs text-stone-500">(${(line.reqs.totalBomCost / exchangeRate).toFixed(2)})</span></div>
                          <div>Est Labor: <span className="text-stone-900">₹{line.reqs.labor.toFixed(2)}</span> <span className="text-xs text-stone-500">(${(line.reqs.labor / exchangeRate).toFixed(2)})</span></div>
                          <div>Est Misc: <span className="text-stone-900">₹{line.reqs.misc.toFixed(2)}</span> <span className="text-xs text-stone-500">(${(line.reqs.misc / exchangeRate).toFixed(2)})</span></div>
                          <div className="ml-auto font-bold text-indigo-700">Total: ₹{line.reqs.estimatedTotalCost.toLocaleString(undefined, {minimumFractionDigits:2})} <span className="text-xs font-normal text-indigo-400">(${(line.reqs.estimatedTotalCost / exchangeRate).toLocaleString(undefined, {minimumFractionDigits:2})})</span></div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Final Approval Bar */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
                    <div className="flex-1 space-y-4">
                      <div>
                        <div className="text-indigo-900 font-bold text-xl mb-1">
                          Grand Total: ₹{calculatedLines.reduce((sum, l) => sum + l.reqs.estimatedTotalCost, 0).toLocaleString(undefined, {minimumFractionDigits:2})}
                          <span className="text-sm font-normal text-indigo-200 ml-2">
                            (${((calculatedLines.reduce((sum, l) => sum + l.reqs.estimatedTotalCost, 0)) / exchangeRate).toLocaleString(undefined, {minimumFractionDigits:2})})
                          </span>
                        </div>
                        <div className="text-indigo-700 text-sm">
                          Approving will block required inventory for {calculatedLines.length} lines.
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div>
                          <label className="block text-xs font-bold text-indigo-800 mb-1">Date</label>
                          <input type="date" value={moDate} onChange={e => setMoDate(e.target.value)} className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-sm" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-indigo-800 mb-1">Comments (Optional)</label>
                          <input type="text" value={moComments} onChange={e => setMoComments(e.target.value)} className="w-full px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-sm" placeholder="Add a note..." />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleApprovePlan}
                      disabled={actionLoading}
                      className="w-full sm:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center whitespace-nowrap"
                    >
                      {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                      Approve Plan & Block Stock
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'execute' && selectedOrder && (
            <div className="space-y-6 animate-in fade-in max-w-5xl mx-auto print:max-w-none print:w-full print:m-0">
              <div className="bg-white border border-stone-200 p-6 rounded-2xl shadow-sm print:shadow-none flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold tracking-wider text-indigo-600 uppercase mb-1">Execution View</div>
                  <h2 className="text-2xl font-bold text-stone-900">{selectedOrder.moNumber}</h2>
                  <div className="text-stone-500 text-sm mt-1">Approved on {new Date(selectedOrder.createdAt?.seconds * 1000).toLocaleString()}</div>
                  {selectedOrder.comments && <div className="text-stone-600 text-sm mt-3 italic bg-stone-50 px-4 py-2 rounded-xl border border-stone-100 max-w-xl">{selectedOrder.comments}</div>}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                         let dStr = new Date().toISOString().substring(0, 10);
                         if (selectedOrder.createdAt?.seconds) {
                            const d = new Date(selectedOrder.createdAt.seconds * 1000);
                            dStr = d.toISOString().substring(0, 10);
                         }
                         setEditOrderData({
                           id: selectedOrder.id,
                           moNumber: selectedOrder.moNumber,
                           date: dStr,
                           comments: selectedOrder.comments || '',
                           exchangeRate: selectedOrder.exchangeRate || exchangeRate
                         });
                         setIsEditModalOpen(true);
                      }}
                      className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium rounded-xl flex items-center transition-colors print:hidden"
                      title="Edit Date, Comments & Rate"
                    >
                      <Pen className="w-4 h-4 mr-2" /> Edit
                    </button>
                    <button 
                      onClick={() => window.print()}
                      className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium rounded-xl flex items-center transition-colors print:hidden"
                      title="Print or Save as PDF"
                    >
                      <Printer className="w-4 h-4 mr-2" /> Print
                    </button>
                    {selectedOrder.status === 'completed' ? (
                      <span className="px-4 py-2 bg-green-100 text-green-800 font-bold rounded-xl flex items-center">
                        <Check className="w-5 h-5 mr-2" /> Completed
                      </span>
                    ) : (
                      <span className="px-4 py-2 bg-amber-100 text-amber-800 font-bold rounded-xl flex items-center">
                        <Play className="w-5 h-5 mr-2" /> Executing
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {selectedOrder.lines.map((line, idx) => {
                const lineActuals = actuals[line.id] || { materials: {}, wastage: {} };
                const readonly = selectedOrder.status === 'completed';

                let totalActualMaterialsGrams = 0;
                let totalActualMaterialsCost = 0;
                if (line.reqs?.rawMaterialReqs) {
                  line.reqs.rawMaterialReqs.forEach((mat, i) => {
                    const usedGrams = Number(lineActuals.materials[i]) || 0;
                    totalActualMaterialsGrams += usedGrams;
                    totalActualMaterialsCost += ((usedGrams / 1000) * (mat.rate || 0));
                  });
                }

                let totalWastageGrams = 0;
                if (lineActuals.wastage) {
                  Object.values(lineActuals.wastage).forEach(val => {
                    totalWastageGrams += (Number(val) || 0);
                  });
                }

                const actualProduceGrams = totalActualMaterialsGrams - totalWastageGrams;
                
                const actualProduceKg = actualProduceGrams / 1000;
                
                const laborCost = (Number(lineActuals.laborCost) || 0) * actualProduceKg;
                const shippingCost = (Number(lineActuals.shippingCost) || 0) * actualProduceKg;
                const miscCost = (Number(lineActuals.miscCost) || 0) * actualProduceKg;
                const totalAdditionalCost = laborCost + shippingCost + miscCost;
                
                const applicableCost = totalActualMaterialsCost + totalAdditionalCost;

                return (
                  <div key={line.id} className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden flex flex-col print:break-inside-avoid print:shadow-none">
                    <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex justify-between items-center flex-wrap gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-stone-900">Line {idx + 1}: {line.productName}</h3>
                        <div className="text-sm text-stone-600 mt-1">
                          {line.targetLength}" | {line.orderQuantity} Units | {line.totalHairWeight} Kg Planned
                        </div>
                      </div>
                      <div className="flex gap-4">
                         <div className="text-right">
                           <div className="text-xs font-bold text-stone-400 uppercase">Actual Produce</div>
                           <div className="text-lg font-bold text-indigo-600">{actualProduceGrams.toFixed(1)} g</div>
                         </div>
                         <div className="text-right border-l border-stone-200 pl-4">
                           <div className="text-xs font-bold text-stone-400 uppercase">Applicable Cost</div>
                           <div className="text-lg font-bold text-stone-700">
                             ₹{applicableCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                             <span className="text-sm font-normal text-stone-400 ml-2">
                               (${(applicableCost / exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 2 })})
                             </span>
                           </div>
                           {actualProduceGrams > 0 && (
                             <div className="text-xs font-medium text-stone-500 mt-0.5">
                               ₹{(applicableCost / (actualProduceGrams / 1000)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} / Kg
                               <span className="ml-1">(${( (applicableCost / (actualProduceGrams / 1000)) / exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 2 })} / Kg)</span>
                             </div>
                           )}
                         </div>
                      </div>
                    </div>
                    
                    <div className="p-5 flex flex-col gap-5">
                      {/* Top: Materials Used (Full Width) */}
                      <div>
                        <h4 className="text-sm font-bold text-stone-700 mb-2 uppercase tracking-wider flex items-center">
                          <Scissors className="w-4 h-4 mr-2 text-stone-400" /> Actual Materials Used
                        </h4>
                        <div className="space-y-1.5">
                          {line.reqs.rawMaterialReqs.map((mat, i) => {
                            const usedGrams = Number(lineActuals.materials[i]) || 0;
                            const amount = (usedGrams / 1000) * (mat.rate || 0);
                            return (
                              <div key={i} className="flex flex-row items-center text-sm border border-stone-100 rounded-lg px-3 py-1.5 bg-stone-50/50 gap-4">
                                <div className="flex-1 min-w-[150px]">
                                  <div className="font-medium text-stone-800">{mat.materialName} {mat.length}"</div>
                                </div>
                                <div className="flex-1 text-center min-w-[150px]">
                                  <div className="text-xs text-stone-500">
                                    ₹{(mat.rate || 0).toLocaleString('en-IN')} / Kg
                                    <span className="ml-1">(${( (mat.rate || 0) / exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 2 })} / Kg)</span>
                                  </div>
                                  {amount > 0 && (
                                    <div className="text-xs font-bold text-stone-700 mt-0">
                                      ₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      <span className="font-normal text-stone-400 ml-1">(${(amount / exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 2 })})</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 flex justify-end items-center gap-4">
                                  <div className="text-xs font-medium text-stone-500 whitespace-nowrap hidden sm:block">Planned: {parseFloat((mat.grossRequired * 1000).toFixed(1))} g</div>
                                  <div className="flex items-center gap-2">
                                    <input 
                                    type="number" min="0" step="any" 
                                    value={lineActuals.materials[i] ?? ''} 
                                    onChange={(e) => handleUpdateActual(line.id, 'materials', i, e.target.value)} 
                                    disabled={readonly}
                                    className={`w-32 px-3 py-1 text-right bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-amber-500 ${readonly ? 'bg-stone-100 cursor-not-allowed' : ''}`} 
                                    placeholder="Actual used..."
                                  />
                                  <span className="text-stone-500 font-medium w-6">g</span>
                                </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Bottom: Costs & Wastage in 2 columns */}
                      <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4">
                        {/* Left: Additional Costs */}
                        <div>
                          <h4 className="text-sm font-bold text-stone-700 mb-2 uppercase tracking-wider flex items-center">
                            <DollarSign className="w-4 h-4 mr-2 text-stone-400" /> Additional Costs
                          </h4>
                          <div className="space-y-1 border border-stone-100 rounded-lg px-3 pt-2 pb-3 bg-stone-50/50 h-full">
                            <WastageInput label="Labor (₹/Kg)" unit="" value={lineActuals.laborCost} onChange={(val) => handleUpdateActual(line.id, 'laborCost', null, val)} readonly={readonly} usdValue={(Number(lineActuals.laborCost) || 0) / exchangeRate} />
                            <WastageInput label="Shipping (₹/Kg)" unit="" value={lineActuals.shippingCost} onChange={(val) => handleUpdateActual(line.id, 'shippingCost', null, val)} readonly={readonly} usdValue={(Number(lineActuals.shippingCost) || 0) / exchangeRate} />
                            <WastageInput label="Misc (₹/Kg)" unit="" value={lineActuals.miscCost} onChange={(val) => handleUpdateActual(line.id, 'miscCost', null, val)} readonly={readonly} usdValue={(Number(lineActuals.miscCost) || 0) / exchangeRate} />
                          </div>
                        </div>

                        {/* Right: Wastage Breakdown */}
                        <div>
                          <h4 className="text-sm font-bold text-stone-700 mb-2 uppercase tracking-wider flex items-center">
                            <Trash2 className="w-4 h-4 mr-2 text-rose-400" /> Wastage Breakdown
                          </h4>
                          <div className="bg-rose-50/30 border border-rose-100 rounded-xl px-3 pt-2 pb-3 h-full flex flex-col justify-between">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-4 gap-y-0.5">
                              <WastageInput label="Moisture Loss" value={lineActuals.wastage?.moistureLoss} onChange={(val) => handleUpdateActual(line.id, 'wastage', 'moistureLoss', val)} readonly={readonly} />
                              <WastageInput label="Handling" value={lineActuals.wastage?.handlingWastage} onChange={(val) => handleUpdateActual(line.id, 'wastage', 'handlingWastage', val)} readonly={readonly} />
                              <WastageInput label="Short Hair" value={lineActuals.wastage?.shortHair} onChange={(val) => handleUpdateActual(line.id, 'wastage', 'shortHair', val)} readonly={readonly} />
                              <WastageInput label="Rubber Bands" value={lineActuals.wastage?.rubberBands} onChange={(val) => handleUpdateActual(line.id, 'wastage', 'rubberBands', val)} readonly={readonly} />
                              <WastageInput label="Foreign Mat." value={lineActuals.wastage?.foreignMaterial} onChange={(val) => handleUpdateActual(line.id, 'wastage', 'foreignMaterial', val)} readonly={readonly} />
                              <WastageInput label="Synthetics" value={lineActuals.wastage?.adulterationSynthetics} onChange={(val) => handleUpdateActual(line.id, 'wastage', 'adulterationSynthetics', val)} readonly={readonly} />
                              <WastageInput label="Oil" value={lineActuals.wastage?.adulterationOil} onChange={(val) => handleUpdateActual(line.id, 'wastage', 'adulterationOil', val)} readonly={readonly} />
                            </div>
                            <div className="mt-3 pt-3 border-t border-rose-200 flex justify-between items-center">
                              <span className="text-sm font-bold text-stone-700 uppercase tracking-wider">Total Wastage</span>
                              <span className="text-lg font-bold text-rose-600">{totalWastageGrams.toFixed(1)} g</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {(() => {
                let totalOrderCost = 0;
                selectedOrder.lines.forEach((line) => {
                  const lineActuals = actuals[line.id] || { materials: {}, wastage: {} };
                  let totalActualMaterialsGrams = 0;
                  let totalActualMaterialsCost = 0;
                  if (line.reqs?.rawMaterialReqs) {
                    line.reqs.rawMaterialReqs.forEach((mat, i) => {
                      const usedGrams = Number(lineActuals.materials[i]) || 0;
                      totalActualMaterialsGrams += usedGrams;
                      totalActualMaterialsCost += ((usedGrams / 1000) * (mat.rate || 0));
                    });
                  }

                  let totalWastageGrams = 0;
                  if (lineActuals.wastage) {
                    Object.values(lineActuals.wastage).forEach(val => {
                      totalWastageGrams += (Number(val) || 0);
                    });
                  }
                  
                  const actualProduceKg = (totalActualMaterialsGrams - totalWastageGrams) / 1000;

                  const laborCost = (Number(lineActuals.laborCost) || 0) * actualProduceKg;
                  const shippingCost = (Number(lineActuals.shippingCost) || 0) * actualProduceKg;
                  const miscCost = (Number(lineActuals.miscCost) || 0) * actualProduceKg;
                  totalOrderCost += (totalActualMaterialsCost + laborCost + shippingCost + miscCost);
                });
                
                return (
                  <div className="bg-stone-900 print:bg-white print:border print:border-stone-200 rounded-2xl p-6 flex justify-between items-center shadow-lg print:shadow-none mt-8">
                    <div>
                      <h3 className="text-lg font-bold text-white print:text-stone-900">Execution Total</h3>
                      <p className="text-sm text-stone-400 print:text-stone-500">Sum of all applicable costs across all lines</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-stone-400 print:text-stone-500 uppercase tracking-wider mb-1">Total Order Cost</div>
                      <div className="text-3xl font-bold text-white print:text-stone-900">
                        ₹{totalOrderCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        <span className="text-xl font-medium text-indigo-200 print:text-stone-500 ml-3">
                          ${(totalOrderCost / exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {!selectedOrder.status.includes('completed') && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6 flex justify-end gap-4 shadow-sm mt-6 print:hidden">
                  <button
                    onClick={handleSaveProgress}
                    disabled={actionLoading}
                    className="px-8 py-3 bg-stone-100 text-stone-700 rounded-xl font-bold hover:bg-stone-200 disabled:opacity-50 transition-all flex items-center"
                  >
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                    Save Progress
                  </button>
                  <button
                    onClick={handleCompleteExecution}
                    disabled={actionLoading}
                    className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition-all flex items-center"
                  >
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                    Complete Order & Deduct Stock
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <h3 className="font-bold text-stone-800 text-lg">Edit {editOrderData.moNumber}</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Date</label>
                <input 
                  type="date" 
                  value={editOrderData.date} 
                  onChange={e => setEditOrderData({...editOrderData, date: e.target.value})}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Exchange Rate (USD to INR)</label>
                <input 
                  type="number" step="any"
                  value={editOrderData.exchangeRate} 
                  onChange={e => setEditOrderData({...editOrderData, exchangeRate: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Comments</label>
                <textarea 
                  rows="3"
                  value={editOrderData.comments} 
                  onChange={e => setEditOrderData({...editOrderData, comments: e.target.value})}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                  placeholder="Optional note..."
                ></textarea>
              </div>
            </div>
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-between gap-3">
              <button 
                onClick={() => {
                  const o = orders.find(x => x.id === editOrderData.id);
                  if (o) handleRevertToPlan(o);
                }} 
                className="px-4 py-2 font-bold text-rose-600 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-2"
                title="Unblocks inventory and returns MO to draft planning phase"
              >
                <RotateCcw className="w-4 h-4"/> Full Edit (Revert to Plan)
              </button>
              <div className="flex gap-3">
                <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 font-bold text-stone-600 hover:bg-stone-200 rounded-xl transition-colors">Cancel</button>
              <button 
                onClick={async () => {
                  try {
                    const newDate = new Date(editOrderData.date + 'T12:00:00');
                    await updateDocument('manufacturing_orders', editOrderData.id, {
                      createdAt: newDate,
                      comments: editOrderData.comments,
                      exchangeRate: editOrderData.exchangeRate
                    });
                    setIsEditModalOpen(false);
                    setSuccess('Order updated successfully!');
                    setTimeout(() => setSuccess(''), 3000);
                    fetchData();
                    if (selectedOrder && selectedOrder.id === editOrderData.id) {
                       setSelectedOrder(prev => ({...prev, createdAt: {seconds: newDate.getTime()/1000}, comments: editOrderData.comments, exchangeRate: editOrderData.exchangeRate}));
                       setExchangeRate(editOrderData.exchangeRate);
                    }
                  } catch(e) {
                    setError('Failed to update order');
                  }
                }} 
                className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
              >
                Save Changes
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
