# Hechos verificados del proyecto (fuente única para informe y presentación)

Fecha de corte: 17 de noviembre de 2026. Todas las cifras salen de la evidencia en `informe/evidencia/` o del código en `microservicios/`.

## Proyecto
- Grupo 1, CS2032 Cloud Computing (UTEC, ciclo 2026-2). Tipo de SaaS: **CRM de empleabilidad nacional**.
- Tenants: `tenant_1` (Talento Andino S.A.C.), `tenant_2` (Recluta Perú Consultores), `tenant_3`.
- Región AWS: `us-east-1`. Runtime: Python 3.11. Framework: Serverless Framework v3.
- Stage desplegado: **solo `dev`**. Los stages `test` y `prod` no existen.

## Arquitectura
- Multi-tenancy: `tenant_id` como partition key en DynamoDB; RDS MySQL 8.0.46 con patrón *Single Database, Multiple Schemas* (un schema por tenant).
- Serverless: 5 APIs REST API Gateway (`dev-cs2032-usuarios`, `dev-cs2032-candidatos`, `dev-cs2032-vacantes`, `dev-cs2032-entrevistas`, `dev-cs2032-reportes`) con 31 funciones Lambda en total.
- Lambdas por servicio: usuarios 4, candidatos 6, vacantes 10 (5 vacantes + 5 postulaciones), entrevistas 6 (5 CRUD + `procesarNotificacion`), reportes 5. Total 31.
- Una Lambda por endpoint; cada función empaquetada individualmente (`package: individually: true`) con `common/` compartido.
- EDA: `crearEntrevista` publica en SNS `topico-entrevistas-agendadas-dev` → SQS `cola-notificaciones-entrevistas-dev` → `procesarNotificacion` (verificado en CloudWatch: eventos `recordatorio_simulado`). Si SNS falla, la entrevista se guarda y responde 201.
- S3: bucket `cs2032-candidatos-cv-dev-816193343783` para CV con URL prefirmada PUT (ruta `tenant_id/candidato_id/cv.pdf`).
- Frontend: HTML/CSS/JS estático, desplegado en AWS Amplify: `https://main.d2mg8kior54du3.amplifyapp.com`.
- VPC predeterminada `vpc-0fac6f2d1ab59f1fa`. Endpoints: DynamoDB (gateway, `vpce-06ffe41b6ff20907a`) y SNS (interface, `vpce-0c5e6af041ebd0462`). Definidos en CloudFormation (vacantes y entrevistas).
- Lambdas dentro de la VPC: vacantes (todas), `crearEntrevista` y `generarReporte`.

## Autenticación
- Tablas propias `t_usuarios-dev` y `t_tokens_acceso-dev` (AWS Academy no permite Cognito).
- Login solo con correo y contraseña (sin `tenant_id`). Índice `indice_email` (correo único en todo el sistema).
- Contraseñas con PBKDF2-SHA256, 310 000 iteraciones y salt; hashes sha256 legados se rehashean al iniciar sesión.
- `token_acceso` vigente 15 minutos; `token_refresh` 7 días. `POST /usuarios/refresh` emite un nuevo token de acceso. Un token de refresh NO sirve en endpoints protegidos.
- Roles: `administrador` (puede crear usuarios de su empresa) y `reclutador`.
- Validación en cada servicio protegido: `Authorization: Bearer <token_acceso>` y consulta `get_item` a `t_tokens_acceso`.

## Datos (conteos verificados)
| Recurso | Total | tenant_1 | tenant_2 | tenant_3 | Requisito 30 000 |
|---|---|---|---|---|---|
| `t_candidatos-dev` (DynamoDB) | 30 000 | 10 000 | 10 000 | 10 000 | Cumple |
| `t_entrevistas-dev` (DynamoDB) | 30 000 | 10 000 | 10 000 | 10 000 | Cumple |
| `vacantes` (RDS, schema por tenant) | 30 000 | 10 000 | 10 000 | 10 000 | Cumple |
| `postulaciones` (RDS, schema por tenant) | 30 000 | 10 000 | 10 000 | 10 000 | Cumple |
| `t_usuarios-dev` (DynamoDB) | 5 | 3 | 1 | 1 | **No cumple** |
| `t_reportes-dev` (DynamoDB) | 2 | 1 | 0 | 1 | **No cumple** |
- Las tablas `t_vacantes-dev` y `t_postulaciones-dev` (DynamoDB) quedan como origen de la migración a RDS, con 30 000 ítems cada una. El código ya no las lee.
- Migración verificada en CloudWatch: 10 000 vacantes y 10 000 postulaciones por tenant, 0 errores.

## Base de datos (RDS)
- Instancia `cs2032-vacantes-dev`: MySQL 8.0.46, db.t3.micro, Single-AZ, no pública, sin cifrado.
- Tabla `vacantes` (PK `vacante_id`; campos título, descripción, área, ubicación, modalidad, salario, estado, fechas).
- Tabla `postulaciones` (PK `postulacion_id`; FK `vacante_id` → `vacantes`; estado, notas, fechas). Índices `indice_estado` e `indice_vacante`.
- Pipeline de estados: postulado → preseleccionado → entrevista → oferta → contratado / rechazado.
- Borrar una vacante con postulaciones responde 409.

## Pruebas realizadas (evidencia en `informe/evidencia/08_pruebas_api.txt`)
- Sin token: 401 "Token no enviado".
- Aislamiento multi-tenant: tenant_2 recibe 404 al leer y borrar un candidato de tenant_1; el candidato sigue existiendo para tenant_1.
- Extremo a extremo con tenant_1: crear vacante (RDS) → agendar entrevista (201) → generar reporte (cuenta la vacante nueva) → limpieza.
- Refresh: 200 con `token_refresh`; 401 si se usa un refresh en endpoint protegido.

## Pendientes y brechas (declararlas en el informe, sin ocultarlas)
1. Usuarios (5) y reportes (2) no llegan a 30 000 registros por tenant.
2. Stages `test` y `prod` no desplegados (solo `dev`).
3. El curso pide un repositorio por microservicio; el equipo usa **un solo repositorio** con carpetas `microservicios/`. Enlace público: `https://github.com/patrickmedina-ds/Proyecto-Final-Cloud-Computing`.
4. Demo con 2 tenants: se realiza en vivo (semana 16).
5. Colecciones Postman: existen en algunos servicios (vacantes, entrevistas, reportes), no en todos.
6. Documentos de contrato antiguos (`01_sandra...`, `02_santiago...`) describen el diseño previo (token de 2 h, tenant en el body). El código y los README ya están actualizados.
7. Las tablas heredadas `t_vacantes-dev` y `t_postulaciones-dev` siguen declaradas en `serverless.yml` de vacantes como origen de la migración.
8. Prueba de frontend en navegador (apartado Usuarios, refresh automático): verificada solo por API.

## Requisitos de la rúbrica (Entrega Semana 15)
- Diagrama de arquitectura (2 pts): `Diagrama_Arquitectura_Solucion.png` (raíz) y `.drawio`.
- Backend (8 pts): 5 microservicios protegidos, RDS + DynamoDB, S3, SNS, SQS, serverless deploy.
- Frontend (6 pts): Amplify consumiendo las 5 APIs.
- Exposición presencial (1 pt) y demo: semana 16.
- Avance virtual (3 pts, 14 de noviembre): microservicios desplegados en dev con CRUD protegido.
