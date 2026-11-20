/* Offline schematic and resilient online maps. All stored coordinates are GCJ-02. */
import { createProviderMap, getAvailableProviders, providerLabel } from './map-providers.js';
import { raceMapProviders } from './map-routing.js';
const COLORS = { red: '#df6a5d', yellow: '#e7b64c', green: '#268870', unvisited: '#9ba79d' };
const STATUS = { red: '未铺货', yellow: '待提升', green: '已达标', unvisited: '未走访' };
const SYMBOLS = { A: '★', B: '▲', C: '●', ungraded: '待分级' };
const safeStatus = value => Object.hasOwn(COLORS, value) ? value : 'unvisited';
const safeGrade = value => Object.hasOwn(SYMBOLS, value) ? value : 'ungraded';
const gradeLabel = value => ['A', 'B', 'C'].includes(value) ? `${SYMBOLS[value]} ${value} 类门店` : '待分级';
function sourceLabel(store) {
  const origin = store.source === 'tencent' || store.catalogRecord === true ? '腾讯地点名录' : store.isDemo === true ? '演示门店' : '人工登记';
  return `${origin}${store.annotationIsDemo === true ? ' · 演示标记，待现场核实' : ''}`;
}

const CSS = `
.sm-user-location{position:absolute;width:30px;height:30px;transform:translate(-50%,-50%);border-radius:50%;border:1px solid #3384e470;background:#348bde28;pointer-events:none;z-index:8;box-shadow:0 0 0 8px #348bde10}.sm-user-location:after{content:'';position:absolute;inset:8px;border-radius:50%;background:#348bde;border:2px solid white;box-shadow:0 1px 4px #235c8c60}.sm-user-location-label{position:absolute;top:33px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10px;color:#337ab4;background:#fffffff0;padding:3px 6px;border-radius:4px}.sm-selection-note{position:absolute;left:13px;top:13px;z-index:8;max-width:min(250px,calc(100% - 75px));padding:9px 12px;border:1px solid #dfe7dc;background:#fffffff2;border-radius:8px;box-shadow:0 3px 12px #254b2e10;pointer-events:none;color:#496541;line-height:1.6}.sm-selection-note strong{display:block;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sm-selection-note span{font-size:10px;display:block;color:#829275}.sm-selected .sm-source-line{display:block;margin-top:4px;color:#a19a78;font-size:9px;white-space:normal;line-height:1.5}.sm-selection-note[hidden]{display:none}
.sm{position:relative;width:100%;height:100%;min-height:380px;isolation:isolate;background:#e9eddf;overflow:hidden;font-family:inherit;border-radius:inherit;touch-action:none}
.sm-stage,.sm-online{position:absolute;inset:0;width:100%;height:100%}.sm-stage{cursor:grab;overflow:hidden;z-index:2;touch-action:none}.sm-stage:active{cursor:grabbing}.sm-stage svg.sm-base{display:block;width:100%;height:100%;pointer-events:none}
.sm-online{z-index:1}.sm-online[hidden],.sm-stage[hidden]{display:none}.sm .sm-markers{position:absolute;inset:0;pointer-events:none}.sm-pin{position:absolute;width:40px;height:42px;transform:translate(-50%,-50%);padding:0;background:none;border:0;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 3px 3px #385a4234);z-index:2;transition:filter .15s,margin-top .15s;display:grid;place-items:center}.sm-pin:hover,.sm-pin:focus-visible{z-index:6;margin-top:-3px;filter:drop-shadow(0 4px 5px #243c4c60);outline:none}.sm-pin:focus-visible:after{content:'';position:absolute;inset:-3px;border:2px solid #204d40;border-radius:50%}.sm-pin.is-selected{z-index:7;filter:drop-shadow(0 4px 5px #254c4548)}.sm-pin.is-selected:before{content:'';position:absolute;width:43px;height:43px;border-radius:50%;background:#ffffffa6;border:1px solid #1f775f4d;z-index:-1}.sm-pin svg{width:36px;height:38px;overflow:visible}.sm-selected{position:absolute;pointer-events:none;z-index:9;transform:translate(-50%,calc(-100% - 25px));background:#fff;padding:10px 13px;border:1px solid #e4e9e2;border-radius:9px;box-shadow:0 6px 24px #31493f16;max-width:230px;min-width:110px;white-space:nowrap;color:#233e35;font-size:12px;line-height:1.6}.sm-selected:after{content:'';position:absolute;bottom:-5px;left:calc(50% - 5px);width:8px;height:8px;background:#fff;transform:rotate(45deg);border-bottom:1px solid #e4e9e2;border-right:1px solid #e4e9e2}.sm-selected strong{display:block;font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis}.sm-selected span{font-size:11px;color:#7d887e}.sm-note{position:absolute;left:15px;bottom:15px;z-index:5;background:#ffffffdf;border:1px solid #e1e7dc;border-radius:6px;padding:6px 9px;color:#6f7c6d;font-size:10px;letter-spacing:.2px;pointer-events:none;box-shadow:0 2px 8px #394b3124}.sm-note b{color:#53644f;font-weight:500}.sm-compass{position:absolute;right:17px;top:18px;z-index:5;display:grid;place-items:center;width:29px;height:37px;color:#798675;background:#fff9;border:1px solid #e4e9df;border-radius:6px;font-size:9px;line-height:1}.sm-compass:before{content:'';border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:14px solid #63806c;margin-top:4px}.sm-attribution{font-size:10px;fill:#788871;letter-spacing:1px}.sm-town{font-size:15px;font-weight:500;fill:#66785e;paint-order:stroke;stroke:#f3f5eb;stroke-width:4px}.sm-road-text{font-size:10px;fill:#bdab75;paint-order:stroke;stroke:#fbfaf3;stroke-width:3px}.sm-road-number{font-size:9px;fill:#a1ab8c}.sm-water-label{font-size:12px;fill:#7dada8;letter-spacing:4px}.sm-small-label{font-size:11px;fill:#a2ab95;paint-order:stroke;stroke:#edf1e5;stroke-width:3px}.sm-real-note{position:absolute;top:15px;left:15px;z-index:4;font-size:10px;background:#fffd;color:#61756a;padding:6px 9px;border-radius:5px;pointer-events:none}
`;

