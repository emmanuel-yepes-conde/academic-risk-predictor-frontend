# Academic Risk Predictor — Frontend

Aplicación web React + TypeScript + Vite que conecta con el backend de predicción de riesgo académico.

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Node.js | 18+ |
| npm | 9+ |

---

## 1. Clonar el proyecto

```bash
git clone <repository-url>
cd academic-risk-predictor-frontend
```

---

## 2. Instalar dependencias

```bash
npm install
```

---

## 3. Configurar variable de entorno

Crea un archivo `.env.development` en la raíz del proyecto:

```env
VITE_API_BASE_URL=http://localhost:8000
```

En desarrollo la app usa `http://localhost:8000` como backend local. En Vercel/despliegue configura `VITE_API_BASE_URL` con la URL raíz del backend de Azure, sin `/api/v1`.

---

## 4. Iniciar en desarrollo

```bash
npm run dev
```

La app quedará disponible en: http://localhost:5173

---

## Credenciales de prueba

| Email | Contraseña | Rol |
|---|---|---|
| `admin@universidad.edu` | `Admin123!` | Administrador |
| `deividlujan200+profesor@gmail.com` | `David123!` | Profesor |
| `deividlujan200@gmail.com` | _(la del estudiante)_ | Estudiante |

> El administrador requiere que el backend esté corriendo y la DB inicializada.

---

## Scripts disponibles

```bash
npm run dev       # Servidor de desarrollo con hot reload (puerto 5173)
npm run build     # Compilar para producción (salida en /dist)
npm run preview   # Previsualizar build de producción
```

---

## Estructura del proyecto

```
academic-risk-predictor-frontend/
├── public/
│   └── assets/
│       ├── ar-logo.png              # Logo principal (hero + footer)
│       ├── ar-icon.png              # Ícono (header admin)
│       └── USB_Logo.png             # Logo universidad
├── src/
│   ├── main.tsx                     # Entry point React
│   ├── App.tsx                      # Router principal + ErrorBoundary
│   ├── index.css                    # Estilos globales + Tailwind
│   ├── pages/
│   │   ├── Landing.tsx              # Inicio (estudiante/profesor) — animado
│   │   ├── Login.tsx                # Pantalla de login
│   │   ├── Admin.tsx                # Panel administrador
│   │   ├── MisNotas.tsx             # Vista de notas (estudiante)
│   │   └── Prediccion.tsx           # Predictor ML (estudiante)
│   ├── components/
│   │   ├── Header.tsx               # Navbar con tour guide
│   │   ├── Toast.tsx                # Notificaciones toast
│   │   └── TourGuide.tsx            # Tour interactivo (react-joyride)
│   ├── context/
│   │   ├── AuthContext.tsx          # Estado de autenticación + JWT
│   │   └── GradesContext.tsx        # Estado compartido de notas
│   ├── services/
│   │   ├── api.ts                   # Cliente HTTP base (con refresh token)
│   │   ├── authService.ts           # Login, logout, refresh
│   │   ├── userService.ts           # CRUD usuarios
│   │   ├── programService.ts        # Universidades, programas, sedes
│   │   ├── courseService.ts         # Materias
│   │   ├── notificationService.ts   # Emails (alerta riesgo, recordatorio)
│   │   └── errorMessages.ts         # Mensajes de error amigables
│   ├── hooks/
│   │   ├── useTour.ts               # Tour guiado por página
│   │   └── useGrades.ts
│   └── types/
│       └── index.ts                 # Tipos globales TypeScript
├── .env                             # ⚠️ Crear manualmente (ver paso 3)
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Stack tecnológico

| Tecnología | Uso |
|---|---|
| React 18 + TypeScript | UI + tipado estático |
| Vite | Bundler + dev server |
| React Router v6 | Navegación SPA |
| Tailwind CSS 3.4 | Estilos utilitarios |
| Framer Motion | Animaciones y transiciones |
| GSAP + ScrollTrigger | Animaciones de scroll |
| Lucide React | Íconos |
| react-joyride | Tours interactivos guiados |

---

## Flujo de autenticación

1. El usuario hace login → backend devuelve `access_token` + `refresh_token`
2. Los tokens se guardan en `localStorage` como `ar-token` y `ar-refresh-token`
3. El `access_token` incluye: `sub` (UUID), `role`, `full_name`, `exp`
4. Cuando el token expira, `api.ts` llama automáticamente a `/auth/refresh`
5. Al hacer logout, se borran ambos tokens del localStorage

**Roles y rutas:**
| Rol | Ruta de inicio | Acceso |
|---|---|---|
| `ADMIN` | `/admin` | Panel completo de administración |
| `PROFESSOR` | `/dashboard` | Vista de cursos y estudiantes |
| `STUDENT` | `/landing` | Landing, Mis Notas, Predicción |

---

## Solución de problemas frecuentes

### `VITE_API_BASE_URL` no definida
- En desarrollo no es obligatoria: el frontend usa `http://localhost:8000`.
- En Vercel, configurar `VITE_API_BASE_URL=https://<dns-de-azure>` sin `/api/v1`.
- Reiniciar `npm run dev` después de crear el archivo

### Error de CORS
- Verificar que el backend esté corriendo en `http://localhost:8000`
- El backend acepta `*` por defecto en CORS

### La tabla de usuarios no carga (Admin)
- El endpoint acepta máximo `limit=100` — el frontend ya está configurado correctamente
- Verificar que el JWT del admin no haya expirado (30 min)

### El saludo muestra el email en vez del nombre
- Cerrar sesión y volver a entrar — el JWT anterior no tenía `full_name`
- Los tokens nuevos ya incluyen el nombre completo
