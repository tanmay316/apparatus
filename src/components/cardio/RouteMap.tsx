import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoutePoint } from '@/types';

// Fix default marker icon (Leaflet CSS issue with bundlers)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const currentIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface Props {
  route: RoutePoint[];
  isLive?: boolean;
  height?: string;
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

export function RouteMap({ route, isLive = false, height = '300px', highlightColor = '#FF5500' }: Props) {
  const positions: [number, number][] = useMemo(
    () => route.map(p => [p.lat, p.lng]),
    [route]
  );

  const center: [number, number] = positions.length > 0
    ? positions[positions.length - 1]
    : [20.5937, 78.9629]; // Default: India center

  const zoom = positions.length > 0 ? 16 : 5;

  return (
    <div style={{ height, width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {positions.length > 1 && (
          <Polyline
            positions={positions}
            pathOptions={{
              color: highlightColor,
              weight: 4,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Start marker */}
        {positions.length > 0 && (
          <Marker position={positions[0]} />
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
