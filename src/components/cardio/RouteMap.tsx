import { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoutePoint } from '@/types';

// Helper to get high-quality SVG silhouette for cardio type
const getCardioSvg = (type?: 'walk' | 'run' | 'cycle') => {
  if (type === 'cycle') {
    return `<svg xmlns="http://www.w3.org/2000/svg" height="28" viewBox="0 -960 960 960" width="28" fill="#8b5cf6" stroke="white" stroke-width="40" stroke-linejoin="round"><path d="M200-80q-83 0-141.5-58.5T0-280q0-83 58.5-141.5T200-480q83 0 141.5 58.5T400-280q0 83-58.5 141.5T200-80Zm85-115q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm243-441-96 96 66 69q11 11 16.5 25t5.5 30v176q0 17-11.5 28.5T480-200q-17 0-28.5-11.5T440-240v-160L312-512q-12-11-18-25.5t-6-30.5q0-16 6.5-30.5T312-624l112-112q12-12 27.5-18t32.5-6q17 0 32.5 6t27.5 18l76 76q23 23 50.5 37.5T729-603q17 3 26.5 16t6.5 30q-3 17-16 26.5t-30 6.5q-45-8-84.5-28T560-604l-32-32Zm35.5-127.5Q540-787 540-820t23.5-56.5Q587-900 620-900t56.5 23.5Q700-853 700-820t-23.5 56.5Q653-740 620-740t-56.5-23.5ZM760-80q-83 0-141.5-58.5T560-280q0-83 58.5-141.5T760-480q83 0 141.5 58.5T960-280q0 83-58.5 141.5T760-80Zm85-115q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Z"/></svg>`;
  }
  if (type === 'run') {
    return `<svg xmlns="http://www.w3.org/2000/svg" height="28" viewBox="0 -960 960 960" width="28" fill="#8b5cf6" stroke="white" stroke-width="40" stroke-linejoin="round"><path d="M520-80v-200l-84-80-31 138q-4 16-17.5 24.5T358-192l-198-40q-17-3-26-17t-6-31q3-17 17-26.5t31-5.5l152 32 64-324-72 28v96q0 17-11.5 28.5T280-440q-17 0-28.5-11.5T240-480v-122q0-12 6.5-21.5T264-638l134-58q35-15 51.5-19.5T480-720q21 0 39 11t29 29l40 64q21 34 54.5 59t77.5 33q17 3 28.5 15t11.5 29q0 17-11.5 28t-27.5 9q-54-8-101-33.5T540-540l-24 120 72 68q6 6 9 13.5t3 15.5v243q0 17-11.5 28.5T560-40q-17 0-28.5-11.5T520-80Zm-36.5-683.5Q460-787 460-820t23.5-56.5Q507-900 540-900t56.5 23.5Q620-853 620-820t-23.5 56.5Q573-740 540-740t-56.5-23.5Z"/></svg>`;
  }
  // Default: walk
  return `<svg xmlns="http://www.w3.org/2000/svg" height="28" viewBox="0 -960 960 960" width="28" fill="#8b5cf6" stroke="white" stroke-width="40" stroke-linejoin="round"><path d="M436-364 371-72q-3 14-14.5 23T330-40q-20 0-32-15t-8-34l102-515-72 28v96q0 17-11.5 28.5T280-440q-17 0-28.5-11.5T240-480v-122q0-12 6.5-21.5T264-638l178-76q14-6 29.5-7t29.5 4q14 5 26.5 14t20.5 23l40 64q13 20 30.5 38t39.5 31q14 8 31 14.5t34 9.5q16 3 26.5 14.5T760-480q0 17-12 28t-29 9q-56-8-100.5-35T541-543l-25 123 72 68q6 6 9 13.5t3 15.5v243q0 17-11.5 28.5T560-40q-17 0-28.5-11.5T520-80v-220l-84-64Zm47.5-399.5Q460-787 460-820t23.5-56.5Q507-900 540-900t56.5 23.5Q620-853 620-820t-23.5 56.5Q573-740 540-740t-56.5-23.5Z"/></svg>`;
};

