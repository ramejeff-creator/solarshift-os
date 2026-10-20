// Postal identity and map position are distinct, provisional pieces of site data.
export function normalizeAddressReference(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const result = {};
  for (const [key, limit] of Object.entries({ label: 500, address: 500, streetAddress: 500, city: 200, postalCode: 10, cityCode: 10, coordinateSource: 80, precision: 80 })) {
    result[key] = String(source[key] ?? '').trim();
    if (result[key].length > limit) throw new Error(`La référence d’adresse (${key}) est trop longue.`);
  }
  return result;
}

const geocodingEndpoint = 'https://data.geopf.fr/geocodage/search';

export function reverseGeocodeUrl(latitude, longitude) {
  const lat = Number(latitude), lon = Number(longitude);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
    throw new Error('Coordonnées invalides pour la recherche d’adresse.');
  }
  const url = new URL('https://data.geopf.fr/geocodage/reverse');
  url.search = new URLSearchParams({ lat: String(lat), lon: String(lon), index: 'address', limit: '1' });
  return url.toString();
}

export function normalizeReverseGeocodeResult(response) {
  const candidate = response?.features?.[0] || response?.results?.[0] || response?.result || response;
  const suggestion = normalizeSiteAddressSuggestion(candidate);
  if (!suggestion) return null;
  const properties = candidate.properties && typeof candidate.properties === 'object' ? candidate.properties : candidate;
  const distanceMeters = Number(properties.distance);
  return {
    ...suggestion,
    ...(Number.isFinite(distanceMeters) && distanceMeters >= 0 ? { distanceMeters } : {}),
    coordinateSource: 'GEOPLATEFORME_REVERSE', precision: 'REVERSE_GEOCODED_ADDRESS'
  };
}

export function prospectingAutocompleteUrls(text) {
  const query = String(text || '').trim();
  return ['address', 'poi'].map((index) => {
    const params = new URLSearchParams({ q: query, index, autocomplete: '1', limit: '8' });
    return `${geocodingEndpoint}?${params}`;
  });
}

