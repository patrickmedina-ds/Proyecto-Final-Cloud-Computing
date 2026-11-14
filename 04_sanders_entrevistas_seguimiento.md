# Parte de Sanders — Microservicio de Entrevistas/Seguimiento

Depende de: Usuarios/Autenticación (Sandra) para el token; Candidatos
(Santiago) para `candidato_id`; Vacantes (Patrick) para `vacante_id`.
De este microservicio depende: Reportes (lee esta tabla).

> Convenciones generales en `00_overview_proyecto.md`.

## Fase 1 — CRUD de Entrevistas/Seguimiento (para el 14 de noviembre)

### 1. Repositorio

```bash
mkdir cs2032-final-entrevistas && cd cs2032-final-entrevistas
serverless create --template aws-python3 --name cs2032-entrevistas
```

### 2. Tabla DynamoDB

**`t_entrevistas-${sls:stage}`**
- Partition key: `tenant_id`
- Sort key: `entrevista_id` (uuid4)
- Atributos: `candidato_id`, `vacante_id`, `entrevistador`, `fecha_hora`,
  `modalidad` (`presencial` / `virtual`), `estado` (`agendada`, `realizada`,
  `cancelada`), `notas`

### 3. `serverless.yml`

```yaml
service: cs2032-entrevistas
provider:
  name: aws
  runtime: python3.11
  region: us-east-1
  stage: ${opt:stage, 'dev'}
  environment:
    ENTREVISTAS_TABLE: t_entrevistas-${sls:stage}
    TOKENS_TABLE: t_tokens_acceso-${sls:stage}
  iamRoleStatements:
    - Effect: Allow
      Action: [dynamodb:GetItem, dynamodb:PutItem, dynamodb:UpdateItem, dynamodb:DeleteItem, dynamodb:Query]
      Resource: arn:aws:dynamodb:us-east-1:*:table/t_entrevistas-${sls:stage}
    - Effect: Allow
      Action: dynamodb:GetItem
      Resource: arn:aws:dynamodb:us-east-1:*:table/t_tokens_acceso-${sls:stage}

functions:
  listarEntrevistas:
    handler: handler.listar_entrevistas
    events: [{ http: { path: entrevistas, method: get } }]
  crearEntrevista:
    handler: handler.crear_entrevista
    events: [{ http: { path: entrevistas, method: post } }]
  modificarEntrevista:
    handler: handler.modificar_entrevista
    events: [{ http: { path: entrevistas/{entrevista_id}, method: put } }]
  buscarEntrevista:
    handler: handler.buscar_entrevista
    events: [{ http: { path: entrevistas/{entrevista_id}, method: get } }]
  eliminarEntrevista:
    handler: handler.eliminar_entrevista
    events: [{ http: { path: entrevistas/{entrevista_id}, method: delete } }]

resources:
  Resources:
    TablaEntrevistas:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: t_entrevistas-${sls:stage}
        AttributeDefinitions:
          - { AttributeName: tenant_id, AttributeType: S }
          - { AttributeName: entrevista_id, AttributeType: S }
        KeySchema:
          - { AttributeName: tenant_id, KeyType: HASH }
          - { AttributeName: entrevista_id, KeyType: RANGE }
        BillingMode: PAY_PER_REQUEST
```

### 4. Implementar las 5 Lambdas

Mismo patrón que los demás microservicios (`validar_token` primero, filtrar
siempre por `tenant_id`):

- `crear_entrevista`: recibe `candidato_id`, `vacante_id`, `entrevistador`,
  `fecha_hora`, `modalidad`; guarda con `estado: "agendada"`.
- `listar_entrevistas` / `buscar_entrevista` / `modificar_entrevista` /
  `eliminar_entrevista`: igual estructura que en los demás microservicios.

### 5. Desplegar y probar

```bash
serverless deploy --stage dev
```

Con Postman: pide a Patrick una vacante con `candidato_id` ya postulado (o usa
cualquier `candidato_id`/`vacante_id` de prueba), crea 2-3 entrevistas,
modifícalas a `estado: "realizada"`, lístalas y elimina una.

### 6. Documentar

README con los 5 endpoints y los posibles valores de `estado`.

---

## Fase 2 — Notificaciones con SNS/SQS (para el 22 de noviembre)

Esta es la parte basada en eventos (EDA) del proyecto: cuando se agenda una
entrevista, se publica un evento; una cola procesa ese evento de forma
asíncrona (simulando el envío de un recordatorio al candidato/entrevistador).

### 1. Agregar los recursos a tu `serverless.yml`

```yaml
resources:
  Resources:
    TopicoEntrevistas:
      Type: AWS::SNS::Topic
      Properties:
        TopicName: topico-entrevistas-agendadas-${sls:stage}
    ColaNotificaciones:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: cola-notificaciones-entrevistas-${sls:stage}
    SuscripcionCola:
      Type: AWS::SNS::Subscription
      Properties:
        TopicArn: !Ref TopicoEntrevistas
        Protocol: sqs
        Endpoint: !GetAtt ColaNotificaciones.Arn
    PoliticaCola:
      Type: AWS::SQS::QueuePolicy
      Properties:
        Queues: [!Ref ColaNotificaciones]
        PolicyDocument:
          Statement:
            - Effect: Allow
              Principal: "*"
              Action: SQS:SendMessage
              Resource: !GetAtt ColaNotificaciones.Arn
              Condition:
                ArnEquals: { aws:SourceArn: !Ref TopicoEntrevistas }
```

### 2. Publicar un mensaje al crear una entrevista

En `crear_entrevista`, después de guardar en DynamoDB:

```python
import boto3, json, os

sns = boto3.client('sns', region_name='us-east-1')

def crear_entrevista(event, context):
    tenant_id, error = validar_token(event)
    if error:
        return error
    # ... guardar la entrevista en DynamoDB (igual que en Fase 1) ...

    sns.publish(
        TopicArn=os.environ['TOPICO_ENTREVISTAS'],
        Message=json.dumps({
            'tenant_id': tenant_id,
            'entrevista_id': entrevista_id,
            'candidato_id': candidato_id,
            'fecha_hora': fecha_hora
        })
    )
    return {'statusCode': 201, 'body': json.dumps({'entrevista_id': entrevista_id})}
```

Agrega la variable de entorno `TOPICO_ENTREVISTAS` y el permiso
`sns:Publish` en `serverless.yml`.

### 3. Lambda consumidora (disparada por la cola SQS)

```python
def procesar_notificacion(event, context):
    for registro in event['Records']:
        datos = json.loads(json.loads(registro['body'])['Message'])
        # Para el nivel del curso, "enviar la notificación" puede ser
        # simplemente un print/log; lo importante es demostrar el flujo
        # evento → cola → procesamiento asíncrono.
        print(f"Recordatorio: entrevista {datos['entrevista_id']} "
              f"para el candidato {datos['candidato_id']} el {datos['fecha_hora']}")
```

```yaml
functions:
  procesarNotificacion:
    handler: handler.procesar_notificacion
    events:
      - sqs:
          arn: !GetAtt ColaNotificaciones.Arn
          batchSize: 5
```

### 4. Desplegar y probar de punta a punta

```bash
serverless deploy --stage dev
```

Crea una entrevista por Postman y revisa en CloudWatch Logs de la función
`procesarNotificacion` que el mensaje llegó y se procesó.

### 5. Cargar 30,000 registros ficticios

Igual que en los demás microservicios: script con `Faker` + `boto3`, 10,000
entrevistas por cada uno de los 3 tenants (puedes generarlas sin pasar por
SNS/SQS, directo a la tabla, para no saturar la cola con la carga masiva).
