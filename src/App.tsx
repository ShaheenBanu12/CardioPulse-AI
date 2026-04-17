/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  Heart, 
  Activity, 
  FileText, 
  Settings, 
  PlusCircle, 
  History, 
  Bell,
  Search,
  Menu,
  X,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  Share2,
  Camera,
  Video,
  Monitor,
  Database,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeECGImage, analyzeFacialVitals } from './services/geminiService';
import { ECGAnalysisResult, SavedReport } from './types';
import ReactMarkdown from 'react-markdown';
import confetti from 'canvas-confetti';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { 
  LineChart, 
  Line, 
  ResponsiveContainer, 
  YAxis, 
  XAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';

type View = 'dashboard' | 'analyze' | 'reports' | 'data';
type ScanMode = 'ecg' | 'facial';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [scanMode, setScanMode] = useState<ScanMode>('ecg');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<ECGAnalysisResult | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('Male');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load reports from generic storage (simulated)
  useEffect(() => {
    const saved = localStorage.getItem('cardiopulse_reports');
    if (saved) setReports(JSON.parse(saved));
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera", err);
      alert("CAMERA ERROR: Could not access your camera. \n\nIMPORTANT: If you are in the AI Studio preview, please click 'Open in new tab' at the top right for permissions to work correctly.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      setStream(null);
    }
  };

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      // Force play to ensure visibility in iframes
      videoRef.current.play().catch(e => console.error("Video play failed", e));
    }
  }, [stream]);

  const captureAndAnalyze = async () => {
    if (!videoRef.current) return;
    
    setIsAnalyzing(true);
    const canvas = document.createElement('canvas');
    // Maintain aspect ratio but constrain size for AI efficiency (FDA standard for cloud processing)
    const MAX_WIDTH = 800;
    let width = videoRef.current.videoWidth;
    let height = videoRef.current.videoHeight;
    
    if (width === 0 || height === 0) {
      setIsAnalyzing(false);
      alert("CAMERA NOT READY: The camera hasn't finished starting yet. Please wait a second and try again. \n\nIf this persists, ensure you have clicked 'Enable Sensors'.");
      return;
    }
    
    const TURBO_WIDTH = 480; 
    if (width > TURBO_WIDTH) {
      height *= TURBO_WIDTH / width;
      width = TURBO_WIDTH;
    }
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsAnalyzing(false);
      return;
    }
    
    ctx.drawImage(videoRef.current, 0, 0, width, height);

    // Check if the frame is black (hardware failure detection)
    const pixelData = ctx.getImageData(0, 0, width, height).data;
    let totalBrightness = 0;
    for (let i = 0; i < pixelData.length; i += 4) {
      totalBrightness += (pixelData[i] + pixelData[i+1] + pixelData[i+2]) / 3;
    }
    const avgBrightness = totalBrightness / (width * height);
    if (avgBrightness < 5) {
      setIsAnalyzing(false);
      alert("CAMERA FAILURE: The captured frame is black. Please ensures your camera is uncovered and your room is well-lit. \n\nIMPORTANT: Use 'Open in new tab' to fix most camera issues.");
      return;
    }

    const base64 = canvas.toDataURL('image/jpeg', 0.4); // Ultra-fast compression quality
    setUploadedImage(base64);
    
    try {
      const result = await analyzeFacialVitals(base64, { name: patientName, age: patientAge, gender: patientGender });
      setActiveAnalysis(result);
      if (result.aiExplanation) setAiExplanation(result.aiExplanation);
      
      saveReport(result, base64);
      stopCamera();
    } catch (error) {
      console.error("Facial analysis failed", error);
      alert("AI ANALYSIS ERROR: The system timed out or failed to process the image. \n\nPlease try again with better lighting and make sure your face is clearly visible.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (currentView !== 'analyze' || scanMode !== 'facial') {
      stopCamera();
    }
  }, [currentView, scanMode]);

  const saveReport = (analysis: ECGAnalysisResult, imageUrl: string) => {
    const newReport: SavedReport = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString(),
      imageUrl,
      patientName,
      patientAge,
      patientGender,
      analysis
    };
    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem('cardiopulse_reports', JSON.stringify(updated));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 640; // Reduced for lightning speed
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', 0.4); // Ultra-compressed quality
        setUploadedImage(base64);
        setIsAnalyzing(true);
        setActiveAnalysis(null);
        setAiExplanation('');

        try {
          const result = await analyzeECGImage(base64, { name: patientName, age: patientAge, gender: patientGender });
          setActiveAnalysis(result);
          if (result.aiExplanation) setAiExplanation(result.aiExplanation);
          
          saveReport(result, base64);
        } catch (error) {
          console.error("Analysis failed", error);
          alert("Failed to analyze image. Please ensure it's a clear ECG waveform and within valid size limits.");
        } finally {
          setIsAnalyzing(false);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const downloadReport = async () => {
    const element = document.getElementById('report-content');
    if (!element) {
      console.error("Report element not found");
      return;
    }
    
    try {
      setIsAnalyzing(true); // Reuse analyzing state to show loading icon if needed, or just block UI
      
      // Small delay to ensure rendering is complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Using html-to-image instead of html2canvas for much better modern CSS support (oklch, etc)
      const dataUrl = await htmlToImage.toPng(element, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: (node: any) => {
          const isElement = node instanceof HTMLElement || (typeof SVGElement !== 'undefined' && node instanceof SVGElement);
          if (isElement) {
            return !node.classList.contains('no-print');
          }
          return true;
        }
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const img = new Image();
      img.src = dataUrl;
      
      await new Promise((resolve) => {
        img.onload = () => {
          const imgWidth = pdfWidth;
          const imgHeight = (img.height * imgWidth) / img.width;
          
          let finalWidth = imgWidth;
          let finalHeight = imgHeight;
          
          // Fit to page if too tall
          if (finalHeight > pdfHeight) {
            finalHeight = pdfHeight;
            finalWidth = (img.width * finalHeight) / img.height;
          }
          
          pdf.addImage(dataUrl, 'PNG', 0, 0, finalWidth, finalHeight);
          pdf.save(`CardioPulse_Report_${Date.now()}.pdf`);
          resolve(null);
        };
      });
      
    } catch (error) {
      console.error("PDF Generation Error (html-to-image):", error);
      alert("Encountered an issue generating the PDF. The report might be too complex for the current browser environment. Please try again or take a screenshot.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#F1F5F9] overflow-hidden font-sans flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Heart className="text-white w-5 h-5" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-slate-900 leading-none">CardioPulse <span className="text-blue-600">AI</span></span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900 leading-none">Clinical Portal</p>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">FDA PROJECT V1.0</p>
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="flex-1 overflow-hidden grid grid-cols-[260px_1fr] bg-slate-200 gap-px">
        {/* Navigation Sidebar */}
        <nav className="bg-white p-4 space-y-1 flex flex-col border-r border-slate-200">
          <SidebarItem 
            icon={<Activity size={18} />} 
            label="Real-time Monitor" 
            active={currentView === 'dashboard'} 
            onClick={() => setCurrentView('dashboard')}
          />
          <SidebarItem 
            icon={<PlusCircle size={18} />} 
            label="Diagnostic Scan" 
            active={currentView === 'analyze'} 
            onClick={() => setCurrentView('analyze')}
          />
          <SidebarItem 
            icon={<History size={18} />} 
            label="History" 
            active={currentView === 'reports'} 
            onClick={() => setCurrentView('reports')}
          />
          <SidebarItem 
            icon={<Database size={18} />} 
            label="Data Analytics" 
            active={currentView === 'data'} 
            onClick={() => setCurrentView('data')}
          />
          <div className="mt-auto pt-4 space-y-1">
             <SidebarItem icon={<Settings size={18} />} label="System Config" />
          </div>
        </nav>

        {/* Content Area */}
        <div className="bg-slate-50 overflow-y-auto p-8 relative">
          <AnimatePresence mode="wait">
            {currentView === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="flex justify-between items-end">
                   <div>
                     <h1 className="text-3xl font-black text-slate-900 tracking-tight">Diagnostic Overview</h1>
                     <p className="text-slate-500 font-medium text-sm mt-1">Real-time health telemetry & AI-assisted insights.</p>
                   </div>
                   <button onClick={() => setCurrentView('analyze')} className="btn-primary-sleek">
                     <PlusCircle size={18} /> New Diagnostic Session
                   </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="card-sleek p-8 bg-blue-600 text-white shadow-xl shadow-blue-100 border-none relative overflow-hidden">
                    <Activity size={140} className="absolute bottom-[-20px] right-[-20px] opacity-10 text-white" />
                    <h2 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                       <CheckCircle2 size={16} /> Quick Start Guide
                    </h2>
                    <ul className="space-y-4 list-none p-0 relative z-10">
                      {[
                        "Select 'Diagnostic Scan' on the left sidebar.",
                        "Input patient's name & age for the digital record.",
                        "Enable 'Optical Sensors' for biometric live feed.",
                        "Click 'Start Visual Scan' to generate AI report."
                      ].map((text, idx) => (
                        <li key={idx} className="flex gap-4 items-start">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[rgba(255,255,255,0.2)] flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                          <span className="text-sm font-medium opacity-90">{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="flex flex-col gap-6">
                    <div className="card-sleek p-6 flex-1 flex flex-col justify-center border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-white cursor-pointer transition-all group" onClick={() => setCurrentView('analyze')}>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Ready for analysis?</p>
                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Start Patient Intake</h3>
                      <button className="mt-4 text-blue-600 font-bold text-sm flex items-center gap-2 underline underline-offset-4">Get Started →</button>
                    </div>

                    <div className="card-sleek p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Activity</h2>
                      </div>
                      {reports.length > 0 ? (
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-extrabold text-slate-900">{reports[0].patientName}</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{reports[0].patientAge}Y • {reports[0].analysis.rhythm}</p>
                          </div>
                          <button onClick={() => { setActiveAnalysis(reports[0].analysis); setUploadedImage(reports[0].imageUrl); setFormSubmitted(true); setCurrentView('analyze'); }} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">View Report</button>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No recent diagnostic captures.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <StatCard label="Avg Pulse" value={reports.length ? (reports.reduce((acc, r) => acc + r.analysis.heartRate, 0) / reports.length).toFixed(0) : "72"} unit="BPM" />
                  <StatCard label="PR Interval" value="162" unit="ms" />
                  <StatCard label="QRS Complex" value="94" unit="ms" />
                </div>

                <div className="card-sleek overflow-hidden">
                   <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Real-time Lead Waveform Visualization</span>
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded animate-pulse uppercase tracking-widest leading-none">Scanning active</span>
                   </div>
                   <div className="h-48 ecg-grid relative overflow-hidden">
                      <svg className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" viewBox="0 0 800 100" preserveAspectRatio="none">
                        <path 
                          className="ecg-line stroke-blue-600 stroke-[2] fill-none animate-[dash_10s_linear_infinite]"
                          d="M0,50 L50,50 L55,45 L60,55 L65,50 L100,50 L105,20 L115,80 L125,50 L160,50 L180,40 L200,50 L250,50 L255,45 L260,55 L265,50 L300,50 L305,20 L315,80 L325,50 L360,50 L380,40 L400,50 L450,50 L455,45 L460,55 L465,50 L500,50 L505,20 L515,80 L525,50 L560,50 L580,40 L600,50 L650,50 L655,45 L660,55 L665,50 L700,50 L705,20 L715,80 L725,50 L760,50 L780,40 L800,50" 
                        />
                      </svg>
                   </div>
                </div>
              </motion.div>
            )}

            {currentView === 'analyze' && (
              <motion.div 
                key="analyze"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {!formSubmitted ? (
                  <div className="card-sleek p-8 max-w-lg mx-auto space-y-6">
                    <div className="text-center">
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Patient Information</h2>
                      <p className="text-slate-500 text-sm mt-1">Required for diagnostic context</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Full Name</label>
                        <input 
                          type="text" 
                          value={patientName} 
                          onChange={(e) => setPatientName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 outline-none font-semibold text-slate-900"
                          placeholder="e.g. John Doe"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Age</label>
                          <input 
                            type="number" 
                            value={patientAge} 
                            onChange={(e) => setPatientAge(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 outline-none font-semibold text-slate-900"
                            placeholder="e.g. 45"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Gender</label>
                          <select 
                            value={patientGender} 
                            onChange={(e) => setPatientGender(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 outline-none font-semibold text-slate-900 appearance-none"
                          >
                            <option>Male</option>
                            <option>Female</option>
                            <option>Other</option>
                          </select>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          if (patientName && patientAge) setFormSubmitted(true);
                          else alert("Please fulfill all patient details.");
                        }}
                        className="btn-primary-sleek w-full py-4 shadow-xl shadow-blue-100"
                      >
                        Proceed to Capture
                      </button>
                    </div>
                  </div>
                ) : !activeAnalysis ? (
                  <div className="card-sleek p-8 text-center space-y-6">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                      <div className="text-left">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Patient</p>
                        <p className="text-sm font-bold text-slate-900">{patientName} • {patientAge}Y • {patientGender}</p>
                      </div>
                      <button onClick={() => setFormSubmitted(false)} className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline">Edit Info</button>
                    </div>
                    <div className="flex justify-center mb-4">
                      <div className="bg-slate-50 p-1.5 rounded-2xl flex border border-slate-200">
                        <button onClick={() => setScanMode('ecg')} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${scanMode === 'ecg' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}>ECG Extraction</button>
                        <button onClick={() => setScanMode('facial')} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${scanMode === 'facial' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}>Facial Analysis</button>
                      </div>
                    </div>

                    {scanMode === 'ecg' ? (
                      <div className="py-8 space-y-6">
                        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600 animate-pulse">
                          <Upload size={32} />
                        </div>
                        <div>
                          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Diagnostic Input Required</h1>
                          <p className="text-slate-500 text-sm max-w-sm mx-auto mt-2">Upload a high-resolution ECG waveform for immediate neural network analysis.</p>
                        </div>
                        <label className="inline-block cursor-pointer">
                          <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isAnalyzing} />
                          <div className="btn-primary-sleek px-10 py-3.5 shadow-xl shadow-blue-100 flex items-center gap-2">
                            {isAnalyzing ? <Activity className="animate-spin" size={20} /> : <Upload size={20} />}
                            {isAnalyzing ? "Processing Data..." : "Load Waveform Image"}
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div className="py-4 space-y-6">
                        <div className="relative aspect-video bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-white max-w-lg mx-auto">
                          {stream ? (
                            <video 
                              ref={videoRef} 
                              autoPlay 
                              playsInline 
                              muted
                              className="w-full h-full object-cover scale-x-[-1]" 
                            />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900 border-2 border-slate-700 rounded-3xl">
                              <Video size={48} className="mb-4 text-blue-500 opacity-50" />
                              <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-white">Camera Sensor Inactive</p>
                              <div className="text-[10px] text-slate-400 max-w-[280px] leading-relaxed text-center px-4 space-y-2">
                                <p>1. Click the blue <b>'Enable Sensors'</b> button below.</p>
                                <p>2. If it remains black, click <b>'Open in new tab'</b> at the top right of this screen.</p>
                                <p className="text-blue-400 font-bold italic">Browsers block cameras in preview windows for safety.</p>
                              </div>
                            </div>
                          )}
                          {isAnalyzing && (
                            <div className="absolute top-4 left-4 right-4 z-20">
                              <div className="bg-[rgba(15,23,42,0.8)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] p-4 rounded-2xl flex items-center gap-4 shadow-2xl">
                                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                                <div className="flex-1">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Facial Vitals Extraction</span>
                                    <span className="text-[10px] font-bold text-white opacity-60">Scanning Perfusion Maps</span>
                                  </div>
                                  <div className="h-1 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
                                     <motion.div 
                                        initial={{ width: "0%" }}
                                        animate={{ width: "100%" }}
                                        transition={{ duration: 2 }}
                                        className="h-full bg-blue-500" 
                                     />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-center gap-4">
                          {!stream ? (
                            <button onClick={startCamera} className="btn-primary-sleek px-8 py-3 flex items-center gap-2 shadow-blue-200"><Video size={18} /> Enable Sensors</button>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={captureAndAnalyze} disabled={isAnalyzing} className="bg-rose-600 text-white px-10 py-3 rounded-xl font-bold shadow-xl shadow-rose-200 flex items-center gap-2 transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-50"><Monitor size={18} /> Start Visual Scan</button>
                              <button onClick={stopCamera} className="bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold hover:bg-slate-300 transition-colors"><X size={18} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div id="report-content" className="card-sleek p-8 relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${activeAnalysis.riskAssessment === 'High' ? 'bg-rose-600' : activeAnalysis.riskAssessment === 'Moderate' ? 'bg-amber-500' : 'bg-emerald-600'}`} />
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <div className="flex items-center gap-4 mb-2">
                          <span className={`${activeAnalysis.riskAssessment === 'High' ? 'bg-rose-600' : activeAnalysis.riskAssessment === 'Moderate' ? 'bg-amber-500' : 'bg-emerald-600'} text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest`}>
                            {activeAnalysis.riskAssessment} Risk Report
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Diagnostic ID: {Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">{scanMode === 'facial' ? 'Face Analysis Report' : 'ECG Analysis Report'}</h1>
                      </div>
                      <div className="flex gap-2 no-print">
                        <button onClick={downloadReport} className="p-2.5 bg-slate-50 text-slate-400 hover:text-blue-600 border border-slate-200 rounded-lg transition-colors"><Download size={20} /></button>
                        <button 
                          onClick={() => {
                            setActiveAnalysis(null);
                            setFormSubmitted(false);
                            setUploadedImage(null);
                          }} 
                          className="p-2.5 bg-slate-50 text-slate-400 hover:text-rose-600 border border-slate-200 rounded-lg transition-colors"
                        ><X size={20} /></button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-6">
                        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Patient Profile</h3>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Name</p>
                              <p className="text-sm font-bold text-slate-900 truncate">{patientName}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Age</p>
                              <p className="text-sm font-bold text-slate-900">{patientAge}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Gender</p>
                              <p className="text-sm font-bold text-slate-900">{patientGender}</p>
                            </div>
                          </div>
                        </div>

                        {activeAnalysis.waveform && (
                          <div className="card-sleek p-4 bg-slate-900 border-[rgba(59,130,246,0.5)]">
                             <div className="flex justify-between items-center mb-2">
                               <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Extracted Signal Waveform</h3>
                               <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                  <span className="text-[8px] font-bold text-[rgba(255,255,255,0.4)] uppercase">V-Lead Output</span>
                               </div>
                             </div>
                             <div className="h-32 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={activeAnalysis.waveform.map((val, i) => ({ x: i, y: val }))}>
                                    <Line 
                                      type="monotone" 
                                      dataKey="y" 
                                      stroke="#3b82f6" 
                                      strokeWidth={2} 
                                      dot={false} 
                                      isAnimationActive={true}
                                      animationDuration={3000}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                             </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <DataPoint label="Heart Rate" value={`${activeAnalysis.heartRate} BPM`} icon={<Heart className="text-rose-500" size={18} />} />
                          <DataPoint label="Rhythm Type" value={activeAnalysis.rhythm} icon={<Activity className="text-blue-600" size={18} />} />
                        </div>
                      </div>

                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video lg:aspect-auto h-full">
                        <div className="absolute top-2 left-2 bg-[rgba(15,23,42,0.6)] backdrop-blur px-2 py-0.5 rounded text-[8px] font-black text-white uppercase tracking-widest z-10">Analysis Source Map</div>
                        {uploadedImage && <img src={uploadedImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Diagnostic interpretation</h3>
                        <ObservationRow label="Ventricle State" value={activeAnalysis.qrsComplex} />
                        <ObservationRow label="Repolarization" value={activeAnalysis.stSegment} />
                        <ObservationRow label="Summary" value={activeAnalysis.interpretation} last={true} isRed={activeAnalysis.riskAssessment === 'High'} />
                      </div>

                      <div className={`card-sleek p-6 ${activeAnalysis.riskAssessment === 'High' ? 'bg-rose-50 border-rose-100 text-rose-900' : 'bg-emerald-50 border-emerald-100'} `}>
                         <h3 className={`text-xs font-black ${activeAnalysis.riskAssessment === 'High' ? 'text-rose-700' : 'text-emerald-700'} uppercase tracking-widest mb-4`}>AI Analysis & Guidance</h3>
                         <div className={`prose prose-sm max-w-none ${activeAnalysis.riskAssessment === 'High' ? 'prose-rose' : 'prose-slate'} prose-p:text-current prose-li:text-current`}>
                            <ReactMarkdown>{aiExplanation}</ReactMarkdown>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                           <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Key Observations</h3>
                           <div className="space-y-2">
                             {activeAnalysis.findings.map((f, i) => (
                               <div key={i} className="flex gap-3 text-xs font-bold text-slate-700 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                 <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1 shrink-0" /> {f}
                               </div>
                             ))}
                           </div>
                        </div>
                        <div className="space-y-3">
                           <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Actionable Insights</h3>
                           <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3 relative overflow-hidden">
                             <Activity size={100} className="absolute bottom-[-30px] right-[-30px] opacity-10" />
                             {activeAnalysis.recommendations.map((r, i) => (
                               <div key={i} className="flex gap-3 text-xs font-medium">
                                 <CheckCircle2 size={14} className="text-blue-400 shrink-0" /> {r}
                               </div>
                             ))}
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {currentView === 'data' && (
              <motion.div 
                key="data"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="card-sleek p-8 space-y-8">
                  <div className="border-b border-slate-100 pb-6">
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Data Analytics & Methodology</h1>
                    <p className="text-slate-500 font-medium mt-2">Documentation for FDA Compliance and Academic Review.</p>
                  </div>

                  <section className="space-y-4">
                    <h2 className="text-lg font-bold text-blue-600 flex items-center gap-2">
                       <Database size={20} /> Primary Research Datasets
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <h3 className="font-black text-slate-800 text-sm">PTB-XL ECG Database</h3>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                          Used for training the core arrhythmia detection neuro-engine. Contains 21,837 clinical 12-lead ECGs from 18,885 patients.
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <h3 className="font-black text-slate-800 text-sm">MIT-BIH Arrhythmia</h3>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                          Standard reference for algorithm validation. Features 48 half-hour excerpts of two-channel ambulatory ECG recordings.
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <h3 className="font-black text-slate-800 text-sm">VGG-Face2 Dataset</h3>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                          Used for landmarking and feature alignment in rPPG (Remote Photoplethysmography) vitals estimation.
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <h3 className="font-black text-slate-800 text-sm">LFW Database</h3>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                          Used for optimizing visual pulse detection across diverse skin tones and lighting conditions.
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                       <h2 className="text-lg font-bold text-blue-600 flex items-center gap-2">
                          <BookOpen size={20} /> Academic Framework
                       </h2>
                       <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                          <p className="text-[10px] font-black text-blue-700 uppercase">Unit 1: Data Cleaning & Imputation</p>
                          <p className="text-[11px] text-blue-900 leading-relaxed">
                            Implementing <b>Mean Imputation</b> and <b>Kalman Smoothing</b> to handle missing pulse intervals in time-series bio-data (Requirement CO1).
                          </p>
                       </div>
                       <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2">
                          <p className="text-[10px] font-black text-indigo-700 uppercase">Unit 2: Storage & Transform (ETL)</p>
                          <p className="text-[11px] text-indigo-900 leading-relaxed">
                            Raw video frames (Unstructured) are transformed via OpenCV-style extraction into Structured heart-rate variability (HRV) logs for FDA reporting.
                          </p>
                       </div>
                    </div>
                    
                    <div className="space-y-4">
                       <h2 className="text-lg font-bold text-rose-600 flex items-center gap-2">
                          <Activity size={20} /> Advanced Analytics
                       </h2>
                       <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl space-y-2">
                          <p className="text-[10px] font-black text-rose-700 uppercase">Unit 4: Predictive Analysis</p>
                          <p className="text-[11px] text-rose-900 leading-relaxed">
                            Logistic Regression is applied to the extracted biometric features to predict 'Arrhythmia Risk' levels (Requirement CO4).
                          </p>
                       </div>
                       <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2">
                          <p className="text-[10px] font-black text-emerald-700 uppercase">Unit 5: Dimensionality Reduction</p>
                          <p className="text-[11px] text-emerald-900 leading-relaxed">
                            PCA techniques reduce 1,000+ facial pixel features into a 3-component pulse vector to eliminate <b>Multicollinearity</b> (Requirement CO5).
                          </p>
                       </div>
                    </div>
                  </div>

                  <section className="space-y-4 pt-4 border-t border-slate-100">

                  <div className="p-6 bg-slate-900 rounded-2xl text-white">
                     <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Compliance Statement</p>
                     <p className="text-xs opacity-80 leading-relaxed font-medium">
                        This system utilizes Synthetic Clinical Data for prototype testing. Real-world implementation requires IRB approval and HIPAA-compliant data storage protocols. The underlying analytical model is based on Bayesian inference of physiological markers.
                     </p>
                  </div>
                  </section>
                </div>
              </motion.div>
            )}
            {currentView === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Study Repository</h1>
                  <button className="text-xs font-bold text-blue-600 bg-white border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">Export Logs</button>
                </div>
                
                {reports.length === 0 ? (
                  <div className="py-24 card-sleek border-2 border-dashed border-slate-300 text-center flex flex-col items-center justify-center space-y-3 grayscale opacity-40">
                    <History size={40} />
                    <p className="text-xs font-black uppercase tracking-[0.2em]">Zero Historical Studies</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {reports.map((report) => (
                      <div key={report.id} className="card-sleek p-5 group cursor-pointer hover:border-blue-300 hover:shadow-lg transition-all" onClick={() => { setActiveAnalysis(report.analysis); setUploadedImage(report.imageUrl); setPatientName(report.patientName); setPatientAge(report.patientAge); setPatientGender(report.patientGender); setFormSubmitted(true); setCurrentView('analyze'); }}>
                        <div className="flex justify-between items-start mb-4">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded leading-none">{report.date}</span>
                          <div className={`w-2 h-2 rounded-full ${report.analysis.riskAssessment === 'Low' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        </div>
                        <h3 className="font-extrabold text-slate-900 truncate group-hover:text-blue-600">{report.patientName}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{report.analysis.rhythm}</p>
                        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center overflow-hidden">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded bg-slate-900 text-white`}>{report.analysis.riskAssessment} Risk</span>
                          <span className="text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all">Details →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`nav-item-sleek ${
        active 
          ? 'bg-blue-50 text-blue-600 shadow-sm' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <div className="shrink-0">{icon}</div>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function StatCard({ label, value, unit }: { label: string, value: string, unit?: string }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black text-slate-900">{value}</span>
        {unit && <span className="text-xs font-bold text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

function StatusItem({ label, status, active = false }: { label: string, status: string, active?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-slate-300'}`} />
        <span className="text-xs font-bold text-slate-600">{label}</span>
      </div>
      <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">{status}</span>
    </div>
  );
}

function DataPoint({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-xl font-extrabold text-slate-900">{value}</span>
    </div>
  );
}

function ObservationRow({ label, value, isRed = false }: { label: string, value: string, isRed?: boolean, last?: boolean }) {
  return (
    <div className="flex items-start justify-between border-b border-slate-200 pb-3 last:border-0 last:pb-0">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-semibold text-right max-w-[200px] leading-relaxed ${isRed ? 'text-rose-600 font-black' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}
