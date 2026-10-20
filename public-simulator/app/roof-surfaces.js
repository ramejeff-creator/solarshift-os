(function () {
  'use strict';

  const configurations = new Map();
  // Archived CR-013 drawing implementation: retained below for a future return
  // if roof imagery becomes precise enough, but intentionally not installed or used.
  const CR013_VERSION = 'CR-013-V1.0';
  function calculateCr013SolarUsableArea({ grossAreaM2, fallbackPercent = 65, segmentation = null, geometryVersion = null, calculatedAt = new Date().toISOString() }) {
    const gross = Number(grossAreaM2), ratio = Number(fallbackPercent);
    if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(ratio) || ratio < 0 || ratio > 100) throw new TypeError('Surface brute ou taux de repli invalide.');
    if (segmentation == null) {
      return Object.freeze({ version: CR013_VERSION, grossAreaM2: gross, usableAreaM2: gross * ratio / 100, excludedAreaM2: null, uncertainAreaM2: null, method: 'FALLBACK_RATIO', source: 'GENERIC_REFERENCE', status: gross > 0 ? 'ASSUMPTION' : 'UNKNOWN', confidence: 'LOW', fallbackPercent: ratio, geometryVersion, calculatedAt, canonical: false });
    }
    if (!['excludedAreaM2', 'bufferAreaM2', 'uncertainAreaM2'].every((key) => Object.hasOwn(segmentation, key))) throw new TypeError('Une segmentation doit expliciter les surfaces exclues, buffers et incertaines, y compris lorsqu’elles valent zéro.');
    const excluded = Number(segmentation.excludedAreaM2), buffers = Number(segmentation.bufferAreaM2), uncertain = Number(segmentation.uncertainAreaM2);
    if ([excluded, buffers, uncertain].some((value) => !Number.isFinite(value) || value < 0) || excluded + buffers + uncertain > gross) throw new TypeError('Les exclusions, buffers et zones incertaines doivent être valides et tenir dans la surface brute.');
    const method = segmentation.method || 'USER_AREA_INPUT';
    if (!['USER_AREA_INPUT', 'USER_DRAWN', 'FALLBACK_RATIO', 'SATELLITE_ASSISTED', 'USER_VALIDATED', 'EXPERT_VALIDATED'].includes(method)) throw new TypeError('Méthode CR-013 inconnue.');
    const status = segmentation.status || 'PARTIAL';
    if (!['VERIFIED', 'ASSUMPTION', 'UNKNOWN', 'STALE', 'PARTIAL'].includes(status)) throw new TypeError('État CR-013 inconnu.');
    if (status === 'VERIFIED' && !['USER', 'EXPERT'].includes(segmentation.validation)) throw new TypeError('Une surface VERIFIED exige une confirmation explicite utilisateur ou expert.');
    return Object.freeze({ version: CR013_VERSION, grossAreaM2: gross, usableAreaM2: Math.max(0, gross - excluded - buffers - uncertain), excludedAreaM2: excluded + buffers, uncertainAreaM2: uncertain, method, source: segmentation.source || 'USER_INPUT', status, confidence: segmentation.confidence || 'USER_REVIEW_REQUIRED', geometryVersion, calculatedAt, canonical: false });
  }
  const orientations = ['Sud', 'Sud-Est', 'Sud-Ouest', 'Est', 'Ouest', 'Nord-Est', 'Nord-Ouest', 'Nord'];
  const slopeBands = ['0 à 6° (≈ 0–10 %)', '7 à 14° (≈ 12–25 %)', '15 à 30° (≈ 27–58 %)', 'Supérieure à 30° (> 58 %)'];
  const pitches = [...slopeBands, 'Façade verticale (90°)'];
  const flatTilts = slopeBands;
  const shades = ['Aucune ou très faible', 'Quelques ombres', 'Ombres importantes'];
  const roofMaterials = ['Acier', 'Ardoise', 'Bitume isolé', 'Bitume non isolé', 'EPDM', 'Fibrociment', 'Joint debout', 'PVC', 'TPO', 'Tuiles', 'Autre'];
  const roofOrientationHelp = 'Orientation : l’axe est analysé automatiquement depuis le contour. Pour deux pans, les deux directions opposées sont préremplies ; vérifiez-les. Pour un seul pan, choisissez le sens proposé qui correspond à la pente. Pour corriger une orientation, cliquez sur « Modifier sur la carte » ; tracez du faîtage vers la rive ou l’égout, pas le long du faîtage. Pour une autre surface, cliquez deux fois dans le sens prévu des panneaux.';
  const aspects = { Sud: 0, 'Sud-Ouest': 45, Ouest: 90, 'Nord-Ouest': 135, Nord: 180, 'Nord-Est': -135, Est: -90, 'Sud-Est': -45 };
  const compassAzimuths = { Nord: 0, 'Nord-Est': 45, Est: 90, 'Sud-Est': 135, Sud: 180, 'Sud-Ouest': 225, Ouest: 270, 'Nord-Ouest': 315 };
  const compassLabels = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
  const angles = { [slopeBands[0]]: 3, [slopeBands[1]]: 10.5, [slopeBands[2]]: 22.5, [slopeBands[3]]: 45, 'Façade verticale (90°)': 90 };
  const flatAngles = { ...angles };
  const shadeFactors = { 'Aucune ou très faible': 1, 'Quelques ombres': .92, 'Ombres importantes': .75 };
  const extraSurfaceTypes = [['PARKING_CANOPY', 'Ombrière'], ['GROUND_MOUNTED', 'Installation au sol'], ['BUILDING_FACADE', 'Façade'], ['FLOATING', 'Installation flottante'], ['AGRIVOLTAIC', 'Agrivoltaïsme'], ['OTHER', 'Autre surface']];
  const cr010SizingRules = Object.freeze({
    version: 'CR-010-V2.1',
    roof: Object.freeze({
      PITCHED: Object.freeze({ low: 195, reference: 210, high: 220 }),
      FLAT_EAST_WEST: Object.freeze({ low: 175, reference: 190, high: 205 }),
      FLAT_SOUTH: Object.freeze({ low: 140, reference: 155, high: 175 }),
      FLAT_UNSPECIFIED: Object.freeze({ low: 140, reference: 175, high: 205 })
    })
  });
  const studyModuleReference = Object.freeze({
    manufacturer: 'DMEGC Solar',
    model: 'DM500M10RT-B60HBT',
    technology: 'Bifacial · double-verre · cellules type N',
    lengthM: 1.95,
    widthM: 1.134,
    dimensions: '1 950 × 1 134 × 30 mm',
    weight: '27,1 kg',
    efficiency: '22,6 % max. (fiche technique)',
    powerWc: 500
  });
  const estimatedPanelCount = (capacityKwp, panelWc) => {
    const capacity = Number(capacityKwp), power = Number(panelWc);
    return Number.isFinite(capacity) && capacity > 0 && Number.isFinite(power) && power > 0
      ? Math.ceil(capacity * 1000 / power)
      : null;
  };
  const representativeModulePower = (reference, fallback = 450) => {
    const exact = Number(reference?.powerWc);
    if (Number.isFinite(exact) && exact > 0) return exact;
    const ratings = Array.isArray(reference?.availableRatingsWc)
      ? reference.availableRatingsWc.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
      : [];
    const minimum = Number(reference?.minPowerWc), maximum = Number(reference?.maxPowerWc);
    const middle = ratings.length
      ? (ratings[Math.floor((ratings.length - 1) / 2)] + ratings[Math.ceil((ratings.length - 1) / 2)]) / 2
      : Number.isFinite(minimum) && minimum > 0 && Number.isFinite(maximum) && maximum >= minimum ? (minimum + maximum) / 2 : null;
    return middle == null ? fallback : Math.round(middle / 5) * 5;
  };
  const modulePowerDensityWcM2 = (panelWc, lengthM, widthM) => {
    const power = Number(panelWc), length = Number(lengthM), width = Number(widthM);
    return Number.isFinite(power) && power > 0 && Number.isFinite(length) && length > 0 && Number.isFinite(width) && width > 0
      ? power / (length * width)
      : null;
  };
  const limitDensityToModule = (density, moduleDensityWcM2) => {
    if (!density || !Number.isFinite(moduleDensityWcM2) || moduleDensityWcM2 <= 0) return density;
    const limited = { ...density };
    let capped = false;
    for (const key of ['low', 'reference', 'high']) {
      if (limited[key] != null && limited[key] > moduleDensityWcM2) {
        limited[key] = moduleDensityWcM2;
        capped = true;
      }
    }
    return Object.freeze(capped ? { ...limited, cappedByModule: true, moduleDensityWcM2 } : limited);
  };
  const surfaceTypeLabels = Object.fromEntries(extraSurfaceTypes);
  const coordinates = { Muret: [43.49001, 1.34247], Lyon: [45.764, 4.835], Lille: [50.63, 3.057] };
  const pvgisOptimalTiltCache = new Map();
  let calculationVersion = 0;
  let climateCalculationController = null;
  let detectionPending = false;
  let detectionVersion = 0;
  let drawingActive = false;
  let contourEdit = null;
  const interactiveLayers = new WeakSet();
  let surfaceSource = 'none';
  let lastCr013AreaResult = null;
  let cr013ZoneGroup = null;
  let cr013Zones = [];
  let zoneDrawSession = null;
  let zoneEditSession = null;
  let cr013Confirmed = false;
  let cr013BufferAreaM2 = null;
  let manualSurfaceConfiguration = { type: '', material: '', flatTilt: '', manualDensityWcM2: '' };
  let updatingMeasuredSurface = false;
  let activeProjectContext = '';
  let orientationPicker = null;
  let orientationLayerGroup = null;
  let roofStateLabel = null;
  const legacyPerformanceGuards = new WeakSet();
  const orientationMarks = new Map();

  function normalizeAzimuth(value) {
    if (value == null || value === '') return null;
    if (Object.hasOwn(compassAzimuths, value)) return compassAzimuths[value];
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 360 ? wrapAzimuth(numeric) : null;
  }

  function wrapAzimuth(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? ((Math.round(numeric) % 360) + 360) % 360 : null;
  }

  function normalizeFlatTilt(value) {
    if (flatTilts.includes(value)) return value;
    const exactAngle = Number(String(value ?? '').replace(',', '.').replace('°', ''));
    if (Number.isFinite(exactAngle)) return exactAngle <= 6 ? slopeBands[0] : exactAngle <= 14 ? slopeBands[1] : exactAngle <= 30 ? slopeBands[2] : slopeBands[3];
    return ({ 'Faible pente (5 à 15°)': slopeBands[1], 'Pente moyenne (16 à 30°)': slopeBands[2], 'Forte pente (31 à 60°)': slopeBands[3] })[value] || '';
  }

  function flatTiltAngle(value) {
    if (typeof value === 'string' && /^\d+(?:[.,]\d+)?°$/.test(value)) return Number(value.replace(',', '.').replace('°', ''));
    return flatAngles[normalizeFlatTilt(value)] ?? Number(String(value ?? '').replace(',', '.').replace('°', ''));
  }

  function normalizePitch(value) {
    if (pitches.includes(value)) return value;
    return ({ 'Faible pente (5 à 15°)': slopeBands[1], 'Pente moyenne (16 à 30°)': slopeBands[2], 'Forte pente (31 à 60°)': slopeBands[3], 'Faible pente': slopeBands[2], 'Pente moyenne': slopeBands[2], 'Forte pente': slopeBands[3], 'Façade verticale': 'Façade verticale (90°)' })[value] || '';
  }

  function pitchAngle(value) {
    return angles[normalizePitch(value)] ?? ({ 'Faible pente (5 à 15°)': 10, 'Pente moyenne (16 à 30°)': 23, 'Forte pente (31 à 60°)': 45, 'Faible pente': 15, 'Pente moyenne': 30, 'Forte pente': 45, 'Façade verticale': 90 })[value];
  }

  function configureManualSlopeSelector() {
    const select = document.getElementById('tilt');
    if (!select || select.dataset.slopeBandsConfigured) return;
    const previous = select.value;
    select.innerHTML = `<option value="">Je ne sais pas encore</option><option value="Toit plat">Toit plat</option>${pitches.map((pitch) => `<option value="${pitch}">${pitch}</option>`).join('')}`;
    select.value = previous === 'Toit plat' ? previous : normalizePitch(previous);
    select.dataset.slopeBandsConfigured = 'true';
  }

  function pvgisAspectFromAzimuth(value) {
    const azimuth = normalizeAzimuth(value);
    if (azimuth == null) return null;
    const aspect = azimuth - 180;
    return aspect < -180 ? aspect + 360 : aspect;
  }

  function compassLabel(value) {
    const azimuth = normalizeAzimuth(value);
    return azimuth == null ? '' : compassLabels[Math.round(azimuth / 45) % compassLabels.length];
  }

  function formatAzimuth(value) {
    const azimuth = normalizeAzimuth(value);
    return azimuth == null ? '—' : `${azimuth}° (${compassLabel(azimuth)})`;
  }

  function cr010DensityForSurface(type, orientations = [], manualDensityWcM2 = '', flatTilt = '', module = {}) {
    const indicativeDensity = Number(manualDensityWcM2);
    if (Number.isFinite(indicativeDensity) && indicativeDensity >= 1 && indicativeDensity <= 1000) {
      return Object.freeze({ low: null, reference: indicativeDensity, high: null, source: 'MANUAL_INDICATIVE' });
    }
    if (type === 'PITCHED') return cr010SizingRules.roof.PITCHED;
    if (type !== 'FLAT') {
      return null;
    }
    const azimuths = orientations.map(normalizeAzimuth).filter((value) => value != null);
    if (!azimuths.length) return cr010SizingRules.roof.FLAT_UNSPECIFIED;
    const isEastWest = (value) => (value >= 45 && value <= 135) || (value >= 225 && value <= 315);
    const isSouth = (value) => value >= 135 && value <= 225;
    if (azimuths.every(isEastWest)) return cr010SizingRules.roof.FLAT_EAST_WEST;
    if (azimuths.every(isSouth)) {
      const tilt = flatTiltAngle(flatTilt);
      if (Number.isFinite(tilt) && tilt > 15) {
        // Early-stage geometric corridor for south-facing rows. The LOW/REF/HIGH
        // values correspond to 20°/25°/30° minimum sun-altitude assumptions.
        const beta = tilt * Math.PI / 180;
        const length = Number(module.lengthM) > 0 ? Number(module.lengthM) : studyModuleReference.lengthM;
        const width = Number(module.widthM) > 0 ? Number(module.widthM) : studyModuleReference.widthM;
        const power = Number(module.powerWc) > 0 ? Number(module.powerWc) : 450;
        const densityAt = (solarAltitudeDeg) => {
          const alpha = solarAltitudeDeg * Math.PI / 180;
          const pitch = length * Math.cos(beta) + (length * Math.sin(beta)) / Math.tan(alpha);
          return power / (width * pitch);
        };
        return Object.freeze({
          low: densityAt(20), reference: densityAt(25), high: densityAt(30),
          source: 'PROVISIONAL_TILT_EXTRAPOLATION', tiltDeg: tilt,
          assumptions: 'Géométrie de rangées indicative · hauteur solaire minimale 20° / 25° / 30°'
        });
      }
      return cr010SizingRules.roof.FLAT_SOUTH;
    }
    return cr010SizingRules.roof.FLAT_UNSPECIFIED;
  }

  function requiresFlatSouthProjectDensity(type, orientations = [], manualDensityWcM2 = '', flatTilt = '') {
    const density = Number(manualDensityWcM2);
    if (Number.isFinite(density) && density >= 1 && density <= 1000) return false;
    if (type !== 'FLAT') return false;
    const azimuths = orientations.map(normalizeAzimuth).filter((value) => value != null);
    // The calculator now has a non-blocking geometric pre-estimate for this case.
    return false;
  }

  function calculateCr010RoofSizing(areas) {
    const eligible = areas.filter((item) => Number.isFinite(item.areaM2) && item.areaM2 > 0 && item.density);
    if (!eligible.length || eligible.length !== areas.length) return { status: 'UNKNOWN', version: cr010SizingRules.version, lowKwp: null, referenceKwp: null, highKwp: null };
    const sum = (key) => eligible.reduce((total, item) => total + item.areaM2 * (item.density[key] ?? 0), 0) / 1000;
    const referenceKwp = eligible.reduce((total, item) => total + item.areaM2 * item.density.reference, 0) / 1000;
    const layoutWarning = eligible.some((item) => item.density.source === 'PROVISIONAL_TILT_EXTRAPOLATION');
    if (eligible.some((item) => item.density.source === 'MANUAL_INDICATIVE')) {
      return { status: 'ESTIMATED_MANUAL', version: cr010SizingRules.version, lowKwp: null, referenceKwp, highKwp: null, layoutWarning };
    }
    if (layoutWarning) return { status: 'ESTIMATED_PRELIMINARY_LAYOUT', version: cr010SizingRules.version, lowKwp: sum('low'), referenceKwp, highKwp: sum('high'), layoutWarning: true };
    return { status: 'ESTIMATED', version: cr010SizingRules.version, lowKwp: sum('low'), referenceKwp, highKwp: sum('high') };
  }

  function azimuthField(label, key, value, id) {
    const numeric = normalizeAzimuth(value);
    const mapAction = numeric == null ? 'Tracer sur la carte' : 'Modifier sur la carte';
    const tooltipId = `roofAzimuthHelp-${id}-${key}`;
    const help = label.includes('pan') ? roofOrientationHelp : 'Azimut des panneaux : 0° = nord, 90° = est, 180° = sud, 270° = ouest. Pour le mesurer sur la carte, cliquez deux fois dans le sens prévu des panneaux.';
    return `<label class="roofAzimuthField"><span class="roofAzimuthLabelRow"><span class="roofAzimuthLabelText">${label}</span><span class="roofAzimuthHelp"><button type="button" class="roofAzimuthHelpButton" aria-label="Afficher l’aide sur l’orientation" aria-expanded="false" aria-describedby="${tooltipId}">i</button><span class="roofAzimuthHelpBubble" id="${tooltipId}" role="tooltip">${help}</span></span></span><div class="roofAzimuthControl"><input type="number" min="0" max="359" step="1" placeholder="0–359°" data-roof-field="${key}" value="${numeric ?? ''}" aria-label="${label} en degrés depuis le nord"><button type="button" class="roofPickAzimuth" data-roof-pick="${key}" data-roof-id="${id}">${mapAction}</button></div></label>`;
  }

  function area(layer) {
    const latlngs = layer.getLatLngs();
    const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
    return Math.round(L.GeometryUtil.geodesicArea(ring));
  }

  function dominantAxisBearing(layer) {
    const latlngs = layer?.getLatLngs?.() || [];
    const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
    if (ring.length < 3) return null;
    const meanLat = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length;
    const meanLng = ring.reduce((sum, point) => sum + point.lng, 0) / ring.length;
    const cosLat = Math.cos(meanLat * Math.PI / 180);
    const points = ring.map((point) => ({ x: (point.lng - meanLng) * cosLat, y: point.lat - meanLat }));
    const xx = points.reduce((sum, point) => sum + point.x * point.x, 0);
    const yy = points.reduce((sum, point) => sum + point.y * point.y, 0);
    const xy = points.reduce((sum, point) => sum + point.x * point.y, 0);
    if (Math.abs(xx - yy) + Math.abs(xy) < 1e-12) return null;
    const axisFromEast = .5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
    return ((90 - axisFromEast) % 180 + 180) % 180;
  }

  function roofAzimuthCandidates(layer) {
    const axis = dominantAxisBearing(layer);
    return axis == null ? [] : [wrapAzimuth(axis + 90), wrapAzimuth(axis + 270)];
  }

  function bearingBetweenPoints(start, end) {
    const radians = Math.PI / 180;
    const lat1 = start.lat * radians, lat2 = end.lat * radians;
    const deltaLng = (end.lng - start.lng) * radians;
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return (Math.round(Math.atan2(y, x) / radians) + 360) % 360;
  }

  function orientationMarkKey(target) {
    return target.kind === 'manual' ? 'manual' : `${target.id}:${target.field}`;
  }

  function clearOrientationMark(key) {
    const mark = orientationMarks.get(key);
    if (mark) orientationLayerGroup?.removeLayer(mark);
    orientationMarks.delete(key);
  }

  function orientationMapButtonLabel(target) {
    const value = target?.kind === 'manual'
      ? document.getElementById('manualAzimuth')?.value
      : configurations.get(target?.id)?.[target?.field];
    return normalizeAzimuth(value) == null ? 'Tracer sur la carte' : 'Modifier sur la carte';
  }

  function drawOrientationArrow(key, start, end, azimuth) {
    clearOrientationMark(key);
    if (!orientationLayerGroup) return;
    const line = L.polyline([start, end], { color: '#e89a18', weight: 4, opacity: .95, interactive: false });
    const arrow = L.marker(end, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'roofAzimuthArrowIcon',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        html: `<svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${azimuth}deg)"><path d="M12 21V4M5 11l7-7 7 7"/></svg>`
      })
    });
    const mark = L.layerGroup([line, arrow]).addTo(orientationLayerGroup);
    orientationMarks.set(key, mark);
  }

  function finishOrientationPick(message) {
    if (orientationPicker?.button?.isConnected) orientationPicker.button.textContent = orientationMapButtonLabel(orientationPicker.target);
    if (orientationPicker?.mapClickHandler) window.solarMap?.getContainer()?.removeEventListener('click', orientationPicker.mapClickHandler, true);
    if (orientationPicker?.previewMark) orientationLayerGroup?.removeLayer(orientationPicker.previewMark);
    window.solarMap?.getContainer()?.classList.remove('roofOrientationPicking');
    orientationPicker = null;
    if (message) detectionStatus(message, 'success');
  }

  function startOrientationPick(target, button) {
    finishContourEdit(true);
    invalidateDetection();
    if (orientationPicker) finishOrientationPick();
    const map = window.solarMap;
    const container = map?.getContainer();
    const mapClickHandler = (event) => {
      if (!orientationPicker || drawingActive || event.target.closest?.('.leaflet-control')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      chooseOrientationAtMap({ latlng: map.mouseEventToLatLng(event) });
    };
    orientationPicker = { target, button, start: null, previewMark: null, mapClickHandler };
    container?.classList.add('roofOrientationPicking');
    container?.addEventListener('click', mapClickHandler, true);
    button.textContent = 'Annuler le tracé';
    if (target.kind === 'roof') {
      const layer = layers().find((item) => L.stamp(item) === target.id);
      if (layer) window.solarMap.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 20 });
    }
    document.getElementById('map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    detectionStatus(target.fromRidge
      ? 'Sur la carte : cliquez près du faîtage, puis vers la rive ou l’égout, dans le sens où les panneaux feront face.'
      : 'Sur la carte : cliquez un point de départ, puis dans la direction où les panneaux feront face.', 'loading');
  }

  function chooseOrientationAtMap(event) {
    if (!orientationPicker || drawingActive) return false;
    if (!orientationPicker.start) {
      orientationPicker.start = event.latlng;
      orientationPicker.previewMark = L.circleMarker(event.latlng, { radius: 6, color: '#08734c', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(orientationLayerGroup);
      detectionStatus(orientationPicker.target.fromRidge
        ? 'Point noté. Cliquez maintenant du faîtage vers la rive ou l’égout : la flèche doit être perpendiculaire au faîtage.'
        : 'Point noté. Cliquez une seconde fois dans la direction souhaitée pour les panneaux.', 'loading');
      return true;
    }
    const start = orientationPicker.start;
    const end = event.latlng;
    const azimuth = bearingBetweenPoints(start, end);
    const target = orientationPicker.target;
    const markKey = orientationMarkKey(target);
    drawOrientationArrow(markKey, start, end, azimuth);
    if (target.kind === 'manual') {
      const field = document.getElementById('manualAzimuth');
      if (field) field.value = String(azimuth);
      const legacyOrientation = document.getElementById('orientation');
      if (legacyOrientation) legacyOrientation.value = compassLabel(azimuth);
      finishOrientationPick(`Orientation mesurée sur la carte : ${formatAzimuth(azimuth)}.`);
      calculateSynthesis();
      return true;
    }
    const config = configurations.get(target.id);
    if (config) {
      config[target.field] = azimuth;
      config[`${target.field}Source`] = 'map-trace';
    }
    finishOrientationPick(`Orientation mesurée sur la carte : ${formatAzimuth(azimuth)}.`);
    render();
    return true;
  }

  function layers() {
    const result = [];
    window.roofGroup?.eachLayer((layer) => result.push(layer));
    return result;
  }

  function zoneLayers(kind) { return cr013Zones.filter((zone) => !kind || zone.kind === kind); }
  function zoneRing(layer) { const rings = layer.getLatLngs(); return Array.isArray(rings[0]) ? rings[0] : rings; }
  function zoneArea(layer) { return Math.round(L.GeometryUtil.geodesicArea(zoneRing(layer))); }
  function pointOnSegment(point, a, b) {
    const cross = (point.lng - a.lng) * (b.lat - a.lat) - (point.lat - a.lat) * (b.lng - a.lng);
    return Math.abs(cross) < 1e-10 && point.lng >= Math.min(a.lng, b.lng) - 1e-10 && point.lng <= Math.max(a.lng, b.lng) + 1e-10 && point.lat >= Math.min(a.lat, b.lat) - 1e-10 && point.lat <= Math.max(a.lat, b.lat) + 1e-10;
  }
  function segmentsIntersect(a, b, c, d) {
    const orient = (p, q, r) => (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 * o2 < 0 && o3 * o4 < 0) return true;
    return Math.abs(o1) < 1e-10 && pointOnSegment(c, a, b) || Math.abs(o2) < 1e-10 && pointOnSegment(d, a, b) || Math.abs(o3) < 1e-10 && pointOnSegment(a, c, d) || Math.abs(o4) < 1e-10 && pointOnSegment(b, c, d);
  }
  function ringsOverlap(left, right) {
    for (let i = 0; i < left.length; i++) for (let j = 0; j < right.length; j++) {
      if (segmentsIntersect(left[i], left[(i + 1) % left.length], right[j], right[(j + 1) % right.length])) return true;
    }
    return containsPoint(left.map((p) => ({ lat: p.lat, lon: p.lng })), right[0].lat, right[0].lng)
      || containsPoint(right.map((p) => ({ lat: p.lat, lon: p.lng })), left[0].lat, left[0].lng);
  }
  function validateZoneGeometry(layer, ignoreZone = null) {
    const ring = zoneRing(layer);
    if (ring.length < 3) return 'Tracez au moins trois points.';
    const roof = layers().filter((candidate) => !configurations.get(L.stamp(candidate))?.type || ['PITCHED', 'FLAT'].includes(configurations.get(L.stamp(candidate))?.type)).find((candidate) => ring.every((point, index) => {
      const next = ring[(index + 1) % ring.length];
      return Array.from({ length: 11 }, (_, step) => ({ lat: point.lat + (next.lat - point.lat) * step / 10, lng: point.lng + (next.lng - point.lng) * step / 10 }))
        .every((sample) => layerContainsPoint(candidate, sample.lat, sample.lng));
    }));
    if (!roof) return 'La zone doit rester entièrement à l’intérieur d’un seul contour de toiture.';
    if (cr013Zones.some((zone) => zone !== ignoreZone && ringsOverlap(ring, zoneRing(zone.layer)))) return 'Cette zone chevauche une autre exclusion ou zone incertaine ; dessinez des zones distinctes pour éviter un double comptage.';
    return '';
  }
  function updateCr013ZoneReadout() {
    const excluded = zoneLayers('EXCLUDED').reduce((sum, zone) => sum + zoneArea(zone.layer), 0);
    const uncertain = zoneLayers('UNCERTAIN').reduce((sum, zone) => sum + zoneArea(zone.layer), 0);
    const summary = document.getElementById('cr013ZoneSummary');
    const fallback = Number(document.getElementById('roofRatio')?.value ?? 65);
    if (summary) summary.textContent = cr013Zones.length
      ? `${excluded.toLocaleString('fr-FR')} m² exclus · ${uncertain.toLocaleString('fr-FR')} m² à vérifier · ${Number.isFinite(cr013BufferAreaM2) ? cr013BufferAreaM2.toLocaleString('fr-FR') : 'à renseigner'} m² de marges supplémentaires. ${cr013Confirmed ? 'Zones confirmées : leurs surfaces sont déduites une seule fois, sans appliquer le taux forfaitaire.' : `Zones non confirmées : le taux indicatif de ${fallback} % reste utilisé.`}`
      : `Aucune exclusion renseignée : le taux indicatif de ${fallback} % est utilisé et reste modifiable dans « Surface solaire · informations générales ».`;
    const list = document.getElementById('cr013ZoneList');
    if (list) {
      list.replaceChildren();
      cr013Zones.forEach((zone, index) => {
        const item = document.createElement('li');
        const categoryLabels = { SKYLIGHT: 'Lanterneau', CHIMNEY: 'Cheminée / gaine', HVAC: 'Équipement CVC', TECHNICAL_ZONE: 'Zone technique', PARAPET: 'Acrotère / recul', ACCESS_ROUTE: 'Cheminement', SHADOW: 'Zone d’ombre', OTHER: 'Autre exclusion', UNCERTAIN: 'Zone incertaine' };
        item.textContent = `${categoryLabels[zone.category] || 'Exclusion'} · ${zoneArea(zone.layer).toLocaleString('fr-FR')} m² `;
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Modifier'; edit.setAttribute('aria-label', `Modifier la zone ${index + 1}`);
        edit.addEventListener('click', () => beginZoneEdit(zone)); item.append(edit);
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Supprimer'; remove.setAttribute('aria-label', `Supprimer la zone ${index + 1}`);
        remove.addEventListener('click', () => { cr013ZoneGroup.removeLayer(zone.layer); cr013Zones = cr013Zones.filter((entry) => entry !== zone); cr013Confirmed = false; cr013BufferAreaM2 = null; const bufferInput = document.getElementById('cr013BufferArea'); if (bufferInput) bufferInput.value = ''; updateCr013ZoneReadout(); calculateSynthesis(); });
        item.append(remove); list.append(item);
      });
    }
    const confirm = document.getElementById('cr013ConfirmZones');
    if (confirm) { confirm.disabled = !cr013Zones.length || cr013Confirmed || !Number.isFinite(cr013BufferAreaM2); confirm.textContent = cr013Confirmed ? 'Surface confirmée' : 'Confirmer les zones dessinées'; }
  }
  function stopZoneDrawing() {
    if (!zoneDrawSession) return;
    zoneDrawSession.vertices?.forEach((marker) => marker.remove());
    zoneDrawSession.preview.remove(); zoneDrawSession = null;
    updateZoneDrawingToolbar();
    window.solarMap.getContainer().classList.remove('cr013ZoneDrawing');
    const finish = document.getElementById('cr013FinishZone'); if (finish) finish.disabled = true;
    const cancel = document.getElementById('cr013CancelZone'); if (cancel) cancel.disabled = true;
    document.getElementById('cr013ZoneDrawingStatus')?.replaceChildren(document.createTextNode('Tracé annulé.'));
  }
  function beginZoneEdit(zone) {
    if (!zone.layer.editing || zoneDrawSession) return;
    if (zoneEditSession) finishZoneEdit(false);
    cr013Confirmed = false; cr013BufferAreaM2 = null; const bufferInput = document.getElementById('cr013BufferArea'); if (bufferInput) bufferInput.value = ''; updateCr013ZoneReadout(); calculateSynthesis();
    zoneEditSession = { zone, latlngs: JSON.parse(JSON.stringify(zone.layer.getLatLngs())) };
    zone.layer.editing.enable();
    const toolbar = document.getElementById('roofContourEdit');
    if (toolbar) { toolbar.querySelector('strong').textContent = 'Modifier la zone'; toolbar.querySelector('[data-save-contour]').textContent = 'Enregistrer la zone'; toolbar.querySelector('[data-cancel-contour]').textContent = 'Annuler la correction'; toolbar.hidden = false; }
  }
  function finishZoneEdit(save) {
    if (!zoneEditSession) return false;
    const previous = zoneEditSession; zoneEditSession = null; previous.zone.layer.editing.disable();
    if (save) {
      const message = validateZoneGeometry(previous.zone.layer, previous.zone);
      if (message) { previous.zone.layer.setLatLngs(previous.latlngs); previous.zone.layer.fire('revert-edited', { layer: previous.zone.layer }); document.getElementById('cr013ZoneDrawingStatus')?.replaceChildren(document.createTextNode(message)); }
    } else { previous.zone.layer.setLatLngs(previous.latlngs); previous.zone.layer.fire('revert-edited', { layer: previous.zone.layer }); }
    const toolbar = document.getElementById('roofContourEdit'); if (toolbar) { toolbar.hidden = true; toolbar.querySelector('strong').textContent = 'Modifier le contour'; toolbar.querySelector('[data-save-contour]').textContent = 'Enregistrer le contour'; }
    cr013Confirmed = false; updateCr013ZoneReadout(); calculateSynthesis(); return true;
  }
  function addZonePoint(event) {
    const session = zoneDrawSession;
    if (!session) return false;
    if (event.originalEvent) L.DomEvent?.stop?.(event.originalEvent);
    session.points.push(event.latlng);
    session.vertices?.push(L.circleMarker(event.latlng, { radius: 5, weight: 2, color: '#08734c', fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(window.solarMap));
    session.preview.setLatLngs(session.points);
    updateZoneDrawingToolbar();
    const finish = document.getElementById('cr013FinishZone');
    if (finish) finish.disabled = session.points.length < 3;
    const cancel = document.getElementById('cr013CancelZone'); if (cancel) cancel.disabled = false;
    const status = document.getElementById('cr013ZoneDrawingStatus');
    if (status) status.textContent = `${session.points.length} point(s) · minimum 3, puis « Terminer le tracé ».`;
    return true;
  }
  function finishZoneDrawing() {
    if (!zoneDrawSession || zoneDrawSession.points.length < 3) return;
    const session = zoneDrawSession, message = validateZoneGeometry(session.preview);
    if (message) { const status = document.getElementById('cr013ZoneDrawingStatus'); if (status) status.textContent = message; return; }
    session.preview.setStyle(session.kind === 'EXCLUDED' ? { color: '#a33d36', fillColor: '#d66a5e', fillOpacity: .35, dashArray: null } : { color: '#bd7f00', fillColor: '#f4c653', fillOpacity: .25, dashArray: '6 4' });
    const zone = { id: `zone-${Date.now()}-${cr013Zones.length}`, kind: session.kind, category: session.category, layer: session.preview };
    window.solarMap.getContainer().classList.remove('cr013ZoneDrawing');
    zone.layer.options.bubblingMouseEvents = false;
    cr013ZoneGroup.addLayer(zone.layer); cr013Zones.push(zone); zoneDrawSession = null; cr013Confirmed = false; cr013BufferAreaM2 = null;
    session.vertices?.forEach((marker) => marker.remove());
    updateZoneDrawingToolbar();
    const finish = document.getElementById('cr013FinishZone'); if (finish) finish.disabled = true;
    const cancel = document.getElementById('cr013CancelZone'); if (cancel) cancel.disabled = true;
    document.getElementById('cr013ZoneDrawingStatus')?.replaceChildren(document.createTextNode('Zone ajoutée au brouillon. Confirmez toutes les zones avant de les utiliser pour le dimensionnement.'));
    cr013BufferAreaM2 = null; const bufferInput = document.getElementById('cr013BufferArea'); if (bufferInput) bufferInput.value = ''; updateCr013ZoneReadout(); calculateSynthesis();
  }
  function installCr013ZoneControls(mapContainer) {
    if (document.getElementById('cr013RoofZones')) return;
    const panel = document.createElement('details'); panel.id = 'cr013RoofZones'; panel.setAttribute('aria-labelledby', 'cr013RoofZonesTitle');
    panel.innerHTML = `<summary id="cr013RoofZonesTitle">Exclusions et zones à vérifier (facultatif)</summary>
      <p>L’ajout des zones d’exclusion est facultatif. En l’absence de précision, la surface exploitable peut être pondérée par un taux à l’étape « Surface solaire · informations générales ».</p>
      <ol><li>Choisissez la nature de l’obstacle puis « Dessiner une exclusion » pour retirer un lanterneau, un équipement ou une zone inaccessible.</li><li>Cliquez au moins trois sommets autour de la zone sur la carte, puis « Terminer le tracé ». Pour un doute, utilisez « Dessiner une zone à vérifier » : sa surface sera également écartée par prudence.</li><li>Renseignez les marges supplémentaires en m² (0 si aucune), vérifiez la liste, puis confirmez les zones pour utiliser leur surface.</li></ol>
      <div><button type="button" data-cr013-start="EXCLUDED">Dessiner une exclusion</button><button type="button" data-cr013-start="UNCERTAIN">Dessiner une zone à vérifier</button><button type="button" id="cr013FinishZone" disabled>Terminer le tracé</button><button type="button" id="cr013CancelZone" disabled>Annuler le tracé</button></div>
      <p id="cr013ZoneDrawingStatus" role="status" aria-live="polite">Choisissez une action de dessin, puis cliquez les sommets de la zone sur la carte.</p><p id="cr013ZoneSummary" aria-live="polite"></p><ul id="cr013ZoneList"></ul>
      <label for="cr013BufferArea">Marges supplémentaires non dessinées (m²)<input id="cr013BufferArea" type="number" min="0" step="any" placeholder="À renseigner, ou 0 si aucune marge"></label>
      <p class="fine">Aucun retrait périphérique de 1 m, ni marge autour des obstacles ou des cheminements, n’est calculé automatiquement. Vous pouvez dessiner ces zones ou saisir leur surface totale ici, sans compter deux fois une zone déjà tracée. Il ne s’agit pas d’une prescription réglementaire.</p>
      <p class="fine">Après confirmation, la surface retenue correspond à la surface brute moins les exclusions, les zones à vérifier et les marges renseignées. Le taux forfaitaire est alors remplacé, pas appliqué une deuxième fois. Sans confirmation, le taux reste utilisé.</p>
      <button type="button" id="cr013ConfirmZones" disabled>Confirmer les zones dessinées</button>`;
    const categoryLabel = document.createElement('label'); categoryLabel.htmlFor = 'cr013ExclusionType'; categoryLabel.textContent = 'Nature de l’exclusion ';
    const categorySelect = document.createElement('select'); categorySelect.id = 'cr013ExclusionType';
    [['SKYLIGHT', 'Lanterneau'], ['CHIMNEY', 'Cheminée / gaine'], ['HVAC', 'Équipement CVC'], ['TECHNICAL_ZONE', 'Zone technique'], ['PARAPET', 'Acrotère / recul'], ['ACCESS_ROUTE', 'Cheminement maintenance / sécurité'], ['SHADOW', 'Zone d’ombre évidente (à confirmer)'], ['OTHER', 'Autre exclusion']].forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; categorySelect.append(option); });
    categoryLabel.append(categorySelect); panel.insertBefore(categoryLabel, panel.querySelector('div'));
    const surfaces = document.getElementById('roofSurfaces');
    (surfaces || mapContainer).insertAdjacentElement('afterend', panel);
    const style = document.createElement('style');
    style.textContent = '#cr013RoofZones{margin:10px 0 16px;padding:14px;border:1px solid #cfe0d5;border-radius:9px;background:#f8fbf9;color:#315b4b}#cr013RoofZones>summary{cursor:pointer;font-weight:700;color:#0a3f2d}#cr013RoofZones[open]>summary{margin-bottom:10px}#cr013RoofZones>div{display:flex;flex-wrap:wrap;gap:8px}#cr013RoofZones button{border:1px solid #87b6a0;border-radius:7px;background:#fff;color:#075746;padding:8px 11px;font:600 14px system-ui;cursor:pointer}#cr013RoofZones button:disabled{opacity:.55;cursor:not-allowed}#cr013ConfirmZones{background:#075746!important;color:#fff!important}#cr013ZoneList{display:grid;gap:6px;padding-left:20px}#cr013ZoneList li button{margin-left:6px;padding:4px 8px;font-size:12px}#cr013ZoneDrawingStatus{min-height:1.4em}.cr013ZoneDrawing{cursor:crosshair!important}';
    document.head.appendChild(style);
    panel.querySelectorAll('[data-cr013-start]').forEach((button) => button.addEventListener('click', () => beginZoneDrawing(button.dataset.cr013Start)));
    panel.querySelector('#cr013FinishZone').addEventListener('click', finishZoneDrawing);
    panel.querySelector('#cr013CancelZone').addEventListener('click', stopZoneDrawing);
    panel.querySelector('#cr013BufferArea').addEventListener('input', (event) => {
      const value = event.currentTarget.value;
      cr013BufferAreaM2 = value === '' ? null : Number(value);
      if (!Number.isFinite(cr013BufferAreaM2) || cr013BufferAreaM2 < 0) cr013BufferAreaM2 = null;
      cr013Confirmed = false; updateCr013ZoneReadout(); calculateSynthesis();
    });
    panel.querySelector('#cr013ConfirmZones').addEventListener('click', () => {
      const invalid = cr013Zones.map((zone) => validateZoneGeometry(zone.layer, zone)).find(Boolean);
      if (invalid) { panel.querySelector('#cr013ZoneDrawingStatus').textContent = invalid; return; }
      if (!Number.isFinite(cr013BufferAreaM2)) { panel.querySelector('#cr013ZoneDrawingStatus').textContent = 'Renseignez l’aire des buffers en m² (0 si aucun) avant de confirmer.'; return; }
      const excluded = zoneLayers('EXCLUDED').reduce((sum, zone) => sum + zoneArea(zone.layer), 0), uncertain = zoneLayers('UNCERTAIN').reduce((sum, zone) => sum + zoneArea(zone.layer), 0);
      const gross = Number(document.getElementById('roofTotal')?.value);
      if (!Number.isFinite(gross) || excluded + uncertain + cr013BufferAreaM2 > gross) { panel.querySelector('#cr013ZoneDrawingStatus').textContent = 'Exclusions, incertitudes et buffers dépassent la surface brute ; vérifiez les zones et leur aire.'; return; }
      cr013Confirmed = cr013Zones.length > 0; updateCr013ZoneReadout(); calculateSynthesis();
    });
    updateCr013ZoneReadout();
  }
  function beginZoneDrawing(kind) {
    stopZoneDrawing();
    if (!layers().length) { const status = document.getElementById('cr013ZoneDrawingStatus'); if (status) status.textContent = 'Tracez d’abord le contour de toiture.'; return; }
    const knownTypes = layers().map((layer) => configurations.get(L.stamp(layer))?.type).filter(Boolean);
    if (knownTypes.length && knownTypes.every((type) => !['PITCHED', 'FLAT'].includes(type))) { const status = document.getElementById('cr013ZoneDrawingStatus'); if (status) status.textContent = 'Ce module concerne les toitures. Les ombrières, installations au sol et autres supports requièrent une méthode de surface distincte.'; return; }
    finishContourEdit(true);
    finishZoneEdit(true);
    finishOrientationPick();
    invalidateDetection();
    const style = kind === 'EXCLUDED' ? { color: '#a33d36', fillColor: '#d66a5e', fillOpacity: .28, weight: 2 } : { color: '#bd7f00', fillColor: '#f4c653', fillOpacity: .22, weight: 2, dashArray: '6 4' };
    zoneDrawSession = { kind, category: kind === 'UNCERTAIN' ? 'UNCERTAIN' : document.getElementById('cr013ExclusionType')?.value || 'OTHER', points: [], vertices: [], preview: L.polygon([], { ...style, bubblingMouseEvents: false }).addTo(window.solarMap) };
    zoneDrawSession.preview.on('click', (event) => {
      if (zoneDrawSession && event.latlng) addZonePoint(event);
    });
    window.solarMap.getContainer().classList.add('cr013ZoneDrawing');
    window.solarMap.getContainer().scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const status = document.getElementById('cr013ZoneDrawingStatus'); if (status) status.textContent = 'Cliquez les sommets de la zone sur la carte ; terminez avec le bouton ci-dessous.';
    const finish = document.getElementById('cr013FinishZone'); if (finish) finish.disabled = true;
    const cancel = document.getElementById('cr013CancelZone'); if (cancel) cancel.disabled = false;
    updateZoneDrawingToolbar();
  }

  function updateZoneDrawingToolbar() {
    const toolbar = document.getElementById('roofContourEdit');
    if (!toolbar) return;
    const active = Boolean(zoneDrawSession);
    toolbar.hidden = !active;
    toolbar.querySelector('strong').textContent = active ? 'Tracer la zone à écarter' : 'Modifier le contour';
    toolbar.querySelector('span').textContent = active ? `${zoneDrawSession.points.length} point(s) · minimum 3` : 'Déplacez les points blancs.';
    const save = toolbar.querySelector('[data-save-contour]');
    save.disabled = active && zoneDrawSession.points.length < 3;
    save.textContent = active ? 'Terminer le tracé' : 'Enregistrer le contour';
    toolbar.querySelector('[data-cancel-contour]').textContent = active ? 'Annuler le tracé' : 'Annuler la correction';
  }

  function refreshRoofTotals() {
    if (cr013Zones.length) { cr013Confirmed = false; cr013BufferAreaM2 = null; const bufferInput = document.getElementById('cr013BufferArea'); if (bufferInput) bufferInput.value = ''; updateCr013ZoneReadout(); }
    const total = layers().reduce((sum, item) => sum + area(item), 0);
    const input = document.getElementById('roofTotal');
    surfaceSource = total > 0 ? 'map' : 'none';
    if (input) {
      input.value = total ? Math.round(total) : '';
      updatingMeasuredSurface = true;
      input.dispatchEvent(new Event('input'));
      updatingMeasuredSurface = false;
    }
    window.dispatchEvent(new CustomEvent('ozeno:roof-surfaces'));
  }

  function selectOptions(values, selected) {
    return values.map((value) => `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
  }

  function isConfigured(config) {
    if (normalizeAzimuth(config?.orientation) == null) return false;
    if (config.type === 'FLAT') return Boolean(config.flatTilt);
    if (!config.pitch) return false;
    return config.type !== 'PITCHED' || Number(config.panCount) !== 2 || normalizeAzimuth(config.orientation2) != null;
  }

  function placeRoofStateLabel(host, current) {
    if (!roofStateLabel) return;
    const firstSurface = current.length ? host.querySelector('.roofSurface') : null;
    const form = firstSurface?.querySelector('.form') || document.querySelector('#roofSurfaceGeneral .form');
    if (!form) return;
    const slope = firstSurface?.querySelector('.roofPitch')
      || firstSurface?.querySelector('[data-roof-field="flatTilt"]')?.closest('label')
      || firstSurface?.querySelector('[data-roof-field="pitch"]')?.closest('label');
    if (slope?.parentElement === form) slope.insertAdjacentElement('afterend', roofStateLabel);
    else form.appendChild(roofStateLabel);
  }

  function guardLegacyPerformanceSummary() {
    const wrapHandler = (element, property) => {
      if (!element || legacyPerformanceGuards.has(element) || typeof element[property] !== 'function') return;
      const previous = element[property];
      element[property] = function (event) {
        const output = document.getElementById('dashPerformance');
        const value = output?.textContent;
        previous.call(this, event);
        if (!window.OzenoRoofSurfaces || !output || value == null) return;
        output.textContent = value;
        const reportValue = document.getElementById('reportPerformance');
        if (reportValue) reportValue.textContent = value;
      };
      legacyPerformanceGuards.add(element);
    };
    ['orientation', 'tilt', 'shade', 'roof'].forEach((id) => wrapHandler(document.getElementById(id), 'onchange'));
    wrapHandler(document.getElementById('prepare'), 'onclick');
  }

  function render() {
    const host = document.getElementById('roofSurfaceCards') || document.getElementById('roofSurfaces');
    if (!host) return;
    const current = layers();
    const activeIds = new Set(current.map((layer) => L.stamp(layer)));
    [...configurations.keys()].filter((id) => !activeIds.has(id)).forEach((id) => {
      clearOrientationMark(`${id}:orientation`);
      clearOrientationMark(`${id}:orientation2`);
      configurations.delete(id);
    });
    current.forEach((layer) => {
      bindSurfaceInteractions(layer);
      const id = L.stamp(layer);
      if (!configurations.has(id)) {
        const seed = current.length === 1 ? manualSurfaceConfiguration : null;
        configurations.set(id, {
          type: seed?.type || '', panCount: 1,
          orientation: normalizeAzimuth(document.getElementById('manualAzimuth')?.value) ?? '', orientation2: '',
          pitch: document.getElementById('tilt')?.value || '', flatTilt: manualSurfaceConfiguration.flatTilt || '',
          manualDensityWcM2: manualSurfaceConfiguration.manualDensityWcM2 || '',
          shade: document.getElementById('shade')?.value || '', material: seed?.material || ''
        });
      }
      const config = configurations.get(id);
      const candidates = roofAzimuthCandidates(layer);
      if (config.type === 'PITCHED' && Number(config.panCount) === 2 && candidates.length
        && !['manual', 'map-trace'].includes(config.orientationSource)
        && !['manual', 'map-trace'].includes(config.orientation2Source)) {
        config.orientation = candidates[0];
        config.orientation2 = candidates[1];
        config.orientationSource = 'geometry-proposal';
        config.orientation2Source = 'geometry-proposal';
      }
      config.orientation = normalizeAzimuth(config.orientation) ?? '';
      config.orientation2 = normalizeAzimuth(config.orientation2) ?? '';
    });
    host.innerHTML = `<div class="roofSurfaceHeader"><b>Surfaces de toiture · aperçu</b></div>` +
      (current.length ? `<div class="roofSurfaceList">${current.map((layer, index) => {
        const id = L.stamp(layer), config = configurations.get(id);
        const twoPans = config.type === 'PITCHED' && Number(config.panCount) === 2;
        return `<article class="roofSurface" data-roof-id="${id}"><div class="roofSurfaceTitle"><b>Toiture ${index + 1} · ${area(layer).toLocaleString('fr-FR')} m² estimés</b><div class="roofSurfaceActions"><button type="button" class="roofEdit" data-edit-roof="${id}" aria-label="Corriger le contour de la toiture ${index + 1}" title="Corriger le contour"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.5 4 4-.5L18.8 8.7l-3.5-3.5L4 16.5Zm16.2-9.2a1 1 0 0 0 0-1.4l-2.1-2.1a1 1 0 0 0-1.4 0l-1 1 3.5 3.5 1-1Z"/></svg></button><button type="button" class="roofDelete" data-delete-roof="${id}" aria-label="Supprimer la toiture ${index + 1}" title="Supprimer cette surface"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/></svg></button></div></div><div class="form"><label>Type<select data-roof-field="type"><option value="PITCHED"${config.type === 'PITCHED' ? ' selected' : ''}>Toiture inclinée</option><option value="FLAT"${config.type === 'FLAT' ? ' selected' : ''}>Toit plat</option></select></label>${['PITCHED', 'FLAT'].includes(config.type) ? `<label>Matériau de couverture<select data-roof-field="material"><option value="">Je ne sais pas encore</option>${roofMaterials.map((material) => `<option value="${material}"${config.material === material ? ' selected' : ''}>${material}</option>`).join('')}</select><small class="fine">Repère chantier facultatif · sans effet sur PVGIS.</small></label>` : ''}${config.type === 'PITCHED' ? `<label>Nombre de pans<select data-roof-field="panCount"><option value="1"${!twoPans ? ' selected' : ''}>1 pan</option><option value="2"${twoPans ? ' selected' : ''}>2 pans</option></select></label>${azimuthField(twoPans ? 'Orientation pan 1 (° depuis le nord)' : 'Orientation du pan (° depuis le nord)', 'orientation', config.orientation, id)}${twoPans ? azimuthField('Orientation pan 2 (° depuis le nord)', 'orientation2', config.orientation2, id) : ''}<label class="roofPitch">Pente<select data-roof-field="pitch">${selectOptions(pitches, config.pitch)}</select></label>` : ''}<label><span class="roofFieldLabel">Ombrage local estimé <span class="roofFieldHelp" tabindex="0" title="Les obstacles proches de la toiture peuvent créer de l’ombre. Ce choix ne décrit pas l’horizon du terrain.">i</span></span><select data-roof-field="shade">${selectOptions(shades, config.shade)}</select></label></div>${config.type === 'PITCHED' ? `<div class="roofAzimuthProposal"><button type="button" class="roofProposeAzimuth" data-propose-roof-azimuth="${id}">Proposer depuis le contour</button><span class="fine">Proposition géométrique à confirmer ; le contour ne révèle pas à lui seul le sens du pan.</span><div class="roofAzimuthChoices" data-roof-azimuth-choices hidden></div></div>` : ''}<p class="fine roofSurfaceHelp">${config.type === 'FLAT' ? '' : twoPans ? `Surface indicative par pan : ${Math.round(area(layer) / 2).toLocaleString('fr-FR')} m². Ajustez séparément leurs orientations.` : 'La surface correspond à un seul pan de toiture.'}</p></article>`;
      }).join('')}</div>` : '<p class="result">Aucune toiture ajoutée. Cliquez sur un bâtiment ou utilisez les outils de dessin sur la carte.</p>');
    current.forEach((layer, index) => {
      const id = L.stamp(layer), config = configurations.get(id);
      const card = host.querySelector(`[data-roof-id="${id}"]`);
      const form = card?.querySelector('.form');
      card?.querySelector('[data-edit-roof]')?.setAttribute('aria-label', `Corriger le contour de la surface solaire ${index + 1}`);
      card?.querySelector('[data-delete-roof]')?.setAttribute('aria-label', `Supprimer la surface solaire ${index + 1}`);
      const type = card?.querySelector('[data-roof-field="type"]');
      if (type) {
        if (![...type.options].some((option) => option.value === '')) type.insertBefore(new Option('Choisir un type', ''), type.firstChild);
        extraSurfaceTypes.forEach(([value, label]) => {
          if ([...type.options].some((option) => option.value === value)) return;
          type.add(new Option(label, value));
        });
        type.value = config.type || '';
      }
      const addUnknownOption = (select) => {
        if (!select || [...select.options].some((option) => option.value === '')) return;
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'À renseigner';
        option.disabled = true;
        select.insertBefore(option, select.firstChild);
      };
      if (config.type === 'FLAT' && form && !form.querySelector('[data-roof-field="flatTilt"]')) {
        form.insertAdjacentHTML('beforeend', `${azimuthField('Orientation des supports (° depuis le nord)', 'orientation', config.orientation, id)}<label>Inclinaison des supports<select data-roof-field="flatTilt">${selectOptions(flatTilts, normalizeFlatTilt(config.flatTilt))}</select><small class="fine pvgisTiltCallout" data-pvgis-tilt-advice>Repère PVGIS calculé selon l’orientation, à titre indicatif.</small></label>`);
      }
      const tiltSelect = form?.querySelector('[data-roof-field="flatTilt"]');
      if (tiltSelect && !tiltSelect.parentElement.querySelector('[data-pvgis-tilt-advice]')) {
        tiltSelect.insertAdjacentHTML('afterend', '<small class="fine pvgisTiltCallout" data-pvgis-tilt-advice>Repère PVGIS calculé selon l’orientation, à titre indicatif.</small>');
      }
      const pitchSelect = form?.querySelector('[data-roof-field="pitch"]');
      if (pitchSelect && !pitchSelect.parentElement.querySelector('[data-pvgis-pitch-advice]')) {
        pitchSelect.insertAdjacentHTML('afterend', '<small class="fine" data-pvgis-pitch-advice>Toiture inclinée : la pente réelle du toit fixe l’angle des panneaux ; le repère PVGIS ne remplace pas cette contrainte physique.</small>');
      }
      const southFlatAzimuth = normalizeAzimuth(config.orientation);
      const southFlat = config.type === 'FLAT'
        && southFlatAzimuth != null && southFlatAzimuth >= 135 && southFlatAzimuth <= 225
        && (flatTiltAngle(config.flatTilt) || 0) > 15;
      if (config.type === 'FLAT' && form) {
        const densityField = form.querySelector('[data-roof-field="manualDensityWcM2"]');
      if (southFlat && !densityField) {
          form.insertAdjacentHTML('beforeend', '<label>Densité issue d’un calepinage (Wc/m², facultative)<input type="number" min="1" max="1000" step="any" inputmode="decimal" data-roof-field="manualDensityWcM2" placeholder="Laisser vide pour l’estimation"><small class="fine">Facultative : sans calepinage, une estimation géométrique préliminaire est calculée automatiquement.</small></label>');
        } else if (!southFlat && densityField) {
          densityField.closest('label')?.remove();
          config.manualDensityWcM2 = '';
        }
      }
      if (config.type && !['PITCHED', 'FLAT'].includes(config.type) && form && !form.querySelector('[data-roof-field="orientation"]')) {
        form.insertAdjacentHTML('beforeend', `${azimuthField('Orientation prévue (° depuis le nord)', 'orientation', config.orientation, id)}<label>Inclinaison prévue<select data-roof-field="pitch">${selectOptions(pitches, config.pitch)}</select></label>`);
      }
      if (config.type && !['PITCHED', 'FLAT'].includes(config.type) && form && !form.querySelector('[data-roof-field="manualDensityWcM2"]')) {
        const density = Number(config.manualDensityWcM2);
        const value = Number.isFinite(density) && density >= 1 && density <= 1000 ? density : '';
        form.insertAdjacentHTML('beforeend', `<label>Densité indicative saisie (Wc/m²)<input type="number" min="1" max="1000" step="any" inputmode="decimal" data-roof-field="manualDensityWcM2" value="${value}" placeholder="Valeur à confirmer"><small class="fine">Valeur de travail fournie pour cette surface ; aucune plage de référence n’est inventée.</small></label>`);
      }
      card?.querySelectorAll('[data-roof-field]').forEach((field) => {
        if (field.tagName !== 'SELECT') {
          if (field.dataset.roofField === 'manualDensityWcM2') {
            const density = Number(config.manualDensityWcM2);
            field.value = Number.isFinite(density) && density >= 1 && density <= 1000 ? String(density) : '';
          }
          return;
        }
        addUnknownOption(field);
        const key = field.dataset.roofField;
        if (key === 'type' || key === 'shade' || key === 'material') field.value = config[key] || '';
        if (key === 'pitch') field.value = normalizePitch(config.pitch);
        if (key === 'flatTilt') field.value = normalizeFlatTilt(config.flatTilt);
        if (key === 'orientation' || key === 'orientation2') field.value = normalizeAzimuth(config[key]) ?? '';
      });
      const title = card?.querySelector('.roofSurfaceTitle b');
      if (title) title.textContent += isConfigured(config) ? ' · paramètres renseignés' : ' · à compléter';
      const help = card?.querySelector('.roofSurfaceHelp');
      const surfaceTitle = card?.querySelector('.roofSurfaceTitle b');
      if (surfaceTitle) surfaceTitle.textContent = surfaceTitle.textContent.replace(/^Toiture /, 'Surface solaire ');
      if (help && !config.type) help.textContent = `Choisissez le type de surface, puis renseignez les caractéristiques connues. La production reste en attente tant que le contour et ses paramètres ne sont pas définis.${roofAzimuthCandidates(layer).length ? ' Axe du contour analysé automatiquement.' : ''}`;
      if (help && config.type === 'FLAT') help.textContent = '';
      if (help && config.type && !isConfigured(config)) help.textContent = `${surfaceTypeLabels[config.type] || (config.type === 'PITCHED' ? 'Toiture inclinée' : 'Surface')} : renseignez orientation et inclinaison${config.type === 'PITCHED' && Number(config.panCount) === 2 ? ' et orientation du second pan' : ''}. L’ombrage est facultatif ; sans donnée, aucune réduction supplémentaire n’est appliquée.`;
      if (help && config.type === 'PITCHED' && pitchAngle(config.pitch)) help.textContent += ` Pour l’estimation, cette plage est représentée par un angle de ${pitchAngle(config.pitch)}° dans PVGIS.`;
      if (help && (config.orientationSource === 'geometry-proposal' || config.orientation2Source === 'geometry-proposal')) help.textContent += ' Orientation proposée à partir de l’axe du contour : à vérifier sur l’image satellite.';
      if (help) { help.hidden = config.type === 'FLAT'; }
      card?.querySelector('.roofAzimuthProposal')?.remove();
      if (config.type === 'PITCHED') {
        const orientationLabel = card?.querySelector('[data-roof-field="orientation"]')?.closest('label');
        const candidates = roofAzimuthCandidates(layer);
        if (orientationLabel && Number(config.panCount) !== 2 && normalizeAzimuth(config.orientation) == null && candidates.length) {
          const choices = document.createElement('div');
          choices.className = 'roofAzimuthChoices';
          choices.setAttribute('role', 'group');
          choices.setAttribute('aria-label', 'Choisir une orientation proposée depuis le contour');
          const note = document.createElement('span');
          note.className = 'fine';
          note.textContent = 'Le contour indique l’axe, pas le côté de pente : choisissez la direction du pan.';
          choices.appendChild(note);
          candidates.forEach((candidate) => {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.textContent = formatAzimuth(candidate);
            choice.addEventListener('click', () => {
              config.orientation = candidate;
              config.orientationSource = 'geometry-proposal';
              render();
            });
            choices.appendChild(choice);
          });
          orientationLabel.appendChild(choices);
        }
      }
    });
    placeRoofStateLabel(host, current);
    const title = host.querySelector('.roofSurfaceHeader b');
    if (title) title.textContent = 'Zones d’implantation solaire · aperçu';
    host.querySelector('.roofSurfaceHeader .fine')?.remove();
    const empty = host.querySelector('.roofSurfaceHeader + .result');
    if (empty) empty.textContent = 'Aucune surface ajoutée. Cliquez sur une empreinte de bâtiment ou dessinez une zone sur la carte.';
    host.querySelectorAll('[data-roof-id]').forEach((card) => {
      const id = Number(card.dataset.roofId);
      card.querySelectorAll('[data-roof-field]').forEach((field) => field.addEventListener('change', () => {
        const key = field.dataset.roofField;
        const config = configurations.get(id);
        config[key] = key === 'orientation' || key === 'orientation2' ? normalizeAzimuth(field.value) ?? '' : field.value;
        if (key === 'panCount' && Number(field.value) !== 2 && config.orientationSource === 'geometry-proposal' && config.orientation2Source === 'geometry-proposal') {
          config.orientation = '';
          config.orientation2 = '';
          config.orientationSource = '';
          config.orientation2Source = '';
        }
        if (key === 'orientation' || key === 'orientation2') {
          config[`${key}Source`] = 'manual';
          clearOrientationMark(`${id}:${key}`);
        }
        render();
      }));
      card.querySelectorAll('[data-roof-pick]').forEach((button) => button.addEventListener('click', () => {
        if (orientationPicker?.button === button) {
          finishOrientationPick('Tracé de l’orientation annulé.');
          return;
        }
        startOrientationPick({ kind: 'roof', id, field: button.dataset.roofPick, fromRidge: configurations.get(id)?.type === 'PITCHED' }, button);
      }));
      const pitch = card.querySelector('.roofPitch');
      if (pitch) pitch.firstChild.nodeValue = 'Pente du pan';
    });
    host.querySelectorAll('[data-delete-roof]').forEach((button) => button.addEventListener('click', () => removeSurface(Number(button.dataset.deleteRoof))));
    host.querySelectorAll('[data-edit-roof]').forEach((button) => button.addEventListener('click', () => editSurface(Number(button.dataset.editRoof))));
    window.OzenoRoofSurfaces = { configurations, layers: current, captureDraft, restoreDraft, calculateUsableArea: calculateCr013SolarUsableArea,
      getInstallationTypes: () => layers().length ? layers().map((layer) => configurations.get(L.stamp(layer))?.type || '') : [manualSurfaceConfiguration.type] };
    guardLegacyPerformanceSummary();
    synchronizeLegacyFields();
    calculateSynthesis();
    window.dispatchEvent(new CustomEvent('ozeno:roof-configurations-updated'));
  }

  function captureDraft() {
    finishContourEdit(true);
    return { source: surfaceSource, manualConfiguration: { ...manualSurfaceConfiguration }, surfaces: layers().map((layer) => ({
      geometry: layer.toGeoJSON(), configuration: { ...configurations.get(L.stamp(layer)) },
      ...(layer.options?.osmFootprintId != null ? { footprintId: layer.options.osmFootprintId } : {})
    })), ...(cr013Zones.length ? { zones: cr013Zones.map((zone) => ({ kind: zone.kind, category: zone.category, geometry: zone.layer.toGeoJSON() })), zonesConfirmed: cr013Confirmed, bufferAreaM2: cr013BufferAreaM2 } : {}) };
  }

  function restoreDraft(snapshot = {}) {
    finishContourEdit(false);
    invalidateDetection();
    finishOrientationPick();
    lastCr013AreaResult = null;
    stopZoneDrawing();
    cr013ZoneGroup?.clearLayers(); cr013Zones = []; cr013Confirmed = false; cr013BufferAreaM2 = null;
    orientationLayerGroup?.clearLayers();
    orientationMarks.clear();
    window.roofGroup?.clearLayers();
    configurations.clear();
    for (const entry of snapshot.surfaces || []) {
      if (!['Polygon', 'MultiPolygon'].includes(entry.geometry?.geometry?.type)) continue;
      L.geoJSON(entry.geometry).eachLayer((layer) => {
        if (entry.footprintId != null) layer.options.osmFootprintId = entry.footprintId;
        window.roofGroup.addLayer(layer);
        configurations.set(L.stamp(layer), { ...entry.configuration });
      });
    }
    // Legacy draft zones are deliberately ignored while CR-013 is archived.
    manualSurfaceConfiguration = {
      type: ['PITCHED', 'FLAT', ...extraSurfaceTypes.map(([value]) => value)].includes(snapshot.manualConfiguration?.type) ? snapshot.manualConfiguration.type : '',
      material: roofMaterials.includes(snapshot.manualConfiguration?.material) ? snapshot.manualConfiguration.material : '',
      flatTilt: snapshot.manualConfiguration?.flatTilt || '',
      manualDensityWcM2: Number(snapshot.manualConfiguration?.manualDensityWcM2) >= 1 && Number(snapshot.manualConfiguration?.manualDensityWcM2) <= 1000 ? String(snapshot.manualConfiguration.manualDensityWcM2) : ''
    };
    const manualType = document.getElementById('manualRoofType');
    const manualMaterial = document.getElementById('manualRoofMaterial');
    const manualFlatTilt = document.getElementById('manualFlatTilt');
    const manualDensityInput = document.getElementById('manualDensityWcM2');
    if (manualType) manualType.value = manualSurfaceConfiguration.type;
    if (manualMaterial) manualMaterial.value = manualSurfaceConfiguration.material;
    if (manualFlatTilt) manualFlatTilt.value = manualSurfaceConfiguration.flatTilt;
    if (manualDensityInput) manualDensityInput.value = manualSurfaceConfiguration.manualDensityWcM2;
    const storedFlatTilt = manualSurfaceConfiguration.flatTilt;
    manualType?.dispatchEvent(new Event('change', { bubbles: true }));
    manualFlatTilt?.dispatchEvent(new Event('change', { bubbles: true }));
    manualSurfaceConfiguration.flatTilt = storedFlatTilt;
    surfaceSource = ['map', 'manual'].includes(snapshot.source) ? snapshot.source : 'none';
    updateCr013ZoneReadout();
    render();
  }

  function detectionStatus(message, state = '') {
    const node = document.getElementById('roofDetectionStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function finishDetection(version = detectionVersion) {
    if (version !== detectionVersion) return;
    detectionPending = false;
    document.getElementById('roofThinking')?.setAttribute('hidden', 'hidden');
  }

  function invalidateDetection() {
    detectionVersion += 1;
    finishDetection();
  }

  function containsPoint(points, lat, lng) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].lon, yi = points[i].lat, xj = points[j].lon, yj = points[j].lat;
      const crosses = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi) / ((yj - yi) || Number.EPSILON)) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function layerContainsPoint(layer, lat, lng) {
    const latlngs = layer?.getLatLngs?.() || [];
    const inRing = (ring) => ring.length >= 3 && containsPoint(ring.map((point) => ({ lat: point.lat, lon: point.lng })), lat, lng);
    const inPolygon = (rings) => inRing(rings[0]) && !rings.slice(1).some(inRing);
    if (!latlngs.length) return false;
    if (!Array.isArray(latlngs[0])) return inRing(latlngs);
    if (!Array.isArray(latlngs[0][0])) return inPolygon(latlngs);
    return latlngs.some(inPolygon);
  }

  function bindSurfaceInteractions(layer) {
    if (interactiveLayers.has(layer) || !layer.on) return;
    interactiveLayers.add(layer);
    layer.options.bubblingMouseEvents = false;
    layer.on('click', (event) => {
      if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      if (zoneDrawSession && event.latlng) { addZonePoint(event); return; }
      if (zoneEditSession) return;
      if (orientationPicker) { chooseOrientationAtMap(event); return; }
      if (window.SOLARSHIFT_CONFIG?.manualLocationPickActive && event.latlng) {
        window.dispatchEvent(new CustomEvent('ozeno:map-site-selected', { detail: { latitude: event.latlng.lat, longitude: event.latlng.lng, manualPick: true } }));
        return;
      }
      if (drawingActive) return;
      editSurface(L.stamp(layer));
    });
    layer.on('edit', refreshRoofTotals);
    layer.on('revert-edited', refreshRoofTotals);
  }

  function useDetectedCandidate(candidate) {
    const previous = layers().find((layer) => layer.options.osmFootprintId === candidate.osmId);
    if (previous) {
      editSurface(L.stamp(previous));
      return;
    }
    const layer = candidate.layer;
    layer.options.osmFootprintId = candidate.osmId;
    layer.options.bubblingMouseEvents = false;
    window.roofGroup.addLayer(layer);
    bindSurfaceInteractions(layer);
    refreshRoofTotals();
    window.solarMap.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 19 });
    detectionStatus(`Surface solaire ${layers().length} ajoutée : ${area(layer).toLocaleString('fr-FR')} m². Cliquez sur son contour pour le corriger, ou sur une autre toiture pour l’ajouter.`, 'success');
  }

  async function buildingLayersNear(lat, lng) {
    const { fetchBuildingFootprints } = await import('./osm-footprint-client.mjs');
    const buildings = (await fetchBuildingFootprints(lat, lng)).filter((item) => item.type === 'way' && item.geometry?.length >= 4);
    return buildings.map((item) => {
      const points = item.geometry;
      const layer = L.polygon(points.map((point) => [point.lat, point.lon]), { color: '#08734c', weight: 3, fillColor: '#54a378', fillOpacity: .22, bubblingMouseEvents: false });
      return { layer, osmId: item.id, areaM2: area(layer), containsClick: containsPoint(points, lat, lng) };
    });
  }

  async function searchFootprints(lat, lng) {
    if (drawingActive || detectionPending || contourEdit) return;
    const version = ++detectionVersion;
    const context = projectContextKey();
    detectionPending = true;
    document.getElementById('roofThinking')?.removeAttribute('hidden');
    detectionStatus('Recherche des empreintes cartographiques proches…', 'loading');
    try {
      const { chooseContainingFootprint } = await import('./osm-footprint-client.mjs');
      let candidates = await buildingLayersNear(lat, lng);
      if (version !== detectionVersion || context !== projectContextKey()) return;
      const seen = new Set();
      candidates = candidates.filter((candidate) => {
        const key = candidate.osmId || candidate.layer.getBounds().toBBoxString();
        if (candidate.areaM2 < 8 || candidate.areaM2 > 100000 || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const containing = chooseContainingFootprint(candidates);
      if (containing) useDetectedCandidate(containing);
      else detectionStatus('Aucune empreinte OpenStreetMap ne couvre ce point. Cliquez plus au centre du toit ou dessinez son contour ; la photo aérienne seule ne permet pas de le détecter automatiquement.', 'error');
    } catch (error) {
      if (version !== detectionVersion || context !== projectContextKey()) return;
      detectionStatus(`${error?.message || 'Recherche cartographique impossible.'} Votre contour actuel est conservé. Réessayez plus tard ou dessinez le bâtiment ; cette erreur ne signifie pas qu’il est absent de la carte.`, 'error');
    } finally {
      finishDetection(version);
    }
  }

  function detectAt(event) {
    if (zoneDrawSession && event.latlng) { addZonePoint(event); return; }
    if (zoneEditSession) return;
    if (window.SOLARSHIFT_CONFIG?.manualLocationPickActive && event.latlng) {
      window.dispatchEvent(new CustomEvent('ozeno:map-site-selected', { detail: { latitude: event.latlng.lat, longitude: event.latlng.lng, manualPick: true } }));
      return;
    }
    if (orientationPicker && chooseOrientationAtMap(event)) return;
    if (drawingActive || !event.latlng) return;
    const existing = layers().find((layer) => layerContainsPoint(layer, event.latlng.lat, event.latlng.lng));
    if (existing) {
      editSurface(L.stamp(existing));
      return;
    }
    if (detectionPending) return;
    finishContourEdit(true);
    window.dispatchEvent(new CustomEvent('ozeno:map-site-selected', { detail: { latitude: event.latlng.lat, longitude: event.latlng.lng } }));
    return searchFootprints(event.latlng.lat, event.latlng.lng);
  }

  function removeSurface(id) {
    const layer = layers().find((item) => L.stamp(item) === id);
    if (contourEdit?.layer === layer) finishContourEdit(false);
    if (layer) window.roofGroup.removeLayer(layer);
    clearOrientationMark(`${id}:orientation`);
    clearOrientationMark(`${id}:orientation2`);
    if (orientationPicker?.target.kind === 'roof' && orientationPicker.target.id === id) finishOrientationPick();
    configurations.delete(id);
    refreshRoofTotals();
    render();
  }

  function editSurface(id) {
    const layer = layers().find((item) => L.stamp(item) === id);
    if (!layer?.editing || drawingActive || orientationPicker) return;
    if (contourEdit?.layer === layer) return;
    finishContourEdit(true);
    invalidateDetection();
    contourEdit = { layer, latlngs: JSON.parse(JSON.stringify(layer.getLatLngs())), configuration: { ...configurations.get(id) }, edited: layer.edited };
    layer.editing.enable();
    const toolbar = document.getElementById('roofContourEdit');
    if (toolbar) {
      toolbar.hidden = false;
      toolbar.querySelector('strong').textContent = `Modifier la surface solaire ${layers().indexOf(layer) + 1}`;
    }
    window.solarMap.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: 19 });
    // The correction button is below the map: bring its editable vertices back into view.
    window.solarMap.getContainer?.()?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    detectionStatus('Déplacez les points blancs, puis enregistrez ou annulez. Un clic sur une autre toiture conserve cette correction et recherche une surface à ajouter.', 'success');
  }

  function finishContourEdit(save = true) {
    if (!contourEdit) return;
    const previous = contourEdit;
    contourEdit = null;
    previous.layer.editing.disable();
    if (!save) {
      previous.layer.setLatLngs(previous.latlngs);
      // Leaflet.draw caches the coordinate arrays. Match its native cancel lifecycle
      // so reopening the editor targets the restored geometry, not detached arrays.
      previous.layer.fire('revert-edited', { layer: previous.layer });
      configurations.set(L.stamp(previous.layer), previous.configuration);
    }
    previous.layer.edited = previous.edited;
    document.getElementById('roofContourEdit')?.setAttribute('hidden', 'hidden');
    refreshRoofTotals();
    detectionStatus(save ? 'Contour enregistré dans l’aperçu. Pensez à enregistrer le projet pour le conserver.' : 'Correction annulée : le contour précédent est rétabli.', 'success');
  }

  function synchronizeLegacyFields() {
    const first = configurations.values().next().value;
    if (!first) return;
    const values = { orientation: compassLabel(first.orientation), tilt: first.type === 'FLAT' ? 'Toit plat' : first.pitch, shade: first.shade };
    Object.entries(values).forEach(([id, value]) => { const field = document.getElementById(id); if (field) field.value = value; });
    const modeNote = document.querySelector('.roofModeNote');
    if (modeNote) modeNote.textContent = first.type === 'FLAT'
      ? ''
      : first.type === 'PITCHED'
        ? 'Toiture inclinée : tracez un pan à la fois ou qualifiez une empreinte en deux pans.'
        : 'Précisez le type et les caractéristiques connues ; les inconnues restent en attente.';
    if (modeNote) modeNote.hidden = first.type === 'FLAT';
  }

  function projectCoordinates() {
    const canonical = window.SOLARSHIFT_CONFIG || {};
    const localCoordinates = canonical.localProjectCoordinates;
    // A contour-centroid fallback only says where the current map was drawn. It
    // cannot confirm an unlocated saved project's postal address.
    if (canonical.addressLookupNeedsSelection && localCoordinates?.coordinateSource === 'DRAWN_CONTOUR_CENTER') return null;
    if (Number.isFinite(Number(localCoordinates?.latitude)) && Number.isFinite(Number(localCoordinates?.longitude))) {
      return [Number(localCoordinates.latitude), Number(localCoordinates.longitude)];
    }
    if (canonical.canonicalConnectionExpected) {
      if (!canonical.projectContextLoaded || !canonical.projectCoordinates) return null;
      return [canonical.projectCoordinates.latitude, canonical.projectCoordinates.longitude];
    }
    // Saved intake without a geolocated site must never borrow demo coordinates.
    if (canonical.commercialDraftId) return null;
    const address = document.getElementById('dashAddress')?.textContent || '';
    return Object.entries(coordinates).find(([city]) => address.includes(city))?.[1] || coordinates.Muret;
  }

  function pvgisMountingPlace(surfaceType) {
    if (['PITCHED', 'FLAT', 'BUILDING_FACADE'].includes(surfaceType)) return 'building';
    if (['PARKING_CANOPY', 'GROUND_MOUNTED', 'FLOATING', 'AGRIVOLTAIC', 'OTHER'].includes(surfaceType)) return 'free';
    return null;
  }

  async function fetchPvgis(lat, lon, angle, aspect, lossPercent, mountingplace = 'building', options = {}) {
    const cacheKey = options.optimalInclination
      ? JSON.stringify(['PVGIS-5.3', lat, lon, 'PVGIS-SARAH3', 'crystSi', mountingplace, lossPercent, aspect])
      : null;
    if (cacheKey && pvgisOptimalTiltCache.has(cacheKey)) return pvgisOptimalTiltCache.get(cacheKey);
    const query = new URLSearchParams({
      lat: String(lat), lon: String(lon), peakpower: '1', loss: String(lossPercent),
      angle: String(angle), aspect: String(aspect), mountingplace,
      pvtechchoice: 'crystSi', raddatabase: 'PVGIS-SARAH3', outputformat: 'json'
    });
    if (options.optimalInclination) query.set('optimalinclination', '1');
    const parse = (payload) => {
      const annual = Number(payload.outputs?.totals?.fixed?.E_y ?? payload.annual_kwh_kwc);
      const monthly = payload.outputs?.monthly?.fixed?.map((item) => Number(item.E_m)) || payload.monthly_kwh_kwc?.map(Number);
      if (!Number.isFinite(annual) || !Array.isArray(monthly) || monthly.length !== 12 || monthly.some((value) => !Number.isFinite(value))) throw new Error('PVGIS n’a pas renvoyé les 12 mois de production.');
      const optimalTiltDeg = options.optimalInclination
        ? Number(payload.inputs?.mounting_system?.fixed?.slope?.value ?? payload.optimal_tilt_deg)
        : null;
      if (options.optimalInclination && (!Number.isFinite(optimalTiltDeg) || optimalTiltDeg < 0 || optimalTiltDeg > 90)) throw new Error('PVGIS n’a pas renvoyé son inclinaison optimale.');
      return { annual, monthly, optimalTiltDeg };
    };
    const config = window.SOLARSHIFT_CONFIG || {};
    let relayFailure = null;
    if (config.pvgisEndpoint) {
      try {
        const proxyQuery = new URLSearchParams({ lat: String(lat), lon: String(lon), angle: String(angle), aspect: String(aspect), loss: String(lossPercent), mountingplace });
        if (options.optimalInclination) proxyQuery.set('optimalinclination', '1');
        const response = await fetch(`${config.pvgisEndpoint}?${proxyQuery}`, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error(`Relais PVGIS indisponible (${response.status})`);
        const result = parse(await response.json());
        if (cacheKey) pvgisOptimalTiltCache.set(cacheKey, result);
        return result;
      } catch (error) {
        // The official endpoint remains a fallback if the relay is unavailable.
        relayFailure = error?.message || 'Relais PVGIS indisponible.';
      }
    }
    try {
      const payload = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?${query}`);
        request.timeout = 20000;
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve(JSON.parse(request.responseText)) : reject(new Error(`PVGIS indisponible (${request.status})`));
        request.onerror = () => reject(new Error('Connexion directe à PVGIS indisponible.'));
        request.ontimeout = () => reject(new Error('Le calcul PVGIS a dépassé le délai autorisé.'));
        request.send();
      });
      const result = parse(payload);
      if (cacheKey) pvgisOptimalTiltCache.set(cacheKey, result);
      return result;
    } catch (error) {
      const directFailure = error?.message || 'PVGIS indisponible.';
      throw new Error([relayFailure, directFailure].filter(Boolean).join(' · ') || directFailure);
    }
  }

  async function requestClimateYieldPreview(version, latitude, longitude, lossPercent, planes) {
    const endpoint = window.SOLARSHIFT_CONFIG?.pvgisClimateEndpoint;
    if (!endpoint || !Array.isArray(planes) || !planes.length) {
      emitClimateYieldPreview({ status: 'UNKNOWN', reason: 'CLIMATE_PREVIEW_NOT_CONFIGURED', canonical: false });
      return;
    }
    climateCalculationController?.abort();
    const controller = new AbortController();
    climateCalculationController = controller;
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const config = window.SOLARSHIFT_CONFIG || {};
      const token = typeof config.getAccessToken === 'function' ? await config.getAccessToken() : config.sessionToken;
      if (!token) throw new Error('Connectez-vous pour lancer le calcul climatique historique.');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.supabasePublishableKey || '',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ lat: latitude, lon: longitude, loss_percent: lossPercent, planes }),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Calcul climatique indisponible (${response.status})`);
      if (version !== calculationVersion) return;
      emitClimateYieldPreview(result);
    } catch (error) {
      if (version !== calculationVersion || controller.signal.aborted) return;
      const result = { status: 'UNKNOWN', reason: error?.message || 'CLIMATE_PREVIEW_UNAVAILABLE', canonical: false };
      emitClimateYieldPreview(result);
    } finally {
      clearTimeout(timeout);
      if (climateCalculationController === controller) climateCalculationController = null;
    }
  }

  function emitClimateYieldPreview(preview) {
    window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    window.SOLARSHIFT_CONFIG.climateYieldPreview = preview;
    window.dispatchEvent(new CustomEvent('ozeno:climate-yield-preview', { detail: preview }));
  }

  function projectContextKey() {
    const config = window.SOLARSHIFT_CONFIG || {};
    const activeProject = document.querySelector('.projects > button[data-p].active')?.dataset.p || '';
    const local = config.localProjectCoordinates;
    return JSON.stringify([config.projectId || '', activeProject, local?.latitude ?? null, local?.longitude ?? null]);
  }

  // Keep map guidance independent of the repeatedly rendered surface cards.
  function positionRoofMapModules() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    let feedback = document.getElementById('roofMapFeedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'roofMapFeedback';
    }
    if (mapContainer.nextElementSibling !== feedback) mapContainer.insertAdjacentElement('afterend', feedback);
    let detection = document.getElementById('roofDetectionStatus');
    if (!detection) {
      detection = document.createElement('p');
      detection.id = 'roofDetectionStatus';
      detection.className = 'roofDetectionStatus fine';
      detection.setAttribute('aria-live', 'polite');
    }
    [document.getElementById('roofMapClickHint'), document.getElementById('roofResult'),
      detection, document.querySelector('.roofModeNote')].filter(Boolean).forEach((node) => feedback.appendChild(node));
    const surfaces = document.getElementById('roofSurfaces');
    if (surfaces && feedback.nextElementSibling !== surfaces) feedback.insertAdjacentElement('afterend', surfaces);
  }

  function syncRoofRatioReadout() {
    const control = document.getElementById('roofRatio');
    const output = document.getElementById('roofRatioValue');
    const value = control?.value === '' ? NaN : Number(control?.value);
    if (output) output.textContent = Number.isFinite(value) ? `${value.toLocaleString('fr-FR')} %` : 'À préciser';
  }

  function installRoofRatioSlider() {
    const control = document.getElementById('roofRatio');
    const label = control?.closest('label');
    if (!control || !label || document.getElementById('roofRatioValue')) return;
    const savedValue = control.value;
    control.min = '0'; control.max = '100'; control.step = 'any';
    control.type = 'range';
    control.value = savedValue;
    control.setAttribute('aria-describedby', 'roofRatioHelp');
    label.classList.add('roofRatioSlider');
    const heading = document.createElement('span');
    heading.className = 'roofRatioHeading';
    heading.innerHTML = '<span>Part de surface brute retenue (%)</span><output id="roofRatioValue" for="roofRatio" aria-live="polite"></output>';
    const help = document.createElement('small');
    help.id = 'roofRatioHelp';
    help.textContent = 'Hypothèse indicative par défaut : 65 %, modifiable selon les caractéristiques de la toiture.';
    label.replaceChildren(heading, control, help);
    control.addEventListener('input', syncRoofRatioReadout);
    control.addEventListener('change', syncRoofRatioReadout);
    syncRoofRatioReadout();
  }

  function installRoofAreaDetails(roof, surfaces) {
    let cards = surfaces.querySelector('#roofSurfaceCards');
    if (!cards) {
      cards = document.createElement('div');
      cards.id = 'roofSurfaceCards';
      surfaces.appendChild(cards);
    }
    let details = surfaces.querySelector('#roofSurfaceGeneral');
    if (!details) {
      details = document.createElement('section');
      details.id = 'roofSurfaceGeneral';
      details.className = 'roofSurface roofSurfaceGeneral';
      details.innerHTML = '<h3>Surface solaire · informations générales</h3><p class="fine">Surface totale et taux d’exploitation estimés.</p><div class="form"></div>';
      surfaces.appendChild(details);
    }
    const fields = details.querySelector('.form');
    ['roofTotal', 'roofRatio'].forEach((id) => {
      const label = roof.querySelector(`#${id}`)?.closest('label');
      if (label && !fields.contains(label)) fields.appendChild(label);
    });
    const total = document.getElementById('roofTotal');
    if (total?.closest('label')?.firstChild) total.closest('label').firstChild.nodeValue = 'Surface totale de la zone (m²) ';
    const ratioLabel = document.getElementById('roofRatio')?.closest('label');
    installRoofRatioSlider();
    if (!fields.querySelector('#roofUsableAreaReadout')) {
      const readout = document.createElement('div');
      readout.className = 'roofUsableAreaReadout';
      readout.id = 'roofUsableAreaReadout';
      readout.setAttribute('role', 'group');
      readout.setAttribute('aria-label', 'Surface exploitable estimée');
      readout.innerHTML = '<span class="roofUsableAreaLabel">Surface exploitable estimée</span><output id="roofUsableAreaInline" aria-live="polite">À calculer</output><small id="roofUsableAreaProvenance">Hypothèse modifiable de pré-étude · 65 % de la surface brute · non validée</small>';
      fields.appendChild(readout);
    }
    // Keep per-surface qualification fields next to the general area fields.
    // When the cards preceded this section, scrolling to the measured area hid
    // type, material, pitch and roof-condition controls above the current view.
    const qualificationHost = document.getElementById('prestudySurfaceQualification')?.querySelector('.prestudyDPanel');
    if (qualificationHost) {
      if (cards.parentElement !== qualificationHost) qualificationHost.appendChild(cards);
    } else if (details.nextElementSibling !== cards) details.insertAdjacentElement('afterend', cards);
    positionRoofMapModules();
    return details;
  }

  function installManualAreaSettings() {
    const roof = document.getElementById('audit-roof');
    const input = document.getElementById('roofTotal');
    const form = roof?.querySelector(':scope > .form');
    if (!roof || !input || !form || roof.querySelector('#manualAreaSettings')) return;
    input.type = 'number';
    input.readOnly = false;
    input.removeAttribute('aria-readonly');
    input.min = '0';
    input.step = 'any';
    input.placeholder = 'Surface connue ou mesurée sur la carte';
    input.title = 'Saisissez une surface connue ou mesurez-la en dessinant un contour sur la carte.';
    const note = document.createElement('small');
    note.id = 'roofAreaSourceNote';
    note.textContent = 'Saisissez la surface connue, ou tracez un contour pour la mesurer.';
    input.insertAdjacentElement('afterend', note);
    const settings = document.createElement('section');
    settings.id = 'manualAreaSettings';
    settings.hidden = true;
    settings.innerHTML = `<h3>Caractéristiques de la surface</h3><p class="fine">Ces champs restent disponibles même sans contour détecté. La surface peut être saisie ou dessinée ; une fois un contour ajouté, les caractéristiques se règlent pour chaque surface séparément.</p><div class="form"><label>Type de surface<select id="manualRoofType"><option value="">À renseigner</option><option value="PITCHED">Toiture inclinée</option><option value="FLAT">Toit plat</option>${extraSurfaceTypes.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label>Matériau de couverture<select id="manualRoofMaterial"><option value="">Je ne sais pas encore</option>${roofMaterials.map((material) => `<option value="${material}">${material}</option>`).join('')}</select></label><label id="manualFlatTiltLabel" hidden>Inclinaison des supports<select id="manualFlatTilt"><option value="">À renseigner</option>${flatTilts.map((tilt) => `<option value="${tilt}">${tilt}</option>`).join('')}</select><small id="manualPvgisTiltAdvice" class="fine pvgisTiltCallout">Repère PVGIS calculé selon l’orientation, à titre indicatif.</small></label><label id="manualDensityLabel" hidden>Densité issue d’un calepinage (Wc/m², facultative)<input id="manualDensityWcM2" type="number" min="1" max="1000" step="any" inputmode="decimal" placeholder="Laisser vide pour l’estimation"><small class="fine">Sans calepinage, une estimation géométrique préliminaire est calculée automatiquement.</small></label><label>Orientation des panneaux (° depuis le nord)<span title="Azimut : 0° = nord, 90° = est, 180° = sud, 270° = ouest.">i</span><div class="roofAzimuthControl"><input id="manualAzimuth" type="number" min="0" max="359" step="1" placeholder="0–359°" aria-label="Orientation des panneaux en degrés depuis le nord"><button type="button" class="roofPickAzimuth" data-pick-manual-azimuth>Tracer sur la carte</button></div></label></div>`;
    const details = roof.querySelector('#roofSurfaceGeneral');
    (details || form).insertAdjacentElement('afterend', settings);
    document.getElementById('orientation')?.closest('label')?.setAttribute('hidden', 'hidden');
    ['tilt', 'shade'].forEach((id) => {
      const label = document.getElementById(id)?.closest('label');
      if (!label) return;
      label.hidden = false;
      settings.querySelector('.form').appendChild(label);
    });
    const manualType = settings.querySelector('#manualRoofType');
    const manualMaterial = settings.querySelector('#manualRoofMaterial');
    const manualFlatTilt = settings.querySelector('#manualFlatTilt');
    const manualFlatTiltLabel = settings.querySelector('#manualFlatTiltLabel');
    const manualDensityInput = settings.querySelector('#manualDensityWcM2');
    const manualDensityLabel = settings.querySelector('#manualDensityLabel');
    if (manualType) manualType.value = manualSurfaceConfiguration.type;
    if (manualMaterial) manualMaterial.value = manualSurfaceConfiguration.material;
    if (manualFlatTilt) manualFlatTilt.value = manualSurfaceConfiguration.flatTilt;
    if (manualDensityInput) manualDensityInput.value = manualSurfaceConfiguration.manualDensityWcM2;
    const updateManualTypeFields = () => {
      const flat = manualType?.value === 'FLAT';
      if (manualFlatTiltLabel) manualFlatTiltLabel.hidden = !flat;
      const manualAzimuth = normalizeAzimuth(document.getElementById('manualAzimuth')?.value);
      const southFlatNeedsLayout = flat && manualAzimuth != null && manualAzimuth >= 135 && manualAzimuth <= 225 && (flatTiltAngle(manualSurfaceConfiguration.flatTilt) || 0) > 15;
      if (manualDensityLabel) {
        manualDensityLabel.hidden = !manualType?.value || (['PITCHED', 'FLAT'].includes(manualType.value) && !southFlatNeedsLayout);
        if (southFlatNeedsLayout) {
          manualDensityLabel.firstChild.textContent = 'Densité indicative après validation du calepinage (Wc/m²)';
          const note = manualDensityLabel.querySelector('small');
          if (note) note.textContent = 'Le repère toit plat Sud 140/155/175 Wc/m² ne s’applique pas au-delà de 15°. Valeur à saisir après validation du calepinage.';
        } else if (manualDensityLabel.firstChild) {
          manualDensityLabel.firstChild.textContent = 'Densité indicative saisie (Wc/m²)';
        }
      }
      const pitchLabel = document.getElementById('tilt')?.closest('label');
      if (pitchLabel) pitchLabel.hidden = flat;
    };
    updateManualTypeFields();
    manualType?.addEventListener('change', () => {
      manualSurfaceConfiguration.type = ['PITCHED', 'FLAT', ...extraSurfaceTypes.map(([value]) => value)].includes(manualType.value) ? manualType.value : '';
      updateManualTypeFields();
      if (manualType.value !== 'FLAT' && document.getElementById('tilt').value === 'Toit plat') document.getElementById('tilt').value = '';
      document.getElementById('tilt').dispatchEvent(new Event('change', { bubbles: true }));
      window.dispatchEvent(new CustomEvent('ozeno:roof-configurations-updated'));
    });
    manualMaterial?.addEventListener('change', () => {
      manualSurfaceConfiguration.material = roofMaterials.includes(manualMaterial.value) ? manualMaterial.value : '';
      window.dispatchEvent(new CustomEvent('ozeno:roof-configurations-updated'));
    });
    manualFlatTilt?.addEventListener('change', () => {
      manualSurfaceConfiguration.flatTilt = flatTilts.includes(manualFlatTilt.value) ? manualFlatTilt.value : '';
      updateManualTypeFields();
      window.dispatchEvent(new CustomEvent('ozeno:roof-configurations-updated'));
      calculateSynthesis();
    });
    manualDensityInput?.addEventListener('input', () => {
      const value = Number(manualDensityInput.value);
      manualSurfaceConfiguration.manualDensityWcM2 = Number.isFinite(value) && value >= 1 && value <= 1000 ? String(value) : '';
      calculateSynthesis();
    });
    document.getElementById('manualAzimuth')?.addEventListener('input', updateManualTypeFields);
  }

  async function calculateSynthesis() {
    syncRoofRatioReadout();
    const version = ++calculationVersion;
    climateCalculationController?.abort();
    climateCalculationController = null;
    emitClimateYieldPreview({ status: 'UNKNOWN', reason: 'CLIMATE_CALCULATION_IN_PROGRESS', canonical: false });
    const current = layers();
    const ratio = Number(document.getElementById('roofRatio')?.value || 0) / 100;
    const measuredGross = current.reduce((sum, layer) => sum + area(layer), 0);
    const roofAreaInput = document.getElementById('roofTotal');
    if (surfaceSource === 'none' && measuredGross > 0) surfaceSource = 'map';
    if (surfaceSource === 'map' && roofAreaInput && Number(roofAreaInput.value) !== measuredGross) roofAreaInput.value = measuredGross || '';
    const enteredGross = Number(roofAreaInput?.value);
    const gross = surfaceSource === 'manual' && Number.isFinite(enteredGross) && enteredGross > 0 ? enteredGross : surfaceSource === 'map' ? measuredGross : 0;
    const sourceNote = document.getElementById('roofAreaSourceNote');
    if (sourceNote) sourceNote.textContent = surfaceSource === 'manual'
      ? 'Surface saisie manuellement · elle remplace la mesure cartographique pour cet aperçu.'
      : surfaceSource === 'map'
        ? 'Surface mesurée sur la carte · vous pouvez la remplacer par une valeur connue.'
        : 'Saisissez la surface connue, ou tracez un contour pour la mesurer.';
    const manualSettings = document.getElementById('manualAreaSettings');
    if (manualSettings) manualSettings.hidden = current.length > 0;
    const emptySurfaceHint = document.querySelector('#roofSurfaceCards > .result, #roofSurfaces > .result');
    if (emptySurfaceHint) emptySurfaceHint.textContent = surfaceSource === 'manual' && gross > 0
      ? 'Surface connue renseignée sans contour. Le dessin sur la carte reste facultatif pour cet aperçu.'
      : 'Aucune surface ajoutée. Saisissez une valeur connue ou dessinez une zone sur la carte.';
    const geometryVersion = JSON.stringify({ roofs: current.map((layer) => layer.toGeoJSON?.().geometry || { areaM2: area(layer) }) }) || `MANUAL:${gross}`;
    const cr013Area = calculateCr013SolarUsableArea({ grossAreaM2: gross, fallbackPercent: ratio * 100, geometryVersion });
    lastCr013AreaResult = cr013Area;
    const usable = cr013Area.usableAreaM2;
    const selectedPanelReference = window.SOLARSHIFT_CONFIG?.selectedPanelReference || null;
    const panelPowerInput = Number(document.getElementById('panelWp')?.value);
    const modulePower = selectedPanelReference
      ? representativeModulePower(selectedPanelReference, 450)
      : Number.isFinite(panelPowerInput) && panelPowerInput > 0 ? panelPowerInput : 450;
    const panelAreaInput = Number(document.getElementById('panelArea')?.value);
    const defaultPanelArea = studyModuleReference.lengthM * studyModuleReference.widthM;
    const panelAreaM2 = Number(selectedPanelReference?.lengthM) > 0 && Number(selectedPanelReference?.widthM) > 0
      ? Number(selectedPanelReference.lengthM) * Number(selectedPanelReference.widthM)
      : Number.isFinite(panelAreaInput) && panelAreaInput > 0 ? panelAreaInput : defaultPanelArea;
    const aspectRatio = studyModuleReference.lengthM / studyModuleReference.widthM;
    const moduleLengthM = Number(selectedPanelReference?.lengthM) || Math.sqrt(panelAreaM2 * aspectRatio);
    const moduleWidthM = Number(selectedPanelReference?.widthM) || panelAreaM2 / moduleLengthM;
    const moduleDensityWcM2 = modulePowerDensityWcM2(modulePower, moduleLengthM, moduleWidthM);
    const densityForSelectedModule = (type, orientations, manualDensity, flatTilt) => limitDensityToModule(
      cr010DensityForSurface(type, orientations, manualDensity, flatTilt, { powerWc: modulePower, lengthM: moduleLengthM, widthM: moduleWidthM }), moduleDensityWcM2
    );
    const sizingAreas = surfaceSource === 'manual'
        ? [{ areaM2: usable, density: densityForSelectedModule(manualSurfaceConfiguration.type, [document.getElementById('manualAzimuth')?.value], manualSurfaceConfiguration.manualDensityWcM2, manualSurfaceConfiguration.flatTilt), requiresProjectDensity: requiresFlatSouthProjectDensity(manualSurfaceConfiguration.type, [document.getElementById('manualAzimuth')?.value], manualSurfaceConfiguration.manualDensityWcM2, manualSurfaceConfiguration.flatTilt) }]
      : current.map((layer) => {
        const config = configurations.get(L.stamp(layer));
        const orientations = config?.type === 'PITCHED' && Number(config.panCount) === 2
          ? [config.orientation, config.orientation2]
          : [config?.orientation];
        return { areaM2: area(layer) * ratio, density: densityForSelectedModule(config?.type, orientations, config?.manualDensityWcM2, config?.flatTilt), requiresProjectDensity: requiresFlatSouthProjectDensity(config?.type, orientations, config?.manualDensityWcM2, config?.flatTilt) };
      });
    const sizing = calculateCr010RoofSizing(sizingAreas);
    const capacity = sizing.referenceKwp || 0;
    const manualOrientation = normalizeAzimuth(document.getElementById('manualAzimuth')?.value);
    const manualTilt = document.getElementById('tilt')?.value || '';
    const manualShade = document.getElementById('shade')?.value || '';
    const manualAngle = manualSurfaceConfiguration.type === 'FLAT'
      ? flatTiltAngle(manualSurfaceConfiguration.flatTilt)
      : manualTilt === 'Toit plat' ? 10 : pitchAngle(manualTilt);
    const requestedLoss = Number(document.getElementById('pvgisSystemLoss')?.value);
    const lossPercent = Number.isFinite(requestedLoss) && requestedLoss >= 0 && requestedLoss <= 50 ? requestedLoss : 14;
    const surfacesConfigured = surfaceSource === 'manual'
      ? gross > 0 && Number.isFinite(manualAngle) && Number.isFinite(pvgisAspectFromAzimuth(manualOrientation)) && (!manualShade || Number.isFinite(shadeFactors[manualShade]))
      : current.length > 0 && current.every((layer) => isConfigured(configurations.get(L.stamp(layer))));
    const shadingSelections = surfaceSource === 'manual'
      ? [manualShade]
      : current.map((layer) => configurations.get(L.stamp(layer))?.shade);
    const shadingDescription = [...new Set(shadingSelections)].map((shade) => {
      if (!shade) return 'non renseigné (aucune réduction supplémentaire appliquée)';
      const reduction = Math.round((1 - shadeFactors[shade]) * 100);
      return `${shade.toLowerCase()} (−${reduction} % appliqués en plus)`;
    });
    const geometrySelections = surfaceSource === 'manual'
      ? (manualOrientation != null && Number.isFinite(manualAngle) ? [`${formatAzimuth(manualOrientation)}, ${manualAngle}°`] : [])
      : current.flatMap((layer) => {
        const config = configurations.get(L.stamp(layer));
        if (!isConfigured(config)) return [];
        const angle = config.type === 'FLAT' ? flatTiltAngle(config.flatTilt) : pitchAngle(config.pitch);
        const selectedOrientations = config.type === 'PITCHED' && Number(config.panCount) === 2 ? [config.orientation, config.orientation2] : [config.orientation];
        return selectedOrientations.filter((orientation) => normalizeAzimuth(orientation) != null).map((orientation) => `${formatAzimuth(orientation)}, ${angle}°`);
      });
    const geometryAzimuthNeedsConfirmation = surfaceSource !== 'manual' && current.some((layer) => {
      const config = configurations.get(L.stamp(layer));
      return config?.orientationSource === 'geometry-proposal' || config?.orientation2Source === 'geometry-proposal';
    });
    const mountingSelections = surfaceSource === 'manual'
      ? ['building']
      : current.map((layer) => pvgisMountingPlace(configurations.get(L.stamp(layer))?.type)).filter(Boolean);
    const mountingSummary = [...new Set(mountingSelections)].map((place) => place === 'building' ? 'bâtiment' : 'structure libre').join(' / ') || 'à préciser';
    const assumptionNode = document.getElementById('roofPvgisAssumptions');
    if (assumptionNode) {
      const geometry = [...new Set(geometrySelections)];
      assumptionNode.textContent = `Paramètres de comparaison : PVGIS 5.3 · SARAH-3 · silicium cristallin · montage ${mountingSummary} · pertes système ${lossPercent.toLocaleString('fr-FR')} %${geometry.length ? ` · orientation/pente : ${geometry.join(' ; ')}` : ''}${geometryAzimuthNeedsConfirmation ? ' · orientation géométrique proposée, à confirmer' : ''}. Les ombres proches sont une réduction indicative distincte (${shadingDescription.length ? shadingDescription.join(' ; ') : 'non renseignées'}).`;
    }
    const tiltAdvice = document.getElementById('roofTiltAdvice');
    const flatSurfaces = surfaceSource === 'manual'
      ? manualSurfaceConfiguration.type === 'FLAT' ? [{ id: 'manual', label: 'Surface saisie', orientation: manualOrientation, selectedTilt: flatTiltAngle(manualSurfaceConfiguration.flatTilt) }] : []
      : current.flatMap((layer, index) => {
        const config = configurations.get(L.stamp(layer));
        return config?.type === 'FLAT' ? [{ id: L.stamp(layer), label: `Surface ${index + 1}`, orientation: config.orientation, selectedTilt: flatTiltAngle(config.flatTilt) }] : [];
      });
    const pitchedSurfacesPresent = surfaceSource === 'manual'
      ? manualSurfaceConfiguration.type === 'PITCHED'
      : current.some((layer) => configurations.get(L.stamp(layer))?.type === 'PITCHED');
    if (tiltAdvice) { tiltAdvice.hidden = true; tiltAdvice.textContent = ''; }
    const tiltAdviceNode = (surface) => surface.id === 'manual'
      ? document.getElementById('manualPvgisTiltAdvice')
      : document.querySelector(`[data-roof-id="${surface.id}"] [data-pvgis-tilt-advice]`);
    flatSurfaces.forEach((surface) => {
      const node = tiltAdviceNode(surface);
      if (node) node.textContent = 'Recommandation PVGIS : calcul en cours…';
    });
    if (flatSurfaces.length && tiltAdvice) {
      const coords = projectCoordinates();
      if (!coords) flatSurfaces.forEach((surface) => { const node = tiltAdviceNode(surface); if (node) node.textContent = 'Recommandation PVGIS indisponible : coordonnées fiables du projet manquantes.'; });
      else {
        const [lat, lon] = coords;
        tiltAdvice.textContent = 'Recherche de l’inclinaison optimale PVGIS selon l’orientation des supports…';
        const optimalResults = await Promise.all(flatSurfaces.map(async (surface) => {
          const aspect = pvgisAspectFromAzimuth(surface.orientation);
          if (aspect == null) return { ...surface, error: 'Orientation des supports à renseigner.' };
          try {
            const optimum = await fetchPvgis(lat, lon, 10, aspect, lossPercent, 'building', { optimalInclination: true });
            return { ...surface, angle: optimum.optimalTiltDeg };
          } catch (error) { return { ...surface, error: error?.message || 'PVGIS indisponible.' }; }
        }));
        optimalResults.forEach((item) => {
          const node = tiltAdviceNode(item);
          if (!node) return;
          node.textContent = item.angle != null
            ? `Optimum PVGIS : ${item.angle.toLocaleString('fr-FR')}° pour cette orientation (meilleur productible spécifique). À comparer à la plage sélectionnée ; ce n’est pas un angle imposé.`
            : `Repère PVGIS indisponible (${item.error}). L’estimation reste calculée avec la plage choisie.`;
        });
      }
    }
    let annualProduction = 0;
    let monthlyProduction = Array(12).fill(0);
    let productionFailure = null;
    let climateRequest = null;
    if (capacity > 0 && surfacesConfigured) {
      const annualDisplay = document.getElementById('roofAnnual');
      if (annualDisplay) annualDisplay.textContent = 'Calcul PVGIS…';
      window.dispatchEvent(new CustomEvent('ozeno:commercial-production-preview', { detail: { status: 'UNKNOWN', reason: 'PVGIS_CALCULATION_IN_PROGRESS' } }));
      window.dispatchEvent(new CustomEvent('ozeno:pvgis-preview-status', { detail: { message: 'Calcul PVGIS en cours…' } }));
      const coords = projectCoordinates();
      if (coords) {
        const [lat, lon] = coords;
        const climatePlanes = surfaceSource === 'manual'
          ? [{ capacity_kwp: capacity, angle: manualAngle, aspect: pvgisAspectFromAzimuth(manualOrientation), mountingplace: pvgisMountingPlace(manualSurfaceConfiguration.type) || 'building', shade_factor: shadeFactors[manualShade] ?? 1 }]
          : current.flatMap((layer) => {
            const config = configurations.get(L.stamp(layer));
            const surfaceSizing = sizingAreas[current.indexOf(layer)];
            const surfaceCapacity = surfaceSizing?.density ? surfaceSizing.areaM2 * surfaceSizing.density.reference / 1000 : 0;
            const angle = config.type === 'FLAT' ? flatTiltAngle(config.flatTilt) : pitchAngle(config.pitch);
            const mountingplace = pvgisMountingPlace(config.type);
            const panOrientations = config.type === 'PITCHED' && Number(config.panCount) === 2 ? [config.orientation, config.orientation2] : [config.orientation];
            return panOrientations.map((orientation) => ({
              capacity_kwp: surfaceCapacity / panOrientations.length,
              angle,
              aspect: pvgisAspectFromAzimuth(orientation),
              mountingplace,
              shade_factor: shadeFactors[config.shade] ?? 1
            })).filter((plane) => plane.capacity_kwp > 0 && plane.aspect != null && plane.mountingplace != null);
          });
        const results = surfaceSource === 'manual' ? [await (async () => {
          try {
            const payload = await fetchPvgis(lat, lon, manualAngle, pvgisAspectFromAzimuth(manualOrientation), lossPercent, 'building');
            const factor = (shadeFactors[manualShade] ?? 1) * capacity;
            return { annual: payload.annual * factor, monthly: payload.monthly.map((value) => value * factor) };
          } catch (error) {
            productionFailure = error?.message || 'PVGIS indisponible';
            return null;
          }
        })()] : await Promise.all(current.map(async (layer) => {
          const config = configurations.get(L.stamp(layer));
          const surfaceSizing = sizingAreas[current.indexOf(layer)];
          const surfaceCapacity = surfaceSizing?.density ? surfaceSizing.areaM2 * surfaceSizing.density.reference / 1000 : 0;
          try {
            const angle = config.type === 'FLAT' ? flatTiltAngle(config.flatTilt) : pitchAngle(config.pitch);
            const mountingplace = pvgisMountingPlace(config.type);
            const panOrientations = config.type === 'PITCHED' && Number(config.panCount) === 2 ? [config.orientation, config.orientation2] : [config.orientation];
            const panResults = await Promise.all(panOrientations.map(async (orientation) => {
              const payload = await fetchPvgis(lat, lon, angle, pvgisAspectFromAzimuth(orientation), lossPercent, mountingplace);
              const capacityShare = surfaceCapacity / panOrientations.length;
              return {
                annual: payload.annual * (shadeFactors[config.shade] ?? 1) * capacityShare,
                monthly: payload.monthly.map((value) => value * (shadeFactors[config.shade] ?? 1) * capacityShare)
              };
            }));
            return panResults.reduce((sum, value) => ({ annual: sum.annual + value.annual, monthly: sum.monthly.map((month, index) => month + value.monthly[index]) }), { annual: 0, monthly: Array(12).fill(0) });
          } catch (error) {
            productionFailure = error?.message || 'PVGIS indisponible';
            return null;
          }
        }));
        annualProduction = results.every((value) => value && Number.isFinite(value.annual) && value.monthly.length === 12 && value.monthly.every(Number.isFinite))
          ? results.reduce((sum, value) => sum + value.annual, 0)
          : 0;
        if (annualProduction) monthlyProduction = results.reduce((months, value) => months.map((month, index) => month + value.monthly[index]), Array(12).fill(0));
        if (annualProduction && climatePlanes.length) climateRequest = { latitude: lat, longitude: lon, planes: climatePlanes };
      } else productionFailure = 'COORDINATES_MISSING';
    }
    if (version !== calculationVersion) return;
    const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
    const usableLabel = usable ? `${Math.round(usable).toLocaleString('fr-FR')} m²` : 'À calculer';
    set('terrainUsable', usableLabel);
    const moduleCount = estimatedPanelCount(sizing.referenceKwp, modulePower);
    const countLabel = moduleCount
      ? `${moduleCount.toLocaleString('fr-FR')} panneaux · estimation centrale ${sizing.referenceKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc ÷ ${modulePower.toLocaleString('fr-FR')} Wc/panneau`
      : 'À calculer';
    set('terrainPanelCount', countLabel);
    const densityWasCapped = sizingAreas.some((item) => item.density?.cappedByModule);
    const sizingReference = document.getElementById('terrainSizingReference');
    if (sizingReference) {
      const capacityText = sizing.referenceKwp > 0
        ? `${sizing.lowKwp != null ? `Puissance estimée : ${sizing.lowKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}–${sizing.highKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc · ` : ''}${sizing.referenceKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc au scénario central`
        : 'Puissance à calculer';
      sizingReference.textContent = `${capacityText}${sizing.layoutWarning ? ' · estimation géométrique des rangées, à valider par calepinage' : ''}`;
    }
    set('roofUsableAreaInline', usableLabel);
    set('roofUsableAreaProvenance', cr013Area.status === 'VERIFIED'
      ? `Surface brute moins les zones confirmées et les marges · ${gross > 0 ? (usable / gross * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : 0} % retenus · taux forfaitaire non appliqué · pré-étude`
      : cr013Area.status === 'ASSUMPTION'
      ? `${cr013Area.fallbackPercent} % de la surface brute · hypothèse modifiable · pré-étude non validée`
      : 'Surface brute inconnue · surface exploitable à préciser');
    set('terrainCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    set('terrainProduction', annualProduction ? `${Math.round(annualProduction).toLocaleString('fr-FR')} kWh/an` : 'À calculer');
    set('terrainRoofYield', annualProduction && usable > 0 ? `${Math.round(annualProduction / usable).toLocaleString('fr-FR')} kWh/m²/an` : 'À calculer');
    set('roofCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    set('roofAnnual', annualProduction ? `${Math.round(annualProduction).toLocaleString('fr-FR')} kWh/an` : 'À calculer');
    let sizingSummary = document.getElementById('roofSizingSummary');
    if (!sizingSummary) {
      const metrics = document.querySelector('.roofMetrics');
      if (metrics?.insertAdjacentHTML) {
        metrics.insertAdjacentHTML('afterend', '<p id="roofSizingSummary" class="fine roofSizingSummary" aria-live="polite"></p>');
        sizingSummary = document.getElementById('roofSizingSummary');
      }
    }
    if (sizingSummary) sizingSummary.textContent = sizing.status === 'ESTIMATED'
        ? `Estimation préliminaire sans proposition d’installateur : surface exploitable × densités LOW / référence / HIGH selon la typologie et l’orientation. Fourchette indicative de puissance : ${sizing.lowKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}–${sizing.highKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc ; le scénario de référence à ${sizing.referenceKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc alimente l’aperçu PVGIS. Ce résultat n’est pas un calepinage ni une puissance validée ; l’installateur doit confirmer les modules et leur implantation.`
      : sizing.status === 'ESTIMATED_PRELIMINARY_LAYOUT'
        ? `Estimation préliminaire sans proposition d’installateur : corridor indicatif ${sizing.lowKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}–${sizing.highKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc ; ${sizing.referenceKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc alimentent l’aperçu PVGIS. Pour les supports Sud inclinés à plus de 15°, le corridor utilise une géométrie simplifiée d’espacement des rangées et devra être confirmé par l’installateur.`
      : sizing.status === 'ESTIMATED_MANUAL'
        ? `Estimation préliminaire : ${sizing.referenceKwp.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc calculés avec la densité saisie pour cette surface. Valeur ponctuelle, sans corridor de référence pour cette typologie ; à confirmer par l’installateur.${sizing.layoutWarning ? ' Inclinaison Sud supérieure à 15° : calepinage à confirmer.' : ''}`
        : `Estimation en attente : choisissez une typologie de toiture référencée ou saisissez une densité indicative (Wc/m²).`;
    set('dashCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    const roofResult = document.getElementById('roofResult');
    if (roofResult) {
      roofResult.className = 'result roofMapStatus';
      roofResult.setAttribute('role', 'status');
      roofResult.setAttribute('aria-live', 'polite');
      roofResult.textContent = surfaceSource === 'manual' && gross > 0
        ? `Surface renseignée manuellement · ${gross.toLocaleString('fr-FR')} m². Le tracé d’un contour reste facultatif pour cet aperçu.`
        : current.length
          ? `${current.length} surface(s) tracée(s) · ${gross.toLocaleString('fr-FR')} m² bruts. Vérifiez chaque contour avant d’utiliser l’estimation.`
          : 'Aucune surface connue. Saisissez une valeur ou dessinez une zone sur la carte.';
    }
    let productionStatusMessage = null;
    if (annualProduction && capacity) {
      const solarYield = Math.round(annualProduction / capacity);
      set('dashPerformance', `${solarYield.toLocaleString('fr-FR')} kWh/kWc/an`);
      const performanceNote = document.getElementById('dashPerformance')?.nextElementSibling;
      if (performanceNote) performanceNote.textContent = 'Rendement PVGIS pondéré selon les surfaces, orientations, pentes et ombrages.';
      set('studyYield', `${solarYield.toLocaleString('fr-FR')} kWh/kWc/an`);
    } else {
      set('dashPerformance', 'UNKNOWN · estimation indisponible');
      set('studyYield', 'UNKNOWN');
      set('studyAnnual', 'UNKNOWN');
      const message = !gross
        ? 'Aperçu en attente : renseignez une surface connue ou tracez une zone sur la carte.'
        : !capacity
          ? 'Aperçu en attente : sélectionnez une famille de toiture référencée ou saisissez une densité indicative (Wc/m²) pour cette surface.'
          : !surfacesConfigured
            ? surfaceSource === 'manual'
              ? 'Aperçu en attente : complétez l’orientation, la pente et l’ombrage sous la surface saisie.'
              : 'Aperçu en attente : complétez le type, l’orientation et la pente connus pour chaque surface. L’ombrage reste facultatif.'
            : window.SOLARSHIFT_CONFIG?.canonicalConnectionExpected && !window.SOLARSHIFT_CONFIG?.projectCoordinates
              ? 'Aperçu PVGIS indisponible : les coordonnées canoniques du projet manquent.'
              : productionFailure === 'COORDINATES_MISSING'
                ? 'Aperçu PVGIS indisponible : aucune coordonnée confirmée n’est associée à ce brouillon. Choisissez l’adresse officielle proposée, saisissez des coordonnées GPS ou placez un repère sur la carte.'
              : productionFailure
                ? `Aperçu PVGIS indisponible : ${productionFailure}`
              : 'Aperçu PVGIS indisponible : vérifiez la connexion et réessayez.';
      productionStatusMessage = message;
    }
    const productionStatus = document.getElementById('terrainProductionStatus');
    if (productionStatus) {
      productionStatus.textContent = annualProduction
        ? 'Estimation indicative calculée à partir des hypothèses de surfaces et de PVGIS.'
        : productionStatusMessage || 'Production en attente : vérifiez la localisation et les hypothèses de toiture.';
      productionStatus.dataset.state = annualProduction ? 'ready' : 'pending';
    }
    const capexPerKwp = Number(document.getElementById('capexPerKwp')?.value || 0);
    const capex = document.getElementById('capex');
    if (capex) {
      const solarBaseCapex = capacity > 0 && capexPerKwp > 0 ? Math.round(capacity * capexPerKwp) : '';
      if (!capex.dataset) capex.dataset = {};
      capex.dataset.solarBaseCapex = String(solarBaseCapex);
      capex.value = solarBaseCapex;
      capex.dispatchEvent(new Event('input'));
    }
    const surfaceInput = document.getElementById('surface'); if (surfaceInput) surfaceInput.value = Math.round(usable) || '';
    const annualInput = document.getElementById('annual');
    if (annualInput) { annualInput.value = annualProduction > 0 ? Math.round(annualProduction) : ''; annualInput.dispatchEvent(new Event('input')); }
    set('dashRoof', usable > 0 ? `${Math.round(usable).toLocaleString('fr-FR')} m²` : 'À calculer');
    const dashRoofLabel = document.getElementById('dashRoof')?.previousElementSibling;
    if (dashRoofLabel) dashRoofLabel.textContent = 'Surface retenue pour dimensionnement';
    set('dashProd', annualProduction > 0 ? `${Math.round(annualProduction).toLocaleString('fr-FR')} kWh` : 'À calculer');
    const maximumMonth = Math.max(...monthlyProduction, 1);
    document.querySelectorAll('.decisionBottom .bars i').forEach((bar, index) => {
      bar.style.height = annualProduction > 0 ? `${100 * monthlyProduction[index] / maximumMonth}%` : '0%';
      bar.title = annualProduction > 0 ? `Mois ${index + 1} · ${Math.round(monthlyProduction[index]).toLocaleString('fr-FR')} kWh estimés` : `Mois ${index + 1} · profil en attente`;
    });
    const preview = { status: annualProduction > 0 ? 'READY' : 'UNKNOWN', annualKwh: annualProduction > 0 ? Math.round(annualProduction) : null, monthlyKwh: annualProduction > 0 ? monthlyProduction.map((value) => Math.round(value)) : null, specificYieldKwhKwp: annualProduction > 0 && capacity > 0 ? Math.round(annualProduction / capacity) : null, installedCapacityKwp: capacity || null, sizing: { status: sizing.status, version: sizing.version, lowKwp: sizing.lowKwp, referenceKwp: sizing.referenceKwp, highKwp: sizing.highKwp, basis: sizing.status === 'ESTIMATED_MANUAL' ? 'USER_INDICATIVE_INPUT' : 'CR010_REFERENCE' }, source: 'PVGIS_PREVIEW', canonical: false };
    window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    window.SOLARSHIFT_CONFIG.commercialProductionPreview = preview;
    window.dispatchEvent(new CustomEvent('ozeno:commercial-production-preview', { detail: preview }));
    if (climateRequest && annualProduction) requestClimateYieldPreview(version, climateRequest.latitude, climateRequest.longitude, lossPercent, climateRequest.planes);
    else emitClimateYieldPreview({ status: 'UNKNOWN', reason: productionFailure || 'PRODUCTION_PREVIEW_REQUIRED', canonical: false });
    // The production-study listener uses the preview event to render a generic
    // pending state. Dispatch the detailed diagnosis afterwards so it remains
    // visible instead of being overwritten by that fallback message.
    if (productionStatusMessage) {
      window.dispatchEvent(new CustomEvent('ozeno:pvgis-preview-status', { detail: { message: productionStatusMessage } }));
    }
  }

  function bindInstallerDocumentUpload(container) {
    const input = container.querySelector('#roofInstallerFiles');
    const uploadButton = container.querySelector('#roofInstallerUpload');
    const status = container.querySelector('#roofInstallerUploadStatus');
    const list = container.querySelector('#roofInstallerDocumentList');
    if (!input || !uploadButton || !status || !list) return;
    const loadExisting = async () => {
      const config = window.SOLARSHIFT_CONFIG || {};
      if (!config.projectId || !config.getAccessToken) return;
      try {
        const token = await config.getAccessToken();
        if (!token) return;
        const response = await fetch(`${config.projectDocumentEndpoint || `${config.supabaseUrl}/functions/v1/upload-project-document`}?projectId=${encodeURIComponent(config.projectId)}`, {
          headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${token}` }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
        list.replaceChildren();
        for (const file of payload.documents || []) {
          const item = document.createElement('li');
          if (file.downloadUrl) {
            const link = document.createElement('a');
            link.href = file.downloadUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = file.fileName || 'Document projet';
            item.append(link);
          } else item.textContent = file.fileName || 'Document projet';
          item.append(document.createTextNode(` · ${new Date(file.uploadedAt).toLocaleDateString('fr-FR')}`));
          list.append(item);
        }
      } catch {
        // Keep the upload form available; listing errors must not hide other project fields.
      }
    };
    loadExisting();
    window.addEventListener('ozeno:project-context-loaded', loadExisting);
    uploadButton.addEventListener('click', async () => {
      const files = [...(input.files || [])];
      if (!files.length) { status.textContent = 'Sélectionnez au moins un fichier.'; return; }
      const config = window.SOLARSHIFT_CONFIG || {};
      if (!config.projectId || !config.getAccessToken) {
        status.textContent = 'Enregistrement indisponible pour un brouillon local : ouvrez un projet partagé et connectez-vous pour joindre les fichiers au dossier.';
        return;
      }
      uploadButton.disabled = true;
      const documentType = container.querySelector('#roofInstallerDocumentType')?.value || 'INSTALLER_STUDY';
      try {
        const token = await config.getAccessToken();
        if (!token) throw new Error('Votre session a expiré. Reconnectez-vous, puis réessayez.');
        status.textContent = `Envoi de ${files.length} fichier(s) au dossier projet…`;
        for (const file of files) {
          const form = new FormData();
          form.set('projectId', config.projectId);
          form.set('documentType', documentType);
          form.set('file', file, file.name);
          const response = await fetch(config.projectDocumentEndpoint || `${config.supabaseUrl}/functions/v1/upload-project-document`, {
            method: 'POST',
            headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${token}` },
            body: form
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || `Échec de l’envoi de ${file.name} (${response.status}).`);
          const item = document.createElement('li');
          item.textContent = `${payload.fileName || file.name} · ajouté au dossier le ${new Date(payload.uploadedAt || Date.now()).toLocaleString('fr-FR')}`;
          list.prepend(item);
        }
        input.value = '';
        await loadExisting();
        status.textContent = 'Document(s) ajouté(s) au projet. Ils sont conservés dans son espace documentaire privé.';
      } catch (error) {
        status.textContent = `Ajout non confirmé : ${error.message}`;
      } finally {
        uploadButton.disabled = false;
      }
    });
  }

  function installTerrainSummary() {
    const terrain = document.getElementById('audit-solar');
    const roof = document.getElementById('audit-roof');
    if (!terrain || !roof || document.getElementById('roofEstimate')) return;
    ['surface', 'orientation', 'tilt', 'shade'].forEach((id) => document.getElementById(id)?.closest('label')?.setAttribute('hidden', 'hidden'));
    const oldSummary = terrain.querySelector('#terrainRoofSummary');
    oldSummary?.remove();
    const metrics = roof.querySelector('.roofMetrics');
    const surfaces = roof.querySelector('#roofSurfaces');
    if (!metrics || !surfaces) return;
    const surfaceDetails = installRoofAreaDetails(roof, surfaces);
    roofStateLabel = document.getElementById('roof')?.closest('label') || null;
    roofStateLabel?.removeAttribute('hidden');
    const estimate = document.createElement('section');
    estimate.id = 'roofEstimate';
    estimate.innerHTML = '<h3>Performance solaire indicative</h3><p class="fine">Aperçu commercial PVGIS · non canonique. Il dépend des surfaces et hypothèses saisies et n’est pas enregistré au projet.</p><p id="roofTiltAdvice" class="roofTiltAdvice" role="status" aria-live="polite" hidden></p>';
    const pvgisAssumptions = document.getElementById('roofPvgisAssumptions') || document.createElement('p');
    pvgisAssumptions.id = 'roofPvgisAssumptions';
    pvgisAssumptions.className = 'fine';
    estimate.appendChild(pvgisAssumptions);
    const usableMetric = document.createElement('div');
    usableMetric.className = 'metric';
    usableMetric.innerHTML = '<b>Surface exploitable estimée</b><span id="terrainUsable">À calculer</span>';
    metrics.insertBefore(usableMetric, metrics.firstChild);
    const roofYieldMetric = document.createElement('div');
    roofYieldMetric.className = 'metric';
    roofYieldMetric.innerHTML = '<b>Production par surface exploitable</b><span id="terrainRoofYield">À calculer</span><small>Production annuelle ÷ surface exploitable</small>';
    metrics.appendChild(roofYieldMetric);
    const panelPowerInput = document.getElementById('panelWp');
    if (panelPowerInput) {
      const selectedPanelReference = window.SOLARSHIFT_CONFIG?.selectedPanelReference || null;
      panelPowerInput.value = String(selectedPanelReference ? representativeModulePower(selectedPanelReference, 450) : 450);
    }
    const panelAreaInput = document.getElementById('panelArea');
    if (panelAreaInput) {
      const selectedPanelReference = window.SOLARSHIFT_CONFIG?.selectedPanelReference || null;
      const selectedArea = Number(selectedPanelReference?.lengthM) * Number(selectedPanelReference?.widthM);
      if (Number.isFinite(selectedArea) && selectedArea > 0) panelAreaInput.value = selectedArea.toFixed(3);
      else if (!Number(panelAreaInput.value) || Number(panelAreaInput.value) === 2) panelAreaInput.value = '2.211';
      panelAreaInput.step = '0.001';
    }
    const panelHypotheses = roof.querySelector('.roofExpertSettings .form');
    if (panelHypotheses && !document.getElementById('terrainPanelCount')) {
      const panelEstimate = document.createElement('div');
      panelEstimate.className = 'roofPanelCountEstimate';
      panelEstimate.innerHTML = '<h4>Estimation préliminaire de puissance photovoltaïque</h4><p>Sans proposition d’installateur : estimation selon la surface exploitable, la typologie du toit et la puissance nominale du module. Le corridor indicatif n’est pas un calepinage validé.</p><div class="roofSizingTopline"><div class="roofSizingControl" id="roofLossControl"></div><div class="roofSizingControl" id="roofModulePowerControl"></div><div class="roofSizingControl" id="roofModuleAreaControl"></div><div class="roofSizingControl roofPanelCount"><b>Nombre de panneaux estimé</b><output id="terrainPanelCount" aria-live="polite">À calculer</output><small id="terrainSizingReference">Puissance centrale et fourchette estimées.</small></div></div><details class="roofSizingReferences" id="roofSizingReferences"><summary>Références utilisées par le calculateur</summary><p>Toiture inclinée, modules parallèles au rampant : 195 / 210 / 220 Wc/m² (LOW / référence / HIGH). Toit plat Est/Ouest : 175 / 190 / 205 Wc/m². Toit plat Sud jusqu’à 15° : 140 / 155 / 175 Wc/m².</p><p>Au-delà de 15° pour des supports Sud sur terrasse, le corridor est calculé par géométrie simplifiée des rangées : longueur du module, inclinaison choisie et hypothèses de hauteur solaire minimale 20° / 25° / 30° (LOW / référence / HIGH). Cette hypothèse permet une pré-estimation sans calepinage, mais doit être remplacée ou confirmée par la proposition de l’installateur. Les ratios s’appliquent à la surface solaire exploitable, après exclusions.</p></details><section class="roofInstallerStudy" aria-labelledby="roofInstallerStudyTitle"><h5 id="roofInstallerStudyTitle">Étude et documents de l’installateur</h5><p>Ajoutez ici le devis, l’étude de production, le calepinage et les documents techniques proposés par l’installateur. Ils seront conservés dans le dossier du projet.</p><label for="roofInstallerDocumentType">Type de document</label><select id="roofInstallerDocumentType"><option value="INSTALLER_STUDY">Étude installateur</option><option value="INSTALLER_QUOTE">Devis</option><option value="PV_LAYOUT">Calepinage</option><option value="INSTALLER_PRODUCTION">Étude de production</option><option value="OTHER_PROJECT_DOCUMENT">Autre document projet</option></select><label class="roofDocumentPicker" for="roofInstallerFiles">Fichiers à joindre<input id="roofInstallerFiles" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"></label><button type="button" id="roofInstallerUpload">Joindre au projet</button><p id="roofInstallerUploadStatus" class="fine" role="status" aria-live="polite">Connectez-vous et ouvrez un projet partagé pour enregistrer des documents au dossier.</p><ul id="roofInstallerDocumentList" aria-live="polite"></ul></section>';
      const moduleInputLabel = document.getElementById('panelWp')?.closest('label');
      if (moduleInputLabel) {
        const input = moduleInputLabel.querySelector('input');
        moduleInputLabel.textContent = 'Puissance nominale utilisée pour estimer la quantité (Wc)';
        if (input) moduleInputLabel.append(input);
        const hint = document.createElement('small');
        const selectedPanelReference = window.SOLARSHIFT_CONFIG?.selectedPanelReference || null;
        hint.textContent = selectedPanelReference
          ? `${selectedPanelReference.model || 'Panneau sélectionné'} · ${representativeModulePower(selectedPanelReference, 450)} Wc retenus.`
          : 'Valeur de travail modifiable ; 450 Wc par défaut tant qu’aucune référence n’est sélectionnée.';
        moduleInputLabel.append(hint);
        moduleInputLabel.removeAttribute('hidden');
        panelEstimate.querySelector('#roofModulePowerControl')?.append(moduleInputLabel);
      }
      const panelAreaLabel = document.getElementById('panelArea')?.closest('label');
      if (panelAreaLabel) {
        const areaInput = panelAreaLabel.querySelector('input');
        panelAreaLabel.textContent = 'Surface du panneau (m²)';
        if (areaInput) panelAreaLabel.append(areaInput);
        const hint = document.createElement('small');
        const selectedPanelReference = window.SOLARSHIFT_CONFIG?.selectedPanelReference || null;
        const length = Number(selectedPanelReference?.lengthM) || studyModuleReference.lengthM;
        const width = Number(selectedPanelReference?.widthM) || studyModuleReference.widthM;
        hint.textContent = `${selectedPanelReference ? 'Dimensions du panneau sélectionné' : 'Exemple DMEGC'} : ${Math.round(length * 1000)} × ${Math.round(width * 1000)} mm ; ${Number(areaInput?.value || length * width).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} m².`;
        panelAreaLabel.append(hint);
        panelAreaLabel.removeAttribute('hidden');
        panelEstimate.querySelector('#roofModuleAreaControl')?.append(panelAreaLabel);
      }
      const lossLabel = document.getElementById('pvgisSystemLoss')?.closest('label');
      if (lossLabel) {
        lossLabel.removeAttribute('hidden');
        panelEstimate.querySelector('#roofLossControl')?.append(lossLabel);
      }
      panelEstimate.querySelectorAll('.roofSizingControl label').forEach((label) => {
        const title = document.createElement('span');
        title.className = 'roofSizingLabelTitle';
        const titleText = document.createElement('span');
        titleText.className = 'roofSizingLabelText';
        [...label.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).forEach((node) => {
          titleText.append(document.createTextNode(node.textContent.trim()));
          node.remove();
        });
        if (titleText.textContent.trim()) title.append(titleText);
        const help = label.querySelector('.pvgisLossHelp');
        if (help) title.append(help);
        if (title.textContent.trim()) label.insertBefore(title, label.firstChild);
      });
      panelHypotheses.appendChild(panelEstimate);
      bindInstallerDocumentUpload(panelEstimate);
    }
    metrics.querySelectorAll('.metric b').forEach((label) => {
      if (label.textContent.includes('Puissance installée')) label.textContent = 'Puissance installée estimée';
      if (label.textContent.includes('Production annuelle moyenne')) label.textContent = 'Production annuelle estimée';
    });
    const inputSectionEnd = roof.querySelector(':scope > .roofExpertSettings') || roofForm || surfaces;
    inputSectionEnd.insertAdjacentElement('afterend', estimate);
    estimate.appendChild(metrics);
    const productionStatus = document.createElement('p');
    productionStatus.id = 'terrainProductionStatus';
    productionStatus.className = 'roofProductionStatus fine';
    productionStatus.setAttribute('role', 'status');
    productionStatus.setAttribute('aria-live', 'polite');
    productionStatus.textContent = 'Production en attente : vérifiez la localisation et les hypothèses de toiture.';
    estimate.appendChild(productionStatus);
    const map = roof.querySelector('#map');
    const mapStatus = roof.querySelector('#roofResult');
    if (map && mapStatus) {
      mapStatus.classList.add('roofMapStatus');
      mapStatus.setAttribute('role', 'status');
      mapStatus.setAttribute('aria-live', 'polite');
      map.insertAdjacentElement('afterend', mapStatus);
    }
    const moveProductionStudy = () => {
      const study = document.querySelector('.productionStudy');
      if (!study || estimate.contains(study)) return;
      study.classList.add('productionStudyEmbedded');
      const title = study.querySelector('.sectionTitle h2');
      if (title) title.textContent = 'Profil mensuel et références';
      const titleBar = title?.closest('.sectionTitle');
      const yieldMetric = study.querySelector('#studyYield')?.closest('.metric');
      study.querySelectorAll('.metric').forEach((metric) => { if (metric !== yieldMetric) metric.remove(); });
      if (yieldMetric) {
        const label = yieldMetric.querySelector('b, small');
        const note = yieldMetric.querySelector('small:last-child');
        if (label) label.textContent = 'Rendement spécifique estimé';
        if (note) note.textContent = 'PVGIS · kWh/kWc/an';
        metrics.appendChild(yieldMetric);
      }
      study.querySelector('.metrics, .productionStudyGrid')?.remove();
      study.querySelector('.hint')?.remove();
      const monthlyHeading = study.querySelector('h3');
      if (monthlyHeading) monthlyHeading.textContent = 'Profil mensuel estimé';
      if (titleBar) estimate.insertBefore(titleBar, estimate.querySelector('.fine') || metrics);
      estimate.appendChild(study);
    };
    moveProductionStudy();
    if (!estimate.querySelector('.productionStudy')) {
      const observer = new MutationObserver(() => {
        moveProductionStudy();
        if (estimate.querySelector('.productionStudy')) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    const performanceStep = document.querySelector('.auditJourney a[href="#audit-solar"], .auditJourney button[data-stage-target="audit-solar"]');
    if (performanceStep?.tagName === 'A') performanceStep.setAttribute('href', '#roofEstimate');
    else if (performanceStep) performanceStep.dataset.stageTarget = 'roofEstimate';
    terrain.hidden = true;
    roof.querySelector(':scope > .fine')?.remove();
  }

  function boot() {
    if (!window.solarMap || !window.roofGroup) return;
    configureManualSlopeSelector();
    orientationLayerGroup = L.layerGroup().addTo(window.solarMap);
    const style = document.createElement('style');
    style.textContent = '.roofSurfaceHeader,.roofSurfaceTitle{display:flex;justify-content:space-between;align-items:center;gap:12px}.roofSurfaceHeader{margin:15px 0 5px}.roofSurfaceHeader p{margin:3px 0}.roofDetectionStatus{min-height:18px;margin:0 0 8px}.roofDetectionStatus[data-state="success"]{color:#08734c}.roofDetectionStatus[data-state="error"]{color:#7d201b}.roofCandidateChoices{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px}.roofCandidateChoices button{border:1px solid #87b6a0;border-radius:6px;background:white;color:#08734c;padding:6px 9px;font:inherit;cursor:pointer}.roofMapStatus{margin:10px 0}.roofDetectionReady.leaflet-grab,.roofDetectionReady .leaflet-interactive{cursor:pointer}.leaflet-editing-icon{width:16px!important;height:16px!important;margin-left:-8px!important;margin-top:-8px!important;border:2px solid #08734c!important;border-radius:50%!important;background:#fff!important}.roofSurfaceList{display:grid;gap:10px}.roofSurface{border:1px solid #cfe0d5;border-radius:9px;padding:12px;background:#f7faf8}.roofSurface .form{margin-top:9px;grid-template-columns:repeat(4,1fr)}.roofAzimuthControl{display:flex;gap:6px;align-items:stretch}.roofAzimuthControl input{min-width:0;flex:1}.roofPickAzimuth,.roofProposeAzimuth,.roofAzimuthChoices button{border:1px solid #87b6a0;border-radius:7px;background:#fff;color:#08734c;padding:7px 10px;font:inherit;cursor:pointer;white-space:nowrap}.roofPickAzimuth:hover,.roofProposeAzimuth:hover,.roofAzimuthChoices button:hover{background:#edf7f0}.roofAzimuthProposal{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:9px}.roofAzimuthProposal .fine{margin:0}.roofAzimuthChoices{display:flex;align-items:center;flex-wrap:wrap;gap:7px;width:100%}.roofAzimuthChoices[hidden]{display:none}.roofAzimuthArrowIcon{background:transparent;border:0}.roofAzimuthArrowIcon svg{width:24px;height:24px;overflow:visible;stroke:#063d30;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;fill:#f6ae2d;filter:drop-shadow(0 1px 2px #fff)}#roofTotal[readonly]{background:#f4f8f5;color:#315c4b;cursor:default}.roofDelete{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border:1px solid #d6a4a0;background:#fff;color:#7d201b;border-radius:8px;padding:7px;cursor:pointer}.roofDelete:hover,.roofDelete:focus-visible{background:#fff0ef;border-color:#b84a43;outline:2px solid #b84a4333}.roofDelete svg{display:block;width:20px;height:20px;fill:currentColor}#roofEstimate{margin:16px 0 18px;padding:14px;border:1px solid #cfe0d5;border-radius:9px;background:#f8fbf9}#roofEstimate h3{margin:0 0 5px;color:#0a3f2d}#roofEstimate>.fine{margin:0 0 8px}#roofEstimate .roofMetrics{grid-template-columns:repeat(4,minmax(0,1fr));margin:10px 0 0}#roofEstimate .metric small{display:block;color:#587469;font-size:12px}.productionStudyEmbedded{margin:14px 0 0;padding:12px 0 0;border:0;border-top:1px solid #cfe0d5;border-radius:0;background:transparent;box-shadow:none}.productionStudyEmbedded .sectionTitle{margin-bottom:6px}.productionStudyEmbedded .hint{margin-top:4px}@media(max-width:760px){.roofSurfaceHeader{align-items:stretch;flex-direction:column}.roofSurfaceTitle{align-items:center;flex-direction:row}.roofSurface .form,#roofEstimate .roofMetrics{grid-template-columns:1fr}.roofAzimuthControl{flex-wrap:wrap}.roofAzimuthControl .roofPickAzimuth{width:100%}.leaflet-draw-actions{max-width:calc(100vw - 115px);display:flex;flex-wrap:wrap}.leaflet-draw-actions a{white-space:nowrap}.leaflet-editing-icon{width:20px!important;height:20px!important;margin-left:-10px!important;margin-top:-10px!important}}';
    document.head.appendChild(style);
    const interactionStyle = document.createElement('style');
    interactionStyle.textContent = '.roofSurfaceActions{display:flex;gap:7px}.roofEdit,.roofDelete{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border-radius:8px;padding:7px;cursor:pointer;background:#fff}.roofEdit{border:1px solid #87b6a0;color:#08734c}.roofEdit:hover,.roofEdit:focus-visible{background:#edf7f0;outline:2px solid #08734c33}.roofEdit svg,.roofDelete svg{display:block;width:20px;height:20px;fill:currentColor}#roofThinking{position:absolute;inset:0;z-index:800;display:grid;place-items:center;background:#062f3c66;pointer-events:none}#roofThinking[hidden]{display:none!important}.roofThinkingCard{display:flex;align-items:center;gap:11px;background:#fff;color:#062f3c;border-radius:10px;padding:13px 16px;font-weight:700;box-shadow:0 5px 20px #0005}.roofSpinner{width:23px;height:23px;border:3px solid #cfe0d5;border-top-color:#08734c;border-radius:50%;animation:roofSpin .8s linear infinite}@keyframes roofSpin{to{transform:rotate(360deg)}}';
    interactionStyle.textContent += '#roofAreaSourceNote{display:block;margin-top:5px;color:#587469;font-size:12px;font-weight:400}#manualAreaSettings{margin:12px 0;padding:13px 15px;border:1px solid #cfe0d5;border-radius:9px;background:#f8fbf9}#manualAreaSettings[hidden]{display:none}#manualAreaSettings h3{margin:0 0 5px;color:#0a3f2d}#manualAreaSettings .fine{margin:0 0 12px}#manualAreaSettings .form{grid-template-columns:repeat(3,minmax(0,1fr))}@media(max-width:760px){#manualAreaSettings .form{grid-template-columns:1fr}}';
    document.head.appendChild(interactionStyle);
    const orientationStyle = document.createElement('style');
    orientationStyle.textContent = '.roofSurface .form{grid-template-columns:repeat(2,minmax(0,1fr))}.roofAzimuthControl input{min-width:86px}.roofAzimuthControl .roofPickAzimuth,.roofAzimuthControl .roofProposeAzimuth{padding:6px 7px;font-size:14px}.roofAzimuthChoices{margin-top:7px}.roofNorthCompass{position:absolute;right:12px;bottom:34px;z-index:650;pointer-events:none;display:grid;justify-items:center;gap:0;min-width:40px;padding:4px 7px;border:1px solid #cfe0d5;border-radius:8px;background:#fffF;box-shadow:0 1px 5px #0003;color:#062f3c;font-size:12px;font-weight:800;line-height:1}.roofNorthCompass svg{display:block;width:19px;height:22px;fill:#08734c}.roofOrientationPicking{cursor:crosshair!important}.roofOrientationPicking .leaflet-interactive{cursor:crosshair!important}@media(max-width:760px){.roofSurface .form{grid-template-columns:1fr}.roofAzimuthControl .roofProposeAzimuth{width:100%}.roofNorthCompass{right:10px;bottom:32px}}';
    orientationStyle.textContent += '#roofSurfaces{display:grid;gap:10px}#roofSurfaceGeneral{margin:10px 0 0}#roofSurfaceGeneral h3{margin:0 0 5px;color:#0a3f2d}#roofSurfaceGeneral .form{grid-template-columns:repeat(3,minmax(0,1fr));align-items:start}#roofSurfaceGeneral label small{display:block;margin-top:4px;font-weight:400}#roofSurfaceGeneral .roofUsableAreaReadout{display:grid;align-content:start;align-self:start;gap:7px;min-width:0;margin:0;padding:0;border:0;background:transparent;color:#39574a;font:600 13px/1.4 "Segoe UI",system-ui,sans-serif}#roofSurfaceGeneral .roofUsableAreaReadout output{display:flex;align-items:center;box-sizing:border-box;width:100%;min-height:43px;margin:0;padding:10px 11px;border:1px solid #cbd9d1;border-radius:6px;background:#f4f9f5;color:#0a3f2d;font:700 15px/1.25 "Segoe UI",system-ui,sans-serif}.roofPanelCountEstimate{grid-column:1/-1;display:grid;grid-template-columns:auto auto;align-items:baseline;gap:4px 12px;margin-top:4px;padding:12px;border:1px solid #cfe0d5;border-radius:7px;background:#f8fbf9;color:#315b4b}.roofPanelCountEstimate h4,.roofPanelCountEstimate p,.roofModuleReference{grid-column:1/-1;margin:0}.roofPanelCountEstimate h4{color:#0a3f2d;font-size:15px}.roofPanelCountEstimate p,.roofPanelCountEstimate small{color:#60796d;font-size:12px;line-height:1.45}.roofPanelCountEstimate output{font-size:15px;font-weight:700;color:#0a3f2d}.roofPanelCountEstimate>small{grid-column:1/-1}.roofModuleReference{display:grid;gap:4px;margin-top:5px;padding:10px;border-left:3px solid #e8b128;background:#fff;color:#315b4b}.roofModuleReference span{font-size:13px}.roofModuleReference small{font-size:11px}.roofPanelCountEstimate label{grid-column:1/-1;display:grid;gap:6px;margin-top:5px}.roofProductionStatus{margin:10px 0 0;padding:9px 11px;border-left:3px solid #d2a642;background:#fff9e9;color:#674f1b}.roofProductionStatus[data-state="ready"]{border-left-color:#3e8968;background:#eff8f2;color:#315b4b}@media(max-width:760px){#roofSurfaceGeneral .form{grid-template-columns:1fr}.roofPanelCountEstimate{grid-template-columns:1fr}}';
    orientationStyle.textContent += '.roofSizingTopline{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;grid-column:1/-1;align-items:stretch}.roofSizingControl{min-width:0;padding:10px;border:1px solid #d7e4dc;border-radius:7px;background:#fff}.roofSizingControl label{display:grid;gap:6px;margin:0!important;font-weight:650}.roofSizingControl label small{color:#60796d;font-size:11px;font-weight:400}.roofSizingControl input{box-sizing:border-box;width:100%;min-width:0}.roofPanelCount{display:grid;align-content:start;gap:7px}.roofPanelCount output{display:block;min-height:22px}.roofPanelCount small{color:#60796d;font-size:11px;line-height:1.45}.roofSizingReferences{grid-column:1/-1;margin:7px 0;padding:9px 10px;border:1px solid #d7e4dc;border-radius:7px;background:#fff}.roofSizingReferences summary{cursor:pointer;color:#0a3f2d;font-weight:650}.roofSizingReferences p{margin:8px 0 0;color:#526c60;font-size:12px;line-height:1.5}.roofInstallerStudy{grid-column:1/-1;margin-top:6px;padding:12px;border:1px solid #d7e4dc;border-radius:7px;background:#fff}.roofInstallerStudy h5{margin:0 0 6px;color:#0a3f2d;font-size:14px}.roofInstallerStudy p{margin:5px 0;color:#526c60;font-size:12px;line-height:1.5}.roofInstallerStudy .fine{padding:7px 9px;border-left:3px solid #d4a33a;background:#fff8e6}@media(max-width:760px){.roofSizingTopline{grid-template-columns:1fr}.roofSizingControl{padding:9px}}#roofEstimate .roofMetrics{grid-template-columns:repeat(5,minmax(0,1fr))}@media(max-width:760px){#roofEstimate .roofMetrics{grid-template-columns:1fr}}';
    orientationStyle.textContent += '.roofAzimuthHelp{position:relative;display:inline-flex;align-items:center;justify-content:center;vertical-align:top;margin:0;font-weight:400;min-width:24px;min-height:24px}.roofAzimuthHelpButton{display:inline-grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:0;background:transparent;color:#08734c;font:700 14px/1 system-ui;cursor:help}.roofAzimuthHelpButton:focus-visible{outline:2px solid #08734c;outline-offset:2px}.roofAzimuthHelpBubble{display:none;position:absolute;top:calc(100% + 7px);right:0;z-index:1200;width:min(420px,calc(100vw - 48px));padding:12px 14px;border:1px solid #cfe0d5;border-radius:8px;background:#fff;color:#123d30;box-shadow:0 4px 18px #0002;font-size:13px;font-weight:400;line-height:1.45}.roofAzimuthHelp:hover .roofAzimuthHelpBubble,.roofAzimuthHelp:focus-within .roofAzimuthHelpBubble,.roofAzimuthHelp.is-open .roofAzimuthHelpBubble{display:block}@media(max-width:760px){.roofAzimuthHelpBubble{width:min(280px,calc(100vw - 40px))}}';
    orientationStyle.textContent += '.roofSizingTopline{grid-template-columns:repeat(4,minmax(0,1fr))}.roofSizingControl{display:flex;flex-direction:column;min-height:128px}.roofSizingControl label{display:grid;grid-template-rows:minmax(2.7em,auto) 42px minmax(2.6em,auto);align-content:start;gap:6px;min-height:0}.roofSizingControl label input{margin:0}.roofPanelCount output{min-height:43px;display:flex;align-items:center}.roofInstallerStudy select,.roofInstallerStudy input[type=file]{display:block;box-sizing:border-box;width:100%;margin:5px 0 10px;padding:8px;border:1px solid #cbd9d1;border-radius:6px;background:#fff}.roofInstallerStudy button{margin:4px 0;padding:9px 13px;border:1px solid #08734c;border-radius:6px;background:#08734c;color:#fff;font-weight:650;cursor:pointer}.roofInstallerStudy button:disabled{opacity:.6;cursor:wait}.roofInstallerStudy ul{margin:8px 0 0;padding-left:20px}.roofInstallerStudy li{margin:4px 0;font-size:12px;color:#315b4b}.roofSizingReferences p{max-width:105ch}.roofSurface [data-pvgis-tilt-advice],#manualPvgisTiltAdvice{display:block;min-height:2.8em;margin-top:5px;color:#587469;font-size:11px;line-height:1.4}.pvgisTiltCallout{padding:8px 10px;border-left:3px solid #2b8964;border-radius:4px;background:#eaf5ee;color:#184f3a;font-size:12px!important;line-height:1.4}.roofSurfaceHelp:empty{display:none}.roofFieldHelp{display:inline-grid;place-items:center;width:17px;height:17px;margin-left:4px;border:1px solid #4c9679;border-radius:50%;color:#287453;font-size:11px;cursor:help}@media(max-width:1000px){.roofSizingTopline{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.roofSizingTopline{grid-template-columns:1fr}.roofSizingControl{min-height:0}.roofSizingControl label{grid-template-rows:auto auto auto}}';
    orientationStyle.textContent += '.roofTiltAdvice{margin:8px 0;padding:9px 11px;border-left:3px solid #dba72e;background:#fff8e6;color:#5b4a1c;font-size:12px;line-height:1.5}';
      orientationStyle.textContent += '.roofSizingControl label{grid-template-rows:3.4em 42px minmax(2.6em,auto)}.roofSizingLabelTitle{display:flex;align-items:flex-start;gap:4px;min-height:3.4em;line-height:1.35}.roofSizingLabelText{flex:1;min-width:0}.roofSizingLabelTitle .pvgisLossHelp{flex:0 0 auto;margin:0}.roofPanelCount{grid-template-rows:3.4em minmax(42px,auto) auto}.roofPanelCount> b{line-height:1.35}.roofPanelCount output{align-self:start;min-height:42px;line-height:1.35}@media(max-width:620px){.roofSizingControl label{grid-template-rows:auto 42px auto}.roofSizingLabelTitle{min-height:0}.roofPanelCount{grid-template-rows:auto minmax(42px,auto) auto}}';
    document.head.appendChild(orientationStyle);
    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('.roofAzimuthHelpButton');
      document.querySelectorAll('.roofAzimuthHelp.is-open').forEach((help) => {
        if (help.contains(button)) return;
        help.classList.remove('is-open');
        const trigger = help.querySelector('button');
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.blur();
      });
      if (!button) return;
      event.preventDefault();
      const help = button.closest('.roofAzimuthHelp');
      const open = help.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
      if (!open) button.blur();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('.roofAzimuthHelp.is-open').forEach((help) => {
        help.classList.remove('is-open');
        const button = help.querySelector('button');
        button?.setAttribute('aria-expanded', 'false');
        button?.blur();
      });
    });
    const mapContainer = window.solarMap.getContainer();
    if (!mapContainer.querySelector('.roofNorthCompass')) {
      const north = document.createElement('div');
      north.className = 'roofNorthCompass';
      north.setAttribute('aria-label', 'Le nord est en haut de la carte');
      north.title = 'Nord · la carte est orientée nord en haut';
      north.innerHTML = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 1 19 22l-9-5-9 5z"/></svg><span>N</span>';
      mapContainer.appendChild(north);
    }
    const thinking = document.createElement('div');
    thinking.id = 'roofThinking';
    thinking.hidden = true;
    thinking.innerHTML = '<div class="roofThinkingCard"><span class="roofSpinner" aria-hidden="true"></span><span>Analyse du bâtiment en cours…</span></div>';
    document.getElementById('map')?.appendChild(thinking);
    const editToolbar = document.createElement('div');
    editToolbar.id = 'roofContourEdit';
    editToolbar.hidden = true;
    editToolbar.innerHTML = '<strong>Modifier le contour</strong><span>Déplacez les points blancs.</span><div><button type="button" data-save-contour>Enregistrer le contour</button><button type="button" data-cancel-contour>Annuler la correction</button></div>';
    mapContainer.appendChild(editToolbar);
    L.DomEvent.disableClickPropagation(editToolbar);
    L.DomEvent.disableScrollPropagation(editToolbar);
    editToolbar.querySelector('[data-save-contour]').addEventListener('click', () => zoneDrawSession ? finishZoneDrawing() : zoneEditSession ? finishZoneEdit(true) : finishContourEdit(true));
    editToolbar.querySelector('[data-cancel-contour]').addEventListener('click', () => zoneDrawSession ? stopZoneDrawing() : zoneEditSession ? finishZoneEdit(false) : finishContourEdit(false));
    const editStyle = document.createElement('style');
    editStyle.textContent = '#roofContourEdit{position:absolute;top:12px;left:62px;right:60px;z-index:750;display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:10px 13px;border:1px solid #cfe0d5;border-radius:8px;background:#fff;box-shadow:0 3px 14px #0002;font:13px/1.4 system-ui;color:#073f39}#roofContourEdit[hidden]{display:none}#roofContourEdit>div{display:flex;gap:7px;flex-wrap:wrap}#roofContourEdit button{border:1px solid #87b6a0;border-radius:6px;padding:6px 10px;background:#fff;color:#073f39;font:600 13px/1.4 system-ui;cursor:pointer}#roofContourEdit [data-save-contour]{background:#073f39;color:#fff}@media(max-width:760px){#roofContourEdit{right:12px;top:110px}#roofContourEdit>span{display:none}}';
    document.head.appendChild(editStyle);
    // Keep these actions visible when the sticky journey overlaps the map's top.
    editStyle.textContent += '#roofContourEdit{top:auto;bottom:18px}';
    mapContainer.addEventListener('click', (event) => {
      if (event.target.closest?.('.leaflet-draw-toolbar a')) finishContourEdit(true);
    }, true);
    if (L.drawLocal?.edit?.toolbar) {
      Object.assign(L.drawLocal.edit.toolbar.actions.save, { title: 'Enregistrer les contours', text: 'Enregistrer' });
      Object.assign(L.drawLocal.edit.toolbar.actions.cancel, { title: 'Annuler les modifications', text: 'Annuler' });
      L.drawLocal.edit.toolbar.buttons.edit = 'Modifier les contours';
      L.drawLocal.edit.toolbar.buttons.remove = 'Supprimer une surface';
      Object.assign(L.drawLocal.edit.handlers.edit.tooltip, { text: 'Déplacez les points blancs pour ajuster le contour.', subtext: 'Enregistrez ou annulez les modifications.' });
      const legacyEdit = document.querySelector('.leaflet-draw-edit-edit');
      if (legacyEdit) { legacyEdit.title = 'Modifier les contours'; legacyEdit.setAttribute('aria-label', 'Modifier les contours'); }
      const legacyDelete = document.querySelector('.leaflet-draw-edit-remove');
      if (legacyDelete) { legacyDelete.title = 'Supprimer une surface'; legacyDelete.setAttribute('aria-label', 'Supprimer une surface'); }
    }
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (zoneDrawSession) { event.preventDefault(); stopZoneDrawing(); }
      else if (zoneEditSession) { event.preventDefault(); finishZoneEdit(false); }
      else if (contourEdit) { event.preventDefault(); finishContourEdit(false); }
    });
    installTerrainSummary();
    // Install after the legacy layout cleanup, which removes its old fine-print paragraph.
    if (!document.getElementById('roofMapClickHint')) {
      const clickHint = document.createElement('p');
      clickHint.id = 'roofMapClickHint';
      clickHint.className = 'fine';
      clickHint.textContent = 'Cliquez une fois sur chaque toiture à ajouter pour proposer son contour. Pour le corriger, cliquez une seconde fois dessus.';
      mapContainer.insertAdjacentElement('afterend', clickHint);
    }
    // CR-013 exclusion drawing remains archived in this file but is not active.
    installManualAreaSettings();
    positionRoofMapModules();
    document.querySelector('[data-pick-manual-azimuth]')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      if (orientationPicker?.button === button) {
        finishOrientationPick('Tracé de l’orientation annulé.');
        return;
      }
      startOrientationPick({ kind: 'manual' }, button);
    });
    document.getElementById('manualAzimuth')?.addEventListener('change', (event) => {
      const azimuth = normalizeAzimuth(event.currentTarget.value);
      event.currentTarget.value = azimuth == null ? '' : String(azimuth);
      const mapButton = document.querySelector('[data-pick-manual-azimuth]');
      if (mapButton) mapButton.textContent = orientationMapButtonLabel({ kind: 'manual' });
      clearOrientationMark('manual');
      const legacyOrientation = document.getElementById('orientation');
      if (legacyOrientation) legacyOrientation.value = compassLabel(azimuth);
      calculateSynthesis();
    });
    const totalInput = document.getElementById('roofTotal');
    activeProjectContext = projectContextKey();
    window.updateRoof = calculateSynthesis;
    window.solarMap.getContainer().classList.add('roofDetectionReady');
    window.solarMap.on('click', detectAt);
    window.solarMap.on('draw:drawstart draw:editstart draw:deletestart', () => { finishContourEdit(true); invalidateDetection(); drawingActive = true; });
    window.solarMap.on('draw:drawstop draw:editstop draw:deletestop', () => { drawingActive = false; });
    window.addEventListener('ozeno:roof-surfaces', () => {
      if (layers().length) surfaceSource = 'map';
      else if (surfaceSource === 'map') surfaceSource = 'none';
      render();
    });
    const refreshProjectContext = () => {
      const next = projectContextKey();
      if (next !== activeProjectContext) {
        finishContourEdit(false);
        invalidateDetection();
        activeProjectContext = next;
        finishOrientationPick();
        orientationLayerGroup?.clearLayers();
        orientationMarks.clear();
        window.roofGroup?.clearLayers();
        stopZoneDrawing(); cr013ZoneGroup?.clearLayers(); cr013Zones = []; cr013Confirmed = false; cr013BufferAreaM2 = null; updateCr013ZoneReadout();
        const bufferInput = document.getElementById('cr013BufferArea'); if (bufferInput) bufferInput.value = '';
        configurations.clear();
        surfaceSource = 'none';
        lastCr013AreaResult = null;
        if (totalInput) totalInput.value = '';
        manualSurfaceConfiguration = { type: '', material: '', flatTilt: '', manualDensityWcM2: '' };
        ['manualRoofType', 'manualRoofMaterial', 'manualDensityWcM2'].forEach((id) => { const field = document.getElementById(id); if (field) field.value = ''; });
        const manualAzimuth = document.getElementById('manualAzimuth');
        if (manualAzimuth) manualAzimuth.value = '';
        ['orientation', 'tilt', 'shade'].forEach((id) => { const field = document.getElementById(id); if (field) field.value = ''; });
        document.getElementById('manualRoofType')?.dispatchEvent(new Event('change', { bubbles: true }));
        render();
        return;
      }
      calculateSynthesis();
    };
    window.addEventListener('ozeno:project-context-loaded', refreshProjectContext);
    // A map click localizes the current study; it must not clear its newly drawn roofs.
    window.addEventListener('ozeno:site-location-updated', () => { activeProjectContext = projectContextKey(); calculateSynthesis(); });
    const projects = document.querySelector('.projects');
    if (projects) new MutationObserver((changes) => {
      if (changes.some((change) => change.type === 'attributes' && change.target.matches?.('button[data-p]'))) refreshProjectContext();
    }).observe(projects, { attributes: true, attributeFilter: ['class'], subtree: true });
    ['roofTotal', 'roofRatio', 'panelArea', 'panelWp', 'pvgisSystemLoss'].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.oninput = () => {
        if (id === 'roofTotal' && !updatingMeasuredSurface) {
          surfaceSource = Number(input.value) > 0 ? 'manual' : layers().length ? 'map' : 'none';
          if (cr013Zones.length) {
            cr013Confirmed = false;
            cr013BufferAreaM2 = null;
            const bufferInput = document.getElementById('cr013BufferArea'); if (bufferInput) bufferInput.value = '';
            updateCr013ZoneReadout();
          }
        }
        calculateSynthesis();
      };
    });
    ['orientation', 'tilt', 'shade'].forEach((id) => document.getElementById(id)?.addEventListener('change', calculateSynthesis));
    document.addEventListener('input', (event) => { if (event.target?.id === 'capexPerKwp') calculateSynthesis(); });
    window.addEventListener('ozeno:recalculate-roof-preview', calculateSynthesis);
    render();
  }

  window.OzenoRoofOrientation = { normalizeAzimuth, pvgisAspectFromAzimuth, bearingBetweenPoints, dominantAxisBearing };
  window.OzenoCr010Sizing = { version: cr010SizingRules.version, densityForSurface: cr010DensityForSurface, requiresFlatSouthProjectDensity, calculateRoofSizing: calculateCr010RoofSizing, estimatedPanelCount, representativeModulePower, modulePowerDensityWcM2, limitDensityToModule, moduleReference: studyModuleReference };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
