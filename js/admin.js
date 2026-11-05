/* Darji Brothers — admin page */
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
  const DEFAULT_CATS = ['Kurtis', 'Co-ord sets', 'Anarkali', 'Kurta sets', 'Dupattas', 'Lehenga', 'Gowns', 'Custom outfits'];

  const state = {
    db: null,
    user: null,
    products: [],
    offers: [],
    pendingDelete: null,
    draft: null,        // product being edited
    uploading: 0
  };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    const open = document.querySelector('dialog[open]');
    (open || document.body).appendChild(t);
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function msg(id, text, ok = false) {
    const m = $('#' + id);
    m.textContent = text || '';
    m.classList.toggle('ok', ok);
  }

  /* ---------------- Auth ---------------- */
  function showLogin() {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    const demo = state.db.mode === 'demo';
    $('#demoEnter').hidden = !demo;
    document.querySelectorAll('.real-login').forEach(n => { n.hidden = demo; });
  }

  async function onDemoEnter() {
    try {
      state.user = { email: 'Demo admin' };
      await state.db.signIn('Demo admin', null, { demo: true });
      await showApp();
    } catch (err) { msg('loginMsg', err.message); }
  }

  async function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    $('#whoAmI').textContent = state.user && state.user.email ? state.user.email : '';
    $('#modeBanner').hidden = state.db.mode !== 'demo';
    $('#demoTools').hidden = state.db.mode !== 'demo';
    $('#pwForm').hidden = state.db.mode === 'demo';
    $('#accountSub').textContent = state.db.mode === 'demo'
      ? 'Demo mode has no password. Once Supabase is connected you sign in with your own email and password, and can change it here.'
      : 'Signed in as ' + (state.user.email || '') + '.';
    await Promise.all([loadProducts(), loadOffers(), loadSettings()]);
  }

  async function onLogin(e) {
    e.preventDefault();
    msg('loginMsg', '');
    const email = $('#loginEmail').value.trim();
    const pw = $('#loginPassword').value;
    if (state.db.mode !== 'demo' && !email) return msg('loginMsg', 'Enter your email.');
    if (!pw) return msg('loginMsg', 'Enter your password.');
    const btn = $('#loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      state.user = await state.db.signIn(email, pw);
      if (!(await state.db.isAdmin())) {
        await state.db.signOut();
        throw new Error('This account is not on the admin list. Add its email to the admins table in Supabase (see README step 4).');
      }
      $('#loginPassword').value = '';
      await showApp();
    } catch (err) {
      msg('loginMsg', /invalid login/i.test(err.message) ? 'Email or password is wrong.' : err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  }

  async function onForgot() {
    msg('loginMsg', '');
    const email = $('#loginEmail').value.trim();
    if (state.db.mode !== 'demo' && !email) return msg('loginMsg', 'Type your email above, then tap Forgot password again.');
    try {
      await state.db.sendReset(email);
      msg('loginMsg', 'Check your inbox for a link to set a new password.', true);
    } catch (err) { msg('loginMsg', err.message); }
  }

  async function onRecover(e) {
    e.preventDefault();
    const pw = $('#recoverPw').value;
    if (pw.length < 8) return msg('recoverMsg', 'Use at least 8 characters.');
    try {
      await state.db.changePassword(pw);
      history.replaceState(null, '', location.pathname);
      $('#recoverForm').hidden = true;
      $('#loginForm').hidden = false;
      state.user = await state.db.getUser();
      if (state.user && await state.db.isAdmin()) { toast('Password saved'); await showApp(); }
      else msg('loginMsg', 'Password saved. Sign in with your new password.', true);
    } catch (err) { msg('recoverMsg', err.message); }
  }

  /* ---------------- Tabs ---------------- */
  function selectTab(name) {
    document.querySelectorAll('.tabs [role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    document.querySelectorAll('[role=tabpanel]').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
  }

  /* ---------------- Products list ---------------- */
  async function loadProducts() {
    try {
      state.products = await state.db.listProducts({ includeHidden: true });
    } catch (err) {
      state.products = [];
      toast('Could not load products: ' + err.message);
    }
    renderCats();
    renderProducts();
  }

  function allCategories() {
    return [...new Set([...state.products.map(p => p.category), ...DEFAULT_CATS])];
  }

  function renderCats() {
    const cats = allCategories();
    $('#catList').replaceChildren(...cats.map(c => el('option', { value: c })));
    const sel = $('#adminCat');
    const current = sel.value;
    sel.replaceChildren(el('option', { value: '', text: 'All categories' }),
      ...[...new Set(state.products.map(p => p.category))].map(c => el('option', { value: c, text: c })));
    sel.value = current;
  }

  function renderProducts() {
    const q = $('#adminSearch').value.trim().toLowerCase();
    const cat = $('#adminCat').value;
    const list = state.products.filter(p =>
      (!cat || p.category === cat) &&
      (!q || (p.name + ' ' + p.category + ' ' + S.productCode(p)).toLowerCase().includes(q)));

    const shown = state.products.filter(p => p.visible).length;
    const out = state.products.filter(p => !p.in_stock).length;
    $('#productStats').textContent = `${state.products.length} products, ${shown} on the shop` + (out ? `, ${out} sold out` : '');

    $('#productEmpty').hidden = state.products.length > 0;
    $('#productList').hidden = state.products.length === 0;
    $('#productList').replaceChildren(...list.map(p => {
      const confirming = state.pendingDelete === p.id;
      return el('li', { class: 'prow' }, [
        el('img', { src: p.images[0] || '', alt: '' }),
        el('div', { class: 'prow-main' }, [
          el('span', { class: 'prow-name', text: p.name }),
          el('span', { class: 'prow-meta', text: `${p.category}, ${S.productCode(p)}, ${p.colors.length} colour${p.colors.length === 1 ? '' : 's'}` }),
          el('span', { class: 'prow-tags' }, [
            !p.visible ? el('span', { class: 'tag hidden-tag', text: 'Hidden' }) : null,
            !p.in_stock ? el('span', { class: 'tag out', text: 'Sold out' }) : null,
            p.is_new ? el('span', { class: 'tag new', text: 'New' }) : null,
            p.featured ? el('span', { class: 'tag feat', text: 'Featured' }) : null
          ])
        ]),
        el('span', { class: 'prow-price', text: S.formatPrice(p.price) }),
        el('span', { class: 'prow-actions' }, confirming ? [
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { state.pendingDelete = null; renderProducts(); } }, 'Keep'),
          el('button', { class: 'btn btn-primary danger-confirm', type: 'button', onclick: () => deleteProduct(p) }, 'Delete for good')
        ] : [
          el('button', { class: 'btn btn-outline', type: 'button', onclick: () => openEditor(p) }, 'Edit'),
          el('button', { class: 'btn btn-ghost danger', type: 'button', 'aria-label': 'Delete ' + p.name, onclick: () => { state.pendingDelete = p.id; renderProducts(); } }, 'Delete')
        ])
      ]);
    }));
  }

  async function deleteProduct(p) {
    try {
      await state.db.deleteProduct(p.id, p.images);
      state.pendingDelete = null;
      toast('Deleted ' + p.name);
      await loadProducts();
    } catch (err) { toast('Could not delete: ' + err.message); }
  }

  /* ---------------- Product editor ---------------- */
  function openEditor(p) {
    const base = p ? JSON.parse(JSON.stringify(p)) : {
      id: '', name: '', category: '', price: '', mrp: null, description: '', fabric: '', care: '',
      sizes: ['S', 'M', 'L', 'XL', 'XXL'], custom_fit: true, colors: [], images: [],
      visible: true, in_stock: true, is_new: true, featured: false, sort_order: 0
    };
    // While editing, colours point at a photo URL so reordering photos keeps the link.
    base.colors = base.colors.map(c => ({ name: c.name, hex: c.hex, imgUrl: c.img != null ? base.images[c.img] || '' : '' }));
    state.draft = Object.assign(base, { _original: p ? p.images.slice() : [], _uploaded: [] });

    $('#editorTitle').textContent = p ? 'Edit product' : 'Add product';
    $('#fId').value = base.id || '';
    $('#fName').value = base.name;
    $('#fCategory').value = base.category;
    $('#fPrice').value = base.price === '' ? '' : base.price;
    $('#fMrp').value = base.mrp != null ? base.mrp : '';
    $('#fDesc').value = base.description;
    $('#fFabric').value = base.fabric;
    $('#fCare').value = base.care;
    $('#fCustom').checked = base.custom_fit;
    $('#fVisible').checked = base.visible;
    $('#fInStock').checked = base.in_stock;
    $('#fNew').checked = base.is_new;
    $('#fFeatured').checked = base.featured;
    $('#fOrder').value = base.sort_order || 0;
    $('#photoUrl').value = '';
    $('#uploadStatus').textContent = '';
    msg('productMsg', '');

    $('#sizeChecks').replaceChildren(...S.SIZES.map(s => el('label', {}, [
      el('input', { type: 'checkbox', value: s, checked: base.sizes.includes(s) }),
      el('span', { text: s })
    ])));

    if (!base.colors.length) base.colors.push({ name: '', hex: '#B0175C', imgUrl: '' });
    renderPhotos();
    renderColors();
    $('#editor').showModal();
    $('.editor-body').scrollTop = 0;
    if (!p) setTimeout(() => $('#fName').focus(), 50);
  }

  function renderPhotos() {
    const d = state.draft;
    $('#photoList').replaceChildren(...d.images.map((src, i) => el('div', { class: 'photo' }, [
      el('img', { src, alt: 'Photo ' + (i + 1) }),
      i === 0 ? el('span', { class: 'cover', text: 'Cover' }) : null,
      el('span', { class: 'num', text: String(i + 1) }),
      el('div', { class: 'photo-tools' }, [
        el('button', { type: 'button', 'aria-label': 'Move photo ' + (i + 1) + ' earlier', disabled: i === 0, onclick: () => movePhoto(i, -1) }, '‹'),
        el('button', { type: 'button', class: 'del', 'aria-label': 'Remove photo ' + (i + 1), onclick: () => removePhoto(i) }, '×'),
        el('button', { type: 'button', 'aria-label': 'Move photo ' + (i + 1) + ' later', disabled: i === d.images.length - 1, onclick: () => movePhoto(i, 1) }, '›')
      ])
    ])));
    renderColors(); // photo choices in colour rows depend on the photo list
  }

  function movePhoto(i, dir) {
    const a = state.draft.images, j = i + dir;
    [a[i], a[j]] = [a[j], a[i]];
    renderPhotos();
  }

  function removePhoto(i) {
    const url = state.draft.images.splice(i, 1)[0];
    state.draft.colors.forEach(c => { if (c.imgUrl === url) c.imgUrl = ''; });
    renderPhotos();
  }

  async function addFiles(files) {
    const list = [...files].filter(f => f.type.startsWith('image/'));
    if (!list.length) return;
    state.uploading += list.length;
    $('#saveProductBtn').disabled = true;
    let done = 0;
    for (const f of list) {
      $('#uploadStatus').textContent = `Uploading ${done + 1} of ${list.length}…`;
      try {
        const url = await state.db.uploadImage(f);
        state.draft.images.push(url);
        state.draft._uploaded.push(url);
        // first upload for a colour without a photo gets linked automatically
        const free = state.draft.colors.find(c => !c.imgUrl);
        if (free && state.draft.images.length <= state.draft.colors.length) free.imgUrl = url;
        renderPhotos();
      } catch (err) {
        toast('Could not upload ' + f.name + ': ' + err.message);
      }
      done++;
      state.uploading--;
    }
    $('#uploadStatus').textContent = done ? `${done} photo${done === 1 ? '' : 's'} added.` : '';
    $('#saveProductBtn').disabled = state.uploading > 0;
  }

  function renderColors() {
    const d = state.draft;
    if (!d) return;
    $('#colorList').replaceChildren(...d.colors.map((c, i) => {
      const photoSel = el('select', { class: 'input', 'aria-label': 'Photo for colour ' + (i + 1) },
        [el('option', { value: '', text: 'No photo linked' }),
          ...d.images.map((u, k) => el('option', { value: String(k), text: 'Photo ' + (k + 1), selected: c.imgUrl === u }))]);
      photoSel.addEventListener('change', () => { c.imgUrl = photoSel.value === '' ? '' : d.images[Number(photoSel.value)]; });
      const picker = el('input', { type: 'color', value: c.hex || '#B0175C', 'aria-label': 'Colour ' + (i + 1) + ' shade' });
      picker.addEventListener('input', () => { c.hex = picker.value; });
      const name = el('input', { class: 'input', value: c.name, placeholder: 'Colour name, e.g. Rani pink', 'aria-label': 'Colour ' + (i + 1) + ' name', maxlength: '40' });
      name.addEventListener('input', () => { c.name = name.value; });
      return el('div', { class: 'color-row' }, [
        picker, name, photoSel,
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove colour ' + (i + 1), onclick: () => { d.colors.splice(i, 1); renderColors(); } },
          el('span', { 'aria-hidden': 'true', text: '×', style: 'font-size:1.4rem;line-height:1' }))
      ]);
    }));
  }

  async function onSaveProduct(e) {
    e.preventDefault();
    const d = state.draft;
    const name = $('#fName').value.trim();
    const category = $('#fCategory').value.trim();
    const price = $('#fPrice').value;
    if (!name) return msg('productMsg', 'Add a product name.');
    if (!category) return msg('productMsg', 'Add a category.');
    if (price === '' || Number(price) < 0) return msg('productMsg', 'Add a price in rupees.');
    if (state.uploading) return msg('productMsg', 'Wait for the photos to finish uploading.');

    const colors = d.colors.filter(c => c.name.trim()).map(c => {
      const idx = c.imgUrl ? d.images.indexOf(c.imgUrl) : -1;
      return { name: c.name.trim(), hex: c.hex, img: idx >= 0 ? idx : null };
    });
    const mrp = $('#fMrp').value;
    const product = {
      id: $('#fId').value || undefined,
      name, category,
      price: Math.round(Number(price)),
      mrp: mrp !== '' && Number(mrp) > Number(price) ? Math.round(Number(mrp)) : null,
      description: $('#fDesc').value.trim(),
      fabric: $('#fFabric').value.trim(),
      care: $('#fCare').value.trim(),
      sizes: [...document.querySelectorAll('#sizeChecks input:checked')].map(i => i.value),
      custom_fit: $('#fCustom').checked,
      colors,
      images: d.images.slice(),
      visible: $('#fVisible').checked,
      in_stock: $('#fInStock').checked,
      is_new: $('#fNew').checked,
      featured: $('#fFeatured').checked,
      sort_order: Number($('#fOrder').value) || 0,
      created_at: d.created_at
    };

    const btn = $('#saveProductBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await state.db.saveProduct(product);
      const removed = d._original.filter(u => !product.images.includes(u));
      await state.db.removeImages(removed);
      d._uploaded = []; // keep these, they belong to the saved product now
      state.draft = null;
      $('#editor').close();
      toast(product.id ? 'Saved changes' : 'Added ' + name);
      await loadProducts();
    } catch (err) {
      msg('productMsg', 'Could not save: ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Save product';
    }
  }

  function onEditorClose() {
    document.body.appendChild($('#toast'));
    // Cancelled: delete photos uploaded during this edit so they don't fill storage.
    if (state.draft && state.draft._uploaded.length) state.db.removeImages(state.draft._uploaded);
    state.draft = null;
  }

  /* ---------------- Offers ---------------- */
  async function loadOffers() {
    try { state.offers = await state.db.listOffers(); } catch (err) { state.offers = []; }
    renderOffers();
  }

  function renderOffers() {
    const now = Date.now();
    const activeId = (state.offers.find(o => o.active && (!o.ends_at || new Date(o.ends_at).getTime() > now)) || {}).id;
    $('#offerList').replaceChildren(...state.offers.map(o => {
      const ended = o.ends_at && new Date(o.ends_at).getTime() <= now;
      const when = o.ends_at ? new Date(o.ends_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No end date';
      const status = o.id === activeId ? 'Showing on the shop' : ended ? 'Ended' : o.active ? 'Waiting (a newer offer is showing)' : 'Turned off';
      const confirming = state.pendingDelete === 'offer:' + o.id;
      return el('li', { class: 'orow' }, [
        el('div', {}, [
          el('strong', { text: o.text }),
          el('span', { class: o.id === activeId ? 'live' : '', text: status }),
          el('span', { text: '. Ends: ' + when })
        ]),
        el('div', { class: 'form-actions' }, confirming ? [
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { state.pendingDelete = null; renderOffers(); } }, 'Keep'),
          el('button', { class: 'btn btn-primary danger-confirm', type: 'button', onclick: () => deleteOffer(o) }, 'Delete')
        ] : [
          el('button', { class: 'btn btn-outline', type: 'button', onclick: () => editOffer(o) }, 'Edit'),
          el('button', { class: 'btn btn-ghost danger', type: 'button', onclick: () => { state.pendingDelete = 'offer:' + o.id; renderOffers(); } }, 'Delete')
        ])
      ]);
    }));
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function editOffer(o) {
    $('#offerId').value = o.id;
    $('#offerTextIn').value = o.text;
    if (o.ends_at) {
      const d = new Date(o.ends_at);
      $('#offerDate').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      $('#offerTime').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else { $('#offerDate').value = ''; }
    $('#offerActive').checked = !!o.active;
    $('#offerSave').textContent = 'Save changes';
    $('#offerReset').hidden = false;
    $('#offerTextIn').focus();
  }
  function resetOfferForm() {
    $('#offerForm').reset();
    $('#offerId').value = '';
    $('#offerTime').value = '23:59';
    $('#offerSave').textContent = 'Save offer';
    $('#offerReset').hidden = true;
    msg('offerMsg', '');
  }
  async function onSaveOffer(e) {
    e.preventDefault();
    const text = $('#offerTextIn').value.trim();
    if (!text) return msg('offerMsg', 'Write the offer text.');
    let ends_at = null;
    if ($('#offerDate').value) {
      ends_at = new Date(`${$('#offerDate').value}T${$('#offerTime').value || '23:59'}`).toISOString();
      if (new Date(ends_at).getTime() <= Date.now()) return msg('offerMsg', 'The end time is in the past. Pick a later date.');
    }
    try {
      await state.db.saveOffer({ id: $('#offerId').value || undefined, text, ends_at, active: $('#offerActive').checked });
      toast('Offer saved');
      resetOfferForm();
      await loadOffers();
    } catch (err) { msg('offerMsg', 'Could not save: ' + err.message); }
  }
  async function deleteOffer(o) {
    try { await state.db.deleteOffer(o.id); state.pendingDelete = null; toast('Offer deleted'); await loadOffers(); }
    catch (err) { toast('Could not delete: ' + err.message); }
  }

  /* ---------------- Settings ---------------- */
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let storyDraft = [];

  async function loadSettings() {
    const s = await state.db.getSettings();
    $('#setWa').value = s.whatsapp || '';
    $('#setIg').value = s.instagram || '';
    $('#setEmail').value = s.email || '';
    $('#setAddr').value = s.address || '';
    $('#setAbout').value = s.about || '';
    const h = s.hours || {};
    $('#setOpen').value = h.open || '';
    $('#setClose').value = h.close || '';
    $('#closedDays').replaceChildren(...DAYS.map(d => el('label', {}, [
      el('input', { type: 'checkbox', value: d, checked: (h.closed || []).includes(d) }),
      el('span', { text: d })
    ])));
    storyDraft = (s.story || []).map(c => ({ when: c.when || '', title: c.title || '', text: c.text || '' }));
    renderChapters();
  }

  function renderChapters() {
    $('#storyRows').replaceChildren(...storyDraft.map((c, i) => {
      const field = (key, label, tag, ph) => {
        const input = el(tag, { class: 'input', placeholder: ph, 'aria-label': `Chapter ${i + 1} ${label}`, maxlength: tag === 'textarea' ? '400' : '60' });
        input.value = c[key];
        input.addEventListener('input', () => { c[key] = input.value; });
        return el('label', { class: 'field' }, [el('span', { text: label }), input]);
      };
      return el('div', { class: 'chapter' }, [
        el('div', { class: 'chapter-head' }, [
          el('strong', { text: 'Chapter ' + (i + 1) }),
          el('div', { class: 'chapter-tools' }, [
            el('button', { type: 'button', 'aria-label': 'Move chapter ' + (i + 1) + ' up', disabled: i === 0, onclick: () => { [storyDraft[i - 1], storyDraft[i]] = [storyDraft[i], storyDraft[i - 1]]; renderChapters(); } }, '↑'),
            el('button', { type: 'button', 'aria-label': 'Move chapter ' + (i + 1) + ' down', disabled: i === storyDraft.length - 1, onclick: () => { [storyDraft[i + 1], storyDraft[i]] = [storyDraft[i], storyDraft[i + 1]]; renderChapters(); } }, '↓'),
            el('button', { type: 'button', class: 'del', 'aria-label': 'Remove chapter ' + (i + 1), onclick: () => { storyDraft.splice(i, 1); renderChapters(); } }, '×')
          ])
        ]),
        el('div', { class: 'row-2' }, [
          field('when', 'When', 'input', '1976'),
          field('title', 'Title', 'input', 'The first shop')
        ]),
        field('text', 'What happened', 'textarea', 'Two or three sentences about this moment.')
      ]);
    }));
  }

  async function onSaveSettings(e) {
    e.preventDefault();
    const wa = $('#setWa').value.replace(/\D/g, '');
    if (wa.length < 10) return msg('settingsMsg', 'Enter the WhatsApp number with country code, for example 918980223301.');
    const open = $('#setOpen').value, close = $('#setClose').value;
    if ((open && !close) || (!open && close)) return msg('settingsMsg', 'Add both an opening and a closing time, or leave both empty.');
    if (open && close && open >= close) return msg('settingsMsg', 'The closing time must be after the opening time.');
    try {
      await state.db.saveSettings({
        whatsapp: wa,
        instagram: $('#setIg').value.trim().replace(/^@/, ''),
        email: $('#setEmail').value.trim(),
        address: $('#setAddr').value.trim(),
        about: $('#setAbout').value.trim(),
        hours: { open, close, closed: [...document.querySelectorAll('#closedDays input:checked')].map(i => i.value) },
        story: storyDraft.map(c => ({ when: c.when.trim(), title: c.title.trim(), text: c.text.trim() })).filter(c => c.title || c.text)
      });
      $('#setWa').value = wa;
      msg('settingsMsg', 'Store details saved.', true);
      toast('Store details saved');
    } catch (err) { msg('settingsMsg', 'Could not save: ' + err.message); }
  }

  /* ---------------- Account ---------------- */
  async function onChangePw(e) {
    e.preventDefault();
    const a = $('#pwNew').value, b = $('#pwNew2').value;
    if (a.length < 8) return msg('pwMsg', 'Use at least 8 characters.');
    if (a !== b) return msg('pwMsg', 'The two passwords do not match.');
    try {
      await state.db.changePassword(a);
      $('#pwForm').reset();
      msg('pwMsg', 'Password changed.', true);
    } catch (err) { msg('pwMsg', err.message); }
  }

  /* ---------------- Wiring ---------------- */
  function bind() {
    $('#loginForm').addEventListener('submit', onLogin);
    $('#forgotBtn').addEventListener('click', onForgot);
    $('#demoEnterBtn').addEventListener('click', onDemoEnter);
    $('#recoverForm').addEventListener('submit', onRecover);
    $('#signOutBtn').addEventListener('click', async () => { await state.db.signOut(); state.user = null; showLogin(); });

    document.querySelectorAll('.tabs [role=tab]').forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));

    $('#addProductBtn').addEventListener('click', () => openEditor(null));
    $('#addFirstBtn').addEventListener('click', () => openEditor(null));
    $('#adminSearch').addEventListener('input', renderProducts);
    $('#adminCat').addEventListener('change', renderProducts);

    const editor = $('#editor');
    editor.addEventListener('click', e => { if (e.target.closest('[data-close]')) editor.close(); });
    editor.addEventListener('close', onEditorClose);
    $('#productForm').addEventListener('submit', onSaveProduct);
    $('#addColorBtn').addEventListener('click', () => { state.draft.colors.push({ name: '', hex: '#0E4E54', imgUrl: '' }); renderColors(); });
    $('#photoInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    const dz = $('#dropZone');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => addFiles(e.dataTransfer.files));
    $('#photoUrlAdd').addEventListener('click', () => {
      const u = $('#photoUrl').value.trim();
      if (!/^https:\/\//i.test(u)) { $('#uploadStatus').textContent = 'Paste a link that starts with https://'; return; }
      state.draft.images.push(u);
      $('#photoUrl').value = '';
      $('#uploadStatus').textContent = 'Image link added.';
      renderPhotos();
    });

    $('#offerForm').addEventListener('submit', onSaveOffer);
    $('#offerReset').addEventListener('click', resetOfferForm);
    $('#settingsForm').addEventListener('submit', onSaveSettings);
    $('#addChapterBtn').addEventListener('click', () => { storyDraft.push({ when: '', title: '', text: '' }); renderChapters(); });
    $('#pwForm').addEventListener('submit', onChangePw);
    $('#resetDemoBtn').addEventListener('click', () => { $('#resetDemoConfirm').hidden = false; });
    $('#resetDemoConfirm').addEventListener('click', async () => {
      await state.db.resetDemo();
      $('#resetDemoConfirm').hidden = true;
      toast('Demo data reset');
      await Promise.all([loadProducts(), loadOffers(), loadSettings()]);
    });
  }

  async function boot() {
    bind();
    // Read before Supabase loads: it removes the token from the address bar.
    let recovering = /type=recovery/.test(location.hash);
    try {
      state.db = await S.connect();
    } catch (err) {
      $('#loginView').hidden = false;
      msg('loginMsg', err.message);
      return;
    }
    state.db.onAuthChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        recovering = true;
        $('#appView').hidden = true;
        $('#loginView').hidden = false;
        $('#loginForm').hidden = true;
        $('#recoverForm').hidden = false;
      }
    });
    state.user = await state.db.getUser();
    if (recovering) {
      showLogin();
      $('#loginForm').hidden = true;
      $('#recoverForm').hidden = false;
      return;
    }
    if (state.user && await state.db.isAdmin()) await showApp();
    else showLogin();
  }

  boot();
})();
