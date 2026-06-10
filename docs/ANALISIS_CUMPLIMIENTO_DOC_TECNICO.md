# Análisis de Cumplimiento — Chatbot Mesa de Ayuda OTIN
**Documento de referencia**: DOC_TECNICO_CHATBOT_OTIN.docx (v1.0, 08 abril 2026)  
**Fecha de análisis**: 03 junio 2026  
**Analista**: Claude Code — Revisión técnica automatizada

---

## Resumen Ejecutivo

| Dimensión | Estado |
|---|---|
| Requisitos Funcionales cubiertos | **5 de 8 completos**, 2 parciales, 1 faltante |
| Requisitos No Funcionales cubiertos | **2 de 6**, 2 incumplidos críticos, 2 parciales |
| Criterios de Aceptación (sección 7) | **0 de 7** formalmente ejecutados |
| Funcionalidades implementadas FUERA de alcance | **1 crítica** (automatización SSI) |
| Anexos disponibles para descarga | **4 de 7** (faltan ANEXO 05, 06/PROD-02, 07 + Formato F-01) |

**Veredicto general**: El chatbot cumple el núcleo funcional del documento (comprensión de lenguaje natural, clasificación SSI, triaje, persistencia de sesión, descarga de Anexos 01–04). Sin embargo presenta **2 incumplimientos críticos** (LLM en nube y automatización SSI fuera de alcance), **3 Anexos faltantes**, y escalamiento solo orientativo sin mecanismo real.

---

## 1. Análisis por Requisito Funcional

### RF-01 — Consultas en lenguaje natural ✅ CUMPLE

**Qué pide el documento**: El chatbot debe recibir consultas sin restricciones de formato (alta prioridad).

**Qué hay implementado**:
- Interfaz web con campo de texto libre (`#userInput`, `public/index.html`)
- Gemini 2.5 Flash procesa el mensaje crudo del usuario sin ningún preprocesamiento
- Chips de respuesta rápida opcionales (no obligatorios) en el frontend
- Soporte para variaciones ortográficas, sin tildes, y lenguaje informal

**Brecha**: Ninguna. Cumplimiento total.

---

### RF-02 — Identificar tipo exacto de solicitud SSI ✅ CUMPLE

**Qué pide el documento**: El LLM debe identificar el tipo exacto del catálogo SSI desde la descripción del usuario (alta prioridad).

**Qué hay implementado**:
- `prompts/system-prompt.md` (481 líneas) contiene el catálogo completo de ~70 tipos de solicitud organizados en 11 grupos exactamente como aparecen en el SSI
- Los tipos están en el prompt con su texto literal: `'Creación de cuenta de usuario de correo'`, `'Problemas con Equipo de Computo (Especificar)'`, etc.
- La herramienta `create_ssi_ticket` recibe el parámetro `categoria` con el texto exacto y lo usa para seleccionar en el formulario SSI

**Brecha menor**: El documento menciona 90+ tipos de solicitud en 7 categorías. El prompt cubre ~70 tipos en 11 grupos. Puede haber hasta ~20 tipos del catálogo SSI sin cobertura explícita en el prompt.

---

### RF-03 — Identificar Anexo, datos requeridos y enlace de descarga ⚠️ PARCIAL

**Qué pide el documento**: Cuando aplique Anexo, el chatbot debe: identificar cuál aplica, listar datos requeridos, y dar enlace de descarga (alta prioridad). Los 7 Anexos + Formato F-01 deben estar disponibles (RF-08).

