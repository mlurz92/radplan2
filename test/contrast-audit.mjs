// WCAG contrast audit — virtual review of text/surface pairs in both themes.
// Composites alpha over the relevant base surface and flags pairs < AA.
function hex(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function over(fg,a,bg){return fg.map((c,i)=>Math.round(c*a+bg[i]*(1-a)));}
function lum(rgb){const f=rgb.map(c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);});return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2];}
function ratio(a,b){const l1=lum(a),l2=lum(b);const hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+0.05)/(lo+0.05);}

// Theme tokens (resolved from core.css)
const DARK={navy900:'#0B131F',navy800:'#111C2E',navy700:'#18283F',ink:[255,255,255]};
const LIGHT={navy900:'#F4F1EA',navy800:'#ECE7DC',navy700:'#E2DCCC',ink:[15,23,42]};
const G={50:'#F8FAFC',100:'#F1F5F9',150:'#E9EFF6',200:'#E2E8F0',300:'#CBD5E1',400:'#94A3B8',500:'#64748B',600:'#475569',700:'#334155',800:'#1E293B',900:'#0F172A'};
const ACCENT='#0EA5E9', GREEN='#22C55E', RED='#EF4444';
const MODAL_DARK=over([255,255,255],0.98,hex(DARK.navy900)); // ~white card on dark canvas
const MODAL_LIGHT=over([255,255,255],0.98,hex(LIGHT.navy900));

// inkAlpha(a, theme) → composited ink color at alpha over a given surface
function inkOn(a,theme,surface){return over(theme.ink,a,surface);}

const tests=[];
function T(name,fg,bg,big=false){const r=ratio(Array.isArray(fg)?fg:hex(fg),Array.isArray(bg)?bg:hex(bg));const min=big?3.0:4.5;tests.push({name,r:+r.toFixed(2),pass:r>=min,min});}

// ---- Dark canvas (navy) ----
const dCanvas=over(hex(DARK.navy800),0.85,hex(DARK.navy900));
T('[dark] emp-label ink.88 on td-name(navy700.96)',inkOn(.88,DARK,over(hex(DARK.navy700),.96,hex(DARK.navy900))),over(hex(DARK.navy700),.96,hex(DARK.navy900)));
T('[dark] text-2 (.76) on canvas',inkOn(.76,DARK,hex(DARK.navy900)),hex(DARK.navy900));
T('[dark] text-3 (.58) on canvas',inkOn(.58,DARK,hex(DARK.navy900)),hex(DARK.navy900));
T('[dark] text-faint (.48) on canvas',inkOn(.48,DARK,hex(DARK.navy900)),hex(DARK.navy900));
T('[dark] stats-bar ink.76 on stats-bar surface',inkOn(.76,DARK,dCanvas),dCanvas);

// ---- Light canvas (theme overrides) ----
T('[light] text-2 (.80) on canvas',inkOn(.80,LIGHT,hex(LIGHT.navy900)),hex(LIGHT.navy900));
T('[light] text-3 (.64) on canvas',inkOn(.64,LIGHT,hex(LIGHT.navy900)),hex(LIGHT.navy900));
T('[light] text-faint (.60) on canvas',inkOn(.60,LIGHT,hex(LIGHT.navy900)),hex(LIGHT.navy900));

// ---- White modal (both themes ≈ near-white) ----
[['darkModal',MODAL_DARK],['lightModal',MODAL_LIGHT]].forEach(([t,bg])=>{
  T(`[${t}] gray-800 text`,G[800],bg);
  T(`[${t}] gray-700 text`,G[700],bg);
  T(`[${t}] gray-600 text`,G[600],bg);
  T(`[${t}] gray-500 text`,G[500],bg);
  // gray-400 now only remains on ::placeholder text, which WCAG 1.4.3 exempts.
  T(`[${t}] gray-400 PLACEHOLDER (WCAG-exempt)`,G[400],bg);
});

// ---- Fixed gray-800 table headers (yp/dept/empdash) with gray-300 text ----
T('[hdr] gray-300 on gray-800 header',G[300],G[800]);
T('[hdr] yp-th-now accent-lt on blue/gray-800',hex('#67D4FF'),over(hex(ACCENT),0.2,hex(G[800])));
T('[btn] #fff on #0369A1 (export)',[255,255,255],hex('#0369A1'));
T('[badge] #042231 dark on accent (badges/chips)',hex('#042231'),ACCENT);

// ---- Fixed light surfaces (gray-100 / gray-50) with label text ----
T('[card] gray-600 on gray-100 (dept-th)',G[600],G[100]);
T('[card] gray-500 on gray-50',G[500],G[50]);
T('[card] gray-600 on white',G[600],[255,255,255]);

// ---- Position tags (posColor fg on bg) ----
const POS={CA:['#7E22CE','#F3E8FF'],LOA:['#1D4ED8','#DBEAFE'],OA:['#0F766E','#CCFBF1'],FA:['#15803D','#DCFCE7'],AA:['#475569','#F1F5F9'],fallback:['#475569','#F1F5F9']};
Object.entries(POS).forEach(([k,[fg,bg]])=>T(`[pos] ${k} tag`,fg,bg,true));

// ---- Toast (fixed dark surface) ----
T('[toast] #F8FAFC on slate',[248,250,252],hex('#1E293B'));
T('[toast] error #FFF on dark red',[255,255,255],hex('#781616'));

// ---- yp-eval colored numbers on white ----
['#C2410C','#0369A1','#15803D','#7C3AED','#B91C1C','#0F766E','#64748B'].forEach(c=>T(`[yp] num ${c} on white`,c,[255,255,255]));

// ---- Output ----
const fails=tests.filter(t=>!t.pass);
console.log('Total pairs:',tests.length,'| FAIL:',fails.length);
console.log('\n--- FAILURES (< AA) ---');
fails.forEach(t=>console.log(`✗ ${t.r}  (min ${t.min})  ${t.name}`));
console.log('\n--- borderline pass (AA but < 4.5 large only / <5) ---');
tests.filter(t=>t.pass&&t.r<5).forEach(t=>console.log(`~ ${t.r}  ${t.name}`));
