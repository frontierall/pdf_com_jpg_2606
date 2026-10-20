// ==================== PDF 깨진 쪽 탐지 ====================
// 이미지 데이터가 손상되면 세로 줄무늬가 생긴다. 모든 쪽을 낮은 해상도로 그려
// '가로 방향 변화 / 세로 방향 변화' 비율이 비정상적으로 큰 쪽을 찾는다.
// (온편지 76·77호로 시험: 깨진 쪽 10 이상, 정상 쪽 1.5 이하)
const INTEGRITY_SCALE = 20 / 72;     // 20dpi
const INTEGRITY_RATIO_LIMIT = 5;
const INTEGRITY_EDGE_MIN = 5;        // 가로 변화가 이보다 작은 단색에 가까운 쪽은 제외

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
    let sum = 0, sq = 0;
    for (let i = 0; i < w * h; i++) { sum += gray[i]; sq += gray[i] * gray[i]; }
    const mean = sum / (w * h);
    const std = Math.sqrt(Math.max(0, sq / (w * h) - mean * mean));
    return { hd, ratio: hd / (vd + 0.3), mean, std };
}

// {suspects:[{page, ratio, error}], blanks:[쪽번호]} 반환. isCancelled()가 true가 되면 null 반환
// blanks: 통째로 흰 쪽(내용 없음). 의도된 빈 쪽일 수 있어 '참고'로만 알린다.
async function checkBrokenPages(pdfDoc, onProgress, isCancelled) {
    const suspects = [];
    const blanks = [];
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
            const { hd, ratio, mean, std } = stripeScore(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (ratio > INTEGRITY_RATIO_LIMIT && hd > INTEGRITY_EDGE_MIN) suspects.push({ page: n, ratio });
            else if (std < 1.5 && mean > 250) blanks.push(n);
            page.cleanup();
        } catch (error) {
            console.error(`${n}쪽 렌더링 실패:`, error);
            suspects.push({ page: n, error: true });
        }
        onProgress(n, pdfDoc.numPages);
    }
    return { suspects, blanks };
}

// 저해상도 이미지 점검: 쪽에 그려지는 이미지의 실제 배치 크기(CTM)로 dpi를 계산한다. 느려서 옵션으로만 돌린다.
const LOWRES_DPI = 100;
async function findLowResPages(pdfDoc, onProgress, isCancelled) {
    const OPS = pdfjsLib.OPS;
    const found = [];
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
                } else if (fn === OPS.paintImageXObject) {
                    const widthPt = Math.hypot(ctm[0], ctm[1]);
                    if (widthPt < 50) continue; // 작은 장식 이미지는 제외
                    const store = args[0].startsWith('g_') ? page.commonObjs : page.objs;
                    const img = await new Promise(res => store.get(args[0], res));
                    if (img && img.width) minDpi = Math.min(minDpi, img.width / (widthPt / 72));
                }
            }
            if (minDpi < LOWRES_DPI) found.push({ page: n, dpi: Math.round(minDpi) });
            page.cleanup();
        } catch (error) {
            console.error(`${n}쪽 이미지 해상도 점검 실패:`, error);
        }
        onProgress(n, pdfDoc.numPages);
    }
    return found;
}