**Qué hay implementado**:
- ANEXO 01 — Acceso Remoto/USB: ✅ plantilla disponible, función de generación implementada (`generateAnexo01`)
- ANEXO 02 — Acceso a Servicios: ✅ plantilla disponible, función completa con `docxtemplater` + lógica de perfiles de internet (1/2/3 según cargo)
- ANEXO 03 — FTP: ✅ plantilla disponible, función de generación implementada
- ANEXO 04 — Carpetas compartidas: ✅ plantilla disponible, función de generación implementada
- **ANEXO 05**: ❌ No existe en el sistema (no hay plantilla ni función)
- **ANEXO 06 / PROD-02 (Base de Datos)**: ❌ El prompt describe el flujo pero no hay plantilla, función de generación ni endpoint de descarga. Solo orientación textual.
- **ANEXO 07 (Transferencia de información)**: ❌ No existe en ninguna parte del sistema
- **Formato F-01 (Altas y Bajas)**: ❌ El prompt lo describe pero no tiene generación automática ni descarga. Solo guía textual.
- **Formato PROD-02**: ❌ Referenciado en el prompt, archivo `.docx` en `Anexos/` pero sin endpoint de descarga ni generación

**Lógica de tool call**: La herramienta `generate_document` solo acepta `tipo ∈ {ANEXO01, ANEXO02, ANEXO03, ANEXO04}`. Si Gemini intenta llamarla con otro valor, el handler rechaza con "Tipo no válido". Los formatos faltantes no tienen herramienta de function calling asociada.

**Brecha**: Faltan 3 Anexos + 2 Formatos (F-01 y PROD-02) con capacidad de descarga/generación directa desde la conversación.

---

### RF-04 — Protocolo de triaje (mínimo 3 preguntas) ⚠️ PARCIAL

**Qué pide el documento**: Para solicitudes de problemas técnicos, aplicar triaje de mínimo 3 preguntas (media prioridad). Categoría 6 (Permisos) también define preguntas de triaje.

**Qué hay implementado**:
- Categoría 4 (Problemas Técnicos): ✅ 4 preguntas secuenciales en el prompt (`¿afecta solo tu equipo o varios?`, `¿cuándo empezó?`, `¿mensaje de error?`, `¿cambios previos?`). Supera el mínimo de 3.
- Categoría 1 (Cuentas): ✅ pregunta de subtipo (correo/red/intranet)
- Categoría 6 (Permisos): ✅ derivación al Anexo correcto según subtipo
- Categoría 5 (Impresoras): ✅ preguntas específicas (síntoma, bandeja, tipo de papel)

**Brecha**: El triaje formalizado de 3+ preguntas está definido en el prompt para Categoría 4. Para otras categorías (especialmente Categoría 2 — Software y Categoría 3 — Configuración), el documento define "datos necesarios" pero el prompt no tiene preguntas de triaje tan estructuradas como las que se documentan en la sección 3.2.

---

### RF-05 — Mantener contexto durante la sesión ✅ CUMPLE

**Qué pide el documento**: El chatbot debe mantener el contexto de conversación durante toda la sesión (alta prioridad).

**Qué hay implementado**:
- Cookie HTTP-only `otin_session` (UUID, 7 días, `sameSite: strict`) — `middleware/session.js`
- Historial cargado desde PostgreSQL tabla `messages` en cada request (`getSessionMessages`, LIMIT 50)
- Enviado a Gemini como `history[]` (array de `{role, parts}`)
- `sessionStorage` en browser para persistir mensajes al recargar sin round-trip

**Brecha**: El documento define variables de sesión específicas (`categoria_detectada`, `tipo_solicitud_ssi`, `anexo_requerido`, `escalar`) que el orquestador debería mantener. El sistema actual solo persiste los mensajes textuales + eventos en la BD; no hay variables de sesión estructuradas accesibles programáticamente durante la sesión.

---

### RF-06 — Escalamiento a soporte humano ⚠️ PARCIAL

**Qué pide el documento**: El chatbot debe escalar a soporte humano ante 5 condiciones específicas (alta prioridad): problema masivo, 3 turnos sin clasificar, solicitud explícita, datos sensibles, tipo no en catálogo.

**Qué hay implementado**:
- El system prompt define el escalamiento textualmente (líneas 250–261)
- El chatbot responde con datos de contacto: `soporte@inei.gob.pe`, `(01) 743 4949 / Anexo 9391`, responsable: Santiago Iván García Montañez
- La herramienta `set_urgency(P1)` agrega un badge visual rojo y el texto recomienda llamar inmediatamente

