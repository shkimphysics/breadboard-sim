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
- 건전지/내부저항, 가변저항, 커패시터, 학습지용 PNG 내보내기.

## 완료된 기능
- 회로 저장·불러오기(JSON): 위쪽 "회로 저장" 버튼이 현재 부품·전원전압을 `.json` 파일로 내려받고, "회로 불러오기" 버튼이 그 파일을 읽어 복원한다. `template.html`의 `exportCircuit`/`importCircuit` 참고.
