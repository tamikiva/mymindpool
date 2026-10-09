# My MindPool — PRD y plan de implementación para Claude

Versión 1.0 · 8 de octubre de 2026 · Idioma inicial: español de Argentina.

Este documento reúne requisitos de producto, identidad, funcionamiento, datos, arquitectura propuesta, etapas y criterios de aceptación. No es una aplicación ya construida ni un pull request de código. Su destinatario es Claude como asistente de desarrollo. Debe leerse completo antes de programar.

## 1. Visión y propósito

My MindPool es una aplicación personal para organizar la atención entre las distintas áreas de la vida. Su pantalla principal representa un cerebro humano dividido en piletas con agua de diferentes colores. Cada pileta corresponde a un área elegida por la persona. Cargar tareas aumenta el agua; resolverlas reduce su nivel.

La idea central es ir apagando los incendios cotidianos sin que, por atender uno, las demás áreas queden descuidadas. No se busca productividad máxima ni completar listas interminables: se busca una distribución intencional y manejable de la atención, incluyendo descanso.

Público inicial: personas adultas que quieren una organización visual y sencilla, especialmente personas con TDAH. No solicitar diagnóstico para usarla. No ofrecer diagnóstico, tratamiento ni afirmar que el sistema detecta clínicamente hiperfoco. Los avisos se basan en actividad registrada dentro de la app y en el plan personal.

Ejemplo: una persona completa muchas tareas de Trabajo y esa pileta queda casi vacía, mientras Casa, Salud y Vida social continúan llenas. La app muestra el conjunto y propone una acción pequeña de otra área, respetando las urgencias y decisiones de la persona.

## 2. Decisiones de identidad

| Elemento | Definición |
| --- | --- |
| Nombre elegido | My MindPool |
| Escritura | Mantener siempre el espacio entre My y MindPool |
| Frase de trabajo | Tu vida, en equilibrio. |
| Dominio candidato | mymindpool.com, pendiente de verificar y adquirir |
| Logo aprobado como dirección | Cerebro plano visto de frente, dividido en cuatro piletas de colores con líneas de agua y ondas sencillas |
| Logo y pantalla principal | El logo es plano. El cerebro de la interfaz conserva la dirección visual de piletas con profundidad y agua transparente de los bocetos aprobados |
| Paleta | Lila, celeste, verde agua y rosa pastel; texto ciruela oscuro; fondo claro |

El nombre está elegido creativamente; su disponibilidad en dominios, tiendas y registros no está confirmada. No presentar el dominio como propio, no registrar servicios ni comprarlo sin instrucción expresa.

Usar como referencia los bocetos compartidos y la propuesta de logo. Pedir esos archivos si no están disponibles en el entorno de Claude; no sustituirlos silenciosamente. La imagen del logo es un boceto raster: preparar una versión vectorial fiel para producción, revisar su legibilidad a tamaño pequeño y generar variantes horizontal, símbolo solo, clara, oscura y monocromática. No incluir las etiquetas de áreas dentro del logo: el símbolo representa la marca, mientras las áreas son personalizables.

Tokens iniciales propuestos para implementación, sujetos a ajuste visual con las referencias: fondo #FAF9FC, texto #392747, lila #B7A3EE, celeste #8DC8F5, verde agua #8FD4B7, rosa #F3A2BE, acción primaria #8065C4. Verificar contraste; usar tonos más oscuros para texto y acciones cuando sea necesario. No considerar estos hex como una extracción exacta del boceto. Tipografía sugerida: una sans serif redondeada, legible y con licencia compatible, elegida una sola vez y documentada.

## 3. Alcance y plataformas

Primera entrega: aplicación web responsive con cuenta real, base de datos y persistencia, usable en celular y computadora. Preparada arquitectónicamente para iOS y Android; no confundir web instalable con publicación en App Store.

Primera versión funcional completa: áreas, cerebro interactivo, tareas, planificación diaria, rutinas, metas/topes, registro de tiempo, avisos internos y ajustes. La beta móvil incorpora notificaciones nativas y pruebas en dispositivos antes de tiendas.

Fuera de la primera versión: pagos, suscripciones, colaboración familiar, perfiles infantiles, feed social, integración con calendarios, Apple Health, sensores de sueño, lectura automática del tiempo de otras aplicaciones, bloqueo de aplicaciones, asistentes de voz y chat con IA. No anunciar como funcional ninguna capacidad futura.

No necesita un LLM para funcionar. Las recomendaciones iniciales son deterministas y explicables. La generación de rutinas por lenguaje natural puede agregarse después de validar las plantillas editables.

## 4. Arquitectura propuesta y decisión inicial

Recomendación para una app con futuro móvil: Expo + React Native + TypeScript, usando Expo Router y soporte web, con Supabase para Auth y Postgres. Mantener las reglas de agua, tiempo, recomendaciones y recurrencias independientes de los componentes visuales. Esta es una recomendación de arquitectura, no una tecnología ya implementada o aprobada en un repositorio.

