// ═══════════════════════════════════════════
// BOTES — Conciencia financiera para el autónomo
// Fase 1: registro manual. Preparado para que en Fase 2
// beba de los pedidos (ver nota INTEGRACIÓN al final).
// ═══════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";

// ── FICHA DE OFICIO (cambiar esto para otro autónomo) ──
const OFICIO = {
  iva: 0.21,             // IVA de la actividad (costura = 21%)
  llevaRetencion: false, // empresarial → sin retención → modelo 130
  aptHacienda: 0.25,     // % que aparta de cada cobro (término medio, editable)
};

// Valores oficiales verificados 2026 (editables por la persona)
const FIJOS_DEFAULT = {
  alquiler: 600, luz: 100, otros: 50, cuota: 89, material: 150,
  meta: 1381,   // SMI 2026 prorrateado 12 pagas
  pct: Math.round(OFICIO.aptHacienda * 100), // % Hacienda editable
};

const LS_KEY = "taller-botes-v1";
const fmt = (n) => Math.round(n).toLocaleString("es-ES") + " €";

// Fechas trimestrales (para alertas)
const TRIMESTRES = [
  { mes: 3, dia: 20, txt: "Del 1 al 20 de abril se presenta el trimestre (ene–mar)." },
  { mes: 6, dia: 20, txt: "Del 1 al 20 de julio se presenta el trimestre (abr–jun)." },
  { mes: 9, dia: 20, txt: "Del 1 al 20 de octubre se presenta el trimestre (jul–sep)." },
  { mes: 0, dia: 30, txt: "Del 1 al 30 de enero se presenta el trimestre (oct–dic)." },
];

