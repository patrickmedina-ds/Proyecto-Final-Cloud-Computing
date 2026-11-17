// EmpleaCRM — frontend del CRM de Empleabilidad (CS2032 Grupo 1).
// SPA sin build: consume los 5 microservicios (API Gateway + Lambda) con
// Authorization: Bearer <token_acceso>. El tenant NUNCA se envía en las peticiones de
// negocio: el backend lo deduce del token (tabla t_tokens_acceso).

const ESTADOS_POSTULACION = ["postulado", "preseleccionado", "entrevista", "oferta", "contratado", "rechazado"];
const $ = (sel) => document.querySelector(sel);

// La sesión vive en sessionStorage (por pestaña): permite abrir tenant_1 y
// tenant_2 lado a lado en dos pestañas para la demo.
const sesion = {
  get token_acceso() { return sessionStorage.getItem("token_acceso"); },
  get token_refresh() { return sessionStorage.getItem("token_refresh"); },
  get tenant() { return sessionStorage.getItem("tenant_id"); },
  get email() { return sessionStorage.getItem("email"); },
  get rol() { return sessionStorage.getItem("rol"); },
  get esAdmin() { return sessionStorage.getItem("rol") === "administrador"; },
  guardar(datos) { Object.entries(datos).forEach(([k, v]) => sessionStorage.setItem(k, v)); },
  cerrar() { sessionStorage.clear(); },
};

// IDs creados en esta sesión: con 10 000 registros por tenant, lo recién creado
// no suele caer en la primera página, así que se muestra arriba de cada tabla.
const recientes = {
  leer(tipo) {
    try { return JSON.parse(sessionStorage.getItem(`recientes_${tipo}`)) || []; } catch { return []; }
  },
  agregar(tipo, id) {
    const lista = [id, ...recientes.leer(tipo).filter((x) => x !== id)].slice(0, 10);
    sessionStorage.setItem(`recientes_${tipo}`, JSON.stringify(lista));
  },
  quitar(tipo, id) {
    sessionStorage.setItem(`recientes_${tipo}`, JSON.stringify(recientes.leer(tipo).filter((x) => x !== id)));
  },
  // Devuelve los ítems que siguen existiendo (los 404 se olvidan)
  async cargar(tipo, buscar) {
    const ids = recientes.leer(tipo);
    const resultados = await Promise.allSettled(ids.map(buscar));
    return resultados.flatMap((r, i) => {
      if (r.status === "fulfilled") return [r.value];
      if (r.reason?.status === 404) recientes.quitar(tipo, ids[i]);
      return [];
    });
  },
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fecha(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  return isNaN(d) ? esc(valor) : d.toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

function idCorto(id) {
  return id ? `<span class="id" title="Clic para copiar: ${esc(id)}" data-copiar="${esc(id)}">${esc(id.slice(0, 8))}…</span>` : "—";
}

function chip(estado) {
  return `<span class="chip chip--${esc(estado)}">${esc(estado)}</span>`;
}

function soles(valor) {
  return valor == null ? "—" : `S/ ${Number(valor).toLocaleString("es-PE")}`;
}

function toast(mensaje, tipo = "") {
  const el = document.createElement("div");
  el.className = `toast ${tipo ? "toast--" + tipo : ""}`;
  el.textContent = mensaje;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 4500);
}

document.addEventListener("click", (e) => {
  const id = e.target.dataset?.copiar;
  if (id) navigator.clipboard?.writeText(id).then(() => toast("ID copiado al portapapeles"));
});

// ---------------------------------------------------------------------------
// Cliente HTTP de los microservicios
// ---------------------------------------------------------------------------

let llamadas = 0;

function registrarConsola(metodo, servicio, ruta, estado, ms) {
  llamadas += 1;
  const fila = document.createElement("tr");
  fila.innerHTML = `<td>${esc(metodo)}</td><td>${esc(servicio)}</td><td>${esc(ruta)}</td>` +
    `<td class="${estado < 400 ? "st-ok" : "st-err"}">${estado}</td><td>${ms} ms</td>`;
  $("#consola-filas").prepend(fila);
  $("#consola-contador").textContent = `· ${llamadas} llamadas`;
}

// Cierra la sesión por token vencido y avisa al usuario
function sesionExpirada() {
  sesion.cerrar();
  mostrarLogin();
  toast("Sesión expirada, vuelve a iniciar sesión", "error");
}

// Renueva el token_acceso con el token_refresh (POST /usuarios/refresh).
// Si varias peticiones reciben 401 a la vez, comparten un único refresh.
let refrescando = null;

function refrescarToken() {
  if (!refrescando) {
    refrescando = (async () => {
      const inicio = performance.now();
      let respuesta;
      try {
        respuesta = await fetch(CONFIG.usuarios + "/usuarios/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token_refresh: sesion.token_refresh }),
        });
      } catch {
        registrarConsola("POST", "usuarios", "/usuarios/refresh", 0, Math.round(performance.now() - inicio));
        return false;
      }
      registrarConsola("POST", "usuarios", "/usuarios/refresh", respuesta.status, Math.round(performance.now() - inicio));
      if (!respuesta.ok) return false;
      const { token_acceso } = await respuesta.json().catch(() => ({}));
      if (!token_acceso) return false;
      sesion.guardar({ token_acceso });
      return true;
    })().finally(() => { refrescando = null; });
  }
  return refrescando;
}

