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
  Loader2,
  Layout,
  Table
} from 'lucide-react';

// =================================================================================================
// FIX for Vercel Deployment Error: "vite: command not found"
//
// The deployment failed because Vercel could not find the 'vite' executable globally.
// This is usually fixed by ensuring your 'package.json' has the correct dependencies
// (like 'vite' and 'react' under 'dependencies' or 'devDependencies') and that
// the Vercel Build Command is set to 'npm run build'.
//
// If the error persists, ensure your package.json is committed and try overriding
// the Vercel build command to use the local runner explicitly in your Vercel settings:
// BUILD COMMAND: npm run build -- --base /
// =================================================================================================

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

// Helper to determine QR Payload (Single Value vs JSON)
const getQrPayload = (record) => {
  const keys = Object.keys(record);
  if (keys.length === 1) {
    return String(record[keys[0]]); // Use raw value if only one field
  }
  return JSON.stringify(record); // Use JSON object if multiple fields
};

// Moved QRCard outside to prevent re-renders losing focus/state
const QRCard = ({ record, idx, config, libsLoaded }) => {
  const [qrSrc, setQrSrc] = useState('');

  useEffect(() => {
    // Ensure QRCode library is loaded before attempting to use it
    if (window.QRCode && libsLoaded) {
      const payload = getQrPayload(record);
      window.QRCode.toDataURL(payload, { width: 150, margin: 1 })
        .then(url => setQrSrc(url))
        .catch(err => console.error(err));
    }
  }, [record, libsLoaded]);

  return (
    <div className="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col items-center hover:shadow-md transition-shadow">
      <div className="w-24 h-24 md:w-32 md:h-32 bg-gray-50 mb-3 flex items-center justify-center">
        {qrSrc ? (
          <img src={qrSrc} alt="QR" className="w-full h-full object-contain" />
        ) : (
          <span className="text-xs text-gray-400">Loading...</span>
        )}
      </div>
      
      {config.showCaption && config.captionField && (
        <div className="text-center w-full">
          <p className="text-xs md:text-sm font-bold text-gray-800 truncate px-1">
            {record[config.captionField] || '-'}
          </p>
        </div>
      )}
      
      <div className="mt-2 pt-2 border-t border-gray-100 w-full">
         <p className="text-[10px] text-gray-400 text-center font-mono">
           #{idx + 1}
         </p>
      </div>
    </div>
  );
};

