# 브레드보드 시뮬레이터

통합과학2 수업에서 전기 회로를 설명하기 위한 브레드보드 시뮬레이터. 결과물은 외부 파일 없는 단일 HTML(`dist/index.html`)이고, 한국어 UI다.

## 구조
- `src/engine.js`: DOM 없는 회로 해석 엔진. 브레드보드 구멍/연결(net), 수정 절점 해석(MNA), LED 다이오드 뉴턴 반복(pnjlim), 고장(LED 과전류, 전구 과전압, 퓨즈) 처리, 값 표시 함수(fmtR/fmtV/fmtI/fmtP), 저항 색띠, `PRESETS`(예제 회로 목록).
- `src/template.html`: 스타일, 마크업, 화면 코드. `/*ENGINE*/` 자리에 engine.js가 들어간다.
- `build.js`: 둘을 합쳐 `dist/index.html` 생성.
- `tests/test-engine.js`: 엔진 검증(이론값 비교). `tests/smoke.js`: jsdom으로 UI 클릭 흐름 점검.

## 작업 규칙
- 수정은 `src/`에서 하고, 끝나면 `npm test`로 빌드와 테스트를 돌린다. `dist/`는 직접 고치지 않는다.
- 새 예제 회로는 `PRESETS`에 추가하고 `tests/test-engine.js`에 이론값 검증을 넣는다.
- 구멍 ID: 본판 `a1`~`j30`(위쪽 a~e, 아래쪽 f~j, 같은 번호 세로 5칸이 한 줄), 전원 레일 `rt+:1`~`25`, `rt-`, `rb-`, `rb+`. 위쪽 두 레일만 전원장치에 연결, 접지는 `RT-`.
- 색은 CSS 변수 토큰으로만 쓰고, 라이트/다크 테마를 모두 지원한다.
- 외부 의존성 없이 단일 HTML로 유지한다(폰트만 Google Fonts).
- 전원장치 전압은 숫자 직접 입력(0~30 V, `V_MAX`).
- 화면 문구는 한국어, 수업에서 쓰는 용어(전압, 전류, 저항, 직렬, 병렬)를 쓴다.

## 아이디어
- 건전지/내부저항, 가변저항, 학습지용 PNG 내보내기.

## 진행 중인 작업
교류(AC) 회로 + 오실로스코프(1~3단계) + 과도상태(충전·방전 곡선) 모두 끝났다(아래 "완료된 기능"
참고, 계획 파일 `C:\Users\USER\.claude\plans\moonlit-mapping-flurry.md`). 남은 건 선택 사항뿐:
교류 예제 회로 추가, 오실로스코프 위상차 점선 눈금 — 당장 급하지 않다.

