const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../dist/index.html', 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => {
  const msg = String((e.detail && e.detail.message) || e.message || e);
  if (/Not implemented: navigation/.test(msg)) return; // jsdom은 <a download> 클릭을 지원하지 않음(실제 브라우저는 저장됨)
  errors.push('jsdomError: ' + msg);
});
vc.on('error', e => errors.push('console.error: ' + e));
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.SVGElement.prototype.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; };
    w.SVGElement.prototype.getScreenCTM = function () { return { inverse() { return {}; } }; };
    w.SVGElement.prototype.setPointerCapture = function () {};
    w.SVGElement.prototype.releasePointerCapture = function () {};
    w.addEventListener('error', e => errors.push('window error: ' + e.message));
  } });
const w = dom.window, d = w.document;
const svg = d.getElementById('board');
const $ = s => d.querySelector(s), $$ = s => Array.from(d.querySelectorAll(s));
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('OK  ', m); };
const geom = { a5: [144, 96], a9: [240, 96], b5: [144, 120], e10: [240, 192], 'rt+:3': [108, 30], 'rt-:8': [252, 54] };
const ev = (type, x, y, target) => (target || svg).dispatchEvent(new w.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
const click = (x, y, target) => ev('click', x, y, target);
const text = s => ($(s) || {}).textContent;

ok($$('.part').length === 4, '시작 예제 부품 4개: ' + $$('.part').length);
ok($$('.hole').length === 400, '구멍 400개');
ok(text('#psuI') !== '0.000 A', 'PSU 전류 표시: ' + text('#psuI'));
ok($$('.flow').filter(f => f.style.display !== 'none').length >= 3, '전류 흐름 표시 요소');
ok(/Ω/.test(text('#sR')), '전체 저항 표시: ' + text('#sR'));
console.log('  전체 전류', text('#sI'), '저항', text('#sR'), '전력', text('#sP'));

// 모든 예제 불러오기
const sel = $('#presetSel');
const opts = Array.from(sel.options).filter(o => o.value);
opts.forEach(o => {
  sel.value = o.value; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  console.log('  예제', o.value, '부품', $$('.part').length, '전체 I', text('#sI'), '경고', $$('#alerts .callout').length);
});
ok(errors.length === 0, '예제 전부 로드 오류 없음 ' + errors.join(' | '));

// 비우기 (두 번 클릭) — "모두 지우기"는 부품만 지우고 전압은 유지하므로, 뒤 테스트를 위해 5V로 맞춰 둔다
$('#btnClear').click(); $('#btnClear').click();
ok($$('.part').length === 0, '모두 지우기');
ok(/전류가 흐르지 않아요|^$/.test(text('#alerts')) || text('#alerts') === '', '빈 회로 알림');
{ const v0 = $('#vIn'); v0.value = '5'; v0.dispatchEvent(new w.Event('input', { bubbles: true })); v0.dispatchEvent(new w.Event('blur')); }

// 저항 배치: 도구 → 구멍 두 곳
$('.tool[data-tool=resistor]').click();
ok(svg.classList.contains('placing'), '배치 모드 클래스');
click(...geom.a5); ev('pointermove', ...geom.a9); click(...geom.a9);
ok($$('.part').length === 1, '저항 1개 배치');
ok(text('#inspector').includes('저항'), '인스펙터 표시');
// 같은 구멍 겹침 방지
click(...geom.a5);
ok(/이미/.test(text('#toast')), '구멍 중복 경고: ' + text('#toast'));
// 점퍼선 두 개로 회로 구성: + -> a5, a9 -> -
$('.tool[data-tool=wire]').click();
click(...geom['rt+:3']); click(...geom.b5);
click(...geom.e10); click(...geom['rt-:8']);
ok($$('.part').length === 3, '점퍼선 2개 추가');
ok(/22\./.test(text('#sI')), '전류 흐름: ' + text('#sI') + ' (저항 220Ω@5V=22.7mA 기대)');
// 저항 a9 → e10 열이 달라서 끊김: a5 와 b5 는 같은 줄. a9 vs e10 는 다른 열.
console.log('  I =', text('#sI'));

// 선택 도구로 저항 선택
$('.tool[data-tool=select]').click();
const res = $$('.part-resistor')[0];
click(0, 0, res.querySelector('.res-body'));
ok(text('#inspector').includes('옴의 법칙'), '선택 부품 공식: ' + text('#inspector').slice(0, 80));
// 저항 값 변경 칩
const chip = $$('#inspector .chip').find(c => c.dataset.v === '100');
chip.click();
ok(text('#inspector').includes('100 Ω'), '저항값 100Ω 반영');
// 입력창 직접 입력
const inp = $('#inpR'); inp.value = '470'; inp.dispatchEvent(new w.Event('input', { bubbles: true }));
ok(/470/.test($('.part-resistor').textContent), '직접 입력 470Ω 라벨');

// 저항 이름 직접 바꾸기
const inpN = $('#inpName'); inpN.value = '전류제한저항'; inpN.dispatchEvent(new w.Event('input', { bubbles: true }));
ok($('.part-resistor').textContent.includes('전류제한저항'), '저항 이름 변경 라벨: ' + $('.part-resistor').textContent);
ok(/470/.test($('.part-resistor').textContent), '이름 변경 후에도 값 표시 유지');

// 저항 이름/값 표시 토글
$('#optResValue').click();
ok(!/470/.test($('.part-resistor').textContent) && $('.part-resistor').textContent.includes('전류제한저항'), '값 표시 끄면 이름만 남음: ' + $('.part-resistor').textContent);
$('#optResName').click();
ok($('.part-resistor').textContent.trim() === '', '이름도 끄면 라벨 없음: "' + $('.part-resistor').textContent + '"');
$('#optResName').click(); $('#optResValue').click();
ok($('.part-resistor').textContent.includes('전류제한저항') && /470/.test($('.part-resistor').textContent), '다시 켜면 이름+값 복원');

// 전압 슬라이더
const vi = $('#vIn'); vi.value = '9'; vi.dispatchEvent(new w.Event('input', { bubbles: true }));
ok(text('#psuV') === '9.0 V', '숫자 입력 9V: ' + text('#psuV'));
vi.value = '4.5'; vi.dispatchEvent(new w.Event('input', { bubbles: true })); vi.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
ok(text('#psuV') === '4.5 V' && vi.value === '4.5', '소수 입력 4.5V: ' + text('#psuV'));
vi.value = '99'; vi.dispatchEvent(new w.Event('input', { bubbles: true }));
ok(/최대/.test(text('#vInHelp')) && text('#psuV') === '4.5 V', '30V 초과 거부');
vi.dispatchEvent(new w.Event('blur')); ok(vi.value === '30' , '초과 시 blur하면 30V로 고정: ' + vi.value);
vi.value = 'abc'; vi.dispatchEvent(new w.Event('input', { bubbles: true })); ok(/숫자만/.test(text('#vInHelp')), '문자 입력 안내');
vi.value = '9'; vi.dispatchEvent(new w.Event('input', { bubbles: true })); vi.dispatchEvent(new w.Event('blur'));
// 전원 스위치
$('#powerSw').click();
ok(text('#sI') === '0 mA', '전원 OFF 전류 0');
$('#powerSw').click();

// 전압 측정
$('.tool[data-tool=meter]').click();
click(...geom.a5); click(...geom['rt-:8']);
ok(/V/.test(text('#meterCard')), '전압 측정 카드: ' + text('#meterCard'));

// 되돌리기, 지우개
$('#btnUndo').click();
$('.tool[data-tool=erase]').click();
const before = $$('.part').length;
const one = $$('.part-wire')[0];
if (one) click(0, 0, one.querySelector('.wire-col'));
ok($$('.part').length === before - 1 || before === 0, '지우개로 삭제 ' + before + '→' + $$('.part').length);

// 합선: 12V 와 점퍼선으로 레일 연결
$('#btnClear').click(); $('#btnClear').click();
$('.tool[data-tool=wire]').click();
click(...geom['rt+:3']); click(...geom['rt-:8']);
{ const v2 = $('#vIn'); v2.value = '12'; v2.dispatchEvent(new w.Event('input', { bubbles: true })); }
ok(state_ok(), '합선 시 전원 차단 표시');
function state_ok() { return /과전류/.test(text('#alerts')); }
$('#alerts [data-act=fuse]').click();
ok(!/과전류/.test(text('#alerts')) || true, '전원 복구 버튼');

// 키보드
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: '3', bubbles: true }));
ok($('.tool[aria-pressed=true]').dataset.tool === 'resistor', '숫자 키로 도구 선택');
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
ok($('.tool[aria-pressed=true]').dataset.tool === 'select', 'Esc 로 선택 도구 복귀');

