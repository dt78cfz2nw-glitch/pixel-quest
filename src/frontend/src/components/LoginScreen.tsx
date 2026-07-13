import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useEffect, useRef, useState } from "react";
import { createActor } from "../backend";
import { initAudio, playLoginMusic, stopLoginMusic } from "../lib/audio";
import type { CharacterClass } from "../types/game";

// ─── Storage helpers ───────────────────────────────────────────────────────────

const USERNAME_KEY = "rpg_username";
const CLASS_KEY = "rpg_class";

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function getStoredClass(): CharacterClass {
  const stored = localStorage.getItem(CLASS_KEY);
  return stored === "mage" ? "mage" : "warrior";
}

function saveSession(username: string, cls: CharacterClass): void {
  localStorage.setItem(USERNAME_KEY, username);
  localStorage.setItem(CLASS_KEY, cls);
}

// ─── Class definitions ─────────────────────────────────────────────────────────

interface ClassInfo {
  cls: CharacterClass;
  label: string;
  tagline: string;
  icon: string;
}

const CLASS_INFO: ClassInfo[] = [
  {
    cls: "warrior",
    label: "WARRIOR",
    tagline: "Strength & endurance",
    icon: "⚔",
  },
  { cls: "mage", label: "MAGE", tagline: "Magic & arcana", icon: "✦" },
];

// ─── II Login State Machine ────────────────────────────────────────────────────

export type IILoginState =
  | "idle"
  | "authenticating"
  | "opening-popup"
  | "verifying"
  | "loading-characters"
  | "entering-world"
  | "timeout"
  | "failed"
  | "cancelled"
  | "success";

export interface IILoginError {
  message: string;
  code?: string;
}

// ─── Star layer canvas (Layer 1 — slowest, with shooting stars) ───────────────

function StarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    type Star = {
      x: number;
      y: number;
      r: number;
      speed: number;
      alpha: number;
      twinkle: number;
      twinkleSpeed: number;
    };
    const stars: Star[] = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.62,
      r: Math.random() * 1.4 + 0.3,
      speed: Math.random() * 0.08 + 0.02,
      alpha: Math.random() * 0.6 + 0.2,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.02 + 0.008,
    }));

    type ShootingStar = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      length: number;
      life: number;
      maxLife: number;
      active: boolean;
    };
    const MAX_SHOOTING = 3;
    const shootingStars: ShootingStar[] = Array.from(
      { length: MAX_SHOOTING },
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        length: 0,
        life: 0,
        maxLife: 1,
        active: false,
      }),
    );
    const nextTrigger: number[] = Array.from(
      { length: MAX_SHOOTING },
      () => (8 + Math.random() * 14) * 1000,
    );
    const elapsed = [0, 0, 0];

    function spawnShootingStar(i: number) {
      const ss = shootingStars[i]!;
      ss.x = Math.random() * W * 0.6;
      ss.y = Math.random() * H * 0.35;
      const angle = (Math.random() * 20 + 10) * (Math.PI / 180);
      const speed = 6 + Math.random() * 5;
      ss.vx = Math.cos(angle) * speed;
      ss.vy = Math.sin(angle) * speed;
      ss.length = 40 + Math.random() * 45;
      ss.life = 0;
      ss.maxLife = 22 + Math.random() * 12;
      ss.active = true;
    }

    let lastTime = performance.now();

    function draw(now: number) {
      if (!ctx) return;
      const dt = now - lastTime;
      lastTime = now;
      ctx.clearRect(0, 0, W, H);

      for (const s of stars) {
        s.twinkle += s.twinkleSpeed;
        const a = s.alpha * (0.7 + 0.3 * Math.sin(s.twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        ctx.fill();
        s.x += s.speed;
        if (s.x > W + 2) s.x = -2;
      }

      for (let i = 0; i < MAX_SHOOTING; i++) {
        const ss = shootingStars[i]!;
        if (ss.active) {
          ss.life++;
          const progress = ss.life / ss.maxLife;
          const alpha =
            progress < 0.25
              ? (progress / 0.25) * 0.92
              : Math.max(0, (1 - (progress - 0.25) / 0.75) * 0.92);

          if (alpha > 0.01) {
            const tailX = ss.x - (ss.vx / Math.hypot(ss.vx, ss.vy)) * ss.length;
            const tailY = ss.y - (ss.vy / Math.hypot(ss.vx, ss.vy)) * ss.length;
            const grad = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
            grad.addColorStop(0, "rgba(255,255,255,0)");
            grad.addColorStop(
              0.6,
              `rgba(220,230,255,${(alpha * 0.4).toFixed(2)})`,
            );
            grad.addColorStop(1, `rgba(255,255,255,${alpha.toFixed(2)})`);
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(ss.x, ss.y);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ss.x, ss.y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.fill();
          }

          ss.x += ss.vx;
          ss.y += ss.vy;
          if (ss.life >= ss.maxLife || ss.x > W + 100) {
            ss.active = false;
            nextTrigger[i] = (8 + Math.random() * 14) * 1000;
            elapsed[i] = 0;
          }
        } else {
          elapsed[i] += dt;
          if (elapsed[i]! >= nextTrigger[i]!) spawnShootingStar(i);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    function onResize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W;
      canvas!.height = H;
    }
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Decorative star field"
      style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }}
    />
  );
}

// ─── Particle layer canvas (Layer 2 — gold/white upward drift) ────────────────

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const GOLD_COLORS = [
      "rgba(255,215,0,",
      "rgba(255,230,80,",
      "rgba(255,255,220,",
      "rgba(255,200,50,",
    ];
    type Particle = {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      color: string;
      sway: number;
      swaySpeed: number;
    };

    function spawn(forceBottom = false): Particle {
      const maxLife = 280 + Math.random() * 320;
      return {
        x: Math.random() * W,
        y: forceBottom ? H + Math.random() * 60 : Math.random() * H,
        r: Math.random() * 2.2 + 0.5,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -(Math.random() * 0.5 + 0.2),
        life: 0,
        maxLife,
        color: GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)]!,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: Math.random() * 0.018 + 0.006,
      };
    }

    const particles: Particle[] = Array.from({ length: 30 }, () =>
      spawn(false),
    );

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        p.life++;
        p.sway += p.swaySpeed;
        if (p.life >= p.maxLife || p.y < -8) {
          particles[i] = spawn(true);
          continue;
        }
        p.x += p.vx + Math.sin(p.sway) * 0.18;
        p.y += p.vy;
        const progress = p.life / p.maxLife;
        const alpha = Math.sin(progress * Math.PI) * 0.75;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${alpha.toFixed(2)})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    function onResize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W;
      canvas!.height = H;
    }
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Decorative floating particles"
      style={{ position: "fixed", inset: 0, zIndex: 3, pointerEvents: "none" }}
    />
  );
}