Antes del primer hito, Claude debe confirmar compatibilidad actual, proponer versiones estables y escribir un registro de decisión de arquitectura. Si hay un repositorio existente, inspeccionarlo antes de modificarlo. No instalar simultáneamente Next.js y Expo por costumbre. Si elige una web Next.js con cliente Expo separado, justificar el costo adicional y definir los módulos compartidos y la futura migración. Preferir una sola base de producto para reducir duplicaciones.

Estructura orientativa: src/features para funciones; src/domain para reglas puras; src/data para acceso a datos; src/components para componentes; src/theme para tokens; supabase/migrations para cambios de esquema; docs para PRD, arquitectura, decisiones, validación y estado del proyecto. Fijar dependencias en lockfile y no usar nombres de versiones vagos como latest en la documentación del proyecto final.

Crear servicios de plataforma para autenticación, almacenamiento seguro de sesión, notificaciones y reloj. La aplicación no debe depender de que una pestaña siga abierta para conservar el tiempo. Reutilizar el dominio en web y móvil; no prometer que todo el render del cerebro se comparte automáticamente.

Entornos separados de desarrollo, pruebas y producción. Configuración mediante variables de entorno documentadas. Claves administrativas exclusivamente en servidor; nunca en el bundle. Integración continua con checks apropiados y migraciones versionadas. Desplegar primero en un ambiente de revisión.

## 5. Cuenta, acceso y privacidad desde el inicio

Registro por email y contraseña; confirmación de email; login; recuperación y cambio de contraseña; sesión persistente; cierre de sesión; manejo de enlaces de autenticación en web y, posteriormente, deep links nativos. No perder onboarding al confirmar el email. Un error de acceso debe ser comprensible y permitir reintentar.

Los datos de cada usuario son privados. Toda tabla de datos personales debe tener RLS y políticas para lectura, creación, actualización y eliminación. Validar también que las relaciones entre tablas pertenezcan al mismo usuario; no basta con proteger solo la tabla padre.

Perfil mínimo: nombre o apodo opcional, idioma, zona horaria IANA, preferencias de movimiento y avisos, estado del onboarding. No pedir diagnóstico, fecha de nacimiento, ubicación precisa ni historia clínica.

Ajustes incluyen exportación de datos y eliminación de cuenta. Eliminar cuenta requiere una confirmación clara y autenticación reciente; eliminar datos asociados, sesiones y destinos de notificación mediante un proceso seguro de servidor. No simular éxito si la operación falla. Documentar tratamiento de copias de seguridad y retención real antes de publicar la política.

Política de privacidad y contacto de soporte accesibles. No usar texto privado de tareas en analítica ni logs. Las notificaciones pueden usar contenido genérico por defecto para no exponer tareas en la pantalla bloqueada. El permiso de notificaciones se solicita cuando se explica su utilidad, no al abrir la app por primera vez.

## 6. Onboarding

Flujo breve y retomable:

1. Bienvenida: explicar el cerebro, los pendientes y la distribución de atención.
2. Crear cuenta o entrar a una existente.
3. Elegir áreas: sugerir Casa, Trabajo, Salud y Vida social, todas editables.
4. Elegir nombre, color y orden de cada área.
5. Elegir metas y topes opcionales, con posibilidad de saltar y configurar luego.
6. Cargar una primera tarea o elegir una rutina sugerida.
7. Mostrar el cerebro personal y ofrecer planificar el día.

Nunca rellenar una cuenta nueva con tareas ficticias. Si hay un modo demo, sus datos deben estar claramente separados de la cuenta real. El onboarding no puede duplicar áreas al refrescar o reintentar.

## 7. Áreas personalizables y cerebro

Permitir entre 2 y 8 áreas activas, con cuatro por defecto. Ese rango es una propuesta de alcance para evitar sectores ilegibles. Los modelos visuales deben soportar realmente cada cantidad permitida; si no, resolverlo antes de anunciar la función. Los nombres deben admitir al menos 40 caracteres, con ajuste visual y una etiqueta accesible completa.

Crear, renombrar, cambiar color, reordenar y archivar áreas. No borrar silenciosamente tareas ni historial al archivar. Ofrecer mover pendientes a otra área; impedir archivar la seleccionada en un temporizador activo hasta resolver la sesión.

Cerebro visual: una sola silueta reconocible, paredes claras redondeadas y sectores separados, agua translúcida a distintas alturas, reflejos y ondas discretas. Los nombres deben aparecer EN EL FONDO DE LAS PILETAS, visibles a través del agua, tal como pidió la usuaria. Deben cambiar al renombrar el área, ser legibles en cualquier nivel y no quedar ocultos por ondas, reflejos o paredes.

