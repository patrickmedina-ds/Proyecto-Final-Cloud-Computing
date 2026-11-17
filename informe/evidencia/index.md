# Evidencia del sistema desplegado (AWS, stage dev, us-east-1)

Recolectada el 2026-11-17. Solo lectura sobre AWS, salvo las pruebas de API (08), que crean y borran datos de prueba.

| Archivo | Descripción | Resultado clave |
|---|---|---|
| 01_lambdas.txt | Funciones cs2032-* con runtime, handler y CodeSize | 31 Lambdas (candidatos 6, entrevistas 6, reportes 5, usuarios 4, vacantes 10), python3.11 |
| 02_api_gateway.txt | APIs REST dev-cs2032-* y sus rutas | 5 APIs (usuarios, candidatos, vacantes, entrevistas, reportes) |
| 03_dynamodb.txt | Tablas t_*-dev e ítems por tenant_id | 7 tablas; candidatos/vacantes/postulaciones 30000 c/u (10000 por tenant); entrevistas 30000 (recalculado); usuarios 5; reportes 2; tokens 13 |
| 04_rds_s3_sns_sqs_amplify.txt | RDS, S3, SNS, SQS y Amplify | RDS MySQL 8.0 db.t3.micro, Single-AZ, no público; bucket de CVs, tópico SNS, cola SQS y app Amplify existentes |
| 05_vpc_seguridad.txt | VPC, endpoints y security group | Endpoints DynamoDB (gateway) y SNS (interface); SG con reglas solo desde el propio SG (3306 y todo) |
| 06_cloudformation.txt | Stacks cs2032-*-dev | 5 stacks en UPDATE_COMPLETE |
| 07_logs_migracion.txt | Logs de migración y de procesarNotificacion | Lambda de migración temporal ya borrada (grupo de logs sin streams); evidencia EDA con "recordatorio_simulado" |
| 08_pruebas_api.txt | Pruebas extremo a extremo y de aislamiento | Sin token: 401; aislamiento entre tenants: 404 (GET y DELETE); crear vacante/entrevista: 201; reporte: 201; limpieza: 200; refresh: 200; refresh como acceso: 401 |
