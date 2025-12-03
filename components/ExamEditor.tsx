import React, { useState, useEffect } from 'react';
import { parseExamText, shuffleExam, generateWordHtml } from '../utils/examUtils';
import { standardizeExamContent } from '../services/geminiService';
import { Wand2, Shuffle, Download, Upload, AlertCircle, FileText, CheckCircle2, FileCheck, Settings, ArrowLeft, Key, User, GraduationCap, Info, Eye, EyeOff } from 'lucide-react';
import mammoth from 'mammoth';

interface ExamEditorProps {
  apiKeyAvailable: boolean;
}

const ExamEditor: React.FC<ExamEditorProps> = ({ apiKeyAvailable: envKeyAvailable }) => {
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [showInput, setShowInput] = useState<boolean>(false);
  
  // Configuration State
  const [configMode, setConfigMode] = useState<'manual' | 'quantity'>('quantity');
  const [examCodes, setExamCodes] = useState<string>('101, 102, 103');
  const [examQuantity, setExamQuantity] = useState<number>(4);

  // Result State
  const [generatedExams, setGeneratedExams] = useState<{code: string, html: string}[]>([]);
  const [selectedExamIndex, setSelectedExamIndex] = useState<number>(0);

  // Settings State
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'author' | 'config'>('author');
  const [userApiKey, setUserApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);

  // Load API Key from localStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) setUserApiKey(storedKey);
  }, []);

  const saveApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setLoading(true);
    setLoadingMessage("Đang đọc file...");

    try {
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        let html = result.value;

        // Auto-tag bold/underlined answers
        const ansTagRegex = /<(strong|b|u|em)>(?:<[^>]+>)*\s*([A-D])\s*[\.:\)]?\s*(?:<[^>]+>)*<\/\1>/gi;
        html = html.replace(ansTagRegex, (match, tag, letter) => {
             return ` {{ANS:${letter.toUpperCase()}}} ${match} `;
        });

        // Convert HTML to plain text
        let text = html
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '');
        
        const doc = new DOMParser().parseFromString(text, 'text/html');
        text = doc.body.textContent || "";
        text = text.replace(/\n\s*\n/g, '\n\n');
        
        setInputText(text);
      } else if (file.name.endsWith('.txt')) {
        const text = await file.text();
        setInputText(text);
      } else {
        setError("Vui lòng tải lên file .docx hoặc .txt, hoặc dán nội dung vào khung.");
      }
    } catch (err) {
      console.error(err);
      setError("Không thể đọc file.");
    } finally {
      setLoading(false);
    }
  };

  const handleStandardize = async () => {
    // Check either Env Key or User Key
    const effectiveKey = userApiKey || (envKeyAvailable ? "ENV_KEY" : "");
    if (!effectiveKey) return setError("Vui lòng nhập API Key trong phần Cài đặt.");
    
    if (!inputText.trim()) return setError("Vui lòng nhập nội dung.");
    
    setLoading(true);
    setLoadingMessage("AI đang chuẩn hóa ...");
    setError(null);
    try {
      // Pass the actual userApiKey if it exists, otherwise undefined (service uses process.env)
      const standardized = await standardizeExamContent(inputText, userApiKey || undefined);
      setInputText(standardized);
      setShowInput(false);
    } catch (err) {
      setError("Lỗi AI: Vui lòng kiểm tra lại API Key hoặc kết nối mạng.");
    } finally {
      setLoading(false);
    }
  };

  const handleShuffle = () => {
    if (!inputText.trim()) return setError("Không có nội dung.");

    setLoading(true);
    setLoadingMessage("Đang trộn đề...");
    setError(null);
    setGeneratedExams([]);
    
    setTimeout(() => {
      try {
        const parsed = parseExamText(inputText);
        if (parsed.sections.length === 0) {
            throw new Error("Không tìm thấy câu hỏi. Hãy kiểm tra định dạng hoặc dùng Chuẩn hóa AI.");
        }

        let codes: string[] = [];
        if (configMode === 'manual') {
            const codesInput = examCodes.trim();
            codes = codesInput.split(/[,;\s]+/).filter(c => c.trim().length > 0);
            if (codes.length === 0) codes = ["101"];
        } else {
            const qty = examQuantity > 0 ? examQuantity : 1;
            for(let i=0; i<qty; i++) {
                codes.push((101 + i).toString());
            }
        }

        const results = codes.map(code => {
            const shuffled = shuffleExam(parsed);
            return {
                code: code,
                html: generateWordHtml({ data: shuffled, code: code })
            };
        });

        setGeneratedExams(results);
        setSelectedExamIndex(0);

      } catch (err: any) {
        setError(err.message || "Lỗi trộn đề.");
      } finally {
        setLoading(false);
      }
    }, 500);
  };

  const downloadExam = (html: string, code: string) => {
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `De_Thi_${code}_${new Date().toISOString().slice(0,10)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentExam = generatedExams[selectedExamIndex];
  const hasValidKey = !!userApiKey || envKeyAvailable;

  // --- SETTINGS OVERLAY COMPONENT ---
  const renderSettings = () => (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      
      {/* Settings Sidebar */}
      <div className="w-[320px] bg-[#172554] text-white flex flex-col shadow-2xl shrink-0">
         <div className="p-6">
             <button 
                onClick={() => setShowSettings(false)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700/50 hover:bg-blue-600 rounded-lg text-sm font-semibold transition-all w-full mb-8 border border-blue-600/50"
             >
                <ArrowLeft size={16} /> Quay lại
             </button>

             <div className="space-y-8">
                 <div>
                     <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3 px-2">Thông tin tác giả</h3>
                     <div 
                        onClick={() => setActiveTab('author')}
                        className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${activeTab === 'author' ? 'bg-blue-600 border-blue-400 shadow-lg' : 'bg-[#1e3a8a]/30 border-transparent hover:bg-[#1e3a8a]'}`}
                     >
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg shadow-inner shrink-0">
                             H
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-white">Nguyễn Đức Hiền</p>
                            <p className="text-[10px] text-blue-200">Giáo viên Vật Lí</p>
                            <p className="text-[10px] text-blue-300 italic leading-tight mt-0.5">Trường THCS và THPT Nguyễn Khuyến Bình Dương.</p>
                        </div>
                     </div>
                 </div>

                 <div>
                     <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3 px-2">Cấu hình hệ thống</h3>
                     <div 
                        onClick={() => setActiveTab('config')}
                        className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${activeTab === 'config' ? 'bg-blue-600 border-blue-400 shadow-lg' : 'bg-[#1e3a8a]/30 border-transparent hover:bg-[#1e3a8a]'}`}
                     >
                         <Key size={20} className={activeTab === 'config' ? 'text-white' : 'text-blue-300'} />
                         <div>
                            <p className="text-sm font-bold text-white">GOOGLE GEMINI API KEY</p>
                            <p className="text-[10px] text-blue-300">Cấu hình Key để dùng AI</p>
                         </div>
                     </div>
                 </div>
             </div>
         </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 bg-[#f1f5f9] flex items-center justify-center p-8 relative">
          
          <div className="absolute top-4 right-4 opacity-10">
               {activeTab === 'author' ? <User size={400} /> : <Settings size={400} />}
          </div>

          <div className="w-full max-w-2xl z-10">
              
              {activeTab === 'author' && (
                  <div className="bg-white rounded-2xl shadow-xl p-10 text-center animate-in zoom-in-95 duration-300">
                      <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-4xl font-bold text-white mx-auto mb-6 shadow-lg shadow-blue-200">
                          H
                      </div>
                      <h2 className="text-3xl font-bold text-blue-900 mb-2">Nguyễn Đức Hiền</h2>
                      <p className="text-lg text-blue-600 font-medium mb-6">Giáo viên Vật Lí</p>
                      <hr className="w-16 border-t-2 border-blue-100 mx-auto mb-6" />
                      <p className="text-slate-600 text-lg">Trường THCS và THPT Nguyễn Khuyến Bình Dương</p>

                      <div className="mt-12 bg-blue-50 rounded-xl p-6 border border-blue-100">
                           <h4 className="text-blue-800 font-bold mb-2 flex items-center justify-center gap-2">
                               <Info size={16}/> Thông tin ứng dụng
                           </h4>
                           <p className="text-sm text-blue-700">Phiên bản: 1.0 (Công cụ trộn đề NK12)</p>
                           <p className="text-xs text-blue-500 mt-1">© 2025 Bản quyền thuộc về tác giả.</p>
                      </div>
                  </div>
              )}

              {activeTab === 'config' && (
                  <div className="bg-white rounded-2xl shadow-xl p-10 animate-in zoom-in-95 duration-300">
                      <div className="flex items-center gap-4 mb-8">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                              <Key size={24} />
                          </div>
                          <div>
                              <h2 className="text-2xl font-bold text-slate-800">Cấu hình API Key</h2>
                              <p className="text-slate-500 text-sm">Nhập Key cá nhân của bạn để sử dụng tính năng AI không giới hạn.</p>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <label className="block text-sm font-bold text-slate-700">Google Gemini API Key</label>
                          <div className="relative">
                              <input 
                                  type={showKey ? "text" : "password"}
                                  value={userApiKey}
                                  onChange={(e) => saveApiKey(e.target.value)}
                                  placeholder="Nhập API Key bắt đầu bằng AIza..."
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 pl-4 pr-12 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                              />
                              <button 
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                              >
                                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                          </div>
                          
                          <div className="flex items-center justify-between mt-2">
                             <p className="text-xs text-slate-400">Key được lưu trong trình duyệt của bạn. <span className="text-emerald-600 font-medium">• Đang dùng Key cá nhân</span></p>
                          </div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-slate-100">
                          <h4 className="font-bold text-slate-700 mb-2">Hướng dẫn lấy Key:</h4>
                          <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
                              <li>Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-600 hover:underline">Google AI Studio</a>.</li>
                              <li>Đăng nhập tài khoản Google.</li>
                              <li>Chọn "Create API Key" và copy dán vào ô trên.</li>
                          </ul>
                      </div>
                  </div>
              )}
          </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-row h-screen bg-[#f8fafc] font-sans overflow-hidden text-slate-900">
      
      {showSettings && renderSettings()}

      {/* LEFT: DARK SIDEBAR (NK12 Style) */}
      <div className="w-[380px] flex flex-col bg-[#172554] text-white shadow-2xl z-20 shrink-0">
        
        {/* Header */}
        <div className="p-5 border-b border-blue-900/50">
            <h1 className="text-lg font-extrabold uppercase tracking-wide leading-tight">
              CÔNG CỤ TRỘN ĐỀ NK12 <br/>
            </h1>
        </div>

        {/* Navigation Tabs (Visual) */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-blue-900/50 overflow-x-auto no-scrollbar">
           <button className="px-3 py-1.5 bg-blue-600 rounded text-xs font-bold text-white whitespace-nowrap">Tiếng Anh</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            
            {/* 1. UPLOAD SECTION */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-blue-300 font-bold text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full border border-blue-400 flex items-center justify-center text-[10px]">1</span>
                    Tải Lên Tài Liệu
                </div>
                
                <label className="flex flex-col gap-3 cursor-pointer border border-dashed border-blue-700 bg-[#1e3a8a]/30 rounded-xl p-6 hover:bg-[#1e3a8a]/50 hover:border-blue-500 transition-all group text-center relative overflow-hidden">
                    <input type="file" accept=".docx,.txt" className="hidden" onChange={handleFileUpload} />
                    <div className="w-12 h-12 bg-[#1e3a8a] text-blue-300 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 group-hover:text-white transition-all shadow-inner">
                        {inputText ? <FileCheck size={24} /> : <Upload size={24} />}
                    </div>
                    <div className="z-10">
                         <span className="text-sm font-semibold text-blue-100 group-hover:text-white block mb-1">
                            {fileName ? fileName : "Kéo thả PDF / DOCX"}
                        </span>
                    </div>
                </label>

                {inputText && (
                    <div className="flex items-center justify-between text-xs text-blue-300 px-1">
                         <span className="flex items-center gap-1">
                             <CheckCircle2 size={12} className="text-emerald-400"/> Đã nhận nội dung
                         </span>
                         <button 
                             onClick={() => setShowInput(!showInput)}
                             className="hover:text-white underline decoration-blue-500/50 underline-offset-2"
                         >
                             {showInput ? "Ẩn xem trước" : "Xem nội dung"}
                         </button>
                    </div>
                )}
                
                {showInput && (
                    <textarea 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        className="w-full h-32 bg-[#0f172a] border border-blue-900 rounded-lg p-2 text-xs font-mono text-blue-100 focus:outline-none focus:border-blue-500"
                        placeholder="Nội dung..."
                    />
                )}
            </div>

            {/* 2. CONFIG SECTION */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-blue-300 font-bold text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full border border-blue-400 flex items-center justify-center text-[10px]">2</span>
                    Cấu Hình
                </div>

                <div className="space-y-3 pl-1">
                     <label className="flex items-center gap-2 cursor-pointer select-none group">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${configMode === 'manual' ? 'bg-blue-500 border-blue-500' : 'border-blue-600 bg-transparent'}`}>
                             {configMode === 'manual' && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                        <input 
                            type="checkbox" 
                            className="hidden"
                            checked={configMode === 'manual'}
                            onChange={(e) => setConfigMode(e.target.checked ? 'manual' : 'quantity')}
                        />
                        <span className="text-sm text-blue-100 group-hover:text-white transition-colors">Nhập mã đề thủ công</span>
                    </label>

                    {configMode === 'manual' ? (
                        <div className="animate-in fade-in slide-in-from-left-2">
                             <p className="text-xs text-blue-400 mb-1">Mã đề (cách nhau dấu phẩy):</p>
                             <input 
                                type="text"
                                value={examCodes}
                                onChange={(e) => setExamCodes(e.target.value)}
                                className="w-full bg-[#1e3a8a] border border-blue-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-blue-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                             />
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-left-2">
                            <p className="text-xs text-blue-400 mb-1">Số lượng đề:</p>
                            <input 
                                type="number"
                                value={examQuantity}
                                onChange={(e) => setExamQuantity(parseInt(e.target.value))}
                                className="w-full bg-[#1e3a8a] border border-blue-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* 3. ACTION & RESULT SECTION */}
            <div className="space-y-3 pt-4 border-t border-blue-900/50">
                <div className="flex items-center gap-2 text-blue-300 font-bold text-xs uppercase tracking-wider">
                     <span className="w-5 h-5 rounded-full border border-blue-400 flex items-center justify-center text-[10px]">3</span>
                     Xử Lý & Kết Quả
                </div>
                
                <div className="space-y-2">
                    <button 
                        onClick={handleStandardize}
                        disabled={loading || !hasValidKey}
                        className="w-full py-2.5 rounded-lg bg-[#1e3a8a] hover:bg-[#2563eb] text-blue-200 hover:text-white font-semibold text-sm transition-all border border-blue-800 hover:border-blue-500 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Wand2 size={16} /> Chuẩn hóa đề (AI)
                    </button>

                    <button 
                        onClick={handleShuffle}
                        disabled={loading}
                        className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-900/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Shuffle size={16} /> Tạo {configMode === 'quantity' ? examQuantity : ''} Mã Đề
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-2 items-start text-red-200 text-xs">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    {error}
                </div>
            )}
            
            {/* RESULTS LIST IN SIDEBAR */}
            {generatedExams.length > 0 && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 pt-2">
                    <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Danh sách kết quả</p>
                    <div className="space-y-1">
                        {generatedExams.map((exam, idx) => (
                            <div 
                                key={idx}
                                onClick={() => setSelectedExamIndex(idx)}
                                className={`
                                    flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border
                                    ${idx === selectedExamIndex 
                                        ? 'bg-blue-600 border-blue-500 text-white shadow-md' 
                                        : 'bg-[#1e3a8a]/30 border-transparent text-blue-200 hover:bg-[#1e3a8a] hover:text-white'
                                    }
                                `}
                            >
                                <span className="text-sm font-medium">Mã đề {exam.code}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        downloadExam(exam.html, exam.code);
                                    }}
                                    className="p-1.5 hover:bg-white/20 rounded transition-colors"
                                    title="Tải xuống"
                                >
                                    <Download size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
        
        {/* Sidebar Footer with Settings Button */}
        <div className="p-4 border-t border-blue-900/50">
            <button 
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center gap-2 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-700 text-blue-300 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
            >
                <Settings size={14} /> Cài đặt
            </button>
            <p className="text-[10px] text-blue-600 text-center mt-2">© 2025 Công cụ hỗ trợ NK12 - Tiếng Anh</p>
        </div>

      </div>

      {/* RIGHT: MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full bg-[#f1f5f9] overflow-hidden relative">
        
        {/* Toolbar */}
        <div className="h-[60px] bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm shrink-0">
             <div className="flex items-center gap-2 text-slate-700 font-bold">
                 <FileText size={18} className="text-blue-600" />
                 Xem trước đề thi
             </div>
             {currentExam && (
                 <button 
                    onClick={() => downloadExam(currentExam.html, currentExam.code)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
                 >
                     <Download size={16} /> Tải Xuống
                 </button>
             )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar flex justify-center">
            {loading ? (
                <div className="flex flex-col items-center justify-center text-slate-400 h-full">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                    <p className="font-medium animate-pulse">{loadingMessage}</p>
                </div>
            ) : !currentExam ? (
                 <div className="flex flex-col items-center justify-center text-slate-300 h-full">
                     <div className="w-24 h-24 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                         <FileText size={40} className="text-slate-200" />
                     </div>
                     <p className="font-medium text-slate-400">Chưa có đề thi nào</p>
                 </div>
            ) : (
                <div className="bg-white shadow-xl min-h-[29.7cm] w-[21cm] p-[2cm] text-[12pt] text-black font-serif leading-normal animate-in zoom-in-95 duration-300">
                    <div dangerouslySetInnerHTML={{ __html: currentExam.html }} className="preview-content" />
                </div>
            )}
        </div>

      </div>

    </div>
  );
};

export default ExamEditor;