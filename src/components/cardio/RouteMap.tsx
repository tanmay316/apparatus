import { useEffect, useRef, useMemo } from 'react';
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
const getCurrentIcon = (type?: 'walk' | 'run' | 'cycle') => new L.DivIcon({
  html: `
    <div class="gps-pulse-ring"></div>
    <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; position: relative; z-index: 2; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
      ${getCardioSvg(type)}
    </div>
  `,
  className: 'relative flex items-center justify-center',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// All available map themes with tile URLs
export const MAP_THEMES = {
  street:    { label: 'Street',    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', bg: '#f5f5f5' },
  dark:      { label: 'Dark',      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', bg: '#121212' },
  light:     { label: 'Light',     url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', bg: '#f5f5f5' },
  google:    { label: 'Google',    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', bg: '#f5f5f5' },
  satellite: { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', bg: '#0a0a0a' },
  terrain:   { label: 'Terrain',   url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', bg: '#e8e4d8' },
  toner:     { label: 'Toner',     url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', bg: '#ffffff' },
} as const;

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
  currentLocation?: { lat: number, lng: number } | null;
  cardioType?: 'walk' | 'run' | 'cycle';
  hideMarkers?: boolean;
  mapPaddingBottomRight?: [number, number];
  mapPaddingTopLeft?: [number, number];
}

/** Keeps the map centered on the last route point when live tracking or when recenterTrigger changes */
function MapAutoCenter({ route, recenterTrigger, currentLocation }: { route: RoutePoint[], recenterTrigger?: number, currentLocation?: { lat: number, lng: number } | null }) {
  const map = useMap();
  const lastLen = useRef(0);
  const lastRecenter = useRef(recenterTrigger);
  const initialized = useRef(false);

  useEffect(() => {
    let shouldCenter = false;
    
    // Center if new points arrive
    if (route.length > lastLen.current && route.length > 0) {
      shouldCenter = true;
    }
    
    // Center if recenterTrigger is updated
    if (recenterTrigger !== lastRecenter.current) {
      shouldCenter = true;
    }

    if (shouldCenter && route.length > 0) {
      const last = route[route.length - 1];
      map.setView([last.lat, last.lng], 16.5, { animate: true });
    } else if (shouldCenter && currentLocation) {
      map.setView([currentLocation.lat, currentLocation.lng], 16.5, { animate: true });
    } else if (currentLocation && !initialized.current) {
      // First time getting location
      map.setView([currentLocation.lat, currentLocation.lng], 16.5, { animate: true });
      initialized.current = true;
    }
    
    lastLen.current = route.length;
    lastRecenter.current = recenterTrigger;
  }, [route, map, recenterTrigger, currentLocation]);

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
      map.fitBounds(bounds, { 
        paddingBottomRight: paddingBottomRight || [40, 40],
        paddingTopLeft: paddingTopLeft || [40, 40],
        maxZoom: 17 
      });
    }
    
    lastRecenter.current = recenterTrigger;
  }, [positions, map, recenterTrigger]);

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

export function RouteMap({ route, isLive = false, height = '300px', theme = 'street', highlightColor = 'url(#route-gradient)', recenterTrigger, hideMap = false, noGlow = false, isCapturing = false, currentLocation, cardioType, hideMarkers, mapPaddingBottomRight, mapPaddingTopLeft }: Props) {
  const positions: [number, number][] = useMemo(() => {
    const pts = route.map(p => [p.lat, p.lng] as [number, number]);
    if (isLive && currentLocation) {
      pts.push([currentLocation.lat, currentLocation.lng]);
    }
    return pts;
  }, [route, isLive, currentLocation]);

  const center: [number, number] = currentLocation
    ? [currentLocation.lat, currentLocation.lng]
    : positions.length > 0
    ? positions[positions.length - 1]
    : [20.5937, 78.9629]; // Default: India center

  const zoom = (positions.length > 0 || currentLocation) ? 16.5 : 5;
  
  const themeData = MAP_THEMES[theme] || MAP_THEMES.street;
  const isDarkMap = theme === 'dark' || theme === 'satellite';

  const isGradient = highlightColor === 'url(#route-gradient)';
  const startColor = isGradient ? '#fbbf24' : highlightColor || '#fbbf24';
  const endColor = isGradient ? '#a855f7' : highlightColor || '#a855f7';

  const strokeColor = isGradient ? 'url(#route-gradient)' : highlightColor;

  const startIcon = useMemo(() => new L.DivIcon({
    html: `<div style="width: 16px; height: 16px; background: ${startColor}; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  }), [startColor]);

  const endIcon = useMemo(() => new L.DivIcon({
    html: `<div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: ${endColor}; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.3));">
      ${getCardioSvg(cardioType)}
    </div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  }), [endColor, cardioType]);

  const liveIcon = useMemo(() => getCurrentIcon(cardioType), [cardioType]);

  return (
    <div style={{ height, width: '100%', overflow: 'hidden' }} className="relative">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%', background: hideMap ? 'transparent' : themeData.bg }}
        zoomControl={false}
        attributionControl={false}
      >
        <InjectGradient />
        {!hideMap && <TileLayer url={themeData.url} crossOrigin="anonymous" />}

        {positions.length > 1 && (
          <>
            {isDarkMap && !hideMap && (
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
                weight: 5,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* Start marker */}
        {!hideMarkers && positions.length > 0 && (
          <Marker position={positions[0]} icon={startIcon} />
        )}

        {/* Current position marker */}
        {!hideMarkers && (isLive || currentLocation) && (
          currentLocation ? (
            <Marker position={[currentLocation.lat, currentLocation.lng]} icon={liveIcon} />
          ) : positions.length > 0 ? (
            <Marker position={positions[positions.length - 1]} icon={liveIcon} />
          ) : null
        )}

        {/* End marker (only in static mode) */}
        {!hideMarkers && !isLive && positions.length > 1 && (
          <Marker position={positions[positions.length - 1]} icon={endIcon} />
        )}

        {(isLive || currentLocation) && !hideMarkers && <MapAutoCenter route={route} recenterTrigger={recenterTrigger} currentLocation={currentLocation} />}
        {!isLive && positions.length > 1 && <FitBounds positions={positions} recenterTrigger={recenterTrigger} paddingBottomRight={mapPaddingBottomRight} paddingTopLeft={mapPaddingTopLeft} />}
      </MapContainer>
    </div>
  );
}
