import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDocument } from '../services/db';
import LotDetailsModal from '../components/LotDetailsModal';
import { Printer, Download, Image, ArrowRightLeft } from 'lucide-react';
import { toPng } from 'html-to-image';

export default function TraceViewer() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [showFinancials, setShowFinancials] = useState(false);
  const [error, setError] = useState('');
  const [viewingMultiplierTable, setViewingMultiplierTable] = useState(null);
  const [viewingLotDetails, setViewingLotDetails] = useState(null);
  const printRef = useRef();

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) {
      setError('Invalid trace ID');
      return;
    }
    
    try {
      const storedData = localStorage.getItem(`trace_${id}`);
      const storedFinancials = localStorage.getItem(`trace_${id}_financials`);
      if (storedData) {
        setData(JSON.parse(storedData));
        setShowFinancials(JSON.parse(storedFinancials || 'false'));
      } else {
        setError('Trace data not found or expired.');
      }
    } catch (err) {
      setError('Error parsing trace data.');
    }
  }, [searchParams]);

  if (error) return <div className="p-8 text-red-600 font-semibold">{error}</div>;
  if (!data) return <div className="p-8 text-stone-500">Loading trace data...</div>;

  const handleLotClick = async (lotId) => {
    if (!lotId) return;
    try {
      const lot = await getDocument('lots', lotId);
      if (lot) {
        setViewingLotDetails(lot);
      } else {
        alert("Lot details not found.");
      }
    } catch (err) {
      console.error("Failed to fetch lot details", err);
      alert("Failed to fetch lot details.");
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Trace Report - ${data.product} ${data.length}"</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #333; }
            h1, p { margin: 0 0 10px 0; }
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
    let csvContent = `Date,Origin Lot,Input Material,Yield,Produced Weight${showFinancials ? ',Cost Rate,Estimated Value' : ''}\n`;
    
    data.steps.forEach(step => {
      const date = step.date ? new Date(step.date.seconds * 1000).toLocaleDateString() : 'Unknown';
      
      if (step.type === 'transfer') {
        const originLot = `Transfer: ${step.transfer.sourceWorkroomId === 'unassigned' ? 'Unassigned' : step.transfer.sourceWorkroomId} -> ${step.transfer.targetWorkroomId === 'unassigned' ? 'Unassigned' : step.transfer.targetWorkroomId}`;
        const inputMaterial = 'Stock Transfer';
        const yieldPct = '-';
        const producedWeight = step.transfer.quantity;
        let row = `"${date}","${originLot}","${inputMaterial}","${yieldPct}","${producedWeight} Kg"`;
        if (showFinancials) {
          row += `,"-","-"`;
        }
        csvContent += row + '\n';
      } else {
        const originLot = step.originLot?.id || step.transformation?.inputLotId || '';
        const inputMaterial = step.originLot?.materialType || 'Unknown';
        const yieldPct = step.transformation?.yieldPercentage || '';
        const producedWeight = step.contributedWeight || '';
        const rate = (typeof step.rate === 'number' ? step.rate : step.transformation?.effectiveCostPerKg) || 0;
        const value = producedWeight * rate;

        let row = `"${date}","${originLot}","${inputMaterial}","${yieldPct}%","${producedWeight} Kg"`;
        if (showFinancials) {
          row += `,"INR ${rate.toFixed(2)} / Kg","INR ${value.toFixed(2)}"`;
        }
        csvContent += row + '\n';
      }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Trace_${data.product}_${data.length}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadImage = async () => {
    const printContent = printRef.current;
    if (!printContent || !data) return;
    
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
      link.download = `Trace_${data.product}_${data.length}.png`;
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
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-8 max-w-6xl mx-auto flex flex-col h-[calc(100vh-4rem)]">
        
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">
              Production History for {data.product} {data.length}"
            </h1>
            <p className="text-stone-500 mt-1">
              {data.steps.length} Events Found
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-medium transition-colors text-sm">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={handleDownloadImage} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-medium transition-colors text-sm">
              <Image className="w-4 h-4" /> Save Image
            </button>
            <button onClick={handleDownloadCSV} className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors text-sm">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button
              onClick={() => window.close()}
              className="px-4 py-2 bg-stone-800 text-white hover:bg-stone-900 rounded-lg font-medium transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded-xl border border-stone-200 shadow-sm" ref={printRef}>
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50 sticky top-0">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-700 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-700 uppercase tracking-wider">Origin Lot</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-700 uppercase tracking-wider">Input Material</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-700 uppercase tracking-wider">Yield</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-700 uppercase tracking-wider">Produced Weight</th>
                {showFinancials && <th className="px-6 py-4 text-right text-xs font-bold text-stone-700 uppercase tracking-wider">Cost Rate</th>}
                {showFinancials && <th className="px-6 py-4 text-right text-xs font-bold text-stone-700 uppercase tracking-wider">Estimated Value</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-stone-200">
              {data.steps.map((step, idx) => {
                if (step.type === 'transfer') {
                  return (
                    <tr key={idx} className="hover:bg-purple-50/50 transition-colors bg-purple-50/20">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900 font-medium">
                        {step.date ? new Date(step.date.seconds * 1000).toLocaleDateString() : 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-700" colSpan="2">
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="w-4 h-4" />
                          <span className="font-medium">Stock Transfer</span>
                          <span className="text-stone-500 font-normal">
                             ({step.transfer.sourceWorkroomId === 'unassigned' ? 'Unassigned' : step.transfer.sourceWorkroomId} → {step.transfer.targetWorkroomId === 'unassigned' ? 'Unassigned' : step.transfer.targetWorkroomId})
                          </span>
                        </div>
                        {step.transfer.moNumber && <div className="text-xs font-medium text-stone-600 mt-0.5">MO: {step.transfer.moNumber}</div>}
                        {step.transfer.comment && <div className="text-xs font-normal text-stone-500 mt-0.5 whitespace-normal break-words max-w-[300px]">{step.transfer.comment}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-400 text-right">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-purple-700 text-right">{step.transfer.quantity} Kg</td>
                      {showFinancials && <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-400 text-right">-</td>}
                      {showFinancials && <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-400 text-right">-</td>}
                    </tr>
                  );
                }

                return (
                  <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900 font-medium">
                      {step.date ? new Date(step.date.seconds * 1000).toLocaleDateString() : 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">
                      <div className="flex items-center space-x-2">
                        <div className="flex flex-col">
                          <button 
                            onClick={() => handleLotClick(step.originLot?.id || step.transformation?.inputLotId)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                          >
                            {step.originLot?.id || step.transformation?.inputLotId}
                          </button>
                          {step.originLot?.comment && <div className="text-xs font-normal text-stone-500 mt-0.5 whitespace-normal break-words max-w-[150px]">{step.originLot.comment}</div>}
                          {step.transformation?.comment && <div className="text-xs font-normal text-stone-500 mt-0.5 whitespace-normal break-words max-w-[150px]">{step.transformation.comment}</div>}
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-600">
                      {step.originLot?.materialType || (() => {
                        const lotId = step.originLot?.id || step.transformation?.inputLotId || '';
                        if (lotId.includes('-FANCY-')) return 'Fancy';
                        if (lotId.includes('-GOLI-')) return 'Segregated Goli';
                        if (lotId.startsWith('LOT-') && !lotId.includes('-FANCY-') && !lotId.includes('-GOLI-')) return 'Raw Material (Archived)';
                        return 'Unknown';
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 font-semibold text-right">{step.transformation?.yieldPercentage}%</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-700 text-right bg-blue-50/30">{step.contributedWeight} Kg</td>
                    {showFinancials && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-700 font-medium text-right">
                        ₹{((typeof step.rate === 'number' ? step.rate : step.transformation?.effectiveCostPerKg) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Kg
                      </td>
                    )}
                    {showFinancials && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-700 font-bold text-right bg-emerald-50/30">
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
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
