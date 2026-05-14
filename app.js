/* ═══════════════════════════════════════════════════════════════
   NAIROBI COUNTY BUDGET TRANSPARENCY PLATFORM — app.js
   Combines: database module + backend module + new features:
   • Mock historical FY data (FY 2018/19 – FY 2024/25)
   • Historical comparison charts
   • Community comments with voting & replies
   • People's Budget Generator with CSV/PDF download
   ═══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════
   SECTION 1 — DATABASE
   ══════════════════════════════════════════════ */
const DB = (() => {

  /* ── RNG seeded by year for reproducible mock data ── */
  function seededRand(seed) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  }

  /* ── HISTORICAL MOCK DATA (FY 2018–2025) ── */
  const BASE_TOTAL = 48_986_600_000;
  const historicalFY = [
    { fy:'2018/19', key:'fy2019', seed:2019, growthBase:.72 },
    { fy:'2019/20', key:'fy2020', seed:2020, growthBase:.76 },
    { fy:'2020/21', key:'fy2021', seed:2021, growthBase:.80 },
    { fy:'2021/22', key:'fy2022', seed:2022, growthBase:.83 },
    { fy:'2022/23', key:'fy2023', seed:2023, growthBase:.87 },
    { fy:'2023/24', key:'fy2024', seed:2024, growthBase:.92 },
    { fy:'2024/25', key:'fy2025', seed:2025, growthBase:1.0  },
  ];

  function buildHistoricalRevenue(item) {
    const r = seededRand(item.seed);
    const tot = Math.round(BASE_TOTAL * item.growthBase * (0.97 + r() * 0.06));
    const ownPct = 0.46 + r() * 0.06;
    const ownTotal = Math.round(tot * ownPct);
    const extTotal = Math.round(tot * (1 - ownPct) * 0.93);
    const cash = tot - ownTotal - extTotal;
    return {
      fy: item.fy, key: item.key,
      grandTotal: tot,
      cashBalances: Math.max(cash, 800_000_000),
      externalTransfers: {
        equitableShare: Math.round(extTotal * 0.96),
        kdspII: Math.round(extTotal * 0.015),
        worldBankKISIP2: Math.round(extTotal * 0.025),
        total: extTotal
      },
      ownSource: {
        landRates:       Math.round(ownTotal * 0.32),
        parkingFees:     Math.round(ownTotal * 0.14),
        businessPermits: Math.round(ownTotal * 0.155),
        buildingPermits: Math.round(ownTotal * 0.128),
        billboards:      Math.round(ownTotal * 0.051),
        houseRents:      Math.round(ownTotal * 0.025),
        fireInspection:  Math.round(ownTotal * 0.015),
        foodHandlers:    Math.round(ownTotal * 0.013),
        markets:         Math.round(ownTotal * 0.024),
        otherIncomes:    Math.round(ownTotal * 0.078),
        liquorFees:      Math.round(ownTotal * 0.017),
        hospitalsNFH:    Math.round(ownTotal * 0.052),
        subtotal:        ownTotal,
      }
    };
  }

  const allRevenue = {};
  historicalFY.forEach(h => { allRevenue[h.key] = buildHistoricalRevenue(h); });

  /* ── DEPT ALLOCATIONS (FY 2024/25 actuals) ── */
  const deptBase = [
    { id:'CPSB',  name:'County Public Service Board',               recurrent:146_743_632,  development:51_000_000   },
    { id:'FEP',   name:'Finance & Economic Planning',               recurrent:3_930_603_631,development:592_000_000  },
    { id:'PSM',   name:'Public Service Management',                 recurrent:2_318_702_981,development:70_000_000   },
    { id:'ALFF',  name:'Agriculture, Livestock, Fisheries & Forestry',recurrent:303_492_733,development:85_000_000   },
    { id:'CASS',  name:'County Assembly',                           recurrent:2_147_013_347,development:1_455_000_000},
    { id:'EWER',  name:'Environment, Water, Energy & Natural Resources',recurrent:3_379_326_508,development:1_103_500_000},
    { id:'WDP',   name:'Ward Development Programmes',               recurrent:88_112_210,   development:2_155_000_000},
    { id:'EF',    name:'Emergency Fund',                            recurrent:150_000_000,  development:0            },
    { id:'LLB',   name:'Liquor Licensing Board',                    recurrent:299_000_000,  development:101_000_000  },
    { id:'BPA',   name:'Boroughs & Public Administration',          recurrent:4_548_497_826,development:1_598_605_683},
    { id:'CA',    name:'County Attorney',                           recurrent:480_903_453,  development:25_000_000   },
    { id:'IDE',   name:'Innovation & Digital Economy',              recurrent:262_253_358,  development:458_611_367  },
    { id:'HWN',   name:'Health, Wellness & Nutrition',              recurrent:10_775_846_967,development:976_013_516 },
    { id:'BEUP',  name:'Built Environment & Urban Planning',        recurrent:645_583_341,  development:622_566_537  },
    { id:'MW',    name:'Mobility & Works',                          recurrent:1_702_223_718,development:1_774_000_000},
    { id:'TSDC',  name:'Talent, Skills Dev & Care',                 recurrent:2_327_324_106,development:1_468_791_290},
    { id:'BHO',   name:'Business & Hustler Opportunities',          recurrent:622_022_366,  development:1_195_250_000},
    { id:'IPCE',  name:'Inclusivity, Public Participation & CE',    recurrent:390_230_730,  development:325_625_000  },
    { id:'NRA',   name:'Nairobi Revenue Authority',                 recurrent:206_755_700,  development:205_000_000  },
  ];

  const spendMult = { CPSB:.78,FEP:.83,PSM:.72,ALFF:.69,CASS:.91,EWER:.77,WDP:.65,EF:.95,LLB:.88,BPA:.86,CA:.74,IDE:.61,HWN:.89,BEUP:.67,MW:.79,TSDC:.82,BHO:.71,IPCE:.75,NRA:.84 };

  /* Build historical dept data for each FY */
  function buildHistoricalDepts(fyKey) {
    const rev = allRevenue[fyKey];
    const scale = rev.grandTotal / BASE_TOTAL;
    const r = seededRand(parseInt(fyKey.replace('fy','')) * 7 + 3);
    return deptBase.map(d => {
      const jitter = 0.94 + r() * 0.12;
      const rec = Math.round(d.recurrent * scale * jitter);
      const dev = Math.round(d.development * scale * (0.90 + r() * 0.20));
      const tot = rec + dev;
      const util = Math.round((spendMult[d.id] || 0.75) * (0.92 + r() * 0.16) * 100);
      return { ...d, fy: fyKey, recurrent: rec, development: dev, total: tot, spent: Math.round(tot * util/100), utilisation: Math.min(util,99) };
    });
  }

  const allDepts = {};
  historicalFY.forEach(h => { allDepts[h.key] = buildHistoricalDepts(h.key); });

  /* ── RISK FLAGS ── */
  const riskFlags = [
    { dept:'Finance & Economic Planning',       level:'high',   score:87, reason:'Management fees of KES 500M — single line item ~30% of dept budget, no sub-itemisation.',      metrics:{fee:'KES 500M',util:'83%',flag:'Line-item opacity'} },
    { dept:'Health, Wellness & Nutrition',      level:'high',   score:82, reason:'School Feeding KES 1.006B food ration — limited competitive tendering evidence.',                metrics:{amount:'1.006B',util:'89%',pct:'9% of dept'} },
    { dept:'Boroughs & Public Administration',  level:'high',   score:78, reason:'Security: KES 51M uniforms + KES 3.5M musical instruments — non-core spend.',                   metrics:{uniforms:'51M',instruments:'3.5M',util:'86%'} },
    { dept:'Solid Waste / Green Nairobi Ltd',   level:'high',   score:74, reason:'KES 1.05B recurrent transfer — no independent audit trail for SOE subsidiary.',                  metrics:{transfer:'1.05B',entity:'Green Nairobi Ltd',flag:'SOE'} },
    { dept:'Mobility & Works',                  level:'medium', score:62, reason:'KES 260M fuel + KES 228M vehicle maintenance — large discretionary lines.',                      metrics:{fuel:'260M',maintenance:'228M',util:'79%'} },
    { dept:'County Assembly',                   level:'medium', score:58, reason:'Development budget KES 1.455B — travel & accommodation allowances lack per-trip breakdown.',     metrics:{devBudget:'1.455B',util:'91%',travel:'High'} },
    { dept:'Talent, Skills Dev & Care',         level:'medium', score:54, reason:'Sports infrastructure KES 998M — multiple stadium contracts at 0% completion reported.',         metrics:{sports:'998M',completion:'0%',util:'82%'} },
    { dept:'Business & Hustler Opportunities',  level:'medium', score:51, reason:'Markets construction KES 560M — stalled projects with no penalty clause enforcement.',           metrics:{markets:'560M',stalled:3,util:'71%'} },
    { dept:'Ward Development Programmes',       level:'medium', score:48, reason:'KES 2.155B across 85 wards — limited ward-level M&E reporting infrastructure.',                  metrics:{total:'2.155B',wards:85,util:'65%'} },
    { dept:'Public Service Management',         level:'low',    score:38, reason:'Insurance KES 85M (WIBA/GPA) — verify market-rate benchmarking against peers.',                  metrics:{insurance:'85M',util:'72%',flag:'Pricing'} },
    { dept:'Liquor Licensing Board',            level:'low',    score:32, reason:'Board allowances KES 30M — high per-diem relative to board size; roster verification needed.',   metrics:{allowances:'30M',util:'88%',flag:'Governance'} },
    { dept:'County Attorney',                   level:'low',    score:28, reason:'Legal dues KES 264.3M — single-year settlement; independent review recommended.',                metrics:{legal:'264.3M',util:'74%',flag:'Settlement'} },
    { dept:'Innovation & Digital Economy',      level:'low',    score:22, reason:'Smart Nairobi/ERP KES 150M — ICT procurement methodology should be independently verified.',     metrics:{amount:'150M',util:'61%',flag:'ICT Procurement'} },
    { dept:'Agriculture, Livestock & Forestry', level:'low',    score:18, reason:'KABDP & NAVCDP donor funds — management fee structures require independent verification.',       metrics:{donorFunds:'15M',util:'69%',flag:'Donor mgmt'} },
  ];

  /* ── CASES ── */
  const cases = [
    { id:'NCC-2025-001',type:'Procurement Fraud',  title:'Inflated tenders – County Road Maintenance',      ward:'Ruai',           date:'2025-01-14',amount:'KES 18M',    status:'open',         ref:'EACC-2025-0089' },
    { id:'NCC-2025-002',type:'Ghost Workers',       title:'Non-existent employees on Health payroll',         ward:'Mathare',        date:'2025-01-28',amount:'KES 4.2M/mo',status:'investigating', ref:'EACC-2025-0102' },
    { id:'NCC-2025-003',type:'Cash Diversion',      title:'Market fee collection without receipts – Gikomba', ward:'Kamukunji',      date:'2025-02-05',amount:'KES 1.1M/wk',status:'investigating', ref:'DCI-2025-0034'  },
    { id:'NCC-2025-004',type:'Tender Fraud',        title:'Building works contract awarded to connected firm', ward:'Kasarani',       date:'2024-11-30',amount:'KES 32M',    status:'resolved',     ref:'PPRA-2024-0211' },
    { id:'NCC-2025-005',type:'Bribery',             title:'Fire inspection certificate extortion – Westlands',ward:'Westlands',      date:'2025-02-19',amount:'KES 150K',   status:'open',         ref:'EACC-2025-0134' },
    { id:'NCC-2025-006',type:'Asset Misuse',        title:'County vehicle used for private purposes',          ward:'Starehe',        date:'2025-03-02',amount:'Unknown',    status:'investigating', ref:'NCC-INT-2025-007'},
    { id:'NCC-2025-007',type:'Land Rate Fraud',     title:'Under-assessment of CBD commercial property',       ward:'Nairobi Central',date:'2025-01-09',amount:'KES 800M/yr',status:'investigating', ref:'EACC-2025-0056' },
    { id:'NCC-2025-008',type:'Payroll Fraud',       title:'Salary paid to separated employees – EWER dept',    ward:'County Wide',    date:'2024-12-15',amount:'KES 12M',    status:'resolved',     ref:'NCC-INT-2024-099'},
  ];

  /* ── WARDS ── */
  const wards = [
    { name:'Westlands',        sub:'Westlands',      lat:-1.2648,lng:36.8025,budget:28_500_000,risk:'medium' },
    { name:'Parklands/Highridge',sub:'Westlands',    lat:-1.2580,lng:36.8201,budget:26_000_000,risk:'low'    },
    { name:'Kasarani',         sub:'Kasarani',       lat:-1.2225,lng:36.8947,budget:31_000_000,risk:'medium' },
    { name:'Githurai',         sub:'Kasarani',       lat:-1.1774,lng:36.9149,budget:24_000_000,risk:'high'   },
    { name:'Roysambu',         sub:'Roysambu',       lat:-1.2122,lng:36.8780,budget:22_500_000,risk:'medium' },
    { name:'Kahawa West',      sub:'Kasarani',       lat:-1.1850,lng:36.8950,budget:21_000_000,risk:'low'    },
    { name:'Ruaraka',          sub:'Ruaraka',        lat:-1.2300,lng:36.8880,budget:23_000_000,risk:'medium' },
    { name:'Nairobi Central',  sub:'Starehe',        lat:-1.2864,lng:36.8172,budget:35_000_000,risk:'high'   },
    { name:'Harambee',         sub:'Starehe',        lat:-1.2864,lng:36.8220,budget:22_000_000,risk:'low'    },
    { name:'Kilimani',         sub:'Dagoretti North',lat:-1.2890,lng:36.7820,budget:30_000_000,risk:'low'    },
    { name:'Kawangware',       sub:'Dagoretti North',lat:-1.2680,lng:36.7580,budget:21_500_000,risk:'high'   },
    { name:'Kibra',            sub:'Kibra',          lat:-1.3100,lng:36.7830,budget:29_000_000,risk:'high'   },
    { name:'Embakasi Central', sub:'Embakasi Central',lat:-1.3050,lng:36.9000,budget:26_000_000,risk:'medium'},
    { name:'Kayole Central',   sub:'Embakasi Central',lat:-1.2880,lng:36.9100,budget:23_000_000,risk:'high'  },
    { name:'Umoja 1',          sub:'Embakasi West',  lat:-1.2750,lng:36.8850,budget:22_000_000,risk:'medium' },
    { name:'Kariobangi North', sub:'Embakasi North', lat:-1.2600,lng:36.8800,budget:21_000_000,risk:'high'   },
    { name:'Dandora Area I',   sub:'Embakasi North', lat:-1.2511,lng:36.8952,budget:19_000_000,risk:'high'   },
    { name:'Korogocho',        sub:'Ruaraka',        lat:-1.2467,lng:36.8878,budget:17_000_000,risk:'high'   },
    { name:'Mathare North',    sub:'Mathare',        lat:-1.2600,lng:36.8550,budget:16_500_000,risk:'high'   },
    { name:'Kamukunji',        sub:'Kamukunji',      lat:-1.2780,lng:36.8430,budget:20_000_000,risk:'high'   },
    { name:'Mutuini',          sub:'Dagoretti South',lat:-1.3100,lng:36.7450,budget:18_000_000,risk:'low'    },
    { name:'Langata',          sub:'Langata',        lat:-1.3450,lng:36.7560,budget:23_500_000,risk:'low'    },
    { name:'Karen',            sub:'Langata',        lat:-1.3430,lng:36.7200,budget:27_000_000,risk:'low'    },
    { name:'Woodley/Kenyatta', sub:'Langata',        lat:-1.3100,lng:36.7850,budget:24_000_000,risk:'low'    },
    { name:'Makongeni',        sub:'Makadara',       lat:-1.2978,lng:36.8620,budget:18_000_000,risk:'high'   },
    { name:'Pipeline',         sub:'Embakasi South', lat:-1.3200,lng:36.8950,budget:20_000_000,risk:'medium' },
    { name:'Eastleigh South',  sub:'Kamukunji',      lat:-1.2780,lng:36.8600,budget:19_500_000,risk:'medium' },
    { name:'Ngara',            sub:'Starehe',        lat:-1.2760,lng:36.8260,budget:19_000_000,risk:'medium' },
    { name:'Utalii',           sub:'Ruaraka',        lat:-1.2188,lng:36.9000,budget:19_500_000,risk:'low'    },
    { name:'Maringo/Hamza',    sub:'Makadara',       lat:-1.2880,lng:36.8700,budget:17_500_000,risk:'medium' },
  ];

  /* ── CONTACTS ── */
  const contacts = [
    { name:'Ethics & Anti-Corruption Commission (EACC)', detail:'Accepts anonymous reports 24/7.', phone:'0800 720 750', email:'eacc@integrity.go.ke', web:'www.eacc.go.ke', tags:['Anonymous ok','National','Investigative'] },
    { name:'Directorate of Criminal Investigations (DCI)', detail:'Economic crimes division.', phone:'0800 722 203', email:'info@dci.go.ke', web:'www.dci.go.ke', tags:['National','Investigative','Legal protection'] },
    { name:'Office of the Director of Public Prosecutions', detail:'Prosecution after investigation.', phone:'+254 20 2628720', email:'dpp@odpp.go.ke', web:'www.odpp.go.ke', tags:['National','Prosecution'] },
    { name:'Nairobi County Assembly – Public Accounts Committee', detail:'Petitions accepted from residents.', phone:'+254 20 2221265', email:'clerk@nairobi.go.ke', web:'www.nairobica.go.ke', tags:['County','Oversight'] },
    { name:'Controller of Budget', detail:'Monitors county budget utilisation.', phone:'+254 20 2226984', email:'cob@cob.go.ke', web:'www.cob.go.ke', tags:['National','Budget watchdog'] },
    { name:'Auditor General', detail:'Audits county accounts annually.', phone:'+254 20 3317880', email:'auditor@kenao.go.ke', web:'www.kenao.go.ke', tags:['National','Audit body'] },
    { name:'Witness Protection Agency (WPA)', detail:'Legal protection and anonymity for witnesses.', phone:'+254 20 2715560', email:'info@wpa.go.ke', web:'www.wpa.go.ke', tags:['Protected','Safe support'] },
    { name:'Senate Devolution Committee', detail:'National oversight of county governance.', phone:'+254 20 2848000', email:'senate@parliament.go.ke', web:'www.parliament.go.ke', tags:['National','Oversight'] },
    { name:'Kenya National Human Rights Commission', detail:'County service delivery complaints.', phone:'0800 720 627', email:'knhrcinfo@knhrc.or.ke', web:'www.knhrc.or.ke', tags:['Anonymous ok','Safe support'] },
  ];

  /* ── REPORT META ── */
  const reportMeta = [
    { id:'budget-summary',   title:'Budget Summary FY 2025/2026',        desc:'All 19 departments — recurrent, development, total and utilisation.', rows:19, type:'Summary',     formats:['CSV','PDF'] },
    { id:'revenue-breakdown',title:'Revenue Breakdown FY 2025/2026',     desc:'All Own Source Revenue streams, External Transfers and year-on-year comparison.', rows:14, type:'Revenue', formats:['CSV','PDF'] },
    { id:'capital-projects', title:'Capital Projects Register FY 2025/2026', desc:'62 projects with location, cost, status and implementing dept.', rows:62, type:'Development', formats:['CSV','PDF'] },
    { id:'historical-trends',title:'Historical Budget Trends FY 2018–2025', desc:'7 years of revenue and expenditure data (FY 2018/19 to FY 2024/25).', rows:133, type:'Historical', formats:['CSV','PDF'] },
    { id:'risk-flags',       title:'Corruption Risk Assessment Report',   desc:'AI-assisted risk flags from budget pattern analysis.', rows:14, type:'Oversight', formats:['CSV','PDF'] },
    { id:'ward-budgets',     title:'Ward Budget Allocation Report',       desc:'30-ward budget data with geo-coordinates and risk ratings.', rows:30, type:'Ward', formats:['CSV','PDF'] },
  ];

  /* ── CSV GENERATOR ── */
  function generateCSV(id) {
    if(id==='budget-summary'){
      const d = allDepts['fy2025'];
      const rows=[['Dept Code','Department','Recurrent KES','Development KES','Total KES','Est Spent KES','Utilisation %','FY']];
      d.forEach(r=>rows.push([r.id,r.name,r.recurrent,r.development,r.total,r.spent,r.utilisation,'2024/25']));
      return rows;
    }
    if(id==='revenue-breakdown'){
      const r=allRevenue['fy2025'],r24=allRevenue['fy2024'];
      const rows=[['Category','Source','FY 2023/24','FY 2024/25','Change %']];
      Object.entries(r.ownSource).filter(([k])=>k!=='subtotal').forEach(([k,v])=>{
        const v24=r24.ownSource[k]||0;
        rows.push(['Own Source',k,v24,v,v24?((v-v24)/v24*100).toFixed(1)+'%':'N/A']);
      });
      rows.push(['External','Equitable Share',r24.externalTransfers.equitableShare,r.externalTransfers.equitableShare,'']);
      rows.push(['Total','Grand Total',r24.grandTotal,r.grandTotal,((r.grandTotal-r24.grandTotal)/r24.grandTotal*100).toFixed(1)+'%']);
      return rows;
    }
    if(id==='historical-trends'){
      const rows=[['FY','Total Revenue KES','Own Source KES','External Transfers KES','Cash Balances KES']];
      historicalFY.forEach(h=>{
        const rv=allRevenue[h.key];
        rows.push([h.fy,rv.grandTotal,rv.ownSource.subtotal,rv.externalTransfers.total,rv.cashBalances]);
      });
      return rows;
    }
    if(id==='risk-flags'){
      const rows=[['Department','Risk Level','Risk Score','Reason','Metric']];
      riskFlags.forEach(r=>rows.push([r.dept,r.level.toUpperCase(),r.score,r.reason,JSON.stringify(r.metrics)]));
      return rows;
    }
    if(id==='ward-budgets'){
      const rows=[['Ward','Sub-County','Lat','Lng','Budget KES','Risk Level']];
      wards.forEach(w=>rows.push([w.name,w.sub,w.lat,w.lng,w.budget,w.risk.toUpperCase()]));
      return rows;
    }
    return [['No data for: '+id]];
  }

  /* ── FMT ── */
  const fmt = n => { if(n>=1e9) return 'KES '+(n/1e9).toFixed(2)+'B'; if(n>=1e6) return 'KES '+(n/1e6).toFixed(1)+'M'; return 'KES '+n.toLocaleString(); };

  return {
    getRevenue:(fy='fy2025')=>allRevenue[fy]||allRevenue['fy2025'],
    getAllRevenue:()=>allRevenue,
    getHistoricalFY:()=>historicalFY,
    getDepartments:(fy='fy2025')=>allDepts[fy]||allDepts['fy2025'],
    getAllDepts:()=>allDepts,
    getRiskFlags:()=>riskFlags,
    getCases:()=>cases,
    getWards:()=>wards,
    getContacts:()=>contacts,
    getReportMeta:()=>reportMeta,
    generateCSV,
    fmt,
    BASE_TOTAL,
    deptBase,
  };
})();