const BASEMAP = `
<defs>
 <pattern id="sm-grid" width="55" height="55" patternUnits="userSpaceOnUse"><path d="M 55 0 L 0 0 0 55" fill="none" stroke="#d9e0cf" stroke-width=".5" opacity=".5"/></pattern>
 <pattern id="sm-crops" width="26" height="22" patternUnits="userSpaceOnUse"><path d="M0 11H26M13 0V22" fill="none" stroke="#d9e2ce" stroke-width=".7"/></pattern>
 <filter id="sm-soft"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="1440" height="1000" x="-200" y="-100" fill="#eaf0e2"/>
<rect width="1840" height="1200" x="-200" y="-100" fill="url(#sm-grid)"/>
<g fill="#dce6cf" opacity=".72">
 <path d="M-50 40L245 15 328 126 273 220 115 264-25 211Z"/><path d="M285-15L457-15 529 55 486 179 360 161 309 89Z"/>
 <path d="M63 310L215 266 343 325 331 449 219 501 67 458Z"/><path d="M-20 552L188 509 303 581 268 733 48 751-38 660Z"/>
 <path d="M323 664L467 613 521 752 431 873 290 861 254 762Z"/><path d="M3 812L174 762 277 874 227 1024-10 1058Z"/>
 <path d="M422 37L580 14 689 77 639 168 535 188 500 108Z"/><path d="M553 891L682 827 788 903 781 1049 553 1052Z"/>
</g>
<g fill="#e1e9d7" stroke="#d7e0c9" stroke-width="1.5">
 <path d="M330 235L456 196 525 253 504 357 395 373 333 326Z"/><path d="M455 394L560 362 626 411 607 486 523 514 460 476Z"/>
 <path d="M565 183L697 156 724 240 639 284 557 254Z"/><path d="M690 54L818 48 855 141 761 178 708 127Z"/>
 <path d="M783 215L875 180 936 258 900 337 803 320Z"/><path d="M799 705L919 684 957 766 889 830 800 789Z"/>
 <path d="M569 606L670 588 712 656 665 730 558 717Z"/><path d="M679 737L782 703 801 814 729 850 659 810Z"/>
</g>
<g fill="url(#sm-crops)" opacity=".8">
 <path d="M436 528L526 515 559 570 523 638 433 647 400 580Z"/><path d="M670 317L743 302 781 361 743 400 661 389Z"/>
 <path d="M801 378L895 354 936 414 890 473 817 451Z"/><path d="M815 540L918 526 954 589 920 650 825 647Z"/>
</g>
<!-- Coastline is deliberately schematic, rather than a surveyed boundary. -->
<path d="M982-110L968 25 945 101 978 177 971 253 1005 317 990 381 1026 441 1019 508 1039 574 1035 642 1080 710 1106 790 1107 880 1158 1020 1640 1100 1640-110Z" fill="#d9eae5"/>
<path d="M982-110L968 25 945 101 978 177 971 253 1005 317 990 381 1026 441 1019 508 1039 574 1035 642 1080 710 1106 790 1107 880 1158 1020" fill="none" stroke="#c2dbcd" stroke-width="6"/>
<g fill="none" stroke="#c7ddd2" stroke-width="1.2" opacity=".8"><path d="M1075 95Q1200 80 1300 120"/><path d="M1100 310Q1230 283 1370 334"/><path d="M1140 532Q1280 507 1410 549"/><path d="M1210 750Q1320 727 1450 767"/></g>
<!-- Wanquan River and tributaries. -->
<path d="M45 930C154 826 125 735 247 671S341 554 441 518 564 491 620 518 674 489 717 505 778 565 806 573 836 581 857 621 929 650 959 652 994 665 1050 645" fill="none" stroke="#c6e2d9" stroke-width="23" stroke-linecap="round"/>
<path d="M45 930C154 826 125 735 247 671S341 554 441 518 564 491 620 518 674 489 717 505 778 565 806 573 836 581 857 621 929 650 959 652 994 665 1050 645" fill="none" stroke="#b4d7d0" stroke-width="12" stroke-linecap="round"/>
<path d="M293 71C324 152 311 271 359 350S412 468 441 518M531 894C536 812 588 751 599 677S641 575 620 518" fill="none" stroke="#c2dcd0" stroke-width="8" stroke-linecap="round"/>
<g fill="#e0e5d8" opacity=".75">
 <path d="M645 408L721 390 784 408 814 473 773 508 696 490 655 455Z"/>
 <path d="M728 532L783 524 814 569 790 603 746 578Z"/><path d="M852 610L899 591 939 622 939 650 885 654Z"/>
</g>
<!-- Residential blocks. -->
<g fill="#e8e6d9" stroke="#dddecf" stroke-width=".8">
 <path d="M673 420h24v20h-24zM704 412h28v24h-28zM742 418h24v18h-24zM676 449h31v23h-31zM717 445h21v31h-21zM749 447h30v19h-30zM784 447h17v28h-17zM689 481h28v15h-28zM753 479h30v21h-30z"/>
 <path d="M720 370h24v22h-24zM752 372h28v18h-28zM749 341h23v22h-23zM789 366h19v25h-19zM735 545h20v17h-20zM764 535h20v24h-20zM786 566h21v15h-21z"/>
 <path d="M902 468h23v18h-23zM934 465h21v28h-21zM902 495h27v22h-27zM934 503h21v15h-21zM884 634h21v18h-21zM914 633h21v17h-21zM895 662h18v20h-18z"/>
</g>
<!-- Roads, rendered as white lanes with quiet borders. -->
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
 <g stroke="#d8dccc" stroke-width="11"><path d="M617-20C641 99 709 204 735 316S728 469 749 554 807 715 822 845 849 961 861 1030"/><path d="M354 112C448 185 529 243 581 321S660 418 738 445 867 466 936 490 987 499 1031 507"/><path d="M343 777C448 727 513 685 611 651S744 593 811 598 924 643 1023 646"/></g>
 <g stroke="#fcfbf4" stroke-width="8"><path d="M617-20C641 99 709 204 735 316S728 469 749 554 807 715 822 845 849 961 861 1030"/><path d="M354 112C448 185 529 243 581 321S660 418 738 445 867 466 936 490 987 499 1031 507"/><path d="M343 777C448 727 513 685 611 651S744 593 811 598 924 643 1023 646"/></g>
 <g stroke="#d8dccc" stroke-width="6"><path d="M540 101L543 238 581 321 538 418 505 502 534 589 611 651 647 801 700 932"/><path d="M816 138L783 264 735 316 856 347 946 324"/><path d="M409 381L538 418 615 385 738 386 857 423 936 490 906 586 911 641 942 741 1016 777"/><path d="M582 321L673 291 735 316 828 279 962 261"/><path d="M749 554L849 528 936 490 996 435"/><path d="M405 546L505 502 579 557 647 547 749 554"/><path d="M453 682L476 781 565 855 647 801 731 767 799 696"/></g>
 <g stroke="#fbfbf3" stroke-width="4"><path d="M540 101L543 238 581 321 538 418 505 502 534 589 611 651 647 801 700 932"/><path d="M816 138L783 264 735 316 856 347 946 324"/><path d="M409 381L538 418 615 385 738 386 857 423 936 490 906 586 911 641 942 741 1016 777"/><path d="M582 321L673 291 735 316 828 279 962 261"/><path d="M749 554L849 528 936 490 996 435"/><path d="M405 546L505 502 579 557 647 547 749 554"/><path d="M453 682L476 781 565 855 647 801 731 767 799 696"/></g>
 <path d="M662-30C684 120 764 198 780 326S781 482 805 556 845 695 864 818 895 974 905 1030" stroke="#e1ce95" stroke-width="8"/>
 <path d="M662-30C684 120 764 198 780 326S781 482 805 556 845 695 864 818 895 974 905 1030" stroke="#faf3dc" stroke-width="4"/>
 <g stroke="#fafbf3" stroke-width="2.4" opacity=".95"><path d="M696 400L688 481M731 393L728 494M770 406L774 505M650 438L802 432M661 476L808 476M898 462L897 520M929 462L929 525M887 491L958 494M734 537L797 578M747 564L784 532M882 627L941 662"/></g>
</g>
<g fill="none" stroke="#c5d0b6" stroke-width="1.3" stroke-dasharray="5 5" opacity=".7">
 <path d="M347 115L448 198 539 202 631 135 707 158 824 174 951 128"/><path d="M287 310L392 373 457 397 550 357 636 381 674 291 785 261 859 347 983 380"/>
 <path d="M229 610L349 590 405 546 489 571 536 651 648 626 717 693 790 664 867 710 1036 707"/>
</g>
<g class="sm-road-text"><text x="783" y="304" transform="rotate(80 783 304)">海南环岛高速</text><text x="672" y="433" transform="rotate(16 672 433)">富海路</text><text x="877" y="616" transform="rotate(22 877 616)">博鳌大道</text><text x="907" y="487">迎宾路</text></g>
<g class="sm-road-number"><rect x="780" y="202" width="28" height="15" rx="3" fill="#e5ebda"/><text x="786" y="213">G98</text><rect x="811" y="693" width="28" height="15" rx="3" fill="#e5ebda"/><text x="817" y="704">G98</text></g>
<g class="sm-town"><text x="726" y="477" style="font-size:20px;font-weight:600">嘉积镇</text><text x="737" y="395">塔洋镇</text><text x="745" y="287">大路镇</text><text x="932" y="300">长坡镇</text><text x="948" y="485">潭门镇</text><text x="915" y="668">博鳌镇</text><text x="730" y="681">中原镇</text><text x="568" y="524">万泉镇</text><text x="425" y="485">石壁镇</text><text x="412" y="626">龙江镇</text><text x="519" y="743">阳江镇</text><text x="351" y="824">会山镇</text></g>
<g class="sm-small-label"><text x="317" y="405">白石岭</text><text x="601" y="852">琼海博鳌机场</text><text x="866" y="748">博鳌亚洲论坛</text><text x="555" y="275">热带农业公园</text></g>
<text x="604" y="515" class="sm-water-label" transform="rotate(5 604 515)">万泉河</text><text x="1127" y="480" class="sm-water-label" style="font-size:18px;letter-spacing:12px">南 海</text>
`;

