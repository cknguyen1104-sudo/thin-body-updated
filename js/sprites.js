/* Asset helpers. Runner pixel-frame sprites were removed: runners are now a live skeletal rig (anim.js + rig.js) so feet can be
   planted on the ground. This file keeps the optional env/ui image loader (Higgsfield art for scenery and menus) and colour helpers. */
(function (XC) {
  const S = XC.Sprites = { env: {}, ui: {}, hasArt: false };
  S.load = function (done) {
    const man = window.XC_ASSETS || {};
    let pending = 1, finished = false;
    const fin = () => { if (!--pending && !finished) { finished = true; done(); } };
    ['env', 'ui'].forEach(g => Object.keys(man[g] || {}).forEach(k => {
      pending++; const i = new Image(); i.onload = () => { S[g][k] = i; S.hasArt = true; fin(); }; i.onerror = fin; i.src = man[g][k];
    }));
    setTimeout(() => { if (!finished) { finished = true; done(); } }, 2500);   // never block the game on art
    setTimeout(fin, 0);
  };
  const shadeCache = {};
  S.shade = function (col, amt) {
    const key = col + '|' + amt; if (shadeCache[key]) return shadeCache[key];
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data, k = v => Math.max(0, Math.min(255, v + amt));
    return shadeCache[key] = `rgb(${k(d[0])},${k(d[1])},${k(d[2])})`;
  };
  S.lookKey = look => [look.skin, look.hair, look.hairColor, look.singlet, look.trim, look.shorts, look.shoes, look.bib, look.tattoos ? 1 : 0].join('|');
})(window.XC);
