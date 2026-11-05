/*
 * Data layer shared by the shop (index.html) and the admin page.
 * Uses Supabase when js/config.js has a URL and key, otherwise demo mode
 * with sample products stored in this browser only.
 */
(function () {
  const CFG = window.DARJI_CONFIG || {};
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.99.3/dist/umd/supabase.js';
  const LS_PRODUCTS = 'darji.demo.products';
  const LS_OFFERS = 'darji.demo.offers';
  const LS_SETTINGS = 'darji.demo.settings';
  const LS_DEMO_AUTH = 'darji.demo.auth';
  const LS_DEMO_PW = 'darji.demo.password';

  const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
  const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY);

  const ls = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  function normalise(p) {
    return {
      id: p.id,
      name: p.name || '',
      category: p.category || 'Other',
      price: Number(p.price) || 0,
      mrp: p.mrp != null && p.mrp !== '' ? Number(p.mrp) : null,
      description: p.description || '',
      fabric: p.fabric || '',
      care: p.care || '',
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      custom_fit: p.custom_fit !== false,
      colors: Array.isArray(p.colors) ? p.colors : [],
      images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
      visible: p.visible !== false,
      in_stock: p.in_stock !== false,
      is_new: !!p.is_new,
      featured: !!p.featured,
      sort_order: Number(p.sort_order) || 0,
      created_at: p.created_at || new Date().toISOString(),
      sample: !!p.sample
    };
  }

  // Placeholder chapters for the About us tape. Replace them with your
  // real story from Admin → Store details.
  const DEFAULT_STORY = [
    { when: '50 years ago', title: 'Where it began', text: 'Darji Brothers started with a sewing machine and a measuring tape, stitching clothes to measure for customers who came back year after year.' },
    { when: 'Over the years', title: 'Learning every fit', text: 'Five decades of stitching taught us that a good outfit starts with the right measurements. Every size from S to XXXXL is still cut and stitched in-house.' },
    { when: 'Today', title: 'Kurtis, co-ord sets and custom outfits', text: 'Today we make premium ladies’ wear, from everyday kurtis to festive anarkalis, and take orders on WhatsApp so you can shop from home.' }
  ];

  function defaultSettings() {
    return {
      whatsapp: CFG.WHATSAPP || '',
      instagram: CFG.INSTAGRAM || '',
      email: CFG.EMAIL || '',
      address: CFG.ADDRESS || '',
      about: '',
      hours: { open: '', close: '', closed: [] },   // e.g. { open: '10:00', close: '20:30', closed: ['Sun'] }
      story: DEFAULT_STORY
    };
  }

  function mergeSettings(row) {
    const d = defaultSettings();
    if (!row) return d;
    ['whatsapp', 'instagram', 'email', 'address', 'about'].forEach(k => {
      if (row[k] != null && String(row[k]).trim() !== '') d[k] = row[k];
    });
    if (row.hours && typeof row.hours === 'object') {
      d.hours = { open: row.hours.open || '', close: row.hours.close || '', closed: Array.isArray(row.hours.closed) ? row.hours.closed : [] };
    }
    if (Array.isArray(row.story)) {
      const s = row.story.filter(c => c && (c.title || c.text));
      if (s.length) d.story = s;
    }
    return d;
  }

  function sortProducts(list) {
    return list.slice().sort((a, b) =>
      (a.sort_order - b.sort_order) || (new Date(b.created_at) - new Date(a.created_at)));
  }

  /* ---------------- Image compression (both modes) ---------------- */
  function compressImage(file, maxSide = 1400, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error(file.name + ' is not an image.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(blob => {
          if (blob && blob.type === 'image/webp') return resolve(blob);
          c.toBlob(b2 => b2 ? resolve(b2) : reject(new Error('Could not read ' + file.name)), 'image/jpeg', quality);
        }, 'image/webp', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read ' + file.name)); };
      img.src = url;
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /* ---------------- Demo adapter ---------------- */
  const demo = {
    mode: 'demo',
    async init() { return this; },
    _products() {
      const saved = ls.get(LS_PRODUCTS, null);
      return (saved || window.DARJI_SAMPLE_PRODUCTS || []).map(normalise);
    },
    async listProducts({ includeHidden = false } = {}) {
      const all = sortProducts(this._products());
      return includeHidden ? all : all.filter(p => p.visible);
    },
    async saveProduct(p) {
      const all = this._products();
      const row = normalise(Object.assign({}, p, { id: p.id || ('d' + Date.now().toString(36)) }));
      const i = all.findIndex(x => x.id === row.id);
      if (i >= 0) all[i] = Object.assign({}, all[i], row); else all.unshift(row);
      if (!ls.set(LS_PRODUCTS, all)) throw new Error('This browser ran out of demo storage. Use smaller photos, or connect Supabase.');
      return row;
    },
    async deleteProduct(id) {
      ls.set(LS_PRODUCTS, this._products().filter(p => p.id !== id));
    },
    async uploadImage(file) {
      const blob = await compressImage(file, 1000, 0.75);
      return blobToDataURL(blob);
    },
    async removeImages() { /* photos live inside the product in demo mode */ },
    async getSettings() { return mergeSettings(ls.get(LS_SETTINGS, null) || window.DARJI_SAMPLE_SETTINGS || null); },
    async saveSettings(s) { ls.set(LS_SETTINGS, s); return mergeSettings(s); },
    async listOffers() {
      return ls.get(LS_OFFERS, null) || (window.DARJI_SAMPLE_OFFER ? [window.DARJI_SAMPLE_OFFER] : []);
    },
    async saveOffer(o) {
      const all = await this.listOffers();
      const row = Object.assign({}, o, { id: o.id || ('o' + Date.now().toString(36)) });
      const i = all.findIndex(x => x.id === row.id);
      if (i >= 0) all[i] = row; else all.unshift(row);
      ls.set(LS_OFFERS, all);
      return row;
    },
    async deleteOffer(id) { ls.set(LS_OFFERS, (await this.listOffers()).filter(o => o.id !== id)); },
    async getActiveOffer() { return pickActiveOffer(await this.listOffers()); },
    // Demo sign-in has no password; see signIn below.
    async getUser() { return ls.get(LS_DEMO_AUTH, null); },
    // Demo mode: one-click entry, no password (the real site uses Supabase sign-in).
    async signIn(email) {
      const user = { email: email || 'Demo admin' };
      ls.set(LS_DEMO_AUTH, user);
      return user;
    },
    async isAdmin() { return true; },
    async signOut() { ls.del(LS_DEMO_AUTH); },
    async changePassword(pw) { ls.set(LS_DEMO_PW, pw); },
    async sendReset() { throw new Error('Password reset emails only work once Supabase is connected. In demo mode no password is needed.'); },
    async resetDemo() { ls.del(LS_PRODUCTS); ls.del(LS_OFFERS); ls.del(LS_SETTINGS); },
    onAuthChange() { /* no-op in demo */ }
  };

  /* ---------------- Supabase adapter ---------------- */
  const supa = {
    mode: 'supabase',
    client: null,
    async init() {
      if (!window.supabase) await loadScript(SUPABASE_CDN);
      this.client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
      return this;
    },
    _check({ data, error }) { if (error) throw new Error(error.message); return data; },
    async listProducts() {
      // Row Level Security hides unpublished products from visitors
      // and shows everything to a signed-in admin.
      const data = this._check(await this.client.from('products').select('*')
        .order('sort_order', { ascending: true }).order('created_at', { ascending: false }));
      return data.map(normalise);
    },
    async saveProduct(p) {
      const row = normalise(p);
      delete row.sample; delete row.created_at;
      const id = row.id; delete row.id;
      const q = id
        ? this.client.from('products').update(row).eq('id', id).select().single()
        : this.client.from('products').insert(row).select().single();
      return normalise(this._check(await q));
    },
    async deleteProduct(id, images = []) {
      this._check(await this.client.from('products').delete().eq('id', id));
      await this.removeImages(images);
    },
    // Deletes uploaded photos from storage so the free 1 GB lasts longer.
    async removeImages(urls = []) {
      const marker = '/object/public/' + CFG.BUCKET + '/';
      const paths = urls.filter(u => typeof u === 'string' && u.includes(marker))
        .map(u => decodeURIComponent(u.split(marker)[1].split('?')[0]));
      if (paths.length) {
        try { await this.client.storage.from(CFG.BUCKET).remove(paths); } catch (e) { console.warn(e); }
      }
    },
    async uploadImage(file) {
      const blob = await compressImage(file);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      this._check(await this.client.storage.from(CFG.BUCKET).upload(path, blob, {
        contentType: blob.type, cacheControl: '31536000', upsert: false
      }));
      return this.client.storage.from(CFG.BUCKET).getPublicUrl(path).data.publicUrl;
    },
    async getSettings() {
      const { data } = await this.client.from('store_settings').select('*').eq('id', 1).maybeSingle();
      return mergeSettings(data);
    },
    async saveSettings(s) {
      const row = Object.assign({ id: 1 }, s);
      this._check(await this.client.from('store_settings').upsert(row));
      return mergeSettings(row);
    },
    async listOffers() {
      return this._check(await this.client.from('offers').select('*').order('created_at', { ascending: false }));
    },
    async saveOffer(o) {
      const row = { text: o.text, ends_at: o.ends_at || null, active: !!o.active };
      const q = o.id
        ? this.client.from('offers').update(row).eq('id', o.id).select().single()
        : this.client.from('offers').insert(row).select().single();
      return this._check(await q);
    },
    async deleteOffer(id) { this._check(await this.client.from('offers').delete().eq('id', id)); },
    async getActiveOffer() {
      try { return pickActiveOffer(await this.listOffers()); } catch (e) { return null; }
    },
    async getUser() {
      const { data } = await this.client.auth.getSession();
      return data.session ? data.session.user : null;
    },
    async signIn(email, password) {
      const data = this._check(await this.client.auth.signInWithPassword({ email, password }));
      return data.user;
    },
    async isAdmin() {
      const { data, error } = await this.client.rpc('is_admin');
      return !error && data === true;
    },
    async signOut() { await this.client.auth.signOut(); },
    async changePassword(pw) { this._check(await this.client.auth.updateUser({ password: pw })); },
    async sendReset(email) {
      const redirectTo = location.origin + location.pathname;
      this._check(await this.client.auth.resetPasswordForEmail(email, { redirectTo }));
    },
    onAuthChange(cb) { this.client.auth.onAuthStateChange((event, session) => cb(event, session)); }
  };

  function pickActiveOffer(list) {
    const now = Date.now();
    return (list || []).find(o => o.active && (!o.ends_at || new Date(o.ends_at).getTime() > now)) || null;
  }

  /* ---------------- Helpers shared by both pages ---------------- */
  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  window.DarjiStore = {
    SIZES,
    DEFAULT_STORY,
    configured,
    ls,
    formatPrice: n => inr.format(Number(n) || 0),
    productCode: p => 'DB-' + String(p.id).replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase(),
    async connect() {
      const adapter = configured ? supa : demo;
      try { await adapter.init(); return adapter; }
      catch (e) {
        console.error(e);
        if (configured) throw new Error('Could not connect to the database. Check your internet connection and the keys in js/config.js.');
        throw e;
      }
    }
  };
})();
