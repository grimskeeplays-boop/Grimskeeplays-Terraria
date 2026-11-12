// World rendering: sky, parallax skyline, tiles, lighting, characters.

import { TILE, VW, VH, DAY, T, WL, TILES, ITEMS, ENEMIES } from './defs';
import { mk, tileAtlas, wallAtlas, crackAtlas, moonSprite, treeTops, icons, VARIANTS, type Ctx } from './art';
import { hash2, fbm2, clamp, lerpRgb, rgbCss, type RGB } from './util';
import type { Game, Enemy } from './game';

type Key = [number, RGB, RGB];
const SKY: Key[] = [
  [0.0, [58, 66, 100], [168, 140, 150]],
  [0.46, [58, 66, 100], [168, 140, 150]],
  [0.55, [42, 27, 61], [200, 85, 61]],
  [0.62, [7, 6, 22], [29, 26, 63]],
  [0.92, [7, 6, 22], [29, 26, 63]],
  [0.97, [50, 36, 70], [190, 110, 100]],
  [1.0, [58, 66, 100], [168, 140, 150]],
];
const SUN: [number, RGB][] = [
  [0.0, [1, 0.97, 0.96]], [0.46, [1, 0.97, 0.96]], [0.55, [0.8, 0.52, 0.45]], [0.62, [0.27, 0.31, 0.5]],
  [0.92, [0.27, 0.31, 0.5]], [0.97, [0.7, 0.5, 0.5]], [1.0, [1, 0.97, 0.96]],
];

