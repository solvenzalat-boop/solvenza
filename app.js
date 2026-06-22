const SUPABASE_URL = "https://tsutinepyqjhktxmbwfq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzdXRpbmVweXFqaGt0eG1id2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjUwMDIsImV4cCI6MjA5Nzc0MTAwMn0.AdvxcaUVwWn8YOBUROcyJYJZtMkfdJud8LrbzPRpz8c";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let pros = [];
let distancias = {};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;"
  })[char]);
}

function normalizar(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function mostrarResultado(form, tipo, mensaje) {
  form.reset();
  form.style.display = "none";
  const box = document.getElementById(tipo === "cliente" ? "msg-cliente" : "msg-pro");
  box.textContent = mensaje;
  box.style.display = "block";
}

window.submitForm = async function submitForm(event, tipo) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  button.textContent = "Guardando...";
  button.disabled = true;

  try {
    const data = new FormData(form);

    if (tipo === "pro") {
      const latValue = data.get("lat");
      const lngValue = data.get("lng");
      const payload = {
        nombre: String(data.get("nombre") || "").trim(),
        telefono: String(data.get("telefono") || "").trim(),
        email: String(data.get("email") || "").trim(),
        tipo_cuenta: String(data.get("tipo_cuenta") || "").trim(),
        especialidad: String(data.get("especialidad") || "").trim(),
        zona: String(data.get("ciudad") || "").trim(),
        descripcion: String(data.get("experiencia") || "").trim() || null,
        activo: false,
        lat: latValue ? Number(latValue) : null,
        lng: lngValue ? Number(lngValue) : null
      };

      const { error } = await supabaseClient.from("profesionales").insert(payload);
      if (error) throw error;

      mostrarResultado(
        form,
        tipo,
        "Registro recibido. Revisaremos tus datos antes de publicar tu perfil."
      );
      return;
    }

    const nombreCompleto = [data.get("nombre"), data.get("apellido")]
      .filter(Boolean)
      .join(" ")
      .trim();
    const payload = {
      nombre: nombreCompleto,
      email: String(data.get("email") || "").trim(),
      telefono: String(data.get("telefono") || "").trim() || null,
      ciudad: String(data.get("ciudad") || "").trim(),
      servicio_interes: String(data.get("servicio_interes") || "").trim()
    };

    const { error } = await supabaseClient.from("clientes").insert(payload);
    if (error) throw error;

    mostrarResultado(form, tipo, "Solicitud guardada. Te contactaremos cuando haya profesionales disponibles.");
  } catch (error) {
    console.error("Error de Supabase:", error);
    alert("No pudimos guardar el registro. Verifica que el SQL de Supabase esté ejecutado e intenta nuevamente.");
    button.textContent = originalText;
    button.disabled = false;
  }
};

async function cargarProfesionales() {
  const { data, error } = await supabaseClient
    .from("profesionales")
    .select("id,nombre,telefono,email,tipo_cuenta,especialidad,zona,descripcion,estrellas,trabajos,lat,lng,created_at")
    .eq("activo", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("No se pudo cargar el directorio:", error);
    const grid = document.getElementById("dirGrid");
    grid.innerHTML = '<div style="grid-column:1/-1;padding:28px;color:rgba(255,255,255,.55)">No pudimos conectar con el directorio. Ejecutá primero el SQL de Supabase.</div>';
    return;
  }

  pros = data || [];
  window.filtrarPros();
}

function calcDist(lat1, lng1, lat2, lng2) {
  const radius = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180)
    * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

window.buscarCercanos = function buscarCercanos() {
  if (!navigator.geolocation) {
    alert("Tu navegador no soporta geolocalización.");
    return;
  }

  navigator.geolocation.getCurrentPosition((position) => {
    distancias = {};
    pros.forEach((pro) => {
      if (Number.isFinite(pro.lat) && Number.isFinite(pro.lng)) {
        distancias[pro.id] = calcDist(
          position.coords.latitude,
          position.coords.longitude,
          pro.lat,
          pro.lng
        );
      }
    });
    window.filtrarPros(true);
  }, () => alert("No pudimos obtener tu ubicación. Revisá el permiso del navegador."));
};

