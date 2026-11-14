# Parte de Santiago — Microservicio de Candidatos

Depende de: Usuarios/Autenticación (Sandra) — necesitas el nombre de la tabla
`t_tokens_acceso-${sls:stage}` y poder generar tokens de prueba.
De este microservicio dependen: Vacantes/Postulaciones (usa `candidato_id`),
Entrevistas (usa `candidato_id`), Reportes (lee esta tabla).

> Convenciones generales en `00_overview_proyecto.md`.

## Fase 1 — CRUD de Candidatos (para el 14 de noviembre)

### 1. Repositorio

```bash
mkdir cs2032-final-candidatos && cd cs2032-final-candidatos
serverless create --template aws-python3 --name cs2032-candidatos
```

### 2. Tabla DynamoDB

**`t_candidatos-${sls:stage}`**
- Partition key: `tenant_id`
- Sort key: `candidato_id` (uuid4)
- Atributos: `nombre`, `email`, `telefono`, `profesion`, `cv_url` (vacío hasta
  Fase 2), `estado` (`activo` / `inactivo`), `fecha_registro`

### 3. `serverless.yml`

```yaml
service: cs2032-candidatos
provider:
  name: aws
  runtime: python3.11
  region: us-east-1
  stage: ${opt:stage, 'dev'}
  environment:
    CANDIDATOS_TABLE: t_candidatos-${sls:stage}
    TOKENS_TABLE: t_tokens_acceso-${sls:stage}
  iamRoleStatements:
    - Effect: Allow
      Action: [dynamodb:GetItem, dynamodb:PutItem, dynamodb:UpdateItem, dynamodb:DeleteItem, dynamodb:Query]
      Resource: arn:aws:dynamodb:us-east-1:*:table/t_candidatos-${sls:stage}
    - Effect: Allow
      Action: dynamodb:GetItem
      Resource: arn:aws:dynamodb:us-east-1:*:table/t_tokens_acceso-${sls:stage}

functions:
  listarCandidatos:
    handler: handler.listar_candidatos
    events: [{ http: { path: candidatos, method: get } }]
  crearCandidato:
    handler: handler.crear_candidato
    events: [{ http: { path: candidatos, method: post } }]
  modificarCandidato:
    handler: handler.modificar_candidato
    events: [{ http: { path: candidatos/{candidato_id}, method: put } }]
  buscarCandidato:
    handler: handler.buscar_candidato
    events: [{ http: { path: candidatos/{candidato_id}, method: get } }]
  eliminarCandidato:
    handler: handler.eliminar_candidato
    events: [{ http: { path: candidatos/{candidato_id}, method: delete } }]

resources:
  Resources:
    TablaCandidatos:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: t_candidatos-${sls:stage}
        AttributeDefinitions:
          - { AttributeName: tenant_id, AttributeType: S }
          - { AttributeName: candidato_id, AttributeType: S }
        KeySchema:
          - { AttributeName: tenant_id, KeyType: HASH }
          - { AttributeName: candidato_id, KeyType: RANGE }
        BillingMode: PAY_PER_REQUEST
```

### 4. Implementar las 5 Lambdas

Cada una debe empezar llamando a `validar_token(event)` (copiar la función del
overview) y usar el `tenant_id` que devuelve para filtrar/escribir en la tabla
— nunca confiar en un `tenant_id` que venga en el body o la URL.

- `listar_candidatos`: `Query` por `tenant_id` (partition key).
- `crear_candidato`: genera `candidato_id` con `uuid4`, guarda con `estado: "activo"`.
- `modificar_candidato`: `UpdateItem` sobre `(tenant_id, candidato_id)`.
- `buscar_candidato`: `GetItem` sobre `(tenant_id, candidato_id)`.
- `eliminar_candidato`: `DeleteItem` sobre `(tenant_id, candidato_id)`.

### 5. Desplegar y probar

```bash
serverless deploy --stage dev
```

Con Postman: pide un token a Sandra (login en `tenant_1`), crea 2-3 candidatos,
lístalos, modifica uno, elimínalo. Repite con `tenant_2` para confirmar que un
tenant no ve los candidatos del otro.

### 6. Documentar

README con los 5 endpoints, formato de body/respuesta, y cómo desplegar.

---

## Fase 2 — Subida de CV/foto a S3 (para el 22 de noviembre)

### 1. Agregar el bucket a tu mismo `serverless.yml`

```yaml
resources:
  Resources:
    BucketCVs:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: cs2032-candidatos-cv-${sls:stage}
```

### 2. Lambda para generar URL de subida

Forma más simple (sin manejar archivos binarios dentro de la Lambda): generar
una **URL prefirmada** de S3 para que el frontend suba el archivo directo al
bucket.

```python
import boto3, os

s3 = boto3.client('s3', region_name='us-east-1')

def generar_url_subida(event):
    tenant_id, error = validar_token(event)
    if error:
        return error

    candidato_id = event['pathParameters']['candidato_id']
    key = f"{tenant_id}/{candidato_id}/cv.pdf"
    url = s3.generate_presigned_url(
        'put_object',
        Params={'Bucket': os.environ['BUCKET_CVS'], 'Key': key},
        ExpiresIn=300
    )
    return {'statusCode': 200, 'body': f'{{"url_subida": "{url}", "key": "{key}"}}'}
```

Nueva función en `serverless.yml`:

```yaml
  generarUrlSubidaCV:
    handler: handler.generar_url_subida
    events: [{ http: { path: candidatos/{candidato_id}/cv-url, method: post } }]
```

Y permiso IAM adicional:

```yaml
    - Effect: Allow
      Action: [s3:PutObject]
      Resource: arn:aws:s3:::cs2032-candidatos-cv-${sls:stage}/*
```

### 3. Actualizar el candidato con la URL final

Tras confirmar la subida, actualizar `cv_url` en `t_candidatos` con la URL
pública o la `key` del objeto (según cómo lo use el frontend).

### 4. Cargar 30,000 registros ficticios

Script Python (en el mismo repo, carpeta `scripts/cargar_datos.py`) usando
`Faker` + `boto3.resource('dynamodb').Table(...).batch_writer()`:
10,000 candidatos por cada uno de los 3 tenants.

### 5. Diagrama JSON del diseño

Documentar en el informe la estructura de `t_candidatos` como JSON de ejemplo
(un ítem completo con todos sus atributos).