## 완료된 기능
- 회로 저장·불러오기(JSON): 위쪽 "회로 저장" 버튼이 현재 부품·전원전압을 `.json` 파일로 내려받고, "회로 불러오기" 버튼이 그 파일을 읽어 복원한다. `template.html`의 `exportCircuit`/`importCircuit` 참고. 휴대폰·태블릿(특히 iOS Safari)은 `<a download>`로 blob을 제대로 저장하지 못하고 새 탭에 텍스트로 열어버리는 경우가 많아, `navigator.canShare({files})`를 지원하면 공유 시트(파일로 저장·카카오톡 전송 등)를 우선 쓰고, 지원 안 하는 환경(대부분의 데스크톱)에서는 기존 다운로드 방식으로 자동 전환한다. "회로 저장" 버튼 옆 `#circuitNameInput`에 이름을 적으면 그 이름이 파일명(특수문자는 제거)과 JSON의 `name` 필드에 들어가고, 그 파일을 다시 불러오거나 예제를 불러오면 이름이 입력란에 복원된다(모두 지우기 시에는 비워짐) — 교사가 변형 회로를 구분해서 배포·회수할 때 쓰기 좋음.
- 부품 이름 직접 수정 + 이름/값 표시 토글: 저항·축전기·인덕터를 선택하면 인스펙터에 "이름" 입력란이 나와 자유롭게 바꿀 수 있다(`#inpName`, 부품 종류 공용). 왼쪽 "표시" 패널의 "부품 이름 표시"/"부품 값 표시" 토글로 보드 위 라벨 구성을 바꿀 수 있다(`state.settings.resName`/`resValue`, 저항에서 시작했지만 이름은 부품 공통으로 일반화됨).
- 인덕터·축전기(직류 전용): 축전기는 완전히 충전되면 개방회로(전류 0), 인덕터는 저항이 거의 없는 도선처럼 동작한다(`engine.js`의 `solveCircuit` 내 `capacitor`/`inductor` 분기). 값은 내부적으로 패럿(F)/헨리(H)로 저장하고 화면은 µF/mH로 보여준다(`fmtC`/`fmtL`). 예제 `rc-rl-dc`에서 두 가지를 나란히 비교할 수 있다.
- 교류(AC) 전원 + 위상자 솔버: 전원장치 패널에서 직류/교류를 전환하고(`state.psu.mode`), 교류일 때는 진폭(`#vIn`)·주파수(`#fIn`, 1~20000 Hz)를 입력한다. `engine.js`의 `solveCircuitAC`가 복소수 MNA로 정상상태 위상자를 1회 선형 계산한다(`cx/cadd/csub/cmul/cdiv/cabs/cphase`, `solveLinearComplex`는 `solveLinear`를 그대로 복소수로 미러링). 인스펙터에 진폭·위상차(φ)가 표시되고, 축전기/인덕터는 Xc=1/ωC·XL=ωL 설명도 보여준다. LED는 비선형이라 교류에서 지원하지 않음(인스펙터·알림에 안내, `unsupported` 플래그). 고장 시뮬레이션은 교류에서 전부 건너뜀(토글 비활성화).
- 오실로스코프: 새 `scope` 도구로 구멍 두 곳(CH1 주황·CH2 청록)을 클릭하면 각각 접지(RT-) 기준 전압 파형을 그린다(두 채널이 같은 시간축을 공유해야 위상차가 바로 보임). `updateScope()`가 매 새로고침마다 `<canvas id="scopeCanvas">`에 격자 + 분석적 사인파(`v(t)=|V|cos(ωt+phase(V))`, 2주기 구간, 자동 y축 스케일)를 정적으로 다시 그린다 — requestAnimationFrame 애니메이션 없음(안정된 주기 신호라 매번 같은 모양이라 정적 스냅샷으로 충분). 범례에 각 채널 진폭과 위상차(φ, `phaseDiffDeg`)를 보여준다. 직류 모드에서는 안내 문구만 표시. `canvas.getContext('2d')`가 jsdom에서 `null`일 수 있어 `ctx &&` 가드 필수.
- 오실로스코프 기기 모양: 전원장치 박스처럼 보드 SVG 왼쪽 여백에 실제 기기(`<g id="gScope">`, 화면은 `.lcd` 재사용)를 그려 놓았다. 작은 SVG `<path>`(`#scopeMiniCh1`/`#scopeMiniCh2`, 40개 샘플)로 미니 파형을 똑같이 보여주고, `drawOverlay()`가 기기 단자(-42,260 / -42,292)에서 실제 클릭한 구멍까지 색깔 케이블(`.cable-ch1`/`.cable-ch2`)을 베지어 곡선으로 매 새로고침 동적으로 그린다. 사이드 패널의 큰 캔버스(상세 보기)와 보드 위 작은 기기(한눈에 보기)가 같은 데이터를 두 가지 방식으로 보여주는 구조.
- 예제에서 오실로스코프 바로 연결: `PRESETS` 항목에 `scope: { ch1, ch2 }`(구멍 id)를 넣으면 `loadPreset()`이 `ui.scope`를 그 값으로 바로 세팅해, 예제를 불러오자마자 파형이 보인다. `ac-rc-scope` 예제가 그 예(RC 저역통과 필터, CH1=입력, CH2=축전기 양단).
- 과도상태(충전·방전 곡선) + 실시간 반영: `engine.js`의 `solveCircuitTransient`가 후진 오일러(backward Euler) + companion model로 t=0(막 전원을 켠 상태, 축전기 0V·인덕터 0A)부터 DC 정상상태까지 전체 시계열을 한 번에 계산한다. 관찰 시간은 이미 아는 DC 정상상태(`solveCircuit`)를 목표로 삼아 1ms부터 2배씩 자동으로 늘려가며(최대 30회) 스윙의 2% 이내로 수렴할 때까지 찾는다(여러 축전기/인덕터가 섞여도 공유 MNA 행렬에 각자 스탬프만 더하면 되므로 특별 처리 불필요 — `rc-rl-dc`로 교차검증함). LED는 비선형이라 계산에서 제외(수렴 목표도 LED를 뺀 회로로 맞춤). 결과는 `getTransientResult()`가 `transientSig()`(부품 종류·값·꽂힌 위치·전원 상태 해시) 기준으로 캐싱한다(`transientCache`).
  - **인스펙터 그래프**: 축전기·인덕터를 선택하면(직류 모드에서만) 버튼 없이 바로 "충전·방전 곡선"/"전류 변화 곡선"이 뜬다(`updateTransientGraph()`). τ는 공식이 아니라 샘플에서 63.2% 지점을 보간으로 직접 찾아서 표시(다중 시정수 회로에도 안전). 값이 바뀌면 조용히 다시 계산해서 보여준다(숨기지 않음).
  - **메인 화면도 실시간으로 그 과정을 보여줌**(`liveClock`/`applyLiveClock()`): 전에는 메인 전류계·인스펙터 숫자·전류 흐름 애니메이션이 전원을 켜자마자 항상 DC 정상상태(최종값)만 보여줘서, 학생들이 "충전 과정이 안 보인다"(예: R=10kΩ·C=1mF로 τ=10초인 회로를 만들어도 전류가 즉시 0으로 뜸)고 반복해서 헷갈려했다. 지금은 전원이 켜진 뒤 실제로 흐른 시간(`performance.now()` 기준)을 추적해서, 축전기·인덕터가 있는 직류 회로라면 `refresh()`가 `simulate()`로 계산한 정상상태 `sim`을 그 시각에 해당하는 과도상태 샘플 값으로 덮어쓴다(부품별 v/i, 전원 I/V, 절점 전압 `sim.V`까지 전부). `refresh()` 끝에서 동기 호출해 전원 켜자마자 t=0 값부터 보이고, `setInterval(tickLiveClock, 100)`이 100ms마다 갱신해 시간이 흐르는 걸 실제로 보여준다. 다 충전되면(`duration` 경과) 그 회로 서명을 `convergedSig`에 기록하고 멈춘다 — 같은 서명이면 다시 0부터 틀지 않는다(안 그러면 매번 재수렴 직전에 또 새 liveClock을 만들어 영원히 처음부터 다시 충전하는 무한루프가 됨, 실제로 겪은 버그). `transientSig()`는 꽂힌 위치(`p.a`/`p.b`)도 포함해야 한다 — 안 그러면 회로를 다시 배선해도 캐시가 안 바뀌어서 엉뚱한 값을 계속 보여줌.
  - **주의(직접 겪은 실수)**: `solveCircuitTransient`의 각 스텝 결과에 절점 전압(`netV`)을 안 넣었더니, 전위 색상 표시(`updateNets()`가 `net in sim.V` 체크)가 `sim.V`를 못 찾아 "Cannot use 'in' operator ... in undefined"로 전체가 깨졌다 — DC `solveCircuit`의 `out.V`와 똑같이 `idxMap.forEach`로 `netV`를 채워서 `stepOnce`/`runAttempt` 양쪽에서 반환하게 고쳤다(`engine.js`). liveClock이 덮어쓰는 `sim` 객체는 원래 `solveCircuit()` 출력과 **완전히 같은 모양**(parts/supply/V)이어야 기존 렌더 함수들(`updatePSU`/`drawOverlay`/`updateInspectorNumbers`/전위 색상)이 그대로 동작한다.
