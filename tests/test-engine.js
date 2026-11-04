const fs = require('fs');
const dir = __dirname + '/../src/';
const code = fs.readFileSync(dir + 'engine.js', 'utf8');
const api = new Function(code + '\nreturn {buildGeometry,simulate,solveCircuit,solveCircuitAC,solveCircuitTransient,PRESETS,fmtR,fmtV,fmtI,fmtP,resistorBands,cabs,cphase};')();
const G = api.buildGeometry();

function load(preset, over) {
  let n = 1;
  const parts = preset.parts.map(p => Object.assign({ id: 'p' + (n++), burnt: false }, p));
  return { parts, psu: { on: true, V: (over && over.V) || preset.V, fuse: false, mode: preset.mode || 'dc', freq: preset.freq || 1000 } };
}
function run(id, over) {
  const preset = api.PRESETS.find(p => p.id === id);
  const c = load(preset, over);
  const t0 = Date.now();
  const { res, events } = api.simulate(c.parts, c.psu, G, { faults: true });
  const ms = Date.now() - t0;
  return { c, res, events, ms };
}
let fail = 0;
function check(name, val, lo, hi) {
  const ok = val >= lo && val <= hi;
  if (!ok) fail++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + ' = ' + val.toPrecision(5) + ' (기대 ' + lo + '~' + hi + ')');
}

// 홀 개수 확인
console.log('구멍 수', G.list.length, '(기대 400)');

let r = run('led');
console.log('LED', r.res.parts.p3, 'iters', r.res.iters, r.ms + 'ms');
check('LED 회로 전류(A)', r.res.parts.p3.i, 0.012, 0.015);
check('LED 순방향 전압', r.res.parts.p3.v, 1.8, 2.0);
check('저항 전압 + LED 전압 = 5', r.res.parts.p2.v + r.res.parts.p3.v, 4.98, 5.0);

r = run('led-rev');
check('LED 역방향 전류', Math.abs(r.res.parts.p3.i), 0, 1e-8);

r = run('switch');
check('스위치 닫힘 전류', r.res.parts.p4.i, 0.01, 0.02);
r.c.parts[1].closed = false;
let r2 = api.simulate(r.c.parts, r.c.psu, G, { faults: true });
check('스위치 열림 전류', Math.abs(r2.res.parts.p4.i), 0, 1e-8);

r = run('series-r');
check('직렬 전류', r.res.parts.p2.i, 6 / 320 * 0.999, 6 / 320 * 1.001);
check('직렬 R2 전압', r.res.parts.p3.v, 6 * 220 / 320 * 0.998, 6 * 220 / 320 * 1.001);

r = run('parallel-r');
check('병렬 R1 전류', r.res.parts.p2.i, 0.0599, 0.0601);
check('병렬 R2 전류', r.res.parts.p3.i, 6 / 220 * 0.998, 6 / 220 * 1.001);
check('병렬 공급 전류', r.res.supply.I, 6 / 100 + 6 / 220 - 1e-4, 6 / 100 + 6 / 220 + 1e-4);

r = run('mixed');
check('혼합 전체 전류', r.res.supply.I, 6 / 232 * 0.998, 6 / 232 * 1.001);

r = run('series-bulb');
check('직렬 전구 전류', r.res.parts.p2.i, 0.149, 0.151);
check('직렬 전구 전압', r.res.parts.p2.v, 2.98, 3.02);

r = run('parallel-bulb');
check('병렬 전구 전압', r.res.parts.p2.v, 5.98, 6.0);
check('병렬 전구 공급 전류', r.res.supply.I, 0.595, 0.601);

r = run('ammeter');
check('전류계 값', r.res.parts.p2.i, 0.0498, 0.0501);

r = run('mixed5');
check('혼합5 전체 전류', r.res.supply.I, 0.07 * 0.998, 0.07 * 1.002);
check('혼합5 R1 전류(직렬, 전체와 동일)', r.res.parts.p2.i, 0.07 * 0.998, 0.07 * 1.002);
check('혼합5 R2 전류(병렬 1kΩ 쪽)', r.res.parts.p3.i, 0.014 * 0.99, 0.014 * 1.01);
check('혼합5 R3 전류(병렬 100+150Ω 쪽)', r.res.parts.p4.i, 0.056 * 0.99, 0.056 * 1.01);
check('혼합5 R5 전류(직렬, 전체와 동일)', r.res.parts.p6.i, 0.07 * 0.998, 0.07 * 1.002);

