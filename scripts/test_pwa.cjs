const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('js/app.js');
const pwa = app.slice(app.indexOf('  function initPwa(){'), app.indexOf('\n  initTheme();'));

function harness(options = {}) {
  const listeners = new Map();
  const elements = {};
  for (const id of ['installBtn', 'installDialog', 'installHint', 'closeInstallBtn', 'installHelpBtn']) {
    elements[id] = {
      hidden: false, disabled: false, textContent: '', attrs: {}, open: false, handlers: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(name, fn) { this.handlers[name] = fn; }
    };
  }
  const state = { deferredInstall: null };
  const toasts = [], warnings = [], registrations = [];
  const navigator = {
    userAgent: options.ua || 'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36',
    platform: options.platform || '', maxTouchPoints: options.touch || 0,
    standalone: options.iosStandalone || false
  };
  if (!options.noServiceWorker) navigator.serviceWorker = {
    async register(url, settings) {
      registrations.push({ url, settings });
      if (options.swError) throw new Error('registration failed');
      return { async update() {} };
    }
  };
  const window = {
    navigator,
    matchMedia() { return { matches: options.standalone || false }; },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    }
  };
  const context = {
    window, navigator, state, document: { readyState: options.readyState || 'loading' },
    $: id => elements[id], toast: msg => toasts.push(msg),
    openDialog: el => { el.open = true; }, closeDialog: el => { el.open = false; },
    console: { warn: (...args) => warnings.push(args) }
  };
  vm.runInNewContext(pwa + '\ninitPwa();', context);
  return {
    elements, state, toasts, warnings, registrations,
    click: id => elements[id].handlers.click(),
    async emit(name, event = {}) {
      for (const fn of listeners.get(name) || []) await fn(event);
    }
  };
}

function invite(outcome = 'dismissed') {
  return {
    calls: 0, prevented: false,
    preventDefault() { this.prevented = true; },
    async prompt() { this.calls++; },
    userChoice: Promise.resolve({ outcome })
  };
}

test('the published entry links the current manifest, runtime and real PNG icons', () => {
  const html = read('app-v134.html');
  const manifest = JSON.parse(read('manifest-v134.json'));
  const base = new URL('https://tsvalencio-ia.github.io/MECANICO/');
  const linkedManifest = html.match(/rel="manifest" href="([^"]+)"/)[1];
  assert.equal(new URL(linkedManifest, base).pathname, '/MECANICO/manifest-v134.json');
  assert.equal(manifest.id, '/MECANICO/app-v134.html');
  assert.equal(manifest.scope, '/MECANICO/');
  const start = new URL(manifest.start_url, base);
  assert.equal(start.pathname, manifest.id);
  assert.equal(start.searchParams.get('v'), '1.6.2');
  assert.equal(manifest.display, 'standalone');
  assert.ok(fs.existsSync(path.join(root, start.pathname.replace('/MECANICO/', ''))));
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(i => i.type === 'image/png' && i.sizes === `${size}x${size}` && i.purpose === 'any');
    assert.ok(icon, `${size}px icon`);
    const image = fs.readFileSync(path.join(root, new URL(icon.src, base).pathname.replace('/MECANICO/', '')));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16), size);
    assert.equal(image.readUInt32BE(20), size);
  }
  const runtime = html.match(/<script src="(\.\/js\/app\.js[^\"]*)"/)[1];
  assert.equal(new URL(runtime.replace(/&amp;/g, '&'), base).searchParams.get('v'), '1.6.2');
  assert.match(read('index.html'), /app-v134\.html\?v=1\.6\.2/);
});

test('the visible button opens Android instructions without a native prompt', async () => {
  const h = harness({ ua: 'Mozilla/5.0 (Linux; Android 16) Chrome/145.0.0.0 Mobile Safari/537.36' });
  await h.click('installBtn');
  assert.equal(h.elements.installBtn.hidden, false);
  assert.equal(h.elements.installDialog.open, true);
  assert.match(h.elements.installHint.textContent, /Instalar app|tela inicial/);
  await h.click('installHelpBtn');
  assert.equal(h.elements.installDialog.open, false);
});

test('iPhone and iPad in desktop mode receive iOS installation instructions', async () => {
  for (const options of [{ ua: 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1' },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Safari/605.1', platform: 'MacIntel', touch: 5 }]) {
    const h = harness(options);
    await h.click('installBtn');
    assert.match(h.elements.installHint.textContent, /Compartilhar/);
    assert.match(h.elements.installHint.textContent, /Tela de Início/);
  }
});

test('cancelling consumes the one-use prompt and leaves the next click functional', async () => {
  const h = harness(), event = invite();
  await h.emit('beforeinstallprompt', event);
  assert.equal(event.prevented, true);
  await h.click('installBtn');
  assert.equal(event.calls, 1);
  assert.equal(h.state.deferredInstall, null);
  assert.equal(h.elements.installBtn.disabled, false);
  await h.click('installBtn');
  assert.equal(event.calls, 1);
  assert.equal(h.elements.installDialog.open, true);
  const next = invite('accepted');
  await h.emit('beforeinstallprompt', next);
  await h.click('installHelpBtn');
  assert.equal(next.calls, 1);
  assert.equal(h.state.deferredInstall, null);
});

