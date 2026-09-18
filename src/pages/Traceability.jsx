import React, { useState, useEffect, useRef } from 'react';
import { getCollection, deleteDocument, updateDocument, getDocument } from '../services/db';
import { Search, ArrowRight, Package, Droplets, Trash2, GitBranch, History, ChevronDown, CheckCircle2, Printer, Download, Eye, Image } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import LotDetailsModal from '../components/LotDetailsModal';
import { useAuth } from '../context/AuthContext';
import { toPng } from 'html-to-image';

export default function Traceability() {
  const { permissions } = useAuth();
  const isAdmin = permissions?.financials; 
  const showFinancials = permissions?.financials;

  const [searchParams, setSearchParams] = useSearchParams();
  const initialLotId = searchParams.get('lotId');

  const [activeTab, setActiveTab] = useState('lots');
  const [lots, setLots] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [workrooms, setWorkrooms] = useState([]);
  
  const [searchLot, setSearchLot] = useState('');
  const [traceResult, setTraceResult] = useState(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [viewingLotDetails, setViewingLotDetails] = useState(null);
  const [standardRateLists, setStandardRateLists] = useState([]);
  const [selectedRateLists, setSelectedRateLists] = useState({});
  const printRef = useRef(null);

  useEffect(() => {
    if (showFinancials) {
      const fetchRates = async () => {
        try {
          const snap = await getCollection('standard_rates');
          setStandardRateLists(snap);
        } catch (e) {
          console.error("Error fetching rate lists", e);
        }
      };
      fetchRates();
    }
  }, [showFinancials]);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const originalContents = document.body.innerHTML;
    const printHtml = `
      <div style="padding: 20px; font-family: sans-serif;">
        <h2 style="font-size: 24px; margin-bottom: 20px;">Lot Traceability Report</h2>
        ${printContent.innerHTML}
      </div>
    `;

    document.body.innerHTML = printHtml;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload();
  };

  const handleDownloadCSV = () => {
    if (!traceResult || traceResult.type !== 'lot') return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Type,Date,Product,Weight (Kg),Yield %,Outputs/Lengths\n";
    
    // Add original lot
    const lot = traceResult.lot;
    const lengthsStr = lot.lengths ? lot.lengths.map(l => `${l.length}":${l.weight}kg`).join(';') : '';
    csvContent += `Origin Lot,${new Date(lot.createdAt?.seconds * 1000).toLocaleDateString()},${lot.materialType},${lot.initialWeight},100%,${lengthsStr}\n`;
    
    // Add transformations
    traceResult.transformations.forEach(t => {
      const date = t.processedAt ? new Date(t.processedAt.seconds * 1000).toLocaleDateString() : '';
      let outputsStr = '';
      if (t.targetProduct === 'Fancy') {
        outputsStr = `Output Lot: ${t.outputLotId}`;
      } else if (t.outputs) {
        outputsStr = t.outputs.map(o => `${o.length}":${o.weight}kg`).join(';');
      }
      csvContent += `Processing,${date},${t.targetProduct},${t.inputWeight},${t.yieldPercentage}%,${outputsStr}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Traceability_${traceResult.lot.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadImage = async () => {
    const printContent = printRef.current;
    if (!printContent || !traceResult) return;
    
    // Temporarily adjust styles for better image rendering if needed
    const originalStyle = printContent.style.cssText;
    printContent.style.padding = '20px';
    printContent.style.background = '#ffffff';
    
    try {
      const dataUrl = await toPng(printContent, { 
        backgroundColor: '#ffffff',
        pixelRatio: 2
      });
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Traceability_${traceResult.lot.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to generate image", err);
      alert("Failed to generate image.");
    } finally {
      printContent.style.cssText = originalStyle;
    }
  };

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
      const [lotsData, transData, invData, wrData] = await Promise.all([
        getCollection('lots'),
        getCollection('stock_transfers'),
        getCollection('inventory'),
        getCollection('workrooms')
      ]);
      setLots(lotsData.reverse());
      setTransfers(transData.sort((a,b) => {
        const dateA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.date).getTime();
        const dateB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.date).getTime();
        return dateB - dateA;
      }));
      setInventory(invData);
      setWorkrooms(wrData);
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
            <h1 className="text-2xl font-bold text-stone-900">Traceability & Reports</h1>
            <p className="text-stone-500 text-sm mt-1">Trace lots and view inventory movements</p>
          </div>
        </div>
        
        <div className="flex bg-stone-100 p-1 rounded-xl">
          <button onClick={() => setActiveTab('lots')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'lots' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Lots</button>
          <button onClick={() => setActiveTab('transfers')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'transfers' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Stock Transfers</button>
          <button onClick={() => setActiveTab('finished')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'finished' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Finished Goods</button>
          <button onClick={() => setActiveTab('locations')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'locations' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Locations</button>
        </div>
      </div>

      {activeTab === 'lots' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex justify-end">
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
          <div className="flex justify-end items-center mb-6 space-x-3">
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-medium transition-colors text-sm">
              <Printer className="w-4 h-4" /> Print Trace
            </button>
            <button onClick={handleDownloadImage} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-medium transition-colors text-sm">
              <Image className="w-4 h-4" /> Save Image
            </button>
            <button onClick={handleDownloadCSV} className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors text-sm">
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>
          <div ref={printRef}>
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
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-bold text-stone-900">{traceResult.lot.id}</h3>
                          <button 
                            onClick={() => setViewingLotDetails(traceResult.lot)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                          >
                            <Eye className="w-4 h-4" /> View Details
                          </button>
                        </div>
                        {traceResult.lot.comment && <div className="text-sm font-normal text-stone-500 mt-1 whitespace-normal break-words max-w-[400px]">{traceResult.lot.comment}</div>}
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-stone-200 text-stone-700 text-xs font-bold rounded-full uppercase tracking-wider">
                      {traceResult.lot.materialType || (() => {
                        const lotId = traceResult.lot.id || '';
                        if (lotId.includes('-FANCY-')) return 'Fancy';
                        if (lotId.includes('-GOLI-')) return 'Segregated Goli';
                        if (lotId.startsWith('LOT-') && !lotId.includes('-FANCY-') && !lotId.includes('-GOLI-')) return 'Raw Material (Archived)';
                        return 'Unknown';
                      })()}
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
                            {t.comment && <div className="text-sm font-normal text-stone-500 mt-1 whitespace-normal break-words max-w-[400px]">{t.comment}</div>}
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
                        
                        <div className="flex flex-col xl:flex-row gap-6 mb-6">
                          {/* Stats Left */}
                          <div className="flex-1 flex flex-wrap gap-3 content-start">
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

                          {/* Wastage Right */}
                          {t.wastageDetails && (
                            <div className="w-full xl:w-96 flex-shrink-0 bg-rose-50/50 p-4 rounded-xl border border-rose-100 shadow-sm">
                              <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-3 flex items-center">
                                <Trash2 className="w-4 h-4 mr-1.5 text-rose-500" /> Wastage Breakdown ({t.totalWastage} Kg)
                              </h4>
                              <div className="space-y-1">
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

                        <div className="flex flex-col xl:flex-row gap-6">
                          {/* Generated Outputs and Market Compare */}
                          <div className={`flex-1 ${showFinancials && t.targetProduct !== 'Fancy' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}`}>
                            <div className="flex-1">
                            <h4 className="text-sm font-bold text-stone-800 uppercase tracking-wider mb-3 flex items-center h-[24px]">
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
                                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
                                  <table className="min-w-full divide-y divide-stone-200">
                                    <thead className="bg-emerald-50">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-800 uppercase">Length</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-800 uppercase">Output Lot</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-800 uppercase">Weight</th>
                                        {showFinancials && <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-800 uppercase">Rate</th>}
                                        {showFinancials && <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-800 uppercase">Value</th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stone-100 bg-white">
                                      {t.outputs?.slice().sort((a,b) => Number(a.length) - Number(b.length)).map((out, i) => {
                                        let rate = null;
                                        let estimatedValue = null;
                                        if (showFinancials && (typeof t.effectiveCostPerKg === 'number' || out.rate !== undefined)) {
                                          const weightRatio = out.weight > 0 ? (out.weight / (t.totalOutput || 1)) : 1;
                                          rate = out.rate !== undefined ? out.rate : ((t.effectiveCostPerKg / weightRatio) / 100);
                                          estimatedValue = out.weight * rate;
                                        }
                                        return (
                                          <tr key={i} className="hover:bg-stone-50 transition-colors">
                                            <td className="px-3 py-2 whitespace-nowrap text-sm font-bold text-stone-900">
                                              {out.length}"
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-xs text-stone-500 truncate max-w-[150px]" title={out.outputLotId || `${out.product || 'Output'}`}>
                                              {out.outputLotId || `${out.product || 'Output'}`}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-sm font-bold text-emerald-600 text-right">
                                              {out.weight} Kg
                                            </td>
                                            {showFinancials && (
                                              <td className="px-3 py-2 whitespace-nowrap text-sm text-stone-500 text-right">
                                                {rate !== null ? `₹${rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                              </td>
                                            )}
                                            {showFinancials && (
                                              <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-stone-800 text-right">
                                                {estimatedValue !== null ? `₹${estimatedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                              </td>
                                            )}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Market Compare */}
                          {showFinancials && t.targetProduct !== 'Fancy' && (
                            <div className="flex-1">
                              <div className="flex justify-between items-center mb-3 h-[24px]">
                                <h4 className="text-sm font-bold text-amber-800 uppercase tracking-wider flex items-center">
                                  <Package className="w-4 h-4 mr-1.5 text-amber-500" /> Market Compare
                               </h4>
                               <select 
                                  className="text-xs border border-stone-200 rounded px-2 py-1"
                                  value={selectedRateLists[t.id] || ''}
                                  onChange={(e) => setSelectedRateLists(prev => ({...prev, [t.id]: e.target.value}))}
                               >
                                 <option value="">Select Rate List</option>
                                 {standardRateLists.map(list => (
                                   <option key={list.id} value={list.id}>{list.name}</option>
                                 ))}
                               </select>
                              </div>
                              
                              {selectedRateLists[t.id] ? (() => {
                                const list = standardRateLists.find(l => l.id === selectedRateLists[t.id]);
                                if (!list) return null;

                                let marketTotal = 0;
                                let actualTotal = 0;
                                let totalWeight = 0;

                                const rows = t.outputs.slice().sort((a,b) => Number(a.length) - Number(b.length)).map((out, i) => {
                                  const stdRate = list.rates[out.length] || 0;
                                  const weight = Number(out.weight) || 0;
                                  
                                  const weightRatio = weight > 0 ? (weight / (t.totalOutput || 1)) : 1;
                                  const actualRate = out.rate !== undefined ? out.rate : ((t.effectiveCostPerKg / weightRatio) / 100);
                                  
                                  const marketVal = stdRate * weight;
                                  const actualVal = actualRate * weight;
                                  const diff = marketVal - actualVal;

                                  marketTotal += marketVal;
                                  actualTotal += actualVal;
                                  totalWeight += weight;

                                  return (
                                    <tr key={i} className="hover:bg-amber-50/50 transition-colors">
                                      <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-amber-900">{out.length}"</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-sm text-amber-700 text-right">₹{stdRate.toLocaleString()}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-sm font-bold text-amber-800 text-right">{weight.toFixed(2)}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-amber-900 text-right">₹{marketVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                      <td className={`px-3 py-2 whitespace-nowrap text-sm font-bold text-right ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {diff >= 0 ? '+' : ''}₹{diff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                      </td>
                                    </tr>
                                  );
                                });

                                const totalDiff = marketTotal - actualTotal;

                                return (
                                  <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm flex flex-col h-[calc(100%-36px)]">
                                    <table className="min-w-full divide-y divide-amber-100 flex-1">
                                      <thead className="bg-amber-50">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-xs font-semibold text-amber-800 uppercase">Length</th>
                                          <th className="px-3 py-2 text-right text-xs font-semibold text-amber-800 uppercase">Std Rate</th>
                                          <th className="px-3 py-2 text-right text-xs font-semibold text-amber-800 uppercase">Weight</th>
                                          <th className="px-3 py-2 text-right text-xs font-semibold text-amber-800 uppercase">Market Val</th>
                                          <th className="px-3 py-2 text-right text-xs font-semibold text-amber-800 uppercase">Diff</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-amber-100 bg-white">
                                        {rows}
                                        <tr className="bg-amber-50/50 border-t border-amber-200">
                                          <td colSpan={2} className="px-3 py-2 text-right text-sm font-bold text-amber-900">Total</td>
                                          <td className="px-3 py-2 text-right text-sm font-bold text-amber-900">{totalWeight.toFixed(2)}</td>
                                          <td className="px-3 py-2 text-right text-sm font-bold text-amber-900">₹{marketTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                          <td className={`px-3 py-2 text-right text-sm font-bold ${totalDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {totalDiff >= 0 ? '+' : ''}₹{totalDiff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                    
                                    <div className="bg-amber-50 p-3 border-t border-amber-200 flex justify-between items-center mt-auto">
                                      <div>
                                        <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Total Market Value</p>
                                        <p className="text-lg font-bold text-amber-900">₹{marketTotal.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Total Value Created</p>
                                        <p className={`text-lg font-bold ${totalDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                          {totalDiff >= 0 ? '+' : ''}₹{totalDiff.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                          <span className="text-xs ml-1 opacity-75">
                                            ({totalDiff >= 0 ? '+' : ''}{(actualTotal > 0 ? (totalDiff / actualTotal) * 100 : 0).toFixed(1)}%)
                                          </span>
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })() : (
                                <div className="bg-stone-50 border border-dashed border-stone-300 rounded-xl p-8 flex flex-col items-center justify-center text-stone-500 h-[calc(100%-36px)]">
                                  <Package className="w-8 h-8 mb-2 opacity-50" />
                                  <p className="text-sm font-medium">Select a rate list</p>
                                  <p className="text-xs text-center mt-1">Choose a standard rate list from the dropdown to compare yields.</p>
                                </div>
                              )}
                            </div>
                          )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {traceResult.transformations.length === 0 && (
                  <div className="flex items-center space-x-6 mt-8">
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
        </div>
      )}
      </div>
      )}

      {activeTab === 'transfers' && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-500 uppercase tracking-wider">Quantity</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Source &rarr; Target</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">MO Number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {transfers.map(t => {
                const source = workrooms.find(w => w.id === t.sourceWorkroomId)?.name || 'Unassigned';
                const target = workrooms.find(w => w.id === t.targetWorkroomId)?.name || 'Unassigned';
                return (
                  <tr key={t.id} className="hover:bg-stone-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-stone-900">{t.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-500">{t.date || (t.timestamp?.seconds ? new Date(t.timestamp.seconds * 1000).toLocaleDateString() : '')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">{t.productId} - {t.length}"</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600 text-right">{t.quantity} Kg</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-600">
                      {source} <ArrowRight className="inline w-3 h-3 mx-1 text-stone-400" /> {target}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-500">{t.moNumber || '-'}</td>
                  </tr>
                );
              })}
              {transfers.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-stone-500">No stock transfers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'finished' && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Length</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-500 uppercase tracking-wider">Available (Kg)</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-500 uppercase tracking-wider">Blocked (Kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {inventory.map(item => {
                const location = workrooms.find(w => w.id === item.workroomId)?.name || 'Unassigned';
                return (
                  <tr key={item.id} className="hover:bg-stone-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-stone-900">{item.product}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-500">{item.length}"</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-500">{location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-emerald-600 text-right">{item.quantityAvailable?.toFixed(2) || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-600 text-right">{item.quantityBlocked?.toFixed(2) || 0}</td>
                  </tr>
                );
              })}
              {inventory.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-stone-500">No finished goods found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'locations' && (
        <div className="space-y-6">
          {workrooms.map(workroom => {
            const wrInventory = inventory.filter(i => i.workroomId === workroom.id);
            if (wrInventory.length === 0) return null;
            return (
              <div key={workroom.id} className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                <div className="px-6 py-4 bg-stone-50 border-b border-stone-200">
                  <h3 className="text-lg font-bold text-stone-900">{workroom.name}</h3>
                </div>
                <table className="min-w-full divide-y divide-stone-200">
                  <thead className="bg-white">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Length</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">Available (Kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {wrInventory.map(item => (
                      <tr key={item.id} className="hover:bg-stone-50">
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-stone-900">{item.product}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-stone-500">{item.length}"</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-bold text-emerald-600 text-right">{item.quantityAvailable?.toFixed(2) || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          
          {(() => {
            const unassignedInventory = inventory.filter(i => !i.workroomId || i.workroomId === 'unassigned');
            if (unassignedInventory.length === 0) return null;
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                <div className="px-6 py-4 bg-stone-50 border-b border-stone-200">
                  <h3 className="text-lg font-bold text-stone-900">Unassigned / Main Storage</h3>
                </div>
                <table className="min-w-full divide-y divide-stone-200">
                  <thead className="bg-white">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Length</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">Available (Kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {unassignedInventory.map(item => (
                      <tr key={item.id} className="hover:bg-stone-50">
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-stone-900">{item.product}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-stone-500">{item.length}"</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-bold text-emerald-600 text-right">{item.quantityAvailable?.toFixed(2) || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {viewingLotDetails && (
        <LotDetailsModal 
          lot={viewingLotDetails} 
          supplierName={viewingLotDetails.supplierId}
          showFinancials={showFinancials}
          onClose={() => setViewingLotDetails(null)} 
        />
      )}
    </div>
  );
}