r = run('rc-rl-dc');
check('RC가지 전류(직류=0)', Math.abs(r.res.parts.p2.i), 0, 1e-8);
check('축전기 전류(직류=0)', Math.abs(r.res.parts.p3.i), 0, 1e-8);
check('축전기 전압(전원전압 다 걸림)', r.res.parts.p3.v, 9.98, 10.0);
check('RL가지 전류(=V/R=10mA)', r.res.parts.p6.i, 0.01 * 0.99, 0.01 * 1.01);
check('인덕터 전류(R2와 동일)', r.res.parts.p7.i, 0.01 * 0.99, 0.01 * 1.01);
check('인덕터 전압(도선처럼 거의 0)', Math.abs(r.res.parts.p7.v), 0, 1e-3);

r = run('led-burn');
console.log('LED 고장 이벤트', r.events.map(e => e.type), 'burnt=', r.c.parts[1].burnt, 'fuse=', r.c.psu.fuse);
if (!r.c.parts[1].burnt) fail++;
check('고장 후 전류', Math.abs(r.res.parts.p2.i), 0, 1e-9);

// 합선
{
  const c = { parts: [{ id: 's', type: 'wire', a: 'rt+:1', b: 'rt-:1' }], psu: { on: true, V: 12, fuse: false } };
  const out = api.simulate(c.parts, c.psu, G, { faults: true });
  console.log('합선 이벤트', out.events.map(e => e.type), 'fuse', c.psu.fuse, 'I', out.res.supply.I);
  if (!c.psu.fuse) fail++;
}
// 12V 전구 1개 => 고장
{
  const c = { parts: [{ id: 'b', type: 'bulb', R: 20, a: 'rt+:1', b: 'rt-:1' }], psu: { on: true, V: 12, fuse: false } };
  const out = api.simulate(c.parts, c.psu, G, { faults: true });
  console.log('전구 12V 이벤트', out.events.map(e => e.type), c.parts[0].burnt);
  if (!c.parts[0].burnt) fail++;
}
// 파란 LED 12V + 1k
{
  const c = { parts: [{ id: 'r', type: 'resistor', R: 1000, a: 'rt+:1', b: 'a5' }, { id: 'l', type: 'led', color: 'blue', a: 'b5', b: 'rt-:2' }], psu: { on: true, V: 12, fuse: false } };
  const out = api.simulate(c.parts, c.psu, G, { faults: true });
  check('파란 LED 전류(12V,1k)', out.res.parts.l.i, 0.008, 0.0095);
  check('파란 LED 전압', out.res.parts.l.v, 2.9, 3.1);
  console.log('수렴', out.res.converged, out.res.iters);
}
// 전원 끔
{
  const c = load(api.PRESETS[0]); c.psu.on = false;
  const out = api.simulate(c.parts, c.psu, G, { faults: true });
  check('전원 끔 전류', Math.abs(out.res.parts.p2.i), 0, 1e-9);
}
// 저항 양다리 같은 줄
{
  const c = { parts: [{ id: 'r', type: 'resistor', R: 100, a: 'a5', b: 'e5' }], psu: { on: true, V: 5, fuse: false } };
  const out = api.simulate(c.parts, c.psu, G, { faults: true });
  console.log('같은 줄', out.res.parts.r);
}
// ===== 교류(위상자) 해석 =====
// 직렬 RC: R=1kΩ, C=1µF, f=1000Hz, V진폭=10V → |Z|=1012.6Ω, I≈9.88mA, 전류가 전압보다 약 9.0° 앞섬(용량성)
{
  const parts = [{ id: 'r', type: 'resistor', R: 1000, a: 'rt+:1', b: 'a5' }, { id: 'c', type: 'capacitor', C: 1e-6, a: 'a5', b: 'rt-:1' }];
  const psu = { on: true, V: 10, fuse: false, mode: 'ac', freq: 1000 };
  const out = api.solveCircuitAC(parts, psu, G, 1000);
  const amp = api.cabs(out.parts.r.i), ph = api.cphase(out.parts.r.i) * 180 / Math.PI;
  check('RC 직렬 전류 진폭(mA)', amp * 1000, 9.7, 10.0);
  check('RC 직렬 전류 위상(전류가 앞섬, deg)', ph, 8.5, 9.5);
}
// 직렬 RL: R=100Ω, L=10mH, f=1000Hz, V진폭=5V → |Z|=118.1Ω, I≈42.3mA, 전류가 전압보다 약 32.1° 뒤짐(유도성)
{
  const parts = [{ id: 'r', type: 'resistor', R: 100, a: 'rt+:1', b: 'a5' }, { id: 'l', type: 'inductor', L: 10e-3, a: 'a5', b: 'rt-:1' }];
  const psu = { on: true, V: 5, fuse: false, mode: 'ac', freq: 1000 };
  const out = api.solveCircuitAC(parts, psu, G, 1000);
  const amp = api.cabs(out.parts.r.i), ph = api.cphase(out.parts.r.i) * 180 / Math.PI;
  check('RL 직렬 전류 진폭(mA)', amp * 1000, 42.0, 42.6);
  check('RL 직렬 전류 위상(전류가 뒤짐, deg)', ph, -32.5, -31.7);
}
// 순수 저항 회로: DC 솔버와 AC 솔버 결과가 크기는 같고 위상은 0°여야 함(가장 저렴하고 강력한 회귀 검증)
{
  const parts = [{ id: 'r', type: 'resistor', R: 220, a: 'rt+:1', b: 'a5' }, { id: 'w', type: 'wire', a: 'a5', b: 'rt-:1' }];
  const dc = api.solveCircuit(parts, { on: true, V: 5, fuse: false }, G);
  const ac = api.solveCircuitAC(parts, { on: true, V: 5, fuse: false, mode: 'ac', freq: 1000 }, G, 1000);
  check('순수 저항: AC/DC 전류 크기 일치', api.cabs(ac.parts.r.i), dc.parts.r.i * 0.999, dc.parts.r.i * 1.001);
  check('순수 저항: AC 위상 0°', api.cphase(ac.parts.r.i) * 180 / Math.PI, -0.01, 0.01);
}
// LED는 교류에서 지원하지 않음(비선형) → 전류 0, unsupported 플래그
{
  const parts = [{ id: 'r', type: 'resistor', R: 220, a: 'rt+:1', b: 'a5' }, { id: 'l', type: 'led', color: 'red', a: 'a5', b: 'rt-:1' }];
  const out = api.solveCircuitAC(parts, { on: true, V: 5, fuse: false, mode: 'ac', freq: 1000 }, G, 1000);
  if (!out.parts.l.unsupported) fail++;
  check('LED 교류 전류=0', api.cabs(out.parts.l.i), 0, 1e-9);
  console.log('LED AC unsupported=', out.parts.l.unsupported);
}

