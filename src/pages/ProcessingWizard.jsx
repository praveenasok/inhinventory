import React, { useState, useEffect } from 'react';
import { getCollection, addDocument, updateDocument, setDocument, getDocument } from '../services/db';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LENGTH_OPTIONS = Array.from({ length: 48 }, (_, i) => i + 3); // 3 to 50

export default function ProcessingWizard() {
  const { permissions } = useAuth();
  const showFinancials = permissions?.financials;

  const [lots, setLots] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [multiplierTables, setMultiplierTables] = useState([]);
  
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [selectedLotId, setSelectedLotId] = useState('');
  const [selectedLot, setSelectedLot] = useState(null);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [inputWeight, setInputWeight] = useState('');
  const [inputLengths, setInputLengths] = useState([]);
  
  // Output State
  const [fancyOutputWeight, setFancyOutputWeight] = useState('');
  const [targetOutput, setTargetOutput] = useState('INHNR1x1');
  const [inhnrOutputs, setInhnrOutputs] = useState([{ length: '12', weight: '' }]);
  
  // Wastage State
  const [wastage, setWastage] = useState({
    moistureLoss: '',
    handlingWastage: '',
    shortHair: '',
    rubberBands: '',
    foreignMaterial: '',
    adulterationSynthetics: '',
    adulterationOil: ''
  });

  const [laborCost, setLaborCost] = useState('');

  const [yieldPercentage, setYieldPercentage] = useState(0);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [lotsData, suppliersData, multiplierTablesData, allMaterials] = await Promise.all([
        getCollection('lots'),
        getCollection('suppliers'),
        getCollection('multiplier_tables'),
        getCollection('raw_materials')
      ]);
      const activeLots = lotsData.filter(l => l.status !== 'Completed');
      setLots(activeLots.reverse());
      setSuppliers(suppliersData);
      setMultiplierTables(multiplierTablesData);
      setRawMaterials(allMaterials);
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLotId) {
      const lot = lots.find(l => l.id === selectedLotId);
      setSelectedLot(lot);
      if (lot) {
        if (lot.materialType !== 'Goli' && lot.materialType !== 'Fancy') {
          if (lot.lengths) {
            setInputLengths(lot.lengths.map(l => ({ length: l.length, weight: '', maxWeight: l.weight })));
          } else {
            setInputLengths([]);
          }
          setInputWeight('');
        } else {
          setInputLengths([]);
          setInputWeight(lot.remainingWeight ?? lot.initialWeight); 
        }
        setTargetOutput(lot.materialType === 'Goli' ? 'Fancy' : 'INHNR1x1');
        
        // Find default labor cost
        const mat = rawMaterials.find(r => r.name === lot.materialType);
        if (mat && mat.defaultLaborCost) {
          setLaborCost(mat.defaultLaborCost.toString());
        } else {
          setLaborCost('');
        }
      }
    } else {
      setSelectedLot(null);
      setInputWeight('');
      setInputLengths([]);
      setTargetOutput('INHNR1x1');
      setLaborCost('');
    }
  }, [selectedLotId, lots, rawMaterials]);

  useEffect(() => {
    if (selectedLot && selectedLot.materialType !== 'Goli' && selectedLot.materialType !== 'Fancy') {
      const sum = inputLengths.reduce((s, l) => s + Number(l.weight || 0), 0);
      setInputWeight(sum.toString());
    }
  }, [inputLengths, selectedLot]);

  const getWastageSum = () => {
    return Object.values(wastage).reduce((sum, val) => sum + Number(val || 0), 0);
  };

  const getOutputSum = () => {
    if (targetOutput === 'Fancy') return Number(fancyOutputWeight || 0);
    return inhnrOutputs.reduce((sum, out) => sum + Number(out.weight || 0), 0);
  };

  useEffect(() => {
    const inW = Number(inputWeight);
    const outW = getOutputSum();

    if (inW > 0) {
      const yieldPct = (outW / inW) * 100;
      setYieldPercentage(yieldPct.toFixed(2));
    } else {
      setYieldPercentage(0);
    }
  }, [inputWeight, fancyOutputWeight, inhnrOutputs, wastage]);

  // Cost calculations
  const inputCost = selectedLot && Number(inputWeight) > 0 && selectedLot.initialWeight > 0
    ? (Number(inputWeight) / selectedLot.initialWeight) * (selectedLot.totalCost || 0)
    : 0;
  
  const totalLaborCost = Number(laborCost || 0) * Number(inputWeight || 0);
  const totalCostPool = inputCost + totalLaborCost;

  const effectiveCostPerKg = getOutputSum() > 0 
    ? totalCostPool / getOutputSum() 
    : 0;

  const handleWastageChange = (field, value) => {
    setWastage(prev => ({ ...prev, [field]: value }));
  };

  const handleAddInhnrOutput = () => {
    setInhnrOutputs([...inhnrOutputs, { length: '12', weight: '' }]);
  };

  const handleInhnrOutputChange = (index, field, value) => {
    const newOutputs = [...inhnrOutputs];
    newOutputs[index][field] = value;

    // Auto-add next even length if weight is entered on the last row
    if (field === 'weight' && value !== '' && index === newOutputs.length - 1) {
      const currentLength = Number(newOutputs[index].length);
      if (!isNaN(currentLength)) {
        const nextLength = currentLength + (currentLength % 2 === 0 ? 2 : 1);
        if (nextLength <= 50) {
          newOutputs.push({ length: nextLength.toString(), weight: '' });
        }
      }
    }

    setInhnrOutputs(newOutputs);
  };

  const handleRemoveInhnrOutput = (index) => {
    const newOutputs = [...inhnrOutputs];
    newOutputs.splice(index, 1);
    setInhnrOutputs(newOutputs);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const inW = Number(inputWeight);
    const outW = getOutputSum();
    const wasteW = getWastageSum();
    const availableWeight = selectedLot.remainingWeight ?? selectedLot.initialWeight;

    if (inW > availableWeight) {
      alert(`Input weight (${inW} Kg) cannot exceed available weight (${availableWeight} Kg)!`);
      setLoading(false);
      return;
    }

    if (selectedLot.materialType !== 'Goli' && selectedLot.materialType !== 'Fancy') {
      const invalidLengths = inputLengths.filter(il => Number(il.weight || 0) > il.maxWeight);
      if (invalidLengths.length > 0) {
        alert("Input weight for specific lengths cannot exceed their available weight!");
        setLoading(false);
        return;
      }
    }

    if (Math.abs(inW - (outW + wasteW)) > 0.1) {
      alert("Input weight must exactly equal total output weight + all wastage combined!");
      setLoading(false);
      return;
    }

    try {
      const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
      
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
      let currentSeq = maxSeq;
      
      const transformationData = {
        inputLotId: selectedLotId,
        inputWeight: inW,
        inputLengths: selectedLot.materialType !== 'Goli' && selectedLot.materialType !== 'Fancy' 
          ? inputLengths.filter(l => Number(l.weight || 0) > 0).map(l => ({ length: l.length, weight: Number(l.weight) }))
          : null,
        targetProduct: targetOutput,
        wastageDetails: {
          moistureLoss: Number(wastage.moistureLoss || 0),
          handlingWastage: Number(wastage.handlingWastage || 0),
          shortHair: Number(wastage.shortHair || 0),
          rubberBands: Number(wastage.rubberBands || 0),
          foreignMaterial: Number(wastage.foreignMaterial || 0),
          adulterationSynthetics: Number(wastage.adulterationSynthetics || 0),
          adulterationOil: Number(wastage.adulterationOil || 0)
        },
        totalWastage: wasteW,
        totalOutput: outW,
        yieldPercentage: Number(yieldPercentage),
        inputCost: inputCost,
        laborCost: Number(laborCost || 0) * inW,
        laborCostPerKg: Number(laborCost || 0),
        effectiveCostPerKg: effectiveCostPerKg,
        processedAt: new Date(),
        processedBy: 'Admin'
      };

      if (targetOutput === 'Fancy') {
        const supplier = suppliers.find(s => s.id === selectedLot.supplierId);
        const supplierCode = supplier?.code ? supplier.code.toUpperCase() : 'UNK';
        currentSeq++;
        const newLotId = `LOT-FANCY-${supplierCode}-${outW}KG-${dateStr}-${currentSeq}`;
        transformationData.outputLotId = newLotId;
        
        // Data for the new Fancy lot is generated here, but it will be created in Approvals.jsx
        transformationData.pendingFancyLot = {
          id: newLotId,
          supplierId: selectedLot.supplierId || null, 
          materialType: 'Fancy',
          initialWeight: outW,
          remainingWeight: outW,
          pricePerUnit: effectiveCostPerKg || 0, 
          totalCost: inputCost || 0, 
          purchaseDate: new Date(),
          status: 'Raw',
          currentStage: 'Initial',
          parentLotId: selectedLotId
        };
      } else {
        // Output is INHNR1x1 or INHMR1x1
        
        let multiplierTable = null;
        if (selectedLot.multiplierTableId) {
          multiplierTable = multiplierTables.find(t => t.id === selectedLot.multiplierTableId);
        }
        
        let equivalentUnits = 0;
        if (multiplierTable) {
          for (const o of inhnrOutputs) {
            const m = multiplierTable.factors[o.length] || 1.0;
            equivalentUnits += Number(o.weight) * m;
          }
        }
        
        const totalCostPool = inputCost + (Number(laborCost || 0) * inW);
        const baseRate = (multiplierTable && equivalentUnits > 0) ? (totalCostPool / equivalentUnits) : 0;
        
        transformationData.outputs = inhnrOutputs.map(o => {
          let r = 0;
          if (multiplierTable && equivalentUnits > 0) {
            const m = multiplierTable.factors[o.length] || 1.0;
            r = baseRate * m;
          } else {
            // Fallback for old math if no table assigned
            const weightRatio = Number(o.weight) > 0 ? (Number(o.weight) / (transformationData.totalOutput || 1)) : 1;
            r = (transformationData.effectiveCostPerKg / weightRatio) / 100;
          }
          currentSeq++;
          const oLotId = `LOT-${targetOutput}-${o.length}-${o.weight}KG-${dateStr}-${currentSeq}`;
          return { length: Number(o.length), weight: Number(o.weight), rate: r, outputLotId: oLotId };
        });
        
        // Save calculation details for the Approvals screen
        transformationData.costCalculationDetails = {
          multiplierTable: multiplierTable,
          equivalentUnits: equivalentUnits,
          baseRate: baseRate,
          totalCostPool: totalCostPool
        };
      }

      await addDocument('pending_approvals', transformationData);

      // Update the original lot
      const lotDoc = lots.find(l => l.id === selectedLotId);
      if (lotDoc) {
        const remainingWeight = (lotDoc.remainingWeight ?? lotDoc.initialWeight) - inW;
        
        let newLengths = lotDoc.lengths;
        if (transformationData.inputLengths && transformationData.inputLengths.length > 0 && lotDoc.lengths) {
           newLengths = lotDoc.lengths.map(l => {
              const used = transformationData.inputLengths.find(il => il.length === l.length);
              if (used) {
                 return { ...l, weight: Math.max(0, l.weight - used.weight) };
              }
              return l;
           });
        }

        await updateDocument('lots', lotDoc.id, {
          remainingWeight: remainingWeight > 0 ? remainingWeight : 0,
          lengths: newLengths || null,
          status: remainingWeight > 0 ? 'Partially Processed' : 'Completed',
          currentStage: remainingWeight > 0 ? lotDoc.currentStage : 'Converted'
        });
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        // Reset form
        setSelectedLotId('');
        setFancyOutputWeight('');
        setInhnrOutputs([{ length: '12', weight: '' }]);
        setInputLengths([]);
        setWastage({
          moistureLoss: '', handlingWastage: '', shortHair: '', rubberBands: '', 
          foreignMaterial: '', adulterationSynthetics: '', adulterationOil: ''
        });
        setLaborCost('');
        fetchInitialData();
      }, 3000);

    } catch (error) {
      console.error("Submission Error:", error);
      alert(`Failed to process transformation: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Conversion Engine Pipeline</h1>
      </div>

      {success && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-md flex items-center">
          <CheckCircle2 className="w-5 h-5 mr-2" />
          Transformation submitted for approval! It will appear in Inventory once approved.
        </div>
      )}

      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Step 1: Select Lot */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm mr-2">1</span>
              Select Input Lot
            </h3>
            <div className="grid grid-cols-2 gap-6 pl-8">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Active Lot ID</label>
                <select 
                  required
                  value={selectedLotId}
                  onChange={(e) => setSelectedLotId(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                >
                  <option value="">-- Select a Lot --</option>
                  {lots.map(l => (
                    <option key={l.id} value={l.id}>{l.id} ({l.materialType} - {(l.remainingWeight ?? l.initialWeight).toFixed(2)}Kg available)</option>
                  ))}
                </select>

                {selectedLot && selectedLot.lengths && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                    <p className="text-xs font-semibold text-blue-800 mb-2">Lot Length Breakdown:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedLot.lengths.map((l, i) => (
                        <div key={i} className="text-xs bg-white border border-blue-200 px-2 py-1 rounded text-center">
                          <span className="text-gray-500">{l.length}":</span> <span className="font-bold">{l.weight}kg</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedLot && (
                <div className="col-span-2 md:col-span-1 bg-gray-50 p-4 rounded-md border border-gray-200 flex flex-col justify-center">
                  <p className="text-sm text-gray-500">Pipeline Target Output</p>
                  <p className="text-xl font-bold text-blue-700 mt-1">{targetOutput}</p>
                </div>
              )}

              <div className="col-span-2">
                {selectedLot && selectedLot.materialType !== 'Goli' && selectedLot.materialType !== 'Fancy' ? (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Input Weight by Length (Kg)</label>
                    {inputLengths.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No length breakdown available for this lot. Cannot process length-wise.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {inputLengths.map((il, idx) => (
                            <div key={idx} className="bg-blue-50/50 p-3 rounded-md border border-blue-100">
                              <label className="block text-xs font-semibold text-blue-800 mb-1">{il.length}" (Max: {il.maxWeight}kg)</label>
                              <input 
                                type="number" 
                                step="0.01"
                                min="0"
                                max={il.maxWeight}
                                value={il.weight}
                                onChange={(e) => {
                                  const newLengths = [...inputLengths];
                                  newLengths[idx].weight = e.target.value;
                                  setInputLengths(newLengths);
                                }}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1.5 border bg-white" 
                              />
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-700">Total Input Weight: <span className="font-bold text-blue-700">{Number(inputWeight).toFixed(2)} Kg</span></p>
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Input Weight (Kg) to Process</label>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={inputWeight}
                      onChange={(e) => setInputWeight(e.target.value)}
                      className="block w-1/2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white" 
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Step 2: Define Outputs */}
          <div className={!selectedLotId ? 'opacity-50 pointer-events-none' : ''}>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm mr-2">2</span>
              Record Output Weight ({targetOutput})
            </h3>
            
            <div className="pl-8">
              {targetOutput === 'Fancy' ? (
                <div className="w-64">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fancy Output Weight (Kg)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={fancyOutputWeight}
                    onChange={(e) => setFancyOutputWeight(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                  />
                  <p className="text-xs text-gray-500 mt-1">This will create a new Fancy LOT.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Output Product</label>
                    <select
                      value={targetOutput}
                      onChange={(e) => setTargetOutput(e.target.value)}
                      className="block w-64 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white"
                    >
                      <option value="INHNR1x1">INHNR1x1</option>
                      <option value="INHMR1x1">INHMR1x1</option>
                    </select>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-2">Specify the lengths produced for {targetOutput}:</p>
                  {inhnrOutputs.map((out, idx) => (
                    <div key={idx} className="flex items-center space-x-4">
                      <div className="w-48">
                        <label className="block text-xs text-gray-500 mb-1">Length (Inches)</label>
                        <select 
                          required
                          value={out.length}
                          onChange={(e) => handleInhnrOutputChange(idx, 'length', e.target.value)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
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
                          step="0.01"
                          required
                          value={out.weight}
                          onChange={(e) => handleInhnrOutputChange(idx, 'weight', e.target.value)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                        />
                      </div>
                      {inhnrOutputs.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => handleRemoveInhnrOutput(idx)}
                          className="mt-5 text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button 
                    type="button" 
                    onClick={handleAddInhnrOutput}
                    className="text-sm text-blue-600 font-medium hover:text-blue-800"
                  >
                    + Add another length
                  </button>
                </div>
              )}
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Step 3: Granular Wastage */}
          <div className={!selectedLotId ? 'opacity-50 pointer-events-none' : ''}>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full inline-flex justify-center items-center text-sm mr-2">3</span>
              Wastage Breakdown (Kg)
            </h3>
            <div className="pl-8 grid grid-cols-2 md:grid-cols-3 gap-6">
              {[
                { key: 'moistureLoss', label: 'Moisture Loss' },
                { key: 'handlingWastage', label: 'Handling Wastage' },
                { key: 'shortHair', label: 'Unusable Short Hair' },
                { key: 'rubberBands', label: 'Rubber Bands' },
                { key: 'foreignMaterial', label: 'Misc Foreign Material' },
                { key: 'adulterationSynthetics', label: 'Synthetics (Adulteration)' },
                { key: 'adulterationOil', label: 'Oil (Adulteration)' }
              ].map(item => (
                <div key={item.key}>
                  <label className="block text-sm font-medium text-red-700 mb-1">{item.label}</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    value={wastage[item.key]}
                    onChange={(e) => handleWastageChange(item.key, e.target.value)}
                    placeholder="0.00"
                    className="block w-full rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm p-2 border bg-red-50" 
                  />
                </div>
              ))}
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Step 4: Yield Validation */}
          <div className={!selectedLotId ? 'opacity-50 pointer-events-none' : ''}>
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
              <div className="flex flex-col md:flex-row justify-between md:items-center">
                <div className="mb-4 md:mb-0">
                  <p className="text-sm text-gray-600">True Yield Calculation</p>
                  <p className="text-4xl font-bold text-gray-900 mt-1">{yieldPercentage}%</p>
                </div>
                <div className="text-sm space-y-2 bg-white p-4 rounded border border-gray-100 min-w-[250px]">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Input:</span>
                    <span className="font-semibold">{Number(inputWeight || 0).toFixed(2)} Kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Output:</span>
                    <span className="font-semibold text-green-700">{getOutputSum().toFixed(2)} Kg</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Total Wastage:</span>
                    <span className="font-semibold text-red-600">{getWastageSum().toFixed(2)} Kg</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-gray-700 font-medium">Difference:</span>
                    <span className={`font-bold ${Math.abs(Number(inputWeight) - (getOutputSum() + getWastageSum())) > 0.1 ? 'text-orange-600' : 'text-gray-900'}`}>
                      {Math.abs(Number(inputWeight) - (getOutputSum() + getWastageSum())).toFixed(2)} Kg
                    </span>
                  </div>
                  
                  {Math.abs(Number(inputWeight) - (getOutputSum() + getWastageSum())) > 0.1 && (
                    <p className="text-orange-600 font-semibold flex items-center justify-end mt-2 text-xs">
                      <AlertTriangle className="w-4 h-4 mr-1" /> Weights must balance!
                    </p>
                  )}
                </div>
                
                {/* Cost Section */}
                {showFinancials && (
                  <div className="text-sm space-y-2 bg-blue-50 p-4 rounded border border-blue-100 min-w-[250px] mt-4 md:mt-0 md:ml-4">
                    <p className="text-xs font-semibold text-blue-800 mb-2">Cost Propagation</p>
                    <div className="flex justify-between">
                      <span className="text-blue-600">Cost of Input:</span>
                      <span className="font-semibold text-blue-900">₹{inputCost.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2">
                      <label className="text-blue-600">Labor Cost (₹/Kg):</label>
                      <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        value={laborCost}
                        onChange={(e) => setLaborCost(e.target.value)}
                        className="w-24 px-2 py-1 text-right text-blue-900 rounded border border-blue-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="flex justify-between border-t border-blue-200 mt-2 pt-2">
                      <span className="text-blue-600">Total Labor Cost:</span>
                      <span className="font-semibold text-blue-900">₹{totalLaborCost.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between border-t border-blue-200 mt-2 pt-2">
                      <span className="text-blue-700 font-medium">Effective Output Cost:</span>
                      <span className="font-bold text-blue-900">₹{effectiveCostPerKg.toFixed(2)} / Kg</span>
                    </div>
                    <p className="text-[10px] text-blue-500 mt-1 leading-tight">
                      * Cost of wastage and labor is absorbed into the final good product proportionally by weight.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                type="submit" 
                disabled={loading || !selectedLotId}
                className="px-6 py-3 bg-blue-600 border border-transparent rounded-md text-base font-medium text-white hover:bg-blue-700 focus:outline-none disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Confirm Pipeline Step'}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
