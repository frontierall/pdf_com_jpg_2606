// ==================== PDF 깨진 쪽 탐지 ====================
// 이미지 데이터가 손상되면 세로 줄무늬가 생긴다. 모든 쪽을 낮은 해상도로 그려
// '가로 방향 변화 / 세로 방향 변화' 비율이 비정상적으로 큰 쪽을 찾는다.
// (온편지 76·77호로 시험: 깨진 쪽 10 이상, 정상 쪽 1.5 이하)
const INTEGRITY_SCALE = 20 / 72;     // 20dpi
const INTEGRITY_RATIO_LIMIT = 5;
const INTEGRITY_STRONG_RATIO = 10;   // 이 이상이면 '의심', 미만이면 '주의'
const INTEGRITY_EDGE_MIN = 5;        // 가로 변화가 이보다 작은 단색에 가까운 쪽은 제외
const INTEGRITY_BANDS = 4;           // 손상 위치를 보여주기 위해 쪽을 세로로 나누는 구간 수
const NEARLY_BLANK_RATIO = 0.003;    // 흰색이 아닌 픽셀이 이 비율 미만이면 '거의 빈 쪽'

function stripeScore(imageData) {
    const { data, width: w, height: h } = imageData;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    let hSum = 0;
    let vSum = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const v = gray[y * w + x];
            if (x < w - 1) hSum += Math.abs(v - gray[y * w + x + 1]);
            if (y < h - 1) vSum += Math.abs(v - gray[(y + 1) * w + x]);
        }
    }
    const hd = hSum / (h * (w - 1));
    const vd = vSum / ((h - 1) * w);
    let sum = 0, sq = 0, nonWhite = 0;
    for (let i = 0; i < w * h; i++) {
        sum += gray[i]; sq += gray[i] * gray[i];
        if (gray[i] < 235) nonWhite++;
    }
    const mean = sum / (w * h);
    const std = Math.sqrt(Math.max(0, sq / (w * h) - mean * mean));
    return { hd, ratio: hd / (vd + 0.3), mean, std, nonWhite: nonWhite / (w * h) };
}

// 쪽을 위아래 구간으로 나눠 줄무늬가 있는 구간 번호(0부터)를 돌려준다. 손상 위치 표시용
function damagedBands(imageData) {
    const { data, width: w, height: h } = imageData;
    const out = [];
    for (let b = 0; b < INTEGRITY_BANDS; b++) {
        const y0 = Math.floor(h * b / INTEGRITY_BANDS);
        const y1 = Math.floor(h * (b + 1) / INTEGRITY_BANDS);
        if (y1 - y0 < 2) continue;
        const s = stripeScore({ data: data.subarray(y0 * w * 4, y1 * w * 4), width: w, height: y1 - y0 });
        if (s.ratio > INTEGRITY_RATIO_LIMIT && s.hd > INTEGRITY_EDGE_MIN) out.push(b);
    }
    return out;
}

// 반환: {suspects:[{page, ratio, grade, bands} | {page, error}], blanks:[{page, kind}], failed:[쪽번호]}. isCancelled()가 true가 되면 null 반환
// suspects 중 error 항목은 렌더링 실패(점검 못 한 쪽)라 호출한 쪽에서 failed로 옮긴다.
// blanks: kind = white(통째로 흰 쪽) / black(통째로 검은 쪽) / nearly(거의 비어 있음). 의도된 빈 쪽일 수 있어 '참고'로만 알린다.
async function checkBrokenPages(pdfDoc, onProgress, isCancelled) {
    const suspects = [];
    const blanks = [];
    const failed = [];
    for (let n = 1; n <= pdfDoc.numPages; n++) {
        if (isCancelled()) return null;
        try {
            const page = await pdfDoc.getPage(n);
            const viewport = page.getViewport({ scale: INTEGRITY_SCALE });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(2, Math.round(viewport.width));
            canvas.height = Math.max(2, Math.round(viewport.height));
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { hd, ratio, mean, std, nonWhite } = stripeScore(imageData);
            if (ratio > INTEGRITY_RATIO_LIMIT && hd > INTEGRITY_EDGE_MIN) {
                suspects.push({
                    page: n, ratio,
                    grade: ratio >= INTEGRITY_STRONG_RATIO ? 'high' : 'low',
                    bands: damagedBands(imageData),
                });
            } else if (std < 1.5 && mean > 250) blanks.push({ page: n, kind: 'white' });
            else if (std < 1.5 && mean < 5) blanks.push({ page: n, kind: 'black' });
            else if (nonWhite < NEARLY_BLANK_RATIO && mean > 240) blanks.push({ page: n, kind: 'nearly' });
            canvas.width = canvas.height = 0;
            page.cleanup();
        } catch (error) {
            console.error(`${n}쪽 렌더링 실패:`, error);
            failed.push(n);
        }
        onProgress(n, pdfDoc.numPages);
    }
    return { suspects, blanks, failed };
}