// 교류 RC 저역통과 필터 예제(오실로스코프 연결 포함)
r = run('ac-rc-scope');
check('AC RC 필터 전류 진폭(mA)', api.cabs(r.res.parts.p2.i) * 1000, 5.2, 5.4);
check('AC RC 필터 출력(축전기) 전압 진폭(V)', api.cabs(r.res.parts.p3.v), 8.3, 8.6);
check('AC RC 필터 출력 위상 지연(deg)', api.cphase(r.res.parts.p3.v) * 180 / Math.PI, -32.5, -31.8);

// ===== 과도상태(충전·방전 곡선) =====
function nearestIdx(tArr, target) { let bi = 0, bd = Infinity; for (let i = 0; i < tArr.length; i++) { const d = Math.abs(tArr[i] - target); if (d < bd) { bd = d; bi = i; } } return bi; }
// 학생이 질문한 바로 그 회로: R=10kΩ, C=1mF, V=10V → τ=RC=10s
{
  const parts = [{ id: 'w', type: 'wire', a: 'rt+:1', b: 'a5' }, { id: 'r', type: 'resistor', R: 10000, a: 'a5', b: 'a9' }, { id: 'c', type: 'capacitor', C: 1e-3, a: 'a9', b: 'rt-:1' }];
  const psu = { on: true, V: 10, fuse: false, mode: 'dc' };
  const out = api.solveCircuitTransient(parts, psu, G);
  const tau = 10000 * 1e-3, i0 = 10 / 10000;
  const i1 = nearestIdx(out.t, tau), i5 = nearestIdx(out.t, 5 * tau);
  check('RC 충전(t≈τ) 전류 비율(기대 0.368)', out.parts.r.i[i1] / i0, 0.35, 0.38);
  check('RC 충전(t≈τ) 축전기전압 비율(기대 0.632)', out.parts.c.v[i1] / 10, 0.61, 0.66);
  check('RC 충전(t≈5τ) 전류 비율(기대 ~0)', Math.abs(out.parts.r.i[i5] / i0), 0, 0.01);
  check('RC 충전(t≈5τ) 축전기전압 비율(기대 ~1)', out.parts.c.v[i5] / 10, 0.98, 1.01);
  if (!out.converged) fail++;
  check('RC 관찰시간(5τ~60τ 사이)', out.duration, 5 * tau, 60 * tau);
}
// RL: R=100Ω, L=1H, V=5V → τ=L/R=10ms
{
  const parts = [{ id: 'w', type: 'wire', a: 'rt+:1', b: 'a5' }, { id: 'r', type: 'resistor', R: 100, a: 'a5', b: 'a9' }, { id: 'l', type: 'inductor', L: 1, a: 'a9', b: 'rt-:1' }];
  const psu = { on: true, V: 5, fuse: false, mode: 'dc' };
  const out = api.solveCircuitTransient(parts, psu, G);
  const tau = 1 / 100, iFinal = 5 / 100;
  const i1 = nearestIdx(out.t, tau), i5 = nearestIdx(out.t, 5 * tau);
  check('RL 충전(t≈τ) 인덕터전류 비율(기대 0.632)', out.parts.l.i[i1] / iFinal, 0.60, 0.66);
  check('RL 충전(t≈5τ) 인덕터전류 비율(기대 ~1)', out.parts.l.i[i5] / iFinal, 0.98, 1.01);
  if (!out.converged) fail++;
}
// rc-rl-dc 예제 전체: 서로 다른 시정수를 가진 두 가지가 섞여도 각자 수렴하는지(일반 스테퍼의 핵심 근거)
{
  const pr = api.PRESETS.find(p => p.id === 'rc-rl-dc');
  const parts = pr.parts.map((d, i) => Object.assign({ id: 'p' + (i + 1), burnt: false }, d));
  const psu = { on: true, V: pr.V, fuse: false, mode: 'dc' };
  const out = api.solveCircuitTransient(parts, psu, G);
  if (!out.converged) fail++;
  check('rc-rl-dc 과도상태 최종 전류 R1가지(기대≈0, 초기 10mA 대비 2% 수렴오차 이내)', Math.abs(out.parts.p2.i[out.parts.p2.i.length - 1]), 0, 2e-4);
  check('rc-rl-dc 과도상태 최종 전류 R2가지(기대≈10mA)', out.parts.p6.i[out.parts.p6.i.length - 1], 0.0098, 0.0101);
  console.log('rc-rl-dc 과도상태 duration', out.duration, 'doublings', out.doublings);
}

console.log(api.fmtR(4700), api.fmtR(220), api.fmtR(1e6), api.fmtI(0.0214), api.fmtI(0.5), api.fmtI(2e-5), api.fmtP(0.0456));
console.log('띠 220', api.resistorBands(220), '띠 4.7k', api.resistorBands(4700), '띠 1k', api.resistorBands(1000), '띠 4.7', api.resistorBands(4.7));
console.log(fail ? ('실패 ' + fail) : '모든 검증 통과');
process.exit(fail ? 1 : 0);