**Brechas**:
1. El escalamiento es **íntegramente orientativo** — no hay webhook, email automático, notificación push ni integración con sistema de ticketing que alerte a un técnico humano.
2. No hay contador de turnos sin clasificar ("3 turnos sin resolver → escalar") — depende del criterio del LLM.
3. El documento específica que el escalamiento debe ser **automático** ("escalar automáticamente a soporte técnico presencial") — la implementación actual requiere que el usuario llame o escriba al email.

---

### RF-07 — Informar tipo exacto de solicitud SSI ✅ CUMPLE

**Qué pide el documento**: El chatbot debe informar siempre el tipo exacto que el usuario debe seleccionar en el SSI (alta prioridad).

**Qué hay implementado**:
- El system prompt instruye explícitamente indicar el tipo SSI exacto
- La herramienta `create_ssi_ticket` usa el campo `categoria` con texto literal del catálogo
- En el flujo de orientación (sin creación automática), el LLM cita el tipo exacto en la respuesta textual

**Brecha**: Ninguna significativa.

---

### RF-08 — Disponibilidad de Anexos para descarga ❌ INCUMPLE PARCIALMENTE

**Qué pide el documento**: Los 7 Anexos y el Formato F-01 deben estar disponibles para descarga directa desde la conversación (media prioridad).

**Qué hay implementado**: 4 de 7 + 0 de 1 Formatos. Ver detalle en RF-03.

| Documento | Plantilla | Generación | Descarga directa |
|---|---|---|---|
| ANEXO 01 | ✅ | ✅ | ✅ |
| ANEXO 02 | ✅ | ✅ | ✅ |
| ANEXO 03 | ✅ | ✅ | ✅ |
| ANEXO 04 | ✅ | ✅ | ✅ |
| ANEXO 05 | ❌ | ❌ | ❌ |
| ANEXO 06 / PROD-02 | referencia en `Anexos/` | ❌ | ❌ |
| ANEXO 07 | ❌ | ❌ | ❌ |
| Formato F-01 | referencia en `Anexos/` (.xlsx) | ❌ | ❌ |

---

## 2. Análisis por Requisito No Funcional

### RNF-01 — Tiempo de respuesta ≤ 10 segundos ⚠️ PROBABLEMENTE CUMPLE (sin medición)

**Qué pide el documento**: Promedio ≤ 10 segundos por consulta.

**Estado**: Gemini 2.5 Flash con Context Cache (TTL 3600s) responde en ~2–5 segundos para consultas simples. La automatización SSI toma ~72 segundos (caso especial de creación de ticket). No hay telemetría de latencia implementada.

**Brecha**: No hay medición formal ni alertas de SLA. El endpoint `/api/metrics` registra volumen pero no latencia.

---

### RNF-02 — LLM en infraestructura local OTIN ❌ INCUMPLIMIENTO CRÍTICO

**Qué pide el documento**: "El LLM debe operar en la infraestructura local de la OTIN, **sin envío de datos a servicios externos en la nube**."

**Estado actual**: El sistema usa **Gemini 2.5 Flash via Google Cloud API** (`@google/generative-ai`). Cada consulta del usuario se envía a los servidores de Google en la nube. Esto incluye el texto de la consulta y el historial de la conversación.

**Impacto**: Incumplimiento directo de la política de privacidad institucional definida en el documento. Los datos de los usuarios del INEI (consultas técnicas, nombres, áreas, etc.) salen de la infraestructura del INEI. Para cumplir este requisito se necesitaría desplegar un LLM local (LLaMA, Mistral, o similar via Ollama) en la infraestructura de la OTIN.

**Nota**: Este requisito puede haber sido tomado como una guía de diseño inicial y no como restricción absoluta en la implementación actual. Sin embargo, tal como está redactado, es un incumplimiento.

---

### RNF-03 — Accesible desde intranet sin instalación ✅ CUMPLE

**Qué pide el documento**: Accesible desde navegadores estándar de la intranet sin instalación adicional.

**Estado**: Servidor Express.js con frontend en `public/` (HTML + CSS + JS vanilla). Middleware `internalOnly` restringe acceso al rango `10.0.0.0/8`. No requiere instalación del lado del cliente.

