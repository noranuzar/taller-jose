import { useState, useEffect, useMemo, useCallback } from "react";
import { loadOrders, saveOrder, saveAllOrders, deleteOrderDb, loadConfig, saveConfig, loadTicket, saveTicket } from "./storage";

// ═══════════════════════════════════════════
// CONFIG DEFAULTS
// ═══════════════════════════════════════════
const DEFAULTS = {
  pin: "1234",
  phone: "34747474562",
  phoneDisplay: "747 474 562",
  bizum: "747 474 562",
  address: "Puesto 18, Mercado Guillermo de Osma",
  signalPct: 50,
  blockedDays: {},  // { "2026-12-25": "closed", "2026-08-14": "half" }
  workers: [
    { id: "leonel", name: "Leonel", active: true, minPerDay: 450, minSat: 240 },
    { id: "mileydi", name: "Mileydi", active: true, minPerDay: 420, minSat: 240 },
    { id: "ayudante", name: "Ayudante", active: false, minPerDay: 300, minSat: 0 },
  ],
  services: [
    { id: "bajos", name: "Bajos de pantalón", icon: "👖", price: 8, mins: 20, minDays: 0 },
    { id: "cremallera", name: "Cambio cremallera", icon: "🔗", price: 12, mins: 35, minDays: 1 },
    { id: "cintura", name: "Ajuste de cintura", icon: "📐", price: 15, mins: 50, minDays: 2 },
    { id: "chaqueta", name: "Arreglo chaqueta", icon: "🧥", price: 25, mins: 60, minDays: 2 },
    { id: "dobladillo", name: "Dobladillo invisible", icon: "🪡", price: 10, mins: 30, minDays: 1 },
    { id: "parche", name: "Parche / zurcido", icon: "🩹", price: 12, mins: 25, minDays: 1 },
    { id: "otro", name: "Otro arreglo", icon: "🧵", price: 0, mins: 30, minDays: 1 },
  ],
};

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().split("T")[0];
const fmtD = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
const fmtDL = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
const fmtPh = (p) => { const n = (p||"").replace(/^34/, ""); return n.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3"); };
const cleanPh = (p) => { let c = p.replace(/[\s\-()]/g, "").replace(/^\+?34/, "34"); return c.startsWith("34") ? c : "34" + c; };
const isSaturday = (d) => new Date(d + "T12:00:00").getDay() === 6;
const isSunday = (d) => new Date(d + "T12:00:00").getDay() === 0;
const isWorkday = (d) => !isSunday(d);
const ticketCode = (n) => `P-${String(n).padStart(4, "0")}`;

const STATUSES = [
  { id: "registrado", label: "Registrado", sub: "Señal pendiente", color: "#9333ea", bg: "#f3e8ff", icon: "📝" },
  { id: "confirmado", label: "Confirmado", sub: "En cola", color: "#2563eb", bg: "#dbeafe", icon: "📥" },
  { id: "proceso", label: "En proceso", sub: "Cosiendo", color: "#d97706", bg: "#fef3c7", icon: "✂️" },
  { id: "listo", label: "Listo", sub: "Avisar cliente", color: "#059669", bg: "#d1fae5", icon: "✅" },
  { id: "entregado", label: "Entregado", sub: "Cobrado", color: "#6b7280", bg: "#f3f4f6", icon: "🤝" },
];
const gSt = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

// ═══════════════════════════════════════════
// CAPACITY ENGINE
// ═══════════════════════════════════════════
function getDayType(date, config) {
  const bd = (config.blockedDays || {});
  if (bd[date] === "closed") return "closed";
  if (bd[date] === "half") return "half";
  if (isSunday(date)) return "closed";
  if (isSaturday(date)) return "saturday";
  return "normal";
}

function calcDayCap(date, orders, config) {
  const type = getDayType(date, config);
  if (type === "closed") return { date, total: 0, used: 0, free: 0, pct: 100, light: "red", type };
  const sat = type === "saturday";
  const multiplier = type === "half" ? 0.5 : 1;
  const total = Math.round(config.workers.filter(w => w.active).reduce((s, w) => s + (sat ? w.minSat : w.minPerDay), 0) * multiplier);
  const used = orders.filter(o => o.deliveryDate === date && !["listo","entregado"].includes(o.status)).reduce((s, o) => s + (o.mins || 30), 0);
  const free = Math.max(0, total - used);
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const light = pct < 70 ? "green" : pct < 90 ? "yellow" : "red";
  return { date, total, used, free, pct, light, type };
}

function findSlot(mins, orders, config) {
  const d = new Date();
  for (let i = 0; i < 30; i++) {
    const ds = d.toISOString().split("T")[0];
    const type = getDayType(ds, config);
    if (type !== "closed" && calcDayCap(ds, orders, config).free >= mins) return ds;
    d.setDate(d.getDate() + 1);
  }
  return today();
}

// ═══════════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════════
const waOpen = (phone, msg) => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
const waMsg = {
  register: (o, c) => `Hola ${o.name}, tu prenda está registrada en el Taller de Costura Express.\n\n📋 Ticket: ${ticketCode(o.ticketNum)}\n🧵 ${o.serviceName}\n💰 Precio: ${o.price}€\n💶 Señal (${c.signalPct}%): ${o.signal}€${o.signalPaid?" ✅":""}\n📅 Entrega estimada: ${fmtD(o.deliveryDate)}\n📍 ${c.address}\n\nCuando esté lista te avisamos por aquí. 👋`,
  ready: (o, c) => `Hola ${o.name}, ¡tu prenda está lista! ✅\n\n📋 Ticket: ${ticketCode(o.ticketNum)}\n🧵 ${o.serviceName}\n💶 Resto a pagar: ${Math.max(0, o.price - o.signal)}€\n📍 ${c.address}\n🕐 L-V 10-14h y 17-20:30h, Sáb 10-14h\n\n¡Te esperamos!`,
  remind: (o, c) => `Hola ${o.name}, tu prenda (${o.serviceName}) lleva esperándote en el Taller de Costura Express.\n📋 ${ticketCode(o.ticketNum)}\n📍 ${c.address}\n\n¿Cuándo pasas a recogerla?`,
};

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [mode, setMode] = useState(null);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState(false);
  const [orders, setOrders] = useState([]);
  const [config, setConfig] = useState(DEFAULTS);
  const [ticketCounter, setTicketCounter] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dash");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [clientPh, setClientPh] = useState("");
  const [searched, setSearched] = useState(false);

  // Load from Supabase (with localStorage fallback)
  useEffect(() => {
    async function init() {
      const [o, c, t] = await Promise.all([loadOrders(), loadConfig(), loadTicket()]);
      if (o && o.length > 0) setOrders(o);
      if (c) setConfig({ ...DEFAULTS, ...c });
      if (t) setTicketCounter(t);
      setLoaded(true);
    }
    init();
  }, []);

  // Save orders to Supabase on changes
  useEffect(() => { if (loaded) saveAllOrders(orders); }, [orders, loaded]);
  useEffect(() => { if (loaded) saveConfig(config); }, [config, loaded]);
  useEffect(() => { if (loaded) saveTicket(ticketCounter); }, [ticketCounter, loaded]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);
  const notify = (m) => setToast(m);

  const nextTicket = useCallback(() => { const n = ticketCounter + 1; setTicketCounter(n); return n; }, [ticketCounter]);

  // ADD ORDER
  const addOrder = useCallback((o) => {
    const tn = nextTicket();
    const svc = config.services.find(s => s.id === o.serviceId) || config.services[6];
    const signal = Math.ceil((o.price || svc.price) * (config.signalPct / 100));
    const nw = { ...o, id: uid(), ticketNum: tn, serviceName: svc.name, serviceIcon: svc.icon, price: o.price || svc.price, signal, mins: o.mins || svc.mins, signalPaid: o.signalPaid || false, status: o.signalPaid ? "confirmado" : "registrado", source: o.source || "tienda", assignedTo: o.assignedTo || null, createdAt: new Date().toISOString() };
    setOrders(p => [nw, ...p]);
    notify(`${ticketCode(tn)} registrado`);
    waOpen(nw.phone, waMsg.register(nw, config));
    setView("dash");
  }, [nextTicket, config]);

  const updateOrder = (o) => { setOrders(p => p.map(x => x.id === o.id ? o : x)); setEditing(null); notify("Actualizado"); };

  const advanceStatus = useCallback((oid) => {
    let label = "";
    setOrders(prev => prev.map(o => {
      if (o.id !== oid) return o;
      const idx = STATUSES.findIndex(s => s.id === o.status);
      const next = STATUSES[idx + 1];
      if (!next) return o;
      label = next.label;
      if (next.id === "listo") setTimeout(() => waOpen(o.phone, waMsg.ready(o, config)), 100);
      return { ...o, status: next.id };
    }));
    if (label) notify(`→ ${label}`);
  }, [config]);

  const deleteOrder = (oid) => { if (confirm("¿Eliminar este pedido?")) { setOrders(p => p.filter(x => x.id !== oid)); deleteOrderDb(oid); notify("Eliminado"); } };

  // COMPUTED
  const todayCap = useMemo(() => calcDayCap(today(), orders, config), [orders, config]);
  const weekCaps = useMemo(() => {
    const days = []; const d = new Date();
    for (let i = 0; i < 7; i++) { const ds = d.toISOString().split("T")[0]; if (!isSunday(ds)) days.push(calcDayCap(ds, orders, config)); d.setDate(d.getDate() + 1); }
    return days;
  }, [orders, config]);

  const inv = useMemo(() => {
    const c = { registrado: 0, confirmado: 0, proceso: 0, listo: 0, total: 0 };
    orders.forEach(o => { if (o.status !== "entregado") { c[o.status]++; c.total++; } });
    return c;
  }, [orders]);

  const alerts = useMemo(() => {
    const a = []; const now = Date.now();
    orders.forEach(o => {
      if (o.status === "listo") { const d = Math.floor((now - new Date(o.createdAt).getTime()) / 86400000); if (d > 5) a.push({ type: "old", o, msg: `${ticketCode(o.ticketNum)} ${o.name} — lista hace ${d} días` }); }
      if (o.status === "registrado" && !o.signalPaid) { const h = (now - new Date(o.createdAt).getTime()) / 3600000; if (h > 48) a.push({ type: "signal", o, msg: `${ticketCode(o.ticketNum)} ${o.name} — señal pendiente` }); }
    });
    return a;
  }, [orders]);

  const searchResults = useMemo(() => {
    if (!search || search.length < 2) return null;
    const q = search.toLowerCase().replace(/\s/g, "");
    return orders.filter(o => o.name.toLowerCase().includes(q) || o.phone.includes(q) || String(o.ticketNum).includes(q) || `p${String(o.ticketNum).padStart(4,"0")}`.includes(q));
  }, [search, orders]);

  const clientResults = useMemo(() => {
    if (!clientPh || clientPh.length < 4) return [];
    const c = clientPh.replace(/\s/g, "");
    return orders.filter(o => o.phone.replace(/\s/g, "").includes(c));
  }, [clientPh, orders]);

  const exportCSV = () => {
    const h = "Ticket,Nombre,Telefono,Servicio,Minutos,Precio,Señal,Pagada,Notas,Entrega,Estado,AsignadoA,Origen,Creado\n";
    const r = orders.map(o => `${ticketCode(o.ticketNum)},"${(o.name||"").replace(/"/g,'""')}","${fmtPh(o.phone)}","${o.serviceName}",${o.mins},${o.price},${o.signal},${o.signalPaid?"Sí":"No"},"${(o.notes||"").replace(/"/g,'""')}",${o.deliveryDate},${gSt(o.status).label},${o.assignedTo||""},${o.source||"tienda"},${o.createdAt}`).join("\n");
    Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["\uFEFF"+h+r], {type:"text/csv;charset=utf-8"})), download: `taller-${today()}.csv` }).click();
    notify("CSV descargado");
  };

  // ═══ ENTRY ═══
  if (!mode) return (
    <div style={S.entryBg}>
      <div style={S.entryCard}>
        <div style={{fontSize:48,marginBottom:4}}>✂️</div>
        <h1 style={S.entryTitle}>Taller de Costura Express</h1>
        <p style={S.entrySub}>Gestión de pedidos</p>
        <div style={S.entryBlock}>
          <div style={S.blockLabel}>🔐 Administración</div>
          <div style={{display:"flex",gap:8}}>
            <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>{setPin(e.target.value);setPinErr(false)}} onKeyDown={e=>e.key==="Enter"&&(pin===config.pin?(setMode("admin"),setPinErr(false)):setPinErr(true))} placeholder="PIN" style={{...S.input,flex:1,textAlign:"center",letterSpacing:8,fontSize:"1.1rem",...(pinErr?{borderColor:"#ef4444"}:{})}} />
            <button onClick={()=>pin===config.pin?(setMode("admin"),setPinErr(false)):setPinErr(true)} style={S.btnP}>Entrar</button>
          </div>
          {pinErr&&<p style={{color:"#ef4444",fontSize:"0.72rem",marginTop:4}}>PIN incorrecto</p>}
        </div>
        <div style={S.divider}><span style={S.dividerTxt}>o</span></div>
        <button onClick={()=>setMode("client")} style={S.btnEntry}>🔍 Consultar estado de mi prenda</button>
      </div>
    </div>
  );

  // ═══ CLIENT ═══
  if (mode==="client") return (
    <div style={S.entryBg}>
      <div style={{...S.entryCard,maxWidth:460,padding:"24px 20px"}}>
        <button onClick={()=>{setMode(null);setClientPh("");setSearched(false)}} style={S.backBtn}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:36}}>🔍</div>
          <h2 style={{...S.entryTitle,fontSize:"1.2rem"}}>Consulta tu pedido</h2>
          <p style={{fontSize:"0.8rem",color:"#6b7280"}}>Introduce tu teléfono</p>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <input type="tel" value={clientPh} onChange={e=>{setClientPh(e.target.value);setSearched(false)}} onKeyDown={e=>e.key==="Enter"&&setSearched(true)} placeholder="612 345 678" style={{...S.input,flex:1,fontSize:"1rem"}} />
          <button onClick={()=>setSearched(true)} style={S.btnP}>Buscar</button>
        </div>
        {searched&&(clientResults.length===0?(<div style={S.empty}><span style={{fontSize:32}}>🤷</span><p style={{marginTop:8}}>No hay pedidos con ese teléfono</p></div>):clientResults.map(o=><ClientCard key={o.id} o={o} cfg={config}/>))}
      </div>
    </div>
  );

  // ═══ ADMIN ═══
  return (
    <div style={S.adminBg}>
      {toast&&<div style={S.toast}>{toast}</div>}
      <div style={S.topBar}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:"0.95rem"}}>✂️ Taller de Costura Express</div>
          <div style={{fontSize:"0.65rem",opacity:0.6}}>{inv.total} prendas · {todayCap.free}min libres hoy</div>
        </div>
        <button onClick={()=>{setMode(null);setPin("");setView("dash")}} style={S.logoutBtn}>Salir</button>
      </div>
      <div style={S.tabs}>
        {[{id:"dash",l:"🏠"},{id:"orders",l:"📋"},{id:"new",l:"➕"},{id:"calendar",l:"📅"},{id:"settings",l:"⚙️"}].map(t=>(<button key={t.id} onClick={()=>{setView(t.id);setEditing(null);setSearch("")}} style={{...S.tab,...(view===t.id?S.tabA:{})}}>{t.l}</button>))}
        <button onClick={exportCSV} style={S.tab}>📤</button>
      </div>
      <div style={S.content}>
        {/* DASHBOARD */}
        {view==="dash"&&<>
          <div style={S.card}>
            <div style={{fontSize:"0.7rem",fontWeight:600,color:"#6b7280",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>📍 En el taller</div>
            <div style={{display:"flex",gap:8,justifyContent:"space-between"}}>
              {[{n:inv.registrado,l:"Pendiente",c:"#9333ea",bg:"#f3e8ff"},{n:inv.confirmado,l:"En cola",c:"#2563eb",bg:"#dbeafe"},{n:inv.proceso,l:"Cosiendo",c:"#d97706",bg:"#fef3c7"},{n:inv.listo,l:"Listas",c:"#059669",bg:"#d1fae5"}].map(s=>(<div key={s.l} style={{flex:1,textAlign:"center",background:s.bg,borderRadius:12,padding:"10px 4px"}}><div style={{fontSize:"1.4rem",fontWeight:700,color:s.c}}>{s.n}</div><div style={{fontSize:"0.6rem",color:s.c,fontWeight:500}}>{s.l}</div></div>))}
            </div>
            <div style={{textAlign:"center",marginTop:8,fontSize:"0.8rem",fontWeight:600,color:"#0f2e47"}}>{inv.total} prendas</div>
          </div>
          {(alerts.length>0||inv.listo>0)&&<div style={{...S.card,background:"#fefce8",borderColor:"#fde68a"}}>
            <div style={{fontSize:"0.7rem",fontWeight:600,color:"#92400e",marginBottom:6,textTransform:"uppercase"}}>⚠️ Atención</div>
            {inv.listo>0&&<div style={{fontSize:"0.8rem",color:"#92400e",marginBottom:4}}>✅ {inv.listo} prenda{inv.listo>1?"s":""} lista{inv.listo>1?"s":""} para recoger</div>}
            {alerts.map((a,i)=>(<div key={i} style={{fontSize:"0.76rem",color:"#92400e",marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{a.type==="old"?"🔔":"💶"} {a.msg}</span>{a.type==="old"&&<button onClick={()=>waOpen(a.o.phone,waMsg.remind(a.o,config))} style={{...S.btnSm,background:"#fde68a",color:"#92400e",fontSize:"0.62rem"}}>Recordar</button>}</div>))}
          </div>}
          <div style={S.card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:"0.7rem",fontWeight:600,color:"#6b7280",textTransform:"uppercase"}}>📊 Capacidad hoy</div>
              <div style={{fontSize:"0.7rem",fontWeight:700,color:todayCap.light==="green"?"#059669":todayCap.light==="yellow"?"#d97706":"#dc2626"}}>{todayCap.light==="green"?"🟢 Aceptar":todayCap.light==="yellow"?"🟡 Casi lleno":"🔴 Lleno"}</div>
            </div>
            <CapBar pct={todayCap.pct} color={todayCap.light}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.73rem",color:"#6b7280",marginTop:6}}>
              <span>{todayCap.used}min usados</span>
              <span><strong style={{color:"#0f2e47"}}>{todayCap.free}min libres</strong></span>
            </div>
            <div style={{fontSize:"0.68rem",color:"#9ca3af",marginTop:2}}>≈ {Math.floor(todayCap.free/20)} bajos · {Math.floor(todayCap.free/35)} cremalleras</div>
          </div>
          <div style={S.card}>
            <div style={{fontSize:"0.7rem",fontWeight:600,color:"#6b7280",marginBottom:8,textTransform:"uppercase"}}>📅 Semana</div>
            {weekCaps.map(d=>{const closed=d.type==="closed";return(<div key={d.date} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,...(closed?{opacity:0.4}:{})}}>
              <span style={{width:60,fontSize:"0.7rem",fontWeight:d.date===today()?700:400,color:d.date===today()?"#0f2e47":"#6b7280"}}>{fmtDL(d.date).slice(0,6)}{d.date===today()?" ←":""}</span>
              {closed?<span style={{flex:1,fontSize:"0.65rem",color:"#dc2626"}}>Cerrado</span>:<><div style={{flex:1}}><CapBar pct={d.pct} color={d.light} h={6}/></div>
              <span style={{width:28,textAlign:"right",fontSize:"0.65rem",color:"#6b7280"}}>{d.pct}%</span></>}
              <span style={{fontSize:"0.68rem"}}>{closed?"🔴":d.type==="half"?"🟡":d.light==="green"?"🟢":d.light==="yellow"?"🟡":"🔴"}</span>
            </div>)})}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setView("new")} style={{...S.btnP,flex:1,padding:"14px 16px"}}>➕ Nuevo pedido</button>
            <button onClick={()=>setView("orders")} style={{...S.btnSec,flex:1,padding:"14px 16px"}}>📋 Ver pedidos</button>
          </div>
        </>}

        {/* ORDERS */}
        {view==="orders"&&!editing&&<>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar nombre, teléfono o ticket..." style={{...S.input,marginBottom:12,fontSize:"0.95rem",padding:"12px 16px"}}/>
          {search.length>=2&&searchResults!==null?
            (searchResults.length===0?<div style={S.empty}><p>Sin resultados</p></div>:<div>{searchResults.map(o=><AdminCard key={o.id} o={o} onAdvance={advanceStatus} onEdit={setEditing} onDelete={deleteOrder} onRemind={()=>waOpen(o.phone,waMsg.remind(o,config))} cfg={config}/>)}</div>)
            :<div>{orders.filter(o=>o.status!=="entregado").length===0?<div style={S.empty}><span style={{fontSize:36}}>📭</span><p style={{marginTop:8}}>Sin pedidos</p></div>:orders.filter(o=>o.status!=="entregado").map(o=><AdminCard key={o.id} o={o} onAdvance={advanceStatus} onEdit={setEditing} onDelete={deleteOrder} onRemind={()=>waOpen(o.phone,waMsg.remind(o,config))} cfg={config}/>)}</div>
          }
        </>}
        {view==="orders"&&editing&&<OrderForm key={editing.id} order={editing} config={config} orders={orders} onSave={updateOrder} onCancel={()=>setEditing(null)} isEdit/>}

        {/* NEW */}
        {view==="new"&&<OrderForm config={config} orders={orders} onSave={addOrder} onCancel={()=>setView("dash")}/>}

        {/* CALENDAR */}
        {view==="calendar"&&<CalendarView orders={orders} config={config} onBlockDay={(date,type)=>{
          const bd={...(config.blockedDays||{})};
          if(type===null||type==="normal") delete bd[date]; else bd[date]=type;
          const newCfg={...config,blockedDays:bd};
          setConfig(newCfg);
          notify(type==="closed"?"Dia cerrado":type==="half"?"Medio dia":"Dia normal");
        }}/>}

        {/* SETTINGS */}
        {view==="settings"&&<Settings config={config} onSave={c=>{setConfig(c);notify("Guardado")}}/>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// CAPACITY BAR
// ═══════════════════════════════════════════
function CapBar({pct,color,h=10}){
  const c=color==="green"?"#059669":color==="yellow"?"#d97706":"#dc2626";
  const bg=color==="green"?"#d1fae5":color==="yellow"?"#fef3c7":"#fee2e2";
  return <div style={{width:"100%",height:h,borderRadius:h/2,background:bg,overflow:"hidden"}}><div style={{width:`${Math.min(100,pct)}%`,height:"100%",borderRadius:h/2,background:c,transition:"width 0.4s"}}/></div>;
}

// ═══════════════════════════════════════════
// CLIENT CARD
// ═══════════════════════════════════════════
function ClientCard({o,cfg}){
  const st=gSt(o.status); const rest=Math.max(0,o.price-o.signal); const prog=STATUSES.findIndex(s=>s.id===o.status);
  return <div style={{background:"#f9fafb",borderRadius:16,padding:16,border:"1px solid #e5e7eb",marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
      <div><div style={{fontSize:"0.68rem",color:"#9ca3af",fontWeight:500}}>{ticketCode(o.ticketNum)}</div><div style={{fontWeight:600,fontSize:"0.95rem"}}>{o.serviceIcon} {o.serviceName}</div>{o.notes&&<div style={{fontSize:"0.7rem",color:"#6b7280",marginTop:2}}>{o.notes}</div>}</div>
      <span style={{...S.badge,background:st.bg,color:st.color}}>{st.icon} {st.label}</span>
    </div>
    <div style={{display:"flex",gap:3,marginBottom:10}}>{STATUSES.map((s,i)=><div key={s.id} style={{flex:1,height:5,borderRadius:3,background:i<=prog?st.color:"#e5e7eb",transition:"background 0.3s"}}/>)}</div>
    <div style={{display:"flex",gap:14,fontSize:"0.73rem",color:"#6b7280",flexWrap:"wrap"}}><span>📅 {fmtD(o.deliveryDate)}</span><span>💰 {o.price}€</span>{o.signalPaid&&<span>💶 {o.signal}€ ✅</span>}{rest>0&&<span>🔄 Resto: {rest}€</span>}</div>
    {o.status==="registrado"&&!o.signalPaid&&<div style={{...S.banner,background:"#f3e8ff",color:"#6b21a8"}}>📝 Envía {o.signal}€ por Bizum al <strong>{cfg.bizum}</strong> con tu nombre.</div>}
    {o.status==="listo"&&<div style={{...S.banner,background:"#d1fae5",color:"#065f46"}}>✅ ¡Lista! Recógela en {cfg.address}. {rest>0?`Resto: ${rest}€`:""}</div>}
    {o.status==="entregado"&&<div style={{...S.banner,background:"#f3f4f6",color:"#374151"}}>🤝 Entregado. ¡Gracias!</div>}
  </div>;
}

// ═══════════════════════════════════════════
// ADMIN CARD
// ═══════════════════════════════════════════
function AdminCard({o,onAdvance,onEdit,onDelete,onRemind,cfg}){
  const st=gSt(o.status); const idx=STATUSES.findIndex(s=>s.id===o.status); const next=STATUSES[idx+1]; const tkt=ticketCode(o.ticketNum);
  return <div style={{background:"#fff",borderRadius:14,padding:"14px 14px 12px",border:"1px solid #e5e7eb",borderLeft:`4px solid ${st.color}`,marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div style={{flex:1}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:"0.92rem"}}>{o.name}</span><span style={{fontSize:"0.6rem",color:"#9ca3af",fontWeight:600}}>{tkt}</span>{o.assignedTo&&<span style={{fontSize:"0.56rem",background:"#e0e7ff",color:"#4338ca",padding:"1px 5px",borderRadius:4,fontWeight:600}}>{o.assignedTo}</span>}</div>
        <div style={{fontSize:"0.7rem",color:"#6b7280",marginTop:2}}>📞 <a href={`tel:${o.phone}`} style={{color:"#1d5a8a"}}>{fmtPh(o.phone)}</a></div>
      </div>
      <span style={{...S.badge,background:st.bg,color:st.color}}>{st.icon} {st.label}</span>
    </div>
    <div style={{display:"flex",gap:8,marginTop:8,fontSize:"0.7rem",color:"#6b7280",flexWrap:"wrap"}}><span>{o.serviceIcon} {o.serviceName}</span><span>⏱{o.mins}m</span><span>📅{fmtD(o.deliveryDate)}</span><span>💰{o.price}€</span><span>{o.signalPaid?"💶✅":"💶❌"}</span></div>
    {o.notes&&<div style={{fontSize:"0.66rem",color:"#9ca3af",marginTop:4,fontStyle:"italic"}}>"{o.notes}"</div>}
    <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
      {next&&<button onClick={()=>onAdvance(o.id)} style={{...S.btnSm,background:next.bg,color:next.color,fontWeight:600,padding:"8px 12px",minHeight:40}}>{next.icon} → {next.label}{next.id==="listo"?" +WA":""}</button>}
      {o.status==="listo"&&<button onClick={onRemind} style={{...S.btnSm,background:"#fef3c7",color:"#92400e",minHeight:40}}>📲</button>}
      <button onClick={()=>onEdit(o)} style={{...S.btnSm,background:"#f3f4f6",minHeight:40}}>✏️</button>
      <button onClick={()=>onDelete(o.id)} style={{...S.btnSm,background:"#fef2f2",color:"#dc2626",minHeight:40}}>🗑</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════
// ORDER FORM
// ═══════════════════════════════════════════
function OrderForm({order,config,orders,onSave,onCancel,isEdit}){
  const [name,setName]=useState(order?.name||"");
  const [phone,setPhone]=useState(order?.phone?fmtPh(order.phone):"");
  const [svcId,setSvcId]=useState(order?.serviceId||(order?.serviceName?config.services.find(s=>s.name===order?.serviceName)?.id:"bajos")||"bajos");
  const [price,setPrice]=useState(order?.price?.toString()||"");
  const [mins,setMins]=useState(order?.mins?.toString()||"");
  const [notes,setNotes]=useState(order?.notes||"");
  const [dd,setDD]=useState(order?.deliveryDate||"");
  const [paid,setPaid]=useState(order?.signalPaid||false);
  const [assignee,setAssignee]=useState(order?.assignedTo||"");

  const svc=config.services.find(s=>s.id===svcId)||config.services[0];
  useEffect(()=>{if(!isEdit){if(svc.price>0)setPrice(svc.price.toString());setMins(svc.mins.toString());if(!dd)setDD(findSlot(svc.mins,orders,config))}},[svcId]);

  const signal=Math.ceil((parseFloat(price)||0)*(config.signalPct/100));
  const slotCap=dd?calcDayCap(dd,orders,config):null;

  return <div style={S.card}>
    <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:14}}>{isEdit?`✏️ ${order?.ticketNum?ticketCode(order.ticketNum):"Editar"}`:"➕ Nuevo pedido"}</h2>
    <label style={S.label}>Nombre *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Pedro García" style={S.input}/>
    <label style={S.label}>Teléfono *</label><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="612 345 678" style={{...S.input,fontSize:"1rem"}}/>
    <label style={S.label}>Servicio</label>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>{config.services.map(s=><button key={s.id} onClick={()=>setSvcId(s.id)} style={{...S.svcBtn,...(svcId===s.id?S.svcBtnA:{}),minHeight:48}}><span style={{fontWeight:600,fontSize:"0.76rem"}}>{s.icon} {s.name}</span><span style={{fontSize:"0.6rem",opacity:0.7}}>{s.price>0?s.price+"€":"?"} · {s.mins}m</span></button>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
      <div><label style={S.label}>Precio €</label><input type="number" value={price} onChange={e=>setPrice(e.target.value)} style={S.input}/></div>
      <div><label style={S.label}>Minutos</label><input type="number" value={mins} onChange={e=>setMins(e.target.value)} style={S.input}/></div>
    </div>
    {parseFloat(price)>0&&<div style={{background:"#fefce8",border:"1px solid #fde68a",borderRadius:10,padding:10,marginTop:10,fontSize:"0.76rem"}}>
      <div style={{display:"flex",justifyContent:"space-between"}}><span>Señal ({config.signalPct}%):</span><strong>{signal}€</strong></div>
      <div style={{display:"flex",justifyContent:"space-between"}}><span>Al recoger:</span><strong>{(parseFloat(price)||0)-signal}€</strong></div>
    </div>}
    {!isEdit&&<label style={{display:"flex",alignItems:"center",gap:8,marginTop:10,fontSize:"0.82rem",cursor:"pointer"}}><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)} style={{width:20,height:20,accentColor:"#059669"}}/><span>💶 Señal pagada ({signal}€)</span></label>}
    <label style={S.label}>Entrega *</label><input type="date" value={dd} onChange={e=>setDD(e.target.value)} min={today()} style={S.input}/>
    {slotCap&&<div style={{fontSize:"0.7rem",marginTop:4,color:slotCap.light==="green"?"#059669":slotCap.light==="yellow"?"#d97706":"#dc2626"}}>{slotCap.light==="green"?"🟢":slotCap.light==="yellow"?"🟡":"🔴"} {fmtDL(dd)}: {slotCap.pct}% · {slotCap.free}min libres</div>}
    <label style={S.label}>Asignar a</label>
    <div style={{display:"flex",gap:6}}><button onClick={()=>setAssignee("")} style={{...S.fBtn,...(assignee===""?S.fBtnA:{})}}>Nadie</button>{config.workers.filter(w=>w.active).map(w=><button key={w.id} onClick={()=>setAssignee(w.name)} style={{...S.fBtn,...(assignee===w.name?S.fBtnA:{})}}>{w.name}</button>)}</div>
    <label style={S.label}>Notas</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Pantalón gris, tela fina..." style={{...S.input,resize:"vertical"}}/>
    <div style={{display:"flex",gap:8,marginTop:16}}>
      <button onClick={()=>{if(!name.trim()||!phone.trim()||!dd)return;onSave({...(order||{}),name:name.trim(),phone:cleanPh(phone),serviceId:svcId,price:parseFloat(price)||0,mins:parseInt(mins)||30,notes:notes.trim(),deliveryDate:dd,signalPaid:paid,assignedTo:assignee||null,source:"tienda"})}} disabled={!name.trim()||!phone.trim()||!dd} style={{...S.btnP,flex:1,padding:"14px 16px",opacity:(!name.trim()||!phone.trim()||!dd)?0.5:1}}>{isEdit?"Guardar":"Registrar + WhatsApp"}</button>
      <button onClick={onCancel} style={S.btnSec}>Cancelar</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════
function CalendarView({orders,config,onBlockDay}){
  const [wo,setWo]=useState(0);
  const days=useMemo(()=>{const s=new Date();s.setDate(s.getDate()-s.getDay()+1+wo*7);return Array.from({length:7},(_,i)=>{const d=new Date(s);d.setDate(d.getDate()+i);return d.toISOString().split("T")[0]}).filter(d=>!isSunday(d))},[wo]);
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><button onClick={()=>setWo(w=>w-1)} style={S.btnSm}>←</button><button onClick={()=>setWo(0)} style={{...S.btnSm,fontWeight:600}}>Esta semana</button><button onClick={()=>setWo(w=>w+1)} style={S.btnSm}>→</button></div>
    <p style={{fontSize:"0.65rem",color:"#9ca3af",marginBottom:10}}>Pulsa el estado de cada dia para cambiarlo: normal / medio dia / cerrado</p>
    {days.map(date=>{const cap=calcDayCap(date,orders,config);const dayO=orders.filter(o=>o.deliveryDate===date&&o.status!=="entregado");const isT=date===today();const type=cap.type||getDayType(date,config);
    const isClosed=type==="closed";
    return <div key={date} style={{...S.card,marginBottom:8,...(isT?{borderColor:"#1d5a8a",boxShadow:"0 0 0 1px #1d5a8a"}:{}), ...(isClosed?{opacity:0.6,background:"#f9fafb"}:{})}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontWeight:600,fontSize:"0.85rem"}}>{fmtDL(date)}{isT&&<span style={{marginLeft:6,fontSize:"0.56rem",fontWeight:700,background:"#1d5a8a",color:"#fff",padding:"2px 6px",borderRadius:4}}>HOY</span>}</span>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {!isClosed&&<span style={{fontSize:"0.66rem"}}>{cap.light==="green"?"🟢":cap.light==="yellow"?"🟡":"🔴"} {cap.pct}%</span>}
          <button onClick={()=>{
            const next=type==="closed"?"normal":type==="half"?"closed":"half";
            onBlockDay(date,next==="normal"?null:next);
          }} style={{...S.btnSm,fontSize:"0.6rem",padding:"3px 8px",minHeight:28,background:type==="closed"?"#fee2e2":type==="half"?"#fef3c7":"#d1fae5",color:type==="closed"?"#dc2626":type==="half"?"#d97706":"#059669"}}>
            {type==="closed"?"🔴 Cerrado":type==="half"?"🟡 Medio dia":"🟢 Normal"}
          </button>
        </div>
      </div>
      {!isClosed&&<><CapBar pct={cap.pct} color={cap.light} h={6}/>
      <div style={{fontSize:"0.66rem",color:"#9ca3af",marginTop:4}}>{cap.free}min libres · {dayO.length} pedido{dayO.length!==1?"s":""}</div>
      {dayO.length>0&&<div style={{marginTop:6}}>{dayO.map(o=>{const st=gSt(o.status);return <div key={o.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:"0.73rem",padding:"4px 0",borderTop:"1px solid #f3f4f6"}}><span style={{width:7,height:7,borderRadius:"50%",background:st.color,flexShrink:0}}/><span style={{flex:1}}><strong>{o.name}</strong> — {o.serviceName} ({o.mins}m)</span><span style={{color:st.color,fontSize:"0.6rem",fontWeight:600}}>{st.label}</span></div>})}</div>}
      </>}
      {isClosed&&<div style={{fontSize:"0.75rem",color:"#dc2626",marginTop:4}}>No se trabaja este dia</div>}
    </div>})}
  </div>;
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
function Settings({config,onSave}){
  const [workers,setWorkers]=useState(config.workers);
  const [services,setServices]=useState(config.services);
  const [signalPct,setSignalPct]=useState(config.signalPct);
  const [tab,setTab]=useState("services");

  const toggleW=(id)=>setWorkers(w=>w.map(x=>x.id===id?{...x,active:!x.active}:x));
  const setWField=(id,f,v)=>setWorkers(w=>w.map(x=>x.id===id?{...x,[f]:f==="name"?v:(parseInt(v)||0)}:x));

  const setSvcField=(id,f,v)=>setServices(s=>s.map(x=>x.id===id?{...x,[f]:["price","mins"].includes(f)?(parseFloat(v)||0):v}:x));
  const addService=()=>{
    const id="svc_"+Date.now().toString(36);
    setServices(s=>[...s,{id,name:"Nuevo servicio",icon:"🧵",price:0,mins:30,minDays:1}]);
  };
  const removeService=(id)=>setServices(s=>s.filter(x=>x.id!==id));

  return <div>
    {/* Tabs */}
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {[{id:"services",l:"🧵 Servicios y precios"},{id:"workers",l:"👥 Equipo"},{id:"other",l:"⚙️ Otros"}].map(t2=>(
        <button key={t2.id} onClick={()=>setTab(t2.id)} style={{...S.fBtn,...(tab===t2.id?S.fBtnA:{})}}>{t2.l}</button>
      ))}
    </div>

    {/* SERVICES TAB */}
    {tab==="services"&&<div style={S.card}>
      <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:4}}>Servicios y precios</h2>
      <p style={{fontSize:"0.68rem",color:"#9ca3af",marginBottom:14}}>Edita precios, tiempos o crea servicios nuevos</p>
      {services.map((s,i)=>(
        <div key={s.id} style={{background:"#f9fafb",borderRadius:12,padding:12,marginBottom:8,border:"1px solid #e5e7eb"}}>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            <input value={s.icon} onChange={e=>setSvcField(s.id,"icon",e.target.value)} style={{...S.input,width:44,textAlign:"center",fontSize:"1.1rem",padding:"6px"}} maxLength={2}/>
            <input value={s.name} onChange={e=>setSvcField(s.id,"name",e.target.value)} style={{...S.input,flex:1,fontWeight:600}}/>
            {services.length>1&&<button onClick={()=>removeService(s.id)} style={{...S.btnSm,background:"#fef2f2",color:"#dc2626",minHeight:38}}>🗑</button>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div>
              <div style={{fontSize:"0.6rem",color:"#6b7280"}}>Precio (EUR)</div>
              <input type="number" value={s.price} onChange={e=>setSvcField(s.id,"price",e.target.value)} style={S.input}/>
            </div>
            <div>
              <div style={{fontSize:"0.6rem",color:"#6b7280"}}>Minutos</div>
              <input type="number" value={s.mins} onChange={e=>setSvcField(s.id,"mins",e.target.value)} style={S.input}/>
            </div>
            <div>
              <div style={{fontSize:"0.6rem",color:"#6b7280"}}>Dias min.</div>
              <input type="number" value={s.minDays||0} onChange={e=>setSvcField(s.id,"minDays",e.target.value)} style={S.input}/>
            </div>
          </div>
        </div>
      ))}
      <button onClick={addService} style={{...S.btnSec,width:"100%",marginTop:8,padding:"12px 16px"}}>+ Nuevo servicio</button>
    </div>}

    {/* WORKERS TAB */}
    {tab==="workers"&&<div style={S.card}>
      <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:4}}>Equipo de trabajo</h2>
      <p style={{fontSize:"0.68rem",color:"#9ca3af",marginBottom:14}}>Activa o desactiva personas y ajusta sus horas</p>
      {workers.map(w=><div key={w.id} style={{background:w.active?"#f0fdf4":"#f9fafb",borderRadius:12,padding:12,marginBottom:8,border:"1px solid "+(w.active?"#86efac":"#e5e7eb")}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:w.active?8:0}}><input type="checkbox" checked={w.active} onChange={()=>toggleW(w.id)} style={{width:18,height:18,accentColor:"#059669"}}/><input value={w.name} onChange={e=>setWField(w.id,"name",e.target.value)} style={{...S.input,flex:1,fontWeight:600}}/></div>
        {w.active&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><div><div style={{fontSize:"0.63rem",color:"#6b7280"}}>Min/dia L-V</div><input type="number" value={w.minPerDay} onChange={e=>setWField(w.id,"minPerDay",e.target.value)} style={S.input}/></div><div><div style={{fontSize:"0.63rem",color:"#6b7280"}}>Min/sabado</div><input type="number" value={w.minSat} onChange={e=>setWField(w.id,"minSat",e.target.value)} style={S.input}/></div></div>}
      </div>)}
      <p style={{fontSize:"0.66rem",color:"#9ca3af",marginTop:4}}>Total L-V: {workers.filter(w=>w.active).reduce((s,w)=>s+w.minPerDay,0)}min ({Math.floor(workers.filter(w=>w.active).reduce((s,w)=>s+w.minPerDay,0)/60)}h)</p>
    </div>}

    {/* OTHER TAB */}
    {tab==="other"&&<div style={S.card}>
      <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:14}}>Otros ajustes</h2>
      <label style={S.label}>Senal por adelantado (%)</label>
      <input type="number" value={signalPct} onChange={e=>setSignalPct(parseInt(e.target.value)||0)} style={{...S.input,width:100}}/>
    </div>}

    {/* SAVE */}
    <button onClick={()=>onSave({...config,workers,services,signalPct})} style={{...S.btnP,width:"100%",marginTop:12,padding:"14px 16px"}}>Guardar todo</button>
  </div>;
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════
const S={
  entryBg:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"linear-gradient(145deg,#0f2e47,#1d5a8a)"},
  entryCard:{background:"#fff",borderRadius:24,padding:"32px 24px",maxWidth:380,width:"100%",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"},
  entryTitle:{fontFamily:"Georgia,serif",fontSize:"1.4rem",color:"#0f2e47",margin:0},
  entrySub:{fontSize:"0.8rem",color:"#6b7280",marginTop:4,marginBottom:20},
  entryBlock:{textAlign:"left"},blockLabel:{fontSize:"0.72rem",fontWeight:600,color:"#374151",marginBottom:8},
  divider:{textAlign:"center",margin:"18px 0",borderTop:"1px solid #e5e7eb"},dividerTxt:{background:"#fff",padding:"0 10px",position:"relative",top:-10,color:"#9ca3af",fontSize:"0.75rem"},
  backBtn:{background:"none",border:"none",color:"#1d5a8a",fontWeight:600,fontSize:"0.82rem",padding:0,cursor:"pointer",marginBottom:10,fontFamily:"inherit"},
  btnEntry:{width:"100%",background:"#f0f5fa",color:"#1d5a8a",fontWeight:600,fontSize:"0.85rem",padding:"14px 20px",borderRadius:12,border:"1.5px solid #b8cfe6",cursor:"pointer",fontFamily:"inherit"},
  adminBg:{minHeight:"100vh",background:"#f3f4f6",fontFamily:"system-ui,-apple-system,sans-serif"},
  topBar:{position:"sticky",top:0,zIndex:20,background:"#0f2e47",color:"#fff",padding:"10px 16px",display:"flex",alignItems:"center"},
  logoutBtn:{background:"rgba(255,255,255,0.12)",color:"#fff",fontSize:"0.72rem",fontWeight:500,padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit"},
  tabs:{display:"flex",background:"#fff",borderBottom:"1px solid #e5e7eb"},
  tab:{flex:1,padding:"11px 8px",fontSize:"0.85rem",fontWeight:500,color:"#6b7280",background:"none",borderBottom:"2px solid transparent",cursor:"pointer",fontFamily:"inherit",border:"none",textAlign:"center"},
  tabA:{color:"#1d5a8a",borderBottom:"2px solid #1d5a8a",fontWeight:600},
  content:{padding:12,maxWidth:520,margin:"0 auto"},
  card:{background:"#fff",borderRadius:14,padding:16,border:"1px solid #e5e7eb",marginBottom:12},
  badge:{fontSize:"0.64rem",fontWeight:600,padding:"3px 8px",borderRadius:999,whiteSpace:"nowrap"},
  banner:{marginTop:10,padding:"10px 12px",borderRadius:10,fontSize:"0.76rem",fontWeight:500,lineHeight:1.5},
  label:{display:"block",fontSize:"0.72rem",fontWeight:600,color:"#374151",marginBottom:4,marginTop:10},
  input:{width:"100%",padding:"10px 12px",border:"1.5px solid #d1d5db",borderRadius:10,fontSize:"0.88rem",fontFamily:"inherit",outline:"none",background:"#fff",boxSizing:"border-box"},
  svcBtn:{display:"flex",flexDirection:"column",gap:2,padding:"8px 10px",borderRadius:10,border:"1.5px solid #e5e7eb",background:"#f9fafb",textAlign:"left",cursor:"pointer",fontFamily:"inherit"},
  svcBtnA:{borderColor:"#1d5a8a",background:"#dae6f2"},
  fBtn:{padding:"6px 10px",fontSize:"0.72rem",fontWeight:500,borderRadius:8,background:"#fff",color:"#6b7280",border:"1px solid #e5e7eb",cursor:"pointer",fontFamily:"inherit"},
  fBtnA:{background:"#1d5a8a",color:"#fff",borderColor:"#1d5a8a"},
  btnP:{background:"#1d5a8a",color:"#fff",fontWeight:600,fontSize:"0.85rem",padding:"10px 18px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit"},
  btnSec:{background:"#f3f4f6",color:"#374151",fontWeight:500,fontSize:"0.85rem",padding:"10px 18px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit"},
  btnSm:{padding:"6px 10px",fontSize:"0.72rem",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",background:"#e5e7eb",color:"#374151"},
  empty:{textAlign:"center",padding:"32px 20px",color:"#6b7280",fontSize:"0.85rem"},
  toast:{position:"fixed",top:54,left:"50%",transform:"translateX(-50%)",background:"#0f2e47",color:"#fff",padding:"8px 18px",borderRadius:10,fontSize:"0.78rem",fontWeight:500,zIndex:100,boxShadow:"0 8px 24px rgba(0,0,0,0.25)"},
};