El cerebro no puede ser una imagen fija con números encima: cada sector debe responder a datos y permitir selección. Se permite un render 2.5D con vectores y capas si reproduce la referencia y hace visible el cambio de profundidad. Una representación 3D real es alternativa si el rendimiento lo permite. Hacer un ensayo técnico de cuatro piletas con niveles dinámicos antes de extender el motor a ocho. Preparar vista simplificada accesible y de bajo rendimiento.

Tocar una pileta abre su área y tareas. Completar produce una transición suave del nivel y una onda breve. Sin movimiento continuo agresivo ni destellos; respetar reducción de movimiento y permitir desactivar animaciones. El color nunca es la única señal. Vista alternativa de lista con nombre, carga y atención.

## 8. Qué significa el agua: reglas concretas

El agua representa CARGA PENDIENTE, no tiempo invertido, emociones ni un diagnóstico. Que todas las piletas estén vacías porque se terminó lo previsto es un resultado válido: mostrar descanso, no generar obligaciones.

Una pileta vacía frente a otras llenas puede indicar concentración desigual, pero no prueba descuido por sí sola. Evaluar junto al plan diario, el tiempo registrado, urgencias y áreas voluntariamente pausadas. Un área sin tareas puede haber recibido atención real.

Modelo inicial propuesto:

- Cada tarea abierta tiene peso pequeño=1, mediano=2 o grande=3. Valor predeterminado: 1, editable. No obligar a estimar todo al crear una tarea.
- Por área hay una capacidad fija configurable: valor inicial 8 puntos. Explicar como carga manejable, no capacidad clínica ni porcentaje de cumplimiento.
- carga pendiente = suma de pesos elegibles del área.
- nivel = clamp(carga pendiente / capacidad, 0, 1).
- Mostrar excedente por separado si supera capacidad: por ejemplo «3 puntos por encima de tu referencia». El agua no tapa el texto ni desborda fuera de pantalla.

La capacidad no crece automáticamente al agregar tareas: eso ocultaría sobrecarga. Los distintos tamaños de sector no cambian el porcentaje de carga. No comparar volúmenes físicos para inferir equilibrio.

Elegibilidad: incluir tareas activas sin fecha futura, programadas para hoy o antes, vencidas y ocurrencias de rutinas activas para hoy. Excluir completadas, canceladas, archivadas, lista «Más adelante» y futuras. Mostrar el alcance «Pendientes actuales» y permitir consultar todas las tareas aparte. No subir el agua por cada minuto transcurrido sin una tarea nueva.

Completar resta exactamente su peso una sola vez. Deshacer repone ese peso. Eliminar o cancelar libera carga sin atribuirlo a una tarea realizada. Empezar un temporizador no completa ni baja el agua. El nivel se deriva del estado de datos: no guardar un contador acumulativo propenso a duplicarse.

Orientaciones iniciales de carga: baja por debajo de 25%, manejable entre 25% y 70%, alta por encima de 70%. Son umbrales de interfaz ajustables. No afirmar que tener 25%-70% de pendientes es una meta universal. Un cero es válido; el producto busca atención suficiente y carga manejable, no mantener tareas sin terminar para llenar una pileta.

## 9. Tareas

Crear rápidamente con título y área. Opcionales: nota, fecha, hora, duración estimada, peso, prioridad y repetición. Prioridades: normal, importante y urgente, sin transformar todo en urgente por defecto. Una tarea pertenece a una sola área principal en V1; una rutina puede tener pasos en distintas áreas.

Estados: pendiente, en curso, completada, cancelada y archivada. Posponer cambia programación; no equivale a completar. Editar, mover de área, completar, deshacer y eliminar con comportamiento consistente. Confirmación o deshacer para operaciones destructivas según impacto.

Una tarea de duración cero o sin estimación puede completarse. No sumar automáticamente su tiempo estimado a las horas reales. Las repeticiones generan ocurrencias con identidad propia: completar una no completa la plantilla ni las futuras.

Filtros por área, hoy, vencidas, futuras, estado y búsqueda. Las completadas tienen una vista específica, no un enlace que lleva a pendientes generales. Estados vacíos ofrecen una acción clara. Mantener una entrada rápida siempre accesible.

## 10. Planificación del día por áreas

La planificación es una elección de atención, además de una lista de tareas. Pregunta inicial: «¿Qué áreas querés atender hoy?». Permitir elegir áreas, tiempo previsto y momentos aproximados. No exigir atender todas diariamente; algunas metas son semanales y hay días excepcionales.

Elegir tareas y rutinas dentro de esas áreas. Separar horas obligatorias, descanso y actividades flexibles. Mostrar carga temporal total y avisar si el plan excede el tiempo disponible declarado, con opción de ajustar. No bloquear un plan imperfecto.

