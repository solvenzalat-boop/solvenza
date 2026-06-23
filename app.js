const SUPABASE_URL = "https://tsutinepyqjhktxmbwfq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzdXRpbmVweXFqaGt0eG1id2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjUwMDIsImV4cCI6MjA5Nzc0MTAwMn0.AdvxcaUVwWn8YOBUROcyJYJZtMkfdJud8LrbzPRpz8c";
const REVIEW_TOKENS_KEY = "solvenza_review_tokens";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let pros = [];
let distancias = {};
let categoriaActiva = "";
let profesionalContacto = null;
let resenaActiva = null;
let puntuacionResena = 0;

const categoryAliases = [
  ["electricidad", "electricista"],
  ["plomeria", "plomero", "sanitaria"],
  ["limpieza", "limpieza airbnb"],
  ["pintura", "pintor"],
  ["jardineria", "jardinero"],
  ["carpinteria", "carpintero"],
  ["cerrajeria", "cerrajero"],
  ["construccion y reformas", "construccion", "reformas"],
  ["albanileria", "albanil"],
  ["cabanas y estructuras", "cabanas"],
  ["mudanzas", "flete"],
  ["aire acondicionado"]
];

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

function categoriasCompatibles(especialidad, categoria) {
  if (!categoria) return true;
  const proValue = normalizar(especialidad);
  const categoryValue = normalizar(categoria);
  if (proValue.includes(categoryValue) || categoryValue.includes(proValue)) return true;
  return categoryAliases.some((group) => {
    const categoryInGroup = group.some((item) => categoryValue.includes(item) || item.includes(categoryValue));
    const proInGroup = group.some((item) => proValue.includes(item) || item.includes(proValue));
    return categoryInGroup && proInGroup;
  });
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
        destacado: false,
        lat: latValue ? Number(latValue) : null,
        lng: lngValue ? Number(lngValue) : null
      };
      const { error } = await supabaseClient.from("profesionales").insert(payload);
      if (error) throw error;
      mostrarResultado(form, tipo, "Registro recibido. Revisaremos tus datos antes de publicar tu perfil.");
      return;
    }

    const nombreCompleto = [data.get("nombre"), data.get("apellido")].filter(Boolean).join(" ").trim();
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
    alert("No pudimos guardar el registro. Verificá la conexión e intentá nuevamente.");
    button.textContent = originalText;
    button.disabled = false;
  }
};

async function cargarProfesionales() {
  const { data, error } = await supabaseClient
    .from("profesionales")
    .select("id,nombre,telefono,especialidad,zona,descripcion,estrellas,trabajos,destacado,lat,lng,created_at")
    .eq("activo", true)
    .order("destacado", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("No se pudo cargar el directorio:", error);
    document.getElementById("dirGrid").innerHTML = '<div class="directory-empty">No pudimos conectar con el directorio. Ejecutá la última versión de supabase-schema.sql.</div>';
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

function obtenerUbicacionCliente() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalización no disponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000
    });
  });
}

function calcularDistancias(position) {
  distancias = {};
  pros.forEach((pro) => {
    const lat = Number(pro.lat);
    const lng = Number(pro.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      distancias[pro.id] = calcDist(position.coords.latitude, position.coords.longitude, lat, lng);
    }
  });
}

window.buscarCercanos = async function buscarCercanos() {
  try {
    calcularDistancias(await obtenerUbicacionCliente());
    window.filtrarPros(true);
  } catch {
    alert("No pudimos obtener tu ubicación. Revisá el permiso del navegador.");
  }
};

async function seleccionarCategoria(nombre) {
  categoriaActiva = nombre;
  const categorySelect = document.getElementById("catFilter");
  const matchingOption = Array.from(categorySelect.options).find((option) => normalizar(option.value) === normalizar(nombre))
    || Array.from(categorySelect.options).find((option) => categoriasCompatibles(option.value, nombre));
  categorySelect.value = matchingOption?.value || "";
  document.getElementById("directorio").scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    calcularDistancias(await obtenerUbicacionCliente());
    window.filtrarPros(true);
  } catch {
    window.filtrarPros(false);
  }
}