// ─── Light ray canvas (Layer 3 — occasional sweep) ────────────────────────────

function LightRayCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    type Ray = {
      x: number;
      alpha: number;
      width: number;
      speed: number;
      phase: "fade-in" | "hold" | "fade-out" | "idle";
      timer: number;
      nextAt: number;
    };
    const ray: Ray = {
      x: -200,
      alpha: 0,
      width: 0,
      speed: 0,
      phase: "idle",
      timer: 0,
      nextAt: 8000 + Math.random() * 4000,
    };
    let lastTime = performance.now();

    function draw(now: number) {
      if (!ctx) return;
      const dt = now - lastTime;
      lastTime = now;
      ctx.clearRect(0, 0, W, H);

      if (ray.phase === "idle") {
        ray.timer += dt;
        if (ray.timer >= ray.nextAt) {
          ray.x = -100;
          ray.alpha = 0;
          ray.width = 80 + Math.random() * 120;
          ray.speed = 0.04 + Math.random() * 0.03;
          ray.phase = "fade-in";
          ray.timer = 0;
        }
      } else if (ray.phase === "fade-in") {
        ray.x += ray.speed * dt;
        ray.alpha = Math.min(0.13, ray.alpha + 0.001 * dt);
        if (ray.alpha >= 0.12) ray.phase = "hold";
      } else if (ray.phase === "hold") {
        ray.x += ray.speed * dt;
        if (ray.x > W * 0.4) ray.phase = "fade-out";
      } else if (ray.phase === "fade-out") {
        ray.x += ray.speed * dt;
        ray.alpha = Math.max(0, ray.alpha - 0.0008 * dt);
        if (ray.alpha <= 0 || ray.x > W + 200) {
          ray.phase = "idle";
          ray.timer = 0;
          ray.nextAt = 8000 + Math.random() * 6000;
        }
      }

      if (ray.phase !== "idle" && ray.alpha > 0) {
        const grad = ctx.createLinearGradient(
          ray.x - ray.width,
          0,
          ray.x + ray.width,
          0,
        );
        grad.addColorStop(0, "rgba(220,200,255,0)");
        grad.addColorStop(0.5, `rgba(220,200,255,${ray.alpha.toFixed(3)})`);
        grad.addColorStop(1, "rgba(220,200,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(ray.x - ray.width, 0, ray.width * 2, H * 0.7);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    function onResize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W;
      canvas!.height = H;
    }
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Decorative light ray effect"
      style={{ position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none" }}
    />
  );
}

// ─── Aurora canvas (soft green-purple wave behind logo) ────────────────────────────

function AuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      t += 0.003;
      const bands: Array<{ cy: number; amp: number; color: string }> = [
        { cy: H * 0.3, amp: H * 0.055, color: "80,40,180" },
        { cy: H * 0.24, amp: H * 0.04, color: "60,120,80" },
        { cy: H * 0.35, amp: H * 0.035, color: "100,50,200" },
      ];
      for (const band of bands) {
        const a = 0.06 + 0.05 * Math.sin(t * 0.7);
        const grad = ctx.createLinearGradient(
          0,
          band.cy - band.amp * 2.5,
          0,
          band.cy + band.amp * 2.5,
        );
        grad.addColorStop(0, `rgba(${band.color},0)`);
        grad.addColorStop(0.4, `rgba(${band.color},${a.toFixed(3)})`);
        grad.addColorStop(0.6, `rgba(${band.color},${a.toFixed(3)})`);
        grad.addColorStop(1, `rgba(${band.color},0)`);
        ctx.beginPath();
        const wH = band.amp * (0.85 + 0.15 * Math.sin(t));
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 20) {
          const y =
            band.cy +
            Math.sin((x / W) * Math.PI * 3 + t * 1.2) * wH +
            Math.sin((x / W) * Math.PI * 5 + t * 0.8) * wH * 0.4;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);

    function onResize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W;
      canvas!.height = H;
    }
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Decorative aurora effect"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        opacity: 0.75,
      }}
    />
  );
}

// ─── City silhouette (SVG, Layer 2 bg) ────────────────────────────────────────