Ejemplo: Trabajo de mañana; Casa al almuerzo; Salud por la tarde; Vida social por la noche. Las etiquetas de momento se pueden usar sin una hora exacta. Para hábitos opcionalmente precisar cuándo, dónde y después de qué acción se harán.

Plan editable durante el día; no mantener avisos basados en planes reemplazados. Cierre diario opcional: qué se atendió, qué queda y qué conviene pasar a mañana. Transferir solo seleccionadas; no duplicar pendientes al cambiar el día. Descanso puede ser actividad registrable o área si la persona lo elige.

## 11. Rutinas, secuencias y primer paso estable

Una rutina es una secuencia finita, editable y reutilizable. Campos: nombre, área predeterminada, acción inicial o señal, versión corta, pasos ordenados y frecuencia opcional. Los pasos tienen título, área, peso y duración opcionales.

Ejemplo: «Limpiar la casa» empieza siempre con «Sacar el canasto de limpieza y dejarlo en la cocina», luego juntar basura, recoger objetos, lavar platos, limpiar superficies, barrer y guardar elementos. La persona puede elegir otra acción inicial; no imponer una universal.

Otro ejemplo: preparar almuerzo → almorzar → lavar platos → limpiar mesada. Conectar tareas mediante «Después de X, hago Y». Permitir cruzar áreas: cerrar computadora → ponerse zapatillas → caminar.

Ejecución muestra un paso actual y acceso opcional a la secuencia completa. Completar revela el siguiente; permitir pausar, retomar, saltar o cancelar. Saltar no cuenta como completar. Nada se completa automáticamente por el avance del temporizador.

La carga de la rutina es la suma de sus pasos abiertos. No contar también una tarea padre. Si una tarea se convierte en rutina, reemplazar su contribución por pasos en una operación consistente. Evitar multiplicar una tarea pequeña en cien subpasos para aparentar carga o productividad.

Al ejecutar, crear una instancia con copia de los pasos y pesos. Cambiar la plantilla afecta instancias futuras, no reescribe el historial ni una ejecución en curso. La versión corta conserva la misma acción inicial y usa menos pasos. Seleccionar la versión antes de empezar, y no penalizar por elegirla.

Al terminar, mostrar cierre y regreso al cerebro. No agregar nuevas tareas ni encadenar otra rutina sin elección explícita. Las recomendaciones de cambiar de área se muestran preferentemente entre pasos o al cerrar, evitando interrumpir acciones que requieren atención inmediata.

V1: plantillas locales editables y creación manual. Al escribir «limpiar la casa», ofrecer la plantilla, no fingir comprensión por IA. Una futura generación asistida deberá permitir revisar antes de guardar, establecer límites y proteger datos.

## 12. Metas, objetivos y topes de tiempo

Tipos: mínimo, objetivo, rango y máximo. Períodos: día o semana. Campos: actividad, área principal, valor en minutos, período, días aplicables, recordatorios y estado. Valores elegidos por el usuario; ejemplos no son recomendaciones de salud.

| Actividad | Ejemplo | Tipo |
| --- | --- | --- |
| Sueño | 8 horas por noche | Objetivo |
| Trabajo | Hasta 8 horas al día | Máximo |
| Ejercicio | 90 minutos semanales | Mínimo |
| Tecnología por ocio | Hasta 60 minutos diarios | Máximo |
| Vida social | 60 minutos semanales | Objetivo |
| Descanso | 30 minutos diarios | Objetivo |

Separar tecnología de ocio y trabajo para no mezclar ambas. Una sesión tiene un área principal y etiquetas de actividad; puede contribuir a metas aplicables, pero el total del día no suma dos veces el mismo intervalo.

La meta no agrega una tarea por cada minuto faltante. Puede vincularse a una acción planificada, por ejemplo caminar. Su progreso aparece como indicador independiente junto a la pileta: «Trabajo 6 de 8 h». El agua conserva su significado de pendientes.

Mínimo alcanzado: celebrar de manera discreta. Máximo alcanzado: proponer parar, extender o cambiar de actividad. Objetivo incompleto: invitar a ajustar o hacer una versión pequeña. Sin sanciones, rachas punitivas ni lenguaje de culpa.

Cambio de período reinicia la vista de progreso conservando registros históricos. No acumular automáticamente deuda infinita de ejercicio. Pendientes reales permanecen; metas periódicas se recalculan. Semana comienza el lunes por defecto, configurable.

Sueño: registro manual de inicio y final, admite cruzar medianoche y edición. Asociar la noche a la fecha local de despertar; explicarlo. No fingir detección de sueño ni integración con reloj.

## 13. Temporizador y registro de actividad

Iniciar, pausar, reanudar, terminar y corregir una sesión. Mostrar tiempo transcurrido y, si hay objetivo, restante. Permitir registrar actividad sin tarea, porque hablar con una amiga o descansar también es atención.

