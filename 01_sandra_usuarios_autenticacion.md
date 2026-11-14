# Parte de Sandra — Microservicio de Usuarios/Autenticación + Reportes

Depende de: ninguno (es la base que los demás microservicios consumen).
De este microservicio dependen: los otros 4, para validar el token de acceso.

> Convenciones generales (región, nombres de tabla, formato de respuesta, función
> `validar_token`) están en `00_overview_proyecto.md`. No las repitas distinto aquí.

## Fase 1 — Microservicio de Usuarios/Autenticación (para el 14 de noviembre)

### 1. Preparar el repositorio

```bash
mkdir cs2032-final-usuarios && cd cs2032-final-usuarios
serverless create --template aws-python3 --name cs2032-usuarios
git init && git add . && git commit -m "init"
```

### 2. Diseñar las tablas DynamoDB

**`t_usuarios-${sls:stage}`**
- Partition key: `tenant_id` (string)
- Sort key: `usuario_id` (string, uuid4)
- Atributos: `nombre`, `email`, `password_hash`, `rol`, `fecha_registro`

**`t_tokens_acceso-${sls:stage}`**
- Partition key: `token` (string, uuid4) — nota: esta tabla usa `token` como PK y
  no `tenant_id`, porque el login llega solo con el token, no con el tenant.
- Atributos: `tenant_id`, `usuario_id`, `fecha_creacion`, `fecha_expiracion`

### 3. Escribir `serverless.yml`

```yaml
service: cs2032-usuarios
provider:
  name: aws
  runtime: python3.11
  region: us-east-1
  stage: ${opt:stage, 'dev'}
  environment:
    USUARIOS_TABLE: t_usuarios-${sls:stage}
    TOKENS_TABLE: t_tokens_acceso-${sls:stage}
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:GetItem
        - dynamodb:PutItem
        - dynamodb:Query
        - dynamodb:Scan
      Resource:
        - arn:aws:dynamodb:us-east-1:*:table/t_usuarios-${sls:stage}
        - arn:aws:dynamodb:us-east-1:*:table/t_tokens_acceso-${sls:stage}

functions:
  crearUsuario:
    handler: handler.crear_usuario
    events:
      - http: { path: usuarios, method: post }
  loginUsuario:
    handler: handler.login_usuario
    events:
      - http: { path: usuarios/login, method: post }
  validarTokenAcceso:
    handler: handler.validar_token_endpoint
    events:
      - http: { path: usuarios/validar, method: get }

resources:
  Resources:
    TablaUsuarios:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: t_usuarios-${sls:stage}
        AttributeDefinitions:
          - { AttributeName: tenant_id, AttributeType: S }
          - { AttributeName: usuario_id, AttributeType: S }
        KeySchema:
          - { AttributeName: tenant_id, KeyType: HASH }
          - { AttributeName: usuario_id, KeyType: RANGE }
        BillingMode: PAY_PER_REQUEST
    TablaTokens:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: t_tokens_acceso-${sls:stage}
        AttributeDefinitions:
          - { AttributeName: token, AttributeType: S }
        KeySchema:
          - { AttributeName: token, KeyType: HASH }
        BillingMode: PAY_PER_REQUEST
        TimeToLiveSpecification:
          AttributeName: ttl
          Enabled: true
```

### 4. Implementar las Lambdas (`handler.py`)

- `crear_usuario`: recibe `tenant_id`, `nombre`, `email`, `password`; genera
  `usuario_id` con `uuid4`, guarda el hash del password (`hashlib.sha256` es
  suficiente para el nivel del curso) en `t_usuarios`.
- `login_usuario`: recibe `tenant_id`, `email`, `password`; busca el usuario,
  valida el hash, genera un `token` (`uuid4`), calcula `fecha_expiracion`
  (ejemplo: ahora + 2 horas) y lo guarda en `t_tokens_acceso`. Devuelve el token.
- `validar_token_endpoint`: expone por HTTP la misma lógica de `validar_token`
  (ver overview), útil para que el frontend verifique sesión.

### 5. Desplegar y probar

```bash
serverless deploy --stage dev
```

Con Postman o `curl`:
1. Crear usuario en `tenant_1`, `tenant_2`, `tenant_3`.
2. Login con cada uno → confirmar que llega un token distinto.
3. Llamar a `/usuarios/validar` con cada token → confirmar que devuelve el `tenant_id` correcto.

### 6. Documentar

README con endpoints, ejemplos de request/response, y cómo correr
`serverless deploy`.

---

## Fase 2 — Microservicio de Reportes (para el 22 de noviembre)

Este microservicio **lee** de las tablas de los otros 4 microservicios, así que
no puede avanzar hasta que Santiago, Patrick y Sanders tengan sus tablas creadas
(aunque sea vacías) y te pasen el nombre exacto de cada una.

### 1. Repositorio

```bash
mkdir cs2032-final-reportes && cd cs2032-final-reportes
serverless create --template aws-python3 --name cs2032-reportes
```

### 2. Tabla propia

**`t_reportes-${sls:stage}`**
- Partition key: `tenant_id`
- Sort key: `tipo_reporte` (ej. `resumen_general`)
- Atributos: `total_candidatos`, `total_vacantes`, `total_entrevistas`,
  `total_contratados`, `fecha_actualizacion`

### 3. `serverless.yml`

Igual estructura que el anterior, pero con permisos de **lectura** sobre las 4
tablas de los demás microservicios (pide los nombres exactos a cada compañero)
más lectura/escritura sobre `t_reportes-${sls:stage}`:

```yaml
environment:
  REPORTES_TABLE: t_reportes-${sls:stage}
  TOKENS_TABLE: t_tokens_acceso-${sls:stage}
  CANDIDATOS_TABLE: t_candidatos-${sls:stage}
  VACANTES_TABLE: t_vacantes-${sls:stage}
  ENTREVISTAS_TABLE: t_entrevistas-${sls:stage}
iamRoleStatements:
  - Effect: Allow
    Action: [dynamodb:Scan, dynamodb:Query, dynamodb:GetItem]
    Resource:
      - arn:aws:dynamodb:us-east-1:*:table/t_candidatos-${sls:stage}
      - arn:aws:dynamodb:us-east-1:*:table/t_vacantes-${sls:stage}
      - arn:aws:dynamodb:us-east-1:*:table/t_entrevistas-${sls:stage}
      - arn:aws:dynamodb:us-east-1:*:table/t_tokens_acceso-${sls:stage}
  - Effect: Allow
    Action: [dynamodb:GetItem, dynamodb:PutItem]
    Resource:
      - arn:aws:dynamodb:us-east-1:*:table/t_reportes-${sls:stage}
```

### 4. Lambdas

- `actualizar_reportes`: hace `scan` (con `FilterExpression` por `tenant_id`) a
  las 3 tablas, cuenta registros y guarda el resultado en `t_reportes`. Se
  puede llamar manualmente o antes de cada demo.
- `consultar_reportes`: `GET /reportes?tenant_id=...`, valida token, lee
  `t_reportes` y devuelve los conteos.

> Nota: Reportes no necesita generar sus propios 30,000 registros ficticios —
> su contenido se calcula a partir de los datos ya cargados en los otros 4
> microservicios.

### 5. Desplegar multi-stage

```bash
serverless deploy --stage dev
serverless deploy --stage test
serverless deploy --stage prod
```

Confirma que cada stage crea su propia Lambda, API Gateway y tabla (nombres con
sufijo `-dev`, `-test`, `-prod`).
