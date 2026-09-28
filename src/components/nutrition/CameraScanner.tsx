import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera as CameraIcon, X, RotateCcw, Upload, ScanLine } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useUIStore } from '@/stores/ui-store';
import { compressImageFile } from '@/utils/image-compression';

interface CameraScannerProps {
  onCapture: (base64: string, mimeType: string) => void;
  onClose: () => void;
  isAnalyzing?: boolean;
}

export default function CameraScanner({ onCapture, onClose, isAnalyzing }: CameraScannerProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useUIStore();

  const acceptFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.', 'error');
      return;
    }
    try {
      const dataUrl = await compressImageFile(file, 1280, 1280, 0.78);
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        showToast('Could not read that image.', 'error');
        return;
      }
      const mime = dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/jpeg';
      setPreview(dataUrl);
      onCapture(base64, mime);
    } catch {
      showToast('Could not process that image.', 'error');
    }
  };

  const takeNativePhoto = async (source: CameraSource) => {
    if (!Capacitor.isNativePlatform()) {
      (source === CameraSource.Camera ? cameraInputRef : galleryInputRef).current?.click();
      return;
    }
    try {
      const image = await Camera.getPhoto({
        quality: 82,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source,
        width: 1280
      });

      if (image.base64String) {
        const mime = `image/${image.format}`;
        const dataUrl = `data:${mime};base64,${image.base64String}`;
        setPreview(dataUrl);
        onCapture(image.base64String, mime);
      }
    } catch (error: any) {
      const message = String(error?.message || '');
      if (/cancel/i.test(message)) return;

      // Some Android devices do not expose their camera app to an intent. The
      // WebView capture input still works and gives the user the same camera UI.
      if (/no camera|not found|unavailable|not implemented|unsupported/i.test(message)) {
        (source === CameraSource.Camera ? cameraInputRef : galleryInputRef).current?.click();
        return;
      }
      showToast(`Camera error: ${message || 'Could not open camera'}`, 'error');
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
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="dx pro-scope fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--dx-canvas)' }}
    >
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={event => acceptFile(event.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => acceptFile(event.target.files?.[0])}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] border-b z-10" style={{ borderColor: 'var(--dx-border)', background: 'var(--dx-card)' }}>
        <button onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close scanner">
          <X size={18} />
        </button>
        <h2 className="text-[16px] font-semibold">Scan food</h2>
        <div className="w-9" />
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {preview ? (
          <img
            src={preview}
            alt="Captured food"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center p-8 w-full max-w-sm">
            <div className="w-20 h-20 mx-auto mb-5 rounded-[26px] flex items-center justify-center" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>
              <ScanLine size={36} />
            </div>
            <h3 className="text-[20px] font-semibold tracking-tight">Snap your meal</h3>
            <p className="mt-1.5 text-[14px] dx-muted leading-relaxed">
              Take a clear, top-down photo and Astra will estimate calories and macros in seconds.
            </p>
            <div className="mt-7 flex flex-col gap-2.5">
              <button onClick={handleCameraClick} className="dx-btn w-full h-12 text-[15px]">
                <CameraIcon size={18} /> Take photo
              </button>
              <button onClick={handleGalleryClick} className="dx-btn-secondary w-full h-12 text-[15px]">
                <Upload size={17} /> Choose from gallery
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
              className="absolute inset-0 flex flex-col items-center justify-center z-20 backdrop-blur-sm"
              style={{ background: 'color-mix(in srgb, var(--dx-canvas) 85%, transparent)' }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="w-14 h-14 rounded-full border-[3px] mb-4"
                style={{ borderColor: 'var(--dx-accent-soft)', borderTopColor: 'var(--dx-accent)' }}
              />
              <p className="text-[17px] font-semibold">Analyzing your meal</p>
              <p className="mt-1 text-[13px] dx-muted">Identifying foods and calculating nutrition…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Controls */}
      {preview && !isAnalyzing && (
        <div className="px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] border-t flex items-center justify-center" style={{ borderColor: 'var(--dx-border)', background: 'var(--dx-card)' }}>
          <button onClick={retake} className="dx-btn-secondary h-11 px-6">
            <RotateCcw size={16} /> Retake
          </button>
        </div>
      )}
    </motion.div>
  );
}
