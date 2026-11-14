# Parte de Patrick — Microservicio de Vacantes/Postulaciones

Depende de: Usuarios/Autenticación (Sandra) para el token; Candidatos
(Santiago) para el `candidato_id` al crear una postulación.
De este microservicio dependen: Entrevistas (Sanders, usa `vacante_id`),
Reportes (lee esta tabla/base).

> Convenciones generales en `00_overview_proyecto.md`.

## Fase 1 — CRUD de Vacantes/Postulaciones (para el 14 de noviembre)

### 1. Repositorio

```bash
mkdir cs2032-final-vacantes && cd cs2032-final-vacantes
serverless create --template aws-python3 --name cs2032-vacantes
```

### 2. Tabla DynamoDB

**`t_vacantes-${sls:stage}`**
- Partition key: `tenant_id`
- Sort key: `vacante_id` (uuid4)
- Atributos: `titulo`, `descripcion`, `candidato_id` (puede estar vacío si aún
  no hay postulante), `estado` (`abierta`, `postulado`, `preseleccionado`,
  `entrevista`, `oferta`, `contratado`, `rechazado`), `fecha_publicacion`,
  `fecha_actualizacion`

Agrega un **GSI** para poder consultar por estado (útil para el frontend y
para Reportes), siguiendo el mismo patrón de índices que ya vieron en los
talleres de multi-tenancy:

- GSI `indice_estado`: partition key `tenant_id`, sort key `estado`

### 3. `serverless.yml`

```yaml
service: cs2032-vacantes
provider:
  name: aws
  runtime: python3.11
  region: us-east-1
  stage: ${opt:stage, 'dev'}
  environment:
    VACANTES_TABLE: t_vacantes-${sls:stage}
    TOKENS_TABLE: t_tokens_acceso-${sls:stage}
  iamRoleStatements:
    - Effect: Allow
      Action: [dynamodb:GetItem, dynamodb:PutItem, dynamodb:UpdateItem, dynamodb:DeleteItem, dynamodb:Query]
      Resource:
        - arn:aws:dynamodb:us-east-1:*:table/t_vacantes-${sls:stage}
        - arn:aws:dynamodb:us-east-1:*:table/t_vacantes-${sls:stage}/index/indice_estado
    - Effect: Allow
      Action: dynamodb:GetItem
      Resource: arn:aws:dynamodb:us-east-1:*:table/t_tokens_acceso-${sls:stage}

functions:
  listarVacantes:
    handler: handler.listar_vacantes
    events: [{ http: { path: vacantes, method: get } }]
  crearVacante:
    handler: handler.crear_vacante
    events: [{ http: { path: vacantes, method: post } }]
  modificarVacante:
    handler: handler.modificar_vacante
    events: [{ http: { path: vacantes/{vacante_id}, method: put } }]
  buscarVacante:
    handler: handler.buscar_vacante
    events: [{ http: { path: vacantes/{vacante_id}, method: get } }]
  eliminarVacante:
    handler: handler.eliminar_vacante
    events: [{ http: { path: vacantes/{vacante_id}, method: delete } }]

resources:
  Resources:
    TablaVacantes:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: t_vacantes-${sls:stage}
        AttributeDefinitions:
          - { AttributeName: tenant_id, AttributeType: S }
          - { AttributeName: vacante_id, AttributeType: S }
          - { AttributeName: estado, AttributeType: S }
        KeySchema:
          - { AttributeName: tenant_id, KeyType: HASH }
          - { AttributeName: vacante_id, KeyType: RANGE }
        GlobalSecondaryIndexes:
          - IndexName: indice_estado
            KeySchema:
              - { AttributeName: tenant_id, KeyType: HASH }
              - { AttributeName: estado, KeyType: RANGE }
            Projection: { ProjectionType: ALL }
        BillingMode: PAY_PER_REQUEST
```

### 4. Implementar las 5 Lambdas

Mismo patrón que los demás microservicios (`validar_token` primero, filtrar
siempre por `tenant_id`):

