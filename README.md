# CRM de Empleabilidad Nacional — Proyecto Final CS2032 (Grupo 1)

Solución SaaS multi-tenant, serverless y basada en eventos en AWS, de tipo **CRM** aplicado a empleabilidad: empresas o agencias de reclutamiento (tenants) gestionan candidatos, vacantes, postulaciones, entrevistas y reportes de contratación.

- Universidad de Ingeniería y Tecnología (UTEC), curso CS2032 Cloud Computing, ciclo 2026-2.
- Región AWS `us-east-1`. Python 3.11. Serverless Framework v3.

## Contenido del repositorio

| Carpeta / archivo | Descripción |
|---|---|
| `microservicios/cs2032-final-usuarios` | Autenticación, tokens y alta de usuarios (DynamoDB). |
| `microservicios/cs2032-final-candidatos` | Candidatos y subida de CV a S3 (DynamoDB). |
| `microservicios/cs2032-final-vacantes` | Vacantes y postulaciones (MySQL RDS, un schema por tenant). |
| `microservicios/cs2032-final-entrevistas` | Entrevistas y evento SNS/SQS (DynamoDB + RDS). |
| `microservicios/cs2032-final-reportes` | Reportes de contratación por tenant (DynamoDB + RDS). |
| `microservicios/cs2032-final-frontend` | Frontend estático desplegado en AWS Amplify. |
| `docs/` | Diseño de bases de datos y documentación de infraestructura. |
| `informe/` | Fuentes LaTeX del informe, evidencia de AWS y pruebas de API. |
| `presentacion/` | Presentación PowerPoint del proyecto. |
| `Diagrama_Arquitectura_Solucion.drawio` / `.png` | Diagrama de arquitectura de la solución. |
| `SPEECH_DEMO_PRIMER_AVANCE.md` | Guion de la demo con dos tenants. |

## Enlaces públicos

- Repositorio: https://github.com/patrickmedina-ds/Proyecto-Final-Cloud-Computing
- Usuarios / Autenticación: https://github.com/patrickmedina-ds/Proyecto-Final-Cloud-Computing/tree/main/microservicios/cs2032-final-usuarios
- Candidatos: https://github.com/patrickmedina-ds/Proyecto-Final-Cloud-Computing/tree/main/microservicios/cs2032-final-candidatos
- Vacantes / Postulaciones: https://github.com/patrickmedina-ds/Proyecto-Final-Cloud-Computing/tree/main/microservicios/cs2032-final-vacantes
- Entrevistas / Seguimiento: https://github.com/patrickmedina-ds/Proyecto-Final-Cloud-Computing/tree/main/microservicios/cs2032-final-entrevistas
- Reportes: https://github.com/patrickmedina-ds/Proyecto-Final-Cloud-Computing/tree/main/microservicios/cs2032-final-reportes
- Frontend: https://github.com/patrickmedina-ds/Proyecto-Final-Cloud-Computing/tree/main/microservicios/cs2032-final-frontend
- Aplicación desplegada (Amplify): https://main.d2mg8kior54du3.amplifyapp.com

## Nota sobre la estructura

El curso pide un repositorio por microservicio. Este proyecto usa **un solo repositorio** con una carpeta por microservicio, para mantener los contratos entre servicios en un mismo lugar. Cada carpeta contiene su propio `serverless.yml`, su README y su despliegue independiente.

## Despliegue (resumen)

```bash
cd microservicios/cs2032-final-<servicio>
npm install
serverless deploy --stage dev
```

Cada README de microservicio documenta los endpoints, las variables de entorno y el script de carga de datos ficticios.

## Informe y evidencia

- Informe: `Informe_Final_CS2032.pdf` (raíz).
- Evidencia reproducible: `informe/evidencia/`.
- Hechos verificados y brechas: `informe/hechos_clave.md`.

### Aprovisionamiento de RDS

[Despliegue de RDS, esquemas y microservicios dependientes](infra/rds/README.md).
