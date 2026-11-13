import { useId } from "react";
import type { ThemeDefinition } from "@/lib/themes";
import mascotUrl from "@/assets/logo-mark.svg";
import "./ThemeScene.css";

const WATER: Record<ThemeDefinition["id"], [string, string]> = {
  dark: ["#22443f", "#5f9b89"],
  light: ["#b4d9d1", "#6ba99a"],
  midnight: ["#12394d", "#378aa0"],
  violet: ["#39304e", "#8975b1"],
  sand: ["#d9d4b4", "#9aab84"],
  onsen: ["#17434f", "#70b6b8"],
};

const STARS = [[25, 15], [48, 29], [78, 12], [111, 24], [145, 13], [219, 34]];
const RIPPLES = [[13, 82, 16], [46, 90, 22], [73, 80, 12], [96, 92, 18], [132, 84, 24], [165, 92, 17], [200, 82, 23]];

/** Uma pequena cena Onsen: cada prévia mantém a paleta real do tema. */
export function ThemeScene({ theme }: { theme: ThemeDefinition }) {
  const skyId = `theme-sky-${useId().replace(/:/g, "")}`;
  const p = theme.preview;
  const [water, reflection] = WATER[theme.id];

  return (
    <div className="q-theme-scene" style={{ background: p.bg, borderColor: p.border }}>
      <svg viewBox="0 0 240 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={skyId} x2="0" y2="1">
            <stop stopColor={p.bg} />
            <stop offset="1" stopColor={p.card} />
          </linearGradient>
        </defs>
        <rect width="240" height="96" fill={`url(#${skyId})`} />
        {theme.dark ? (
          <g fill={p.text} opacity=".45">
            {STARS.map(([x, y]) => <rect key={x} x={x} y={y} width="2" height="2" />)}
          </g>
        ) : (
          <g fill={p.sidebar} opacity=".85">
            <path d="M24 21h9v-3h14v3h10v5H24zM105 14h8v-3h11v3h8v4h-27z" />
          </g>
        )}
        <g className="q-theme-scene__celestial" shapeRendering="crispEdges">
          <path d="M185 12h13v3h4v4h3v12h-3v4h-4v3h-13v-3h-4v-4h-3V19h3v-4h4z" fill={theme.dark ? "#f0dfa8" : p.accent} />
          {theme.dark && <path d="M191 12h7v3h4v4h3v12h-3v4h-4v3h-9v-3h-4v-4h-3V20h3v-4h6z" fill={p.bg} />}
          {!theme.dark && <g fill={p.accent} opacity=".35"><rect x="189" y="5" width="4" height="3" /><rect x="189" y="42" width="4" height="3" /><rect x="170" y="23" width="3" height="4" /><rect x="210" y="23" width="3" height="4" /></g>}
        </g>
        <path d="M0 55h12v-5h12v-6h13v-8h17v7h14v7h17v6h12v-9h18v-8h19v7h13v8h17v-7h14v-9h19v7h16v8h14v-5h13v-8h13v7h14v27H0z" fill={p.border} opacity=".8" shapeRendering="crispEdges" />
        <path d="M0 68h18v-5h19v-7h16v5h19v8h19v-5h25v-7h16v7h26v4h22v-9h22v5h15v5h23v27H0z" fill={p.sidebar} shapeRendering="crispEdges" />
        <g className="q-theme-scene__steam" fill={reflection} opacity=".55" shapeRendering="crispEdges">
          <path d="M112 39h3v-5h-3v-4h3v-4h2v5h-3v3h3v5zM130 44h2v-4h-2v-4h2v-3h2v5h-2v3h2v3z" />
        </g>
        <path d="M23 72h13v-3h18v3h11v6H23zM151 72h12v-3h29v3h17v6h-58z" fill={p.muted} opacity=".5" shapeRendering="crispEdges" />
        <image className="q-theme-scene__capy" href={mascotUrl} x="91" y="36" width="58" height="46" />
        <g shapeRendering="crispEdges">
          <path d="M165 53h35v22h-35z" fill={p.muted} />
          <path d="M168 56h29v16h-29z" fill={p.bg} />
          <path d="M158 75h49v3h-49z" fill={p.border} />
          <path d="M171 59h7v2h-7zM171 64h12v2h-12z" fill={p.accent} />
          <path d="M181 59h11v2h-11zM186 64h6v2h-6z" fill={reflection} />
        </g>
        <path d="M0 77h66v2h24v-2h64v2h55v-2h31v19H0z" fill={water} shapeRendering="crispEdges" />
        <g className="q-theme-scene__ripples" fill={reflection} opacity=".65" shapeRendering="crispEdges">
          {RIPPLES.map(([x, y, width]) => <rect key={x} x={x} y={y} width={width} height="1" />)}
          <path d="M94 81h47v1H94zM100 84h35v1h-35z" opacity=".6" />
        </g>
      </svg>
    </div>
  );
}
