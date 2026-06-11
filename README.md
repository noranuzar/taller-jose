# Taller de José — Sistema de Gestión de Pedidos

## Configurar Supabase (5 minutos, gratis)

### Paso 1: Crear proyecto en Supabase
1. Ve a **supabase.com** → Sign Up (con GitHub)
2. Pulsa **"New Project"**
3. Nombre: `taller-jose`
4. Contraseña de DB: genera una y guárdala
5. Región: **West EU (Ireland)** (la más cercana a Madrid)
6. Espera 2 minutos a que se cree

### Paso 2: Crear las tablas
1. En el dashboard de Supabase → **SQL Editor** (icono de terminal a la izquierda)
2. Pulsa **"New Query"**
3. Copia y pega TODO el contenido del archivo `supabase-schema.sql`
4. Pulsa **"Run"** (botón verde)
5. Debe salir "Success. No rows returned" — eso es correcto

### Paso 3: Copiar las claves
1. Ve a **Settings** (engranaje) → **API**
2. Copia **Project URL** (algo como `https://abc123.supabase.co`)
3. Copia **anon/public key** (empieza por `eyJ...`)

### Paso 4: Configurar en Vercel
1. En Vercel → tu proyecto → **Settings** → **Environment Variables**
2. Añade dos variables:
   - `VITE_SUPABASE_URL` = la URL del paso 3
   - `VITE_SUPABASE_ANON_KEY` = la key del paso 3
3. Pulsa **Save**
4. Ve a **Deployments** → pulsa **"Redeploy"** en el último deploy

¡Listo! La app ya guarda datos en Supabase.

## Para desarrollo local
1. Copia `.env.example` como `.env`
2. Rellena con tus claves de Supabase
3. `npm install`
4. `npm run dev`

## PIN de administración
Por defecto: `1234`. Cámbialo en `src/App.jsx`.