test('an invite arriving with instructions open enables their install action', async () => {
  const h = harness(), event = invite('accepted');
  await h.click('installBtn');
  await h.emit('beforeinstallprompt', event);
  assert.equal(h.elements.installHelpBtn.textContent, 'Instalar agora');
  await h.click('installHelpBtn');
  assert.equal(event.calls, 1);
  assert.equal(h.elements.installDialog.open, false);
});

test('a rejected native prompt is consumed and falls back to instructions', async () => {
  const h = harness(), event = invite();
  event.prompt = async function () { this.calls++; throw new Error('not available'); };
  await h.emit('beforeinstallprompt', event);
  await h.click('installBtn');
  assert.equal(h.state.deferredInstall, null);
  assert.equal(h.elements.installBtn.disabled, false);
  assert.equal(h.elements.installDialog.open, true);
  await h.click('installBtn');
  assert.equal(event.calls, 1);
});

test('repeated clicks cannot launch concurrent native prompts', async () => {
  const h = harness(), event = invite('accepted');
  let finish;
  event.prompt = function () { this.calls++; return new Promise(resolve => { finish = resolve; }); };
  await h.emit('beforeinstallprompt', event);
  const pending = h.click('installBtn');
  assert.equal(h.elements.installBtn.disabled, true);
  await h.click('installBtn');
  assert.equal(event.calls, 1);
  finish();
  await pending;
  assert.equal(h.elements.installBtn.disabled, false);
});

test('appinstalled updates accessible button state and does not offer reinstallation', async () => {
  const h = harness();
  await h.click('installBtn');
  await h.emit('appinstalled');
  assert.equal(h.elements.installDialog.open, false);
  assert.equal(h.elements.installBtn.attrs['aria-label'], 'thIAguinho instalado');
  await h.click('installBtn');
  assert.equal(h.elements.installDialog.open, false);
  assert.match(h.toasts.at(-1), /já está instalado/);
});

test('installed status survives appinstalled firing while prompt() is pending', async () => {
  const h = harness(), event = invite('accepted');
  let finish;
  event.prompt = () => new Promise(resolve => { finish = resolve; });
  await h.emit('beforeinstallprompt', event);
  const pending = h.click('installBtn');
  await h.emit('appinstalled');
  finish();
  await pending;
  assert.equal(h.elements.installBtn.attrs['aria-label'], 'thIAguinho instalado');
  assert.match(h.toasts.at(-1), /instalado neste dispositivo/);
});

test('standalone launch reports installed status and opens no instructions', async () => {
  for (const options of [{ standalone: true }, { iosStandalone: true }]) {
    const h = harness(options);
    assert.equal(h.elements.installBtn.attrs['aria-label'], 'thIAguinho instalado');
    await h.click('installBtn');
    assert.equal(h.elements.installDialog.open, false);
    assert.match(h.toasts.at(-1), /já está instalado/);
  }
});

test('service worker registration works before or after load and stays within MECANICO', async () => {
  for (const readyState of ['loading', 'complete']) {
    const h = harness({ readyState });
    if (readyState === 'loading') await h.emit('load');
    assert.equal(h.registrations.length, 1);
    const { url, settings } = h.registrations[0];
    const base = 'https://tsvalencio-ia.github.io/MECANICO/app-v134.html';
    assert.equal(new URL(url, base).pathname, '/MECANICO/sw-v134.js');
    assert.equal(new URL(url, base).searchParams.get('v'), '1.6.2');
    assert.equal(new URL(settings.scope, base).pathname, '/MECANICO/');
    assert.equal(settings.updateViaCache, 'none');
  }
});

test('service worker failure or an unsupported browser leaves manual installation usable', async () => {
  for (const options of [{ swError: true }, { noServiceWorker: true }]) {
    const h = harness(options);
    await h.emit('load');
    await h.click('installBtn');
    assert.equal(h.elements.installDialog.open, true);
  }
});

test('current worker activates without intercepting requests or using the broken cache', async () => {
  const handlers = {}, calls = [];
  const self = {
    addEventListener: (name, fn) => { handlers[name] = fn; },
    skipWaiting: async () => { calls.push('skipWaiting'); },
    clients: { claim: async () => { calls.push('claim'); } }
  };
  vm.runInNewContext(read('sw-v134.js'), { self });
  assert.equal(handlers.fetch, undefined);
  for (const name of ['install', 'activate']) {
    let pending;
    handlers[name]({ waitUntil: promise => { pending = promise; } });
    await pending;
  }
  assert.deepEqual(calls, ['skipWaiting', 'claim']);
  handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(calls.at(-1), 'skipWaiting');
});

test('legacy workers remove only MECANICO cache entries and unregister themselves', async () => {
  for (const file of ['sw.js', 'sw-v132.js', 'sw-v133.js']) {
    const handlers = {}, deleted = [], calls = [];
    const self = {
      addEventListener: (name, fn) => { handlers[name] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => { calls.push('claim'); } },
      registration: { unregister: async () => { calls.push('unregister'); } }
    };
    const caches = {
      keys: async () => ['thiaguinho-auto-v134', 'other-project-cache'],
      delete: async name => { deleted.push(name); }
    };
    vm.runInNewContext(read(file), { self, caches });
    let pending;
    handlers.activate({ waitUntil: promise => { pending = promise; } });
    await pending;
    assert.deepEqual(deleted, ['thiaguinho-auto-v134']);
    assert.deepEqual(calls, ['claim', 'unregister']);
    assert.equal(handlers.fetch, undefined);
  }
});
