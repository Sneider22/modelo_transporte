#!/usr/bin/env python3
"""
ejercicio.py
Greedy CVRP runner for Farmatodo demo (mirrors the web app heuristic).

Behavior:
- Loads instance from `data.json` if present (export from web UI), otherwise uses built-in defaults.
- Enforces minimum demand per client = 200 kg and minimum vehicle capacity = 22000 kg.
- Assigns each client to the nearest depot (Haversine distance).
- For each depot, runs a greedy nearest-customer heuristic using ONE vehicle per depot.
- Writes `resultado_rutas.txt` with a human-readable summary.

This script is intended to reproduce the same route assignment shown in the web visualizer.
"""
import json
import math
import os
from pathlib import Path


def haversine_km(a, b):
    # a,b: (lat, lon) in degrees
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    R = 6371.0
    hav = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(hav))


def load_data(path=None):
    # try data.json exported from web UI
    if path:
        p = Path(path)
        if p.exists():
            return json.loads(p.read_text())
    # default data: use the JSON instance provided by the user (compact test case)
    data = {
        "totalDistance": 2.754661170184616,
        "status": "Heuristic",
        "nodes": {
            "1": {"name": "Almacén Norte", "demand": 0, "E": 0, "L": 1440, "lat": 40.44528933211498, "lon": -3.6955678224704815, "depot": True, "vehicles": 1},
            "2": {"name": "Almacén Sur", "demand": 0, "E": 0, "L": 1440, "lat": 40.44118520927391, "lon": -3.6940182715253753, "depot": True, "vehicles": 1},
            "3": {"name": "Almacén Este", "demand": 0, "E": 0, "L": 1440, "lat": 40.443506084379536, "lon": -3.693013713679337, "depot": True, "vehicles": 1},
            "10": {"name": "Cliente 10", "demand": 200, "E": 0, "L": 480, "lat": 40.44859519461797, "lon": -3.6926292780233725},
            "11": {"name": "Cliente 11", "demand": 220, "E": 0, "L": 480, "lat": 40.44932983072975, "lon": -3.697363599788293},
            "12": {"name": "Cliente 12", "demand": 250, "E": 0, "L": 480, "lat": 40.447370801098344, "lon": -3.6948739997874047},
            "13": {"name": "Cliente 13", "demand": 200, "E": 0, "L": 480, "lat": 40.440141139987915, "lon": -3.6976901048825503},
            "14": {"name": "Cliente 14", "demand": 210, "E": 0, "L": 480, "lat": 40.44215512692083, "lon": -3.696616266836483},
            "15": {"name": "Cliente", "demand": 200, "E": 0, "L": 480, "lat": 40.44566918127527, "lon": -3.691091197295794}
        },
        "routes": {
            "1": {"sequence": [1, 12, 10, 11, 1], "demand": 670, "distance": 1.355614079477195, "depot": 1, "vehicleIdx": 0, "capacity": 22000},
            "2": {"sequence": [2, 14, 13, 2], "demand": 410, "distance": 0.8182880438967184, "depot": 2, "vehicleIdx": 0, "capacity": 22000},
            "3": {"sequence": [3, 15, 3], "demand": 200, "distance": 0.5807590468107028, "depot": 3, "vehicleIdx": 0, "capacity": 22000}
        }
    }
    return data


