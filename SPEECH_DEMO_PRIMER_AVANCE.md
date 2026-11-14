# Speech y guion de demo — Primer avance (CS2032 · Grupo 1)

**Proyecto:** EmpleaCRM — CRM de Empleabilidad Nacional (SaaS multi-tenant, serverless, basado en eventos)
**Duración objetivo:** 12–15 minutos (Parte 1 ≈ 4 min · Parte 2 ≈ 5 min · Parte 3 ≈ 5 min)

> Formato: los bloques **🎤** son lo que se dice; los bloques **🖱️** son lo que se hace en pantalla;
> los bloques **⌨️** son los datos exactos que hay que escribir o pegar.

---

## 0. Preparación (hacerla 15 minutos antes)

| # | Qué preparar | Detalle |
|---|---|---|
| 1 | Iniciar el **Learner Lab** y entrar a la consola de AWS | Región **us-east-1 (N. Virginia)** |
| 2 | Pestaña 1 — Diagrama | `Diagrama_Arquitectura_Solucion.png` (o el `.drawio` en draw.io) |
| 3 | Pestaña 2 — Lambda | Consola → Lambda → Funciones → buscar `cs2032` |
| 4 | Pestaña 3 — API Gateway | Consola → API Gateway → `dev-cs2032-candidatos` |
| 5 | Pestaña 4 — DynamoDB | Consola → DynamoDB → Tablas → `t_candidatos-dev` → **Explorar elementos de la tabla** |
| 6 | Pestaña 5 — Swagger | https://main.d2mg8kior54du3.amplifyapp.com/docs.html |
| 7 | Pestaña 6 — Frontend tenant_1 | https://main.d2mg8kior54du3.amplifyapp.com (sin iniciar sesión aún) |
| 8 | Pestaña 7 — Frontend tenant_2 | **Otra pestaña nueva** con la misma URL (cada pestaña tiene su propia sesión) |
| 9 | Un PDF en el escritorio | `cv_valeria.pdf` (cualquier PDF pequeño), solo si se va a mostrar la subida a S3 |
| 10 | Zoom del navegador | 110–125 % para que se lea en la videollamada |

**Usuarios de prueba** (ya existen en la base):

| Tenant | Empresa (en el frontend) | Email | Contraseña |
|---|---|---|---|
| `tenant_1` | Talento Andino S.A.C. (azul) | `demo.tenant_1@cs2032.test` | `Demo-cs2032` |
| `tenant_2` | Recluta Perú Consultores (verde) | `demo.tenant_2@cs2032.test` | `Demo-cs2032` |

⚠️ El token dura **2 horas**. Si la demo empieza más tarde, vuelvan a iniciar sesión justo antes.

**Reparto sugerido:** Parte 1 → Patrick · Parte 2 → Sandra y Santiago · Parte 3 → Sanders (ajústenlo como prefieran).

---

## Introducción (30 s)

🎤 *"Buenas tardes. Somos el Grupo 1 y nuestro SaaS es un **CRM de empleabilidad**. Lo usan empresas y agencias de
reclutamiento, que son nuestros **tenants**. Cada una gestiona en la misma plataforma a sus **candidatos**, sus
**vacantes**, el **pipeline de postulaciones** (que en un CRM es la oportunidad de venta), las **entrevistas** (las
actividades de seguimiento) y los **reportes** de contratación. Todo está construido en AWS de forma serverless,
multi-tenant y con un componente basado en eventos. Vamos a mostrar el diagrama, el backend y el frontend."*

---

## PARTE 1 — Diagrama de arquitectura (≈ 4 min)

🖱️ Pestaña 1: diagrama completo en pantalla. Recorrerlo de izquierda a derecha señalando cada bloque.

### 1.1 Recorrido general

🎤 *"A la izquierda están los **tres tenants**: tres empresas que usan la misma aplicación. Entran por el
**frontend en AWS Amplify**, que es una aplicación web que consume nuestras APIs por HTTPS."*

🎤 *"Tenemos **5 microservicios**. Cada uno tiene **su propio API Gateway** (REST): `dev-cs2032-usuarios`,
`dev-cs2032-candidatos`, `dev-cs2032-vacantes`, `dev-cs2032-entrevistas` y `dev-cs2032-reportes`."*