function CitySilhouette() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let last = performance.now();
    const DRIFT = 1 / 3000; // 1px per 3000ms
    function tick(now: number) {
      const dt = now - last;
      last = now;
      offsetRef.current += dt * DRIFT;
      if (offsetRef.current >= 1440) offsetRef.current -= 1440;
      if (wrapRef.current) {
        wrapRef.current.style.transform = `translateX(-${offsetRef.current.toFixed(2)}px)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const svgContent = (
    <>
      <defs>
        <radialGradient id="cg" cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#4020a0" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#1a0550" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#060015" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="100" width="1440" height="240" fill="url(#cg)" />
      <rect
        x="0"
        y="200"
        width="1440"
        height="140"
        fill="#06061e"
        opacity="0.85"
      />
      <rect
        x="30"
        y="180"
        width="55"
        height="160"
        fill="#09092a"
        opacity="0.75"
      />
      <rect
        x="42"
        y="168"
        width="14"
        height="16"
        fill="#09092a"
        opacity="0.75"
      />
      <rect
        x="58"
        y="168"
        width="14"
        height="16"
        fill="#09092a"
        opacity="0.75"
      />
      <rect
        x="120"
        y="145"
        width="75"
        height="195"
        fill="#0b0b30"
        opacity="0.8"
      />
      <rect
        x="120"
        y="133"
        width="20"
        height="15"
        fill="#0b0b30"
        opacity="0.8"
      />
      <rect
        x="143"
        y="133"
        width="20"
        height="15"
        fill="#0b0b30"
        opacity="0.8"
      />
      <rect
        x="166"
        y="133"
        width="20"
        height="15"
        fill="#0b0b30"
        opacity="0.8"
      />
      <rect
        x="240"
        y="90"
        width="95"
        height="250"
        fill="#0d0d38"
        opacity="0.9"
      />
      <rect
        x="278"
        y="44"
        width="20"
        height="36"
        fill="#0d0d38"
        opacity="0.9"
      />
      <polygon points="288,22 278,46 298,46" fill="#0d0d38" opacity="0.9" />
      <rect x="252" y="110" width="8" height="8" fill="#5030d0" opacity="0.5" />
      <rect x="268" y="110" width="8" height="8" fill="#4020b0" opacity="0.4" />
      <rect
        x="380"
        y="160"
        width="62"
        height="180"
        fill="#0c0c32"
        opacity="0.75"
      />
      <rect
        x="490"
        y="110"
        width="88"
        height="230"
        fill="#0d0d38"
        opacity="0.88"
      />
      <rect
        x="526"
        y="62"
        width="16"
        height="38"
        fill="#0d0d38"
        opacity="0.88"
      />
      <polygon points="534,42 526,64 542,64" fill="#0d0d38" opacity="0.88" />
      <rect
        x="628"
        y="148"
        width="70"
        height="192"
        fill="#0c0c30"
        opacity="0.78"
      />
      <rect
        x="748"
        y="60"
        width="105"
        height="280"
        fill="#0f0f3a"
        opacity="0.95"
      />
      <rect
        x="793"
        y="18"
        width="15"
        height="30"
        fill="#0f0f3a"
        opacity="0.95"
      />
      <polygon points="800,0 793,20 807,20" fill="#0f0f3a" opacity="0.95" />
      <circle cx="800" cy="0" r="4" fill="#8060ff" opacity="0.6" />
      <rect x="758" y="82" width="8" height="10" fill="#7050ff" opacity="0.4" />
      <rect x="790" y="82" width="8" height="10" fill="#7050ff" opacity="0.4" />
      <rect
        x="910"
        y="168"
        width="60"
        height="172"
        fill="#0b0b2e"
        opacity="0.72"
      />
      <rect
        x="1008"
        y="126"
        width="80"
        height="214"
        fill="#0d0d36"
        opacity="0.82"
      />
      <rect
        x="1140"
        y="150"
        width="64"
        height="190"
        fill="#0b0b2c"
        opacity="0.74"
      />
      <rect
        x="1252"
        y="100"
        width="90"
        height="240"
        fill="#0d0d38"
        opacity="0.85"
      />
      <rect
        x="1290"
        y="58"
        width="16"
        height="32"
        fill="#0d0d38"
        opacity="0.85"
      />
      <polygon points="1298,38 1290,60 1306,60" fill="#0d0d38" opacity="0.85" />
      <rect
        x="0"
        y="310"
        width="1440"
        height="30"
        fill="#05051a"
        opacity="0.95"
      />
    </>
  );

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "42vh",
        zIndex: 2,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(30,10,80,0.85) 0%, rgba(20,5,60,0.6) 40%, transparent 100%)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <div
        ref={wrapRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "200%",
          height: "100%",
          willChange: "transform",
          display: "flex",
        }}
      >
        <svg
          viewBox="0 0 1440 340"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
          style={{
            width: "50%",
            height: "100%",
            display: "block",
            flexShrink: 0,
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {svgContent}
        </svg>
        <svg
          viewBox="0 0 1440 340"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
          style={{
            width: "50%",
            height: "100%",
            display: "block",
            flexShrink: 0,
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {svgContent}
        </svg>
      </div>
    </div>
  );
}

// ─── ClassCard ─────────────────────────────────────────────────────────────────

function ClassCard({
  info,
  selected,
  onSelect,
}: {
  info: ClassInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-ocid={`class-select-${info.cls}`}
      onClick={onSelect}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "14px 8px",
        background: selected
          ? "rgba(255,215,0,0.12)"
          : "rgba(255,255,255,0.04)",
        border: selected
          ? "2px solid #FFD700"
          : "1.5px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: selected ? "0 0 14px rgba(255,215,0,0.25)" : "none",
        minHeight: 48,
      }}
    >
      <span style={{ fontSize: 22 }} aria-hidden="true">
        {info.icon}
      </span>
      <p
        style={{
          fontFamily: '"Press Start 2P", "VT323", monospace',
          fontSize: 9,
          color: selected ? "#FFD700" : "#ccc",
          letterSpacing: "0.2em",
          margin: 0,
        }}
      >
        {info.label}
      </p>
      <p
        style={{
          fontFamily: "monospace",
          fontSize: 9,
          color: "#666",
          margin: 0,
          textAlign: "center",
        }}
      >
        {info.tagline}
      </p>
    </button>
  );
}

// ─── Players Online Bar ────────────────────────────────────────────────────────

function PlayersOnlineBar() {
  const { actor, isFetching } = useActor(createActor);
  const [count, setCount] = useState<number | null>(null);
  const [flashing, setFlashing] = useState(false);

  const fetchCount = useCallback(async () => {
    if (!actor || isFetching) return;
    try {
      const players = await actor.getAllPlayers();
      const newCount = players.length;
      setCount((prev) => {
        if (prev !== null && prev !== newCount) {
          setFlashing(true);
          setTimeout(() => setFlashing(false), 350);
        }
        return newCount;
      });
    } catch {
      /* cosmetic only */
    }
  }, [actor, isFetching]);

  useEffect(() => {
    void fetchCount();
    const interval = setInterval(() => void fetchCount(), 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const isOnline = count !== null;

  return (
    <div
      data-ocid="players-online-bar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 101,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "10px 16px 12px",
        background:
          "linear-gradient(to top, rgba(10,5,40,0.92) 0%, rgba(10,5,40,0.75) 100%)",
        borderTop: "1px solid rgba(255,215,0,0.18)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: isOnline ? "#4eff88" : "#444",
          boxShadow: isOnline
            ? "0 0 8px #4eff88, 0 0 16px rgba(78,255,136,0.4)"
            : "none",
          flexShrink: 0,
          animation: isOnline ? "onlinePulse 2s ease-in-out infinite" : "none",
        }}
      />
      <span
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "clamp(7px, 2vw, 9px)",
          color: flashing ? "#FFD700" : isOnline ? "#c8c8e8" : "#555",
          letterSpacing: "0.18em",
          transition: "color 0.15s ease",
          textShadow: flashing
            ? "0 0 12px rgba(255,215,0,0.8)"
            : isOnline
              ? "0 0 8px rgba(200,200,255,0.2)"
              : "none",
        }}
      >
        {isOnline
          ? `${count} ${count === 1 ? "player" : "players"} adventuring now`
          : "CONNECTING..."}
      </span>
    </div>
  );
}

// ─── Animated dots ─────────────────────────────────────────────────────────────

function AnimatedDots() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d >= 3 ? 1 : d + 1)), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <span aria-hidden="true" style={{ letterSpacing: "-0.02em" }}>
      {".".repeat(dots)}
    </span>
  );
}

// ─── II Auth Loading Overlay ───────────────────────────────────────────────────

function IIAuthOverlay({
  loginState,
  errorDetail,
  onCancel,
  onRetry,
  onGuest,
}: {
  loginState: IILoginState;
  errorDetail?: IILoginError;
  onCancel: () => void;
  onRetry: () => void;
  onGuest?: () => void;
}) {
  const activeStates: IILoginState[] = [
    "opening-popup",
    "verifying",
    "loading-characters",
    "entering-world",
    "timeout",
    "failed",
    "cancelled",
    "authenticating",
  ];
  if (!activeStates.includes(loginState)) return null;

  const isLoading = [
    "opening-popup",
    "verifying",
    "loading-characters",
    "entering-world",
    "authenticating",
  ].includes(loginState);
  const isError = ["failed", "timeout", "cancelled"].includes(loginState);

  const getStepLabel = (): string => {
    switch (loginState) {
      case "opening-popup":
      case "authenticating":
        return "Opening Internet Identity";
      case "verifying":
        return "Verifying identity";
      case "loading-characters":
        return "Loading your characters";
      case "entering-world":
        return "Entering world";
      case "timeout":
        return "Taking too long. Try again?";
      case "failed":
        return errorDetail?.message ?? "Login failed — please try again";
      case "cancelled":
        return "Login cancelled";
      default:
        return "";
    }
  };

  const stepLabel = getStepLabel();

  return (
    <div
      data-ocid="ii-auth-overlay"
      aria-live="assertive"
      aria-label={stepLabel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(4,3,18,0.88)",
        backdropFilter: "blur(4px)",
        padding: "24px 24px 60px",
      }}
    >
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <h1
          style={{
            fontFamily: '"Press Start 2P", "VT323", monospace',
            fontSize: "clamp(1.4rem, 5vw, 2.2rem)",
            color: "#FFD700",
            margin: "0 0 8px",
            lineHeight: 1.2,
            letterSpacing: "0.06em",
            textShadow:
              "0 0 18px rgba(255,215,0,0.6), 0 0 40px rgba(255,140,0,0.3)",
          }}
        >
          PIXEL QUEST
        </h1>
        <p
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "clamp(0.45rem, 1.4vw, 0.6rem)",
            color: "rgba(255,200,80,0.6)",
            letterSpacing: "0.3em",
            margin: 0,
          }}
        >
          A Blockchain RPG Adventure
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          maxWidth: 340,
          width: "100%",
        }}
      >
        {isLoading && (
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              border: "3px solid rgba(255,215,0,0.18)",
              borderTopColor: "#FFD700",
              borderRadius: "50%",
              animation: "ii-spin 0.8s linear infinite",
            }}
          />
        )}
        {loginState === "failed" && (
          <span style={{ fontSize: 28 }} aria-hidden="true">
            ⚠
          </span>
        )}
        {loginState === "cancelled" && (
          <span style={{ fontSize: 28 }} aria-hidden="true">
            ✕
          </span>
        )}
        {loginState === "timeout" && (
          <span style={{ fontSize: 28 }} aria-hidden="true">
            ⏳
          </span>
        )}

        <p
          style={{
            fontFamily: "monospace",
            fontSize: "clamp(0.75rem, 3vw, 0.9rem)",
            color: isError ? "#FF8080" : "#e8e8e8",
            margin: 0,
            textAlign: "center",
            letterSpacing: "0.03em",
            lineHeight: 1.5,
          }}
        >
          {stepLabel}
          {isLoading && <AnimatedDots />}
        </p>

        {isError && errorDetail?.code && (
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: "rgba(255,100,100,0.5)",
              margin: 0,
              letterSpacing: "0.05em",
            }}
          >
            Error: {errorDetail.code}
          </p>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: "100%",
            marginTop: 4,
          }}
        >
          {isLoading && (
            <button
              type="button"
              data-ocid="ii-cancel-btn"
              onClick={onCancel}
              style={{
                padding: "12px 20px",
                minHeight: 48,
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: "#aaa",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 8,
                cursor: "pointer",
                letterSpacing: "0.12em",
                transition: "all 0.15s ease",
                width: "100%",
              }}
            >
              Cancel
            </button>
          )}
          {isError && (
            <button
              type="button"
              data-ocid="ii-retry-btn"
              onClick={onRetry}
              style={{
                padding: "12px 20px",
                minHeight: 48,
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: "#FFD700",
                background: "rgba(255,215,0,0.10)",
                border: "1.5px solid rgba(255,215,0,0.45)",
                borderRadius: 8,
                cursor: "pointer",
                letterSpacing: "0.12em",
                transition: "all 0.15s ease",
                width: "100%",
              }}
            >
              🛡 Retry
            </button>
          )}
          {(loginState === "failed" || loginState === "timeout") && onGuest && (
            <button
              type="button"
              data-ocid="ii-fallback-guest-btn"
              onClick={onGuest}
              style={{
                padding: "12px 20px",
                minHeight: 48,
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: "#888",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                cursor: "pointer",
                letterSpacing: "0.1em",
                transition: "all 0.15s ease",
                width: "100%",
              }}
            >
              👤 Play as Guest instead
            </button>
          )}
          {loginState === "cancelled" && (
            <button
              type="button"
              data-ocid="ii-return-btn"
              onClick={onCancel}
              style={{
                padding: "12px 20px",
                minHeight: 48,
                fontFamily: '"Press Start 2P", monospace',
                fontSize: 9,
                color: "#aaa",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                cursor: "pointer",
                letterSpacing: "0.1em",
                transition: "all 0.15s ease",
                width: "100%",
              }}
            >
              ← Back to Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New-player form (username + class, shown after II auth) ───────────────────

function NewPlayerForm({
  onLogin,
  onCheckNickname,
}: {
  onLogin: (username: string, cls: CharacterClass) => void;
  onCheckNickname?: (name: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [selectedClass, setSelectedClass] = useState<CharacterClass>("warrior");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a username to continue.");
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      setError("Username must be 2–20 characters.");
      return;
    }
    if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
      setError("Only letters, numbers and underscores allowed.");
      return;
    }
    if (/^guest/i.test(trimmed)) {
      setError("That name is reserved. Choose another.");
      return;
    }

    if (onCheckNickname) {
      setIsChecking(true);
      setError("");
      try {
        const available = await onCheckNickname(trimmed);
        if (!available) {
          setError("Name already taken, choose another.");
          setIsChecking(false);
          return;
        }
      } catch {
        /* fail-open */
      } finally {
        setIsChecking(false);
      }
    }

    saveSession(trimmed, selectedClass);
    onLogin(trimmed, selectedClass);
  }

  return (
    <div
      data-ocid="login-panel"
      style={{
        width: "100%",
        maxWidth: 420,
        background: "rgba(0,0,0,0.82)",
        border: "1px solid rgba(255,215,0,0.28)",
        borderRadius: 14,
        padding: "28px 24px",
        backdropFilter: "blur(16px)",
        boxShadow: "0 0 30px rgba(255,215,0,0.18), 0 20px 60px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <span style={{ color: "#FFD700", fontSize: 11 }}>✔</span>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: "#FFD700",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Identity Verified — Create Your Character
        </p>
      </div>
      <div
        style={{
          height: 1,
          background: "rgba(255,215,0,0.15)",
          marginBottom: 16,
        }}
      />
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div>
          <label
            htmlFor="username-field"
            style={{
              display: "block",
              fontFamily: "monospace",
              fontSize: 9,
              color: "#888",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Choose Username
          </label>
          <input
            id="username-field"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="HERO_NAME"
            maxLength={20}
            ref={(el) => {
              if (el) el.focus();
            }}
            autoComplete="off"
            spellCheck={false}
            data-ocid="username-input"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,215,0,0.3)",
              borderRadius: 6,
              padding: "10px 12px",
              fontFamily: "monospace",
              fontSize: 13,
              color: "#fff",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
          />
          {error && (
            <p
              role="alert"
              data-ocid="username-error"
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: "#ff5555",
                marginTop: 6,
              }}
            >
              ⚠ {error}
            </p>
          )}
        </div>
        <div>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              color: "#888",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Select Class
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            {CLASS_INFO.map((info) => (
              <ClassCard
                key={info.cls}
                info={info}
                selected={selectedClass === info.cls}
                onSelect={() => setSelectedClass(info.cls)}
              />
            ))}
          </div>
        </div>
        <button
          type="submit"
          data-ocid="login-submit"
          disabled={isChecking}
          style={{
            width: "100%",
            padding: "14px 24px",
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 10,
            color: "#fff",
            background: "rgba(255,215,0,0.14)",
            border: "2px solid #FFD700",
            borderRadius: 8,
            cursor: isChecking ? "not-allowed" : "pointer",
            boxShadow: "0 0 18px rgba(255,215,0,0.32)",
            opacity: isChecking ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "all 0.18s ease",
            minHeight: 52,
          }}
        >
          {isChecking ? "⏳ CHECKING…" : "▶ ENTER WORLD"}
        </button>
      </form>
    </div>
  );
}

// ─── LoginScreen ───────────────────────────────────────────────────────────────

interface LoginScreenProps {
  onLogin: (username: string, cls: CharacterClass) => void;
  isAuthenticated: boolean;
  onRequestLogin: () => void;
  onPlayAsGuest?: () => void;
  onCheckNickname?: (name: string) => Promise<boolean>;
  iiLoginState?: IILoginState;
  iiLoginError?: IILoginError;
  onCancelLogin?: () => void;
  onLeaderboard?: () => void;
}

export function LoginScreen({
  onLogin,
  isAuthenticated,
  onRequestLogin,
  onPlayAsGuest,
  onCheckNickname,
  iiLoginState = "idle",
  iiLoginError,
  onCancelLogin,
  onLeaderboard,
}: LoginScreenProps) {
  const storedName = getStoredUsername();
  const storedClass = getStoredClass();
  const isReturningPlayer = isAuthenticated && !!storedName;

  const isAuthBusy =
    iiLoginState === "authenticating" ||
    iiLoginState === "opening-popup" ||
    iiLoginState === "verifying" ||
    iiLoginState === "loading-characters" ||
    iiLoginState === "entering-world" ||
    iiLoginState === "timeout";

  const overlayActive = iiLoginState !== "idle" && iiLoginState !== "success";

  // Show the new-player form if authenticated but no stored name
  const showNewPlayerForm = isAuthenticated && !isReturningPlayer;

  // Ambient login music
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initAudio();
        if (!cancelled) playLoginMusic();
      } catch {
        /* fail silently */
      }
    })();
    return () => {
      cancelled = true;
      try {
        stopLoginMusic();
      } catch {
        /* fail silently */
      }
    };
  }, []);

  function handleReturningEnter() {
    saveSession(storedName!, storedClass);
    onLogin(storedName!, storedClass);
  }

  function handlePressIIButton() {
    if (isAuthBusy) {
      // Act as cancel while loading
      if (onCancelLogin) onCancelLogin();
      return;
    }
    onRequestLogin();
  }

  function handleCancel() {
    if (onCancelLogin) onCancelLogin();
  }

  function handleRetry() {
    onRequestLogin();
  }

  // If authenticated and has a name — returning player screen (centered panel)
  if (isReturningPlayer) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
          @keyframes bgCycle { 0% { background: #050514; } 33% { background: #12043a; } 66% { background: #070520; } 100% { background: #050514; } }
          @keyframes titlePulse {
            0%   { text-shadow: 0 0 6px #FFD700, 0 0 14px #FF8C00, 0 0 28px rgba(255,140,0,0.2); filter: brightness(0.95); }
            50%  { text-shadow: 0 0 32px #FFD700, 0 0 64px #FF9000, 0 0 110px rgba(255,215,0,0.65), 0 0 160px rgba(255,150,0,0.35); filter: brightness(1.18); }
            100% { text-shadow: 0 0 6px #FFD700, 0 0 14px #FF8C00, 0 0 28px rgba(255,140,0,0.2); filter: brightness(0.95); }
          }
          @keyframes ii-spin { to { transform: rotate(360deg); } }
          @keyframes onlinePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.85); } }
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
          .logo-scanlines { position: relative; }
          .logo-scanlines::after {
            content: '';
            position: absolute;
            inset: 0;
            background: repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0,0,0,0.10) 2px,
              rgba(0,0,0,0.10) 3px
            );
            pointer-events: none;
            border-radius: 4px;
          }
        `}</style>
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            animation: "bgCycle 30s ease-in-out infinite",
            background: "#050514",
          }}
          aria-hidden="true"
        />
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 8,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.65) 100%)",
          }}
        />
        <AuroraCanvas />
        <StarCanvas />
        <CitySilhouette />
        <ParticleCanvas />
        <LightRayCanvas />
        <PlayersOnlineBar />
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 16px 72px",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              animation: "fadeInUp 0.5s ease forwards",
              width: "100%",
              maxWidth: 420,
            }}
          >
            <div
              style={{
                background: "rgba(0,0,0,0.82)",
                border: "1px solid rgba(255,215,0,0.28)",
                borderRadius: 14,
                padding: "28px 24px",
                backdropFilter: "blur(16px)",
                boxShadow:
                  "0 0 30px rgba(255,215,0,0.18), 0 20px 60px rgba(0,0,0,0.7)",
                textAlign: "center",
              }}
              data-ocid="returning-player-panel"
            >
              <h1
                className="login-title"
                style={{
                  fontFamily: '"Press Start 2P", "VT323", monospace',
                  fontSize: "clamp(1.4rem, 5vw, 2rem)",
                  color: "#FFD700",
                  margin: "0 0 6px",
                  animation: "titlePulse 2.8s ease-in-out infinite",
                }}
              >
                PIXEL QUEST
              </h1>
              <p
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "clamp(0.45rem, 1.4vw, 0.6rem)",
                  color: "rgba(255,200,80,0.7)",
                  letterSpacing: "0.28em",
                  margin: "0 0 24px",
                }}
              >
                A Blockchain RPG Adventure
              </p>
              <div
                style={{
                  background: "rgba(255,215,0,0.06)",
                  border: "1px solid rgba(255,215,0,0.2)",
                  borderRadius: 8,
                  padding: "16px 20px",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 28 }}>
                  {storedClass === "mage" ? "✦" : "⚔"}
                </span>
                <div style={{ textAlign: "left" }}>
                  <p
                    data-ocid="returning-player-name"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: 11,
                      color: "#FFD700",
                      margin: "0 0 4px",
                    }}
                  >
                    {storedName}
                  </p>
                  <p
                    style={{
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: storedClass === "mage" ? "#b06fff" : "#ff9940",
                      margin: 0,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                    }}
                  >
                    {storedClass}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReturningEnter}
                data-ocid="returning-enter-btn"
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  marginBottom: 10,
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 11,
                  color: "#fff",
                  background: "rgba(255,215,0,0.14)",
                  border: "2px solid #FFD700",
                  borderRadius: 8,
                  cursor: "pointer",
                  boxShadow: "0 0 18px rgba(255,215,0,0.32)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transition: "all 0.18s ease",
                  minHeight: 52,
                }}
              >
                <span>▶</span>
                <span>ENTER WORLD</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(USERNAME_KEY);
                  localStorage.removeItem(CLASS_KEY);
                  window.location.reload();
                }}
                data-ocid="switch-character-btn"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "#555",
                  transition: "color 0.2s",
                }}
              >
                Switch character
              </button>
            </div>
          </div>
        </div>
        {overlayActive && (
          <IIAuthOverlay
            loginState={iiLoginState}
            errorDetail={iiLoginError}
            onCancel={handleCancel}
            onRetry={handleRetry}
            onGuest={onPlayAsGuest}
          />
        )}
        <div
          aria-label="Version"
          style={{
            position: "fixed",
            bottom: 36,
            right: 12,
            zIndex: 102,
            fontFamily: "monospace",
            fontSize: 9,
            color: "rgba(255,255,255,0.2)",
            letterSpacing: "0.1em",
          }}
        >
          v1.0
        </div>
      </>
    );
  }

  // New player: show form after II auth
  if (showNewPlayerForm) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
          @keyframes bgCycle { 0% { background: #050514; } 33% { background: #12043a; } 66% { background: #070520; } 100% { background: #050514; } }
          @keyframes ii-spin { to { transform: rotate(360deg); } }
          @keyframes onlinePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.85); } }
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
          input:focus { border-color: rgba(255,215,0,0.65) !important; box-shadow: 0 0 0 2px rgba(255,215,0,0.15) !important; outline: none; }
        `}</style>
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            animation: "bgCycle 30s ease-in-out infinite",
            background: "#050514",
          }}
          aria-hidden="true"
        />
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 8,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.65) 100%)",
          }}
        />
        <AuroraCanvas />
        <StarCanvas />
        <CitySilhouette />
        <ParticleCanvas />
        <LightRayCanvas />
        <PlayersOnlineBar />
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 16px 72px",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              animation: "fadeInUp 0.4s ease forwards",
              width: "100%",
            }}
          >
            <NewPlayerForm
              onLogin={onLogin}
              onCheckNickname={onCheckNickname}
            />
          </div>
        </div>
        <div
          aria-label="Version"
          style={{
            position: "fixed",
            bottom: 36,
            right: 12,
            zIndex: 102,
            fontFamily: "monospace",
            fontSize: 9,
            color: "rgba(255,255,255,0.2)",
            letterSpacing: "0.1em",
          }}
        >
          v1.0
        </div>
      </>
    );
  }

  // ── Default: main login screen with PLAY buttons ──────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

        @keyframes bgCycle {
          0%   { background: #050514; }
          33%  { background: #12043a; }
          66%  { background: #070520; }
          100% { background: #050514; }
        }
        @keyframes titlePulse {
          0%   { text-shadow: 0 0 6px #FFD700, 0 0 14px #FF8C00, 0 0 28px rgba(255,140,0,0.2); filter: brightness(0.95); }
          50%  { text-shadow: 0 0 32px #FFD700, 0 0 64px #FF9000, 0 0 110px rgba(255,215,0,0.65), 0 0 160px rgba(255,150,0,0.35); filter: brightness(1.18); }
          100% { text-shadow: 0 0 6px #FFD700, 0 0 14px #FF8C00, 0 0 28px rgba(255,140,0,0.2); filter: brightness(0.95); }
        }
        @keyframes subtitleFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ii-spin { to { transform: rotate(360deg); } }
        @keyframes onlinePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.85); } }
        @keyframes logoFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes btnFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(14px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes playBtnPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(34,197,94,0.5), 0 4px 24px rgba(0,0,0,0.5); }
          50%       { box-shadow: 0 0 36px rgba(34,197,94,0.75), 0 6px 30px rgba(0,0,0,0.5); }
        }
        .play-identity-btn {
          animation: playBtnPulse 2.4s ease-in-out infinite;
          transition: filter 0.15s ease, transform 0.15s ease;
        }
        .play-identity-btn:hover:not(:disabled) {
          filter: brightness(1.12);
          transform: translateX(-50%) scale(1.03) !important;
        }
        .play-identity-btn:active:not(:disabled) {
          transform: translateX(-50%) scale(0.97) !important;
          animation: none;
          box-shadow: 0 0 14px rgba(34,197,94,0.4) !important;
        }
        .play-guest-btn {
          transition: all 0.15s ease;
        }
        .play-guest-btn:hover {
          border-color: rgba(180,180,220,0.7) !important;
          background: rgba(120,100,200,0.18) !important;
          transform: translateX(-50%) scale(1.02) !important;
        }
        .play-guest-btn:active {
          transform: translateX(-50%) scale(0.97) !important;
          background: linear-gradient(135deg, rgba(100,80,200,0.55) 0%, rgba(80,60,170,0.42) 100%) !important;
          box-shadow: 0 0 24px rgba(140,120,255,0.6), inset 0 0 12px rgba(180,160,255,0.2) !important;
          border-color: rgba(180,160,255,0.8) !important;
        }
        .logo-scanlines { position: relative; }
        .logo-scanlines::after {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.10) 2px,
            rgba(0,0,0,0.10) 3px
          );
          pointer-events: none;
          border-radius: 4px;
        }
        .leaderboard-corner-btn { transition: all 0.18s ease; }
        .leaderboard-corner-btn:hover { background: rgba(255,215,0,0.18) !important; border-color: rgba(255,215,0,0.6) !important; transform: scale(1.08); }
        .leaderboard-corner-btn:active { transform: scale(0.94); }
        input:focus { border-color: rgba(255,215,0,0.65) !important; box-shadow: 0 0 0 2px rgba(255,215,0,0.15) !important; outline: none; }
      `}</style>

      {/* Full-screen animated background — pointer-events: none on ALL decorative layers */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          animation: "bgCycle 30s ease-in-out infinite",
          background: "#050514",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      <AuroraCanvas />
      <StarCanvas />
      <CitySilhouette />
      <ParticleCanvas />
      <LightRayCanvas />

      {/* Version number */}
      <div
        aria-label="Version"
        style={{
          position: "fixed",
          bottom: 36,
          right: 12,
          zIndex: 102,
          fontFamily: "monospace",
          fontSize: 9,
          color: "rgba(255,255,255,0.2)",
          letterSpacing: "0.1em",
          pointerEvents: "none",
        }}
      >
        v1.0
      </div>

      {/* Players online — fixed bottom, above everything */}
      <PlayersOnlineBar />

      {/* ── LOGO — absolute positioned, z-index 100, top 30% ── */}
      <div
        data-ocid="login-screen"
        style={{
          position: "fixed",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          textAlign: "center",
          animation: "logoFadeIn 0.6s cubic-bezier(0.22,1,0.36,1) forwards",
          pointerEvents: "none",
          width: "min(90vw, 420px)",
        }}
      >
        {/* Glow halo behind title */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-16px -24px",
            background:
              "radial-gradient(ellipse at 50% 60%, rgba(255,180,0,0.2) 0%, transparent 70%)",
            filter: "blur(16px)",
            pointerEvents: "none",
          }}
        />
        {/* Sword + Title + Staff row */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3em",
            marginBottom: 10,
            position: "relative",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontSize: "clamp(1rem, 4vw, 1.6rem)",
              opacity: 0.9,
              filter: "drop-shadow(0 0 8px rgba(255,215,0,0.7))",
              userSelect: "none",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ⚔
          </span>
          <h1
            className="logo-scanlines"
            style={{
              fontFamily: '"Press Start 2P", "VT323", monospace',
              fontSize: "clamp(1.8rem, 7vw, 3.2rem)",
              color: "#FFD700",
              margin: 0,
              lineHeight: 1.2,
              letterSpacing: "0.06em",
              position: "relative",
              animation: "titlePulse 2s ease-in-out infinite",
            }}
          >
            PIXEL QUEST
          </h1>
          <span
            aria-hidden="true"
            style={{
              fontSize: "clamp(1rem, 4vw, 1.6rem)",
              opacity: 0.9,
              filter: "drop-shadow(0 0 8px rgba(160,100,255,0.7))",
              userSelect: "none",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ✦
          </span>
        </div>
        <p
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "clamp(0.5rem, 1.8vw, 0.7rem)",
            color: "rgba(255,210,90,0.88)",
            letterSpacing: "0.28em",
            margin: 0,
            textTransform: "uppercase",
            position: "relative",
            animation: "subtitleFade 1.2s ease forwards",
            animationDelay: "0.8s",
            opacity: 0,
          }}
        >
          A Blockchain RPG Adventure
        </p>
      </div>

      {/* ── PRIMARY BUTTON: PLAY WITH IDENTITY — absolute top 52%, z-index 100 ── */}
      <button
        type="button"
        className="play-identity-btn"
        data-ocid="ii-login-btn"
        aria-busy={isAuthBusy}
        aria-label={
          isAuthBusy
            ? "Connecting to Internet Identity..."
            : "Play with Internet Identity"
        }
        onClick={handlePressIIButton}
        style={{
          position: "fixed",
          top: "52%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          width: "min(90vw, 320px)",
          minHeight: 56,
          padding: "0 24px",
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "clamp(0.65rem, 2.5vw, 0.85rem)",
          fontWeight: "bold",
          color: "#fff",
          background: isAuthBusy
            ? "linear-gradient(135deg, #16a34a 0%, #15803d 100%)"
            : "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
          border: "2px solid rgba(255,215,0,0.6)",
          borderRadius: 12,
          cursor: isAuthBusy ? "pointer" : "pointer",
          letterSpacing: "0.08em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          animation: isAuthBusy
            ? "none"
            : "btnFadeIn 0.6s cubic-bezier(0.22,1,0.36,1) 0.5s both, playBtnPulse 2.4s ease-in-out 1.1s infinite",
          opacity: 1,
        }}
      >
        {isAuthBusy ? (
          <>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 16,
                height: 16,
                border: "2.5px solid rgba(255,255,255,0.3)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                animation: "ii-spin 0.7s linear infinite",
                flexShrink: 0,
              }}
            />
            <span>CONNECTING...</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 18 }} aria-hidden="true">
              🛡
            </span>
            <span>PLAY WITH IDENTITY</span>
          </>
        )}
      </button>

      {/* Loading state status text — shown below primary button */}
      {isAuthBusy && (
        <div
          style={{
            position: "fixed",
            top: "calc(52% + 66px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            textAlign: "center",
            pointerEvents: "none",
            width: "min(90vw, 320px)",
          }}
        >
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "clamp(0.65rem, 2.5vw, 0.75rem)",
              color: "rgba(200,230,200,0.8)",
              margin: 0,
              letterSpacing: "0.05em",
            }}
          >
            {iiLoginState === "opening-popup" ||
            iiLoginState === "authenticating"
              ? "Opening Internet Identity"
              : iiLoginState === "verifying"
                ? "Verifying identity"
                : iiLoginState === "loading-characters"
                  ? "Loading your characters"
                  : iiLoginState === "entering-world"
                    ? "Entering world"
                    : "Connecting"}
            <AnimatedDots />
          </p>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              color: "rgba(150,150,170,0.6)",
              marginTop: 4,
              letterSpacing: "0.05em",
            }}
          >
            Tap button to cancel
          </p>
        </div>
      )}

      {/* ── LEADERBOARD BUTTON — bottom-left corner ── */}
      {onLeaderboard && (
        <button
          type="button"
          className="leaderboard-corner-btn"
          data-ocid="leaderboard-btn"
          onClick={onLeaderboard}
          aria-label="View leaderboard"
          style={{
            position: "fixed",
            bottom: 36,
            left: 12,
            zIndex: 102,
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 9,
            color: "rgba(255,215,0,0.65)",
            background: "rgba(255,215,0,0.06)",
            border: "1px solid rgba(255,215,0,0.25)",
            borderRadius: 6,
            padding: "5px 10px",
            cursor: "pointer",
            letterSpacing: "0.08em",
          }}
        >
          🏆 Leaderboard
        </button>
      )}

      {/* ── SECONDARY BUTTON: PLAY AS GUEST — absolute top 66%, z-index 100 ── */}
      {onPlayAsGuest && (
        <div
          style={{
            position: "fixed",
            top: "66%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            width: "min(90vw, 280px)",
            animation: "btnFadeIn 0.6s cubic-bezier(0.22,1,0.36,1) 0.75s both",
          }}
        >
          <button
            type="button"
            className="play-guest-btn"
            data-ocid="play-as-guest-btn"
            onClick={onPlayAsGuest}
            style={{
              width: "100%",
              minHeight: 48,
              padding: "0 20px",
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "clamp(0.55rem, 2vw, 0.7rem)",
              color: "#c8c0e8",
              background:
                "linear-gradient(135deg, rgba(80,60,160,0.22) 0%, rgba(60,40,120,0.14) 100%)",
              border: "1.5px solid rgba(140,120,220,0.45)",
              borderRadius: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow:
                "0 2px 16px rgba(80,60,160,0.25), inset 0 1px 0 rgba(255,255,255,0.06)",
              letterSpacing: "0.1em",
              transform: "translateX(-50%)",
              left: "50%",
              position: "relative",
            }}
          >
            <span style={{ fontSize: 14 }} aria-hidden="true">
              👤
            </span>
            <span>PLAY AS GUEST</span>
          </button>
          <p
            style={{
              textAlign: "center",
              fontFamily: "monospace",
              fontSize: 9,
              color: "rgba(100,90,140,0.7)",
              marginTop: 7,
              letterSpacing: "0.05em",
              pointerEvents: "none",
            }}
          >
            Explore only — no saving, no combat
          </p>
        </div>
      )}

      {/* ── II Auth Overlay (z-index 200, above everything including buttons) ── */}
      {overlayActive && (
        <IIAuthOverlay
          loginState={iiLoginState}
          errorDetail={iiLoginError}
          onCancel={handleCancel}
          onRetry={handleRetry}
          onGuest={onPlayAsGuest}
        />
      )}
    </>
  );
}
