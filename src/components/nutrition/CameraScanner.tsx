import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera as CameraIcon, X, RotateCcw, Upload, ScanLine } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useUIStore } from '@/stores/ui-store';

interface CameraScannerProps {
  onCapture: (base64: string, mimeType: string) => void;
  onClose: () => void;
  isAnalyzing?: boolean;
}

export default function CameraScanner({ onCapture, onClose, isAnalyzing }: CameraScannerProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const { showToast } = useUIStore();

  const takeNativePhoto = async (source: CameraSource) => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source,
        width: 1024 // resize to save memory and bandwidth
      });

      if (image.base64String) {
        const mime = `image/${image.format}`;
        const dataUrl = `data:${mime};base64,${image.base64String}`;
        setPreview(dataUrl);
        onCapture(image.base64String, mime);
      }
    } catch (error: any) {
      if (error.message && !error.message.includes('User cancelled')) {
        showToast('Camera error: ' + error.message, 'error');
      }
    }
  };

  const handleCameraClick = () => {
    takeNativePhoto(CameraSource.Camera);
  };

  const handleGalleryClick = () => {
    takeNativePhoto(CameraSource.Photos);
  };

  const retake = useCallback(() => {
    setPreview(null);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-ink-2/80 backdrop-blur-xl border-b border-line/30 z-10">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5">
          <X size={22} className="text-bone" />
        </button>
        <h2 className="font-display text-base text-bone uppercase tracking-wider">Scan Food</h2>
        <div className="w-10" />
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-ink">
        {preview ? (
          <img
            src={preview}
            alt="Captured food"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center p-8">
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-sienna/10 border border-sienna/20 flex items-center justify-center">
              <ScanLine size={40} className="text-sienna" />
            </div>
            <h3 className="text-xl font-display text-bone mb-2">Scan Your Food</h3>
            <p className="text-bone-dim text-sm max-w-xs mx-auto mb-8">
              Take a photo of your meal and our AI will instantly analyze its nutrition.
            </p>
            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <button
                onClick={handleCameraClick}
                className="btn-primary w-full justify-center py-3"
              >
                <CameraIcon size={18} /> Take Photo
              </button>
              <button
                onClick={handleGalleryClick}
                className="w-full py-3 rounded-xl bg-white/[0.04] border border-line text-bone text-sm font-medium flex items-center justify-center gap-2 hover:bg-white/[0.08] transition-colors"
              >
                <Upload size={16} /> Upload from Gallery
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
        {preview && !isAnalyzing && (
          <button
            onClick={retake}
            className="py-3 px-6 rounded-xl bg-white/[0.04] border border-line text-bone text-sm font-medium flex items-center gap-2 hover:bg-white/[0.08] transition-colors"
          >
            <RotateCcw size={16} /> Retake
          </button>
        )}
      </div>
    </motion.div>
  );
}
