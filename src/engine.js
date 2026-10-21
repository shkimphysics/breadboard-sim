/* ===== 브레드보드 시뮬레이터 엔진 (DOM 없음) ===== */
const PITCH = 24, COLS = 30;
const ROW_TOP = ['a', 'b', 'c', 'd', 'e'];
const ROW_BOT = ['f', 'g', 'h', 'i', 'j'];
const Y_TOP = [96, 120, 144, 168, 192];
const Y_BOT = [232, 256, 280, 304, 328];
const RAIL_DEFS = [
  { key: 'rt+', net: 'RT+', y: 30, sign: '+', side: '상단' },
  { key: 'rt-', net: 'RT-', y: 54, sign: '-', side: '상단' },
  { key: 'rb-', net: 'RB-', y: 372, sign: '-', side: '하단' },
  { key: 'rb+', net: 'RB+', y: 396, sign: '+', side: '하단' }
];
const GROUND_NET = 'RT-';
const colX = c => 48 + (c - 1) * PITCH;
const railX = k => 60 + Math.floor((k - 1) / 5) * 144 + ((k - 1) % 5) * PITCH;

function buildGeometry() {
  const holes = {}, nets = {};
  const add = h => { holes[h.id] = h; (nets[h.net] = nets[h.net] || []).push(h.id); };
  for (let c = 1; c <= COLS; c++) {
    ROW_TOP.forEach((r, i) => add({ id: r + c, x: colX(c), y: Y_TOP[i], net: 'T' + c, zone: 'top', col: c, row: r }));
    ROW_BOT.forEach((r, i) => add({ id: r + c, x: colX(c), y: Y_BOT[i], net: 'B' + c, zone: 'bot', col: c, row: r }));
  }
  RAIL_DEFS.forEach(rd => {
    for (let k = 1; k <= 25; k++) add({ id: rd.key + ':' + k, x: railX(k), y: rd.y, net: rd.net, zone: 'rail', rail: rd, k });
  });
  return { holes, nets, list: Object.values(holes) };
}

function holeLabel(h) {
  if (!h) return '';
  if (h.zone === 'rail') return h.rail.side + ' 전원 레일 (' + (h.rail.sign === '+' ? '+' : '−') + ')';
  return h.row + h.col;
}

/* ----- 표시용 형식 ----- */
const trimNum = x => String(+(+x).toFixed(2));
function fmtR(v) {
  if (v >= 1e6) return trimNum(v / 1e6) + ' MΩ';
  if (v >= 1e3) return trimNum(v / 1e3) + ' kΩ';
  return trimNum(v) + ' Ω';
}
function fmtV(v) { return (Math.abs(v) < 0.005 ? 0 : v).toFixed(2) + ' V'; }
function fmtI(i) {
  const a = Math.abs(i);
  if (a < 1e-6) return '0 mA';
  if (a < 1e-4) return (i * 1e6).toFixed(0) + ' µA';
  if (a < 1) { const m = i * 1000, am = Math.abs(m); return m.toFixed(am < 10 ? 2 : am < 100 ? 1 : 0) + ' mA'; }
  return i.toFixed(a < 100 ? 2 : 0) + ' A';
}
function fmtP(p) {
  const a = Math.abs(p);
  if (a < 1e-7) return '0 mW';
  if (a < 1) { const m = p * 1000, am = Math.abs(m); return m.toFixed(am < 10 ? 2 : am < 100 ? 1 : 0) + ' mW'; }
  return p.toFixed(a < 100 ? 2 : 0) + ' W';
}

/* ----- 저항 색띠 ----- */
const BAND_COL = ['#1c1c1c', '#7b4a1e', '#d3322b', '#ee7b1c', '#f1d21d', '#2f9d4b', '#2b5fd6', '#8b44b8', '#8a8f94', '#f3f3ef'];
function resistorBands(R) {
  let m, d;
  if (R >= 10) {
    m = Math.floor(Math.log10(R) + 1e-9) - 1;
    d = Math.round(R / Math.pow(10, m));
    if (d >= 100) { d = Math.round(d / 10); m += 1; }
  } else { m = -1; d = Math.max(10, Math.round(R * 10)); }
  const mult = m === -1 ? '#c9a227' : m === -2 ? '#b9bec4' : BAND_COL[Math.max(0, Math.min(9, m))];
  return [BAND_COL[Math.floor(d / 10)], BAND_COL[d % 10], mult, '#c9a227'];
}

