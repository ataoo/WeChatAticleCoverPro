
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Image as ImageIcon, 
  Wand2, 
  Upload, 
  Download, 
  Share2, 
  Layout,
  X,
  Smartphone,
  AlertCircle,
  Loader2,
  Type,
  RefreshCw,
  Sparkles
} from 'lucide-react';

// --- Constants ---
const WECHAT_GREEN = '#07c160';
const WECHAT_BG = '#EDEDED';

const FONTS = [
  { name: 'Modern Sans', value: '"Noto Sans SC", sans-serif' },
  { name: 'Elegant Serif', value: '"Noto Serif SC", serif' },
  { name: 'Playful', value: '"ZCOOL KuaiLe", cursive' },
  { name: 'System Default', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
];

// --- Types ---
interface OverlayState {
  text: string;
  color: string;
  font: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  isDragging: boolean;
}

// --- Components ---

function App() {
  // App State
  const [prompt, setPrompt] = useState('');
  const [refImage, setRefImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  
  // Text Overlay State
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState>({
    text: '',
    color: '#ffffff',
    font: FONTS[0].value,
    x: 50,
    y: 50,
    isDragging: false
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // --- Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        setError("Image size too large. Please choose an image under 4MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        setRefImage(evt.target?.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRefine = () => {
    if (generatedImage) {
      setRefImage(generatedImage);
      setError(null);
      // Optional: scroll to top or provide feedback
    }
  };

  const generateCover = async () => {
    if (!prompt.trim() && !refImage) {
      setError("Please enter a prompt or upload a reference image.");
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const parts: any[] = [];
      
      // Reference Image logic
      if (refImage) {
        const base64Data = refImage.split(',')[1];
        const mimeType = refImage.split(';')[0].split(':')[1];
        parts.push({
          inlineData: { mimeType, data: base64Data }
        });
      }

      // Prompt Engineering for WeChat
      const hasChinese = /[\u4e00-\u9fa5]/.test(prompt);
      let systemPrompt = `Create a high-quality WeChat Official Account cover image (2.35:1 ratio).
      
      Subject: ${prompt}
      
      Layout Requirements:
      1. IMPORTANT: The image will be cropped to a very wide aspect ratio (2.35:1) for the article header.
      2. IMPORTANT: Ensure the main subject is centered and vertically compact so it is visible in the wide crop.
      3. Ensure there are interesting details on the sides, but keep the focal point central.
      4. Style: Professional, commercial, high-resolution.
      5. NO TEXT: Do NOT generate any text, letters, or characters inside the image itself unless the user explicitly requested 'signage', 'logo' or 'typography' in the prompt. The user will add a clean text overlay separately.
      `;
      
      if (hasChinese) {
        systemPrompt += `\n\nNote: The user prompt contains Chinese.`;
      }

      parts.push({ text: systemPrompt });

      // Using Standard Gemini 2.5 Flash Image
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "16:9", 
            // imageSize not supported on Flash, defaults to standard
          }
        }
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          setGeneratedImage(`data:image/png;base64,${part.inlineData.data}`);
          foundImage = true;
          break;
        }
      }
      
      if (!foundImage) {
        throw new Error("The model generated text instead of an image. Please try refining your prompt.");
      }

      setActiveTab('editor');
      
      // Auto-enable text overlay if user has text entered but hidden
      if (!showOverlay && overlay.text) {
        setShowOverlay(true);
      }

    } catch (err: any) {
      console.error(err);
      let msg = err.message || "Failed to generate image.";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Dragging Logic ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!showOverlay) return;
    setOverlay(prev => ({ ...prev, isDragging: true }));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!overlay.isDragging || !imageContainerRef.current) return;
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setOverlay(prev => ({ ...prev, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }));
  };

  const handleMouseUp = () => {
    setOverlay(prev => ({ ...prev, isDragging: false }));
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
       if (overlay.isDragging) setOverlay(prev => ({ ...prev, isDragging: false }));
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [overlay.isDragging]);


  // --- Download Logic ---
  const downloadImage = (type: 'full' | 'cover' | 'thumb') => {
    if (!generatedImage || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = generatedImage;
    
    img.onload = () => {
      if (!ctx) return;

      const sourceW = img.width;
      const sourceH = img.height;
      let targetW, targetH, sx, sy, sw, sh;

      if (type === 'full') {
        // 16:9
        targetW = sourceW;
        targetH = sourceH;
        sx = 0; sy = 0; sw = sourceW; sh = sourceH;
      } else if (type === 'cover') {
        // WeChat Article Cover: 900x383 (Approx 2.35:1)
        targetW = 900;
        targetH = 383;
        
        // Crop logic: fit width, crop height from center
        const scale = sourceW / targetW; 
        // if we fit to width, the height of source used is targetH * scale
        const cropHeight = targetH * scale;
        
        sx = 0;
        sy = (sourceH - cropHeight) / 2; // Center vertical crop
        sw = sourceW;
        sh = cropHeight;
      } else {
        // 1:1 Icon: 500x500
        targetW = 500;
        targetH = 500;
        const side = Math.min(sourceW, sourceH);
        sx = (sourceW - side) / 2;
        sy = (sourceH - side) / 2;
        sw = side;
        sh = side;
      }

      canvas.width = targetW;
      canvas.height = targetH;
      
      // Draw Image
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
      
      // Draw Overlay Text
      if (showOverlay && overlay.text.trim()) {
        const pX = (overlay.x / 100) * sourceW;
        const pY = (overlay.y / 100) * sourceH;
        
        const textX = (pX - sx) * (targetW / sw);
        const textY = (pY - sy) * (targetH / sh);
        
        const fontSize = type === 'cover' ? targetH * 0.15 : (type === 'thumb' ? targetH * 0.15 : targetH * 0.08);
        
        // Use selected font
        ctx.font = `bold ${fontSize}px ${overlay.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = fontSize / 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = fontSize / 10;
        ctx.fillStyle = overlay.color;
        
        ctx.fillText(overlay.text, textX, textY);
      }
      
      const link = document.createElement('a');
      link.download = `wechat-${type}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    };
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto font-sans text-slate-800">
      
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight mb-3 flex items-center justify-center gap-3">
          WeChat Cover <span style={{ color: WECHAT_GREEN }}>Pro</span>
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-md uppercase tracking-wide border border-green-200">Fast</span>
        </h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-lg">
          Generative AI optimized for Official Account headers (2.35:1) and icons.
        </p>
      </div>

      <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* LEFT COLUMN: Inputs */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-white p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#07c160] to-transparent opacity-50"></div>
            
            {/* Prompt */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2 ml-1">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image... (e.g. 'Minimalist office desk with coffee, top down view')"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#07c160] outline-none transition-all resize-none h-32 text-sm leading-relaxed"
              />
            </div>

            {/* Ref Image */}
            <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2 ml-1">Reference Image (Optional)</label>
                {!refImage ? (
                <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-[#07c160] hover:bg-green-50/30 transition-all group bg-slate-50">
                  <div className="flex items-center gap-2 text-slate-400 group-hover:text-[#07c160]">
                    <Upload size={18} />
                    <span className="text-xs font-medium">Upload</span>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
                ) : (
                  <div className="relative h-20 rounded-xl overflow-hidden border border-slate-200 group">
                    <img src={refImage} alt="Ref" className="w-full h-full object-cover" />
                    <button onClick={() => setRefImage(null)} className="absolute top-1 right-1 bg-white/90 p-1 rounded-full shadow hover:text-red-500 transition-colors"><X size={14}/></button>
                  </div>
                )}
            </div>

            {/* Text Overlay Controls */}
            <div className="mb-8 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 select-none">
                    <Type size={16} className={showOverlay ? "text-[#07c160]" : "text-slate-400"} />
                    Draggable Text
                  </label>
                  <button 
                    onClick={() => setShowOverlay(!showOverlay)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${showOverlay ? 'bg-[#07c160]' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${showOverlay ? 'left-6' : 'left-1'}`} />
                  </button>
              </div>
              
              {showOverlay && (
                <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <input 
                    type="text" 
                    value={overlay.text}
                    onChange={(e) => setOverlay(prev => ({...prev, text: e.target.value}))}
                    placeholder="Enter text (drag to move)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-1 focus:ring-[#07c160] outline-none"
                  />
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Font Selector */}
                    <div className="col-span-2 sm:col-span-1">
                      <select 
                        value={overlay.font} 
                        onChange={(e) => setOverlay(prev => ({...prev, font: e.target.value}))}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 outline-none focus:border-[#07c160]"
                      >
                        {FONTS.map(font => (
                          <option key={font.name} value={font.value}>{font.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Color Picker */}
                    <div className="col-span-2 sm:col-span-1 flex items-center justify-between bg-white px-2 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-500">Color</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="color" 
                          value={overlay.color} 
                          onChange={(e) => setOverlay(prev => ({...prev, color: e.target.value}))}
                          className="w-6 h-6 rounded border-none bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={generateCover}
              disabled={isGenerating}
              className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-green-200/50 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99] ${
                isGenerating ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#07c160] hover:bg-[#06ad56] hover:shadow-xl hover:shadow-green-300/40'
              }`}
            >
              {isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Wand2 size={20}/>}
              {isGenerating ? 'Generating...' : 'Generate Cover'}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg flex gap-2">
                <AlertCircle size={16} className="shrink-0"/> {error}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Editor/Preview */}
        <div className="xl:col-span-8 flex flex-col gap-4">
            {/* View Toggles & Actions */}
            {generatedImage && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2 bg-white p-1.5 rounded-xl shadow-sm border border-slate-200">
                  <button 
                    onClick={() => setActiveTab('editor')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'editor' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Layout size={16} /> Editor
                  </button>
                  <button 
                    onClick={() => setActiveTab('preview')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'preview' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Smartphone size={16} /> Preview
                  </button>
                </div>
                
                <button 
                  onClick={handleRefine}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 hover:text-[#07c160] hover:border-[#07c160] transition-colors flex items-center gap-2 shadow-sm"
                  title="Use current image as reference to generate variations"
                >
                  <RefreshCw size={14} /> Refine / Modify
                </button>
              </div>
            )}

            <div className="bg-slate-200/50 rounded-3xl border border-slate-200/60 flex flex-col items-center justify-center min-h-[500px] p-6 relative overflow-hidden">
              
              {!generatedImage ? (
                  <div className="text-center opacity-40">
                    <ImageIcon size={48} className="mx-auto mb-4" />
                    <p className="font-medium">Image will appear here</p>
                  </div>
              ) : (
                <>
                  {activeTab === 'editor' && (
                    <div className="relative w-full max-w-3xl shadow-2xl rounded overflow-hidden group bg-slate-800">
                        {/* Draggable Container Area */}
                        <div 
                          ref={imageContainerRef}
                          className="relative cursor-crosshair"
                          onMouseDown={handleMouseDown}
                          onMouseMove={handleMouseMove}
                          onMouseLeave={handleMouseUp}
                          onMouseUp={handleMouseUp}
                        >
                          <img src={generatedImage} alt="Result" className="w-full h-auto pointer-events-none block" />
                          
                          {/* Draggable Text Overlay */}
                          {showOverlay && overlay.text && (
                              <div 
                                className={`absolute px-4 py-2 rounded cursor-move select-none whitespace-nowrap transform -translate-x-1/2 -translate-y-1/2 ${overlay.isDragging ? 'scale-105' : ''}`}
                                style={{ 
                                  left: `${overlay.x}%`, 
                                  top: `${overlay.y}%`,
                                  color: overlay.color,
                                  fontFamily: overlay.font,
                                  textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                                  border: overlay.isDragging ? '1px dashed rgba(255,255,255,0.5)' : 'none',
                                  backgroundColor: overlay.isDragging ? 'rgba(0,0,0,0.1)' : 'transparent'
                                }}
                              >
                                <div className="font-bold text-4xl md:text-5xl pointer-events-none">{overlay.text}</div>
                              </div>
                          )}
                        </div>

                        {/* Visual Guides Overlay (Always visible) */}
                        <div className="absolute inset-0 pointer-events-none">
                          {/* 2.35:1 Guide - WeChat Article Cover */}
                          <div className="absolute top-1/2 left-0 w-full border-y-2 border-dashed border-[#07c160]/70 -translate-y-1/2 h-[42%] flex justify-between p-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]">
                              <span className="bg-[#07c160] text-white text-[10px] px-1.5 py-0.5 rounded h-fit font-medium shadow-sm">WeChat Cover Area (900x383)</span>
                          </div>
                        </div>
                    </div>
                  )}

                  {activeTab === 'preview' && (
                      <div className="w-full max-w-md space-y-6">
                        {/* Feed Card */}
                        <div className="bg-white p-4 rounded-lg shadow-sm">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Subscription Feed</div>
                            <div className="aspect-[2.35/1] bg-slate-100 rounded overflow-hidden relative">
                              <img src={generatedImage} className="w-full h-full object-cover object-center" />
                              {/* Simulated Text */}
                              {showOverlay && overlay.text && (
                                  <div 
                                    className="absolute transform -translate-x-1/2 -translate-y-1/2 font-bold text-xl"
                                    style={{ 
                                      left: `${overlay.x}%`, 
                                      top: `calc(50% + (${overlay.y - 50}%) * (1.77 / 0.425))`, // Approximate math for crop zoom
                                      color: overlay.color,
                                      fontFamily: overlay.font,
                                      textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                                    }}
                                  >
                                    {overlay.text}
                                  </div>
                              )}
                            </div>
                            <div className="mt-3 h-4 bg-slate-800 w-3/4 rounded"></div>
                        </div>
                        
                        {/* Share Bubble */}
                        <div className="bg-[#ededed] p-4 rounded-lg shadow-inner">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Chat Share</div>
                            <div className="flex justify-end">
                              <div className="bg-white p-3 rounded-xl flex gap-3 max-w-[85%] shadow-sm">
                                  <div className="grow pt-1">
                                    <div className="h-3 bg-slate-800 w-full rounded mb-2"></div>
                                    <div className="h-2 bg-slate-300 w-2/3 rounded"></div>
                                  </div>
                                  <div className="w-12 h-12 shrink-0 bg-slate-100 rounded overflow-hidden relative">
                                    <img src={generatedImage} className="w-full h-full object-cover object-center" />
                                  </div>
                              </div>
                            </div>
                        </div>
                      </div>
                  )}
                </>
              )}
            </div>

            {generatedImage && (
              <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-wrap justify-center gap-4 shadow-sm">
                <button onClick={() => downloadImage('cover')} className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-green-50 group min-w-[100px] transition-colors">
                    <Layout className="text-slate-400 group-hover:text-[#07c160]" />
                    <span className="text-xs font-medium text-slate-600 group-hover:text-[#07c160]">Article Cover</span>
                    <span className="text-[10px] text-slate-400">900 x 383</span>
                </button>
                <div className="w-px bg-slate-100 mx-2"></div>
                <button onClick={() => downloadImage('thumb')} className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-blue-50 group min-w-[100px] transition-colors">
                    <Share2 className="text-slate-400 group-hover:text-blue-500" />
                    <span className="text-xs font-medium text-slate-600 group-hover:text-blue-500">Share Icon</span>
                    <span className="text-[10px] text-slate-400">500 x 500</span>
                </button>
                <div className="w-px bg-slate-100 mx-2"></div>
                <button onClick={() => downloadImage('full')} className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-slate-50 group min-w-[100px] transition-colors">
                    <Download className="text-slate-400 group-hover:text-slate-700" />
                    <span className="text-xs font-medium text-slate-600 group-hover:text-slate-700">Original</span>
                    <span className="text-[10px] text-slate-400">16:9</span>
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
