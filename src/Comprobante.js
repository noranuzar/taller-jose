// ═══════════════════════════════════════════
// COMPROBANTE — Factura simplificada imprimible / PDF
// Se abre en ventana nueva, lista para "Compartir → WhatsApp"
// o "Guardar como PDF" desde el móvil. Sin librerías externas.
// ═══════════════════════════════════════════

// Formatea el número de comprobante
const tkt = (n) => "P-" + String(n).padStart(4, "0");

// Genera el comprobante de un lote de pedidos (batch) para un cliente.
// g = grupo/batch { name, phone, items:[...], totalPrice, batchSignal, signalPaid }
// cfg = config del negocio (con los datos fiscales)
export function generarComprobante(g, cfg) {
  const total = g.totalPrice || g.items.reduce((s, o) => s + (o.price || 0), 0);
  const senal = g.batchSignal || 0;
  const pendiente = total - senal;
  const pagado = g.signalPaid;
  const fecha = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
  const num = g.items[0] ? tkt(g.items[0].ticketNum) : "P-—";

  // Datos fiscales del negocio (desde config; NIF y nombre fiscal editables en Ajustes)
  const nombreComercial = cfg.businessName || "Taller de Costura MILE";
  const nombreFiscal = cfg.fiscalName || "";      // nombre y apellidos de Mileydi
  const nif = cfg.nif || "";                        // NIF (se rellena al alta)
  const direccion = cfg.address || "";
  const telefono = cfg.phoneDisplay || "";

  const filas = g.items.map(o => `
    <tr>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;">${tkt(o.ticketNum)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;">${o.serviceName || ""}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;">${(o.price || 0).toFixed(2)} €</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Comprobante ${num}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: system-ui, -apple-system, sans-serif; color:#2f3320; padding:24px 20px; max-width:480px; margin:0 auto; background:#fff; }
  .cab { text-align:center; border-bottom:2px solid #0f2e47; padding-bottom:14px; margin-bottom:14px; }
  .cab .marca { font-size:1.5rem; font-weight:800; color:#0f2e47; }
  .cab .fiscal { font-size:0.82rem; color:#555; margin-top:4px; line-height:1.5; }
  .meta { display:flex; justify-content:space-between; font-size:0.85rem; color:#444; margin-bottom:16px; }
  .cliente { font-size:0.9rem; margin-bottom:14px; }
  .cliente b { color:#0f2e47; }
  table { width:100%; border-collapse:collapse; font-size:0.88rem; margin-bottom:6px; }
  th { text-align:left; padding:8px 6px; border-bottom:2px solid #0f2e47; font-size:0.78rem; text-transform:uppercase; color:#0f2e47; }
  th:last-child { text-align:right; }
  .totales { margin-top:12px; font-size:0.95rem; }
  .totales .fila { display:flex; justify-content:space-between; padding:5px 0; }
  .totales .total { font-weight:800; font-size:1.15rem; color:#0f2e47; border-top:2px solid #0f2e47; margin-top:6px; padding-top:8px; }
  .estado { text-align:center; margin-top:16px; padding:10px; border-radius:10px; font-weight:700; }
  .estado.pagado { background:#d1fae5; color:#059669; }
  .estado.pendiente { background:#fef3c7; color:#d97706; }
  .ivainc { text-align:center; font-size:0.78rem; color:#777; margin-top:14px; }
  .pie { text-align:center; font-size:0.75rem; color:#999; margin-top:20px; line-height:1.6; }
  .btns { display:flex; gap:10px; margin-top:24px; }
  .btns button { flex:1; border:none; border-radius:12px; padding:14px; font-size:1rem; font-weight:700; cursor:pointer; font-family:inherit; }
  .btns .compartir { background:#25D366; color:#fff; }
  .btns .imprimir { background:#0f2e47; color:#fff; }
  @media print { .btns { display:none; } body { padding:0; } }
</style></head>
<body>
  <div class="cab">
    <div class="marca">${nombreComercial}</div>
    <div class="fiscal">
      ${nombreFiscal ? nombreFiscal + "<br>" : ""}
      ${nif ? "NIF: " + nif + "<br>" : ""}
      ${direccion}${telefono ? " · Tel: " + telefono : ""}
    </div>
  </div>

  <div class="meta">
    <span><b>Comprobante:</b> ${num}</span>
    <span><b>Fecha:</b> ${fecha}</span>
  </div>

  <div class="cliente">Cliente: <b>${g.name || ""}</b></div>

  <table>
    <thead><tr><th>Nº</th><th>Servicio</th><th>Importe</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>

  <div class="totales">
    <div class="fila"><span>Total</span><span>${total.toFixed(2)} €</span></div>
    ${senal > 0 ? `<div class="fila"><span>Pagado (señal)</span><span>${senal.toFixed(2)} €</span></div>` : ""}
    <div class="fila total"><span>${pendiente > 0 ? "Pendiente" : "Total"}</span><span>${(pendiente > 0 ? pendiente : total).toFixed(2)} €</span></div>
  </div>

  <div class="estado ${pendiente <= 0 ? "pagado" : "pendiente"}">
    ${pendiente <= 0 ? "✓ PAGADO" : "PENDIENTE DE PAGO: " + pendiente.toFixed(2) + " €"}
  </div>

  <div class="ivainc">IVA incluido</div>

  <div class="pie">
    Gracias por confiar en nosotros.<br>
    Conserve este comprobante.
  </div>

  <div class="btns">
    <button class="imprimir" onclick="window.print()">🖨️ Guardar PDF</button>
    <button class="compartir" onclick="compartir()">📤 Compartir</button>
  </div>

  <script>
    function compartir() {
      if (navigator.share) {
        navigator.share({
          title: 'Comprobante ${num}',
          text: '${nombreComercial} — Comprobante ${num}\\nCliente: ${g.name || ""}\\nTotal: ${total.toFixed(2)} €\\n${pendiente <= 0 ? "PAGADO" : "Pendiente: " + pendiente.toFixed(2) + " €"}'
        });
      } else {
        alert('Usa el botón Guardar PDF y compártelo desde tu galería.');
      }
    }
  </script>
</body></html>`;

  // Abrir en ventana nueva
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}
