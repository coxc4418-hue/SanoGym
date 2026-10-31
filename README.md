# Sano Gym 💪

Software de gestión para gimnasios de la línea **Sano** (Sano Dental, Sano Doctor, Sano-Técnico, SanoGestion).
PWA instalable (PC, tablet, Android, iPhone), multisede (20 sedes + administrador general) y mundial:
el país se elige la primera vez y define moneda, formas de pago y código de WhatsApp.

**Producción:** https://sano-gym.web.app · **Credenciales:** `CREDENCIALES_SANO_GYM.txt` (no se sube a git)

## Qué hace

| Módulo | Detalle |
|---|---|
| Recepción y acceso | Lector QR USB, cámara, documento, N° de socio o nombre. Verde/amarillo/rojo con el motivo: vencido (días de gracia), congelado, sin sesiones, fuera del horario del plan, deuda, PAR-Q sin constancia, cumpleaños. Renovar, pase diario o autorizar con PIN ahí mismo. Aforo en vivo. |
| Modo kiosco | Tablet en la entrada: el socio pasa su carnet o teclea su documento. Salir siempre pide PIN. |
| Socios | Ficha con foto, objetivo, nivel, emergencia, PAR-Q; pestañas de membresías, asistencia (mapa de calor), clases, rutina, evaluaciones, pagos y salud. Importar/exportar CSV. |
| Membresías | Planes por tiempo, por sesiones y pase diario; horario restringido (mañanero), inscripción y reinscripción, descuentos, abonos/crédito, congelar con límite por plan, ajustes con PIN. Renovar antes de vencer no pierde días. |
| Carnet digital | `/carnet/CÓDIGO`: QR, estado del plan, rutina del día con checklist y progreso. Se envía por WhatsApp y se imprime en tamaño tarjeta. |
| Renovaciones y cobranza | Por vencer (3/7/15/30 días), vencidos, deudores, inactivos y cumpleaños, con mensaje de WhatsApp listo y registro de contacto. |
| Clases grupales | Horario semanal, cupos, reservas, lista de espera con promoción automática, asistencia y faltas. |
| Rutinas y evaluaciones | 6 plantillas profesionales + biblioteca de ejercicios; IMC, % grasa (Marina de EE. UU.), masa magra, riesgo por cintura, metabolismo basal y calorías/proteína por objetivo. |
| Vender, caja y tienda | Membresías, servicios (toalla, locker, clase suelta…) y tienda con inventario; varias formas de pago y vuelto; apertura, gastos y cierre de caja; recibos y anulaciones con PIN. |
| Reportes | Ingresos por plan, tasa de renovación, horas pico, ocupación de clases, comisiones de entrenadores, gastos, rechazos y demografía (con PIN). |
| Demo | 30 minutos sin registro con un gimnasio completo de ejemplo (PIN 1234) y recorrido guiado; todo se borra al terminar. |

## Estructura

- `public/` — la app (JavaScript sin compilación + Firebase 10.14.1). `js/views/` una pantalla por archivo; `js/ops.js` reglas de negocio; `js/gym.js` planes, PAR-Q, fórmulas y rutinas; `js/store.js` datos en tiempo real.
- `firestore.rules` — cada sede solo ve lo suyo (`tenants/{uid}`); `cards/{código}` se lee solo por código exacto.
- `scripts/` — aprovisionamiento y pruebas.

## Comandos (desde `scripts/`)

```sh
# Emuladores (desde PowerShell, en la carpeta del proyecto)
firebase emulators:start --only auth,firestore,hosting --project sano-gym   # app en http://127.0.0.1:5099/?emu=1

sh test-emu.sh                 # crea 3 sedes en el emulador y corre la prueba E2E (46 verificaciones)
node mobile-check.mjs          # sin scroll lateral de 320 px a 1366 px
node print-check.mjs           # recibo, carnet, rutina y evaluación impresos
node prod-smoke.mjs shots      # prueba rápida en producción (la demo se limpia sola)
node pwa-check.mjs             # instalable en PC y Android

node provision.mjs 20          # crea/actualiza las 20 sedes + admin en producción
firebase deploy --only auth,firestore,hosting --project sano-gym
```
