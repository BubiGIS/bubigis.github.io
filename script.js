'use strict';

/* Theme toggle (remembers choice when storage is available) */
(function theme() {
  const root = document.documentElement;
  try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch (e) {}
  document.getElementById('theme').addEventListener('click', () => {
    const dark = getComputedStyle(root).colorScheme === 'dark';
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
    drawFrame();
  });
})();

/* Topographic contour map: marching squares over a height field.
   Your cursor raises a peak; the readout shows matching coordinates. */
const canvas = document.getElementById('contours');
const ctx = canvas.getContext('2d');
const readout = document.getElementById('readout');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CELL = 10, LEVELS = 14;
let W, H, cols, rows, field, dpr;
const peaks = [[.78,.3,.2,1],[.55,.7,.28,.8],[.2,.25,.18,.6],[.1,.85,.22,.7],[.95,.9,.2,.6]];
const mouse = { x: .35, y: .5, tx: .35, ty: .5 };
let raf = 0;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cols = Math.ceil(W / CELL) + 1; rows = Math.ceil(H / CELL) + 1;
  field = new Float32Array(cols * rows);
  drawFrame();
}

function height(nx, ny) {
  const asp = W / H;
  let v = 0;
  for (const [px, py, s, a] of peaks) {
    const dx = (nx - px) * asp, dy = ny - py;
    v += a * Math.exp(-(dx * dx + dy * dy) / (s * s));
  }
  const dx = (nx - mouse.x) * asp, dy = ny - mouse.y;
  return v + 1.1 * Math.exp(-(dx * dx + dy * dy) / .045);
}

function drawFrame() {
  if (!field) return;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      field[j * cols + i] = height(i * CELL / W, j * CELL / H);
  ctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  ctx.strokeStyle = css.getPropertyValue('--contour').trim();
  ctx.lineWidth = 1;
  for (let k = 1; k <= LEVELS; k++) {
    const lv = k * .14;
    ctx.globalAlpha = k % 4 === 0 ? .95 : .5;   // index contours are heavier
    ctx.lineWidth = k % 4 === 0 ? 1.6 : 1;
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = field[j * cols + i], b = field[j * cols + i + 1],
            c = field[(j + 1) * cols + i + 1], d = field[(j + 1) * cols + i];
      const idx = (a > lv) * 8 + (b > lv) * 4 + (c > lv) * 2 + (d > lv);
      if (idx === 0 || idx === 15) continue;
      const x = i * CELL, y = j * CELL, t = (p, q) => (lv - p) / (q - p) * CELL;
      const T = [x + t(a, b), y], R = [x + CELL, y + t(b, c)],
            B = [x + t(d, c), y + CELL], L = [x, y + t(a, d)];
      const seg = {1:[L,B],2:[B,R],3:[L,R],4:[T,R],5:[T,L,B,R],6:[T,B],7:[T,L],
                   8:[T,L],9:[T,B],10:[T,R,L,B],11:[T,R],12:[L,R],13:[B,R],14:[L,B]}[idx];
      for (let s = 0; s < seg.length; s += 2) {
        ctx.moveTo(seg[s][0], seg[s][1]); ctx.lineTo(seg[s + 1][0], seg[s + 1][1]);
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function tick() {
  mouse.x += (mouse.tx - mouse.x) * .12; mouse.y += (mouse.ty - mouse.y) * .12;
  drawFrame();
  raf = (Math.abs(mouse.tx - mouse.x) + Math.abs(mouse.ty - mouse.y) > .001) ? requestAnimationFrame(tick) : 0;
}

function aim(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  mouse.tx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  mouse.ty = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
  // Map the canvas onto a window around Bulawayo (20.15° S, 28.58° E)
  const lat = 20.15 + (mouse.ty - .5) * .3, lon = 28.58 + (mouse.tx - .5) * .5;
  readout.textContent = `${lat.toFixed(4)}° S, ${lon.toFixed(4)}° E`;
  if (reduce) { mouse.x = mouse.tx; mouse.y = mouse.ty; drawFrame(); }
  else if (!raf) raf = requestAnimationFrame(tick);
}

document.getElementById('top').addEventListener('pointermove', e => aim(e.clientX, e.clientY));
addEventListener('resize', resize);
resize();

/* Count-up stats, once, when visible */
const counters = document.querySelectorAll('[data-count]');
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    const end = +en.target.dataset.count;
    if (reduce) { en.target.textContent = end; return; }
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / 900);
      en.target.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  });
}, { threshold: .6 });
counters.forEach(c => io.observe(c));

/* Contact form: validates, then opens the visitor's email app */
document.getElementById('form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, note = document.getElementById('note');
  let ok = true;
  for (const el of f.elements) {
    if (!el.name) continue;
    const bad = !el.value.trim() || (el.type === 'email' && !/^\S+@\S+\.\S+$/.test(el.value));
    el.setAttribute('aria-invalid', bad);
    if (bad) ok = false;
  }
  if (!ok) { note.textContent = 'Fill in your name, a valid email and a message.'; return; }
  const subject = encodeURIComponent('Portfolio enquiry from ' + f.name.value.trim());
  const body = encodeURIComponent(f.msg.value.trim() + '\n\nReply to: ' + f.email.value.trim());
  location.href = `mailto:alfredmpofu001@yahoo.com?subject=${subject}&body=${body}`;
  note.textContent = 'Your email app should open with the message ready to send.';
});

document.getElementById('year').textContent = new Date().getFullYear();