/* ----- 부품 정의 ----- */
const LED_TYPES = {
  red: { name: '빨강', vf: 1.9, css: '#ef3b36' },
  yellow: { name: '노랑', vf: 2.0, css: '#f6c026' },
  green: { name: '초록', vf: 2.1, css: '#2fc15a' },
  blue: { name: '파랑', vf: 3.0, css: '#3b7bff' },
  white: { name: '하양', vf: 3.1, css: '#f4f4ee' }
};
const E = {
  R_WIRE: 0.001, R_SWITCH: 0.001, R_AMM: 0.001, R_INT: 0.005,
  GMIN: 1e-9, VT: 0.025852, LED_N: 2,
  LED_BURN: 0.05, FUSE: 5, BULB_BURN_V: 10.5, RES_RATING: 0.25, BULB_RATED_P: 1.8
};

function pnjlim(vnew, vold, vt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > vt + vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    } else {
      vnew = vt * Math.log(vnew / vt);
    }
  }
  return vnew;
}

function solveLinear(A, z) {
  const n = z.length;
  for (let k = 0; k < n; k++) {
    let piv = k, best = Math.abs(A[k][k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i][k]); if (v > best) { best = v; piv = i; } }
    if (piv !== k) { [A[k], A[piv]] = [A[piv], A[k]]; [z[k], z[piv]] = [z[piv], z[k]]; }
    if (Math.abs(A[k][k]) < 1e-30) A[k][k] = 1e-30;
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
      z[i] -= f * z[k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = z[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

function ledParams(p) {
  const t = LED_TYPES[p.color] || LED_TYPES.red;
  const nVt = E.LED_N * E.VT;
  const Is = 0.02 / Math.exp(t.vf / nVt);
  return { nVt, Is, vcrit: nVt * Math.log(nVt / (Math.SQRT2 * Is)) };
}

/* 한 번 계산 */
function solveCircuit(parts, psu, G) {
  const idxMap = new Map([[GROUND_NET, -1]]);
  let n = 0;
  const idx = net => { if (!idxMap.has(net)) idxMap.set(net, n++); return idxMap.get(net); };
  const psuOn = !!(psu.on && !psu.fuse);
  if (psuOn) idx('RT+');
  const rs = [], ds = [], info = {};
  for (const p of parts) {
    const na = G.holes[p.a].net, nb = G.holes[p.b].net;
    const ia = idx(na), ib = idx(nb);
    const same = na === nb;
    info[p.id] = { same };
    if (same) continue;
    let g = 0;
    if (p.type === 'wire') g = 1 / E.R_WIRE;
    else if (p.type === 'resistor') g = 1 / Math.max(p.R, 1e-3);
    else if (p.type === 'bulb') { if (!p.burnt) g = 1 / Math.max(p.R, 1e-3); }
    else if (p.type === 'switch') { if (p.closed) g = 1 / E.R_SWITCH; }
    else if (p.type === 'ammeter') g = 1 / E.R_AMM;
    if (g > 0) rs.push({ p, ia, ib, g });
    if (p.type === 'led' && !p.burnt) ds.push(Object.assign({ p, ia, ib }, ledParams(p)));
  }
  const N = n;
  const mk = () => ({ A: Array.from({ length: N }, () => new Array(N).fill(0)), z: new Array(N).fill(0) });
  const stampG = (A, i, j, g) => {
    if (i >= 0) A[i][i] += g;
    if (j >= 0) A[j][j] += g;
    if (i >= 0 && j >= 0) { A[i][j] -= g; A[j][i] -= g; }
  };
  const stampI = (z, i, j, I) => { if (i >= 0) z[i] -= I; if (j >= 0) z[j] += I; };
  const gInt = 1 / E.R_INT;
  let V = new Array(N).fill(0);
  const vdPrev = ds.map(() => 0);
  let iters = 0, converged = true;
  for (let iter = 0; iter < 200; iter++) {
    iters = iter + 1;
    const { A, z } = mk();
    for (let i = 0; i < N; i++) A[i][i] += E.GMIN;
    for (const r of rs) stampG(A, r.ia, r.ib, r.g);
    if (psuOn) { const i = idxMap.get('RT+'); A[i][i] += gInt; z[i] += psu.V * gInt; }
    let limited = false;
    ds.forEach((d, k) => {
      const va = d.ia >= 0 ? V[d.ia] : 0, vk = d.ib >= 0 ? V[d.ib] : 0;
      const raw = va - vk;
      const vd = pnjlim(raw, vdPrev[k], d.nVt, d.vcrit);
      if (Math.abs(vd - raw) > 1e-12) limited = true;
      vdPrev[k] = vd;
      const ex = Math.exp(Math.min(vd / d.nVt, 90));
      const id = d.Is * (ex - 1);
      const gd = d.Is * ex / d.nVt + 1e-12;
      stampG(A, d.ia, d.ib, gd);
      stampI(z, d.ia, d.ib, id - gd * vd);
    });
    const Vn = N ? solveLinear(A, z) : [];
    let diff = 0;
    for (let i = 0; i < N; i++) diff = Math.max(diff, Math.abs(Vn[i] - V[i]));
    V = Vn;
    if (!limited && diff < 1e-8) { converged = true; break; }
    converged = false;
  }
  const vOf = net => { const i = idxMap.get(net); return i === undefined || i < 0 ? 0 : V[i]; };
  const out = { parts: {}, V: {}, iters, converged };
  idxMap.forEach((i, net) => { out.V[net] = i < 0 ? 0 : V[i]; });
  for (const p of parts) {
    const na = G.holes[p.a].net, nb = G.holes[p.b].net;
    const v = vOf(na) - vOf(nb);
    let i = 0;
    if (!info[p.id].same) {
      if (p.type === 'wire') i = v / E.R_WIRE;
      else if (p.type === 'resistor') i = v / Math.max(p.R, 1e-3);
      else if (p.type === 'bulb') i = p.burnt ? 0 : v / Math.max(p.R, 1e-3);
      else if (p.type === 'switch') i = p.closed ? v / E.R_SWITCH : 0;
      else if (p.type === 'ammeter') i = v / E.R_AMM;
      else if (p.type === 'led') {
        if (!p.burnt) { const d = ledParams(p); i = d.Is * (Math.exp(Math.min(v / d.nVt, 90)) - 1); }
      }
    }
    out.parts[p.id] = { v, i, p: v * i, same: info[p.id].same };
  }
  const vt = vOf('RT+');
  const isup = psuOn ? gInt * (psu.V - vt) : 0;
  out.supply = { V: vt, I: isup, P: vt * isup, on: psuOn };
  return out;
}

/* 고장(과전류) 처리까지 포함 */
function simulate(parts, psu, G, opts) {
  const events = [];
  let res;
  for (let pass = 0; pass < 8; pass++) {
    res = solveCircuit(parts, psu, G);
    if (!opts || !opts.faults) break;
    let changed = false;
    for (const p of parts) {
      const r = res.parts[p.id];
      if (p.burnt || !r) continue;
      if (p.type === 'led' && r.i > E.LED_BURN) { p.burnt = true; events.push({ type: 'burnt', part: p, why: 'LED에 너무 큰 전류가 흘렀어요' }); changed = true; }
      else if (p.type === 'bulb' && Math.abs(r.v) > E.BULB_BURN_V) { p.burnt = true; events.push({ type: 'burnt', part: p, why: '정격 전압을 넘어 필라멘트가 끊어졌어요' }); changed = true; }
    }
    if (changed) continue;
    if (!psu.fuse && res.supply.I > E.FUSE) { psu.fuse = true; events.push({ type: 'fuse', I: res.supply.I }); continue; }
    break;
  }
  return { res, events };
}

/* ----- 예제 회로 ----- */
const PRESETS = [
  {
    id: 'led', name: 'LED 켜기 (저항 + LED)', V: 5,
    note: 'LED는 저항 없이 연결하면 타 버려요. 220 Ω 저항이 전류를 약 14 mA로 제한합니다. 저항 값을 바꿔 밝기를 비교해 보세요.',
    parts: [
      { type: 'wire', a: 'rt+:1', b: 'a2' },
      { type: 'resistor', R: 220, a: 'b2', b: 'b7' },
      { type: 'led', color: 'red', a: 'c7', b: 'c11' },
      { type: 'wire', a: 'a11', b: 'rt-:9' }]
  },
  {
    id: 'led-rev', name: 'LED 극성 (거꾸로 연결)', V: 5,
    note: 'LED는 한쪽 방향으로만 전류가 흘러요. 양극(+, 긴 다리)이 전원 − 쪽을 향하면 켜지지 않습니다. LED를 선택하고 극성 바꾸기를 눌러 보세요.',
    parts: [
      { type: 'wire', a: 'rt+:1', b: 'a2' },
      { type: 'resistor', R: 220, a: 'b2', b: 'b7' },
      { type: 'led', color: 'red', a: 'c11', b: 'c7' },
      { type: 'wire', a: 'a11', b: 'rt-:9' }]
  },
  {
    id: 'switch', name: '스위치로 회로 열고 닫기', V: 5,
    note: '스위치를 누르면 회로가 끊기거나 이어집니다. 회로가 닫혀 있을 때만 전류가 흘러요.',
    parts: [
      { type: 'wire', a: 'rt+:1', b: 'a2' },
      { type: 'switch', closed: true, a: 'b2', b: 'b6' },
      { type: 'resistor', R: 220, a: 'c6', b: 'c10' },
      { type: 'led', color: 'green', a: 'd10', b: 'd14' },
      { type: 'wire', a: 'a14', b: 'rt-:11' }]
  },
  {
    id: 'series-r', name: '저항의 직렬 연결', V: 6,
    note: '직렬: 전류는 어디서나 같고, 전체 전압이 저항에 나뉘어 걸립니다. 전체 저항 = 100 Ω + 220 Ω = 320 Ω. 전류계를 끼워 전류를 재 보세요.',
    parts: [
      { type: 'wire', a: 'rt+:2', b: 'a3' },
      { type: 'resistor', R: 100, a: 'b3', b: 'b8' },
      { type: 'resistor', R: 220, a: 'd8', b: 'd13' },
      { type: 'wire', a: 'a13', b: 'rt-:10' }]
  },
  {
    id: 'parallel-r', name: '저항의 병렬 연결', V: 6,
    note: '병렬: 각 저항에 걸리는 전압이 같고, 전류는 나뉘어 흐릅니다. 전체 저항은 가장 작은 저항보다도 작아져요.',
    parts: [
      { type: 'wire', a: 'rt+:3', b: 'a5' },
      { type: 'resistor', R: 100, a: 'b5', b: 'b11' },
      { type: 'resistor', R: 220, a: 'd5', b: 'd11' },
      { type: 'wire', a: 'a11', b: 'rt-:8' }]
  },
  {
    id: 'mixed', name: '직병렬 혼합 회로', V: 6,
    note: '100 Ω 저항이 220 Ω, 330 Ω 병렬 묶음과 직렬로 연결되어 있어요. 병렬 묶음의 합성 저항은 132 Ω이고, 전체는 232 Ω입니다.',
    parts: [
      { type: 'wire', a: 'rt+:1', b: 'a2' },
      { type: 'resistor', R: 100, a: 'b2', b: 'b7' },
      { type: 'resistor', R: 220, a: 'c7', b: 'c12' },
      { type: 'resistor', R: 330, a: 'd7', b: 'd12' },
      { type: 'wire', a: 'a12', b: 'rt-:9' }]
  },
  {
    id: 'wheatstone', name: '휘트스톤 브리지 (평형)', V: 5,
    note: 'R1:R2 = R3:R4 (100:220 = 150:330)이면 B점과 D점의 전위가 같아 가운데 전류계가 0 mA를 가리켜요. R4를 340 Ω처럼 바꾸면 평형이 깨져 전류가 흐릅니다. 전압 측정으로 b8과 e18을 재 볼 수도 있어요.',
    parts: [
      { type: 'wire', a: 'rt+:2', b: 'a3' },
      { type: 'resistor', R: 100, a: 'b3', b: 'b8' },
      { type: 'resistor', R: 220, a: 'c8', b: 'c13' },
      { type: 'resistor', R: 150, a: 'd3', b: 'd18' },
      { type: 'resistor', R: 330, a: 'e18', b: 'e13' },
      { type: 'wire', a: 'b13', b: 'rt-:10' },
      { type: 'ammeter', a: 'a8', b: 'a18' }]
  },
  {
    id: 'series-bulb', name: '전구 직렬 연결 (어두워짐)', V: 6,
    note: '전구 2개를 직렬로 연결하면 전압이 나뉘어 각각 3 V씩 걸려 어두워집니다. 한 개를 빼면 회로가 끊겨 다른 전구도 꺼져요.',
    parts: [
      { type: 'wire', a: 'rt+:2', b: 'a3' },
      { type: 'bulb', R: 20, a: 'b3', b: 'b8' },
      { type: 'bulb', R: 20, a: 'd8', b: 'd13' },
      { type: 'wire', a: 'a13', b: 'rt-:10' }]
  },
  {
    id: 'parallel-bulb', name: '전구 병렬 연결 (밝기 유지)', V: 6,
    note: '전구 2개를 병렬로 연결하면 각각 6 V가 걸려 밝기가 그대로예요. 대신 전원에서 나오는 전류는 두 배가 됩니다.',
    parts: [
      { type: 'wire', a: 'rt+:3', b: 'a5' },
      { type: 'bulb', R: 20, a: 'b5', b: 'b11' },
      { type: 'bulb', R: 20, a: 'd5', b: 'd11' },
      { type: 'wire', a: 'a11', b: 'rt-:8' }]
  },
  {
    id: 'ammeter', name: '전류계 연결 (직렬로 끼우기)', V: 5,
    note: '전류계는 회로에 직렬로 끼워서 측정해요. 전류계를 전원 양끝에 병렬로 연결하면 합선(단락)이 됩니다.',
    parts: [
      { type: 'wire', a: 'rt+:1', b: 'a2' },
      { type: 'ammeter', a: 'b2', b: 'b6' },
      { type: 'resistor', R: 100, a: 'c6', b: 'c11' },
      { type: 'wire', a: 'a11', b: 'rt-:9' }]
  },
  {
    id: 'led-burn', name: '저항 없는 LED (고장 체험)', V: 5,
    note: 'LED에는 저항이 필요해요. 저항 없이 연결하면 과전류로 LED가 타 버립니다. 고장난 부품은 선택해서 교체할 수 있어요.',
    parts: [
      { type: 'wire', a: 'rt+:1', b: 'a2' },
      { type: 'led', color: 'red', a: 'b2', b: 'b6' },
      { type: 'wire', a: 'a6', b: 'rt-:6' }]
  },
  {
    id: 'mixed5', name: '저항 5개 혼합 회로 (R1+R5 직렬, R2 ∥ R3+R4)', V: 35,
    note: 'R1(120 Ω)과 R5(180 Ω)는 직렬이고, 그 사이에서 R2(1 kΩ)가 R3+R4(100+150=250 Ω) 직렬 묶음과 병렬을 이룹니다. 병렬 부분의 합성 저항은 (1000×250)/(1000+250) = 200 Ω이라, 전체 저항은 120+200+180 = 500 Ω, 전체 전류는 35 V ÷ 500 Ω = 70 mA예요.',
    parts: [
      { type: 'wire', a: 'rt+:1', b: 'a2' },
      { type: 'resistor', R: 120, a: 'b2', b: 'b7' },
      { type: 'resistor', R: 1000, a: 'c7', b: 'c12' },
      { type: 'resistor', R: 100, a: 'd7', b: 'd16' },
      { type: 'resistor', R: 150, a: 'e16', b: 'e12' },
      { type: 'resistor', R: 180, a: 'a12', b: 'a21' },
      { type: 'wire', a: 'a21', b: 'rt-:18' }]
  }
];
