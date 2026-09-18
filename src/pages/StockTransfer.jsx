import React, { useState, useEffect } from 'react';
import { getCollection, getDocument, setDocument, updateDocument, deleteDocument } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { ArrowRightLeft, Package, Calendar, FileText, ClipboardList } from 'lucide-react';

export default function StockTransfer() {
  const [inventory, setInventory] = useState([]);
  const [workrooms, setWorkrooms] = useState([]);
  const [manufacturingOrders, setManufacturingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);

  // Global Transfer State
  const [targetWorkroomId, setTargetWorkroomId] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [moNumber, setMoNumber] = useState('');
  const [comment, setComment] = useState('');

  // Line Items State
  const [transferItems, setTransferItems] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [quantity, setQuantity] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invData, workroomsData, moData] = await Promise.all([
        getCollection('inventory'),
        getCollection('workrooms'),
        getCollection('manufacturing_orders')
      ]);
      invData.sort((a, b) => (a.length || 0) - (b.length || 0));
      moData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setInventory(invData);
      setWorkrooms(workroomsData);
      setManufacturingOrders(moData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    if (!selectedInventoryId || !quantity) {
      alert("Please select an item and specify quantity.");
      return;
    }
    const item = inventory.find(i => i.id === selectedInventoryId);
    if (!item) return;

    const qtyToAdd = Number(quantity);
    if (qtyToAdd <= 0 || qtyToAdd > (item.quantityAvailable || 0)) {
      alert("Invalid quantity. Must be greater than 0 and less than available.");
      return;
    }

    if (transferItems.find(i => i.inventoryId === selectedInventoryId)) {
      alert("Item is already in the transfer list. Please remove it and add it again to change quantity.");
      return;
    }

    setTransferItems([...transferItems, {
      inventoryId: selectedInventoryId,
      quantity: qtyToAdd,
      product: item.product,
      length: item.length,
      workroomId: item.workroomId
    }]);

    setSelectedInventoryId('');
    setQuantity('');
  };

  const handleRemoveItem = (idToRemove) => {
    setTransferItems(transferItems.filter(item => item.inventoryId !== idToRemove));
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (transferItems.length === 0) {
      alert("Please add at least one item to transfer.");
      return;
    }
    if (!targetWorkroomId) {
      alert("Please select a destination workroom.");
      return;
    }

    const targetWorkroomStr = targetWorkroomId === 'unassigned' ? 'unassigned' : targetWorkroomId;
    
    // Check if any item is transferring to its own location
    for (let item of transferItems) {
      const sourceLocation = item.workroomId || 'unassigned';
      if (sourceLocation === targetWorkroomStr) {
        alert(`Cannot transfer item ${item.product}-${item.length}" to its current location.`);
        return;
      }
    }

    setTransferring(true);
    try {
      const updateData = {
        lastTransferDate: transferDate,
        lastTransferMO: moNumber,
        lastTransferComment: comment
      };

      await Promise.all(transferItems.map(async (lineItem) => {
        const transferringItem = inventory.find(i => i.id === lineItem.inventoryId);
        if (!transferringItem) return;
        
        const qtyToTransfer = Number(lineItem.quantity);
        const avgRate = transferringItem.averageRate || 0;
        const valToTransfer = qtyToTransfer * avgRate;
        const newId = `${transferringItem.product}-${transferringItem.length}-${targetWorkroomStr}`;

        // Update destination document
        const existingDoc = await getDocument('inventory', newId);
        if (existingDoc) {
          const newTotalValue = (existingDoc.totalValue || 0) + valToTransfer;
          const newQuantity = (existingDoc.quantityAvailable || 0) + qtyToTransfer;
          await updateDocument('inventory', newId, {
            quantityAvailable: newQuantity,
            totalValue: newTotalValue,
            averageRate: newQuantity > 0 ? newTotalValue / newQuantity : 0,
            ...updateData
          });
        } else {
          await setDocument('inventory', newId, {
            product: transferringItem.product,
            length: transferringItem.length,
            workroomId: targetWorkroomId === 'unassigned' ? null : targetWorkroomId,
            quantityAvailable: qtyToTransfer,
            totalValue: valToTransfer,
            averageRate: avgRate,
            ...updateData
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

        // Record transfer in a new stock_transfers collection for ledger purposes
        const transferDocId = `ST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await setDocument('stock_transfers', transferDocId, {
            date: transferDate,
            moNumber: moNumber,
            comment: comment,
            productId: transferringItem.product,
            length: transferringItem.length,
            quantity: qtyToTransfer,
            sourceWorkroomId: transferringItem.workroomId || 'unassigned',
            targetWorkroomId: targetWorkroomStr,
            timestamp: new Date()
        });
      }));

      alert("Transfer successful!");
      
      // Reset form
      setTransferItems([]);
      setSelectedInventoryId('');
      setTargetWorkroomId('');
      setQuantity('');
      setMoNumber('');
      setComment('');
      
      fetchData();
    } catch (error) {
      console.error(error);
      alert("Failed to transfer stock.");
    } finally {
      setTransferring(false);
    }
  };

  const selectedItem = inventory.find(i => i.id === selectedInventoryId);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
          <ArrowRightLeft className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Transfer</h1>
          <p className="text-sm text-gray-500 mt-1">Move physical stock between workrooms</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading inventory data...</div>
      ) : (
        <form onSubmit={handleTransferSubmit} className="space-y-8">
          
          {/* Global Transfer Details */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Transfer Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Destination */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-700">Destination Location *</label>
                <select
                  required
                  value={targetWorkroomId}
                  onChange={(e) => setTargetWorkroomId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors appearance-none"
                >
                  <option value="" disabled>-- Select Workroom --</option>
                  {workrooms.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
              </div>

              {/* Date */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-700">Transfer Date *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>

              {/* MO Number */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-700">Manufacturing Order (MO)</label>
                <div className="relative">
                  <ClipboardList className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select
                    value={moNumber}
                    onChange={(e) => setMoNumber(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors appearance-none"
                  >
                    <option value="">-- Select MO (Optional) --</option>
                    {manufacturingOrders.map(mo => {
                      const dateStr = mo.createdAt?.seconds ? new Date(mo.createdAt.seconds * 1000).toLocaleDateString() : '';
                      return (
                        <option key={mo.id} value={mo.moNumber}>
                          {mo.moNumber} {dateStr ? `(${dateStr})` : ''} {mo.comments ? `- ${mo.comments}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Comment */}
              <div className="space-y-4 md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700">Comment</label>
                <div className="relative flex items-start">
                  <FileText className="absolute left-3 top-4 w-5 h-5 text-gray-400" />
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment or note about this transfer..."
                    rows={2}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Items to Transfer</h2>
            
            {/* Add Item Form */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="md:col-span-6 space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Select Item</label>
                <div className="relative">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select
                    value={selectedInventoryId}
                    onChange={(e) => {
                      setSelectedInventoryId(e.target.value);
                      setQuantity('');
                    }}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors appearance-none text-sm"
                  >
                    <option value="" disabled>-- Select Finished Good --</option>
                    {inventory.filter(i => (i.quantityAvailable || 0) > 0).map(item => {
                      const locationName = workrooms.find(w => w.id === item.workroomId)?.name || 'Unassigned';
                      return (
                        <option key={item.id} value={item.id}>
                          {item.product} - {item.length}" ({locationName}) : {item.quantityAvailable?.toFixed(2)} Kg
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              
              <div className="md:col-span-3 space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Quantity (Kg)</label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedItem?.quantityAvailable || ''}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-sm"
                />
              </div>

              <div className="md:col-span-3">
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={!selectedInventoryId || !quantity}
                  className="w-full px-4 py-2 bg-white border-2 border-purple-600 text-purple-700 hover:bg-purple-50 font-bold rounded-xl transition-colors disabled:opacity-50 text-sm h-[42px]"
                >
                  Add Item
                </button>
              </div>
            </div>

            {/* Added Items Table */}
            {transferItems.length > 0 ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Product</th>
                      <th className="px-4 py-3 font-semibold">Length</th>
                      <th className="px-4 py-3 font-semibold">Source Location</th>
                      <th className="px-4 py-3 font-semibold text-right">Quantity (Kg)</th>
                      <th className="px-4 py-3 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transferItems.map((item, idx) => {
                      const locationName = workrooms.find(w => w.id === item.workroomId)?.name || 'Unassigned';
                      return (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-medium text-gray-900">{item.product}</td>
                          <td className="px-4 py-3 text-gray-600">{item.length}"</td>
                          <td className="px-4 py-3 text-gray-600">{locationName}</td>
                          <td className="px-4 py-3 text-right font-medium text-purple-700">{item.quantity}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.inventoryId)}
                              className="text-rose-500 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50 transition-colors text-xs"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200 border-dashed mb-6">
                <p className="text-gray-500 text-sm">No items added to the transfer yet.</p>
              </div>
            )}

            <div className="pt-6 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                disabled={transferring || transferItems.length === 0}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center"
              >
                {transferring ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    Transferring...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-5 h-5 mr-2" />
                    Complete Transfer ({transferItems.length} items)
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