function estrellas(value) {
  const count = Math.max(0, Math.min(5, Number(value) || 0));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

window.filtrarPros = function filtrarPros(ordenar = false) {
  const busqueda = normalizar(document.getElementById("searchInput").value);
  const categoria = normalizar(document.getElementById("catFilter").value);
  const zona = normalizar(document.getElementById("zonaFilter").value);

  const lista = pros.filter((pro) => {
    const nombre = normalizar(pro.nombre);
    const especialidad = normalizar(pro.especialidad);
    const descripcion = normalizar(pro.descripcion);
    const zonaPro = normalizar(pro.zona);
    const coincideTexto = !busqueda
      || nombre.includes(busqueda)
      || especialidad.includes(busqueda)
      || descripcion.includes(busqueda);
    const coincideCategoria = !categoria
      || especialidad.includes(categoria)
      || categoria.includes(especialidad);
    const coincideZona = !zona
      || zonaPro.includes(zona)
      || zona.includes(zonaPro)
      || zona === "todo uruguay";
    return coincideTexto && coincideCategoria && coincideZona;
  });

  if (ordenar) {
    lista.sort((a, b) => (distancias[a.id] ?? Infinity) - (distancias[b.id] ?? Infinity));
  }

  const grid = document.getElementById("dirGrid");
  const count = document.getElementById("dirCount");

  if (!lista.length) {
    count.textContent = "";
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:rgba(255,255,255,.35)"><div style="font-size:3rem">🔍</div><p style="margin-top:12px">Todavía no hay profesionales verificados para esta búsqueda.</p></div>';
    return;
  }

  count.textContent = `${lista.length} profesional${lista.length === 1 ? "" : "es"} disponible${lista.length === 1 ? "" : "s"}${ordenar ? " · ordenados por distancia" : ""}`;
  grid.innerHTML = lista.map((pro) => {
    const distancia = distancias[pro.id] != null
      ? `<span style="color:#0ea898;font-weight:600">${distancias[pro.id].toFixed(1)} km</span> · `
      : "";
    const telefono = String(pro.telefono || "").replace(/\D/g, "");
    const message = encodeURIComponent(`Hola ${pro.nombre}, te encontré en Solvenza y me interesa tu servicio de ${pro.especialidad}.`);
    return `<article style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:24px;position:relative">
      <span style="position:absolute;top:16px;right:16px;background:rgba(14,168,152,.15);border:1px solid rgba(14,168,152,.3);color:#0ea898;font-size:.6rem;font-weight:700;padding:3px 8px;border-radius:100px;text-transform:uppercase">✓ Verificado</span>
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#c9a84c,#0ea898);display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:800;color:#080b10;margin-bottom:14px">${escapeHtml(pro.nombre).charAt(0)}</div>
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.97rem;margin-bottom:6px">${escapeHtml(pro.nombre)}</div>
      <div style="display:inline-flex;background:rgba(201,168,76,.1);color:#c9a84c;font-size:.7rem;font-weight:600;padding:3px 10px;border-radius:100px;margin-bottom:8px">${escapeHtml(pro.especialidad)}</div>
      <div style="font-size:.78rem;color:rgba(255,255,255,.4);margin-bottom:6px">📍 ${distancia}${escapeHtml(pro.zona)}</div>
      <div style="font-size:.81rem;color:rgba(255,255,255,.5);line-height:1.55;margin-bottom:14px">${escapeHtml(pro.descripcion || "Profesional verificado por Solvenza.")}</div>
      <div style="color:#c9a84c;font-size:.76rem;margin-bottom:14px">${estrellas(pro.estrellas)} <span style="color:rgba(255,255,255,.35)">${Number(pro.trabajos) || 0} trabajos</span></div>
      <a href="https://wa.me/${telefono}?text=${message}" target="_blank" rel="noreferrer" style="display:flex;align-items:center;justify-content:center;width:100%;background:#25d366;color:#fff;border-radius:9px;padding:11px;font-size:.87rem;font-weight:700">Contactar por WhatsApp</a>
    </article>`;
  }).join("");
};

function prepararUbicacionProfesional() {
  const button = document.getElementById("geo-pro-btn");
  const status = document.getElementById("geo-pro-status");
  if (!button) return;

  button.addEventListener("click", () => {
    if (!navigator.geolocation) {
      status.textContent = "Este navegador no soporta geolocalización.";
      return;
    }
    status.textContent = "Obteniendo ubicación...";
    navigator.geolocation.getCurrentPosition((position) => {
      document.getElementById("pro-lat").value = position.coords.latitude;
      document.getElementById("pro-lng").value = position.coords.longitude;
      status.textContent = "Ubicación guardada para calcular cercanía.";
    }, () => {
      status.textContent = "No pudimos obtener la ubicación. Podés registrarte igual.";
    });
  });
}

function iniciarTiempoReal() {
  supabaseClient
    .channel("directorio-profesionales")
    .on("postgres_changes", { event: "*", schema: "public", table: "profesionales" }, cargarProfesionales)
    .subscribe();
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(".hstep, .cat-card, .vstep, .tcard").forEach((element) => {
  element.style.opacity = "0";
  element.style.transform = "translateY(20px)";
  element.style.transition = "opacity .5s ease, transform .5s ease";
  observer.observe(element);
});

prepararUbicacionProfesional();
cargarProfesionales();
iniciarTiempoReal();