- `listar_vacantes`: `Query` por `tenant_id`; soporta filtro opcional por
  `estado` usando el GSI.
- `crear_vacante`: crea la vacante con `estado: "abierta"`.
- `modificar_vacante`: permite actualizar cualquier campo, incluido mover el
  `estado` a lo largo del pipeline (esto es lo que usará el frontend cuando un
  candidato postula o avanza de etapa).
- `buscar_vacante` / `eliminar_vacante`: igual que en los demás microservicios.

### 5. Desplegar y probar

```bash
serverless deploy --stage dev
```

Con Postman: crea 2-3 vacantes en `tenant_1`, postula un candidato (usa un
`candidato_id` real que te pase Santiago), avanza el estado paso a paso
(`postulado → preseleccionado → entrevista → oferta → contratado`), y
confirma con `listar_vacantes?estado=entrevista` que el filtro funciona.

### 6. Documentar

README con los 5 endpoints y el detalle del pipeline de estados.

---

## Fase 2 — Migración a RDS, patrón "Single Database, Multiple Schemas" (para el 22 de noviembre)

Esta es la parte que el curso solo ha visto en teoría, así que hay que
investigar un poco más que en el resto de microservicios. La idea del patrón:
**una sola instancia RDS**, y **un schema por tenant**, cada uno con la misma
estructura de tabla.

### 1. Crear la instancia RDS (en AWS Academy Learner Lab)

- Motor: MySQL (más simple de usar con `pymysql` que Postgres para este nivel).
- Clase de instancia pequeña (`db.t3.micro`), `Single-AZ` (el Learner Lab no
  permite mucho más).
- Grupo de seguridad que permita conexión desde las Lambdas (ver paso 4).

### 2. Crear un schema por tenant

Conéctate con un cliente MySQL (Workbench, DBeaver o `mysql` CLI) y crea:

```sql
CREATE SCHEMA tenant_1;
CREATE SCHEMA tenant_2;
CREATE SCHEMA tenant_3;
```

Y en cada uno, la misma tabla:

```sql
CREATE TABLE tenant_1.vacantes (
  vacante_id CHAR(36) PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL,
  descripcion TEXT,
  candidato_id CHAR(36),
  estado VARCHAR(30) NOT NULL DEFAULT 'abierta',
  fecha_publicacion DATETIME,
  fecha_actualizacion DATETIME
);
-- repetir igual para tenant_2.vacantes y tenant_3.vacantes
```

### 3. Migrar los datos existentes de DynamoDB a RDS

Script Python (`scripts/migrar_a_rds.py`): por cada tenant, hacer `Query` a
`t_vacantes-dev` filtrando por ese `tenant_id`, y por cada ítem, un `INSERT`
en el schema correspondiente usando `pymysql`.

### 4. Adaptar las Lambdas para usar RDS en vez de DynamoDB

- Las Lambdas deben desplegarse dentro de la misma VPC que la instancia RDS
  (agregar bloque `vpc:` en `serverless.yml` con las subredes y el security
  group correctos).
- Usar `pymysql` (agregarlo como dependencia, por ejemplo con el plugin
  `serverless-python-requirements`).
- El `tenant_id` que devuelve `validar_token` ahora decide a **qué schema**
  conectarse (`USE tenant_1;` o seleccionando la base de datos en la conexión),
  en vez de ser un filtro `WHERE` como en DynamoDB.
- Usar siempre consultas parametrizadas (`cursor.execute(sql, params)`), nunca
  concatenar strings, para evitar inyección SQL.

### 5. Desplegar y probar

```bash
serverless deploy --stage dev
```

Repite las mismas pruebas de Postman que en Fase 1, confirmando que ahora los
datos viven en RDS (puedes verificarlo consultando directamente la tabla con
el cliente SQL).

### 6. Diagrama Entidad-Relación

Para el informe final: un diagrama ER simple de la tabla `vacantes`, aclarando
que se replica igual en cada schema de tenant.