Un solo temporizador activo por usuario entre dispositivos. Guardar timestamps y segmentos de pausa en servidor; reconstruir al volver, no incrementar un contador solamente en memoria. El tiempo sigue durante segundo plano si la sesión está activa; al volver tras un período largo preguntar si siguió con esa actividad y permitir corregir antes de basar nuevos avisos en ella.

No asumir tiempo real a partir de tareas completas. Sin temporizador ni registro, la app solo puede comentar la concentración de tareas marcadas, no afirmar minutos de hiperfoco. Mostrar calidad/origen del registro: temporizador, manual o corregido.

Prevenir sesiones negativas, duplicadas o solapadas. Cuando una edición se solapa con otra, resolver con el usuario o rechazar explicando; no inflar horas. Convertir fechas por zona horaria y calcular duración con timestamps, incluidos cambios de horario. Mantener una zona estable para períodos históricos y documentar cómo cambios de zona afectan registros nuevos.

## 14. Avisos de concentración y equilibrio

Nombre funcional: avisos de foco y equilibrio. El texto puede preguntar «¿Estás entrando en hiperfoco?»; nunca declarar «Detectamos hiperfoco» como certeza clínica.

Condiciones iniciales propuestas, ajustables por usuario:

1. Una sesión continua alcanza 60 minutos en la misma área, otra área prevista para hoy no fue atendida y hay carga pendiente o una meta planificada allí.
2. Se alcanza el tope personal de una actividad.
3. Se completan al menos cuatro tareas consecutivas en la misma área, mientras otra área prevista tiene carga alta y no recibió atención registrada. Esto produce una sugerencia basada en tareas, sin afirmar tiempo invertido.

No disparar por abrir pantallas, mover tareas o reintentar una escritura. No avisar desequilibrio solo por una pileta vacía. No interrumpir descanso, sesiones pausadas ni franjas silenciosas. Una urgencia puede justificar concentración prolongada.

Ejemplo: «Llevás 60 minutos en Trabajo. Hoy también habías elegido Salud. ¿Hacemos una pausa y miramos tus otras áreas?». Con opciones «Cambiar de área», «Seguir 20 minutos», «Hoy necesito priorizar esto» y ajuste de frecuencia.

Los números iniciales son heurísticas de producto para probar, no umbrales médicos ni requisitos del libro. Configuración permite desactivar avisos, elegir tiempos y declarar excepción por hoy. Una excepción no borra pendientes ni modifica historial.

Límite inicial: máximo una sugerencia de equilibrio por hora y tres por día; un mismo tope se notifica una vez por período, salvo extensión explícita que crea un nuevo umbral. Registrar evento y deduplicar entre dispositivos y canales. No entregar al volver una cola de avisos obsoletos. Al terminar o editar una sesión, reevaluar y cancelar recordatorios pendientes.

Recomendación de siguiente tarea: primero urgencias relevantes, luego áreas elegidas hoy sin atención, luego carga y metas pendientes; preferir un paso breve que quepa en el tiempo disponible. Mostrar motivo. Permitir rechazar la recomendación sin cambiar datos.

V1 web: avisos internos mientras se usa la app; no prometer alertas con la web cerrada. Fase móvil: notificaciones locales para temporizadores y topes; push para recordatorios sincronizados cuando proceda. Implementar permisos, franjas silenciosas, cancelación, deduplicación y límites propios de la plataforma. No afirmar que se puede observar automáticamente otra app o bloquearla.

## 15. Pantallas y navegación

| Pantalla | Contenido y acciones |
| --- | --- |
| Bienvenida | Propuesta, acceso y explicación breve |
| Registro y login | Flujos reales de autenticación y recuperación |
| Onboarding | Áreas, metas opcionales y primera tarea |
| Mi equilibrio | Cerebro, nombres en fondos, carga, atención, próximo paso, entrada rápida |
| Mi día | Áreas elegidas, bloques, tareas y rutinas del día |
| Área | Pendientes, progreso temporal, inicio de sesión y edición |
| Tareas | Filtros, futuras, vencidas y completadas |
| Crear/editar tarea | Formulario breve y detalles opcionales |
| Rutinas | Plantillas, secuencias, versión corta y frecuencia |
| Rutina activa | Paso actual, progreso, pausa y secuencia completa opcional |
| Metas y topes | Configuración y progreso diario/semanal |
| Historial | Atención por área y tiempo, sin juicio ni puntaje clínico |
| Ajustes | Cuenta, áreas, avisos, accesibilidad, privacidad y exportación |

Celular: navegación inferior Equilibrio, Mi día y Tareas; rutinas, metas y ajustes desde accesos claros. Computadora: navegación superior/lateral con los mismos destinos. Mantener identidad de rutas y no duplicar estado de sesión por pantalla.