// ==================== 쪽 내용 점검 (글꼴·이미지·링크·해상도) ====================
// 쪽마다 그리기 명령(operator list)을 한 번만 읽어서 글꼴 미포함, 이미지 누락·손상,
// (옵션) 저해상도 이미지를 함께 찾고, 링크 주석의 형식도 점검한다.
const LOWRES_DPI = 100;
const OBJECT_TIMEOUT = 5000;

function getPdfObject(store, name) {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(undefined), OBJECT_TIMEOUT);
        try {
            store.get(name, value => { clearTimeout(timer); resolve(value); });
        } catch (e) {
            clearTimeout(timer);
            resolve(null);
        }
    });
}

function fontDisplayName(name) {
    return String(name).replace(/^[A-Z]{6}\+/, '');
}

// 반환: {lowres:[{page,dpi}]|null, fonts:[{name, missing, pages}], badImages:[{page, reason}], links:{total, issues:[{page, text}]}}
async function scanContents(pdfDoc, opts, onProgress, isCancelled) {
    const OPS = pdfjsLib.OPS;
    const lowres = opts.lowRes ? [] : null;
    const fonts = new Map();
    const badImages = [];
    const links = { total: 0, issues: [] };
    const destOk = new Map();

    async function destExists(dest) {
        const key = typeof dest === 'string' ? dest : JSON.stringify(dest);
        if (destOk.has(key)) return destOk.get(key);
        let ok = false;
        try {
            const d = typeof dest === 'string' ? await pdfDoc.getDestination(dest) : dest;
            if (Array.isArray(d) && d[0] !== null && d[0] !== undefined) {
                ok = typeof d[0] === 'object' ? (await pdfDoc.getPageIndex(d[0])) >= 0 : Number.isInteger(d[0]);
            }
        } catch (e) { ok = false; }
        destOk.set(key, ok);
        return ok;
    }

    for (let n = 1; n <= pdfDoc.numPages; n++) {
        if (isCancelled()) return null;
        try {
            const page = await pdfDoc.getPage(n);
            const ops = await page.getOperatorList();
            let ctm = [1, 0, 0, 1, 0, 0];
            const stack = [];
            let minDpi = Infinity;
            for (let i = 0; i < ops.fnArray.length; i++) {
                const fn = ops.fnArray[i];
                const args = ops.argsArray[i];
                if (fn === OPS.save) stack.push(ctm.slice());
                else if (fn === OPS.restore) ctm = stack.pop() || ctm;
                else if (fn === OPS.transform) {
                    const [a, b, c, d, e, f] = args;
                    ctm = [ctm[0] * a + ctm[2] * b, ctm[1] * a + ctm[3] * b, ctm[0] * c + ctm[2] * d, ctm[1] * c + ctm[3] * d,
                        ctm[0] * e + ctm[2] * f + ctm[4], ctm[1] * e + ctm[3] * f + ctm[5]];
                } else if (fn === OPS.setFont) {
                    const font = await getPdfObject(page.commonObjs, args[0]);
                    if (font && font.name) {
                        const name = fontDisplayName(font.name);
                        if (!fonts.has(name)) fonts.set(name, { name, missing: !!font.missingFile && !font.isType3Font, pages: new Set() });
                        fonts.get(name).pages.add(n);
                    }
                } else if (fn === OPS.paintImageXObject) {
                    const store = args[0].startsWith('g_') ? page.commonObjs : page.objs;
                    const img = await getPdfObject(store, args[0]);
                    if (img === undefined) badImages.push({ page: n, reason: '이미지 응답 없음' });
                    else if (img === null || !img.width || !img.height) badImages.push({ page: n, reason: '이미지를 읽지 못함' });
                    else if (lowres) {
                        const widthPt = Math.hypot(ctm[0], ctm[1]);
                        if (widthPt >= 50) minDpi = Math.min(minDpi, img.width / (widthPt / 72)); // 작은 장식 이미지는 제외
                    }
                }
            }
            if (lowres && minDpi < LOWRES_DPI) lowres.push({ page: n, dpi: Math.round(minDpi) });

            const annots = await page.getAnnotations();
            for (const a of annots) {
                if (a.subtype !== 'Link') continue;
                links.total++;
                if (a.url !== undefined || a.unsafeUrl !== undefined) {
                    const raw = (a.unsafeUrl !== undefined ? a.unsafeUrl : a.url) || '';
                    let valid = !!raw && !/\s/.test(raw.trim());
                    if (valid) { try { new URL(raw.trim()); } catch (e) { valid = false; } }
                    if (!valid) links.issues.push({ page: n, text: raw ? `주소 형식 오류 (${raw.slice(0, 40)})` : '주소가 비어 있음' });
                } else if (a.dest && !(await destExists(a.dest))) {
                    links.issues.push({ page: n, text: '이동할 쪽이 없는 링크' });
                }
            }
            page.cleanup();
        } catch (error) {
            console.error(`${n}쪽 내용 점검 실패:`, error);
        }
        onProgress(n, pdfDoc.numPages);
    }
    return { lowres, fonts: [...fonts.values()], badImages, links };
}

