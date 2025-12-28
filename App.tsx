import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileUp, Download, Trash2, CheckCircle2, AlertCircle, Loader2, ReceiptText, Table as TableIcon, FileSpreadsheet, RotateCcw, Percent, Building2, MapPin, Hash, Calendar, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { processReceiptImage } from './services/geminiService';
import { ReceiptData, ProcessingStatus, BatchItem } from './types';

const App: React.FC = () => {
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Auto-process queue effect
  useEffect(() => {
    const processQueue = async () => {
      // If already processing or queue empty, do nothing
      if (processingId) return;

      const nextItem = queue.find(item => item.status === ProcessingStatus.IDLE);
      if (!nextItem) return;

      setProcessingId(nextItem.id);
      updateItemStatus(nextItem.id, ProcessingStatus.SCANNING);

      try {
        // Convert file to Base64 before sending to API
        const base64Image = await fileToBase64(nextItem.file);
        const result = await processReceiptImage(base64Image);
        updateItemStatus(nextItem.id, ProcessingStatus.SUCCESS, result);
      } catch (err: any) {
        console.error(err);
        let errorMsg = "Error al procesar";
        if (err.message === "API_KEY_MISSING") {
          errorMsg = "Falta API Key";
        } else {
          errorMsg = err.message || "Error desconocido";
        }
        updateItemStatus(nextItem.id, ProcessingStatus.ERROR, undefined, errorMsg);
      } finally {
        setProcessingId(null);
      }
    };

    processQueue();
  }, [queue, processingId]);

  const updateItemStatus = (id: string, status: ProcessingStatus, data?: ReceiptData, error?: string) => {
    setQueue(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, status, data, error };
      }
      return item;
    }));
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    const newItems: BatchItem[] = Array.from(files).filter(f => f.type.startsWith('image/')).map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      status: ProcessingStatus.IDLE
    }));

    setQueue(prev => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const reset = () => {
    setQueue([]);
    setProcessingId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const exportAllToExcel = () => {
    const validItems = queue.filter(item => item.status === ProcessingStatus.SUCCESS && item.data);
    if (validItems.length === 0) return;

    const wsData = [
      ["ID", "Comercio", "Fecha", "Nro. Comprobante", "CUIT", "Categoría", "Neto", "IVA 21%", "IVA 10.5%", "Otros Imp", "Total"]
    ];

    validItems.forEach(item => {
      const d = item.data!;
      wsData.push([
        item.id,
        d.merchantName,
        d.date,
        d.receiptNumber || "N/A",
        d.taxId || "N/A",
        d.category,
        d.netoGravado.toFixed(2),
        d.iva21.toFixed(2),
        d.iva105.toFixed(2),
        d.otrosImpuestos.toFixed(2),
        d.total.toFixed(2)
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen General");

    // Add detailed sheets for each
    validItems.forEach((item, index) => {
      const d = item.data!;

      const detailData = [
        ["FACTURA / TICKET INFO"],
        ["Comercio", d.merchantName],
        ["Nro. Comprobante", d.receiptNumber || "N/A"],
        ["CUIT (Limpio)", d.taxId || "N/A"],
        ["Dirección", d.merchantAddress || "N/A"],
        ["Fecha", d.date],
        ["Moneda", d.currency],
        ["Categoría", d.category],
        [],
        ["DETALLE DE PRODUCTOS"],
        ["Descripción", "Cantidad", "Precio Unitario", "Subtotal Item"],
        ...d.items.map(p => [
          p.description,
          p.quantity,
          p.unitPrice,
          p.totalPrice
        ]),
        [],
        ["RESUMEN FISCAL"],
        ["Concepto", "", "", "Importe"],
        ["Neto Gravado", "", "", d.netoGravado],
        ["IVA 21%", "", "", d.iva21],
        ["IVA 10.5%", "", "", d.iva105],
        ["Otros Impuestos", "", "", d.otrosImpuestos],
        ["Impuestos Totales", "", "", d.tax],
        ["Descuento General", "", "", -d.descuentoGeneral],
        ["TOTAL FINAL", "", "", d.total]
      ];

      const detailWs = XLSX.utils.aoa_to_sheet(detailData);
      // Truncate sheet name to 31 chars max
      const sheetName = `${index + 1}_${d.merchantName}`.substring(0, 31).replace(/[\[\]\*\?\/\\\:]/g, '');
      XLSX.utils.book_append_sheet(wb, detailWs, sheetName);
    });

    XLSX.writeFile(wb, `Reporte_Gastos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8 font-inter">
      <header className="w-full max-w-6xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-xl shadow-indigo-100">
            <ReceiptText size={32} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Ticket2Excel AI Pro</h1>
            <p className="text-sm text-slate-500 font-semibold uppercase tracking-widest">Procesamiento por Lotes</p>
          </div>
        </div>

        {queue.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={exportAllToExcel}
              disabled={!queue.some(i => i.status === ProcessingStatus.SUCCESS)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-bold transition-all shadow-lg"
            >
              <FileSpreadsheet size={20} /> Exportar Todo
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 px-5 py-3 rounded-xl font-bold transition-all"
            >
              <Trash2 size={20} /> Limpiar
            </button>
          </div>
        )}
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 gap-8">
        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`relative border-4 border-dashed rounded-[2rem] p-8 transition-all duration-300 text-center cursor-pointer
            ${isDragging ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' : 'border-slate-200 bg-white hover:border-indigo-300'}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="bg-indigo-50 p-4 rounded-full text-indigo-600">
              <FileUp size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Arrastra tus tickets aquí</h3>
              <p className="text-slate-500 mt-1">Soporta carga múltiple (JPG, PNG)</p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFiles(e.target.files)}
              accept="image/*"
              className="hidden"
              multiple
            />
          </div>
        </div>

        {/* Queue List */}
        {queue.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {queue.map((item) => (
              <div key={item.id} className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 relative group overflow-hidden">
                {/* Status Indicator */}
                <div className="absolute top-4 right-4 z-10">
                  {item.status === ProcessingStatus.IDLE && <span className="bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full">Pendiente</span>}
                  {item.status === ProcessingStatus.SCANNING && <Loader2 className="animate-spin text-indigo-600" size={20} />}
                  {item.status === ProcessingStatus.SUCCESS && <CheckCircle2 className="text-emerald-500" size={24} />}
                  {item.status === ProcessingStatus.ERROR && <AlertCircle className="text-red-500" size={24} />}
                </div>

                <div className="flex gap-4 items-start mb-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <img src={item.preview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate text-sm mb-1">{item.file.name}</p>
                    <p className="text-xs text-slate-500">{(item.file.size / 1024).toFixed(0)} KB</p>
                    {item.status === ProcessingStatus.ERROR && (
                      <p className="text-xs text-red-500 mt-2 font-medium leading-tight">{item.error}</p>
                    )}
                  </div>
                </div>

                {item.data && (
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-sm border border-slate-100">
                    <div className="flex justify-between items-center text-slate-700">
                      <span className="font-bold truncate max-w-[120px]">{item.data.merchantName}</span>
                      <span className="font-mono font-bold">{item.data.currency} {item.data.total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span>{item.data.date}</span>
                      <span>{item.data.items.length} items</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                  className="absolute bottom-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