Cada pantalla contempla carga, error, vacío, éxito y falta de conexión. Al guardar, conservar datos escritos si falla. Evitar enlaces sin destino, botones decorativos y funciones simuladas.

## 16. Datos y relaciones orientativas

Todas las entidades personales usan identificador UUID, user_id, timestamps y validación. Los nombres de tablas son propuesta; pueden adaptarse con justificación preservando las relaciones.

| Entidad | Contenido principal |
| --- | --- |
| profiles | Preferencias, zona horaria, idioma y onboarding |
| areas | Nombre, color, orden, capacidad y archivo |
| tasks | Área, estado, peso, fecha, estimación y prioridad |
| recurrence_rules | Frecuencia, zona, fecha de inicio y fin opcional |
| task_occurrences | Instancias de tareas repetidas con fecha y estado propios |
| routine_templates | Nombre, señal inicial, versiones y recurrencia |
| routine_template_steps | Orden, área y atributos del paso |
| routine_runs | Ejecución, versión usada, estado y fecha |
| routine_run_steps | Copia de pasos, pesos y estados para esa ejecución |
| day_plans | Fecha local, disponibilidad y revisión del plan |
| day_plan_areas | Áreas previstas y minutos/momentos planificados |
| day_plan_items | Tareas, ocurrencias o rutinas elegidas para el día |
| goals | Actividad, área, tipo, valor/rango y período |
| activity_sessions | Área, actividad, tarea opcional, timestamps y origen |
| session_segments | Tramos activos y pausas para duración real |
| notification_preferences | Permisos, límites y franjas silenciosas |
| notification_events | Regla, período, motivo, deduplicación y resolución |
| device_endpoints | Destinos de notificaciones para fase móvil |

Prohibir referencias cruzadas entre usuarios incluso si un cliente manipula UUID. Definir claves únicas para ocurrencia por plantilla/fecha, onboarding por usuario y avisos por regla/período/versión. Una rutina y sus pasos deben guardarse atómicamente. No usar JSON gigante como sustituto de todas las relaciones.

La carga se obtiene de tareas y pasos abiertos; el tiempo, de segmentos reales. Una vista o función de dominio entrega el resumen del cerebro. No almacenar niveles independientes sin mecanismo de coherencia. Las transacciones de completar/deshacer tienen identidad para evitar doble aplicación.

## 17. Sincronización, conexión e historial

Persistencia de servidor desde el primer hito. La sesión puede persistir localmente según plataforma; los datos no dependen únicamente de localStorage.

V1: si no hay conexión, mostrar datos cacheados disponibles y aviso claro. No anunciar una escritura como sincronizada si no lo está. Conservar borradores. Ediciones sin conexión completas y cola sincronizable quedan para una fase posterior; no construirlas a medias.

Usar versión o updated_at para detectar conflictos relevantes entre dispositivos. Una tarea completada en dos dispositivos no duplica actividad, tiempo ni bajas de agua. Si un dispositivo intenta reabrir una versión antigua, refrescar y ofrecer acción explícita.

El historial conserva hechos, no diagnósticos. «Sin registro» es distinto de «No atendiste esta área». Exportación JSON completa y CSV de tareas/sesiones. Los cambios de nombre de área no deben quebrar relaciones; conservar referencias históricas de plantillas ejecutadas.

## 18. Accesibilidad, tono y rendimiento

Lenguaje cálido y concreto, español rioplatense consistente: «Elegí», «Mirá», «¿Le damos un ratito?». Evitar «Fallaste», «Abandonaste tu salud» o «Estás haciendo todo mal». No exigir equilibrio exacto ni la misma dedicación a todas las áreas.

Botones con etiquetas claras, foco visible, navegación con teclado en web, soporte de lector de pantalla, escalado tipográfico y objetivos táctiles cómodos. Probar nombres largos y zoom. Vista de lista accesible equivalente al cerebro, sin depender de gesto o color.

Render líquido suave y económico. Reducir o detener animación cuando el componente no es visible. Usar recursos optimizados y carga progresiva; evitar depender de un modelo 3D remoto enorme. Probar celulares de gama media y Safari iOS antes de decidir que el render final cumple.

## 19. Relación con Hábitos atómicos

Inspiraciones verificadas en publicaciones del autor: intenciones de implementación (definir cuándo y dónde actuar), encadenamiento de hábitos (una conducta existente como señal de otra), primer paso pequeño mediante regla de dos minutos y cuatro principios de formación de hábitos.

La planificación por áreas, el cerebro con agua, las fórmulas de carga y los avisos de equilibrio son decisiones propias de My MindPool; no atribuirlas al libro. No copiar capítulos ni presentar la app como oficial o asociada a James Clear. Los ejemplos de rutinas de este PRD son adaptaciones para el producto.

Referencias para el equipo:

- https://jamesclear.com/implementation-intentions
- https://jamesclear.com/habit-stacking
- https://jamesclear.com/how-to-stop-procrastinating
- https://jamesclear.com/atomic-habits-summary