export default function App() {
  // --- State Management ---
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [mode, setMode] = useState('upload'); // 'upload' | 'manual'
  const [records, setRecords] = useState([]);
  const [keys, setKeys] = useState([]); // Fields available for data
  
  // Mobile Responsiveness State
  const [activeMobileTab, setActiveMobileTab] = useState('input'); // 'input' | 'preview'

  // Manual Entry State
  // UPDATED: Default to single 'Value' field
  const [manualFields, setManualFields] = useState(['Value']); 
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
          
          // On mobile, auto-switch to preview after successful upload
          if (window.innerWidth < 768) {
            setActiveMobileTab('preview');
          }
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
    const fieldName = window.prompt("Enter new field name (e.g., 'SKU'):");
    const name = fieldName ? fieldName.trim() : null;
    
    if (name && name !== '' && !manualFields.includes(name)) {
      setManualFields([...manualFields, name]);
      setKeys([...manualFields, name]);
    }
  };

  const handleManualEntryChange = (field, value) => {
    setCurrentEntry(prev => ({ ...prev, [field]: value }));
  };

  const addManualRecord = () => {
    if (Object.keys(currentEntry).length === 0) return;
    
    const newRecords = [...records, currentEntry];
    setRecords(newRecords);
    setKeys(manualFields);
    
    if (!config.captionField && manualFields.length > 0) {
      setConfig(prev => ({ ...prev, captionField: manualFields[0] }));
    }

    setCurrentEntry({});
    setStatusMsg(`Record added. Total: ${newRecords.length}`);
  };

  const clearData = () => {
    if(window.confirm("Are you sure you want to clear all data?")) {
      setRecords([]);
      setKeys([]);
      setStatusMsg('');
    }
  };

  // --- PDF Generation Logic ---
  const generatePDF = async () => {
    if (!libsLoaded) {
      window.alert("Libraries still loading...");
      return;
    }
    if (records.length === 0) {
      window.alert("No records to print.");
      return;
    }

    setIsGenerating(true);
    setStatusMsg('Generating PDF...');

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const { qrSize, gap, margin, showCaption, captionField } = config;

      const contentWidth = pageWidth - (margin * 2);
      const cols = Math.floor(contentWidth / (qrSize + gap));
      
      const actualRowWidth = (cols * qrSize) + ((cols - 1) * gap);
      const xOffset = (pageWidth - actualRowWidth) / 2;

      let currentX = xOffset;
      let currentY = margin;
      let itemsOnPage = 0;

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        
        // UPDATED: Use logic to determine if single string or JSON object
        const payload = getQrPayload(record);
        
        const qrDataUrl = await window.QRCode.toDataURL(payload, {
          errorCorrectionLevel: 'M',
          margin: 0, 
          width: 200 
        });

        const itemHeight = showCaption ? qrSize + 8 : qrSize;
        
        if (currentY + itemHeight > pageHeight - margin) {
          doc.addPage();
          currentY = margin;
          currentX = xOffset;
          itemsOnPage = 0;
        }

        doc.addImage(qrDataUrl, 'PNG', currentX, currentY, qrSize, qrSize);

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

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-gray-50 font-sans text-gray-900 overflow-hidden">
      
      {/* --- Sidebar Area --- */}
      <div className={`
        w-full md:w-1/3 lg:w-1/4 bg-white border-r border-gray-200 
        flex-col 
        ${activeMobileTab === 'input' ? 'flex' : 'hidden md:flex'}
        h-[calc(100vh-60px)] md:h-full overflow-y-auto
      `}>
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
                  <Plus size={12} /> Add
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 shadow-sm"
                      placeholder={`Value for ${field}`}
                    />
                  </div>
                ))}
                <button 
                  onClick={addManualRecord}
                  className="w-full py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> Generate QR
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

      {/* --- Preview Area --- */}
      <div className={`
        flex-1 flex-col h-[calc(100vh-60px)] md:h-full bg-gray-100 overflow-hidden
        ${activeMobileTab === 'preview' ? 'flex' : 'hidden md:flex'}
      `}>
        {/* Configuration Header */}
        <div className="bg-white border-b border-gray-200 p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 z-10">
          
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 w-full md:w-auto">
              <Settings size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Config:</span>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
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
                  className="text-sm border-gray-300 border rounded-md px-2 py-1 focus:ring-blue-500 focus:border-blue-500 bg-white max-w-[150px]"
                >
                  <option value="" disabled>Select Label Field</option>
                  {keys.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <button
            onClick={generatePDF}
            disabled={!libsLoaded || records.length === 0 || isGenerating}
            className={`w-full md:w-auto px-6 py-2 rounded-lg font-medium text-white shadow-sm flex items-center justify-center gap-2 transition-all ${
              !libsLoaded || records.length === 0 || isGenerating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 hover:shadow-md'
            }`}
          >
            {isGenerating ? 'Generating...' : (
              <>
                <Printer size={18} /> Download PDF
              </>
            )}
          </button>
        </div>

        {/* Grid Preview */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {records.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <AlertCircle size={48} className="mb-4 text-gray-300" />
              <p className="text-lg font-medium text-center">No Data Loaded</p>
              <p className="text-sm text-center max-w-xs mt-2">Go to the "Input" tab to upload an Excel file or add records.</p>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex justify-between items-center">
                <span>Preview</span>
                <span className="text-xs normal-case bg-gray-200 px-2 py-1 rounded">{records.length} items</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {records.map((record, idx) => (
                  <QRCard 
                    key={idx} 
                    record={record} 
                    idx={idx} 
                    config={config} 
                    libsLoaded={libsLoaded}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile Navigation Bar */}
      <div className="md:hidden h-[60px] bg-white border-t border-gray-200 flex items-center justify-around z-50 shrink-0">
        <button 
          onClick={() => setActiveMobileTab('input')}
          className={`flex flex-col items-center justify-center w-full h-full ${activeMobileTab === 'input' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <Table size={20} />
          <span className="text-[10px] font-medium mt-1">Input Data</span>
        </button>
        <button 
          onClick={() => setActiveMobileTab('preview')}
          className={`flex flex-col items-center justify-center w-full h-full ${activeMobileTab === 'preview' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <Layout size={20} />
          <span className="text-[10px] font-medium mt-1">Preview & PDF</span>
        </button>
      </div>
    </div>
  );
}