/* ══════════════════════════════════════════════
   SECTION 2 — BACKEND / UI ENGINE
   ══════════════════════════════════════════════ */
const Backend = (() => {

  let charts = {};
  let leafletMap = null;
  let jsPDFLoaded = false;
  let currentFY = 'fy2025';
  let commentStore = [];
  let visibleComments = 6;
  let pbValues = {};
  let eaccStep = 1;

  /* ── Helpers ── */
  const fmt = n => DB.fmt(n);
  const pct = (a,b) => b>0 ? Math.round(a/b*100) : 0;
  const esc = s => String(s).replace(/"/g,'""');
  const clamp = (n,mn,mx) => Math.min(Math.max(n,mn),mx);
  const $ = id => document.getElementById(id);
  const set = (id,v) => { const e=$(id); if(e) e.textContent=v; };

  const PALETTE = ['#2e9e5b','#f0b429','#42a5f5','#e84040','#5fcf85','#f97316','#a78bfa','#34d399','#fb7185','#fbbf24','#60a5fa','#4ade80','#f472b6','#818cf8','#38bdf8','#a3e635','#c084fc','#fdba74','#6ee7b7','#fca5a5'];

  const CHART_BASE = {
    responsive:true, maintainAspectRatio:false,
    animation:{ duration:700, easing:'easeInOutQuart' },
    plugins:{ legend:{ labels:{ color:'#7aab8c', font:{ family:'DM Sans', size:12 }}}},
    scales:{
      x:{ ticks:{ color:'#7aab8c', font:{ family:'DM Sans', size:11 }}, grid:{ color:'rgba(95,207,133,.08)'}, border:{ color:'rgba(95,207,133,.15)'}},
      y:{ ticks:{ color:'#7aab8c', font:{ family:'DM Sans', size:11 }, callback:v=>fmt(v)}, grid:{ color:'rgba(95,207,133,.08)'}, border:{ color:'rgba(95,207,133,.15)'}},
    }
  };

  function destroyChart(id){ if(charts[id]){ try{ charts[id].destroy(); }catch(e){} delete charts[id]; }}

  function ensureJsPDF(){
    return new Promise(r=>{
      if(jsPDFLoaded&&window.jspdf){ r(true); return; }
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload=()=>{ jsPDFLoaded=true; r(true); };
      s.onerror=()=>r(false);
      document.head.appendChild(s);
    });
  }

  function csvToBlob(rows){
    const c=rows.map(r=>r.map(c=>`"${esc(c)}"`).join(',')).join('\n');
    return new Blob(['\uFEFF'+c],{type:'text/csv;charset=utf-8;'});
  }

  function triggerDownload(blob,fn){
    const u=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=u; a.download=fn;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(u); },800);
  }

  /* ─── TAB SWITCHING ─── */
  function showTab(name){
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    const panel=$('tab-'+name);
    if(panel) panel.classList.add('active');
    const btn=document.querySelector(`[data-tab="${name}"]`);
    if(btn){ btn.classList.add('active'); btn.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'}); }
    if(name==='revenue')    renderRevenue();
    if(name==='map')        renderMap();
    if(name==='contacts')   renderContacts();
    if(name==='reports')    renderReportsTab();
    if(name==='historical') renderHistorical();
    if(name==='comments')   renderComments();
    if(name==='peoples-budget') renderPeoplesBudget();
  }

  /* ─── DASHBOARD ─── */
  function renderDashboardStats(fyKey){
    const depts = DB.getDepartments(fyKey);
    const rev   = DB.getRevenue(fyKey);
    const total = depts.reduce((s,d)=>s+d.total,0);
    const spent = depts.reduce((s,d)=>s+d.spent,0);
    const over  = depts.filter(d=>d.utilisation>95).length;
    set('stat-total', fmt(total));
    set('stat-spent', fmt(spent));
    set('stat-util',  pct(spent,total)+'%');
    set('stat-over',  over);
    set('stat-rev',   fmt(rev.grandTotal));
  }

  function renderBudgetChart(fyKey){
    const depts = DB.getDepartments(fyKey).sort((a,b)=>b.total-a.total).slice(0,8);
    const labels = depts.map(d=>d.name.length>22?d.name.slice(0,22)+'…':d.name);
    destroyChart('budgetChart');
    const ctx=$('budgetChart'); if(!ctx) return;
    charts['budgetChart'] = new Chart(ctx,{
      type:'bar',
      data:{ labels, datasets:[
        { label:'Allocated', data:depts.map(d=>d.total), backgroundColor:'rgba(46,158,91,.55)', borderColor:'#2e9e5b', borderWidth:1.5, borderRadius:4 },
        { label:'Est. Spent',data:depts.map(d=>d.spent), backgroundColor:'rgba(240,180,41,.55)', borderColor:'#f0b429', borderWidth:1.5, borderRadius:4 },
      ]},
      options:{ ...CHART_BASE, scales:{ x:{ ...CHART_BASE.scales.x, ticks:{ ...CHART_BASE.scales.x.ticks, maxRotation:35 }}, y:CHART_BASE.scales.y }},
    });
  }

  function renderPieChart(fyKey){
    const depts = DB.getDepartments(fyKey).sort((a,b)=>b.total-a.total).slice(0,8);
    destroyChart('pieChart');
    const ctx=$('pieChart'); if(!ctx) return;
    charts['pieChart'] = new Chart(ctx,{
      type:'doughnut',
      data:{ labels:depts.map(d=>d.name.length>18?d.name.slice(0,18)+'…':d.name), datasets:[{ data:depts.map(d=>d.total), backgroundColor:PALETTE, borderColor:'#07150e', borderWidth:2, hoverOffset:6 }]},
      options:{ ...CHART_BASE, cutout:'60%', plugins:{ legend:{ position:'right', labels:{ color:'#7aab8c', font:{family:'DM Sans',size:10}, boxWidth:10, padding:10 }}}},
    });
  }

  function renderBudgetTable(deptFilter, fyKey){
    const tbody = document.querySelector('#budgetTable tbody');
    if(!tbody) return;
    let depts = DB.getDepartments(fyKey||currentFY);
    if(deptFilter && deptFilter!=='all') depts=depts.filter(d=>d.id===deptFilter);
    const rows = depts.map(d=>{
      const u=d.utilisation;
      const badge = u>95?'<span class="badge badge-over">⚠ Over</span>':u>80?'<span class="badge badge-warn">🟡 High</span>':'<span class="badge badge-ok">✓ On Track</span>';
      const bar = `<div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${clamp(u,0,100)}%;background:${u>95?'var(--red)':u>80?'var(--orange)':'var(--green-bright)'}"></div></div>`;
      return `<tr><td><strong>${d.name}</strong></td><td>FY ${d.fy.replace('fy','20')}</td><td>${fmt(d.recurrent)}</td><td>${fmt(d.development)}</td><td>${fmt(d.total)}</td><td>${fmt(d.spent)}</td><td><span style="font-weight:600">${u}%</span>${bar}</td><td>${badge}</td></tr>`;
    });
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px">No data</td></tr>';
  }

  function populateDeptFilter(){
    const sel=$('deptFilter'); if(!sel) return;
    DB.getDepartments('fy2025').forEach(d=>{ const o=document.createElement('option'); o.value=d.id; o.textContent=d.name; sel.appendChild(o); });
  }

  /* ─── REVENUE ─── */
  function renderRevenue(){
    const rev = DB.getRevenue(currentFY);
    const src = rev.ownSource;
    set('rev-total', fmt(rev.grandTotal));
    set('rev-top',   'Land Rates');
    set('rev-sources', String(Object.keys(src).filter(k=>k!=='subtotal').length+2));

    const list=$('revenueList');
    if(list){
      const items=[
        ['Land Rates',src.landRates,'#2e9e5b'],['Business Permits',src.businessPermits,'#f0b429'],
        ['Building Permits',src.buildingPermits,'#42a5f5'],['Parking Fees',src.parkingFees,'#f97316'],
        ['Equitable Share',rev.externalTransfers.equitableShare,'#5fcf85'],
        ['Hospitals/NFH',src.hospitalsNFH||0,'#a78bfa'],['Liquor Fees',src.liquorFees,'#34d399'],
        ['Other Incomes',src.otherIncomes,'#fbbf24'],['Billboards',src.billboards,'#fb7185'],['Markets',src.markets,'#60a5fa'],
      ].sort((a,b)=>b[1]-a[1]);
      const tot=items.reduce((s,i)=>s+i[1],0);
      list.innerHTML=items.map(([name,amount,color])=>`
        <div class="revenue-stat">
          <div><div class="rev-source">${name}</div>
          <div class="prog-bar-bg" style="width:160px;margin-top:5px"><div class="prog-bar-fill" style="width:${pct(amount,tot)}%;background:${color}"></div></div></div>
          <div class="rev-amount">${fmt(amount)}</div>
        </div>`).join('');
    }

    destroyChart('revenueChart');
    const ctx=$('revenueChart');
    if(ctx){
      charts['revenueChart']=new Chart(ctx,{
        type:'doughnut',
        data:{ labels:['Land Rates','Business Permits','Building Permits','Parking Fees','Equitable Share','Hospitals/NFH','Liquor Fees','Other','Billboards','Markets'],
          datasets:[{ data:[src.landRates,src.businessPermits,src.buildingPermits,src.parkingFees,rev.externalTransfers.equitableShare,src.hospitalsNFH||0,src.liquorFees,src.otherIncomes,src.billboards,src.markets],
            backgroundColor:PALETTE, borderColor:'#07150e', borderWidth:2, hoverOffset:6 }]},
        options:{ ...CHART_BASE, cutout:'55%', plugins:{ legend:{ display:false }}},
      });
    }

    destroyChart('revTrendChart');
    const ctx2=$('revTrendChart');
    if(ctx2){
      const fyList=DB.getHistoricalFY();
      charts['revTrendChart']=new Chart(ctx2,{
        type:'line',
        data:{ labels:fyList.map(f=>'FY '+f.fy),
          datasets:[
            { label:'Total Revenue', data:fyList.map(f=>DB.getRevenue(f.key).grandTotal), borderColor:'#2e9e5b', backgroundColor:'rgba(46,158,91,.1)', fill:true, tension:.4, pointBackgroundColor:'#2e9e5b', pointRadius:5 },
            { label:'Own Source',    data:fyList.map(f=>DB.getRevenue(f.key).ownSource.subtotal), borderColor:'#f0b429', backgroundColor:'rgba(240,180,41,.07)', fill:true, tension:.4, pointBackgroundColor:'#f0b429', pointRadius:5 },
            { label:'Equitable Share',data:fyList.map(f=>DB.getRevenue(f.key).externalTransfers.total), borderColor:'#42a5f5', backgroundColor:'rgba(66,165,245,.07)', fill:true, tension:.4, pointBackgroundColor:'#42a5f5', pointRadius:5 },
          ]},
        options:CHART_BASE,
      });
    }
  }

  /* ─── CORRUPTION SCANNER ─── */
  function runScan(){
    const btn=$('btnScan');
    if(btn){ btn.disabled=true; btn.classList.add('scanning'); btn.textContent='Scanning…'; }
    setTimeout(()=>{
      const flags=DB.getRiskFlags();
      const high=flags.filter(f=>f.level==='high').length;
      const med=flags.filter(f=>f.level==='medium').length;
      const low=flags.filter(f=>f.level==='low').length;
      const clean=DB.getDepartments('fy2025').length-flags.length;
      const score=Math.round((high*3+med*2+low)/((high+med+low)*3)*100);
      set('dHigh',high); set('dMed',med); set('dLow',low); set('dClean',clean);
      set('riskScoreVal',score+'/100');
      const bar=$('riskBarFill');
      if(bar){ bar.style.width=score+'%'; bar.style.background=score>70?'#e84040':score>45?'#f97316':'#f0b429'; }
      const idle=$('detIdle'); const scoreRow=$('riskScoreRow'); const summ=$('detSummary');
      if(idle) idle.style.display='none';
      if(scoreRow) scoreRow.style.display='flex';
      if(summ) summ.style.display='grid';
      const grid=$('flagsGrid');
      if(grid) grid.innerHTML=flags.map((f,i)=>`
        <div class="flag-card ${f.level}" style="animation-delay:${i*.07}s">
          <div class="flag-card-head"><div class="flag-dept">${f.dept}</div><span class="flag-risk-badge ${f.level}">${f.level.toUpperCase()}</span></div>
          <div class="flag-desc">${f.reason}</div>
          <div class="flag-metrics">${Object.entries(f.metrics).map(([k,v])=>`<span class="flag-metric"><strong>${k}:</strong> ${v}</span>`).join('')}</div>
        </div>`).join('');
      if(btn){ btn.disabled=false; btn.classList.remove('scanning'); btn.textContent='🔄 Re-Scan'; }
    },1800);
  }

  /* ─── MAP ─── */
  function renderMap(){
    if(leafletMap) return;
    const mapEl=$('map');
    if(!mapEl||typeof L==='undefined') return;
    leafletMap=L.map('map',{center:[-1.2864,36.8172],zoom:11});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; CARTO',maxZoom:19}).addTo(leafletMap);
    const colors={high:'#e84040',medium:'#f97316',low:'#2e9e5b'};
    DB.getWards().forEach(w=>{
      const r=clamp(w.budget/2_000_000*5,8,38);
      L.circleMarker([w.lat,w.lng],{radius:r,fillColor:colors[w.risk]||'#2e9e5b',color:'rgba(255,255,255,.3)',weight:1,fillOpacity:.7})
       .bindPopup(`<div style="font-family:DM Sans,sans-serif;min-width:160px"><strong>${w.name}</strong><br><span style="color:#888;font-size:.78rem">${w.sub}</span><br><span style="color:#2e9e5b;font-weight:600">${DB.fmt(w.budget)}</span><br><span style="color:${colors[w.risk]};font-size:.75rem;text-transform:uppercase">${w.risk} risk</span></div>`)
       .addTo(leafletMap);
    });
    const wl=$('wardList');
    if(wl){
      const sorted=[...DB.getWards()].sort((a,b)=>b.budget-a.budget);
      wl.innerHTML=sorted.map(w=>`
        <div class="revenue-stat" style="cursor:pointer" onclick="Backend.flyToWard(${w.lat},${w.lng})">
          <div><div class="rev-source">${w.name}</div><div style="font-size:.72rem;color:var(--text-dim)">${w.sub}</div></div>
          <div style="text-align:right"><div class="rev-amount">${DB.fmt(w.budget)}</div><div style="font-size:.68rem;color:${colors[w.risk]};text-transform:uppercase">${w.risk}</div></div>
        </div>`).join('');
    }
  }

  function flyToWard(lat,lng){ if(leafletMap) leafletMap.flyTo([lat,lng],14,{duration:1}); }

  /* ─── CASES ─── */
  function renderCases(filterStatus){
    let cases=DB.getCases();
    if(filterStatus&&filterStatus!=='all') cases=cases.filter(c=>c.status===filterStatus);
    set('ct-open',  DB.getCases().filter(c=>c.status==='open').length);
    set('ct-inv',   DB.getCases().filter(c=>c.status==='investigating').length);
    set('ct-res',   DB.getCases().filter(c=>c.status==='resolved').length);
    set('ct-tot',   DB.getCases().length);
    const list=$('casesList'); if(!list) return;
    list.innerHTML=cases.map(c=>{
      const dc=c.status==='open'?'dot-open':c.status==='investigating'?'dot-inv':'dot-res';
      const bc=c.status==='open'?'cb-open':c.status==='investigating'?'cb-inv':'cb-res';
      return `<div class="case-card2"><div class="case-dot ${dc}"></div><div><div class="case-type2">${c.type}</div><div class="case-title2">${c.title}</div><div class="case-meta2">${c.ward} · ${c.date} · <strong>${c.amount}</strong> · Ref: ${c.ref}</div></div><span class="case-badge2 ${bc}">${c.status.charAt(0).toUpperCase()+c.status.slice(1)}</span></div>`;
    }).join('');
  }

  /* ─── CONTACTS ─── */
  function renderContacts(){
    const grid=$('contactsGrid'); if(!grid) return;
    grid.innerHTML=DB.getContacts().map(c=>`
      <div class="con-card">
        <div class="con-name">${c.name}</div>
        <div class="con-detail">${c.detail}</div>
        <div class="con-phone">📞 ${c.phone}</div>
        ${c.email?`<div class="con-detail" style="margin-top:4px">✉️ <a href="mailto:${c.email}" style="color:var(--green-light);text-decoration:none">${c.email}</a></div>`:''}
        <div class="con-tags">${c.tags.map(t=>`<span class="badge badge-ok" style="font-size:.63rem">${t}</span>`).join('')}</div>
      </div>`).join('');
  }

  /* ─── REPORTS TAB ─── */
  function renderReportsTab(){
    const container=$('reportsGrid'); if(!container) return;
    const meta=DB.getReportMeta();
    const typeColors={Summary:'#2e9e5b',Revenue:'#f0b429',Development:'#42a5f5',Historical:'#a78bfa',Oversight:'#e84040',Ward:'#f97316'};
    container.innerHTML=meta.map(r=>`
      <div class="report-card" id="rcard-${r.id}">
        <div class="report-card-top">
          <span class="report-type-badge" style="background:${typeColors[r.type]||'#2e9e5b'}20;color:${typeColors[r.type]||'#2e9e5b'};border:1px solid ${typeColors[r.type]||'#2e9e5b'}40">${r.type}</span>
          <span class="report-rows">${r.rows} rows</span>
        </div>
        <div class="report-title">${r.title}</div>
        <div class="report-desc">${r.desc}</div>
        <div class="report-actions">
          <button class="report-btn report-btn-csv" onclick="Backend.downloadCSV('${r.id}','${r.title}')">⬇ CSV</button>
          <button class="report-btn report-btn-pdf" onclick="Backend.downloadPDF('${r.id}','${r.title}')">⬇ PDF</button>
        </div>
        <div class="report-progress" id="rprog-${r.id}" style="display:none">
          <div class="report-prog-bar"><div class="report-prog-fill" id="rpfill-${r.id}"></div></div>
          <span class="report-prog-label" id="rplabel-${r.id}">Generating…</span>
        </div>
      </div>`).join('');
    set('rstat-count', meta.length);
    set('rstat-rows',  meta.reduce((s,r)=>s+r.rows,0));
    set('rstat-updated', new Date().toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'}));
  }

  function showProgress(id,label,show){ const p=$('rprog-'+id),f=$('rpfill-'+id),l=$('rplabel-'+id); if(p) p.style.display=show?'flex':'none'; if(l) l.textContent=label; if(f){ f.style.width='0%'; if(show){ setTimeout(()=>f.style.width='60%',50); setTimeout(()=>f.style.width='90%',400); }}}
  function finishProgress(id,label){ const f=$('rpfill-'+id),l=$('rplabel-'+id); if(f) f.style.width='100%'; if(l) l.textContent=label; setTimeout(()=>showProgress(id,'',false),1800); }

  function downloadCSV(id,title){
    showProgress(id,'Building CSV…',true);
    setTimeout(()=>{
      const rows=DB.generateCSV(id);
      const header=[['Nairobi City County — Budget Transparency Platform'],[`Report: ${title}`],[`Generated: ${new Date().toISOString().split('T')[0]}`],['']];
      triggerDownload(csvToBlob([...header,...rows]),`nairobi-county-${id}-FY2025.csv`);
      finishProgress(id,'✓ CSV downloaded');
    },500);
  }

  async function downloadPDF(id,title){
    showProgress(id,'Loading PDF engine…',true);
    const ok=await ensureJsPDF();
    if(!ok){ finishProgress(id,'✗ Try CSV instead'); return; }
    showProgress(id,'Building PDF…',true);
    setTimeout(()=>{
      try{
        const {jsPDF}=window.jspdf;
        const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
        const W=297,M=14;
        const rows=DB.generateCSV(id);
        const headers=rows[0]; const dataRows=rows.slice(1);
        doc.setFillColor(7,21,14); doc.rect(0,0,W,297,'F');
        doc.setFillColor(13,51,32); doc.rect(0,0,W,22,'F');
        doc.setTextColor(95,207,133); doc.setFontSize(11); doc.setFont('helvetica','bold');
        doc.text('NAIROBI CITY COUNTY — BUDGET TRANSPARENCY PLATFORM',M,10);
        doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(122,171,140);
        doc.text(`${title} · Generated: ${new Date().toLocaleDateString('en-KE')}`,M,17);
        const colW=Math.min(46,(W-M*2)/Math.max(headers.length,1));
        let y=28; const rH=7;
        doc.setFillColor(22,46,30); doc.rect(M,y-5,W-M*2,rH+1,'F');
        doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(95,207,133);
        headers.forEach((h,i)=>{ const x=M+i*colW; if(x+colW>W-M) return; doc.text(String(h).slice(0,18),x+2,y,{maxWidth:colW-3}); });
        y+=rH; doc.setFont('helvetica','normal'); doc.setFontSize(6);
        dataRows.slice(0,38).forEach((row,ri)=>{
          if(y>195) return;
          if(ri%2===0){ doc.setFillColor(15,36,25); doc.rect(M,y-5,W-M*2,rH,'F'); }
          doc.setTextColor(232,245,237);
          row.forEach((cell,i)=>{ const x=M+i*colW; if(x+colW>W-M) return; doc.text(String(cell).slice(0,22),x+2,y,{maxWidth:colW-3}); });
          y+=rH;
        });
        if(dataRows.length>38){ doc.setTextColor(122,171,140); doc.setFontSize(7); doc.text(`… and ${dataRows.length-38} more rows — download CSV for full dataset`,M,y+5); }
        doc.setFillColor(13,51,32); doc.rect(0,200,W,7,'F');
        doc.setFontSize(6.5); doc.setTextColor(95,207,133);
        doc.text('Nairobi County Government · Budget Transparency & Accountability Platform · nairobi.go.ke',W/2,204,{align:'center'});
        doc.save(`nairobi-county-${id}-FY2025.pdf`);
        finishProgress(id,'✓ PDF downloaded');
      }catch(e){ console.error(e); finishProgress(id,'✗ Error — try CSV'); }
    },700);
  }

  /* ─── HISTORICAL COMPARISON TAB ─── */
  function renderHistorical(){
    const container=$('fyCardsGrid'); if(!container) return;
    const fyList=DB.getHistoricalFY();
    container.innerHTML=fyList.map((h,i)=>{
      const rev=DB.getRevenue(h.key);
      const prevRev=i>0?DB.getRevenue(fyList[i-1].key):null;
      const growth=prevRev?((rev.grandTotal-prevRev.grandTotal)/prevRev.grandTotal*100).toFixed(1):null;
      return `<div class="fy-card ${h.key==='fy2025'?'sel':''}" onclick="Backend.selectHistFY('${h.key}',this)">
        <div class="fy-card-label">FY ${h.fy}</div>
        <div class="fy-card-total">${DB.fmt(rev.grandTotal)}</div>
        <div class="fy-card-sub">Own Source: ${DB.fmt(rev.ownSource.subtotal)}</div>
        ${growth?`<div class="fy-card-growth ${parseFloat(growth)>=0?'up':'down'}">${parseFloat(growth)>=0?'▲':'▼'} ${Math.abs(growth)}% vs prev yr</div>`:'<div class="fy-card-growth up">Baseline year</div>'}
      </div>`;
    }).join('');
    buildHistCharts('fy2025');
    buildHistCompareTable('fy2025');
  }

  let selectedHistFY='fy2025';
  function selectHistFY(fyKey, el){
    document.querySelectorAll('.fy-card').forEach(c=>c.classList.remove('sel'));
    if(el) el.classList.add('sel');
    selectedHistFY=fyKey;
    buildHistCharts(fyKey);
    buildHistCompareTable(fyKey);
  }

  function buildHistCharts(fyKey){
    const fyList=DB.getHistoricalFY();
    // Multi-year allocation trend
    destroyChart('histTrendChart');
    const ctx=$('histTrendChart'); if(!ctx) return;
    const deptNames=['Health, Wellness & Nutrition','Boroughs & Public Administration','Finance & Economic Planning','Ward Development Programmes','Mobility & Works'];
    const datasets=deptNames.map((name,i)=>({
      label:name.split(' ').slice(0,3).join(' ')+'…',
      data:fyList.map(h=>{ const d=DB.getDepartments(h.key).find(d=>d.name===name); return d?d.total:0; }),
      borderColor:PALETTE[i], backgroundColor:PALETTE[i]+'15', fill:false, tension:.4, pointRadius:4,
    }));
    charts['histTrendChart']=new Chart(ctx,{
      type:'line',
      data:{ labels:fyList.map(h=>'FY '+h.fy), datasets },
      options:CHART_BASE,
    });

    // Selected FY own source breakdown
    destroyChart('histPieChart');
    const ctx2=$('histPieChart'); if(!ctx2) return;
    const rev=DB.getRevenue(fyKey).ownSource;
    const entries=Object.entries(rev).filter(([k])=>k!=='subtotal').sort((a,b)=>b[1]-a[1]).slice(0,8);
    charts['histPieChart']=new Chart(ctx2,{
      type:'doughnut',
      data:{ labels:entries.map(([k])=>k), datasets:[{ data:entries.map(([,v])=>v), backgroundColor:PALETTE, borderColor:'#07150e', borderWidth:2, hoverOffset:6 }]},
      options:{ ...CHART_BASE, cutout:'55%', plugins:{ legend:{ position:'bottom', labels:{ color:'#7aab8c', font:{family:'DM Sans',size:10}, boxWidth:10 }}}},
    });

    // Summary pills
    const rev2=DB.getRevenue(fyKey);
    const depts=DB.getDepartments(fyKey);
    const totalSpent=depts.reduce((s,d)=>s+d.spent,0);
    const totalAlloc=depts.reduce((s,d)=>s+d.total,0);
    const summPills=$('histSummPills');
    if(summPills) summPills.innerHTML=`
      <div class="fy-sum-pill"><div class="fy-sum-pill-val">${DB.fmt(rev2.grandTotal)}</div><div class="fy-sum-pill-lbl">Total Revenue</div></div>
      <div class="fy-sum-pill"><div class="fy-sum-pill-val">${DB.fmt(rev2.ownSource.subtotal)}</div><div class="fy-sum-pill-lbl">Own Source</div></div>
      <div class="fy-sum-pill"><div class="fy-sum-pill-val">${DB.fmt(totalAlloc)}</div><div class="fy-sum-pill-lbl">Total Allocated</div></div>
      <div class="fy-sum-pill"><div class="fy-sum-pill-val" style="color:var(--gold)">${DB.fmt(totalSpent)}</div><div class="fy-sum-pill-lbl">Est. Spent</div></div>
      <div class="fy-sum-pill"><div class="fy-sum-pill-val" style="color:var(--blue)">${pct(totalSpent,totalAlloc)}%</div><div class="fy-sum-pill-lbl">Utilisation</div></div>`;
  }

  function buildHistCompareTable(fyKey){
    const tbody=document.querySelector('#histTable tbody'); if(!tbody) return;
    const depts=DB.getDepartments(fyKey).sort((a,b)=>b.total-a.total).slice(0,10);
    const depts25=DB.getDepartments('fy2025');
    tbody.innerHTML=depts.map(d=>{
      const d25=depts25.find(x=>x.id===d.id);
      const diff=d25?Math.round(((d25.total-d.total)/d.total)*100):0;
      const arrow=diff>0?`<span style="color:var(--green-light)">▲${diff}%</span>`:`<span style="color:var(--red)">▼${Math.abs(diff)}%</span>`;
      return `<tr><td>${d.name}</td><td>${DB.fmt(d.total)}</td><td>${DB.fmt(d.spent)}</td><td>${d.utilisation}%</td><td>${d25?DB.fmt(d25.total):'—'}</td><td>${d25?arrow:'—'}</td></tr>`;
    }).join('');
  }

  /* ─── COMMUNITY COMMENTS ─── */
  const avatarColors=['#2e9e5b','#f0b429','#42a5f5','#e84040','#f97316','#a78bfa','#34d399','#fb7185'];
  const seedComments=[
    { id:1, name:'Wanjiku Mwangi', ward:'Kibra', avatar:'WM', color:'#2e9e5b', tag:'health', time:'2 hours ago', body:'The KES 10.7B for Health is good on paper but our dispensary in Kibra has been without drugs for 3 months. Where is the money actually going? <strong>We need real-time tracking of medicine procurement.</strong>', likes:47, dislikes:3, replies:[{author:'Peter K.',body:'Same issue in Mathare. The community health promoters have not been paid in months.',time:'1 hour ago'}] },
    { id:2, name:'James Otieno',   ward:'Kasarani', avatar:'JO', color:'#f0b429', tag:'infra', time:'5 hours ago', body:'Road maintenance budget is KES 218M but look at the roads in Kasarani — full of potholes. The <strong>Sunton-Mugumoini road has been at 50% completion for 2 years</strong>. Accountability please.', likes:89, dislikes:5, replies:[] },
    { id:3, name:'Amina Hassan',   ward:'Eastleigh South', avatar:'AH', color:'#42a5f5', tag:'revenue', time:'1 day ago', body:'Business permits at KES 3.6B — my kiosk was charged 3x the official rate this year. <strong>Inspectors are extorting traders and the money never reaches the county.</strong> EACC needs to investigate Eastleigh specifically.', likes:124, dislikes:8, replies:[{author:'Official Response','body':'Thank you for this report. Please call 0800 720 750 to file a formal complaint with reference to this ward.',time:'20 hours ago'}] },
    { id:4, name:'David Kimani',   ward:'Westlands', avatar:'DK', color:'#e84040', tag:'edu', time:'1 day ago', body:'The ECDE budget of KES 200M sounds great. But the Westlands Day Nursery has had no teacher for 6 months because nobody has been hired. <strong>Budget allocation ≠ service delivery.</strong> We need MCA accountability.', likes:67, dislikes:2, replies:[] },
    { id:5, name:'Grace Njoroge',  ward:'Ruaraka', avatar:'GN', color:'#f97316', tag:'water', time:'2 days ago', body:'KES 96M for ablution blocks and KES 70M for boreholes. <strong>Utalii ward still has no functioning borehole since 2023.</strong> The money was allocated — where did it go? Can the Controller of Budget investigate?', likes:93, dislikes:4, replies:[{author:'Samuel O.','body':'Completely agree. The borehole in Lucky Summer ward was drilled but the pump was never installed. Contractor vanished.',time:'1 day ago'}] },
    { id:6, name:'Moses Kariuki',  ward:'Nairobi Central', avatar:'MK', color:'#a78bfa', tag:'general', time:'3 days ago', body:'I appreciate the transparency this platform provides. The <strong>KES 2.155B ward development fund is a positive step</strong> — but we need each ward\'s breakdown published online. Citizens should see exactly what projects are planned for their area.', likes:156, dislikes:1, replies:[] },
    { id:7, name:'Fatuma Ali',     ward:'Kamukunji', avatar:'FA', color:'#34d399', tag:'revenue', time:'3 days ago', body:'Gikomba market generates hundreds of millions monthly yet the county budget shows only KES 565M from all markets combined. <strong>This gap represents billions in uncollected revenue stolen at source.</strong> Digitise all market collection immediately.', likes:201, dislikes:7, replies:[{author:'Lucy M.','body':'100% agree. Same happens at Muthurwa. Cash-only collection with no receipts is the core problem.',time:'2 days ago'}] },
    { id:8, name:'Paul Mwenda',    ward:'Makadara', avatar:'PM', color:'#fb7185', tag:'infra', time:'4 days ago', body:'The Makadara Sub County office construction is at 40% after years. KES 45M allocated again this FY. <strong>Same contractor, same stall, different budget line.</strong> This is how money disappears — no penalty clauses enforced.', likes:78, dislikes:3, replies:[] },
  ];

  commentStore=[...seedComments];

  function renderComments(filterTag){
    // Stats
    set('cstat-total', commentStore.length);
    set('cstat-likes', commentStore.reduce((s,c)=>s+c.likes,0));
    set('cstat-wards', [...new Set(commentStore.map(c=>c.ward))].length);
    set('cstat-replies', commentStore.reduce((s,c)=>s+c.replies.length,0));

    const list=$('commentsList'); if(!list) return;
    let filtered=filterTag&&filterTag!=='all'?commentStore.filter(c=>c.tag===filterTag):commentStore;
    const visible=filtered.slice(0,visibleComments);

    list.innerHTML=visible.map((c,idx)=>`
      <div class="comment-card" id="cc-${c.id}" style="animation-delay:${idx*.06}s">
        <div class="comment-header">
          <div class="comment-author">
            <div class="comment-avatar" style="background:${c.color}20;color:${c.color};border:2px solid ${c.color}40">${c.avatar}</div>
            <div><div class="comment-name">${c.name}</div><div class="comment-ward">${c.ward} Ward</div></div>
          </div>
          <div class="comment-meta">
            <span class="comment-tag-badge ctb-${c.tag}">${c.tag}</span>
            <span class="comment-time">${c.time}</span>
          </div>
        </div>
        <div class="comment-body">${c.body}</div>
        <div class="comment-footer">
          <button class="comment-vote" onclick="Backend.voteComment(${c.id},'up',this)">👍 <span id="cl-${c.id}">${c.likes}</span></button>
          <button class="comment-vote down" onclick="Backend.voteComment(${c.id},'down',this)">👎 <span id="cd-${c.id}">${c.dislikes}</span></button>
          <button class="comment-reply-btn" onclick="Backend.toggleReplyForm(${c.id})">💬 Reply (${c.replies.length})</button>
        </div>
        ${c.replies.length?`<div class="comment-replies">${c.replies.map(r=>`<div class="reply-card"><div class="reply-author">${r.author}</div><div class="reply-body">${r.body}</div><div class="reply-time">${r.time}</div></div>`).join('')}</div>`:''}
        <div class="reply-form" id="rf-${c.id}">
          <input class="reply-form input" type="text" placeholder="Your name (optional — leave blank to post anonymously)" id="rname-${c.id}">
          <input class="reply-form input" type="text" placeholder="Write your reply…" id="rbody-${c.id}" style="margin-top:0">
          <div class="reply-form-actions">
            <button class="btn-reply-cancel" onclick="Backend.toggleReplyForm(${c.id})">Cancel</button>
            <button class="btn-reply-sub" onclick="Backend.submitReply(${c.id})">Post Reply</button>
          </div>
        </div>
      </div>`).join('');

    const lmb=$('loadMoreBtn');
    if(lmb) lmb.style.display=filtered.length>visibleComments?'block':'none';
  }

  function voteComment(id, dir, el){
    const c=commentStore.find(x=>x.id===id); if(!c) return;
    if(el.classList.contains('voted')) return;
    if(dir==='up') c.likes++; else c.dislikes++;
    el.classList.add('voted');
    const span=$('c'+(dir==='up'?'l':'d')+'-'+id);
    if(span) span.textContent=dir==='up'?c.likes:c.dislikes;
  }

  function toggleReplyForm(id){
    const rf=$('rf-'+id);
    if(rf){ rf.classList.toggle('open'); const i=$('rbody-'+id); if(i&&rf.classList.contains('open')) i.focus(); }
  }

  function submitReply(id){
    const c=commentStore.find(x=>x.id===id); if(!c) return;
    const nameEl=$('rname-'+id); const bodyEl=$('rbody-'+id);
    const body=bodyEl?bodyEl.value.trim():'';
    if(!body) return;
    const name=nameEl&&nameEl.value.trim()?nameEl.value.trim():'Anonymous Resident';
    c.replies.push({ author:name, body, time:'Just now' });
    renderComments();
  }

  function submitComment(){
    const nameEl=$('cmtName'); const wardEl=$('cmtWard'); const bodyEl=$('cmtBody');
    const body=bodyEl?bodyEl.value.trim():'';
    if(!body){ alert('Please write your comment before submitting.'); return; }
    const anonEl=$('cmtAnon');
    const isAnon=anonEl&&anonEl.checked;
    const name=isAnon?'Anonymous Resident':(nameEl&&nameEl.value.trim()?nameEl.value.trim():'Anonymous Resident');
    const ward=wardEl&&wardEl.value.trim()?wardEl.value.trim():'Nairobi';
    const activeTag=document.querySelector('.ctag.active');
    const tag=activeTag?activeTag.dataset.tag:'general';
    const initials=name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'A';
    const color=avatarColors[Math.floor(Math.random()*avatarColors.length)];
    const newComment={ id:Date.now(), name, ward, avatar:initials, color, tag, time:'Just now', body, likes:0, dislikes:0, replies:[] };
    commentStore.unshift(newComment);
    if(nameEl) nameEl.value=''; if(wardEl) wardEl.value=''; if(bodyEl) bodyEl.value='';
    document.querySelectorAll('.ctag').forEach(t=>t.classList.remove('active'));
    renderComments();
    $('commentsList').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function loadMoreComments(){
    visibleComments+=4;
    renderComments();
  }

  /* ─── PEOPLE'S BUDGET ─── */
  function renderPeoplesBudget(){
    const total=DB.BASE_TOTAL;
    const depts=DB.deptBase;
    if(!pbValues||Object.keys(pbValues).length===0){
      pbValues={};
      depts.forEach(d=>{ pbValues[d.id]=d.recurrent+d.development; });
    }
    const grid=$('pbSlidersGrid'); if(!grid) return;
    const icons={HWN:'🏥',TSDC:'🎓',MW:'🛣️',EWER:'🌿',BPA:'🏛️',FEP:'💰',WDP:'🏘️',CASS:'⚖️',IDE:'💻',BHO:'🛒',BEUP:'🏗️',PSM:'👥',ALFF:'🌾',IPCE:'🤝',MW2:'🚦',LLB:'🍺',NRA:'📊',CA:'⚖️',EF:'🚨',CPSB:'🏢'};
    grid.innerHTML=depts.map(d=>{
      const orig=d.recurrent+d.development;
      const cur=pbValues[d.id]||orig;
      const min=Math.round(orig*.3); const max=Math.round(orig*2);
      const pctChg=Math.round(((cur-orig)/orig)*100);
      const pill=pctChg>0?`<span class="pb-change-pill pb-change-up">+${pctChg}%</span>`:pctChg<0?`<span class="pb-change-pill pb-change-down">${pctChg}%</span>`:`<span class="pb-change-pill pb-change-same">No change</span>`;
      return `<div class="pb-slider-card">
        <div class="pb-slider-head">
          <div class="pb-slider-name"><span class="pb-slider-icon">${icons[d.id]||'📌'}</span>${d.name.split(',')[0]}</div>
          <div class="pb-slider-val" id="pbval-${d.id}">${DB.fmt(cur)} ${pill}</div>
        </div>
        <div class="pb-orig-val">Official allocation: ${DB.fmt(orig)}</div>
        <input type="range" min="${min}" max="${max}" step="${Math.round(orig*.01)}" value="${cur}"
          oninput="Backend.onPBSlider('${d.id}',this.value)"
          style="accent-color:${pctChg>0?'var(--green-bright)':pctChg<0?'var(--red)':'var(--gold)'}">
        <input type="text" class="pb-rationale-input" placeholder="Why this change? (optional)" id="pbrat-${d.id}">
      </div>`;
    }).join('');
    updatePBTotal();
  }

  function onPBSlider(id, val){
    pbValues[id]=parseInt(val);
    const orig=DB.deptBase.find(d=>d.id===id);
    if(!orig) return;
    const origVal=orig.recurrent+orig.development;
    const cur=parseInt(val);
    const pctChg=Math.round(((cur-origVal)/origVal)*100);
    const pill=pctChg>0?`<span class="pb-change-pill pb-change-up">+${pctChg}%</span>`:pctChg<0?`<span class="pb-change-pill pb-change-down">${pctChg}%</span>`:`<span class="pb-change-pill pb-change-same">No change</span>`;
    const el=$('pbval-'+id);
    if(el) el.innerHTML=`${DB.fmt(cur)} ${pill}`;
    updatePBTotal();
  }

  function updatePBTotal(){
    const total=DB.BASE_TOTAL;
    const cur=Object.values(pbValues).reduce((s,v)=>s+v,0);
    const remaining=total-cur;
    const displayEl=$('pbTotalDisplay'); const pillEl=$('pbRemainingPill');
    if(displayEl) displayEl.textContent=DB.fmt(cur);
    if(pillEl){
      if(Math.abs(remaining)<total*.01){
        pillEl.className='pb-remaining-pill pb-remaining-ok';
        pillEl.textContent='✓ Balanced';
      } else if(remaining>0){
        pillEl.className='pb-remaining-pill pb-remaining-ok';
        pillEl.textContent=`KES ${DB.fmt(remaining)} remaining`;
      } else {
        pillEl.className='pb-remaining-pill pb-remaining-over';
        pillEl.textContent=`⚠ Over by ${DB.fmt(Math.abs(remaining))}`;
      }
    }
  }

  function resetPB(){
    pbValues={};
    DB.deptBase.forEach(d=>{ pbValues[d.id]=d.recurrent+d.development; });
    renderPeoplesBudget();
    const result=$('pbResult'); if(result) result.classList.remove('show');
  }

  function generatePeoplesBudget(){
    const result=$('pbResult'); if(!result) return;
    const total=DB.BASE_TOTAL;
    const cur=Object.values(pbValues).reduce((s,v)=>s+v,0);
    const over=cur-total;

    const grid=$('pbResultGrid'); if(grid){
      grid.innerHTML=DB.deptBase.map(d=>{
        const orig=d.recurrent+d.development;
        const cur2=pbValues[d.id]||orig;
        const diff=cur2-orig;
        const pctChg=Math.round(((cur2-orig)/orig)*100);
        const rat=$('pbrat-'+d.id);
        const ratText=rat&&rat.value.trim()?`<div style="font-size:.68rem;color:var(--text-muted);margin-top:3px;font-style:italic">"${rat.value.trim()}"</div>`:'';
        return `<div class="pb-res-card">
          <div class="pb-res-dept">${d.name}</div>
          <div class="pb-res-alloc" style="color:${diff>0?'var(--green-light)':diff<0?'var(--red)':'var(--text)'}">${DB.fmt(cur2)}</div>
          <div class="pb-res-orig">Official: ${DB.fmt(orig)}</div>
          <div class="pb-res-diff ${diff>=0?'plus':'minus'}">${diff>=0?'+':''}${DB.fmt(Math.abs(diff))} (${diff>=0?'+':''}${pctChg}%)</div>
          ${ratText}
        </div>`;
      }).join('');
    }

    const hero=$('pbResultHero'); if(hero){
      hero.innerHTML=`
        <h3>🌱 Your People's Budget for Nairobi — FY 2025/2026</h3>
        <p>Your proposed allocation totals <strong style="color:var(--green-light)">${DB.fmt(cur)}</strong> against the official budget of <strong style="color:var(--text)">${DB.fmt(total)}</strong>.
        ${Math.abs(over)<total*.01?'Your budget is <strong>balanced</strong> — great work!':over>0?`Your budget is <strong style="color:var(--red)">over by ${DB.fmt(over)}</strong> — consider reducing some allocations.`:`Your budget has <strong style="color:var(--green-light)">${DB.fmt(Math.abs(over))}</strong> unallocated — consider directing it to priority sectors.`}
        Your priorities reflect the choices Nairobi residents want to see. Download and share this budget to participate in the public participation process.</p>`;
    }

    result.classList.add('show');
    result.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function downloadPBCSV(){
    const rows=[['Department','Official Allocation (KES)','Your Allocation (KES)','Difference (KES)','Change %','Rationale']];
    DB.deptBase.forEach(d=>{
      const orig=d.recurrent+d.development;
      const cur=pbValues[d.id]||orig;
      const rat=$('pbrat-'+d.id);
      rows.push([d.name,orig,cur,cur-orig,Math.round(((cur-orig)/orig)*100)+'%',rat?rat.value:'']);
    });
    rows.push(['','','','','','']);
    rows.push(['Generated by Nairobi County Budget Transparency Platform','','','','','']);
    rows.push([`Date: ${new Date().toLocaleDateString('en-KE')}`,'','','','','']);
    triggerDownload(csvToBlob(rows),'nairobi-peoples-budget-FY2025.csv');
  }

  /* ─── EACC FORM ─── */
  function setEACCStep(n){
    eaccStep=clamp(n,1,4);
    document.querySelectorAll('.spanel').forEach((p,i)=>p.classList.toggle('active',i===eaccStep-1));
    document.querySelectorAll('.fstep').forEach((s,i)=>s.classList.toggle('active',i===eaccStep-1));
  }

  function submitEACC(){
    const ref='EACC-'+Date.now().toString(36).toUpperCase();
    const sb=$('successBox');
    if(sb){ sb.style.display='block'; sb.innerHTML=`✅ <strong>Complaint submitted.</strong> Reference: <strong>${ref}</strong><br>Call 0800 720 750 or email eacc@integrity.go.ke quoting this reference.<br><a href="https://eacc.go.ke" target="_blank" style="color:var(--green-light)">eacc.go.ke</a>`; }
  }

  /* ─── FY CHANGE ─── */
  function onFYChange(fy){
    currentFY=fy==='all'?'fy2025':'fy'+fy.slice(-2);
    const pill=$('fyPill');
    if(pill) pill.textContent=fy==='all'?'📅 All Fiscal Years':`📅 FY ${fy}/${parseInt(fy)-1999}`;
    renderDashboardStats(currentFY);
    renderBudgetChart(currentFY);
    renderPieChart(currentFY);
    renderBudgetTable(null,currentFY);
  }

  /* ─── INIT ─── */
  function init(){
    renderDashboardStats('fy2025');
    renderBudgetChart('fy2025');
    renderPieChart('fy2025');
    renderBudgetTable(null,'fy2025');
    populateDeptFilter();
    renderCases('all');
  }

  return {
    init, showTab, onFYChange, runScan, flyToWard,
    renderBudgetTable, renderCases, renderReportsTab, renderRevenue,
    downloadCSV, downloadPDF,
    renderHistorical, selectHistFY,
    renderComments, voteComment, toggleReplyForm, submitReply, submitComment, loadMoreComments,
    renderPeoplesBudget, onPBSlider, resetPB, generatePeoplesBudget, downloadPBCSV,
    setEACCStep, submitEACC,
  };
})();

/* ── BOOT ── */
const T={
  en:{t1:'Budget Dashboard',t2:'Revenue Streams',t3:'Corruption Detector',t4:'Ward Map',t5:'Where It Leaks',t6:'Case Tracker',t7:'Report to EACC',t8:'Key Contacts',t9:'Historical Data',t10:'Community Comments',t11:'People\'s Budget',t12:'Reports & Downloads'},
  sw:{t1:'Dashibodi ya Bajeti',t2:'Vyanzo vya Mapato',t3:'Kigunduzi',t4:'Ramani ya Kata',t5:'Mapungufu',t6:'Fuatilia Kesi',t7:'Ripoti kwa EACC',t8:'Mawasiliano',t9:'Data ya Zamani',t10:'Maoni ya Wananchi',t11:'Bajeti ya Wananchi',t12:'Ripoti na Vipakuliwa'}
};
let lang='en';
const tabKeys=['budget','revenue','detector','map','accountability','tracker','report','contacts','historical','comments','peoples-budget','reports'];

function toggleLang(){
  lang=lang==='en'?'sw':'en';
  $('langBtn').textContent=lang==='en'?'SW':'EN';
  tabKeys.forEach((tab,i)=>{
    const btn=document.querySelector(`[data-tab="${tab}"]`);
    if(btn&&T[lang]['t'+(i+1)]){
      const icon=btn.querySelector('.tab-icon');
      btn.innerHTML=`<span class="tab-icon">${icon?icon.textContent:'📌'}</span> ${T[lang]['t'+(i+1)]}`;
    }
  });
}

function setCaseFilter(el,status){
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  Backend.renderCases(status);
}

function setCommentFilter(el,tag){
  document.querySelectorAll('.filter-btns .fbtn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  Backend.renderComments(tag);
}

function toggleCtag(el){
  document.querySelectorAll('.ctag').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
}

document.addEventListener('DOMContentLoaded',()=>Backend.init());
