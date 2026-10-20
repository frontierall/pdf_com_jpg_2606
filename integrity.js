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
    return { hd, ratio: hd / (vd + 0.3) };
}

// 의심 쪽 목록 [{page, ratio, error}] 반환. isCancelled()가 true가 되면 null 반환
async function checkBrokenPages(pdfDoc, onProgress, isCancelled) {
    const suspects = [];
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
            const { hd, ratio } = stripeScore(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (ratio > INTEGRITY_RATIO_LIMIT && hd > INTEGRITY_EDGE_MIN) suspects.push({ page: n, ratio });
            page.cleanup();
        } catch (error) {
            console.error(`${n}쪽 렌더링 실패:`, error);
            suspects.push({ page: n, error: true });
        }
        onProgress(n, pdfDoc.numPages);
    }
    return suspects;
}

// ==================== PDF 점검 탭 ====================
// PDF를 올리면 깨진 쪽, 쪽수, 용량, 쪽 크기 불일치, 암호화 여부를 점검하고 결과를 텍스트로 저장할 수 있다.
(function () {
    const dropZone = document.getElementById('checkDropZone');
    if (!dropZone) return;
    const fileInput = document.getElementById('checkFileInput');
    const selectBtn = document.getElementById('checkSelectFileBtn');
    const fileInfo = document.getElementById('checkFileInfo');
    const fileNameEl = document.getElementById('checkFileName');
    const removeBtn = document.getElementById('checkRemoveFileBtn');
    const panel = document.getElementById('checkPanel');
    const statusEl = document.getElementById('checkStatus');
    const progress = document.getElementById('checkProgress');
    const progressFill = document.getElementById('checkProgressFill');
    const summaryBody = document.getElementById('checkSummaryBody');
    const listEl = document.getElementById('checkList');
    const reportBtn = document.getElementById('checkReportBtn');

    let runId = 0;
    let report = '';

    function sizeText(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    function reset() {
        runId++;
        dropZone.classList.remove('hidden');
        fileInfo.classList.add('hidden');
        panel.classList.add('hidden');
        fileInput.value = '';
    }

    async function run(file) {
        const id = ++runId;
        fileNameEl.textContent = file.name;
        dropZone.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        panel.classList.remove('hidden');
        panel.className = 'integrity-check';
        listEl.innerHTML = '';
        summaryBody.innerHTML = '';
        reportBtn.classList.add('hidden');
        progress.classList.remove('hidden');
        progressFill.style.width = '0%';
        statusEl.textContent = 'PDF를 여는 중...';

        let doc;
        try {
            doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        } catch (error) {
            console.error('PDF 열기 실패:', error);
            progress.classList.add('hidden');
            panel.classList.add('warn');
            statusEl.textContent = 'PDF 파일을 열 수 없습니다. 파일 자체가 손상되었거나 PDF가 아닐 수 있습니다.';
            report = `[PDF 점검] ${file.name}\n파일을 열 수 없음`;
            return;
        }
        if (id !== runId) return;

        // 쪽 크기 불일치 검사 (첫 쪽 기준)
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

        const suspects = await checkBrokenPages(doc, (n, total) => {
            const pct = Math.round(n / total * 100);
            progressFill.style.width = pct + '%';
            statusEl.textContent = `깨진 쪽이 있는지 점검 중... ${pct}%`;
        }, () => id !== runId);
        if (suspects === null || id !== runId) return;

        progress.classList.add('hidden');
        const rows = [
            ['파일 크기', sizeText(file.size)],
            ['총 쪽수', `${doc.numPages}쪽`],
            ['쪽 크기', sizes.size === 1 ? `모두 동일 (${main} pt)` : `${sizes.size}종류 (대부분 ${main} pt, 다른 쪽: ${oddPages.join(', ')})`],
            ['PDF 버전', info.PDFFormatVersion || '-'],
            ['생성 프로그램', info.Creator || '-'],
            ['암호화', info.IsEncrypted ? '예' : '아니오'],
            ['깨진 쪽 의심', suspects.length ? `${suspects.length}쪽` : '없음'],
        ];
        summaryBody.innerHTML = rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('');

        const bad = suspects.length > 0;
        panel.classList.add(bad ? 'warn' : 'ok');
        statusEl.textContent = bad
            ? `깨진 것으로 의심되는 쪽이 ${suspects.length}개 있습니다: ${suspects.map(s => s.page + '쪽').join(', ')}`
            : '줄무늬 형태로 깨진 쪽은 발견되지 않았습니다.';

        // 의심 쪽 썸네일
        for (const s of suspects) {
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
                item.appendChild(img);
            }
            const label = document.createElement('div');
            label.textContent = s.error ? `${s.page}쪽 (렌더링 실패)` : `${s.page}쪽 (비율 ${s.ratio.toFixed(1)})`;
            item.appendChild(label);
            listEl.appendChild(item);
        }

        report = [`[PDF 점검 결과] ${file.name}`, ...rows.map(r => `- ${r[0]}: ${r[1]}`),
            bad ? '- 의심 쪽 상세: ' + suspects.map(s => s.error ? `${s.page}쪽(렌더링 실패)` : `${s.page}쪽(비율 ${s.ratio.toFixed(1)})`).join(', ') : '',
            '', '※ 세로 줄무늬 형태의 이미지 손상만 탐지합니다. 오타·글자 오류는 점검하지 않습니다.'].filter(l => l !== '').join('\n');
        reportBtn.classList.remove('hidden');
    }

    function pick(file) {
        if (file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) run(file);
    }
    selectBtn.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => { if (e.target === dropZone) fileInput.click(); });
    fileInput.addEventListener('change', (e) => pick(e.target.files[0]));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        pick(e.dataTransfer.files[0]);
    });
    removeBtn.addEventListener('click', reset);
    reportBtn.addEventListener('click', () => {
        saveAs(new Blob([report], { type: 'text/plain;charset=utf-8' }), 'pdf_check_report.txt');
    });
})();