export function normalizeProspectingSuggestion(result) {
  if (!result || typeof result !== 'object') return null;
  const properties = result.properties && typeof result.properties === 'object' ? result.properties : result;
  const coordinates = result.geometry?.coordinates;
  const longitudeValue = Array.isArray(coordinates) ? coordinates[0] : result.x ?? properties.x;
  const latitudeValue = Array.isArray(coordinates) ? coordinates[1] : result.y ?? properties.y;
  if (longitudeValue == null || latitudeValue == null) return null;
  const longitude = Number(longitudeValue), latitude = Number(latitudeValue);
  const label = String(result.fulltext || result.label || properties.label || '').trim();
  if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const isPointOfInterest = [result.country, result.type, properties.index, properties.type]
    .some((value) => ['PositionOfInterest', 'poi'].includes(String(value || '')));
  const isMunicipality = ['municipality', 'commune', 'administrativearea'].includes(String(properties.type || '').toLowerCase());
  const city = String(properties.city || properties.cityName || properties.commune || '').trim();
  const postalCode = String(properties.postcode || properties.postalCode || label.match(/\b\d{5}\b/)?.[0] || '').trim();
  const cityCode = String(properties.citycode || properties.cityCode || properties.codeCommune || '').trim().toUpperCase();
  let address = String(properties.address || properties.streetAddress || '').trim();
  if (!address && !isPointOfInterest && !isMunicipality) {
    address = label;
    for (const suffix of [city, postalCode]) {
      if (!suffix) continue;
      const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      address = address.replace(new RegExp(`[ ,]+${escaped}\\s*$`, 'i'), '').trim();
    }
  }
  return {
    label,
    latitude,
    longitude,
    precision: isPointOfInterest ? 'POINT_OF_INTEREST' : 'ADDRESS',
    ...(address ? { address } : {}),
    ...(city ? { city } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(cityCode ? { cityCode } : {})
  };
}

/** Parse latitude/longitude text locally; GPS input is never sent to address search. */
export function parseCoordinatePair(text) {
  const value = String(text || '').trim().replace(/^(?:gps|coordonn[eé]es)\s*:\s*/i, '');
  const match = value.match(/^\s*([+-]?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*([+-]?\d{1,3}(?:[.,]\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1].replace(',', '.'));
  const longitude = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude, label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, precision: 'COORDINATES' };
}

export function enedisAutocompleteUrl(text, kind = 'address') {
  const city = kind === 'city';
  const url = new URL('https://data.geopf.fr/geocodage/completion/');
  url.search = new URLSearchParams({
    text: String(text || '').trim(),
    terr: 'METROPOLE',
    type: city ? 'PositionOfInterest' : 'StreetAddress',
    maximumResponses: '8'
  });
  if (city) url.searchParams.set('poiType', 'administratif');
  return url.toString();
}

export function siteAddressAutocompleteUrl(text) {
  const url = new URL('https://data.geopf.fr/geocodage/completion/');
  url.search = new URLSearchParams({
    text: String(text || '').trim(),
    terr: 'METROPOLE',
    // Match the project form: including POIs helps resolve locality-qualified
    // queries (e.g. street + town) where street-only completion can be empty.
    type: 'StreetAddress,PositionOfInterest',
    maximumResponses: '8'
  });
  return url.toString();
}

export function hasHouseNumber(label, number) {
  const normalizedLabel = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const normalizedNumber = String(number || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!normalizedLabel || !normalizedNumber) return false;
  return new RegExp(`^${normalizedNumber}(?:\\s*(?:bis|ter|[a-z]))?(?=\\s|,|$)`, 'i').test(normalizedLabel);
}

export function normalizeSiteAddressSuggestion(result) {
  if (!result || typeof result !== 'object') return null;
  const properties = result.properties && typeof result.properties === 'object' ? result.properties : result;
  const coordinates = result.geometry?.coordinates;
  const longitudeValue = Array.isArray(coordinates) ? coordinates[0] : result.x ?? properties.x;
  const latitudeValue = Array.isArray(coordinates) ? coordinates[1] : result.y ?? properties.y;
  if (longitudeValue == null || latitudeValue == null) return null;
  const normalized = {
    fulltext: result.fulltext || result.label || properties.label || properties.fulltext || properties.name,
    address: result.address || result.streetAddress || properties.address || properties.streetAddress || properties.street,
    housenumber: result.housenumber || result.houseNumber || result.number || properties.housenumber || properties.houseNumber || properties.number,
    city: result.city || result.cityName || result.commune || properties.city || properties.cityName || properties.commune,
    postcode: result.postcode || result.postalCode || properties.postcode || properties.postalCode,
    citycode: result.citycode || result.cityCode || result.codeCommune || properties.citycode || properties.cityCode || properties.codeCommune
  };
  const address = normalizeEnedisSuggestion(normalized, 'address');
  const longitude = Number(longitudeValue), latitude = Number(latitudeValue);
  if (!address?.label || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return {
    ...address,
    latitude,
    longitude,
    coordinateSource: 'GEOPLATEFORME',
    precision: 'ADDRESS'
  };
}

export function normalizeEnedisSuggestion(result, kind = 'address') {
  if (!result || typeof result !== 'object') return null;
  const fulltext = String(result.fulltext || result.label || '').trim();
  const city = String(result.city || result.cityName || result.commune || '').trim();
  const postalCode = String(result.postcode || result.postalCode || fulltext.match(/\b\d{5}\b/)?.[0] || '').trim();
  const cityCode = String(result.citycode || result.cityCode || result.codeCommune || '').trim().toUpperCase();
  if (!fulltext && !city) return null;
  if (kind === 'city') {
    const resolvedCity = city || fulltext
      .replace(/^\s*(?:mairie|h[oô]tel\s+de\s+ville)(?:\s+(?:de|d['’]))?\s*/i, '')
      .replace(/[,\s]+\d{5}(?:\s+.*)?$/, '')
      .trim();
    if (!resolvedCity) return null;
    return { label: [resolvedCity, postalCode].filter(Boolean).join(' · '), city: resolvedCity, postalCode, cityCode };
  }
  let address = String(result.address || result.streetAddress || '').trim();
  const houseNumber = String(result.housenumber || result.houseNumber || result.number || '').trim();
  if (!address) {
    address = fulltext;
    for (const suffix of [city, postalCode]) {
      if (!suffix) continue;
      const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      address = address.replace(new RegExp(`[,\\s]+${escaped}\\s*$`, 'i'), '').trim();
    }
  }
  if (houseNumber && address && !new RegExp(`^${houseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i').test(address)) {
    address = `${houseNumber} ${address}`;
  }
  let label = fulltext || address;
  if (houseNumber && label && !new RegExp(`^${houseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i').test(label)) {
    label = [address || `${houseNumber} ${label}`, postalCode, city].filter(Boolean).join(' ');
  }
  return { label, address, city, postalCode, cityCode };
}

export function captureSiteLocation(config, fallbackAddress = '') {
  const coordinates = config.localProjectCoordinates || config.projectCoordinates;
  const reference = config.addressLookupNeedsSelection ? null : config.commercialAddressForLookup || config.selectedAddressCoordinates;
  const canonical = !config.addressLookupNeedsSelection && !config.localProjectCoordinates && config.projectContextLoaded ? config.projectContext : null;
  return {
    address: config.temporaryStudyLabel || reference?.label || fallbackAddress,
    latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null,
    coordinateSource: coordinates?.coordinateSource || coordinates?.source || '',
    addressReference: normalizeAddressReference(reference || (canonical?.address ? {
      address: canonical.address, label: canonical.address, city: canonical.city,
      postalCode: canonical.postal_code, cityCode: canonical.city_code,
      coordinateSource: 'PROJECT_CONTEXT', precision: 'ADDRESS'
    } : null))
  };
}

export function restoreSiteLocation(record, project = null) {
  const savedReference = normalizeAddressReference(record.addressReference || (project?.address && project.address === record.address ? {
    address: project.address, label: project.address, city: project.city, cityCode: project.city_code,
    postalCode: project.postal_code, coordinateSource: 'PROJECT_CONTEXT', precision: 'ADDRESS'
  } : null));
  const normalizeIdentity = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const projectAddress = String(record.address || '').trim();
  // A stale structured reference must never take precedence over the address of
  // the dossier currently opened (e.g. a previous project's Muret lookup).
  const referenceMismatch = Boolean(savedReference?.label && projectAddress
    && normalizeIdentity(savedReference.label) !== normalizeIdentity(projectAddress));
  const reference = referenceMismatch ? null : savedReference;
  const coordinates = record.latitude == null ? null : {
    latitude: record.latitude, longitude: record.longitude,
    coordinateSource: record.coordinateSource || 'Source non précisée'
  };
  return {
    localProjectCoordinates: coordinates, temporaryStudyLabel: record.address || record.name,
    addressLookupNeedsSelection: referenceMismatch,
    // Older drafts keep their label, without inventing a missing commune or address.
    commercialAddressForLookup: reference || { address: record.address || '', label: record.address || '' },
    selectedAddressCoordinates: coordinates ? { ...coordinates, ...reference, label: reference?.label || record.address } : null
  };
}

export function resolveEnedisAddress(config) {
  if (config.addressLookupNeedsSelection) return null;
  const project = config.projectContextLoaded ? config.projectContext : null;
  const source = config.commercialAddressForLookup || config.selectedAddressCoordinates;
  if (source) {
    if (['MAP_CLICK', 'CONTOUR_CENTER', 'USER_PROVIDED', 'COORDINATES', 'DEVICE_POSITION', 'POINT_OF_INTEREST'].includes(source.precision) && !source.address && !source.streetAddress) return null;
    const label = String(source.label || '').trim();
    const match = label.match(/^(.+?)[,\s]+(\d{5})\s+(.+)$/);
    const address = String(source.address || source.streetAddress || (match ? match[1] : label)).trim().replace(/[,\s]+$/, '');
    const city = String(source.city || (match ? match[3] : '')).trim();
    const cityCode = String(source.cityCode || '').trim().toUpperCase();
    if (address.length >= 4 && (city || /^(?:\d{5}|2[AB]\d{3})$/.test(cityCode))) {
      return { address, city, cityCode, postalCode: source.postalCode || match?.[2] || '' };
    }
  }
  // The open project's postal address is the lookup identity. Map coordinates can
  // remain provisional or stale without blocking a search against this address.
  const canonicalAddress = String(project?.address || '').trim();
  const sourceAddress = String(source?.address || source?.streetAddress || source?.label || '').trim();
  const normalizeForMatch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const sourceMatchesProject = Boolean(sourceAddress && canonicalAddress
    && (normalizeForMatch(sourceAddress) === normalizeForMatch(canonicalAddress)
      || normalizeForMatch(sourceAddress).startsWith(`${normalizeForMatch(canonicalAddress)} `)));
  if (canonicalAddress && (project.city || /^(?:\d{5}|2[AB]\d{3})$/i.test(project.city_code || ''))
    && (!source || !config.localProjectCoordinates || sourceMatchesProject)) {
    return { address: canonicalAddress, city: project.city || '', cityCode: project.city_code || '', postalCode: project.postal_code || '' };
  }
  // A local draft may contain coordinates but no confirmed postal identity. Never
  // infer a commune from those coordinates or borrow it from an unrelated project.
  if (config.localProjectCoordinates) return null;
  return null;
}
