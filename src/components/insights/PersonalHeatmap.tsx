import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Hand, Lock } from 'lucide-react';
import { MAP_THEMES } from '@/components/cardio/RouteMap';

export type HeatRoute = [number, number][];

/** Switches map gestures on only after a tap, so the page still scrolls over the map. */
function Interaction({ active, bounds }: { active: boolean; bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    const handlers = [map.dragging, map.touchZoom, map.doubleClickZoom, map.scrollWheelZoom, map.boxZoom, map.keyboard];
    handlers.forEach(h => (active ? h.enable() : h.disable()));
  }, [active, map]);
  useEffect(() => {
    map.fitBounds(bounds, { padding: [18, 18], maxZoom: 15 });
  }, [bounds, map]);
  return null;
}

export default function PersonalHeatmap({ routes, dark, color, height = 360 }: { routes: HeatRoute[]; dark: boolean; color: string; height?: number }) {
  const [active, setActive] = useState(false);
  const bounds = useMemo(() => L.latLngBounds(routes.flat()), [routes]);
  const theme = dark ? MAP_THEMES.dark : MAP_THEMES.light;
  if (!routes.length) return null;
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ height, background: theme.bg, touchAction: active ? 'none' : 'auto' }}>
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [18, 18], maxZoom: 15 }}
        preferCanvas
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
        style={{ height: '100%', width: '100%', background: theme.bg }}
      >
        <TileLayer url={theme.url} maxNativeZoom={theme.maxNativeZoom} maxZoom={19} />
        <Interaction active={active} bounds={bounds} />
        {routes.map((r, i) => (
          <Polyline key={i} positions={r} pathOptions={{ color, weight: 3, opacity: dark ? 0.38 : 0.32, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
        ))}
      </MapContainer>
      <button
        type="button"
        onClick={() => setActive(a => !a)}
        className="absolute bottom-3 right-3 z-[500] h-9 px-3.5 rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 bg-black/60 text-white backdrop-blur-md"
      >
        {active ? <><Lock size={14} /> Lock map</> : <><Hand size={14} /> Tap to explore</>}
      </button>
    </div>
  );
}