// ==================== PDF 점검 탭 ====================
// PDF를 여러 개 올리면 파일별로 깨진 쪽·빈 쪽·(선택)저해상도 이미지·쪽수·용량·쪽 크기·암호화를 점검하고,
// 의심 쪽은 크게 볼 수 있으며 결과 전체를 텍스트로 저장할 수 있다.
(function () {
    const dropZone = document.getElementById('checkDropZone');
    if (!dropZone) return;
    const fileInput = document.getElementById('checkFileInput');
    const selectBtn = document.getElementById('checkSelectFileBtn');
    const lowResOpt = document.getElementById('checkLowResOpt');
    const clearBtn = document.getElementById('checkClearBtn');
    const resultsEl = document.getElementById('checkResults');
    const overallEl = document.getElementById('checkOverall');
    const reportBtn = document.getElementById('checkReportBtn');
    const modal = document.getElementById('checkModal');
    const modalCanvas = document.getElementById('checkModalCanvas');
    const modalTitle = document.getElementById('checkModalTitle');

    let runId = 0;
    let reportParts = [];

    function sizeText(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

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

    async function checkFile(file, id) {
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
        const result = { name: file.name, size: file.size, pages: 0, bad: [], blanks: [], lowres: null, error: false };

        let doc;
        try {
            doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        } catch (error) {
            console.error('PDF 열기 실패:', error);
            bar.remove();
            section.classList.add('warn');
            statusEl.textContent = 'PDF 파일을 열 수 없습니다. 파일 자체가 손상되었거나 PDF가 아닐 수 있습니다.';
            result.error = true;
            reportParts.push(`[PDF 점검 결과] ${file.name}\n- 파일을 열 수 없음`);
            return result;
        }
        if (id !== runId) return null;
        result.pages = doc.numPages;

        const sizes = new Map();
        for (let n = 1; n <= doc.numPages; n++) {
            const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
            const key = `${Math.round(vp.width)}x${Math.round(vp.height)}`;
            if (!sizes.has(key)) sizes.set(key, []);
            sizes.get(key).push(n);
        }
        let main = '';
        sizes.forEach((pages, key) => { if (!main || pages.length > sizes.get(main).length) main = key; });
        const oddPages = [];
        sizes.forEach((pages, key) => { if (key !== main) oddPages.push(...pages); });
        oddPages.sort((a, b) => a - b);

        let info = {};
        try { info = (await doc.getMetadata()).info || {}; } catch (e) { /* 메타데이터 없음 */ }

        const wantLowRes = lowResOpt.checked;
        const res = await checkBrokenPages(doc, (n, total) => {
            const pct = Math.round(n / total * (wantLowRes ? 50 : 100));
            fill.style.width = pct + '%';
            statusEl.textContent = `깨진 쪽이 있는지 점검 중... ${pct}%`;
        }, () => id !== runId);
        if (res === null || id !== runId) return null;
        result.bad = res.suspects;
        result.blanks = res.blanks;

        if (wantLowRes) {
            result.lowres = await findLowResPages(doc, (n, total) => {
                const pct = 50 + Math.round(n / total * 50);
                fill.style.width = pct + '%';
                statusEl.textContent = `이미지 해상도 점검 중... ${pct}%`;
            }, () => id !== runId);
            if (result.lowres === null || id !== runId) return null;
        }
        bar.remove();

        const rows = [
            ['파일 크기', sizeText(file.size)],
            ['총 쪽수', `${doc.numPages}쪽`],
            ['쪽 크기', sizes.size === 1 ? `모두 동일 (${main} pt)` : `${sizes.size}종류 (대부분 ${main} pt, 다른 쪽: ${oddPages.join(', ')})`],
            ['PDF 버전', info.PDFFormatVersion || '-'],
            ['생성 프로그램', info.Creator || '-'],
            ['암호화', info.IsEncrypted ? '예' : '아니오'],
            ['깨진 쪽 의심', result.bad.length ? `${result.bad.length}쪽 (${result.bad.map(s => s.page).join(', ')})` : '없음'],
            ['빈 쪽 (참고)', result.blanks.length ? `${result.blanks.length}쪽 (${result.blanks.join(', ')}) — 의도된 빈 쪽인지 확인` : '없음'],
        ];
        if (result.lowres) rows.push([`저해상도 이미지 (참고, ${LOWRES_DPI}dpi 미만)`, lowResText(result.lowres, doc.numPages)]);
        else rows.push(['저해상도 이미지', '점검 안 함 (옵션을 켜면 점검)']);
        body.innerHTML = rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('');

        const bad = result.bad.length > 0;
        section.classList.add(bad ? 'warn' : 'ok');
        statusEl.textContent = bad
            ? `깨진 것으로 의심되는 쪽이 ${result.bad.length}개 있습니다: ${result.bad.map(s => s.page + '쪽').join(', ')}`
            : '줄무늬 형태로 깨진 쪽은 발견되지 않았습니다.';

        for (const s of result.bad) {
            const item = document.createElement('div');
            item.className = 'integrity-item';
            if (!s.error) {
                const page = await doc.getPage(s.page);
                const vp = page.getViewport({ scale: 0.4 });
                const c = document.createElement('canvas');
                c.width = vp.width; c.height = vp.height;
                await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
                const img = document.createElement('img');
                img.src = c.toDataURL('image/jpeg', 0.7);
                img.title = '클릭하면 크게 봅니다';
                img.addEventListener('click', () => openModal(doc, s.page, file.name));
                item.appendChild(img);
            }
            const label = document.createElement('div');
            label.textContent = s.error ? `${s.page}쪽 (렌더링 실패)` : `${s.page}쪽 (비율 ${s.ratio.toFixed(1)})`;
            item.appendChild(label);
            list.appendChild(item);
        }

        reportParts.push([`[PDF 점검 결과] ${file.name}`, ...rows.map(r => `- ${r[0]}: ${r[1]}`)].join('\n'));
        return result;
    }

    function buildOverall(results) {
        if (results.length < 2) { overallEl.classList.add('hidden'); return ''; }
        const head = '<tr><th>파일</th><th>쪽수</th><th>용량</th><th>깨진 쪽</th><th>빈 쪽</th></tr>';
        const rows = results.map(r => `<tr><td>${esc(r.name)}</td><td>${r.pages}</td><td>${sizeText(r.size)}</td>
            <td class="${r.error || r.bad.length ? 'bad-cell' : ''}">${r.error ? '열기 실패' : r.bad.length ? r.bad.map(s => s.page).join(', ') : '없음'}</td>
            <td>${r.blanks.length ? r.blanks.join(', ') : '없음'}</td></tr>`).join('');
        overallEl.innerHTML = `<h3>전체 비교</h3><table class="metadata-table"><tbody>${head}${rows}</tbody></table>`;
        overallEl.classList.remove('hidden');
        return ['[전체 비교]', ...results.map(r => `- ${r.name}: ${r.error ? '열기 실패' : `${r.pages}쪽, ${sizeText(r.size)}, 깨진 쪽 ${r.bad.length ? r.bad.map(s => s.page).join(',') : '없음'}`}`)].join('\n');
    }

    async function run(files) {
        const id = ++runId;
        resultsEl.innerHTML = '';
        overallEl.classList.add('hidden');
        reportBtn.classList.add('hidden');
        clearBtn.classList.remove('hidden');
        reportParts = [];
        const results = [];
        for (const file of files) {
            const r = await checkFile(file, id);
            if (id !== runId) return;
            if (r) results.push(r);
        }
        const overall = buildOverall(results);
        if (overall) reportParts.unshift(overall);
        reportParts.push('※ 세로 줄무늬 형태의 이미지 손상만 탐지합니다. 오타·글자 오류는 점검하지 않습니다.');
        reportBtn.classList.remove('hidden');
    }

    function pick(fileList) {
        const files = [...fileList].filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
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
    clearBtn.addEventListener('click', () => {
        runId++;
        resultsEl.innerHTML = '';
        overallEl.classList.add('hidden');
        reportBtn.classList.add('hidden');
        clearBtn.classList.add('hidden');
    });
    reportBtn.addEventListener('click', () => {
        saveAs(new Blob([reportParts.join('\n\n')], { type: 'text/plain;charset=utf-8' }), 'pdf_check_report.txt');
    });
})();
