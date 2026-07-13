import { useCallback, useEffect, useRef, useState } from "react";
import {
  ZONE_MAP_LAYOUT,
  getZoneConnections,
  getZoneLayout,
} from "../lib/worldMap";
import type { ZoneId } from "../types/game";

// ─── WorldMapScreen ───────────────────────────────────────────────────────────
// Full-screen world map overlay. Renders zone tiles on a canvas with:
// - Discovered zones: colored tiles with name
// - Undiscovered zones: dark grey tiles with ???
// - Current zone: blinking white dot
// - Portal connections: dotted lines
// - N/S/E/W compass labels
// - Tap zone for details popup

interface WorldMapScreenProps {
  /** The zone the player is currently in */
  currentZoneId: ZoneId;
  /** Array of zone IDs the player has discovered */
  discoveredZones: string[];
  /** Close the map */
  onClose: () => void;
}

interface ZoneDetails {
  zoneId: ZoneId;
  displayName: string;
  recommendedLevel: number;
  monsterTypes: string[];
  isCurrent: boolean;
  isDiscovered: boolean;
}

const MAP_PADDING = 20;
const COMPASS_FONT = "10px 'JetBrains Mono', monospace";

export function WorldMapScreen({
  currentZoneId,
  discoveredZones,
  onClose,
}: WorldMapScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const blinkRef = useRef<boolean>(true);
  const blinkTimerRef = useRef<number>(0);
  const [selectedZone, setSelectedZone] = useState<ZoneDetails | null>(null);

  // Build a set for O(1) lookup
  const discoveredSet = new Set(discoveredZones);

  // Canvas dimensions: portrait-optimized, fills overlay
  const canvasW = Math.min(window.innerWidth - 24, 400);
  const canvasH = Math.min(window.innerHeight - 160, 580);

  const connections = getZoneConnections();

  // Convert fractional zone position to canvas px
  const toCanvasX = useCallback(
    (fx: number) => MAP_PADDING + fx * (canvasW - MAP_PADDING * 2),
    [canvasW],
  );
  const toCanvasY = useCallback(
    (fy: number) => MAP_PADDING + fy * (canvasH - MAP_PADDING * 2),
    [canvasH],
  );

  // Draw the map
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasW, canvasH);

    // Background
    ctx.fillStyle = "rgba(6, 8, 16, 0.97)";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Subtle grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= canvasW; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, canvasH);
      ctx.stroke();
    }
    for (let gy = 0; gy <= canvasH; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(canvasW, gy);
      ctx.stroke();
    }

    // Draw connections (dotted lines)
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    for (const [fromId, toId] of connections) {
      const fromLayout = getZoneLayout(fromId);
      const toLayout = getZoneLayout(toId);
      if (!fromLayout || !toLayout) continue;

      const fromX = toCanvasX(fromLayout.x + fromLayout.w / 2);
      const fromY = toCanvasY(fromLayout.y + fromLayout.h / 2);
      const toX = toCanvasX(toLayout.x + toLayout.w / 2);
      const toY = toCanvasY(toLayout.y + toLayout.h / 2);

      const fromDiscovered = discoveredSet.has(fromId);
      const toDiscovered = discoveredSet.has(toId);
      const bothDiscovered = fromDiscovered && toDiscovered;

      ctx.strokeStyle = bothDiscovered
        ? "rgba(160, 200, 255, 0.35)"
        : "rgba(120,120,120,0.18)"; // eslint-disable-line no-constant-binary-expression
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    }
    ctx.restore();

    // Draw zone tiles
    for (const zone of ZONE_MAP_LAYOUT) {
      const px = toCanvasX(zone.x);
      const py = toCanvasY(zone.y);
      const pw = zone.w * (canvasW - MAP_PADDING * 2);
      const ph = zone.h * (canvasH - MAP_PADDING * 2);
      const isDiscovered = discoveredSet.has(zone.zoneId);
      const isCurrent = zone.zoneId === currentZoneId;

      // Tile background
      if (isDiscovered) {
        ctx.fillStyle = zone.color;
      } else {
        ctx.fillStyle = "rgba(28, 30, 38, 0.9)";
      }
      ctx.strokeStyle = isCurrent
        ? "rgba(255,255,255,0.9)"
        : isDiscovered
          ? "rgba(255,255,255,0.18)"
          : "rgba(100,100,100,0.25)";
      ctx.lineWidth = isCurrent ? 2 : 1;

      // Rounded rect
      const r = 4;
      ctx.beginPath();
      ctx.moveTo(px + r, py);
      ctx.lineTo(px + pw - r, py);
      ctx.arcTo(px + pw, py, px + pw, py + r, r);
      ctx.lineTo(px + pw, py + ph - r);
      ctx.arcTo(px + pw, py + ph, px + pw - r, py + ph, r);
      ctx.lineTo(px + r, py + ph);
      ctx.arcTo(px, py + ph, px, py + ph - r, r);
      ctx.lineTo(px, py + r);
      ctx.arcTo(px, py, px + r, py, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Zone label
      ctx.save();
      ctx.font = `bold ${Math.max(8, Math.min(10, Math.round(pw / 9)))}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (isDiscovered) {
        ctx.fillStyle = zone.textColor;
        // Clip to tile bounds
        ctx.beginPath();
        ctx.rect(px + 2, py + 2, pw - 4, ph - 4);
        ctx.clip();
        const label =
          zone.displayName.length > 12
            ? `${zone.displayName.substring(0, 11)}…`
            : zone.displayName;
        ctx.fillText(label, px + pw / 2, py + ph / 2);
      } else {
        ctx.fillStyle = "rgba(120,120,120,0.6)";
        ctx.fillText("???", px + pw / 2, py + ph / 2);
      }
      ctx.restore();

      // Blinking player dot on current zone
      if (isCurrent && blinkRef.current) {
        const dotX = px + pw - 7;
        const dotY = py + 7;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Compass labels
    ctx.font = COMPASS_FONT;
    ctx.fillStyle = "rgba(180,200,220,0.5)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("N", canvasW / 2, 4);
    ctx.textBaseline = "bottom";
    ctx.fillText("S", canvasW / 2, canvasH - 4);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("W", 4, canvasH / 2);
    ctx.textAlign = "right";
    ctx.fillText("E", canvasW - 4, canvasH / 2);
  }, [
    canvasW,
    canvasH,
    connections,
    currentZoneId,
    discoveredSet,
    toCanvasX,
    toCanvasY,
  ]);

  // Blink timer — toggle dot every 600ms
  useEffect(() => {
    blinkTimerRef.current = window.setInterval(() => {
      blinkRef.current = !blinkRef.current;
    }, 600);
    return () => clearInterval(blinkTimerRef.current);
  }, []);

  // Animation loop
  useEffect(() => {
    const loop = () => {
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [onClose]);

  // Handle tap on canvas to detect which zone was tapped
  const handleCanvasTap = useCallback(
    (
      e:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>,
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      let clientX: number;
      let clientY: number;
      if ("touches" in e) {
        const touch = e.touches[0] ?? e.changedTouches[0];
        if (!touch) return;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const tapX = clientX - rect.left;
      const tapY = clientY - rect.top;

      // Test each zone
      for (const zone of ZONE_MAP_LAYOUT) {
        const px = toCanvasX(zone.x);
        const py = toCanvasY(zone.y);
        const pw = zone.w * (canvasW - MAP_PADDING * 2);
        const ph = zone.h * (canvasH - MAP_PADDING * 2);

        if (tapX >= px && tapX <= px + pw && tapY >= py && tapY <= py + ph) {
          const isDiscovered = discoveredSet.has(zone.zoneId);
          setSelectedZone({
            zoneId: zone.zoneId,
            displayName: zone.displayName,
            recommendedLevel: zone.recommendedLevel,
            monsterTypes: zone.monsterTypes,
            isCurrent: zone.zoneId === currentZoneId,
            isDiscovered,
          });
          return;
        }
      }
      // Tapped empty area — clear selection
      setSelectedZone(null);
    },
    [canvasW, canvasH, currentZoneId, discoveredSet, toCanvasX, toCanvasY],
  );

  const discoveredCount = ZONE_MAP_LAYOUT.filter((z) =>
    discoveredSet.has(z.zoneId),
  ).length;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        backdropFilter: "blur(6px)",
        paddingTop: 8,
        paddingBottom: 8,
        overflowY: "auto",
      }}
      data-ocid="world-map-screen"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: canvasW,
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              fontWeight: 700,
              color: "#a0c8f8",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            🗺 World Map
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: "rgba(120,140,180,0.7)",
              marginLeft: 10,
            }}
          >
            {discoveredCount}/{ZONE_MAP_LAYOUT.length} explored
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close world map"
          data-ocid="world-map.close_button"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: "rgba(180,180,180,0.7)",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            minWidth: 48,
            minHeight: 36,
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Map canvas */}
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        onClick={handleCanvasTap}
        onTouchEnd={handleCanvasTap}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
          }
        }}
        style={{
          display: "block",
          border: "1px solid rgba(60,80,120,0.6)",
          borderRadius: 6,
          cursor: "pointer",
          flexShrink: 0,
          touchAction: "manipulation",
        }}
        aria-label="World map — tap a zone for details"
        data-ocid="world-map.canvas_target"
      />

      {/* Zone detail popup */}
      {selectedZone && (
        <div
          style={{
            marginTop: 10,
            width: canvasW,
            background: "rgba(10,14,28,0.96)",
            border: `1px solid ${selectedZone.isDiscovered ? "rgba(100,160,255,0.4)" : "rgba(80,80,80,0.3)"}`,
            borderRadius: 6,
            padding: "10px 14px",
            flexShrink: 0,
          }}
          data-ocid="world-map.zone-details.panel"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                fontWeight: 700,
                color: selectedZone.isDiscovered ? "#c8e8ff" : "#777",
                letterSpacing: "0.05em",
              }}
            >
              {selectedZone.isDiscovered ? selectedZone.displayName : "???"}
            </span>
            {selectedZone.isCurrent && (
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: "#80ff80",
                  background: "rgba(40,120,40,0.3)",
                  border: "1px solid rgba(80,200,80,0.4)",
                  borderRadius: 3,
                  padding: "2px 6px",
                  letterSpacing: "0.06em",
                }}
              >
                ◉ YOU ARE HERE
              </span>
            )}
          </div>

          {selectedZone.isDiscovered ? (
            <>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "rgba(180,200,220,0.7)",
                  marginBottom: 4,
                }}
              >
                Recommended Level:{" "}
                <span style={{ color: "#ffe080" }}>
                  {selectedZone.recommendedLevel}+
                </span>
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "rgba(160,180,200,0.65)",
                }}
              >
                Monsters:{" "}
                <span style={{ color: "rgba(255,160,140,0.9)" }}>
                  {selectedZone.monsterTypes.join(", ")}
                </span>
              </div>
            </>
          ) : (
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "rgba(120,120,120,0.7)",
                fontStyle: "italic",
              }}
            >
              Venture here to reveal this zone.
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          marginTop: 8,
          width: canvasW,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {[
          { color: "#3a7a2a", label: "Discovered" },
          {
            color: "rgba(28,30,38,0.9)",
            label: "Undiscovered",
            border: "rgba(100,100,100,0.4)",
          },
          { color: "#ffffff", label: "You are here", isCircle: true },
        ].map(({ color, label, border, isCircle }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: "rgba(160,170,190,0.7)",
            }}
          >
            {isCircle ? (
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  boxShadow: "0 0 5px #fff",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 14,
                  height: 10,
                  background: color,
                  border: `1px solid ${border ?? "rgba(255,255,255,0.2)"}`,
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              />
            )}
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
