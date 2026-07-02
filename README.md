# SUPERLAB POS

Sistema de punto de venta para **Superlab — Mix and Chill**, diseñado para una única sucursal y basado en los flujos operativos más útiles de Odoo POS.

## Alcance

- Venta rápida por categorías, carrito, descuentos y pagos en efectivo, consignación QR, tarjeta o pago mixto con montos separados.
- Apertura y cierre de caja con base, efectivo esperado y diferencia.
- Pedidos pagados o pausados, trazabilidad por trabajador y reimpresión de recibos.
- Panel administrativo con indicadores, métodos de pago, productos destacados y rendimiento del equipo.
- Catálogo inicialmente sin productos ni precios. El superusuario los registra después con código e imagen por URL o archivo.
- Un superusuario protegido que no puede desactivarse ni modificarse.
- Trabajadores ilimitados para la única sede: **Sucursal principal**.
- Interfaz responsiva y recibo térmico imprimible.
- Todas las fechas, horas, recibos y movimientos de caja se presentan en `America/Bogota` (UTC−5).
- Pantalla de autoservicio en `/tablet`, con cuenta independiente, personalización guiada, dictado por voz y envío directo de comandas al trabajador.

## Ejecución local

```powershell
cd backend
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python run.py
```

Abre `http://127.0.0.1:5000`.

La tablet se abre en `http://127.0.0.1:5000/tablet`.

Para la primera revisión local, si no se define otra cuenta mediante variables de entorno:

- Correo: `admin@superlab.local`
- Contraseña: `Superlab2026!`

Estas credenciales son exclusivamente de desarrollo. Deben cambiarse antes de desplegar.

## Variables de entorno

Consulta [backend/.env.example](backend/.env.example). `DATABASE_URL` admite SQLite para desarrollo y PostgreSQL/Supabase en producción. Ningún archivo `.env` se versiona.

## Pruebas

```powershell
cd backend
python -m pytest tests -v
```

## Publicación en Render

El archivo `render.yaml` configura un Web Service Python con:

- Instalación desde `backend/requirements.txt`.
- Inicio con Gunicorn usando `backend` como directorio de ejecución.
- Health check en `/health`.
- Región Ohio.
- Despliegue automático después de que las pruebas de GitHub pasen.

En el Blueprint de Render se deben completar manualmente:

- `DATABASE_URL`: conexión PostgreSQL/Supabase.
- `SUPERADMIN_EMAIL`.
- `SUPERADMIN_PASSWORD`.
- `TABLET_USER_PASSWORD`.

La cuenta de tablet se configura con `TABLET_USER_EMAIL` y `TABLET_USER_PASSWORD`. En producción debe usarse la URL `https://TU-SERVICIO.onrender.com/tablet`; el dictado por voz requiere HTTPS y permiso de micrófono en Chrome o Edge.

`SECRET_KEY` es generada automáticamente por Render.

El runtime está fijado en Python `3.13.5` mediante `.python-version` y `render.yaml`, evitando que un cambio del runtime predeterminado de Render rompa el despliegue.

Las variables que se deben configurar están documentadas en `RENDER_ENV.example`. No se deben guardar valores reales en GitHub.

El proyecto se entrega primero en localhost para revisión. No se crea commit, push, repositorio remoto ni despliegue sin aprobación posterior del propietario.
