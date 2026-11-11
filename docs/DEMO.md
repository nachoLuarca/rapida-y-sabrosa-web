# Demo para el local

Guion para mostrarle a Rápida y Sabrosa cómo funciona todo junto, desde un notebook con Windows: el cliente pide
desde su celular, el pedido aparece al instante en el panel, y el local cambia la carta y la ve cambiar en el
celular. En la demo **nada llega al WhatsApp del local**: los pedidos se guardan y se ven en el panel, sin enlace de
WhatsApp.

Dura unos 15 minutos. Hace falta un notebook, un celular (ojalá el del dueño o la dueña) y una red Wi-Fi a la que se
conecten los dos.

## El día antes, en la casa

Así, en el local no hay sorpresas (y no se depende del internet del local para descargar nada):

1. Docker Desktop instalado y abierto, y Node 24.
2. El repositorio al día y las dependencias instaladas: `npm ci` en la raíz.
3. `apps/api/.env` copiado de `apps/api/.env.example`, con `DEMO_MODE=true` y una `DEMO_PASSWORD` fácil de escribir
   en el celular (mínimo 10 caracteres). Anótala.
4. El puerto abierto en el Firewall de Windows (ver abajo).
5. Un ensayo completo: `npm run demo`, abrir la web desde el celular por la IP que muestra, hacer un pedido y verlo en
   el panel. Al terminar, Ctrl+C.
6. Dejar todo limpio para el día de la demo: `npm run demo:reset`.
7. Desconectar la VPN si hay una (por ejemplo, ProtonVPN): suele bloquear la red local.

## Abrir el puerto en el Firewall de Windows

El celular entra al notebook por los puertos 5173 (la web) y 5174 (el panel). Windows los bloquea si la red es
**pública**, que es como queda marcada casi siempre una red Wi-Fi nueva.

**Opción recomendada: una regla solo para esos dos puertos, en redes privadas.** En PowerShell **como
administrador**:

```powershell
# 1. Ver cómo quedó marcada la red Wi-Fi (NetworkCategory: Public o Private)
Get-NetConnectionProfile

# 2. Si dice Public y confías en esa red (la del local o el hotspot del celular), márcala como privada
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private

# 3. Permitir la web y el panel de la demo, solo en redes privadas
New-NetFirewallRule -DisplayName "Rápida y Sabrosa demo" -Direction Inbound -Protocol TCP -LocalPort 5173,5174 -Action Allow -Profile Private
```

Después de la demo, si quieres cerrarlo de nuevo:

```powershell
Remove-NetFirewallRule -DisplayName "Rápida y Sabrosa demo"
```

Si al correr `npm run demo` Windows muestra "Firewall de Windows Defender bloqueó algunas características de Node.js",
marca **solo "Redes privadas"** y acepta. Esa opción abre todos los puertos de Node.js (también el de la API); la
regla de arriba es más acotada.

La base de datos no queda expuesta: PostgreSQL escucha solo en este notebook (`127.0.0.1`).

## Antes de que llegue el local (5 minutos)

1. Conecta el notebook y el celular a **la misma red Wi-Fi**. Si el Wi-Fi del local no deja que los equipos se vean
   (pasa con las redes "de invitados"), usa el **hotspot del celular** y conecta el notebook a él.
2. En la raíz del repositorio:

   ```
   npm run demo:reset
   npm run demo
   ```

   Al final aparecen las URL. La del celular es la que dice "Desde el celular", por ejemplo
   `http://192.168.1.8:5173`. Si cambias de red, corre `npm run demo` de nuevo: la IP cambia.
3. En el notebook, abre el panel (`http://localhost:5174`), entra con `caja@demo.local` y la contraseña de
   `DEMO_PASSWORD`, y activa **"Aviso sonoro"** en el header (con volumen).
4. En el celular, abre la URL de la web y déjala cargada. Si quieres, agrégala a la pantalla de inicio.

## El guion