🎤 *"Detrás de cada API hay **una función Lambda por endpoint**, no una sola Lambda por servicio. En total son
**29 funciones** en Python 3.11:*
- *Usuarios tiene 3: crear usuario, login y validar token.*
- *Candidatos tiene 6: el CRUD de 5 operaciones más la que genera la URL para subir el CV.*
- *Vacantes y Postulaciones tiene 10: el CRUD de vacantes y el CRUD de postulaciones.*
- *Entrevistas tiene 5 y Reportes tiene 5.*

*Así cada función tiene una sola responsabilidad, escala de forma independiente y se despliega por separado."*

🎤 *"A la derecha está la **capa de datos**. Cada microservicio tiene **su propia base de datos** en DynamoDB:*
- *`t_usuarios` y `t_tokens_acceso`,*
- *`t_candidatos`,*
- *`t_vacantes` y `t_postulaciones`, que tiene índices secundarios por estado y por vacante para el pipeline,*
- *`t_entrevistas`,*
- *`t_reportes`.*

*Cada microservicio tiene **30 000 registros ficticios**, 10 000 por tenant."*

### 1.2 Integración con S3, SNS y SQS

🎤 *"**S3** guarda los CV de los candidatos. El flujo es así: el frontend le pide a la Lambda `generarUrlSubidaCV`
una **URL prefirmada** que vale 5 minutos. Con esa URL, el navegador sube el PDF **directo a S3**, sin pasar el
archivo por la Lambda. El archivo se guarda en la ruta `tenant_id/candidato_id/cv.pdf`, así que incluso en S3 los
archivos están separados por tenant."*

🎤 *"**SNS y SQS** forman la parte basada en eventos. Cuando se agenda una entrevista, la Lambda `crearEntrevista`
guarda el registro y **publica un evento** en el tópico SNS `topico-entrevistas-agendadas`. El tópico lo entrega a la
cola SQS `cola-notificaciones-entrevistas`. La cola dispara la Lambda `procesarNotificacion`, que envía el
recordatorio al candidato y al entrevistador, y queda el registro en CloudWatch. El usuario no espera a que se envíe
la notificación: la API responde en cuanto la entrevista se guarda y el resto ocurre de forma asíncrona. Este flujo
está diseñado y lo implementamos en la segunda fase, por eso aparece marcado como **Fase 2**."*

### 1.3 Cómo manejamos el multi-tenancy (punto clave, decirlo despacio)

🎤 *"Usamos el modelo **pool**: todos los tenants comparten las mismas tablas, pero cada registro está aislado
por su **partition key, que siempre es `tenant_id`**. En DynamoDB eso significa que los datos de cada empresa
viven en su propia partición."*

🎤 *"Lo más importante es **de dónde sale el `tenant_id`**. **El cliente nunca lo envía** en el body ni en la URL de
las operaciones de negocio:*
1. *Al hacer **login**, el microservicio de Usuarios crea un token y lo guarda en `t_tokens_acceso` junto con el
   `tenant_id` del usuario y una fecha de expiración de 2 horas.*
2. *En cada petición, el frontend envía el header `Authorization: Bearer <token>`.*
3. *Las 26 Lambdas de los otros 4 microservicios ejecutan primero `validar_token()`: buscan el token en
   `t_tokens_acceso`, verifican que no haya expirado y **obtienen de ahí el `tenant_id`**.*
4. *Toda consulta, inserción, actualización o eliminación usa ese `tenant_id` como parte de la clave.*

*Como el tenant viene del token y no de lo que escribe el usuario, es **imposible** pedir datos de otra empresa.
Aunque alguien conozca el ID de un registro ajeno, la clave que se arma es `(su_tenant, id_ajeno)`, que no existe,
y la respuesta es **404**. Lo vamos a demostrar en vivo."*

🎤 *"Para la segunda fase, el microservicio de Vacantes migra a **RDS MySQL** con el patrón **Single Database,
Multiple Schemas**: un schema por tenant, y el token decide a qué schema conectarse."*

### 1.4 Despliegue

