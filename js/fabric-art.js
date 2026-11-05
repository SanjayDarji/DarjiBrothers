/*
 * Illustrated garment pictures for the sample catalogue.
 * Real products use photos uploaded from the admin page; these SVGs
 * only exist so the demo looks complete before photos are added.
 */
(function () {
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(hex, withHex, amt) {
    const a = hexToRgb(hex), b = hexToRgb(withHex);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * amt));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function lum(hex) {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const SHAPES = {
    kurti: 'M160 92 Q200 132 240 92 L298 106 L346 190 L318 206 L292 162 L300 282 L330 470 L70 470 L100 282 L108 162 L82 206 L54 190 L102 106 Z',
    anarkali: 'M162 92 Q200 130 238 92 L294 104 L330 210 L306 220 L284 160 L280 200 L372 472 L28 472 L120 200 L116 160 L94 220 L70 210 L106 104 Z',
    coordTop: 'M160 82 Q200 118 240 82 L296 96 L338 170 L312 184 L290 146 L298 262 L102 262 L110 146 L88 184 L62 170 L104 96 Z',
    coordPant: 'M118 276 L282 276 L296 476 L216 476 L200 340 L184 476 L104 476 Z',
    dupatta: 'M96 70 L304 70 L324 476 L76 476 Z'
  };

  function patternDef(id, kind, base, fg) {
    switch (kind) {
      case 'bandhani':
        return `<pattern id="${id}" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
          <rect width="22" height="22" fill="${base}"/>
          <circle cx="5" cy="5" r="1.9" fill="${fg}"/><circle cx="9" cy="5" r="1.9" fill="${fg}"/><circle cx="7" cy="8.4" r="1.9" fill="${fg}"/>
          <circle cx="16" cy="16" r="1.6" fill="${fg}" opacity=".8"/></pattern>`;
      case 'buti':
        return `<pattern id="${id}" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="${base}"/>
          <g fill="${fg}"><circle cx="9" cy="6" r="2.6"/><circle cx="9" cy="12" r="2.6"/><circle cx="6" cy="9" r="2.6"/><circle cx="12" cy="9" r="2.6"/></g>
          <circle cx="9" cy="9" r="1.4" fill="${base}"/>
          <g fill="${fg}" opacity=".75"><circle cx="26" cy="23" r="2"/><circle cx="26" cy="29" r="2"/><circle cx="23" cy="26" r="2"/><circle cx="29" cy="26" r="2"/></g></pattern>`;
      case 'leheriya':
        return `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <rect width="18" height="18" fill="${base}"/><rect y="0" width="18" height="5" fill="${fg}"/><rect y="9" width="18" height="1.6" fill="${fg}" opacity=".7"/></pattern>`;
      case 'block':
        return `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="${base}"/>
          <path d="M20 6 L34 20 L20 34 L6 20 Z" fill="none" stroke="${fg}" stroke-width="2.4"/>
          <circle cx="20" cy="20" r="3.2" fill="${fg}"/><circle cx="0" cy="0" r="3" fill="${fg}"/><circle cx="40" cy="0" r="3" fill="${fg}"/>
          <circle cx="0" cy="40" r="3" fill="${fg}"/><circle cx="40" cy="40" r="3" fill="${fg}"/></pattern>`;
      default: // plain with fine weave
        return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="${base}"/><rect width="6" height="1" fill="${fg}" opacity=".12"/></pattern>`;
    }
  }

  function hanger(stroke) {
    return `<g fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round">
      <path d="M200 52 C200 36 214 34 214 22 C214 12 206 6 198 8 C192 10 189 15 189 19"/>
      <path d="M200 52 L96 92 Q88 96 96 98 L304 98 Q312 96 304 92 Z" stroke-linejoin="round"/></g>`;
  }

  /**
   * garmentArt('kurti' | 'anarkali' | 'coord' | 'dupatta', 'bandhani'|'buti'|'leheriya'|'block'|'plain', '#hex')
   * returns a data: URI for an <img src>.
   */
  function garmentArt(type, pattern, hex, accent) {
    const dark = lum(hex) < 0.45;
    const bg = mix(hex, '#ffffff', 0.86);
    const fg = dark ? mix(hex, '#ffffff', 0.55) : mix(hex, '#2a1622', 0.35);
    const trim = accent || (dark ? '#E3B24A' : mix(hex, '#2a1622', 0.55));
    const shadow = mix(hex, '#2a1622', 0.25);
    const pid = 'p' + Math.random().toString(36).slice(2, 8);
    const shapes = type === 'coord' ? [SHAPES.coordTop, SHAPES.coordPant]
      : [SHAPES[type] || SHAPES.kurti];

    let body = '';
    shapes.forEach((d, i) => {
      const cid = pid + 'c' + i;
      body += `<clipPath id="${cid}"><path d="${d}"/></clipPath>
        <path d="${d}" fill="url(#${pid})"/>
        <g clip-path="url(#${cid})">
          <rect x="0" y="${type === 'coord' && i === 0 ? 246 : 448}" width="400" height="${type === 'dupatta' ? 0 : 30}" fill="${trim}" opacity=".95"/>
          <rect x="0" y="${type === 'coord' && i === 0 ? 240 : 442}" width="400" height="2.5" fill="${trim}" opacity=".9"/>
        </g>
        <path d="${d}" fill="none" stroke="${shadow}" stroke-opacity=".35" stroke-width="2"/>`;
    });

    let extra = '';
    if (type !== 'dupatta') {
      // neckline trim + placket
      const top = type === 'coord' ? 82 : 92;
      extra += `<path d="M${type === 'coord' ? 160 : 162} ${top} Q200 ${top + 40} ${type === 'coord' ? 240 : 238} ${top}" fill="none" stroke="${trim}" stroke-width="5"/>
        <path d="M200 ${top + 22} L200 ${top + 80}" stroke="${trim}" stroke-width="2.5" stroke-dasharray="5 5"/>`;
    } else {
      // borders and tassels
      extra += `<path d="M96 70 L304 70" stroke="${trim}" stroke-width="10"/>
        <path d="M100 96 L316 96" stroke="${trim}" stroke-width="2" opacity=".6"/>
        <path d="M76 476 L324 476" stroke="${trim}" stroke-width="12"/>` +
        Array.from({ length: 12 }, (_, k) => {
          const x = 86 + k * 20.5;
          return `<path d="M${x} 482 L${x} 496" stroke="${trim}" stroke-width="3" stroke-linecap="round"/>`;
        }).join('');
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
      <defs>${patternDef(pid, pattern, hex, fg)}</defs>
      <rect width="400" height="500" fill="${bg}"/>
      <ellipse cx="200" cy="488" rx="150" ry="9" fill="${shadow}" opacity=".12"/>
      ${type === 'dupatta' ? '' : hanger(mix(hex, '#2a1622', 0.6))}
      ${body}${extra}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s{2,}/g, ' '));
  }

  window.garmentArt = garmentArt;
})();