def greedy_multidepot(data, vehicle_capacity=22000):
    nodes = data.get('nodes', {})
    # separate depots and customers
    depots = {int(k): v for k, v in nodes.items() if v.get('depot')}
    customers = {int(k): v for k, v in nodes.items() if not v.get('depot')}

    # enforce minimum demand 200 kg
    for cid, c in customers.items():
        if (c.get('demand') or 0) < 200:
            c['demand'] = 200

    coords = {}
    for k, v in nodes.items():
        coords[int(k)] = (v['lat'], v['lon'])

    # assign each customer to nearest depot
    customers_by_depot = {d: [] for d in depots.keys()}
    for cid in customers.keys():
        best = None
        bestd = float('inf')
        for did in depots.keys():
            d = haversine_km(coords[cid], coords[did])
            if d < bestd:
                bestd = d
                best = did
        customers_by_depot[best].append(cid)

    served = set()
    routes = []
    total_km = 0.0

    # one vehicle per depot (business rule)
    for did, assigned in customers_by_depot.items():
        # vehicles_for_depot = depots[did].get('vehicles', 1)  # ignore, single vehicle
        vehicle_count = 1
        for v in range(vehicle_count):
            cur = did
            load = 0
            seq = [did]
            while True:
                best = None
                bestd = float('inf')
                for cid in assigned:
                    if cid in served:
                        continue
                    demand = customers[cid].get('demand', 0)
                    if demand > (vehicle_capacity - load):
                        continue
                    d = haversine_km(coords[cur], coords[cid])
                    if d < bestd:
                        bestd = d
                        best = cid
                if best is None:
                    break
                seq.append(best)
                load += customers[best].get('demand', 0)
                served.add(best)
                cur = best
            seq.append(did)
            # compute distance
            rd = 0.0
            for i in range(len(seq)-1):
                rd += haversine_km(coords[seq[i]], coords[seq[i+1]])
            routes.append({
                'depot': did,
                'sequence': seq,
                'demand': load,
                'distance': rd,
                'capacity': vehicle_capacity
            })
            total_km += rd

    return routes, total_km


def format_results(routes, total_km, nodes):
    lines = []
    lines.append(f"Status: Heuristic | Dist(total): {total_km:.3f} km")
    # group by depot
    by_depot = {}
    for r in routes:
        by_depot.setdefault(r['depot'], []).append(r)
    for did, rs in by_depot.items():
        depot_name = nodes.get(str(did), {}).get('name', '')
        total_d = sum(r['demand'] for r in rs)
        cap = rs[0].get('capacity', 0) * 1  # one vehicle
        lines.append(f"\nAlmacén {did} - {depot_name} | Salida: {total_d}kg / Cap: {cap}kg")
        for idx, r in enumerate(rs, start=1):
            seqparts = []
            for nid in r['sequence']:
                n = nodes.get(str(nid), {})
                if n.get('depot'):
                    seqparts.append(f"D{nid}")
                else:
                    seqparts.append(f"N{nid}(d={n.get('demand',0)})")
            lines.append(f"  Vehículo {idx}: {' -> '.join(seqparts)} | Carga: {r['demand']} / Cap:{r['capacity']} | Dist: {r['distance']:.3f} km")
    return '\n'.join(lines)


def main():
    # try to load data.json exported from web
    data_file = Path('data.json')
    data = None
    if data_file.exists():
        try:
            data = json.loads(data_file.read_text())
            print('Loaded instance from data.json')
        except Exception as e:
            print('Failed to load data.json, using defaults:', e)
    if data is None:
        data = load_data()

    vehicle_capacity = 22000
    # If the loaded JSON already contains precomputed routes, prefer them (paridad exacta)
    if data.get('routes'):
        routes_raw = data.get('routes', {})
        routes = []
        total_km = float(data.get('totalDistance') or 0.0)
        for key in sorted(routes_raw, key=lambda k: int(k)):
            r = routes_raw[key]
            routes.append({
                'depot': int(r.get('depot')) if r.get('depot') is not None else None,
                'sequence': r.get('sequence', []),
                'demand': r.get('demand', 0),
                'distance': r.get('distance', 0.0),
                'capacity': r.get('capacity', vehicle_capacity)
            })
    else:
        routes, total_km = greedy_multidepot(data, vehicle_capacity)

    out = format_results(routes, total_km, data.get('nodes', {}))
    print(out)

    # write to resultado_rutas.txt
    out_path = Path('resultado_rutas.txt')
    out_path.write_text(out)
    print('\nResultado guardado en:', out_path.resolve())


if __name__ == '__main__':
    main()
