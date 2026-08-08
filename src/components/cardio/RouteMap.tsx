import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoutePoint } from '@/types';

// Custom icons using HTML
const startIcon = new L.DivIcon({
  html: `<div style="width: 20px; height: 20px; background: #f97316; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const currentIcon = new L.DivIcon({
  html: `
    <div class="gps-pulse-ring"></div>
    <div style="width: 20px; height: 20px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 15px rgba(59,130,246,0.5); display: flex; align-items: center; justify-content: center; position: relative; z-index: 2;">
      <div style="width: 6px; height: 6px; background: white; border-radius: 50%;"></div>
    </div>
  `,
  className: 'relative flex items-center justify-center',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
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
}

/** Keeps the map centered on the last route point when live tracking or when recenterTrigger changes */
function MapAutoCenter({ route, recenterTrigger }: { route: RoutePoint[], recenterTrigger?: number }) {
  const map = useMap();
  const lastLen = useRef(0);
  const lastRecenter = useRef(recenterTrigger);

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
    }
    
    lastLen.current = route.length;
    lastRecenter.current = recenterTrigger;
  }, [route, map, recenterTrigger]);

  return null;
}

/** Fits the map to the bounds of the entire route (for summary/share views) */
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (positions.length > 1 && !fitted.current) {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      fitted.current = true;
    }
  }, [positions, map]);

  return null;
}

export function RouteMap({ route, isLive = false, height = '300px', theme = 'street', highlightColor = '#5d2a1a', recenterTrigger, hideMap = false, noGlow = false }: Props) {
  const positions: [number, number][] = useMemo(
    () => route.map(p => [p.lat, p.lng]),
    [route]
  );

  const center: [number, number] = positions.length > 0
    ? positions[positions.length - 1]
    : [20.5937, 78.9629]; // Default: India center

  const zoom = positions.length > 0 ? 16.5 : 5;
  
  const themeData = MAP_THEMES[theme] || MAP_THEMES.street;

  return (
    <div style={{ height, width: '100%', overflow: 'hidden' }} className="relative">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%', background: hideMap ? 'transparent' : themeData.bg }}
        zoomControl={false}
        attributionControl={false}
      >
        {!hideMap && <TileLayer url={themeData.url} crossOrigin="anonymous" />}

        {positions.length > 1 && (
          <>
            {!noGlow && (
              <>
                {/* Outer Glow effect */}
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: highlightColor,
                    weight: 24,
                    opacity: 0.15,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {/* Inner Glow effect */}
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: highlightColor,
                    weight: 12,
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
                color: highlightColor,
                weight: noGlow ? 4 : 5,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* Start marker */}
        {positions.length > 0 && (
          <Marker position={positions[0]} icon={startIcon} />
        )}

        {/* Current position marker (only in live mode) */}
        {isLive && positions.length > 1 && (
          <Marker position={positions[positions.length - 1]} icon={currentIcon} />
        )}

        {isLive && <MapAutoCenter route={route} recenterTrigger={recenterTrigger} />}
        {!isLive && positions.length > 1 && <FitBounds positions={positions} />}
      </MapContainer>
    </div>
  );
}
