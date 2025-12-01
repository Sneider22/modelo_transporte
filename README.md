# Proyecto: Visualizador y Heurística CVRP (Farmatodo - Simulación)

Este repositorio contiene una pequeña herramienta educativa para explorar y comparar una heurística CVRP (Capacitated Vehicle Routing Problem) en dos entornos:

- `index.html` + `main.js` + `styles.css`: interfaz web (cliente-side) que permite editar depósitos y clientes, ejecutar una heurística greedy multi-depot y visualizar rutas en canvas.
- `ejercicio.py`: script Python que implementa la misma heurística greedy que la web (no un solver exacto) para garantizar paridad resultado-web/python y generar `resultado_rutas.txt`.

Resumen importante:
- Cada almacén (depot) tiene siempre 1 vehículo por defecto (regla de negocio).
- La instancia por defecto incluye 3 depósitos y 5 clientes (distribución pensada para producir 3 clientes asignados a un almacén y 2 a otro).
- `ejercicio.py` y `main.js` usan la misma función de distancia (Haversine) y la misma lógica greedy: asignación al depósito más cercano y greedy nearest-customer por depósito con un vehículo.

Contenido del repositorio
- `ejercicio.py` — implementación Python del heurístico greedy (demanda mínima por cliente = 200 kg, capacidad por vehículo = 22000 kg por defecto). Genera `resultado_rutas.txt`.
- `index.html`, `main.js`, `styles.css` — interfaz web interactiva con edición de nodos, export/import JSON, y visualización responsiva para móvil.
- `resultado_rutas.txt` — salida textual generada por `ejercicio.py`.

- En la web: pulsar `Recalcular Rutas`, luego copiar el JSON de la caja `Importar/Exportar JSON` y guardarlo como `data.json` en la carpeta del proyecto.
- En la terminal: ejecutar `python ejercicio.py` — el script cargará `data.json` si existe y reproducirá la misma asignación/orden que la web.

Heurística (web y Python)

La heurística ejecutada por la web y por `ejercicio.py` es la misma y sigue estas reglas (implementación en `recomputeGreedyFromData` y en `ejercicio.py`):

- Paso A — Asignación a depósito: cada cliente se asigna al almacén más cercano (distancia Haversine).
- Paso B — Para cada depósito, se construye una ruta con UN vehículo (regla del negocio):
  - Empezar en el depósito.
  - Mientras haya clientes asignados a ese depósito sin servir y la capacidad del vehículo lo permita:
    - Seleccionar el cliente no servido más cercano al nodo actual que quepa en la capacidad restante.
    - Añadirlo a la ruta y marcarlo como servido.
  - Volver al depósito cuando no queden clientes servibles.

Esta igualdad de reglas permite comparar visualmente en la web con la salida textual del script Python.

Paridad verificada

- Por defecto el proyecto viene con 3 depósitos y 5 clientes. En esta versión los **depósitos y clientes están ubicados en un área compacta** (los almacenes están más próximos entre sí) para mejorar la visualización en el mapa y evitar que los puntos queden muy dispersos. Ambos entornos (web y Python) comparten las mismas coordenadas y parámetros por defecto.
- Para verificar: en la web pulse `Recalcular Rutas`, exporte `data.json` y luego ejecute `python ejercicio.py` en la misma carpeta; la secuencia de nodos y la carga por vehículo deben coincidir entre ambos.

---

Matemáticas y fórmulas (literal)

1) Distancia (Haversine) — usamos la fórmula de Haversine para convertir lat/lon a distancia en kilómetros sobre la esfera terrestre:

Sea lat1, lon1 y lat2, lon2 en radianes. Definimos:

	dlat = lat2 - lat1
	dlon = lon2 - lon1
	a = sin(dlat/2)^2 + cos(lat1) * cos(lat2) * sin(dlon/2)^2
	c = 2 * asin( sqrt(a) )
	dist = R * c