🎤 *"Todo se despliega con **Serverless Framework**: un `serverless.yml` por microservicio crea, con
CloudFormation, las Lambdas, el API Gateway y las tablas. Soporta los stages `dev`, `test` y `prod`."*

---

## PARTE 2 — Backend (≈ 5 min)

### 2.1 Lambdas en AWS

🖱️ Pestaña 2 (Lambda): en el buscador de funciones escribir:

⌨️ `cs2032`

🎤 *"Aquí están las **29 funciones Lambda** desplegadas en `us-east-1`. El nombre sigue el patrón
`servicio-stage-función`, por ejemplo `cs2032-candidatos-dev-crearCandidato`."*

🖱️ Abrir **`cs2032-candidatos-dev-crearCandidato`**:
- En el diagrama de la función, señalar el **desencadenador API Gateway**.
- Ir a **Configuración → Variables de entorno**: `CANDIDATOS_TABLE = t_candidatos-dev` y `TOKENS_TABLE = t_tokens_acceso-dev`.
- (Opcional) Ir a la pestaña **Código** y mostrar la función `validar_token` al inicio de `handler.py`.

🎤 *"Cada Lambda recibe por variables de entorno el nombre de su tabla y el de la tabla de tokens. Lo primero
que hace es validar el token."*

### 2.2 API Gateway en AWS

🖱️ Pestaña 3: API Gateway → **`dev-cs2032-candidatos`** → **Recursos**.

🎤 *"Este es el API Gateway de Candidatos. Tiene los recursos `/candidatos` con GET y POST,
`/candidatos/{candidato_id}` con GET, PUT y DELETE, y `/candidatos/{candidato_id}/cv-url` con POST. Los métodos
OPTIONS son para CORS, porque el frontend está en otro dominio."*

🖱️ Hacer clic en el método **PUT** de `/candidatos/{candidato_id}` y mostrar la **solicitud de integración**:
tipo **Lambda proxy**, función `cs2032-candidatos-dev-modificarCandidato`.

🖱️ Ir a **Etapas → dev** y mostrar la **URL de invocación**: `https://celozfy9cj.execute-api.us-east-1.amazonaws.com/dev`.

🎤 *"Cada método apunta a su propia Lambda. Los otros 4 microservicios tienen la misma estructura."*

### 2.3 Swagger + 3 endpoints vistos en DynamoDB (crear, modificar, eliminar)

🖱️ Pestaña 5 (Swagger). Arriba a la derecha, en **Select a definition**, elegir **MS1 · Usuarios / Autenticación**.

🎤 *"Documentamos los 5 microservicios con OpenAPI y Swagger UI, publicado junto al frontend en Amplify. En el
selector se elige el microservicio."*

**Paso A — Login como tenant_1**

🖱️ `POST /usuarios/login` → **Try it out** → en el body pegar:

⌨️
```json
{ "tenant_id": "tenant_1", "email": "demo.tenant_1@cs2032.test", "password": "Demo-cs2032" }
```

🖱️ **Execute** → copiar el valor de `"token"` de la respuesta. Guardarlo en un bloc de notas como **TOKEN_T1**.

🎤 *"El login devuelve un token. Este token queda asociado a `tenant_1` en la tabla `t_tokens_acceso`."*

**Paso B — Autorizar Swagger con el token**

🖱️ Cambiar la definición a **MS2 · Candidatos** → botón **Authorize** → pegar **TOKEN_T1** → **Authorize** → **Close**.

🎤 *"Fíjense que ningún endpoint de Candidatos pide `tenant_id`: solo el token."*

**Paso C — CREAR (endpoint 1: POST /candidatos)**

🖱️ `POST /candidatos` → **Try it out** → body:

⌨️
```json
{
  "nombre": "Valeria Mendoza Quispe",
  "email": "valeria.mendoza@gmail.com",
  "telefono": "987654321",
  "profesion": "Ingeniera de Software"
}
```

🖱️ **Execute** → respuesta **201**. Copiar el `candidato_id` en el bloc de notas como **ID_VALERIA**.

🎤 *"La respuesta es 201 Created. Miren que el registro ya trae `tenant_id: tenant_1`: lo puso el backend a partir
del token, no lo enviamos nosotros."*

