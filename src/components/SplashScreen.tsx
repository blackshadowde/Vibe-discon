import React, { useEffect, useRef, useState } from 'react';

interface SplashScreenProps {
  onDone: () => void;
}

interface Star {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  size: number;
  delay: number;
  angle: number;
}

const LOGO_ASPECT = 1.229; // width / height of vibe-logo.png
const V_POINTS: [number, number][] = [
  [0.193, 0.01],
  [0.114, 0.035],
  [0.047, 0.098],
  [0.013, 0.185],
  [0.016, 0.287],
  [0.051, 0.376],
  [0.088, 0.465],
  [0.125, 0.552],
  [0.162, 0.64],
  [0.199, 0.729],
  [0.228, 0.822],
  [0.211, 0.92],
  [0.248, 0.986],
  [0.319, 0.939],
  [0.391, 0.897],
  [0.478, 0.895],
  [0.565, 0.893],
  [0.647, 0.879],
  [0.716, 0.825],
  [0.764, 0.741],
  [0.805, 0.657],
  [0.848, 0.57],
  [0.889, 0.484],
  [0.93, 0.4],
  [0.972, 0.313],
  [0.989, 0.217],
  [0.966, 0.121],
  [0.902, 0.059],
  [0.819, 0.049],
  [0.743, 0.08],
  [0.68, 0.149],
  [0.634, 0.233],
  [0.59, 0.316],
  [0.546, 0.402],
  [0.501, 0.428],
  [0.464, 0.339],
  [0.427, 0.252],
  [0.39, 0.164],
  [0.343, 0.08],
  [0.275, 0.028],
];

const V_SPARKLES: [number, number][] = [
  [0.193, 0.01],
  [0.862, 0.047],
];

const logoImg = new Image();
logoImg.src = '/vibe-logo.png';

