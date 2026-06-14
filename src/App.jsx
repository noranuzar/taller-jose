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
  blockedDays: {
    "2026-01-01":"closed","2026-01-06":"closed",
    "2026-04-02":"closed","2026-04-03":"closed",
    "2026-05-01":"closed","2026-05-02":"closed",
    "2026-05-15":"closed","2026-08-15":"closed",
    "2026-10-12":"closed","2026-11-02":"closed",
    "2026-11-09":"closed","2026-12-07":"closed",
    "2026-12-08":"closed","2026-12-25":"closed"
  },
  workers: [
    { id: "leonel", name: "Leonel", active: true, minPerDay: 450, minSat: 240 },
    { id: "mileydi", name: "Mileydi", active: true, minPerDay: 420, minSat: 240 },
    { id: "ayudante", name: "Ayudante", active: false, minPerDay: 300, minSat: 0 },
  ],
  services: [
    { id: "bajos", name: "Bajos de pantalon", icon: "👖", price: 8, mins: 20, minDays: 0 },
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
const fmtPh = (p) => (p||"").replace(/^34/, "").replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
const cleanPh = (p) => { let c = p.replace(/[\s\-()]/g, "").replace(/^\+?34/, "34"); return c.startsWith("34") ? c : "34" + c; };
const isSaturday = (d) => new Date(d + "T12:00:00").getDay() === 6;
const isSunday = (d) => new Date(d + "T12:00:00").getDay() === 0;
const tkt = (n) => "P-" + String(n).padStart(4, "0");

const STATUSES = [
  { id: "registrado", label: "Registrado", color: "#9333ea", bg: "#f3e8ff", icon: "📝" },
  { id: "confirmado", label: "Confirmado", color: "#2563eb", bg: "#dbeafe", icon: "📥" },
  { id: "proceso", label: "En proceso", color: "#d97706", bg: "#fef3c7", icon: "✂️" },
  { id: "listo", label: "Listo", color: "#059669", bg: "#d1fae5", icon: "✅" },
  { id: "entregado", label: "Entregado", color: "#6b7280", bg: "#f3f4f6", icon: "🤝" },
];
const gSt = (id) => STATUSES.find(s => s.id === id) || STATUSES[0];

// ═══════════════════════════════════════════
// VERSICULO Y SALUDO
// ═══════════════════════════════════════════
const VERSES = [
  { text: "El trabajo de tus manos comeras; bienaventurado seras", ref: "Salmos 128:2" },
  { text: "Encomienda al Senor tus obras y tus planes se estableceran", ref: "Proverbios 16:3" },
  { text: "Todo lo puedo en Cristo que me fortalece", ref: "Filipenses 4:13" },
  { text: "Haz todo como para el Senor", ref: "Colosenses 3:23" },
  { text: "No te dejare ni te desamparare", ref: "Hebreos 13:5" },
  { text: "Porque yo se los planes que tengo para ustedes, planes de bienestar", ref: "Jeremias 29:11" },
  { text: "Esfuerzate y se valiente, no temas", ref: "Josue 1:9" },
  { text: "El Senor es mi pastor, nada me faltara", ref: "Salmos 23:1" },
  { text: "Mira que te mando que te esfuerces y seas valiente", ref: "Josue 1:9" },
  { text: "Pon en manos del Senor todas tus obras y tus proyectos se cumpliran", ref: "Proverbios 16:3" },
  { text: "Sean satisfechas las obras de tus manos", ref: "Deuteronomio 33:11" },
  { text: "Dios es nuestro refugio y fortaleza, nuestro pronto auxilio", ref: "Salmos 46:1" },
  { text: "Con Dios haremos proezas", ref: "Salmos 60:12" },
  { text: "El que comenzo en ustedes la buena obra la perfeccionara", ref: "Filipenses 1:6" },
];
const getVerse = () => { const d = Math.floor(Date.now() / 86400000); return VERSES[d % VERSES.length]; };
const getGreeting = () => { const h = new Date().getHours(); return h < 14 ? "Buenos dias" : "Buenas tardes"; };
const getNextWorkday = (config) => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  for (let i = 0; i < 14; i++) {
    const ds = d.toISOString().split("T")[0];
    if (getDayType(ds, config) !== "closed") return ds;
    d.setDate(d.getDate() + 1);
  }
  return null;
};

// ═══════════════════════════════════════════
// CAPACITY ENGINE
// ═══════════════════════════════════════════
function getDayType(date, config) {
  const bd = config.blockedDays || {};
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
  const mult = type === "half" ? 0.5 : 1;
  const total = Math.round(config.workers.filter(w => w.active).reduce((s, w) => s + (sat ? w.minSat : w.minPerDay), 0) * mult);
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
    if (getDayType(ds, config) !== "closed" && calcDayCap(ds, orders, config).free >= mins) return ds;
    d.setDate(d.getDate() + 1);
  }
  return today();
}

