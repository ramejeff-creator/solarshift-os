import { pdfHexText } from './report-pdf.mjs';
const encoder = new TextEncoder();
const pt = mm => mm * 72 / 25.4;

/** The image and vector parcel share the server's Lambert-93 bounds and paper dimensions. */
export function buildSituationPlanPdf(plan, { name = 'Site à qualifier', address = '', parcelId = '' } = {}) {
  if (plan?.state !== 'AVAILABLE' || plan.crs !== 'EPSG:2154' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(plan.image || '')) throw new TypeError('Préparez le plan avant l’export.');
  const jpeg = Uint8Array.from(atob(plan.image.split(',')[1]), c => c.charCodeAt(0));
  const [pw, ph] = plan.pageMm.map(pt), [mw, mh] = plan.mapMm.map(pt), left = pt(12), top = pt(38), bottom = ph - top - mh;
  const commands = [];
  const text = (value, x, yTop, size = 9, bold = false) => commands.push(`0.05 0.22 0.18 rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${ph - yTop - size} Tm ${pdfHexText(value)} Tj ET`);
  const line = (x1, y1, x2, y2, width = 1) => commands.push(`0.05 0.22 0.18 RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  text('OZENO · PLAN DE SITUATION', left, pt(9), 11, true);
  text(String(name).slice(0, 85), left, pt(16), 11, true);
  text(String(address).slice(0, 110), left, pt(23), 9);
  text(`Parcelle ${String(parcelId).slice(0, 30)} · ${plan.format} ${plan.orientation === 'portrait' ? 'portrait' : 'paysage'} · 1/${plan.scale.toLocaleString('fr-FR')} · ${plan.dpi} dpi`, left, pt(30), 9);
  commands.push(`q ${mw} 0 0 ${mh} ${left} ${bottom} cm /Map Do Q`);
  // Clip vector contours to the map rectangle; no invented cadastral boundaries.
  commands.push(`q ${left} ${bottom} ${mw} ${mh} re W n`);
  for (const rings of plan.paths) {
    const path = rings.map(ring => ring.map(([x, y], i) => `${left + x * mw} ${bottom + (1 - y) * mh} ${i ? 'l' : 'm'}`).join(' ') + ' h').join(' ');
    commands.push(`1 1 1 RG 3.2 w ${path} S`, `0.78 0.12 0.15 RG 1.7 w ${path} S`);
  }
  commands.push('Q');
  // Map border and north of the projected grid (clearly identified, not true north).
  commands.push(`0.55 0.65 0.61 RG 0.5 w ${left} ${bottom} ${mw} ${mh} re S`);
  const nx = left + mw - pt(10), ny = bottom + mh - pt(19);
  commands.push(`1 1 1 rg ${nx - pt(5)} ${ny - pt(2)} ${pt(10)} ${pt(17)} re f`);
  line(nx, ny, nx, ny + pt(9), 1.5); line(nx, ny + pt(9), nx - pt(2), ny + pt(6)); line(nx, ny + pt(9), nx + pt(2), ny + pt(6));
  text('N', nx - 3, ph - ny - pt(14), 10, true);
  const fy = plan.pageMm[1] - 33, by = ph - pt(fy + 5), bar = pt(50);
  line(left, by, left + bar, by, 2);
  for (const x of [left, left + bar / 2, left + bar]) line(x, by - 3, x, by + 3);
  text('0', left, pt(fy - 1), 8); text(`${plan.scaleBarM / 2} m`, left + bar / 2 - 7, pt(fy - 1), 8); text(`${plan.scaleBarM} m`, left + bar - 10, pt(fy - 1), 8);
  text('Imprimer à 100 % / taille réelle, sans ajuster à la page. Barre de contrôle : 50 mm.', left + pt(60), pt(fy + 2), 8);
  const baseLabel = plan.base === 'photo' ? 'Photographies aériennes IGN' : 'Plan IGN';
  const date = new Date(plan.source.retrievedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  text(`${baseLabel}${plan.cadastre ? ' + Parcellaire Express (PCI)' : ''} · contour rouge : parcelle sélectionnée.`, left, pt(fy + 10), 8);
  text(`${plan.source.attribution} · Géoplateforme · Licence Ouverte Etalab 2.0 · consulté le ${date}.`, left, pt(fy + 15), 8);
  text('Lambert-93 (EPSG:2154) · N : nord du quadrillage · data.geopf.fr · date de prise de vue / millésime non confirmé.', left, pt(fy + 20), 7.5);
  text('Support de repérage. Limites indicatives ; ne constitue pas un bornage ou un relevé géomètre.', left, pt(fy + 25), 8);
  const content = encoder.encode(commands.join('\n'));
  const bytes = value => typeof value === 'string' ? encoder.encode(value) : value;
  const stream = (data, extra = '') => [bytes(`<< /Length ${data.length} ${extra} >>\nstream\n`), data, bytes('\nendstream')];
  const objects = [null, [bytes('<< /Type /Catalog /Pages 2 0 R >>')], [bytes('<< /Type /Pages /Kids [7 0 R] /Count 1 >>')], [bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')], [bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')], stream(jpeg, `/Type /XObject /Subtype /Image /Width ${plan.pixels[0]} /Height ${plan.pixels[1]} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`), stream(content), [bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Map 5 0 R >> >> /Contents 6 0 R >>`)]];
  const chunks = [bytes('%PDF-1.4\n')], offsets = [0]; let size = chunks[0].length;
  const push = value => { const b = bytes(value); chunks.push(b); size += b.length; };
  for (let id = 1; id < objects.length; id++) { offsets[id] = size; push(`${id} 0 obj\n`); objects[id].forEach(push); push('\nendobj\n'); }
  const xref = size;
  push(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < objects.length; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const output = new Uint8Array(size); let offset = 0;
  chunks.forEach(chunk => { output.set(chunk, offset); offset += chunk.length; });
  return output;
}

export function downloadSituationPlan(plan, identity) {
  const url = URL.createObjectURL(new Blob([buildSituationPlanPdf(plan, identity)], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url; link.download = `plan-situation-${String(identity.parcelId || 'site').replace(/[^a-z0-9-]/gi, '-')}.pdf`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