🖱️ Pestaña 4 (DynamoDB, `t_candidatos-dev` → Explorar elementos) → seleccionar **Consultar** (Query):
- **tenant_id (clave de partición):** ⌨️ `tenant_1`
- **candidato_id (clave de ordenación):** condición **Igual a** → ⌨️ pegar **ID_VALERIA**
- **Ejecutar**

🎤 *"En DynamoDB vemos el ítem recién creado, en la partición `tenant_1`, con `profesion = Ingeniera de Software`."*

**Paso D — MODIFICAR (endpoint 2: PUT /candidatos/{candidato_id})**

🖱️ Swagger → `PUT /candidatos/{candidato_id}` → **Try it out** → `candidato_id` = **ID_VALERIA** → body:

⌨️
```json
{ "profesion": "Arquitecta Cloud AWS", "telefono": "912345678" }
```

🖱️ **Execute** → **200**. En DynamoDB pulsar **Ejecutar** otra vez.

🎤 *"Ahora la profesión es `Arquitecta Cloud AWS` y cambió el teléfono. Se actualizó el mismo ítem."*

**Paso E — AISLAMIENTO: tenant_2 intenta leer y borrar el registro de tenant_1**

🖱️ Swagger → definición **MS1** → `POST /usuarios/login` → body:

⌨️
```json
{ "tenant_id": "tenant_2", "email": "demo.tenant_2@cs2032.test", "password": "Demo-cs2032" }
```

🖱️ Copiar el token como **TOKEN_T2** → definición **MS2** → **Authorize** → **Logout** → pegar **TOKEN_T2** → **Authorize** → **Close**.

🖱️ `GET /candidatos/{candidato_id}` con **ID_VALERIA** → **Execute** → **404 · Candidato no encontrado**.
🖱️ `DELETE /candidatos/{candidato_id}` con **ID_VALERIA** → **Execute** → **404**.
🖱️ En DynamoDB → **Ejecutar**: el ítem **sigue existiendo**.

🎤 *"Ahora somos `tenant_2`. Conocemos el ID exacto del candidato de `tenant_1` y aun así recibimos **404**, tanto
al leerlo como al intentar borrarlo. La Lambda armó la clave `(tenant_2, ID)`, que no existe. Además el registro
sigue intacto en DynamoDB. **Un tenant no puede acceder a los datos de otro.**"*

🖱️ (Opcional) Quitar el token (**Authorize → Logout**) y ejecutar `GET /candidatos` → **401 Token no enviado**.

🎤 *"Sin token, todos los endpoints responden 401: los 5 microservicios están protegidos."*

**Paso F — ELIMINAR (endpoint 3: DELETE /candidatos/{candidato_id})**

🖱️ **Authorize → Logout** → pegar otra vez **TOKEN_T1** → **Authorize**.
🖱️ `DELETE /candidatos/{candidato_id}` con **ID_VALERIA** → **Execute** → **200 · Candidato eliminado**.
🖱️ DynamoDB → **Ejecutar** → **0 elementos devueltos**.

🎤 *"Con el token del dueño, el borrado funciona y el ítem desaparece de DynamoDB. Así vimos los tres endpoints:
crear, modificar y eliminar."*

**Paso G — Volumen de datos (opcional, 20 s)**

🖱️ DynamoDB → Tablas: mostrar que existen `t_candidatos-dev`, `t_vacantes-dev`, `t_postulaciones-dev`,
`t_entrevistas-dev`, `t_reportes-dev`, `t_usuarios-dev` y `t_tokens_acceso-dev`.

🎤 *"Cada microservicio tiene 30 000 registros, 10 000 por tenant, generados con scripts de Python, Faker y boto3."*

---

## PARTE 3 — Frontend en AWS Amplify (≈ 5 min)

### 3.1 Amplify en la consola

🖱️ Consola → **AWS Amplify** → app **`cs2032-crm-empleabilidad`** → rama **main** → mostrar el despliegue en
estado **Implementado** y el dominio `https://main.d2mg8kior54du3.amplifyapp.com`.

🎤 *"El frontend está alojado en **AWS Amplify Hosting**. Es una aplicación web que consume los 5
microservicios."*

### 3.2 Tenant 1 — Talento Andino (pestaña 6)