| # | Dónde | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | Celular | La carta con su marca, las categorías y "Buscar en la carta": escribir "mechada". | "Es su carta de hoy, con su marca. Funciona en cualquier celular, sin instalar nada." |
| 2 | Celular | Agregar una Suprema y un jugo (elegir el tamaño). Abrir **Arma tu pizza** y elegir 3 ingredientes: el precio cambia solo a la promoción. | "El precio lo calcula el sistema, igual que ustedes." |
| 3 | Celular | Abrir el pedido, "Continuar con mis datos", elegir despacho y una zona: aparece el costo de despacho. Completar nombre y celular. | "Les llega todo lo que necesitan: dirección, zona, forma de pago y comentario." |
| 4 | Celular → notebook | "Enviar pedido". En el celular: "Pedido RYS-0001 recibido (demo)". En el notebook suena el aviso y el pedido entra arriba de **Pendientes**, destacado, con "(1)" en la pestaña. | "En la vida real, el cliente además lo manda por WhatsApp con este código, así lo encuentran al tiro." |
| 5 | Notebook | Abrir el pedido: líneas con los ingredientes, total, cliente, dirección. Volver y avanzarlo: **Confirmar → A preparar → Despachar → Entregado**. | "Cualquiera de la caja lo puede mover. Queda registro de quién hizo cada cambio." |
| 6 | Notebook | **Carta**: apagar el interruptor de la Suprema. | "Si se acaba algo, lo marcan aquí." |
| 7 | Celular | Salir del navegador y volver (o recargar): la Suprema aparece **Agotada**, sin botón para agregarla. | "El cliente ya no la puede pedir. Al volver a tenerla, la encienden." |
| 8 | Notebook | Cerrar sesión y entrar con `admin@demo.local`. En **Carta**, "Editar" un producto y cambiarle el precio; "Guardar". En el celular, volver: el precio nuevo. | "La administración cambia precios, zonas y el horario; la caja solo agotados y la pausa." |
| 9 | Notebook → celular | **Ajustes**: "Pausar pedidos" y confirmar. En el celular, volver: el aviso "Por ahora no estamos recibiendo pedidos" y no se puede enviar. Reanudar. | "Si se llenan un viernes, pausan y listo. El horario también cierra solo fuera de hora." |
| 10 | Los dos | Encender de nuevo la Suprema, devolver el precio, y conversar lo pendiente (abajo). | |

Si hay tiempo: hacer un segundo pedido desde otro celular para mostrar dos pedidos a la vez, o abrir el panel también
en el celular (`http://IP:5174`).

## Lo que hay que conversar con el local

Lo que sigue sin confirmar (`docs/SPEC.md` y `docs/BACKEND-SPEC.md`):

- Precios de los ingredientes de Arma tu pizza (hoy son provisorios).
- Horario de atención y dirección para retiro.
- Tamaños, fotos de los productos y el logo en buena calidad.
- Quiénes usarán el panel y con qué rol (administración o caja).
- Si quieren pausar los pedidos a mano además del horario.

## Después de la demo

- Ctrl+C en la terminal cierra la API, la web y el panel. La base queda arriba; `npm run db:down` la baja.
- `npm run demo:reset` borra los pedidos de la demo y deja la carta como en `docs/data`, lista para la próxima.

## Si el celular no conecta

Ve en orden; casi siempre es uno de los primeros:

1. **¿La URL es la correcta?** Debe empezar con `http://` (no `https://`), llevar la IP de "Desde el celular" y el
   puerto `:5173` (web) o `:5174` (panel). Escríbela completa: algunos navegadores agregan `https` solos.
2. **¿Están en la misma red?** En el celular, la red Wi-Fi tiene que ser la misma del notebook (no los datos móviles).
3. **¿Abre desde el mismo notebook por la IP?** Abre `http://IP:5173` en el navegador del notebook. Si ahí no abre, la
   demo no está corriendo: revisa la terminal. Si ahí abre y en el celular no, es la red o el Firewall.
4. **Firewall:** revisa que la red esté como privada y que exista la regla (sección de arriba). Para descartarlo,
   prueba un momento con el Firewall de Windows desactivado para redes privadas y vuelve a activarlo después.
5. **VPN:** desconéctala y corre `npm run demo` de nuevo.
6. **Red "de invitados" o del local que aísla los equipos:** cambia al hotspot del celular (conecta el notebook al
   hotspot y corre `npm run demo` de nuevo; la IP cambia).
7. **La IP no es la de la red Wi-Fi:** si `npm run demo` muestra otras IP en "Si no abre, prueba con", prueba esas.
   Para ver la IP a mano: `ipconfig` y busca "Adaptador de LAN inalámbrica Wi-Fi" → "Dirección IPv4".
8. **El panel abre pero no deja entrar o no guarda:** entra de nuevo; si sigue, revisa que la API corra en modo demo
   (la terminal muestra `npm run demo`, no `npm run dev`).

Si nada resulta, la demo se puede hacer igual en el notebook: la web en `http://localhost:5173` en una ventana y el
panel en `http://localhost:5174` en otra, una al lado de la otra.
