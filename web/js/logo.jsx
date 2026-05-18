/* ════════════════════════════════════════════════════════════════════
 * BB Logo components — React + Babel inline (sin build step).
 * Renderiza el badge del header y el sticker grande del home.
 * ════════════════════════════════════════════════════════════════════ */
const BB = {
  cream:'#F2E3C2', paper:'#F8EFD8', ink:'#1F1A2E',
  maroon:'#8C1D2F', gold:'#E8B33D', cobalt:'#1E4FB8',
  tomate:'#E8442C', pasto:'#2E6B3A',
  holo1:'#9CD3E8', holo2:'#F2C2D8', holo3:'#FBE38B',
};
const HOLO = `linear-gradient(110deg,${BB.holo1} 0%,${BB.holo2} 28%,${BB.holo3} 52%,${BB.holo1} 76%,${BB.holo2} 100%)`;

const HoloBar = ({ height = 14, style = {} }) => (
  <div style={{ height, background: HOLO, backgroundSize: '200% 100%',
                border: `1.5px solid ${BB.ink}`, borderRadius: 2,
                position: 'relative', overflow: 'hidden', ...style }}>
    <div style={{ position: 'absolute', inset: 0,
                  background: 'repeating-linear-gradient(90deg,transparent 0 6px,rgba(31,26,46,0.12) 6px 7px)' }} />
  </div>
);

const BanditaFoilBadge = ({ size = 36 }) => (
  <div style={{ width: size, height: size, background: BB.gold,
                border: `3px solid ${BB.ink}`, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', boxShadow: `5px 5px 0 ${BB.ink}`,
                fontFamily: 'Anton, sans-serif' }}>
    <div style={{ fontSize: size * .29, color: BB.ink, lineHeight: 1, fontStyle: 'italic' }}>BB</div>
    <div style={{ fontSize: size * .09, fontFamily: 'Space Mono, monospace',
                  color: BB.ink, marginTop: 2, letterSpacing: 1 }}>★ FOIL ★</div>
  </div>
);

const BanditaSticker = ({ scale = 0.52 }) => {
  const W = 480 * scale, H = 320 * scale;
  return (
    <div style={{ display: 'inline-block', background: BB.cobalt,
                  backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.06) 0 14px,transparent 14px 28px)',
                  padding: 56 * scale }}>
      <div style={{ width: W, height: H, background: BB.cream,
                    border: `${4 * scale}px solid ${BB.ink}`, borderRadius: 16 * scale,
                    padding: 22 * scale, transform: 'rotate(-3deg)',
                    boxShadow: `${10 * scale}px ${10 * scale}px 0 ${BB.maroon},${10 * scale}px ${10 * scale}px 0 ${4 * scale}px ${BB.ink}`,
                    position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', inset: 8 * scale,
                      border: `${2 * scale}px dashed ${BB.ink}`,
                      borderRadius: 10 * scale, opacity: 0.35, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 * scale }}>
          <div style={{ display: 'flex', gap: 4 * scale }}>
            {[BB.tomate, BB.gold, BB.pasto, BB.cobalt].map((c, i) =>
              <div key={i} style={{ width: 14 * scale, height: 14 * scale, background: c,
                                    border: `${1.5 * scale}px solid ${BB.ink}`, borderRadius: '50%' }} />)}
          </div>
          <div style={{ fontFamily: 'Space Mono', fontSize: 11 * scale, color: BB.ink,
                        fontWeight: 700, letterSpacing: 1 }}>№ 001 / CL</div>
        </div>
        <HoloBar height={20 * scale} style={{ marginBottom: 14 * scale }} />
        <div style={{ fontFamily: 'Anton, sans-serif', fontStyle: 'italic',
                      fontSize: 96 * scale, lineHeight: 0.85, color: BB.maroon,
                      letterSpacing: -2, textTransform: 'uppercase',
                      textShadow: `${3 * scale}px ${3 * scale}px 0 ${BB.gold}` }}>
          <div>Bandita</div>
          <div style={{ color: BB.ink, textShadow: `${3 * scale}px ${3 * scale}px 0 ${BB.tomate}` }}>Bet ★</div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontFamily: 'Space Mono', fontSize: 11 * scale, color: BB.ink, lineHeight: 1.4 }}>
            <div style={{ fontWeight: 700, color: BB.maroon }}>POLLA · PRODE · LOS AMIGOS</div>
            <div>CHAMPIONS · LIBERTADORES · LIGA CHILENA</div>
          </div>
          <div style={{ fontFamily: 'Anton, sans-serif', fontStyle: 'italic',
                        fontSize: 28 * scale, color: BB.ink, background: BB.gold,
                        padding: `${2 * scale}px ${10 * scale}px`,
                        border: `${2 * scale}px solid ${BB.ink}`, transform: 'rotate(4deg)' }}>2026</div>
        </div>
        <div style={{ position: 'absolute', bottom: 40 * scale, right: 40 * scale,
                      width: 90 * scale, height: 90 * scale, background: BB.gold,
                      border: `${3 * scale}px solid ${BB.ink}`, borderRadius: '50%',
                      transform: 'rotate(15deg)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexDirection: 'column',
                      boxShadow: `${5 * scale}px ${5 * scale}px 0 ${BB.ink}`,
                      fontFamily: 'Anton, sans-serif' }}>
          <div style={{ fontSize: 26 * scale, color: BB.ink, lineHeight: 1, fontStyle: 'italic' }}>BB</div>
          <div style={{ fontSize: 9 * scale, fontFamily: 'Space Mono, monospace',
                        color: BB.ink, marginTop: 2 * scale }}>★ FOIL ★</div>
        </div>
      </div>
    </div>
  );
};

const badgeRoot = document.getElementById('logo-badge');
if (badgeRoot) ReactDOM.createRoot(badgeRoot).render(<BanditaFoilBadge size={36} />);