🖱️ Iniciar sesión:
- **Empresa (tenant):** `Talento Andino S.A.C. (tenant_1)`
- **Email:** ⌨️ `demo.tenant_1@cs2032.test`
- **Contraseña:** ⌨️ `Demo-cs2032`

🎤 *"Al iniciar sesión, el frontend llama al microservicio de **Usuarios** y recibe el token. La interfaz se pinta en
**azul** con el nombre de la empresa abajo a la izquierda. Abajo a la derecha está la **Consola API**: ahí se ve en
vivo cada llamada a los microservicios, con su código HTTP."*

🖱️ Abrir la **Consola API** (abajo a la derecha) y dejarla visible.

**Dashboard (microservicio Reportes)**

🎤 *"El dashboard viene del microservicio de **Reportes**: total de candidatos, vacantes, postulaciones,
entrevistas, contratados y tasa de contratación de este tenant, más el **embudo del pipeline**."*

🖱️ Anotar el número de **Contratados** (por ejemplo `834`).

**Crear candidato (microservicio Candidatos)**

🖱️ Menú **Candidatos** → **+ Nuevo candidato**:

⌨️
| Campo | Valor |
|---|---|
| Nombre completo | `Diego Ramírez Torres` |
| Email | `diego.ramirez@outlook.com` |
| Teléfono | `956789123` |
| Profesión | `Desarrollador Backend` |

🖱️ **Guardar** → el candidato aparece **arriba, resaltado en amarillo**.
🖱️ (Opcional) Botón **Subir CV** → elegir `cv_valeria.pdf` → aparece "📄 cargado".

🎤 *"El candidato se creó en el microservicio de Candidatos. Con 'Subir CV' el archivo va directo a **S3** usando la URL
prefirmada; en la Consola API se ven las tres llamadas: pedir la URL, el PUT a S3 y la confirmación."*

🖱️ **Clic sobre el ID** del candidato (la columna ID): se copia al portapapeles. Pegarlo en el bloc de notas como **ID_DIEGO**.

**Crear vacante (microservicio Vacantes)**

🖱️ Menú **Vacantes** → **+ Nueva vacante**:

⌨️
| Campo | Valor |
|---|---|
| Título | `Desarrollador Backend Python` |
| Descripción | `Desarrollo de APIs serverless en AWS con Python, Lambda y DynamoDB` |
| Área | `Tecnología` |
| Ubicación | `Lima` |
| Modalidad | `hibrido` |
| Salario (S/) | `6500` |

🖱️ **Guardar** → la vacante aparece arriba, resaltada.

**Postular (la "oportunidad" del CRM)**

🖱️ En la fila de la vacante → **Postular** → en **Candidato** elegir **Diego Ramírez Torres** (sale primero)
→ Notas: ⌨️ `Perfil referido por LinkedIn` → **Postular**.

🎤 *"Una postulación es la **oportunidad** del CRM: une a un candidato con una vacante y avanza por un pipeline."*

**Pipeline**

🖱️ En la misma fila de la vacante → botón **Pipeline**. Se abre el tablero filtrado por esa vacante, con la tarjeta en **Postulado**.
🖱️ ▶ (pasa a **Preseleccionado**) → ▶ (pasa a **Entrevista**).

🎤 *"Este es el tablero de oportunidades: postulado, preseleccionado, entrevista, oferta, contratado o rechazado.
Cada movimiento es un PUT al microservicio de Vacantes, que usa un índice secundario por estado."*

**Agendar entrevista (microservicio Entrevistas)**

🖱️ En la tarjeta (columna **Entrevista**) → botón 📅:

⌨️
| Campo | Valor |
|---|---|
| Entrevistador | `Carla Ruiz` |
| Fecha y hora (Lima) | `20/11/2026 03:00 p. m.` |
| Modalidad | `virtual` |
| Notas | `Entrevista técnica sobre AWS` |

🖱️ **Agendar**. Ir al menú **Entrevistas**: la entrevista aparece arriba, resaltada → **✔ Realizada**.

🎤 *"Las entrevistas son las **actividades** de seguimiento del CRM. En la fase 2, este mismo paso publicará el
evento en SNS para el recordatorio asíncrono."*