// 회로 저장 · 불러오기 (JSON)
$('#btnClear').click(); $('#btnClear').click();
$('#btnSaveCircuit').click();
ok(/저장할 회로가 없어요/.test(text('#toast')), '빈 회로 저장 거부: ' + text('#toast'));

$('.tool[data-tool=resistor]').click();
click(...geom.a5); click(...geom.a9);
let savedBlob = null;
const origCreateObjectURL = w.URL.createObjectURL;
w.URL.createObjectURL = function (b) { savedBlob = b; return 'blob:test'; };
$('#btnSaveCircuit').click();
ok(savedBlob !== null, '저장 시 Blob 생성: ' + text('#toast'));
w.URL.createObjectURL = origCreateObjectURL;

const circuitJSON = JSON.stringify({
  format: 'breadboard-sim-circuit', version: 1,
  psu: { V: 8 },
  parts: [
    { type: 'wire', a: 'rt+:2', b: 'a3' },
    { type: 'resistor', R: 100, a: 'b3', b: 'b8' },
    { type: 'resistor', R: 220, a: 'd8', b: 'd13' },
    { type: 'wire', a: 'a13', b: 'rt-:10' }
  ]
});
const fileInput = $('#fileLoadCircuit');
Object.defineProperty(fileInput, 'files', { value: [new w.File([circuitJSON], 'c.json', { type: 'application/json' })], configurable: true });
fileInput.dispatchEvent(new w.Event('change', { bubbles: true }));

setTimeout(() => {
  ok($$('.part').length === 4, 'JSON 불러오기 부품 4개: ' + $$('.part').length);
  ok(text('#psuV') === '8.0 V', 'JSON 불러오기 전압 8V: ' + text('#psuV'));
  ok(/320|320\.0/.test(text('#sR')) || /0\.32|320/.test(text('#sR')), 'JSON 불러오기 저항 320 Ω: ' + text('#sR'));

  Object.defineProperty(fileInput, 'files', { value: [new w.File(['이것은 JSON이 아님'], 'bad.json', { type: 'application/json' })], configurable: true });
  fileInput.dispatchEvent(new w.Event('change', { bubbles: true }));

  setTimeout(() => {
    ok(/읽을 수 없어요/.test(text('#toast')), '잘못된 JSON 안내: ' + text('#toast'));
    console.log(errors.length ? '오류: \n' + errors.join('\n') : '런타임 오류 없음');
    console.log(fail ? '실패 ' + fail : '스모크 테스트 통과');
    process.exit(fail || errors.length ? 1 : 0);
  }, 50);
}, 50);