// currentIcon dynamically generated based on type
const getCurrentIcon = (type?: 'walk' | 'run' | 'cycle') => {
  const coneHtml = `
    <svg class="compass-cone" width="120" height="120" viewBox="0 0 120 120" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(0deg); pointer-events: none; z-index: 1; opacity: 0; transition: transform 0.12s cubic-bezier(0.2, 0, 0.2, 1), opacity 0.3s ease;">
      <defs>
        <linearGradient id="coneGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.4" />
          <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M60,60 L25,0 A60,60 0 0,1 95,0 Z" fill="url(#coneGrad)" />
    </svg>
  `;

  return new L.DivIcon({
    html: `
      <div class="relative w-full h-full flex items-center justify-center">
        ${coneHtml}
        <div class="compass-marker" style="transform: rotate(0deg); display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; transition: transform 0.12s cubic-bezier(0.2, 0, 0.2, 1);">
          <div class="gps-pulse-ring" style="z-index: 2;"></div>
          <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; position: relative; z-index: 3; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            ${getCardioSvg(type)}
          </div>
        </div>
      </div>
    `,
    className: 'relative flex items-center justify-center',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

// maxNativeZoom = deepest level the provider actually serves; beyond it Leaflet
// upscales instead of fetching "Map data not yet available" placeholder tiles.
// Esri layers run on the free ArcGIS Location Platform key when VITE_ARCGIS_API_KEY is set.
const ARCGIS_KEY = ((import.meta.env.VITE_ARCGIS_API_KEY as string | undefined) || '').trim();
const esri = (service: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}${ARCGIS_KEY ? `?token=${encodeURIComponent(ARCGIS_KEY)}` : ''}`;
const OSM_CREDIT = '© OpenStreetMap contributors';
const ESRI_CREDIT = 'Powered by Esri';

export interface MapTheme { label: string; url: string; bg: string; maxNativeZoom: number; attribution: string }

/** Keyless OpenStreetMap street map: the fallback when another provider's tiles fail. */
export const OSM_STREET: MapTheme = { label: 'Street', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', bg: '#f5f5f5', maxNativeZoom: 19, attribution: OSM_CREDIT };

export const MAP_THEMES = {
  street: ARCGIS_KEY ? { ...OSM_STREET, url: esri('World_Street_Map'), attribution: ESRI_CREDIT } : OSM_STREET,
  dark: { label: 'Dark', url: esri('Canvas/World_Dark_Gray_Base'), bg: '#121212', maxNativeZoom: 16, attribution: ESRI_CREDIT },
  light: { label: 'Light', url: esri('Canvas/World_Light_Gray_Base'), bg: '#f5f5f5', maxNativeZoom: 16, attribution: ESRI_CREDIT },
  satellite: { label: 'Satellite', url: esri('World_Imagery'), bg: '#0a0a0a', maxNativeZoom: 17, attribution: ESRI_CREDIT },
  terrain: { label: 'Terrain', url: esri('World_Topo_Map'), bg: '#e8e4d8', maxNativeZoom: 17, attribution: ESRI_CREDIT },
  cyclosm: { label: 'CyclOSM', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', bg: '#f5f5f5', maxNativeZoom: 18, attribution: `${OSM_CREDIT} · CyclOSM` },
} satisfies Record<string, MapTheme>;

/** Map data credit the tile licences require (OpenStreetMap ODbL, Esri terms). */
export function MapAttribution({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`absolute z-[400] pointer-events-none select-none px-1.5 py-[1px] rounded text-[9px] leading-tight bg-black/35 text-white/85 ${className}`}>
      {text}
    </span>
  );
}

export type MapThemeKey = keyof typeof MAP_THEMES;

interface Props {
  route: RoutePoint[];
  isLive?: boolean;
  height?: string;
  theme?: MapThemeKey;
  highlightColor?: string;
  recenterTrigger?: number;
  hideMap?: boolean;
  noGlow?: boolean;
  isCapturing?: boolean;
  currentLocation?: { lat: number, lng: number, heading?: number } | null;
  cardioType?: 'walk' | 'run' | 'cycle';
  hideMarkers?: boolean;
  hideStartMarker?: boolean;
  mapPaddingBottomRight?: [number, number];
  mapPaddingTopLeft?: [number, number];
  /** Use the visible parent bounds (share cards) instead of the live map's
   * oversized 150vmax rotation canvas. */
  fitToContainer?: boolean;
  showZoomControls?: boolean;
  heading?: number | null;
  mapRotationMode?: boolean;
  visualHeadingRef?: React.MutableRefObject<number | null>;
  /** Set false for static previews (feed cards) so page scrolling is untouched. */
  interactive?: boolean;
  /** `card` = compact feed preview with start/finish pins. */
  variant?: 'default' | 'card';
}

function MapAutoCenter({ route, recenterTrigger, currentLocation, isLive, mapRotationMode }: { route: RoutePoint[], recenterTrigger?: number, currentLocation?: { lat: number, lng: number } | null, isLive?: boolean, mapRotationMode?: boolean }) {
  const map = useMap();
  const lastLen = useRef(0);
  const lastRecenter = useRef(recenterTrigger);
  const initialized = useRef(false);
  const isFollowing = useRef(true);

  // Any user pan breaks "follow me" (pinch-zoom keeps following, like
  // navigation apps). The gesture layer reads `_apFollow` to decide whether
  // pinches should zoom around the user or around the fingers.
  useEffect(() => {
    const m = map as any;
    m._apFollow = true;
    const handlePan = () => {
      isFollowing.current = false;
      m._apFollow = false;
    };
    map.on('ap:userpan', handlePan);
    return () => {
      map.off('ap:userpan', handlePan);
    };
  }, [map]);

  useEffect(() => {
    const m = map as any;
    let shouldCenter = false;

    // Center if recenterTrigger is updated (user explicitly clicked recenter)
    if (recenterTrigger !== lastRecenter.current) {
      shouldCenter = true;
      isFollowing.current = true; // Re-enable following
      m._apFollow = true;
    }
    
    // Automatically flag for centering if we get new points or location updates while following
    if (route.length > lastLen.current && route.length > 0 && isFollowing.current) {
      shouldCenter = true;
    }

    // Never fight the user's fingers mid-gesture.
    if (currentLocation && isFollowing.current && !m._apGesture) {
      const target = L.latLng(currentLocation.lat, currentLocation.lng);
      const dist = map.getCenter().distanceTo(target);

      if (!initialized.current) {
        map.setView(target, 16.5, { animate: false });
        initialized.current = true;
      }
      // Explicit recenter restores the default follow zoom.
      else if (recenterTrigger !== lastRecenter.current) {
        map.setView(target, Math.max(map.getZoom(), 16.5), { animate: true, duration: 0.45 } as any);
      }
      // If map is rotating, stay centered without animation (keeps user zoom)
      else if (mapRotationMode) {
        map.setView(target, map.getZoom(), { animate: false });
      }
      // Smooth follow if moved more than 12m - keep whatever zoom the user chose
      else if (dist > 12 || shouldCenter) {
        map.panTo(target, { animate: true, duration: 0.6, easeLinearity: 0.35 });
      }
    }

    lastLen.current = route.length;
    lastRecenter.current = recenterTrigger;
  }, [route, map, recenterTrigger, currentLocation, mapRotationMode]);

  return null;
}

/** Fits the map to the bounds of the entire route (for summary/share views) */
function FitBounds({ positions, recenterTrigger, paddingBottomRight, paddingTopLeft }: { positions: [number, number][], recenterTrigger?: number, paddingBottomRight?: [number, number], paddingTopLeft?: [number, number] }) {
  const map = useMap();
  const fitted = useRef(false);
  const lastRecenter = useRef(recenterTrigger);

  useEffect(() => {
    let shouldFit = false;

    if (positions.length > 1 && !fitted.current) {
      shouldFit = true;
      fitted.current = true;
    }

    if (recenterTrigger !== lastRecenter.current) {
      shouldFit = true;
    }

    if (shouldFit && positions.length > 1) {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      // The share card can change aspect ratio while the modal is open. Ensure
      // Leaflet measures the current card before fitting, then fit again on the
      // next frame so the entire route is visible after pressing recenter.
      map.invalidateSize({ animate: false });
      const fit = () => map.fitBounds(bounds, {
        paddingBottomRight: paddingBottomRight || [40, 40],
        paddingTopLeft: paddingTopLeft || [40, 40],
        maxZoom: 17
      });
      fit();
      const frame = requestAnimationFrame(fit);
      const timer = window.setTimeout(() => {
        map.invalidateSize({ animate: false });
        fit();
      }, 180);
      lastRecenter.current = recenterTrigger;
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }

    lastRecenter.current = recenterTrigger;
  }, [positions, map, recenterTrigger, paddingBottomRight, paddingTopLeft]);

  return null;
}

function InjectGradient() {
  const map = useMap();
  useEffect(() => {
    const inject = () => {
      const pane = map.getPane('overlayPane');
      const svg = pane?.querySelector('svg');
      if (svg && !svg.querySelector('#route-gradient')) {
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const linearGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        linearGradient.setAttribute("id", "route-gradient");
        linearGradient.setAttribute("x1", "0%");
        linearGradient.setAttribute("y1", "0%");
        linearGradient.setAttribute("x2", "100%");
        linearGradient.setAttribute("y2", "0%");

        const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("stop-color", "#fbbf24");

        const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop2.setAttribute("offset", "50%");
        stop2.setAttribute("stop-color", "#f43f5e");

        const stop3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop3.setAttribute("offset", "100%");
        stop3.setAttribute("stop-color", "#a855f7");

        linearGradient.appendChild(stop1);
        linearGradient.appendChild(stop2);
        linearGradient.appendChild(stop3);
        defs.appendChild(linearGradient);
        svg.prepend(defs);
      }
    };

    inject();
    map.on('layeradd', inject);

    // Also use fallback timeouts just in case layeradd fires before React renders Polyline
    const timer = setTimeout(inject, 100);
    const timer2 = setTimeout(inject, 500);

    return () => {
      map.off('layeradd', inject);
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [map]);
  return null;
}

function ShareZoomControls() {
  const map = useMap();
  const stopGesture = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div className="leaflet-top leaflet-left">
      <div className="leaflet-control leaflet-bar !m-3 !overflow-hidden !rounded-xl !border !border-white/50 !bg-black/55 !shadow-lg !backdrop-blur-md">
        <button type="button" aria-label="Zoom in" onPointerDown={stopGesture} onClick={(event) => { event.preventDefault(); event.stopPropagation(); map.zoomIn(1); }} className="!flex !h-10 !w-10 !items-center !justify-center !border-0 !border-b !border-white/20 !bg-transparent !text-xl !font-medium !text-white hover:!bg-white/20 active:!bg-white/30">+</button>
        <button type="button" aria-label="Zoom out" onPointerDown={stopGesture} onClick={(event) => { event.preventDefault(); event.stopPropagation(); map.zoomOut(1); }} className="!flex !h-10 !w-10 !items-center !justify-center !border-0 !bg-transparent !text-xl !font-medium !text-white hover:!bg-white/20 active:!bg-white/30">−</button>
      </div>
    </div>
  );
}

type Pt = { x: number; y: number };

/**
 * Unified touch / mouse / wheel gesture engine.
 *
 * Leaflet's built-in handlers assume an un-transformed container, so on the
 * live map (rotated for compass mode) and inside the scaled share preview they
 * pan in the wrong direction and pinch around the wrong point. This handler
 * converts every screen point into the map's local frame (undoing rotation and
 * ancestor scale), keeps the geographic point under the fingers pinned there,
 * and drives Leaflet's own pinch pipeline (`_move` with `pinch: true`) so tiles
 * scale on the GPU exactly like native pinch-zoom. Adds momentum panning,
 * fractional zoom, double-tap zoom and an optional two-finger rotate that only
 * engages after a deliberate twist (so pinching never rotates by accident).
 */
function SmoothGestures({
  wrapperRef,
  rotorRef,
  allowRotate,
  onRotate,
}: {
  wrapperRef: React.RefObject<HTMLDivElement>;
  rotorRef: React.RefObject<HTMLDivElement>;
  allowRotate: boolean;
  onRotate: (deg: number) => void;
}) {
  const map = useMap();
  const allowRotateRef = useRef(allowRotate);
  allowRotateRef.current = allowRotate;
  const onRotateRef = useRef(onRotate);
  onRotateRef.current = onRotate;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const rotor = rotorRef.current;
    if (!wrapper || !rotor) return;
    const m = map as any;

    const pointers = new Map<number, Pt>();
    let base: {
      anchor: L.LatLng;
      zoom: number;
      mid: Pt;
      dist: number;
      angle: number;
      rot: number;
      twistFrom: number | null;
      centered: boolean;
    } | null = null;
    let active = false;
    let moved = false;
    let zoomed = false;
    let manualRot: number | null = null;
    let frame = 0;
    let inertiaFrame = 0;
    let animFrame = 0;
    let wheelTimer = 0;
    let samples: { x: number; y: number; t: number }[] = [];
    let downAt: { x: number; y: number; t: number } | null = null;
    let lastTap: { x: number; y: number; t: number } | null = null;

    const readRotation = () => {
      if (manualRot !== null) return manualRot;
      const tr = getComputedStyle(rotor).transform;
      if (!tr || tr === 'none') return 0;
      try {
        const mx = new DOMMatrixReadOnly(tr);
        return Math.atan2(mx.b, mx.a) * (180 / Math.PI);
      } catch {
        return 0;
      }
    };

    /** Screen (client) point → Leaflet container point. */
    const toLocal = (pt: Pt, rotDeg: number) => {
      const r = rotor.getBoundingClientRect();
      const wr = wrapper.getBoundingClientRect();
      const scale = wrapper.offsetWidth ? wr.width / wrapper.offsetWidth : 1;
      const dx = (pt.x - (r.left + r.width / 2)) / (scale || 1);
      const dy = (pt.y - (r.top + r.height / 2)) / (scale || 1);
      const t = (rotDeg * Math.PI) / 180;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const size = map.getSize();
      return L.point(dx * c + dy * s + size.x / 2, -dx * s + dy * c + size.y / 2);
    };

    const clampZoom = (z: number) => Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z));

    /** Pin `anchor` under container point `local` at zoom `z`. */
    const applyView = (anchor: L.LatLng, local: L.Point, z: number) => {
      const zoom = clampZoom(z);
      const half = map.getSize().divideBy(2);
      const centerPx = map.project(anchor, zoom).subtract(local).add(half);
      if (Math.abs(zoom - map.getZoom()) < 1e-4) {
        const offset = centerPx.subtract(map.project(map.getCenter(), zoom));
        if (Math.abs(offset.x) >= 0.5 || Math.abs(offset.y) >= 0.5) {
          m._rawPanBy(offset);
          map.fire('move');
        }
      } else {
        zoomed = true;
        m._move(map.unproject(centerPx, zoom), zoom, { pinch: true, round: false });
      }
    };

    const midOf = (pts: Pt[]) => ({
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    });

    const following = () => Boolean(m._apFollow);

    const rebase = () => {
      const pts = [...pointers.values()];
      if (!pts.length) { base = null; return; }
      const mid = midOf(pts);
      const rot = readRotation();
      const centered = pts.length > 1 && following();
      const size = map.getSize();
      const local = centered ? L.point(size.x / 2, size.y / 2) : toLocal(mid, rot);
      base = {
        anchor: map.containerPointToLatLng(local),
        zoom: map.getZoom(),
        mid,
        dist: pts.length > 1 ? Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)) : 1,
        angle: pts.length > 1 ? Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * (180 / Math.PI) : 0,
        rot,
        twistFrom: null,
        centered,
      };
    };

    const stopAnimations = () => {
      cancelAnimationFrame(inertiaFrame);
      cancelAnimationFrame(animFrame);
      inertiaFrame = 0;
      animFrame = 0;
    };

    const begin = () => {
      if (active) return;
      active = true;
      moved = false;
      zoomed = false;
      m._apGesture = true;
      m._stop?.();
      // Settle any in-flight Leaflet zoom animation so it can't snap back later.
      if (m._animatingZoom) m._onZoomTransitionEnd?.();
      map.fire('movestart');
    };

    const finish = () => {
      if (manualRot !== null) {
        rotor.style.transition = 'transform 0.5s ease-out';
        manualRot = null;
      }
      if (zoomed) {
        if (map.options.zoomAnimation && m._zoomAnimated) {
          m._animateZoom(map.getCenter(), map.getZoom(), true, false);
        } else {
          m._resetView(map.getCenter(), map.getZoom());
        }
      } else if (moved) {
        map.fire('moveend');
      }
      active = false;
      moved = false;
      zoomed = false;
      m._apGesture = false;
    };

    const markPanned = () => {
      if (!moved) {
        moved = true;
        map.fire('ap:userpan');
      }
    };

    const step = () => {
      frame = 0;
      if (!base || !pointers.size) return;
      const pts = [...pointers.values()];
      const mid = midOf(pts);
      let rot = readRotation();

      if (pts.length === 1) {
        if (!moved && Math.hypot(mid.x - base.mid.x, mid.y - base.mid.y) < 3) return;
        markPanned();
        applyView(base.anchor, toLocal(mid, rot), base.zoom);
      } else {
        const dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * (180 / Math.PI);
        const zoom = base.zoom + Math.log2(dist / base.dist);

        if (allowRotateRef.current) {
          let twist = angle - base.angle;
          twist = ((twist + 540) % 360) - 180;
          if (base.twistFrom === null && Math.abs(twist) > 14) {
            base.twistFrom = angle;
            base.rot = rot;
            rotor.style.transition = 'none';
          }
          if (base.twistFrom !== null) {
            let d = angle - base.twistFrom;
            d = ((d + 540) % 360) - 180;
            rot = base.rot + d;
            manualRot = rot;
            onRotateRef.current(rot);
          }
        }

        if (base.centered && following()) {
          const size = map.getSize();
          applyView(base.anchor, L.point(size.x / 2, size.y / 2), zoom);
        } else {
          if (Math.hypot(mid.x - base.mid.x, mid.y - base.mid.y) > 8) markPanned();
          applyView(base.anchor, toLocal(mid, rot), zoom);
        }
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    const isUiTarget = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('.leaflet-control, button, a, input, [data-map-ignore]'));

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isUiTarget(e.target)) return;
      stopAnimations();
      try { wrapper.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (e.pointerType === 'mouse') e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      begin();
      rebase();
      samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      downAt = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        const now = performance.now();
        samples.push({ x: e.clientX, y: e.clientY, t: now });
        while (samples.length > 2 && now - samples[0].t > 100) samples.shift();
      }
      schedule();
    };

    const zoomAnimated = (anchor: L.LatLng, local: L.Point, from: number, to: number, durationMs = 260) => {
      stopAnimations();
      begin();
      const start = performance.now();
      const tick = () => {
        const p = Math.min(1, (performance.now() - start) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        applyView(anchor, local, from + (to - from) * eased);
        if (p < 1) animFrame = requestAnimationFrame(tick);
        else { animFrame = 0; finish(); }
      };
      animFrame = requestAnimationFrame(tick);
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const wasSingle = pointers.size === 1;
      // Flush the pending frame with the current pointer set before removing one.
      if (frame) { cancelAnimationFrame(frame); step(); }
      pointers.delete(e.pointerId);
      try { wrapper.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      if (pointers.size) {
        rebase();
        samples = [];
        return;
      }

      const now = performance.now();

      // Tap / double-tap zoom
      if (wasSingle && !moved && downAt && now - downAt.t < 250 && e.type === 'pointerup') {
        const tap = { x: e.clientX, y: e.clientY, t: now };
        if (lastTap && now - lastTap.t < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
          lastTap = null;
          active = false;
          m._apGesture = false;
          const rot = readRotation();
          const size = map.getSize();
          const local = following() ? L.point(size.x / 2, size.y / 2) : toLocal(tap, rot);
          const z = map.getZoom();
          zoomAnimated(map.containerPointToLatLng(local), local, z, clampZoom(z + 1));
          return;
        }
        lastTap = tap;
      }

      // Momentum
      if (wasSingle && moved && samples.length >= 2 && base) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = last.t - first.t;
        if (dt > 0 && now - last.t < 60) {
          let vx = (last.x - first.x) / dt;
          let vy = (last.y - first.y) / dt;
          const speed = Math.hypot(vx, vy);
          if (speed > 0.25) {
            const cap = 2.6;
            if (speed > cap) { vx = (vx / speed) * cap; vy = (vy / speed) * cap; }
            const anchor = base.anchor;
            const zoom = map.getZoom();
            let pt = { x: last.x, y: last.y };
            let prev = performance.now();
            const glide = () => {
              const t = performance.now();
              const elapsed = Math.min(40, t - prev);
              prev = t;
              const decay = Math.exp(-elapsed / 325);
              vx *= decay;
              vy *= decay;
              pt = { x: pt.x + vx * elapsed, y: pt.y + vy * elapsed };
              applyView(anchor, toLocal(pt, readRotation()), zoom);
              if (Math.hypot(vx, vy) > 0.02) inertiaFrame = requestAnimationFrame(glide);
              else { inertiaFrame = 0; finish(); }
            };
            inertiaFrame = requestAnimationFrame(glide);
            base = null;
            return;
          }
        }
      }

      base = null;
      finish();
    };

    const onWheel = (e: WheelEvent) => {
      if (isUiTarget(e.target)) return;
      e.preventDefault();
      stopAnimations();
      begin();
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 600 : 1;
      const delta = Math.max(-0.6, Math.min(0.6, (-e.deltaY * unit) / 260));
      const rot = readRotation();
      const size = map.getSize();
      const local = following() ? L.point(size.x / 2, size.y / 2) : toLocal({ x: e.clientX, y: e.clientY }, rot);
      applyView(map.containerPointToLatLng(local), local, map.getZoom() + delta);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(finish, 160);
    };

    wrapper.addEventListener('pointerdown', onDown);
    wrapper.addEventListener('pointermove', onMove);
    wrapper.addEventListener('pointerup', onUp);
    wrapper.addEventListener('pointercancel', onUp);
    wrapper.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stopAnimations();
      cancelAnimationFrame(frame);
      window.clearTimeout(wheelTimer);
      wrapper.removeEventListener('pointerdown', onDown);
      wrapper.removeEventListener('pointermove', onMove);
      wrapper.removeEventListener('pointerup', onUp);
      wrapper.removeEventListener('pointercancel', onUp);
      wrapper.removeEventListener('wheel', onWheel);
      m._apGesture = false;
    };
  }, [map, wrapperRef, rotorRef]);

  return null;
}

export function RouteMap({
  route,
  isLive = false,
  height = "300px",
  theme = 'dark',
  highlightColor,
  recenterTrigger,
  hideMap = false,
  noGlow = false,
  isCapturing = false,
  currentLocation,
  cardioType = 'walk',
  hideMarkers = false,
  hideStartMarker = false,
  mapPaddingBottomRight,
  mapPaddingTopLeft,
  fitToContainer = false,
  showZoomControls = false,
  heading,
  mapRotationMode = false,
  visualHeadingRef,
  interactive = true,
  variant = 'default',
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const manualRotationRef = useRef(0);
  const tileErrorCountRef = useRef(0);
  const [useStreetFallback, setUseStreetFallback] = useState(false);
  const isFullScreen = height === '100%' && !fitToContainer;
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  useEffect(() => {
    if (!isFullScreen) return;
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isFullScreen]);

  useEffect(() => {
    tileErrorCountRef.current = 0;
    setUseStreetFallback(false);
  }, [theme]);

  const applyManualRotation = () => {
    if (!mapRotationMode && mapContainerRef.current) {
      mapContainerRef.current.style.transform = `translateZ(0) rotate(${manualRotationRef.current}deg)`;
    }
  };

  const handleGestureRotate = (deg: number) => {
    manualRotationRef.current = deg;
    applyManualRotation();
  };

  // Recenter resets manual rotation whether or not compass mode was enabled.
  useEffect(() => {
    manualRotationRef.current = 0;
    applyManualRotation();
  }, [recenterTrigger, mapRotationMode]);

  // Compass Visual Controller (RAF loop)
  useEffect(() => {
    if (!visualHeadingRef) return;
    
    let rafId: number;
    let lastAppliedConeHeading: number | null = null;
    let lastAppliedMapHeading: number | null = null;
    const HEADING_CHANGE_THRESHOLD = 2; // Only update when heading changes by > 2°

    const animate = () => {
      const vHead = visualHeadingRef.current;
      if (mapContainerRef.current) {
        // Map Container Rotation - only update if heading changed meaningfully
        const targetMapHeading = mapRotationMode && vHead !== null ? -vHead : manualRotationRef.current;
        if (lastAppliedMapHeading === null || Math.abs(targetMapHeading - lastAppliedMapHeading) > HEADING_CHANGE_THRESHOLD) {
          mapContainerRef.current.style.transform = `translateZ(0) rotate(${targetMapHeading}deg)`;
          lastAppliedMapHeading = targetMapHeading;
        }
          
        // Icon/Cone Rotation - guard with threshold to prevent sub-pixel jitter
        const validHeading = vHead !== null ? vHead : currentLocation?.heading;
        
        if (validHeading != null) {
          const headingChanged = lastAppliedConeHeading === null || Math.abs(validHeading - lastAppliedConeHeading) > HEADING_CHANGE_THRESHOLD;
          if (headingChanged) {
            const coneEl = mapContainerRef.current.querySelector('.compass-cone') as HTMLElement;
            if (coneEl) {
              coneEl.style.opacity = '1';
              coneEl.style.transition = 'none';
              coneEl.style.transform = `translate(-50%, -50%) rotate(${validHeading}deg)`;
            }
            
            const markerEl = mapContainerRef.current.querySelector('.compass-marker') as HTMLElement;
            if (markerEl) {
              markerEl.style.transition = 'none';
              markerEl.style.transform = `rotate(${validHeading}deg)`;
            }
            lastAppliedConeHeading = validHeading;
          }
        } else {
          const coneEl = mapContainerRef.current.querySelector('.compass-cone') as HTMLElement;
          if (coneEl) coneEl.style.opacity = '0';
        }
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [mapRotationMode, visualHeadingRef]);

  const positions: [number, number][] = useMemo(() => {
    let rawRoute: any = route;
    if (typeof rawRoute === 'string') {
      try {
        rawRoute = JSON.parse(rawRoute);
      } catch {
        rawRoute = [];
      }
    }
    if (!Array.isArray(rawRoute)) {
      rawRoute = [];
    }

    const pts: [number, number][] = [];
    for (const p of rawRoute) {
      if (!p) continue;
      let lat: number | undefined;
      let lng: number | undefined;
      if (Array.isArray(p) && p.length >= 2) {
        lat = Number(p[0]);
        lng = Number(p[1]);
      } else if (typeof p === 'object') {
        lat = Number(p.lat !== undefined ? p.lat : p.latitude);
        lng = Number(p.lng !== undefined ? p.lng : p.longitude);
      }
      if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        pts.push([lat, lng]);
      }
    }

    if (isLive && currentLocation) {
      const cLat = Number(currentLocation.lat);
      const cLng = Number(currentLocation.lng);
      if (!isNaN(cLat) && !isNaN(cLng)) {
        pts.push([cLat, cLng]);
      }
    }
    return pts;
  }, [route, isLive, currentLocation]);

  const center: [number, number] = currentLocation
    ? [currentLocation.lat, currentLocation.lng]
    : positions.length > 0
      ? positions[positions.length - 1]
      : [20.5937, 78.9629]; // Default: India center

  const zoom = (positions.length > 0 || currentLocation) ? 16.5 : 5;

  const requestedThemeData = MAP_THEMES[theme] || MAP_THEMES.street;
  const themeData: MapTheme = useStreetFallback ? OSM_STREET : requestedThemeData;
  const isDarkMap = !useStreetFallback && (theme === 'dark' || theme === 'satellite');

  const isGradient = highlightColor === 'url(#route-gradient)';
  const startColor = isGradient ? '#fbbf24' : highlightColor || '#fbbf24';
  const endColor = isGradient ? '#a855f7' : highlightColor || '#a855f7';

  const strokeColor = isGradient ? 'url(#route-gradient)' : (highlightColor || (isLive ? '#8b5cf6' : '#a855f7'));

  const startIcon = useMemo(() => variant === 'card'
    ? new L.DivIcon({
        html: `<div style="width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${isDarkMap ? '#f7f5f2' : '#17191c'};box-shadow:0 0 0 3px ${isDarkMap ? 'rgba(247,245,242,0.25)' : 'rgba(23,25,28,0.18)'},0 4px 10px rgba(0,0,0,0.25);"><svg width="11" height="11" viewBox="0 0 24 24" fill="${isDarkMap ? '#17191c' : '#ffffff'}"><path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z"/></svg></div>`,
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      })
    : new L.DivIcon({
    html: `<div style="width: 16px; height: 16px; background: ${startColor}; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  }), [startColor, variant, isDarkMap]);

  const endIcon = useMemo(() => variant === 'card'
    ? new L.DivIcon({
        html: `<div style="width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${isDarkMap ? '#f7f5f2' : '#17191c'};box-shadow:0 4px 10px rgba(0,0,0,0.3);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${isDarkMap ? '#17191c' : '#ffffff'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5" fill="${isDarkMap ? '#17191c' : '#ffffff'}"/></svg></div>`,
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      })
    : new L.DivIcon({
    html: `<div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: ${endColor}; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.3));">
      ${getCardioSvg(cardioType)}
    </div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  }), [endColor, cardioType, variant, isDarkMap]);

  const liveIcon = useMemo(() => getCurrentIcon(cardioType), [cardioType]);

  // The live map rotates, so its canvas is the smallest square that still covers the
  // screen at any angle around the rotation centre (midpoint above the ~180px sheet).
  // Anything bigger only means more tiles to download before the map appears.
  const rotCx = viewport.w / 2;
  const rotCy = viewport.h / 2 - 90;
  const rotR = Math.ceil(Math.hypot(Math.max(rotCx, viewport.w - rotCx), Math.max(rotCy, viewport.h - rotCy))) + 8;
  const mapWidth = isFullScreen ? `${rotR * 2}px` : '100%';
  const mapHeight = isFullScreen ? `${rotR * 2}px` : '100%';
  const mapLeft = isFullScreen ? `${rotCx - rotR}px` : '0';
  const mapTop = isFullScreen ? `${rotCy - rotR}px` : '0';

  return (
    <div ref={wrapperRef} className={`w-full ${height !== '100%' ? 'rounded-2xl' : ''} overflow-hidden ${variant === 'card' ? '' : 'shadow-sm'} relative ${isLive ? 'ring-2 ring-[var(--border)]' : ''} ${hideMap ? '[&_.leaflet-container]:!bg-transparent [&_.leaflet-map-pane]:!bg-transparent [&_.leaflet-pane]:!bg-transparent' : ''}`} style={{ height, background: hideMap ? 'transparent' : themeData.bg, touchAction: interactive ? 'none' : undefined }}>
      <div ref={mapContainerRef} className="compass-map-container" style={{
        position: 'absolute',
        width: mapWidth,
        height: mapHeight,
        left: mapLeft,
        top: mapTop,
        transition: 'transform 0.5s ease-out',
        willChange: 'transform',
        transformOrigin: 'center center',
      }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%', background: hideMap ? 'transparent' : themeData.bg }}
          zoomControl={false}
          attributionControl={false}
          // Leaflet's stock handlers are replaced by <SmoothGestures/>, which is
          // rotation/scale aware. Fractional zoom keeps pinches continuous.
          dragging={false}
          touchZoom={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          boxZoom={false}
          keyboard={interactive}
          zoomSnap={0}
          zoomDelta={1}
          minZoom={3}
          maxZoom={19}
          bounceAtZoomLimits={false}
          fadeAnimation
          zoomAnimation
          markerZoomAnimation
        >
          <InjectGradient />
          {interactive && (
            <SmoothGestures
              wrapperRef={wrapperRef}
              rotorRef={mapContainerRef}
              allowRotate={isFullScreen && !mapRotationMode}
              onRotate={handleGestureRotate}
            />
          )}
          {showZoomControls && <ShareZoomControls />}
          {!hideMap && (
            <TileLayer
              key={themeData.url}
              url={themeData.url}
              // CORS is only needed when the map is rasterised (share cards); some providers reject it.
              crossOrigin={fitToContainer || isCapturing ? 'anonymous' : undefined}
              maxNativeZoom={themeData.maxNativeZoom}
              maxZoom={19}
              keepBuffer={isFullScreen ? 1 : 2}
              updateWhenZooming={false}
              eventHandlers={{
                tileerror: () => {
                  tileErrorCountRef.current += 1;
                  if (themeData.url !== OSM_STREET.url && tileErrorCountRef.current >= 2) {
                    setUseStreetFallback(true);
                  }
                },
              }}
            />
          )}

          {positions.length > 1 && (
            <>
              {isDarkMap && !hideMap && !noGlow && (
                <>
                  {/* Outer Glow effect for dark maps */}
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color: strokeColor,
                      weight: 20,
                      opacity: 0.2,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                  {/* Inner Glow effect for dark maps */}
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color: strokeColor,
                      weight: 10,
                      opacity: 0.4,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                </>
              )}
              {/* Core line */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color: strokeColor,
                  weight: variant === 'card' ? 4 : 5,
                  opacity: 1,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </>
          )}

          {/* Start marker */}
          {!hideMarkers && !hideStartMarker && positions.length > 0 && (
            <Marker position={positions[0]} icon={startIcon} interactive={false} />
          )}

          {/* Current position marker */}
          {!hideMarkers && (isLive || currentLocation) && (
            currentLocation ? (
              <Marker position={[currentLocation.lat, currentLocation.lng]} icon={liveIcon} interactive={false} />
            ) : positions.length > 0 ? (
              <Marker position={positions[positions.length - 1]} icon={liveIcon} interactive={false} />
            ) : null
          )}

          {/* End marker (only in static mode) */}
          {!hideMarkers && !isLive && positions.length > 1 && (
            <Marker position={positions[positions.length - 1]} icon={endIcon} interactive={false} />
          )}

          {/* Follow the user only while live, or before a route exists (ready
              screen). Static routes (share/feed/history) fit their bounds once
              and never snap back after the user pans or zooms. */}
          {(isLive || (currentLocation && positions.length < 2)) && !hideMarkers && <MapAutoCenter route={route} recenterTrigger={recenterTrigger} currentLocation={currentLocation} isLive={isLive} mapRotationMode={mapRotationMode} />}
          {!isLive && positions.length > 1 && <FitBounds positions={positions} recenterTrigger={recenterTrigger} paddingBottomRight={mapPaddingBottomRight} paddingTopLeft={mapPaddingTopLeft} />}
        </MapContainer>
      </div>
      {!hideMap && (
        <MapAttribution
          text={themeData.attribution}
          className={isFullScreen ? 'left-2 top-[calc(var(--sat)+64px)]' : 'right-1.5 bottom-1.5'}
        />
      )}
    </div>
  );
}