**Brecha**: Ninguna. Los endpoints `/admin` y `/api/metrics` actualmente no tienen `internalOnly` activado (comentado con `// TODO`). Deberían restringirse.

---

### RNF-04 — Disponibilidad horario laboral ❌ NO IMPLEMENTADO

**Qué pide el documento**: El sistema debe estar disponible lunes a viernes, 08:00–17:30.

**Estado**: No hay control de horario. El servidor corre 24/7 sin restricción temporal. No hay middleware de horario laboral, ni respuesta diferenciada fuera de horario.

**Brecha**: Falta un middleware o lógica que responda "fuera de horario" con mensaje informativo y deshabilite el procesamiento de mensajes.

---

### RNF-05 — Tono formal, claro, sin tecnicismos ✅ CUMPLE

**Qué pide el documento**: Tono formal, claro, libre de tecnicismos, coherente con estilo institucional INEI.

**Estado**: El system prompt define explícitamente el tono: "formal pero accesible, como un técnico paciente y profesional". Los flujos de ejemplo del sistema están en registro formal. La validación del E2E test confirma respuestas del estilo "Buenos días, Sr. Pérez."

---

### RNF-06 — No almacenamiento permanente sin consentimiento ❌ INCUMPLIMIENTO

**Qué pide el documento**: El historial no debe almacenarse permanentemente sin consentimiento del usuario.

**Estado**: Toda conversación se persiste indefinidamente en PostgreSQL (tablas `sessions`, `messages`, `events`). No hay mecanismo de consentimiento, no hay TTL/expiración de datos, no hay opción de borrado por parte del usuario.

**Brecha**: Se requiere implementar al menos: (a) política de retención de datos con borrado automático después de N días, o (b) mecanismo de consentimiento explícito al iniciar sesión, o (c) ambos.

---

## 3. Funcionalidades Implementadas FUERA del Alcance del Documento

### Automatización SSI via Playwright ⚠️ FUERA DE ALCANCE EXPLÍCITO

**El documento dice TEXTUALMENTE** (sección 1.4):
> "**No está en el alcance**: ejecución de acciones directas sobre el SSI (el chatbot orienta, no ejecuta las solicitudes en nombre del usuario)."