// Única puerta de salida de las llamadas autenticadas: envía token_acceso y,
// si responde 401 y hay token_refresh, renueva el token y reintenta UNA vez.
async function fetchAutenticado(servicio, metodo, ruta, cuerpo) {
  const peticion = async () => {
    const inicio = performance.now();
    const headers = { "Content-Type": "application/json" };
    if (sesion.token_acceso) headers.Authorization = `Bearer ${sesion.token_acceso}`;
    let respuesta;
    try {
      respuesta = await fetch(CONFIG[servicio] + ruta, {
        method: metodo,
        headers,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
    } catch {
      registrarConsola(metodo, servicio, ruta, 0, Math.round(performance.now() - inicio));
      throw new Error(`No se pudo conectar con el microservicio ${servicio}`);
    }
    registrarConsola(metodo, servicio, ruta, respuesta.status, Math.round(performance.now() - inicio));
    return respuesta;
  };

  let respuesta = await peticion();
  if (respuesta.status === 401 && servicio !== "usuarios") {
    if (sesion.token_refresh && await refrescarToken()) respuesta = await peticion();
    if (respuesta.status === 401) {
      sesionExpirada();
      throw new Error("Sesión expirada, vuelve a iniciar sesión");
    }
  }
  return respuesta;
}

async function api(servicio, metodo, ruta, cuerpo) {
  const respuesta = await fetchAutenticado(servicio, metodo, ruta, cuerpo);
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(`${respuesta.status} · ${datos.error || "Error en la solicitud"}`);
    error.status = respuesta.status;
    throw error;
  }
  return datos;
}

async function conBoton(boton, tarea) {
  boton.disabled = true;
  try { return await tarea(); }
  catch (e) { toast(e.message, "error"); }
  finally { boton.disabled = false; }
}

// ---------------------------------------------------------------------------
// Modal de formulario genérico
// ---------------------------------------------------------------------------

// campos: [{ name, label, type: text|email|number|select|textarea|datetime, options, required }]
function formulario(titulo, campos, valores = {}, textoOk = "Guardar") {
  $("#modal-titulo").textContent = titulo;
  $("#modal-ok").textContent = textoOk;
  $("#modal-cuerpo").innerHTML = campos.map((c) => {
    const v = valores[c.name] ?? "";
    const req = c.required ? "required" : "";
    let control;
    if (c.type === "select") {
      control = `<select name="${c.name}" ${req}>${c.options.map((o) => {
        const [valor, texto] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(valor)}" ${valor === v ? "selected" : ""}>${esc(texto)}</option>`;
      }).join("")}</select>`;
    } else if (c.type === "textarea") {
      control = `<textarea name="${c.name}" ${req}>${esc(v)}</textarea>`;
    } else if (c.type === "datetime") {
      control = `<input type="datetime-local" name="${c.name}" value="${esc(String(v).slice(0, 16))}" ${req}>`;
    } else {
      control = `<input type="${c.type || "text"}" name="${c.name}" value="${esc(v)}" ${req} ${c.type === "number" ? 'min="0" step="any"' : ""}>`;
    }
    return `<label>${esc(c.label)}${control}</label>`;
  }).join("");
  const modal = $("#modal");
  modal.returnValue = "";
  modal.showModal();
  return new Promise((resolver) => {
    modal.addEventListener("close", () => {
      if (modal.returnValue !== "ok") return resolver(null);
      const datos = {};
      for (const c of campos) {
        let valor = $("#modal-form").elements[c.name].value.trim();
        if (c.type === "number") valor = valor === "" ? undefined : Number(valor);
        if (c.type === "datetime" && valor) valor = `${valor}:00-05:00`; // hora de Lima
        if (valor !== undefined && valor !== "") datos[c.name] = valor;
      }
      resolver(datos);
    }, { once: true });
  });
}

function mostrarJson(titulo, objeto) {
  $("#modal-titulo").textContent = titulo;
  $("#modal-ok").textContent = "Cerrar";
  $("#modal-cuerpo").innerHTML = `<pre class="json">${esc(JSON.stringify(objeto, null, 2))}</pre>`;
  $("#modal").showModal();
}

// ---------------------------------------------------------------------------
// Login (microservicio Usuarios)
// ---------------------------------------------------------------------------

function mostrarLogin() {
  $("#app").hidden = true;
  $("#pantalla-login").hidden = false;
  document.documentElement.style.setProperty("--tenant", "#2563eb");
}

$("#form-login").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  conBoton($("#btn-login"), async () => {
    // El usuario no elige empresa: el backend deduce el tenant de su correo
    // y lo devuelve en la respuesta del login.
    let datos;
    try {
      datos = await api("usuarios", "POST", "/usuarios/login", { email: f.email, password: f.password });
    } catch (e) {
      if (e.status === 401) throw new Error("Correo o contraseña incorrectos");
      throw e;
    }
    const { token_acceso, token_refresh, tenant_id, rol } = datos;
    if (!tenant_id) throw new Error("El login no devolvió el tenant_id");
    sesion.guardar({ token_acceso, token_refresh, tenant_id, rol: rol || "reclutador", email: f.email });
    iniciarApp();
  });
});

$("#btn-salir").addEventListener("click", () => { sesion.cerrar(); mostrarLogin(); });

function iniciarApp() {
  const t = TENANTS[sesion.tenant] || { nombre: sesion.tenant, color: "#2563eb" };
  document.documentElement.style.setProperty("--tenant", t.color);
  document.title = `EmpleaCRM · ${t.nombre}`;
  $("#tenant-badge").innerHTML = `<span>Tenant activo</span><b>${esc(t.nombre)}</b>${esc(sesion.tenant)}`;
  $("#usuario-email").textContent = sesion.email;
  // El apartado Usuarios solo existe para administradores
  $("#menu-usuarios").hidden = !sesion.esAdmin;
  $("#pantalla-login").hidden = true;
  $("#app").hidden = false;
  if (!location.hash) location.hash = "#/dashboard";
  enrutar();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const VISTAS = {
  dashboard: ["Dashboard", vistaDashboard],
  candidatos: ["Candidatos", vistaCandidatos],
  vacantes: ["Vacantes", vistaVacantes],
  pipeline: ["Pipeline de postulaciones", vistaPipeline],
  entrevistas: ["Entrevistas", vistaEntrevistas],
  usuarios: ["Usuarios", vistaUsuarios],
};

function enrutar() {
  if (!sesion.token_acceso) return mostrarLogin();
  let nombre = location.hash.replace("#/", "") || "dashboard";
  if (nombre === "usuarios" && !sesion.esAdmin) nombre = "dashboard";
  const [titulo, render] = VISTAS[nombre] || VISTAS.dashboard;
  document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("activo", a.dataset.vista === nombre));
  $("#titulo-vista").textContent = titulo;
  $("#acciones-vista").innerHTML = "";
  $("#vista").onclick = null;
  $("#vista").innerHTML = `<div class="vacio">Cargando…</div>`;
  render().catch((e) => {
    $("#vista").innerHTML = `<div class="vacio">${esc(e.message)}</div>`;
  });
}

window.addEventListener("hashchange", enrutar);

function acciones(html) {
  $("#acciones-vista").innerHTML = html;
}

// ---------------------------------------------------------------------------
// Dashboard (microservicio Reportes)
// ---------------------------------------------------------------------------

function barras(conteos, orden) {
  const claves = orden || Object.keys(conteos || {});
  const max = Math.max(1, ...claves.map((k) => conteos?.[k] || 0));
  return claves.map((k) => {
    const n = conteos?.[k] || 0;
    return `<div class="barra"><span>${esc(k)}</span>` +
      `<div class="barra__pista"><div class="barra__relleno" style="width:${(n * 100) / max}%"></div></div>` +
      `<span class="barra__num">${n.toLocaleString("es-PE")}</span></div>`;
  }).join("");
}

async function vistaDashboard() {
  acciones(`<button class="btn btn--primario" id="btn-generar">↻ Recalcular reporte</button>`);
  $("#btn-generar").onclick = (e) => conBoton(e.target, async () => {
    toast("Recalculando métricas del tenant (lee las tablas de los otros microservicios)…");
    const { reporte } = await api("reportes", "POST", "/reportes/generar", {});
    pintarDashboard(reporte);
    toast("Reporte actualizado", "ok");
  });
  try {
    const { reporte } = await api("reportes", "GET", "/reportes/resumen_general");
    pintarDashboard(reporte);
  } catch (e) {
    if (e.status !== 404) throw e;
    $("#vista").innerHTML = `<div class="vacio">Aún no hay un resumen para este tenant. Pulsa “Recalcular reporte”.</div>`;
  }
}

function pintarDashboard(r) {
  const kpi = (valor, etiqueta) =>
    `<div class="kpi"><div class="kpi__valor">${esc(valor)}</div><div class="kpi__etiqueta">${esc(etiqueta)}</div></div>`;
  const n = (v) => Number(v || 0).toLocaleString("es-PE");
  $("#vista").innerHTML = `
    <div class="kpis">
      ${kpi(n(r.total_candidatos), "Candidatos")}
      ${kpi(n(r.total_vacantes), "Vacantes")}
      ${kpi(n(r.total_postulaciones), "Postulaciones")}
      ${kpi(n(r.total_entrevistas), "Entrevistas")}
      ${kpi(n(r.total_contratados), "Contratados")}
      ${kpi(`${r.tasa_contratacion ?? 0} %`, "Tasa de contratación")}
    </div>
    <div class="paneles">
      <div class="panel"><h3>Embudo de postulaciones</h3>${barras(r.postulaciones_por_estado, ESTADOS_POSTULACION)}</div>
      <div class="panel"><h3>Vacantes por estado</h3>${barras(r.vacantes_por_estado)}
        <h3 style="margin-top:18px">Entrevistas por estado</h3>${barras(r.entrevistas_por_estado)}</div>
    </div>
    <p class="sub">Tenant <b>${esc(r.tenant_id)}</b> · actualizado ${fecha(r.fecha_actualizacion)} ·
      ${n(r.total_usuarios)} usuarios reclutadores</p>`;
}

// ---------------------------------------------------------------------------
// Candidatos (microservicio Candidatos + S3)
// ---------------------------------------------------------------------------

const CAMPOS_CANDIDATO = [
  { name: "nombre", label: "Nombre completo", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "telefono", label: "Teléfono", required: true },
  { name: "profesion", label: "Profesión", required: true },
];

async function vistaCandidatos() {
  acciones(`
    <input id="buscar-id" placeholder="Buscar por candidato_id">
    <button class="btn" id="btn-buscar">Buscar</button>
    <button class="btn btn--primario" id="btn-nuevo">+ Nuevo candidato</button>`);
  $("#btn-buscar").onclick = (e) => conBoton(e.target, async () => {
    const id = $("#buscar-id").value.trim();
    if (!id) return;
    const { candidato } = await api("candidatos", "GET", `/candidatos/${encodeURIComponent(id)}`);
    mostrarJson("Candidato encontrado", candidato);
  });
  $("#btn-nuevo").onclick = async () => {
    const datos = await formulario("Nuevo candidato", CAMPOS_CANDIDATO);
    if (!datos) return;
    try {
      const { candidato } = await api("candidatos", "POST", "/candidatos", datos);
      recientes.agregar("candidatos", candidato.candidato_id);
      toast(`Candidato creado: ${candidato.candidato_id}`, "ok");
      vistaCandidatos();
    } catch (e) { toast(e.message, "error"); }
  };
  await tablaPaginada({
    clave: "candidato_id",
    nuevos: await recientes.cargar("candidatos", buscarCandidatoPorId),
    cargar: (cursor) => api("candidatos", "GET", "/candidatos" + (cursor ? `?ultimo_id=${encodeURIComponent(cursor)}` : ""))
      .then((d) => ({ items: d.candidatos, cursor: d.ultimo_id })),
    columnas: ["ID", "Nombre", "Email", "Teléfono", "Profesión", "Estado", "CV", ""],
    fila: (c) => `
      <td>${idCorto(c.candidato_id)}</td><td><b>${esc(c.nombre)}</b></td><td>${esc(c.email)}</td>
      <td>${esc(c.telefono)}</td><td>${esc(c.profesion)}</td><td>${chip(c.estado)}</td>
      <td>${c.cv_url ? "📄 cargado" : "—"}</td>
      <td><div class="acciones">
        <button class="btn btn--mini" data-accion="editar">Editar</button>
        <button class="btn btn--mini" data-accion="cv">Subir CV</button>
        <button class="btn btn--mini btn--peligro" data-accion="eliminar">Eliminar</button>
      </div></td>`,
    acciones: {
      editar: async (c) => {
        const datos = await formulario("Editar candidato", [...CAMPOS_CANDIDATO,
          { name: "estado", label: "Estado", type: "select", options: ["activo", "inactivo"] }], c);
        if (!datos) return;
        await api("candidatos", "PUT", `/candidatos/${c.candidato_id}`, datos);
        toast("Candidato modificado", "ok");
        vistaCandidatos();
      },
      cv: (c) => subirCV(c),
      eliminar: async (c) => {
        if (!(await confirmar(`¿Eliminar a ${c.nombre}?`))) return;
        await api("candidatos", "DELETE", `/candidatos/${c.candidato_id}`);
        recientes.quitar("candidatos", c.candidato_id);
        toast("Candidato eliminado", "ok");
        vistaCandidatos();
      },
    },
  });
}

function buscarCandidatoPorId(id) {
  return api("candidatos", "GET", `/candidatos/${encodeURIComponent(id)}`).then((d) => d.candidato);
}

function subirCV(c) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf";
  input.onchange = async () => {
    const archivo = input.files[0];
    if (!archivo) return;
    try {
      // 1) Lambda genera URL prefirmada  2) PUT directo a S3  3) Lambda confirma y guarda cv_url
      const { url_subida } = await api("candidatos", "POST", `/candidatos/${c.candidato_id}/cv-url`, {});
      const s3 = await fetch(url_subida, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: archivo });
      registrarConsola("PUT", "s3", "/cv.pdf (URL prefirmada)", s3.status, 0);
      if (!s3.ok) throw new Error(`S3 rechazó la subida (${s3.status})`);
      await api("candidatos", "POST", `/candidatos/${c.candidato_id}/cv-url`, { confirmar: true });
      toast("CV subido a S3", "ok");
      vistaCandidatos();
    } catch (e) { toast(e.message, "error"); }
  };
  input.click();
}

function confirmar(pregunta) {
  return formulario(pregunta, [], {}, "Sí, confirmar").then((r) => r !== null);
}

// Tabla con paginación "Cargar más" (cada API devuelve 100 ítems + cursor).
// `nuevos`: ítems creados en esta sesión, se muestran primero y resaltados.
async function tablaPaginada({ cargar, columnas, fila, acciones: manejadores, nuevos = [], clave }) {
  const items = [];
  const idsNuevos = new Set(nuevos.map((it) => it[clave]));
  let cursor = null;
  $("#vista").innerHTML = `
    <div class="tabla-caja">
      <table><thead><tr>${columnas.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody id="cuerpo"></tbody></table>
      <div class="pie-tabla"><span class="sub" id="conteo"></span>
        <button class="btn" id="btn-mas" hidden>Cargar más</button></div>
    </div>`;
  const cuerpo = $("#cuerpo");
  cuerpo.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    const item = items[Number(boton.closest("tr").dataset.indice)];
    conBoton(boton, () => manejadores[boton.dataset.accion](item));
  });
  function agregarFilas(lista, clase = "") {
    const desde = items.length;
    items.push(...lista);
    cuerpo.insertAdjacentHTML("beforeend",
      lista.map((it, i) => `<tr class="${clase}" data-indice="${desde + i}">${fila(it)}</tr>`).join(""));
  }
  agregarFilas(nuevos, "nuevo");
  async function siguiente() {
    const pagina = await cargar(cursor);
    cursor = pagina.cursor;
    agregarFilas(pagina.items.filter((it) => !idsNuevos.has(it[clave])));
    $("#conteo").textContent = `${items.length.toLocaleString("es-PE")} registros mostrados${cursor ? " · hay más" : ""}`;
    $("#btn-mas").hidden = !cursor;
    if (!items.length) cuerpo.innerHTML = `<tr><td colspan="${columnas.length}" class="vacio">Sin registros</td></tr>`;
  }
  $("#btn-mas").onclick = (e) => conBoton(e.target, siguiente);
  await siguiente();
}

// ---------------------------------------------------------------------------
// Vacantes (microservicio Vacantes/Postulaciones)
// ---------------------------------------------------------------------------

const CAMPOS_VACANTE = [
  { name: "titulo", label: "Título", required: true },
  { name: "descripcion", label: "Descripción", type: "textarea", required: true },
  { name: "area", label: "Área" },
  { name: "ubicacion", label: "Ubicación" },
  { name: "modalidad", label: "Modalidad", type: "select", options: ["presencial", "remoto", "hibrido"] },
  { name: "salario", label: "Salario (S/)", type: "number" },
];

async function vistaVacantes() {
  const filtro = sessionStorage.getItem("filtro_vacantes") || "";
  acciones(`
    <select id="filtro-estado">
      <option value="">Todas</option><option value="abierta">Abiertas</option><option value="cerrada">Cerradas</option>
    </select>
    <button class="btn btn--primario" id="btn-nueva">+ Nueva vacante</button>`);
  $("#filtro-estado").value = filtro;
  $("#filtro-estado").onchange = (e) => { sessionStorage.setItem("filtro_vacantes", e.target.value); enrutar(); };
  $("#btn-nueva").onclick = async () => {
    const datos = await formulario("Nueva vacante", CAMPOS_VACANTE);
    if (!datos) return;
    try {
      const { vacante } = await api("vacantes", "POST", "/vacantes", datos);
      recientes.agregar("vacantes", vacante.vacante_id);
      toast("Vacante publicada", "ok");
      enrutar();
    } catch (e) { toast(e.message, "error"); }
  };
  await tablaPaginada({
    clave: "vacante_id",
    nuevos: await recientes.cargar("vacantes",
      (id) => api("vacantes", "GET", `/vacantes/${encodeURIComponent(id)}`).then((d) => d.vacante)),
    cargar: (cursor) => {
      const q = new URLSearchParams();
      if (filtro) q.set("estado", filtro);
      if (cursor) q.set("cursor", cursor);
      return api("vacantes", "GET", `/vacantes?${q}`).then((d) => ({ items: d.vacantes, cursor: d.cursor }));
    },
    columnas: ["ID", "Título", "Área", "Modalidad", "Ubicación", "Salario", "Estado", "Publicada", ""],
    fila: (v) => `
      <td>${idCorto(v.vacante_id)}</td><td><b>${esc(v.titulo)}</b><div class="sub">${esc((v.descripcion || "").slice(0, 70))}</div></td>
      <td>${esc(v.area || "—")}</td><td>${esc(v.modalidad || "—")}</td><td>${esc(v.ubicacion || "—")}</td>
      <td>${soles(v.salario)}</td><td>${chip(v.estado)}</td><td>${fecha(v.fecha_publicacion)}</td>
      <td><div class="acciones">
        ${v.estado === "abierta" ? `<button class="btn btn--mini" data-accion="postular">Postular</button>` : ""}
        <button class="btn btn--mini" data-accion="pipeline">Pipeline</button>
        <button class="btn btn--mini" data-accion="editar">Editar</button>
        <button class="btn btn--mini" data-accion="estado">${v.estado === "abierta" ? "Cerrar" : "Reabrir"}</button>
        <button class="btn btn--mini btn--peligro" data-accion="eliminar">Eliminar</button>
      </div></td>`,
    acciones: {
      postular: async (v) => {
        // Primero los candidatos creados en esta sesión, luego la primera página
        const nuevos = await recientes.cargar("candidatos", buscarCandidatoPorId);
        const { candidatos } = await api("candidatos", "GET", "/candidatos");
        const lista = [...nuevos, ...candidatos.filter((c) => !nuevos.some((n) => n.candidato_id === c.candidato_id))];
        const datos = await formulario(`Postular a “${v.titulo}”`, [
          { name: "candidato_id", label: "Candidato", type: "select", required: true,
            options: lista.map((c) => [c.candidato_id, `${c.nombre} · ${c.profesion}`]) },
          { name: "otro_id", label: "…o pega otro candidato_id" },
          { name: "notas", label: "Notas", type: "textarea" },
        ], {}, "Postular");
        if (!datos) return;
        const { otro_id, ...cuerpo } = datos;
        if (otro_id) cuerpo.candidato_id = otro_id;
        await api("vacantes", "POST", "/postulaciones", { vacante_id: v.vacante_id, ...cuerpo });
        toast("Postulación creada en estado “postulado”. Ábrela con el botón Pipeline", "ok");
      },
      pipeline: (v) => {
        sessionStorage.setItem("pipeline_vacante", JSON.stringify({ id: v.vacante_id, titulo: v.titulo }));
        location.hash = "#/pipeline";
      },
      editar: async (v) => {
        const datos = await formulario("Editar vacante", CAMPOS_VACANTE, v);
        if (!datos) return;
        await api("vacantes", "PUT", `/vacantes/${v.vacante_id}`, datos);
        toast("Vacante modificada", "ok");
        enrutar();
      },
      estado: async (v) => {
        await api("vacantes", "PUT", `/vacantes/${v.vacante_id}`, { estado: v.estado === "abierta" ? "cerrada" : "abierta" });
        toast("Estado actualizado", "ok");
        enrutar();
      },
      eliminar: async (v) => {
        if (!(await confirmar(`¿Eliminar la vacante “${v.titulo}”?`))) return;
        await api("vacantes", "DELETE", `/vacantes/${v.vacante_id}`);
        recientes.quitar("vacantes", v.vacante_id);
        toast("Vacante eliminada", "ok");
        enrutar();
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Pipeline (postulaciones por estado, usa el GSI indice_estado)
// ---------------------------------------------------------------------------

async function vistaPipeline() {
  let vacante = null;
  try { vacante = JSON.parse(sessionStorage.getItem("pipeline_vacante")); } catch { /* sin filtro */ }
  if (vacante) {
    acciones(`<span class="chip">Vacante: ${esc(vacante.titulo)}</span>
      <button class="btn btn--mini" id="btn-quitar">✕ Ver todas</button>`);
    $("#btn-quitar").onclick = () => { sessionStorage.removeItem("pipeline_vacante"); enrutar(); };
  } else {
    acciones(`<span class="sub">Hasta 100 postulaciones por etapa · usa “Pipeline” en una vacante para filtrarla</span>`);
  }
  const filtro = vacante ? `&vacante_id=${encodeURIComponent(vacante.id)}` : "";
  const columnas = await Promise.all(ESTADOS_POSTULACION.map((estado) =>
    api("vacantes", "GET", `/postulaciones?estado=${estado}${filtro}`).then((d) => [estado, d.postulaciones, d.cursor])));
  const porId = {};
  $("#vista").innerHTML = `<div class="kanban">${columnas.map(([estado, lista, cursor]) => `
    <div class="columna"><h3>${esc(estado)} <span class="sub">${lista.length}${cursor ? "+" : ""}</span></h3>
      <div class="columna__lista">${lista.map((p) => {
        porId[p.postulacion_id] = p;
        const i = ESTADOS_POSTULACION.indexOf(p.estado);
        return `<div class="carta" data-id="${esc(p.postulacion_id)}">
          <b>${esc(p.titulo_vacante || "Vacante")}</b>
          <span class="sub">Candidato ${idCorto(p.candidato_id)} · ${fecha(p.fecha_actualizacion)}</span>
          <div class="acciones">
            ${i > 0 && p.estado !== "rechazado" ? `<button class="btn btn--mini" data-mover="${ESTADOS_POSTULACION[i - 1]}">◀</button>` : ""}
            ${i < 4 ? `<button class="btn btn--mini" data-mover="${ESTADOS_POSTULACION[i + 1]}">▶</button>` : ""}
            ${i < 4 ? `<button class="btn btn--mini btn--peligro" data-mover="rechazado">✕</button>` : ""}
            <button class="btn btn--mini" data-ver>👤</button>
            ${p.estado === "entrevista" ? `<button class="btn btn--mini" data-agendar>📅</button>` : ""}
          </div></div>`;
      }).join("") || `<div class="sub">Vacío</div>`}</div></div>`).join("")}</div>`;

  $("#vista").onclick = (e) => {
    const boton = e.target.closest("button");
    if (!boton) return;
    const p = porId[boton.closest(".carta").dataset.id];
    if (boton.dataset.mover) {
      conBoton(boton, async () => {
        await api("vacantes", "PUT", `/postulaciones/${p.postulacion_id}`, { estado: boton.dataset.mover });
        toast(`Postulación movida a “${boton.dataset.mover}”`, "ok");
        vistaPipeline();
      });
    } else if ("ver" in boton.dataset) {
      conBoton(boton, async () => {
        const { candidato } = await api("candidatos", "GET", `/candidatos/${p.candidato_id}`);
        mostrarJson(`Candidato de “${p.titulo_vacante}”`, candidato);
      });
    } else if ("agendar" in boton.dataset) {
      agendarEntrevista(p);
    }
  };
}

// ---------------------------------------------------------------------------
// Entrevistas (microservicio Entrevistas/Seguimiento)
// ---------------------------------------------------------------------------

const CAMPOS_ENTREVISTA = [
  { name: "entrevistador", label: "Entrevistador", required: true },
  { name: "fecha_hora", label: "Fecha y hora (Lima)", type: "datetime", required: true },
  { name: "modalidad", label: "Modalidad", type: "select", options: ["virtual", "presencial"] },
  { name: "notas", label: "Notas", type: "textarea" },
];

async function agendarEntrevista(p) {
  const datos = await formulario(`Agendar entrevista · ${p.titulo_vacante || ""}`, CAMPOS_ENTREVISTA, {}, "Agendar");
  if (!datos) return;
  try {
    const { entrevista } = await api("entrevistas", "POST", "/entrevistas", {
      candidato_id: p.candidato_id, vacante_id: p.vacante_id, postulacion_id: p.postulacion_id, ...datos,
    });
    recientes.agregar("entrevistas", entrevista.entrevista_id);
    toast("Entrevista agendada: aparece arriba en Entrevistas", "ok");
  } catch (e) { toast(e.message, "error"); }
}

async function vistaEntrevistas() {
  const filtro = sessionStorage.getItem("filtro_entrevistas") || "";
  acciones(`
    <select id="filtro-estado">
      <option value="">Todas</option><option value="agendada">Agendadas</option>
      <option value="realizada">Realizadas</option><option value="cancelada">Canceladas</option>
    </select>
    <button class="btn btn--primario" id="btn-agendar">+ Agendar entrevista</button>`);
  $("#filtro-estado").value = filtro;
  $("#filtro-estado").onchange = (e) => { sessionStorage.setItem("filtro_entrevistas", e.target.value); enrutar(); };
  $("#btn-agendar").onclick = async (e) => {
    await conBoton(e.target, async () => {
      const { postulaciones } = await api("vacantes", "GET", "/postulaciones?estado=entrevista");
      if (!postulaciones.length) return toast("No hay postulaciones en etapa “entrevista”", "error");
      const eleccion = await formulario("¿Para qué postulación?", [{
        name: "postulacion_id", label: "Postulación en etapa entrevista", type: "select",
        options: postulaciones.map((p) => [p.postulacion_id, `${p.titulo_vacante} · cand. ${p.candidato_id.slice(0, 8)}`]),
      }], {}, "Continuar");
      if (eleccion) agendarEntrevista(postulaciones.find((p) => p.postulacion_id === eleccion.postulacion_id));
    });
  };
  await tablaPaginada({
    clave: "entrevista_id",
    nuevos: await recientes.cargar("entrevistas",
      (id) => api("entrevistas", "GET", `/entrevistas/${encodeURIComponent(id)}`).then((d) => d.entrevista)),
    cargar: (cursor) => {
      const q = new URLSearchParams();
      if (filtro) q.set("estado", filtro);
      if (cursor) q.set("cursor", cursor);
      return api("entrevistas", "GET", `/entrevistas?${q}`).then((d) => ({ items: d.entrevistas, cursor: d.cursor }));
    },
    columnas: ["ID", "Fecha y hora", "Entrevistador", "Modalidad", "Candidato", "Vacante", "Estado", "Notas", ""],
    fila: (en) => `
      <td>${idCorto(en.entrevista_id)}</td><td>${fecha(en.fecha_hora)}</td><td><b>${esc(en.entrevistador)}</b></td>
      <td>${esc(en.modalidad)}</td><td>${idCorto(en.candidato_id)}</td><td>${idCorto(en.vacante_id)}</td>
      <td>${chip(en.estado)}</td><td class="sub">${esc((en.notas || "").slice(0, 60))}</td>
      <td><div class="acciones">
        ${en.estado === "agendada" ? `<button class="btn btn--mini" data-accion="realizada">✔ Realizada</button>
          <button class="btn btn--mini" data-accion="cancelada">Cancelar</button>` : ""}
        <button class="btn btn--mini" data-accion="editar">Editar</button>
        <button class="btn btn--mini btn--peligro" data-accion="eliminar">Eliminar</button>
      </div></td>`,
    acciones: {
      realizada: (en) => cambiarEntrevista(en, { estado: "realizada" }),
      cancelada: (en) => cambiarEntrevista(en, { estado: "cancelada" }),
      editar: async (en) => {
        const datos = await formulario("Editar entrevista", CAMPOS_ENTREVISTA, en);
        if (datos) await cambiarEntrevista(en, datos);
      },
      eliminar: async (en) => {
        if (!(await confirmar("¿Eliminar esta entrevista?"))) return;
        await api("entrevistas", "DELETE", `/entrevistas/${en.entrevista_id}`);
        recientes.quitar("entrevistas", en.entrevista_id);
        toast("Entrevista eliminada", "ok");
        enrutar();
      },
    },
  });
}

async function cambiarEntrevista(en, cambios) {
  await api("entrevistas", "PUT", `/entrevistas/${en.entrevista_id}`, cambios);
  toast("Entrevista actualizada", "ok");
  enrutar();
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

if (sesion.token_acceso) iniciarApp(); else mostrarLogin();

// ---------------------------------------------------------------------------
// Usuarios (microservicio Usuarios) — solo administradores
// ---------------------------------------------------------------------------

async function vistaUsuarios() {
  $("#vista").innerHTML = `
    <form id="form-usuario" class="tarjeta">
      <h3>Crear usuario</h3>
      <p class="sub">El usuario se crea en tu empresa (el tenant sale de tu sesión).</p>
      <label>Nombre
        <input name="nombre" required autocomplete="off">
      </label>
      <label>Email
        <input name="email" type="email" required autocomplete="off">
      </label>
      <label>Contraseña
        <input name="password" type="password" required autocomplete="new-password">
      </label>
      <label>Rol
        <select name="rol">
          <option value="reclutador" selected>reclutador</option>
          <option value="administrador">administrador</option>
        </select>
      </label>
      <button class="btn btn--primario" type="submit">Crear usuario</button>
      <p id="resultado-usuario" class="sub"></p>
    </form>`;
  $("#form-usuario").onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const resultado = $("#resultado-usuario");
    resultado.textContent = "";
    conBoton(e.submitter, async () => {
      try {
        await api("usuarios", "POST", "/usuarios", {
          nombre: f.nombre, email: f.email, password: f.password, rol: f.rol,
        });
        resultado.textContent = `Usuario creado: ${f.email} (${f.rol})`;
        toast("Usuario creado", "ok");
        e.target.reset();
      } catch (err) {
        resultado.textContent = err.message;
        throw err;
      }
    });
  };
}
