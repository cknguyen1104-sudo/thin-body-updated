/* Procedural stride engine (replaces the old 20-frame sprite cycle).

   WHY THIS CANNOT SLIDE
   Each leg is a state machine: STANCE <-> SWING.
   - On touchdown the foot's ball is pinned to a WORLD position (plantX). While in stance the foot's body-relative position is
     plantX - runner.x, so as the runner moves forward the foot goes backwards under the body by exactly the ground speed.
     Rendered with the same px-per-metre as the scrolling ground, the planted foot stays glued to the same ground pixel.
   - Hip height is lowered if a planted foot would be out of reach, so the leg is never stretched off its anchor.
   - The swing foot follows a Hermite path whose start matches the toe-off position and whose end lands exactly on the
     touchdown point that the next stance will pin, so there is no pop at contact.
   - A 2-bone IK solves hip -> knee -> ankle each frame (knee always forward), so joints are continuous.
   Stride phase advances from the runner's actual velocity (steps/s), duty factor (stance fraction) falls with speed,
   lean/arm drive/knee lift scale with speed, and tap events gently phase-lock the stride (rate warp, never a jump).

   Coordinates: metres, +x forward, +y up, origin = on the ground directly below the runner's body x (ground-relative). */
(function (XC) {
  const clamp = XC.clamp, lerp = XC.lerp, smooth = XC.smooth;
  const L1 = 0.52, L2 = 0.52, LMAX = (L1 + L2) * 0.997;
  const FOOT = 0.17, SOLE = 0.045;
  const TAU = Math.PI * 2;
  const wrap1 = x => x - Math.floor(x);

  function ik(hx, hy, tx, ty) {
    let dx = tx - hx, dy = ty - hy, d = Math.hypot(dx, dy);
    if (d > LMAX) { dx *= LMAX / d; dy *= LMAX / d; d = LMAX; }
    if (d < 0.2) { dx *= 0.2 / (d || 1); dy *= 0.2 / (d || 1); d = 0.2; }
    const a = Math.atan2(dy, dx);
    const ca = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const ang = a + Math.acos(ca);                 // + = knee points forward for a downward-pointing leg
    return { kx: hx + Math.cos(ang) * L1, ky: hy + Math.sin(ang) * L1, ax: hx + dx, ay: hy + dy };
  }
  function hermite(p0, p1, m0, m1, s) {
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
  }
  // foot angle psi: radians the toes point DOWN from horizontal
  const footAnkle = (ballX, ballY, psi) => [ballX - FOOT * Math.cos(psi) + SOLE * Math.sin(psi), ballY + FOOT * Math.sin(psi) + SOLE * Math.cos(psi)];

  const Anim = XC.Anim = {};
  Anim.dutyOf = v => 0.22 + 0.40 * Math.exp(-v / 3.2);          // stance fraction of one leg's cycle: ~0.62 standing -> 0.22 sprint
  Anim.stepsOf = v => Math.max(v / (0.45 + 0.2 * v), Math.min(1.7, v * 6)); // natural steps/s from velocity

  Anim.create = function () {
    return {
      phase: 0.57, sv: 0, psv: 0, acc: 0, lean: 0, pending: 0, t: 0, drop: 0, tw: 0,
      legs: [0, 1].map(() => ({ mode: 'stance', plantX: 0, liftX: 0, liftY: 0, ax: 0, ay: 0.1, psi: 0.3, s: 0, toeOff: false, toeX: 0 })),
      init: false, pose: null
    };
  };

  // r: runner {x, v, cadence, pulse, tapQ, isPlayer}. gdy(wx) = ground height (m) at world x relative to the ground under the body.
  Anim.update = function (r, dt, gdy) {
    let A = r.anim; if (!A) A = r.anim = Anim.create();
    dt = clamp(dt, 0, 0.05);
    const v = r.v, x = r.x;
    // ---- smoothed velocity & acceleration: the stride follows the runner's real speed, responsive but never snapping
    if (dt > 0) {
      const k = 1 - Math.exp(-dt * 14);
      A.psv = A.sv; A.sv += (v - A.sv) * k;
      A.acc += (((A.sv - A.psv) / dt) - A.acc) * (1 - Math.exp(-dt * 5));
    }
    const sv = A.sv, sn = clamp(sv / 10, 0, 1.1);
    const rb = smooth((sv - 0.1) / 1.2);                       // idle -> running blend
    let steps = Anim.stepsOf(sv);
    if (r.cadence > 0.5 && sv > 1) steps = lerp(steps, clamp(r.cadence, steps * 0.8, steps * 1.2), 0.6); // taps shape stride frequency a little
    const f = Math.max(steps / 2, 0.05);                       // full stride cycles per second
    const duty = Anim.dutyOf(sv);
    const Ts = duty / f;
    const vTs = sv * Ts;                                       // distance the body travels while one foot is down
    const contactOff = Math.max(0.05, Math.min(0.56 * vTs, 0.55));   // touchdown point ahead of the hip

    // ---- tap phase-lock (player): ease the stride so the tapped side's toe-off lands on the tap. Rate warp only, no jumps.
    if (r.tapQ) {
      if (sv > 1) {
        const target = r.tapQ === 'L' ? duty : wrap1(duty + 0.5);
        let e = target - A.phase; e -= Math.round(e);
        A.pending = clamp(e, -0.18, 0.18);
      }
      r.tapQ = null;
    }
    // ---- phase advance
    let prevPhase = A.phase;
    if (dt > 0) {
      if (sv < 0.1) {                                          // settle to a double-support stance (both feet down)
        let target = 0.07; let e = target - A.phase; e -= Math.round(e * 2) / 2;
        A.phase = wrap1(A.phase + clamp(e, -dt * 0.9, dt * 0.9)); A.pending = 0;
      } else {
        const take = clamp(A.pending, -dt * f * 0.3, dt * f * 0.3); A.pending -= take;
        A.phase = wrap1(A.phase + dt * f + take);
      }
    }
    A.t += dt;
    const phase = A.phase;

    // ---- leg state machine
    for (let i = 0; i < 2; i++) {
      const L = A.legs[i], lp = wrap1(phase - 0.5 * i), want = lp < duty ? 'stance' : 'swing';
      L.toeOff = false;
      if (!A.init) { L.mode = want; L.plantX = x + (want === 'stance' ? clamp(0.2 - lp * 0.4, -0.3, 0.3) : 0); }
      else if (want !== L.mode) {
        if (want === 'stance') { L.plantX = x + contactOff; }                    // touchdown: pin the ball of the foot to the world
        else { L.liftX = L.ax; L.liftY = L.ay; L.toeOff = true; L.toeX = x + L.ax; }   // toe-off: remember where we left the ground
        L.mode = want;
      }
      L.lp = lp;
    }
    // ---- feet
    const sprint = clamp(sv / 9, 0, 1);
    for (let i = 0; i < 2; i++) {
      const L = A.legs[i];
      if (L.mode === 'stance') {
        const s = clamp(L.lp / duty, 0, 1);
        L.s = s;
        const psi = 0.2 + 0.2 * (1 - smooth(s / 0.3)) + 0.62 * smooth((s - 0.55) / 0.45);   // landing -> flat -> heel rises -> toe-off
        const bx = L.plantX - x, by = gdy(L.plantX);
        const a = footAnkle(bx, by, psi);
        L.ax = a[0]; L.ay = a[1]; L.psi = psi;
      } else {
        const s = clamp((L.lp - duty) / (1 - duty), 0, 1);
        L.s = s;
        const Tsw = (1 - duty) / f;
        const psiL = 0.4, landBallX = contactOff, landBallY = gdy(x + contactOff);
        const la = footAnkle(landBallX, landBallY, psiL);
        const m0 = -0.45 * sv * Tsw, m1 = -0.95 * sv * Tsw;
        const px = hermite(L.liftX, la[0], m0, m1, s);
        const base = lerp(L.liftY, la[1], smooth(s));
        const bump = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.72)), 1.15);
        const arc = (0.10 + 0.40 * sprint) * bump;                 // knee lift grows with speed
        const gy = gdy(x + px) + 0.07;
        L.ax = px; L.ay = Math.max(base + arc, gy);
        L.psi = s < 0.5 ? lerp(0.8, -0.1, smooth(s / 0.5)) : lerp(-0.1, psiL, smooth((s - 0.5) / 0.5));
      }
    }
    // ---- hip: slight compression at mid-stance, lowered if a planted foot would be out of reach
    const Hbase = lerp(1.0, 0.93, rb);
    const bobAmp = (0.012 + 0.034 * sprint) * rb;
    const drop = bobAmp * 0.5 * (1 + Math.cos(2 * TAU * (phase - duty / 2)));
    let hipY = Hbase - drop;
    for (let i = 0; i < 2; i++) {
      const L = A.legs[i];
      if (L.mode === 'stance') {
        const room = LMAX * LMAX - L.ax * L.ax;
        if (room > 0) hipY = Math.min(hipY, L.ay + Math.sqrt(room) * 0.998);
      }
    }
    hipY = Math.max(hipY, 0.55);
    A.drop = Hbase - hipY;
    // ---- torso / lean (forward lean grows with speed and acceleration, relaxes when slowing)
    const accT = clamp(A.acc * 0.012, -0.05, 0.12);
    const leanT = rb * (0.05 + 0.27 * sn + accT);
    A.lean += (leanT - A.lean) * (1 - Math.exp(-dt * 6));
    const lean = A.lean + 0.018 * rb * Math.cos(2 * TAU * (phase - duty / 2));
    const tw = Math.cos(TAU * (phase - duty)) * (0.25 + 0.75 * sn) * rb;          // subtle shoulder/hip counter-rotation
    const hx = 0.0, hy = hipY;
    const ex = Math.sin(lean), ey = Math.cos(lean);
    const sh = [hx + 0.5 * ex, hy + 0.5 * ey];
    const neck = [sh[0] + 0.07 * ex, sh[1] + 0.07 * ey];
    const hl = lean * 0.35;
    const head = [neck[0] + 0.15 * Math.sin(hl), neck[1] + 0.15 * Math.cos(hl) + 0.7 * A.drop * rb];  // head stays calm while the body moves
    // ---- legs IK
    const legs = [0, 1].map(i => {
      const L = A.legs[i], hipx = hx + (i === 0 ? 0.025 : -0.025) * tw;
      const k = ik(hipx, hy, L.ax, L.ay);
      return { hip: [hipx, hy], knee: [k.kx, k.ky], ankle: [k.ax, k.ay], psi: L.psi, mode: L.mode, s: L.s };
    });
    // ---- arms: opposite the legs, upper and lower arm move differently; left arm peaks forward at the left toe-off
    const armAmp = (0.22 + 0.80 * sn) * rb, armC = (0.06 + 0.22 * sn) * rb;
    const arms = [0, 1].map(k => {
      const ap = wrap1(phase - duty - 0.5 * k);
      const punch = (k === 0 ? r.pulse.L : r.pulse.R) || 0;
      const th = armC + armAmp * Math.cos(TAU * ap) + 0.13 * punch * rb;
      const flex = (1.30 + 0.30 * sn) * rb + 0.34 * rb * Math.cos(TAU * (ap - 0.08)) + 0.22 * (1 - rb);
      const sx = sh[0] + (k === 0 ? 0.03 : -0.03) * tw * -1, sy = sh[1] - 0.04;
      const ex2 = sx + 0.29 * Math.sin(th), ey2 = sy - 0.29 * Math.cos(th);
      const fa = th + flex;
      return { sh: [sx, sy], elbow: [ex2, ey2], hand: [ex2 + 0.27 * Math.sin(fa), ey2 - 0.27 * Math.cos(fa)] };
    });
    // idle breathing
    const br = (1 - rb) * 0.006 * Math.sin(A.t * 2.1);
    head[1] += br; sh[1] += br * 0.6;

    A.pose = { hip: [hx, hy], sh, neck, head, lean, legs, arms, drop: A.drop, duty, f, sv, rb };
    A.init = true;
    // events for FX / AI hand pulses
    for (let i = 0; i < 2; i++) if (A.legs[i].toeOff && !r.isPlayer) r.pulse[i === 0 ? 'L' : 'R'] = 1;
    return A.pose;
  };
})(window.XC);
