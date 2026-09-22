/* ============================================================
   TANDEM — cinematic engine v2 (vanilla, zero dependencies)
   - Scroll-scrubbed BACKGROUND FILM on canvas: a "video" that
     plays as you scroll, morphing through four acts:
       0  hero      — calm starfield, drifting packets
       1  journey   — packets flow phone → tor hops → mailbox → peer
       2  problem   — swarm of hostile red packets
       3  protect   — swarm converges into a scanning beam / shield
       4  outro     — calm constellation again
   - Pinned section scrubbing (journey + AI scan)
   - Count-up stats, pointer tilt, orb parallax
   - Progress bar + section rail
   Everything respects prefers-reduced-motion.
   ============================================================ */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none)").matches;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ================= background film ================= */
  const canvas = document.getElementById("bgCanvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildStars();
  }

  /* ---- stars (ambient layer) ---- */
  let stars = [];
  function buildStars() {
    const n = Math.min(190, Math.floor((W * H) / 9000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.4 + Math.random() * 1.1,
      tw: Math.random() * Math.PI * 2,
      sp: 0.15 + Math.random() * 0.5,
    }));
  }

  /* ---- nodes: the network the film shows ----
     Positions are in unit space (0..1) and mapped to screen each frame,
     so the film adapts to any viewport. */
  const NODES = {
    phoneA: { x: 0.14, y: 0.62 },
    tor1:   { x: 0.34, y: 0.30 },
    tor2:   { x: 0.50, y: 0.48 },
    tor3:   { x: 0.66, y: 0.26 },
    mailbox:{ x: 0.80, y: 0.55 },
    phoneB: { x: 0.90, y: 0.34 },
  };

  const LINKS = [
    ["phoneA", "tor1"],
    ["tor1", "tor2"],
    ["tor2", "tor3"],
    ["tor3", "mailbox"],
    ["mailbox", "phoneB"],
  ];

  /* packets travelling the links */
  const packets = [];
  function spawnPacket(fromAct) {
    const link = LINKS[(Math.random() * LINKS.length) | 0];
    packets.push({
      a: link[0], b: link[1],
      t: 0,
      sp: 0.0035 + Math.random() * 0.005,
      hostile: fromAct === 2 || (fromAct === 3 && Math.random() < 0.35),
      hue: Math.random() < 0.5 ? "a" : "b",
      size: 1.1 + Math.random() * 1.6,
    });
  }
  function seedPackets() {
    packets.length = 0;
    const n = 26;
    for (let i = 0; i < n; i++) {
      spawnPacket(1);
      packets[i].t = Math.random();
    }
  }

  /* film state */
  let filmT = 0;          // global scroll progress 0..1 over the page
  let act = 0;            // current act
  const ACT_OF = (t) => {
    // map page progress to acts: hero, journey, problem, protect, outro
    if (t < 0.09) return 0;
    if (t < 0.36) return 1;
    if (t < 0.54) return 2;
    if (t < 0.86) return 3;
    return 4;
  };

  function updateFilmState() {
    const doc = document.documentElement;
    const max = Math.max(doc.scrollHeight - window.innerHeight, 1);
    filmT = clamp01(window.scrollY / max);
    const a = ACT_OF(filmT);
    if (a !== act) act = a;
  }

  /* hostile swarm for the "problem" act */
  let hostiles = [];
  function seedHostiles() {
    hostiles = Array.from({ length: 34 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0016,
      vy: (Math.random() - 0.5) * 0.0016,
      r: 1.2 + Math.random() * 2.1,
      ph: Math.random() * Math.PI * 2,
    }));
  }
  seedHostiles();

  /* scanning beam sweep for the "protect" act */
  let sweepX = 0;

  function drawFilm(now) {
    ctx.clearRect(0, 0, W, H);

    /* stars */
    ctx.globalAlpha = 0.5;
    for (const s of stars) {
      s.tw += 0.012 * s.sp;
      const tw = 0.55 + 0.45 * Math.sin(s.tw);
      ctx.globalAlpha = 0.16 + 0.3 * tw;
      ctx.fillStyle = "#9db8d8";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const P = (n) => ({ x: NODES[n].x * W, y: NODES[n].y * H });

    /* ---- act 1/4: network links glow ---- */
    const netAlpha =
      act === 1 ? 0.9 :
      act === 3 ? 0.55 :
      act === 2 ? 0.22 : 0.4;
    ctx.lineWidth = 1;
    for (const [aName, bName] of LINKS) {
      const A = P(aName), B = P(bName);
      const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      g.addColorStop(0, `rgba(125, 211, 252, ${0.10 * netAlpha})`);
      g.addColorStop(1, `rgba(167, 139, 250, ${0.10 * netAlpha})`);
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      // slight curve for elegance
      ctx.quadraticCurveTo((A.x + B.x) / 2, (A.y + B.y) / 2 - 40, B.x, B.y);
      ctx.stroke();
    }

    /* ---- act 1/4: nodes ---- */
    const nodeGlow = act === 1 ? 1 : act === 3 ? 0.7 : 0.45;
    for (const name in NODES) {
      const p = P(name);
      const isMail = name === "mailbox";
      const isTor = name.startsWith("tor");
      const col = isMail ? "167,139,250" : isTor ? "125,211,252" : "52,211,153";
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.0012 + p.x * 0.01);
      const r = (isMail ? 6 : 4) * (0.8 + 0.4 * nodeGlow);
      ctx.fillStyle = `rgba(${col}, ${0.5 * nodeGlow * pulse})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = `rgba(${col}, ${0.22 * nodeGlow})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 6 + 3 * pulse, 0, 6.2832);
      ctx.stroke();
    }

    /* ---- packets on links ---- */
    const pktAlpha = act === 2 ? 0.15 : act === 0 || act === 4 ? 0.5 : 0.95;
    for (let i = packets.length - 1; i >= 0; i--) {
      const pk = packets[i];
      pk.t += pk.sp;
      if (pk.t >= 1) {
        packets.splice(i, 1);
        spawnPacket(act);
        continue;
      }
      const A = P(pk.a), B = P(pk.b);
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 - 40;
      const u = pk.t;
      const x = lerp(lerp(A.x, mx, u), lerp(mx, B.x, u), u);
      const y = lerp(lerp(A.y, my, u), lerp(my, B.y, u), u);
      const col = pk.hue === "a" ? "125,211,252" : "167,139,250";
      ctx.fillStyle = `rgba(${col}, ${pktAlpha})`;
      ctx.beginPath();
      ctx.arc(x, y, pk.size, 0, 6.2832);
      ctx.fill();
      // trail
      const u2 = Math.max(0, u - 0.03);
      const x2 = lerp(lerp(A.x, mx, u2), lerp(mx, B.x, u2), u2);
      const y2 = lerp(lerp(A.y, my, u2), lerp(my, B.y, u2), u2);
      ctx.strokeStyle = `rgba(${col}, ${pktAlpha * 0.35})`;
      ctx.lineWidth = pk.size * 0.9;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    /* ---- act 2: hostile swarm ---- */
    if (act === 2) {
      for (const h of hostiles) {
        h.x += h.vx; h.y += h.vy;
        if (h.x < 0 || h.x > 1) h.vx *= -1;
        if (h.y < 0 || h.y > 1) h.vy *= -1;
        const flick = 0.5 + 0.5 * Math.sin(now * 0.004 + h.ph);
        ctx.fillStyle = `rgba(248, 113, 113, ${0.14 + 0.3 * flick})`;
        ctx.beginPath();
        ctx.arc(h.x * W, h.y * H, h.r, 0, 6.2832);
        ctx.fill();
        // tiny danger ring
        ctx.strokeStyle = `rgba(248, 113, 113, ${0.10 * flick})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(h.x * W, h.y * H, h.r + 5, 0, 6.2832);
        ctx.stroke();
      }
    }

    /* ---- act 3: scanning beam ---- */
    if (act === 3) {
      sweepX = (Math.sin(now * 0.0006) * 0.5 + 0.5) * W;
      const g = ctx.createLinearGradient(sweepX - 90, 0, sweepX + 90, 0);
      g.addColorStop(0, "rgba(125,211,252,0)");
      g.addColorStop(0.5, "rgba(125,211,252,0.10)");
      g.addColorStop(1, "rgba(167,139,250,0)");
      ctx.fillStyle = g;
      ctx.fillRect(sweepX - 90, 0, 180, H);
      // shield arc around mailbox
      const M = P("mailbox");
      const shield = 0.5 + 0.5 * Math.sin(now * 0.002);
      ctx.strokeStyle = `rgba(52, 211, 153, ${0.16 + 0.1 * shield})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(M.x, M.y, 60 + 8 * shield, -2.4, 0.6);
      ctx.stroke();
    }

    /* ---- act 4 outro: constellation breathes brighter ---- */
    if (act === 4) {
      ctx.globalAlpha = 0.10 + 0.05 * Math.sin(now * 0.0008);
      ctx.fillStyle = "#7dd3fc";
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 1.4, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ================= pinned scrubbers ================= */
  function makeScrubber(pinWrap, stage, attr, steps, counterHost) {
    if (!pinWrap || !stage || steps.length === 0) return () => {};
    let counterSpans = null;
    if (counterHost && !reduceMotion) {
      const bar = document.createElement("div");
      bar.className = "j-step-counter";
      counterSpans = steps.map(() => {
        const s = document.createElement("span");
        bar.appendChild(s);
        return s;
      });
      counterHost.appendChild(bar);
    }
    const setStep = (idx) => {
      stage.setAttribute(attr, String(idx));
      steps.forEach((el, i) => el.classList.toggle("is-active", i === idx));
      if (counterSpans) counterSpans.forEach((s, i) => s.classList.toggle("on", i <= idx));
    };
    const update = () => {
      const r = pinWrap.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const progress = clamp01(-r.top / Math.max(total, 1));
      setStep(Math.min(steps.length - 1, Math.floor(progress * steps.length)));
    };
    setStep(0);
    return update;
  }

  const journeyUpdate = makeScrubber(
    document.querySelector("#journey .pin-wrap"),
    document.getElementById("journeyStage"),
    "data-step",
    Array.from(document.querySelectorAll(".j-step")),
    document.querySelector(".j-copy")
  );
  const scanUpdate = makeScrubber(
    document.querySelector("#protect .pin-wrap"),
    document.getElementById("scanStage"),
    "data-scan",
    Array.from(document.querySelectorAll(".scan-step")),
    null
  );

  /* ---- 3D showcase scrubber: device rotates + shot changes with scroll ---- */
  const showWrap = document.querySelector("#showcase .pin-wrap");
  const showStage = document.getElementById("showStage");
  const showSteps = Array.from(document.querySelectorAll(".s-step"));
  const showCaption = document.getElementById("sCaption");
  const showDevice = document.querySelector(".s-device");
  const FLOATS = Array.from(document.querySelectorAll(".s-float"));
  const FLOAT_BASE = [-14, 10, -7]; // deg per float at progress 0 (alternating)
  const FLOAT_RANGE = 22;           // additional degrees across the full scrub
  function showUpdate() {
    if (!showWrap || !showStage || showSteps.length === 0) return;
    const r = showWrap.getBoundingClientRect();
    const total = Math.max(r.height - window.innerHeight, 1);
    const p = clamp01(-r.top / total);
    const idx = Math.min(showSteps.length - 1, Math.floor(p * showSteps.length));
    showStage.setAttribute("data-step", String(idx));
    showSteps.forEach((el, i) => el.classList.toggle("is-active", i === idx));
    const cap = showSteps[idx].dataset.cap;
    if (cap && showCaption && showCaption.textContent !== cap) showCaption.textContent = cap;
    if (showDevice && !reduceMotion) {
      const rotY = lerp(16, -16, p);
      const rotX = lerp(6, -3, p);
      const shift = lerp(-30, 30, p);
      showDevice.style.transform =
        `rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg) translateX(${shift.toFixed(1)}px)`;
      for (let i = 0; i < FLOATS.length; i++) {
        const base = FLOAT_BASE[i] || 0;
        const rise = lerp(18, -18, p);
        FLOATS[i].style.transform =
          `translateZ(60px) translate3d(0, ${rise.toFixed(1)}px, 0) rotateY(${(base + lerp(-FLOAT_RANGE, FLOAT_RANGE, p)).toFixed(2)}deg)`;
      }
    }
  }

  /* ---- parallax layers (band image, gallery cards, hero drift) ---- */
  const parallaxEls = Array.from(document.querySelectorAll("[data-parallax]"));
  function parallaxUpdate() {
    if (reduceMotion) return;
    const vh = window.innerHeight;
    for (const el of parallaxEls) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -160 || r.top > vh + 160) continue;
      const speed = parseFloat(el.dataset.speed || "0.1");
      const center = r.top + r.height / 2 - vh / 2;
      const shift = -center * speed;
      el.style.translate = `0 ${shift.toFixed(1)}px`;
    }
  }
  /* ---- hero content drifts up + fades as you leave it ---- */
  const heroInner = () => document.querySelector(".hero");
  function heroDrift() {
    if (reduceMotion) return;
    const h = heroInner();
    if (!h) return;
    const y = window.scrollY;
    if (y > window.innerHeight * 1.15) return;
    const p = clamp01(y / (window.innerHeight * 0.9));
    h.style.setProperty("--hero-shift", `${(-y * 0.24).toFixed(1)}px`);
    h.style.setProperty("--hero-fade", String(1 - p * 0.85));
  }

  /* ---- background video: force play (some browsers skip autoplay) + battery kindness ---- */
  const heroVideo = document.getElementById("heroVideo");
  if (heroVideo) {
    const playV = () => heroVideo.play().catch(() => {});
    playV();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) heroVideo.pause();
      else playV();
    });
  }

  /* ================= reveals ================= */
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* ================= counters ================= */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function animateCount(el) {
    const target = parseFloat(el.dataset.target || "0");
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const suffix = el.dataset.suffix || "";
    const dur = 1700;
    const t0 = performance.now();
    const tick = (now) => {
      const p = clamp01((now - t0) / dur);
      el.textContent = (target * easeOut(p)).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const cio = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          animateCount(e.target);
          cio.unobserve(e.target);
        }
      }
    },
    { threshold: 0.6 }
  );
  document.querySelectorAll(".count").forEach((el) => cio.observe(el));

  /* ================= tilt ================= */
  function bindTilt(host) {
    const target = host.querySelector(".phone") || host.querySelector(".pr-card") || host;
    const MAX = 8;
    host.addEventListener("pointermove", (ev) => {
      if (isTouch || reduceMotion) return;
      const r = host.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width - 0.5;
      const py = (ev.clientY - r.top) / r.height - 0.5;
      const flat = (target.style.transform || "").replace(/rotate[XY]\([^)]*\)/g, "").trim();
      target.style.transform = `${flat} rotateY(${(px * MAX).toFixed(2)}deg) rotateX(${(-py * MAX).toFixed(2)}deg)`.trim();
    });
    host.addEventListener("pointerleave", () => { target.style.transform = ""; });
  }
  document.querySelectorAll("[data-tilt]").forEach(bindTilt);

  /* ================= progress bar + rail ================= */
  const progressBar = document.getElementById("progressBar");
  const rail = document.getElementById("rail");
  const railLinks = [];
  if (rail) {
    document.querySelectorAll("main section[id], main section[data-label]").forEach((sec) => {
      const label = sec.dataset.label;
      if (!label) return;
      const a = document.createElement("a");
      a.href = sec.id ? "#" + sec.id : "#";
      a.innerHTML = `<em>${label}</em><i></i>`;
      rail.appendChild(a);
      railLinks.push({ a, sec });
    });
    railLinks.forEach(({ a }) => {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const sec = railLinks.find((r) => r.a === a).sec;
        sec.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  }

  /* ================= master loop ================= */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }
  const navEl = document.getElementById("nav");
  function frame(now) {
    ticking = false;

    // nav
    navEl.classList.toggle("scrolled", window.scrollY > 24);

    // progress bar
    if (progressBar) {
      const doc = document.documentElement;
      const max = Math.max(doc.scrollHeight - window.innerHeight, 1);
      progressBar.style.transform = `scaleX(${clamp01(window.scrollY / max).toFixed(4)})`;
    }

    // rail active state
    let current = null;
    for (const { sec } of railLinks) {
      const r = sec.getBoundingClientRect();
      if (r.top <= window.innerHeight * 0.45 && r.bottom > window.innerHeight * 0.45) current = sec;
    }
    railLinks.forEach(({ a, sec }) => a.classList.toggle("active", sec === current));

    if (!reduceMotion) {
      journeyUpdate();
      scanUpdate();
      showUpdate();
      parallaxUpdate();
      heroDrift();
      updateFilmState();
      drawFilm(now);
    }
  }

  /* boot */
  resize();
  window.addEventListener("resize", resize);
  seedPackets();
  updateFilmState();
  if (reduceMotion) {
    // draw one calm static frame
    drawFilm(0);
  } else {
    (function loop(now) {
      drawFilm(now);
      requestAnimationFrame(loop);
    })(performance.now());
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  // still update scrubbers/nav even with reduced motion
  if (reduceMotion) {
    window.addEventListener("scroll", () => {
      navEl.classList.toggle("scrolled", window.scrollY > 24);
      journeyUpdate();
      scanUpdate();
      showUpdate();
    }, { passive: true });
  }
})();