## 20. Etapas y entregables

### Hito 0 — Base y decisiones

Leer PRD; revisar repositorio si existe; registrar arquitectura y versiones; consolidar identidad y assets; crear modelo de datos y contratos de dominio; ensayo del cerebro con niveles variables y etiquetas en fondos; documentar servicios pendientes y variables. No usar datos personales reales en ejemplos.

### Hito 1 — Acceso real y datos privados

Implementar registro, confirmación, login, recuperación, sesión, perfiles, onboarding y áreas persistidas. Migraciones y RLS con pruebas entre usuarios. Entregar ambiente revisable. Exportación/eliminación puede completarse en hito 6, pero su esquema y contratos se diseñan aquí.

### Hito 2 — Tareas y cerebro dinámico

CRUD, filtros, completadas, pesos/capacidad, reglas de carga, deshacer, sectores interactivos, etiquetas y animación. Comprobar persistencia al refrescar y ausencia de duplicaciones.

### Hito 3 — Día y rutinas

Planificación por áreas, momentos y tareas. Plantillas, primer paso estable, instancias, versión corta, pausas y cierre definido. Recurrencias sin doble conteo ni duplicaciones de día.

### Hito 4 — Tiempo y metas

Sesiones, pausas, registro manual, sueño nocturno, objetivos/rangos/topes y períodos locales. Reconstrucción tras cerrar y coordinación entre dispositivos.

### Hito 5 — Equilibrio y avisos

Reglas explicables, próxima tarea, excepciones, silencios, deduplicación y preferencias. Primero avisos internos; no presentar push como listo si no está implementado.

### Hito 6 — Beta web completa

Historial, exportación, eliminación, privacidad, accesibilidad, estados de error y revisión visual. Publicar beta de revisión y corregir fallos observados. No sustituir implementación por una demo con datos hardcodeados.

### Hito 7 — Beta móvil y tiendas

Builds iOS/Android, enlaces de Auth, notificaciones, permisos y comportamiento en segundo plano. TestFlight y pruebas reales. Identificadores de app, assets de icono/splash, capturas, soporte y declaraciones de datos. Revisar requisitos vigentes de las tiendas al presentar. El desarrollador necesita sus propias cuentas y configuración de publicación.

En cada hito: cambios concretos, migraciones, instrucciones necesarias, checks pertinentes, limitaciones y siguiente etapa. Crear commits pequeños y no mezclar rediseños no solicitados. No afirmar «listo» con errores conocidos en el recorrido principal.

## 21. Criterios de aceptación y pruebas de comportamiento

| Caso | Resultado esperado |
| --- | --- |
| Usuario A modifica UUID para apuntar a datos de B | No puede leer ni escribir; RLS y relaciones protegen los datos |
| Onboarding se refresca o reintenta | Una sola configuración por usuario, sin áreas duplicadas |
| Peso 2 en área con capacidad 8 | Agrega 25 puntos porcentuales al nivel elegible |
| Completar y repetir la solicitud | Resta solo una vez; no crea tiempo ficticio |
| Deshacer tarea | Restituye carga y estado, sin duplicar historial |
| Todas las tareas están completas | Agua vacía válida y mensaje de descanso |
| Trabajo vacío, Salud alta y planificada sin atención | Puede sugerir Salud con motivo verificable |
| Trabajo vacío pero otras áreas no fueron previstas hoy | No declara descuido automáticamente |
| Área sin datos temporales | Muestra «Sin registro», no cero probado de atención |
| Tarea para la semana próxima | No llena «Pendientes actuales» antes de su fecha |
| Rutina de cuatro pasos de peso 1 | Carga 4, no 5 por contar el padre |
| Plantilla se edita con ejecución iniciada | La ejecución conserva su copia y el historial no cambia |
| Paso se salta | No cuenta como completado; la secuencia puede avanzar |
| Temporizador se pausa | Los minutos de pausa no suman a actividad |
| App se cierra con sesión activa | Al volver reconstruye el tiempo y permite corregir |
| Dos dispositivos inician temporizador | Se mantiene uno activo y se resuelve el conflicto |
| Registro de sueño cruza medianoche | Duración correcta y asignación al día de despertar |
| Meta semanal cambia de período | Conserva historial, reinicia progreso y no arrastra deuda infinita |
| Se alcanza un tope ya notificado | No repite avisos por refrescar |
| Excepción «Priorizar Trabajo hoy» | Suspende sugerencias de equilibrio correspondientes sin borrar datos |
| No hay permiso de notificaciones | La app funciona y no afirma que enviará push |
| Nombre de área cambia | Cambia el texto del fondo de la pileta y las vistas relacionadas |
| Animación reducida | Cerebro sigue usable y los niveles son comprensibles |
| Sin conexión durante escritura | No simula éxito; conserva entrada y ofrece reintento |
| Eliminar cuenta falla | Informa error, no declara eliminación completada |

