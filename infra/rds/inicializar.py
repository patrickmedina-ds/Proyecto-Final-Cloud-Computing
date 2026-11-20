"""Aplica el esquema versionado desde la misma VPC que RDS."""

import os
from pathlib import Path

import pymysql
from pymysql.constants import CLIENT


def handler(event, context):
    sql = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
    connection = pymysql.connect(
        host=os.environ["RDS_HOST"],
        port=int(os.environ["RDS_PORT"]),
        user=os.environ["RDS_USER"],
        password=os.environ["RDS_PASSWORD"],
        charset="utf8mb4",
        ssl_ca=str(Path(__file__).with_name("rds-ca.pem")),
        ssl_verify_cert=True,
        ssl_verify_identity=True,
        connect_timeout=10,
        read_timeout=45,
        write_timeout=10,
        client_flag=CLIENT.MULTI_STATEMENTS,
        autocommit=True,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            while cursor.nextset():
                pass
    finally:
        connection.close()
    return {"ok": True}
