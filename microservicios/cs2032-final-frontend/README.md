# cs2032-final-frontend — EmpleaCRM

Frontend del CRM de Empleabilidad (CS2032 · Grupo 1). SPA en HTML + JavaScript sin
build, desplegada en **AWS Amplify Hosting**.

- App: https://main.d2mg8kior54du3.amplifyapp.com
- Swagger de los 5 microservicios: https://main.d2mg8kior54du3.amplifyapp.com/docs.html

## Qué consume

| Vista | Microservicio | Endpoints |
|---|---|---|
| Login / registro | Usuarios | `POST /usuarios`, `POST /usuarios/login`, `GET /usuarios/validar` |
| Dashboard | Reportes | `GET /reportes/resumen_general`, `POST /reportes/generar` |
| Candidatos (+ CV) | Candidatos + S3 | CRUD `/candidatos`, `POST /candidatos/{id}/cv-url` |
| Vacantes | Vacantes | CRUD `/vacantes`, `POST /postulaciones` |
| Pipeline | Vacantes (GSI `indice_estado`) | `GET /postulaciones?estado=`, `PUT /postulaciones/{id}` |
| Entrevistas | Entrevistas | CRUD `/entrevistas` |

Todas las peticiones de negocio llevan `Authorization: Bearer <token_acceso>`. El frontend
**no envía el tenant**: cada Lambda lo obtiene del token en `t_tokens_acceso`.
Tampoco se elige empresa al iniciar sesión: el login solo envía correo y contraseña, y
el nombre y color del tenant salen del `tenant_id` que devuelve `POST /usuarios/login`.

La sesión se guarda en `sessionStorage` (por pestaña), así se pueden abrir dos
tenants lado a lado para la demo. La “Consola API” (abajo a la derecha) muestra
cada llamada: método, microservicio, ruta, código HTTP y latencia.

## Usuarios de demo

`demo.tenant_1@cs2032.test`, `demo.tenant_2@cs2032.test` (contraseña en
`../prueba_integracion.sh`).

## Desarrollo y despliegue

```bash
python3 -m http.server 8765              # probar en http://localhost:8765
python3 scripts/generar_openapi.py       # regenerar docs/openapi/*.json
bash scripts/desplegar_amplify.sh        # desplegar (requiere credenciales del Learner Lab)
```

Las URLs de los microservicios están en `config.js`.
