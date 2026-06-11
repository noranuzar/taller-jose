// ═══════════════════════════════════════════
// STORAGE — Supabase (sincroniza entre dispositivos)
// Con fallback a localStorage si Supabase no responde
// ═══════════════════════════════════════════
import { supabase } from "./supabase";

// ── ORDERS ──────────────────────────────────

export async function loadOrders() {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Convertir snake_case de DB a camelCase de la app
    return (data || []).map(dbToOrder);
  } catch (e) {
    console.warn("Supabase read failed, using localStorage:", e.message);
    try { return JSON.parse(localStorage.getItem("taller-jose-orders-v3")) || []; } catch { return []; }
  }
}

export async function saveOrder(order) {
  try {
    const row = orderToDb(order);
    const { error } = await supabase.from("orders").upsert(row, { onConflict: "id" });
    if (error) throw error;
  } catch (e) {
    console.warn("Supabase write failed:", e.message);
  }
  // Siempre guardar en localStorage como backup
  try {
    const all = JSON.parse(localStorage.getItem("taller-jose-orders-v3")) || [];
    const idx = all.findIndex(o => o.id === order.id);
    if (idx >= 0) all[idx] = order; else all.unshift(order);
    localStorage.setItem("taller-jose-orders-v3", JSON.stringify(all));
  } catch {}
}

export async function saveAllOrders(orders) {
  // Backup local siempre
  try { localStorage.setItem("taller-jose-orders-v3", JSON.stringify(orders)); } catch {}
  // Supabase batch upsert
  try {
    const rows = orders.map(orderToDb);
    const { error } = await supabase.from("orders").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  } catch (e) {
    console.warn("Supabase batch write failed:", e.message);
  }
}

export async function deleteOrderDb(id) {
  try {
    await supabase.from("orders").delete().eq("id", id);
  } catch (e) {
    console.warn("Supabase delete failed:", e.message);
  }
}

// ── CONFIG ───────────────────────────────────

export async function loadConfig() {
  try {
    const { data, error } = await supabase.from("config").select("data").eq("id", 1).single();
    if (error && error.code !== "PGRST116") throw error;
    return data?.data || null;
  } catch (e) {
    console.warn("Config load failed:", e.message);
    try { return JSON.parse(localStorage.getItem("taller-jose-config-v3")); } catch { return null; }
  }
}

export async function saveConfig(config) {
  try { localStorage.setItem("taller-jose-config-v3", JSON.stringify(config)); } catch {}
  try {
    await supabase.from("config").upsert({ id: 1, data: config, updated_at: new Date().toISOString() });
  } catch (e) {
    console.warn("Config save failed:", e.message);
  }
}

// ── TICKET COUNTER ───────────────────────────

export async function loadTicket() {
  try {
    const { data, error } = await supabase.from("counters").select("value").eq("id", "ticket").single();
    if (error) throw error;
    return data?.value || 0;
  } catch (e) {
    console.warn("Ticket load failed:", e.message);
    try { return JSON.parse(localStorage.getItem("taller-jose-ticket-v3")) || 0; } catch { return 0; }
  }
}

export async function saveTicket(value) {
  try { localStorage.setItem("taller-jose-ticket-v3", JSON.stringify(value)); } catch {}
  try {
    await supabase.from("counters").upsert({ id: "ticket", value });
  } catch (e) {
    console.warn("Ticket save failed:", e.message);
  }
}

// ── CONVERTERS (camelCase <-> snake_case) ────

function dbToOrder(row) {
  return {
    id: row.id,
    ticketNum: row.ticket_num,
    name: row.name,
    phone: row.phone,
    serviceId: row.service_id,
    serviceName: row.service_name,
    serviceIcon: row.service_icon,
    price: Number(row.price),
    signal: Number(row.signal),
    signalPaid: row.signal_paid,
    mins: row.mins,
    notes: row.notes || "",
    deliveryDate: row.delivery_date,
    status: row.status,
    source: row.source || "tienda",
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
  };
}

function orderToDb(o) {
  return {
    id: o.id,
    ticket_num: o.ticketNum,
    name: o.name,
    phone: o.phone,
    service_id: o.serviceId || null,
    service_name: o.serviceName,
    service_icon: o.serviceIcon || "🧵",
    price: o.price,
    signal: o.signal,
    signal_paid: o.signalPaid || false,
    mins: o.mins || 30,
    notes: o.notes || "",
    delivery_date: o.deliveryDate,
    status: o.status,
    source: o.source || "tienda",
    assigned_to: o.assignedTo || null,
    created_at: o.createdAt,
  };
}