// ==================== PDF 점검 탭 ====================
// PDF를 여러 개 올리면 파일별로 깨진 쪽·빈 쪽·글꼴·이미지·링크·(선택)저해상도 이미지·쪽수·용량·쪽 크기·암호화를 점검하고,
// 의심 쪽은 크게 볼 수 있으며 결과 전체를 텍스트로 저장할 수 있다.
(function () {
    const dropZone = document.getElementById('checkDropZone');
    if (!dropZone) return;
    const fileInput = document.getElementById('checkFileInput');
    const lowResOpt = document.getElementById('checkLowResOpt');
    const clearBtn = document.getElementById('checkClearBtn');
    const cancelBtn = document.getElementById('checkCancelBtn');
    const noticeEl = document.getElementById('checkNotice');
    const resultsEl = document.getElementById('checkResults');
    const overallEl = document.getElementById('checkOverall');
    const reportBtn = document.getElementById('checkReportBtn');
    const modal = document.getElementById('checkModal');
    const modalCanvas = document.getElementById('checkModalCanvas');
    const modalTitle = document.getElementById('checkModalTitle');

    let runId = 0;
    let stoppedId = 0;          // 사용자가 '중단'을 눌러 끝난 run의 id (부분 결과는 남긴다)
    let reportParts = [];

    // 단계별 진행률 구간(%): 쪽 정보 → 깨진 쪽 → 내용 점검
    const STAGE = { read: [0, 8], info: [8, 15], broken: [15, 65], scan: [65, 100] };

    function sizeText(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    // [1,2,3,5] → "1~3, 5"
    function rangeText(nums) {
        const sorted = [...new Set(nums)].sort((a, b) => a - b);
        const parts = [];
        for (let i = 0; i < sorted.length; i++) {
            let j = i;
            while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
            parts.push(j > i + 1 ? `${sorted[i]}~${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
            i = j;
        }
        return parts.join(', ');
    }

    const BLANK_LABEL = { white: '흰 쪽', black: '검은 쪽', nearly: '거의 빈 쪽' };
    function blankText(blanks) {
        if (!blanks.length) return '없음';
        const kinds = Object.keys(BLANK_LABEL).filter(k => blanks.some(b => b.kind === k));
        return kinds.map(k => `${BLANK_LABEL[k]} ${rangeText(blanks.filter(b => b.kind === k).map(b => b.page))}`).join(' / ') + ' — 의도된 빈 쪽인지 확인';
    }

    const PAPER = [['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['B4', 257, 364], ['B5', 182, 257],
        ['B6', 128, 182], ['신국판', 152, 225], ['46판', 127, 188], ['Letter', 216, 279], ['Legal', 216, 356]];
    function paperText(wPt, hPt) {
        const w = Math.min(wPt, hPt) * 25.4 / 72;
        const h = Math.max(wPt, hPt) * 25.4 / 72;
        const hit = PAPER.find(p => Math.abs(p[1] - w) <= 2 && Math.abs(p[2] - h) <= 2);
        return `${w.toFixed(0)}×${h.toFixed(0)}mm (${hit ? hit[0] : '규격 외'})`;
    }

    async function openModal(doc, pageNum, fileName) {
        modalTitle.textContent = `${fileName} — ${pageNum}쪽`;
        modal.classList.remove('hidden');
        const page = await doc.getPage(pageNum);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(1100, window.innerWidth - 48) / base.width * Math.min(1.5, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        modalCanvas.width = vp.width;
        modalCanvas.height = vp.height;
        const ctx = modalCanvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, vp.width, vp.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }
    modal.addEventListener('click', () => modal.classList.add('hidden'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.add('hidden'); });

    // 쪽이 많으면 나열하지 않고 요약한다 (픽셀=pt 방식 PDF는 전 쪽이 72dpi로 계산되어 노이즈가 크다)
    function lowResText(list, total) {
        if (!list.length) return '없음';
        const min = Math.min(...list.map(r => r.dpi));
        if (list.length > 10) return `${list.length}쪽 / 전체 ${total}쪽 (최저 ${min}dpi) — 웹용 PDF는 해상도가 낮은 것이 정상일 수 있음`;
        return list.map(r => `${r.page}쪽(${r.dpi}dpi)`).join(', ');
    }

    function fontText(fonts) {
        if (!fonts.length) return '글꼴 정보 없음';
        const missing = fonts.filter(f => f.missing);
        if (!missing.length) return `${fonts.length}종 모두 포함됨`;
        return `${fonts.length}종 중 ${missing.length}종 미포함: ` + missing.map(f => `${f.name}(${rangeText([...f.pages])}쪽)`).join(', ');
    }

    // 열기 실패 원인을 사용자가 조치할 수 있는 문구로 바꾼다
    function describeOpenError(error) {
        const name = error && error.name;
        if (typeof pdfjsLib === 'undefined') return '점검 도구(pdf.js)를 불러오지 못했습니다. 인터넷 연결을 확인하고 페이지를 새로고침하세요.';
        if (name === 'PasswordException') return '암호가 걸린 PDF라 점검하지 못했습니다. 비밀번호를 입력하거나 암호를 해제한 파일을 올려주세요.';
        if (name === 'InvalidPDFException') return 'PDF 형식이 아니거나 파일 구조가 손상되었습니다.';
        if (name === 'MissingPDFException') return '파일을 찾을 수 없습니다.';
        if (name === 'NotReadableError' || name === 'NotFoundError') return '파일을 읽을 수 없습니다. 클라우드(iCloud 등)에 있는 파일이면 내려받은 뒤 다시 올려주세요.';
        if (name === 'RangeError' || /allocation|memory/i.test(String(error && error.message))) return '파일이 너무 커서 브라우저 메모리가 부족합니다. 다른 탭을 닫거나 파일을 나눠서 점검해 보세요.';
        if (name === 'AbortException') return '점검이 중단되었습니다.';
        return `PDF를 여는 중 오류가 발생했습니다 (${(error && error.message) || error}).`;
    }

    async function checkFile(file, id, fileNo, fileCount) {
        const section = document.createElement('div');
        section.className = 'integrity-check';
        section.innerHTML = `<h3 class="check-file-title">${esc(file.name)}</h3><div class="integrity-status">PDF를 여는 중...</div>
            <div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>
            <table class="metadata-table"><tbody></tbody></table><div class="integrity-list"></div>`;
        resultsEl.appendChild(section);
        const statusEl = section.querySelector('.integrity-status');
        const bar = section.querySelector('.progress-bar');
        const fill = section.querySelector('.progress-fill');
        const body = section.querySelector('tbody');
        const list = section.querySelector('.integrity-list');
        const result = {
            name: file.name, size: file.size, pages: 0, bad: [], blanks: [], failed: [], lowres: null,
            fonts: [], badImages: [], links: { total: 0, issues: [] }, error: false,
        };
        const started = Date.now();
        const prefix = fileCount > 1 ? `[${fileNo}/${fileCount}] ` : '';

        // 전체 진행률(%)과 남은 시간 추정을 함께 표시한다
        function progress(stage, label, done, total) {
            const [from, to] = STAGE[stage];
            const pct = Math.round(from + (to - from) * (total ? done / total : 0));
            fill.style.width = pct + '%';
            const elapsed = (Date.now() - started) / 1000;
            const eta = pct >= 10 && elapsed > 3 ? ` · 남은 시간 약 ${Math.max(1, Math.round(elapsed * (100 - pct) / pct))}초` : '';
            statusEl.textContent = `${prefix}${label}${total ? ` ${done}/${total}쪽` : ''} (${pct}%${eta})`;
        }
        function stopped() {
            bar.remove();
            section.classList.add('warn');
            statusEl.textContent = `${prefix}점검이 중단되었습니다.`;
            return null;
        }
        function fail(text) {
            bar.remove();
            section.classList.add('warn');
            statusEl.textContent = text;
            result.error = true;
            result.errorText = text;
            reportParts.push(`[PDF 점검 결과] ${file.name}\n- 파일을 열 수 없음: ${text}`);
            return result;
        }

        if (!file.size) return fail('빈 파일(0바이트)입니다.');
        let doc;
        try {
            progress('read', '파일을 읽는 중...', 0, 0);
            const buffer = await file.arrayBuffer();
            if (id !== runId) return stopped();
            const header = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024)));
            if (!header.includes('%PDF-')) return fail('PDF 형식이 아닙니다 (파일 머리말에 %PDF- 표시가 없음).');
            const task = pdfjsLib.getDocument({ data: buffer });
            let skippedPassword = false;
            task.onPassword = (update, reason) => {
                const wrong = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
                const pw = window.prompt(`${wrong ? '비밀번호가 틀렸습니다. 다시 입력하세요.\n' : ''}"${file.name}" 은(는) 암호가 걸려 있습니다. 비밀번호를 입력하세요. (취소하면 건너뜁니다)`);
                if (pw === null) { skippedPassword = true; task.destroy(); } else update(pw);
            };
            try {
                doc = await task.promise;
            } catch (error) {
                if (skippedPassword) return fail('암호 PDF — 비밀번호를 입력하지 않아 건너뛰었습니다.');
                throw error;
            }
        } catch (error) {
            console.error('PDF 열기 실패:', error);
            return fail(describeOpenError(error));
        }
        if (id !== runId) return stopped();
        result.pages = doc.numPages;

        // 쪽 크기 수집: 가로·세로 순서와 2pt 이하의 오차는 같은 크기로 본다. 한 쪽이 손상돼 읽기 실패해도 전체가 멈추지 않게 쪽별로 처리한다.
        const sizes = new Map();      // 크기(작은 변×큰 변) → {landscape:[], portrait:[]}
        const unreadable = [];
        for (let n = 1; n <= doc.numPages; n++) {
            if (id !== runId) return stopped();
            try {
                const page = await doc.getPage(n);
                const vp = page.getViewport({ scale: 1 });
                const lo = Math.round(Math.min(vp.width, vp.height) / 2) * 2;
                const hi = Math.round(Math.max(vp.width, vp.height) / 2) * 2;
                const key = `${lo}x${hi}`;
                if (!sizes.has(key)) sizes.set(key, { lo, hi, w: vp.width, h: vp.height, pages: [], landscape: [] });
                const s = sizes.get(key);
                s.pages.push(n);
                if (vp.width > vp.height + 1) s.landscape.push(n);
                page.cleanup();
            } catch (error) {
                console.error(`${n}쪽 정보 읽기 실패:`, error);
                unreadable.push(n);
            }
            if (n % 5 === 0 || n === doc.numPages) progress('info', '쪽 정보 확인 중...', n, doc.numPages);
        }
        let main = '';
        sizes.forEach((s, key) => { if (!main || s.pages.length > sizes.get(main).pages.length) main = key; });
        const oddPages = [];
        sizes.forEach((s, key) => { if (key !== main) oddPages.push(...s.pages); });
        oddPages.sort((a, b) => a - b);
        const mainSize = main ? sizes.get(main) : null;
        // 같은 크기인데 방향(가로/세로)만 다른 소수 쪽
        const mixed = mainSize && mainSize.landscape.length > 0 && mainSize.landscape.length < mainSize.pages.length;
        const rotated = !mixed ? []
            : mainSize.landscape.length * 2 <= mainSize.pages.length ? mainSize.landscape : mainSize.pages.filter(p => !mainSize.landscape.includes(p));

        let info = {};
        try { info = (await doc.getMetadata()).info || {}; } catch (e) { /* 메타데이터 없음 */ }

        const wantLowRes = lowResOpt.checked;
        let res;
        try {
            res = await checkBrokenPages(doc, (n, total) => progress('broken', '깨진 쪽이 있는지 점검 중...', n, total), () => id !== runId);
        } catch (error) {
            console.error('깨진 쪽 점검 실패:', error);
            res = { suspects: [], blanks: [], failed: [...Array(doc.numPages).keys()].map(i => i + 1) };
        }
        if (res === null || id !== runId) return stopped();
        result.bad = res.suspects;
        result.blanks = res.blanks;
        result.failed = [...new Set([...res.failed, ...unreadable])].sort((a, b) => a - b);

        let scan = null;
        try {
            scan = await scanContents(doc, { lowRes: wantLowRes }, (n, total) => progress('scan', wantLowRes ? '글꼴·이미지·해상도 점검 중...' : '글꼴·이미지·링크 점검 중...', n, total), () => id !== runId);
        } catch (error) {
            console.error('내용 점검 실패:', error);
        }
        if (id !== runId) return stopped();
        if (scan) {
            result.lowres = scan.lowres;
            result.fonts = scan.fonts;
            result.badImages = scan.badImages;
            result.links = scan.links;
        }
        bar.remove();

        const missingFonts = result.fonts.filter(f => f.missing);
        const badImagePages = [...new Set(result.badImages.map(b => b.page))];
        const sizeRow = !mainSize ? '확인하지 못함'
            : `${paperText(mainSize.w, mainSize.h)} · ${Math.round(mainSize.w)}×${Math.round(mainSize.h)}pt`
                + (sizes.size === 1 ? (rotated.length ? ` — 일부 쪽은 가로/세로 방향만 다름: ${rangeText(rotated)}쪽` : ' — 모두 동일')
                    : ` — ${sizes.size}종류, 다른 크기 쪽: ${rangeText(oddPages)}`);
        const rows = [
            ['파일 크기', sizeText(file.size)],
            ['총 쪽수', `${doc.numPages}쪽`],
            ['쪽 크기', sizeRow],
            ['PDF 버전', info.PDFFormatVersion || '-'],
            ['생성 프로그램', info.Creator || '-'],
            ['암호화', info.IsEncrypted ? '예' : '아니오'],
            ['깨진 쪽 의심', result.bad.length ? result.bad.map(s => `${s.page}쪽(${s.grade === 'high' ? '의심' : '주의'})`).join(', ') : '없음'],
            ['점검하지 못한 쪽', result.failed.length ? `${result.failed.length}쪽 (${rangeText(result.failed)}) — 렌더링/읽기 실패, 직접 확인 필요` : '없음'],
            ['이미지 누락·손상', badImagePages.length ? `${badImagePages.length}쪽 (${rangeText(badImagePages)}) — ${[...new Set(result.badImages.map(b => b.reason))].join(', ')}` : '없음'],
            ['글꼴', fontText(result.fonts)],
            ['링크', result.links.total ? (result.links.issues.length ? `${result.links.total}개 중 ${result.links.issues.length}개 문제: ${result.links.issues.slice(0, 5).map(l => `${l.page}쪽 ${l.text}`).join(', ')}${result.links.issues.length > 5 ? ' 외' : ''}` : `${result.links.total}개, 형식 이상 없음 (실제 접속 여부는 확인하지 않음)`) : '없음'],
            ['빈 쪽 (참고)', blankText(result.blanks)],
        ];
        if (result.lowres) rows.push([`저해상도 이미지 (참고, ${LOWRES_DPI}dpi 미만)`, lowResText(result.lowres, doc.numPages)]);
        else rows.push(['저해상도 이미지', '점검 안 함 (옵션을 켜면 점검)']);
        const flagged = new Set(['깨진 쪽 의심', '점검하지 못한 쪽', '이미지 누락·손상']);
        body.innerHTML = rows.map(r => {
            const warn = (flagged.has(r[0]) && r[1] !== '없음') || (r[0] === '글꼴' && missingFonts.length) || (r[0] === '링크' && result.links.issues.length);
            return `<tr><th>${esc(r[0])}</th><td${warn ? ' class="bad-cell"' : ''}>${esc(r[1])}</td></tr>`;
        }).join('');

        const bad = result.bad.length > 0 || badImagePages.length > 0;
        section.classList.add(bad ? 'warn' : 'ok');
        const notes = [];
        if (result.failed.length) notes.push(`점검하지 못한 쪽 ${result.failed.length}개`);
        if (missingFonts.length) notes.push(`글꼴 미포함 ${missingFonts.length}종`);
        if (result.links.issues.length) notes.push(`링크 문제 ${result.links.issues.length}개`);
        const noteText = notes.length ? ` (참고: ${notes.join(', ')})` : '';
        statusEl.textContent = (result.bad.length
            ? `깨진 것으로 의심되는 쪽이 ${result.bad.length}개 있습니다: ${result.bad.map(s => s.page + '쪽').join(', ')}`
            : badImagePages.length
                ? `이미지를 읽지 못한 쪽이 있습니다: ${rangeText(badImagePages)}쪽`
                : '줄무늬 형태로 깨진 쪽은 발견되지 않았습니다.') + noteText;

        for (const s of result.bad) {
            const item = document.createElement('div');
            item.className = 'integrity-item';
            const page = await doc.getPage(s.page);
            const vp = page.getViewport({ scale: 0.4 });
            const c = document.createElement('canvas');
            c.width = vp.width; c.height = vp.height;
            const cctx = c.getContext('2d');
            await page.render({ canvasContext: cctx, viewport: vp }).promise;
            // 줄무늬가 감지된 구간을 붉게 표시한다
            cctx.fillStyle = 'rgba(229,57,53,0.25)';
            cctx.strokeStyle = '#e53935';
            cctx.lineWidth = 2;
            for (const b of s.bands) {
                const y0 = c.height * b / INTEGRITY_BANDS;
                const h = c.height / INTEGRITY_BANDS;
                cctx.fillRect(0, y0, c.width, h);
                cctx.strokeRect(1, y0 + 1, c.width - 2, h - 2);
            }
            const img = document.createElement('img');
            img.src = c.toDataURL('image/jpeg', 0.7);
            img.title = '클릭하면 크게 봅니다';
            img.addEventListener('click', () => openModal(doc, s.page, file.name));
            item.appendChild(img);
            const label = document.createElement('div');
            const where = s.bands.length && s.bands.length < INTEGRITY_BANDS ? `, ${s.bands.map(b => b + 1).join('·')}/${INTEGRITY_BANDS} 구간` : '';
            label.textContent = `${s.page}쪽 ${s.grade === 'high' ? '의심' : '주의'} (비율 ${s.ratio.toFixed(1)}${where})`;
            item.appendChild(label);
            list.appendChild(item);
        }

        reportParts.push([`[PDF 점검 결과] ${file.name}`, ...rows.map(r => `- ${r[0]}: ${r[1]}`)].join('\n'));
        return result;
    }

    function buildOverall(results) {
        if (results.length < 2) { overallEl.classList.add('hidden'); return ''; }
        const head = '<tr><th>파일</th><th>쪽수</th><th>용량</th><th>깨진 쪽</th><th>빈 쪽</th><th>글꼴 미포함</th></tr>';
        const rows = results.map(r => `<tr><td>${esc(r.name)}</td><td>${r.pages}</td><td>${sizeText(r.size)}</td>
            <td class="${r.error || r.bad.length ? 'bad-cell' : ''}">${r.error ? '열기 실패' : r.bad.length ? rangeText(r.bad.map(s => s.page)) : '없음'}</td>
            <td>${r.blanks.length ? rangeText(r.blanks.map(b => b.page)) : '없음'}</td>
            <td class="${r.fonts.some(f => f.missing) ? 'bad-cell' : ''}">${r.error ? '-' : r.fonts.filter(f => f.missing).length ? r.fonts.filter(f => f.missing).length + '종' : '없음'}</td></tr>`).join('');
        overallEl.innerHTML = `<h3>전체 비교</h3><table class="metadata-table"><tbody>${head}${rows}</tbody></table>`;
        overallEl.classList.remove('hidden');
        return ['[전체 비교]', ...results.map(r => `- ${r.name}: ${r.error ? `열기 실패 (${r.errorText})` : `${r.pages}쪽, ${sizeText(r.size)}, 깨진 쪽 ${r.bad.length ? rangeText(r.bad.map(s => s.page)) : '없음'}, 글꼴 미포함 ${r.fonts.filter(f => f.missing).length}종`}`)].join('\n');
    }

    async function run(files) {
        const id = ++runId;
        resultsEl.innerHTML = '';
        overallEl.classList.add('hidden');
        reportBtn.classList.add('hidden');
        clearBtn.classList.remove('hidden');
        cancelBtn.classList.remove('hidden');
        reportParts = [];
        const results = [];
        for (let i = 0; i < files.length; i++) {
            let r = null;
            try {
                r = await checkFile(files[i], id, i + 1, files.length);
            } catch (error) {
                // 한 파일의 예상 못한 오류가 나머지 파일의 점검을 막지 않게 한다
                console.error('점검 중 오류:', error);
                const last = resultsEl.lastElementChild;
                if (last) {
                    const st = last.querySelector('.integrity-status');
                    last.querySelector('.progress-bar')?.remove();
                    last.classList.add('warn');
                    if (st) st.textContent = `점검 중 오류가 발생했습니다 (${error && error.message ? error.message : error}).`;
                }
                r = { name: files[i].name, size: files[i].size, pages: 0, bad: [], blanks: [], failed: [], fonts: [], badImages: [], links: { total: 0, issues: [] }, error: true, errorText: '점검 중 오류' };
                reportParts.push(`[PDF 점검 결과] ${files[i].name}\n- 점검 중 오류가 발생함`);
            }
            if (id !== runId) break;
            if (r) results.push(r);
        }
        if (id !== runId && stoppedId !== id) return;   // '결과 지우기'로 취소된 run
        cancelBtn.classList.add('hidden');
        const overall = buildOverall(results);
        if (overall) reportParts.unshift(overall);
        if (stoppedId === id) reportParts.push('※ 사용자가 점검을 중단해 일부 파일만 포함되었습니다.');
        reportParts.push('※ 세로 줄무늬 형태의 이미지 손상만 탐지합니다. 오타·글자 오류는 점검하지 않습니다.');
        if (results.length) reportBtn.classList.remove('hidden');
    }

    function showNotice(text) {
        noticeEl.textContent = text;
        noticeEl.classList.toggle('hidden', !text);
    }

    function pick(fileList) {
        const all = [...fileList];
        const files = all.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
        showNotice(files.length < all.length ? `PDF가 아닌 파일 ${all.length - files.length}개는 제외했습니다: ${all.filter(f => !files.includes(f)).map(f => f.name).join(', ')}` : '');
        if (files.length) run(files);
    }
    // 드롭존 어디를 눌러도 선택창이 열린다. 버튼은 이벤트가 위로 전달되어 한 번만 열린다.
    dropZone.addEventListener('click', (e) => { if (e.target !== fileInput) fileInput.click(); });
    fileInput.addEventListener('change', (e) => { pick(e.target.files); fileInput.value = ''; });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        pick(e.dataTransfer.files);
    });
    cancelBtn.addEventListener('click', () => {
        stoppedId = runId;
        runId++;
        cancelBtn.classList.add('hidden');
    });
    clearBtn.addEventListener('click', () => {
        runId++;
        showNotice('');
        resultsEl.innerHTML = '';
        overallEl.classList.add('hidden');
        reportBtn.classList.add('hidden');
        cancelBtn.classList.add('hidden');
        clearBtn.classList.add('hidden');
    });
    reportBtn.addEventListener('click', () => {
        saveAs(new Blob([reportParts.join('\n\n')], { type: 'text/plain;charset=utf-8' }), 'pdf_check_report.txt');
    });
})();
