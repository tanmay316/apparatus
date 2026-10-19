import { Fragment, useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import '@/lib/leaflet-safe';
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
  root.className = 'nearby-pin nearby-pin--live';
  root.style.cssText = `width:${size}px;height:${size}px;position:relative;transition:transform .2s ease;`;
  const pulse = document.createElement('span');
  pulse.style.cssText = `position:absolute;inset:-6px;border-radius:9999px;background:${meta.color};opacity:.35;animation:nearbyPulse 1.8s ease-out infinite;`;
  const img = document.createElement('img');
  img.src = a.photoURL || getAvatarUrl(a.displayName || 'A', theme, 96);
  img.referrerPolicy = 'no-referrer';
  img.alt = '';
  img.style.cssText = `position:relative;width:100%;height:100%;border-radius:9999px;object-fit:cover;border:3px solid ${meta.color};background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.28);`;
  img.onerror = () => { img.src = getAvatarUrl(a.displayName || 'A', theme, 96); };
  const dot = document.createElement('span');
  dot.style.cssText = `position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:9999px;background:${meta.color};border:2px solid #fff;`;
  root.append(pulse, img, dot);
  return L.divIcon({ html: root, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const viewerIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div class="nearby-me"><span></span></div>',
});

function FitArea({ center, radiusKm, points }: { center: [number, number]; radiusKm: number; points: [number, number][] }) {
  const map = useMap();
  // Refit only when people appear/leave, not on every position update (that would fight the user's panning).
  const pointsKey = points.length;
  useEffect(() => {
    if (Number.isFinite(radiusKm)) {
      map.fitBounds(L.latLng(center).toBounds(radiusKm * 2000), { padding: [12, 12], animate: false });
      return;
    }
    // No radius: frame the viewer and everyone shown, but never zoom in past street level.
    const bounds = L.latLngBounds([center, ...points]);
    map.fitBounds(bounds.pad(0.15), { padding: [40, 40], animate: false, maxZoom: 15 });
  }, [map, center[0], center[1], radiusKm, pointsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Frames the selected athlete: their whole traced path when they have one, otherwise their position. */
function FocusAthlete({ athlete }: { athlete: NearbyAthlete | null }) {
  const map = useMap();
  const uid = athlete?.uid;
  useEffect(() => {
    if (!athlete) return;
    if (athlete.path && athlete.path.length > 1) {
      map.flyToBounds(L.latLngBounds([...athlete.path, [athlete.lat, athlete.lng]]), { padding: [48, 48], maxZoom: 16, duration: 0.6 });
    } else {
      map.flyTo([athlete.lat, athlete.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [map, uid]); // eslint-disable-line react-hooks/exhaustive-deps
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
        <FitArea center={center} radiusKm={radiusKm} points={athletes.map(a => [a.lat, a.lng] as [number, number])} />
        <FocusAthlete athlete={selected} />
        {Number.isFinite(radiusKm) && (
          <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: '#5d2a1a', weight: 1.5, dashArray: '6 6', fillOpacity: 0.04 }} />
        )}
        {athletes.filter(a => a.path && a.path.length > 1).map(a => {
          const on = a.uid === selectedUid;
          return (
            <Fragment key={`trail-${a.uid}`}>
              <Polyline positions={a.path!} interactive={false} pathOptions={{ color: '#ffffff', weight: on ? 9 : 6, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }} />
              <Polyline
                positions={a.path!}
                pathOptions={{ color: ACTIVITY_META[a.activity].color, weight: on ? 5 : 3.5, opacity: on || !selectedUid ? 0.95 : 0.45, lineCap: 'round', lineJoin: 'round' }}
                eventHandlers={{ click: () => onSelect(a.uid) }}
              />
            </Fragment>
          );
        })}
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