// ═══════════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════════
const waOpen = (phone, msg) => window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
function waBatchRegister(items, name, totalPrice, signalAmount, cfg) {
  const pending = totalPrice - signalAmount;
  let msg = "Hola " + name + ", tus prendas estan registradas en el Taller de Costura Express.\n\n";
  items.forEach(o => { msg += tkt(o.ticketNum) + " " + o.serviceName + " - entrega " + fmtD(o.deliveryDate) + "\n"; });
  msg += "\nTotal: " + totalPrice + "E\n";
  if (signalAmount > 0) msg += "Pagado: " + signalAmount + "E\n";
  if (pending > 0) msg += "Pendiente a la entrega: " + pending + "E\n";
  msg += "\n" + cfg.address + "\nCuando " + (items.length > 1 ? "esten listas" : "este lista") + " te avisamos por aqui.";
  return msg;
}
function waReady(o, cfg) {
  return "Hola " + o.name + ", tu prenda esta lista!\n\n" + tkt(o.ticketNum) + " " + o.serviceName + "\nRecogela en " + cfg.address + "\nL-V 10-14h y 17-20:30h, Sab 10-14h";
}
function waAllReady(name, items, cfg) {
  let msg = "Hola " + name + ", todas tus prendas estan listas!\n\n";
  items.forEach(o => { msg += tkt(o.ticketNum) + " " + o.serviceName + "\n"; });
  msg += "\nRecogelas en " + cfg.address;
  return msg;
}
function waRemind(o, cfg) {
  return "Hola " + o.name + ", tu prenda (" + o.serviceName + ") lleva esperandote.\n" + tkt(o.ticketNum) + "\n" + cfg.address + "\nCuando pasas a recogerla?";
}

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
  useEffect(() => { if (loaded) saveAllOrders(orders); }, [orders, loaded]);
  useEffect(() => { if (loaded) saveConfig(config); }, [config, loaded]);
  useEffect(() => { if (loaded) saveTicket(ticketCounter); }, [ticketCounter, loaded]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);
  const notify = (m) => setToast(m);

  // Add batch of orders
  const addBatch = useCallback((clientName, clientPhone, garments, signalAmount) => {
    const batchId = uid();
    const totalPrice = garments.reduce((s, g) => s + (g.price || 0), 0);
    const pending = totalPrice - signalAmount;
    let counter = ticketCounter;
    const newOrders = garments.map((g, i) => {
      counter++;
      const svc = config.services.find(s => s.id === g.serviceId) || config.services[6];
      return {
        id: uid(), ticketNum: counter, batchId,
        name: clientName, phone: clientPhone,
        serviceId: g.serviceId, serviceName: svc.name, serviceIcon: svc.icon,
        price: g.price || svc.price, signal: i === 0 ? signalAmount : 0,
        batchSignal: signalAmount, batchTotal: totalPrice,
        mins: g.mins || svc.mins, notes: g.notes || "",
        deliveryDate: g.deliveryDate,
        signalPaid: signalAmount > 0,
        status: signalAmount > 0 ? "confirmado" : "registrado",
        source: "tienda", assignedTo: g.assignedTo || null,
        createdAt: new Date().toISOString(),
      };
    });
    setTicketCounter(counter);
    setOrders(p => [...newOrders, ...p]);
    notify(newOrders.length + " prenda" + (newOrders.length > 1 ? "s" : "") + " registrada" + (newOrders.length > 1 ? "s" : ""));
    waOpen(clientPhone, waBatchRegister(newOrders, clientName, totalPrice, signalAmount, config));
    setView("dash");
  }, [ticketCounter, config]);

  const updateOrder = (o) => { setOrders(p => p.map(x => x.id === o.id ? o : x)); setEditing(null); notify("Actualizado"); };

  const advanceStatus = useCallback((oid) => {
    let label = "";
    setOrders(prev => prev.map(o => {
      if (o.id !== oid) return o;
      const idx = STATUSES.findIndex(s => s.id === o.status);
      const next = STATUSES[idx + 1];
      if (!next) return o;
      label = next.label;
      if (next.id === "listo") {
        setTimeout(() => {
          // Check if all batch items are now ready
          const batchItems = prev.filter(x => x.batchId === o.batchId && x.id !== o.id);
          const allOthersReady = batchItems.every(x => ["listo","entregado"].includes(x.status));
          if (allOthersReady && batchItems.length > 0) {
            waOpen(o.phone, waAllReady(o.name, [...batchItems, o], config));
          } else {
            waOpen(o.phone, waReady(o, config));
          }
        }, 100);
      }
      return { ...o, status: next.id };
    }));
    if (label) notify("-> " + label);
  }, [config, orders]);

  const deleteOrder = (oid) => { if (confirm("Eliminar?")) { setOrders(p => p.filter(x => x.id !== oid)); deleteOrderDb(oid); notify("Eliminado"); } };

  // Computed
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
      if (o.status === "listo") { const d = Math.floor((now - new Date(o.createdAt).getTime()) / 86400000); if (d > 5) a.push({ type: "old", o, msg: tkt(o.ticketNum) + " " + o.name + " - lista hace " + d + " dias" }); }
      if (o.status === "registrado" && !o.signalPaid) { const h = (now - new Date(o.createdAt).getTime()) / 3600000; if (h > 48) a.push({ type: "signal", o, msg: tkt(o.ticketNum) + " " + o.name + " - senal pendiente" }); }
    });
    return a;
  }, [orders]);

  // Group orders by batch for display
  const groupedOrders = useMemo(() => {
    const active = orders.filter(o => o.status !== "entregado");
    const groups = {};
    active.forEach(o => {
      const key = o.batchId || o.id;
      if (!groups[key]) groups[key] = { name: o.name, phone: o.phone, batchId: key, items: [], totalPrice: 0, batchSignal: o.batchSignal || o.signal, signalPaid: o.signalPaid };
      groups[key].items.push(o);
      groups[key].totalPrice += o.price || 0;
      if (o.signalPaid) groups[key].signalPaid = true;
    });
    return Object.values(groups).sort((a, b) => new Date(b.items[0].createdAt) - new Date(a.items[0].createdAt));
  }, [orders]);

  const searchResults = useMemo(() => {
    if (!search || search.length < 2) return null;
    const q = search.toLowerCase().replace(/\s/g, "");
    const matched = orders.filter(o => o.name.toLowerCase().includes(q) || o.phone.includes(q) || String(o.ticketNum).includes(q));
    // Group matched
    const groups = {};
    matched.forEach(o => {
      const key = o.batchId || o.id;
      if (!groups[key]) groups[key] = { name: o.name, phone: o.phone, batchId: key, items: [], totalPrice: 0, batchSignal: o.batchSignal || o.signal, signalPaid: o.signalPaid };
      groups[key].items.push(o);
      groups[key].totalPrice += o.price || 0;
    });
    return Object.values(groups);
  }, [search, orders]);

  const clientResults = useMemo(() => {
    if (!clientPh || clientPh.length < 4) return [];
    const c = clientPh.replace(/\s/g, "");
    const matched = orders.filter(o => o.phone.replace(/\s/g, "").includes(c));
    const groups = {};
    matched.forEach(o => {
      const key = o.batchId || o.id;
      if (!groups[key]) groups[key] = { name: o.name, phone: o.phone, items: [], totalPrice: 0, batchSignal: o.batchSignal || o.signal, signalPaid: o.signalPaid };
      groups[key].items.push(o);
      groups[key].totalPrice += o.price || 0;
    });
    return Object.values(groups);
  }, [clientPh, orders]);

  const exportCSV = () => {
    const h = "Ticket,Lote,Nombre,Telefono,Servicio,Minutos,Precio,Notas,Entrega,Estado,AsignadoA,Origen,Creado\n";
    const r = orders.map(o => tkt(o.ticketNum) + "," + (o.batchId||"") + ',"' + (o.name||"").replace(/"/g,'""') + '","' + fmtPh(o.phone) + '","' + o.serviceName + '",' + o.mins + "," + o.price + ',"' + (o.notes||"").replace(/"/g,'""') + '",' + o.deliveryDate + "," + gSt(o.status).label + "," + (o.assignedTo||"") + "," + (o.source||"tienda") + "," + o.createdAt).join("\n");
    Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["\uFEFF"+h+r], {type:"text/csv;charset=utf-8"})), download: "taller-"+today()+".csv" }).click();
    notify("CSV descargado");
  };

  // ═══ ENTRY ═══
  if (!mode) return (
    <div style={S.entryBg}><div style={S.entryCard}>
      <div style={{fontSize:48,marginBottom:4}}>✂️</div>
      <h1 style={S.title}>Taller de Costura Express</h1>
      <p style={S.sub}>Gestion de pedidos</p>
      <div style={{textAlign:"left",marginBottom:16}}>
        <div style={S.blockLabel}>Administracion</div>
        <div style={{display:"flex",gap:8}}>
          <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>{setPin(e.target.value);setPinErr(false)}} onKeyDown={e=>e.key==="Enter"&&(pin===config.pin?(setMode("admin"),setPinErr(false)):setPinErr(true))} placeholder="PIN" style={{...S.input,flex:1,textAlign:"center",letterSpacing:8,fontSize:"1.1rem",...(pinErr?{borderColor:"#ef4444"}:{})}} />
          <button onClick={()=>pin===config.pin?(setMode("admin"),setPinErr(false)):setPinErr(true)} style={S.btnP}>Entrar</button>
        </div>
        {pinErr&&<p style={{color:"#ef4444",fontSize:"0.72rem",marginTop:4}}>PIN incorrecto</p>}
      </div>
      <div style={S.divider}><span style={S.dividerTxt}>o</span></div>
      <button onClick={()=>setMode("client")} style={S.btnEntry}>Consultar estado de mi prenda</button>
    </div></div>
  );

  // ═══ CLIENT ═══
  if (mode==="client") return (
    <div style={S.entryBg}><div style={{...S.entryCard,maxWidth:460,padding:"24px 20px"}}>
      <button onClick={()=>{setMode(null);setClientPh("");setSearched(false)}} style={S.backBtn}>Volver</button>
      <div style={{textAlign:"center",marginBottom:16}}>
        <h2 style={{...S.title,fontSize:"1.2rem"}}>Consulta tu pedido</h2>
        <p style={{fontSize:"0.8rem",color:"#6b7280"}}>Introduce tu telefono</p>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <input type="tel" value={clientPh} onChange={e=>{setClientPh(e.target.value);setSearched(false)}} onKeyDown={e=>e.key==="Enter"&&setSearched(true)} placeholder="612 345 678" style={{...S.input,flex:1,fontSize:"1rem"}} />
        <button onClick={()=>setSearched(true)} style={S.btnP}>Buscar</button>
      </div>
      {searched&&(clientResults.length===0?<div style={S.empty}><p>No hay pedidos con ese telefono</p></div>:
        clientResults.map((g,i)=><ClientBatchCard key={i} g={g} cfg={config}/>)
      )}
    </div></div>
  );

  // ═══ ADMIN ═══
  return (
    <div style={S.adminBg}>
      {toast&&<div style={S.toast}>{toast}</div>}
      <div style={S.topBar}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:"0.95rem"}}>Taller de Costura Express</div>
          <div style={{fontSize:"0.65rem",opacity:0.6}}>{inv.total} prendas - {todayCap.free}min libres hoy</div>
        </div>
        <button onClick={()=>{setMode(null);setPin("");setView("dash")}} style={S.logoutBtn}>Salir</button>
      </div>
      <div style={S.tabs}>
        {[{id:"dash",l:"🏠"},{id:"orders",l:"📋"},{id:"new",l:"➕"},{id:"stock",l:"📦"},{id:"calendar",l:"📅"},{id:"settings",l:"⚙️"}].map(t=>(
          <button key={t.id} onClick={()=>{setView(t.id);setEditing(null);setSearch("")}} style={{...S.tab,...(view===t.id?S.tabA:{})}}>{t.l}</button>
        ))}
        <button onClick={exportCSV} style={S.tab}>📤</button>
      </div>
      <div style={S.content}>

        {/* DASHBOARD */}
        {view==="dash"&&<DayView orders={orders} config={config} todayCap={todayCap} weekCaps={weekCaps} alerts={alerts} inv={inv} onAdvance={advanceStatus} onRemind={o=>waOpen(o.phone,waRemind(o,config))} onNew={()=>setView("new")} onOrders={()=>setView("orders")}/>}

        {/* ORDERS */}
        {view==="orders"&&!editing&&<>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, telefono o ticket..." style={{...S.input,marginBottom:12,fontSize:"0.95rem",padding:"12px 16px"}}/>
          {(search.length>=2&&searchResults!==null?searchResults:groupedOrders).length===0?
            <div style={S.empty}><p>Sin resultados</p></div>:
            (search.length>=2&&searchResults!==null?searchResults:groupedOrders).map(g=>
              <BatchCard key={g.batchId} g={g} onAdvance={advanceStatus} onEdit={o=>{setEditing(o)}} onDelete={deleteOrder} onRemind={o=>waOpen(o.phone,waRemind(o,config))} cfg={config}/>
            )
          }
        </>}
        {view==="orders"&&editing&&<EditForm order={editing} config={config} orders={orders} onSave={updateOrder} onCancel={()=>setEditing(null)}/>}

        {/* NEW */}
        {view==="new"&&<NewBatchForm config={config} orders={orders} onSave={addBatch} onCancel={()=>setView("dash")}/>}

        {/* STOCK LOAD */}
        {view==="stock"&&<QuickLoadForm config={config} orders={orders} ticketCounter={ticketCounter} onAdd={(o,sendWA)=>{
          const tn = ticketCounter + 1;
          setTicketCounter(tn);
          const svc = config.services.find(s=>s.id===o.serviceId)||config.services[6];
          const nw = {...o,id:uid(),ticketNum:tn,batchId:uid(),serviceName:svc.name,serviceIcon:svc.icon,batchSignal:o.paid||0,batchTotal:o.price,signalPaid:o.paid>0,source:"stock",createdAt:new Date().toISOString()};
          setOrders(p=>[nw,...p]);
          notify(tkt(tn)+" cargado");
          if(sendWA&&o.status==="listo"){
            const pending=o.price-(o.paid||0);
            const msg="Hola "+o.name+", te escribimos del Taller de Costura Express.\nTu prenda ("+svc.name+") esta lista para recoger."+(pending>0?"\nPendiente: "+pending+"E":"")+"\n"+config.address+"\nL-V 10-14h y 17-20:30h, Sab 10-14h";
            waOpen(o.phone,msg);
          }
        }}/>}

        {/* CALENDAR */}
        {view==="calendar"&&<CalendarView orders={orders} config={config} onBlockDay={(date,type)=>{
          const bd={...(config.blockedDays||{})};
          if(type===null||type==="normal") delete bd[date]; else bd[date]=type;
          setConfig({...config,blockedDays:bd});
          notify(type==="closed"?"Cerrado":type==="half"?"Medio dia":"Normal");
        }}/>}

        {/* SETTINGS */}
        {view==="settings"&&<Settings config={config} onSave={c=>{setConfig(c);notify("Guardado")}}/>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// DAY VIEW (progress + priority tasks)
// ═══════════════════════════════════════════
function DayView({orders, config, todayCap, weekCaps, alerts, inv, onAdvance, onRemind, onNew, onOrders}) {
  const t = today();
  const isClosed = getDayType(t, config) === "closed";
  const displayDate = isClosed ? getNextWorkday(config) : t;
  const tomorrow = (() => { const d = new Date(displayDate + "T12:00:00"); d.setDate(d.getDate() + 1); while(getDayType(d.toISOString().split("T")[0], config) === "closed") d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();

  // Classify work for display date
  const overdue = orders.filter(o => o.deliveryDate < displayDate && !["listo","entregado"].includes(o.status));
  const dayActive = orders.filter(o => o.deliveryDate === displayDate && !["listo","entregado"].includes(o.status));
  const dayDone = orders.filter(o => o.deliveryDate <= displayDate && o.status === "listo");
  const tomorrowActive = orders.filter(o => o.deliveryDate === tomorrow && !["listo","entregado"].includes(o.status));

  // Progress
  const totalDay = overdue.length + dayActive.length + dayDone.length;
  const doneCount = dayDone.length;
  const progressPct = totalDay > 0 ? Math.round((doneCount / totalDay) * 100) : 100;
  const remaining = overdue.length + dayActive.length;
  const remainingMins = [...overdue, ...dayActive].reduce((s, o) => s + (o.mins || 30), 0);

  const verse = getVerse();
  const displayCap = isClosed ? calcDayCap(displayDate, orders, config) : todayCap;

  const TaskItem = ({o}) => {
    const st = gSt(o.status);
    const idx = STATUSES.findIndex(s => s.id === o.status);
    const next = STATUSES[idx + 1];
    return (
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
        <div style={{width:4,height:36,borderRadius:2,background:st.color,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:"0.82rem",fontWeight:600,color:"#0f2e47"}}>{o.serviceIcon} {o.serviceName} <span style={{fontWeight:400,color:"#9ca3af",fontSize:"0.68rem"}}>{tkt(o.ticketNum)}</span></div>
          <div style={{fontSize:"0.68rem",color:"#6b7280"}}>{o.name} — {o.mins}min {o.assignedTo ? "— "+o.assignedTo : ""}</div>
        </div>
        {next && next.id !== "entregado" && <button onClick={()=>onAdvance(o.id)} style={{...S.btnSm,background:next.bg,color:next.color,fontWeight:600,padding:"6px 10px",minHeight:36,fontSize:"0.68rem",whiteSpace:"nowrap"}}>{next.icon} {next.id==="listo"?"Listo":"Empezar"}</button>}
        {o.status === "listo" && <button onClick={()=>onRemind(o)} style={{...S.btnSm,background:"#fef3c7",color:"#92400e",minHeight:36,fontSize:"0.68rem"}}>📲</button>}
      </div>
    );
  };

  return <>
    {/* Verse + greeting */}
    <div style={{...S.card,background:"#fefce8",borderColor:"#fde68a",textAlign:"center",padding:"16px 20px"}}>
      <div style={{fontSize:"0.82rem",fontStyle:"italic",color:"#92400e",lineHeight:1.5}}>{'"'+verse.text+'"'}</div>
      <div style={{fontSize:"0.68rem",color:"#b45309",marginTop:4}}>{verse.ref}</div>
      <div style={{fontSize:"0.88rem",fontWeight:600,color:"#0f2e47",marginTop:10}}>{getGreeting()}</div>
    </div>

    {/* Closed day notice */}
    {isClosed && <div style={{...S.card,background:"#f9fafb",textAlign:"center",padding:12}}>
      <div style={{fontSize:"0.8rem",color:"#6b7280"}}>Hoy es festivo — mostrando plan para <strong style={{color:"#0f2e47"}}>{fmtDL(displayDate)}</strong></div>
    </div>}
    {/* Progress */}
    <div style={{...S.card,background:"linear-gradient(135deg,#0f2e47,#1d5a8a)",color:"#fff",border:"none"}}>
      <div style={{textAlign:"center",fontSize:"0.72rem",opacity:0.7,marginBottom:8}}>HOY — {fmtDL(t).toUpperCase()}</div>
      {/* Progress bar */}
      <div style={{width:"100%",height:14,borderRadius:7,background:"rgba(255,255,255,0.15)",overflow:"hidden",marginBottom:8}}>
        <div style={{width:progressPct+"%",height:"100%",borderRadius:7,background:remaining===0?"#34d399":"#fff",transition:"width 0.6s ease"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:"1.5rem",fontWeight:700}}>{doneCount} <span style={{fontSize:"0.8rem",fontWeight:400,opacity:0.7}}>de {totalDay} hechas</span></span>
        <span style={{fontSize:"0.78rem",opacity:0.8}}>{remaining > 0 ? remaining + " pendiente" + (remaining>1?"s":"") + " — " + remainingMins + "min" : "Todo entregado"}</span>
      </div>
    </div>

    {/* Inventory mini */}
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {[{n:inv.registrado,l:"Pend",c:"#9333ea",bg:"#f3e8ff"},{n:inv.confirmado,l:"Cola",c:"#2563eb",bg:"#dbeafe"},{n:inv.proceso,l:"Cosiendo",c:"#d97706",bg:"#fef3c7"},{n:inv.listo,l:"Listas",c:"#059669",bg:"#d1fae5"}].map(s=>(
        <div key={s.l} style={{flex:1,textAlign:"center",background:s.bg,borderRadius:10,padding:"6px 2px"}}>
          <div style={{fontSize:"1.1rem",fontWeight:700,color:s.c}}>{s.n}</div>
          <div style={{fontSize:"0.55rem",color:s.c,fontWeight:500}}>{s.l}</div>
        </div>
      ))}
    </div>

    {/* Alerts */}
    {alerts.length>0&&<div style={{...S.card,background:"#fefce8",borderColor:"#fde68a",padding:12}}>
      {alerts.map((a,i)=>(<div key={i} style={{fontSize:"0.73rem",color:"#92400e",marginBottom:3,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{a.type==="old"?"🔔":"💶"} {a.msg}</span>{a.type==="old"&&<button onClick={()=>onRemind(a.o)} style={{...S.btnSm,background:"#fde68a",color:"#92400e",fontSize:"0.6rem"}}>📲</button>}</div>))}
    </div>}

    {/* Overdue */}
    {overdue.length>0&&<div style={{...S.card,borderLeft:"4px solid #dc2626"}}>
      <div style={{fontSize:"0.72rem",fontWeight:700,color:"#dc2626",marginBottom:6}}>🔴 ATRASADAS ({overdue.length})</div>
      {overdue.map(o=><TaskItem key={o.id} o={o}/>)}
    </div>}

    {/* Today */}
    {dayActive.length>0&&<div style={{...S.card,borderLeft:"4px solid #d97706"}}>
      <div style={{fontSize:"0.72rem",fontWeight:700,color:"#d97706",marginBottom:6}}>🟠 {isClosed?"PARA "+fmtDL(displayDate).toUpperCase():"PARA HOY"} ({dayActive.length})</div>
      {dayActive.map(o=><TaskItem key={o.id} o={o}/>)}
    </div>}

    {/* Tomorrow */}
    {tomorrowActive.length>0&&<div style={{...S.card,borderLeft:"4px solid #2563eb",opacity:0.8}}>
      <div style={{fontSize:"0.72rem",fontWeight:700,color:"#2563eb",marginBottom:6}}>🔵 MANANA ({tomorrowActive.length}) — adelantar si da tiempo</div>
      {tomorrowActive.map(o=><TaskItem key={o.id} o={o}/>)}
    </div>}

    {/* Done today */}
    {dayDone.length>0&&<div style={{...S.card,background:"#f0fdf4",borderColor:"#86efac"}}>
      <div style={{fontSize:"0.72rem",fontWeight:700,color:"#059669",marginBottom:6}}>TERMINADAS ({dayDone.length})</div>
      {dayDone.map(o=>(<div key={o.id} style={{fontSize:"0.75rem",color:"#059669",padding:"3px 0"}}>{tkt(o.ticketNum)} {o.name} — {o.serviceName}</div>))}
    </div>}

    {/* Empty state */}
    {totalDay===0&&overdue.length===0&&<div style={{...S.card,textAlign:"center",padding:24}}>
      <div style={{fontSize:"0.88rem",color:"#0f2e47",fontWeight:600}}>Sin entregas para {isClosed?fmtDL(displayDate):"hoy"}</div>
      <div style={{fontSize:"0.75rem",color:"#6b7280",marginTop:4}}>{inv.total > 0 ? inv.total + " prendas en el taller para otros dias" : "No hay pedidos activos"}</div>
    </div>}

    {/* Capacity */}
    <div style={{...S.card,padding:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:"0.68rem",fontWeight:600,color:"#6b7280"}}>CAPACIDAD</span>
        <span style={{fontSize:"0.68rem",fontWeight:700,color:displayCap.light==="green"?"#059669":displayCap.light==="yellow"?"#d97706":"#dc2626"}}>{displayCap.light==="green"?"🟢 Hay hueco":displayCap.light==="yellow"?"🟡 Casi lleno":"🔴 Lleno"}</span>
      </div>
      <CapBar pct={displayCap.pct} color={displayCap.light} h={6}/>
      <div style={{fontSize:"0.65rem",color:"#9ca3af",marginTop:4}}>{displayCap.free}min libres</div>
      <div style={{display:"flex",gap:4,marginTop:8}}>
        {weekCaps.slice(0,5).map(d=>{const cl=d.type==="closed";return <div key={d.date} style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:"0.55rem",color:d.date===t?"#0f2e47":"#9ca3af",fontWeight:d.date===t?700:400}}>{fmtDL(d.date).slice(0,3)}</div>
          <div style={{height:4,borderRadius:2,marginTop:2,background:cl?"#fee2e2":d.light==="green"?"#d1fae5":d.light==="yellow"?"#fef3c7":"#fee2e2"}}>
            {!cl&&<div style={{width:Math.min(100,d.pct)+"%",height:"100%",borderRadius:2,background:d.light==="green"?"#059669":d.light==="yellow"?"#d97706":"#dc2626"}}/>}
          </div>
        </div>})}
      </div>
    </div>

    {/* Actions */}
    <div style={{display:"flex",gap:8}}>
      <button onClick={onNew} style={{...S.btnP,flex:1,padding:"14px 16px"}}>Nuevo pedido</button>
      <button onClick={onOrders} style={{...S.btnSec,flex:1,padding:"14px 16px"}}>Todos los pedidos</button>
    </div>
  </>;
}

// ═══════════════════════════════════════════
// BATCH CARD (admin - grouped by client visit)
// ═══════════════════════════════════════════
function BatchCard({g, onAdvance, onEdit, onDelete, onRemind, cfg}) {
  const paid = g.batchSignal || 0;
  const pending = g.totalPrice - paid;
  const multi = g.items.length > 1;
  return (
    <div style={{...S.card,marginBottom:10,padding:14}}>
      {/* Client header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:multi?10:0,paddingBottom:multi?8:0,borderBottom:multi?"1px solid #e5e7eb":"none"}}>
        <div>
          <div style={{fontWeight:700,fontSize:"0.95rem"}}>{g.name} {multi&&<span style={{fontSize:"0.7rem",color:"#6b7280",fontWeight:400}}>({g.items.length} prendas)</span>}</div>
          <div style={{fontSize:"0.7rem",color:"#6b7280"}}>Tel: <a href={"tel:"+g.phone} style={{color:"#1d5a8a"}}>{fmtPh(g.phone)}</a></div>
        </div>
        <div style={{textAlign:"right",fontSize:"0.68rem",color:"#6b7280"}}>
          <div>{g.totalPrice}E total</div>
          {paid>0&&<div style={{color:"#059669"}}>Pagado: {paid}E</div>}
          {pending>0&&<div style={{color:"#d97706"}}>Pendiente: {pending}E</div>}
        </div>
      </div>
      {/* Garments */}
      {g.items.map(o => {
        const st = gSt(o.status);
        const idx = STATUSES.findIndex(s => s.id === o.status);
        const next = STATUSES[idx + 1];
        return (
          <div key={o.id} style={{borderLeft:"3px solid "+st.color,paddingLeft:10,marginTop:8,marginBottom:4}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <span style={{fontWeight:600,fontSize:"0.85rem"}}>{o.serviceIcon} {o.serviceName}</span>
                <span style={{fontSize:"0.6rem",color:"#9ca3af",marginLeft:6}}>{tkt(o.ticketNum)}</span>
                {o.assignedTo&&<span style={{fontSize:"0.55rem",background:"#e0e7ff",color:"#4338ca",padding:"1px 5px",borderRadius:4,marginLeft:4}}>{o.assignedTo}</span>}
              </div>
              <span style={{...S.badge,background:st.bg,color:st.color}}>{st.icon} {st.label}</span>
            </div>
            <div style={{display:"flex",gap:8,fontSize:"0.68rem",color:"#6b7280",marginTop:3}}>
              <span>{o.mins}m</span><span>{fmtD(o.deliveryDate)}</span><span>{o.price}E</span>
            </div>
            {o.notes&&<div style={{fontSize:"0.65rem",color:"#9ca3af",marginTop:2,fontStyle:"italic"}}>{o.notes}</div>}
            <div style={{display:"flex",gap:5,marginTop:6}}>
              {next&&<button onClick={()=>onAdvance(o.id)} style={{...S.btnSm,background:next.bg,color:next.color,fontWeight:600,padding:"6px 10px",minHeight:36,fontSize:"0.7rem"}}>{next.icon} {next.label}{next.id==="listo"?" +WA":""}</button>}
              {o.status==="listo"&&<button onClick={()=>onRemind(o)} style={{...S.btnSm,background:"#fef3c7",color:"#92400e",minHeight:36}}>📲</button>}
              <button onClick={()=>onEdit(o)} style={{...S.btnSm,background:"#f3f4f6",minHeight:36}}>✏️</button>
              <button onClick={()=>onDelete(o.id)} style={{...S.btnSm,background:"#fef2f2",color:"#dc2626",minHeight:36}}>🗑</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════
// CLIENT BATCH CARD
// ═══════════════════════════════════════════
function ClientBatchCard({g, cfg}) {
  const paid = g.batchSignal || 0;
  const pending = g.totalPrice - paid;
  return (
    <div style={{background:"#f9fafb",borderRadius:16,padding:16,border:"1px solid #e5e7eb",marginBottom:12}}>
      {g.items.length>1&&<div style={{fontWeight:600,fontSize:"0.82rem",marginBottom:8,color:"#0f2e47"}}>{g.items.length} prendas - Total: {g.totalPrice}E</div>}
      {g.items.map(o => {
        const st = gSt(o.status);
        const prog = STATUSES.findIndex(s => s.id === o.status);
        return (
          <div key={o.id} style={{marginBottom:10,paddingBottom:10,borderBottom:"1px solid #e5e7eb"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <div>
                <div style={{fontSize:"0.65rem",color:"#9ca3af"}}>{tkt(o.ticketNum)}</div>
                <div style={{fontWeight:600,fontSize:"0.9rem"}}>{o.serviceIcon} {o.serviceName}</div>
              </div>
              <span style={{...S.badge,background:st.bg,color:st.color}}>{st.icon} {st.label}</span>
            </div>
            <div style={{display:"flex",gap:3,marginBottom:6}}>{STATUSES.map((s,i)=><div key={s.id} style={{flex:1,height:4,borderRadius:2,background:i<=prog?st.color:"#e5e7eb"}}/>)}</div>
            <div style={{fontSize:"0.72rem",color:"#6b7280"}}>Entrega: {fmtD(o.deliveryDate)} - {o.price}E</div>
            {o.status==="listo"&&<div style={{...S.banner,background:"#d1fae5",color:"#065f46"}}>Lista! Recogela en {cfg.address}</div>}
          </div>
        );
      })}
      <div style={{fontSize:"0.75rem",color:"#6b7280",display:"flex",justifyContent:"space-between"}}>
        {paid>0&&<span>Pagado: {paid}E</span>}
        {pending>0&&<span>Pendiente a la entrega: {pending}E</span>}
        {pending<=0&&<span>Todo pagado</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// NEW BATCH FORM (multi-garment)
// ═══════════════════════════════════════════
function NewBatchForm({config, orders, onSave, onCancel}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [garments, setGarments] = useState([newGarment(config)]);
  const [signalInput, setSignalInput] = useState("");

  function newGarment(cfg) {
    return { id: uid(), serviceId: "bajos", price: 8, mins: 20, deliveryDate: "", notes: "", assignedTo: "" };
  }

  const addGarment = () => setGarments(g => [...g, newGarment(config)]);
  const removeGarment = (id) => setGarments(g => g.filter(x => x.id !== id));
  const updateGarment = (id, field, value) => setGarments(g => g.map(x => {
    if (x.id !== id) return x;
    const updated = { ...x, [field]: value };
    if (field === "serviceId") {
      const svc = config.services.find(s => s.id === value);
      if (svc) { updated.price = svc.price; updated.mins = svc.mins; updated.deliveryDate = findSlot(svc.mins, orders, config); }
    }
    return updated;
  }));

  // Set initial delivery dates
  useEffect(() => {
    setGarments(g => g.map(x => {
      if (!x.deliveryDate) {
        const svc = config.services.find(s => s.id === x.serviceId);
        return { ...x, deliveryDate: findSlot(svc ? svc.mins : 30, orders, config) };
      }
      return x;
    }));
  }, []);

  const totalPrice = garments.reduce((s, g) => s + (parseFloat(g.price) || 0), 0);
  const suggestedSignal = Math.ceil(totalPrice * (config.signalPct / 100));
  const signalAmount = signalInput === "" ? 0 : (parseFloat(signalInput) || 0);
  const pending = totalPrice - signalAmount;
  const canSave = name.trim() && phone.trim() && garments.every(g => g.deliveryDate);

  return (
    <div style={S.card}>
      <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:14}}>Nuevo pedido</h2>

      {/* Client info */}
      <div style={{background:"#f0f5fa",borderRadius:12,padding:12,marginBottom:14}}>
        <div style={{fontSize:"0.72rem",fontWeight:600,color:"#1d5a8a",marginBottom:8}}>Datos del cliente</div>
        <label style={S.label}>Nombre *</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Maria Garcia" style={S.input}/>
        <label style={S.label}>Telefono *</label>
        <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="612 345 678" style={{...S.input,fontSize:"1rem"}}/>
      </div>

      {/* Garments */}
      {garments.map((g, idx) => {
        const svc = config.services.find(s => s.id === g.serviceId);
        const cap = g.deliveryDate ? calcDayCap(g.deliveryDate, orders, config) : null;
        return (
          <div key={g.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:12,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:"0.78rem",fontWeight:600,color:"#0f2e47"}}>Prenda {idx+1}</span>
              {garments.length>1&&<button onClick={()=>removeGarment(g.id)} style={{...S.btnSm,background:"#fef2f2",color:"#dc2626",fontSize:"0.65rem"}}>Quitar</button>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {config.services.map(s=>(
                <button key={s.id} onClick={()=>updateGarment(g.id,"serviceId",s.id)} style={{...S.svcBtn,...(g.serviceId===s.id?S.svcBtnA:{}),padding:"6px 8px"}}>
                  <span style={{fontWeight:600,fontSize:"0.72rem"}}>{s.icon} {s.name}</span>
                  <span style={{fontSize:"0.58rem",opacity:0.7}}>{s.price>0?s.price+"E":"?"}</span>
                </button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:8}}>
              <div><label style={{...S.label,marginTop:0}}>Precio</label><input type="number" value={g.price} onChange={e=>updateGarment(g.id,"price",parseFloat(e.target.value)||0)} style={S.input}/></div>
              <div><label style={{...S.label,marginTop:0}}>Minutos</label><input type="number" value={g.mins} onChange={e=>updateGarment(g.id,"mins",parseInt(e.target.value)||30)} style={S.input}/></div>
              <div><label style={{...S.label,marginTop:0}}>Entrega</label><input type="date" value={g.deliveryDate} onChange={e=>updateGarment(g.id,"deliveryDate",e.target.value)} style={S.input}/></div>
            </div>
            {cap&&<div style={{fontSize:"0.65rem",marginTop:3,color:cap.light==="green"?"#059669":cap.light==="yellow"?"#d97706":"#dc2626"}}>{cap.light==="green"?"🟢":cap.light==="yellow"?"🟡":"🔴"} {fmtD(g.deliveryDate)} {cap.pct}% - {cap.free}min libres</div>}
            <label style={S.label}>Notas</label>
            <input value={g.notes} onChange={e=>updateGarment(g.id,"notes",e.target.value)} placeholder="Color, tela..." style={S.input}/>
            <label style={S.label}>Asignar a</label>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>updateGarment(g.id,"assignedTo","")} style={{...S.fBtn,...(g.assignedTo===""?S.fBtnA:{}),fontSize:"0.65rem"}}>Nadie</button>
              {config.workers.filter(w=>w.active).map(w=><button key={w.id} onClick={()=>updateGarment(g.id,"assignedTo",w.name)} style={{...S.fBtn,...(g.assignedTo===w.name?S.fBtnA:{}),fontSize:"0.65rem"}}>{w.name}</button>)}
            </div>
          </div>
        );
      })}

      <button onClick={addGarment} style={{...S.btnSec,width:"100%",padding:"12px 16px",marginBottom:12}}>+ Otra prenda</button>

      {/* Payment */}
      <div style={{background:"#fefce8",border:"1px solid #fde68a",borderRadius:10,padding:12,fontSize:"0.82rem",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",fontWeight:600,marginBottom:8}}><span>{garments.length} prenda{garments.length>1?"s":""}</span><span>Total: {totalPrice}E</span></div>
        <label style={{...S.label,marginTop:0}}>Senal dejada ahora (E)</label>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
          <input type="number" value={signalInput} onChange={e=>setSignalInput(e.target.value)} placeholder={"Sugerido: "+suggestedSignal} style={{...S.input,flex:1}}/>
          <button onClick={()=>setSignalInput(suggestedSignal.toString())} style={{...S.btnSm,fontSize:"0.65rem",whiteSpace:"nowrap"}}>{config.signalPct}%: {suggestedSignal}E</button>
          <button onClick={()=>setSignalInput(totalPrice.toString())} style={{...S.btnSm,fontSize:"0.65rem"}}>Todo</button>
          <button onClick={()=>setSignalInput("0")} style={{...S.btnSm,fontSize:"0.65rem"}}>Nada</button>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",color:"#6b7280"}}><span>Pagado:</span><strong style={{color:signalAmount>0?"#059669":"#6b7280"}}>{signalAmount}E</strong></div>
        <div style={{display:"flex",justifyContent:"space-between",color:"#6b7280"}}><span>Pendiente a la entrega:</span><strong>{pending>0?pending+"E":"Nada"}</strong></div>
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>{if(canSave) onSave(name.trim(),cleanPh(phone),garments,signalAmount)}} disabled={!canSave} style={{...S.btnP,flex:1,padding:"14px 16px",opacity:canSave?1:0.5}}>Registrar {garments.length} prenda{garments.length>1?"s":""} + WhatsApp</button>
        <button onClick={onCancel} style={S.btnSec}>Cancelar</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// EDIT FORM (single garment)
// ═══════════════════════════════════════════
function EditForm({order, config, orders, onSave, onCancel}) {
  const [price, setPrice] = useState(order.price?.toString()||"");
  const [mins, setMins] = useState(order.mins?.toString()||"");
  const [notes, setNotes] = useState(order.notes||"");
  const [dd, setDD] = useState(order.deliveryDate||"");
  const [assignee, setAssignee] = useState(order.assignedTo||"");

  return (
    <div style={S.card}>
      <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:14}}>Editar {tkt(order.ticketNum)} - {order.serviceName}</h2>
      <div style={{fontSize:"0.82rem",color:"#6b7280",marginBottom:12}}>{order.name} - {fmtPh(order.phone)}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><label style={S.label}>Precio</label><input type="number" value={price} onChange={e=>setPrice(e.target.value)} style={S.input}/></div>
        <div><label style={S.label}>Minutos</label><input type="number" value={mins} onChange={e=>setMins(e.target.value)} style={S.input}/></div>
      </div>
      <label style={S.label}>Entrega</label><input type="date" value={dd} onChange={e=>setDD(e.target.value)} style={S.input}/>
      <label style={S.label}>Asignar a</label>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setAssignee("")} style={{...S.fBtn,...(assignee===""?S.fBtnA:{})}}>Nadie</button>
        {config.workers.filter(w=>w.active).map(w=><button key={w.id} onClick={()=>setAssignee(w.name)} style={{...S.fBtn,...(assignee===w.name?S.fBtnA:{})}}>{w.name}</button>)}
      </div>
      <label style={S.label}>Notas</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{...S.input,resize:"vertical"}}/>
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={()=>onSave({...order,price:parseFloat(price)||0,mins:parseInt(mins)||30,notes:notes.trim(),deliveryDate:dd,assignedTo:assignee||null})} style={{...S.btnP,flex:1,padding:"14px 16px"}}>Guardar</button>
        <button onClick={onCancel} style={S.btnSec}>Cancelar</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// CAPBAR
// ═══════════════════════════════════════════
function CapBar({pct,color,h=10}){
  const c=color==="green"?"#059669":color==="yellow"?"#d97706":"#dc2626";
  const bg=color==="green"?"#d1fae5":color==="yellow"?"#fef3c7":"#fee2e2";
  return <div style={{width:"100%",height:h,borderRadius:h/2,background:bg,overflow:"hidden"}}><div style={{width:Math.min(100,pct)+"%",height:"100%",borderRadius:h/2,background:c,transition:"width 0.4s"}}/></div>;
}

// ═══════════════════════════════════════════
// QUICK LOAD (existing stock)
// ═══════════════════════════════════════════
function QuickLoadForm({config, orders, ticketCounter, onAdd}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [svcId, setSvcId] = useState("bajos");
  const [price, setPrice] = useState("");
  const [paid, setPaid] = useState("");
  const [status, setStatus] = useState("confirmado");
  const [count, setCount] = useState(0);

  const svc = config.services.find(s => s.id === svcId) || config.services[0];
  const priceNum = parseFloat(price) || svc.price;
  const paidNum = parseFloat(paid) || 0;

  const reset = (keepClient) => {
    if (!keepClient) { setName(""); setPhone(""); }
    setSvcId("bajos"); setPrice(""); setPaid(""); setStatus("confirmado");
  };

  const save = (sendWA) => {
    if (!name.trim() || !phone.trim()) return;
    onAdd({
      name: name.trim(), phone: cleanPh(phone), serviceId: svcId,
      price: priceNum, paid: paidNum, mins: svc.mins,
      deliveryDate: today(), status, assignedTo: null, notes: "",
    }, sendWA);
    setCount(c => c + 1);
    reset(true);
  };

  return <div style={S.card}>
    <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:4}}>Carga rapida de stock</h2>
    <p style={{fontSize:"0.7rem",color:"#9ca3af",marginBottom:14}}>Para meter prendas que ya teneis en el taller. Sin WhatsApp salvo las que estan listas.</p>
    {count > 0 && <div style={{background:"#d1fae5",borderRadius:8,padding:"6px 12px",marginBottom:12,fontSize:"0.75rem",color:"#059669",fontWeight:600}}>{count} prenda{count>1?"s":""} cargada{count>1?"s":""}</div>}

    <label style={S.label}>Nombre</label>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="Maria Lopez" style={S.input}/>

    <label style={S.label}>Telefono</label>
    <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="612 345 678" style={{...S.input,fontSize:"1rem"}}/>

    <label style={S.label}>Servicio</label>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
      {config.services.map(s=><button key={s.id} onClick={()=>{setSvcId(s.id);if(s.price>0)setPrice(s.price.toString())}} style={{...S.svcBtn,...(svcId===s.id?S.svcBtnA:{}),padding:"6px 8px"}}>
        <span style={{fontWeight:600,fontSize:"0.72rem"}}>{s.icon} {s.name}</span>
      </button>)}
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
      <div><label style={{...S.label,marginTop:0}}>Precio</label><input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder={svc.price.toString()} style={S.input}/></div>
      <div><label style={{...S.label,marginTop:0}}>Pagado</label><input type="number" value={paid} onChange={e=>setPaid(e.target.value)} placeholder="0" style={S.input}/></div>
    </div>

    <label style={S.label}>Estado actual de la prenda</label>
    <div style={{display:"flex",gap:6}}>
      {[{id:"confirmado",l:"En cola",c:"#2563eb",bg:"#dbeafe"},{id:"proceso",l:"Cosiendo",c:"#d97706",bg:"#fef3c7"},{id:"listo",l:"Lista",c:"#059669",bg:"#d1fae5"}].map(s=>(
        <button key={s.id} onClick={()=>setStatus(s.id)} style={{...S.fBtn,flex:1,...(status===s.id?{background:s.bg,color:s.c,borderColor:s.c}:{})}}>{s.l}</button>
      ))}
    </div>

    <div style={{display:"flex",gap:8,marginTop:16}}>
      <button onClick={()=>save(false)} disabled={!name.trim()||!phone.trim()} style={{...S.btnP,flex:1,padding:"14px 16px",opacity:(!name.trim()||!phone.trim())?0.5:1}}>Guardar</button>
      {status==="listo"&&<button onClick={()=>save(true)} disabled={!name.trim()||!phone.trim()} style={{...S.btnP,flex:1,padding:"14px 16px",background:"#059669",opacity:(!name.trim()||!phone.trim())?0.5:1}}>Guardar + Avisar</button>}
    </div>

    <p style={{fontSize:"0.65rem",color:"#9ca3af",marginTop:8,textAlign:"center"}}>Al guardar, el nombre y telefono se mantienen por si el mismo cliente tiene mas prendas</p>
  </div>;
}

// ═══════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════
function CalendarView({orders,config,onBlockDay}){
  const [wo,setWo]=useState(0);
  const days=useMemo(()=>{const s=new Date();s.setDate(s.getDate()-s.getDay()+1+wo*7);return Array.from({length:7},(_,i)=>{const d=new Date(s);d.setDate(d.getDate()+i);return d.toISOString().split("T")[0]}).filter(d=>!isSunday(d))},[wo]);
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><button onClick={()=>setWo(w=>w-1)} style={S.btnSm}>Ant.</button><button onClick={()=>setWo(0)} style={{...S.btnSm,fontWeight:600}}>Esta semana</button><button onClick={()=>setWo(w=>w+1)} style={S.btnSm}>Sig.</button></div>
    <p style={{fontSize:"0.65rem",color:"#9ca3af",marginBottom:10}}>Pulsa el estado de cada dia para cambiarlo</p>
    {days.map(date=>{const cap=calcDayCap(date,orders,config);const dayO=orders.filter(o=>o.deliveryDate===date&&o.status!=="entregado");const isT=date===today();const type=cap.type||getDayType(date,config);const isClosed=type==="closed";
    return <div key={date} style={{...S.card,marginBottom:8,...(isT?{borderColor:"#1d5a8a",boxShadow:"0 0 0 1px #1d5a8a"}:{}), ...(isClosed?{opacity:0.6,background:"#f9fafb"}:{})}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontWeight:600,fontSize:"0.85rem"}}>{fmtDL(date)}{isT&&<span style={{marginLeft:6,fontSize:"0.56rem",fontWeight:700,background:"#1d5a8a",color:"#fff",padding:"2px 6px",borderRadius:4}}>HOY</span>}</span>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {!isClosed&&<span style={{fontSize:"0.66rem"}}>{cap.pct}%</span>}
          <button onClick={()=>{const next=type==="closed"?"normal":type==="half"?"closed":"half";onBlockDay(date,next==="normal"?null:next)}} style={{...S.btnSm,fontSize:"0.6rem",padding:"3px 8px",minHeight:28,background:type==="closed"?"#fee2e2":type==="half"?"#fef3c7":"#d1fae5",color:type==="closed"?"#dc2626":type==="half"?"#d97706":"#059669"}}>{type==="closed"?"Cerrado":type==="half"?"Medio dia":"Normal"}</button>
        </div>
      </div>
      {!isClosed&&<><CapBar pct={cap.pct} color={cap.light} h={6}/><div style={{fontSize:"0.66rem",color:"#9ca3af",marginTop:4}}>{cap.free}min libres - {dayO.length} pedido{dayO.length!==1?"s":""}</div>
      {dayO.length>0&&<div style={{marginTop:6}}>{dayO.map(o=>{const st=gSt(o.status);return <div key={o.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:"0.73rem",padding:"4px 0",borderTop:"1px solid #f3f4f6"}}><span style={{width:7,height:7,borderRadius:"50%",background:st.color,flexShrink:0}}/><span style={{flex:1}}><strong>{o.name}</strong> - {o.serviceName}</span><span style={{color:st.color,fontSize:"0.6rem",fontWeight:600}}>{st.label}</span></div>})}</div>}</>}
      {isClosed&&<div style={{fontSize:"0.75rem",color:"#dc2626",marginTop:4}}>No se trabaja</div>}
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
  const setWF=(id,f,v)=>setWorkers(w=>w.map(x=>x.id===id?{...x,[f]:f==="name"?v:(parseInt(v)||0)}:x));
  const setSF=(id,f,v)=>setServices(s=>s.map(x=>x.id===id?{...x,[f]:["price","mins"].includes(f)?(parseFloat(v)||0):v}:x));
  const addSvc=()=>setServices(s=>[...s,{id:"svc_"+Date.now().toString(36),name:"Nuevo",icon:"🧵",price:0,mins:30,minDays:1}]);
  const rmSvc=(id)=>setServices(s=>s.filter(x=>x.id!==id));
  return <div>
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {[{id:"services",l:"Servicios"},{id:"workers",l:"Equipo"},{id:"other",l:"Otros"}].map(t2=>(<button key={t2.id} onClick={()=>setTab(t2.id)} style={{...S.fBtn,...(tab===t2.id?S.fBtnA:{})}}>{t2.l}</button>))}
    </div>
    {tab==="services"&&<div style={S.card}>
      <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:12}}>Servicios y precios</h2>
      {services.map(s=>(<div key={s.id} style={{background:"#f9fafb",borderRadius:12,padding:12,marginBottom:8,border:"1px solid #e5e7eb"}}>
        <div style={{display:"flex",gap:6,marginBottom:6}}>
          <input value={s.icon} onChange={e=>setSF(s.id,"icon",e.target.value)} style={{...S.input,width:44,textAlign:"center",fontSize:"1.1rem",padding:"6px"}} maxLength={2}/>
          <input value={s.name} onChange={e=>setSF(s.id,"name",e.target.value)} style={{...S.input,flex:1,fontWeight:600}}/>
          {services.length>1&&<button onClick={()=>rmSvc(s.id)} style={{...S.btnSm,background:"#fef2f2",color:"#dc2626",minHeight:38}}>X</button>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          <div><div style={{fontSize:"0.6rem",color:"#6b7280"}}>Precio E</div><input type="number" value={s.price} onChange={e=>setSF(s.id,"price",e.target.value)} style={S.input}/></div>
          <div><div style={{fontSize:"0.6rem",color:"#6b7280"}}>Minutos</div><input type="number" value={s.mins} onChange={e=>setSF(s.id,"mins",e.target.value)} style={S.input}/></div>
          <div><div style={{fontSize:"0.6rem",color:"#6b7280"}}>Dias min</div><input type="number" value={s.minDays||0} onChange={e=>setSF(s.id,"minDays",e.target.value)} style={S.input}/></div>
        </div>
      </div>))}
      <button onClick={addSvc} style={{...S.btnSec,width:"100%",marginTop:8,padding:"12px 16px"}}>+ Nuevo servicio</button>
    </div>}
    {tab==="workers"&&<div style={S.card}>
      <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:12}}>Equipo</h2>
      {workers.map(w=><div key={w.id} style={{background:w.active?"#f0fdf4":"#f9fafb",borderRadius:12,padding:12,marginBottom:8,border:"1px solid "+(w.active?"#86efac":"#e5e7eb")}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:w.active?8:0}}><input type="checkbox" checked={w.active} onChange={()=>toggleW(w.id)} style={{width:18,height:18,accentColor:"#059669"}}/><input value={w.name} onChange={e=>setWF(w.id,"name",e.target.value)} style={{...S.input,flex:1,fontWeight:600}}/></div>
        {w.active&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><div><div style={{fontSize:"0.63rem",color:"#6b7280"}}>Min/dia L-V</div><input type="number" value={w.minPerDay} onChange={e=>setWF(w.id,"minPerDay",e.target.value)} style={S.input}/></div><div><div style={{fontSize:"0.63rem",color:"#6b7280"}}>Min/sabado</div><input type="number" value={w.minSat} onChange={e=>setWF(w.id,"minSat",e.target.value)} style={S.input}/></div></div>}
      </div>)}
      <p style={{fontSize:"0.66rem",color:"#9ca3af"}}>Total L-V: {workers.filter(w=>w.active).reduce((s,w)=>s+w.minPerDay,0)}min</p>
    </div>}
    {tab==="other"&&<div style={S.card}>
      <h2 style={{fontSize:"1rem",fontWeight:700,color:"#0f2e47",marginBottom:14}}>Otros</h2>
      <label style={S.label}>Senal (%)</label><input type="number" value={signalPct} onChange={e=>setSignalPct(parseInt(e.target.value)||0)} style={{...S.input,width:100}}/>
    </div>}
    <button onClick={()=>onSave({...config,workers,services,signalPct})} style={{...S.btnP,width:"100%",marginTop:12,padding:"14px 16px"}}>Guardar</button>
  </div>;
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════
const S={
  entryBg:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"linear-gradient(145deg,#0f2e47,#1d5a8a)"},
  entryCard:{background:"#fff",borderRadius:24,padding:"32px 24px",maxWidth:380,width:"100%",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"},
  title:{fontFamily:"Georgia,serif",fontSize:"1.4rem",color:"#0f2e47",margin:0},
  sub:{fontSize:"0.8rem",color:"#6b7280",marginTop:4,marginBottom:20},
  blockLabel:{fontSize:"0.72rem",fontWeight:600,color:"#374151",marginBottom:8},
  divider:{textAlign:"center",margin:"18px 0",borderTop:"1px solid #e5e7eb"},
  dividerTxt:{background:"#fff",padding:"0 10px",position:"relative",top:-10,color:"#9ca3af",fontSize:"0.75rem"},
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
  cardLabel:{fontSize:"0.7rem",fontWeight:600,color:"#6b7280",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.04em"},
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