function estrellasVisuales(value) {
  const numericValue = Math.max(0, Math.min(5, Number(value) || 0));
  const rounded = Math.round(numericValue);
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)} <span class="rating-number">${numericValue.toFixed(1)}</span>`;
}

window.filtrarPros = function filtrarPros(ordenarPorDistancia = false) {
  const busqueda = normalizar(document.getElementById("searchInput").value);
  const categoria = categoriaActiva || document.getElementById("catFilter").value;
  const zona = normalizar(document.getElementById("zonaFilter").value);

  const lista = pros.filter((pro) => {
    const nombre = normalizar(pro.nombre);
    const especialidad = normalizar(pro.especialidad);
    const descripcion = normalizar(pro.descripcion);
    const zonaPro = normalizar(pro.zona);
    const coincideTexto = !busqueda || nombre.includes(busqueda) || especialidad.includes(busqueda) || descripcion.includes(busqueda);
    const coincideZona = !zona || zonaPro.includes(zona) || zona.includes(zonaPro) || zona === "todo uruguay";
    return coincideTexto && categoriasCompatibles(pro.especialidad, categoria) && coincideZona;
  });

  lista.sort((a, b) => {
    if (Boolean(a.destacado) !== Boolean(b.destacado)) return a.destacado ? -1 : 1;
    if (ordenarPorDistancia) return (distancias[a.id] ?? Infinity) - (distancias[b.id] ?? Infinity);
    return 0;
  });

  const grid = document.getElementById("dirGrid");
  const count = document.getElementById("dirCount");
  if (!lista.length) {
    count.textContent = "";
    grid.innerHTML = '<div class="directory-empty"><div class="empty-icon">⌕</div><p>Todavía no hay profesionales verificados para esta búsqueda.</p></div>';
    return;
  }

  count.textContent = `${lista.length} profesional${lista.length === 1 ? "" : "es"} disponible${lista.length === 1 ? "" : "s"}${ordenarPorDistancia ? " · ordenados por distancia" : ""}`;
  grid.innerHTML = lista.map((pro) => {
    const distance = distancias[pro.id];
    const travelInfo = distance != null
      ? `<span class="distance-value">${distance.toFixed(1)} km · aprox. ${Math.max(1, Math.round(distance * 1.5))} min</span> · `
      : "";
    return `<article class="professional-card${pro.destacado ? " is-featured" : ""}">
      <div class="professional-badges">
        ${pro.destacado ? '<span class="featured-badge">DESTACADO</span>' : ""}
        <span class="verified-badge">✓ Verificado</span>
      </div>
      <div class="professional-avatar">${escapeHtml(pro.nombre).charAt(0)}</div>
      <h3>${escapeHtml(pro.nombre)}</h3>
      <span class="professional-category">${escapeHtml(pro.especialidad)}</span>
      <div class="professional-location">${travelInfo}${escapeHtml(pro.zona)}</div>
      <p>${escapeHtml(pro.descripcion || "Profesional verificado por Solvenza.")}</p>
      <div class="professional-rating">${estrellasVisuales(pro.estrellas)} <span>${Number(pro.trabajos) || 0} trabajos completados</span></div>
      <button type="button" class="contact-professional" data-professional-id="${pro.id}">Contactar</button>
    </article>`;
  }).join("");
};

function crearModales() {
  document.body.insertAdjacentHTML("beforeend", `
    <div class="solvenza-modal" id="contact-modal" aria-hidden="true">
      <div class="solvenza-modal-backdrop" data-close-modal="contact-modal"></div>
      <div class="solvenza-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
        <button type="button" class="modal-close" data-close-modal="contact-modal" aria-label="Cerrar">×</button>
        <p class="modal-kicker">Contactar profesional</p>
        <h2 id="contact-modal-title">Contanos qué necesitás</h2>
        <p class="modal-subtitle" id="contact-professional-name"></p>
        <form id="contact-request-form" class="modal-form">
          <label>Nombre<input name="nombre" required maxlength="80" autocomplete="name"></label>
          <label>Teléfono<input name="telefono" type="tel" required maxlength="30" autocomplete="tel"></label>
          <label>Qué necesitás<textarea name="descripcion" required maxlength="240" rows="3"></textarea></label>
          <button type="submit" class="modal-primary">Confirmar y abrir WhatsApp</button>
        </form>
      </div>
    </div>
    <div class="solvenza-modal" id="review-modal" aria-hidden="true">
      <div class="solvenza-modal-backdrop"></div>
      <div class="solvenza-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
        <p class="modal-kicker">Tu experiencia importa</p>
        <h2 id="review-modal-title">¿Cómo te fue?</h2>
        <p class="modal-subtitle" id="review-professional-name"></p>
        <form id="review-form" class="modal-form">
          <div class="review-stars" role="radiogroup" aria-label="Puntuación">
            ${[1, 2, 3, 4, 5].map((value) => `<button type="button" role="radio" aria-checked="false" data-rating="${value}" aria-label="${value} estrellas">★</button>`).join("")}
          </div>
          <label>Comentario<textarea name="comentario" maxlength="240" rows="3" placeholder="Contanos brevemente cómo fue el servicio"></textarea></label>
          <button type="submit" class="modal-primary">Enviar reseña</button>
        </form>
      </div>
    </div>`);
}

function abrirModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function cerrarModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".solvenza-modal.is-open")) document.body.classList.remove("modal-open");
}

function guardarReviewToken(token) {
  const tokens = JSON.parse(localStorage.getItem(REVIEW_TOKENS_KEY) || "[]");
  if (!tokens.includes(token)) tokens.push(token);
  localStorage.setItem(REVIEW_TOKENS_KEY, JSON.stringify(tokens.slice(-30)));
}

function eliminarReviewToken(token) {
  const tokens = JSON.parse(localStorage.getItem(REVIEW_TOKENS_KEY) || "[]").filter((item) => item !== token);
  localStorage.setItem(REVIEW_TOKENS_KEY, JSON.stringify(tokens));
}

function abrirContacto(professionalId) {
  profesionalContacto = pros.find((pro) => pro.id === professionalId);
  if (!profesionalContacto) return;
  document.getElementById("contact-professional-name").textContent = `Vas a contactar a ${profesionalContacto.nombre}`;
  abrirModal("contact-modal");
}

async function enviarContacto(event) {
  event.preventDefault();
  if (!profesionalContacto) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  const data = new FormData(form);
  const nombre = String(data.get("nombre") || "").trim();
  const telefono = String(data.get("telefono") || "").trim();
  const descripcion = String(data.get("descripcion") || "").trim();
  const reviewToken = crypto.randomUUID();
  const whatsappWindow = window.open("about:blank", "_blank");
  button.textContent = "Guardando...";
  button.disabled = true;

  try {
    const { error } = await supabaseClient.from("contactos").insert({
      nombre_cliente: nombre,
      telefono_cliente: telefono,
      descripcion,
      profesional_id: profesionalContacto.id,
      profesional_nombre: profesionalContacto.nombre,
      resena_pendiente: true,
      review_token: reviewToken
    });
    if (error) throw error;
    guardarReviewToken(reviewToken);

    const message = encodeURIComponent(`Hola ${profesionalContacto.nombre}, tenés una solicitud en Solvenza. Cliente: ${nombre}, Tel: ${telefono}, Necesita: ${descripcion}`);
    const phone = String(profesionalContacto.telefono || "").replace(/\D/g, "");
    const whatsappUrl = `https://wa.me/${phone}?text=${message}`;
    form.reset();
    cerrarModal("contact-modal");
    if (whatsappWindow) whatsappWindow.location.href = whatsappUrl;
    else window.location.href = whatsappUrl;
  } catch (error) {
    console.error("No se pudo guardar el contacto:", error);
    if (whatsappWindow) whatsappWindow.close();
    alert("No pudimos registrar la solicitud. Intentá nuevamente.");
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

async function buscarResenaPendiente() {
  const tokens = JSON.parse(localStorage.getItem(REVIEW_TOKENS_KEY) || "[]");
  for (const token of tokens) {
    const { data, error } = await supabaseClient.rpc("obtener_resena_pendiente", { p_token: token });
    if (error) {
      console.error("No se pudo consultar la reseña pendiente:", error);
      return;
    }
    if (data?.length) {
      resenaActiva = { ...data[0], token };
      puntuacionResena = 0;
      document.getElementById("review-professional-name").textContent = `¿Cómo te fue con ${resenaActiva.profesional_nombre}?`;
      actualizarEstrellasResena();
      abrirModal("review-modal");
      return;
    }
    eliminarReviewToken(token);
  }
}

function actualizarEstrellasResena() {
  document.querySelectorAll("#review-modal [data-rating]").forEach((button) => {
    const selected = Number(button.dataset.rating) <= puntuacionResena;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", String(Number(button.dataset.rating) === puntuacionResena));
  });
}

async function enviarResena(event) {
  event.preventDefault();
  if (!resenaActiva || !puntuacionResena) {
    alert("Elegí una puntuación de 1 a 5 estrellas.");
    return;
  }
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  button.textContent = "Enviando...";
  button.disabled = true;
  try {
    const comentario = String(new FormData(form).get("comentario") || "").trim();
    const { error } = await supabaseClient.rpc("enviar_resena", {
      p_token: resenaActiva.token,
      p_estrellas: puntuacionResena,
      p_comentario: comentario || null
    });
    if (error) throw error;
    eliminarReviewToken(resenaActiva.token);
    cerrarModal("review-modal");
    form.reset();
    resenaActiva = null;
    await cargarProfesionales();
    await buscarResenaPendiente();
  } catch (error) {
    console.error("No se pudo guardar la reseña:", error);
    alert("No pudimos guardar la reseña. Intentá nuevamente.");
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

function prepararInteracciones() {
  document.querySelectorAll(".cat-card").forEach((card) => {
    const category = card.querySelector(".cname")?.textContent?.trim();
    if (!category) return;
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.setAttribute("aria-label", `Buscar profesionales de ${category}`);
    card.addEventListener("click", () => seleccionarCategoria(category));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        seleccionarCategoria(category);
      }
    });
  });

  document.getElementById("catFilter").addEventListener("change", (event) => {
    categoriaActiva = event.currentTarget.value;
    window.filtrarPros();
  });
  document.getElementById("dirGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-professional-id]");
    if (button) abrirContacto(button.dataset.professionalId);
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => cerrarModal(button.dataset.closeModal));
  });
  document.getElementById("contact-request-form").addEventListener("submit", enviarContacto);
  document.getElementById("review-form").addEventListener("submit", enviarResena);
  document.querySelectorAll("#review-modal [data-rating]").forEach((button) => {
    button.addEventListener("click", () => {
      puntuacionResena = Number(button.dataset.rating);
      actualizarEstrellasResena();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("contact-modal").classList.contains("is-open")) {
      cerrarModal("contact-modal");
    }
  });
}

function prepararUbicacionProfesional() {
  const button = document.getElementById("geo-pro-btn");
  const status = document.getElementById("geo-pro-status");
  if (!button) return;
  button.addEventListener("click", async () => {
    status.textContent = "Obteniendo ubicación...";
    try {
      const position = await obtenerUbicacionCliente();
      document.getElementById("pro-lat").value = position.coords.latitude;
      document.getElementById("pro-lng").value = position.coords.longitude;
      status.textContent = "Ubicación guardada para calcular cercanía.";
    } catch {
      status.textContent = "No pudimos obtener la ubicación. Podés registrarte igual.";
    }
  });
}

function iniciarTiempoReal() {
  supabaseClient
    .channel("directorio-profesionales")
    .on("postgres_changes", { event: "*", schema: "public", table: "profesionales" }, cargarProfesionales)
    .subscribe();
}

function prepararAnimaciones() {
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
}

crearModales();
prepararInteracciones();
prepararUbicacionProfesional();
prepararAnimaciones();
cargarProfesionales();
iniciarTiempoReal();
buscarResenaPendiente();
