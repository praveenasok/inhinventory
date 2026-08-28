import React, { useState, useEffect } from 'react';
import { getCollection, updateDocument, setDocument, deleteDocument, addDocument, getDocument } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function Approvals() {
  const [pendingApprovals, setPendingApprovals] = useState([]);
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
      // Sort by newest first
      approvalsData.sort((a, b) => (b.processedAt?.seconds || 0) - (a.processedAt?.seconds || 0));
      setPendingApprovals(approvalsData);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching pending approvals:", err);
      setError(`Failed to load pending approvals: ${err.message || err}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdminUser]);

  const handleApprove = async (approvalDoc) => {
    if (!window.confirm("Approve this processing run? This will update inventory and record the transformation.")) return;
    
    try {
      setLoading(true);
      
      const { id, pendingFancyLot, ...transformationData } = approvalDoc;

      // 1. If it's Fancy, create the new lot
      if (transformationData.targetProduct === 'Fancy' && pendingFancyLot) {
        await setDocument('lots', pendingFancyLot.id, pendingFancyLot);
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
              lengths: [{ length: out.length, weight: out.weight }]
            });
          }

          const invId = `${transformationData.targetProduct}-${out.length}`;
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
            <div key={doc.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
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
                <div className="flex gap-3">
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

                    {/* Display MF Table and Calculation Steps if available */}
                    {doc.costCalculationDetails?.multiplierTable && (
                      <div className="mt-6 bg-purple-50 rounded-xl border border-purple-100 p-4">
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-purple-200">
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

                        <div className="bg-white rounded-lg border border-purple-100 overflow-hidden">
                          <table className="min-w-full divide-y divide-purple-100">
                            <thead className="bg-purple-100/50">
                              <tr>
                                <th className="px-3 py-2 text-left text-[10px] font-bold text-purple-700 uppercase">Length</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-purple-700 uppercase">Factor</th>
                                <th className="px-3 py-2 text-right text-[10px] font-bold text-purple-700 uppercase">Calculated Rate</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-50">
                              {Object.entries(doc.costCalculationDetails.multiplierTable.factors || {})
                                .sort(([a], [b]) => Number(a) - Number(b))
                                .filter(([len]) => doc.outputs?.some(o => Number(o.length) === Number(len))) // only show lengths that were produced
                                .map(([length, factor]) => {
                                  const base = doc.costCalculationDetails.baseRate || 0;
                                  const calcRate = base * factor;
                                  return (
                                    <tr key={length} className="hover:bg-purple-50/50">
                                      <td className="px-3 py-1.5 text-xs font-medium text-purple-900">{length}"</td>
                                      <td className="px-3 py-1.5 text-xs font-bold text-purple-700 text-right">{Number(factor).toFixed(2)}x</td>
                                      <td className="px-3 py-1.5 text-xs text-purple-800 text-right">
                                        ₹{calcRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
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

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
