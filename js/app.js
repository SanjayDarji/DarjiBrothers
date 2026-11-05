/* Darji Brothers — storefront */
(function () {
  const S = window.DarjiStore;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach(c => c != null && n.append(c));
    return n;
  };

  const state = {
    db: null,
    products: [],
    settings: {},
    category: 'All',
    size: '',
    sort: 'featured',
    query: '',
    current: null,   // product open in the sheet
    sel: { color: 0, size: '', qty: 1, image: 0 },
    bag: S.ls.get('darji.bag', [])
  };

  /* ---------- WhatsApp ---------- */
  function waNumber() { return String(state.settings.whatsapp || '').replace(/\D/g, ''); }
  function waLink(text) { return `https://wa.me/${waNumber()}?text=${encodeURIComponent(text)}`; }
  function productUrl(p) { return location.origin + location.pathname + '#p-' + p.id; }

  function lineFor(item, p) {
    const parts = [`${p.name} (${S.productCode(p)})`];
    if (item.color) parts.push(`Colour: ${item.color}`);
    if (item.size) parts.push(`Size: ${item.size}`);
    parts.push(`Qty: ${item.qty}`);
    parts.push(`Price: ${S.formatPrice(p.price)}${item.qty > 1 ? ' each' : ''}`);
    return parts;
  }

  function singleOrderMessage(p, sel) {
    const color = p.colors[sel.color];
    const lines = lineFor({ color: color && color.name, size: sel.size, qty: sel.qty }, p);
    return [
      'Hello Darji Brothers, I would like to order:',
      '',
      ...lines,
      '',
      'Link: ' + productUrl(p),
      '',
      'Please confirm availability and delivery.'
    ].join('\n');
  }

  function bagMessage() {
    const out = ['Hello Darji Brothers, I would like to order these items:', ''];
    let total = 0;
    state.bag.forEach((item, i) => {
      const p = state.products.find(x => x.id === item.id);
      if (!p) return;
      total += p.price * item.qty;
      const [first, ...rest] = lineFor(item, p);
      out.push(`${i + 1}. ${first}`, ...rest.map(r => '   ' + r), '');
    });
    out.push('Estimated total: ' + S.formatPrice(total), '', 'Please confirm availability and delivery.');
    return out.join('\n');
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    const open = document.querySelector('dialog[open]');
    (open || document.body).appendChild(t); // stay above an open dialog
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------- Settings / contact ---------- */
  function prettyNumber() {
    const num = waNumber();
    return num.length === 12 && num.startsWith('91') ? `+91 ${num.slice(2, 7)} ${num.slice(7)}` : '+' + num;
  }

  function applySettings() {
    const s = state.settings;
    $('#contactWa').textContent = prettyNumber();
    $('#contactWa').href = waLink('Hello Darji Brothers, I have a question.');
    $('#contactWaOpen').href = waLink('Hello Darji Brothers, I have a question.');
    $('#customWa').href = waLink('Hello Darji Brothers, I would like to get an outfit custom stitched.');

    const ig = String(s.instagram || '').replace(/^@/, '');
    $('#contactIgRow').hidden = !ig;
    $('#contactIg').textContent = '@' + ig;
    $('#contactIg').href = $('#contactIgOpen').href = 'https://instagram.com/' + ig;

    $('#contactEmailRow').hidden = !s.email;
    $('#contactEmail').textContent = s.email || '';
    $('#contactEmail').href = 'mailto:' + (s.email || '');

    $('#contactAddrRow').hidden = !s.address;
    $('#contactAddr').textContent = s.address || '';
    $('#contactMap').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Darji Brothers, ' + (s.address || ''));

    if (s.about && s.about.trim()) {
      $('#aboutBody').replaceChildren(...s.about.split(/\n\s*\n/).map(t => el('p', { text: t.trim() })));
    }
    renderHours();
    renderFooter();
    initStory();
    updateComposer();
  }

  /* ---------- Opening hours (India time) ---------- */
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_NAMES = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
  function toMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); }
  function fmtTime(t) {
    const [h, m] = String(t).split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
  }
  function renderHours() {
    const h = state.settings.hours || {};
    const card = $('#hoursCard');
    if (!h.open || !h.close) { card.hidden = true; return; }
    card.hidden = false;
    const closed = h.closed || [];
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = t => (parts.find(p => p.type === t) || {}).value;
    const day = get('weekday'), now = Number(get('hour')) * 60 + Number(get('minute'));
    const openToday = !closed.includes(day);
    const isOpen = openToday && now >= toMin(h.open) && now < toMin(h.close);

    let status, detail;
    if (isOpen) {
      status = 'Open now';
      detail = `Closes at ${fmtTime(h.close)} today.`;
    } else {
      status = 'Closed now';
      if (openToday && now < toMin(h.open)) detail = `Opens today at ${fmtTime(h.open)}.`;
      else {
        let i = DAYS.indexOf(day), next = null;
        for (let k = 1; k <= 7; k++) { const d = DAYS[(i + k) % 7]; if (!closed.includes(d)) { next = k === 1 ? 'tomorrow' : DAY_NAMES[d]; break; } }
        detail = next ? `Opens ${next} at ${fmtTime(h.open)}.` : '';
      }
      detail += ' WhatsApp messages are answered when we open.';
    }
    const offDays = closed.map(d => DAY_NAMES[d]).join(' and ');
    detail += ` Hours: ${fmtTime(h.open)} to ${fmtTime(h.close)}` + (offDays ? `, closed ${offDays}.` : ', every day.');
    $('#hoursStatus').textContent = status;
    $('#hoursDetail').textContent = detail;
    $('#hoursDot').className = 'hours-dot ' + (isOpen ? 'open' : 'closed');
  }

  /* ---------- About: story plays along the tape ---------- */
  const STORY_MS = 6500;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const story = { idx: -1, timer: null, userPaused: reduceMotion, inView: false, hover: false, bound: false };

  function chapters() { return state.settings.story || []; }
  function posFor(i) {
    const n = chapters().length;
    return `calc(12px + (100% - 24px) * ${n < 2 ? 0 : i / (n - 1)})`;
  }

  function initStory() {
    const list = chapters();
    const box = $('#story');
    box.hidden = !list.length;
    if (!list.length) return;
    $('.story-controls').hidden = list.length < 2;
    $('#storyMarks').replaceChildren(...list.map((c, i) => el('button', {
      class: 'story-mark', type: 'button', role: 'tab', 'aria-selected': 'false',
      style: `left:${posFor(i)}`,
      onclick: () => showChapter(i, true)
    }, c.when || `Chapter ${i + 1}`)));
    story.idx = -1;
    showChapter(0);
    if (!story.bound) bindStory();
    syncStoryTimer();
  }

  function showChapter(i, fromUser) {
    const list = chapters();
    const c = list[i];
    if (!c) return;
    const changed = i !== story.idx;
    story.idx = i;
    $('#storyWhen').textContent = c.when || '';
    $('#storyTitle').textContent = c.title || '';
    $('#storyText').textContent = c.text || '';
    document.querySelectorAll('.story-mark').forEach((m, k) => m.setAttribute('aria-selected', String(k === i)));
    $('#storyPin').style.left = posFor(i);
    $('#storyThread').style.width = n2w(i);
    if (changed) {
      const panel = $('#storyPanel');
      panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
    }
    // a reader who picks a chapter is announced; autoplay stays quiet
    $('#storyPanel').setAttribute('aria-live', fromUser ? 'polite' : 'off');
    restartProgress();
    if (fromUser) syncStoryTimer(true);
  }
  function n2w(i) {
    const n = chapters().length;
    return `calc((100% - 24px) * ${n < 2 ? 0 : i / (n - 1)})`;
  }

  function playing() { return !story.userPaused && story.inView && !story.hover && chapters().length > 1; }

  function restartProgress() {
    const bar = $('#storyProgress');
    bar.classList.remove('run'); void bar.offsetWidth;
    if (playing()) bar.classList.add('run');
  }

  function syncStoryTimer(reset) {
    const box = $('#story');
    box.classList.toggle('paused', !playing());
    const btn = $('#storyPlay');
    btn.setAttribute('aria-label', story.userPaused ? 'Play the story' : 'Pause the story');
    if (reset || !playing()) { clearTimeout(story.timer); story.timer = null; }
    if (playing() && !story.timer) {
      if (reset) restartProgress();
      else if (!$('#storyProgress').classList.contains('run')) restartProgress();
      story.timer = setTimeout(function next() {
        story.timer = null;
        showChapter((story.idx + 1) % chapters().length);
        syncStoryTimer();
      }, STORY_MS);
    }
  }

  function bindStory() {
    story.bound = true;
    const box = $('#story');
    box.style.setProperty('--story-ms', STORY_MS + 'ms');
    $('#storyPlay').addEventListener('click', () => { story.userPaused = !story.userPaused; syncStoryTimer(true); });
    // pause while the reader is pointing at or focused inside the story
    box.addEventListener('mouseenter', () => { story.hover = true; syncStoryTimer(true); });
    box.addEventListener('mouseleave', () => { story.hover = false; syncStoryTimer(true); });
    box.addEventListener('focusin', () => { story.hover = true; syncStoryTimer(true); });
    box.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget)) { story.hover = false; syncStoryTimer(true); } });
    // swipe on phones
    let x0 = null, y0 = null;
    box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      const n = chapters().length;
      showChapter((story.idx + (dx < 0 ? 1 : -1) + n) % n, true);
    });
    // arrow keys between chapter marks
    $('#storyMarks').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = chapters().length;
      const i = (story.idx + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      showChapter(i, true);
      document.querySelectorAll('.story-mark')[i].focus();
      e.preventDefault();
    });
    // only play while the section is on screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        story.inView = entries[0].isIntersecting;
        syncStoryTimer(true);
      }, { threshold: 0.35 }).observe(box);
    } else { story.inView = true; }
  }

  /* ---------- Contact: message composer + measurements ---------- */
  const MEASURES = [
    { key: 'bust', label: 'Bust', how: 'Around the fullest part of the bust, with the tape level under your arms.' },
    { key: 'waist', label: 'Waist', how: 'Around the narrowest part of your waist, usually just above the navel.' },
    { key: 'hip', label: 'Hip', how: 'Feet together, around the fullest part of your hips.' },
    { key: 'shoulder', label: 'Shoulder', how: 'Across your back, from the edge of one shoulder to the other.' },
    { key: 'length', label: 'Kurti length', how: 'From the top of the shoulder, next to the neck, down to where you want the hem.' },
    { key: 'sleeve', label: 'Sleeve length', how: 'From the edge of the shoulder down to where you want the sleeve to end.' }
  ];
  const REASONS = {
    custom: { line: 'I would like to get an outfit custom stitched.', ph: 'I would like a cotton kurti like the bandhani one, in navy, knee length.' },
    order: { line: 'I have a question about my order.', ph: 'Product name or code, and what you would like to know.' },
    alter: { line: 'I would like an alteration.', ph: 'Which piece it is and what needs changing, for example take in the waist by 1 inch.' },
    question: { line: 'I have a question.', ph: 'Ask about prices, fabric, delivery or anything else.' }
  };
  const comp = { reason: 'custom', unit: 'in', m: {}, active: 'bust' };

  function suggestSize() {
    const chart = (window.DARJI_CONFIG || {}).SIZE_CHART;
    if (!chart) return null;
    const toIn = v => comp.unit === 'cm' ? v / 2.54 : v;
    const have = ['bust', 'waist', 'hip'].filter(k => comp.m[k] > 0);
    if (!have.length) return null;
    for (const size of S.SIZES) {
      const c = chart[size];
      if (c && have.every(k => toIn(comp.m[k]) <= c[k] + 0.25)) return size;
    }
    return 'custom';
  }

  function composerMessage() {
    const name = $('#cName').value.trim(), city = $('#cCity').value.trim(), msg = $('#cMsg').value.trim();
    const lines = ['Hello Darji Brothers, ' + REASONS[comp.reason].line];
    if (name || city) { lines.push(''); if (name) lines.push('Name: ' + name); if (city) lines.push('City: ' + city); }
    if (msg) lines.push('', msg);
    const filled = MEASURES.filter(m => comp.m[m.key] > 0);
    if (filled.length) {
      lines.push('', `My measurements (${comp.unit === 'in' ? 'inches' : 'cm'}):`);
      filled.forEach(m => lines.push(`${m.label}: ${comp.m[m.key]}`));
      const size = suggestSize();
      if (size && size !== 'custom') lines.push(`Suggested size on your website: ${size}`);
    }
    return lines.join('\n');
  }

  function updateComposer() {
    if (!$('#cPreview')) return;
    const text = composerMessage();
    $('#cPreview').textContent = text;
    $('#cSend').href = waLink(text);
    // measurement UI state
    const filled = MEASURES.filter(m => comp.m[m.key] > 0).length;
    const size = suggestSize();
    $('#measureSummary').textContent = filled
      ? `${filled} of ${MEASURES.length} added` + (size ? (size === 'custom' ? ', custom fit recommended' : `, suggested size ${size}`) : '')
      : 'Optional. Tap a point on the dress form to see how to measure.';
    const sz = $('#mSize');
    sz.hidden = !size;
    if (size === 'custom') sz.replaceChildren('Your measurements are above our largest ready size, so we suggest ', el('strong', { text: 'Custom fit' }), '.');
    else if (size) sz.replaceChildren('Suggested ready size: ', el('strong', { text: size }), '. We confirm it before stitching.');
    document.querySelectorAll('.ff-lines path').forEach(p => {
      p.classList.toggle('on', p.dataset.m === comp.active);
      p.classList.toggle('done', comp.m[p.dataset.m] > 0);
    });
    document.querySelectorAll('.m-row').forEach(r => r.classList.toggle('on', r.dataset.m === comp.active));
    const a = MEASURES.find(m => m.key === comp.active);
    $('#mHowto').textContent = a ? `${a.label}: ${a.how}` : '';
  }

  function setActiveMeasure(key, focus) {
    comp.active = key;
    updateComposer();
    if (focus) { const i = $('#m-' + key); if (i) i.focus({ preventScroll: true }); }
  }

  function initComposer() {
    $('#mRows').replaceChildren(...MEASURES.map(m => {
      const input = el('input', { class: 'input', id: 'm-' + m.key, type: 'number', inputmode: 'decimal', min: '0', max: '200', step: '0.5', placeholder: '–' });
      input.addEventListener('focus', () => setActiveMeasure(m.key));
      input.addEventListener('input', () => { comp.m[m.key] = Number(input.value) || 0; updateComposer(); });
      return el('div', { class: 'm-row', 'data-m': m.key }, [el('label', { for: 'm-' + m.key, text: m.label }), input]);
    }));
    document.querySelectorAll('.ff-hits path').forEach(p => p.addEventListener('click', () => setActiveMeasure(p.dataset.m, true)));

    document.querySelectorAll('.reason').forEach(b => b.addEventListener('click', () => {
      comp.reason = b.dataset.reason;
      document.querySelectorAll('.reason').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      $('#cMsg').placeholder = REASONS[comp.reason].ph;
      if (comp.reason === 'custom' || comp.reason === 'alter') $('#measureBox').open = true;
      updateComposer();
    }));
    // arrow keys move between reasons
    $('#reasons').addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
      const all = [...document.querySelectorAll('.reason')];
      const i = all.findIndex(x => x.getAttribute('aria-checked') === 'true');
      const n = all[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
      e.preventDefault(); n.focus(); n.click();
    });

    document.querySelectorAll('.unit-toggle button').forEach(b => b.addEventListener('click', () => {
      const unit = b.dataset.unit;
      if (unit === comp.unit) return;
      Object.keys(comp.m).forEach(k => {
        if (!comp.m[k]) return;
        const v = unit === 'cm' ? comp.m[k] * 2.54 : comp.m[k] / 2.54;
        comp.m[k] = unit === 'cm' ? Math.round(v) : Math.round(v * 2) / 2;
        $('#m-' + k).value = comp.m[k];
      });
      comp.unit = unit;
      document.querySelectorAll('.unit-toggle button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      updateComposer();
    }));

    ['#cName', '#cCity', '#cMsg'].forEach(id => $(id).addEventListener('input', updateComposer));
    $('#composer').addEventListener('submit', e => e.preventDefault());

    document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const s = state.settings;
      const value = b.dataset.copy === 'whatsapp' ? prettyNumber() : b.dataset.copy === 'email' ? s.email : s.address;
      const label = b.textContent;
      try {
        await navigator.clipboard.writeText(value);
        b.textContent = 'Copied'; b.classList.add('done');
        setTimeout(() => { b.textContent = label; b.classList.remove('done'); }, 1800);
      } catch (e) { toast(value); }
    }));

    updateComposer();
  }

  /* ---------- Offer bar ---------- */
  function startOffer(offer) {
    if (!offer) return;
    const bar = $('#offerBar');
    $('#offerText').textContent = offer.text;
    bar.hidden = false;
    if (!offer.ends_at) return;
    const end = new Date(offer.ends_at).getTime();
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) { bar.hidden = true; clearInterval(timer); return; }
      const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
      $('#offerCount').textContent = 'Ends in ' + (d ? `${d}d ` : '') + `${h}h ${m}m`;
    };
    tick();
    const timer = setInterval(tick, 30000);
  }

  /* ---------- Tape numbers ---------- */
  function drawTape() {
    const count = Math.ceil((window.innerWidth * 1.1) / 48) + 2;
    ['#tapeNums', '#storyTapeNums'].forEach(sel => {
      const nums = $(sel);
      if (nums) nums.replaceChildren(...Array.from({ length: count }, (_, i) => el('span', { text: String(i) })));
    });
  }

  /* ---------- Catalogue ---------- */
  function categories() {
    const counts = new Map();
    state.products.forEach(p => counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return [['All', state.products.length], ...counts.entries()];
  }

  function renderChips() {
    const box = $('#categoryChips');
    box.replaceChildren(...categories().map(([name, n]) => el('button', {
      class: 'chip', type: 'button', role: 'tab',
      'aria-selected': String(state.category === name),
      onclick: () => { state.category = name; renderChips(); renderGrid(); }
    }, [name, el('span', { class: 'n', text: String(n) })])));
  }

  function renderSizeFilter() {
    const sel = $('#sizeFilter');
    const used = new Set(state.products.flatMap(p => p.sizes));
    S.SIZES.filter(s => used.has(s)).forEach(s => sel.append(el('option', { value: s, text: 'Size ' + s })));
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    let list = state.products.filter(p =>
      (state.category === 'All' || p.category === state.category) &&
      (!state.size || p.sizes.includes(state.size)) &&
      (!q || [p.name, p.category, p.fabric, p.description, ...p.colors.map(c => c.name)].join(' ').toLowerCase().includes(q))
    );
    if (state.sort === 'low') list.sort((a, b) => a.price - b.price);
    else if (state.sort === 'high') list.sort((a, b) => b.price - a.price);
    else if (state.sort === 'new') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else list.sort((a, b) => (b.in_stock - a.in_stock) || (b.featured - a.featured) || (b.is_new - a.is_new));
    return list;
  }

  function discount(p) {
    return p.mrp && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  }

  function placeholderImg() {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#F5ECEF"/><text x="200" y="260" font-family="Georgia,serif" font-size="28" text-anchor="middle" fill="#B0175C">Photo coming soon</text></svg>');
  }

  function cardFor(p) {
    const off = discount(p);
    const img = el('img', { src: p.images[0] || placeholderImg(), alt: p.name, loading: 'lazy', decoding: 'async' });
    const badges = el('div', { class: 'badges' }, [
      !p.in_stock ? el('span', { class: 'badge badge-out', text: 'Sold out' }) : null,
      p.is_new && p.in_stock ? el('span', { class: 'badge badge-new', text: 'New' }) : null,
    ]);
    const dots = el('span', { class: 'dots', 'aria-label': p.colors.length + ' colours' },
      [...p.colors.slice(0, 4).map(c => el('span', { class: 'dot', style: `background:${c.hex}`, title: c.name })),
        p.colors.length > 4 ? el('span', { class: 'more', text: '+' + (p.colors.length - 4) }) : null]);
    return el('button', { class: 'card', type: 'button', onclick: () => openProduct(p.id) }, [
      el('div', { class: 'card-img' }, [img, badges]),
      el('div', { class: 'card-body' }, [
        el('span', { class: 'card-cat', text: p.category }),
        el('span', { class: 'card-name', text: p.name }),
        el('span', { class: 'card-row' }, [
          el('span', { class: 'price' }, [
            S.formatPrice(p.price),
            off ? el('s', { text: S.formatPrice(p.mrp) }) : null,
            off ? el('span', { class: 'off', text: off + '% off' }) : null
          ]),
          dots
        ])
      ])
    ]);
  }

  function renderGrid() {
    const list = filtered();
    const grid = $('#productGrid');
    grid.replaceChildren(...list.map(cardFor));
    $('#emptyState').hidden = list.length > 0;
    $('#resultCount').textContent = list.length === 1 ? '1 piece' : `${list.length} pieces`;
  }

  function renderArrivals() {
    let list = state.products.filter(p => p.is_new && p.in_stock);
    if (list.length < 4) {
      const rest = state.products.filter(p => !list.includes(p) && p.in_stock)
        .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
      list = list.concat(rest);
    }
    list = list.slice(0, 4);
    $('#arrivals').hidden = list.length === 0;
    $('#newGrid').replaceChildren(...list.map(cardFor));
  }

  function renderCategoryTiles() {
    const cats = categories().slice(1);
    $('#categories').hidden = cats.length < 2;
    $('#categoryTiles').replaceChildren(...cats.map(([name, n]) => el('button', {
      class: 'cat-tile', type: 'button',
      onclick: () => {
        state.category = name; renderChips(); renderGrid();
        $('#shop').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }, el('span', { class: 'cat-name' }, [name, el('span', { text: n === 1 ? '1 piece' : n + ' pieces' })]))));
  }

  function renderFooter() {
    const s = state.settings;
    $('#footerAddr').hidden = !s.address;
    $('#footerAddr').textContent = s.address || '';
    const ig = String(s.instagram || '').replace(/^@/, '');
    $('#footerContacts').replaceChildren(
      ig ? el('a', { href: 'https://instagram.com/' + ig, target: '_blank', rel: 'noopener', text: 'Instagram @' + ig }) : null,
      el('a', { href: waLink('Hello Darji Brothers, I have a question.'), target: '_blank', rel: 'noopener', text: 'WhatsApp ' + prettyNumber() }),
      s.email ? el('a', { href: 'mailto:' + s.email, text: s.email }) : null
    );
  }

  /* ---------- Product sheet ---------- */
  function openProduct(id, { push = true } = {}) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    state.current = p;
    state.sel = { color: 0, size: p.sizes.length === 1 ? p.sizes[0] : '', qty: 1, image: (p.colors[0] && p.colors[0].img != null) ? p.colors[0].img : 0 };
    if (!p.sizes.length && !p.custom_fit) state.sel.size = '';
    if (!p.in_stock && p.custom_fit) state.sel.size = 'Custom fit';
    renderSheet();
    const d = $('#productSheet');
    if (!d.open) d.showModal();
    d.querySelector('.sheet-inner').scrollTop = 0;
    if (push && location.hash !== '#p-' + id) history.replaceState(null, '', '#p-' + id);
  }

  function renderSheet() {
    const p = state.current, sel = state.sel;
    const imgs = p.images.length ? p.images : [placeholderImg()];
    const main = $('#pMainImg');
    main.src = imgs[Math.min(sel.image, imgs.length - 1)];
    main.alt = p.name + (p.colors[sel.color] ? ' in ' + p.colors[sel.color].name : '');

    $('#pThumbs').hidden = imgs.length < 2;
    $('#pThumbs').replaceChildren(...imgs.map((src, i) => el('button', {
      type: 'button', 'aria-label': 'Photo ' + (i + 1), 'aria-current': String(i === sel.image),
      onclick: () => {
        sel.image = i;
        const ci = p.colors.findIndex(c => c.img === i);
        if (ci >= 0) sel.color = ci;
        renderSheet();
      }
    }, el('img', { src, alt: '' }))));

    $('#pCat').textContent = p.category;
    $('#pName').textContent = p.name;
    $('#pPrice').textContent = S.formatPrice(p.price);
    const off = discount(p);
    $('#pMrp').textContent = off ? S.formatPrice(p.mrp) : '';
    $('#pSave').textContent = off ? `Save ${off}%` : '';
    $('#pStockOut').hidden = p.in_stock;
    if (!p.in_stock && !p.custom_fit) $('#pStockOut').textContent = 'Sold out. Message us to check when it is back.';

    // colours
    $('#pColorsBox').hidden = !p.colors.length;
    $('#pColorName').textContent = p.colors[sel.color] ? p.colors[sel.color].name : '';
    $('#pColors').setAttribute('role', 'radiogroup');
    $('#pColors').setAttribute('aria-label', 'Colour');
    $('#pColors').replaceChildren(...p.colors.map((c, i) => el('button', {
      class: 'swatch', type: 'button', role: 'radio', 'aria-checked': String(i === sel.color),
      'aria-label': c.name, title: c.name, style: `background:${c.hex}`,
      onclick: () => {
        sel.color = i;
        if (c.img != null && c.img < imgs.length) sel.image = c.img;
        renderSheet();
      }
    })));

    // sizes
    const sizeOpts = [...S.SIZES.filter(s => p.sizes.includes(s))];
    const showSizes = sizeOpts.length || p.custom_fit;
    $('#pSizesBox').hidden = !showSizes;
    const sizes = $('#pSizes');
    sizes.setAttribute('role', 'radiogroup');
    sizes.setAttribute('aria-label', 'Size');
    sizes.replaceChildren(
      ...sizeOpts.map(s => el('button', {
        class: 'size', type: 'button', role: 'radio', 'aria-checked': String(sel.size === s),
        disabled: !p.in_stock, onclick: () => { sel.size = s; $('#pMsg').textContent = ''; renderSheet(); }
      }, s)),
      p.custom_fit ? el('button', {
        class: 'size custom', type: 'button', role: 'radio', 'aria-checked': String(sel.size === 'Custom fit'),
        onclick: () => { sel.size = 'Custom fit'; $('#pMsg').textContent = ''; renderSheet(); }
      }, 'Custom fit') : null
    );

    $('#qtyVal').textContent = sel.qty;

    $('#pFabricRow').hidden = !p.fabric;
    $('#pFabric').textContent = p.fabric;
    $('#pCareRow').hidden = !p.care;
    $('#pCare').textContent = p.care;
    $('#pCode').textContent = S.productCode(p);
    $('#pDesc').textContent = p.description;

    $('#pOrder').href = waLink(singleOrderMessage(p, sel));
    $('#pAdd').disabled = !p.in_stock && !p.custom_fit;
  }

  function needsSize() {
    const p = state.current;
    const hasSizes = p.sizes.length || p.custom_fit;
    return hasSizes && !state.sel.size;
  }

  function closeSheet() {
    $('#productSheet').close();
  }

  /* ---------- Bag ---------- */
  function saveBag() { S.ls.set('darji.bag', state.bag); }

  function renderBagCount() {
    const n = state.bag.reduce((a, b) => a + b.qty, 0);
    const c = $('#bagCount');
    c.textContent = n;
    c.dataset.empty = String(n === 0);
    $('#bagOpen').setAttribute('aria-label', `Open your bag, ${n} item${n === 1 ? '' : 's'}`);
  }

  function renderBag() {
    state.bag = state.bag.filter(i => state.products.some(p => p.id === i.id));
    const list = $('#bagList');
    let total = 0;
    list.replaceChildren(...state.bag.map((item, idx) => {
      const p = state.products.find(x => x.id === item.id);
      total += p.price * item.qty;
      const ci = p.colors.findIndex(c => c.name === item.color);
      const imgIdx = ci >= 0 && p.colors[ci].img != null ? p.colors[ci].img : 0;
      const meta = [item.color, item.size, 'Qty ' + item.qty].filter(Boolean).join(', ');
      return el('li', { class: 'bag-item' }, [
        el('img', { src: p.images[imgIdx] || p.images[0] || placeholderImg(), alt: '' }),
        el('div', {}, [
          el('h3', { text: p.name }),
          el('p', { text: meta }),
          el('button', { class: 'remove', type: 'button', onclick: () => { state.bag.splice(idx, 1); saveBag(); renderBag(); renderBagCount(); } }, 'Remove')
        ]),
        el('span', { class: 'bag-price', text: S.formatPrice(p.price * item.qty) })
      ]);
    }));
    const empty = state.bag.length === 0;
    $('#bagEmpty').hidden = !empty;
    $('#bagFoot').hidden = empty;
    $('#bagTotal').textContent = S.formatPrice(total);
    $('#bagOrder').href = waLink(bagMessage());
  }

  function addToBag() {
    const p = state.current, sel = state.sel;
    if (needsSize()) { $('#pMsg').textContent = 'Choose a size first.'; return; }
    const color = p.colors[sel.color] ? p.colors[sel.color].name : '';
    const existing = state.bag.find(i => i.id === p.id && i.color === color && i.size === sel.size);
    if (existing) existing.qty += sel.qty;
    else state.bag.push({ id: p.id, color, size: sel.size, qty: sel.qty });
    saveBag();
    renderBagCount();
    const b = $('#bagOpen');
    b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    toast('Added to bag');
  }

  /* ---------- Events ---------- */
  function bind() {
    const nav = $('#mainNav'), menuBtn = $('#menuBtn');
    const setMenu = open => {
      nav.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
    nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
    $('#searchInput').addEventListener('input', e => { state.query = e.target.value; renderGrid(); });
    $('#sizeFilter').addEventListener('change', e => { state.size = e.target.value; renderGrid(); });
    $('#sortSelect').addEventListener('change', e => { state.sort = e.target.value; renderGrid(); });
    $('#clearFilters').addEventListener('click', () => {
      state.category = 'All'; state.size = ''; state.query = '';
      $('#searchInput').value = ''; $('#sizeFilter').value = '';
      renderChips(); renderGrid();
    });

    document.querySelectorAll('dialog').forEach(d => {
      d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    });
    $('#productSheet').addEventListener('close', () => {
      if (location.hash.startsWith('#p-')) history.replaceState(null, '', location.pathname + location.search);
      document.body.appendChild($('#toast'));
    });
    $('#bagDrawer').addEventListener('close', () => document.body.appendChild($('#toast')));

    $('#qtyMinus').addEventListener('click', () => { state.sel.qty = Math.max(1, state.sel.qty - 1); renderSheet(); });
    $('#qtyPlus').addEventListener('click', () => { state.sel.qty = Math.min(20, state.sel.qty + 1); renderSheet(); });
    $('#pAdd').addEventListener('click', addToBag);
    $('#pOrder').addEventListener('click', e => {
      if (needsSize()) { e.preventDefault(); $('#pMsg').textContent = 'Choose a size first, or pick Custom fit.'; }
    });
    $('#pShare').addEventListener('click', async () => {
      const url = productUrl(state.current);
      try { await navigator.clipboard.writeText(url); toast('Link copied'); }
      catch (e) { toast(url); }
    });

    $('#bagOpen').addEventListener('click', () => { renderBag(); $('#bagDrawer').showModal(); });
    $('#bagClear').addEventListener('click', () => { state.bag = []; saveBag(); renderBag(); renderBagCount(); });

    window.addEventListener('hashchange', routeFromHash);
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawTape, 200); });
  }

  function routeFromHash() {
    const m = location.hash.match(/^#p-(.+)$/);
    if (m) openProduct(decodeURIComponent(m[1]), { push: false });
  }

  /* ---------- Boot ---------- */
  async function boot() {
    $('#year').textContent = new Date().getFullYear();
    const logo = (window.DARJI_CONFIG || {}).LOGO;
    if (logo) $('#logo').replaceChildren(el('img', { src: logo, alt: '' }));
    drawTape();
    bind();
    initComposer();
    renderBagCount();
    try {
      state.db = await S.connect();
      const [products, settings, offer] = await Promise.all([
        state.db.listProducts(),
        state.db.getSettings(),
        state.db.getActiveOffer()
      ]);
      state.products = products.filter(p => p.visible);
      state.settings = settings;
      applySettings();
      startOffer(offer);
      setInterval(renderHours, 60000);
      renderChips();
      renderSizeFilter();
      renderGrid();
      renderArrivals();
      renderCategoryTiles();
      $('#demoNote').hidden = !(state.db.mode === 'demo' && state.products.some(p => p.sample));
      if (!state.products.length) {
        $('#productGrid').replaceChildren();
        const e = $('#emptyState');
        e.hidden = false;
        e.querySelector('h3').textContent = 'New collection arriving soon';
        e.querySelector('p').textContent = 'We are photographing our latest pieces. Message us on WhatsApp to see what is available today.';
        $('#clearFilters').hidden = true;
      }
      routeFromHash();
    } catch (err) {
      console.error(err);
      state.settings = await Promise.resolve({ whatsapp: (window.DARJI_CONFIG || {}).WHATSAPP, instagram: (window.DARJI_CONFIG || {}).INSTAGRAM, email: (window.DARJI_CONFIG || {}).EMAIL });
      applySettings();
      $('#productGrid').replaceChildren(el('p', { class: 'loading', text: 'The collection could not load. Check your connection and refresh the page, or message us on WhatsApp.' }));
    }
  }

  boot();
})();
