// main.js - Interfaz CVRP (cliente-side) - heurística greedy y edición de nodos
(function(){
  // Datos por defecto (simulación)
  window.OPTIMIZATION_RESULTS = {
    totalDistance: 0,
    status: 'NotRun',
    // nodes: objeto id -> { name, demand, E, L, lat, lon, depot?: true, vehicles?: n }
    nodes: {
      // tres almacenes mínimos
      1: { name: 'Almacén Norte', demand:0, E:0, L:1440, lat:40.4500, lon:-3.7000, depot:true, vehicles:2 },
      2: { name: 'Almacén Sur',  demand:0, E:0, L:1440, lat:40.4300, lon:-3.7100, depot:true, vehicles:2 },
      3: { name: 'Almacén Este', demand:0, E:0, L:1440, lat:40.4400, lon:-3.6800, depot:true, vehicles:1 },
      // tres clientes mínimos
      10: { name: 'Tienda A', demand:200, E:0, L:480, lat:40.4168, lon:-3.7038 },
      11: { name: 'Tienda B', demand:300, E:0, L:480, lat:40.4233, lon:-3.7000 },
      12: { name: 'Tienda C', demand:250, E:0, L:480, lat:40.4285, lon:-3.6950 }
    },
    routes: {}
  };

  // Copia original para reset
  const ORIGINAL_DATA = JSON.parse(JSON.stringify(window.OPTIMIZATION_RESULTS));

  // utilidades geo
  function haversine(a,b){ const toRad=v=>v*Math.PI/180; const lat1=toRad(a[0]), lon1=toRad(a[1]), lat2=toRad(b[0]), lon2=toRad(b[1]); const dlat=lat2-lat1, dlon=lon2-lon1; const R=6371; const hav=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2; return 2*R*Math.asin(Math.sqrt(hav)); }

  // recompute greedy
  // Nueva heurística: soporta múltiples almacenes (depots).
  // Se espera que cada nodo con `depot: true` tenga `vehicles` (número de vehículos asignados).
  function recomputeGreedyFromData(data, _numVehiclesIgnored, vehicleCapacity){
    const nodes = data.nodes;
    const depotIds = Object.keys(nodes).map(Number).filter(id=>nodes[id].depot);
    const customerIds = Object.keys(nodes).map(Number).filter(id=>!nodes[id].depot);

    const demands = {};
    customerIds.forEach(c=>demands[c]=nodes[c].demand||0);
    const totalDemand = customerIds.reduce((s,c)=>s+(demands[c]||0),0);
    const totalVehicles = depotIds.reduce((s,d)=>s + (nodes[d].vehicles||0), 0);
    if(totalDemand > totalVehicles * vehicleCapacity) return { error: 'Demanda total excede capacidad total asignada a almacenes.' };

    const coords = {};
    Object.entries(nodes).forEach(([id,n])=>coords[id]=[n.lat,n.lon]);

      // Asignar cada cliente al almacén más cercano (clustering por depot)
    const customersByDepot = {};
    depotIds.forEach(d=> customersByDepot[d]=[]);
    for(const c of customerIds){
      let bestDepot = null, bestD = Infinity;
      for(const d of depotIds){
        const dDist = haversine(coords[c], coords[d]);
        if(dDist < bestD){ bestD = dDist; bestDepot = d; }
      }
      if(bestDepot === null) bestDepot = depotIds[0];
      customersByDepot[bestDepot].push(c);
    }

    // Asegurar demanda mínima por cliente (>=200 kg) y reflejarlo en los nodos
    customerIds.forEach(c=>{
      const n = nodes[c];
      if(!n) return;
      if((n.demand||0) < 200){ n.demand = 200; }
      // actualizar mapa de demandas local
      // demands[c] ya se inicializó antes, así que actualizar
      demands[c] = n.demand || 200;
    });

    const served = new Set();
    const routes = {};
    let totalKm = 0;
    let routeCounter = 1;

    // Para cada almacén, ejecutar greedily solo sobre los clientes asignados a ese almacén
    for(const depotId of depotIds){
      const assignedCustomers = customersByDepot[depotId] || [];
      // Forzar 1 vehículo por almacén (regla del negocio)
      const vehiclesForDepot = 1;
      for(let v=0; v<vehiclesForDepot; v++){
        let cur = depotId;
        let load = 0;
        const seq = [depotId];
        while(true){
          let best = null, bestD = Infinity;
          for(const c of assignedCustomers){
            if(served.has(c)) continue;
            if((demands[c]||0) > (vehicleCapacity - load)) continue;
            const d = haversine(coords[cur], coords[c]);
            if(d < bestD){ bestD = d; best = c; }
          }
          if(best === null) break;
          seq.push(best);
          load += demands[best]||0;
          served.add(best);
          cur = best;
        }
        seq.push(depotId);
        // calcular distancia de la ruta
        let rd = 0; for(let i=0;i<seq.length-1;i++) rd += haversine(coords[seq[i]], coords[seq[i+1]]);
        routes[String(routeCounter)] = { sequence: seq, demand: load, distance: rd, depot: depotId, vehicleIdx: v, capacity: vehicleCapacity };
        totalKm += rd;
        routeCounter += 1;
        if(served.size === customerIds.length) break;
      }
      if(served.size === customerIds.length) break;
    }
    return { routes, totalKm };
  }

  // Depots list management: add/clear/edit
  document.getElementById('addDepotBtn').addEventListener('click', ()=>{
    const name = document.getElementById('newDepotName').value || 'Almacén';
    const lat = parseFloat(document.getElementById('newDepotLat').value) || 40.43;
    const lon = parseFloat(document.getElementById('newDepotLon').value) || -3.7;
    const vehicles = parseInt(document.getElementById('newDepotVehicles').value,10) || 1;
    const nodes = OPTIMIZATION_RESULTS.nodes;
    const ids = Object.keys(nodes).map(k=>Number(k));
    const newId = ids.length? Math.max(...ids)+1 : 1;
    nodes[newId] = { name, demand:0, E:0, L:1440, lat, lon, depot:true, vehicles };
    document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS,null,2);
    drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshDepotsList();
  });

  document.getElementById('clearDepotsBtn').addEventListener('click', ()=>{
    if(!confirm('Restablecer almacenes a los 3 predeterminados?')) return;
    // eliminar depósitos existentes y volver a los 3 por defecto
    const nodes = OPTIMIZATION_RESULTS.nodes;
    Object.keys(nodes).forEach(k=>{ if(nodes[k].depot) delete nodes[k]; });
    // agregar defaults
    nodes[1] = { name: 'Almacén Norte', demand:0, E:0, L:1440, lat:40.4500, lon:-3.7000, depot:true, vehicles:2 };
    nodes[2] = { name: 'Almacén Sur',  demand:0, E:0, L:1440, lat:40.4300, lon:-3.7100, depot:true, vehicles:2 };
    nodes[3] = { name: 'Almacén Este', demand:0, E:0, L:1440, lat:40.4400, lon:-3.6800, depot:true, vehicles:1 };
    document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS,null,2);
    drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshDepotsList();
  });

  function refreshDepotsList(){ const container = document.getElementById('depotsList'); container.innerHTML=''; const nodes = OPTIMIZATION_RESULTS.nodes; Object.entries(nodes).forEach(([id,node])=>{ if(!node.depot) return; const div=document.createElement('div'); div.className='p-2 border rounded flex items-center justify-between'; div.innerHTML=`<div><strong>D${id}</strong> ${node.name} · Veh: ${node.vehicles||1}</div>`; const actions=document.createElement('div'); const del=document.createElement('button'); del.className='px-2 py-1 text-xs bg-red-100 text-red-700 rounded'; del.textContent='Eliminar'; del.onclick=()=>{ if(confirm('Eliminar almacen '+id+'?')){ delete OPTIMIZATION_RESULTS.nodes[id]; document.getElementById('dataJson').value=JSON.stringify(OPTIMIZATION_RESULTS,null,2); drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshDepotsList(); } }; const edit=document.createElement('button'); edit.className='px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded ml-2'; edit.textContent='Editar'; edit.onclick=()=>{ document.getElementById('newDepotName').value=node.name; document.getElementById('newDepotLat').value=node.lat; document.getElementById('newDepotLon').value=node.lon; document.getElementById('newDepotVehicles').value=node.vehicles||1; delete OPTIMIZATION_RESULTS.nodes[id]; document.getElementById('dataJson').value=JSON.stringify(OPTIMIZATION_RESULTS,null,2); drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshDepotsList(); }; actions.appendChild(edit); actions.appendChild(del); div.appendChild(actions); container.appendChild(div); }); }


  // canvas drawing and interaction
  const canvas = document.getElementById('map-canvas'); const ctx = canvas.getContext('2d'); let transform=null; let draggingId=null;
  function resizeCanvas(){ const rect=canvas.getBoundingClientRect(); canvas.width=rect.width; canvas.height=rect.height; }
  window.addEventListener('resize', ()=>{ resizeCanvas(); drawRoutesOnCanvas(OPTIMIZATION_RESULTS); }); resizeCanvas();

  function computeTransform(data){ const lats=Object.values(data.nodes).map(n=>n.lat); const lons=Object.values(data.nodes).map(n=>n.lon); const minLat=Math.min(...lats), maxLat=Math.max(...lats), minLon=Math.min(...lons), maxLon=Math.max(...lons); const padding=40; const scaleX=(canvas.width-2*padding)/( (maxLon-minLon)||1 ); const scaleY=(canvas.height-2*padding)/( (maxLat-minLat)||1 ); const scale=Math.min(scaleX, scaleY); transform={minLat,minLon,scale,padding,canvasHeight:canvas.height}; return transform; }

  function mapCoords(lat,lon){ const t=transform; return { x: t.padding + (lon - t.minLon)*t.scale, y: t.canvasHeight - t.padding - (lat - t.minLat)*t.scale }; }
  function pixelToLatLon(x,y){ const t=transform; const lon = t.minLon + (x - t.padding)/t.scale; const lat = t.minLat + (t.canvasHeight - t.padding - y)/t.scale; return { lat, lon }; }

  function drawRoutesOnCanvas(data){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    transform=computeTransform(data);
    // Agrupar rutas por depot para poder asignarles un índice y separarlas visualmente
    const routesByDepot = {};
    Object.entries(data.routes || {}).forEach(([rid, r])=>{
      const depotId = (r.depot !== undefined) ? String(r.depot) : (r.sequence? String(r.sequence[0]) : '0');
      if(!routesByDepot[depotId]) routesByDepot[depotId]=[];
      routesByDepot[depotId].push({ rid, r });
    });

    // Colores para rutas
    const colors=['#2b8cbe','#7bccc4','#fdae61','#d53e4f','#66c2a5','#3288bd','#9e9ac8','#e78ac3','#8da0cb','#f4a582'];

    // Dibujar rutas, separando ligeramente las líneas de salida del mismo depot
    let colorIndex = 0;
    // calcular resumen por depot: demanda total y capacidad total
    const depotSummary = {};
    Object.entries(routesByDepot).forEach(([depotId, routes])=>{
      let sum=0; routes.forEach(entry=> sum += (entry.r && entry.r.demand)||0 );
      const depNode = data.nodes[depotId];
      // negocio: 1 vehiculo por almacen
      const vehCount = 1;
      const capPerVeh = parseFloat(document.getElementById('vehicleCapInput')?.value) || 22000;
      depotSummary[depotId] = { totalDemand: sum, totalCapacity: vehCount * capPerVeh, vehCount };
    });
    Object.entries(routesByDepot).forEach(([depotId, routes])=>{
      const depotNode = data.nodes[depotId];
      const depotPos = mapCoords(depotNode.lat, depotNode.lon);
      const n = routes.length;
      routes.forEach((entry, idx)=>{
        const r = entry.r;
        const seq = r.sequence || [];
        // calcular offset radial para la salida desde el depot
        const angle = (2 * Math.PI * idx) / Math.max(n,1);
        const offsetRadius = 10; // px
        const ox = Math.cos(angle) * offsetRadius;
        const oy = Math.sin(angle) * offsetRadius;

        ctx.beginPath();
        ctx.strokeStyle = colors[colorIndex % colors.length];
        ctx.lineWidth = 3;
        ctx.setLineDash([]);

        // Si la secuencia empieza en depot, dibujar desde punto offset
        if(seq.length > 0){
          const first = seq[0];
          const firstPos = mapCoords(data.nodes[first].lat, data.nodes[first].lon);
          // mover al punto offset del depot
          ctx.moveTo(depotPos.x + ox, depotPos.y + oy);
          // pequeña línea desde centro del depot hasta offset (para visualizar separación)
          ctx.moveTo(depotPos.x, depotPos.y);
          ctx.lineTo(depotPos.x + ox, depotPos.y + oy);
            // luego trazar hacia el primer nodo y resto de la ruta
            ctx.moveTo(depotPos.x + ox, depotPos.y + oy);
            // trazado por segmentos para poder anotar demanda en cada punto destino cliente
            let prevX = depotPos.x + ox, prevY = depotPos.y + oy;
            for(let j=1;j<seq.length;j++){
              const nid = seq[j];
              const p = mapCoords(data.nodes[nid].lat, data.nodes[nid].lon);
              ctx.lineTo(p.x, p.y);
              // si el destino es cliente (no depot) dibujar la demanda en el punto medio
              const node = data.nodes[nid];
              if(node && !node.depot){
                const midX = (prevX + p.x)/2;
                const midY = (prevY + p.y)/2;
                ctx.fillStyle = '#111827'; ctx.font='11px sans-serif'; ctx.textAlign='center';
                const demandText = (node.demand!==undefined) ? `${node.demand}kg` : '';
                ctx.fillText(demandText, midX, midY - 6);
              }
              prevX = p.x; prevY = p.y;
            }
          // Si la ruta contiene solo depot->customer->depot, trazar al destino final si presente
          if(seq.length === 1){
            // no-op
          }
        }
        ctx.stroke();
        // no dibujamos etiquetas por vehículo (un vehiculo por almacen)
        colorIndex++;
      });
    });

    // dibujar resumen de cada depot (total salida / capacidad)
    Object.entries(depotSummary).forEach(([depotId, summ])=>{
      try{
        const dn = data.nodes[depotId]; if(!dn) return;
        const p = mapCoords(dn.lat,dn.lon);
        // Mostrar solo lo esencial: lo que debe repartir y la capacidad asignada (vehículo único)
        const txt = `Repartir: ${summ.totalDemand}kg  •  Máx: ${summ.totalCapacity}kg`;
        ctx.fillStyle='#111827'; ctx.font='12px sans-serif'; ctx.textAlign='center';
        ctx.fillText(txt, p.x, p.y + 28);
      }catch(e){ }
    });

    // draw nodes (depots differently)
    Object.entries(data.nodes).forEach(([id,node])=>{
      const p=mapCoords(node.lat,node.lon);
      ctx.beginPath();
      // depots larger and red
      ctx.arc(p.x,p.y, node.depot? 12 : 8,0,Math.PI*2);
      ctx.fillStyle = node.depot? '#ef4444' : '#fff1b8';
      ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle='#333'; ctx.stroke();
      ctx.fillStyle='#111827'; ctx.font='12px sans-serif'; ctx.textAlign='center'; ctx.fillText((node.depot? 'D':'N')+id, p.x, p.y-18);
    });
  }

  // interaction: drag nodes, double-click to add (desktop) + touch support (mobile)
  canvas.addEventListener('mousedown', (ev)=>{ const r=canvas.getBoundingClientRect(); const x=ev.clientX - r.left, y=ev.clientY - r.top; const nid=findNodeAtPixel(x,y); if(nid!==null){ draggingId = nid; } });
  window.addEventListener('mousemove', (ev)=>{ if(draggingId===null) return; const r=canvas.getBoundingClientRect(); const x=ev.clientX-r.left, y=ev.clientY-r.top; const ll=pixelToLatLon(x,y); OPTIMIZATION_RESULTS.nodes[draggingId].lat = ll.lat; OPTIMIZATION_RESULTS.nodes[draggingId].lon = ll.lon; drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList(); document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS, null, 2); });
  window.addEventListener('mouseup', ()=>{ draggingId = null; });
  canvas.addEventListener('dblclick', (ev)=>{ const r=canvas.getBoundingClientRect(); const x=ev.clientX-r.left, y=ev.clientY-r.top; const ll=pixelToLatLon(x,y); const nodes = OPTIMIZATION_RESULTS.nodes; const ids=Object.keys(nodes).map(Number); const newId = ids.length? Math.max(...ids)+1:1; nodes[newId] = { name: 'Cliente '+newId, demand:200, E:0, L:480, lat: ll.lat, lon: ll.lon }; document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS, null, 2); drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList(); });

  // Mobile touch support: drag nodes and long-press to add a client
  let touchLongPressTimer = null;
  let touchStartPos = null;
  let touchMoved = false;

  canvas.addEventListener('touchstart', (ev)=>{
    ev.preventDefault();
    const touch = ev.touches[0];
    const r=canvas.getBoundingClientRect();
    const x = touch.clientX - r.left, y = touch.clientY - r.top;
    const nid = findNodeAtPixel(x,y);
    if(nid !== null){ draggingId = nid; }
    else {
      touchMoved = false;
      touchStartPos = { x, y };
      touchLongPressTimer = setTimeout(()=>{
        // add new client at touch position
        const ll = pixelToLatLon(x,y);
        const nodes = OPTIMIZATION_RESULTS.nodes; const ids = Object.keys(nodes).map(Number); const newId = ids.length? Math.max(...ids)+1:1;
        nodes[newId] = { name: 'Cliente '+newId, demand:200, E:0, L:480, lat: ll.lat, lon: ll.lon };
        document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS, null, 2);
        drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList();
      }, 600); // long-press 600ms
    }
  }, { passive:false });

  canvas.addEventListener('touchmove', (ev)=>{
    if(!ev.touches || ev.touches.length===0) return;
    const touch = ev.touches[0];
    const r=canvas.getBoundingClientRect();
    const x = touch.clientX - r.left, y = touch.clientY - r.top;
    touchMoved = true;
    if(touchLongPressTimer){ clearTimeout(touchLongPressTimer); touchLongPressTimer = null; }
    if(draggingId===null) return;
    ev.preventDefault();
    const ll = pixelToLatLon(x,y);
    OPTIMIZATION_RESULTS.nodes[draggingId].lat = ll.lat;
    OPTIMIZATION_RESULTS.nodes[draggingId].lon = ll.lon;
    drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList(); document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS, null, 2);
  }, { passive:false });

  canvas.addEventListener('touchend', (ev)=>{
    if(touchLongPressTimer){ clearTimeout(touchLongPressTimer); touchLongPressTimer = null; }
    draggingId = null;
  });

  function findNodeAtPixel(x,y){ if(!transform) return null; const thresh=12; for(const [id,node] of Object.entries(OPTIMIZATION_RESULTS.nodes)){ const p=mapCoords(node.lat,node.lon); const dx=p.x-x, dy=p.y-y; if(Math.sqrt(dx*dx+dy*dy)<=thresh) return Number(id); } return null; }

  // UI handlers
  document.getElementById('recomputeBtn').addEventListener('click', ()=>{
    const cap = parseFloat(document.getElementById('vehicleCapInput').value) || 22000;
    const res = recomputeGreedyFromData(OPTIMIZATION_RESULTS, undefined, cap);
    if(res.error){ alert(res.error); return; }
    OPTIMIZATION_RESULTS.routes = res.routes; OPTIMIZATION_RESULTS.totalDistance = res.totalKm; OPTIMIZATION_RESULTS.status='Heuristic';
    drawRoutesOnCanvas(OPTIMIZATION_RESULTS); document.getElementById('resultsBox').textContent = formatResultsText(OPTIMIZATION_RESULTS); document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS,null,2); refreshClientsList();
  });

  // Mobile-only top bar controls (if present) — keep desktop and mobile in sync
  const mobileRecompute = document.getElementById('mobileRecomputeBtn');
  const mobileReset = document.getElementById('mobileResetBtn');
  const mobileCapInput = document.getElementById('mobileVehicleCapInput');
  if(mobileRecompute){
    mobileRecompute.addEventListener('click', ()=>{
      const cap = parseFloat(mobileCapInput.value) || 22000;
      const desktopCap = document.getElementById('vehicleCapInput'); if(desktopCap) desktopCap.value = cap;
      const res = recomputeGreedyFromData(OPTIMIZATION_RESULTS, undefined, cap);
      if(res.error){ alert(res.error); return; }
      OPTIMIZATION_RESULTS.routes = res.routes; OPTIMIZATION_RESULTS.totalDistance = res.totalKm; OPTIMIZATION_RESULTS.status='Heuristic';
      drawRoutesOnCanvas(OPTIMIZATION_RESULTS); document.getElementById('resultsBox').textContent = formatResultsText(OPTIMIZATION_RESULTS); document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS,null,2); refreshClientsList();
    });
  }
  if(mobileReset){
    mobileReset.addEventListener('click', ()=>{ document.getElementById('resetSimBtn').click(); });
  }

  document.getElementById('resetSimBtn').addEventListener('click', ()=>{ // reset to original defaults (3 depots + 3 clients)
    OPTIMIZATION_RESULTS = window.OPTIMIZATION_RESULTS = JSON.parse(JSON.stringify(ORIGINAL_DATA));
    document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS,null,2);
    drawRoutesOnCanvas(OPTIMIZATION_RESULTS);
    refreshClientsList(); refreshDepotsList(); document.getElementById('resultsBox').textContent='Pulsa Recalcular Rutas';
  });

  document.getElementById('loadJsonBtn').addEventListener('click', ()=>{ try{ const txt=document.getElementById('dataJson').value; const parsed=JSON.parse(txt); // validate minimal
    if(!parsed.nodes) throw new Error('Falta campo nodes'); OPTIMIZATION_RESULTS = window.OPTIMIZATION_RESULTS = parsed; drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList(); document.getElementById('resultsBox').textContent='Datos cargados'; }catch(e){ alert('JSON inválido: '+e.message); } });

  document.getElementById('downloadBtn').addEventListener('click', ()=>{ const content=document.getElementById('resultsBox').textContent || ''; const blob=new Blob([content],{type:'text/plain'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='resultado_rutas.txt'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });

  // clients list management
  document.getElementById('addClientBtn').addEventListener('click', ()=>{ 
    const name = document.getElementById('newName').value||'Cliente';
    let demand = parseFloat(document.getElementById('newDemand').value);
    if(isNaN(demand)) demand = 200;
    if(demand < 200) demand = 200; // exigir mínimo 200 kg
    const E = parseFloat(document.getElementById('newE').value)||0;
    const L = parseFloat(document.getElementById('newL').value)||480;
    const lat = parseFloat(document.getElementById('newLat').value)||40.42;
    const lon = parseFloat(document.getElementById('newLon').value)||-3.7;
    const nodes = OPTIMIZATION_RESULTS.nodes; const ids = Object.keys(nodes).map(Number); const nid = ids.length? Math.max(...ids)+1:1;
    nodes[nid] = { name, demand, E, L, lat, lon };
    document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS,null,2);
    drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList();
  });
  document.getElementById('clearClientsBtn').addEventListener('click', ()=>{ if(!confirm('Borrar todos los clientes?')) return; const nodes=OPTIMIZATION_RESULTS.nodes; Object.keys(nodes).forEach(k=>{ if(!nodes[k].depot) delete nodes[k]; }); document.getElementById('dataJson').value=JSON.stringify(OPTIMIZATION_RESULTS,null,2); drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList(); });

  function refreshClientsList(){ const container=document.getElementById('clientsList'); container.innerHTML=''; const nodes=OPTIMIZATION_RESULTS.nodes; Object.entries(nodes).forEach(([id,node])=>{ if(node.depot) return; const div=document.createElement('div'); div.className='p-2 border rounded flex items-center justify-between'; div.innerHTML=`<div><strong>N${id}</strong> ${node.name} · Dem:${node.demand}</div>`; const actions=document.createElement('div'); const del=document.createElement('button'); del.className='px-2 py-1 text-xs bg-red-100 text-red-700 rounded'; del.textContent='Eliminar'; del.onclick=()=>{ if(confirm('Eliminar '+id+'?')){ delete OPTIMIZATION_RESULTS.nodes[id]; document.getElementById('dataJson').value=JSON.stringify(OPTIMIZATION_RESULTS,null,2); drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList(); } }; const edit=document.createElement('button'); edit.className='px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded ml-2'; edit.textContent='Editar'; edit.onclick=()=>{ document.getElementById('newName').value=node.name; document.getElementById('newDemand').value=node.demand; document.getElementById('newE').value=node.E; document.getElementById('newL').value=node.L; document.getElementById('newLat').value=node.lat; document.getElementById('newLon').value=node.lon; delete OPTIMIZATION_RESULTS.nodes[id]; document.getElementById('dataJson').value=JSON.stringify(OPTIMIZATION_RESULTS,null,2); drawRoutesOnCanvas(OPTIMIZATION_RESULTS); refreshClientsList(); }; actions.appendChild(edit); actions.appendChild(del); div.appendChild(actions); container.appendChild(div); }); }

  function formatResultsText(data){ let out=[]; out.push('Status: '+(data.status||'')+' | Dist(total): '+(data.totalDistance||0).toFixed(3)+' km'); Object.entries(data.routes||{}).forEach(([vid,r])=>{ out.push('Veh '+vid+': '+ (r.sequence? r.sequence.join(' -> '):'') + ' | Carga: '+(r.demand||0)+' | Dist: '+(r.distance||0).toFixed(3)); }); return out.join('\n'); }
  
  // Mejor formato: agrupar rutas por almacén (depot)
  function formatResultsText(data){
    const lines = [];
    lines.push('Status: '+(data.status||'')+' | Dist(total): '+(data.totalDistance||0).toFixed(3)+' km');
    const byDepot = {};
    Object.entries(data.routes||{}).forEach(([rid, r])=>{
      const depot = r.depot !== undefined ? r.depot : (r.sequence? r.sequence[0] : 'unknown');
      if(!byDepot[depot]) byDepot[depot]=[];
      byDepot[depot].push({ rid, r });
    });
    for(const depotId of Object.keys(byDepot)){
      const depot = data.nodes[depotId];
      // calcular totales por depot
      const depotRoutes = byDepot[depotId];
      const totalDemand = depotRoutes.reduce((s,entry)=> s + ((entry.r && entry.r.demand) || 0), 0);
      const vehCount = depot ? (depot.vehicles||1) : 1;
      const capPerVeh = parseFloat(document.getElementById('vehicleCapInput')?.value) || 22000;
      const totalCap = vehCount * capPerVeh;
      lines.push('\nAlmacén ' + depotId + ' - ' + (depot? depot.name : '') + ` | Salida: ${totalDemand}kg / Cap: ${totalCap}kg` );
      byDepot[depotId].forEach((entry, idx)=>{
        const r = entry.r;
        // Mostrar secuencia con demandas por cliente
        const seqParts = (r.sequence||[]).map(id=>{
          const node = data.nodes[id];
          if(!node) return id;
          if(node.depot) return `D${id}`;
          return `N${id}(d=${node.demand||0})`;
        });
        const capText = r.capacity !== undefined ? ` / Cap:${r.capacity}` : '';
        lines.push(`  Vehículo ${idx+1}: ${ seqParts.join(' -> ') } | Carga: ${r.demand||0}${capText} | Dist: ${ (r.distance||0).toFixed(3) } km`);
      });
    }
    // si hay rutas sin depot asignado
    const orphan = Object.entries(data.routes||{}).filter(([,r])=> r.depot===undefined);
    if(orphan.length) {
      lines.push('\nRutas sin almacén asignado:');
      orphan.forEach(([rid,r])=> lines.push(`  R${rid}: ${(r.sequence||[]).join(' -> ')}`));
    }
    return lines.join('\n');
  }

  // inicial
  document.getElementById('dataJson').value = JSON.stringify(OPTIMIZATION_RESULTS,null,2);
  drawRoutesOnCanvas(OPTIMIZATION_RESULTS);
  refreshClientsList();
  refreshDepotsList();

})();
