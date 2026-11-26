# Cross Country Speed Stars

Browser game: HTML + CSS + JS (canvas), no build step, no dependencies.

## Run
- **Desktop:** open `index.html` in Chrome/Edge/Firefox (works from file://). For best results serve it: `python3 -m http.server 8000` then visit http://localhost:8000
- **Phone:** serve the folder from your computer and open `http://<your-computer-ip>:8000` on the phone (same Wi-Fi), landscape. Touch buttons appear automatically. Or host the folder on any static host (GitHub Pages, Netlify).

## Controls
- **Left:** A or Left Arrow &nbsp; **Right:** D or Right Arrow (interchangeable, alternate them)
- **Finishing kick:** hold Space / Shift / Up / W (available in the final stretch) &nbsp; **Pause:** Esc &nbsp; **Restart:** R
- Touch: LEFT / RIGHT buttons bottom corners, KICK above the right button.

## Running animation (skeletal, foot-planted)
Runners are a live 13-part rig (head, torso, hips, upper/lower arms, thighs, shins, shoes) drawn as anti-aliased vectors on a hi-res canvas, not sprite frames.
- **No sliding:** each foot is a stance/swing state machine. On touchdown the ball of the foot is pinned to a *world* position; the body moves over it and 2-bone IK keeps the leg attached. Swing feet follow a path that ends exactly on the next touchdown point.
- **Velocity-driven:** stride frequency, stance fraction (0.62 standing -> 0.22 sprint), knee lift, arm drive, lean and push-off all scale with the runner's actual speed, with smoothing so acceleration/deceleration never snaps.
- **Taps:** each accepted tap gently phase-locks the stride so the tapped side's push-off and same-side hand drive land on the tap (rate-warp only, never a jump), plus hand streaks, dust and HUD lamps.
- **Inspect it:** open `index.html?slow=0.25` (or 0.5) to run the whole game in slow motion.

Rhythm rules: even intervals = efficiency. Same side twice = stumble. Taps closer than 70 ms are ignored, and cadence above ~110% of reference overstrides and loses speed.

## Layout
`js/config.js` constants/courses/characters, `course.js` elevation+surfaces, `runner.js` physics/energy/fatigue/kick, `ai.js` opponents, `input.js`, `anim.js` (stride/IK engine), `rig.js` (vector body), `sprites.js` (env/UI art loader), `render.js`, `ui.js` menus, `game.js` loop/modes/results. Physics is a fixed 120 Hz step.
Art: see `HIGGSFIELD_PROMPTS.md`.

## Mobile/GitHub build updates
- Added installable PWA manifest and service worker for offline/home-screen use.
- Added safe-area-aware mobile controls and larger touch targets.
- Capped the canvas backbuffer at 2x to reduce mobile GPU/memory load.
- Avoided simulation catch-up when the page is backgrounded.
- Improved pointer capture for touch buttons.


## Mobile/GitHub build updates
- Added installable PWA manifest and service worker for offline/home-screen use.
- Added safe-area-aware mobile controls and larger touch targets.
- Capped the canvas backbuffer at 2x to reduce mobile GPU/memory load.
- Avoided simulation catch-up when the page is backgrounded.
- Improved pointer capture for touch buttons.