function skyAt(t: number): [RGB, RGB] {
  for (let i = 0; i + 1 < SKY.length; i++) {
    if (t <= SKY[i + 1][0]) {
      const k = (t - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
      return [lerpRgb(SKY[i][1], SKY[i + 1][1], k), lerpRgb(SKY[i][2], SKY[i + 1][2], k)];
    }
  }
  return [SKY[0][1], SKY[0][2]];
}

function sunAt(t: number): RGB {
  for (let i = 0; i + 1 < SUN.length; i++) {
    if (t <= SUN[i + 1][0]) return lerpRgb(SUN[i][1], SUN[i + 1][1], (t - SUN[i][0]) / (SUN[i + 1][0] - SUN[i][0]));
  }
  return SUN[0][1];
}

function nightAmt(t: number): number {
  if (t < 0.53) return 0;
  if (t < 0.62) return (t - 0.53) / 0.09;
  if (t < 0.92) return 1;
  if (t < 0.98) return 1 - (t - 0.92) / 0.06;
  return 0;
}

function farRidge(x: number): number {
  return 30 + fbm2(x * 0.004, 0.5, 900, 4) * 110;
}

function nearRidge(x: number): number {
  let h = 12 + fbm2(x * 0.009, 0.5, 901, 3) * 46;
  const cell = Math.floor(x / 260);
  const k = hash2(cell, 0, 902);
  if (k < 0.55) {
    const center = cell * 260 + 70 + hash2(cell, 1, 902) * 120;
    for (let i = -1; i <= 1; i++) {
      const tcx = center + i * 24;
      const tw = 8 - Math.abs(i) * 2;
      const th = 56 + hash2(cell, 2 + i, 902) * 34 - Math.abs(i) * 16;
      const d = Math.abs(x - tcx);
      if (d < tw) h = Math.max(h, th + (tw - d) * 2.2);
      else if (d < tw + 16 && i === 0) h = Math.max(h, th * 0.5 + ((Math.floor(x / 4) % 2) ? 3 : 0));
    }
  }
  return h;
}

const RW = 60, RH = 42, MARGIN = 9;

export class Renderer {
  private buf: HTMLCanvasElement; private b: Ctx;
  private lit: HTMLCanvasElement; private l: Ctx;
  private lm: HTMLCanvasElement; private lmc: Ctx;
  private img: ImageData;
  private L = [new Float32Array(RW * RH), new Float32Array(RW * RH), new Float32Array(RW * RH)];
  private dec = new Float32Array(RW * RH);

  constructor() {
    [this.buf, this.b] = mk(VW, VH);
    [this.lit, this.l] = mk(VW, VH);
    [this.lm, this.lmc] = mk(RW, RH);
    this.img = this.lmc.createImageData(RW, RH);
  }

  // ---------------------------------------------------------------- sky

  drawSky(out: Ctx, time: number, camX: number, yoff: number, crimson = false): void {
    const t = time / DAY;
    let [top, bot] = skyAt(t);
    if (crimson) {
      const k = 0.55 * nightAmt(t);
      top = lerpRgb(top, [58, 4, 12], k);
      bot = lerpRgb(bot, [130, 18, 30], k);
    }
    const g = out.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, rgbCss(top));
    g.addColorStop(0.75, rgbCss(bot));
    g.addColorStop(1, rgbCss(bot));
    out.fillStyle = g;
    out.fillRect(0, 0, VW, VH);

    const night = nightAmt(t);
    if (night > 0) {
      for (let i = 0; i < 110; i++) {
        const x = Math.floor(hash2(i, 1, 5) * VW), y = Math.floor(hash2(i, 2, 5) * VH * 0.72);
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.01 + i * 1.7));
        out.fillStyle = `rgba(230,225,255,${(night * tw * (i % 5 === 0 ? 1 : 0.6)).toFixed(3)})`;
        out.fillRect(x, y, 1, 1);
      }
      const nt = clamp((t - 0.55) / 0.42, 0, 1);
      const mx = 40 + nt * 560, my = 190 - Math.sin(nt * Math.PI) * 150 + yoff * 0.3;
      const halo = out.createRadialGradient(mx, my, 10, mx, my, 70);
      halo.addColorStop(0, `rgba(190,200,255,${0.22 * night})`);
      halo.addColorStop(1, 'rgba(190,200,255,0)');
      out.fillStyle = halo;
      out.fillRect(mx - 70, my - 70, 140, 140);
      out.globalAlpha = night;
      out.drawImage(moonSprite, Math.round(mx - 24), Math.round(my - 24));
      if (crimson) {
        out.globalAlpha = 0.55 * night;
        out.fillStyle = '#b00a1e';
        out.beginPath();
        out.arc(Math.round(mx) - 0.5, Math.round(my) - 0.5, 22.5, 0, Math.PI * 2);
        out.fill();
      }
      out.globalAlpha = 1;
    }
    if (night < 1 && t < 0.62) {
      const dt = clamp(t / 0.58, 0, 1);
      const sx = 40 + dt * 560, sy = 200 - Math.sin(dt * Math.PI) * 150 + yoff * 0.3;
      const halo = out.createRadialGradient(sx, sy, 4, sx, sy, 60);
      halo.addColorStop(0, `rgba(255,225,205,${0.5 * (1 - night)})`);
      halo.addColorStop(1, 'rgba(255,225,205,0)');
      out.fillStyle = halo;
      out.fillRect(sx - 60, sy - 60, 120, 120);
      out.fillStyle = `rgba(250,236,220,${0.9 * (1 - night)})`;
      out.beginPath();
      out.arc(sx, sy, 9, 0, Math.PI * 2);
      out.fill();
    }

    const far = lerpRgb(top, bot, 0.55).map((v) => v * 0.6) as RGB;
    const near = lerpRgb(top, bot, 0.4).map((v) => v * 0.3) as RGB;
    const baseFar = 262 + yoff * 0.5, baseNear = 300 + yoff;
    out.fillStyle = rgbCss(far);
    for (let sx = 0; sx < VW; sx += 2) {
      const y = Math.round(baseFar - farRidge(sx + camX * 0.08));
      out.fillRect(sx, y, 2, VH - y + 80);
    }
    out.fillStyle = rgbCss(near);
    for (let sx = 0; sx < VW; sx += 2) {
      const y = Math.round(baseNear - nearRidge(sx + camX * 0.2));
      out.fillRect(sx, y, 2, VH - y + 80);
    }
  }

  // ---------------------------------------------------------------- lighting

  private light(g: Game, rx0: number, ry0: number): void {
    const w = g.world, p = g.p;
    const [Lr, Lg, Lb] = this.L;
    const dec = this.dec;
    let sun = sunAt(w.time / DAY);
    if (g.event?.type === 'crimson') sun = lerpRgb(sun, [0.5, 0.2, 0.24], nightAmt(w.time / DAY));
    else if (g.event?.type === 'fog') sun = [sun[0] * 0.62, sun[1] * 0.64, sun[2] * 0.7];
    for (let j = 0; j < RH; j++) {
      for (let i = 0; i < RW; i++) {
        const x = rx0 + i, y = ry0 + j, k = j * RW + i;
        const td = TILES[w.tile(x, y)];
        let r = 0, gg = 0, b = 0;
        if (!td.opaque && y < w.skyLimit && w.wall(x, y) === WL.None) { r = sun[0]; gg = sun[1]; b = sun[2]; }
        if (td.light) {
          const f = td.anim ? 0.92 + 0.08 * Math.sin(g.tick * 0.3 + x * 1.3) : 1;
          r = Math.max(r, td.light[0] * f); gg = Math.max(gg, td.light[1] * f); b = Math.max(b, td.light[2] * f);
        }
        Lr[k] = r; Lg[k] = gg; Lb[k] = b;
        dec[k] = td.opaque ? 1 : 0;
      }
    }
    // the player always carries a faint glow; torches and the lantern do far better
    if (p.dead === 0) {
      const pi = Math.floor(p.cx / TILE) - rx0, pj = Math.floor(p.cy / TILE) - ry0;
      if (pi >= 0 && pj >= 0 && pi < RW && pj < RH) {
        const k = pj * RW + pi;
        let r = 0.26, gg = 0.26, b = 0.3;
        const held = p.held();
        if (held && held.id === 'torch') { r = 1.25; gg = 1.05; b = 0.76; }
        if (p.has.lantern) { r = Math.max(r, 1.3); gg = Math.max(gg, 1.2); b = Math.max(b, 0.95); }
        Lr[k] = Math.max(Lr[k], r); Lg[k] = Math.max(Lg[k], gg); Lb[k] = Math.max(Lb[k], b);
      }
    }
    // Light fades slowly through air, quickly through rock, and keeps most of its
    // strength on the first solid tile it touches so cave walls read clearly.
    const fac = (k: number, nk: number, diag: boolean): number => {
      const f = dec[k] ? (dec[nk] ? 0.55 : 0.9) : 0.85;
      return diag ? f * 0.9 : f;
    };
    for (const L of this.L) {
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < RH; j++) {
          for (let i = 0; i < RW; i++) {
            const k = j * RW + i;
            let v = L[k];
            if (i > 0) v = Math.max(v, L[k - 1] * fac(k, k - 1, false));
            if (j > 0) {
              v = Math.max(v, L[k - RW] * fac(k, k - RW, false));
              if (i > 0) v = Math.max(v, L[k - RW - 1] * fac(k, k - RW - 1, true));
              if (i < RW - 1) v = Math.max(v, L[k - RW + 1] * fac(k, k - RW + 1, true));
            }
            L[k] = v;
          }
        }
        for (let j = RH - 1; j >= 0; j--) {
          for (let i = RW - 1; i >= 0; i--) {
            const k = j * RW + i;
            let v = L[k];
            if (i < RW - 1) v = Math.max(v, L[k + 1] * fac(k, k + 1, false));
            if (j < RH - 1) {
              v = Math.max(v, L[k + RW] * fac(k, k + RW, false));
              if (i > 0) v = Math.max(v, L[k + RW - 1] * fac(k, k + RW - 1, true));
              if (i < RW - 1) v = Math.max(v, L[k + RW + 1] * fac(k, k + RW + 1, true));
            }
            L[k] = v;
          }
        }
      }
    }
    const px = this.img.data;
    for (let k = 0; k < RW * RH; k++) {
      px[k * 4] = Math.min(255, Lr[k] * 255);
      px[k * 4 + 1] = Math.min(255, Lg[k] * 255);
      px[k * 4 + 2] = Math.min(255, Lb[k] * 255);
      px[k * 4 + 3] = 255;
    }
    this.lmc.putImageData(this.img, 0, 0);
  }

  // ---------------------------------------------------------------- world

  draw(out: Ctx, g: Game): void {
    const w = g.world, b = this.b;
    const cx = Math.floor(g.cam.x), cy = Math.floor(g.cam.y);
    const surfacePx = (w.spawnY + 2) * TILE;
    this.drawSky(out, w.time, cx, clamp((surfacePx - (cy + VH / 2)) * 0.12, -60, 70), g.event?.type === 'crimson');

    b.clearRect(0, 0, VW, VH);
    const x0 = Math.floor(cx / TILE), x1 = Math.floor((cx + VW) / TILE);
    const y0 = Math.floor(cy / TILE), y1 = Math.floor((cy + VH) / TILE);
    const opaque = (x: number, y: number) => TILES[w.tile(x, y)].opaque;
    const tops: [number, number, number][] = [];

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = w.tile(x, y);
        const td = TILES[t];
        const sx = x * TILE - cx, sy = y * TILE - cy;
        const v = Math.floor(hash2(x, y, 3) * VARIANTS);
        if (!td.opaque) {
          const wl = w.wall(x, y);
          if (wl !== WL.None) b.drawImage(wallAtlas, v * TILE, wl * TILE, TILE, TILE, sx, sy, TILE, TILE);
          else if (y >= w.skyLimit) { b.fillStyle = '#0b0a12'; b.fillRect(sx, sy, TILE, TILE); }
        }
        if (t === T.Air) continue;
        let id = t;
        if (t === T.Grass && opaque(x, y - 1)) id = T.Dirt;
        const tv = td.anim ? ((g.tick >> 3) + x * 2) % VARIANTS : v;
        b.drawImage(tileAtlas, tv * TILE, id * TILE, TILE, TILE, sx, sy, TILE, TILE);
        if (t === T.TreeTop) tops.push([sx, sy, v]);
        if (td.opaque) {
          if (!opaque(x, y - 1)) { b.fillStyle = 'rgba(255,255,255,0.1)'; b.fillRect(sx, sy, TILE, 1); }
          if (!opaque(x, y + 1)) { b.fillStyle = 'rgba(0,0,0,0.42)'; b.fillRect(sx, sy + 15, TILE, 1); }
          b.fillStyle = 'rgba(0,0,0,0.3)';
          if (!opaque(x - 1, y)) b.fillRect(sx, sy, 1, TILE);
          if (!opaque(x + 1, y)) b.fillRect(sx + 15, sy, 1, TILE);
        }
      }
    }
    for (const [sx, sy, v] of tops) b.drawImage(treeTops[w.biomeAt(Math.floor((sx + cx) / TILE))][v % 3], sx + 8 - 32, sy + TILE - 56);

    const m = g.mining;
    if (m.prog > 0 && m.max > 0) {
      const stage = clamp(Math.floor((m.prog / m.max) * 4), 0, 3);
      b.drawImage(crackAtlas, stage * TILE, 0, TILE, TILE, m.x * TILE - cx, m.y * TILE - cy, TILE, TILE);
    }

    for (const d of g.drops) {
      const bob = Math.sin((g.tick + d.x) * 0.08) * 1.5;
      b.drawImage(icons[d.item.id], 0, 0, 16, 16, Math.round(d.x - cx - 1), Math.round(d.y - cy - 3 + bob), 12, 12);
    }
    for (const e of g.enemies) this.drawEnemy(b, e, cx, cy);
    this.drawPlayer(b, g, cx, cy);
    this.drawWhip(b, g, cx, cy);
    for (const q of g.projs) {
      b.save();
      b.translate(Math.round(q.x - cx), Math.round(q.y - cy));
      if (q.kind === 'fire' || q.kind === 'orb') {
        const big = q.kind === 'orb' ? 1 : 0;
        b.fillStyle = q.col; b.fillRect(-3 - big, -2 - big, 6 + big * 2, 4 + big * 2); b.fillRect(-2 - big, -3 - big, 4 + big * 2, 6 + big * 2);
        b.fillStyle = q.kind === 'orb' ? '#ffb3bd' : '#ffe08a'; b.fillRect(-1, -1, 2, 2);
        b.restore();
        continue;
      }
      b.rotate(q.rot);
      if (q.kind === 'arrow') {
        b.fillStyle = '#96704b'; b.fillRect(-5, 0, 9, 1);
        b.fillStyle = q.col; b.fillRect(3, -1, 2, 3);
        b.fillStyle = '#b3122d'; b.fillRect(-6, -1, 2, 3);
      } else if (q.kind === 'knife') {
        b.fillStyle = q.col; b.fillRect(-2, -1, 7, 2);
        b.fillStyle = '#3d2a20'; b.fillRect(-5, -1, 3, 2);
      } else if (q.kind === 'bolt') {
        b.fillStyle = q.col; b.fillRect(-5, -2, 10, 4);
        b.fillStyle = '#ffffff'; b.fillRect(-2, -1, 6, 2);
      } else {
        b.fillStyle = '#d9d2b8'; b.fillRect(-3, -1, 7, 2);
        b.fillStyle = '#f3eedc'; b.fillRect(-4, -2, 2, 4); b.fillRect(3, -2, 2, 4);
      }
      b.restore();
    }
    for (const q of g.parts) {
      b.fillStyle = q.col;
      b.fillRect(Math.round(q.x - cx), Math.round(q.y - cy), 2, 2);
    }

    // light the scene, keeping the sky untouched behind it
    const rx0 = x0 - MARGIN, ry0 = y0 - MARGIN;
    this.light(g, rx0, ry0);
    const l = this.l;
    l.globalCompositeOperation = 'copy';
    l.drawImage(this.buf, 0, 0);
    l.globalCompositeOperation = 'multiply';
    l.imageSmoothingEnabled = true;
    l.drawImage(this.lm, 0, 0, RW, RH, rx0 * TILE - cx, ry0 * TILE - cy, RW * TILE, RH * TILE);
    l.imageSmoothingEnabled = false;
    l.globalCompositeOperation = 'destination-in';
    l.drawImage(this.buf, 0, 0);
    l.globalCompositeOperation = 'source-over';
    out.drawImage(this.lit, 0, 0);

    if (g.event?.type === 'fog') {
      const near = clamp(1 - (cy + VH / 2 - w.skyLimit * TILE) / 200, 0, 1);
      if (near > 0) {
        const fog = out.createLinearGradient(0, 0, 0, VH);
        fog.addColorStop(0, `rgba(150,152,168,${0.22 * near})`);
        fog.addColorStop(1, `rgba(170,172,186,${0.5 * near})`);
        out.fillStyle = fog;
        out.fillRect(0, 0, VW, VH);
      }
    }

    // unlit overlays
    if (g.target) {
      out.strokeStyle = g.target.ok ? 'rgba(255,240,200,0.55)' : 'rgba(255,90,90,0.55)';
      out.lineWidth = 1;
      out.strokeRect(g.target.x * TILE - cx + 0.5, g.target.y * TILE - cy + 0.5, TILE - 1, TILE - 1);
    }
    out.font = 'bold 8px Georgia, "Times New Roman", serif';
    out.textAlign = 'center';
    for (const t of g.texts) {
      const a = Math.min(1, t.life / 20);
      out.globalAlpha = a;
      out.fillStyle = '#000';
      out.fillText(t.text, t.x - cx + 0.6, t.y - cy + 0.6);
      out.fillStyle = t.col;
      out.fillText(t.text, t.x - cx, t.y - cy);
    }
    out.globalAlpha = 1;
    out.textAlign = 'left';
  }

  // ---------------------------------------------------------------- characters

  private drawPlayer(b: Ctx, g: Game, cx: number, cy: number): void {
    const p = g.p;
    if (p.dead > 0) return;
    if (p.invuln > 0 && (g.tick >> 2) % 2 === 0) return;
    const R = (x: number, y: number, w: number, h: number, col: string) => { b.fillStyle = col; b.fillRect(x, y, w, h); };
    b.save();
    b.translate(Math.round(p.cx - cx), Math.round(p.y - cy + p.stepOff));
    if (p.face < 0) b.scale(-1, 1);

    const helm = p.armor[0] ? ITEMS[p.armor[0].id].col : null;
    const body = p.armor[1] ? ITEMS[p.armor[1].id].col : ['#3f4a3a', '#52604b', '#2c3429'];
    const legs = p.armor[2] ? ITEMS[p.armor[2].id].col : ['#2d2a3a', '#3a3650', '#1b1822'];
    const moving = p.ground && Math.abs(p.vx) > 0.3;
    const sw = moving ? Math.sin(p.anim) * 3 : 0;

    // cloak and back arm
    R(-6 - (moving ? 1 : 0), 9, 3, 13 - (p.ground ? 0 : 2), '#262d24');
    R(-4 - Math.round(sw * 0.4), 11, 2, 7, body[2]);
    // legs
    if (p.ground) {
      R(-3 - Math.round(sw), 20, 3, 8, legs[2]);
      R(Math.round(sw), 20 - (sw > 1.5 ? 1 : 0), 3, 8, legs[0]);
      R(Math.round(sw), 26 - (sw > 1.5 ? 1 : 0), 4, 2, '#1b1822');
      R(-3 - Math.round(sw), 26, 4, 2, '#141219');
    } else {
      R(-4, 20, 3, 7, legs[2]); R(1, 19, 3, 7, legs[0]);
      R(-4, 25, 4, 2, '#141219'); R(1, 24, 4, 2, '#1b1822');
    }
    // torso
    R(-4, 10, 8, 10, body[0]); R(-4, 10, 8, 1, body[1]); R(-4, 18, 8, 1, '#6e4c36'); R(-1, 18, 2, 1, '#c9a227');
    // scarf
    R(-4, 9, 8, 2, '#a3142a');
    R(-8 - (moving ? 2 : 0), 9 + (moving ? 0 : 1), 4 + (moving ? 2 : 0), 2, '#a3142a');
    // head
    if (helm) {
      R(-4, 1, 8, 8, helm[0]); R(-4, 1, 8, 2, helm[1]); R(-4, 8, 8, 1, helm[2]);
      R(0, 5, 4, 1, '#1a1218'); R(-1, 0, 2, 1, helm[1]);
    } else {
      R(-4, 1, 8, 8, '#2f382c'); R(-3, 0, 6, 1, '#2f382c'); R(-4, 1, 2, 8, '#252c22');
      R(0, 4, 4, 4, '#d8b8a0'); R(0, 3, 4, 1, '#1f251d'); R(2, 5, 1, 1, '#1a1218');
    }

    // front arm and whatever it holds
    let a = (90 + sw * 9) * (Math.PI / 180);
    const using = p.useT > 0;
    const d = p.useItem;
    const wt = d?.wpn?.type;
    if (using) {
      const prog = 1 - p.useT / p.useMax;
      if (!d || wt === 'sword') a = (-115 + prog * 155) * (Math.PI / 180);
      else a = p.face > 0 ? p.aim : Math.PI - p.aim;
    }
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < 6; i++) R(Math.round(1 + ca * i) - 1, Math.round(12 + sa * i) - 1, 2, 2, i < 5 ? body[0] : '#d8b8a0');
    const hx = 1 + ca * 6, hy = 12 + sa * 6;
    if (using && d && wt === 'sword') {
      b.save(); b.translate(hx, hy); b.rotate(a + Math.PI / 4); b.drawImage(icons[d.id], -2, -13); b.restore();
    } else if (using && d && wt === 'bow') {
      b.save(); b.translate(hx, hy); b.rotate(a); b.drawImage(icons[d.id], -6, -8); b.restore();
    } else if (!using) {
      const held = p.held();
      if (held && held.id === 'torch') b.drawImage(icons.torch, Math.round(hx) - 8, Math.round(hy) - 13);
    }
    b.restore();
  }

  private drawWhip(b: Ctx, g: Game, cx: number, cy: number): void {
    const len = g.whipLen();
    if (len <= 0) return;
    const p = g.p;
    const col = p.useItem!.col;
    const ox = p.cx + p.face * 2 - cx, oy = p.y + 12 - cy;
    const c = Math.cos(p.aim), s = Math.sin(p.aim);
    for (let d = 6; d <= len; d += 2) {
      const wob = Math.sin(d * 0.16 + g.tick * 0.7) * 1.6 * (d / len);
      const x = ox + c * d - s * wob, y = oy + s * d + c * wob;
      b.fillStyle = (d >> 1) % 3 === 0 ? col[2] : col[0];
      b.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
    b.fillStyle = col[1];
    b.fillRect(Math.round(ox + c * len) - 1, Math.round(oy + s * len) - 1, 3, 3);
  }

  private drawEnemy(b: Ctx, e: Enemy, cx: number, cy: number): void {
    const def = ENEMIES[e.type];
    const k = def.pal;
    const fl = e.flash > 0;
    const R = (x: number, y: number, w: number, h: number, col: string) => { b.fillStyle = fl ? '#ffffff' : col; b.fillRect(x, y, w, h); };
    const dark = '#1a1218';
    b.save();
    b.translate(Math.round(e.x + e.w / 2 - cx), Math.round(e.y - cy));
    if (e.dir < 0) b.scale(-1, 1);
    const s = Math.round(Math.sin(e.t * 0.16) * 2);
    switch (def.sprite) {
      case 'ghoul':
        R(-3 - s, 18, 3, 8, k[4]); R(s, 18, 3, 8, k[4]);
        R(-4, 8, 8, 11, k[2]); R(-4, 8, 8, 1, k[3]); R(-4, 17, 2, 3, k[4]); R(1, 18, 2, 2, k[4]);
        R(-2, 1, 7, 7, k[0]); R(-2, 1, 7, 1, k[1]); R(2, 3, 1, 2, dark); R(4, 3, 1, 2, dark);
        R(4, 4, 1, 1, k[5]); R(2, 6, 3, 1, '#2a1a1a');
        R(2, 10, 7, 2, k[0]); R(2, 13, 6, 2, k[0]); R(9, 10, 1, 3, k[1]);
        break;
      case 'skeleton':
        R(-3 - s, 19, 2, 9, k[1]); R(1 + s, 19, 2, 9, k[0]); R(-3, 17, 6, 2, k[0]);
        R(-1, 9, 2, 8, k[1]); R(-4, 10, 8, 1, k[0]); R(-4, 12, 8, 1, k[0]); R(-3, 14, 6, 1, k[0]);
        R(-3, 1, 7, 6, k[0]); R(-3, 1, 7, 1, k[2]); R(-2, 7, 5, 1, k[1]);
        R(-1, 3, 2, 2, dark); R(2, 3, 2, 2, dark); R(1, 5, 1, 1, dark);
        R(-5, 10, 1, 6 + s, k[1]); R(5, 10, 1, 6 - s, k[0]);
        if (k[3]) {
          R(-4, 9, 8, 5, k[3]); R(-4, 9, 8, 1, '#8d8f9c'); R(-3, 0, 7, 3, k[3]); R(-3, 0, 7, 1, '#8d8f9c');
          R(6, 5, 1, 11, '#c4c6d0'); R(5, 14, 3, 1, '#8a6d14');
        }
        break;
      case 'bat': {
        const up = Math.sin(e.t * 0.5) > 0;
        R(-2, 3, 4, 5, k[0]); R(-2, 2, 1, 1, k[0]); R(1, 2, 1, 1, k[0]);
        R(-1, 4, 1, 1, k[2]); R(1, 4, 1, 1, k[2]);
        for (const sd of [-1, 1]) {
          R(sd > 0 ? 2 : -7, up ? 1 : 5, 5, 3, k[1]);
          R(sd > 0 ? 5 : -7, up ? -1 : 7, 2, 2, k[1]);
        }
        break;
      }
      case 'wraith':
        b.globalAlpha = 0.62 + 0.2 * Math.sin(e.t * 0.08);
        R(-4, 0, 8, 8, k[1]); R(-3, -1, 6, 1, k[1]); R(-2, 2, 5, 5, '#1a2230');
        R(-1, 4, 1, 1, k[2]); R(2, 4, 1, 1, k[2]);
        for (let y = 8; y <= 22; y++) {
          const hw = 4 + Math.floor((y - 8) * 0.25);
          R(-hw, y, hw * 2, 1, y % 2 ? k[0] : k[1]);
        }
        for (let x = -7; x < 7; x++) R(x, 23, 1, 1 + ((x + 70 + (e.t >> 3)) % 3), k[0]);
        R(3, 10, 6, 2, k[0]); R(9, 9, 1, 4, '#e0f4ff');
        break;
      case 'wolf': {
        const run = e.ground ? Math.round(Math.sin(e.t * 0.4) * 2) : 2;
        R(-12, 3, 4, 2, k[1]); R(-9, 4, 16, 6, k[0]); R(-8, 9, 13, 1, k[1]); R(-9, 4, 14, 1, k[1]);
        R(5, 1, 6, 6, k[0]); R(10, 4, 3, 3, k[1]); R(6, -1, 2, 2, k[1]); R(8, 3, 1, 1, k[2]); R(12, 6, 1, 1, '#f3eedc');
        R(-8 + run, 10, 2, 4, k[1]); R(-4 - run, 10, 2, 4, k[0]); R(3 + run, 10, 2, 4, k[1]); R(6 - run, 10, 2, 4, k[0]);
        break;
      }
      case 'thrall':
        R(-6, 8, 4, 16, k[2]); R(-6, 8, 1, 16, '#3a0510');
        R(-3 - s, 19, 3, 9, k[1]); R(s, 19, 3, 9, k[1]);
        R(-4, 9, 8, 11, k[1]); R(-4, 8, 8, 2, k[2]);
        R(-3, 1, 7, 7, k[0]); R(-3, 0, 7, 2, dark); R(1, 3, 1, 1, k[3]); R(3, 3, 1, 1, k[3]); R(2, 6, 1, 1, '#ffffff');
        R(3, 11, 6, 2, k[1]); R(9, 11, 2, 2, k[0]);
        break;
      case 'dracula': {
        if (e.mode === 1) b.globalAlpha = clamp(Math.abs(e.cd - 25) / 22, 0, 1);
        const sway = Math.round(Math.sin(e.t * 0.1) * 1.5);
        for (let y = 8; y <= 33; y++) {
          const hw = 5 + Math.floor((y - 8) * 0.24) + (y > 22 ? sway : 0);
          R(-hw, y, hw * 2, 1, k[1]);
          R(-hw, y, 1, 1, k[2]); R(hw - 1, y, 1, 1, k[2]);
        }
        R(-3, 10, 6, 14, '#241a2c'); R(-1, 11, 2, 10, k[2]);
        R(-6, 4, 3, 6, k[1]); R(3, 4, 3, 6, k[1]); R(-6, 4, 1, 6, k[2]); R(5, 4, 1, 6, k[2]);
        R(-3, 1, 6, 7, k[0]); R(-3, 0, 6, 2, k[1]); R(0, 2, 1, 1, k[1]);
        R(0, 4, 1, 1, k[3]); R(2, 4, 1, 1, k[3]); R(1, 6, 2, 1, '#5a0a16');
        if (e.mode === 2) { R(6, 12, 3, 2, k[0]); R(-9, 12, 3, 2, k[0]); R(8, 8, 4, 4, k[3]); R(9, 9, 2, 2, '#ffb3bd'); }
        break;
      }
    }
    b.restore();
  }
}