function pinSVG(status, grade, size = 40) {
  const color = COLORS[safeStatus(status)];
  grade = safeGrade(grade);
  const shape = grade === 'A'
    ? '<path d="M20 3.5 24.8 13.2 35.5 14.8 27.7 22.4 29.6 33.2 20 28.1 10.4 33.2 12.3 22.4 4.5 14.8 15.2 13.2Z"/>'
    : grade === 'B'
      ? '<path d="M20 5 36 33H4Z" stroke-linejoin="round"/>'
      : grade === 'C' ? '<circle cx="20" cy="20" r="12"/>' : '<circle cx="20" cy="20" r="11"/>';
  const unknown = grade === 'ungraded' ? '<text x="20" y="25" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="16" font-weight="600">?</text>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><g fill="${color}" stroke="#fff" stroke-width="2.8">${shape}</g>${unknown}</svg>`;
}

const GPS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#348bde" fill-opacity=".16" stroke="#348bde" stroke-opacity=".35"/><circle cx="22" cy="22" r="7" fill="#348bde" stroke="white" stroke-width="3"/></svg>';

export class StoreMap {
  constructor(container, { onSelect, onCoordinate, onProviderChange, fitPadding = 70, showControl = true } = {}) {
    if (!(container instanceof HTMLElement)) throw new Error('StoreMap 需要有效的地图容器。');
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.onCoordinate = onCoordinate || (() => {});
    this.onProviderChange = onProviderChange || (() => {});
    this.fitPadding = fitPadding;
    this.showControl = showControl;
    this.stores = [];
    this.selectedId = null;
    this.center = { lng: 110.49, lat: 19.25 };
    this.level = 1;
    this.provider = 'schematic';
    this.providerLabel = providerLabel('schematic');
    this.destroyed = false;
    this.map = null;
    this.adapter = null;
    this.currentZoom = 12;
    this.viewIntent = 'center';
    this.markerLayer = null;
    this.gpsLayer = null;
    this.userLocation = null;
    this.storeIndex = new Map();
    this.events = new AbortController();
    if (!document.getElementById('lishen-store-map-style')) {
      const style = document.createElement('style');
      style.id = 'lishen-store-map-style';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'sm';
    this.root.innerHTML = `<div class="sm-online" hidden></div><div class="sm-stage" role="application" aria-label="琼海门店分布示意图，可拖动、缩放并选择门店"><svg class="sm-base" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${BASEMAP}</svg><div class="sm-markers"></div><div class="sm-compass" aria-hidden="true">N</div><div class="sm-note"><b>琼海乡镇示意图</b> · 非导航底图</div></div>`;
    this.container.replaceChildren(this.root);
    this.stage = this.root.querySelector('.sm-stage');
    this.svg = this.root.querySelector('.sm-base');
    this.markerContainer = this.root.querySelector('.sm-markers');
    this.online = this.root.querySelector('.sm-online');
    this.selectionNote = document.createElement('div');
    this.selectionNote.className = 'sm-selection-note';
    this.selectionNote.hidden = true;
    this.root.append(this.selectionNote);
    this.bindOfflineEvents();
    this.observer = new ResizeObserver(() => { this.render(); this.adapter?.resize(); });
    this.observer.observe(this.root);
    this.render();
  }

  static pinSVG(status, grade) { return pinSVG(status, grade); }

  world(lng, lat) { return { x: (lng - 110.1) * 1920, y: (19.6 - lat) * (1000 / .7) }; }
  coordinate(x, y) { return { lng: 110.1 + x / 1920, lat: 19.6 - y / (1000 / .7) }; }

  viewport() {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    const vw = 1113.6 / this.level;
    const vh = vw * height / width;
    const c = this.world(this.center.lng, this.center.lat);
    return { x: c.x - vw / 2, y: c.y - vh / 2, w: vw, h: vh, width, height };
  }

  bindOfflineEvents() {
    const signal = this.events.signal;
    this.stage.addEventListener('pointerdown', event => {
      if (event.target.closest('.sm-pin') || (event.button !== 0 && event.pointerType !== 'touch')) return;
      this.drag = { x: event.clientX, y: event.clientY, center: { ...this.center }, moved: false, id: event.pointerId };
      this.stage.setPointerCapture(event.pointerId);
    }, { signal });
    this.stage.addEventListener('pointermove', event => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      if (!this.drag.moved) return;
      const v = this.viewport();
      const initial = this.world(this.drag.center.lng, this.drag.center.lat);
      this.center = this.coordinate(initial.x - dx * v.w / v.width, initial.y - dy * v.h / v.height);
      this.render();
    }, { signal });
    this.stage.addEventListener('pointerup', event => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      if (!this.drag.moved) {
        const rect = this.stage.getBoundingClientRect();
        const v = this.viewport();
        const point = this.coordinate(v.x + (event.clientX - rect.left) / rect.width * v.w, v.y + (event.clientY - rect.top) / rect.height * v.h);
        this.onCoordinate({ lng: Number(point.lng.toFixed(6)), lat: Number(point.lat.toFixed(6)), source: 'schematic' });
      }
      this.drag = null;
      if (this.stage.hasPointerCapture(event.pointerId)) this.stage.releasePointerCapture(event.pointerId);
    }, { signal });
    this.stage.addEventListener('pointercancel', () => { this.drag = null; }, { signal });
    this.stage.addEventListener('wheel', event => {
      event.preventDefault();
      const before = this.viewport();
      const rect = this.stage.getBoundingClientRect();
      const ratioX = (event.clientX - rect.left) / rect.width;
      const ratioY = (event.clientY - rect.top) / rect.height;
      const worldX = before.x + ratioX * before.w;
      const worldY = before.y + ratioY * before.h;
      this.level = Math.max(.55, Math.min(12, this.level * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const after = this.viewport();
      this.center = this.coordinate(worldX - (ratioX - .5) * after.w, worldY - (ratioY - .5) * after.h);
      this.render();
    }, { passive: false, signal });
  }

  setStores(stores) {
    this.stores = (Array.isArray(stores) ? stores : []).filter(store => Number.isFinite(Number(store.lng)) && Number.isFinite(Number(store.lat))).map(store => ({ ...store, status: safeStatus(store.status), grade: safeGrade(store.grade) }));
    this.storeIndex = new Map(this.stores.map(store => [String(store.id), store]));
    this.syncOnlineMarkers();
    this.render();
  }

  selectStore(id) {
    this.selectedId = id;
    this.syncOnlineMarkers();
    const store = this.storeIndex.get(String(id));
    if (store) this.setCenter(Number(store.lng), Number(store.lat));
    else this.render();
  }

  setCenter(lng, lat) {
    if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return;
    this.center = { lng: Number(lng), lat: Number(lat) };
    this.viewIntent = 'center';
    this.adapter?.setCenter(this.center.lng, this.center.lat);
    this.render();
  }

  locate(lng, lat, options = {}) {
    if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return;
    const accuracy = typeof options === 'number' ? options : options?.accuracy;
    this.userLocation = { lng: Number(lng), lat: Number(lat), accuracy: Number.isFinite(Number(accuracy)) && Number(accuracy) > 0 ? Number(accuracy) : null };
    this.setCenter(lng, lat);
    this.viewIntent = 'location'; this.currentZoom = 15;
    if (this.adapter) this.adapter.locate(this.userLocation, GPS_SVG);
    else { this.level = Math.max(4, this.level); this.render(); }
  }

  zoom(delta) {
    if (this.adapter) {
      this.adapter.zoom(delta);
      this.currentZoom = this.map?.getZoom?.() ?? this.currentZoom;
      this.viewIntent = 'center';
      return;
    }
    this.level = Math.max(.55, Math.min(12, this.level * Math.pow(1.3, Number(delta))));
    this.render();
  }

  fitAll() {
    this.viewIntent = 'fit';
    if (!this.stores.length) { this.level = 1; this.setCenter(110.49, 19.25); return; }
    const lngs = this.stores.map(store => Number(store.lng));
    const lats = this.stores.map(store => Number(store.lat));
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    if (this.adapter) {
      this.adapter.fitAll(this.stores, this.fitPadding);
      return;
    }
    const vw = Math.max((maxLng - minLng) * 1920, 180);
    const vh = Math.max((maxLat - minLat) * (1000 / .7), 180);
    const ratio = Math.max(1, this.root.clientWidth) / Math.max(1, this.root.clientHeight);
    this.level = Math.max(.55, Math.min(6, 1113.6 / Math.max(vw * 1.35, vh * ratio * 1.35)));
    this.setCenter((minLng + maxLng) / 2, (minLat + maxLat) / 2);
    this.viewIntent = 'fit';
  }

  render() {
    if (this.destroyed) return;
    this.updateSelectionNote();
    if (this.provider !== 'schematic') return;
    const v = this.viewport();
    this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    const fragment = document.createDocumentFragment();
    for (const store of this.stores) {
      const p = this.world(Number(store.lng), Number(store.lat));
      const left = (p.x - v.x) / v.w * 100;
      const top = (p.y - v.y) / v.h * 100;
      if (left < -5 || left > 105 || top < -5 || top > 105) continue;
      const selected = String(store.id) === String(this.selectedId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sm-pin${selected ? ' is-selected' : ''}`;
      button.style.left = `${left}%`;
      button.style.top = `${top}%`;
      button.dataset.storeId = String(store.id);
      button.title = `${store.name} · ${gradeLabel(store.grade)} · ${STATUS[safeStatus(store.status)]}${store.annotationIsDemo === true ? ' · 演示标记' : ''}`;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(selected));
      button.innerHTML = pinSVG(store.status, store.grade);
      button.addEventListener('click', event => { event.stopPropagation(); this.selectStore(store.id); this.onSelect(store.id); });
      fragment.append(button);
      if (selected && top > 15) {
        const tooltip = document.createElement('div');
        tooltip.className = 'sm-selected';
        tooltip.style.left = `${Math.max(16, Math.min(84, left))}%`;
        tooltip.style.top = `${top}%`;
        const name = document.createElement('strong');
        name.textContent = store.name;
        const text = document.createElement('span');
        text.textContent = `${gradeLabel(store.grade)} · ${STATUS[safeStatus(store.status)]}`;
        const provenance = document.createElement('span');
        provenance.className = 'sm-source-line';
        provenance.textContent = sourceLabel(store);
        tooltip.append(name, text, provenance);
        fragment.append(tooltip);
      }
    }
    if (this.userLocation) {
      const p = this.world(this.userLocation.lng, this.userLocation.lat);
      const left = (p.x - v.x) / v.w * 100, top = (p.y - v.y) / v.h * 100;
      if (left >= -5 && left <= 105 && top >= -5 && top <= 105) {
        const point = document.createElement('div');
        point.className = 'sm-user-location';
        point.style.left = `${left}%`; point.style.top = `${top}%`;
        const label = document.createElement('span');
        label.className = 'sm-user-location-label';
        label.textContent = `我的位置${this.userLocation.accuracy ? ` · 约 ${Math.round(this.userLocation.accuracy)} 米` : ''}`;
        point.append(label);
        fragment.append(point);
      }
    }
    this.markerContainer.replaceChildren(fragment);
  }

  updateSelectionNote() {
    const store = this.storeIndex.get(String(this.selectedId));
    this.selectionNote.hidden = this.provider === 'schematic' || !store;
    if (!store || this.selectionNote.hidden) return;
    const name = document.createElement('strong'); name.textContent = store.name;
    const state = document.createElement('span'); state.textContent = `${gradeLabel(store.grade)} · ${STATUS[safeStatus(store.status)]}`;
    const provenance = document.createElement('span'); provenance.textContent = sourceLabel(store);
    this.selectionNote.replaceChildren(name, state, provenance);
  }

  async setKey(value) {
    const key = String(value || '').trim();
    return this.setProviders(key ? { tencent: { jsKey: key } } : {});
  }

  setProviders(configs = {}, routingOptions = {}) {
    if (this.destroyed) return Promise.reject(new DOMException('地图加载已取消。', 'AbortError'));
    const providers = getAvailableProviders(configs);
    const fingerprint = JSON.stringify(providers.map(id => [id, configs[id]]));
    if (this.configFingerprint === fingerprint) {
      if (this.loadingPromise) return this.loadingPromise;
      if (this.adapter) return Promise.resolve({ provider: this.provider, label: this.providerLabel });
    }
    this.useOffline();
    this.configFingerprint = fingerprint;
    if (!providers.length) return Promise.resolve({ provider: 'schematic', label: providerLabel('schematic') });
    const requestId = this.requestId;
    const controller = new AbortController();
    this.loadingController = controller;
    // Candidate layers have full size even while transparent, so SDKs render tiles.
    // The schematic remains above them until a verified candidate wins.
    this.online.hidden = false;
    const pending = raceMapProviders(providers, async (provider, { signal }) => {
      const layer = document.createElement('div');
      layer.className = 'sm-provider-layer';
      layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none';
      layer.dataset.mapProvider = provider;
      this.online.append(layer);
      let adapter;
      const cancel = () => { adapter?.destroy(); layer.remove(); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        adapter = await createProviderMap(provider, layer, configs[provider], {
          center: this.center, zoom: this.currentZoom, showControl: this.showControl,
          sdkTimeoutMs: 7500, signal,
        });
        await adapter.ready(6500);
        if (signal.aborted || this.destroyed || requestId !== this.requestId) throw new DOMException('地图加载已取消。', 'AbortError');
        return { adapter, layer, destroy: () => { signal.removeEventListener('abort', cancel); cancel(); } };
      } catch (error) {
        signal.removeEventListener('abort', cancel); cancel(); throw error;
      }
    }, { ...routingOptions, signal: controller.signal }).then(result => {
      if (this.destroyed || requestId !== this.requestId) {
        result.resource.destroy(); throw new DOMException('地图加载已取消。', 'AbortError');
      }
      this.onlineResource = result.resource;
      this.adapter = result.resource.adapter;
      this.map = this.adapter.map;
      this.provider = result.provider;
      this.providerLabel = providerLabel(this.provider);
      this.adapter.onCoordinate(pos => {
        if (!this.destroyed && requestId === this.requestId) this.onCoordinate(pos);
      });
      this.syncOnlineMarkers();
      if (this.userLocation) this.adapter.locate(this.userLocation, GPS_SVG);
      if (this.viewIntent === 'fit') this.adapter.fitAll(this.stores, this.fitPadding);
      else this.adapter.setCenter(this.center.lng, this.center.lat);
      result.resource.layer.style.opacity = '1';
      result.resource.layer.style.pointerEvents = 'auto';
      this.stage.hidden = true;
      this.updateSelectionNote();
      this.onProviderChange(this.provider, { label: this.providerLabel, latencyMs: result.latencyMs });
      return { provider: this.provider, label: this.providerLabel, latencyMs: result.latencyMs };
    }).catch(error => {
      if (!this.destroyed && requestId === this.requestId) this.useOffline();
      throw error;
    }).finally(() => {
      if (this.loadingPromise === pending) this.loadingPromise = null;
    });
    this.loadingPromise = pending;
    return pending;
  }

  syncOnlineMarkers() {
    this.adapter?.setStores(this.stores, this.selectedId, id => {
      if (this.destroyed || !this.storeIndex.has(String(id))) return;
      this.selectStore(id); this.onSelect(id);
    }, pinSVG);
    this.markerLayer = this.adapter?.markerLayer || null;
  }

  useOffline() {
    if (this.adapter) {
      try { this.center = this.adapter.getCenter(); this.currentZoom = this.map?.getZoom?.() ?? this.currentZoom; } catch {}
    }
    this.requestId = (this.requestId || 0) + 1;
    this.loadingController?.abort(); this.loadingController = null;
    this.loadingPromise = null; this.configFingerprint = null;
    this.onlineResource?.destroy(); this.onlineResource = null;
    this.adapter = this.map = this.markerLayer = this.gpsLayer = null;
    this.online.replaceChildren();
    this.online.hidden = true;
    this.stage.hidden = false;
    this.provider = 'schematic';
    this.providerLabel = providerLabel('schematic');
    this.render();
    if (!this.destroyed) this.onProviderChange(this.provider, { label: this.providerLabel });
  }

  destroy() {
    this.destroyed = true;
    this.events.abort();
    this.observer.disconnect();
    this.useOffline();
    this.root.remove();
  }
}
