const fs = require('fs');
const dir = __dirname + '/../src/';
const code = fs.readFileSync(dir + 'engine.js', 'utf8');
const api = new Function(code + '\nreturn {buildGeometry,simulate,solveCircuit,PRESETS,fmtR,fmtV,fmtI,fmtP,resistorBands};')();
const G = api.buildGeometry();

function load(preset, over) {
  let n = 1;
  const parts = preset.parts.map(p => Object.assign({ id: 'p' + (n++), burnt: false }, p));
  return { parts, psu: { on: true, V: (over && over.V) || preset.V, fuse: false } };
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
console.log(api.fmtR(4700), api.fmtR(220), api.fmtR(1e6), api.fmtI(0.0214), api.fmtI(0.5), api.fmtI(2e-5), api.fmtP(0.0456));
console.log('띠 220', api.resistorBands(220), '띠 4.7k', api.resistorBands(4700), '띠 1k', api.resistorBands(1000), '띠 4.7', api.resistorBands(4.7));
console.log(fail ? ('실패 ' + fail) : '모든 검증 통과');
process.exit(fail ? 1 : 0);
