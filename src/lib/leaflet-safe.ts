import L from 'leaflet';

// Leaflet bug: a zoom/pan animation timer that fires after map.remove() (route change mid-zoom)
// reads the deleted map pane → "Cannot read properties of undefined (reading '_leaflet_pos')".
const proto = L.Map.prototype as unknown as {
  _apSafe?: boolean;
  _onZoomTransitionEnd: (this: { _mapPane?: HTMLElement; _animatingZoom?: boolean }) => void;
  _getMapPanePos: (this: { _mapPane?: HTMLElement }) => L.Point;
};

if (!proto._apSafe) {
  proto._apSafe = true;
  const onZoomEnd = proto._onZoomTransitionEnd;
  proto._onZoomTransitionEnd = function () {
    if (!this._mapPane) {
      this._animatingZoom = false;
      return;
    }
    onZoomEnd.call(this);
  };
  const panePos = proto._getMapPanePos;
  proto._getMapPanePos = function () {
    return this._mapPane ? panePos.call(this) : L.point(0, 0);
  };
}
