/* Vector rig renderer: draws the skeleton from anim.js as independently articulated, anti-aliased body parts.
   Head, torso, hips (shorts), upper/lower arms, thighs, shins and shoes are all separate shapes. Drawn at device resolution
   (no sprite upscaling). Same px-per-metre as the world scroll so planted feet stay glued to the ground. */
(function (XC) {
  const OL = '#14101c', TAU = Math.PI * 2;
  const palCache = {};
  function pal(look) {
    const key = XC.Sprites.lookKey(look);
    if (palCache[key]) return palCache[key];
    const sh = XC.Sprites.shade, skin = XC.SKINS[look.skin] || XC.SKINS[1], hair = XC.HAIR_COLORS[look.hairColor] || '#1b1210';
    return palCache[key] = {
      skin, skinD: sh(skin, -34), skinL: sh(skin, 22), hair, hairD: sh(hair, -22),
      singlet: look.singlet, singletD: sh(look.singlet, -38), trim: look.trim, trimD: sh(look.trim, -30),
      shorts: look.shorts, shortsD: sh(look.shorts, -26), shoe: look.shoes, shoeD: sh(look.shoes, -42)
    };
  }

  // tapered limb between two px points (outline pass then fill pass)
  function limb(g, a, b, w0, w1, col, ow) {
    const pass = (c, e) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, r0 = w0 / 2 + e, r1 = w1 / 2 + e;
      g.fillStyle = c; g.beginPath();
      g.moveTo(a[0] + nx * r0, a[1] + ny * r0); g.lineTo(b[0] + nx * r1, b[1] + ny * r1);
      g.lineTo(b[0] - nx * r1, b[1] - ny * r1); g.lineTo(a[0] - nx * r0, a[1] - ny * r0); g.closePath(); g.fill();
      g.beginPath(); g.arc(a[0], a[1], r0, 0, TAU); g.fill(); g.beginPath(); g.arc(b[0], b[1], r1, 0, TAU); g.fill();
    };
    if (ow) pass(OL, ow); pass(col, 0);
  }
  function poly(g, pts, col, ol, ow) {
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
    if (ol) { g.lineJoin = 'round'; g.lineWidth = ow; g.strokeStyle = ol; g.stroke(); }
    g.fillStyle = col; g.fill();
  }
  function shoe(g, ankle, psi, s, color, dark, ow) {
    const c = Math.cos(psi), sn = Math.sin(psi);          // px space (y down): dir = (c, sn), up-normal = (sn, -c)
    const P = (u, w) => [ankle[0] + (u * c + w * sn) * s, ankle[1] + (u * sn - w * c) * s];
    poly(g, [P(-0.075, -0.05), P(0.20, -0.047), P(0.27, -0.02), P(0.27, 0.012), P(0.17, 0.05), P(0.03, 0.075), P(-0.065, 0.065)], color, OL, ow);
    // sole + toe cap details
    g.strokeStyle = '#f4f4f2'; g.lineWidth = Math.max(0.7, 0.03 * s); g.lineCap = 'round'; g.beginPath();
    const a = P(-0.07, -0.05), b = P(0.25, -0.045); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    const l1 = P(0.0, 0.02), l2 = P(0.14, 0.03); g.strokeStyle = dark; g.lineWidth = Math.max(0.6, 0.022 * s); g.beginPath(); g.moveTo(l1[0], l1[1]); g.lineTo(l2[0], l2[1]); g.stroke();
  }

  // ox,oy = px of ground point under the body; s = px per metre. Returns hand / toe-off screen points for FX.
  XC.drawRig = function (g, r, ox, oy, s, P) {
    const A = r.anim; if (!A || !A.pose) return null;
    const pose = A.pose, look = r.look, c = pal(look), ow = Math.max(0.8, 0.026 * s);
    const T = p => [ox + p[0] * s, oy - p[1] * s];
    const hip = T(pose.hip), sh = T(pose.sh), head = T(pose.head), neck = T(pose.neck);
    // ground shadow (shrinks as the body rises)
    const hh = pose.hip[1], sa = 0.30 - 0.06 * (hh - 0.9) * 8;
    g.fillStyle = `rgba(10,10,30,${Math.max(0.12, sa)})`; g.beginPath(); g.ellipse(ox - pose.lean * 0.25 * s, oy + 0.02 * s, 0.42 * s, 0.065 * s, 0, 0, TAU); g.fill();
    const leg = i => pose.legs[i], arm = i => pose.arms[i];
    const drawLeg = (i, near) => {
      const l = leg(i), H = T(l.hip), K = T(l.knee), An = T(l.ankle);
      const skin = near ? c.skin : c.skinD, shorts = near ? c.shorts : c.shortsD;
      limb(g, K, An, 0.115 * s, 0.075 * s, skin, ow);                                   // shin + calf
      limb(g, H, K, 0.165 * s, 0.115 * s, skin, ow);                                    // thigh
      const m = [H[0] + (K[0] - H[0]) * 0.5, H[1] + (K[1] - H[1]) * 0.5];               // shorts leg
      limb(g, H, m, 0.185 * s, 0.14 * s, shorts, ow * 0.8);
      shoe(g, An, l.psi, s, near ? c.shoe : c.shoeD, c.shoeD, ow);
    };
    const drawArm = (i, near) => {
      const a = arm(i), S = T(a.sh), E = T(a.elbow), Hd = T(a.hand), skin = near ? c.skin : c.skinD;
      limb(g, E, Hd, 0.07 * s, 0.055 * s, skin, ow);                                    // forearm
      limb(g, S, E, 0.085 * s, 0.068 * s, skin, ow);                                    // upper arm
      if (look.tattoos) { g.strokeStyle = near ? '#3b2d63' : '#2a2046'; g.lineWidth = Math.max(0.7, 0.026 * s); g.lineCap = 'round'; g.beginPath(); g.moveTo(S[0] + (E[0] - S[0]) * 0.2, S[1] + (E[1] - S[1]) * 0.2); g.lineTo(S[0] + (E[0] - S[0]) * 0.85, S[1] + (E[1] - S[1]) * 0.85); g.stroke(); }
      g.fillStyle = OL; g.beginPath(); g.arc(Hd[0], Hd[1], 0.054 * s + ow, 0, TAU); g.fill();
      g.fillStyle = near ? c.skinL : skin; g.beginPath(); g.arc(Hd[0], Hd[1], 0.054 * s, 0, TAU); g.fill();
    };
    // ---- far side, torso, head, near side
    drawArm(1, false); drawLeg(1, false);
    // hips / shorts block and torso (singlet)
    const ax = sh[0] - hip[0], ay = sh[1] - hip[1], al = Math.hypot(ax, ay) || 1, ux = ax / al, uy = ay / al;
    const along = d => [hip[0] + ux * d * s, hip[1] + uy * d * s];
    limb(g, hip, along(0.15), 0.215 * s, 0.215 * s, c.shorts, ow);
    limb(g, along(0.13), sh, 0.205 * s, 0.265 * s, c.singlet, ow);
    // trim: back edge stripe + hem band
    const bx = -uy, by = ux;   // normal toward the back (left of travel)
    g.strokeStyle = c.trim; g.lineWidth = Math.max(1, 0.034 * s); g.lineCap = 'round'; g.beginPath();
    const t0 = along(0.2), t1 = along(0.47); g.moveTo(t0[0] + bx * 0.085 * s, t0[1] + by * 0.085 * s); g.lineTo(t1[0] + bx * 0.115 * s, t1[1] + by * 0.115 * s); g.stroke();
    const h0 = along(0.17); g.beginPath(); g.moveTo(h0[0] - bx * 0.1 * s, h0[1] - by * 0.1 * s); g.lineTo(h0[0] + bx * 0.1 * s, h0[1] + by * 0.1 * s); g.stroke();
    // bib
    const bc = along(0.31); g.save(); g.translate(bc[0] + (-bx) * 0.012 * s, bc[1] + (-by) * 0.012 * s); g.rotate(Math.atan2(ux, -uy) * 1);
    g.fillStyle = OL; g.fillRect(-0.075 * s, -0.062 * s, 0.15 * s, 0.124 * s); g.fillStyle = '#fafafa'; g.fillRect(-0.066 * s, -0.053 * s, 0.132 * s, 0.106 * s);
    g.fillStyle = OL; g.font = `bold ${Math.max(3, 0.085 * s)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(look.bib), 0, 0.006 * s); g.restore();
    // neck + head
    limb(g, sh, neck, 0.075 * s, 0.07 * s, c.skinD, ow);
    const hr = 0.118 * s;
    g.fillStyle = OL; g.beginPath(); g.arc(head[0], head[1], hr + ow, 0, TAU); g.fill();
    drawHair(g, look, c, head, hr, s, ow, pose.lean);
    g.fillStyle = c.skin; g.beginPath(); g.arc(head[0], head[1], hr, 0, TAU); g.fill();
    g.fillStyle = c.skinD; g.beginPath(); g.arc(head[0] - hr * 0.1, head[1] + hr * 0.15, hr * 0.92, 0.2 * Math.PI, 0.9 * Math.PI); g.fill();   // jaw shade
    g.fillStyle = c.skin; g.beginPath(); g.arc(head[0] + hr * 0.12, head[1] - hr * 0.05, hr * 0.86, 0, TAU); g.fill();
    g.fillStyle = c.skin; g.beginPath(); g.arc(head[0] + hr * 0.98, head[1] + hr * 0.1, hr * 0.2, 0, TAU); g.fill();   // nose
    g.fillStyle = OL; g.beginPath(); g.arc(head[0] + hr * 0.5, head[1] - hr * 0.08, Math.max(0.6, hr * 0.12), 0, TAU); g.fill();   // eye
    g.strokeStyle = c.skinD; g.lineWidth = Math.max(0.6, hr * 0.1); g.beginPath(); g.arc(head[0] - hr * 0.28, head[1] + hr * 0.02, hr * 0.17, 0, TAU); g.stroke(); // ear
    drawHairFront(g, look, c, head, hr, s, ow);
    drawLeg(0, true); drawArm(0, true);
    const out = { hand: [T(pose.arms[0].hand), T(pose.arms[1].hand)], toe: [A.legs[0].toeOff ? [ox + (A.legs[0].toeX - r.x) * s, oy] : null, A.legs[1].toeOff ? [ox + (A.legs[1].toeX - r.x) * s, oy] : null] };
    return out;
  };

  function drawHair(g, look, c, hd, hr, s, ow, lean) { // parts behind the head circle
    g.fillStyle = c.hair;
    if (look.hair === 'afro') { g.fillStyle = OL; g.beginPath(); g.arc(hd[0] - hr * 0.1, hd[1] - hr * 0.2, hr * 1.38 + ow, 0, TAU); g.fill(); g.fillStyle = c.hair; g.beginPath(); g.arc(hd[0] - hr * 0.1, hd[1] - hr * 0.2, hr * 1.38, 0, TAU); g.fill(); }
    else if (look.hair === 'pony') { // tail trailing back, swings with lean
      const tx = hd[0] - hr * 1.9, ty = hd[1] + hr * 0.5 + lean * 8;
      limb(g, [hd[0] - hr * 0.6, hd[1] - hr * 0.5], [tx, ty], hr * 0.55, hr * 0.3, c.hair, ow);
    }
  }
  function drawHairFront(g, look, c, hd, hr, s, ow) {   // caps over the skull
    const cap = (a0, a1, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(hd[0], hd[1]); g.arc(hd[0], hd[1], hr * 1.02, a0, a1); g.closePath(); g.fill(); };
    switch (look.hair) {
      case 'buzz': cap(Math.PI * 1.02, Math.PI * 1.92, c.hairD); break;
      case 'band': cap(Math.PI * 1.02, Math.PI * 1.9, c.hair);
        g.fillStyle = '#ffffff'; g.fillRect(hd[0] - hr * 1.0, hd[1] - hr * 0.5, hr * 2.0, hr * 0.28); g.fillStyle = OL; g.fillRect(hd[0] - hr * 1.0, hd[1] - hr * 0.5, hr * 2.0, Math.max(0.5, ow * 0.6)); break;
      case 'afro': cap(Math.PI * 1.05, Math.PI * 1.75, c.hair); break;
      default: cap(Math.PI * 0.98, Math.PI * 1.97, c.hair); g.fillStyle = c.hair; g.beginPath(); g.arc(hd[0] - hr * 0.55, hd[1] - hr * 0.1, hr * 0.5, 0, TAU); g.fill();
    }
  }
})(window.XC);
