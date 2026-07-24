import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, RotateCcw, Upload, Zap, ScanLine, Loader2 } from 'lucide-react';

interface CameraScannerProps {
  onCapture: (base64: string, mimeType: string) => void;
  onClose: () => void;
  isAnalyzing?: boolean;
}

export default function CameraScanner({ onCapture, onClose, isAnalyzing }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');

  const startCamera = useCallback(async () => {
    try {
      setError('');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
      setStream(mediaStream);
      setIsCameraActive(true);
    } catch (err: any) {
      setError('Camera access denied. Please allow camera permissions or upload an image.');
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Compress to JPEG, quality 0.8
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64 = dataUrl.split(',')[1];
    setPreview(dataUrl);
    stopCamera();
    onCapture(base64, 'image/jpeg');
  }, [stopCamera, onCapture]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const mime = file.type || 'image/jpeg';
      setPreview(dataUrl);
      onCapture(base64, mime);
    };
    reader.readAsDataURL(file);
  }, [onCapture]);

  const switchCamera = useCallback(() => {
    stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    setTimeout(startCamera, 100);
  }, [stopCamera, startCamera]);

  const retake = useCallback(() => {
    setPreview(null);
    startCamera();
  }, [startCamera]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-ink-2/80 backdrop-blur-xl border-b border-line/30 z-10">
        <button onClick={() => { stopCamera(); onClose(); }} className="p-2 rounded-full hover:bg-white/5">
          <X size={22} className="text-bone" />
        </button>
        <h2 className="font-display text-base text-bone uppercase tracking-wider">Scan Food</h2>
        <div className="w-10" />
      </div>

      {/* Camera / Preview Area */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {preview ? (
          <motion.img
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            src={preview}
            alt="Captured food"
            className="max-w-full max-h-full object-contain"
          />
        ) : isCameraActive ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Scan overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 sm:w-80 sm:h-80 border-2 border-sienna/60 rounded-3xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-sienna rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-sienna rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-sienna rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-sienna rounded-br-2xl" />
                <motion.div
                  className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-sienna to-transparent"
                  animate={{ y: [0, 240, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="text-center p-8">
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-sienna/10 border border-sienna/20 flex items-center justify-center">
              <ScanLine size={40} className="text-sienna" />
            </div>
            <h3 className="text-xl font-display text-bone mb-2">Scan Your Food</h3>
            <p className="text-bone-dim text-sm max-w-xs mx-auto mb-8">
              Take a photo of your meal and our AI will instantly analyze its nutrition.
            </p>
            {error && (
              <p className="text-red-400 text-sm mb-4">{error}</p>
            )}
            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <button
                onClick={startCamera}
                className="btn-primary w-full justify-center py-3"
              >
                <Camera size={18} /> Open Camera
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-xl bg-white/[0.04] border border-line text-bone text-sm font-medium flex items-center justify-center gap-2 hover:bg-white/[0.08] transition-colors"
              >
                <Upload size={16} /> Upload Photo
              </button>
            </div>
          </div>
        )}

        {/* Analyzing overlay */}
        <AnimatePresence>
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-ink/80 backdrop-blur-sm flex flex-col items-center justify-center z-20"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 rounded-full border-2 border-sienna/20 border-t-sienna mb-4"
              />
              <p className="text-bone font-display text-lg mb-1">Analyzing Your Meal</p>
              <p className="text-bone-dim text-sm">AI is identifying foods and calculating nutrition...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Controls */}
      <div className="px-4 py-5 bg-ink-2/80 backdrop-blur-xl border-t border-line/30 flex items-center justify-center gap-6">
        {isCameraActive && !preview && (
          <>
            <button onClick={() => fileInputRef.current?.click()} className="p-3 rounded-full bg-white/5 border border-line">
              <Upload size={20} className="text-bone-dim" />
            </button>
            <button
              onClick={capturePhoto}
              disabled={isAnalyzing}
              className="w-16 h-16 rounded-full bg-sienna flex items-center justify-center shadow-lg shadow-sienna/30 active:scale-95 transition-transform"
            >
              <Zap size={24} className="text-white" />
            </button>
            <button onClick={switchCamera} className="p-3 rounded-full bg-white/5 border border-line">
              <RotateCcw size={20} className="text-bone-dim" />
            </button>
          </>
        )}
        {preview && !isAnalyzing && (
          <button
            onClick={retake}
            className="py-3 px-6 rounded-xl bg-white/[0.04] border border-line text-bone text-sm font-medium flex items-center gap-2 hover:bg-white/[0.08] transition-colors"
          >
            <RotateCcw size={16} /> Retake
          </button>
        )}
      </div>

      {/* Hidden elements */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
    </motion.div>
  );
}
