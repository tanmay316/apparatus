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
  html: `<div style="width: 24px; height: 24px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 15px rgba(59,130,246,0.5); display: flex; align-items: center; justify-content: center;"><div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div></div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

interface Props {
  route: RoutePoint[];
  isLive?: boolean;
  height?: string;
  theme?: 'light' | 'dark' | 'satellite' | 'street';
  highlightColor?: string;
}

/** Keeps the map centered on the last route point when live tracking */
function MapAutoCenter({ route }: { route: RoutePoint[] }) {
  const map = useMap();
  const lastLen = useRef(0);

  useEffect(() => {
    if (route.length > lastLen.current && route.length > 0) {
      const last = route[route.length - 1];
      map.setView([last.lat, last.lng], map.getZoom(), { animate: true });
    }
    lastLen.current = route.length;
  }, [route, map]);

  return null;
}

export function RouteMap({ route, isLive = false, height = '300px', theme = 'light', highlightColor = '#3b82f6' }: Props) {
  const positions: [number, number][] = useMemo(
    () => route.map(p => [p.lat, p.lng]),
    [route]
  );

  const center: [number, number] = positions.length > 0
    ? positions[positions.length - 1]
    : [20.5937, 78.9629]; // Default: India center

  const zoom = positions.length > 0 ? 16 : 5;
  
  let tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  if (theme === 'dark') tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  if (theme === 'satellite') tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  if (theme === 'street') tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  return (
    <div style={{ height, width: '100%', overflow: 'hidden' }} className="relative">
      {/* Fade overlay for top/bottom to blend into UI optionally */}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%', background: theme === 'dark' ? '#121212' : '#f5f5f5' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={tileUrl} />

        {positions.length > 1 && (
          <Polyline
            positions={positions}
            pathOptions={{
              color: highlightColor,
              weight: 6,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Start marker */}
        {positions.length > 0 && (
          <Marker position={positions[0]} icon={startIcon} />
        )}

        {/* Current position marker (only in live mode) */}
        {isLive && positions.length > 1 && (
          <Marker position={positions[positions.length - 1]} icon={currentIcon} />
        )}

        {isLive && <MapAutoCenter route={route} />}
      </MapContainer>
    </div>
  );
}
