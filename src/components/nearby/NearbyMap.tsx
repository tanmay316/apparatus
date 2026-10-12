import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_THEMES, MapAttribution } from '@/components/cardio/RouteMap';
import { getAvatarUrl } from '@/lib/avatar';
import { useUIStore } from '@/stores/ui-store';
import type { NearbyAthlete } from '@/services/nearby';
import { ACTIVITY_META } from './nearby-ui';

/** Built with DOM APIs (not HTML strings) so names/URLs from other users can't inject markup. */
function athleteIcon(a: NearbyAthlete, selected: boolean, theme: 'light' | 'dark') {
  const meta = ACTIVITY_META[a.activity];
  const size = selected ? 48 : 40;
  const root = document.createElement('div');
  root.className = 'nearby-pin';
  root.style.cssText = `width:${size}px;height:${size}px;position:relative;transition:transform .2s ease;`;
  const img = document.createElement('img');
  img.src = a.photoURL || getAvatarUrl(a.displayName || 'A', theme, 96);
  img.referrerPolicy = 'no-referrer';
  img.alt = '';
  img.style.cssText = `width:100%;height:100%;border-radius:9999px;object-fit:cover;border:3px solid ${meta.color};background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.28);`;
  img.onerror = () => { img.src = getAvatarUrl(a.displayName || 'A', theme, 96); };
  const dot = document.createElement('span');
  dot.style.cssText = `position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:9999px;background:${meta.color};border:2px solid #fff;`;
  root.append(img, dot);
  return L.divIcon({ html: root, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const viewerIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div class="nearby-me"><span></span></div>',
});

function FitArea({ center, radiusKm }: { center: [number, number]; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(center).toBounds(radiusKm * 2000);
    map.fitBounds(bounds, { padding: [12, 12], animate: false });
  }, [map, center[0], center[1], radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [map, target]);
  return null;
}

export function NearbyMap({
  viewer, radiusKm, athletes, selectedUid, onSelect, height = 320,
}: {
  viewer: { lat: number; lng: number };
  radiusKm: number;
  athletes: NearbyAthlete[];
  selectedUid?: string | null;
  onSelect: (uid: string) => void;
  height?: number;
}) {
  const themeName = useUIStore(s => s.theme);
  const theme = themeName === 'dark' ? MAP_THEMES.dark : MAP_THEMES.street;
  const center: [number, number] = [viewer.lat, viewer.lng];
  const selected = athletes.find(a => a.uid === selectedUid) ?? null;
  const icons = useMemo(
    () => new Map(athletes.map(a => [a.uid, athleteIcon(a, a.uid === selectedUid, themeName)])),
    [athletes, selectedUid, themeName],
  );

  return (
    <div className="relative rounded-3xl overflow-hidden" style={{ height, background: theme.bg, border: '1px solid var(--dx-border)' }}>
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
        <TileLayer url={theme.url} maxNativeZoom={theme.maxNativeZoom} maxZoom={17} />
        <FitArea center={center} radiusKm={radiusKm} />
        <FlyTo target={selected ? [selected.lat, selected.lng] : null} />
        <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: '#5d2a1a', weight: 1.5, dashArray: '6 6', fillOpacity: 0.04 }} />
        {athletes.map(a => (
          <Circle
            key={`area-${a.uid}`}
            center={[a.lat, a.lng]}
            radius={650}
            pathOptions={{ color: ACTIVITY_META[a.activity].color, weight: 0, fillOpacity: a.uid === selectedUid ? 0.22 : 0.12 }}
          />
        ))}
        {athletes.map(a => (
          <Marker
            key={a.uid}
            position={[a.lat, a.lng]}
            icon={icons.get(a.uid)!}
            zIndexOffset={a.uid === selectedUid ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(a.uid) }}
          />
        ))}
        <Marker position={center} icon={viewerIcon} interactive={false} zIndexOffset={2000} />
      </MapContainer>
      <MapAttribution text={theme.attribution} className="left-2 bottom-2" />
    </div>
  );
}
