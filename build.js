// src/template.html 의 /*ENGINE*/ 자리에 src/engine.js 를 끼워 dist/index.html 한 파일로 만든다.
const fs = require('fs'), path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'src/template.html'), 'utf8');
const e = fs.readFileSync(path.join(__dirname, 'src/engine.js'), 'utf8');
if (!t.includes('/*ENGINE*/')) throw new Error('/*ENGINE*/ 표시를 찾지 못했어요');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), t.replace('/*ENGINE*/', e));
const js = fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
new Function(js); // 문법 검사
console.log('dist/index.html 생성 완료');
