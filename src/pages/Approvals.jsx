import React, { useState, useEffect } from 'react';
import { getCollection, updateDocument, setDocument, deleteDocument, addDocument, getDocument } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, XCircle, Clock, ShieldAlert, Printer, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { db } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function Approvals() {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [standardRateLists, setStandardRateLists] = useState([]);
  const [selectedRateLists, setSelectedRateLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { isAdminUser } = useAuth();

  useEffect(() => {
    if (!isAdminUser) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'pending_approvals'), (snapshot) => {
      const approvalsData = [];
      snapshot.forEach((doc) => {
        approvalsData.push({ id: doc.id, ...doc.data() });
      });
      approvalsData.sort((a, b) => (b.processedAt?.seconds || 0) - (a.processedAt?.seconds || 0));
      setPendingApprovals(approvalsData);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching pending approvals:", err);
      setError(`Failed to load pending approvals: ${err.message || err}`);
      setLoading(false);
    });

    const unsubscribeStandardRates = onSnapshot(collection(db, 'standard_rates'), (snapshot) => {
      const ratesData = [];
      snapshot.forEach((doc) => {
        ratesData.push({ id: doc.id, ...doc.data() });
      });
      setStandardRateLists(ratesData);
    }, (err) => {
      console.error("Error fetching standard rates:", err);
    });

    return () => {
      unsubscribe();
      unsubscribeStandardRates();
    };
  }, [isAdminUser]);

  const handleApprove = async (approvalDoc) => {
    if (!window.confirm("Approve this processing run? This will update inventory and record the transformation.")) return;
    
    try {
      setLoading(true);
      
      const { id, pendingFancyLot, ...transformationData } = approvalDoc;

      // 1. If it's Fancy, create the new lot
      if (transformationData.targetProduct === 'Fancy' && pendingFancyLot) {
        await setDocument('lots', pendingFancyLot.id, pendingFancyLot);
      } else if (transformationData.targetProduct === 'Segregated Goli' && transformationData.pendingSegregatedLots) {
        for (const lot of transformationData.pendingSegregatedLots) {
          await setDocument('lots', lot.id, lot);
        }
      } else if (transformationData.outputs) {
        // 2. If it's INH, update the inventory collection
        for (const out of transformationData.outputs) {
          if (out.outputLotId) {
            await setDocument('lots', out.outputLotId, {
              id: out.outputLotId,
              materialType: transformationData.targetProduct,
              initialWeight: out.weight,
              remainingWeight: out.weight,
              pricePerUnit: out.rate,
              totalCost: out.weight * out.rate,
              purchaseDate: new Date(),
              status: 'Raw',
              currentStage: 'Initial',
              parentLotId: id,
              lengths: [{ length: out.length, weight: out.weight }],
              workroomId: out.workroomId || null
            });
          }

          const workroomIdStr = out.workroomId || 'unassigned';
          const invId = `${transformationData.targetProduct}-${out.length}-${workroomIdStr}`;
          const invDoc = await getDocument('inventory', invId);
          
          const value = out.weight * out.rate;
          
          if (invDoc) {
            const newTotalValue = (invDoc.totalValue || 0) + value;
            const newQuantity = (invDoc.quantityAvailable || 0) + out.weight;
            await updateDocument('inventory', invId, {
              quantityAvailable: newQuantity,
              totalValue: newTotalValue,
              averageRate: newQuantity > 0 ? newTotalValue / newQuantity : 0
            });
          } else {
            await setDocument('inventory', invId, {
              product: transformationData.targetProduct,
              length: out.length,
              workroomId: out.workroomId || null,
              quantityAvailable: out.weight,
              totalValue: value,
              averageRate: out.rate
            });
          }
        }
      }

      // 3. Add to transformations collection
      await setDocument('transformations', id, transformationData); // we can use the same ID or addDocument. Let's just set using the pending ID or create new. Wait, it's safer to use the same ID.

      // 4. Delete the pending approval document
      await deleteDocument('pending_approvals', id);
      
      setSuccess("Processing run approved successfully.");
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Approval error:", err);
      setError("Failed to approve processing run.");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (approvalDoc) => {
    if (!window.confirm("Reject this processing run? The deducted weight will be restored to the input lot.")) return;
    
    try {
      setLoading(true);
      const { id, inputLotId, inputWeight, inputLengths } = approvalDoc;
      
      // 1. Restore the weight to the input lot
      const lotDoc = await getDocument('lots', inputLotId);
      if (lotDoc) {
        const restoredWeight = (lotDoc.remainingWeight || 0) + inputWeight;
        
        let newLengths = lotDoc.lengths;
        if (inputLengths && inputLengths.length > 0 && lotDoc.lengths) {
           newLengths = lotDoc.lengths.map(l => {
              const used = inputLengths.find(il => il.length === l.length);
              if (used) {
                 return { ...l, weight: l.weight + used.weight };
              }
              return l;
           });
        }
        
        // If the lot was marked as Converted because its weight hit 0, we must revert it to Initial
        // so it reappears in the Processing dropdown.
        const newStage = restoredWeight >= lotDoc.initialWeight 
          ? 'Initial' 
          : (lotDoc.currentStage === 'Converted' ? 'Initial' : lotDoc.currentStage);

        await updateDocument('lots', inputLotId, {
          remainingWeight: restoredWeight,
          lengths: newLengths || null,
          status: restoredWeight >= lotDoc.initialWeight ? 'Raw' : 'Partially Processed',
          currentStage: newStage
        });
      }

      // 2. Delete the pending approval document
      await deleteDocument('pending_approvals', id);
      
      setSuccess("Processing run rejected. Weight restored to the original lot.");
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Rejection error:", err);
      setError("Failed to reject processing run.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id, targetProduct) => {
    try {
      const node = document.getElementById(`approval-card-${id}`);
      if (!node) return;
      
      // Temporarily hide the action buttons for the screenshot
      const actionsEl = document.getElementById(`approval-actions-${id}`);
      if (actionsEl) actionsEl.style.display = 'none';
      
      const dataUrl = await toPng(node, { 
        quality: 1.0, 
        pixelRatio: 2,
        backgroundColor: '#ffffff' 
      });
      
      // Restore actions
      if (actionsEl) actionsEl.style.display = 'flex';
      
      const link = document.createElement('a');
      link.download = `processing-run-${targetProduct}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error downloading image', err);
      setError('Failed to download image.');
      const actionsEl = document.getElementById(`approval-actions-${id}`);
      if (actionsEl) actionsEl.style.display = 'flex';
    }
  };

  const handlePrint = async (id) => {
    try {
      const node = document.getElementById(`approval-card-${id}`);
      if (!node) return;
      
      const actionsEl = document.getElementById(`approval-actions-${id}`);
      if (actionsEl) actionsEl.style.display = 'none';
      
      const dataUrl = await toPng(node, { 
        quality: 1.0, 
        pixelRatio: 2,
        backgroundColor: '#ffffff' 
      });
      
      if (actionsEl) actionsEl.style.display = 'flex';
      
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Approval</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; padding: 20px; font-family: sans-serif; }
              img { max-width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); }
              @media print {
                @page { margin: 0.5cm; }
                body { padding: 0; }
                img { border: none; box-shadow: none; }
              }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" onload="window.print();window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error('Error printing', err);
      setError('Failed to print.');
      const actionsEl = document.getElementById(`approval-actions-${id}`);
      if (actionsEl) actionsEl.style.display = 'flex';
    }
  };

  if (!isAdminUser) {
    return (
      <div className="p-8 text-center max-w-lg mx-auto">
        <ShieldAlert className="w-12 h-12 text-stone-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-stone-800">Admin Access Required</h2>
        <p className="text-stone-500 mt-2">Only administrators can approve or reject processing runs.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Pending Approvals</h1>
          <p className="text-stone-500">Review processing yields and costs before adding to inventory.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3 mb-6">
          <XCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-xl border border-green-100 flex items-center gap-3 mb-6">
          <CheckCircle2 className="w-5 h-5" />
          {success}
        </div>
      )}

      {loading && pendingApprovals.length === 0 ? (
        <div className="p-12 text-center text-stone-500">Loading pending approvals...</div>
      ) : pendingApprovals.length === 0 && !error ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-stone-900">All Caught Up</h3>
          <p className="text-stone-500 mt-1">There are no pending processing runs waiting for approval.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendingApprovals.map((doc) => (
            <div key={doc.id} id={`approval-card-${doc.id}`} className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <div>
                    <h3 className="font-bold text-stone-900">
                      Processing Run: {doc.targetProduct}
                    </h3>
                    <p className="text-xs text-stone-500">
                      Submitted on {doc.processedAt ? new Date(doc.processedAt.seconds * 1000).toLocaleString() : 'Unknown'}
                    </p>
                  </div>
                </div>
                <div id={`approval-actions-${doc.id}`} className="flex gap-3">
                  <button
                    onClick={() => handlePrint(doc.id)}
                    disabled={loading}
                    className="p-2 bg-white border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50"
                    title="Print"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDownload(doc.id, doc.targetProduct)}
                    disabled={loading}
                    className="p-2 bg-white border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50"
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleReject(doc)}
                    disabled={loading}
                    className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium text-sm transition-colors disabled:opacity-50"
                  >
                    Reject & Refund
                  </button>
                  <button
                    onClick={() => handleApprove(doc)}
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Run
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                    <p className="text-xs text-stone-500 uppercase font-bold tracking-wider mb-1">Input Lot</p>
                    <p className="font-bold text-stone-900 truncate" title={doc.inputLotId}>{doc.inputLotId}</p>
                    <p className="text-sm text-stone-600">{doc.inputWeight} Kg Processed</p>
                    {doc.inputLengths && doc.inputLengths.length > 0 && (
                      <div className="mt-2 text-xs text-stone-500 bg-white p-2 rounded border border-stone-200">
                        <p className="font-semibold mb-1">Lengths Used:</p>
                        <div className="grid grid-cols-2 gap-1">
                          {doc.inputLengths.map(il => (
                            <div key={il.length}>
                              {il.length}": {il.weight}kg
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                    <p className="text-xs text-stone-500 uppercase font-bold tracking-wider mb-1">Yield</p>
                    <p className="font-bold text-emerald-600 text-xl">{doc.yieldPercentage}%</p>
                    <p className="text-sm text-stone-600">{doc.totalOutput} Kg Output</p>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                    <p className="text-xs text-stone-500 uppercase font-bold tracking-wider mb-1">Wastage</p>
                    <p className="font-bold text-red-500 text-xl">{doc.totalWastage} Kg</p>
                    <p className="text-sm text-stone-600">Total Loss</p>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                    <p className="text-xs text-stone-500 uppercase font-bold tracking-wider mb-1">Cost Pool</p>
                    <p className="font-bold text-blue-600 text-xl">₹{(doc.inputCost + (doc.laborCost || 0)).toLocaleString()}</p>
                    <p className="text-sm text-stone-600">Avg: ₹{doc.effectiveCostPerKg?.toLocaleString()} / Kg</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Outputs Table */}
                  <div>
                    <h4 className="font-bold text-stone-900 mb-4 border-b border-stone-200 pb-2">Output Breakdown</h4>
                    {doc.targetProduct === 'Fancy' ? (
                      <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                        <p className="font-medium text-stone-800">Fancy Output Lot Pending:</p>
                        <p className="text-sm text-stone-600 mt-1 font-mono">{doc.pendingFancyLot?.id}</p>
                        <div className="flex justify-between mt-3 text-sm">
                          <span className="font-bold">{doc.totalOutput} Kg</span>
                          <span className="text-emerald-700 font-medium">₹{doc.effectiveCostPerKg?.toLocaleString()} / Kg</span>
                        </div>
                      </div>
                    ) : doc.targetProduct === 'Segregated Goli' ? (
                      <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-stone-200">
                          <thead className="bg-stone-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-bold text-stone-500 uppercase">Color</th>
                              <th className="px-4 py-2 text-right text-xs font-bold text-stone-500 uppercase">Weight</th>
                              <th className="px-4 py-2 text-right text-xs font-bold text-stone-500 uppercase">Rate</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-200">
                            {doc.pendingSegregatedLots?.map((lot, idx) => (
                              <tr key={idx} className="hover:bg-stone-50">
                                <td className="px-4 py-2 text-sm font-medium text-stone-900">{lot.color}</td>
                                <td className="px-4 py-2 text-sm font-bold text-blue-600 text-right">{lot.initialWeight} Kg</td>
                                <td className="px-4 py-2 text-sm text-emerald-700 text-right">₹{lot.pricePerUnit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Kg</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-stone-200">
                          <thead className="bg-stone-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-bold text-stone-500 uppercase">Length</th>
                              <th className="px-4 py-2 text-right text-xs font-bold text-stone-500 uppercase">Weight</th>
                              <th className="px-4 py-2 text-right text-xs font-bold text-stone-500 uppercase">Assigned Rate</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-200">
                            {doc.outputs?.map((out, idx) => (
                              <tr key={idx} className="hover:bg-stone-50">
                                <td className="px-4 py-2 text-sm font-medium text-stone-900">
                                  {out.outputLotId || `${out.length}"`}
                                </td>
                                <td className="px-4 py-2 text-sm font-bold text-blue-600 text-right">{out.weight} Kg</td>
                                <td className="px-4 py-2 text-sm text-emerald-700 text-right">₹{out.rate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Kg</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                  </div>

                  {/* Wastage Details */}
                  <div>
                    <h4 className="font-bold text-stone-900 mb-4 border-b border-stone-200 pb-2">Wastage Details</h4>
                    <div className="space-y-2">
                      {Object.entries(doc.wastageDetails || {}).filter(([_, val]) => Number(val) > 0).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-center text-sm">
                          <span className="text-stone-600 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <span className="font-medium text-red-500">{val} Kg</span>
                        </div>
                      ))}
                      {doc.totalWastage === 0 && (
                        <p className="text-sm text-stone-500 italic">No wastage recorded.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Analysis / Valuation Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 border-t border-stone-200 pt-6">
                  {/* Left Column: MF Table */}
                  <div>
                    {doc.costCalculationDetails?.multiplierTable && (
                      <div className="bg-purple-50 rounded-xl border border-purple-100 p-4 h-full flex flex-col">
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-purple-200 sm:h-[42px]">
                          <span className="bg-purple-200 text-purple-900 text-xs font-bold px-2 py-0.5 rounded border border-purple-300">MF</span>
                          <h5 className="font-bold text-purple-900 text-sm">
                            {doc.costCalculationDetails.multiplierTable.name} Applied
                          </h5>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-purple-600 font-semibold uppercase tracking-wider">Equivalent Units</p>
                            <p className="font-bold text-purple-900">{doc.costCalculationDetails.equivalentUnits?.toFixed(2)}</p>
                            <p className="text-[10px] text-purple-500 mt-1 flex flex-col">
                              <span>Sum of (Weight × MF)</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-purple-600 font-semibold uppercase tracking-wider">Base Rate (1.0x)</p>
                            <p className="font-bold text-purple-900">₹{doc.costCalculationDetails.baseRate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Kg</p>
                            <p className="text-[10px] text-purple-500 mt-1 flex flex-col">
                              <span>Cost Pool ÷ Eq. Units</span>
                            </p>
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border border-purple-100 overflow-hidden mt-auto">
                          <table className="min-w-full divide-y divide-purple-100">
                            <thead className="bg-purple-100/50">
                              <tr>
                                <th className="px-3 py-2 text-left text-[10px] font-bold text-purple-700 uppercase">Length</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-purple-700 uppercase">Factor</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-purple-700 uppercase">Weight</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-purple-700 uppercase">Rate</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-purple-700 uppercase">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-50">
                              {(() => {
                                const base = doc.costCalculationDetails.baseRate || 0;
                                let totalWeight = 0;
                                let totalValue = 0;
                                
                                const rows = Object.entries(doc.costCalculationDetails.multiplierTable.factors || {})
                                  .sort(([a], [b]) => Number(a) - Number(b))
                                  .filter(([len]) => doc.outputs?.some(o => Number(o.length) === Number(len))) // only show lengths that were produced
                                  .map(([length, factor]) => {
                                    const calcRate = base * factor;
                                    const outputItem = doc.outputs?.find(o => Number(o.length) === Number(length));
                                    const weight = outputItem ? Number(outputItem.weight) : 0;
                                    const total = weight * calcRate;
                                    
                                    totalWeight += weight;
                                    totalValue += total;
                                    
                                    return (
                                      <tr key={length} className="hover:bg-purple-50/50">
                                        <td className="px-3 py-1.5 text-xs font-medium text-purple-900">{length}"</td>
                                        <td className="px-3 py-1.5 text-xs font-bold text-purple-700 text-right">{Number(factor).toFixed(2)}x</td>
                                        <td className="px-3 py-1.5 text-xs text-purple-800 text-right">{weight.toFixed(2)} Kg</td>
                                        <td className="px-3 py-1.5 text-xs text-purple-800 text-right">
                                          ₹{calcRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 py-1.5 text-xs font-medium text-purple-900 text-right">
                                          ₹{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    );
                                  });
                                  
                                return (
                                  <>
                                    {rows}
                                    <tr className="bg-purple-100/30 border-t-2 border-purple-200">
                                      <td colSpan={2} className="px-3 py-2 text-xs font-bold text-purple-900 text-right">Total</td>
                                      <td className="px-3 py-2 text-xs font-bold text-purple-900 text-right">{totalWeight.toFixed(2)} Kg</td>
                                      <td></td>
                                      <td className="px-3 py-2 text-xs font-bold text-purple-900 text-right">
                                        ₹{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  </>
                                );
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Standard Market Value */}
                  <div>
                    {doc.targetProduct !== 'Fancy' && doc.targetProduct !== 'Segregated Goli' && (
                      <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 h-full flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 border-b border-amber-200 pb-2 sm:h-[42px]">
                          <h5 className="font-bold text-amber-900 text-sm flex items-center gap-2">
                            <span className="bg-amber-200 text-amber-900 text-xs font-bold px-2 py-0.5 rounded border border-amber-300">Market Compare</span>
                            Standard Market Value
                          </h5>
                          <select
                            className="text-xs border-amber-300 bg-white rounded-md text-stone-700 py-1 pl-2 pr-6 focus:ring-amber-500 focus:border-amber-500"
                            value={selectedRateLists[doc.id] || ''}
                            onChange={(e) => setSelectedRateLists(prev => ({ ...prev, [doc.id]: e.target.value }))}
                          >
                            <option value="">Select Rate List</option>
                            {standardRateLists.map(list => (
                              <option key={list.id} value={list.id}>{list.name}</option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Spacer block to vertically align table with the left card */}
                        <div className="grid grid-cols-2 gap-4 mb-4 invisible pointer-events-none select-none" aria-hidden="true">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider">Spacer</p>
                            <p className="font-bold">0</p>
                            <p className="text-[10px] mt-1 flex flex-col">
                              <span>Spacer</span>
                            </p>
                          </div>
                        </div>

                        {selectedRateLists[doc.id] ? (() => {
                          const list = standardRateLists.find(l => l.id === selectedRateLists[doc.id]);
                          if (!list) return null;
                          
                          let standardTotalValue = 0;
                          let actualTotalValue = 0;
                          let totalWeight = 0;
                          
                          const rows = doc.outputs?.sort((a, b) => Number(a.length) - Number(b.length)).map(out => {
                            const stdRate = list.rates[out.length] || 0;
                            const weight = Number(out.weight) || 0;
                            const actualRate = Number(out.rate) || 0;
                            
                            const marketValue = weight * stdRate;
                            const actualValue = weight * actualRate;
                            const diff = marketValue - actualValue;
                            
                            standardTotalValue += marketValue;
                            actualTotalValue += actualValue;
                            totalWeight += weight;
                            
                            return (
                              <tr key={out.length} className="hover:bg-amber-100/50">
                                <td className="px-3 py-1.5 text-xs font-medium text-amber-900">{out.length}"</td>
                                <td className="px-3 py-1.5 text-xs text-amber-800 text-right">
                                  ₹{stdRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-3 py-1.5 text-xs text-amber-800 text-right">{weight.toFixed(2)} Kg</td>
                                <td className="px-3 py-1.5 text-xs text-amber-900 font-medium text-right">
                                  ₹{marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className={`px-3 py-1.5 text-xs font-bold text-right ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {diff >= 0 ? '+' : ''}₹{diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          });
                          
                          const totalDiff = standardTotalValue - actualTotalValue;
                          const costPool = (doc.inputCost || 0) + (doc.laborCost || 0);
                          const marginPercentage = costPool > 0 ? (totalDiff / costPool) * 100 : 0;
                          
                          return (
                            <div className="flex-1 flex flex-col">
                              <div className="bg-white rounded-lg border border-amber-200 overflow-hidden mb-4">
                                <table className="min-w-full divide-y divide-amber-100">
                                  <thead className="bg-amber-100/50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-[10px] font-bold text-amber-800 uppercase">Length</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-bold text-amber-800 uppercase">Std Rate</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-bold text-amber-800 uppercase">Weight</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-bold text-amber-800 uppercase">Market Val</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-bold text-amber-800 uppercase">Diff</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-amber-50">
                                    {rows}
                                    <tr className="bg-amber-100/30 border-t-2 border-amber-200">
                                      <td colSpan={2} className="px-3 py-2 text-xs font-bold text-amber-900 text-right">Total</td>
                                      <td className="px-3 py-2 text-xs font-bold text-amber-900 text-right">{totalWeight.toFixed(2)} Kg</td>
                                      <td className="px-3 py-2 text-xs font-bold text-amber-900 text-right">
                                        ₹{standardTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className={`px-3 py-2 text-xs font-bold text-right ${totalDiff >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {totalDiff >= 0 ? '+' : ''}₹{totalDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 bg-white p-3 rounded-lg border border-amber-200 shadow-sm mt-auto">
                                 <div>
                                   <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Total Market Value</p>
                                   <p className="font-bold text-amber-900 text-lg">₹{standardTotalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                 </div>
                                 <div>
                                   <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Total Value Created</p>
                                   <p className={`font-bold text-lg ${totalDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                     {totalDiff >= 0 ? '+' : ''}₹{totalDiff.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                     <span className="text-xs ml-1 opacity-75">({totalDiff >= 0 ? '+' : ''}{marginPercentage.toFixed(1)}%)</span>
                                   </p>
                                 </div>
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="flex-1 flex items-center justify-center text-amber-700/60 text-sm italic p-8 text-center bg-white/50 rounded-lg border border-amber-100 border-dashed">
                            Select a standard rate list from the dropdown to compare yields.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