**Lo que está implementado**:
- `ssi-automation.js`: ~420 líneas de código Playwright que abre Chrome, navega a `webapp.inei.gob.pe/ssi`, hace login con captcha matemático, llena el formulario y crea el ticket automáticamente en nombre del usuario.
- Herramienta `create_ssi_ticket` con timeout de 3 minutos, manejo de sesión persistida en `.ssi-session.json`, mapeo de 100+ categorías y 46 sedes.
- E2E test que confirma la creación exitosa (ticket #112781 en última ejecución).
- Endpoint dedicado `POST /api/ticket-ssi` para uso directo sin el chat.

**Evaluación**: Esta funcionalidad supera significativamente el alcance del documento técnico — es un **upgrade de valor real**. Sin embargo, implica riesgos que el documento consideró fuera de alcance: dependencia del portal SSI externo, sesiones con credenciales almacenadas (`.ssi-session.json`, `.env`), potencial de acción errónea en nombre del usuario.

---

### Context Caching de Gemini ✅ MEJORA NO DOCUMENTADA

Implementado en `cache/geminiCache.js`. Cachea el system prompt + tool declarations por 3600s en la API de Google. Reduce costo de tokens en ~30–40% para sesiones largas. No estaba en el documento técnico pero no contradice ningún requisito.

---

### Dashboard de Métricas `/admin` ✅ MEJORA NO DOCUMENTADA

Panel con 11 gráficos: sesiones activas, mensajes totales, tickets SSI creados, documentos generados, distribución de urgencias, etc. Actualización automática cada 60 segundos. Alineado con Fase 5 del plan de implementación del documento ("Informe mensual de métricas del chatbot") pero con implementación más rica.

---

### Rate Limiting por endpoints ✅ MEJORA NO DOCUMENTADA

- Chat: 30 req/min
- Generación de documentos: 10 req/min
- Creación de tickets: 5 req/min

No estaba en el documento pero es una buena práctica de producción.

---

## 4. Criterios de Aceptación (Sección 7 del documento)

El documento define 7 escenarios formales de aceptación. Estado actual:

| N° | Escenario | Estado | Observación |
|---|---|---|---|
| 01 | "no me abre el correo" → Problema de correo + triaje + tipo SSI | 🔲 No probado formalmente | El LLM debería manejarlo; no hay test automatizado |
| 02 | "necesito que me creen mi cuenta" → Pregunta subtipo + Anexo 02 + lista de datos + descarga | 🔲 No probado formalmente | — |
| 03 | "quiero acceso al SIGA módulo de logística" → F-01 + datos + tipo SSI | 🔲 No probado formalmente | F-01 no tiene descarga implementada |
| 04 | "mi impresora hace ruido y sale papel arrugado" → triaje 2 preguntas + 'Impresiones arrugadas' + descripción | 🔲 No probado formalmente | — |
| 05 | "necesito acceso a la base de datos de producción" → PROD-02 + campos + advertencia Director Técnico | 🔲 No probado formalmente | PROD-02 no tiene descarga implementada |
| 06 | 3 consultas sin clasificar → escalar a soporte humano | 🔲 No probado formalmente | Escalamiento es solo textual |
| 07 | Mismo problema, 3 redacciones distintas → mismo tipo SSI | 🔲 No probado formalmente | — |

**Solo existe un E2E test automatizado**: `test-ssi-e2e.js` que prueba la creación de ticket SSI vía Playwright — funcionalidad que el documento considera fuera de alcance. Los 7 escenarios del documento no tienen tests.

---

## 5. Análisis de Arquitectura: Documento vs. Implementación

| Componente en el Documento | Lo que dice el documento | Lo que hay implementado | Brecha |
|---|---|---|---|
| Interfaz Web | Página web accesible desde intranet/SSI | `public/index.html` + `public/chat.js` (SSE vanilla JS) | ✅ Cumple |
| Orquestador de Flujos | "Plataforma de automatización ya desplegada en la OTIN" | Express.js custom en `server.js` | ⚠️ Diferente — se construyó uno propio en vez de usar la plataforma OTIN existente |
| Motor LLM | "Desplegado en infraestructura local de la OTIN" | Gemini 2.5 Flash via Google Cloud API | ❌ Incumplimiento crítico (datos salen a la nube) |
| Base de Conocimiento | Prompts estructurados con catálogo SSI + Anexos | `prompts/system-prompt.md` (481 líneas) | ✅ Cumple — bien estructurado |
| Almacén de Anexos | Repositorio en servidor OTIN, descarga directa | `templates/` (4 de 7 Anexos) + `/api/template/:tipo` | ⚠️ Parcial (faltan 3 Anexos + F-01) |
| Historial SSI | No detallado en el documento | No implementado (el documento no lo desarrolla) | N/A |

---

## 6. Resumen de Brechas por Prioridad

### 🔴 Críticas (bloquean cumplimiento del documento)

| # | Brecha | Dónde | Esfuerzo estimado |
|---|---|---|---|
| C1 | LLM en nube (Google) en vez de infraestructura local OTIN | Toda la integración Gemini | Alto (requiere cambio de LLM) |
| C2 | Automatización SSI ejecuta acciones en nombre del usuario — explícitamente fuera de alcance según el documento | `ssi-automation.js`, `tools/handlers.js` | Decisión de producto |

### 🟡 Medias (limitan funcionalidad prometida)

| # | Brecha | Dónde | Esfuerzo estimado |
|---|---|---|---|
| M1 | ANEXO 05 no existe | `templates/`, `generators.js`, `tools/definitions.js` | Medio |
| M2 | ANEXO 06/PROD-02 sin descarga ni generación | Idem | Medio |
| M3 | ANEXO 07 (Transferencia de info) no existe | Idem | Medio |
| M4 | Formato F-01 (Altas y Bajas) sin descarga | Idem | Medio |
| M5 | Escalamiento solo textual, sin notificación real a técnico | `server.js`, frontend | Medio |
| M6 | RNF-06: Historial se persiste indefinidamente sin consentimiento | `db/queries.js`, `db/migrations/` | Bajo-Medio |

### 🟢 Menores (mejoras de calidad)

| # | Brecha | Dónde | Esfuerzo |
|---|---|---|---|
| L1 | No hay control de horario laboral (RNF-04) | `middleware/` (agregar nuevo) | Bajo |
| L2 | `/admin` y `/api/metrics` sin `internalOnly` activado | `server.js` líneas ~200–220 | Mínimo (descomentar) |
| L3 | Variables de sesión estructuradas no persisten (`categoria_detectada`, `tipo_solicitud_ssi`, etc.) | `db/queries.js`, `server.js` | Bajo |
| L4 | Sin telemetría de latencia (RNF-01 sin medición) | `middleware/` o `server.js` | Bajo |
| L5 | 0 de 7 criterios de aceptación del documento tienen test automatizado | `test-*.js` | Medio |
| L6 | ~20 tipos de solicitud SSI potencialmente no cubiertos en el prompt | `prompts/system-prompt.md` | Bajo |

---

## 7. Lo que Está Bien (Fortalezas de la implementación)

1. **Calidad del system prompt**: 481 líneas bien estructuradas con catálogo SSI, lógica de Anexos, triaje de 4 preguntas, niveles de urgencia P1–P4, y ejemplos de flujo. Supera lo que el documento describe en la sección 5.1.

2. **Generación de documentos pre-completados**: No solo descarga plantillas vacías — los Anexos 01–04 se generan con los datos del usuario prellenados. El documento solo pedía "enlace de descarga".

3. **Persistencia completa**: PostgreSQL con sesiones, mensajes y eventos. El documento no especificaba la tecnología pero sí el requisito de mantener contexto (RF-05). Se cumple y se va más allá con el dashboard de métricas.

4. **Context Caching**: Optimización de costos no documentada pero que mejora el rendimiento real.

5. **SSI automation**: Funcionalidad que supera el documento — crea tickets reales en ~72 segundos, completamente automatizado, con manejo de captcha matemático y mapeo de 100+ categorías.

6. **Seguridad básica**: Rate limiting, restricción por IP de intranet, cookies HTTP-only. No estaba en el documento pero son requerimientos de producción correctos.

---

## 8. Recomendaciones Priorizadas

### Inmediato (sin cambios de arquitectura)

1. **Activar `internalOnly` en `/admin` y `/api/metrics`** — `server.js`, 2 líneas descomentar
2. **Agregar política de retención de datos** — borrar sesiones/mensajes con más de 90 días (`db/queries.js`, cron job)
3. **Agregar PROD-02 a endpoints de descarga** — el archivo ya existe en `Anexos/`, solo falta el route en `server.js`
4. **Agregar Formato F-01 a endpoints de descarga** — archivo `.xlsx` en `Anexos/`, servir como descarga directa

### Corto plazo (1–2 semanas)

5. **Implementar ANEXO 06 y ANEXO 07** — crear plantillas, funciones de generación, y agregar a `tools/definitions.js`
6. **Agregar los 7 escenarios de aceptación del documento como tests automatizados** — `test-aceptacion.js`
7. **Middleware de horario laboral** — respuesta "fuera de horario" con datos de contacto

### Decisión estratégica (requiere discusión con OTIN)

8. **LLM local vs. Gemini en nube**: Si RNF-02 es un requisito real de seguridad institucional, se debe migrar a un modelo local (Ollama + LLaMA 3.1 o Mistral) en la infraestructura de la OTIN. Si Gemini es aceptado como excepción, documentar la decisión.

9. **Automatización SSI**: Decidir si esta funcionalidad (fuera del alcance original) se formaliza como extensión del alcance o se desactiva. Requiere análisis de riesgo (actúa en nombre del usuario con credenciales institucionales).

---

*Fin del análisis — 03 junio 2026*