**Cerrar el ciclo: contratar y ver el reporte**

🖱️ Menú **Vacantes** → **Pipeline** de la vacante → ▶ (**Oferta**) → ▶ (**Contratado**).
🖱️ Menú **Dashboard** → **↻ Recalcular reporte** (tarda unos segundos) → **Contratados** sube en 1.

🎤 *"El microservicio de Reportes recalcula las métricas leyendo las tablas de los otros microservicios, siempre
solo del tenant del token. El contratado nuevo ya aparece en el total."*

### 3.3 Tenant 2 — Recluta Perú (pestaña 7)

🖱️ Ir a la **pestaña 7** e iniciar sesión:
- **Empresa:** `Recluta Perú Consultores (tenant_2)`
- **Email:** ⌨️ `demo.tenant_2@cs2032.test`
- **Contraseña:** ⌨️ `Demo-cs2032`

🎤 *"Ahora, en otra pestaña, entramos como **otra empresa**. La interfaz cambia a **verde** y el dashboard muestra
**otros números**: son los datos de `tenant_2`."*

🖱️ Menú **Vacantes**: la vacante "Desarrollador Backend Python" **no aparece**.
🖱️ Menú **Candidatos** → en **Buscar por candidato_id** pegar **ID_DIEGO** → **Buscar** → aparece el aviso **"404 · Candidato no encontrado"** y en la Consola API se ve el GET con código 404.

🎤 *"Desde `tenant_2` buscamos al candidato que creamos en `tenant_1` usando su ID exacto, y el sistema responde que
no existe. Las dos empresas usan la misma aplicación y las mismas tablas, pero cada una solo ve sus propios datos."*

🖱️ (Opcional) Crear una vacante en tenant_2, ⌨️ `Analista de Marketing Digital`, volver a la pestaña 6 (tenant_1)
→ **Vacantes**: no aparece.

### 3.4 Cierre (20 s)

🎤 *"En resumen:*
- *5 microservicios con 29 Lambdas, cada uno con su API Gateway y su tabla en DynamoDB;*
- *30 000 registros por microservicio;*
- *multi-tenancy por `tenant_id` derivado del token;*
- *S3 para los CV;*
- *SNS y SQS para las notificaciones (fase 2);*
- *un frontend en Amplify con las funciones de un CRM de reclutamiento, probado con dos tenants.*

*Para la entrega final completaremos el flujo SNS/SQS, la migración de Vacantes a RDS con un schema por tenant y
los stages test y prod. Muchas gracias."*

---

## Preguntas probables (respuestas cortas)

| Pregunta | Respuesta |
|---|---|
| ¿Por qué no Cognito? | AWS Academy no permite crear User Pools; implementamos autenticación propia con tokens en DynamoDB que expiran en 2 h. |
| ¿Qué pasa si alguien manda `tenant_id` en el body? | Se ignora: el tenant siempre sale del token. |
| ¿Por qué una Lambda por endpoint? | Menor responsabilidad por función, permisos y escalado independientes, despliegue más seguro. |
| ¿Cómo paginan 10 000 registros? | `Query` por partition key con `Limit 100` y un cursor (`LastEvaluatedKey`) que el backend fuerza al tenant del token. |
| ¿Cómo se protegen las APIs? | Header `Authorization: Bearer`; sin token o con token inválido/expirado → 401. |
| ¿Por qué el CV no pasa por la Lambda? | Con la URL prefirmada el navegador sube directo a S3: menos latencia y costo, y no hay límite de payload de API Gateway. |
| ¿Qué rol IAM usan? | `LabRole` (el Learner Lab no permite crear roles). |

## Plan B si algo falla en vivo

- **"Sesión expirada"** en el frontend → volver a iniciar sesión (el token dura 2 h).
- **Swagger da 401** → volver a hacer login y repetir **Authorize** con el token nuevo.
- **No carga nada** → comprobar que el Learner Lab esté iniciado; como respaldo, ejecutar
  `bash repos/prueba_integracion.sh`, que prueba los 5 microservicios y el aislamiento entre tenants en ~30 s.
- **Recalcular reporte tarda** → esperar ~15 s: lee alrededor de 50 000 ítems del tenant.
