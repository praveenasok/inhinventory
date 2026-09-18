import React, { useRef, useState, useEffect } from 'react';
import { X, Printer, Download, Image as ImageIcon } from 'lucide-react';
import { toPng } from 'html-to-image';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
export default function LotDetailsModal({ lot, supplierName, onClose, showFinancials }) {
  const printRef = useRef();
  const [standardRateLists, setStandardRateLists] = useState([]);
  const [selectedRateList, setSelectedRateList] = useState('');

  useEffect(() => {
    if (showFinancials && lot?.lengths?.length > 0) {
      const fetchRates = async () => {
        try {
          const snap = await getDocs(collection(db, 'standard_rates'));
          const lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setStandardRateLists(lists);
        } catch (e) {
          console.error("Error fetching rate lists", e);
        }
      };
      fetchRates();
    }
  }, [showFinancials, lot]);

  if (!lot) return null;

  const handlePrint = () => {
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Lot Details - ${lot.id}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #333; }
            h1, h2, h3, p { margin: 0 0 10px 0; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .box { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f9fafb; font-weight: 600; }
            .text-right { text-align: right; }
          </style>
        </head>
        <body>
          ${printContent}
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadCSV = () => {
    let csvContent = `Lot ID,${lot.id}\n`;
    csvContent += `Supplier,${supplierName || lot.supplierId}\n`;
    csvContent += `Material Type,${lot.materialType}\n`;
    csvContent += `Status,${lot.status || 'Raw'}\n`;
    csvContent += `Initial Weight (Kg),${lot.initialWeight}\n`;
    csvContent += `Remaining Weight (Kg),${lot.remainingWeight ?? lot.initialWeight}\n`;
    csvContent += `Purchase Date,${lot.purchaseDate ? new Date(lot.purchaseDate.seconds * 1000 || lot.purchaseDate).toLocaleDateString() : 'Unknown'}\n`;
    
    if (showFinancials) {
      csvContent += `Total Cost (INR),${lot.totalCost || 0}\n`;
      if (lot.pricePerUnit) csvContent += `Price Per Unit (INR),${lot.pricePerUnit}\n`;
      if (lot.laborCost) csvContent += `Labor Cost (INR),${lot.laborCost}\n`;
      if (lot.shippingCost) csvContent += `Shipping Cost (INR),${lot.shippingCost}\n`;
      if (lot.miscCost) csvContent += `Misc Cost (INR),${lot.miscCost}\n`;
    }

    csvContent += `\n`;
    
    if (lot.lengths && lot.lengths.length > 0) {
      csvContent += `Lengths Breakdown\n`;
      csvContent += `Length (Inches),Weight (Kg)${showFinancials ? ',Rate (INR)' : ''}\n`;
      lot.lengths.forEach(l => {
        csvContent += `${l.length},${l.weight}${showFinancials ? `,${l.rate || ''}` : ''}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Lot_${lot.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadImage = async () => {
    const printContent = printRef.current;
    if (!printContent || !lot) return;
    
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
      link.download = `LotDetails_${lot.id}.png`;
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">Lot Details</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-2 mr-4 border-r pr-4 border-gray-200">
              <button onClick={handlePrint} className="p-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 rounded-lg transition-colors shadow-sm" title="Print Details">
                <Printer className="w-4 h-4" />
              </button>
              <button onClick={handleDownloadImage} className="p-2 bg-white hover:bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg transition-colors shadow-sm" title="Save as Image">
                <ImageIcon className="w-4 h-4" />
              </button>
              <button onClick={handleDownloadCSV} className="p-2 bg-white hover:bg-blue-50 border border-blue-100 text-blue-700 rounded-lg transition-colors shadow-sm" title="Download CSV">
                <Download className="w-4 h-4" />
              </button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 p-1 rounded-md transition-colors border border-transparent hover:border-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div ref={printRef}>
            <div style={{ paddingBottom: '20px', borderBottom: '2px solid #f3f4f6', marginBottom: '20px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: '0 0 4px 0' }}>{lot.id}</h1>
              <p style={{ color: '#6b7280', margin: 0 }}>Material: {lot.materialType} &bull; Supplier: {supplierName || lot.supplierId}</p>
            </div>

            <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div className="box" style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', margin: '0 0 12px 0', letterSpacing: '0.05em' }}>Status & Weights</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#4b5563', fontSize: '14px' }}>Status</span>
                  <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{lot.status || 'Raw'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#4b5563', fontSize: '14px' }}>Initial Weight</span>
                  <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{lot.initialWeight} Kg</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4b5563', fontSize: '14px' }}>Remaining Weight</span>
                  <span style={{ fontWeight: '600', color: '#2563eb', fontSize: '14px' }}>{lot.remainingWeight ?? lot.initialWeight} Kg</span>
                </div>
              </div>

              {showFinancials && (
                <div className="box" style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#6b7280', fontWeight: 'bold', margin: '0 0 12px 0', letterSpacing: '0.05em' }}>Financials</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#4b5563', fontSize: '14px' }}>Total Cost</span>
                    <span style={{ fontWeight: '600', color: '#059669', fontSize: '14px' }}>₹{(lot.totalCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {lot.pricePerUnit && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#4b5563', fontSize: '14px' }}>Price Per Unit</span>
                      <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>₹{lot.pricePerUnit.toFixed(2)} / Kg</span>
                    </div>
                  )}
                  {lot.laborCost > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#4b5563', fontSize: '14px' }}>Labor Cost</span>
                      <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>₹{lot.laborCost.toLocaleString()}</span>
                    </div>
                  )}
                  {lot.shippingCost > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#4b5563', fontSize: '14px' }}>Shipping Cost</span>
                      <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>₹{lot.shippingCost.toLocaleString()}</span>
                    </div>
                  )}
                  {lot.miscCost > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#4b5563', fontSize: '14px' }}>Misc Cost</span>
                      <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>₹{lot.miscCost.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {lot.lengths && lot.lengths.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div className="grid" style={{ display: 'grid', gridTemplateColumns: showFinancials ? '1fr 1fr' : '1fr', gap: '20px' }}>
                  
                  {/* Left Column: Lengths Breakdown */}
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#111827', marginBottom: '12px', height: '24px' }}>Lengths Breakdown</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead style={{ backgroundColor: '#f3f4f6' }}>
                        <tr>
                          <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>Length</th>
                          <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>Weight (Kg)</th>
                          {showFinancials && <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>Rate (₹)</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let totalWeight = 0;
                          return (
                            <>
                              {lot.lengths.map((l, idx) => {
                                totalWeight += Number(l.weight) || 0;
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '10px', color: '#111827', fontWeight: '500' }}>{l.length}"</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#111827' }}>{l.weight}</td>
                                    {showFinancials && (
                                      <td style={{ padding: '10px', textAlign: 'right', color: '#111827' }}>
                                        {l.rate ? `₹${l.rate.toLocaleString()}` : '-'}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                              {/* Total Row */}
                              <tr style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                                <td style={{ padding: '10px', color: '#111827', fontWeight: 'bold' }}>Total</td>
                                <td style={{ padding: '10px', textAlign: 'right', color: '#111827', fontWeight: 'bold' }}>{totalWeight.toFixed(2)}</td>
                                {showFinancials && <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}></td>}
                              </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Right Column: Market Compare */}
                  {showFinancials && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', height: '24px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#111827', margin: 0 }}>Market Compare</h3>
                        <select 
                          style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '12px', background: '#fff' }}
                          value={selectedRateList}
                          onChange={(e) => setSelectedRateList(e.target.value)}
                        >
                          <option value="">Select Rate List</option>
                          {standardRateLists.map(list => (
                            <option key={list.id} value={list.id}>{list.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      {selectedRateList ? (() => {
                        const list = standardRateLists.find(l => l.id === selectedRateList);
                        if (!list) return null;

                        let marketTotal = 0;
                        let actualTotal = 0;
                        let totalWeight = 0;

                        const rows = lot.lengths.slice().sort((a,b) => Number(a.length) - Number(b.length)).map(l => {
                          const stdRate = list.rates[l.length] || 0;
                          const weight = Number(l.weight) || 0;
                          const actualRate = Number(l.rate) || 0;
                          
                          const marketVal = stdRate * weight;
                          const actualVal = actualRate * weight;
                          const diff = marketVal - actualVal;

                          marketTotal += marketVal;
                          actualTotal += actualVal;
                          totalWeight += weight;

                          return (
                            <tr key={l.length} style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '10px', color: '#111827', fontWeight: '500' }}>{l.length}"</td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#111827' }}>₹{stdRate.toLocaleString()}</td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#111827' }}>{weight.toFixed(2)}</td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#111827', fontWeight: '500' }}>₹{marketVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: diff >= 0 ? '#059669' : '#dc2626' }}>
                                {diff >= 0 ? '+' : ''}₹{diff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </td>
                            </tr>
                          );
                        });

                        const totalDiff = marketTotal - actualTotal;

                        return (
                          <>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                              <thead style={{ backgroundColor: '#fef3c7' }}>
                                <tr>
                                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #fde68a', color: '#92400e' }}>Length</th>
                                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #fde68a', color: '#92400e' }}>Std Rate</th>
                                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #fde68a', color: '#92400e' }}>Weight</th>
                                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #fde68a', color: '#92400e' }}>Market Val</th>
                                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #fde68a', color: '#92400e' }}>Diff</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows}
                                <tr style={{ borderBottom: '1px solid #fde68a', backgroundColor: '#fffbeb' }}>
                                  <td colSpan={2} style={{ padding: '10px', color: '#92400e', fontWeight: 'bold', textAlign: 'right' }}>Total</td>
                                  <td style={{ padding: '10px', textAlign: 'right', color: '#92400e', fontWeight: 'bold' }}>{totalWeight.toFixed(2)}</td>
                                  <td style={{ padding: '10px', textAlign: 'right', color: '#92400e', fontWeight: 'bold' }}>
                                    ₹{marketTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                  </td>
                                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: totalDiff >= 0 ? '#047857' : '#b91c1c' }}>
                                    {totalDiff >= 0 ? '+' : ''}₹{totalDiff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px', padding: '12px', backgroundColor: '#fff', border: '1px solid #fde68a', borderRadius: '8px' }}>
                              <div>
                                <p style={{ margin: 0, fontSize: '10px', textTransform: 'uppercase', color: '#d97706', fontWeight: 'bold' }}>Total Market Value</p>
                                <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#78350f' }}>₹{marketTotal.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                              </div>
                              <div>
                                <p style={{ margin: 0, fontSize: '10px', textTransform: 'uppercase', color: '#d97706', fontWeight: 'bold' }}>Total Value Created</p>
                                <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: totalDiff >= 0 ? '#059669' : '#dc2626' }}>
                                  {totalDiff >= 0 ? '+' : ''}₹{totalDiff.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                  <span style={{ fontSize: '12px', marginLeft: '4px', opacity: 0.75 }}>
                                    ({totalDiff >= 0 ? '+' : ''}{(actualTotal > 0 ? (totalDiff / actualTotal) * 100 : 0).toFixed(1)}%)
                                  </span>
                                </p>
                              </div>
                            </div>
                          </>
                        );
                      })() : (
                        <div style={{ padding: '32px', textAlign: 'center', backgroundColor: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '8px', color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>
                          Select a standard rate list from the dropdown to compare yields.
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