Donde R = 6371 km (radio medio de la Tierra). En código (JavaScript/Python):

	function haversine(a,b){
		const toRad = v => v * Math.PI/180;
		const lat1 = toRad(a[0]), lon1 = toRad(a[1]);
		const lat2 = toRad(b[0]), lon2 = toRad(b[1]);
		const dlat = lat2 - lat1, dlon = lon2 - lon1;
		const hav = Math.sin(dlat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
		return 2 * 6371 * Math.asin(Math.sqrt(hav));
	}

2) Formulación CVRP (modelo usado en `ejercicio.py` — resumen y constraints MTZ)

Índices: i,j ∈ N (nodos, incluye depot 0 y clientes 1..n)

Parámetros:
- d_{ij} distancia entre i y j (haversine)
- q_i demanda del cliente i (q_0 = 0)
- Q capacidad del vehículo
- V número de vehículos disponibles

Variables:
- x_{i,j} ∈ {0,1}  (1 si arco i→j es usado)
- u_i continuous (auxiliar MTZ, carga acumulada o orden)

Función objetivo (minimizar distancia total):

	min ∑_{i} ∑_{j} d_{ij} * x_{i,j}

# Optimización de Rutas — Enfoque matemático y lógica del modelo

Este documento describe la formulación matemática y la lógica del modelo usado en este proyecto. El objetivo es explicar con fórmulas la función objetivo, las restricciones y las decisiones de diseño del modelo (más que la implementación del código).

**Propósito**: presentar la notación, la formulación del problema (CVRP multi-depot simplificado), las fórmulas clave (distancia Haversine y modelado MIP/MTZ) y la lógica heurística empleada para instancias grandes o interactivas.

**Archivos del repositorio (referencia rápida)**
- `ejercicio.py`: implementación Python del modelo (referencia para quien desee el solver).
- `index.html`, `main.js`, `styles.css`: interfaz y heurística cliente-side (visualización y prototipado).
- `resultado_rutas.txt`: salida sample generada por el script.

**1. Notación y conjuntos**
- N: conjunto de nodos, con índice 0 reservado para el/de los depósitos (depots) y 1..n para clientes.
- D ⊆ N: índices de depósitos.
- C ⊆ N: índices de clientes (N = D ∪ C).

Parámetros:
- $d_{ij}$: distancia (km) entre nodo $i$ y nodo $j$ (usamos Haversine para coordenadas geográficas).
- $q_i$: demanda del cliente $i$ ($q_0 = 0$ para depósitos).
- $Q$: capacidad del vehículo (kg).
- $V_d$: número de vehículos disponibles en depot $d$ (puede ser 1 por depot en la regla de negocio actual).

Variables de decisión:
- $x_{ij} \in \{0,1\}$, para todo $i,j \in N$, donde $x_{ij}=1$ si el arco (i→j) es recorrido por algún vehículo.
- $u_i \ge 0$ (continuo), variable auxiliar usada por restricciones tipo MTZ para evitar subtours o para representar carga acumulada.

**2. Distancia: fórmula de Haversine**

Sea $(\phi_i,\lambda_i)$ latitud y longitud del nodo $i$ en radianes. Definimos:

$$\Delta\phi = \phi_j - \phi_i, \qquad \Delta\lambda = \lambda_j - \lambda_i$$
$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_i)\cos(\phi_j)\sin^2\left(\frac{\Delta\lambda}{2}\right)$$
$$c = 2\,\asin\left(\sqrt{a}\right)$$
$$d_{ij} = R\,c$$

donde $R\approx 6371\,$ km (radio medio de la Tierra). Esta distancia es usada para construir la matriz $d_{ij}$ que alimenta la función objetivo.

**3. Formulación MIP (CVRP — versión compacta)**

Función objetivo (minimizar distancia total recorrida):

$$\min \; \sum_{i\in N}\sum_{j\in N} d_{ij}\,x_{ij}$$