Pruebas unitarias para reglas de carga/tiempo/avisos; integración para RLS, ocurrencias e idempotencia; recorridos funcionales para registro, tarea, rutina, plan y eliminación. Verificación visual en celular y computadora; lector de pantalla, teclado y reducción de movimiento. No escribir pruebas que solo repliquen los componentes sin comprobar comportamiento.

## 22. Métricas para validar el producto

Medir con consentimiento y datos mínimos: finalización del onboarding, creación de primer plan, áreas previstas frente a atención registrada, rutinas iniciadas/finalizadas, sugerencias aceptadas/pospuestas y valoración opcional de utilidad. No usar cantidad de tareas completas como único indicador de éxito.

No enviar títulos de tareas, notas, horarios privados ni nombres personales al proveedor de analítica. Mostrar una pregunta opcional: «¿Te ayudó a acordarte de otra área?». Validar si el agua resulta comprensible y si los avisos ayudan o interrumpen. Ajustar umbrales a partir de pruebas, no declarar eficacia médica.

## 23. Preparación de App Store y documentación oficial

Tener cuenta y eliminación dentro del producto desde el diseño. Preparar identidad de aplicación estable, condiciones y política coherentes con los datos realmente recogidos. Un sitio dentro de un contenedor no garantiza aprobación; entregar una experiencia móvil funcional y probarla.

Si se agregan proveedores externos de login, revisar las reglas de Apple aplicables en ese momento. Si se agregan pagos, diseñar esa etapa según las reglas de las tiendas; pagos no están incluidos ahora. Probar enlaces de acceso y recuperación en builds reales, no solamente en navegador.

Referencias técnicas consultadas para esta propuesta, que deben revisarse al implementar:

- Expo monorepos: https://docs.expo.dev/guides/monorepos/
- Expo builds: https://docs.expo.dev/build-reference/build-with-monorepos/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase perfiles: https://supabase.com/docs/guides/auth/managing-user-data
- Apple eliminación: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple revisión: https://developer.apple.com/app-store/review/

## 24. Instrucción inicial lista para pegar en Claude

> Vamos a construir My MindPool. Leé este PRD completo y tratá las decisiones de producto como la referencia central. Es una app real con login, datos privados y persistencia desde la primera versión, con una arquitectura pensada para web y una futura publicación móvil. No hagas solo una landing o un dashboard con datos ficticios.
>
> Primero inspeccioná el entorno y el repositorio si existe. Proponé una arquitectura concreta, versiones compatibles y estructura de datos; registrá las decisiones. Usá Expo/React Native/TypeScript y Supabase como propuesta inicial, salvo que encuentres una razón concreta para otra solución. No cambies el stack ni el modelo de producto sin explicar el impacto.
>
> La pantalla principal es un cerebro dividido en piletas de agua transparente, con áreas personalizables y nombres escritos en sus fondos. El logo es plano y frontal; la interfaz sigue los bocetos con profundidad. Las tareas suben y bajan el agua; metas y tiempo son indicadores separados. Las sugerencias de equilibrio respetan el plan, las urgencias y las excepciones. No diagnostican hiperfoco. Las rutinas son finitas, editables, empiezan con una señal estable y muestran un paso a la vez.
>
> Trabajá por los hitos definidos. Para arrancar entregá las decisiones y el ensayo técnico del cerebro del hito 0, y luego implementá acceso y datos privados del hito 1. Avanzá sin preguntar por detalles rutinarios ya resueltos en el documento. Preguntá solo por decisiones que cambien materialmente alcance, servicios con costo, credenciales faltantes o arquitectura. No improvises capacidades futuras ni anuncies integraciones inexistentes.
>
> Actualizá docs/STATUS.md y docs/DECISIONS.md al cerrar cada hito, con lo completado, limitaciones reales y siguiente paso. Probá los comportamientos de aceptación pertinentes antes de darlo por terminado. Conservá el nombre My MindPool, el diseño elegido y los requisitos; proponé cualquier cambio importante antes de hacerlo.

## 25. Decisiones aún pendientes, sin bloquear el diseño

Verificar dominio y nombre antes de invertir en publicación; preparar logo vectorial fiel; elegir tipografía definitiva; confirmar proveedor y cuentas de despliegue; aprobar el ensayo visual del cerebro; validar umbrales con usuarios; redactar política real antes del lanzamiento. Los pesos, capacidades, rango 2–8, tiempos y límites de avisos de este PRD son valores iniciales propuestos, no preferencias ya expresadas por la usuaria.

La base funcional y el diseño ya tienen una dirección clara. Estos pendientes deben cerrarse en su etapa correspondiente sin sustituir el trabajo autorizado por rondas interminables de preguntas.
