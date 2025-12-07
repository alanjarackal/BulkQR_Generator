import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  PenTool, 
  Plus, 
  Trash2, 
  Printer, 
  Settings, 
  AlertCircle,
  CheckCircle,
  FileText,
  Loader2
} from 'lucide-react';

// Script Loading Helper
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export default function App() {
  // --- State Management ---
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [mode, setMode] = useState('upload'); // 'upload' | 'manual'
  const [records, setRecords] = useState([]);
  const [keys, setKeys] = useState([]); // Fields available for data
  
  // Manual Entry State
  const [manualFields, setManualFields] = useState(['ID', 'Name']); // Default keys
  const [currentEntry, setCurrentEntry] = useState({});

  // Configuration State
  const [config, setConfig] = useState({
    showCaption: true,
    captionField: '',
    qrSize: 35, // 35mm = 3.5cm
    gap: 5, // 5mm gap
    margin: 10, // 10mm page margin
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // --- Load External Libraries ---
  useEffect(() => {
    const loadLibs = async () => {
      try {
        await Promise.all([
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'),
          loadScript('https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js')
        ]);
        setLibsLoaded(true);
      } catch (err) {
        console.error("Failed to load libraries", err);
        setStatusMsg("Error loading required libraries. Please refresh.");
      }
    };
    loadLibs();
  }, []);

  // --- Handlers: Excel Upload ---
  const handleFileUpload = (e) => {
    if (!libsLoaded) return;
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        // Access XLSX from window
        const workbook = window.XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        
        // Parse JSON
        const data = window.XLSX.utils.sheet_to_json(ws);
        
        if (data.length > 0) {
          const extractedKeys = Object.keys(data[0]);
          setKeys(extractedKeys);
          setRecords(data);
          
          // Auto-select first key as caption if not set
          if (!config.captionField && extractedKeys.length > 0) {
            setConfig(prev => ({ ...prev, captionField: extractedKeys[0] }));
          }
          setStatusMsg(`Successfully loaded ${data.length} records.`);
        } else {
          setStatusMsg('File appears empty.');
        }
      } catch (error) {
        console.error(error);
        setStatusMsg('Error parsing Excel file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- Handlers: Manual Entry ---
  const addManualField = () => {
    const name = prompt("Enter new field name (e.g., 'SKU'):");
    if (name && !manualFields.includes(name)) {
      setManualFields([...manualFields, name]);
      // Update keys for preview consistency
      setKeys([...manualFields, name]);
    }
  };

  const handleManualEntryChange = (field, value) => {
    setCurrentEntry(prev => ({ ...prev, [field]: value }));
  };

  const addManualRecord = () => {
    // Basic validation: Ensure at least one field is filled
    if (Object.keys(currentEntry).length === 0) return;
    
    const newRecords = [...records, currentEntry];
    setRecords(newRecords);
    setKeys(manualFields); // Ensure keys match current manual fields
    
    // Auto-select caption if needed
    if (!config.captionField && manualFields.length > 0) {
      setConfig(prev => ({ ...prev, captionField: manualFields[0] }));
    }

    setCurrentEntry({}); // Reset form
  };

  const clearData = () => {
    if(confirm("Are you sure you want to clear all data?")) {
      setRecords([]);
      setKeys([]);
      setStatusMsg('');
    }
  };

  // --- PDF Generation Logic ---
  const generatePDF = async () => {
    if (!libsLoaded) {
      alert("Libraries still loading...");
      return;
    }
    if (records.length === 0) {
      alert("No records to print.");
      return;
    }

    setIsGenerating(true);
    setStatusMsg('Generating PDF...');

    try {
      // 1. Setup PDF in A4 (mm)
      // Access jsPDF from window.jspdf
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const { qrSize, gap, margin, showCaption, captionField } = config;

      // 2. Calculate Grid Layout
      const contentWidth = pageWidth - (margin * 2);
      const cols = Math.floor(contentWidth / (qrSize + gap));
      
      const actualRowWidth = (cols * qrSize) + ((cols - 1) * gap);
      const xOffset = (pageWidth - actualRowWidth) / 2;

      let currentX = xOffset;
      let currentY = margin;
      let itemsOnPage = 0;

      // 3. Loop through records
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const jsonPayload = JSON.stringify(record);
        
        // Generate QR Data URL using 'qrcode' library from window
        const qrDataUrl = await window.QRCode.toDataURL(jsonPayload, {
          errorCorrectionLevel: 'M',
          margin: 0, 
          width: 200 
        });

        // Check if we need a new page
        const itemHeight = showCaption ? qrSize + 8 : qrSize; // +8mm for text
        
        if (currentY + itemHeight > pageHeight - margin) {
          doc.addPage();
          currentY = margin;
          currentX = xOffset;
          itemsOnPage = 0;
        }

        // Add QR Image
        doc.addImage(qrDataUrl, 'PNG', currentX, currentY, qrSize, qrSize);

        // Add Caption
        if (showCaption && captionField && record[captionField]) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          const text = String(record[captionField]);
          
          const textWidth = doc.getTextWidth(text);
          let finalText = text;
          if (textWidth > qrSize) {
             finalText = text.substring(0, 15) + '...';
          }
          
          const textX = currentX + (qrSize / 2); 
          const textY = currentY + qrSize + 4;

          doc.text(finalText, textX, textY, { align: 'center' });
        }

        itemsOnPage++;
        if (itemsOnPage % cols === 0) {
          currentX = xOffset;
          currentY += itemHeight + gap;
        } else {
          currentX += qrSize + gap;
        }
      }

      doc.save('bulk-qr-codes.pdf');
      setStatusMsg('PDF Downloaded!');
    } catch (err) {
      console.error("PDF Gen Error", err);
      setStatusMsg("Error generating PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Components ---

  const Sidebar = () => (
    <div className="w-full md:w-1/3 lg:w-1/4 bg-white border-r border-gray-200 h-full overflow-y-auto flex flex-col">
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          QR Batcher
        </h1>
        <p className="text-xs text-gray-500 mt-1">Bulk JSON to A4 Printer</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setMode('upload')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === 'upload' 
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <FileSpreadsheet size={16} /> Excel/CSV
          </div>
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === 'manual' 
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <PenTool size={16} /> Manual
          </div>
        </button>
      </div>

      <div className="p-6 flex-1">
        {!libsLoaded ? (
          <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
             <Loader2 className="animate-spin" /> Loading Libraries...
          </div>
        ) : mode === 'upload' ? (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors relative">
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 font-medium">Click to upload Excel</p>
              <p className="text-xs text-gray-400 mt-1">First row as headers</p>
            </div>
            <div className="text-xs text-gray-500 bg-gray-100 p-3 rounded">
              <strong>Tip:</strong> Ensure your Excel file has a header row. Each row will become one QR code containing the row's data as JSON.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {manualFields.map(f => (
                <span key={f} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200">
                  {f}
                </span>
              ))}
              <button onClick={addManualField} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 flex items-center gap-1">
                <Plus size={12} /> Key
              </button>
            </div>

            <div className="space-y-3">
              {manualFields.map(field => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{field}</label>
                  <input
                    type="text"
                    value={currentEntry[field] || ''}
                    onChange={(e) => handleManualEntryChange(field, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={`Value for ${field}`}
                  />
                </div>
              ))}
              <button 
                onClick={addManualRecord}
                className="w-full py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Add Record
              </button>
            </div>
          </div>
        )}

        {/* Status Area */}
        {statusMsg && (
          <div className="mt-6 p-3 bg-blue-50 text-blue-800 text-sm rounded flex items-start gap-2">
            <CheckCircle size={16} className="mt-0.5 shrink-0" />
            {statusMsg}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex justify-between items-center text-sm text-gray-600 mb-2">
          <span>Total Records:</span>
          <span className="font-bold text-gray-900">{records.length}</span>
        </div>
        {records.length > 0 && (
          <button 
            onClick={clearData}
            className="w-full py-2 text-red-600 border border-red-200 rounded hover:bg-red-50 text-xs font-medium flex items-center justify-center gap-2"
          >
            <Trash2 size={14} /> Clear All Data
          </button>
        )}
      </div>
    </div>
  );

  const PreviewArea = () => (
    <div className="flex-1 flex flex-col h-full bg-gray-100 overflow-hidden">
      {/* Configuration Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 z-10">
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
            <Settings size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Config:</span>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={config.showCaption}
              onChange={(e) => setConfig({ ...config, showCaption: e.target.checked })}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            Show Label
          </label>

          {config.showCaption && (
            <select
              value={config.captionField}
              onChange={(e) => setConfig({ ...config, captionField: e.target.value })}
              className="text-sm border-gray-300 border rounded-md px-2 py-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="" disabled>Select Label Field</option>
              {keys.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          )}
        </div>

        <button
          onClick={generatePDF}
          disabled={!libsLoaded || records.length === 0 || isGenerating}
          className={`px-6 py-2 rounded-lg font-medium text-white shadow-sm flex items-center gap-2 transition-all ${
            !libsLoaded || records.length === 0 || isGenerating
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 hover:shadow-md'
          }`}
        >
          {isGenerating ? 'Generating...' : (
            <>
              <Printer size={18} /> Download PDF (A4)
            </>
          )}
        </button>
      </div>

      {/* Grid Preview */}
      <div className="flex-1 overflow-y-auto p-8">
        {records.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <AlertCircle size={48} className="mb-4 text-gray-300" />
            <p className="text-lg font-medium">No Data Loaded</p>
            <p className="text-sm">Upload an Excel file or add records manually to preview.</p>
          </div>
        ) : (
          <div>
             <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
               Print Preview (approximate layout)
             </h3>
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
               {records.map((record, idx) => (
                 <QRCard key={idx} record={record} idx={idx} />
               ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );

  // Helper component for the preview grid
  const QRCard = ({ record, idx }) => {
    const [qrSrc, setQrSrc] = useState('');

    useEffect(() => {
      if (window.QRCode) {
        window.QRCode.toDataURL(JSON.stringify(record), { width: 150, margin: 1 })
          .then(url => setQrSrc(url))
          .catch(err => console.error(err));
      }
    }, [record, libsLoaded]);

    return (
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col items-center hover:shadow-md transition-shadow">
        <div className="w-32 h-32 bg-gray-50 mb-3 flex items-center justify-center">
          {qrSrc ? (
            <img src={qrSrc} alt="QR" className="w-full h-full object-contain" />
          ) : (
            <span className="text-xs text-gray-400">Loading...</span>
          )}
        </div>
        
        {config.showCaption && config.captionField && (
          <div className="text-center w-full">
            <p className="text-sm font-bold text-gray-800 truncate px-2">
              {record[config.captionField] || '-'}
            </p>
          </div>
        )}
        
        <div className="mt-2 pt-2 border-t border-gray-100 w-full">
           <p className="text-[10px] text-gray-400 text-center font-mono">
             Record #{idx + 1}
           </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 font-sans text-gray-900">
      <Sidebar />
      <PreviewArea />
    </div>
  );
}
