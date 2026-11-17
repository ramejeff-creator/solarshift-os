import { fetchBuildingFootprints, measureFootprint, chooseContainingFootprint } from './osm-footprint-client.mjs';

export function ringContainsPoint(ring, latitude, longitude) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = Number(ring[i]?.lat), xi = Number(ring[i]?.lon ?? ring[i]?.lng);
    const yj = Number(ring[j]?.lat), xj = Number(ring[j]?.lon ?? ring[j]?.lng);
    if (![yi, xi, yj, xj].every(Number.isFinite)) continue;
    if ((yi > latitude) !== (yj > latitude) && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The map owns selection. No preliminary button or nearest-building guess is needed.
export function installRoofMapInteractions({ map, shapes, leaflet, onChange, onStatus, onEditing,
  fetchFootprints = fetchBuildingFootprints }) {
  let drawing = false, correction = null, request = null, requestTimer = null, footprintDetectionEnabled = true;
  const bound = new WeakSet();
  const status = (message, kind = 'info') => onStatus?.(message, kind);
  function clearRequestTimer() {
    if (requestTimer !== null) globalThis.clearInterval(requestTimer);
    requestTimer = null;
  }
  function cancelRequest() {
    clearRequestTimer();
    request?.abort();
    request = null;
  }
  function finishCorrection(save = true) {
    if (!correction) return;
    const previous = correction;
    correction = null;
    previous.layer.editing.disable();
    if (!save) {
      previous.layer.setLatLngs(previous.coordinates);
      // Leaflet.draw caches coordinate arrays; refresh them after restoring a contour.
      previous.layer.fire('revert-edited', { layer: previous.layer });
    }
    previous.layer.edited = false;
    onEditing?.(false);
    onChange();
    status(save ? 'Contour enregistré. Cliquez sur une autre toiture pour ajouter une surface.' : 'Correction annulée. Le contour précédent est conservé.');
  }
  function edit(layer) {
    if (drawing || !layer.editing || correction?.layer === layer) return;
    finishCorrection(true);
    cancelRequest();
    correction = { layer, coordinates: JSON.parse(JSON.stringify(layer.getLatLngs())) };
    layer.editing.enable();
    onEditing?.(true);
    status('Déplacez les points du contour, puis enregistrez ou annulez la correction.');
  }
  function bind(layer) {
    if (bound.has(layer)) return;
    bound.add(layer);
    layer.options.bubblingMouseEvents = false;
    layer.on('click', (event) => {
      if (event.originalEvent) leaflet.DomEvent.stopPropagation(event.originalEvent);
      if (!drawing) edit(layer);
    });
    layer.on('edit', onChange);
    layer.on('revert-edited', onChange);
  }
  function contains(layer, lat, lng) {
    const coordinates = layer.getLatLngs();
    const rings = Array.isArray(coordinates[0]) ? coordinates : [coordinates];
    return ringContainsPoint(rings[0], lat, lng) && !rings.slice(1).some((ring) => ringContainsPoint(ring, lat, lng));
  }
  async function detectAt(event) {
    if (!footprintDetectionEnabled || drawing || !event.latlng) return;
    const { lat, lng } = event.latlng;
    const existing = shapes.getLayers().find((layer) => contains(layer, lat, lng));
    if (existing) { edit(existing); return; }
    finishCorrection(true);
    cancelRequest();
    const controller = new AbortController();
    request = controller;
    const startedAt = Date.now();
    const updateLoadingStatus = () => {
      if (request !== controller || controller.signal.aborted) return;
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      status(`Recherche du contour de cette toiture… (${elapsedSeconds} s)`, 'loading');
    };
    updateLoadingStatus();
    requestTimer = globalThis.setInterval(updateLoadingStatus, 1000);
    try {
      const ways = await fetchFootprints(lat, lng, { radiusMeters: 250, signal: controller.signal });
      if (controller.signal.aborted || request !== controller) return;
      const candidates = ways.flatMap((way) => {
        if (way.type !== 'way') return [];
        const measured = measureFootprint(way.geometry);
        return measured && measured.areaM2 >= 8 && measured.areaM2 <= 100000
          ? [{ way, ...measured, containsClick: ringContainsPoint(way.geometry, lat, lng) }] : [];
      });
      const match = chooseContainingFootprint(candidates);
      if (!match) {
        status('Aucun contour cartographique disponible pour cette toiture. Utilisez l’outil polygone ou rectangle pour la dessiner.', 'warning');
        return;
      }
      const duplicate = shapes.getLayers().find((layer) => layer.options.osmId === match.way.id);
      if (duplicate) { edit(duplicate); return; }
      const layer = leaflet.polygon(match.way.geometry.map((point) => [point.lat, point.lon ?? point.lng]), {
        color: '#087957', weight: 3, fillColor: '#5ca786', fillOpacity: .28, osmId: match.way.id
      });
      shapes.addLayer(layer);
      bind(layer);
      onChange();
      // Keep the surrounding buildings visible rather than zooming into the roof.
      map.fitBounds(layer.getBounds(), { padding: [45, 45], maxZoom: 18 });
      status('Contour proposé. Vérifiez-le sur la photo et cliquez dessus pour le corriger.', 'ready');
    } catch (error) {
      if (!controller.signal.aborted && request === controller) status('Le repérage cartographique est indisponible pour le moment. Vous pouvez dessiner la toiture avec l’outil polygone ou rectangle.', 'warning');
    } finally {
      if (request === controller) {
        clearRequestTimer();
        request = null;
      }
    }
  }
  shapes.eachLayer(bind);
  map.on('click', detectAt);
  map.on('draw:created', (event) => { cancelRequest(); shapes.addLayer(event.layer); bind(event.layer); onChange(); });
  map.on('draw:edited draw:deleted', onChange);
  map.on('draw:drawstart draw:editstart draw:deletestart', () => {
    finishCorrection(true); cancelRequest(); drawing = true;
    status('Terminez le tracé ou la modification avec les commandes de la carte.');
  });
  map.on('draw:drawstop draw:editstop draw:deletestop', () => { drawing = false; });
  return {
    finishCorrection,
    setFootprintDetectionEnabled(enabled) {
      footprintDetectionEnabled = Boolean(enabled);
      if (!footprintDetectionEnabled) cancelRequest();
    },
    cancel() { cancelRequest(); finishCorrection(false); },
    detectAt
  };
}