Sujeto a:

- Cada cliente es visitado exactamente una vez:
$$\sum_{i\in N} x_{ij} = 1 \quad \forall j\in C$$

- Flujo de vehículos (salidas desde depósitos):
$$\sum_{j\in N} x_{d j} = V_d \quad \forall d\in D$$
$$\sum_{i\in N} x_{i d} = V_d \quad \forall d\in D$$

- Balance en clientes (entrada = salida = 1):
$$\sum_{i\in N} x_{ij} = \sum_{k\in N} x_{jk} = 1 \quad \forall j\in C$$

- Restricciones de capacidad (forma clásica, con MTZ-type para subtours):
Usando variables auxiliares $u_i$ (interpretables como carga acumulada o posición):
$$u_0 = 0$$
$$u_i - u_j + Q\,x_{ij} \le Q - q_j \quad \forall i\in N,\; \forall j\in C,\; i\ne j$$

Además:
$$q_i \le u_i \le Q \quad \forall i\in C$$

Explicación: si $x_{ij}=1$ entonces la desigualdad fuerza que $u_j$ sea al menos $u_i + q_j$, propagando la carga; cuando $x_{ij}=0$ la desigualdad no es restrictiva por el término $Q\,x_{ij}$.

Comentario sobre MTZ: la variante MTZ introduce $O(n)$ variables auxiliares y $O(n^2)$ restricciones y evita subtours de forma compacta. Para instancias grandes puede ser ineficiente frente a métodos basados en cortes o heurísticas.

**4. Interpretación y lógica del modelo**

- $x_{ij}$ modela la estructura topológica de las rutas (qué arcos se usan).
- $u_i$ permite seguir la secuencia o carga acumulada y evita subtours (rutas que no pasan por el depot).
- La función objetivo es aditiva en los arcos, por lo que optimizarla favorece rutas cortas en suma total.

Decisiones de diseño comunes y su justificación:
- Escoger Haversine: razonable para distancias aéreas entre puntos cercanos; si la operación requiere tiempos por carretera, sustituir $d_{ij}$ por distancias de red (routing API).
- Modelado de capacidad con $u_i$: compacto y fácil de implementar con solvers MIP públicos (PuLP/CBC, Gurobi, CPLEX).
- En presencia de muchos clientes se recomiendan heurísticas (Clarke-Wright, inserción, búsqueda local) o metaheurísticas (Tabú, Simulated Annealing) porque la resolución exacta escala mal.

**5. Heurística implementada en la UI (resumen lógico)**

La interfaz cliente-side implementa una heurística determinista y rápida con dos fases:

- Fase 1 — Asignación a depósito: cada cliente se asigna al depot más cercano (argmin sobre $d_{d,i}$ para $d\in D$).
- Fase 2 — Construcción de rutas por depot: para cada depot $d$, mientras queden clientes asignados:
	- Iniciar un vehículo en $d$ con capacidad disponible $Q_{rem}=Q$.
	- Repetir: seleccionar el cliente sin servir más cercano al último nodo visitado que cumpla $q_j\le Q_{rem}$; añadir a la ruta y actualizar $Q_{rem}\leftarrow Q_{rem}-q_j$.
	- Terminar cuando no haya cliente servible; volver al depot.

Ventajas: simple, rápida, determinista y fácil de visualizar.
Limitaciones: no garantiza optimalidad ni equilibrio entre depósitos; sensible al orden inicial de clientes (greedy local).

**6. Mapeo rápido entre fórmulas y código**
- Matriz de distancias $d_{ij}$: calculada en `main.js` y en `ejercicio.py` con la función Haversine.
- Variables $x_{ij}$ y $u_i$: construidas en `ejercicio.py` cuando se arma el modelo PuLP.
- Heurística greedy: función `recomputeGreedyFromData` en `main.js` y rutina equivalente en `ejercicio.py`.

---

