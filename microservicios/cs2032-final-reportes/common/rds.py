"""Acceso a RDS MySQL (patrón Single Database, Multiple Schemas) para contar vacantes y postulaciones.

Un schema por tenant (tenant_1, tenant_2, ...). El tenant_id que sale del token
decide a qué schema se conecta; el nombre del schema va SOLO en el parámetro
`database` de la conexión, nunca dentro del SQL.
"""
import os
import re

import pymysql

# Variables de entorno definidas en serverless.yml (provider.environment)
RDS_HOST = os.environ.get("RDS_HOST")
RDS_USER = os.environ.get("RDS_USER")
RDS_PASSWORD = os.environ.get("RDS_PASSWORD")
RDS_PORT = int(os.environ.get("RDS_PORT", "3306"))

PATRON_TENANT = re.compile(r"^tenant_[a-z0-9_]+$")
# Únicas tablas que se pueden contar (constantes fijas: el nombre se interpola en el SQL)
TABLAS_CONTABLES = ("vacantes", "postulaciones")


def conexion_tenant(tenant_id):
    """Abre una conexión al schema del tenant. El llamador debe cerrarla (try/finally)."""
    if not isinstance(tenant_id, str) or not PATRON_TENANT.match(tenant_id):
        raise ValueError("tenant_id inválido")
    return pymysql.connect(
        host=os.environ.get("RDS_HOST", RDS_HOST),
        user=os.environ.get("RDS_USER", RDS_USER),
        password=os.environ.get("RDS_PASSWORD", RDS_PASSWORD),
        port=int(os.environ.get("RDS_PORT", RDS_PORT)),
        database=tenant_id,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5,
        autocommit=False,
    )


def contar_por_estado(tenant_id, tabla):
    """Cuenta las filas de `vacantes` o `postulaciones` agrupadas por estado: {estado: conteo}."""
    if tabla not in TABLAS_CONTABLES:
        raise ValueError("tabla inválida")
    conexion = conexion_tenant(tenant_id)
    try:
        with conexion.cursor() as cursor:
            # `tabla` ya se validó contra la lista fija de arriba
            cursor.execute(f"SELECT estado, COUNT(*) AS total FROM {tabla} GROUP BY estado")
            filas = cursor.fetchall()
    finally:
        conexion.close()
    # Mismo criterio que antes: estado nulo se reporta como "sin_valor"; conteos como int
    return {(f["estado"] if f["estado"] is not None else "sin_valor"): int(f["total"]) for f in filas}