export const SplashScreen: React.FC<SplashScreenProps> = ({ onDone }) => {
  const [mounted, setMounted] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const startTime = performance.now();
    let doneCalled = false;

    // Handle resize & DPR scaling
    const updateSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const cx = width / 2;
    const cy = height / 2;
    const S = Math.min(width, height);

    const logoW = 0.56 * S;
    const logoH = logoW / LOGO_ASPECT;
    const lx = cx - logoW / 2;
    const ly = cy - logoH / 2;
    const mapPoint = (u: number, v: number) => ({ x: lx + u * logoW, y: ly + v * logoH });

    const targetPoints = V_POINTS.map(([u, v]) => mapPoint(u, v));
    const numStars = targetPoints.length;

    let totalLength = 0;
    for (let i = 0; i < numStars; i++) {
      const pA = targetPoints[i];
      const pB = targetPoints[(i + 1) % numStars];
      totalLength += Math.hypot(pB.x - pA.x, pB.y - pA.y);
    }

    const sparkleP1 = mapPoint(V_SPARKLES[1][0], V_SPARKLES[1][1]);
    const sparkleP2 = mapPoint(V_SPARKLES[0][0], V_SPARKLES[0][1]);

    const stars: Star[] = [];

    for (let i = 0; i < numStars; i++) {
      const targetX = targetPoints[i].x;
      const targetY = targetPoints[i].y;

      const angle = Math.random() * 2 * Math.PI;
      const radius = 0.35 * S * Math.sqrt(Math.random());
      const startX = cx + radius * Math.cos(angle);
      const startY = cy + radius * Math.sin(angle);

      const size = 1.2 + Math.random() * 1.8;
      const delay = Math.random() * 0.15;

      stars.push({ startX, startY, targetX, targetY, size, delay, angle });
    }

    // Fallback if prefers-reduced-motion is on:
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      // 1. Background
      ctx.fillStyle = '#1e1f22';
      ctx.fillRect(0, 0, width, height);

      // Radial glow
      const glowRadius = 0.7 * S;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      gradient.addColorStop(0, 'rgba(88,101,242,0.14)');
      gradient.addColorStop(1, 'rgba(88,101,242,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, 2 * Math.PI);
      ctx.fill();

      // Logo
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(139,108,255,0.55)';
        ctx.shadowBlur = 28;
        ctx.drawImage(logoImg, lx, ly, logoW, logoH);
        ctx.restore();
      }

      // Connecting lines
      ctx.save();
      ctx.strokeStyle = '#8b6cff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#8b6cff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(targetPoints[0].x, targetPoints[0].y);
      for (let i = 1; i < targetPoints.length; i++) {
        ctx.lineTo(targetPoints[i].x, targetPoints[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Stars
      ctx.save();
      ctx.fillStyle = '#dfe5ff';
      ctx.shadowColor = '#5865f2';
      ctx.shadowBlur = 8;
      for (const star of stars) {
        ctx.beginPath();
        ctx.arc(star.targetX, star.targetY, star.size, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();

      const timer1 = setTimeout(() => {
        if (canvas) {
          canvas.style.transition = 'opacity 300ms ease';
          canvas.style.opacity = '0';
        }
        const timer2 = setTimeout(() => {
          onDoneRef.current();
          setMounted(false);
        }, 300);
        return () => clearTimeout(timer2);
      }, 500);

      return () => {
        clearTimeout(timer1);
        window.removeEventListener('resize', updateSize);
      };
    }

    const easeOutCubic = (x: number): number => {
      return 1 - Math.pow(1 - x, 3);
    };

    const easeInCubic = (x: number): number => {
      return x * x * x;
    };

    const easeOutBack = (x: number): number => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    };

    const drawSparkle = (
      x: number,
      y: number,
      scale: number,
      baseRadius: number
    ) => {
      if (scale <= 0) return;
      const r = baseRadius * scale;

      ctx.save();
      const glowRadius = r * 2.4;
      const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      glowGrad.addColorStop(0, 'rgba(139,108,255,0.55)');
      glowGrad.addColorStop(1, 'rgba(139,108,255,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const buzz = (pattern: VibratePattern) => {
      if (localStorage.getItem('haptic_enabled') === 'false') return;
      if (typeof navigator.vibrate !== 'function') return;
      try {
        navigator.vibrate(pattern);
      } catch (err) {
        // Ignore haptic errors
      }
    };

    const pulse = (x: number, d: number) => {
      if (x < 0 || x > d) return 0;
      return Math.pow(Math.sin((Math.PI * x) / d), 2);
    };

    const burstParticles: {
      angle: number;
      speed: number;
      size: number;
      color: string;
      life: number;
    }[] = [];

    const firedHaptics = {
      t025: false,
      t07: false,
      t10: false,
      t115: false,
      t16: false,
      t195: false,
      t225: false,
    };

    const render = (now: number) => {
      const t = (now - startTime) / 1000;

      // Stop loop, call onDone, and unmount at t >= 3.0 s
      if (t >= 3.0) {
        if (!doneCalled) {
          doneCalled = true;
          cancelAnimationFrame(animationFrameId);
          onDoneRef.current();
          setMounted(false);
        }
        return;
      }

      // Haptic triggers
      if (t >= 0.25 && !firedHaptics.t025) {
        buzz(6);
        firedHaptics.t025 = true;
      }
      if (t >= 0.7 && !firedHaptics.t07) {
        buzz([5, 40, 5, 40, 5]);
        firedHaptics.t07 = true;
      }
      if (t >= 1.0 && !firedHaptics.t10) {
        buzz(18);
        firedHaptics.t10 = true;
      }
      if (t >= 1.15 && !firedHaptics.t115) {
        buzz(18);
        firedHaptics.t115 = true;
      }
      if (t >= 1.6 && !firedHaptics.t16) {
        buzz([14, 70, 14]);
        firedHaptics.t16 = true;
      }
      if (t >= 1.95 && !firedHaptics.t195) {
        buzz([14, 70, 14]);
        firedHaptics.t195 = true;
      }
      if (t >= 2.25 && !firedHaptics.t225) {
        buzz(40);
        firedHaptics.t225 = true;
        // Spawn 60 burst particles at the center
        for (let i = 0; i < 60; i++) {
          burstParticles.push({
            angle: Math.random() * Math.PI * 2,
            speed: (0.6 + Math.random()) * S,
            size: 1 + Math.random() * 1.5,
            color: ['#ffffff', '#8ea1ff', '#5865f2'][Math.floor(Math.random() * 3)],
            life: 0.7,
          });
        }
      }

      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      // 1. Background
      ctx.fillStyle = '#1e1f22';
      ctx.fillRect(0, 0, w, h);

      // Soft radial gradient glow in center
      const glowRadius = 0.7 * S;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      gradient.addColorStop(0, 'rgba(88,101,242,0.14)');
      gradient.addColorStop(1, 'rgba(88,101,242,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, 2 * Math.PI);
      ctx.fill();

      // Logo drawing (after background glow, before stars, only while t < 1.6)
      if (t < 1.6 && logoImg.complete && logoImg.naturalWidth > 0) {
        let logoAlpha = 0;
        let logoScale = 0.94;

        if (t >= 0.95 && t < 1.25) {
          const p = easeOutCubic((t - 0.95) / 0.3);
          logoAlpha = p;
          logoScale = 0.94 + 0.06 * p;
        } else if (t >= 1.25 && t < 1.35) {
          logoAlpha = 1;
          logoScale = 1;
        } else if (t >= 1.35 && t < 1.6) {
          const p = easeInCubic((t - 1.35) / 0.25);
          logoAlpha = 1 - p;
          logoScale = 1 - 0.94 * p; // scale goes from 1 down to 0.06
        }

        if (logoAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = logoAlpha;
          ctx.shadowColor = 'rgba(139,108,255,0.55)';
          ctx.shadowBlur = 28 * logoAlpha;
          const lw = logoW * logoScale;
          const lh = logoH * logoScale;
          ctx.drawImage(logoImg, cx - lw / 2, cy - lh / 2, lw, lh);
          ctx.restore();
        }
      }

      // Radius and Ring logic
      let currentRadius = 0;
      let strokeWidth = 2;
      let glowAlpha = 0;
      let fillAlpha = 0;
      const maxExplosionRadius = Math.hypot(w, h) / 2 + 20;

      if (t >= 1.35 && t < 1.6) {
        // Initial collapse to small circle
        const p = (t - 1.35) / 0.25;
        currentRadius = 0.06 * S * p;
      } else if (t >= 1.6 && t < 2.25) {
        // HEARTBEAT phase (lub-dub)
        const p1 = pulse(t - 1.6, 0.3);
        const p2 = pulse(t - 1.95, 0.3);
        currentRadius = 0.06 * S * (1 + 0.35 * p1 + 0.25 * p2);
        strokeWidth = 2 + (p1 + p2);
        glowAlpha = (p1 + p2) * 0.5;
        fillAlpha = (p1 + p2) * 0.25;
      } else if (t >= 2.25) {
        // EXPLOSION phase (progress cubed)
        const p = Math.min(1, (t - 2.25) / 0.7);
        const cubedP = Math.pow(p, 3);
        currentRadius = 0.06 * S + (maxExplosionRadius - 0.06 * S) * cubedP;
      }

      // Cut transparent hole from 2.25s
      if (t >= 2.25 && currentRadius > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw glow flash for heartbeat
      if (glowAlpha > 0) {
        const ringGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, currentRadius * 2);
        ringGlow.addColorStop(0, `rgba(88,101,242,${glowAlpha})`);
        ringGlow.addColorStop(1, 'rgba(88,101,242,0)');
        ctx.fillStyle = ringGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw ring interior fill for heartbeat peak
      if (fillAlpha > 0) {
        ctx.fillStyle = `rgba(88,101,242,${fillAlpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw the main ring stroke
      if (t >= 1.35 && currentRadius > 0) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = strokeWidth;
        ctx.shadowColor = '#5865f2';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Draw shockwave ring (1.5 px, alpha 0.5) following 0.08 s behind
      if (t >= 2.33) {
        const p = Math.min(1, (t - 2.33) / 0.7);
        const cubedP = Math.pow(p, 3);
        const swRadius = 0.06 * S + (maxExplosionRadius - 0.06 * S) * cubedP;
        if (swRadius < maxExplosionRadius) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, swRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Star positions logic
      const currentStarPositions: { x: number; y: number; alpha: number }[] = [];
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        let alpha = Math.min(1, Math.max(0, t / 0.25));
        let x = star.startX;
        let y = star.startY;

        const pStart = 0.25 + star.delay;
        const pEnd = 0.85;

        if (t >= pStart) {
          if (t >= pEnd) {
            x = star.targetX;
            y = star.targetY;
          } else {
            const rawProgress = (t - pStart) / (pEnd - pStart);
            const progress = easeOutCubic(Math.min(1, Math.max(0, rawProgress)));
            x = star.startX + (star.targetX - star.startX) * progress;
            y = star.startY + (star.targetY - star.startY) * progress;
          }
        }

        if (t >= 1.35 && t < 1.6) {
          const rawImplode = (t - 1.35) / 0.25;
          const implodeProgress = easeInCubic(Math.min(1, Math.max(0, rawImplode)));
          x = star.targetX + (cx - star.targetX) * implodeProgress;
          y = star.targetY + (cy - star.targetY) * implodeProgress;
        } else if (t >= 1.6 && t < 2.25) {
          x = cx;
          y = cy;
          alpha = 0;
        } else if (t >= 2.25) {
          const rawDrift = (t - 2.25) / 0.75;
          const driftDist = easeOutCubic(Math.min(1, Math.max(0, rawDrift))) * 0.35 * S;
          x = cx + Math.cos(star.angle) * driftDist;
          y = cy + Math.sin(star.angle) * driftDist;
          alpha = Math.max(0, 1 - (t - 2.25) / 0.45);
        }
        currentStarPositions.push({ x, y, alpha });
      }

      // Sparkle brighten lines logic
      const isPeak1 = t >= 1.08 && t <= 1.2;
      const isPeak2 = t >= 1.23 && t <= 1.35;
      const isSparkleAtPeak = isPeak1 || isPeak2;
      const lineColor = isSparkleAtPeak ? '#a894ff' : '#8b6cff';

      // Draw lines (closed path around stars)
      if (t >= 0.7 && t < 1.6) {
        const lineProgress = Math.min(1, Math.max(0, (t - 0.7) / (1.15 - 0.7)));
        const targetDist = lineProgress * totalLength;
        const lineAlpha = t >= 1.35 ? Math.max(0, 1 - (t - 1.35) / 0.25) : 1;
        ctx.save();
        ctx.globalAlpha = lineAlpha;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = isSparkleAtPeak ? 14 : 10;
        ctx.beginPath();
        let accumulatedDist = 0;
        ctx.moveTo(currentStarPositions[0].x, currentStarPositions[0].y);
        for (let i = 0; i < stars.length; i++) {
          const pA = currentStarPositions[i];
          const pB = currentStarPositions[(i + 1) % stars.length];
          const segLen = Math.hypot(pB.x - pA.x, pB.y - pA.y);
          if (accumulatedDist + segLen <= targetDist) {
            ctx.lineTo(pB.x, pB.y);
            accumulatedDist += segLen;
          } else {
            const rem = targetDist - accumulatedDist;
            if (rem > 0 && segLen > 0) {
              const ratio = rem / segLen;
              ctx.lineTo(pA.x + (pB.x - pA.x) * ratio, pA.y + (pB.y - pA.y) * ratio);
            }
            break;
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // Draw Stars
      ctx.save();
      for (let i = 0; i < stars.length; i++) {
        const sp = currentStarPositions[i];
        if (sp.alpha <= 0) continue;
        ctx.fillStyle = '#dfe5ff';
        ctx.shadowColor = '#5865f2';
        ctx.shadowBlur = 8;
        ctx.globalAlpha = sp.alpha;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, stars[i].size, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();

      // Sparkles
      let scale1 = 0;
      if (t >= 1.0) {
        if (t < 1.15) scale1 = easeOutBack((t - 1.0) / 0.15);
        else if (t < 1.4) scale1 = 1 - (1 - 0.35) * ((t - 1.15) / 0.25);
        else scale1 = 0.35;
      }
      let scale2 = 0;
      if (t >= 1.15) {
        if (t < 1.3) scale2 = easeOutBack((t - 1.15) / 0.15);
        else if (t < 1.55) scale2 = 1 - (1 - 0.35) * ((t - 1.3) / 0.25);
        else scale2 = 0.35;
      }
      const sparkleFade = t >= 1.35 ? Math.max(0, 1 - (t - 1.35) / 0.25) : 1;
      if (sparkleFade > 0) {
        ctx.save();
        ctx.globalAlpha = sparkleFade;
        if (scale1 > 0) drawSparkle(sparkleP1.x, sparkleP1.y, scale1, 0.045 * S);
        if (scale2 > 0) drawSparkle(sparkleP2.x, sparkleP2.y, scale2, 0.055 * S);
        ctx.restore();
      }

      // Draw burst particles
      if (burstParticles.length > 0) {
        ctx.save();
        const dt = t - 2.25;
        for (let i = burstParticles.length - 1; i >= 0; i--) {
          const p = burstParticles[i];
          const particleLifeProgress = dt / p.life;
          if (particleLifeProgress >= 1) {
            burstParticles.splice(i, 1);
            continue;
          }
          const alpha = 1 - particleLifeProgress;
          const currentSpeed = p.speed * (1 - particleLifeProgress);
          const dist = currentSpeed * dt;
          const px = cx + Math.cos(p.angle) * dist;
          const py = cy + Math.sin(p.angle) * dist;

          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.shadowColor = '#5865f2';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[9999] pointer-events-none"
    />
  );
};
