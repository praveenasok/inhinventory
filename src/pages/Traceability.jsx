import React, { useState, useEffect } from 'react';
import { getCollection, deleteDocument, updateDocument, getDocument } from '../services/db';
import { Search, ArrowRight, Package, Droplets, Trash2, GitBranch, History, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Traceability() {
  const { permissions } = useAuth();
  const isAdmin = permissions?.financials; 
  const showFinancials = permissions?.financials;

  const [searchParams, setSearchParams] = useSearchParams();
  const initialLotId = searchParams.get('lotId');

  const [lots, setLots] = useState([]);
  const [searchLot, setSearchLot] = useState('');
  const [traceResult, setTraceResult] = useState(null);
  const [traceLoading, setTraceLoading] = useState(false);

  useEffect(() => {
    fetchLots();
  }, []);

  useEffect(() => {
    if (initialLotId) {
      setSearchLot(initialLotId);
    }
  }, [initialLotId]);

  useEffect(() => {
    if (initialLotId && lots.length > 0) {
      handleTrace(null, initialLotId);
    }
  }, [initialLotId, lots]);

  const fetchLots = async () => {
    try {
      const lotsData = await getCollection('lots');
      setLots(lotsData.reverse());
    } catch (error) {
      console.error(error);
    }
  };

  const handleTrace = async (e, forceId = null) => {
    if (e) e.preventDefault();
    const idToTrace = forceId || searchLot;
    if (!idToTrace) return;
    
    // Update URL so it can be shared or refreshed
    setSearchParams({ lotId: idToTrace });
    
    setTraceLoading(true);
    setTraceResult(null);

    try {
      const lot = lots.find(l => l.id === idToTrace);
      if (!lot) {
        setTraceResult({ error: 'Lot not found.' });
        setTraceLoading(false);
        return;
      }

      const transformations = await getCollection('transformations');
      const lotTransformations = transformations
        .filter(t => t.inputLotId === idToTrace)
        .sort((a, b) => a.processedAt?.seconds - b.processedAt?.seconds);

      setTraceResult({
        type: 'lot',
        lot,
        transformations: lotTransformations
      });

    } catch (error) {
      console.error(error);
      setTraceResult({ error: 'An error occurred during trace.' });
    } finally {
      setTraceLoading(false);
    }
  };

  const handleUndoTransformation = async (t) => {
    if (!window.confirm("Are you sure you want to undo this processing step? The generated weights will be deducted from inventory and added back to the original lot.")) {
      return;
    }
    
    setTraceLoading(true);
    try {
      // 1. Add back the weight to the parent lot
      const lot = lots.find(l => l.id === t.inputLotId);
      if (lot) {
        const newWeight = (lot.remainingWeight ?? lot.initialWeight) + Number(t.inputWeight);
        await updateDocument('lots', lot.id, {
          remainingWeight: newWeight,
          status: newWeight >= lot.initialWeight ? 'Raw' : 'Partially Processed',
          currentStage: 'Initial'
        });
      }

      // 2. Remove the outputs from the inventory
      if (t.targetProduct === 'Fancy' && t.outputLotId) {
        await deleteDocument('lots', t.outputLotId);
      } else if (t.outputs && t.outputs.length > 0) {
        for (const out of t.outputs) {
          if (out.outputLotId) {
            await deleteDocument('lots', out.outputLotId);
          }
          const invId = `${t.targetProduct}-${out.length}`;
          const invDoc = await getDocument('inventory', invId);
          if (invDoc) {
            const newQuantity = Math.max(0, (invDoc.quantityAvailable || 0) - out.weight);
            const valueDeducted = out.weight * (out.rate || invDoc.averageRate || 0);
            const newTotalValue = Math.max(0, (invDoc.totalValue || 0) - valueDeducted);
            
            await updateDocument('inventory', invId, {
              quantityAvailable: newQuantity,
              totalValue: newTotalValue,
              averageRate: newQuantity > 0 ? newTotalValue / newQuantity : 0
            });
          }
        }
      }

      // 3. Delete the transformation document
      await deleteDocument('transformations', t.id);

      alert("Transformation successfully undone.");
      fetchLots();
      handleTrace(null, t.inputLotId);
    } catch (error) {
      console.error(error);
      alert("Failed to undo transformation.");
    } finally {
      setTraceLoading(false);
    }
  };

  const WastageItem = ({ label, value }) => {
    if (!value || value === 0) return null;
    return (
      <div className="flex justify-between items-center py-2 px-3 border-b border-rose-100 last:border-0 bg-white/50 rounded hover:bg-white transition-colors">
        <span className="text-stone-600 text-sm font-medium">{label}</span>
        <span className="font-bold text-rose-600 text-sm">{value.toFixed(3)} Kg</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-stone-100">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <GitBranch className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Lot Traceability</h1>
            <p className="text-stone-500 text-sm mt-1">Trace the complete processing history of any lot</p>
          </div>
        </div>
        
        <form onSubmit={handleTrace} className="flex space-x-3 items-end">
          <div className="w-80">
            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 ml-1">Select Lot ID</label>
            <div className="relative">
              <Search className="w-5 h-5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select 
                required
                value={searchLot}
                onChange={(e) => setSearchLot(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-stone-700 appearance-none" 
              >
                <option value="">-- Choose a Lot --</option>
                {lots.map(l => (
                  <option key={l.id} value={l.id}>{l.id} ({l.materialType})</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <button 
            type="submit" 
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm flex items-center space-x-2 h-[42px]"
          >
            <span>Trace</span>
          </button>
        </form>
      </div>

      {traceLoading && (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-stone-100 shadow-sm">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="text-stone-500 font-medium">Reconstructing lineage...</p>
        </div>
      )}

      {traceResult && !traceLoading && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
          {traceResult.error ? (
            <div className="p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 flex items-center">
              <Trash2 className="w-5 h-5 mr-3" />
              <span className="font-medium">{traceResult.error}</span>
            </div>
          ) : traceResult.type === 'lot' ? (
            <div className="relative">
              {/* Origin Node */}
              <div className="relative z-10 flex items-start space-x-6">
                <div className="flex flex-col items-center mt-1">
                  <div className="w-12 h-12 rounded-full bg-blue-100 border-4 border-white shadow-sm flex items-center justify-center text-blue-600 z-10">
                    <Package className="w-5 h-5" />
                  </div>
                  {traceResult.transformations.length > 0 && (
                    <div className="w-0.5 h-full bg-blue-100 absolute top-12 bottom-[-40px] -z-10"></div>
                  )}
                </div>
                <div className="flex-1 bg-stone-50 border border-stone-200 p-6 rounded-2xl">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-xs font-bold tracking-wider text-blue-600 uppercase mb-1 block">Origin Purchase</span>
                      <h3 className="text-xl font-bold text-stone-900">{traceResult.lot.id}</h3>
                    </div>
                    <span className="px-3 py-1 bg-stone-200 text-stone-700 text-xs font-bold rounded-full uppercase tracking-wider">
                      {traceResult.lot.materialType}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="bg-white p-3 rounded-xl border border-stone-100">
                      <p className="text-xs font-medium text-stone-500 uppercase">Initial Weight</p>
                      <p className="text-lg font-bold text-stone-800">{traceResult.lot.initialWeight?.toFixed(2)} <span className="text-sm font-medium text-stone-500">Kg</span></p>
                    </div>
                    {traceResult.lot.lengths && traceResult.lot.lengths.length > 0 && (
                      <div className="bg-white p-3 rounded-xl border border-stone-100 col-span-2 md:col-span-1">
                        <p className="text-xs font-medium text-stone-500 uppercase">Lengths</p>
                        <p className="text-sm font-medium text-stone-800 mt-1 truncate">
                          {traceResult.lot.lengths.map(l => `${l.length}": ${l.weight}kg`).join(', ')}
                        </p>
                      </div>
                    )}
                    {showFinancials && (
                      <>
                        <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                          <p className="text-xs font-medium text-emerald-700 uppercase">Price/Unit</p>
                          <p className="text-lg font-bold text-emerald-900">₹{traceResult.lot.pricePerUnit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</p>
                        </div>
                        <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                          <p className="text-xs font-medium text-emerald-700 uppercase">Total Cost</p>
                          <p className="text-lg font-bold text-emerald-900">₹{traceResult.lot.totalCost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Transformation Timeline */}
              <div className="mt-8 space-y-8">
                {traceResult.transformations.map((t, idx) => {
                  const isLast = idx === traceResult.transformations.length - 1;
                  
                  return (
                    <div key={t.id || idx} className="relative z-10 flex items-start space-x-6">
                      <div className="flex flex-col items-center mt-4">
                        <div className="w-12 h-12 rounded-full bg-amber-100 border-4 border-white shadow-sm flex items-center justify-center text-amber-600 z-10">
                          <History className="w-5 h-5" />
                        </div>
                        {!isLast && (
                          <div className="w-0.5 h-full bg-blue-100 absolute top-12 bottom-[-40px] -z-10"></div>
                        )}
                      </div>
                      
                      <div className="flex-1 bg-white border-2 border-stone-100 p-6 rounded-2xl shadow-sm hover:border-amber-200 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <span className="text-xs font-bold tracking-wider text-amber-600 uppercase mb-1 block flex items-center">
                              Processing Event
                            </span>
                            <h3 className="text-xl font-bold text-stone-900 flex items-center">
                              Pipeline Output: <span className="ml-2 px-3 py-1 bg-amber-50 text-amber-800 rounded-lg">{t.targetProduct}</span>
                            </h3>
                            <p className="text-sm text-stone-500 mt-2 font-medium">
                              Processed: {t.processedAt ? new Date(t.processedAt.seconds * 1000).toLocaleString() : 'Unknown'}
                            </p>
                          </div>
                          {isAdmin && (
                            <button 
                              onClick={() => handleUndoTransformation(t)}
                              className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-500 rounded-lg transition-colors flex items-center shadow-sm"
                              title="Undo this processing step and return weight to raw lot"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                              Undo Step
                            </button>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-3 mb-6">
                          <div className="bg-stone-50 px-4 py-2 rounded-xl border border-stone-200">
                            <span className="text-xs text-stone-500 uppercase font-semibold mr-2">Input Weight</span>
                            <span className="font-bold text-stone-800">{t.inputWeight} Kg</span>
                          </div>
                          <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-200">
                            <span className="text-xs text-blue-600 uppercase font-semibold mr-2">Yield</span>
                            <span className="font-bold text-blue-800">{t.yieldPercentage}%</span>
                          </div>
                          {showFinancials && typeof t.effectiveCostPerKg === 'number' && (
                            <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
                              <span className="text-xs text-emerald-700 uppercase font-semibold mr-2">Cost Allocation</span>
                              <span className="font-bold text-emerald-900">₹{t.effectiveCostPerKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Kg</span>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Generated Outputs */}
                          <div>
                            <h4 className="text-sm font-bold text-stone-800 uppercase tracking-wider mb-3 flex items-center">
                              <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-500" /> Output Items
                            </h4>
                            <div className="space-y-3">
                              {t.targetProduct === 'Fancy' ? (
                                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-emerald-900 text-sm">Output Lot: {t.outputLotId}</span>
                                    <span className="font-bold text-emerald-700">{t.totalOutput} Kg</span>
                                  </div>
                                  {showFinancials && typeof t.effectiveCostPerKg === 'number' && (
                                    <div className="mt-2 pt-2 border-t border-emerald-200/50 flex justify-between text-xs">
                                      <span className="text-emerald-700 font-medium">Est Value: ₹{(t.totalOutput * t.effectiveCostPerKg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      <span className="text-emerald-600 font-medium">Rate: ₹{t.effectiveCostPerKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                t.outputs?.map((out, i) => (
                                  <div key={i} className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                                    <div className="flex justify-between items-center ml-2">
                                      <span className="font-bold text-stone-700 text-sm truncate max-w-[200px]" title={out.outputLotId || `${out.product || 'Output'} ${out.length}"`}>
                                        {out.outputLotId || `${out.product || 'Output'} ${out.length}"`}
                                      </span>
                                      <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{out.weight} Kg</span>
                                    </div>
                                    {showFinancials && (typeof t.effectiveCostPerKg === 'number' || out.rate !== undefined) && (
                                      <div className="mt-2 pt-2 border-t border-stone-100 flex justify-between text-xs ml-2">
                                        {(() => {
                                          const weightRatio = out.weight > 0 ? (out.weight / (t.totalOutput || 1)) : 1;
                                          const rate = out.rate !== undefined ? out.rate : ((t.effectiveCostPerKg / weightRatio) / 100);
                                          const estimatedValue = out.weight * rate;
                                          return (
                                            <>
                                              <span className="text-stone-500">Value: <span className="font-bold text-stone-700">₹{estimatedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                                              <span className="text-stone-500">Rate: <span className="font-medium text-stone-700">₹{rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/Kg</span></span>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Wastage */}
                          {t.wastageDetails && (
                            <div>
                              <h4 className="text-sm font-bold text-rose-800 uppercase tracking-wider mb-3 flex items-center">
                                <Trash2 className="w-4 h-4 mr-1.5 text-rose-500" /> Wastage Breakdown ({t.totalWastage} Kg)
                              </h4>
                              <div className="bg-rose-50/50 p-2 rounded-xl border border-rose-100">
                                <WastageItem label="Moisture Loss" value={t.wastageDetails.moistureLoss} />
                                <WastageItem label="Handling Wastage" value={t.wastageDetails.handlingWastage} />
                                <WastageItem label="Unusable Short Hair" value={t.wastageDetails.shortHair} />
                                <WastageItem label="Rubber Bands" value={t.wastageDetails.rubberBands} />
                                <WastageItem label="Misc Foreign Material" value={t.wastageDetails.foreignMaterial} />
                                <WastageItem label="Adulteration (Synthetics)" value={t.wastageDetails.adulterationSynthetics} />
                                <WastageItem label="Adulteration (Oil)" value={t.wastageDetails.adulterationOil} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {traceResult.transformations.length === 0 && (
                  <div className="flex items-center space-x-6">
                    <div className="flex flex-col items-center mt-2">
                      <div className="w-12 h-12 rounded-full bg-stone-100 border-4 border-white shadow-sm flex items-center justify-center text-stone-400 z-10">
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="flex-1 bg-stone-50 p-6 rounded-2xl border border-stone-200 border-dashed text-center">
                      <p className="text-stone-500 font-medium">No processing pipeline steps recorded yet for this lot.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
