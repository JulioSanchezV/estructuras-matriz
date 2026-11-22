# Piloto privado de Estructuras I

El sitio público presenta el encargo, una rúbrica docente versionada y tres ejemplos de resultado. Solo el servidor local de prueba permite adjuntar un archivo ficticio. La entrega institucional permanece bloqueada hasta verificar la actividad, sus destinatarios y permisos. El piloto carece de integración con actas o calificaciones oficiales.

## Probar con Python 3.10 o posterior

Desde la raíz de la copia, ejecute lo siguiente en una máquina privada. El servidor entrega un código local de un uso mediante un archivo 0600 cuya ubicación aparece en la terminal. El acceso vence en diez minutos y la sesión dura treinta minutos. La escucha se limita a 127.0.0.1.

```sh
python3 _piloto/servidor.py autorizar-simulador
python3 _piloto/servidor.py iniciar
```

Abra la dirección local indicada. Para generar los tres documentos ficticios, use `python3 _piloto/fixtures.py /tmp/estructuras-ejemplos`. En otra terminal, `python3 _piloto/servidor.py detener` bloquea nuevas reservas también tras reiniciar. Las reservas ya despachadas pueden terminar.

## Pruebas y capturas

```sh
python3 -m unittest discover -s _piloto -p 'test_*.py' -v
node tests.mjs
node _piloto/browser-test.mjs
```

La última prueba usa Chrome instalado en la máquina. `CHROME_PATH` permite elegir su ejecutable. `ESTRUCTURAS_CAPTURAS` guarda capturas locales a 320, 390 y 1280 píxeles. Comprueba que Vaciar hoja conserva el Banco y escribe la última hoja en la clave de esa variante terminada en `:respaldo`.

## Evidencia, retención y coste

Un único DOCX, XLSX o PPTX basta. Se leen párrafos y tablas de Word, texto y tablas de diapositivas y valores o fórmulas visibles de hojas Excel. El piloto no calcula fórmulas, sigue enlaces, usa OCR ni abre archivos protegidos. Presenta una cita local y una ubicación por indicio. Las discrepancias aritméticas reproducidas se distinguen de la falta de evidencia. La rúbrica docente de noviembre enumera siete criterios. La propuesta formativa del 22 de noviembre distribuye 100 puntos según la dificultad y el trabajo esperado: 14, 17, 22, 14, 16, 7 y 10. La nota provisional expresa el mínimo demostrado sobre el máximo global. Dato cuantificado, desarrollo con operaciones, resultado fundamentado y control reproducido acreditan el 25, 50, 75 y 100 por ciento de cada apartado. El equilibrio en un eje solo acredita los 2 puntos del subcontrol aritmético dentro de los 14 de Resultados. El caso, desplazamientos, reacciones, axiles y contraste se evalúan independientemente. Una suma Excel distribuida en varias celdas con SUM se cita como control tabular no evaluable. El juicio técnico integral requiere revisión docente. Se distinguen los puntos de subcriterios pendientes, el crédito parcial por un indicio cuantificado y las discrepancias reproducidas. La propuesta se identifica por una versión distinta de la rúbrica original. Un eventual esquema oficial requeriría aprobación y su propia versión.

El archivo y sus citas solo pasan por memoria durante la petición. No se registran nombres, archivos, notas, textos, respuestas de proveedor ni identificadores de estudiantes. El resultado queda en la pestaña hasta salir o cerrarla. Una base SQLite privada guarda totales del curso y cuotas del único operador de pruebas. Las reservas retienen el máximo incluso ante fallos ambiguos. Los identificadores de intento de 24 horas y los contadores por día se depuran al reservar. El total acumulado se mantiene hasta el cierre del piloto.

El servidor disponible crea exclusivamente el proveedor simulado. El adaptador OpenAI lleva transporte y lector de secreto inyectados únicamente en servidor. El ejemplo de pruebas usa un transporte local. Para una futura integración hacen falta autenticación institucional, autorización por curso, verificación del tratamiento de datos y del destinatario, un modelo fijo, precios y límites vigentes, presupuesto aprobado en microunidades de dólar y supervisión de cargos. El adaptador prevé solo indicadores técnicos preseleccionados, una salida estructurada y ninguna herramienta. El servidor comprueba cada referencia antes de mostrarla.

Las alertas presupuestarias notifican. El límite duro opcional de OpenAI depende del gasto ya contabilizado y puede aplicarse con demora. Las reservas atómicas de este servicio comprueban antes de cada petición el tope global, el del participante y el número de llamadas. No controlan gastos de otras claves o aplicaciones. [Documentación oficial de límites](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform). El parámetro `store:false` y la retención de registros de abuso son controles distintos. [Controles de datos del proveedor](https://developers.openai.com/api/docs/guides/your-data).
