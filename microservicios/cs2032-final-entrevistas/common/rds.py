"""Acceso a RDS MySQL (patrón Single Database, Multiple Schemas) para validar vacantes.

Un schema por tenant (tenant_1, tenant_2, ...). El tenant_id que sale del token
decide a qué schema se conecta; el nombre del schema va SOLO en el parámetro
`database` de la conexión, nunca dentro del SQL. Todas las consultas son parametrizadas.
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


def vacante_existe(tenant_id, vacante_id):
    """True si la vacante existe en el schema del tenant."""
    conexion = conexion_tenant(tenant_id)
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM vacantes WHERE vacante_id = %s LIMIT 1", (vacante_id,))
            return cursor.fetchone() is not None
    finally:
        conexion.close()