export default function Botes() {
  const [movs, setMovs] = useState([]);
  const [fijos, setFijos] = useState(FIJOS_DEFAULT);
  const [modal, setModal] = useState(null); // 'ingreso' | 'gasto' | 'ajustes' | null
  const [importe, setImporte] = useState("");
  const [concepto, setConcepto] = useState("");
  const [subtipo, setSubtipo] = useState(null);

  // cargar
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY));
      if (d) { setMovs(d.movs || []); setFijos({ ...FIJOS_DEFAULT, ...(d.fijos || {}) }); }
    } catch {}
  }, []);
  // guardar
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ movs, fijos })); } catch {}
  }, [movs, fijos]);

  const pct = (fijos.pct || 25) / 100;
  const totalFijos = (fijos.alquiler||0)+(fijos.luz||0)+(fijos.otros||0)+(fijos.cuota||0)+(fijos.material||0);

  const calc = useMemo(() => {
    let ingreso = 0, gastos = 0;
    movs.forEach(m => { if (m.tipo === "ingreso") ingreso += m.importe; else gastos += m.importe; });
    const hacienda = ingreso * pct;
    const mio = ingreso - hacienda - totalFijos;
    return { ingreso, gastos, hacienda, fijos: totalFijos, mio };
  }, [movs, pct, totalFijos]);

  // Zona psicológica (por mes)
  const zona = useMemo(() => {
    const m = calc.mio, meta = fijos.meta || 1381;
    if (calc.ingreso === 0) return { c: "verde", e: "🌱", t: "Empieza a registrar", m: "Toca «Cobré» cada vez que te paguen un trabajo." };
    if (m < 0) return { c: "roja", e: "🫂", t: "Mes flojo", m: "No cubres tus gastos este mes. Tira de lo que ahorraste, es justo para esto." };
    if (m < meta * 0.6) return { c: "amarilla", e: "💪", t: "Vas cubriendo", m: "Mes normalito. Cubres lo tuyo y lo de Hacienda está a salvo." };
    if (m < meta) return { c: "amarilla", e: "🙂", t: "Casi ahí", m: "Ya casi llegas a tu sueldo objetivo. Buen mes." };
    if (m < meta * 1.4) return { c: "verde", e: "😊", t: "¡Muy bien!", m: "Superas tu sueldo objetivo. Puedes respirar tranquila." };
    return { c: "azul", e: "🎉", t: "Mes fuerte", m: "Vas holgada. Guarda algo para los meses flojos que vendrán." };
  }, [calc, fijos.meta]);

  // Alerta trimestral
  const alerta = useMemo(() => {
    const hoy = new Date(); let min = 999, prox = null;
    TRIMESTRES.forEach(f => {
      let fin = new Date(hoy.getFullYear(), f.mes, f.dia);
      if (fin < hoy) fin = new Date(hoy.getFullYear() + 1, f.mes, f.dia);
      const d = Math.ceil((fin - hoy) / 86400000);
      if (d >= 0 && d < min) { min = d; prox = f; }
    });
    if (prox && min <= 30) {
      let t = prox.txt;
      if (calc.hacienda > 0) t += ` Ya tienes ${fmt(calc.hacienda)} guardado ✓.`;
      return t + " Avisa a Nora.";
    }
    return null;
  }, [calc.hacienda]);

  const gastoTipos = [
    { id: "alquiler", l: "Alquiler" }, { id: "luz", l: "Luz o agua" },
    { id: "material", l: "Materiales" }, { id: "cuota", l: "Cuota" }, { id: "otro", l: "Otro" },
  ];

  function abrir(tipo) { setModal(tipo); setImporte(""); setConcepto(""); setSubtipo(null); }
  function guardar() {
    const imp = parseFloat(importe);
    if (!imp || imp <= 0) return;
    setMovs(p => [...p, {
      tipo: modal, subtipo: modal === "gasto" ? (subtipo || "otro") : null,
      importe: imp, concepto: concepto.trim(),
      fecha: new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
    }]);
    setModal(null);
  }
  function borrar(i) { if (window.confirm("¿Borrar esto?")) setMovs(p => p.filter((_, x) => x !== i)); }

  function exportar() {
    let t = `MIS CUENTAS\n${new Date().toLocaleDateString("es-ES")}\n\nCobrado: ${fmt(calc.ingreso)}\nGastos taller: ${fmt(calc.fijos)}\nGuardado Hacienda: ${fmt(calc.hacienda)}\nPara mí: ${fmt(Math.max(calc.mio,0))}\n\nMOVIMIENTOS:\n`;
    movs.forEach(m => t += `${m.fecha} | ${m.tipo === "ingreso" ? "Cobré" : "Pagué"} ${m.importe}€ | ${m.concepto || ""}\n`);
    if (navigator.share) navigator.share({ title: "Mis cuentas", text: t });
    else navigator.clipboard.writeText(t).then(() => alert("Copiado. Pégalo en un WhatsApp a Nora."));
  }

  const B = STY;
  return (
    <div style={{ paddingBottom: 90 }}>
      {/* ZONA */}
      <div style={{ ...B.zona, ...B["zona_" + zona.c] }}>
        <div style={{ fontSize: "2.2rem" }}>{zona.e}</div>
        <div style={{ fontFamily: "Baloo 2, system-ui", fontSize: "1.3rem", fontWeight: 700 }}>{zona.t}</div>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: 4, lineHeight: 1.35 }}>{zona.m}</div>
      </div>

      {/* LO TUYO */}
      <div style={B.lotuyo}>
        <div style={{ fontSize: "0.95rem", color: "#8A8078", fontWeight: 700 }}>Este mes es para ti</div>
        <div style={{ fontFamily: "Baloo 2, system-ui", fontSize: "3rem", fontWeight: 700, color: "#4E9E7C", lineHeight: 1, margin: "4px 0" }}>{fmt(Math.max(calc.mio, 0))}</div>
        <div style={{ fontSize: "0.85rem", color: "#8A8078", fontWeight: 600 }}>tu sueldo limpio, con todo cubierto</div>
      </div>

      {/* ALERTA */}
      {alerta && <div style={B.alerta}><span style={{ fontSize: "1.5rem" }}>🗓️</span><span>{alerta}</span></div>}

      {/* BOTES */}
      <div style={{ fontFamily: "Baloo 2, system-ui", fontSize: "1.05rem", fontWeight: 600, margin: "20px 4px 8px" }}>Lo que ya tienes apartado</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <BoteCard nombre="Para Hacienda" desc="guardado y a salvo" color="#F4917B" valor={calc.hacienda} lleno={calc.ingreso > 0 ? 70 : 0} estado="✓" estadoOk />
        <BoteCard nombre="Gastos del taller" desc="alquiler, luz, cuota…" color="#F4C56B"
          valor={calc.fijos} lleno={calc.fijos > 0 ? Math.min(100, (Math.max(calc.ingreso - calc.hacienda, 0) / calc.fijos) * 100) : 0}
          estado={calc.ingreso - calc.hacienda >= calc.fijos ? "cubiertos ✓" : "falta " + fmt(calc.fijos - (calc.ingreso - calc.hacienda))}
          estadoOk={calc.ingreso - calc.hacienda >= calc.fijos} />
      </div>

      {/* RESUMEN */}
      <div style={B.resumen}>
        <div style={{ fontFamily: "Baloo 2, system-ui", fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>Resumen del mes</div>
        {[["Has cobrado", calc.ingreso], ["Gastos del taller", calc.fijos], ["Guardado para Hacienda", calc.hacienda], ["Para ti", Math.max(calc.mio, 0)]].map(([l, v], i) => (
          <div key={i} style={B.rLinea}><span>{l}</span><b>{fmt(v)}</b></div>
        ))}
      </div>

      {/* HISTORIAL */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontFamily: "Baloo 2, system-ui", fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>Lo último</div>
        {movs.length === 0
          ? <div style={B.vacio}>Todavía no hay nada.<br />Toca «Cobré» cuando te paguen un trabajo.</div>
          : [...movs].reverse().slice(0, 15).map((m, ri) => {
            const i = movs.length - 1 - ri;
            return (
              <div key={i} style={B.mov}>
                <div><div style={{ fontWeight: 700 }}>{m.concepto || (m.tipo === "ingreso" ? "Cobro" : "Gasto")}</div><div style={{ fontSize: "0.8rem", color: "#8A8078", fontWeight: 600 }}>{m.fecha}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontWeight: 800, color: m.tipo === "ingreso" ? "#4E9E7C" : "#E5735A" }}>{m.tipo === "ingreso" ? "+" : "−"}{fmt(m.importe)}</span>
                  <button onClick={() => borrar(i)} style={B.borrar}>×</button>
                </div>
              </div>
            );
          })}
      </div>

      {/* CONFIG */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        <button onClick={exportar} style={{ ...B.cfgBtn, background: "#8FB8D9", color: "#fff" }}>📤 Enviar mis cuentas a Nora</button>
        <button onClick={() => setModal("ajustes")} style={{ ...B.cfgBtn, background: "#f0ebe3", color: "#8A8078" }}>⚙️ Ajustar mis gastos fijos</button>
        <button onClick={() => window.confirm("¿Empezar un mes nuevo a cero? Antes envía tus cuentas a Nora.") && setMovs([])} style={{ ...B.cfgBtn, background: "#f0ebe3", color: "#8A8078" }}>Empezar un mes nuevo</button>
      </div>

      {/* BOTONES FIJOS */}
      <div style={B.acciones}>
        <button onClick={() => abrir("ingreso")} style={{ ...B.accBtn, background: "#7EC8A6" }}><span style={{ fontSize: "1.3rem" }}>＋</span> Cobré</button>
        <button onClick={() => abrir("gasto")} style={{ ...B.accBtn, background: "#F4917B" }}><span style={{ fontSize: "1.3rem" }}>－</span> Pagué</button>
      </div>

      {/* MODAL movimiento */}
      {(modal === "ingreso" || modal === "gasto") && (
        <div style={B.modalBg} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={B.modal}>
            <h3 style={B.modalH}>{modal === "ingreso" ? "¿Cuánto cobraste?" : "¿Cuánto pagaste?"}</h3>
            <p style={B.modalP}>{modal === "ingreso" ? "Lo que te ha pagado el cliente." : "Un gasto de tu trabajo."}</p>
            <div style={B.euroWrap}>
              <input type="number" inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} placeholder="0" style={B.euroInput} autoFocus />
              <span style={{ fontFamily: "Baloo 2, system-ui", fontSize: "2rem", color: "#8A8078" }}>€</span>
            </div>
            <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder={modal === "ingreso" ? "¿De qué? (ej: arreglo pantalón)" : "¿En qué? (ej: hilos)"} style={B.concInput} />
            {modal === "gasto" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {gastoTipos.map(t => (
                  <button key={t.id} onClick={() => { setSubtipo(t.id); if (!concepto) setConcepto(t.l); }}
                    style={{ ...B.tipoBtn, ...(subtipo === t.id ? B.tipoSel : {}) }}>{t.l}</button>
                ))}
              </div>
            )}
            {modal === "ingreso" && parseFloat(importe) > 0 && (
              <div style={B.preview}>
                <div style={{ fontSize: "0.9rem", color: "#3d7358", textAlign: "center", marginBottom: 8, fontWeight: 700 }}>De lo que has cobrado:</div>
                <div style={B.pRow}><span>🔴 Guarda para Hacienda</span><b>{fmt(parseFloat(importe) * pct)}</b></div>
                <div style={B.pRow}><span>🟢 Es para ti</span><b>{fmt(parseFloat(importe) * (1 - pct))}</b></div>
              </div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setModal(null)} style={{ ...B.mBtn, background: "#eee6dc", color: "#8A8078" }}>Cancelar</button>
              <button onClick={guardar} style={{ ...B.mBtn, background: "#7EC8A6", color: "#fff" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ajustes */}
      {modal === "ajustes" && (
        <div style={B.modalBg} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={B.modal}>
            <h3 style={B.modalH}>Mis gastos fijos</h3>
            <p style={B.modalP}>Lo que pagas cada mes, salga o entre trabajo.</p>
            {[["alquiler", "Alquiler"], ["luz", "Luz"], ["otros", "Otros servicios"], ["cuota", "Cuota de autónoma"], ["material", "Material (al mes)"], ["meta", "Meta de sueldo"], ["pct", "% que aparto para Hacienda"]].map(([k, l]) => (
              <div key={k} style={B.ajFila}>
                <label style={{ fontWeight: 700, fontSize: "0.95rem" }}>{l}</label>
                <span><input type="number" value={fijos[k]} onChange={e => setFijos(f => ({ ...f, [k]: +e.target.value || 0 }))} style={B.ajInput} />{k === "pct" ? "%" : "€"}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <button onClick={() => setModal(null)} style={{ ...B.mBtn, background: "#7EC8A6", color: "#fff", flex: 1 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BoteCard({ nombre, desc, color, valor, lleno, estado, estadoOk }) {
  return (
    <div style={STY.bote}>
      <div style={{ fontFamily: "Baloo 2, system-ui", fontSize: "1.05rem", fontWeight: 600, color }}>{nombre}</div>
      <div style={{ fontSize: "0.76rem", color: "#8A8078", fontWeight: 600 }}>{desc}</div>
      <div style={STY.frasco}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: lleno + "%", background: color, transition: "height .6s" }} />
      </div>
      <div style={{ fontFamily: "Baloo 2, system-ui", fontSize: "1.4rem", fontWeight: 700, color: "#4A4038" }}>{fmt(valor)}</div>
      <div style={{ fontSize: "0.74rem", fontWeight: 700, color: estadoOk ? "#4E9E7C" : "#E5735A" }}>{estado}</div>
    </div>
  );
}

const STY = {
  zona: { padding: 20, borderRadius: 22, textAlign: "center", marginBottom: 4 },
  zona_roja: { background: "#FBE3DC", color: "#c0553c" },
  zona_amarilla: { background: "#FDF1D8", color: "#977213" },
  zona_verde: { background: "#E4F3EA", color: "#3d7358" },
  zona_azul: { background: "#DEEBF5", color: "#3f6d92" },
  lotuyo: { marginTop: 16, padding: 22, background: "#fff", borderRadius: 24, boxShadow: "0 4px 16px rgba(120,100,80,.10)", textAlign: "center" },
  alerta: { marginTop: 16, padding: "14px 16px", borderRadius: 18, background: "#EAF2F8", display: "flex", gap: 12, alignItems: "center", fontWeight: 600, fontSize: "0.95rem", color: "#3f6d92" },
  bote: { background: "#fff", borderRadius: 22, padding: "16px 12px", boxShadow: "0 3px 12px rgba(120,100,80,.08)", textAlign: "center" },
  frasco: { width: 58, height: 74, margin: "10px auto 6px", border: "4px solid #4A4038", borderTop: "none", borderRadius: "6px 6px 18px 18px", position: "relative", overflow: "hidden", background: "rgba(0,0,0,.02)" },
  resumen: { marginTop: 16, padding: "18px 20px", background: "#fff", borderRadius: 22, boxShadow: "0 3px 12px rgba(120,100,80,.08)" },
  rLinea: { display: "flex", justifyContent: "space-between", fontSize: "1.02rem", padding: "7px 0", borderBottom: "1px dashed #eee", fontWeight: 600 },
  mov: { background: "#fff", borderRadius: 16, padding: "13px 16px", marginBottom: 9, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(120,100,80,.06)" },
  borrar: { background: "#f4f0ea", border: "none", color: "#8A8078", fontSize: "1.15rem", cursor: "pointer", width: 30, height: 30, borderRadius: "50%" },
  vacio: { textAlign: "center", color: "#8A8078", fontSize: "1rem", padding: 22, fontWeight: 600, lineHeight: 1.5 },
  cfgBtn: { border: "none", borderRadius: 16, padding: 14, fontSize: "1.02rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  acciones: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, display: "flex", gap: 12, padding: "12px 14px 16px", background: "linear-gradient(to top,#FFF8EF 70%,transparent)", zIndex: 20 },
  accBtn: { flex: 1, border: "none", borderRadius: 20, padding: "17px 8px", fontFamily: "Baloo 2, system-ui", fontSize: "1.2rem", fontWeight: 700, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(120,100,80,.2)" },
  modalBg: { position: "fixed", inset: 0, background: "rgba(74,64,56,.5)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  modal: { background: "#FFF8EF", width: "100%", maxWidth: 480, borderRadius: "28px 28px 0 0", padding: "24px 22px 32px", maxHeight: "90vh", overflowY: "auto" },
  modalH: { fontFamily: "Baloo 2, system-ui", fontWeight: 700, fontSize: "1.5rem", marginBottom: 2, textAlign: "center" },
  modalP: { fontSize: "0.98rem", color: "#8A8078", textAlign: "center", marginBottom: 16, fontWeight: 600 },
  euroWrap: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#fff", borderRadius: 20, padding: 16, marginBottom: 14 },
  euroInput: { border: "none", background: "transparent", fontFamily: "Baloo 2, system-ui", fontSize: "2.8rem", fontWeight: 700, width: 150, textAlign: "right", color: "#4A4038", outline: "none" },
  concInput: { width: "100%", border: "3px solid #eee", borderRadius: 16, padding: 14, fontFamily: "inherit", fontSize: "1.05rem", fontWeight: 600, marginBottom: 14, outline: "none" },
  tipoBtn: { flex: 1, minWidth: 90, border: "3px solid #eee", background: "#fff", borderRadius: 14, padding: 11, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", color: "#8A8078", fontFamily: "inherit" },
  tipoSel: { borderColor: "#F4917B", color: "#E5735A", background: "#fef4f1" },
  preview: { background: "#E4F3EA", borderRadius: 16, padding: 14, marginBottom: 14 },
  pRow: { display: "flex", justifyContent: "space-between", fontSize: "1.05rem", padding: "4px 0", fontWeight: 700 },
  mBtn: { flex: 1, border: "none", borderRadius: 18, padding: 16, fontSize: "1.15rem", fontWeight: 700, cursor: "pointer", fontFamily: "Baloo 2, system-ui" },
  ajFila: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 14, padding: "10px 14px", marginBottom: 8 },
  ajInput: { width: 80, border: "2px solid #eee", borderRadius: 10, padding: 8, textAlign: "right", fontFamily: "inherit", fontSize: "1rem", fontWeight: 700, outline: "none", marginRight: 4 },
};

// ═══════════════════════════════════════════
// NOTA INTEGRACIÓN (Fase 2) — cuando Mileydi ya use la app:
// En vez de registro manual, calcular `ingreso` desde los pedidos:
//   - Señal: cuenta cuando el pedido se crea con signalPaid=true → suma o.signal
//   - Resto: cuando status pasa a "entregado" → suma (o.price - o.signal)
//   - Devolución de señal: si el pedido se cancela → resta o.signal
// Los gastos fijos siguen viniendo de esta pantalla (ajustes).
// ═══════════════════════════════════════════
